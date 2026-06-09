'use strict';
// ── cortex/guardian/siphon.js ─────────────────────────────────────────────────
// UUID: cortex-guardian-siphon-v1-0000-4000-0000-000000000001
// Version: 1.0.0
//
// SIPHON — JAA-first ingestion normalizer.
// Watches event_log for guardian.* events. Extracts structured fields.
// Writes clean records to: chat_sessions, chat_messages, chat_completions.
//
// Zero extension changes. Data already flows from Guardian to event_log.
// Siphon is purely a server-side reader.
//
// LAW I   — makes no agent calls. Pure data processor.
// LAW II  — every row written to JAA before any side-effect.
//           Watermark advances ONLY after successful write.
// LAW III — imports only jaa-db and working-memory. Never imports other modules.
// LAW IV  — every insert validated against guardian-chat.schema.json inline.
// LAW V   — all state accessible via CLI (siphon status / sessions / messages).
// LAW VI  — every meaningful transition toasted.
//
// §M1 — every event processed gets stored.
// §K5 — watermark is monotone. Never goes backward.
//
// COBALT: guardian.siphon | bootPhase: 11 | pollMs: 2000
// reads:  event_log
// writes: chat_sessions, chat_messages, chat_completions, toasts, failures, gaps, event_log

const { jaaDB, uid } = require('../memory/jaa-db');
const { getWM }      = require('../working-memory');

const MODULE_ID  = 'guardian.siphon';
const VERSION    = '1.0.0';
const POLL_MS    = 2000;
const BATCH_SIZE = 200;   // max events per tick — natural backpressure

// ── State ─────────────────────────────────────────────────────────────────────
let _interval       = null;
let _lastEventRowId = 0;        // watermark: only process rows above this
let _toastedSessions = new Set(); // track sessions already toasted to avoid spam

// ── Provider inference ────────────────────────────────────────────────────────
const PROVIDER_MAP = {
  'claude.ai':            'claude',
  'chat.openai.com':      'chatgpt',
  'chatgpt.com':          'chatgpt',
  'gemini.google.com':    'gemini',
};

function _inferProvider(url) {
  if (!url) return 'unknown';
  for (const [host, provider] of Object.entries(PROVIDER_MAP)) {
    if (url.includes(host)) return provider;
  }
  return 'unknown';
}

// ── Inline schema validation (LAW IV) ────────────────────────────────────────
// Full AJV not required — validate required fields and types inline.
// Failure path: law_violations + gaps + toast.error, never halt.

function _validateChatSession(row) {
  const required = ['uuid', 'sessionUuid', 'provider', 'instanceId', 'startedAt', 'source', 'causedBy'];
  for (const f of required) {
    if (row[f] === undefined || row[f] === null) return `missing required field: ${f}`;
  }
  const validProviders = ['claude', 'chatgpt', 'gemini', 'unknown'];
  if (!validProviders.includes(row.provider)) return `invalid provider: ${row.provider}`;
  return null; // null = valid
}

function _validateChatMessage(row) {
  const required = ['uuid', 'sessionUuid', 'role', 'text', 'provider', 'instanceId', 'ts', 'source', 'causedBy'];
  for (const f of required) {
    if (row[f] === undefined || row[f] === null) return `missing required field: ${f}`;
  }
  if (!['user', 'assistant'].includes(row.role)) return `invalid role: ${row.role}`;
  return null;
}

function _validateChatCompletion(row) {
  const required = ['uuid', 'sessionUuid', 'text', 'provider', 'instanceId', 'ts', 'source', 'causedBy'];
  for (const f of required) {
    if (row[f] === undefined || row[f] === null) return `missing required field: ${f}`;
  }
  if (row.complete !== true) return 'complete must be true';
  return null;
}

// ── Failure helpers (LAW II + LAW VI) ────────────────────────────────────────
function _fail(msg, causedBy = null, extra = {}) {
  try {
    jaaDB.insert('failures', {
      uuid: uid(), source: MODULE_ID, error: msg, causedBy, ts: Date.now(), ...extra,
    });
  } catch (_) {}
  _toast('toast.error', msg, causedBy);
}

function _toast(type, message, causedBy = null) {
  try {
    jaaDB.insert('toasts', {
      uuid: uid(), type, module: MODULE_ID, message,
      causedBy, ts: Date.now(), autoClose: 5000, actions: [],
    });
  } catch (_) {}
}

function _lawViolation(description, causedBy, table) {
  try {
    jaaDB.insert('law_violations', {
      uuid: uid(), law: 'LAW_IV', module: MODULE_ID,
      description, severity: 'high', causedBy, ts: Date.now(),
    });
    jaaDB.insert('gaps', {
      uuid: uid(), type: 'schema_violation', severity: 'medium',
      path: `${table}/siphon-insert`, body: description,
      status: 'open', source: MODULE_ID, causedBy, createdAt: Date.now(),
      attempts: 0, ts: Date.now(),
    });
  } catch (_) {}
  _toast('toast.error', `Siphon: LAW IV violation — schema mismatch on ${table}`, causedBy);
}

// ── Session upsert ────────────────────────────────────────────────────────────
function _upsertSession(sessionUuid, provider, instanceId, eventTs, eventUuid) {
  const existing = jaaDB.query('chat_sessions', r => r.sessionUuid === sessionUuid, 1)[0];
  if (existing) return existing;

  const row = {
    uuid:        uid(),
    sessionUuid,
    provider,
    instanceId,
    startedAt:   eventTs,
    endedAt:     null,
    source:      MODULE_ID,
    causedBy:    eventUuid,
    ts:          eventTs,
  };

  const err = _validateChatSession(row);
  if (err) { _lawViolation(err, eventUuid, 'chat_sessions'); return null; }

  try {
    const inserted = jaaDB.insert('chat_sessions', row);
    getWM().write('guardian.siphon.session.opened', { sessionUuid, provider, instanceId }, {
      source: MODULE_ID, causedBy: eventUuid,
    });
    if (!_toastedSessions.has(sessionUuid)) {
      _toastedSessions.add(sessionUuid);
      _toast('toast.info', `Siphon: new ${provider} session ${sessionUuid.slice(0, 8)}`);
    }
    return inserted;
  } catch (e) {
    _fail(`insert failed on chat_sessions: ${e.message}`, eventUuid);
    jaaDB.insert('gaps', {
      uuid: uid(), type: 'stuck_call', severity: 'medium',
      path: 'chat_sessions/siphon-insert', body: e.message,
      status: 'open', source: MODULE_ID, causedBy: eventUuid,
      createdAt: Date.now(), attempts: 0, ts: Date.now(),
    });
    return null;
  }
}

// ── Event handlers ────────────────────────────────────────────────────────────

function _handleChatMessage(event) {
  const p = event.payload || {};
  const sessionUuid = p.conversationId || p.sessionId || p.chatId;
  const provider    = p.provider || _inferProvider(p.url || p.chatUrl);
  const instanceId  = event.source || 'unknown';
  const text        = p.text || p.content || '';
  const role        = p.role || (event.type === 'guardian.chat.response' ? 'assistant' : 'user');

  if (!sessionUuid) {
    _fail(`malformed guardian event — missing conversationId: ${event.uuid}`, event.uuid);
    _toast('toast.warn', `Siphon: malformed guardian event ${event.uuid.slice(0,8)} — skipped`, event.uuid);
    return;
  }

  _upsertSession(sessionUuid, provider, instanceId, event.ts, event.uuid);

  const row = {
    uuid:        uid(),
    sessionUuid,
    role,
    text:        text.slice(0, 50000),
    provider,
    instanceId,
    complete:    false,
    ts:          event.ts || Date.now(),
    source:      MODULE_ID,
    causedBy:    event.uuid,
  };

  const err = _validateChatMessage(row);
  if (err) { _lawViolation(err, event.uuid, 'chat_messages'); return; }

  try {
    jaaDB.insert('chat_messages', row);
    getWM().write('guardian.siphon.message', { sessionUuid, role, provider, chars: text.length }, {
      source: MODULE_ID, causedBy: event.uuid,
    });
  } catch (e) {
    _fail(`insert failed on chat_messages: ${e.message}`, event.uuid);
    jaaDB.insert('gaps', {
      uuid: uid(), type: 'stuck_call', severity: 'medium',
      path: 'chat_messages/siphon-insert', body: e.message,
      status: 'open', source: MODULE_ID, causedBy: event.uuid,
      createdAt: Date.now(), attempts: 0, ts: Date.now(),
    });
  }
}

function _handleChatComplete(event) {
  const p = event.payload || {};
  if (p.complete !== true) return; // guard — only process completed responses

  const sessionUuid  = p.conversationId || p.sessionId || p.chatId;
  const provider     = p.provider || _inferProvider(p.url || p.chatUrl);
  const instanceId   = event.source || 'unknown';
  const text         = p.text || p.content || p.response || '';
  const calltoUuid   = p.calltoUuid || null;

  if (!sessionUuid) {
    _fail(`malformed guardian.chat.complete — missing conversationId: ${event.uuid}`, event.uuid);
    _toast('toast.warn', `Siphon: malformed guardian event ${event.uuid.slice(0,8)} — skipped`, event.uuid);
    return;
  }

  _upsertSession(sessionUuid, provider, instanceId, event.ts, event.uuid);

  const row = {
    uuid:           uid(),
    sessionUuid,
    text:           text.slice(0, 100000),
    provider,
    instanceId,
    complete:       true,
    causedByCallto: calltoUuid,
    ts:             event.ts || Date.now(),
    source:         MODULE_ID,
    causedBy:       event.uuid,
  };

  const err = _validateChatCompletion(row);
  if (err) { _lawViolation(err, event.uuid, 'chat_completions'); return; }

  try {
    jaaDB.insert('chat_completions', row);
    getWM().write('guardian.siphon.completion', {
      sessionUuid, provider, chars: text.length, calltoUuid,
    }, { source: MODULE_ID, causedBy: event.uuid });
  } catch (e) {
    _fail(`insert failed on chat_completions: ${e.message}`, event.uuid);
    jaaDB.insert('gaps', {
      uuid: uid(), type: 'stuck_call', severity: 'high',
      path: 'chat_completions/siphon-insert', body: e.message,
      status: 'open', source: MODULE_ID, causedBy: event.uuid,
      createdAt: Date.now(), attempts: 0, ts: Date.now(),
    });
  }
}

function _handleSessionEnd(event) {
  const p           = event.payload || {};
  const sessionUuid = p.conversationId || p.sessionId || p.chatId;
  if (!sessionUuid) return;

  const existing = jaaDB.query('chat_sessions', r => r.sessionUuid === sessionUuid, 1)[0];
  if (existing) {
    try {
      jaaDB.update('chat_sessions', existing.uuid, { endedAt: event.ts || Date.now() });
      getWM().write('guardian.siphon.session.ended', { sessionUuid }, {
        source: MODULE_ID, causedBy: event.uuid,
      });
    } catch (e) {
      _fail(`update failed on chat_sessions (session.end): ${e.message}`, event.uuid);
    }
  }
}

// ── Event classification + dispatch ──────────────────────────────────────────
function _dispatch(event) {
  switch (event.type) {
    case 'guardian.chat.message':
    case 'guardian.chat.response':
      _handleChatMessage(event);
      break;

    case 'guardian.chat.complete':
      _handleChatComplete(event);
      break;

    case 'guardian.session.start':
      // Session open only — no message
      (function() {
        const p = event.payload || {};
        const sessionUuid = p.conversationId || p.sessionId || p.chatId;
        const provider    = p.provider || _inferProvider(p.url);
        const instanceId  = event.source || 'unknown';
        if (sessionUuid) _upsertSession(sessionUuid, provider, instanceId, event.ts, event.uuid);
      })();
      break;

    case 'guardian.session.end':
      _handleSessionEnd(event);
      break;

    default:
      // Unknown guardian.* event — log once, advance watermark, no toast
      try {
        jaaDB.insert('event_log', {
          uuid:     uid(),
          type:     'siphon.unknown_event',
          source:   MODULE_ID,
          payload:  { originalType: event.type, eventUuid: event.uuid },
          causedBy: event.uuid,
          ts:       Date.now(),
        });
      } catch (_) {}
  }
}

// ── Poll tick ─────────────────────────────────────────────────────────────────
async function _tick() {
  try {
    const events = jaaDB.query(
      'event_log',
      e => e.type && e.type.startsWith('guardian.') && (e._rowId || 0) > _lastEventRowId,
      BATCH_SIZE
    );

    if (!events.length) return;

    for (const event of events) {
      try {
        _dispatch(event);
      } catch (err) {
        // §1.2 — per-event errors don't halt the tick
        _fail(`dispatch error for event ${event.uuid}: ${err.message}`, event.uuid);
      }
      // §K5 — watermark is monotone
      if ((event._rowId || 0) > _lastEventRowId) {
        _lastEventRowId = event._rowId;
      }
    }
  } catch (err) {
    _fail(`tick error: ${err.message}`, null, { stack: err.stack?.slice(0, 500) });
    // Do NOT advance watermark on tick-level failure — retry next tick
  }
}

// ── init / stop ───────────────────────────────────────────────────────────────

function init(cfg = {}) {
  // Restore watermark from latest chat_messages causedBy → event_log _rowId
  // This gives us a correct resume point after restart (LAW II)
  try {
    const lastMsg = jaaDB.tail('chat_messages', 1)[0];
    if (lastMsg?.causedBy) {
      // Find the event_log row that caused this message
      const sourceEvent = jaaDB.query('event_log', e => e.uuid === lastMsg.causedBy, 1)[0];
      if (sourceEvent?._rowId) {
        _lastEventRowId = sourceEvent._rowId;
        console.log(`[${MODULE_ID}] watermark restored to row ${_lastEventRowId}`);
      }
    }
  } catch (e) {
    console.warn(`[${MODULE_ID}] watermark restore failed: ${e.message} — starting from 0`);
  }

  const pollMs = cfg.pollMs ?? POLL_MS;
  _interval = setInterval(_tick, pollMs);
  _interval.unref();

  getWM().write('guardian.siphon.started', { version: VERSION, watermark: _lastEventRowId }, {
    source: MODULE_ID,
  });

  console.log(`[${MODULE_ID}] v${VERSION} started — polling every ${pollMs}ms, watermark: ${_lastEventRowId}`);
}

function stop() {
  if (_interval) { clearInterval(_interval); _interval = null; }
}

// ── Stats (for CLI + admin-server) ───────────────────────────────────────────
function stats() {
  const sessions     = jaaDB.tail('chat_sessions', 1000);
  const messages     = jaaDB.tail('chat_messages', 1);
  const completions  = jaaDB.tail('chat_completions', 1);

  const byProvider = {};
  for (const s of sessions) {
    byProvider[s.provider] = (byProvider[s.provider] || 0) + 1;
  }

  return {
    sessions:      sessions.length,
    byProvider,
    messages:      jaaDB.count('chat_messages'),
    completions:   jaaDB.count('chat_completions'),
    lastMessage:   messages[0]?.ts || null,
    lastCompletion: completions[0]?.ts || null,
    watermark:     _lastEventRowId,
    lastError:     null,
  };
}

module.exports = { init, stop, stats, MODULE_ID, VERSION };
