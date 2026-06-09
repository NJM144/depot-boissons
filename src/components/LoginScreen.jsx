// ============================================================================
//  ÉCRAN DE CONNEXION — MODE SUPABASE
// ----------------------------------------------------------------------------
//  Accueil à 2 gros boutons illustrés :
//   - GÉRANT       : un simple CODE à taper sur un pavé numérique géant
//                    (pas d'e-mail à écrire — adapté au gérant analphabète).
//                    Le bon code connecte automatiquement le compte gérant.
//   - PROPRIÉTAIRE : e-mail + mot de passe classiques.
//  Après connexion, le rôle du profil ouvre la bonne interface.
// ============================================================================

import { useState } from 'react'
import { useAuth } from '../supabase/auth.jsx'
import { useVoix } from '../hooks/useVoix.js'
import { useFeedback } from '../hooks/useFeedback.js'
import * as Cloud from '../supabase/api.js'
import ActionnaireApp from './actionnaire/ActionnaireApp.jsx'

function moisCourant() {
  const t = new Date()
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`
}

// Paramètres de connexion simplifiée du gérant (depuis le .env)
const GERANT_CODE = import.meta.env.VITE_GERANT_CODE || '1994'
const GERANT_EMAIL = import.meta.env.VITE_GERANT_EMAIL || 'gerant@depot.ci'
const GERANT_PASSWORD = import.meta.env.VITE_GERANT_PASSWORD || 'gerant1234'

export default function LoginScreen() {
  const [ecran, setEcran] = useState('accueil') // accueil | gerant | proprio | actionnaire

  if (ecran === 'gerant') return <ConnexionGerant onRetour={() => setEcran('accueil')} />
  if (ecran === 'proprio') return <ConnexionProprio onRetour={() => setEcran('accueil')} />
  if (ecran === 'actionnaire') return <ConnexionActionnaire onRetour={() => setEcran('accueil')} />

  // ----- ACCUEIL : choix du profil -----
  return (
    <div className="h-full w-full flex flex-col bg-slate-900 text-white p-4 gap-3">
      <h1 className="text-center text-3xl font-black py-2">🍹 Dépôt Boissons</h1>
      <div className="flex-1 grid grid-rows-3 gap-3">
        <button
          onClick={() => setEcran('gerant')}
          className="btn-tactile bg-emerald-600 active:bg-emerald-700 text-white w-full h-full gap-3"
        >
          <span className="text-7xl">🧑‍🏭</span>
          <span className="text-3xl font-black">GÉRANT</span>
          <span className="text-4xl">🔢</span>
        </button>
        <button
          onClick={() => setEcran('proprio')}
          className="btn-tactile bg-indigo-600 active:bg-indigo-700 text-white w-full h-full gap-3"
        >
          <span className="text-7xl">🔐</span>
          <span className="text-3xl font-black">PROPRIÉTAIRE</span>
          <span className="text-4xl">🗝️</span>
        </button>
        <button
          onClick={() => setEcran('actionnaire')}
          className="btn-tactile bg-amber-600 active:bg-amber-700 text-white w-full h-full gap-3"
        >
          <span className="text-7xl">💼</span>
          <span className="text-3xl font-black">ACTIONNAIRE</span>
          <span className="text-4xl">📈</span>
        </button>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------------
//  CONNEXION ACTIONNAIRE — code personnel → consultation de son compte
//  Pas de compte auth : le code est validé par la RPC (client anonyme).
// ----------------------------------------------------------------------------
function ConnexionActionnaire({ onRetour }) {
  const { parler } = useVoix()
  const { clic, succes, erreur } = useFeedback()
  const [code, setCode] = useState('')
  const [faux, setFaux] = useState(false)
  const [enCours, setEnCours] = useState(false)
  const [codeValide, setCodeValide] = useState(null) // code accepté → ouvre le dashboard

  const taper = (chiffre) => { clic(); setFaux(false); setCode((c) => (c + chiffre).slice(0, 8)) }
  const effacer = () => { clic(); setCode((c) => c.slice(0, -1)) }

  const valider = async () => {
    if (code.length < 3) { erreur(); setFaux(true); return }
    setEnCours(true)
    try {
      const d = await Cloud.getCompteActionnaire(code, moisCourant() + '-01')
      if (d?.trouve) { succes(); parler(`Bonjour ${d.nom}`); setCodeValide(code) }
      else { erreur(); parler('Code faux'); setFaux(true); setCode('') }
    } catch {
      erreur(); setFaux(true); setCode('')
    } finally {
      setEnCours(false)
    }
  }

  if (codeValide) return <ActionnaireApp code={codeValide} onQuitter={onRetour} />

  const touches = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '✓']
  return (
    <div className="h-full flex flex-col items-center justify-center bg-slate-900 text-white p-5 gap-5">
      <div className="text-6xl">💼</div>
      <p className="text-slate-300">Entrez votre code actionnaire</p>
      <div className="flex gap-3 h-6">
        {Array.from({ length: Math.max(4, code.length) }).map((_, i) => (
          <div key={i} className={`w-5 h-5 rounded-full ${i < code.length ? 'bg-amber-400' : 'bg-slate-600'}`} />
        ))}
      </div>
      {faux && <p className="text-red-400 font-bold text-xl">❌ Code faux</p>}
      <div className="grid grid-cols-3 gap-3 w-full max-w-sm">
        {touches.map((t) => (
          <button
            key={t}
            disabled={enCours}
            onClick={() => (t === '⌫' ? effacer() : t === '✓' ? valider() : taper(t))}
            className={`btn-tactile h-24 text-4xl font-black ${
              t === '✓' ? 'bg-amber-600 active:bg-amber-700'
                : t === '⌫' ? 'bg-slate-600 active:bg-slate-500'
                : 'bg-slate-700 active:bg-slate-600'
            } text-white`}
          >
            {t}
          </button>
        ))}
      </div>
      <button onClick={onRetour} className="btn-tactile bg-slate-600 active:bg-slate-700 text-white w-20 h-16 text-3xl">🏠</button>
    </div>
  )
}

// ----------------------------------------------------------------------------
//  CONNEXION GÉRANT — pavé numérique géant (code simple)
// ----------------------------------------------------------------------------
function ConnexionGerant({ onRetour }) {
  const { connexion } = useAuth()
  const { parler } = useVoix()
  const { clic, succes, erreur } = useFeedback()
  const [code, setCode] = useState('')
  const [faux, setFaux] = useState(false)
  const [enCours, setEnCours] = useState(false)

  const taper = (chiffre) => {
    clic()
    setFaux(false)
    setCode((c) => (c + chiffre).slice(0, 8))
  }
  const effacer = () => {
    clic()
    setCode((c) => c.slice(0, -1))
  }

  const valider = async () => {
    if (code !== GERANT_CODE) {
      erreur()
      parler('Code faux')
      setFaux(true)
      setCode('')
      return
    }
    // Bon code → connexion automatique au compte gérant
    setEnCours(true)
    const err = await connexion(GERANT_EMAIL, GERANT_PASSWORD)
    setEnCours(false)
    if (err) {
      erreur()
      setFaux(true)
      setCode('')
    } else {
      succes()
      parler('Bonjour')
    }
  }

  const touches = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '✓']

  return (
    <div className="h-full flex flex-col items-center justify-center bg-slate-900 text-white p-5 gap-5">
      <div className="text-6xl">🧑‍🏭</div>

      {/* Points indiquant le nombre de chiffres tapés */}
      <div className="flex gap-3 h-6">
        {Array.from({ length: Math.max(4, code.length) }).map((_, i) => (
          <div key={i} className={`w-5 h-5 rounded-full ${i < code.length ? 'bg-emerald-400' : 'bg-slate-600'}`} />
        ))}
      </div>

      {faux && <p className="text-red-400 font-bold text-xl">❌ Code faux</p>}

      {/* Pavé numérique TRÈS grand */}
      <div className="grid grid-cols-3 gap-3 w-full max-w-sm">
        {touches.map((t) => (
          <button
            key={t}
            disabled={enCours}
            onClick={() => (t === '⌫' ? effacer() : t === '✓' ? valider() : taper(t))}
            className={`btn-tactile h-24 text-4xl font-black ${
              t === '✓'
                ? 'bg-emerald-600 active:bg-emerald-700'
                : t === '⌫'
                ? 'bg-amber-600 active:bg-amber-700'
                : 'bg-slate-700 active:bg-slate-600'
            } text-white`}
          >
            {t}
          </button>
        ))}
      </div>

      <button onClick={onRetour} className="btn-tactile bg-slate-600 active:bg-slate-700 text-white w-20 h-16 text-3xl">
        🏠
      </button>
    </div>
  )
}

// ----------------------------------------------------------------------------
//  CONNEXION PROPRIÉTAIRE — e-mail + mot de passe
// ----------------------------------------------------------------------------
function ConnexionProprio({ onRetour }) {
  const { connexion } = useAuth()
  const [email, setEmail] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [erreurMsg, setErreurMsg] = useState(null)
  const [enCours, setEnCours] = useState(false)

  const soumettre = async (e) => {
    e.preventDefault()
    setErreurMsg(null)
    setEnCours(true)
    const err = await connexion(email.trim(), motDePasse)
    setEnCours(false)
    if (err) setErreurMsg('E-mail ou mot de passe incorrect.')
  }

  return (
    <div className="h-full flex flex-col items-center justify-center bg-slate-900 text-white p-6">
      <div className="text-6xl mb-2">🔐</div>
      <h1 className="text-2xl font-black mb-6">Propriétaire</h1>

      <form onSubmit={soumettre} className="w-full max-w-sm flex flex-col gap-3">
        <input
          type="email" inputMode="email" autoCapitalize="none" placeholder="E-mail"
          value={email} onChange={(e) => setEmail(e.target.value)}
          className="rounded-xl p-4 text-slate-900 text-lg" required
        />
        <input
          type="password" placeholder="Mot de passe"
          value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)}
          className="rounded-xl p-4 text-slate-900 text-lg" required
        />
        {erreurMsg && <p className="text-red-400 font-semibold text-center">{erreurMsg}</p>}
        <button
          type="submit" disabled={enCours}
          className="btn-tactile bg-indigo-600 active:bg-indigo-700 disabled:opacity-50 text-white h-16 text-xl mt-2"
        >
          {enCours ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>

      <button onClick={onRetour} className="text-slate-400 underline text-lg mt-6">⬅️ Retour</button>
    </div>
  )
}
