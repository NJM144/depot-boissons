// ============================================================================
//  STOCK — PROFIL PROPRIÉTAIRE
// ----------------------------------------------------------------------------
//  Stock actuel par boisson (calculé : entrées − sorties − casses ± ajustements),
//  affiché en casiers + bouteilles, avec alertes de rupture et valeur du stock
//  (stock × prix d'achat par bouteille). Se rafraîchit en temps réel.
//  Le patron peut CORRIGER le stock : il tape le stock réel compté → un
//  ajustement d'inventaire est enregistré (sans toucher au CA ni aux marges).
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

// Date du jour au format 'AAAA-MM-JJ' (locale, pas UTC)
function aujourdhui() {
  const t = new Date()
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}

export default function StockPatron({ depotId }) {
  const [lignes, setLignes] = useState(null)
  const [corrige, setCorrige] = useState(null) // ligne en cours de correction (modale)
  const [mode, setMode] = useState('actuel') // 'actuel' | 'intervalle'

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
      {/* Bascule Stock actuel / Intervalle de dates */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <button
          onClick={() => setMode('actuel')}
          className={`rounded-xl py-3 font-bold text-sm ${
            mode === 'actuel' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600'
          }`}
        >
          📦 Stock actuel
        </button>
        <button
          onClick={() => setMode('intervalle')}
          className={`rounded-xl py-3 font-bold text-sm ${
            mode === 'intervalle' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600'
          }`}
        >
          📅 Intervalle
        </button>
      </div>

      {mode === 'intervalle' && <StockIntervalle depotId={depotId} />}
      {mode === 'actuel' && (
      <>
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

      <p className="text-xs text-slate-500 mb-2 px-1">👆 Touchez une boisson pour corriger son stock réel.</p>

      {/* Liste */}
      <div className="bg-white rounded-xl p-2 shadow-sm">
        {lignes.map((l) => {
          const { cs, reste } = enCasiers(l.stock, l.bpc)
          return (
            <button
              key={l.id}
              onClick={() => setCorrige(l)}
              className={`w-full text-left flex items-center gap-3 p-2 border-b last:border-0 active:bg-slate-50 ${l.enRupture ? 'bg-red-50' : ''}`}
            >
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
              <span className="text-slate-300 text-lg shrink-0">✏️</span>
            </button>
          )
        })}
        {lignes.length === 0 && <p className="text-slate-400 text-center py-6">Aucune boisson.</p>}
      </div>

      {corrige && (
        <ModalCorrection
          depotId={depotId}
          ligne={corrige}
          onFerme={() => setCorrige(null)}
          onSauve={() => { setCorrige(null); charger() }}
        />
      )}
      </>
      )}
    </div>
  )
}

// ----- Mouvements de stock sur un intervalle de dates (Du … au …) -----------
function StockIntervalle({ depotId }) {
  const [du, setDu] = useState(aujourdhui())
  const [au, setAu] = useState(aujourdhui())
  const [detail, setDetail] = useState(null)
  const [erreur, setErreur] = useState(null)

  useEffect(() => {
    let annule = false
    setErreur(null)
    Cloud.mouvementsStockIntervalle(depotId, du, au)
      .then((r) => { if (!annule) setDetail(r.detail || []) })
      .catch((e) => { if (!annule) setErreur(e.message || 'Erreur de chargement') })
    return () => { annule = true }
  }, [depotId, du, au])

  return (
    <div>
      <div className="bg-white rounded-xl p-3 mb-3 shadow-sm flex items-end gap-2">
        <label className="flex-1 text-xs font-semibold text-slate-600">
          Du
          <input type="date" value={du} max={au}
            onChange={(e) => setDu(e.target.value)}
            className="mt-1 border rounded-lg p-2 w-full text-sm font-normal text-slate-800" />
        </label>
        <label className="flex-1 text-xs font-semibold text-slate-600">
          Au
          <input type="date" value={au} min={du} max={aujourdhui()}
            onChange={(e) => setAu(e.target.value)}
            className="mt-1 border rounded-lg p-2 w-full text-sm font-normal text-slate-800" />
        </label>
      </div>

      {erreur && <p className="text-red-600 text-sm font-semibold mb-2 px-1">{erreur}</p>}
      {!detail && !erreur && <p className="text-slate-400 text-center py-6">Chargement…</p>}

      {detail && (
        <div className="bg-white rounded-xl p-2 shadow-sm overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="py-1 px-1">Boisson</th>
                <th className="text-right px-1">Reçu</th>
                <th className="text-right px-1">Vendu</th>
                <th className="text-right px-1">Cassé</th>
                <th className="text-right px-1">Ajust.</th>
                <th className="text-right px-1">Variation</th>
              </tr>
            </thead>
            <tbody>
              {detail.map((d) => (
                <tr key={d.boisson_id} className="border-b last:border-0">
                  <td className="py-1.5 px-1">{d.emoji} {d.nom}</td>
                  <td className="text-right px-1 text-emerald-600 font-semibold">
                    {d.entrees ? `+${d.entrees}` : 0}
                  </td>
                  <td className="text-right px-1 text-slate-700 font-semibold">{d.sorties || 0}</td>
                  <td className="text-right px-1 text-red-600 font-semibold">{d.casses || 0}</td>
                  <td className="text-right px-1 font-semibold">
                    {d.ajustements > 0 ? `+${d.ajustements}` : d.ajustements || 0}
                  </td>
                  <td className={`text-right px-1 font-bold ${d.variation_nette < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {d.variation_nette > 0 ? `+${d.variation_nette}` : d.variation_nette}
                  </td>
                </tr>
              ))}
              {detail.length === 0 && (
                <tr><td colSpan={6} className="text-slate-400 text-center py-6">Aucun mouvement sur cette période.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ----- Modale de correction du stock d'une boisson --------------------------
function ModalCorrection({ depotId, ligne, onFerme, onSauve }) {
  const bpc = ligne.bpc || 12
  const stockActuel = Math.max(0, ligne.stock)
  const { cs: csInit, reste: resteInit } = enCasiers(stockActuel, bpc)

  const [casiers, setCasiers] = useState(String(csInit))
  const [bouteilles, setBouteilles] = useState(String(resteInit))
  const [motif, setMotif] = useState('')
  const [historique, setHistorique] = useState([])
  const [err, setErr] = useState(null)
  const [enCours, setEnCours] = useState(false)

  useEffect(() => {
    Cloud.listerAjustements(depotId, ligne.id).then(setHistorique).catch(() => setHistorique([]))
  }, [depotId, ligne.id])

  const cible = (Number(casiers) || 0) * bpc + (Number(bouteilles) || 0)
  const delta = cible - stockActuel

  const enregistrer = async () => {
    setErr(null)
    if (cible < 0) return setErr('Le stock ne peut pas être négatif.')
    if (delta === 0) return setErr('Aucun écart : le stock saisi est déjà le stock actuel.')
    setEnCours(true)
    try {
      await Cloud.corrigerStock(ligne.id, cible, motif)
      onSauve()
    } catch (e) {
      console.error('corrigerStock', e)
      setErr(e.message || 'Erreur lors de la correction.')
    } finally {
      setEnCours(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end z-50">
      <div className="bg-white w-full rounded-t-3xl p-4 max-h-[92%] overflow-y-auto no-scrollbar">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <PhotoBoisson boisson={ligne} taille={32} /> {ligne.nom}
          </h3>
          <button onClick={onFerme} className="bg-slate-200 rounded-lg px-3 py-1 text-sm font-semibold">Fermer ✕</button>
        </div>

        <p className="text-sm text-slate-500 mb-3">
          Stock calculé actuel : <b className="text-slate-700">{enCasiers(stockActuel, bpc).cs} cs
          {enCasiers(stockActuel, bpc).reste ? ` + ${enCasiers(stockActuel, bpc).reste}` : ''}</b> ({stockActuel} bouteilles)
        </p>

        {/* Saisie du stock RÉEL compté */}
        <div className="bg-slate-50 rounded-xl p-3 mb-3">
          <label className="block text-xs font-semibold mb-1">📦 Stock réel compté</label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <input type="number" inputMode="numeric" min="0" value={casiers}
                onChange={(e) => setCasiers(e.target.value)}
                className="border rounded-lg p-2 w-full text-center text-lg font-bold" />
              <p className="text-[11px] text-center text-slate-500 mt-0.5">casiers</p>
            </div>
            <div>
              <input type="number" inputMode="numeric" min="0" value={bouteilles}
                onChange={(e) => setBouteilles(e.target.value)}
                className="border rounded-lg p-2 w-full text-center text-lg font-bold" />
              <p className="text-[11px] text-center text-slate-500 mt-0.5">bouteilles (1 cs = {bpc})</p>
            </div>
          </div>

          {/* Aperçu de l'écart */}
          <div className="mt-2 text-center text-sm">
            Nouveau stock : <b>{cible} bouteilles</b>{' · '}
            écart{' '}
            <b className={delta === 0 ? 'text-slate-500' : delta > 0 ? 'text-emerald-600' : 'text-red-600'}>
              {delta > 0 ? `+${delta}` : delta}
            </b>
          </div>
        </div>

        <label className="block text-xs font-semibold mb-1">Motif (facultatif)</label>
        <input value={motif} onChange={(e) => setMotif(e.target.value)}
          className="border rounded-lg p-2 w-full mb-2" placeholder="Ex : inventaire, vol, casse non saisie…" />

        {err && <p className="text-red-600 text-sm font-semibold mb-2">{err}</p>}

        <button onClick={enregistrer} disabled={enCours}
          className="w-full bg-indigo-600 active:bg-indigo-700 disabled:opacity-50 text-white rounded-lg py-3 font-bold mb-3">
          {enCours ? 'Enregistrement…' : '💾 Enregistrer la correction'}
        </button>

        {/* Historique des corrections de cette boisson */}
        {historique.length > 0 && (
          <div>
            <h4 className="font-bold text-slate-700 text-sm mb-1">🕓 Corrections précédentes</h4>
            {historique.map((h) => (
              <div key={h.id} className="flex items-center justify-between border-b last:border-0 py-1.5 text-xs">
                <span className="text-slate-500">
                  {new Date(h.created_at).toLocaleDateString('fr-FR')} {h.motif ? `· ${h.motif}` : ''}
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-slate-400">{h.stock_avant}→{h.stock_apres}</span>
                  <b className={h.delta > 0 ? 'text-emerald-600' : 'text-red-600'}>
                    {h.delta > 0 ? `+${h.delta}` : h.delta}
                  </b>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
