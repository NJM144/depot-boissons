// ============================================================================
//  MISE À JOUR AUTOMATIQUE (APK sideloadé hors Play Store)
// ----------------------------------------------------------------------------
//  À chaque Nᵉ ouverture de l'app (FREQUENCE = 10), on interroge la dernière
//  release GitHub. Si elle est plus récente que la version installée, on
//  propose de télécharger le nouvel APK (lien stable releases/latest).
//  Ne fait rien sur le web (seul l'APK natif se met à jour ainsi).
// ============================================================================

import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { Browser } from '@capacitor/browser'

const REPO = 'NJM144/depot-boissons'
export const APK_URL = `https://github.com/${REPO}/releases/latest/download/depot-boissons.apk`
const FREQUENCE = 10 // vérifie toutes les 10 ouvertures

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

// Incrémente le compteur d'ouvertures et indique si on doit vérifier ce coup-ci
async function toucheCompteur() {
  let n = 0
  try { n = parseInt((await Preferences.get({ key: 'maj_compteur' })).value || '0', 10) || 0 } catch { /* ignore */ }
  n += 1
  try { await Preferences.set({ key: 'maj_compteur', value: String(n) }) } catch { /* ignore */ }
  return n
}

// Renvoie { version, notes, url } si une mise à jour est dispo, sinon null.
export async function verifierMiseAJour() {
  if (!Capacitor.isNativePlatform()) return null // uniquement sur l'APK

  const n = await toucheCompteur()
  if (n % FREQUENCE !== 0) return null // on ne vérifie qu'à chaque 10ᵉ ouverture

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
