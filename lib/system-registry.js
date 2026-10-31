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
  // require(path.join(ROOT, 'lib', 'nexus', 'autopilot.js')) directly. That hung this
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
    // 0.60.330 MG17 — autopilot.js is the launcher now; the boot list is read from its body, archived at the handover (frozen there).
    // MG17b moves this onto the declarations (each system's compartment.json runtime.process), which COS's supervisor reads.
    const src = fs.readFileSync(path.join(ROOT, 'lib', 'nexus', 'autopilot.retired-0.60.330.js'), 'utf8');
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

// ════════════════════════════════════════════════════════════════════════════
// §0.60.128 DB13 + DB14 — the tunnel (docs/2026-10-17-system-drawbridge-phasemap.spec, addendum b)
// James, 2026-10-17: "each system is soveriegn and self contained. use the compartments to isolated each system, integrate
// the system-registry.js as the tunnel or drawbridge? then through that access the command line interface, and routes in the
// api and toasts, the heartbeat system for status of the system using routes?"
//
// build() above stays what it was: where each system runs. tunnel(name) adds what it offers and how to reach it — its
// declared routes (its own registry-components.js, the only file of a system read here: the registry IS its door), the
// command rows that reach those routes, its toasts — and heartbeat(name) asks the system itself, over its health route.
//   folderOf(name)                       → the system's folder ('ollama-bridge' → 'ollama'), or null
//   tunnel(name, { commands })           → { ok, name, runtime, folder, registry, routes, commands, toasts, compartment }
//   heartbeat(name, { timeoutMs, fetch }) → { name, status: up|degraded|down|unknown, ms, code?, why }
//   tunnels({ commands })                → every system's tunnel, the ones with no registry said
// commands are passed in (the one command table is idearium's file; the caller that owns it hands its rows over), so this
// module reaches up into no system for them. Toasts are read from a registry's `toasts` list when it declares one (DB15);
// none does yet, which is said, not hidden.
// ════════════════════════════════════════════════════════════════════════════
const HEARTBEAT_MS = 1500;
const SLOW_MS = 1000;

function folderOf(name) {
  const fs = require('fs');
  const n = String(name || '');
  const isDir = (f) => !!f && fs.existsSync(path.join(ROOT, f)) && fs.statSync(path.join(ROOT, f)).isDirectory();
  if (isDir(n)) return n;
  // 'ollama-bridge' lives in ollama/; 'intelligence-consumer' does not take intelligence/, which is another system's folder
  const short = n.split('-')[0];
  if (short !== n && isDir(short) && !list().some(s => s.name === short)) return short;
  return null;
}

function _registryOf(folder) {
  const fs = require('fs');
  const file = folder && path.join(ROOT, folder, 'registry-components.js');
  if (!file || !fs.existsSync(file)) return { file: null, decls: [], raw: null };
  try {
    const raw = require(file);
    const { normalizeDeclarations } = require('./component-registry.js');
    return { file: `${folder}/registry-components.js`, decls: normalizeDeclarations(raw), raw };
  } catch (e) { return { file: `${folder}/registry-components.js`, decls: [], raw: null, error: e.message }; }
}

const _routeRe = (p) => new RegExp('^' + String(p).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\?:[A-Za-z_]\w*/g, '[^/]+') + '/?$');

/** which command rows reach one of these routes: each row's request is built with placeholder arguments and matched */
function _commandsFor(routes, commands) {
  const res = routes.map(r => ({ r, re: _routeRe(r.path) }));
  const out = [];
  for (const row of commands || []) {
    if (!row || typeof row.req !== 'function') continue;
    let q; try { q = row.req({ args: ['x', 'x', 'x'], flags: {}, repo: { uuid: 'x', name: 'x' } }); } catch (_) { continue; }
    const p = q && String(q.path || '').split('?')[0];
    if (!p) continue;
    const hit = res.find(({ r, re }) => (!q.method || !r.method || String(q.method).toUpperCase() === String(r.method).toUpperCase()) && re.test(p));
    if (hit) out.push({ command: row.usage || row.key, key: row.key, route: `${hit.r.method} ${hit.r.path}` });
  }
  return out;
}

function tunnel(name, { commands = [] } = {}) {
  const runtime = get(name);
  const folder = folderOf(name);
  if (!runtime && !folder) return { ok: false, error: `no system named ${name} (the registry knows: ${list().map(s => s.name).join(', ')})` };
  const reg = _registryOf(folder);
  const routes = reg.decls.filter(d => d.route && d.route.path).map(d => ({ id: d.id, method: d.route.method || 'GET', path: d.route.path }));
  const toasts = (reg.raw && Array.isArray(reg.raw.toasts)) ? reg.raw.toasts : [];
  let compartment = null;
  try { const CB = require('./cos-bridge.js'); const all = (CB.listCompartments && CB.listCompartments()) || []; compartment = (Array.isArray(all) ? all : []).find(c => c && (c.name === name || c.name === folder)) || null; } catch (_) { compartment = null; }
  return {
    ok: true, name, folder,
    runtime: runtime || null,
    registry: reg.file ? { file: reg.file, routes: routes.length, ...(reg.error ? { error: reg.error } : {}) } : null,
    routes,
    commands: _commandsFor(routes, commands),
    toasts,
    compartment: compartment ? { name: compartment.name, root: compartment.fs && compartment.fs.root || compartment.root || null } : null,
    said: [
      ...(reg.file ? [] : [`${name} has no registry-components.js: its routes are not declared, so nothing reaches it through the tunnel (DB16)`]),
      ...(toasts.length ? [] : ['declares no toasts (DB15): the UI decides them in its own code today']),
      ...(compartment ? [] : ['runs in no COS compartment yet (DB11)']),
      ...(runtime ? [] : ['not in the runtime registry (autopilot, diagnostic, version.js): it has no port or health route']),
    ],
  };
}

/** heartbeat(name) — the system asked over its own health route: up, degraded (answered badly or slowly), down, or unknown */
async function heartbeat(name, { timeoutMs = HEARTBEAT_MS, fetch: f = globalThis.fetch } = {}) {
  const rec = get(name);
  const url = rec && (rec.healthUrl || (rec.port && rec.healthPath ? `http://127.0.0.1:${rec.port}${rec.healthPath}` : null));
  if (!url) return { name, status: 'unknown', ms: null, why: rec ? 'no health route in the registry' : 'not in the registry' };
  if (typeof f !== 'function') return { name, status: 'unknown', ms: null, url, why: 'no fetch in this runtime' };
  const t0 = Date.now();
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
  try {
    const r = await f(url, ctl ? { signal: ctl.signal } : {});
    const ms = Date.now() - t0;
    if (!r.ok) return { name, status: 'degraded', ms, code: r.status, url, why: `its health route answered ${r.status}` };
    return { name, status: ms > SLOW_MS ? 'degraded' : 'up', ms, code: r.status, url, why: ms > SLOW_MS ? `answered in ${ms} ms (slow over ${SLOW_MS})` : 'answered' };
  } catch (e) {
    const ms = Date.now() - t0;
    return { name, status: 'down', ms, url, why: e && e.name === 'AbortError' ? `no answer in ${timeoutMs} ms` : `not reachable: ${String(e && (e.cause && e.cause.code || e.message) || e)}` };
  } finally { if (timer) clearTimeout(timer); }
}

/** tunnels — every system's tunnel; and the negative space of the CLI: command rows that reach no route any registry declares */
function tunnels({ commands = [] } = {}) {
  const names = new Set(list().map(s => s.name));
  const all = [...names].sort().map(n => tunnel(n, { commands }));
  const reached = new Set(all.flatMap(t => t.commands.map(c => c.key)));
  const undeclared = (commands || []).filter(r => r && typeof r.req === 'function' && !reached.has(r.key)).map(r => r.key);
  return { systems: all, commands: { total: (commands || []).length, through_a_declared_route: reached.size, undeclared } };
}

/**
 * kernels() — 0.60.326 MG15a: autopilot's boot list as it is (every field: cmd, args, cwd, env, phase, critical, optional, onDemand,
 * healthUrl, maxOldSpaceMB, minRestartDelay, haltPctOverride), so lib/cli/compartments.js can write each system's whole process into its
 * own compartment.json (MG-002) and COS's supervisor reads only those (docs/2026-10-24-cos-manager-phasemap.spec MG15a).
 */
function kernels() { return _loadAutopilotKernels().map(k => JSON.parse(JSON.stringify(k))); }

module.exports = { build, get, list, folderOf, tunnel, heartbeat, tunnels, kernels };
