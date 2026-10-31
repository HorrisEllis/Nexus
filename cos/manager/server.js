'use strict';
/**
 * cos/manager/server.js — COS's manager as its own process: `node cos/manager/server.js [--boot]`.
 * Spec: cos/spec/cos-manager.spec MOD-MG-SERVER · Map: docs/2026-10-24-cos-manager-phasemap.spec MG15_the_supervisor_in_cos
 *
 * The supervisor's routes under /api/cos/ on :7799 (COS_MANAGER_PORT overrides), 127.0.0.1 only, headless. :7799 is autopilot's door; until
 * the handover (MG17) autopilot holds it, so this server says so and exits instead of starting a second supervisor (MG-001). autopilot's
 * own routes on this door are MG16's.
 *   GET  /api/cos/health · /api/cos/systems · /api/cos/systems/:name · /api/cos/ledger[?system&limit] · /api/cos/policy
 *   POST /api/cos/boot · /api/cos/systems/:name/(start|stop|restart|touch|reset-circuit) — each act carries { by } (MG-006)
 *   PATCH /api/cos/policy
 */
const http = require('http');
const path = require('path');
const { createSupervisor } = require('./supervisor.js');

function createServer(sup, { root = path.resolve(__dirname, '..', '..') } = {}) {
  const door = require('./autopilot-door.js').mount(sup, { ROOT: root });   // MG16: autopilot's routes, in its shapes (MG-003)
  const send = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  return http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x'), p = u.pathname.replace(/\/+$/, ''), m = req.method;
    let body = {};
    if ((m === 'POST' || m === 'PATCH') && p.startsWith('/api/cos')) { let raw = ''; for await (const c of req) raw += c; try { body = raw ? JSON.parse(raw) : {}; } catch (_) { return send(res, 400, { ok: false, error: 'the body is not JSON' }); } }
    try {
      if (m === 'GET' && p === '/api/cos/health') return send(res, 200, { ok: true, service: 'cos-manager', systems: sup.list().length, ledger: sup.ledgerFile });
      if (m === 'GET' && p === '/api/cos/systems') return send(res, 200, { ok: true, systems: sup.list() });
      if (m === 'GET' && p === '/api/cos/ledger') return send(res, 200, { ok: true, entries: sup.ledger({ limit: Number(u.searchParams.get('limit')) || 100, system: u.searchParams.get('system') }) });
      if (m === 'GET' && p === '/api/cos/legacy-callers') return send(res, 200, { ok: true, callers: door.legacyCallers() });   // MG16: who still calls /tables and /files
      if (m === 'GET' && p === '/api/cos/policy') return send(res, 200, { ok: true, policy: sup.policy() });
      const act = /^\/api\/cos\/systems\/([^/]+)(?:\/(start|stop|restart|touch|reset-circuit))?$/.exec(p);
      if (act && m === 'GET' && !act[2]) return send(res, 200, { ok: true, system: sup.get(decodeURIComponent(act[1])) });
      // MG-006: a start, stop, restart, boot or policy change is a person's act or a rule's, and says whose; touch is a request for the system
      const needBy = () => { if (!body.by) { send(res, 400, { ok: false, error: 'say who acts: { "by": "person" | "rule:<id>" }' }); return false; } return true; };
      if (act && m === 'POST' && act[2]) {
        const name = decodeURIComponent(act[1]);
        if (act[2] === 'touch') return send(res, 200, { ok: true, system: sup.touch(name) });
        if (!needBy()) return;
        const fn = { start: sup.start, stop: sup.stop, restart: sup.restart, 'reset-circuit': sup.resetCircuit }[act[2]];
        return send(res, 200, { ok: true, system: fn(name, { by: body.by }) });
      }
      if (m === 'POST' && p === '/api/cos/boot') { if (!needBy()) return; return send(res, 200, { ok: true, ...(await sup.boot({ set: body.set, by: body.by })) }); }
      if (m === 'PATCH' && p === '/api/cos/policy') { if (!needBy()) return; return send(res, 200, { ok: true, policy: sup.setPolicy(body.patch || {}, { by: body.by }) }); }
      if (!p.startsWith('/api/cos') && door(req, res)) return;
      return send(res, 404, { ok: false, error: `no route ${m} ${p}` });
    } catch (e) { return send(res, /no system/.test(e.message) ? 404 : 500, { ok: false, error: e.message }); }
  });
}

function listen(sup, port = Number(process.env.COS_MANAGER_PORT) || 7799) {
  return new Promise((resolve, reject) => {
    const srv = createServer(sup);
    srv.once('error', (e) => reject(e.code === 'EADDRINUSE' ? new Error(`:${port} is held — autopilot's door until the handover (MG17); COS does not start a second supervisor (MG-001)`) : e));
    srv.listen(port, '127.0.0.1', () => resolve(srv));
  });
}

if (require.main === module) {
  const root = path.resolve(__dirname, '..', '..');
  const sup = createSupervisor({ root });
  listen(sup).then(async (srv) => {
    console.log(`[cos] manager on 127.0.0.1:${srv.address().port} — ${sup.list().length} systems declared`);
    if (process.argv.includes('--boot')) { const r = await sup.boot({ by: 'boot' }); console.log(`[cos] booted ${r.started.length}, skipped ${r.skipped.length}`); }
    const bye = () => { sup.shutdown({ by: 'boot' }); srv.close(); setTimeout(() => process.exit(0), 500).unref(); };
    process.on('SIGINT', bye); process.on('SIGTERM', bye);
  }).catch((e) => { console.error(`[cos] ${e.message}`); process.exit(1); });
}

module.exports = { createServer, listen };
