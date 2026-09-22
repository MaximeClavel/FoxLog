// src/core/constants.js
(function() {
  'use strict';
  
  window.FoxLog = window.FoxLog || {};
  const logger = window.FoxLog.logger || console;

  // ============================================
  // UTILITIES
  // ============================================

  /**
   * Escape HTML special characters to prevent XSS
   * @param {string} unsafe - Raw string potentially containing HTML
   * @returns {string} Escaped string safe for innerHTML
   */
  window.FoxLog.escapeHtml = function(unsafe) {
    if (!unsafe) return '';
    return String(unsafe)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  /**
   * Format a duration for display
   * @param {number} milliseconds - Duration in milliseconds
   * @returns {string} Compact duration, e.g. "96 ms" or "8.46 s"
   */
  window.FoxLog.formatDuration = function(milliseconds) {
    return milliseconds >= 1000 ? `${(milliseconds / 1000).toFixed(2)} s` : `${milliseconds} ms`;
  };
  
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
    REFRESH_INTERVAL: 5000,
    
    // ✅ LOGGER CONFIGURATION
    // Set to false before publishing to production
    DEBUG_MODE: false,           // Enable/disable all logs
    ENABLE_SUCCESS_LOGS: true,  // Show success messages (✅)
    ENABLE_INFO_LOGS: true,     // Show info messages
    ENABLE_WARN_LOGS: true,     // Show warnings (⚠️)
    ENABLE_ERROR_LOGS: true,    // Show errors (❌) - always recommended
    
    // Diff thresholds
    DIFF_THRESHOLD_MS: 50,
    DIFF_THRESHOLD_PERCENT: 200,
    DIFF_IGNORE_SYSTEM: true,
    DIFF_WORKER_TIMEOUT: 10000
  };
  
  // ============================================
  // ICONS
  // ============================================
  window.FoxLog.ICONS = {
    FOXLOG: chrome.runtime.getURL('src/assets/icon128.png'),
    TAIL: chrome.runtime.getURL('src/assets/tail128.png'),
    KOFI: chrome.runtime.getURL('src/assets/logomarkLogo.png')
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
  // STRUCTURED FLOW/VALIDATION EVENT TYPES
  // ============================================
  // Shared by log-parser.js and the src/ui/*-view.js files (all run in
  // this same window context). src/workers/call-tree-worker.js keeps its
  // own duplicate of these three lists -- it's a Web Worker with no
  // access to window/FoxLog globals.

  // Every debug log event type that represents a Flow/Workflow-action-level
  // or Validation-Rule-level error (as opposed to a raw Apex
  // EXCEPTION_THROWN/FATAL_ERROR). The Flow/Workflow ones are confirmed
  // against a real "Workflow: FINER" category log: an explicit fault routed
  // to a Flow element, an interview that failed to start/be created, a
  // Workflow-Rule-launched flow action's error, and an invocable Apex
  // action's error (the case where a Flow calls into Apex that fails).
  // VALIDATION_FAIL/VALIDATION_ERROR/FIELD_CUSTOM_VALIDATION_EXCEPTION are
  // confirmed bare (VALIDATION_FAIL) or defensive alternates (the other
  // two), see tests/flow-error-repro/.
  //
  // FLOW_ACTIONCALL_DETAIL specifically is NOT in this list even though a
  // failed one is a real error: it fires on every action call, success or
  // failure (see _parseFlowActionCallDetail), so callers must additionally
  // check details.success === false / node.hasError before treating one as
  // an error -- see FLOW_DETAIL_TYPES below.
  window.FoxLog.STRUCTURED_ERROR_TYPES = [
    'FLOW_ELEMENT_ERROR',
    'FLOW_ELEMENT_FAULT',
    'FLOW_CREATE_INTERVIEW_ERROR',
    'FLOW_START_INTERVIEWS_ERROR',
    'INVOCABLE_ACTION_ERROR',
    'WF_FLOW_ACTION_ERROR',
    'WF_FLOW_ACTION_ERROR_DETAIL',
    'VALIDATION_FAIL',
    'VALIDATION_ERROR',
    'FIELD_CUSTOM_VALIDATION_EXCEPTION'
  ];

  // Non-error Flow "detail" events: attached as leaf nodes under whichever
  // element/interview is currently open, same treatment as USER_DEBUG/
  // VARIABLE_ASSIGNMENT already get. Field layout confirmed against a real
  // log (see tests/flow-error-repro/) for every entry below.
  // FLOW_ACTIONCALL_DETAIL is here (not STRUCTURED_ERROR_TYPES) because
  // it's only an error when its own details.success is false -- see the
  // comment above.
  window.FoxLog.FLOW_DETAIL_TYPES = [
    'FLOW_RULE_DETAIL',
    'FLOW_ASSIGNMENT_DETAIL',
    'FLOW_VALUE_ASSIGNMENT',
    'FLOW_SUBFLOW_DETAIL',
    'FLOW_LOOP_DETAIL',
    'FLOW_BULK_ELEMENT_DETAIL',
    'FLOW_ACTIONCALL_DETAIL'
  ];

  // Validation Rule execution trace, confirmed against a real log: fires on
  // every DML that runs validation, whether or not any rule ends up
  // failing (VALIDATION_RULE names the rule being evaluated,
  // VALIDATION_FORMULA shows its formula/field values, then either
  // VALIDATION_PASS or VALIDATION_FAIL -- both confirmed bare, no extra
  // fields, see STRUCTURED_ERROR_TYPES above).
  window.FoxLog.VALIDATION_DETAIL_TYPES = [
    'VALIDATION_RULE',
    'VALIDATION_FORMULA',
    'VALIDATION_PASS'
  ];

  // ============================================
  // I18N - INTERNATIONALIZATION
  // ============================================
  const browserLang = navigator.language.toLowerCase();
  const isFrench = browserLang.startsWith('fr');
  
  window.FoxLog.i18n = {
    // Panel
    welcome: isFrench ? 'Bienvenue dans FoxLog !' : 'Welcome to FoxLog!',
    selectUser: isFrench ? 'Sélectionnez un utilisateur' : 'Select a user',
    userPicklistLegend: isFrench ? '● = TraceFlag ou logs disponibles | ○ = Aucune activité' : '● = TraceFlag or logs available | ○ = No activity',
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
    previousPage: isFrench ? 'Page précédente' : 'Previous page',
    nextPage: isFrench ? 'Page suivante' : 'Next page',

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
    toastExportSuccess: isFrench ? 'Exporté avec succès !' : 'Exported successfully!',
    copySuccess: isFrench ? 'Copié dans le presse-papier !' : 'Copied to clipboard!',
    toastExportError: isFrench ? 'Erreur lors de l\'export' : 'Export error',
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
    codeHealthy: isFrench ? 'Code sain !' : 'Code is healthy!',
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
    exportPdfShort: isFrench ? 'PDF' : 'PDF',
    exportMdShort: isFrench ? 'MD' : 'MD',
    exportTxtShort: isFrench ? 'TXT' : 'TXT',
    exportPdfReady: isFrench ? 'PDF prêt - utilisez "Enregistrer en PDF" dans la boîte d\'impression' : 'PDF ready - use "Save as PDF" in print dialog',
    analysisExportSuccess: isFrench ? 'Export réussi' : 'Export successful',
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
    largeQueryResult: isFrench ? 'Résultats volumineux' : 'Large Query Results',
    soqlInjectionRisk: isFrench ? 'Risque d\'injection SOQL' : 'Dynamic SOQL — Injection Risk',
    crudFlsBypass: isFrench ? 'SECURITY_ENFORCED legacy' : 'Legacy WITH SECURITY_ENFORCED',
    insecureEndpoint: isFrench ? 'Endpoint HTTP non sécurisé' : 'Insecure HTTP Endpoint',
    systemModeUsage: isFrench ? 'Mode système explicite — FLS contourné' : 'Explicit System Mode — FLS Bypassed',
    withoutSharing: isFrench ? 'Contexte without sharing' : 'Without Sharing Context',
    
    // Import tab
    tabSalesforce: 'Salesforce',
    tabImport: isFrench ? 'Fichiers' : 'Files',
    importFile: isFrench ? 'Importer un fichier' : 'Import a file',
    importDropOrClick: isFrench ? 'Glissez-déposez un fichier .txt ou .log ici, ou cliquez pour parcourir' : 'Drag & drop a .txt or .log file here, or click to browse',
    importHistory: isFrench ? 'Historique des imports' : 'Import History',
    importNoHistory: isFrench ? 'Aucun log importé' : 'No imported logs',
    importNoHistoryHint: isFrench ? 'Importez un fichier de log pour commencer' : 'Import a log file to get started',
    importStorageUsed: isFrench ? 'Stockage utilisé' : 'Storage used',
    importStorageLimit: isFrench ? 'sur 10 MB' : 'of 10 MB',
    importDelete: isFrench ? 'Supprimer' : 'Delete',
    importDeleteAll: isFrench ? 'Tout supprimer' : 'Delete all',
    importFileTooLarge: isFrench ? 'Fichier trop volumineux (max 5 MB)' : 'File too large (max 5 MB)',
    importInvalidType: isFrench ? 'Type de fichier invalide. Utilisez .txt ou .log' : 'Invalid file type. Use .txt or .log',
    importSuccess: isFrench ? 'Log importé avec succès !' : 'Log imported successfully!',
    importError: isFrench ? 'Erreur lors de l\'import' : 'Import error',
    
    // Diff tab
    diffTab: 'Diff',
    diffSelectLog: isFrench ? 'Sélectionner un log importé à comparer' : 'Select an imported log to compare',
    diffNoImports: isFrench ? 'Importez un log d\'abord (onglet Fichiers)' : 'Import a log first (Files tab)',
    diffImportFile: isFrench ? 'Importer un fichier' : 'Import a file',
    diffOr: isFrench ? 'ou' : 'or',
    diffAdded: isFrench ? 'Ajouté' : 'Added',
    diffRemoved: isFrench ? 'Supprimé' : 'Removed',
    diffChanged: isFrench ? 'Modifié' : 'Changed',
    diffMatch: isFrench ? 'Identique' : 'Identical',
    diffDivergences: isFrench ? 'divergences' : 'divergences',
    diffNoDivergences: isFrench ? 'Aucune divergence' : 'No divergences',
    diffPrev: isFrench ? 'Préc.' : 'Prev',
    diffNext: isFrench ? 'Suiv.' : 'Next',
    diffComputing: isFrench ? 'Calcul du diff...' : 'Computing diff...',
    diffTimeout: isFrench ? 'Le calcul du diff a expiré' : 'Diff computation timed out',
    diffError: isFrench ? 'Erreur lors du calcul du diff' : 'Diff computation error',
    diffLabelFile: isFrench ? 'Fichier de référence' : 'Reference file',
    diffLabelCurrent: isFrench ? 'Log courant' : 'Current log',
    diffOnlyInFile: isFrench ? 'Uniquement dans le fichier' : 'Only in the file',
    diffOnlyInCurrent: isFrench ? 'Uniquement dans le log courant' : 'Only in the current log',
    diffIdenticalLines: isFrench ? '{count} lignes identiques' : '{count} identical lines',
    diffShowIdentical: isFrench ? 'Afficher' : 'Show',
    diffShowAll: isFrench ? 'Afficher toutes les lignes' : 'Show all lines',

    // Flow / Graph tab
    flow: isFrench ? 'Flux' : 'Flow',
    buildingFlowGraph: isFrench ? 'Construction du graphe...' : 'Building graph...',
    flowGraphError: isFrench ? 'Impossible de construire le graphe' : 'Unable to build the graph',
    searchInGraph: isFrench ? 'Rechercher un nœud...' : 'Search a node...',
    fitView: isFrench ? 'Ajuster à la vue' : 'Fit view',
    zoomIn: isFrench ? 'Zoomer' : 'Zoom in',
    zoomOut: isFrench ? 'Dézoomer' : 'Zoom out',
    resetZoom: isFrench ? 'Réinitialiser le zoom' : 'Reset zoom',
    noNodeSelected: isFrench ? 'Aucun nœud sélectionné' : 'No node selected',
    clickNodeForDetails: isFrench ? 'Cliquez sur un nœud du graphe pour voir ses détails' : 'Click a node in the graph to see its details',
    viewInRawLog: isFrench ? 'Voir dans le log brut' : 'View in raw log',
    exclusiveDuration: isFrench ? 'Durée exclusive' : 'Exclusive duration',
    totalDurationLabel: isFrench ? 'Durée totale' : 'Total duration',
    childrenCount: isFrench ? 'Enfants directs' : 'Direct children',
    lineNumber: isFrench ? 'Ligne' : 'Line',
    expandNode: isFrench ? 'Développer' : 'Expand',
    collapseNode: isFrench ? 'Réduire' : 'Collapse',
    moreNodes: isFrench ? 'de plus' : 'more',
    filterTriggersFlows: isFrench ? 'Triggers & Flows' : 'Triggers & Flows',
    filterApex: isFrench ? 'Apex' : 'Apex',
    noGraphResults: isFrench ? 'Aucun nœud ne correspond' : 'No matching node',
    graphTooLargeWarning: isFrench ? 'Arbre volumineux : dévelopement limité en profondeur pour la fluidité' : 'Large tree: expand depth capped to keep things smooth',
    graphNodeList: isFrench ? 'Nœuds notables' : 'Notable nodes'
  };
})();