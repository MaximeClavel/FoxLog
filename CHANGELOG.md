# Changelog

All notable changes to FoxLog will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Changed

- **Clear no longer comes back on the next refresh**: Clear now hides the listed logs until the user restores them, instead of emptying the list until the next auto-refresh re-fetched everything. It remembers the start time of the newest cleared log, per org and user in `chrome.storage.local`, so it survives page reloads and only logs that start later show up. Nothing is deleted in Salesforce
- **Getting cleared logs back**:
  - an "Undo" link in the status line right after a Clear
  - a "N cleared logs" bar under the list, with **Show** (lists them dimmed below the others, under a "Cleared on …" separator, still openable) and **Restore** (puts them back in the list, itself undoable)
- **Saying that Clear doesn't delete**: the Clear button uses an "eye-off" icon instead of the trash can. Its tooltip, the status message, the cleared bar and the empty state ("No new logs") all say the logs stay in Salesforce
- **Modal header**: a cleared log opened from the list shows a "Hidden" chip next to its status
- **Modal header, log user**: the user the log belongs to is shown next to the status, so it's clear whose logs are being browsed when several users have debug logs on. It comes from `LogUser.Name` (now queried with the log list), with the user picklist as a fallback
- **Panel**: 4 log cards per page instead of 5, to make room for the cleared bar
- Clear no longer throws away the session and error-analysis caches

## [1.8.0] - 2026-09-22

### Added

- **Flow tab, full Flow execution visibility**: a Flow interview was previously a black box in the tree — only an explicit unhandled error showed up. Now every element the interview steps through is a real node, built from event types confirmed against real debug logs (see `tests/flow-error-repro/`):
  - `FLOW_ELEMENT_BEGIN`/`FLOW_ELEMENT_END` — each element (Assignment, Loop, Decision, Record Create, Action Call, Subflow...), named after its own API name, not its generic type
  - `FLOW_ASSIGNMENT_DETAIL`, `FLOW_RULE_DETAIL`, `FLOW_LOOP_DETAIL`, `FLOW_SUBFLOW_DETAIL`, `FLOW_VALUE_ASSIGNMENT`, `FLOW_BULK_ELEMENT_DETAIL` (the Flow engine auto-bulkifying a DML element inside a loop — the Flow equivalent of the SOQL/DML-in-loop antipattern) and `FLOW_ACTIONCALL_DETAIL` (a Flow-invoked Apex/action call, success or failure) attach as detail nodes under the element they belong to
  - Validation Rule evaluations (`VALIDATION_RULE`, `VALIDATION_FORMULA`, `VALIDATION_PASS`/`VALIDATION_FAIL`) show the rule name, its formula, and the outcome
  - Callouts (`CALLOUT_REQUEST`/`CALLOUT_RESPONSE`) and SOSL (`SOSL_EXECUTE_BEGIN`/`SOSL_EXECUTE_END`) are now parsed and shown as tree nodes, the same as SOQL and DML already were
- **Flow tab, error navigation**: `< i/N >` prev/next buttons next to the Errors stat cycle through every error node in the tree (wrapping around), expanding the path and panning to each one
- **`tests/flow-error-repro/`**: a deployable SFDX kit (Apex class, Screen Flow, Validation Rule, Remote Site Setting) that exercises every event type above on demand, for regenerating real logs against future parser changes

### Changed

- **Flow tab filters**: `FLOW_VALUE_ASSIGNMENT` nodes now fall under the "Variables" filter (off by default) instead of "Triggers & Flows", consistent with plain `VARIABLE_ASSIGNMENT`
- **Flow/Calls tabs, Apex class nodes**: a `CODE_UNIT_STARTED` node for an Apex class/method call, a Validation Rule, or a Workflow/Flow now shows a readable label ("Apex Class: FoxLogErrorDemoController", "Validation Rule: Account (new)") instead of the raw pipe-delimited log line
- Centralized the Flow/Validation event-type lists (`STRUCTURED_ERROR_TYPES`, `FLOW_DETAIL_TYPES`, `VALIDATION_DETAIL_TYPES`) in `src/core/constants.js` instead of copy-pasting identical arrays into `log-parser.js` and the three `src/ui/*-view.js` files
- **Performance**: the log parser's and call-tree worker's per-event-type dispatch tables are now built once instead of being rebuilt on every single log line

- **Diff tab roles**: the open log ("Current log") stays in the left pane and the imported file is the reference ("Reference file") in the right pane. A `+` row (green) is now a row that exists only in the current log and a `−` row (red) one that exists only in the file (it was the other way round); both panes have a labelled header and the summary bar spells it out ("+2 Only in the current log")
- **Diff tab, identical lines**: runs of identical lines fold into a "⋯ N identical lines" separator (click or keyboard to expand) keeping two lines of context and the parent rows around each difference; a "Show all lines" switch in the summary bar shows everything. Nothing is folded when the logs are identical
- **Diff tab, added/removed blocks**: a block present on one side only now shows its full contents instead of a lone row, and counts as a single divergence for the summary and Prev/Next
- **Flow tab filters**: variable assignments get their own "Variables" filter; "Debug" now only covers `System.debug` statements. Both stay off by default and out of the "notable nodes" list, as Debug was before
- **Flow tab detail panel**: selecting a variable assignment shows its whole value (the node name truncates it at 50 characters)

### Fixed

- **Flow tab, unreadable nodes**: `FLOW_ELEMENT_BEGIN` nodes showed the interview GUID as the element name (rendering as a generic "Flow Element" everywhere), and `FLOW_VALUE_ASSIGNMENT` nodes showed the interview GUID in place of the variable name. Both events are `<interview GUID>|...`-prefixed; the GUID is now dropped and the real fields used
- **Bare log events mis-typed as CONTINUATION**: some event types have no second pipe at all (`VALIDATION_PASS`/`VALIDATION_FAIL`, `CUMULATIVE_LIMIT_USAGE`...); the line-parsing regex required one, so these fell through to a generic, untyped `CONTINUATION` line instead of getting recognized
- **Log-list preview, false error badge**: the quick regex-based error scan used for the log-list card flagged any transaction that merely evaluated a Validation Rule as an error, whether the rule passed or failed (`VALIDATION_RULE`/`VALIDATION_FORMULA` fire on every evaluation) — a fully successful log with a Validation Rule anywhere in it showed a red error badge
- **A failed Flow-to-Apex action call wasn't counted as an error**: `FLOW_ACTIONCALL_DETAIL` with `success: false` (a Flow-invoked Apex action that failed) was marked as an error node in the tree, but the error count, the new error-navigation buttons, and the Calls tab's Errors filter all missed it — they only recognized a fixed list of error event types, which didn't include this one (it's only an error on the failure branch)
- **Debug Level, silently under-configured on create**: `_createDebugLevel()` had its own separate hardcoded category-level config that never picked up a fix to raise Workflow/Validation verbosity, so a newly-created DebugLevel record could stay too quiet to reliably capture Flow/Validation errors
- **Debug Level, update failure blocked enabling logs**: updating a stale existing DebugLevel record had no error handling, so a failure there (e.g. missing edit rights on that specific record) now aborted enabling debug logs entirely instead of falling back to the existing record, like the equivalent create-failure path already did
- **Re-enabling debug logs after expiry deleted the TraceFlag instead of creating a new one**: the "active TraceFlag" query filtered with `ExpirationDate >= TODAY`, but SOQL's `TODAY` means the whole current day, not "right now" — a TraceFlag that expired hours earlier the same day still matched, so clicking to re-enable logs found it, deleted it, and reported logs as disabled instead of creating a fresh one

- **Diff tab, stale file**: after the first comparison, choosing another imported file kept showing the first file's tree. An import was parsed without an `Id`, so every imported file shared the `null` slot of the call tree cache. Imports are now parsed with their `Id`, and `CallTreeBuilderService` no longer caches a log that has no `Id`
- **Diff tab, log navigation**: using Prev/Next in the modal stacked a new listener on the Diff tab button each time, so choosing a file could diff against a previous log and fill the dropdown with duplicates. The Diff tab now follows navigation like Calls and Flow
- **Diff tab, concurrent runs**: an older comparison finishing after a newer one, or after the modal was closed, could overwrite the result
- **Diff tab, root row**: the imported file's name and duration are now used for its root node instead of "Unknown" / 0 ms
- **Variable values (Flow and Calls tabs)**: a variable assignment showed the object's identity hash instead of its value (`this = 0x5e7d71a3` instead of `this = {}`) and nothing at all for null (`opp = `). The log line is `[line]|name|value` with an optional `|0x<hash>` suffix that only reference types carry; the value is now everything between the name and that suffix, so it also survives a `|` inside the value. On a 4000-line log this fixed 324 of 591 variable nodes showing an address and 46 showing nothing

### Testing

- `tests/test-diff-engine.js`: unit tests for the diff engine and its worker copy (`node tests/test-diff-engine.js`)
- `tests/test-call-tree-worker.js`: unit tests for the variable assignment nodes of the call tree worker (`node tests/test-call-tree-worker.js`)
- Every Flow/Validation/Callout/SOSL fix above was verified end-to-end against real debug logs (generated with `tests/flow-error-repro/`) through the real parser and the real call-tree worker, not just synthetic data

## [1.7.0] - 2026-09-19

### Added

- **Design system** (`src/theme.css`): one set of design tokens (surfaces, text, borders, accent, status hues, radius, elevation, motion) scoped to FoxLog's own root elements so nothing leaks into the Salesforce page
- **Dark theme**: follows the OS `prefers-color-scheme`; the previous partial dark blocks (call tree, anti-patterns, graph, export toolbar only) are replaced by a complete theme covering the panel, modal, every tab and the settings popup
- **Log identity header**: the modal header now shows the log's operation, a status chip, the duration and the start time instead of a generic title, and refreshes when navigating between logs
- **Accessibility**: keyboard-operable launcher, log cards, import zone and tabs (arrow keys, roving tabindex); `role=dialog` with focus trap and focus return on the modal; `Esc` closes the panel; `aria-pressed` on filter chips; accessible names on icon-only buttons and the raw log scroll region; `prefers-reduced-motion` support
- **UI preview harness** (`tests/ui-preview/`): runs the real scripts and styles against a mocked Salesforce backend with demo logs, so the UI can be reviewed without an org

### Changed

- **Side panel**: taller card (up to 720px) showing 5 logs per page instead of 3, segmented Salesforce/Files tabs, debug-logs card with a status pill, log cards with a status rail, skeleton loading state and tabular figures
- **Log status**: a non-`Success` status (often a full exception message) is now shown as a short chip with the full text in the tooltip instead of a long uppercase badge
- **Modal**: fixed-height dialog with a blurred backdrop; Summary tab uses KPI cards and class-based limit meters (green/amber/red at 75%/90%) instead of width-attribute selectors
- **Calls / Flow tabs**: quiet tinted filter chips (dashed outline when off) and a neutral "Top 5 slowest nodes" card replace the saturated pills and yellow banner; both tabs now use the whole modal area instead of sitting inside a 16-20px padding, so the Flow graph is larger
- **Salesforce tab icon**: the panel tab shows a Salesforce-blue cloud (`--fl-salesforce`) instead of a database cylinder
- **Analysis tab**: health score is a KPI card with a meter; suggestion and impact notices are softened
- **Settings popup**: same tokens and dark theme, real `switch` control
- **Contrast**: muted text moved from ~2.5:1 grays to AA-compliant tokens
- **Store summary**: the `manifest.json` description (used as the Chrome Web Store summary) now mentions the flow graph, log diffing and one-click debug control

### Fixed

- **Modal tab bar**: a stray 15px vertical scrollbar appeared on Windows because the active-tab underline overflowed the bar by 1px and `overflow-x: auto` also enables vertical scrolling; the bar now clips vertically and hides its own scrollbar
- **Raw log tab**: lines were double-spaced (a newline inside `<pre>` between block-level line spans)
- **Diff tab**: error icons used `aria-label` on a role-less `span`
- **Call tree**: expand/collapse buttons had no accessible name

### Removed

- `:root` CSS variables (`--sf-*`) that leaked into the Salesforce page; `!important` count in `styles.css` reduced from 501 to under 60
- Unused PNG icons (`refresh.png`, `trash.png`) and dead panel styles

## [1.6.1] - 2026-09-17

### Changed

- **Tab order**: "Flow" now appears before "Calls" in the log analysis modal

### Fixed

- **Flow tab layout**: the graph canvas left a blank gap at the bottom of the modal — the container chain relied on `height: 100%` inside a flex column, which Chromium doesn't reliably resolve for flex items; switched to `flex: 1 1 auto; min-height: 0` throughout
- **Flow tab filter chips**: active chips (Triggers & Flows, Apex, Database, Errors) rendered as white text on a white background; added explicit per-category background colors
- **Flow tab search box**: the magnifying glass icon floated below the input instead of overlapping it, and the box shrank further while typing — both caused by reusing a `flex: 1` rule meant for a horizontal toolbar inside a vertical sidebar; the search box now sizes to its content
- **Stray CSS brace**: removed an extra `}` left over at the end of the pre-existing Diff tab styles, which was silently dropping the very next CSS rule (Chromium parser behavior) — this was the root cause of the Flow layout bug above
- **"Next"/"Previous" log navigation**: switching logs while already on the Flow tab (or the Calls tab) left the spinner spinning forever, since the tree/graph only ever (re)built inside the tab button's `click` handler, which navigation never fires; both tabs now rebuild immediately if they're already the active tab

## [1.6.0] - 2026-09-16

### Added

- **New "Flow" tab** (`src/ui/call-graph-view.js`): a visual, n8n-style execution graph of the same `CallTree` used by the Calls tab
  - Pannable/zoomable node canvas (drag to pan, scroll to zoom, +/- and Fit View controls) with methods, SOQL, DML, triggers/flows/workflow rules/validation rules and exceptions rendered as color-coded nodes connected by curved edges
  - Left sidebar: search box + category filter chips (Triggers & Flows, Apex, Database, Errors, Debug) and a "Notable nodes" list (automation entry points, DML, SOQL, errors) to jump straight to a node
  - Right sidebar: detail panel for the selected node (duration, exclusive duration, SOQL/DML counts, query/DML/exception specifics) with a "View in raw log" button that jumps to the matching line in the Raw Log tab
  - Breadcrumb path from the transaction root to the selected node, clickable to re-select any ancestor
  - Expand/Collapse per node (large subtrees start collapsed) plus Expand All / Collapse All, with a safety cap on very large trees to keep panning smooth
  - Reuses the existing cached `CallTree` (built via the Calls tab's Web Worker) — no extra parsing cost

### Changed

- **manifest.json**: registered `src/ui/call-graph-view.js` as a content script (after `call-tree-view.js`)

---

## [1.5.3] - 2026-09-16

### Added

- **Shared SVG icon system** (`src/core/icons.js`): centralized `window.FoxLog.icon(name)` and `window.FoxLog.dot(tone)` helpers, replacing emoji used as icons throughout the panel, modals, call tree view, and log diff view
- **`sf-debug-expired` status**: expired TraceFlags now get their own amber badge instead of sharing the grey "disabled" style

### Changed

- **Auto-refresh interval**: reduced from 10s to 5s (`CONFIG.REFRESH_INTERVAL` in `src/core/constants.js`)
- **User picklist indicators**: replaced the 4-color emoji legend (🟢🟡📋⚪) with a simple `●`/`○` marker (native `<select>` options can't render colored icons)
- **Toasts**: now render a real icon based on message type instead of an emoji prefixed to the text
- **Severity markers** (Critical/Warning/Info) in the Analysis tab and exported reports: emoji dots replaced with CSS-driven colored dots, consistent with the rest of the UI
- **Call tree & log diff node icons**: unified icon set between the two views (previously `METHOD_ENTRY` used different glyphs in each); method-related icons now use a `</>` code icon instead of a generic arrow/wrench
- **Exported `.txt`/`.md`/PDF reports**: dropped decorative emoji in favor of plain section headers and `[TAG]`-style markers

### Documentation

- **README**: Updated user-picklist indicator legend and refresh interval to match the new UI

---

## [1.5.2] - 2026-05-15

### Added

- **5 security anti-patterns** aligned with Summer '26 (API v67) Apex security model:
  - **Dynamic SOQL — Injection Risk**: Detects queries without bind variables (`:tmpVar`) indicating `Database.query()` with string concatenation
  - **Legacy WITH SECURITY_ENFORCED**: Flags deprecated `WITH SECURITY_ENFORCED` usage, redundant since API v67 (user mode is default)
  - **Explicit System Mode — FLS Bypassed**: Detects `WITH SYSTEM_MODE`, `as system`, and `AccessLevel.SYSTEM_MODE` bypasses
  - **Without Sharing Context**: Flags `without sharing` class execution in structural log lines
  - **Insecure HTTP Endpoint**: Detects callouts to `http://` (non-HTTPS) endpoints
- **Security test script**: `tests/test-security-antipatterns.apex` for Developer Console validation
- **7 new unit tests** (Tests 27–33) covering all security detectors with positive and negative cases

### Changed

- **SOQL injection detection**: Uses reliable `:tmpVar` bind variable heuristic from Salesforce log format instead of METHOD_ENTRY scanning
- **Without Sharing detector**: Only matches structural log types (`CODE_UNIT_STARTED`, `METHOD_ENTRY`) — no false positives from `USER_DEBUG` text
- **System Mode detector**: Restricted to `SOQL_EXECUTE_BEGIN`, `DML_BEGIN`, and `METHOD_ENTRY` types

### Documentation

- **Anti-pattern analysis doc**: New "🔒 Sécurité Apex" section with Summer '26 context, examples, and remediation for all 5 patterns
- **i18n**: Added FR/EN keys for all security pattern titles

---

## [1.5.1] - 2026-05-12

### Added

- **Log Diffing**: Side-by-side comparison of two call trees to identify execution divergences
  - LCS-based alignment matching nodes by signature (`type:class.method`) across different logs
  - Color-coded differences: added (green), removed (red), changed (orange), match (grey)
  - Prev/Next navigation to jump between divergences
  - Import directly from Diff tab: select a `.txt` or `.log` file without leaving the modal
  - Select from existing imports: dropdown lists all previously imported logs
  - Auto-sync with Files tab: imports from the Diff tab appear in the panel's Files history
  - Web Worker powered: diff computation runs off the main thread with a 10s timeout
- **New files**: `src/services/log-diff-engine.js`, `src/ui/log-diff-view.js`, `src/workers/log-diff-worker.js`
- **Technical documentation**: `docs/tech-solution/log-diffing.md` with full algorithm and UI specs

### Changed

- **Modal**: 5th tab "Diff" added to the analysis modal (lazy-loaded)
- **Panel**: `foxlog:importListChanged` event keeps Files tab in sync when importing from Diff tab
- **README**: Updated view count from 4 to 5, added Log Diffing feature section

---

## [1.4.1] - 2026-04-09

### Added

- **8 new anti-patterns**: Slow SOQL Query, Excessive Rows Fetched, DML Rows Limit, Empty Query Results, Describe in Loop, Exception Swallowed, Flow Recursion, Nested Loop Pattern (O(n²))
- **Anti-pattern test suite**: Browser-based test runner (`tests/test-antipatterns.js`) with 26 tests covering all detectors
- **Copilot instruction files**: Accessibility (a11y), JavaScript standards, CommonMark Markdown, Performance optimization, Security & OWASP, Self-explanatory code commenting

### Changed

- **Docked panel toggle**: Reduced hover translate distance from 31px to 16px for subtler animation
- **Copilot instructions**: Added rule for incremental modifications (max ~50 lines per edit)

### Documentation

- **Anti-pattern analysis doc**: Added documentation for all 8 new anti-patterns with thresholds and severity levels
- **Test Apex file**: Added test cases for describe in loop, swallowed exception, callout after DML

---

## [1.4.0] - 2026-04-09

### Added
- **Local log import**: Import raw .txt/.log files via drag & drop or file picker for offline analysis
- **Tabbed panel**: New tab system in the side panel — Salesforce (cloud) and Files (local imports)
- **Import history**: Persistent history of imported logs stored in chrome.storage.local with 10 MB quota
- **Storage management**: Visual storage bar, automatic eviction of oldest entries when quota exceeded
- **Delete imports**: Delete individual imports or clear all history
- **Full analysis on import**: Imported logs open the analysis modal with all tabs (Summary, Analysis, Calls, Raw)

---

## [1.3.2] - 2026-03-31

### Added
- **Ko-fi support link**: Added a Ko-fi donation button in the panel footer

### Fixed
- **Error badge double-counting**: Fixed badge showing 4 errors instead of 3 when `REQUIRED_FIELD_MISSING` appeared inside `EXCEPTION_THROWN` text
- **SOQL injection risk**: Added `_validateId()` to sanitize all Salesforce IDs before SOQL queries
- **i18n duplicate keys**: Renamed colliding keys (`exportMd`, `exportSuccess`, `exportError`, `exportPdf`, `exportTxt`)
- **XSS in user picklist**: User names escaped with `escapeHtml()` in panel dropdown
- **Unbounded call tree cache**: Added LRU eviction (max 10 entries) to `CallTreeBuilder`

### Changed
- **Faster method stats**: `_collectStats` uses `Map` for O(1) lookup instead of `Array.find()` O(n²)
- **Parallel API calls**: `fetchUsersWithLogs` now uses `Promise.allSettled` for logs + TraceFlags
- **Logger prefixes**: Fixed copy-paste prefixes — `[FoxLog Injected]` and `[FoxLog Worker]` instead of `[FoxLog BG]`
- **Validation-only error detection**: Regex now matches log event lines only, not keyword substrings inside exception messages

---

## [1.2.0] - 2026-02-06

### Added
- **Background log preloading**: Logs are now pre-fetched and analyzed in background when Salesforce page loads, making panel opening near-instant
- **Top 5 collapse toggle**: The "Top 5 Slowest Nodes" section in Calls tab can now be collapsed/expanded with a chevron button
- **Log line highlighting animation**: Clicking a node in the call tree now highlights the corresponding line in Raw Log with a smooth pulse animation

### Changed
- **Improved DML parsing**: Now extracts operation type, object type, and row count separately (e.g., "Insert Account (5 rows)")
- **Improved Exception parsing**: Better extraction of exception type and message with truncation for long messages
- **Improved USER_DEBUG display**: Shows actual debug message content with level prefix (e.g., "[DEBUG] My message...")
- **Better call tree navigation**: Clicking "Top 5" nodes now properly scrolls and centers the target node in viewport
- **Text wrapping in labels**: Improved CSS for better text wrapping in modal labels
- **Disabled debug mode**: Logger debug mode disabled for production readiness

### Fixed
- **Call tree scroll synchronization**: Fixed issues where internal scroll state could desync from DOM
- **Node highlighting timing**: Highlight now renders immediately instead of after re-render delay
- **Empty tree viewport reset**: Properly resets transform when tree is empty
- **Spacer height update**: Updates spacer height after filter changes for accurate scrolling

### Technical
- Added `preloadedLogs` and `preloadPromise` flags in FoxLogApp for preload state tracking
- Added `_preloadLogs()` method for background log fetching and analysis
- Enhanced `refreshLogs()` with `usePreloaded` parameter to use cached preloaded data
- Added `_toggleTopNodes()` method in CallTreeView for collapse state management
- Added `topNodesCollapsed` state in CallTreeView component
- Improved `scrollToNode()` with fresh DOM references and viewport centering
- Added CSS animations for log line highlighting (`@keyframes sf-line-highlight-pulse`)
- Added `.sf-top-nodes-toggle` button with chevron SVG icon

---

## [1.1.1] - Previous Version

### Added
- **Export reports**: New dropdown menu in Calls tab with two export formats:
  - `.txt` - Plain text format with ASCII art tree
  - `.md` - Markdown format with tables and code blocks
- **Call tree in exports**: Full hierarchical call tree included in performance reports
- **Performance metrics in exports**:
  - Top 5 slowest nodes with duration and type
  - Total duration, node count, error count
  - SOQL/DML badges on nodes
- **Type filter toggles**: 6 color-coded filter buttons to show/hide node categories:
  - 🔵 Methods - Apex methods (METHOD_ENTRY/EXIT)
  - 🟢 Database - SOQL queries and DML operations
  - 🟣 Debug - USER_DEBUG statements
  - 🔴 Errors - Exceptions and fatal errors
  - 🟠 Variables - Variable assignments and scopes
  - ⚪ System - System events (CODE_UNIT, HEAP, etc.)

### Changed
- **Simplified tab structure**: Removed Timeline tab, consolidated features into Calls tab
- **Improved Calls tab**: Now the primary view for analyzing execution flow
- **Export button**: Replaced single export with dropdown menu for format selection
- **Filter bar**: New visual filter bar with toggle buttons (all active by default)

### Removed
- **Timeline tab**: Removed redundant timeline view (Call Tree provides better visualization)
- **JSON export**: Replaced with more readable TXT/MD formats
- **Timeline-specific filters**: Removed filters that only applied to Timeline view
- **Errors Only toggle**: Replaced by dedicated "Errors" category toggle

### Technical
- Cleaned up ~170 lines of unused Timeline CSS styles
- Removed `_renderTimelineTab()` and `_renderTimelineLine()` methods
- Removed `_applyFilters()` and `_triggerInitialHighlight()` methods
- Added `_buildTreeText()` for recursive tree export generation
- Added `_buildTextReport()` and `_buildMarkdownReport()` for format-specific output
- Added `_toggleExportMenu()` for dropdown menu management
- Added `typeFilters` state object for category filtering
- Added `_toggleTypeFilter()` and `_getNodeCategory()` methods
- Added filter toggle CSS with color-coded active states
- Added new i18n keys: `exportTxt`, `exportMd`, `callTree`, `filterBy`, `methods`, `database`, `debug`, `errors`, `variables`, `system`

## [1.0.0] - Previous Version

### Features
- Real-time Apex log display with automatic refresh
- Intelligent parser for 15+ log line types
- Multi-user management with TraceFlag status indicators
- 3 visualization tabs: Summary, Calls, Raw Log
- Call tree built via Web Worker for performance
- Smart caching and virtualization
- Bilingual support (FR/EN)
