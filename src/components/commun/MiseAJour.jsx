// ============================================================================
//  MISE À JOUR — bannière proposée quand une nouvelle version est dispo
// ----------------------------------------------------------------------------
//  Monté à la racine de l'app. Vérifie à chaque ouverture (voir updateCheck)
//  et, si besoin, affiche une modale avec un GROS bouton de mise à jour + voix
//  (utile au gérant analphabète).
// ============================================================================

import { useEffect, useState } from 'react'
import { verifierMiseAJour, ouvrirTelechargement } from '../../lib/updateCheck.js'
import { useVoix } from '../../hooks/useVoix.js'

export default function MiseAJour() {
  const [maj, setMaj] = useState(null)
  const { parler } = useVoix()

  useEffect(() => {
    verifierMiseAJour()
      .then((m) => {
        if (m) {
          setMaj(m)
          parler('Une nouvelle version est disponible. Touchez le bouton vert pour mettre à jour.')
        }
      })
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!maj) return null

  return (
    <div className="fixed inset-0 bg-black/70 z-[100] flex items-center justify-center p-5">
      <div className="bg-white rounded-3xl p-6 max-w-sm w-full text-center shadow-2xl">
        <div className="text-7xl mb-2">⬆️📲</div>
        <h2 className="text-2xl font-black text-slate-800">Nouvelle version</h2>
        <p className="text-slate-500 mb-5">Version {maj.version} disponible</p>

        <button
          onClick={() => ouvrirTelechargement(maj.url)}
          className="btn-tactile bg-emerald-600 active:bg-emerald-700 text-white w-full h-20 text-3xl flex-row gap-3 mb-3"
        >
          ⬇️ METTRE À JOUR
        </button>
        <button onClick={() => setMaj(null)} className="text-slate-400 underline text-lg">
          Plus tard
        </button>
      </div>
    </div>
  )
}
