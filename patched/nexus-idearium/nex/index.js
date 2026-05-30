'use strict';
// ── nex/index.js ──────────────────────────────────────────────────────────────
// UUID: nex-codec-v1-0000-4000-0000-000000000001
// VERSION: 1.0.0 — §5.4
//
// .nex file encoder/decoder.
// Three types: NEX-SNAP (full state), NEX-BP (blueprint), NEX-CLIP (slice)
//
// Wire format (text-based, human-inspectable):
//   NEX-SNAP\n<base64-json-header>\n---\n<base64-json-payload>\n---NEX-END---\n
//
// Browser compatible: uses btoa/atob (no Node Buffer required)
// Node compatible: falls back to Buffer if available
//
// §1.2: Every encode/decode wraps in try/catch — never throws silently.

const crypto = typeof require !== 'undefined' ? require('crypto') : null;

const VERSION = '1.0.0';

// ── Encoding helpers ──────────────────────────────────────────────────────────
function _b64encode(str) {
  if (typeof Buffer !== 'undefined') return Buffer.from(str).toString('base64');
  return btoa(unescape(encodeURIComponent(str)));
}

function _b64decode(b64) {
  if (typeof Buffer !== 'undefined') return Buffer.from(b64, 'base64').toString('utf8');
  return decodeURIComponent(escape(atob(b64)));
}

function _hash(str) {
  if (crypto?.createHash) {
    return crypto.createHash('sha256').update(str).digest('hex').slice(0, 16);
  }
  // FNV-1a fallback for browser
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function _uid() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// ── ENCODE ────────────────────────────────────────────────────────────────────

/**
 * Encode a NEX-SNAP: full system state snapshot.
 * @param {object} state - { ideas, specs, gaps, links, snapshots, repos, ciRuns, eventLog, guardianArtifacts }
 * @param {object} opts  - { name, source, compress }
 * @returns {string} .nex file content
 */
function encodeSnap(state, opts = {}) {
  const payloadStr = JSON.stringify(state);
  const meta = {
    ideaCount:    state.ideas?.length    || 0,
    specCount:    state.specs?.length    || 0,
    openGapCount: state.gaps?.filter(g => g.status === 'open').length || 0,
    snr:          state.snrSamples?.slice(-1)[0]?.ratio ?? null,
    headHash:     state.snapshots?.slice(-1)[0]?.hash ?? null,
  };
  const header = {
    magic:    'NEX-SNAP',
    version:  VERSION,
    uuid:     _uid(),
    name:     opts.name || `snap-${Date.now()}`,
    source:   opts.source || 'nex-codec',
    hash:     _hash(payloadStr),
    size:     payloadStr.length,
    compressed: false,
    encoding: 'base64',
    ts:       Date.now(),
    meta,
  };
  return _serialize(header, state);
}

/**
 * Encode a NEX-BP: structural blueprint.
 * @param {object} bp - { spec, modules, vocabulary, macroPatterns, invariants }
 * @param {object} opts
 */
function encodeBP(bp, opts = {}) {
  const payloadStr = JSON.stringify(bp);
  const header = {
    magic:    'NEX-BP',
    version:  VERSION,
    uuid:     _uid(),
    name:     opts.name || bp.spec?.name || `blueprint-${Date.now()}`,
    source:   opts.source || 'nex-codec',
    hash:     _hash(payloadStr),
    size:     payloadStr.length,
    compressed: false,
    encoding: 'base64',
    ts:       Date.now(),
  };
  return _serialize(header, bp);
}

/**
 * Encode a NEX-CLIP: temporal execution slice.
 * @param {object[]} events - Event array from ring buffer
 * @param {object} opts - { seqStart, seqEnd, tsStart, tsEnd, parentSnapHash, baseline, name }
 */
function encodeClip(events, opts = {}) {
  const summary = {
    eventCount:    events.length,
    eventTypes:    [...new Set(events.map(e => e.type))],
    gapsOpened:    events.filter(e => e.type?.includes('gap') && e.payload?.status === 'open').length,
    gapsClosed:    events.filter(e => e.type?.includes('gap') && e.payload?.status === 'resolved').length,
    artifactCount: events.filter(e => e.type?.includes('artifact')).length,
    sigmaAtStart:  opts.sigmaAtStart ?? null,
    sigmaAtEnd:    opts.sigmaAtEnd   ?? null,
  };
  const payload = {
    events,
    seqStart:  opts.seqStart  ?? 0,
    seqEnd:    opts.seqEnd    ?? events.length,
    tsStart:   opts.tsStart   ?? (events[0]?.ts || Date.now()),
    tsEnd:     opts.tsEnd     ?? (events[events.length - 1]?.ts || Date.now()),
    durationMs: (opts.tsEnd ?? Date.now()) - (opts.tsStart ?? Date.now()),
    parentSnapHash: opts.parentSnapHash ?? null,
    baseline:  opts.baseline ?? null,
    summary,
  };
  const payloadStr = JSON.stringify(payload);
  const header = {
    magic:    'NEX-CLIP',
    version:  VERSION,
    uuid:     _uid(),
    name:     opts.name || `clip-${opts.seqStart ?? 0}-${opts.seqEnd ?? events.length}`,
    source:   opts.source || 'nex-codec',
    hash:     _hash(payloadStr),
    size:     payloadStr.length,
    compressed: false,
    encoding: 'base64',
    ts:       Date.now(),
    seqRange: [opts.seqStart ?? 0, opts.seqEnd ?? events.length],
  };
  return _serialize(header, payload);
}

// ── DECODE ────────────────────────────────────────────────────────────────────

/**
 * Decode any .nex file.
 * @param {string} content - .nex file text content
 * @returns {{ header, payload, ok, error }}
 */
function decode(content) {
  try {
    const lines = content.trim().split('\n');
    if (!lines[0]?.startsWith('NEX-')) {
      return { ok: false, error: 'Not a valid .nex file — missing NEX-* magic header' };
    }
    // Find separator lines
    const sepIdx = lines.indexOf('---');
    const endIdx = lines.indexOf('---NEX-END---');
    if (sepIdx < 0 || endIdx < 0) {
      return { ok: false, error: 'Malformed .nex file — missing --- separator or ---NEX-END--- footer' };
    }
    const headerB64  = lines.slice(1, sepIdx).join('');
    const payloadB64 = lines.slice(sepIdx + 1, endIdx).join('');

    const header  = JSON.parse(_b64decode(headerB64));
    const payload = JSON.parse(_b64decode(payloadB64));

    // Integrity check
    const payloadStr = JSON.stringify(payload);
    const computedHash = _hash(payloadStr);
    if (header.hash && computedHash !== header.hash) {
      return { ok: false, error: `Integrity check failed — expected ${header.hash}, got ${computedHash}` };
    }

    return { ok: true, header, payload, magic: header.magic };
  } catch (err) {
    return { ok: false, error: `decode failed: ${err.message}` };
  }
}

/**
 * Inspect a .nex file without fully decoding payload.
 * Returns header + summary only. Fast.
 */
function inspect(content) {
  try {
    const lines = content.trim().split('\n');
    if (!lines[0]?.startsWith('NEX-')) return { ok: false, error: 'Not a valid .nex file' };
    const sepIdx = lines.indexOf('---');
    if (sepIdx < 0) return { ok: false, error: 'Malformed .nex file' };
    const header = JSON.parse(_b64decode(lines.slice(1, sepIdx).join('')));
    return { ok: true, header, magic: header.magic, name: header.name, ts: header.ts };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ── RESTORE helpers ───────────────────────────────────────────────────────────

/**
 * Extract diff between two SNAP payloads.
 * Returns: { ideas: { added, removed, changed }, specs, gaps, snrDelta }
 */
function diffSnaps(payloadA, payloadB) {
  const diff = (arrA, arrB, key = 'uuid') => {
    const aMap = new Map((arrA || []).map(r => [r[key], r]));
    const bMap = new Map((arrB || []).map(r => [r[key], r]));
    return {
      added:   [...bMap.values()].filter(r => !aMap.has(r[key])),
      removed: [...aMap.values()].filter(r => !bMap.has(r[key])),
      changed: [...bMap.values()].filter(r => {
        const a = aMap.get(r[key]);
        return a && JSON.stringify(a) !== JSON.stringify(r);
      }),
    };
  };
  return {
    ideas:    diff(payloadA.ideas,    payloadB.ideas),
    specs:    diff(payloadA.specs,    payloadB.specs),
    gaps:     diff(payloadA.gaps,     payloadB.gaps),
    snrDelta: (payloadB.meta?.snr ?? 0) - (payloadA.meta?.snr ?? 0),
  };
}

// ── Internal ──────────────────────────────────────────────────────────────────
function _serialize(header, payload) {
  const headerB64  = _b64encode(JSON.stringify(header));
  const payloadB64 = _b64encode(JSON.stringify(payload));
  return [
    header.magic,
    headerB64,
    '---',
    payloadB64,
    '---NEX-END---',
    '',
  ].join('\n');
}

// ── File operations (Node.js only) ────────────────────────────────────────────
function writeFile(filePath, content) {
  if (typeof require === 'undefined') throw new Error('writeFile requires Node.js');
  const fs = require('fs');
  fs.writeFileSync(filePath, content, 'utf8');
  return { ok: true, path: filePath, size: content.length };
}

function readFile(filePath) {
  if (typeof require === 'undefined') throw new Error('readFile requires Node.js');
  const fs = require('fs');
  const content = fs.readFileSync(filePath, 'utf8');
  return decode(content);
}

module.exports = {
  encodeSnap, encodeBP, encodeClip,
  decode, inspect, diffSnaps,
  writeFile, readFile,
  VERSION,
};

// ── Browser export ────────────────────────────────────────────────────────────
if (typeof window !== 'undefined') {
  window.NexCodec = { encodeSnap, encodeBP, encodeClip, decode, inspect, diffSnaps, VERSION };
}
