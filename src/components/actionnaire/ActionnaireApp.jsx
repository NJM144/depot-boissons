// ============================================================================
//  ESPACE ACTIONNAIRE — consultation du compte (authentifié par CODE)
// ----------------------------------------------------------------------------
//  L'actionnaire choisit un mois et voit : sa part, le bénéfice brut
//  (part × marge nette du commerce), ses charges, et son bénéfice net.
//  Aucune donnée des autres actionnaires n'est exposée.
// ============================================================================

import { useCallback, useEffect, useState } from 'react'
import * as Cloud from '../../supabase/api.js'
import { formaterFCFA } from '../../utils/argent.js'

function moisCourant() {
  const t = new Date()
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`
}

export default function ActionnaireApp({ code, onQuitter }) {
  const [mois, setMois] = useState(moisCourant())
  const [compte, setCompte] = useState(null)
  const [erreur, setErreur] = useState(null)

  const charger = useCallback(async () => {
    try {
      const d = await Cloud.getCompteActionnaire(code, mois + '-01')
      if (!d?.trouve) { setErreur('Compte introuvable.'); return }
      setErreur(null); setCompte(d)
    } catch (e) {
      setErreur(e.message || 'Erreur de chargement')
    }
  }, [code, mois])

  useEffect(() => { charger() }, [charger])

  return (
    <div className="h-full flex flex-col bg-slate-100">
      <div className="bg-amber-600 text-white px-4 py-3 flex items-center justify-between">
        <h1 className="font-bold text-lg">💼 {compte?.nom ? `Bonjour ${compte.nom}` : 'Espace Actionnaire'}</h1>
        <button onClick={onQuitter} className="bg-amber-700 rounded-lg px-3 py-1 text-sm">🚪 Quitter</button>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar p-3 pb-6">
        {/* Sélecteur de mois */}
        <div className="bg-white rounded-xl p-3 mb-3 shadow-sm flex items-center justify-between">
          <span className="font-semibold text-slate-700">📅 Mois</span>
          <input type="month" value={mois} max={moisCourant()} onChange={(e) => setMois(e.target.value)}
            className="border rounded-lg px-2 py-1" />
        </div>

        {erreur && <p className="text-red-600 font-semibold text-center py-4">{erreur}</p>}

        {compte && !erreur && (
          <>
            {/* Bénéfice net — la carte principale */}
            <div className="bg-purple-600 text-white rounded-2xl p-5 mb-3 text-center shadow">
              <p className="opacity-90">Votre bénéfice net du mois</p>
              <p className={`text-4xl font-black mt-1 ${compte.benefice_net < 0 ? 'text-red-200' : ''}`}>
                {formaterFCFA(compte.benefice_net)}
              </p>
            </div>

            {/* Détail du calcul */}
            <div className="bg-white rounded-xl p-4 shadow-sm space-y-2 text-sm">
              <Ligne label="Votre apport" valeur={formaterFCFA(compte.apport)} />
              <Ligne label="Fonds de commerce" valeur={formaterFCFA(compte.fond_de_commerce)} />
              <Ligne label="Votre part" valeur={`${compte.part_pct} %`} fort />
              <div className="border-t my-1" />
              <Ligne label="Marge nette du commerce" valeur={formaterFCFA(compte.marge_commerce)} />
              <Ligne label={`Bénéfice brut (${compte.part_pct}%)`} valeur={formaterFCFA(compte.benefice_brut)} />
              <Ligne label="− Vos charges" valeur={formaterFCFA(compte.charges)} couleur="text-amber-600" />
              <div className="border-t my-1" />
              <Ligne label="= Bénéfice net" valeur={formaterFCFA(compte.benefice_net)}
                fort couleur={compte.benefice_net < 0 ? 'text-red-600' : 'text-emerald-600'} />
            </div>

            {/* Détail des charges */}
            {(compte.charges_detail || []).length > 0 && (
              <div className="bg-white rounded-xl p-4 shadow-sm mt-3">
                <h3 className="font-bold text-slate-700 mb-2">💸 Vos charges du mois</h3>
                {compte.charges_detail.map((c, i) => (
                  <div key={i} className="flex justify-between border-b last:border-0 py-1.5 text-sm">
                    <span>{c.libelle}</span><b>{formaterFCFA(c.montant)}</b>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function Ligne({ label, valeur, fort, couleur }) {
  return (
    <div className="flex justify-between items-center">
      <span className={`${fort ? 'font-bold text-slate-800' : 'text-slate-600'}`}>{label}</span>
      <span className={`${fort ? 'font-black' : 'font-semibold'} ${couleur || 'text-slate-800'}`}>{valeur}</span>
    </div>
  )
}
