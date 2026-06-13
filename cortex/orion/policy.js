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
          // §ORION-07: severity and routing weight derived from regime
          // turbulent → medium + reduce routing weight by 20%
          // collapsing → high   + reduce routing weight by 50%
          // chaotic    → critical + block routing until stable
          const _sevMap    = { collapsing: 'high', chaotic: 'critical', turbulent: 'medium' };
          const _weightAdj = { collapsing: -0.5,   chaotic: -0.9,       turbulent: -0.2 };
          const severity   = _sevMap[s.regime]    || 'medium';
          const weightDelta= _weightAdj[s.regime] || -0.1;

          jaaDB.insert('gaps', {
            uuid:        uid(),
            path:        `orion/${s.calltoId}`,
            type:        'regime_degraded',
            severity,
            body:        `ORION session ${s.uuid}: regime=${s.regime} service=${s.service}`,
            status:      'pending',
            source:      MODULE_ID,
            causedBy:    s.uuid,
            sigma:       s.sigma || 0,
            createdAt:   Date.now(),
          });

          // §ORION-07: adjust routing weight for this service in project_registry
          // RAID reads routing weights from project_registry before dispatching
          const reg = jaaDB.query('project_registry', r => r.name === s.service, 1);
          if (reg.length) {
            const current = reg[0].routingWeight ?? 1.0;
            const adjusted = Math.max(0.05, Math.min(1.0, current + weightDelta));
            jaaDB.update('project_registry', reg[0].uuid, {
              routingWeight:      adjusted,
              routingWeightNote:  `orion:${s.regime} @ ${new Date().toISOString()}`,
              _orionLastAdjusted: Date.now(),
            });
            jaaDB.insert('event_log', {
              uuid:    uid(),
              type:    'orion.routing.adjusted',
              payload: { service: s.service, regime: s.regime, from: current, to: adjusted, delta: weightDelta },
              source:  MODULE_ID,
              causedBy:s.uuid,
              ts:      Date.now(),
            });
          }
        }
      }

      jaaDB.update('orion_sessions', s.uuid, { status: 'policy_applied', policyAt: Date.now() });
    }
  } catch (err) {
    jaaDB.insert('failures', { uuid: uid(), source: MODULE_ID, error: err.message, stack: err.stack, ts: Date.now() });
  }
}

module.exports = { init, stop };
