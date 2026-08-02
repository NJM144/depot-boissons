-- ============================================================================
--  DÉPÔT BOISSONS — MIGRATION 17 : AMORTISSEMENTS (ÉPARGNE PAR ACTIONNAIRE)
-- ----------------------------------------------------------------------------
--  BESOIN : le dépôt a acheté un tricycle. On met de côté 5000 XOF/jour pour
--  son amortissement, sur un compte qu'on ne touche pas.
--
--  MODÈLE :
--   - `amortissements` : ligne définie par le patron (libellé, montant/jour,
--     date de début, actif). Ex: "Tricycle" 5000 XOF/jour depuis le 02/07/2026.
--   - Chaque actionnaire reçoit sa PART proportionnelle de ce montant/jour
--     (part = apport / fonds de commerce, comme pour la marge).
--   - Cette part est DÉDUITE du bénéfice net distribuable (elle ne part pas
--     en charge perdue : elle s'accumule dans une épargne PROPRE à chaque
--     actionnaire, qu'il ne doit pas retirer).
--   - `reserve_mois`     = sa part du montant mis de côté CE mois-ci.
--   - `reserve_cumulee`  = sa part accumulée depuis le début de l'amortissement.
--   - benefice_net = benefice_brut − charges − reserve_mois
--  Idempotent.
-- ============================================================================

-- 1) Table des lignes d'amortissement (définies par le patron) ----------------
create table if not exists public.amortissements (
  id            uuid primary key default gen_random_uuid(),
  depot_id      uuid not null references public.depots (id) on delete cascade,
  libelle       text not null,
  montant_jour  numeric not null default 0,
  date_debut    date not null default current_date,
  actif         boolean not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists idx_amortissements_depot on public.amortissements (depot_id);

alter table public.amortissements enable row level security;
drop policy if exists amortissements_proprio_all on public.amortissements;
create policy amortissements_proprio_all on public.amortissements
  for all using (public.owns_depot(depot_id))
  with check (public.owns_depot(depot_id));

-- 2) get_compte_actionnaire : ajoute reserve_mois / reserve_cumulee -----------
create or replace function public.get_compte_actionnaire(p_code text, p_mois date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  a record;
  v_fond numeric;
  v_debut timestamptz; v_fin timestamptz; v_mois_date date;
  v_part numeric;
  v_marge_tot numeric; v_casse_tot numeric;
  v_marge_res_all numeric; v_casse_res_all numeric;
  v_marge_nette_gen numeric;
  v_marge_res_moi numeric; v_casse_res_moi numeric; v_benef_res numeric;
  v_part_brut numeric; v_brut numeric;
  v_charges numeric; v_detail jsonb; v_produits jsonb;
  v_charges_depot_total numeric;
  v_borne_sup timestamptz;
  v_reserve_mois numeric; v_reserve_cumulee numeric; v_reserve_detail jsonb;
begin
  select * into a from public.actionnaires
   where code = p_code and actif = true limit 1;
  if not found then
    return jsonb_build_object('trouve', false);
  end if;

  select fond_de_commerce into v_fond from public.depots where id = a.depot_id;
  v_part := case when coalesce(v_fond, 0) > 0 then a.apport / v_fond else 0 end;

  v_debut := date_trunc('month', coalesce(p_mois, current_date)::timestamptz);
  v_fin   := v_debut + interval '1 month';
  v_mois_date := v_debut::date;

  v_marge_tot := coalesce((select sum(marge) from public.mouvements
      where depot_id = a.depot_id and type = 'sortie' and statut = 'valide'
        and created_at >= v_debut and created_at < v_fin), 0);
  v_casse_tot := coalesce((select sum(cout_total) from public.casses
      where depot_id = a.depot_id and statut = 'valide'
        and created_at >= v_debut and created_at < v_fin), 0);

  v_marge_res_all := coalesce((select sum(m.marge) from public.mouvements m
      join public.boissons b on b.id = m.boisson_id
      where m.depot_id = a.depot_id and m.type = 'sortie' and m.statut = 'valide'
        and b.actionnaire_reserve_id is not null
        and m.created_at >= v_debut and m.created_at < v_fin), 0);
  v_casse_res_all := coalesce((select sum(c.cout_total) from public.casses c
      join public.boissons b on b.id = c.boisson_id
      where c.depot_id = a.depot_id and c.statut = 'valide'
        and b.actionnaire_reserve_id is not null
        and c.created_at >= v_debut and c.created_at < v_fin), 0);

  v_marge_nette_gen := (v_marge_tot - v_marge_res_all) - (v_casse_tot - v_casse_res_all);

  v_marge_res_moi := coalesce((select sum(m.marge) from public.mouvements m
      join public.boissons b on b.id = m.boisson_id
      where m.depot_id = a.depot_id and m.type = 'sortie' and m.statut = 'valide'
        and b.actionnaire_reserve_id = a.id
        and m.created_at >= v_debut and m.created_at < v_fin), 0);
  v_casse_res_moi := coalesce((select sum(c.cout_total) from public.casses c
      join public.boissons b on b.id = c.boisson_id
      where c.depot_id = a.depot_id and c.statut = 'valide'
        and b.actionnaire_reserve_id = a.id
        and c.created_at >= v_debut and c.created_at < v_fin), 0);
  v_benef_res := v_marge_res_moi - v_casse_res_moi;

  v_part_brut := v_part * v_marge_nette_gen;
  v_brut := v_part_brut + v_benef_res;

  v_produits := coalesce((select jsonb_agg(b.nom order by b.nom)
      from public.boissons b
      where b.depot_id = a.depot_id and b.actionnaire_reserve_id = a.id and b.actif), '[]'::jsonb);

  if a.charge_residuelle then
    v_charges_depot_total := coalesce((select sum(montant) from public.charges_depot
        where depot_id = a.depot_id and mois = v_mois_date), 0);
    v_charges := v_charges_depot_total - coalesce((
        select sum(ca.montant) from public.charges_actionnaire ca
        join public.actionnaires au on au.id = ca.actionnaire_id
        where au.depot_id = a.depot_id and au.id <> a.id and ca.mois = v_mois_date), 0);
    v_detail := jsonb_build_array(jsonb_build_object(
      'libelle', 'Reste des charges réelles du dépôt (loyer, salaire, courant/eau...)', 'montant', v_charges));
  else
    v_charges := coalesce((select sum(montant) from public.charges_actionnaire
        where actionnaire_id = a.id and mois = v_mois_date), 0);
    v_detail := coalesce((select jsonb_agg(jsonb_build_object('libelle', libelle, 'montant', montant) order by created_at)
        from public.charges_actionnaire
        where actionnaire_id = a.id and mois = v_mois_date), '[]'::jsonb);
  end if;

  -- Amortissements : part de l'actionnaire, ce mois-ci et cumulée depuis le début
  v_borne_sup := least(v_fin, now() + interval '1 day');
  select
    coalesce(sum(am.montant_jour * greatest(0, extract(day from
      (v_borne_sup - greatest(v_debut, am.date_debut::timestamptz))))), 0) * v_part,
    coalesce(sum(am.montant_jour * greatest(0, extract(day from
      (v_borne_sup - am.date_debut::timestamptz)))), 0) * v_part,
    coalesce(jsonb_agg(jsonb_build_object('libelle', am.libelle, 'montant_jour', am.montant_jour,
        'part_jour', round(am.montant_jour * v_part, 2), 'date_debut', am.date_debut) order by am.created_at)
      filter (where am.id is not null), '[]'::jsonb)
  into v_reserve_mois, v_reserve_cumulee, v_reserve_detail
  from public.amortissements am
  where am.depot_id = a.depot_id and am.actif and am.date_debut::timestamptz < v_borne_sup;

  return jsonb_build_object(
    'trouve', true,
    'nom', a.nom,
    'apport', a.apport,
    'fond_de_commerce', coalesce(v_fond, 0),
    'part', v_part,
    'part_pct', round(v_part * 100, 2),
    'mois', to_char(v_debut, 'YYYY-MM'),
    'marge_commerce', v_marge_nette_gen,
    'benefice_part', round(v_part_brut, 2),
    'benefice_reserve', round(v_benef_res, 2),
    'produits_reserves', v_produits,
    'benefice_brut', round(v_brut, 2),
    'charges', v_charges,
    'charges_detail', v_detail,
    'reserve_mois', round(coalesce(v_reserve_mois, 0), 2),
    'reserve_cumulee', round(coalesce(v_reserve_cumulee, 0), 2),
    'reserve_detail', coalesce(v_reserve_detail, '[]'::jsonb),
    'benefice_net', round(v_brut - v_charges - coalesce(v_reserve_mois, 0), 2)
  );
end;
$$;

grant execute on function public.get_compte_actionnaire(text, date) to anon, authenticated;

-- 3) get_benefices_actionnaires : idem côté patron (vue de tous d'un coup) ----
create or replace function public.get_benefices_actionnaires(p_depot_id uuid, p_mois date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_fond numeric; v_debut timestamptz; v_fin timestamptz; v_mois_date date;
  v_marge_tot numeric; v_casse_tot numeric;
  v_marge_res_all numeric; v_casse_res_all numeric;
  v_marge_nette_gen numeric;
  v_total_parts numeric; v_lignes jsonb;
  v_charges_depot_total numeric;
  v_borne_sup timestamptz;
begin
  if not public.owns_depot(p_depot_id) then
    raise exception 'Accès refusé';
  end if;

  select fond_de_commerce into v_fond from public.depots where id = p_depot_id;
  v_debut := date_trunc('month', coalesce(p_mois, current_date)::timestamptz);
  v_fin   := v_debut + interval '1 month';
  v_mois_date := v_debut::date;
  v_borne_sup := least(v_fin, now() + interval '1 day');

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
           'reserve_mois', round(coalesce(am.reserve_mois, 0) * (case when coalesce(v_fond,0) > 0 then a.apport / v_fond else 0 end), 2),
           'reserve_cumulee', round(coalesce(am.reserve_cumulee, 0) * (case when coalesce(v_fond,0) > 0 then a.apport / v_fond else 0 end), 2),
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
                      end)
                    - coalesce(am.reserve_mois, 0) * (case when coalesce(v_fond,0) > 0 then a.apport / v_fond else 0 end), 2)
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
  left join (
    select
      sum(montant_jour * greatest(0, extract(day from (v_borne_sup - greatest(v_debut, date_debut::timestamptz))))) as reserve_mois,
      sum(montant_jour * greatest(0, extract(day from (v_borne_sup - date_debut::timestamptz)))) as reserve_cumulee
    from public.amortissements
    where depot_id = p_depot_id and actif and date_debut::timestamptz < v_borne_sup
  ) am on true
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
