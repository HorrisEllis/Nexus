'use strict';
// ── cli/nexus-repl-descriptors.js ───────────────────────────────────────────
// UUID: nexus-repl-descriptors-v1-0000-3600-0000-000000000001
// Version: 1.0.0
// Phase: 36 — Dynamic CLI Commands from Grammar Engine
//
// Registers nexus-repl's existing commands into component-registry so
// they're discoverable/resolvable by ANY grammar-engine consumer (not
// just nexus-repl itself — nexus-cli.js, future Phase 40.5 CLI projection,
// etc.). Per docs/cli.spec: re-register existing commands, don't rewrite
// the handler logic — these descriptors point at routes the underlying
// services already expose; the function bodies in nexus-repl.js are
// untouched.
//
// SCOPE: only `forge` is registered here, not all ~25 nexus-repl commands.
// Checked each one against orchestrator.js's actual proxy routes before
// writing anything — forge has a complete, verified, already-working path
// (POST /api/guardian/dispatch → guardian/command). heal (diagnostic
// :7825/gaps/:id/fix) and snapshot (cortex :3748/api/snapshot) do NOT have
// an orchestrator-relative proxy route yet — registering them with a route
// that doesn't actually work through the dispatcher would be exactly the
// kind of "pretends to work" §1.2 forbids. Same template applies to the
// rest once their proxy routes exist; not done here.

const http = require('http');

const MODULE_ID = 'nexus-repl-descriptors';
const VERSION   = '1.0.0';

// SCOPE UPDATE: heal and snapshot now have real, verified orchestrator-
// relative proxy routes (added to orchestrator.js this session — see
// diagnostic proxy block and existing /api/cortex/snapshots/create).
// snapshot's underlying nexus-repl.js handler was also fixed: it was
// calling cortex/api/snapshot (singular), which doesn't exist — cortex
// only serves /api/snapshots/create (plural). Found and fixed before
// registering this descriptor, not after — registering a broken route
// would have just made the bug discoverable from more places.

const DESCRIPTORS = [
  {
    id: 'repl.forge',
    namespace: 'repl',
    name: 'forge',
    version: '1.0.0',
    description: 'Dispatch a forge job to guardian — RAID picks the provider.',
    grammar: ['forge'],
    route: { method: 'POST', path: '/api/guardian/dispatch' },
    params: [
      { name: 'prompt', type: 'string', required: true },
    ],
    returns: { type: 'object', render: 'json' },
    tags: ['cli', 'forge', 'guardian'],
  },
  {
    id: 'repl.heal',
    namespace: 'repl',
    name: 'heal',
    version: '1.0.0',
    description: 'Trigger HEAL_REQUESTED for a specific gap via diagnostic.',
    grammar: ['heal'],
    // CAVEAT, checked directly: nexus-cli.js's generic component.route
    // dispatcher does zero path-parameter substitution — it sends route.path
    // as a literal string. A :uuid placeholder here is discoverable (shows
    // up in grammar/registry/tab-completion) but NOT genuinely dispatchable
    // through the generic exec path the way forge/snapshot are, until
    // path-param substitution exists somewhere. nexus-repl.js's own `heal`
    // command still works fine — it calls diagnostic directly with the real
    // gapId already substituted, bypassing component.route entirely. Don't
    // remove that direct call; this registration is for discoverability,
    // not (yet) for replacing it.
    route: { method: 'POST', path: '/api/diagnostic/gaps/:uuid/fix' },
    params: [
      { name: 'uuid', type: 'string', required: true },
    ],
    returns: { type: 'object', render: 'json' },
    tags: ['cli', 'heal', 'diagnostic', 'gaps'],
  },
  {
    id: 'repl.snapshot',
    namespace: 'repl',
    name: 'snapshot',
    version: '1.0.0',
    description: 'Take a manual cortex snapshot.',
    grammar: ['snapshot'],
    route: { method: 'POST', path: '/api/cortex/snapshots/create' },
    params: [
      { name: 'message', type: 'string', required: false },
    ],
    returns: { type: 'object', render: 'json' },
    tags: ['cli', 'snapshot', 'cortex'],
  },
  {
    id: 'repl.copilot',
    namespace: 'repl',
    name: 'copilot',
    version: '1.0.0',
    description: 'Talk to the co-pilot — full context, RAID-gated tool execution.',
    grammar: ['copilot', 'cp'],
    route: { method: 'POST', path: '/api/guardian/copilot/prompt' },
    params: [
      { name: 'prompt', type: 'string', required: true },
      { name: 'command', type: 'string', required: false },
    ],
    returns: { type: 'object', render: 'json' },
    tags: ['cli', 'copilot', 'guardian'],
  },
];

function _request(orchestratorUrl, method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? Buffer.from(JSON.stringify(body)) : null;
    const url = new URL(orchestratorUrl + path);
    const req = http.request(url, {
      method,
      headers: { 'Content-Type': 'application/json', 'Content-Length': payload ? payload.length : 0 },
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
        catch (e) { resolve({ ok: false, error: 'parse error' }); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * Registers all descriptors in this file. Safe to call on every nexus-repl
 * startup — component-registry's register() merges on existing id rather
 * than erroring, so re-registration is idempotent, not a duplicate-entry
 * problem.
 */
async function registerAll(orchestratorUrl = 'http://127.0.0.1:9000') {
  const results = [];
  for (const descriptor of DESCRIPTORS) {
    try {
      const r = await _request(orchestratorUrl, 'POST', '/api/components/register', descriptor);
      results.push({ id: descriptor.id, ok: r.ok !== false, result: r });
    } catch (e) {
      results.push({ id: descriptor.id, ok: false, error: e.message });
    }
  }
  return results;
}

module.exports = { DESCRIPTORS, registerAll, MODULE_ID, VERSION };
