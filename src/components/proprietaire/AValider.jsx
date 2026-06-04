// ============================================================================
//  À VALIDER — PROFIL PROPRIÉTAIRE (file de validation)
// ----------------------------------------------------------------------------
//  Liste tout ce que le gérant a saisi et qui attend le patron : ventes,
//  réceptions, casses. Le patron peut CORRIGER le montant (ventes) ou la
//  quantité, puis ✓ Valider ou ✗ Rejeter. Se rafraîchit en TEMPS RÉEL.
//  Tant que ce n'est pas validé, rien n'est compté dans le CA ni le stock.
// ============================================================================

import { useCallback, useEffect, useState } from 'react'
import * as Cloud from '../../supabase/api.js'
import { formaterFCFA } from '../../utils/argent.js'
import { useFeedback } from '../../hooks/useFeedback.js'

// Apparence selon le type d'opération
const ASPECT = {
  sortie: { libelle: 'VENTE', ico: '⬆️🔴', couleur: 'border-red-400' },
  entree: { libelle: 'RÉCEPTION', ico: '⬇️🟢', couleur: 'border-green-400' },
  casse: { libelle: 'CASSE', ico: '🥃💥', couleur: 'border-amber-400' },
}

export default function AValider({ depotId, onMajCompteur }) {
  const [lignes, setLignes] = useState([])
  const [chargement, setChargement] = useState(true)
  const { clic, succes, erreur } = useFeedback()

  const charger = useCallback(async () => {
    const data = await Cloud.listerEnAttente(depotId)
    setLignes(data)
    setChargement(false)
    onMajCompteur?.(data.length)
  }, [depotId, onMajCompteur])

  useEffect(() => {
    charger()
  }, [charger])

  // Rafraîchissement temps réel (nouvelle saisie du gérant, etc.)
  useEffect(() => {
    const off = Cloud.abonnerChangements(depotId, () => charger())
    return off
  }, [depotId, charger])

  // Met à jour localement la valeur éditée d'une ligne
  const editer = (id, champ, valeur) =>
    setLignes((ls) => ls.map((l) => (l.id === id ? { ...l, [champ]: valeur } : l)))

  const valider = async (l) => {
    try {
      clic()
      if (l.kind === 'casse') {
        await Cloud.validerCasse(l.id, { quantite: l.quantite })
      } else if (l.type === 'sortie') {
        await Cloud.validerMouvement(l.id, { quantite: l.quantite, montant: l.montant })
      } else {
        await Cloud.validerMouvement(l.id, { quantite: l.quantite })
      }
      succes()
      // Retire la ligne validée de la file
      setLignes((ls) => {
        const reste = ls.filter((x) => x.id !== l.id)
        onMajCompteur?.(reste.length)
        return reste
      })
    } catch (e) {
      erreur()
      alert('Échec de la validation : ' + e.message)
    }
  }

  const rejeter = async (l) => {
    if (!confirm('Rejeter cette saisie ? Elle ne sera pas comptée.')) return
    try {
      erreur()
      if (l.kind === 'casse') await Cloud.rejeterCasse(l.id)
      else await Cloud.rejeterMouvement(l.id)
      setLignes((ls) => {
        const reste = ls.filter((x) => x.id !== l.id)
        onMajCompteur?.(reste.length)
        return reste
      })
    } catch (e) {
      alert('Échec du rejet : ' + e.message)
    }
  }

  if (chargement) return <div className="p-6 text-center text-slate-500">Chargement…</div>

  return (
    <div className="h-full flex flex-col bg-slate-100">
      <div className="bg-amber-500 text-white px-4 py-2 flex items-center gap-2">
        <span className="text-xl">📝</span>
        <span className="font-bold">À valider</span>
        <span className="ml-auto bg-white/25 rounded-full px-3 py-0.5 text-sm font-bold">
          {lignes.length}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar p-2 pb-20">
        {lignes.length === 0 && (
          <p className="text-center text-slate-400 mt-10">✅ Rien en attente — tout est validé</p>
        )}

        {lignes.map((l) => {
          const a = ASPECT[l.type] || ASPECT.sortie
          return (
            <div key={l.id} className={`bg-white rounded-xl p-3 mb-2 shadow-sm border-l-8 ${a.couleur}`}>
              {/* En-tête : type + boisson + unité + heure */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">{a.ico}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm">
                    {a.libelle}
                    {l.kind === 'mouvement' && (
                      <span className="ml-2 text-xs bg-slate-200 rounded px-1.5 py-0.5">
                        {l.unite === 'casier' ? '📦 casier' : '🍾 bouteille'}
                      </span>
                    )}
                    {l.kind === 'casse' && (
                      <span className="ml-2 text-xs bg-slate-200 rounded px-1.5 py-0.5">🍾 bouteille</span>
                    )}
                  </p>
                  <p className="text-sm text-slate-600 truncate">
                    {l.boisson?.emoji} {l.boisson?.nom || '(boisson)'}
                    {l.unite === 'casier' && l.quantiteBouteilles
                      ? ` — ${l.quantiteBouteilles} 🍾 au total`
                      : ''}
                  </p>
                </div>
                <span className="text-xs text-slate-400">
                  {new Date(l.created_at).toLocaleTimeString('fr-FR')}
                </span>
              </div>

              {/* Champs corrigeables : quantité (+ montant pour les ventes) */}
              <div className="flex items-end gap-2 mb-2">
                <label className="flex flex-col text-xs text-slate-500">
                  {l.unite === 'casier' ? 'Casiers' : 'Quantité'}
                  <input
                    type="number"
                    value={l.quantite}
                    onChange={(e) => editer(l.id, 'quantite', e.target.value)}
                    className="border rounded-lg p-2 w-20 text-lg font-bold"
                  />
                </label>
                {l.type === 'sortie' && (
                  <label className="flex flex-col text-xs text-slate-500 flex-1">
                    Montant (FCFA) — corrigeable
                    <input
                      type="number"
                      value={l.montant}
                      onChange={(e) => editer(l.id, 'montant', e.target.value)}
                      className="border rounded-lg p-2 w-full text-lg font-bold"
                    />
                  </label>
                )}
                {l.type === 'casse' && (
                  <span className="text-xs text-slate-500 flex-1 pb-2">
                    Coût ≈ {formaterFCFA(l.montant)}
                  </span>
                )}
              </div>

              {/* Boutons valider / rejeter */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => rejeter(l)}
                  className="bg-red-100 text-red-700 rounded-lg py-3 font-bold active:bg-red-200"
                >
                  ✗ Rejeter
                </button>
                <button
                  onClick={() => valider(l)}
                  className="bg-emerald-600 text-white rounded-lg py-3 font-bold active:bg-emerald-700"
                >
                  ✓ Valider
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
