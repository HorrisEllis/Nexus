'use strict';
let _viewAt = 0;   // the view's file time, read again when it changes
/**
 * cos/manager/server.js — COS's manager as its own process: `node cos/manager/server.js [--boot]`.
 * Spec: cos/spec/cos-manager.spec MOD-MG-SERVER · Map: docs/2026-10-24-cos-manager-phasemap.spec MG15_the_supervisor_in_cos
 *
 * The supervisor's routes under /api/cos/ on :7799 (COS_MANAGER_PORT overrides), 127.0.0.1 only, headless. :7799 is autopilot's door; while
 * an old autopilot holds it this server says so and exits instead of starting a second supervisor (MG-001). autopilot's own routes on this
 * door are MG16's. Since MG17 (0.60.330) lib/nexus/autopilot.js launches it: --only=a,b is the boot set for --boot, --handover=<version>
 * writes the 'handover' line naming the release, --root=<dir> reads another tree's declarations (a fixture).
 *   GET  /api/cos/health · /api/cos/systems · /api/cos/systems/:name · /api/cos/ledger[?system&limit] · /api/cos/policy
 *   POST /api/cos/boot · /api/cos/systems/:name/(start|stop|restart|touch|reset-circuit|pause|resume) — each act carries { by } (MG-006); pause/resume CP5b
 *   PATCH /api/cos/policy
 * CE2b (0.60.417): POST /api/cos/update/restart { by, what: cos | <system> } — his yes to an update's ask; COS restarts itself (relaunch.js)
 * MG18 (0.60.337, MG_D16): GET /api/cos/contract · /api/cos/events (server-sent: cos.ledger, cos.system.state) · /api/cos/usage ·
 *   /api/cos/systems/:name/logs · /api/cos/proposals; POST /api/cos/proposals (an agent's) · /api/cos/proposals/:id/(take|drop) (a person's)
 */
const http = require('http');
const path = require('path');
const { createSupervisor } = require('./supervisor.js');
const { createProposals } = require('./proposals.js');
const usage = require('./usage.js');
const CONTRACT = path.join(__dirname, 'contract.json');

function createServer(sup, opts = {}) {
  const { root = path.resolve(__dirname, '..', '..') } = opts;
  const door = require('./autopilot-door.js').mount(sup, { ROOT: root });   // MG16: autopilot's routes, in its shapes (MG-003)
  const send = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  // PR6 slice a: a beat or a registration passed on to the Orchestrator (its origin from its declaration); no answer awaited, an error dropped
  const _onward = (path, raw) => { try { const d = sup.declarations().find(x => x.name === 'orchestrator'); let port = 9000; try { if (d && d.healthUrl) port = Number(new URL(d.healthUrl).port) || 9000; } catch (_) {}
    const q = http.request({ host: '127.0.0.1', port, path, method: 'POST', timeout: 3000, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(raw || '') } }, (r) => r.resume());
    q.on('timeout', () => q.destroy()); q.on('error', () => {}); q.end(raw || ''); } catch (_) {} };
  const proposals = createProposals(sup);   // MG18: agents' held acts
  // 2026-11-12 — James: "Need to be able to propose restarts." An agent could propose restarting a system (MG18); COS itself was not a target.
  // Now: { verb: 'restart-cos', target: 'cos', why, by: agent:<name> } is held; taken by him, COS restarts itself the way an update's yes does.
  proposals.register('restart-cos', {
    check: ({ target, payload }) => { if (target !== 'cos') throw Object.assign(new Error('restart-cos restarts COS itself: { "target": "cos" } (a system is { "verb": "restart", "target": "<system>" })'), { code: 400 });
      if (typeof opts.restartCos !== 'function') throw Object.assign(new Error('this COS was not started to restart itself: nothing to propose'), { code: 409 }); return { payload: payload || null }; },
    run: (p, { by }) => opts.restartCos({ by }) });
  const resources = require('./resources.js').createResources(sup, { proposals, onSample: (u) => broadcast('cos.usage', { usage: u }) });   // PR6 slice a: the sample on the stream   // CP6a: caps by layer, read back; the account; pressure → a proposal
  // CE2 0.60.376 — Nexus's update as COS's: per system, the tool behind the toast (cos/manager/updates.js); every step on the event stream
  const updates = require('./updates.js').createUpdates(sup, { root, emit: (e, d) => { broadcast(e, d); if (e === 'cos.update') notices.fromUpdate(d); },
    // CE2b 0.60.417 — James, 2026-11-06: "updates need to restart cos." · on Clear Glass: "Ask me first". The yes is his (POST /api/cos/update/restart);
    // how COS restarts is the process's (listen's opts.restartCos, set by the main block below), and what would close with it is said first
    restartCos: (x) => (typeof opts.restartCos === 'function' ? opts.restartCos(x) : { ok: false, error: 'this manager was not started to restart itself' }),
    closesWithCos: () => sup.list().filter(s => s.name === 'clear-glass' && s.state === 'running').map(s => s.name) });
  // SC1–SC4 0.60.380 (docs/2026-11-02-cos-console-phasemap.spec) — James, 2026-11-02: "notification bell for update, system status,  notications" ·
  // "Need configuration for each system" · "add system" · "Need the system cli". The bell keeps what the ledger and the update tool say; the
  // configuration is applied by the supervisor through one hook (adjust); adding a system is a proposal; the CLI is COS's own table.
  const notices = require('./notices.js').createNotices({ file: path.join(path.dirname(sup.ledgerFile), 'notices.json'), emit: (e, d) => broadcast(e, d) });
  const config = require('./system-config.js').createSystemConfig(sup, { resources });
  sup.setHooks({ adjust: config.adjust });
  const addSystem = require('./add-system.js').createAddSystem(sup, proposals, { root });
  const deploy = require('./deploy.js').createDeploy(sup, proposals);   // OC4a 0.60.445: deploy a task, agent or pipeline to any system, through a proposal
  // OC8a — the hub: every automation slot, read live from its owner (docs/orchestration-console.spec MOD-OC-HUB)
  const hub = require('./hub.js').createHub(sup, { own: async (m, p) => { try { if (p.startsWith('/api/cos/automation/')) { const r = await automation.handle({ method: m, url: '/automation' + p.slice('/api/cos/automation'.length) }); return { status: (r && r.status) || 500 }; } if (p.startsWith('/api/cos/deployments')) deploy.deployments(); else proposals.list({}); return { status: 200 }; } catch (_) { return { status: 500 }; } } });
  // DK2 0.60.382 (docs/2026-11-02-cos-disk-phasemap.spec) — James, 2026-11-02: "Use the spec as metadata then have the actual file be a compressed or
  // virtual disk or envirement." Each system's disk: its spec as metadata, its files in one compressed file, in COS's own data
  const disks = require('../disk/disk.js').createDisks({ root });
  // DK6–DK8 0.60.383 — James, 2026-11-03: "It needs to be a virtual disk. For the virtual envirements for qumu also. Like it holds all the data,
  // snapshots, system state." Each system's qcow2: its metadata, files and data in one ext4, its snapshots inside the same file
  const vdisks = require('../disk/vdisk.js').createVDisks({ root, disks });
  // CA3b (cos/spec/network.spec MOD-NET-TUNNEL, MOD-NET-CFD-BIN) — James, 2026-11-03: "can you get cloudflared working in cos. the settings in the
  // network settings. i want to have it connect to a cloudflared url and popup on the screen with a qr code and the link under it". The ledger says that a
  // tunnel is up, never where: whoever has the address reaches the system, so any address in a message is hidden before it is written.
  const NET = require('./network-settings.js'); const cfd = require('./cloudflared.js');
  const hide = (t) => String(t).replace(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/gi, 'https://<address>');
  const netNote = (t) => { try { sup.note('network', hide(t), { by: 'rule:tunnel' }); } catch (_) { /* the ledger said it could not */ } };
  const tunnel = require('./tunnel.js').createTunnel({ sup, settings: NET, cfd, log: netNote, note: netNote });
  tunnel.setInstaller(cfd.createInstaller({}));
  process.once('exit', () => tunnel.dispose());
  const cli = require('./cli.js').createCli({ restartCos: (x) => (typeof opts.restartCos === 'function' ? opts.restartCos(x) : { ok: false, error: 'this manager was not started to restart itself' }), sup, resources, config, notices, proposals, addSystem, usage, disks, vdisks, pipelineSync: (o) => syncPipelines(o), graphCensus: (o) => pipeline.graphCensus(o), locationOf: (name) => _locationOf(name), network: NET, tunnel });
  sup.on('ledger', (entry) => { try { notices.fromLedger(entry); } catch (_) {} });
  const checkNotice = () => { try { notices.fromNotice(require('../../lib/nexus-update.js').notice({ root })); } catch (_) {} };
  const noticeTick = setInterval(checkNotice, 10 * 60 * 1000); if (noticeTick.unref) noticeTick.unref(); setTimeout(checkNotice, 2000).unref();
  const cpuTick = setInterval(() => { config.watchCpu().catch(() => {}); }, 30000); if (cpuTick.unref) cpuTick.unref();
  // MG18 (MG_D16): the one event stream the UI floats on. Every ledger line as it is written; a system's state when it changes (read each
  // second from the supervisor's own view, so a state reached without a ledger line, 'up' after health, is heard too).
  const streams = new Set(); let last = new Map();
  const broadcast = (event, data) => { const f = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`; for (const r of streams) { try { r.write(f); } catch (_) { streams.delete(r); } } };
  // AE6 slice a (docs/2026-10-25-automation-engine-to-orchestrator-phasemap.spec) — James, 2026-11-06: "Have cos be the orchastrator complelelt."
  // COS runs the automation engine (moved from the orchestrator) and streams its run events on /api/cos/events
  const automation = require('./automation-door.js');
  automation.setBus((type, data) => { if (data && (data.value !== undefined || data.vars !== undefined)) { const { value, vars, ...rest } = data; broadcast(type, rest); } else broadcast(type, data); if (pipeline && /^automation\.pipeline\./.test(type)) pipeline.onEvent(type, data); });   // the whole value goes to the request's files, the stream keeps the preview   // 2026-11-09: a request's files follow its run (cos/pipeline/runs.js)
  // 0.60.538 — James, 2026-11-14: "persistence is non negiatiable until the contract has been fullfilled, or dag is complete". Once COS is up, a run
  // left "running" by a restart resumes from its last finished step (its step nodes on disk); said in the log, never silent.
  setTimeout(() => { automation.resume().catch(e => console.warn(`[cos/automation] resuming interrupted runs failed: ${e.message}`)); }, 8000).unref();
  let pipeline = null;
  // the api step's nexus://<system>: the address of a system COS declares, from its health URL (never a fixed port)
  // 0.60.543 — his run, 2026-11-14, with 3 of 13 systems up and Idearium down: a pipeline step that needs a system starts it. Resolving
  // nexus://<system> marks it busy (touch: COS's idle rule does not stop it mid-step) and, when it is down and not held (circuit open, paused),
  // COS starts it, said in the ledger as by 'pipeline'; the step then waits for it to answer (2, 4, 8, 16, 30 s, 0.60.538).
  // 0.60.591 — James, 2026-11-19: "this is why we need to use nexus:// for each system instead of a port so we multiplex … so nothing is hardcoded."
  // nexus://<system>.<surface> is the address the system declares under that name (runtime.process.addresses: { cmd: … }); nexus://<system> its
  // main one (its health's origin), as before. Found: Clear Glass's commands are on :7702, its health on :7704, and a guess from the health
  // address sent Open UI to the wrong one. One resolver for the pipeline's api steps and COS's own acts.
  // what a system declares itself (the bootstrap, and what COS hands RAID): never the answer while RAID answers
  const declaredAddress = (name) => { const [sys, surface] = String(name).split('.'); const d = sup.declarations().find(x => x.name === sys || x.system === sys); if (!d) return null;
    if (surface) return (d.addresses && d.addresses[surface]) || null;
    try { return d.healthUrl ? new URL(d.healthUrl).origin : null; } catch (_) { return null; } };
  // 0.60.592 — James, 2026-11-19: "shouldn't it be the resolver" (RAID handles inbound requests). COS hands RAID the table of every system's own
  // addresses and asks RAID to resolve; RAID's answers are kept (cos/data/manager/raid-addresses.json) so names resolve while RAID restarts; only
  // a name RAID never answered falls back to the declaration, said once. RAID's own address (cortex's declaration) is the one bootstrap entry.
  const _cacheFile = path.join(path.dirname(sup.ledgerFile), 'raid-addresses.json');
  const _cache = (() => { try { return JSON.parse(require('fs').readFileSync(_cacheFile, 'utf8')); } catch (_) { return {}; } })();
  const _keep = () => { try { require('fs').writeFileSync(_cacheFile, JSON.stringify(_cache)); } catch (_) {} };
  const _raid = (method, pth, body) => new Promise((resolve) => { const o = declaredAddress('cortex'); if (!o) return resolve(null);
    const data = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const q = http.request(o + pth, { method, timeout: 2000, headers: data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {} }, (r) => { let t = ''; r.on('data', (c) => { t += c; }); r.on('end', () => { try { resolve({ status: r.statusCode, body: JSON.parse(t) }); } catch (_) { resolve(null); } }); });
    q.on('timeout', () => q.destroy()); q.on('error', () => resolve(null)); if (data) q.write(data); q.end(); });
  const addressTable = () => { const t = {}; for (const d of sup.declarations()) { let main = null; try { main = d.healthUrl ? new URL(d.healthUrl).origin : null; } catch (_) {}
    const surfaces = {}; for (const [k, v] of Object.entries(d.addresses || {})) if (k !== 'about' && typeof v === 'string') surfaces[k] = v; t[d.name] = { main, surfaces }; } return t; };
  let _pushed = null;
  const pushAddresses = async () => { const t = addressTable(), sig = JSON.stringify(t); if (sig === _pushed) return; const r = await _raid('POST', '/api/raid/addresses', { table: t, by: 'cos' }); if (r && r.status === 200) _pushed = sig; };
  setTimeout(() => { pushAddresses().catch(() => {}); }, 5000).unref(); setInterval(() => { pushAddresses().catch(() => {}); }, 5 * 60 * 1000).unref();
  const _saidFallback = new Set();
  const addressOf = async (name) => {
    const r = await _raid('GET', `/api/raid/resolve?name=${encodeURIComponent(name)}`);
    if (r && r.body && r.body.ok) { const base = r.body.url; if (_cache[name] !== base) { _cache[name] = base; _keep(); } return base; }
    if (r && r.body && r.body.ok === false && r.status === 404) { await pushAddresses(); const again = await _raid('GET', `/api/raid/resolve?name=${encodeURIComponent(name)}`); if (again && again.body && again.body.ok) { _cache[name] = again.body.url; _keep(); return again.body.url; } }
    if (_cache[name]) return _cache[name];   // RAID away: its last answer
    const d = declaredAddress(name); if (d && !_saidFallback.has(name)) { _saidFallback.add(name); console.log(`[cos] ${name}: RAID did not resolve it (${(r && r.body && r.body.why) || 'RAID did not answer'}); its own declaration used`); }
    return d; };
  automation.setResolver(async (name0) => { const name = String(name0).split('.')[0]; const d = sup.declarations().find(x => x.name === name || x.system === name);
    if (d) { try { sup.touch(d.name); const v = sup.get(d.name);
      if (!v.pid && !['paused', 'starting', 'restarting'].includes(v.state) && !(v.circuit && v.circuit.open)) sup.start(d.name, { by: 'pipeline' }); } catch (_) {} }
    return addressOf(name0); });
  // PC1 — the box shape, through COS's door (cos/pipeline/boxes.js → Emerge's cos/pipeline/box.eg); Idearium's procedures by its route
  const _ideariumGet = (pth) => new Promise((resolve, reject) => {
    const d = sup.declarations().find(x => x.name === 'idearium'); let o; try { o = new URL(d && d.healthUrl).origin; } catch (_) { return reject(new Error('idearium declares no address')); }
    const q = http.get(o + pth, { timeout: 10000 }, (r) => { let t = ''; r.on('data', c => t += c); r.on('end', () => { try { const j = JSON.parse(t || '{}'); r.statusCode >= 400 ? resolve(null) : resolve(j); } catch (e) { reject(e); } }); });
    q.on('timeout', () => q.destroy(new Error('no answer in 10 s'))); q.on('error', reject);
  });
  // PC5 (2026-11-09) — James: "Gates can hold context, test, verify, gates would do a lot. But not the same everytime." COS's gates: the types are
  // files, the deciding is Emerge's (cos/pipeline/gate.eg); a gate's calls reach each owner by its declared address (§5.15), 'cos' is this manager
  // 0.60.489: max is how much of the answer the caller takes (a gate reads 4,096 characters; a list needs it whole). An answer longer than
  // that says so (cut: true), so a caller never parses half an answer as a whole one.
  const _systemCall = (owner, method, pth, body, max = 4096) => new Promise((resolve) => {
    let origin = null;
    if (owner === 'cos') origin = `http://127.0.0.1:${(srvRef.server && srvRef.server.address() && srvRef.server.address().port) || 0}`;
    else { const d = sup.declarations().find(x => x.name === owner || x.system === owner); try { origin = d && d.healthUrl ? new URL(d.healthUrl).origin : null; } catch (_) {} }
    if (!origin) return resolve({ error: `${owner} is not declared to COS, or declares no address` });
    const data = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const q = http.request(origin + pth, { method, timeout: 20000, headers: { 'X-Nexus-Caller': 'cos-gate', ...(data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {}) } }, (r) => {
      let t = '', total = 0; const cap = Math.max(65536, max); r.setEncoding('utf8'); r.on('data', c => { total += c.length; if (t.length < cap) t += c; }); r.on('end', () => resolve({ status: r.statusCode, body: t.slice(0, max), cut: total > max, length: total })); });
    q.on('timeout', () => q.destroy(new Error('no answer in 20 s'))); q.on('error', (e) => resolve({ error: e.code || e.message }));
    if (data) q.write(data); q.end();
  });
  const srvRef = {};
  let desktop = null;   // PC9: made on first use
  let _intelWake = null;
  // CA7 slice a: the console asks the same thing the route answers (one system's location), through COS's own route
  const _locationOf = (name) => new Promise((resolve) => { const port = srvRef.server && srvRef.server.address() && srvRef.server.address().port;
    if (!port) return resolve({ ok: false, error: 'COS is not listening yet' });
    http.get(`http://127.0.0.1:${port}/api/cos/${name ? `systems/${encodeURIComponent(name)}/location` : 'locations'}`, { timeout: 30000 }, (r) => { let t = ''; r.on('data', c => t += c); r.on('end', () => { try { resolve(JSON.parse(t)); } catch (_) { resolve({ ok: false, error: 'not JSON' }); } }); }).on('error', (e) => resolve({ ok: false, error: e.message })); });   // 0.60.524: the one wait while Intelligence is woken for the Emergence page
  // 2026-11-09 — James: "This needs to be a module." COS's pipeline module (cos/pipeline/): the box shape, the gates, requests kept as files
  pipeline = require('../pipeline/index.js').createPipeline({ automation, idearium: _ideariumGet, call: _systemCall,
    dataDir: process.env.COS_MANAGER_DATA || path.join(root, 'cos', 'data', 'manager') });
  const { boxes, gates } = pipeline;
  automation.setGate((q) => pipeline.decideGate(q));
  automation.setFramework((q) => pipeline.frameworkStep(q));   // a framework as a step: compiled here, with every framework it runs
  // every pipeline a physical node file, imported at start (a system that does not answer yet is said; its last files are kept)
  // 0.60.517 — James, 2026-11-13: "also all pipelines in nexus need to be here." The sync ran once, 1.5 s after COS started, before Idearium or
  // Clear Glass answered, and never again: the tab stayed at 0. Now it runs again whenever a system it reads pipelines from comes up (its spawn,
  // resume or first beat in the ledger: heard, not polled, PR6), when a person asks (the tab's Sync, `pipeline-sync`), and says what it did.
  let lastSync = null, syncing = null;
  const syncSources = (() => { try { return (JSON.parse(require('fs').readFileSync(path.join(root, 'cos', 'pipeline', 'registry.json'), 'utf8')).pipelineSources.systems || []).map(x => x.system); } catch (_) { return ['idearium', 'clear-glass']; } })();
  function syncPipelines({ why = 'start' } = {}) {
    if (syncing) return syncing;
    syncing = pipeline.sync().then((r) => { lastSync = { at: Date.now(), why, ...r }; broadcast('cos.pipeline.synced', { at: lastSync.at, why, imported: r.imported, updated: r.updated, failed: (r.failed || []).length, systems: r.systems }); return lastSync; })
      .catch((e) => { lastSync = { at: Date.now(), why, ok: false, error: e.message, files: [], systems: [], imported: 0, updated: 0, failed: [] }; return lastSync; })
      .finally(() => { syncing = null; });
    return syncing;
  }
  const syncLater = {};
  sup.on('ledger', (e) => { if (!e || !syncSources.includes(e.system) || !/^(spawn|resumed|pulse|pulse-recovered)$/.test(String(e.kind))) return;
    clearTimeout(syncLater[e.system]); const t = setTimeout(() => { syncPipelines({ why: `${e.system} ${e.kind}` }).catch(() => {}); }, e.kind === 'spawn' ? 20000 : 3000); if (t.unref) t.unref(); syncLater[e.system] = t; });
  if (!opts.noPipelineSync) { const t = setTimeout(() => { syncPipelines({ why: 'start' }).catch(() => {}); }, 1500); if (t.unref) t.unref(); }
  sup.on('ledger', (entry) => {
    broadcast('cos.ledger', { entry });
    // 2026-11-09 — James: "Also conditions, triggers, events, etc. migrate BrainOS' features to the engine." What COS records is an event the
    // engine's triggers hear: cos.ledger, its subject "<system> <kind>" (a trigger matches it: "idearium crash*", "* restart")
    try { if (entry && !/^automation\./.test(String(entry.kind || ''))) automation.engine().emitEvent('cos.ledger', { name: `${entry.system || 'cos'} ${entry.kind || ''}`.trim(), system: entry.system || null, kind: entry.kind || null, by: entry.by || null }); } catch (_) {}
  });
  // 2026-11-05 SC11 — James: "cos needs the console from the autopilot. like a console tab". Every line a system prints, on the stream as
  // cos.console, in batches every 200 ms; a burst past 500 lines in one batch says how many it dropped (never silently).
  let _lines = [], _dropped = 0, _lineTimer = null;
  sup.on('line', (l) => {
    if (_lines.length < 500) _lines.push(l); else _dropped++;
    if (!_lineTimer) _lineTimer = setTimeout(() => { const batch = _lines, dropped = _dropped; _lines = []; _dropped = 0; _lineTimer = null; broadcast('cos.console', { lines: batch, ...(dropped ? { dropped } : {}) }); }, 200);
  });
  const watch = setInterval(() => { if (!streams.size) return; const now = new Map();
    for (const v of sup.list()) { now.set(v.name, `${v.state}|${v.pid}`); if (last.get(v.name) !== `${v.state}|${v.pid}`) broadcast('cos.system.state', { name: v.name, state: v.state, pid: v.pid }); }
    last = now; }, 1000); if (watch.unref) watch.unref();
  const beat = setInterval(() => { for (const r of streams) { try { r.write(': beat\n\n'); } catch (_) {} } }, 15000); if (beat.unref) beat.unref();
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x'), p = u.pathname.replace(/\/+$/, ''), m = req.method;
    let body = {}, rawBody = '';
    if ((m === 'POST' || m === 'PATCH' || m === 'PUT') && p.startsWith('/api/cos'))   // 0.60.536: PUT too (the canvas saves a pipeline)
     { let raw = ''; for await (const c of req) raw += c; rawBody = raw; try { body = raw ? JSON.parse(raw) : {}; } catch (_) { return send(res, 400, { ok: false, error: 'the body is not JSON' }); } }
    try {
      if (m === 'GET' && p === '/api/cos/health') return send(res, 200, { ok: true, service: 'cos-manager', pid: process.pid, systems: sup.list().length, ledger: sup.ledgerFile });   // MG17: pid, so a launcher can prove it is the one it started
      if (m === 'GET' && p === '/api/cos/systems') return send(res, 200, { ok: true, systems: sup.list() });
      if (m === 'GET' && p === '/api/cos/console') {   // SC11: the last lines of every system (or one), merged in time order
        const limit = Math.min(Math.max(Number(u.searchParams.get('limit')) || 500, 1), 5000), only = u.searchParams.get('system');
        const names = sup.list().map(v => v.name).filter(n => !only || n === only);
        const lines = names.flatMap(n => { try { return sup.logs(n, { limit }).map(l => ({ system: n, ...l })); } catch (_) { return []; } }).sort((a, b) => a.ts - b.ts).slice(-limit);
        return send(res, 200, { ok: true, lines, systems: names });
      }
      if (m === 'GET' && p === '/api/cos/ledger') return send(res, 200, { ok: true, entries: sup.ledger({ limit: Number(u.searchParams.get('limit')) || 100, system: u.searchParams.get('system') }) });
      if (m === 'GET' && p === '/api/cos/legacy-callers') return send(res, 200, { ok: true, callers: door.legacyCallers() });   // MG16: who still calls /tables and /files
      // CA3 (cos/spec/network.spec MOD-NET-ROUTES) — James: "Gate behind settings to open. Make a full detailed settings for network."
      if (p === '/api/cos/network' && m === 'GET') { const N = require('./network-settings.js'); return send(res, 200, { ok: true, settings: N.view(), gates: Object.fromEntries(Object.keys(N.REACH).map(e => [e, N.gate(e)])) }); }
      if (p === '/api/cos/network' && m === 'PATCH') { const N = require('./network-settings.js'); const r = N.patch(body.patch, { by: body.by }); if (r.ok) sup.note('network', `network settings changed: ${r.changed.map(c => c.path).join(', ')}`, { by: body.by }); return send(res, r.ok ? 200 : r.code, r.ok ? { ...r, gates: Object.fromEntries(Object.keys(N.REACH).map(e => [e, N.gate(e)])) } : r); }
      // CA3b — the cloudflared tunnel: its state and addresses; start / stop (a person's or a rule's, NET-003); fetch cloudflared (the same gate: it reaches out)
      if (p === '/api/cos/network/tunnel' && m === 'GET') return send(res, 200, tunnel.status());
      if (p === '/api/cos/network/tunnel' && m === 'POST') {
        if (body.action !== 'start' && body.action !== 'stop') return send(res, 400, { ok: false, error: 'action is "start" or "stop"' });
        const r = tunnel[body.action]({ by: body.by }); return send(res, r.ok ? 200 : r.code, r);
      }
      if (p === '/api/cos/network/tunnel/install' && m === 'POST') {
        const by = String(body.by || '');
        if (!/^(person|rule:[\w.-]+|agent:[\w.-]+)$/.test(by)) return send(res, 400, { ok: false, error: 'say who acts: { "by": "person" | "rule:<id>" }' });
        if (/^agent:/.test(by)) return send(res, 403, { ok: false, error: 'fetching a program from the internet is a person\'s act; an agent proposes (NET-003)' });
        const g = NET.gate('tunnel'); if (!g.ok) return send(res, 409, { ok: false, error: g.why, needs: 'settings' });
        if (tunnel.status().install.running) return send(res, 409, { ok: false, error: 'an install is already running' });
        netNote(`cloudflared download started by ${by}`);
        tunnel.installer().install({ force: body.force === true }).then((r) => netNote(r.ok ? `cloudflared ${r.action}${r.version ? ` ${r.version}` : ''}` : `cloudflared install failed: ${r.error}`));
        return send(res, 202, { ok: true, started: true, install: tunnel.status().install });
      }
      if (m === 'GET' && p === '/api/cos/policy') return send(res, 200, { ok: true, policy: sup.policy(), defaults: sup.DEFAULTS });   // MG18: the defaults too, so a page can say each value's layer
      // MG18 — the contract, the stream, usage, logs, proposals
      if (m === 'GET' && p === '/api/cos/contract') { try { return send(res, 200, { ok: true, contract: JSON.parse(require('fs').readFileSync(CONTRACT, 'utf8')) }); } catch (e) { return send(res, 500, { ok: false, error: `the contract is unreadable: ${e.message}` }); } }
      if (m === 'GET' && p === '/api/cos/events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
        res.write(`event: cos.hello\ndata: ${JSON.stringify({ systems: sup.list().map(v => ({ name: v.name, state: v.state, pid: v.pid })), at: Date.now() })}\n\n`);
        streams.add(res); req.on('close', () => streams.delete(res)); return;
      }
      // PR6 slice a (2026-11-13) — James: "get the heartbeat done and polling disabled" · "orchastrator needs to migrate to the superviser".
      // Every system's beat (lib/pulse.js) comes here: the supervisor hears it (up at its first beat, a missed beat said), and it is passed on
      // to the Orchestrator, fire and forget, until the Orchestrator moves in (SW5). The Orchestrator down changes nothing here.
      if (m === 'POST' && (p === '/api/cos/heartbeat' || p === '/api/cos/register')) {
        const r = p.endsWith('heartbeat') ? sup.beat(body) : { known: null };
        _onward(p.endsWith('heartbeat') ? '/api/heartbeat' : '/api/register', rawBody);
        return send(res, 200, { ok: true, at: Date.now(), heardBy: 'cos', system: r.name || null, known: r.known, registry: {} });
      }
      // 2026-11-01 TV3 — James: "i also meant cos ui" (the emergence channel). COS asks Intelligence through its routes (its origin from its
      // declaration's healthUrl, never its files) and the kernel for his emergence runs (lib/emergence.js). A silent Intelligence is a 503 naming it.
      const em = /^\/api\/cos\/emergence\/(patterns|liminal|sessions)$/.exec(p);
      if (em && m === 'GET') {
        if (em[1] === 'sessions') { const r = require('../../lib/emergence.js').sessions({ limit: Number(u.searchParams.get('limit')) || 20 }); return send(res, r.ok ? 200 : 503, r); }
        const d = sup.declarations().find(x => x.name === 'intelligence'); let origin = 'http://127.0.0.1:3753'; try { if (d && d.healthUrl) origin = new URL(d.healthUrl).origin; } catch (_) {}
        const ask = (path) => new Promise((resolve) => { const q = http.get(origin + path, { timeout: 4000 }, (r) => { let t = ''; r.on('data', c => t += c); r.on('end', () => { try { resolve(JSON.parse(t)); } catch (_) { resolve({ ok: false, error: `not JSON (${r.statusCode})` }); } }); });
          q.on('timeout', () => q.destroy(new Error('no answer in 4 s'))); q.on('error', (e) => resolve({ ok: false, error: e.message })); });
        // 0.60.524 — James, 2026-11-13, of this page: "why is it coupled to intelligence?" Two of its panels ARE Intelligence's data (what has
        // crystallised, what is forming); the page read it, but Intelligence starts on demand and an asleep one answered ECONNREFUSED, said raw.
        // Now the first refused ask wakes it (the supervisor's touch, as any on-demand call does) and waits for it (25 s), then asks again;
        // one that still cannot start says why (its state, e.g. held under the memory floor).
        const first = em[1] === 'patterns' ? '/api/intelligence/patterns' : '/api/liminal-space/status';
        const probe = await ask(first);
        let woke = null;
        if (probe && probe.ok === false && /ECONNREFUSED/.test(String(probe.error || ''))) {
          // one wake for every caller at once (the page's two panels ask together, every 10 s): they share the same wait
          if (!_intelWake) _intelWake = (async () => { try { sup.touch('intelligence'); } catch (_) {}
            for (let t0 = Date.now(); Date.now() - t0 < 25000;) { await new Promise(r => setTimeout(r, 1000)); const h = await ask('/health'); if (h && h.ok !== false) return true; }
            return false; })().finally(() => { _intelWake = null; });
          woke = { asked: true, up: await _intelWake };
          if (!woke.up) { let st = null; try { st = (sup.list().find(x => x.name === 'intelligence') || {}).state; } catch (_) {} return send(res, 503, { ok: false, waking: true, state: st, error: `Intelligence was asleep: COS woke it, and it is not up yet (${st || 'starting'})${/memory/.test(String(st)) ? ', held until memory frees up' : ''}. This page asks again on its own.` }); }
        }
        if (em[1] === 'patterns') { const r = woke ? await ask('/api/intelligence/patterns') : probe; return send(res, r && r.ok !== false ? 200 : 503, r && r.ok !== false ? r : { ok: false, error: `intelligence did not answer: ${(r && r.error) || 'no reply'}` }); }
        const fp = u.searchParams.get('focalPoint');
        const [st, ls] = await Promise.all([ask('/api/liminal-space/status'), ask(`/api/liminal-space/list${fp ? `?focalPoint=${encodeURIComponent(fp)}` : ''}`)]);
        if (!st || st.ok === false) return send(res, 503, { ok: false, error: `intelligence did not answer: ${(st && st.error) || 'no reply'}` });
        return send(res, 200, { ok: true, status: st, items: (ls && ls.items) || [] });
      }
      // 2026-11-01 UP9 — the same update notice for COS's UI (the kernel's lib/nexus-update.js notice)
      if (m === 'GET' && p === '/api/cos/update/notice') { try { return send(res, 200, { ok: true, ...require('../../lib/nexus-update.js').notice({ root }), updatesPage: 'http://127.0.0.1:4800/update.html' }); } catch (e) { return send(res, 500, { ok: false, error: e.message }); } }
      // CE2 0.60.376 — what GitHub has, per system (?fetch=1 asks GitHub; else what was last fetched), and the update tool
      if (m === 'GET' && p === '/api/cos/update') return send(res, 200, await updates.check({ fetch: u.searchParams.get('fetch') === '1' }));
      // SC7 0.60.380 — the Updates section's gear: the kernel's update settings; the history; roll back
      if (m === 'GET' && p === '/api/cos/update/settings') return send(res, 200, updates.settings());
      if (m === 'PATCH' && p === '/api/cos/update/settings') { const r = updates.setSettings(body.patch || {}, { by: body.by }); return send(res, r.ok ? 200 : r.code || 400, r); }
      if (m === 'GET' && p === '/api/cos/update/history') return send(res, 200, updates.history({ limit: u.searchParams.get('limit') }));
      if (m === 'POST' && p === '/api/cos/update/rollback') { if (!body.by) return send(res, 400, { ok: false, error: 'say who acts: { "by": "person" }' }); if (/^agent:/.test(String(body.by))) return send(res, 403, { ok: false, error: 'an agent proposes; a rollback is a person\'s' }); const r = await updates.rollback({ by: body.by }); return send(res, r.ok ? 200 : 409, r); }
      // PR6 slice a: answered from COS's last sample (every 30 s) when it is fresh; each read costs a process listing (PowerShell on Windows)
      if (m === 'GET' && p === '/api/cos/usage') { const l = resources.last && resources.last(); if (l && l.at && Date.now() - l.at < 45000) return send(res, 200, { ok: true, usage: l, from: 'last sample' }); return send(res, 200, { ok: true, usage: await usage.readAsync(sup.list(), sup.policy()) }); }
      // CP6a (his 2026-11-01: "then i want resource management for each cos compartment") — caps by layer, read back; the account
      if (m === 'GET' && p === '/api/cos/resources') { if (u.searchParams.get('fresh') === '1') await resources.sample(); return send(res, 200, { ok: true, resources: resources.all() }); }
      const cp = /^\/api\/cos\/systems\/([^/]+)\/caps$/.exec(p);
      if (cp && m === 'GET') return send(res, 200, { ok: true, caps: resources.caps(decodeURIComponent(cp[1])), history: resources.history(decodeURIComponent(cp[1])) });
      if (cp && m === 'PATCH') { try { return send(res, 200, { ok: true, caps: resources.setCaps(decodeURIComponent(cp[1]), body.patch || {}, { by: body.by }) }); } catch (e) { return send(res, typeof e.code === 'number' ? e.code : 500, { ok: false, error: e.message }); } }
      // CP1a (his 2026-11-01: "continue moving the rest of the systems into cos.") — every compartment's wall and what it has said
      if (m === 'GET' && p === '/api/cos/walls') { const w = require('./walls.js').report(sup); return send(res, 200, { ok: true, walls: w, counts: { enforce: w.filter(x => x.mode === 'enforce').length, audit: w.filter(x => x.mode === 'audit').length, bare: w.filter(x => x.mode === 'none').length, enforceReady: w.filter(x => x.enforceReady).length } }); }
      // SC1 — the bell
      if (m === 'GET' && p === '/api/cos/notices') return send(res, 200, { ok: true, notices: notices.list({ unread: u.searchParams.get('unread') === '1', kind: u.searchParams.get('kind'), limit: u.searchParams.get('limit') }), counts: notices.counts() });
      if (m === 'POST' && p === '/api/cos/notices/read') return send(res, 200, { ok: true, ...notices.read({ ids: body.ids, all: body.all === true }) });
      // SC2 — a system's configuration: every setting, its layer, when and how it applies; set his overrides; clear them back to the declared
      // CA7 slice a (2026-11-13) — James: "should be a first time setup wizard, storage location of each system/nexus" · "second one, can be moved anbd
      // changed in each systems individual settings." Where each system lives, whether it can be moved, and what holds it if not (cos/sovereign/location.eg);
      // one system's answer adds its folder on this machine and its size on disk (files under it, node_modules included: that moves too)
      // SC19 slice a (2026-11-22) — James: "first give cos ui a tab for storage and data, like location of nexus, reinstall tools, verifify integrity tools,
      // manage nexus". Reads are open; each act is a person's, confirmed, on the ledger; a long one is a job kept on disk and streamed as cos.storage.
      if (p.startsWith('/api/cos/storage')) {
        const cosRoot = process.env.COS_APP_ROOT || null, jobFile = path.join(process.env.COS_MANAGER_DATA || path.join(root, 'cos', 'data', 'manager'), 'storage-job.json');
        const readJob = () => { try { return JSON.parse(require('fs').readFileSync(jobFile, 'utf8')); } catch (_) { return null; } };
        const keepJob = (j) => { require('fs').mkdirSync(path.dirname(jobFile), { recursive: true }); require('fs').writeFileSync(jobFile, JSON.stringify(j)); broadcast('cos.storage', j); };
        if (m === 'GET' && p === '/api/cos/storage') { const r = await pipeline.storageRead({ treeRoot: root, cosRoot }); return send(res, r.ok ? 200 : (r.code || 500), { ...r, job: readJob() }); }
        if (m === 'GET' && p === '/api/cos/storage/sizes') return send(res, 200, pipeline.storageSizes({ treeRoot: root, again: u.searchParams.get('again') === '1' }));
        const act = /^\/api\/cos\/storage\/(repair|dependencies|restart|backup)$/.exec(p);
        if (!act || m !== 'POST') return send(res, 404, { ok: false, error: `no storage route ${m} ${p}` });
        if (!body.by) return send(res, 400, { ok: false, error: 'say who acts: { "by": "person" }' });
        if (/^agent:/.test(String(body.by))) return send(res, 403, { ok: false, error: 'an agent proposes; this is a person\'s act' });
        if (body.confirm !== true) return send(res, 400, { ok: false, needsConfirm: true, error: 'this changes Nexus: pass confirm:true once the person has said yes' });
        const was = readJob(); if (was && was.state === 'running' && Date.now() - was.at < 3600000) return send(res, 409, { ok: false, error: `${was.tool} is still running` });
        const tool = act[1], job = { id: require('crypto').randomUUID(), tool, by: body.by, state: 'running', at: Date.now() };
        if (!sup.note('storage', `${tool} started`, { by: body.by })) return send(res, 500, { ok: false, error: 'the ledger cannot be written: nothing was done' });
        keepJob(job); send(res, 202, { ok: true, job });
        const cp = require('child_process'), restartAll = async () => { const names = sup.list().filter(v => v.state === 'up').sort((a, b) => (a.bootPhase || 0) - (b.bootPhase || 0)).map(v => v.name); for (const n of names) { sup.restart(n, { by: body.by }); await new Promise(z => setTimeout(z, 2500)); } return names; };
        const shell = (line, cwd, timeout) => new Promise(z => cp.exec(line, { cwd, timeout, maxBuffer: 16 << 20, windowsHide: true }, (e, o, x) => z({ ok: !e, say: String(x || o || (e && e.message) || '').trim().split('\n').pop() })));
        (async () => {
          if (tool === 'repair') { const r = await pipeline.storageRepair({ treeRoot: root }); if (!r.ok) throw new Error(r.error); return { says: r.restored.length ? `${r.restored.length} code files restored` : 'no code file was missing', restored: r.restored }; }
          if (tool === 'dependencies') { const r = await shell('npm install --no-audit --no-fund', root, 900000); if (!r.ok) throw new Error(`npm install failed: ${r.say}`); const names = await restartAll(); return { says: `dependencies installed; ${names.length} systems restarted` }; }
          if (tool === 'restart') { const names = await restartAll(); return { says: `${names.length} systems restarted` }; }
          const b = require(path.join(root, 'lib/nexus-update.js')).gitBackup({ root, why: 'Settings › Storage and data' }); if (!b.ok) throw new Error(b.error);
          const fsx = require('fs'), stamp = new Date().toISOString().replace(/[:.]/g, '-'), dir = path.join(path.dirname(root), 'nexus-backups', stamp), folders = fsx.readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory() && !/^(\.|node_modules$|_archive$)/.test(e.name)).map(e => e.name === 'data' ? 'data' : `${e.name}/data`).filter(f => fsx.existsSync(path.join(root, f)));
          fsx.mkdirSync(dir, { recursive: true }); const tar = await new Promise(z => cp.execFile('tar', ['-czf', 'data.tgz', '-C', root, ...folders], { cwd: dir, timeout: 3600000, windowsHide: true, maxBuffer: 16 << 20 }, (e, o, x) => z({ code: e ? e.code : 0, say: String(x || '').trim().split('\n').pop() })));
          const size = (() => { try { return fsx.statSync(path.join(dir, 'data.tgz')).size; } catch (_) { return 0; } })(); if (!size || (tar.code !== 0 && tar.code !== 1)) throw new Error(`the data archive failed: ${tar.say}`);
          return { says: `backed up: code on ${b.branch}, data in ${dir}`, branch: b.branch, dir, bytes: size };
        })().then(r => { const d = { ...job, state: 'done', finishedAt: Date.now(), ...r }; keepJob(d); sup.note('storage', `${tool}: ${r.says}`, { by: body.by }); })
          .catch(e => { keepJob({ ...job, state: 'failed', finishedAt: Date.now(), says: e.message }); sup.note('storage', `${tool} failed: ${e.message}`, { by: body.by }); });
        return;
      }
      if (m === 'GET' && p === '/api/cos/locations') { const r = await pipeline.locations(); return send(res, r.ok ? 200 : (r.code || 500), { ...r, root, cosRoot: process.env.COS_APP_ROOT || null }); }
      // SC18 (0.60.545) — James, 2026-11-15, of a system's cockpit: "data per system needs to be the data folders, or setup when creating a new system.
      // also the files tab needs to be each systems entire compartment backend." Both tabs read the system's own folders through this route (the old
      // door routes read only the shared data/ at the root). Read-only. ?in=backend: its whole folder (code, spec, compartment file, data).
      // ?in=data: its data folders, each named: its own (<system>/data) and what is still at the root (data/<system>). ?path= a folder lists it;
      // a file is read: a .jsonl table's newest rows (?rows=), other text up to 200 KB; a file whose name says it holds a secret is not read, said.
      { const tm = /^\/api\/cos\/systems\/([^/]+)\/tree$/.exec(p);
        if (tm && m === 'GET') { const fsx = require('fs'); const name = decodeURIComponent(tm[1]); const d = sup.declarations().find(x => x.name === name || x.system === name);
          if (!d) return send(res, 404, { ok: false, error: `no system ${name}` });
          const dir = (d.cwd && d.cwd !== '.' ? d.cwd : null) || (d.entry ? String(d.entry).split('/')[0] : name);
          const sysDir = path.join(root, dir), own = path.join(sysDir, 'data'), atRoot = path.join(root, 'data', name);
          const where = u.searchParams.get('in') === 'data' ? 'data' : 'backend';
          const parts = String(u.searchParams.get('path') || '').split('/').filter(Boolean);
          if (parts.some(x => x === '..' || x === '.' || /[\\:\0]/.test(x)) || parts.length > 24) return send(res, 400, { ok: false, error: 'not a path inside this system' });
          const has = (f) => { try { return fsx.statSync(f).isDirectory(); } catch (_) { return false; } };
          let base, rest = parts;
          if (where === 'backend') base = sysDir;
          else {
            const roots = [{ id: 'own', label: `${dir}/data`, about: 'its own data folder', dir: own, exists: has(own) }, { id: 'root', label: `data/${name}`, about: 'still at the root (moves home with SW4)', dir: atRoot, exists: has(atRoot) }];
            if (!parts.length) return send(res, 200, { ok: true, system: name, in: 'data', path: '', roots: roots.map(({ dir: _d, ...r }) => r), dirs: roots.filter(r => r.exists).map(r => r.id), files: [],
              ...(roots.some(r => r.exists) ? {} : { none: `${name} has no data folder yet: ${dir}/data is made when it first writes, or when a new system is set up` }) });
            const r0 = roots.find(r => r.id === parts[0]); if (!r0) return send(res, 404, { ok: false, error: `its data folders are "own" and "root", not "${parts[0]}"` });
            base = r0.dir; rest = parts.slice(1);
          }
          const target = path.join(base, ...rest);
          if (!path.resolve(target).startsWith(path.resolve(base))) return send(res, 400, { ok: false, error: 'the path leaves this system' });
          let st; try { st = fsx.statSync(target); } catch (e) { return send(res, 404, { ok: false, error: `nothing at ${[dir, ...rest].join('/')}` }); }
          if (st.isDirectory()) {
            let ents = []; try { ents = fsx.readdirSync(target, { withFileTypes: true }); } catch (e) { return send(res, 500, { ok: false, error: e.message }); }
            const dirs = ents.filter(e => e.isDirectory()).map(e => e.name).sort();
            const files = ents.filter(e => e.isFile()).map(e => { let b = 0, t = 0; try { const x = fsx.statSync(path.join(target, e.name)); b = x.size; t = x.mtimeMs; } catch (_) {} return { name: e.name, bytes: b, mtime: t }; }).sort((a, b) => (a.name < b.name ? -1 : 1));
            return send(res, 200, { ok: true, system: name, in: where, path: parts.join('/'), folder: target, dirs, files });
          }
          const fname = path.basename(target);
          if (/(^\.env|secret|token|password|credential|\.pem$|\.key$|\.pfx$|vault)/i.test(fname)) return send(res, 200, { ok: true, system: name, in: where, path: parts.join('/'), file: { name: fname, bytes: st.size, mtime: st.mtimeMs }, withheld: 'its name says it holds a secret: COS does not show it' });
          const want = Math.max(1, Math.min(500, Number(u.searchParams.get('rows')) || 60));
          if (/\.(jsonl|ndjson)$/i.test(fname)) {
            if (st.size > 64 * 1024 * 1024) return send(res, 200, { ok: true, system: name, in: where, path: parts.join('/'), file: { name: fname, bytes: st.size, mtime: st.mtimeMs }, withheld: 'over 64 MB: too large to read here' });
            const lines = fsx.readFileSync(target, 'utf8').split('\n').filter(Boolean); const rows = [];
            for (const l of lines.slice(-want)) { try { rows.push(JSON.parse(l)); } catch (_) { rows.push({ unreadable: l.slice(0, 200) }); } }
            return send(res, 200, { ok: true, system: name, in: where, path: parts.join('/'), file: { name: fname, bytes: st.size, mtime: st.mtimeMs }, total: lines.length, rows });
          }
          const fd = fsx.openSync(target, 'r'); const buf = Buffer.alloc(Math.min(st.size, 200 * 1024)); fsx.readSync(fd, buf, 0, buf.length, 0); fsx.closeSync(fd);
          if (buf.includes(0)) return send(res, 200, { ok: true, system: name, in: where, path: parts.join('/'), file: { name: fname, bytes: st.size, mtime: st.mtimeMs }, withheld: 'not text' });
          return send(res, 200, { ok: true, system: name, in: where, path: parts.join('/'), file: { name: fname, bytes: st.size, mtime: st.mtimeMs }, text: buf.toString('utf8'), cut: st.size > buf.length });
        } }
      // 2026-11-24 (PC18 settings; SC29) — James: "i want those settings in cos ui." · "Remeber no coupling" · "also everything has to use the
      // drawbridge". An Emerge system is reached only through its drawbridge (§5.16): its record and hooks in Emerge's component registry,
      // read by its own CLI (<system>/cli.eg registry). COS knows no verb: GET …/hooks lists what the system offers; POST …/hook/<name> sends a
      // query to an in hook only when the registry lists it, adding the one fact any system may need (home: the user's home folder) when absent.
      { const db = /^\/api\/cos\/systems\/([a-z0-9-]+)\/(hooks|hook\/([a-z_][a-z0-9_]*))$/.exec(p);
        if (db && ((db[2] === 'hooks' && m === 'GET') || (db[3] && m === 'POST'))) {
          const sys = db[1], cli = path.join(root, sys, 'cli.eg');
          if (!require('fs').existsSync(cli)) return send(res, 404, { ok: false, error: `${sys} has no drawbridge (${sys}/cli.eg)` });
          const run = (cmd, q) => { const r = require('child_process').spawnSync(process.execPath, [path.join(root, 'emerge', 'emerge', 'lang', 'eg.js'), 'run', `${sys}/cli.eg`, cmd, ...(q ? [JSON.stringify(q)] : [])], { cwd: root, encoding: 'utf8', timeout: 60000, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
            try { return JSON.parse(String(r.stdout || '').trim().split('\n').pop()); } catch (_) { return { ok: false, error: `${sys}/cli.eg did not answer`, said: String(r.stderr || r.stdout || '').slice(0, 400) }; } };
          const reg = run('registry'); if (reg.ok === false) return send(res, 502, reg);
          if (db[2] === 'hooks') return send(res, 200, reg);
          const offered = ((reg.value && reg.value.hooks) || []).some((h) => h.name === db[3] && h.direction === 'in');
          if (!offered) return send(res, 404, { ok: false, error: `${sys} offers no in hook ${db[3]}`, hooks: (reg.value && reg.value.hooks) || [] });
          const q = body && typeof body === 'object' ? { ...body } : {};   // the body is read once, above, for every /api/cos write
          if (q.home == null) q.home = require('os').homedir().replace(/\\/g, '/');
          // 2026-11-26 — James: "raid needs to connect to each drawbridge." Every call through a drawbridge is RAID's to decide and record,
          // with what it carries; RAID out of reach, an agent's or a rule's call is refused (fail closed) and a person's goes on, said
          { const by = String(q.by || 'person'), proof = { kind: 'stated', system: sys, hook: db[3], by, carries: Object.keys(q).filter((k) => k !== 'home').slice(0, 12), at: Date.now() };
            let v = null; try { v = await require('../../lib/raid-port.js').approveTool(sys, `${sys}.${db[3]}`, { action: db[3], intent: { action: db[3], target: sys }, causedBy: by, proof }); } catch (e) { v = { approved: null, reason: `RAID unreachable: ${e.message}` }; }
            if (v && v.approved === false) return send(res, 403, { ok: false, refused: true, error: `RAID did not approve ${sys}.${db[3]} for ${by}: ${v.reason || 'no reason'}` });
            if (!v || v.approved == null) { if (/^(agent|rule):/.test(by)) return send(res, 503, { ok: false, error: `RAID could not be asked about ${sys}.${db[3]} for ${by}: ${(v && v.reason) || 'no answer'}` }); sup.note('raid-unasked', `${sys}.${db[3]} for ${by} went on without RAID: ${(v && v.reason) || 'no answer'}`, { by }); } }
          return send(res, 200, run(db[3], q));
        } }
      { const lm = /^\/api\/cos\/systems\/([^/]+)\/location$/.exec(p);
        if (lm && m === 'GET') { const name = decodeURIComponent(lm[1]); const d = sup.declarations().find(x => x.name === name || x.system === name);
          if (!d) return send(res, 404, { ok: false, error: `no system ${name}` });
          const dir = (d.cwd && d.cwd !== '.' ? d.cwd : null) || (d.entry ? String(d.entry).split('/')[0] : name);
          const all = await pipeline.locations(); if (!all.ok) return send(res, all.code || 500, all);
          const row = (all.systems || []).find(x => x.system === dir || x.system.split('/')[0] === dir) || null;
          const abs = path.join(root, dir); let bytes = 0, files = 0, cut = false;
          const walk = (f, depth) => { if (files > 200000 || depth > 40) { cut = true; return; } let st; try { st = require('fs').lstatSync(f); } catch (_) { return; }
            if (st.isSymbolicLink()) return; if (st.isDirectory()) { let n = []; try { n = require('fs').readdirSync(f); } catch (_) {} for (const x of n) walk(path.join(f, x), depth + 1); } else { bytes += st.size; files++; } };
          walk(abs, 0);
          return send(res, 200, { ok: true, system: name, folder: abs, inside: abs.startsWith(root), disk: { bytes, files, cut }, ...(row ? { movable: row.movable, why: row.why, out: row.out, out_to: row.out_to, in: row.in, in_from: row.in_from, root_data: row.root_data, source_files: row.files } : { movable: false, why: ['not read by the census (no folder of its own)'] }) }); } }
      const cf = /^\/api\/cos\/systems\/([^/]+)\/config(\/clear)?$/.exec(p);
      if (cf) { const name = decodeURIComponent(cf[1]);
        try {
          if (m === 'GET' && !cf[2]) return send(res, 200, config.get(name));
          if (m === 'PATCH' && !cf[2]) return send(res, 200, config.set(name, body.patch || {}, { by: body.by }));
          if (m === 'POST' && cf[2]) return send(res, 200, config.clear(name, body.keys || [], { by: body.by }));
        } catch (e) { return send(res, typeof e.code === 'number' ? e.code : 500, { ok: false, error: e.message }); } }
      // DK2 — the disks
      if (m === 'GET' && p === '/api/cos/disks') return send(res, 200, { ok: true, dir: disks.dir, disks: disks.list() });
      const dkf = /^\/api\/cos\/disks\/([^/]+?)(\/verify)?$/.exec(p);
      if (dkf && m === 'GET') { try { const f = decodeURIComponent(dkf[1]); if (dkf[2]) return send(res, 200, { ok: true, verify: disks.verify(f) }); const i = disks.inspect(f); delete i.files; return send(res, 200, { ok: true, disk: i }); } catch (e) { return send(res, typeof e.code === 'number' ? e.code : 500, { ok: false, error: e.message }); } }
      // DK8 — the virtual disk: read; make, refresh, snapshot, revert, drop a snapshot — each a person's act, on the ledger first (§9.2)
      const vd = /^\/api\/cos\/systems\/([^/]+)\/vdisk(?:\/(make|refresh|snapshot|revert|drop-snapshot|verify))?$/.exec(p);
      if (vd) { const name = decodeURIComponent(vd[1]), op = vd[2];
        try {
          if (m === 'GET' && !op) { const t = vdisks.tools(); let disk = null; if (t.ok && require('fs').existsSync(vdisks.pathOf(name))) disk = vdisks.info(name); return send(res, 200, { ok: true, system: name, tools: t, disk }); }
          if (m === 'GET' && op === 'verify') return send(res, 200, { ok: true, verify: vdisks.verify(name, { snapshot: u.searchParams.get('snapshot') || null }) });
          if (m === 'POST' && op) {
            if (!body.by) return send(res, 400, { ok: false, error: 'say who acts: { "by": "person" }' });
            if (/^agent:/.test(String(body.by))) return send(res, 403, { ok: false, error: 'an agent proposes; a disk is a person\'s or a rule\'s' });
            const what = op === 'make' || op === 'refresh' ? `${op} its virtual disk` : `${op} ${body.tag || ''}`.trim();
            if (!sup.note('vdisk', what, { by: body.by, system: name })) return send(res, 500, { ok: false, error: 'the ledger cannot be written: nothing done' });
            const r = op === 'make' ? await vdisks.make(name, { by: body.by, withState: body.withState !== false }) : op === 'refresh' ? await vdisks.refresh(name, { by: body.by, withState: body.withState !== false })
              : op === 'snapshot' ? vdisks.snapshot(name, body.tag, { by: body.by }) : op === 'revert' ? vdisks.revert(name, body.tag, { by: body.by }) : vdisks.dropSnapshot(name, body.tag, { by: body.by });
            return send(res, 200, r);
          }
        } catch (e) { return send(res, typeof e.code === 'number' ? e.code : 500, { ok: false, error: e.message }); } }
      const dks = /^\/api\/cos\/systems\/([^/]+)\/disk$/.exec(p);
      if (dks) { const name = decodeURIComponent(dks[1]);
        try {
          if (m === 'GET') { const D = disks.describe(name); return send(res, 200, { ok: true, system: name, metadata: { declaredBy: D.declaredBy, state: D.state }, coverage: disks.coverage(name), disks: disks.list({ system: name }) }); }
          if (m === 'POST') { const r = await disks.pack(name, { withState: body.withState === true, by: body.by }); sup.note('disk', `${r.file}: ${r.files} files, ${Math.round(r.bytes / 1024)} KB${r.withState ? ', with its data' : ''}`, { by: body.by, system: name }); return send(res, 200, r); }   // §9.2: the act on the ledger
        } catch (e) { return send(res, typeof e.code === 'number' ? e.code : 500, { ok: false, error: e.message }); } }
      // SC4 — add a system: a proposal; his own is taken at once
      // OC4a (docs/orchestration-console.spec MOD-OC-DEPLOY) — James, 2026-11-08: "Also the automation is to deploy agents to systems."
      // OC8a — James, 2026-11-08: "a hub for the automation pipeline, workflows, tasks ... queues, contracts, dag, it should all be there, waiting to be wired in."
      // PC1 — James, 2026-11-08: "cli commands, agent tools, copilot commands, inject nodes to agents. keep going. i want this built and added to cos ui."
      if (m === 'GET' && p === '/api/cos/boxes') { const r = await boxes.of({ pipeline: u.searchParams.get('pipeline'), procedure: u.searchParams.get('procedure'), as: u.searchParams.get('as') }); return send(res, r.ok ? 200 : (r.code || 500), r); }
      // PC5 — COS's gate types: list, read, make (his; an agent's is refused, named), try one on an output (one step at a time), what a gate holds
      // 2026-11-09 — an event from any system, for the engine's triggers ("When something happens"): a person's, or a system's (by: system:<name>);
      // an agent's is refused (it proposes): an event starts workflows
      if (m === 'POST' && p === '/api/cos/automation/events') {
        const by = String(body.by || ''); if (!by) return send(res, 400, { ok: false, error: 'say who sends it: { "by": "person" | "system:<name>" }' });
        if (/^agent:/.test(by)) return send(res, 403, { ok: false, error: 'an agent proposes; an event that starts workflows is a person\'s or a system\'s' });
        if (!/^[a-z][\w.-]{0,80}$/i.test(String(body.name || ''))) return send(res, 400, { ok: false, error: 'name the event: letters, digits, . - _' });
        const started = automation.engine().emitEvent(String(body.name), { ...(body.payload && typeof body.payload === 'object' ? body.payload : {}), from: by });
        return send(res, 200, { ok: true, name: body.name, started });
      }
      if (m === 'GET' && p === '/api/cos/gate-types') return send(res, 200, { ok: true, types: await gates.types() });
      { const gm = /^\/api\/cos\/gate-types\/([\w-]+)(\/try)?$/.exec(p);
        if (gm && m === 'GET' && !gm[2]) { const t = await gates.get(gm[1]); return send(res, t ? 200 : 404, t ? { ok: true, type: t } : { ok: false, error: `no gate type "${gm[1]}"` }); }
        if (gm && m === 'POST' && gm[2]) { if (!(await gates.get(gm[1]))) return send(res, 404, { ok: false, error: `no gate type "${gm[1]}"` }); return send(res, 200, { ok: true, decision: await gates.decide({ pipelineId: body.pipeline || 'try', task: body.task || 'try', gate: { type: gm[1], with: body.with || {} }, context: body.context || {}, output: body.output == null ? '' : body.output, dry: true }) }); } }
      if (m === 'POST' && p === '/api/cos/gate-types') { const r = await gates.save(body.type, { by: body.by }); return send(res, r.ok ? 200 : (r.code || 400), r); }
      // 2026-11-09 — James: "you did the .frameworks right? .macros? .pipeline? like for steps? its meant to be recursive and meta." A .framework that
      // declares its steps compiles to a pipeline in the engine, which runs as a step of any other; one that only describes is refused, named (409)
      if (m === 'GET' && p === '/api/cos/frameworks') return send(res, 200, { ok: true, frameworks: await pipeline.frameworks.list() });
      { const fm = /^\/api\/cos\/frameworks\/([\w.-]+)\/pipeline$/.exec(p);
        if (fm && m === 'POST') { if (/^agent:/.test(String(body.by || ''))) return send(res, 403, { ok: false, error: 'an agent proposes; compiling a framework into the engine is a person\'s' }); const r = await pipeline.frameworks.compile(fm[1], { by: body.by }); return send(res, r.ok ? 200 : (r.code || 400), r); } }
      // 2026-11-09 — James: "Every pipeline should be in the automation tab imported by a physical node fil". Every source .pipeline file imported
      // (shipped, COS's own, each system's by its route — kept as a file first); sources: which file each pipeline came from
      // 2026-11-10 — a pipeline drawn on the canvas: { text: <.erv>, name?, by } → the .pipeline node file written and imported (an agent's is a 403)
      if (m === 'POST' && p === '/api/cos/pipeline/from-erv') { if (/^agent:/.test(String(body.by || ''))) return send(res, 403, { ok: false, error: 'an agent proposes; making a pipeline from the canvas is a person\'s' }); const r = await pipeline.fromErv({ text: body.text, erv: body.erv, name: body.name, by: body.by || 'person' }); return send(res, r.ok ? 200 : r.code || 422, r); }
      if (m === 'POST' && p === '/api/cos/pipeline/sync') { if (/^agent:/.test(String(body.by || ''))) return send(res, 403, { ok: false, error: 'an agent proposes; importing is a person\'s or a system\'s' }); return send(res, 200, await syncPipelines({ why: `asked by ${body.by || 'person'}` })); }
      if (m === 'GET' && p === '/api/cos/pipeline/sync') return send(res, 200, { ok: true, last: lastSync, sources: syncSources });   // 0.60.517: the last sync, what it read and what did not answer
      if (m === 'GET' && p === '/api/cos/pipeline/sources') return send(res, 200, { ok: true, sources: pipeline.sources() });
      // PC9 slice a (2026-11-11), his PC_D14: "I'm saying for you. Like look at clearglass. Nexus nerve, cleardriver injecting coordinates into the dom."
      // The desktop driven the way ClearDriver drives a page (cos/remote-desktop/desktop-driver.js). Localhost only; off until he arms it, for a set time.
      { const dm = /^\/api\/cos\/desktop(?:\/(state|log|arm|disarm|screen|move|click|type|key|scroll))?$/.exec(p);
        if (dm) {
          const ra = String((req.socket && req.socket.remoteAddress) || '');
          if (!/^(127\.|::1$|::ffff:127\.)/.test(ra)) return send(res, 403, { ok: false, error: 'the desktop driver answers on this computer only (localhost)' });
          if (!desktop) desktop = require('../remote-desktop/desktop-driver.js').createDesktopDriver({ backend: opts.desktopBackend,
            dataDir: process.env.COS_MANAGER_DATA || path.join(root, 'cos', 'data', 'manager'), emit: (ev, d) => broadcast(ev, d) });
          const verb = dm[1] || 'state';
          if (verb === 'state') return send(res, 200, desktop.state());
          if (verb === 'log') return send(res, 200, desktop.log({ limit: u.searchParams.get('limit') }));
          if (m !== 'POST') return send(res, 405, { ok: false, error: `POST /api/cos/desktop/${verb}` });
          const r = await desktop[verb](body);
          return send(res, r.ok === false ? (r.code || 409) : 200, r);
        } }
      // PC8 slice a (2026-11-10): a delta and a baseline per step, and the decisions of the latest run (cos/pipeline/baseline.eg)
      if (m === 'GET' && p === '/api/cos/pipeline/baseline') { const r = await pipeline.baseline({ pipeline: u.searchParams.get('pipeline'), limit: u.searchParams.get('limit') }); return send(res, r.ok === false ? (r.code || 500) : 200, r); }
      // 2026-11-09 — James: "They build upon request, dynamically" · "It's end state first reasoning." A phase planned into its own .pipeline (end state
      // first), kept in the engine; with run, a request through it. build-next: the next phase Nexus can build, planned and run.
      if (m === 'POST' && (p === '/api/cos/pipeline/plan' || p === '/api/cos/pipeline/build-next')) {
        if (/^agent:/.test(String(body.by || '')) && (body.run || p.endsWith('build-next'))) return send(res, 403, { ok: false, error: 'an agent proposes; running a build is a person\'s or a rule\'s' });
        const opts = { key: body.key, repo: body.repo || '', chunks: !!body.chunks, framework: body.framework || null, run: !!body.run, by: body.by };
        const r = p.endsWith('build-next') ? await pipeline.buildNext(opts) : await pipeline.planPhase(opts);
        return send(res, r.ok ? 200 : (r.code || 400), r);
      }
      // 2026-11-09 — a request through a pipeline, kept as files until its contract is met (cos/pipeline/runs.js): ask, list, read, resume
      if (m === 'POST' && p === '/api/cos/pipeline/requests') { if (/^agent:/.test(String(body.by || ''))) return send(res, 403, { ok: false, error: 'an agent proposes a request; running one is a person\'s or a rule\'s' }); const r = await pipeline.request({ pipeline: body.pipeline, vars: body.vars || {}, by: body.by }); return send(res, r.ok ? 200 : (r.code || 400), r); }
      // the lab view, 2026-11-23 — James: "I have no way to look at any of this" · "i need to see pipeline" · "just need this building. not losing the meaning".
      // One read of what COS holds: RAID's requests, the builds and each piece's outcome (cos/data/build), the issues graded in the proof, the systems.
      if (m === 'GET' && p === '/api/cos/lab') {
        const fsx = require('fs'), dir = path.join(root, 'cos', 'data', 'build'), builds = [];
        for (const f of (fsx.existsSync(dir) ? fsx.readdirSync(dir) : []).filter((x) => x.endsWith('.jsonl'))) { let l = []; try { l = fsx.readFileSync(path.join(dir, f), 'utf8').trim().split('\n').map((x) => { try { return JSON.parse(x); } catch (_) { return null; } }).filter(Boolean); } catch (_) {} if (!l.length) continue;
          const st = l.map((x) => x.state), last = l[l.length - 1], pc = [...l].reverse().find((x) => x.state === 'pieces' && Array.isArray(x.pieces));
          builds.push({ run: f.replace(/\.jsonl$/, ''), phase: last.phase, at: l[0].ts, ms: last.ts - l[0].ts, calls: st.filter((x) => x === 'gap-asked').length, passed: st.includes('examples-passed'), landed: st.includes('landed'), end: last.state, steps: st.filter((x, i) => x !== st[i - 1]).join(' > ').slice(0, 240), pieces: pc ? pc.pieces : [] }); }
        builds.sort((a, b) => b.at - a.at);
        const issues = []; try { const t = fsx.readFileSync(path.join(root, 'docs', 'PROOF-OF-COMPETENCY.md'), 'utf8'), i = t.indexOf('issues and his solutions, graded'); for (const ln of (i < 0 ? '' : t.slice(i, i + 12000)).split('\n')) { const c = ln.split('|').map((x) => x.trim()); if (/^I\d+$/.test(c[1] || '')) issues.push({ id: c[1], issue: c[2], his: c[3], result: c[4], grade: (c[6] || '').replace(/\*\*/g, '').split(':')[0] }); } } catch (_) {}
        return send(res, 200, { ok: true, at: Date.now(), requests: await pipeline.runs.list({ state: 'active' }), builds: builds.slice(0, 60), issues, systems: sup.list().map((v) => ({ name: v.name, state: v.state })) });
      }
      // PC34 (2026-11-26) — James: "everything that the agents are doing should be in that bench. like everything should be using the pipleine".
      // An agent session kept as node files (cos/data/agents/<id>/session.json + steps/<n>.step): origin (the ask), each step, end state (its report).
      // Record only: it starts no workflow, so an agent may send it. Slice b puts RAID before each step (UD25).
      // the Claude Code plugin's door (PC34): its hook payload translated here and nowhere else, so COS's own shape stays its own
      if (p === '/api/cos/agents/activity/claude-code' && m === 'POST') {
        const ev = String(body.hook_event_name || ''), short = (v) => (typeof v === 'string' ? v : JSON.stringify(v || '')).slice(0, 2000);
        const t = body.tool_input || {}, resp = body.tool_response || {};
        const mapped = { session: 'claude-' + String(body.session_id || 'unknown').slice(0, 40), who: 'agent:claude-code' + (body.agent_type ? ':' + body.agent_type : '') };
        if (ev === 'UserPromptSubmit') mapped.ask = String(body.prompt || '');
        else if (ev === 'PostToolUse') mapped.step = { tool: String(body.tool_name || ''), input: short(t.command || t.file_path || t.pattern || t.url || t.prompt || t.description || t), outcome: short(resp.stdout || resp.error || resp.filePath || resp.message || resp), ok: !(resp.is_error || resp.interrupted) };
        else if (ev === 'Stop' || ev === 'SubagentStop') mapped.end = String(body.last_assistant_message || 'stopped');
        else return send(res, 200, { ok: true, ignored: ev });
        body = mapped;
      }
      if ((p === '/api/cos/agents/activity' || p === '/api/cos/agents/activity/claude-code') && m === 'POST') {
        const fsx = require('fs'), id = String(body.session || '').replace(/[^\w.-]/g, '').slice(0, 80);
        if (!id) return send(res, 400, { ok: false, error: 'say which session: { "session": "<id>", "who": "...", "ask"|"step"|"end": ... }' });
        const dir = path.join(root, 'cos', 'data', 'agents', id), sf = path.join(dir, 'session.json'); fsx.mkdirSync(path.join(dir, 'steps'), { recursive: true });
        let s = { id, who: String(body.who || 'agent'), ask: '', state: 'working', at: Date.now(), steps: 0, end: null }; try { s = JSON.parse(fsx.readFileSync(sf, 'utf8')); } catch (_) {}
        if (body.ask && !s.ask) s.ask = String(body.ask).slice(0, 4000);
        if (body.step) { s.steps += 1; const st = { n: s.steps, at: Date.now(), tool: String(body.step.tool || ''), input: String(body.step.input || '').slice(0, 2000), outcome: String(body.step.outcome || '').slice(0, 2000), ok: body.step.ok !== false };
          fsx.writeFileSync(path.join(dir, 'steps', String(s.steps).padStart(5, '0') + '.step'), JSON.stringify(st, null, 1)); }
        if (body.end) { s.end = String(body.end).slice(0, 8000); s.state = 'done'; }
        s.last = Date.now(); fsx.writeFileSync(sf, JSON.stringify(s, null, 1));
        return send(res, 200, { ok: true, id, steps: s.steps, state: s.state });
      }
      if (m === 'GET' && (p === '/api/cos/agents/sessions' || p.startsWith('/api/cos/agents/sessions/'))) {
        const fsx = require('fs'), base = path.join(root, 'cos', 'data', 'agents'), one = p.split('/')[5];
        const read = (i) => { try { return JSON.parse(fsx.readFileSync(path.join(base, i, 'session.json'), 'utf8')); } catch (_) { return null; } };
        if (one) { const s = read(one.replace(/[^\w.-]/g, '')); if (!s) return send(res, 404, { ok: false, error: `no agent session "${one}"` });
          const sd = path.join(base, s.id, 'steps'); const steps = (fsx.existsSync(sd) ? fsx.readdirSync(sd) : []).sort().map((f) => { try { return JSON.parse(fsx.readFileSync(path.join(sd, f), 'utf8')); } catch (_) { return null; } }).filter(Boolean);
          return send(res, 200, { ok: true, ...s, steps }); }
        const sessions = (fsx.existsSync(base) ? fsx.readdirSync(base) : []).map(read).filter(Boolean).sort((a, b) => (b.last || b.at) - (a.last || a.at)).slice(0, 100);
        return send(res, 200, { ok: true, sessions });
      }
      if (m === 'GET' && p === '/api/cos/pipeline/requests') return send(res, 200, { ok: true, state: u.searchParams.get('state') || 'active', requests: await pipeline.runs.list({ state: u.searchParams.get('state') || 'active' }) });
      { const rm = /^\/api\/cos\/pipeline\/requests\/([\w.-]+)(\/resume)?$/.exec(p);
        if (rm && m === 'GET' && !rm[2]) { const r = await pipeline.runs.read(rm[1]); return send(res, r ? 200 : 404, r ? { ok: true, ...r } : { ok: false, error: `no request "${rm[1]}"` }); }
        if (rm && m === 'POST' && rm[2]) { if (/^agent:/.test(String(body.by || ''))) return send(res, 403, { ok: false, error: 'an agent proposes; resuming is a person\'s' }); const r = await pipeline.resume(rm[1], { by: body.by }); return send(res, r.ok ? 200 : (r.code || 400), r); } }
      if (m === 'GET' && p === '/api/cos/pipeline/ready') { const r = await pipeline.ready({ limit: u.searchParams.get('limit') }); return send(res, r.ok ? 200 : (r.code || 502), r); }   // 2026-11-12: the phases that can be built now, for the run form
      // GR0 (2026-11-13): the graph census — every graph in Nexus, its store, writers, readers and rows (cos/census/graph.eg); ?markdown=1 adds the atlas page
      if (m === 'GET' && p === '/api/cos/census/graph') { const r = await pipeline.graphCensus({ markdown: u.searchParams.get('markdown') === '1' }); return send(res, r.ok ? 200 : (r.code || 500), r); }
      // SW0 (2026-11-13): the sovereignty scorecard; POST keeps this reading as the one to hold (a person's)
      if (p === '/api/cos/sovereign' && (m === 'GET' || m === 'POST')) { if (m === 'POST' && body.by !== 'person') return send(res, 403, { ok: false, error: 'keeping a reading as the baseline is a person\'s' });
        const r = await pipeline.sovereign({ write: m === 'POST', ...(opts.sovereign || {}) }); return send(res, r.ok ? 200 : (r.code || 500), r); }
      // PC8 slice b (2026-11-11): a failed run retried, from its request's files; { from } runs that step and every step after it again
      { const rt = /^\/api\/cos\/pipeline\/runs\/([\w.-]+)\/retry$/.exec(p);
        if (rt && m === 'POST') { if (/^agent:/.test(String(body.by || ''))) return send(res, 403, { ok: false, error: 'an agent proposes; retrying is a person\'s' }); const r = await pipeline.retry(rt[1], { from: body.from || null, by: body.by }); return send(res, r.ok ? 200 : (r.code || 400), r); } }
      if (m === 'GET' && p === '/api/cos/procedures') { const r = await boxes.procedures(); return send(res, r.ok ? 200 : (r.code || 500), r); }
      if (m === 'GET' && p === '/api/cos/hub') return send(res, 200, { ok: true, ...(await hub.read()) });
      // 2026-11-25 — the Automation tab's reads (his: "the automation build the same. not stripped. but built"): the pipeline screen's own handler
      // (cos/ui/run-console-preview/server.js), each answer from its owner's route; read only, except /cli, which is COS's own command line
      if (p.startsWith('/api/cos/view/')) { req.viewUrl = req.url.slice('/api/cos/view'.length); req.cosBody = body;
        // 2026-11-26: the view is read again when its file changes, so a screen's change needs no restart of COS (a restart interrupted running builds)
        const vf = require.resolve('../ui/run-console-preview/server.js'), vt = require('fs').statSync(vf).mtimeMs; if (_viewAt !== vt) { delete require.cache[vf]; _viewAt = vt; }
        return require(vf).handle(req, res); }
      // AE6 slice a — the automation engine's door: workflows, runs, log, pipelines, macros, triggers, webhooks (cos/automation/routes.js, 0.60.534 SW5i)
      if (p.startsWith('/api/cos/automation/')) {
        let out; try { out = await automation.handle({ method: m, url: '/automation' + req.url.slice('/api/cos/automation'.length), body, headers: req.headers, rawBody }); }
        catch (e) { out = { status: 500, body: { ok: false, error: e.message } }; }
        return send(res, (out && out.status) || 404, (out && out.body) || { ok: false, error: `no automation route ${m} ${p}` });
      }
      if (m === 'GET' && p === '/api/cos/deployments') return send(res, 200, { ok: true, deployments: deploy.deployments({ system: u.searchParams.get('system') || null }) });
      if (m === 'POST' && p === '/api/cos/deploy') { try { return send(res, 200, { ok: true, ...deploy.propose(body) }); } catch (e) { return send(res, typeof e.code === 'number' ? e.code : 500, { ok: false, error: e.message }); } }
      { const rc = /^\/api\/cos\/deployments\/([^/]+)\/recall$/.exec(p); if (m === 'POST' && rc) { try { return send(res, 200, { ok: true, deployment: deploy.recall(decodeURIComponent(rc[1]), { by: body.by }) }); } catch (e) { return send(res, typeof e.code === 'number' ? e.code : 500, { ok: false, error: e.message }); } } }
      if (m === 'POST' && p === '/api/cos/systems') { try { return send(res, 200, { ok: true, ...addSystem.propose(body) }); } catch (e) { return send(res, typeof e.code === 'number' ? e.code : 500, { ok: false, error: e.message }); } }
      // SC3 — COS's own command line
      if (m === 'POST' && p === '/api/cos/cli') { const r = await cli.run(body.line, { by: body.by || 'person' }); return send(res, 200, r); }
      if (m === 'GET' && p === '/api/cos/cli') return send(res, 200, { ok: true, table: cli.TABLE.map(([verb, usage, about]) => ({ verb, usage, about })) });
      const lg = /^\/api\/cos\/systems\/([^/]+)\/logs$/.exec(p);
      if (lg && m === 'GET') return send(res, 200, { ok: true, system: decodeURIComponent(lg[1]), lines: sup.logs(decodeURIComponent(lg[1]), { limit: Number(u.searchParams.get('limit')) || 200 }) });
      if (m === 'GET' && p === '/api/cos/proposals') return send(res, 200, { ok: true, proposals: proposals.list({ open: u.searchParams.get('open') === '1' }) });
      if (m === 'POST' && p === '/api/cos/proposals') { if (body.verb === 'restart-cos' && (!body.why || String(body.why).trim().length < 3)) return send(res, 400, { ok: false, error: 'say why COS should restart: the reason is part of the proposal' }); try { return send(res, 200, { ok: true, proposal: proposals.hold(body) }); } catch (e) { return send(res, e.code === 400 ? 400 : /no system/.test(e.message) ? 404 : 500, { ok: false, error: e.message }); } }
      const pr = /^\/api\/cos\/proposals\/([^/]+)\/(take|drop)$/.exec(p);
      if (pr && m === 'POST') { try { return send(res, 200, { ok: true, ...(pr[2] === 'take' ? proposals.take(decodeURIComponent(pr[1]), { by: body.by }) : proposals.drop(decodeURIComponent(pr[1]), { by: body.by, why: body.why })) }); }
        catch (e) { return send(res, typeof e.code === 'number' ? e.code : 500, { ok: false, error: e.message }); } }
      // 0.60.589 — James, 2026-11-18: "I need to be able to open idearium. I can't without opening Firefox" · "It should be consistent with clearglass or
      // ideariums compartments when they popup." A system that declares its UI ({ ui: { kind: html, path } }) is opened in its own Clear Glass
      // compartment (window.open with agentId compartment:<name>: its own partition), never a browser of his. Clear Glass runs in his session;
      // when it does not answer, that is said with what to do.
      const ou = /^\/api\/cos\/systems\/([^/]+)\/open-ui$/.exec(p);
      if (ou && m === 'POST') {
        const name = decodeURIComponent(ou[1]); const s = sup.list().find(x => x.name === name);
        if (!s) return send(res, 404, { ok: false, error: `no system ${name}` });
        if (!s.ui || s.ui.kind !== 'html') return send(res, 409, { ok: false, error: `${name} declares no html UI (its compartment's runtime.process.ui)` });
        let url = null; try { url = new URL(s.ui.path || '/', (await addressOf(s.ui.surface ? `${name}.${s.ui.surface}` : name)) || undefined).href; } catch (_) {}   // 0.60.592: RAID resolves it
        if (!url) return send(res, 409, { ok: false, error: `${name} has no address to open (no healthUrl)` });
        const cgo = (await addressOf('clear-glass.cmd')) || (await addressOf('clear-glass'));   // 0.60.591: its declared command address (nexus://clear-glass.cmd), never a guess
        const r = await new Promise((resolve) => { if (!cgo) return resolve({ error: 'Clear Glass is not declared' });
          // 0.60.593 — his "i said a compartment" · "clearglass is meant to be cli first": Clear Glass's own command, compartment open (its own
          // partition, a compartment window, never the full agent browser that window.open gave)
          const data = Buffer.from(JSON.stringify({ name, url, title: `${name}` }));
          const q = http.request(`${cgo}/cli/compartment/open`, { method: 'POST', timeout: 5000, headers: { 'Content-Type': 'application/json', 'Content-Length': data.length } }, (rr) => { let t = ''; rr.on('data', (c) => { t += c; }); rr.on('end', () => { try { resolve(JSON.parse(t)); } catch (_) { resolve({ error: `HTTP ${rr.statusCode}` }); } }); });
          q.on('timeout', () => q.destroy(new Error('no answer in 5 s'))); q.on('error', (e) => resolve({ error: e.code || e.message })); q.write(data); q.end(); });
        if (r && r.ok) { sup.note('open-ui', `${name}'s UI opened in its Clear Glass compartment: ${url}`, { by: body.by || 'person', system: name }); return send(res, 200, { ok: true, system: name, url, compartment: `compartment:${name}` }); }
        return send(res, 503, { ok: false, url, error: `Clear Glass did not open it (${(r && r.error) || 'no answer'}): Clear Glass runs in your session — start it from the COS window, then open again` });
      }
      // PC20 — read the systems' declarations again: processes a system declared since COS started (the model server's engines) are added
      if (m === 'POST' && p === '/api/cos/systems/rescan') return send(res, 200, { ok: true, ...sup.rescan({ by: body.by || 'person' }) });
      const act = /^\/api\/cos\/systems\/([^/]+)(?:\/(start|stop|restart|touch|reset-circuit|pause|resume))?$/.exec(p);
      if (act && m === 'GET' && !act[2]) return send(res, 200, { ok: true, system: sup.get(decodeURIComponent(act[1])) });
      // MG-006: a start, stop, restart, boot or policy change is a person's act or a rule's, and says whose; touch is a request for the system
      const needBy = () => { if (!body.by) { send(res, 400, { ok: false, error: 'say who acts: { "by": "person" | "rule:<id>" }' }); return false; } return true; };
      if (act && m === 'POST' && act[2]) {
        const name = decodeURIComponent(act[1]);
        if (act[2] === 'touch') return send(res, 200, { ok: true, system: sup.touch(name) });
        if (!needBy()) return;
        // CP5b — pause/resume: a person's act is his; a rule's is RAID's to approve (fails closed, CP6b); an agent proposes (CP-005)
        if (act[2] === 'pause' || act[2] === 'resume') {
          const by = String(body.by);
          if (/^agent:/.test(by)) return send(res, 403, { ok: false, error: `an agent proposes; a ${act[2]} is a person's act or a rule's RAID approved (CP-005)` });
          if (/^rule:/.test(by)) {
            let ok = null; try { ok = await require('../../lib/raid-port.js').approveTool('cos', `cos.${act[2]} ${name}`, { action: act[2], intent: { action: act[2], target: name }, causedBy: by, proof: body.proof || null })   /* 0.60.595: a rule's evidence goes to RAID, which decides */; } catch (e) { ok = { approved: false, reason: `RAID unreachable: ${e.message}` }; }
            if (!ok || !ok.approved) { sup.note('raid-refused', `RAID did not approve ${act[2]} of ${name} by ${by}: ${(ok && ok.reason) || 'no answer'}`, { by, system: name }); return send(res, 403, { ok: false, error: `RAID did not approve: ${(ok && ok.reason) || 'no answer'}` }); }
          }
          const v = await sup[act[2]](name, { by });
          return send(res, v.said ? 409 : 200, { ok: !v.said, system: v, ...(v.said ? { said: v.said } : {}) });   // said = nothing was done, and why
        }
        // 0.60.597 lean build mode (his "Lean build mode"): a rule's stop or start is RAID's to approve too, with its proof, as a rule's pause is
        if (/^rule:/.test(String(body.by)) && (act[2] === 'stop' || act[2] === 'start')) {
          let ok = null; try { ok = await require('../../lib/raid-port.js').approveTool('cos', `cos.${act[2]} ${name}`, { action: act[2], intent: { action: act[2], target: name }, causedBy: body.by, proof: body.proof || null }); } catch (e) { ok = { approved: false, reason: `RAID unreachable: ${e.message}` }; }
          if (!ok || !ok.approved) { sup.note('raid-refused', `RAID did not approve ${act[2]} of ${name} by ${body.by}: ${(ok && ok.reason) || 'no answer'}`, { by: body.by, system: name }); return send(res, 403, { ok: false, error: `RAID did not approve: ${(ok && ok.reason) || 'no answer'}` }); }
        }
        const fn = { start: sup.start, stop: sup.stop, restart: sup.restart, 'reset-circuit': sup.resetCircuit }[act[2]];
        return send(res, 200, { ok: true, system: fn(name, { by: body.by }) });
      }
      // CE2b — his yes to an update's ask: { by: person, what: cos | <system> }; refused while the update is still writing, and never an agent's
      if (m === 'POST' && p === '/api/cos/update/restart') { if (!body.by) return send(res, 400, { ok: false, error: 'say who acts: { "by": "person" }' }); if (/^agent:/.test(String(body.by))) return send(res, 403, { ok: false, error: 'an agent proposes; restarting after an update is a person\'s' }); const r = await updates.restart({ what: body.what, by: body.by }); return send(res, r.ok ? 200 : r.code || 409, r); }
      if (m === 'POST' && p === '/api/cos/update/apply') { if (!needBy()) return; const r = await updates.apply({ mode: body.mode || 'update', by: body.by, resolve: body.resolve === 'fix' ? 'fix' : null, backupWith: body.backupWith === 'git' ? 'git' : null }); return send(res, r.ok ? 200 : 409, r); }   // CE2: mode update | keep-local; then each changed system restarted · UP14: his answer to a conflict (resolve: fix) or to no backup (backupWith: git)
      if (m === 'POST' && p === '/api/cos/boot') { if (!needBy()) return; return send(res, 200, { ok: true, ...(await sup.boot({ set: body.set, by: body.by })) }); }
      if (m === 'PATCH' && p === '/api/cos/policy') { if (!needBy()) return; return send(res, 200, { ok: true, policy: sup.setPolicy(body.patch || {}, { by: body.by }) }); }
      if (!p.startsWith('/api/cos') && door(req, res)) return;
      return send(res, 404, { ok: false, error: `no route ${m} ${p}` });
    } catch (e) { return send(res, /no system/.test(e.message) ? 404 : 500, { ok: false, error: e.message }); }
  });
  srvRef.server = server;   // PC5: a gate's call to 'cos' reaches this manager on its own port
  server.on('close', () => tunnel.dispose()); server.tunnel = tunnel;   // a tunnel never outlives the manager that opened it
  return server;
}

function listen(sup, port = Number(process.env.COS_MANAGER_PORT) || 7799, opts = {}) {
  return new Promise((resolve, reject) => {
    const srv = createServer(sup, opts);
    srv.once('error', (e) => reject(e.code === 'EADDRINUSE' ? new Error(`:${port} is held — autopilot's door until the handover (MG17); COS does not start a second supervisor (MG-001)`) : e));
    srv.listen(port, '127.0.0.1', () => resolve(srv));
  });
}

if (require.main === module) {
  const arg = (k) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
  const root = arg('root') ? path.resolve(arg('root')) : path.resolve(__dirname, '..', '..');
  const only = arg('only') ? arg('only').split(',').map(s => s.trim()).filter(Boolean) : null;
  const sup = createSupervisor({ root });
  // MG20 (2026-11-18) — James: "im getting sick of nexus being so unstalbe". Found: the Windows service killed this manager 8 times today for not
  // answering /api/cos/health (its event loop blocked 50 s+, measured 15:10), taking the systems it started with it (Idearium's builds lost).
  // The block's cause is not found by reading, so the manager says it: every synchronous child process over 2 s is a ledger line with its
  // command and time, and any stall of the event loop over 5 s is one too. Measured, never guessed.
  (() => { const cp = require('child_process'); const SLOW = 2000;
    for (const fn of ['execSync', 'execFileSync', 'spawnSync']) { const orig = cp[fn];
      cp[fn] = function (...a) { const t0 = Date.now(); try { return orig.apply(this, a); } finally { const ms = Date.now() - t0;
        if (ms > SLOW) { const what = (Array.isArray(a[1]) ? [a[0], ...a[1]] : [a[0]]).join(' ').slice(0, 200); try { sup.record && sup.record('slow-sync', null, `${fn} took ${Math.round(ms / 100) / 10} s, blocking COS: ${what}`); } catch (_) {} console.log(`[cos] slow-sync ${ms} ms: ${fn} ${what}`); } } }; }
    let last = Date.now(); const lag = setInterval(() => { const now = Date.now(), d = now - last - 1000; last = now;
      if (d > 5000) { try { sup.record && sup.record('stall', null, `COS's event loop was blocked ${Math.round(d / 100) / 10} s (ended ${new Date(now).toISOString()})`); } catch (_) {} console.log(`[cos] stall ${d} ms`); } }, 1000);
    if (lag.unref) lag.unref(); })();
  let srvRef = null, uiRef = null, duties = null;
  // CE2b — COS restarts itself, after his yes: answer first, stop its systems, then come back — autopilot starts it again (exit 75), else relaunch.js
  const restartCos = ({ by = 'person' } = {}) => {
    const R = require('./relaunch.js'); const viaAutopilot = process.env.COS_LAUNCHER === 'autopilot';
    if (sup.note) sup.note('restart', `COS restarts itself after an update — ${viaAutopilot ? 'autopilot starts it again' : 'relaunch.js starts it again'}`, { by });
    setTimeout(() => {
      try { duties && duties.stop(); } catch (_) {}
      // MG15 (2026-11-18) — James: "coupled. thats going to kill nexus." The systems are left running and handed to the next manager, which adopts
      // them; only stopping the Windows service stops them all (shutdown).
      try { (sup.handOver || sup.shutdown)({ by: `restart:${by}` }); } catch (_) {}
      try { if (srvRef) srvRef.close(); if (uiRef) uiRef.close(); } catch (_) {}
      if (!viaAutopilot) R.spawnRelauncher({ args: process.argv.slice(1), port: srvRef && srvRef.address() ? srvRef.address().port : Number(process.env.COS_MANAGER_PORT) || 7799 });
      setTimeout(() => process.exit(viaAutopilot ? R.RESTART_CODE : 0), 500);   // not unref'd: with the servers closed, an unref'd timer lets node end with 0 before it fires
    }, 300).unref();
    return { ok: true, how: viaAutopilot ? 'autopilot starts it again and boots its systems' : 'relaunch.js starts it again with --boot' };
  };
  listen(sup, undefined, { root, restartCos }).then(async (srv) => { srvRef = srv;
    console.log(`[cos] manager on 127.0.0.1:${srv.address().port} — ${sup.list().length} systems declared`);
    // AE6 slice b (2026-11-08) — James: "basically i want it to be the main subrate for all automation". The engine starts with COS, so a
    // scheduled or triggered workflow fires without waiting for a first request (in the orchestrator it woke only on one). --no-automation leaves it off.
    if (!process.argv.includes('--no-automation')) {
      try { const E = require('./automation-door.js').engine(); sup.note('automation', `the automation engine started with COS: ${E.list().length} workflow(s)`, { by: 'boot' }); }
      catch (e) { sup.note('automation', `the automation engine did not start: ${e.message}`, { by: 'boot' }); }
    }
    if (arg('handover')) sup.note('handover', `autopilot ${arg('handover')} handed supervision to COS's manager (MG17); its body is archived`, { by: 'boot' });
    // SW5a (0.60.518) — James, 2026-11-13: "orchastrator and autopilot need to migrate to cos superviser". Autopilot's other duties (the wire,
    // vitals, updates, the loom refresh, the minute's snapshot, following the ledger) ran in the launcher's own process beside this one; they run
    // here now, on the supervisor itself, and the ledger is heard as it is written. --no-duties leaves them off (a test, a second manager).
    if (!process.argv.includes('--no-duties')) {
      try { const D = require('./duties.js');
        duties = D.start({ cos: D.inProcess(sup, `http://127.0.0.1:${srv.address().port}`), onLedger: (fn) => { sup.on('ledger', fn); return () => sup.off('ledger', fn); }, log: (t) => console.log(`[cos] ${t}`) });
        sup.note('duties', 'autopilot\'s duties run inside COS\'s manager: the wire, vitals, updates, the loom refresh, the snapshot, the ledger followed (SW5a)', { by: 'boot' }); }
      catch (e) { sup.note('duties', `autopilot's duties did not start: ${e.message} — COS still supervises; vitals, updates and snapshots do not run`, { by: 'boot' }); }
    }
    // 2026-11-26 — James: "you need to add the ability to restart cos when needed. i am not here to restart it constantly." The code COS loads
    // (its manager, automation engine, pipeline, view, and lib/) is read once at start; when it changes on disk and has settled two minutes,
    // COS asks RAID, with the files as its proof, and restarts itself (rule:code-moved). Interrupted runs resume from their files. Refused,
    // it waits ten minutes. --no-reload leaves it off.
    if (!process.argv.includes('--no-reload')) {
      const fs = require('fs'), START = Date.now(), DIRS = ['cos/manager', 'cos/automation', 'cos/pipeline', 'lib'];   /* the view reloads itself (no restart) */
      const moved = () => { const out = []; for (const d of DIRS) { let fsx = []; try { fsx = fs.readdirSync(path.join(root, d)); } catch (_) { continue; }
        for (const f of fsx) { if (!/\.(js|cjs|eg|json)$/.test(f)) continue; try { const st = fs.statSync(path.join(root, d, f)); if (st.isFile() && st.mtimeMs > START) out.push({ f: `${d}/${f}`, t: st.mtimeMs }); } catch (_) {} } }
        return out; };
      let waitUntil = 0, asking = false;
      const reload = setInterval(async () => {
        if (asking || Date.now() < waitUntil) return;
        const m = moved(); if (!m.length) return;
        const newest = Math.max(...m.map((x) => x.t)); if (Date.now() - newest < 120000) return;   // settled: a release lands in several writes
        asking = true;
        const proof = { kind: 'measured', decidedBy: 'cos/manager/server.js', changed: m.map((x) => x.f).slice(0, 25), count: m.length, since: new Date(START).toISOString(), why: 'the code COS runs changed on disk since it started; it loads only at a restart; interrupted runs resume from their files', at: Date.now() };
        let ok = null; try { ok = await require('../../lib/raid-port.js').approveTool('cos', 'cos.restart self', { action: 'restart', intent: { action: 'restart', target: 'cos' }, causedBy: 'rule:code-moved', proof }); } catch (e) { ok = { approved: false, reason: `RAID unreachable: ${e.message}` }; }
        if (!ok || !ok.approved) { sup.note('raid-refused', `RAID did not approve COS restarting itself for ${m.length} changed file(s): ${(ok && ok.reason) || 'no answer'}; asked again in 10 min`, { by: 'rule:code-moved' }); waitUntil = Date.now() + 600000; asking = false; return; }
        sup.note('restart', `${m.length} file(s) COS runs changed (${proof.changed.slice(0, 4).join(', ')}${m.length > 4 ? ' …' : ''}); RAID approved; COS restarts itself`, { by: 'rule:code-moved' });
        restartCos({ by: 'rule:code-moved' });
      }, 60000); if (reload.unref) reload.unref();
      // PC36 (2026-11-26) — the same rule for each system COS runs: its own folder's code (two levels, not data/, tests or node_modules) changed
      // after it started and settled two minutes → RAID asked with the files as proof → that system restarted (rule:code-moved). One at a time.
      const sysWait = new Map(); let sysAsking = false;
      const sysMoved = (name, since) => { const out = []; const walk = (rel, depth) => { let es = []; try { es = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch (_) { return; }
          for (const e of es) { if (e.isDirectory()) { if (depth < 2 && !/^(data|node_modules|tests?|\.git|\.nex|backups?)$/i.test(e.name)) walk(`${rel}/${e.name}`, depth + 1); continue; }
            if (!/\.(js|cjs|mjs|eg)$/.test(e.name)) continue; try { const t = fs.statSync(path.join(root, rel, e.name)).mtimeMs; if (t > since) out.push({ f: `${rel}/${e.name}`, t }); } catch (_) {} } };
        walk(name, 0); return out; };
      const sysReload = setInterval(async () => {
        if (sysAsking) return;
        for (const v of sup.list()) {
          if (v.state !== 'up' || !v.startedAt || Date.now() < (sysWait.get(v.name) || 0)) continue;
          const m = sysMoved(v.system || v.name, v.startedAt);   /* its own folder (ollama-bridge's is ollama) */ if (!m.length || Date.now() - Math.max(...m.map((x) => x.t)) < 120000) continue;
          // 2026-11-26 — James, signing in to ChatGPT in Clear Glass when it closed: "it crashed. right when i signed in". It was this rule: Clear
          // Glass's code had moved, and COS restarted it under him. A system with a window, in his session, is never restarted for moved code:
          // it loads the new code when he next opens it, said once.
          if (v.inYourSession !== undefined || v.wallVia === 'NODE_OPTIONS') { if (!sysWait.has(v.name + ':said')) { sysWait.set(v.name + ':said', 1); sup.note('restart-held', `${m.length} file(s) ${v.name} runs changed; it has a window in your session, so it is not restarted under you: the new code loads when you next open it`, { by: 'rule:code-moved' }); } sysWait.set(v.name, Date.now() + 600000); continue; }
          sysAsking = true;
          const proof = { kind: 'measured', decidedBy: 'cos/manager/server.js', system: v.name, changed: m.map((x) => x.f).slice(0, 25), count: m.length, since: new Date(v.startedAt).toISOString(), why: `the code ${v.name} runs changed on disk since it started; it loads only at a restart`, at: Date.now() };
          let ok = null; try { ok = await require('../../lib/raid-port.js').approveTool('cos', `cos.restart ${v.name}`, { action: 'restart', intent: { action: 'restart', target: v.name }, causedBy: 'rule:code-moved', proof }); } catch (e) { ok = { approved: false, reason: `RAID unreachable: ${e.message}` }; }
          if (!ok || !ok.approved) { sup.note('raid-refused', `RAID did not approve restarting ${v.name} for ${m.length} changed file(s): ${(ok && ok.reason) || 'no answer'}; asked again in 10 min`, { by: 'rule:code-moved' }); sysWait.set(v.name, Date.now() + 600000); sysAsking = false; return; }
          sup.note('restart', `${m.length} file(s) ${v.name} runs changed (${proof.changed.slice(0, 3).join(', ')}${m.length > 3 ? ' …' : ''}); RAID approved; COS restarts it`, { by: 'rule:code-moved' });
          try { sup.restart(v.name, { by: 'rule:code-moved' }); } catch (e) { sup.note('restart', `${v.name} did not restart: ${e.message}`, { by: 'rule:code-moved' }); }
          sysWait.set(v.name, Date.now() + 300000); sysAsking = false; return;
        }
      }, 60000); if (sysReload.unref) sysReload.unref();
    }
    // 2026-11-01 MG33 — James: "where is cos ui?". Nothing started the cockpit (cos/ui/serve.js) or linked to it: a screen with no way in. The
    // manager now starts it beside itself (COS_UI_PORT, default 7797; --no-ui to leave it off). Its port held → said once, the manager runs on.
    let ui = null;
    if (!process.argv.includes('--no-ui')) {
      const uiPort = Number(process.env.COS_UI_PORT) || 7797;
      ui = require('../ui/serve.js').createServer({ port: uiPort, manager: `http://127.0.0.1:${srv.address().port}` });
      ui.once('error', (e) => { console.log(`[cos] the cockpit did not start on :${uiPort} (${e.code || e.message}) — the manager runs on without it; node cos/ui/serve.js --port <n> starts it by hand`); ui = null; });
      ui.listen(uiPort, '127.0.0.1', () => console.log(`[cos] cockpit on http://127.0.0.1:${ui.address().port}/ (COS's UI)`)); uiRef = ui;
    }
    if (process.argv.includes('--boot')) {
      // 2026-11-05 DP1 — James: "cos also needs to install the dependancies." A pulled Nexus with a newer package-lock.json (or no node_modules)
      // gets npm install before the systems start; said on the ledger; a failed install is said and the boot goes on (each system then says why).
      if (!process.argv.includes('--no-deps')) { const D = require('./deps.js'); const c = D.check(root);
        if (c.needed) { sup.note('deps', `installing Nexus's dependencies first: ${c.why} (npm install)`, { by: 'boot' }); console.log(`[cos] ${c.why} — npm install before boot`);
          const r = await D.install(root); sup.note('deps', r.ok ? `dependencies installed in ${Math.round(r.ms / 1000)} s` : `npm install failed (exit ${r.code}): ${String(r.tail).trim().split('\n').slice(-3).join(' ').slice(0, 300)} — booting anyway`, { by: 'boot' }); } }
      const r = await sup.boot({ by: 'boot', ...(only ? { set: only } : {}) }); console.log(`[cos] booted ${r.started.length}, skipped ${r.skipped.length}`);
    }
    const bye = () => { try { duties && duties.stop(); } catch (_) {} try { srv.tunnel.dispose(); } catch (_) {} sup.shutdown({ by: 'boot' }); srv.close(); if (ui) ui.close(); setTimeout(() => process.exit(0), 500).unref(); };
    process.on('SIGINT', bye); process.on('SIGTERM', bye);
  }).catch((e) => { console.error(`[cos] ${e.message}`); process.exit(1); });
}

module.exports = { createServer, listen };
