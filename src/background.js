// src/background.js
'use strict';

// ============================================
// LOGGER LOCAL
// ============================================
const DEBUG_MODE = false; 

const logger = {
  _isEnabled() {
    return DEBUG_MODE;
  },
  
  log: (msg, data) => {
    if (!logger._isEnabled()) return;
    if (data !== null && data !== undefined && data !== '') {
      console.log(`[FoxLog BG] ${msg}`, data);
    } else {
      console.log(`[FoxLog BG] ${msg}`);
    }
  },
  
  success: (msg, data) => {
    if (!logger._isEnabled()) return;
    if (data !== null && data !== undefined && data !== '') {
      console.log(`[FoxLog BG] ✅ ${msg}`, data);
    } else {
      console.log(`[FoxLog BG] ✅ ${msg}`);
    }
  },
  
  warn: (msg, data) => {
    if (!logger._isEnabled()) return;
    if (data !== null && data !== undefined && data !== '') {
      console.warn(`[FoxLog BG] ⚠️ ${msg}`, data);
    } else {
      console.warn(`[FoxLog BG] ⚠️ ${msg}`);
    }
  },
  
  error: (msg, err) => {
    // Toujours logger les erreurs, même en production
    if (err !== null && err !== undefined && err !== '') {
      console.error(`[FoxLog BG] ❌ ${msg}`, err);
    } else {
      console.error(`[FoxLog BG] ❌ ${msg}`);
    }
  }
};

logger.log('Service worker started');

// ============================================
// CONSTANTS
// ============================================
const COOKIE_PRIORITY = [
  'my.salesforce.com',
  '.salesforce.com',
  '.force.com',
  'lightning.force.com'
];

// ============================================
// COOKIE SERVICE
// ============================================
class CookieService {
  async findSessionCookie(url) {
    logger.log('Starting cookie search', url);
    
// Try direct domain first
    const directCookie = await this._tryDirectCookie(url);
    if (directCookie) return directCookie;

// Fallback: search all cookies
    return this._tryAllCookies();
  }

  async _tryDirectCookie(url) {
    if (!url) {
      logger.warn('No URL provided');
      return null;
    }

    try {
      const hostname = new URL(url).hostname;
      const myDomain = hostname.replace('lightning.force.com', 'my.salesforce.com');
      
      logger.log(`Checking direct cookie on: ${myDomain}`);
      
      const cookie = await new Promise((resolve) => {
        chrome.cookies.get({
          url: `https://${myDomain}`,
          name: 'sid'
        }, resolve);
      });

      if (cookie && cookie.value) {
        logger.success(`Cookie found on ${myDomain}`);
        logger.log(`Cookie value: ${cookie.value.substring(0, 30)}...`);
        return cookie.value;
      }
      
      logger.log(`No cookie found on ${myDomain}`);
    } catch (error) {
      logger.error('Error checking direct cookie', error);
    }

    return null;
  }

  async _tryAllCookies() {
    logger.log('Searching all cookies...');
    
    try {
      // Get ALL cookies
      const allCookies = await new Promise((resolve) => {
        chrome.cookies.getAll({}, resolve);
      });
      
      // Filter Salesforce 'sid' cookies
      const sidCookies = allCookies.filter(c =>
        c.name === 'sid' &&
        (c.domain.includes('salesforce') || c.domain.includes('force.com'))
      );

      logger.log(`Found ${sidCookies.length} Salesforce sid cookies`);

      if (sidCookies.length === 0) {
        logger.error('No sid cookie found in any Salesforce domain');
        return null;
      }

      // Try in priority order
      for (const priority of COOKIE_PRIORITY) {
        const cookie = sidCookies.find(c => c.domain.includes(priority));
        if (cookie && cookie.value) {
          logger.success(`Cookie found on priority domain: ${cookie.domain}`);
          logger.log(`Cookie value: ${cookie.value.substring(0, 30)}...`);
          return cookie.value;
        }
      }

      // If no priority cookie, take the first available
      if (sidCookies.length > 0) {
        const fallbackCookie = sidCookies[0];
        logger.warn(`Using fallback cookie from: ${fallbackCookie.domain}`);
        logger.log(`Cookie value: ${fallbackCookie.value.substring(0, 30)}...`);
        return fallbackCookie.value;
      }

      logger.error('No valid sid cookie found');
      return null;
      
    } catch (error) {
      logger.error('Error searching cookies', error);
      return null;
    }
  }
}

// ============================================
// OPEN IN A NEW TAB: log handover to src/viewer/viewer.html
// ============================================
// The content script sends the raw log (the viewer has no Salesforce session).
// It is stored under a random key and the viewer tab reads it from ?k=<key>.
// An entry lives as long as a tab shows it, so reloading the viewer works.
// See docs/tech-solution/open-in-new-tab.md
const VIEWER_PAGE = 'src/viewer/viewer.html';
const VIEWER_ENTRY_PREFIX = 'foxlogViewer:';
// storage.local, small: { [key]: { tabIds: number[], createdAt } } -- which tabs show which entry
const VIEWER_INDEX_KEY = 'foxlogViewerIndex';
// An entry no tab ever showed (tab creation failed, viewer never loaded) is dropped after this
const VIEWER_ORPHAN_TTL_MS = 60 * 60 * 1000;
const VIEWER_KEY_PATTERN = /^[0-9a-f-]{36}$/;

/**
 * Callback-style chrome.* call wrapped in a promise: Firefox's chrome.* shim
 * doesn't return promises for every API (see CHANGELOG 1.10.0).
 */
function chromeCall(target, method, ...args) {
  return new Promise((resolve, reject) => {
    try {
      target[method](...args, (result) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) reject(new Error(lastError.message));
        else resolve(result);
      });
    } catch (error) {
      reject(error);
    }
  });
}

function storageAreas() {
  // storage.session: Chrome 102+, Firefox 115+. In memory, 10 MB quota in Chrome.
  return chrome.storage.session ? ['session', 'local'] : ['local'];
}

class ViewerHandover {
  constructor() {
    // Serializes read-modify-write cycles on the index
    this._queue = Promise.resolve();
  }

  /**
   * Store a log and open the viewer on it, next to the tab that asked.
   * @param {{rawContent: string, metadata: Object, userName: ?string, cleared: boolean, initialTab: string}} log
   * @param {chrome.runtime.MessageSender} sender
   * @returns {Promise<{ok: boolean, error?: string}>}
   */
  async open(log, sender) {
    if (!log || typeof log.rawContent !== 'string' || !log.metadata || typeof log.metadata !== 'object') {
      return { ok: false, error: 'invalid' };
    }

    const key = crypto.randomUUID();
    const createdAt = Date.now();

    // Indexed before it is stored, so the sweep can always find (and drop) it
    await this._updateIndex((index) => {
      index[key] = { tabIds: [], createdAt };
    });

    const area = await this._store(VIEWER_ENTRY_PREFIX + key, {
      rawContent: log.rawContent,
      metadata: log.metadata,
      userName: log.userName || null,
      cleared: Boolean(log.cleared),
      initialTab: log.initialTab || 'summary',
      createdAt
    });
    if (!area) {
      await this._remove([key]);
      return { ok: false, error: 'storage' };
    }

    const createProperties = { url: `${chrome.runtime.getURL(VIEWER_PAGE)}?k=${key}` };
    if (sender.tab) {
      createProperties.windowId = sender.tab.windowId;
      createProperties.index = sender.tab.index + 1;
      createProperties.openerTabId = sender.tab.id;
    }

    try {
      const tab = await chromeCall(chrome.tabs, 'create', createProperties);
      await this.attachTab(key, tab.id);
    } catch (error) {
      logger.error('Could not open the viewer tab', error);
      await this._remove([key]);
      return { ok: false, error: 'tab' };
    }

    logger.success(`Viewer opened for log ${log.metadata.Id} (storage.${area})`);
    return { ok: true };
  }

  /**
   * Record that a tab shows this entry (called on creation and by the viewer on every load,
   * which also covers a duplicated tab).
   */
  attachTab(key, tabId) {
    if (!VIEWER_KEY_PATTERN.test(key) || typeof tabId !== 'number') return Promise.resolve();
    return this._updateIndex((index) => {
      const info = index[key];
      if (info && !info.tabIds.includes(tabId)) info.tabIds.push(tabId);
    });
  }

  /** A tab was closed: drop the entries no other tab shows */
  async detachTab(tabId) {
    const released = await this._updateIndex((index) => {
      const keys = [];
      Object.entries(index).forEach(([key, info]) => {
        if (!info.tabIds.includes(tabId)) return;
        info.tabIds = info.tabIds.filter(id => id !== tabId);
        if (info.tabIds.length === 0) {
          delete index[key];
          keys.push(key);
        }
      });
      return keys;
    });
    await this._removeEntries(released);
  }

  /**
   * Drop entries whose tabs are all gone, and orphans older than VIEWER_ORPHAN_TTL_MS.
   * @param {{all?: boolean}} [options] - all: drop everything (new browser session: tab ids restart)
   */
  async sweep({ all = false } = {}) {
    const released = await this._updateIndex(async (index) => {
      const keys = [];
      for (const [key, info] of Object.entries(index)) {
        if (!all) {
          const alive = await Promise.all(info.tabIds.map(id => this._tabExists(id)));
          const liveTabIds = info.tabIds.filter((id, i) => alive[i]);
          // Just stored, its tab not created or attached yet
          const awaitingTab = info.tabIds.length === 0 && Date.now() - info.createdAt < VIEWER_ORPHAN_TTL_MS;
          if (liveTabIds.length > 0 || awaitingTab) {
            info.tabIds = liveTabIds;
            continue;
          }
        }
        delete index[key];
        keys.push(key);
      }
      return keys;
    });
    await this._removeEntries(released);
    if (released.length > 0) logger.log(`Viewer sweep released ${released.length} stored log(s)`);
  }

  /**
   * storage.session first (in memory, cleared with the browser session); storage.local
   * (unlimitedStorage) when session is missing or over quota, e.g. a log of several MB.
   * @private
   * @returns {Promise<?string>} The area used, or null if none could hold it
   */
  async _store(entryKey, entry) {
    for (const area of storageAreas()) {
      try {
        await chromeCall(chrome.storage[area], 'set', { [entryKey]: entry });
        return area;
      } catch (error) {
        logger.warn(`Could not store the log in storage.${area}`, error);
      }
    }
    return null;
  }

  /** @private */
  async _remove(keys) {
    await this._updateIndex((index) => {
      keys.forEach(key => delete index[key]);
    });
    await this._removeEntries(keys);
  }

  /** @private Entries are removed from every area: cheap, and robust to an index out of step */
  async _removeEntries(keys) {
    if (!keys || keys.length === 0) return;
    const entryKeys = keys.map(key => VIEWER_ENTRY_PREFIX + key);
    await Promise.all(storageAreas().map(area =>
      chromeCall(chrome.storage[area], 'remove', entryKeys).catch(error => {
        logger.warn(`Could not remove stored logs from storage.${area}`, error);
      })
    ));
  }

  /**
   * Run `mutate(index)` on the stored index and save it if it changed. Calls are queued.
   * @private
   */
  _updateIndex(mutate) {
    const run = this._queue.then(async () => {
      const stored = await chromeCall(chrome.storage.local, 'get', VIEWER_INDEX_KEY);
      const index = stored[VIEWER_INDEX_KEY] || {};
      const before = JSON.stringify(index);
      const result = await mutate(index);
      if (JSON.stringify(index) !== before) {
        await chromeCall(chrome.storage.local, 'set', { [VIEWER_INDEX_KEY]: index });
      }
      return result;
    });
    this._queue = run.catch(() => {});
    return run;
  }

  /** @private tabs.get needs no "tabs" permission (url/title are just left out) */
  _tabExists(tabId) {
    return chromeCall(chrome.tabs, 'get', tabId).then(() => true, () => false);
  }
}

// ============================================
// INITIALIZATION
// ============================================
const cookieService = new CookieService();
const viewerHandover = new ViewerHandover();

// Registered at top level so the event wakes the service worker / event page
chrome.tabs.onRemoved.addListener((tabId) => {
  viewerHandover.detachTab(tabId).catch(error => logger.error('Viewer cleanup failed', error));
});

chrome.runtime.onStartup.addListener(() => {
  viewerHandover.sweep({ all: true }).catch(error => logger.error('Viewer cleanup failed', error));
});

// Each time the worker starts: catches entries whose tab closed while it was asleep
viewerHandover.sweep().catch(error => logger.error('Viewer cleanup failed', error));

// ============================================
// MESSAGE LISTENER
// ============================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  logger.log(`Message received: ${request.action}`);
  
  if (request.action === 'getSessionId') {
    logger.log('Processing getSessionId request');
    
    cookieService.findSessionCookie(request.url)
      .then(sessionId => {
        if (sessionId) {
          logger.success('Session ID found, sending response');
        } else {
          logger.error('No session ID found');
        }
        sendResponse({ sessionId });
      })
      .catch(error => {
        logger.error('Error in findSessionCookie', error);
        sendResponse({ sessionId: null });
      });
    
    // IMPORTANT: return true to keep channel open (async)
    return true;
  }

  if (request.action === 'openLogInNewTab') {
    viewerHandover.open(request.log, sender)
      .then(sendResponse)
      .catch(error => {
        logger.error('Open in a new tab failed', error);
        sendResponse({ ok: false, error: 'unknown' });
      });
    return true;
  }

  // Sent by the viewer page on every load (also after a reload or a tab duplication)
  if (request.action === 'viewerAttach') {
    const tabId = sender.tab && sender.tab.id;
    viewerHandover.attachTab(request.key, tabId)
      .then(() => sendResponse({ ok: true }))
      .catch(error => {
        logger.error('Viewer attach failed', error);
        sendResponse({ ok: false });
      });
    return true;
  }

  // Other message types
  logger.warn(`Unknown message action: ${request.action}`);
  sendResponse({ error: 'Unknown action' });
});

logger.success('✅ FoxLog Background service worker initialized successfully');