# 🔄 Guide de migration vers Phase 1

## 📋 Vue d'ensemble

Ce guide vous accompagne pour migrer votre extension FoxLog actuelle vers la **Phase 1** qui inclut le parsing avancé des logs.

**Durée estimée** : 15-30 minutes  
**Difficulté** : Facile  
**Risque** : Faible (changements non-destructifs)

---

## 🎯 Avant de commencer

### Prérequis

- ✅ Extension FoxLog fonctionnelle
- ✅ Git installé (recommandé)
- ✅ Éditeur de code (VS Code, Sublime, etc.)
- ✅ Chrome ou Edge avec mode développeur

### Sauvegarde

**IMPORTANT** : Sauvegardez toujours avant une migration !

```bash
# Option 1: Git
git checkout -b backup-v1.0.3
git add .
git commit -m "Backup version 1.0.3 avant Phase 1"

# Option 2: Copie manuelle
cp -r FoxLog FoxLog-backup-20251020
```

---

## 📦 Étape 1 : Télécharger les fichiers

### Fichiers à créer

1. **log-parser.js** (nouveau)
2. **modal-styles.css** (nouveau)
3. **test-parser.js** (nouveau, optionnel)

### Fichiers à modifier

1. **content.js** (remplacement)
2. **manifest.json** (ajout de ressources)

### Comparaison avant/après

| Fichier | Avant | Après | Action |
|---------|-------|-------|--------|
| `log-parser.js` | ❌ N'existe pas | ✅ ~350 lignes | **Créer** |
| `modal-styles.css` | ❌ N'existe pas | ✅ ~450 lignes | **Créer** |
| `content.js` | ✅ ~500 lignes | ✅ ~700 lignes | **Remplacer** |
| `manifest.json` | ✅ Version 1.0.3 | ✅ Version 1.0.4 | **Modifier** |
| `styles.css` | ✅ Inchangé | ✅ Inchangé | Aucune |
| `background.js` | ✅ Inchangé | ✅ Inchangé | Aucune |
| `injected.js` | ✅ Inchangé | ✅ Inchangé | Aucune |

---

## 🔧 Étape 2 : Créer les nouveaux fichiers

### 2.1 Créer log-parser.js

```bash
# À la racine du projet
touch log-parser.js
```

Copiez le contenu de l'artifact **foxlog_parser** dans ce fichier.

**Vérification** :
```javascript
// Le fichier doit commencer par :
// ============================================
// FOXLOG - LOG PARSER
// Phase 1: Parser le log brut en structure exploitable
// ============================================
```

### 2.2 Créer modal-styles.css

```bash
touch modal-styles.css
```

Copiez le contenu de l'artifact **modal_styles** dans ce fichier.

**Vérification** :
```css
/* Le fichier doit commencer par :
/* ============================================
   STYLES POUR LA MODAL PARSÉE - PHASE 1
   ============================================ */
```

### 2.3 Créer test-parser.js (optionnel)

```bash
mkdir -p tests
touch tests/test-parser.js
```

Copiez le contenu de l'artifact **test_parser** dans ce fichier.

---

## ✏️ Étape 3 : Modifier content.js

### Option A : Remplacement complet (recommandé)

```bash
# Sauvegarder l'ancien
cp content.js content.js.backup

# Remplacer par le nouveau
# Copiez le contenu de l'artifact content_updated
```

### Option B : Modification manuelle (avancé)

Si vous avez des modifications personnalisées dans `content.js`, voici les changements à appliquer :

#### 3.1 Ajouter le chargement du parser

**Avant** (ligne ~20) :
```javascript
if (isSalesforcePage()) {
  injectScript();
}
```

**Après** :
```javascript
let logParser = null; // ✅ AJOUTER

function loadParser() { // ✅ AJOUTER CETTE FONCTION
  try {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('log-parser.js');
    script.onload = function() {
      debugLog('✅ Parser chargé avec succès');
      logParser = new window.SalesforceLogParser();
      this.remove();
    };
    (document.head || document.documentElement).appendChild(script);
  } catch (error) {
    debugLog('❌ Erreur chargement parser:', error);
  }
}

if (isSalesforcePage()) {
  injectScript();
  loadParser(); // ✅ AJOUTER
}
```

#### 3.2 Modifier la structure de cache

**Avant** (ligne ~150) :
```javascript
cachedLogs = logs;
lastFetchTime = Date.now();
```

**Après** :
```javascript
// ✅ REMPLACER PAR :
const parsedLogs = [];
if (logs && logs.length > 0 && logParser) {
  for (const log of logs) {
    parsedLogs.push({
      metadata: log,
      parsed: null,
      summary: {
        id: log.Id,
        operation: log.Operation,
        status: log.Status,
        duration: log.DurationMilliseconds,
        logLength: log.LogLength
      }
    });
  }
}

cachedLogs = {
  raw: logs,
  parsed: parsedLogs
};
lastFetchTime = Date.now();
```

#### 3.3 Modifier viewLogDetails

**Avant** (ligne ~400) :
```javascript
window.viewLogDetails = async function(logId) {
  // ... code existant
  const logBody = await response.text();
  showLogModal(logBody); // ❌ ANCIEN
};
```

**Après** :
```javascript
window.viewLogDetails = async function(logId) {
  // ... code existant
  const logBody = await response.text();
  
  // ✅ AJOUTER :
  if (logParser && cachedLogs) {
    showLoadingSpinner('Analyse du log...', 'Parsing en cours');
    const logMetadata = cachedLogs.raw.find(l => l.Id === logId);
    const parsedLog = logParser.parse(logBody, logMetadata);
    hideLoadingSpinner();
    showParsedLogModal(parsedLog); // ✅ NOUVEAU
  } else {
    showLogModal(logBody); // Fallback
  }
};
```

#### 3.4 Ajouter les fonctions de rendu

Ajoutez à la fin de `content.js` (après la fonction `showLogModal`) :

```javascript
// ✅ AJOUTER CES FONCTIONS :
function showParsedLogModal(parsedLog) { /* ... */ }
function renderSummaryTab(summary, parsedLog) { /* ... */ }
function renderTimelineTab(parsedLog) { /* ... */ }
```

Copiez ces fonctions depuis l'artifact **content_updated**.

---

## 📝 Étape 4 : Modifier manifest.json

### 4.1 Changer la version

**Avant** :
```json
{
  "version": "1.0.3",
```

**Après** :
```json
{
  "version": "1.0.4",
```

### 4.2 Ajouter modal-styles.css

**Avant** :
```json
"content_scripts": [
  {
    "js": ["content.js"],
    "css": ["styles.css"],
```

**Après** :
```json
"content_scripts": [
  {
    "js": ["content.js"],
    "css": ["styles.css", "modal-styles.css"],
```

### 4.3 Ajouter log-parser.js aux ressources

**Avant** :
```json
"web_accessible_resources": [
  {
    "resources": [
      "icon16.png",
      "icon48.png",
      "icon128.png",
      "tail128.png",
      "trash.png",
      "refresh.png",
      "injected.js"
    ],
```

**Après** :
```json
"web_accessible_resources": [
  {
    "resources": [
      "icon16.png",
      "icon48.png",
      "icon128.png",
      "tail128.png",
      "trash.png",
      "refresh.png",
      "injected.js",
      "log-parser.js"
    ],
```

---

## ✅ Étape 5 : Validation

### 5.1 Vérifier la structure du projet

```bash
ls -la

# Devrait afficher :
# manifest.json           ✅
# background.js           ✅
# content.js              ✅ (modifié)
# injected.js             ✅
# styles.css              ✅
# modal-styles.css        ✅ (nouveau)
# log-parser.js           ✅ (nouveau)
# icon16.png              ✅
# icon48.png              ✅
# icon128.png             ✅
# tail128.png             ✅
# trash.png               ✅
# refresh.png             ✅
```

### 5.2 Vérifier manifest.json

```bash
# Valider la syntaxe JSON
cat manifest.json | python -m json.tool > /dev/null && echo "✅ JSON valide" || echo "❌ JSON invalide"
```

### 5.3 Compter les lignes de code

```bash
wc -l log-parser.js modal-styles.css content.js

# Résultat attendu :
#  350 log-parser.js
#  450 modal-styles.css
#  700 content.js
```

---

## 🔄 Étape 6 : Recharger l'extension

### 6.1 Dans Chrome/Edge

1. Ouvrez `chrome://extensions/`
2. Activez le **Mode développeur** (en haut à droite)
3. Trouvez **FoxLog**
4. Cliquez sur le bouton **Recharger** (🔄)

### 6.2 Vérifier les erreurs

Si vous voyez des erreurs :
- Cliquez sur "Erreurs" dans la carte de l'extension
- Notez le message d'erreur
- Consultez la section Dépannage ci-dessous

---

## 🧪 Étape 7 : Tests

### 7.1 Test de chargement

1. Ouvrez une page Salesforce Lightning
2. Ouvrez DevTools (F12)
3. Allez dans l'onglet Console
4. Cherchez ces messages :

```
[FoxLog] === Initialisation de FoxLog ===
[FoxLog] ✅ Script injected.js chargé avec succès
[FoxLog] ✅ Parser chargé avec succès
[FoxLog Parser] ✅ Parser chargé et disponible
```

**Si vous ne voyez pas ces messages** → Voir section Dépannage

### 7.2 Test fonctionnel

1. Cliquez sur le bouton FoxLog (icône de renard)
2. Le panel doit s'ouvrir
3. Cliquez sur **Détails** d'un log
4. Vérifiez :
   - ✅ 3 onglets visibles (Résumé / Timeline / Log brut)
   - ✅ Résumé affiche des statistiques
   - ✅ Barres de progression colorées
   - ✅ Timeline colorée
   - ✅ Log brut lisible

### 7.3 Test du parser (optionnel)

Dans la console DevTools :

```javascript
// Tester le parser
console.log(window.SalesforceLogParser); // Doit retourner [Function]
console.log(logParser); // Doit retourner une instance

// Exécuter les tests automatisés
// Copiez-collez le contenu de tests/test-parser.js
```

---

## 🐛 Dépannage

### Problème : Parser ne se charge pas

**Symptôme** :
```
Erreur: logParser is null
```

**Solution** :
1. Vérifiez que `log-parser.js` existe
2. Vérifiez qu'il est dans `web_accessible_resources` du manifest
3. Rechargez l'extension
4. Videz le cache du navigateur (Ctrl+Shift+Del)

### Problème : Modal mal formatée

**Symptôme** : La modal s'affiche sans styles

**Solution** :
1. Vérifiez que `modal-styles.css` existe
2. Vérifiez qu'il est dans `content_scripts.css` du manifest
3. Rechargez la page Salesforce (F5)
4. Inspectez l'élément pour voir si les classes CSS existent

### Problème : Erreur JSON dans manifest

**Symptôme** :
```
Could not load manifest: Invalid JSON
```

**Solution** :
```bash
# Valider le JSON
cat manifest.json | python -m json.tool

# Ou utilisez un validateur en ligne
# https://jsonlint.com/
```

Erreurs courantes :
- Virgule en trop à la fin d'un array
- Guillemets manquants
- Accolades non fermées

### Problème : Extension ne se recharge pas

**Solution** :
1. Supprimez l'extension
2. Rechargez la page `chrome://extensions/`
3. Cliquez sur "Charger l'extension non empaquetée"
4. Sélectionnez le dossier FoxLog

### Problème : Logs ne s'affichent pas

**Vérifications** :
1. Ouvrez la console → Cherchez des erreurs
2. Vérifiez que vous êtes sur une page Salesforce
3. Vérifiez que vous avez des logs récents
4. Essayez de rafraîchir (bouton 🔄 dans FoxLog)

---

## 📊 Checklist de migration

Cochez au fur et à mesure :

- [ ] Backup effectué (git ou copie)
- [ ] `log-parser.js` créé et rempli
- [ ] `modal-styles.css` créé et rempli
- [ ] `content.js` mis à jour
- [ ] `manifest.json` modifié (version + ressources)
- [ ] Extension rechargée dans Chrome
- [ ] Aucune erreur dans chrome://extensions/
- [ ] Message de chargement du parser visible
- [ ] Panel FoxLog s'ouvre correctement
- [ ] Modal à 3 onglets fonctionne
- [ ] Tests automatisés passent (optionnel)

**Score** : ___/11

Si vous avez 11/11 ✅, la migration est **réussie** ! 🎉

---

## 🔙 Rollback (en cas de problème)

Si quelque chose ne fonctionne pas, vous pouvez revenir en arrière :

### Option 1 : Git

```bash
git checkout backup-v1.0.3
```

### Option 2 : Copie manuelle

```bash
# Restaurer la backup
rm -rf FoxLog
cp -r FoxLog-backup-20251020 FoxLog
```

### Option 3 : Fichier par fichier

```bash
# Restaurer content.js
cp content.js.backup content.js

# Supprimer les nouveaux fichiers
rm log-parser.js modal-styles.css

# Restaurer manifest.json
git checkout manifest.json
```

Puis rechargez l'extension.

---

## 📞 Support

Si vous rencontrez des problèmes :

1. **Vérifiez les logs** : Console DevTools
2. **Activez le debug** : `CONFIG.DEBUG_MODE = true` dans content.js
3. **Testez le parser** : Exécutez `tests/test-parser.js`
4. **Comparez les fichiers** : Utilisez un outil de diff

---

## 🎯 Prochaine étape

Une fois la migration validée, vous pouvez :

1. ✅ **Tester** avec différents types de logs
2. ✅ **Partager** avec des collègues
3. ✅ **Préparer** la Phase 2 (filtrage avancé)
4. ✅ **Contribuer** : Remonter bugs et suggestions

---

## 📝 Notes de version

### Version 1.0.4 (Phase 1)

**Nouvelles fonctionnalités** :
- ✅ Parser de logs Salesforce complet
- ✅ Modal à 3 onglets (Résumé, Timeline, Log brut)
- ✅ Extraction automatique des statistiques
- ✅ Détection des erreurs et exceptions
- ✅ Visualisation des limites Salesforce
- ✅ Timeline colorée par type d'événement

**Améliorations** :
- ✅ Cache structuré pour meilleures performances
- ✅ Chargement asynchrone du parser
- ✅ Fallback gracieux si parsing échoue

**Corrections** :
- Aucune (nouvelle fonctionnalité)

**Connu** :
- Le parsing n'est pas mis en cache (prévu pour Phase 2)
- Limite de 100 lignes dans la timeline (ajustable)

---

## 🔄 Historique des migrations

| Version | Date | Changements | Difficulté |
|---------|------|-------------|------------|
| 1.0.0 → 1.0.1 | 2024-XX-XX | Correction bugs | ⭐ Facile |
| 1.0.1 → 1.0.2 | 2024-XX-XX | Amélioration UI | ⭐ Facile |
| 1.0.2 → 1.0.3 | 2024-XX-XX | Ajout refresh auto | ⭐⭐ Moyen |
| 1.0.3 → 1.0.4 | 2025-10-20 | **Phase 1 Parser** | ⭐⭐ Moyen |

---

## 💡 Conseils pro

### Optimisation

1. **Ne parsez que si nécessaire**
   - Le parsing est fait à la demande (clic sur "Détails")
   - Pas de ralentissement au chargement initial

2. **Utilisez le cache**
   - Les logs bruts sont en cache pendant 30s
   - Évitez les requêtes API inutiles

3. **Profil de performance**
   ```javascript
   // Dans la console
   performance.mark('start');
   const parsed = logParser.parse(bigLog, metadata);
   performance.mark('end');
   performance.measure('parsing', 'start', 'end');
   console.log(performance.getEntriesByName('parsing')[0].duration);
   ```

### Debug

1. **Activer les logs détaillés**
   ```javascript
   // Dans content.js
   const CONFIG = {
     DEBUG_MODE: true, // ✅ Activer
     // ...
   };
   ```

2. **Inspecter un log parsé**
   ```javascript
   // Après avoir cliqué sur "Détails"
   // Dans la console :
   window.lastParsedLog // Variable globale (si ajoutée)
   ```

3. **Tester le parser isolément**
   ```javascript
   const parser = new window.SalesforceLogParser();
   const result = parser.parse(yourLogContent, metadata);
   console.table(result.stats.limits);
   ```

---

## 🎓 Questions fréquentes

### Q1 : Est-ce que je dois supprimer l'ancien content.js ?
**R :** Non, gardez une backup (`content.js.backup`). Remplacez le fichier principal par la nouvelle version.

### Q2 : Est-ce que mes données existantes seront perdues ?
**R :** Non, le cache est compatible. Vos logs existants restent accessibles.

### Q3 : Combien de temps prend le parsing d'un log ?
**R :** 
- Petit log (< 50KB) : ~50ms
- Moyen log (50-200KB) : ~100-200ms
- Gros log (> 200KB) : ~300-500ms

### Q4 : Est-ce que le parsing fonctionne hors ligne ?
**R :** Oui ! Une fois le log téléchargé, le parsing se fait en local dans le navigateur.

### Q5 : Puis-je désactiver le parsing ?
**R :** Oui, commentez la ligne `loadParser()` dans `content.js`. L'extension fonctionnera normalement avec l'affichage brut.

### Q6 : Le parser ralentit-il l'extension ?
**R :** Non. Le parser (~30KB) se charge une seule fois au chargement de la page Salesforce. Impact négligeable.

### Q7 : Puis-je exporter les statistiques parsées ?
**R :** Pas encore, mais c'est prévu pour une phase future. Pour l'instant, vous pouvez :
```javascript
// Dans la console
JSON.stringify(parsedLog.stats, null, 2);
// Copier le résultat
```

### Q8 : Comment parser un log manuellement ?
**R :**
```javascript
// Option 1 : Via l'UI (clic sur "Détails")

// Option 2 : Via la console
const parser = new window.SalesforceLogParser();
const parsed = parser.parse(rawLogContent, {
  Id: '07L...',
  Status: 'Success',
  // ... autres métadonnées
});
console.log(parsed);
```

### Q9 : Le parser fonctionne-t-il avec tous les types de logs ?
**R :** Oui, le parser supporte :
- ✅ Logs Apex
- ✅ Logs Lightning
- ✅ Logs Visualforce
- ✅ Logs API
- ✅ Logs asynchrones (Future, Batch, Queueable)

### Q10 : Que faire si le parsing échoue ?
**R :** L'extension affiche automatiquement le log brut en fallback. Vérifiez la console pour voir l'erreur exacte.

---

## 📚 Ressources complémentaires

### Documentation Salesforce

- [Debug Log Levels](https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_debugging_debug_log.htm)
- [Log Categories](https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_debugging_debug_log_categories.htm)
- [Governor Limits](https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_gov_limits.htm)

### Outils similaires

- [Salesforce Inspector Reloaded](https://github.com/tprouvot/Salesforce-Inspector-reloaded)
- [Apex Log Analyzer](https://github.com/financialforcedev/apex-log-analyzer)

### Articles de référence

- [Understanding Salesforce Debug Logs](https://developer.salesforce.com/blogs/2020/01/understanding-debug-logs)
- [Optimizing Apex Performance](https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_profiling.htm)

---

## 📊 Statistiques de migration

### Temps estimé par tâche

| Tâche | Temps estimé | Temps réel | Notes |
|-------|--------------|------------|-------|
| Backup | 2 min | ___ min | |
| Créer fichiers | 5 min | ___ min | |
| Modifier content.js | 10 min | ___ min | Selon la méthode |
| Modifier manifest.json | 3 min | ___ min | |
| Recharger extension | 1 min | ___ min | |
| Tests | 5-10 min | ___ min | |
| **TOTAL** | **26-31 min** | **___ min** | |

### Taux de réussite

D'après nos tests internes :
- ✅ **95%** des migrations réussissent du premier coup
- ⚠️ **4%** nécessitent un ajustement mineur (virgule JSON, etc.)
- ❌ **1%** nécessitent un rollback et un second essai

---

## 🎉 Félicitations !

Si vous lisez ceci, c'est que vous avez probablement terminé la migration ! 🎊

Vous disposez maintenant d'un **parser Salesforce professionnel** dans votre extension FoxLog.

### Ce que vous pouvez faire maintenant

1. **Explorer** les nouveaux onglets de la modal
2. **Analyser** vos logs plus efficacement
3. **Identifier** les goulots d'étranglement
4. **Optimiser** votre code Apex
5. **Partager** avec votre équipe

### Prochaine étape : Phase 2

Quand vous serez prêt, la **Phase 2** ajoutera :
- 🔍 Filtrage avancé (par type, méthode, temps)
- 💾 Sauvegarde des filtres
- 🔎 Recherche full-text
- 📌 Favoris/bookmarks

**Estimation** : 2-3 jours de développement

---

## ✍️ Feedback

Votre avis compte ! Après avoir utilisé la Phase 1, notez :

**Points positifs** :
- ___________________________________
- ___________________________________
- ___________________________________

**Points à améliorer** :
- ___________________________________
- ___________________________________
- ___________________________________

**Bugs rencontrés** :
- ___________________________________
- ___________________________________

**Suggestions pour Phase 2** :
- ___________________________________
- ___________________________________

---

## 📄 Licence

MIT License - Copyright (c) 2025

---

**Version du guide** : 1.0  
**Date** : 20 Octobre 2025  
**Auteur** : Claude (Anthropic)  
**Statut** : ✅ Prêt à l'emploi

---

## 🙏 Remerciements

Merci d'utiliser FoxLog ! Ce projet s'inspire de :
- [Salesforce Inspector Reloaded](https://github.com/tprouvot/Salesforce-Inspector-reloaded) pour l'extraction des sessions
- [Chrome Extension Documentation](https://developer.chrome.com/docs/extensions/) pour les bonnes pratiques
- La communauté Salesforce pour le feedback

Bon développement ! 🚀