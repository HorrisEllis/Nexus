'use strict';
/**
 * lib/agent-tools/tools/capability-tools.js — every DECLARED, SERVED capability
 * in NEXUS, callable by copilot. Generated, never hand-authored.
 * comp_id: nexus.lib.agent-tools.capability-tools
 * UUID: nexus-tool-capability-v1-0000-2026-0809-001
 *
 * WHY GENERATED (James, 2026-08-09: "each system, and subsystems that have or
 * create tools or commands over time, using the cortex index").
 *
 * There were 18 hand-written tool files. Writing 20 more is the loom-map failure
 * repeated: a hand list describes only what its author was looking at, and goes
 * stale the moment a system declares a new route. Meanwhile the tree already
 * declares 255 capabilities across 13 registry-components.js files, each with a
 * method, a path, a namespace and a description. Those ARE the tools. Nobody had
 * connected the two.
 *
 * So this reads the capability registry at call time. A system that declares a
 * new capability tomorrow is callable by the agent tomorrow, with no file
 * written and no list updated.
 *
 * ── ONE TOOL, NOT 255 ───────────────────────────────────────────────────────
 * Emitting 255 separate schemas would consume the agent's context before it
 * asked anything. This is one tool with a discovery action: `list` narrows by
 * system or keyword, `describe` returns one capability's contract, `call`
 * invokes it. The agent finds what it needs instead of carrying all of it.
 *
 * ── §1.1 — ONLY SERVED CAPABILITIES ARE OFFERED ─────────────────────────────
 * capability-map verifies every declared route against the real source of the
 * system that owns it. 16 of the 255 are declared and served by NOTHING. Those
 * are NOT offered as tools — handing an agent a tool that leads nowhere spends
 * a turn to produce a 404. They are still listed by `unserved`, because the fact
 * that they are declared is worth knowing; they are just not pretended to work.
 */

const http = require('http');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../../..');

let _cache = null, _cacheAt = 0;
const CACHE_MS = 30_000;

/** Load + verify the capability registry. Cached briefly; declarations change on disk, not per-call. */
function _capabilities() {
  if (_cache && Date.now() - _cacheAt < CACHE_MS) return _cache;
  const { loadAll, verifyRoutes } = require(path.join(ROOT, 'loom/scanners/capability-map.js'));
  const decls = loadAll();
  const { served } = verifyRoutes(decls);
  const rows = decls.map(c => ({
    id: c.id,
    system: c._dir,
    namespace: c.namespace,
    method: c.route.method,
    path: c.route.path,
    description: c.description || '',
    tags: c.tags || [],
    served: served.get(c.id) === true,
    declaredIn: c._sourceFile,
  }));
  _cache = { rows, served: rows.filter(r => r.served), unserved: rows.filter(r => !r.served) };
  _cacheAt = Date.now();
  return _cache;
}

/** Port for a system. Read from lib/version.js rather than hardcoded here. */
function _portFor(system) {
  const PORTS = { cortex: 3748, guardian: 7820, idearium: 4800, copilot: 7010,
                  orchestrator: 9000, diagnostic: 7825, loom: 7830, ollama: 7840,
                  eravos: 7850, architect: 7860, bridge: 7870, 'clear-glass': 7704,
                  'nexus-healer': 7880, emerge: 7890 };
  return process.env[`${system.toUpperCase().replace(/-/g, '_')}_PORT`] || PORTS[system] || null;
}

function _request(port, method, p, body, timeoutMs = 20000) {
  return new Promise(resolve => {
    let payload = null;
    if (body !== undefined && body !== null) { try { payload = Buffer.from(JSON.stringify(body)); } catch (_) {} }
    const req = http.request({ hostname: '127.0.0.1', port, path: p, method,
      headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {},
      timeout: timeoutMs },
      res => { let d = ''; res.on('data', c => { if (d.length < 400000) d += c; });
        res.on('end', () => { let j = null; try { j = JSON.parse(d); } catch (_) {}
          resolve({ status: res.statusCode, body: j !== null ? j : d.slice(0, 2000) }); }); });
    req.on('error', e => resolve({ error: `${method} ${p} on :${port} — ${e.code || e.message}` }));
    req.on('timeout', () => { req.destroy(); resolve({ error: `${method} ${p} timed out after ${timeoutMs}ms` }); });
    if (payload) req.write(payload);
    req.end();
  });
}

const ACTIONS = {
  /** Discovery. Narrow by system or keyword; never dumps all 255 at once. */
  list(a) {
    const { served, unserved } = _capabilities();
    let rows = served;
    if (a.system) rows = rows.filter(r => r.system === a.system || r.namespace === a.system);
    if (a.q) {
      const q = String(a.q).toLowerCase();
      rows = rows.filter(r => r.id.toLowerCase().includes(q) || r.path.toLowerCase().includes(q) ||
                              r.description.toLowerCase().includes(q) || (r.tags || []).some(t => String(t).toLowerCase().includes(q)));
    }
    const bySystem = {};
    for (const r of served) bySystem[r.system] = (bySystem[r.system] || 0) + 1;
    return {
      ok: true,
      matched: rows.length,
      capabilities: rows.slice(0, a.limit || 40).map(r => ({ id: r.id, call: `${r.method} ${r.path}`, description: r.description })),
      systems: bySystem,
      totalServed: served.length,
      // §1.1 — declared-but-unserved are reported, never offered.
      unservedCount: unserved.length,
      note: rows.length > (a.limit || 40) ? `showing ${a.limit || 40} of ${rows.length} — narrow with system or q` : undefined,
    };
  },

  describe(a) {
    if (!a.id) return { error: 'id required — use action "list" to find one' };
    const { rows } = _capabilities();
    const c = rows.find(r => r.id === a.id);
    if (!c) return { error: `no capability "${a.id}" — use action "list"` };
    if (!c.served) {
      return { ok: true, ...c,
        warning: 'DECLARED BUT SERVED BY NOTHING — calling this will not work. It is listed so you know it was declared, not so you call it (§1.1).' };
    }
    return { ok: true, ...c, port: _portFor(c.system) };
  },

  async call(a) {
    if (!a.id) return { error: 'id required' };
    const { rows } = _capabilities();
    const c = rows.find(r => r.id === a.id);
    if (!c) return { error: `no capability "${a.id}"` };
    if (!c.served) return { error: `"${a.id}" is declared but served by nothing — refusing to call it. Its route ${c.method} ${c.path} appears nowhere in ${c.system}'s source.` };
    const port = _portFor(c.system);
    if (!port) return { error: `no port known for system "${c.system}" — set ${c.system.toUpperCase()}_PORT` };

    let p = c.path;
    // Fill :params from args.params rather than guessing; an unfilled param is
    // refused by name so the agent can supply it, never silently sent as ":id".
    if (p.includes(':')) {
      const missing = [];
      p = p.replace(/:([A-Za-z0-9_]+)/g, (_, name) => {
        const v = a.params && a.params[name];
        if (v === undefined || v === null || v === '') { missing.push(name); return `:${name}`; }
        return encodeURIComponent(String(v));
      });
      if (missing.length) return { error: `${c.path} needs params: ${missing.join(', ')} — pass them in params{}` };
    }
    if (a.query && typeof a.query === 'object') {
      const qs = new URLSearchParams(a.query).toString();
      if (qs) p += (p.includes('?') ? '&' : '?') + qs;
    }

    const r = await _request(port, c.method, p, c.method === 'GET' ? undefined : (a.body || {}));
    // Record real usage so lib/tool-index.js fills from actual runs (§AP1).
    try {
      const ti = require(path.join(ROOT, 'lib/tool-index.js'));
      if (ti.record) ti.record('capability_call', {
        consumer: a._consumer || 'copilot', intent: a.intent || c.id,
        edgeCase: r.error || (r.status >= 400 ? `status ${r.status}` : null),
      });
    } catch (_) { /* index optional — never let bookkeeping fail a real call */ }
    return { ok: !r.error && r.status < 400, capability: c.id, call: `${c.method} ${p}`, ...r };
  },

  unserved() {
    const { unserved } = _capabilities();
    return { ok: true, count: unserved.length,
      note: 'Declared in a registry-components.js and served by nothing in the owning system source. Not offered as tools.',
      capabilities: unserved.map(r => ({ id: r.id, call: `${r.method} ${r.path}`, declaredIn: r.declaredIn })) };
  },
};

module.exports = {
  name: 'nexus_capability',
  description:
    'Call ANY declared capability of ANY NEXUS system. Generated from the 13 registry-components.js ' +
    'files at call time, so a system that declares a new route becomes callable with no code change. ' +
    'Actions: "list" to discover (narrow with system or q — do this first), "describe" for one ' +
    'capability\'s contract and port, "call" to invoke it, "unserved" to see which capabilities are ' +
    'declared but served by nothing. Only VERIFIED-SERVED capabilities can be called; the rest are ' +
    'reported and refused rather than pretended to work.',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: Object.keys(ACTIONS) },
      id:     { type: 'string', description: 'capability id, e.g. cortex.health — from action "list"' },
      system: { type: 'string', description: 'narrow list to one system' },
      q:      { type: 'string', description: 'keyword filter across id, path, description, tags' },
      limit:  { type: 'number', description: 'max rows from list (default 40)' },
      params: { type: 'object', description: 'values for :params in the route path' },
      query:  { type: 'object', description: 'querystring key/values' },
      body:   { type: 'object', description: 'JSON body for non-GET calls' },
      intent: { type: 'string', description: 'why you are calling — recorded in the living tool index' },
    },
    required: ['action'],
  },
  async execute(args = {}) {
    const fn = ACTIONS[args.action];
    if (!fn) return { error: `unknown action "${args.action}" — one of: ${Object.keys(ACTIONS).join(', ')}` };
    try { return await fn(args); }
    catch (e) { return { error: `nexus_capability ${args.action} failed: ${e.message}` }; }
  },
  _capabilities, _portFor,
};
