// ============================================================================
//  APP SUPABASE — MODE CONNECTÉ (auth + backend partagé + temps réel + push)
// ----------------------------------------------------------------------------
//  Routage automatique par rôle après connexion :
//   - role 'gerant'       → GerantApp (adaptateur Supabase, déclenche les notifs)
//   - role 'proprietaire' → ProprietaireApp en mode Supabase (point + live + push)
// ============================================================================

import { useEffect, useState } from 'react'
import { AuthProvider, useAuth } from './supabase/auth.jsx'
import { supabase } from './supabase/client.js'
import LoginScreen from './components/LoginScreen.jsx'
import GerantApp from './components/gerant/GerantApp.jsx'
import ProprietaireApp from './components/proprietaire/ProprietaireApp.jsx'
import { adapterSupabase } from './data/adapter.js'
import { usePush } from './hooks/usePush.js'

function Routeur() {
  const { session, role, depotId, chargement, deconnexion } = useAuth()
  const userId = session?.user?.id

  // Pour le propriétaire : on récupère son dépôt (le 1er qu'il possède)
  const [depotProprio, setDepotProprio] = useState(null)
  useEffect(() => {
    if (role === 'proprietaire' && userId) {
      supabase
        .from('depots')
        .select('id')
        .eq('proprietaire_id', userId)
        .limit(1)
        .single()
        .then(({ data }) => setDepotProprio(data?.id || null))
    }
  }, [role, userId])

  // Enregistre le jeton push (notifications de vente) — propriétaire uniquement
  usePush(userId, role === 'proprietaire')

  if (chargement) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-900 text-white text-2xl">
        🍹 Chargement…
      </div>
    )
  }

  if (!session) return <LoginScreen />

  // GÉRANT
  if (role === 'gerant') {
    return (
      <GerantApp
        adapter={adapterSupabase({ depotId, gerantId: userId })}
        onQuitter={deconnexion}
      />
    )
  }

  // PROPRIÉTAIRE
  if (role === 'proprietaire') {
    if (!depotProprio)
      return (
        <div className="h-full flex items-center justify-center bg-slate-900 text-white p-6 text-center">
          Aucun dépôt associé à ce compte.
          <br />
          <button onClick={deconnexion} className="underline mt-4">Se déconnecter</button>
        </div>
      )
    return <ProprietaireApp modeSupabase depotId={depotProprio} userId={userId} onQuitter={deconnexion} />
  }

  // Profil sans rôle reconnu
  return (
    <div className="h-full flex items-center justify-center bg-slate-900 text-white p-6 text-center">
      Profil incomplet (rôle manquant).
      <br />
      <button onClick={deconnexion} className="underline mt-4">Se déconnecter</button>
    </div>
  )
}

export default function AppSupabase() {
  return (
    <AuthProvider>
      <div className="h-screen w-screen overflow-hidden">
        <Routeur />
      </div>
    </AuthProvider>
  )
}
