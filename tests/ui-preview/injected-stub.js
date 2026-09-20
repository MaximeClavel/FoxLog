// Replaces src/injected.js in the preview: answers the content script's user-id request.
window.addEventListener('foxlog_request_userid', () => {
  window.dispatchEvent(new CustomEvent('foxlog_userid_response', {
    detail: { userId: window.FOXLOG_PREVIEW_CURRENT_USER_ID }
  }));
});
