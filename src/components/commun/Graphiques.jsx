// ============================================================================
//  GRAPHIQUES SVG LÉGERS — PROFIL PROPRIÉTAIRE
// ----------------------------------------------------------------------------
//  Composants de visualisation maison (sans librairie externe) pour rester
//  léger sur les téléphones bas de gamme :
//   - CourbeVentes  : courbe (line chart) du chiffre d'affaires par jour
//   - BarresTop     : barres horizontales du top des boissons vendues
// ============================================================================

import { formaterFCFA } from '../../utils/argent.js'

// ----------------------------------------------------------------------------
//  Courbe des ventes par jour
//  data : [{ jour: 'AAAA-MM-JJ', montant: number }]
// ----------------------------------------------------------------------------
export function CourbeVentes({ data }) {
  const L = 320 // largeur du repère
  const H = 140 // hauteur du repère
  const marge = 8

  if (!data || data.length === 0) {
    return <p className="text-slate-400 text-center py-8">Aucune vente sur la période</p>
  }

  const max = Math.max(...data.map((d) => d.montant), 1)
  const pas = data.length > 1 ? (L - 2 * marge) / (data.length - 1) : 0

  // Calcule les points (x,y) de la courbe
  const points = data.map((d, i) => {
    const x = marge + i * pas
    const y = H - marge - (d.montant / max) * (H - 2 * marge)
    return { x, y, ...d }
  })

  const chemin = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${L} ${H}`} className="w-full h-40">
        {/* Aire sous la courbe */}
        <path d={`${chemin} L ${points.at(-1).x} ${H - marge} L ${points[0].x} ${H - marge} Z`}
          fill="#6366f133" />
        {/* Courbe */}
        <path d={chemin} fill="none" stroke="#6366f1" strokeWidth="3" strokeLinejoin="round" />
        {/* Points */}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="3.5" fill="#6366f1" />
        ))}
      </svg>
      <div className="flex justify-between text-xs text-slate-400 px-1">
        <span>{data[0].jour.slice(5)}</span>
        <span>{data.at(-1).jour.slice(5)}</span>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------------
//  Barres horizontales : top des boissons vendues
//  data : [{ boisson: {...}, quantite, montant }]
// ----------------------------------------------------------------------------
export function BarresTop({ data }) {
  if (!data || data.length === 0) {
    return <p className="text-slate-400 text-center py-8">Aucune donnée</p>
  }
  const max = Math.max(...data.map((d) => d.quantite), 1)

  return (
    <div className="flex flex-col gap-2">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-2xl w-9 text-center">{d.boisson.emoji || '🥤'}</span>
          <div className="flex-1">
            <div className="flex justify-between text-sm mb-0.5">
              <span className="font-semibold truncate">{d.boisson.nom}</span>
              <span className="text-slate-500">{d.quantite} u.</span>
            </div>
            <div className="h-4 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(d.quantite / max) * 100}%`,
                  backgroundColor: d.boisson.couleurCasier || '#6366f1',
                }}
              />
            </div>
          </div>
          <span className="text-xs text-slate-500 w-24 text-right">{formaterFCFA(d.montant)}</span>
        </div>
      ))}
    </div>
  )
}
