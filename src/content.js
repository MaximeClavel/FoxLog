// src/content.js (Version with error analysis and user picklist)
(function() {
  'use strict';
  
  class FoxLogApp {
    constructor() {
      this.initialized = false;
      this.refreshInterval = null;
      this.currentUserId = null;  // Logged-in user
      this.selectedUserId = null; // User selected in the picklist
      this.currentLogs = [];
      this.logger = null; 
    }

    async init() {
      if (this.initialized) {
        this.logger.warn('[FoxLog] Already initialized');
        return;
      }

      await this._waitForDependencies();
      
      const { logger } = window.FoxLog;

      if (!this._isSalesforcePage()) {
        this.logger.log('Not a Salesforce page');
        return;
      }

      try {
        await this._setup();
        this.initialized = true;
        this.logger.success('FoxLog initialized');
      } catch (error) {
        this.logger.error('Initialization failed', error);
      }
    }
    
    async _setup() {
      const { logger, salesforceAPI, panelManager } = window.FoxLog;
      this.logger = window.FoxLog.logger || console;
      
      this.logger.log('Setting up FoxLog...');
      
      await this._injectScript();
      await salesforceAPI.initialize();
      
      this._createUI();
      this._attachEventListeners();
      
      this.currentUserId = await this._getUserId();
      
      if (this.currentUserId) {
        this.logger.success('User ID obtained', this.currentUserId);
        this.selectedUserId = this.currentUserId;
      } else {
        this.logger.warn('User ID not found');
      }
      
      this._startAutoRefresh();
      
      this.logger.success('Setup complete');
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
            this.logger.success('Injected script loaded');
            script.remove();
            resolve();
          };
          script.onerror = () => {
            this.logger.error('Failed to load injected script');
            script.remove();
            reject(new Error('Failed to load injected script'));
          };
          (document.head || document.documentElement).appendChild(script);
        } catch (error) {
          this.logger.error('Error injecting script', error);
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
      const { panelManager, i18n } = window.FoxLog;
      
      if (document.getElementById('sf-foxlog-toggle')) {
        return;
      }
      
      const button = document.createElement('div');
      button.id = 'sf-foxlog-toggle';
      
      const iconUrl = chrome.runtime.getURL('src/assets/tail128.png');
      button.innerHTML = `<img src="${iconUrl}" alt="FoxLog" style="width:32px;height:32px;">`;
      button.title = (i18n?.openLogs) || 'FoxLog - Open logs';
      
      button.addEventListener('click', async () => {
        panelManager.toggle();
        
        if (panelManager.isOpen) {
          // Load users
          await panelManager.loadUsers(this.currentUserId);
          
          // Load logs for the selected user
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
      
      // User selection change
      document.addEventListener('foxlog:userChanged', async (e) => {
        this.selectedUserId = e.detail.userId;
        await this.refreshLogs();
      });
    }

    async _getUserId() {
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          this.logger.warn('[FoxLog] Timeout: User ID not received');
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
     * Refresh logs with error analysis
     * @param {boolean} isAutoRefresh - True when called by the auto-refresh loop
     */
    async refreshLogs(isAutoRefresh = false) {
      const { logger, salesforceAPI, panelManager, logPreviewService, i18n } = window.FoxLog;
      
      const userId = this.selectedUserId || this.currentUserId;
      
      if (!userId) {
        panelManager.showError((i18n?.userIdUnavailable) || 'User ID not available');
        return;
      }

      try {
        const SPINNER_DELAY = 300;
        const MIN_SPINNER_TIME = 600;

        let showSpinner = false;
        let spinnerStartTime = null;
        let spinnerTimeout;

        // Do not display the spinner during auto-refresh
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

        // Detect whether logs changed
        const hasChanged = this._hasLogsChanged(this.currentLogs, logs);
        this.currentLogs = logs;

        // Display logs immediately
        // preservePage = true during auto-refresh when logs are unchanged
        const preservePage = isAutoRefresh && !hasChanged;
        panelManager.updateLogList(logs, null, preservePage);
        
        this.logger.success(`Loaded ${logs.length} logs for user ${userId}${isAutoRefresh ? ' (auto-refresh)' : ''}`);

        // Analyze errors in the background only if logs changed
        if (hasChanged) {
          this.logger.log('Starting error analysis in background...');
          const analysisResults = await logPreviewService.analyzeBatch(logs);
          
          // Update the list with error badges
          panelManager.updateLogList(logs, analysisResults, preservePage);
          this.logger.success('Error analysis complete');
        } else {
          this.logger.log('Logs unchanged, skipping analysis');
        }

        // Always hide the spinner at the end
        if (!isAutoRefresh) {
            panelManager.hideLoading();
        }

      } catch (error) {
        this.logger.error('Failed to fetch logs', error);
        panelManager.showError((i18n?.loadingError) || 'Error loading logs');
        // Also hide the spinner when an error occurs
        if (!isAutoRefresh) {
            panelManager.hideLoading();
        }
      }
    }

    /**
     * Check whether logs changed
     * @private
     */
    _hasLogsChanged(oldLogs, newLogs) {
      if (oldLogs.length !== newLogs.length) return true;
      
      // Compare the IDs of the first 5 logs (faster)
      const compareCount = Math.min(5, oldLogs.length);
      for (let i = 0; i < compareCount; i++) {
        if (oldLogs[i]?.Id !== newLogs[i]?.Id) return true;
      }
      
      return false;
    }
    
    async viewLogDetails(logId) {
      const { logger, salesforceAPI } = window.FoxLog;
      
      try {
        this.logger.log(`Fetching details for log ${logId}`);
        
        const logMetadata = this.currentLogs.find(log => log.Id === logId);
        if (!logMetadata) {
          this.logger.error('Log metadata not found');
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
            this.logger.log('Log Body:', logBody);
            const message = (window.FoxLog.i18n?.logLoadedConsole) || 'Log loaded! (see console)';
            alert(message);
          }
        }
        
        this.logger.success('Log details displayed');
      } catch (error) {
        this.logger.error('Failed to fetch log details', error);
      }
    }

    clearLogs() {
      const { cache, sessionManager, panelManager, logger, logPreviewService } = window.FoxLog;
      
      cache.clear();
      sessionManager.clearCache();
      logPreviewService.clearCache();
      this.currentLogs = [];
      panelManager.updateLogList([]);
      this.logger.success('Cache cleared');
    }

    _startAutoRefresh() {
      const { CONFIG, logger, panelManager } = window.FoxLog;
      
      if (this.refreshInterval) {
        clearInterval(this.refreshInterval);
      }
      
      this.refreshInterval = setInterval(() => {
        const userId = this.selectedUserId || this.currentUserId;
        if (panelManager.isOpen && userId) {
          this.logger.log('Auto-refresh triggered');
          this.refreshLogs(true);
        }
      }, CONFIG.REFRESH_INTERVAL);
      
      this.logger.log(`Auto-refresh started (interval: ${CONFIG.REFRESH_INTERVAL}ms)`);
    }

    destroy() {
      const { cache, logger } = window.FoxLog;
      
      if (this.refreshInterval) {
        clearInterval(this.refreshInterval);
      }
      cache.clear();
      this.currentLogs = [];
      this.initialized = false;
      
      this.logger.log('FoxLog destroyed');
    }
  }

  const app = new FoxLogApp();
  const logger = window.FoxLog.logger || console;
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      logger.log('[FoxLog] DOM ready, initializing...');
      app.init();
    });
  } else {
    logger.log('[FoxLog] DOM already ready, initializing...');
    app.init();
  }
  
  window.FoxLogApp = app;
  
  logger.log('[FoxLog] Content script loaded');
})();