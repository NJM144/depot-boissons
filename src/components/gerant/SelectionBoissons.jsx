// ============================================================================
//  SÉLECTION DES BOISSONS PAR IMAGE — PROFIL GÉRANT
// ----------------------------------------------------------------------------
//  Grille de gros boutons = PHOTO de la boisson (ou casier coloré + emoji).
//  - Au tap : lecture vocale du nom puis passage à l'étape suivante.
//  - Les boissons sont groupées/colorées par couleur de casier.
// ============================================================================

import { useVoix } from '../../hooks/useVoix.js'
import { useFeedback } from '../../hooks/useFeedback.js'
import PhotoBoisson from '../commun/PhotoBoisson.jsx'

export default function SelectionBoissons({ boissons, onSelection }) {
  const { parler } = useVoix()
  const { clic } = useFeedback()

  const choisir = (boisson) => {
    clic()
    parler(boisson.nom) // lecture vocale du nom
    onSelection(boisson)
  }

  return (
    <div className="h-full overflow-y-auto no-scrollbar p-3">
      {/* Grille adaptative de grandes vignettes */}
      <div className="grid grid-cols-2 gap-3">
        {boissons.map((b) => (
          <button
            key={b.id}
            onClick={() => choisir(b)}
            style={{ borderColor: b.couleurCasier }}
            className="btn-tactile bg-white border-8 p-3 gap-2 active:bg-slate-100"
          >
            <PhotoBoisson boisson={b} taille={110} />
            {/* Le nom est affiché en petit pour le voyant, mais reste accessoire */}
            <span className="text-slate-800 text-lg font-bold truncate w-full text-center">
              {b.nom}
            </span>
          </button>
        ))}
      </div>

      {boissons.length === 0 && (
        <div className="text-center text-white text-xl mt-10">
          Aucune boisson 😶 — ajoutez-en côté propriétaire
        </div>
      )}
    </div>
  )
}
