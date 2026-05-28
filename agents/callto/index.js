'use strict';
// ── agents/callto/index.js ────────────────────────────────────────────────────
// UUID: agents-callto
// VERSION: 5.1.0  — §5.4 one version everywhere
// COBALT: agents.callto | bootPhase: 8 | pollMs: 2000
//
// THE IPC BRIDGE — agent endpoint polling model.
//
// This module is the integration point between Nexus-Cobalt and Guardian v8.
// Communication is entirely via HTTP polling — no shared memory, no imports.
//
// FLOW (Nexus → Guardian):
//   1. Any module inserts agent_calls row with routedTo='guardian-claude' | 'guardian-chatgpt'
//   2. Callto-executor polls agent_calls every 2s
//   3. On pending row: checks guardian_health (Watchman must confirm connected)
//   4. If healthy: POSTs GUARDIAN_EXECUTE_INTENT to Guardian at POST /api/complete
//   5. Guardian dispatches to WSS tab, returns response
//   6. Callto-executor writes result back to agent_calls + cortex_memory
//   7. Posts guardian.chat.complete to event_log → Siphon picks it up
//
// FLOW (Guardian → Nexus):
//   Guardian v8 polls GET /api/agent-poll?status=pending from Nexus admin server
//   When Guardian completes a job it POSTs back to POST /api/event with guardian.chat.complete
//   Siphon ingests → chat_completions row → Callto marks agent_calls complete
//
// LAW I: If Guardian unavailable → RAID fallback to Ollama/Claude API
// LAW III: reads guardian_health, does NOT import watchman.js directly

const http   = require('http');
const https  = require('https');
const { jaaDB, uid } = require('../../memory/jaa-db');

const MODULE_ID = 'agents.callto';
const BATCH     = 5;

// Guardian v8 coordinates — env-configurable
const GUARDIAN_HOST = process.env.GUARDIAN_HOST || '127.0.0.1';
const GUARDIAN_PORT = parseInt(process.env.GUARDIAN_PORT || '7820');
const GUARDIAN_URL  = `http://${GUARDIAN_HOST}:${GUARDIAN_PORT}`;

let _interval = null;
let _cfg      = {};

// ── init ──────────────────────────────────────────────────────────────────────
function init(cfg = {}) {
  _cfg = cfg;
  _interval = setInterval(_tick, cfg.pollMs ?? 2000);
  _interval.unref();
  console.log(`[callto] init — Guardian at ${GUARDIAN_URL}`);
  _toast('toast.agent', `${MODULE_ID} started — bridge: ${GUARDIAN_URL}`);
}

function stop() {
  clearInterval(_interval);
  _interval = null;
}

// ── tick ──────────────────────────────────────────────────────────────────────
async function _tick() {
  try {
    // Read pending guardian-routed calls
    const pending = jaaDB.query('agent_calls',
      r => (r.routedTo === 'guardian-claude' || r.routedTo === 'guardian-chatgpt' || r.routedTo === 'guardian-gemini')
        && r.status === 'routed',
      BATCH
    );
    if (!pending.length) return;

    // Check Guardian health before dispatching
    const health = jaaDB.tail('guardian_health', 1)[0];
    const guardianOk = health?.connected && (health.healthScore ?? 0) >= 0.3;

    for (const call of pending) {
      // Claim the row
      jaaDB.update('agent_calls', call.uuid, {
        status:       'processing',
        dispatchedBy: MODULE_ID,
        dispatchedAt: Date.now(),
      });
      // Verify claim (optimistic lock pattern)
      const claimed = jaaDB.get('agent_calls', call.uuid);
      if (!claimed || claimed.dispatchedBy !== MODULE_ID) continue;

      if (!guardianOk) {
        await _fallback(call, health);
      } else {
        await _dispatchToGuardian(call);
      }
    }
  } catch (err) {
    _recordFailure(err, null);
  }
}

// ── dispatch to Guardian v8 via /api/complete ─────────────────────────────────
async function _dispatchToGuardian(call) {
  const service = call.routedTo.replace('guardian-', ''); // 'claude' | 'chatgpt' | 'gemini'

  try {
    const result = await _post(`${GUARDIAN_URL}/api/complete`, {
      service,
      prompt:      call.prompt || call.content || '',
      temperature: call.temperature ?? 0.15,
      maxTokens:   call.maxTokens   ?? 4096,
      calltoUuid:  call.uuid,    // Guardian embeds this in chat.complete payload → Siphon links it
      stream:      false,
      // §4.3 — send IPC token when configured (set GUARDIAN_IPC_TOKEN env var on both sides)
      ipcToken:    process.env.GUARDIAN_IPC_TOKEN || undefined,
    }, 90_000);

    const text = result.content || result.text || result.response || '';

    jaaDB.update('agent_calls', call.uuid, {
      status:      'complete',
      result:      text,
      completedAt: Date.now(),
    });

    // Write to cortex_memory
    jaaDB.insert('cortex_memory', {
      uuid:    uid(),
      content: text,
      tags:    ['guardian', service, 'callto'],
      source:  MODULE_ID,
      causedBy: call.uuid,
      ts:      Date.now(),
    });

    // Emit event so Siphon and Delta-engine pick it up
    jaaDB.insert('event_log', {
      uuid:    uid(),
      type:    'guardian.chat.complete',
      payload: {
        text, complete: true,
        conversationId: result.chatId || call.sessionId || null,
        provider:       service,
        calltoUuid:     call.uuid,
      },
      source:   MODULE_ID,
      causedBy: call.uuid,
      ts:       Date.now(),
    });

    _toast('toast.agent', `${MODULE_ID}: guardian-${service} complete (${text.length} chars)`);

  } catch (err) {
    jaaDB.update('agent_calls', call.uuid, {
      status: 'failed',
      error:  `Guardian dispatch failed: ${err.message}`,
    });
    _recordFailure(err, call.uuid);
    _toast('toast.error', `${MODULE_ID}: guardian-${service} dispatch failed: ${err.message}`);

    // Log LAW I fallback event
    jaaDB.insert('event_log', {
      uuid:    uid(),
      type:    'callto.guardian.fallback',
      payload: { callUuid: call.uuid, reason: err.message, service },
      source:  MODULE_ID,
      causedBy: call.uuid,
      ts:      Date.now(),
    });
  }
}

// ── LAW I fallback — Guardian unavailable ─────────────────────────────────────
async function _fallback(call, health) {
  const reason = !health ? 'no health record'
               : !health.connected ? 'Guardian disconnected'
               : `Guardian health too low (${(health.healthScore||0).toFixed(2)})`;

  // Re-route to ollama (LAW I: local first)
  jaaDB.update('agent_calls', call.uuid, {
    status:   'routed',
    routedTo: 'ollama',
    error:    null,
    notes:    `re-routed from ${call.routedTo} — ${reason}`,
  });

  jaaDB.insert('event_log', {
    uuid:    uid(),
    type:    'callto.guardian.fallback',
    payload: { callUuid: call.uuid, reason, originalRoute: call.routedTo, reroutedTo: 'ollama' },
    source:  MODULE_ID,
    causedBy: call.uuid,
    ts:      Date.now(),
  });

  _toast('toast.warn', `${MODULE_ID}: Guardian unavailable (${reason}) — LAW I fallback to ollama`);
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────
function _post(url, body, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const lib = isHttps ? https : http;
    const bodyStr = JSON.stringify(body);

    const req = lib.request({
      hostname: parsed.hostname,
      port:     parseInt(parsed.port) || (isHttps ? 443 : 80),
      path:     parsed.pathname,
      method:   'POST',
      headers:  {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
      },
    }, (res) => {
      let raw = '';
      res.on('data', d => { raw += d; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`HTTP ${res.statusCode}: ${raw.slice(0, 200)}`));
        }
        try { resolve(JSON.parse(raw)); }
        catch { resolve({ content: raw }); }
      });
    });

    req.setTimeout(timeoutMs, () => { req.destroy(new Error(`timeout after ${timeoutMs}ms`)); });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

// ── helpers ───────────────────────────────────────────────────────────────────
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
  } catch (innerErr) { console.error("[guardian-layer] inner failure:", innerErr.message); }
}

// ── dispatch API — external callers use this ──────────────────────────────────
// Insert an agent_calls row routed to a guardian-* agent.
// Returns the inserted row.
async function dispatch({ service = 'claude', prompt, sessionId = null, temperature, maxTokens } = {}) {
  const row = jaaDB.insert('agent_calls', {
    uuid:      uid(),
    routedTo:  `guardian-${service}`,
    prompt:    prompt || '',
    sessionId: sessionId || null,
    status:    'routed',
    temperature: temperature ?? 0.15,
    maxTokens:   maxTokens   ?? 4096,
    source:    MODULE_ID,
    causedBy:  null,
    ts:        Date.now(),
  });

  jaaDB.insert('event_log', {
    uuid:    uid(),
    type:    'GUARDIAN_EXECUTE_INTENT',
    payload: { callUuid: row.uuid, service, promptLen: prompt?.length || 0 },
    source:  MODULE_ID,
    causedBy: row.uuid,
    ts:      Date.now(),
  });

  return row;
}

// ── CLI status ────────────────────────────────────────────────────────────────
function status() {
  const calls = jaaDB.query('agent_calls',
    r => r.routedTo && r.routedTo.startsWith('guardian-'), 9999
  );
  const byStatus = {};
  for (const c of calls) byStatus[c.status] = (byStatus[c.status]||0)+1;
  const health = jaaDB.tail('guardian_health',1)[0];
  return [
    `[CALLTO]  OK     Guardian bridge: ${GUARDIAN_URL}`,
    `[CALLTO]  OK     guardian_health: connected=${health?.connected} score=${(health?.healthScore||0).toFixed(2)}`,
    `[CALLTO]  OK     agent_calls: ${calls.length} total — ${JSON.stringify(byStatus)}`,
  ].join('\n');
}

module.exports = { init, stop, status, dispatch };
