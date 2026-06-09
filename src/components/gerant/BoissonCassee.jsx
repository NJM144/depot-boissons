// ============================================================================
//  BOISSON CASSÉE — PROFIL GÉRANT (saisie des pertes)
// ----------------------------------------------------------------------------
//  Flux 100% visuel : sélection de la boisson par image → UNITÉ (bouteille ou
//  casier) → quantité cassée (compteur +/−) → récap. Le coût s'affiche de façon
//  DISCRÈTE (le gérant n'a pas accès au vrai prix d'achat ; montant indicatif).
//  Validation vocale, puis enregistrement dans la table `casses`.
// ============================================================================

import { useState } from 'react'
import { useVoix } from '../../hooks/useVoix.js'
import { useFeedback } from '../../hooks/useFeedback.js'
import { formaterFCFA } from '../../utils/argent.js'
import SelectionBoissons from './SelectionBoissons.jsx'
import CompteurQuantite from './CompteurQuantite.jsx'
import PhotoBoisson from '../commun/PhotoBoisson.jsx'

export default function BoissonCassee({ boissons, adapter, onTermine }) {
  const { parler } = useVoix()
  const { clic, succes, erreur } = useFeedback()

  const [etape, setEtape] = useState('selection') // selection | unite | quantite | recap
  const [boisson, setBoisson] = useState(null)
  const [unite, setUnite] = useState('bouteille') // 'bouteille' | 'casier'
  const [quantite, setQuantite] = useState(1)

  const bpc = boisson?.bouteillesParCasier || 12
  // Nombre de bouteilles réellement cassées (pour le coût et le stock)
  const nbBouteilles = unite === 'casier' ? quantite * bpc : quantite

  // Coût indicatif (le vrai prix d'achat reste invisible au gérant)
  const coutIndicatif = (boisson?.prixReference || 0) * nbBouteilles

  const choisir = (b) => {
    setBoisson(b)
    setUnite('bouteille')
    setQuantite(1)
    setEtape('unite')
  }

  const choisirUnite = (u) => {
    clic()
    parler(u === 'casier' ? 'Casier' : 'Bouteille')
    setUnite(u)
    setEtape('quantite')
  }

  const valider = async () => {
    // On transmet l'unité ; le serveur convertit en bouteilles (le local reste en démo)
    await adapter.ajouterCasse({ boissonId: boisson.id, quantite, unite })
    succes()
    const mot = unite === 'casier'
      ? (quantite > 1 ? 'casiers' : 'casier')
      : (quantite > 1 ? 'bouteilles' : 'bouteille')
    parler(`Cassé, ${boisson.nom}, ${quantite} ${mot}`)
    setTimeout(onTermine, 400)
  }

  const annuler = () => {
    erreur()
    parler('Annulé')
    onTermine()
  }

  return (
    <div className="h-full flex flex-col bg-amber-950">
      {/* Bandeau "CASSÉ" (verre brisé) */}
      <div className="bg-amber-700 flex items-center justify-center gap-3 py-3">
        <span className="text-5xl">🥃💥</span>
        <span className="text-white text-3xl font-black">CASSÉ</span>
      </div>

      <div className="flex-1 min-h-0">
        {/* 1) Choix de la boisson cassée */}
        {etape === 'selection' && (
          <SelectionBoissons boissons={boissons} onSelection={choisir} />
        )}

        {/* 2) Unité cassée : BOUTEILLE ou CASIER */}
        {etape === 'unite' && (
          <div className="h-full grid grid-rows-2 gap-4 p-4">
            <button
              onClick={() => choisirUnite('bouteille')}
              className="btn-tactile bg-sky-700 active:brightness-90 text-white gap-2"
            >
              <span className="text-8xl">🍾</span>
              <span className="text-4xl font-black">BOUTEILLE</span>
            </button>
            <button
              onClick={() => choisirUnite('casier')}
              className="btn-tactile bg-orange-700 active:brightness-90 text-white gap-2"
            >
              <span className="text-8xl">📦</span>
              <span className="text-4xl font-black">CASIER</span>
              <span className="text-xl opacity-90">= {bpc} 🍾</span>
            </button>
          </div>
        )}

        {/* 3) Quantité cassée */}
        {etape === 'quantite' && (
          <div className="h-full flex flex-col">
            <div className="flex-1 min-h-0">
              <CompteurQuantite
                boisson={boisson}
                type="casse"
                quantite={quantite}
                unite={unite}
                bouteillesParCasier={bpc}
                onChange={setQuantite}
              />
            </div>
            <div className="p-3">
              <button
                onClick={() => {
                  clic()
                  setEtape('recap')
                }}
                className="btn-tactile bg-amber-600 active:bg-amber-700 text-white w-full h-20 text-4xl flex-row gap-3"
              >
                ➡️ ✓
              </button>
            </div>
          </div>
        )}

        {/* 4) Récapitulatif + validation */}
        {etape === 'recap' && (
          <div className="h-full flex flex-col p-3 gap-3">
            <div className="flex-1 flex flex-col items-center justify-center gap-4">
              <PhotoBoisson boisson={boisson} taille={120} />
              <div className="flex items-center gap-3">
                <span className="text-white text-7xl font-black">×{quantite}</span>
                <span className="text-5xl">{unite === 'casier' ? '📦' : '🍾'}</span>
              </div>
              {/* Équivalent en bouteilles si casier */}
              {unite === 'casier' && (
                <div className="bg-amber-900/60 rounded-full px-4 py-1 text-amber-100 text-lg font-bold">
                  📦 {quantite} × {bpc} = {nbBouteilles} 🍾
                </div>
              )}
              <span className="text-amber-200 text-lg font-bold">
                {nbBouteilles} {nbBouteilles > 1 ? 'bouteilles' : 'bouteille'} cassée{nbBouteilles > 1 ? 's' : ''}
              </span>
              {/* Coût DISCRET (petit, grisé) */}
              <span className="text-amber-300/70 text-sm">≈ {formaterFCFA(coutIndicatif)}</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={annuler}
                className="btn-tactile bg-annuler active:brightness-90 text-white h-28 text-8xl"
              >
                ✗
              </button>
              <button
                onClick={valider}
                className="btn-tactile bg-valider active:brightness-90 text-white h-28 text-8xl"
              >
                ✓
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
