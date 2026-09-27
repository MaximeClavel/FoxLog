// The error count on a panel card (quick scan of the log) must match the one in the modal (full parser).
// Run from the repository root: node tests/test-log-preview-errors.js
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

function load() {
  const sandbox = {
    window: { FoxLog: {} },
    chrome: { runtime: { getManifest: () => ({ version: 'test' }), getURL: (asset) => asset } },
    navigator: { language: 'en-US' },
    console: { log() {}, warn() {}, error() {} }
  };
  sandbox.window.FoxLog.logger = { log() {}, warn() {}, error() {}, success() {} };
  vm.createContext(sandbox);
  ['src/core/constants.js', 'src/parsers/log-parser.js', 'src/services/log-preview-service.js'].forEach((file) => {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), sandbox, { filename: file });
  });
  return sandbox.window.FoxLog;
}

const FoxLog = load();
const line = (type, content, n = 1) => `23:16:08.${n} (${n}00)|${type}${content === undefined ? '' : `|${content}`}`;

const panelCount = (body) => FoxLog.logPreviewService._quickErrorDetection(body).errorCount;
const modalCount = (body) => FoxLog.logParser.parse(body, {}).stats.errors.length;

const bodies = {
  'a Flow fault path taken': [
    line('EXECUTION_STARTED'),
    line('FLOW_ELEMENT_FAULT', 'Fault path taken.|FlowActionCall|Call_With_Fault_Path'),
    line('EXECUTION_FINISHED')
  ],
  'a Flow action call that failed': [
    line('FLOW_ACTIONCALL_DETAIL', 'a1b2|Call_Apex|Apex|FoxLogErrorDemoController|false|An Apex error occurred: boom')
  ],
  'a Flow action call that succeeded': [
    line('FLOW_ACTIONCALL_DETAIL', 'a1b2|Call_Apex|Apex|FoxLogErrorDemoController|true|')
  ],
  'an exception and a failed validation': [
    line('EXCEPTION_THROWN', '[10]|System.DmlException|Insert failed. FIELD_CUSTOM_VALIDATION_EXCEPTION'),
    line('VALIDATION_FAIL')
  ],
  'validation rules that all passed': [
    line('VALIDATION_RULE', '03dDJ000000umFt|FoxLog_Demo_Validation_Fail'),
    line('VALIDATION_FORMULA', 'CONTAINS(Description, "X")|Description=ok'),
    line('VALIDATION_PASS')
  ],
  'an error type named inside an exception message': [
    line('EXCEPTION_THROWN', '[5]|System.DmlException|Insert failed: VALIDATION_FAIL|FLOW_ELEMENT_FAULT')
  ],
  'a continuation line of a multi-line debug that names an error type': [
    line('USER_DEBUG', '[3]|DEBUG|payload follows'),
    'payload|FLOW_ELEMENT_FAULT|x|y',
    'more|VALIDATION_FAIL'
  ],
  'a clean log': [
    line('EXECUTION_STARTED'),
    line('USER_DEBUG', '[3]|DEBUG|all good'),
    line('EXECUTION_FINISHED')
  ]
};

// Every structured error type, on its own
FoxLog.STRUCTURED_ERROR_TYPES.forEach((type) => {
  bodies[`a lone ${type}`] = [line(type, 'Flow|Some_Element|something failed')];
});

let failed = 0;
Object.entries(bodies).forEach(([name, lines]) => {
  const body = lines.join('\n');
  try {
    assert.equal(panelCount(body), modalCount(body));
    console.log(`  ok   ${name}: ${panelCount(body)}`);
  } catch (error) {
    failed++;
    console.log(`  FAIL ${name}: panel ${panelCount(body)}, modal ${modalCount(body)}`);
  }
});

const clean = bodies['a Flow fault path taken'].join('\n');
try {
  assert.equal(FoxLog.logPreviewService._quickErrorDetection(clean).hasError, true);
  assert.equal(panelCount(bodies['a clean log'].join('\n')), 0);
  assert.equal(panelCount(bodies['a Flow action call that succeeded'].join('\n')), 0);
  console.log('  ok   the panel flags a fault path and leaves clean logs alone');
} catch (error) {
  failed++;
  console.log(`  FAIL the panel flags a fault path and leaves clean logs alone: ${error.message}`);
}

console.log(failed ? `\n${failed} failed` : '\nAll panel/modal error counts match');
process.exit(failed ? 1 : 0);
