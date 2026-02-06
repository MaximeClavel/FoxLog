# Changelog

All notable changes to FoxLog will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

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
