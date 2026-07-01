-- ============================================================================
--  DÉPÔT BOISSONS — MIGRATION 14 : VENTE À CRÉDIT / CASH (clients enregistrés)
-- ----------------------------------------------------------------------------
--  BESOIN : pour un client RÉGULIER, le gérant indique si la vente est payée
--  CASH ou à CRÉDIT. Choix comptable retenu : la vente à crédit compte
--  NORMALEMENT (stock, marge, CA dès la vente) ; le crédit est suivi À PART
--  comme une DETTE du client, que le patron « encaisse » quand le client paie.
--
--   - mouvements.a_credit       : true = vente à crédit (non encore payée).
--   - mouvements.credit_regle   : true = le crédit a été remboursé/encaissé.
--   - Dette d'un client = Σ montant_total des ventes validées a_credit=true
--                          et credit_regle=false (TOUTE période confondue).
--   - Une vente de passage est toujours cash (jamais à crédit).
--  Idempotent.
-- ============================================================================

-- 1) Colonnes de paiement sur les ventes --------------------------------------
alter table public.mouvements
  add column if not exists a_credit boolean not null default false;
alter table public.mouvements
  add column if not exists credit_regle boolean not null default false;
alter table public.mouvements
  add column if not exists credit_regle_at timestamptz;

-- Index pour le calcul rapide des dettes par client
create index if not exists idx_mouvements_credit
  on public.mouvements (client_id, a_credit, credit_regle)
  where a_credit = true;

-- 2) RPC PATRON : ventes par client + DETTE (crédit dû) -----------------------
--    On enrichit get_ventes_par_client avec, pour chaque client, le total
--    encore dû (credit_du, toute période) et on ajoute un total global.
create or replace function public.get_ventes_par_client(p_depot_id uuid, p_debut date, p_fin date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_debut timestamptz; v_fin timestamptz;
  v_clients jsonb; v_passage jsonb; v_non_attr jsonb; v_credit_total numeric;
begin
  if not public.owns_depot(p_depot_id) then
    raise exception 'Accès refusé';
  end if;

  v_debut := coalesce(p_debut, current_date)::timestamptz;
  v_fin   := (coalesce(p_fin, current_date) + 1)::timestamptz;  -- borne haute exclue

  -- Total par client régulier (ventes sur la période) + DETTE (toute période)
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', cl.id, 'nom', cl.nom, 'photo', cl.photo, 'telephone', cl.telephone,
           'total', coalesce(v.total, 0), 'nb_ventes', coalesce(v.nb, 0),
           'derniere_vente', v.derniere,
           'credit_du', coalesce(cr.du, 0)
         ) order by coalesce(cr.du, 0) desc, coalesce(v.total, 0) desc, cl.created_at), '[]'::jsonb)
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
  left join (
    -- dette = crédit validé non encore réglé, TOUTE période
    select client_id, sum(montant_total) du
    from public.mouvements
    where depot_id = p_depot_id and type = 'sortie' and statut = 'valide'
      and a_credit = true and credit_regle = false and client_id is not null
    group by client_id
  ) cr on cr.client_id = cl.id
  where cl.depot_id = p_depot_id and cl.actif = true;

  -- Dette totale du dépôt (tous clients)
  select coalesce(sum(montant_total), 0) into v_credit_total
  from public.mouvements
  where depot_id = p_depot_id and type = 'sortie' and statut = 'valide'
    and a_credit = true and credit_regle = false;

  -- Ventes de passage (one-shot, toujours cash)
  select jsonb_build_object('total', coalesce(sum(montant_total), 0), 'nb_ventes', count(*))
    into v_passage
  from public.mouvements
  where depot_id = p_depot_id and type = 'sortie' and statut = 'valide'
    and client_passage = true
    and created_at >= v_debut and created_at < v_fin;

  -- Ventes sans client
  select jsonb_build_object('total', coalesce(sum(montant_total), 0), 'nb_ventes', count(*))
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
    'non_attribue', v_non_attr,
    'credit_total', v_credit_total
  );
end;
$$;

grant execute on function public.get_ventes_par_client(uuid, date, date) to authenticated;

-- 3) RPC : détail des crédits non réglés d'un client (pour l'écran patron) ----
create or replace function public.get_credits_client(p_client_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_depot uuid; v_rows jsonb;
begin
  select depot_id into v_depot from public.clients where id = p_client_id;
  if v_depot is null or not public.owns_depot(v_depot) then
    raise exception 'Accès refusé';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', m.id, 'montant', m.montant_total, 'date', m.created_at,
           'boisson', b.nom, 'emoji', b.emoji, 'quantite', m.quantite, 'unite', m.unite
         ) order by m.created_at desc), '[]'::jsonb)
    into v_rows
  from public.mouvements m
  left join public.boissons b on b.id = m.boisson_id
  where m.depot_id = v_depot and m.type = 'sortie' and m.statut = 'valide'
    and m.client_id = p_client_id and m.a_credit = true and m.credit_regle = false;
  return v_rows;
end;
$$;

grant execute on function public.get_credits_client(uuid) to authenticated;
