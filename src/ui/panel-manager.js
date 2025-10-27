// src/ui/panel-manager.js
(function() {
  'use strict';

  window.FoxLog = window.FoxLog || {};

  class PanelManager {
    constructor() {
      this.panel = null;
      this.isOpen = false;
      // 🆕 Pagination
      this.currentPage = 1;
      this.logsPerPage = 5;
      this.allLogs = [];
      this.hasNewLogs = false;
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

      // Protection contre logs undefined
      if (!logs || !Array.isArray(logs)) {
        console.error('[FoxLog] Invalid logs data:', logs);
        this.showError('Erreur de chargement des logs');
        return;
      }

      // Détecter les nouveaux logs
      if (this.allLogs.length > 0 && logs.length > this.allLogs.length) {
        if (this.currentPage !== 1) {
          this.hasNewLogs = true;
        }
      }

      this.allLogs = logs;

      if (logs.length === 0) {
        this._showEmptyState();
      } else {
        this._renderLogsWithPagination();
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
            <div class="sf-empty-icon">⚠️</div>
            <div class="sf-empty-text">${message}</div>
          </div>
        `;
      }
    }

    _getTemplate() {
      const ICONS = window.FoxLog.ICONS || {};
      return `
        <div class="sf-panel-header">
          <div class="sf-header-title">
            <div class="sf-panel-controls">
              <img src="${ICONS.FOXLOG || ''}" alt="FoxLog" style="width:28px;height:28px;vertical-align:middle;margin-right:8px;">
              FoxLog
            </div>
            <h4>FoxLog Debug</h4>
          </div>
          <button class="sf-refresh-btn" id="sf-refresh-logs" title="Rafraîchir">
            <img src="${ICONS.REFRESH || ''}" alt="Refresh" style="width:18px;height:18px;">
          </button>
        </div>
        <div class="sf-panel-body">
          <div id="sf-logs-list"></div>
        </div>
        <div class="sf-panel-footer">
          <div id="sf-last-update">Dernière mise à jour: --:--:--</div>
        </div>
      `;
    }

    _attachEventListeners() {
      const refreshBtn = this.panel.querySelector('#sf-refresh-logs');
      if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
          window.dispatchEvent(new CustomEvent('foxlog:refresh'));
        });
      }

      const logsList = this.panel.querySelector('#sf-logs-list');
      if (logsList) {
        logsList.addEventListener('click', (e) => {
          const logEntry = e.target.closest('.sf-log-entry');
          if (logEntry) {
            const logId = logEntry.dataset.logId;
            window.dispatchEvent(new CustomEvent('foxlog:viewlog', { detail: { logId } }));
          }
        });
      }
    }

    filterLogs(filterFn) {
      if (typeof filterFn !== 'function') return;
      const filteredLogs = this.allLogs.filter(filterFn);
      this._renderLogsWithPagination(filteredLogs);
    }

    _showEmptyState() {
      const container = this.panel.querySelector('#sf-logs-list');
      if (container) {
        container.innerHTML = `
          <div class="sf-empty-state">
            <div class="sf-empty-icon">📋</div>
            <div class="sf-empty-text">Aucun log disponible</div>
          </div>
        `;
      }
    }

    // 🆕 Rendu avec pagination
    _renderLogsWithPagination(logsToUse) {
      const container = this.panel.querySelector('#sf-logs-list');
      if (!container) return;

      const logs = logsToUse || this.allLogs;
      const totalPages = Math.ceil(logs.length / this.logsPerPage);
      const startIndex = (this.currentPage - 1) * this.logsPerPage;
      const endIndex = startIndex + this.logsPerPage;
      const logsToDisplay = logs.slice(startIndex, endIndex);

      const logsHtml = logsToDisplay.map(log => this._createLogItem(log)).join('');
      const paginationHtml = this._createPaginationControls(totalPages);

      container.innerHTML = `
        ${logsHtml}
        ${paginationHtml}
      `;

      this._attachPaginationListeners();
    }

    // 🆕 Contrôles de pagination
    _createPaginationControls(totalPages) {
      if (totalPages <= 1) return '';

      const page1Badge = this.hasNewLogs && this.currentPage !== 1 
        ? '<span class="sf-new-logs-badge">●</span>' 
        : '';

      return `
        <div class="sf-pagination">
          <button class="sf-pagination-btn" id="sf-prev-page" ${this.currentPage === 1 ? 'disabled' : ''}>
            ←
          </button>
          <div class="sf-pagination-info">
            <span class="sf-current-page">Page ${this.currentPage}</span>
            ${page1Badge}
            <span class="sf-total-pages">sur ${totalPages}</span>
          </div>
          <button class="sf-pagination-btn" id="sf-next-page" ${this.currentPage === totalPages ? 'disabled' : ''}>
            →
          </button>
        </div>
      `;
    }

    // 🆕 Listeners pagination
    _attachPaginationListeners() {
      const prevBtn = this.panel.querySelector('#sf-prev-page');
      const nextBtn = this.panel.querySelector('#sf-next-page');

      if (prevBtn) {
        prevBtn.addEventListener('click', () => {
          if (this.currentPage > 1) {
            this.currentPage--;
            if (this.currentPage === 1) {
              this.hasNewLogs = false;
            }
            this._renderLogsWithPagination();
          }
        });
      }

      if (nextBtn) {
        nextBtn.addEventListener('click', () => {
          const totalPages = Math.ceil(this.allLogs.length / this.logsPerPage);
          if (this.currentPage < totalPages) {
            this.currentPage++;
            this._renderLogsWithPagination();
          }
        });
      }
    }

    _createLogItem(log) {
      const time = this._formatTime(log.StartTime);
      const status = log.Status || 'INFO';
      
      const hasStatusError = status === 'Error' || status === 'Failure' || status.includes('Error');
      const errorCount = log._errorCount || 0;
      const hasContentError = errorCount > 0;
      
      const errorBadge = hasContentError 
        ? `<span class="sf-error-badge">⚠️ ${errorCount} erreur${errorCount > 1 ? 's' : ''}</span>` 
        : hasStatusError 
        ? `<span class="sf-error-badge">⚠️ Erreur</span>` 
        : '';
      
      return `
        <div class="sf-log-entry sf-log-item ${hasContentError || hasStatusError ? 'sf-log-has-error' : ''}" data-log-id="${log.Id}">
          <div class="sf-log-header">
            <span class="sf-log-level ${status}">${status}</span>
            ${errorBadge}
            <span class="sf-log-time">${time}</span>
          </div>
          <div class="sf-log-body">
            <div class="sf-log-operation">${log.Operation || 'Unknown'}</div>
            <div class="sf-log-message">
              ${log.DurationMilliseconds}ms • ${this._formatSize(log.LogLength || 0)}
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
