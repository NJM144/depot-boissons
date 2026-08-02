-- ============================================================================
--  DÉPÔT BOISSONS — MIGRATION 21 : VERSEMENT DU BÉNÉFICE À L'ACTIONNAIRE
-- ----------------------------------------------------------------------------
--  BESOIN : le patron veut pouvoir signifier, pour un actionnaire donné et un
--  mois donné, qu'il lui a effectivement remis son bénéfice net en main
--  propre (l'app ne fait QUE calculer le bénéfice, elle ne gère pas d'argent
--  réel — ceci est un simple marqueur "payé / pas payé" avec traçabilité).
--  Une ligne = "versé" ; son absence = "pas encore versé". Unique par
--  (actionnaire, mois) : on ne peut marquer qu'un seul versement par mois.
--  Idempotent.
-- ============================================================================

create table if not exists public.versements_actionnaire (
  id              uuid primary key default gen_random_uuid(),
  depot_id        uuid not null references public.depots (id) on delete cascade,
  actionnaire_id  uuid not null references public.actionnaires (id) on delete cascade,
  mois            date not null,
  montant         numeric not null default 0,
  date_versement  timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  unique (actionnaire_id, mois)
);
create index if not exists idx_versements_actionnaire_depot on public.versements_actionnaire (depot_id, mois);

alter table public.versements_actionnaire enable row level security;
drop policy if exists versements_actionnaire_proprio_all on public.versements_actionnaire;
create policy versements_actionnaire_proprio_all on public.versements_actionnaire
  for all using (public.owns_depot(depot_id))
  with check (public.owns_depot(depot_id));

-- get_benefices_actionnaires (vue patron) : ajoute verse / montant_verse / date_versement
create or replace function public.get_benefices_actionnaires(p_depot_id uuid, p_mois date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_fond numeric; v_debut timestamptz; v_fin timestamptz; v_mois_date date;
  v_marge_tot numeric; v_casse_tot numeric;
  v_marge_res_all numeric; v_casse_res_all numeric;
  v_marge_nette_gen numeric;
  v_total_parts numeric; v_lignes jsonb;
  v_charges_depot_total numeric;
begin
  if not public.owns_depot(p_depot_id) then
    raise exception 'Accès refusé';
  end if;

  select fond_de_commerce into v_fond from public.depots where id = p_depot_id;
  v_debut := date_trunc('month', coalesce(p_mois, current_date)::timestamptz);
  v_fin   := v_debut + interval '1 month';
  v_mois_date := v_debut::date;

  v_marge_tot := coalesce((select sum(marge) from public.mouvements
      where depot_id = p_depot_id and type = 'sortie' and statut = 'valide'
        and created_at >= v_debut and created_at < v_fin), 0);
  v_casse_tot := coalesce((select sum(cout_total) from public.casses
      where depot_id = p_depot_id and statut = 'valide'
        and created_at >= v_debut and created_at < v_fin), 0);
  v_marge_res_all := coalesce((select sum(m.marge) from public.mouvements m
      join public.boissons b on b.id = m.boisson_id
      where m.depot_id = p_depot_id and m.type = 'sortie' and m.statut = 'valide'
        and b.actionnaire_reserve_id is not null
        and m.created_at >= v_debut and m.created_at < v_fin), 0);
  v_casse_res_all := coalesce((select sum(c.cout_total) from public.casses c
      join public.boissons b on b.id = c.boisson_id
      where c.depot_id = p_depot_id and c.statut = 'valide'
        and b.actionnaire_reserve_id is not null
        and c.created_at >= v_debut and c.created_at < v_fin), 0);
  v_marge_nette_gen := (v_marge_tot - v_marge_res_all) - (v_casse_tot - v_casse_res_all);

  v_charges_depot_total := coalesce((select sum(montant) from public.charges_depot
      where depot_id = p_depot_id and mois = v_mois_date), 0);

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', a.id, 'nom', a.nom, 'apport', a.apport, 'code', a.code, 'actif', a.actif,
           'charge_residuelle', a.charge_residuelle,
           'part_pct', round(case when coalesce(v_fond,0) > 0 then a.apport / v_fond * 100 else 0 end, 2),
           'benefice_part', round(case when coalesce(v_fond,0) > 0 then a.apport / v_fond * v_marge_nette_gen else 0 end, 2),
           'benefice_reserve', round(coalesce(rm.marge, 0) - coalesce(rc.casse, 0), 2),
           'produits_reserves', coalesce(rp.produits, '[]'::jsonb),
           'benefice_brut', round((case when coalesce(v_fond,0) > 0 then a.apport / v_fond * v_marge_nette_gen else 0 end)
                                  + (coalesce(rm.marge, 0) - coalesce(rc.casse, 0)), 2),
           'charges',
             case when a.charge_residuelle then
               v_charges_depot_total - coalesce((
                 select sum(ca2.montant) from public.charges_actionnaire ca2
                 join public.actionnaires au2 on au2.id = ca2.actionnaire_id
                 where au2.depot_id = p_depot_id and au2.id <> a.id and ca2.mois = v_mois_date
               ), 0)
             else coalesce(c.somme, 0)
             end,
           'benefice_net',
             round((case when coalesce(v_fond,0) > 0 then a.apport / v_fond * v_marge_nette_gen else 0 end)
                    + (coalesce(rm.marge, 0) - coalesce(rc.casse, 0))
                    - (case when a.charge_residuelle then
                        v_charges_depot_total - coalesce((
                          select sum(ca3.montant) from public.charges_actionnaire ca3
                          join public.actionnaires au3 on au3.id = ca3.actionnaire_id
                          where au3.depot_id = p_depot_id and au3.id <> a.id and ca3.mois = v_mois_date
                        ), 0)
                      else coalesce(c.somme, 0)
                      end), 2),
           'verse', v.id is not null,
           'montant_verse', v.montant,
           'date_versement', v.date_versement
         ) order by a.created_at), '[]'::jsonb),
         coalesce(sum(a.apport), 0)
    into v_lignes, v_total_parts
  from public.actionnaires a
  left join (
    select actionnaire_id, sum(montant) somme from public.charges_actionnaire
    where mois = v_mois_date group by actionnaire_id
  ) c on c.actionnaire_id = a.id
  left join (
    select b.actionnaire_reserve_id as aid, sum(m.marge) as marge
    from public.boissons b
    join public.mouvements m on m.boisson_id = b.id
    where b.depot_id = p_depot_id and b.actionnaire_reserve_id is not null
      and m.type = 'sortie' and m.statut = 'valide'
      and m.created_at >= v_debut and m.created_at < v_fin
    group by b.actionnaire_reserve_id
  ) rm on rm.aid = a.id
  left join (
    select b.actionnaire_reserve_id as aid, sum(c2.cout_total) as casse
    from public.boissons b
    join public.casses c2 on c2.boisson_id = b.id
    where b.depot_id = p_depot_id and b.actionnaire_reserve_id is not null
      and c2.statut = 'valide'
      and c2.created_at >= v_debut and c2.created_at < v_fin
    group by b.actionnaire_reserve_id
  ) rc on rc.aid = a.id
  left join (
    select actionnaire_reserve_id as aid, jsonb_agg(nom order by nom) as produits
    from public.boissons
    where depot_id = p_depot_id and actionnaire_reserve_id is not null and actif
    group by actionnaire_reserve_id
  ) rp on rp.aid = a.id
  left join public.versements_actionnaire v
    on v.actionnaire_id = a.id and v.mois = v_mois_date
  where a.depot_id = p_depot_id;

  return jsonb_build_object(
    'mois', to_char(v_debut, 'YYYY-MM'),
    'fond_de_commerce', coalesce(v_fond, 0),
    'marge_commerce', v_marge_nette_gen,
    'marge_reservee', round(v_marge_res_all - v_casse_res_all, 2),
    'marge_totale', round((v_marge_tot - v_casse_tot), 2),
    'charges_depot_total', v_charges_depot_total,
    'total_apports', v_total_parts,
    'part_actionnaires_pct', round(case when coalesce(v_fond,0) > 0 then v_total_parts / v_fond * 100 else 0 end, 2),
    'actionnaires', v_lignes
  );
end;
$$;

grant execute on function public.get_benefices_actionnaires(uuid, date) to authenticated;
