'use strict';
/**
 * clear-glass/src/ipc/agent-routes.js — the synchronous agent surface on :7702.
 * comp_id: clear-glass.ipc.agent-routes
 * UUID: cg-ipc-agent-routes-v1-0000-2026-0927-jamesbrooks-001
 * Version: 1.0.0
 *
 * James, 2026-09-27: "i want copilot completely aware of clearglass, hooked in completely. all of it, copilot can use it."
 *
 * WHAT WAS MISSING (mapped before building):
 *   - Every browser action an agent could take (driver.exec: 30 actions) reached Clear Glass only as a bus event:
 *     POST /cmd answers {emitted} and the result goes out on SSE. A caller outside this process either opened an SSE
 *     stream and matched a requestId (guardian/clear-glass-bridge.js does, through a guardian job: 4 hops) or got
 *     nothing back. copilot's tool loop needs the result IN the call, to decide the next step.
 *   - "What is on this page" had no answer short of the agent writing its own eval script (page/reader.js closes it).
 *   - "What is Clear Glass doing right now" was nine separate GETs (/status, /cli/agents, /cli/bgtab, /providers,
 *     /cli/accounts, /cli/autofill/profiles, /cli/macros, /cli/userscripts, /cli/downloads).
 *
 * ROUTES (all JSON; mounted by ipc/bridge.js, so /cli/commands indexes them automatically):
 *   POST /cli/driver        { action, agentId?, ...args }  → the driver's own result, awaited (timeoutMs, default 30s)
 *   POST /cli/page/read     { agentId?, maxText? ... }      → page/reader.js normalize() shape
 *   GET  /cli/state         ?agentId=                        → one snapshot of everything above, each source degrading alone
 *   GET  /cli/invoke                                        → every IPC channel (grouped; denied ones named with the reason)
 *   POST /cli/invoke        { channel, args?, agentId? }     → that channel's own handler, awaited (ipc/handler-registry.js)
 *   GET  /cli/attention                                      → each window's attention: page changes, the field's last map/spotlight/pointer (§FN2 0.59.0)
 *
 * Same handlers, second door — the driver is the same instance the bus gate calls; nothing is reimplemented.
 */

const MODULE_ID = 'clear-glass.ipc.agent-routes';
const VERSION = '1.0.0';
const DEFAULT_TIMEOUT_MS = 30000;

function _withTimeout(promise, ms, what) {
  let t;
  return Promise.race([
    promise.finally(() => clearTimeout(t)),
    new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`${what} did not finish within ${ms}ms`)), ms); }),
  ]);
}

// Each source is read on its own; one failing source is named in `blind`, never shown as empty.
async function _safe(blind, key, fn, fallback = null) {
  try { return await fn(); }
  catch (e) { blind.push({ source: key, error: e.message }); return fallback; }
}

async function buildState(deps, { agentId = null, pageTimeoutMs = 2500 } = {}) {
  const { driver, providerHost, options, autofillStore, macroTool, userscripts, downloads, ctxMgr, mesh, listAgents, listBgTabs } = deps;
  const blind = [];
  const open = await _safe(blind, 'agents', () => (listAgents ? listAgents() : { windows: [], bgTabs: [] }), { windows: [], bgTabs: [] });
  const bgTabs = await _safe(blind, 'bgTabs', () => (listBgTabs ? listBgTabs() : []), []);
  const ids = [...new Set([...(open.windows || []), ...(open.bgTabs || []), ...(agentId ? [agentId] : [])])];
  const pages = {};
  if (driver) {
    await Promise.all(ids.map(async (id) => {
      try {
        const [u, t] = await Promise.all([
          _withTimeout(driver.exec({ action: 'getUrl', agentId: id }), pageTimeoutMs, 'getUrl'),
          _withTimeout(driver.exec({ action: 'getTitle', agentId: id }), pageTimeoutMs, 'getTitle'),
        ]);
        pages[id] = { url: (u && (u.url || u.result)) || null, title: (t && (t.title || t.result)) || null };
      } catch (e) { pages[id] = { error: e.message }; }
    }));
  } else blind.push({ source: 'driver', error: 'driver not wired into the IPC bridge' });

  const accounts = await _safe(blind, 'accounts', () => (options ? options.listAccounts() : []), []);
  const profiles = await _safe(blind, 'autofillProfiles', () => (autofillStore ? autofillStore.listProfiles() : []), []);
  const macros = await _safe(blind, 'macros', async () => { if (!macroTool) return []; const r = await macroTool.execute({ action: 'list' }); return r.macros || r.list || r || []; }, []);
  const scripts = await _safe(blind, 'userscripts', () => (userscripts ? userscripts.list({}) : []), []);
  const dls = await _safe(blind, 'downloads', () => (downloads ? downloads.list({}) : []), []);
  const wx = await _safe(blind, 'extensions', () => (deps.webExtensions && deps.webExtensions.list ? deps.webExtensions.list() : []), []);
  return {
    ok: true,
    module: 'clear-glass',
    agents: ids.map(id => ({ agentId: id, window: (open.windows || []).includes(id), background: (open.bgTabs || []).includes(id), ...(pages[id] || {}) })),
    bgTabs,
    providers: await _safe(blind, 'providers', () => (providerHost ? providerHost.list() : []), []),
    contexts: await _safe(blind, 'contexts', () => (ctxMgr ? ctxMgr.listIds() : []), []),
    mesh: await _safe(blind, 'mesh', () => (mesh ? mesh.listAgents() : []), []),
    accounts: (accounts || []).map(a => ({ id: a.id, name: a.name || a.label || null, providers: a.providers ? Object.keys(a.providers) : [] })),
    autofillProfiles: (profiles || []).map(p => ({ id: p.id, name: p.name || p.label || null })),
    macros: Array.isArray(macros) ? macros.map(m => (typeof m === 'string' ? m : m.name)).filter(Boolean) : [],
    userscripts: Array.isArray(scripts) ? scripts.map(s => ({ id: s.id, name: s.name, enabled: s.enabled !== false })) : [],
    recentDownloads: Array.isArray(dls) ? dls.slice(-5).map(d => ({ id: d.id, filename: d.filename || d.name, state: d.state })) : [],
    extensions: Array.isArray(wx) ? wx.map(x => ({ id: x.id, name: x.name, enabled: x.enabled !== false })) : [],
    ipcChannels: deps.handlers ? deps.handlers.list().length : null,
    blind,
    ts: Date.now(),
  };
}

function install(app, deps) {
  app.post('/cli/driver', async (req, res) => {
    const body = req.body || {};
    if (!deps.driver) return res.status(503).json({ ok: false, error: 'driver not wired into the IPC bridge' });
    if (!body.action) return res.status(400).json({ ok: false, error: 'action required (navigate, click, type, setValue, select, check, upload, pressKey, readPage, screenshot, eval, waitFor, getUrl, getTitle, ...)' });
    const { timeoutMs, ...payload } = body;
    try {
      const result = await _withTimeout(deps.driver.exec({ agentId: 'default', ...payload }), +timeoutMs || DEFAULT_TIMEOUT_MS, `driver ${body.action}`);
      res.json({ ok: true, action: body.action, agentId: payload.agentId || 'default', result });
    } catch (e) {
      res.status(502).json({ ok: false, action: body.action, agentId: payload.agentId || 'default', error: e.message });
    }
  });

  app.post('/cli/page/read', async (req, res) => {
    if (!deps.driver) return res.status(503).json({ ok: false, error: 'driver not wired into the IPC bridge' });
    const body = req.body || {};
    try {
      const r = await _withTimeout(deps.driver.exec({ ...body, action: 'readPage', agentId: body.agentId || 'default' }), +body.timeoutMs || DEFAULT_TIMEOUT_MS, 'readPage');
      res.status(r && r.ok === false ? 502 : 200).json(r);
    } catch (e) { res.status(502).json({ ok: false, error: e.message }); }
  });

  // Every IPC channel — the renderer's whole surface — by name. GET lists, POST runs the same handler.
  app.get('/cli/invoke', (req, res) => {
    if (!deps.handlers) return res.status(503).json({ ok: false, error: 'handler registry not installed' });
    const channels = deps.handlers.list();
    const q = String(req.query.q || '').toLowerCase();
    const shown = q ? channels.filter(c => c.channel.toLowerCase().includes(q)) : channels;
    res.json({ ok: true, count: shown.length, total: channels.length, channels: shown });
  });
  app.post('/cli/invoke', async (req, res) => {
    if (!deps.handlers) return res.status(503).json({ ok: false, error: 'handler registry not installed' });
    const b = req.body || {};
    const r = await deps.handlers.invoke(b.channel, b.args, { agentId: b.agentId || null, timeoutMs: +b.timeoutMs || DEFAULT_TIMEOUT_MS });
    res.status(r.ok ? 200 : r.denied ? 403 : /^no handler/.test(r.error || '') ? 404 : 502).json(r);
  });

  // §FN2 0.59.0 — where each window's attention is (page/attention.js): page changes and the interaction field's last
  // map, spotlight and pointer. Read by Nexus Nerve (lib/nerve) and `idearium field windows`. Observation only.
  app.get('/cli/attention', (req, res) => {
    try { res.json({ ok: true, windows: require('../page/attention').shared().windows(), ts: Date.now() }); }
    catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  app.get('/cli/state', async (req, res) => {
    try { res.json(await buildState(deps, { agentId: req.query.agentId || null })); }
    catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });
}

module.exports = { MODULE_ID, VERSION, install, buildState };
