// src/core/constants.js
(function() {
  'use strict';
  
  window.FoxLog = window.FoxLog || {};
  const logger = window.FoxLog.logger || console;
  
  // ============================================
  // VERSION (read from manifest.json)
  // ============================================
  window.FoxLog.VERSION = chrome.runtime.getManifest().version;
  
  // ============================================
  // CONFIGURATION
  // ============================================
  window.FoxLog.CONFIG = {
    AUTO_REFRESH_INTERVAL: 5000,
    MAX_LOGS: 100,
    CACHE_DURATION: 30000,
    REFRESH_INTERVAL: 10000,
    
    // ✅ LOGGER CONFIGURATION
    // Set to false before publishing to production
    DEBUG_MODE: false,           // Enable/disable all logs
    ENABLE_SUCCESS_LOGS: true,  // Show success messages (✅)
    ENABLE_INFO_LOGS: true,     // Show info messages
    ENABLE_WARN_LOGS: true,     // Show warnings (⚠️)
    ENABLE_ERROR_LOGS: true     // Show errors (❌) - always recommended
  };
  
  // ============================================
  // ICONS
  // ============================================
  window.FoxLog.ICONS = {
    FOXLOG: chrome.runtime.getURL('src/assets/icon128.png'),
    TAIL: chrome.runtime.getURL('src/assets/tail128.png'),
    TRASH: chrome.runtime.getURL('src/assets/trash.png'),
    REFRESH: chrome.runtime.getURL('src/assets/refresh.png')
  };
  
  // ============================================
  // COOKIE PRIORITY
  // ============================================
  window.FoxLog.COOKIE_PRIORITY = [
    'my.salesforce.com',
    '.salesforce.com',
    '.force.com',
    'lightning.force.com'
  ];
  
  // ============================================
  // LOG TYPES
  // ============================================
  window.FoxLog.LOG_TYPES = {
    CODE_UNIT: 'CODE_UNIT_STARTED',
    METHOD_ENTRY: 'METHOD_ENTRY',
    METHOD_EXIT: 'METHOD_EXIT',
    SOQL: 'SOQL_EXECUTE_BEGIN',
    SOQL_END: 'SOQL_EXECUTE_END',
    DML: 'DML_BEGIN',
    DML_END: 'DML_END',
    ERROR: 'EXCEPTION_THROWN',
    USER_DEBUG: 'USER_DEBUG'
  };
  
  // ============================================
  // I18N - INTERNATIONALIZATION
  // ============================================
  const browserLang = navigator.language.toLowerCase();
  const isFrench = browserLang.startsWith('fr');
  
  window.FoxLog.i18n = {
    // Panel
    welcome: isFrench ? 'Bienvenue dans FoxLog !' : 'Welcome to FoxLog!',
    selectUser: isFrench ? 'Sélectionnez un utilisateur' : 'Select a user',
    noLogsFor: isFrench ? 'Aucun log pour' : 'No logs for',
    clickRefresh: isFrench ? 'Cliquez sur Actualiser' : 'Click Refresh',
    loading: isFrench ? 'Chargement...' : 'Loading...',
    ready: isFrench ? 'Prêt' : 'Ready',
    refresh: isFrench ? 'Actualiser' : 'Refresh',
    clear: isFrench ? 'Effacer' : 'Clear',
    close: isFrench ? 'Fermer' : 'Close',
    openLogs: isFrench ? 'FoxLog - Ouvrir les logs' : 'FoxLog - Open logs',
    userIdUnavailable: isFrench ? 'ID utilisateur indisponible' : 'User ID not available',
    logLoadedConsole: isFrench ? 'Log chargé ! (voir console)' : 'Log loaded! (see console)',
    thisUser: isFrench ? 'cet utilisateur' : 'this user',
    you: isFrench ? 'Moi' : 'You',
    
    // Status
    traceFlagActive: isFrench ? 'TraceFlag actif mais aucun log. Exécutez du code Apex.' : 'TraceFlag active but no logs. Execute Apex code.',
    noUsersFound: isFrench ? 'Aucun utilisateur trouvé' : 'No users found',
    noApexLogs: isFrench ? 'Aucun log Apex trouvé.' : 'No Apex logs found.',
    ensureYouHave: isFrench ? 'Assurez-vous d\'avoir :' : 'Make sure you have:',
    apexLogs: isFrench ? 'Des logs Apex' : 'Apex logs',
    activeTraceFlag: isFrench ? 'Ou un TraceFlag actif' : 'Or an active TraceFlag',
    requiredPermissions: isFrench ? 'Les permissions nécessaires' : 'Required permissions',
    
    // Errors
    error: isFrench ? 'Erreur' : 'Error',
    loadingError: isFrench ? 'Erreur de chargement des logs' : 'Error loading logs',
    
    // DEBUG LOGS TOGGLE
    debugLogs: isFrench ? 'Logs de Debug' : 'Debug Logs',
    unknown: isFrench ? 'Inconnu' : 'Unknown',
    
    // Toggle Messages
    noUserSelected: isFrench ? 'Aucun utilisateur sélectionné' : 'No user selected',
    debugManagerUnavailable: isFrench ? 'Gestionnaire de debug indisponible' : 'Debug manager unavailable',
    processing: isFrench ? 'Traitement en cours...' : 'Processing...',
    debugLogsEnabled: isFrench ? 'Logs de debug activés (60min)' : 'Debug logs enabled (60min)',
    debugLogsDisabled: isFrench ? 'Logs de debug désactivés' : 'Debug logs disabled',
    debugLogsEnabledShort: isFrench ? 'Logs de debug activés' : 'Debug logs enabled',
    debugLogsDisabledShort: isFrench ? 'Logs de debug désactivés' : 'Debug logs disabled',
    errorPrefix: isFrench ? 'Erreur :' : 'Error:',
    
    // Pagination
    page: isFrench ? 'Page' : 'Page',
    logs: isFrench ? 'logs' : 'logs',
    
    // Last update
    lastUpdate: isFrench ? 'Dernière MAJ:' : 'Last update:',
    neverUpdated: isFrench ? 'Jamais mis à jour' : 'Never updated',
    
    // Modal tabs
    summary: isFrench ? 'Résumé' : 'Summary',
    timeline: isFrench ? 'Timeline' : 'Timeline',
    calls: isFrench ? 'Appels' : 'Calls',
    rawLog: isFrench ? 'Log brut' : 'Raw Log',
    logAnalysis: isFrench ? 'Analyse du log' : 'Log Analysis',
    analysis: isFrench ? 'Analyse' : 'Analysis',
    analysisUnavailable: isFrench ? 'Analyse indisponible' : 'Analysis unavailable',
    
    // Summary tab
    generalInfo: isFrench ? 'Informations générales' : 'General Information',
    operation: isFrench ? 'Opération' : 'Operation',
    status: isFrench ? 'Statut' : 'Status',
    duration: isFrench ? 'Durée' : 'Duration',
    lines: isFrench ? 'Lignes' : 'Lines',
    salesforceLimits: isFrench ? 'Limites Salesforce' : 'Salesforce Limits',
    errors: isFrench ? 'Erreurs' : 'Errors',
    methods: isFrench ? 'Méthodes' : 'Methods',
    
    // Export
    exportRaw: isFrench ? 'Exporter (.txt)' : 'Export (.txt)',
    exportReport: isFrench ? 'Exporter le rapport' : 'Export Report',
    exportTxt: isFrench ? 'Exporter (.txt)' : 'Export (.txt)',
    exportMd: isFrench ? 'Exporter (.md)' : 'Export (.md)',
    copy: isFrench ? 'Copier' : 'Copy',
    copied: isFrench ? 'Copié !' : 'Copied!',
    
    // Call tree
    buildingCallTree: isFrench ? 'Construction de l\'arbre d\'appels...' : 'Building call tree...',
    analyzing: isFrench ? 'Analyse de' : 'Analyzing',
    topSlowestNodes: isFrench ? 'Top 5 des nœuds les plus lents' : 'Top 5 Slowest Nodes',
    callTree: isFrench ? 'Arbre d\'appels' : 'Call Tree',
    searchInTree: isFrench ? 'Rechercher dans l\'arbre...' : 'Search in tree...',
    expandAll: isFrench ? 'Développer tout' : 'Expand All',
    collapseAll: isFrench ? 'Tout replier' : 'Collapse All',
    noNodeFound: isFrench ? 'Aucun nœud trouvé' : 'No node found',
    adjustFilters: isFrench ? 'Ajustez les filtres ou la recherche' : 'Adjust filters or search',
    callTreeError: isFrench ? 'Impossible de construire l\'arbre d\'appels' : 'Unable to build the call tree',
    exportedOn: isFrench ? 'Exporté le' : 'Exported on',
    totalDuration: isFrench ? 'Durée totale' : 'Total Duration',
    totalNodes: isFrench ? 'Nombre de nœuds' : 'Total Nodes',
    totalErrors: isFrench ? 'Erreurs' : 'Errors',
    noSlowNodes: isFrench ? 'Aucun nœud lent détecté' : 'No slow nodes detected',
    generatedBy: isFrench ? 'Généré par' : 'Generated by',
    
    // Filter toggles
    filterBy: isFrench ? 'Filtrer' : 'Filter',
    methods: isFrench ? 'Méthodes' : 'Methods',
    database: isFrench ? 'Base de données' : 'Database',
    debug: isFrench ? 'Debug' : 'Debug',
    errors: isFrench ? 'Erreurs' : 'Errors',
    variables: isFrench ? 'Variables' : 'Variables',
    system: isFrench ? 'Système' : 'System',
    filterMethods: isFrench ? 'Méthodes Apex' : 'Apex Methods',
    filterDatabase: isFrench ? 'Base de données (SOQL/DML)' : 'Database (SOQL/DML)',
    filterDebug: isFrench ? 'Instructions de debug' : 'Debug statements',
    filterErrors: isFrench ? 'Erreurs et Exceptions' : 'Errors & Exceptions',
    filterVariables: isFrench ? 'Variables' : 'Variables',
    filterSystem: isFrench ? 'Événements système' : 'System events',
    
    // Toasts
    exportSuccess: isFrench ? 'Exporté avec succès !' : 'Exported successfully!',
    copySuccess: isFrench ? 'Copié dans le presse-papier !' : 'Copied to clipboard!',
    exportError: isFrench ? 'Erreur lors de l\'export' : 'Export error',
    copyError: isFrench ? 'Erreur lors de la copie' : 'Copy error',
    
    // Filters (legacy)
    eventTypesLabel: isFrench ? 'Types d\'événements:' : 'Event types:',
    minDurationLabel: isFrench ? 'Durée minimale (ms):' : 'Minimum duration (ms):',
    namespaceLabel: isFrench ? 'Namespace :' : 'Namespace:',
    namespaceAll: isFrench ? 'Tous' : 'All',
    namespaceUser: isFrench ? 'Code utilisateur' : 'User code',
    namespaceSystem: isFrench ? 'Code système' : 'System code',
    reset: isFrench ? 'Réinitialiser' : 'Reset',
    searchLogsPlaceholder: isFrench ? 'Rechercher dans les logs...' : 'Search in logs...',
    searchPlaceholder: isFrench ? 'Rechercher...' : 'Search...',
    results: isFrench ? 'résultats' : 'results',
    methodFilterLabel: isFrench ? 'Filtrer par classe/méthode:' : 'Filter by class/method:',
    allMethods: isFrench ? 'Toutes les méthodes' : 'All methods',
    methodsSelected: isFrench ? 'méthode(s) sélectionnée(s)' : 'method(s) selected',
    
    // Misc
    callsSuffix: isFrench ? 'appel(s)' : 'call(s)',
    andOthers: isFrench ? '...et {count} autres' : '...and {count} more',
    location: isFrench ? 'Emplacement' : 'Location',
    limitSoql: isFrench ? 'Requêtes SOQL' : 'SOQL Queries',
    limitDml: isFrench ? 'Instructions DML' : 'DML Statements',
    limitCpu: isFrench ? 'Temps CPU' : 'CPU Time',
    limitHeap: isFrench ? 'Taille du heap' : 'Heap Size',
    
    // Navigation
    previousLog: isFrench ? 'Log précédent' : 'Previous log',
    nextLog: isFrench ? 'Log suivant' : 'Next log',
    loadingLog: isFrench ? 'Chargement du log...' : 'Loading log...',
    logPosition: isFrench ? 'Log {current} sur {total}' : 'Log {current} of {total}',
    noMoreLogs: isFrench ? 'Pas d\'autre log' : 'No more logs',
    
    // Anti-patterns
    antiPatterns: isFrench ? 'Anti-patterns détectés' : 'Detected Anti-patterns',
    noAntiPatterns: isFrench ? 'Aucun anti-pattern détecté' : 'No anti-patterns detected',
    codeHealthy: isFrench ? 'Code sain ! ✨' : 'Code is healthy! ✨',
    healthScore: isFrench ? 'Score de santé' : 'Health Score',
    critical: isFrench ? 'Critique' : 'Critical',
    warning: isFrench ? 'Attention' : 'Warning',
    info: isFrench ? 'Info' : 'Info',
    suggestion: isFrench ? 'Suggestion' : 'Suggestion',
    impact: isFrench ? 'Impact' : 'Impact',
    occurrences: isFrench ? 'Occurrences' : 'Occurrences',
    viewInLog: isFrench ? 'Voir dans le log' : 'View in log',
    showAll: isFrench ? 'Tout afficher' : 'Show all',
    showLess: isFrench ? 'Réduire' : 'Less',
    exportPdf: isFrench ? 'PDF' : 'PDF',
    exportMd: isFrench ? 'MD' : 'MD',
    exportTxt: isFrench ? 'TXT' : 'TXT',
    exportPdfReady: isFrench ? 'PDF prêt - utilisez "Enregistrer en PDF" dans la boîte d\'impression' : 'PDF ready - use "Save as PDF" in print dialog',
    exportSuccess: isFrench ? 'Export réussi' : 'Export successful',
    popupBlocked: isFrench ? 'Popup bloqué par le navigateur' : 'Popup blocked by browser',
    analysisReport: isFrench ? 'Rapport d\'analyse' : 'Analysis Report',
    logInfo: isFrench ? 'Informations du log' : 'Log Information',
    
    // Anti-pattern titles
    soqlInLoop: isFrench ? 'SOQL dans une boucle' : 'SOQL in Loop',
    dmlInLoop: isFrench ? 'DML dans une boucle' : 'DML in Loop',
    nPlusOne: isFrench ? 'Requête N+1' : 'N+1 Query Pattern',
    possibleRecursion: isFrench ? 'Récursion possible' : 'Possible Recursion',
    triggerRecursion: isFrench ? 'Récursion de trigger' : 'Trigger Recursion',
    soqlNoLimit: isFrench ? 'SOQL sans LIMIT' : 'SOQL without LIMIT',
    soqlNoWhere: isFrench ? 'SOQL sans WHERE' : 'SOQL without WHERE',
    soqlNonSelective: isFrench ? 'Requête non-sélective' : 'Non-Selective Query',
    tooManyFields: isFrench ? 'Trop de champs sélectionnés' : 'Too Many Fields Selected',
    highSoqlUsage: isFrench ? 'Utilisation SOQL élevée' : 'High SOQL Usage',
    highDmlUsage: isFrench ? 'Utilisation DML élevée' : 'High DML Usage',
    highCpuUsage: isFrench ? 'Utilisation CPU élevée' : 'High CPU Usage',
    highHeapUsage: isFrench ? 'Utilisation Heap élevée' : 'High Heap Usage',
    deepCallStack: isFrench ? 'Pile d\'appels profonde' : 'Deep Call Stack',
    multipleCallouts: isFrench ? 'Callouts HTTP multiples' : 'Multiple HTTP Callouts',
    excessiveFuture: isFrench ? 'Trop d\'appels async' : 'Excessive Async Calls',
    mixedDml: isFrench ? 'DML mixte (setup/non-setup)' : 'Mixed DML Operations',
    hardcodedId: isFrench ? 'IDs codés en dur' : 'Hardcoded Record IDs',
    validationFailures: isFrench ? 'Échecs de validation' : 'Multiple Validation Failures',
    debugStatements: isFrench ? 'Statements debug excessifs' : 'Excessive Debug Statements',
    calloutAfterDml: isFrench ? 'Callout après DML' : 'Callout After DML',
    largeQueryResult: isFrench ? 'Résultats volumineux' : 'Large Query Results'
  };
})();