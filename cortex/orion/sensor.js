'use strict';
// ── orion/sensor.js ───────────────────────────────────────────────────────────
// UUID: mod-orion-sensor-v5-0000-4000-0000-000000000001
//
// ORION §A2 — measure. First stage.
// Reads agent_messages from Guardian. Accumulates events per calltoId.
// Writes completed sessions to orion_sessions (status='measured').
// v5.0: Buffer lives in orion_sessions table, not in-memory (§G-V5-02 resolved).
//
// §M1: init(cfg) + stop().
// §M2: reads: agent_messages. writes: orion_sessions, event_log.

const { jaaDB, uid } = require('../memory/jaa-db');

const MODULE_ID    = 'orion/sensor';
const SESSION_TTL  = 120000; // 2 min — complete a session if no new events

let _interval  = null;
let _cfg       = {};
let _lastBrMsg = 0;

function init(cfg = {}) {
  _cfg      = cfg;
  _interval = setInterval(_tick, _cfg.pollMs ?? 1000);
  _interval.unref();
}

function stop() {
  clearInterval(_interval);
  _interval = null;
}

async function _tick() {
  try {
    const now       = Date.now();
    const newMsgs   = jaaDB.query('agent_messages', r => r._rowId > _lastBrMsg, 100);
    if (newMsgs.length) _lastBrMsg = newMsgs[newMsgs.length - 1]._rowId;

    // Group new messages by session
    for (const msg of newMsgs) {
      const calltoId = msg.callto?.id || msg.instanceId || 'default';

      // Find or create buffering session
      let session = jaaDB.query('orion_sessions',
        r => r.calltoId === calltoId && r.status === 'buffering',
        1
      )[0];

      if (!session) {
        session = jaaDB.insert('orion_sessions', {
          uuid:      uid(),
          calltoId,
          service:   _detectService(msg),
          events:    [],
          regime:    'insufficient_data',
          features:  {},
          status:    'buffering',
          source:    MODULE_ID,
          causedBy:  msg.uuid,
          ts:        now,
        });
      }

      // Append event to session
      const events = [...(session.events || []), { type: msg.type, ts: now, payload: msg }];
      jaaDB.update('orion_sessions', session.uuid, { events, lastEventAt: now });
    }

    // Complete sessions that have been idle past TTL
    const buffering = jaaDB.query('orion_sessions', r => r.status === 'buffering', 50);
    for (const s of buffering) {
      const lastSeen = s.lastEventAt || s.ts || 0;
      if (now - lastSeen < SESSION_TTL) continue;

      // Measure features
      const features = _measure(s);
      const regime   = _classify(features);

      jaaDB.update('orion_sessions', s.uuid, {
        status:      'measured',
        features,
        regime,
        measuredAt:  now,
      });

      jaaDB.insert('event_log', {
        uuid:     uid(),
        type:     'orion.session.measured',
        payload:  { sessionUuid: s.uuid, calltoId: s.calltoId, regime },
        source:   MODULE_ID,
        causedBy: s.uuid,
        ts:       now,
      });
    }

  } catch (err) {
    jaaDB.insert('failures', { uuid: uid(), source: MODULE_ID, error: err.message, stack: err.stack, ts: Date.now() });
  }
}

function _detectService(msg) {
  const url = msg.url || '';
  if (url.includes('chatgpt') || url.includes('openai')) return 'chatgpt';
  if (url.includes('claude') || url.includes('anthropic')) return 'claude';
  if (url.includes('gemini') || url.includes('bard')) return 'gemini';
  if (msg.type?.includes('ollama') || msg.identity === 'ollama') return 'ollama';
  return msg.identity || 'unknown';
}

function _measure(session) {
  const events = session.events || [];
  const completions = events.filter(e => e.payload?.complete === true);
  const chars       = events.reduce((sum, e) => sum + (e.payload?.chars || 0), 0);
  const latencyMs   = session.lastEventAt
    ? session.lastEventAt - session.ts
    : 0;

  return {
    eventCount:       events.length,
    completionCount:  completions.length,
    totalChars:       chars,
    latencyMs,
    selectorFound:    events.some(e => e.payload?.selectorFound),
    retryCount:       events.filter(e => e.type?.includes('retry')).length,
  };
}

function _classify({ latencyMs, eventCount, completionCount, retryCount }) {
  if (eventCount < 2)       return 'insufficient_data';
  if (latencyMs > 30000)    return 'collapsing';
  if (retryCount >= 2)      return 'degraded_structural';
  if (latencyMs > 10000)    return 'degraded_latency';
  if (completionCount < 1)  return 'degraded_structural';
  return 'stable';
}

module.exports = { init, stop };
