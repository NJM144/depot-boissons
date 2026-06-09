-- ============================================================================
--  DÉPÔT BOISSONS — MIGRATION 8 : MODÈLE DE PRIX « PAR CASIER »
-- ----------------------------------------------------------------------------
--  DÉCISION MÉTIER : dans le catalogue, prix_achat ET prix_vente sont des
--  prix PAR CASIER (c'est ainsi que le patron raisonne et saisit). Le prix
--  d'UNE bouteille = prix_casier / bouteilles_par_casier (bpc).
--
--  1) MARGE D'UNE VENTE : montant encaissé − (prix_achat/bpc) × bouteilles.
--     Avant, prix_achat (un prix de casier) était multiplié par un nombre de
--     bouteilles → coût énorme → marges très négatives. Corrigé ici.
--  2) CASSE : déclarable en BOUTEILLE ou en CASIER ; coût = (prix_achat/bpc)
--     × bouteilles cassées.
--  3) RÉCEPTION : le gérant saisit le PRIX D'ACHAT TOTAL payé. À la VALIDATION
--     par le patron, le prix_achat catalogue (PAR CASIER) devient
--     montant_total / nombre_de_casiers_reçus. Le gérant propose, le patron acte.
--  4) BACKFILL : on recalcule UNE FOIS marge (ventes) et cout_total (casses)
--     des lignes existantes à partir des prix catalogue ACTUELS, pour que les
--     cartes, le détail par boisson ET le graphique d'évolution soient justes.
--     >>> À exécuter APRÈS avoir corrigé les prix du catalogue (script
--         scripts/poser-prix-casier.mjs) pour que le backfill parte du bon prix.
--
--  Idempotent : peut être relancé sans risque.
-- ============================================================================

-- 1) CASSE : unité de saisie + quantité convertie en bouteilles ----------------
alter table public.casses
  add column if not exists unite text not null default 'bouteille'
  check (unite in ('bouteille', 'casier'));
alter table public.casses
  add column if not exists quantite_bouteilles integer;

-- 2) Trigger casse : convertit en bouteilles + coût au prix d'achat PAR BOUTEILLE
create or replace function public.calc_casse()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_prix_achat numeric;
  v_bpc integer;
begin
  select prix_achat, bouteilles_par_casier into v_prix_achat, v_bpc
  from public.boissons where id = new.boisson_id;
  v_bpc := coalesce(nullif(v_bpc, 0), 1);   -- jamais 0 (évite la division par zéro)

  new.quantite_bouteilles :=
    new.quantite * (case when new.unite = 'casier' then v_bpc else 1 end);
  -- prix_achat est PAR CASIER → coût d'une bouteille = prix_achat / bpc
  new.cout_total := new.quantite_bouteilles * (coalesce(v_prix_achat, 0) / v_bpc);
  return new;
end;
$$;

drop trigger if exists trg_calc_casse on public.casses;
create trigger trg_calc_casse
  before insert or update on public.casses
  for each row execute function public.calc_casse();

-- 3) Trigger mouvement : prix catalogue PAR CASIER → on divise par bpc ---------
--    SORTIE  : montant encaissé (clavier) ; marge = montant − (achat/bpc)×bt.
--    ENTRÉE  : montant_total = prix d'achat TOTAL payé (n'entre pas dans le CA).
--              prix_unitaire = prix PAR CASIER proposé = montant / nb_casiers.
create or replace function public.calc_mouvement()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_prix_achat numeric;
  v_prix_vente numeric;
  v_bpc integer;
  v_qte_bt integer;
  v_casiers numeric;
begin
  select prix_achat, prix_vente, bouteilles_par_casier
    into v_prix_achat, v_prix_vente, v_bpc
  from public.boissons where id = new.boisson_id;
  v_bpc := coalesce(nullif(v_bpc, 0), 1);

  v_qte_bt := new.quantite * (case when new.unite = 'casier' then v_bpc else 1 end);
  new.quantite_bouteilles := v_qte_bt;

  if new.type = 'sortie' then
    -- prix de vente d'une bouteille = prix_vente (casier) / bpc
    new.montant_total := coalesce(new.montant_total, v_qte_bt * (coalesce(v_prix_vente, 0) / v_bpc));
    new.prix_unitaire := round(new.montant_total / nullif(v_qte_bt, 0), 2);
    new.marge := new.montant_total - (coalesce(v_prix_achat, 0) / v_bpc) * v_qte_bt;
  else
    -- RÉCEPTION : montant payé (ou prix catalogue × bouteilles si rien saisi).
    new.montant_total := coalesce(new.montant_total, v_qte_bt * (coalesce(v_prix_achat, 0) / v_bpc));
    -- prix_unitaire = prix PAR CASIER proposé = montant total / nombre de casiers
    v_casiers := v_qte_bt::numeric / v_bpc;
    new.prix_unitaire := round(new.montant_total / nullif(v_casiers, 0), 2);
    new.marge := 0;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_calc_mouvement on public.mouvements;
create trigger trg_calc_mouvement
  before insert or update on public.mouvements
  for each row execute function public.calc_mouvement();

-- 4) Quand le PATRON valide une RÉCEPTION : le prix d'achat catalogue (PAR
--    CASIER) devient le prix unitaire proposé. Ne se déclenche QU'À la
--    transition vers 'valide' : lui seul change le prix.
create or replace function public.appliquer_prix_achat_reception()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.type = 'entree' and new.statut = 'valide'
     and (tg_op = 'INSERT' or old.statut is distinct from 'valide')
     and new.prix_unitaire is not null and new.prix_unitaire > 0 then
    update public.boissons
      set prix_achat = new.prix_unitaire   -- prix PAR CASIER
      where id = new.boisson_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prix_achat_reception on public.mouvements;
create trigger trg_prix_achat_reception
  after insert or update on public.mouvements
  for each row execute function public.appliquer_prix_achat_reception();

-- 5) v_stock : casse comptée en BOUTEILLES (quantite_bouteilles) ---------------
--    On SUPPRIME puis RECRÉE (v_stock_gerant dépend de v_stock) et on regrant.
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
  coalesce(e.q, 0) - coalesce(s.q, 0) - coalesce(c.q, 0) as stock,
  (coalesce(e.q, 0) - coalesce(s.q, 0) - coalesce(c.q, 0)) <= b.seuil_alerte as en_rupture
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
  -- coalesce : les casses créées avant cette migration n'ont pas quantite_bouteilles
  select boisson_id, sum(coalesce(quantite_bouteilles, quantite)) q from public.casses
  where statut = 'valide' group by boisson_id
) c on c.boisson_id = b.id
where b.actif = true;

create view public.v_stock_gerant
with (security_invoker = false) as
select boisson_id, depot_id, nom, emoji, couleur_casier, seuil_alerte, stock, en_rupture
from public.v_stock
where depot_id = public.user_depot_id();

grant select on public.v_stock        to authenticated;
grant select on public.v_stock_gerant to authenticated;

-- 6) BACKFILL des lignes existantes (prix catalogue ACTUELS, modèle casier) ----
--    Recalcule marge (ventes) et cout_total (casses) pour que cartes + détail +
--    graphique soient cohérents. Sans risque de relance (résultat identique).
update public.mouvements m
set marge = m.montant_total
          - (coalesce(b.prix_achat, 0) / coalesce(nullif(b.bouteilles_par_casier, 0), 1))
            * coalesce(m.quantite_bouteilles, m.quantite)
from public.boissons b
where b.id = m.boisson_id and m.type = 'sortie';

update public.casses c
set cout_total = coalesce(c.quantite_bouteilles, c.quantite)
               * (coalesce(b.prix_achat, 0) / coalesce(nullif(b.bouteilles_par_casier, 0), 1))
from public.boissons b
where b.id = c.boisson_id;
