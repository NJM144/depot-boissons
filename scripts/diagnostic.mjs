// Diagnostic : reproduit les requêtes des comptes patron et gérant
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const SB = env.VITE_SUPABASE_URL, ANON = env.VITE_SUPABASE_ANON_KEY
const log = (n, e) => console.log(`${e ? '❌' : '✅'} ${n}${e ? ' -> ' + (e.message || e) : ''}`)

// ----- PATRON -----
console.log('=== COMPTE PATRON ===')
const p = createClient(SB, ANON, { auth: { persistSession: false } })
const { error: eLogin } = await p.auth.signInWithPassword({ email: 'patron@depot.ci', password: 'patron1234' })
log('connexion patron', eLogin)

const { data: prof, error: eProf } = await p.from('profiles').select('*').single()
log('lecture profil', eProf)
console.log('   profil:', prof)

const { data: dep, error: eDep } = await p.from('depots').select('id').limit(1).single()
log('lecture depot', eDep)
const depotId = dep?.id

if (depotId) {
  const q1 = await p.from('mouvements').select('id', { count: 'exact', head: true }).eq('depot_id', depotId).eq('statut', 'en_attente')
  log('compterEnAttente mouvements', q1.error)
  const q2 = await p.from('casses').select('id', { count: 'exact', head: true }).eq('depot_id', depotId).eq('statut', 'en_attente')
  log('compterEnAttente casses', q2.error)
  const q3 = await p.from('mouvements').select('*').eq('depot_id', depotId).eq('statut', 'en_attente')
  log('listerEnAttente mouvements', q3.error)
  const q4 = await p.from('boissons').select('id, nom, emoji').eq('depot_id', depotId)
  log('listerEnAttente boissons', q4.error)
  const q5 = await p.rpc('get_point', { p_depot_id: depotId, p_periode: 'jour' })
  log('get_point', q5.error)
  const q6 = await p.from('v_stock').select('*').eq('depot_id', depotId)
  log('v_stock', q6.error)
  const q7 = await p.from('boissons').select('*').eq('depot_id', depotId)
  log('catalogue proprio', q7.error)
}

// ----- GÉRANT -----
console.log('\n=== COMPTE GÉRANT ===')
const g = createClient(SB, ANON, { auth: { persistSession: false } })
const { data: gA, error: eg } = await g.auth.signInWithPassword({ email: 'gerant@depot.ci', password: 'gerant1234' })
log('connexion gerant', eg)
const { data: cat, error: ecat } = await g.from('v_boissons_gerant').select('*')
log('catalogue gerant (v_boissons_gerant)', ecat)
if (cat?.[0]) {
  // Insertion AVEC unite (ce que fait v1.0.4)
  const ins = await g.from('mouvements').insert({ depot_id: cat[0].depot_id, boisson_id: cat[0].id, type: 'sortie', quantite: 1, unite: 'casier', montant_total: 500, gerant_id: gA.user.id }).select('id')
  log('INSERT vente avec colonne "unite"', ins.error)
  if (!ins.error && ins.data?.[0]) await createClient(SB, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }).from('mouvements').delete().eq('id', ins.data[0].id)
}
