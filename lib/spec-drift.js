'use strict';
/**
 * lib/spec-drift.js — NEXUS Spec Drift Detector
 * UUID: nexus-spec-drift-v1-0000-4000-0000-000000000001
 * Version: 1.0.0
 *
 * Compares the version declared in each system's .spec file against
 * the version declared in lib/version.js.
 *
 * If they diverge: a gap opens in Cortex.
 * The gap has type 'spec.version.drift', severity 'medium'.
 * It stays open until the spec is updated to match.
 * Friction accumulates if ignored across sessions.
 *
 * This enforces the rule: the spec grows with the project.
 * Spec drift is not a crash. It is a standing gap — visible,
 * trackable, and counted in the friction ledger.
 *
 * Run:
 *   const drift = require('./lib/spec-drift');
 *   const report = await drift.check();
 *   // report.drifted[] — systems where spec version ≠ code version
 *   // report.missing[] — systems with code version but no spec
 *   // report.synced[]  — systems where spec matches code
 *
 * Called as a SOFT boot phase on the orchestrator.
 * Also callable manually: node lib/spec-drift.js
 *
 * §1.2  Drift is never silent — it opens a gap and logs to event_log
 * §2.1  Gap written to JAA before anything else
 */

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const MODULE_ID = 'spec-drift';
const VERSION   = '1.0.0';
const DOCS_DIR  = path.join(__dirname, '..', 'docs');

// ── Extract version from a .spec file ────────────────────────────────────────
function _specVersion(specPath) {
  try {
    const content = fs.readFileSync(specPath, 'utf8');
    // Match: "    version:  3.6.0" or "    version: '3.6.0'"
    const m = content.match(/^\s+version:\s+['"]?([0-9]+\.[0-9]+\.[0-9][^\s'"#\n]*)['"]?/m);
    return m ? m[1].trim() : null;
  } catch(_) { return null; }
}

// ── Extract name from a .spec file ────────────────────────────────────────────
function _specName(specPath) {
  try {
    const content = fs.readFileSync(specPath, 'utf8');
    const m = content.match(/^\s+name:\s+['"]?([^\s'"#\n]+)['"]?/m);
    return m ? m[1].trim() : null;
  } catch(_) { return null; }
}

// ── Build spec map from docs/ directory ───────────────────────────────────────
function _loadSpecs() {
  const specs = {};
  try {
    const files = fs.readdirSync(DOCS_DIR).filter(f => f.endsWith('.spec'));
    for (const file of files) {
      const full    = path.join(DOCS_DIR, file);
      const name    = _specName(full);
      const version = _specVersion(full);
      if (name && version) {
        specs[name] = { version, file, path: full };
      }
    }
    // Also check system-local specs (cockpit/cockpit.spec, emerge/emerge.spec etc)
    const root = path.join(__dirname, '..');
    for (const dir of fs.readdirSync(root)) {
      if (['node_modules','.git','data','docs'].includes(dir)) continue;
      const localSpec = path.join(root, dir, dir + '.spec');
      if (fs.existsSync(localSpec)) {
        const name    = _specName(localSpec);
        const version = _specVersion(localSpec);
        if (name && version && !specs[name]) {
          specs[name] = { version, file: dir + '/' + dir + '.spec', path: localSpec };
        }
      }
    }
  } catch(e) {
    console.warn(`[${MODULE_ID}] failed to load specs: ${e.message}`);
  }
  return specs;
}

// ── Load code versions from lib/version.js ───────────────────────────────────
function _loadCodeVersions() {
  try {
    const V = require('./version');
    const versions = {};
    // Services
    for (const [k, v] of Object.entries(V.services || {})) {
      versions[k] = v;
    }
    // Meta modules
    for (const [k, v] of Object.entries(V.meta || {})) {
      if (k !== 'layer') versions[k] = v;
    }
    // Key lib modules
    for (const [k, v] of Object.entries(V.modules || {})) {
      versions[k] = v;
    }
    return versions;
  } catch(e) {
    console.warn(`[${MODULE_ID}] failed to load version.js: ${e.message}`);
    return {};
  }
}

// ── Main check ────────────────────────────────────────────────────────────────
function check(opts = {}) {
  const { jaaDB = null, bus = null } = opts;

  const specs        = _loadSpecs();
  const codeVersions = _loadCodeVersions();

  const synced  = [];
  const drifted = [];
  const missing = []; // has code version, no spec
  const untracked = []; // has spec, not in version.js (ok — docs-only specs)

  // Check all systems that have code versions
  for (const [system, codeVer] of Object.entries(codeVersions)) {
    // Find spec by system name (may differ slightly)
    const spec = specs[system]
      || specs[system.replace(/-/g, '_')]
      || specs[system.replace(/_/g, '-')];

    if (!spec) {
      missing.push({ system, codeVersion: codeVer });
      continue;
    }

    if (spec.version === codeVer) {
      synced.push({ system, version: codeVer, specFile: spec.file });
    } else {
      drifted.push({
        system,
        specVersion:  spec.version,
        codeVersion:  codeVer,
        specFile:     spec.file,
        gap:          `spec says ${spec.version}, code says ${codeVer}`,
      });
    }
  }

  // Log results
  const now = Date.now();
  console.log(`[${MODULE_ID}] spec drift check:`);
  console.log(`  synced:    ${synced.length}`);
  if (drifted.length)  console.log(`  DRIFTED:   ${drifted.length}`);
  if (missing.length)  console.log(`  no spec:   ${missing.length}`);

  for (const d of drifted) {
    console.warn(`  ⚠  ${d.system}: spec@${d.specVersion} ≠ code@${d.codeVersion}`);
  }
  for (const m of missing) {
    console.warn(`  ✗  ${m.system}: no spec (code@${m.codeVersion})`);
  }

  // Open gaps in JAA for drifted systems
  if (jaaDB) {
    for (const d of drifted) {
      _openDriftGap(jaaDB, bus, d, now);
    }
    for (const m of missing) {
      _openMissingGap(jaaDB, bus, m, now);
    }
    // Resolve gaps for synced systems
    for (const s of synced) {
      _resolveGap(jaaDB, bus, s);
    }
  }

  return {
    ok:        drifted.length === 0 && missing.length === 0,
    synced,
    drifted,
    missing,
    checkedAt: now,
    summary:   `${synced.length} synced, ${drifted.length} drifted, ${missing.length} unspecced`,
  };
}

// ── Gap management ────────────────────────────────────────────────────────────
function _openDriftGap(jaaDB, bus, d, now) {
  // Check if gap already open for this system
  const existing = jaaDB.query('gaps',
    r => r.type === 'spec.version.drift' && r.source === d.system && r.status === 'open',
    1
  );

  if (existing.length) {
    // Update body in case versions changed
    jaaDB.update('gaps', existing[0].uuid, {
      body: d.gap,
      updatedAt: now,
    });
    return;
  }

  // Open new gap — §2.1 disk first
  const uuid = crypto.randomUUID();
  const gap = {
    uuid,
    type:        'spec.version.drift',
    severity:    'medium',
    status:      'open',
    source:      d.system,
    path:        d.specFile,
    body:        d.gap,
    description: `${d.system} spec is at v${d.specVersion} but code is at v${d.codeVersion}. Update ${d.specFile} to match.`,
    resolution:  `Edit ${d.specFile} — set meta.version: ${d.codeVersion}. Then update modules[] if anything changed.`,
    ts:          now,
  };

  jaaDB.insert('gaps', gap);

  if (bus?.emit) bus.emit('cortex.gap.found', { gap, source: MODULE_ID });

  console.log(`  [${MODULE_ID}] gap opened: spec.version.drift — ${d.system}`);
}

function _openMissingGap(jaaDB, bus, m, now) {
  const existing = jaaDB.query('gaps',
    r => r.type === 'spec.missing' && r.source === m.system && r.status === 'open',
    1
  );
  if (existing.length) return;

  const uuid = crypto.randomUUID();
  const gap = {
    uuid,
    type:        'spec.missing',
    severity:    'low',
    status:      'open',
    source:      m.system,
    path:        `docs/${m.system}.spec`,
    body:        `${m.system} has code at v${m.codeVersion} but no spec file`,
    description: `Create docs/${m.system}.spec using the nexus-system-foundation template.`,
    resolution:  `Write docs/${m.system}.spec with meta.version: ${m.codeVersion}`,
    ts:          now,
  };

  jaaDB.insert('gaps', gap);
  if (bus?.emit) bus.emit('cortex.gap.found', { gap, source: MODULE_ID });
}

function _resolveGap(jaaDB, bus, s) {
  // Close any open drift gap for this system
  const existing = jaaDB.query('gaps',
    r => r.type === 'spec.version.drift' && r.source === s.system && r.status === 'open',
    1
  );
  if (!existing.length) return;

  jaaDB.update('gaps', existing[0].uuid, {
    status:     'resolved',
    resolution: `spec and code both at v${s.version}`,
    resolvedAt: Date.now(),
  });

  if (bus?.emit) bus.emit('cortex.gap.resolved', {
    uuid: existing[0].uuid, source: MODULE_ID, reason: 'spec_synced',
  });

  console.log(`  [${MODULE_ID}] gap resolved: ${s.system} spec synced at v${s.version}`);
}

// ── Boot phase ────────────────────────────────────────────────────────────────
function bootPhase(seq, jaaDB, bus) {
  seq.phase({
    name:  'spec.drift.check',
    type:  'SOFT',
    label: 'Spec drift check (spec versions vs code versions)',
    fn: async () => {
      const result = check({ jaaDB, bus });
      if (result.drifted.length || result.missing.length) {
        const issues = result.drifted.length + result.missing.length;
        return {
          ok:      true,  // SOFT — drift never blocks boot
          warning: `${issues} spec drift gap(s) opened — check cortex gaps`,
          summary: result.summary,
          drifted: result.drifted.map(d => `${d.system}: ${d.gap}`),
        };
      }
      return { ok: true, summary: result.summary };
    },
  });
}

// ── CLI entrypoint ────────────────────────────────────────────────────────────
if (require.main === module) {
  const result = check();
  console.log('\nSUMMARY:', result.summary);
  if (!result.ok) {
    console.log('\nDRIFTED:');
    for (const d of result.drifted) {
      console.log(`  ${d.system}`);
      console.log(`    spec:  ${d.specVersion}`);
      console.log(`    code:  ${d.codeVersion}`);
      console.log(`    fix:   update ${d.specFile} → version: ${d.codeVersion}`);
    }
    if (result.missing.length) {
      console.log('\nNO SPEC:');
      for (const m of result.missing) {
        console.log(`  ${m.system} (code@${m.codeVersion}) → create docs/${m.system}.spec`);
      }
    }
    process.exit(1);
  } else {
    console.log('All specs in sync.');
  }
}

module.exports = {
  check, bootPhase,
  MODULE_ID, VERSION,
};
