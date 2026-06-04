// ============================================================================
//  SUIVI DES VENTES EN DIRECT — PROFIL PROPRIÉTAIRE (MODE SUPABASE)
// ----------------------------------------------------------------------------
//  Abonnement Supabase Realtime sur `mouvements` : chaque vente (INSERT sortie)
//  apparaît instantanément en tête de liste, avec un indicateur "LIVE".
// ============================================================================

import { useEffect, useRef, useState } from 'react'
import * as Cloud from '../../supabase/api.js'
import { formaterFCFA } from '../../utils/argent.js'
import { useFeedback } from '../../hooks/useFeedback.js'

export default function VentesLive({ depotId }) {
  const [ventes, setVentes] = useState([])
  const [nomsBoissons, setNomsBoissons] = useState({})
  const { bip } = useFeedback()
  const initial = useRef(false)

  // Charge les noms de boissons (pour afficher autre chose que des UUID)
  useEffect(() => {
    Cloud.listerBoissonsProprio(depotId).then((bs) => {
      setNomsBoissons(Object.fromEntries(bs.map((b) => [b.id, b])))
    })
  }, [depotId])

  // Charge les dernières ventes du jour, puis s'abonne au temps réel
  useEffect(() => {
    if (!initial.current) {
      initial.current = true
      const debutJour = new Date()
      debutJour.setHours(0, 0, 0, 0)
      Cloud.listerMouvements(depotId, {
        type: 'sortie',
        statut: 'valide', // on n'affiche que les ventes VALIDÉES
        dateDebut: debutJour.toISOString(),
      }).then((lignes) => setVentes(lignes.slice(0, 50)))
    }

    const off = Cloud.abonnerVentes(depotId, (vente) => {
      bip(1175, 120) // petit signal sonore à chaque vente
      setVentes((prev) => [vente, ...prev].slice(0, 50))
    })
    return off
  }, [depotId, bip])

  return (
    <div className="h-full flex flex-col bg-slate-100">
      {/* Indicateur LIVE */}
      <div className="bg-slate-900 text-white px-4 py-2 flex items-center gap-2">
        <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
        <span className="font-bold">EN DIRECT</span>
        <span className="ml-auto text-sm text-slate-400">{ventes.length} vente(s) aujourd'hui</span>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar p-2 pb-20">
        {ventes.length === 0 && (
          <p className="text-center text-slate-400 mt-10">En attente de ventes…</p>
        )}
        {ventes.map((v, i) => {
          const b = nomsBoissons[v.boisson_id]
          return (
            <div
              key={v.id || i}
              className="bg-white rounded-lg p-3 mb-2 flex items-center gap-3 shadow-sm"
            >
              <span className="text-2xl">{b?.emoji || '🥤'}</span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{b?.nom || 'Boisson'}</p>
                <p className="text-xs text-slate-500">
                  {new Date(v.created_at).toLocaleTimeString('fr-FR')}
                </p>
              </div>
              <div className="text-right">
                <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold text-white bg-sortie">
                  ⬆️ ×{v.quantite}
                </span>
                <p className="text-sm font-bold mt-0.5">{formaterFCFA(v.montant_total)}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
