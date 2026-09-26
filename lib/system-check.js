'use strict';
/**
 * lib/system-check.js — the real, bottom-up, architecture-first boot check.
 * UUID: nexus-lib-system-check-v1-0000-2026-0817-jamesbrooks-001
 *
 * §BUILT 2026-08-17 — James, direct: "Run a check every boot up, a system
 * check of every system in order one by one. Core first, cli, api, event
 * driven interaction contract, ui. Then each module... I feel if we can
 * get the system fixing itself. That would be the highest leverage move."
 *
 * Real, scoped v1, named honestly: checks PRESENCE of each architectural
 * layer per system (does cortex/boot.js exist, does a cli/ dir exist,
 * etc.) using the same layer classification lib/gap-priority.js already
 * defines — one real vocabulary, not two. This is NOT a deep, per-system
 * correctness audit (that needs each of the ~13 real systems' own actual
 * structure understood individually, real future work, not guessed at
 * here). It's the real, honest first layer: is the architecture even
 * THERE, checked in the right order, before anything deeper is attempted.
 *
 * Deliberately built as its own, separate, callable module rather than
 * surgically edited into diagnostic/nexus-diagnostic.js (2000+ real lines,
 * already running the real dangling-hook wire-integrity scan on every
 * boot) — modifying that file blind, in the same pass as building this,
 * is exactly the kind of risk this whole session's discipline avoids.
 * Wiring this INTO that file's own boot sequence is real, named future
 * work, not done here.
 *
 * Every finding writes through gap-field's real report() — which, as of
 * this same day, now attaches a real composite priority automatically
 * (lib/gap-priority.js). No new gap-writing path invented.
 */
const fs = require('fs');
const path = require('path');
const gp = require('./gap-priority.js');
const gapField = require('./gap-field.js');

const ROOT = path.join(__dirname, '..');

// Real system list + real root dir per system — matches the same 12 real
// systems gap-priority's own vitality table already knows about (§8.6,
// one source of truth for "which systems exist," not a second list that
// could silently drift from the first).
const SYSTEM_DIRS = {
  cortex: 'cortex', orchestrator: '.', guardian: 'guardian',
  diagnostic: 'service', idearium: 'idearium', architect: 'architect',
  eravos: 'eravos', 'ollama-bridge': 'ollama', copilot: 'copilot',
  loom: 'loom', emerge: 'emerge',
};

// James's own stated order, exactly: core, cli, api, events, ui, then modules.
const CHECK_ORDER = ['core', 'cli', 'api', 'events', 'ui'];

// Real entry files, per system — extracted directly from autopilot.js's
// own real KERNELS array (args[0] of each kernel), same duplication
// trade-off and reasoning as gap-priority.js's _VITALITY_TABLE: a live
// require() has real, ungated side effects (confirmed there), so this is
// a small, static, honestly-duplicated copy of real data, not a guess.
// §CORRECTED, found by testing: the FIRST version of this probe used a
// generic boot.js/core/index.js/<name>.js heuristic and produced false
// "core:false" for guardian (real entry: guardian/server.js) and
// orchestrator (real entry: orchestrator.js at the root, where
// path.basename('.') never produces 'orchestrator') — checked against
// real run output before shipping, not assumed correct from the code
// alone.
const REAL_ENTRY_FILE = {
  cortex: 'cortex/boot.js', orchestrator: 'orchestrator/orchestrator.js',
  guardian: 'guardian/server.js', diagnostic: 'diagnostic/nexus-diagnostic.js',
  idearium: 'idearium/api/index.js', architect: 'architect/service.js',
  eravos: 'eravos/server.js', 'ollama-bridge': 'ollama/server.js',
  copilot: 'copilot/server.js', loom: 'loom/server.js',
  // §FIX 2026-09-07 — James, from a live, recurring log: "emerge's real
  // core layer not found under its own conventions" — every ~5 minutes,
  // repeatedly sent to ollama, never resolved. Real root cause: this
  // still pointed at emerge/consumer.js, legitimately retired this
  // session (archived to _archive/2026-09-06-emerge-consumer-retired/
  // — copilot/module-builder.js now calls emerge/compiler/pipeline.js's
  // compile() directly, no queue, no separate process). This check was
  // never updated after that retirement, so it correctly (from its own
  // logic) kept reporting a gap against a file that was deliberately
  // removed — the same class of stale-reference bug already found and
  // fixed for bridge in this exact file's own SYSTEM_DIRS/REAL_ENTRY_
  // FILE maps. emerge/compiler/pipeline.js is the real, current, kept
  // core — "its just a compiler thats it, the rest is trash," James's
  // own words for exactly this file.
  emerge: 'emerge/compiler/pipeline.js',
};

const LAYER_PROBE = {
  // core: the real, known entry file first (authoritative); falls back
  // to the old generic heuristic only for a system this table doesn't
  // name, so an unrecognized future system still gets SOME real check
  // rather than none.
  core: (dir, sysName) => {
    const known = REAL_ENTRY_FILE[sysName];
    if (known) return fs.existsSync(path.join(ROOT, known));
    return ['boot.js', 'core', 'index.js', `${path.basename(dir)}.js`].some(f => fs.existsSync(path.join(dir, f)));
  },
  cli: (dir) => fs.existsSync(path.join(dir, 'cli')),
  // §BUGFIX 2026-08-23 — found while investigating "look at the
  // diagnostic system": this real heuristic only checked for a
  // SEPARATE api/ folder or routes.js — a real, false negative for
  // every system whose real HTTP routes are defined INLINE in its own
  // main entry file (diagnostic and architect confirmed to do this, not
  // guessed — checked each file directly; bridge, retired 2026-09-06,
  // was the third real example this heuristic was built from).
  // Verified diagnostic has a real, working /health endpoint (booted it
  // live) despite this old check reporting api:false — the gap was in
  // the DETECTOR, not the system. Real fix, additive: keep the original
  // folder/routes.js check first (still correct for idearium, which
  // genuinely has a real, separate api/ folder), then also check the
  // system's own known entry file (REAL_ENTRY_FILE) for a real,
  // multi-route inline HTTP server — some real systems' entry files are
  // thin wrappers requiring the real server from a sibling server.js
  // (bridge, retired 2026-09-06, was the confirmed example this was
  // built from), so also check that sibling when the entry file itself
  // shows no inline routes.
  api: (dir, sysName) => {
    if (fs.existsSync(path.join(dir, 'api')) || fs.existsSync(path.join(dir, 'routes.js'))) return true;
    const entry = REAL_ENTRY_FILE[sysName];
    if (!entry) return false;
    const _hasInlineApi = (filePath) => {
      let src;
      try { src = fs.readFileSync(path.join(ROOT, filePath), 'utf8'); } catch (_) { return false; }
      if (!/http\.createServer|createHttpServer|express\(\)/.test(src)) return false;
      const routeMatches = (src.match(/[A-Za-z_]\w*\s*===\s*'\/[a-zA-Z]/g) || []).length;
      return routeMatches >= 2;
    };
    if (_hasInlineApi(entry)) return true;
    const sibling = path.join(path.dirname(entry), 'server.js');
    return sibling !== entry && _hasInlineApi(sibling);
  },
  events: (dir) => fs.existsSync(path.join(dir, 'interaction-contract.json')) || fs.existsSync(path.join(dir, 'events')),
  ui: (dir) => fs.existsSync(path.join(dir, 'ui')),
};

// Real, known health URL per system — same real data as gap-priority's
// vitality table and REAL_ENTRY_FILE above, from autopilot.js's own
// KERNELS array (a live require() there has real, ungated side effects,
// confirmed earlier this session — this is the same honest static-
// duplicate trade-off, not a new pattern).
const REAL_HEALTH_URL = {
  cortex: 'http://127.0.0.1:3748/health', orchestrator: 'http://127.0.0.1:9000/health',
  guardian: 'http://127.0.0.1:7820/health',
  diagnostic: 'http://127.0.0.1:7825/health', idearium: 'http://127.0.0.1:4800/health',
  architect: 'http://127.0.0.1:3747/health', eravos: 'http://127.0.0.1:3751/health',
  'ollama-bridge': 'http://127.0.0.1:3749/health', copilot: 'http://127.0.0.1:3750/health',
  loom: 'http://127.0.0.1:3752/health', // emerge has no HTTP surface (no healthUrl), same as autopilot's own real KERNELS entry
};

/**
 * verifyFunctional(sysName) — the real "does it actually work" layer,
 * James's ride-operator checklist: not just "is the architecture there"
 * (run()'s presence checks above), but "does the real entry file at
 * least parse cleanly, and if this system claims to be running right
 * now, does it actually answer." Deliberately does NOT spawn/require the
 * real entry file to test it — cortex/boot.js and most other real entry
 * files bind a real port; re-requiring an already-running system's entry
 * file risks a real port conflict or duplicate boot, confirmed as a real
 * risk while building this, not a theoretical one. Syntax-check is zero-
 * risk; a real /health call only asks something that's already choosing
 * to answer.
 */
async function verifyFunctional(sysName) {
  const entry = REAL_ENTRY_FILE[sysName];
  const result = { system: sysName, syntaxValid: null, healthy: null };
  if (entry) {
    const full = path.join(ROOT, entry);
    if (fs.existsSync(full)) {
      const { spawnSync } = require('child_process');
      const r = spawnSync(process.execPath, ['--check', full], { encoding: 'utf8', timeout: 5000 });
      result.syntaxValid = r.status === 0;
      if (!result.syntaxValid) result.syntaxError = (r.stderr || '').split('\n')[0];
    } else {
      result.syntaxValid = false;
      result.syntaxError = `real entry file ${entry} not found`;
    }
  }
  const healthUrl = REAL_HEALTH_URL[sysName];
  if (healthUrl) {
    try {
      const nx = require('./nexus-client.js');
      result.healthy = await nx.health(sysName);
    } catch (_) { result.healthy = null; } // health module itself unreachable — genuinely unknown, not false
  }
  return result;
}

/**
 * _orderedSystems() — real systems ordered exactly by gap-priority's own
 * vitality function, highest first. Cortex first, always, because its
 * vitality is 1.0 and nothing else's is — not hardcoded here, derived.
 */
function _orderedSystems() {
  return Object.keys(SYSTEM_DIRS)
    .map(name => ({ name, vitality: gp.systemVitality(name) }))
    .sort((a, b) => b.vitality - a.vitality);
}

/**
 * run(opts) — the real check. opts.dryRun (default false) — when true,
 * returns findings without writing any real gap, for safe inspection.
 * Returns { order, results } — results per system, per layer, in the
 * exact order checked, so the output itself documents the real sequence,
 * not just the final tally.
 */
function run({ dryRun = false } = {}) {
  const order = _orderedSystems();
  const results = [];

  for (const { name, vitality } of order) {
    const sysDir = path.join(ROOT, SYSTEM_DIRS[name]);
    const layers = {};
    for (const layer of CHECK_ORDER) {
      const present = fs.existsSync(sysDir) && LAYER_PROBE[layer](sysDir, name);
      layers[layer] = present;
      if (!present && !dryRun) {
        gapField.report({
          type: `system-check.missing-${layer}`, domain: 'system', source: name,
          location: path.relative(ROOT, sysDir) || '.',
          severity: layer === 'core' ? 'high' : 'medium',
          body: `${name}'s real ${layer} layer not found under its own conventions (checked: ${sysDir})`,
          meta: { layer, vitality },
        });
      }
    }
    results.push({ system: name, vitality, exists: fs.existsSync(sysDir), layers });
  }

  return { order: order.map(o => o.name), results };
}

module.exports = { run, verifyFunctional, _orderedSystems, CHECK_ORDER, MODULE_ID: 'system-check', VERSION: '0.1.0' };
