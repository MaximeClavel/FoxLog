// Unit tests for the error alerts' "which logs are new and erroneous since the watermark" logic.
// Run from the repository root: node tests/test-error-alerts.js
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Both files are browser IIFEs that register themselves on window.FoxLog
function load() {
  const window = { FoxLog: { logger: { log() {}, warn() {}, error() {}, success() {} } } };
  const context = { window, console };
  vm.createContext(context);
  ['src/services/log-preview-service.js', 'src/services/error-alert-service.js'].forEach((file) => {
    vm.runInContext(fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8'), context, { filename: file });
  });
  return window.FoxLog;
}

const { errorAlerts, logPreviewService } = load();
const { findNewLogs, pickErrorLogs, describeError } = errorAlerts;

// Results come from another vm context (other Array prototype): compare them as plain JSON
const plain = (value) => JSON.parse(JSON.stringify(value));

const USER = '005000000000001AAA';
const OTHER_USER = '005000000000002AAA';
const WINDOW = 10 * 60 * 1000;
const T0 = Date.parse('2026-10-12T08:00:00.000Z');
const at = (minutes) => new Date(T0 + minutes * 60000).toISOString().replace('Z', '+0000');
let nextId = 1;
const log = (minutes, extra = {}) => ({
  Id: `07L00000000${String(nextId++).padStart(4, '0')}AAA`,
  StartTime: at(minutes),
  Operation: '/aura',
  Status: 'Success',
  ...extra
});
const ids = (logs) => logs.map((entry) => entry.Id);

// One check, as the service does it (the state also goes through JSON in chrome.storage)
function check(logs, state, options = {}) {
  return plain(findNewLogs(logs, state, { userId: USER, lateWindowMs: WINDOW, ...options }));
}

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

test('the first check is the baseline: logs already there are never new', () => {
  const existing = [log(0, { Status: 'System.NullPointerException' }), log(-5)];
  const first = check(existing, null);
  assert.equal(first.baseline, true);
  assert.deepEqual(first.newLogs, []);
  assert.equal(first.state.startTime, new Date(T0).toISOString());
  assert.deepEqual(Object.keys(first.state.seen).sort(), ids(existing).sort());
});

test('a log that arrives after the baseline is new, once', () => {
  const existing = [log(0)];
  const { state } = check(existing, null);
  const arrived = log(1);

  const second = check([arrived, ...existing], state);
  assert.equal(second.baseline, false);
  assert.deepEqual(ids(second.newLogs), [arrived.Id]);
  assert.equal(second.state.startTime, new Date(T0 + 60000).toISOString());

  const third = check([arrived, ...existing], second.state);
  assert.deepEqual(third.newLogs, [], 'an alerted log is never new again');
});

test('several new logs come back newest first', () => {
  const { state } = check([log(0)], null);
  const older = log(2);
  const newer = log(3);
  const { newLogs } = check([older, newer], state);
  assert.deepEqual(ids(newLogs), [newer.Id, older.Id]);
});

test('a baseline with no logs at all still makes the next log new', () => {
  const { state } = check([], null);
  assert.equal(state.startTime, null);
  const arrived = log(0);
  assert.deepEqual(ids(check([arrived], state).newLogs), [arrived.Id]);
});

test('a long transaction listed late (older StartTime than the watermark) is still new', () => {
  const { state } = check([log(5)], null);
  const slowOne = log(1); // started before the newest log, finished after the last check
  assert.deepEqual(ids(check([slowOne], state).newLogs), [slowOne.Id]);
});

test('a log older than the late window is not new (its Id was dropped from the seen list)', () => {
  const { state } = check([log(30)], null);
  const ancient = log(30 - 11);
  assert.deepEqual(check([ancient], state).newLogs, []);
});

test('the seen list only keeps the late window, so the stored state stays small', () => {
  const recent = log(30);
  const old = log(5);
  const { state } = check([recent, old], null);
  assert.deepEqual(Object.keys(state.seen), [recent.Id]);
});

test('soft clear: logs at or before the Clear mark are never alerted, even when new', () => {
  const { state } = check([log(0)], null);
  const hidden = log(1);
  const visible = log(3);
  const clearMark = { startTime: new Date(Date.parse(hidden.StartTime)).toISOString(), clearedOn: Date.now() };

  const result = check([hidden, visible], state, { clearMark });
  assert.deepEqual(ids(result.newLogs), [visible.Id]);

  // Restoring the cleared logs later must not alert on them either
  assert.deepEqual(check([hidden, visible], result.state).newLogs, []);
});

test('user switch resets the baseline: another user\'s watermark never applies', () => {
  const { state } = check([log(0)], null);
  const otherUsersLogs = [log(5, { Status: 'System.LimitException' }), log(6)];

  const switched = check(otherUsersLogs, state, { userId: OTHER_USER });
  assert.equal(switched.baseline, true);
  assert.deepEqual(switched.newLogs, []);
  assert.equal(switched.state.userId, OTHER_USER);

  const arrived = log(7);
  const next = check([arrived, ...otherUsersLogs], switched.state, { userId: OTHER_USER });
  assert.deepEqual(ids(next.newLogs), [arrived.Id]);
});

test('a non-Success status is an error without needing the body scan', () => {
  const failed = log(0, { Status: 'Attempt to de-reference a null object' });
  const fine = log(1);
  const alerts = plain(pickErrorLogs([failed, fine], new Map()));
  assert.deepEqual(alerts.map(({ log: entry }) => entry.Id), [failed.Id]);
  assert.equal(alerts[0].error, 'Attempt to de-reference a null object');
});

test('the alert and the card agree: a handled error found by the quick scan counts, with its message', () => {
  const body = [
    '12:00:00.0 (100)|EXECUTION_STARTED',
    '12:00:00.0 (200)|EXCEPTION_THROWN|[12]|System.DmlException: Insert failed. FIELD_CUSTOM_VALIDATION_EXCEPTION, Amount must be positive',
    '12:00:00.0 (300)|EXECUTION_FINISHED'
  ].join('\n');
  const handled = log(0); // Status Success: the exception was caught
  const analysis = new Map([[handled.Id, logPreviewService._quickErrorDetection(body)]]);

  const alerts = plain(pickErrorLogs([handled], analysis));
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].error, 'System.DmlException: Insert failed. FIELD_CUSTOM_VALIDATION_EXCEPTION, Amount must be positive');
});

test('a failed Validation Rule counts, with the message the user saw', () => {
  const body = [
    '12:00:00.0 (100)|VALIDATION_RULE|03d000000000001|Amount_Positive',
    '12:00:00.0 (200)|VALIDATION_FAIL',
    '12:00:00.0 (300)|VF_PAGE_MESSAGE|Amount must be positive'
  ].join('\n');
  const scan = logPreviewService._quickErrorDetection(body);
  assert.equal(scan.hasError, true);
  assert.equal(scan.firstError, 'Amount must be positive');
});

test('a Validation Rule that passed is not an error', () => {
  const body = [
    '12:00:00.0 (100)|VALIDATION_RULE|03d000000000001|Amount_Positive',
    '12:00:00.0 (200)|VALIDATION_FORMULA|Amount__c < 0|Amount__c=12',
    '12:00:00.0 (300)|VALIDATION_PASS'
  ].join('\n');
  const passed = log(0);
  const analysis = new Map([[passed.Id, logPreviewService._quickErrorDetection(body)]]);
  assert.deepEqual(plain(pickErrorLogs([passed], analysis)), []);
});

test('the error line is one line and capped', () => {
  const long = `System.LimitException: ${'x'.repeat(400)}`;
  const error = describeError(log(0), { hasError: true, firstError: `${long}\n\nClass.Foo: line 7` });
  assert.equal(error.includes('\n'), false);
  assert.equal(error.length, 160);
  assert.equal(error.endsWith('…'), true);
});

if (failures > 0) {
  console.log(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log('\nAll error alert tests passed');
