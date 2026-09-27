// Unit tests for the log hierarchy service (chains of logs by request id).
// Run from the repository root: node tests/test-log-hierarchy.js
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

function loadService() {
  const sandbox = { window: { FoxLog: { logger: { log() {} } } } };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'src/services/log-hierarchy-service.js'), 'utf8'), sandbox);
  return sandbox.window.FoxLog.logHierarchy;
}

const service = loadService();
const T0 = Date.parse('2026-09-25T10:00:00.000Z');

const log = (id, request, seconds, extra = {}) => ({
  Id: id,
  RequestIdentifier: request,
  StartTime: new Date(T0 + seconds * 1000).toISOString(),
  DurationMilliseconds: 500,
  Operation: 'ApexExecution',
  ...extra
});

// The service runs in a vm context: copy its arrays into this realm so deepEqual compares them
const plain = (list, map) => Array.from(list, map);
const ids = (tree) => plain(tree.rows, (row) => `${row.depth}:${row.log.Id}`);

const tests = {
  'extracts the markers from debug lines'() {
    const body = [
      '10:00:00.1 (100)|USER_DEBUG|[7]|INFO|FOXLOG_REQUEST_ID=4b4a1cf4c0ffee00aa11bb',
      '10:00:00.1 (200)|USER_DEBUG|[8]|INFO|FOXLOG_PARENT_REQUEST_ID=TID:2450079200000c0ac1|step=2'
    ].join('\n');
    assert.deepEqual({ ...service.extractLinks(body) }, {
      selfRequestId: '4b4a1cf4c0ffee00aa11bb',
      parentRequestId: 'TID:2450079200000c0ac1'
    });
  },

  'the own-id marker is not mistaken for the parent marker'() {
    const links = service.extractLinks('|INFO|FOXLOG_REQUEST_ID=abcdef123456');
    assert.equal(links.parentRequestId, null);
    assert.equal(links.selfRequestId, 'abcdef123456');
  },

  'returns nothing for a log without markers'() {
    assert.deepEqual({ ...service.extractLinks('EXECUTION_STARTED\nEXECUTION_FINISHED') }, {
      parentRequestId: null,
      selfRequestId: null
    });
  },

  'a trailing sentence dot is not part of the id'() {
    assert.equal(service.extractLinks('FOXLOG_PARENT_REQUEST_ID=abcdef123456.').parentRequestId, 'abcdef123456');
  },

  'groups the logs of one request'() {
    const hierarchy = service.build([log('c', 'R1', 3), log('a', 'R1', 1), log('x', 'R2', 2)]);
    const tree = hierarchy.getTree('a');
    assert.deepEqual(ids(tree), ['0:a', '0:c']);
    assert.equal(tree.logCount, 2);
    assert.equal(hierarchy.getTree('c'), tree);
    assert.equal(hierarchy.getTree('x'), null, 'a lone log has no hierarchy');
  },

  'nests a request under the parent named by its marker'() {
    const analysis = new Map([
      ['b', { parentRequestId: 'R0' }],
      ['c', { parentRequestId: 'R1' }],
      ['d', { parentRequestId: 'R1' }]
    ]);
    const hierarchy = service.build([
      log('d', 'R3', 4), log('c', 'R2', 3), log('b', 'R1', 2), log('a', 'R0', 1)
    ], analysis);

    const tree = hierarchy.getTree('d');
    assert.deepEqual(ids(tree), ['0:a', '1:b', '2:c', '2:d']);
    assert.equal(hierarchy.trees.length, 1);
    assert.equal(tree.missingParentRequestId, null);
  },

  'keeps several logs of one request together under their parent'() {
    const analysis = new Map([['b1', { parentRequestId: 'R0' }]]);
    const hierarchy = service.build([
      log('a', 'R0', 1), log('b2', 'R1', 4), log('b1', 'R1', 2), log('b3', 'R1', 6)
    ], analysis);
    assert.deepEqual(ids(hierarchy.getTree('a')), ['0:a', '1:b1', '1:b2', '1:b3']);
  },

  'resolves a parent through the request id the log wrote about itself'() {
    const analysis = new Map([
      ['a', { selfRequestId: 'SELF-A-0001' }],
      ['b', { parentRequestId: 'SELF-A-0001' }]
    ]);
    const hierarchy = service.build([log('a', 'R0', 1), log('b', 'R1', 2)], analysis);
    assert.deepEqual(ids(hierarchy.getTree('b')), ['0:a', '1:b']);
  },

  'flags a log whose parent request is not in the list'() {
    const analysis = new Map([['b', { parentRequestId: 'GONE-REQUEST' }]]);
    const hierarchy = service.build([log('b', 'R1', 2), log('z', 'R9', 5)], analysis);
    const tree = hierarchy.getTree('b');
    assert.equal(tree.missingParentRequestId, 'GONE-REQUEST');
    assert.equal(tree.logCount, 1);
    assert.equal(hierarchy.getTree('z'), null);
  },

  'never loops when two requests name each other'() {
    const analysis = new Map([
      ['a', { parentRequestId: 'R1' }],
      ['b', { parentRequestId: 'R0' }]
    ]);
    const hierarchy = service.build([log('a', 'R0', 1), log('b', 'R1', 2)], analysis);
    assert.equal(hierarchy.trees.length, 1);
    assert.equal(hierarchy.getTree('a').logCount, 2);
  },

  'ignores a marker that points at its own request'() {
    const analysis = new Map([['a', { parentRequestId: 'R0' }]]);
    const hierarchy = service.build([log('a', 'R0', 1)], analysis);
    assert.equal(hierarchy.getTree('a'), null);
  },

  'logs without a request id stay on their own'() {
    const hierarchy = service.build([log('a', null, 1), log('b', undefined, 2)]);
    assert.equal(hierarchy.trees.length, 2);
    assert.equal(hierarchy.getTree('a'), null);
  },

  'sums the errors and measures the span of a chain'() {
    const analysis = new Map([
      ['b', { parentRequestId: 'R0', errorCount: 2 }],
      ['c', { parentRequestId: 'R1', errorCount: 1 }]
    ]);
    const hierarchy = service.build([
      log('a', 'R0', 0), log('b', 'R1', 10), log('c', 'R2', 20, { DurationMilliseconds: 1500 })
    ], analysis);
    const tree = hierarchy.getTree('a');
    assert.equal(tree.errorCount, 3);
    assert.equal(tree.spanMs, 21500);
  },

  'combines the analysis of every log of a chain'() {
    const stats = (over = {}) => ({
      errors: [],
      limits: { soqlQueries: 0, maxSoqlQueries: 100, dmlStatements: 0, maxDmlStatements: 150, cpuTime: 0, maxCpuTime: 10000, heapSize: 0, maxHeapSize: 6000000, callouts: 0, ...over.limits },
      ...(over.errors ? { errors: over.errors } : {})
    });
    const results = (critical, warnings, score, patterns = []) => ({ summary: { critical, warnings, score }, patterns });

    const combined = service.summarize([
      { log: { Status: 'Success' }, stats: stats({ limits: { soqlQueries: 10, dmlStatements: 4, cpuTime: 2000, callouts: 1 } }), results: results(0, 1, 92, [{ severity: 'warning', title: 'Slow query' }]) },
      { log: { Status: 'Insert failed. First exception' }, stats: stats({ errors: [{}, {}], limits: { soqlQueries: 24, dmlStatements: 12, cpuTime: 8500 } }), results: results(2, 0, 40, [{ severity: 'critical', title: 'SOQL in loop' }, { severity: 'warning', title: 'Slow query' }]) },
      { log: { Status: 'Success' }, stats: stats(), results: results(0, 0, 100) }
    ], { spanMs: 3490 });

    assert.equal(combined.logCount, 3);
    assert.equal(combined.errorCount, 2);
    assert.equal(combined.failedLogs, 1);
    assert.equal(combined.affectedLogs, 2, 'the log with a warning and the failing one');
    assert.equal(combined.unreadableLogs, 0);
    assert.equal(combined.criticalCount, 2);
    assert.equal(combined.warningCount, 1);
    assert.equal(combined.score, 40, 'the lowest score of the chain');
    assert.deepEqual(plain(combined.worstTitles), ['SOQL in loop', 'Slow query']);
    assert.deepEqual({ ...combined.totals }, { soql: 34, dml: 16, callouts: 1 });
    assert.equal(combined.peak.cpu, 85, 'the hottest single log, not the sum');
    assert.equal(combined.spanMs, 3490);
    assert.equal(combined.hasResults, true);
  },

  'a warning-only chain counts the log that carries the warning'() {
    const stats = { errors: [], limits: { soqlQueries: 0, maxSoqlQueries: 100, dmlStatements: 0, maxDmlStatements: 150, cpuTime: 0, maxCpuTime: 10000, heapSize: 0, maxHeapSize: 6000000, callouts: 0 } };
    const clean = { summary: { critical: 0, warnings: 0, score: 100 }, patterns: [] };
    const warned = { summary: { critical: 0, warnings: 1, score: 90 }, patterns: [{ severity: 'warning', title: 'Slow query' }] };
    const combined = service.summarize([
      { log: { Status: 'Success' }, stats, results: clean },
      { log: { Status: 'Success' }, stats, results: warned }
    ], { unreadableLogs: 1 });
    assert.equal(combined.affectedLogs, 1);
    assert.equal(combined.unreadableLogs, 1);
  },

  'a chain analysed without anti-pattern results has no score'() {
    const combined = service.summarize([{
      log: { Status: 'Success' },
      stats: { errors: [], limits: { soqlQueries: 0, maxSoqlQueries: 0, dmlStatements: 0, maxDmlStatements: 0, cpuTime: 0, maxCpuTime: 0, heapSize: 0, maxHeapSize: 0, callouts: 0 } },
      results: null
    }]);
    assert.equal(combined.hasResults, false);
    assert.equal(combined.score, null);
    assert.equal(combined.peak.cpu, 0);
  },

  'lists the chains newest first'() {
    const hierarchy = service.build([log('a', 'R0', 1), log('b', 'R0', 2), log('c', 'R5', 50), log('d', 'R5', 60)]);
    assert.deepEqual(plain(hierarchy.trees, (tree) => tree.id), ['R5', 'R0']);
  }
};

let failed = 0;
for (const [name, run] of Object.entries(tests)) {
  try {
    run();
    console.log(`  ok   ${name}`);
  } catch (error) {
    failed++;
    console.log(`  FAIL ${name}\n       ${error.message}`);
  }
}
console.log(`\n${Object.keys(tests).length - failed}/${Object.keys(tests).length} passed`);
process.exit(failed ? 1 : 0);
