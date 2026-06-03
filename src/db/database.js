// ============================================================================
//  BASE DE DONNÉES LOCALE (IndexedDB via Dexie)
// ----------------------------------------------------------------------------
//  Données PARTAGÉES entre les deux profils (gérant + propriétaire).
//  La structure est volontairement simple et "plate" pour être facilement
//  synchronisée plus tard vers Supabase (chaque ligne a un champ `synced`).
// ============================================================================

import Dexie from 'dexie'
import { CATALOGUE_DEMO } from './seed.js'

// Instance unique de la base
export const db = new Dexie('depot_boissons')

// ----------------------------------------------------------------------------
//  SCHÉMA
// ----------------------------------------------------------------------------
//  Table `boissons`   : le catalogue des produits (alimente l'écran gérant)
//  Table `mouvements` : chaque entrée (reçu) ou sortie (vente)
//  Table `config`     : paramètres clé/valeur (code PIN du propriétaire, etc.)
// ----------------------------------------------------------------------------
db.version(1).stores({
  // ++id = clé primaire auto-incrémentée. Les autres champs sont indexés.
  boissons: '++id, nom, couleurCasier, actif',
  mouvements: '++id, boissonId, type, dateJour, timestamp, synced',
  config: 'cle',
})

// Version 2 : ajout de la table `casses` (boissons cassées / pertes)
db.version(2).stores({
  boissons: '++id, nom, couleurCasier, actif',
  mouvements: '++id, boissonId, type, dateJour, timestamp, synced',
  casses: '++id, boissonId, dateJour, timestamp, synced',
  config: 'cle',
})

// ============================================================================
//  INITIALISATION
// ============================================================================
export async function initBaseDeDonnees() {
  try {
    await db.open()

    // Si le catalogue est vide (première installation), on charge la démo.
    const nb = await db.boissons.count()
    if (nb === 0) {
      await db.boissons.bulkAdd(CATALOGUE_DEMO)
    }

    // Code PIN par défaut du propriétaire si absent : 1234
    const pin = await db.config.get('pin')
    if (!pin) {
      await db.config.put({ cle: 'pin', valeur: '1234' })
    }
  } catch (e) {
    // En cas d'échec on n'empêche pas le démarrage de l'app
    console.error('Erreur initialisation base :', e)
  }
}

// ============================================================================
//  HELPERS
// ============================================================================

// Renvoie la date du jour au format "AAAA-MM-JJ" (utile pour filtrer/grouper)
export function dateJourCourant(d = new Date()) {
  const z = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`
}

// ============================================================================
//  CRUD — CATALOGUE (boissons)
// ============================================================================

// Liste les boissons actives (pour l'écran gérant) ou toutes (catalogue proprio)
export async function listerBoissons({ inclureInactives = false } = {}) {
  const toutes = await db.boissons.toArray()
  const liste = inclureInactives ? toutes : toutes.filter((b) => b.actif !== false)
  // Tri par catégorie de couleur puis par nom pour un affichage stable
  return liste.sort((a, b) =>
    (a.couleurCasier || '').localeCompare(b.couleurCasier || '') ||
    a.nom.localeCompare(b.nom)
  )
}

export async function ajouterBoisson(boisson) {
  return db.boissons.add({
    nom: boisson.nom,
    photo: boisson.photo || null, // dataURL (image) ou emoji
    emoji: boisson.emoji || '🥤',
    couleurCasier: boisson.couleurCasier || '#3b82f6',
    prixReference: Number(boisson.prixReference) || 0,
    seuilAlerte: Number(boisson.seuilAlerte) || 5,
    actif: true,
  })
}

export async function modifierBoisson(id, champs) {
  return db.boissons.update(id, champs)
}

export async function supprimerBoisson(id) {
  // Suppression "douce" : on désactive pour préserver l'historique des mouvements
  return db.boissons.update(id, { actif: false })
}

export async function getBoisson(id) {
  return db.boissons.get(id)
}

// ============================================================================
//  CRUD — MOUVEMENTS (entrées / sorties)
// ============================================================================

// Enregistre un mouvement. type = 'entree' (reçu) | 'sortie' (vendu)
export async function ajouterMouvement({ boissonId, type, quantite, montant }) {
  const maintenant = new Date()
  return db.mouvements.add({
    boissonId,
    type,
    quantite: Number(quantite) || 0,
    montant: Number(montant) || 0,
    dateJour: dateJourCourant(maintenant), // index pour filtres/journalier
    timestamp: maintenant.getTime(),
    dateISO: maintenant.toISOString(),
    synced: 0, // 0 = pas encore synchronisé vers Supabase
  })
}

// Récupère les mouvements avec filtres optionnels (utilisé par l'historique)
export async function listerMouvements(filtres = {}) {
  let liste = await db.mouvements.orderBy('timestamp').reverse().toArray()

  if (filtres.boissonId) liste = liste.filter((m) => m.boissonId === filtres.boissonId)
  if (filtres.type) liste = liste.filter((m) => m.type === filtres.type)
  if (filtres.dateDebut) liste = liste.filter((m) => m.dateJour >= filtres.dateDebut)
  if (filtres.dateFin) liste = liste.filter((m) => m.dateJour <= filtres.dateFin)

  return liste
}

// ============================================================================
//  CRUD — CASSES (boissons cassées / pertes)
// ============================================================================

// Enregistre une casse. Le coût = quantité × prix de référence (approx. local).
export async function ajouterCasse({ boissonId, quantite }) {
  const maintenant = new Date()
  const boisson = await db.boissons.get(boissonId)
  const cout = (Number(quantite) || 0) * (boisson?.prixReference || 0)
  return db.casses.add({
    boissonId,
    quantite: Number(quantite) || 0,
    coutTotal: cout,
    dateJour: dateJourCourant(maintenant),
    timestamp: maintenant.getTime(),
    dateISO: maintenant.toISOString(),
    synced: 0,
  })
}

export async function listerCasses(filtres = {}) {
  let liste = await db.casses.orderBy('timestamp').reverse().toArray()
  if (filtres.dateDebut) liste = liste.filter((c) => c.dateJour >= filtres.dateDebut)
  if (filtres.dateFin) liste = liste.filter((c) => c.dateJour <= filtres.dateFin)
  return liste
}

// ============================================================================
//  CALCULS — "LE POINT" DU DÉPÔT
// ============================================================================

// Stock d'une boisson = somme(entrées) − somme(sorties) − somme(casses)
export async function calculerStock(boissonId) {
  const [mvts, casses] = await Promise.all([
    db.mouvements.where('boissonId').equals(boissonId).toArray(),
    db.casses.where('boissonId').equals(boissonId).toArray(),
  ])
  const entreesSorties = mvts.reduce(
    (acc, m) => acc + (m.type === 'entree' ? m.quantite : -m.quantite),
    0
  )
  const totalCasses = casses.reduce((acc, c) => acc + c.quantite, 0)
  return entreesSorties - totalCasses
}

// Stock de TOUTES les boissons, avec détection de rupture (sous le seuil)
export async function calculerStocks() {
  const [boissons, mvts, casses] = await Promise.all([
    db.boissons.toArray(),
    db.mouvements.toArray(),
    db.casses.toArray(),
  ])

  return boissons.map((b) => {
    const lignes = mvts.filter((m) => m.boissonId === b.id)
    const entreesSorties = lignes.reduce(
      (acc, m) => acc + (m.type === 'entree' ? m.quantite : -m.quantite),
      0
    )
    const totalCasses = casses
      .filter((c) => c.boissonId === b.id)
      .reduce((acc, c) => acc + c.quantite, 0)
    const stock = entreesSorties - totalCasses
    return {
      ...b,
      stock,
      enRupture: stock <= (b.seuilAlerte ?? 5),
    }
  })
}

// ============================================================================
//  STATISTIQUES (tableau de bord propriétaire)
// ============================================================================

// Chiffre d'affaires (= somme des montants des SORTIES) sur une période
export async function chiffreAffaires({ dateDebut, dateFin } = {}) {
  const mvts = await listerMouvements({ type: 'sortie', dateDebut, dateFin })
  return mvts.reduce((acc, m) => acc + m.montant, 0)
}

// Agrège les ventes par jour : [{ jour, montant, quantite }]
export async function ventesParJour({ dateDebut, dateFin } = {}) {
  const mvts = await listerMouvements({ type: 'sortie', dateDebut, dateFin })
  const map = new Map()
  for (const m of mvts) {
    const cur = map.get(m.dateJour) || { jour: m.dateJour, montant: 0, quantite: 0 }
    cur.montant += m.montant
    cur.quantite += m.quantite
    map.set(m.dateJour, cur)
  }
  return [...map.values()].sort((a, b) => a.jour.localeCompare(b.jour))
}

// Top des boissons les plus vendues : [{ boisson, quantite, montant }]
export async function topBoissons({ dateDebut, dateFin, limite = 5 } = {}) {
  const [boissons, mvts] = await Promise.all([
    db.boissons.toArray(),
    listerMouvements({ type: 'sortie', dateDebut, dateFin }),
  ])
  const map = new Map()
  for (const m of mvts) {
    const cur = map.get(m.boissonId) || { quantite: 0, montant: 0 }
    cur.quantite += m.quantite
    cur.montant += m.montant
    map.set(m.boissonId, cur)
  }
  return [...map.entries()]
    .map(([boissonId, v]) => ({
      boisson: boissons.find((b) => b.id === boissonId),
      ...v,
    }))
    .filter((x) => x.boisson)
    .sort((a, b) => b.quantite - a.quantite)
    .slice(0, limite)
}

// ============================================================================
//  CONFIG (code PIN, etc.)
// ============================================================================
export async function getConfig(cle) {
  const row = await db.config.get(cle)
  return row?.valeur
}

export async function setConfig(cle, valeur) {
  return db.config.put({ cle, valeur })
}

export async function verifierPIN(saisie) {
  const pin = await getConfig('pin')
  return String(saisie) === String(pin)
}
