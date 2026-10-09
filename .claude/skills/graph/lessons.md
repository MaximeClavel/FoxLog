# /graph lessons

Rules proven by earlier work on FoxLog. Read them before planning. Add a rule here only once a run has proven it, with the evidence (commit or log line) in one line.

## Salesforce log format

- `FLOW_ELEMENT_BEGIN` and `FLOW_VALUE_ASSIGNMENT` lines start with the Flow interview GUID (`<GUID>|...`). Drop it before reading the real fields. (1.8.0)
- Some events have no second pipe at all: `VALIDATION_PASS`, `VALIDATION_FAIL`, `CUMULATIVE_LIMIT_USAGE`. A line regex that requires one turns them into `CONTINUATION`. (1.8.0)
- Variable assignment is `[line]|name|value`, with a `|0x<hash>` suffix only on reference types. The value can itself contain `|`. (1.8.0)
- `VALIDATION_RULE` and `VALIDATION_FORMULA` fire on every evaluation, so they are not errors. Only `VALIDATION_FAIL` is. (1.8.0)
- `FLOW_ACTIONCALL_DETAIL` is an error only when `success: false`. It must count in the error total, the `< i/N >` navigation and the Calls tab "Errors" filter, not only in the tree. (1.8.0)

## Salesforce API

- In SOQL, `TODAY` means the whole current day, not "now". Compare datetimes against `new Date().toISOString()`. (1.8.0, `f9e3741`)

## Code structure

- Web workers can't read `window.FoxLog`: `call-tree-worker.js` keeps its own copy of the type lists in `src/core/constants.js`, and `log-diff-worker.js` keeps a copy of the diff engine. Change both sides in the same node.
- Async refreshes must drop their result if the selected user changed while they were awaiting. (1.9.1)
- A cache keyed by log `Id` must not cache logs without an `Id` (imported files). (1.8.0)

## Browsers

- Chrome rejects `background.scripts` in MV3, so `manifest.json` (Chrome) and `manifest.firefox.json` stay separate files, and a version bump touches both. (1.10.0)
- Firefox's `chrome.*` shim has no promise overload for `chrome.cookies`: use callbacks. (1.10.0)

## Process

- Complete the existing docs (`CHANGELOG.md`, `README.md`, `docs/`). Don't create a new doc file for a fix.
- Version bump: minor when there is something under "Added", patch when there is only "Fixed".
