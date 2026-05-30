// ═══════════════════════════════════════════════════
// NEXUS Guardian — Background Service Worker
// extension/background.js
//
// WebSocket bridge: extension ↔ Tauri (or localhost)
// Tab management for each service
// Heartbeat/pulse: detect other Guardian instances on LAN
// Handshake: connect pipelines for intent + fallback routing
// ═══════════════════════════════════════════════════

'use strict';

const WS_URL    = 'ws://localhost:7771/ws';
const HTTP_PORT = 7771;

// ── State (extension service worker memory) ──────
let ws          = null;
let wsReady     = false;
let pendingQueue = [];
let activeTabs   = {}; // service → tabId
let heartbeatInterval = null;
let peers       = new Set(); // other Guardian instances on LAN

// ── WebSocket bridge ──────────────────────────────
function connectWS() {
  try {
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      wsReady = true;
      console.log('[NEXUS Guardian] WebSocket connected');
      // Flush queue
      pendingQueue.forEach(msg => ws.send(JSON.stringify(msg)));
      pendingQueue = [];
      broadcastStatus('connected');
    };

    ws.onmessage = async (event) => {
      let msg;
      try { msg = JSON.parse(event.data); }
      catch { return; }

      if (msg.type === 'complete') {
        // Route prompt to browser tab
        await handleCompleteRequest(msg);
      } else if (msg.type === 'ping') {
        wsSend({ type: 'pong', id: msg.id });
      } else if (msg.type === 'open_tab') {
        await openServiceTab(msg.service, msg.context);
      } else if (msg.type === 'get_usage') {
        await sendUsageSignal(msg.service);
      }
    };

    ws.onclose = () => {
      wsReady = false;
      broadcastStatus('disconnected');
      // Reconnect after 3s
      setTimeout(connectWS, 3000);
    };

    ws.onerror = (e) => {
      console.warn('[NEXUS Guardian] WS error:', e.message);
    };

  } catch (e) {
    setTimeout(connectWS, 5000);
  }
}

function wsSend(msg) {
  if (wsReady && ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  } else {
    pendingQueue.push(msg);
  }
}

// ── Complete request handler ──────────────────────
async function handleCompleteRequest(msg) {
  const { id, service, prompt, temperature, maxTokens } = msg;

  try {
    // Get or open tab for this service
    const tab = await getOrOpenTab(service);
    if (!tab) throw new Error(`Cannot open tab for service: ${service}`);

    // Inject prompt and wait for response
    const response = await injectAndWait(tab.id, service, prompt, maxTokens);

    wsSend({ type: 'response', id, content: response, service });

  } catch (e) {
    wsSend({ type: 'error', id, error: e.message, service });
  }
}

// ── Tab management ────────────────────────────────
const SERVICE_URLS = {
  chatgpt: 'https://chatgpt.com/',
  claude:  'https://claude.ai/new',
  gemini:  'https://gemini.google.com/app',
};

async function getOrOpenTab(service) {
  // Check if we have an active tab
  if (activeTabs[service]) {
    try {
      const tab = await chrome.tabs.get(activeTabs[service]);
      if (tab && !tab.discarded) return tab;
    } catch {}
  }

  // Open new tab
  const url = SERVICE_URLS[service];
  if (!url) return null;
  const tab = await chrome.tabs.create({ url, active: false });
  activeTabs[service] = tab.id;

  // Wait for load
  await new Promise(resolve => {
    const listener = (tabId, info) => {
      if (tabId === tab.id && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(resolve, 15000); // timeout
  });

  return tab;
}

async function openServiceTab(service, contextData) {
  const url   = SERVICE_URLS[service];
  if (!url) return;
  const tab   = await chrome.tabs.create({ url, active: true });
  activeTabs[service] = tab.id;

  // Inject context after load
  if (contextData) {
    await chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
      if (tabId === tab.id && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (ctx) => { window.__nexusContext = ctx; },
          args: [contextData],
        });
      }
    });
  }
}

// ── Inject and wait for response ──────────────────
async function injectAndWait(tabId, service, prompt, maxTokens = 4096) {
  // Tell content script to inject the prompt
  await chrome.tabs.sendMessage(tabId, {
    type:    'inject',
    service,
    prompt,
    maxTokens,
  });

  // Wait for scraper to report back
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Response timeout')), 120_000);

    chrome.runtime.onMessage.addListener(function listener(msg, sender) {
      if (sender.tab?.id === tabId && msg.type === 'response_ready') {
        clearTimeout(timeout);
        chrome.runtime.onMessage.removeListener(listener);
        resolve(msg.content);
      }
      if (sender.tab?.id === tabId && msg.type === 'response_error') {
        clearTimeout(timeout);
        chrome.runtime.onMessage.removeListener(listener);
        reject(new Error(msg.error));
      }
    });
  });
}

// ── Usage signal ──────────────────────────────────
async function sendUsageSignal(service) {
  const tabId = activeTabs[service];
  if (!tabId) { wsSend({ type: 'usage_signal', service, percent: 0, available: false }); return; }

  try {
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const el = document.querySelector('[class*="usage"], [data-testid*="token"], .token-count');
        return el ? el.textContent.trim() : null;
      },
    });
    wsSend({ type: 'usage_signal', service, raw: result?.[0]?.result, tabId });
  } catch (e) {
    wsSend({ type: 'usage_signal', service, error: e.message });
  }
}

// ── Heartbeat/Pulse — LAN peer discovery ──────────
// Other Guardian instances announce themselves via UDP broadcast
// (simulated here via localStorage / BroadcastChannel).
// Real impl: Tauri UDP socket on port 7770.
const peerChannel = typeof BroadcastChannel !== 'undefined'
  ? new BroadcastChannel('nexus-guardian-pulse')
  : null;

function startHeartbeat() {
  heartbeatInterval = setInterval(() => {
    // Announce this Guardian instance
    const pulse = {
      type:     'guardian.pulse',
      id:       chrome.runtime.id,
      version:  '1.0.0',
      services: Object.keys(activeTabs),
      ts:       Date.now(),
    };
    peerChannel?.postMessage(pulse);
    wsSend(pulse);
  }, 5000);

  // Listen for peers
  peerChannel?.addEventListener('message', (e) => {
    const { data } = e;
    if (data?.type === 'guardian.pulse' && data.id !== chrome.runtime.id) {
      const isNew = !peers.has(data.id);
      peers.add(data.id);
      if (isNew) {
        console.log('[NEXUS Guardian] Peer discovered:', data.id);
        // Handshake: exchange capabilities
        peerChannel.postMessage({ type: 'guardian.handshake', id: chrome.runtime.id, services: Object.keys(activeTabs) });
        wsSend({ type: 'guardian.peer_discovered', peerId: data.id });
      }
    }
    if (data?.type === 'guardian.handshake') {
      wsSend({ type: 'guardian.peer_connected', peerId: data.id, services: data.services });
    }
  });
}

// ── Status broadcast to popup ─────────────────────
function broadcastStatus(status) {
  chrome.runtime.sendMessage({ type: 'status_update', status, activeTabs, wsReady, peers: [...peers] })
    .catch(() => {}); // popup might not be open
}

// ── Init ──────────────────────────────────────────
connectWS();
startHeartbeat();

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'usage_observed') {
    wsSend({ type: 'extension.usage.signal', ...msg });
    sendResponse({ ok: true });
  }
  if (msg.type === 'get_status') {
    sendResponse({ wsReady, activeTabs, peers: [...peers] });
  }
  return true; // keep channel open for async
});

console.log('[NEXUS Guardian] Service worker started');
