'use strict';
// ── orion/verify.js ───────────────────────────────────────────────────────────
// ORION §A2 — verify. Fourth and final stage.
// Reads orion_sessions where status='policy_applied'. Cross-checks active_traces.

const { jaaDB, uid } = require('../memory/jaa-db');
const MODULE_ID = 'orion/verify';
let _interval = null;

function init(cfg = {}) {
  _interval = setInterval(_tick, cfg.pollMs ?? 3000);
  _interval.unref();
}
function stop() { clearInterval(_interval); _interval = null; }

async function _tick() {
  try {
    const sessions = jaaDB.query('orion_sessions', r => r.status === 'policy_applied', 20);
    for (const s of sessions) {
      jaaDB.update('orion_sessions', s.uuid, { status: 'verifying', claimedBy: MODULE_ID });
      const claimed = jaaDB.get('orion_sessions', s.uuid);
      if (!claimed || claimed.claimedBy !== MODULE_ID) continue;

      // Verify trace was written
      const trace = jaaDB.query('active_traces', r => r.sessionUuid === s.uuid, 1);
      const ok    = trace.length > 0;

      jaaDB.update('orion_sessions', s.uuid, {
        status:     ok ? 'verified' : 'failed',
        verifiedAt: Date.now(),
        verifyOk:   ok,
        verifyError: ok ? null : 'active_trace not found for session',
      });

      if (!ok) {
        jaaDB.insert('failures', {
          uuid:     uid(),
          source:   MODULE_ID,
          error:    `Verification failed: active_trace missing for session ${s.uuid}`,
          causedBy: s.uuid,
          ts:       Date.now(),
        });
      }
    }
  } catch (err) {
    jaaDB.insert('failures', { uuid: uid(), source: MODULE_ID, error: err.message, stack: err.stack, ts: Date.now() });
  }
}

module.exports = { init, stop };
