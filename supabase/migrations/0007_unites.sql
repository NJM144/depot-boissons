-- ============================================================================
--  DÉPÔT BOISSONS — MIGRATION 7 : UNITÉS (bouteille / casier)
-- ----------------------------------------------------------------------------
--  - Vente & réception : au choix en BOUTEILLE ou en CASIER.
--  - Casse : toujours en BOUTEILLES.
--  - Le STOCK est compté en BOUTEILLES (unité de base). Conversion :
--      1 casier = `bouteilles_par_casier` bouteilles (réglable par boisson).
--  - prix_achat / prix_vente sont désormais PAR BOUTEILLE.
-- ============================================================================

-- 1) Nombre de bouteilles par casier (par boisson) ----------------------------
alter table public.boissons
  add column if not exists bouteilles_par_casier integer not null default 12;

-- 2) Mouvements : unité de saisie + quantité convertie en bouteilles ----------
alter table public.mouvements
  add column if not exists unite text not null default 'bouteille'
  check (unite in ('bouteille', 'casier'));
alter table public.mouvements
  add column if not exists quantite_bouteilles integer;

-- 3) Trigger mouvement : convertit en bouteilles + calcule la marge en base ----
create or replace function public.calc_mouvement()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_prix_achat numeric;
  v_prix_vente numeric;
  v_bpc integer;
  v_qte_bt integer;
begin
  select prix_achat, prix_vente, bouteilles_par_casier
    into v_prix_achat, v_prix_vente, v_bpc
  from public.boissons where id = new.boisson_id;

  -- Quantité convertie en bouteilles (1 casier = v_bpc bouteilles)
  v_qte_bt := new.quantite * (case when new.unite = 'casier' then coalesce(v_bpc, 1) else 1 end);
  new.quantite_bouteilles := v_qte_bt;

  if new.type = 'sortie' then
    -- Montant EXACT composé (sinon prix_vente/bouteille x nb bouteilles)
    new.montant_total := coalesce(new.montant_total, v_qte_bt * v_prix_vente);
    new.prix_unitaire := round(new.montant_total / nullif(v_qte_bt, 0), 2); -- prix effectif / bouteille
    -- Marge = montant réel - coût d'achat total (en bouteilles)
    new.marge := new.montant_total - coalesce(v_prix_achat, 0) * v_qte_bt;
  else
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

-- 4) v_stock : stock en BOUTEILLES (entrées/sorties converties ; casse = bouteilles)
create or replace view public.v_stock
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
  select boisson_id, sum(quantite) q from public.casses
  where statut = 'valide' group by boisson_id
) c on c.boisson_id = b.id
where b.actif = true;

-- 5) Vue catalogue gérant : inclut bouteilles_par_casier (prix de vente / bouteille)
create or replace view public.v_boissons_gerant
with (security_invoker = false) as
select id, depot_id, nom, emoji, photo, couleur_casier,
       prix_vente, bouteilles_par_casier, seuil_alerte, actif
from public.boissons
where actif = true and depot_id = public.user_depot_id();

-- 6) get_point : quantité vendue exprimée en BOUTEILLES --------------------------
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
    'total_entrees', coalesce((select sum(quantite_bouteilles) from mouvements
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
        select boisson_id, sum(quantite_bouteilles) q, sum(montant_total) ca, sum(marge) marge
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
