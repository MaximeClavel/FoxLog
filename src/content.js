// src/content.js
(function() {
  'use strict';
  
  class FoxLogApp {
    constructor() {
      this.initialized = false;
      this.refreshInterval = null;
      this.userId = null;
      this.currentLogs = [];
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
        logger.success('User ID obtained', this.userId);
      } else {
        logger.warn('User ID not found');
      }
      
      // 6. Démarrer l'auto-refresh
      this._startAutoRefresh();
      
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
      document.addEventListener('foxlog:viewLog', (e) => {
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
        const SPINNER_DELAY = 300; // Délai avant d'afficher le spinner
        const MIN_SPINNER_TIME = 600; // Durée minimum d'affichage du spinner

        let showSpinner = false;
        let spinnerStartTime = null;

        // Afficher le spinner seulement si le chargement prend plus de 300ms
        const spinnerTimeout = setTimeout(() => {
            showSpinner = true;
            spinnerStartTime = Date.now();
            panelManager.showLoading();
        }, SPINNER_DELAY);

        const logs = await salesforceAPI.fetchLogs(this.userId);
        
        // Annuler l'affichage du spinner s'il n'a pas encore été montré
        clearTimeout(spinnerTimeout);

        // Si le spinner a été montré, attendre le temps minimum
        if (showSpinner && spinnerStartTime) {
            const elapsed = Date.now() - spinnerStartTime;
            const remaining = MIN_SPINNER_TIME - elapsed;
            if (remaining > 0) {
                await new Promise(resolve => setTimeout(resolve, remaining));
            }
        }

        this.currentLogs = logs;
        panelManager.updateLogList(logs);
        logger.success(`Loaded ${logs.length} logs`);
      } catch (error) {
        logger.error('Failed to fetch logs', error);
        panelManager.showError('Erreur de chargement des logs');
      }
    }

    // ✅ Voir les détails d'un log
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
        
        // Vérifier si le parser est disponible
        if (window.FoxLog.logParser && window.FoxLog.modalManager) {
          const parsedLog = window.FoxLog.logParser.parse(logBody, logMetadata);
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
        logger.error('Failed to fetch log details', error);
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