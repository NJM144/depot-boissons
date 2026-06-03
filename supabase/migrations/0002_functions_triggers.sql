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
