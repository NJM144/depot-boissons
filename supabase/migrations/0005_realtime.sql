-- ============================================================================
--  DÉPÔT BOISSONS — SCHÉMA SUPABASE (5/5) : TEMPS RÉEL (REALTIME)
-- ----------------------------------------------------------------------------
--  Active Supabase Realtime sur `mouvements` : le tableau de bord du
--  propriétaire reçoit chaque INSERT (notamment type='sortie') en direct.
--  La RLS s'applique aussi au temps réel : un client ne reçoit que les lignes
--  qu'il est autorisé à lire (donc le propriétaire de son dépôt).
-- ============================================================================

-- Ajoute les tables à la publication Realtime de Supabase
alter publication supabase_realtime add table public.mouvements;
alter publication supabase_realtime add table public.casses;

-- Pour que les payloads Realtime contiennent l'ancienne valeur lors des
-- updates/deletes (utile pour le suivi), on passe REPLICA IDENTITY à FULL.
alter table public.mouvements replica identity full;
alter table public.casses     replica identity full;
