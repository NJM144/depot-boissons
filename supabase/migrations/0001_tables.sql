-- ============================================================================
--  DÉPÔT BOISSONS — SCHÉMA SUPABASE (1/5) : TABLES
-- ----------------------------------------------------------------------------
--  Ordre d'exécution : 0001_tables → 0002_functions_triggers → 0003_views_rpc
--  → 0004_rls_policies → 0005_realtime. Puis seed.sql pour les comptes démo.
-- ============================================================================

-- Extension pour gen_random_uuid()
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
--  DEPOTS — un dépôt physique de boissons, appartient à un propriétaire
-- ----------------------------------------------------------------------------
create table if not exists public.depots (
  id              uuid primary key default gen_random_uuid(),
  nom             text not null,
  proprietaire_id uuid not null references auth.users (id) on delete cascade,
  created_at      timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
--  PROFILES — profil applicatif lié à un compte auth.users
--   role        : 'gerant' (saisie) ou 'proprietaire' (suivi/stats)
--   depot_id    : pour le GÉRANT = le dépôt qu'il gère (NULL pour le proprio)
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  role        text not null check (role in ('gerant','proprietaire')),
  nom         text,
  depot_id    uuid references public.depots (id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
--  BOISSONS — catalogue par dépôt
--   prix_achat  : coût d'achat (SENSIBLE — invisible pour le gérant)
--   prix_vente  : prix de vente de référence
-- ----------------------------------------------------------------------------
create table if not exists public.boissons (
  id              uuid primary key default gen_random_uuid(),
  depot_id        uuid not null references public.depots (id) on delete cascade,
  nom             text not null,
  emoji           text default '🥤',
  photo           text,                       -- dataURL ou URL storage
  couleur_casier  text default '#3b82f6',
  prix_achat      numeric(12,2) not null default 0,   -- SENSIBLE
  prix_vente      numeric(12,2) not null default 0,
  seuil_alerte    integer not null default 5,
  actif           boolean not null default true,
  created_at      timestamptz not null default now()
);
create index if not exists idx_boissons_depot on public.boissons (depot_id);

-- ----------------------------------------------------------------------------
--  MOUVEMENTS — entrées reçues / sorties (ventes)
--   type='entree' = reçu au dépôt ; type='sortie' = vendu
--   montant_total / marge sont calculés par trigger (voir 0002)
--   marge est SENSIBLE (invisible pour le gérant via RLS + vues)
-- ----------------------------------------------------------------------------
create table if not exists public.mouvements (
  id             uuid primary key default gen_random_uuid(),
  depot_id       uuid not null references public.depots (id) on delete cascade,
  boisson_id     uuid not null references public.boissons (id) on delete restrict,
  type           text not null check (type in ('entree','sortie')),
  quantite       integer not null check (quantite > 0),
  prix_unitaire  numeric(12,2),    -- prix de vente saisi au moment de la vente
  montant_total  numeric(12,2),    -- = quantite * prix_unitaire (calculé)
  marge          numeric(12,2),    -- = (prix_unitaire - prix_achat) * quantite (calculé) SENSIBLE
  gerant_id      uuid references public.profiles (id),
  created_at     timestamptz not null default now()
);
create index if not exists idx_mouvements_depot_date on public.mouvements (depot_id, created_at);
create index if not exists idx_mouvements_type on public.mouvements (type);

-- ----------------------------------------------------------------------------
--  CASSES — boissons cassées / pertes (saisies par le gérant)
--   cout_total = quantite * prix_achat (calculé par trigger)
-- ----------------------------------------------------------------------------
create table if not exists public.casses (
  id          uuid primary key default gen_random_uuid(),
  depot_id    uuid not null references public.depots (id) on delete cascade,
  boisson_id  uuid not null references public.boissons (id) on delete restrict,
  quantite    integer not null check (quantite > 0),
  cout_total  numeric(12,2),       -- = quantite * prix_achat (calculé)
  gerant_id   uuid references public.profiles (id),
  created_at  timestamptz not null default now()
);
create index if not exists idx_casses_depot_date on public.casses (depot_id, created_at);

-- ----------------------------------------------------------------------------
--  PUSH_TOKENS — jetons FCM pour les notifications push (propriétaires)
-- ----------------------------------------------------------------------------
create table if not exists public.push_tokens (
  user_id    uuid not null references auth.users (id) on delete cascade,
  token      text not null,
  platform   text default 'android',
  updated_at timestamptz not null default now(),
  primary key (user_id, token)
);
