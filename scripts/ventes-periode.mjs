// Détail des ventes (sorties) entre deux dates, tous dépôts.
// Usage : node scripts/ventes-periode.mjs 2026-06-30 2026-07-04 (fin exclusive)
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const f = (n) => Number(n || 0).toLocaleString('fr-FR')

const DEBUT = process.argv[2] || '2026-06-30T00:00:00'
const FIN = process.argv[3] || '2026-07-04T00:00:00' // exclusif

const [{ data: bs }, { data: depots }, { data: clients }] = await Promise.all([
  sb.from('boissons').select('id, nom, emoji, depot_id'),
  sb.from('depots').select('id, nom'),
  sb.from('clients').select('id, nom'),
])
const boissonById = Object.fromEntries((bs || []).map((b) => [b.id, b]))
const depotById = Object.fromEntries((depots || []).map((d) => [d.id, d]))
const clientById = Object.fromEntries((clients || []).map((c) => [c.id, c]))

const { data: ms, error } = await sb.from('mouvements')
  .select('id, depot_id, boisson_id, quantite, unite, quantite_bouteilles, montant_total, marge, statut, client_id, client_passage, created_at')
  .eq('type', 'sortie')
  .gte('created_at', DEBUT).lt('created_at', FIN)
  .order('created_at', { ascending: true })
if (error) { console.error('❌', error.message); process.exit(1) }

if (!ms.length) { console.log(`Aucune vente entre ${DEBUT} et ${FIN}.`); process.exit(0) }

let totalCA = 0, totalMarge = 0, totalBt = 0
const parJour = {}
const parBoisson = {}

for (const m of ms) {
  const b = boissonById[m.boisson_id] || {}
  const dep = depotById[m.depot_id] || {}
  const jour = m.created_at.slice(0, 10)
  const bt = m.quantite_bouteilles ?? m.quantite
  totalCA += Number(m.montant_total || 0)
  totalMarge += Number(m.marge || 0)
  totalBt += Number(bt || 0)

  parJour[jour] = parJour[jour] || { ca: 0, marge: 0, bt: 0, n: 0 }
  parJour[jour].ca += Number(m.montant_total || 0)
  parJour[jour].marge += Number(m.marge || 0)
  parJour[jour].bt += Number(bt || 0)
  parJour[jour].n += 1

  const key = b.nom || m.boisson_id
  parBoisson[key] = parBoisson[key] || { bt: 0, ca: 0, marge: 0 }
  parBoisson[key].bt += Number(bt || 0)
  parBoisson[key].ca += Number(m.montant_total || 0)
  parBoisson[key].marge += Number(m.marge || 0)

  const clientLabel = m.client_passage ? 'passage' : (clientById[m.client_id]?.nom || (m.client_id ? m.client_id.slice(0, 8) : '—'))
  console.log(`${m.created_at.slice(0, 16).replace('T', ' ')}  [${m.statut.padEnd(10)}]  ${(dep.nom || '?').padEnd(12)}  ${(b.emoji || '')} ${b.nom || '?'}  ${m.quantite} ${m.unite} (${bt} bt)  = ${f(m.montant_total)} FCFA  marge ${f(m.marge)}  client:${clientLabel}`)
}

console.log(`\n=== TOTAUX PÉRIODE (${DEBUT} → ${FIN}) ===`)
console.log(`Ventes : ${ms.length} | Bouteilles : ${totalBt} | CA : ${f(totalCA)} FCFA | Marge : ${f(totalMarge)} FCFA`)

console.log('\n=== PAR JOUR ===')
for (const [jour, v] of Object.entries(parJour).sort()) {
  console.log(`${jour} : ${v.n} ventes | ${v.bt} bt | CA ${f(v.ca)} | marge ${f(v.marge)}`)
}

console.log('\n=== PAR BOISSON ===')
for (const [nom, v] of Object.entries(parBoisson).sort((a, b) => b[1].ca - a[1].ca)) {
  console.log(`${nom} : ${v.bt} bt | CA ${f(v.ca)} | marge ${f(v.marge)}`)
}
