// ============================================================================
//  GESTION DU CATALOGUE — PROFIL PROPRIÉTAIRE (MODE SUPABASE)
// ----------------------------------------------------------------------------
//  Comme GestionCatalogue (local) mais branché sur Supabase et avec DEUX prix :
//   - prix_achat (sensible, invisible au gérant) → sert au calcul des marges
//   - prix_vente (visible) → alimente le clavier monétaire du gérant
//  Les photos enregistrées ici alimentent automatiquement l'écran du gérant.
// ============================================================================

import { useEffect, useRef, useState } from 'react'
import * as Cloud from '../../supabase/api.js'
import PhotoBoisson from '../commun/PhotoBoisson.jsx'
import { formaterFCFA } from '../../utils/argent.js'

const COULEURS = ['#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0d9488', '#0ea5e9', '#3b82f6', '#9333ea', '#64748b']

// Redimensionne une image pour limiter le poids stocké
function redimensionner(file, maxDim = 400) {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const r = Math.min(maxDim / img.width, maxDim / img.height, 1)
        const w = Math.round(img.width * r)
        const h = Math.round(img.height * r)
        const c = document.createElement('canvas')
        c.width = w
        c.height = h
        c.getContext('2d').drawImage(img, 0, 0, w, h)
        resolve(c.toDataURL('image/jpeg', 0.7))
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })
}

const VIDE = { nom: '', emoji: '🥤', photo: null, couleurCasier: '#3b82f6', prixAchat: 0, prixVente: 500, bouteillesParCasier: 12, seuilAlerte: 5 }

export default function CatalogueSupabase({ depotId }) {
  const [boissons, setBoissons] = useState([])
  const [edition, setEdition] = useState(null)
  const fileRef = useRef(null)

  const recharger = () => Cloud.listerBoissonsProprio(depotId).then(setBoissons)
  useEffect(() => {
    recharger()
  }, [depotId])

  const ouvrir = (b) => setEdition(b ? { ...b } : { ...VIDE })

  const choisirPhoto = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const dataURL = await redimensionner(file)
    setEdition((ed) => ({ ...ed, photo: dataURL }))
  }

  const enregistrer = async () => {
    if (!edition.nom.trim()) {
      alert('Le nom est obligatoire.')
      return
    }
    if (edition.id) await Cloud.modifierBoisson(edition.id, edition)
    else await Cloud.ajouterBoisson(depotId, edition)
    setEdition(null)
    recharger()
  }

  const supprimer = async (b) => {
    if (confirm(`Retirer "${b.nom}" du catalogue ?`)) {
      await Cloud.supprimerBoisson(b.id)
      recharger()
    }
  }

  return (
    <div className="h-full flex flex-col bg-slate-100">
      <div className="bg-white p-3 shadow-sm flex items-center justify-between">
        <h3 className="font-bold text-slate-700">📚 Catalogue ({boissons.length})</h3>
        <button onClick={() => ouvrir(null)} className="bg-emerald-600 text-white rounded-lg px-4 py-2 font-semibold">
          ➕ Ajouter
        </button>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar p-2 pb-20">
        {boissons.map((b) => (
          <div key={b.id} className="bg-white rounded-lg p-3 mb-2 flex items-center gap-3 shadow-sm">
            <PhotoBoisson boisson={b} taille={48} />
            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate">{b.nom}</p>
              <p className="text-sm text-slate-500">
                Achat {formaterFCFA(b.prixAchat)} · Vente {formaterFCFA(b.prixVente)} <span className="text-slate-400">/ casier</span>
              </p>
            </div>
            <button onClick={() => ouvrir(b)} className="bg-slate-200 rounded-lg px-3 py-2">✏️</button>
            <button onClick={() => supprimer(b)} className="bg-red-100 text-red-600 rounded-lg px-3 py-2">🗑️</button>
          </div>
        ))}
      </div>

      {/* Formulaire modale */}
      {edition && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50">
          <div className="bg-white w-full rounded-t-3xl p-4 max-h-[90%] overflow-y-auto no-scrollbar">
            <h3 className="text-lg font-bold mb-3">{edition.id ? '✏️ Modifier' : '➕ Nouvelle boisson'}</h3>

            <div className="flex items-center gap-4 mb-3">
              <PhotoBoisson boisson={edition} taille={80} />
              <div className="flex flex-col gap-2">
                <button onClick={() => fileRef.current?.click()} className="bg-indigo-600 text-white rounded-lg px-3 py-2 text-sm">
                  📷 Photo
                </button>
                {edition.photo && (
                  <button onClick={() => setEdition((ed) => ({ ...ed, photo: null }))} className="bg-slate-200 rounded-lg px-3 py-2 text-sm">
                    Retirer
                  </button>
                )}
                <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={choisirPhoto} className="hidden" />
              </div>
            </div>

            <label className="block text-sm font-semibold mb-1">Nom</label>
            <input value={edition.nom} onChange={(e) => setEdition({ ...edition, nom: e.target.value })} className="border rounded-lg p-2 w-full mb-3" placeholder="Ex : Coca-Cola" />

            <label className="block text-sm font-semibold mb-1">Emoji (si pas de photo)</label>
            <input value={edition.emoji} onChange={(e) => setEdition({ ...edition, emoji: e.target.value })} className="border rounded-lg p-2 w-full mb-3 text-2xl" maxLength={2} />

            <label className="block text-sm font-semibold mb-1">Couleur du casier</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {COULEURS.map((c) => (
                <button key={c} onClick={() => setEdition({ ...edition, couleurCasier: c })} style={{ backgroundColor: c }}
                  className={`w-10 h-10 rounded-full ${edition.couleurCasier === c ? 'ring-4 ring-offset-2 ring-slate-800' : ''}`} />
              ))}
            </div>

            <p className="text-xs text-slate-500 mb-1">💡 Les prix sont <b>par casier</b> (le prix d'une bouteille = prix ÷ bouteilles par casier).</p>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div>
                <label className="block text-xs font-semibold mb-1">Achat / casier (FCFA)</label>
                <input type="number" value={edition.prixAchat} onChange={(e) => setEdition({ ...edition, prixAchat: e.target.value })} className="border rounded-lg p-2 w-full" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Vente / casier (FCFA)</label>
                <input type="number" value={edition.prixVente} onChange={(e) => setEdition({ ...edition, prixVente: e.target.value })} className="border rounded-lg p-2 w-full" />
              </div>
            </div>
            {(() => {
              const bpc = Number(edition.bouteillesParCasier) || 12
              const aBt = (Number(edition.prixAchat) || 0) / bpc
              const vBt = (Number(edition.prixVente) || 0) / bpc
              return (
                <p className="text-xs text-emerald-700 bg-emerald-50 rounded-lg p-2 mb-2">
                  🍾 Par bouteille : achat <b>{formaterFCFA(Math.round(aBt))}</b> · vente <b>{formaterFCFA(Math.round(vBt))}</b>
                </p>
              )
            })()}
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div>
                <label className="block text-xs font-semibold mb-1">Bouteilles / casier 📦</label>
                <input type="number" value={edition.bouteillesParCasier} onChange={(e) => setEdition({ ...edition, bouteillesParCasier: e.target.value })} className="border rounded-lg p-2 w-full" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Seuil rupture (bouteilles)</label>
                <input type="number" value={edition.seuilAlerte} onChange={(e) => setEdition({ ...edition, seuilAlerte: e.target.value })} className="border rounded-lg p-2 w-full" />
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setEdition(null)} className="flex-1 bg-slate-200 rounded-lg py-3 font-semibold">Annuler</button>
              <button onClick={enregistrer} className="flex-1 bg-emerald-600 text-white rounded-lg py-3 font-semibold">💾 Enregistrer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
