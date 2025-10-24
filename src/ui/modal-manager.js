// src/ui/modal-manager.js (VERSION CORRIGÉE)
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
            <h3>Détails du log Salesforce</h3>
            <button class="sf-modal-close-btn">✕</button>
          </div>
          <pre class="sf-modal-body">${this._escapeHtml(content)}</pre>
        </div>
      `;
      
      this._attachModal(modal);
      this.logger.success('Raw log modal displayed');
    }

    /**
     * Affiche une modal avec le log parsé (avec tabs)
     */
    showParsedLog(parsedLog, parser) {
      this.close();
      
      const summary = parser.getSummary(parsedLog);
      const modal = this._createModal();
      
      modal.innerHTML = `
        <div class="sf-modal-content">
          <div class="sf-modal-header">
            <h3>📊 Détails du log Salesforce (Parsé)</h3>
            <button class="sf-modal-close-btn">✕</button>
          </div>
          
          <div class="sf-modal-tabs">
            <button class="sf-tab-btn active" data-tab="summary">Résumé</button>
            <button class="sf-tab-btn" data-tab="timeline">Timeline</button>
            <button class="sf-tab-btn" data-tab="raw">Log brut</button>
          </div>
          
          <div class="sf-modal-body-tabs">
            <div class="sf-tab-content active" id="tab-summary">
              ${this._renderSummaryTab(summary, parsedLog)}
            </div>
            <div class="sf-tab-content" id="tab-timeline">
              ${this._renderTimelineTab(parsedLog)}
            </div>
            <div class="sf-tab-content" id="tab-raw">
              <pre class="sf-modal-body">${this._escapeHtml(parsedLog.rawContent)}</pre>
            </div>
          </div>
        </div>
      `;
      
      this._attachModal(modal);
      this._setupTabs(modal);
      this.logger.success('Parsed log modal displayed');
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
      const importantTypes = [
        'METHOD_ENTRY', 'METHOD_EXIT', 
        'SOQL_EXECUTE_BEGIN', 'DML_BEGIN', 
        'USER_DEBUG', 'EXCEPTION_THROWN'
      ];
      
      const importantLines = parsedLog.lines
        .filter(line => importantTypes.includes(line.type))
        .slice(0, 100);

      return `
        <div class="sf-timeline-container">
          <div class="sf-timeline-wrapper">
            ${importantLines.map(line => {
              const indent = (line.details?.depth || 0) * 20;
              return `
                <div class="sf-timeline-item sf-timeline-${line.type.toLowerCase()}" 
                    style="padding-left: ${indent}px">
                  <div class="sf-timeline-time">${line.timestamp}</div>
                  <div class="sf-timeline-type">${line.type}</div>
                  <div class="sf-timeline-content">${this._escapeHtml(line.content)}</div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }

    _escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
  }

  window.FoxLog.modalManager = new ModalManager();
  console.log('[FoxLog] Modal Manager loaded');
})();