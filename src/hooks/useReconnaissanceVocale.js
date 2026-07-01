// ============================================================================
//  HOOK useReconnaissanceVocale — RECONNAISSANCE VOCALE (parole → texte)
// ----------------------------------------------------------------------------
//  Permet au gérant analphabète de DICTER le nom d'un client.
//   - Sur APK Android : plugin @capacitor-community/speech-recognition.
//   - Sur navigateur (dev) : repli sur l'API Web SpeechRecognition (Chrome).
//  ecouter() renvoie une Promise<string|null> avec le meilleur résultat.
// ============================================================================

import { useCallback, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { SpeechRecognition } from '@capacitor-community/speech-recognition'

export function useReconnaissanceVocale() {
  const [ecoute, setEcoute] = useState(false)
  const recRef = useRef(null)

  const ecouter = useCallback(async () => {
    setEcoute(true)
    try {
      // -------- Plateforme native (APK) : plugin Capacitor ------------------
      if (Capacitor.isNativePlatform()) {
        try {
          const perm = await SpeechRecognition.checkPermissions().catch(() => null)
          if (!perm || perm.speechRecognition !== 'granted') {
            const dem = await SpeechRecognition.requestPermissions()
            if (dem.speechRecognition !== 'granted') throw new Error('Permission micro refusée')
          }
        } catch {
          // certaines versions n'exposent pas checkPermissions : on tente quand même
        }
        const res = await SpeechRecognition.start({
          language: 'fr-FR',
          maxResults: 3,
          partialResults: false,
          popup: false,
        })
        const matches = res?.matches || []
        return matches[0]?.trim() || null
      }

      // -------- Navigateur (dev) : Web Speech API ---------------------------
      const Rec = window.SpeechRecognition || window.webkitSpeechRecognition
      if (!Rec) throw new Error('Reconnaissance vocale indisponible sur ce navigateur')
      return await new Promise((resolve, reject) => {
        const rec = new Rec()
        recRef.current = rec
        rec.lang = 'fr-FR'
        rec.maxAlternatives = 3
        rec.interimResults = false
        rec.onresult = (e) => resolve(e.results?.[0]?.[0]?.transcript?.trim() || null)
        rec.onerror = (e) => reject(new Error(e.error || 'Erreur micro'))
        rec.onend = () => { recRef.current = null }
        rec.start()
      })
    } finally {
      setEcoute(false)
    }
  }, [])

  const stopper = useCallback(async () => {
    try {
      if (Capacitor.isNativePlatform()) await SpeechRecognition.stop().catch(() => {})
      else recRef.current?.stop?.()
    } catch {
      /* silencieux */
    }
    setEcoute(false)
  }, [])

  return { ecouter, stopper, ecoute }
}
