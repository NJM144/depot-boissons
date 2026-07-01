// ============================================================================
//  PORTAIL ACTIONNAIRE (WEB) — connexion par code + tableau de bord
// ----------------------------------------------------------------------------
//  Réutilise l'écran ActionnaireApp. La RPC get_compte_actionnaire est ouverte
//  à `anon` (le CODE personnel fait office de secret), donc aucun compte
//  e-mail/mot de passe n'est nécessaire. Format mobile.
// ============================================================================

import { useState } from 'react'
import { supabaseConfigure } from '../supabase/client.js'
import * as Cloud from '../supabase/api.js'
import { useVoix } from '../hooks/useVoix.js'
import { useFeedback } from '../hooks/useFeedback.js'
import ActionnaireApp from '../components/actionnaire/ActionnaireApp.jsx'

function moisCourant() {
  const t = new Date()
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`
}

export default function PortailActionnaire() {
  const { parler } = useVoix()
  const { clic, succes, erreur } = useFeedback()
  const [code, setCode] = useState('')
  const [faux, setFaux] = useState(false)
  const [enCours, setEnCours] = useState(false)
  const [codeValide, setCodeValide] = useState(null)

  // Sécurité d'affichage si la page est servie sans configuration Supabase
  if (!supabaseConfigure) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-900 text-white p-6 text-center">
        <p>Service indisponible (configuration manquante). Réessayez plus tard.</p>
      </div>
    )
  }

  if (codeValide) {
    return <ActionnaireApp code={codeValide} onQuitter={() => { setCodeValide(null); setCode('') }} />
  }

  const taper = (chiffre) => { clic(); setFaux(false); setCode((c) => (c + chiffre).slice(0, 8)) }
  const effacer = () => { clic(); setCode((c) => c.slice(0, -1)) }

  const valider = async () => {
    if (code.length < 3) { erreur(); setFaux(true); return }
    setEnCours(true)
    try {
      const d = await Cloud.getCompteActionnaire(code, moisCourant() + '-01')
      if (d?.trouve) { succes(); parler(`Bonjour ${d.nom}`); setCodeValide(code) }
      else { erreur(); parler('Code faux'); setFaux(true); setCode('') }
    } catch {
      erreur(); setFaux(true); setCode('')
    } finally {
      setEnCours(false)
    }
  }

  const touches = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '✓']
  return (
    <div className="h-full flex flex-col items-center justify-center bg-slate-900 text-white p-5 gap-4">
      <div className="text-center">
        <div className="text-6xl">💼</div>
        <h1 className="text-2xl font-black mt-1">Espace Actionnaire</h1>
        <p className="text-slate-400 text-sm">Dépôt Boissons</p>
      </div>

      <p className="text-slate-300">Entrez votre code</p>
      <div className="flex gap-3 h-6">
        {Array.from({ length: Math.max(4, code.length) }).map((_, i) => (
          <div key={i} className={`w-5 h-5 rounded-full ${i < code.length ? 'bg-amber-400' : 'bg-slate-600'}`} />
        ))}
      </div>
      {faux && <p className="text-red-400 font-bold text-xl">❌ Code faux</p>}

      <div className="grid grid-cols-3 gap-3 w-full max-w-sm">
        {touches.map((t) => (
          <button
            key={t}
            disabled={enCours}
            onClick={() => (t === '⌫' ? effacer() : t === '✓' ? valider() : taper(t))}
            className={`btn-tactile h-20 text-4xl font-black ${
              t === '✓' ? 'bg-amber-600 active:bg-amber-700'
                : t === '⌫' ? 'bg-slate-600 active:bg-slate-500'
                : 'bg-slate-700 active:bg-slate-600'
            } text-white`}
          >
            {t}
          </button>
        ))}
      </div>

      <p className="text-slate-500 text-xs text-center mt-2 max-w-xs">
        🔒 Votre code est personnel. Vous ne voyez que votre propre compte.
      </p>
    </div>
  )
}
