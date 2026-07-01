-- ============================================================================
--  DÉPÔT BOISSONS — MIGRATION 12 : CORRECTION / AJUSTEMENT DU STOCK
-- ----------------------------------------------------------------------------
--  BESOIN : le PATRON doit pouvoir corriger le stock réel d'une boisson
--  (après comptage physique, vol, casse non saisie, erreur…).
--
--  Le stock est CALCULÉ (entrées − sorties − casses). On ne l'écrit donc pas
--  « en dur » : on enregistre un AJUSTEMENT d'inventaire (delta signé, en
--  bouteilles) qui rattrape l'écart. Cet ajustement entre dans v_stock mais
--  N'AFFECTE NI le chiffre d'affaires NI la marge (contrairement à un faux
--  mouvement de vente/réception).
--
--  - Saisie patron : il indique le stock RÉEL compté ; la RPC calcule le delta.
--  - Historisé (qui, quand, avant/après, motif) pour l'audit.
--  Idempotent.
-- ============================================================================

-- 1) Table des ajustements d'inventaire ---------------------------------------
create table if not exists public.ajustements_stock (
  id          uuid primary key default gen_random_uuid(),
  depot_id    uuid not null references public.depots (id) on delete cascade,
  boisson_id  uuid not null references public.boissons (id) on delete cascade,
  stock_avant integer not null,                 -- stock calculé au moment de la correction
  stock_apres integer not null,                 -- stock réel saisi par le patron
  delta       integer not null,                 -- stock_apres - stock_avant (bouteilles)
  motif       text,
  auteur_id   uuid references auth.users (id),
  created_at  timestamptz not null default now()
);
create index if not exists idx_ajust_boisson on public.ajustements_stock (boisson_id, created_at);
create index if not exists idx_ajust_depot   on public.ajustements_stock (depot_id, created_at);

-- 2) RLS : seul le propriétaire du dépôt voit / crée des ajustements -----------
alter table public.ajustements_stock enable row level security;
drop policy if exists ajust_proprio_all on public.ajustements_stock;
create policy ajust_proprio_all on public.ajustements_stock
  for all using (public.owns_depot(depot_id))
  with check (public.owns_depot(depot_id));
-- (Le gérant n'accède pas à cette table en direct ; il voit le stock corrigé
--  via la vue SECURITY DEFINER v_stock_gerant.)

-- 3) v_stock : intègre les ajustements ----------------------------------------
--    On DROP/RECREATE (v_stock_gerant en dépend) puis on redonne les droits.
drop view if exists public.v_stock_gerant;
drop view if exists public.v_stock;

create view public.v_stock
with (security_invoker = true) as
select
  b.id            as boisson_id,
  b.depot_id,
  b.nom,
  b.emoji,
  b.couleur_casier,
  b.seuil_alerte,
  b.bouteilles_par_casier,
  coalesce(e.q, 0)  as total_entrees,
  coalesce(s.q, 0)  as total_sorties,
  coalesce(c.q, 0)  as total_casses,
  coalesce(aj.q, 0) as total_ajustements,
  coalesce(e.q, 0) - coalesce(s.q, 0) - coalesce(c.q, 0) + coalesce(aj.q, 0) as stock,
  (coalesce(e.q, 0) - coalesce(s.q, 0) - coalesce(c.q, 0) + coalesce(aj.q, 0)) <= b.seuil_alerte as en_rupture
from public.boissons b
left join (
  select boisson_id, sum(quantite_bouteilles) q from public.mouvements
  where type = 'entree' and statut = 'valide' group by boisson_id
) e on e.boisson_id = b.id
left join (
  select boisson_id, sum(quantite_bouteilles) q from public.mouvements
  where type = 'sortie' and statut = 'valide' group by boisson_id
) s on s.boisson_id = b.id
left join (
  select boisson_id, sum(quantite) q from public.casses
  where statut = 'valide' group by boisson_id
) c on c.boisson_id = b.id
left join (
  select boisson_id, sum(delta) q from public.ajustements_stock group by boisson_id
) aj on aj.boisson_id = b.id
where b.actif = true;

create view public.v_stock_gerant
with (security_invoker = false) as
select boisson_id, depot_id, nom, emoji, couleur_casier, seuil_alerte, stock, en_rupture
from public.v_stock
where depot_id = public.user_depot_id();

grant select on public.v_stock        to authenticated;
grant select on public.v_stock_gerant to authenticated;

-- 4) RPC corriger_stock : le patron fixe le stock RÉEL d'une boisson ----------
--    p_stock_cible = stock réel compté (en BOUTEILLES, >= 0).
--    Calcule le delta vs stock courant et enregistre l'ajustement.
create or replace function public.corriger_stock(p_boisson_id uuid, p_stock_cible integer, p_motif text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_depot uuid;
  v_avant integer;
  v_delta integer;
  v_id uuid;
begin
  select depot_id into v_depot from public.boissons where id = p_boisson_id;
  if v_depot is null then
    raise exception 'Boisson introuvable';
  end if;
  if not public.owns_depot(v_depot) then
    raise exception 'Accès refusé';
  end if;
  if p_stock_cible is null or p_stock_cible < 0 then
    raise exception 'Le stock réel doit être un nombre positif ou nul';
  end if;

  -- Stock calculé actuel (en bouteilles) — la fonction est SECURITY DEFINER
  -- donc v_stock voit toutes les lignes (RLS contournée par le propriétaire SQL).
  select coalesce(stock, 0) into v_avant from public.v_stock where boisson_id = p_boisson_id;
  v_avant := coalesce(v_avant, 0);
  v_delta := p_stock_cible - v_avant;

  if v_delta = 0 then
    return jsonb_build_object('ok', true, 'delta', 0, 'stock_avant', v_avant,
                              'stock_apres', v_avant, 'message', 'Aucun écart');
  end if;

  insert into public.ajustements_stock
    (depot_id, boisson_id, stock_avant, stock_apres, delta, motif, auteur_id)
  values
    (v_depot, p_boisson_id, v_avant, p_stock_cible, v_delta,
     nullif(trim(coalesce(p_motif, '')), ''), auth.uid())
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'delta', v_delta,
                            'stock_avant', v_avant, 'stock_apres', p_stock_cible);
end;
$$;

grant execute on function public.corriger_stock(uuid, integer, text) to authenticated;
