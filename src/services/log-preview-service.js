// src/services/log-preview-service.js
(function() {
  'use strict';
  
  window.FoxLog = window.FoxLog || {};
  const { logger, salesforceAPI, logParser } = window.FoxLog;

  /**
   * Service to quickly analyze logs and detect errors
   * Lightweight parsing without full log parsing
   */
  class LogPreviewService {
    constructor() {
      this.cache = new Map(); // Cache: {logId: {hasError, errorCount, errorTypes}}
    }

    /**
     * Analyze a batch of logs to detect errors
     * @param {Array} logs - List of log metadata
     * @returns {Promise<Map>} Map of logId -> {hasError, errorCount, errorTypes}
     */
    async analyzeBatch(logs) {
      logger.log(`Analyzing ${logs.length} logs for errors`);
      
      const results = new Map();
      const logsToFetch = logs.filter(log => !this.cache.has(log.Id));
      
      // Return cached results for already analyzed logs
      logs.forEach(log => {
        if (this.cache.has(log.Id)) {
          results.set(log.Id, this.cache.get(log.Id));
        }
      });

      // Analyze new logs
      if (logsToFetch.length === 0) {
        logger.log('All logs already analyzed (from cache)');
        return results;
      }

      logger.log(`Fetching ${logsToFetch.length} new logs for analysis`);

      // Limit parallel requests (max 3 at a time)
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
            // Fallback: no error detected
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
     * Analyze a single log to detect errors
     * @private
     */
    async _analyzeLog(logMetadata) {
      try {
        const logBody = await salesforceAPI.fetchLogBody(logMetadata.Id);
        const analysis = this._quickErrorDetection(logBody);
        return analysis;
      } catch (error) {
        logger.error(`Error analyzing log ${logMetadata.Id}`, error);
        return { hasError: false, errorCount: 0, errorTypes: [] };
      }
    }

    /**
     * Quick error detection via regex
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

      // Detect exceptions
      let match;
      while ((match = errorPatterns.exception.exec(logContent)) !== null) {
        hasError = true;
        errorCount++;
        errorTypes.add(match[1]);
      }

      // Detect fatal errors
      errorPatterns.fatal.lastIndex = 0;
      while ((match = errorPatterns.fatal.exec(logContent)) !== null) {
        hasError = true;
        errorCount++;
        errorTypes.add('FATAL_ERROR');
      }

      // Detect validation errors
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
     * Split array into chunks
     * @private
     */
    _chunkArray(array, size) {
      const chunks = [];
      for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size));
      }
      return chunks;
    }

    clearCache() {
      this.cache.clear();
      logger.log('Log preview cache cleared');
    }

    getCached(logId) {
      return this.cache.get(logId);
    }
  }

  window.FoxLog.logPreviewService = new LogPreviewService();
  console.log('[FoxLog] Log Preview Service loaded');
})();