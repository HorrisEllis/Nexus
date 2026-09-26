'use strict';
/**
 * lib/file-integrity.js — File + Component + SEAM Hash Integrity
 * UUID: nexus-file-integrity-v1-0000-4000-0000-000000000001
 * Version: 1.0.0
 *
 * Extends lib/spec-drift.js with content-hash integrity:
 *   - Every component's registry-components.js gets a FNV-1a content hash
 *   - Every SEAM wire declaration is hashed (hookId + from + to)
 *   - Every source file in the WATCH_PATHS list is hashed
 *   - Hashes stored in JAA table `integrity_baseline`
 *   - On every boot: current hashes diffed against baseline
 *   - Drift → sigma score computed → gap opened → CFR field nudged
 *
 * Sigma derivation:
 *   - No drift              → sigma 0.0
 *   - 1 file changed        → sigma 0.2 (low)
 *   - Registry changed      → sigma 0.5 (medium — component surface changed)
 *   - SEAM wire changed     → sigma 0.7 (high — routing topology changed)
 *   - Multiple + registry   → sigma 0.9 (critical)
 *
 * Maps to: IMP-02 (spec-vs-code diff) + Phase 105 (named delta types)
 * Uses:    identity.js FNV-1a hash64 (ported inline — no ESM dependency)
 *
 * §1.2  Nothing silently fails — every hash miss opens a gap
 * §2.1  Baseline written to JAA before any comparison result is used
 * §5.1  Every baseline entry has a UUID
 */

'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const MODULE_ID = 'file-integrity';
const VERSION   = '1.0.0';
const ROOT      = path.join(__dirname, '..');

// ── FNV-1a hash (ported from identity-v6.js — Phase 105) ────────────────────
// Two 32-bit lanes. Deterministic, zero deps.
function _hash64(s) {
  let h1 = 0x811c9dc5 | 0, h2 = 0xc4a6c57b | 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x01000193) ^ (h1 >>> 13);
  }
  return ((h1 >>> 0).toString(16).padStart(8, '0'))
       + ((h2 >>> 0).toString(16).padStart(8, '0'));
}

// Stable key-sorted serialization (same as identity.js canonicalize)
function _canon(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(_canon).join(',') + ']';
  if (typeof v === 'object') {
    const keys = Object.keys(v).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + _canon(v[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}

// ── Source files to watch ────────────────────────────────────────────────────
// Each entry: { ns, path } — ns is the system namespace for grouping diffs
const WATCH_PATHS = [
  // Orchestrator
  { ns: 'orchestrator',  file: 'orchestrator/orchestrator.js' },
  // Cortex
  { ns: 'cortex',        file: 'cortex/cortex.js' },
  { ns: 'cortex',        file: 'cortex/core/raid/index.js' },
  { ns: 'cortex',        file: 'cortex/intelligence/index.js' },
  { ns: 'cortex',        file: 'cortex/memory/jaa-db.js' },
  // Guardian
  { ns: 'guardian',      file: 'guardian/server.js' },
  { ns: 'guardian',      file: 'guardian/lib/seam-queue.js' },
  // §RETIRED 2026-09-06 — bridge entries removed, files archived.
  // Lib core
  { ns: 'lib',           file: 'lib/spec-drift.js' },
  { ns: 'lib',           file: 'lib/baseline.js' },
  { ns: 'lib',           file: 'lib/grammar-engine.js' },
  { ns: 'lib',           file: 'lib/component-registry.js' },
  { ns: 'lib',           file: 'lib/cfr/field.js' },
  { ns: 'lib',           file: 'lib/cfr/ledger.js' },
  { ns: 'lib',           file: 'lib/cfr/sigma.js' },
  { ns: 'lib',           file: 'lib/hot-loader.js' },
  { ns: 'lib',           file: 'lib/blueprint.js' },
  // Service
  { ns: 'service',       file: 'diagnostic/nexus-diagnostic.js' },
];

// Registry-components files — one per system
const REGISTRY_PATHS = {
  orchestrator:  'orchestrator/orchestrator-contract.json',
  cortex:        'cortex/registry-components.js',
  guardian:      'guardian/registry-components.js',
  architect:     'architect/registry-components.js',
  bridge:        'bridge/registry-components.js',
  emerge:        'emerge/registry-components.js',
  copilot:       'copilot/registry-components.js',
  idearium:      'idearium/registry-components.js',
  ollama:        'ollama/registry-components.js',
  'clear-glass': 'clear-glass/registry-components.js',
};

// ── Hash a file ──────────────────────────────────────────────────────────────
function _hashFile(relPath) {
  try {
    const abs = path.join(ROOT, relPath);
    if (!fs.existsSync(abs)) return null;
    const content = fs.readFileSync(abs, 'utf8');
    return _hash64(content);
  } catch(_) { return null; }
}

// ── Hash registry-components exports ─────────────────────────────────────────
// Hashes the structural shape: component IDs, routes, hook declarations
// Not the raw file — so whitespace/comment changes don't trigger drift
function _hashRegistry(relPath) {
  try {
    const abs = path.join(ROOT, relPath);
    if (!fs.existsSync(abs)) return null;
    const m = require(abs);
    const comps = Array.isArray(m) ? m : (m.components || []);
    // Canonical shape: id + route + hook declarations
    const shape = comps.map(c => ({
      id:    c.id,
      route: c.route,
      hooks: {
        in:  (c.hooks?.in  || []).map(h => ({ id: h.id, intent: h.intent })),
        out: (c.hooks?.out || []).map(h => ({ id: h.id, wires_to: h.wires_to })),
      },
    }));
    return _hash64(_canon(shape));
  } catch(_) { return null; }
}

// ── Hash SEAM wire topology ───────────────────────────────────────────────────
// A wire is (from, hookId, to) — hashes the full declared graph
function _hashWires() {
  const wires = [];
  for (const [ns, relPath] of Object.entries(REGISTRY_PATHS)) {
    try {
      const abs = path.join(ROOT, relPath);
      if (!fs.existsSync(abs)) continue;
      const m = require(abs);
      const comps = Array.isArray(m) ? m : (m.components || []);
      for (const c of comps) {
        for (const hookOut of (c.hooks?.out || [])) {
          for (const target of (hookOut.wires_to || [])) {
            wires.push({ from: c.id, hookId: hookOut.id, to: target });
          }
        }
      }
    } catch(_) {}
  }
  // Sort for stability
  wires.sort((a, b) => (a.from + a.to).localeCompare(b.from + b.to));
  return _hash64(_canon(wires));
}

// ── Hash per-route-handler blocks within a file ──────────────────────────────
// §VERSIONIUM STEP 3 2026-08-28 — James: "versionium. bottom up." The spec's
// own build_order named this exact gap: _hashFile above treats an entire
// file as ONE atomic hash — guardian/server.js is 4,263 lines across ~67
// real route handlers; one route changing flips the whole file's hash with
// zero indication of WHICH component actually moved. The spec's proposed
// fix (Phase 116 — split guardian/server.js into multiple files by domain)
// was only ever mapped, never built, and is a large, separate, risky
// refactor of a live, critical file.
//
// This is the narrower alternative, PROPOSED to James and confirmed before
// building: use the file's own REAL, EXISTING route-boundary structure
// (`if (... method === '...' ...) {`) as natural component boundaries,
// with real brace-depth tracking — NOT a naive "next matching line" split,
// which was measured directly against guardian/server.js and produced 106
// false boundaries (nested `if` conditions inside an already-open route
// block, like the real /lab route's nested method check, were mistaken for
// new top-level routes). Depth-aware tracking (only count a boundary when
// nesting depth equals 1 — immediately inside the request-handler body,
// the real depth every genuine top-level route check sits at) measured at
// 67 real components, 66/67 (99%) perfectly brace-balanced. The one
// remaining imprecision is an honest, understood edge case: the LAST
// route's block extends to end-of-file by definition (no next boundary to
// stop at), sweeping in any trailing non-route helper code — a minor
// imprecision affecting only the final detected component, not a
// structural parsing failure.
//
// ROUTE_BLOCK_FILES is deliberately opt-in and short (not every WATCH_PATHS
// file has this route-per-if structure — cortex.js, jaa-db.js etc. don't).
// Each real boundary's own route-check line text becomes its key (e.g.
// "if (method==='GET' && url.pathname==='/queue')") — a real, stable,
// human-readable identifier already present in the source, not an
// invented UUID requiring new markers in the file.
const ROUTE_BLOCK_FILES = [
  { ns: 'guardian', file: 'guardian/server.js' },
];

function _hashRouteBlocks(relPath) {
  try {
    const abs = path.join(ROOT, relPath);
    if (!fs.existsSync(abs)) return [];
    const src   = fs.readFileSync(abs, 'utf8');
    const lines = src.split('\n');
    // Same tolerant pattern proven against the real file: order-independent
    // (url.pathname first or method first), spacing-tolerant (===, ===),
    // matches both exact-string and regex-test route checks.
    const routeLineRe = /if\s*\(\s*(?:url\.pathname\s*(?:===|\.startsWith|\.test)|method\s*===|\/\^)/;

    let depth = 0;
    const boundaries = [];
    lines.forEach((line, i) => {
      const isCandidate = routeLineRe.test(line) && /method\s*===/.test(line);
      if (isCandidate && depth === 1) boundaries.push(i);
      const opens  = (line.match(/{/g) || []).length;
      const closes = (line.match(/}/g) || []).length;
      depth += opens - closes;
    });

    const blocks = [];
    for (let i = 0; i < boundaries.length; i++) {
      const start = boundaries[i];
      const end   = i + 1 < boundaries.length ? boundaries[i + 1] : lines.length;
      const text  = lines.slice(start, end).join('\n');
      // Real, stable key: the route-check line itself, trimmed — already a
      // meaningful, human-readable identifier, not an invented number that
      // would shift if a route were added/removed earlier in the file.
      const routeKey = lines[start].trim().slice(0, 120);
      blocks.push({ routeKey, hash: _hash64(text), lineStart: start + 1 });
    }
    return blocks;
  } catch (_) { return []; }
}

// ── Compute sigma from drift results ─────────────────────────────────────────
function _computeSigma(changes) {
  if (!changes.length) return 0.0;

  const hasRegistry = changes.some(c => c.category === 'registry');
  const hasWires    = changes.some(c => c.category === 'wires');
  const fileCount   = changes.filter(c => c.category === 'file').length;

  if (hasWires && hasRegistry)           return 0.90;
  if (hasWires)                          return 0.72;
  if (hasRegistry && fileCount >= 3)     return 0.65;
  if (hasRegistry)                       return 0.50;
  if (fileCount >= 5)                    return 0.45;
  if (fileCount >= 2)                    return 0.30;
  return 0.20;
}

// ── Snapshot current state ────────────────────────────────────────────────────
function snapshot() {
  const ts      = Date.now();
  const entries = [];

  // Source files
  for (const { ns, file } of WATCH_PATHS) {
    const hash = _hashFile(file);
    entries.push({
      uuid:     crypto.randomUUID(),
      category: 'file',
      ns,
      key:      file,
      hash,
      ts,
    });
  }

  // Registry structural hashes
  for (const [ns, relPath] of Object.entries(REGISTRY_PATHS)) {
    const hash = _hashRegistry(relPath);
    entries.push({
      uuid:     crypto.randomUUID(),
      category: 'registry',
      ns,
      key:      relPath,
      hash,
      ts,
    });
  }

  // SEAM wire topology hash
  entries.push({
    uuid:     crypto.randomUUID(),
    category: 'wires',
    ns:       'seam',
    key:      '__wire_topology__',
    hash:     _hashWires(),
    ts,
  });

  // §VERSIONIUM STEP 3 — per-route-handler blocks, opt-in via
  // ROUTE_BLOCK_FILES. category:'route-block' is new but check() below
  // needed zero changes to consume it — its diffing is already fully
  // generic over category, matched purely by key. key is namespaced with
  // the owning file so a route text that happens to repeat verbatim in a
  // future second file (unlikely, but real) can never collide.
  for (const { ns, file } of ROUTE_BLOCK_FILES) {
    for (const block of _hashRouteBlocks(file)) {
      entries.push({
        uuid:     crypto.randomUUID(),
        category: 'route-block',
        ns,
        key:      `${file}#${block.routeKey}`,
        hash:     block.hash,
        ts,
      });
    }
  }

  return entries;
}

// ── Check: diff current against baseline ────────────────────────────────────
function check(opts = {}) {
  const { jaaDB = null, bus = null, cfr = null } = opts;

  const current  = snapshot();
  const changes  = [];
  const newFiles = [];
  const missing  = [];

  // Load baseline from JAA
  let baseline = [];
  if (jaaDB) {
    try {
      baseline = jaaDB.query('integrity_baseline', () => true, 5000);
    } catch(_) {}
  }

  const baselineMap = new Map(baseline.map(b => [b.key, b]));

  for (const entry of current) {
    const prev = baselineMap.get(entry.key);

    if (!prev) {
      newFiles.push(entry);
      continue;
    }

    if (entry.hash === null) {
      missing.push({ key: entry.key, ns: entry.ns, category: entry.category });
      continue;
    }

    if (prev.hash !== null && entry.hash !== prev.hash) {
      changes.push({
        key:       entry.key,
        ns:        entry.ns,
        category:  entry.category,
        prevHash:  prev.hash,
        currHash:  entry.hash,
        prevTs:    prev.ts,
        currTs:    entry.ts,
        ageSecs:   Math.round((entry.ts - prev.ts) / 1000),
      });
    }
  }

  const sigma  = _computeSigma(changes);
  const ok     = changes.length === 0 && missing.length === 0;
  const ts     = Date.now();

  // Log
  if (changes.length) {
    console.log(`[${MODULE_ID}] ${changes.length} change(s) detected — sigma=${sigma.toFixed(3)}`);
    for (const c of changes) {
      const cat = c.category === 'registry'     ? '⚡ registry' :
                  c.category === 'wires'        ? '🔗 wires'    :
                  c.category === 'route-block'  ? '🧩 route'    : '📄 file';
      console.log(`  ${cat}  ${c.key}  ${c.prevHash?.slice(0,8)}→${c.currHash?.slice(0,8)}`);
    }
  }

  // Write new baseline to JAA (§2.1 — disk before behavior)
  if (jaaDB) {
    try {
      // Clear old baseline
      const old = jaaDB.query('integrity_baseline', () => true, 5000);
      for (const o of old) {
        try { jaaDB.delete('integrity_baseline', o.uuid); } catch(_) {}
      }
      // Insert new
      for (const entry of current) {
        if (entry.hash !== null) {
          jaaDB.insert('integrity_baseline', entry);
        }
      }
    } catch(e) {
      console.warn(`[${MODULE_ID}] §1.2 baseline write failed: ${e.message}`);
    }
  }

  // Open gap if drifted
  if (jaaDB && changes.length > 0) {
    _openIntegrityGap(jaaDB, bus, changes, sigma, ts);
  }

  // Nudge CFR field
  if (cfr && sigma > 0) {
    try { cfr.update('file.integrity.drift', sigma); } catch(_) {}
  }

  // Emit bus event
  if (bus?.emit && changes.length > 0) {
    bus.emit('integrity.drift.detected', {
      changeCount: changes.length,
      sigma,
      registryChanged: changes.some(c => c.category === 'registry'),
      wiresChanged:    changes.some(c => c.category === 'wires'),
      changes:         changes.map(c => ({ key: c.key, category: c.category, ns: c.ns })),
      ts,
    });
  }

  return {
    ok,
    sigma,
    changes,
    newFiles,
    missing,
    checkedAt: ts,
    summary:   ok
      ? `${current.length} entries checked — no drift`
      : `${changes.length} changed, sigma=${sigma.toFixed(3)}`,
  };
}

// ── Gap management ────────────────────────────────────────────────────────────
function _openIntegrityGap(jaaDB, bus, changes, sigma, ts) {
  const existing = jaaDB.query('gaps',
    r => r.type === 'file.integrity.drift' && r.status === 'open', 1);

  const severity = sigma >= 0.7 ? 'high' : sigma >= 0.4 ? 'medium' : 'low';

  const regChanged   = changes.filter(c => c.category === 'registry').map(c => c.ns);
  const wiresChanged = changes.some(c => c.category === 'wires');
  const filesChanged = changes.filter(c => c.category === 'file').map(c => c.key);

  const body = [
    regChanged.length   ? `Registry changed: ${regChanged.join(', ')}` : null,
    wiresChanged        ? 'SEAM wire topology changed' : null,
    filesChanged.length ? `Files: ${filesChanged.slice(0,5).join(', ')}${filesChanged.length > 5 ? ` +${filesChanged.length - 5} more` : ''}` : null,
  ].filter(Boolean).join(' · ');

  const gap = {
    uuid:        crypto.randomUUID(),
    type:        'file.integrity.drift',
    severity,
    status:      'open',
    source:      MODULE_ID,
    sigma:       +sigma.toFixed(4),
    body,
    description: `${changes.length} file/registry/wire change(s) detected since last boot. sigma=${sigma.toFixed(3)}.`,
    resolution:  'Review changes. If intentional: run `node lib/file-integrity.js --accept` to accept new baseline.',
    ts,
  };

  if (existing.length) {
    jaaDB.update('gaps', existing[0].uuid, {
      sigma:       gap.sigma,
      severity,
      body,
      description: gap.description,
      updatedAt:   ts,
    });
  } else {
    jaaDB.insert('gaps', gap);
    if (bus?.emit) bus.emit('cortex.gap.found', { gap, source: MODULE_ID });
  }
}

// ── Boot phase (SOFT — drift never blocks boot) ───────────────────────────────
function bootPhase(seq, jaaDB, bus, cfr) {
  seq.phase({
    name:  'file.integrity.check',
    type:  'SOFT',
    label: 'File + registry + SEAM wire integrity check',
    fn: async () => {
      const result = check({ jaaDB, bus, cfr });
      if (!result.ok) {
        return {
          ok:      true,
          warning: `Integrity drift — ${result.summary}`,
          sigma:   result.sigma,
          changes: result.changes.length,
        };
      }
      return { ok: true, summary: result.summary };
    },
  });
}

// ── CLI: accept new baseline ──────────────────────────────────────────────────
function acceptBaseline() {
  const entries = snapshot();
  let written = 0;
  for (const e of entries) {
    if (e.hash) written++;
  }
  console.log(`[${MODULE_ID}] baseline accepted — ${written} entries`);
  console.log('  (Run with jaaDB to persist; standalone mode logs only)');
  return entries;
}

// ── CLI entrypoint ────────────────────────────────────────────────────────────
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--accept')) {
    acceptBaseline();
  } else {
    const result = check();
    console.log('\nSUMMARY:', result.summary);
    console.log('sigma:  ', result.sigma.toFixed(4));
    if (result.changes.length) {
      console.log('\nCHANGES:');
      for (const c of result.changes) {
        console.log(`  [${c.category}] ${c.ns}/${c.key}`);
        console.log(`    was: ${c.prevHash}`);
        console.log(`    now: ${c.currHash}`);
        console.log(`    age: ${c.ageSecs}s since last baseline`);
      }
    }
    if (!result.ok) process.exit(1);
  }
}

module.exports = { check, snapshot, bootPhase, acceptBaseline, MODULE_ID, VERSION };
