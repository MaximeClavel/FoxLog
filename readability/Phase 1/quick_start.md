# ⚡ FoxLog Phase 1 - Démarrage rapide (5 minutes)

> Guide ultra-rapide pour installer la Phase 1 du parser

---

## 📦 Étape 1 : Télécharger les fichiers (2 min)

### 3 nouveaux fichiers à créer :

1. **`log-parser.js`** → Copier depuis l'artifact `foxlog_parser`
2. **`modal-styles.css`** → Copier depuis l'artifact `modal_styles`
3. **`content.js`** → Remplacer par l'artifact `content_updated`

---

## ⚙️ Étape 2 : Modifier manifest.json (1 min)

### Changement 1 : Version
```json
"version": "1.0.4"
```

### Changement 2 : CSS
```json
"css": ["styles.css", "modal-styles.css"]
```

### Changement 3 : Ressources
```json
"resources": [
  "icon16.png",
  "icon48.png",
  "icon128.png",
  "tail128.png",
  "trash.png",
  "refresh.png",
  "injected.js",
  "log-parser.js"  // ← AJOUTER CETTE LIGNE
]
```

---

## 🔄 Étape 3 : Recharger l'extension (30 sec)

1. Allez dans `chrome://extensions/`
2. Trouvez FoxLog
3. Cliquez sur 🔄 **Recharger**

---

## ✅ Étape 4 : Tester (1 min)

1. Ouvrez une page Salesforce
2. Cliquez sur l'icône FoxLog 🦊
3. Cliquez sur **Détails** d'un log
4. Vérifiez les 3 onglets :
   - ✅ **Résumé** (stats + barres)
   - ✅ **Timeline** (événements colorés)
   - ✅ **Log brut** (texte original)

---

## 🎉 C'est tout !

Si vous voyez les 3 onglets → **Installation réussie !**

---

## 🐛 Problème ?

### Parser ne se charge pas
```javascript
// Dans la console DevTools
console.log(window.SalesforceLogParser); // Doit retourner [Function]
```

**Solution** : Vérifiez que `log-parser.js` est bien dans `web_accessible_resources`

### Modal mal formatée
**Solution** : Vérifiez que `modal-styles.css` est dans `content_scripts.css`

### Autres problèmes
👉 Consultez le [Guide de dépannage complet](MIGRATION-GUIDE.md#dépannage)

---

## 