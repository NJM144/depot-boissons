// ============================================================================
//  CONTEXTE D'AUTHENTIFICATION SUPABASE + ROUTAGE PAR RÔLE
// ----------------------------------------------------------------------------
//  Fournit : session, profil (role + depot_id), connexion, déconnexion.
//  Après login, le `role` du profil détermine l'interface (gérant/propriétaire).
//  Remplace le code PIN local quand l'app est en MODE SUPABASE.
// ============================================================================

import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './client.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profil, setProfil] = useState(null) // { id, role, nom, depot_id }
  const [chargement, setChargement] = useState(true)

  // Récupère le profil applicatif (rôle, dépôt) de l'utilisateur connecté
  const chargerProfil = async (userId) => {
    if (!userId) {
      setProfil(null)
      return
    }
    const { data } = await supabase
      .from('profiles')
      .select('id, role, nom, depot_id')
      .eq('id', userId)
      .single()
    setProfil(data || null)
  }

  useEffect(() => {
    let actif = true

    // Session initiale (restaurée depuis le stockage persistant).
    // try/finally garantit qu'on sort TOUJOURS de l'écran « Chargement… »,
    // même si la lecture du profil échoue (réseau coupé, erreur RLS, etc.).
    supabase.auth.getSession().then(async ({ data }) => {
      if (!actif) return
      setSession(data.session)
      try {
        await chargerProfil(data.session?.user?.id)
      } finally {
        if (actif) setChargement(false)
      }
    })

    // Écoute les changements d'auth (login / logout / refresh).
    // ⚠️ Supabase impose de NE PAS appeler de fonction supabase.* (async)
    // directement dans ce callback : cela provoque un deadlock du verrou
    // d'auth au redémarrage de l'app (token refresh) → bloqué sur « Chargement… ».
    // On diffère donc l'appel hors du callback avec setTimeout(0).
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, sess) => {
      if (!actif) return
      setSession(sess)
      setTimeout(async () => {
        if (!actif) return
        try {
          await chargerProfil(sess?.user?.id)
        } finally {
          if (actif) setChargement(false)
        }
      }, 0)
    })
    return () => {
      actif = false
      sub.subscription.unsubscribe()
    }
  }, [])

  // Connexion e-mail / mot de passe
  const connexion = async (email, motDePasse) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: motDePasse,
    })
    return error
  }

  // Déconnexion
  const deconnexion = async () => {
    await supabase.auth.signOut()
    setProfil(null)
  }

  const valeur = {
    session,
    profil,
    role: profil?.role || null,
    depotId: profil?.depot_id || null,
    chargement,
    connexion,
    deconnexion,
  }

  return <AuthContext.Provider value={valeur}>{children}</AuthContext.Provider>
}

// Hook d'accès au contexte d'auth
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>')
  return ctx
}
