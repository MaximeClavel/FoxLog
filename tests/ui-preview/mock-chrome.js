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
    badgeCalls: []
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
  const backgroundChrome = {
    runtime: {
      lastError: undefined,
      onMessage: { addListener: (listener) => backgroundListeners.push(listener) }
    },
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

  window.chrome = {
    runtime: {
      getManifest: () => manifest,
      getURL: (assetPath) => (assetPath === 'src/injected.js'
        ? '/tests/ui-preview/injected-stub.js'
        : `/${assetPath}`),
      onMessage: { addListener() {} },
      sendMessage,
      lastError: undefined
    },
    storage: {
      local: storageArea,
      onChanged: { addListener: (listener) => storageListeners.push(listener) }
    }
  };
})();
