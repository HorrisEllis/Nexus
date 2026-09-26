'use strict';
/**
 * src/main/index.js — Clear Glass v3 SISO-native boot
 * UUID: cg-main-v3-0000-0000-000000000006
 * Version: 3.1.0 — NEXUS protocol fix
 *
 * Boot order (law — §3.1 bottom-up only):
 *   0. SISO bus created
 *   1. TLS proxy
 *   2. Fingerprint engine
 *   3. Cookie vault
 *   4. Context manager
 *   5. DOM archaeology
 *   6. ClearDriver
 *   7. URL listener
 *   8. API settings
 *   9. Co-pilot
 *  10. Agent mesh
 *  11. Diagnostic engine
 *  12. Gates registered on bus
 *  13. SSE server (subscribes to bus)
 *  14. NEXUS registration — POST /api/register to orchestrator :9000
 *  15. IPC bridge
 *  16. Active NEXUS probe — probes orchestrator + cortex + guardian
 *  17. Heartbeat — POST /api/heartbeat to orchestrator every 10s
 *  18. Tray
 *  19. Default window
 *  20. lifecycle.ready → bus
 *
 * NEXUS protocol (matches nexus-connect.js exactly):
 *   Register:  POST :9000/api/register   { systemId, port, meta, components[] }
 *   Heartbeat: POST :9000/api/heartbeat  { systemId, port, status }
 *   Event:     POST :9000/api/ledger     { system, type, payload }
 *              POST :3748/api/event      { type, payload, source, ts }
 *
 * Clear Glass sits alongside NEXUS systems as a peer — not nested inside.
 * It does not depend on nexus-wired or ErosmancerOS to boot.
 */

const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage } = require('electron');
const path   = require('path');
const http   = require('http');
const { randomUUID } = require('crypto');

// ── SISO bus — must be first ───────────────────────────────────────────────
const { createBus, emit, on, Event } = require('../core/bus');

const MODULE_ID   = 'clear-glass';
const MODULE_UUID = randomUUID();
const CG_VERSION  = '3.1.0';

// ── NEXUS port map — matches nexus-connect.js PORTS exactly ───────────────
const NEXUS_PORTS = {
  orchestrator: parseInt(process.env.ORCHESTRATOR_PORT  || '9000'),
  cortex:       parseInt(process.env.NEXUS_PORT         || '3748'),
  guardian:     parseInt(process.env.GUARDIAN_HTTP_PORT || '7820'),
  bridge:       parseInt(process.env.BRIDGE_PORT        || '9999'),
};

const SSE_PORT = parseInt(process.env.CLEARGL_SSE_PORT || '7701');
const IPC_PORT = parseInt(process.env.CLEARGL_IPC_PORT || '7702');
const TLS_PORT = parseInt(process.env.CLEARGL_TLS_PORT || '7703');

// ── Module imports ─────────────────────────────────────────────────────────
const SseServer         = require('../sse/server');
const TlsProxy          = require('../tls/proxy');
const FingerprintEngine = require('../fingerprint/engine');
const CookieVault       = require('../cookies/vault');
const ContextMgr        = require('../contexts/manager');
const DomArchaeology    = require('../dom/archaeology');
const ClearDriver       = require('../driver/index');
const UrlListener       = require('../driver/url-listener');
const ApiSettings       = require('../api/settings');
const CoPilotBridge     = require('../copilot/bridge');
const AgentMesh         = require('../mesh/agent-mesh');
const DiagnosticEngine  = require('../diagnostic/engine');
const IpcBridge         = require('../ipc/bridge');
const NexusOptions      = require('../options/store');
const { registerAll }   = require('../gates/index');
const COMPONENTS        = require('../../seam/registry-components');
const CONTRACT          = require('../../registry-components');   // flat contract shape for orchestrator
const EROS_COMPONENTS   = require('../../wire/eros-registry-components');

// ── Wire config ───────────────────────────────────────────────────────────
const EROS_PORT = parseInt(process.env.EROS_PORT || '7432');
const WIRE_PORT = parseInt(process.env.WIRE_PORT || '7704');

// ── State ──────────────────────────────────────────────────────────────────
let tray, sse, ipcBridge, nexusOptions;
let _heartbeatInterval = null;
const windows = new Map();

// ── Single instance ────────────────────────────────────────────────────────
app.setName('Clear Glass');
app.disableHardwareAcceleration();
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
app.on('second-instance', () => { const w = windows.values().next().value; if (w) { w.show(); w.focus(); } });
app.whenReady().then(bootstrap);
app.on('window-all-closed', e => e.preventDefault()); // tray-first — never quit on last window close
app.on('before-quit', shutdown);

// ── NEXUS HTTP helper — matches nexus-connect._req exactly ────────────────
// Returns { ok, data, error, ms } — never throws
function _ncReq(port, method, urlPath, body, timeout = 4000) {
  return new Promise(resolve => {
    const t0      = Date.now();
    const payload = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: '127.0.0.1', port, path: urlPath, method,
      headers: {
        'Content-Type':      'application/json',
        'X-Nexus-Source':    MODULE_ID,
        'X-Nexus-Call-UUID': randomUUID(),
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };
    const req = http.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        const ms = Date.now() - t0;
        try { resolve({ ok: res.statusCode < 400, data: JSON.parse(d), ms }); }
        catch { resolve({ ok: res.statusCode < 400, data: d, ms }); }
      });
    });
    req.setTimeout(timeout, () => { req.destroy(); resolve({ ok: false, error: 'timeout', ms: timeout }); });
    req.on('error', e => resolve({ ok: false, error: e.message, ms: Date.now() - t0 }));
    if (payload) req.write(payload);
    req.end();
  });
}

// ── NEXUS registration — POST /api/register with components[] ─────────────
// Matches bridge/index.js → nc.registerWithOrchestrator() call exactly
async function _registerWithNexus() {
  const r = await _ncReq(
    NEXUS_PORTS.orchestrator,
    'POST',
    '/api/register',
    {
      systemId:   MODULE_ID,
      port:       SSE_PORT,
      meta:       { role: 'browser', version: CG_VERSION, ipcPort: IPC_PORT, tlsPort: TLS_PORT },
      ts:         Date.now(),
      components: COMPONENTS,
    },
    5000,
  );

  if (r.ok) {
    console.log(`[ClearGlass §AXIOM] registered with orchestrator :${NEXUS_PORTS.orchestrator}`);
    // Also post to orchestrator ledger — matches nc.postLedger()
    _ncReq(NEXUS_PORTS.orchestrator, 'POST', '/api/ledger', {
      system: MODULE_ID,
      type:   'clear-glass.registered',
      payload: { port: SSE_PORT, ipcPort: IPC_PORT, tlsPort: TLS_PORT, version: CG_VERSION },
    }, 2000).catch(() => {});
  } else {
    console.log(`[ClearGlass §AXIOM] orchestrator offline — running standalone`);
  }
  return r;
}

// ── NEXUS event emit — matches nc.postEvent() exactly ─────────────────────
// Fire-and-forget. Never blocks caller.
function _postEvent(type, payload) {
  _ncReq(NEXUS_PORTS.orchestrator, 'POST', '/api/ledger',
    { system: MODULE_ID, type, payload }, 1200).catch(() => {});
  _ncReq(NEXUS_PORTS.cortex, 'POST', '/api/event',
    { type, payload, source: MODULE_ID, ts: Date.now() }, 1200).catch(() => {});
}

// ── Heartbeat — matches nc.startHeartbeat() exactly ───────────────────────
function _startHeartbeat() {
  const ping = () => _ncReq(
    NEXUS_PORTS.orchestrator, 'POST', '/api/heartbeat',
    { systemId: MODULE_ID, port: SSE_PORT, status: 'online' }, 2000,
  ).catch(() => {});
  ping();
  _heartbeatInterval = setInterval(ping, 10000);
  if (_heartbeatInterval.unref) _heartbeatInterval.unref();
}

// ── Bootstrap ──────────────────────────────────────────────────────────────
// ── Wire — inline nexus-wire.js ───────────────────────────────────────────
// Registers clear-glass AND ErosmancerOS with the orchestrator. Opens a thin
// HTTP server on WIRE_PORT (:7704) that:
//   GET  /contract        — contract-handshake endpoint for the orchestrator
//   GET  /health          — liveness probe
//   GET  /wire/health     — alias
//   POST /eros/*          — proxy to ErosmancerOS REST API
//   POST /bridge/driver   — ClearDriver → ErosmancerOS action mapping
//   POST /hook/hostile    — hostile detection → SISO bus fp.switch
//   POST /hook/behavior   — behavior plan → Cortex intelligence event
//
// Non-fatal: errors here are logged and swallowed — CG boot continues.

let _wireServer = null;

async function _startWire() {
  // ── Register ErosmancerOS with orchestrator ──────────────────────────────
  const erosReg = await _ncReq(NEXUS_PORTS.orchestrator, 'POST', '/api/register', {
    systemId:   'erosmancer-os',
    port:       EROS_PORT,
    meta:       { role: 'cdp-engine', version: '2.0.0', wirePort: WIRE_PORT },
    ts:         Date.now(),
    components: EROS_COMPONENTS,
  }, 5000);
  console.log(erosReg.ok
    ? `[ClearGlass/Wire §AXIOM] ErosmancerOS registered with orchestrator :${NEXUS_PORTS.orchestrator}`
    : '[ClearGlass/Wire §AXIOM] orchestrator offline — ErosmancerOS standalone');

  // ── Register nexus-wire itself ───────────────────────────────────────────
  await _ncReq(NEXUS_PORTS.orchestrator, 'POST', '/api/register', {
    systemId:   'nexus-wire',
    port:       WIRE_PORT,
    meta:       { role: 'integration-bridge', version: '1.1.0', hostedBy: 'clear-glass' },
    ts:         Date.now(),
    components: [],
  }, 5000);

  // ── Dual heartbeat ───────────────────────────────────────────────────────
  const wirePing = () => {
    _ncReq(NEXUS_PORTS.orchestrator, 'POST', '/api/heartbeat',
      { systemId: 'nexus-wire',    port: WIRE_PORT, status: 'online' }, 2000).catch(() => {});
    _ncReq(NEXUS_PORTS.orchestrator, 'POST', '/api/heartbeat',
      { systemId: 'erosmancer-os', port: EROS_PORT, status: 'online' }, 2000).catch(() => {});
  };
  wirePing();
  const _wireHb = setInterval(wirePing, 10000);
  if (_wireHb.unref) _wireHb.unref();

  // ── ErosmancerOS proxy helper ────────────────────────────────────────────
  function _proxyEros(method, urlPath, body, timeout = 15000) {
    return new Promise(resolve => {
      const payload = (body && method !== 'GET') ? JSON.stringify(body) : null;
      const req = http.request({
        hostname: '127.0.0.1', port: EROS_PORT, path: urlPath, method,
        headers: { 'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}) },
      }, res => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
          catch { resolve({ status: res.statusCode, body: d }); }
        });
      });
      req.setTimeout(timeout, () => { req.destroy(); resolve({ status: 504, body: { error: 'upstream timeout' } }); });
      req.on('error', e => resolve({ status: 502, body: { error: e.message } }));
      if (payload) req.write(payload);
      req.end();
    });
  }

  const ACTION_MAP = {
    click: '/api/os/click', type: '/api/os/type', hover: '/api/os/hover',
    scroll: '/api/os/scroll', navigate: '/api/os/navigate', evaluate: '/api/os/evaluate',
    screenshot: '/api/os/screenshot', waitForSelector: '/api/os/wait', attribute: '/api/os/attribute',
  };

  // ── HTTP server ──────────────────────────────────────────────────────────
  _wireServer = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      let parsed = {};
      try { parsed = body ? JSON.parse(body) : {}; } catch {}

      const u = req.url;

      // Contract endpoint — what the orchestrator verifies on boot
      if (u === '/contract' && req.method === 'GET') {
        return res.end(JSON.stringify(CONTRACT));
      }

      if ((u === '/health' || u === '/wire/health') && req.method === 'GET') {
        return res.end(JSON.stringify({ ok: true, module: 'nexus-wire', port: WIRE_PORT, ts: Date.now() }));
      }

      // ErosmancerOS proxy
      if (u.startsWith('/eros/')) {
        const erosPath = '/api' + u.replace(/^\/eros/, '');
        const up = await _proxyEros(req.method, erosPath, parsed);
        res.writeHead(up.status);
        return res.end(JSON.stringify(up.body));
      }

      // ClearDriver → ErosmancerOS action bridge
      if (u === '/bridge/driver' && req.method === 'POST') {
        const { action, agentId, ...args } = parsed;
        const endpoint = ACTION_MAP[action];
        if (!endpoint) { res.writeHead(400); return res.end(JSON.stringify({ error: `No Eros mapping: ${action}` })); }
        const up = await _proxyEros('POST', endpoint, { tabId: agentId, ...args }, 30000);
        res.writeHead(up.status);
        return res.end(JSON.stringify(up.body));
      }

      // Hostile detection → SISO bus (direct emit, no HTTP round-trip)
      if (u === '/hook/hostile' && req.method === 'POST') {
        const { level, type, tabId, recommendation } = parsed;
        console.log(`[ClearGlass/Wire] Hostile: ${type} (${level}) tab=${tabId}`);
        if (level === 'high' || level === 'critical') {
          emit('context.fp.switch', { agentId: tabId, mode: 'firefox', reason: `hostile:${type}` });
        }
        _postEvent('eros.hostile.detected', { level, type, tabId, recommendation });
        return res.end(JSON.stringify({ ok: true }));
      }

      // Behavior plan → Cortex intelligence
      if (u === '/hook/behavior' && req.method === 'POST') {
        const { planId, profile, variant, meta } = parsed;
        _postEvent('eros.behavior.plan', { planId, profile, variant, meta });
        return res.end(JSON.stringify({ ok: true }));
      }

      res.writeHead(404);
      res.end(JSON.stringify({ error: 'not found' }));
    });
  });

  await new Promise((resolve, reject) => {
    _wireServer.listen(WIRE_PORT, '127.0.0.1', resolve);
    _wireServer.on('error', reject);
  });

  console.log(`[ClearGlass/Wire] :${WIRE_PORT} ready — Eros:${EROS_PORT} ↔ NEXUS:${NEXUS_PORTS.orchestrator}`);
}

async function bootstrap() {
  console.log(`[ClearGlass v${CG_VERSION}] Boot — ${MODULE_UUID}`);

  // 0. SISO bus
  const bus = createBus('EVENTS');
  console.log('[ClearGlass] SISO bus →E→E→');

  // 1. TLS proxy — Firefox JA4 rewrite
  const tlsProxy = new TlsProxy({ port: TLS_PORT });
  await tlsProxy.start();
  console.log(`[ClearGlass] TLS proxy :${TLS_PORT}`);

  // 2. Fingerprint engine
  const fp = new FingerprintEngine();
  await fp.load();

  // 3. Cookie vault
  const vault = new CookieVault();
  await vault.init();

  // 4. Context manager — one Chromium partition per agent
  const ctxMgr = new ContextMgr({ fp, vault, sse: { emit: (t, d) => emit(t, d) }, tlsProxyPort: TLS_PORT });
  await ctxMgr.init();

  // 5. DOM archaeology — live DOM mesh via MutationObserver IPC
  const dom = new DomArchaeology({ sse: { emit: (t, d) => emit(t, d) } });

  // 6. ClearDriver — sovereign automation, no Playwright
  const driver = new ClearDriver({ ctxMgr, dom, vault, sse: { emit: (t, d) => emit(t, d) } });

  // 7. URL listener — glob/regex per-agent request hooks
  const urlListener = new UrlListener({ sse: { emit: (t, d) => emit(t, d) }, ctxMgr });

  // 8. API settings — sovereign config store
  const apiSettings = new ApiSettings();
  await apiSettings.load();

  // 8.5. Nexus options — window behavior + defaults, bus + UI controllable
  nexusOptions = new NexusOptions();
  await nexusOptions.load();

  // 9. Co-pilot — Cortex-wired, CFR-logged, DOM-aware
  const copilot = new CoPilotBridge({
    sse:         { emit: (t, d) => emit(t, d) },
    apiSettings,
    cortexPort:  NEXUS_PORTS.cortex,
    postEvent:   _postEvent,
  });

  // 10. Agent mesh — Claude, ChatGPT, Gemini, Perplexity, Mistral, Grok
  const mesh = new AgentMesh({ ctxMgr, driver, sse: { emit: (t, d) => emit(t, d) } });
  await mesh.init();

  // 11. Diagnostic engine — Playwright-equivalent on ClearDriver
  const diag = new DiagnosticEngine({ driver, dom, sse: { emit: (t, d) => emit(t, d) } });
  await diag.init();

  // 12. Register all gates on bus
  registerAll(bus, {
    driver,
    dom,
    ctxMgr,
    vault,
    copilot,
    mesh,
    diag,
    urlListener,
    openFn:      openAgentWindow,
    closeFn:     closeAgentWindow,
    minimizeFn:  minimizeAgentWindow,
    hideFn:      hideAgentWindow,
    getStatusFn: getStatus,
    postEvent:   _postEvent,
    options:     nexusOptions,
  });

  // 13. SSE server — subscribes to bus, broadcasts all events
  sse = new SseServer({ port: SSE_PORT, moduleId: MODULE_ID, moduleUuid: MODULE_UUID });
  await sse.start();
  console.log(`[ClearGlass] SSE server :${SSE_PORT}`);

  // 14. NEXUS registration
  await _registerWithNexus();
  _startHeartbeat();

  // 14.5. Wire — ErosmancerOS registration + :7704 HTTP server (non-fatal)
  _startWire().catch(err => console.warn(`[ClearGlass/Wire] start failed (non-fatal): ${err.message}`));

  // 15. IPC bridge — HTTP command endpoint :IPC_PORT + ipcMain handlers
  ipcBridge = new IpcBridge({
    port:        IPC_PORT,
    sse,
    ctxMgr,
    vault,
    apiSettings,
    urlListener,
    mesh,
    diag,
    fp,
    postEvent:   _postEvent,
    options:     nexusOptions,
    minimizeFn:  minimizeAgentWindow,
    hideFn:      hideAgentWindow,
    openSettingsFn: openSettingsWindow,
  });
  await ipcBridge.start();
  // §5.2 Contract IS the bridge — serve /contract so orchestrator can verify us
  if (ipcBridge.app) {
    ipcBridge.app.get('/contract', (req, res) => res.json(CONTRACT));
    ipcBridge.app.get('/health', (req, res) => res.json({
      ok: true, system: MODULE_ID, version: CG_VERSION,
      ssePort: SSE_PORT, ipcPort: IPC_PORT, tlsPort: TLS_PORT, ts: Date.now(),
    }));
    ipcBridge.app.get('/options', (req, res) => res.json(nexusOptions?.get() || {}));
    ipcBridge.app.get('/status', (req, res) => res.json(getStatus ? getStatus() : { ok: true }));
  }
  console.log(`[ClearGlass] IPC bridge :${IPC_PORT}`);

  // 16. Active NEXUS probe — drives status dots in renderer via SSE
  _startNexusProbe();

  // 17. Tray
  buildTray(mesh);

  // 18. Default window
  await openAgentWindow({ agentId: 'default', url: nexusOptions.get().defaultStartUrl });

  // 19. Ready
  emit('lifecycle.ready', {
    uuid:       MODULE_UUID,
    version:    CG_VERSION,
    ssePort:    SSE_PORT,
    ipcPort:    IPC_PORT,
    tlsPort:    TLS_PORT,
    components: COMPONENTS.length,
  });
  _postEvent('clear-glass.boot.complete', { uuid: MODULE_UUID, version: CG_VERSION, ssePort: SSE_PORT });
  console.log(`[ClearGlass v${CG_VERSION}] ✓ Ready — SSE:${SSE_PORT} IPC:${IPC_PORT} TLS:${TLS_PORT} | ${COMPONENTS.length} components registered`);

  // ── Helpers closed over deps ──────────────────────────────────────────
  function getStatus() {
    return {
      uuid:      MODULE_UUID,
      version:   CG_VERSION,
      siso:      bus.sampleHere ? bus.sampleHere() : {},
      contexts:  ctxMgr.listIds ? ctxMgr.listIds() : [],
      agents:    mesh.listAgents ? mesh.listAgents() : [],
      listeners: urlListener.list ? urlListener.list() : [],
      tls:       tlsProxy.getStats ? tlsProxy.getStats() : {},
      nexusPorts: NEXUS_PORTS,
      ts:        Date.now(),
    };
  }
}

// ── Active NEXUS probe — SSE-driven status, no hardcoded dots ─────────────
function _startNexusProbe() {
  const probe = async () => {
    const checks = await Promise.allSettled([
      _ncReq(NEXUS_PORTS.orchestrator, 'GET', '/health', null, 2500),
      _ncReq(NEXUS_PORTS.cortex,       'GET', '/health', null, 2500),
      _ncReq(NEXUS_PORTS.guardian,     'GET', '/health', null, 2500),
      _ncReq(NEXUS_PORTS.bridge,       'GET', '/health', null, 2500),
    ]);

    const [orch, cortex, guardian, bridge] = checks.map(c =>
      c.status === 'fulfilled' && c.value.ok
    );

    emit('nexus.status', {
      orchestrator: orch,
      cortex,
      guardian,
      bridge,
      all: orch && cortex,
      ts: Date.now(),
    });
  };
  probe();
  setInterval(probe, 10000);
}

// ── Tray ───────────────────────────────────────────────────────────────────
function buildTray(mesh) {
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip(`Clear Glass v${CG_VERSION} — NEXUS Browser →E→E→`);
  _rebuildTrayMenu(mesh);
  tray.on('double-click', () => {
    const w = windows.values().next().value;
    if (w) { w.show(); w.focus(); }
  });
}

function _rebuildTrayMenu(mesh) {
  const agentItems = [...windows.entries()].map(([id, win]) => ({
    label: `⬡ ${id}`,
    click: () => { win.show(); win.focus(); },
  }));

  const menuTemplate = [
    { label: `Clear Glass v${CG_VERSION} →E→E→`, enabled: false },
    { type: 'separator' },
    ...agentItems,
    ...(agentItems.length ? [{ type: 'separator' }] : []),
    { label: 'New Agent Context',  click: () => openAgentWindow({ agentId: randomUUID() }) },
    { label: 'NEXUS UI Audit',     click: () => emit('diag.nexus', { agentId: 'default' }) },
    { label: 'API Settings',       click: openSettingsWindow },
    { type: 'separator' },
    {
      label: 'Bus Log',
      click: () => {
        const { getLog } = require('../core/bus');
        console.log('[ClearGlass Bus]', JSON.stringify(getLog()?.sample(), null, 2));
      },
    },
    { label: 'Quit', click: () => app.quit() },
  ].filter(Boolean);

  tray.setContextMenu(Menu.buildFromTemplate(menuTemplate));
}

// ── Window management ──────────────────────────────────────────────────────
async function openAgentWindow({ agentId = randomUUID(), url = 'about:blank' } = {}) {
  if (windows.has(agentId)) {
    windows.get(agentId).show();
    return windows.get(agentId);
  }

  const win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 800, minHeight: 600,
    frame: false, backgroundColor: '#08080d',
    webPreferences: {
      preload:          path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      webviewTag:       true,
    },
    title: `Clear Glass — ${agentId}`,
    show:  false,
  });

  win.loadFile(path.join(__dirname, '../../renderer/browser.html'), {
    query: { agentId, ssePort: SSE_PORT, ipcPort: IPC_PORT },
  });

  win.once('ready-to-show', () => win.show());
  win.on('close', e => {
    // §axiom: tray-first — but now genuinely controllable via Nexus options
    // instead of hardcoded. If the option is off, this is a real close.
    if (nexusOptions?.get().hideToTrayOnClose ?? true) {
      e.preventDefault();
      win.hide();
    }
  });
  win.on('closed', () => windows.delete(agentId));

  windows.set(agentId, win);
  emit('window.opened', { agentId });
  _postEvent('clear-glass.window.opened', { agentId });
  return win;
}

function closeAgentWindow({ agentId }) {
  windows.get(agentId)?.destroy();
  windows.delete(agentId);
}

function minimizeAgentWindow({ agentId }) {
  windows.get(agentId)?.minimize();
}

function hideAgentWindow({ agentId }) {
  windows.get(agentId)?.hide();
}

function openSettingsWindow() {
  const win = new BrowserWindow({
    width: 800, height: 620, backgroundColor: '#08080d',
    webPreferences: {
      preload:          path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
    title: 'Clear Glass — API Settings',
  });
  win.loadFile(path.join(__dirname, '../../renderer/settings.html'));
}

// ── Shutdown ───────────────────────────────────────────────────────────────
async function shutdown() {
  emit('lifecycle.shutdown', { uuid: MODULE_UUID });
  _postEvent('clear-glass.shutdown', { uuid: MODULE_UUID });

  if (_heartbeatInterval) clearInterval(_heartbeatInterval);

  await Promise.allSettled([
    ipcBridge?.stop(),
    sse?.stop(),
    _wireServer ? new Promise(r => _wireServer.close(r)) : Promise.resolve(),
  ]);
}

module.exports = { openAgentWindow, closeAgentWindow, minimizeAgentWindow, hideAgentWindow, windows };
