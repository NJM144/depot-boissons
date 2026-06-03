// ============================================================================
//  APP LOCAL — MODE HORS-LIGNE (Dexie + code PIN)
// ----------------------------------------------------------------------------
//  Comportement d'origine : écran d'accueil (choix du profil), gérant en local,
//  propriétaire protégé par PIN. Utilisé quand Supabase n'est PAS configuré.
// ============================================================================

import { useEffect, useState } from 'react'
import { App as CapApp } from '@capacitor/app'
import EcranAccueil from './components/EcranAccueil.jsx'
import GerantApp from './components/gerant/GerantApp.jsx'
import ProprietaireApp from './components/proprietaire/ProprietaireApp.jsx'
import { adapterLocal } from './data/adapter.js'

export default function AppLocal() {
  const [ecran, setEcran] = useState('accueil')

  // Bouton RETOUR physique Android
  useEffect(() => {
    let handler
    CapApp.addListener('backButton', () => {
      setEcran((cur) => {
        if (cur !== 'accueil') return 'accueil'
        CapApp.exitApp()
        return cur
      })
    }).then((h) => (handler = h))
    return () => handler?.remove()
  }, [])

  return (
    <div className="h-screen w-screen overflow-hidden">
      {ecran === 'accueil' && (
        <EcranAccueil
          onChoixGerant={() => setEcran('gerant')}
          onChoixProprietaire={() => setEcran('proprietaire')}
        />
      )}
      {ecran === 'gerant' && (
        <GerantApp adapter={adapterLocal} onQuitter={() => setEcran('accueil')} />
      )}
      {ecran === 'proprietaire' && (
        <ProprietaireApp onQuitter={() => setEcran('accueil')} />
      )}
    </div>
  )
}
