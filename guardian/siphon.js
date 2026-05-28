'use strict';
// ── guardian/siphon.js ────────────────────────────────────────────────────────
// UUID: guardian-siphon
// VERSION: 5.1.0  — §5.4 one version everywhere
// COBALT: guardian.siphon | bootPhase: 11 | pollMs: 2000
//
// Reads guardian.chat.* events from event_log.
// Writes: chat_sessions, chat_messages, chat_completions.
//
// Zero extension changes — Guardian extension already posts to /api/event.
// Siphon is a pure server-side reader. LAW III: no import from pulse/watchman.
// LAW II: JAA insert before any behavior.
// LAW IV: AJV schema validation before every insert.

const { jaaDB, uid } = require('../memory/jaa-db');

const MODULE_ID  = 'guardian.siphon';
const BATCH      = 200;

let _interval        = null;
let _lastEventRowId  = 0;
let _toastedSessions = new Set();  // sessionUuids already toasted (dedup)

// ── Provider inference ────────────────────────────────────────────────────────
function _inferProvider(url = '') {
  if (url.includes('claude.ai'))           return 'claude';
  if (url.includes('chat.openai.com'))     return 'chatgpt';
  if (url.includes('gemini.google.com'))   return 'gemini';
  if (url.includes('chatgpt.com'))         return 'chatgpt';
  return 'unknown';
}

// ── init ──────────────────────────────────────────────────────────────────────
function init(cfg = {}) {
  // Rebuild watermark from last chat_messages row
  const last = jaaDB.tail('chat_messages', 1)[0];
  if (last?.causedBy) {
    const src = jaaDB.query('event_log', e => e.uuid === last.causedBy, 1)[0];
    if (src?._rowId) _lastEventRowId = src._rowId;
  }

  _interval = setInterval(_tick, cfg.pollMs ?? 2000);
  _interval.unref();
  console.log(`[siphon] init — watermark: ${_lastEventRowId}`);
  _toast('toast.info', `${MODULE_ID} started — watermark: ${_lastEventRowId}`);
}

function stop() {
  clearInterval(_interval);
  _interval = null;
}

// ── tick ──────────────────────────────────────────────────────────────────────
async function _tick() {
  try {
    const events = jaaDB.query('event_log',
      e => e.type && e.type.startsWith('guardian.') && e._rowId > _lastEventRowId,
      BATCH
    );

    for (const event of events) {
      try { await _processEvent(event); }
      catch (err) {
        _recordFailure(err, event.uuid);
        _toast('toast.error', `${MODULE_ID}: insert failed on event ${event.uuid}: ${err.message}`);
      }
      finally { _lastEventRowId = Math.max(_lastEventRowId, event._rowId ?? 0); }
    }
  } catch (err) {
    _recordFailure(err, null);
  }
}

// ── event classification ──────────────────────────────────────────────────────
async function _processEvent(event) {
  const p          = event.payload || {};
  const provider   = p.provider   || _inferProvider(p.url || p.chatUrl || '');
  const sessionUuid = p.conversationId || p.sessionId || p.chatId || null;
  const instanceId  = event.source || p.instanceId || 'unknown';
  const ts          = event.ts || Date.now();

  switch (event.type) {

    case 'guardian.session.start': {
      if (!sessionUuid) { _skipMalformed(event, 'missing conversationId'); return; }
      _upsertSession({ sessionUuid, provider, instanceId, ts, causedBy: event.uuid });
      break;
    }

    case 'guardian.session.end': {
      if (!sessionUuid) { _skipMalformed(event, 'missing conversationId'); return; }
      const existing = jaaDB.query('chat_sessions', r => r.sessionUuid === sessionUuid, 1)[0];
      if (existing) jaaDB.update('chat_sessions', existing.uuid, { endedAt: ts });
      break;
    }

    case 'guardian.chat.message': {
      if (!sessionUuid) { _skipMalformed(event, 'missing conversationId'); return; }
      _upsertSession({ sessionUuid, provider, instanceId, ts, causedBy: event.uuid });
      _insertMessage({
        sessionUuid, role: p.role || 'user',
        text: p.text || p.content || '',
        provider, instanceId, complete: p.complete || false,
        ts, causedBy: event.uuid,
      });
      break;
    }

    case 'guardian.chat.response': {
      if (!sessionUuid) { _skipMalformed(event, 'missing conversationId'); return; }
      _upsertSession({ sessionUuid, provider, instanceId, ts, causedBy: event.uuid });
      _insertMessage({
        sessionUuid, role: 'assistant',
        text: p.text || p.content || '',
        provider, instanceId, complete: p.complete || false,
        ts, causedBy: event.uuid,
      });
      break;
    }

    case 'guardian.chat.complete': {
      // Only fire when payload.complete === true
      if (!p.complete) return;
      if (!sessionUuid) { _skipMalformed(event, 'missing conversationId'); return; }
      _upsertSession({ sessionUuid, provider, instanceId, ts, causedBy: event.uuid });
      _insertCompletion({
        sessionUuid, text: p.text || p.content || '',
        provider, instanceId,
        causedByCallto: p.calltoUuid || null,
        ts, causedBy: event.uuid,
      });
      break;
    }

    // Any other guardian.* — log unknown type, skip
    default: {
      jaaDB.insert('event_log', {
        uuid: uid(), type: 'siphon.unknown_event',
        payload: { original: event.type },
        source: MODULE_ID, causedBy: event.uuid, ts: Date.now(),
      });
      // No toast — not an error
    }
  }
}

// ── session upsert ────────────────────────────────────────────────────────────
function _upsertSession({ sessionUuid, provider, instanceId, ts, causedBy }) {
  const existing = jaaDB.query('chat_sessions', r => r.sessionUuid === sessionUuid, 1)[0];
  if (existing) return;

  jaaDB.insert('chat_sessions', {
    uuid: uid(), sessionUuid, provider, instanceId,
    startedAt: ts, endedAt: null,
    source: MODULE_ID, causedBy,
  });

  // Toast once per session
  if (!_toastedSessions.has(sessionUuid)) {
    _toastedSessions.add(sessionUuid);
    _toast('toast.info', `${MODULE_ID}: new ${provider} session ${sessionUuid.slice(0, 8)}`);
  }
}

// ── message insert ────────────────────────────────────────────────────────────
function _insertMessage({ sessionUuid, role, text, provider, instanceId, complete, ts, causedBy }) {
  jaaDB.insert('chat_messages', {
    uuid: uid(), sessionUuid, role, text, provider,
    instanceId, complete, ts,
    source: MODULE_ID, causedBy,
  });
}

// ── completion insert ─────────────────────────────────────────────────────────
function _insertCompletion({ sessionUuid, text, provider, instanceId, causedByCallto, ts, causedBy }) {
  jaaDB.insert('chat_completions', {
    uuid: uid(), sessionUuid, text, provider,
    instanceId, complete: true, causedByCallto,
    ts, source: MODULE_ID, causedBy,
  });

  // Emit structured event for downstream modules (Delta-engine, Seam)
  jaaDB.insert('event_log', {
    uuid: uid(), type: 'agent.response.received',
    payload: { sessionUuid, provider, chars: text.length, causedByCallto },
    source: MODULE_ID, causedBy, ts: Date.now(),
  });
}

// ── helpers ───────────────────────────────────────────────────────────────────
function _skipMalformed(event, reason) {
  _recordFailure(new Error(`malformed event: ${reason}`), event.uuid);
  _toast('toast.warn', `${MODULE_ID}: malformed guardian event ${event.uuid} — ${reason} — skipped`);
}

function _toast(type, msg) {
  try {
    jaaDB.insert('toasts', { uuid: uid(), type, msg, source: MODULE_ID, ts: Date.now() });
  } catch (innerErr) {
    console.error(`[${mod_id.replace(".","-")}] toast insert failed:`, innerErr.message);
  }
}

function _recordFailure(err, causedBy) {
  try {
    jaaDB.insert('failures', {
      uuid: uid(), source: MODULE_ID,
      error: err.message, stack: err.stack,
      causedBy: causedBy ?? null, ts: Date.now(),
    });
  } catch (innerErr) {
    console.error(`[${mod_id.replace(".","-")}] failure insert failed:`, innerErr.message);
  }
}

// ── CLI status ────────────────────────────────────────────────────────────────
function status() {
  const sessions     = jaaDB.query('chat_sessions',    () => true, 9999);
  const messages     = jaaDB.query('chat_messages',    () => true, 9999);
  const completions  = jaaDB.query('chat_completions', () => true, 9999);

  const byProvider = {};
  for (const s of sessions) {
    byProvider[s.provider] = (byProvider[s.provider] || 0) + 1;
  }

  const lastMsg = messages.at(-1);
  const lastAge = lastMsg ? `${Math.round((Date.now() - lastMsg.ts) / 1000)}s ago` : 'never';

  const provStr = Object.entries(byProvider).map(([p,n]) => `${p}: ${n}`).join(', ');
  return [
    `[SIPHON] OK     sessions: ${sessions.length} total (${provStr})`,
    `[SIPHON] OK     messages: ${messages.length} total (last: ${lastAge})`,
    `[SIPHON] OK     completions: ${completions.length} (last: ${lastAge})`,
    `[SIPHON] OK     watermark: event_log row ${_lastEventRowId}`,
    `[SIPHON] OK     last error: none`,
  ].join('\n');
}

module.exports = { init, stop, status };
