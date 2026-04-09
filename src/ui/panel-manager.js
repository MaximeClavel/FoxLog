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
          const escapeHtml = window.FoxLog.escapeHtml || ((s) => s);
          let label = `${emoji} ${escapeHtml(user.name)}${youIndicator}`;
          
          if (user.hasTraceFlag) {
            label += ` [${escapeHtml(user.debugLevel)}]`;
          }
          
          if (user.logCount > 0) {
            label += ` (${user.logCount} log${user.logCount > 1 ? 's' : ''})`;
          } else if (user.hasTraceFlag) {
            label += ` (0 logs)`;
          }
          
          return `<option value="${escapeHtml(user.id)}" ${selected}>${label}</option>`;
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
        
        <div class="sf-panel-tabs">
          <button class="sf-panel-tab-btn active" data-panel-tab="salesforce">&#9729;&#65039; ${i18n.tabSalesforce || 'Salesforce'}</button>
          <button class="sf-panel-tab-btn" data-panel-tab="import">&#128196; ${i18n.tabImport || 'Files'}</button>
        </div>
        
        <div id="sf-tab-salesforce" class="sf-panel-tab-content active">
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
        </div>
        
        <div id="sf-tab-import" class="sf-panel-tab-content">
          <div class="sf-import-zone" id="sf-import-dropzone">
            <div class="sf-import-zone-icon">📂</div>
            <div class="sf-import-zone-text">
              <strong>${i18n.importFile || 'Import a file'}</strong><br>
              ${i18n.importDropOrClick || 'Drag & drop a .txt or .log file here, or click to browse'}
            </div>
            <input type="file" id="sf-import-file-input" accept=".txt,.log" style="display:none;">
          </div>
          
          <div class="sf-import-storage" id="sf-import-storage">
            <div class="sf-import-storage-bar">
              <div class="sf-import-storage-fill" id="sf-import-storage-fill" style="width:0%"></div>
            </div>
            <span class="sf-import-storage-text" id="sf-import-storage-text">0 KB ${i18n.importStorageLimit || 'of 10 MB'}</span>
          </div>
          
          <div class="sf-import-history" id="sf-import-history">
            <div class="sf-import-history-header">
              <span class="sf-import-history-title">${i18n.importHistory || 'Import History'}</span>
              <button class="sf-import-delete-all-btn" id="sf-import-delete-all" style="display:none;">
                🗑️ ${i18n.importDeleteAll || 'Delete all'}
              </button>
            </div>
            <div id="sf-import-list">
              <div class="sf-import-empty">
                <p>📭 ${i18n.importNoHistory || 'No imported logs'}</p>
                <p class="sf-hint">${i18n.importNoHistoryHint || 'Import a log file to get started'}</p>
              </div>
            </div>
          </div>
        </div>
        
        <div class="sf-panel-footer">
          <span id="sf-version-display">v${window.FoxLog.VERSION}</span>
          <a href="https://ko-fi.com/maxclv" target="_blank" rel="noopener noreferrer" class="sf-kofi-link" title="${i18n.supportOnKofi || 'Support FoxLog on Ko-fi'}">
            <img src="${ICONS.KOFI || ''}" alt="Ko-fi" class="sf-kofi-logo">
          </a>
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
      
      // Panel tab switching
      this.panel.querySelectorAll('.sf-panel-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const tabId = btn.dataset.panelTab;
          this._switchPanelTab(tabId);
        });
      });
      
      // Import: dropzone click
      const dropzone = this.panel.querySelector('#sf-import-dropzone');
      const fileInput = this.panel.querySelector('#sf-import-file-input');
      
      if (dropzone && fileInput) {
        dropzone.addEventListener('click', () => fileInput.click());
        
        fileInput.addEventListener('change', (e) => {
          const file = e.target.files[0];
          if (file) {
            this._handleImportFile(file);
            fileInput.value = '';
          }
        });
        
        // Drag & drop
        dropzone.addEventListener('dragover', (e) => {
          e.preventDefault();
          dropzone.classList.add('sf-import-dragover');
        });
        
        dropzone.addEventListener('dragleave', () => {
          dropzone.classList.remove('sf-import-dragover');
        });
        
        dropzone.addEventListener('drop', (e) => {
          e.preventDefault();
          dropzone.classList.remove('sf-import-dragover');
          const file = e.dataTransfer.files[0];
          if (file) {
            this._handleImportFile(file);
          }
        });
      }
      
      // Import: delete all
      this.panel.querySelector('#sf-import-delete-all')?.addEventListener('click', () => {
        this._deleteAllImports();
      });
      
      // Import: click on history item
      this.panel.querySelector('#sf-import-list')?.addEventListener('click', (e) => {
        // Delete button
        const deleteBtn = e.target.closest('.sf-import-item-delete');
        if (deleteBtn) {
          e.stopPropagation();
          const importId = deleteBtn.dataset.importId;
          if (importId) this._deleteImport(importId);
          return;
        }
        // Click on item -> open modal
        const item = e.target.closest('.sf-import-item');
        if (item) {
          const importId = item.dataset.importId;
          if (importId) {
            document.dispatchEvent(new CustomEvent('foxlog:viewImportedLog', {
              detail: { importId }
            }));
          }
        }
      });
      
      // Load import history on startup
      this._loadImportHistory();
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

    // ============================================
    // PANEL TABS
    // ============================================

    /**
     * Switch between panel tabs (salesforce / import)
     * @param {string} tabId - The tab to activate
     */
    _switchPanelTab(tabId) {
      // Update tab buttons
      this.panel.querySelectorAll('.sf-panel-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.panelTab === tabId);
      });
      
      // Update tab content
      this.panel.querySelectorAll('.sf-panel-tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `sf-tab-${tabId}`);
      });
      
      // Refresh import history when switching to import tab
      if (tabId === 'import') {
        this._loadImportHistory();
      }
      
      logger.log(`Panel tab switched to: ${tabId}`);
    }

    // ============================================
    // IMPORT FILE HANDLING
    // ============================================

    /**
     * Handle imported file
     * @param {File} file - The file to import
     * @private
     */
    _handleImportFile(file) {
      const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
      const validExtensions = ['.txt', '.log'];
      
      // Validate file type
      const ext = '.' + file.name.split('.').pop().toLowerCase();
      if (!validExtensions.includes(ext)) {
        this._showStatusMessage('⚠️ ' + (i18n.importInvalidType || 'Invalid file type. Use .txt or .log'), 'warning');
        return;
      }
      
      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        this._showStatusMessage('⚠️ ' + (i18n.importFileTooLarge || 'File too large (max 5 MB)'), 'warning');
        return;
      }
      
      const reader = new FileReader();
      reader.onload = async (e) => {
        const content = e.target.result;
        const importEntry = {
          id: 'imp_' + Date.now(),
          filename: file.name,
          date: new Date().toISOString(),
          size: file.size,
          content: content
        };
        
        await this._saveImport(importEntry);
        this._loadImportHistory();
        
        // Dispatch event to open modal with analysis
        document.dispatchEvent(new CustomEvent('foxlog:viewImportedLog', {
          detail: { importId: importEntry.id }
        }));
        
        this._showStatusMessage('✅ ' + (i18n.importSuccess || 'Log imported successfully!'), 'success');
        logger.success(`File imported: ${file.name} (${this._formatSize(file.size)})`);
      };
      
      reader.onerror = () => {
        this._showStatusMessage('❌ ' + (i18n.importError || 'Import error'), 'error');
        logger.error('Failed to read imported file');
      };
      
      reader.readAsText(file);
    }

    /**
     * Save import to chrome.storage.local, evicting oldest if > 10MB
     * @param {Object} entry - The import entry to save
     * @private
     */
    async _saveImport(entry) {
      return new Promise((resolve) => {
        chrome.storage.local.get(['importedLogs'], (result) => {
          const imports = result.importedLogs || [];
          const MAX_STORAGE = 10 * 1024 * 1024; // 10 MB
          
          // Add the new entry
          imports.unshift(entry);
          
          // Evict oldest entries until under limit
          let totalSize = imports.reduce((sum, imp) => sum + (imp.size || 0), 0);
          while (totalSize > MAX_STORAGE && imports.length > 1) {
            const removed = imports.pop();
            totalSize -= (removed.size || 0);
            logger.log(`Evicted old import: ${removed.filename}`);
          }
          
          chrome.storage.local.set({ importedLogs: imports }, resolve);
        });
      });
    }

    /**
     * Load and render import history
     * @private
     */
    _loadImportHistory() {
      chrome.storage.local.get(['importedLogs'], (result) => {
        const imports = result.importedLogs || [];
        this._renderImportHistory(imports);
        this._updateStorageBar(imports);
      });
    }

    /**
     * Render import history list
     * @param {Array} imports - Array of import entries
     * @private
     */
    _renderImportHistory(imports) {
      const listContainer = this.panel.querySelector('#sf-import-list');
      const deleteAllBtn = this.panel.querySelector('#sf-import-delete-all');
      if (!listContainer) return;
      
      if (imports.length === 0) {
        listContainer.innerHTML = `
          <div class="sf-import-empty">
            <p>📭 ${i18n.importNoHistory || 'No imported logs'}</p>
            <p class="sf-hint">${i18n.importNoHistoryHint || 'Import a log file to get started'}</p>
          </div>
        `;
        if (deleteAllBtn) deleteAllBtn.style.display = 'none';
        return;
      }
      
      if (deleteAllBtn) deleteAllBtn.style.display = 'inline-block';
      const escapeHtml = window.FoxLog.escapeHtml || ((s) => s);
      
      listContainer.innerHTML = imports.map(imp => {
        const date = new Date(imp.date);
        const dateStr = date.toLocaleDateString(this.locale, { day: '2-digit', month: '2-digit', year: '2-digit' });
        const timeStr = date.toLocaleTimeString(this.locale, { hour: '2-digit', minute: '2-digit' });
        
        return `
          <div class="sf-import-item" data-import-id="${escapeHtml(imp.id)}">
            <div class="sf-import-item-info">
              <div class="sf-import-item-name">📄 ${escapeHtml(imp.filename)}</div>
              <div class="sf-import-item-meta">${dateStr} ${timeStr} · ${this._formatSize(imp.size)}</div>
            </div>
            <button class="sf-import-item-delete" data-import-id="${escapeHtml(imp.id)}" title="${i18n.importDelete || 'Delete'}">✕</button>
          </div>
        `;
      }).join('');
    }

    /**
     * Update storage usage bar
     * @param {Array} imports - Array of import entries
     * @private
     */
    _updateStorageBar(imports) {
      const MAX_STORAGE = 10 * 1024 * 1024; // 10 MB
      const totalSize = imports.reduce((sum, imp) => sum + (imp.size || 0), 0);
      const percentage = Math.min((totalSize / MAX_STORAGE) * 100, 100);
      
      const fill = this.panel.querySelector('#sf-import-storage-fill');
      const text = this.panel.querySelector('#sf-import-storage-text');
      
      if (fill) {
        fill.style.width = percentage + '%';
        fill.classList.toggle('sf-storage-warning', percentage > 80);
      }
      
      if (text) {
        const usedStr = totalSize < 1024 * 1024
          ? (totalSize / 1024).toFixed(1) + ' KB'
          : (totalSize / (1024 * 1024)).toFixed(2) + ' MB';
        text.textContent = `${usedStr} ${i18n.importStorageLimit || 'of 10 MB'}`;
      }
    }

    /**
     * Delete a single import entry
     * @param {string} importId - The ID of the import to delete
     * @private
     */
    _deleteImport(importId) {
      chrome.storage.local.get(['importedLogs'], (result) => {
        const imports = (result.importedLogs || []).filter(imp => imp.id !== importId);
        chrome.storage.local.set({ importedLogs: imports }, () => {
          this._renderImportHistory(imports);
          this._updateStorageBar(imports);
          logger.log(`Import deleted: ${importId}`);
        });
      });
    }

    /**
     * Delete all imported logs
     * @private
     */
    _deleteAllImports() {
      chrome.storage.local.set({ importedLogs: [] }, () => {
        this._renderImportHistory([]);
        this._updateStorageBar([]);
        logger.success('All imports deleted');
      });
    }

    /**
     * Get an imported log by ID (for viewing)
     * @param {string} importId - The ID of the import
     * @returns {Promise<Object|null>} The import entry or null
     */
    getImportedLog(importId) {
      return new Promise((resolve) => {
        chrome.storage.local.get(['importedLogs'], (result) => {
          const imports = result.importedLogs || [];
          resolve(imports.find(imp => imp.id === importId) || null);
        });
      });
    }
  }

  window.FoxLog.panelManager = new PanelManager();
  logger.log('[FoxLog] Panel Manager loaded');
})();