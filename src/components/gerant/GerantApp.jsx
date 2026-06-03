// ============================================================================
//  GERANT APP — ORCHESTRATEUR DU PARCOURS DE SAISIE (100% visuel)
// ----------------------------------------------------------------------------
//  Enchaîne les étapes, sans texte indispensable, avec un fil d'aide visuel :
//   1) selection : choisir la boisson (image)  [+ bouton CASSÉ]
//   2) sens      : ENTRÉE (flèche verte) ou SORTIE (flèche rouge)
//   3) quantite  : compteur + / −
//   4) montant   : clavier monétaire par images
//   5) recap     : récapitulatif visuel -> VALIDER / ANNULER
//  Le sous-flux CASSÉ (BoissonCassee) gère les pertes.
//  Les données passent par `adapter` : Dexie (local) ou Supabase (notif push).
//  Le gérant n'accède JAMAIS aux statistiques.
// ============================================================================

import { useEffect, useState } from 'react'
import { adapterLocal } from '../../data/adapter.js'
import { useVoix } from '../../hooks/useVoix.js'
import { useFeedback } from '../../hooks/useFeedback.js'
import SelectionBoissons from './SelectionBoissons.jsx'
import CompteurQuantite from './CompteurQuantite.jsx'
import ClavierMonetaire from './ClavierMonetaire.jsx'
import RecapVisuel from './RecapVisuel.jsx'
import BoissonCassee from './BoissonCassee.jsx'
import PhotoBoisson from '../commun/PhotoBoisson.jsx'

export default function GerantApp({ onQuitter, adapter = adapterLocal }) {
  const { parler } = useVoix()
  const { clic } = useFeedback()

  // Catalogue chargé via l'adaptateur (local ou Supabase)
  const [boissons, setBoissons] = useState([])
  useEffect(() => {
    adapter.listerBoissons().then(setBoissons).catch((e) => console.error(e))
  }, [adapter])

  // État du parcours
  const [etape, setEtape] = useState('selection')
  const [casseMode, setCasseMode] = useState(false)
  const [boisson, setBoisson] = useState(null)
  const [type, setType] = useState(null) // 'entree' | 'sortie'
  const [quantite, setQuantite] = useState(1)
  const [montant, setMontant] = useState(0)
  const [histoCoupures, setHistoCoupures] = useState([]) // pour annuler-dernier

  // Réinitialise tout le parcours
  const recommencer = () => {
    setBoisson(null)
    setType(null)
    setQuantite(1)
    setMontant(0)
    setHistoCoupures([])
    setCasseMode(false)
    setEtape('selection')
  }

  const surSelection = (b) => {
    setBoisson(b)
    setEtape('sens')
  }

  const choisirSens = (sens) => {
    clic()
    parler(sens === 'entree' ? 'Reçu' : 'Vendu')
    setType(sens)
    setEtape('quantite')
  }

  // Enregistre le mouvement via l'adaptateur puis confirme
  const enregistrer = async () => {
    await adapter.ajouterMouvement({ boissonId: boisson.id, type, quantite, montant })
    setTimeout(recommencer, 400)
  }

  // Prix suggéré = prix de référence × quantité (aide au clavier monétaire)
  const prixSuggere = (boisson?.prixReference || 0) * quantite

  // Retour visuel
  const retour = () => {
    clic()
    if (casseMode) return recommencer()
    if (etape === 'selection') return onQuitter()
    if (etape === 'sens') return recommencer()
    if (etape === 'quantite') return setEtape('sens')
    if (etape === 'montant') return setEtape('quantite')
    if (etape === 'recap') return setEtape('montant')
  }

  // ----- Sous-flux CASSÉ -----------------------------------------------------
  if (casseMode) {
    return (
      <div className="h-full flex flex-col bg-slate-900">
        <div className="flex items-center gap-2 p-2 bg-slate-800">
          <button
            onClick={recommencer}
            className="btn-tactile bg-slate-600 active:bg-slate-700 text-white w-16 h-14 text-3xl"
          >
            ⬅️
          </button>
        </div>
        <div className="flex-1 min-h-0">
          <BoissonCassee boissons={boissons} adapter={adapter} onTermine={recommencer} />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-slate-900">
      {/* ---------- BARRE HAUT : retour + fil d'aide visuel ---------- */}
      <div className="flex items-center gap-2 p-2 bg-slate-800">
        <button
          onClick={retour}
          className="btn-tactile bg-slate-600 active:bg-slate-700 text-white w-16 h-14 text-3xl"
        >
          {etape === 'selection' ? '🏠' : '⬅️'}
        </button>

        {/* Fil d'Ariane illustré : boisson -> sens -> quantité */}
        <div className="flex-1 flex items-center justify-around">
          {boisson ? <PhotoBoisson boisson={boisson} taille={44} /> : <span className="text-3xl">🥤</span>}
          <span className="text-3xl">
            {type ? (type === 'entree' ? '🟢⬇️' : '🔴⬆️') : '➡️'}
          </span>
          {etape !== 'selection' && etape !== 'sens' && (
            <span className="text-white text-2xl font-black">×{quantite}</span>
          )}
        </div>

        {/* Bouton CASSÉ (accessible depuis l'écran de sélection) */}
        {etape === 'selection' && (
          <button
            onClick={() => {
              clic()
              setCasseMode(true)
            }}
            className="btn-tactile bg-amber-600 active:bg-amber-700 text-white w-20 h-14 text-3xl"
          >
            🥃💥
          </button>
        )}
      </div>

      {/* ---------- CONTENU DE L'ÉTAPE ---------- */}
      <div className="flex-1 min-h-0">
        {etape === 'selection' && (
          <SelectionBoissons boissons={boissons} onSelection={surSelection} />
        )}

        {/* Choix du sens : 2 gros boutons VERT / ROUGE */}
        {etape === 'sens' && (
          <div className="h-full grid grid-rows-2 gap-4 p-4">
            <button
              onClick={() => choisirSens('entree')}
              className="btn-tactile bg-entree active:brightness-90 text-white gap-2"
            >
              <span className="text-8xl">⬇️</span>
              <span className="text-4xl font-black">REÇU 🟢</span>
            </button>
            <button
              onClick={() => choisirSens('sortie')}
              className="btn-tactile bg-sortie active:brightness-90 text-white gap-2"
            >
              <span className="text-8xl">⬆️</span>
              <span className="text-4xl font-black">VENDU 🔴</span>
            </button>
          </div>
        )}

        {etape === 'quantite' && (
          <div className="h-full flex flex-col">
            <div className="flex-1 min-h-0">
              <CompteurQuantite
                boisson={boisson}
                type={type}
                quantite={quantite}
                onChange={setQuantite}
              />
            </div>
            <div className="p-3">
              <button
                onClick={() => {
                  clic()
                  setEtape('montant')
                }}
                className="btn-tactile bg-sky-600 active:bg-sky-700 text-white w-full h-20 text-4xl flex-row gap-3"
              >
                ➡️ 💰
              </button>
            </div>
          </div>
        )}

        {etape === 'montant' && (
          <div className="h-full flex flex-col">
            <div className="flex-1 min-h-0">
              <ClavierMonetaire
                montant={montant}
                historique={histoCoupures}
                prixSuggere={prixSuggere}
                onChange={(total, histo) => {
                  setMontant(total)
                  setHistoCoupures(histo)
                }}
              />
            </div>
            <div className="p-3">
              <button
                onClick={() => {
                  clic()
                  setEtape('recap')
                }}
                className="btn-tactile bg-sky-600 active:bg-sky-700 text-white w-full h-20 text-4xl flex-row gap-3"
              >
                ➡️ ✓
              </button>
            </div>
          </div>
        )}

        {etape === 'recap' && (
          <RecapVisuel
            boisson={boisson}
            type={type}
            quantite={quantite}
            montant={montant}
            onValider={enregistrer}
            onAnnuler={recommencer}
          />
        )}
      </div>
    </div>
  )
}
