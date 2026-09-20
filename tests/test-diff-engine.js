// Unit tests for the log diff engine and its Web Worker copy.
// Run from the repository root: node tests/test-diff-engine.js
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

// The engine is a browser IIFE that registers itself on window.FoxLog
function loadEngine() {
  const sandbox = { window: { FoxLog: { logger: { log() {} } } } };
  vm.runInNewContext(read('src/services/log-diff-engine.js'), sandbox);
  return sandbox.window.FoxLog.logDiffEngine;
}

// The worker is a copy of the engine driven through self.onmessage/postMessage
function loadWorker() {
  const posted = [];
  const self = { postMessage: (message) => posted.push(message) };
  vm.runInNewContext(read('src/workers/log-diff-worker.js'), { self, console, performance });

  return {
    diff(treeA, treeB, options) {
      self.onmessage({ data: { type: 'diff', treeA, treeB, options, requestId: 'test' } });
      const message = posted.pop();
      assert.equal(message.type, 'result', message.error);
      return message.result;
    }
  };
}

const node = (type, name, children = [], extra = {}) => ({
  id: `${type}:${name}`,
  type,
  name,
  depth: 0,
  duration: 1,
  exclusiveDuration: 1,
  hasError: false,
  soqlCount: 0,
  dmlCount: 0,
  children,
  ...extra
});
const method = (name, children, extra) => node('METHOD_ENTRY', name, children, extra);
const tree = (...children) => ({ root: node('ROOT', 'Transaction', children) });

// Results come from another vm context (other Array prototype): compare them as plain JSON
const plain = (value) => JSON.parse(JSON.stringify(value));

const vmEngine = loadEngine();
const vmWorker = loadWorker();
const engine = { diff: (treeA, treeB, options) => plain(vmEngine.diff(treeA, treeB, options)) };
const worker = { diff: (treeA, treeB, options) => plain(vmWorker.diff(treeA, treeB, options)) };

let failures = 0;
function test(name, run) {
  try {
    run();
    console.log(`  ok   ${name}`);
  } catch (error) {
    failures++;
    console.error(`  FAIL ${name}\n${error.stack}`);
  }
}

const implementations = { engine, worker };

for (const [label, impl] of Object.entries(implementations)) {
  console.log(`\n${label}`);

  test('identical trees have no divergence', () => {
    const { summary, pairs } = impl.diff(tree(method('A.one'), method('A.two')), tree(method('A.one'), method('A.two')));
    assert.equal(summary.totalDivergences, 0);
    assert.deepEqual(pairs.children.map((pair) => pair.status), ['match', 'match']);
  });

  test('a node only in A is "removed", a node only in B is "added"', () => {
    const { summary, pairs } = impl.diff(
      tree(method('Common'), method('OnlyInA')),
      tree(method('Common'), method('OnlyInB'))
    );
    const [common, removed, added] = pairs.children;

    assert.equal(common.status, 'match');
    assert.equal(removed.status, 'removed');
    assert.equal(removed.nodeA.name, 'OnlyInA');
    assert.equal(removed.nodeB, null);
    assert.equal(added.status, 'added');
    assert.equal(added.nodeA, null);
    assert.equal(added.nodeB.name, 'OnlyInB');
    assert.equal(summary.onlyInA, 1);
    assert.equal(summary.onlyInB, 1);
  });

  test('an added/removed node keeps its whole subtree, flagged nested', () => {
    const { pairs } = impl.diff(
      tree(method('Common'), method('Gone', [method('Gone.child')])),
      tree(method('Common'), method('New', [method('New.child', [method('New.leaf')])]))
    );
    const [, removed, added] = pairs.children;

    assert.equal(removed.nested, false);
    assert.equal(removed.children.length, 1);
    assert.equal(removed.children[0].nodeA.name, 'Gone.child');
    assert.equal(removed.children[0].nodeB, null);
    assert.equal(removed.children[0].status, 'removed');
    assert.equal(removed.children[0].nested, true);

    const leaf = added.children[0].children[0];
    assert.equal(added.nested, false);
    assert.equal(leaf.nodeB.name, 'New.leaf');
    assert.equal(leaf.nodeA, null);
    assert.equal(leaf.status, 'added');
    assert.equal(leaf.nested, true);
  });

  test('a one-sided subtree counts as a single divergence', () => {
    const { summary } = impl.diff(
      tree(method('Common')),
      tree(method('Common'), method('New', [method('New.child', [method('New.leaf')])]))
    );
    assert.equal(summary.totalDivergences, 1);
    assert.equal(summary.onlyInB, 1);
    assert.equal(summary.onlyInA, 0);
  });

  test('system nodes are dropped from a one-sided subtree unless ignoreSystem is off', () => {
    const buildB = () => tree(method('New', [node('STATEMENT_EXECUTE', 'noise'), method('New.real')]));

    const filtered = impl.diff(tree(), buildB()).pairs.children[0];
    assert.deepEqual(filtered.children.map((pair) => pair.nodeB.name), ['New.real']);

    const unfiltered = impl.diff(tree(), buildB(), { ignoreSystem: false }).pairs.children[0];
    assert.deepEqual(unfiltered.children.map((pair) => pair.nodeB.name), ['noise', 'New.real']);
  });

  test('a matched node with an error on one side only is "changed" and counted', () => {
    const { summary, pairs } = impl.diff(
      tree(method('Run', [], { hasError: false })),
      tree(method('Run', [], { hasError: true }))
    );
    assert.equal(pairs.children[0].status, 'changed');
    assert.equal(summary.totalDivergences, 1);
    assert.equal(summary.errorDiffs, 1);
  });

  test('a missing root gives an empty result', () => {
    const { summary, pairs } = impl.diff({}, tree());
    assert.equal(summary.totalDivergences, 0);
    assert.deepEqual(pairs.children, []);
  });
}

console.log('\nparity');
test('the worker copy produces exactly what the engine produces', () => {
  const treeA = tree(
    method('Common', [method('Common.child', [], { duration: 900 })], { duration: 900 }),
    method('Gone', [method('Gone.child')]),
    node('SOQL_EXECUTE_BEGIN', 'SELECT Id FROM Account', [], { soqlCount: 1 })
  );
  const treeB = tree(
    method('Common', [method('Common.child', [], { duration: 5 })], { duration: 5, hasError: true }),
    method('New', [method('New.child', [method('New.leaf')]), node('STATEMENT_EXECUTE', 'noise')])
  );

  assert.deepEqual(worker.diff(treeA, treeB), engine.diff(treeA, treeB));
});

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log('\nAll diff engine tests passed');
