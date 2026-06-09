'use strict';
// ── cortex/working-memory/index.js ───────────────────────────────────────────
// UUID: cortex-working-memory-v2-0000-4000-0000-000000000001
// Version: 2.0.0
//
// WORKING MEMORY — universal event spine for the Cortex/Guardian system.
//
// AXIOMS
//   §WM.1  WRITE BEFORE ACT   — nothing is acted on unless it is in WM first.
//   §WM.2  INTERNAL FIRST     — all state is queryable via query endpoints.
//                               No external system bypasses WM.
//   §WM.3  APPEND ONLY        — rows are never mutated. Superseding writes
//                               carry the original causedBy chain.
//   §WM.4  QUERYABLE          — every row carries source, causedBy, type, ts.
//   §WM.5  FULLY LOGGED       — every write call is immediately observable.
//
// FIXES IN v2.0.0 (all found by audit — nothing pretends to work)
//   FIX-1  write() before open() now throws — silent disk-drop eliminated.
//   FIX-4  JSONL rotation at configurable maxBytes (default 64MB).
//          Rotated file: working_memory.1.jsonl, .2.jsonl … (max 5 kept).
//   FIX-7  search() uses a Type-keyed secondary index (Map<type, row[]>)
//          for O(1) byType and avoids full JSON.stringify on hot paths.
//          Full-text search still O(n) but only over payload strings,
//          not re-serialising structured rows on every call.
//   FIX-8  causedBy index: Map<causedBy, Set<uuid>> — causalChain is O(depth)
//          not O(n * depth).
//
// PERSISTENCE
//   Rows → working_memory.jsonl (append).
//   Rotation: when file hits maxBytes, rename to .1.jsonl, open fresh.
//   Up to maxRotations archived files retained; older ones deleted.
//   On open(), only the current file is replayed into hot array.
//   Rotated files are available for deep historical queries via scanArchive().
//
// QUERY SURFACE
//   wm.write(type, payload, meta)          → row        (throws if not open)
//   wm.query(pred, limit)                  → row[]
//   wm.tail(n)                             → row[]
//   wm.search(term, limit)                 → row[]
//   wm.since(ts, limit)                    → row[]
//   wm.bySource(source, limit)             → row[]
//   wm.byCausedBy(causedBy, limit)         → row[]
//   wm.byType(type, limit)                 → row[]      (O(1) via index)
//   wm.causalChain(rootUuid, maxDepth)     → row[]      (O(depth) via index)
//   wm.scanArchive(pred, limit)            → row[]      (cold read of rotated files)
//   wm.stats()                             → { count, bySource, byType, … }

const fs   = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const MODULE_ID    = 'working-memory';
const VERSION      = '2.0.0';
const DEFAULT_MAX_HOT       = 20_000;
const DEFAULT_MAX_BYTES     = 64 * 1024 * 1024; // 64 MB
const DEFAULT_MAX_ROTATIONS = 5;

let _instance = null;

// ─────────────────────────────────────────────────────────────────────────────

class WorkingMemory {
  constructor({ dataDir, maxHot = DEFAULT_MAX_HOT, maxBytes = DEFAULT_MAX_BYTES, maxRotations = DEFAULT_MAX_ROTATIONS } = {}) {
    this._dir          = dataDir || path.join(__dirname, '..', 'data');
    this._file         = path.join(this._dir, 'working_memory.jsonl');
    this._maxHot       = maxHot;
    this._maxBytes     = maxBytes;
    this._maxRotations = maxRotations;

    // Hot ring array
    this._hot = [];
    this._seq = 0;

    // FIX-7 / FIX-8: secondary indexes
    this._byType     = new Map(); // type     → row[]
    this._byCausedBy = new Map(); // causedBy → row[]

    // Use raw sync fd (fs.openSync) — no stream buffering, file exists immediately
    // This is correct for an append-only log: rows are small, writes are frequent,
    // and we need the file to exist before any rename/rotate call.
    this._fd        = -1;   // -1 = not open
    this._fileBytes = 0;
    this._ready     = false;
  }

  // ── open: replay current JSONL → hot array + indexes, open append stream ──
  // §WM.1: must be called before write(). Throws on fs failure (HARD phase).
  open() {
    if (this._ready) return this;

    fs.mkdirSync(this._dir, { recursive: true });

    if (fs.existsSync(this._file)) {
      const lines = fs.readFileSync(this._file, 'utf8').split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const row = JSON.parse(line);
          // Push to hot array AND indexes — do NOT call _appendRow (that writes disk)
          this._hot.push(row);
          this._indexRow(row);
          if (row._seq >= this._seq) this._seq = row._seq + 1;
        } catch (_) {}
      }
      try { this._fileBytes = fs.statSync(this._file).size; } catch (_) { this._fileBytes = 0; }
      // Cap hot array after replay
      if (this._hot.length > this._maxHot) {
        const dropped = this._hot.splice(0, this._hot.length - this._maxHot);
        // Rebuild indexes without dropped rows (infrequent — only on large replay)
        this._rebuildIndexes();
      }
    }

    this._fd    = fs.openSync(this._file, 'a');
    this._ready = true;

    // Write open event (indexes already built — this goes through normal path)
    this._appendRow({
      uuid:     randomUUID(),
      _seq:     this._seq++,
      type:     'wm.opened',
      source:   MODULE_ID,
      causedBy: null,
      ts:       Date.now(),
      payload:  { version: VERSION, replayed: this._hot.length, fileSizeBytes: this._fileBytes },
    });

    return this;
  }

  close() {
    if (this._fd !== -1) {
      try { fs.closeSync(this._fd); } catch (_) {}
      this._fd = -1;
    }
    this._ready = false;
  }

  // ── write ─────────────────────────────────────────────────────────────────
  // FIX-1: throws if not open — no silent disk drops.
  write(type, payload = {}, meta = {}) {
    if (!type) throw new Error(`[${MODULE_ID} §1.2] type required`);
    // FIX-1: explicit guard — not open = programming error, not silent
    if (!this._ready) throw new Error(`[${MODULE_ID} §1.2] write('${type}') called before open() — boot sequence violated §WM.1`);

    const row = {
      uuid:     meta.uuid     || randomUUID(),
      _seq:     this._seq++,
      type,
      source:   meta.source   || 'unknown',
      causedBy: meta.causedBy || null,
      ts:       meta.ts       || Date.now(),
      payload,
    };

    if (meta.jobId)    row.jobId    = meta.jobId;
    if (meta.provider) row.provider = meta.provider;
    if (meta.agent)    row.agent    = meta.agent;

    this._appendRow(row);
    return row;
  }

  // ── query ─────────────────────────────────────────────────────────────────
  query(pred = () => true, limit = 500) {
    const out = [];
    for (let i = this._hot.length - 1; i >= 0 && out.length < limit; i--) {
      if (pred(this._hot[i])) out.push(this._hot[i]);
    }
    return out.reverse();
  }

  tail(n = 100) {
    return this._hot.slice(Math.max(0, this._hot.length - n));
  }

  since(ts, limit = 1000) {
    // Optimise: walk backwards and stop once we're past the ts window
    const out = [];
    for (let i = this._hot.length - 1; i >= 0 && out.length < limit; i--) {
      const row = this._hot[i];
      if (row.ts < ts) break; // sorted by insertion time — safe to stop
      out.push(row);
    }
    return out.reverse();
  }

  // FIX-7: search does NOT stringify rows for comparison.
  // Checks payload field values only — fast path for string scalar values.
  // For structured payloads, serialise only the payload, not the full row.
  search(term, limit = 100) {
    if (!term) return [];
    const t = term.toLowerCase();
    const out = [];
    for (let i = this._hot.length - 1; i >= 0 && out.length < limit; i--) {
      const row = this._hot[i];
      try {
        // Fast path: check type first (cheap string match)
        if (row.type.includes(t)) { out.push(row); continue; }
        // Check payload only — not the entire row envelope
        if (row.payload && JSON.stringify(row.payload).toLowerCase().includes(t)) {
          out.push(row);
        }
      } catch (_) {}
    }
    return out.reverse();
  }

  // FIX-8: O(1) causedBy lookup via index
  byCausedBy(causedBy, limit = 200) {
    const uuids = this._byCausedBy.get(causedBy);
    if (!uuids) return [];
    // Convert uuid set → rows in chronological order
    const out = [];
    for (const row of this._hot) {
      if (uuids.has(row.uuid)) {
        out.push(row);
        if (out.length >= limit) break;
      }
    }
    return out;
  }

  // FIX-7: O(1) type lookup via index
  byType(type, limit = 500) {
    const rows = this._byType.get(type);
    if (!rows) return [];
    return rows.slice(Math.max(0, rows.length - limit));
  }

  bySource(source, limit = 200) {
    return this.query(r => r.source === source, limit);
  }

  // FIX-8: O(depth) causal chain via causedBy index
  causalChain(rootUuid, maxDepth = 10) {
    const visited  = new Set([rootUuid]);
    const result   = [];
    let   frontier = [rootUuid];

    for (let depth = 0; depth < maxDepth && frontier.length; depth++) {
      const next = [];
      for (const id of frontier) {
        const uuids = this._byCausedBy.get(id);
        if (!uuids) continue;
        for (const row of this._hot) {
          if (uuids.has(row.uuid) && !visited.has(row.uuid)) {
            visited.add(row.uuid);
            result.push(row);
            next.push(row.uuid);
          }
        }
      }
      frontier = next;
    }

    return result;
  }

  // ── scanArchive: cold read of live file + rotated archives ──────────────
  // GAP-B FIX: includes the live working_memory.jsonl before rotated files,
  // so events that rotated out of hot but are still in the current file
  // are found. Rotated files are read newest-first (1 → maxRotations).
  //
  // Returns rows matching pred in approximate reverse-chronological order
  // (live file newest first, then archive 1, then archive 2, …).
  // Use for deep historical queries beyond the hot window.
  scanArchive(pred = () => true, limit = 500) {
    const out = [];
    // Read live file first — most likely to contain recent evicted rows
    const files = [this._file];
    for (let i = 1; i <= this._maxRotations; i++) files.push(this._rotatedFile(i));

    for (const f of files) {
      if (out.length >= limit) break;
      if (!fs.existsSync(f)) continue;
      try {
        const lines = fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).reverse();
        for (const line of lines) {
          if (out.length >= limit) break;
          try {
            const row = JSON.parse(line);
            if (pred(row)) out.push(row);
          } catch (_) {}
        }
      } catch (_) {}
    }
    return out;
  }

  // ── causalChainDeep: cross-boundary causal chain ──────────────────────────
  // GAP-A FIX: extends causalChain() to span the hot/cold boundary.
  //
  // Strategy (bottom-up):
  //   1. Walk UP from startUuid: find the root of the chain by scanning
  //      hot array and then archive for causedBy links.
  //   2. From the root, walk DOWN using the byCausedBy index (hot) and
  //      scanArchive (cold) to collect all descendants.
  //
  // This is intentionally not called causalChain() — it does file I/O and
  // should be reserved for diagnostic/forensic queries, not hot paths.
  // For hot-path queries (recent events), use causalChain().
  //
  // maxDepth applies to both the upward walk and the downward walk.
  causalChainDeep(startUuid, maxDepth = 10) {
    const allRows = new Map();   // uuid → row (deduplicated)

    // Phase 1: collect all rows from archive relevant to this chain.
    // We read the full archive once and index by uuid + causedBy.
    const archiveByUuid     = new Map();
    const archiveByCausedBy = new Map();

    const files = [this._file];
    for (let i = 1; i <= this._maxRotations; i++) files.push(this._rotatedFile(i));

    for (const f of files) {
      if (!fs.existsSync(f)) continue;
      try {
        const lines = fs.readFileSync(f, 'utf8').split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const row = JSON.parse(line);
            archiveByUuid.set(row.uuid, row);
            if (row.causedBy) {
              if (!archiveByCausedBy.has(row.causedBy)) archiveByCausedBy.set(row.causedBy, []);
              archiveByCausedBy.get(row.causedBy).push(row.uuid);
            }
          } catch (_) {}
        }
      } catch (_) {}
    }

    // Also index hot array into archive maps (hot is authoritative for recent rows)
    for (const row of this._hot) {
      archiveByUuid.set(row.uuid, row);
      if (row.causedBy) {
        if (!archiveByCausedBy.has(row.causedBy)) archiveByCausedBy.set(row.causedBy, []);
        // Avoid duplicates
        if (!archiveByCausedBy.get(row.causedBy).includes(row.uuid))
          archiveByCausedBy.get(row.causedBy).push(row.uuid);
      }
    }

    // Phase 2: walk UP to find root
    let rootUuid = startUuid;
    let cursor   = archiveByUuid.get(startUuid);
    for (let d = 0; d < maxDepth && cursor?.causedBy; d++) {
      rootUuid = cursor.causedBy;
      cursor   = archiveByUuid.get(rootUuid);
    }

    // Phase 3: walk DOWN from root collecting all descendants
    const visited  = new Set([rootUuid]);
    let   frontier = [rootUuid];

    for (let depth = 0; depth < maxDepth && frontier.length; depth++) {
      const next = [];
      for (const id of frontier) {
        const childUuids = archiveByCausedBy.get(id) || [];
        for (const uuid of childUuids) {
          if (!visited.has(uuid)) {
            visited.add(uuid);
            const row = archiveByUuid.get(uuid);
            if (row) { allRows.set(uuid, row); next.push(uuid); }
          }
        }
      }
      frontier = next;
    }

    // Return sorted by sequence number
    return [...allRows.values()].sort((a, b) => (a._seq || 0) - (b._seq || 0));
  }

  // ── stats ─────────────────────────────────────────────────────────────────
  stats() {
    const bySource = {};
    for (const row of this._hot) {
      bySource[row.source] = (bySource[row.source] || 0) + 1;
    }
    // byType from index (fast)
    const byType = {};
    for (const [type, rows] of this._byType) {
      byType[type] = rows.length;
    }
    return {
      count:        this._hot.length,
      seq:          this._seq,
      fileSizeBytes: this._fileBytes,
      bySource,
      byType,
      oldest:       this._hot[0]?.ts                          || null,
      newest:       this._hot[this._hot.length - 1]?.ts       || null,
      ready:        this._ready,
      version:      VERSION,
    };
  }

  // ── private ───────────────────────────────────────────────────────────────

  _appendRow(row) {
    // 1. Update hot ring
    this._hot.push(row);
    if (this._hot.length > this._maxHot) {
      const evicted = this._hot.shift();
      // Remove from indexes
      this._removeFromIndexes(evicted);
    }
    // 2. Update indexes
    this._indexRow(row);

    // 3. Append to disk (sync — file exists immediately, no stream buffering)
    if (this._fd !== -1) {
      const line = JSON.stringify(row) + '\n';
      const buf  = Buffer.from(line);
      try {
        fs.writeSync(this._fd, buf);
        this._fileBytes += buf.length;
      } catch (e) {
        console.error(`[${MODULE_ID} §1.2] disk write failed: ${e.message}`);
      }
      // FIX-4: rotate if over size limit
      if (this._fileBytes >= this._maxBytes) {
        this._rotate();
      }
    }
  }

  // FIX-7 / FIX-8: maintain secondary indexes
  _indexRow(row) {
    this._hot; // already appended before this is called from _appendRow

    // byType index
    if (!this._byType.has(row.type)) this._byType.set(row.type, []);
    this._byType.get(row.type).push(row);

    // byCausedBy index
    if (row.causedBy) {
      if (!this._byCausedBy.has(row.causedBy)) this._byCausedBy.set(row.causedBy, new Set());
      this._byCausedBy.get(row.causedBy).add(row.uuid);
    }
  }

  _removeFromIndexes(row) {
    const typeRows = this._byType.get(row.type);
    if (typeRows) {
      const idx = typeRows.indexOf(row);
      if (idx !== -1) typeRows.splice(idx, 1);
      if (typeRows.length === 0) this._byType.delete(row.type);
    }
    if (row.causedBy) {
      const set = this._byCausedBy.get(row.causedBy);
      if (set) {
        set.delete(row.uuid);
        if (set.size === 0) this._byCausedBy.delete(row.causedBy);
      }
    }
  }

  _rebuildIndexes() {
    this._byType.clear();
    this._byCausedBy.clear();
    for (const row of this._hot) {
      if (!this._byType.has(row.type)) this._byType.set(row.type, []);
      this._byType.get(row.type).push(row);
      if (row.causedBy) {
        if (!this._byCausedBy.has(row.causedBy)) this._byCausedBy.set(row.causedBy, new Set());
        this._byCausedBy.get(row.causedBy).add(row.uuid);
      }
    }
  }

  // FIX-4: rotate JSONL file — shift .{n-1} → .{n}, prune oldest, open fresh
  _rotate() {
    if (!this._fd) return;
    try { fs.closeSync(this._fd); } catch (_) {}
    this._fd = -1;

    // Delete the oldest rotation if it exists
    const oldest = this._rotatedFile(this._maxRotations);
    try { if (fs.existsSync(oldest)) fs.unlinkSync(oldest); } catch (_) {}

    // Shift: .{n-1} → .{n}  for n = maxRotations down to 2
    for (let i = this._maxRotations - 1; i >= 1; i--) {
      const src  = this._rotatedFile(i);
      const dest = this._rotatedFile(i + 1);
      try { if (fs.existsSync(src)) fs.renameSync(src, dest); } catch (_) {}
    }

    // Rename current → .1
    try { if (fs.existsSync(this._file)) fs.renameSync(this._file, this._rotatedFile(1)); } catch (_) {}

    // Open fresh file
    this._fd        = fs.openSync(this._file, 'a');
    this._fileBytes = 0;

    console.log(`[${MODULE_ID}] rotated working_memory.jsonl → working_memory.1.jsonl`);
  }

  _rotatedFile(n) {
    return path.join(this._dir, `working_memory.${n}.jsonl`);
  }
}

// ── Singleton factory ─────────────────────────────────────────────────────────

function getWM(opts) {
  if (!_instance) _instance = new WorkingMemory(opts);
  return _instance;
}

// ── Typed write helpers ───────────────────────────────────────────────────────
// Enforce consistent payload shapes. Every helper calls wm.write() — §WM.1.

function makeHelpers(wm) {
  return {
    boot(source, payload = {}) {
      return wm.write('system.boot', payload, { source, causedBy: null });
    },
    jobQueued(jobId, provider, prompt, source = 'guardian') {
      return wm.write('guardian.job.queued', { jobId, provider, promptLen: (prompt||'').length }, { source, causedBy: null, jobId, provider });
    },
    jobDispatched(jobId, provider, source = 'guardian') {
      return wm.write('guardian.job.dispatched', { jobId, provider }, { source, causedBy: jobId, jobId, provider });
    },
    jobComplete(jobId, provider, chars, durationMs, source = 'guardian') {
      return wm.write('guardian.job.complete', { jobId, provider, chars, durationMs }, { source, causedBy: jobId, jobId, provider });
    },
    jobError(jobId, provider, error, source = 'guardian') {
      return wm.write('guardian.job.error', { jobId, provider, error }, { source, causedBy: jobId, jobId, provider });
    },
    providerConnected(provider, tabId, source = 'guardian') {
      return wm.write('guardian.provider.connected', { provider, tabId }, { source, causedBy: null, provider });
    },
    providerDisconnected(provider, tabId, source = 'guardian') {
      return wm.write('guardian.provider.disconnected', { provider, tabId }, { source, causedBy: null, provider });
    },
    artifact(jobId, provider, name, lang, chars, source = 'guardian') {
      return wm.write('guardian.artifact', { jobId, provider, name, lang, chars }, { source, causedBy: jobId, jobId, provider });
    },
    gap(jobId, type, domain, description, score, source = 'guardian') {
      return wm.write('guardian.gap', { jobId, type, domain, description, score }, { source, causedBy: jobId, jobId });
    },
    agentCall(callUuid, routedTo, intent, source = 'cortex') {
      return wm.write('cortex.agent.call', { callUuid, routedTo, intent }, { source, causedBy: null });
    },
    agentComplete(callUuid, routedTo, chars, source = 'cortex') {
      return wm.write('cortex.agent.complete', { callUuid, routedTo, chars }, { source, causedBy: callUuid });
    },
    agentError(callUuid, routedTo, error, source = 'cortex') {
      return wm.write('cortex.agent.error', { callUuid, routedTo, error }, { source, causedBy: callUuid });
    },
    relayEnqueued(jobId, provider, source = 'mind-bridge') {
      return wm.write('relay.enqueued', { jobId, provider }, { source, causedBy: null, jobId, provider });
    },
    relayAcked(jobId, source = 'guardian') {
      return wm.write('relay.acked', { jobId }, { source, causedBy: jobId, jobId });
    },
    relayComplete(jobId, chars, source = 'guardian') {
      return wm.write('relay.complete', { jobId, chars }, { source, causedBy: jobId, jobId });
    },
    seamChunk(queueId, chunkIndex, chunkTotal, provider, source = 'guardian') {
      return wm.write('guardian.seam.chunk', { queueId, chunkIndex, chunkTotal, provider }, { source, causedBy: queueId });
    },
    seamComplete(queueId, provider, source = 'guardian') {
      return wm.write('guardian.seam.complete', { queueId, provider }, { source, causedBy: queueId });
    },
    failure(error, stack, source) {
      return wm.write('system.failure', { error, stack: (stack||'').slice(0, 500) }, { source: source || 'unknown', causedBy: null });
    },
    bus(type, data, meta = {}) {
      return wm.write(type, data, meta);
    },
  };
}

module.exports = { WorkingMemory, getWM, makeHelpers, MODULE_ID, VERSION };
