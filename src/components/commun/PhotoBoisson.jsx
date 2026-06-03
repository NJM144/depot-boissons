// ============================================================================
//  COMPOSANT PhotoBoisson — AFFICHE LA PHOTO OU L'EMOJI D'UNE BOISSON
// ----------------------------------------------------------------------------
//  Si la boisson a une vraie photo (dataURL), on l'affiche. Sinon, on dessine
//  un casier coloré (couleurCasier) avec l'emoji au centre (placeholder).
// ============================================================================

export default function PhotoBoisson({ boisson, taille = 96 }) {
  if (!boisson) return null

  // Vraie photo fournie par le propriétaire
  if (boisson.photo) {
    return (
      <img
        src={boisson.photo}
        alt=""
        style={{ width: taille, height: taille }}
        className="object-cover rounded-xl"
      />
    )
  }

  // Placeholder : casier coloré + emoji
  return (
    <div
      style={{
        width: taille,
        height: taille,
        backgroundColor: boisson.couleurCasier || '#3b82f6',
      }}
      className="rounded-xl flex items-center justify-center shadow-inner"
    >
      <span style={{ fontSize: taille * 0.55 }}>{boisson.emoji || '🥤'}</span>
    </div>
  )
}
