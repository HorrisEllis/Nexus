'use strict';
/**
 * lib/agent-tools/tools/query-movement.js — copilot's access to system movement.
 * comp_id: nexus.lib.agent-tools.query-movement
 * UUID: nexus-tool-query-movement-v1-0000-2026-0808-001
 *
 * §WIRED 2026-08-08. lib/movement.js and lib/manifest.js existed with a CLI and
 * an HTTP route, and copilot could reach neither — the agent could not ask "what
 * is this system doing" or "what changed on disk" at all. §1.1: a capability the
 * agent cannot call is not the agent's capability.
 *
 * Reads cortex's /api/movement and /api/manifest — the SAME snapshots the CLI
 * panel renders. One data layer, three consumers. If cortex is down this tool
 * says cortex is down; it does not fall back to reading the disk itself, because
 * two paths to the same answer is how they drift.
 */
const http = require('http');

const CORTEX_PORT = process.env.CORTEX_PORT || 3748;

function _get(path, timeoutMs = 15000) {
  return new Promise(resolve => {
    const req = http.request({ hostname: '127.0.0.1', port: CORTEX_PORT, path, method: 'GET', timeout: timeoutMs },
      res => { let d = ''; res.on('data', c => d += c);
        res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { resolve({ error: `cortex returned unparseable body (${res.statusCode})` }); } }); });
    req.on('error', e => resolve({ error: `cortex unreachable on :${CORTEX_PORT}: ${e.code || e.message}` }));
    req.on('timeout', () => { req.destroy(); resolve({ error: `cortex timed out after ${timeoutMs}ms` }); });
    req.end();
  });
}

/** Trim a full snapshot to what an agent can act on without drowning. */
function _summarize(s) {
  if (!s || s.ok === false) return s;
  const out = {
    system: s.system,
    sourcesRead: `${s.sourcesRead}/${s.sourcesRead + (s.blind ? s.blind.length : 0)}`,
    // §1.2 — blind sources come FIRST. An unread source is not a quiet one, and
    // an agent reading a trimmed summary must see that before any number.
    blind: (s.blind || []).map(b => `${b.source}: ${b.reason}`),
    process: s.process && s.process.ok ? { status: s.process.status, restarts: s.process.restarts } : (s.process || {}).reason,
    events: s.events && s.events.ok ? { total: s.events.total, distinctTypes: s.events.distinctTypes, top: (s.events.types || []).slice(0, 5) } : (s.events || {}).reason,
    ledgers: s.ledgers && s.ledgers.ok ? { streams: s.ledgers.streams, kb: Math.round(s.ledgers.totalBytes / 1024), malformed: s.ledgers.malformed } : (s.ledgers || {}).reason,
    changes: s.changes && s.changes.ok ? { total: s.changes.total, errors: s.changes.errors, top: (s.changes.actions || []).slice(0, 4) } : (s.changes || {}).reason,
    gaps: s.gaps && s.gaps.ok ? { open: s.gaps.open, total: s.gaps.total, bySeverity: s.gaps.bySeverity } : (s.gaps || {}).reason,
    sigma: s.sigma && s.sigma.ok ? { avg: s.sigma.avgSigma, max: s.sigma.maxSigma, warn: s.sigma.warnCount, halt: s.sigma.haltCount } : (s.sigma || {}).reason,
    fileDrift: s.files && s.files.ok
      ? (s.files.baseline ? `no baseline yet (${s.files.fileCount} files)` :
         { sigma: s.files.sigma, band: s.files.band, added: s.files.added, removed: s.files.removed,
           changed: s.files.changed, renamed: s.files.renamed, ghost: s.files.ghost, reasons: s.files.reasons })
      : (s.files || {}).reason,
    errors: s.errors ? { fromEvents: s.errors.fromEvents, fromLedger: s.errors.fromLedger, note: s.errors.note } : null,
    frictionBlindTo: s.friction && s.friction.ok ? s.friction.blindTo : undefined,
  };
  return out;
}

const ACTIONS = {
  systems:  async () => _get('/api/movement'),
  snapshot: async (a) => {
    if (!a.system) return { error: 'system required — call action "systems" first to list them' };
    const win = a.hours ? Math.round(a.hours * 3600e3) : undefined;
    const raw = await _get(`/api/movement?system=${encodeURIComponent(a.system)}${win ? `&windowMs=${win}` : ''}`);
    if (raw.error) return raw;
    return a.full ? raw : _summarize(raw);
  },
  drift:    async (a) => {
    if (!a.system) return { error: 'system required' };
    return _get(`/api/manifest?system=${encodeURIComponent(a.system)}${a.expected ? '&expected=1' : ''}`);
  },
  baseline: async (a) => {
    if (!a.system) return { error: 'system required' };
    return _get(`/api/manifest?system=${encodeURIComponent(a.system)}&baseline=1`);
  },
};

module.exports = {
  name: 'query_movement',
  description:
    'All movement for one NEXUS system: process, events, ledgers, changes, gaps, sigma, friction, ' +
    'schema drift, file drift (sha256 manifest vs baseline), and errors. ' +
    'Actions: "systems" lists what can be asked about; "snapshot" returns the full picture ' +
    '(pass full=true for the untrimmed object); "drift" compares the file manifest against the stored ' +
    'baseline and scores it as a sigma; "baseline" stores the current manifest as the new comparison point. ' +
    'Every section reports whether it could be READ — a source that is blind is named, never shown as zero.',
  parameters: {
    type: 'object',
    properties: {
      action:   { type: 'string', enum: Object.keys(ACTIONS), description: 'which movement surface to query' },
      system:   { type: 'string', description: 'system name, e.g. guardian, cortex, idearium' },
      hours:    { type: 'number', description: 'window in hours for snapshot (default 24)' },
      full:     { type: 'boolean', description: 'return the untrimmed snapshot instead of the agent summary' },
      expected: { type: 'boolean', description: 'true when a build/dispatch was running — lowers drift sigma' },
    },
    required: ['action'],
  },
  async execute(args = {}) {
    const fn = ACTIONS[args.action];
    if (!fn) return { error: `unknown action "${args.action}" — one of: ${Object.keys(ACTIONS).join(', ')}` };
    try { return await fn(args); }
    catch (e) { return { error: `query_movement ${args.action} failed: ${e.message}` }; }
  },
};
