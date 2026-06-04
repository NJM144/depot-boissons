// ============================================================================
//  COMPTEUR DE QUANTITÉ — PROFIL GÉRANT
// ----------------------------------------------------------------------------
//  Gros boutons + / − et affichage de la quantité EN IMAGES répétées.
//  Tient compte de l'UNITÉ choisie :
//   - 'bouteille' 🍾 : on compte des bouteilles
//   - 'casier'    📦 : on compte des casiers (+ équivalent en bouteilles affiché)
//  Lecture vocale du nombre à chaque changement.
// ============================================================================

import { useVoix } from '../../hooks/useVoix.js'
import { useFeedback } from '../../hooks/useFeedback.js'
import PhotoBoisson from '../commun/PhotoBoisson.jsx'

export default function CompteurQuantite({
  boisson,
  type,
  quantite,
  unite = 'bouteille',
  bouteillesParCasier = 12,
  onChange,
}) {
  const { parler } = useVoix()
  const { clic } = useFeedback()

  // Couleur sémantique selon le sens du mouvement
  // entree=vert · sortie=rouge · casse=ambre
  const couleur =
    type === 'entree' ? 'bg-entree' : type === 'casse' ? 'bg-amber-600' : 'bg-sortie'

  // Icône de l'unité (casier vs bouteille)
  const iconeUnite = unite === 'casier' ? '📦' : '🍾'
  // Équivalent en bouteilles si on compte en casiers
  const totalBouteilles = unite === 'casier' ? quantite * bouteillesParCasier : quantite

  const changer = (delta) => {
    const nouvelle = Math.max(0, quantite + delta)
    clic()
    parler(String(nouvelle))
    onChange(nouvelle)
  }

  const dessins = Math.min(quantite, 30)

  return (
    <div className="h-full flex flex-col items-center gap-3 p-3">
      {/* Rappel de la boisson + sens + unité */}
      <div className="flex items-center gap-3">
        <PhotoBoisson boisson={boisson} taille={56} />
        <span className="text-3xl">
          {type === 'entree' ? '⬇️🟢' : type === 'casse' ? '🥃💥' : '⬆️🔴'}
        </span>
        <span className="text-4xl">{iconeUnite}</span>
      </div>

      {/* Grand nombre central */}
      <div className={`${couleur} rounded-3xl px-10 py-3 shadow-lg`}>
        <span className="text-white text-7xl font-black">{quantite}</span>
      </div>

      {/* Équivalent en bouteilles (seulement si on compte en casiers) */}
      {unite === 'casier' && (
        <div className="bg-slate-800 rounded-full px-4 py-1 flex items-center gap-2">
          <span className="text-2xl">📦</span>
          <span className="text-white text-lg font-bold">= {totalBouteilles} 🍾</span>
        </div>
      )}

      {/* Représentation en images répétées (1 dessin = 1 unité) */}
      <div className="flex-1 w-full overflow-y-auto no-scrollbar">
        <div className="flex flex-wrap justify-center gap-1 content-start">
          {Array.from({ length: dessins }).map((_, i) => (
            <div key={i} className="relative">
              <PhotoBoisson boisson={boisson} taille={42} />
              {/* Petit badge casier pour distinguer l'unité */}
              {unite === 'casier' && (
                <span className="absolute -bottom-1 -right-1 text-base">📦</span>
              )}
            </div>
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
          className="btn-tactile bg-slate-600 active:bg-slate-700 text-white h-24 text-7xl"
        >
          −
        </button>
        <button
          onClick={() => changer(+1)}
          className="btn-tactile bg-slate-200 active:bg-white text-slate-900 h-24 text-7xl"
        >
          +
        </button>
      </div>
    </div>
  )
}
