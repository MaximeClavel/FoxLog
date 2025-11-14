<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# Je viens de finir la phase 1 de readability mais ça a pas suivi le document d'implémentation de readability. Refait moi le StepToImplement.md pour mettre dans la phase 1 ce que j'ai déjà fait et mettre le reste dans les autres phases.

Basé sur l'analyse de vos fichiers, je vais créer un nouveau document `StepToImplement.md` qui réorganise les phases en fonction de ce qui a déjà été implémenté dans la Phase 1.[^1][^2][^3]

# Plan d'implémentation Readability - Réorganisé

## Phase 1: Parsing et visualisation de base ✅ **TERMINÉ**

### Étape 1.1: Parser de logs ✅ **FAIT**

- ✅ Parser complet pour lire le log ligne par ligne
- ✅ Identification et catégorisation de 15+ types d'événements (METHOD_ENTRY, SOQL_EXECUTE, DML_BEGIN, EXCEPTION_THROWN, etc.)
- ✅ Extraction des métadonnées clés: timestamp, durée, numéro de ligne, type d'événement
- ✅ Construction d'une structure hiérarchique représentant les appels imbriqués
- ✅ Gestion des profondeurs d'imbrication
- ✅ Gestion des exceptions de parsing

**Fichier**: `log-parser.js` (~350 lignes)[^1]

### Étape 1.2: Modal à onglets ✅ **FAIT**

- ✅ Modal avec 3 onglets (Résumé / Timeline / Log brut)
- ✅ Système de navigation entre onglets fonctionnel
- ✅ Affichage structuré ligne par ligne
- ✅ Timestamps convertis en format lisible
- ✅ Design moderne et responsive

**Fichiers**: `content.js` (fonction `showParsedLogModal`), `modal-styles.css`[^1]

### Étape 1.3: Onglet Résumé ✅ **FAIT**

- ✅ Informations générales (opération, statut, durée)
- ✅ Barres de progression pour les limites Salesforce (SOQL, DML, CPU, Heap)
- ✅ Code couleur progressif (vert < 70%, orange 70-99%, rouge 100%)
- ✅ Liste des erreurs avec détails complets
- ✅ Top 10 des méthodes appelées avec nombre d'appels

**Fichier**: `content.js` (fonction `renderSummaryTab`)[^1]

### Étape 1.4: Onglet Timeline ✅ **FAIT**

- ✅ Chronologie des événements importants
- ✅ Indentation selon la profondeur d'exécution
- ✅ Couleurs par type d'événement
- ✅ Timestamps affichés pour chaque ligne

**Fichier**: `content.js` (fonction `renderTimelineTab`)[^1]

### Étape 1.5: Extraction des statistiques ✅ **FAIT**

- ✅ Parsing des limites Salesforce (SOQL, DML, CPU, Heap)
- ✅ Comptage des méthodes avec nombre d'appels
- ✅ Détection automatique des erreurs
- ✅ Extraction des requêtes SOQL avec résultats
- ✅ Extraction des opérations DML

**Fichier**: `log-parser.js` (méthodes `collectStats`, `parseCumulativeLimits`)[^1]

***

## Phase 2: Filtrage avancé et recherche 🔜 **À FAIRE**

### Étape 2.1: Système de filtres interactifs

**Objectif**: Permettre à l'utilisateur de masquer le bruit et se concentrer sur l'essentiel.[^2]

- [ ] Créer une barre de filtres dans la modal (au-dessus des onglets)
- [ ] Implémenter des checkboxes pour filtrer par type d'événement:
    - Methods (METHOD_ENTRY/EXIT)
    - Database (SOQL_EXECUTE, DML_BEGIN)
    - Debug (USER_DEBUG)
    - Exceptions (EXCEPTION_THROWN, FATAL_ERROR)
    - Variables (VARIABLE_SCOPE, VARIABLE_ASSIGNMENT)
    - System (CODE_UNIT_STARTED, HEAP_ALLOCATE)
- [ ] Ajouter un filtre par durée minimale (slider ou input)
- [ ] Filtrer par namespace (code utilisateur vs code système)
- [ ] Sauvegarder les préférences dans `localStorage`
- [ ] Appliquer les filtres en temps réel à tous les onglets

**Estimation**: 2-3 jours

### Étape 2.2: Recherche textuelle dans les logs

**Objectif**: Trouver rapidement des informations spécifiques.[^2]

- [ ] Ajouter un champ de recherche avec icône dans la modal
- [ ] Implémenter la recherche en temps réel (avec debounce)
- [ ] Mettre en surbrillance les résultats trouvés
- [ ] Afficher le compteur de résultats (X/Y)
- [ ] Ajouter des boutons "précédent/suivant" pour naviguer
- [ ] Auto-scroll vers le résultat sélectionné
- [ ] Recherche dans tous les onglets

**Estimation**: 1-2 jours

### Étape 2.3: Filtrage par méthode/classe

**Objectif**: Focus sur une classe ou méthode spécifique.

- [ ] Ajouter un dropdown avec liste des classes détectées
- [ ] Permettre de sélectionner une ou plusieurs méthodes
- [ ] Afficher uniquement les lignes liées à ces méthodes
- [ ] Conserver la hiérarchie d'appel (parents/enfants)

**Estimation**: 1 jour

***

## Phase 3: Coloration syntaxique et améliorations visuelles 🔜 **À FAIRE**

### Étape 3.1: Coloration syntaxique SOQL

**Objectif**: Rendre les requêtes SOQL plus lisibles.[^2]

- [ ] Parser les requêtes SOQL dans `USER_DEBUG` et `SOQL_EXECUTE_BEGIN`
- [ ] Colorer les mots-clés SQL (SELECT, FROM, WHERE, ORDER BY) en bleu
- [ ] Colorer les noms de champs en vert
- [ ] Colorer les valeurs en orange
- [ ] Formater automatiquement (indentation, retours à la ligne)

**Estimation**: 2 jours

### Étape 3.2: Coloration Apex dans USER_DEBUG

**Objectif**: Améliorer la lisibilité du code Apex.

- [ ] Détecter le code Apex dans les messages USER_DEBUG
- [ ] Colorer les mots-clés (if, for, while, return) en violet
- [ ] Colorer les types (String, Integer, Boolean) en vert
- [ ] Colorer les variables et constantes
- [ ] Ajouter un bouton "Copy code" pour copier le code sans coloration

**Estimation**: 2 jours

### Étape 3.3: Dark mode

**Objectif**: Confort visuel pour les développeurs.

- [ ] Ajouter un toggle dark/light mode dans le header de la modal
- [ ] Créer une palette de couleurs pour le dark mode
- [ ] Appliquer aux 3 onglets et à tous les éléments
- [ ] Sauvegarder la préférence dans `localStorage`
- [ ] Synchroniser avec le thème du navigateur

**Estimation**: 1 jour

### Étape 3.4: Badges et indicateurs visuels

**Objectif**: Identifier rapidement les problèmes.

- [ ] Badge rouge "SLOW" sur les méthodes > 1000ms
- [ ] Badge orange "N+1" sur les requêtes répétitives
- [ ] Badge "NON-SELECTIVE" sur les requêtes sans WHERE
- [ ] Icônes pour différencier classes, triggers, méthodes dans l'arbre
- [ ] Barre de progression animée lors du parsing

**Estimation**: 1 jour

***

## Phase 4: Analyse avancée des performances 🔜 **À FAIRE**

### Étape 4.1: Onglet "Analysis" détaillé

**Objectif**: Analyser les performances des méthodes.[^2]

- [ ] Créer un 4ème onglet "Analysis"
- [ ] Tableau avec colonnes:
    - Nom de la méthode
    - Temps propre (self time)
    - Temps total (avec enfants)
    - Nombre d'appels
    - % du temps total
    - Namespace
- [ ] Permettre le tri par colonne (ascendant/descendant)
- [ ] Mettre en évidence les méthodes lentes en rouge (> 1000ms)
- [ ] Graphique en barres des top 10 méthodes les plus lentes

**Estimation**: 2-3 jours

### Étape 4.2: Onglet "Database" détaillé

**Objectif**: Analyser toutes les opérations de base de données.[^2]

- [ ] Créer un 5ème onglet "Database"
- [ ] Section résumé en haut:
    - Total SOQL queries
    - Total DML statements
    - Total lignes retournées
    - Temps total DB
- [ ] Tableau des requêtes SOQL avec:
    - Query formatée (avec coloration)
    - Durée d'exécution
    - Nombre de lignes retournées
    - Méthode appelante (call stack)
    - Indicateur de sélectivité
- [ ] Tableau des opérations DML avec:
    - Type (Insert, Update, Delete, Upsert)
    - Objet
    - Nombre de lignes affectées
    - Méthode appelante
- [ ] Détection et signalement des N+1 queries

**Estimation**: 3 jours

### Étape 4.3: Détection d'anti-patterns

**Objectif**: Suggérer des optimisations.[^2]

- [ ] Détecter SOQL dans les boucles
- [ ] Détecter N+1 queries (même requête multiple fois)
- [ ] Détecter requêtes non-sélectives (sans WHERE)
- [ ] Détecter méthodes trop lentes (> 1s)
- [ ] Afficher section "⚠️ Problèmes détectés" dans Résumé
- [ ] Lier vers la documentation Salesforce pertinente
- [ ] Calculer un score de performance (0-100)

**Estimation**: 2 jours

***

## Phase 5: Visualisations avancées 🔮 **FUTUR**

### Étape 5.1: Call Tree interactif

**Objectif**: Visualiser l'arborescence complète des appels.[^2]

- [ ] Créer un onglet "Call Tree"
- [ ] Affichage en arbre avec expand/collapse
- [ ] Pour chaque nœud:
    - Nom de la méthode
    - Durée (avec barre proportionnelle)
    - Nombre de SOQL/DML
    - Icône par type (classe, trigger, méthode)
- [ ] Indentation visuelle selon la profondeur
- [ ] Click pour voir les détails dans un panel
- [ ] Exportable en JSON

**Estimation**: 3-4 jours

### Étape 5.2: Timeline interactive (Flame Chart)

**Objectif**: Visualiser chronologiquement l'exécution.[^2]

- [ ] Créer un onglet "Flame Chart"
- [ ] Canvas HTML5 ou SVG
- [ ] Axe horizontal = temps (0ms → durée totale)
- [ ] Empiler verticalement les appels
- [ ] Rectangles colorés par type:
    - Apex = vert
    - SOQL = violet
    - DML = bleu
    - Exception = rouge
- [ ] Zoom et pan (molette + drag)
- [ ] Règle temporelle en haut
- [ ] Mini-map pour navigation globale
- [ ] Tooltip au survol avec détails

**Estimation**: 5-6 jours

### Étape 5.3: Graphiques de métriques

**Objectif**: Visualiser les limites et performances.

- [ ] Graphique en jauge pour chaque limite Salesforce
- [ ] Graphique en ligne du temps CPU dans le temps
- [ ] Graphique en secteurs de la répartition du temps par type
- [ ] Heatmap des méthodes les plus appelées
- [ ] Utiliser une bibliothèque légère (Chart.js ou D3.js)

**Estimation**: 3-4 jours

***

## Phase 6: Optimisations et UX 🔮 **FUTUR**

### Étape 6.1: Performance pour gros logs

**Objectif**: Gérer efficacement les logs > 500KB.[^2]

- [ ] Implémenter la virtualisation (windowing) pour l'affichage
- [ ] Utiliser Web Workers pour parser en arrière-plan
- [ ] Mettre en cache les logs parsés dans IndexedDB
- [ ] Ajouter un loader avec progression (%)
- [ ] Optimiser les regex du parser
- [ ] Limiter le nombre d'éléments DOM

**Estimation**: 3-4 jours

### Étape 6.2: Export et partage

**Objectif**: Sauvegarder et partager les analyses.[^2]

- [ ] Bouton "Export" avec options:
    - CSV du tableau Analysis
    - JSON des statistiques
    - TXT du log filtré
    - PNG de la timeline/flame chart
- [ ] Générer un lien de partage (encodé dans l'URL)
- [ ] Import/export des préférences utilisateur
- [ ] Export PDF du rapport complet

**Estimation**: 2-3 jours

### Étape 6.3: Historique et comparaison

**Objectif**: Comparer plusieurs logs.[^2]

- [ ] Sauvegarder les logs analysés dans IndexedDB
- [ ] Page "History" avec liste des logs récents
- [ ] Mode "Compare" avec split-view
- [ ] Afficher les différences de métriques (Δ)
- [ ] Générer un rapport de comparaison
- [ ] Recherche dans l'historique

**Estimation**: 4-5 jours

### Étape 6.4: Animations et polish UI

**Objectif**: Expérience utilisateur fluide.

- [ ] Animations CSS pour transitions
- [ ] États hover/focus accessibles
- [ ] Skeleton loaders pendant le chargement
- [ ] Toasts pour les notifications
- [ ] Améliorer la typographie
- [ ] Responsive design (tablette/mobile)

**Estimation**: 2 jours

***

## Phase 7: Fonctionnalités avancées 🌟 **VISION**

### Étape 7.1: Machine Learning - Détection de patterns

**Objectif**: Détecter automatiquement les problèmes récurrents.

- [ ] Analyser plusieurs logs pour détecter des patterns
- [ ] Identifier les méthodes problématiques récurrentes
- [ ] Suggestions contextuelles basées sur l'historique
- [ ] Score de qualité du code

**Estimation**: 10+ jours

### Étape 7.2: Intégration avec Developer Console

**Objectif**: Interaction bidirectionnelle avec Salesforce.

- [ ] Ouvrir la méthode dans Developer Console depuis FoxLog
- [ ] Créer un checkpoint depuis FoxLog
- [ ] Synchroniser les filtres avec Developer Console

**Estimation**: 5-6 jours

### Étape 7.3: Collaboration et annotations

**Objectif**: Permettre l'annotation collaborative.

- [ ] Ajouter des commentaires sur les lignes de log
- [ ] Partager les logs annotés avec l'équipe
- [ ] Système de tags personnalisés
- [ ] Export des annotations

**Estimation**: 5-6 jours

***

## Récapitulatif des priorités

### ✅ Phase 1 (TERMINÉ) - 2 semaines

**MVP fonctionnel**: Parsing complet, modal à 3 onglets, statistiques automatiques, timeline colorée.[^1][^2]

### 🔜 Phase 2 (PROCHAINE) - 1 semaine

**Filtrage et recherche**: Filtres interactifs, recherche textuelle, filtres par méthode.[^2]

### 🔜 Phase 3 (PROCHE) - 1 semaine

**Améliorations visuelles**: Coloration SOQL/Apex, dark mode, badges visuels.[^2]

### 🔜 Phase 4 (MOYEN TERME) - 2 semaines

**Analyse avancée**: Onglets Analysis/Database, détection d'anti-patterns.[^2]

### 🔮 Phase 5 (FUTUR) - 3 semaines

**Visualisations avancées**: Call tree interactif, flame chart, graphiques.[^2]

### 🔮 Phase 6 (FUTUR) - 2 semaines

**Optimisations**: Performance, export, historique, comparaison.[^2]

### 🌟 Phase 7 (VISION) - 4+ semaines

**Fonctionnalités avancées**: ML, intégration Developer Console, collaboration.[^2]

***

## Notes importantes

1. **Phase 1 est complètement terminée** avec tous les fichiers en place (`log-parser.js`, `modal-styles.css`, modifications de `content.js`).[^3][^1]
2. **La base est solide** pour construire les phases suivantes sans refactoring majeur.[^1]
3. **Architecture modulaire** permet d'ajouter des fonctionnalités sans casser l'existant.[^1]
4. **Performance actuelle**: ~50-200ms pour parser un log de 50-250KB, acceptable pour la Phase 1.[^1]
5. **Compatibilité**: Fonctionne sur Chrome et Edge, rétrocompatible avec le code existant.[^3]
<span style="display:none">[^4][^5]</span>

<div align="center">⁂</div>

[^1]: phase1_summary.md

[^2]: StepToImplement.md

[^3]: readme_phase1.md

[^4]: content.js

[^5]: log-parser.js

