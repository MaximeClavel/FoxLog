// src/core/cache-manager.js
(function() {
  'use strict';
  
  window.FoxLog = window.FoxLog || {};
  const logger = window.FoxLog.logger || console;
  
  class CacheManager {
    constructor(ttl = 30000) {
      this.cache = new Map();
      this.ttl = ttl;
    }

    set(key, value, customTtl = null) {
      const expiresAt = Date.now() + (customTtl || this.ttl);
      this.cache.set(key, { value, expiresAt });
    }

    get(key) {
      const item = this.cache.get(key);
      if (!item) return null;

      if (Date.now() > item.expiresAt) {
        this.cache.delete(key);
        return null;
      }

      return item.value;
    }

    has(key) {
      return this.get(key) !== null;
    }

    clear(key = null) {
      if (key) {
        this.cache.delete(key);
      } else {
        this.cache.clear();
      }
    }

    getOrSet(key, fetchFn, customTtl = null) {
      const cached = this.get(key);
      if (cached !== null) return Promise.resolve(cached);

      return fetchFn().then(value => {
        this.set(key, value, customTtl);
        return value;
      });
    }
  }

  const CONFIG = window.FoxLog.CONFIG || {};
  window.FoxLog.cache = new CacheManager(CONFIG.CACHE_DURATION || 30000);
  logger.log('[FoxLog] Cache Manager loaded');
})();