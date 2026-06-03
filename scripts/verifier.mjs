// Vérification rapide de l'état de la base (lecture via service_role)
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const { data: depots } = await sb.from('depots').select('*')
const { data: profiles } = await sb.from('profiles').select('*')
const { data: boissons } = await sb.from('boissons').select('nom, prix_achat, prix_vente')

console.log('DÉPÔTS :', depots)
console.log('PROFILS :', profiles)
console.log('BOISSONS :', boissons?.length, boissons?.map((b) => b.nom).join(', '))
