// ============================================================================
//  AMORTISSEMENT — PROFIL GÉRANT (versement quotidien, ex : tricycle)
// ----------------------------------------------------------------------------
//  Flux court : montant (clavier monétaire, prérempli au montant/jour suggéré)
//  → récap → VALIDER / ANNULER. Enregistré en 'en_attente' : le patron valide.
// ============================================================================

import { useEffect, useState } from 'react'
import { useVoix } from '../../hooks/useVoix.js'
import { useFeedback } from '../../hooks/useFeedback.js'
import { formaterFCFA } from '../../utils/argent.js'
import ClavierMonetaire from './ClavierMonetaire.jsx'

export default function DeclarationAmortissement({ adapter, onTermine }) {
  const { parler } = useVoix()
  const { clic, succes, erreur } = useFeedback()

  const [amortissements, setAmortissements] = useState(null) // null = chargement
  const [etape, setEtape] = useState('montant') // montant | recap
  const [montant, setMontant] = useState(0)
  const [histoCoupures, setHistoCoupures] = useState([])

  useEffect(() => {
    adapter.listerAmortissementsActifs().then(setAmortissements).catch((e) => {
      console.error(e)
      setAmortissements([])
    })
  }, [adapter])

  const ligne = amortissements?.[0] || null

  const valider = async () => {
    await adapter.ajouterDeclarationAmortissement({ amortissementId: ligne?.id || null, montant })
    succes()
    parler(`Versement enregistré, ${formaterFCFA(montant)}`)
    setTimeout(onTermine, 400)
  }

  const annuler = () => {
    erreur()
    parler('Annulé')
    onTermine()
  }

  return (
    <div className="h-full flex flex-col bg-indigo-950">
      {/* Bandeau "AMORTISSEMENT" */}
      <div className="bg-indigo-700 flex items-center justify-center gap-3 py-3">
        <span className="text-5xl">🔧</span>
        <span className="text-white text-3xl font-black">AMORTISSEMENT</span>
      </div>

      <div className="flex-1 min-h-0">
        {amortissements === null && (
          <p className="text-center text-indigo-200 mt-10">Chargement…</p>
        )}

        {amortissements !== null && amortissements.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center gap-4 p-4">
            <span className="text-6xl">🤷</span>
            <p className="text-indigo-200 text-center">Aucun amortissement configuré pour le moment.</p>
            <button onClick={onTermine} className="btn-tactile bg-slate-600 active:bg-slate-700 text-white w-full h-16 text-2xl">
              ⬅️ Retour
            </button>
          </div>
        )}

        {ligne && etape === 'montant' && (
          <div className="h-full flex flex-col">
            <button
              onClick={() => parler(`${ligne.libelle}, combien versé aujourd'hui ?`)}
              className="w-full flex items-center justify-center gap-2 py-2 bg-indigo-800"
            >
              <span className="text-3xl">🔧💰</span>
              <span className="text-white text-2xl font-black">{ligne.libelle.toUpperCase()}</span>
            </button>
            <div className="flex-1 min-h-0">
              <ClavierMonetaire
                montant={montant}
                historique={histoCoupures}
                prixSuggere={ligne.montant_jour}
                onChange={(total, histo) => {
                  setMontant(total)
                  setHistoCoupures(histo)
                }}
              />
            </div>
            <div className="p-3">
              <button
                onClick={() => { clic(); setEtape('recap') }}
                disabled={montant <= 0}
                className="btn-tactile bg-indigo-600 active:bg-indigo-700 disabled:opacity-50 text-white w-full h-20 text-4xl flex-row gap-3"
              >
                ➡️ ✓
              </button>
            </div>
          </div>
        )}

        {ligne && etape === 'recap' && (
          <div className="h-full flex flex-col p-3 gap-3">
            <div className="flex-1 flex flex-col items-center justify-center gap-4">
              <span className="text-8xl">🔧</span>
              <span className="text-indigo-200 text-2xl font-bold">{ligne.libelle}</span>
              <span className="text-white text-6xl font-black">{formaterFCFA(montant)}</span>
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
