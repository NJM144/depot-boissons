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

export default function App() {
  return supabaseConfigure ? <AppSupabase /> : <AppLocal />
}
