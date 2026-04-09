<div align="center">
  <img src="src/assets/icon128.png" alt="FoxLog Logo" width="128" height="128">
  <h1>FoxLog 🦊</h1>
  <p>Chrome extension to visualize and analyze Salesforce debug logs with a modern interface and advanced features.</p>
</div>

## 🚀 Key Features

### 📊 Visualization and Analysis
- **Real-time display** of Apex logs with automatic refresh
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
  - 🟢 TraceFlag active + logs available
  - 🟡 TraceFlag active, no logs yet
  - 📋 Logs available (no TraceFlag)
  - ⚪ No TraceFlag, no logs (current user)
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
- **4 complementary views**:
  - **Summary**: Overview with statistics and metadata
  - **Calls**: Hierarchical call tree with performance analysis (built via Web Worker)
  - **Analysis**: Anti-pattern detection with severity and suggestions
  - **Raw Log**: Original log content with copy/export options
- **Top 5 Slowest Nodes**: Instantly identify performance bottlenecks
- **Log navigation**: Previous/Next buttons to switch between logs without closing the modal
- **Advanced filtering**: errors only, search in tree
- **Export reports**: Export call tree and performance data in `.txt` or `.md` format

### ⚡ Performance
- **Smart caching** to avoid redundant requests
- **Background analysis** to avoid blocking the UI
- **Web Workers** for call tree construction
- **Virtualization** for large lists

### 🎨 User Interface
- **Side panel** with floating button
- **Modern modal** with tabs
- **Responsive design** and intuitive
- **Performance report export** in TXT and Markdown formats

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
8. Explore the different tabs: Summary, Calls, Analysis, Raw Log
9. Use the **Analysis tab** to detect anti-patterns and export reports (PDF/MD/TXT)
10. Use the export button in the Calls tab to generate a performance report

## 🧪 Testing

Test scripts are available in the `tests/` folder:
- **test-antipatterns.apex**: Generates all anti-patterns for detection testing
- **test-calltree.apex**: Generates a rich call tree with nested operations

Execute them in Salesforce Developer Console (Execute Anonymous) and open the log in FoxLog.

## 🤝 Contributing

Contributions are welcome!

## ℹ️ About

By Claude Sonnet 4.5 and occasionally Maxime Clavel
Contact : FoxLog.Extension@proton.me

## 📄 License

MIT License - see [LICENSE](LICENSE)