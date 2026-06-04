// ============================================================================
//  ADAPTATEUR DE DONNÉES — unifie le MODE LOCAL (Dexie) et le MODE SUPABASE
// ----------------------------------------------------------------------------
//  Les composants du gérant appellent toujours les mêmes méthodes ; selon le
//  mode, elles écrivent dans IndexedDB (hors-ligne) ou dans Supabase (partagé,
//  avec déclenchement de la notification push au propriétaire).
// ============================================================================

import * as Local from '../db/database.js'
import * as Cloud from '../supabase/api.js'

// --- Adaptateur LOCAL (Dexie / IndexedDB) -----------------------------------
export const adapterLocal = {
  mode: 'local',
  listerBoissons: () => Local.listerBoissons(),
  // En local on ne gère pas l'unité (mode démo) : on stocke la quantité telle quelle
  ajouterMouvement: ({ boissonId, type, quantite, montant }) =>
    Local.ajouterMouvement({ boissonId, type, quantite, montant }),
  ajouterCasse: ({ boissonId, quantite }) => Local.ajouterCasse({ boissonId, quantite }),
  calculerStocks: () => Local.calculerStocks(),
}

// --- Adaptateur SUPABASE (backend partagé) ----------------------------------
//  Nécessite le dépôt courant et l'id du gérant connecté.
export function adapterSupabase({ depotId, gerantId }) {
  return {
    mode: 'supabase',
    listerBoissons: () => Cloud.listerBoissonsGerant(),
    ajouterMouvement: ({ boissonId, type, quantite, montant, unite }) =>
      Cloud.ajouterMouvement({ depotId, boissonId, type, quantite, montant, unite, gerantId }),
    ajouterCasse: ({ boissonId, quantite }) =>
      Cloud.ajouterCasse({ depotId, boissonId, quantite, gerantId }),
    calculerStocks: () => Cloud.calculerStocks(depotId),
  }
}
