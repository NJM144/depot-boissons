-- ============================================================================
--  DÉPÔT BOISSONS — MIGRATION 19 : DÉCLARATION QUOTIDIENNE D'AMORTISSEMENT
-- ----------------------------------------------------------------------------
--  BESOIN : le gérant verse chaque jour une somme (ex : 5000 XOF) pour
--  l'amortissement du tricycle. Il la déclare depuis son écran principal,
--  comme une vente ou une casse ; le patron valide/rejette (file "À valider").
--  N'affecte NI la marge, NI le bénéfice net des actionnaires — c'est un
--  simple suivi de versement.
--  Idempotent.
-- ============================================================================

-- 1) Table des déclarations (une ligne par versement du gérant) ---------------
create table if not exists public.declarations_amortissement (
  id               uuid primary key default gen_random_uuid(),
  depot_id         uuid not null references public.depots (id) on delete cascade,
  amortissement_id uuid references public.amortissements (id) on delete set null,
  montant          numeric not null check (montant > 0),
  statut           text not null default 'en_attente'
                     check (statut in ('en_attente', 'valide', 'rejete')),
  gerant_id        uuid references public.profiles (id),
  created_at       timestamptz not null default now()
);
create index if not exists idx_decl_amort_depot on public.declarations_amortissement (depot_id, statut);

-- 2) RLS : même modèle que les casses (gérant insert+select, patron tout) -----
alter table public.declarations_amortissement enable row level security;

drop policy if exists decl_amort_proprio_all on public.declarations_amortissement;
create policy decl_amort_proprio_all on public.declarations_amortissement
  for all using (public.owns_depot(depot_id))
  with check (public.owns_depot(depot_id));

drop policy if exists decl_amort_gerant_select on public.declarations_amortissement;
create policy decl_amort_gerant_select on public.declarations_amortissement
  for select using (public.is_gerant_of(depot_id));

drop policy if exists decl_amort_gerant_insert on public.declarations_amortissement;
create policy decl_amort_gerant_insert on public.declarations_amortissement
  for insert with check (
    public.is_gerant_of(depot_id) and gerant_id = auth.uid()
  );

-- 3) Le gérant doit pouvoir LIRE la définition (libellé, montant/jour) --------
--    pour pré-remplir le clavier monétaire avec le montant suggéré.
drop policy if exists amortissements_gerant_select on public.amortissements;
create policy amortissements_gerant_select on public.amortissements
  for select using (public.is_gerant_of(depot_id));
