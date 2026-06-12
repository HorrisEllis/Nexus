'use strict';
/**
 * bridge/ledger.js — Request Ledger
 * UUID: nexus-bridge-ledger-v1-0000-4000-0000-000000000001
 *
 * Wraps lib/event-ledger.js. Every request is written here BEFORE dispatch.
 * This is the source of truth for all cross-system requests.
 *
 * SISO pipeline:
 *   request.received  → LedgerWriteGate   → ledger entry written
 *   request.updated   → LedgerUpdateGate  → status patch written
 *   request.query     → LedgerQueryGate   → filtered result emitted
 *
 * §2.1  Ledger write before dispatch. Always. No exceptions.
 * §1.2  Nothing silently fails — write errors throw.
 * §7.6  The ledger IS the learning system. Everything else is derived.
 */

const fs   = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { STATUS, patchRequest } = require('./types');

// ── SISO primitives (CJS port matching nexus siso/index.js pattern) ──────────
class Event {
  constructor(type, data = {}) {
    this.uuid = randomUUID();
    this.type = type;
    this.data = data;
    this.ts   = Date.now();
  }
}

class Gate {
  constructor(signature) {
    this.signature = signature;
  }
  transform(event, stream) {}
}

class Stream {
  constructor() {
    this.gates   = new Map();
    this.pending = [];
  }
  register(gate) {
    if (this.gates.has(gate.signature))
      throw new Error(`[bridge/ledger] signature collision: ${gate.signature}`);
    this.gates.set(gate.signature, gate);
  }
  emit(event) {
    const gate = this.gates.get(event.type);
    if (gate) gate.transform(event, this);
    else this.pending.push(event);
  }
  sampleHere() { return { pending: [...this.pending] }; }
}

// ── Gates ─────────────────────────────────────────────────────────────────────

/**
 * LedgerWriteGate — appends a new request to the JSONL ledger.
 * Fires on 'request.write'.
 * Emits 'request.written' with the persisted record.
 */
class LedgerWriteGate extends Gate {
  constructor(stream_) {
    super('request.write');
    this._stream = stream_;
  }
  transform(event, stream) {
    const { req, resolve, reject } = event.data;
    try {
      const line = JSON.stringify(req) + '\n';
      fs.appendFileSync(this._stream._ledgerFile, line);
      this._stream._index.set(req.uuid, req);
      stream.emit(new Event('request.written', { req, resolve }));
    } catch(e) {
      reject(new Error(`[bridge/ledger §1.2] write failed: ${e.message}`));
    }
  }
}

/**
 * LedgerWrittenGate — resolves the promise from LedgerWriteGate.
 * Fires on 'request.written'.
 */
class LedgerWrittenGate extends Gate {
  constructor() { super('request.written'); }
  transform(event) {
    event.data.resolve(event.data.req);
  }
}

/**
 * LedgerUpdateGate — patches an existing request in-memory and appends delta.
 * Fires on 'request.update'.
 * Emits 'request.updated' with patched record.
 */
class LedgerUpdateGate extends Gate {
  constructor(stream_) {
    super('request.update');
    this._stream = stream_;
  }
  transform(event, stream) {
    const { uuid, patch, resolve, reject } = event.data;
    const existing = this._stream._index.get(uuid);
    if (!existing) {
      if (reject) reject(new Error(`[bridge/ledger] request not found: ${uuid}`));
      return;
    }
    const updated = patchRequest(existing, patch);
    try {
      fs.appendFileSync(this._stream._ledgerFile, JSON.stringify({ _patch: true, uuid, patch, updatedAt: updated.updatedAt }) + '\n');
      this._stream._index.set(uuid, updated);
      stream.emit(new Event('request.updated', { req: updated, resolve }));
    } catch(e) {
      if (reject) reject(new Error(`[bridge/ledger §1.2] update failed: ${e.message}`));
    }
  }
}

/**
 * LedgerUpdatedGate — resolves the promise from LedgerUpdateGate.
 */
class LedgerUpdatedGate extends Gate {
  constructor() { super('request.updated'); }
  transform(event) {
    if (event.data.resolve) event.data.resolve(event.data.req);
  }
}

/**
 * LedgerQueryGate — filters in-memory index and emits result.
 * Fires on 'request.query'.
 */
class LedgerQueryGate extends Gate {
  constructor(stream_) {
    super('request.query');
    this._stream = stream_;
  }
  transform(event, stream) {
    const { filter = {}, limit = 100, resolve } = event.data;
    let results = [...this._stream._index.values()];

    if (filter.status)  results = results.filter(r => r.status  === filter.status);
    if (filter.type)    results = results.filter(r => r.type    === filter.type);
    if (filter.source)  results = results.filter(r => r.source  === filter.source);
    if (filter.target)  results = results.filter(r => r.target  === filter.target);
    if (filter.tag)     results = results.filter(r => r.tags?.includes(filter.tag));

    results = results
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, limit);

    stream.emit(new Event('request.queried', { results, resolve }));
  }
}

class LedgerQueriedGate extends Gate {
  constructor() { super('request.queried'); }
  transform(event) {
    if (event.data.resolve) event.data.resolve(event.data.results);
  }
}

// ── BridgeLedger ─────────────────────────────────────────────────────────────

function createBridgeLedger({ ledgerDir }) {
  if (!ledgerDir) throw new Error('[bridge/ledger] ledgerDir required');

  fs.mkdirSync(ledgerDir, { recursive: true });

  const _ledgerFile = path.join(ledgerDir, 'requests.jsonl');
  const _index      = new Map();  // uuid → latest request state
  let   _rotateAt   = 50_000;     // rotate after N lines

  // Build the SISO stream
  const stream = new Stream();

  // Attach state the gates need
  stream._ledgerFile = _ledgerFile;
  stream._index      = _index;

  stream.register(new LedgerWriteGate(stream));
  stream.register(new LedgerWrittenGate());
  stream.register(new LedgerUpdateGate(stream));
  stream.register(new LedgerUpdatedGate());
  stream.register(new LedgerQueryGate(stream));
  stream.register(new LedgerQueriedGate());

  // ── Open — replay existing ledger into in-memory index ──────────────────
  function open() {
    if (!fs.existsSync(_ledgerFile)) return { replayed: 0 };
    const lines = fs.readFileSync(_ledgerFile, 'utf8').split('\n').filter(Boolean);
    let replayed = 0;
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry._patch) {
          const existing = _index.get(entry.uuid);
          if (existing) _index.set(entry.uuid, patchRequest(existing, entry.patch));
        } else if (entry.uuid) {
          _index.set(entry.uuid, entry);
          replayed++;
        }
      } catch(_) {}
    }
    return { replayed, total: lines.length };
  }

  // ── Write — §2.1 ledger write BEFORE dispatch ────────────────────────────
  function write(req) {
    return new Promise((resolve, reject) => {
      stream.emit(new Event('request.write', { req, resolve, reject }));
    });
  }

  // ── Update — patch status, routeHistory, error, etc. ────────────────────
  function update(uuid, patch) {
    return new Promise((resolve, reject) => {
      stream.emit(new Event('request.update', { uuid, patch, resolve, reject }));
    });
  }

  // ── Query — filter in-memory index ──────────────────────────────────────
  function query(filter = {}, limit = 100) {
    return new Promise((resolve) => {
      stream.emit(new Event('request.query', { filter, limit, resolve }));
    });
  }

  // ── Get single request ───────────────────────────────────────────────────
  function get(uuid) {
    return _index.get(uuid) || null;
  }

  // ── Held queue — requests waiting for offline targets ────────────────────
  function held() {
    return [..._index.values()].filter(r => r.status === STATUS.HELD);
  }

  // ── Stats ────────────────────────────────────────────────────────────────
  function stats() {
    const byStatus = {};
    for (const req of _index.values()) {
      byStatus[req.status] = (byStatus[req.status] || 0) + 1;
    }
    return { total: _index.size, byStatus, ledgerFile: _ledgerFile };
  }

  return { open, write, update, query, get, held, stats };
}

module.exports = { createBridgeLedger };
