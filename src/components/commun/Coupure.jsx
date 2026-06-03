// ============================================================================
//  COMPOSANT Coupure — BILLET OU PIÈCE XOF (FCFA) DESSINÉ EN SVG RÉALISTE
// ----------------------------------------------------------------------------
//  Illustrations stylisées des coupures de la BCEAO (Afrique de l'Ouest) :
//   - Billets : dégradé aux VRAIES couleurs (violet/vert/bleu/brun/olive),
//     médaillon, bande de sécurité, motif guilloché, mentions « BCEAO » /
//     « FRANCS CFA ».
//   - Pièces  : rendu métallique (or, argent, acier) et bimétallique pour les
//     grosses valeurs (500/250/200), avec cannelures sur la tranche.
//  NB : ce sont des ILLUSTRATIONS (pas des reproductions des vrais billets,
//  dont la reproduction est réglementée par la BCEAO).
// ============================================================================

// Palettes métalliques pour les pièces
const METAUX = {
  or: { clair: '#f4e4a0', base: '#d4af37', fonce: '#a67c1a' },
  argent: { clair: '#f1f5f9', base: '#cbd5e1', fonce: '#94a3b8' },
  acier: { clair: '#cbd5e1', base: '#94a3b8', fonce: '#64748b' },
}

// Petites cannelures (traits) tout autour de la tranche d'une pièce
function Cannelures({ r = 47, cx = 50, cy = 50, n = 60 }) {
  const traits = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const x1 = cx + Math.cos(a) * r
    const y1 = cy + Math.sin(a) * r
    const x2 = cx + Math.cos(a) * (r - 3)
    const y2 = cy + Math.sin(a) * (r - 3)
    traits.push(<line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#0003" strokeWidth="0.8" />)
  }
  return <g>{traits}</g>
}

// ----------------------------------------------------------------------------
//  PIÈCE
// ----------------------------------------------------------------------------
function Piece({ coupure, d }) {
  const { label, metal = 'or' } = coupure
  const bimetal = metal.startsWith('bimetal')

  // Couleur de l'anneau et du cœur
  const anneau = metal === 'bimetal-argent' ? METAUX.argent : metal === 'bimetal-or' ? METAUX.or : METAUX[metal] || METAUX.or
  const coeur = metal === 'bimetal-argent' ? METAUX.or : METAUX.argent

  const idA = `m-anneau-${coupure.valeur}`
  const idC = `m-coeur-${coupure.valeur}`

  return (
    <svg width={d} height={d} viewBox="0 0 100 100" aria-hidden>
      <defs>
        {/* Reflet métallique de l'anneau (dégradé radial décalé) */}
        <radialGradient id={idA} cx="38%" cy="34%" r="75%">
          <stop offset="0%" stopColor={anneau.clair} />
          <stop offset="55%" stopColor={anneau.base} />
          <stop offset="100%" stopColor={anneau.fonce} />
        </radialGradient>
        <radialGradient id={idC} cx="40%" cy="36%" r="75%">
          <stop offset="0%" stopColor={coeur.clair} />
          <stop offset="60%" stopColor={coeur.base} />
          <stop offset="100%" stopColor={coeur.fonce} />
        </radialGradient>
      </defs>

      {/* Disque principal (anneau) */}
      <circle cx="50" cy="50" r="48" fill={`url(#${idA})`} stroke="#0006" strokeWidth="1.5" />
      <Cannelures />

      {/* Cœur bimétallique le cas échéant */}
      {bimetal && (
        <circle cx="50" cy="50" r="30" fill={`url(#${idC})`} stroke="#0004" strokeWidth="1.2" />
      )}

      {/* Liseré décoratif intérieur */}
      <circle cx="50" cy="50" r={bimetal ? 30 : 40} fill="none" stroke="#fff6" strokeWidth="1" />

      {/* Valeur */}
      <text
        x="50"
        y={label.length > 2 ? 57 : 60}
        textAnchor="middle"
        fontSize={label.length > 2 ? 26 : 34}
        fontWeight="900"
        fill="#3f3f46"
      >
        {label}
      </text>
      {/* Mention F (franc) */}
      <text x="50" y="74" textAnchor="middle" fontSize="11" fontWeight="700" fill="#52525b">
        FCFA
      </text>
    </svg>
  )
}

// ----------------------------------------------------------------------------
//  BILLET
// ----------------------------------------------------------------------------
function Billet({ coupure, w, h }) {
  const { couleur, couleur2, label } = coupure
  const idG = `b-grad-${coupure.valeur}`

  return (
    <svg width={w} height={h} viewBox="0 0 150 80" aria-hidden>
      <defs>
        {/* Dégradé diagonal aux couleurs réelles du billet */}
        <linearGradient id={idG} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={couleur2} />
          <stop offset="55%" stopColor={couleur} />
          <stop offset="100%" stopColor={couleur} />
        </linearGradient>
      </defs>

      {/* Fond du billet */}
      <rect x="1.5" y="1.5" width="147" height="77" rx="9" fill={`url(#${idG})`} stroke="#0007" strokeWidth="2" />

      {/* Motif guilloché (ellipses concentriques translucides) */}
      <g opacity="0.18" stroke="#fff" fill="none" strokeWidth="1">
        <ellipse cx="75" cy="40" rx="62" ry="26" />
        <ellipse cx="75" cy="40" rx="50" ry="18" />
        <ellipse cx="75" cy="40" rx="38" ry="11" />
      </g>

      {/* Cadre intérieur */}
      <rect x="8" y="8" width="134" height="64" rx="6" fill="none" stroke="#fff8" strokeWidth="1.5" />

      {/* Médaillon (emblème stylisé) à gauche */}
      <circle cx="33" cy="40" r="17" fill="#ffffff22" stroke="#fff9" strokeWidth="1.5" />
      <text x="33" y="45" textAnchor="middle" fontSize="14" fill="#fff" fontWeight="900">★</text>

      {/* Bande de sécurité verticale */}
      <rect x="112" y="6" width="7" height="68" rx="3" fill="#ffffff40" />

      {/* Mention banque (haut) */}
      <text x="55" y="20" fontSize="8" fill="#ffffffdd" fontWeight="700" letterSpacing="0.5">
        BCEAO
      </text>

      {/* Valeur principale */}
      <text x="92" y="52" textAnchor="middle" fontSize="30" fontWeight="900" fill="#fff">
        {label}
      </text>

      {/* Mention monnaie (bas) */}
      <text x="92" y="68" textAnchor="middle" fontSize="9" fill="#ffffffdd" fontWeight="700" letterSpacing="0.5">
        FRANCS CFA
      </text>
    </svg>
  )
}

// ----------------------------------------------------------------------------
//  COMPOSANT EXPORTÉ
// ----------------------------------------------------------------------------
export default function Coupure({ coupure, taille = 'normal' }) {
  const grand = taille === 'grand'

  if (coupure.type === 'piece') {
    return <Piece coupure={coupure} d={grand ? 96 : 64} />
  }
  return <Billet coupure={coupure} w={grand ? 150 : 112} h={grand ? 80 : 60} />
}
