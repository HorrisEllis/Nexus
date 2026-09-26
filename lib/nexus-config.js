'use strict';
// ── lib/nexus-config.js — single read path for orchestrator.config.json ─────
// UUID: mod-nexus-config-v1-0000-4000-0000-000000000001
//
// Every module that previously read its own env var or hardcoded a constant
// (NEXUS_HEAL_DRY, NEXUS_FORGE_APPLY, RAID's hardcoded health-poll interval,
// etc.) should read from here instead. One file on disk, one shape in memory,
// hot-reloaded on change so a toggle takes effect without a restart.
//
// §1.3 No stubs — if the config file is missing/unparseable, this throws
// loudly on first read rather than silently falling back to defaults that
// mask the problem.

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'orchestrator', 'orchestrator.config.json');

let _cache = null;
let _mtime = 0;
const _listeners = new Set();

function _read() {
  const stat = fs.statSync(CONFIG_PATH); // throws if missing — intentional
  if (_cache && stat.mtimeMs === _mtime) return _cache;
  const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`[nexus-config] orchestrator.config.json is not valid JSON: ${e.message}`);
  }
  _cache = parsed;
  _mtime = stat.mtimeMs;
  for (const fn of _listeners) {
    try { fn(_cache); } catch (_) {}
  }
  return _cache;
}

/** Get the full config object (fresh if the file changed on disk). */
function get() {
  return _read();
}

/** Get a dotted-path value, e.g. get_('heal.mode', 'dry'). */
function getPath(dotted, fallback) {
  const cfg = _read();
  const parts = dotted.split('.');
  let cur = cfg;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object' || !(p in cur)) return fallback;
    cur = cur[p];
  }
  return cur;
}

/** Register a callback fired whenever the config file changes (poll-based, call get()/getPath() to trigger a check). */
function onChange(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

/** Optional: start a poll loop so onChange fires even if nothing else calls get(). */
function watch(intervalMs = 5000) {
  const t = setInterval(() => { try { _read(); } catch (_) {} }, intervalMs);
  if (t.unref) t.unref();
  return () => clearInterval(t);
}

module.exports = { get, getPath, onChange, watch, CONFIG_PATH };
