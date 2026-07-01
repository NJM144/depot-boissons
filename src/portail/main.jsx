// ============================================================================
//  PORTAIL ACTIONNAIRE (WEB) — point d'entrée
// ----------------------------------------------------------------------------
//  Page web mobile dédiée : un actionnaire entre son CODE et consulte son
//  compte depuis internet, sans installer l'APK. Ne contient QUE l'espace
//  actionnaire (aucun accès gérant / propriétaire).
// ============================================================================

import React from 'react'
import ReactDOM from 'react-dom/client'
import PortailActionnaire from './PortailActionnaire.jsx'
import '../index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PortailActionnaire />
  </React.StrictMode>
)
