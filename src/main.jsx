import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { initBaseDeDonnees } from './db/database.js'

// Point d'entrée de l'application.
// On initialise la base de données (et les données de démonstration) avant le rendu.
initBaseDeDonnees().finally(() => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
})
