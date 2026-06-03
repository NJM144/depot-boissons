/** @type {import('tailwindcss').Config} */
// Configuration TailwindCSS
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      // Couleurs sémantiques de l'application
      colors: {
        entree: '#16a34a', // VERT = entrée (reçu) dans le dépôt
        sortie: '#dc2626', // ROUGE = sortie (vendu) hors du dépôt
        valider: '#16a34a',
        annuler: '#dc2626',
      },
      // Tailles minimales pour des boutons tactiles très grands (profil analphabète)
      minHeight: {
        bouton: '80px',
      },
      minWidth: {
        bouton: '80px',
      },
      fontSize: {
        geant: ['3rem', { lineHeight: '1' }],
      },
    },
  },
  plugins: [],
}
