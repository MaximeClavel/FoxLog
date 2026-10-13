# Log modal tabs

## Purpose

The log modal (Summary, Analysis, Flow, Calls, Raw Log, Diff) used to be one 2,800-line file, `src/ui/modal-manager.js`, that mixed the modal itself with the rendering and behavior of every tab and the report export. It is now split into:

- a **shell**, `src/ui/modal-manager.js`, that owns everything common to all tabs;
- **one module per tab** in `src/ui/modal-tabs/`, which registers itself in a small registry.

Adding a tab (for example "Database" or "Query") means writing one file and listing it in the two manifests. The shell does not change.

## Architecture

```text
                          window.FoxLog.modalManager  (src/ui/modal-manager.js, the shell)
 ┌──────────────────────────────────────────────────────────────────────────────────────────┐
 │ header: title, status chips, prev/next navigation, close button                          │
 │ tab bar: one button per registered tab (icon, label, optional badge)                     │
 │ tab switching + arrow/Home/End keys, focus trap, Escape, click outside, ←/→ log nav      │
 │ toasts (_showToast), cross-tab helpers: showInFlow, showPatternInAnalysis, scrollToLogLine│
 │ one ctx per tab: calls render / setup / onActivate / onLogChange / destroy               │
 └───────────────▲──────────────────────────────────────────────────────────────────────────┘
                 │ modalTabs.list()  (read when a parsed log is opened)
 ┌───────────────┴──────────────────┐        ┌──────────────────────────────────────────────┐
 │ window.FoxLog.modalTabs          │◄───────│ modal-tabs/*-tab.js                           │
 │ (tab-registry.js)                │register│  summary-tab   order 10                       │
 │ register(def) / get(id) / list() │        │  analysis-tab  order 20 ──► analysis-export.js│
 └──────────────────────────────────┘        │  graph-tab     order 30  (lazy, Flow)         │
 ┌──────────────────────────────────┐        │  calls-tab     order 40  (lazy)               │
 │ window.FoxLog.modalTabUtils      │◄───────│  raw-tab       order 50                       │
 │ (tab-utils.js) escapeHtml,       │  use   │  diff-tab      order 60  (lazy)               │
 │ formatBytes, getStatusTone,      │        └──────────────────────────────────────────────┘
 │ generateFilename, downloadFile,  │
 │ renderLoading, renderErrorState  │        Views used by the lazy tabs (unchanged):
 └──────────────────────────────────┘        CallGraphView, CallTreeView, LogDiffView
```

| File | Role |
|------|------|
| `src/ui/modal-manager.js` | Shell: modal creation, identity header, tab bar markup, tab switching and keyboard, focus trap, prev/next log navigation, toasts, cross-tab helpers, tab contexts. Public API unchanged (`showParsedLog`, `showRawLog`, `setLogsList`, `close`, `scrollToLogLine`, `showInFlow`, `showPatternInAnalysis`, `currentModal`, `currentParsedLog`, `currentAntiPatternResults`) |
| `src/ui/modal-tabs/tab-registry.js` | `window.FoxLog.modalTabs`: `register(definition)`, `get(id)`, `list()` (sorted by `order`) |
| `src/ui/modal-tabs/tab-utils.js` | `window.FoxLog.modalTabUtils`: helpers shared by the shell and the tabs |
| `src/ui/modal-tabs/summary-tab.js` | Summary: verdict banner, limits, errors, anti-pattern preview, methods; remembers collapsed sections |
| `src/ui/modal-tabs/analysis-tab.js` | Analysis: health score, patterns by severity, line links, export menu, tab badge |
| `src/ui/modal-tabs/analysis-export.js` | `window.FoxLog.analysisExporter`: PDF (print dialog), Markdown and text reports |
| `src/ui/modal-tabs/graph-tab.js` | Flow: lazy `CallGraphView`, pending "jump to node" requests |
| `src/ui/modal-tabs/calls-tab.js` | Calls: lazy `CallTreeView` |
| `src/ui/modal-tabs/raw-tab.js` | Raw Log: one `data-line` span per line, copy and `.txt` export |
| `src/ui/modal-tabs/diff-tab.js` | Diff: import picker, inline file import, diff worker, `LogDiffView` |

The report export lives next to the Analysis tab rather than in `src/services/`: it is only reached from the Analysis export menu and it is UI code (print window, hidden iframe, Blob download, toasts), while `src/services/` holds data logic with no DOM output (parser, call tree, anti-pattern detector, diff engine). It shows its toasts through the `foxlog:showToast` event, like `CallGraphView` and `CallTreeView`, so it doesn't depend on the shell.

`showRawLog(content)` (used when the parser isn't available) is a separate, tab-less modal: it goes through the same header, focus trap and close handling, but no tab module is involved.

## The tab contract

A tab module is an IIFE that calls `window.FoxLog.modalTabs.register(definition)` once, at load time.

| Field | Required | Description |
|-------|----------|-------------|
| `id` | yes | Lowercase id (`/^[a-z][a-z0-9-]*$/`). Becomes the button's `data-tab` and the pane's `id="tab-<id>"`; CSS and other tabs may rely on both |
| `order` | yes | Position in the tab bar, lowest first. The first tab is the one the modal opens on. Current values: 10 Summary, 20 Analysis, 30 Flow, 40 Calls, 50 Raw Log, 60 Diff. Pick a value in between to insert a tab |
| `icon` | yes | Icon name for `window.FoxLog.icon()` (`src/core/icons.js`), rendered at 14 px |
| `label` | yes | Translated label, or a function returning it (`() => i18n.foo \|\| 'Foo'`) |
| `render(ctx)` | yes | Returns the HTML of the pane for `ctx.parsedLog`. Pure: build a string, don't touch the DOM (`ctx.pane` is still `null` on the first call) |
| `paneClass` | no | Extra class on the pane, e.g. `'sf-tab-content--flush'` for an edge-to-edge view (Flow, Calls) |
| `badge(ctx)` | no | HTML appended to the label (the Analysis count). Re-rendered on every log change |
| `setup(ctx)` | no | Once per opened modal, after it is in the page |
| `onActivate(ctx)` | no | Every time the tab is selected |
| `onLogChange(ctx)` | no | After the pane was re-rendered for another log (prev/next) |
| `destroy(ctx)` | no | When the modal closes |

`register()` throws on a missing or invalid `id`, a missing `order`, `icon`, `label` or `render`, or an `id` already registered. The definition is frozen. Any other property is allowed: it becomes a method the shell can call by name (see [Cross-tab navigation](#cross-tab-navigation)).

Hooks are called as `definition.hook(ctx, ...args)`, with `this` set to the definition. The existing modules use plain functions and never rely on `this`.

### When each hook runs

| Moment | What the shell does | Hooks called |
|--------|--------------------|--------------|
| **Open** (`showParsedLog(log, parser)`) | Closes the previous modal, creates one `ctx` per registered tab, renders header + tab bar + every pane (first tab active), attaches the modal, wires tab switching | `badge(ctx)` and `render(ctx)` for every tab while building the markup, then `setup(ctx)` for every tab in `order` |
| **Activation** (click on the tab button, Enter/Space, arrow/Home/End keys in the tab bar, or a cross-tab helper that clicks it) | Marks the button and pane active | `onActivate(ctx)`, after the pane is visible. Also called when the tab already was active (clicking it again) |
| **Log navigation** (prev/next buttons, ←/→ keys, `showParsedLog(log, parser, true)`) | Updates the header and navigation, then for each tab in `order`: refreshes `ctx.parsedLog` / `summary` / `antiPatternResults`, sets `ctx.pane.innerHTML = render(ctx)`, re-renders the button if the tab has a `badge` | `render(ctx)`, `badge(ctx)`, then `onLogChange(ctx)`. The active tab stays active: no `onActivate` |
| **Close** (close button, Escape, click on the backdrop, or a new `showParsedLog`/`showRawLog` replacing the modal) | Removes the modal and gives focus back | `destroy(ctx)` for every tab, then the contexts are dropped |

Content wired in `setup` is gone after a log change, because the pane was re-rendered. So a tab that binds listeners to elements inside its content runs the same function from `setup` and `onLogChange` (Analysis, Raw Log). A tab that uses one delegated listener on `ctx.pane` binds it in `setup` only: the pane element itself lives as long as the modal (Summary).

### Lazy tabs

Flow, Calls and Diff render only a placeholder (`render` returns a spinner or an empty picker) and build their content the first time they are activated. They all follow the same pattern:

1. `setup` and `onLogChange` call an `arm(ctx)` function that bumps a generation token in `ctx.state`, creates a `build` closure bound to the current log (with its own "already built" flag) and stores it in `ctx.state.build`.
2. `onActivate` calls `ctx.state.build()`. The flag makes later activations no-ops.
3. If the tab **is already active** when `arm` runs (the user navigates prev/next while on Flow), `arm` builds right away. A log change never fires a click on the tab button, so without this the spinner would spin forever (the 1.6.1 fix).
4. After every `await`, the build compares the token with `ctx.state.generation` and stops if it changed: the user went to another log, or closed the modal, while the build was running. If it had already created a view, it destroys it, so its `window` listeners don't leak.
5. `onLogChange` destroys the previous view (`ctx.state.view`) before re-arming. `destroy` bumps the token and destroys the view.
6. On failure the build resets its "built" flag (so the next activation retries) and, unless it is stale, renders `renderErrorState(...)`.

## The `ctx` object

The shell creates one context per tab when the modal opens. The same object is passed to every hook of that tab until the modal closes.

| Field | Description |
|-------|-------------|
| `tab` | The registered definition |
| `modal` | The `.sf-log-modal` element |
| `pane` | The tab's `#tab-<id>` element (the same element for the whole modal life). `null` during the first `render` |
| `button` | The tab's `.sf-tab-btn` in the tab bar. `null` during the first `render` |
| `parsedLog` | Parsed log currently shown (`metadata`, `lines`, `stats`, `rawContent`). Replaced on log navigation |
| `summary` | `parser.getSummary(parsedLog)` for that log |
| `antiPatternResults` | `antiPatternDetector.analyze(parsedLog)`, or `null` if the analysis failed |
| `state` | Empty object, private to the tab, kept across log navigation, dropped on close. Views, generation tokens, pending requests go here, never on the DOM elements |
| `isActive()` | `true` if this tab is the selected one |
| `openTab(id)` | Selects another tab by clicking its button |
| `showToast(message, type)` | Toast at the bottom of the page; `type` is `'success'` (default), `'error'`, `'warning'` or `'info'` |
| `showInFlow(spec)` | Opens the Flow tab on a node: `{ lines: [lineIndex, ...] }`, `{ group: 'soql' \| 'dml' }` or `{ method: 'Class.method' }` |
| `showPatternInAnalysis(index)` | Opens the Analysis tab and flashes `antiPatternResults.patterns[index]` |
| `scrollToLogLine(lineIndex)` | Opens the Raw Log tab and highlights a raw line (`line.index` of a parsed line) |

Because `ctx` is reused, `ctx.parsedLog` changes under a running async build. Read it into a local constant before the first `await` (all lazy tabs do `const parsedLog = ctx.parsedLog;` in `arm`).

Static helpers are not on `ctx`. Like every other FoxLog module, a tab reads them from `window.FoxLog` at load time: `window.FoxLog.i18n`, `window.FoxLog.logger`, `window.FoxLog.icon()`, `window.FoxLog.dot()`, `window.FoxLog.formatDuration()`, and `window.FoxLog.modalTabUtils`:

| Helper | Description |
|--------|-------------|
| `escapeHtml(text)` | Same as `window.FoxLog.escapeHtml`. Escape every log-derived string you put in HTML |
| `formatBytes(n)` | `812 B`, `12.4 KB`, `1.2 MB` |
| `getStatusTone(status)` | `'success'`, `'neutral'` or `'danger'` for a log status |
| `generateFilename(parsedLog, ext)` | `foxlog_<operation>_<date>.<ext>` |
| `downloadFile(blob, filename)` | Saves a Blob through a temporary link |
| `renderLoading(text, subtext?)` | The spinner block used by the lazy tabs |
| `renderErrorState(message, detail)` | The red "Error" block shown when a build fails |

## Cross-tab navigation

The shell keeps the helpers that move the user from one tab to another: `showInFlow`, `showPatternInAnalysis` and `scrollToLogLine` (also triggered by the `foxlog:scrollToLine` event that `CallGraphView` and `CallTreeView` dispatch). They select the target tab by **clicking its button**, so the switch goes through the same code as a user click (including `onActivate` and the document-level listeners that close open menus). Then they ask the target tab to do its part through `_callTab(tabId, methodName, ...args)`, which calls `definition[methodName](ctx, ...args)` and does nothing if the tab isn't registered:

```js
showInFlow(spec) {
  const graphBtn = this.currentModal && this.currentModal.querySelector('[data-tab="graph"]');
  if (!graphBtn) return;
  this._callTab('graph', 'queueJump', spec);   // remembered in ctx.state.pendingJump
  graphBtn.click();                            // onActivate -> lazy build -> applies the jump when ready
  this._callTab('graph', 'flushPendingJump');  // applies it now if the graph already exists
}
```

To let other tabs (or the panel) open your tab on something, add a method to your definition, then a public helper on the shell that clicks your button and calls it, and expose it on `ctx` in `_createTabContexts` if tabs need it.

## Load order

Content scripts run in the order of the `js` list, and the lists of `manifest.json` (Chrome) and `manifest.firefox.json` (Firefox) must stay identical. The constraints:

1. `src/core/constants.js`, `src/core/icons.js` and `src/core/logger.js` first (already the case): `tab-utils.js` copies `window.FoxLog.escapeHtml` and every module reads `i18n` at load.
2. `tab-registry.js` and `tab-utils.js` before any tab module: tab modules call `modalTabs.register()` and read `modalTabUtils` when they load.
3. Tab modules in any order: the tab bar is sorted by `order`, not by load order. `analysis-export.js` is listed before `analysis-tab.js` for readability only; the tab reads `window.FoxLog.analysisExporter` when an export is clicked.
4. `modal-manager.js` after the tab modules. The shell only reads the registry when a log is opened, so this is not strictly required, but it keeps "everything the shell uses is already loaded" true.

```json
"src/ui/log-diff-view.js",
"src/ui/modal-tabs/tab-registry.js",
"src/ui/modal-tabs/tab-utils.js",
"src/ui/modal-tabs/summary-tab.js",
"src/ui/modal-tabs/analysis-export.js",
"src/ui/modal-tabs/analysis-tab.js",
"src/ui/modal-tabs/graph-tab.js",
"src/ui/modal-tabs/calls-tab.js",
"src/ui/modal-tabs/raw-tab.js",
"src/ui/modal-tabs/diff-tab.js",
"src/ui/modal-manager.js",
```

A file missing from a manifest doesn't raise an error: its tab is simply not in the bar.

**UI preview harness** (`tests/ui-preview/`): `index.html` loads the content scripts listed in `manifest.json` (read by `mock-chrome.js`), in order. There is no separate list to update. Check a new tab with `node tests/ui-preview/server.js` and `http://foxlog.lightning.force.com.localhost:8123/?open=modal&log=0&tab=<id>`.

**Firefox package**: `scripts/build-firefox-xpi.sh` copies the whole `src/` folder, so `src/ui/modal-tabs/` is included without changes.

## How to add a new tab

This walks through a "Database" tab that lists the SOQL queries and DML statements of the log, each linking to its line in the Raw Log tab.

### 1. Write the module

Create `src/ui/modal-tabs/database-tab.js`:

```js
// src/ui/modal-tabs/database-tab.js
// Database tab: every SOQL query and DML statement of the log, with a link to its line.
(function() {
  'use strict';

  window.FoxLog = window.FoxLog || {};
  const i18n = window.FoxLog.i18n || {};
  const logger = window.FoxLog.logger || console;
  const { escapeHtml } = window.FoxLog.modalTabUtils;

  const DATABASE_EVENTS = ['SOQL_EXECUTE_BEGIN', 'DML_BEGIN'];

  /**
   * @param {Object} ctx - Tab context
   * @returns {string} HTML of the Database pane
   */
  function renderDatabaseTab(ctx) {
    const statements = ctx.parsedLog.lines.filter(line => DATABASE_EVENTS.includes(line.type));

    if (statements.length === 0) {
      return `
        <div class="sf-empty-state">
          <p>${i18n.databaseEmpty || 'No SOQL or DML in this log'}</p>
        </div>
      `;
    }

    const rows = statements.map(line => `
      <button type="button" class="sf-db-row" data-line="${line.index}" title="${escapeHtml(i18n.viewInLog || 'View in log')}">
        <span class="sf-db-type">${line.type === 'DML_BEGIN' ? 'DML' : 'SOQL'}</span>
        <code class="sf-db-text">${escapeHtml(line.content)}</code>
        <span class="sf-db-line">L${line.index + 1}</span>
      </button>
    `).join('');

    return `<div class="sf-db-container">${rows}</div>`;
  }

  /**
   * One delegated listener on the pane: it survives the re-render on log navigation.
   * @param {Object} ctx - Tab context
   */
  function setupDatabaseTab(ctx) {
    ctx.pane.addEventListener('click', (e) => {
      const row = e.target.closest('.sf-db-row');
      if (row) ctx.scrollToLogLine(parseInt(row.dataset.line, 10));
    });
  }

  window.FoxLog.modalTabs.register({
    id: 'database',
    order: 45,                 // between Calls (40) and Raw Log (50)
    icon: 'database',
    label: () => i18n.databaseTab || 'Database',
    badge: (ctx) => {
      const { soqlQueries, dmlStatements } = ctx.parsedLog.stats.limits;
      return `<span class="sf-tab-badge sf-badge-info">${soqlQueries + dmlStatements}</span>`;
    },
    render: renderDatabaseTab,
    setup: setupDatabaseTab
  });

  logger.log('[FoxLog] Database tab loaded');
})();
```

That's a complete tab: it renders on open and on every log change, and its listener is bound once.

### 2. Make it lazy (only if building it is expensive)

If the content needs the call tree, a worker, or a big DOM, render a placeholder and build on activation, following [Lazy tabs](#lazy-tabs). Skeleton (see `calls-tab.js` for a complete one):

```js
  const { renderLoading, renderErrorState } = window.FoxLog.modalTabUtils;

  function destroyView(state) {
    if (state.view) {
      state.view.destroy();
      state.view = null;
    }
  }

  function arm(ctx) {
    const { state, pane } = ctx;
    const parsedLog = ctx.parsedLog;                     // read before any await
    const generation = (state.generation || 0) + 1;
    state.generation = generation;
    let built = false;

    state.build = async () => {
      if (built) return;
      built = true;                                      // before the first await

      try {
        pane.innerHTML = renderLoading(i18n.databaseLoading || 'Loading...');
        const tree = await window.FoxLog.callTreeBuilder.buildTree(parsedLog);
        if (state.generation !== generation) return;     // another log, or modal closed

        pane.innerHTML = '<div class="sf-db-container"></div>';
        const view = new DatabaseView(pane.firstElementChild, tree, parsedLog);
        destroyView(state);
        state.view = view;
      } catch (error) {
        built = false;                                   // retry on next activation
        logger.error('Failed to build the Database tab', error);
        if (state.generation !== generation) return;
        pane.innerHTML = renderErrorState(i18n.databaseError || 'Unable to build the Database tab', error.message);
      }
    };

    if (ctx.isActive()) state.build();                   // log changed while on this tab
  }

  window.FoxLog.modalTabs.register({
    id: 'database',
    order: 45,
    icon: 'database',
    label: () => i18n.databaseTab || 'Database',
    render: () => renderLoading(i18n.databaseLoading || 'Loading...'),
    setup: arm,
    onActivate: (ctx) => { if (ctx.state.build) ctx.state.build(); },
    onLogChange: (ctx) => { destroyView(ctx.state); arm(ctx); },
    destroy: (ctx) => {
      ctx.state.generation = (ctx.state.generation || 0) + 1;
      destroyView(ctx.state);
    }
  });
```

### 3. List it in both manifests

Add `"src/ui/modal-tabs/database-tab.js",` to the `content_scripts[0].js` list of **both** `manifest.json` and `manifest.firefox.json`, after `tab-utils.js` and before `src/ui/modal-manager.js` (see [Load order](#load-order)).

### 4. Add the translations

In the `window.FoxLog.i18n` object of `src/core/constants.js`, add every key the tab reads, in French and English, next to the other modal keys:

```js
    databaseTab: isFrench ? 'Base de données' : 'Database',
    databaseEmpty: isFrench ? 'Aucune requête SOQL ni DML dans ce log' : 'No SOQL or DML in this log',
```

Always keep an English fallback in the code (`i18n.databaseTab || 'Database'`), as the other tabs do.

### 5. Icon and styles

- The icon must exist in `PATHS` in `src/core/icons.js`. `database` already does; add a new path (24×24, stroke-based, Feather style) if you need another one.
- Styles go in `src/modal-styles.css`, prefixed `sf-` and using the design tokens (`var(--fl-...)`, see [docs/ui-design-system.md](../ui-design-system.md)). The pane already gets `.sf-tab-content` (padding, scroll); use `paneClass: 'sf-tab-content--flush'` for a full-bleed view.

### 6. Check it

- `node --check src/ui/modal-tabs/database-tab.js`
- `node tests/ui-preview/server.js`, then open `http://foxlog.lightning.force.com.localhost:8123/?open=modal&log=0&tab=database`: the tab is in the bar at the right place, its content renders, the browser console is clean.
- Navigate prev/next while on the tab, close and reopen the modal, and switch to the tab after navigating: the content must follow the log shown.
- Load the unpacked extension in Chrome and the `.xpi` in Firefox on a real org.

### Checklist

- [ ] `src/ui/modal-tabs/<id>-tab.js` registers `{ id, order, icon, label, render }` plus the hooks it needs
- [ ] Listed in `manifest.json` **and** `manifest.firefox.json`, before `src/ui/modal-manager.js`
- [ ] i18n keys in French and English in `src/core/constants.js`
- [ ] Icon present in `src/core/icons.js`
- [ ] Styles in `src/modal-styles.css` with `--fl-` tokens, checked in light and dark mode
- [ ] Every log-derived string goes through `escapeHtml`
- [ ] Listeners: delegated on `ctx.pane` in `setup`, or re-bound in `onLogChange` if bound to rendered elements
- [ ] Views and `window`/`document` listeners released in `destroy` (and in `onLogChange` for per-log views)
- [ ] Preview harness checked (`?open=modal&tab=<id>`), console clean
- [ ] `CHANGELOG.md` entry under `## [Unreleased]`

## Pitfalls

- **Don't store state on DOM elements** (`modal._foo`, `button._handler`): use `ctx.state`. The shell already handles listeners on the tab button.
- **Don't add click listeners to your tab button**: use `onActivate`. It runs after the tab is shown, for clicks, keyboard selection and cross-tab jumps alike.
- **`render` must not have side effects**: it runs while the modal is being built, before `ctx.pane` exists, and again on every log change.
- **Query inside `ctx.pane`**, not `document` or `ctx.modal`: other tabs may use the same class names.
- **Async work outlives the log**: keep the generation check after every `await`, and capture `ctx.parsedLog` before the first one.
- **A hook that throws stops the hooks after it** (the shell doesn't catch errors, so the bug is visible in the console). Catch errors yourself around work that can fail, like the lazy tabs do.

## Code moved by the split

For branches that changed `modal-manager.js` before the split, here is where each piece went:

| Before (in `ModalManager`) | Now |
|----------------------------|-----|
| Header markup, `_renderModalTitle`, `_renderNavigationButtons`, navigation methods, `close`, `_createModal`, `_attachModal`, `_showToast`, `_setupTabs`, `scrollToLogLine`, `showInFlow`, `showPatternInAnalysis` | Still in `modal-manager.js` (`_attachModal` no longer calls the Summary/Analysis setup; `close` calls each tab's `destroy`) |
| Tab bar buttons and panes written out in `showParsedLog` | Generated from the registry by `_renderTabButton` / `_renderTabPane` in `modal-manager.js` |
| `_getStatusTone`, `_escapeHtml`, `_formatBytes`, `_generateFilename`, `_downloadFile` | `modalTabUtils` in `tab-utils.js` (the shell keeps `_getStatusTone` and `_escapeHtml` as one-line wrappers) |
| `LIMIT_WARNING_PCT`, `LIMIT_DANGER_PCT`, `_renderSummaryTab` and the `_render*Section` / `_renderVerdictBanner` / `_renderLimitBar` / `_groupErrors` helpers, `_setupSummaryInteractions`, `_toggleSummarySection`, `_loadSectionPrefs`, `_saveSectionPrefs`, `_copyErrorMessage` | `summary-tab.js` |
| `_renderAnalysisTab`, `_renderAnalysisBadge`, `_renderPatternGroup`, `_renderPatternItem`, `_setupAntiPatternLineButtons`, `_setupExportAnalysisButtons`, the pattern flash of `showPatternInAnalysis` | `analysis-tab.js` (`flashPattern`) |
| `_loadLogoAssets`, `_blobToBase64`, `_exportAnalysisPdf/Md/Txt`, `_exportPdfViaIframe`, `_generatePdfHtml`, `_generateMdContent`, `_generateTxtContent`, `_formatPattern*`, `_renderPdfPatternItem` | `analysis-export.js` (`AnalysisExporter`: `exportPdf`, `exportMarkdown`, `exportText`, `generatePdfHtml`, `generateMarkdown`, `generateText`) |
| `_setupGraphTab`, `_flushPendingFlowJump`, `modal._foxlogGraphView/_foxlogGraphGeneration/_foxlogPendingFlowJump` | `graph-tab.js` (`ctx.state.view/generation/pendingJump`, `queueJump`, `flushPendingJump`) |
| `_setupCallsTab`, `modal._foxlogCallsView/_foxlogCallsGeneration` | `calls-tab.js` |
| `_renderRawTab`, `_setupExportButtons`, `_exportRawLog`, `_copyToClipboard` | `raw-tab.js` |
| `_setupDiffTab`, `_populateDiffImportSelect`, `_handleDiffImport`, `_parseImportedLog`, `_runDiff`, `_runDiffWorker`, `modal._foxlogDiffView/_foxlogDiffRun` | `diff-tab.js` (the diff worker is created in `runDiffWorker`) |
