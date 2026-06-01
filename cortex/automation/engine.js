'use strict';
// ── automation/engine.js ──────────────────────────────────────────────────────
// UUID: mod-automation-engine-v5-0000-4000-0000-000000000001
//
// Reads workflow_runs where status='pending'. Executes step sequences.
// Steps are: agent_call, jaa_insert, wait, condition.
// Each step writes back to workflow_runs as it progresses.
//
// §M1: init(cfg) + stop().
// §M2: reads: workflow_runs, agent_calls. writes: workflow_runs, agent_calls, event_log, failures.

const { jaaDB, uid } = require('../memory/jaa-db');

const MODULE_ID = 'automation/engine';

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
    const runs = jaaDB.query('workflow_runs', r => r.status === 'pending', 5);
    if (!runs.length) return;

    for (const run of runs) {
      jaaDB.update('workflow_runs', run.uuid, { status: 'running', startedAt: Date.now(), claimedBy: MODULE_ID });
      const claimed = jaaDB.get('workflow_runs', run.uuid);
      if (!claimed || claimed.claimedBy !== MODULE_ID) continue;

      try {
        await _executeRun(run);
        jaaDB.update('workflow_runs', run.uuid, { status: 'complete', completedAt: Date.now() });
        jaaDB.insert('event_log', {
          uuid: uid(), type: 'workflow.complete',
          payload: { runUuid: run.uuid, name: run.name },
          source: MODULE_ID, causedBy: run.uuid, ts: Date.now(),
        });
      } catch (err) {
        jaaDB.update('workflow_runs', run.uuid, { status: 'failed', error: err.message });
        jaaDB.insert('failures', { uuid: uid(), source: MODULE_ID, error: err.message, stack: err.stack, causedBy: run.uuid, ts: Date.now() });
      }
    }
  } catch (err) {
    jaaDB.insert('failures', { uuid: uid(), source: MODULE_ID, error: err.message, stack: err.stack, ts: Date.now() });
  }
}

async function _executeRun(run) {
  const steps  = run.steps || [];
  const results = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];

    jaaDB.update('workflow_runs', run.uuid, { currentStep: i, currentStepName: step.name || step.type });

    switch (step.type) {
      case 'agent_call': {
        // Enqueue — this run waits for completion on next tick pass
        const call = jaaDB.insert('agent_calls', {
          uuid:           uid(),
          intent:         step.intent || run.name,
          prompt:         step.prompt || '',
          preferredAgent: step.agent || 'ollama',
          tags:           ['workflow', run.name],
          status:         'pending',
          source:         MODULE_ID,
          causedBy:       run.uuid,
          ts:             Date.now(),
        });
        // Poll for completion (max 30s)
        const result = await _waitForCall(call.uuid, 30000);
        results.push({ step: i, type: 'agent_call', result });
        break;
      }

      case 'jaa_insert': {
        if (step.table && step.record) {
          const row = jaaDB.insert(step.table, { ...step.record, uuid: uid(), source: MODULE_ID, causedBy: run.uuid, ts: Date.now() });
          results.push({ step: i, type: 'jaa_insert', row: row.uuid });
        }
        break;
      }

      case 'wait': {
        await new Promise(r => setTimeout(r, step.ms || 1000));
        results.push({ step: i, type: 'wait', ms: step.ms });
        break;
      }

      default:
        results.push({ step: i, type: step.type, skipped: true });
    }
  }

  jaaDB.update('workflow_runs', run.uuid, { results });
}

function _waitForCall(callUuid, timeoutMs) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const poll = () => {
      const call = jaaDB.get('agent_calls', callUuid);
      if (!call) return reject(new Error(`agent_call ${callUuid} not found`));
      if (call.status === 'complete') return resolve(call.result);
      if (call.status === 'failed')   return reject(new Error(call.error || 'agent_call failed'));
      if (Date.now() > deadline)      return reject(new Error(`agent_call ${callUuid} timed out`));
      setTimeout(poll, 500);
    };
    setTimeout(poll, 500);
  });
}

module.exports = { init, stop };
