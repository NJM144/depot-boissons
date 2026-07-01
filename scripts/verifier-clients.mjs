// ============================================================================
//  Vérifie la fonctionnalité « clients & attribution des ventes » (migr. 0013)
//  - table clients présente, colonnes client_id / client_passage sur mouvements
//  - RPC get_ventes_par_client opérationnelle
//  Lecture seule (ne crée aucune donnée).
//  Lancer : node scripts/verifier-clients.mjs
// ============================================================================
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
const { error: eLog } = await sb.auth.signInWithPassword({ email: 'patron@depot.ci', password: 'patron1234' })
if (eLog) { console.error('❌ connexion patron:', eLog.message); process.exit(1) }
const f = (n) => Number(n || 0).toLocaleString('fr-FR') + ' F'

// 1) Table clients
const tcl = await sb.from('clients').select('id').limit(1)
if (tcl.error) { console.error('❌ Table clients absente — applique la migration 0013.\n  (', tcl.error.message, ')'); process.exit(1) }
console.log('✓ Table clients présente.')

// 2) Colonnes d'attribution sur mouvements
const tm = await sb.from('mouvements').select('id, client_id, client_passage').limit(1)
if (tm.error) { console.error('❌ Colonnes client_id/client_passage absentes —', tm.error.message); process.exit(1) }
console.log('✓ mouvements.client_id + client_passage présents.')

// 3) RPC get_ventes_par_client (mois courant)
const { data: dep } = await sb.from('depots').select('id').limit(1).single()
const t = new Date()
const debut = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-01`
const fin = t.toISOString().slice(0, 10)
const { data: res, error } = await sb.rpc('get_ventes_par_client', { p_depot_id: dep.id, p_debut: debut, p_fin: fin })
if (error) { console.error('❌ get_ventes_par_client:', error.message); process.exit(1) }

console.log(`\n===== VENTES PAR CLIENT ${res.debut} → ${res.fin} =====`)
console.log(`Clients réguliers : ${(res.clients || []).length}`)
for (const c of res.clients || []) {
  console.log(`  ${(c.nom || '—').padEnd(14)} ${String(c.nb_ventes).padStart(3)} vente(s)  ${f(c.total).padStart(12)}`)
}
console.log(`🚶 Passage : ${res.passage.nb_ventes} vente(s) — ${f(res.passage.total)}`)
console.log(`Sans client : ${res.non_attribue.nb_ventes} vente(s) — ${f(res.non_attribue.total)}`)
console.log('\nTout est en place. Le gérant peut ajouter des clients (voix+photo) et attribuer ses ventes.')
