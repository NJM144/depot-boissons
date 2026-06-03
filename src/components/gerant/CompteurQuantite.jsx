// ============================================================================
//  COMPTEUR DE QUANTITÉ — PROFIL GÉRANT
// ----------------------------------------------------------------------------
//  Gros boutons + / − et affichage de la quantité EN IMAGES répétées
//  (3 casiers = 3 dessins). Lecture vocale du nombre à chaque changement.
// ============================================================================

import { useVoix } from '../../hooks/useVoix.js'
import { useFeedback } from '../../hooks/useFeedback.js'
import PhotoBoisson from '../commun/PhotoBoisson.jsx'

export default function CompteurQuantite({ boisson, type, quantite, onChange }) {
  const { parler } = useVoix()
  const { clic } = useFeedback()

  // Couleur sémantique selon le sens du mouvement
  // entree=vert · sortie=rouge · casse=ambre
  const couleur =
    type === 'entree' ? 'bg-entree' : type === 'casse' ? 'bg-amber-600' : 'bg-sortie'

  const changer = (delta) => {
    const nouvelle = Math.max(0, quantite + delta)
    clic()
    parler(String(nouvelle))
    onChange(nouvelle)
  }

  // On limite l'affichage en images à 30 dessins pour ne pas surcharger l'écran
  const dessins = Math.min(quantite, 30)

  return (
    <div className="h-full flex flex-col items-center gap-4 p-3">
      {/* Rappel de la boisson concernée */}
      <div className="flex items-center gap-3">
        <PhotoBoisson boisson={boisson} taille={64} />
        <span className="text-3xl">
          {type === 'entree' ? '⬇️🟢' : type === 'casse' ? '🥃💥' : '⬆️🔴'}
        </span>
      </div>

      {/* Grand nombre central */}
      <div className={`${couleur} rounded-3xl px-10 py-4 shadow-lg`}>
        <span className="text-white text-7xl font-black">{quantite}</span>
      </div>

      {/* Représentation en images répétées (1 dessin = 1 casier) */}
      <div className="flex-1 w-full overflow-y-auto no-scrollbar">
        <div className="flex flex-wrap justify-center gap-1 content-start">
          {Array.from({ length: dessins }).map((_, i) => (
            <PhotoBoisson key={i} boisson={boisson} taille={44} />
          ))}
          {quantite > 30 && (
            <span className="text-white text-3xl self-center">…+{quantite - 30}</span>
          )}
        </div>
      </div>

      {/* Boutons − et + très grands */}
      <div className="w-full grid grid-cols-2 gap-4">
        <button
          onClick={() => changer(-1)}
          className="btn-tactile bg-slate-600 active:bg-slate-700 text-white h-28 text-7xl"
        >
          −
        </button>
        <button
          onClick={() => changer(+1)}
          className="btn-tactile bg-slate-200 active:bg-white text-slate-900 h-28 text-7xl"
        >
          +
        </button>
      </div>
    </div>
  )
}
