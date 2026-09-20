<div align="center">
  <img src="src/assets/icon128.png" alt="FoxLog Logo" width="128" height="128">
  <h1>FoxLog 🦊</h1>
  <p>Chrome extension to visualize and analyze Salesforce debug logs with a modern interface and advanced features.</p>
</div>

## 🚀 Key Features

### 📊 Visualization and Analysis
- **Real-time display** of Apex logs with automatic refresh (every 5s)
- **Intelligent parser** analyzing 15+ line types (METHOD_ENTRY, SOQL, DML, USER_DEBUG, EXCEPTION, etc.)
- **Automatic error detection** with visual badges and counters
- **Detailed statistics**: SOQL queries, DML statements, CPU time, Heap size with progress bars
- **Salesforce limits analysis** with visual alerts

### � Anti-Pattern Detection
- **22 automatic detections** for Salesforce best practices:
  - 🔴 **Critical**: SOQL/DML in Loop, N+1 Query, Trigger Recursion, Mixed DML, Callout After DML
  - 🟡 **Warning**: No LIMIT/WHERE, Non-Selective Query, Hardcoded IDs, Excessive Async, Large Query Results
  - 🔵 **Info**: Too Many Fields, Deep Call Stack, Debug Statements, Validation Failures
- **Dedicated Analysis tab** with severity badges and actionable suggestions
- **Direct link to raw log lines** for quick navigation
- **Export analysis** in PDF, Markdown, or TXT format

### 👥 Multi-user Management
- **User selection** via picklist with visual indicators:
  - ● Active (TraceFlag and/or logs available)
  - ○ No activity (no TraceFlag, no logs)
- **Current user always visible** in picklist (marked with "You" / "Moi")
- **Current user selected by default** for easy TraceFlag activation
- **Active TraceFlags display** per user
- **Log counter** per user
- **One-click TraceFlag toggle** to enable/disable debug logs

### 📂 Local Log Import
- **Import raw log files** (.txt, .log) directly via drag & drop or file picker
- **Tabbed panel interface**: switch between Salesforce (cloud logs) and Files (local imports)
- **Persistent import history** stored in chrome.storage.local
- **Storage management**: 10 MB quota with automatic eviction of oldest entries
- **Visual storage bar** showing used space at a glance
- **One-click analysis**: imported logs open the full analysis modal (Summary, Calls, Analysis, Raw)

### 🌳 Advanced Visualization
- **6 complementary views**:
  - **Summary**: Overview with statistics and metadata
  - **Calls**: Hierarchical call tree with performance analysis (built via Web Worker)
  - **Flow**: [NEW] Visual, pannable/zoomable execution graph (n8n-style node canvas) of methods/SOQL/DML/triggers/flows, with a searchable node list and a detail side panel
  - **Analysis**: Anti-pattern detection with severity and suggestions
  - **Raw Log**: Original log content with copy/export options
  - **Diff**: Side-by-side comparison of two logs to identify execution divergences
- **Top 5 Slowest Nodes**: Instantly identify performance bottlenecks
- **Log navigation**: Previous/Next buttons to switch between logs without closing the modal
- **Advanced filtering**: errors only, search in tree, category filters in the Flow graph
- **Export reports**: Export call tree and performance data in `.txt` or `.md` format

### 🔀 Log Diffing
- **Side-by-side comparison** of two call trees to spot execution divergences
- **LCS-based alignment** matching nodes by signature across different logs
- **Clear roles**: the open log is on the left, the imported file it is compared against (the reference) on the right
- **Color-coded differences**: only in the open log (green, `+`), only in the file (red, `−`), changed (orange), identical (grey); added/removed blocks show their full contents
- **Identical lines folded**: runs of identical lines collapse into a "⋯ N identical lines" separator (click to expand), with a "Show all lines" switch
- **Divergence navigation**: Prev/Next buttons to jump between differences
- **Import directly from Diff tab**: import a `.txt` or `.log` file without leaving the modal
- **Select from existing imports**: dropdown lists all previously imported logs
- **Auto-sync with Files tab**: imports from the Diff tab appear in the panel's Files history
- **Web Worker powered**: diff computation runs off the main thread with a 10s timeout

### ⚡ Performance
- **Smart caching** to avoid redundant requests
- **Background analysis** to avoid blocking the UI
- **Web Workers** for call tree construction
- **Virtualization** for large lists

### 🎨 User Interface [NEW]
- **Side panel** with a draggable floating button that docks to the window edges
- **Modern modal** with an identity header (operation, status, duration), underlined tabs and prev/next log navigation
- **Design system**: one set of tokens (`src/theme.css`) drives colors, type, radius and elevation for the panel, modal, toasts and settings popup
- **Light and dark themes** that follow your OS setting, with WCAG AA contrast in both
- **Accessible by default**: keyboard-operable panel, tabs and log cards, visible focus rings, dialog focus trap, `prefers-reduced-motion` support
- **Consistent SVG icon set** across the panel, modals, call tree and diff view — no more emoji-as-icons
- **Responsive design** down to narrow browser windows
- **Performance report export** in TXT and Markdown formats

See [docs/ui-design-system.md](docs/ui-design-system.md) for the tokens and component conventions.

## 📦 Installation

1. Clone the repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked extension"
5. Select the project folder

## 🎯 Usage

1. Navigate to a Salesforce page (Lightning)
2. Click on the 🦊 icon in the bottom right of the screen
3. The panel opens with your recent logs
4. **You are automatically selected** in the dropdown list (marked with "You")
5. If you have no active TraceFlag, use the toggle to enable debug logs
6. Switch to the **Files** tab to import and analyze local .txt/.log files
7. Click "Details" to analyze a log in depth
8. Explore the different tabs: Summary, Calls, Flow, Analysis, Raw Log
9. Use the **Analysis tab** to detect anti-patterns and export reports (PDF/MD/TXT)
10. Use the **Diff tab** to compare execution with an imported log from another environment
11. Use the export button in the Calls tab to generate a performance report

## 🧪 Testing

Test scripts are available in the `tests/` folder:
- **test-antipatterns.apex**: Generates all anti-patterns for detection testing
- **test-calltree.apex**: Generates a rich call tree with nested operations

Execute them in Salesforce Developer Console (Execute Anonymous) and open the log in FoxLog.

### Previewing the UI without a Salesforce org

`tests/ui-preview/` runs the real content scripts and stylesheets against a mocked Salesforce backend with demo logs:

```bash
node tests/ui-preview/server.js
```

Then open `http://foxlog.lightning.force.com.localhost:8123` (the `*.localhost` host name lets the extension's Salesforce-page check pass). Scenes can be opened directly, e.g. `?open=panel`, `?open=panel&panelTab=import` or `?open=modal&log=0&tab=analysis`. Switch your OS between light and dark to check both themes.

## 🤝 Contributing

Contributions are welcome!

## ℹ️ About

By Claude and occasionally Maxime Clavel
Contact : FoxLog.Extension@proton.me

## 📄 License

MIT License - see [LICENSE](LICENSE)