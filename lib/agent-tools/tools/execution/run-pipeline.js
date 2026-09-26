'use strict';
/**
 * lib/agent-tools/tools/run-pipeline.js — run_pipeline tool
 * UUID: nexus-agent-tools-run-pipeline-v1-0000-2026-0709-jamesbrooks-001
 *
 * §THE HIGHEST-VALUE ORPHAN WIRE — lib/execution-pipeline.js is the full
 * autonomous loop (build → sandbox-verify → compare-to-golden → governed
 * promote → optional hot-integrate), chaining five real systems that
 * already existed. It exports runPipeline/startPipeline/listPipelines,
 * copilot/lib/expectation-watcher.js already LISTENS for its
 * pipeline.* events — but nothing ever CALLED it. The loop was wired to
 * be observed and had no trigger. This tool is the trigger: it lets
 * copilot/ollama run the whole closed loop from a spec, the literal
 * "programmable, closes each gap, builds itself" capability.
 *
 * Honest scope: `run` kicks off a real pipeline (async — build+sandbox
 * can take minutes); `status`/`list` read real in-memory pipeline
 * records. The pipeline's own stages self-gate (§1.1 — sandbox verify
 * before promote), so this tool can't promote unproven output; it only
 * starts the governed loop and reports where it got to.
 */

const pipeline = require('../../../execution-pipeline.js');

// Minimal real emitter deps — the pipeline dual-emits on SSE + bus, but
// when triggered from a bare tool call there may be no broadcast wired;
// pass no-op-safe shims so a tool-initiated run still executes and its
// events still reach nexus-bus if one is globally available.
function _emitters() {
  let bus = null;
  try { bus = require('../../../../nexus/nexus-bus.js'); } catch (_) { bus = null; }
  return {
    broadcast: () => {},                                   // SSE optional from a tool context
    ledgerWrite: async () => {},                           // best-effort
    bus: bus && bus.emit ? bus : { emit: () => {} },
  };
}

module.exports = {
  name: 'run_pipeline',
  description:
    'Run the NEXUS autonomous execution pipeline (build → sandbox-verify → compare-to-golden → governed promote). ' +
    'Actions: "run" (start a pipeline from a spec — requires specPath; optional outputDir, provider, testCommand), ' +
    '"status" (get one pipeline by id — requires id), ' +
    '"list" (recent pipeline runs). ' +
    'The pipeline self-gates: unproven output is never promoted.',
  parameters: {
    type: 'object',
    properties: {
      action:      { type: 'string', enum: ['run', 'status', 'list'], description: 'run | status | list' },
      specPath:    { type: 'string', description: 'Absolute path to the .spec file to build (required for run)' },
      outputDir:   { type: 'string', description: 'Where to write the build output (optional)' },
      provider:    { type: 'string', description: 'Build provider: ollama (default), chatgpt, claude' },
      testCommand: { type: 'string', description: 'Optional test command run inside the sandbox verify stage' },
      id:          { type: 'string', description: 'Pipeline id (required for status)' },
    },
    required: ['action'],
  },
  execute: async ({ action, specPath, outputDir, provider, testCommand, id } = {}) => {
    if (action === 'list') return { ok: true, pipelines: pipeline.listPipelines() };
    if (action === 'status') {
      if (!id) return { error: 'status requires a pipeline id' };
      const rec = pipeline.getPipeline(id);
      return rec ? { ok: true, pipeline: rec } : { error: `no pipeline with id ${id}` };
    }
    if (action === 'run') {
      if (!specPath) return { error: 'run requires specPath' };
      // startPipeline returns immediately with the id; the real work runs
      // async and streams pipeline.* events the expectation-watcher sees.
      try {
        const rec = pipeline.startPipeline(
          { specPath, outputDir, provider: provider || 'ollama', testCommand },
          _emitters()
        );
        return { ok: true, started: true, pipelineId: rec.pipelineId, note: 'Pipeline running async — poll with action:"status" and this id.' };
      } catch (e) { return { error: e.message }; }
    }
    return { error: `unknown action "${action}"` };
  },
};
