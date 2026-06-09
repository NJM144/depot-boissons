// Liste les prix du catalogue + diagnostic unité (casier vs bouteille)
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const { data, error } = await sb
  .from('boissons')
  .select('nom, emoji, prix_achat, prix_vente, bouteilles_par_casier, actif')
  .eq('actif', true)
  .order('prix_achat', { ascending: false })

if (error) { console.error('❌', error.message); process.exit(1) }

const f = (n) => Number(n).toLocaleString('fr-FR')
console.log('NOM'.padEnd(22), 'ACHAT'.padStart(9), 'VENTE'.padStart(9), 'BPC'.padStart(4), '  VERDICT')
console.log('-'.repeat(70))
for (const b of data) {
  const bpc = b.bouteilles_par_casier || 12
  // Heuristique : un prix d'ACHAT > prix_vente est forcément aberrant si même unité.
  // Un prix "rond" élevé (>1500) ressemble à un prix CASIER ; un achat ~ vente/bpc ressemble à du PAR BOUTEILLE.
  const achatRessembleCasier = b.prix_achat > 1500 || b.prix_achat > b.prix_vente
  const venteRessembleCasier = b.prix_vente > 1500
  const flags = []
  if (achatRessembleCasier) flags.push('ACHAT=casier?')
  if (venteRessembleCasier) flags.push('VENTE=casier?')
  if (b.prix_achat > b.prix_vente) flags.push('⚠️ACHAT>VENTE')
  console.log(
    `${b.emoji || ''} ${b.nom}`.padEnd(22),
    f(b.prix_achat).padStart(9),
    f(b.prix_vente).padStart(9),
    String(bpc).padStart(4),
    '  ' + (flags.length ? flags.join(' ') : 'ok par bouteille')
  )
}
console.log('\nTotal:', data.length, 'boissons actives')
