'use strict';
/**
 * lib/context-stream.js — GM5 (0.60.156): context for a gate, found as a SISO stream, not climbed as a ladder.
 * comp_id: nexus.lib.context-stream
 *
 * James, 2026-10-18: "it needs to be non linear and agnostic" · "look at siso". Map: docs/2026-10-18-gate-memory-phasemap.spec
 * addendum (b); the census that put it first in layer 1: docs/2026-10-18-gating-census-phasemap.spec.
 *
 * Built on siso/ (the shared primitive, lib/system-boundary.js PRIMITIVES), loaded with import() because siso/ is ESM:
 *   context.request ─▶ RequestGate ─▶ context.ask.<signature> × every registered source of the tier
 *   context.ask.<s> ─▶ SourceGate(s) ─▶ (its ask resolves) ─▶ context.piece × n
 *   context.piece   ─▶ PieceGate    ─▶ the collector
 * A source named in the table but with no ask in this process has no gate: its ask event stays in pending[] — residue,
 * said in the answer ("absent"), never faked (§1.2). A source that answers with an error is "failed", with its reason.
 * Order: none. Every free source is asked at once; the answer is the same whatever order the pieces arrive in (sorted by
 * score, then source, then id). Inside-out survives as COST: only the need no free piece covered is asked of a 'model'
 * source, and only what is still uncovered is returned as `build` — what a build would be asked. The finder never builds.
 *
 *   find(request, opts) → Promise<{ ok, request, pieces, covered, residue: { need, absent, failed }, asked, build, log }>
 *     request  { text, need?: [string], gate?, repoUuid?, refs?, limit? }   need defaults to [text]
 *     opts     { sources?: [signature], extra?: [row], ask?: { <signature>: fn }, timeoutMs?, logLevel? }
 *   note(result, { budget }) → the text an agent is given (capped), '' when nothing was found
 */

const SOURCES = require('./context-sources.js');

const MODULE_ID = 'nexus.lib.context-stream';
const VERSION = '1.0.0';
const NOTE_MAX = 2400;

let _siso = null;
async function _sisoLib() { return _siso || (_siso = await import(require('url').pathToFileURL(require('path').join(__dirname, '..', 'siso', 'index.js')).href)); }

const _toks = (s) => { try { return require('./context-atlas.js').qtokens(s); } catch (_) { return String(s || '').toLowerCase().split(/\W+/).filter(t => t.length > 1); } };

/** a piece covers a need item when it says so, or when at least half the item's words (at least one) are in its text */
function _covers(piece, item) {
  if (Array.isArray(piece.covers) && piece.covers.includes(item)) return true;
  const t = _toks(item); if (!t.length) return false;
  const hay = String(piece.text || '').toLowerCase() + ' ' + String(piece.id || '').toLowerCase();
  return t.filter(w => hay.includes(w)).length >= Math.max(1, Math.ceil(t.length / 2));
}

async function find(request = {}, opts = {}) {
  const text = String(request.text || '').trim();
  const need = (Array.isArray(request.need) && request.need.length ? request.need : [text]).map(String).filter(Boolean);
  if (!text && !need.length) return { ok: false, error: 'a request needs text or need' };
  const rq = { ...request, text: text || need.join(' '), need, timeoutMs: opts.timeoutMs || 4000 };
  const { Stream, StreamLog, Gate, Event } = await _sisoLib();
  const table = SOURCES.rows({ only: opts.sources || null, extra: opts.extra || [] });
  const askOf = (row) => (opts.ask && typeof opts.ask[row.signature] === 'function') ? opts.ask[row.signature] : row.ask;

  const log = new StreamLog(opts.logLevel || 'DEEP');
  const stream = new Stream({ log });
  const pieces = new Map(), asked = [], failed = [], inflight = [];

  class PieceGate extends Gate {
    constructor() { super('context.piece'); }
    transform(e) { const p = e.data; if (!pieces.has(p.id) || pieces.get(p.id).score < p.score) pieces.set(p.id, p); }
  }
  class SourceGate extends Gate {
    constructor(row, ask) { super(`context.ask.${row.signature}`); this.row = row; this.ask = ask; }
    transform(e, s) {
      const row = this.row, t0 = Date.now(), q = e.data;
      const timer = new Promise((_, rej) => setTimeout(() => rej(new Error(`timed out after ${rq.timeoutMs} ms`)), rq.timeoutMs).unref());
      inflight.push(Promise.race([Promise.resolve().then(() => this.ask(q)), timer]).then((list) => {
        const got = (Array.isArray(list) ? list : []).filter(p => p && p.id != null);
        asked.push({ source: row.signature, system: row.system, cost: row.cost, pieces: got.length, ms: Date.now() - t0 });
        for (const p of got) s.emit(new Event('context.piece', {
          id: String(p.id), from: row.signature, system: row.system, kind: p.kind || (row.kinds && row.kinds[0]) || 'reference',
          score: Math.max(0, Math.min(1, Number(p.score) || 0)), text: String(p.text || '').slice(0, 320),
          ...(Array.isArray(p.covers) ? { covers: p.covers } : {}), at: Date.now(),
        }));
      }, (err) => {
        asked.push({ source: row.signature, system: row.system, cost: row.cost, pieces: 0, ms: Date.now() - t0 });
        failed.push({ source: row.signature, why: String(err && err.message || err).slice(0, 200), ...(row.phase ? { phase: row.phase } : {}) });
      }));
    }
  }
  class RequestGate extends Gate {
    constructor() { super('context.request'); }
    transform(e, s) { for (const row of table.filter(r => r.cost === e.data.tier)) s.emit(new Event(`context.ask.${row.signature}`, e.data.request)); }
  }

  stream.register(new RequestGate());
  stream.register(new PieceGate());
  for (const row of table) { const a = askOf(row); if (typeof a === 'function' && row.cost !== 'build') stream.register(new SourceGate(row, a)); }

  const uncovered = () => need.filter(n => ![...pieces.values()].some(p => _covers(p, n)));
  const settle = async () => { while (inflight.length) await Promise.allSettled(inflight.splice(0)); };

  stream.emit(new Event('context.request', { tier: 'free', request: rq }));
  await settle();
  let residue = uncovered();
  if (residue.length && table.some(r => r.cost === 'model')) {
    stream.emit(new Event('context.request', { tier: 'model', request: { ...rq, need: residue, text: residue.join(' ') } }));
    await settle();
    residue = uncovered();
  }

  const absent = stream.sampleHere().pending.filter(e => /^context\.ask\./.test(e.type)).map(e => e.type.slice('context.ask.'.length));
  const list = [...pieces.values()].sort((a, b) => b.score - a.score || a.from.localeCompare(b.from) || a.id.localeCompare(b.id));
  const covered = need.filter(n => !residue.includes(n));
  asked.sort((a, b) => a.source.localeCompare(b.source)); failed.sort((a, b) => a.source.localeCompare(b.source));
  return {
    ok: true, request: { text: rq.text, need, gate: rq.gate || null, repoUuid: rq.repoUuid || null },
    pieces: list, covered, residue: { need: residue, absent: [...new Set(absent)].sort(), failed },
    asked, build: table.some(r => r.cost === 'build') ? residue : [],
    log: { events: stream.sampleHere().eventCount, entries: log.entries(50).length },
  };
}

function note(r, { budget = NOTE_MAX } = {}) {
  if (!r || !r.ok || !r.pieces.length) return '';
  const head = `CONTEXT FOUND (${r.pieces.length} piece(s) from ${[...new Set(r.pieces.map(p => p.from))].join(', ')}; covered ${r.covered.length}/${r.request.need.length}${r.residue.need.length ? `; not found: ${r.residue.need.join(' · ')}` : ''})`;
  const out = [head];
  let used = head.length;
  for (const p of r.pieces) {
    const line = `- [${p.from} ${p.kind} ${p.score.toFixed(2)}] ${p.id}: ${p.text.replace(/\s+/g, ' ')}`;
    if (used + line.length + 1 > budget) break;
    out.push(line); used += line.length + 1;
  }
  return out.join('\n').slice(0, budget);
}

module.exports = { MODULE_ID, VERSION, NOTE_MAX, find, note };
