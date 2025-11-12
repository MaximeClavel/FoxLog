// src/content.js (VERSION AVEC ANALYSE D'ERREURS ET PICKLIST UTILISATEURS)
(function() {
  'use strict';
  
  class FoxLogApp {
    constructor() {
      this.initialized = false;
      this.refreshInterval = null;
      this.currentUserId = null;  // Utilisateur connecté
      this.selectedUserId = null; // Utilisateur sélectionné dans la picklist
      this.currentLogs = [];
    }

    async init() {
      if (this.initialized) {
        console.warn('[FoxLog] Already initialized');
        return;
      }

      await this._waitForDependencies();
      
      const { logger } = window.FoxLog;

      if (!this._isSalesforcePage()) {
        logger.log('Not a Salesforce page');
        return;
      }

      try {
        await this._setup();
        this.initialized = true;
        logger.success('FoxLog initialized');
      } catch (error) {
        logger.error('Initialization failed', error);
      }
    }
    
    async _setup() {
      const { logger, salesforceAPI, panelManager } = window.FoxLog;
      
      logger.log('Setting up FoxLog...');
      
      await this._injectScript();
      await salesforceAPI.initialize();
      
      this._createUI();
      this._attachEventListeners();
      
      this.currentUserId = await this._getUserId();
      
      if (this.currentUserId) {
        logger.success('User ID obtained', this.currentUserId);
        this.selectedUserId = this.currentUserId;
      } else {
        logger.warn('User ID not found');
      }
      
      this._startAutoRefresh();
      
      logger.success('Setup complete');
    }
    
    _waitForDependencies() {
      return new Promise((resolve) => {
        const check = () => {
          const deps = window.FoxLog;
          if (deps?.logger && 
              deps?.cache && 
              deps?.sessionManager && 
              deps?.salesforceAPI && 
              deps?.panelManager &&
              deps?.logPreviewService &&
              deps?.LOG_TYPES) {
            resolve();
          } else {
            setTimeout(check, 50);
          }
        };
        check();
      });
    }
    
    _isSalesforcePage() {
      const { hostname } = window.location;
      return hostname.includes('salesforce.com') || 
             hostname.includes('force.com') || 
             hostname.includes('visualforce.com');
    }
    
    _injectScript() {
      const { logger } = window.FoxLog;
      return new Promise((resolve, reject) => {
        try {
          const script = document.createElement('script');
          script.src = chrome.runtime.getURL('src/injected.js');
          script.onload = () => {
            logger.success('Injected script loaded');
            script.remove();
            resolve();
          };
          script.onerror = () => {
            logger.error('Failed to load injected script');
            script.remove();
            reject(new Error('Failed to load injected script'));
          };
          (document.head || document.documentElement).appendChild(script);
        } catch (error) {
          logger.error('Error injecting script', error);
          reject(error);
        }
      });
    }
    
    _createUI() {
      const { panelManager } = window.FoxLog;
      this._createFloatingButton();
      panelManager.create();
    }
    
    _createFloatingButton() {
      const { panelManager } = window.FoxLog;
      
      if (document.getElementById('sf-debug-toggle')) {
        return;
      }
      
      const button = document.createElement('div');
      button.id = 'sf-debug-toggle';
      
      const iconUrl = chrome.runtime.getURL('src/assets/tail128.png');
      button.innerHTML = `<img src="${iconUrl}" alt="FoxLog" style="width:32px;height:32px;">`;
      button.title = 'FoxLog - Ouvrir les logs';
      
      button.addEventListener('click', async () => {
        panelManager.toggle();
        
        if (panelManager.isOpen) {
          // Charger les utilisateurs
          await panelManager.loadUsers(this.currentUserId);
          
          // Charger les logs de l'utilisateur sélectionné
          const userId = panelManager.getSelectedUserId();
          if (userId) {
            this.selectedUserId = userId;
            await this.refreshLogs();
          }
        }
      });
      
      document.body.appendChild(button);
    }
    
    _attachEventListeners() {
      document.addEventListener('foxlog:refresh', () => this.refreshLogs());
      document.addEventListener('foxlog:clear', () => this.clearLogs());
      document.addEventListener('foxlog:viewLog', (e) => {
        this.viewLogDetails(e.detail.logId);
      });
      
      // Changement d'utilisateur
      document.addEventListener('foxlog:userChanged', async (e) => {
        this.selectedUserId = e.detail.userId;
        await this.refreshLogs();
      });
    }

    async _getUserId() {
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          console.warn('[FoxLog] Timeout: User ID not received');
          resolve(null);
        }, 3000);
        
        window.addEventListener('foxlog_userid_response', (event) => {
          clearTimeout(timeout);
          resolve(event.detail?.userId || null);
        }, { once: true });
        
        window.dispatchEvent(new CustomEvent('foxlog_request_userid'));
      });
    }

    /**
     * Rafraîchir les logs avec analyse d'erreurs
     * @param {boolean} isAutoRefresh - True si appelé par l'auto-refresh
     */
    async refreshLogs(isAutoRefresh = false) {
      const { logger, salesforceAPI, panelManager, logPreviewService } = window.FoxLog;
      
      const userId = this.selectedUserId || this.currentUserId;
      
      if (!userId) {
        panelManager.showError('User ID not available');
        return;
      }

      try {
        const SPINNER_DELAY = 300;
        const MIN_SPINNER_TIME = 600;

        let showSpinner = false;
        let spinnerStartTime = null;
        let spinnerTimeout;

        // Ne pas afficher le spinner en auto-refresh
        if (!isAutoRefresh) {
          spinnerTimeout = setTimeout(() => {
            showSpinner = true;
            spinnerStartTime = Date.now();
            panelManager.showLoading();
          }, SPINNER_DELAY);
        }

        const logs = await salesforceAPI.fetchLogs(userId);
        
        if (!isAutoRefresh && spinnerTimeout) {
          clearTimeout(spinnerTimeout);

          if (showSpinner && spinnerStartTime) {
            const elapsed = Date.now() - spinnerStartTime;
            const remaining = MIN_SPINNER_TIME - elapsed;
            if (remaining > 0) {
              await new Promise(resolve => setTimeout(resolve, remaining));
            }
          }
        }

        // Détecter si les logs ont changé
        const hasChanged = this._hasLogsChanged(this.currentLogs, logs);
        this.currentLogs = logs;

        // 2. Afficher les logs immédiatement
        // preservePage = true en auto-refresh si les logs n'ont pas changé
        const preservePage = isAutoRefresh && !hasChanged;
        panelManager.updateLogList(logs, null, preservePage);
        
        logger.success(`Loaded ${logs.length} logs for user ${userId}${isAutoRefresh ? ' (auto-refresh)' : ''}`);

        // 3. Analyser les erreurs en arrière-plan seulement si logs ont changé
        if (hasChanged) {
          logger.log('Starting error analysis in background...');
          const analysisResults = await logPreviewService.analyzeBatch(logs);
          
          // 4. Mettre à jour l'affichage avec les badges d'erreur
          panelManager.updateLogList(logs, analysisResults, preservePage);
          logger.success('Error analysis complete');
        } else {
          logger.log('Logs unchanged, skipping analysis');
        }

        // TOUJOURS masquer le spinner à la fin
        if (!isAutoRefresh) {
            panelManager.hideLoading();
        }

      } catch (error) {
        logger.error('Failed to fetch logs', error);
        panelManager.showError('Erreur de chargement des logs');
        // Masquer aussi en cas d'erreur
        if (!isAutoRefresh) {
            panelManager.hideLoading();
        }
      }
    }

    /**
     * Vérifie si les logs ont changé
     * @private
     */
    _hasLogsChanged(oldLogs, newLogs) {
      if (oldLogs.length !== newLogs.length) return true;
      
      // Comparer les IDs des 5 premiers logs (plus rapide)
      const compareCount = Math.min(5, oldLogs.length);
      for (let i = 0; i < compareCount; i++) {
        if (oldLogs[i]?.Id !== newLogs[i]?.Id) return true;
      }
      
      return false;
    }
    
    async viewLogDetails(logId) {
      const { logger, salesforceAPI } = window.FoxLog;
      
      try {
        logger.log(`Fetching details for log ${logId}`);
        
        const logMetadata = this.currentLogs.find(log => log.Id === logId);
        if (!logMetadata) {
          logger.error('Log metadata not found');
          return;
        }

        const logBody = await salesforceAPI.fetchLogBody(logId);
        
        if (window.FoxLog.logParser && window.FoxLog.modalManager) {
          const parsedLog = window.FoxLog.logParser.parse(logBody, logMetadata);
          window.FoxLog.modalManager.showParsedLog(parsedLog, window.FoxLog.logParser);
        } else {
          if (window.FoxLog.modalManager) {
            window.FoxLog.modalManager.showRawLog(logBody);
          } else {
            console.log('Log Body:', logBody);
            alert('Log chargé ! (voir console)');
          }
        }
        
        logger.success('Log details displayed');
      } catch (error) {
        logger.error('Failed to fetch log details', error);
      }
    }

    clearLogs() {
      const { cache, sessionManager, panelManager, logger, logPreviewService } = window.FoxLog;
      
      cache.clear();
      sessionManager.clearCache();
      logPreviewService.clearCache();
      this.currentLogs = [];
      panelManager.updateLogList([]);
      logger.success('Cache cleared');
    }

    _startAutoRefresh() {
      const { CONFIG, logger, panelManager } = window.FoxLog;
      
      if (this.refreshInterval) {
        clearInterval(this.refreshInterval);
      }
      
      this.refreshInterval = setInterval(() => {
        const userId = this.selectedUserId || this.currentUserId;
        if (panelManager.isOpen && userId) {
          logger.log('Auto-refresh triggered');
          this.refreshLogs(true);
        }
      }, CONFIG.REFRESH_INTERVAL);
      
      logger.log(`Auto-refresh started (interval: ${CONFIG.REFRESH_INTERVAL}ms)`);
    }

    destroy() {
      const { cache, logger } = window.FoxLog;
      
      if (this.refreshInterval) {
        clearInterval(this.refreshInterval);
      }
      cache.clear();
      this.currentLogs = [];
      this.initialized = false;
      
      logger.log('FoxLog destroyed');
    }
  }

  const app = new FoxLogApp();
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      console.log('[FoxLog] DOM ready, initializing...');
      app.init();
    });
  } else {
    console.log('[FoxLog] DOM already ready, initializing...');
    app.init();
  }
  
  window.FoxLogApp = app;
  
  console.log('[FoxLog] Content script loaded');
})();