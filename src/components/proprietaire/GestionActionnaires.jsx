// ============================================================================
//  GESTION DES ACTIONNAIRES — PROFIL PROPRIÉTAIRE
// ----------------------------------------------------------------------------
//  - Fonds de commerce (valeur totale → sert au calcul des parts)
//  - Actionnaires : nom, apport, code personnel ; part = apport / fonds
//  - Charges propres à chaque actionnaire (par mois)
//  - Bénéfice net (mois) = part × marge_nette_du_commerce − ses charges
// ============================================================================

import { useCallback, useEffect, useState } from 'react'
import * as Cloud from '../../supabase/api.js'
import { formaterFCFA } from '../../utils/argent.js'

function moisCourant() {
  const t = new Date()
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`
}

export default function GestionActionnaires({ depotId }) {
  const [mois, setMois] = useState(moisCourant())
  const [data, setData] = useState(null)
  const [fond, setFond] = useState('')
  const [edition, setEdition] = useState(null)   // actionnaire en édition (modal)
  const [chargesDe, setChargesDe] = useState(null) // actionnaire dont on gère les charges
  const [chargesDepotOuvert, setChargesDepotOuvert] = useState(false) // modal charges réelles du dépôt
  const [amortissementsOuvert, setAmortissementsOuvert] = useState(false) // modal amortissements (tricycle...)

  const charger = useCallback(async () => {
    const d = await Cloud.getBeneficesActionnaires(depotId, mois + '-01')
    setData(d)
    setFond(String(d.fond_de_commerce ?? 0))
  }, [depotId, mois])

  useEffect(() => { charger() }, [charger])

  const enregistrerFond = async () => {
    await Cloud.setFondCommerce(depotId, fond)
    charger()
  }

  if (!data) return <div className="p-6 text-center text-slate-500">Chargement…</div>
  const acts = data.actionnaires || []

  return (
    <div className="h-full overflow-y-auto no-scrollbar bg-slate-100 p-3 pb-20">
      {/* Mois + fonds de commerce */}
      <div className="bg-white rounded-xl p-3 mb-3 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold text-slate-700">🏛️ Fonds de commerce</h3>
          <input type="month" value={mois} max={moisCourant()} onChange={(e) => setMois(e.target.value)}
            className="border rounded-lg px-2 py-1 text-sm" />
        </div>
        <div className="flex gap-2">
          <input type="number" value={fond} onChange={(e) => setFond(e.target.value)}
            className="border rounded-lg p-2 flex-1" placeholder="Valeur totale (FCFA)" />
          <button onClick={enregistrerFond} className="bg-indigo-600 text-white rounded-lg px-4 font-semibold">💾</button>
        </div>
      </div>

      {/* Synthèse du mois */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <Carte titre="Marge à partager (parts)" valeur={data.marge_commerce} couleur="bg-emerald-500" />
        <Carte titre="Part actionnaires" valeur={`${data.part_actionnaires_pct} %`} couleur="bg-purple-600" brut />
      </div>
      {Number(data.marge_reservee) > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3 text-sm">
          <span className="font-semibold text-amber-800">💼 Bénéfices réservés (hors partage) : {formaterFCFA(data.marge_reservee)}</span>
          <p className="text-xs text-amber-700 mt-0.5">Marge de produits attribuée en direct à un seul actionnaire. Marge totale du commerce : {formaterFCFA(data.marge_totale)}.</p>
        </div>
      )}

      {/* Charges réelles du dépôt (loyer, salaire, courant/eau, divers...) */}
      <div className="bg-white rounded-xl p-3 mb-3 shadow-sm flex items-center justify-between">
        <div>
          <h3 className="font-bold text-slate-700">🧾 Charges réelles du dépôt</h3>
          <p className="text-xs text-slate-500">Total {mois.slice(0, 7)} : <b>{formaterFCFA(data.charges_depot_total)}</b></p>
        </div>
        <button onClick={() => setChargesDepotOuvert(true)} className="bg-amber-600 text-white rounded-lg px-3 py-1.5 text-sm font-semibold">✏️ Gérer</button>
      </div>

      {/* Amortissements (épargne quotidienne déclarée par le gérant, ex : tricycle) */}
      <div className="bg-white rounded-xl p-3 mb-3 shadow-sm flex items-center justify-between">
        <div>
          <h3 className="font-bold text-slate-700">🔧 Amortissements</h3>
          <p className="text-xs text-slate-500">Versements quotidiens déclarés par le gérant (ex : tricycle)</p>
        </div>
        <button onClick={() => setAmortissementsOuvert(true)} className="bg-indigo-600 text-white rounded-lg px-3 py-1.5 text-sm font-semibold">✏️ Gérer</button>
      </div>

      {/* Liste des actionnaires */}
      <div className="bg-white rounded-xl p-3 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold text-slate-700">👥 Actionnaires ({acts.length})</h3>
          <button onClick={() => setEdition({ nom: '', apport: '', code: '' })}
            className="bg-emerald-600 text-white rounded-lg px-3 py-1.5 text-sm font-semibold">➕ Ajouter</button>
        </div>

        {acts.length === 0 && <p className="text-slate-400 text-sm py-4 text-center">Aucun actionnaire.</p>}

        {acts.map((a) => (
          <div key={a.id} className="border-b last:border-0 py-2">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="font-semibold truncate">
                  {a.nom} {!a.actif && <span className="text-xs text-red-500">(inactif)</span>}
                  {a.charge_residuelle && <span className="text-xs text-amber-700 bg-amber-100 rounded px-1 ml-1">🏠 supporte le reste des charges</span>}
                </p>
                <p className="text-xs text-slate-500">
                  Apport {formaterFCFA(a.apport)} · part <b>{a.part_pct}%</b> · code <span className="font-mono bg-slate-100 px-1 rounded">{a.code}</span>
                </p>
              </div>
              <div className="flex gap-1 shrink-0">
                {!a.charge_residuelle && (
                  <button onClick={() => setChargesDe(a)} className="bg-amber-100 text-amber-700 rounded-lg px-2 py-1 text-sm">💸</button>
                )}
                <button onClick={() => setEdition(a)} className="bg-slate-200 rounded-lg px-2 py-1 text-sm">✏️</button>
                <button onClick={async () => { if (confirm(`Supprimer ${a.nom} ?`)) { await Cloud.supprimerActionnaire(a.id); charger() } }}
                  className="bg-red-100 text-red-600 rounded-lg px-2 py-1 text-sm">🗑️</button>
              </div>
            </div>
            {/* Détail bénéfice du mois */}
            <div className="grid grid-cols-3 gap-1 mt-1 text-center text-xs">
              <div className="bg-slate-50 rounded p-1">Brut<br /><b>{formaterFCFA(a.benefice_brut)}</b></div>
              <div className="bg-slate-50 rounded p-1">Charges<br /><b className="text-amber-600">{formaterFCFA(a.charges)}</b>{a.charge_residuelle && <span className="block text-[10px] text-slate-400">reste réel</span>}</div>
              <div className="bg-slate-50 rounded p-1">Net<br /><b className={a.benefice_net < 0 ? 'text-red-600' : 'text-emerald-600'}>{formaterFCFA(a.benefice_net)}</b></div>
            </div>
            {Number(a.benefice_reserve) > 0 && (
              <p className="text-xs text-amber-700 mt-1">
                💼 dont réservé : <b>{formaterFCFA(a.benefice_reserve)}</b>
                {(a.produits_reserves || []).length > 0 && <span className="text-amber-600"> ({a.produits_reserves.join(', ')})</span>}
              </p>
            )}
          </div>
        ))}
      </div>

      {edition && (
        <ModalActionnaire depotId={depotId} actionnaire={edition}
          onFerme={() => setEdition(null)} onSauve={() => { setEdition(null); charger() }} />
      )}
      {chargesDe && (
        <ModalCharges depotId={depotId} actionnaire={chargesDe} mois={mois + '-01'}
          onFerme={() => { setChargesDe(null); charger() }} />
      )}
      {chargesDepotOuvert && (
        <ModalChargesDepot depotId={depotId} mois={mois + '-01'}
          onFerme={() => { setChargesDepotOuvert(false); charger() }} />
      )}
      {amortissementsOuvert && (
        <ModalAmortissements depotId={depotId}
          onFerme={() => { setAmortissementsOuvert(false); charger() }} />
      )}
    </div>
  )
}

function Carte({ titre, valeur, couleur, brut }) {
  return (
    <div className={`${couleur} text-white rounded-xl p-3`}>
      <p className="text-xs opacity-90">{titre}</p>
      <p className="font-black text-xl leading-tight">{brut ? valeur : formaterFCFA(valeur)}</p>
    </div>
  )
}

// ----- Modal ajout/édition actionnaire -----
function ModalActionnaire({ depotId, actionnaire, onFerme, onSauve }) {
  const [nom, setNom] = useState(actionnaire.nom || '')
  const [apport, setApport] = useState(String(actionnaire.apport ?? ''))
  const [code, setCode] = useState(actionnaire.code || '')
  const [actif, setActif] = useState(actionnaire.actif ?? true)
  const [chargeResiduelle, setChargeResiduelle] = useState(actionnaire.charge_residuelle ?? false)
  const [err, setErr] = useState(null)
  const estNouveau = !actionnaire.id

  const sauver = async () => {
    if (!nom.trim()) return setErr('Le nom est obligatoire.')
    if (!/^\d{3,8}$/.test(String(code).trim())) return setErr('Le code doit faire 3 à 8 chiffres.')
    try {
      if (estNouveau) await Cloud.ajouterActionnaire(depotId, { nom, apport, code })
      else await Cloud.modifierActionnaire(actionnaire.id, { nom, apport, code, actif, chargeResiduelle })
      onSauve()
    } catch (e) {
      setErr(e.message?.includes('duplicate') || e.code === '23505' ? 'Ce code est déjà utilisé.' : (e.message || 'Erreur'))
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end z-50">
      <div className="bg-white w-full rounded-t-3xl p-4">
        <h3 className="text-lg font-bold mb-3">{estNouveau ? '➕ Nouvel actionnaire' : '✏️ Modifier'}</h3>
        <label className="block text-sm font-semibold mb-1">Nom</label>
        <input value={nom} onChange={(e) => setNom(e.target.value)} className="border rounded-lg p-2 w-full mb-3" placeholder="Ex : Koffi" />
        <label className="block text-sm font-semibold mb-1">Apport (FCFA)</label>
        <input type="number" value={apport} onChange={(e) => setApport(e.target.value)} className="border rounded-lg p-2 w-full mb-3" />
        <label className="block text-sm font-semibold mb-1">Code personnel (chiffres)</label>
        <input inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="border rounded-lg p-2 w-full mb-3 font-mono" placeholder="Ex : 4521" />
        {!estNouveau && (
          <label className="flex items-center gap-2 mb-3 text-sm">
            <input type="checkbox" checked={actif} onChange={(e) => setActif(e.target.checked)} /> Actif (peut consulter son compte)
          </label>
        )}
        <label className="flex items-start gap-2 mb-3 text-sm bg-amber-50 border border-amber-200 rounded-lg p-2">
          <input type="checkbox" className="mt-0.5" checked={chargeResiduelle} onChange={(e) => setChargeResiduelle(e.target.checked)} />
          <span>🏠 Supporte le reste des charges réelles du dépôt (loyer, salaire, courant/eau, divers…) — sa charge n'est plus saisie manuellement, elle est calculée automatiquement : charges du dépôt − charges des autres actionnaires. Un seul actionnaire devrait avoir cette case cochée.</span>
        </label>
        {err && <p className="text-red-600 font-semibold mb-2 text-sm">{err}</p>}
        <div className="flex gap-3">
          <button onClick={onFerme} className="flex-1 bg-slate-200 rounded-lg py-3 font-semibold">Annuler</button>
          <button onClick={sauver} className="flex-1 bg-emerald-600 text-white rounded-lg py-3 font-semibold">💾 Enregistrer</button>
        </div>
      </div>
    </div>
  )
}

// ----- Modal charges d'un actionnaire pour le mois -----
//  Formulaire d'ajout EN HAUT (au-dessus du clavier Android), liste en dessous.
function ModalCharges({ depotId, actionnaire, mois, onFerme }) {
  const [charges, setCharges] = useState([])
  const [libelle, setLibelle] = useState('')
  const [montant, setMontant] = useState('')
  const [err, setErr] = useState(null)
  const [enCours, setEnCours] = useState(false)

  const recharger = useCallback(
    () =>
      Cloud.listerCharges(actionnaire.id, mois)
        .then(setCharges)
        .catch((e) => {
          console.error('listerCharges', e)
          setErr('Lecture des charges impossible : ' + (e.message || e.code || 'erreur'))
        }),
    [actionnaire.id, mois],
  )
  useEffect(() => { recharger() }, [recharger])

  const ajouter = async () => {
    setErr(null)
    if (!libelle.trim()) return setErr('Écris un libellé (ex : transport).')
    // Tolère les espaces et la virgule décimale (clavier FR/Android)
    const montantNum = Number(String(montant).replace(/\s/g, '').replace(',', '.'))
    if (!(montantNum > 0)) return setErr('Entre un montant valide.')
    setEnCours(true)
    try {
      await Cloud.ajouterCharge(depotId, actionnaire.id, { libelle: libelle.trim(), montant: montantNum, mois })
      setLibelle(''); setMontant('')
      await recharger()
    } catch (e) {
      console.error('ajouterCharge', e)
      setErr(e.message || e.hint || e.code || 'Erreur lors de l’ajout.')
    } finally {
      setEnCours(false)
    }
  }
  const total = charges.reduce((s, c) => s + Number(c.montant), 0)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end z-50">
      <div className="bg-white w-full rounded-t-3xl p-4 max-h-[90%] overflow-y-auto no-scrollbar">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-bold">💸 Charges — {actionnaire.nom}</h3>
          <button onClick={onFerme} className="bg-slate-200 rounded-lg px-3 py-1 text-sm font-semibold">Fermer ✕</button>
        </div>
        <p className="text-xs text-slate-500 mb-3">Mois {mois.slice(0, 7)} · déduites de son bénéfice</p>

        {/* FORMULAIRE D'AJOUT — en haut pour rester visible au-dessus du clavier */}
        <div className="bg-slate-50 rounded-xl p-3 mb-3">
          <label className="block text-xs font-semibold mb-1">Libellé</label>
          <input value={libelle} onChange={(e) => setLibelle(e.target.value)}
            className="border rounded-lg p-2 w-full mb-2" placeholder="Ex : transport, salaire…" />
          <label className="block text-xs font-semibold mb-1">Montant (FCFA)</label>
          <input type="number" inputMode="numeric" value={montant} onChange={(e) => setMontant(e.target.value)}
            className="border rounded-lg p-2 w-full mb-2" placeholder="Ex : 5000" />
          {err && <p className="text-red-600 text-sm font-semibold mb-2">{err}</p>}
          <button onClick={ajouter} disabled={enCours}
            className="w-full bg-emerald-600 active:bg-emerald-700 disabled:opacity-50 text-white rounded-lg py-3 font-bold">
            {enCours ? 'Ajout…' : '➕ Ajouter la charge'}
          </button>
        </div>

        {/* LISTE des charges du mois */}
        {charges.map((c) => (
          <div key={c.id} className="flex items-center justify-between border-b py-2 text-sm">
            <span>{c.libelle}</span>
            <span className="flex items-center gap-2">
              <b>{formaterFCFA(c.montant)}</b>
              <button onClick={async () => { await Cloud.supprimerCharge(c.id); recharger() }} className="text-red-500 text-lg">🗑️</button>
            </span>
          </div>
        ))}
        {charges.length === 0 && <p className="text-slate-400 text-sm py-2 text-center">Aucune charge ce mois.</p>}
        <p className="text-right font-bold mt-2">Total : {formaterFCFA(total)}</p>
      </div>
    </div>
  )
}

// ----- Modal charges RÉELLES DU DÉPÔT pour le mois (loyer, salaire, courant/eau, divers...) -----
function ModalChargesDepot({ depotId, mois, onFerme }) {
  const [charges, setCharges] = useState([])
  const [libelle, setLibelle] = useState('')
  const [montant, setMontant] = useState('')
  const [err, setErr] = useState(null)
  const [enCours, setEnCours] = useState(false)

  const recharger = useCallback(
    () =>
      Cloud.listerChargesDepot(depotId, mois)
        .then(setCharges)
        .catch((e) => {
          console.error('listerChargesDepot', e)
          setErr('Lecture des charges impossible : ' + (e.message || e.code || 'erreur'))
        }),
    [depotId, mois],
  )
  useEffect(() => { recharger() }, [recharger])

  const ajouter = async () => {
    setErr(null)
    if (!libelle.trim()) return setErr('Écris un libellé (ex : loyer, salaire…).')
    const montantNum = Number(String(montant).replace(/\s/g, '').replace(',', '.'))
    if (!(montantNum > 0)) return setErr('Entre un montant valide.')
    setEnCours(true)
    try {
      await Cloud.ajouterChargeDepot(depotId, { libelle: libelle.trim(), montant: montantNum, mois })
      setLibelle(''); setMontant('')
      await recharger()
    } catch (e) {
      console.error('ajouterChargeDepot', e)
      setErr(e.message || e.hint || e.code || 'Erreur lors de l’ajout.')
    } finally {
      setEnCours(false)
    }
  }
  const total = charges.reduce((s, c) => s + Number(c.montant), 0)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end z-50">
      <div className="bg-white w-full rounded-t-3xl p-4 max-h-[90%] overflow-y-auto no-scrollbar">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-bold">🧾 Charges réelles du dépôt</h3>
          <button onClick={onFerme} className="bg-slate-200 rounded-lg px-3 py-1 text-sm font-semibold">Fermer ✕</button>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          Mois {mois.slice(0, 7)} · loyer, salaire employé, courant/eau, divers… L'actionnaire marqué « supporte le reste des charges » absorbe ce total moins les charges des autres actionnaires.
        </p>

        <div className="bg-slate-50 rounded-xl p-3 mb-3">
          <label className="block text-xs font-semibold mb-1">Libellé</label>
          <input value={libelle} onChange={(e) => setLibelle(e.target.value)}
            className="border rounded-lg p-2 w-full mb-2" placeholder="Ex : loyer, salaire, courant/eau, divers…" />
          <label className="block text-xs font-semibold mb-1">Montant (FCFA)</label>
          <input type="number" inputMode="numeric" value={montant} onChange={(e) => setMontant(e.target.value)}
            className="border rounded-lg p-2 w-full mb-2" placeholder="Ex : 75000" />
          {err && <p className="text-red-600 text-sm font-semibold mb-2">{err}</p>}
          <button onClick={ajouter} disabled={enCours}
            className="w-full bg-amber-600 active:bg-amber-700 disabled:opacity-50 text-white rounded-lg py-3 font-bold">
            {enCours ? 'Ajout…' : '➕ Ajouter la charge'}
          </button>
        </div>

        {charges.map((c) => (
          <div key={c.id} className="flex items-center justify-between border-b py-2 text-sm">
            <span>{c.libelle}</span>
            <span className="flex items-center gap-2">
              <b>{formaterFCFA(c.montant)}</b>
              <button onClick={async () => { await Cloud.supprimerChargeDepot(c.id); recharger() }} className="text-red-500 text-lg">🗑️</button>
            </span>
          </div>
        ))}
        {charges.length === 0 && <p className="text-slate-400 text-sm py-2 text-center">Aucune charge ce mois.</p>}
        <p className="text-right font-bold mt-2">Total : {formaterFCFA(total)}</p>
      </div>
    </div>
  )
}

// ----- Modal AMORTISSEMENTS (lignes d'épargne quotidienne, ex : tricycle) -----
//  Le gérant déclare le versement du jour depuis son écran ; ici le patron
//  définit/active/désactive les lignes (libellé + montant/jour suggéré).
function ModalAmortissements({ depotId, onFerme }) {
  const [lignes, setLignes] = useState(null)
  const [libelle, setLibelle] = useState('')
  const [montantJour, setMontantJour] = useState('')
  const [dateDebut, setDateDebut] = useState(() => new Date().toISOString().slice(0, 10))
  const [err, setErr] = useState(null)
  const [enCours, setEnCours] = useState(false)

  const recharger = useCallback(
    () =>
      Cloud.listerAmortissements(depotId)
        .then(setLignes)
        .catch((e) => {
          console.error('listerAmortissements', e)
          setErr('Lecture des amortissements impossible : ' + (e.message || e.code || 'erreur'))
        }),
    [depotId],
  )
  useEffect(() => { recharger() }, [recharger])

  const ajouter = async () => {
    setErr(null)
    if (!libelle.trim()) return setErr('Écris un libellé (ex : tricycle).')
    const montantNum = Number(String(montantJour).replace(/\s/g, '').replace(',', '.'))
    if (!(montantNum > 0)) return setErr('Entre un montant/jour valide.')
    setEnCours(true)
    try {
      await Cloud.ajouterAmortissement(depotId, { libelle: libelle.trim(), montantJour: montantNum, dateDebut })
      setLibelle(''); setMontantJour('')
      await recharger()
    } catch (e) {
      console.error('ajouterAmortissement', e)
      setErr(e.message || e.hint || e.code || 'Erreur lors de l’ajout.')
    } finally {
      setEnCours(false)
    }
  }

  const basculerActif = async (l) => {
    try {
      await Cloud.modifierAmortissement(l.id, { actif: !l.actif })
      recharger()
    } catch (e) {
      console.error('modifierAmortissement', e)
      setErr(e.message || 'Erreur')
    }
  }

  const supprimer = async (l) => {
    if (!confirm(`Supprimer « ${l.libelle} » ?`)) return
    try {
      await Cloud.supprimerAmortissement(l.id)
      recharger()
    } catch (e) {
      console.error('supprimerAmortissement', e)
      setErr(e.message || 'Erreur')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end z-50">
      <div className="bg-white w-full rounded-t-3xl p-4 max-h-[90%] overflow-y-auto no-scrollbar">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-bold">🔧 Amortissements</h3>
          <button onClick={onFerme} className="bg-slate-200 rounded-lg px-3 py-1 text-sm font-semibold">Fermer ✕</button>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          Seule la ligne ACTIVE la plus ancienne est proposée au gérant sur son écran de déclaration. Désactive une ligne (au lieu de la supprimer) pour garder son historique de versements.
        </p>

        <div className="bg-slate-50 rounded-xl p-3 mb-3">
          <label className="block text-xs font-semibold mb-1">Libellé</label>
          <input value={libelle} onChange={(e) => setLibelle(e.target.value)}
            className="border rounded-lg p-2 w-full mb-2" placeholder="Ex : tricycle" />
          <label className="block text-xs font-semibold mb-1">Montant / jour (FCFA)</label>
          <input type="number" inputMode="numeric" value={montantJour} onChange={(e) => setMontantJour(e.target.value)}
            className="border rounded-lg p-2 w-full mb-2" placeholder="Ex : 5000" />
          <label className="block text-xs font-semibold mb-1">Date de début</label>
          <input type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)}
            className="border rounded-lg p-2 w-full mb-2" />
          {err && <p className="text-red-600 text-sm font-semibold mb-2">{err}</p>}
          <button onClick={ajouter} disabled={enCours}
            className="w-full bg-indigo-600 active:bg-indigo-700 disabled:opacity-50 text-white rounded-lg py-3 font-bold">
            {enCours ? 'Ajout…' : '➕ Ajouter la ligne'}
          </button>
        </div>

        {lignes === null && <p className="text-slate-400 text-sm py-2 text-center">Chargement…</p>}
        {lignes?.map((l) => (
          <div key={l.id} className="flex items-center justify-between border-b py-2 text-sm gap-2">
            <div className="min-w-0">
              <p className="font-semibold truncate">
                {l.libelle} {!l.actif && <span className="text-xs text-slate-400">(inactif)</span>}
              </p>
              <p className="text-xs text-slate-500">{formaterFCFA(l.montant_jour)} / jour · depuis le {l.date_debut}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => basculerActif(l)}
                className={`rounded-lg px-2 py-1 text-xs font-semibold ${l.actif ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                {l.actif ? 'Désactiver' : 'Activer'}
              </button>
              <button onClick={() => supprimer(l)} className="text-red-500 text-lg">🗑️</button>
            </div>
          </div>
        ))}
        {lignes?.length === 0 && <p className="text-slate-400 text-sm py-2 text-center">Aucun amortissement configuré.</p>}
      </div>
    </div>
  )
}

