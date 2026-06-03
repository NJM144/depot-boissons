// ============================================================================
//  TABLEAU DE BORD — PROFIL PROPRIÉTAIRE
// ----------------------------------------------------------------------------
//  Vue d'ensemble : chiffre d'affaires (jour / semaine / mois), courbe des
//  ventes, top des boissons vendues, et stock actuel avec alertes de rupture.
// ============================================================================

import { useEffect, useState } from 'react'
import * as DB from '../../db/database.js'
import { formaterFCFA } from '../../utils/argent.js'
import { CourbeVentes, BarresTop } from '../commun/Graphiques.jsx'
import PhotoBoisson from '../commun/PhotoBoisson.jsx'

// Renvoie la date (AAAA-MM-JJ) d'il y a `n` jours
function ilYa(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return DB.dateJourCourant(d)
}

export default function TableauBord() {
  const [stats, setStats] = useState(null)

  useEffect(() => {
    ;(async () => {
      const aujourdHui = DB.dateJourCourant()
      const debutSemaine = ilYa(6) // 7 derniers jours
      const debutMois = ilYa(29) // 30 derniers jours

      const [caJour, caSemaine, caMois, courbe, top, stocks] = await Promise.all([
        DB.chiffreAffaires({ dateDebut: aujourdHui, dateFin: aujourdHui }),
        DB.chiffreAffaires({ dateDebut: debutSemaine }),
        DB.chiffreAffaires({ dateDebut: debutMois }),
        DB.ventesParJour({ dateDebut: debutMois }),
        DB.topBoissons({ dateDebut: debutMois, limite: 5 }),
        DB.calculerStocks(),
      ])

      setStats({ caJour, caSemaine, caMois, courbe, top, stocks })
    })()
  }, [])

  if (!stats) {
    return <div className="p-6 text-center text-slate-500">Chargement…</div>
  }

  const enRupture = stats.stocks.filter((s) => s.actif !== false && s.enRupture)

  return (
    <div className="h-full overflow-y-auto no-scrollbar bg-slate-100 p-3 pb-20">
      {/* ---- CARTES CHIFFRE D'AFFAIRES ---- */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <CarteCA titre="Jour" valeur={stats.caJour} couleur="bg-emerald-500" />
        <CarteCA titre="Semaine" valeur={stats.caSemaine} couleur="bg-indigo-500" />
        <CarteCA titre="Mois" valeur={stats.caMois} couleur="bg-purple-500" />
      </div>

      {/* ---- ALERTES DE RUPTURE ---- */}
      {enRupture.length > 0 && (
        <div className="bg-red-100 border-2 border-red-400 rounded-xl p-3 mb-3">
          <p className="font-bold text-red-700 mb-1">⚠️ Stock faible / rupture</p>
          <div className="flex flex-wrap gap-2">
            {enRupture.map((b) => (
              <span key={b.id} className="bg-white rounded-lg px-2 py-1 text-sm font-semibold text-red-700">
                {b.emoji} {b.nom} : {b.stock}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ---- COURBE DES VENTES ---- */}
      <Bloc titre="📈 Ventes (30 derniers jours)">
        <CourbeVentes data={stats.courbe} />
      </Bloc>

      {/* ---- TOP BOISSONS ---- */}
      <Bloc titre="🏆 Top boissons vendues">
        <BarresTop data={stats.top} />
      </Bloc>

      {/* ---- STOCK ACTUEL ---- */}
      <Bloc titre="📦 Stock actuel">
        <div className="flex flex-col gap-2">
          {stats.stocks
            .filter((s) => s.actif !== false)
            .map((s) => (
              <div
                key={s.id}
                className={`flex items-center gap-3 rounded-lg p-2 ${
                  s.enRupture ? 'bg-red-50' : 'bg-slate-50'
                }`}
              >
                <PhotoBoisson boisson={s} taille={40} />
                <span className="flex-1 font-semibold">{s.nom}</span>
                <span
                  className={`text-2xl font-black ${
                    s.enRupture ? 'text-red-600' : 'text-slate-800'
                  }`}
                >
                  {s.stock}
                </span>
                {s.enRupture && <span className="text-xl">⚠️</span>}
              </div>
            ))}
        </div>
      </Bloc>
    </div>
  )
}

// Carte de chiffre d'affaires
function CarteCA({ titre, valeur, couleur }) {
  return (
    <div className={`${couleur} text-white rounded-xl p-2 text-center`}>
      <p className="text-xs opacity-90">{titre}</p>
      <p className="text-lg font-black leading-tight">{formaterFCFA(valeur)}</p>
    </div>
  )
}

// Bloc de section avec titre
function Bloc({ titre, children }) {
  return (
    <div className="bg-white rounded-xl p-3 mb-3 shadow-sm">
      <h3 className="font-bold text-slate-700 mb-2">{titre}</h3>
      {children}
    </div>
  )
}
