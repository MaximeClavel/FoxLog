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
     * ✨ AMÉLIORÉ : Récupérer les utilisateurs avec TraceFlags ET/OU ApexLogs
     */
    async fetchUsersWithLogs() {
      const sessionId = await sessionManager.getSessionId(window.location.href);
      if (!sessionId) {
        throw new Error('No session ID available');
      }

      // Query 1: Utilisateurs avec des logs 
      const queryLogs = `
        SELECT LogUserId, LogUser.Name, COUNT(Id) LogCount
        FROM ApexLog
        GROUP BY LogUserId, LogUser.Name
        ORDER BY COUNT(Id) DESC
      `;

      // Query 2: Utilisateurs avec TraceFlag actif
      const queryFlag = `
        SELECT TracedEntityId, TracedEntity.Name, DebugLevel.DeveloperName
        FROM TraceFlag 
        WHERE LogType = 'USER_DEBUG'
        AND ExpirationDate >= TODAY
      `;
      
      const urlLog = `https://${this.baseUrl}/services/data/v62.0/query?q=${encodeURIComponent(queryLogs)}`;
      const urlFlag = `https://${this.baseUrl}/services/data/v62.0/tooling/query?q=${encodeURIComponent(queryFlag)}`;

      try {
        // Exécuter les 2 requêtes avec gestion d'erreur indépendante
        let dataLog = { records: [] };
        let dataFlag = { records: [] };

        // Requête 1 : ApexLogs (critique)
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
            logger.error(`Failed to fetch logs: ${responseLog.status}`);
          }
        } catch (error) {
          logger.error('Error fetching ApexLogs', error);
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
            logger.warn(`Failed to fetch TraceFlags: ${responseFlag.status} (non-critical)`);
          }
        } catch (error) {
          logger.warn('Error fetching TraceFlags (non-critical)', error);
        }

        // Créer une Map pour fusionner les données
        const usersMap = new Map();

        // Ajouter les utilisateurs avec des logs
        logger.log(`Processing ${dataLog.records?.length || 0} users from ApexLog...`);
        (dataLog.records || []).forEach(log => {
          logger.log(`  - User: ${log.LogUser?.Name} (${log.LogUserId}) with ${log.LogCount} logs`);
          usersMap.set(log.LogUserId, {
            id: log.LogUserId,
            name: log.LogUser?.Name || 'Unknown User',
            logCount: log.LogCount || 0,
            debugLevel: null,
            hasTraceFlag: false
          });
        });

        // Ajouter/Mettre à jour avec les utilisateurs ayant un TraceFlag
        logger.log(`Processing ${dataFlag.records?.length || 0} users from TraceFlag...`);
        (dataFlag.records || []).forEach(flag => {
          logger.log(`  - User: ${flag.TracedEntity?.Name} (${flag.TracedEntityId}) with TraceFlag`);
          const existingUser = usersMap.get(flag.TracedEntityId);
          
          if (existingUser) {
            // Utilisateur déjà présent (a des logs) : ajouter les infos du TraceFlag
            existingUser.debugLevel = flag.DebugLevel?.DeveloperName || 'N/A';
            existingUser.hasTraceFlag = true;
          } else {
            // Nouvel utilisateur (pas encore de logs mais a un TraceFlag)
            usersMap.set(flag.TracedEntityId, {
              id: flag.TracedEntityId,
              name: flag.TracedEntity?.Name || 'Unknown User',
              logCount: 0,
              debugLevel: flag.DebugLevel?.DeveloperName || 'N/A',
              hasTraceFlag: true
            });
          }
        });

        // Vérifier qu'on a au moins des données
        if (usersMap.size === 0) {
          logger.log('No users found with logs or TraceFlags');
          return [];
        }

        // Convertir la Map en tableau et trier
        const users = Array.from(usersMap.values()).sort((a, b) => {
          // Priorité 1: Utilisateurs avec TraceFlag actif
          if (a.hasTraceFlag && !b.hasTraceFlag) return -1;
          if (!a.hasTraceFlag && b.hasTraceFlag) return 1;
          
          // Priorité 2: Nombre de logs (décroissant)
          if (b.logCount !== a.logCount) {
            return b.logCount - a.logCount;
          }
          
          // Priorité 3: Nom alphabétique
          return a.name.localeCompare(b.name);
        });

        logger.success(`Found ${users.length} users (${users.filter(u => u.hasTraceFlag).length} with TraceFlag, ${users.filter(u => u.logCount > 0).length} with logs)`);
        
        return users;
        
      } catch (error) {
        logger.error('Failed to fetch users', error);
        // Ne pas throw, retourner tableau vide pour ne pas bloquer l'UI
        return [];
      }
    }

    /**
     * Récupérer les infos de l'utilisateur courant
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