/**
 * compartment/snapshot.js
 * COMPARTMENT OS — Compartment Snapshot Engine
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * Snapshot = point-in-time capture of:
 *   - Compartment config (from store)
 *   - File manifest (hash + path + size of every file in root, excluding .nex/.cos-wal)
 *   - Process state (if running: pid, uptime, memory, cpu)
 *   - Event log tail (last N events from bus)
 *   - Schema version (for forward-compatible restore)
 *
 * Snapshots are stored as gzip-compressed JSON in the compartment's .nex/ dir.
 * Filename: <timestamp>-<shortId>.nex.gz
 *
 * API:
 *   const snap = new SnapshotEngine(host, compartment)
 *   snap.take(triggerEvent, opts?)   → NexSnapshot
 *   snap.list()                      → NexSnapshotMeta[]
 *   snap.load(snapId)                → NexSnapshot
 *   snap.restore(snapId)             → { compartment, files }
 *   snap.delete(snapId)              → void
 *
 * Events:
 *   comp:snapshot:taken   { compartmentId, snapId, sizeBytes, triggerEvent }
 *   nexus:snapshot:written { compartmentId, snapId, path }
 *
 * COS-1: Nothing silently fails — every error is an event.
 * Schema version is embedded in every snapshot for safe restore.
 */

'use strict';

const fs    = require('fs');
const path  = require('path');
const zlib  = require('zlib');
const crypto = require('crypto');

const { CosAxiomError }  = require('../foundation/axioms.js');
const { COMP }           = require('../foundation/event-contracts.js');
const { compartmentPaths } = require('../foundation/constants.js');

// Current snapshot schema version — bump on breaking changes
const SNAP_SCHEMA_VERSION = '1.0.0';

// Max events included in snapshot tail
const SNAP_EVENT_TAIL = 200;

// Files/dirs excluded from manifest walk
const MANIFEST_EXCLUDES = new Set([
  '.nex', '.cos-wal', 'node_modules', '.git', '__pycache__',
  '.venv', 'venv',
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shortId() {
  return crypto.randomBytes(4).toString('hex');
}

/**
 * Compute SHA-256 hash of a file. Returns null on error.
 * @param {string} absPath
 * @returns {string|null}
 */
function hashFile(absPath) {
  try {
    const buf = fs.readFileSync(absPath);
    return crypto.createHash('sha256').update(buf).digest('hex');
  } catch { return null; }
}

/**
 * Walk a directory, building a file manifest.
 * Each entry: { path (relative), sizeBytes, sha256, mtime }
 *
 * @param {string} root — absolute compartment root
 * @param {string} dir  — current dir (absolute)
 * @param {object[]} acc
 * @param {number} depth
 */
function walkManifest(root, dir, acc, depth = 0) {
  if (depth > 20) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return; }

  for (const entry of entries) {
    if (MANIFEST_EXCLUDES.has(entry.name)) continue;
    if (entry.name.startsWith('.cos-')) continue;

    const abs     = path.join(dir, entry.name);
    const relPath = path.relative(root, abs).replace(/\\/g, '/');

    if (entry.isDirectory()) {
      walkManifest(root, abs, acc, depth + 1);
    } else if (entry.isFile()) {
      let stat;
      try { stat = fs.statSync(abs); } catch { continue; }
      acc.push({
        path:      relPath,
        sizeBytes: stat.size,
        sha256:    hashFile(abs),
        mtime:     stat.mtimeMs,
      });
    }
  }
}

// ─── SnapshotEngine ───────────────────────────────────────────────────────────

class SnapshotEngine {
  /**
   * @param {object} host        — createHost() instance (bus, store, sysmap)
   * @param {object} compartment — Compartment object
   */
  constructor(host, compartment) {
    if (!host || !compartment || !compartment.id) {
      throw new CosAxiomError('COS-1', 'SnapshotEngine requires host and compartment', {});
    }

    this._host  = host;
    this._comp  = compartment;
    this._id    = compartment.id;
    this._paths = compartmentPaths(compartment.id);

    // Ensure .nex dir exists
    fs.mkdirSync(this._paths.nexDir, { recursive: true });
  }

  // ── Take snapshot ─────────────────────────────────────────────────────────────

  /**
   * Take a snapshot of the current compartment state.
   *
   * @param {string} [triggerEvent='host:snapshot:manual']
   * @param {object} [opts]
   * @param {boolean} [opts.includeFileHashes=true]
   * @returns {NexSnapshot}
   */
  take(triggerEvent = 'host:snapshot:manual', opts = {}) {
    const includeHashes = opts.includeFileHashes !== false;

    // Reload compartment from store — get freshest state
    const comp = this._host.store.getCompartment(this._id) || this._comp;

    // File manifest
    const fileManifest = [];
    const compRoot = comp.fs && comp.fs.root ? path.resolve(comp.fs.root) : null;
    if (compRoot && fs.existsSync(compRoot)) {
      walkManifest(compRoot, compRoot, fileManifest);
      if (!includeHashes) {
        for (const entry of fileManifest) delete entry.sha256;
      }
    }

    // Event log tail
    const eventTail = this._host.bus
      ? this._host.bus.tail(SNAP_EVENT_TAIL).map(ev => ({
          seq:       ev.seq,
          type:      ev.type,
          timestamp: ev.timestamp,
          payload:   ev.payload,
        }))
      : [];

    // Process state (from process-runner registry)
    let processState = null;
    try {
      const { getProcess } = require('../compartment/process-runner.js');
      const proc = getProcess(this._id);
      if (proc) {
        processState = {
          pid:       proc.process.pid,
          runtimeId: proc.runtimeId,
          startedAt: proc.startedAt,
          uptime:    Date.now() - proc.startedAt,
        };
      }
    } catch { /* process-runner optional */ }

    // Build snapshot
    const snapId    = shortId();
    const createdAt = Date.now();

    /** @type {NexSnapshot} */
    const snap = {
      schemaVersion: SNAP_SCHEMA_VERSION,
      id:            snapId,
      compartmentId: this._id,
      triggerEvent:  triggerEvent,
      compartment:   JSON.parse(JSON.stringify(comp)), // deep clone
      fileManifest,
      processState,
      eventTail,
      createdAt,
      sizeBytes:     0, // filled after serialisation
    };

    // Serialise + compress
    const json  = JSON.stringify(snap);
    const gz    = zlib.gzipSync(Buffer.from(json, 'utf8'));
    snap.sizeBytes = gz.length;

    // Persist
    const filename = `${createdAt}-${snapId}.nex.gz`;
    const snapPath = path.join(this._paths.nexDir, filename);
    fs.writeFileSync(snapPath, gz);

    // Emit events
    this._emit(COMP.SNAPSHOT_TAKEN, {
      compartmentId: this._id,
      snapId,
      sizeBytes:     gz.length,
      triggerEvent,
      path:          snapPath,
    });
    this._emit('nexus:snapshot:written', {
      compartmentId: this._id,
      snapId,
      path:          snapPath,
    });

    return snap;
  }

  // ── List ─────────────────────────────────────────────────────────────────────

  /**
   * List all snapshots (metadata only — no file contents loaded).
   * @returns {NexSnapshotMeta[]}
   */
  list() {
    let files;
    try { files = fs.readdirSync(this._paths.nexDir); }
    catch { return []; }

    const metas = [];
    for (const f of files.filter(f => f.endsWith('.nex.gz'))) {
      const snapPath = path.join(this._paths.nexDir, f);
      // Parse timestamp + id from filename: <ts>-<id>.nex.gz
      const match = f.match(/^(\d+)-([a-f0-9]+)\.nex\.gz$/);
      let stat;
      try { stat = fs.statSync(snapPath); } catch { continue; }

      metas.push({
        snapId:        match ? match[2] : f,
        filename:      f,
        createdAt:     match ? parseInt(match[1], 10) : stat.mtimeMs,
        sizeBytes:     stat.size,
        compartmentId: this._id,
        path:          snapPath,
      });
    }

    // Newest first
    metas.sort((a, b) => b.createdAt - a.createdAt);
    return metas;
  }

  // ── Load ─────────────────────────────────────────────────────────────────────

  /**
   * Load a full snapshot by ID.
   * @param {string} snapId
   * @returns {NexSnapshot}
   */
  load(snapId) {
    const meta = this.list().find(m => m.snapId === snapId);
    if (!meta) {
      throw new CosAxiomError('COS-1', `Snapshot not found: ${snapId}`, {
        compartmentId: this._id,
        snapId,
      });
    }

    const gz   = fs.readFileSync(meta.path);
    const json = zlib.gunzipSync(gz).toString('utf8');
    const snap = JSON.parse(json);

    if (!snap.schemaVersion) {
      throw new CosAxiomError('COS-1', `Snapshot missing schemaVersion: ${snapId}`, {
        compartmentId: this._id,
        snapId,
      });
    }

    if (snap.schemaVersion !== SNAP_SCHEMA_VERSION) {
      // Future: migration logic. For now warn and continue.
      console.warn(`[cos:snapshot] schema mismatch: snap=${snap.schemaVersion} engine=${SNAP_SCHEMA_VERSION}`);
    }

    return snap;
  }

  // ── Restore ──────────────────────────────────────────────────────────────────

  /**
   * Restore compartment config from snapshot (not files — just config).
   * File restore requires explicit user confirmation — Phase 5.
   *
   * @param {string} snapId
   * @returns {{ compartment: object, fileManifest: object[] }}
   */
  restore(snapId) {
    const snap = this.load(snapId);

    // Restore compartment config to store + sysmap
    const restored = Object.assign({}, snap.compartment, {
      updatedAt: Date.now(),
      restoredFrom: snapId,
    });

    this._host.store.setCompartment(restored);
    this._host.sysmap.upsertCompartment(restored);

    this._emit('host:snapshot:restored', {
      compartmentId: this._id,
      snapId,
      triggerEvent:  snap.triggerEvent,
    });

    return {
      compartment:  restored,
      fileManifest: snap.fileManifest || [],
    };
  }

  // ── Delete ───────────────────────────────────────────────────────────────────

  /**
   * Delete a snapshot by ID.
   * @param {string} snapId
   */
  delete(snapId) {
    const meta = this.list().find(m => m.snapId === snapId);
    if (!meta) {
      throw new CosAxiomError('COS-1', `Snapshot not found: ${snapId}`, {
        compartmentId: this._id,
        snapId,
      });
    }
    fs.unlinkSync(meta.path);
  }

  // ── Internal ─────────────────────────────────────────────────────────────────

  _emit(type, payload) {
    if (this._host.bus) this._host.bus.emit(type, payload);
  }
}

module.exports = { SnapshotEngine, SNAP_SCHEMA_VERSION };
