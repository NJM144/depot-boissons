# 🍹 Dépôt Boissons — Application mobile (APK Android)

Application de gestion d'un dépôt de boissons avec **deux profils distincts** :

| Profil | Pour qui | Interface |
|--------|----------|-----------|
| 🧑‍🏭 **Gérant** | Personne **analphabète** | 100 % images, icônes, couleurs et **voix**. Aucun texte indispensable. Gros boutons tactiles (≥ 80 px). |
| 🔐 **Propriétaire** | Personne qui suit les ventes | Interface **classique** : chiffres, tableaux, graphiques. Protégée par **code PIN**. |

Les deux profils partagent la **même base de données locale** (IndexedDB via Dexie), avec une structure prête pour une synchronisation **Supabase** ultérieure (champ `synced` sur chaque mouvement).

---

## ✨ Fonctionnalités

### Profil Gérant (analphabète)
- **Sélection par image** : grille de photos/casiers colorés, **lecture vocale** du nom au tap.
- **Entrées / Sorties** : flèche **verte** = reçu (entrée), flèche **rouge** = vendu (sortie).
- **Quantité** : gros boutons `+` / `−`, quantité affichée **en images répétées**.
- **Clavier monétaire par images** (FCFA) : chaque bouton est un **billet ou une pièce**
  (billets 10000/5000/2000/1000/500 ; pièces 500/250/200/100/50/25/10/5). Le total
  s'affiche **en billets empilés** + lecture vocale, avec bouton « annuler le dernier ».
- **Le « point »** : stock calculé automatiquement (entrées − sorties), récap 100 % visuel,
  **VALIDER ✓ / ANNULER ✗** avec confirmation vocale.
- **Vibration** et **sons** de feedback à chaque action.

### Profil Propriétaire
- **Tableau de bord** : CA jour / semaine / mois, **courbe des ventes**, **top boissons**,
  **stock actuel** avec **alertes de rupture**.
- **Historique & filtres** : par date, boisson, type ; **export CSV / PDF**.
- **Gestion du catalogue** : ajouter/modifier les boissons (nom, **photo**, prix, couleur).
  👉 Les photos alimentent **automatiquement** l'écran du gérant.
- **Réglages** : changer le code PIN (par défaut **1234**).

---

## 🛠️ Stack technique
- **React 18** + **Vite** + **TailwindCSS**
- **Capacitor 6** (empaquetage Android → APK)
- **Dexie** (IndexedDB) — base locale partagée
- **@capacitor-community/text-to-speech** — synthèse vocale française
- **@capacitor/haptics** — vibrations ; sons générés via Web Audio API

---

## 🚀 Lancer en développement (navigateur)

```bash
npm install
npm run dev
```
Ouvrir l'URL affichée (ex. http://localhost:5173). La voix utilise alors l'API du navigateur.

---

## 📦 Générer l'APK Android

> Prérequis : **Node.js**, **Android Studio** (avec le SDK Android) et **JDK 17**.
> La variable `ANDROID_HOME` (ou `ANDROID_SDK_ROOT`) doit pointer vers le SDK.

```bash
# 1. Installer les dépendances
npm install

# 2. Construire l'app web (génère le dossier dist/)
npm run build

# 3. Ajouter la plateforme Android (une seule fois)
npx cap add android

# 4. Copier le build web dans le projet Android
npx cap sync

# 5. Compiler l'APK de debug
cd android
./gradlew assembleDebug        # Windows PowerShell :  .\gradlew assembleDebug
```

📍 **L'APK est généré ici :**
```
android/app/build/outputs/apk/debug/app-debug.apk
```

### Commande condensée (Linux/macOS)
```bash
npm run build && npx cap add android && npx cap sync && cd android && ./gradlew assembleDebug
```

### Windows (PowerShell)
```powershell
npm run build ; npx cap add android ; npx cap sync ; cd android ; .\gradlew assembleDebug
```

> 💡 Astuce : pour ouvrir le projet dans Android Studio (build via l'interface) :
> `npx cap open android`.

---

## 📲 Installer l'APK sur un téléphone

1. **Copier** `app-debug.apk` sur le téléphone (câble USB, Bluetooth, ou WhatsApp/e-mail).
2. Sur le téléphone, ouvrir le fichier APK depuis le gestionnaire de fichiers.
3. Android demandera d'autoriser l'**installation depuis des sources inconnues** :
   *Paramètres → Sécurité → Installer des applications inconnues* → autoriser pour le
   gestionnaire de fichiers (ou le navigateur) utilisé.
4. Appuyer sur **Installer**, puis **Ouvrir**.

> Au **premier lancement**, autoriser le **micro/son** n'est pas requis, mais laisser
> le volume activé pour entendre la **synthèse vocale**. L'app fonctionne **hors-ligne**.

### Installation via ADB (optionnel, pour développeurs)
```bash
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

---

## 🗂️ Arborescence des fichiers

```
depot-boissons/
├── capacitor.config.ts          # Config Capacitor (appId, webDir=dist)
├── index.html                   # Plein écran, no-zoom
├── package.json
├── postcss.config.js
├── tailwind.config.js           # Couleurs entree/sortie, boutons ≥ 80px
├── vite.config.js               # base: './' (obligatoire pour le WebView)
├── README.md
└── src/
    ├── main.jsx                 # Point d'entrée + init base de données
    ├── App.jsx                  # Routeur (accueil / gerant / proprietaire)
    ├── index.css                # Styles globaux + classe .btn-tactile
    │
    ├── db/
    │   ├── database.js          # Schéma Dexie + CRUD + calculs/stats partagés
    │   └── seed.js              # Catalogue de démonstration
    │
    ├── hooks/
    │   ├── useVoix.js           # Synthèse vocale (Capacitor TTS / Web Speech)
    │   ├── useFeedback.js       # Vibration (Haptics) + sons (Web Audio)
    │   └── useDatabase.js       # Accès réactif à la base
    │
    ├── utils/
    │   ├── argent.js            # Coupures FCFA, décomposition en billets
    │   └── export.js            # Export CSV & PDF
    │
    └── components/
        ├── EcranAccueil.jsx     # Choix du profil (2 gros boutons)
        │
        ├── commun/
        │   ├── PhotoBoisson.jsx # Photo réelle ou casier coloré + emoji
        │   ├── Coupure.jsx      # Dessin SVG d'un billet / d'une pièce
        │   └── Graphiques.jsx   # Courbe de ventes + barres top boissons
        │
        ├── gerant/
        │   ├── GerantApp.jsx        # Orchestrateur du parcours (étapes)
        │   ├── SelectionBoissons.jsx
        │   ├── CompteurQuantite.jsx
        │   ├── ClavierMonetaire.jsx
        │   └── RecapVisuel.jsx
        │
        └── proprietaire/
            ├── ProprietaireApp.jsx  # PIN + onglets + réglages
            ├── AuthPIN.jsx
            ├── TableauBord.jsx
            ├── Historique.jsx
            └── GestionCatalogue.jsx
```

---

## 🗄️ Schéma de la base de données (Dexie / IndexedDB)

```
boissons   : ++id, nom, emoji, photo(dataURL), couleurCasier, prixReference, seuilAlerte, actif
mouvements : ++id, boissonId, type('entree'|'sortie'), quantite, montant,
             dateJour('AAAA-MM-JJ'), timestamp, dateISO, synced(0|1)
config     : cle('pin', ...), valeur
```

- **Stock** d'une boisson = Σ(entrées) − Σ(sorties).
- **Chiffre d'affaires** = Σ(montants des sorties) sur la période.
- `synced` est prêt pour pousser les lignes vers **Supabase** plus tard.

---

## 🔐 Sécurité & accès
- L'écran d'accueil propose **GÉRANT** (libre) et **PROPRIÉTAIRE** (PIN).
- Le **gérant n'accède jamais** aux statistiques — uniquement la saisie.
- Code PIN par défaut **1234**, modifiable dans *Propriétaire → Réglages*.

---

## ☁️ Mode Supabase (backend, temps réel, push)

L'app fonctionne en **deux modes**, choisis automatiquement au démarrage :

| | MODE LOCAL (défaut) | MODE SUPABASE |
|---|---|---|
| Activation | aucune config | variables `.env` présentes |
| Données | Dexie / IndexedDB (hors-ligne) | base Supabase partagée |
| Accès | code PIN local | auth e-mail + **routage par rôle** |
| Sécurité prix/marge | — | **RLS** : gérant sans accès `prix_achat`/`marge` |
| Temps réel | — | tableau propriétaire **en direct** |
| Notifications | — | **push FCM** à chaque vente |

👉 **Tout le guide d'activation est dans [SUPABASE.md](SUPABASE.md)** : application du
SQL, création des comptes, Database Webhook, FCM, déploiement de l'Edge Function
`notify-vente`, et génération de l'**APK signé**.

### Nouvelles fonctionnalités (mode Supabase)
- **Gérant** : bouton **CASSÉ** 🥃💥 (saisie des pertes → table `casses`), chaque
  vente déclenche une notif push au propriétaire.
- **Propriétaire** : onglet **Point** (jour/semaine/mois via la RPC `get_point` :
  CA, marge, coût des casses, **marge nette**, détail par boisson) et onglet
  **En direct** (ventes en temps réel). Catalogue avec **prix d'achat + prix de
  vente** (alimente les marges et le clavier du gérant).

### Côté base (`supabase/migrations/`)
```
mouvements + casses           → triggers de calcul (montant_total, marge, cout_total)
v_stock                       → stock = entrées − sorties − casses
v_point_jour/semaine/mois     → agrégats pour les graphiques
get_point(depot_id, periode)  → RPC du "point" (réservée au propriétaire)
RLS                           → cloisonnement par dépôt + masquage prix/marge au gérant
Realtime                      → publication sur mouvements + casses
```
