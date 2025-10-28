// src/services/salesforce-api.js
(function() {
  'use strict';
  
  window.FoxLog = window.FoxLog || {};
  const { logger, sessionManager } = window.FoxLog;

  class SalesforceAPI {
    constructor() {
      this.baseUrl = null;
    }

    async initialize() {
      this.baseUrl = this._getBaseUrl();
      logger.log('API initialized', this.baseUrl);
    }

    _getBaseUrl() {
      const hostname = window.location.hostname;
      return hostname.replace('lightning.force.com', 'my.salesforce.com');
    }

    /**
     * ✨ NOUVEAU : Récupérer les utilisateurs avec des debug logs actifs
     */
    async fetchUsersWithLogs() {
      const sessionId = await sessionManager.getSessionId(window.location.href);
      if (!sessionId) {
        throw new Error('No session ID available');
      }

      // Query pour récupérer les utilisateurs uniques avec des logs dans les dernières 24h
      const query = `
        SELECT LogUserId, LogUser.Name, COUNT(Id) LogCount
        FROM ApexLog
        WHERE StartTime >= LAST_N_DAYS:1
        GROUP BY LogUserId, LogUser.Name
        ORDER BY COUNT(Id) DESC
      `;
      
      const url = `https://${this.baseUrl}/services/data/v62.0/query?q=${encodeURIComponent(query)}`;

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${sessionId}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      
      // Transformer les résultats
      return (data.records || []).map(record => ({
        id: record.LogUserId,
        name: record.LogUser?.Name || 'Unknown User',
        logCount: record.LogCount
      }));
    }

    /**
     * ✨ NOUVEAU : Récupérer les infos de l'utilisateur courant
     */
    async getCurrentUser() {
      const sessionId = await sessionManager.getSessionId(window.location.href);
      if (!sessionId) {
        throw new Error('No session ID available');
      }

      const query = `SELECT Id, Name FROM User WHERE Id = UserInfo.getUserId()`;
      const url = `https://${this.baseUrl}/services/data/v62.0/query?q=${encodeURIComponent(query)}`;

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${sessionId}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      const user = data.records?.[0];
      
      return user ? {
        id: user.Id,
        name: user.Name
      } : null;
    }

    async fetchLogs(userId, limit = 100) {
      const sessionId = await sessionManager.getSessionId(window.location.href);
      if (!sessionId) {
        throw new Error('No session ID available');
      }

      const query = `SELECT Id, LogUserId, LogLength, Operation, Request, Status, DurationMilliseconds, StartTime, Location FROM ApexLog WHERE LogUserId='${userId}' ORDER BY StartTime DESC LIMIT ${limit}`;
      
      const url = `https://${this.baseUrl}/services/data/v62.0/query?q=${encodeURIComponent(query)}`;

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${sessionId}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      return data.records || [];
    }

    async fetchLogBody(logId) {
      const sessionId = await sessionManager.getSessionId(window.location.href);
      if (!sessionId) {
        throw new Error('No session ID available');
      }

      const url = `https://${this.baseUrl}/services/data/v62.0/sobjects/ApexLog/${logId}/Body`;

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
     * Récupérer les utilisateurs avec des debug logs actifs
     */
    async fetchUsersWithLogs() {
      const sessionId = await sessionManager.getSessionId(window.location.href);
      if (!sessionId) {
        throw new Error('No session ID available');
      }

      const queryLogs = `
        SELECT LogUserId, LogUser.Name, COUNT(Id) LogCount
        FROM ApexLog
        WHERE StartTime >= LAST_N_DAYS:1
        GROUP BY LogUserId, LogUser.Name
        ORDER BY COUNT(Id) DESC
      `;

      const queryFlag = `
        SELECT TracedEntityId, TracedEntity.Name
        FROM TraceFlag 
        WHERE LogType = 'USER_DEBUG'
        AND ExpirationDate >= TODAY

      `;
      
      const urlLog = `https://${this.baseUrl}/services/data/v62.0/query?q=${encodeURIComponent(queryLogs)}`;
      const urlFlag = `https://${this.baseUrl}/services/data/v62.0/tooling/query?q=${encodeURIComponent(queryFlag)}`;

      const responseLog = await fetch(urlLog, {
        headers: {
          'Authorization': `Bearer ${sessionId}`,
          'Content-Type': 'application/json'
        }
      });

      const responseFlag = await fetch(urlFlag, {
        headers: {
          'Authorization': `Bearer ${sessionId}`,
          'Content-Type': 'application/json'
        }
      });

      if (!responseLog.ok) {
        throw new Error(`API error: ${responseLog.status}`);
      }
      if (!responseFlag.ok) {
        throw new Error(`API error: ${responseFlag.status}`);
      }

      const dataLog = await responseLog.json();
      const dataFlag = await responseFlag.json();

      // Créer une Map avec les données des trace flags
      const flagMap = new Map(
        (dataFlag.records || []).map(flag => [
          flag.TracedEntityId,
          {
            hasActiveTraceFlag: true,
            userId: flag.TracedEntityId,
            userName: flag.TracedEntity?.Name || 'Unknown User'
          }
        ])
      );

      // Créer une Map avec les données des logs
      const logMap = new Map(
        (dataLog.records || []).map(log => [
          log.LogUserId,
          {
            logCount: log.LogCount
          }
        ])
      );
      
      console.log('Log Map:', logMap);

      // Fusionner les données
      return (dataFlag.records || []).map(record => ({
        id: record.TracedEntityId,
        logCount: logMap.get(record.TracedEntityId)?.logCount !== undefined ? logMap.get(record.TracedEntityId).logCount : 0,
        name : record.TracedEntity?.Name
      }));
    }

    async deleteLog(logId) {
      const sessionId = await sessionManager.getSessionId(window.location.href);
      if (!sessionId) {
        throw new Error('No session ID available');
      }

      const url = `https://${this.baseUrl}/services/data/v62.0/sobjects/ApexLog/${logId}`;

      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${sessionId}`
        }
      });

      return response.ok;
    }
  }

  window.FoxLog.salesforceAPI = new SalesforceAPI();
  console.log('[FoxLog] Salesforce API loaded');
})();