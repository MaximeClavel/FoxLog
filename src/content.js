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
      
      chrome.storage.local.get(['buttonVisible'], (result) => {
        const isVisible = result.buttonVisible !== false; // Default: true
        this._toggleButtonVisibility(isVisible);
      });

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
      button.innerHTML = `<img src="${iconUrl}" alt="FoxLog" style="width:32px;height:32px;pointer-events:none;">`;
      button.title = (i18n?.openLogs) || 'FoxLog - Open logs';
      
      // Load saved position or use default
      this._loadButtonPosition(button);
      
      // Make button draggable
      this._makeButtonDraggable(button);
      
      // Click handler (only when not dragging)
      button.addEventListener('click', async (e) => {
        if (button.dataset.dragging === 'true') {
          return; // Ignore click if dragging
        }
        
        panelManager.toggle();
        
        if (panelManager.isOpen) {
          await panelManager.loadUsers(this.currentUserId);
          const userId = panelManager.getSelectedUserId();
          if (userId) {
            this.selectedUserId = userId;
            await this.refreshLogs();
          }
        }
      });
      
      document.body.appendChild(button);
    }

    /**
     * Load button position from storage
     * @private
     */
    _loadButtonPosition(button) {
      chrome.storage.local.get(['buttonPosition'], (result) => {
          if (result.buttonPosition) {
              // ✅ On récupère aussi dockedSide
              const { top, left, dockedSide } = result.buttonPosition;

              // Apply saved position
              button.style.left = left;
              button.style.top = top;
              button.style.right = 'auto';
              button.style.bottom = 'auto';
              button.style.transform = 'none';

              // ✅ RESTAURATION CRITIQUE DE L'ETAT DOCKÉ
              // Sans ça, le CSS hover ne sait pas dans quel sens animer au premier chargement
              if (dockedSide && dockedSide !== 'none') {
                  button.dataset.docked = dockedSide;
              }

              this.logger.log('Button position restored', { left, top, dockedSide });
          } else {
              // Default position logic...
              const defaultLeft = window.innerWidth - 56;
              const defaultTop = (window.innerHeight / 2) - 22;
              
              button.style.left = defaultLeft + 'px';
              button.style.top = defaultTop + 'px';
              button.style.right = 'auto';
              button.style.bottom = 'auto';
              button.style.transform = 'none';
              
              this.logger.log('Button position set to default');
          }
      });
    }


    /**
     * Save button position to storage
     * @private
     */
    _saveButtonPosition(button, dockedSide) {
      // ✅ Save EXACT pixel position (pas de calcul de side)
      const position = {
        left: button.style.left,
        top: button.style.top,
        dockedSide: dockedSide || 'none' // Optionnel, juste pour info
      };
      
      chrome.storage.local.set({ buttonPosition: position });
      
      this.logger.log('Button position saved', position);
    }

    /**
     * Make button draggable with docking to all edges
     * @private
     */
    _makeButtonDraggable(button) {
        let isDragging = false;
        let offsetX = 0; // Offset de la souris dans le bouton (axe X)
        let offsetY = 0; // Offset de la souris dans le bouton (axe Y)
        let hasMoved = false;

        const onMouseDown = (e) => {
            // Ignore if clicking on interactive elements
            if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
                return;
            }

            isDragging = true;
            hasMoved = false;
            // ✅ SAUVEGARDE de l'état docké avant de l'effacer
            button.setAttribute('data-last-docked', button.dataset.docked || '');
            
            // ✅ IMPORTANT : On signale immédiatement qu'on commence une interaction
            // et on supprime l'état "docké" pour tuer les styles CSS :hover conflictuels
            button.dataset.dragging = 'true';
            button.dataset.docked = ''; 
            
            // Calculer l'offset de la souris DANS le bouton
            const rect = button.getBoundingClientRect();
            offsetX = e.clientX - rect.left;
            offsetY = e.clientY - rect.top;

            // Change cursor and disable transition during drag
            button.style.cursor = 'grabbing';
            button.style.transition = 'none';

            e.preventDefault();
        };

        const onMouseMove = (e) => {
            if (!isDragging) return;

            // Calculer la nouvelle position du bouton
            // Position de la souris - offset = coin supérieur gauche du bouton
            let newLeft = e.clientX - offsetX;
            let newTop = e.clientY - offsetY;

            // Détecter si on a bougé de plus de 5px (seuil pour distinguer clic vs drag)
            if (!hasMoved) {
                const rect = button.getBoundingClientRect();
                const deltaX = Math.abs(newLeft - rect.left);
                const deltaY = Math.abs(newTop - rect.top);

                if (deltaX > 5 || deltaY > 5) {
                    hasMoved = true;
                }
            }

            // Si on a confirmé le mouvement, on applique la position
            if (hasMoved) {
                // ✅ Contraindre aux limites de la fenêtre
                const margin = 0;
                const maxLeft = window.innerWidth - button.offsetWidth - margin;
                const maxTop = window.innerHeight - button.offsetHeight - margin;

                newLeft = Math.max(margin, Math.min(newLeft, maxLeft));
                newTop = Math.max(margin, Math.min(newTop, maxTop));

                // ✅ Appliquer la position (mouvement 2D libre)
                button.style.left = newLeft + 'px';
                button.style.top = newTop + 'px';
                button.style.right = 'auto';
                button.style.bottom = 'auto';
                button.style.transform = 'none';
            }

            e.preventDefault();
        };

        const onMouseUp = (e) => {
            if (!isDragging) return;
            isDragging = false;

            // SI on n'a pas bougé, c'est un simple clic -> on arrête tout ici pour laisser le click handler agir
            if (!hasMoved) {
                button.style.cursor = 'pointer';
                button.style.transition = 'all 0.3s ease'; // Remet la transition normale
                button.dataset.dragging = 'false';
                // IMPORTANT: Si on avait enlevé le 'docked' au mousedown, on le remet
                // pour que le CSS hover fonctionne à nouveau
                const lastDocked = button.getAttribute('data-last-docked'); // Voir explication ci-dessous*
                if (lastDocked) button.dataset.docked = lastDocked;
                return; 
            }

            // SINON (c'est un vrai drag), on lance l'animation de fin
            button.style.cursor = 'pointer';
            button.style.transition = 'left 0.4s cubic-bezier(0.19, 1, 0.22, 1), top 0.4s cubic-bezier(0.19, 1, 0.22, 1)';

            setTimeout(() => {
                this._dockButton(button);
                setTimeout(() => {
                    button.dataset.dragging = 'false';
                    button.style.transition = ''; 
                }, 400);
            }, 50);
        };


        button.addEventListener('mousedown', onMouseDown);
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }

    /**
     * Dock button to nearest edge (all 4 sides)
     * @private
     */
    _dockButton(button) {
      const rect = button.getBoundingClientRect();
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;
      const btnSize = 44; // Taille du bouton

      // Distances aux bords
      const distanceToLeft = rect.left;
      const distanceToRight = windowWidth - rect.right;
      const distanceToTop = rect.top;
      const distanceToBottom = windowHeight - rect.bottom;

      const minDistance = Math.min(distanceToLeft, distanceToRight, distanceToTop, distanceToBottom);

      // ✅ REGLAGE DU DOCKING PARTIEL
      // Le bouton fait 44px.
      // -19px permet de cacher environ 1/3 du bouton (44 / 3 ≈ 14.6)
      const hiddenOffset = -19; 
      
      let finalLeft, finalTop;
      let dockedSide = '';

      if (minDistance === distanceToLeft) {
          finalLeft = hiddenOffset; // Dépasse à gauche
          finalTop = rect.top;
          dockedSide = 'left';
      } else if (minDistance === distanceToRight) {
          // On ajoute 15px de marge supplémentaire pour contrer la scrollbar
          // Donc au lieu d'être caché de 19px, on le décale vers la gauche de 15px de plus
          const scrollbarSafeMargin = 15; 
          
          // Calcul : Largeur fenêtre - Taille bouton - (Offset négatif) - Marge Scrollbar
          finalLeft = windowWidth - btnSize - hiddenOffset - scrollbarSafeMargin;
          
          finalTop = rect.top;
          dockedSide = 'right';
      } else if (minDistance === distanceToTop) {
          finalLeft = rect.left;
          finalTop = hiddenOffset; // Dépasse en haut
          dockedSide = 'top';
      } else {
          finalLeft = rect.left;
          finalTop = windowHeight - btnSize - hiddenOffset; // Dépasse en bas
          dockedSide = 'bottom';
      }

      // Contraindre pour ne pas sortir de l'écran sur l'axe opposé (ex: ne pas dépasser en haut si on est docké à gauche)
      if (dockedSide === 'left' || dockedSide === 'right') {
          finalTop = Math.max(0, Math.min(finalTop, windowHeight - btnSize));
      } else {
          finalLeft = Math.max(0, Math.min(finalLeft, windowWidth - btnSize));
      }

      button.style.left = finalLeft + 'px';
      button.style.top = finalTop + 'px';
      button.style.right = 'auto';
      button.style.bottom = 'auto';
      button.style.transform = 'none';

      // Sauvegarde avec l'info du côté pour le CSS
      button.dataset.docked = dockedSide; // ✅ On ajoute ceci pour le CSS
      this._saveButtonPosition(button, dockedSide);
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

      // Listen for messages from popup
      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'toggleButton') {
          this._toggleButtonVisibility(request.visible);
          sendResponse({ success: true });
        }
        return true;
      });

      // Écouteur de redimensionnement
      window.addEventListener('resize', () => {
          const button = document.getElementById('sf-foxlog-toggle');
          if (button) this._dockButton(button); // Recalcule la position immédiatement
      });
    }

    /**
     * Toggle button visibility
     * @private
     */
    _toggleButtonVisibility(visible) {
      const button = document.getElementById('sf-foxlog-toggle');
      
      if (!button) return;
      
      if (visible) {
        button.style.display = 'flex';
        button.style.opacity = '1';
        button.style.pointerEvents = 'auto';
        this.logger.success('Button shown');
      } else {
        button.style.display = 'none';
        button.style.opacity = '0';
        button.style.pointerEvents = 'none';
        this.logger.success('Button hidden');
      }
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