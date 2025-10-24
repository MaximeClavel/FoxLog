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
  
  console.log('[FoxLog] Constants loaded');
})();
