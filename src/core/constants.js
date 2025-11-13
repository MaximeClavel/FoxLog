// src/core/constants.js
(function() {
  'use strict';
  
  window.FoxLog = window.FoxLog || {};
  
  window.FoxLog.CONFIG = {
    AUTO_REFRESH_INTERVAL: 5000,
    MAX_LOGS: 100,
    CACHE_DURATION: 30000,
    REFRESH_INTERVAL: 10000,
    DEBUG_MODE: true
  };
  
  window.FoxLog.ICONS = {
    FOXLOG: chrome.runtime.getURL('src/assets/icon128.png'),
    TAIL: chrome.runtime.getURL('src/assets/tail128.png'),
    TRASH: chrome.runtime.getURL('src/assets/trash.png'),
    REFRESH: chrome.runtime.getURL('src/assets/refresh.png')
  };
  
  window.FoxLog.COOKIE_PRIORITY = [
    'my.salesforce.com',
    '.salesforce.com',
    '.force.com',
    'lightning.force.com'
  ];
  
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
  
  // Detect browser language
  const browserLang = navigator.language.toLowerCase();
  const isFrench = browserLang.startsWith('fr');
  
  // UI Translations
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
    
    // Toasts
    exportSuccess: isFrench ? 'Exporté avec succès !' : 'Exported successfully!',
    copySuccess: isFrench ? 'Copié dans le presse-papier !' : 'Copied to clipboard!',
    exportError: isFrench ? 'Erreur lors de l\'export' : 'Export error',
    copyError: isFrench ? 'Erreur lors de la copie' : 'Copy error'
  };
  
  console.log('[FoxLog] Constants loaded');
})();