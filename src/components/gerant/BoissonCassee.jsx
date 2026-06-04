// ============================================================================
//  BOISSON CASSÉE — PROFIL GÉRANT (saisie des pertes)
// ----------------------------------------------------------------------------
//  Flux 100% visuel : sélection de la boisson par image → quantité cassée
//  (compteur +/−) → récap. Le coût s'affiche de façon DISCRÈTE (le gérant n'a
//  pas accès au vrai prix d'achat ; on montre un montant indicatif). Validation
//  vocale, puis enregistrement dans la table `casses`.
// ============================================================================

import { useState } from 'react'
import { useVoix } from '../../hooks/useVoix.js'
import { useFeedback } from '../../hooks/useFeedback.js'
import { formaterFCFA } from '../../utils/argent.js'
import SelectionBoissons from './SelectionBoissons.jsx'
import CompteurQuantite from './CompteurQuantite.jsx'
import PhotoBoisson from '../commun/PhotoBoisson.jsx'

export default function BoissonCassee({ boissons, adapter, onTermine }) {
  const { parler } = useVoix()
  const { clic, succes, erreur } = useFeedback()

  const [etape, setEtape] = useState('selection') // selection | quantite | recap
  const [boisson, setBoisson] = useState(null)
  const [quantite, setQuantite] = useState(1)

  // Coût indicatif (le vrai prix d'achat reste invisible au gérant)
  const coutIndicatif = (boisson?.prixReference || 0) * quantite

  const choisir = (b) => {
    setBoisson(b)
    setQuantite(1)
    setEtape('quantite')
  }

  const valider = async () => {
    // La casse est toujours comptée en BOUTEILLES
    await adapter.ajouterCasse({ boissonId: boisson.id, quantite })
    succes()
    parler(`Cassé, ${boisson.nom}, ${quantite} ${quantite > 1 ? 'bouteilles' : 'bouteille'}`)
    setTimeout(onTermine, 400)
  }

  const annuler = () => {
    erreur()
    parler('Annulé')
    onTermine()
  }

  return (
    <div className="h-full flex flex-col bg-amber-950">
      {/* Bandeau "CASSÉ" (verre brisé) */}
      <div className="bg-amber-700 flex items-center justify-center gap-3 py-3">
        <span className="text-5xl">🥃💥</span>
        <span className="text-white text-3xl font-black">CASSÉ</span>
      </div>

      <div className="flex-1 min-h-0">
        {/* 1) Choix de la boisson cassée */}
        {etape === 'selection' && (
          <SelectionBoissons boissons={boissons} onSelection={choisir} />
        )}

        {/* 2) Quantité cassée */}
        {etape === 'quantite' && (
          <div className="h-full flex flex-col">
            <div className="flex-1 min-h-0">
              <CompteurQuantite
                boisson={boisson}
                type="casse"
                quantite={quantite}
                onChange={setQuantite}
              />
            </div>
            <div className="p-3">
              <button
                onClick={() => {
                  clic()
                  setEtape('recap')
                }}
                className="btn-tactile bg-amber-600 active:bg-amber-700 text-white w-full h-20 text-4xl flex-row gap-3"
              >
                ➡️ ✓
              </button>
            </div>
          </div>
        )}

        {/* 3) Récapitulatif + validation */}
        {etape === 'recap' && (
          <div className="h-full flex flex-col p-3 gap-3">
            <div className="flex-1 flex flex-col items-center justify-center gap-4">
              <PhotoBoisson boisson={boisson} taille={120} />
              <div className="flex items-center gap-3">
                <span className="text-white text-7xl font-black">×{quantite}</span>
                <span className="text-5xl">🍾</span>
              </div>
              <span className="text-amber-200 text-lg font-bold">
                {quantite} {quantite > 1 ? 'bouteilles' : 'bouteille'} cassée{quantite > 1 ? 's' : ''}
              </span>
              {/* Coût DISCRET (petit, grisé) */}
              <span className="text-amber-300/70 text-sm">≈ {formaterFCFA(coutIndicatif)}</span>
            </div>
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
        )}
      </div>
    </div>
  )
}
