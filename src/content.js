// src/content.js
(function() {
  'use strict';
  
  class FoxLogApp {
    constructor() {
      this.initialized = false;
      this.refreshInterval = null;
      this.userId = null;
      this.currentLogs = [];
      this.errorScanQueue = []; // 🆕 File d'attente pour le scan d'erreurs
      this.isScanning = false; // 🆕 Indicateur de scan en cours
    }

    async init() {
      if (this.initialized) {
        console.warn('[FoxLog] Already initialized');
        return;
      }

      // ✅ Attendre que toutes les dépendances soient chargées
      await this._waitForDependencies();
      
      // Maintenant on peut accéder aux dépendances
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
    
    // ✅ MÉTHODE MANQUANTE : _setup()
    async _setup() {
      const { logger, salesforceAPI, panelManager } = window.FoxLog;
      
      logger.log('Setting up FoxLog...');
      
      // 1. Injecter le script dans la page
      await this._injectScript();
      
      // 2. Initialiser l'API Salesforce
      await salesforceAPI.initialize();
      
      // 3. Créer l'interface utilisateur
      this._createUI();
      
      // 4. Attacher les event listeners
      this._attachEventListeners();
      
      // 5. Récupérer l'User ID
      this.userId = await this._getUserId();
      
      if (this.userId) {
        logger.success(`User ID: ${this.userId}`);
        await this.refreshLogs();
        this._startAutoRefresh();
      } else {
          logger.error('Failed to get User ID');
      }
      
      logger.success('Setup complete');
    }
    
    // ✅ Attendre que les dépendances soient chargées
    _waitForDependencies() {
      return new Promise((resolve) => {
        const check = () => {
          const deps = window.FoxLog;
          if (deps?.logger && 
              deps?.cache && 
              deps?.sessionManager && 
              deps?.salesforceAPI && 
              deps?.panelManager &&
              deps?.LOG_TYPES) {
            resolve();
          } else {
            setTimeout(check, 50);
          }
        };
        check();
      });
    }
    
    // ✅ Vérifier si on est sur une page Salesforce
    _isSalesforcePage() {
      const { hostname } = window.location;
      return hostname.includes('salesforce.com') || 
             hostname.includes('force.com') || 
             hostname.includes('visualforce.com');
    }
    
    // ✅ Injecter le script dans le contexte de la page
    _injectScript() {
      const { logger } = window.FoxLog;
      return new Promise((resolve, reject) => {
        try {
          const script = document.createElement('script');
          script.src = chrome.runtime.getURL('src/injected.js');
          script.onload = () => {
            logger.success('Injected script loaded');
            script.remove();
            resolve();  // ✅ Résoudre la promesse
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
    
    // ✅ Créer l'interface utilisateur
    _createUI() {
      const { panelManager } = window.FoxLog;
      
      // Créer le bouton flottant
      this._createFloatingButton();
      
      // Créer le panel
      panelManager.create();
    }
    
    // ✅ Créer le bouton flottant
    _createFloatingButton() {
      const { panelManager } = window.FoxLog;
      
      if (document.getElementById('sf-debug-toggle')) {
        return; // Le bouton existe déjà
      }
      
      const button = document.createElement('div');
      button.id = 'sf-debug-toggle';
      
      const iconUrl = chrome.runtime.getURL('src/assets/tail128.png');
      button.innerHTML = `<img src="${iconUrl}" alt="FoxLog" style="width:32px;height:32px;">`;
      button.title = 'FoxLog - Ouvrir les logs';
      
      button.addEventListener('click', () => {
        panelManager.toggle();
        
        // Charger les logs si le panel s'ouvre
        if (panelManager.isOpen && this.userId) {
          this.refreshLogs();
        }
      });
      
      document.body.appendChild(button);
    }
    
    // ✅ Attacher les event listeners
    _attachEventListeners() {
      document.addEventListener('foxlog:refresh', () => this.refreshLogs());
      document.addEventListener('foxlog:clear', () => this.clearLogs());
      document.addEventListener('foxlog:viewlog', (e) => {
        this.viewLogDetails(e.detail.logId);
      });
    }

    // ✅ Récupérer l'User ID via le script injecté
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

    // ✅ Rafraîchir les logs
    async refreshLogs() {
        const { logger, salesforceAPI, panelManager } = window.FoxLog;
        
        if (!this.userId) {
            panelManager.showError('User ID not available');
            return;
        }

        try {
            // Affichage rapide avec spinner
            const SPINNER_DELAY = 300;
            const MIN_SPINNER_TIME = 600;
            let showSpinner = false;
            let spinnerStartTime = null;

            const spinnerTimeout = setTimeout(() => {
                showSpinner = true;
                spinnerStartTime = Date.now();
                panelManager.showLoading();
            }, SPINNER_DELAY);

            // 1️⃣ Charger les métadonnées rapidement
            const logs = await salesforceAPI.fetchLogs(this.userId);
            
            clearTimeout(spinnerTimeout);

            if (showSpinner && spinnerStartTime) {
                const elapsed = Date.now() - spinnerStartTime;
                const remaining = MIN_SPINNER_TIME - elapsed;
                if (remaining > 0) {
                    await new Promise(resolve => setTimeout(resolve, remaining));
                }
            }

            this.currentLogs = logs;
            
            // Charger du cache si disponible
            this._loadErrorCountsFromCache(logs);
            
            // Afficher immédiatement
            panelManager.updateLogList(logs);
            
            // Scanner en arrière-plan
            this._startBackgroundErrorScan(logs);
            
            logger.success(`Loaded ${logs.length} logs`);
        } catch (error) {
            logger.error('Failed to fetch logs', error);
            panelManager.showError('Erreur de chargement des logs');
        }
    }

    // Charger les comptes d'erreurs depuis le cache
    _loadErrorCountsFromCache(logs) {
        const { cache } = window.FoxLog;
        
        logs.forEach(log => {
            const cacheKey = `errorCount_${log.Id}`;
            const cachedCount = cache.get(cacheKey);
            if (cachedCount !== null) {
                log._errorCount = cachedCount;
                log._fromCache = true;
            }
        });
    }

    // 🆕 Scanner les erreurs en arrière-plan par batch
    async _startBackgroundErrorScan(logs) {
      const { logger, salesforceAPI, panelManager, cache } = window.FoxLog;
      
      // Éviter les scans multiples simultanés
      if (this.isScanning) return;
      
      // Ne scanner que les logs sans cache
      const logsToScan = logs.filter(log => !log._fromCache);
      
      if (logsToScan.length === 0) {
          logger.log('All logs already cached');
          return;
      }

      this.isScanning = true;
      logger.log(`🔍 Background scan: ${logsToScan.length} logs to check`);

      // Scanner par batch de 5 pour ne pas surcharger
      const BATCH_SIZE = 5;
      
      for (let i = 0; i < logsToScan.length; i += BATCH_SIZE) {
          const batch = logsToScan.slice(i, i + BATCH_SIZE);
          
          // Scanner le batch en parallèle
          await Promise.all(batch.map(async (log) => {
              try {
                  const logBody = await salesforceAPI.fetchLogBody(log.Id);
                  const errorCount = (logBody.match(/EXCEPTION_THROWN|FATAL_ERROR/g) || []).length;
                  
                  // Mettre à jour le log
                  log._errorCount = errorCount;
                  
                  // Sauver dans le cache (expire après 1 heure)
                  const cacheKey = `errorCount_${log.Id}`;
                  cache.set(cacheKey, errorCount);
                  
                  if (errorCount > 0) {
                      logger.warn(`⚠️ Found ${errorCount} error(s) in log ${log.Id.substring(0, 8)}`);
                  }
              } catch (error) {
                  logger.error(`Failed to scan log ${log.Id}`, error);
                  log._errorCount = 0;
              }
          }));

          // Rafraîchir l'UI après chaque batch
          panelManager._renderLogsWithPagination();
          
          // Petite pause entre les batchs pour ne pas surcharger
          if (i + BATCH_SIZE < logsToScan.length) {
              await new Promise(resolve => setTimeout(resolve, 200));
          }
      }

      this.isScanning = false;
      logger.success(`✅ Background scan completed`);
    }

    // ✅ Voir les détails d'un log
    async viewLogDetails(logId) {
      console.log('viewLogDetails called', logId, window.FoxLog.modalManager, window.FoxLog.logParser);

      const { logger, salesforceAPI } = window.FoxLog;
      
      try {
          logger.log(`Fetching details for log ${logId}`);
          const logMetadata = this.currentLogs.find(log => log.Id === logId);
          
          if (!logMetadata) {
              logger.error('Log metadata not found');
              return;
          }
          
          const logBody = await salesforceAPI.fetchLogBody(logId);
          
          // Vérifier si le parser est disponible
          if (window.FoxLog.logParser && window.FoxLog.modalManager) {
              const parsedLog = window.FoxLog.logParser.parse(logBody, logMetadata);
              
              // Mettre à jour les métadonnées avec le nombre d'erreurs détectées
              const errorCount = parsedLog.stats.errors.length;
              logMetadata._errorCount = errorCount;
              
              // Rafraîchir l'affichage du panel pour mettre à jour le badge
              if (window.FoxLog.panelManager && this.currentLogs) {
                  window.FoxLog.panelManager.updateLogList(this.currentLogs);
              }
              
              window.FoxLog.modalManager.showParsedLog(parsedLog, window.FoxLog.logParser);
          } else {
              // Fallback : afficher le log brut
              if (window.FoxLog.modalManager) {
                  window.FoxLog.modalManager.showRawLog(logBody);
              } else {
                  console.log('Log Body:', logBody);
                  alert('Log chargé ! (voir console)');
              }
          }
          
          logger.success('Log details displayed');
      } catch (error) {
          logger.error('Failed to fetch log details:', error);
      }
    }

    // ✅ Effacer les logs
    clearLogs() {
      const { cache, sessionManager, panelManager, logger } = window.FoxLog;
      
      cache.clear();
      sessionManager.clearCache();
      this.currentLogs = [];
      panelManager.updateLogList([]);
      logger.success('Cache cleared');
    }

    // ✅ Démarrer l'auto-refresh
    _startAutoRefresh() {
      const { CONFIG, logger, panelManager } = window.FoxLog;
      
      if (this.refreshInterval) {
        clearInterval(this.refreshInterval);
      }
      
      this.refreshInterval = setInterval(() => {
        if (panelManager.isOpen && this.userId) {
          logger.log('Auto-refresh triggered');
          this.refreshLogs();
        }
      }, CONFIG.AUTO_REFRESH_INTERVAL);
      
      logger.log('Auto-refresh started');
    }

    // ✅ Détruire l'instance
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

  // ✅ Initialiser l'app
  const app = new FoxLogApp();
  
  // Attendre que le DOM soit prêt
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      console.log('[FoxLog] DOM ready, initializing...');
      app.init();
    });
  } else {
    console.log('[FoxLog] DOM already ready, initializing...');
    app.init();
  }
  
  // Exposer l'app globalement (pour debug)
  window.FoxLogApp = app;
  
  console.log('[FoxLog] Content script loaded');
})();