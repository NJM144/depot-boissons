// ============================================================================
//  SÉLECTION DU CLIENT — PROFIL GÉRANT (étape d'une VENTE, 100% visuel)
// ----------------------------------------------------------------------------
//  - Gros bouton « CLIENT DE PASSAGE » (one-shot, anonyme).
//  - Grille des clients réguliers : on les reconnaît par leur PHOTO.
//  - Bouton ➕ pour ajouter un client : nom DICTÉ à la voix + photo.
//  Tout est lu à voix haute (gérant analphabète).
// ============================================================================

import { useEffect, useRef, useState } from 'react'
import { useVoix } from '../../hooks/useVoix.js'
import { useReconnaissanceVocale } from '../../hooks/useReconnaissanceVocale.js'
import { useFeedback } from '../../hooks/useFeedback.js'

// Redimensionne une photo (caméra) en petit dataURL JPEG
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
        c.width = w; c.height = h
        c.getContext('2d').drawImage(img, 0, 0, w, h)
        resolve(c.toDataURL('image/jpeg', 0.7))
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })
}

// Pastille d'un client : sa photo, sinon l'initiale de son nom
function PhotoClient({ client, taille = 76 }) {
  if (client?.photo) {
    return <img src={client.photo} alt="" style={{ width: taille, height: taille }} className="rounded-full object-cover" />
  }
  const ini = (client?.nom || '?').trim().charAt(0).toUpperCase() || '👤'
  return (
    <div style={{ width: taille, height: taille }}
      className="rounded-full bg-indigo-200 text-indigo-800 font-black flex items-center justify-center"
    >
      <span style={{ fontSize: taille * 0.42 }}>{ini}</span>
    </div>
  )
}

export default function SelectionClient({ adapter, onChoisir, onPassage }) {
  const { parler } = useVoix()
  const { clic } = useFeedback()
  const [clients, setClients] = useState(null)
  const [ajout, setAjout] = useState(false)

  const charger = () => adapter.listerClients().then(setClients).catch(() => setClients([]))
  useEffect(() => { charger(); parler('À qui ? Client de passage, ou choisissez le client.') }, []) // eslint-disable-line

  const choisir = (c) => {
    clic()
    if (c?.nom) parler(c.nom)
    onChoisir(c)
  }
  const passage = () => { clic(); parler('Client de passage'); onPassage() }

  return (
    <div className="h-full flex flex-col bg-slate-900">
      {/* CLIENT DE PASSAGE (one-shot) */}
      <div className="p-3">
        <button
          onClick={passage}
          className="btn-tactile bg-slate-600 active:bg-slate-700 text-white w-full h-24 flex-row gap-3"
        >
          <span className="text-6xl">🚶</span>
          <span className="text-3xl font-black">CLIENT DE PASSAGE</span>
        </button>
      </div>

      <div className="px-3 text-slate-400 text-sm font-bold">👥 OU UN CLIENT :</div>

      {/* Grille des clients réguliers + bouton ajouter */}
      <div className="flex-1 overflow-y-auto no-scrollbar p-3">
        {clients === null ? (
          <p className="text-slate-500 text-center py-6">Chargement…</p>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {clients.map((c) => (
              <button key={c.id} onClick={() => choisir(c)}
                className="flex flex-col items-center gap-1 bg-slate-800 active:bg-slate-700 rounded-2xl p-2">
                <PhotoClient client={c} />
                <span className="text-white text-sm font-bold truncate w-full text-center">{c.nom || '—'}</span>
              </button>
            ))}
            {/* Ajouter un nouveau client */}
            <button onClick={() => { clic(); setAjout(true) }}
              className="flex flex-col items-center justify-center gap-1 bg-emerald-700 active:bg-emerald-800 rounded-2xl p-2 min-h-[110px]">
              <span className="text-5xl">➕</span>
              <span className="text-white text-sm font-bold">Nouveau</span>
            </button>
          </div>
        )}
      </div>

      {ajout && (
        <AjoutClient adapter={adapter}
          onFerme={() => setAjout(false)}
          onAjoute={(c) => { setAjout(false); onChoisir(c) }} />
      )}
    </div>
  )
}

// ----- Sous-écran : ajouter un client (nom dicté + photo) -------------------
function AjoutClient({ adapter, onFerme, onAjoute }) {
  const { parler } = useVoix()
  const { ecouter, ecoute } = useReconnaissanceVocale()
  const { clic } = useFeedback()
  const [nom, setNom] = useState('')
  const [photo, setPhoto] = useState(null)
  const [err, setErr] = useState(null)
  const [enCours, setEnCours] = useState(false)
  const fileRef = useRef(null)

  const dicter = async () => {
    clic(); setErr(null)
    try {
      const t = await ecouter()
      if (t) { setNom(t); parler(`${t}, c'est ça ?`) }
      else { setErr('Je n’ai pas entendu. Réessayez.'); parler('Je n’ai pas entendu. Réessayez.') }
    } catch (e) {
      setErr(e.message || 'Micro indisponible')
      parler('Micro indisponible. Vous pouvez prendre une photo.')
    }
  }

  const choisirPhoto = async (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setPhoto(await redimensionner(f))
  }

  const enregistrer = async () => {
    setErr(null)
    if (!nom.trim() && !photo) { setErr('Dites le nom ou prenez une photo.'); return }
    setEnCours(true)
    try {
      const c = await adapter.ajouterClient({ nom, photo })
      parler('Client enregistré')
      onAjoute(c)
    } catch (e) {
      console.error('ajouterClient', e)
      setErr(e.message || 'Erreur'); setEnCours(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-900 z-50 flex flex-col p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-white text-2xl font-black">👤 Nouveau client</h3>
        <button onClick={onFerme} className="btn-tactile bg-slate-600 text-white w-16 h-14 text-3xl">⬅️</button>
      </div>

      {/* Photo */}
      <div className="flex flex-col items-center gap-3 mb-4">
        {photo
          ? <img src={photo} alt="" className="w-32 h-32 rounded-full object-cover" />
          : <div className="w-32 h-32 rounded-full bg-slate-700 flex items-center justify-center text-6xl">👤</div>}
        <button onClick={() => { clic(); fileRef.current?.click() }}
          className="btn-tactile bg-indigo-600 active:bg-indigo-700 text-white h-16 px-6 text-2xl flex-row gap-2">
          📷 PHOTO
        </button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={choisirPhoto} className="hidden" />
      </div>

      {/* Nom dicté à la voix */}
      <button onClick={dicter} disabled={ecoute}
        className={`btn-tactile ${ecoute ? 'bg-red-600 animate-pulse' : 'bg-amber-600 active:bg-amber-700'} text-white h-20 text-3xl flex-row gap-3 mb-2`}>
        🎤 {ecoute ? 'Parlez…' : 'DIRE LE NOM'}
      </button>
      {nom && (
        <div className="bg-slate-800 rounded-2xl p-3 text-center mb-2">
          <span className="text-white text-3xl font-black">{nom}</span>
        </div>
      )}

      {err && <p className="text-red-400 font-bold text-center mb-2">{err}</p>}

      <div className="flex-1" />
      <button onClick={enregistrer} disabled={enCours}
        className="btn-tactile bg-valider active:brightness-90 disabled:opacity-50 text-white h-24 text-5xl flex-row gap-3">
        {enCours ? '…' : '✓ ENREGISTRER'}
      </button>
    </div>
  )
}
