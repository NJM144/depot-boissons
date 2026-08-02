-- ============================================================================
--  DÉPÔT BOISSONS — MIGRATION 15 : IMPORT DE L'HISTORIQUE PAPIER (Ndri)
-- ----------------------------------------------------------------------------
--  Fonction d'import ponctuel : insère des ventes historiques en préservant
--  la marge RÉELLE de l'époque (le trigger normal recalcule toujours la marge
--  avec le prix d'achat ACTUEL du catalogue, ce qu'on ne veut pas ici).
--  On désactive donc le trigger le temps de l'insertion, puis on le réactive.
--  Idempotent à l'usage : peut être relancée (mais réinsère les lignes si
--  rappelée avec le même payload — pas de déduplication automatique).
-- ============================================================================

create or replace function public.import_mouvements_historique(payload jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  alter table public.mouvements disable trigger trg_calc_mouvement;

  insert into public.mouvements
    (depot_id, boisson_id, type, quantite, unite, quantite_bouteilles,
     prix_unitaire, montant_total, marge, statut, created_at)
  select
    (elem->>'depot_id')::uuid,
    (elem->>'boisson_id')::uuid,
    'sortie',
    (elem->>'quantite_bouteilles')::integer,
    'bouteille',
    (elem->>'quantite_bouteilles')::integer,
    (elem->>'prix_unitaire')::numeric,
    (elem->>'montant_total')::numeric,
    (elem->>'marge')::numeric,
    'valide',
    (elem->>'created_at')::timestamptz
  from jsonb_array_elements(payload) as elem;

  get diagnostics n = row_count;

  alter table public.mouvements enable trigger trg_calc_mouvement;

  return n;
exception when others then
  alter table public.mouvements enable trigger trg_calc_mouvement;
  raise;
end;
$$;

revoke all on function public.import_mouvements_historique(jsonb) from public, anon, authenticated;
