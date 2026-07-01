-- ============================================================================
--  DÉPÔT BOISSONS — MIGRATION 11 : PRODUITS RÉSERVÉS À UN ACTIONNAIRE
-- ----------------------------------------------------------------------------
--  BESOIN :
--   Certains produits doivent profiter À UN SEUL actionnaire. Exemple :
--   les « Cody's » (energi / blanc / bleu) → bénéfice 100 % pour Morel.
--
--  MODÈLE :
--   - Une boisson peut être RÉSERVÉE à un actionnaire (boissons.actionnaire_reserve_id).
--   - La marge nette de ses ventes (marge des ventes − coût des casses) est
--     RETIRÉE du pot commun réparti par parts et attribuée à 100 % à cet
--     actionnaire (en plus de sa part normale sur le reste).
--   - Les produits NON réservés continuent d'alimenter le pot général :
--        benefice_part = part × marge_nette_GÉNÉRALE
--        benefice_brut = benefice_part + benefice_reserve(de cet actionnaire)
--   - Conservation : Σ(benefice_brut) + part_patron = marge_nette TOTALE.
--
--  Idempotent.
-- ============================================================================

-- 1) Colonne de réservation sur le catalogue ----------------------------------
alter table public.boissons
  add column if not exists actionnaire_reserve_id uuid
    references public.actionnaires (id) on delete set null;

create index if not exists idx_boissons_reserve
  on public.boissons (actionnaire_reserve_id);

-- 2) RPC ACTIONNAIRE : son compte du mois (part générale + bonus réservé) ------
create or replace function public.get_compte_actionnaire(p_code text, p_mois date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  a record;
  v_fond numeric;
  v_debut timestamptz; v_fin timestamptz;
  v_part numeric;
  v_marge_tot numeric; v_casse_tot numeric;
  v_marge_res_all numeric; v_casse_res_all numeric;
  v_marge_nette_gen numeric;
  v_marge_res_moi numeric; v_casse_res_moi numeric; v_benef_res numeric;
  v_part_brut numeric; v_brut numeric;
  v_charges numeric; v_detail jsonb; v_produits jsonb;
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

  -- Totaux du commerce sur le mois (ventes validées, casses validées)
  v_marge_tot := coalesce((select sum(marge) from public.mouvements
      where depot_id = a.depot_id and type = 'sortie' and statut = 'valide'
        and created_at >= v_debut and created_at < v_fin), 0);
  v_casse_tot := coalesce((select sum(cout_total) from public.casses
      where depot_id = a.depot_id and statut = 'valide'
        and created_at >= v_debut and created_at < v_fin), 0);

  -- Part RÉSERVÉE : tous produits réservés (à n'importe quel actionnaire)
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

  -- Pot GÉNÉRAL réparti par parts = commerce HORS produits réservés
  v_marge_nette_gen := (v_marge_tot - v_marge_res_all) - (v_casse_tot - v_casse_res_all);

  -- Part réservée à CET actionnaire (ses produits à lui)
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

  -- Noms des produits réservés à cet actionnaire (transparence)
  v_produits := coalesce((select jsonb_agg(b.nom order by b.nom)
      from public.boissons b
      where b.depot_id = a.depot_id and b.actionnaire_reserve_id = a.id and b.actif), '[]'::jsonb);

  -- Charges propres à cet actionnaire pour ce mois
  v_charges := coalesce((select sum(montant) from public.charges_actionnaire
      where actionnaire_id = a.id and mois = v_debut::date), 0);
  v_detail := coalesce((select jsonb_agg(jsonb_build_object('libelle', libelle, 'montant', montant) order by created_at)
      from public.charges_actionnaire
      where actionnaire_id = a.id and mois = v_debut::date), '[]'::jsonb);

  return jsonb_build_object(
    'trouve', true,
    'nom', a.nom,
    'apport', a.apport,
    'fond_de_commerce', coalesce(v_fond, 0),
    'part', v_part,
    'part_pct', round(v_part * 100, 2),
    'mois', to_char(v_debut, 'YYYY-MM'),
    'marge_commerce', v_marge_nette_gen,            -- pot général (hors réservés)
    'benefice_part', round(v_part_brut, 2),          -- part × pot général
    'benefice_reserve', round(v_benef_res, 2),       -- bonus produits réservés
    'produits_reserves', v_produits,
    'benefice_brut', round(v_brut, 2),               -- part + bonus réservé
    'charges', v_charges,
    'charges_detail', v_detail,
    'benefice_net', round(v_brut - v_charges, 2)
  );
end;
$$;

grant execute on function public.get_compte_actionnaire(text, date) to anon, authenticated;

-- 3) RPC PATRON : marge du mois + bénéfice de TOUS les actionnaires -----------
create or replace function public.get_benefices_actionnaires(p_depot_id uuid, p_mois date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_fond numeric; v_debut timestamptz; v_fin timestamptz;
  v_marge_tot numeric; v_casse_tot numeric;
  v_marge_res_all numeric; v_casse_res_all numeric;
  v_marge_nette_gen numeric;
  v_total_parts numeric; v_lignes jsonb;
begin
  if not public.owns_depot(p_depot_id) then
    raise exception 'Accès refusé';
  end if;

  select fond_de_commerce into v_fond from public.depots where id = p_depot_id;
  v_debut := date_trunc('month', coalesce(p_mois, current_date)::timestamptz);
  v_fin   := v_debut + interval '1 month';

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

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', a.id, 'nom', a.nom, 'apport', a.apport, 'code', a.code, 'actif', a.actif,
           'part_pct', round(case when coalesce(v_fond,0) > 0 then a.apport / v_fond * 100 else 0 end, 2),
           'benefice_part', round(case when coalesce(v_fond,0) > 0 then a.apport / v_fond * v_marge_nette_gen else 0 end, 2),
           'benefice_reserve', round(coalesce(rm.marge, 0) - coalesce(rc.casse, 0), 2),
           'produits_reserves', coalesce(rp.produits, '[]'::jsonb),
           'benefice_brut', round((case when coalesce(v_fond,0) > 0 then a.apport / v_fond * v_marge_nette_gen else 0 end)
                                  + (coalesce(rm.marge, 0) - coalesce(rc.casse, 0)), 2),
           'charges', coalesce(c.somme, 0),
           'benefice_net', round((case when coalesce(v_fond,0) > 0 then a.apport / v_fond * v_marge_nette_gen else 0 end)
                                 + (coalesce(rm.marge, 0) - coalesce(rc.casse, 0)) - coalesce(c.somme, 0), 2)
         ) order by a.created_at), '[]'::jsonb),
         coalesce(sum(a.apport), 0)
    into v_lignes, v_total_parts
  from public.actionnaires a
  left join (
    select actionnaire_id, sum(montant) somme from public.charges_actionnaire
    where mois = v_debut::date group by actionnaire_id
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
    'marge_commerce', v_marge_nette_gen,                         -- pot réparti par parts
    'marge_reservee', round(v_marge_res_all - v_casse_res_all, 2), -- total attribué en direct
    'marge_totale', round((v_marge_tot - v_casse_tot), 2),
    'total_apports', v_total_parts,
    'part_actionnaires_pct', round(case when coalesce(v_fond,0) > 0 then v_total_parts / v_fond * 100 else 0 end, 2),
    'actionnaires', v_lignes
  );
end;
$$;

grant execute on function public.get_benefices_actionnaires(uuid, date) to authenticated;

-- 4) ASSIGNATION : les « Cody's » → actionnaire « Morel » (par dépôt) ---------
--    Idempotent : se contente de (ré)affecter la réservation.
--    Robuste aux variantes de nom (apostrophe courbe, « energi », espaces).
update public.boissons b
set actionnaire_reserve_id = a.id
from public.actionnaires a
where a.depot_id = b.depot_id
  and trim(a.nom) ilike 'morel'
  and b.nom ilike 'cody%';
