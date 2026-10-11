/**
 * Runs ONLY on the Conversa web app's /app/extension page. Lets the signed-in
 * dashboard hand a freshly minted extension token to the extension without
 * copy-paste.
 */
export {};

const pageOrigin = window.location.origin;

window.addEventListener('message', async (e) => {
  if (e.source !== window || e.origin !== pageOrigin) return;
  if (e.data?.type === 'CONVERSA_PING') {
    window.postMessage({ type: 'CONVERSA_EXTENSION_READY' }, pageOrigin);
  }
  if (e.data?.type === 'CONVERSA_CONNECT' && typeof e.data.token === 'string') {
    const r = await chrome.runtime.sendMessage({ type: 'connect', token: e.data.token });
    if (r?.ok) window.postMessage({ type: 'CONVERSA_CONNECTED' }, pageOrigin);
  }
});

window.postMessage({ type: 'CONVERSA_EXTENSION_READY' }, pageOrigin);
