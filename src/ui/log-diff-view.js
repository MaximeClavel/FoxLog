// src/ui/log-diff-view.js
// Split-pane diff view for comparing two CallTrees side by side

(function() {
  'use strict';

  window.FoxLog = window.FoxLog || {};
  const i18n = window.FoxLog.i18n || {};
  const logger = window.FoxLog.logger || console;
  const escapeHtml = window.FoxLog.escapeHtml || (s => s);

  // Identical rows kept visible around each difference, and the shortest run of
  // identical rows worth folding into a "N identical lines" separator.
  const CONTEXT_ROWS = 2;
  const MIN_FOLDED_ROWS = 3;

  class LogDiffView {
    /**
     * A row "removed" exists only in side A and a row "added" only in side B.
     * Side A goes in the left pane and side B in the right one, unless
     * `options.leftSide` says otherwise.
     * @param {HTMLElement} container - DOM container
     * @param {Object} diffResult - Result from LogDiffEngine.diff()
     * @param {Object} metaA - { filename, label, onlyLabel }
     * @param {Object} metaB - { filename, label, onlyLabel }
     * @param {Object} [options]
     * @param {'a'|'b'} [options.leftSide='a'] - Side shown in the left pane
     */
    constructor(container, diffResult, metaA, metaB, options = {}) {
      this.container = container;
      this.diffResult = diffResult;
      this.metaA = metaA || {};
      this.metaB = metaB || {};
      this.leftSide = options.leftSide === 'b' ? 'b' : 'a';
      this.rightSide = this.leftSide === 'a' ? 'b' : 'a';

      this.flatPairs = [];
      this.divergenceIndices = [];
      this.currentDivergenceIdx = -1;

      this.showAll = false;
      this.foldedRuns = new Map(); // first row index -> end (exclusive) of a foldable run of identical rows
      this.expandedRuns = new Set(); // first row index of the runs the user unfolded

      this.scrollContainerLeft = null;
      this.scrollContainerRight = null;
      this._isSyncing = false;
      this._destroyed = false;
    }

    render() {
      this._flatten(this.diffResult.pairs, 0, -1);
      this._buildDivergenceIndex();
      this._planFolding();
      this.container.innerHTML = '';
      this.container.appendChild(this._buildDOM());

      requestAnimationFrame(() => {
        if (this._destroyed) return;
        this.scrollContainerLeft = this.container.querySelector('.sf-diff-scroll-left');
        this.scrollContainerRight = this.container.querySelector('.sf-diff-scroll-right');
        this._setupSyncScroll();
        this._setupNavButtons();
        this._setupFolding();
        this._renderRows();
      });
    }

    destroy() {
      this._destroyed = true;
      this.container.innerHTML = '';
      this.flatPairs = [];
      this.divergenceIndices = [];
      this.foldedRuns.clear();
      this.expandedRuns.clear();
      this.diffResult = null;
    }

    /** Flatten the recursive DiffPair tree into a flat list with depth */
    _flatten(pair, depth, parentIdx) {
      const index = this.flatPairs.length;
      this.flatPairs.push({ pair, depth, parentIdx });
      if (pair.children) {
        for (const child of pair.children) {
          this._flatten(child, depth + 1, index);
        }
      }
    }

    /**
     * Rows Prev/Next jump between. The rows inside an added/removed subtree are
     * `nested`: the subtree is one divergence, reached through its first row.
     */
    _buildDivergenceIndex() {
      this.flatPairs.forEach((item, idx) => {
        if (item.pair.status !== 'match' && !item.pair.nested) {
          this.divergenceIndices.push(idx);
        }
      });
    }

    /**
     * Find the runs of identical rows that can be folded away. A row stays
     * visible when it differs, sits within CONTEXT_ROWS of a difference, or is an
     * ancestor of one (so a difference never loses the path leading to it).
     */
    _planFolding() {
      const rows = this.flatPairs;
      const keep = new Uint8Array(rows.length);
      const ancestorsDone = new Uint8Array(rows.length);

      rows.forEach(({ pair, parentIdx }, index) => {
        if (pair.status === 'match') return;

        const from = Math.max(0, index - CONTEXT_ROWS);
        const to = Math.min(rows.length - 1, index + CONTEXT_ROWS);
        for (let i = from; i <= to; i++) keep[i] = 1;

        // Once an ancestor is done, so are all of its own ancestors
        for (let p = parentIdx; p >= 0 && !ancestorsDone[p]; p = rows[p].parentIdx) {
          ancestorsDone[p] = 1;
          keep[p] = 1;
        }
      });

      this.foldedRuns.clear();
      for (let start = 0; start < rows.length;) {
        if (keep[start]) {
          start++;
          continue;
        }
        let end = start;
        while (end < rows.length && !keep[end]) end++;
        if (end - start >= MIN_FOLDED_ROWS) this.foldedRuns.set(start, end);
        start = end;
      }
    }

    /** Identical rows are only folded when there is a difference to focus on */
    _isFolding() {
      return !this.showAll && this.divergenceIndices.length > 0;
    }

    _buildDOM() {
      const wrapper = document.createElement('div');
      wrapper.className = 'sf-diff-wrapper';

      const summary = this.diffResult.summary;
      const left = this._sideMeta(this.leftSide);
      const right = this._sideMeta(this.rightSide);

      wrapper.innerHTML = `
        <div class="sf-diff-header">
          <div class="sf-diff-meta sf-diff-meta-left">
            <span class="sf-diff-label">${escapeHtml(left.label)}</span>
            <span class="sf-diff-filename" title="${escapeHtml(left.filename)}">${escapeHtml(left.filename)}</span>
          </div>
          <div class="sf-diff-meta sf-diff-meta-right">
            <span class="sf-diff-label">${escapeHtml(right.label)}</span>
            <span class="sf-diff-filename" title="${escapeHtml(right.filename)}">${escapeHtml(right.filename)}</span>
          </div>
        </div>
        <div class="sf-diff-summary-bar">
          <span class="sf-diff-stat sf-diff-stat-total">${summary.totalDivergences} ${i18n.diffDivergences || 'divergences'}</span>
          ${this._onlyStat(this.leftSide, summary)}
          ${this._onlyStat(this.rightSide, summary)}
          ${summary.timingDiffs ? `<span class="sf-diff-stat sf-diff-stat-timing">${window.FoxLog.icon('zap', { size: 12 })} ${summary.timingDiffs}</span>` : ''}
          ${summary.errorDiffs ? `<span class="sf-diff-stat sf-diff-stat-error">${window.FoxLog.icon('alert-circle', { size: 12 })} ${summary.errorDiffs}</span>` : ''}
          ${this._isFoldable()
            ? `<button type="button" class="sf-diff-fold-toggle" aria-pressed="${this.showAll}">${i18n.diffShowAll || 'Show all lines'}</button>`
            : ''
          }
        </div>
        <div class="sf-diff-panes">
          <div class="sf-diff-pane sf-diff-pane-left">
            <div class="sf-diff-scroll-left" role="region" aria-label="${escapeHtml(left.label)}"></div>
          </div>
          <div class="sf-diff-gutter"></div>
          <div class="sf-diff-pane sf-diff-pane-right">
            <div class="sf-diff-scroll-right" role="region" aria-label="${escapeHtml(right.label)}"></div>
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

    /** Display texts of one side, with fallbacks when the caller gave none */
    _sideMeta(side) {
      const meta = side === 'a' ? this.metaA : this.metaB;
      const label = meta.label || side.toUpperCase();
      return {
        label,
        filename: meta.filename || label,
        onlyLabel: meta.onlyLabel || `Only in ${label}`
      };
    }

    /** Summary pill counting the rows that exist on one side only ('' when none) */
    _onlyStat(side, summary) {
      const count = side === 'a' ? summary.onlyInA : summary.onlyInB;
      if (!count) return '';

      const { onlyLabel } = this._sideMeta(side);
      const [tone, sign] = side === 'a' ? ['removed', '−'] : ['added', '+'];
      return `<span class="sf-diff-stat sf-diff-stat-${tone}" title="${escapeHtml(onlyLabel)}">${sign}${count} ${escapeHtml(onlyLabel)}</span>`;
    }

    /** True when at least one run of identical rows can be folded */
    _isFoldable() {
      return this.divergenceIndices.length > 0 && this.foldedRuns.size > 0;
    }

    _renderRows() {
      const paneLeft = this.scrollContainerLeft;
      const paneRight = this.scrollContainerRight;
      if (!paneLeft || !paneRight) return;

      const folding = this._isFolding();
      const fragmentLeft = document.createDocumentFragment();
      const fragmentRight = document.createDocumentFragment();

      for (let i = 0; i < this.flatPairs.length;) {
        const foldEnd = folding && !this.expandedRuns.has(i) ? this.foldedRuns.get(i) : undefined;

        if (foldEnd !== undefined) {
          fragmentLeft.appendChild(this._createFoldRow(i, foldEnd - i, true));
          fragmentRight.appendChild(this._createFoldRow(i, foldEnd - i, false));
          i = foldEnd;
          continue;
        }

        const { pair, depth } = this.flatPairs[i];
        fragmentLeft.appendChild(this._createRow(pair, this.leftSide, depth, i));
        fragmentRight.appendChild(this._createRow(pair, this.rightSide, depth, i));
        i++;
      }

      paneLeft.innerHTML = '';
      paneRight.innerHTML = '';
      paneLeft.appendChild(fragmentLeft);
      paneRight.appendChild(fragmentRight);
    }

    /**
     * Separator standing in for a run of identical rows. Both panes get one so
     * the rows stay aligned; only the left one is a focusable button.
     * @param {number} start - Index of the first folded row
     * @param {number} count - Number of folded rows
     * @param {boolean} interactive
     * @returns {HTMLElement}
     */
    _createFoldRow(start, count, interactive) {
      const label = (i18n.diffIdenticalLines || '{count} identical lines').replace('{count}', count);
      const showLabel = i18n.diffShowIdentical || 'Show';

      const fold = document.createElement(interactive ? 'button' : 'div');
      fold.className = 'sf-diff-fold';
      fold.dataset.foldStart = start;
      if (interactive) {
        fold.type = 'button';
        fold.setAttribute('aria-label', `${showLabel} ${label}`);
      } else {
        fold.setAttribute('aria-hidden', 'true');
      }

      fold.innerHTML = `
        <span class="sf-diff-fold-rule"></span>
        <span class="sf-diff-fold-label">
          ${window.FoxLog.icon('more-horizontal', { size: 14 })}
          <span>${escapeHtml(label)}</span>
          <span class="sf-diff-fold-action">${window.FoxLog.icon('chevrons-down', { size: 12 })} ${escapeHtml(showLabel)}</span>
        </span>
        <span class="sf-diff-fold-rule"></span>
      `;
      return fold;
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

      // Mark the top of an added/removed subtree only: its rows below share the tint
      let badge = '';
      if (pair.status === 'added' && !pair.nested) {
        const only = escapeHtml(this.metaB.onlyLabel || i18n.diffAdded || 'Added');
        badge = `<span class="sf-diff-badge sf-diff-badge-added" role="img" aria-label="${only}" title="${only}">+</span>`;
      } else if (pair.status === 'removed' && !pair.nested) {
        const only = escapeHtml(this.metaA.onlyLabel || i18n.diffRemoved || 'Removed');
        badge = `<span class="sf-diff-badge sf-diff-badge-removed" role="img" aria-label="${only}" title="${only}">−</span>`;
      } else if (pair.status === 'changed' && pair.changes.duration && side === 'b') {
        const delta = pair.changes.duration.delta;
        const sign = delta > 0 ? '+' : '';
        const pct = pair.changes.duration.a > 0
          ? Math.round((delta / pair.changes.duration.a) * 100)
          : 0;
        const range = `${this._formatDuration(pair.changes.duration.a) || '0ms'} → ${this._formatDuration(pair.changes.duration.b) || '0ms'}`;
        badge = `<span class="sf-diff-badge sf-diff-badge-timing" role="img" aria-label="Duration change: ${sign}${pct}%" title="${range}">${sign}${pct}%</span>`;
      }

      let errorIcon = '';
      if (pair.status === 'changed' && pair.changes.hasError) {
        if ((side === 'a' && pair.changes.hasError.a) || (side === 'b' && pair.changes.hasError.b)) {
          errorIcon = ` <span class="sf-diff-error-icon" role="img" aria-label="Error">${window.FoxLog.icon('alert-circle', { className: 'foxlog-icon--danger' })}</span>`;
        }
      } else if (node.hasError) {
        errorIcon = ` <span class="sf-diff-error-icon" role="img" aria-label="Error">${window.FoxLog.icon('alert-circle', { className: 'foxlog-icon--danger' })}</span>`;
      }

      const iconClass = `sf-icon-${(node.type || '').toLowerCase().replace(/_/g, '-')}`;
      row.innerHTML = `
        <span class="sf-diff-node-icon ${iconClass}">${icon}</span>
        <span class="sf-diff-node-name" title="${name}">${name}</span>
        <span class="sf-diff-node-duration">${durationStr}</span>
        ${badge}${errorIcon}
      `;

      const ariaDesc = this._getAriaDescription(pair, side, node);
      row.setAttribute('aria-label', ariaDesc);

      return row;
    }

    _getNodeIcon(type) {
      const iconNames = {
        'METHOD_ENTRY': 'code',
        'SOQL_EXECUTE_BEGIN': 'database',
        'DML_BEGIN': 'database',
        'EXCEPTION_THROWN': 'alert-triangle',
        'USER_DEBUG': 'bug',
        'CODE_UNIT_STARTED': 'package',
        'FLOW_START_INTERVIEW_BEGIN': 'shuffle',
        'VALIDATION_RULE': 'shield-check',
        'ROOT': 'git-branch'
      };
      return window.FoxLog.icon(iconNames[type] || 'info', { size: 14 });
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
      if (!this.scrollContainerLeft || !this.scrollContainerRight) return;

      const paneLeft = this.scrollContainerLeft.parentElement;
      const paneRight = this.scrollContainerRight.parentElement;

      const sync = (source, target) => {
        if (this._isSyncing) return;
        this._isSyncing = true;
        target.scrollTop = source.scrollTop;
        this._isSyncing = false;
      };

      paneLeft.addEventListener('scroll', () => sync(paneLeft, paneRight));
      paneRight.addEventListener('scroll', () => sync(paneRight, paneLeft));
    }

    _setupNavButtons() {
      const prevBtn = this.container.querySelector('.sf-diff-prev');
      const nextBtn = this.container.querySelector('.sf-diff-next');

      if (prevBtn) prevBtn.addEventListener('click', () => this.navigatePrev());
      if (nextBtn) nextBtn.addEventListener('click', () => this.navigateNext());
    }

    /** Wire the fold separators (either pane) and the "show all lines" toggle */
    _setupFolding() {
      if (!this.scrollContainerLeft || !this.scrollContainerRight) return;

      const onClick = (event) => {
        const fold = event.target.closest('.sf-diff-fold');
        if (fold) this._unfold(Number(fold.dataset.foldStart));
      };
      this.scrollContainerLeft.addEventListener('click', onClick);
      this.scrollContainerRight.addEventListener('click', onClick);

      const toggle = this.container.querySelector('.sf-diff-fold-toggle');
      if (toggle) toggle.addEventListener('click', () => this._toggleShowAll(toggle));
    }

    /** Reveal one folded run, keeping the rows above it where they are */
    _unfold(start) {
      const pane = this.scrollContainerLeft?.parentElement;
      if (!pane) return;

      const scrollTop = pane.scrollTop;
      this.expandedRuns.add(start);
      this._renderRows();
      pane.scrollTop = scrollTop;

      // The button that had focus is gone: hand focus to the first revealed row
      const firstRow = this.scrollContainerLeft.querySelector(`[data-index="${start}"]`);
      if (firstRow) {
        firstRow.tabIndex = -1;
        firstRow.focus({ preventScroll: true });
      }
    }

    _toggleShowAll(toggle) {
      this.showAll = !this.showAll;
      this.expandedRuns.clear(); // switching off returns to the default folded state
      toggle.setAttribute('aria-pressed', String(this.showAll));
      this._renderRows();

      const pane = this.scrollContainerLeft?.parentElement;
      const rowIndex = this.divergenceIndices[this.currentDivergenceIdx];
      if (rowIndex != null) {
        this._scrollToRow(rowIndex);
      } else if (pane) {
        pane.scrollTop = 0;
      }
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
      this._scrollToRow(rowIndex);
    }

    /** Center a row in the left pane (the right one follows via the scroll sync) */
    _scrollToRow(rowIndex) {
      const pane = this.scrollContainerLeft?.parentElement;
      const row = this.scrollContainerLeft?.querySelector(`[data-index="${rowIndex}"]`);
      if (!pane || !row) return;

      // Rows can be folded away above this one, so measure instead of computing
      const offset = row.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop;
      pane.scrollTop = Math.max(0, offset - pane.clientHeight / 2);
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
