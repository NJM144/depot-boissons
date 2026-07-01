import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

// Version de l'app lue depuis package.json → injectée pour la mise à jour auto
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

// Configuration Vite
// base: './' est OBLIGATOIRE pour que les chemins fonctionnent dans le WebView Capacitor (APK)
export default defineConfig({
  plugins: [react()],
  base: './',
  define: {
    // Version installée, comparée à la dernière release GitHub (updateCheck.js)
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    outDir: 'dist',
    // On garde un seul bundle simple, plus fiable sur les WebView de téléphones bas de gamme
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      input: {
        // App complète (gérant / patron / actionnaire) — embarquée dans l'APK
        main: 'index.html',
        // Portail web dédié actionnaire (lien internet à partager aux actionnaires)
        actionnaire: 'actionnaire.html',
      },
    },
  },
})
