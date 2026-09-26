'use strict';
/**
 * loom/schema/cortex-sync.js — durable persistence + session recovery for LOOM
 * comp_id: nexus.loom.cortex-sync
 * uuid: nexus-loom-cortex-sync-v1-0000-2026-0702-jamesbrooks-001
 *
 * §GAP CLOSED 2026-07-02: LOOM's registry (registry.js) only ever wrote to
 * loom/data/registry.json — a single flat file, no history, no replay, no
 * durability beyond that one file. Every other system that needs durable
 * history uses lib/cortex-write.js (guardian, eravos, copilot, ollama) —
 * write-through to Cortex, buffered to disk if Cortex is offline, flushed
 * on reconnect. LOOM used none of that. This wires it in.
 *
 * Two things this buys, for free, once wired:
 *   1. "Everything saves in cortex" — every add() call now also lands in
 *      Cortex's `loom_events` JAA table, not just registry.json.
 *   2. Rewind/replay — Cortex's writes flow through the CFR-Omega ledger
 *      (lib/cfr/ledger.js), which already has a working GET /cfr/replay
 *      and a causal graph (lib/cfr/graph.js). LOOM does not need its own
 *      replay engine — it needs to be a Cortex writer, which makes it a
 *      CFR participant automatically. This file is what makes it one.
 *
 * The third ask — "button to inject context from last session" — has no
 * host UI yet (LOOM has no HTTP server, no panel, nothing to put a button
 * on). getLastSessionContext() below is the real function a button would
 * call; wiring an actual button needs a host surface, which is a
 * separate, larger decision (see the phase-map note).
 */

const fs   = require('fs');
const path = require('path');
const http = require('http');

const createCortexWriter = require('../../lib/cortex-write');
const _writer = createCortexWriter('loom');

const CX_URL = process.env.CORTEX_URL || 'http://127.0.0.1:3748';
// Same path lib/cortex-write.js buffers to when Cortex is offline —
// reused here as the offline fallback source for session context too.
const BUFFER_FILE = path.join(__dirname, '..', '..', 'data', 'loom', 'loom_events.buffer.jsonl');

/**
 * record — call this after every registry mutation. Fire-and-forget,
 * buffer-safe (same guarantee as every other cortex-write consumer):
 * never throws, never blocks the caller on Cortex being reachable.
 */
function record(action, kind, payload) {
  _writer.insert('loom_events', {
    action,          // 'add' | future: 'checkout' | 'destroy' etc.
    kind,            // 'component' | 'seam' | 'hook' | 'wire'
    id: payload?.id || null,
    payload,
    ts: Date.now(),
  });
}

function _cortexGet(qs) {
  return new Promise(resolve => {
    const u = new URL(`${CX_URL}/api/memory?${qs}`);
    const req = http.request({ hostname: u.hostname, port: u.port || 3748, path: u.pathname + u.search,
      method: 'GET', timeout: 3000 }, r => {
      let d = ''; r.on('data', c => d += c);
      r.on('end', () => { try { resolve(JSON.parse(d)); } catch (_) { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end();
  });
}

function _readBufferTail(n) {
  try {
    const lines = fs.readFileSync(BUFFER_FILE, 'utf8').split('\n').filter(Boolean);
    return lines.slice(-n).map(l => { try { return JSON.parse(l); } catch (_) { return null; } }).filter(Boolean);
  } catch (_) {
    return [];
  }
}

/**
 * getLastSessionContext — the FORGE-SKILL protocol's five boot questions
 * ("what phase, what was the last state, what's outstanding, what's the
 * intent, are SISO+Jaa present") answered from real data instead of asked
 * of a human every time. Falls back to the offline buffer transparently —
 * the caller doesn't need to know or care whether Cortex answered it.
 */
async function getLastSessionContext(n = 30) {
  let rows = null;
  let source = 'cortex';
  const result = await _cortexGet(`table=loom_events&n=${n}`);
  if (result?.ok) {
    rows = result.rows;
  } else {
    rows = _readBufferTail(n);
    source = 'offline-buffer';
  }

  if (!rows || !rows.length) {
    return { ok: true, source, hasHistory: false, summary: 'No LOOM session history found yet — first run.' };
  }

  const last = rows[rows.length - 1];
  const kinds = {};
  for (const r of rows) kinds[r.kind] = (kinds[r.kind] || 0) + 1;

  return {
    ok: true,
    source,               // 'cortex' | 'offline-buffer' — tells the caller if this is live or a fallback
    hasHistory: true,
    lastAction: { action: last.action, kind: last.kind, id: last.id, ts: last.ts, ago_ms: Date.now() - last.ts },
    recentActivity: kinds, // e.g. { component: 4, hook: 2, wire: 1 } across the sampled window
    eventCount: rows.length,
    summary: `Last: ${last.action} ${last.kind} "${last.id}" (${Math.round((Date.now() - last.ts) / 1000)}s ago). `
           + `${rows.length} events in the last window — ${Object.entries(kinds).map(([k, v]) => `${v} ${k}`).join(', ')}.`,
  };
}

module.exports = { record, getLastSessionContext };
