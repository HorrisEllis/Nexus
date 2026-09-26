'use strict';
/**
 * lib/agent-tools/tools/loom-scan.js — copilot's access to loom's scanners
 * comp_id: nexus.lib.agent-tools.loom-scan
 * UUID: nexus-tool-loom-scan-v1-0000-2026-0812-001
 *
 * §WIRED 2026-08-12 (James: "use co-pilot to use loom to expand, diagnose...").
 * loom/scanners/*.js are the modules that actually map the tree — declared
 * capabilities, dead requires, spec/registry divergence, raw source structure,
 * undeclared-but-real components. Only phasemap-map is wired to loom's own
 * HTTP server (GET /api/phasemap); the rest have no caller outside loom's own
 * CLI. §1.2: a scanner nobody calls is a scanner that goes stale unnoticed.
 *
 * capabilities/dangling/specs/source/closed_door require the scanner modules
 * IN-PROCESS — they are pure fs-reading functions, not bound to loom's server
 * process, same pattern faculty-tools.js and capability-tools.js already use
 * for cross-boundary lib requires. "phasemap" instead calls loom's own HTTP
 * route rather than requiring phasemap-map.js directly a second time — one
 * data layer, per query-movement.js's stated rule: two paths to the same
 * answer is how they drift.
 */
const path = require('path');
const http = require('http');
const ROOT = path.resolve(__dirname, '../../../..');
const LOOM_PORT = process.env.LOOM_PORT || 3752;

function _get(p) {
  return new Promise(resolve => {
    const req = http.request({ hostname: '127.0.0.1', port: LOOM_PORT, path: p, method: 'GET', timeout: 10000 },
      res => { let d = ''; res.on('data', c => d += c);
        res.on('end', () => { try { resolve(JSON.parse(d)); } catch (_) { resolve({ error: `loom returned unparseable body (${res.statusCode})` }); } }); });
    req.on('error', e => resolve({ error: `loom unreachable on :${LOOM_PORT}: ${e.code || e.message}` }));
    req.on('timeout', () => { req.destroy(); resolve({ error: 'loom timed out' }); });
    req.end();
  });
}

const ACTIONS = {
  capabilities: () => {
    const { loadAll } = require('../../../../loom/scanners/capability-map.js');
    const decls = loadAll();
    return { ok: true, total: decls.length, duplicates: decls.duplicates || [], sample: decls.slice(0, 20) };
  },
  dangling: () => {
    const { report } = require('../../../../loom/scanners/dangling-report.js');
    return { ok: true, ...report() };
  },
  specs: (a) => {
    const sm = require('../../../../loom/scanners/spec-map.js');
    const specs = sm.parseSpecs();
    const out = { ok: true, count: specs.length, divergent: sm.divergentPairs(specs) };
    if (a.checkRegistry) out.registryCoverage = sm.checkRegistryCoverage(specs);
    return out;
  },
  source: () => {
    const { scanTree } = require('../../../../loom/scanners/source-map.js');
    return { ok: true, ...scanTree() };
  },
  closed_door: (a) => {
    const { scan } = require('../../../../loom/scanners/closed-door.js');
    return { ok: true, ...scan({ rootDir: ROOT, minLines: a.minLines || 80 }) };
  },
  // §BUILT 2026-09-13 — James: "make a tool to find stubs, mocks,
  // unwired components/code/files." "unwired" is closed_door above,
  // already real; this is the other half — real stub/mock/placeholder
  // markers in real source (see loom/scanners/stub-finder.js's own
  // header for the exact 3 signal classes and their honest limits).
  stubs: (a) => {
    const { scan } = require('../../../../loom/scanners/stub-finder.js');
    return { ok: true, ...scan({ rootDir: ROOT, includeTests: !!a.includeTests }) };
  },
  // §BUILT 2026-09-13 — James: "can you create a .tool to find mock
  // data also." Same real scanner mock_data_finder (its own dedicated
  // tool) uses, reachable from loom_scan too for the same reason
  // "stubs" is: grounding a nexus_heal propose in what was actually found.
  mock_data: (a) => {
    const { scan } = require('../../../../loom/scanners/mock-data-finder.js');
    return { ok: true, ...scan({ rootDir: ROOT, includeTests: !!a.includeTests }) };
  },
  phasemap: (a) => a.system ? _get(`/api/phasemap/${encodeURIComponent(a.system)}`) : _get('/api/phasemap'),
};

module.exports = {
  name: 'loom_scan',
  description:
    'Scan the real NEXUS tree to expand/diagnose the map — the "what actually exists" layer under ' +
    'nexus_status\'s summaries. Actions: "capabilities" (all declared routes across every ' +
    'registry-components.js, with version-collision duplicates flagged), "dangling" (require()/import ' +
    'paths pointing at nothing on disk, grouped by file), "specs" (parsed .spec files and where they ' +
    'diverge from the registry; pass checkRegistry:true for full coverage check — slower), "source" ' +
    '(raw source tree structure), "closed_door" (undeclared components — real code nobody registered), ' +
    '"stubs" (real TODO/FIXME/STUB/MOCK markers, throw-not-implemented bodies, and mock-named ' +
    'identifiers outside tests — pass includeTests:true to also scan test files), "mock_data" (real ' +
    'placeholder emails/names/lorem-ipsum/phone numbers — literal fake DATA, distinct from "stubs"\' code ' +
    'shapes), "phasemap" (roadmap/phase state, optionally scoped to one system). Use before nexus_heal\'s ' +
    '"propose" so a proposed fix is grounded in a real finding, not a guess.',
  parameters: {
    type: 'object',
    properties: {
      action:         { type: 'string', enum: Object.keys(ACTIONS) },
      checkRegistry:  { type: 'boolean', description: 'for "specs" — also run the slower full registry-coverage check' },
      minLines:       { type: 'number', description: 'for "closed_door" — minimum file size to flag (default 80)' },
      includeTests:   { type: 'boolean', description: 'for "stubs"/"mock_data" — also scan test files (mock-named identifiers/placeholder data still excluded there by default per-signal, per each scanner\'s own design)' },
      system:         { type: 'string', description: 'for "phasemap" — scope to one system' },
    },
    required: ['action'],
  },
  async execute(args = {}) {
    const fn = ACTIONS[args.action];
    if (!fn) return { error: `unknown action "${args.action}" — one of: ${Object.keys(ACTIONS).join(', ')}` };
    try { return await fn(args); }
    catch (e) { return { error: `loom_scan ${args.action} failed: ${e.message}` }; }
  },
};
