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
