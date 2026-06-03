// ============================================================================
//  PROPRIETAIRE APP — INTERFACE CLASSIQUE (protégée par PIN)
// ----------------------------------------------------------------------------
//  Après authentification PIN, navigation par onglets en bas :
//   - Tableau de bord
//   - Historique & filtres
//   - Catalogue
//   - Réglages (changer le code PIN)
// ============================================================================

import { useState } from 'react'
import AuthPIN from './AuthPIN.jsx'
import TableauBord from './TableauBord.jsx'
import Historique from './Historique.jsx'
import GestionCatalogue from './GestionCatalogue.jsx'
import PointPeriodique from './PointPeriodique.jsx'
import VentesLive from './VentesLive.jsx'
import CatalogueSupabase from './CatalogueSupabase.jsx'
import * as DB from '../../db/database.js'

export default function ProprietaireApp({ onQuitter, modeSupabase = false, depotId = null, userId = null }) {
  // En MODE LOCAL : protection par PIN. En MODE SUPABASE : déjà authentifié.
  const [authentifie, setAuthentifie] = useState(modeSupabase)
  const [onglet, setOnglet] = useState(modeSupabase ? 'point' : 'tableau')

  if (!authentifie) {
    return <AuthPIN onSucces={() => setAuthentifie(true)} onAnnuler={onQuitter} />
  }

  // Onglets différents selon le mode
  const onglets = modeSupabase
    ? [
        { cle: 'point', icone: '🎯', label: 'Point' },
        { cle: 'live', icone: '🔴', label: 'En direct' },
        { cle: 'catalogue', icone: '📚', label: 'Catalogue' },
        { cle: 'reglages', icone: '⚙️', label: 'Réglages' },
      ]
    : [
        { cle: 'tableau', icone: '📊', label: 'Bord' },
        { cle: 'historique', icone: '📜', label: 'Historique' },
        { cle: 'catalogue', icone: '📚', label: 'Catalogue' },
        { cle: 'reglages', icone: '⚙️', label: 'Réglages' },
      ]

  return (
    <div className="h-full flex flex-col bg-slate-100">
      {/* En-tête */}
      <div className="bg-indigo-700 text-white px-4 py-3 flex items-center justify-between">
        <h1 className="font-bold text-lg">
          🍹 Espace Propriétaire {modeSupabase && <span className="text-xs bg-emerald-500 rounded px-1 ml-1">cloud</span>}
        </h1>
        <button onClick={onQuitter} className="bg-indigo-800 rounded-lg px-3 py-1 text-sm">
          {modeSupabase ? '🚪 Déconnexion' : '🏠 Sortir'}
        </button>
      </div>

      {/* Contenu de l'onglet actif */}
      <div className="flex-1 min-h-0">
        {/* Mode local (Dexie) */}
        {!modeSupabase && onglet === 'tableau' && <TableauBord />}
        {!modeSupabase && onglet === 'historique' && <Historique />}
        {!modeSupabase && onglet === 'catalogue' && <GestionCatalogue />}
        {/* Mode Supabase (cloud) */}
        {modeSupabase && onglet === 'point' && <PointPeriodique depotId={depotId} />}
        {modeSupabase && onglet === 'live' && <VentesLive depotId={depotId} />}
        {modeSupabase && onglet === 'catalogue' && <CatalogueSupabase depotId={depotId} />}
        {/* Réglages commun */}
        {onglet === 'reglages' && <Reglages modeSupabase={modeSupabase} />}
      </div>

      {/* Barre d'onglets en bas */}
      <nav className="bg-white border-t flex">
        {onglets.map((o) => (
          <button
            key={o.cle}
            onClick={() => setOnglet(o.cle)}
            className={`flex-1 py-2 flex flex-col items-center text-xs font-semibold ${
              onglet === o.cle ? 'text-indigo-700' : 'text-slate-400'
            }`}
          >
            <span className="text-2xl">{o.icone}</span>
            {o.label}
          </button>
        ))}
      </nav>
    </div>
  )
}

// ----------------------------------------------------------------------------
//  RÉGLAGES — changer le code PIN
// ----------------------------------------------------------------------------
function Reglages({ modeSupabase = false }) {
  const [actuel, setActuel] = useState('')
  const [nouveau, setNouveau] = useState('')
  const [message, setMessage] = useState(null)

  // En MODE SUPABASE, l'accès est géré par le compte (pas de PIN local)
  if (modeSupabase) {
    return (
      <div className="p-4">
        <div className="bg-white rounded-xl p-4 shadow-sm max-w-md">
          <h3 className="font-bold text-slate-700 mb-2">⚙️ Réglages</h3>
          <p className="text-slate-600 text-sm">
            La connexion est gérée par votre compte (e-mail / mot de passe).
            Les notifications de vente arrivent en push sur cet appareil.
          </p>
        </div>
      </div>
    )
  }

  const changer = async () => {
    const ok = await DB.verifierPIN(actuel)
    if (!ok) {
      setMessage({ type: 'err', txt: 'Code actuel incorrect.' })
      return
    }
    if (!/^\d{4,6}$/.test(nouveau)) {
      setMessage({ type: 'err', txt: 'Le nouveau code doit faire 4 à 6 chiffres.' })
      return
    }
    await DB.setConfig('pin', nouveau)
    setActuel('')
    setNouveau('')
    setMessage({ type: 'ok', txt: 'Code PIN modifié ✅' })
  }

  return (
    <div className="p-4">
      <div className="bg-white rounded-xl p-4 shadow-sm max-w-md">
        <h3 className="font-bold text-slate-700 mb-3">🔑 Changer le code PIN</h3>
        <label className="block text-sm font-semibold mb-1">Code actuel</label>
        <input
          type="password"
          inputMode="numeric"
          value={actuel}
          onChange={(e) => setActuel(e.target.value)}
          className="border rounded-lg p-2 w-full mb-3"
        />
        <label className="block text-sm font-semibold mb-1">Nouveau code (4 à 6 chiffres)</label>
        <input
          type="password"
          inputMode="numeric"
          value={nouveau}
          onChange={(e) => setNouveau(e.target.value)}
          className="border rounded-lg p-2 w-full mb-3"
        />
        {message && (
          <p className={`mb-3 font-semibold ${message.type === 'ok' ? 'text-emerald-600' : 'text-red-600'}`}>
            {message.txt}
          </p>
        )}
        <button onClick={changer} className="bg-indigo-600 text-white rounded-lg py-2 px-4 w-full font-semibold">
          💾 Enregistrer
        </button>
      </div>
    </div>
  )
}
