'use strict';
// ── cortex/memory/data-poller.js ──────────────────────────────────────────────
// UUID: cortex-data-poller-v1-0000-4000-0000-000000000001
// Status: pre-release
//
// CORTEX IS THE ULTIMATE TRUTH.
//
// Every other system in NEXUS writes to its own local data/ folder first —
// disk-first, no network dependency, never blocked by cortex availability.
//
// This module is cortex's pull mechanism. It polls every registered data source
// on a configurable interval, reads JSONL files for rows it hasn't seen yet,
// and ingests them into the appropriate cortex JAA table.
//
// Design:
//   - Each source has a "cursor" — the last _rowId or line offset seen.
//   - Cursors survive cortex restarts (written to data/.poller-cursors.json).
//   - Sources declare which JSONL files map to which JAA tables.
//   - Non-blocking: each source polled independently, errors per-source.
//
// §M1: init(cfg) + stop()
// §2.1: disk first — poller reads from local JSONL, never from network
// §1.2: per-source error isolation — one bad source never kills the poller

'use strict';

const fs   = require('fs');
const path = require('path');
const { jaaDB, uid, TABLE_TIERS } = require('./jaa-db');

const MODULE_ID   = 'memory/data-poller';
const CURSOR_FILE = '.poller-cursors.json';

// ── Source registry ───────────────────────────────────────────────────────────
// Each source: { id, dir, files: [{ file, table, transform? }] }
// transform(row) — optional: remap a row from the source schema to JAA schema.
//                 Return null to skip the row.

const DEFAULT_SOURCES = [
  {
    id:  'guardian',
    dir: null, // resolved from env or default at init time
    files: [
      {
        // Guardian's local ledger NDJSON
        file:  'ledger/events.ndjson',
        table: 'event_log',
        transform: (row) => ({
          uuid:     row.uuid || uid(),
          type:     row.type,
          payload:  row.payload || {},
          source:   `guardian:${row.source || 'unknown'}`,
          causedBy: row.causedBy || null,
          ts:       row.ts || Date.now(),
        }),
      },
      {
        // Guardian's jaa-store artifacts
        file:  'memory_store/artifacts.json',
        table: 'artifacts',
        format: 'json-array', // full JSON array, not NDJSON line-by-line
        idField: 'id',
        transform: (row) => ({
          uuid:     row.uuid || row.id || uid(),
          jobId:    row.job_id || row.jobId || null,
          provider: row.provider || 'guardian',
          lang:     row.lang || row.type || 'text',
          hash:     row.hash || null,
          content:  (row.content || '').slice(0, 10000),
          chatUrl:  row.chat_url || row.chatUrl || '',
          account:  row.account || '',
          source:   'guardian-poller',
          ts:       row.ts || Date.now(),
        }),
      },
    ],
  },
  {
    id:  'orchestrator',
    dir: null,
    files: [
      {
        file:  'ledger/events.ndjson',
        table: 'event_log',
        transform: (row) => ({
          uuid:     row.uuid || uid(),
          type:     row.type,
          payload:  row.payload || {},
          source:   `orchestrator:${row.source || 'unknown'}`,
          causedBy: row.causedBy || null,
          ts:       row.ts || Date.now(),
        }),
      },
    ],
  },
  {
    id:  'idearium',
    dir: null,
    files: [
      {
        file:  'ledger/events.ndjson',
        table: 'event_log',
        transform: (row) => ({
          uuid:     row.uuid || uid(),
          type:     row.type,
          payload:  row.payload || {},
          source:   `idearium:${row.source || 'unknown'}`,
          causedBy: null,
          ts:       row.ts || Date.now(),
        }),
      },
      {
        // Flat JSONL from ledger-writer (§MONITOR-04)
        file:  'event_log.jsonl',
        table: 'event_log',
        transform: (row) => row.source ? row : { ...row, source: `idearium:poller` },
      },
    ],
  },
  // §MONITOR-04: Added architect, bridge, emerge sources
  {
    id:  'architect',
    dir: null,
    files: [
      {
        file:  'event_log.jsonl',
        table: 'event_log',
        transform: (row) => ({ ...row, source: `architect:${row.source||'poller'}` }),
      },
      {
        file:  'gaps.jsonl',
        table: 'gaps',
        transform: (row) => ({ ...row, source: `architect:${row.source||'poller'}` }),
      },
    ],
  },
  {
    id:  'bridge',
    dir: null,
    files: [
      {
        file:  'event_log.jsonl',
        table: 'event_log',
        transform: (row) => ({ ...row, source: `bridge:${row.source||'poller'}` }),
      },
      {
        file:  'failures.jsonl',
        table: 'failures',
        transform: (row) => ({ ...row, source: `bridge:${row.source||'poller'}` }),
      },
    ],
  },
  {
    id:  'emerge',
    dir: null,
    files: [
      {
        file:  'event_log.jsonl',
        table: 'event_log',
        transform: (row) => ({ ...row, source: `emerge:${row.source||'poller'}` }),
      },
    ],
  },
];

// ── DataPoller ────────────────────────────────────────────────────────────────

class DataPoller {
  constructor() {
    this._sources  = [];
    this._cursors  = {};   // sourceId:file -> { lineOffset, seenIds: Set }
    this._interval = null;
    this._cfg      = {};
    this._cursorFile = null;
  }

  // ── §M1 ───────────────────────────────────────────────────────────────────

  init(cfg = {}) {
    this._cfg = {
      pollMs:   cfg.pollMs   ?? 5000,
      dataRoot: cfg.dataRoot ?? path.join(__dirname, '..', '..', 'data'),
    };

    this._cursorFile = path.join(this._cfg.dataRoot, CURSOR_FILE);
    this._loadCursors();
    this._resolveSourceDirs();

    this._interval = setInterval(() => this._tick(), this._cfg.pollMs);
    this._interval.unref();

    console.log(`[${MODULE_ID}] started — polling ${this._sources.length} sources every ${this._cfg.pollMs}ms`);
  }

  stop() {
    clearInterval(this._interval);
    this._interval = null;
    this._saveCursors();
  }

  // ── Register additional source at runtime ─────────────────────────────────
  registerSource(source) {
    if (!this._sources.find(s => s.id === source.id)) {
      this._sources.push(source);
    }
  }

  // ── Main poll tick ────────────────────────────────────────────────────────
  async _tick() {
    for (const source of this._sources) {
      try {
        await this._pollSource(source);
      } catch (err) {
        // Per-source isolation — never kills the poller
        try {
          jaaDB.insert('failures', {
            uuid: uid(), source: MODULE_ID,
            error: `source ${source.id}: ${err.message}`,
            ts: Date.now(),
          });
        } catch {}
      }
    }
    this._saveCursors();
  }

  // ── Poll one source ───────────────────────────────────────────────────────
  async _pollSource(source) {
    if (!source.dir || !fs.existsSync(source.dir)) return;

    for (const fileDef of source.files) {
      const absFile = path.join(source.dir, fileDef.file);
      if (!fs.existsSync(absFile)) continue;

      const cursorKey = `${source.id}:${fileDef.file}`;

      if (fileDef.format === 'json-array') {
        await this._pollJsonArray(absFile, fileDef, cursorKey);
      } else {
        await this._pollNDJSON(absFile, fileDef, cursorKey);
      }
    }
  }

  // ── Poll append-only NDJSON (line-by-line) ────────────────────────────────
  async _pollNDJSON(absFile, fileDef, cursorKey) {
    const cursor = this._getCursor(cursorKey);

    let content;
    try { content = fs.readFileSync(absFile, 'utf8'); } catch { return; }

    const lines = content.split('\n').filter(Boolean);
    const newLines = lines.slice(cursor.lineOffset);

    if (!newLines.length) return;

    let ingested = 0;
    for (const line of newLines) {
      cursor.lineOffset++;
      let raw;
      try { raw = JSON.parse(line); } catch { continue; }

      const row = fileDef.transform ? fileDef.transform(raw) : raw;
      if (!row) continue;

      // Dedup by uuid — skip if already in cortex
      if (row.uuid && this._alreadyHave(fileDef.table, row.uuid)) continue;

      try {
        jaaDB.insert(fileDef.table, row);
        ingested++;
      } catch {}
    }

    if (ingested > 0) {
      console.log(`[${MODULE_ID}] ingested ${ingested} rows from ${cursorKey} → ${fileDef.table}`);
    }
  }

  // ── Poll JSON array (full snapshot, compare by idField) ───────────────────
  async _pollJsonArray(absFile, fileDef, cursorKey) {
    const cursor  = this._getCursor(cursorKey);
    const idField = fileDef.idField || 'id';

    let data;
    try { data = JSON.parse(fs.readFileSync(absFile, 'utf8')); } catch { return; }

    const rows = Array.isArray(data) ? data : (data[fileDef.table] || data.rows || []);
    let ingested = 0;

    for (const raw of rows) {
      const id = raw[idField] || raw.uuid;
      if (!id) continue;
      if (cursor.seenIds.has(id)) continue;
      cursor.seenIds.add(id);

      const row = fileDef.transform ? fileDef.transform(raw) : raw;
      if (!row) continue;

      if (row.uuid && this._alreadyHave(fileDef.table, row.uuid)) continue;

      try {
        jaaDB.insert(fileDef.table, row);
        ingested++;
      } catch {}
    }

    if (ingested > 0) {
      console.log(`[${MODULE_ID}] ingested ${ingested} rows from ${cursorKey} → ${fileDef.table}`);
    }
  }

  // ── Dedup check ───────────────────────────────────────────────────────────
  _alreadyHave(table, uuid) {
    return !!jaaDB.get(table, uuid);
  }

  // ── Cursor management ─────────────────────────────────────────────────────

  _getCursor(key) {
    if (!this._cursors[key]) {
      this._cursors[key] = { lineOffset: 0, seenIds: new Set() };
    }
    return this._cursors[key];
  }

  _loadCursors() {
    try {
      if (!fs.existsSync(this._cursorFile)) return;
      const saved = JSON.parse(fs.readFileSync(this._cursorFile, 'utf8'));
      for (const [key, val] of Object.entries(saved)) {
        this._cursors[key] = {
          lineOffset: val.lineOffset || 0,
          seenIds:    new Set(val.seenIds || []),
        };
      }
    } catch {}
  }

  _saveCursors() {
    try {
      const serializable = {};
      for (const [key, val] of Object.entries(this._cursors)) {
        serializable[key] = {
          lineOffset: val.lineOffset,
          seenIds:    [...val.seenIds].slice(-2000), // cap seenIds to 2k
        };
      }
      fs.writeFileSync(this._cursorFile, JSON.stringify(serializable, null, 2));
    } catch {}
  }

  // ── Source dir resolution ─────────────────────────────────────────────────
  _resolveSourceDirs() {
    const dataRoot = this._cfg.dataRoot;
    const envMap = {
      guardian:      process.env.GUARDIAN_DATA_DIR    || path.join(dataRoot, 'guardian'),
      orchestrator:  process.env.ORCH_DATA_DIR        || path.join(dataRoot, 'orchestrator'),
      idearium:      process.env.IDEARIUM_DATA_DIR    || path.join(dataRoot, 'idearium'),
      emerge:        process.env.EMERGE_DATA_DIR      || path.join(dataRoot, 'emerge'),
      // §MONITOR-04: added architect, bridge
      architect:     process.env.ARCHITECT_DATA_DIR   || path.join(dataRoot, 'architect'),
      bridge:        process.env.BRIDGE_DATA_DIR      || path.join(dataRoot, 'bridge'),
      // §LIMINAL-10: guardian memory store data
      'guardian-mem':process.env.GUARDIAN_MEM_DIR     || path.join(__dirname,'../../guardian','memory_store'),
    };

    for (const def of DEFAULT_SOURCES) {
      const resolved = { ...def, dir: envMap[def.id] || path.join(dataRoot, def.id) };
      this._sources.push(resolved);
    }
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────
const dataPoller = new DataPoller();

module.exports = { DataPoller, dataPoller, DEFAULT_SOURCES };
