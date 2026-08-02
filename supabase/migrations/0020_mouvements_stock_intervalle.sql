-- ============================================================================
--  DÉPÔT BOISSONS — MIGRATION 20 : MOUVEMENTS DE STOCK SUR UNE PLAGE DE DATES
-- ----------------------------------------------------------------------------
--  BESOIN : dans l'onglet Stock du patron, filtrer « Du … au … » pour voir,
--  PAR BOISSON, ce qui a été reçu / vendu / cassé / ajusté sur la période
--  (≠ get_point_intervalle qui ne détaille que les ventes pour le CA/marge).
--  Même convention de bornes que get_point_intervalle : p_fin est INCLUS.
--  Idempotent.
-- ============================================================================

create or replace function public.mouvements_stock_intervalle(
  p_depot_id uuid, p_debut date, p_fin date
) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_debut timestamptz; v_fin timestamptz; v_result jsonb;
begin
  if not public.owns_depot(p_depot_id) then
    raise exception 'Accès refusé au stock de ce dépôt';
  end if;
  if p_debut is null or p_fin is null then
    raise exception 'Dates de début et de fin obligatoires';
  end if;
  if p_fin < p_debut then
    raise exception 'La date de fin doit être après la date de début';
  end if;

  v_debut := date_trunc('day', p_debut::timestamptz);
  v_fin   := date_trunc('day', p_fin::timestamptz) + interval '1 day';

  select jsonb_build_object(
    'debut', v_debut, 'fin', v_fin,
    'detail', coalesce((
      select jsonb_agg(jsonb_build_object(
        'boisson_id', b.id, 'nom', b.nom, 'emoji', b.emoji,
        'bouteilles_par_casier', b.bouteilles_par_casier,
        'entrees', coalesce(e.q, 0),
        'sorties', coalesce(s.q, 0),
        'chiffre_affaires', coalesce(s.ca, 0),
        'marge', coalesce(s.marge, 0),
        'casses', coalesce(c.q, 0),
        'casses_cout', coalesce(c.cout, 0),
        'ajustements', coalesce(a.q, 0),
        'variation_nette',
          coalesce(e.q, 0) - coalesce(s.q, 0) - coalesce(c.q, 0) + coalesce(a.q, 0)
      ) order by b.nom)
      from public.boissons b
      left join (
        select boisson_id, sum(quantite_bouteilles) q from public.mouvements
        where depot_id = p_depot_id and type = 'entree' and statut = 'valide'
          and created_at >= v_debut and created_at < v_fin
        group by boisson_id
      ) e on e.boisson_id = b.id
      left join (
        select boisson_id, sum(quantite_bouteilles) q, sum(montant_total) ca, sum(marge) marge
        from public.mouvements
        where depot_id = p_depot_id and type = 'sortie' and statut = 'valide'
          and created_at >= v_debut and created_at < v_fin
        group by boisson_id
      ) s on s.boisson_id = b.id
      left join (
        select boisson_id, sum(quantite) q, sum(cout_total) cout from public.casses
        where depot_id = p_depot_id and statut = 'valide'
          and created_at >= v_debut and created_at < v_fin
        group by boisson_id
      ) c on c.boisson_id = b.id
      left join (
        select boisson_id, sum(delta) q from public.ajustements_stock
        where depot_id = p_depot_id
          and created_at >= v_debut and created_at < v_fin
        group by boisson_id
      ) a on a.boisson_id = b.id
      where b.depot_id = p_depot_id and b.actif = true
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.mouvements_stock_intervalle(uuid, date, date) to authenticated;
