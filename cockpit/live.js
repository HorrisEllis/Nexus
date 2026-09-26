'use strict';
/**
 * cockpit/live.js — the live, composed cockpit instance
 * UUID: nexus-cockpit-live-v1-0000-2026-0706-jamesbrooks-001
 *
 * §THE REAL GAP THIS CLOSES — checked before writing: ForgeCLI,
 * PipelineRegistry, and PipelineExecutor are real, rich, tested-in-shape
 * classes with ZERO instantiations anywhere in the codebase. forge.spec
 * and the session manifest both said cockpit was "already wired to
 * guardian" — wrong: guardian's only cockpit references are
 * cockpitBroadcast(), an SSE push to Forge-UI browser tabs that merely
 * shares the name. The whole workflow/scheduler engine (cron/interval/
 * webhook triggers, agent_call nodes, the full CLI contract) has been
 * real code with no living instance. This file is that instance.
 *
 * §PERSISTENCE — PipelineRegistry wants a jaa with scan(table) and
 * upsert(table, id, json). cortex/memory/jaa-db.js speaks
 * insert/update/query. The adapter below is a real translation, not a
 * stub — pipelines created here survive a restart because load() reads
 * the same real rows save() wrote. (§2.1: a pipeline that only lives in
 * a Map doesn't exist.)
 */

const { jaaDB, uid } = require('../cortex/memory/jaa-db');
const { ForgeCLI } = require('./cli.js');
const pipelineMod = require('./pipeline.js');

const TABLE = 'pipelines';

// jaa adapter — the exact two methods PipelineRegistry calls, backed by
// the real store. upsert keys on the pipeline's own id field.
const _jaaAdapter = {
  scan: (table) => jaaDB.query(table, () => true, 10000).map(r => r.json || r),
  upsert: async (table, id, json) => {
    const existing = jaaDB.query(table, r => r.pipelineId === id, 1);
    if (existing.length) {
      jaaDB.update(table, { pipelineId: id }, { pipelineId: id, json, ts: Date.now() });
    } else {
      jaaDB.insert(table, { uuid: uid(), pipelineId: id, json, ts: Date.now() });
    }
  },
};
// scan() must hand Pipeline rows back in the shape Pipeline's constructor
// expects — rows are stored wrapped ({pipelineId, json}), unwrap on read:
_jaaAdapter.scan = (table) => jaaDB.query(table, () => true, 10000).map(r => r.json);

let _cli = null;
let _registry = null;

function getForgeCLI() {
  if (_cli) return _cli;
  const { PipelineRegistry, PipelineExecutor, SeamCompiler } = pipelineMod;
  const compiler = new SeamCompiler();
  const executor = new PipelineExecutor({ jaa: _jaaAdapter, compiler });
  _registry = new PipelineRegistry({ jaa: _jaaAdapter, executor });
  // load() is async but only reads; callers of getForgeCLI() get a CLI
  // whose registry hydrates on first tick — exec() calls that need a
  // loaded registry can await ready().
  _registry.load().catch(() => {});
  _cli = new ForgeCLI({ jaa: _jaaAdapter, registry: _registry, executor, compiler, pipelineClass: pipelineMod.Pipeline });
  return _cli;
}

async function ready() {
  getForgeCLI();
  await _registry.load().catch(() => {});
  return _cli;
}

module.exports = { getForgeCLI, ready, TABLE };
