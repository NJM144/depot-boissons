// ============================================================================
//  LE POINT PAR PÉRIODE — PROFIL PROPRIÉTAIRE (MODE SUPABASE)
// ----------------------------------------------------------------------------
//  Sélecteur JOUR / SEMAINE / MOIS → appelle la RPC get_point.
//  Affiche : Chiffre d'affaires, Marge totale, Coût des casses, MARGE NETTE,
//  un graphique d'évolution (CA + marge) et le détail des marges par boisson
//  (prix d'achat vs prix de vente). Se rafraîchit en TEMPS RÉEL à chaque vente.
// ============================================================================

import { useCallback, useEffect, useState } from 'react'
import * as Cloud from '../../supabase/api.js'
import { formaterFCFA } from '../../utils/argent.js'

const PERIODES = [
  { cle: 'jour', label: 'JOUR' },
  { cle: 'semaine', label: 'SEMAINE' },
  { cle: 'mois', label: 'MOIS' },
]

// Date du jour au format 'AAAA-MM-JJ' (locale, pas UTC)
function aujourdhui() {
  const t = new Date()
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}

export default function PointPeriodique({ depotId }) {
  const [periode, setPeriode] = useState('jour') // 'jour' | 'semaine' | 'mois' | 'plage'
  const [du, setDu] = useState(aujourdhui())
  const [au, setAu] = useState(aujourdhui())
  const [point, setPoint] = useState(null)
  const [histo, setHisto] = useState([])

  // Charge le point + l'historique pour le graphique
  const charger = useCallback(async () => {
    const [p, h] =
      periode === 'plage'
        ? await Promise.all([
            Cloud.getPointIntervalle(depotId, du, au),
            Cloud.pointHistoriqueIntervalle(depotId, du, au),
          ])
        : await Promise.all([
            Cloud.getPoint(depotId, periode),
            Cloud.pointHistorique(depotId, periode),
          ])
    setPoint(p)
    setHisto(h)
  }, [depotId, periode, du, au])

  useEffect(() => {
    charger()
  }, [charger])

  // Rafraîchissement temps réel : chaque vente recharge le point
  useEffect(() => {
    const off = Cloud.abonnerVentes(depotId, () => charger())
    return off
  }, [depotId, charger])

  if (!point) return <div className="p-6 text-center text-slate-500">Chargement…</div>

  return (
    <div className="h-full overflow-y-auto no-scrollbar bg-slate-100 p-3 pb-20">
      {/* Sélecteur de période */}
      <div className="grid grid-cols-4 gap-2 mb-2">
        {PERIODES.map((p) => (
          <button
            key={p.cle}
            onClick={() => setPeriode(p.cle)}
            className={`rounded-xl py-3 font-bold text-sm ${
              periode === p.cle ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600'
            }`}
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={() => setPeriode('plage')}
          className={`rounded-xl py-3 font-bold text-sm ${
            periode === 'plage' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600'
          }`}
        >
          📅 Dates
        </button>
      </div>

      {/* Panneau plage de dates (du … au …) */}
      {periode === 'plage' && (
        <div className="bg-white rounded-xl p-3 mb-3 shadow-sm flex items-end gap-2">
          <label className="flex-1 text-xs font-semibold text-slate-600">
            Du
            <input
              type="date"
              value={du}
              max={au}
              onChange={(e) => setDu(e.target.value)}
              className="mt-1 border rounded-lg p-2 w-full text-sm font-normal text-slate-800"
            />
          </label>
          <label className="flex-1 text-xs font-semibold text-slate-600">
            Au
            <input
              type="date"
              value={au}
              min={du}
              max={aujourdhui()}
              onChange={(e) => setAu(e.target.value)}
              className="mt-1 border rounded-lg p-2 w-full text-sm font-normal text-slate-800"
            />
          </label>
        </div>
      )}

      {/* Cartes de synthèse */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <Carte titre="Chiffre d'affaires" valeur={point.chiffre_affaires} couleur="bg-emerald-500" />
        <Carte titre="Marge totale" valeur={point.total_marge} couleur="bg-indigo-500" />
        <Carte titre="Coût des casses" valeur={point.total_casse_cout} couleur="bg-amber-500" />
        <Carte titre="MARGE NETTE" valeur={point.marge_nette} couleur="bg-purple-600" forte />
      </div>

      {/* Graphique d'évolution (CA + marge) */}
      <div className="bg-white rounded-xl p-3 mb-3 shadow-sm">
        <h3 className="font-bold text-slate-700 mb-2">📈 Évolution (CA + marge)</h3>
        <GraphiqueDouble data={histo} />
      </div>

      {/* Détail des marges par boisson */}
      <div className="bg-white rounded-xl p-3 shadow-sm">
        <h3 className="font-bold text-slate-700 mb-2">💵 Détail des marges par boisson</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b">
              <th className="py-1">Boisson</th>
              <th className="text-right">Achat<span className="text-[10px] text-slate-400">/cs</span></th>
              <th className="text-right">Vente<span className="text-[10px] text-slate-400">/cs</span></th>
              <th className="text-right">Vendu<span className="text-[10px] text-slate-400">/bt</span></th>
              <th className="text-right">Marge</th>
            </tr>
          </thead>
          <tbody>
            {(point.detail || []).map((d) => (
              <tr key={d.boisson_id} className="border-b last:border-0">
                <td className="py-1.5">{d.emoji} {d.nom}</td>
                <td className="text-right text-slate-500">{Number(d.prix_achat).toLocaleString('fr-FR')}</td>
                <td className="text-right text-slate-500">{Number(d.prix_vente).toLocaleString('fr-FR')}</td>
                <td className="text-right font-semibold">{d.quantite_vendue}</td>
                <td className={`text-right font-bold ${Number(d.marge) < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  {Number(d.marge).toLocaleString('fr-FR')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Carte de synthèse
function Carte({ titre, valeur, couleur, forte }) {
  return (
    <div className={`${couleur} text-white rounded-xl p-3 ${forte ? 'col-span-2' : ''}`}>
      <p className="text-xs opacity-90">{titre}</p>
      <p className={`font-black leading-tight ${forte ? 'text-3xl' : 'text-xl'}`}>
        {formaterFCFA(valeur)}
      </p>
    </div>
  )
}

// Graphique SVG : deux courbes (CA en indigo, marge en vert)
function GraphiqueDouble({ data }) {
  const L = 320
  const H = 140
  const m = 8
  if (!data || data.length === 0)
    return <p className="text-slate-400 text-center py-8">Aucune donnée</p>

  const max = Math.max(...data.map((d) => Number(d.total_sorties)), 1)
  const pas = data.length > 1 ? (L - 2 * m) / (data.length - 1) : 0

  // Construit le chemin d'une série
  const chemin = (champ) =>
    data
      .map((d, i) => {
        const x = m + i * pas
        const y = H - m - (Number(d[champ]) / max) * (H - 2 * m)
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
      })
      .join(' ')

  return (
    <div>
      <svg viewBox={`0 0 ${L} ${H}`} className="w-full h-40">
        <path d={chemin('total_sorties')} fill="none" stroke="#6366f1" strokeWidth="3" />
        <path d={chemin('total_marge')} fill="none" stroke="#16a34a" strokeWidth="3" strokeDasharray="4 3" />
      </svg>
      <div className="flex gap-4 justify-center text-xs">
        <span className="text-indigo-600 font-semibold">— CA</span>
        <span className="text-emerald-600 font-semibold">- - Marge</span>
      </div>
    </div>
  )
}
