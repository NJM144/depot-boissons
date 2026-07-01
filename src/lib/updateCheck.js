// ============================================================================
//  MISE À JOUR AUTOMATIQUE (APK sideloadé hors Play Store)
// ----------------------------------------------------------------------------
//  À chaque ouverture de l'app, on interroge la dernière release GitHub. Si
//  elle est plus récente que la version installée, on propose de télécharger
//  le nouvel APK (lien stable releases/latest).
//  Ne fait rien sur le web (seul l'APK natif se met à jour ainsi).
// ============================================================================

import { Capacitor } from '@capacitor/core'
import { Browser } from '@capacitor/browser'

const REPO = 'NJM144/depot-boissons'
export const APK_URL = `https://github.com/${REPO}/releases/latest/download/depot-boissons.apk`

// Version installée, injectée au build depuis package.json (vite define)
const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0'

// "v1.2.3" → [1,2,3]
function parse(v) {
  return String(v || '').replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0)
}

// Vrai si `distante` est strictement plus récente que `locale`
export function estPlusRecent(distante, locale) {
  const a = parse(distante)
  const b = parse(locale)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] || 0
    const y = b[i] || 0
    if (x > y) return true
    if (x < y) return false
  }
  return false
}

// Renvoie { version, notes, url } si une mise à jour est dispo, sinon null.
export async function verifierMiseAJour() {
  if (!Capacitor.isNativePlatform()) return null // uniquement sur l'APK

  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (!res.ok) return null
    const j = await res.json()
    const tag = j.tag_name || j.name
    if (tag && estPlusRecent(tag, APP_VERSION)) {
      return { version: String(tag).replace(/^v/i, ''), notes: j.body || '', url: APK_URL }
    }
  } catch { /* hors-ligne / API indispo : on réessaiera plus tard */ }
  return null
}

// Ouvre le téléchargement de l'APK dans le navigateur système (puis l'utilisateur l'installe)
export async function ouvrirTelechargement(url = APK_URL) {
  try { await Browser.open({ url }) }
  catch { window.open(url, '_blank') }
}
