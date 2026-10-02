'use strict';
/**
 * lib/nexstore/record.js — the record frame of the node store (0.39.300, N1).
 * component_id: nexus.lib.nexstore.record
 * Map: docs/2026-09-29-nex-node-store-phasemap.spec (N1_record_and_log) — second by leverage in intelligence's gap
 * synthesis (docs/2026-10-02-synthesis-zoom-versionium-phasemap.spec, LV1), after N0.
 *
 * A frame on disk:   [ u32 length ][ u32 crc32(body) ][ body: UTF-8 JSON ]        (little-endian)
 * The body (I3, provenance on every record): seq, prev, hash, op, type, id, change, causedBy, by, at.
 *   prev   the hash of the record before (null for seq 1) — the chain
 *   hash   sha256 of the canonical JSON of every other field — a record cannot change without its hash changing,
 *          and its successor's prev no longer matching
 * causedBy is required as a field: null is allowed and said, a missing cause is refused (I3).
 * Pure Node, no state.
 */
const crypto = require('crypto');
const zlib = require('zlib');

const HEAD = 8;                       // u32 length + u32 crc
const MAX_BODY = 64 * 1024 * 1024;    // a length beyond this is corruption, not a record
const FIELDS = Object.freeze(['seq', 'prev', 'hash', 'op', 'type', 'id', 'change', 'causedBy', 'by', 'at']);

const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) {
  if (typeof zlib.crc32 === 'function') return zlib.crc32(buf) >>> 0;
  let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/** canonical(v) → JSON with object keys sorted at every depth, so the same record always hashes the same */
function canonical(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
}

/** hashOf(rec) → sha256 hex of every field but hash */
function hashOf(rec) {
  const { hash, ...rest } = rec; // eslint-disable-line no-unused-vars
  return crypto.createHash('sha256').update(canonical(rest)).digest('hex');
}

/**
 * seal(input, { seq, prev, at }) → the full record: provenance filled, hash computed.
 * input: { op, type, id, change, causedBy, by }. Refuses a write without a cause field or an op/type.
 */
function seal(input, { seq, prev, at }) {
  if (!input || typeof input !== 'object') throw new Error('nexstore: a record is an object');
  if (!input.op || typeof input.op !== 'string') throw new Error('nexstore: a record needs an op');
  if (!input.type || typeof input.type !== 'string') throw new Error('nexstore: a record needs a type');
  if (!('causedBy' in input)) throw new Error('nexstore: no write without a cause field (causedBy: null is allowed and said) — I3');
  const rec = {
    seq, prev: prev || null, op: input.op, type: input.type, id: input.id == null ? null : String(input.id),
    change: input.change === undefined ? null : input.change, causedBy: input.causedBy, by: input.by || null,
    at: at || input.at || new Date().toISOString(),
  };
  rec.hash = hashOf(rec);
  return rec;
}

/** encode(rec) → Buffer, one frame */
function encode(rec) {
  const body = Buffer.from(JSON.stringify(rec), 'utf8');
  if (body.length > MAX_BODY) throw new Error(`nexstore: a record of ${body.length} bytes is over the ${MAX_BODY}-byte cap`);
  const head = Buffer.alloc(HEAD);
  head.writeUInt32LE(body.length, 0); head.writeUInt32LE(crc32(body), 4);
  return Buffer.concat([head, body]);
}

/**
 * decode(buf, offset) → { rec, next } | { torn: reason }
 *   torn reasons: 'short-head' · 'short-body' (the frame runs past the end) · 'bad-length' · 'bad-crc' · 'bad-json'
 */
function decode(buf, offset = 0) {
  if (buf.length - offset < HEAD) return { torn: 'short-head' };
  const len = buf.readUInt32LE(offset), crc = buf.readUInt32LE(offset + 4);
  if (len === 0 || len > MAX_BODY) return { torn: 'bad-length' };
  if (buf.length - offset - HEAD < len) return { torn: 'short-body' };
  const body = buf.subarray(offset + HEAD, offset + HEAD + len);
  if (crc32(body) !== crc) return { torn: 'bad-crc' };
  let rec; try { rec = JSON.parse(body.toString('utf8')); } catch (_) { return { torn: 'bad-json' }; }
  return { rec, next: offset + HEAD + len };
}

/** verify(rec, prevRec) → null | reason — seq follows, prev links, hash holds */
function verify(rec, prevRec) {
  if (!rec || typeof rec !== 'object') return 'not a record';
  const wantSeq = prevRec ? prevRec.seq + 1 : 1;
  if (rec.seq !== wantSeq) return `seq ${rec.seq} where ${wantSeq} was due`;
  if ((rec.prev || null) !== (prevRec ? prevRec.hash : null)) return `seq ${rec.seq}: prev does not match the hash before it`;
  if (rec.hash !== hashOf(rec)) return `seq ${rec.seq}: the hash does not match the record`;
  return null;
}

module.exports = { HEAD, MAX_BODY, FIELDS, crc32, canonical, hashOf, seal, encode, decode, verify };
