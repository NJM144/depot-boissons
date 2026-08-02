-- ============================================================================
--  DÉPÔT BOISSONS — MIGRATION 16 : CHARGES RÉELLES DU DÉPÔT + CHARGE RÉSIDUELLE
-- ----------------------------------------------------------------------------
--  MODÈLE :
--   - Le patron saisit désormais les VRAIES charges mensuelles du dépôt
--     (loyer, salaire employé, courant/eau, divers...) dans `charges_depot`.
--   - Les actionnaires "normaux" gardent une charge FIXE saisie manuellement
--     dans `charges_actionnaire` (comme avant).
--   - UN SEUL actionnaire (marqué `charge_residuelle = true`, typiquement
--     Morel/le patron) supporte tout le RESTE :
--       charge(Morel, mois) = Σ charges_depot(mois) − Σ charges des autres
--                              actionnaires (mois)
--  Reprend intégralement la logique "produits réservés" de la migration 11
--  (get_compte_actionnaire / get_benefices_actionnaires) — seule la manière
--  de calculer `charges` change pour l'actionnaire résiduel.
--  Idempotent.
-- ============================================================================

-- 1) Table des charges réelles du dépôt (loyer, salaire, courant/eau, divers...)
create table if not exists public.charges_depot (
  id          uuid primary key default gen_random_uuid(),
  depot_id    uuid not null references public.depots (id) on delete cascade,
  libelle     text not null,
  montant     numeric not null default 0,
  mois        date not null,              -- 1er jour du mois concerné
  created_at  timestamptz not null default now()
);
create index if not exists idx_charges_depot on public.charges_depot (depot_id, mois);

alter table public.charges_depot enable row level security;

drop policy if exists charges_depot_proprio_all on public.charges_depot;
create policy charges_depot_proprio_all on public.charges_depot
  for all using (public.owns_depot(depot_id))
  with check (public.owns_depot(depot_id));

-- 2) Marqueur "charge résiduelle" sur l'actionnaire qui absorbe le reste -------
alter table public.actionnaires
  add column if not exists charge_residuelle boolean not null default false;

-- 3) get_compte_actionnaire (reprend la logique 0011, charges différentes) ----
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
    'benefice_net', round(v_brut - v_charges, 2)
  );
end;
$$;

grant execute on function public.get_compte_actionnaire(text, date) to anon, authenticated;

-- 4) get_benefices_actionnaires (vue patron, reprend 0011 + charge résiduelle)
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
                      end), 2)
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

-- 5) Marque Morel comme actionnaire résiduel (supporte tout le reste des charges)
update public.actionnaires set charge_residuelle = true where trim(nom) ilike 'morel';
