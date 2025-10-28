// src/services/log-preview-service.js
(function() {
  'use strict';
  
  window.FoxLog = window.FoxLog || {};
  const { logger, salesforceAPI, logParser } = window.FoxLog;

  /**
   * Service pour analyser rapidement les logs et détecter les erreurs
   * Parsing léger sans tout parser le log
   */
  class LogPreviewService {
    constructor() {
      this.cache = new Map(); // Cache des analyses {logId: {hasError, errorCount, errorTypes}}
    }

    /**
     * Analyse un lot de logs pour détecter les erreurs
     * @param {Array} logs - Liste des métadonnées de logs
     * @returns {Promise<Map>} Map de logId -> {hasError, errorCount, errorTypes}
     */
    async analyzeBatch(logs) {
      logger.log(`Analyzing ${logs.length} logs for errors`);
      
      const results = new Map();
      const logsToFetch = logs.filter(log => !this.cache.has(log.Id));
      
      // Retourner les résultats du cache pour les logs déjà analysés
      logs.forEach(log => {
        if (this.cache.has(log.Id)) {
          results.set(log.Id, this.cache.get(log.Id));
        }
      });

      // Analyser les nouveaux logs
      if (logsToFetch.length === 0) {
        logger.log('All logs already analyzed (from cache)');
        return results;
      }

      logger.log(`Fetching ${logsToFetch.length} new logs for analysis`);

      // Limiter le nombre de requêtes parallèles (max 3 à la fois)
      const chunks = this._chunkArray(logsToFetch, 3);
      
      for (const chunk of chunks) {
        const promises = chunk.map(log => this._analyzeLog(log));
        const chunkResults = await Promise.allSettled(promises);
        
        chunkResults.forEach((result, index) => {
          const logId = chunk[index].Id;
          if (result.status === 'fulfilled') {
            results.set(logId, result.value);
            this.cache.set(logId, result.value);
          } else {
            logger.error(`Failed to analyze log ${logId}`, result.reason);
            // Fallback : pas d'erreur détectée
            const fallback = { hasError: false, errorCount: 0, errorTypes: [] };
            results.set(logId, fallback);
            this.cache.set(logId, fallback);
          }
        });
      }

      logger.success(`Analyzed ${logsToFetch.length} logs`);
      return results;
    }

    /**
     * Analyse un seul log pour détecter les erreurs
     * @private
     */
    async _analyzeLog(logMetadata) {
      try {
        // Fetch le body du log
        const logBody = await salesforceAPI.fetchLogBody(logMetadata.Id);
        
        // Analyse rapide via regex (plus rapide que le full parsing)
        const analysis = this._quickErrorDetection(logBody);
        
        return analysis;
      } catch (error) {
        logger.error(`Error analyzing log ${logMetadata.Id}`, error);
        return { hasError: false, errorCount: 0, errorTypes: [] };
      }
    }

    /**
     * Détection rapide d'erreurs via regex
     * @private
     */
    _quickErrorDetection(logContent) {
      const errorPatterns = {
        exception: /EXCEPTION_THROWN\|([^|]+)\|(.+)/g,
        fatal: /FATAL_ERROR\|(.+)/g,
        failed: /VALIDATION_FORMULA|VALIDATION_RULE|REQUIRED_FIELD_MISSING/g
      };

      let hasError = false;
      let errorCount = 0;
      const errorTypes = new Set();

      // Détecter les exceptions
      let match;
      while ((match = errorPatterns.exception.exec(logContent)) !== null) {
        hasError = true;
        errorCount++;
        errorTypes.add(match[1]); // Type d'exception
      }

      // Détecter les erreurs fatales
      errorPatterns.fatal.lastIndex = 0;
      while ((match = errorPatterns.fatal.exec(logContent)) !== null) {
        hasError = true;
        errorCount++;
        errorTypes.add('FATAL_ERROR');
      }

      // Détecter les erreurs de validation
      errorPatterns.failed.lastIndex = 0;
      if (errorPatterns.failed.test(logContent)) {
        hasError = true;
        errorCount++;
        errorTypes.add('VALIDATION_ERROR');
      }

      return {
        hasError,
        errorCount,
        errorTypes: Array.from(errorTypes)
      };
    }

    /**
     * Divise un tableau en chunks
     * @private
     */
    _chunkArray(array, size) {
      const chunks = [];
      for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size));
      }
      return chunks;
    }

    /**
     * Vide le cache
     */
    clearCache() {
      this.cache.clear();
      logger.log('Log preview cache cleared');
    }

    /**
     * Obtient l'analyse depuis le cache
     */
    getCached(logId) {
      return this.cache.get(logId);
    }
  }

  window.FoxLog.logPreviewService = new LogPreviewService();
  console.log('[FoxLog] Log Preview Service loaded');
})();
