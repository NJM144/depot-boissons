// ============================================================================
//  HOOK useDatabase — ACCÈS RÉACTIF À LA BASE DE DONNÉES
// ----------------------------------------------------------------------------
//  Expose les fonctions CRUD de la base et quelques états réactifs prêts à
//  l'emploi (liste des boissons, rafraîchissement). Partagé par les 2 profils.
// ============================================================================

import { useCallback, useEffect, useState } from 'react'
import * as DB from '../db/database.js'

export function useDatabase() {
  const [boissons, setBoissons] = useState([])
  const [chargement, setChargement] = useState(true)

  // Recharge la liste des boissons actives
  const rafraichirBoissons = useCallback(async ({ inclureInactives = false } = {}) => {
    const liste = await DB.listerBoissons({ inclureInactives })
    setBoissons(liste)
    return liste
  }, [])

  useEffect(() => {
    let actif = true
    ;(async () => {
      const liste = await DB.listerBoissons()
      if (actif) {
        setBoissons(liste)
        setChargement(false)
      }
    })()
    return () => {
      actif = false
    }
  }, [])

  return {
    // état réactif
    boissons,
    chargement,
    rafraichirBoissons,
    // on ré-exporte toutes les fonctions de la couche base pour usage direct
    ...DB,
  }
}
