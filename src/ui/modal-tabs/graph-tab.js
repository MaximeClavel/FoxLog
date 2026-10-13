// src/ui/modal-tabs/graph-tab.js
// Flow tab: visual execution graph (CallGraphView). Built lazily on the first
// activation, rebuilt on prev/next navigation while it is the active tab.
(function() {
  'use strict';

  window.FoxLog = window.FoxLog || {};
  const i18n = window.FoxLog.i18n || {};
  const logger = window.FoxLog.logger || console;
  const { renderLoading, renderErrorState } = window.FoxLog.modalTabUtils;

  /**
   * Destroy the graph view of the previous log, if any
   * @private
   */
  function destroyView(state) {
    if (state.view) {
      state.view.destroy();
      state.view = null;
    }
  }

  /**
   * Apply a pending Summary -> Flow jump if the graph view is ready.
   * @param {Object} ctx - Tab context
   */
  function flushPendingJump(ctx) {
    const { state } = ctx;
    const spec = state.pendingJump;
    const view = state.view;
    if (!spec || !view) return;

    state.pendingJump = null;
    // Called from buildGraph's try block: a failed jump must not be
    // mistaken for a failed graph build.
    try {
      view.jumpTo(spec);
    } catch (error) {
      logger.warn('[FlowTab] Could not jump to the Flow tab target', spec, error);
    }
  }

  /**
   * Prepare the lazy build of the graph for the log in ctx: the graph is built
   * on the next activation, or right away if the tab is already active.
   * @private
   */
  function armGraphBuild(ctx) {
    const { callTreeBuilder, CallGraphView } = window.FoxLog;

    if (!callTreeBuilder || !CallGraphView) {
      logger.warn('[FlowTab] CallGraph components not available');
      return;
    }

    const { state, pane } = ctx;
    const parsedLog = ctx.parsedLog;

    // Bump the generation token so a stale build from a previous log
    // navigation can detect it's no longer current and bail out instead of
    // clobbering this log's content (same DOM node is reused across logs).
    const generation = (state.generation || 0) + 1;
    state.generation = generation;

    let graphBuilt = false;

    const buildGraph = async () => {
      if (graphBuilt) return;
      graphBuilt = true; // set before the first await to avoid re-entrant double-build

      try {
        pane.innerHTML = renderLoading(
          i18n.buildingFlowGraph || 'Building graph...',
          `${(i18n.analyzing || 'Analyzing')} ${parsedLog.lines.length} ${(i18n.lines || 'Lines').toLowerCase()}`
        );

        // Reuses the same CallTree already built for the Calls tab (cached by logId)
        const callTree = await callTreeBuilder.buildTree(parsedLog);
        if (state.generation !== generation) return; // stale: navigated to another log meanwhile

        pane.innerHTML = '<div class="sf-call-graph-container"></div>';
        const container = pane.querySelector('.sf-call-graph-container');

        const graphView = new CallGraphView(container, callTree, parsedLog);
        await graphView.init();

        if (state.generation !== generation) {
          // Navigated away again while init() was still rendering: tear
          // down immediately instead of leaking its window listeners.
          graphView.destroy();
          return;
        }

        destroyView(state);
        state.view = graphView;
        flushPendingJump(ctx);

        logger.success('CallGraphView initialized');
      } catch (error) {
        graphBuilt = false; // allow a retry on the next click/navigation
        state.pendingJump = null;
        logger.error('Failed to build call graph', error);
        if (state.generation !== generation) return; // stale error, another build is in charge now

        pane.innerHTML = renderErrorState(i18n.flowGraphError || 'Unable to build the graph', error.message);
      }
    };

    // The tab button persists across log navigation: onActivate always calls
    // the build bound to the log currently shown.
    state.build = buildGraph;

    // Navigating to the previous/next log while the Flow tab is already
    // active resets its content but never re-fires a click on the tab
    // button, so nothing would otherwise trigger the rebuild — build now.
    if (ctx.isActive()) {
      buildGraph();
    }
  }

  window.FoxLog.modalTabs.register({
    id: 'graph',
    order: 30,
    icon: 'git-branch',
    label: () => i18n.flow || 'Flow',
    paneClass: 'sf-tab-content--flush',

    render() {
      return renderLoading(i18n.buildingFlowGraph || 'Building graph...');
    },

    setup: armGraphBuild,

    onActivate(ctx) {
      if (ctx.state.build) ctx.state.build();
    },

    // The shell already put the spinner back: drop the old graph, build for the new log
    onLogChange(ctx) {
      ctx.state.pendingJump = null;
      destroyView(ctx.state);
      armGraphBuild(ctx);
    },

    // Bump the generation so a build still in flight (awaiting buildTree() or
    // init()) sees itself as stale once it resumes, instead of attaching a
    // freshly built view -- with its own window listeners -- to a closed modal.
    destroy(ctx) {
      ctx.state.generation = (ctx.state.generation || 0) + 1;
      destroyView(ctx.state);
    },

    /**
     * Remember a target to show in the graph (see CallGraphView.jumpTo). The
     * graph is built lazily and asynchronously, so the jump is applied by
     * flushPendingJump() once the view exists.
     * @param {Object} ctx - Tab context
     * @param {{lines?: number[], group?: string, method?: string}} spec - Jump target
     */
    queueJump(ctx, spec) {
      ctx.state.pendingJump = spec;
    },

    flushPendingJump
  });

  logger.log('[FoxLog] Flow tab loaded');
})();
