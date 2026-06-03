# ☁️ Mode Supabase — Backend, temps réel & notifications push

Ce guide active le **MODE SUPABASE** : authentification, base partagée, RLS,
temps réel et notifications push à chaque vente. Sans configuration `.env`,
l'app reste en **MODE LOCAL** (Dexie + PIN, hors-ligne).

---

## 1. Créer le projet & appliquer le SQL

1. Créer un projet sur [supabase.com](https://supabase.com).
2. Dans **SQL Editor**, exécuter **dans l'ordre** les fichiers de `supabase/migrations/` :
   ```
   0001_tables.sql
   0002_functions_triggers.sql
   0003_views_rpc.sql
   0004_rls_policies.sql
   0005_realtime.sql
   ```
3. Récupérer dans **Settings → API** :
   - `Project URL` → `VITE_SUPABASE_URL`
   - `anon public` → `VITE_SUPABASE_ANON_KEY`
   - `service_role` → `SUPABASE_SERVICE_ROLE_KEY` (scripts admin uniquement)
4. Copier `.env.example` en `.env` et renseigner ces valeurs.

---

## 2. Créer les comptes (gérant + propriétaire)

Méthode automatique (recommandée) :
```bash
node scripts/creer-comptes.mjs
```
Cela crée un propriétaire, un dépôt, un gérant lié à ce dépôt, et un catalogue
de démo. Identifiants par défaut affichés en fin de script (à personnaliser dans
le fichier).

> Le trigger `handle_new_user` crée automatiquement la ligne `profiles`
> (role + depot_id) à partir des métadonnées d'inscription.

**Architecture des rôles & RLS :**
- **Gérant** : ne voit que SON dépôt ; lit le catalogue/stock via les vues
  `v_boissons_gerant` / `v_stock_gerant` → **jamais** `prix_achat` ni `marge`.
  Peut insérer mouvements et casses uniquement.
- **Propriétaire** : lecture/écriture complètes (marges, prix, stats) sur ses
  dépôts uniquement.

---

## 3. Notifications push (FCM)

### 3.1 Firebase
1. Créer un projet sur [console.firebase.google.com](https://console.firebase.google.com).
2. Ajouter une app **Android** avec le package `org.ham.depotboissons`.
3. Télécharger **`google-services.json`** → le placer dans `android/app/`.
4. **Project Settings → Service accounts → Generate new private key** :
   récupérer `project_id`, `client_email`, `private_key`.

### 3.2 Secrets de l'Edge Function
```bash
npx supabase secrets set FCM_PROJECT_ID="votre-projet" \
  FCM_CLIENT_EMAIL="...@....iam.gserviceaccount.com" \
  FCM_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
# SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont injectés automatiquement.
```

### 3.3 Déployer l'Edge Function
```bash
npx supabase functions deploy notify-vente --no-verify-jwt
```

### 3.4 Configurer le Database Webhook
Dashboard → **Database → Webhooks → Create a new hook** :
- **Table** : `mouvements`
- **Events** : `INSERT`
- **Type** : *Supabase Edge Functions* → `notify-vente`
- (méthode POST, le `record` inséré est envoyé dans le corps)

La fonction ignore les entrées et n'envoie une notif que pour `type='sortie'` :
> 💰 Nouvelle vente — *Coca-Cola x3 = 1 500 FCFA*

---

## 4. Plugins Capacitor (push + preferences)

Les dépendances sont déjà dans `package.json`. Après `npm install` :
```bash
npm run build
npx cap sync
```
`cap sync` intègre `@capacitor/push-notifications` et `@capacitor/preferences`
au projet Android. **Vérifier** que `android/app/google-services.json` est bien
présent (étape 3.1) avant de compiler, sinon FCM ne s'initialise pas.

---

## 5. Générer l'APK

### APK de debug
```bash
npm run build && npx cap sync
cd android && .\gradlew assembleDebug      # Windows
```
→ `android/app/build/outputs/apk/debug/app-debug.apk`

### APK signé (release, pour distribution)
1. Créer un keystore (une seule fois) :
   ```bash
   keytool -genkey -v -keystore depot.keystore -alias depot -keyalg RSA -keysize 2048 -validity 10000
   ```
2. Créer `android/key.properties` :
   ```properties
   storeFile=../../depot.keystore
   storePassword=VOTRE_MOT_DE_PASSE
   keyAlias=depot
   keyPassword=VOTRE_MOT_DE_PASSE
   ```
3. Dans `android/app/build.gradle`, ajouter avant `android { ... }` :
   ```gradle
   def keystoreProperties = new Properties()
   def keystorePropertiesFile = rootProject.file("key.properties")
   if (keystorePropertiesFile.exists()) {
       keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
   }
   ```
   puis dans `android { ... }` :
   ```gradle
   signingConfigs {
       release {
           storeFile file(keystoreProperties['storeFile'])
           storePassword keystoreProperties['storePassword']
           keyAlias keystoreProperties['keyAlias']
           keyPassword keystoreProperties['keyPassword']
       }
   }
   buildTypes {
       release {
           signingConfig signingConfigs.release
           minifyEnabled false
       }
   }
   ```
4. Compiler :
   ```bash
   cd android && .\gradlew assembleRelease
   ```
   → `android/app/build/outputs/apk/release/app-release.apk`

---

## 6. Flux complet en mode Supabase

1. Le **gérant** se connecte → interface 100% visuelle (adaptateur Supabase).
2. Il enregistre une **vente** → INSERT dans `mouvements` (type='sortie').
3. Le trigger calcule `montant_total` et `marge` côté serveur.
4. Le **Database Webhook** déclenche `notify-vente` → **push** au propriétaire.
5. Le **tableau de bord propriétaire** (onglet *En direct* + *Point*) se met à
   jour **en temps réel** via Supabase Realtime.
