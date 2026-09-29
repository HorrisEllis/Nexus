'use strict';
/**
 * idearium/lib/config-core.cjs — the real schema and layering logic for
 * idearium.config, in ONE implementation, readable from both sides of
 * this repo's ESM/CJS split.
 *
 * §WHY THIS FILE EXISTS — idearium/ declares "type": "module", so
 * idearium/lib/config.js is ESM. lib/project-import.config.js is CJS and
 * cannot `import` it. The previous arrangement worked around that by
 * having the CJS side reach past the config module and read the raw JAA
 * row itself (`jaaDB.getById('idearium_config', ...)`), which was fine
 * while the config was a flat row of five keys with no defaults worth
 * speaking of. It stops being fine the moment the config has three
 * layers (defaults -> idearium.config.json -> persisted row) and nested
 * groups: a raw row read would see ONLY the runtime layer, so every
 * default and every value set in idearium.config.json would be invisible
 * to exactly the module that consumes the most of them. Two readers with
 * two different answers for the same key is the drift zip-ingest.js's own
 * header calls out as the thing to prevent.
 *
 * So: the schema and all the layering live here, in CJS (requirable by
 * lib/, importable by idearium/'s ESM via Node's CJS interop), with no
 * database dependency at all. This module is pure — it takes the
 * persisted row as an argument and returns values. Each caller supplies
 * the row through whichever store seam it already has:
 *   - idearium/lib/config.js (ESM)      -> idearium/lib/db.js
 *   - lib/project-import.config.js (CJS) -> cortex/memory/jaa-db
 * One schema, one merge, one set of validation rules, two entry points.
 *
 * .cjs extension is required, not stylistic: idearium/package.json's
 * "type": "module" would otherwise make Node parse this as ESM.
 */

const fs   = require('fs');
const path = require('path');

const TABLE    = 'idearium_config';
const ROW_UUID = 'idearium-config-singleton';

const CONFIG_FILE = process.env.IDEARIUM_CONFIG_FILE
  || path.join(__dirname, '..', 'idearium.config.json');

// ── schema ───────────────────────────────────────────────────────────────
// A leaf is any object carrying a `type`; anything else is a group, walked
// recursively — that is what makes this arbitrarily nestable rather than
// the previous one-level-of-'cicd' special case.
//
// Every default is the REAL value the code used before this file took
// ownership of it, read out of lib/project-import.config.js,
// idearium/config.js and spec-engine/index.js directly — not chosen
// fresh. The deliberate changes are marked §RAISED.
const SCHEMA = {
  chunking: {
    // §RAISED 2026-09-15 — James: "500 chunks is too low." Was default
    // 500 / max 5000. A real NEXUS-sized drop is tens of thousands of
    // files, so 500 was not a safety bound, it was a wall the normal
    // case hit. The bound is still real — an unbounded ingest builds an
    // unbounded manifest — it is just set where it protects something.
    chunk_cap:         { default: 20000, min: 1, max: 500000, copilot_writable: true, type: 'number' },
    // Per-CHUNK content bound. A longer file is truncated into its chunk
    // and says so; the real file on disk is untouched — see
    // import.real_files, which is the whole point of separating the two.
    max_chunk_bytes:   { default: 200 * 1024, min: 1024, max: 50 * 1024 * 1024, copilot_writable: true, type: 'number' },
    write_chunk_nodes: { default: true, copilot_writable: true, type: 'boolean' },
    chunk_nodes_dir:   { default: 'data/nodes/chunk', copilot_writable: false, type: 'string' },
  },

  import: {
    // §RAISED — was 20 MB for a whole import, smaller than one real
    // project's source tree once binaries are kept, so it was guaranteed
    // to start silently omitting files on exactly the imports this was
    // asked to fix.
    max_total_bytes:     { default: 512 * 1024 * 1024, min: 1024, max: 8 * 1024 * 1024 * 1024, copilot_writable: true, type: 'number' },
    max_real_file_bytes: { default: 50 * 1024 * 1024, min: 1024, max: 2 * 1024 * 1024 * 1024, copilot_writable: true, type: 'number' },
    // James: "it needs to import the real files from the uploaded
    // project to the repo, not just the chunks."
    real_files:     { default: true, copilot_writable: true, type: 'boolean' },
    include_binary: { default: true, copilot_writable: true, type: 'boolean' },
    skip_dirs:      { default: ['node_modules', '.git', '.svn', 'dist', 'build', '__pycache__', '.next'], copilot_writable: true, type: 'array' },
    // Which extensions become CHUNKS — no longer a filter on which files
    // are IMPORTED. That distinction is the fix: a .png is imported as a
    // real file and simply never chunked.
    text_ext:       { default: ['.js', '.ts', '.jsx', '.tsx', '.json', '.md', '.txt', '.py', '.html', '.css', '.yml', '.yaml', '.spec', '.sh'], copilot_writable: true, type: 'array' },
    verify_hashes:  { default: true, copilot_writable: true, type: 'boolean' },
  },

  repo: {
    storage_dir:      { default: 'idearium/repo/repos', copilot_writable: false, type: 'string' },
    git_enabled:      { default: true,  copilot_writable: true,  type: 'boolean' },
    git_binary:       { default: 'git', copilot_writable: false, type: 'string' },
    git_branch:       { default: 'main', copilot_writable: true, type: 'string' },
    git_author_name:  { default: 'NEXUS Idearium', copilot_writable: true, type: 'string' },
    git_author_email: { default: 'idearium@nexus.local', copilot_writable: true, type: 'string' },
  },

  // §MIGRATED 2026-09-15 — James: "make sure that idearium is using
  // compartmentos" / "migrate to cos". use_cos routes the import flow's
  // compartment through the real COS host (lib/cos-bridge.js). The flag
  // is real, not decorative: false genuinely runs the prior
  // compartment-engine-only path, which is what makes this a migration
  // with a way back rather than a rewrite that cannot be compared
  // against the thing it replaced.
  compartment: {
    use_cos:          { default: true,  copilot_writable: false, type: 'boolean' },
    runtime_id:       { default: 'node', copilot_writable: true, type: 'string' },
    network_isolated: { default: true,  copilot_writable: true, type: 'boolean' },
    wipe_on_cancel:   { default: true,  copilot_writable: true, type: 'boolean' },
    time_budget_ms:   { default: 30 * 60 * 1000, min: 1000, max: 24 * 60 * 60 * 1000, copilot_writable: true, type: 'number' },
    token_budget:     { default: 0, min: 0, max: 100000000, copilot_writable: true, type: 'number' },
    stale_after_ms:   { default: 20 * 60 * 1000, min: 1000, max: 24 * 60 * 60 * 1000, copilot_writable: true, type: 'number' },
    irreversible_ops: { default: false, copilot_writable: false, type: 'boolean' },
  },

  // §CONSOLIDATED — these were the whole of idearium/config.js, which now
  // reads them from here so there is one config, not two. port/binding
  // are read once at listen() time; changing them at runtime records the
  // intent but does not move a live socket — stated plainly rather than
  // implied by silence.
  api: {
    port:               { default: 4800, min: 1, max: 65535, copilot_writable: false, type: 'number' },
    binding:            { default: '127.0.0.1', copilot_writable: false, type: 'string' },
    chunk_events_limit: { default: 200, min: 1, max: 100000, copilot_writable: true, type: 'number' },
    cors_origin:        { default: '*', copilot_writable: false, type: 'string' },
  },

  pipeline: {
    zoom_levels:   { default: 4, min: 1, max: 12, copilot_writable: true, type: 'number' },
    snapshot_mode: { default: 'delta', enum: ['full', 'delta'], copilot_writable: true, type: 'string' },
    auto_phasemap: { default: true, copilot_writable: true, type: 'boolean' },
    build_poll_ms: { default: 15000, min: 1000, max: 600000, copilot_writable: true, type: 'number' },
    max_attempts:  { default: 3, min: 1, max: 20, copilot_writable: true, type: 'number' },
  },

  // §MCO-C 2026-09-20 — the hook from repo import/indexing to the file layer
  // (versionium/spec/versionium.file-versioning.spec). A repo's FIRST index
  // takes one baseline snapshot with its files, so every materialized file has
  // a full copy in versionium from the start. Off = repos get snapshots only
  // when asked.
  snapshots: {
    import_baseline: { default: true, copilot_writable: true, type: 'boolean' },
  },

  // §0.39.279 — James: "each new repo, if applicable could create a branch of the original, to save resources …
  // open it like a desktop environment". How a code repo is made (a branch of the original — cos/workspace — or a
  // separate copy), and what a repo's desktop VM gets (cos/workspace startDesktop). The settings console edits these.
  repos: {
    code_repo_mode: { default: 'branch', enum: ['branch', 'copy'], copilot_writable: true, type: 'string' },
    // §0.39.280 BS3 — "baseline deviation needs to recaclute each version or major file change": a file change is
    // major (and recalculates) at this many files, or this fraction of the tree, moved since the last recalculation
    deviation_major_files:    { default: 10, min: 1, max: 100000, copilot_writable: true, type: 'number' },
    deviation_major_fraction: { default: 0.1, min: 0.001, max: 1, copilot_writable: true, type: 'number' },
    // §0.39.282 — James, live: "was supposed to be ollama, set in the settings." A repo with no provider of its own
    // (a new one, or never set) fell to a hard-coded chatgpt in lib/repo-agent.js defaultProvider(). This is who answers
    // for such a repo: ollama · auto (copilot decides) · a guardian agent name. Empty = the old behaviour (guardian's first
    // provider). Checked against the live provider list when read, not a fixed list here.
    // §0.39.282 — James: "Ollama should be default I feel like." A repo with no provider of its own goes to ollama.
    default_provider: { default: 'ollama', copilot_writable: false, type: 'string' },
  },
  desktop: {
    ram_mb:  { default: 4096, min: 512, max: 65536, copilot_writable: true, type: 'number' },
    cpus:    { default: 2, min: 1, max: 32, copilot_writable: true, type: 'number' },
    network: { default: 'nat', enum: ['nat', 'none'], copilot_writable: true, type: 'string' },
    // §0.39.282 N20 — James: "the desktop environment needs to either ask, or give me the login. or use a generic password
    // listed in the atlas." The VM's desktop account: set when the image is made (provision --with desktop), re-applied
    // through the guest agent every time a desktop boots (so images made before this get it too), shown in the viewer.
    // A local, throwaway VM login — generic by design (idearium/docs atlas lists it); change it here.
    user:     { default: 'nexus', copilot_writable: false, type: 'string' },
    password: { default: 'nexus', copilot_writable: false, type: 'string' },
  },

  cicd: {
    push_enabled: { default: false, copilot_writable: true,  type: 'boolean' },
    pull_enabled: { default: false, copilot_writable: true,  type: 'boolean' },
    ssh_key_path: { default: null,  copilot_writable: false, type: 'string|null' },
  },
};

// ── back-compat aliases ──────────────────────────────────────────────────
// The first version of this config had chunk_cap, zoom_levels,
// snapshot_mode and auto_phasemap at the top level, and real callers
// already exist for those exact paths (spec-engine/index.js's
// getValue('chunk_cap'), the API's config route, the persisted row
// itself). Moving them into groups without this map would break every one
// of those silently — the caller gets undefined, not an error. Old paths
// keep resolving, and any value already persisted under an old path is
// folded forward on load.
const ALIASES = Object.freeze({
  chunk_cap:     'chunking.chunk_cap',
  zoom_levels:   'pipeline.zoom_levels',
  snapshot_mode: 'pipeline.snapshot_mode',
  auto_phasemap: 'pipeline.auto_phasemap',
});

function isLeaf(node) { return !!(node && typeof node === 'object' && typeof node.type === 'string'); }

function defaults(schema = SCHEMA) {
  const out = {};
  for (const [k, v] of Object.entries(schema)) {
    out[k] = isLeaf(v) ? (Array.isArray(v.default) ? v.default.slice() : v.default) : defaults(v);
  }
  return out;
}

/** Deep additive merge — a key absent from `over` keeps `base`'s value. */
function merge(base, over) {
  if (!over || typeof over !== 'object' || Array.isArray(over)) return base;
  const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
  for (const [k, v] of Object.entries(over)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base && typeof base[k] === 'object' && !Array.isArray(base[k])) {
      out[k] = merge(base[k], v);
    } else out[k] = v;
  }
  return out;
}

/** Rewrites any legacy top-level alias key into its real nested path. */
function foldAliases(values) {
  if (!values || typeof values !== 'object') return {};
  const out = Object.assign({}, values);
  for (const [oldKey, newPath] of Object.entries(ALIASES)) {
    if (!(oldKey in out)) continue;
    const parts = newPath.split('.');
    let node = out;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!node[parts[i]] || typeof node[parts[i]] !== 'object') node[parts[i]] = {};
      node = node[parts[i]];
    }
    // An explicitly-set value at the NEW path always wins — folding a
    // legacy key must never clobber a current one.
    if (node[parts[parts.length - 1]] === undefined) node[parts[parts.length - 1]] = out[oldKey];
    delete out[oldKey];
  }
  return out;
}

/**
 * fileLayer() — idearium.config.json, re-read on every call so a file
 * edit takes effect with no restart. A parse failure is loud and skipped
 * for that load: a typo in a config file must not take idearium down,
 * and must not silently look like "no overrides were set".
 */
let _lastFileError = null;
function fileLayer() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) { _lastFileError = null; return {}; }
    const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    _lastFileError = null;
    const rest = Object.assign({}, parsed);
    delete rest.$comment; delete rest.$schema;  // documentation, not config
    return foldAliases(rest);
  } catch (e) {
    if (_lastFileError !== e.message) {
      console.error(`[idearium/config] §1.2 ${CONFIG_FILE} is unreadable and is being IGNORED for this load: ${e.message}`);
      _lastFileError = e.message;
    }
    return {};
  }
}

function fileError() { return _lastFileError; }

/** resolve(keyPath) -> { parts, def, real }. Throws on unknown or group. */
function resolve(keyPath) {
  const real = ALIASES[keyPath] || String(keyPath);
  const parts = real.split('.');
  let node = SCHEMA;
  for (const p of parts) {
    node = node && node[p];
    if (!node) throw new Error(`idearium/lib/config: unknown config key '${keyPath}'`);
  }
  if (!isLeaf(node)) {
    throw new Error(`idearium/lib/config: '${keyPath}' is a config group, not a settable value — set one of: ${Object.keys(node).join(', ')}`);
  }
  return { parts, def: node, real };
}

function getAt(values, parts) {
  let v = values;
  for (const p of parts) v = v == null ? undefined : v[p];
  return v;
}

function setAt(values, parts, val) {
  let node = values;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!node[parts[i]] || typeof node[parts[i]] !== 'object') node[parts[i]] = {};
    node = node[parts[i]];
  }
  node[parts[parts.length - 1]] = val;
}

function deleteAt(values, parts) {
  let node = values;
  for (let i = 0; i < parts.length - 1; i++) {
    node = node && node[parts[i]];
    if (!node) return;
  }
  delete node[parts[parts.length - 1]];
}

/**
 * resolveValues(persistedRowValues) -> the merged, effective config.
 * The one place the three layers are combined, called by both entry
 * points so neither can answer differently for the same key.
 */
function resolveValues(persistedRowValues) {
  return merge(merge(defaults(), fileLayer()), foldAliases(persistedRowValues));
}

/**
 * validate(keyPath, value, actor) -> the coerced value, or throws.
 * §1.2 loud, not silent: an out-of-range value throws instead of being
 * quietly clamped to the bound.
 */
function validate(keyPath, value, actor = 'user') {
  const { def } = resolve(keyPath);
  if (actor !== 'user' && !def.copilot_writable) {
    throw new Error(`idearium/lib/config: '${keyPath}' is not copilot_writable — human write required`);
  }
  if (def.type === 'number') {
    const n = Number(value);
    if (!Number.isFinite(n)) throw new Error(`idearium/lib/config: '${keyPath}' must be a number`);
    if (def.min != null && n < def.min) throw new Error(`idearium/lib/config: '${keyPath}' must be >= ${def.min}`);
    if (def.max != null && n > def.max) throw new Error(`idearium/lib/config: '${keyPath}' must be <= ${def.max}`);
    return n;
  }
  if (def.enum && !def.enum.includes(value)) {
    throw new Error(`idearium/lib/config: '${keyPath}' must be one of ${def.enum.join(', ')}`);
  }
  if (def.type === 'boolean') return !!value;
  if (def.type === 'array') {
    if (!Array.isArray(value)) throw new Error(`idearium/lib/config: '${keyPath}' must be an array`);
    return value.slice();
  }
  if (def.type === 'string' && typeof value !== 'string') {
    throw new Error(`idearium/lib/config: '${keyPath}' must be a string`);
  }
  return value;
}

module.exports = {
  TABLE, ROW_UUID, CONFIG_FILE, SCHEMA, ALIASES,
  isLeaf, defaults, merge, foldAliases, fileLayer, fileError,
  resolve, getAt, setAt, deleteAt, resolveValues, validate,
};
