// Preuve : que stocke-t-on quand le gérant saisit une VENTE et une RÉCEPTION ?
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const anon = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// Connexion gérant
const { data: g } = await anon.auth.signInWithPassword({ email: 'gerant@depot.ci', password: 'gerant1234' })
const { data: cat } = await anon.from('v_boissons_gerant').select('*')
const biere = cat.find((b) => b.nom === 'Bière') || cat[0]

// 1) VENTE : le gérant compose 1500 FCFA pour 2 unités → l'app envoie prix_unitaire = 1500/2 = 750
await anon.from('mouvements').insert({
  depot_id: biere.depot_id, boisson_id: biere.id, type: 'sortie',
  quantite: 2, prix_unitaire: 1500 / 2, gerant_id: g.user.id,
})

// 2) RÉCEPTION : le gérant reçoit 10 unités (montant composé ignoré par l'app pour une entrée)
await anon.from('mouvements').insert({
  depot_id: biere.depot_id, boisson_id: biere.id, type: 'entree',
  quantite: 10, prix_unitaire: null, gerant_id: g.user.id,
})

// Lecture de ce qui est STOCKÉ (vue admin, toutes colonnes)
const { data } = await admin.from('mouvements').select('type, quantite, prix_unitaire, montant_total, marge').order('created_at')
console.log('CE QUI EST STOCKÉ EN BASE :')
for (const m of data) console.log(JSON.stringify(m))

// Nettoyage
await admin.from('mouvements').delete().neq('id', '00000000-0000-0000-0000-000000000000')
console.log('\n(données de test supprimées)')
