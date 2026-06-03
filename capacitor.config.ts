import type { CapacitorConfig } from '@capacitor/cli'

// Configuration Capacitor pour l'empaquetage Android (APK)
const config: CapacitorConfig = {
  appId: 'org.ham.depotboissons',
  appName: 'Dépôt Boissons',
  webDir: 'dist', // dossier généré par `npm run build`
  android: {
    allowMixedContent: true,
  },
  plugins: {
    // Splash screen optionnel : démarrage immédiat
    SplashScreen: {
      launchShowDuration: 600,
      backgroundColor: '#0f172a',
    },
  },
}

export default config
