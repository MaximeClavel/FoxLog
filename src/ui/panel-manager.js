// src/ui/panel-manager.js
(function() {
  'use strict';
  
  window.FoxLog = window.FoxLog || {};
  const i18n = window.FoxLog.i18n || {};
  const logger = window.FoxLog.logger || console;

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
      this.locale = navigator.language || 'en-US';
      this.debugStatus = null;
      this.statusMessageTimeout = null;
    }

    create() {
      if (this.panel) {
        logger.warn('[FoxLog] Panel already exists');
        return;
      }

      this.panel = document.createElement('div');
      this.panel.id = 'sf-debug-panel';
      this.panel.className = 'sf-panel-closed';
      this.panel.innerHTML = this._getTemplate();
      
      document.body.appendChild(this.panel);
      this._attachEventListeners();
      
      logger.log('[FoxLog] Panel created');
    }

    toggle() {
      this.isOpen = !this.isOpen;
      this.panel.className = this.isOpen ? 'sf-panel-open' : 'sf-panel-closed';
      logger.log(`Panel ${this.isOpen ? 'opened' : 'closed'}`);
    }

    /**
     * load users into the picklist
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
        userSelect.innerHTML = `<option>${i18n.loading || 'Loading...'}</option>`;
        this.showLoading();
        
        logger.log('Fetching users...');
        // Pass currentUserId to ensure current user is always in the list
        const users = await salesforceAPI.fetchUsersWithLogs(currentUserId);
        
        logger.log(`Received ${users.length} users`);
        this.usersCache = users;

        if (users.length === 0) {
          userSelect.innerHTML = `<option value="">❌ ${i18n.noUsersFound || 'No users found'}</option>`;
          this.hideLoading();
          logger.warn('No users found');
          
          const container = this.panel.querySelector('#sf-logs-list');
          if (container) {
            container.innerHTML = `
              <div class="sf-empty-state">
                <p style="color: #f59e0b; font-weight: 600;">⚠️ ${i18n.noUsersFound || 'No users found'}</p>
                <p style="color: #666;">${i18n.noApexLogs || 'No Apex logs found.'}</p>
                <p class="sf-hint">💡 ${i18n.ensureYouHave || 'Make sure you have:'}</p>
                <ul style="text-align: left; color: #666; font-size: 13px; margin: 12px 0;">
                  <li>${i18n.apexLogs || 'Apex logs'}</li>
                  <li>${i18n.activeTraceFlag || 'Or an active TraceFlag'}</li>
                  <li>${i18n.requiredPermissions || 'Required permissions'}</li>
                </ul>
              </div>
            `;
          }
          return;
        }

        this.hideLoading();

        const options = users.map(user => {
          const selected = user.id === currentUserId ? 'selected' : '';
          
          // Determine emoji based on status
          let emoji = '';
          if (user.hasTraceFlag && user.logCount > 0) {
            emoji = '🟢'; // Vert : TraceFlag actif + logs
          } else if (user.hasTraceFlag) {
            emoji = '🟡'; // Jaune : TraceFlag actif mais pas de logs
          } else if (user.logCount > 0) {
            emoji = '📋'; // Clipboard : Seulement des logs
          } else {
            emoji = '⚪'; // Cercle gris : Pas de TraceFlag ni de logs
          }
          
          // Add "(You)" indicator for current user
          const youIndicator = user.isCurrentUser ? ` (${i18n.you || 'You'})` : '';
          let label = `${emoji} ${user.name}${youIndicator}`;
          
          if (user.hasTraceFlag) {
            label += ` [${user.debugLevel}]`;
          }
          
          if (user.logCount > 0) {
            label += ` (${user.logCount} log${user.logCount > 1 ? 's' : ''})`;
          } else if (user.hasTraceFlag) {
            label += ` (0 logs)`;
          }
          
          return `<option value="${user.id}" ${selected}>${label}</option>`;
        }).join('');

        userSelect.innerHTML = options;
        userSelect.disabled = false;

        if (!currentUserId && users.length > 0) {
          this.selectedUserId = users[0].id;
          userSelect.value = users[0].id;
        } else {
          this.selectedUserId = currentUserId;
        }

        // Update debug status
        await this.updateDebugStatus(this.selectedUserId);

        logger.success(`Loaded ${users.length} users`);
      } catch (error) {
        logger.error('Failed to load users', error);
        userSelect.innerHTML = `<option value="">❌ ${i18n.loadingError || 'Error loading logs'}</option>`;
        userSelect.disabled = true;
        this.hideLoading();
      }
    }

    /**
     * Update debug status
     */
    async updateDebugStatus(userId) {
      if (!userId) return;

      const { debugLevelManager } = window.FoxLog;
      if (!debugLevelManager) {
        logger.warn('Debug Level Manager not available');
        return;
      }

      const statusContainer = this.panel.querySelector('#sf-debug-status');
      const debugToggle = this.panel.querySelector('#sf-debug-logs-toggle');
      
      if (!statusContainer) return;

      try {
        statusContainer.textContent = '⏳';
        if (debugToggle) {
          debugToggle.disabled = true;
        }

        const status = await debugLevelManager.getDebugStatus(userId);
        this.debugStatus = status;

        if (debugToggle) {
          debugToggle.checked = status.enabled;
          debugToggle.disabled = false;
        }

        statusContainer.innerHTML = `
          <span class="${status.className}">
            ${status.icon} ${status.message}
          </span>
        `;

        logger.log('Debug status updated:', status);
      } catch (error) {
        logger.error('Failed to update debug status', error);
        statusContainer.textContent = '❌ ' + (i18n.error || 'Error');
        if (debugToggle) {
          debugToggle.disabled = false;
        }
      }
    }

    async toggleDebugLogs() {
      const userId = this.selectedUserId;
      if (!userId) {
        this._showStatusMessage('⚠️ ' + (i18n.noUserSelected || 'No user selected'), 'warning');
        return;
      }

      const { debugLevelManager } = window.FoxLog;
      if (!debugLevelManager) {
        this._showStatusMessage('❌ ' + (i18n.debugManagerUnavailable || 'Debug manager unavailable'), 'error');
        return;
      }

      const debugToggle = this.panel.querySelector('#sf-debug-logs-toggle');
      const statusContainer = this.panel.querySelector('#sf-debug-status');

      try {
        if (debugToggle) debugToggle.disabled = true;
        statusContainer.textContent = '⏳ ' + (i18n.processing || 'Processing...');
        this.showLoading();
        this._showStatusMessage('⏳ ' + (i18n.processing || 'Processing...'), 'info');

        const result = await debugLevelManager.toggleDebugLogs(userId, 60);

        if (result.success) {
          
          if (result.enabled) {
            this._showStatusMessage('✅ ' + (i18n.debugLogsEnabled || 'Debug logs enabled (60min)'), 'success');
            logger.success('Debug logs enabled for user:', userId);
          } else {
            this._showStatusMessage('✅ ' + (i18n.debugLogsDisabled || 'Debug logs disabled'), 'success');
            logger.success('Debug logs disabled for user:', userId);
          }

          // Refresh status
          document.dispatchEvent(new CustomEvent('foxlog:refresh'));
          await this.updateDebugStatus(userId);

          const finalMessage = result.enabled 
            ? (i18n.debugLogsEnabledShort || 'Debug logs enabled')
            : (i18n.debugLogsDisabledShort || 'Debug logs disabled');
          this._showStatusMessage(finalMessage, 'success');
          
        } else {
          throw new Error(result.error || 'Unknown error');
        }

      } catch (error) {
        logger.error('Failed to toggle debug logs', error);
        this._showStatusMessage('❌ ' + (i18n.errorPrefix || 'Error:') + ' ' + error.message, 'error');
        
        if (debugToggle) {
          debugToggle.checked = !debugToggle.checked;
          debugToggle.disabled = false;
        }
        statusContainer.textContent = '❌ ' + (i18n.error || 'Error');
      }
      this.hideLoading();
    }

    _showStatusMessage(message, type = 'info') {
      const statusIndicator = this.panel.querySelector('#sf-status-indicator');
      const statusText = this.panel.querySelector('#sf-status-text');
      
      if (!statusIndicator || !statusText) return;

      if (this.statusMessageTimeout) {
        clearTimeout(this.statusMessageTimeout);
      }

      statusIndicator.className = 'sf-status-disconnected';
      
      switch (type) {
        case 'success':
          statusIndicator.className = 'sf-status-success';
          break;
        case 'error':
          statusIndicator.className = 'sf-status-error';
          break;
        case 'warning':
          statusIndicator.className = 'sf-status-warning';
          break;
        case 'info':
          statusIndicator.className = 'sf-status-info';
          break;
      }

      statusText.textContent = message;

      // Auto-clear after 5 seconds
      this.statusMessageTimeout = setTimeout(() => {
        statusIndicator.className = 'sf-status-disconnected';
        statusText.textContent = i18n.ready || 'Ready';
      }, 5000);
    }

    getSelectedUserId() {
      const userSelect = this.panel.querySelector('#sf-user-select');
      return userSelect?.value || this.selectedUserId;
    }

    async updateLogList(logs, analysisResults = null, preservePage = false) {
      const previousLogsCount = this.allLogs.length;
      const previousPage = this.currentPage;
      
      this.allLogs = logs;
      
      if (!preservePage) {
        const hasNewLogs = logs.length !== previousLogsCount;
        if (hasNewLogs) {
          this.currentPage = 1;
        } else {
          this.currentPage = previousPage;
        }
      }

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

    _renderPaginatedLogs() {
      const container = this.panel.querySelector('#sf-logs-list');
      const start = (this.currentPage - 1) * this.logsPerPage;
      const end = start + this.logsPerPage;
      const logsToDisplay = this.allLogs.slice(start, end);

      container.innerHTML = logsToDisplay.map(log => this._createLogItem(log)).join('');
      this._renderPagination();
    }

    _renderPagination() {
      const totalPages = Math.ceil(this.allLogs.length / this.logsPerPage);
      
      if (totalPages <= 1) {
        const paginationContainer = this.panel.querySelector('.sf-pagination');
        if (paginationContainer) {
          paginationContainer.style.display = 'none';
        }
        return;
      }

      let paginationContainer = this.panel.querySelector('.sf-pagination');
      
      if (!paginationContainer) {
        paginationContainer = document.createElement('div');
        paginationContainer.className = 'sf-pagination';
        
        const logsContainer = this.panel.querySelector('#sf-logs-list');
        logsContainer.parentNode.insertBefore(paginationContainer, logsContainer.nextSibling);
      }

      paginationContainer.style.display = 'flex';
      const pageLabel = i18n.page || 'Page';
      const logsLabel = i18n.logs || 'logs';
      paginationContainer.innerHTML = `
        <button class="sf-pagination-btn sf-pagination-prev" ${this.currentPage === 1 ? 'disabled' : ''}>
          <svg viewBox="0 0 20 20" fill="currentColor" style="width: 16px; height: 16px;">
            <path fill-rule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clip-rule="evenodd" />
          </svg>
        </button>
        
        <span class="sf-pagination-info">
          ${pageLabel} ${this.currentPage} / ${totalPages}
          <span class="sf-pagination-count">(${this.allLogs.length} ${logsLabel})</span>
        </span>
        
        <button class="sf-pagination-btn sf-pagination-next" ${this.currentPage === totalPages ? 'disabled' : ''}>
          <svg viewBox="0 0 20 20" fill="currentColor" style="width: 16px; height: 16px;">
            <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
          </svg>
        </button>
      `;

      paginationContainer.querySelector('.sf-pagination-prev')?.addEventListener('click', () => {
        this.goToPage(this.currentPage - 1);
      });

      paginationContainer.querySelector('.sf-pagination-next')?.addEventListener('click', () => {
        this.goToPage(this.currentPage + 1);
      });
    }

    goToPage(page) {
      const totalPages = Math.ceil(this.allLogs.length / this.logsPerPage);
      
      if (page < 1 || page > totalPages) return;
      
      this.currentPage = page;
      this._renderPaginatedLogs();

      const container = this.panel.querySelector('#sf-logs-list');
      if (container) {
        container.scrollTop = 0;
      }
    }

    showLoading() {
      const container = this.panel.querySelector('#sf-logs-list');
      if (container) {
        const panelContent = container.closest('.sf-panel-content');
        if (panelContent) {
          panelContent.style.minHeight = '250px';
        }

        container.innerHTML = `
          <div class="sf-loading-overlay">
            <div class="sf-spinner"></div>
            <div class="sf-loading-text">${i18n.loading || 'Loading...'}</div>
          </div>
        `;
      }
    }

    hideLoading() {
      const container = this.panel.querySelector('#sf-logs-list');
      if (!container) return;
      
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
            <p style="color: #ef4444; font-weight: 600;">⚠️ ${i18n.error || 'Error'}</p>
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
            <button id="sf-refresh-btn" title="${i18n.refresh || 'Refresh'}">
              <img src="${ICONS.REFRESH || ''}" alt="Refresh" style="width:18px;height:18px;">
            </button>
            <button id="sf-clear-logs-btn" title="${i18n.clear || 'Clear'}">
              <img src="${ICONS.TRASH || ''}" alt="Clear" style="width:18px;height:18px;">
            </button>
            <button id="sf-close-panel" title="${i18n.close || 'Close'}">×</button>
          </div>
        </div>
        <div class="sf-panel-status">
          <span id="sf-status-indicator" class="sf-status-disconnected">●</span>
          <span id="sf-status-text">${i18n.ready || 'Ready'}</span>
        </div>
        <div class="sf-panel-filters">
          <select id="sf-user-select" class="sf-user-picklist" title="🟢 = TraceFlag + logs | 🟡 = TraceFlag | 📋 = Logs | ⚪ = No logs">
            <option value="">${i18n.loading || 'Loading...'}</option>
          </select>
        </div>
        
        <div class="sf-debug-control">
          <label class="sf-debug-toggle-label">
            <input type="checkbox" id="sf-debug-logs-toggle" class="sf-debug-toggle-input" disabled>
            <span class="sf-debug-toggle-slider"></span>
            <span class="sf-debug-toggle-text">${i18n.debugLogs || 'Debug Logs'}</span>
          </label>
          <span id="sf-debug-status" class="sf-debug-status">
            ⚪ ${i18n.unknown || 'Unknown'}
          </span>
        </div>
        
        <div class="sf-panel-content" id="sf-logs-list">
          <div class="sf-empty-state">
            <p>👋 ${i18n.welcome || 'Welcome to FoxLog!'}</p>
            <p class="sf-hint">${i18n.selectUser || 'Select a user'}</p>
          </div>
        </div>
        <div class="sf-panel-footer">
          <span id="sf-version-display">v1.2.0</span>
          <span id="sf-last-update">${i18n.neverUpdated || 'Never updated'}</span>
        </div>
      `;
    }

    _attachEventListeners() {
      this.panel.querySelector('#sf-refresh-btn')?.addEventListener('click', () => {
        document.dispatchEvent(new CustomEvent('foxlog:refresh'));
      });
      
      this.panel.querySelector('#sf-clear-logs-btn')?.addEventListener('click', () => {
        document.dispatchEvent(new CustomEvent('foxlog:clear'));
      });
      
      this.panel.querySelector('#sf-close-panel')?.addEventListener('click', () => {
        this.toggle();
      });

      this.panel.querySelector('#sf-user-select')?.addEventListener('change', async (e) => {
        this.selectedUserId = e.target.value;
        
        await this.updateDebugStatus(this.selectedUserId);
        
        document.dispatchEvent(new CustomEvent('foxlog:userChanged', {
          detail: { userId: this.selectedUserId }
        }));
      });

      this.panel.querySelector('#sf-debug-logs-toggle')?.addEventListener('change', async (e) => {
        await this.toggleDebugLogs();
      });
      
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

    _showEmptyState() {
      const container = this.panel.querySelector('#sf-logs-list');
      const selectedUser = this.usersCache.find(u => u.id === this.selectedUserId);
      const userName = selectedUser?.name || (i18n.thisUser || 'this user');
      
      let hint = i18n.clickRefresh || 'Click Refresh';
      
      if (selectedUser?.hasTraceFlag && selectedUser?.logCount === 0) {
        const traceMessage = i18n.traceFlagActive || 'TraceFlag active but no logs. Execute Apex code.';
        hint = `🟡 ${traceMessage}`;
      }
      
      container.innerHTML = `
        <div class="sf-empty-state">
          <p>${(i18n.noLogsFor || 'No logs for')} ${userName}</p>
          <p class="sf-hint">${hint}</p>
        </div>
      `;

      const paginationContainer = this.panel.querySelector('.sf-pagination');
      if (paginationContainer) {
        paginationContainer.style.display = 'none';
      }
    }

    _createLogItem(log) {
      const time = this._formatTime(log.StartTime);
      const status = log.Status || 'INFO';
      
      const analysis = this.logAnalysis.get(log.Id);
      const hasError = analysis?.hasError || false;
      const errorCount = analysis?.errorCount || 0;
      
      const errorLabel = errorCount === 1 ? (i18n.error || 'Error') : (i18n.errors || 'Errors');
      const errorBadge = hasError 
        ? `<span class="sf-log-error-badge" title="${errorCount} ${errorLabel}">
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
      return new Date(timestamp).toLocaleTimeString(this.locale);
    }

    _formatSize(bytes) {
      if (bytes < 1024) return `${bytes}B`;
      return `${(bytes / 1024).toFixed(1)}KB`;
    }

    updateLastRefreshTime() {
      const lastUpdateElement = this.panel.querySelector('#sf-last-update');
      if (lastUpdateElement) {
        const now = new Date();
        const timeString = now.toLocaleTimeString(this.locale, {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });
        lastUpdateElement.textContent = `${i18n.lastUpdate || 'Last update:'} ${timeString}`;
      }
    }
  }

  window.FoxLog.panelManager = new PanelManager();
  logger.log('[FoxLog] Panel Manager loaded');
})();