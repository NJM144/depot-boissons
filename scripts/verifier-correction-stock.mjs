// ============================================================================
//  Vérifie la fonctionnalité « correction du stock » (migration 0012)
//  - contrôle que la table ajustements_stock et la colonne v_stock existent
//  - teste la RPC corriger_stock À BLANC (cible = stock actuel → delta 0,
//    aucune ligne créée, aucune donnée modifiée)
//  Lancer : node scripts/verifier-correction-stock.mjs
//  Prérequis .env : VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
// ============================================================================
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

// 1) Table ajustements_stock présente ?
const tbl = await sb.from('ajustements_stock').select('id').limit(1)
if (tbl.error) {
  console.error('❌ Table ajustements_stock absente — applique d’abord la migration 0012 dans le SQL Editor.')
  console.error('   (', tbl.error.message, ')')
  process.exit(1)
}
console.log('✓ Table ajustements_stock présente.')

// 2) Colonne total_ajustements dans v_stock ?
const { data: stocks, error: eStock } = await sb.from('v_stock')
  .select('boisson_id, nom, stock, total_ajustements, bouteilles_par_casier').limit(50)
if (eStock) { console.error('❌ v_stock:', eStock.message); process.exit(1) }
console.log('✓ v_stock expose total_ajustements.')

const cible = (stocks || []).find((s) => s.nom?.toLowerCase().startsWith('cody')) || stocks?.[0]
if (!cible) { console.log('ℹ️ Aucune boisson pour tester la RPC.'); process.exit(0) }

// 3) RPC corriger_stock À BLANC (cible = stock actuel → delta 0, ne modifie rien)
const { data: res, error: eRpc } = await sb.rpc('corriger_stock', {
  p_boisson_id: cible.boisson_id, p_stock_cible: Math.max(0, cible.stock), p_motif: 'test à blanc (vérif)',
})
if (eRpc) { console.error('❌ corriger_stock:', eRpc.message); process.exit(1) }
console.log(`✓ RPC corriger_stock OK sur « ${cible.nom} » (stock ${cible.stock}) → delta ${res.delta} (${res.message || 'écart enregistré'}).`)
console.log('\nTout est en place. Le patron peut maintenant corriger le stock depuis l’onglet 📦 Stock.')
