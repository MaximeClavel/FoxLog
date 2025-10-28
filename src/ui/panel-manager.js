// src/ui/panel-manager.js (VERSION AVEC PAGINATION ET PICKLIST UTILISATEURS)
(function() {
  'use strict';
  
  window.FoxLog = window.FoxLog || {};

  class PanelManager {
    constructor() {
      this.panel = null;
      this.isOpen = false;
      this.currentPage = 1;
      this.logsPerPage = 3;
      this.allLogs = [];
      this.logAnalysis = new Map();
      this.usersCache = [];
      this.selectedUserId = null;
    }

    create() {
      if (this.panel) {
        console.warn('[FoxLog] Panel already exists');
        return;
      }

      this.panel = document.createElement('div');
      this.panel.id = 'sf-debug-panel';
      this.panel.className = 'sf-panel-closed';
      this.panel.innerHTML = this._getTemplate();
      
      document.body.appendChild(this.panel);
      this._attachEventListeners();
      
      console.log('[FoxLog] Panel created');
    }

    toggle() {
      this.isOpen = !this.isOpen;
      this.panel.className = this.isOpen ? 'sf-panel-open' : 'sf-panel-closed';
      console.log(`[FoxLog] Panel ${this.isOpen ? 'opened' : 'closed'}`);
    }

    /**
     * Charger les utilisateurs dans la picklist
     */
    async loadUsers(currentUserId = null) {
      const { salesforceAPI, logger } = window.FoxLog;
      const userSelect = this.panel.querySelector('#sf-user-select');
      
      if (!userSelect) {
        logger.error('User select not found');
        return;
      }

      try {
        userSelect.disabled = true;
        userSelect.innerHTML = '<option>Chargement...</option>';
        this.showLoading();
        const users = await salesforceAPI.fetchUsersWithLogs();
        this.usersCache = users;

        if (users.length === 0) {
          userSelect.innerHTML = '<option value="">Aucun log trouvé</option>';
          this.hideLoading();
          logger.warn('No users with logs found');
          return;
        }

        this.hideLoading();

        const options = users.map(user => {
          const selected = user.id === currentUserId ? 'selected' : '';
          return `<option value="${user.id}" ${selected}>
            ${user.name} (${user.logCount} log${user.logCount > 1 ? 's' : ''})
          </option>`;
        }).join('');

        userSelect.innerHTML = options;
        userSelect.disabled = false;

        if (!currentUserId && users.length > 0) {
          this.selectedUserId = users[0].id;
          userSelect.value = users[0].id;
        } else {
          this.selectedUserId = currentUserId;
        }

        logger.success(`Loaded ${users.length} users with logs`);
      } catch (error) {
        logger.error('Failed to load users', error);
        userSelect.innerHTML = '<option value="">Erreur de chargement</option>';
        userSelect.disabled = true;
      }
    }

    /**
     * Obtenir l'utilisateur sélectionné
     */
    getSelectedUserId() {
      const userSelect = this.panel.querySelector('#sf-user-select');
      return userSelect?.value || this.selectedUserId;
    }

    /**
     * Met à jour la liste des logs avec analyse d'erreurs
     * @param {Array} logs - Liste des logs
     * @param {Map} analysisResults - Résultats d'analyse (optionnel)
     * @param {boolean} preservePage - Garder la page courante (défaut: false)
     */
    async updateLogList(logs, analysisResults = null, preservePage = false) {
      const previousLogsCount = this.allLogs.length;
      const previousPage = this.currentPage;
      
      this.allLogs = logs;
      
      // Ne réinitialiser la page que si :
      // 1. preservePage est false ET
      // 2. Le nombre de logs a changé significativement (nouveau log ou suppression)
      if (!preservePage) {
        const hasNewLogs = logs.length !== previousLogsCount;
        if (hasNewLogs) {
          // Si nouveaux logs, aller à la page 1 pour les voir
          this.currentPage = 1;
        } else {
          // Sinon garder la page courante (auto-refresh)
          this.currentPage = previousPage;
        }
      }

      // Vérifier que la page courante est valide
      const totalPages = Math.ceil(logs.length / this.logsPerPage);
      if (this.currentPage > totalPages) {
        this.currentPage = Math.max(1, totalPages);
      }

      if (analysisResults) {
        this.logAnalysis = analysisResults;
      }

      const container = this.panel.querySelector('#sf-logs-list');
      if (!container) return;

      if (logs.length === 0) {
        this._showEmptyState();
      } else {
        this._renderPaginatedLogs();
      }
      this.updateLastRefreshTime();
    }

    /**
     * Affiche les logs de la page courante
     */
    _renderPaginatedLogs() {
      const container = this.panel.querySelector('#sf-logs-list');
      const start = (this.currentPage - 1) * this.logsPerPage;
      const end = start + this.logsPerPage;
      const logsToDisplay = this.allLogs.slice(start, end);

      container.innerHTML = logsToDisplay.map(log => this._createLogItem(log)).join('');
      this._renderPagination();
    }

    /**
     * Affiche les contrôles de pagination
     */
    _renderPagination() {
      const totalPages = Math.ceil(this.allLogs.length / this.logsPerPage);
      
      // Ne pas afficher la pagination s'il n'y a qu'une page
      if (totalPages <= 1) {
        const paginationContainer = this.panel.querySelector('.sf-pagination');
        if (paginationContainer) {
          paginationContainer.style.display = 'none';
        }
        return;
      }

      let paginationContainer = this.panel.querySelector('.sf-pagination');
      
      if (!paginationContainer) {
        // Créer le conteneur de pagination
        paginationContainer = document.createElement('div');
        paginationContainer.className = 'sf-pagination';
        
        const logsContainer = this.panel.querySelector('#sf-logs-list');
        logsContainer.parentNode.insertBefore(paginationContainer, logsContainer.nextSibling);
      }

      paginationContainer.style.display = 'flex';
      paginationContainer.innerHTML = `
        <button class="sf-pagination-btn sf-pagination-prev" ${this.currentPage === 1 ? 'disabled' : ''}>
          <svg viewBox="0 0 20 20" fill="currentColor" style="width: 16px; height: 16px;">
            <path fill-rule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clip-rule="evenodd" />
          </svg>
        </button>
        
        <span class="sf-pagination-info">
          Page ${this.currentPage} / ${totalPages}
          <span class="sf-pagination-count">(${this.allLogs.length} logs)</span>
        </span>
        
        <button class="sf-pagination-btn sf-pagination-next" ${this.currentPage === totalPages ? 'disabled' : ''}>
          <svg viewBox="0 0 20 20" fill="currentColor" style="width: 16px; height: 16px;">
            <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
          </svg>
        </button>
      `;

      // Attacher les événements
      paginationContainer.querySelector('.sf-pagination-prev')?.addEventListener('click', () => {
        this.goToPage(this.currentPage - 1);
      });

      paginationContainer.querySelector('.sf-pagination-next')?.addEventListener('click', () => {
        this.goToPage(this.currentPage + 1);
      });
    }

    /**
     * Navigation vers une page spécifique
     */
    goToPage(page) {
      const totalPages = Math.ceil(this.allLogs.length / this.logsPerPage);
      
      if (page < 1 || page > totalPages) return;
      
      this.currentPage = page;
      this._renderPaginatedLogs();

      // Scroll vers le haut de la liste
      const container = this.panel.querySelector('#sf-logs-list');
      if (container) {
        container.scrollTop = 0;
      }
    }

    showLoading() {
      const container = this.panel.querySelector('#sf-logs-list');
      if (container) {
        // Forcer une hauteur minimale sur le conteneur parent
        const panelContent = container.closest('.sf-panel-content');
        if (panelContent) {
          panelContent.style.minHeight = '250px';
        }

        container.innerHTML = `
          <div class="sf-loading-overlay">
            <div class="sf-spinner"></div>
            <div class="sf-loading-text">Chargement des logs...</div>
          </div>
        `;
      }
    }

    hideLoading() {
      const container = this.panel.querySelector('#sf-logs-list');
      if (!container) return;
      
      // Retirer l'overlay de chargement s'il existe
      const loadingOverlay = container.querySelector('.sf-loading-overlay');
      if (loadingOverlay) {
        loadingOverlay.remove();
      }
    }

    showError(message) {
      const container = this.panel.querySelector('#sf-logs-list');
      if (container) {
        container.innerHTML = `
          <div class="sf-empty-state">
            <p style="color: #ef4444; font-weight: 600;">⚠️ Erreur</p>
            <p style="color: #666;">${message}</p>
          </div>
        `;
      }
    }

    _getTemplate() {
      const ICONS = window.FoxLog.ICONS || {};
      
      return `
        <div class="sf-panel-header">
          <h3>
            <img src="${ICONS.FOXLOG || ''}" alt="FoxLog" style="width:28px;height:28px;vertical-align:middle;margin-right:8px;">
            FoxLog
          </h3>
          <div class="sf-panel-controls">
            <button id="sf-refresh-btn" title="Actualiser">
              <img src="${ICONS.REFRESH || ''}" alt="Refresh" style="width:18px;height:18px;">
            </button>
            <button id="sf-clear-logs-btn" title="Effacer">
              <img src="${ICONS.TRASH || ''}" alt="Clear" style="width:18px;height:18px;">
            </button>
            <button id="sf-close-panel" title="Fermer">×</button>
          </div>
        </div>
        <div class="sf-panel-status">
          <span id="sf-status-indicator" class="sf-status-disconnected">●</span>
          <span id="sf-status-text">Prêt</span>
        </div>
        <div class="sf-panel-filters">
          <select id="sf-user-select" class="sf-user-picklist">
            <option value="">Chargement...</option>
          </select>
          <select id="sf-log-level">
            <option value="all">Tous</option>
            <option value="ERROR">ERROR</option>
            <option value="WARN">WARN</option>
            <option value="INFO">INFO</option>
          </select>
        </div>
        <div class="sf-panel-content" id="sf-logs-list">
          <div class="sf-empty-state">
            <p>👋 Bienvenue dans FoxLog !</p>
            <p class="sf-hint">Sélectionnez un utilisateur pour voir ses logs</p>
          </div>
        </div>
        <div class="sf-panel-footer">
          <span id="sf-version-display">v1.0.7</span>
          <span id="sf-last-update">Jamais mis à jour</span>
        </div>
      `;
    }

    _attachEventListeners() {
      // Bouton refresh
      this.panel.querySelector('#sf-refresh-btn')?.addEventListener('click', () => {
        document.dispatchEvent(new CustomEvent('foxlog:refresh'));
      });
      
      // Bouton clear
      this.panel.querySelector('#sf-clear-logs-btn')?.addEventListener('click', () => {
        document.dispatchEvent(new CustomEvent('foxlog:clear'));
      });
      
      // Bouton close
      this.panel.querySelector('#sf-close-panel')?.addEventListener('click', () => {
        this.toggle();
      });

      // Changement d'utilisateur
      this.panel.querySelector('#sf-user-select')?.addEventListener('change', (e) => {
        this.selectedUserId = e.target.value;
        document.dispatchEvent(new CustomEvent('foxlog:userChanged', {
          detail: { userId: this.selectedUserId }
        }));
      });
      
      // filtre niveau
      this.panel.querySelector('#sf-log-level')?.addEventListener('change', (e) => {
        this.filterLogs('', e.target.value);
      });
      
      // Click sur un log
      this.panel.querySelector('#sf-logs-list')?.addEventListener('click', (e) => {
        const logItem = e.target.closest('.sf-log-item');
        if (logItem) {
          const logId = logItem.dataset.logId;
          if (logId) {
            document.dispatchEvent(new CustomEvent('foxlog:viewLog', {
              detail: { logId }
            }));
          }
        }
      });
    }

    filterLogs(searchText, level) {
      const filtered = this.allLogs.filter(log => {
        const status = log.Status || '';
        const matchesLevel = level === 'all' || status === level;
        return matchesLevel;
      });

      this.allLogs = filtered;
      this.currentPage = 1;
      this._renderPaginatedLogs();
    }

    _showEmptyState() {
      const container = this.panel.querySelector('#sf-logs-list');
      const selectedUser = this.usersCache.find(u => u.id === this.selectedUserId);
      const userName = selectedUser?.name || 'cet utilisateur';
      
      container.innerHTML = `
        <div class="sf-empty-state">
          <p>Aucun log disponible pour ${userName}</p>
          <p class="sf-hint">Cliquez sur Actualiser pour recharger</p>
        </div>
      `;

      // Cacher la pagination
      const paginationContainer = this.panel.querySelector('.sf-pagination');
      if (paginationContainer) {
        paginationContainer.style.display = 'none';
      }
    }

    _createLogItem(log) {
      const time = this._formatTime(log.StartTime);
      const status = log.Status || 'INFO';
      
      // Récupérer l'analyse d'erreur
      const analysis = this.logAnalysis.get(log.Id);
      const hasError = analysis?.hasError || false;
      const errorCount = analysis?.errorCount || 0;
      
      // Badge d'erreur
      const errorBadge = hasError 
        ? `<span class="sf-log-error-badge" title="${errorCount} erreur(s) détectée(s)">
             <svg viewBox="0 0 20 20" fill="currentColor" style="width: 14px; height: 14px;">
               <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
             </svg>
             ${errorCount}
           </span>`
        : '';
      
      return `
        <div class="sf-log-entry sf-log-item ${hasError ? 'sf-log-has-error' : ''}" data-log-id="${log.Id}">
          <div class="sf-log-header">
            <span class="sf-log-level ${status}">${status}</span>
            <span class="sf-log-time">${time}</span>
            ${errorBadge}
          </div>
          <div class="sf-log-body">
            <div class="sf-log-operation">${log.Operation || 'Unknown'}</div>
            <div class="sf-log-message">
              ${log.DurationMilliseconds || 0}ms | ${this._formatSize(log.LogLength || 0)}
            </div>
          </div>
        </div>
      `;
    }

    _formatTime(timestamp) {
      return new Date(timestamp).toLocaleTimeString('fr-FR');
    }

    _formatSize(bytes) {
      if (bytes < 1024) return `${bytes}B`;
      return `${(bytes / 1024).toFixed(1)}KB`;
    }

    updateLastRefreshTime() {
      const lastUpdateElement = this.panel.querySelector('#sf-last-update');
      if (lastUpdateElement) {
        const now = new Date();
        const timeString = now.toLocaleTimeString('fr-FR', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });
        lastUpdateElement.textContent = `Dernière mise à jour: ${timeString}`;
      }
    }
  }

  window.FoxLog.panelManager = new PanelManager();
  console.log('[FoxLog] Panel Manager loaded');
})();