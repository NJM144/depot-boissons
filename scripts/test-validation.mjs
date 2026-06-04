// Test bout-en-bout du circuit de VALIDATION (nettoyage ciblé par id)
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const SB = env.VITE_SUPABASE_URL
const gerant = createClient(SB, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
const proprio = createClient(SB, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
const admin = createClient(SB, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const ok = (c, m) => console.log(`${c ? '✅' : '❌'} ${m}`)

const { data: g } = await gerant.auth.signInWithPassword({ email: 'gerant@depot.ci', password: 'gerant1234' })
const { data: cat } = await gerant.from('v_boissons_gerant').select('*')
const b = cat[0]
const depot = b.depot_id

// Le gérant saisit : vente A (1000 / 3u), vente B (1000 / 2u), réception (5u)
await gerant.from('mouvements').insert({ depot_id: depot, boisson_id: b.id, type: 'sortie', quantite: 3, montant_total: 1000, gerant_id: g.user.id })
await gerant.from('mouvements').insert({ depot_id: depot, boisson_id: b.id, type: 'sortie', quantite: 2, montant_total: 1000, gerant_id: g.user.id })
await gerant.from('mouvements').insert({ depot_id: depot, boisson_id: b.id, type: 'entree', quantite: 5, gerant_id: g.user.id })

await proprio.auth.signInWithPassword({ email: 'patron@depot.ci', password: 'patron1234' })

// 1) Tant qu'en attente : le point ne compte RIEN
let { data: p0 } = await proprio.rpc('get_point', { p_depot_id: depot, p_periode: 'jour' })
ok(Number(p0.chiffre_affaires) === 0, `En attente -> CA = ${p0.chiffre_affaires} (doit être 0)`)

// 2) La file de validation contient bien les 3 saisies
const { data: attente } = await proprio.from('mouvements').select('*').eq('statut', 'en_attente').order('created_at')
ok(attente.length === 3, `File d'attente : ${attente.length} saisies (attendu 3)`)
const venteA = attente.find((m) => m.type === 'sortie' && Number(m.montant_total) === 1000 && m.quantite === 3)
const venteB = attente.find((m) => m.type === 'sortie' && m.quantite === 2)
const reception = attente.find((m) => m.type === 'entree')
const ids = attente.map((m) => m.id)

// 3) Valider A SANS correction -> montant exact 1000 (PAS 999.99)
await proprio.from('mouvements').update({ statut: 'valide' }).eq('id', venteA.id)
const { data: aApres } = await admin.from('mouvements').select('montant_total, marge').eq('id', venteA.id).single()
ok(Number(aApres.montant_total) === 1000, `Vente A validée : montant_total = ${aApres.montant_total} (exact, pas d'arrondi)`)

// 4) Valider B AVEC correction du montant -> 1500
await proprio.from('mouvements').update({ statut: 'valide', montant_total: 1500 }).eq('id', venteB.id)
const { data: bApres } = await admin.from('mouvements').select('montant_total').eq('id', venteB.id).single()
ok(Number(bApres.montant_total) === 1500, `Vente B corrigée+validée : montant_total = ${bApres.montant_total}`)

// 5) Rejeter la réception
await proprio.from('mouvements').update({ statut: 'rejete' }).eq('id', reception.id)

// 6) Le point compte maintenant SEULEMENT le validé : 1000 + 1500 = 2500
let { data: p1 } = await proprio.rpc('get_point', { p_depot_id: depot, p_periode: 'jour' })
ok(Number(p1.chiffre_affaires) === 2500, `Après validation -> CA = ${p1.chiffre_affaires} (attendu 2500)`)

// 7) Le stock n'a PAS bougé pour la réception rejetée
const { data: stock } = await proprio.from('v_stock').select('total_entrees').eq('boisson_id', b.id).single()
ok(Number(stock?.total_entrees || 0) === 0, `Réception rejetée -> entrées en stock = ${stock?.total_entrees || 0} (doit être 0)`)

// Nettoyage CIBLÉ (uniquement mes lignes de test)
await admin.from('mouvements').delete().in('id', ids)
console.log('\n(uniquement les 3 lignes de test supprimées)')
