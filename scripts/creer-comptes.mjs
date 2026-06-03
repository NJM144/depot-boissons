// ============================================================================
//  SCRIPT D'ADMINISTRATION — création des comptes gérant + propriétaire
// ----------------------------------------------------------------------------
//  Crée un propriétaire, un dépôt, un gérant lié à ce dépôt, et un catalogue
//  de démonstration. Utilise la clé service_role (JAMAIS côté app !).
//
//  Lancer :  node scripts/creer-comptes.mjs
//  Prérequis : variables dans .env (VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
// ============================================================================

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

// Lecture simple du .env
const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    })
)

const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// --- Identifiants des comptes à créer (À PERSONNALISER) ---------------------
const PROPRIETAIRE = { email: 'patron@depot.ci', password: 'patron1234', nom: 'Patron' }
const GERANT = { email: 'gerant@depot.ci', password: 'gerant1234', nom: 'Gérant' }

async function creerUtilisateur({ email, password, nom, role, depot_id }) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nom, role, depot_id }, // → trigger handle_new_user crée le profil
  })
  if (error) throw error
  return data.user
}

async function main() {
  console.log('▶ Création du propriétaire…')
  const proprio = await creerUtilisateur({ ...PROPRIETAIRE, role: 'proprietaire' })

  console.log('▶ Création du dépôt…')
  const { data: depot, error: eDepot } = await supabase
    .from('depots')
    .insert({ nom: 'Dépôt Central', proprietaire_id: proprio.id })
    .select()
    .single()
  if (eDepot) throw eDepot

  console.log('▶ Création du gérant (lié au dépôt)…')
  await creerUtilisateur({ ...GERANT, role: 'gerant', depot_id: depot.id })

  console.log('▶ Catalogue de démonstration…')
  await supabase.from('boissons').insert([
    { depot_id: depot.id, nom: 'Coca-Cola', emoji: '🥤', couleur_casier: '#dc2626', prix_achat: 350, prix_vente: 500, seuil_alerte: 10 },
    { depot_id: depot.id, nom: 'Fanta Orange', emoji: '🍊', couleur_casier: '#ea580c', prix_achat: 350, prix_vente: 500, seuil_alerte: 10 },
    { depot_id: depot.id, nom: 'Sprite', emoji: '🥤', couleur_casier: '#16a34a', prix_achat: 350, prix_vente: 500, seuil_alerte: 10 },
    { depot_id: depot.id, nom: 'Eau minérale', emoji: '💧', couleur_casier: '#0ea5e9', prix_achat: 150, prix_vente: 300, seuil_alerte: 15 },
    { depot_id: depot.id, nom: 'Bière', emoji: '🍺', couleur_casier: '#ca8a04', prix_achat: 650, prix_vente: 1000, seuil_alerte: 12 },
  ])

  console.log('\n✅ Terminé.')
  console.log(`   Propriétaire : ${PROPRIETAIRE.email} / ${PROPRIETAIRE.password}`)
  console.log(`   Gérant       : ${GERANT.email} / ${GERANT.password}`)
  console.log(`   Dépôt        : ${depot.id}`)
}

main().catch((e) => {
  console.error('❌ Erreur :', e.message)
  process.exit(1)
})
