// src/services/salesforce-api.js (REFACTORÉ - Toutes les API centralisées)
(function() {
  'use strict';
  
  window.FoxLog = window.FoxLog || {};
  
  const getLogger = () => window.FoxLog.logger || console;
  const getSessionManager = () => window.FoxLog.sessionManager;

  class SalesforceAPI {
    constructor() {
      this.baseUrl = null;
      this.logger = getLogger();
      this.apiVersion = 'v62.0';
    }

    async initialize() {
      this.logger = getLogger();
      this.baseUrl = this._getBaseUrl();
      this.logger.log('API initialized', this.baseUrl);
    }

    _getBaseUrl() {
      const hostname = window.location.hostname;
      return hostname.replace('lightning.force.com', 'my.salesforce.com');
    }

    /**
     * Generic method to make Tooling API requests
     * @private
     */
    async _toolingRequest(method, endpoint, body = null) {
      const sessionManager = getSessionManager();
      const sessionId = await sessionManager.getSessionId(window.location.href);
      
      if (!sessionId) {
        throw new Error('No session ID available');
      }

      const url = `https://${this.baseUrl}/services/data/${this.apiVersion}/tooling/${endpoint}`;
      
      const options = {
        method: method,
        headers: {
          'Authorization': `Bearer ${sessionId}`,
          'Content-Type': 'application/json'
        }
      };

      if (body && (method === 'POST' || method === 'PATCH')) {
        options.body = JSON.stringify(body);
      }

      const response = await fetch(url, options);
      
      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`Tooling API error: ${response.status} - ${errorText}`);
        throw new Error(`API error: ${response.status} - ${errorText}`);
      }

      // DELETE returns 204 No Content
      if (response.status === 204) {
        return { success: true };
      }

      return await response.json();
    }

    /**
     * Generic method to make REST API requests (non-Tooling)
     * @private
     */
    async _restRequest(method, endpoint, body = null) {
      const sessionManager = getSessionManager();
      const sessionId = await sessionManager.getSessionId(window.location.href);
      
      if (!sessionId) {
        throw new Error('No session ID available');
      }

      const url = `https://${this.baseUrl}/services/data/${this.apiVersion}/${endpoint}`;
      
      const options = {
        method: method,
        headers: {
          'Authorization': `Bearer ${sessionId}`,
          'Content-Type': 'application/json'
        }
      };

      if (body && (method === 'POST' || method === 'PATCH')) {
        options.body = JSON.stringify(body);
      }

      const response = await fetch(url, options);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error: ${response.status} - ${errorText}`);
      }

      if (response.status === 204) {
        return { success: true };
      }

      return await response.json();
    }

    // ============================================
    // 👤 USER METHODS
    // ============================================

    /**
     * Get current user info
     */
    async getCurrentUser() {
      const query = `SELECT Id, Name FROM User WHERE Id = UserInfo.getUserId()`;
      const data = await this._restRequest('GET', `query?q=${encodeURIComponent(query)}`);
      const user = data.records?.[0];
      return user ? { id: user.Id, name: user.Name } : null;
    }

    /**
     * Fetch users with TraceFlags AND/OR ApexLogs
     */
    async fetchUsersWithLogs() {
      // Query 1: Users with logs
      const queryLogs = `
        SELECT LogUserId, COUNT(Id) LogCount
        FROM ApexLog
        WHERE LogUserId != null
        GROUP BY LogUserId
        ORDER BY COUNT(Id) DESC
        LIMIT 50
      `;

      // Query 2: Users with active TraceFlag
      const queryFlag = `
        SELECT TracedEntityId, TracedEntity.Name, DebugLevel.DeveloperName
        FROM TraceFlag
        WHERE LogType = 'USER_DEBUG'
        AND TracedEntityId != null
      `;

      let dataLog = { records: [] };
      let dataFlag = { records: [] };

      // Fetch logs
      try {
        dataLog = await this._restRequest('GET', `query?q=${encodeURIComponent(queryLogs)}`);
        this.logger.log(`Found ${dataLog.records?.length || 0} users with logs`);
      } catch (error) {
        this.logger.error('Error fetching users with logs', error);
      }

      // Fetch user names
      let userNames = new Map();
      if (dataLog.records && dataLog.records.length > 0) {
        const userIds = dataLog.records.map(r => r.LogUserId);
        const queryUsers = `
          SELECT Id, Name
          FROM User
          WHERE Id IN ('${userIds.join("','")}')
        `;
        
        try {
          const dataUsers = await this._restRequest('GET', `query?q=${encodeURIComponent(queryUsers)}`);
          dataUsers.records.forEach(user => {
            userNames.set(user.Id, user.Name);
          });
          this.logger.log(`Fetched names for ${userNames.size} users`);
        } catch (error) {
          this.logger.error('Error fetching user names', error);
        }
      }

      // Fetch TraceFlags
      try {
        dataFlag = await this._toolingRequest('GET', `query?q=${encodeURIComponent(queryFlag)}`);
        this.logger.log(`Found ${dataFlag.records?.length || 0} users with TraceFlags`);
      } catch (error) {
        this.logger.warn('Error fetching TraceFlags', error);
      }

      // Build user map
      const usersMap = new Map();

      // Add users with logs
      (dataLog.records || []).forEach(record => {
        const userId = record.LogUserId;
        const userName = userNames.get(userId) || 'Unknown User';
        const logCount = record.LogCount || record.expr0 || 0;

        usersMap.set(userId, {
          id: userId,
          name: userName,
          logCount: logCount,
          debugLevel: null,
          hasTraceFlag: false
        });
      });

      // Add/Update users with TraceFlag
      (dataFlag.records || []).forEach(flag => {
        const userId = flag.TracedEntityId;
        const userName = flag.TracedEntity?.Name || 'Unknown User';
        const debugLevel = flag.DebugLevel?.DeveloperName || 'N/A';

        const existingUser = usersMap.get(userId);

        if (existingUser) {
          existingUser.debugLevel = debugLevel;
          existingUser.hasTraceFlag = true;
        } else {
          usersMap.set(userId, {
            id: userId,
            name: userName,
            logCount: 0,
            debugLevel: debugLevel,
            hasTraceFlag: true
          });
        }
      });

      // Convert and sort
      const users = Array.from(usersMap.values()).sort((a, b) => {
        if (a.hasTraceFlag && !b.hasTraceFlag) return -1;
        if (!a.hasTraceFlag && b.hasTraceFlag) return 1;
        if (b.logCount !== a.logCount) return b.logCount - a.logCount;
        return a.name.localeCompare(b.name);
      });

      this.logger.success(`Loaded ${users.length} users`);
      return users;
    }

    // ============================================
    // 📋 LOG METHODS
    // ============================================

    /**
     * Fetch ApexLogs for a user
     */
    async fetchLogs(userId, limit = 100) {
      const query = `
        SELECT Id, LogUserId, LogLength, Operation, Request, Status, 
               DurationMilliseconds, StartTime, Location 
        FROM ApexLog 
        WHERE LogUserId='${userId}' 
        ORDER BY StartTime DESC 
        LIMIT ${limit}
      `;
      
      const data = await this._restRequest('GET', `query?q=${encodeURIComponent(query)}`);
      return data.records || [];
    }

    /**
     * Fetch ApexLog body
     */
    async fetchLogBody(logId) {
      const sessionManager = getSessionManager();
      const sessionId = await sessionManager.getSessionId(window.location.href);
      
      if (!sessionId) {
        throw new Error('No session ID available');
      }

      const url = `https://${this.baseUrl}/services/data/${this.apiVersion}/sobjects/ApexLog/${logId}/Body`;

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${sessionId}`
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch log body: ${response.status}`);
      }

      return response.text();
    }

    /**
     * Delete an ApexLog
     */
    async deleteLog(logId) {
      try {
        await this._restRequest('DELETE', `sobjects/ApexLog/${logId}`);
        return true;
      } catch (error) {
        this.logger.error('Failed to delete log', error);
        return false;
      }
    }

    // ============================================
    // 🐛 DEBUG LEVEL / TRACE FLAG METHODS
    // ============================================

    /**
     * Get active TraceFlag for a user
     */
    async getActiveTraceFlag(userId) {
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

      try {
        const data = await this._toolingRequest('GET', `query?q=${encodeURIComponent(query)}`);
        return data.records?.[0] || null;
      } catch (error) {
        this.logger.error('Error getting TraceFlag', error);
        return null;
      }
    }

    /**
     * Get or find a DebugLevel by name
     */
    async getDebugLevel(developerName) {
      const query = `
        SELECT Id, DeveloperName
        FROM DebugLevel
        WHERE DeveloperName = '${developerName}'
        LIMIT 1
      `;

      try {
        const data = await this._toolingRequest('GET', `query?q=${encodeURIComponent(query)}`);
        return data.records?.[0] || null;
      } catch (error) {
        this.logger.error('Error getting DebugLevel', error);
        return null;
      }
    }

    /**
     * Create a custom DebugLevel
     */
    async createDebugLevel(config) {
      try {
        const data = await this._toolingRequest('POST', 'sobjects/DebugLevel', config);
        this.logger.success('DebugLevel created:', data.id);
        return { id: data.id, success: true };
      } catch (error) {
        this.logger.error('Error creating DebugLevel', error);
        throw error;
      }
    }

    /**
     * Create a TraceFlag
     */
    async createTraceFlag(config) {
      try {
        const data = await this._toolingRequest('POST', 'sobjects/TraceFlag', config);
        this.logger.success('TraceFlag created:', data.id);
        return { id: data.id, success: true };
      } catch (error) {
        this.logger.error('Error creating TraceFlag', error);
        throw error;
      }
    }

    /**
     * Delete a TraceFlag
     */
    async deleteTraceFlag(traceFlagId) {
      try {
        await this._toolingRequest('DELETE', `sobjects/TraceFlag/${traceFlagId}`);
        this.logger.success('TraceFlag deleted');
        return true;
      } catch (error) {
        this.logger.error('Error deleting TraceFlag', error);
        return false;
      }
    }
  }

  window.FoxLog.salesforceAPI = new SalesforceAPI();
  
  const logger = getLogger();
  logger.log('Salesforce API loaded');
})();