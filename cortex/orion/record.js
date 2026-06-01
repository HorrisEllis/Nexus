'use strict';
// ── orion/record.js ───────────────────────────────────────────────────────────
// ORION §A2 — persist. Second stage.
// Reads orion_sessions where status='measured'. Writes to active_traces.

const { jaaDB, uid } = require('../memory/jaa-db');
const MODULE_ID = 'orion/record';
let _interval = null;

function init(cfg = {}) {
  _interval = setInterval(_tick, cfg.pollMs ?? 1000);
  _interval.unref();
}
function stop() { clearInterval(_interval); _interval = null; }

async function _tick() {
  try {
    const sessions = jaaDB.query('orion_sessions', r => r.status === 'measured', 20);
    for (const s of sessions) {
      jaaDB.update('orion_sessions', s.uuid, { status: 'recording', claimedBy: MODULE_ID });
      const claimed = jaaDB.get('orion_sessions', s.uuid);
      if (!claimed || claimed.claimedBy !== MODULE_ID) continue;

      jaaDB.insert('active_traces', {
        uuid:        uid(),
        sessionUuid: s.uuid,
        calltoId:    s.calltoId,
        service:     s.service,
        regime:      s.regime,
        features:    s.features,
        events:      s.events,
        source:      MODULE_ID,
        causedBy:    s.uuid,
        ts:          Date.now(),
      });

      jaaDB.update('orion_sessions', s.uuid, { status: 'recorded', recordedAt: Date.now() });
    }
  } catch (err) {
    jaaDB.insert('failures', { uuid: uid(), source: MODULE_ID, error: err.message, stack: err.stack, ts: Date.now() });
  }
}

module.exports = { init, stop };
