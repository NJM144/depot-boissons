// ============================================================================
//  ÉCRAN DE CONNEXION — MODE SUPABASE
// ----------------------------------------------------------------------------
//  Connexion e-mail / mot de passe. Après login, le rôle du profil détermine
//  automatiquement l'interface (gérant ou propriétaire). Remplace le PIN local.
// ============================================================================

import { useState } from 'react'
import { useAuth } from '../supabase/auth.jsx'

export default function LoginScreen() {
  const { connexion } = useAuth()
  const [email, setEmail] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [erreur, setErreur] = useState(null)
  const [enCours, setEnCours] = useState(false)

  const soumettre = async (e) => {
    e.preventDefault()
    setErreur(null)
    setEnCours(true)
    const err = await connexion(email.trim(), motDePasse)
    setEnCours(false)
    if (err) setErreur('E-mail ou mot de passe incorrect.')
  }

  return (
    <div className="h-full flex flex-col items-center justify-center bg-slate-900 text-white p-6">
      <div className="text-7xl mb-3">🍹</div>
      <h1 className="text-3xl font-black mb-1">Dépôt Boissons</h1>
      <p className="text-slate-400 mb-6">Connexion</p>

      <form onSubmit={soumettre} className="w-full max-w-sm flex flex-col gap-3">
        <input
          type="email"
          inputMode="email"
          autoCapitalize="none"
          placeholder="E-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-xl p-4 text-slate-900 text-lg"
          required
        />
        <input
          type="password"
          placeholder="Mot de passe"
          value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
          className="rounded-xl p-4 text-slate-900 text-lg"
          required
        />

        {erreur && <p className="text-red-400 font-semibold text-center">{erreur}</p>}

        <button
          type="submit"
          disabled={enCours}
          className="btn-tactile bg-emerald-600 active:bg-emerald-700 disabled:opacity-50 text-white h-16 text-xl mt-2"
        >
          {enCours ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>

      <p className="text-slate-500 text-sm mt-6 text-center">
        L'interface (gérant ou propriétaire)<br />s'ouvre selon votre compte.
      </p>
    </div>
  )
}
