// ============================================================================
//  CLIENT SUPABASE
// ----------------------------------------------------------------------------
//  - Crée le client si les variables d'environnement sont présentes.
//  - Persiste la session via Capacitor Preferences (natif) ou localStorage
//    (web), pour rester connecté après fermeture de l'app.
// ============================================================================

import { createClient } from '@supabase/supabase-js'
import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

const URL = import.meta.env.VITE_SUPABASE_URL
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY

// L'app est-elle configurée pour Supabase ? (sinon → MODE LOCAL Dexie)
export const supabaseConfigure = Boolean(URL && ANON)

// Adaptateur de stockage : Capacitor Preferences sur mobile, localStorage en web
const stockagePreferences = {
  getItem: async (cle) => (await Preferences.get({ key: cle })).value,
  setItem: async (cle, valeur) => Preferences.set({ key: cle, value: valeur }),
  removeItem: async (cle) => Preferences.remove({ key: cle }),
}

// Instance unique (null si non configuré)
export const supabase = supabaseConfigure
  ? createClient(URL, ANON, {
      auth: {
        storage: Capacitor.isNativePlatform() ? stockagePreferences : window.localStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null
