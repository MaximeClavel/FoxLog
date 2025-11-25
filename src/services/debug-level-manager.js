// src/services/debug-level-manager.js (REFACTORÉ - Utilise salesforce-api.js)
(function() {
  'use strict';
  
  window.FoxLog = window.FoxLog || {};
  const logger = window.FoxLog.logger || console;

  /**
   * Service to manage TraceFlags and DebugLevels
   * ✅ REFACTORÉ: Utilise salesforce-api.js pour tous les appels API
   */
  class DebugLevelManager {
    constructor() {
      this.defaultDebugLevelName = 'SFDC_DevConsole';
      this.customDebugLevelName = 'FoxLog_Debug_Level';
      this.traceFlagDuration = 60; // Minutes (1 hour)
    }

    /**
     * Get API service
     * @private
     */
    _getAPI() {
      return window.FoxLog.salesforceAPI;
    }

    /**
     * ✅ Check if user has an active TraceFlag
     * Utilise salesforce-api.js au lieu de faire un fetch direct
     */
    async getActiveTraceFlag(userId) {
      const api = this._getAPI();
      return await api.getActiveTraceFlag(userId);
    }

    /**
     * ✅ Get or create a DebugLevel for FoxLog
     * Utilise salesforce-api.js
     */
    async getOrCreateDebugLevel() {
      const api = this._getAPI();

      // Try custom DebugLevel
      logger.log('Looking for custom DebugLevel:', this.customDebugLevelName);
      let debugLevel = await api.getDebugLevel(this.customDebugLevelName);
      
      if (debugLevel) {
        logger.log('Using existing custom DebugLevel:', debugLevel.Id);
        return debugLevel.Id;
      }

      // Fallback: default SFDC_DevConsole
      logger.log('Looking for default DebugLevel:', this.defaultDebugLevelName);
      debugLevel = await api.getDebugLevel(this.defaultDebugLevelName);
      
      if (debugLevel) {
        logger.log('Using default DebugLevel:', debugLevel.Id);
        return debugLevel.Id;
      }

      // If neither exists, create custom one
      logger.log('No DebugLevel found, creating custom one...');
      return await this._createDebugLevel();
    }

    /**
     * ✅ Create a custom DebugLevel
     * Utilise salesforce-api.js
     * @private
     */
    async _createDebugLevel() {
      const api = this._getAPI();
      
      const debugLevelConfig = {
        DeveloperName: this.customDebugLevelName,
        MasterLabel: 'FoxLog Debug Level',
        // Detailed logging for debugging
        ApexCode: 'FINEST',
        ApexProfiling: 'FINEST',
        Callout: 'FINEST',
        Database: 'FINEST',
        System: 'DEBUG',
        Validation: 'INFO',
        Visualforce: 'FINE',
        Workflow: 'INFO'
      };

      try {
        const result = await api.createDebugLevel(debugLevelConfig);
        logger.success('Created custom DebugLevel:', result.id);
        return result.id;
      } catch (error) {
        logger.error('Error creating DebugLevel', error);
        throw error;
      }
    }

    /**
     * ✅ Enable debug logs for a user (create TraceFlag)
     * Utilise salesforce-api.js
     */
    async enableDebugLogs(userId, durationMinutes = null) {
      logger.log(`Enabling debug logs for user: ${userId}`);

      // Get or create DebugLevel
      const debugLevelId = await this.getOrCreateDebugLevel();
      const api = this._getAPI();

      const duration = durationMinutes || this.traceFlagDuration;
      const startDate = new Date();
      const expirationDate = new Date(startDate.getTime() + duration * 60000);

      const traceFlagConfig = {
        TracedEntityId: userId,
        DebugLevelId: debugLevelId,
        LogType: 'USER_DEBUG',
        StartDate: startDate.toISOString(),
        ExpirationDate: expirationDate.toISOString()
      };

      try {
        const result = await api.createTraceFlag(traceFlagConfig);
        logger.success('TraceFlag created successfully:', result.id);
        
        return {
          id: result.id,
          userId: userId,
          debugLevelId: debugLevelId,
          expirationDate: expirationDate.toISOString(),
          duration: duration
        };
      } catch (error) {
        logger.error('Error creating TraceFlag', error);
        throw error;
      }
    }

    /**
     * ✅ Disable debug logs for a user (delete TraceFlag)
     * Utilise salesforce-api.js
     */
    async disableDebugLogs(traceFlagId) {
      logger.log(`Disabling debug logs: ${traceFlagId}`);
      const api = this._getAPI();
      
      try {
        const success = await api.deleteTraceFlag(traceFlagId);
        if (success) {
          logger.success('TraceFlag deleted successfully');
        }
        return success;
      } catch (error) {
        logger.error('Error deleting TraceFlag', error);
        return false;
      }
    }

    /**
     * Toggle debug logs for a user
     */
    async toggleDebugLogs(userId, durationMinutes = null) {
      const existingTraceFlag = await this.getActiveTraceFlag(userId);

      if (existingTraceFlag) {
        // Disable
        const success = await this.disableDebugLogs(existingTraceFlag.Id);
        return {
          enabled: false,
          traceFlag: null,
          success: success
        };
      } else {
        // Enable
        try {
          const traceFlag = await this.enableDebugLogs(userId, durationMinutes);
          return {
            enabled: true,
            traceFlag: traceFlag,
            success: true
          };
        } catch (error) {
          return {
            enabled: false,
            traceFlag: null,
            success: false,
            error: error.message
          };
        }
      }
    }

    /**
     * ✅ Get debug status for a user (correct time calculation)
     */
    async getDebugStatus(userId) {
      const traceFlag = await this.getActiveTraceFlag(userId);
      
      if (!traceFlag) {
        return {
          enabled: false,
          message: 'Debug logs disabled',
          icon: '⚪',
          className: 'sf-debug-disabled'
        };
      }

      // ✅ Parse ExpirationDate correctly
      const expiration = new Date(traceFlag.ExpirationDate);
      const now = new Date();
      
      // ✅ Calculate remaining time correctly
      const remainingMs = expiration.getTime() - now.getTime();
      const remainingMinutes = Math.floor(remainingMs / 60000);

      // ✅ Log for debugging
      logger.log('Debug status calculation:', {
        expirationISO: traceFlag.ExpirationDate,
        expirationDate: expiration.toISOString(),
        now: now.toISOString(),
        remainingMs,
        remainingMinutes
      });

      // ✅ Handle expired TraceFlag
      if (remainingMinutes <= 0) {
        return {
          enabled: false,
          message: 'Debug logs expired',
          icon: '🔴',
          className: 'sf-debug-disabled'
        };
      }

      return {
        enabled: true,
        traceFlagId: traceFlag.Id,
        debugLevel: traceFlag.DebugLevel?.DeveloperName || 'N/A',
        expirationDate: expiration,
        remainingMinutes: remainingMinutes,
        message: `Active for ${remainingMinutes}min`,
        icon: '🟢',
        className: 'sf-debug-enabled'
      };
    }
  }

  window.FoxLog.debugLevelManager = new DebugLevelManager();
  logger.log('[FoxLog] Debug Level Manager loaded');
})();