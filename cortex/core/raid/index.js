'use strict';
// ── core/raid/index.js ────────────────────────────────────────────────────────
// UUID: mod-raid-v5-0000-4000-0000-000000000001
// SEAM 2 — ROUTING_CONTRACT
// ESS-backed routing: functions are content-addressed hashes, not strings.
// callto:hash is permanent truth. callto:role resolves via current binding.
// UNRESOLVE events → gap.found in JAA → healer picks up.
// Binding log in JAA → full routing history, replayable.
//
// RAID — Routing and Agent Intelligence Dispatcher
// Memory-first v5.0. Reads agent_calls. Routes to the right agent.
//
// LAW I (LOCAL_FIRST): Ollama evaluated first. Cloud agents are fallback only.
// §M1: init(cfg) + stop() only.
// §M2: reads: agent_calls, bep_patterns, crystals. writes: agent_calls (status update).
// §M3: pollMs from cfg.

const { jaaDB, uid }  = require('../../memory/jaa-db');
const { ESSKernel }   = require('../../lib/ess');

// ESS kernel — singleton per process
// §LAW II: binding_log persisted to JAA-adjacent file
const _ess = new ESSKernel({
  bindingLogPath: require('path').join(__dirname, '../../../data/cortex/ledger/ess-bindings.ndjson'),
  hashStorePath:  require('path').join(__dirname, '../../../data/cortex/ledger/ess-hashes.json'),
});

// Register agent functions as ESS hashes on first init
function _initESSBindings() {
  // Each agent module becomes a hash-addressed function
  // LAW I order: ollama first
  const agents = ['ollama', 'guardian-claude', 'guardian-chatgpt', 'claude', 'chatgpt'];
  for (const agentName of agents) {
    if (_ess.hasRole(agentName)) continue; // already bound from log replay
    try {
      const agentPath = require.resolve(`../agents/${agentName}/index`);
      const agentFn   = async (call) => {
        const agent = require(agentPath);
        return agent.dispatch(call);
      };
      const hash = _ess.write(agentName, agentFn, {
        input:  { required: ['uuid', 'prompt'] },
        output: { type: 'object' },
      });
      _ess.bind(agentName, hash);
      // §LAW II — log the binding to JAA
      try { jaaDB.insert('event_log', { uuid: uid(), type: 'raid.ess.bind',
        payload: JSON.stringify({ role: agentName, hash }), ts: Date.now() }); } catch(_) {}
    } catch(e) {
      // Agent not available — will UNRESOLVE and trigger LAW_I fallback
    }
  }
}

// UNRESOLVE → gap.found in JAA
_ess.on('ess:unresolve', (evt) => {
  try {
    jaaDB.insert('gaps', {
      uuid: uid(), type: 'raid_unresolve', path: 'raid/ess',
      body: `ESS UNRESOLVE: role "${evt.role}" — ${evt.reason}`,
      severity: 'medium', status: 'open', source: 'raid',
      causedBy: null, createdAt: Date.now(), attempts: 0, ts: Date.now(),
    });
  } catch(_) {}
});

const MODULE_ID = 'raid';

let _interval = null;
let _cfg      = {};

// Priority order — LAW I: local first
const AGENT_PRIORITY = ['ollama', 'claude', 'chatgpt', 'gemini'];

function init(cfg = {}) {
  _cfg      = cfg;
  _initESSBindings(); // Register agent hashes in ESS kernel (SEAM 2)
  _interval = setInterval(_tick, _cfg.pollMs ?? 3000);
  _interval.unref();
}

function stop() {
  clearInterval(_interval);
  _interval = null;
}

async function _tick() {
  try {
    // Read pending agent calls
    const pending = jaaDB.query('agent_calls', r => r.status === 'pending', 20);
    if (!pending.length) return;

    // Read routing context
    const patterns = jaaDB.tail('bep_patterns', 20);
    const crystals = jaaDB.tail('crystals', 20);

    for (const call of pending) {
      // Claim
      jaaDB.update('agent_calls', call.uuid, { status: 'processing', claimedBy: MODULE_ID, claimedAt: Date.now() });

      // Re-read to confirm claim (anti-race)
      const claimed = jaaDB.get('agent_calls', call.uuid);
      if (!claimed || claimed.claimedBy !== MODULE_ID) continue;

      try {
        const route = _route(call, patterns, crystals);

        jaaDB.update('agent_calls', call.uuid, {
          status:      'dispatched',
          routedTo:    route.agent,
          routeReason: route.reason,
          routedAt:    Date.now(),
        });

        jaaDB.insert('event_log', {
          uuid:     uid(),
          type:     'raid.dispatched',
          payload:  { callUuid: call.uuid, agent: route.agent, reason: route.reason },
          source:   MODULE_ID,
          causedBy: call.uuid,
          ts:       Date.now(),
        });

        // Dispatch to agent module
        _dispatch(call, route.agent).catch(err => {
          jaaDB.update('agent_calls', call.uuid, { status: 'failed', error: err.message });
          jaaDB.insert('failures', { uuid: uid(), source: MODULE_ID, error: err.message, stack: err.stack, ts: Date.now() });
        });

      } catch (err) {
        jaaDB.update('agent_calls', call.uuid, {
          status: 'failed',
          error:  err.message,
        });
        jaaDB.insert('failures', {
          uuid:   uid(),
          source: MODULE_ID,
          error:  err.message,
          stack:  err.stack,
          ts:     Date.now(),
        });
      }
    }
  } catch (err) {
    jaaDB.insert('failures', {
      uuid:   uid(),
      source: MODULE_ID,
      error:  err.message,
      stack:  err.stack,
      ts:     Date.now(),
    });
  }
}

function _route(call, patterns, crystals) {
  const preferred = call.preferredAgent?.toLowerCase();

  // LAW I: ollama first, unless explicitly overridden by caller
  if (!preferred || preferred === 'ollama') {
    return { agent: 'ollama', reason: 'LAW_I_local_first' };
  }

  if (AGENT_PRIORITY.includes(preferred)) {
    return { agent: preferred, reason: 'caller_preference' };
  }

  // Pattern matching from bep_patterns
  if (patterns.length) {
    const match = patterns.find(p => call.intent?.includes(p.keyword));
    if (match) return { agent: match.agent || 'ollama', reason: `bep_pattern:${match.keyword}` };
  }

  return { agent: 'ollama', reason: 'default_local_first' };
}

async function _dispatch(call, agentName) {
  // Try ESS callto first — hash-based, content-addressed
  if (_ess.hasRole(agentName)) {
    const r = await _ess.callto(agentName, call);
    if (r.resolved) {
      jaaDB.update('agent_calls', call.uuid, {
        status: 'complete', response: JSON.stringify(r.output),
        completedAt: Date.now(), routeMethod: 'ess:callto',
      });
      return r.output;
    }
    // UNRESOLVE — fall through to direct dispatch, log the gap
    jaaDB.insert('event_log', { uuid: uid(), type: 'raid.ess.unresolve',
      payload: JSON.stringify({ role: agentName, reason: r.reason, callId: call.uuid }),
      ts: Date.now() }).catch(() => {});
  }
  // Direct dispatch (fallback when ESS binding missing)
  // Lazy-load agent to avoid circular deps
  let agent;
  try {
    agent = require(`../agents/${agentName}`);
  } catch(_) {
    // Agent not available — mark call as pending for external dispatch
    jaaDB.update('agent_calls', call.uuid, { status: 'pending_external', routedTo: agentName });
    return;
  }

  const result = await agent.dispatch({
    uuid:   call.uuid,
    prompt: call.prompt,
    intent: call.intent,
    context: call.context,
  });

  jaaDB.update('agent_calls', call.uuid, {
    status:      'complete',
    response:    result.text || result.response || '',
    completedAt: Date.now(),
  });

  jaaDB.insert('event_log', {
    uuid:     uid(),
    type:     'raid.complete',
    payload:  { callUuid: call.uuid, agent: agentName, chars: (result.text||'').length },
    source:   MODULE_ID,
    causedBy: call.uuid,
    ts:       Date.now(),
  });
}

module.exports = { init, stop };
