# Changelog

All notable changes to FoxLog will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

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
