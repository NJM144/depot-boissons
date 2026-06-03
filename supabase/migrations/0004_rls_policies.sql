-- ============================================================================
--  DÉPÔT BOISSONS — SCHÉMA SUPABASE (4/5) : ROW LEVEL SECURITY (RLS)
-- ----------------------------------------------------------------------------
--  Principe :
--   • GÉRANT      : ne voit/écrit que les données de SON dépôt, et n'a AUCUN
--                   accès en lecture aux marges ni aux prix d'achat.
--                   → il lit le catalogue/stock via les VUES sécurisées
--                     v_boissons_gerant / v_stock_gerant (colonnes filtrées).
--                   → il PEUT insérer des mouvements et des casses.
--                   → il ne peut PAS faire un SELECT direct sur `mouvements`
--                     (donc la colonne `marge` lui reste invisible).
--   • PROPRIÉTAIRE : lecture/écriture complètes (marges, prix, stats) sur les
--                    dépôts dont il est proprietaire_id.
-- ============================================================================

-- Active RLS sur toutes les tables
alter table public.depots       enable row level security;
alter table public.profiles     enable row level security;
alter table public.boissons     enable row level security;
alter table public.mouvements   enable row level security;
alter table public.casses       enable row level security;
alter table public.push_tokens  enable row level security;

-- ----------------------------------------------------------------------------
--  PROFILES — chacun lit/modifie uniquement SA propre ligne
-- ----------------------------------------------------------------------------
drop policy if exists profiles_self_select on public.profiles;
create policy profiles_self_select on public.profiles
  for select using (id = auth.uid());

drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- ----------------------------------------------------------------------------
--  DEPOTS
--   • propriétaire : tout sur ses dépôts
--   • gérant       : lecture de son dépôt uniquement
-- ----------------------------------------------------------------------------
drop policy if exists depots_proprio_all on public.depots;
create policy depots_proprio_all on public.depots
  for all using (proprietaire_id = auth.uid())
  with check (proprietaire_id = auth.uid());

drop policy if exists depots_gerant_read on public.depots;
create policy depots_gerant_read on public.depots
  for select using (public.is_gerant_of(id));

-- ----------------------------------------------------------------------------
--  BOISSONS
--   • propriétaire : CRUD complet (avec prix_achat, marge) sur ses dépôts
--   • gérant       : PAS de SELECT direct sur la table (prix_achat masqué).
--                    Il lit via la vue v_boissons_gerant.
-- ----------------------------------------------------------------------------
drop policy if exists boissons_proprio_all on public.boissons;
create policy boissons_proprio_all on public.boissons
  for all using (public.owns_depot(depot_id))
  with check (public.owns_depot(depot_id));

-- (Aucune policy SELECT pour le gérant sur la table de base => accès refusé.
--  Le gérant passe par la vue SECURITY DEFINER v_boissons_gerant.)

-- ----------------------------------------------------------------------------
--  MOUVEMENTS
--   • propriétaire : SELECT complet (y compris `marge`) sur ses dépôts
--   • gérant       : INSERT sur son dépôt UNIQUEMENT (pas de SELECT direct
--                    => la colonne `marge` lui est invisible)
-- ----------------------------------------------------------------------------
drop policy if exists mouvements_proprio_select on public.mouvements;
create policy mouvements_proprio_select on public.mouvements
  for select using (public.owns_depot(depot_id));

drop policy if exists mouvements_proprio_write on public.mouvements;
create policy mouvements_proprio_write on public.mouvements
  for insert with check (public.owns_depot(depot_id));

drop policy if exists mouvements_gerant_insert on public.mouvements;
create policy mouvements_gerant_insert on public.mouvements
  for insert with check (
    public.is_gerant_of(depot_id) and gerant_id = auth.uid()
  );

-- ----------------------------------------------------------------------------
--  CASSES
--   • propriétaire : SELECT/écriture complets sur ses dépôts
--   • gérant       : INSERT + SELECT de son dépôt (le coût lui est visible,
--                    conformément au besoin "le coût s'affiche au gérant")
-- ----------------------------------------------------------------------------
drop policy if exists casses_proprio_all on public.casses;
create policy casses_proprio_all on public.casses
  for all using (public.owns_depot(depot_id))
  with check (public.owns_depot(depot_id));

drop policy if exists casses_gerant_select on public.casses;
create policy casses_gerant_select on public.casses
  for select using (public.is_gerant_of(depot_id));

drop policy if exists casses_gerant_insert on public.casses;
create policy casses_gerant_insert on public.casses
  for insert with check (
    public.is_gerant_of(depot_id) and gerant_id = auth.uid()
  );

-- ----------------------------------------------------------------------------
--  PUSH_TOKENS — chacun gère uniquement ses propres jetons
-- ----------------------------------------------------------------------------
drop policy if exists push_self_all on public.push_tokens;
create policy push_self_all on public.push_tokens
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ----------------------------------------------------------------------------
--  GRANTS sur les vues sécurisées du gérant (vues SECURITY DEFINER)
-- ----------------------------------------------------------------------------
grant select on public.v_boissons_gerant to authenticated;
grant select on public.v_stock_gerant   to authenticated;
grant select on public.v_stock          to authenticated;
grant select on public.v_point_jour      to authenticated;
grant select on public.v_point_semaine   to authenticated;
grant select on public.v_point_mois      to authenticated;
