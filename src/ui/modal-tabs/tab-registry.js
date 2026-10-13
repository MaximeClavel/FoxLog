// src/ui/modal-tabs/tab-registry.js
// Registry of the log modal's tabs. Each tab module registers itself here at
// load time; ModalManager reads the list when it opens a parsed log.
// See docs/tech-solution/modal-tabs.md for the tab contract.
(function() {
  'use strict';

  window.FoxLog = window.FoxLog || {};
  const logger = window.FoxLog.logger || console;

  // Used as `data-tab` and in the pane id (`tab-<id>`), so it must be a safe selector fragment
  const TAB_ID_PATTERN = /^[a-z][a-z0-9-]*$/;

  const tabs = new Map();

  window.FoxLog.modalTabs = {
    /**
     * Register a modal tab. Throws on an invalid or duplicate definition.
     * @param {Object} definition - Tab definition
     * @param {string} definition.id - `data-tab` value; the pane gets the id `tab-<id>`
     * @param {number} definition.order - Position in the tab bar (lowest first; the first tab opens active)
     * @param {string} definition.icon - Icon name for window.FoxLog.icon()
     * @param {string|Function} definition.label - Tab label, or a function returning it
     * @param {Function} definition.render - render(ctx) => HTML of the pane for ctx.parsedLog
     * @param {string} [definition.paneClass] - Extra class on the pane (e.g. 'sf-tab-content--flush')
     * @param {Function} [definition.badge] - badge(ctx) => HTML appended to the tab label
     * @param {Function} [definition.setup] - setup(ctx), once after the modal opened
     * @param {Function} [definition.onActivate] - onActivate(ctx), each time the tab is selected
     * @param {Function} [definition.onLogChange] - onLogChange(ctx), after the pane was re-rendered for another log
     * @param {Function} [definition.destroy] - destroy(ctx), when the modal closes
     */
    register(definition) {
      if (!definition || typeof definition.id !== 'string' || !TAB_ID_PATTERN.test(definition.id)) {
        throw new Error(`[ModalTabs] Invalid tab id: ${definition && definition.id}`);
      }
      if (!Number.isFinite(definition.order) || !definition.icon || !definition.label) {
        throw new Error(`[ModalTabs] Tab "${definition.id}" needs an order, an icon and a label`);
      }
      if (typeof definition.render !== 'function') {
        throw new Error(`[ModalTabs] Tab "${definition.id}" has no render(ctx) function`);
      }
      if (tabs.has(definition.id)) {
        throw new Error(`[ModalTabs] Tab "${definition.id}" is already registered`);
      }

      tabs.set(definition.id, Object.freeze({ ...definition }));
      logger.log(`[ModalTabs] Tab "${definition.id}" registered`);
    },

    /**
     * @param {string} id - Tab id
     * @returns {Object|undefined} The registered tab definition
     */
    get(id) {
      return tabs.get(id);
    },

    /**
     * @returns {Object[]} Every registered tab, in tab bar order
     */
    list() {
      // Array.prototype.sort is stable: equal orders keep their registration order
      return [...tabs.values()].sort((a, b) => a.order - b.order);
    }
  };

  logger.log('[FoxLog] Modal tab registry loaded');
})();
