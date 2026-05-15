// src/services/log-diff-engine.js
// Diff engine to compare two CallTree structures and detect divergences

(function() {
  'use strict';

  window.FoxLog = window.FoxLog || {};
  const logger = window.FoxLog.logger || console;

  class LogDiffEngine {
    /**
     * Compare two CallTrees and return a structured diff result
     * @param {Object} treeA - CallTree (left / reference)
     * @param {Object} treeB - CallTree (right / comparison)
     * @param {Object} [options] - Diff configuration
     * @param {number} [options.thresholdMs=50] - Minimum absolute duration delta to flag
     * @param {number} [options.thresholdPercent=200] - Minimum relative delta (%) to flag
     * @param {boolean} [options.ignoreSystem=true] - Skip system-level nodes
     * @returns {Object} DiffResult with summary and pairs tree
     */
    diff(treeA, treeB, options = {}) {
      const config = {
        thresholdMs: options.thresholdMs ?? window.FoxLog.CONFIG?.DIFF_THRESHOLD_MS ?? 50,
        thresholdPercent: options.thresholdPercent ?? window.FoxLog.CONFIG?.DIFF_THRESHOLD_PERCENT ?? 200,
        ignoreSystem: options.ignoreSystem ?? window.FoxLog.CONFIG?.DIFF_IGNORE_SYSTEM ?? true
      };

      const rootA = treeA?.root;
      const rootB = treeB?.root;

      if (!rootA || !rootB) {
        return this._emptyResult();
      }

      const rootPair = this._diffNode(rootA, rootB, config);

      const summary = this._buildSummary(rootPair);

      return { summary, pairs: rootPair };
    }

    /**
     * @param {Object} nodeA
     * @param {Object} nodeB
     * @param {Object} config
     * @returns {Object} DiffPair
     */
    _diffNode(nodeA, nodeB, config) {
      const changes = this._detectChanges(nodeA, nodeB, config);
      const hasChanges = changes.duration || changes.hasError || changes.soqlCount || changes.dmlCount;
      const status = hasChanges ? 'changed' : 'match';

      const childrenA = this._filterChildren(nodeA.children || [], config);
      const childrenB = this._filterChildren(nodeB.children || [], config);

      const childPairs = this._alignChildren(childrenA, childrenB, config);

      return {
        nodeA: this._slimNode(nodeA),
        nodeB: this._slimNode(nodeB),
        status,
        changes,
        children: childPairs
      };
    }

    /**
     * Align children of two nodes using LCS on signatures
     * @param {Array} childrenA
     * @param {Array} childrenB
     * @param {Object} config
     * @returns {Array<Object>} Array of DiffPair
     */
    _alignChildren(childrenA, childrenB, config) {
      const sigsA = childrenA.map(n => this._getSignature(n));
      const sigsB = childrenB.map(n => this._getSignature(n));

      const lcs = this._computeLCS(sigsA, sigsB);

      const pairs = [];
      let idxA = 0;
      let idxB = 0;

      for (const match of lcs) {
        while (idxA < match.idxA) {
          pairs.push(this._makeRemovedPair(childrenA[idxA]));
          idxA++;
        }
        while (idxB < match.idxB) {
          pairs.push(this._makeAddedPair(childrenB[idxB]));
          idxB++;
        }
        pairs.push(this._diffNode(childrenA[idxA], childrenB[idxB], config));
        idxA++;
        idxB++;
      }

      while (idxA < childrenA.length) {
        pairs.push(this._makeRemovedPair(childrenA[idxA]));
        idxA++;
      }
      while (idxB < childrenB.length) {
        pairs.push(this._makeAddedPair(childrenB[idxB]));
        idxB++;
      }

      return pairs;
    }

    /**
     * LCS returning index pairs for matched elements
     * @param {string[]} seqA
     * @param {string[]} seqB
     * @returns {Array<{idxA: number, idxB: number}>}
     */
    _computeLCS(seqA, seqB) {
      const m = seqA.length;
      const n = seqB.length;

      // DP table
      const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

      for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
          if (seqA[i - 1] === seqB[j - 1]) {
            dp[i][j] = dp[i - 1][j - 1] + 1;
          } else {
            dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
          }
        }
      }

      // Backtrack to find matched indices
      const result = [];
      let i = m;
      let j = n;
      while (i > 0 && j > 0) {
        if (seqA[i - 1] === seqB[j - 1]) {
          result.push({ idxA: i - 1, idxB: j - 1 });
          i--;
          j--;
        } else if (dp[i - 1][j] > dp[i][j - 1]) {
          i--;
        } else {
          j--;
        }
      }

      result.reverse();
      return result;
    }

    /**
     * Build a signature for a node: "TYPE:name"
     * @param {Object} node
     * @returns {string}
     */
    _getSignature(node) {
      return `${node.type || 'UNKNOWN'}:${node.name || ''}`;
    }

    /**
     * Detect meaningful changes between two matched nodes
     * @param {Object} nodeA
     * @param {Object} nodeB
     * @param {Object} config
     * @returns {Object}
     */
    _detectChanges(nodeA, nodeB, config) {
      const changes = {
        duration: null,
        hasError: null,
        soqlCount: null,
        dmlCount: null
      };

      const durA = nodeA.duration ?? 0;
      const durB = nodeB.duration ?? 0;
      const delta = durB - durA;
      const refDuration = Math.max(durA, 1);
      const percentDelta = Math.abs(delta / refDuration) * 100;

      if (Math.abs(delta) >= config.thresholdMs && percentDelta >= config.thresholdPercent) {
        changes.duration = { a: durA, b: durB, delta };
      }

      if (nodeA.hasError !== nodeB.hasError) {
        changes.hasError = { a: !!nodeA.hasError, b: !!nodeB.hasError };
      }

      if ((nodeA.soqlCount ?? 0) !== (nodeB.soqlCount ?? 0)) {
        changes.soqlCount = { a: nodeA.soqlCount ?? 0, b: nodeB.soqlCount ?? 0 };
      }

      if ((nodeA.dmlCount ?? 0) !== (nodeB.dmlCount ?? 0)) {
        changes.dmlCount = { a: nodeA.dmlCount ?? 0, b: nodeB.dmlCount ?? 0 };
      }

      return changes;
    }

    /**
     * Filter out system nodes if configured
     * @param {Array} children
     * @param {Object} config
     * @returns {Array}
     */
    _filterChildren(children, config) {
      if (!config.ignoreSystem) return children;

      const systemTypes = new Set([
        'SYSTEM_METHOD_ENTRY', 'SYSTEM_METHOD_EXIT',
        'SYSTEM_CONSTRUCTOR_ENTRY', 'SYSTEM_CONSTRUCTOR_EXIT',
        'VARIABLE_SCOPE_BEGIN', 'VARIABLE_ASSIGNMENT',
        'STATEMENT_EXECUTE', 'HEAP_ALLOCATE'
      ]);

      return children.filter(c => !systemTypes.has(c.type));
    }

    _makeRemovedPair(node) {
      return {
        nodeA: this._slimNode(node),
        nodeB: null,
        status: 'removed',
        changes: { duration: null, hasError: null, soqlCount: null, dmlCount: null },
        children: []
      };
    }

    _makeAddedPair(node) {
      return {
        nodeA: null,
        nodeB: this._slimNode(node),
        status: 'added',
        changes: { duration: null, hasError: null, soqlCount: null, dmlCount: null },
        children: []
      };
    }

    /**
     * Keep only essential fields to limit memory usage
     * @param {Object} node
     * @returns {Object}
     */
    _slimNode(node) {
      if (!node) return null;
      return {
        id: node.id,
        type: node.type,
        name: node.name,
        depth: node.depth,
        duration: node.duration ?? 0,
        exclusiveDuration: node.exclusiveDuration ?? 0,
        hasError: !!node.hasError,
        soqlCount: node.soqlCount ?? 0,
        dmlCount: node.dmlCount ?? 0,
        startTime: node.startTime
      };
    }

    /**
     * Recursively count divergences
     * @param {Object} pair - Root DiffPair
     * @returns {Object} Summary counts
     */
    _buildSummary(pair) {
      const summary = {
        totalDivergences: 0,
        onlyInA: 0,
        onlyInB: 0,
        timingDiffs: 0,
        errorDiffs: 0
      };

      this._countDivergences(pair, summary);
      return summary;
    }

    _countDivergences(pair, summary) {
      if (pair.status === 'removed') {
        summary.totalDivergences++;
        summary.onlyInA++;
      } else if (pair.status === 'added') {
        summary.totalDivergences++;
        summary.onlyInB++;
      } else if (pair.status === 'changed') {
        summary.totalDivergences++;
        if (pair.changes.duration) summary.timingDiffs++;
        if (pair.changes.hasError) summary.errorDiffs++;
      }

      if (pair.children) {
        for (const child of pair.children) {
          this._countDivergences(child, summary);
        }
      }
    }

    _emptyResult() {
      return {
        summary: { totalDivergences: 0, onlyInA: 0, onlyInB: 0, timingDiffs: 0, errorDiffs: 0 },
        pairs: { nodeA: null, nodeB: null, status: 'match', changes: {}, children: [] }
      };
    }
  }

  window.FoxLog.logDiffEngine = new LogDiffEngine();
  window.FoxLog.LogDiffEngine = LogDiffEngine;
  logger.log('[FoxLog] LogDiffEngine loaded');
})();
