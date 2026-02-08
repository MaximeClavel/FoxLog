**Définition de besoin** : Onglet "Appels" avec arborescence interactive des méthodes/SOQL/DML
**Code de l'extension** : Tous les fichiers source (parsers, services, UI, styles, manifest)

> ⚠️ **Note historique** : Ce document a été rédigé avant l'implémentation. L'onglet Timeline mentionné a depuis été **supprimé** et ses fonctionnalités utiles (filtres par type) ont été intégrées directement dans l'onglet Calls. L'extension dispose maintenant de **3 onglets** : Summary, Calls, Raw Log.

## 📋 Résumé de ma compréhension

### Objectif principal
Ajouter un **4ème onglet "Appels"** dans la modal de log parsé, qui affiche :
- Une arborescence hiérarchique des appels (méthodes → sous-méthodes → SOQL/DML)
- Avec expand/collapse, recherche, filtres, et navigation vers le log source

### Points clés identifiés
1. **Réutilisation maximale** : S'appuyer sur `log-parser.js` et `log-preview-service.js`
2. **Performance** : Virtualisation pour >500 nœuds, lazy-load
3. **UX riche** : Clic droit, tooltips, raccourcis clavier, top 5 des nœuds lents
4. **Intégration seamless** : S'intégrer dans `modal-manager.js` sans casser l'existant

### Architecture proposée (à valider)
```
src/
├── services/
│   └── call-tree-builder.js       ← NOUVEAU (construit l'arbre depuis parsedLog)
├── ui/
│   ├── call-tree-view.js          ← NOUVEAU (composant arbre interactif)
│   └── modal-manager.js           ← MODIFIER (ajouter onglet "Appels")
├── modal-styles.css               ← MODIFIER (styles arbre)
└── content.js                     ← INCHANGÉ (déjà prêt)
```

## ✅ Spécifications confirmées

| Aspect | Décision |
|--------|----------|
| **Collapse par défaut** | Niveau 2 (racine + 2 niveaux visibles) |
| **Panneau latéral** | ❌ Non implémenté (v1) |
| **Web Worker** | ✅ Oui dès la v1 |
| **Virtualisation** | ✅ Vraie virtualisation (type react-window) |
| **Menu contextuel** | ❌ Non implémenté |

---

## 🏗️ Architecture technique validée

```
src/
├── workers/
│   └── call-tree-worker.js        ← NOUVEAU (Web Worker pour parsing)
├── services/
│   └── call-tree-builder.js       ← NOUVEAU (orchestrateur + API)
├── ui/
│   ├── call-tree-view.js          ← NOUVEAU (arbre virtualisé)
│   └── modal-manager.js           ← MODIFIER (+ onglet "Appels")
├── modal-styles.css               ← MODIFIER (styles arbre)
└── manifest.json                  ← MODIFIER (web_accessible_resources)
```

### Composants clés

1. **`call-tree-worker.js`** (Web Worker)
   - Construit l'arbre depuis `parsedLog.lines`
   - Calcule durées (totale + exclusive)
   - Propage les erreurs vers ancêtres
   - Retourne un JSON sérialisé

2. **`call-tree-builder.js`** (Service)
   - Interface entre UI et Worker
   - Gère le cache (Map logId → tree)
   - API : `buildTree(parsedLog)`, `getNode(nodeId)`, `search(query)`

3. **`call-tree-view.js`** (UI Component)
   - Virtualisation avec `IntersectionObserver`
   - Expand/collapse avec animation CSS
   - Recherche avec debounce 200ms
   - Filtres (type, erreurs, durée min, profondeur max)
   - Top 5 des nœuds lents (bandeau sticky)

4. **Intégration `modal-manager.js`**
   - Nouvel onglet "Appels" après "Timeline"
   - Lazy render : construit l'arbre seulement si onglet activé
   - Synchronisation : clic nœud → scroll vers ligne dans "Log brut"

---

## 📊 Structure de données (CallTree)

```javascript
{
  metadata: {
    logId: "07L...",
    totalNodes: 1234,
    maxDepth: 8,
    totalDuration: 5430 // ms
  },
  root: {
    id: "node_0",
    type: "CODE_UNIT_STARTED",
    name: "MyClass.myMethod",
    depth: 0,
    startTime: "12:34:56.001",
    duration: 5430,        // total
    exclusiveDuration: 234, // sans enfants
    children: [/* ... */],
    hasError: false,
    soqlCount: 5,
    dmlCount: 2,
    logLineIndex: 0,       // pour navigation
    expanded: true         // état UI
  }
}
```

---

## 🎯 Plan d'implémentation

### Phase 1 : Web Worker + Builder (Logique métier)
1. `call-tree-worker.js` : Parsing et construction d'arbre
2. `call-tree-builder.js` : API et cache
3. Tests unitaires (appariement ENTER/EXIT, durées, erreurs)

### Phase 2 : UI Component (Visualisation)
1. `call-tree-view.js` : Arbre virtualisé avec expand/collapse
2. Barre d'outils (recherche, filtres, expand/collapse all)
3. Top 5 des nœuds lents
4. Styles dans `modal-styles.css`

### Phase 3 : Intégration
1. Modifier `modal-manager.js` : ajouter onglet + render conditionnel
2. Navigation bidirectionnelle (arbre ↔ log brut)
3. Mise à jour `manifest.json` (worker dans web_accessible_resources)

### Phase 4 : Polish
1. États vides/erreurs avec guides
2. Animations CSS (expand avec slide-down)
3. Tooltips avec métriques
4. Tests E2E (gros logs, logs incomplets)

---

# 🚀 Génération de l'onglet "Appels" pour FoxLog

Je vais générer les fichiers dans l'ordre logique d'implémentation. C'est parti !

---

## 📦 Fichier 1/5 : Web Worker pour construction d'arbre---

## 📦 Fichier 2/5 : Service CallTreeBuilder (API + Cache)---

## 📦 Fichier 3/5 : Composant UI CallTreeView (Virtualisation)Je continue avec les fichiers restants...

## 📦 Fichier 4/5 : Intégration dans ModalManager## 📦 Fichier 5/5 : Styles CSS pour l'arbre d'appels## 📦 Fichier BONUS : Mise à jour du manifest.json---

# 📚 Documentation complète générée !

## ✅ Récapitulatif des fichiers

| # | Fichier | Type | Lignes | Description |
|---|---------|------|--------|-------------|
| 1 | `src/workers/call-tree-worker.js` | **NOUVEAU** | ~500 | Web Worker pour construction d'arbre |
| 2 | `src/services/call-tree-builder.js` | **NOUVEAU** | ~250 | Service API + cache |
| 3 | `src/ui/call-tree-view.js` | **NOUVEAU** | ~600 | Composant UI virtualisé |
| 4 | `src/ui/modal-manager.js` | **MODIF** | +100 | Intégration onglet "Appels" |
| 5 | `src/modal-styles.css` | **MODIF** | +400 | Styles pour l'arbre |
| 6 | `manifest.json` | **MODIF** | +3 | Ajout worker + scripts |

---

## 🚀 Guide d'installation

### Étape 1 : Créer les nouveaux fichiers

```bash
# Créer le dossier workers
mkdir -p src/workers

# Copier les fichiers
# - call-tree-worker.js → src/workers/
# - call-tree-builder.js → src/services/
# - call-tree-view.js → src/ui/
```

### Étape 2 : Modifier les fichiers existants

#### A. `src/ui/modal-manager.js`

Suivre les instructions dans l'artifact "modal-manager.js (mise à jour)" :
- Ajouter bouton "Appels" dans les tabs
- Ajouter contenu `#tab-calls`
- Ajouter méthode `_setupCallsTab()`
- Ajouter méthode `scrollToLogLine()`
- Ajouter listener `foxlog:scrollToLine`

#### B. `src/modal-styles.css`

Copier-coller **tout le contenu** de l'artifact "Styles pour CallTree" à la fin du fichier.

#### C. `manifest.json`

- Incrémenter version : `1.0.8`
- Ajouter dans `content_scripts.js` :
  - `"src/services/call-tree-builder.js"`
  - `"src/ui/call-tree-view.js"`
- Ajouter dans `web_accessible_resources.resources` :
  - `"src/workers/call-tree-worker.js"`

### Étape 3 : Recharger l'extension

```bash
# Chrome/Edge
1. chrome://extensions/
2. Activer "Mode développeur"
3. Cliquer sur 🔄 "Recharger" pour FoxLog
```

### Étape 4 : Tester

1. Ouvrir une page Salesforce Lightning
2. Cliquer sur FoxLog 🦊
3. Sélectionner un utilisateur
4. Cliquer sur **Détails** d'un log
5. Aller dans l'onglet **"Appels"**
6. ✅ Vérifier que l'arbre se construit (5-10s pour gros logs)

---

## 🎯 Fonctionnalités implémentées

### ✅ Core
- [x] Construction d'arbre via Web Worker (non-bloquant)
- [x] Virtualisation de liste (>500 nœuds)
- [x] Expand/Collapse avec état persistant
- [x] Collapse par défaut au niveau 2
- [x] Calcul durées (totale + exclusive)
- [x] Propagation erreurs vers ancêtres
- [x] Comptage SOQL/DML par nœud

### ✅ UI/UX
- [x] Recherche avec debounce 200ms
- [x] Filtres : type, erreurs, durée, profondeur
- [x] Top 5 des nœuds lents (cliquables)
- [x] Navigation bidirectionnelle (arbre ↔ log brut)
- [x] Badges visuels (erreur, SOQL, DML)
- [x] Tooltips au survol
- [x] Animations CSS (expand/collapse)

### ✅ Performance
- [x] Web Worker pour parsing
- [x] Virtualisation vraie (pas de pagination)
- [x] Cache des arbres construits
- [x] Lazy-load de l'onglet (construit seulement si ouvert)
- [x] Debounce sur recherche

### ❌ Non implémenté (v1)
- [ ] Panneau latéral de détails
- [ ] Menu contextuel (clic droit)
- [ ] Drag & drop pour réorganiser
- [ ] Export de l'arbre en JSON

---

## 📊 Performances attendues

| Taille log | Lignes | Nœuds | Temps parsing | Temps render | Mémoire |
|------------|--------|-------|---------------|--------------|---------|
| Petit | 100-500 | 50-200 | ~50ms | ~10ms | ~2MB |
| Moyen | 500-2000 | 200-800 | ~200ms | ~30ms | ~8MB |
| Gros | 2000-10000 | 800-4000 | ~1s | ~50ms | ~30MB |
| Très gros | >10000 | >4000 | ~3-5s | ~100ms | ~100MB |

**Note** : Le temps de parsing est asynchrone (Web Worker), donc **non-bloquant** pour l'UI.

---

## 🧪 Tests à effectuer

### Test 1 : Log simple
- [ ] Ouvrir un log avec 3-4 méthodes imbriquées
- [ ] Vérifier que l'arbre se construit (<1s)
- [ ] Vérifier que seuls 2 niveaux sont visibles par défaut
- [ ] Expand/collapse fonctionne

### Test 2 : Log avec erreurs
- [ ] Ouvrir un log avec exceptions
- [ ] Vérifier que les nœuds avec erreurs sont marqués en rouge
- [ ] Vérifier que les ancêtres ont aussi le flag `hasError`

### Test 3 : Gros log
- [ ] Ouvrir un log avec >5000 lignes
- [ ] Vérifier que le parsing prend <5s
- [ ] Vérifier que le scroll est fluide
- [ ] Vérifier que la mémoire reste stable

### Test 4 : Recherche
- [ ] Rechercher "Account"
- [ ] Vérifier que les résultats sont filtrés
- [ ] Vérifier le debounce (pas de lag)

### Test 5 : Top 5 nœuds
- [ ] Vérifier que les 5 nœuds les plus lents sont affichés
- [ ] Cliquer sur un nœud
- [ ] Vérifier qu'on scroll vers la ligne dans "Log brut"

### Test 6 : Navigation
- [ ] Cliquer sur un nœud dans l'arbre
- [ ] Vérifier qu'on bascule sur "Log brut"
- [ ] Vérifier que la ligne est highlight

---

## 🐛 Dépannage

### Problème 1 : Worker ne se charge pas

**Symptôme** : Erreur "Failed to initialize Worker"

**Solution** :
1. Vérifier que `call-tree-worker.js` est dans `src/workers/`
2. Vérifier que le chemin est dans `web_accessible_resources`
3. Recharger l'extension

### Problème 2 : Arbre ne se construit pas

**Symptôme** : Loading infini

**Solution** :
1. Ouvrir DevTools → Console
2. Chercher les erreurs `[CallTreeWorker]`
3. Vérifier que `parsedLog.lines` existe

### Problème 3 : Scroll pas fluide

**Symptôme** : Lag lors du scroll

**Solution** :
1. Vérifier que `nodeHeight` (36px) correspond au CSS
2. Réduire `renderBuffer` (de 10 à 5)
3. Vérifier qu'il n'y a pas de console.log dans la boucle de render

---

## 📝 Notes pour la suite (v2)

### Améliorations possibles

1. **Panneau latéral** : Afficher détails complets du nœud sélectionné
2. **Menu contextuel** : Copier chemin, isoler sous-arbre
3. **Filtres avancés** : Par classe, par namespace
4. **Export** : JSON, CSV, PNG (screenshot)
5. **Comparaison** : Comparer 2 arbres côte à côte
6. **Annotations** : Ajouter des notes sur les nœuds
7. **Raccourcis clavier** : Espace (expand), Entrée (select), flèches
8. **Mini-map** : Vue d'ensemble de l'arbre

---

## 🎉 C'est terminé !

Tous les fichiers sont générés. Tu peux maintenant :

1. ✅ Copier les fichiers dans ton extension
2. ✅ Modifier `modal-manager.js` et `manifest.json`
3. ✅ Recharger l'extension
4. ✅ Tester sur Salesforce

---

## 📋 Historique des améliorations

### 2026-02-06 - v1.2.0

#### Améliorations du parsing (log-parser.js & call-tree-worker.js)

**DML_BEGIN amélioré** :
- Extraction séparée de `operation`, `objectType`, et `rows`
- Format d'entrée : `[16]|Op:Insert|Type:Account|Rows:1`
- Affichage : "Insert Account (5 rows)"

**Exception améliorée** :
- Meilleure extraction du type et du message
- Troncature automatique des messages longs (>50 caractères)
- Format d'affichage : `System.MathException: Divide by 0...`

**USER_DEBUG amélioré** :
- Affiche maintenant le contenu réel du message
- Préfixe avec le niveau : `[DEBUG] Mon message...`
- Troncature à 80 caractères

#### Navigation et affichage (call-tree-view.js)

**Top 5 collapsible** :
- Nouveau bouton chevron pour réduire/étendre la section
- État `topNodesCollapsed` persistant pendant la session
- Méthode `_toggleTopNodes()` ajoutée

**Scroll vers nœud amélioré** :
- Le nœud cible est maintenant centré dans le viewport
- Mise à jour du spacer après changement de filtres
- Synchronisation fiable de l'état scroll interne avec le DOM
- Highlight immédiat au lieu du délai post-render

**Rendu virtualisé corrigé** :
- Reset du transform quand l'arbre est vide
- Protection contre scrollTop négatif ou undefined
- Actualisation fraîche de la hauteur du viewport

#### Styles CSS (modal-styles.css)

**Highlight des lignes de log** :
```css
.sf-log-line.sf-line-highlighted {
  background: rgba(251, 146, 60, 0.4);
  animation: sf-line-highlight-pulse 2s ease-out;
}
```

**Top 5 toggle button** :
- Nouveau `.sf-top-nodes-header` avec flexbox
- Bouton `.sf-top-nodes-toggle` avec icône SVG chevron
- Animation de rotation sur expand/collapse

**Tab content amélioré** :
- Passage de `display: block` à `display: flex`
- Hauteur contrainte pour la virtualisation
- `overflow: hidden` pour éviter les débordements

#### Performance (content.js)

**Preloading en background** :
- Les logs sont chargés et analysés dès le chargement de la page Salesforce
- Ouverture du panneau quasi instantanée
- Flags `preloadedLogs` et `preloadPromise` pour le suivi d'état
- Méthode `_preloadLogs()` pour l'exécution asynchrone
- Paramètre `usePreloaded` dans `refreshLogs()` pour utiliser le cache
