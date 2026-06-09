-- ============================================================================
--  DÉPÔT BOISSONS — MIGRATION 10 : ACTIONNAIRES & PARTAGE DES BÉNÉFICES
-- ----------------------------------------------------------------------------
--  MODÈLE :
--   - Le dépôt a un FONDS DE COMMERCE (valeur totale du commerce).
--   - Chaque actionnaire a un APPORT et un CODE personnel.
--     part = apport / fonds_de_commerce  (le patron garde la part restante).
--   - Chaque actionnaire a ses propres CHARGES (par mois), déduites de SON
--     bénéfice à lui uniquement.
--   - Bénéfice net actionnaire (mois M) =
--        part × marge_nette_du_commerce(M)  −  ses charges(M)
--     où marge_nette_du_commerce(M) = Σ marge des ventes − Σ coût des casses.
--   - L'actionnaire consulte son compte via la RPC get_compte_actionnaire
--     (authentifié par son CODE — pas de compte auth dédié).
--  Idempotent.
-- ============================================================================

-- 1) FONDS DE COMMERCE sur le dépôt -------------------------------------------
alter table public.depots
  add column if not exists fond_de_commerce numeric not null default 0;

-- 2) Table ACTIONNAIRES --------------------------------------------------------
create table if not exists public.actionnaires (
  id          uuid primary key default gen_random_uuid(),
  depot_id    uuid not null references public.depots (id) on delete cascade,
  nom         text not null,
  apport      numeric not null default 0,
  code        text not null,
  actif       boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (depot_id, code)
);
create index if not exists idx_actionnaires_depot on public.actionnaires (depot_id);

-- 3) Table CHARGES propres à chaque actionnaire (par mois) --------------------
create table if not exists public.charges_actionnaire (
  id              uuid primary key default gen_random_uuid(),
  depot_id        uuid not null references public.depots (id) on delete cascade,
  actionnaire_id  uuid not null references public.actionnaires (id) on delete cascade,
  libelle         text not null,
  montant         numeric not null default 0,
  mois            date not null,              -- 1er jour du mois concerné
  created_at      timestamptz not null default now()
);
create index if not exists idx_charges_act on public.charges_actionnaire (actionnaire_id, mois);

-- 4) RLS : seul le propriétaire du dépôt gère actionnaires & charges ----------
alter table public.actionnaires        enable row level security;
alter table public.charges_actionnaire enable row level security;

drop policy if exists actionnaires_proprio_all on public.actionnaires;
create policy actionnaires_proprio_all on public.actionnaires
  for all using (public.owns_depot(depot_id))
  with check (public.owns_depot(depot_id));

drop policy if exists charges_act_proprio_all on public.charges_actionnaire;
create policy charges_act_proprio_all on public.charges_actionnaire
  for all using (public.owns_depot(depot_id))
  with check (public.owns_depot(depot_id));
-- (Pas de policy pour anon/actionnaire : l'accès actionnaire passe par la RPC
--  SECURITY DEFINER ci-dessous, authentifiée par le CODE.)

-- 5) RPC : le compte d'un actionnaire pour un mois donné ----------------------
--    p_code : code personnel ; p_mois : une date du mois voulu (ex 1er jour).
--    Renvoie { trouve, nom, apport, fond_de_commerce, part, part_pct, mois,
--              marge_commerce, benefice_brut, charges, charges_detail,
--              benefice_net }.
create or replace function public.get_compte_actionnaire(p_code text, p_mois date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  a record;
  v_fond numeric;
  v_debut timestamptz; v_fin timestamptz;
  v_part numeric;
  v_marge numeric; v_casse numeric; v_marge_nette numeric;
  v_brut numeric; v_charges numeric; v_detail jsonb;
begin
  select * into a from public.actionnaires
   where code = p_code and actif = true limit 1;
  if not found then
    return jsonb_build_object('trouve', false);
  end if;

  select fond_de_commerce into v_fond from public.depots where id = a.depot_id;
  v_part := case when coalesce(v_fond, 0) > 0 then a.apport / v_fond else 0 end;

  v_debut := date_trunc('month', coalesce(p_mois, current_date)::timestamptz);
  v_fin   := v_debut + interval '1 month';

  -- Marge nette du COMMERCE sur le mois (ventes validées − coût des casses)
  v_marge := coalesce((select sum(marge) from public.mouvements
      where depot_id = a.depot_id and type = 'sortie' and statut = 'valide'
        and created_at >= v_debut and created_at < v_fin), 0);
  v_casse := coalesce((select sum(cout_total) from public.casses
      where depot_id = a.depot_id and statut = 'valide'
        and created_at >= v_debut and created_at < v_fin), 0);
  v_marge_nette := v_marge - v_casse;

  v_brut := v_part * v_marge_nette;

  -- Charges propres à cet actionnaire pour ce mois
  v_charges := coalesce((select sum(montant) from public.charges_actionnaire
      where actionnaire_id = a.id and mois = v_debut::date), 0);
  v_detail := coalesce((select jsonb_agg(jsonb_build_object('libelle', libelle, 'montant', montant) order by created_at)
      from public.charges_actionnaire
      where actionnaire_id = a.id and mois = v_debut::date), '[]'::jsonb);

  return jsonb_build_object(
    'trouve', true,
    'nom', a.nom,
    'apport', a.apport,
    'fond_de_commerce', coalesce(v_fond, 0),
    'part', v_part,
    'part_pct', round(v_part * 100, 2),
    'mois', to_char(v_debut, 'YYYY-MM'),
    'marge_commerce', v_marge_nette,
    'benefice_brut', round(v_brut, 2),
    'charges', v_charges,
    'charges_detail', v_detail,
    'benefice_net', round(v_brut - v_charges, 2)
  );
end;
$$;

grant execute on function public.get_compte_actionnaire(text, date) to anon, authenticated;

-- 6) RPC PATRON : marge du mois + bénéfice de TOUS les actionnaires -----------
--    Pour l'onglet de gestion (un seul appel). Protégé par owns_depot.
create or replace function public.get_benefices_actionnaires(p_depot_id uuid, p_mois date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_fond numeric; v_debut timestamptz; v_fin timestamptz;
  v_marge numeric; v_casse numeric; v_marge_nette numeric;
  v_total_parts numeric; v_lignes jsonb;
begin
  if not public.owns_depot(p_depot_id) then
    raise exception 'Accès refusé';
  end if;

  select fond_de_commerce into v_fond from public.depots where id = p_depot_id;
  v_debut := date_trunc('month', coalesce(p_mois, current_date)::timestamptz);
  v_fin   := v_debut + interval '1 month';

  v_marge := coalesce((select sum(marge) from public.mouvements
      where depot_id = p_depot_id and type = 'sortie' and statut = 'valide'
        and created_at >= v_debut and created_at < v_fin), 0);
  v_casse := coalesce((select sum(cout_total) from public.casses
      where depot_id = p_depot_id and statut = 'valide'
        and created_at >= v_debut and created_at < v_fin), 0);
  v_marge_nette := v_marge - v_casse;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', a.id, 'nom', a.nom, 'apport', a.apport, 'code', a.code, 'actif', a.actif,
           'part_pct', round(case when coalesce(v_fond,0) > 0 then a.apport / v_fond * 100 else 0 end, 2),
           'benefice_brut', round(case when coalesce(v_fond,0) > 0 then a.apport / v_fond * v_marge_nette else 0 end, 2),
           'charges', coalesce(c.somme, 0),
           'benefice_net', round((case when coalesce(v_fond,0) > 0 then a.apport / v_fond * v_marge_nette else 0 end) - coalesce(c.somme, 0), 2)
         ) order by a.created_at), '[]'::jsonb),
         coalesce(sum(a.apport), 0)
    into v_lignes, v_total_parts
  from public.actionnaires a
  left join (
    select actionnaire_id, sum(montant) somme from public.charges_actionnaire
    where mois = v_debut::date group by actionnaire_id
  ) c on c.actionnaire_id = a.id
  where a.depot_id = p_depot_id;

  return jsonb_build_object(
    'mois', to_char(v_debut, 'YYYY-MM'),
    'fond_de_commerce', coalesce(v_fond, 0),
    'marge_commerce', v_marge_nette,
    'total_apports', v_total_parts,
    'part_actionnaires_pct', round(case when coalesce(v_fond,0) > 0 then v_total_parts / v_fond * 100 else 0 end, 2),
    'actionnaires', v_lignes
  );
end;
$$;

grant execute on function public.get_benefices_actionnaires(uuid, date) to authenticated;
