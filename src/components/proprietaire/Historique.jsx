// ============================================================================
//  HISTORIQUE & FILTRES — PROFIL PROPRIÉTAIRE
// ----------------------------------------------------------------------------
//  Liste des mouvements jour par jour avec filtres (date, boisson, type) et
//  export CSV / PDF. Chaque ligne : date, produit, sens, quantité, montant.
// ============================================================================

import { useEffect, useMemo, useState } from 'react'
import * as DB from '../../db/database.js'
import { formaterFCFA } from '../../utils/argent.js'
import { exporterCSV, exporterPDF } from '../../utils/export.js'

export default function Historique() {
  const [boissons, setBoissons] = useState([])
  const [mouvements, setMouvements] = useState([])

  // Filtres
  const [filtreBoisson, setFiltreBoisson] = useState('')
  const [filtreType, setFiltreType] = useState('')
  const [dateDebut, setDateDebut] = useState('')
  const [dateFin, setDateFin] = useState('')

  // Charge le catalogue (pour afficher les noms)
  useEffect(() => {
    DB.listerBoissons({ inclureInactives: true }).then(setBoissons)
  }, [])

  // Recharge les mouvements à chaque changement de filtre
  useEffect(() => {
    DB.listerMouvements({
      boissonId: filtreBoisson ? Number(filtreBoisson) : undefined,
      type: filtreType || undefined,
      dateDebut: dateDebut || undefined,
      dateFin: dateFin || undefined,
    }).then(setMouvements)
  }, [filtreBoisson, filtreType, dateDebut, dateFin])

  // Associe le nom de boisson à chaque mouvement
  const lignes = useMemo(() => {
    const parId = new Map(boissons.map((b) => [b.id, b]))
    return mouvements.map((m) => ({
      ...m,
      nomBoisson: parId.get(m.boissonId)?.nom || '(supprimée)',
      emoji: parId.get(m.boissonId)?.emoji || '🥤',
    }))
  }, [mouvements, boissons])

  // Total des ventes affichées
  const totalVentes = lignes
    .filter((l) => l.type === 'sortie')
    .reduce((s, l) => s + l.montant, 0)

  const reinitialiser = () => {
    setFiltreBoisson('')
    setFiltreType('')
    setDateDebut('')
    setDateFin('')
  }

  return (
    <div className="h-full flex flex-col bg-slate-100">
      {/* ---- BARRE DE FILTRES ---- */}
      <div className="bg-white p-3 shadow-sm space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <select
            value={filtreBoisson}
            onChange={(e) => setFiltreBoisson(e.target.value)}
            className="border rounded-lg p-2 text-sm"
          >
            <option value="">Toutes les boissons</option>
            {boissons.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nom}
              </option>
            ))}
          </select>
          <select
            value={filtreType}
            onChange={(e) => setFiltreType(e.target.value)}
            className="border rounded-lg p-2 text-sm"
          >
            <option value="">Entrées + Sorties</option>
            <option value="entree">Entrées (reçu)</option>
            <option value="sortie">Sorties (vendu)</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-slate-500 flex flex-col">
            Du
            <input
              type="date"
              value={dateDebut}
              onChange={(e) => setDateDebut(e.target.value)}
              className="border rounded-lg p-2 text-sm"
            />
          </label>
          <label className="text-xs text-slate-500 flex flex-col">
            Au
            <input
              type="date"
              value={dateFin}
              onChange={(e) => setDateFin(e.target.value)}
              className="border rounded-lg p-2 text-sm"
            />
          </label>
        </div>
        <div className="flex gap-2">
          <button onClick={reinitialiser} className="flex-1 bg-slate-200 rounded-lg py-2 text-sm font-semibold">
            ♻️ Réinitialiser
          </button>
          <button
            onClick={() => exporterCSV(lignes)}
            className="flex-1 bg-emerald-600 text-white rounded-lg py-2 text-sm font-semibold"
          >
            ⬇️ CSV
          </button>
          <button
            onClick={() => exporterPDF(lignes)}
            className="flex-1 bg-red-600 text-white rounded-lg py-2 text-sm font-semibold"
          >
            📄 PDF
          </button>
        </div>
      </div>

      {/* ---- TOTAL ---- */}
      <div className="bg-indigo-600 text-white px-3 py-2 flex justify-between text-sm">
        <span>{lignes.length} mouvement(s)</span>
        <span className="font-bold">Ventes : {formaterFCFA(totalVentes)}</span>
      </div>

      {/* ---- LISTE ---- */}
      <div className="flex-1 overflow-y-auto no-scrollbar p-2 pb-20">
        {lignes.length === 0 && (
          <p className="text-center text-slate-400 mt-10">Aucun mouvement</p>
        )}
        {lignes.map((l) => (
          <div key={l.id} className="bg-white rounded-lg p-3 mb-2 flex items-center gap-3 shadow-sm">
            <span className="text-2xl">{l.emoji}</span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate">{l.nomBoisson}</p>
              <p className="text-xs text-slate-500">
                {l.dateJour} · {new Date(l.timestamp).toLocaleTimeString('fr-FR')}
              </p>
            </div>
            <div className="text-right">
              <span
                className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold text-white ${
                  l.type === 'entree' ? 'bg-entree' : 'bg-sortie'
                }`}
              >
                {l.type === 'entree' ? '⬇️ Reçu' : '⬆️ Vendu'} ×{l.quantite}
              </span>
              <p className="text-sm font-bold mt-0.5">{formaterFCFA(l.montant)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
