// ============================================================================
//  COMMANDE / CALCULATRICE — PROFIL GÉRANT (analphabète, 100% visuel)
// ----------------------------------------------------------------------------
//  Aide au calcul des commandes de réapprovisionnement :
//   - une vignette par boisson (image) avec son STOCK actuel (casiers + bout.)
//   - un compteur géant + / − pour le nombre de CASIERS à commander
//   - totaux en bas (casiers + bouteilles) + lecture vocale
//  100% local et jetable : rien n'est enregistré (pas de prix, masqué au gérant).
// ============================================================================

import { useEffect, useState } from 'react'
import { useVoix } from '../../hooks/useVoix.js'
import { useFeedback } from '../../hooks/useFeedback.js'
import PhotoBoisson from '../commun/PhotoBoisson.jsx'

export default function CommandeCalculatrice({ boissons, adapter, onTermine }) {
  const { parler } = useVoix()
  const { clic } = useFeedback()
  const [stocks, setStocks] = useState({})        // id -> { stock, enRupture }
  const [commande, setCommande] = useState({})     // id -> casiers à commander

  useEffect(() => {
    adapter.calculerStocks?.()
      .then((arr) => setStocks(Object.fromEntries((arr || []).map((s) => [s.id, s]))))
      .catch(() => {})
  }, [adapter])

  const bpcDe = (b) => b.bouteillesParCasier || 12
  const modifier = (b, delta) => {
    clic()
    setCommande((c) => {
      const n = Math.max(0, (c[b.id] || 0) + delta)
      if (delta > 0) parler(`${n}`)
      return { ...c, [b.id]: n }
    })
  }

  const totalCasiers = boissons.reduce((s, b) => s + (commande[b.id] || 0), 0)
  const totalBouteilles = boissons.reduce((s, b) => s + (commande[b.id] || 0) * bpcDe(b), 0)

  const lire = () => {
    const lignes = boissons.filter((b) => commande[b.id] > 0).map((b) => `${commande[b.id]} casiers de ${b.nom}`)
    parler(lignes.length ? `${lignes.join(', ')}. Total ${totalCasiers} casiers.` : 'Aucune commande')
  }
  const vider = () => { clic(); setCommande({}); parler('Effacé') }

  // bouteilles -> "X cs + Y"
  const stockTexte = (b) => {
    const st = Math.max(0, stocks[b.id]?.stock ?? 0)
    const bpc = bpcDe(b)
    const cs = Math.floor(st / bpc)
    const r = st % bpc
    return `${cs} cs${r ? ` + ${r}` : ''}`
  }

  return (
    <div className="h-full flex flex-col bg-slate-900">
      <div className="text-center text-white py-2 text-2xl font-black">🛒 Ma commande</div>

      {/* Grille des boissons */}
      <div className="flex-1 overflow-y-auto no-scrollbar p-3">
        <div className="grid grid-cols-2 gap-3">
          {boissons.map((b) => {
            const n = commande[b.id] || 0
            const rupture = stocks[b.id]?.enRupture
            return (
              <div key={b.id} style={{ borderColor: b.couleurCasier }}
                className={`bg-white border-8 rounded-2xl p-2 flex flex-col items-center gap-1 ${n > 0 ? 'ring-4 ring-emerald-400' : ''}`}>
                <PhotoBoisson boisson={b} taille={80} />
                <span className="text-slate-800 text-sm font-bold truncate w-full text-center">{b.nom}</span>
                {/* Stock actuel */}
                <span className={`text-xs font-semibold ${rupture ? 'text-red-600' : 'text-slate-500'}`}>
                  📦 {stockTexte(b)} {rupture && '⚠️'}
                </span>
                {/* Compteur casiers */}
                <div className="flex items-center gap-2 mt-1">
                  <button onClick={() => modifier(b, -1)}
                    className="btn-tactile bg-red-500 active:bg-red-600 text-white w-12 h-12 text-3xl rounded-xl">−</button>
                  <span className="text-3xl font-black w-10 text-center">{n}</span>
                  <button onClick={() => modifier(b, +1)}
                    className="btn-tactile bg-emerald-600 active:bg-emerald-700 text-white w-12 h-12 text-3xl rounded-xl">+</button>
                </div>
              </div>
            )
          })}
        </div>
        {boissons.length === 0 && <p className="text-white text-center text-xl mt-10">Aucune boisson 😶</p>}
      </div>

      {/* Barre de totaux + actions */}
      <div className="bg-slate-800 text-white p-3">
        <div className="flex items-center justify-around mb-2">
          <div className="text-center">
            <p className="text-xs opacity-80">Casiers</p>
            <p className="text-3xl font-black">{totalCasiers}</p>
          </div>
          <div className="text-center">
            <p className="text-xs opacity-80">Bouteilles</p>
            <p className="text-3xl font-black">{totalBouteilles}</p>
          </div>
          <button onClick={lire} className="btn-tactile bg-indigo-600 active:bg-indigo-700 text-white w-16 h-16 text-3xl rounded-xl">🔊</button>
        </div>
        <div className="flex gap-2">
          <button onClick={vider} className="btn-tactile bg-amber-600 active:bg-amber-700 text-white flex-1 h-14 text-xl">🗑️ Effacer</button>
          <button onClick={onTermine} className="btn-tactile bg-slate-600 active:bg-slate-700 text-white flex-1 h-14 text-xl">✓ Fini</button>
        </div>
      </div>
    </div>
  )
}
