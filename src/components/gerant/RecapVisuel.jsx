// ============================================================================
//  RÉCAP VISUEL — PROFIL GÉRANT ("le point" avant validation)
// ----------------------------------------------------------------------------
//  Récapitulatif 100% visuel d'un mouvement :
//   image boisson + sens (flèche verte/rouge) + quantité (en images)
//   + montant (en billets empilés). Boutons VALIDER ✓ / ANNULER ✗ + voix.
// ============================================================================

import { useVoix } from '../../hooks/useVoix.js'
import { useFeedback } from '../../hooks/useFeedback.js'
import { decomposerMontant, formaterFCFA, montantEnVoix } from '../../utils/argent.js'
import PhotoBoisson from '../commun/PhotoBoisson.jsx'
import Coupure from '../commun/Coupure.jsx'

export default function RecapVisuel({ boisson, type, quantite, montant, onValider, onAnnuler }) {
  const { parler } = useVoix()
  const { succes, erreur } = useFeedback()

  const estEntree = type === 'entree'
  const pile = decomposerMontant(montant)
  const dessins = Math.min(quantite, 20)

  const valider = () => {
    succes()
    // Confirmation vocale complète
    parler(
      `${estEntree ? 'Entrée' : 'Sortie'}, ${boisson?.nom}, ${quantite}, ${montantEnVoix(montant)}. Validé`
    )
    onValider()
  }

  const annuler = () => {
    erreur()
    parler('Annulé')
    onAnnuler()
  }

  return (
    <div className="h-full flex flex-col p-3 gap-3">
      {/* Bandeau du sens du mouvement */}
      <div
        className={`rounded-2xl py-3 flex items-center justify-center gap-3 ${
          estEntree ? 'bg-entree' : 'bg-sortie'
        }`}
      >
        <span className="text-6xl">{estEntree ? '⬇️' : '⬆️'}</span>
        <span className="text-white text-4xl font-black">
          {estEntree ? 'REÇU 🟢' : 'VENDU 🔴'}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar flex flex-col items-center gap-3">
        {/* Boisson + quantité en chiffre */}
        <div className="flex items-center gap-4">
          <PhotoBoisson boisson={boisson} taille={100} />
          <span className="text-white text-7xl font-black">×{quantite}</span>
        </div>

        {/* Quantité en images répétées */}
        <div className="flex flex-wrap justify-center gap-1">
          {Array.from({ length: dessins }).map((_, i) => (
            <PhotoBoisson key={i} boisson={boisson} taille={36} />
          ))}
          {quantite > 20 && <span className="text-white text-2xl self-center">…</span>}
        </div>

        {/* Montant en billets empilés */}
        <div className="bg-slate-800 rounded-2xl p-3 w-full flex flex-col items-center">
          <div className="flex flex-wrap justify-center gap-1">
            {pile.map((c, i) => (
              <div key={i} className="relative">
                <Coupure coupure={c} />
                {c.nombre > 1 && (
                  <span className="absolute -top-2 -right-2 bg-white text-slate-900 text-base font-black rounded-full px-2">
                    ×{c.nombre}
                  </span>
                )}
              </div>
            ))}
          </div>
          <span className="text-white text-3xl font-black mt-2">{formaterFCFA(montant)}</span>
        </div>
      </div>

      {/* VALIDER / ANNULER */}
      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={annuler}
          className="btn-tactile bg-annuler active:brightness-90 text-white h-28 text-8xl"
        >
          ✗
        </button>
        <button
          onClick={valider}
          className="btn-tactile bg-valider active:brightness-90 text-white h-28 text-8xl"
        >
          ✓
        </button>
      </div>
    </div>
  )
}
