// src/ui/log-diff-view.js
// Split-pane diff view for comparing two CallTrees side by side

(function() {
  'use strict';

  window.FoxLog = window.FoxLog || {};
  const i18n = window.FoxLog.i18n || {};
  const logger = window.FoxLog.logger || console;
  const escapeHtml = window.FoxLog.escapeHtml || (s => s);

  class LogDiffView {
    /**
     * @param {HTMLElement} container - DOM container
     * @param {Object} diffResult - Result from LogDiffEngine.diff()
     * @param {Object} metaA - { filename, operation, duration }
     * @param {Object} metaB - { filename, operation, duration }
     */
    constructor(container, diffResult, metaA, metaB) {
      this.container = container;
      this.diffResult = diffResult;
      this.metaA = metaA || {};
      this.metaB = metaB || {};

      this.flatPairs = [];
      this.divergenceIndices = [];
      this.currentDivergenceIdx = -1;

      this.nodeHeight = 32;
      this.scrollTop = 0;
      this.renderBuffer = 10;

      this.scrollContainerA = null;
      this.scrollContainerB = null;
      this._isSyncing = false;
    }

    render() {
      this._flatten(this.diffResult.pairs, 0);
      this._buildDivergenceIndex();
      this.container.innerHTML = '';
      this.container.appendChild(this._buildDOM());

      requestAnimationFrame(() => {
        this.scrollContainerA = this.container.querySelector('.sf-diff-scroll-a');
        this.scrollContainerB = this.container.querySelector('.sf-diff-scroll-b');
        this._setupSyncScroll();
        this._setupNavButtons();
        this._renderRows();
      });
    }

    destroy() {
      this.container.innerHTML = '';
      this.flatPairs = [];
      this.divergenceIndices = [];
      this.diffResult = null;
    }

    /** Flatten the recursive DiffPair tree into a flat list with depth */
    _flatten(pair, depth) {
      this.flatPairs.push({ pair, depth });
      if (pair.children) {
        for (const child of pair.children) {
          this._flatten(child, depth + 1);
        }
      }
    }

    _buildDivergenceIndex() {
      this.flatPairs.forEach((item, idx) => {
        if (item.pair.status !== 'match') {
          this.divergenceIndices.push(idx);
        }
      });
    }

    _buildDOM() {
      const wrapper = document.createElement('div');
      wrapper.className = 'sf-diff-wrapper';

      const summary = this.diffResult.summary;
      wrapper.innerHTML = `
        <div class="sf-diff-header">
          <div class="sf-diff-meta sf-diff-meta-a">
            <span class="sf-diff-label">A</span>
            <span class="sf-diff-filename" title="${escapeHtml(this.metaA.filename || '')}">${escapeHtml(this.metaA.filename || 'Log A')}</span>
          </div>
          <div class="sf-diff-meta sf-diff-meta-b">
            <span class="sf-diff-label">B</span>
            <span class="sf-diff-filename" title="${escapeHtml(this.metaB.filename || '')}">${escapeHtml(this.metaB.filename || 'Log B')}</span>
          </div>
        </div>
        <div class="sf-diff-summary-bar">
          <span class="sf-diff-stat sf-diff-stat-total">${summary.totalDivergences} ${i18n.diffDivergences || 'divergences'}</span>
          ${summary.onlyInA ? `<span class="sf-diff-stat sf-diff-stat-removed">−${summary.onlyInA}</span>` : ''}
          ${summary.onlyInB ? `<span class="sf-diff-stat sf-diff-stat-added">+${summary.onlyInB}</span>` : ''}
          ${summary.timingDiffs ? `<span class="sf-diff-stat sf-diff-stat-timing">⏱ ${summary.timingDiffs}</span>` : ''}
          ${summary.errorDiffs ? `<span class="sf-diff-stat sf-diff-stat-error">❌ ${summary.errorDiffs}</span>` : ''}
        </div>
        <div class="sf-diff-panes">
          <div class="sf-diff-pane sf-diff-pane-a">
            <div class="sf-diff-scroll-a" role="region" aria-label="Log A tree"></div>
          </div>
          <div class="sf-diff-gutter"></div>
          <div class="sf-diff-pane sf-diff-pane-b">
            <div class="sf-diff-scroll-b" role="region" aria-label="Log B tree"></div>
          </div>
        </div>
        <div class="sf-diff-nav-bar">
          <button class="sf-diff-nav-btn sf-diff-prev" aria-label="${i18n.diffPrev || 'Previous difference'}">◄ ${i18n.diffPrev || 'Prev'}</button>
          <span class="sf-diff-nav-position">
            ${summary.totalDivergences === 0
              ? (i18n.diffNoDivergences || 'No divergences')
              : `<span class="sf-diff-nav-current">0</span> / ${summary.totalDivergences}`
            }
          </span>
          <button class="sf-diff-nav-btn sf-diff-next" aria-label="${i18n.diffNext || 'Next difference'}">${i18n.diffNext || 'Next'} ►</button>
        </div>
      `;

      return wrapper;
    }

    _renderRows() {
      const paneA = this.scrollContainerA;
      const paneB = this.scrollContainerB;
      if (!paneA || !paneB) return;

      const fragmentA = document.createDocumentFragment();
      const fragmentB = document.createDocumentFragment();

      for (let i = 0; i < this.flatPairs.length; i++) {
        const { pair, depth } = this.flatPairs[i];
        const rowA = this._createRow(pair, 'a', depth, i);
        const rowB = this._createRow(pair, 'b', depth, i);
        fragmentA.appendChild(rowA);
        fragmentB.appendChild(rowB);
      }

      paneA.innerHTML = '';
      paneB.innerHTML = '';
      paneA.appendChild(fragmentA);
      paneB.appendChild(fragmentB);
    }

    /**
     * Create a single row element for one side of the diff
     * @param {Object} pair - DiffPair
     * @param {'a'|'b'} side
     * @param {number} depth
     * @param {number} rowIndex
     * @returns {HTMLElement}
     */
    _createRow(pair, side, depth, rowIndex) {
      const row = document.createElement('div');
      row.className = `sf-diff-row sf-diff-row-${pair.status}`;
      row.dataset.index = rowIndex;
      row.style.paddingLeft = `${depth * 16 + 8}px`;

      const node = side === 'a' ? pair.nodeA : pair.nodeB;
      const isEmpty = !node;

      if (isEmpty) {
        row.classList.add('sf-diff-row-empty');
        row.innerHTML = `<span class="sf-diff-empty-placeholder">&nbsp;</span>`;
        return row;
      }

      const icon = this._getNodeIcon(node.type);
      const name = escapeHtml(node.name || node.type || '');
      const durationStr = this._formatDuration(node.duration);

      let badge = '';
      if (pair.status === 'added') {
        badge = '<span class="sf-diff-badge sf-diff-badge-added" aria-label="Added">+</span>';
      } else if (pair.status === 'removed') {
        badge = '<span class="sf-diff-badge sf-diff-badge-removed" aria-label="Removed">−</span>';
      } else if (pair.status === 'changed' && pair.changes.duration && side === 'b') {
        const delta = pair.changes.duration.delta;
        const sign = delta > 0 ? '+' : '';
        const pct = pair.changes.duration.a > 0
          ? Math.round((delta / pair.changes.duration.a) * 100)
          : 0;
        badge = `<span class="sf-diff-badge sf-diff-badge-timing" aria-label="Duration change: ${sign}${pct}%">${sign}${pct}%</span>`;
      }

      let errorIcon = '';
      if (pair.status === 'changed' && pair.changes.hasError) {
        if ((side === 'a' && pair.changes.hasError.a) || (side === 'b' && pair.changes.hasError.b)) {
          errorIcon = ' <span class="sf-diff-error-icon" aria-label="Error">❌</span>';
        }
      } else if (node.hasError) {
        errorIcon = ' <span class="sf-diff-error-icon" aria-label="Error">❌</span>';
      }

      row.innerHTML = `
        <span class="sf-diff-node-icon">${icon}</span>
        <span class="sf-diff-node-name" title="${name}">${name}</span>
        <span class="sf-diff-node-duration">${durationStr}</span>
        ${badge}${errorIcon}
      `;

      const ariaDesc = this._getAriaDescription(pair, side, node);
      row.setAttribute('aria-label', ariaDesc);

      return row;
    }

    _getNodeIcon(type) {
      const icons = {
        'METHOD_ENTRY': '⚙️',
        'SOQL_EXECUTE_BEGIN': '🔍',
        'DML_BEGIN': '💾',
        'EXCEPTION_THROWN': '❌',
        'USER_DEBUG': '🐛',
        'CODE_UNIT_STARTED': '📦',
        'FLOW_START_INTERVIEW_BEGIN': '🔀',
        'VALIDATION_RULE': '✅',
        'ROOT': '🌳'
      };
      return icons[type] || '▸';
    }

    _formatDuration(ms) {
      if (ms == null || ms === 0) return '';
      if (ms < 1) return '<1ms';
      if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
      return `${Math.round(ms)}ms`;
    }

    _getAriaDescription(pair, side, node) {
      const name = node.name || node.type;
      const dur = this._formatDuration(node.duration);
      if (pair.status === 'added') return `${i18n.diffAdded || 'Added'}: ${name}, ${dur}`;
      if (pair.status === 'removed') return `${i18n.diffRemoved || 'Removed'}: ${name}, ${dur}`;
      if (pair.status === 'changed') return `${i18n.diffChanged || 'Changed'}: ${name}, ${dur}`;
      return `${name}, ${dur}`;
    }

    _setupSyncScroll() {
      if (!this.scrollContainerA || !this.scrollContainerB) return;

      const paneA = this.scrollContainerA.parentElement;
      const paneB = this.scrollContainerB.parentElement;

      const sync = (source, target) => {
        if (this._isSyncing) return;
        this._isSyncing = true;
        target.scrollTop = source.scrollTop;
        this._isSyncing = false;
      };

      paneA.addEventListener('scroll', () => sync(paneA, paneB));
      paneB.addEventListener('scroll', () => sync(paneB, paneA));
    }

    _setupNavButtons() {
      const prevBtn = this.container.querySelector('.sf-diff-prev');
      const nextBtn = this.container.querySelector('.sf-diff-next');

      if (prevBtn) prevBtn.addEventListener('click', () => this.navigatePrev());
      if (nextBtn) nextBtn.addEventListener('click', () => this.navigateNext());
    }

    navigateNext() {
      if (this.divergenceIndices.length === 0) return;
      this.currentDivergenceIdx = Math.min(this.currentDivergenceIdx + 1, this.divergenceIndices.length - 1);
      this._scrollToDivergence();
    }

    navigatePrev() {
      if (this.divergenceIndices.length === 0) return;
      this.currentDivergenceIdx = Math.max(this.currentDivergenceIdx - 1, 0);
      this._scrollToDivergence();
    }

    _scrollToDivergence() {
      const rowIndex = this.divergenceIndices[this.currentDivergenceIdx];
      if (rowIndex == null) return;

      this._updateNavPosition();
      this._highlightRow(rowIndex);

      const offset = rowIndex * this.nodeHeight;
      const paneA = this.scrollContainerA?.parentElement;
      if (paneA) {
        paneA.scrollTop = Math.max(0, offset - paneA.clientHeight / 2);
      }
    }

    _updateNavPosition() {
      const posEl = this.container.querySelector('.sf-diff-nav-current');
      if (posEl) {
        posEl.textContent = this.currentDivergenceIdx + 1;
      }
    }

    _highlightRow(rowIndex) {
      // Remove previous highlights
      this.container.querySelectorAll('.sf-diff-row-highlight').forEach(el => {
        el.classList.remove('sf-diff-row-highlight');
      });

      const rows = this.container.querySelectorAll(`[data-index="${rowIndex}"]`);
      rows.forEach(r => r.classList.add('sf-diff-row-highlight'));

      setTimeout(() => {
        rows.forEach(r => r.classList.remove('sf-diff-row-highlight'));
      }, 2000);
    }
  }

  window.FoxLog.LogDiffView = LogDiffView;
  logger.log('[FoxLog] LogDiffView loaded');
})();
