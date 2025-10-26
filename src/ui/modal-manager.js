// src/ui/modal-manager.js (VERSION COMPLÈTE)
(function() {
  'use strict';
  
  window.FoxLog = window.FoxLog || {};
  
  class ModalManager {
    constructor() {
      this.currentModal = null;
      this.logger = window.FoxLog.logger;
    }

    /**
     * Affiche une modal avec le contenu brut du log
     */
    showRawLog(content) {
      this.close();
      const modal = this._createModal();
      modal.innerHTML = `
        <div class="sf-modal-content">
          <div class="sf-modal-header">
            <h3>📄 Log brut</h3>
            <button class="sf-modal-close-btn">✕</button>
          </div>
          <div class="sf-modal-body">
            <pre class="sf-raw-log-content">${this._escapeHtml(content)}</pre>
          </div>
        </div>
      `;
      this._attachModal(modal);
      this.logger.success('Raw log modal displayed');
    }

    /**
     * Affiche une modal avec le log parsé (avec tabs et filtres)
     */
    showParsedLog(parsedLog, parser) {
      this.close();
      
      const filterManager = window.FoxLog.filterManager;
      const summary = parser.getSummary(parsedLog);
      
      const modal = this._createModal();
      modal.innerHTML = `
        <div class="sf-modal-content">
          <div class="sf-modal-header">
            <h3>📊 Analyse du log</h3>
            <button class="sf-modal-close-btn">×</button>
          </div>
          
          <div class="sf-modal-tabs">
            <button class="sf-tab-btn active" data-tab="summary">Résumé</button>
            <button class="sf-tab-btn" data-tab="timeline">Timeline</button>
            <button class="sf-tab-btn" data-tab="raw">Log brut</button>
          </div>
          
          <div class="sf-modal-body-tabs">
            <div id="tab-summary" class="sf-tab-content active">
              ${this._renderSummaryTab(summary, parsedLog)}
            </div>
            
            <div id="tab-timeline" class="sf-tab-content">
              
              <!-- SEARCH BAR -->
              <div class="sf-search-bar-sticky">
                <div class="sf-search-container-wrapper">
                </div>
                
                <button id="export-stats-btn" class="sf-export-btn">
                  <svg viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clip-rule="evenodd"/>
                  </svg>
                  Exporter stats (.json)
                </button>
                
              </div>
              
              <!-- FILTER BAR -->
              <div class="sf-filters-wrapper"></div>
              
              <!-- METHOD FILTER -->
              <div class="sf-method-filter-wrapper"></div>
              
              ${this._renderTimelineTab(parsedLog)}
            </div>
            
            <div id="tab-raw" class="sf-tab-content">
              ${this._renderRawTab(parsedLog)}
            </div>
          </div>
        </div>
      `;
      
      this._attachModal(modal);
      this._setupTabs(modal);
      
      // Insert search bar
      const searchWrapper = modal.querySelector('.sf-search-container-wrapper');
      if (searchWrapper && filterManager) {
      searchWrapper.appendChild(filterManager.createSearchBar());
      }
      
      // Insert filter bar
      const filtersWrapper = modal.querySelector('.sf-filters-wrapper');
      if (filtersWrapper && filterManager) {
      filtersWrapper.appendChild(filterManager.createFilterBar());
      }
      
      // Insert method filter
      const methodFilterWrapper = modal.querySelector('.sf-method-filter-wrapper');
      if (methodFilterWrapper && filterManager) {
      methodFilterWrapper.appendChild(filterManager.createMethodFilter(parsedLog));
      }
      
      // Setup filter change listener
      if (filterManager) {
        filterManager.onFilterChange = () => {
          this._applyFilters(modal, parsedLog);
          this._triggerInitialHighlight();
        };
        this._applyFilters(modal, parsedLog);
        this._triggerInitialHighlight();
      }

      this._setupExportButtons(modal, parsedLog);
      
      this.logger.success('Parsed log modal with filters displayed');
    }

    _triggerInitialHighlight() {
      setTimeout(() => {
        const searchInput = this.currentModal?.querySelector('.sf-search-input');
        if (searchInput && searchInput.value) {
          // Créer et déclencher un événement input manuellement
          const event = new Event('input', { bubbles: true });
          searchInput.dispatchEvent(event);
        }
      }, 100);
    }

    _applyFilters(modal, parsedLog) {
      const filterManager = window.FoxLog.filterManager;
      if (!filterManager) return;
      
      const filteredLines = filterManager.applyFilters(parsedLog.lines);
      
      // Re-render timeline
      const timelineWrapper = modal.querySelector('#tab-timeline .sf-timeline-wrapper');
      if (timelineWrapper) {
        const timelineContent = filteredLines.map(line => this._renderTimelineLine(line)).join('');
        timelineWrapper.innerHTML = timelineContent;
      }
    }

    _setupExportButtons(modal, parsedLog) {
      // Export log brut (texte)
      const exportRawBtn = modal.querySelector('#export-raw-btn');
      if (exportRawBtn) {
        exportRawBtn.addEventListener('click', () => {
          this._exportRawLog(parsedLog);
        });
      }

      // Export statistiques (JSON)
      const exportStatsBtn = modal.querySelector('#export-stats-btn');
      if (exportStatsBtn) {
        exportStatsBtn.addEventListener('click', () => {
          this._exportStats(parsedLog);
        });
      }

      // Copier dans le presse-papier
      const copyBtn = modal.querySelector('#copy-raw-btn');
      if (copyBtn) {
        copyBtn.addEventListener('click', () => {
          this._copyToClipboard(parsedLog.rawContent, copyBtn);
        });
      }
    }

    _exportRawLog(parsedLog) {
      try {
        const filename = this._generateFilename(parsedLog, 'txt');
        const blob = new Blob([parsedLog.rawContent], { type: 'text/plain' });
        this._downloadFile(blob, filename);
        this.logger.success('Raw log exported');
        this._showToast('✅ Log exporté avec succès !');
      } catch (error) {
        this.logger.error('Export failed', error);
        this._showToast('❌ Erreur lors de l\'export', 'error');
      }
    }

    _exportStats(parsedLog) {
      try {
        const data = {
          metadata: parsedLog.metadata,
          stats: {
            limits: parsedLog.stats.limits,
            methods: parsedLog.stats.methods,
            errors: parsedLog.stats.errors,
            queries: parsedLog.stats.queries,
            dmlOperations: parsedLog.stats.dmlOperations
          },
          summary: {
            totalLines: parsedLog.lines.length,
            duration: parsedLog.metadata.duration,
            hasErrors: parsedLog.stats.errors.length > 0
          }
        };

        const filename = this._generateFilename(parsedLog, 'json');
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        this._downloadFile(blob, filename);
        this.logger.success('Stats exported');
        this._showToast('✅ Statistiques exportées !');
      } catch (error) {
        this.logger.error('Export failed', error);
        this._showToast('❌ Erreur lors de l\'export', 'error');
      }
    }

    async _copyToClipboard(text, button) {
      try {
        await navigator.clipboard.writeText(text);
        
        // Feedback visuel
        const originalText = button.innerHTML;
        button.innerHTML = `
          <svg viewBox="0 0 20 20" fill="currentColor" style="width: 16px; height: 16px;">
            <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
          </svg>
          Copié !
        `;
        button.classList.add('sf-export-btn-success');
        
        setTimeout(() => {
          button.innerHTML = originalText;
          button.classList.remove('sf-export-btn-success');
        }, 2000);

        this.logger.success('Copied to clipboard');
        this._showToast('✅ Copié dans le presse-papier !');
      } catch (error) {
        this.logger.error('Copy failed', error);
        this._showToast('❌ Erreur lors de la copie', 'error');
      }
    }

    _generateFilename(parsedLog, extension) {
      const date = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
      const operation = (parsedLog.metadata.operation || 'log')
        .replace(/[^a-zA-Z0-9]/g, '_')
        .substring(0, 30);
      return `foxlog_${operation}_${date}.${extension}`;
    }

    _downloadFile(blob, filename) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    _showToast(message, type = 'success') {
      // Supprimer les anciens toasts
      const existingToast = document.querySelector('.sf-toast');
      if (existingToast) {
        existingToast.remove();
      }

      const toast = document.createElement('div');
      toast.className = `sf-toast sf-toast-${type}`;
      toast.textContent = message;
      document.body.appendChild(toast);

      // Animation d'apparition
      setTimeout(() => toast.classList.add('sf-toast-show'), 10);

      // Disparition automatique
      setTimeout(() => {
        toast.classList.remove('sf-toast-show');
        setTimeout(() => toast.remove(), 300);
      }, 3000);
    }

    /**
     * Ferme la modal actuelle
     */
    close() {
      if (this.currentModal) {
        this.currentModal.remove();
        this.currentModal = null;
        this.logger.log('Modal closed');
      }
    }

    _createModal() {
      const modal = document.createElement('div');
      modal.className = 'sf-log-modal';
      return modal;
    }

    _attachModal(modal) {
      document.body.appendChild(modal);
      this.currentModal = modal;

      // Close button
      const closeBtn = modal.querySelector('.sf-modal-close-btn');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => this.close());
      }

      // Click outside to close
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          this.close();
        }
      });

      // Escape key to close
      const escapeHandler = (e) => {
        if (e.key === 'Escape') {
          this.close();
          document.removeEventListener('keydown', escapeHandler);
        }
      };
      document.addEventListener('keydown', escapeHandler);
    }

    _setupTabs(modal) {
      const tabBtns = modal.querySelectorAll('.sf-tab-btn');
      const tabContents = modal.querySelectorAll('.sf-tab-content');

      tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          // Remove active class from all
          tabBtns.forEach(b => b.classList.remove('active'));
          tabContents.forEach(c => c.classList.remove('active'));

          // Add active to clicked
          btn.classList.add('active');
          const tabId = btn.dataset.tab;
          const content = modal.querySelector(`#tab-${tabId}`);
          if (content) {
            content.classList.add('active');
          }
        });
      });
    }

    _renderSummaryTab(summary, parsedLog) {
      const errorsSection = parsedLog.stats.errors.length > 0
        ? `
          <div class="sf-summary-section sf-summary-errors">
            <h4>❌ Erreurs (${parsedLog.stats.errors.length})</h4>
            <div class="sf-errors-list">
              ${parsedLog.stats.errors.map(error => `
                <div class="sf-error-item">
                  <div class="sf-error-type">${error.type}</div>
                  <div class="sf-error-details">
                    <div class="sf-error-message">${error.exceptionType || 'Exception'}: ${error.message}</div>
                    ${error.method ? `<div class="sf-error-location">📍 Location: <code>${error.method}</code></div>` : ''}
                    <div class="sf-error-time">${error.timestamp}</div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        `
        : '';

      return `
        <div class="sf-summary-container">
          <div class="sf-summary-section">
            <h4>ℹ️ Informations générales</h4>
            <div class="sf-summary-grid">
              <div class="sf-summary-item">
                <span class="sf-label">Opération</span>
                <span class="sf-value">${summary.metadata.operation}</span>
              </div>
              <div class="sf-summary-item">
                <span class="sf-label">Statut</span>
                <span class="sf-value sf-status-${summary.metadata.status.toLowerCase()}">${summary.metadata.status}</span>
              </div>
              <div class="sf-summary-item">
                <span class="sf-label">Durée</span>
                <span class="sf-value">${summary.duration}ms</span>
              </div>
              <div class="sf-summary-item">
                <span class="sf-label">Lignes</span>
                <span class="sf-value">${summary.totalLines}</span>
              </div>
            </div>
          </div>

          <div class="sf-summary-section">
            <h4>📊 Limites Salesforce</h4>
            <div class="sf-limits-grid">
              ${this._renderLimitBar('SOQL Queries', parsedLog.stats.limits.soqlQueries, parsedLog.stats.limits.maxSoqlQueries, summary.limits.soql)}
              ${this._renderLimitBar('DML Statements', parsedLog.stats.limits.dmlStatements, parsedLog.stats.limits.maxDmlStatements, summary.limits.dml)}
              ${this._renderLimitBar('CPU Time', parsedLog.stats.limits.cpuTime, parsedLog.stats.limits.maxCpuTime, summary.limits.cpu)}
              ${this._renderLimitBar('Heap Size', parsedLog.stats.limits.heapSize, parsedLog.stats.limits.maxHeapSize, summary.limits.heap)}
            </div>
          </div>

          ${errorsSection}

          <div class="sf-summary-section">
            <h4>🔧 Méthodes (${summary.methods})</h4>
            <div class="sf-methods-list">
              ${parsedLog.stats.methods.slice(0, 10).map(m => `
                <div class="sf-method-item">
                  <span class="sf-method-name">${m.class}.${m.method}</span>
                  <span class="sf-method-calls">${m.calls} appel${m.calls > 1 ? 's' : ''}</span>
                </div>
              `).join('')}
              ${parsedLog.stats.methods.length > 10 ? `<div class="sf-hint">...et ${parsedLog.stats.methods.length - 10} autres</div>` : ''}
            </div>
          </div>
        </div>
      `;
    }

    _renderLimitBar(label, used, max, displayValue) {
      const percentage = max > 0 ? (used / max * 100).toFixed(1) : 0;
      const isWarning = percentage > 75;
      const isDanger = percentage > 90;
      const statusClass = isDanger ? 'danger' : (isWarning ? 'warning' : 'success');

      return `
        <div class="sf-limit-item">
          <span class="sf-label">${label}</span>
          <div class="sf-limit-bar">
            <div class="sf-limit-fill sf-limit-${statusClass}" style="width: ${percentage}%"></div>
          </div>
          <span class="sf-limit-value">${displayValue}</span>
        </div>
      `;
    }

    _renderTimelineTab(parsedLog) {
      return `
        <div class="sf-timeline-container">
          <div class="sf-timeline-wrapper">
            ${parsedLog.lines.map(line => this._renderTimelineLine(line)).join('')}
          </div>
                </div>
              `;
    }

    _renderTimelineLine(line) {
      const iconMap = {
        'METHOD_ENTRY': '→',
        'METHOD_EXIT': '←',
        'SOQL_EXECUTE_BEGIN': '🔍',
        'SOQL_EXECUTE_END': '✓',
        'DML_BEGIN': '💾',
        'DML_END': '✓',
        'USER_DEBUG': '🐛',
        'EXCEPTION_THROWN': '⚠️',
        'FATAL_ERROR': '❌',
        'CODE_UNIT_STARTED': '📦',
        'CODE_UNIT_FINISHED': '✅'
      };

      const typeClassMap = {
        'METHOD_ENTRY': 'sf-type-method',
        'METHOD_EXIT': 'sf-type-method',
        'SOQL_EXECUTE_BEGIN': 'sf-type-database',
        'SOQL_EXECUTE_END': 'sf-type-database',
        'DML_BEGIN': 'sf-type-database',
        'DML_END': 'sf-type-database',
        'USER_DEBUG': 'sf-type-debug',
        'EXCEPTION_THROWN': 'sf-type-error',
        'FATAL_ERROR': 'sf-type-error',
        'CODE_UNIT_STARTED': 'sf-type-system',
        'CODE_UNIT_FINISHED': 'sf-type-system'
      };

      const icon = iconMap[line.type] || '•';
      const typeClass = typeClassMap[line.type] || '';
      const indent = `margin-left: ${line.depth * 20}px`;

      let details = '';
      if (line.details.class && line.details.method) {
        details = `<span class="sf-timeline-method">${line.details.class}.${line.details.method}</span>`;
      } else if (line.details.message) {
        details = `<span class="sf-timeline-message">${this._escapeHtml(line.details.message)}</span>`;
      } else if (line.details.query) {
        details = `<span class="sf-timeline-query">${this._escapeHtml(line.details.query)}</span>`;
      }

      const durationBadge = line.duration > 0 
        ? `<span class="sf-timeline-duration">${line.duration}ms</span>` 
        : '';

      return `
        <div class="sf-timeline-item ${typeClass}" style="${indent}" data-line="${line.lineNumber}">
          <div class="sf-timeline-icon">${icon}</div>
          <div class="sf-timeline-content">
            <div class="sf-timeline-header">
              <span class="sf-timeline-type">${line.type}</span>
              <span class="sf-timeline-time">${line.timestamp}</span>
              ${durationBadge}
            </div>
            ${details ? `<div class="sf-timeline-details">${details}</div>` : ''}
          </div>
        </div>
      `;
    }

    _renderRawTab(parsedLog) {
      return `
        <div class="sf-raw-tab-content">
          <div class="sf-export-toolbar">
            <button id="copy-raw-btn" class="sf-export-btn sf-export-btn-primary">
              <svg viewBox="0 0 20 20" fill="currentColor">
                <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z"/>
                <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z"/>
              </svg>
              Copier
            </button>
            <button id="export-raw-btn" class="sf-export-btn">
              <svg viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd"/>
              </svg>
              Exporter (.txt)
            </button>
            <div class="sf-export-info">
              <span class="sf-export-size">${this._formatBytes(parsedLog.rawContent.length)}</span>
              <span class="sf-export-lines">${parsedLog.lines.length} lignes</span>
            </div>
          </div>
          <pre class="sf-raw-log-content">${this._escapeHtml(parsedLog.rawContent)}</pre>
        </div>
      `;
    }

    _formatBytes(bytes) {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    _escapeHtml(unsafe) {
      if (!unsafe) return '';
      return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }
  }

  window.FoxLog.ModalManager = ModalManager;
  window.FoxLog.modalManager = new ModalManager();
  console.log('[FoxLog] Modal Manager loaded');
})();