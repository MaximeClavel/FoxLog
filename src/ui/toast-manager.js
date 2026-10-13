// src/ui/toast-manager.js
(function() {
  'use strict';

  window.FoxLog = window.FoxLog || {};
  const i18n = window.FoxLog.i18n || {};
  const logger = window.FoxLog.logger || console;

  const TOAST_ICONS = {
    success: 'check-circle',
    error: 'alert-circle',
    warning: 'alert-triangle',
    info: 'info'
  };

  // Alert placement: distance from the window edges, and room kept around the launcher
  const EDGE = 16;
  const LAUNCHER_GAP = 12;
  // A docked launcher slides this far out of its edge on hover (styles.css)
  const LAUNCHER_HOVER_SLIDE = 16;
  // Leaving the alert with almost no time left would make it vanish under the pointer
  const MIN_RESUME_MS = 2000;

  /**
   * Actionable toast in the bottom-left corner (one at a time, updated in place).
   * It closes itself after its duration, paused while hovered, focused or while the tab is hidden,
   * and moves out of the way of the floating launcher when it is docked near that corner.
   */
  class AlertToast {
    /**
     * @param {Function} onRemoved - Called once the toast is dismissed
     */
    constructor(onRemoved) {
      this.onRemoved = onRemoved;
      this.onDismiss = null;
      this.dismissed = false;
      this.hovered = false;
      this.focused = false;
      this.timer = null;
      this.remaining = 0;

      this.element = document.createElement('div');
      this.element.className = 'sf-toast sf-toast-alert';
      const dismissLabel = i18n.errorAlertDismiss || 'Dismiss alert';
      this.element.innerHTML = `
        <span class="sf-toast-icon-slot"></span>
        <div class="sf-toast-body">
          <div class="sf-toast-text" role="status" aria-live="polite" aria-atomic="true">
            <p class="sf-toast-title"></p>
            <p class="sf-toast-message"></p>
          </div>
          <div class="sf-toast-actions">
            <button type="button" class="sf-toast-action"></button>
          </div>
        </div>
        <button type="button" class="sf-toast-close" aria-label="${dismissLabel}" title="${dismissLabel}">${window.FoxLog.icon('x', { size: 14 })}</button>
      `;
      this.iconSlot = this.element.querySelector('.sf-toast-icon-slot');
      this.titleEl = this.element.querySelector('.sf-toast-title');
      this.messageEl = this.element.querySelector('.sf-toast-message');
      this.actionEl = this.element.querySelector('.sf-toast-action');

      this.element.querySelector('.sf-toast-close').addEventListener('click', () => this.dismiss({ returnFocus: true }));
      this.actionEl.addEventListener('click', () => {
        const onClick = this.action?.onClick;
        this.dismiss();
        onClick?.();
      });
      this.element.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        // Keep the modal (which closes on Escape anywhere) open behind the toast
        e.stopPropagation();
        this.dismiss({ returnFocus: true });
      });
      this.element.addEventListener('mouseenter', () => { this.hovered = true; this._syncTimer(); });
      this.element.addEventListener('mouseleave', () => { this.hovered = false; this._syncTimer(); });
      this.element.addEventListener('focusin', () => { this.focused = true; this._syncTimer(); });
      this.element.addEventListener('focusout', (e) => {
        this.focused = this.element.contains(e.relatedTarget);
        this._syncTimer();
      });

      this.onVisibilityChange = () => this._syncTimer();
      this.onResize = () => this._place();
      document.addEventListener('visibilitychange', this.onVisibilityChange);
      window.addEventListener('resize', this.onResize);

      const launcher = document.getElementById('sf-foxlog-toggle');
      if (launcher) {
        this.launcherObserver = new MutationObserver(() => this._place());
        this.launcherObserver.observe(launcher, { attributes: true, attributeFilter: ['style', 'data-docked', 'data-dragging'] });
      }
    }

    /**
     * Fill (or refill) the toast and restart its countdown
     * @param {Object} content - See ToastManager.showAlert
     */
    render({ title, message, type = 'error', action = null, duration = 8000, onDismiss = null }) {
      this.action = action;
      this.onDismiss = onDismiss;
      this.element.classList.remove('sf-toast-success', 'sf-toast-error', 'sf-toast-warning', 'sf-toast-info');
      this.element.classList.add(`sf-toast-${type}`);
      this.iconSlot.innerHTML = window.FoxLog.icon(TOAST_ICONS[type] || 'info', { size: 18, className: 'sf-toast-icon' });
      this.actionEl.hidden = !action;
      this.actionEl.textContent = action?.label || '';
      if (action?.ariaLabel) {
        this.actionEl.setAttribute('aria-label', action.ariaLabel);
      } else {
        this.actionEl.removeAttribute('aria-label');
      }

      this.text = { title, message };
      const fillText = () => {
        this.titleEl.textContent = this.text.title;
        this.messageEl.textContent = this.text.message;
        this.messageEl.hidden = !this.text.message;
        this._place();
      };

      if (this.element.isConnected) {
        fillText();
      } else {
        document.body.appendChild(this.element);
        // The text goes in once the live region is on the page, so screen readers announce it
        setTimeout(() => {
          if (this.dismissed) return;
          fillText();
          this.element.classList.add('sf-toast-show');
        }, 10);
      }

      clearTimeout(this.timer);
      this.timer = null;
      this.remaining = duration;
      this._syncTimer();
    }

    /**
     * Close the toast
     * @param {{returnFocus?: boolean}} [options] - Move focus to the launcher if it was inside the toast
     */
    dismiss({ returnFocus = false } = {}) {
      if (this.dismissed) return;
      this.dismissed = true;
      clearTimeout(this.timer);
      this.launcherObserver?.disconnect();
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
      window.removeEventListener('resize', this.onResize);

      if (returnFocus && this.element.contains(document.activeElement)) {
        const launcher = document.getElementById('sf-foxlog-toggle');
        if (launcher && launcher.style.display !== 'none') {
          launcher.focus({ preventScroll: true });
        }
      }

      this.element.classList.remove('sf-toast-show');
      setTimeout(() => this.element.remove(), 300);
      this.onRemoved();
      this.onDismiss?.();
    }

    /** Run the countdown only while nobody is reading or using the toast @private */
    _syncTimer() {
      if (this.dismissed) return;
      const shouldRun = !this.hovered && !this.focused && document.visibilityState === 'visible';
      if (shouldRun && !this.timer) {
        this.timerStartedAt = Date.now();
        this.timer = setTimeout(() => this.dismiss(), this.remaining);
      } else if (!shouldRun && this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
        this.remaining = Math.max(this.remaining - (Date.now() - this.timerStartedAt), MIN_RESUME_MS);
      }
    }

    /**
     * Sit in the bottom-left corner, unless the launcher is docked there: then go beside it
     * (docked on the left edge) or above it (docked on the bottom edge)
     * @private
     */
    _place() {
      if (this.dismissed) return;
      const { style } = this.element;
      style.left = '';
      style.bottom = '';

      const launcher = this._launcherBox();
      if (!launcher) return;

      const width = this.element.offsetWidth;
      const height = this.element.offsetHeight;
      const toast = {
        left: EDGE,
        right: EDGE + width,
        top: window.innerHeight - EDGE - height,
        bottom: window.innerHeight - EDGE
      };
      const overlaps = launcher.left < toast.right + LAUNCHER_GAP && launcher.right + LAUNCHER_GAP > toast.left
        && launcher.top < toast.bottom + LAUNCHER_GAP && launcher.bottom + LAUNCHER_GAP > toast.top;
      if (!overlaps) return;

      const shiftedLeft = launcher.right + LAUNCHER_GAP;
      const raisedBottom = window.innerHeight - launcher.top + LAUNCHER_GAP;
      const canShift = shiftedLeft + width <= window.innerWidth - EDGE;
      const canRaise = raisedBottom + height <= window.innerHeight - EDGE;
      const raise = launcher.docked === 'bottom' ? (canRaise || !canShift) : !canShift;
      if (raise) {
        style.bottom = `${raisedBottom}px`;
      } else {
        style.left = `${shiftedLeft}px`;
      }
    }

    /**
     * The launcher's resting box (without its hover slide), or null when it's hidden or being dragged
     * @private
     */
    _launcherBox() {
      const launcher = document.getElementById('sf-foxlog-toggle');
      if (!launcher || launcher.style.display === 'none' || launcher.dataset.dragging === 'true') return null;

      // Inline left/top rather than getBoundingClientRect(), which includes the hover transform
      const rect = launcher.getBoundingClientRect();
      const left = parseFloat(launcher.style.left);
      const top = parseFloat(launcher.style.top);
      const box = {
        left: Number.isNaN(left) ? rect.left : left,
        top: Number.isNaN(top) ? rect.top : top,
        docked: launcher.dataset.docked || ''
      };
      box.right = box.left + launcher.offsetWidth;
      box.bottom = box.top + launcher.offsetHeight;
      if (box.docked === 'left') box.right += LAUNCHER_HOVER_SLIDE;
      if (box.docked === 'bottom') box.top -= LAUNCHER_HOVER_SLIDE;
      return box;
    }
  }

  /**
   * Page-level toasts, shared by the panel, the modal and the error alerts.
   * Plain toasts confirm an action (top right, 3 s); the alert variant is the actionable
   * card in the bottom-left corner (see AlertToast).
   */
  class ToastManager {
    constructor() {
      this.alert = null;

      // Listen for toast events from other components
      document.addEventListener('foxlog:showToast', (e) => {
        this.show(e.detail.message, e.detail.type || 'success');
      });
    }

    /**
     * Show a short confirmation in the top-right corner, replacing the previous one
     * @param {string} message
     * @param {'success'|'error'|'warning'|'info'} [type='success']
     */
    show(message, type = 'success') {
      // Only the previous confirmation: an alert on screen has its own lifetime
      const existingToast = document.querySelector('.sf-toast:not(.sf-toast-alert)');
      if (existingToast) {
        existingToast.remove();
      }

      const toast = document.createElement('div');
      toast.className = `sf-toast sf-toast-${type}`;
      toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
      toast.innerHTML = `${window.FoxLog.icon(TOAST_ICONS[type] || 'info', { size: 16, className: 'sf-toast-icon' })}<span class="sf-toast-message"></span>`;
      toast.querySelector('.sf-toast-message').textContent = message;
      document.body.appendChild(toast);

      // Animation d'apparition
      setTimeout(() => toast.classList.add('sf-toast-show'), 10);

      // Disparition automatique
      setTimeout(() => {
        toast.classList.remove('sf-toast-show');
        setTimeout(() => toast.remove(), 300);
      }, 3000);
    }

    /**
     * Show an actionable alert in the bottom-left corner, or update the one already on screen
     * @param {Object} alert
     * @param {string} alert.title - First line, in bold
     * @param {string} [alert.message] - Second line (clamped to two lines)
     * @param {'success'|'error'|'warning'|'info'} [alert.type='error']
     * @param {{label: string, ariaLabel?: string, onClick: Function}} [alert.action] - Button that closes the alert, then runs onClick
     * @param {number} [alert.duration=8000] - Time on screen, not counting while hovered, focused or hidden
     * @param {Function} [alert.onDismiss] - Called once the alert is gone, whatever closed it
     * @returns {{dismiss: Function}} Handle to close the alert
     */
    showAlert(alert) {
      if (!this.alert) {
        this.alert = new AlertToast(() => { this.alert = null; });
      }
      this.alert.render(alert);
      return this.alert;
    }
  }

  window.FoxLog.toastManager = new ToastManager();
  logger.log('[FoxLog] Toast Manager loaded');
})();
