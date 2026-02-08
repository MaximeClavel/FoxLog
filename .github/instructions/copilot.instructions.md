---
applyTo: '**'
---

# 🦊 FoxLog - Instructions Copilot

## 📋 À propos du projet
FoxLog est une **extension Chrome (Manifest V3)** pour visualiser et analyser les logs de debug Salesforce.
- Documentation principale : `docs/` (call-tree.md, readability/, etc.)
- README.md à la racine pour la vue d'ensemble

## 🏗️ Architecture & Conventions

### Structure des fichiers
```
src/
├── core/        # Modules fondamentaux (constants, logger, cache)
├── parsers/     # Parseurs de logs (log-parser.js)
├── services/    # Logique métier (salesforce-api, session, call-tree-builder)
├── ui/          # Composants UI (modal-manager, panel-manager, filter-manager)
├── workers/     # Web Workers pour tâches lourdes
└── assets/      # Icônes et ressources
```

### Pattern JavaScript obligatoire
Tous les fichiers JS utilisent le pattern IIFE avec namespace global :
```javascript
// src/[category]/mon-fichier.js
(function() {
  'use strict';
  
  window.FoxLog = window.FoxLog || {};
  const logger = window.FoxLog.logger || console;
  
  class MaClasse {
    // ...
  }
  
  // Exposer dans le namespace
  window.FoxLog.maClasse = new MaClasse();
  // ou
  window.FoxLog.MaClasse = MaClasse;
})();
```

### Conventions de code
- **JSDoc** : Documenter toutes les méthodes publiques avec `@param` et `@returns`
- **Logger** : Utiliser `logger.log()`, `logger.success()`, `logger.warn()`, `logger.error()` au lieu de `console.*`
- **i18n** : Utiliser `window.FoxLog.i18n.maClef` pour tous les textes affichés (FR/EN supportés)
- **Constantes** : Centraliser dans `src/core/constants.js`
- **Nommage** : 
  - Fichiers : kebab-case (`call-tree-builder.js`)
  - Classes : PascalCase (`CallTreeBuilder`)
  - Méthodes privées : préfixe `_` (`_parseMethod()`)

### Gestion des erreurs
```javascript
try {
  // Code risqué
} catch (error) {
  logger.error('Description explicite', error);
  // Gérer gracieusement (ne pas crasher l'extension)
}
```

### Web Workers
Pour les opérations lourdes (>100ms), utiliser un Worker :
- Créer dans `src/workers/`
- Le service orchestrateur dans `src/services/`
- Communication via `postMessage/onmessage`

## 📝 Règles de travail

1. **Documentation d'abord** : Lire `docs/` avant de modifier le code concerné
2. **Clarifier** : Demander des précisions si la demande est vague ou ambiguë
3. **Mettre à jour la doc** : Proposer une mise à jour de la documentation après les changements significatifs
4. **Code lisible** : Écrire du code clair, bien commenté, compréhensible par d'autres développeurs
5. **Tests** : Les fichiers de test sont dans `tests/` - vérifier que les changements n'impactent pas les tests existants

## 🔗 Fichiers clés à connaître

| Besoin | Fichier |
|--------|---------|
| Configuration globale | `src/core/constants.js` |
| Logging | `src/core/logger.js` |
| Textes i18n | `src/core/constants.js` → `window.FoxLog.i18n` |
| Parser de logs | `src/parsers/log-parser.js` |
| Modal principale | `src/ui/modal-manager.js` |
| Styles modal | `src/modal-styles.css` |
| Manifest extension | `manifest.json` |

## ⚠️ Points d'attention

- **Manifest V3** : Pas de `eval()`, pas de scripts inline dans HTML
- **Permissions Chrome** : Toute nouvelle permission doit être ajoutée dans `manifest.json`
- **Performance** : L'extension doit rester réactive même avec des logs volumineux (>10MB)
- **Compatibilité** : Tester sur Salesforce Lightning (pas Classic)