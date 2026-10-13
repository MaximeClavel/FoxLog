# Ouvrir un log dans un nouvel onglet

## Objectif

Afficher l'analyse d'un log (Résumé, Analyse, Flux, Appels, Log brut, Diff) en pleine page dans un onglet du navigateur, plutôt que dans la modale posée sur Salesforce : plus de place pour le graphe, plusieurs logs côte à côte, un second écran.

Deux points d'entrée :

- le bouton **Ouvrir dans un nouvel onglet** de l'en-tête de la modale : même log, ouvert sur l'onglet sélectionné dans la modale ;
- le même bouton sur chaque carte de log du panneau (onglet Salesforce) et sur chaque fichier importé (onglet Fichiers) : ouvre directement la page, sans passer par la modale, sur le Résumé.

## Vue d'ensemble

La page affichée est une page de l'extension (`chrome-extension://…/src/viewer/viewer.html`, `moz-extension://…` sous Firefox). Elle n'a pas de session Salesforce et ne fait aucun appel à Salesforce : le log lui est transmis complet par le content script, qui l'a déjà (modale, fichier importé) ou le télécharge (carte du panneau).

```text
Content script (onglet Salesforce)            Background                         Onglet viewer
───────────────────────────────────           ──────────────────────────        ─────────────────────────
modale  ─┐                                     openLogInNewTab                   viewer.html?k=<clé>
carte   ─┼─► newTabOpener.open(log) ──message──► clé = randomUUID()              │
fichier ─┘   (corps du log + métadonnées)       stocke foxlogViewer:<clé>  ◄─────┤ lit storage.session,
                                                tabs.create(viewer?k=<clé>)       │ sinon storage.local
                                                juste après l'onglet Salesforce   │ viewerAttach(clé)
                                                                                  └► modale en « mode page »
                                                tabs.onRemoved ─► supprime l'entrée quand plus aucun onglet ne l'affiche
```

## Fichiers

| Fichier | Rôle |
|---------|------|
| `src/services/new-tab-opener.js` | Content script. `newTabOpener.openParsedLog(parsedLog, onglet)` (modale) et `newTabOpener.open({ rawContent, metadata, userName, cleared, initialTab })` (cartes). Envoie le message au background, affiche un toast en cas d'échec |
| `src/background.js` | Classe `ViewerHandover` : stockage sous une clé aléatoire, ouverture de l'onglet, index clé → onglets, nettoyage |
| `src/viewer/viewer.html` | Page de l'extension : mêmes feuilles de style et mêmes modules que le content script, sans la session/API Salesforce ni le panneau. Scripts externes uniquement (CSP des pages d'extension) |
| `src/viewer/viewer.js` | Lit l'entrée, reparse le log, appelle `modalManager.showParsedLog()` en mode page, ouvre l'onglet demandé |
| `src/viewer/viewer.css` | Transforme la modale (fond assombri + carte flottante) en page pleine fenêtre |
| `src/ui/modal-manager.js` | Bouton de l'en-tête + crochets du mode page (voir plus bas) |
| `src/ui/panel-manager.js`, `src/content.js` | Bouton des cartes (événement `foxlog:openInNewTab`), téléchargement du corps du log puis appel à `newTabOpener` |
| `src/core/constants.js` | Clés i18n `openInNewTab…`/`viewer…`, et `createWorker()` (voir « Workers ») |

## Le passage de relais

### 1. Le message

`newTabOpener` envoie `{ action: 'openLogInNewTab', log }` par `chrome.runtime.sendMessage` (avec callback : le shim `chrome.*` de Firefox ne renvoie pas toujours de Promise, cf. CHANGELOG 1.10.0) :

```js
log = {
  rawContent,          // corps brut du log (plusieurs Mo possibles)
  metadata: {          // les champs ApexLog que LogParser.parse() lit
    Id, LogUserId, Operation, Status, Application, StartTime, DurationMilliseconds, LogLength
  },
  userName,            // puce « utilisateur » de l'en-tête (content.js _decorateLogMetadata)
  cleared,             // puce « Masqué » (log caché par Clear)
  initialTab           // 'summary' | 'analysis' | 'graph' | 'calls' | 'raw' | 'diff'
}
```

Depuis la modale, les métadonnées normalisées du log parsé (`id`, `operation`, `startTime`…) sont reconverties en champs ApexLog : le viewer reparse le log exactement comme le content script l'a fait. Pour un fichier importé, ce sont les mêmes métadonnées de substitution que pour la modale (`content.js` `_importedLogMetadata`, statut `Import`).

Un double clic n'ouvre qu'un onglet : `newTabOpener` (par Id de log) et `content.js` (pendant le téléchargement du corps) ignorent une demande déjà en cours.

### 2. Le background

`ViewerHandover.open()` :

1. tire une clé `crypto.randomUUID()` et l'inscrit dans l'index `foxlogViewerIndex` (`storage.local`, petit : `{ [clé]: { tabIds: [], createdAt } }`) **avant** de stocker le log, pour que le nettoyage puisse toujours le retrouver ;
2. stocke `foxlogViewer:<clé>` → `{ rawContent, metadata, userName, cleared, initialTab, createdAt }` (voir « Stockage ») ;
3. ouvre `viewer.html?k=<clé>` avec `chrome.tabs.create({ windowId, index: onglet.index + 1, openerTabId })` : juste à droite de l'onglet Salesforce, dans sa fenêtre ;
4. rattache l'identifiant du nouvel onglet à la clé, puis répond `{ ok: true }`.

En cas d'échec, l'entrée est supprimée et la réponse est `{ ok: false, error: 'storage' | 'tab' | 'invalid' }`. `newTabOpener` affiche alors un toast d'erreur dans la page Salesforce (message dédié quand le log ne tient dans aucun stockage).

### 3. Le viewer

`viewer.js` lit la clé dans `?k=`, envoie `{ action: 'viewerAttach', key }` (le background ajoute l'onglet courant à l'index : utile après un rechargement ou une duplication de l'onglet), lit l'entrée dans `storage.session` puis `storage.local`, et :

- reparse le log, ajoute `userName`/`cleared` aux métadonnées ;
- passe `modalManager.pageMode = true`, appelle `modalManager.showParsedLog()` ;
- donne à la racine le rôle `main` (et retire `aria-modal`) : c'est une page, pas une boîte de dialogue ;
- ouvre l'onglet `#hash` de l'URL s'il y en a un, sinon `initialTab` ; chaque changement d'onglet réécrit le `#hash` (`history.replaceState`), donc un rechargement revient sur le même onglet ;
- titre de la page : `<opération> · FoxLog`.

Clé inconnue ou entrée supprimée : la page affiche « Ce log n'est plus disponible » et invite à le rouvrir depuis FoxLog dans Salesforce.

## Stockage et nettoyage

**Où.** `chrome.storage.session` d'abord : en mémoire, vidé à la fermeture du navigateur, accessible au background et aux pages de l'extension mais pas aux content scripts (niveau d'accès par défaut). Son quota est de 10 Mo sous Chrome (toutes entrées confondues) ; un log Salesforce peut atteindre 20 Mo. Si l'écriture échoue (quota dépassé, ou `storage.session` absent), l'entrée part dans `chrome.storage.local`, sans limite grâce à la permission `unlimitedStorage` déjà présente. Si les deux échouent, toast d'erreur.

**Combien de temps.** Une entrée vit tant qu'au moins un onglet l'affiche, et non jusqu'à sa première lecture : sinon recharger l'onglet du viewer ne montrerait plus rien.

- `chrome.tabs.onRemoved` (écouteur déclaré au niveau racine du script, il réveille le service worker / la page d'événements) retire l'onglet de l'index et supprime les entrées qu'aucun autre onglet n'affiche.
- À chaque démarrage du service worker, `sweep()` supprime les entrées dont aucun onglet n'existe plus (`chrome.tabs.get` échoue) — fermés pendant que le worker dormait — et les entrées jamais rattachées à un onglet depuis plus d'une heure (création d'onglet ratée, viewer jamais chargé).
- `chrome.runtime.onStartup` (nouvelle session du navigateur) supprime tout : les identifiants d'onglets repartent de zéro, et les entrées de `storage.local` resteraient sinon rattachées à des onglets disparus, voire à des onglets sans rapport qui auraient repris le même identifiant.

La suppression vise toujours les deux zones de stockage : l'index n'a pas besoin de savoir où l'entrée a été écrite.

## Mode page (`modal-manager.js`)

La modale est réutilisée telle quelle ; le viewer ne la duplique pas. Les retouches de `modal-manager.js` (l'enveloppe de la modale, voir [modal-tabs.md](modal-tabs.md)) se limitent à ce qui suit, repérables par `PAGE MODE` et `sf-modal-newtab-btn` :

1. constructeur : `this.pageMode = false;` ;
2. `showParsedLog()`, en-tête : le bouton `<button class="sf-modal-newtab-btn">` (icône `external-link`, `aria-label`/`title` = `i18n.openInNewTab`) entre la navigation précédent/suivant et le bouton de fermeture ;
3. `_attachModal()` : son écouteur de clic, qui appelle `window.FoxLog.newTabOpener?.openParsedLog(this.currentParsedLog, <data-tab de l'onglet actif>)` ;
4. `_attachModal()` : trois gardes `this.pageMode` — pas de piège à focus sur Tab, pas de fermeture au clic sur le fond, pas de fermeture sur Échap.

Tout le reste est hors de ce fichier. `viewer.html` charge les mêmes modules que le content script (onglets de `src/ui/modal-tabs/` compris, voir « Load order » dans [modal-tabs.md](modal-tabs.md)) : `viewer.css` fait occuper toute la fenêtre à la modale (sans fond assombri, bordure ni ombre) et masque les boutons Fermer et Ouvrir dans un nouvel onglet ; `viewer.js` pose le rôle `main`.

## Comportement dans l'onglet

- **Résumé, Analyse, Flux, Appels, Log brut** : identiques à la modale, y compris les liens du Résumé vers le Flux et l'Analyse, les exports (PDF, MD, TXT) et la copie.
- **Sections repliées du Résumé** : préférence commune avec la modale (`chrome.storage.local`, accessible depuis la page).
- **Diff** : la liste des fichiers importés vient de `chrome.storage.local`, partagé avec le content script. Un fichier importé depuis l'onglet Diff du viewer rejoint l'historique ; l'onglet Fichiers du panneau ne l'affiche qu'à son prochain affichage (l'événement `foxlog:importListChanged` ne traverse pas les onglets).
- **Navigation précédent/suivant** : absente. Elle dépend de la liste du panneau (et de la session Salesforce pour télécharger le log suivant) ; le viewer n'affiche qu'un log.
- **Après un redémarrage du navigateur**, un onglet de viewer restauré affiche « Ce log n'est plus disponible ».

### Workers

Dans le content script, un worker `chrome-extension://…` serait cross-origin : il faut télécharger son code et le lancer depuis une URL `blob:`. Dans le viewer (origine de l'extension), on le lance directement par son URL, que la CSP des pages d'extension (`script-src 'self'`) autorise toujours. `window.FoxLog.createWorker(path)` (`constants.js`) choisit selon l'origine de la page ; `CallTreeBuilder` (Flux, Appels) et `runDiffWorker()` (onglet Diff, `src/ui/modal-tabs/diff-tab.js`) l'utilisent tous les deux.

## Firefox

- `storage.session` existe depuis Firefox 115 (`strict_min_version` : 140). Les appels `storage`, `tabs` et `runtime` du background passent tous par des callbacks (`chromeCall()`).
- `tabs.create` accepte `windowId`, `index` et `openerTabId` ; `tabs.get`, `tabs.create` et `tabs.onRemoved` ne demandent pas la permission `tabs` (seuls `url`/`title` seraient masqués).
- Le background est une page d'événements (`background.scripts`) : les écouteurs `tabs.onRemoved` et `runtime.onStartup` sont déclarés au niveau racine, comme sous Chrome.
- Le viewer est ouvert par le background : il n'a rien à faire dans `web_accessible_resources`.

## Permissions

Aucune nouvelle permission. `storage` et `unlimitedStorage` existaient déjà ; les API `tabs` utilisées n'en demandent pas.

## Vérification

- `tests/ui-preview` : `chrome.runtime.sendMessage` y est simulé ; les messages envoyés sont consultables dans `chrome.runtime.sentMessages` (charge utile du bouton de la modale et des cartes).
- Extension réelle chargée dans Chromium (Playwright) : une page HTTPS servie pour `foxlog.lightning.force.com` (résolue vers localhost) reçoit les vrais content scripts ; l'API Salesforce y est remplacée par le backend de démo de `tests/ui-preview`. Parcours vérifiés : carte → onglet, modale (onglet Flux) → onglet sur le Flux, fichier importé → onglet, placement et `openerTabId` de l'onglet, rechargement, fermeture → entrée supprimée, log de 11 Mo → repli sur `storage.local`, échec de stockage → toast, clé inconnue, thèmes clair et sombre, libellés français.
