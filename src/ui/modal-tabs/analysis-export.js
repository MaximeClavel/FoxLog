// src/ui/modal-tabs/analysis-export.js
// Analysis report export (PDF through the print dialog, Markdown, plain text),
// triggered from the Analysis tab's export menu.
(function() {
  'use strict';

  window.FoxLog = window.FoxLog || {};
  const i18n = window.FoxLog.i18n || {};
  const logger = window.FoxLog.logger || console;
  const { escapeHtml, generateFilename, downloadFile } = window.FoxLog.modalTabUtils;

  class AnalysisExporter {
    constructor() {
      // Logo assets in base64 for PDF export
      this.logoIconBase64 = null;
      this.logoTextBase64 = null;
      this._loadLogoAssets();
    }

    /**
     * Load logo assets as base64 for PDF export
     * @private
     */
    async _loadLogoAssets() {
      try {
        const iconUrl = chrome.runtime.getURL('src/assets/icon128.png');
        const logoTextUrl = chrome.runtime.getURL('src/assets/FoxLog.png');

        const [iconResponse, logoResponse] = await Promise.all([
          fetch(iconUrl),
          fetch(logoTextUrl)
        ]);

        const [iconBlob, logoBlob] = await Promise.all([
          iconResponse.blob(),
          logoResponse.blob()
        ]);

        this.logoIconBase64 = await this._blobToBase64(iconBlob);
        this.logoTextBase64 = await this._blobToBase64(logoBlob);

        logger.log('[AnalysisExporter] Logo assets loaded for PDF export');
      } catch (error) {
        logger.warn('[AnalysisExporter] Failed to load logo assets', error);
      }
    }

    /**
     * Convert blob to base64 string
     * @private
     */
    _blobToBase64(blob) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }

    /**
     * Show a toast through the modal's toast listener
     * @private
     */
    _notify(message, type = 'success') {
      document.dispatchEvent(new CustomEvent('foxlog:showToast', { detail: { message, type } }));
    }

    /**
     * Export analysis report as PDF (via print dialog)
     * @param {Object} parsedLog - Parsed log shown in the modal
     * @param {Object} results - Anti-pattern analysis results for that log
     */
    exportPdf(parsedLog, results) {
      logger.log('[PDF Export] Starting PDF export...');

      if (!parsedLog || !results) {
        logger.error('[PDF Export] No data available', {
          hasLog: !!parsedLog,
          hasResults: !!results
        });
        this._notify(i18n.toastExportError || 'Export error', 'error');
        return;
      }

      const { metadata } = parsedLog;
      const { patterns, summary } = results;
      const date = new Date().toLocaleString();

      logger.log('[PDF Export] Generating HTML...');
      // Generate PDF-friendly HTML
      const html = this.generatePdfHtml(metadata, patterns, summary, date);

      // Try to open print window
      try {
        logger.log('[PDF Export] Opening print window...');
        const printWindow = window.open('', '_blank', 'width=900,height=700');

        if (!printWindow || printWindow.closed || typeof printWindow.closed === 'undefined') {
          // Popup blocked - use iframe fallback
          logger.warn('[PDF Export] Popup blocked, using iframe fallback');
          this._exportPdfViaIframe(html);
          return;
        }

        printWindow.document.write(html);
        printWindow.document.close();

        // Wait for content to load then print
        printWindow.onload = () => {
          setTimeout(() => {
            printWindow.focus();
            printWindow.print();
          }, 300);
        };

        logger.success('[PDF Export] PDF export initiated');
        this._notify(i18n.exportPdfReady || 'PDF ready - use "Save as PDF" in print dialog');

      } catch (error) {
        logger.error('[PDF Export] PDF export failed', error);
        this._exportPdfViaIframe(html);
      }
    }

    /**
     * Fallback: Export PDF via hidden iframe
     * @private
     */
    _exportPdfViaIframe(html) {
      logger.log('[PDF Export] Using iframe fallback');
      // Create a hidden iframe
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow.document;
      doc.open();
      doc.write(html);
      doc.close();

      // Wait for content then print
      setTimeout(() => {
        try {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
          this._notify(i18n.exportPdfReady || 'PDF ready - use "Save as PDF" in print dialog');
        } catch (e) {
          logger.error('[PDF Export] Iframe print failed', e);
          this._notify(i18n.toastExportError || 'Export error', 'error');
        }

        // Remove iframe after a delay
        setTimeout(() => {
          document.body.removeChild(iframe);
        }, 1000);
      }, 500);
    }

    /**
     * Export analysis report as Markdown
     * @param {Object} parsedLog - Parsed log shown in the modal
     * @param {Object} results - Anti-pattern analysis results for that log
     */
    exportMarkdown(parsedLog, results) {
      if (!parsedLog || !results) {
        this._notify(i18n.toastExportError || 'Export error', 'error');
        return;
      }

      const { metadata } = parsedLog;
      const { patterns, summary } = results;
      const date = new Date().toLocaleString();

      const md = this.generateMarkdown(metadata, patterns, summary, date);
      const filename = generateFilename(parsedLog, 'md');
      const blob = new Blob([md], { type: 'text/markdown' });

      downloadFile(blob, filename);
      this._notify(i18n.analysisExportSuccess || 'Export successful');
      logger.success('[MD Export] Markdown exported');
    }

    /**
     * Export analysis report as plain text
     * @param {Object} parsedLog - Parsed log shown in the modal
     * @param {Object} results - Anti-pattern analysis results for that log
     */
    exportText(parsedLog, results) {
      if (!parsedLog || !results) {
        this._notify(i18n.toastExportError || 'Export error', 'error');
        return;
      }

      const { metadata } = parsedLog;
      const { patterns, summary } = results;
      const date = new Date().toLocaleString();

      const txt = this.generateText(metadata, patterns, summary, date);
      const filename = generateFilename(parsedLog, 'txt');
      const blob = new Blob([txt], { type: 'text/plain' });

      downloadFile(blob, filename);
      this._notify(i18n.analysisExportSuccess || 'Export successful');
      logger.success('[TXT Export] Text file exported');
    }

    /**
     * Generate Markdown content for export
     * @returns {string} Markdown report
     */
    generateMarkdown(metadata, patterns, summary, date) {
      const criticalPatterns = patterns.filter(p => p.severity === 'critical');
      const warningPatterns = patterns.filter(p => p.severity === 'warning');
      const infoPatterns = patterns.filter(p => p.severity === 'info');

      let md = `# FoxLog - Analysis Report\n\n`;
      md += `**Generated:** ${date}\n\n`;
      md += `---\n\n`;

      // Score section
      md += `## Health Score: ${summary.score}/100\n\n`;
      md += `| Severity | Count |\n`;
      md += `|----------|-------|\n`;
      md += `| Critical | ${summary.critical} |\n`;
      md += `| Warning | ${summary.warnings} |\n`;
      md += `| Info | ${summary.info} |\n\n`;

      // Metadata
      md += `## Log Information\n\n`;
      md += `- **Operation:** ${metadata.operation || '-'}\n`;
      md += `- **Status:** ${metadata.status || '-'}\n`;
      md += `- **Duration:** ${metadata.duration || 0}ms\n`;
      md += `- **Log ID:** ${metadata.id || '-'}\n\n`;

      if (patterns.length === 0) {
        md += `## No Issues Detected\n\n`;
        md += `Great job! No anti-patterns were found in this log.\n`;
        return md;
      }

      // Critical patterns
      if (criticalPatterns.length > 0) {
        md += `## Critical Issues (${criticalPatterns.length})\n\n`;
        criticalPatterns.forEach((p, i) => {
          md += this._formatPatternMd(p, i + 1);
        });
      }

      // Warning patterns
      if (warningPatterns.length > 0) {
        md += `## Warnings (${warningPatterns.length})\n\n`;
        warningPatterns.forEach((p, i) => {
          md += this._formatPatternMd(p, i + 1);
        });
      }

      // Info patterns
      if (infoPatterns.length > 0) {
        md += `## Info (${infoPatterns.length})\n\n`;
        infoPatterns.forEach((p, i) => {
          md += this._formatPatternMd(p, i + 1);
        });
      }

      md += `---\n\n`;
      md += `*Report generated by FoxLog - Salesforce Debug Log Analyzer*\n`;

      return md;
    }

    /**
     * Format a single pattern for Markdown
     * @private
     */
    _formatPatternMd(pattern, index) {
      let md = `### ${index}. ${pattern.title}\n\n`;
      md += `${pattern.description}\n\n`;

      if (pattern.query) {
        md += `**Query:**\n\`\`\`sql\n${pattern.query}\n\`\`\`\n\n`;
      }

      if (pattern.method) {
        md += `**Method:** \`${pattern.method}\`\n\n`;
      }

      if (pattern.count) {
        md += `**Occurrences:** ${pattern.count}\n\n`;
      }

      if (pattern.suggestion) {
        md += `> **Suggestion:** ${pattern.suggestion}\n\n`;
      }

      return md;
    }

    /**
     * Generate plain text content for export
     * @returns {string} Plain text report
     */
    generateText(metadata, patterns, summary, date) {
      const criticalPatterns = patterns.filter(p => p.severity === 'critical');
      const warningPatterns = patterns.filter(p => p.severity === 'warning');
      const infoPatterns = patterns.filter(p => p.severity === 'info');

      const separator = '='.repeat(60);
      const subSeparator = '-'.repeat(40);

      let txt = `${separator}\n`;
      txt += `  FOXLOG - ANALYSIS REPORT\n`;
      txt += `${separator}\n\n`;
      txt += `Generated: ${date}\n\n`;

      // Score section
      txt += `HEALTH SCORE: ${summary.score}/100\n`;
      txt += `${subSeparator}\n`;
      txt += `  Critical: ${summary.critical}\n`;
      txt += `  Warning:  ${summary.warnings}\n`;
      txt += `  Info:     ${summary.info}\n\n`;

      // Metadata
      txt += `LOG INFORMATION\n`;
      txt += `${subSeparator}\n`;
      txt += `  Operation: ${metadata.operation || '-'}\n`;
      txt += `  Status:    ${metadata.status || '-'}\n`;
      txt += `  Duration:  ${metadata.duration || 0}ms\n`;
      txt += `  Log ID:    ${metadata.id || '-'}\n\n`;

      if (patterns.length === 0) {
        txt += `${separator}\n`;
        txt += `  NO ISSUES DETECTED\n`;
        txt += `${separator}\n\n`;
        txt += `Great job! No anti-patterns were found in this log.\n`;
        return txt;
      }

      // Critical patterns
      if (criticalPatterns.length > 0) {
        txt += `${separator}\n`;
        txt += `  CRITICAL ISSUES (${criticalPatterns.length})\n`;
        txt += `${separator}\n\n`;
        criticalPatterns.forEach((p, i) => {
          txt += this._formatPatternTxt(p, i + 1);
        });
      }

      // Warning patterns
      if (warningPatterns.length > 0) {
        txt += `${separator}\n`;
        txt += `  WARNINGS (${warningPatterns.length})\n`;
        txt += `${separator}\n\n`;
        warningPatterns.forEach((p, i) => {
          txt += this._formatPatternTxt(p, i + 1);
        });
      }

      // Info patterns
      if (infoPatterns.length > 0) {
        txt += `${separator}\n`;
        txt += `  INFO (${infoPatterns.length})\n`;
        txt += `${separator}\n\n`;
        infoPatterns.forEach((p, i) => {
          txt += this._formatPatternTxt(p, i + 1);
        });
      }

      txt += `${separator}\n`;
      txt += `Report generated by FoxLog - Salesforce Debug Log Analyzer\n`;

      return txt;
    }

    /**
     * Format a single pattern for plain text
     * @private
     */
    _formatPatternTxt(pattern, index) {
      let txt = `[${index}] ${pattern.title}\n`;
      txt += `    ${pattern.description}\n`;

      if (pattern.query) {
        txt += `    Query: ${pattern.query}\n`;
      }

      if (pattern.method) {
        txt += `    Method: ${pattern.method}\n`;
      }

      if (pattern.count) {
        txt += `    Occurrences: ${pattern.count}\n`;
      }

      if (pattern.suggestion) {
        txt += `    Suggestion: ${pattern.suggestion}\n`;
      }

      txt += `\n`;
      return txt;
    }

    /**
     * Generate HTML content for PDF export
     * @returns {string} Standalone HTML document
     */
    generatePdfHtml(metadata, patterns, summary, date) {
      const criticalPatterns = patterns.filter(p => p.severity === 'critical');
      const warningPatterns = patterns.filter(p => p.severity === 'warning');
      const infoPatterns = patterns.filter(p => p.severity === 'info');

      // Determine score color
      let scoreColor = '#16a34a';
      if (summary.score < 50) scoreColor = '#dc2626';
      else if (summary.score < 80) scoreColor = '#d97706';

      // Use base64 logos if available, fallback to text
      const logoHtml = this.logoIconBase64 && this.logoTextBase64
        ? `<img src="${this.logoIconBase64}" alt="FoxLog" class="logo-icon" /><img src="${this.logoTextBase64}" alt="FoxLog" class="logo-text" />`
        : `<span class="logo-fallback">FoxLog</span>`;

      return `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>FoxLog Analysis Report - ${metadata.operation || 'Log'}</title>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              font-size: 12px;
              line-height: 1.5;
              color: #1f2937;
              padding: 40px;
              max-width: 800px;
              margin: 0 auto;
            }
            .header {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              margin-bottom: 30px;
              padding-bottom: 20px;
              border-bottom: 2px solid #e5e7eb;
            }
            .logo {
              display: flex;
              align-items: center;
              gap: 8px;
            }
            .logo-icon {
              width: 40px;
              height: 40px;
            }
            .logo-text {
              height: 32px;
            }
            .logo-fallback {
              font-size: 24px;
              font-weight: 700;
              color: #f97316;
            }
            .report-info { text-align: right; color: #6b7280; font-size: 11px; }
            .score-section {
              display: flex;
              align-items: center;
              gap: 30px;
              margin-bottom: 30px;
              padding: 20px;
              background: #f9fafb;
              border-radius: 8px;
            }
            .score-circle {
              width: 100px;
              height: 100px;
              border-radius: 50%;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              color: white;
              font-weight: 700;
            }
            .score-value { font-size: 32px; line-height: 1; }
            .score-label { font-size: 10px; opacity: 0.9; }
            .stats { display: flex; gap: 20px; }
            .stat { text-align: center; }
            .stat-value { font-size: 24px; font-weight: 700; }
            .stat-label { font-size: 11px; color: #6b7280; }
            .stat-critical .stat-value { color: #dc2626; }
            .stat-warning .stat-value { color: #d97706; }
            .stat-info .stat-value { color: #2563eb; }
            .metadata {
              margin-bottom: 30px;
              padding: 15px;
              background: #f3f4f6;
              border-radius: 8px;
            }
            .metadata h3 { font-size: 14px; margin-bottom: 10px; }
            .metadata-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
            .metadata-item { display: flex; gap: 8px; }
            .metadata-label { color: #6b7280; min-width: 80px; }
            .pattern-group { margin-bottom: 25px; }
            .pattern-group h3 {
              font-size: 14px;
              padding: 10px 15px;
              margin-bottom: 10px;
              border-radius: 6px;
            }
            .group-critical h3 { background: #fef2f2; color: #dc2626; }
            .group-warning h3 { background: #fffbeb; color: #d97706; }
            .group-info h3 { background: #eff6ff; color: #2563eb; }
            .pattern-item {
              padding: 12px 15px;
              margin-bottom: 8px;
              border: 1px solid #e5e7eb;
              border-radius: 6px;
              border-left-width: 4px;
              page-break-inside: avoid;
            }
            .pattern-item.critical { border-left-color: #dc2626; }
            .pattern-item.warning { border-left-color: #d97706; }
            .pattern-item.info { border-left-color: #2563eb; }
            .pattern-title { font-weight: 600; margin-bottom: 4px; }
            .pattern-desc { color: #4b5563; margin-bottom: 8px; }
            .pattern-suggestion {
              background: #f0fdf4;
              border: 1px solid #bbf7d0;
              padding: 8px 10px;
              border-radius: 4px;
              font-size: 11px;
              color: #166534;
            }
            .pattern-query {
              background: #f3f4f6;
              padding: 6px 10px;
              border-radius: 4px;
              font-family: monospace;
              font-size: 10px;
              margin-bottom: 8px;
              word-break: break-all;
            }
            .footer {
              margin-top: 40px;
              padding-top: 20px;
              border-top: 1px solid #e5e7eb;
              text-align: center;
              color: #9ca3af;
              font-size: 10px;
            }
            .healthy-message {
              text-align: center;
              padding: 40px;
              background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);
              border-radius: 12px;
              border: 2px solid #10b981;
            }
            .healthy-icon { display: flex; justify-content: center; margin-bottom: 10px; }
            .healthy-text { font-size: 20px; font-weight: 700; color: #059669; }
            @media print {
              body { padding: 20px; }
              .pattern-item { page-break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="logo">
              ${logoHtml}
            </div>
            <div class="report-info">
              <div>${i18n.analysisReport || 'Analysis Report'}</div>
              <div>${date}</div>
            </div>
          </div>

          <div class="score-section">
            <div class="score-circle" style="background: ${scoreColor};">
              <div class="score-value">${summary.score}</div>
              <div class="score-label">/100</div>
            </div>
            <div class="stats">
              <div class="stat stat-critical">
                <div class="stat-value">${summary.critical}</div>
                <div class="stat-label">${i18n.critical || 'Critical'}</div>
              </div>
              <div class="stat stat-warning">
                <div class="stat-value">${summary.warnings}</div>
                <div class="stat-label">${i18n.warning || 'Warning'}</div>
              </div>
              <div class="stat stat-info">
                <div class="stat-value">${summary.info}</div>
                <div class="stat-label">${i18n.info || 'Info'}</div>
              </div>
            </div>
          </div>

          <div class="metadata">
            <h3>${i18n.logInfo || 'Log Information'}</h3>
            <div class="metadata-grid">
              <div class="metadata-item">
                <span class="metadata-label">${i18n.operation || 'Operation'}:</span>
                <span>${metadata.operation || '-'}</span>
              </div>
              <div class="metadata-item">
                <span class="metadata-label">${i18n.status || 'Status'}:</span>
                <span>${metadata.status || '-'}</span>
              </div>
              <div class="metadata-item">
                <span class="metadata-label">${i18n.duration || 'Duration'}:</span>
                <span>${metadata.duration || 0}ms</span>
              </div>
              <div class="metadata-item">
                <span class="metadata-label">ID:</span>
                <span>${metadata.id || '-'}</span>
              </div>
            </div>
          </div>

          ${patterns.length === 0 ? `
            <div class="healthy-message">
              <div class="healthy-icon">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              </div>
              <div class="healthy-text">${i18n.codeHealthy || 'Code is healthy!'}</div>
              <p>${i18n.noAntiPatterns || 'No anti-patterns detected'}</p>
            </div>
          ` : `
            ${criticalPatterns.length > 0 ? `
              <div class="pattern-group group-critical">
                <h3>${i18n.critical || 'Critical'} (${criticalPatterns.length})</h3>
                ${criticalPatterns.map(p => this._renderPdfPatternItem(p, 'critical')).join('')}
              </div>
            ` : ''}

            ${warningPatterns.length > 0 ? `
              <div class="pattern-group group-warning">
                <h3>${i18n.warning || 'Warning'} (${warningPatterns.length})</h3>
                ${warningPatterns.map(p => this._renderPdfPatternItem(p, 'warning')).join('')}
              </div>
            ` : ''}

            ${infoPatterns.length > 0 ? `
              <div class="pattern-group group-info">
                <h3>${i18n.info || 'Info'} (${infoPatterns.length})</h3>
                ${infoPatterns.map(p => this._renderPdfPatternItem(p, 'info')).join('')}
              </div>
            ` : ''}
          `}

          <div class="footer">
            ${i18n.generatedBy || 'Generated by'} FoxLog v${chrome.runtime.getManifest().version}
          </div>
        </body>
        </html>
      `;
    }

    /**
     * Render a single pattern item for PDF
     * @private
     */
    _renderPdfPatternItem(pattern, severity) {
      return `
        <div class="pattern-item ${severity}">
          <div class="pattern-title">${pattern.title}</div>
          <div class="pattern-desc">${pattern.description}</div>
          ${pattern.query ? `<div class="pattern-query">${escapeHtml(pattern.query)}</div>` : ''}
          ${pattern.occurrences ? `<div style="color: #6b7280; font-size: 11px; margin-bottom: 8px;">${i18n.occurrences || 'Occurrences'}: ${pattern.occurrences}</div>` : ''}
          <div class="pattern-suggestion"><strong>${i18n.suggestion || 'Suggestion'}:</strong> ${pattern.suggestion}</div>
        </div>
      `;
    }
  }

  window.FoxLog.AnalysisExporter = AnalysisExporter;
  window.FoxLog.analysisExporter = new AnalysisExporter();
  logger.log('[FoxLog] Analysis exporter loaded');
})();
