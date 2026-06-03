// ============================================================================
//  EDGE FUNCTION : notify-vente
// ----------------------------------------------------------------------------
//  Déclenchée par un DATABASE WEBHOOK sur INSERT dans `mouvements`.
//  À chaque VENTE (type='sortie'), envoie une notification push FCM aux
//  propriétaire(s) du dépôt : "💰 Vente : [boisson] x[qté] = [montant] FCFA".
//
//  Variables d'environnement (Supabase → Edge Functions → Secrets) :
//    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//    FCM_PROJECT_ID, FCM_CLIENT_EMAIL, FCM_PRIVATE_KEY  (compte de service Firebase)
//
//  Déploiement :
//    npx supabase functions deploy notify-vente --no-verify-jwt
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ----- Outils crypto : génère un access token Google (FCM HTTP v1) ----------

// Encode en base64url
function base64url(data: ArrayBuffer | string): string {
  const bytes =
    typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// Importe la clé privée PEM du compte de service pour signer un JWT RS256
async function importerCle(pem: string): Promise<CryptoKey> {
  const corps = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '')
  const bin = Uint8Array.from(atob(corps), (c) => c.charCodeAt(0))
  return crypto.subtle.importKey(
    'pkcs8',
    bin.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )
}

// Échange un JWT signé contre un access token OAuth Google
async function obtenirAccessToken(): Promise<string> {
  const clientEmail = Deno.env.get('FCM_CLIENT_EMAIL')!
  const privateKey = Deno.env.get('FCM_PRIVATE_KEY')!.replace(/\\n/g, '\n')

  const maintenant = Math.floor(Date.now() / 1000)
  const entete = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: maintenant,
    exp: maintenant + 3600,
  }

  const aSigner = `${base64url(JSON.stringify(entete))}.${base64url(JSON.stringify(payload))}`
  const cle = await importerCle(privateKey)
  const signature = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    cle,
    new TextEncoder().encode(aSigner)
  )
  const jwt = `${aSigner}.${base64url(signature)}`

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  const json = await resp.json()
  if (!json.access_token) throw new Error('Échec token Google : ' + JSON.stringify(json))
  return json.access_token
}

// Envoie une notification à un jeton FCM via l'API HTTP v1
async function envoyerFCM(accessToken: string, token: string, titre: string, corps: string) {
  const projectId = Deno.env.get('FCM_PROJECT_ID')!
  const resp = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: titre, body: corps },
          android: { priority: 'HIGH', notification: { sound: 'default' } },
        },
      }),
    }
  )
  return resp.ok
}

// ----- Fonction principale --------------------------------------------------
Deno.serve(async (req) => {
  try {
    const payload = await req.json()
    const record = payload.record // ligne insérée dans `mouvements`

    // On ne notifie que les VENTES
    if (!record || record.type !== 'sortie') {
      return new Response('ignoré (pas une vente)', { status: 200 })
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Nom de la boisson
    const { data: boisson } = await admin
      .from('boissons')
      .select('nom')
      .eq('id', record.boisson_id)
      .single()

    // Propriétaire(s) du dépôt
    const { data: depot } = await admin
      .from('depots')
      .select('proprietaire_id, nom')
      .eq('id', record.depot_id)
      .single()
    if (!depot) return new Response('dépôt introuvable', { status: 200 })

    // Jetons push du propriétaire
    const { data: tokens } = await admin
      .from('push_tokens')
      .select('token')
      .eq('user_id', depot.proprietaire_id)

    if (!tokens || tokens.length === 0) {
      return new Response('aucun jeton push', { status: 200 })
    }

    // Contenu de la notification
    const montant = Number(record.montant_total || 0).toLocaleString('fr-FR')
    const titre = '💰 Nouvelle vente'
    const corps = `${boisson?.nom || 'Boisson'} x${record.quantite} = ${montant} FCFA`

    // Envoi à tous les jetons
    const accessToken = await obtenirAccessToken()
    await Promise.all(tokens.map((t) => envoyerFCM(accessToken, t.token, titre, corps)))

    return new Response(JSON.stringify({ envoye: tokens.length }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('Erreur notify-vente :', e)
    return new Response('erreur: ' + (e as Error).message, { status: 500 })
  }
})
