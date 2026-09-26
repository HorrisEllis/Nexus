'use strict';
// guardian/routes/autonomous-loop.js — the first real caller of
// lib/autonomous-loop.js's run(). Phase 13 (Autonomous Loop) was built,
// tested in isolation, and marked complete — but confirmed by grep: zero
// callers of run() exist anywhere in this codebase. Everything downstream
// of it (compartment-engine, adversary-suite, case-library, crystal-
// lattice) has been sitting ready with nothing ever invoking it in
// production. This file closes exactly that gap, using ONLY real,
// already-proven guardian machinery — no new agent-dispatch mechanism.
//
// §SOVEREIGN CONTRACT — autonomous-loop.js documents itself as knowing
// "nothing about guardian, ollama, or copilot" and takes an injected
// executor(workingMemory, constraintFrame). This file IS that injected
// executor for the guardian-driven case. It reuses the exact same
// { createJob, dispatchJob, getJob, isProviderConnected, resolveProvider }
// deps shape already proven at POST /api/copilot/prompt (guardian/ask.js's
// askSync) — not a second, parallel dispatch path.
//
// §WHAT constraintFrame ACTUALLY CONTAINS — checked directly against
// compartment-engine.js's _assembleConstraintFrame() before writing this:
// it does NOT carry the intent's raw text (only risk_ceiling, axioms,
// budget, boundary, negative_crystal_ids). The goal text is closed over
// from the original request instead of guessed off the frame.
//
// §HEARTBEAT — every heartbeatMs (default 5 min) while a run is in
// flight, posts guardian.autonomous.heartbeat through nc.postEvent — the
// same real ledger/event path every other guardian event already reaches
// — and via the in-process bus for any local listener. Cleared the moment
// run() settles either way; never an orphaned interval.
//
// §BUDGET — compartment-engine's real default is
// { tokens: null, timeMs: null, irreversibleOpsAllowed: false } — i.e. NO
// ceiling unless the caller states one. "Can't stop until conditions are
// met" and "hard budget ceiling" are in real tension (compartment-engine's
// own header calls an unbounded run out as a deliberate safety rule, not
// an oversight) — this route does not silently resolve that tension by
// picking a default; it requires the caller to state budget/boundary
// explicitly, or passes through compartment-engine's own honest default.

const DEFAULT_HEARTBEAT_MS = 5 * 60 * 1000;
const DEFAULT_STEP_TIMEOUT_MS = 120000;

// project: the working_memory.project key lib/autonomous-loop.js's run()
// composes in when a projectSeed was passed (see that file's own header
// for why this is additive alongside, not instead of, case-library's
// pattern-memory seed). Rendered as a real file tree + bounded contents
// so the agent has something to act on, not just a goal sentence.
function _renderProject(project) {
  if (!project || !project.ok) return null;
  const tree = project.fileTree.map(f => `  ${f}`).join('\n');
  const bodies = Object.entries(project.files)
    .map(([rel, f]) => `--- ${rel}${f.truncated ? ' (truncated)' : ''} ---\n${f.content}`)
    .join('\n\n');
  const omittedNote = project.omitted?.length
    ? `\n(${project.omitted.length} file(s) omitted from contents — file tree above is complete regardless.)`
    : '';
  return [
    `Imported project (${project.fileCount} files total, ${Object.keys(project.files).length} shown below):`,
    tree,
    '',
    bodies,
    omittedNote,
  ].join('\n');
}

function _buildPrompt(goalText, workingMemory, constraintFrame) {
  const boundary = constraintFrame?.boundary?.description || 'no boundary declared';
  const axioms = (constraintFrame?.axioms || []).join(', ') || 'none loaded';
  const project = _renderProject(workingMemory?.project);
  const otherSeed = { ...(workingMemory || {}) };
  delete otherSeed.project;
  const hasOtherSeed = Object.keys(otherSeed).length > 0;

  const parts = [
    `You are operating inside a NEXUS compartment (id: ${constraintFrame?.compartment_id || 'unknown'}).`,
    `Goal: ${goalText}`,
    `Boundary: ${boundary}`,
    `Governing axioms: ${axioms}`,
  ];
  if (project) parts.push('', project);
  if (hasOtherSeed) parts.push('', `Prior-pattern memory (case-library): ${JSON.stringify(otherSeed).slice(0, 2000)}`);
  if (!project && !hasOtherSeed) parts.push('', 'Working memory seed: (none — first pass on this intent signature, per case-library)');
  parts.push('', "Do the work described by the goal, within the stated boundary. Reply with your result directly " +
    "— this response becomes the compartment's outcome and will be checked by the adversary suite and " +
    "QA/QC layer before it is trusted.");
  return parts.join('\n');
}

// deps: { jobs, createJob, dispatchJob, ncp } — all real, already-wired
// guardian internals, injected via ctx (same style routes/settings.js
// already established for jaa) rather than required fresh, so this file
// can't accidentally stand up a second, desynced copy of any of them.
function _makeExecutor({ goalText, provider, timeoutMs, jobs, createJob, dispatchJob, ncp, runId }) {
  const { askSync } = require('../ask.js');
  // §MCO04 2026-09-18 — James: "Migrate to cos." Real, confirmed
  // correction: §MCO02/03's phase model lived on lib/compartment-
  // engine.js — the RAID constraint-frame concept, explicitly documented
  // elsewhere in this codebase as NOT the same thing as COS (cos/), the
  // real disk-backed compartment runtime. This executor now creates a
  // real COS compartment per run and advances its real workPhase
  // (EXPLORING -> ACTING -> VERIFYING) via lib/cos-bridge.js, gated by
  // the real gate/state-machine in cos/host/gates/compartment.js — not
  // a parallel phase concept bolted onto the wrong module.
  //
  // §SOVEREIGN, PER THIS FILE'S OWN CONTRACT ABOVE — dispatchToAgent
  // still wraps askSync unchanged; only the shared, protocol-level tool-
  // loop wrapper is reused. No new agent-dispatch mechanism.
  const dispatchToAgent = async (prompt, opts = {}) => {
    return askSync(prompt, {
      provider: opts.provider || provider || 'auto',
      timeoutMs: timeoutMs || DEFAULT_STEP_TIMEOUT_MS,
      command: 'ask',
    }, {
      createJob, dispatchJob, getJob: (id) => jobs.get(id),
      isProviderConnected: (p) => { try { return ncp.isConnected(p); } catch (_) { return false; } },
      resolveProvider: async (p) => {
        try {
          const nx = require('../../lib/nexus-client');
          const d = await nx.post('cortex', '/api/raid/decide', { prompt: p }, { timeout: 3000 });
          return d?.agent || null;
        } catch (e) {
          console.warn('[autonomous-loop-route] cortex /api/raid/decide unreachable, using reserve:', e.message);
          return 'claude';
        }
      },
    });
  };

  return async function executor(workingMemory, constraintFrame, compartment) {
    const userPrompt = _buildPrompt(goalText, workingMemory, constraintFrame);
    const cosBridge = require('../../lib/cos-bridge.js');
    const compName = `guardian-run-${runId || Date.now()}`;
    let cosCompartment = null;

    try {
      const { makeNcpCallModel } = require('../../copilot/tool-runtime.js');
      const agentTools = require('../../lib/agent-tools/index.js');
      const callModel = makeNcpCallModel(dispatchToAgent, { provider: provider || 'auto' });

      // §HONEST DEGRADE — if COS is unreachable (this run's environment
      // has no compartment-os store/gate host — see lib/cos-bridge.js's
      // own lastError()), run one unscoped tool-calling pass rather than
      // failing the whole run outright.
      const created = cosBridge.createCompartment({ name: compName, purpose: goalText });
      if (!created.ok) {
        console.warn(`[autonomous-loop-route] COS compartment create failed (${created.error}) — running unscoped, no phase gating`);
        const loopResult = await agentTools.runToolLoop(callModel,
          'You are guardian\'s autonomous build executor. You have real tools; use them.',
          userPrompt, { maxIterations: 10 });
        if (!loopResult.text) throw new Error('executor: tool loop produced no final text');
        return { text: loopResult.text, iterations: loopResult.iterations, toolCallLog: loopResult.toolCallLog };
      }
      cosCompartment = created.compartment;

      const allToolCallLog = [];
      const phasePrompts = {
        EXPLORING: 'Phase: EXPLORING. Only read-only tools are available. Investigate the goal and the working memory before acting — do not attempt to mutate anything yet.',
        ACTING:    'Phase: ACTING. Mutation-capable tools are now available. Use what you learned in EXPLORING to do the real work.',
        VERIFYING: 'Phase: VERIFYING. Back to read-only tools. Check the real result of what you did in ACTING and report it honestly.',
      };
      let lastText = '';
      for (const phase of ['EXPLORING', 'ACTING', 'VERIFYING']) {
        const adv = cosBridge.advanceWorkPhase({ name: compName, nextPhase: phase });
        if (!adv.ok) throw new Error(`executor: could not advance COS compartment "${compName}" to ${phase}: ${adv.error}`);
        cosCompartment = adv.compartment;

        const allowedTools = cosBridge.toolsAllowedForWorkPhase(phase, { agentTools });
        const systemPrompt = [
          'You are guardian\'s autonomous build executor, working through real, distinct phases inside a real COS compartment.',
          phasePrompts[phase],
        ].join(' ');
        const phasePrompt = phase === 'EXPLORING' ? userPrompt
          : `${userPrompt}\n\n[Real result from the previous phase]\n${lastText}`;
        const loopResult = await agentTools.runToolLoop(callModel, systemPrompt, phasePrompt, { maxIterations: 6, allowedTools });
        allToolCallLog.push(...(loopResult.toolCallLog || []).map(c => ({ ...c, phase })));
        lastText = loopResult.text || '';
      }
      if (!lastText) throw new Error('executor: phased tool loop produced no final text');
      return { text: lastText, toolCallLog: allToolCallLog, workPhase: cosCompartment.workPhase, cosCompartmentId: cosCompartment.id };
    } catch (e) {
      console.warn(`[autonomous-loop-route] COS-phased tool-calling executor failed (${e.message}) — falling back to single-shot askSync`);
      const result = await dispatchToAgent(userPrompt, { provider });
      if (!result.ok) throw new Error(result.error || 'executor: askSync failed with no error message');
      return { text: result.text, provider: result.provider, jobId: result.jobId };
    } finally {
      // §CLEANUP — this compartment's own root is a fresh directory COS
      // created for this one run (never an externally mounted project
      // path — see cos-bridge.js's own destroyCompartment() doc), so
      // wiping it here is always safe, not a risk to any real project.
      if (cosCompartment) {
        const destroyed = cosBridge.destroyCompartment(compName, { wipe: true, force: true });
        if (!destroyed.ok) console.warn(`[autonomous-loop-route] COS compartment cleanup failed for "${compName}": ${destroyed.error}`);
      }
    }
  };
}

function handle(req, res, ctx) {
  const { method, url, pRes, bodyJ, jobs, createJob, dispatchJob, ncp, nc, bus } = ctx;

  // ── POST /autonomous/import — project import → compartment build surface ──
  // Stages a zip/directory via lib/intake.js's real, existing pipeline
  // (capture → stage(contract)), expands a .zip in place (new:
  // intake.expandArchive()), then builds a bounded seed (new:
  // lib/project-compartment.js) — WITHOUT running a compartment or
  // touching the real tree. This is deliberately a separate step from
  // /autonomous/run: staging a project and deciding to autonomously act
  // on it are two different real decisions, same §IP-5 discipline intake
  // already enforces for promote() (arrival is not acceptance).
  if (method === 'POST' && url.pathname === '/autonomous/import') {
    bodyJ(req).then(async body => {
      if (!body || !body.sourcePath) { pRes(res, 400, { ok: false, error: 'sourcePath required — absolute path to a zip file or directory' }); return; }
      const intake = require('../../lib/intake.js');
      const staged = intake.stage({ source: body.sourcePath, provenance: { filename: body.filename } });
      if (!staged.ok) { pRes(res, 400, { ok: false, error: staged.errors?.join('; ') || 'stage failed' }); return; }

      let expandResult = null;
      if (staged.contract.summary.archives > 0) {
        expandResult = intake.expandArchive(staged.dropId);
        if (!expandResult.ok) {
          pRes(res, 200, { ok: true, dropId: staged.dropId, staged: staged.contract, expandFailed: expandResult.reason });
          return;
        }
      }

      const projectCompartment = require('../../lib/project-compartment.js');
      const seed = projectCompartment.buildSeedFromDrop(staged.dropId);
      pRes(res, 200, { ok: true, dropId: staged.dropId, expanded: !!expandResult, seed: seed.ok ? {
        fileCount: seed.fileCount, fileTree: seed.fileTree, includedCount: Object.keys(seed.files).length, omittedCount: seed.omitted.length,
      } : seed });
    }).catch(e => pRes(res, 400, { ok: false, error: e.message }));
    return true;
  }

  // ── POST /autonomous/run — the trigger ───────────────────────────────────
  // body.dropId (optional): a project already staged via /autonomous/import
  // — its seed is built and passed through as run()'s new projectSeed param.
  if (method === 'POST' && url.pathname === '/autonomous/run') {
    bodyJ(req).then(async body => {
      if (!body || (!body.text && !body.dropId)) {
        pRes(res, 400, { ok: false, error: 'text or dropId required — text becomes the intent-classifier input and the executor\'s goal text; dropId (from /autonomous/import) seeds the compartment with an imported project' });
        return;
      }

      let autonomousLoop;
      try { autonomousLoop = require('../../lib/autonomous-loop.js'); }
      catch (e) { pRes(res, 500, { ok: false, error: `autonomous-loop unreachable: ${e.message}` }); return; }

      let projectSeed;
      if (body.dropId) {
        const projectCompartment = require('../../lib/project-compartment.js');
        const seed = projectCompartment.buildSeedFromDrop(body.dropId);
        if (!seed.ok) { pRes(res, 400, { ok: false, error: `dropId "${body.dropId}": ${seed.reason}` }); return; }
        projectSeed = seed;
      }
      const goalText = body.text || `Review and build/fix the imported project (dropId ${body.dropId}).`;

      const runId = require('crypto').randomUUID();
      const heartbeatMs = body.heartbeatMs || DEFAULT_HEARTBEAT_MS;
      const startedAt = Date.now();

      const heartbeat = setInterval(() => {
        const payload = { runId, elapsedMs: Date.now() - startedAt, status: 'running' };
        if (nc) nc.postEvent('guardian.autonomous.heartbeat', payload).catch(() => {});
        if (bus) bus.emit('guardian.autonomous.heartbeat', payload);
      }, heartbeatMs);
      // Never let a heartbeat outlive the process on an unexpected exit path.
      heartbeat.unref?.();

      const executor = _makeExecutor({
        goalText, provider: body.provider, timeoutMs: body.stepTimeoutMs,
        jobs, createJob, dispatchJob, ncp, runId,
      });

      try {
        const result = await autonomousLoop.run({
          req: { text: goalText, source: 'guardian-autonomous-route', autonomous: true, runId, provider: body.provider },
          executor,
          // No invented default — pass through exactly what the caller sent.
          // compartment-engine.spawn() applies its own honest default
          // ({ tokens:null, timeMs:null, irreversibleOpsAllowed:false })
          // when this is undefined; it is NOT re-implemented here.
          budget: body.budget,
          boundary: body.boundary,
          injectedFrameworks: body.injectedFrameworks,
          projectSeed,
        });

        clearInterval(heartbeat);
        if (nc) nc.postEvent('guardian.autonomous.complete', { runId, ran: result.ran, stage: result.stage }).catch(() => {});
        if (bus) bus.emit('guardian.autonomous.complete', { runId, ran: result.ran, stage: result.stage });
        pRes(res, 200, { ok: true, runId, result });
      } catch (e) {
        clearInterval(heartbeat);
        if (nc) nc.postEvent('guardian.autonomous.error', { runId, error: e.message }).catch(() => {});
        if (bus) bus.emit('guardian.autonomous.error', { runId, error: e.message });
        pRes(res, 500, { ok: false, runId, error: e.message });
      }
    }).catch(e => pRes(res, 400, { ok: false, error: e.message }));
    return true;
  }

  // ── GET /autonomous/wiring — validateWiring() over HTTP, so a caller can ──
  // check the loop's real dependency chain before firing a run.
  if (method === 'GET' && url.pathname === '/autonomous/wiring') {
    let autonomousLoop;
    try { autonomousLoop = require('../../lib/autonomous-loop.js'); }
    catch (e) { pRes(res, 500, { ok: false, error: `autonomous-loop unreachable: ${e.message}` }); return true; }
    pRes(res, 200, { ok: true, wiring: autonomousLoop.validateWiring() });
    return true;
  }

  return false;
}

module.exports = { handle, _buildPrompt, _makeExecutor };
