// ============================================================================
//  APP — POINT DE BRANCHEMENT
// ----------------------------------------------------------------------------
//  Choisit le mode au démarrage :
//   - Variables Supabase présentes  → MODE SUPABASE (auth, temps réel, push)
//   - Sinon                         → MODE LOCAL (Dexie, code PIN, hors-ligne)
// ============================================================================

import { supabaseConfigure } from './supabase/client.js'
import AppLocal from './AppLocal.jsx'
import AppSupabase from './AppSupabase.jsx'
import MiseAJour from './components/commun/MiseAJour.jsx'

export default function App() {
  return (
    <>
      {/* Vérifie la dispo d'une nouvelle version (toutes les 10 ouvertures, APK only) */}
      <MiseAJour />
      {supabaseConfigure ? <AppSupabase /> : <AppLocal />}
    </>
  )
}
