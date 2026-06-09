// Test complet : unités (casier/bouteille) + validation patron + stock
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const SB = env.VITE_SUPABASE_URL
const anon = () => createClient(SB, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
const admin = createClient(SB, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const ok = (c, m) => console.log(`${c ? '✅' : '❌'} ${m}`)

// Boisson de test + ses paramètres réels (on ne modifie PAS le catalogue)
const { data: b } = await admin.from('boissons').select('*').eq('actif', true).limit(1).single()
const bpc = b.bouteilles_par_casier
console.log(`Boisson test : ${b.nom} | ${bpc} bouteilles/casier | achat ${b.prix_achat} vente ${b.prix_vente} (par bouteille)`)

// IDs existants AVANT (pour un nettoyage ciblé)
const idsAvantM = new Set((await admin.from('mouvements').select('id')).data.map((x) => x.id))
const idsAvantC = new Set((await admin.from('casses').select('id')).data.map((x) => x.id))

// ----- GÉRANT : vend 2 CASIERS, reçoit 1 CASIER, casse 3 BOUTEILLES -----
const g = anon()
const { data: gA } = await g.auth.signInWithPassword({ email: 'gerant@depot.ci', password: 'gerant1234' })
const depot = b.depot_id
const montantVente = 5000
await g.from('mouvements').insert({ depot_id: depot, boisson_id: b.id, type: 'sortie', quantite: 2, unite: 'casier', montant_total: montantVente, gerant_id: gA.user.id })
await g.from('mouvements').insert({ depot_id: depot, boisson_id: b.id, type: 'entree', quantite: 1, unite: 'casier', gerant_id: gA.user.id })
await g.from('casses').insert({ depot_id: depot, boisson_id: b.id, quantite: 3, gerant_id: gA.user.id })

// ----- PATRON : tout est en attente, puis valide -----
const p = anon()
await p.auth.signInWithPassword({ email: 'patron@depot.ci', password: 'patron1234' })

let pt = (await p.rpc('get_point', { p_depot_id: depot, p_periode: 'jour' })).data
ok(Number(pt.chiffre_affaires) === 0, `Avant validation : CA = ${pt.chiffre_affaires} (doit être 0)`)

const enAttente = (await p.from('mouvements').select('*').eq('statut', 'en_attente')).data
const vente = enAttente.find((m) => m.type === 'sortie')
const recep = enAttente.find((m) => m.type === 'entree')
ok(vente.quantite_bouteilles === 2 * bpc, `Vente 2 casiers → quantite_bouteilles = ${vente.quantite_bouteilles} (attendu ${2 * bpc})`)
ok(recep.quantite_bouteilles === bpc, `Réception 1 casier → quantite_bouteilles = ${recep.quantite_bouteilles} (attendu ${bpc})`)

// Le patron valide la vente (sans correction), la réception, et la casse
await p.from('mouvements').update({ statut: 'valide' }).eq('id', vente.id)
await p.from('mouvements').update({ statut: 'valide' }).eq('id', recep.id)
const casse = (await p.from('casses').select('*').eq('statut', 'en_attente')).data[0]
await p.from('casses').update({ statut: 'valide' }).eq('id', casse.id)

// Vérifs après validation
const { data: vApres } = await admin.from('mouvements').select('marge').eq('id', vente.id).single()
ok(Number(vApres.marge) === montantVente - b.prix_achat * 2 * bpc,
  `Marge vente = ${vApres.marge} (attendu ${montantVente - b.prix_achat * 2 * bpc})`)

pt = (await p.rpc('get_point', { p_depot_id: depot, p_periode: 'jour' })).data
ok(Number(pt.chiffre_affaires) === montantVente, `Après validation : CA = ${pt.chiffre_affaires} (attendu ${montantVente})`)

const stock = (await p.from('v_stock').select('*').eq('boisson_id', b.id).single()).data
ok(stock.total_entrees === bpc && stock.total_sorties === 2 * bpc && stock.total_casses === 3,
  `Stock (bouteilles) : entrées=${stock.total_entrees}, sorties=${stock.total_sorties}, casses=${stock.total_casses}`)
ok(stock.stock === bpc - 2 * bpc - 3, `Stock final = ${stock.stock} bouteilles (attendu ${bpc - 2 * bpc - 3})`)

// ----- Nettoyage CIBLÉ (uniquement les lignes créées par ce test) -----
const newM = (await admin.from('mouvements').select('id')).data.filter((x) => !idsAvantM.has(x.id)).map((x) => x.id)
const newC = (await admin.from('casses').select('id')).data.filter((x) => !idsAvantC.has(x.id)).map((x) => x.id)
if (newM.length) await admin.from('mouvements').delete().in('id', newM)
if (newC.length) await admin.from('casses').delete().in('id', newC)
console.log(`\n(nettoyé : ${newM.length} mouvements + ${newC.length} casse de test)`)
