-- ============================================================================
--  DÉPÔT BOISSONS — SCHÉMA SUPABASE (3/5) : VUES & FONCTIONS RPC
-- ============================================================================

-- ----------------------------------------------------------------------------
--  VUE v_stock — stock courant par boisson, EN DIRECT
--   stock = SUM(entrées) − SUM(sorties) − SUM(casses)
--   security_invoker => respecte la RLS des tables sous-jacentes
-- ----------------------------------------------------------------------------
create or replace view public.v_stock
with (security_invoker = true) as
select
  b.id            as boisson_id,
  b.depot_id,
  b.nom,
  b.emoji,
  b.couleur_casier,
  b.seuil_alerte,
  coalesce(e.q, 0)  as total_entrees,
  coalesce(s.q, 0)  as total_sorties,
  coalesce(c.q, 0)  as total_casses,
  coalesce(e.q, 0) - coalesce(s.q, 0) - coalesce(c.q, 0) as stock,
  (coalesce(e.q, 0) - coalesce(s.q, 0) - coalesce(c.q, 0)) <= b.seuil_alerte as en_rupture
from public.boissons b
left join (
  select boisson_id, sum(quantite) q from public.mouvements
  where type = 'entree' group by boisson_id
) e on e.boisson_id = b.id
left join (
  select boisson_id, sum(quantite) q from public.mouvements
  where type = 'sortie' group by boisson_id
) s on s.boisson_id = b.id
left join (
  select boisson_id, sum(quantite) q from public.casses group by boisson_id
) c on c.boisson_id = b.id
where b.actif = true;

-- ----------------------------------------------------------------------------
--  VUES "POINT" PAR PÉRIODE (pour les graphiques d'évolution du propriétaire)
--   Chaque vue agrège : période, CA (sorties), marge, coût des casses, marge nette
-- ----------------------------------------------------------------------------

-- Agrégat journalier
create or replace view public.v_point_jour
with (security_invoker = true) as
with ventes as (
  select depot_id, date_trunc('day', created_at) as periode,
         sum(montant_total) as ca, sum(marge) as marge
  from public.mouvements where type = 'sortie' group by 1, 2
),
pertes as (
  select depot_id, date_trunc('day', created_at) as periode, sum(cout_total) as casse
  from public.casses group by 1, 2
)
select
  coalesce(v.depot_id, p.depot_id) as depot_id,
  coalesce(v.periode, p.periode)   as periode,
  coalesce(v.ca, 0)                as total_sorties,
  coalesce(v.marge, 0)             as total_marge,
  coalesce(p.casse, 0)             as total_casse_cout,
  coalesce(v.marge, 0) - coalesce(p.casse, 0) as marge_nette
from ventes v
full outer join pertes p on v.depot_id = p.depot_id and v.periode = p.periode;

-- Agrégat hebdomadaire (semaine ISO)
create or replace view public.v_point_semaine
with (security_invoker = true) as
with ventes as (
  select depot_id, date_trunc('week', created_at) as periode,
         sum(montant_total) as ca, sum(marge) as marge
  from public.mouvements where type = 'sortie' group by 1, 2
),
pertes as (
  select depot_id, date_trunc('week', created_at) as periode, sum(cout_total) as casse
  from public.casses group by 1, 2
)
select
  coalesce(v.depot_id, p.depot_id) as depot_id,
  coalesce(v.periode, p.periode)   as periode,
  coalesce(v.ca, 0)                as total_sorties,
  coalesce(v.marge, 0)             as total_marge,
  coalesce(p.casse, 0)             as total_casse_cout,
  coalesce(v.marge, 0) - coalesce(p.casse, 0) as marge_nette
from ventes v
full outer join pertes p on v.depot_id = p.depot_id and v.periode = p.periode;

-- Agrégat mensuel
create or replace view public.v_point_mois
with (security_invoker = true) as
with ventes as (
  select depot_id, date_trunc('month', created_at) as periode,
         sum(montant_total) as ca, sum(marge) as marge
  from public.mouvements where type = 'sortie' group by 1, 2
),
pertes as (
  select depot_id, date_trunc('month', created_at) as periode, sum(cout_total) as casse
  from public.casses group by 1, 2
)
select
  coalesce(v.depot_id, p.depot_id) as depot_id,
  coalesce(v.periode, p.periode)   as periode,
  coalesce(v.ca, 0)                as total_sorties,
  coalesce(v.marge, 0)             as total_marge,
  coalesce(p.casse, 0)             as total_casse_cout,
  coalesce(v.marge, 0) - coalesce(p.casse, 0) as marge_nette
from ventes v
full outer join pertes p on v.depot_id = p.depot_id and v.periode = p.periode;

-- ----------------------------------------------------------------------------
--  RPC get_point(depot_id, periode) — "LE POINT" pour la période courante
--   periode ∈ ('jour','semaine','mois')
--   Retourne un JSON : totaux + détail par boisson.
--   SECURITY DEFINER + contrôle owns_depot => réservé au PROPRIÉTAIRE du dépôt.
-- ----------------------------------------------------------------------------
create or replace function public.get_point(p_depot_id uuid, p_periode text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_debut timestamptz;
  v_fin   timestamptz;
  v_result jsonb;
begin
  -- Sécurité : seul le propriétaire du dépôt peut consulter le point
  if not public.owns_depot(p_depot_id) then
    raise exception 'Accès refusé au point de ce dépôt';
  end if;

  -- Bornes de la période courante
  if p_periode = 'jour' then
    v_debut := date_trunc('day', now());   v_fin := v_debut + interval '1 day';
  elsif p_periode = 'semaine' then
    v_debut := date_trunc('week', now());  v_fin := v_debut + interval '1 week';
  elsif p_periode = 'mois' then
    v_debut := date_trunc('month', now()); v_fin := v_debut + interval '1 month';
  else
    raise exception 'Période invalide (jour|semaine|mois)';
  end if;

  select jsonb_build_object(
    'periode', p_periode,
    'debut', v_debut,
    'fin', v_fin,
    -- Totaux globaux
    'total_entrees', coalesce((select sum(quantite) from mouvements
        where depot_id = p_depot_id and type = 'entree'
          and created_at >= v_debut and created_at < v_fin), 0),
    'chiffre_affaires', coalesce((select sum(montant_total) from mouvements
        where depot_id = p_depot_id and type = 'sortie'
          and created_at >= v_debut and created_at < v_fin), 0),
    'total_marge', coalesce((select sum(marge) from mouvements
        where depot_id = p_depot_id and type = 'sortie'
          and created_at >= v_debut and created_at < v_fin), 0),
    'total_casse_cout', coalesce((select sum(cout_total) from casses
        where depot_id = p_depot_id
          and created_at >= v_debut and created_at < v_fin), 0),
    'marge_nette',
        coalesce((select sum(marge) from mouvements
          where depot_id = p_depot_id and type = 'sortie'
            and created_at >= v_debut and created_at < v_fin), 0)
      - coalesce((select sum(cout_total) from casses
          where depot_id = p_depot_id
            and created_at >= v_debut and created_at < v_fin), 0),
    -- Détail par boisson (CA, quantité vendue, marge, prix achat/vente)
    'detail', coalesce((
      select jsonb_agg(jsonb_build_object(
        'boisson_id', b.id,
        'nom', b.nom,
        'emoji', b.emoji,
        'prix_achat', b.prix_achat,
        'prix_vente', b.prix_vente,
        'quantite_vendue', coalesce(v.q, 0),
        'chiffre_affaires', coalesce(v.ca, 0),
        'marge', coalesce(v.marge, 0)
      ) order by coalesce(v.ca, 0) desc)
      from boissons b
      left join (
        select boisson_id, sum(quantite) q, sum(montant_total) ca, sum(marge) marge
        from mouvements
        where depot_id = p_depot_id and type = 'sortie'
          and created_at >= v_debut and created_at < v_fin
        group by boisson_id
      ) v on v.boisson_id = b.id
      where b.depot_id = p_depot_id and b.actif = true
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

-- ----------------------------------------------------------------------------
--  VUES SÉCURISÉES POUR LE GÉRANT (SECURITY DEFINER => masquage de colonnes)
--   Le gérant lit le catalogue SANS prix_achat ni marge.
--   Chaque vue filtre sur le dépôt du gérant courant (user_depot_id()).
-- ----------------------------------------------------------------------------

-- Catalogue côté gérant : aucune donnée sensible (pas de prix_achat)
create or replace view public.v_boissons_gerant
with (security_invoker = false) as
select id, depot_id, nom, emoji, photo, couleur_casier, prix_vente, seuil_alerte, actif
from public.boissons
where actif = true and depot_id = public.user_depot_id();

-- Stock côté gérant (réutilise v_stock filtré sur son dépôt)
create or replace view public.v_stock_gerant
with (security_invoker = false) as
select boisson_id, depot_id, nom, emoji, couleur_casier, seuil_alerte, stock, en_rupture
from public.v_stock
where depot_id = public.user_depot_id();
