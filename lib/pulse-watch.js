'use strict';
/**
 * lib/pulse-watch.js — the systems as they announce themselves, and the negative space of a missed heartbeat.
 * component_id: nexus.lib.pulse-watch
 * Map: docs/2026-10-05-announce-pulse-repair-phasemap.spec (PR1, PR3)
 *
 * James: "need the systems to anounce themselves. that way i can add new systems automatically." · "use negative space
 * reasoning for missed heartbeats."
 *
 * No polling here. What it is fed — beats (orchestrator's /sse, orchestrator.pulse), the registry snapshot read once
 * at start — is all it knows:
 *   announce(id, { port, intervalMs })   a system is known from its first beat; nothing else is edited to add it
 *   expect(ids)                          the systems that should exist (what autopilot started; the declared ones):
 *                                        one that never announces is negative space too
 *   beat(id, { intervalMs, ts })         a WARP 2 link, caused by the system's previous beat (its first is a root);
 *                                        each beat declares the next as an expectation: "this beat causes the next
 *                                        within interval × grace"
 *   tick(nowMs)                          time passes; a broken expectation is a gap naming the system, its last
 *                                        beat and how long it has been silent — the cause, not a probe failure
 *   state()                              every system: online, lastBeat, interval, open gap
 * A late beat after a gap clears it (recovered). One mechanism, the expectations WARP 2 already has (EM2).
 */
const { Engine } = require('../warp/core/Engine.js');

const MODULE_ID = 'nexus.lib.pulse-watch';
const VERSION = '1.0.0';
const GRACE = 1.5;            // one late beat (GC pause, a busy loop) is not a miss — orchestrator's own grace
const MIN_WINDOW_MS = 5000;   // a system declaring a tiny interval cannot make jitter a miss
const TICK_MS = 1000;         // WARP 2 counts logical ticks; one tick is one second here
const BOOT_GRACE_MS = 60000;  // an expected system that has never announced is missing after this
const MAX_LEDGER = 20000;     // a diagnostic runs for days: past this the ledger is rotated (below), never grown forever

function createPulseWatch({ now = () => Date.now(), onGap = null, onRecover = null, onAnnounce = null, bootGraceMs = BOOT_GRACE_MS, maxLedger = MAX_LEDGER } = {}) {
  let engine = new Engine();
  let rotations = 0;
  const systems = new Map();   // id -> { id, port, intervalMs, lastBeat, lastLink, beats, gap, announcedAt }
  const expected = new Map();  // id -> since (ms)
  const t0 = now();
  let tickAt = Math.floor(t0 / TICK_MS);

  const windowTicks = (ms) => Math.max(1, Math.ceil(Math.max(ms || 10000, MIN_WINDOW_MS) * GRACE / TICK_MS));

  function announce(id, { port = null, intervalMs = 10000 } = {}) {
    if (!id) return null;
    let s = systems.get(id);
    if (!s) {
      s = { id, port, intervalMs, lastBeat: null, lastLink: null, beats: 0, gap: null, announcedAt: now() };
      systems.set(id, s);
      if (onAnnounce) onAnnounce({ ...s });
    } else {
      if (port) s.port = port;
      if (intervalMs) s.intervalMs = intervalMs;
    }
    return s;
  }

  function expect(ids) { for (const id of ids || []) if (!expected.has(id)) expected.set(id, now()); }

  // rotate: a fresh ledger, each watched system carried over as a root that still expects its next beat
  function _rotate() {
    tick();   // settle what broke in the old ledger before it is replaced
    const old = engine;
    engine = new Engine();
    rotations++;
    for (const s of systems.values()) {
      if (!s.lastLink) continue;
      const r = engine.emit('heartbeat', { system: s.id }, { root: true, rootReason: `carried over from ledger ${rotations - 1} (${s.lastLink})`, expect: s.gap ? [] : [{ effect: 'heartbeat', within: windowTicks(s.intervalMs) }] });
      s.lastLink = r.link.id;
    }
    return old;
  }

  function beat(id, { intervalMs = null, port = null, ts = null } = {}) {
    const s = announce(id, { port, intervalMs: intervalMs || undefined });
    _advance();
    if (engine.ledger._entries.length > maxLedger) _rotate();
    const r = s.lastLink
      ? engine.emit('heartbeat', { system: id }, { causedBy: s.lastLink, expect: [{ effect: 'heartbeat', within: windowTicks(s.intervalMs) }] })
      : engine.emit('heartbeat', { system: id }, { root: true, rootReason: `${id} announced itself`, expect: [{ effect: 'heartbeat', within: windowTicks(s.intervalMs) }] });
    s.lastLink = r.link.id;
    s.lastBeat = ts || now();
    s.beats++;
    if (s.gap) {
      const was = s.gap; s.gap = null;
      if (onRecover) onRecover({ system: id, gap: was, silentForMs: s.lastBeat - was.lastBeat });
    }
    return r.link;
  }

  // broken expectations are kept until tick() reads them: any system's beat advances time, and what broke during
  // ANOTHER system's beat must not be lost (found end to end, 0.39.328: one silent system among beating ones never
  // became a gap)
  let pending = [];
  function _advance() {
    const at = Math.floor(now() / TICK_MS);
    if (at <= tickAt) return;
    pending.push(...engine.advance(at - tickAt));
    tickAt = at;
  }

  /** tick() — time passes: broken expectations become gaps; expected systems that never announced do too. */
  function tick() {
    const out = [];
    _advance();
    const broken = pending; pending = [];
    for (const g of broken) {
      const cause = engine.ledger.link(g.cause);
      const id = cause && cause.data.system;
      const s = id && systems.get(id);
      if (!s || s.gap || s.lastLink !== g.cause) continue;   // a later beat already answered, or already reported
      s.gap = { kind: 'missed-heartbeat', system: id, lastBeat: s.lastBeat, silentForMs: now() - s.lastBeat, expectedEveryMs: s.intervalMs, cause: g.cause, missingEffect: g.missingEffect };
      out.push(s.gap);
      if (onGap) onGap(s.gap);
    }
    for (const [id, since] of expected) {
      if (systems.has(id)) continue;
      if (now() - Math.max(since, t0) < bootGraceMs) continue;
      const gap = { kind: 'never-announced', system: id, expectedSince: since, silentForMs: now() - since };
      systems.set(id, { id, port: null, intervalMs: null, lastBeat: null, lastLink: null, beats: 0, gap, announcedAt: null });
      out.push(gap);
      if (onGap) onGap(gap);
    }
    return out;
  }

  function isOnline(id) { const s = systems.get(id); return !!(s && s.lastBeat && !s.gap); }

  function state() {
    return [...systems.values()].map(s => ({ id: s.id, port: s.port, intervalMs: s.intervalMs, online: !!(s.lastBeat && !s.gap), lastBeat: s.lastBeat, beats: s.beats, gap: s.gap }));
  }

  return { announce, expect, beat, tick, isOnline, state, get engine() { return engine; }, get rotations() { return rotations; } };
}

/** parseSse(chunk, carry) -> { events:[obj], carry } — orchestrator's /sse frames ("data: {...}\n\n") */
function parseSse(chunk, carry = '') {
  const buf = carry + chunk;
  const frames = buf.split('\n\n');
  const rest = frames.pop();
  const events = [];
  for (const f of frames) {
    const data = f.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('\n');
    if (!data) continue;
    try { events.push(JSON.parse(data)); } catch (_) { /* a frame that is not JSON is not an event */ }
  }
  return { events, carry: rest };
}

module.exports = { MODULE_ID, VERSION, GRACE, MIN_WINDOW_MS, createPulseWatch, parseSse };
