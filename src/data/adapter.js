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
//  Le mode local est une démo : pas de gestion de clients (clientsActifs=false),
//  l'étape « client » du parcours gérant est donc masquée.
export const adapterLocal = {
  mode: 'local',
  clientsActifs: false,
  listerBoissons: () => Local.listerBoissons(),
  // En local on ne gère pas l'unité (mode démo) : on stocke la quantité telle quelle
  ajouterMouvement: ({ boissonId, type, quantite, montant }) =>
    Local.ajouterMouvement({ boissonId, type, quantite, montant }),
  // En local (démo) on ignore l'unité, comme pour les mouvements
  ajouterCasse: ({ boissonId, quantite }) => Local.ajouterCasse({ boissonId, quantite }),
  calculerStocks: () => Local.calculerStocks(),
}

// --- Adaptateur SUPABASE (backend partagé) ----------------------------------
//  Nécessite le dépôt courant et l'id du gérant connecté.
export function adapterSupabase({ depotId, gerantId }) {
  return {
    mode: 'supabase',
    clientsActifs: true,
    amortissementActif: true,
    listerBoissons: () => Cloud.listerBoissonsGerant(),
    ajouterMouvement: ({ boissonId, type, quantite, montant, unite, clientId, clientPassage, aCredit }) =>
      Cloud.ajouterMouvement({ depotId, boissonId, type, quantite, montant, unite, gerantId, clientId, clientPassage, aCredit }),
    ajouterCasse: ({ boissonId, quantite, unite }) =>
      Cloud.ajouterCasse({ depotId, boissonId, quantite, unite, gerantId }),
    calculerStocks: () => Cloud.calculerStocks(depotId),
    // Clients (mode Supabase uniquement)
    listerClients: () => Cloud.listerClients(depotId),
    ajouterClient: ({ nom, photo, telephone }) => Cloud.ajouterClient(depotId, { nom, photo, telephone }, gerantId),
    // Amortissement (mode Supabase uniquement) : versement quotidien déclaré par le gérant
    listerAmortissementsActifs: () => Cloud.listerAmortissementsActifs(depotId),
    ajouterDeclarationAmortissement: ({ amortissementId, montant }) =>
      Cloud.ajouterDeclarationAmortissement({ depotId, amortissementId, montant, gerantId }),
  }
}
