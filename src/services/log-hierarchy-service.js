// src/services/log-hierarchy-service.js
(function() {
  'use strict';

  window.FoxLog = window.FoxLog || {};
  const logger = window.FoxLog.logger || console;

  // Salesforce gives every async job (Queueable, @future, Batch...) a brand-new request id, so
  // ApexLog.RequestIdentifier only groups the logs of ONE request. To chain an async job to the
  // request that started it, the Apex code writes these debug lines (see tests/flow-error-repro):
  //   System.debug('FOXLOG_REQUEST_ID=' + Request.getCurrent().getRequestId());
  //   System.debug('FOXLOG_PARENT_REQUEST_ID=' + parentRequestId);
  const ID_CHARS = '[A-Za-z0-9_:.-]{6,64}';
  const PARENT_MARKER = new RegExp(`FOXLOG_PARENT_REQUEST_ID=(${ID_CHARS})`);
  const SELF_MARKER = new RegExp(`FOXLOG_REQUEST_ID=(${ID_CHARS})`);

  const cleanId = (raw) => (raw ? raw.replace(/[.:]+$/, '') : null);
  const startOf = (log) => {
    const time = new Date(log.StartTime).getTime();
    return Number.isNaN(time) ? 0 : time;
  };

  /**
   * Chains of logs: the logs of one request are grouped, and a request that names a parent
   * request (through the marker above) hangs under it.
   */
  class LogHierarchy {
    /**
     * @param {Array} logs - ApexLog records (Id, RequestIdentifier, StartTime, ...)
     * @param {Map<string, {parentRequestId?: string, selfRequestId?: string, errorCount?: number}>} analysis
     */
    constructor(logs, analysis = new Map()) {
      this.analysis = analysis;
      this.treeByLogId = new Map();
      this.trees = this._build(logs);
    }

    /** @returns {Object|null} The chain this log belongs to (a lone log with no known parent has none) */
    getTree(logId) {
      const tree = this.treeByLogId.get(logId);
      return tree && (tree.logCount > 1 || tree.missingParentRequestId) ? tree : null;
    }

    _build(logs) {
      const nodes = new Map();
      logs.forEach((log) => {
        const key = log.RequestIdentifier || `log:${log.Id}`;
        if (!nodes.has(key)) nodes.set(key, { key, logs: [], children: [], parent: null, parentRequestId: null });
        nodes.get(key).logs.push(log);
      });

      const byRequestId = new Map();
      nodes.forEach((node) => {
        node.logs.sort((a, b) => startOf(a) - startOf(b));
        node.logs.forEach((log) => {
          if (log.RequestIdentifier) byRequestId.set(log.RequestIdentifier, node);
          const selfId = this.analysis.get(log.Id)?.selfRequestId;
          if (selfId && !byRequestId.has(selfId)) byRequestId.set(selfId, node);
        });
      });

      nodes.forEach((node) => {
        for (const log of node.logs) {
          const parentId = this.analysis.get(log.Id)?.parentRequestId;
          if (!parentId) continue;
          const parent = byRequestId.get(parentId);
          if (!parent) {
            node.parentRequestId = node.parentRequestId || parentId;
            continue;
          }
          if (parent === node || this._isAncestor(node, parent)) continue;
          node.parent = parent;
          parent.children.push(node);
          break;
        }
      });

      const earliest = (node) => startOf(node.logs[0]);
      nodes.forEach((node) => node.children.sort((a, b) => earliest(a) - earliest(b)));

      const trees = [];
      nodes.forEach((node) => {
        if (!node.parent) trees.push(this._buildTree(node));
      });
      return trees.sort((a, b) => b.newestStart - a.newestStart);
    }

    /** Whether `node` is `candidate` or one of its ancestors (making `candidate` its parent would close a loop) */
    _isAncestor(node, candidate) {
      for (let current = candidate; current; current = current.parent) {
        if (current === node) return true;
      }
      return false;
    }

    _buildTree(root) {
      const rows = [];
      const walk = (node, depth) => {
        node.logs.forEach((log) => rows.push({ log, depth, analysis: this.analysis.get(log.Id) || null }));
        node.children.forEach((child) => walk(child, depth + 1));
      };
      walk(root, 0);

      const logs = rows.map((row) => row.log);
      const starts = logs.map(startOf);
      const ends = logs.map((log) => startOf(log) + (log.DurationMilliseconds || 0));
      const startTime = Math.min(...starts);
      const errorCount = rows.reduce((sum, row) => sum + (row.analysis?.errorCount || 0), 0);

      const missingParentRequestId = root.parentRequestId;
      const tree = {
        id: root.key,
        rows,
        logs,
        logCount: logs.length,
        startTime,
        newestStart: Math.max(...starts),
        spanMs: Math.max(...ends) - startTime,
        errorCount,
        missingParentRequestId
      };
      logs.forEach((log) => this.treeByLogId.set(log.Id, tree));
      return tree;
    }
  }

  const service = {
    /** Read the correlation markers out of a log body */
    extractLinks(logContent) {
      return {
        parentRequestId: cleanId(PARENT_MARKER.exec(logContent)?.[1]),
        selfRequestId: cleanId(SELF_MARKER.exec(logContent)?.[1])
      };
    },

    build(logs, analysis) {
      return new LogHierarchy(logs, analysis);
    },

    /**
     * Combine the analysis of every log of a chain into one verdict
     * @param {Array<{log: Object, stats: Object, results: Object|null}>} entries - ApexLog record, parsed
     *   stats and anti-pattern results (null when the detector is unavailable) of each log
     * @param {{spanMs?: number, unreadableLogs?: number}} [options] - unreadableLogs: logs of the chain that could not be downloaded
     */
    summarize(entries, { spanMs = 0, unreadableLogs = 0 } = {}) {
      const pct = (used, max) => (max > 0 ? (used / max) * 100 : 0);
      const summary = {
        logCount: entries.length,
        affectedLogs: 0,
        errorCount: 0,
        failedLogs: 0,
        criticalCount: 0,
        warningCount: 0,
        hasResults: false,
        score: null,
        worstTitles: [],
        unreadableLogs,
        totals: { soql: 0, dml: 0, callouts: 0 },
        peak: { soql: 0, dml: 0, cpu: 0, heap: 0 },
        spanMs
      };

      const patterns = [];
      entries.forEach(({ log, stats, results }) => {
        const { limits } = stats;
        const status = String(log.Status || '');
        const failed = status !== '' && status !== 'Success' && status !== 'Unknown';
        const errors = stats.errors.length;

        summary.errorCount += errors;
        if (failed) summary.failedLogs++;
        summary.totals.soql += limits.soqlQueries;
        summary.totals.dml += limits.dmlStatements;
        summary.totals.callouts += limits.callouts;
        summary.peak.soql = Math.max(summary.peak.soql, pct(limits.soqlQueries, limits.maxSoqlQueries));
        summary.peak.dml = Math.max(summary.peak.dml, pct(limits.dmlStatements, limits.maxDmlStatements));
        summary.peak.cpu = Math.max(summary.peak.cpu, pct(limits.cpuTime, limits.maxCpuTime));
        summary.peak.heap = Math.max(summary.peak.heap, pct(limits.heapSize, limits.maxHeapSize));

        let affected = errors > 0 || failed;
        if (results) {
          summary.hasResults = true;
          summary.criticalCount += results.summary.critical;
          summary.warningCount += results.summary.warnings;
          if (Number.isFinite(results.summary.score)) {
            summary.score = summary.score === null ? results.summary.score : Math.min(summary.score, results.summary.score);
          }
          patterns.push(...results.patterns);
          affected = affected || results.summary.critical > 0 || results.summary.warnings > 0;
        }
        if (affected) summary.affectedLogs++;
      });

      const titles = ['critical', 'warning'].flatMap((severity) => (
        patterns.filter((pattern) => pattern.severity === severity).map((pattern) => pattern.title)
      ));
      summary.worstTitles = [...new Set(titles)].slice(0, 2);
      return summary;
    }
  };

  window.FoxLog.logHierarchy = service;
  logger.log('[FoxLog] Log Hierarchy Service loaded');
})();
