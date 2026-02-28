/**
 * Egnyte Yoda - service worker / CORS proxy
 * Version: 1.8.2
 *
 * v1.8.2 - All fetch handlers read API base URL from chrome.storage.local
 * v1.7.0 - Added FETCH_EXPLORE_PLANS and FETCH_TRIAL_ITEMS message handlers
 * v1.6.0 - FETCH_DOMAIN handler for domain detail endpoint
 */

// background.js
// Handles fetch requests from popup to bypass CORS restrictions.
// The API base URL is stored in chrome.storage.local under 'api-base-url' by the user
// during first-run setup, so it never needs to be hardcoded here.

async function getApiBase() {
  return new Promise(function(resolve) {
    chrome.storage.local.get('api-base-url', function(result) {
      var base = result['api-base-url'];
      resolve((base && base !== 'demo') ? base.replace(/\/+$/, '') : null);
    });
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'FETCH_DOMAIN') {
    const { domain } = message;
    getApiBase().then(function(base) {
      if (!base) { sendResponse({ ok: false, status: 0, error: 'No API base URL configured' }); return; }
      const url = `${base}/domain/detail/?domain=${encodeURIComponent(domain)}`;
      fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' }, credentials: 'include' })
        .then(res => { if (!res.ok) { const s = res.status; return res.text().then(() => sendResponse({ ok: false, status: s, error: `HTTP ${s}` })); } return res.json(); })
        .then(data => { if (data !== undefined) sendResponse({ ok: true, data }); })
        .catch(err => sendResponse({ ok: false, status: 0, error: err.message }));
    });
    return true;
  }

  if (message.type === 'FETCH_EXPLORE_PLANS') {
    const { domain } = message;
    getApiBase().then(function(base) {
      if (!base) { sendResponse({ ok: false, status: 0, error: 'No API base URL configured' }); return; }
      const url = `${base}/domain/explore_plans/${encodeURIComponent(domain)}`;
      fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' }, credentials: 'include' })
        .then(res => { if (!res.ok) { const s = res.status; return res.text().then(() => sendResponse({ ok: false, status: s, error: `HTTP ${s}` })); } return res.json(); })
        .then(data => { if (data !== undefined) sendResponse({ ok: true, data }); })
        .catch(err => sendResponse({ ok: false, status: 0, error: err.message }));
    });
    return true;
  }

  if (message.type === 'FETCH_TRIAL_ITEMS') {
    const { domain } = message;
    getApiBase().then(function(base) {
      if (!base) { sendResponse({ ok: false, status: 0, error: 'No API base URL configured' }); return; }
      const url = `${base}/domain/trial_items/${encodeURIComponent(domain)}`;
      fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' }, credentials: 'include' })
        .then(res => { if (!res.ok) { const s = res.status; return res.text().then(() => sendResponse({ ok: false, status: s, error: `HTTP ${s}` })); } return res.json(); })
        .then(data => { if (data !== undefined) sendResponse({ ok: true, data }); })
        .catch(err => sendResponse({ ok: false, status: 0, error: err.message }));
    });
    return true;
  }

  if (message.type === 'FETCH_SETTINGS') {
    const { domain } = message;
    getApiBase().then(function(base) {
      if (!base) { sendResponse({ ok: false, status: 0, error: 'No API base URL configured' }); return; }
      const url = `${base}/settings_dashboard/context/domain/context_value/${encodeURIComponent(domain)}/key/?domain=${encodeURIComponent(domain)}&hierarchy_type=all`;
      fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' }, credentials: 'include' })
        .then(res => { if (!res.ok) { const s = res.status; return res.text().then(() => sendResponse({ ok: false, status: s, error: `HTTP ${s}` })); } return res.json(); })
        .then(data => { if (data !== undefined) sendResponse({ ok: true, data }); })
        .catch(err => sendResponse({ ok: false, status: 0, error: err.message }));
    });
    return true;
  }
});
