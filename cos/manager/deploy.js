'use strict';
/**
 * cos/manager/deploy.js — deploy an agent, a task or a pipeline to any system, through a COS proposal (OC4a, 0.60.445).
 * Spec: docs/orchestration-console.spec MOD-OC-DEPLOY (schema Deployment) · Map: docs/2026-11-01-orchestration-console-phasemap.spec OC4.
 *
 * James, 2026-11-01: "deploy them to any system" · 2026-11-08: "Also the automation is to deploy agents to systems." · "can we do that? 0c4? then
 * back to emerge."
 *
 * A deployment is a held act (proposals.js, verb deploy — SC4's pattern, not a second mechanism). His own is taken in the same click
 * (USER_AUTONOMY); an agent's waits for him (OC-002: never applied without a take). Taken:
 *   task      do.kind command, do.ref "<METHOD> <path>": COS calls that route on the target system's own address (its healthUrl's origin),
 *             through the system's door, never its files (§5.15). running → done | failed, with the status and the start of the reply.
 *   agent, pipeline   recorded as taken; their runners are OC4b, said on the deployment ("no runner yet (OC4b)").
 * Every step is a line on COS's ledger. The store is append-only (newest line per id is its state; §0.3).
 *
 *   createDeploy(sup, proposals, { file, fetch }) → { propose({ what, system, by, why }), deployments({ system }), get(id), recall(id, { by }) }
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const KINDS = ['task', 'agent', 'pipeline'];
const ROUTE = /^(GET|POST|PUT|PATCH|DELETE)\s+(\/[^\s]*)$/;
const err = (msg, code = 400) => Object.assign(new Error(msg), { code });

function call(origin, method, p, body, timeoutMs = 30000) {
  return new Promise((resolve) => {
    const u = new URL(p, origin); const data = body == null ? null : JSON.stringify(body);
    const q = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method, timeout: timeoutMs,
      headers: { 'Content-Type': 'application/json', 'X-Nexus-Caller': 'cos-deploy', ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) } }, (r) => {
      let t = ''; r.on('data', c => { if (t.length < 4096) t += c; }); r.on('end', () => resolve({ ok: r.statusCode < 400, status: r.statusCode, reply: t.slice(0, 600) }));
    });
    q.on('timeout', () => { q.destroy(); resolve({ ok: false, status: null, error: `no answer in ${timeoutMs / 1000} s` }); });
    q.on('error', (e) => resolve({ ok: false, status: null, error: e.code || e.message }));
    if (data) q.write(data); q.end();
  });
}

function createDeploy(sup, proposals, { file = null, fetch = call } = {}) {
  const FILE = file || path.join(path.dirname(sup.ledgerFile), 'deployments.jsonl');
  const read = () => { const m = new Map(); try { for (const l of fs.readFileSync(FILE, 'utf8').split('\n')) { if (!l.trim()) continue; try { const d = JSON.parse(l); m.set(d.id, d); } catch (_) {} } } catch (_) {} return m; };
  const save = (d) => { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.appendFileSync(FILE, JSON.stringify({ ...d, at: Date.now() }) + '\n'); return d; };
  let seq = 0;

  function normalise(what = {}) {
    const kind = String(what.kind || '');
    if (!KINDS.includes(kind)) throw err(`what.kind is one of ${KINDS.join(', ')}: not "${kind}"`);
    if (kind === 'task') {
      const t = what.task || {}; const ref = String((t.do && t.do.ref) || what.ref || '').trim(); const dk = String((t.do && t.do.kind) || 'command');
      if (dk === 'command' && !ROUTE.test(ref)) throw err(`a task COS runs is a route call: do.ref "<METHOD> <path>", e.g. "GET /health" — not "${ref}"`);
      return { kind, ref, task: { id: String(t.id || `deploy-${Date.now().toString(36)}`), title: t.title || ref, do: { kind: dk, ref, ...(t.do && t.do.body !== undefined ? { body: t.do.body } : {}) } } };
    }
    const ref = String(what.ref || '').trim(); if (!ref) throw err(`what.ref names the ${kind} (a hat, or a pipeline id)`);
    return { kind, ref };
  }

  function check({ target, payload = {} }) {
    const sys = sup.get(target);   // throws for an undeclared system (GATE-OC4-001)
    const what = normalise(payload.what);
    return { payload: { what, system: sys.name }, why: `deploy ${what.kind} ${what.ref} to ${sys.name}` };
  }

  function run(p, { by }) {
    const { what, system } = p.payload;
    const d = save({ id: `d-${Date.now().toString(36)}${(seq++).toString(36)}`, what, system, compartment: system, proposal: p.id, by, proposedBy: p.by, state: 'taken' });
    sup.note('deploy', `${what.kind} ${what.ref} deployed to ${system} (${d.id}, proposal ${p.id})`, { by, system });
    if (what.kind !== 'task') { save({ ...d, state: 'taken', note: `no runner yet for ${what.kind === 'agent' ? 'an' : 'a'} ${what.kind} (OC4b): recorded, not run` }); return get(d.id); }
    if (what.task.do.kind !== 'command') { save({ ...d, state: 'taken', note: `a task of kind ${what.task.do.kind} has no runner in COS yet (OC4b)` }); return get(d.id); }
    const decl = sup.declarations().find(x => x.name === system) || {};
    if (!decl.healthUrl) { save({ ...d, state: 'failed', error: `${system} declares no healthUrl: COS does not know its address` }); sup.note('deploy-failed', `${d.id}: ${system} has no address`, { by, system }); return get(d.id); }
    const origin = new URL(decl.healthUrl).origin; const [, method, rp] = ROUTE.exec(what.task.do.ref);
    save({ ...d, state: 'running', origin });
    fetch(origin, method, rp, what.task.do.body).then((r) => {
      if (read().get(d.id).state === 'stopped') return;   // recalled while it ran: the recall stands
      const fin = { ...d, origin, state: r.ok ? 'done' : 'failed', result: { status: r.status, reply: r.reply || null }, ...(r.ok ? {} : { error: r.error || `${system} answered ${r.status}` }) };
      save(fin); sup.note(r.ok ? 'deploy-done' : 'deploy-failed', `${d.id} on ${system}: ${method} ${rp} → ${r.status || r.error}`, { by, system });
    });
    return get(d.id);
  }

  proposals.register('deploy', { check, run, people: true });

  function propose({ what, system, by, why } = {}) {
    if (!by) throw err('say who deploys: { "by": "person" | "agent:<name>" }');
    const proposal = proposals.hold({ by, verb: 'deploy', target: system, why, payload: { what } });
    if (/^agent:|^rule:/.test(String(by))) return { proposal };
    const t = proposals.take(proposal.id, { by });   // his own: taken in the same click
    return { proposal: t.proposal, deployment: t.result };
  }
  function get(id) { const d = read().get(id); if (!d) throw err(`no deployment "${id}"`, 404); return d; }
  function deployments({ system = null } = {}) { return [...read().values()].filter(d => !system || d.system === system).sort((a, b) => b.at - a.at); }
  function recall(id, { by } = {}) {
    if (!by || /^agent:/.test(String(by))) throw err('a recall is a person\'s or a rule\'s: { "by": "person" }');
    const d = get(id); if (['stopped', 'done', 'failed'].includes(d.state)) return { ...d, said: `already ${d.state}` };
    save({ ...d, state: 'stopped', recalledBy: by }); sup.note('deploy-recalled', `${id} recalled from ${d.system}`, { by, system: d.system });
    return get(id);
  }
  return { propose, deployments, get, recall, KINDS, file: FILE };
}

module.exports = { createDeploy, KINDS, ROUTE, MODULE_ID: 'cos.manager.deploy', VERSION: '1.0.0' };
