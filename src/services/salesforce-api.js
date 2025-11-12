// src/services/salesforce-api.js (VERSION CORRIGÉE)
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
     * ✅ CORRIGÉ : Récupérer les utilisateurs avec TraceFlags ET/OU ApexLogs
     */
    async fetchUsersWithLogs() {
      const sessionId = await sessionManager.getSessionId(window.location.href);
      if (!sessionId) {
        throw new Error('No session ID available');
      }

      // ✅ SOLUTION SIMPLE : Récupérer directement les ApexLogs et compter
      const queryLogs = `
        SELECT LogUserId, LogUser.Name, COUNT(Id) LogCount
        FROM ApexLog
        WHERE LogUserId != null
        GROUP BY LogUserId, LogUser.Name
        ORDER BY COUNT(Id) DESC
        LIMIT 50
      `;

      // Query 2 : Utilisateurs avec TraceFlag actif (inchangée)
      const queryFlag = `
        SELECT TracedEntityId, TracedEntity.Name, DebugLevel.DeveloperName
        FROM TraceFlag 
        WHERE LogType = 'USER_DEBUG'
        AND ExpirationDate >= TODAY
        AND TracedEntityId != null
      `;
      
      const urlLog = `https://${this.baseUrl}/services/data/v62.0/query?q=${encodeURIComponent(queryLogs)}`;
      const urlFlag = `https://${this.baseUrl}/services/data/v62.0/tooling/query?q=${encodeURIComponent(queryFlag)}`;

      try {
        let dataLog = { records: [] };
        let dataFlag = { records: [] };

        // Requête 1 : Utilisateurs avec logs
        try {
          const responseLog = await fetch(urlLog, {
            headers: {
              'Authorization': `Bearer ${sessionId}`,
              'Content-Type': 'application/json'
            }
          });

          if (responseLog.ok) {
            dataLog = await responseLog.json();
            logger.log(`Found ${dataLog.records?.length || 0} users with logs`);
          } else {
            const errorText = await responseLog.text();
            logger.error(`Failed to fetch users: ${responseLog.status} - ${errorText}`);
          }
        } catch (error) {
          logger.error('Error fetching users with logs', error);
        }

        // Requête 2 : TraceFlags (optionnelle)
        try {
          const responseFlag = await fetch(urlFlag, {
            headers: {
              'Authorization': `Bearer ${sessionId}`,
              'Content-Type': 'application/json'
            }
          });

          if (responseFlag.ok) {
            dataFlag = await responseFlag.json();
            logger.log(`Found ${dataFlag.records?.length || 0} users with TraceFlags`);
          } else {
            logger.warn(`Failed to fetch TraceFlags: ${responseFlag.status}`);
          }
        } catch (error) {
          logger.warn('Error fetching TraceFlags', error);
        }

        // ✅ Construire la Map des utilisateurs
        const usersMap = new Map();

        // Ajouter les utilisateurs avec des logs
        logger.log(`Processing ${dataLog.records?.length || 0} users...`);
        
        (dataLog.records || []).forEach(record => {
          const userId = record.LogUserId;
          const userName = record.LogUser?.Name || record.expr0 || 'Unknown User';
          const logCount = record.LogCount || record.expr1 || 0;
          
          logger.log(`  - User: ${userName} (${userId}) with ${logCount} logs`);
          
          usersMap.set(userId, {
            id: userId,
            name: userName,
            logCount: logCount,
            debugLevel: null,
            hasTraceFlag: false
          });
        });

        // Ajouter/Mettre à jour avec les utilisateurs ayant un TraceFlag
        logger.log(`Processing ${dataFlag.records?.length || 0} TraceFlags...`);
        (dataFlag.records || []).forEach(flag => {
          const userId = flag.TracedEntityId;
          const userName = flag.TracedEntity?.Name || 'Unknown User';
          const debugLevel = flag.DebugLevel?.DeveloperName || 'N/A';
          
          const existingUser = usersMap.get(userId);
          
          if (existingUser) {
            // Utilisateur a déjà des logs : ajouter TraceFlag info
            existingUser.debugLevel = debugLevel;
            existingUser.hasTraceFlag = true;
            logger.log(`  - Updated user: ${existingUser.name} with TraceFlag [${debugLevel}]`);
          } else {
            // Nouvel utilisateur : TraceFlag mais pas encore de logs
            usersMap.set(userId, {
              id: userId,
              name: userName,
              logCount: 0,
              debugLevel: debugLevel,
              hasTraceFlag: true
            });
            logger.log(`  - New user with TraceFlag: ${userName} [${debugLevel}]`);
          }
        });

        if (usersMap.size === 0) {
          logger.log('No users found');
          return [];
        }

        // Convertir et trier
        const users = Array.from(usersMap.values()).sort((a, b) => {
          // Priorité 1: TraceFlag actif
          if (a.hasTraceFlag && !b.hasTraceFlag) return -1;
          if (!a.hasTraceFlag && b.hasTraceFlag) return 1;
          // Priorité 2: Nombre de logs
          if (b.logCount !== a.logCount) return b.logCount - a.logCount;
          // Priorité 3: Nom alphabétique
          return a.name.localeCompare(b.name);
        });

        logger.success(`Loaded ${users.length} users (${users.filter(u => u.hasTraceFlag).length} with TraceFlag, ${users.filter(u => u.logCount > 0).length} with logs)`);
        
        return users;
        
      } catch (error) {
        logger.error('Failed to fetch users', error);
        return [];
      }
    }

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
      
      return user ? { id: user.Id, name: user.Name } : null;
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