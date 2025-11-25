// src/core/constants.js
(function() {
  'use strict';
  
  window.FoxLog = window.FoxLog || {};
  const logger = window.FoxLog.logger || console;
  
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
    exportStats: isFrench ? 'Exporter stats (.json)' : 'Export stats (.json)',
    exportRaw: isFrench ? 'Exporter (.txt)' : 'Export (.txt)',
    copy: isFrench ? 'Copier' : 'Copy',
    copied: isFrench ? 'Copié !' : 'Copied!',
    
    // Call tree
    buildingCallTree: isFrench ? 'Construction de l\'arbre d\'appels...' : 'Building call tree...',
    analyzing: isFrench ? 'Analyse de' : 'Analyzing',
    topSlowestNodes: isFrench ? 'Top 5 des nœuds les plus lents' : 'Top 5 Slowest Nodes',
    searchInTree: isFrench ? 'Rechercher dans l\'arbre...' : 'Search in tree...',
    expandAll: isFrench ? 'Développer tout' : 'Expand All',
    collapseAll: isFrench ? 'Tout replier' : 'Collapse All',
    errorsOnly: isFrench ? 'Erreurs uniquement' : 'Errors Only',
    noNodeFound: isFrench ? 'Aucun nœud trouvé' : 'No node found',
    adjustFilters: isFrench ? 'Ajustez les filtres ou la recherche' : 'Adjust filters or search',
    callTreeError: isFrench ? 'Impossible de construire l\'arbre d\'appels' : 'Unable to build the call tree',
    
    // Toasts
    exportSuccess: isFrench ? 'Exporté avec succès !' : 'Exported successfully!',
    copySuccess: isFrench ? 'Copié dans le presse-papier !' : 'Copied to clipboard!',
    exportError: isFrench ? 'Erreur lors de l\'export' : 'Export error',
    copyError: isFrench ? 'Erreur lors de la copie' : 'Copy error',
    
    // Filters
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
    limitHeap: isFrench ? 'Taille du heap' : 'Heap Size'
  };
})();