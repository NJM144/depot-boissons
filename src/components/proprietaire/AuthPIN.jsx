// ============================================================================
//  AUTH PIN — PROTECTION DU PROFIL PROPRIÉTAIRE
// ----------------------------------------------------------------------------
//  Pavé numérique classique. Le code PIN par défaut est 1234 (modifiable dans
//  les réglages). Vérifié via la base (table `config`).
// ============================================================================

import { useState } from 'react'
import { verifierPIN } from '../../db/database.js'
import { useFeedback } from '../../hooks/useFeedback.js'

export default function AuthPIN({ onSucces, onAnnuler }) {
  const [saisie, setSaisie] = useState('')
  const [erreurAffichee, setErreurAffichee] = useState(false)
  const { clic, succes, erreur } = useFeedback()

  const taper = (chiffre) => {
    clic()
    setErreurAffichee(false)
    const nouvelle = (saisie + chiffre).slice(0, 6)
    setSaisie(nouvelle)
  }

  const effacer = () => {
    clic()
    setSaisie((s) => s.slice(0, -1))
  }

  const valider = async () => {
    const ok = await verifierPIN(saisie)
    if (ok) {
      succes()
      onSucces()
    } else {
      erreur()
      setErreurAffichee(true)
      setSaisie('')
    }
  }

  const touches = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '✓']

  return (
    <div className="h-full flex flex-col items-center justify-center bg-slate-900 text-white p-6 gap-6">
      <div className="text-6xl">🔐</div>
      <h2 className="text-2xl font-bold">Code propriétaire</h2>

      {/* Points indiquant le nombre de chiffres saisis */}
      <div className="flex gap-3 h-6">
        {Array.from({ length: Math.max(4, saisie.length) }).map((_, i) => (
          <div
            key={i}
            className={`w-5 h-5 rounded-full ${i < saisie.length ? 'bg-white' : 'bg-slate-600'}`}
          />
        ))}
      </div>

      {erreurAffichee && <p className="text-red-400 font-bold">Code incorrect ❌</p>}

      {/* Pavé numérique */}
      <div className="grid grid-cols-3 gap-3 w-full max-w-xs">
        {touches.map((t) => (
          <button
            key={t}
            onClick={() => (t === '⌫' ? effacer() : t === '✓' ? valider() : taper(t))}
            className={`btn-tactile h-20 text-3xl font-bold ${
              t === '✓'
                ? 'bg-emerald-600 active:bg-emerald-700'
                : t === '⌫'
                ? 'bg-amber-600 active:bg-amber-700'
                : 'bg-slate-700 active:bg-slate-600'
            } text-white`}
          >
            {t}
          </button>
        ))}
      </div>

      <button onClick={onAnnuler} className="text-slate-400 underline text-lg mt-2">
        ⬅️ Retour
      </button>

      <p className="text-slate-500 text-sm">Code par défaut : 1234</p>
    </div>
  )
}
