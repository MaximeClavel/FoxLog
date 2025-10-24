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