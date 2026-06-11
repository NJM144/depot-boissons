// Diagnostic : tente d'insérer une charge actionnaire comme le PATRON (RLS).
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
await sb.auth.signInWithPassword({ email: 'patron@depot.ci', password: 'patron1234' })

const { data: dep } = await sb.from('depots').select('id').limit(1).single()
console.log('depot:', dep?.id)

const { data: acts, error: eA } = await sb.from('actionnaires').select('id, nom, depot_id')
console.log('actionnaires:', eA ? '❌ ' + eA.message : JSON.stringify(acts))
if (!acts?.length) { console.log('⚠️ Aucun actionnaire — créez-en un avant les charges.'); process.exit(0) }

const a = acts[0]
const mois = '2026-06-01'
const { data, error } = await sb.from('charges_actionnaire').insert({
  depot_id: a.depot_id, actionnaire_id: a.id, libelle: 'TEST diag', montant: 1000, mois,
}).select()
console.log('insert charge:', error ? '❌ ' + JSON.stringify(error) : '✅ ' + JSON.stringify(data))

// nettoyage du test
if (data?.[0]) await sb.from('charges_actionnaire').delete().eq('id', data[0].id)
