'use strict';
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
 * MG18 (0.60.337, MG_D16): GET /api/cos/contract · /api/cos/events (server-sent: cos.ledger, cos.system.state) · /api/cos/usage ·
 *   /api/cos/systems/:name/logs · /api/cos/proposals; POST /api/cos/proposals (an agent's) · /api/cos/proposals/:id/(take|drop) (a person's)
 */
const http = require('http');
const path = require('path');
const { createSupervisor } = require('./supervisor.js');
const { createProposals } = require('./proposals.js');
const usage = require('./usage.js');
const CONTRACT = path.join(__dirname, 'contract.json');

function createServer(sup, { root = path.resolve(__dirname, '..', '..') } = {}) {
  const door = require('./autopilot-door.js').mount(sup, { ROOT: root });   // MG16: autopilot's routes, in its shapes (MG-003)
  const send = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  const proposals = createProposals(sup);   // MG18: agents' held acts
  const resources = require('./resources.js').createResources(sup, { proposals });   // CP6a: caps by layer, read back; the account; pressure → a proposal
  // CE2 0.60.376 — Nexus's update as COS's: per system, the tool behind the toast (cos/manager/updates.js); every step on the event stream
  const updates = require('./updates.js').createUpdates(sup, { root, emit: (e, d) => { broadcast(e, d); if (e === 'cos.update') notices.fromUpdate(d); } });
  // SC1–SC4 0.60.380 (docs/2026-11-02-cos-console-phasemap.spec) — James, 2026-11-02: "notification bell for update, system status,  notications" ·
  // "Need configuration for each system" · "add system" · "Need the system cli". The bell keeps what the ledger and the update tool say; the
  // configuration is applied by the supervisor through one hook (adjust); adding a system is a proposal; the CLI is COS's own table.
  const notices = require('./notices.js').createNotices({ file: path.join(path.dirname(sup.ledgerFile), 'notices.json'), emit: (e, d) => broadcast(e, d) });
  const config = require('./system-config.js').createSystemConfig(sup, { resources });
  sup.setHooks({ adjust: config.adjust });
  const addSystem = require('./add-system.js').createAddSystem(sup, proposals, { root });
  // DK2 0.60.382 (docs/2026-11-02-cos-disk-phasemap.spec) — James, 2026-11-02: "Use the spec as metadata then have the actual file be a compressed or
  // virtual disk or envirement." Each system's disk: its spec as metadata, its files in one compressed file, in COS's own data
  const disks = require('../disk/disk.js').createDisks({ root });
  // DK6–DK8 0.60.383 — James, 2026-11-03: "It needs to be a virtual disk. For the virtual envirements for qumu also. Like it holds all the data,
  // snapshots, system state." Each system's qcow2: its metadata, files and data in one ext4, its snapshots inside the same file
  const vdisks = require('../disk/vdisk.js').createVDisks({ root, disks });
  const cli = require('./cli.js').createCli({ sup, resources, config, notices, proposals, addSystem, usage, disks, vdisks });
  sup.on('ledger', (entry) => { try { notices.fromLedger(entry); } catch (_) {} });
  const checkNotice = () => { try { notices.fromNotice(require('../../lib/nexus-update.js').notice({ root })); } catch (_) {} };
  const noticeTick = setInterval(checkNotice, 10 * 60 * 1000); if (noticeTick.unref) noticeTick.unref(); setTimeout(checkNotice, 2000).unref();
  const cpuTick = setInterval(() => { config.watchCpu().catch(() => {}); }, 30000); if (cpuTick.unref) cpuTick.unref();
  // MG18 (MG_D16): the one event stream the UI floats on. Every ledger line as it is written; a system's state when it changes (read each
  // second from the supervisor's own view, so a state reached without a ledger line, 'up' after health, is heard too).
  const streams = new Set(); let last = new Map();
  const broadcast = (event, data) => { const f = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`; for (const r of streams) { try { r.write(f); } catch (_) { streams.delete(r); } } };
  sup.on('ledger', (entry) => broadcast('cos.ledger', { entry }));
  const watch = setInterval(() => { if (!streams.size) return; const now = new Map();
    for (const v of sup.list()) { now.set(v.name, `${v.state}|${v.pid}`); if (last.get(v.name) !== `${v.state}|${v.pid}`) broadcast('cos.system.state', { name: v.name, state: v.state, pid: v.pid }); }
    last = now; }, 1000); if (watch.unref) watch.unref();
  const beat = setInterval(() => { for (const r of streams) { try { r.write(': beat\n\n'); } catch (_) {} } }, 15000); if (beat.unref) beat.unref();
  return http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x'), p = u.pathname.replace(/\/+$/, ''), m = req.method;
    let body = {};
    if ((m === 'POST' || m === 'PATCH') && p.startsWith('/api/cos')) { let raw = ''; for await (const c of req) raw += c; try { body = raw ? JSON.parse(raw) : {}; } catch (_) { return send(res, 400, { ok: false, error: 'the body is not JSON' }); } }
    try {
      if (m === 'GET' && p === '/api/cos/health') return send(res, 200, { ok: true, service: 'cos-manager', pid: process.pid, systems: sup.list().length, ledger: sup.ledgerFile });   // MG17: pid, so a launcher can prove it is the one it started
      if (m === 'GET' && p === '/api/cos/systems') return send(res, 200, { ok: true, systems: sup.list() });
      if (m === 'GET' && p === '/api/cos/ledger') return send(res, 200, { ok: true, entries: sup.ledger({ limit: Number(u.searchParams.get('limit')) || 100, system: u.searchParams.get('system') }) });
      if (m === 'GET' && p === '/api/cos/legacy-callers') return send(res, 200, { ok: true, callers: door.legacyCallers() });   // MG16: who still calls /tables and /files
      if (m === 'GET' && p === '/api/cos/policy') return send(res, 200, { ok: true, policy: sup.policy(), defaults: sup.DEFAULTS });   // MG18: the defaults too, so a page can say each value's layer
      // MG18 — the contract, the stream, usage, logs, proposals
      if (m === 'GET' && p === '/api/cos/contract') { try { return send(res, 200, { ok: true, contract: JSON.parse(require('fs').readFileSync(CONTRACT, 'utf8')) }); } catch (e) { return send(res, 500, { ok: false, error: `the contract is unreadable: ${e.message}` }); } }
      if (m === 'GET' && p === '/api/cos/events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
        res.write(`event: cos.hello\ndata: ${JSON.stringify({ systems: sup.list().map(v => ({ name: v.name, state: v.state, pid: v.pid })), at: Date.now() })}\n\n`);
        streams.add(res); req.on('close', () => streams.delete(res)); return;
      }
      // 2026-11-01 TV3 — James: "i also meant cos ui" (the emergence channel). COS asks Intelligence through its routes (its origin from its
      // declaration's healthUrl, never its files) and the kernel for his emergence runs (lib/emergence.js). A silent Intelligence is a 503 naming it.
      const em = /^\/api\/cos\/emergence\/(patterns|liminal|sessions)$/.exec(p);
      if (em && m === 'GET') {
        if (em[1] === 'sessions') { const r = require('../../lib/emergence.js').sessions({ limit: Number(u.searchParams.get('limit')) || 20 }); return send(res, r.ok ? 200 : 503, r); }
        const d = sup.declarations().find(x => x.name === 'intelligence'); let origin = 'http://127.0.0.1:3753'; try { if (d && d.healthUrl) origin = new URL(d.healthUrl).origin; } catch (_) {}
        const ask = (path) => new Promise((resolve) => { const q = http.get(origin + path, { timeout: 4000 }, (r) => { let t = ''; r.on('data', c => t += c); r.on('end', () => { try { resolve(JSON.parse(t)); } catch (_) { resolve({ ok: false, error: `not JSON (${r.statusCode})` }); } }); });
          q.on('timeout', () => q.destroy(new Error('no answer in 4 s'))); q.on('error', (e) => resolve({ ok: false, error: e.message })); });
        if (em[1] === 'patterns') { const r = await ask('/api/intelligence/patterns'); return send(res, r && r.ok !== false ? 200 : 503, r && r.ok !== false ? r : { ok: false, error: `intelligence did not answer: ${(r && r.error) || 'no reply'}` }); }
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
      if (m === 'GET' && p === '/api/cos/usage') return send(res, 200, { ok: true, usage: await usage.readAsync(sup.list(), sup.policy()) });
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
      if (m === 'POST' && p === '/api/cos/systems') { try { return send(res, 200, { ok: true, ...addSystem.propose(body) }); } catch (e) { return send(res, typeof e.code === 'number' ? e.code : 500, { ok: false, error: e.message }); } }
      // SC3 — COS's own command line
      if (m === 'POST' && p === '/api/cos/cli') { const r = await cli.run(body.line, { by: body.by || 'person' }); return send(res, 200, r); }
      if (m === 'GET' && p === '/api/cos/cli') return send(res, 200, { ok: true, table: cli.TABLE.map(([verb, usage, about]) => ({ verb, usage, about })) });
      const lg = /^\/api\/cos\/systems\/([^/]+)\/logs$/.exec(p);
      if (lg && m === 'GET') return send(res, 200, { ok: true, system: decodeURIComponent(lg[1]), lines: sup.logs(decodeURIComponent(lg[1]), { limit: Number(u.searchParams.get('limit')) || 200 }) });
      if (m === 'GET' && p === '/api/cos/proposals') return send(res, 200, { ok: true, proposals: proposals.list({ open: u.searchParams.get('open') === '1' }) });
      if (m === 'POST' && p === '/api/cos/proposals') { try { return send(res, 200, { ok: true, proposal: proposals.hold(body) }); } catch (e) { return send(res, e.code === 400 ? 400 : /no system/.test(e.message) ? 404 : 500, { ok: false, error: e.message }); } }
      const pr = /^\/api\/cos\/proposals\/([^/]+)\/(take|drop)$/.exec(p);
      if (pr && m === 'POST') { try { return send(res, 200, { ok: true, ...(pr[2] === 'take' ? proposals.take(decodeURIComponent(pr[1]), { by: body.by }) : proposals.drop(decodeURIComponent(pr[1]), { by: body.by, why: body.why })) }); }
        catch (e) { return send(res, typeof e.code === 'number' ? e.code : 500, { ok: false, error: e.message }); } }
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
            let ok = null; try { ok = await require('../../lib/raid-port.js').approveTool('cos', `cos.${act[2]} ${name}`, { action: act[2], intent: { action: act[2], target: name }, causedBy: by }); } catch (e) { ok = { approved: false, reason: `RAID unreachable: ${e.message}` }; }
            if (!ok || !ok.approved) { sup.note('raid-refused', `RAID did not approve ${act[2]} of ${name} by ${by}: ${(ok && ok.reason) || 'no answer'}`, { by, system: name }); return send(res, 403, { ok: false, error: `RAID did not approve: ${(ok && ok.reason) || 'no answer'}` }); }
          }
          const v = await sup[act[2]](name, { by });
          return send(res, v.said ? 409 : 200, { ok: !v.said, system: v, ...(v.said ? { said: v.said } : {}) });   // said = nothing was done, and why
        }
        const fn = { start: sup.start, stop: sup.stop, restart: sup.restart, 'reset-circuit': sup.resetCircuit }[act[2]];
        return send(res, 200, { ok: true, system: fn(name, { by: body.by }) });
      }
      if (m === 'POST' && p === '/api/cos/update/apply') { if (!needBy()) return; const r = await updates.apply({ mode: body.mode || 'update', by: body.by }); return send(res, r.ok ? 200 : (r.busy ? 409 : 409), r); }   // CE2: mode update | keep-local; then each changed system restarted
      if (m === 'POST' && p === '/api/cos/boot') { if (!needBy()) return; return send(res, 200, { ok: true, ...(await sup.boot({ set: body.set, by: body.by })) }); }
      if (m === 'PATCH' && p === '/api/cos/policy') { if (!needBy()) return; return send(res, 200, { ok: true, policy: sup.setPolicy(body.patch || {}, { by: body.by }) }); }
      if (!p.startsWith('/api/cos') && door(req, res)) return;
      return send(res, 404, { ok: false, error: `no route ${m} ${p}` });
    } catch (e) { return send(res, /no system/.test(e.message) ? 404 : 500, { ok: false, error: e.message }); }
  });
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
  listen(sup, undefined, { root }).then(async (srv) => {
    console.log(`[cos] manager on 127.0.0.1:${srv.address().port} — ${sup.list().length} systems declared`);
    if (arg('handover')) sup.note('handover', `autopilot ${arg('handover')} handed supervision to COS's manager (MG17); its body is archived`, { by: 'boot' });
    // 2026-11-01 MG33 — James: "where is cos ui?". Nothing started the cockpit (cos/ui/serve.js) or linked to it: a screen with no way in. The
    // manager now starts it beside itself (COS_UI_PORT, default 7797; --no-ui to leave it off). Its port held → said once, the manager runs on.
    let ui = null;
    if (!process.argv.includes('--no-ui')) {
      const uiPort = Number(process.env.COS_UI_PORT) || 7797;
      ui = require('../ui/serve.js').createServer({ port: uiPort, manager: `http://127.0.0.1:${srv.address().port}` });
      ui.once('error', (e) => { console.log(`[cos] the cockpit did not start on :${uiPort} (${e.code || e.message}) — the manager runs on without it; node cos/ui/serve.js --port <n> starts it by hand`); ui = null; });
      ui.listen(uiPort, '127.0.0.1', () => console.log(`[cos] cockpit on http://127.0.0.1:${ui.address().port}/ (COS's UI)`));
    }
    if (process.argv.includes('--boot')) { const r = await sup.boot({ by: 'boot', ...(only ? { set: only } : {}) }); console.log(`[cos] booted ${r.started.length}, skipped ${r.skipped.length}`); }
    const bye = () => { sup.shutdown({ by: 'boot' }); srv.close(); if (ui) ui.close(); setTimeout(() => process.exit(0), 500).unref(); };
    process.on('SIGINT', bye); process.on('SIGTERM', bye);
  }).catch((e) => { console.error(`[cos] ${e.message}`); process.exit(1); });
}

module.exports = { createServer, listen };
