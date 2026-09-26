'use strict';
/**
 * lib/ledger-writer.js — Unified Ledger Write Surface
 * UUID: lib-ledger-writer-v1-0000-4000-0000-000000000001
 * Status: pre-release
 *
 * §2.1  Disk before behavior — every write is synchronous (appendFileSync)
 * §1.2  Nothing silently fails — every error logged to stderr with context
 * §5.1  UUID on every record
 * §1.1  Nothing pretends — write() always confirms what it wrote
 *
 * TYPES:
 *   event_log  — all events flowing through the system
 *   gaps       — gap lifecycle records (open → healing → resolved)
 *   failures   — error + stack + friction score at time of failure
 *   metrics    — { ts, system, sigma, slope, errorRate, latencyP95, friction }
 *
 * STRUCTURE:
 *   data/<system>/event_log.jsonl
 *   data/<system>/gaps.jsonl
 *   data/<system>/failures.jsonl
 *   data/<system>/metrics.jsonl
 *
 * All services call write(). Diagnostic service reads the same paths.
 * One reality. No parallel worlds.
 */

const fs   = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

// ── Config ────────────────────────────────────────────────────────────────────

const ROOT     = path.join(__dirname, '..');
// §SANDBOX 2026-09-25 — idearium's own event ledger (data/idearium/event_log.jsonl)
// is written here; a test process gets a temp NEXUS_DATA_ROOT first.
require('./test-sandbox.js').ensure();
const DATA_ROOT = process.env.NEXUS_DATA_ROOT || path.join(ROOT, 'data');

const VALID_TYPES = new Set(['event_log', 'gaps', 'failures', 'metrics']);

// ── Internal: dir cache ───────────────────────────────────────────────────────
// Dirs created once, then cached. mkdirSync with recursive is idempotent
// but we avoid the syscall on every write.
const _dirCache = new Set();

function _ensureDir(dir) {
  if (_dirCache.has(dir)) return;
  fs.mkdirSync(dir, { recursive: true });
  _dirCache.add(dir);
}

// ── Internal: file path ───────────────────────────────────────────────────────
function _filePath(system, type) {
  return path.join(DATA_ROOT, system, `${type}.jsonl`);
}

// ── write(system, type, record) ───────────────────────────────────────────────
// §2.1: appendFileSync — data on disk before function returns.
// Returns the written record with _ts and uuid stamped.
function write(system, type, record = {}) {
  if (!system || typeof system !== 'string') {
    process.stderr.write(`[ledger-writer] write() called with invalid system: ${JSON.stringify(system)}\n`);
    return null;
  }
  if (!VALID_TYPES.has(type)) {
    process.stderr.write(`[ledger-writer] unknown type '${type}' for system '${system}'\n`);
    return null;
  }

  const row = {
    uuid:   record.uuid || randomUUID(),
    ...record,
    system: system,
    _ts:    Date.now(),
  };

  const dir  = path.join(DATA_ROOT, system);
  const file = _filePath(system, type);

  try {
    _ensureDir(dir);
    // §2.1: synchronous write — guaranteed on disk before return
    fs.appendFileSync(file, JSON.stringify(row) + '\n', 'utf8');
    return row;
  } catch (err) {
    process.stderr.write(`[ledger-writer] WRITE FAILED system=${system} type=${type}: ${err.message}\n`);
    return null;
  }
}

// ── writeMetrics(system, stats) ───────────────────────────────────────────────
// Convenience wrapper for the metrics sample shape.
// stats = { sigma, slope, errorRate, latencyP95, friction, latencyMean? }
function writeMetrics(system, stats = {}) {
  return write(system, 'metrics', {
    ts:         Date.now(),
    system,
    sigma:      stats.sigma      ?? 0,
    slope:      stats.slope      ?? 0,
    errorRate:  stats.errorRate  ?? 0,
    latencyP95: stats.latencyP95 ?? stats.latencyMean ?? 0,
    latencyMean:stats.latencyMean ?? 0,
    friction:   stats.friction   ?? 0,
  });
}

// ── writeGap(system, gap) ─────────────────────────────────────────────────────
function writeGap(system, gap = {}) {
  return write(system, 'gaps', {
    type:      gap.type      || 'unknown',
    severity:  gap.severity  || 'medium',
    body:      gap.body      || '',
    status:    gap.status    || 'open',
    source:    gap.source    || system,
    sigma:     gap.sigma     || 0,
    causedBy:  gap.causedBy  || null,
    createdAt: Date.now(),
    ...gap,
  });
}

// ── writeFailure(system, err, context) ───────────────────────────────────────
function writeFailure(system, err, context = {}) {
  return write(system, 'failures', {
    error:    err?.message || String(err),
    stack:    err?.stack   || null,
    friction: context.friction || 0,
    sigma:    context.sigma    || 0,
    module:   context.module   || null,
    source:   context.source   || system,
    ts:       Date.now(),
    ...context,
  });
}

// ── readLatest(system, type, n) ───────────────────────────────────────────────
// Read last N lines from a ledger file. Returns parsed rows, skips corrupt lines.
// §1.2: corrupt lines logged to stderr, never throw.
function readLatest(system, type, n = 100) {
  const file = _filePath(system, type);
  try {
    if (!fs.existsSync(file)) return [];
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);
    return lines
      .slice(-n)
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  } catch (err) {
    process.stderr.write(`[ledger-writer] readLatest failed system=${system} type=${type}: ${err.message}\n`);
    return [];
  }
}

// ── filePath(system, type) — exposed for diagnostic service to use ─────────────
function filePath(system, type) {
  return _filePath(system, type);
}

// ── dataDir(system) ───────────────────────────────────────────────────────────
function dataDir(system) {
  return path.join(DATA_ROOT, system);
}

module.exports = { write, writeMetrics, writeGap, writeFailure, readLatest, filePath, dataDir, DATA_ROOT, VALID_TYPES };
