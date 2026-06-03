// ============================================================================
//  HOOK usePush — NOTIFICATIONS PUSH (FCM via Capacitor)
// ----------------------------------------------------------------------------
//  Pour le PROPRIÉTAIRE : demande la permission, récupère le jeton FCM et
//  l'enregistre dans la table `push_tokens`. À chaque vente, l'Edge Function
//  `notify-vente` lui envoie une notification.
//  Ne fait rien hors plateforme native (web) ou si Supabase n'est pas configuré.
// ============================================================================

import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { enregistrerPushToken } from '../supabase/api.js'

export function usePush(userId, actif = true) {
  useEffect(() => {
    if (!actif || !userId || !Capacitor.isNativePlatform()) return

    let listeners = []

    ;(async () => {
      // Import dynamique : le plugin n'existe que sur mobile
      const { PushNotifications } = await import('@capacitor/push-notifications')

      // Demande la permission
      let perm = await PushNotifications.checkPermissions()
      if (perm.receive === 'prompt') perm = await PushNotifications.requestPermissions()
      if (perm.receive !== 'granted') return

      // Enregistre l'appareil auprès de FCM
      await PushNotifications.register()

      // Réception du jeton FCM → on l'enregistre côté Supabase
      listeners.push(
        await PushNotifications.addListener('registration', async (jeton) => {
          try {
            await enregistrerPushToken(userId, jeton.value, Capacitor.getPlatform())
          } catch (e) {
            console.warn('Enregistrement du jeton push échoué :', e)
          }
        })
      )

      listeners.push(
        await PushNotifications.addListener('registrationError', (err) =>
          console.warn('Erreur enregistrement push :', err)
        )
      )
    })()

    // Nettoyage des écouteurs
    return () => {
      listeners.forEach((l) => l.remove?.())
    }
  }, [userId, actif])
}
