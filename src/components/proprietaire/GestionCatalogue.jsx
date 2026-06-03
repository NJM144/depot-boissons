// ============================================================================
//  GESTION DU CATALOGUE — PROFIL PROPRIÉTAIRE
// ----------------------------------------------------------------------------
//  Ajouter / modifier / désactiver les boissons : nom, photo, prix de
//  référence, couleur de casier, emoji, seuil d'alerte de rupture.
//  Les photos enregistrées ici alimentent AUTOMATIQUEMENT l'écran du gérant.
// ============================================================================

import { useEffect, useRef, useState } from 'react'
import * as DB from '../../db/database.js'
import PhotoBoisson from '../commun/PhotoBoisson.jsx'
import { formaterFCFA } from '../../utils/argent.js'

// Palette de couleurs de casier proposées
const COULEURS = ['#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0d9488', '#0ea5e9', '#3b82f6', '#9333ea', '#64748b']

// Redimensionne une image (dataURL) pour limiter le poids stocké en base
function redimensionnerImage(file, maxDim = 400) {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const ratio = Math.min(maxDim / img.width, maxDim / img.height, 1)
        const w = Math.round(img.width * ratio)
        const h = Math.round(img.height * ratio)
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', 0.7))
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })
}

const VIDE = {
  nom: '',
  emoji: '🥤',
  photo: null,
  couleurCasier: '#3b82f6',
  prixReference: 500,
  seuilAlerte: 5,
}

export default function GestionCatalogue() {
  const [boissons, setBoissons] = useState([])
  const [edition, setEdition] = useState(null) // boisson en cours d'édition (ou null)
  const fileRef = useRef(null)

  const recharger = () => DB.listerBoissons({ inclureInactives: false }).then(setBoissons)
  useEffect(() => {
    recharger()
  }, [])

  // Ouvre le formulaire (nouveau ou existant)
  const ouvrir = (b) => setEdition(b ? { ...b } : { ...VIDE })

  // Prise/choix de photo
  const choisirPhoto = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const dataURL = await redimensionnerImage(file)
    setEdition((ed) => ({ ...ed, photo: dataURL }))
  }

  // Enregistre (création ou mise à jour)
  const enregistrer = async () => {
    if (!edition.nom.trim()) {
      alert('Le nom est obligatoire.')
      return
    }
    if (edition.id) {
      await DB.modifierBoisson(edition.id, {
        nom: edition.nom,
        emoji: edition.emoji,
        photo: edition.photo,
        couleurCasier: edition.couleurCasier,
        prixReference: Number(edition.prixReference) || 0,
        seuilAlerte: Number(edition.seuilAlerte) || 0,
      })
    } else {
      await DB.ajouterBoisson(edition)
    }
    setEdition(null)
    recharger()
  }

  const supprimer = async (b) => {
    if (confirm(`Retirer "${b.nom}" du catalogue ?`)) {
      await DB.supprimerBoisson(b.id)
      recharger()
    }
  }

  return (
    <div className="h-full flex flex-col bg-slate-100">
      {/* En-tête + bouton ajouter */}
      <div className="bg-white p-3 shadow-sm flex items-center justify-between">
        <h3 className="font-bold text-slate-700">📚 Catalogue ({boissons.length})</h3>
        <button
          onClick={() => ouvrir(null)}
          className="bg-emerald-600 text-white rounded-lg px-4 py-2 font-semibold"
        >
          ➕ Ajouter
        </button>
      </div>

      {/* Liste du catalogue */}
      <div className="flex-1 overflow-y-auto no-scrollbar p-2 pb-20">
        {boissons.map((b) => (
          <div key={b.id} className="bg-white rounded-lg p-3 mb-2 flex items-center gap-3 shadow-sm">
            <PhotoBoisson boisson={b} taille={48} />
            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate">{b.nom}</p>
              <p className="text-sm text-slate-500">{formaterFCFA(b.prixReference)}</p>
            </div>
            <button onClick={() => ouvrir(b)} className="bg-slate-200 rounded-lg px-3 py-2">✏️</button>
            <button onClick={() => supprimer(b)} className="bg-red-100 text-red-600 rounded-lg px-3 py-2">🗑️</button>
          </div>
        ))}
      </div>

      {/* ---- FORMULAIRE (modale) ---- */}
      {edition && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50">
          <div className="bg-white w-full rounded-t-3xl p-4 max-h-[90%] overflow-y-auto no-scrollbar">
            <h3 className="text-lg font-bold mb-3">
              {edition.id ? '✏️ Modifier' : '➕ Nouvelle boisson'}
            </h3>

            {/* Aperçu + photo */}
            <div className="flex items-center gap-4 mb-3">
              <PhotoBoisson boisson={edition} taille={80} />
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => fileRef.current?.click()}
                  className="bg-indigo-600 text-white rounded-lg px-3 py-2 text-sm"
                >
                  📷 Photo
                </button>
                {edition.photo && (
                  <button
                    onClick={() => setEdition((ed) => ({ ...ed, photo: null }))}
                    className="bg-slate-200 rounded-lg px-3 py-2 text-sm"
                  >
                    Retirer la photo
                  </button>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={choisirPhoto}
                  className="hidden"
                />
              </div>
            </div>

            {/* Champs */}
            <label className="block text-sm font-semibold mb-1">Nom</label>
            <input
              value={edition.nom}
              onChange={(e) => setEdition({ ...edition, nom: e.target.value })}
              className="border rounded-lg p-2 w-full mb-3"
              placeholder="Ex : Coca-Cola"
            />

            <label className="block text-sm font-semibold mb-1">Emoji (si pas de photo)</label>
            <input
              value={edition.emoji}
              onChange={(e) => setEdition({ ...edition, emoji: e.target.value })}
              className="border rounded-lg p-2 w-full mb-3 text-2xl"
              maxLength={2}
            />

            <label className="block text-sm font-semibold mb-1">Couleur du casier</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {COULEURS.map((c) => (
                <button
                  key={c}
                  onClick={() => setEdition({ ...edition, couleurCasier: c })}
                  style={{ backgroundColor: c }}
                  className={`w-10 h-10 rounded-full ${
                    edition.couleurCasier === c ? 'ring-4 ring-offset-2 ring-slate-800' : ''
                  }`}
                />
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-sm font-semibold mb-1">Prix réf. (FCFA)</label>
                <input
                  type="number"
                  value={edition.prixReference}
                  onChange={(e) => setEdition({ ...edition, prixReference: e.target.value })}
                  className="border rounded-lg p-2 w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">Seuil rupture</label>
                <input
                  type="number"
                  value={edition.seuilAlerte}
                  onChange={(e) => setEdition({ ...edition, seuilAlerte: e.target.value })}
                  className="border rounded-lg p-2 w-full"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setEdition(null)}
                className="flex-1 bg-slate-200 rounded-lg py-3 font-semibold"
              >
                Annuler
              </button>
              <button
                onClick={enregistrer}
                className="flex-1 bg-emerald-600 text-white rounded-lg py-3 font-semibold"
              >
                💾 Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
