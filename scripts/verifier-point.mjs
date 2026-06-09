// Contrôle post-migration : appelle get_point (comme le patron) et affiche le détail.
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
const { data: dep } = await sb.from('depots').select('id').limit(1).single()
const depotId = dep?.id
const f = (n) => Number(n).toLocaleString('fr-FR')

for (const periode of ['jour', 'semaine', 'mois']) {
  const { data: p, error } = await sb.rpc('get_point', { p_depot_id: depotId, p_periode: periode })
  if (error) { console.error(`❌ get_point ${periode}:`, error.message); continue }
  console.log(`\n===== ${periode.toUpperCase()} =====`)
  console.log(`CA: ${f(p.chiffre_affaires)}  |  Marge: ${f(p.total_marge)}  |  Casses: ${f(p.total_casse_cout)}  |  Marge nette: ${f(p.marge_nette)}`)
  const det = (p.detail || []).filter((d) => d.quantite_vendue > 0)
  if (det.length) {
    console.log('  boisson'.padEnd(22), 'vendu'.padStart(6), 'CA'.padStart(10), 'marge'.padStart(10))
    for (const d of det) {
      const flag = Number(d.marge) < 0 ? ' ⚠️NEG' : ''
      console.log('  ' + d.nom.padEnd(20), String(d.quantite_vendue).padStart(6), f(d.chiffre_affaires).padStart(10), f(d.marge).padStart(10) + flag)
    }
  }
}
