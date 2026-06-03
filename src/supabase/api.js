// ============================================================================
//  API SUPABASE — accès aux données (MODE SUPABASE)
// ----------------------------------------------------------------------------
//  Regroupe toutes les requêtes : catalogue, mouvements, casses, stock, point
//  périodique, temps réel et jetons push. La RLS du serveur garantit que :
//   - le gérant n'obtient jamais prix_achat ni marge,
//   - chacun ne voit que les données de son dépôt.
// ============================================================================

import { supabase } from './client.js'

// ----------------------------------------------------------------------------
//  CATALOGUE
// ----------------------------------------------------------------------------

// Côté GÉRANT : vue sécurisée (sans prix_achat ni marge)
export async function listerBoissonsGerant() {
  const { data, error } = await supabase
    .from('v_boissons_gerant')
    .select('*')
    .order('couleur_casier')
  if (error) throw error
  // Harmonise les noms de champs avec le reste de l'app (camelCase)
  return (data || []).map(normaliserBoisson)
}

// Côté PROPRIÉTAIRE : table complète (avec prix_achat / prix_vente)
export async function listerBoissonsProprio(depotId) {
  const { data, error } = await supabase
    .from('boissons')
    .select('*')
    .eq('depot_id', depotId)
    .eq('actif', true)
    .order('nom')
  if (error) throw error
  return (data || []).map(normaliserBoisson)
}

export async function ajouterBoisson(depotId, b) {
  const { error } = await supabase.from('boissons').insert({
    depot_id: depotId,
    nom: b.nom,
    emoji: b.emoji || '🥤',
    photo: b.photo || null,
    couleur_casier: b.couleurCasier || '#3b82f6',
    prix_achat: Number(b.prixAchat) || 0,
    prix_vente: Number(b.prixVente) || 0,
    seuil_alerte: Number(b.seuilAlerte) || 5,
  })
  if (error) throw error
}

export async function modifierBoisson(id, champs) {
  const { error } = await supabase
    .from('boissons')
    .update({
      nom: champs.nom,
      emoji: champs.emoji,
      photo: champs.photo,
      couleur_casier: champs.couleurCasier,
      prix_achat: Number(champs.prixAchat) || 0,
      prix_vente: Number(champs.prixVente) || 0,
      seuil_alerte: Number(champs.seuilAlerte) || 0,
    })
    .eq('id', id)
  if (error) throw error
}

export async function supprimerBoisson(id) {
  const { error } = await supabase.from('boissons').update({ actif: false }).eq('id', id)
  if (error) throw error
}

// Convertit une ligne SQL (snake_case) vers le format de l'app (camelCase)
function normaliserBoisson(r) {
  return {
    id: r.id,
    depotId: r.depot_id,
    nom: r.nom,
    emoji: r.emoji,
    photo: r.photo,
    couleurCasier: r.couleur_casier,
    prixAchat: r.prix_achat,       // undefined côté gérant (colonne masquée)
    prixVente: r.prix_vente,
    prixReference: r.prix_vente,   // alias utilisé par le clavier monétaire
    seuilAlerte: r.seuil_alerte,
    actif: r.actif,
  }
}

// ----------------------------------------------------------------------------
//  MOUVEMENTS (entrées / sorties)
// ----------------------------------------------------------------------------

// Enregistre une entrée (reçu) ou une sortie (vente).
//  - montant : total composé au clavier monétaire (utilisé pour les sorties)
export async function ajouterMouvement({ depotId, boissonId, type, quantite, montant, gerantId }) {
  // Le trigger SQL recalcule montant_total et marge. Pour une sortie, on fournit
  // le prix unitaire = total / quantité (le gérant compose un montant global).
  const prixUnitaire = type === 'sortie' && quantite > 0 ? Number((montant / quantite).toFixed(2)) : null
  const { error } = await supabase.from('mouvements').insert({
    depot_id: depotId,
    boisson_id: boissonId,
    type,
    quantite,
    prix_unitaire: prixUnitaire,
    gerant_id: gerantId || null,
  })
  if (error) throw error
}

// Liste les mouvements (PROPRIÉTAIRE — inclut marge). Filtres optionnels.
export async function listerMouvements(depotId, filtres = {}) {
  let q = supabase
    .from('mouvements')
    .select('*')
    .eq('depot_id', depotId)
    .order('created_at', { ascending: false })

  if (filtres.boissonId) q = q.eq('boisson_id', filtres.boissonId)
  if (filtres.type) q = q.eq('type', filtres.type)
  if (filtres.dateDebut) q = q.gte('created_at', filtres.dateDebut)
  if (filtres.dateFin) q = q.lte('created_at', filtres.dateFin)

  const { data, error } = await q
  if (error) throw error
  return data || []
}

// ----------------------------------------------------------------------------
//  CASSES (pertes)
// ----------------------------------------------------------------------------
export async function ajouterCasse({ depotId, boissonId, quantite, gerantId }) {
  const { error } = await supabase.from('casses').insert({
    depot_id: depotId,
    boisson_id: boissonId,
    quantite,
    gerant_id: gerantId || null,
  })
  if (error) throw error
}

// ----------------------------------------------------------------------------
//  STOCK
// ----------------------------------------------------------------------------
export async function calculerStocks(depotId) {
  const { data, error } = await supabase
    .from('v_stock')
    .select('*')
    .eq('depot_id', depotId)
  if (error) throw error
  return (data || []).map((r) => ({
    id: r.boisson_id,
    nom: r.nom,
    emoji: r.emoji,
    couleurCasier: r.couleur_casier,
    stock: r.stock,
    enRupture: r.en_rupture,
    actif: true,
  }))
}

// ----------------------------------------------------------------------------
//  LE POINT (jour / semaine / mois) — via RPC get_point
// ----------------------------------------------------------------------------
export async function getPoint(depotId, periode) {
  const { data, error } = await supabase.rpc('get_point', {
    p_depot_id: depotId,
    p_periode: periode, // 'jour' | 'semaine' | 'mois'
  })
  if (error) throw error
  return data
}

// Historique agrégé pour les graphiques (depuis les vues v_point_*)
export async function pointHistorique(depotId, periode) {
  const vue = { jour: 'v_point_jour', semaine: 'v_point_semaine', mois: 'v_point_mois' }[periode]
  const { data, error } = await supabase
    .from(vue)
    .select('*')
    .eq('depot_id', depotId)
    .order('periode')
  if (error) throw error
  return data || []
}

// ----------------------------------------------------------------------------
//  TEMPS RÉEL — abonnement aux ventes (INSERT sortie) d'un dépôt
//   onVente(mouvement) est appelé à chaque nouvelle vente.
//   Retourne une fonction de désabonnement.
// ----------------------------------------------------------------------------
export function abonnerVentes(depotId, onVente) {
  const canal = supabase
    .channel(`ventes-${depotId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'mouvements',
        filter: `depot_id=eq.${depotId}`,
      },
      (payload) => {
        if (payload.new?.type === 'sortie') onVente(payload.new)
      }
    )
    .subscribe()
  return () => supabase.removeChannel(canal)
}

// ----------------------------------------------------------------------------
//  JETONS PUSH (FCM)
// ----------------------------------------------------------------------------
export async function enregistrerPushToken(userId, token, platform = 'android') {
  const { error } = await supabase
    .from('push_tokens')
    .upsert({ user_id: userId, token, platform, updated_at: new Date().toISOString() })
  if (error) throw error
}
