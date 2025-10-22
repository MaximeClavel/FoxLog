# 🚀 Guide d'installation - Phase 1

## 📋 Prérequis

- Extension FoxLog existante fonctionnelle
- Accès à une org Salesforce pour tester
- Chrome/Edge (Manifest V3)

## 📦 Fichiers à ajouter

Voici les 4 nouveaux fichiers à intégrer dans votre extension :

### 1. `log-parser.js` ✅
**Emplacement** : Racine du projet (à côté de `content.js`)

**Contenu** : Le parser complet fourni dans l'artifact `foxlog_parser`

**Description** : Cœur du système de parsing des logs Salesforce

### 2. `content.js` (mis à jour) ✅
**Emplacement** : Remplacer votre `content.js` existant

**Contenu** : Version mise à jour fournie dans l'artifact `content_updated`

**Modifications principales** :
- Chargement du parser
- Structure de cache améliorée
- Fonction `viewLogDetails` avec parsing
- Nouvelles fonctions de rendu des modals

### 3. `modal-styles.css` ✅
**Emplacement** : Racine du projet (à côté de `styles.css`)

**Contenu** : Styles fournis dans l'artifact `modal_styles`

**Description** : Styles pour la modal parsée avec tabs

### 4. `test-parser.js` (optionnel) 🧪
**Emplacement** : Dossier `tests/`

**Contenu** : Tests fournis dans l'artifact `test_parser`

**Description** : Suite de tests pour valider le parser

## ⚙️ Modifications du manifest.json

Ouvrez votre `manifest.json` et ajoutez les ressources :

```json
{
  "manifest_version": 3,
  "name": "FoxLog",
  "version": "1.0.4",
  "description": "Display Salesforce debug logs in a user-friendly format.",
  "permissions": [
    "activeTab",
    "storage",
    "cookies",
    "webRequest"
  ],
  "host_permissions": [
    "https://*.salesforce.com/*",
    "https://*.force.com/*",
    "https://*.my.salesforce.com/*",
    "https://*.lightning.force.com/*"
  ],
  "content_scripts": [
    {
      "matches": [
        "https://*.salesforce.com/*",
        "https://*.force.com/*",
        "https://*.visualforce.com/*",
        "https://*.lightning.force.com/*"
      ],
      "js": ["content.js"],
      "css": ["styles.css", "modal-styles.css"],
      "run_at": "document_end",
      "all_frames": false
    }
  ],
  "background": {
    "service_worker": "background.js"
  },
  "icons": {
    "16": "icon16.png",
    "48": "icon48.png",
    "128": "icon128.png"
  },
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
      "matches": [
        "https://*.salesforce.com/*",
        "https://*.force.com/*",
        "https://*.visualforce.com/*",
        "https://*.lightning.force.com/*"
      ]
    }
  ]
}
```

**Modifications apportées** :
1. ✅ Ajout de `"modal-styles.css"` dans `content_scripts.css`
2. ✅ Ajout de `"log-parser.js"` dans `web_accessible_resources.resources`
3. ✅ Version incrémentée à `1.0.4`

## 📂 Structure finale du projet

```
FoxLog/
├── manifest.json           (modifié)
├── background.js           (inchangé)
├── content.js              (✅ REMPLACÉ)
├── injected.js             (inchangé)
├── styles.css              (inchangé)
├── modal-styles.css        (✅ NOUVEAU)
├── log-parser.js           (✅ NOUVEAU)
├── icon16.png
├── icon48.png
├── icon128.png
├── tail128.png
├── trash.png
├── refresh.png
├── README.md
├── LICENSE
└── tests/
    ├── test-parser.js      (✅ NOUVEAU - optionnel)
    ├── console.js          (existant)
    └── mini-console.js     (existant)
```

## 🔧 Étapes d'installation

### 1. Sauvegarder votre version actuelle
```bash
# Créer une branche de backup
git checkout -b backup-before-phase1
git add .
git commit -m "Backup avant Phase 1"

# Revenir sur main
git checkout main
```

### 2. Ajouter les nouveaux fichiers

**Option A : Copier-coller**
1. Créez `log-parser.js` et collez le contenu de l'artifact
2. Créez `modal-styles.css` et collez le contenu de l'artifact
3. Remplacez `content.js` par la nouvelle version
4. (Optionnel) Créez `tests/test-parser.js`

**Option B : Télécharger depuis les artifacts**
Les artifacts sont disponibles dans la conversation Claude.

### 3. Modifier le manifest.json
Suivez les modifications indiquées ci-dessus.

### 4. Recharger l'extension

**Dans Chrome/Edge** :
1. Allez dans `chrome://extensions/`
2. Activez le "Mode développeur"
3. Cliquez sur "Recharger" pour votre extension FoxLog

## ✅ Validation de l'installation

### Test 1 : Vérifier le chargement
1. Ouvrez une page Salesforce Lightning
2. Ouvrez la console DevTools (F12)
3. Cherchez ces messages :
   ```
   [FoxLog] === Initialisation de FoxLog ===
   [FoxLog] ✅ Script injected.js chargé avec succès
   [FoxLog] ✅ Parser chargé et disponible
   [FoxLog Parser] ✅ Parser chargé et disponible
   ```

### Test 2 : Ouvrir FoxLog
1. Cliquez sur le bouton FoxLog (icône de renard)
2. Le panel doit s'ouvrir à droite
3. Vérifiez que les logs apparaissent

### Test 3 : Tester le parsing
1. Cliquez sur "Détails" d'un log
2. La modal doit s'ouvrir avec 3 onglets :
   - ✅ Résumé (avec barres de progression)
   - ✅ Timeline (événements colorés)
   - ✅ Log brut (texte original)

### Test 4 : Exécuter les tests (optionnel)
1. Dans la console DevTools, collez le contenu de `test-parser.js`
2. Appuyez sur Entrée
3. Vérifiez que tous les tests passent ✅

## 🐛 Dépannage

### Le parser ne se charge pas
**Symptôme** : Message d'erreur "logParser is null"

**Solution** :
1. Vérifiez que `log-parser.js` est dans `web_accessible_resources`
2. Rechargez l'extension
3. Vérifiez dans la console : `window.SalesforceLogParser`

### Les styles ne s'appliquent pas
**Symptôme** : La modal est mal formatée

**Solution** :
1. Vérifiez que `modal-styles.css` est dans `content_scripts.css`
2. Rechargez la page Salesforce (Ctrl+R)
3. Inspectez l'élément modal pour voir si les classes CSS sont présentes

### Erreur "Cannot read property 'parse' of null"
**Symptôme** : Erreur lors du clic sur "Détails"

**Solution** :
```javascript
// Vérifier dans la console si le parser existe
console.log(window.SalesforceLogParser); // doit retourner une fonction
console.log(logParser); // doit retourner une instance

// Si null, recharger la page et vérifier les logs
```

### Les onglets ne fonctionnent pas
**Symptôme** : Impossible de changer d'onglet

**Solution** :
1. Vérifiez que `modal-styles.css` est bien chargé
2. Inspectez les event listeners dans DevTools
3. Vérifiez qu'il n'y a pas d'erreur JavaScript dans la console

## 📊 Métriques de succès

Après l'installation, vous devriez observer :

| Métrique | Avant Phase 1 | Après Phase 1 |
|----------|---------------|---------------|
| Temps de chargement d'un log | ~500ms | ~800ms (parsing inclus) |
| Informations affichées | Log brut uniquement | Log brut + résumé + timeline |
| Taille extension | ~50KB | ~80KB (+parser) |
| Mémoire utilisée | ~5MB | ~8MB (+données parsées) |

## 🎯 Prochaines étapes

Une fois l'installation validée :

1. ✅ **Valider** que tout fonctionne
2. 📝 **Tester** avec différents types de logs
3. 🐛 **Reporter** les bugs éventuels
4. 🚀 **Passer** à la Phase 2 (filtrage avancé)

## 📞 Support

En cas de problème :
1. Vérifiez les logs dans la console DevTools
2. Activez `CONFIG.DEBUG_MODE = true` dans `content.js`
3. Exécutez les tests avec `test-parser.js`
4. Comparez avec la version backup

---

**Version** : 1.0.4 (Phase 1)  
**Date** : Octobre 2025  
**Statut** : ✅ Prêt pour installation