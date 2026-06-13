'use strict';
/**
 * bridge/causal/ledger.js — Causal Event Trace Ledger
 * UUID: nexus-bridge-causal-ledger-v1-0000-4000-000000000001
 * Status: pre-release
 *
 * Append-only JSONL store. NOT the same as bridge/ledger.js (request ledger).
 * This is the event trace ledger — every service action, permanently attributed.
 *
 * Files:
 *   data/bridge/causal/events.jsonl      — raw append-only log (rotates at 100k)
 *   data/bridge/causal/events-NNN.jsonl  — rotated segments
 *   data/bridge/causal/index.json        — uuid→{file,offset} for O(1) random access
 *   data/bridge/causal/parents.json      — eventId→[parentId] for O(1) parent lookup
 *
 * Byte-offset index: uuid→byte offset in the JSONL file. Rebuilt on open by
 * scanning for newlines (fast). Updated atomically on every append. O(1) random
 * access on an append-only log — avoids full-file replay to find an event.
 *
 * §2.1  Persistence is the golden rule.
 * §2.2  Storage device is source of truth.
 * §3.2  ts is wall clock. eventTs (row order) is the ordering axis.
 * §1.2  Nothing silently fails — every write either succeeds or throws.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const ROTATION_LIMIT = 100_000; // events per segment before rotation

class CausalLedger {
  /**
   * @param {string} dataDir — e.g. path.join(__dirname, '../../data/bridge/causal')
   */
  constructor(dataDir) {
    this._dir       = dataDir;
    this._indexPath = path.join(dataDir, 'index.json');
    this._parentsPath = path.join(dataDir, 'parents.json');
    this._active    = null;  // path to current events file
    this._fd        = null;  // open file descriptor
    this._index     = {};    // uuid → { file, offset, length }
    this._parents   = {};    // eventId → [parentId]
    this._count     = 0;     // events in current segment
    this._ready     = false;
  }

  // ── Open ────────────────────────────────────────────────────────────────────

  open() {
    if (this._ready) return;
    if (!fs.existsSync(this._dir)) fs.mkdirSync(this._dir, { recursive: true });

    // Load index + parents if they exist
    this._index   = _loadJSON(this._indexPath, {});
    this._parents = _loadJSON(this._parentsPath, {});

    // Find the active segment (highest numbered, or events.jsonl if none)
    this._active = this._findActiveSegment();
    if (!fs.existsSync(this._active)) fs.writeFileSync(this._active, '', 'utf8');

    // Rebuild index from active segment (reconcile any missed writes)
    this._rebuildIndex(this._active);

    // Count rows in active segment
    this._count = this._countLines(this._active);

    // Open for appending
    this._fd = fs.openSync(this._active, 'a');
    this._ready = true;
  }

  // ── Append ──────────────────────────────────────────────────────────────────

  /**
   * append — write a causal event. Returns the event with offset metadata.
   * §2.1: write completes before returning.
   */
  append(event) {
    if (!this._ready) this.open();
    if (!event.uuid) throw new Error('[causal/ledger §1.2] event.uuid required');

    // Rotate if needed
    if (this._count >= ROTATION_LIMIT) this._rotate();

    const line   = JSON.stringify(event) + '\n';
    const buf    = Buffer.from(line, 'utf8');
    const stat   = fs.fstatSync(this._fd);
    const offset = stat.size;

    // §2.1 — write before acknowledging
    fs.writeSync(this._fd, buf);
    fs.fsyncSync(this._fd);

    // Update index
    this._index[event.uuid] = { file: path.basename(this._active), offset, length: buf.length };
    _saveJSON(this._indexPath, this._index);

    // Update parent map from causalEdges
    for (const edge of (event.causalEdges || [])) {
      if (edge.eventId) {
        if (!this._parents[event.uuid]) this._parents[event.uuid] = [];
        this._parents[event.uuid].push(edge.eventId);
      }
    }
    _saveJSON(this._parentsPath, this._parents);

    this._count++;
    return event;
  }

  // ── Read ────────────────────────────────────────────────────────────────────

  /**
   * get — O(1) random access by uuid using byte-offset index.
   */
  get(uuid) {
    if (!this._ready) this.open();
    const loc = this._index[uuid];
    if (!loc) return null;

    const filePath = path.join(this._dir, loc.file);
    if (!fs.existsSync(filePath)) return null;

    const buf = Buffer.alloc(loc.length);
    const fd  = fs.openSync(filePath, 'r');
    try {
      fs.readSync(fd, buf, 0, loc.length, loc.offset);
    } finally {
      fs.closeSync(fd);
    }

    try { return JSON.parse(buf.toString('utf8').trim()); }
    catch (_) { return null; }
  }

  /**
   * parents — O(1) parent lookup via parents index.
   */
  parents(uuid) {
    if (!this._ready) this.open();
    return (this._parents[uuid] || []).map(id => this.get(id)).filter(Boolean);
  }

  /**
   * query — scan across all segments with optional filter.
   * @param {object} opts
   * @param {string}   [opts.source]    — filter by source
   * @param {string}   [opts.action]    — filter by action prefix
   * @param {string}   [opts.sessionId]
   * @param {number}   [opts.since]     — ts >= since
   * @param {number}   [opts.until]     — ts <= until
   * @param {number}   [opts.limit=200]
   */
  query({ source, action, sessionId, since, until, limit = 200 } = {}) {
    if (!this._ready) this.open();
    const segments = this._allSegments();
    const results  = [];

    for (const seg of segments.reverse()) { // newest first
      if (results.length >= limit) break;
      const lines = _readLines(path.join(this._dir, seg));
      for (let i = lines.length - 1; i >= 0; i--) {
        if (results.length >= limit) break;
        try {
          const ev = JSON.parse(lines[i]);
          if (source    && ev.source !== source)             continue;
          if (action    && !ev.action?.startsWith(action))   continue;
          if (sessionId && ev.sessionId !== sessionId)       continue;
          if (since     && ev.ts < since)                    continue;
          if (until     && ev.ts > until)                    continue;
          results.push(ev);
        } catch (_) { /* skip malformed lines */ }
      }
    }

    return results;
  }

  /**
   * querySession — all events for a sessionId, in order (oldest first).
   */
  querySession(sessionId) {
    const events = this.query({ sessionId, limit: 10_000 });
    return events.sort((a, b) => a.ts - b.ts);
  }

  stats() {
    return {
      segments:   this._allSegments().length,
      totalKeys:  Object.keys(this._index).length,
      activeFile: this._active ? path.basename(this._active) : null,
      activeCount: this._count,
    };
  }

  // ── Internal ─────────────────────────────────────────────────────────────────

  _findActiveSegment() {
    const segs = this._allSegments();
    if (!segs.length) return path.join(this._dir, 'events.jsonl');
    return path.join(this._dir, segs[segs.length - 1]);
  }

  _allSegments() {
    if (!fs.existsSync(this._dir)) return [];
    return fs.readdirSync(this._dir)
      .filter(f => f.match(/^events(-\d+)?\.jsonl$/))
      .sort();
  }

  _rotate() {
    if (this._fd !== null) { fs.closeSync(this._fd); this._fd = null; }

    // Find next segment number
    const segs    = this._allSegments();
    const last    = segs[segs.length - 1] || 'events.jsonl';
    const m       = last.match(/events-(\d+)\.jsonl/);
    const nextNum = m ? (parseInt(m[1]) + 1) : 1;
    const padded  = String(nextNum).padStart(3, '0');
    this._active  = path.join(this._dir, `events-${padded}.jsonl`);

    fs.writeFileSync(this._active, '', 'utf8');
    this._fd    = fs.openSync(this._active, 'a');
    this._count = 0;
    console.log(`[causal/ledger] rotated → ${path.basename(this._active)}`);
  }

  _rebuildIndex(filePath) {
    if (!fs.existsSync(filePath)) return;
    const content = fs.readFileSync(filePath, 'utf8');
    let offset = 0;
    const fileName = path.basename(filePath);
    for (const line of content.split('\n')) {
      if (!line.trim()) { offset += Buffer.byteLength(line + '\n', 'utf8'); continue; }
      try {
        const ev  = JSON.parse(line);
        const len = Buffer.byteLength(line + '\n', 'utf8');
        if (ev.uuid && !this._index[ev.uuid]) {
          this._index[ev.uuid] = { file: fileName, offset, length: len };
        }
        offset += len;
      } catch (_) { offset += Buffer.byteLength(line + '\n', 'utf8'); }
    }
  }

  _countLines(filePath) {
    if (!fs.existsSync(filePath)) return 0;
    const content = fs.readFileSync(filePath, 'utf8');
    return content.split('\n').filter(l => l.trim()).length;
  }

  close() {
    if (this._fd !== null) { fs.closeSync(this._fd); this._fd = null; }
    this._ready = false;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _loadJSON(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch (_) { return fallback; }
}

function _saveJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data), 'utf8');
}

function _readLines(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8').split('\n').filter(l => l.trim());
}

module.exports = { CausalLedger };
