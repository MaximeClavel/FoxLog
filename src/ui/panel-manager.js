// src/ui/panel-manager.js
(function() {
  'use strict';
  
  window.FoxLog = window.FoxLog || {};

  class PanelManager {
    constructor() {
      this.panel = null;
      this.isOpen = false;
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

    updateLogList(logs) {
      const container = this.panel.querySelector('#sf-logs-list');
      if (!container) return;

      if (logs.length === 0) {
        this._showEmptyState();
      } else {
        this._renderLogs(logs);
      }
      this.updateLastRefreshTime();
    }

    showLoading() {
      const container = this.panel.querySelector('#sf-logs-list');
      if (container) {
        container.innerHTML = `
          <div class="sf-loading-overlay">
            <div class="sf-spinner"></div>
            <div class="sf-loading-text">Chargement des logs...</div>
          </div>
        `;
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
          <input type="text" id="sf-log-filter" placeholder="Filtrer les logs...">
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
            <p class="sf-hint">Les logs apparaîtront ici</p>
          </div>
        </div>
        <div class="sf-panel-footer">
          <span id="sf-version-display">v1.0.5</span>
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

      // filtre texte
      this.panel.querySelector('#sf-log-filter')?.addEventListener('input', (e) => {
          this.filterLogs(e.target.value, this.panel.querySelector('#sf-log-level').value);
      });
      
      // filtre niveau
      this.panel.querySelector('#sf-log-level')?.addEventListener('change', (e) => {
          this.filterLogs(this.panel.querySelector('#sf-log-filter').value, e.target.value);
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
      const logItems = this.panel.querySelectorAll('.sf-log-item');
      const searchLower = searchText.toLowerCase();
      
      logItems.forEach(item => {
          const operation = item.querySelector('.sf-log-operation')?.textContent.toLowerCase() || '';
          const message = item.querySelector('.sf-log-message')?.textContent.toLowerCase() || '';
          const logLevel = item.querySelector('.sf-log-level')?.textContent || '';
          
          // Filtre par texte
          const matchesSearch = searchText === '' || 
                              operation.includes(searchLower) || 
                              message.includes(searchLower);
          
          // Filtre par niveau
          const matchesLevel = level === 'all' || logLevel === level;
          
          // Afficher/masquer
          item.style.display = (matchesSearch && matchesLevel) ? '' : 'none';
      });
    }


    _showEmptyState() {
      const container = this.panel.querySelector('#sf-logs-list');
      container.innerHTML = `
        <div class="sf-empty-state">
          <p>Aucun log disponible</p>
          <p class="sf-hint">Cliquez sur Actualiser pour charger les logs</p>
        </div>
      `;
    }

    _renderLogs(logs) {
      const container = this.panel.querySelector('#sf-logs-list');
      container.innerHTML = logs.map(log => this._createLogItem(log)).join('');
    }

    _createLogItem(log) {
      const time = this._formatTime(log.StartTime);
      const status = log.Status || 'INFO';
      const statusClass = status.toLowerCase();
      
      return `
        <div class="sf-log-entry sf-log-item" data-log-id="${log.Id}">
          <div class="sf-log-header">
            <span class="sf-log-level ${status}">${status}</span>
            <span class="sf-log-time">${time}</span>
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