import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Configuration Vite
// base: './' est OBLIGATOIRE pour que les chemins fonctionnent dans le WebView Capacitor (APK)
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    // On garde un seul bundle simple, plus fiable sur les WebView de téléphones bas de gamme
    chunkSizeWarningLimit: 1500,
  },
})
