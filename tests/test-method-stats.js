// Unit tests for the parser's per-method stats (call count, cumulative time) and error line index.
// Run from the repository root: node tests/test-method-stats.js
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadParser() {
  const window = {};
  const context = {
    window,
    console,
    navigator: { language: 'en' },
    document: { addEventListener() {}, documentElement: {} },
    chrome: { runtime: { getManifest: () => ({ version: '0.0.0' }), getURL: (p) => p } }
  };
  vm.createContext(context);
  ['src/core/constants.js', 'src/parsers/log-parser.js'].forEach((file) => {
    vm.runInContext(fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8'), context, { filename: file });
  });
  return window.FoxLog.logParser;
}

const parser = loadParser();

// Nanosecond counters are in the parentheses; times are 1e6 ns = 1 ms apart
const ms = (n) => n * 1e6;
function log(...events) {
  const body = events
    .map(([type, ns, rest]) => `12:00:00.0 (${ms(ns)})|${type}${rest ? `|${rest}` : ''}`)
    .join('\n');
  return parser.parse(body, {});
}
const enter = (ns, name) => ['METHOD_ENTRY', ns, `[1]|01p000000000001|${name}`];
const exit = (ns, name) => ['METHOD_EXIT', ns, `[1]|01p000000000001|${name}`];

let failures = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (error) {
    failures++;
    console.log(`  FAIL ${name}\n${error.stack}`);
  }
}

const byName = (parsed) => Object.fromEntries(parsed.stats.methods.map((m) => [`${m.class}.${m.method}`, m]));

test('a method gets its call count and the time between entry and exit', () => {
  const parsed = log(enter(0, 'Svc.run()'), exit(40, 'Svc.run()'));
  const svc = byName(parsed)['Svc.run()'];
  assert.equal(svc.calls, 1);
  assert.equal(svc.totalMs, 40);
});

test('several calls add up', () => {
  const parsed = log(
    enter(0, 'Svc.run()'), exit(10, 'Svc.run()'),
    enter(20, 'Svc.run()'), exit(35, 'Svc.run()')
  );
  const svc = byName(parsed)['Svc.run()'];
  assert.equal(svc.calls, 2);
  assert.equal(svc.totalMs, 25);
});

test('a recursive method counts its time once, not once per level', () => {
  const parsed = log(
    enter(0, 'Svc.walk()'),
    enter(10, 'Svc.walk()'),
    exit(20, 'Svc.walk()'),
    exit(50, 'Svc.walk()')
  );
  const walk = byName(parsed)['Svc.walk()'];
  assert.equal(walk.calls, 2);
  assert.equal(walk.totalMs, 50);
  assert.equal(walk.activeCalls, 0);
});

test('nested methods each keep their own time', () => {
  const parsed = log(
    enter(0, 'A.outer()'),
    enter(10, 'B.inner()'),
    exit(30, 'B.inner()'),
    exit(50, 'A.outer()')
  );
  const methods = byName(parsed);
  assert.equal(methods['A.outer()'].totalMs, 50);
  assert.equal(methods['B.inner()'].totalMs, 20);
});

test('a method that never exits (truncated log) adds no time and does not throw', () => {
  const parsed = log(enter(0, 'Svc.run()'));
  const svc = byName(parsed)['Svc.run()'];
  assert.equal(svc.calls, 1);
  assert.equal(svc.totalMs, 0);
});

test('a METHOD_EXIT without an entry is ignored', () => {
  assert.doesNotThrow(() => log(exit(10, 'Svc.run()')));
});

test('an error keeps the raw line index it was found on', () => {
  const parsed = log(
    enter(0, 'Svc.run()'),
    ['EXCEPTION_THROWN', 5, '[7]|System.NullPointerException: Attempt to de-reference a null object'],
    exit(10, 'Svc.run()')
  );
  assert.equal(parsed.stats.errors.length, 1);
  assert.equal(parsed.stats.errors[0].lineIndex, 1);
  assert.equal(parsed.lines[1].index, 1);
});

if (failures > 0) {
  console.log(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log('\nAll method stats tests passed');
