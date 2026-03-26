# 🦊 FoxLog - Code Review & Freemium Strategy

**Date :** 26 mars 2026  
**Version analysée :** 1.3.1  
**Revieweur :** GitHub Copilot (Claude Opus 4.6)

---

## Table des matières

1. [Résumé exécutif](#-résumé-exécutif)
2. [Code Review](#-code-review)
   - [Architecture globale](#architecture-globale)
   - [Qualité du code](#qualité-du-code)
   - [Sécurité](#sécurité)
   - [Performance](#performance)
   - [Maintenabilité](#maintenabilité)
   - [Problèmes identifiés](#problèmes-identifiés)

---

## 📋 Résumé exécutif

FoxLog est une extension Chrome Manifest V3 bien structurée pour l'analyse de logs Salesforce. Le code est globalement propre, suit des conventions cohérentes et offre déjà un ensemble de features solide. L'architecture IIFE avec namespace global est adaptée au contexte d'une extension Chrome sans bundler.

**Score global : 7.5/10**

| Critère | Score | Commentaire |
|---------|-------|-------------|
| Architecture | 8/10 | Bonne séparation des responsabilités, namespace cohérent |
| Qualité du code | 7/10 | Lisible, bien documenté, quelques incohérences |
| Sécurité | 6/10 | Vulnérabilités d'injection, session ID en mémoire |
| Performance | 8/10 | Web Worker, cache, preloading intelligent |
| Maintenabilité | 7/10 | i18n bien pensé, mais fichier modal-manager trop gros |
| Tests | 5/10 | Tests manuels uniquement, pas de framework de test |

---

## 🔍 Code Review

### Architecture globale

**Points forts :**
- Séparation claire en `core/`, `services/`, `ui/`, `parsers/`, `workers/`
- Pattern IIFE cohérent avec namespace `window.FoxLog`
- Web Worker pour la construction du call tree (évite le blocage UI)
- Système de cache avec TTL dans `cache-manager.js`
- Service API centralisé (`salesforce-api.js`) — bon pattern pour la maintenance
- Preloading des logs au chargement de la page

**Points à améliorer :**
- `modal-manager.js` fait **1829 lignes** — devrait être découpé en sous-composants (export, navigation, tabs, rendering)
- `call-tree-view.js` fait **1103 lignes** — même recommandation
- `content.js` fait **776 lignes** et mélange orchestration, UI (bouton flottant + drag), et logique métier
- Pas de gestion d'état centralisée — l'état est dispersé entre `content.js`, `panel-manager.js` et `modal-manager.js`

### Qualité du code

#### ✅ Bonnes pratiques respectées

- JSDoc présent sur la plupart des méthodes publiques
- i18n bien implémenté avec support FR/EN
- Logger dédié avec niveaux configurables
- `'use strict'` systématique
- Gestion d'erreurs avec try/catch dans les parties critiques
- Conventions de nommage cohérentes

#### ⚠️ Incohérences et problèmes

**1. Duplication du logger (Critique)**

Le logger est dupliqué **3 fois** avec une implémentation identique :
- `src/core/logger.js` — Logger principal (classe complète)
- `src/background.js` — Logger local copié-collé
- `src/injected.js` — Logger local copié-collé
- `src/workers/call-tree-worker.js` — Logger local copié-collé

Tous utilisent le préfixe `[FoxLog BG]` même dans `injected.js` et le worker — copier-coller évident.

> **Recommandation :** Extraire un module logger partagé, ou au minimum corriger les préfixes.

**2. Accès aux dépendances incohérent**

Certains fichiers utilisent la destructuration à l'initialisation :
```javascript
// session-manager.js
const { logger, cache } = window.FoxLog;
```
D'autres utilisent des fonctions getter :
```javascript
// salesforce-api.js
const getLogger = () => window.FoxLog.logger || console;
```
D'autres encore utilisent l'accès direct :
```javascript
// panel-manager.js
const logger = window.FoxLog.logger || console;
```

L'approche getter est la plus robuste (résout les problèmes d'ordre de chargement). L'approche destructuration dans `session-manager.js` peut échouer si le logger n'est pas encore chargé.

> **Recommandation :** Standardiser sur le pattern getter ou sur l'accès via `window.FoxLog.xxx` au moment de l'utilisation.

**3. DEBUG_MODE à true en production**

Dans `src/core/constants.js` :
```javascript
DEBUG_MODE: true,           // Enable/disable all logs
ENABLE_SUCCESS_LOGS: true,  // Show success messages (✅)
```

Le commentaire dit "Set to false before publishing to production" — ceci devrait être automatisé ou inversé par défaut.

> **Recommandation :** Mettre `DEBUG_MODE: false` par défaut et utiliser un mécanisme de build ou chrome.storage pour l'activer.

**4. Référence i18n non lazy**

Les constantes i18n sont résolues au chargement du module :
```javascript
const isFrench = browserLang.startsWith('fr');
```
Si la langue change (rare mais possible), les textes ne sont pas mis à jour sans rechargement.

**5. Propriétés dupliquées dans i18n**

```javascript
exportMd: isFrench ? 'Exporter (.md)' : 'Export (.md)',   // ligne ~137
exportMd: isFrench ? 'MD' : 'MD',                          // ligne ~183
exportSuccess: isFrench ? 'Exporté avec succès !' : '...'  // ligne ~152
exportSuccess: isFrench ? 'Export réussi' : '...'           // ligne ~186
```

Les clés `exportMd` et `exportSuccess` sont **définies deux fois** avec des valeurs différentes — la seconde écrase la première silencieusement.

> **Recommandation :** Renommer pour distinguer les contextes (`exportMdShort`, `exportMdLabel`, etc.)

### Sécurité

**1. Injection SOQL potentielle (Haute priorité)**

Dans `salesforce-api.js`, les requêtes sont construites par concaténation :
```javascript
const query = `SELECT ... WHERE Id IN ('${userIds.join("','")}')`;
const queryCurrentUser = `SELECT Id, Name FROM User WHERE Id = '${currentUserId}'`;
```

Si `currentUserId` ou `userIds` contiennent des caractères spéciaux, cela pourrait corrompre la requête. Bien que les IDs Salesforce soient en théorie safe (alphanumériques), c'est un anti-pattern.

> **Recommandation :** Valider les IDs Salesforce avec un regex (`/^[a-zA-Z0-9]{15,18}$/`) avant insertion dans les requêtes.

**2. Session ID en mémoire**

Le session ID est stocké en cache (`cache-manager.js`) avec un TTL de 30s. C'est acceptable mais attention : en cas d'XSS sur une page Salesforce, un attaquant pourrait lire `window.FoxLog.cache`.

> **Recommandation :** Considérer le stockage du session ID uniquement dans le background script (isolation du contexte).

**3. Pas de Content Security Policy**

L'extension n'a pas de CSP explicite dans `manifest.json`. Manifest V3 en fournit une par défaut, mais une CSP explicite renforcerait la sécurité.

**4. innerHTML utilisé sans sanitization**

Multiples instances d'`innerHTML` avec du contenu dynamique :
```javascript
container.innerHTML = `<p>${message}</p>`; // Si message contient du HTML...
```

La plupart des valeurs proviennent d'i18n (safe), mais les noms d'utilisateurs Salesforce pourraient contenir du HTML.

> **Recommandation :** Utiliser `textContent` pour les valeurs dynamiques ou créer une fonction `escapeHtml()` systématique.

### Performance

**Points forts :**
- Web Worker pour le call tree — excellent choix
- Cache avec TTL pour éviter les requêtes redondantes
- Preloading des logs au chargement de page
- Spinner avec délai intelligent (`SPINNER_DELAY = 300ms`, `MIN_SPINNER_TIME = 600ms`)
- Détection de changement avant re-analyse (`_hasLogsChanged`)
- Virtualisation dans le call tree (`CallTreeView`)
- Requests en chunks de 3 dans `LogPreviewService`

**Points à améliorer :**

**1. Requêtes séquentielles dans `fetchUsersWithLogs`**

3 requêtes API sont faites séquentiellement :
1. `queryLogs` — Users avec logs
2. `queryUsers` — Noms des users
3. `queryFlag` — TraceFlags

Les requêtes 1 et 3 pourraient être parallélisées (`Promise.all`).

**2. Pas de limite de taille de cache**

`CallTreeBuilderService.cache` est un `Map` sans limite de taille. Avec beaucoup de logs consultés, la mémoire peut croître indéfiniment.

> **Recommandation :** Implémenter un LRU cache avec une taille max (ex: 10 arbres).

**3. Anti-pattern detector re-scanne tout le log**

`AntiPatternDetector.analyze()` fait 18 passes sur les lignes du log. Pour un log de 100k lignes, cela peut être coûteux.

> **Recommandation :** Fusionner certains détecteurs en une seule passe (ex: tous les checks SOQL ensemble).

**4. `_collectStats` dans le parser utilise `.find()` pour chaque METHOD_ENTRY**

```javascript
const existing = stats.methods.find(
  m => m.class === line.details.class && m.method === line.details.method
);
```

Complexité O(n²) pour les méthodes. Utiliser une Map pour O(1).

### Maintenabilité

**Points forts :**
- Structure de dossiers claire
- Les constantes sont centralisées
- Le code est largement commenté
- i18n est bien séparé

**Points à améliorer :**

**1. Fichiers trop gros**

| Fichier | Lignes | Recommandation |
|---------|--------|----------------|
| `modal-manager.js` | 1829 | Extraire `ModalExporter`, `ModalNavigation`, `ModalTabs` |
| `call-tree-view.js` | 1103 | Extraire `TreeRenderer`, `TreeToolbar`, `TreeExporter` |
| `anti-pattern-detector.js` | 974 | OK, mais chaque détecteur pourrait être une stratégie |
| `content.js` | 776 | Extraire `ButtonManager`, `LogRefreshService` |
| `panel-manager.js` | 626 | Acceptable |

**2. Pas de framework de test automatisé**

Les tests sont des scripts Apex manuels. Il n'y a pas de tests unitaires JavaScript pour le parser, le détecteur d'anti-patterns, ou le cache manager.

> **Recommandation :** Ajouter Jest ou Vitest pour tester au minimum `LogParser`, `AntiPatternDetector`, `CacheManager`.

**3. Pas de bundler/minifier**

Tous les fichiers JS sont chargés individuellement (13 scripts dans le manifest). Un bundler (Vite, Rollup) permettrait :
- Tree-shaking
- Minification
- Source maps
- Imports/exports natifs au lieu du pattern IIFE

**4. COOKIE_PRIORITY dupliqué**

La constante `COOKIE_PRIORITY` est définie dans `constants.js` ET dans `background.js` :
```javascript
// constants.js
window.FoxLog.COOKIE_PRIORITY = ['my.salesforce.com', ...];

// background.js
const COOKIE_PRIORITY = ['my.salesforce.com', ...];
```

> **Recommandation :** Le background script n'a pas accès au namespace `window.FoxLog`, donc la duplication est inévitable sans bundler. Documenter cette contrainte.

### Problèmes identifiés

#### 🔴 Critiques

| # | Problème | Fichier | Statut |
|---|----------|---------|--------|
| 1 | Clés i18n dupliquées (`exportMd`, `exportSuccess`) | `constants.js` | ✅ CORRIGÉ — Renommées en `exportMdShort`, `toastExportSuccess`, `analysisExportSuccess`, etc. |
| 2 | Injection SOQL par concaténation | `salesforce-api.js` | ✅ CORRIGÉ — `_validateId()` ajouté sur toutes les méthodes, validation regex + sanitization du `limit` |
| 3 | `DEBUG_MODE: true` en production | `constants.js` | ✅ CORRIGÉ — Mis à `false` par défaut |

#### 🟡 Warnings

| # | Problème | Fichier | Statut |
|---|----------|---------|--------|
| 4 | Logger dupliqué 3x avec mauvais préfixe `[FoxLog BG]` | `injected.js`, `worker` | ✅ CORRIGÉ — Préfixes `[FoxLog Injected]` et `[FoxLog Worker]` |
| 5 | Pas de validation des IDs Salesforce | `salesforce-api.js` | ✅ CORRIGÉ — `_isValidSalesforceId()` + `_validateId()` |
| 6 | Cache sans limite de taille | `call-tree-builder.js` | ✅ CORRIGÉ — LRU cache avec max 10 entrées |
| 7 | `innerHTML` sans sanitization | Multiples fichiers UI | ✅ CORRIGÉ — `escapeHtml()` partagé dans `constants.js`, appliqué dans `panel-manager.js` |
| 8 | `_collectStats` O(n²) sur les méthodes | `log-parser.js` | ✅ CORRIGÉ — Utilise `Map` (`methodMap`) au lieu de `.find()` |
| 9 | Requêtes API séquentielles | `salesforce-api.js` (fetchUsersWithLogs) | ✅ CORRIGÉ — Logs et TraceFlags en `Promise.allSettled` |

#### 🔵 Suggestions (non corrigées — améliorations futures)

| # | Problème | Fichier | Impact |
|---|----------|---------|--------|
| 10 | `modal-manager.js` trop gros (1829 lignes) | `modal-manager.js` | Maintenabilité |
| 11 | Pas de tests automatisés | `tests/` | Régressions possibles |
| 12 | Pas de bundler | Projet global | Taille du bundle, DX |
| 13 | Accès aux dépendances inconsistant | Multiple | Confusion |
| 14 | Pas de CSP explicite | `manifest.json` | Sécurité |

---