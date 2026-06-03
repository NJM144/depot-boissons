-- ============================================================================
-- DEPOT BOISSONS - SCHEMA COMPLET (coller dans Supabase -> SQL Editor -> Run)
-- Concatenation des migrations 0001 -> 0005.
-- ============================================================================

-- >>>>>>>>>>>>>>>>>>>> 0001_tables.sql <<<<<<<<<<<<<<<<<<<<
-- ============================================================================
--  DÃ‰PÃ”T BOISSONS â€” SCHÃ‰MA SUPABASE (1/5) : TABLES
-- ----------------------------------------------------------------------------
--  Ordre d'exÃ©cution : 0001_tables â†’ 0002_functions_triggers â†’ 0003_views_rpc
--  â†’ 0004_rls_policies â†’ 0005_realtime. Puis seed.sql pour les comptes dÃ©mo.
-- ============================================================================

-- Extension pour gen_random_uuid()
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
--  DEPOTS â€” un dÃ©pÃ´t physique de boissons, appartient Ã  un propriÃ©taire
-- ----------------------------------------------------------------------------
create table if not exists public.depots (
  id              uuid primary key default gen_random_uuid(),
  nom             text not null,
  proprietaire_id uuid not null references auth.users (id) on delete cascade,
  created_at      timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
--  PROFILES â€” profil applicatif liÃ© Ã  un compte auth.users
--   role        : 'gerant' (saisie) ou 'proprietaire' (suivi/stats)
--   depot_id    : pour le GÃ‰RANT = le dÃ©pÃ´t qu'il gÃ¨re (NULL pour le proprio)
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  role        text not null check (role in ('gerant','proprietaire')),
  nom         text,
  depot_id    uuid references public.depots (id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
--  BOISSONS â€” catalogue par dÃ©pÃ´t
--   prix_achat  : coÃ»t d'achat (SENSIBLE â€” invisible pour le gÃ©rant)
--   prix_vente  : prix de vente de rÃ©fÃ©rence
-- ----------------------------------------------------------------------------
create table if not exists public.boissons (
  id              uuid primary key default gen_random_uuid(),
  depot_id        uuid not null references public.depots (id) on delete cascade,
  nom             text not null,
  emoji           text default 'ðŸ¥¤',
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
--  MOUVEMENTS â€” entrÃ©es reÃ§ues / sorties (ventes)
--   type='entree' = reÃ§u au dÃ©pÃ´t ; type='sortie' = vendu
--   montant_total / marge sont calculÃ©s par trigger (voir 0002)
--   marge est SENSIBLE (invisible pour le gÃ©rant via RLS + vues)
-- ----------------------------------------------------------------------------
create table if not exists public.mouvements (
  id             uuid primary key default gen_random_uuid(),
  depot_id       uuid not null references public.depots (id) on delete cascade,
  boisson_id     uuid not null references public.boissons (id) on delete restrict,
  type           text not null check (type in ('entree','sortie')),
  quantite       integer not null check (quantite > 0),
  prix_unitaire  numeric(12,2),    -- prix de vente saisi au moment de la vente
  montant_total  numeric(12,2),    -- = quantite * prix_unitaire (calculÃ©)
  marge          numeric(12,2),    -- = (prix_unitaire - prix_achat) * quantite (calculÃ©) SENSIBLE
  gerant_id      uuid references public.profiles (id),
  created_at     timestamptz not null default now()
);
create index if not exists idx_mouvements_depot_date on public.mouvements (depot_id, created_at);
create index if not exists idx_mouvements_type on public.mouvements (type);

-- ----------------------------------------------------------------------------
--  CASSES â€” boissons cassÃ©es / pertes (saisies par le gÃ©rant)
--   cout_total = quantite * prix_achat (calculÃ© par trigger)
-- ----------------------------------------------------------------------------
create table if not exists public.casses (
  id          uuid primary key default gen_random_uuid(),
  depot_id    uuid not null references public.depots (id) on delete cascade,
  boisson_id  uuid not null references public.boissons (id) on delete restrict,
  quantite    integer not null check (quantite > 0),
  cout_total  numeric(12,2),       -- = quantite * prix_achat (calculÃ©)
  gerant_id   uuid references public.profiles (id),
  created_at  timestamptz not null default now()
);
create index if not exists idx_casses_depot_date on public.casses (depot_id, created_at);

-- ----------------------------------------------------------------------------
--  PUSH_TOKENS â€” jetons FCM pour les notifications push (propriÃ©taires)
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
--  DÃ‰PÃ”T BOISSONS â€” SCHÃ‰MA SUPABASE (2/5) : FONCTIONS HELPER + TRIGGERS
-- ============================================================================

-- ----------------------------------------------------------------------------
--  FONCTIONS HELPER (SECURITY DEFINER pour Ã©viter la rÃ©cursion RLS sur profiles)
-- ----------------------------------------------------------------------------

-- RÃ´le applicatif de l'utilisateur courant ('gerant' | 'proprietaire' | NULL)
create or replace function public.app_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

-- DÃ©pÃ´t gÃ©rÃ© par l'utilisateur courant (cas du gÃ©rant)
create or replace function public.user_depot_id()
returns uuid language sql stable security definer set search_path = public as $$
  select depot_id from public.profiles where id = auth.uid();
$$;

-- L'utilisateur courant est-il PROPRIÃ‰TAIRE du dÃ©pÃ´t donnÃ© ?
create or replace function public.owns_depot(d uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.depots where id = d and proprietaire_id = auth.uid());
$$;

-- L'utilisateur courant est-il le GÃ‰RANT affectÃ© Ã  ce dÃ©pÃ´t ?
create or replace function public.is_gerant_of(d uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'gerant' and depot_id = d
  );
$$;

-- ----------------------------------------------------------------------------
--  TRIGGER 1 â€” calculs automatiques sur INSERT dans `mouvements`
-- ----------------------------------------------------------------------------
create or replace function public.calc_mouvement()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_prix_achat numeric;
  v_prix_vente numeric;
begin
  -- RÃ©cupÃ¨re les prix de la boisson concernÃ©e
  select prix_achat, prix_vente into v_prix_achat, v_prix_vente
  from public.boissons where id = new.boisson_id;

  if new.type = 'sortie' then
    -- Prix unitaire = prix saisi Ã  la vente, sinon prix de vente de rÃ©fÃ©rence
    new.prix_unitaire := coalesce(new.prix_unitaire, v_prix_vente);
    new.montant_total := new.quantite * new.prix_unitaire;
    -- Marge = (prix de vente effectif - prix d'achat) * quantitÃ©
    new.marge := (new.prix_unitaire - coalesce(v_prix_achat, 0)) * new.quantite;
  else
    -- EntrÃ©e (reÃ§u) : pas de chiffre d'affaires ni de marge
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
--  TRIGGER 2 â€” calcul automatique du coÃ»t sur INSERT dans `casses`
-- ----------------------------------------------------------------------------
create or replace function public.calc_casse()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_prix_achat numeric;
begin
  select prix_achat into v_prix_achat from public.boissons where id = new.boisson_id;
  -- CoÃ»t de la perte = quantitÃ© cassÃ©e * prix d'achat
  new.cout_total := new.quantite * coalesce(v_prix_achat, 0);
  return new;
end;
$$;

drop trigger if exists trg_calc_casse on public.casses;
create trigger trg_calc_casse
  before insert on public.casses
  for each row execute function public.calc_casse();

-- ----------------------------------------------------------------------------
--  TRIGGER 3 â€” crÃ©er automatiquement un profil Ã  l'inscription d'un user
--   (le rÃ´le/dÃ©pÃ´t par dÃ©faut sont fournis dans les mÃ©tadonnÃ©es d'inscription)
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
--  DÃ‰PÃ”T BOISSONS â€” SCHÃ‰MA SUPABASE (3/5) : VUES & FONCTIONS RPC
-- ============================================================================

-- ----------------------------------------------------------------------------
--  VUE v_stock â€” stock courant par boisson, EN DIRECT
--   stock = SUM(entrÃ©es) âˆ’ SUM(sorties) âˆ’ SUM(casses)
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
--  VUES "POINT" PAR PÃ‰RIODE (pour les graphiques d'Ã©volution du propriÃ©taire)
--   Chaque vue agrÃ¨ge : pÃ©riode, CA (sorties), marge, coÃ»t des casses, marge nette
-- ----------------------------------------------------------------------------

-- AgrÃ©gat journalier
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

-- AgrÃ©gat hebdomadaire (semaine ISO)
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

-- AgrÃ©gat mensuel
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
--  RPC get_point(depot_id, periode) â€” "LE POINT" pour la pÃ©riode courante
--   periode âˆˆ ('jour','semaine','mois')
--   Retourne un JSON : totaux + dÃ©tail par boisson.
--   SECURITY DEFINER + contrÃ´le owns_depot => rÃ©servÃ© au PROPRIÃ‰TAIRE du dÃ©pÃ´t.
-- ----------------------------------------------------------------------------
create or replace function public.get_point(p_depot_id uuid, p_periode text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_debut timestamptz;
  v_fin   timestamptz;
  v_result jsonb;
begin
  -- SÃ©curitÃ© : seul le propriÃ©taire du dÃ©pÃ´t peut consulter le point
  if not public.owns_depot(p_depot_id) then
    raise exception 'AccÃ¨s refusÃ© au point de ce dÃ©pÃ´t';
  end if;

  -- Bornes de la pÃ©riode courante
  if p_periode = 'jour' then
    v_debut := date_trunc('day', now());   v_fin := v_debut + interval '1 day';
  elsif p_periode = 'semaine' then
    v_debut := date_trunc('week', now());  v_fin := v_debut + interval '1 week';
  elsif p_periode = 'mois' then
    v_debut := date_trunc('month', now()); v_fin := v_debut + interval '1 month';
  else
    raise exception 'PÃ©riode invalide (jour|semaine|mois)';
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
    -- DÃ©tail par boisson (CA, quantitÃ© vendue, marge, prix achat/vente)
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
--  VUES SÃ‰CURISÃ‰ES POUR LE GÃ‰RANT (SECURITY DEFINER => masquage de colonnes)
--   Le gÃ©rant lit le catalogue SANS prix_achat ni marge.
--   Chaque vue filtre sur le dÃ©pÃ´t du gÃ©rant courant (user_depot_id()).
-- ----------------------------------------------------------------------------

-- Catalogue cÃ´tÃ© gÃ©rant : aucune donnÃ©e sensible (pas de prix_achat)
create or replace view public.v_boissons_gerant
with (security_invoker = false) as
select id, depot_id, nom, emoji, photo, couleur_casier, prix_vente, seuil_alerte, actif
from public.boissons
where actif = true and depot_id = public.user_depot_id();

-- Stock cÃ´tÃ© gÃ©rant (rÃ©utilise v_stock filtrÃ© sur son dÃ©pÃ´t)
create or replace view public.v_stock_gerant
with (security_invoker = false) as
select boisson_id, depot_id, nom, emoji, couleur_casier, seuil_alerte, stock, en_rupture
from public.v_stock
where depot_id = public.user_depot_id();


-- >>>>>>>>>>>>>>>>>>>> 0004_rls_policies.sql <<<<<<<<<<<<<<<<<<<<
-- ============================================================================
--  DÃ‰PÃ”T BOISSONS â€” SCHÃ‰MA SUPABASE (4/5) : ROW LEVEL SECURITY (RLS)
-- ----------------------------------------------------------------------------
--  Principe :
--   â€¢ GÃ‰RANT      : ne voit/Ã©crit que les donnÃ©es de SON dÃ©pÃ´t, et n'a AUCUN
--                   accÃ¨s en lecture aux marges ni aux prix d'achat.
--                   â†’ il lit le catalogue/stock via les VUES sÃ©curisÃ©es
--                     v_boissons_gerant / v_stock_gerant (colonnes filtrÃ©es).
--                   â†’ il PEUT insÃ©rer des mouvements et des casses.
--                   â†’ il ne peut PAS faire un SELECT direct sur `mouvements`
--                     (donc la colonne `marge` lui reste invisible).
--   â€¢ PROPRIÃ‰TAIRE : lecture/Ã©criture complÃ¨tes (marges, prix, stats) sur les
--                    dÃ©pÃ´ts dont il est proprietaire_id.
-- ============================================================================

-- Active RLS sur toutes les tables
alter table public.depots       enable row level security;
alter table public.profiles     enable row level security;
alter table public.boissons     enable row level security;
alter table public.mouvements   enable row level security;
alter table public.casses       enable row level security;
alter table public.push_tokens  enable row level security;

-- ----------------------------------------------------------------------------
--  PROFILES â€” chacun lit/modifie uniquement SA propre ligne
-- ----------------------------------------------------------------------------
drop policy if exists profiles_self_select on public.profiles;
create policy profiles_self_select on public.profiles
  for select using (id = auth.uid());

drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- ----------------------------------------------------------------------------
--  DEPOTS
--   â€¢ propriÃ©taire : tout sur ses dÃ©pÃ´ts
--   â€¢ gÃ©rant       : lecture de son dÃ©pÃ´t uniquement
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
--   â€¢ propriÃ©taire : CRUD complet (avec prix_achat, marge) sur ses dÃ©pÃ´ts
--   â€¢ gÃ©rant       : PAS de SELECT direct sur la table (prix_achat masquÃ©).
--                    Il lit via la vue v_boissons_gerant.
-- ----------------------------------------------------------------------------
drop policy if exists boissons_proprio_all on public.boissons;
create policy boissons_proprio_all on public.boissons
  for all using (public.owns_depot(depot_id))
  with check (public.owns_depot(depot_id));

-- (Aucune policy SELECT pour le gÃ©rant sur la table de base => accÃ¨s refusÃ©.
--  Le gÃ©rant passe par la vue SECURITY DEFINER v_boissons_gerant.)

-- ----------------------------------------------------------------------------
--  MOUVEMENTS
--   â€¢ propriÃ©taire : SELECT complet (y compris `marge`) sur ses dÃ©pÃ´ts
--   â€¢ gÃ©rant       : INSERT sur son dÃ©pÃ´t UNIQUEMENT (pas de SELECT direct
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
--   â€¢ propriÃ©taire : SELECT/Ã©criture complets sur ses dÃ©pÃ´ts
--   â€¢ gÃ©rant       : INSERT + SELECT de son dÃ©pÃ´t (le coÃ»t lui est visible,
--                    conformÃ©ment au besoin "le coÃ»t s'affiche au gÃ©rant")
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
--  PUSH_TOKENS â€” chacun gÃ¨re uniquement ses propres jetons
-- ----------------------------------------------------------------------------
drop policy if exists push_self_all on public.push_tokens;
create policy push_self_all on public.push_tokens
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ----------------------------------------------------------------------------
--  GRANTS sur les vues sÃ©curisÃ©es du gÃ©rant (vues SECURITY DEFINER)
-- ----------------------------------------------------------------------------
grant select on public.v_boissons_gerant to authenticated;
grant select on public.v_stock_gerant   to authenticated;
grant select on public.v_stock          to authenticated;
grant select on public.v_point_jour      to authenticated;
grant select on public.v_point_semaine   to authenticated;
grant select on public.v_point_mois      to authenticated;


-- >>>>>>>>>>>>>>>>>>>> 0005_realtime.sql <<<<<<<<<<<<<<<<<<<<
-- ============================================================================
--  DÃ‰PÃ”T BOISSONS â€” SCHÃ‰MA SUPABASE (5/5) : TEMPS RÃ‰EL (REALTIME)
-- ----------------------------------------------------------------------------
--  Active Supabase Realtime sur `mouvements` : le tableau de bord du
--  propriÃ©taire reÃ§oit chaque INSERT (notamment type='sortie') en direct.
--  La RLS s'applique aussi au temps rÃ©el : un client ne reÃ§oit que les lignes
--  qu'il est autorisÃ© Ã  lire (donc le propriÃ©taire de son dÃ©pÃ´t).
-- ============================================================================

-- Ajoute les tables Ã  la publication Realtime de Supabase
alter publication supabase_realtime add table public.mouvements;
alter publication supabase_realtime add table public.casses;

-- Pour que les payloads Realtime contiennent l'ancienne valeur lors des
-- updates/deletes (utile pour le suivi), on passe REPLICA IDENTITY Ã  FULL.
alter table public.mouvements replica identity full;
alter table public.casses     replica identity full;

