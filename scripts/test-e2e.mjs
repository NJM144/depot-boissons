// ============================================================================
//  TEST BOUT-EN-BOUT — valide le flux + la sécurité RLS (clé publishable/anon)
// ============================================================================
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const SB_URL = env.VITE_SUPABASE_URL
const ANON = env.VITE_SUPABASE_ANON_KEY
const nouveau = () => createClient(SB_URL, ANON, { auth: { persistSession: false } })

const ok = (c, m) => console.log(`${c ? '✅' : '❌'} ${m}`)

// --- GÉRANT -----------------------------------------------------------------
const gerant = nouveau()
const { data: gAuth, error: gErr } = await gerant.auth.signInWithPassword({
  email: 'gerant@depot.ci', password: 'gerant1234',
})
ok(!gErr, `Connexion gérant ${gErr ? gErr.message : ''}`)
const gerantId = gAuth.user.id

// Le gérant lit son catalogue via la vue sécurisée (sans prix_achat)
const { data: cat } = await gerant.from('v_boissons_gerant').select('*')
ok(cat?.length === 5, `Gérant voit ${cat?.length} boissons (vue sécurisée)`)
ok(cat && !('prix_achat' in (cat[0] || {})), 'Vue gérant NE CONTIENT PAS prix_achat 🔒')

// SÉCURITÉ : le gérant ne doit PAS lire la table boissons en direct (prix_achat)
const { data: directe } = await gerant.from('boissons').select('prix_achat')
ok((directe?.length || 0) === 0, `Gérant bloqué sur boissons.prix_achat (lignes=${directe?.length || 0}) 🔒`)

// SÉCURITÉ : le gérant ne doit PAS lire mouvements (donc pas la marge)
const { data: mvtGerant } = await gerant.from('mouvements').select('marge')
ok((mvtGerant?.length || 0) === 0, `Gérant bloqué sur mouvements.marge (lignes=${mvtGerant?.length || 0}) 🔒`)

// Le gérant enregistre une VENTE (sortie de 3 unités)
const boisson = cat[0]
const depotId = boisson.depot_id
const { error: insErr } = await gerant.from('mouvements').insert({
  depot_id: depotId, boisson_id: boisson.id, type: 'sortie', quantite: 3, gerant_id: gerantId,
})
ok(!insErr, `Gérant enregistre une vente ${insErr ? insErr.message : ''}`)

// Le gérant enregistre aussi une CASSE
const { error: casErr } = await gerant.from('casses').insert({
  depot_id: depotId, boisson_id: boisson.id, quantite: 1, gerant_id: gerantId,
})
ok(!casErr, `Gérant enregistre une casse ${casErr ? casErr.message : ''}`)

// --- PROPRIÉTAIRE -----------------------------------------------------------
const proprio = nouveau()
const { error: pErr } = await proprio.auth.signInWithPassword({
  email: 'patron@depot.ci', password: 'patron1234',
})
ok(!pErr, `Connexion propriétaire ${pErr ? pErr.message : ''}`)

// Le proprio lit les mouvements AVEC la marge calculée par le trigger
const { data: mvts } = await proprio.from('mouvements').select('*').eq('type', 'sortie')
const v = mvts?.[0]
ok(v?.montant_total > 0, `Trigger: montant_total=${v?.montant_total} (3 × prix_vente)`)
ok(v?.marge > 0, `Trigger: marge=${v?.marge} (visible au proprio uniquement)`)

// RPC get_point
const { data: point, error: ptErr } = await proprio.rpc('get_point', {
  p_depot_id: depotId, p_periode: 'jour',
})
ok(!ptErr && point, `RPC get_point OK`)
if (point) {
  console.log(`   → CA=${point.chiffre_affaires} | marge=${point.total_marge} | casses=${point.total_casse_cout} | NETTE=${point.marge_nette}`)
}

// SÉCURITÉ : un get_point sur un dépôt qu'il ne possède pas doit échouer
const { error: refus } = await proprio.rpc('get_point', {
  p_depot_id: '00000000-0000-0000-0000-000000000000', p_periode: 'jour',
})
ok(!!refus, `Accès refusé au point d'un autre dépôt 🔒`)

console.log('\nTest terminé.')
