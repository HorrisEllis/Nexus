'use strict';
/**
 * lib/agent-tools/tools/nexus-status.js — nexus_status tool
 * UUID: nexus-agent-tools-nexus-status-v1-0000-2026-0714-jamesbrooks-001
 *
 * §BUILT 2026-07-14 — "copilot needs to be the face of NEXUS, can do
 * anything the system can." Checked what was actually missing a few
 * turns back: LOOM (concerns, impact queries, scaffolding), nexus-healer
 * (proposal status), and hooks' impact-propagation queries had zero
 * agent-tool coverage. This closes the read-only half of that gap —
 * everything here is safe to expose without the same authorization
 * questions browser_action or forge needed, since nothing here mutates
 * anything.
 *
 * §HONEST SCOPE — two genuinely different "what does this affect"
 * mechanisms exist and are both exposed here, deliberately not merged
 * into one: LOOM's impactOf() walks component-to-component wire
 * relationships (declared intent). hooks' affectedBy() walks hook-level
 * shared write-targets (structural, from parsed sideEffects). Different
 * data, different granularity — checked this distinction directly a
 * few turns back when cross-system-status.js was built, same reasoning
 * applies here.
 */

const path = require('path');

function _loomDriver() {
  const { LoomDriver } = require('../../../../loom/schema/index.js');
  return new LoomDriver({ dataDir: path.join(__dirname, '..', '..', '..', '..', 'data', 'loom') });
}

const ACTIONS = {
  // ── LOOM concerns — the real roadmap, built 2026-07-14 ──────────────────
  concerns: (a) => {
    const driver = _loomDriver();
    const all = driver.registry.all('concern');
    const rows = Object.values(all || {});
    const filtered = a.severity ? rows.filter(c => c.severity === a.severity) : rows;
    return { ok: true, count: filtered.length, concerns: filtered.slice(0, a.limit || 20) };
  },

  // ── LOOM's component-level impact query ──────────────────────────────────
  componentImpact: (a) => {
    if (!a.componentId) return { ok: false, error: 'componentId is required' };
    const driver = _loomDriver();
    return { ok: true, ...driver.registry.impactOf(a.componentId, a.maxDepth || 8) };
  },

  // ── hooks' hook-level impact query (writersOf/emittersOf/affectedBy) ─────
  // §HONEST DISTINCTION, found by testing this tool, not assumed — LOOM's
  // own 'hook' kind (declared via LoomDriver.declare('hook', ...)) and the
  // hooks/*.hooks.js system these functions actually read (163 real,
  // checked-in declarations) are two genuinely SEPARATE systems that
  // happen to share the word "hook." A hookId here must be a real id from
  // hooks/*.hooks.js (e.g. 'ide-hook-idea-create-0001'), not a LOOM-
  // declared hook id — verified directly: declaring a hook through LOOM's
  // driver and querying it here returns nothing, because writersOf/
  // emittersOf never look at LOOM's registry at all.
  hookImpact: (a) => {
    const hooks = require('../../../../hooks/index.js');
    if (a.hookId) return { ok: true, ...hooks.affectedBy(a.hookId) };
    if (a.table)  return { ok: true, writers: hooks.writersOf(a.table) };
    if (a.event)  return { ok: true, emitters: hooks.emittersOf(a.event) };
    return { ok: false, error: 'one of hookId, table, or event is required' };
  },

  // ── nexus-healer's real proposal status ──────────────────────────────────
  healerStatus: async (a) => {
    const http = require('http');
    const port = process.env.NEXUS_HEALER_PORT || 3755;
    return new Promise((resolve) => {
      const req = http.request({ hostname: '127.0.0.1', port, path: '/proposals', method: 'GET', timeout: 5000 }, (res) => {
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { resolve({ ok: false, error: `bad response: ${e.message}` }); } });
      });
      req.on('error', (e) => resolve({ ok: false, error: `nexus-healer unreachable (:${port}): ${e.message}` }));
      req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'nexus-healer request timed out' }); });
      req.end();
    });
  },

  // ── real cross-system stuck-state report ──────────────────────────────────
  crossSystemStatus: (a) => {
    const { status } = require('../../../seam/cross-system-status.js');
    return { ok: true, ...status(a.staleMs ? { staleMs: a.staleMs } : {}) };
  },
};

module.exports = {
  name: 'nexus_status',
  description:
    'Read NEXUS\'s own real, current state — not a static description, live queries. ' +
    'Actions: "concerns" (real, detected roadmap items from LOOM — optional severity filter: low|medium|high), ' +
    '"componentImpact" (LOOM: what depends on this component, via declared wire intent — requires componentId), ' +
    '"hookImpact" (hooks: who writes a table / who emits an event / what\'s affected by changing a specific hook — requires one of hookId, table, or event), ' +
    '"healerStatus" (real self-improvement proposals and their status — proposed/generated/merged/archived), ' +
    '"crossSystemStatus" (real stuck-state report across idearium and SEAMQueue).',
  parameters: {
    type: 'object',
    properties: {
      action:      { type: 'string', enum: Object.keys(ACTIONS), description: 'Which real query to run' },
      severity:    { type: 'string', description: 'For "concerns": filter by low|medium|high' },
      limit:       { type: 'number', description: 'For "concerns": max rows to return' },
      componentId: { type: 'string', description: 'For "componentImpact": the LOOM component id' },
      maxDepth:    { type: 'number', description: 'For "componentImpact": how many hops to traverse' },
      hookId:      { type: 'string', description: 'For "hookImpact": a specific hook id to trace' },
      table:       { type: 'string', description: 'For "hookImpact": a jaa table name (bare, no jaa: prefix)' },
      event:       { type: 'string', description: 'For "hookImpact": an event type name' },
      staleMs:     { type: 'number', description: 'For "crossSystemStatus": age threshold for "stuck", in ms' },
    },
    required: ['action'],
  },
  execute: async (args = {}) => {
    const fn = ACTIONS[args.action];
    if (!fn) return { error: `unknown action "${args.action}" — expected one of: ${Object.keys(ACTIONS).join(', ')}` };
    try { return await fn(args); }
    catch (e) { return { error: `nexus_status action "${args.action}" failed: ${e.message}` }; }
  },
};
