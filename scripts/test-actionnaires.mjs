// Vérifie que la migration 0010 (actionnaires) est bien appliquée.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
const mois = (() => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-01` })()

// 1) colonne fond_de_commerce + RPC patron
await sb.auth.signInWithPassword({ email: 'patron@depot.ci', password: 'patron1234' })
const { data: dep } = await sb.from('depots').select('id, fond_de_commerce').limit(1).single()
console.log('✅ depots.fond_de_commerce :', dep?.fond_de_commerce)

const { data: ben, error: eBen } = await sb.rpc('get_benefices_actionnaires', { p_depot_id: dep.id, p_mois: mois })
if (eBen) console.log('❌ get_benefices_actionnaires :', eBen.message)
else console.log('✅ get_benefices_actionnaires :', JSON.stringify(ben))

// 2) RPC actionnaire (code bidon → trouve:false attendu)
const { data: ac, error: eAc } = await sb.rpc('get_compte_actionnaire', { p_code: '000000', p_mois: mois })
if (eAc) console.log('❌ get_compte_actionnaire :', eAc.message)
else console.log('✅ get_compte_actionnaire (code test) :', JSON.stringify(ac))
