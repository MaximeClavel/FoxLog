# Changelog

All notable changes to FoxLog will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

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
- **Calls / Flow tabs**: quiet tinted filter chips (dashed outline when off) and a neutral "Top 5 slowest nodes" card replace the saturated pills and yellow banner
- **Analysis tab**: health score is a KPI card with a meter; suggestion and impact notices are softened
- **Settings popup**: same tokens and dark theme, real `switch` control
- **Contrast**: muted text moved from ~2.5:1 grays to AA-compliant tokens

### Fixed

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
