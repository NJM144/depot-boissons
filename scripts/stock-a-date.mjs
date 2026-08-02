// Calcule le stock (par boisson, tous dépôts) tel qu'il était à une date donnée.
// Rejoue la formule de la vue v_stock (entrées - sorties - casses + ajustements)
// mais en ne comptant que les lignes dont created_at <= la date passée en argument.
// Usage : node scripts/stock-a-date.mjs JJ/MM/AAAA
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)

const SB = env.VITE_SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!SB || !SERVICE_KEY) throw new Error('VITE_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant dans .env')

const sb = createClient(SB, SERVICE_KEY, { auth: { persistSession: false } })

const dateArg = process.argv[2]
if (!dateArg) throw new Error('Usage: node stock-a-date.mjs JJ/MM/AAAA')
const [jj, mm, aaaa] = dateArg.split('/').map(Number)
// Abidjan = UTC+0 toute l'année, donc 23:59:59 heure locale = 23:59:59 UTC
const cutoff = new Date(Date.UTC(aaaa, mm - 1, jj, 23, 59, 59, 999)).toISOString()

const fmtFCFA = (n) => Math.round(n).toLocaleString('fr-FR') + ' FCFA'

// Supabase/PostgREST tronque à 1000 lignes par défaut : on doit paginer
// nous-mêmes sinon les sommes sont fausses dès qu'une table dépasse 1000 lignes.
async function fetchAll(query) {
  const PAGE = 1000
  let from = 0
  let out = []
  for (;;) {
    const { data, error } = await query.range(from, from + PAGE - 1)
    if (error) throw error
    out = out.concat(data)
    if (data.length < PAGE) break
    from += PAGE
  }
  return out
}

const { data: depots, error: eDep } = await sb.from('depots').select('id, nom').order('nom')
if (eDep) throw eDep

for (const depot of depots) {
  const [boissons, mvts, casses, ajusts] = await Promise.all([
    fetchAll(sb.from('boissons').select('id, nom, emoji, bouteilles_par_casier, prix_achat, seuil_alerte, actif')
      .eq('depot_id', depot.id).eq('actif', true)),
    fetchAll(sb.from('mouvements').select('boisson_id, type, quantite_bouteilles')
      .eq('depot_id', depot.id).eq('statut', 'valide').lte('created_at', cutoff)),
    fetchAll(sb.from('casses').select('boisson_id, quantite')
      .eq('depot_id', depot.id).eq('statut', 'valide').lte('created_at', cutoff)),
    fetchAll(sb.from('ajustements_stock').select('boisson_id, delta')
      .eq('depot_id', depot.id).lte('created_at', cutoff)),
  ])

  console.log(`\n=== Dépôt : ${depot.nom} — stock au ${dateArg} 23:59 ===`)
  if (!boissons?.length) { console.log('  (aucune boisson active)'); continue }

  let valeurTotale = 0
  const lignes = boissons.map((b) => {
    const entrees = (mvts || []).filter((m) => m.boisson_id === b.id && m.type === 'entree')
      .reduce((s, m) => s + (m.quantite_bouteilles || 0), 0)
    const sorties = (mvts || []).filter((m) => m.boisson_id === b.id && m.type === 'sortie')
      .reduce((s, m) => s + (m.quantite_bouteilles || 0), 0)
    const totalCasses = (casses || []).filter((c) => c.boisson_id === b.id)
      .reduce((s, c) => s + (c.quantite || 0), 0)
    const totalAjust = (ajusts || []).filter((a) => a.boisson_id === b.id)
      .reduce((s, a) => s + (a.delta || 0), 0)
    const stock = entrees - sorties - totalCasses + totalAjust
    const bpc = b.bouteilles_par_casier || 12
    const cs = Math.floor(Math.max(0, stock) / bpc)
    const reste = Math.max(0, stock) % bpc
    const valeur = Math.max(0, stock) * ((Number(b.prix_achat) || 0) / bpc)
    valeurTotale += valeur
    return { nom: b.nom, emoji: b.emoji, stock, cs, reste, valeur, enRupture: stock <= (b.seuil_alerte ?? 5) }
  }).sort((a, b) => a.stock - b.stock)

  for (const l of lignes) {
    const alerte = l.enRupture ? '⚠️ ' : ''
    console.log(`  ${alerte}${l.emoji || ''} ${l.nom} : ${l.cs} cs${l.reste ? ` + ${l.reste}` : ''} (${l.stock} bouteilles) — ${fmtFCFA(l.valeur)}`)
  }
  console.log(`  --- Valeur totale du stock : ${fmtFCFA(valeurTotale)}`)
}
