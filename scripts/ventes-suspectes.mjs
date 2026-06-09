// Liste les ventes (sorties) à marge négative pour vérification par le patron.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const f = (n) => Number(n).toLocaleString('fr-FR')

const { data: bs } = await sb.from('boissons').select('id, nom, prix_achat, prix_vente, bouteilles_par_casier')
const byId = Object.fromEntries(bs.map((b) => [b.id, b]))

const { data: ms, error } = await sb.from('mouvements')
  .select('id, boisson_id, quantite, unite, quantite_bouteilles, montant_total, marge, statut, created_at')
  .eq('type', 'sortie').lt('marge', 0).order('marge', { ascending: true })
if (error) { console.error('❌', error.message); process.exit(1) }

if (!ms.length) { console.log('✅ Aucune vente à marge négative.'); process.exit(0) }
console.log(`${ms.length} vente(s) à marge négative :\n`)
for (const m of ms) {
  const b = byId[m.boisson_id] || {}
  const bt = m.quantite_bouteilles || m.quantite
  const prixBtSaisi = Math.round((m.montant_total / bt) * 100) / 100
  const achatBt = Math.round((b.prix_achat / (b.bouteilles_par_casier || 12)) * 100) / 100
  const venteBt = Math.round((b.prix_vente / (b.bouteilles_par_casier || 12)) * 100) / 100
  console.log(`• ${b.nom}  [${m.statut}]  ${m.created_at.slice(0, 16).replace('T', ' ')}`)
  console.log(`    ${m.quantite} ${m.unite} = ${bt} bt | encaissé ${f(m.montant_total)} (${f(prixBtSaisi)}/bt)`)
  console.log(`    prix catalogue/bt : achat ${f(achatBt)} · vente ${f(venteBt)}  → marge ${f(m.marge)}`)
}
