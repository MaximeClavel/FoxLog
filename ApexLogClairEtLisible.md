<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# Comment je peux les rendre plus clair, plus lisibles pour les utilisateurs une fois que je les affiche dans mon extension ?

Voici les meilleures stratégies pour rendre les ApexLogs plus clairs et lisibles dans votre extension :[^1][^2]

## Visualisation interactive

**Flame Chart Timeline**: Créez une représentation graphique chronologique des événements du log avec des barres colorées représentant chaque méthode, requête SOQL et opération DML. Cette visualisation permet d'identifier rapidement les goulots d'étranglement en affichant la durée et la hiérarchie des appels.[^2][^3][^4][^1]

**Call Tree hiérarchique**: Affichez l'arborescence des appels de méthodes avec des métriques clés (durée totale, temps propre, nombre de SOQL/DML). Permettez l'expansion/réduction des nœuds pour naviguer dans les appels imbriqués.[^5][^4][^1][^2]

**Zoom et navigation**: Implémentez un zoom précis (jusqu'à 0.001ms) sur la timeline et permettez le défilement horizontal/vertical pour explorer les logs volumineux.[^4][^1]

## Coloration syntaxique

**Code couleur par type d'événement**: Utilisez des couleurs distinctes pour chaque catégorie d'événement :[^6][^2]

- Méthodes Apex (vert/turquoise)
- SOQL (violet/mauve)
- DML (bleu foncé)
- Exceptions (rouge)
- Workflows (orange)
- USER_DEBUG (jaune)
- Callouts (cyan)

**Formatage JSON**: Si les logs contiennent du JSON dans les USER_DEBUG, formatez-le automatiquement avec indentation et coloration syntaxique.[^7][^6]

**Mise en évidence conditionnelle**: Utilisez des couleurs d'alerte pour les événements critiques (exceptions, violations de limites, requêtes lentes).[^2][^4]

## Organisation en onglets

**Onglet Timeline**: Vue chronologique complète avec flame chart.[^4][^2]

**Onglet Analysis**: Tableau regroupant les méthodes par performances, avec tri par durée, nombre d'exécutions, type ou namespace. Affichez les méthodes les plus lentes et les plus fréquemment appelées.[^8][^5][^2]

**Onglet Database**: Section dédiée aux opérations de base de données montrant toutes les requêtes SOQL et DML avec durée, nombre de lignes retournées, sélectivité et stack trace. Identifiez les requêtes non-sélectives et les N+1 queries.[^8][^2][^4]

**Onglet Governor Limits**: Vue interactive des limites de gouverneur avec barres de progression visuelles montrant l'utilisation des SOQL (X/100), DML (X/150), CPU (X/10000ms), Heap (X/6MB), etc.[^2][^4]

## Filtrage et recherche

**Filtres intelligents**: Permettez de filtrer par :[^4][^2]

- Type d'événement (METHOD, SOQL, DML, EXCEPTION)
- Namespace (seulement votre code vs code système)
- Durée minimale (masquer les opérations rapides)
- Niveau de log (DEBUG, INFO, ERROR)

**Recherche globale**: Implémentez une recherche textuelle qui fonctionne sur tous les onglets et met en évidence les résultats dans la timeline, le call tree et les tableaux.[^2][^4]

**Toggle événements de détail**: Permettez de masquer/afficher les événements de bas niveau (VARIABLE_ASSIGNMENT, HEAP_ALLOCATE) pour réduire le bruit.[^4][^2]

## Formatage du texte

**Timestamps lisibles**: Convertissez les nanosecondes en format relatif lisible (0ms, 15ms, 1.5s) ou en temps absolu (14:23:15.123).[^9][^10]

**Indentation du code**: Pour les appels de méthodes imbriqués, utilisez une indentation visuelle pour montrer la hiérarchie.[^5][^2]

**Troncature intelligente**: Limitez les longues valeurs (URLs, JSON) avec "..." et affichez la valeur complète au survol ou en tooltip.[^11][^6]

**Numéros de ligne cliquables**: Rendez les numéros de ligne cliquables pour naviguer directement vers le code source si disponible.[^2][^4]

## Métriques et alertes

**Indicateurs de performance**: Affichez des badges visuels pour :[^8][^2]

- 🔴 Méthodes > 1000ms
- ⚠️ SOQL non-sélectives
- 🚨 Exceptions levées
- ⏱️ CPU time proche de la limite

**Résumé en en-tête**: Affichez un résumé synthétique au-dessus du log avec durée totale, nombre de SOQL/DML, exceptions et limites critiques.[^4][^2]

**Graphiques de progression**: Utilisez des barres de progression pour les governor limits avec code couleur (vert <50%, orange 50-80%, rouge >80%).[^2][^4]

## Fonctionnalités avancées

**Export des données**: Permettez l'export des analyses en CSV ou JSON pour partage et collaboration.[^4][^2]

**Polling en temps réel**: Pour les extensions Chrome, implémentez un rafraîchissement automatique des logs actifs sans recharger manuellement la page.[^7][^6]

**Tooltips informatifs**: Au survol d'un élément dans la timeline, affichez une tooltip avec durée, nombre de lignes SOQL/DML, exceptions et détails complets.[^2][^4]

**Suggestions d'optimisation**: Pour les requêtes SOQL lentes ou non-indexées, affichez des conseils d'optimisation directement dans l'interface.[^4][^2]

**Comparaison de logs**: Permettez de charger deux logs côte à côte pour comparer les performances avant/après optimisation.[^3][^1]

## Structure HTML recommandée

```html
<div class="apex-log-viewer">
  <div class="summary-header">
    <!-- Métriques clés et alertes -->
  </div>
  
  <div class="tabs">
    <button class="tab active">Timeline</button>
    <button class="tab">Call Tree</button>
    <button class="tab">Analysis</button>
    <button class="tab">Database</button>
    <button class="tab">Limits</button>
  </div>
  
  <div class="filters-bar">
    <!-- Filtres et recherche -->
  </div>
  
  <div class="content-area">
    <!-- Contenu de l'onglet actif -->
  </div>
</div>
```

Cette approche combine visualisation graphique, organisation logique et interactivité pour transformer des logs bruts difficiles à lire en données exploitables.[^2][^4]
<span style="display:none">[^12][^13][^14][^15][^16][^17][^18][^19][^20][^21][^22]</span>

<div align="center">⁂</div>

[^1]: https://developer.salesforce.com/blogs/2022/09/find-problems-faster-with-the-apex-log-analyzer-2

[^2]: https://github.com/certinia/debug-log-analyzer

[^3]: https://developer.salesforce.com/blogs/2020/12/find-problems-faster-with-the-apex-log-analyzer

[^4]: https://certinia.github.io/debug-log-analyzer/

[^5]: https://www.pantherschools.com/save-the-day-of-a-developer-with-apex-log-analyzer/

[^6]: https://www.youtube.com/watch?v=AoYUhPx14zc

[^7]: https://www.linkedin.com/posts/michaeleswanson_salesforce-awesomeadmins-techlessons-activity-7354509483206721537-pZA1

[^8]: https://www.cloudperitus.com/blog/salesforce-debugging-made-easy-a-deep-dive-into-apex-log-analysis

[^9]: https://s2-labs.com/blog/debug-logs-in-salesforce/

[^10]: https://www.saasguru.co/debug-logs-in-salesforce/

[^11]: https://chromewebstore.google.com/detail/salesforce-log-inspector/jebmhhcaiafpcjneboknfkmijegiihoe

[^12]: https://www.reddit.com/r/SalesforceDeveloper/comments/1c7dfur/enhancing_debug_log_readability_in_salesforce/

[^13]: https://trailhead.salesforce.com/content/learn/modules/developer_console/developer_console_logs

[^14]: https://sfdcian.com/quickly-identify-issues-using-the-apex-log-analyzer/

[^15]: https://marketplace.visualstudio.com/items?itemName=supercooltools.salesforce-log-analyzer

[^16]: https://www.youtube.com/watch?v=7vMSgaLv4gc

[^17]: https://help.salesforce.com/s/articleView?id=analytics.bi_chart_conditional_formatting.htm\&language=en_US\&type=5

[^18]: https://www.debugpulseforce.com

[^19]: https://www.reddit.com/r/salesforce/comments/7bfzvl/salesforce_formula_editor_with_autocomplete_and/

[^20]: https://www.youtube.com/watch?v=UycYrwhPKhE

[^21]: https://www.salesforceben.com/your-guide-to-conditional-formatting-for-salesforce-fields/

[^22]: https://developer.salesforce.com/docs/atlas.en-us.sfdx_dev.meta/sfdx_dev/sfdx_dev_develop_view_apex_debug_logs.htm

