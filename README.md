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

### 👥 Multi-user Management
- **User selection** via picklist with visual indicators
- **Active TraceFlags display** per user
- **Log counter** per user

### 🔍 Advanced Visualization
- **4 complementary views**:
  - **Summary**: Overview with statistics and metadata
  - **Timeline**: Execution timeline with indentation and colors
  - **Call Tree**: Hierarchical method visualization (built via Web Worker)
  - **Raw Log**: Original log content
- **Advanced filtering**: by log type, errors only, duration, depth
- **Search** in logs with highlighting
- **Pagination** to handle large log lists

### ⚡ Performance
- **Smart caching** to avoid redundant requests
- **Background analysis** to avoid blocking the UI
- **Web Workers** for call tree construction
- **Virtualization** for large lists

### 🎨 User Interface
- **Side panel** with floating button
- **Modern modal** with tabs
- **Responsive design** and intuitive
- **Statistics export** in JSON format

## 📦 Installation

1. Clone the repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked extension"
5. Select the project folder

## 🎯 Usage

1. Navigate to a Salesforce page (Lightning or Classic)
2. Click on the 🦊 icon in the bottom right of the screen
3. The panel opens with your recent logs
4. Select a user from the dropdown list if needed
5. Click "Details" to analyze a log in depth
6. Explore the different tabs: Summary, Timeline, Calls, Raw Log

## 🤝 Contributing

Contributions are welcome!

## ℹ️ About

By Claude Sonnet 4.5 and occasionally Maxime Clavel
Contact : FoxLog.Extension@proton.me

## 📄 License

MIT License - see [LICENSE](LICENSE)