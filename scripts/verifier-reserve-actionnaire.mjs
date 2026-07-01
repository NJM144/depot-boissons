// ============================================================================
//  Vérifie la fonctionnalité « produits réservés à un actionnaire » (migr. 0011)
//  - contrôle que la colonne boissons.actionnaire_reserve_id existe
//  - (ré)affecte les Cody's → Morel (idempotent, sécurité si oubli dans le SQL)
//  - appelle get_benefices_actionnaires et affiche le bénéfice de chacun
//  Lancer : node scripts/verifier-reserve-actionnaire.mjs
//  Prérequis .env : VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
// ============================================================================
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const f = (n) => Number(n || 0).toLocaleString('fr-FR') + ' F'

// 1) Colonne présente ?
const probe = await sb.from('boissons').select('id, actionnaire_reserve_id').limit(1)
if (probe.error) {
  console.error('❌ Colonne actionnaire_reserve_id absente — applique d’abord la migration 0011 dans le SQL Editor.')
  console.error('   (', probe.error.message, ')')
  process.exit(1)
}
console.log('✓ Colonne actionnaire_reserve_id présente.')

const { data: dep } = await sb.from('depots').select('id, fond_de_commerce').limit(1).single()
const depotId = dep.id

// 2) (ré)affectation Cody's → Morel (idempotent)
const { data: morel } = await sb.from('actionnaires').select('id, nom')
  .eq('depot_id', depotId).ilike('nom', 'morel%').limit(1).single()
if (!morel) { console.error('❌ Actionnaire « Morel » introuvable.'); process.exit(1) }

const { data: codys } = await sb.from('boissons').select('id, nom, actionnaire_reserve_id')
  .eq('depot_id', depotId).ilike('nom', 'cody%')
for (const b of codys || []) {
  if (b.actionnaire_reserve_id !== morel.id) {
    await sb.from('boissons').update({ actionnaire_reserve_id: morel.id }).eq('id', b.id)
    console.log('  → réservé à Morel :', b.nom)
  }
}
console.log(`✓ ${codys?.length || 0} produit(s) Cody's réservé(s) à ${morel.nom.trim()}.`)

// 3) Bénéfices du mois courant — la RPC patron exige une session patron
//    (owns_depot s'appuie sur auth.uid()), donc on se connecte avec la clé anon.
const t = new Date()
const mois = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-01`
const sbAnon = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
const { error: eLog } = await sbAnon.auth.signInWithPassword({ email: 'patron@depot.ci', password: 'patron1234' })
if (eLog) { console.error('❌ connexion patron:', eLog.message); process.exit(1) }
const { data: res, error } = await sbAnon.rpc('get_benefices_actionnaires', { p_depot_id: depotId, p_mois: mois })
if (error) { console.error('❌ get_benefices_actionnaires:', error.message); process.exit(1) }

console.log(`\n===== BÉNÉFICES ${res.mois} =====`)
console.log('Marge totale commerce :', f(res.marge_totale))
console.log('  → à partager (parts):', f(res.marge_commerce))
console.log('  → réservée (directe) :', f(res.marge_reservee))
console.log('Fonds de commerce     :', f(res.fond_de_commerce), '| part actionnaires', res.part_actionnaires_pct + '%')
console.log('')
for (const a of res.actionnaires || []) {
  const resv = Number(a.benefice_reserve) > 0 ? `  [réservé ${f(a.benefice_reserve)} : ${(a.produits_reserves || []).join(', ')}]` : ''
  console.log(`  ${a.nom.trim().padEnd(10)} part ${String(a.part_pct).padStart(5)}%  brut ${f(a.benefice_brut).padStart(12)}  net ${f(a.benefice_net).padStart(12)}${resv}`)
}
