// Pose les prix CASIER exacts fournis par le patron (achat + vente + bpc).
// Modèle : prix_achat / prix_vente = prix PAR CASIER ; bouteille = /bpc.
// Lance AVANT le backfill de la migration 0008.
//   node scripts/poser-prix-casier.mjs          (aperçu, ne modifie rien)
//   node scripts/poser-prix-casier.mjs --apply   (applique)
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const APPLY = process.argv.includes('--apply')

// Clé de rapprochement = nom normalisé (sans accents/espaces/B12, minuscules).
const norm = (s) => (s || '').toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')   // accents
  .replace(/[’']/g, '').replace(/b12/g, '')           // apostrophes + "b12"
  .replace(/[^a-z0-9]/g, '')                          // tout le reste

// Prix CASIER fournis par le patron : [clé, achat_casier, vente_casier, bpc]
const PRIX = [
  ['cody senergi',   9500, 12000, 24],
  ['cody sblanc',   11000, 14400, 24],
  ['cody sbleu',    12000, 14400, 24],
  ['beaufort',       5300,  5600, 12],
  ['dopelalcool',    4650,  5000, 12],
  ['tequila',        4700,  5000, 12],
  ['valpierre',      9600, 10000, 12],
  ['castel',         4650,  5000, 12],
  ['chill',          4100,  5000, 12],
  ['sucrerieyouki',  2390,  4000, 12],
  ['grandvin',      19150, 20000, 12],
  ['orangina',       5475,  6000, 12],
  ['66',             5150,  5400, 12],
  ['racine',         4450,  5000, 12],
].map(([k, a, v, b]) => [norm(k), a, v, b])

const { data: boissons, error } = await sb.from('boissons')
  .select('id, nom, prix_achat, prix_vente, bouteilles_par_casier, actif').eq('actif', true)
if (error) { console.error('❌', error.message); process.exit(1) }

const f = (n) => Number(n).toLocaleString('fr-FR')
let ok = 0, manques = []
for (const b of boissons) {
  const nb = norm(b.nom)
  // match : clé contenue dans le nom DB ou inversement
  const row = PRIX.find(([k]) => nb.includes(k) || k.includes(nb))
  if (!row) { manques.push(b.nom); continue }
  const [, achat, vente, bpc] = row
  const venteBt = Math.round((vente / bpc) * 100) / 100
  console.log(
    `${b.nom}`.padEnd(24),
    `achat ${f(b.prix_achat)}→${f(achat)}`.padEnd(22),
    `vente ${f(b.prix_vente)}→${f(vente)}`.padEnd(22),
    `bpc ${b.bouteilles_par_casier}→${bpc}`.padEnd(12),
    `(bouteille ${f(venteBt)})`
  )
  if (APPLY) {
    const { error: e } = await sb.from('boissons')
      .update({ prix_achat: achat, prix_vente: vente, bouteilles_par_casier: bpc })
      .eq('id', b.id)
    if (e) { console.error('  ❌', b.nom, e.message); continue }
  }
  ok++
}
console.log(`\n${APPLY ? '✅ Appliqué' : '👀 Aperçu'} : ${ok}/${boissons.length} boissons.`)
if (manques.length) console.log('⚠️ Non rapprochées (à vérifier) :', manques.join(', '))
if (!APPLY) console.log('→ Relance avec --apply pour écrire en base.')
