<div align="center">
  <img src="src/assets/icon128.png" alt="FoxLog Logo" width="128" height="128">
  <h1>FoxLog 🦊</h1>
  <p>Extension Chrome pour visualiser et analyser les logs de debug Salesforce avec une interface moderne et des fonctionnalités avancées.</p>
</div>

## 🚀 Fonctionnalités principales

### 📊 Visualisation et analyse
- **Affichage en temps réel** des logs Apex avec rafraîchissement automatique
- **Parser intelligent** analysant 15+ types de lignes (METHOD_ENTRY, SOQL, DML, USER_DEBUG, EXCEPTION, etc.)
- **Détection automatique d'erreurs** avec badges visuels et compteurs
- **Statistiques détaillées** : SOQL queries, DML statements, CPU time, Heap size avec barres de progression
- **Analyse des limites Salesforce** avec alertes visuelles

### 👥 Gestion multi-utilisateurs
- **Sélection d'utilisateur** via picklist avec indicateurs visuels
- **Affichage des TraceFlags** actifs par utilisateur
- **Compteur de logs** par utilisateur

### 🔍 Visualisation avancée
- **4 vues complémentaires** :
  - **Résumé** : Vue d'ensemble avec statistiques et métadonnées
  - **Timeline** : Chronologie d'exécution avec indentation et couleurs
  - **Arbre d'appels** : Visualisation hiérarchique des méthodes (construit via Web Worker)
  - **Log brut** : Contenu original du log
- **Filtrage avancé** : par type de log, erreurs uniquement, durée, profondeur
- **Recherche** dans les logs avec surbrillance
- **Pagination** pour gérer de grandes listes de logs

### ⚡ Performance
- **Cache intelligent** pour éviter les requêtes redondantes
- **Analyse en arrière-plan** pour ne pas bloquer l'interface
- **Web Workers** pour la construction d'arbres d'appels
- **Virtualisation** pour les grandes listes

### 🎨 Interface utilisateur
- **Panel latéral** avec bouton flottant
- **Modal moderne** avec onglets
- **Design responsive** et intuitif
- **Export des statistiques** au format JSON

## 📦 Installation

1. Clonez le repository
2. Ouvrez Chrome et allez dans `chrome://extensions/`
3. Activez le "Mode développeur"
4. Cliquez "Charger l'extension non empaquetée"
5. Sélectionnez le dossier du projet

## 🎯 Utilisation

1. Naviguez vers une page Salesforce (Lightning ou Classic)
2. Cliquez sur l'icône 🦊 en bas à droite de l'écran
3. Le panel s'ouvre avec vos logs récents
4. Sélectionnez un utilisateur dans la liste déroulante si nécessaire
5. Cliquez sur "Détails" pour analyser un log en profondeur
6. Explorez les différents onglets : Résumé, Timeline, Appels, Log brut

## 🤝 Contributing

Les contributions sont les bienvenues !

## ℹ️ About

By Claude Sonnet 4.5 and occasionally Maxime Clavel

## 📄 License

MIT License - voir [LICENSE](LICENSE)