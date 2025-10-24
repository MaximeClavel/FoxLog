// src/services/session-manager.js
(function() {
  'use strict';
  
  window.FoxLog = window.FoxLog || {};
  const { logger, cache } = window.FoxLog;

  class SessionManager {
    constructor() {
      this.cacheKey = 'sessionId';
    }

    async getSessionId(url) {
      return cache.getOrSet(this.cacheKey, () => this._fetchSessionId(url));
    }

    async _fetchSessionId(url) {
      const injectedSession = await this._getFromInjectedScript();
      if (injectedSession) {
        logger.success('Session from injected script');
        return injectedSession;
      }

      const cookieSession = await this._getFromCookies(url);
      if (cookieSession) {
        logger.success('Session from cookies');
        return cookieSession;
      }

      logger.error('No session found');
      return null;
    }

    async _getFromInjectedScript() {
      return new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(null), 1000);

        window.addEventListener('foxlog_session_response', (event) => {
          clearTimeout(timeout);
          resolve(event.detail?.sessionId || null);
        }, { once: true });

        window.dispatchEvent(new CustomEvent('foxlog_request_session'));
      });
    }

    async _getFromCookies(url) {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { action: 'getSessionId', url },
          (response) => resolve(response?.sessionId || null)
        );
      });
    }

    clearCache() {
      cache.clear(this.cacheKey);
    }
  }

  window.FoxLog.sessionManager = new SessionManager();
  console.log('[FoxLog] Session Manager loaded');
})();