/**
 * foundation/constants.js
 * COMPARTMENT OS — System Constants
 * IMMUTABLE after v1.0.0 (COS-5)
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 */

'use strict';

const path = require('path');
const os   = require('os');

// ─── Version ──────────────────────────────────────────────────────────────────

const COS_VERSION = '1.0.0';
const SPEC_VERSION = '1.5.0';

// ─── Ports ────────────────────────────────────────────────────────────────────

const DEFAULT_API_PORT = 3748;
const DEFAULT_SSE_PORT = 3749;

// ─── Windows Paths ────────────────────────────────────────────────────────────
// All paths are computed at runtime. On non-Windows, fall back to ~/.compartment-os
// for development compatibility.

function getCosDataRoot() {
  // §SANDBOX 2026-09-25 — COMPARTMENT OS had no override at all, so every
  // test that created a compartment made a real folder under %APPDATA%.
  // COS_DATA_ROOT is the override; lib/test-sandbox.js sets it for tests.
  require('../../lib/test-sandbox.js').ensure();
  if (process.env.COS_DATA_ROOT) return path.resolve(process.env.COS_DATA_ROOT);
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, 'CompartmentOS');
  }
  // Dev fallback (Linux CI, Docker v2.x)
  return path.join(os.homedir(), '.compartment-os');
}

const COS_DATA_ROOT     = getCosDataRoot();
const COS_STATE_DIR     = path.join(COS_DATA_ROOT, '.cos');
const COS_STATE_FILE    = path.join(COS_STATE_DIR,  'state.json');
const COS_MAP_FILE      = path.join(COS_STATE_DIR,  'system-map.json');
const COS_CONFIG_FILE   = path.join(COS_DATA_ROOT,  'config.json');
const COS_LOG_DIR       = path.join(COS_STATE_DIR,  'logs');
const COS_SNAPSHOT_DIR  = path.join(COS_STATE_DIR,  'snapshots');
const COS_COMP_DIR      = path.join(COS_DATA_ROOT,  'compartments');

// §BUGFIX 2026-09-06: vault/crypto.js, vault/store.js, vault/audit-log.js,
// and vaultd/config.js have required COS_VAULT_DIR / COS_VAULT_STORE_FILE /
// COS_VAULT_KEY_FILE from this file since before this checkout — none of
// the three were ever defined here, only implied in comments. That's a
// require()-time crash in vaultd/config.js and a dead-on-arrival vault/
// subsystem (same failure class as the isKnownRuntimeId bugfix in
// runtime-enum.js). Paths follow the exact convention already used above
// (COS_LOG_DIR, COS_SNAPSHOT_DIR — a named subdir of COS_STATE_DIR).
const COS_VAULT_DIR        = path.join(COS_STATE_DIR, 'vault');
const COS_VAULT_STORE_FILE = path.join(COS_VAULT_DIR, 'store.json');
const COS_VAULT_KEY_FILE   = path.join(COS_VAULT_DIR, 'master.key');

// ─── Per-Compartment Paths ────────────────────────────────────────────────────

/**
 * @param {string} compartmentId UUID
 * @returns {{ root, manifest, nexDir, walDir }}
 */
function compartmentPaths(compartmentId) {
  const root = path.join(COS_COMP_DIR, compartmentId);
  return Object.freeze({
    root,
    manifest: path.join(root, '.cos-manifest.json'),
    nexDir:   path.join(root, '.nex'),
    walDir:   path.join(root, '.cos-wal'),
  });
}

// ─── Ring Buffer ──────────────────────────────────────────────────────────────

const DEFAULT_RING_CAP        = 1_000_000;   // per compartment
const DEFAULT_MASTER_RING_CAP = 10_000_000;  // host master kernel

// ─── State Store ─────────────────────────────────────────────────────────────

const STATE_WRITE_DELAY_MS = 50;   // debounce for atomic writes (ms)

// ─── CLI ──────────────────────────────────────────────────────────────────────

const CLI_NAME = 'cos';

// ─── .nex magic ───────────────────────────────────────────────────────────────

const NEX_MAGIC     = 'NEX-ENV';
const NEX_EXT       = '.nex';
const MANIFEST_FILE = '.cos-manifest.json';

// ─── Project UUID ─────────────────────────────────────────────────────────────

const PROJECT_UUID = 'cos-0001-0000-0000-000000000000';

module.exports = Object.freeze({
  // Version
  COS_VERSION,
  SPEC_VERSION,

  // Ports
  DEFAULT_API_PORT,
  DEFAULT_SSE_PORT,

  // Paths
  COS_DATA_ROOT,
  COS_STATE_DIR,
  COS_STATE_FILE,
  COS_MAP_FILE,
  COS_CONFIG_FILE,
  COS_LOG_DIR,
  COS_SNAPSHOT_DIR,
  COS_COMP_DIR,
  COS_VAULT_DIR,
  COS_VAULT_STORE_FILE,
  COS_VAULT_KEY_FILE,
  compartmentPaths,

  // Kernel
  DEFAULT_RING_CAP,
  DEFAULT_MASTER_RING_CAP,

  // State store
  STATE_WRITE_DELAY_MS,

  // CLI
  CLI_NAME,

  // .nex
  NEX_MAGIC,
  NEX_EXT,
  MANIFEST_FILE,

  // Project
  PROJECT_UUID,
});
