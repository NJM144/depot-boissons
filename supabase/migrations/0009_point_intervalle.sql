-- ============================================================================
--  DÉPÔT BOISSONS — MIGRATION 9 : LE POINT SUR UNE PLAGE DE DATES LIBRE
-- ----------------------------------------------------------------------------
--  Même calcul que get_point (CA, marge, casses, marge nette, détail par
--  boisson) mais entre deux dates choisies : du jour p_debut au jour p_fin
--  INCLUS. Sert au filtre « Du … au … » de la vue patron.
--  Idempotent.
-- ============================================================================

create or replace function public.get_point_intervalle(
  p_depot_id uuid, p_debut date, p_fin date
) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_debut timestamptz; v_fin timestamptz; v_result jsonb;
begin
  if not public.owns_depot(p_depot_id) then
    raise exception 'Accès refusé au point de ce dépôt';
  end if;
  if p_debut is null or p_fin is null then
    raise exception 'Dates de début et de fin obligatoires';
  end if;
  if p_fin < p_debut then
    raise exception 'La date de fin doit être après la date de début';
  end if;

  -- borne basse = début du jour p_debut ; borne haute = lendemain de p_fin (exclu)
  v_debut := date_trunc('day', p_debut::timestamptz);
  v_fin   := date_trunc('day', p_fin::timestamptz) + interval '1 day';

  select jsonb_build_object(
    'periode', 'intervalle', 'debut', v_debut, 'fin', v_fin,
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

grant execute on function public.get_point_intervalle(uuid, date, date) to authenticated;
