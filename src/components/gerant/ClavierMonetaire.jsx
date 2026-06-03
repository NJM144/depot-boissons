// ============================================================================
//  CLAVIER MONÉTAIRE PAR IMAGES — PROFIL GÉRANT (fonction innovante)
// ----------------------------------------------------------------------------
//  Chaque bouton = IMAGE d'un billet ou d'une pièce FCFA.
//   - Tap sur une coupure => addition automatique au total.
//   - Le total s'affiche EN IMAGES de billets/pièces empilés + lecture vocale.
//   - Bouton "annuler le dernier" (illustré) pour retirer la dernière coupure.
//  Le `montant` est piloté par le parent via une liste de coupures (historique).
// ============================================================================

import { useVoix } from '../../hooks/useVoix.js'
import { useFeedback } from '../../hooks/useFeedback.js'
import { COUPURES, decomposerMontant, montantEnVoix, formaterFCFA } from '../../utils/argent.js'
import Coupure from '../commun/Coupure.jsx'

export default function ClavierMonetaire({ montant, historique, onChange, prixSuggere }) {
  const { parler } = useVoix()
  const { clic, erreur } = useFeedback()

  // Ajoute une coupure au total
  const ajouter = (coupure) => {
    clic()
    const nouvelHistorique = [...historique, coupure]
    const total = montant + coupure.valeur
    parler(montantEnVoix(total)) // ex : "mille cinq cents francs"
    onChange(total, nouvelHistorique)
  }

  // Annule la dernière coupure tapée
  const annulerDernier = () => {
    if (historique.length === 0) {
      erreur()
      return
    }
    erreur()
    const derniere = historique[historique.length - 1]
    const nouvelHistorique = historique.slice(0, -1)
    const total = montant - derniere.valeur
    parler(montantEnVoix(total))
    onChange(total, nouvelHistorique)
  }

  // Pré-remplit le prix suggéré (prix de référence × quantité) en un tap
  const utiliserSuggestion = () => {
    if (!prixSuggere) return
    clic()
    // On décompose le prix suggéré en coupures pour garder un historique cohérent
    const pile = decomposerMontant(prixSuggere)
    const histo = []
    for (const c of pile) for (let i = 0; i < c.nombre; i++) histo.push(c)
    parler(montantEnVoix(prixSuggere))
    onChange(prixSuggere, histo)
  }

  const billets = COUPURES.filter((c) => c.type === 'billet')
  const pieces = COUPURES.filter((c) => c.type === 'piece')
  const pileTotal = decomposerMontant(montant)

  return (
    <div className="h-full flex flex-col p-2 gap-2">
      {/* ----- TOTAL EN IMAGES EMPILÉES ----- */}
      <button
        onClick={() => parler(montantEnVoix(montant))}
        className="bg-slate-800 rounded-2xl p-3 min-h-[110px] flex flex-col items-center justify-center active:bg-slate-700"
      >
        <div className="flex flex-wrap justify-center items-center gap-1">
          {pileTotal.length === 0 && <span className="text-slate-400 text-2xl">💰 0</span>}
          {pileTotal.map((c, i) => (
            <div key={i} className="relative">
              <Coupure coupure={c} />
              {c.nombre > 1 && (
                <span className="absolute -top-2 -right-2 bg-white text-slate-900 text-lg font-black rounded-full px-2 shadow">
                  ×{c.nombre}
                </span>
              )}
            </div>
          ))}
        </div>
        <span className="text-white text-3xl font-black mt-1">{formaterFCFA(montant)}</span>
      </button>

      {/* ----- BOUTONS ACTIONS : annuler dernier + suggestion ----- */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={annulerDernier}
          className="btn-tactile bg-amber-500 active:bg-amber-600 text-white h-16 text-2xl flex-row gap-2"
        >
          ↩️ Annuler
        </button>
        <button
          onClick={utiliserSuggestion}
          disabled={!prixSuggere}
          className="btn-tactile bg-sky-600 active:bg-sky-700 disabled:opacity-40 text-white h-16 text-xl flex-row gap-2"
        >
          💡 {prixSuggere ? formaterFCFA(prixSuggere) : '—'}
        </button>
      </div>

      {/* ----- CLAVIER : BILLETS puis PIÈCES ----- */}
      <div className="flex-1 overflow-y-auto no-scrollbar">
        <div className="grid grid-cols-3 gap-2">
          {billets.map((c, i) => (
            <button
              key={`b${i}`}
              onClick={() => ajouter(c)}
              className="bg-white rounded-xl p-1 flex items-center justify-center active:scale-95 transition-transform shadow"
            >
              <Coupure coupure={c} />
            </button>
          ))}
        </div>
        <div className="grid grid-cols-4 gap-2 mt-2">
          {pieces.map((c, i) => (
            <button
              key={`p${i}`}
              onClick={() => ajouter(c)}
              className="bg-white rounded-xl p-1 flex items-center justify-center active:scale-95 transition-transform shadow"
            >
              <Coupure coupure={c} />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
