// ============================================================================
//  HOOK useFeedback — VIBRATION TACTILE + SONS
// ----------------------------------------------------------------------------
//  Retour tactile et sonore à chaque action (rassure le gérant analphabète).
//  - Vibration : plugin @capacitor/haptics (repli navigator.vibrate en web).
//  - Sons : générés à la volée via l'API Web Audio (aucun fichier nécessaire).
// ============================================================================

import { useCallback, useRef } from 'react'
import { Capacitor } from '@capacitor/core'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'

export function useFeedback() {
  const audioCtxRef = useRef(null)

  // Récupère (ou crée) le contexte audio partagé
  const getCtx = () => {
    if (!audioCtxRef.current) {
      const AC = window.AudioContext || window.webkitAudioContext
      if (AC) audioCtxRef.current = new AC()
    }
    return audioCtxRef.current
  }

  // Joue un petit bip (fréquence en Hz, durée en ms)
  const bip = useCallback((frequence = 880, duree = 120) => {
    const ctx = getCtx()
    if (!ctx) return
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = frequence
    osc.type = 'sine'
    gain.gain.setValueAtTime(0.2, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duree / 1000)
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + duree / 1000)
  }, [])

  // Vibration légère (tap sur un bouton)
  const vibrerLeger = useCallback(async () => {
    try {
      if (Capacitor.isNativePlatform()) await Haptics.impact({ style: ImpactStyle.Light })
      else navigator.vibrate?.(20)
    } catch {
      /* silencieux */
    }
  }, [])

  // Feedback de SUCCÈS (validation) : vibration + bip aigu agréable
  const succes = useCallback(async () => {
    try {
      if (Capacitor.isNativePlatform())
        await Haptics.notification({ type: NotificationType.Success })
      else navigator.vibrate?.([40, 30, 40])
    } catch {
      /* silencieux */
    }
    bip(988, 140) // Si aigu
    setTimeout(() => bip(1319, 180), 130) // Mi aigu
  }, [bip])

  // Feedback d'ERREUR / annulation : vibration + bip grave
  const erreur = useCallback(async () => {
    try {
      if (Capacitor.isNativePlatform())
        await Haptics.notification({ type: NotificationType.Error })
      else navigator.vibrate?.([80, 40, 80])
    } catch {
      /* silencieux */
    }
    bip(220, 250)
  }, [bip])

  // Clic standard sur un bouton (le plus courant)
  const clic = useCallback(async () => {
    await vibrerLeger()
    bip(660, 70)
  }, [vibrerLeger, bip])

  return { clic, succes, erreur, vibrerLeger, bip }
}
