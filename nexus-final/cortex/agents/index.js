'use strict';
// ── agents/index.js ───────────────────────────────────────────────────────────
// UUID: mod-agents-v5-0000-4000-0000-000000000001
//
// Agent dispatcher. Reads agent_calls where status='routed'.
// Delegates to the specific agent sub-module by routedTo field.
// Does not know about agent internals — §5.7 low coupling.
//
// §M1: init(cfg) + stop().
// §M2: reads: agent_calls, bridge_messages. writes: agent_calls (status).
// §M3: pollMs from cfg.

const { jaaDB, uid } = require('../memory/jaa-db');

const MODULE_ID = 'agents';

let _interval  = null;
let _cfg       = {};
let _subAgents = {}; // populated by setDeps()

function init(cfg = {}) {
  _cfg      = cfg;
  _interval = setInterval(_tick, _cfg.pollMs ?? 2000);
  _interval.unref();
}

function stop() {
  clearInterval(_interval);
  _interval = null;
}

// setDeps — called by boot before pollRegistry.start()
function setDeps({ ollama, claude, chatgpt, gemini } = {}) {
  _subAgents = { ollama, claude, chatgpt, gemini };
}

async function _tick() {
  try {
    const routed = jaaDB.query('agent_calls', r => r.status === 'routed', 10);
    if (!routed.length) return;

    for (const call of routed) {
      // Claim
      jaaDB.update('agent_calls', call.uuid, {
        status:       'processing',
        dispatchedBy: MODULE_ID,
        dispatchedAt: Date.now(),
      });

      const re = jaaDB.get('agent_calls', call.uuid);
      if (!re || re.dispatchedBy !== MODULE_ID) continue;

      const agent = _subAgents[call.routedTo];
      if (!agent) {
        jaaDB.update('agent_calls', call.uuid, {
          status: 'failed',
          error:  `No sub-agent registered for '${call.routedTo}'`,
        });
        jaaDB.insert('failures', {
          uuid:   uid(),
          source: MODULE_ID,
          error:  `No sub-agent for '${call.routedTo}'`,
          ts:     Date.now(),
        });
        continue;
      }

      // Delegate — sub-agent takes ownership of the call from here
      try {
        await agent.dispatch(call);
      } catch (err) {
        jaaDB.update('agent_calls', call.uuid, { status: 'failed', error: err.message });
        jaaDB.insert('failures', { uuid: uid(), source: MODULE_ID, error: err.message, stack: err.stack, ts: Date.now() });
      }
    }
  } catch (err) {
    jaaDB.insert('failures', { uuid: uid(), source: MODULE_ID, error: err.message, stack: err.stack, ts: Date.now() });
  }
}

module.exports = { init, stop, setDeps };
