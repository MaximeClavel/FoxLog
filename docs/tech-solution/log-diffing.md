# Comparateur de Logs (Log Diffing)

## Objectif

Permettre de comparer côte à côte deux logs Salesforce pour identifier rapidement les divergences d'exécution entre deux environnements, deux profils ou deux tentatives.

## Vue d'ensemble

Le diffing s'appuie sur les **CallTree** déjà construits par `CallTreeBuilderService`. On compare deux arbres nœud par nœud (par signature `type + name`) pour détecter les divergences : nœuds manquants, écarts de durée, erreurs dans un seul arbre, requêtes SOQL/DML supplémentaires.

```text
CallTree A (env/profil A)     CallTree B (env/profil B)
         │                              │
         └──────── DiffEngine ──────────┘
                       │
                  DiffResult[]
                       │
                  DiffView (split-pane UI)
```

## Fichiers à créer

| Fichier | Rôle |
|---------|------|
| `src/services/log-diff-engine.js` | Algorithme de diff entre 2 CallTree |
| `src/workers/log-diff-worker.js` | Web Worker pour le diff (logs volumineux) |
| `src/ui/log-diff-view.js` | Vue côte à côte avec surlignage |

## Fichiers à modifier

| Fichier | Modification |
|---------|-------------|
| `src/ui/modal-manager.js` | Ajout du 5ᵉ onglet "Diff" + wiring |
| `src/modal-styles.css` | Styles du layout split-pane |
| `src/core/constants.js` | Clés i18n + seuils de config |
| `manifest.json` | Ajout de `log-diff-engine.js`, `log-diff-worker.js`, `log-diff-view.js` |

## Structures de données

### DiffResult

```javascript
{
  summary: {
    totalDivergences: number,
    onlyInA: number,
    onlyInB: number,
    timingDiffs: number,
    errorDiffs: number
  },
  pairs: DiffPair[]
}
```

### DiffPair

```javascript
{
  nodeA: CallTreeNode | null,
  nodeB: CallTreeNode | null,
  status: 'match' | 'added' | 'removed' | 'changed',
  changes: {
    duration: { a: number, b: number, delta: number } | null,
    hasError: { a: boolean, b: boolean } | null,
    soqlCount: { a: number, b: number } | null,
    dmlCount: { a: number, b: number } | null
  },
  children: DiffPair[]
}
```

## Algorithme de diff

### Signature de nœud

Chaque nœud est identifié par une signature composée de `type:class.method` (et non par son `id` interne qui diffère entre logs). Les doublons (même méthode appelée N fois) sont distingués par leur position ordinale parmi les frères de même signature.

### Alignement LCS

L'alignement des enfants entre deux nœuds parents utilise l'algorithme **Longest Common Subsequence** sur les séquences de signatures.

```text
function alignChildren(childrenA, childrenB):
    1. Créer les signatures : "METHOD:MyClass.myMethod"
    2. Calculer la LCS des deux séquences de signatures
    3. Parcourir les deux listes en parallèle :
       - Éléments dans la LCS → paire match/changed
       - Éléments hors LCS côté A → removed
       - Éléments hors LCS côté B → added
    4. Pour chaque paire matched, récurser sur les enfants
```

### Classification des paires

| Status | Condition |
|--------|-----------|
| `match` | Même signature, pas de changement significatif |
| `changed` | Même signature, écart de durée > seuil OU différence d'erreur |
| `added` | Nœud présent dans B uniquement |
| `removed` | Nœud présent dans A uniquement |

### Seuil de sensibilité

Par défaut, un écart de durée est considéré significatif quand il dépasse **50 ms** ET **200 %** de la durée de référence. Ces seuils sont configurables via `CONFIG.DIFF_THRESHOLD_MS` et `CONFIG.DIFF_THRESHOLD_PERCENT`.

## Architecture des fichiers

### `src/services/log-diff-engine.js`

```javascript
(function() {
  'use strict';
  window.FoxLog = window.FoxLog || {};
  const logger = window.FoxLog.logger || console;

  class LogDiffEngine {
    /**
     * Compare deux CallTree et retourne le résultat du diff
     * @param {Object} treeA - CallTree gauche
     * @param {Object} treeB - CallTree droite
     * @param {Object} options - Configuration du diff
     * @param {number} options.thresholdMs - Seuil absolu en ms
     * @param {number} options.thresholdPercent - Seuil relatif en %
     * @param {boolean} options.ignoreSystem - Ignorer les nœuds système
     * @returns {DiffResult}
     */
    diff(treeA, treeB, options = {}) { /* ... */ }

    _alignChildren(childrenA, childrenB) { /* LCS */ }
    _computeLCS(seqA, seqB) { /* ... */ }
    _getSignature(node) { /* ... */ }
    _classifyPair(nodeA, nodeB, options) { /* ... */ }
  }

  window.FoxLog.logDiffEngine = new LogDiffEngine();
})();
```

### `src/workers/log-diff-worker.js`

Le Worker reçoit les deux arbres sérialisés et exécute le diff hors du thread principal.

```text
Main thread                    Worker
     │                            │
     ├─ postMessage({             │
     │    type: 'diff',           │
     │    treeA, treeB, options   │
     │  }) ───────────────────────►
     │                            ├─ LCS + récursion
     │                            │
     │  ◄─────────────────────────┤ postMessage({ type: 'result', diff })
     │                            │
```

Le code du `LogDiffEngine` est dupliqué dans le worker (pas d'import possible en Manifest V3 sans module worker). Alternativement, utiliser un worker de type `module` si le navigateur cible le supporte.

### `src/ui/log-diff-view.js`

```javascript
(function() {
  'use strict';
  window.FoxLog = window.FoxLog || {};
  const logger = window.FoxLog.logger || console;

  class LogDiffView {
    /**
     * @param {HTMLElement} container - Conteneur DOM
     * @param {DiffResult} diffResult - Résultat du diff
     * @param {Object} metaA - Métadonnées du log A
     * @param {Object} metaB - Métadonnées du log B
     */
    constructor(container, diffResult, metaA, metaB) { /* ... */ }

    render() { /* ... */ }
    _renderSplitPane() { /* ... */ }
    _renderDiffPair(pair, depth) { /* ... */ }
    _syncScroll() { /* ... */ }
    navigateNext() { /* ... */ }
    navigatePrev() { /* ... */ }
    destroy() { /* ... */ }
  }

  window.FoxLog.LogDiffView = LogDiffView;
})();
```

## Interface utilisateur

### Source des logs

- **Log A (gauche)** : le log actuellement ouvert dans la modale. Non modifiable depuis l'onglet Diff — c'est toujours le log que l'utilisateur a cliqué dans la liste Salesforce ou dans l'onglet Files.
- **Log B (droite)** : sélectionné via un dropdown parmi les **logs importés**, ou importé directement depuis l'onglet Diff via le bouton "📂 Importer un fichier". Un fichier importé depuis l'onglet Diff est automatiquement ajouté à l'historique d'import (onglet Files du panel) et le diff se lance immédiatement.

### Points d'entrée

Trois façons d'accéder au diff :

1. **Depuis la modale (sélection)** : l'utilisateur ouvre un log, va sur l'onglet Diff, et sélectionne un log déjà importé comme Log B via le dropdown.
2. **Depuis la modale (import direct)** : dans l'onglet Diff, il clique sur "📂 Importer un fichier", sélectionne un `.txt` ou `.log`. Le fichier est sauvé dans le storage, ajouté au dropdown, et le diff se lance automatiquement.
3. **Depuis l'onglet Files du panel** : cliquer sur un log importé ouvre la modale. L'utilisateur accède ensuite au diff via l'onglet Diff.

### Layout

```text
┌─────────────────────────────────────────────────────┐
│  [Log B ▼ imported logs]  ou  [📂 Importer un fichier] │
├──────────────────────────┬──────────────────────────┤
│  Log A (current)         │  Log B (importé)        │
│  ■ MyClass.execute       │  ■ MyClass.execute       │
│    120ms                 │    3400ms  ⚠️ +2837%     │
│  ├ doQuery  2ms          │  ├ doQuery  2ms          │
│  ├ validate 5ms          │  ├ validate 5ms          │
│                          │  ├ extraCall 3200ms  🆕  │
│  ├ commit   3ms          │  ├ commit   3ms          │
│  └ cleanup  1ms          │  └ ❌ cleanup EXCEPTION  │
├──────────────────────────┴──────────────────────────┤
│  ◄ Prev diff  │  3/7 divergences  │  Next diff ►    │
└─────────────────────────────────────────────────────┘
```

### Code couleur

| Couleur | Signification |
|---------|--------------|
| Gris (par défaut) | Nœuds identiques (`match`) |
| Rouge | Nœud supprimé ou en erreur (`removed`) |
| Bleu | Nœud ajouté (`added`) |
| Orange | Écart de performance significatif (`changed`) |

### Fonctionnalités

- **Scroll synchronisé** : les deux panneaux scrollent ensemble via un listener `onscroll`
- **Navigation entre divergences** : boutons Prev/Next pour sauter directement au diff suivant
- **Virtualisation** : seuls les nœuds visibles sont rendus (même pattern que `CallTreeView`)
- **Sélecteur Log B** : un dropdown alimenté par la liste des logs importés (`chrome.storage.local` clé `importedLogs`)
- **Import direct** : bouton "📂 Importer un fichier" à côté du dropdown, qui sauvegarde dans le storage, met à jour le dropdown, rafraîchit l'onglet Files du panel, et lance le diff immédiatement
- **Résumé** : bandeau en bas avec le nombre total de divergences par catégorie

### Intégration dans la modale

Ajout d'un 5ᵉ onglet dans la barre de tabs existante :

```text
 Summary | Analysis | Calls | Raw Log | Diff
```

L'onglet Diff est toujours visible. Le contenu est chargé en lazy (comme l'onglet Calls). Log A est toujours le log courant de la modale (non modifiable). Si aucun log importé n'existe, l'utilisateur peut importer directement depuis l'onglet Diff.

### Synchronisation avec l'onglet Files du panel

Lorsqu'un fichier est importé depuis l'onglet Diff, un événement `foxlog:importListChanged` est dispatché. Le `PanelManager` écoute cet événement et rafraîchit automatiquement la liste d'historique d'import.

## Flux utilisateur

### Scénario principal : comparaison cross-environnement

1. L'utilisateur ouvre un log depuis l'onglet **Salesforce** → la modale s'ouvre (Log A)
2. Il va sur l'onglet **Diff** de la modale
3. Il clique sur **📂 Importer un fichier** et sélectionne le log de l'autre environnement
4. Le fichier est sauvé dans le storage (visible aussi dans l'onglet Files)
5. Le `LogDiffEngine` compare les deux CallTrees via le Worker
6. La `LogDiffView` affiche le résultat côte à côte
7. Il navigue entre les divergences avec les boutons Prev/Next

### Scénario avec log déjà importé

1. L'utilisateur ouvre un log (Salesforce ou importé)
2. Il va sur l'onglet **Diff**
3. Le dropdown liste les logs importés existants
4. Il sélectionne un log comme Log B
5. Le diff se lance

## Considérations techniques

### Performance

- **LCS** a une complexité O(n × m) où n et m sont le nombre d'enfants à aligner. Pour les arbres > 5000 nœuds, le Worker est indispensable.
- Prévoir un timeout de 10 s avec message utilisateur si le diff est trop long.
- Libérer le `DiffResult` de la mémoire à la fermeture de l'onglet Diff.

### Mémoire

Deux CallTrees + un DiffResult en mémoire simultanément. Prévoir un `destroy()` agressif sur la `LogDiffView` qui nullifie les références et appelle `clearCache()` sur le builder si nécessaire.

### Manifest V3

- Pas de `eval()` dans le worker
- Le worker doit être déclaré dans `manifest.json` sous `web_accessible_resources` si chargé dynamiquement
- Tout le code doit être statique (pas de construction de fonction à la volée)

### Accessibilité

- Les divergences doivent avoir un `aria-label` descriptif (ex: "Nœud ajouté : extraCall, durée 3200ms")
- La navigation Prev/Next doit être accessible au clavier
- Les couleurs ne doivent pas être le seul indicateur : ajouter des icônes (🆕, ❌, ⚠️)

## Configuration (constants.js)

```javascript
window.FoxLog.CONFIG.DIFF_THRESHOLD_MS = 50;
window.FoxLog.CONFIG.DIFF_THRESHOLD_PERCENT = 200;
window.FoxLog.CONFIG.DIFF_IGNORE_SYSTEM = true;
window.FoxLog.CONFIG.DIFF_WORKER_TIMEOUT = 10000;
```

## Clés i18n à ajouter

```javascript
window.FoxLog.i18n.diffTab = 'Diff';
window.FoxLog.i18n.diffSelectLog = 'Select an imported log to compare';
window.FoxLog.i18n.diffNoImports = 'Import a log first (Files tab)';
window.FoxLog.i18n.diffAdded = 'Added';
window.FoxLog.i18n.diffRemoved = 'Removed';
window.FoxLog.i18n.diffChanged = 'Changed';
window.FoxLog.i18n.diffMatch = 'Identical';
window.FoxLog.i18n.diffSummary = '{0} divergences found';
window.FoxLog.i18n.diffPrev = 'Previous difference';
window.FoxLog.i18n.diffNext = 'Next difference';
window.FoxLog.i18n.diffComputing = 'Computing diff...';
window.FoxLog.i18n.diffTimeout = 'Diff computation timed out';
```

## Ordre d'implémentation recommandé

1. `src/services/log-diff-engine.js` — cœur algorithmique, testable unitairement
2. `tests/test-diff-engine.js` — tests sur des arbres simples
3. `src/workers/log-diff-worker.js` — parallélisation
4. `src/ui/log-diff-view.js` — rendu visuel
5. Modifications de `modal-manager.js` — intégration onglet
6. Modifications de `modal-styles.css` — styles split-pane
7. Modifications de `constants.js` — config + i18n
8. Mise à jour de `manifest.json` — déclaration des nouveaux fichiers
