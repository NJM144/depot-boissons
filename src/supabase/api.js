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
    bouteilles_par_casier: Number(b.bouteillesParCasier) || 12,
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
      bouteilles_par_casier: Number(champs.bouteillesParCasier) || 12,
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
    prixAchat: r.prix_achat,       // PAR CASIER ; undefined côté gérant (colonne masquée)
    prixVente: r.prix_vente,       // PAR CASIER
    // prixReference = prix d'UNE bouteille = prix_vente casier / bpc (clavier gérant)
    prixReference: (Number(r.prix_vente) || 0) / (r.bouteilles_par_casier || 12),
    bouteillesParCasier: r.bouteilles_par_casier || 12,
    seuilAlerte: r.seuil_alerte,
    actif: r.actif,
  }
}

// ----------------------------------------------------------------------------
//  MOUVEMENTS (entrées / sorties)
// ----------------------------------------------------------------------------

// Enregistre une entrée (reçu) ou une sortie (vente).
//  - montant : total EXACT composé au clavier monétaire (pour les sorties)
//  - unite   : 'bouteille' | 'casier' (le trigger convertit en bouteilles)
//  La ligne est créée avec statut 'en_attente' (défaut SQL) : le patron validera.
export async function ajouterMouvement({ depotId, boissonId, type, quantite, montant, unite, gerantId }) {
  // Montant EXACT (pas d'arrondi) ; le trigger calcule la marge.
  //  - sortie  : argent reçu (0 si non saisi)
  //  - entrée  : prix d'achat payé ; null => le trigger retombe sur le prix
  //              d'achat catalogue × quantité.
  const montantSaisi = Number(montant) > 0 ? Number(montant) : null
  const montantTotal = type === 'sortie' ? Number(montant) || 0 : montantSaisi
  const { error } = await supabase.from('mouvements').insert({
    depot_id: depotId,
    boisson_id: boissonId,
    type,
    quantite,
    unite: unite || 'bouteille',
    montant_total: montantTotal,
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
  if (filtres.statut) q = q.eq('statut', filtres.statut)
  if (filtres.dateDebut) q = q.gte('created_at', filtres.dateDebut)
  if (filtres.dateFin) q = q.lte('created_at', filtres.dateFin)

  const { data, error } = await q
  if (error) throw error
  return data || []
}

// ----------------------------------------------------------------------------
//  CASSES (pertes)
// ----------------------------------------------------------------------------
export async function ajouterCasse({ depotId, boissonId, quantite, unite, gerantId }) {
  const { error } = await supabase.from('casses').insert({
    depot_id: depotId,
    boisson_id: boissonId,
    quantite,
    unite: unite || 'bouteille', // le trigger convertit en bouteilles
    gerant_id: gerantId || null,
  })
  if (error) throw error
}

// ----------------------------------------------------------------------------
//  VALIDATION PAR LE PATRON (mouvements + casses en attente)
// ----------------------------------------------------------------------------

// Liste TOUT ce qui est en attente de validation (ventes, réceptions, casses),
// enrichi du nom de la boisson, trié du plus récent au plus ancien.
export async function listerEnAttente(depotId) {
  const [mvts, casses, boissons] = await Promise.all([
    supabase.from('mouvements').select('*').eq('depot_id', depotId).eq('statut', 'en_attente'),
    supabase.from('casses').select('*').eq('depot_id', depotId).eq('statut', 'en_attente'),
    supabase.from('boissons').select('id, nom, emoji'),
  ])
  if (mvts.error) throw mvts.error
  if (casses.error) throw casses.error
  const parId = new Map((boissons.data || []).map((b) => [b.id, b]))

  const lignes = [
    ...(mvts.data || []).map((m) => ({
      kind: 'mouvement',
      id: m.id,
      type: m.type, // 'entree' | 'sortie'
      quantite: m.quantite,
      unite: m.unite, // 'bouteille' | 'casier'
      quantiteBouteilles: m.quantite_bouteilles,
      montant: m.montant_total,
      created_at: m.created_at,
      boisson: parId.get(m.boisson_id),
    })),
    ...(casses.data || []).map((c) => ({
      kind: 'casse',
      id: c.id,
      type: 'casse',
      quantite: c.quantite,
      unite: c.unite, // 'bouteille' | 'casier'
      quantiteBouteilles: c.quantite_bouteilles,
      montant: c.cout_total,
      created_at: c.created_at,
      boisson: parId.get(c.boisson_id),
    })),
  ]
  return lignes.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
}

// Nombre d'éléments en attente (pour le badge de l'onglet)
export async function compterEnAttente(depotId) {
  const [m, c] = await Promise.all([
    supabase.from('mouvements').select('id', { count: 'exact', head: true })
      .eq('depot_id', depotId).eq('statut', 'en_attente'),
    supabase.from('casses').select('id', { count: 'exact', head: true })
      .eq('depot_id', depotId).eq('statut', 'en_attente'),
  ])
  return (m.count || 0) + (c.count || 0)
}

// Valide un mouvement (avec correction éventuelle du montant / de la quantité)
export async function validerMouvement(id, { montant, quantite } = {}) {
  const maj = { statut: 'valide' }
  if (quantite != null) maj.quantite = Number(quantite)
  if (montant != null) maj.montant_total = Number(montant) // le trigger recalcule la marge
  const { error } = await supabase.from('mouvements').update(maj).eq('id', id)
  if (error) throw error
}

export async function rejeterMouvement(id) {
  const { error } = await supabase.from('mouvements').update({ statut: 'rejete' }).eq('id', id)
  if (error) throw error
}

// Valide / rejette une casse (correction éventuelle de la quantité)
export async function validerCasse(id, { quantite } = {}) {
  const maj = { statut: 'valide' }
  if (quantite != null) maj.quantite = Number(quantite) // le trigger recalcule le coût
  const { error } = await supabase.from('casses').update(maj).eq('id', id)
  if (error) throw error
}

export async function rejeterCasse(id) {
  const { error } = await supabase.from('casses').update({ statut: 'rejete' }).eq('id', id)
  if (error) throw error
}

// Compteur de canaux : garantit un NOM UNIQUE par abonnement. Sans ça, deux
// composants (ex. ProprietaireApp + AValider) qui s'abonnent au même topic
// récupèrent la MÊME instance de canal déjà souscrite, et le 2ᵉ `.on()` lève
// « cannot add postgres_changes callbacks after subscribe() ».
let _seqCanal = 0

// Abonnement temps réel à TOUT changement (mouvements + casses) du dépôt :
// utilisé par la file de validation pour se rafraîchir en direct.
export function abonnerChangements(depotId, onChange) {
  const canal = supabase
    .channel(`changements-${depotId}-${++_seqCanal}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'mouvements', filter: `depot_id=eq.${depotId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'casses', filter: `depot_id=eq.${depotId}` }, onChange)
    .subscribe()
  return () => supabase.removeChannel(canal)
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

// Le point sur une PLAGE de dates libre (du jour debut au jour fin INCLUS).
//  debut / fin : chaînes 'AAAA-MM-JJ' (issues d'un <input type="date">).
export async function getPointIntervalle(depotId, debut, fin) {
  const { data, error } = await supabase.rpc('get_point_intervalle', {
    p_depot_id: depotId,
    p_debut: debut,
    p_fin: fin,
  })
  if (error) throw error
  return data
}

// Historique JOURNALIER pour la courbe sur une plage (vue v_point_jour filtrée).
export async function pointHistoriqueIntervalle(depotId, debut, fin) {
  const finExclue = new Date(fin + 'T00:00:00')
  finExclue.setDate(finExclue.getDate() + 1) // borne haute = lendemain de "fin"
  const finIso = finExclue.toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('v_point_jour')
    .select('*')
    .eq('depot_id', depotId)
    .gte('periode', debut)
    .lt('periode', finIso)
    .order('periode')
  if (error) throw error
  return data || []
}

// ----------------------------------------------------------------------------
//  TEMPS RÉEL — abonnement aux ventes VALIDÉES d'un dépôt
//   onVente(mouvement) est appelé quand une vente devient 'valide' (le patron
//   l'a validée) — à l'INSERT comme à l'UPDATE. Retourne le désabonnement.
// ----------------------------------------------------------------------------
export function abonnerVentes(depotId, onVente) {
  const traiter = (payload) => {
    const m = payload.new
    if (m?.type === 'sortie' && m?.statut === 'valide') onVente(m)
  }
  const canal = supabase
    .channel(`ventes-${depotId}-${++_seqCanal}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mouvements', filter: `depot_id=eq.${depotId}` }, traiter)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'mouvements', filter: `depot_id=eq.${depotId}` }, traiter)
    .subscribe()
  return () => supabase.removeChannel(canal)
}

// ----------------------------------------------------------------------------
//  ACTIONNAIRES — fonds de commerce, apports, charges, partage des bénéfices
// ----------------------------------------------------------------------------

// Fonds de commerce du dépôt (valeur totale qui sert au calcul des parts)
export async function getFondCommerce(depotId) {
  const { data, error } = await supabase
    .from('depots').select('fond_de_commerce').eq('id', depotId).single()
  if (error) throw error
  return Number(data?.fond_de_commerce) || 0
}
export async function setFondCommerce(depotId, montant) {
  const { error } = await supabase
    .from('depots').update({ fond_de_commerce: Number(montant) || 0 }).eq('id', depotId)
  if (error) throw error
}

// CRUD actionnaires
export async function listerActionnaires(depotId) {
  const { data, error } = await supabase
    .from('actionnaires').select('*').eq('depot_id', depotId).order('created_at')
  if (error) throw error
  return data || []
}
export async function ajouterActionnaire(depotId, { nom, apport, code }) {
  const { error } = await supabase.from('actionnaires').insert({
    depot_id: depotId, nom, apport: Number(apport) || 0, code: String(code).trim(),
  })
  if (error) throw error
}
export async function modifierActionnaire(id, champs) {
  const maj = {}
  if (champs.nom != null) maj.nom = champs.nom
  if (champs.apport != null) maj.apport = Number(champs.apport) || 0
  if (champs.code != null) maj.code = String(champs.code).trim()
  if (champs.actif != null) maj.actif = !!champs.actif
  const { error } = await supabase.from('actionnaires').update(maj).eq('id', id)
  if (error) throw error
}
export async function supprimerActionnaire(id) {
  const { error } = await supabase.from('actionnaires').delete().eq('id', id)
  if (error) throw error
}

// Charges d'un actionnaire pour un mois ('AAAA-MM-01')
export async function listerCharges(actionnaireId, mois) {
  const { data, error } = await supabase
    .from('charges_actionnaire').select('*')
    .eq('actionnaire_id', actionnaireId).eq('mois', mois).order('created_at')
  if (error) throw error
  return data || []
}
export async function ajouterCharge(depotId, actionnaireId, { libelle, montant, mois }) {
  const { error } = await supabase.from('charges_actionnaire').insert({
    depot_id: depotId, actionnaire_id: actionnaireId,
    libelle, montant: Number(montant) || 0, mois,
  })
  if (error) throw error
}
export async function supprimerCharge(id) {
  const { error } = await supabase.from('charges_actionnaire').delete().eq('id', id)
  if (error) throw error
}

// Le compte d'un actionnaire pour un mois (authentifié par son CODE).
//  mois : 'AAAA-MM-01'. Renvoie l'objet calculé (ou { trouve:false }).
export async function getCompteActionnaire(code, mois) {
  const { data, error } = await supabase.rpc('get_compte_actionnaire', {
    p_code: String(code).trim(), p_mois: mois,
  })
  if (error) throw error
  return data
}

// Vue patron : marge du mois + bénéfice de tous les actionnaires (un appel).
export async function getBeneficesActionnaires(depotId, mois) {
  const { data, error } = await supabase.rpc('get_benefices_actionnaires', {
    p_depot_id: depotId, p_mois: mois,
  })
  if (error) throw error
  return data
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
