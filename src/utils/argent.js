// ============================================================================
//  UTILITAIRES MONÉTAIRES — FRANC CFA (FCFA / XOF)
// ----------------------------------------------------------------------------
//  Définit les coupures (billets et pièces) et les fonctions pour :
//   - composer un montant par addition de coupures (clavier monétaire image)
//   - décomposer un total en pile de billets/pièces (affichage visuel)
// ============================================================================

// Liste des coupures FCFA, du plus grand au plus petit.
//  `type`    : 'billet' | 'piece'
//  `couleur` : teinte dominante (reprend les VRAIES couleurs de la série BCEAO 2012)
//  `couleur2`: teinte secondaire pour le dégradé du billet
//  `metal`   : pour les pièces — 'or' | 'argent' | 'acier' | 'bimetal-or' | 'bimetal-argent'
// Couleurs réelles des billets BCEAO :
//   10 000 = violet/magenta · 5 000 = vert · 2 000 = bleu · 1 000 = brun · 500 = gris-vert (olive)
export const COUPURES = [
  { valeur: 10000, type: 'billet', couleur: '#6d28d9', couleur2: '#c026d3', label: '10 000' },
  { valeur: 5000, type: 'billet', couleur: '#15803d', couleur2: '#4ade80', label: '5 000' },
  { valeur: 2000, type: 'billet', couleur: '#1d4ed8', couleur2: '#3b82f6', label: '2 000' },
  { valeur: 1000, type: 'billet', couleur: '#b45309', couleur2: '#f59e0b', label: '1 000' },
  { valeur: 500, type: 'billet', couleur: '#3f6212', couleur2: '#84cc16', label: '500' },
  // Pièces (avec rendu métallique réaliste)
  { valeur: 500, type: 'piece', couleur: '#d4af37', metal: 'bimetal-or', label: '500' },
  { valeur: 250, type: 'piece', couleur: '#cbd5e1', metal: 'bimetal-argent', label: '250' },
  { valeur: 200, type: 'piece', couleur: '#d4af37', metal: 'bimetal-or', label: '200' },
  { valeur: 100, type: 'piece', couleur: '#cbd5e1', metal: 'argent', label: '100' },
  { valeur: 50, type: 'piece', couleur: '#94a3b8', metal: 'acier', label: '50' },
  { valeur: 25, type: 'piece', couleur: '#d4af37', metal: 'or', label: '25' },
  { valeur: 10, type: 'piece', couleur: '#eab308', metal: 'or', label: '10' },
  { valeur: 5, type: 'piece', couleur: '#ca8a04', metal: 'or', label: '5' },
]

// Coupures utilisées pour DÉCOMPOSER un total en pile visuelle (valeurs uniques)
const COUPURES_DECOMPOSITION = [10000, 5000, 2000, 1000, 500, 250, 200, 100, 50, 25, 10, 5]

// Décompose un montant en nombre de chaque coupure (pour l'affichage empilé)
// Renvoie [{ valeur, type, couleur, label, nombre }]
export function decomposerMontant(total) {
  let reste = Math.max(0, Math.round(total))
  const pile = []
  for (const valeur of COUPURES_DECOMPOSITION) {
    const nombre = Math.floor(reste / valeur)
    if (nombre > 0) {
      // On récupère la couleur/label depuis COUPURES (priorité au billet)
      const ref =
        COUPURES.find((c) => c.valeur === valeur && c.type === 'billet') ||
        COUPURES.find((c) => c.valeur === valeur)
      pile.push({ ...ref, nombre })
      reste -= nombre * valeur
    }
  }
  return pile
}

// Formate un nombre en FCFA : 12500 -> "12 500 FCFA"
export function formaterFCFA(montant) {
  const n = Math.round(Number(montant) || 0)
  return n.toLocaleString('fr-FR').replace(/ /g, ' ') + ' FCFA'
}

// Transforme un montant en texte lisible à voix haute
// 12500 -> "12 500 francs"
export function montantEnVoix(montant) {
  const n = Math.round(Number(montant) || 0)
  return `${n.toLocaleString('fr-FR').replace(/ /g, ' ')} francs`
}
