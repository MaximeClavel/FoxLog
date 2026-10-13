// Minimal `chrome.*` stand-in so the real content scripts can run in a plain page.
(function() {
  'use strict';

  const STORAGE_PREFIX = 'foxlog-preview:';
  const PREVIEW_TAB_ID = 1;

  function readFile(path) {
    const request = new XMLHttpRequest();
    request.open('GET', path, false);
    request.send();
    return request.responseText;
  }

  function readStorage(key) {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    return raw === null ? undefined : JSON.parse(raw);
  }

  const storageListeners = [];
  function notifyStorage(changes) {
    if (Object.keys(changes).length === 0) return;
    setTimeout(() => storageListeners.forEach((listener) => listener(changes, 'local')));
  }

  const storageArea = {
    get(keys, callback) {
      const wanted = Array.isArray(keys) ? keys : [keys];
      const result = {};
      wanted.forEach((key) => {
        const value = readStorage(key);
        if (value !== undefined) result[key] = value;
      });
      callback(result);
    },
    set(items, callback) {
      const changes = {};
      Object.entries(items).forEach(([key, value]) => {
        changes[key] = { oldValue: readStorage(key), newValue: value };
        localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
      });
      notifyStorage(changes);
      if (callback) callback();
    },
    remove(keys, callback) {
      const changes = {};
      (Array.isArray(keys) ? keys : [keys]).forEach((key) => {
        changes[key] = { oldValue: readStorage(key) };
        localStorage.removeItem(STORAGE_PREFIX + key);
      });
      notifyStorage(changes);
      if (callback) callback();
    }
  };

  // What the preview records for checks (e.g. from Playwright): runtime messages sent by the
  // content scripts, and the toolbar badge the real background script sets in response
  const recorder = {
    messages: [],
    badge: { text: '', color: null, textColor: null },
    badgeCalls: [],
    // Tabs the background would have opened ("Open in a new tab")
    openedTabs: []
  };
  window.FoxLogPreviewChrome = recorder;

  // The real src/background.js runs against its own chrome stand-in, so a content script's
  // runtime message goes through the actual handler, as it would in the extension
  const backgroundListeners = [];
  const recordBadge = (method, property) => (details, callback) => {
    recorder.badgeCalls.push({ method, ...details });
    recorder.badge[property] = details.text !== undefined ? details.text : details.color;
    if (callback) callback();
  };
  // storage.session of the background: in memory, so logs handed to the viewer don't fill localStorage
  const sessionItems = new Map();
  const sessionArea = {
    get(keys, callback) {
      const result = {};
      (Array.isArray(keys) ? keys : [keys]).forEach((key) => {
        if (sessionItems.has(key)) result[key] = sessionItems.get(key);
      });
      callback(result);
    },
    set(items, callback) {
      Object.entries(items).forEach(([key, value]) => sessionItems.set(key, value));
      if (callback) callback();
    },
    remove(keys, callback) {
      (Array.isArray(keys) ? keys : [keys]).forEach((key) => sessionItems.delete(key));
      if (callback) callback();
    }
  };
  let nextTabId = PREVIEW_TAB_ID + 1;
  const backgroundChrome = {
    runtime: {
      lastError: undefined,
      getURL: (assetPath) => `/${assetPath}`,
      onMessage: { addListener: (listener) => backgroundListeners.push(listener) },
      onStartup: { addListener() {} }
    },
    tabs: {
      create: (properties, callback) => {
        recorder.openedTabs.push(properties);
        callback({ id: nextTabId++ });
      },
      // No tab survives a preview reload: the viewer sweep drops what it finds
      get: (tabId, callback) => {
        backgroundChrome.runtime.lastError = { message: `No tab with id: ${tabId}` };
        callback(undefined);
        backgroundChrome.runtime.lastError = undefined;
      },
      onRemoved: { addListener() {} }
    },
    storage: { local: storageArea, session: sessionArea },
    action: {
      setBadgeText: recordBadge('setBadgeText', 'text'),
      setBadgeBackgroundColor: recordBadge('setBadgeBackgroundColor', 'color'),
      setBadgeTextColor: recordBadge('setBadgeTextColor', 'textColor')
    },
    cookies: {
      get: (details, callback) => callback(null),
      getAll: (details, callback) => callback([])
    }
  };
  new Function('chrome', readFile('/src/background.js'))(backgroundChrome);

  function sendMessage(message, callback) {
    recorder.messages.push(message);
    const reply = new Promise((resolve) => {
      setTimeout(() => {
        const sender = { tab: { id: PREVIEW_TAB_ID } };
        let answered = false;
        const sendResponse = (response) => {
          if (answered) return;
          answered = true;
          resolve(response);
        };
        backgroundListeners.forEach((listener) => listener(message, sender, sendResponse));
        if (!answered) resolve(undefined);
      });
    });
    if (callback) {
      reply.then(callback);
      return undefined;
    }
    return reply;
  }

  const manifest = JSON.parse(readFile('/manifest.json'));
  localStorage.removeItem(STORAGE_PREFIX + 'buttonPosition');

  // No background here: messages are recorded (inspect chrome.runtime.sentMessages)
  // and answered as a successful background would.
  const sentMessages = [];

  window.chrome = {
    runtime: {
      getManifest: () => manifest,
      getURL: (assetPath) => (assetPath === 'src/injected.js'
        ? '/tests/ui-preview/injected-stub.js'
        : `/${assetPath}`),
      onMessage: { addListener() {} },
      // Every message a content script sent (also on window.FoxLogPreviewChrome.messages)
      sentMessages: recorder.messages,
      sendMessage,
      lastError: undefined
    },
    storage: {
      local: storageArea,
      onChanged: { addListener: (listener) => storageListeners.push(listener) }
    }
  };
})();
