// ============================================================================
//  STOCK — PROFIL PROPRIÉTAIRE (lecture seule)
// ----------------------------------------------------------------------------
//  Stock actuel par boisson (calculé : entrées − sorties − casses), affiché en
//  casiers + bouteilles, avec alertes de rupture et valeur du stock
//  (stock × prix d'achat par bouteille). Se rafraîchit en temps réel.
// ============================================================================

import { useCallback, useEffect, useState } from 'react'
import * as Cloud from '../../supabase/api.js'
import PhotoBoisson from '../commun/PhotoBoisson.jsx'
import { formaterFCFA } from '../../utils/argent.js'

// bouteilles → "X cs + Y bt"
function enCasiers(bouteilles, bpc) {
  const b = Math.max(0, bouteilles)
  const cs = Math.floor(b / bpc)
  const reste = b % bpc
  return { cs, reste }
}

export default function StockPatron({ depotId }) {
  const [lignes, setLignes] = useState(null)

  const charger = useCallback(async () => {
    const [stocks, boissons] = await Promise.all([
      Cloud.calculerStocks(depotId),
      Cloud.listerBoissonsProprio(depotId),
    ])
    const parId = Object.fromEntries(boissons.map((b) => [b.id, b]))
    const out = stocks.map((s) => {
      const b = parId[s.id] || {}
      const bpc = b.bouteillesParCasier || 12
      const prixAchatBt = (Number(b.prixAchat) || 0) / bpc // prix_achat est PAR CASIER
      return {
        ...s,
        bpc,
        valeur: Math.max(0, s.stock) * prixAchatBt,
        photo: b.photo,
        prixAchat: b.prixAchat,
      }
    })
    // ruptures d'abord, puis stock croissant
    out.sort((a, b) => (a.enRupture === b.enRupture ? a.stock - b.stock : a.enRupture ? -1 : 1))
    setLignes(out)
  }, [depotId])

  useEffect(() => { charger() }, [charger])
  // Temps réel : une vente/réception/casse met à jour le stock
  useEffect(() => {
    if (!depotId) return
    const off = Cloud.abonnerChangements(depotId, charger)
    return off
  }, [depotId, charger])

  if (!lignes) return <div className="p-6 text-center text-slate-500">Chargement…</div>

  const valeurTotale = lignes.reduce((s, l) => s + l.valeur, 0)
  const nbRuptures = lignes.filter((l) => l.enRupture).length

  return (
    <div className="h-full overflow-y-auto no-scrollbar bg-slate-100 p-3 pb-20">
      {/* Synthèse */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-emerald-500 text-white rounded-xl p-3">
          <p className="text-xs opacity-90">Valeur du stock</p>
          <p className="font-black text-xl leading-tight">{formaterFCFA(valeurTotale)}</p>
        </div>
        <div className={`${nbRuptures ? 'bg-red-500' : 'bg-slate-400'} text-white rounded-xl p-3`}>
          <p className="text-xs opacity-90">Ruptures / alertes</p>
          <p className="font-black text-xl leading-tight">{nbRuptures}</p>
        </div>
      </div>

      {/* Liste */}
      <div className="bg-white rounded-xl p-2 shadow-sm">
        {lignes.map((l) => {
          const { cs, reste } = enCasiers(l.stock, l.bpc)
          return (
            <div key={l.id} className={`flex items-center gap-3 p-2 border-b last:border-0 ${l.enRupture ? 'bg-red-50' : ''}`}>
              <PhotoBoisson boisson={l} taille={44} />
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{l.nom}</p>
                <p className="text-xs text-slate-500">{formaterFCFA(l.valeur)}</p>
              </div>
              <div className="text-right shrink-0">
                <p className={`font-black ${l.enRupture ? 'text-red-600' : 'text-slate-800'}`}>
                  {cs} cs{reste ? ` + ${reste}` : ''}
                </p>
                <p className="text-[11px] text-slate-400">{Math.max(0, l.stock)} bouteilles</p>
              </div>
              {l.enRupture && <span className="text-xl">⚠️</span>}
            </div>
          )
        })}
        {lignes.length === 0 && <p className="text-slate-400 text-center py-6">Aucune boisson.</p>}
      </div>
    </div>
  )
}
