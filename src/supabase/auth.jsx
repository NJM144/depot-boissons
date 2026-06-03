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
    // Session initiale (restaurée depuis le stockage persistant)
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      await chargerProfil(data.session?.user?.id)
      setChargement(false)
    })

    // Écoute les changements d'auth (login / logout / refresh)
    const { data: sub } = supabase.auth.onAuthStateChange(async (_evt, sess) => {
      setSession(sess)
      await chargerProfil(sess?.user?.id)
    })
    return () => sub.subscription.unsubscribe()
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
