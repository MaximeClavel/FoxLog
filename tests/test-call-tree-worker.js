// Unit tests for the call tree worker: VARIABLE_ASSIGNMENT nodes.
// Run from the repository root: node tests/test-call-tree-worker.js
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The worker talks through self.addEventListener('message') / self.postMessage
function loadWorker() {
  const listeners = [];
  const posted = [];
  const self = {
    addEventListener: (type, listener) => listeners.push(listener),
    postMessage: (message) => posted.push(message)
  };
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'src/workers/call-tree-worker.js'), 'utf8');
  vm.runInNewContext(source, { self, console, performance });

  return function buildTree(parsedLog) {
    listeners.forEach((listener) => listener({ data: { action: 'buildTree', payload: { parsedLog }, id: 'test' } }));
    const message = posted.pop();
    assert.equal(message.success, true, message.error && message.error.stack);
    return JSON.parse(JSON.stringify(message.result)); // out of the vm realm
  };
}

const buildTree = loadWorker();

// Payloads are copied from a real FINEST log (what LogParser leaves in `content`)
function assignmentNodes(...contents) {
  const lines = contents.map((content, index) => ({
    type: 'VARIABLE_ASSIGNMENT',
    content,
    index,
    timestamp: '23:25:29.0',
    timestampMs: 0,
    duration: 0,
    details: {}
  }));
  const tree = buildTree({ metadata: { id: 'log', operation: 'Test', status: 'Success', duration: 0 }, stats: { errors: [] }, lines });
  return tree.root.children;
}

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

console.log('VARIABLE_ASSIGNMENT');

test('a reference type shows its value, not the trailing identity hash', () => {
  const [node] = assignmentNodes('[150]|s|{}|0x5e7d71a3');
  assert.equal(node.name, 's = {}');
  assert.deepEqual(node.details, { variable: 's', value: '{}' });
});

test('a string value keeps its quotes and loses the hash', () => {
  const [node] = assignmentNodes('[152]|this.name|"Société Générale CIB"|0x5e7d71a3');
  assert.equal(node.name, 'this.name = "Société Générale CIB"');
});

test('a primitive has no hash and keeps its value', () => {
  const nodes = assignmentNodes('[84]|totalDeals|0', '[93]|totalPipeline|4200000.00');
  assert.deepEqual(nodes.map((node) => node.name), ['totalDeals = 0', 'totalPipeline = 4200000.00']);
});

test('null with an empty trailing field shows null', () => {
  const [node] = assignmentNodes('[92]|opp|null|');
  assert.equal(node.name, 'opp = null');
  assert.equal(node.details.value, 'null');
});

test('a list with a hash shows the list', () => {
  const nodes = assignmentNodes('[77]|lines|[]|0x190dde1b', '[12]|accounts|"List of size 12 too large to display"|0x703330c9');
  assert.deepEqual(nodes.map((node) => node.name), ['lines = []', 'accounts = "List of size 12 too large to display"']);
});

test('a value containing "|" is kept whole', () => {
  const [node] = assignmentNodes('[10]|label|"a|b|c"|0x1f');
  assert.equal(node.details.value, '"a|b|c"');
  assert.equal(node.name, 'label = "a|b|c"');
});

test('a long value is truncated in the name but complete in the details', () => {
  const json = '{"Owner":{"Name":"Fox Sec","Id":"005KY000002bXczYAE"},"BillingCity":"Toulouse"}';
  const [node] = assignmentNodes(`[88]|acc|${json}|0x6c1f2a3b`);
  assert.equal(node.name, `acc = ${json.slice(0, 50)}...`);
  assert.equal(node.details.value, json);
});

test('the line prefix is optional', () => {
  const [node] = assignmentNodes('count|5');
  assert.equal(node.name, 'count = 5');
});

test('a payload without a value falls back to the raw content', () => {
  const [node] = assignmentNodes('[12]|orphan');
  assert.equal(node.name, '[12]|orphan');
  assert.deepEqual(node.details, { assignment: '[12]|orphan' });
});

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log('\nAll call tree worker tests passed');
