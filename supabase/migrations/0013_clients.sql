-- ============================================================================
--  DÉPÔT BOISSONS — MIGRATION 13 : CLIENTS & ATTRIBUTION DES VENTES
-- ----------------------------------------------------------------------------
--  BESOIN : le GÉRANT (analphabète) peut ajouter des clients (nom dicté à la
--  voix + photo) et attribuer chaque vente à un client. Une catégorie
--  « client de passage » (one-shot, anonyme) permet d'enregistrer une vente
--  ponctuelle sans identifier personne.
--
--  MODÈLE :
--   - table `clients` : clients RÉGULIERS du dépôt (nom, photo, tél).
--   - `mouvements.client_id`      : la vente est attribuée à ce client régulier.
--   - `mouvements.client_passage` : true = vente à un client de passage (one-shot).
--     (régulier => client_id renseigné ; passage => client_passage=true ; sinon
--      aucun des deux = vente non attribuée, comme avant.)
--   - Les réceptions (entree) n'ont jamais de client.
--  Idempotent.
-- ============================================================================

-- 1) Table CLIENTS (réguliers) ------------------------------------------------
create table if not exists public.clients (
  id          uuid primary key default gen_random_uuid(),
  depot_id    uuid not null references public.depots (id) on delete cascade,
  nom         text,                              -- dicté à la voix (peut être null si photo seule)
  photo       text,                              -- dataURL (prise par le gérant) — sert à le reconnaître
  telephone   text,
  actif       boolean not null default true,
  created_by  uuid references public.profiles (id),
  created_at  timestamptz not null default now()
);
create index if not exists idx_clients_depot on public.clients (depot_id, actif);

-- 2) Colonnes d'attribution sur les mouvements --------------------------------
alter table public.mouvements
  add column if not exists client_id uuid references public.clients (id) on delete set null;
alter table public.mouvements
  add column if not exists client_passage boolean not null default false;
create index if not exists idx_mouvements_client on public.mouvements (client_id);

-- 3) RLS ----------------------------------------------------------------------
alter table public.clients enable row level security;

--  Propriétaire : CRUD complet sur les clients de ses dépôts
drop policy if exists clients_proprio_all on public.clients;
create policy clients_proprio_all on public.clients
  for all using (public.owns_depot(depot_id))
  with check (public.owns_depot(depot_id));

--  Gérant : peut LISTER les clients de son dépôt (pour les choisir à la vente)
drop policy if exists clients_gerant_select on public.clients;
create policy clients_gerant_select on public.clients
  for select using (public.is_gerant_of(depot_id));

--  Gérant : peut AJOUTER un client à son dépôt
drop policy if exists clients_gerant_insert on public.clients;
create policy clients_gerant_insert on public.clients
  for insert with check (
    public.is_gerant_of(depot_id) and (created_by = auth.uid() or created_by is null)
  );

--  Gérant : peut corriger un client qu'il vient de créer (photo/nom)
drop policy if exists clients_gerant_update on public.clients;
create policy clients_gerant_update on public.clients
  for update using (public.is_gerant_of(depot_id) and created_by = auth.uid())
  with check (public.is_gerant_of(depot_id));

-- 4) RPC PATRON : ventes agrégées par client (sur une plage de dates) ----------
--    Renvoie le total acheté + nb de ventes par client régulier, plus le total
--    des ventes « de passage ». Ventes VALIDÉES uniquement.
create or replace function public.get_ventes_par_client(p_depot_id uuid, p_debut date, p_fin date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_debut timestamptz; v_fin timestamptz;
  v_clients jsonb; v_passage jsonb; v_non_attr jsonb;
begin
  if not public.owns_depot(p_depot_id) then
    raise exception 'Accès refusé';
  end if;

  v_debut := coalesce(p_debut, current_date)::timestamptz;
  v_fin   := (coalesce(p_fin, current_date) + 1)::timestamptz;  -- borne haute exclue

  -- Total par client régulier (inclut les clients sans vente sur la période)
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', cl.id, 'nom', cl.nom, 'photo', cl.photo, 'telephone', cl.telephone,
           'total', coalesce(v.total, 0), 'nb_ventes', coalesce(v.nb, 0),
           'derniere_vente', v.derniere
         ) order by coalesce(v.total, 0) desc, cl.created_at), '[]'::jsonb)
    into v_clients
  from public.clients cl
  left join (
    select client_id, sum(montant_total) total, count(*) nb, max(created_at) derniere
    from public.mouvements
    where depot_id = p_depot_id and type = 'sortie' and statut = 'valide'
      and client_id is not null
      and created_at >= v_debut and created_at < v_fin
    group by client_id
  ) v on v.client_id = cl.id
  where cl.depot_id = p_depot_id and cl.actif = true;

  -- Agrégat des ventes de passage (one-shot)
  select jsonb_build_object(
           'total', coalesce(sum(montant_total), 0), 'nb_ventes', count(*))
    into v_passage
  from public.mouvements
  where depot_id = p_depot_id and type = 'sortie' and statut = 'valide'
    and client_passage = true
    and created_at >= v_debut and created_at < v_fin;

  -- Ventes sans client (ni régulier ni passage) — info complémentaire
  select jsonb_build_object(
           'total', coalesce(sum(montant_total), 0), 'nb_ventes', count(*))
    into v_non_attr
  from public.mouvements
  where depot_id = p_depot_id and type = 'sortie' and statut = 'valide'
    and client_id is null and client_passage = false
    and created_at >= v_debut and created_at < v_fin;

  return jsonb_build_object(
    'debut', to_char(v_debut, 'YYYY-MM-DD'),
    'fin', to_char(coalesce(p_fin, current_date), 'YYYY-MM-DD'),
    'clients', v_clients,
    'passage', v_passage,
    'non_attribue', v_non_attr
  );
end;
$$;

grant execute on function public.get_ventes_par_client(uuid, date, date) to authenticated;
