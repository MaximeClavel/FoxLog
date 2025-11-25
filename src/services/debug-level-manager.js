// src/services/debug-level-manager.js
(function() {
  'use strict';
  
  window.FoxLog = window.FoxLog || {};
  const logger = window.FoxLog.logger || console;

  /**
   * Service to manage TraceFlags and DebugLevels
   * Inspired by Salesforce Inspector Reloaded
   */
  class DebugLevelManager {
    constructor() {
      this.defaultDebugLevelName = 'SFDC_DevConsole';
      this.customDebugLevelName = 'FoxLog_Debug_Level';
      this.traceFlagDuration = 60; // Minutes (1 hour)
    }

    /**
     * Check if user has an active TraceFlag
     * @param {string} userId - User ID
     * @returns {Promise<Object|null>} TraceFlag or null
     */
    async getActiveTraceFlag(userId) {
      const { salesforceAPI, sessionManager } = window.FoxLog;
      const sessionId = await sessionManager.getSessionId(window.location.href);
      
      if (!sessionId) {
        throw new Error('No session ID available');
      }

      const baseUrl = salesforceAPI.baseUrl || 
        window.location.hostname.replace('lightning.force.com', 'my.salesforce.com');

      const query = `
        SELECT Id, TracedEntityId, DebugLevelId, DebugLevel.DeveloperName, 
               ExpirationDate, LogType, StartDate
        FROM TraceFlag
        WHERE TracedEntityId = '${userId}'
        AND LogType = 'USER_DEBUG'
        AND ExpirationDate >= TODAY
        ORDER BY ExpirationDate DESC
        LIMIT 1
      `;

      const url = `https://${baseUrl}/services/data/v62.0/tooling/query?q=${encodeURIComponent(query)}`;

      try {
        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${sessionId}`,
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          logger.error(`Failed to get TraceFlag: ${response.status}`);
          return null;
        }

        const data = await response.json();
        return data.records?.[0] || null;
      } catch (error) {
        logger.error('Error getting TraceFlag', error);
        return null;
      }
    }

    /**
     * Get or create a DebugLevel for FoxLog
     * @returns {Promise<string>} DebugLevel ID
     */
    async getOrCreateDebugLevel() {
      const { salesforceAPI, sessionManager } = window.FoxLog;
      const sessionId = await sessionManager.getSessionId(window.location.href);
      
      if (!sessionId) {
        throw new Error('No session ID available');
      }

      const baseUrl = salesforceAPI.baseUrl || 
        window.location.hostname.replace('lightning.force.com', 'my.salesforce.com');

      // Try to get existing custom DebugLevel
      const queryCustom = `
        SELECT Id, DeveloperName
        FROM DebugLevel
        WHERE DeveloperName = '${this.customDebugLevelName}'
        LIMIT 1
      `;

      let url = `https://${baseUrl}/services/data/v62.0/tooling/query?q=${encodeURIComponent(queryCustom)}`;

      try {
        let response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${sessionId}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const data = await response.json();
          if (data.records?.[0]) {
            logger.log('Using existing custom DebugLevel:', data.records[0].Id);
            return data.records[0].Id;
          }
        }

        // Fallback: use default SFDC_DevConsole DebugLevel
        const queryDefault = `
          SELECT Id, DeveloperName
          FROM DebugLevel
          WHERE DeveloperName = '${this.defaultDebugLevelName}'
          LIMIT 1
        `;

        url = `https://${baseUrl}/services/data/v62.0/tooling/query?q=${encodeURIComponent(queryDefault)}`;

        response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${sessionId}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const data = await response.json();
          if (data.records?.[0]) {
            logger.log('Using default DebugLevel:', data.records[0].Id);
            return data.records[0].Id;
          }
        }

        // If neither exists, try to create custom one
        return await this._createDebugLevel(sessionId, baseUrl);

      } catch (error) {
        logger.error('Error getting DebugLevel', error);
        throw error;
      }
    }

    /**
     * Create a custom DebugLevel
     * @private
     */
    async _createDebugLevel(sessionId, baseUrl) {
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

      const url = `https://${baseUrl}/services/data/v62.0/tooling/sobjects/DebugLevel`;

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${sessionId}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(debugLevelConfig)
        });

        if (!response.ok) {
          const errorText = await response.text();
          logger.error(`Failed to create DebugLevel: ${response.status} - ${errorText}`);
          throw new Error('Cannot create DebugLevel');
        }

        const data = await response.json();
        logger.success('Created custom DebugLevel:', data.id);
        return data.id;

      } catch (error) {
        logger.error('Error creating DebugLevel', error);
        throw error;
      }
    }

    /**
     * Enable debug logs for a user (create TraceFlag)
     * @param {string} userId - User ID
     * @param {number} durationMinutes - Duration in minutes (default 60)
     * @returns {Promise<Object>} Created TraceFlag
     */
    async enableDebugLogs(userId, durationMinutes = null) {
      logger.log(`Enabling debug logs for user: ${userId}`);

      // Get or create DebugLevel
      const debugLevelId = await this.getOrCreateDebugLevel();
      
      const { salesforceAPI, sessionManager } = window.FoxLog;
      const sessionId = await sessionManager.getSessionId(window.location.href);
      
      if (!sessionId) {
        throw new Error('No session ID available');
      }

      const baseUrl = salesforceAPI.baseUrl || 
        window.location.hostname.replace('lightning.force.com', 'my.salesforce.com');

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

      const url = `https://${baseUrl}/services/data/v62.0/tooling/sobjects/TraceFlag`;

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${sessionId}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(traceFlagConfig)
        });

        if (!response.ok) {
          const errorText = await response.text();
          logger.error(`Failed to create TraceFlag: ${response.status} - ${errorText}`);
          throw new Error(`Cannot create TraceFlag: ${response.status}`);
        }

        const data = await response.json();
        logger.success('TraceFlag created successfully:', data.id);
        
        return {
          id: data.id,
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
     * Disable debug logs for a user (delete TraceFlag)
     * @param {string} traceFlagId - TraceFlag ID
     * @returns {Promise<boolean>} Success
     */
    async disableDebugLogs(traceFlagId) {
      logger.log(`Disabling debug logs: ${traceFlagId}`);

      const { salesforceAPI, sessionManager } = window.FoxLog;
      const sessionId = await sessionManager.getSessionId(window.location.href);
      
      if (!sessionId) {
        throw new Error('No session ID available');
      }

      const baseUrl = salesforceAPI.baseUrl || 
        window.location.hostname.replace('lightning.force.com', 'my.salesforce.com');

      const url = `https://${baseUrl}/services/data/v62.0/tooling/sobjects/TraceFlag/${traceFlagId}`;

      try {
        const response = await fetch(url, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${sessionId}`
          }
        });

        if (!response.ok) {
          logger.error(`Failed to delete TraceFlag: ${response.status}`);
          return false;
        }

        logger.success('TraceFlag deleted successfully');
        return true;

      } catch (error) {
        logger.error('Error deleting TraceFlag', error);
        return false;
      }
    }

    /**
     * Toggle debug logs for a user
     * @param {string} userId - User ID
     * @param {number} durationMinutes - Duration if enabling
     * @returns {Promise<Object>} { enabled: boolean, traceFlag: Object|null }
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
     * Get debug status for a user 
     * @param {string} userId - User ID
     * @returns {Promise<Object>} Status object
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

      // Parse ExpirationDate correctly
      const expiration = new Date(traceFlag.ExpirationDate);
      const now = new Date();
      
      // Calculate remaining time correctly
      const remainingMs = expiration.getTime() - now.getTime();
      const remainingMinutes = Math.floor(remainingMs / 60000);

      // Log for debugging
      logger.log('Debug status calculation:', {
        expirationISO: traceFlag.ExpirationDate,
        expirationDate: expiration.toISOString(),
        now: now.toISOString(),
        remainingMs,
        remainingMinutes
      });

      // Handle expired TraceFlag (shouldn't happen but just in case)
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