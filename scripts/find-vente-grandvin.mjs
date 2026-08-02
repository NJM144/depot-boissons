import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const { data: dep } = await sb.from('depots').select('id').limit(1).single()
const { data: boisson } = await sb.from('boissons').select('id, nom, bouteilles_par_casier').eq('depot_id', dep.id).ilike('nom', '%Grand Vin%').single()

const { data: mvts, error } = await sb.from('mouvements')
  .select('*')
  .eq('depot_id', dep.id).eq('boisson_id', boisson.id).eq('type', 'sortie')
  .gte('created_at', '2026-07-12T17:58:00Z').lt('created_at', '2026-07-12T18:00:00Z')
  .order('created_at')
if (error) throw error
console.log('Boisson:', boisson)
console.log('Lignes trouvées:', JSON.stringify(mvts, null, 2))
