# Portage Firefox

## Objectif

Étudier la faisabilité de publier FoxLog en tant qu'extension Firefox (Manifest V3, AMO), en plus de la version Chrome existante, et lister les changements concrets à apporter.

## Verdict

**Faisable, et peu coûteux.** FoxLog n'a pas de bundler ni de framework (JS vanilla chargé directement via `manifest.json`), n'utilise aucune API exclusive à Chrome (pas de `scripting`, `declarativeNetRequest`, `alarms`...), et son unique code "métier" (parsers, call tree, anti-patterns, diff, UI) est du DOM/JS pur sans dépendance navigateur. La surface d'API WebExtensions réellement utilisée est très réduite : `cookies`, `storage`, `runtime`, et un usage minimal de `tabs` (query/sendMessage sans permission dédiée).

Estimation : quelques heures pour un portage minimal fonctionnel, une demi-journée pour une version idiomatique (voir §4), plus le temps de QA manuelle sur un vrai org Salesforce et le délai de revue AMO.

## 1. Ce qui est déjà portable sans modification

- **`src/injected.js`** : aucun appel `chrome.*`, communique uniquement via `CustomEvent` — portable tel quel.
- **Web Workers** (`call-tree-worker.js`, `log-diff-worker.js`) : API Web standard, indépendante du navigateur.
- **Toute la logique métier** : parser de logs, `call-tree-builder`, `anti-pattern-detector`, `log-diff-engine`, vues UI — aucun code spécifique navigateur.
- **La forme du `manifest.json`** : `permissions`, `host_permissions`, `content_scripts`, `web_accessible_resources` (format tableau MV3) sont supportés à l'identique par Firefox MV3.
- **~30 des ~32 appels `chrome.*`** (`storage.local.get/set`, `runtime.onMessage`, `runtime.sendMessage`, `runtime.getURL`, `runtime.getManifest`, `tabs.query/sendMessage`) utilisent déjà la convention callback historique de Chrome, que Firefox expose nativement via son alias de compatibilité `chrome.*`. Fichiers concernés : `content.js`, `popup.js`, `core/constants.js`, `services/session-manager.js`, `services/call-tree-builder.js`, `ui/modal-manager.js`, `ui/panel-manager.js`.

## 2. Changements nécessaires

| Fichier | Changement | Pourquoi |
|---|---|---|
| `src/background.js` (lignes 90, 114) | `await chrome.cookies.get(...)` / `await chrome.cookies.getAll({})` sans callback → à réécrire en callback explicite (ou migrer vers `browser.*`, natif et basé sur des Promises) | C'est le seul vrai point de rupture fonctionnelle : ce code s'appuie sur le support Promise ajouté côté Chrome ; l'alias `chrome.*` de Firefox est callback-only. Sans fix, la recherche du cookie `sid` échouerait silencieusement sur Firefox. |
| `manifest.firefox.json` (nouveau fichier) → `background` | `{"scripts": ["src/background.js"]}` au lieu de `service_worker` | ⚠️ Corrigé après test réel : la double clé `{"service_worker": ..., "scripts": [...]}` dans **un seul** `manifest.json` fait que Chrome affiche l'avertissement *"'background.scripts' requires manifest version of 2 or lower"* dans `chrome://extensions` — Chrome valide le sous-schéma de `background` et rejette `scripts` en MV3, contrairement à une clé racine inconnue comme `browser_specific_settings` qu'il ignore silencieusement. Solution retenue : **deux manifests séparés** (voir §5) plutôt qu'un seul avec les deux clés. |
| `manifest.firefox.json` (racine) | `browser_specific_settings.gecko.id` (`foxlog@foxlog.extension`), `strict_min_version`, `data_collection_permissions.required: ["none"]` (exigence AMO pour toute nouvelle soumission), `gecko_android.strict_min_version` | Propre à Firefox/AMO ; aucun intérêt à le mettre dans le `manifest.json` de Chrome. |
| `manifest.json` (Chrome) → `permissions` | Ajouter `unlimitedStorage` | Le quota d'imports est plafonné en dur à 10 Mo (`panel-manager.js`), calé sur le quota par défaut de `storage.local` sous Chrome. Le défaut Firefox n'est pas garanti identique ; `unlimitedStorage` supprime l'ambiguïté sur les deux navigateurs. Permission standard, sans effet de bord côté Chrome — reste dans le manifest partagé. |
| `PRIVACY.md`, `README.md` | Reformuler "Chrome extension" / "Chrome Web Store" en termes neutres, ajouter une section d'installation Firefox | Le contenu (aucune donnée envoyée à l'extérieur) reste valable tel quel pour la fiche AMO. |
| `modal-styles.css`, `styles.css` | Cosmétique uniquement : les règles `::-webkit-scrollbar` sont ignorées par Gecko (repli silencieux sur la scrollbar par défaut) | Aucun impact fonctionnel ; ajouter `scrollbar-width`/`scrollbar-color` en bonus pour la parité visuelle. |

## 3. Points à valider en QA réelle (pas de suite de tests d'intégration navigateur aujourd'hui)

- Récupération du cookie de session `sid` via `cookies.getAll`, y compris avec la Protection totale contre les cookies (Total Cookie Protection) et les onglets conteneurs de Firefox.
- Injection/drag/dock du bouton flottant + persistance de sa position (`storage.local`).
- Import de logs à proximité de la limite de stockage.
- Construction du call tree et diff via Web Worker sur un log volumineux.
- Parité des thèmes clair/sombre (`prefers-color-scheme`).

Outil recommandé : `npx web-ext run -t firefox-desktop` (rechargement à chaud, aucune dépendance à committer) et `npx web-ext lint` avant soumission.

## 4. Deux niveaux de portage possibles

**A. Minimal (recommandé pour un premier build fonctionnel)** : garder `chrome.*` partout, ne corriger que les 2 appels Promise-only de `background.js`, appliquer les changements de `manifest.json` ci-dessus. Diff contenu, risque faible.

**B. Idiomatique (amélioration ultérieure, non bloquante)** : adopter le polyfill officiel Mozilla `webextension-polyfill`, renommer les ~32 sites d'appel `chrome.*` → `browser.*`, harmoniser tout en `async/await`. Plus propre à maintenir sur la durée, mais touche 8 fichiers pour un gain qui n'est pas requis pour que l'extension fonctionne.

## 5. Packaging et distribution

- Toujours pas de bundler : `manifest.json` (Chrome, inchangé à `unlimitedStorage` près) et `manifest.firefox.json` (Firefox, avec `background.scripts` et `browser_specific_settings`) coexistent à la racine. Chrome ignore `manifest.firefox.json` (il ne lit que `manifest.json`), donc rien à faire côté Chrome.
- `scripts/build-firefox-xpi.sh` construit le `.xpi` : il copie `manifest.firefox.json` → `manifest.json` dans un dossier temporaire avec `popup.html`, `popup.js` et `src/`, puis zippe. Le `manifest.json` du dépôt n'est jamais touché.
- Publication sur addons.mozilla.org : gratuite (contrairement aux 5 $ uniques du Chrome Web Store), signature obligatoire par Mozilla pour toute distribution hors chargement temporaire, code source lisible (pas de minification) donc revue AMO simplifiée.
- `PRIVACY.md` existant est réutilisable tel quel pour la fiche AMO (aucune donnée quittant le navigateur, seule la formulation "Chrome extension" est à neutraliser).

## Recommandation

Partir sur le portage minimal (§4-A) pour obtenir un build Firefox fonctionnel rapidement, valider avec `web-ext` + QA manuelle sur un org réel, puis soumettre à l'AMO. La migration vers `webextension-polyfill` (§4-B) peut suivre plus tard sans urgence.
