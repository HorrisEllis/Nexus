'use strict';
// ── orion/policy.js ───────────────────────────────────────────────────────────
// ORION §A2 — react. Third stage.
// Reads orion_sessions where status='recorded'. Writes gaps if regime != stable.

const { jaaDB, uid } = require('../memory/jaa-db');
const MODULE_ID = 'orion/policy';
let _interval = null;

function init(cfg = {}) {
  _interval = setInterval(_tick, cfg.pollMs ?? 2000);
  _interval.unref();
}
function stop() { clearInterval(_interval); _interval = null; }

async function _tick() {
  try {
    const sessions = jaaDB.query('orion_sessions', r => r.status === 'recorded', 20);
    for (const s of sessions) {
      jaaDB.update('orion_sessions', s.uuid, { status: 'applying_policy', claimedBy: MODULE_ID });
      const claimed = jaaDB.get('orion_sessions', s.uuid);
      if (!claimed || claimed.claimedBy !== MODULE_ID) continue;

      if (s.regime !== 'stable' && s.regime !== 'insufficient_data') {
        const existing = jaaDB.query('gaps',
          r => r.path === `orion/${s.calltoId}` && r.status !== 'resolved',
          1
        );
        if (!existing.length) {
          jaaDB.insert('gaps', {
            uuid:      uid(),
            path:      `orion/${s.calltoId}`,
            type:      'regime_degraded',
            severity:  s.regime === 'collapsing' ? 'high' : 'medium',
            body:      `ORION session ${s.uuid}: regime=${s.regime} service=${s.service}`,
            status:    'pending',
            source:    MODULE_ID,
            causedBy:  s.uuid,
            createdAt: Date.now(),
          });
        }
      }

      jaaDB.update('orion_sessions', s.uuid, { status: 'policy_applied', policyAt: Date.now() });
    }
  } catch (err) {
    jaaDB.insert('failures', { uuid: uid(), source: MODULE_ID, error: err.message, stack: err.stack, ts: Date.now() });
  }
}

module.exports = { init, stop };
