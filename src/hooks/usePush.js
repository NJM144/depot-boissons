// ============================================================================
//  HOOK usePush — NOTIFICATIONS PUSH (FCM via Capacitor)
// ----------------------------------------------------------------------------
//  Pour le PROPRIÉTAIRE : demande la permission, récupère le jeton FCM et
//  l'enregistre dans la table `push_tokens`. À chaque vente, l'Edge Function
//  `notify-vente` lui envoie une notification.
//
//  ⚠️ IMPORTANT : le push n'est tenté QUE si VITE_ENABLE_PUSH === 'true'.
//  Tant que Firebase (google-services.json) n'est PAS configuré, appeler
//  PushNotifications.register() fait planter l'app côté natif
//  ("Default FirebaseApp is not initialized"). On garde donc le push
//  DÉSACTIVÉ par défaut, et on enrobe tout dans un try/catch de sécurité.
//  Pour l'activer : configurer FCM (voir SUPABASE.md §3) puis builder avec
//  VITE_ENABLE_PUSH=true.
// ============================================================================

import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { enregistrerPushToken } from '../supabase/api.js'

// Drapeau de build : push désactivé tant que FCM n'est pas configuré
const PUSH_ACTIVE = import.meta.env.VITE_ENABLE_PUSH === 'true'

export function usePush(userId, actif = true) {
  useEffect(() => {
    // Ne rien faire si : push désactivé, pas d'utilisateur, ou hors plateforme native
    if (!PUSH_ACTIVE || !actif || !userId || !Capacitor.isNativePlatform()) return

    let listeners = []

    ;(async () => {
      try {
        // Import dynamique : le plugin n'existe que sur mobile
        const { PushNotifications } = await import('@capacitor/push-notifications')

        // Demande la permission
        let perm = await PushNotifications.checkPermissions()
        if (perm.receive === 'prompt') perm = await PushNotifications.requestPermissions()
        if (perm.receive !== 'granted') return

        // Enregistre l'appareil auprès de FCM (peut échouer si FCM non configuré)
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
      } catch (e) {
        // Filet de sécurité : aucune erreur push ne doit faire planter l'app
        console.warn('Push indisponible (FCM non configuré ?) :', e)
      }
    })()

    // Nettoyage des écouteurs
    return () => {
      listeners.forEach((l) => l.remove?.())
    }
  }, [userId, actif])
}
