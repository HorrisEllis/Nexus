'use strict';
/**
 * cortex/core/raid/contract-v2-door.js — RAID's executable .contract v2 (contract-gates.js), by route. 2026-11-09.
 * James, 2026-11-09: "This makes nexus programmable. Every point of failure can be mapped. Bottle neck made explicit. Every. Thing nexus does, end
 * state first, step by step, each gate checks, if it fails becomes a gap to fix to get the pipeline moving again." · his yes to one contract, RAID's.
 * Cortex keeps the books (his, 2026-11-09: "Cortex is the book keeper."): a contract booked here is a file in Cortex's own data folder, and every
 * other system reaches it by these routes only (§5.15). The logic is contract-gates.js's; this is only its door.
 *
 *   handle(method, path, body, { dir }) → Promise<{ status, json }> | null (not one of its routes)
 *     POST /api/raid/contracts/v2                         { id, payload, by, replace? }  book a contract (validated; an agent's refused)
 *     GET  /api/raid/contracts/v2                         every booked contract: id, outcome, gates, passed, complete (PC12a)
 *     GET  /api/raid/contracts/v2/:id                     its outcome, gates (BLOCKED · READY · PASSED · FAILED · STALE), gaps, complete, why
 *     POST /api/raid/contracts/v2/:id/evidence            { key, value, by }  recorded; then every gate it may open is checked, until none moves
 *     POST /api/raid/contracts/v2/:id/gates/:gate/check   check one gate now against its evidence
 *     POST /api/raid/contracts/v2/:id/gates/:gate/split   { units?, by? }  split a gate into children (chunking)
 *     GET  /api/raid/contracts/v2/:id/gates/:gate/packet  the smallest context that gate needs: what an agent is handed
 */
const fs = require('fs'), path = require('path');
const CG = require('./contract-gates.js');

const PREFIX = '/api/raid/contracts/v2';
const defaultDir = () => process.env.CORTEX_CONTRACTS_DIR || path.join(__dirname, '..', '..', 'data', 'contracts', 'v2');

async function handle(method, p, body = {}, { dir = defaultDir() } = {}) {
  if (!p.startsWith(PREFIX)) return null;
  const NE = require('../../../lib/node-export.js');
  const fileOf = (id) => path.join(dir, `${String(id).replace(/[^\w.-]/g, '_')}.contract`);
  // PC12a (0.60.522): each gate also says what it waits on, its kind, its file and its parent, so a contract can be drawn and run as a pipeline
  // by COS (cos/pipeline/contract.eg); the evaluation itself is unchanged
  const shape = (L, gates) => gates.map(g => { const d = (L.payload.gates || []).find(x => x.id === g.id) || {};
    return { ...g, depends_on: d.depends_on || [], kind: d.kind || null, file: d.file || null, parent: d.parent || null, children: d.children || [] }; });
  const view = (id, L) => { const ev = CG.evaluate(L.payload); return { id, outcome: L.payload.outcome, gates: shape(L, ev.gates), gaps: L.payload.gaps || [], complete: ev.complete, why: ev.why, evidence: (L.payload.state && L.payload.state.evidence) || {} }; };
  const r = (status, json) => ({ status, json });
  try {
    if (p === PREFIX && method === 'POST') {
      if (/^agent:/.test(String(body.by || ''))) return r(403, { ok: false, error: 'an agent proposes a contract; booking one is a person\'s or a system\'s' });
      const id = String(body.id || '').trim(); if (!/^[\w.-]{1,160}$/.test(id)) return r(400, { ok: false, error: 'a contract needs an id: letters, digits, . - _' });
      const payload = { v: 2, ...(body.payload || {}) };
      const problems = CG.validate(payload); if (problems.length) return r(400, { ok: false, error: problems.join('; '), problems });
      fs.mkdirSync(dir, { recursive: true });
      if (fs.existsSync(fileOf(id)) && !body.replace) return r(409, { ok: false, error: `contract ${id} is booked already` });
      fs.writeFileSync(fileOf(id), NE.toYaml(NE.wrap('contract', id, payload, { context: `booked by ${body.by || 'unknown'}`, intent: payload.outcome && payload.outcome.what, tags: ['v2'] })));
      return r(200, { ok: true, ...view(id, CG.load(fileOf(id))) });
    }
    // PC12a (0.60.522) — James, 2026-11-13: "i want all pipelines managable, orchastratred, and programmable in cos. all of them." Every booked
    // contract, so COS can list them as pipelines: { contracts: [{ id, outcome, gates, passed, complete, at }] }; one unreadable is named, not hidden
    if (p === PREFIX && method === 'GET') {
      let names = []; try { names = fs.readdirSync(dir).filter(n => n.endsWith('.contract')).sort(); } catch (_) {}
      const contracts = [], unreadable = [];
      for (const n of names) { const id = n.slice(0, -'.contract'.length);
        try { const L = CG.load(path.join(dir, n)); const ev = CG.evaluate(L.payload);
          contracts.push({ id, outcome: L.payload.outcome || null, gates: ev.gates.length, passed: ev.gates.filter(g => g.status === 'PASSED').length, complete: ev.complete, at: fs.statSync(path.join(dir, n)).mtimeMs }); }
        catch (e) { unreadable.push({ id, why: e.message }); } }
      return r(200, { ok: true, contracts, unreadable });
    }
    const m = /^\/api\/raid\/contracts\/v2\/([\w.-]+)(?:\/(evidence|gates\/([\w.-]+)\/(check|split|packet)))?$/.exec(p);
    if (!m) return r(404, { ok: false, error: `no route ${method} ${p}` });
    const f = fileOf(m[1]); if (!fs.existsSync(f)) return r(404, { ok: false, error: `no contract ${m[1]}` });
    const L = CG.load(f);
    if (!m[2] && method === 'GET') return r(200, { ok: true, ...view(m[1], L) });
    if (m[2] === 'evidence' && method === 'POST') {
      if (!body.key) return r(400, { ok: false, error: 'evidence needs a key' });
      CG.record(L.payload, String(body.key), body.value === undefined ? true : body.value, { by: body.by || null });
      for (let round = 0; round < 50; round++) {   // the contract moves as far as its evidence takes it
        let moved = false;
        // only a gate whose evidence is all recorded is checked (a check without it would fail and spend an attempt); one that failed before
        // is tried again now that its evidence may be there
        const ev = (L.payload.state && L.payload.state.evidence) || {};
        const ripe = (id) => { const g = (L.payload.gates || []).find(x => x.id === id); return g && (g.pass_when || []).every(c => !c || c.evidence === undefined || Object.prototype.hasOwnProperty.call(ev, c.evidence)); };
        for (const g of CG.evaluate(L.payload).gates.filter(x => ['READY', 'STALE', 'FAILED'].includes(x.status) && ripe(x.id))) { const c = await CG.check(L.payload, g.id, { learn: false }); if (c.status === 'PASSED') moved = true; }
        if (!moved) break;
      }
      CG.save(f, L); return r(200, { ok: true, ...view(m[1], L) });
    }
    if (m[4] === 'check' && method === 'POST') { const c = await CG.check(L.payload, m[3], {}); CG.save(f, L); return r(200, { ok: true, check: c, ...view(m[1], L) }); }
    if (m[4] === 'split' && method === 'POST') { const s = CG.split(L.payload, m[3], { by: body.by || null, units: body.units || null }); CG.save(f, L); return r(200, { ok: true, split: s, ...view(m[1], L) }); }
    if (m[4] === 'packet' && method === 'GET') return r(200, { ok: true, packet: CG.packet(L.payload, m[3]) });
    return r(405, { ok: false, error: `${method} is not served on ${p}` });
  } catch (e) { return r(e.status || 500, { ok: false, error: e.message }); }
}

module.exports = { handle, PREFIX, MODULE_ID: 'cortex.raid.contract-v2-door', VERSION: '1.0.0' };
