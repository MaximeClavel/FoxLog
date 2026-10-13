// src/ui/modal-tabs/calls-tab.js
// Calls tab: hierarchical call tree (CallTreeView). Built lazily on the first
// activation, rebuilt on prev/next navigation while it is the active tab.
(function() {
  'use strict';

  window.FoxLog = window.FoxLog || {};
  const i18n = window.FoxLog.i18n || {};
  const logger = window.FoxLog.logger || console;
  const { renderLoading, renderErrorState } = window.FoxLog.modalTabUtils;

  /**
   * Destroy the call tree view of the previous log, if any
   * @private
   */
  function destroyView(state) {
    if (state.view) {
      state.view.destroy();
      state.view = null;
    }
  }

  /**
   * Prepare the lazy build of the call tree for the log in ctx: the tree is
   * built on the next activation, or right away if the tab is already active.
   * @private
   */
  function armCallTreeBuild(ctx) {
    const { callTreeBuilder, CallTreeView } = window.FoxLog;

    if (!callTreeBuilder || !CallTreeView) {
      logger.warn('[CallsTab] CallTree components not available');
      return;
    }

    const { state, pane } = ctx;
    const parsedLog = ctx.parsedLog;

    // Bump the generation token so a stale build from a previous log
    // navigation can detect it's no longer current and bail out instead of
    // clobbering this log's content (same DOM node is reused across logs).
    const generation = (state.generation || 0) + 1;
    state.generation = generation;

    let callTreeBuilt = false;

    const buildCallTree = async () => {
      if (callTreeBuilt) return; // Already built
      callTreeBuilt = true; // set before the first await to avoid re-entrant double-build

      try {
        // Afficher le loading
        pane.innerHTML = renderLoading(
          i18n.buildingCallTree || 'Building call tree...',
          `${(i18n.analyzing || 'Analyzing')} ${parsedLog.lines.length} ${(i18n.lines || 'Lines').toLowerCase()}`
        );

        // Construire l'arbre (via Web Worker)
        const callTree = await callTreeBuilder.buildTree(parsedLog);
        if (state.generation !== generation) return; // stale: navigated to another log meanwhile

        // Create the view
        pane.innerHTML = '<div class="sf-call-tree-container"></div>';
        const container = pane.querySelector('.sf-call-tree-container');

        const callTreeView = new CallTreeView(container, callTree, parsedLog);
        callTreeView.init();

        if (state.generation !== generation) {
          callTreeView.destroy();
          return;
        }

        destroyView(state);
        state.view = callTreeView;

        logger.success('CallTree view initialized');
      } catch (error) {
        callTreeBuilt = false; // allow a retry on the next click/navigation
        logger.error('Failed to build call tree', error);
        if (state.generation !== generation) return; // stale error, another build is in charge now

        pane.innerHTML = renderErrorState(i18n.callTreeError || 'Unable to build the call tree', error.message);
      }
    };

    // The tab button persists across log navigation: onActivate always calls
    // the build bound to the log currently shown.
    state.build = buildCallTree;

    // Navigating to the previous/next log while the Calls tab is already
    // active resets its content but never re-fires a click on the tab
    // button, so nothing would otherwise trigger the rebuild — build now.
    if (ctx.isActive()) {
      buildCallTree();
    }
  }

  window.FoxLog.modalTabs.register({
    id: 'calls',
    order: 40,
    icon: 'list',
    label: () => i18n.calls || 'Calls',
    paneClass: 'sf-tab-content--flush',

    render() {
      return renderLoading(i18n.buildingCallTree || 'Building call tree...');
    },

    setup: armCallTreeBuild,

    onActivate(ctx) {
      if (ctx.state.build) ctx.state.build();
    },

    // The shell already put the spinner back: drop the old tree, build for the new log
    onLogChange(ctx) {
      destroyView(ctx.state);
      armCallTreeBuild(ctx);
    },

    // Bump the generation so a build still in flight sees itself as stale
    // once it resumes, instead of attaching a view to a closed modal.
    destroy(ctx) {
      ctx.state.generation = (ctx.state.generation || 0) + 1;
      destroyView(ctx.state);
    }
  });

  logger.log('[FoxLog] Calls tab loaded');
})();
