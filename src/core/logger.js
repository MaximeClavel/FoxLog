// src/core/logger.js
(function() {
  'use strict';
  
  window.FoxLog = window.FoxLog || {};
  
  class Logger {
    constructor(prefix = 'FoxLog') {
      this.prefix = prefix;
    }

    /**
     * Check if logging is enabled based on CONFIG
     * @private
     */
    _isEnabled(level) {
      const config = window.FoxLog.CONFIG;
      if (!config) return true; // Fallback if config not loaded yet
      
      // Always respect DEBUG_MODE as master switch
      if (!config.DEBUG_MODE) return false;
      
      // Check specific level flags
      switch (level) {
        case 'success':
          return config.ENABLE_SUCCESS_LOGS !== false;
        case 'info':
          return config.ENABLE_INFO_LOGS !== false;
        case 'warn':
          return config.ENABLE_WARN_LOGS !== false;
        case 'error':
          return config.ENABLE_ERROR_LOGS !== false;
        default:
          return config.DEBUG_MODE;
      }
    }

    /**
     * Info/Log message (default level)
     */
    log(message, data = null) {
      if (!this._isEnabled('info')) return;
      
      if (data !== null && data !== undefined && data !== '') {
        console.log(`[${this.prefix}] ${message}`, data);
      } else {
        console.log(`[${this.prefix}] ${message}`);
      }
    }

    /**
     * Success message (green checkmark)
     */
    success(message, data = null) {
      if (!this._isEnabled('success')) return;
      
      if (data !== null && data !== undefined && data !== '') {
        console.log(`[${this.prefix}] ✅ ${message}`, data);
      } else {
        console.log(`[${this.prefix}] ✅ ${message}`);
      }
    }

    /**
     * Warning message (yellow warning)
     */
    warn(message, data = null) {
      if (!this._isEnabled('warn')) return;
      
      if (data !== null && data !== undefined && data !== '') {
        console.warn(`[${this.prefix}] ⚠️ ${message}`, data);
      } else {
        console.warn(`[${this.prefix}] ⚠️ ${message}`);
      }
    }

    /**
     * Error message (red cross)
     * Note: Errors are always logged unless DEBUG_MODE is completely off
     */
    error(message, error = null) {
      if (!this._isEnabled('error')) return;
      
      if (error !== null && error !== undefined && error !== '') {
        console.error(`[${this.prefix}] ❌ ${message}`, error);
      } else {
        console.error(`[${this.prefix}] ❌ ${message}`);
      }
    }

    /**
     * Group logs together (collapsible in console)
     */
    group(title, callback) {
      if (!this._isEnabled('info')) {
        // Execute callback but don't create group
        if (callback) callback();
        return;
      }
      
      console.group(`[${this.prefix}] ${title}`);
      if (callback) callback();
      console.groupEnd();
    }

    /**
     * Collapsed group
     */
    groupCollapsed(title, callback) {
      if (!this._isEnabled('info')) {
        if (callback) callback();
        return;
      }
      
      console.groupCollapsed(`[${this.prefix}] ${title}`);
      if (callback) callback();
      console.groupEnd();
    }

    /**
     * Table display (useful for arrays/objects)
     */
    table(data, label = '') {
      if (!this._isEnabled('info')) return;
      
      if (label) {
        console.log(`[${this.prefix}] ${label}`);
      }
      console.table(data);
    }

    /**
     * Time measurement
     */
    time(label) {
      if (!this._isEnabled('info')) return;
      console.time(`[${this.prefix}] ${label}`);
    }

    timeEnd(label) {
      if (!this._isEnabled('info')) return;
      console.timeEnd(`[${this.prefix}] ${label}`);
    }
  }

  // Create global logger instance
  window.FoxLog.logger = new Logger('FoxLog');
  
  // Log initialization (always shown)
  const config = window.FoxLog.CONFIG;
  if (config) {
    const enabledFlags = [];
    
    if (config.DEBUG_MODE) {
      
      if (config.ENABLE_SUCCESS_LOGS) enabledFlags.push('ENABLE_SUCCESS_LOGS');
      if (config.ENABLE_INFO_LOGS) enabledFlags.push('ENABLE_INFO_LOGS');
      if (config.ENABLE_WARN_LOGS) enabledFlags.push('ENABLE_WARN_LOGS');
      if (config.ENABLE_ERROR_LOGS) enabledFlags.push('ENABLE_ERROR_LOGS');
      
      const flagsMessage = enabledFlags.length > 0 ? enabledFlags.join(', ') : 'None';
      console.log(`[FoxLog] Logger loaded - Debug enabled : ${flagsMessage}`);
    }
  } else {
    console.log('[FoxLog] Logger loaded - Debug: CONFIG not loaded yet');
  }
})();