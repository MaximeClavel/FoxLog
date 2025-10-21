<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# Toute les idées sont bonne remanie toute tes idées en organisant en étapes de réalisation

Voici un plan d'implémentation organisé en étapes progressives pour rendre vos ApexLogs plus lisibles :[^10][^11]

## Phase 1: Fondations (MVP - 1-2 semaines)

### Étape 1.1: Parsing et structure de données

**Objectif**: Extraire et structurer les données brutes du log.[^11][^10]

- Créer un parser pour lire le log ligne par ligne
- Identifier et catégoriser chaque type d'événement (USER_INFO, METHOD_ENTRY, SOQL_EXECUTE, DML_BEGIN, etc.)
- Extraire les métadonnées clés: timestamp, durée (nanosecondes), numéro de ligne, type d'événement
- Construire une structure de données hiérarchique représentant les appels imbriqués
- Gérer les exceptions de parsing pour les logs malformés


### Étape 1.2: Interface de base

**Objectif**: Afficher le log de manière structurée.[^12][^13]

- Créer une interface HTML/CSS simple avec conteneur principal
- Implémenter un affichage ligne par ligne du log brut
- Convertir les timestamps nanosecondes en format lisible (HH:mm:ss.SSS + temps relatif en ms)
- Ajouter une barre de défilement pour les logs volumineux
- Afficher le nombre total de lignes du log


### Étape 1.3: Coloration syntaxique basique

**Objectif**: Différencier visuellement les types d'événements.[^14][^10]

- Définir une palette de couleurs cohérente pour chaque type d'événement:
    - Méthodes Apex: `#22c55e` (vert)
    - SOQL: `#8b5cf6` (violet)
    - DML: `#3b82f6` (bleu)
    - Exceptions: `#ef4444` (rouge)
    - USER_DEBUG: `#f59e0b` (orange)
    - Workflows: `#ec4899` (rose)
    - Callouts: `#06b6d4` (cyan)
- Appliquer la coloration via classes CSS dynamiques
- Mettre en gras les mots-clés importants (EXCEPTION_THROWN, ERROR, LIMIT_USAGE)


## Phase 2: Filtrage et recherche (1 semaine)

### Étape 2.1: Système de filtres

**Objectif**: Permettre de masquer le bruit et se concentrer sur l'essentiel.[^10][^11]

- Créer une barre de filtres en haut de l'interface
- Implémenter des filtres par type d'événement avec checkboxes:
    - Methods (METHOD_ENTRY/EXIT)
    - Database (SOQL_EXECUTE, DML_BEGIN)
    - Debug (USER_DEBUG)
    - Exceptions (EXCEPTION_THROWN, FATAL_ERROR)
    - Workflows (WF_*)
    - Variables (VARIABLE_SCOPE, VARIABLE_ASSIGNMENT)
    - System (HEAP_ALLOCATE, CODE_UNIT_STARTED)
- Ajouter un filtre par durée minimale (masquer événements < X ms)
- Permettre de filtrer par namespace (afficher uniquement votre code vs code système)
- Sauvegarder les préférences de filtrage dans localStorage


### Étape 2.2: Recherche textuelle

**Objectif**: Trouver rapidement des informations spécifiques.[^11][^10]

- Ajouter un champ de recherche avec icône de loupe
- Implémenter la recherche en temps réel (debounced pour performance)
- Mettre en surbrillance les résultats trouvés
- Afficher le compteur de résultats (X/Y)
- Ajouter des boutons navigation précédent/suivant
- Auto-scroll vers le résultat sélectionné


## Phase 3: Visualisation des métriques (1-2 semaines)

### Étape 3.1: En-tête récapitulatif

**Objectif**: Afficher les métriques clés en un coup d'œil.[^10][^11]

- Créer une section en-tête fixe avec cartes de métriques
- Extraire et afficher les informations USER_INFO (utilisateur, timezone)
- Calculer et afficher la durée totale d'exécution
- Compter et afficher le nombre de SOQL queries et DML statements
- Identifier et afficher le nombre d'exceptions levées avec badge rouge
- Afficher la taille du log (en KB/MB)


### Étape 3.2: Governor Limits visuels

**Objectif**: Visualiser l'utilisation des limites Salesforce.[^11][^10]

- Parser la section LIMIT_USAGE_FOR_NS du log
- Créer des barres de progression pour chaque limite:
    - SOQL queries (X/100)
    - DML statements (X/150)
    - CPU time (X/10000 ms)
    - Heap size (X/6000000 bytes, converti en MB)
    - Callouts (X/100)
    - Email invocations (X/10)
- Appliquer un code couleur progressif:
    - Vert: 0-50% utilisé
    - Orange: 51-80% utilisé
    - Rouge: 81-100% utilisé
- Ajouter une icône d'alerte pour les limites dépassées


## Phase 4: Organisation en onglets (1-2 semaines)

### Étape 4.1: Structure à onglets

**Objectif**: Séparer les différentes vues du log.[^10][^11]

- Créer un système de navigation par onglets
- Implémenter 4 onglets principaux:
    - **Raw Log**: Vue brute avec coloration et filtres
    - **Analysis**: Agrégation des méthodes
    - **Database**: Vue des opérations SOQL/DML
    - **Limits**: Vue détaillée des governor limits
- Gérer l'état actif des onglets
- Mémoriser le dernier onglet consulté


### Étape 4.2: Onglet Analysis

**Objectif**: Analyser les performances des méthodes.[^4][^10]

- Créer un tableau avec colonnes:
    - Nom de la méthode
    - Temps propre (self time)
    - Temps total (avec appels enfants)
    - Nombre d'appels
    - Namespace
- Calculer les métriques en parsant METHOD_ENTRY/EXIT
- Permettre le tri par colonne (ascendant/descendant)
- Mettre en évidence les méthodes > 1000ms en rouge
- Afficher les top 10 méthodes les plus lentes par défaut


### Étape 4.3: Onglet Database

**Objectif**: Analyser les opérations de base de données.[^11][^10]

- Afficher un résumé en haut:
    - Total SOQL queries exécutées
    - Total DML statements
    - Total lignes retournées
- Créer un tableau des requêtes SOQL avec:
    - Requête complète (formatée)
    - Durée d'exécution
    - Nombre de lignes retournées
    - Stack trace (méthode appelante)
    - Indicateur de sélectivité
- Créer un tableau des opérations DML avec:
    - Type d'opération (Insert, Update, Delete, Upsert)
    - Objet concerné
    - Nombre de lignes affectées
    - Stack trace
- Identifier et signaler les potentielles N+1 queries (même requête appelée multiple fois)


## Phase 5: Visualisation avancée (2-3 semaines)

### Étape 5.1: Call Tree hiérarchique

**Objectif**: Afficher l'arborescence des appels.[^10][^11]

- Créer une vue arborescente des appels de méthodes
- Construire la hiérarchie parent-enfant à partir des METHOD_ENTRY/EXIT
- Permettre l'expansion/réduction des nœuds
- Afficher pour chaque nœud:
    - Nom de la méthode
    - Durée (avec barre visuelle proportionnelle)
    - Nombre d'appels SOQL/DML dans cette méthode
- Indenter visuellement les appels imbriqués
- Ajouter des icônes pour différencier classes, triggers, méthodes


### Étape 5.2: Timeline interactive (Flame Chart)

**Objectif**: Visualiser chronologiquement l'exécution.[^15][^10]

- Créer un canvas HTML5 ou SVG pour le flame chart
- Représenter le temps sur l'axe horizontal (0ms à durée totale)
- Empiler verticalement les appels imbriqués
- Dessiner des rectangles colorés par type d'événement:
    - Hauteur: représente le niveau d'imbrication
    - Largeur: proportionnelle à la durée
    - Couleur: selon le type (Apex, SOQL, DML, etc.)
- Implémenter le zoom et pan:
    - Molette souris pour zoomer
    - Drag pour déplacer
    - Double-clic pour zoom sur un élément
- Afficher une règle temporelle en haut
- Ajouter une mini-map pour navigation globale


### Étape 5.3: Tooltips et interactions

**Objectif**: Afficher les détails au survol.[^11][^10]

- Au survol d'un événement dans le call tree ou timeline:
    - Afficher une tooltip avec détails complets
    - Montrer le timestamp exact
    - Afficher la durée précise
    - Pour SOQL: montrer la requête et nb de lignes
    - Pour DML: montrer l'opération et objet
    - Pour exceptions: afficher le message complet
- Permettre de cliquer pour épingler la tooltip
- Ajouter un bouton "Copy" pour copier les détails


## Phase 6: Optimisations et UX (1-2 semaines)

### Étape 6.1: Performance

**Objectif**: Gérer efficacement les gros logs.[^10][^11]

- Implémenter la virtualisation pour n'afficher que les lignes visibles (windowing)
- Utiliser Web Workers pour parser les logs en arrière-plan
- Mettre en cache les résultats de parsing
- Ajouter un loader/spinner pendant le parsing
- Optimiser le rendering avec requestAnimationFrame
- Limiter le nombre d'éléments DOM créés simultanément


### Étape 6.2: Améliorations visuelles

**Objectif**: Polir l'interface utilisateur.[^11][^10]

- Ajouter des animations CSS subtiles pour les transitions
- Implémenter un mode sombre et mode clair (toggle)
- Améliorer la typographie pour la lisibilité
- Ajouter des icônes SVG pour les différents types d'événements
- Créer des états de hover et focus accessibles
- Responsive design pour différentes tailles d'écran


### Étape 6.3: Formatage intelligent

**Objectif**: Améliorer la lisibilité du contenu.[^14][^10]

- Formater automatiquement le JSON trouvé dans USER_DEBUG avec indentation
- Tronquer les longues valeurs avec "..." et bouton "Expand"
- Rendre les numéros de ligne cliquables (copie dans presse-papier)
- Formater les URLs de callout comme liens cliquables
- Colorer la syntaxe SOQL (mots-clés SELECT, FROM, WHERE en bleu)
- Ajouter des badges visuels pour les alertes (🔴 lent, ⚠️ non-sélectif, 🚨 exception)


## Phase 7: Fonctionnalités avancées (2-3 semaines)

### Étape 7.1: Suggestions d'optimisation

**Objectif**: Aider l'utilisateur à améliorer son code.[^10][^11]

- Détecter les anti-patterns:
    - SOQL dans les boucles
    - N+1 queries
    - Requêtes non-sélectives (sans WHERE ou index)
    - Méthodes > 1000ms
- Afficher des suggestions contextuelles avec icône 💡:
    - "Cette requête est appelée 15 fois. Envisagez de la déplacer hors de la boucle"
    - "Ajoutez un index sur ce champ pour améliorer la performance"
- Lier vers la documentation Salesforce pertinente
- Calculer un "score de performance" global (0-100)


### Étape 7.2: Export et partage

**Objectif**: Permettre la sauvegarde et collaboration.[^11][^10]

- Ajouter un bouton "Export" avec options:
    - Export du tableau Analysis en CSV
    - Export des métriques en JSON
    - Export du log filtré en TXT
    - Screenshot de la timeline (canvas to PNG)
- Générer un lien de partage encodant l'état actuel (filtres, onglet actif)
- Permettre l'import/export des préférences utilisateur


### Étape 7.3: Comparaison de logs

**Objectif**: Comparer avant/après optimisation.[^16][^15]

- Ajouter un mode "Compare" avec split-view
- Permettre de charger 2 logs côte à côte
- Afficher les différences de métriques:
    - Δ durée totale
    - Δ nombre de SOQL/DML
    - Δ utilisation CPU/Heap
- Mettre en évidence les améliorations (vert) et régressions (rouge)
- Générer un rapport de comparaison exportable


### Étape 7.4: Sauvegarde et historique

**Objectif**: Garder trace des logs analysés.[^10][^11]

- Sauvegarder automatiquement les logs analysés dans IndexedDB
- Créer une page "History" listant les logs récents
- Permettre de rechercher dans l'historique par date, utilisateur, durée
- Ajouter des tags/labels personnalisés aux logs
- Permettre de supprimer les anciens logs


## Phase 8: Finalisation (1 semaine)

### Étape 8.1: Tests et debugging

**Objectif**: Assurer la fiabilité.[^4]

- Tester avec des logs de tailles variées (1KB à 10MB+)
- Tester avec différents types de transactions (triggers, batch, callouts, flows)
- Vérifier la compatibilité navigateurs (Chrome, Firefox, Safari, Edge)
- Corriger les bugs identifiés
- Optimiser les goulots d'étranglement de performance


### Étape 8.2: Documentation et onboarding

**Objectif**: Faciliter l'adoption.[^4]

- Créer une page "Help" avec guide d'utilisation
- Ajouter des tooltips sur les fonctionnalités avancées
- Créer un tutoriel interactif pour les nouveaux utilisateurs
- Documenter les raccourcis clavier (Ctrl+F pour recherche, etc.)
- Rédiger un changelog pour suivre les évolutions


## Récapitulatif des priorités

**Must-have (Phases 1-3)**: Parsing, coloration, filtres, métriques de base - utilisable immédiatement.[^11][^10]

**Should-have (Phases 4-5)**: Onglets, tableaux d'analyse, visualisation avancée - expérience complète.[^4][^10]

**Nice-to-have (Phases 6-8)**: Optimisations, suggestions, comparaison - valeur ajoutée professionnelle.[^15][^11]

Cette approche progressive vous permet de livrer une version utilisable rapidement tout en construisant vers une solution complète et professionnelle.[^10][^11]
<span style="display:none">[^1][^2][^3][^5][^6][^7][^8][^9]</span>

<div align="center">⁂</div>

[^1]: https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_apexlog.htm

[^2]: https://trailhead.salesforce.com/fr/content/learn/modules/apex_basics_dotnet/debugging_diagnostics

[^3]: https://developer.salesforce.com/docs/atlas.en-us.sfFieldRef.meta/sfFieldRef/salesforce_field_reference_ApexLog.htm

[^4]: https://www.cloudperitus.com/blog/salesforce-debugging-made-easy-a-deep-dive-into-apex-log-analysis

[^5]: https://www.jamessimone.net/blog/joys-of-apex/apex-logging-service/

[^6]: https://reej-consulting.com/les-8-etapes-a-suivre-pour-implementer-salesforce/

[^7]: https://trailhead.salesforce.com/fr/content/learn/modules/apex_patterns_sl/apex_patterns_sl_learn_sl_principles

[^8]: https://help.salesforce.com/s/articleView?id=platform.flow_build_extend_apex.htm\&language=fr\&type=5

[^9]: https://help.salesforce.com/s/articleView?id=platform.process_considerations_design_bestpractices.htm\&language=fr\&type=5

[^10]: https://github.com/certinia/debug-log-analyzer

[^11]: https://certinia.github.io/debug-log-analyzer/

[^12]: https://s2-labs.com/blog/debug-logs-in-salesforce/

[^13]: https://www.saasguru.co/debug-logs-in-salesforce/

[^14]: https://www.youtube.com/watch?v=AoYUhPx14zc

[^15]: https://developer.salesforce.com/blogs/2022/09/find-problems-faster-with-the-apex-log-analyzer-2

[^16]: https://developer.salesforce.com/blogs/2020/12/find-problems-faster-with-the-apex-log-analyzer

