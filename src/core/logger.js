// src/core/logger.js
(function() {
  'use strict';
  
  window.FoxLog = window.FoxLog || {};
  
  class Logger {
    constructor(prefix = 'FoxLog', enabled = true) {
      this.prefix = prefix;
      this.enabled = enabled;
    }

    log(message, data = null) {
      if (!this.enabled) return;
      console.log(`[${this.prefix}] ${message}`, data || '');
    }

    error(message, error = null) {
      console.error(`[${this.prefix}] ❌ ${message}`, error || '');
    }

    success(message, data = null) {
      if (!this.enabled) return;
      console.log(`[${this.prefix}] ✅ ${message}`, data || '');
    }

    warn(message, data = null) {
      if (!this.enabled) return;
      console.warn(`[${this.prefix}] ⚠️ ${message}`, data || '');
    }
  }

  window.FoxLog.logger = new Logger('FoxLog', window.FoxLog.CONFIG?.DEBUG_MODE);
  console.log('[FoxLog] Logger loaded');
})();