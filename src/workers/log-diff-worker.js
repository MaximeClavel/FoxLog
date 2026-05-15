// src/workers/log-diff-worker.js
// Web Worker that computes diff between two CallTrees off the main thread

'use strict';

const DEBUG_MODE = false;

const logger = {
  _isEnabled() { return DEBUG_MODE; },
  log: (msg) => { if (logger._isEnabled()) console.log(`[FoxLog DiffWorker] ${msg}`); },
  error: (msg, err) => { console.error(`[FoxLog DiffWorker] ❌ ${msg}`, err || ''); }
};

// ============================================
// DIFF ENGINE (duplicated for Worker isolation)
// ============================================

class LogDiffEngine {
  diff(treeA, treeB, options = {}) {
    const config = {
      thresholdMs: options.thresholdMs ?? 50,
      thresholdPercent: options.thresholdPercent ?? 200,
      ignoreSystem: options.ignoreSystem ?? true
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

  _alignChildren(childrenA, childrenB, config) {
    const sigsA = childrenA.map(n => this._getSignature(n));
    const sigsB = childrenB.map(n => this._getSignature(n));
    const lcs = this._computeLCS(sigsA, sigsB);

    const pairs = [];
    let idxA = 0;
    let idxB = 0;

    for (const match of lcs) {
      while (idxA < match.idxA) { pairs.push(this._makeRemovedPair(childrenA[idxA])); idxA++; }
      while (idxB < match.idxB) { pairs.push(this._makeAddedPair(childrenB[idxB])); idxB++; }
      pairs.push(this._diffNode(childrenA[idxA], childrenB[idxB], config));
      idxA++;
      idxB++;
    }

    while (idxA < childrenA.length) { pairs.push(this._makeRemovedPair(childrenA[idxA])); idxA++; }
    while (idxB < childrenB.length) { pairs.push(this._makeAddedPair(childrenB[idxB])); idxB++; }

    return pairs;
  }

  _computeLCS(seqA, seqB) {
    const m = seqA.length;
    const n = seqB.length;
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

    const result = [];
    let i = m;
    let j = n;
    while (i > 0 && j > 0) {
      if (seqA[i - 1] === seqB[j - 1]) {
        result.push({ idxA: i - 1, idxB: j - 1 });
        i--; j--;
      } else if (dp[i - 1][j] > dp[i][j - 1]) {
        i--;
      } else {
        j--;
      }
    }
    result.reverse();
    return result;
  }

  _getSignature(node) {
    return `${node.type || 'UNKNOWN'}:${node.name || ''}`;
  }

  _detectChanges(nodeA, nodeB, config) {
    const changes = { duration: null, hasError: null, soqlCount: null, dmlCount: null };

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
    return { nodeA: this._slimNode(node), nodeB: null, status: 'removed', changes: { duration: null, hasError: null, soqlCount: null, dmlCount: null }, children: [] };
  }

  _makeAddedPair(node) {
    return { nodeA: null, nodeB: this._slimNode(node), status: 'added', changes: { duration: null, hasError: null, soqlCount: null, dmlCount: null }, children: [] };
  }

  _slimNode(node) {
    if (!node) return null;
    return {
      id: node.id, type: node.type, name: node.name, depth: node.depth,
      duration: node.duration ?? 0, exclusiveDuration: node.exclusiveDuration ?? 0,
      hasError: !!node.hasError, soqlCount: node.soqlCount ?? 0, dmlCount: node.dmlCount ?? 0,
      startTime: node.startTime
    };
  }

  _buildSummary(pair) {
    const summary = { totalDivergences: 0, onlyInA: 0, onlyInB: 0, timingDiffs: 0, errorDiffs: 0 };
    this._countDivergences(pair, summary);
    return summary;
  }

  _countDivergences(pair, summary) {
    if (pair.status === 'removed') { summary.totalDivergences++; summary.onlyInA++; }
    else if (pair.status === 'added') { summary.totalDivergences++; summary.onlyInB++; }
    else if (pair.status === 'changed') {
      summary.totalDivergences++;
      if (pair.changes.duration) summary.timingDiffs++;
      if (pair.changes.hasError) summary.errorDiffs++;
    }
    if (pair.children) {
      for (const child of pair.children) { this._countDivergences(child, summary); }
    }
  }

  _emptyResult() {
    return {
      summary: { totalDivergences: 0, onlyInA: 0, onlyInB: 0, timingDiffs: 0, errorDiffs: 0 },
      pairs: { nodeA: null, nodeB: null, status: 'match', changes: {}, children: [] }
    };
  }
}

// ============================================
// MESSAGE HANDLER
// ============================================

const engine = new LogDiffEngine();

self.onmessage = function(event) {
  const { type, treeA, treeB, options, requestId } = event.data;

  if (type === 'diff') {
    try {
      logger.log('Starting diff computation...');
      const startTime = performance.now();

      const result = engine.diff(treeA, treeB, options);

      const duration = performance.now() - startTime;
      logger.log(`Diff computed in ${duration.toFixed(2)}ms`);

      self.postMessage({ type: 'result', result, duration, requestId });
    } catch (error) {
      logger.error('Diff computation failed', error);
      self.postMessage({ type: 'error', error: error.message, requestId });
    }
  }
};
