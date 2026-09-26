'use strict';
/**
 * lib/system-registry.js — SYSTEM_REGISTRY_2026-09-06
 *
 * James: "need a system registry." Confirmed via direct search before
 * building: no such file existed anywhere in this tree. What DID exist:
 * three separate, partial, real sources that had never been reconciled —
 *   1. autopilot.js's ALL_KERNELS   — real boot supervision (phase, critical,
 *      optional, onDemand, the real healthUrl each kernel is actually
 *      polled on)
 *   2. diagnostic/nexus-diagnostic.js's SYSTEMS — real port/dataDir/healthPath/
 *      label, used for diagnostic's own polling and the §TENSION-05 edges
 *   3. lib/version.js's VERSION.modules — real per-system semver
 *
 * This module does NOT re-declare that data a fourth time (the exact
 * mistake this session already found in diagnostic's own _REGISTRY_PATHS
 * map, where a dead 'bridge' entry sat unnoticed for a full removal cycle
 * because nothing cross-checked it against a live source). It requires
 * the three real files directly and merges them — matching loom's own
 * proven read-only-aggregator pattern (loom/scanners/event-taxonomy-map.js,
 * loom/scanners/phasemap-map.js): zero write authority over any of the
 * three sources, real data in, a merged view out.
 *
 * Where the three sources disagree on a fact they all claim to know (e.g.
 * autopilot's healthUrl port vs diagnostic's port field for the same
 * system), that disagreement is reported as a real `driftWarnings` entry,
 * never silently resolved by picking one side — the same discipline this
 * session already applied to versionium's real split-brain (RF4) and to
 * cli/diagnose.js vs orchestrator.js's disagreement over whether bridge
 * was ever truly required.
 */
const path = require('path');

const ROOT = path.join(__dirname, '..');

function _loadAutopilotKernels() {
  // §FIX 2026-09-06 — the first version of this function did
  // require(path.join(ROOT, 'nexus', 'autopilot.js')) directly. That hung this
  // process indefinitely despite autopilot.js's own start() being
  // correctly guarded behind `require.main === module` (confirmed at
  // autopilot.js:133/1762) — something else at that file's top level
  // (most likely lib/resource-monitor.js, one of its real requires)
  // blocks on require, not just on start(). Real fix: read the source
  // text and extract only the real ALL_KERNELS array literal, the same
  // "read the source, don't execute the system" discipline loom's own
  // scanners already use (event-taxonomy-map.js, phasemap-map.js) —
  // never proven safe to assume of any other file in this tree either.
  try {
    const fs = require('fs');
    const src = fs.readFileSync(path.join(ROOT, 'nexus', 'autopilot.js'), 'utf8');
    const start = src.indexOf('const ALL_KERNELS = [');
    if (start === -1) throw new Error('ALL_KERNELS declaration not found');
    const arrStart = src.indexOf('[', start);
    let depth = 0, i = arrStart, end = -1;
    for (; i < src.length; i++) {
      if (src[i] === '[') depth++;
      else if (src[i] === ']') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end === -1) throw new Error('could not find matching close bracket for ALL_KERNELS');
    const arrayText = src.slice(arrStart, end + 1);

    // §FIX 2026-09-06 — the array literal itself references _ELECTRON_CMD,
    // a real value computed a few lines above it (checks two real, actual
    // filesystem paths — clear-glass's own hoisted vs local electron
    // binary — not a constant). Extracting the array in isolation without
    // this real preamble threw a real, honest ReferenceError rather than
    // silently guessing a value — correct to fail loud, but the actual
    // fix is including the same small real computation, not hardcoding
    // its result (which would silently go stale the next time npm
    // install's hoisting decision changes, exactly the failure mode
    // autopilot.js's own comment on this block already warns about).
    const preambleStart = src.indexOf('const _ELECTRON_BIN');
    const preambleEnd = src.indexOf('\n\nconst ALL_KERNELS');
    if (preambleStart === -1 || preambleEnd === -1) {
      throw new Error('ALL_KERNELS preamble (_ELECTRON_CMD etc.) not found at its expected location — this extraction is now stale against a real autopilot.js edit and needs re-checking, not silently skipped');
    }
    const preambleText = src.slice(preambleStart, preambleEnd);

    const kernels = new Function('require', 'ROOT', `
      const fs = require('fs');
      const path = require('path');
      ${preambleText}
      return ${arrayText};
    `)(require, ROOT);
    return Array.isArray(kernels) ? kernels : [];
  } catch (e) {
    console.error(`[system-registry] could not extract ALL_KERNELS from autopilot.js: ${e.message}`);
    return [];
  }
}

function _loadDiagnosticSystems() {
  // §FIX 2026-09-06 — same class of bug as _loadAutopilotKernels() above,
  // caught the same way (checked before running, not after a hang):
  // diagnostic/nexus-diagnostic.js calls server.listen() completely
  // unconditionally (confirmed directly, no require.main guard anywhere
  // in the file) — require()'ing it here would start a second real HTTP
  // server on diagnostic's own port as a side effect. Same safe fix:
  // extract only the real SYSTEMS object literal from source text.
  try {
    const fs = require('fs');
    const src = fs.readFileSync(path.join(ROOT, 'diagnostic/nexus-diagnostic.js'), 'utf8');
    const start = src.indexOf('const SYSTEMS = {');
    if (start === -1) throw new Error('SYSTEMS declaration not found');
    const objStart = src.indexOf('{', start);
    let depth = 0, i = objStart, end = -1;
    for (; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end === -1) throw new Error('could not find matching close brace for SYSTEMS');
    const objText = src.slice(objStart, end + 1);
    const systems = new Function(`return ${objText};`)();
    return systems && typeof systems === 'object' ? systems : {};
  } catch (e) {
    console.error(`[system-registry] could not extract SYSTEMS from nexus-diagnostic.js: ${e.message}`);
    return {};
  }
}

function _loadVersions() {
  // §FIX 2026-09-06 — James: "there is not 50 systems..." Real bug,
  // caught by him, not by any check this file had: VERSION.modules is
  // NOT a system registry — lib/version.js's own header says so
  // explicitly ("VERSION.modules[name] is the module's own semver").
  // It holds ~50 internal LIBRARY components (jaa-db, raid, self-heal,
  // seam, auth, grammar-engine, etc.) that live inside real systems,
  // not sovereign systems themselves. The real per-system version block
  // is under VERSION.services — confirmed directly (this is the same
  // block the 0.39.52 changelog itself refers to: "removed bridge's own
  // entry from this registry's services{} block entirely"). Reading the
  // wrong key inflated this registry's systemCount from the real ~14 to
  // 50+, silently treating internal modules as if each were its own
  // running system.
  try {
    const VERSION = require(path.join(ROOT, 'lib/version.js'));
    return VERSION.services || {};
  } catch (e) {
    console.error(`[system-registry] could not load lib/version.js: ${e.message}`);
    return {};
  }
}

function _portFromHealthUrl(healthUrl) {
  if (!healthUrl) return null;
  const m = String(healthUrl).match(/:(\d+)/);
  return m ? Number(m[1]) : null;
}

/**
 * build() — the real, live merge. Called fresh each time (no caching):
 * these three source files can change between calls, and a stale merged
 * snapshot would be exactly the kind of fourth-list-to-drift this module
 * exists to avoid.
 */
function build() {
  const kernels   = _loadAutopilotKernels();
  const diagSys   = _loadDiagnosticSystems();
  const versions  = _loadVersions();

  const byName = {};
  const driftWarnings = [];

  for (const k of kernels) {
    if (!k || !k.name) continue;
    byName[k.name] = {
      name: k.name,
      port: _portFromHealthUrl(k.healthUrl),
      healthUrl: k.healthUrl || null,
      phase: typeof k.phase === 'number' ? k.phase : null,
      critical: !!k.critical,
      optional: !!k.optional,
      onDemand: !!k.onDemand,
      dataDir: null,
      healthPath: null,
      label: null,
      version: null,
      sources: { autopilot: true, diagnostic: false, version: false },
    };
  }

  for (const [name, def] of Object.entries(diagSys)) {
    if (!byName[name]) {
      byName[name] = {
        name, port: def.port || null, healthUrl: null, phase: null,
        critical: false, optional: !!def.optional, onDemand: false,
        dataDir: def.dataDir || null, healthPath: def.healthPath || null,
        label: def.label || null, version: null,
        sources: { autopilot: false, diagnostic: true, version: false },
      };
      continue;
    }
    const rec = byName[name];
    rec.sources.diagnostic = true;
    rec.dataDir = def.dataDir || null;
    rec.healthPath = def.healthPath || null;
    rec.label = def.label || null;
    if (def.port && rec.port && def.port !== rec.port) {
      driftWarnings.push({
        system: name, field: 'port',
        autopilot: rec.port, diagnostic: def.port,
        note: 'autopilot\'s healthUrl port and diagnostic\'s SYSTEMS port disagree for the same system',
      });
    } else if (def.port && !rec.port) {
      rec.port = def.port;
    }
  }

  for (const [name, ver] of Object.entries(versions)) {
    if (!byName[name]) {
      byName[name] = {
        name, port: null, healthUrl: null, phase: null, critical: false,
        optional: false, onDemand: false, dataDir: null, healthPath: null,
        label: null, version: ver,
        sources: { autopilot: false, diagnostic: false, version: true },
      };
      continue;
    }
    byName[name].version = ver;
    byName[name].sources.version = true;
  }

  const systems = Object.values(byName).sort((a, b) => a.name.localeCompare(b.name));

  return {
    generatedAt: new Date().toISOString(),
    systemCount: systems.length,
    systems,
    driftWarnings,
    // Honest coverage note, not a silent gap — a system present in only
    // one of the three sources is real (e.g. clear-glass has no semver in
    // VERSION.modules, or a module-only entry has no autopilot kernel),
    // but worth being able to see at a glance.
    partialCoverage: systems
      .filter(s => !(s.sources.autopilot && s.sources.diagnostic && s.sources.version))
      .map(s => ({ name: s.name, sources: s.sources })),
  };
}

/** get(name) -> single system's merged real record, or null */
function get(name) {
  const { systems } = build();
  return systems.find(s => s.name === name) || null;
}

/** list() -> all merged real system records */
function list() {
  return build().systems;
}

module.exports = { build, get, list };
