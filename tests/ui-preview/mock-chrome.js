// Minimal `chrome.*` stand-in so the real content scripts can run in a plain page.
(function() {
  'use strict';

  const STORAGE_PREFIX = 'foxlog-preview:';

  function readManifest() {
    const request = new XMLHttpRequest();
    request.open('GET', '/manifest.json', false);
    request.send();
    return JSON.parse(request.responseText);
  }

  function readStorage(key) {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    return raw === null ? undefined : JSON.parse(raw);
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
      Object.entries(items).forEach(([key, value]) => {
        localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
      });
      if (callback) callback();
    }
  };

  const manifest = readManifest();
  localStorage.removeItem(STORAGE_PREFIX + 'buttonPosition');

  window.chrome = {
    runtime: {
      getManifest: () => manifest,
      getURL: (assetPath) => (assetPath === 'src/injected.js'
        ? '/tests/ui-preview/injected-stub.js'
        : `/${assetPath}`),
      onMessage: { addListener() {} },
      sendMessage() {}
    },
    storage: { local: storageArea }
  };
})();
