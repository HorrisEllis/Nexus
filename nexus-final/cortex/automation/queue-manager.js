'use strict';
// ── automation/queue-manager.js ───────────────────────────────────────────────
// UUID: mod-queue-manager-v5-0000-4000-0000-000000000001
//
// Reads schedules where nextRunAt <= now. Enqueues agent_calls.
// Updates schedules with nextRunAt for recurring schedules.
//
// §M1: init(cfg) + stop().
// §M2: reads: schedules. writes: agent_calls, schedules, event_log, failures.

const { jaaDB, uid } = require('../memory/jaa-db');

const MODULE_ID = 'automation/queue-manager';

let _interval = null;
let _cfg      = {};

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
    const now  = Date.now();
    const due  = jaaDB.query('schedules',
      r => r.status === 'active' && r.nextRunAt <= now,
      20
    );
    if (!due.length) return;

    for (const sched of due) {
      // Enqueue
      jaaDB.insert('agent_calls', {
        uuid:           uid(),
        scheduleUuid:   sched.uuid,
        intent:         sched.intent || 'scheduled_run',
        prompt:         sched.prompt || sched.intent || '',
        preferredAgent: sched.agent || 'ollama',
        tags:           sched.tags  || ['scheduled'],
        status:         'pending',
        source:         MODULE_ID,
        causedBy:       sched.uuid,
        ts:             now,
      });

      // Advance nextRunAt or deactivate one-shot
      if (sched.intervalMs) {
        jaaDB.update('schedules', sched.uuid, {
          nextRunAt:   now + sched.intervalMs,
          lastRanAt:   now,
          runCount:    (sched.runCount || 0) + 1,
        });
      } else {
        jaaDB.update('schedules', sched.uuid, {
          status:    'done',
          lastRanAt: now,
          runCount:  (sched.runCount || 0) + 1,
        });
      }

      jaaDB.insert('event_log', {
        uuid:     uid(),
        type:     'schedule.enqueued',
        payload:  { schedUuid: sched.uuid, intent: sched.intent },
        source:   MODULE_ID,
        causedBy: sched.uuid,
        ts:       now,
      });
    }
  } catch (err) {
    jaaDB.insert('failures', { uuid: uid(), source: MODULE_ID, error: err.message, stack: err.stack, ts: Date.now() });
  }
}

module.exports = { init, stop };
