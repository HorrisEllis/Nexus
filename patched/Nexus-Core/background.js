// Copyright (c) 2026 James Brooks (Erosmancer). All rights reserved.
// Bridge OS — Proprietary Software. See LICENSE for terms.
// rheon.world · github.com/HorrisEllis/Bridge-v2
// background.js — Guardian v3.3.1
// URCK migrated to Causal-Nexus protocol
// IR Layer integrated — ALL routing goes through IR
// Pulse system: instanceId = 'guardian' + uuid (multi-instance safe)
// RouteSpec engine wired to all callto dispatch

'use strict';

// ── IR Layer safety accessor ──────────────────────────────────────────────────
// ir-layer.js sets window.IR and globalThis.IR but 'const IR' is file-scoped.
// In Firefox MV2 background pages with strict mode, bare 'IR' may not resolve
// if the scripts haven't fully shared scope. This accessor guarantees access.
function _getIR() {
  if (typeof IR !== 'undefined') return IR;
  if (typeof globalThis !== 'undefined' && globalThis.IR) return globalThis.IR;
  if (typeof window !== 'undefined' && window.IR) return window.IR;
  return null;
}

// ── Guardian v8 server topology ───────────────────────────────────────────────
// HTTP API: :7820  (was: :3747 bridge / :3748 NEXUS admin — both retired as bridge targets)
// WSS:      :7821  (TLS — accept self-signed cert at https://127.0.0.1:7821 first)
// NEXUS admin remains on :3748 for internal NEXUS CLI + bus
//
// BRIDGE_URL now points at Guardian v8 HTTP API (:7820).
// NEXUS_URL  remains at NEXUS admin (:3748) — these are separate services.
const BRIDGE_URL_DEFAULT = 'http://127.0.0.1:7820'; // Guardian v8 HTTP API — §P1
const NEXUS_URL_DEFAULT  = 'http://127.0.0.1:3748';  // NEXUS admin (unchanged)
let   BRIDGE_URL         = BRIDGE_URL_DEFAULT;
let   NEXUS_URL          = NEXUS_URL_DEFAULT;

// ─── State ────────────────────────────────────────────────────────────────────

const sessions   = new Map();  // tabId → { sessionId, url, ts }
const listeners  = new Map();  // listenerId → { tabId, selector, mode, linkTarget, active, log, eventCount }
const channel    = new BroadcastChannel('guardian-bridge');

// ── NEXUS Core Pulse — poll admin /health endpoint ────────────────────────────
// Node.js has no BroadcastChannel, so boot.js emits nexus.cli.pulse as a
// kernel event over SSE — not broadcastable to extensions.
// Background polls GET NEXUS_URL/health every 8s and relays to popup.

let _nexusCoreSeenAt = null;

async function _pollNexusCore() {
  try {
    const res = await fetch(NEXUS_URL + '/health', { signal: AbortSignal.timeout(2500) });
    if (!res.ok) throw new Error('non-200');
    const data = await res.json();
    _nexusCoreSeenAt = Date.now();
    channel.postMessage({
      type:      'NEXUS_CORE_PULSE',
      tick:      data.tick    || 0,
      uptime:    data.uptime  || 0,
      adminPort: parseInt(NEXUS_URL.split(':').pop()) || 3748,
      version:   data.version || '2.0.0',
      ts:        Date.now(),
    });
  } catch {
    if (_nexusCoreSeenAt && Date.now() - _nexusCoreSeenAt > 20_000) {
      _nexusCoreSeenAt = null;
      channel.postMessage({ type: 'NEXUS_CORE_OFFLINE', ts: Date.now() });
    }
  }
}

// ── Response store — polled by GateForge via POLL_RESPONSE ────────────────────
// Stores AI responses indexed by identity. GateForge polls every 800ms.
// This bypasses the RELAY_TO_PAGE chain entirely — works regardless of GateForge URL.
const _responseStore = new Map(); // identity → { text, complete, ts, calltoId }

// ── Tab lock — one tab per identity, shared across the entire pipeline run ────
// Prevents multiple opens when GateForge calls CHECK_IDENTITY, OPEN_TAB,
// and GUARDIAN_EXECUTE_INTENT in rapid succession during the same pipeline.
const _tabLock = new Map(); // identity → { tabId, url, openedAt }

async function getOrOpenTab(identity) {
  const openUrls = {
    chatgpt: 'https://chatgpt.com/',
    claude:  'https://claude.ai/new',
    gemini:  'https://gemini.google.com/',
  };

  // If we have a lock from THIS pipeline run, reuse that exact tab
  const lock = _tabLock.get(identity);
  if (lock) {
    const existing = await browser.tabs.get(lock.tabId).catch(() => null);
    if (existing) {
      if (existing.status !== 'complete') {
        for (let i = 0; i < 16; i++) {
          await new Promise(r => setTimeout(r, 500));
          const check = await browser.tabs.get(lock.tabId).catch(() => null);
          if (!check || check.status === 'complete') break;
        }
      }
      return lock.tabId;
    }
    _tabLock.delete(identity);
  }

  // No lock — open a NEW session tab. Never reuse an existing conversation.
  // An existing chatgpt.com tab may be mid-conversation — we need a clean slate.
  const url = openUrls[identity];
  if (!url) return null;
  const newTab = await browser.tabs.create({ url, active: false }).catch(() => null);
  if (!newTab) return null;

  _tabLock.set(identity, { tabId: newTab.id, url, openedAt: Date.now() });

  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 500));
    const check = await browser.tabs.get(newTab.id).catch(() => null);
    if (!check) return null;
    if (check.status === 'complete') break;
  }
  return newTab.id;
}

// ─── Handshake state ──────────────────────────────────────────────────────────

let handshakeState = {
  status:        'disconnected',
  sessionToken:  null,
  bridgeVersion: null,
  lastAckTs:     null,
  failCount:     0,
  lastError:     null,
};

const HANDSHAKE_INTERVAL   = 8000;
const HANDSHAKE_TIMEOUT    = 4000;
const HANDSHAKE_FAIL_LIMIT = 3;

// ─── Load URLs from storage ───────────────────────────────────────────────────

async function loadUrls() {
  return new Promise(res => {
    browser.storage.local.get(['bridgeUrl', 'nexusUrl'], r => {
      BRIDGE_URL = r.bridgeUrl || BRIDGE_URL_DEFAULT;
      NEXUS_URL  = r.nexusUrl  || NEXUS_URL_DEFAULT;
      // BRIDGE_URL → Guardian v8 HTTP API (:7820). NEXUS_URL → NEXUS admin (:3748). Separate services.
      // Sync to IR layer
      if (typeof IR !== 'undefined') {
        _getIR().nexusUrl  = NEXUS_URL;
        _getIR().bridgeUrl = BRIDGE_URL;
      }
      res({ BRIDGE_URL, NEXUS_URL });
    });
  });
}

// ─── Bridge fetch ─────────────────────────────────────────────────────────────

async function bridgeFetch(path, method = 'GET', body = null, timeoutMs = 5000) {
  const url = BRIDGE_URL + path;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Guardian-Token': handshakeState.sessionToken || '' },
      signal:  controller.signal,
    };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch(url, opts);
    clearTimeout(timer);
    if (!r.ok) return { ok: false, data: null, reason: `HTTP ${r.status} ${r.statusText}`, code: r.status };
    const data = await r.json().catch(() => null);
    return { ok: true, data, reason: null };
  } catch (e) {
    clearTimeout(timer);
    let reason = 'Unknown error';
    if (e.name === 'AbortError')                     reason = `Bridge timeout after ${timeoutMs}ms — is it running at ${BRIDGE_URL}?`;
    else if (e.message?.includes('Failed to fetch')) reason = `Bridge unreachable at ${BRIDGE_URL} — check bridge server is running`;
    else if (e.message?.includes('NetworkError'))    reason = `Network error — bridge may have crashed`;
    else reason = e.message || 'Fetch failed';
    return { ok: false, data: null, reason, code: 'NETWORK_ERROR' };
  }
}

// ─── Handshake protocol ───────────────────────────────────────────────────────

async function performHandshake() {
  handshakeState.status = 'handshaking';

  const challenge = crypto.randomUUID();
  const payload = {
    type:            'guardian.handshake',
    challenge,
    guardianVersion: '3.0.0',
    urckVersion:     URCK.version,
    instanceId:      _getIR().instanceId,
    ts:              Date.now(),
    // appId omitted — Bridge accepts open registration from localhost (validateAppId returns null = open)
    capabilities:    ['callto', 'listener', 'link', 'snapshot', 'cookies', 'ir', 'route', 'pulse'],
  };

  const result = await bridgeFetch('/guardian/handshake', 'POST', payload, HANDSHAKE_TIMEOUT);

  if (!result.ok) {
    handshakeState.failCount++;
    handshakeState.lastError  = result.reason;
    handshakeState.status     = handshakeState.failCount >= HANDSHAKE_FAIL_LIMIT ? 'degraded' : 'disconnected';
    _broadcastHandshakeState();
    return false;
  }

  const { ack, version, token, capabilities } = result.data || {};
  if (!ack) {
    handshakeState.failCount++;
    handshakeState.lastError = 'Bridge rejected handshake (ack=false)';
    handshakeState.status    = 'disconnected';
    _broadcastHandshakeState();
    return false;
  }

  handshakeState.status        = 'connected';
  handshakeState.sessionToken  = token || challenge;
  handshakeState.bridgeVersion = version || 'unknown';
  handshakeState.lastAckTs     = Date.now();
  handshakeState.failCount     = 0;
  handshakeState.lastError     = null;

  // Ingest into Causal-Nexus URCK
  URCK.ingest('guardian.handshake.success', {
    bridgeVersion: version,
    capabilities,
    instanceId:    _getIR().instanceId,
    token:         (handshakeState.sessionToken || '').slice(0, 8) + '…',
  }, { source: 'background:handshake' });

  _broadcastHandshakeState();
  return true;
}

function _broadcastHandshakeState() {
  channel.postMessage({ type: 'HANDSHAKE_STATE', state: { ...handshakeState } });
}

// ─── Session Registry ─────────────────────────────────────────────────────────

async function registerSession(tabId, url) {
  const sessionId = crypto.randomUUID();
  sessions.set(tabId, { sessionId, url, ts: Date.now() });
  URCK.ingest('guardian.session.connect', { tabId, url, sessionId, instanceId: _getIR().instanceId }, { tabId, sessionId });
  const result = await bridgeFetch('/bus/emit', 'POST', { type: 'session.register', tabId, sessionId, url, instanceId: _getIR().instanceId });
  if (!result.ok) console.warn('[Guardian] Session register failed:', result.reason);
  return sessionId;
}

function getAllSessions() { return [...sessions.entries()].map(([tabId, s]) => ({ tabId, ...s })); }

// ─── Callto Registration via IR Layer ─────────────────────────────────────────

async function registerCalltoWithIR(callto, routeSpec) {
  if (!callto.id || !callto.selector) {
    return { ok: false, reason: 'Malformed callto — missing id or selector' };
  }

  // STEP 1: Log to URCK kernel immediately — before any network call
  // This ensures callto is in the event graph even if IR/bridge is offline
  const logEntry = URCK.ingest('guardian.callto.captured', {
    calltoId:  callto.id,
    selector:  callto.selector,
    label:     callto.label || callto.selector,
    action:    callto.action || 'click',
    url:       callto.url,
    host:      callto.host || '',
    ts:        callto.ts || Date.now(),
  }, { source: 'background:callto', url: callto.url });

  // STEP 2: Default route: Nexus if alive, else local
  const route = routeSpec || { type: 'pipeline', steps: [
    { type: 'nexus' },
    { type: 'local' },   // local as fallback/backup
  ]};

  const validation = _getIR().validate(route);
  if (!validation.valid) {
    return { ok: false, reason: `Invalid RouteSpec: ${validation.error}` };
  }

  try {
    const packet = _getIR().createCallto({ ...callto }, route, 'capture');
    const result = await _getIR().execute(route, packet, { nexusUrl: NEXUS_URL, bridgeUrl: BRIDGE_URL });

    // STEP 3: Register with bridge (legacy + callto index sync)
    bridgeFetch('/userscript/callto', 'POST', callto).catch(() => {});

    if (!result.ok) {
      URCK.ingest('guardian.callto.register.failed', {
        calltoId: callto.id,
        reason:   result.reason,
        route:    JSON.stringify(route),
      }, { source: 'background:ir' });
    } else {
      URCK.ingest('guardian.callto.register.ok', {
        calltoId:   callto.id,
        selector:   callto.selector,
        routeTrace: packet.routeTrace,
      }, { source: 'background:ir' });
    }

    return result;
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

// ─── Listener Engine ──────────────────────────────────────────────────────────

function createListener(opts) {
  const id = 'listener-' + crypto.randomUUID().slice(0, 8);
  const entry = {
    id,
    tabId:      opts.tabId,
    selector:   opts.selector,
    xpath:      opts.xpath,
    label:      opts.label || opts.selector,
    mode:       opts.mode || 'mutation',
    linkTarget: opts.linkTarget || null,
    url:        opts.url,
    active:     true,
    startTs:    Date.now(),
    eventCount: 0,
    log:        [],
  };
  listeners.set(id, entry);
  return entry;
}

function stopListener(id) {
  const l = listeners.get(id);
  if (!l) return false;
  l.active = false;
  browser.tabs.sendMessage(l.tabId, { type: 'STOP_LISTENER', listenerId: id }).catch(() => {});
  URCK.ingest('guardian.listener.stopped', { listenerId: id, eventCount: l.eventCount }, { tabId: l.tabId });
  return true;
}

function stopAllListeners() {
  for (const [id] of listeners) stopListener(id);
  listeners.clear();
}

// ─── Link Routing ─────────────────────────────────────────────────────────────

async function routeListenerEvent(listenerId, eventData) {
  const l = listeners.get(listenerId);
  if (!l || !l.active || !l.linkTarget) return;

  l.eventCount++;
  l.log.push({ ts: Date.now(), data: eventData });
  if (l.log.length > 200) l.log.shift();

  const target = l.linkTarget;
  let result;

  if (target.type === 'bridge') {
    const targetUrl = target.url || BRIDGE_URL;
    result = await fetch(targetUrl + '/bus/emit', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ type: 'guardian.link.event', listenerId, event: eventData, source: l.url }),
    }).then(r => ({ ok: r.ok, reason: r.ok ? null : `HTTP ${r.status}` }))
      .catch(e => ({ ok: false, reason: e.message }));

  } else if (target.type === 'callto') {
    result = await bridgeFetch(`/userscript/callto/${target.calltoId}/exec`, 'POST', { event: eventData, listenerId });

  } else if (target.type === 'url') {
    result = await fetch(target.url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ guardian: true, listenerId, event: eventData }),
    }).then(r => ({ ok: r.ok, reason: r.ok ? null : `HTTP ${r.status}` }))
      .catch(e => ({ ok: false, reason: e.message }));

  } else if (target.type === 'nexus') {
    const route = { type: 'nexus' };
    const packet = _getIR().createCallto({ listenerId, event: eventData }, route, 'listen');
    result = await _getIR().execute(route, packet, { nexusUrl: NEXUS_URL });

  } else if (target.type === 'internal') {
    // ── Callback pipeline — feeds response store ────────────────────────────
    // This is the core fix: listener events route back to _responseStore
    // keyed by identity. GateForge polls _responseStore via POLL_RESPONSE.
    const { identity, calltoId } = target;
    const text     = eventData?.text || eventData?.value || '';
    const complete = eventData?.complete || false;

    if (identity && text) {
      const existing = _responseStore.get(identity);
      if (!existing || text.length >= (existing.text?.length || 0) || complete) {
        _responseStore.set(identity, { text, complete, ts: Date.now(), calltoId, listenerId });
      }

      // Log the event in the listener record
      l.lastText  = text;
      l.lastTs    = Date.now();

      // Push to bridge /guardian/response for the module log
      fetch(BRIDGE_URL + '/guardian/response', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          sessionId: calltoId || listenerId,
          text, complete, identity,
          calltoId, listenerId, ts: Date.now(),
        }),
      }).catch(() => {});

      // Broadcast to any GateForge tab via RELAY_TO_PAGE (bonus path)
      browser.tabs.query({}).then(tabs => {
        for (const tab of tabs) {
          if (!tab.url) continue;
          const isAI = ['chatgpt.com','claude.ai','gemini.google.com'].some(h => tab.url.includes(h));
          if (!isAI) {
            browser.tabs.sendMessage(tab.id, {
              type:    'RELAY_TO_PAGE',
              payload: { type: 'CHAT_EVENT', __guardian_reply: true, payload: { text, complete, provider: identity, calltoId } },
            }).catch(() => {});
          }
        }
      }).catch(() => {});
    }
    result = { ok: true };
  }

  if (result && !result.ok) {
    channel.postMessage({ type: 'ROUTE_FAILURE', listenerId, targetType: target.type, reason: result.reason });
    URCK.ingest('guardian.link.route.failed', { listenerId, targetType: target.type, reason: result.reason }, { tabId: l.tabId });
  }
}

// ─── ESC Global Killswitch ────────────────────────────────────────────────────

let _killswitchRunning = false;

function globalKillswitch(reason = 'ESC', originTabId = null) {
  if (_killswitchRunning) return;
  _killswitchRunning = true;
  stopAllListeners();
  browser.tabs.query({}).then(tabs => {
    for (const tab of tabs) {
      if (tab.id === originTabId) continue;
      browser.tabs.sendMessage(tab.id, { type: 'GLOBAL_KILLSWITCH', reason }).catch(() => {});
    }
    _killswitchRunning = false;
  }).catch(() => { _killswitchRunning = false; });
  URCK.ingest('guardian.killswitch', { reason, originTabId }, { source: 'background' });
  channel.postMessage({ type: 'KILLSWITCH', reason });
}

// ─── Manual Node Registry (for Devices tab) ──────────────────────────────────

async function getManualNodes() {
  return new Promise(res => {
    browser.storage.local.get('manual_nodes', r => res(Array.isArray(r.manual_nodes) ? r.manual_nodes : []));
  });
}

async function saveManualNode(node) {
  const nodes = await getManualNodes();
  const existing = nodes.findIndex(n => n.ip === node.ip && n.port === node.port);
  if (existing >= 0) nodes[existing] = node;
  else nodes.push(node);
  await browser.storage.local.set({ manual_nodes: nodes });
  return { ok: true, node };
}

async function removeManualNode(nodeId) {
  const nodes = await getManualNodes();
  const filtered = nodes.filter(n => n.id !== nodeId);
  await browser.storage.local.set({ manual_nodes: filtered });
  return { ok: true };
}

async function probeNode(ip, port) {
  try {
    const res = await fetch(`http://${ip}:${port}/pulse`, {
      method: 'GET',
      signal: AbortSignal.timeout(2000),
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return { reachable: true, latency: Date.now(), data };
    }
    return { reachable: false, reason: `HTTP ${res.status}` };
  } catch (e) {
    return { reachable: false, reason: e.message };
  }
}

// ─── Message Handler ──────────────────────────────────────────────────────────

browser.runtime.onMessage.addListener(async (msg, sender) => {
  const tabId = sender.tab?.id || msg.tabId;

  switch (msg.type) {

    case 'CALLTO_ADDED': {
      const { callto, routeSpec } = msg;
      const ev = URCK.ingest('guardian.bridge.callto', callto, {
        tabId, source: 'guardian:content', url: callto.url,
      });
      URCK.registerCallto(callto.id, ev.id);

      const result = await registerCalltoWithIR(callto, routeSpec || null);

      channel.postMessage({ type: 'CALLTO_ADDED', callto, ok: result.ok, reason: result.reason || null });
      return { ok: result.ok, seq: ev.seq, reason: result.reason, routeTrace: result.ack?.routeTrace };
    }

    case 'LISTENER_EVENT': {
      const { listenerId, eventData } = msg;
      const l = listeners.get(listenerId);
      if (l) {
        l.eventCount++;
        l.log = l.log || [];
        l.log.push({ ts: Date.now(), data: eventData });
        if (l.log.length > 200) l.log.shift();

        // Always route — linkTarget may be internal (callback) or external
        await routeListenerEvent(listenerId, { ...eventData, requestId: l.requestId, calltoId: l.calltoId });
        channel.postMessage({ type: 'LISTENER_EVENT', listenerId, eventData });
      }
      return { ok: true };
    }

    case 'START_LISTENER': {
      const listener = createListener({ ...msg.config, tabId });
      await browser.tabs.sendMessage(tabId, {
        type: 'ATTACH_LISTENER', listenerId: listener.id,
        selector: listener.selector, xpath: listener.xpath, mode: listener.mode,
      });
      URCK.ingest('guardian.listener.started', { listenerId: listener.id, ...msg.config }, { tabId });
      channel.postMessage({ type: 'LISTENER_STARTED', listener });
      return { ok: true, listenerId: listener.id };
    }

    case 'STOP_LISTENER': {
      stopListener(msg.listenerId);
      channel.postMessage({ type: 'LISTENER_STOPPED', listenerId: msg.listenerId });
      return { ok: true };
    }

    case 'SET_LINK_TARGET': {
      const l = listeners.get(msg.listenerId);
      if (l) l.linkTarget = msg.linkTarget;
      return { ok: !!l };
    }

    case 'GLOBAL_KILLSWITCH': {
      globalKillswitch(msg.reason || 'manual', tabId);
      return { ok: true };
    }

    case 'FORCE_DISCONNECT': {
      // Full killswitch — stops everything including bridge connection + pulse
      globalKillswitch('force-disconnect', tabId);
      // Stop the bridge heartbeat interval if running
      if (typeof _bridgePulseInterval !== 'undefined' && _bridgePulseInterval) {
        clearInterval(_bridgePulseInterval);
        _bridgePulseInterval = null;
      }
      // Clear all sessions
      sessions.clear();
      // Broadcast to all tabs
      browser.tabs.query({}).then(tabs => {
        tabs.forEach(t => browser.tabs.sendMessage(t.id, { type: 'FORCE_DISCONNECT' }).catch(() => {}));
      });
      channel.postMessage({ type: 'FORCE_DISCONNECT' });
      return { ok: true };
    }

    case 'GET_LISTENERS': {
      return {
        listeners: [...listeners.entries()].map(([id, l]) => ({
          id,
          tabId:      l.tabId,
          url:        l.url,
          selector:   l.selector,
          mode:       l.mode,
          active:     l.active,
          eventCount: l.eventCount,
          startTs:    l.startTs,
          linkTarget: l.linkTarget,
          identity:   l.identity,
          requestId:  l.requestId,
          calltoId:   l.calltoId,
          lastText:   l.lastText || '',
          lastTs:     l.lastTs   || null,
          log:        (l.log || []).slice(-20),
        })),
      };
    }

    case 'PICKER_CAPTURED': {
      const { fingerprint, selector, url } = msg;
      const s = sessions.get(tabId);
      const calltoId = 'callto-' + crypto.randomUUID().slice(0, 8);
      const event = URCK.ingest('guardian.picker.capture', {
        calltoId, fingerprint, selector, url, tabId,
      }, { tabId, sessionId: s?.sessionId, url });
      await bridgeFetch('/userscript/callto', 'POST', { id: calltoId, selector, fingerprint, tabId, url, seq: event.seq });
      channel.postMessage({ type: 'CAPTURE_DONE', calltoId, selector, url });
      return { ok: true, calltoId };
    }

    case 'COOKIES_CAPTURE': {
      const { cookies, url } = msg;
      URCK.ingest('guardian.cookies.capture', { cookies, url }, { tabId, url });
      await bridgeFetch('/data/cookies', 'POST', { cookies, url, tabId });
      return { ok: true };
    }

    case 'URCK_EVENT': {
      const { eventType, payload, meta } = msg;
      URCK.ingest(eventType, payload, { ...meta, tabId });
      return { ok: true };
    }

    case 'IR_ROUTE': {
      // Direct IR routing request from content/popup
      const { payload: routePayload, routeSpec, intent } = msg;
      const validation = _getIR().validate(routeSpec);
      if (!validation.valid) return { ok: false, reason: validation.error };

      // If device route uses instanceId, resolve ip/port from pulse registry
      let resolvedSpec = routeSpec;
      if (routeSpec.type === 'device' && routeSpec.instanceId && !routeSpec.ip) {
        const node = _getIR().resolveNode(routeSpec.instanceId);
        if (node) {
          resolvedSpec = { ...routeSpec, ip: node.ip, port: node.port };
          // Inject into discoveredNodes so executeRoute can find it
          _getIR().discoveredNodes.set(routeSpec.instanceId, node);
        } else {
          return { ok: false, reason: `Device instanceId not found in pulse registry: ${routeSpec.instanceId}` };
        }
      }

      try {
        const packet = _getIR().createCallto(routePayload, resolvedSpec, intent || 'capture');
        const result = await _getIR().execute(resolvedSpec, packet, { nexusUrl: NEXUS_URL, bridgeUrl: BRIDGE_URL });
        return { ok: result.ok, reason: result.reason, routeTrace: packet.routeTrace };
      } catch (e) {
        return { ok: false, reason: e.message };
      }
    }

    case 'GET_IR_STATS': {
      return { stats: _getIR().stats(), instanceId: _getIR().instanceId };
    }

    case 'GET_DISCOVERED_NODES': {
      const manual = await getManualNodes();
      const discovered = [...IR.discoveredNodes.values()];
      return { nodes: { discovered, manual } };
    }

    case 'ADD_MANUAL_NODE': {
      const node = {
        id:         'manual-' + crypto.randomUUID().slice(0, 8),
        ip:         msg.ip,
        port:       msg.port,
        label:      msg.label || `${msg.ip}:${msg.port}`,
        intent:     msg.intent || 'nexus',
        manual:     true,
        addedAt:    Date.now(),
        status:     'unknown',
        instanceId: msg.instanceId || null,
      };
      const probe = await probeNode(msg.ip, msg.port);
      node.status = probe.reachable ? 'online' : 'offline';
      node.latency = probe.latency || null;
      // If the probe returned a guardian instanceId, use it
      if (probe.data?.instanceId) node.instanceId = probe.data.instanceId;
      if (probe.data?.logicalId)  node.logicalId  = probe.data.logicalId;
      await saveManualNode(node);
      return { ok: true, node };
    }

    // ── Direct Guardian-to-Guardian connection via instanceId ─────────────
    // Looks up node from pulse registry first, falls back to IP+port manual add.
    case 'CONNECT_BY_INSTANCE_ID': {
      const { instanceId, label, intent } = msg;
      if (!instanceId) return { ok: false, reason: 'instanceId required' };

      // 1. Check pulse registry (Nexus-discovered nodes)
      const knownNode = _getIR().resolveNode(instanceId);
      if (knownNode) {
        // Already know this node — ensure it's in manual store for persistence
        const persistNode = {
          id:         'manual-' + crypto.randomUUID().slice(0, 8),
          ip:         knownNode.ip,
          port:       knownNode.port,
          label:      label || knownNode.logicalId || instanceId,
          intent:     intent || knownNode.intent || 'guardian',
          instanceId: knownNode.instanceId,
          logicalId:  knownNode.logicalId,
          manual:     true,
          addedAt:    Date.now(),
          status:     knownNode.status || 'online',
          source:     'instanceId',
        };
        await saveManualNode(persistNode);
        return { ok: true, node: persistNode, source: 'pulse_registry' };
      }

      // 2. Node not in pulse registry yet — need IP+port to connect
      // Return a partial result so popup can prompt for IP+port
      return {
        ok:      false,
        reason:  'Instance not found in pulse registry — enter IP and port to connect directly',
        partial: true,
        instanceId,
      };
    }

    case 'REMOVE_MANUAL_NODE': {
      return removeManualNode(msg.nodeId);
    }

    case 'PROBE_NODE': {
      return probeNode(msg.ip, msg.port);
    }

    case 'GET_SESSIONS':        { return { sessions: getAllSessions() }; }
    case 'GET_CAPTURES':        { return { captures: URCK.captures(), seq: URCK.clock.seq, version: URCK.version }; }
    case 'BRIDGE_FETCH':        { const r = await bridgeFetch(msg.path, msg.method, msg.body); return { result: r.data, ok: r.ok, reason: r.reason }; }
    case 'PING':                { return { pong: true }; }

    // GateForge polls this every 800ms to get the AI response.
    // Returns whatever the ChatGPT/Claude tab has produced so far.
    case 'POLL_RESPONSE': {
      const { identity } = msg;
      const stored = _responseStore.get(identity) || null;
      return { ok: true, response: stored };
    }

    // GateForge calls this when it starts a new pipeline run to clear stale data.
    case 'CLEAR_RESPONSE': {
      const { identity } = msg;
      if (identity) _responseStore.delete(identity);
      else _responseStore.clear();
      return { ok: true };
    }

    // GateForge calls this at the START of each pipeline run to clear the tab lock.
    // Ensures every new pipeline run gets a fresh session tab.
    case 'CLEAR_TAB_LOCK': {
      const { identity } = msg;
      if (identity) _tabLock.delete(identity);
      else _tabLock.clear();
      return { ok: true };
    }

    case 'CHECK_IDENTITY': {
      const { identity } = msg;
      const hosts = { chatgpt:['chatgpt.com','chat.openai.com'], claude:['claude.ai'], gemini:['gemini.google.com'] }[identity] || [];
      // Also check the tab lock — a tab may have been opened but not yet navigated
      const lock = _tabLock.get(identity);
      if (lock) {
        const tab = await browser.tabs.get(lock.tabId).catch(() => null);
        if (tab) return { identity, found: true, tabId: lock.tabId };
        _tabLock.delete(identity);
      }
      const tabs = await browser.tabs.query({}).catch(()=>[]);
      const match = tabs.find(t => t.url && hosts.some(h => t.url.includes(h)));
      if (match) _tabLock.set(identity, { tabId: match.id, url: match.url, openedAt: Date.now() });
      return { identity, found: !!match, tabId: match?.id };
    }

    case 'OPEN_TAB': {
      // Use the lock — if already open or locked, don't open another
      const tabId = await getOrOpenTab(msg.identity);
      return { ok: !!tabId, tabId };
    }

    case 'STOP_LISTENER': {
      const l = listeners.get(msg.listenerId);
      if (l) {
        browser.tabs.sendMessage(l.tabId, { type: 'STOP_LISTENER', listenerId: msg.listenerId }).catch(()=>{});
        listeners.delete(msg.listenerId);
      }
      return { ok: true };
    }

    case 'REGISTER_LISTENER': {
      const { listenerId, listener } = msg;
      const identity  = listener?.identity;
      const requestId = listener?.requestId || listenerId; // callto requestId
      const calltoId  = listener?.calltoId  || listenerId;
      const hosts = { chatgpt:['chatgpt.com','chat.openai.com'], claude:['claude.ai'], gemini:['gemini.google.com'] }[identity] || [];

      const lock = _tabLock.get(identity);
      let target = null;
      if (lock) {
        const tab = await browser.tabs.get(lock.tabId).catch(() => null);
        if (tab) target = tab;
      }
      if (!target) {
        const tabs = await browser.tabs.query({}).catch(()=>[]);
        target = tabs.find(t => t.url && hosts.some(h => t.url.includes(h))) || null;
      }

      if (target && listenerId) {
        listeners.set(listenerId, {
          tabId:      target.id,
          url:        target.url,
          selector:   listener.selector,
          mode:       listener.mode || 'chat',
          identity,
          requestId,
          calltoId,
          active:     true,
          log:        [],
          eventCount: 0,
          startTs:    Date.now(),
          // ── Callback pipeline: route events back to response store ──────────
          // linkTarget wired so routeListenerEvent() actually sends data.
          // Events flow: mutation → LISTENER_EVENT → routeListenerEvent → _responseStore
          linkTarget: { type: 'internal', requestId, calltoId, identity },
        });
        browser.tabs.sendMessage(target.id, {
          type:       'ATTACH_LISTENER',
          listenerId,
          selector:   listener.selector,
          mode:       listener.mode || 'chat',
          requestId,
          calltoId,
        }).catch(()=>{});

        // Notify popup so it refreshes immediately
        channel.postMessage({ type: 'LISTENER_STARTED', listener: {
          id: listenerId, selector: listener.selector, mode: listener.mode||'chat',
          identity, requestId, calltoId, tabId: target.id, url: target.url,
          active: true, eventCount: 0, startTs: Date.now(),
        }});
        URCK.ingest('guardian.listener.started', { listenerId, selector: listener.selector, identity, requestId }, { tabId: target.id });
      }
      return { ok: !!target, listenerId, requestId };
    }

    // GateForge → content.js postMessage → here: find AI tab and inject text
    case 'GUARDIAN_EXECUTE_INTENT': {
      const { identity, text, calltoId, tabId: suppliedTabId } = msg;
      if (!identity || !text) return { ok: false, reason: 'identity and text required' };

      // If GateForge already knows the tabId (from Step 5), use it directly.
      // This eliminates the lookup race that caused duplicate tab opens.
      let tabId = suppliedTabId || null;

      if (tabId) {
        // Verify the supplied tab still exists
        const tab = await browser.tabs.get(tabId).catch(() => null);
        if (!tab) tabId = null; // tab was closed, fall through to lookup
        else if (tab.status !== 'complete') {
          // Wait for it — it's the right tab, just still loading
          for (let i = 0; i < 16; i++) {
            await new Promise(r => setTimeout(r, 400));
            const check = await browser.tabs.get(tabId).catch(() => null);
            if (!check) { tabId = null; break; }
            if (check.status === 'complete') break;
          }
        }
      }

      // Only do a lookup/open if we don't have a confirmed tabId
      if (!tabId) {
        tabId = await getOrOpenTab(identity);
        if (!tabId) return { ok: false, reason: 'Could not open or find tab for ' + identity };
      }

      // Update the lock with the confirmed tabId
      _tabLock.set(identity, { tabId, openedAt: Date.now() });

      const sendCmd = async () => browser.tabs.sendMessage(tabId, {
        type: 'NEXUS_CMD',
        cmd:  { text, calltoId, identity, submitAfter: true },
      });

      try {
        await sendCmd();
        return { ok: true, calltoId, tabId };
      } catch (err) {
        // Content script not yet injected — retry once after a short wait
        await new Promise(r => setTimeout(r, 1500));
        try {
          await sendCmd();
          return { ok: true, calltoId, tabId };
        } catch (err2) {
          return { ok: false, reason: 'Content script unreachable in tab ' + tabId + ': ' + err2.message };
        }
      }
    }

    // Content script fired a Guardian callto with an AI response.
    // Relay to GateForge page via content script postMessage bridge.
    case 'GUARDIAN_CALLTO': {
      const { payload } = msg;
      const identity   = payload?.provider || payload?.identity;
      const listenerId = payload?.listenerId;

      // If this is a NEXUS-initiated execution, post result back and resolve
      if (payload?.calltoId && _nexusExecPending.has(payload.calltoId)) {
        const pending = _nexusExecPending.get(payload.calltoId);
        if (payload.complete) {
          _nexusExecPending.delete(payload.calltoId);
          _tabLock.delete(pending.service);
        }
        _postResult(payload.calltoId, payload.text || '', payload.complete || false, null);
        if (payload.complete) return { ok: true };
      }
      const text       = payload?.text || '';
      const complete   = payload?.complete || false;

      // ── 1. Update the listener record so popup shows events + lastText ───────
      // This is the critical connection: GUARDIAN_CALLTO must write to the
      // listener Map so GET_LISTENERS returns accurate data.
      if (listenerId && listeners.has(listenerId)) {
        const l = listeners.get(listenerId);
        l.eventCount++;
        l.log = l.log || [];
        l.log.push({ ts: Date.now(), type: 'response', text: text.slice(0, 500), complete });
        if (l.log.length > 200) l.log.shift();
        if (text.length > (l.lastText || '').length) {
          l.lastText = text;
          l.lastTs   = Date.now();
        }
        // Broadcast updated count so popup badge refreshes immediately
        channel.postMessage({ type: 'LISTENER_EVENT', listenerId, eventData: {
          type: 'response', text: text.slice(0, 500), complete, chars: text.length,
          ts: Date.now(),
        }});
      } else if (identity) {
        // No matching listenerId — find listener by identity and update it
        for (const [lid, l] of listeners) {
          if (l.identity === identity && l.active) {
            l.eventCount++;
            l.log = l.log || [];
            l.log.push({ ts: Date.now(), type: 'response', text: text.slice(0, 500), complete });
            if (l.log.length > 200) l.log.shift();
            if (text.length > (l.lastText || '').length) {
              l.lastText = text;
              l.lastTs   = Date.now();
            }
            channel.postMessage({ type: 'LISTENER_EVENT', listenerId: lid, eventData: {
              type: 'response', text: text.slice(0, 500), complete, chars: text.length,
              ts: Date.now(),
            }});
            break;
          }
        }
      }

      // ── 2. Update response store ─────────────────────────────────────────────
      if (identity && text) {
        const existing = _responseStore.get(identity);
        const bestText = text.length >= (existing?.text || '').length ? text : existing.text;
        _responseStore.set(identity, {
          text: bestText, complete: complete || existing?.complete || false,
          ts: Date.now(), calltoId: payload?.calltoId || existing?.calltoId,
          listenerId: listenerId || existing?.listenerId,
        });
      }

      // ── 3. Relay to GateForge tabs ───────────────────────────────────────────
      const gfTabs = await browser.tabs.query({}).catch(() => []);
      for (const tab of gfTabs) {
        if (!tab.url) continue;
        const isAI = ['chatgpt.com','claude.ai','gemini.google.com'].some(h => tab.url.includes(h));
        if (!isAI) {
          browser.tabs.sendMessage(tab.id, {
            type:    'RELAY_TO_PAGE',
            payload: { type: 'CHAT_EVENT', __guardian_reply: true, payload },
          }).catch(() => {});
        }
      }

      // ── 4. Push to bridge /guardian/response for persistent log ─────────────
      if (payload?.calltoId || payload?.sessionId) {
        fetch(BRIDGE_URL + '/guardian/response', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: payload.calltoId || payload.sessionId,
            text, complete, identity,
            calltoId:  payload.calltoId,
            listenerId, ts: Date.now(),
          }),
        }).catch(() => {});
      }

      return Promise.resolve({ ok: true });
    }

    // Content script executed NEXUS_CMD and reports result
    case 'NEXUS_CMD_RESULT': {
      channel.postMessage({ type: 'NEXUS_CMD_RESULT', ...msg });
      return Promise.resolve({ ok: true });
    }
    case 'GET_HANDSHAKE_STATE': { return { state: { ...handshakeState } }; }
    case 'FORCE_HANDSHAKE':     { const ok = await performHandshake(); return { ok, state: { ...handshakeState } }; }
  }
});

// ─── Tab Lifecycle ────────────────────────────────────────────────────────────

browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.startsWith('http')) {
    if (!sessions.has(tabId)) {
      await registerSession(tabId, tab.url);
    } else {
      const s = sessions.get(tabId);
      sessions.set(tabId, { ...s, url: tab.url });
      // URCK.ingest removed: tab.navigate fires on every navigation (high volume)
    }
    for (const [lid, l] of listeners) {
      if (l.tabId === tabId && l.active) {
        browser.tabs.sendMessage(tabId, {
          type: 'ATTACH_LISTENER', listenerId: lid,
          selector: l.selector, xpath: l.xpath, mode: l.mode,
        }).catch(() => {});
      }
    }
  }
});

browser.tabs.onRemoved.addListener(tabId => {
  const s = sessions.get(tabId);
  if (s) {
    URCK.ingest('guardian.session.disconnect', { tabId, sessionId: s.sessionId }, { tabId });
    sessions.delete(tabId);
  }
  for (const [lid, l] of listeners) {
    if (l.tabId === tabId) { l.active = false; listeners.delete(lid); }
  }
});

// ─── Heartbeat + Handshake Loop ───────────────────────────────────────────────

async function heartbeatTick() {
  // Always attempt handshake when not connected — persistent reconnect.
  if (handshakeState.status !== 'connected') {
    await performHandshake();
    return;
  }

  const result = await bridgeFetch('/guardian/heartbeat', 'POST', {
    token:         handshakeState.sessionToken,
    ts:            Date.now(),
    instanceId:    _getIR().instanceId,
    listenerCount: listeners.size,
    sessionCount:  sessions.size,
    irStats:       _getIR().stats(),
  }, 2500);

  if (!result.ok) {
    handshakeState.failCount++;
    handshakeState.lastError = result.reason;
    // Drop back to disconnected so next tick re-handshakes cleanly
    handshakeState.status = 'disconnected';
    channel.postMessage({ type: 'CONNECTION_DEGRADED', reason: result.reason, fails: handshakeState.failCount });
  } else {
    handshakeState.failCount = 0;
    handshakeState.lastAckTs = Date.now();
  }

  channel.postMessage({
    type:           'HEARTBEAT',
    alive:          result.ok,
    sessions:       getAllSessions().length,
    listenerCount:  listeners.size,
    handshake:      { ...handshakeState },
    instanceId:     _getIR().instanceId,
    discoveredNodes: _getIR().discoveredNodes.size,
    ts:             Date.now(),
  });
}

setInterval(heartbeatTick, HANDSHAKE_INTERVAL);

// Poll NEXUS core health in sync with heartbeat
_pollNexusCore();
setInterval(_pollNexusCore, HANDSHAKE_INTERVAL);

// ─── Admin Panel → Guardian BroadcastChannel ──────────────────────────────────
// Admin panel posts CALLTO_TEST and CALLTO_REGISTER on 'guardian-bridge'.
// Background receives them here and acts — no :3747 HTTP round-trip.

channel.onmessage = async (evt) => {
  const msg = evt.data;
  if (!msg?.type) return;

  // ── CALLTO_TEST — admin wants to test a selector in the active tab ──
  if (msg.type === 'CALLTO_TEST') {
    const { selector, origin, _replyTo } = msg;
    const replyChannel = _replyTo ? new BroadcastChannel(_replyTo) : channel;

    try {
      // Find the best matching tab (by origin URL if given, else active tab)
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      let tab = tabs[0];
      if (origin) {
        const allTabs = await browser.tabs.query({});
        const match = allTabs.find(t => t.url && t.url.startsWith(origin.replace(/\/$/, '')));
        if (match) tab = match;
      }

      if (!tab?.id) {
        replyChannel.postMessage({ type: 'CALLTO_TEST_RESULT', selector, ok: false, reason: 'No active tab found' });
        return;
      }

      const results = await browser.scripting.executeScript({
        target: { tabId: tab.id },
        func: (sel) => {
          try {
            const els = document.querySelectorAll(sel);
            return { ok: els.length > 0, count: els.length };
          } catch (e) {
            return { ok: false, reason: e.message };
          }
        },
        args: [selector],
      });

      const r = results?.[0]?.result || { ok: false, reason: 'Script injection failed' };
      replyChannel.postMessage({ type: 'CALLTO_TEST_RESULT', selector, ok: r.ok, count: r.count, reason: r.reason });
    } catch (e) {
      replyChannel.postMessage({ type: 'CALLTO_TEST_RESULT', selector, ok: false, reason: e.message });
    }
    if (_replyTo) replyChannel.close();
    return;
  }

  // ── CALLTO_REGISTER — admin saved a callto, add it to Guardian's index ──
  if (msg.type === 'CALLTO_REGISTER') {
    const { callto } = msg;
    if (!callto?.selector) return;
    const id = 'admin-' + Date.now().toString(36);
    const entry = { ...callto, id, ts: Date.now(), source: 'admin-panel' };
    channel.postMessage({ type: 'CALLTO_ADDED', callto: entry, ok: true });
    console.log('[Guardian] CALLTO_REGISTER from admin:', entry.selector);
    return;
  }

  // ── NEXUS_EXECUTE — admin-server relays a guardianRequest from NEXUS ──
  // Admin panel SSE receives nexus.guardian.execute → broadcasts on guardian-bridge
  // Background picks it up here and fires the full tab→inject→scrape pipeline.
  if (msg.type === 'NEXUS_EXECUTE') {
    _handleNexusExecute(msg).catch(e =>
      _postResult(msg.calltoId, '', false, e.message));
    return;
  }
};

// ─── NEXUS Execution Relay ────────────────────────────────────────────────────
// Admin-server emits nexus.guardian.execute as a kernel event → SSE → admin
// panel BroadcastChannel → picked up here. Background opens the tab, injects
// the prompt via NEXUS_CMD, content.js watches for response, sends GUARDIAN_CALLTO
// back to background, which POSTs the result to /api/complete/result.
// This closes the full NEXUS→Guardian→tab→response→NEXUS loop.

const _nexusExecPending = new Map(); // calltoId → { service, tabId, ts }

async function _handleNexusExecute(msg) {
  const { calltoId, service, prompt } = msg;
  if (!calltoId || !service || !prompt) return;
  console.log(`[Guardian] nexus.execute → ${service} calltoId:${calltoId}`);

  try {
    const tabId = await getOrOpenTab(service);
    if (!tabId) { await _postResult(calltoId, '', false, 'Could not open tab for ' + service); return; }
    _tabLock.set(service, { tabId, openedAt: Date.now() });
    _nexusExecPending.set(calltoId, { service, tabId, ts: Date.now() });

    const sendCmd = async () => browser.tabs.sendMessage(tabId, {
      type: 'NEXUS_CMD',
      cmd:  { text: prompt, calltoId, identity: service, submitAfter: true },
    });

    try { await sendCmd(); }
    catch {
      await new Promise(r => setTimeout(r, 1500));
      try { await sendCmd(); }
      catch (e) { _nexusExecPending.delete(calltoId); await _postResult(calltoId, '', false, 'Content script unreachable: ' + e.message); }
    }
  } catch (e) { await _postResult(calltoId, '', false, e.message); }
}

async function _postResult(calltoId, text, complete, reason) {
  // Posts callto completion back to NEXUS admin (:3748) — not Guardian (:7820).
  // NEXUS_URL/api/complete/result is a NEXUS-side endpoint, not Guardian server.js.
  try {
    await fetch(NEXUS_URL + '/api/complete/result', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ calltoId, text, complete, ok: !reason, reason }),
      signal:  AbortSignal.timeout(5000),
    });
  } catch (e) { console.warn('[Guardian] _postResult failed:', e.message); }
}

browser.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.bridgeUrl) {
    BRIDGE_URL = changes.bridgeUrl.newValue || BRIDGE_URL_DEFAULT;
    _getIR().bridgeUrl = BRIDGE_URL;
    handshakeState.status = 'disconnected';
    performHandshake();
  }
  if (changes.nexusUrl) {
    NEXUS_URL = changes.nexusUrl.newValue || NEXUS_URL_DEFAULT;
    _getIR().nexusUrl  = NEXUS_URL;
    _getIR().stopPulse();
    _getIR().startPulse(NEXUS_URL);
  }
});

// ─── Init ─────────────────────────────────────────────────────────────────────

(async () => {
  await loadUrls();

  // Start pulse with our instanceId
  const _ir = _getIR();
  if (!_ir) {
    console.error('[Guardian] CRITICAL: IR layer not loaded — check ir-layer.js is in manifest scripts');
  } else {
    _ir.startPulse(NEXUS_URL);
  }
  URCK.ingest('guardian.init', {
    instanceId: _getIR().instanceId,
    version:    '3.0.0',
    bridgeUrl:  BRIDGE_URL,
    nexusUrl:   NEXUS_URL,
  }, { source: 'background:init' });

  // Register existing tabs
  const tabs = await browser.tabs.query({ url: ['http://*/*', 'https://*/*'] });
  for (const tab of tabs) {
    if (tab.id && tab.url) await registerSession(tab.id, tab.url);
  }

  await performHandshake();

  console.log(`[Guardian v3.0.0] background ready — ${tabs.length} tabs · bridge: ${BRIDGE_URL} · nexus: ${NEXUS_URL} · instanceId: ${_getIR()?.instanceId}`);
})();


// GateForge communicates via window.postMessage → content.js → runtime.sendMessage (see above)
