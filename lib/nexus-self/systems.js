'use strict';
/**
 * lib/nexus-self/systems.js — which files of the live tree belong to which system.
 * comp_id: nexus.lib.nexus-self.systems
 *
 * §0.39.261 — James: "i want a nexus repo in idearium, that immutable with nested
 * compartments per system so i can manage nexus from inside nexus."
 *
 * One entry per autopilot kernel (nexus/autopilot.js KERNELS) plus `core`, which
 * owns everything no kernel owns (lib/, siso/, warp/, jaa/, cos/, nexus/, cli/,
 * docs/, tests/, root files …). Every file of the tree has exactly ONE owner:
 * ownerOf() is the single definition, and the snapshot, the per-system repos and
 * the apply gate all go through it, so a path can never be claimed twice or by
 * nobody.
 *
 *   dirs     top-level directories the system owns (paths are Nexus-root-relative)
 *   loom     the tags loom's phasemap-map gives this system's phases
 *            (loom/scanners/phasemap-map.js SYSTEMS). `core` also takes every tag
 *            no kernel claims, including 'general'.
 *   health   the kernel's /health, for the COS "boot + probe" run option
 *   entry    the kernel's entry file (autopilot's args[0])
 *   specDirs where the system's own .spec files live
 */

const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

const SYSTEMS = [
  { name: 'orchestrator', dirs: ['orchestrator'], loom: ['orchestrator'],               entry: 'orchestrator/orchestrator.js',   port: 9000 },
  { name: 'cortex',       dirs: ['cortex'],       loom: ['cortex', 'chunk', 'replay', 'snapshot'], entry: 'cortex/boot.js',  port: 3748 },
  { name: 'guardian',     dirs: ['guardian'],     loom: ['guardian', 'agent'],          entry: 'guardian/server.js',            port: 7820 },
  { name: 'idearium',     dirs: ['idearium'],     loom: ['idearium'],                   entry: 'idearium/api/index.js',         port: 4800 },
  { name: 'architect',    dirs: ['architect'],    loom: ['architect'],                  entry: 'architect/service.js',          port: 3747 },
  { name: 'diagnostic',   dirs: ['diagnostic'],   loom: ['diagnostic'],                 entry: 'diagnostic/nexus-diagnostic.js', port: 7825 },
  { name: 'eravos',       dirs: ['eravos'],       loom: ['eravos'],                     entry: 'eravos/server.js',              port: 3751 },
  { name: 'intelligence', dirs: ['intelligence'], loom: ['intelligence', 'raid'],       entry: 'intelligence/server.js',        port: 3753 },
  { name: 'ollama-bridge',dirs: ['ollama'],       loom: ['ollama'],                           entry: 'ollama/server.js',              port: 3749 },
  { name: 'versionium',   dirs: ['versionium'],   loom: ['versionium'],                           entry: 'versionium/server.js',          port: 3754 },
  { name: 'copilot',      dirs: ['copilot'],      loom: ['copilot', 'gemini'],          entry: 'copilot/server.js',             port: 3750 },
  { name: 'loom',         dirs: ['loom'],         loom: ['loom'],                       entry: 'loom/server.js',                port: 3752 },
  { name: 'clear-glass',  dirs: ['clear-glass'],  loom: ['clear-glass'],                entry: null,                            port: 7704 },
  // core: dirs is computed — everything the kernels above do not own.
  { name: 'core',         dirs: null,             loom: ['emerge', 'bridge', 'tablet', 'general'], entry: null, port: null },
];

for (const s of SYSTEMS) {
  s.specDirs = s.dirs ? s.dirs.map(d => `${d}/spec`) : ['docs', 'architecture-spec'];
}

// Never part of the immutable base: installed packages, VCS state, and every
// runtime data store (ledgers, JAA tables, compartments, imported user repos).
// A `data` directory at ANY depth is runtime state by this tree's convention
// (lib/ledger-writer.js, loom/data, idearium/data, cortex/memory's data root).
const SKIP_DIRS = new Set(['node_modules', '.git', 'data', '.nex', '.nexus-ci-runs', '.cos-testenv', '_archive', 'unintegrated']);
const SKIP_PATHS = new Set(['idearium/repo/repos']);
const SKIP_FILE_RE = /\.(log|pid|lock)$|^\.DS_Store$|^Thumbs\.db$/i;

const _kernelDirs = new Map();
for (const s of SYSTEMS) for (const d of s.dirs || []) _kernelDirs.set(d, s.name);

/** ownerOf(relPath) -> system name. Paths use '/', relative to the Nexus root. */
function ownerOf(rel) {
  const top = String(rel).replace(/\\/g, '/').split('/')[0];
  return _kernelDirs.get(top) || 'core';
}

function get(name) { return SYSTEMS.find(s => s.name === name) || null; }
function names() { return SYSTEMS.map(s => s.name); }

/** skipped(relPath, isDir) — true when the path is never part of the base. */
function skipped(rel, isDir) {
  const norm = String(rel).replace(/\\/g, '/');
  const base = norm.split('/').pop();
  if (isDir) return SKIP_DIRS.has(base) || SKIP_PATHS.has(norm);
  return SKIP_FILE_RE.test(base);
}

/** loom tags -> owning system, with core taking everything unclaimed. */
function systemForLoomTag(tag) {
  const hit = SYSTEMS.find(s => s.name !== 'core' && s.loom.includes(tag));
  return hit ? hit.name : 'core';
}

module.exports = { ROOT, SYSTEMS, ownerOf, get, names, skipped, systemForLoomTag, SKIP_DIRS, SKIP_PATHS };
