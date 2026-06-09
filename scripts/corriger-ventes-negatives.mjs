// Corrige les ventes VALIDÉES à marge négative : montant = bouteilles × prix de
// vente annoncé (prix_vente casier ÷ bpc). Le trigger recalcule la marge.
//   node scripts/corriger-ventes-negatives.mjs           (aperçu)
//   node scripts/corriger-ventes-negatives.mjs --apply    (applique)
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const APPLY = process.argv.includes('--apply')
const f = (n) => Number(n).toLocaleString('fr-FR')

const { data: bs } = await sb.from('boissons').select('id, nom, prix_vente, bouteilles_par_casier')
const byId = Object.fromEntries(bs.map((b) => [b.id, b]))

const { data: ms, error } = await sb.from('mouvements')
  .select('id, boisson_id, quantite, unite, quantite_bouteilles, montant_total, marge')
  .eq('type', 'sortie').eq('statut', 'valide').lt('marge', 0)
if (error) { console.error('❌', error.message); process.exit(1) }
if (!ms.length) { console.log('✅ Aucune vente validée à marge négative.'); process.exit(0) }

for (const m of ms) {
  const b = byId[m.boisson_id] || {}
  const bpc = b.bouteilles_par_casier || 12
  const bt = m.quantite_bouteilles || m.quantite
  const venteBt = Math.round((b.prix_vente / bpc) * 100) / 100
  const nouveau = Math.round(bt * venteBt)   // arrondi au FCFA
  console.log(`• ${b.nom} : ${bt} bt × ${f(venteBt)} = ${f(nouveau)}  (avant : encaissé ${f(m.montant_total)}, marge ${f(m.marge)})`)
  if (APPLY) {
    const { error: e } = await sb.from('mouvements').update({ montant_total: nouveau }).eq('id', m.id)
    if (e) console.error('  ❌', e.message)
  }
}
console.log(`\n${APPLY ? '✅ Appliqué' : '👀 Aperçu (--apply pour écrire)'} : ${ms.length} vente(s).`)
