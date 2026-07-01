// ============================================================================
//  CLIENTS — PROFIL PROPRIÉTAIRE
// ----------------------------------------------------------------------------
//  Liste des clients réguliers (ajoutés par le gérant à la voix + photo) avec
//  leur total d'achats sur une plage de dates, + le total des ventes « de
//  passage » (one-shot). Le patron peut renommer / corriger / supprimer un client.
// ============================================================================

import { useCallback, useEffect, useState } from 'react'
import * as Cloud from '../../supabase/api.js'
import { formaterFCFA } from '../../utils/argent.js'

function ymd(d) { return d.toISOString().slice(0, 10) }
function debutDeMois() { const t = new Date(); return ymd(new Date(t.getFullYear(), t.getMonth(), 1)) }

function PhotoClient({ client, taille = 44 }) {
  if (client?.photo) {
    return <img src={client.photo} alt="" style={{ width: taille, height: taille }} className="rounded-full object-cover" />
  }
  const ini = (client?.nom || '?').trim().charAt(0).toUpperCase() || '?'
  return (
    <div style={{ width: taille, height: taille }}
      className="rounded-full bg-indigo-200 text-indigo-800 font-black flex items-center justify-center shrink-0">
      <span style={{ fontSize: taille * 0.42 }}>{ini}</span>
    </div>
  )
}

export default function ClientsPatron({ depotId }) {
  const [debut, setDebut] = useState(debutDeMois())
  const [fin, setFin] = useState(ymd(new Date()))
  const [data, setData] = useState(null)
  const [edit, setEdit] = useState(null) // client en édition

  const charger = useCallback(async () => {
    const d = await Cloud.getVentesParClient(depotId, debut, fin)
    setData(d)
  }, [depotId, debut, fin])

  useEffect(() => { charger() }, [charger])

  if (!data) return <div className="p-6 text-center text-slate-500">Chargement…</div>
  const clients = data.clients || []
  const passage = data.passage || { total: 0, nb_ventes: 0 }
  const nonAttr = data.non_attribue || { total: 0, nb_ventes: 0 }
  const totalClients = clients.reduce((s, c) => s + Number(c.total || 0), 0)
  const creditTotal = Number(data.credit_total || 0)

  return (
    <div className="h-full overflow-y-auto no-scrollbar bg-slate-100 p-3 pb-20">
      {/* Plage de dates */}
      <div className="bg-white rounded-xl p-3 mb-3 shadow-sm flex items-center gap-2 text-sm">
        <span className="font-semibold text-slate-600">📅</span>
        <input type="date" value={debut} max={fin} onChange={(e) => setDebut(e.target.value)} className="border rounded-lg px-2 py-1 flex-1" />
        <span className="text-slate-400">→</span>
        <input type="date" value={fin} min={debut} max={ymd(new Date())} onChange={(e) => setFin(e.target.value)} className="border rounded-lg px-2 py-1 flex-1" />
      </div>

      {/* Synthèse */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <Carte titre="Clients" valeur={clients.length} couleur="bg-indigo-600" />
        <Carte titre="Achats clients" valeur={formaterFCFA(totalClients)} couleur="bg-emerald-500" />
        <Carte titre="Passage" valeur={formaterFCFA(passage.total)} couleur="bg-slate-500" />
      </div>
      {creditTotal > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 mb-3 flex items-center justify-between">
          <span className="font-semibold text-orange-800">📋 Crédit total dû (tous clients)</span>
          <b className="text-orange-700 text-lg">{formaterFCFA(creditTotal)}</b>
        </div>
      )}

      {/* Liste des clients (triés par total d'achats — fait côté RPC) */}
      <div className="bg-white rounded-xl p-2 shadow-sm">
        <h3 className="font-bold text-slate-700 px-1 py-1">👥 Clients réguliers</h3>
        {clients.length === 0 && <p className="text-slate-400 text-sm text-center py-4">Aucun client. Le gérant peut en ajouter à la voix.</p>}
        {clients.map((c) => (
          <button key={c.id} onClick={() => setEdit(c)}
            className="w-full text-left flex items-center gap-3 p-2 border-b last:border-0 active:bg-slate-50">
            <PhotoClient client={c} />
            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate">{c.nom || '— (sans nom)'}</p>
              <p className="text-xs text-slate-500">
                {c.nb_ventes} vente{c.nb_ventes > 1 ? 's' : ''}
                {c.telephone ? ` · ${c.telephone}` : ''}
              </p>
              {Number(c.credit_du) > 0 && (
                <p className="text-xs font-bold text-orange-600">📋 doit {formaterFCFA(c.credit_du)}</p>
              )}
            </div>
            <div className="text-right shrink-0">
              <p className="font-black text-emerald-700">{formaterFCFA(c.total)}</p>
            </div>
            <span className="text-slate-300">✏️</span>
          </button>
        ))}
      </div>

      {/* Passage + non attribué */}
      <div className="bg-white rounded-xl p-3 shadow-sm mt-3 text-sm space-y-1">
        <div className="flex justify-between">
          <span className="text-slate-600">🚶 Ventes de passage ({passage.nb_ventes})</span>
          <b>{formaterFCFA(passage.total)}</b>
        </div>
        {Number(nonAttr.total) > 0 && (
          <div className="flex justify-between text-slate-400">
            <span>Sans client ({nonAttr.nb_ventes})</span>
            <b>{formaterFCFA(nonAttr.total)}</b>
          </div>
        )}
      </div>

      {edit && (
        <ModalClient client={edit} depotId={depotId}
          onFerme={() => setEdit(null)}
          onRefresh={charger}
          onSauve={() => { setEdit(null); charger() }} />
      )}
    </div>
  )
}

function Carte({ titre, valeur, couleur }) {
  return (
    <div className={`${couleur} text-white rounded-xl p-2`}>
      <p className="text-[11px] opacity-90 leading-tight">{titre}</p>
      <p className="font-black text-lg leading-tight">{valeur}</p>
    </div>
  )
}

// ----- Modale d'édition d'un client (renommer / tél / crédit / supprimer) ---
function ModalClient({ client, depotId, onFerme, onSauve, onRefresh }) {
  const [nom, setNom] = useState(client.nom || '')
  const [telephone, setTelephone] = useState(client.telephone || '')
  const [credits, setCredits] = useState(null)   // ventes à crédit non réglées
  const [err, setErr] = useState(null)
  const [enCours, setEnCours] = useState(false)

  const chargerCredits = useCallback(() => {
    Cloud.getCreditsClient(client.id).then(setCredits).catch(() => setCredits([]))
  }, [client.id])
  useEffect(() => { chargerCredits() }, [chargerCredits])

  const dette = (credits || []).reduce((s, c) => s + Number(c.montant || 0), 0)

  const sauver = async () => {
    setErr(null); setEnCours(true)
    try {
      await Cloud.modifierClient(client.id, { nom, telephone })
      onSauve()
    } catch (e) { setErr(e.message || 'Erreur'); setEnCours(false) }
  }
  const supprimer = async () => {
    if (!confirm(`Supprimer le client ${client.nom || ''} ? (son historique de ventes est conservé)`)) return
    setEnCours(true)
    try { await Cloud.supprimerClient(client.id); onSauve() }
    catch (e) { setErr(e.message || 'Erreur'); setEnCours(false) }
  }
  const encaisserTout = async () => {
    if (!confirm(`Encaisser tout le crédit de ${client.nom || 'ce client'} (${formaterFCFA(dette)}) ?`)) return
    setEnCours(true)
    try { await Cloud.encaisserCreditClient(depotId, client.id); chargerCredits(); onRefresh?.() }
    catch (e) { setErr(e.message || 'Erreur') }
    finally { setEnCours(false) }
  }
  const encaisserUne = async (id) => {
    setEnCours(true)
    try { await Cloud.encaisserCreditVente(id); chargerCredits(); onRefresh?.() }
    catch (e) { setErr(e.message || 'Erreur') }
    finally { setEnCours(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end z-50">
      <div className="bg-white w-full rounded-t-3xl p-4 max-h-[92%] overflow-y-auto no-scrollbar">
        <div className="flex items-center gap-3 mb-3">
          <PhotoClient client={client} taille={56} />
          <h3 className="text-lg font-bold">{client.nom || 'Client'}</h3>
        </div>

        {/* Crédit dû */}
        {dette > 0 && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 mb-3">
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-orange-800">📋 Crédit dû : {formaterFCFA(dette)}</span>
              <button onClick={encaisserTout} disabled={enCours}
                className="bg-emerald-600 text-white rounded-lg px-3 py-2 text-sm font-bold active:bg-emerald-700">
                ✓ Encaisser tout
              </button>
            </div>
            {(credits || []).map((c) => (
              <div key={c.id} className="flex items-center justify-between border-t border-orange-100 py-1.5 text-xs">
                <span className="text-slate-600">
                  {new Date(c.date).toLocaleDateString('fr-FR')} · {c.emoji} {c.boisson} ×{c.quantite}
                </span>
                <span className="flex items-center gap-2">
                  <b className="text-orange-700">{formaterFCFA(c.montant)}</b>
                  <button onClick={() => encaisserUne(c.id)} disabled={enCours}
                    className="bg-emerald-100 text-emerald-700 rounded px-2 py-0.5 font-semibold">payé</button>
                </span>
              </div>
            ))}
          </div>
        )}

        <label className="block text-sm font-semibold mb-1">Nom</label>
        <input value={nom} onChange={(e) => setNom(e.target.value)} className="border rounded-lg p-2 w-full mb-3" placeholder="Nom du client" />

        <label className="block text-sm font-semibold mb-1">Téléphone (facultatif)</label>
        <input inputMode="tel" value={telephone} onChange={(e) => setTelephone(e.target.value)} className="border rounded-lg p-2 w-full mb-3" placeholder="Ex : 07 00 00 00 00" />

        {err && <p className="text-red-600 font-semibold mb-2 text-sm">{err}</p>}

        <div className="flex gap-2">
          <button onClick={supprimer} disabled={enCours} className="bg-red-100 text-red-600 rounded-lg px-4 py-3 font-semibold">🗑️</button>
          <button onClick={onFerme} className="flex-1 bg-slate-200 rounded-lg py-3 font-semibold">Fermer</button>
          <button onClick={sauver} disabled={enCours} className="flex-1 bg-emerald-600 text-white rounded-lg py-3 font-semibold">💾 Enregistrer</button>
        </div>
      </div>
    </div>
  )
}
