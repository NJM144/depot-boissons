// ============================================================================
//  HOOK useVoix — SYNTHÈSE VOCALE FRANÇAISE
// ----------------------------------------------------------------------------
//  Indispensable pour le profil gérant analphabète : tout est lu à voix haute.
//  - Sur APK Android : utilise le plugin @capacitor-community/text-to-speech.
//  - Sur navigateur (dev) : repli automatique sur l'API Web SpeechSynthesis.
// ============================================================================

import { useCallback } from 'react'
import { Capacitor } from '@capacitor/core'
import { TextToSpeech } from '@capacitor-community/text-to-speech'

export function useVoix() {
  // Prononce un texte en français
  const parler = useCallback(async (texte) => {
    if (!texte) return
    try {
      if (Capacitor.isNativePlatform()) {
        // Plateforme native (APK) : plugin Capacitor
        await TextToSpeech.stop().catch(() => {})
        await TextToSpeech.speak({
          text: String(texte),
          lang: 'fr-FR',
          rate: 1.0,
          pitch: 1.0,
          volume: 1.0,
          category: 'playback',
        })
      } else if ('speechSynthesis' in window) {
        // Navigateur : Web Speech API
        window.speechSynthesis.cancel()
        const u = new SpeechSynthesisUtterance(String(texte))
        u.lang = 'fr-FR'
        u.rate = 1.0
        window.speechSynthesis.speak(u)
      }
    } catch (e) {
      console.warn('Synthèse vocale indisponible :', e)
    }
  }, [])

  // Stoppe toute lecture en cours
  const stopper = useCallback(async () => {
    try {
      if (Capacitor.isNativePlatform()) await TextToSpeech.stop()
      else window.speechSynthesis?.cancel()
    } catch {
      /* silencieux */
    }
  }, [])

  return { parler, stopper }
}
