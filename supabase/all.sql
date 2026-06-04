-- DEPOT BOISSONS - SCHEMA COMPLET (migrations 0001 -> 0006)

-- >>>>>>>>>>>>>>>>>>>> 0001_tables.sql <<<<<<<<<<<<<<<<<<<<
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


-- >>>>>>>>>>>>>>>>>>>> 0002_functions_triggers.sql <<<<<<<<<<<<<<<<<<<<
-- ============================================================================
--  DÉPÔT BOISSONS — SCHÉMA SUPABASE (2/5) : FONCTIONS HELPER + TRIGGERS
-- ============================================================================

-- ----------------------------------------------------------------------------
--  FONCTIONS HELPER (SECURITY DEFINER pour éviter la récursion RLS sur profiles)
-- ----------------------------------------------------------------------------

-- Rôle applicatif de l'utilisateur courant ('gerant' | 'proprietaire' | NULL)
create or replace function public.app_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

-- Dépôt géré par l'utilisateur courant (cas du gérant)
create or replace function public.user_depot_id()
returns uuid language sql stable security definer set search_path = public as $$
  select depot_id from public.profiles where id = auth.uid();
$$;

-- L'utilisateur courant est-il PROPRIÉTAIRE du dépôt donné ?
create or replace function public.owns_depot(d uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.depots where id = d and proprietaire_id = auth.uid());
$$;

-- L'utilisateur courant est-il le GÉRANT affecté à ce dépôt ?
create or replace function public.is_gerant_of(d uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'gerant' and depot_id = d
  );
$$;

-- ----------------------------------------------------------------------------
--  TRIGGER 1 — calculs automatiques sur INSERT dans `mouvements`
-- ----------------------------------------------------------------------------
create or replace function public.calc_mouvement()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_prix_achat numeric;
  v_prix_vente numeric;
begin
  -- Récupère les prix de la boisson concernée
  select prix_achat, prix_vente into v_prix_achat, v_prix_vente
  from public.boissons where id = new.boisson_id;

  if new.type = 'sortie' then
    -- Prix unitaire = prix saisi à la vente, sinon prix de vente de référence
    new.prix_unitaire := coalesce(new.prix_unitaire, v_prix_vente);
    new.montant_total := new.quantite * new.prix_unitaire;
    -- Marge = (prix de vente effectif - prix d'achat) * quantité
    new.marge := (new.prix_unitaire - coalesce(v_prix_achat, 0)) * new.quantite;
  else
    -- Entrée (reçu) : pas de chiffre d'affaires ni de marge
    new.prix_unitaire := coalesce(new.prix_unitaire, v_prix_achat);
    new.montant_total := coalesce(new.montant_total, 0);
    new.marge := 0;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_calc_mouvement on public.mouvements;
create trigger trg_calc_mouvement
  before insert on public.mouvements
  for each row execute function public.calc_mouvement();

-- ----------------------------------------------------------------------------
--  TRIGGER 2 — calcul automatique du coût sur INSERT dans `casses`
-- ----------------------------------------------------------------------------
create or replace function public.calc_casse()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_prix_achat numeric;
begin
  select prix_achat into v_prix_achat from public.boissons where id = new.boisson_id;
  -- Coût de la perte = quantité cassée * prix d'achat
  new.cout_total := new.quantite * coalesce(v_prix_achat, 0);
  return new;
end;
$$;

drop trigger if exists trg_calc_casse on public.casses;
create trigger trg_calc_casse
  before insert on public.casses
  for each row execute function public.calc_casse();

-- ----------------------------------------------------------------------------
--  TRIGGER 3 — créer automatiquement un profil à l'inscription d'un user
--   (le rôle/dépôt par défaut sont fournis dans les métadonnées d'inscription)
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, role, nom, depot_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'role', 'gerant'),
    new.raw_user_meta_data ->> 'nom',
    nullif(new.raw_user_meta_data ->> 'depot_id', '')::uuid
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_handle_new_user on auth.users;
create trigger trg_handle_new_user
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- >>>>>>>>>>>>>>>>>>>> 0003_views_rpc.sql <<<<<<<<<<<<<<<<<<<<
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


-- >>>>>>>>>>>>>>>>>>>> 0004_rls_policies.sql <<<<<<<<<<<<<<<<<<<<
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


-- >>>>>>>>>>>>>>>>>>>> 0005_realtime.sql <<<<<<<<<<<<<<<<<<<<
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


-- >>>>>>>>>>>>>>>>>>>> 0006_validation.sql <<<<<<<<<<<<<<<<<<<<
-- ============================================================================
--  DÉPÔT BOISSONS — MIGRATION 6 : VALIDATION PAR LE PATRON
-- ----------------------------------------------------------------------------
--  Toute saisie du gérant (vente, réception, casse) est créée EN ATTENTE.
--  Le patron valide (éventuellement après correction du montant) ou rejette.
--  Tant que ce n'est pas 'valide' : ça ne compte NI dans le CA, NI dans le stock.
--  Bonus : on stocke désormais le MONTANT EXACT composé (fini l'arrondi).
-- ============================================================================

-- 1) Colonne `statut` sur mouvements et casses --------------------------------
alter table public.mouvements
  add column if not exists statut text not null default 'en_attente'
  check (statut in ('en_attente', 'valide', 'rejete'));

alter table public.casses
  add column if not exists statut text not null default 'en_attente'
  check (statut in ('en_attente', 'valide', 'rejete'));

create index if not exists idx_mouvements_statut on public.mouvements (depot_id, statut);
create index if not exists idx_casses_statut on public.casses (depot_id, statut);

-- 2) Trigger mouvement : montant EXACT + recalcul, sur INSERT ET UPDATE -------
--    (l'UPDATE sert quand le patron corrige le montant lors de la validation)
create or replace function public.calc_mouvement()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_prix_achat numeric;
  v_prix_vente numeric;
begin
  select prix_achat, prix_vente into v_prix_achat, v_prix_vente
  from public.boissons where id = new.boisson_id;

  if new.type = 'sortie' then
    -- montant_total = le montant EXACT composé/corrigé (sinon prix_vente x quantité)
    new.montant_total := coalesce(new.montant_total, new.quantite * v_prix_vente);
    -- prix_unitaire conservé à titre indicatif (montant / quantité)
    new.prix_unitaire := round(new.montant_total / nullif(new.quantite, 0), 2);
    -- Marge = montant réel - coût d'achat total (pas d'arrondi intermédiaire)
    new.marge := new.montant_total - coalesce(v_prix_achat, 0) * new.quantite;
  else
    -- Entrée (reçu) : pas de CA ni de marge
    new.prix_unitaire := coalesce(new.prix_unitaire, v_prix_achat);
    new.montant_total := 0;
    new.marge := 0;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_calc_mouvement on public.mouvements;
create trigger trg_calc_mouvement
  before insert or update on public.mouvements
  for each row execute function public.calc_mouvement();

-- Trigger casse : coût recalculé sur INSERT ET UPDATE (correction de quantité)
create or replace function public.calc_casse()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_prix_achat numeric;
begin
  select prix_achat into v_prix_achat from public.boissons where id = new.boisson_id;
  new.cout_total := new.quantite * coalesce(v_prix_achat, 0);
  return new;
end;
$$;

drop trigger if exists trg_calc_casse on public.casses;
create trigger trg_calc_casse
  before insert or update on public.casses
  for each row execute function public.calc_casse();

-- 3) RLS : le PATRON peut mettre à jour les mouvements (valider/corriger/rejeter)
drop policy if exists mouvements_proprio_update on public.mouvements;
create policy mouvements_proprio_update on public.mouvements
  for update using (public.owns_depot(depot_id))
  with check (public.owns_depot(depot_id));
-- (casses : la policy casses_proprio_all couvre déjà l'UPDATE pour le patron)

-- 4) v_stock : ne compter QUE le validé ---------------------------------------
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
  where type = 'entree' and statut = 'valide' group by boisson_id
) e on e.boisson_id = b.id
left join (
  select boisson_id, sum(quantite) q from public.mouvements
  where type = 'sortie' and statut = 'valide' group by boisson_id
) s on s.boisson_id = b.id
left join (
  select boisson_id, sum(quantite) q from public.casses
  where statut = 'valide' group by boisson_id
) c on c.boisson_id = b.id
where b.actif = true;

-- 5) Vues "point" : ne compter QUE le validé ----------------------------------
create or replace view public.v_point_jour
with (security_invoker = true) as
with ventes as (
  select depot_id, date_trunc('day', created_at) as periode,
         sum(montant_total) as ca, sum(marge) as marge
  from public.mouvements where type = 'sortie' and statut = 'valide' group by 1, 2
),
pertes as (
  select depot_id, date_trunc('day', created_at) as periode, sum(cout_total) as casse
  from public.casses where statut = 'valide' group by 1, 2
)
select coalesce(v.depot_id, p.depot_id) as depot_id,
  coalesce(v.periode, p.periode) as periode,
  coalesce(v.ca, 0) as total_sorties, coalesce(v.marge, 0) as total_marge,
  coalesce(p.casse, 0) as total_casse_cout,
  coalesce(v.marge, 0) - coalesce(p.casse, 0) as marge_nette
from ventes v full outer join pertes p on v.depot_id = p.depot_id and v.periode = p.periode;

create or replace view public.v_point_semaine
with (security_invoker = true) as
with ventes as (
  select depot_id, date_trunc('week', created_at) as periode,
         sum(montant_total) as ca, sum(marge) as marge
  from public.mouvements where type = 'sortie' and statut = 'valide' group by 1, 2
),
pertes as (
  select depot_id, date_trunc('week', created_at) as periode, sum(cout_total) as casse
  from public.casses where statut = 'valide' group by 1, 2
)
select coalesce(v.depot_id, p.depot_id) as depot_id,
  coalesce(v.periode, p.periode) as periode,
  coalesce(v.ca, 0) as total_sorties, coalesce(v.marge, 0) as total_marge,
  coalesce(p.casse, 0) as total_casse_cout,
  coalesce(v.marge, 0) - coalesce(p.casse, 0) as marge_nette
from ventes v full outer join pertes p on v.depot_id = p.depot_id and v.periode = p.periode;

create or replace view public.v_point_mois
with (security_invoker = true) as
with ventes as (
  select depot_id, date_trunc('month', created_at) as periode,
         sum(montant_total) as ca, sum(marge) as marge
  from public.mouvements where type = 'sortie' and statut = 'valide' group by 1, 2
),
pertes as (
  select depot_id, date_trunc('month', created_at) as periode, sum(cout_total) as casse
  from public.casses where statut = 'valide' group by 1, 2
)
select coalesce(v.depot_id, p.depot_id) as depot_id,
  coalesce(v.periode, p.periode) as periode,
  coalesce(v.ca, 0) as total_sorties, coalesce(v.marge, 0) as total_marge,
  coalesce(p.casse, 0) as total_casse_cout,
  coalesce(v.marge, 0) - coalesce(p.casse, 0) as marge_nette
from ventes v full outer join pertes p on v.depot_id = p.depot_id and v.periode = p.periode;

-- 6) RPC get_point : ne compter QUE le validé ---------------------------------
create or replace function public.get_point(p_depot_id uuid, p_periode text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_debut timestamptz; v_fin timestamptz; v_result jsonb;
begin
  if not public.owns_depot(p_depot_id) then
    raise exception 'Accès refusé au point de ce dépôt';
  end if;

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
    'periode', p_periode, 'debut', v_debut, 'fin', v_fin,
    'total_entrees', coalesce((select sum(quantite) from mouvements
        where depot_id = p_depot_id and type = 'entree' and statut = 'valide'
          and created_at >= v_debut and created_at < v_fin), 0),
    'chiffre_affaires', coalesce((select sum(montant_total) from mouvements
        where depot_id = p_depot_id and type = 'sortie' and statut = 'valide'
          and created_at >= v_debut and created_at < v_fin), 0),
    'total_marge', coalesce((select sum(marge) from mouvements
        where depot_id = p_depot_id and type = 'sortie' and statut = 'valide'
          and created_at >= v_debut and created_at < v_fin), 0),
    'total_casse_cout', coalesce((select sum(cout_total) from casses
        where depot_id = p_depot_id and statut = 'valide'
          and created_at >= v_debut and created_at < v_fin), 0),
    'marge_nette',
        coalesce((select sum(marge) from mouvements
          where depot_id = p_depot_id and type = 'sortie' and statut = 'valide'
            and created_at >= v_debut and created_at < v_fin), 0)
      - coalesce((select sum(cout_total) from casses
          where depot_id = p_depot_id and statut = 'valide'
            and created_at >= v_debut and created_at < v_fin), 0),
    'detail', coalesce((
      select jsonb_agg(jsonb_build_object(
        'boisson_id', b.id, 'nom', b.nom, 'emoji', b.emoji,
        'prix_achat', b.prix_achat, 'prix_vente', b.prix_vente,
        'quantite_vendue', coalesce(v.q, 0),
        'chiffre_affaires', coalesce(v.ca, 0), 'marge', coalesce(v.marge, 0)
      ) order by coalesce(v.ca, 0) desc)
      from boissons b
      left join (
        select boisson_id, sum(quantite) q, sum(montant_total) ca, sum(marge) marge
        from mouvements
        where depot_id = p_depot_id and type = 'sortie' and statut = 'valide'
          and created_at >= v_debut and created_at < v_fin
        group by boisson_id
      ) v on v.boisson_id = b.id
      where b.depot_id = p_depot_id and b.actif = true
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

