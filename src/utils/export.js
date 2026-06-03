// ============================================================================
//  EXPORT DES DONNÉES — CSV & PDF (impression)
// ----------------------------------------------------------------------------
//  - CSV : génère un fichier téléchargeable (séparateur ';' compatible Excel FR)
//  - PDF : ouvre la boîte d'impression du système (l'utilisateur choisit
//          "Enregistrer au format PDF"). Sans librairie lourde.
// ============================================================================

// Déclenche le téléchargement d'un contenu texte
function telecharger(nomFichier, contenu, mime) {
  const blob = new Blob(['﻿' + contenu], { type: mime }) // BOM pour accents Excel
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomFichier
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// Échappe une valeur pour le CSV
function csvVal(v) {
  const s = String(v ?? '')
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// Exporte une liste de mouvements (enrichis du nom de boisson) en CSV
export function exporterCSV(lignes) {
  const entetes = ['Date', 'Heure', 'Boisson', 'Type', 'Quantité', 'Montant (FCFA)']
  const corps = lignes.map((l) =>
    [
      l.dateJour,
      new Date(l.timestamp).toLocaleTimeString('fr-FR'),
      l.nomBoisson,
      l.type === 'entree' ? 'Entrée' : 'Sortie',
      l.quantite,
      l.montant,
    ]
      .map(csvVal)
      .join(';')
  )
  const contenu = [entetes.join(';'), ...corps].join('\n')
  telecharger(`mouvements_${Date.now()}.csv`, contenu, 'text/csv;charset=utf-8')
}

// Exporte en PDF via la fenêtre d'impression (génère un HTML propre)
export function exporterPDF(lignes, titre = 'Historique des mouvements') {
  const total = lignes
    .filter((l) => l.type === 'sortie')
    .reduce((s, l) => s + l.montant, 0)

  const rangs = lignes
    .map(
      (l) => `<tr>
        <td>${l.dateJour}</td>
        <td>${new Date(l.timestamp).toLocaleTimeString('fr-FR')}</td>
        <td>${l.nomBoisson}</td>
        <td style="color:${l.type === 'entree' ? '#16a34a' : '#dc2626'}">
          ${l.type === 'entree' ? 'Entrée' : 'Sortie'}</td>
        <td style="text-align:right">${l.quantite}</td>
        <td style="text-align:right">${l.montant.toLocaleString('fr-FR')}</td>
      </tr>`
    )
    .join('')

  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
    <title>${titre}</title>
    <style>
      body{font-family:system-ui,sans-serif;padding:24px;color:#0f172a}
      h1{font-size:20px}
      table{width:100%;border-collapse:collapse;font-size:13px;margin-top:12px}
      th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:left}
      th{background:#f1f5f9}
      .total{margin-top:16px;font-size:16px;font-weight:bold;text-align:right}
    </style></head><body>
    <h1>🍹 ${titre}</h1>
    <p>Édité le ${new Date().toLocaleString('fr-FR')} — ${lignes.length} mouvement(s)</p>
    <table>
      <thead><tr>
        <th>Date</th><th>Heure</th><th>Boisson</th><th>Type</th>
        <th style="text-align:right">Qté</th><th style="text-align:right">Montant</th>
      </tr></thead>
      <tbody>${rangs}</tbody>
    </table>
    <p class="total">Chiffre d'affaires (ventes) : ${total.toLocaleString('fr-FR')} FCFA</p>
    </body></html>`

  const w = window.open('', '_blank')
  if (!w) {
    alert("Autorisez les fenêtres pop-up pour générer le PDF.")
    return
  }
  w.document.write(html)
  w.document.close()
  w.focus()
  // Laisse le temps au rendu avant d'ouvrir l'impression
  setTimeout(() => w.print(), 400)
}
