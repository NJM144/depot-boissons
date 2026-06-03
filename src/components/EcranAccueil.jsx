// ============================================================================
//  ÉCRAN D'ACCUEIL — CHOIX DU PROFIL
// ----------------------------------------------------------------------------
//  Deux gros boutons illustrés :
//   - GÉRANT (icône personne + casier)  -> saisie, accessible sans lecture
//   - PROPRIÉTAIRE (icône cadenas/clé)  -> protégé par code PIN
// ============================================================================

import { useVoix } from '../hooks/useVoix.js'
import { useFeedback } from '../hooks/useFeedback.js'

export default function EcranAccueil({ onChoixGerant, onChoixProprietaire }) {
  const { parler } = useVoix()
  const { clic } = useFeedback()

  const choisirGerant = () => {
    clic()
    parler('Gérant')
    onChoixGerant()
  }

  const choisirProprietaire = () => {
    clic()
    parler('Propriétaire')
    onChoixProprietaire()
  }

  return (
    <div className="h-full w-full flex flex-col bg-slate-900 text-white p-4 gap-4">
      <h1 className="text-center text-3xl font-black py-3">🍹 Dépôt Boissons</h1>

      <div className="flex-1 grid grid-rows-2 gap-4">
        {/* BOUTON GÉRANT */}
        <button
          onClick={choisirGerant}
          className="btn-tactile bg-emerald-600 active:bg-emerald-700 text-white w-full h-full gap-3"
        >
          <span className="text-8xl">🧑‍🏭</span>
          <span className="text-4xl font-black">GÉRANT</span>
          <span className="text-6xl">🧰</span>
        </button>

        {/* BOUTON PROPRIÉTAIRE */}
        <button
          onClick={choisirProprietaire}
          className="btn-tactile bg-indigo-600 active:bg-indigo-700 text-white w-full h-full gap-3"
        >
          <span className="text-8xl">🔐</span>
          <span className="text-4xl font-black">PROPRIÉTAIRE</span>
          <span className="text-6xl">🗝️</span>
        </button>
      </div>
    </div>
  )
}
