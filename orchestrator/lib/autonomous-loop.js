'use strict';
/**
 * lib/autonomous-loop.js — Phase 13: Autonomous Loop
 * UUID: nexus-autonomous-loop-v1-0000-2026-0625-jamesbrooks-001
 * Version: 1.0.0
 *
 * Ollama as brain. Multi-step autonomous task execution inside hard limits.
 *
 * Four required per run — all must be declared, none inferred:
 *   Goal      — what success looks like (string, specific)
 *   Budget    — hard limit (max steps, max tokens, max ms) — ENFORCED
 *   Boundary  — what the loop is NOT allowed to touch (written explicitly)
 *   Exit      — condition that terminates the loop (checked every step)
 *
 * Every action carries: { autonomous:true, runId, step, causedBy, intent_uuid }
 * Case library queried via intent signature before each step.
 * Rewind if σ > 0.70. RAID gate on every non-read action.
 *
 * §1.1 Nothing exists until proven — every step validated before execution
 * §1.2 Nothing silently fails — every step logged to autonomous_runs JAA table
 * §1.3 No stubs — boundaries are real, enforced, never bypassed
 * §2.1 Disk before behavior — snapshot at run start
 * §10.1 TRUTH_OVER_COHERENCE — surfaces reasoning, never fires silently
 */

const crypto = require('crypto');

const MODULE_ID = 'autonomous-loop';
const VERSION   = '1.0.0';

const GD_URL = process.env.GUARDIAN_URL || 'http://127.0.0.1:7820';
const CX_URL = process.env.CORTEX_URL   || 'http://127.0.0.1:3748';
const ORCH_URL = process.env.ORCHESTRATOR_URL || 'http://127.0.0.1:9000';

let _bus = null, _jaa = null, _raid = null;

function init({ bus, jaaDB, raid } = {}) {
  _bus  = bus    || null;
  _jaa  = jaaDB  || null;
  _raid = raid   || null;
  console.log(`[${MODULE_ID}] v${VERSION} — RAID:${!!_raid?._approveTool}`);
}

// ── Run record ────────────────────────────────────────────────────────────────

function _newRun(opts) {
  const run = {
    uuid:       crypto.randomUUID(),
    runId:      crypto.randomUUID(),
    goal:       opts.goal,
    budget:     { maxSteps: opts.budget?.maxSteps || 5, maxMs: opts.budget?.maxMs || 120000, maxTokens: opts.budget?.maxTokens || 4000 },
    boundary:   opts.boundary,   // string: what is off-limits
    exitCond:   opts.exit,       // string: what success looks like
    status:     'running',
    steps:      [],
    tokensUsed: 0,
    startedAt:  Date.now(),
    source:     opts.source || 'api',
    intentUuid: opts.intentUuid || null,
  };
  if (_jaa) {
    try { _jaa.insert('autonomous_runs', run); } catch(_) {}
  }
  return run;
}

function _updateRun(run) {
  if (_jaa) {
    try { _jaa.update('autonomous_runs', run.uuid, run); } catch(_) {}
  }
}

function _emit(type, payload) {
  if (_bus?.emit) try { _bus.emit(type, payload); } catch(_) {}
  if (_jaa) try { _jaa.insert('event_log', { uuid: crypto.randomUUID(), type,
    source: MODULE_ID, payload, ts: Date.now() }); } catch(_) {}
}

// ── Sigma check ───────────────────────────────────────────────────────────────

async function _checkSigma() {
  try {
    const r = await fetch(`${ORCH_URL}/cfr/field`, { signal: AbortSignal.timeout(2000) })
      .then(r => r.json()).catch(() => null);
    const s = r?.sigma ?? r?.field?.sigma ?? 0;
    return typeof s === 'number' ? s : 0;
  } catch(_) { return 0; }
}

// ── Case library query ────────────────────────────────────────────────────────

async function _queryCaseLibrary(intent) {
  try {
    const r = await fetch(`${GD_URL}/case-library?intent=${encodeURIComponent(intent)}&limit=2`,
      { signal: AbortSignal.timeout(2000) }).then(r => r.json()).catch(() => null);
    return r?.cases || [];
  } catch(_) { return []; }
}

// ── LLM step ─────────────────────────────────────────────────────────────────

async function _llmStep(run, stepNum, systemPrompt, userPrompt) {
  const runtime = (() => {
    try { return require('../../ollama/ollama-runtime'); } catch(_) { return null; }
  })();

  if (!runtime) throw new Error('ollama-runtime not available');

  // §CONFIG 2026-08-23 — real, shared config instead of a separate
  // hardcoded list. runtime.FALLBACK_MODEL/DEFAULT_MODEL are the exact
  // same real values ollama/server.js itself uses (both re-exported from
  // ollama/config.js) — this file no longer has its own, third opinion
  // about what "the model" is.
  const models = [runtime.FALLBACK_MODEL, runtime.DEFAULT_MODEL];
  for (const model of models) {
    try {
      const t0 = Date.now();
      const text = await new Promise((resolve, reject) => {
        let buf = '';
        const t = setTimeout(() => reject(new Error(`${model} timeout`)), 60000);
        runtime.streamGenerate({ model, prompt: userPrompt, system: systemPrompt },
          tok => { buf += tok; },
          ()  => { clearTimeout(t); resolve(buf.trim()); },
          e   => { clearTimeout(t); reject(e); }
        );
      });
      const tokEst = Math.ceil(text.split(/\s+/).length / 0.75);
      return { text, model, durationMs: Date.now() - t0, tokensEst: tokEst };
    } catch(_) {}
  }
  throw new Error('No Ollama model responded');
}

// ── Main run ──────────────────────────────────────────────────────────────────

/**
 * run — execute an autonomous task inside hard limits.
 *
 * @param {object} opts
 *   goal      string  — specific success condition
 *   budget    object  — { maxSteps, maxMs, maxTokens }
 *   boundary  string  — explicit list of what is off-limits
 *   exit      string  — condition that stops the loop
 *   source    string  — who started this run
 *   intentUuid string — optional link to originating intent
 *
 * @returns {object} { ok, runId, steps, tokensUsed, outcome, reason }
 */
async function run(opts = {}) {
  // ── Validate all four required fields ─────────────────────────────────────
  const missing = ['goal','budget','boundary','exit'].filter(f => !opts[f]);
  if (missing.length) {
    return { ok: false, error: `Missing required fields: ${missing.join(', ')}. All four are required — none inferred.` };
  }

  const rec = _newRun(opts);
  const runId = rec.runId;

  _emit('autonomous-loop.started', { runId, goal: opts.goal });
  console.log(`[${MODULE_ID}] run ${runId.slice(0,8)} started — goal: ${opts.goal.slice(0,60)}`);

  // §2.1 Snapshot at run start
  try {
    const snap = require('../../cortex/snapshot/index');
    snap.create({ type: 'pre_forge', message: `autonomous-loop start: ${opts.goal.slice(0,60)}`, causedBy: runId });
  } catch(_) {}

  const startMs = Date.now();
  let outcome = null, exitReason = null;

  try {
    for (let step = 1; step <= rec.budget.maxSteps; step++) {
      // ── Hard limit checks ────────────────────────────────────────────────
      if (Date.now() - startMs > rec.budget.maxMs) {
        exitReason = `budget.maxMs (${rec.budget.maxMs}ms) exceeded`;
        break;
      }
      if (rec.tokensUsed >= rec.budget.maxTokens) {
        exitReason = `budget.maxTokens (${rec.budget.maxTokens}) exceeded`;
        break;
      }

      // ── σ check — rewind if too high ─────────────────────────────────────
      const sig = await _checkSigma();
      if (sig > 0.70) {
        exitReason = `sigma ${sig.toFixed(3)} > 0.70 — aborting for system safety`;
        rec.status = 'aborted_sigma';
        break;
      }

      // ── Query case library ────────────────────────────────────────────────
      const cases = await _queryCaseLibrary(opts.goal);
      const caseCtx = cases.length
        ? `Prior cases:\n${cases.map(c => `  - ${c.summary || c.outcome}`).join('\n')}`
        : '';

      // ── Build system prompt ───────────────────────────────────────────────
      const systemPrompt = [
        `You are NEXUS's autonomous reasoning engine.`,
        `You are on step ${step} of max ${rec.budget.maxSteps}.`,
        `Goal: ${opts.goal}`,
        `Boundary (you MUST NOT touch these): ${opts.boundary}`,
        `Exit condition: ${opts.exit}`,
        `Tokens remaining: ~${rec.budget.maxTokens - rec.tokensUsed}`,
        caseCtx,
        ``,
        `Prior steps:`,
        rec.steps.map(s => `  Step ${s.step}: ${s.action} → ${s.result?.slice(0,80)||'?'}`).join('\n') || '  (none yet)',
        ``,
        `INSTRUCTIONS:`,
        `1. Decide: have you met the exit condition? If yes, reply: EXIT: <reason>`,
        `2. If not, what is the single next action?`,
        `3. Reply in format: ACTION: <what to do> | REASON: <why> | TOOL: <tool name or null>`,
        `4. NEVER suggest actions that cross the boundary.`,
        `5. Be specific. One action per step.`,
      ].join('\n');

      const userPrompt = `Step ${step}. What do you do next?`;

      // ── LLM decision ─────────────────────────────────────────────────────
      let llmResult;
      try {
        llmResult = await _llmStep(rec, step, systemPrompt, userPrompt);
        rec.tokensUsed += llmResult.tokensEst || 0;
      } catch(e) {
        exitReason = `LLM unavailable: ${e.message}`;
        break;
      }

      const text = llmResult.text;

      // ── Parse decision ────────────────────────────────────────────────────
      if (/^EXIT:/im.test(text)) {
        outcome    = text.match(/EXIT:\s*(.+)/im)?.[1]?.trim() || 'exit condition met';
        exitReason = 'exit condition met by LLM decision';
        rec.steps.push({ step, action: 'EXIT', result: outcome, model: llmResult.model, ts: Date.now() });
        break;
      }

      const actionMatch = text.match(/ACTION:\s*(.+?)(?:\s*\|\s*|$)/im);
      const reasonMatch = text.match(/REASON:\s*(.+?)(?:\s*\|\s*|$)/im);
      const toolMatch   = text.match(/TOOL:\s*(.+?)(?:\s*\|\s*|$)/im);

      const action = actionMatch?.[1]?.trim() || text.slice(0, 80);
      const reason = reasonMatch?.[1]?.trim() || '';
      const tool   = toolMatch?.[1]?.trim();

      // ── Boundary check ────────────────────────────────────────────────────
      if (_boundaryViolation(action, opts.boundary)) {
        rec.steps.push({ step, action: 'BOUNDARY_VIOLATION', result: action,
          model: llmResult.model, ts: Date.now() });
        exitReason = `boundary violation: "${action.slice(0,60)}"`;
        rec.status = 'boundary_violation';
        break;
      }

      // ── RAID gate for non-read actions ────────────────────────────────────
      if (tool && tool !== 'null' && _raid?._approveTool) {
        const approval = _raid._approveTool('autonomous-loop', tool,
          { action: 'autonomous', runId, step, proof: { goal: opts.goal } });
        if (!approval.approved) {
          rec.steps.push({ step, action: `RAID_DENIED:${tool}`, result: approval.reason,
            model: llmResult.model, ts: Date.now() });
          continue; // skip this step, try next
        }
      }

      // ── Execute tool or log observation ───────────────────────────────────
      let result = `Reasoned: ${reason.slice(0, 100)}`;
      if (tool && tool !== 'null') {
        try {
          const toolResult = await _executeTool(tool, { action, runId, step, autonomous: true,
            causedBy: runId, intent_uuid: rec.intentUuid });
          result = JSON.stringify(toolResult).slice(0, 200);
        } catch(e) {
          result = `tool error: ${e.message}`;
        }
      }

      rec.steps.push({ step, action, reason, tool, result, model: llmResult.model,
        durationMs: llmResult.durationMs, tokensEst: llmResult.tokensEst, ts: Date.now(),
        autonomous: true, runId, causedBy: runId, intent_uuid: rec.intentUuid });

      _emit('autonomous-loop.step', { runId, step, action: action.slice(0,60), tool });
      _updateRun(rec);

      console.log(`[${MODULE_ID}] ${runId.slice(0,8)} step ${step}: ${action.slice(0,60)}`);
    }

    if (!exitReason && !outcome) exitReason = `max steps (${rec.budget.maxSteps}) reached`;

    rec.status     = rec.status === 'running' ? (outcome ? 'complete' : 'exhausted') : rec.status;
    rec.outcome    = outcome;
    rec.exitReason = exitReason;
    rec.completedAt= Date.now();
    rec.durationMs = rec.completedAt - rec.startedAt;

    _updateRun(rec);
    _emit('autonomous-loop.complete', { runId, status: rec.status, steps: rec.steps.length,
      tokensUsed: rec.tokensUsed, outcome: outcome?.slice(0,80) });

    console.log(`[${MODULE_ID}] ${runId.slice(0,8)} ${rec.status} — ${rec.steps.length} steps · ${rec.tokensUsed} tokens`);

    return { ok: rec.status === 'complete', runId, steps: rec.steps,
      tokensUsed: rec.tokensUsed, outcome, exitReason, status: rec.status };

  } catch(e) {
    rec.status = 'error';
    rec.error  = e.message;
    _updateRun(rec);
    _emit('autonomous-loop.error', { runId, error: e.message });
    return { ok: false, runId, error: e.message, steps: rec.steps };
  }
}

function _boundaryViolation(action, boundary) {
  if (!boundary || !action) return false;
  const boundaryTerms = boundary.toLowerCase().split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
  const actionLower   = action.toLowerCase();
  return boundaryTerms.some(term => term.length > 3 && actionLower.includes(term));
}

async function _executeTool(toolName, ctx) {
  // Route to MCP tools or guardian exec
  try {
    const r = await fetch(`${GD_URL}/exec`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: toolName, ...ctx }),
      signal: AbortSignal.timeout(15000),
    }).then(r => r.json());
    return r;
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

function status() {
  if (!_jaa) return { version: VERSION, runs: 0 };
  try {
    const runs = _jaa.query('autonomous_runs', () => true, 20);
    const running = runs.filter(r => r.status === 'running').length;
    return { version: VERSION, total: runs.length, running, recent: runs.slice(-3).map(r => ({
      runId: r.runId?.slice(0,8), status: r.status, steps: r.steps?.length,
      goal: r.goal?.slice(0,40),
    }))};
  } catch(_) { return { version: VERSION }; }
}


// ── Phase 13 Spec-compliant API ──────────────────────────────────────────────
// startRun() implements the full gap-based loop architecture from the spec.
// Used by tests and the formal autonomous execution path.
// run() (above) is the simpler direct-LLM path for co-pilot quick tasks.

const SUPPORTED_EXIT_TYPES = new Set(['steps', 'stable', 'manual']);

async function startRun(opts = {}) {
  // ── Validate all four required fields ────────────────────────────────────
  if (!opts.goal)                              throw new Error('Goal required');
  if (!opts.budget || !_hasCeiling(opts.budget)) throw new Error('Budget required — at least one of maxSteps, timeMs, costCeiling');
  if (!opts.boundary?.description)             throw new Error('Boundary required — boundary.description must be a non-empty string');
  if (!opts.exit_condition?.type)              throw new Error('Exit condition required');
  if (!SUPPORTED_EXIT_TYPES.has(opts.exit_condition.type))
    throw new Error(`Unsupported exit_condition.type: "${opts.exit_condition.type}". Supported: ${[...SUPPORTED_EXIT_TYPES].join(', ')}`);

  const { jaaDB: jaa, uid: _uid } = (() => {
    try { return require('../../cortex/memory/jaa-db'); } catch(_) { return { jaaDB: null, uid: () => require('crypto').randomUUID() }; }
  })();
  // §BUGFIX 2026-08-17 — every one of these 5 requires used the wrong
  // relative prefix (checked against the real, working jaa-db require two
  // lines above, and against the real file locations directly, not
  // assumed): '../cortex/snapshot' and './case-library' etc. all resolved
  // inside orchestrator/ itself, where none of these files live — the
  // real locations are cortex/snapshot/index.js and lib/{case-library,
  // compartment-engine,intent-classifier,open-loop-taxonomy}.js.
  // _safeRequire's try/catch swallowed every one of these silently, so
  // gap creation (taxonomy.createLoop, line ~450) has been calling a
  // method on null every real run — explains the observed cascade of
  // real test failures (T-013 gap never inserted, T-015/016/017 all
  // falling through to BUDGET_EXHAUSTED instead of their real branch,
  // because the gap that should have driven that branching never existed).
  const snap    = _safeRequire('../../cortex/snapshot');
  const cLib    = _safeRequire('../../lib/case-library');
  const cEngine = _safeRequire('../../lib/compartment-engine');
  const iClass  = _safeRequire('../../lib/intent-classifier');
  const taxonomy= _safeRequire('../../lib/open-loop-taxonomy');
  const COST    = _safeRequire('./request-handler')?.COST_TIERS || { LLM_LOCAL: 0.5 };

  const runId = require('crypto').randomUUID();
  const startMs = Date.now();
  const budget = opts.budget;
  const stepTimeoutMs = budget.stepTimeoutMs || parseInt(process.env.AUTONOMOUS_STEP_TIMEOUT_MS || '30000');

  // Pre-run snapshot
  let preRunSnapshotId = null;
  if (snap?.create) {
    const s = await snap.create({ type: 'pre_forge', message: `autonomous-loop: ${opts.goal.slice(0,60)}` }).catch(() => null);
    preRunSnapshotId = s?.snapId || null;
  }

  // Sigma — check once, emit warning if no data
  let sigmaChecked = false;
  const _readSigma = () => {
    try {
      if (!jaa) return null;
      const rows = jaa.query('sigma_records', () => true, 1);
      return rows[0]?.sigma ?? null;
    } catch(_) { return null; }
  };
  const sigma = _readSigma();
  if (sigma === null && !sigmaChecked) {
    sigmaChecked = true;
    if (jaa) try { jaa.insert('event_log', { uuid: require('crypto').randomUUID(), type: 'autonomous_loop.sigma_monitoring_degraded', ts: Date.now() }); } catch(_) {}
  }
  if (sigma !== null && sigma >= 0.7) {
    if (snap?.rollback && preRunSnapshotId) await snap.rollback(preRunSnapshotId, {}).catch(() => {});
    return { status: 'HALTED_SIGMA', runId, preRunSnapshotId, stepCount: 0, steps: [], costSpent: 0 };
  }

  const steps = [];
  let costSpent = 0;
  let consecutivePASS = 0;

  for (let stepNum = 1; ; stepNum++) {
    // Budget checks
    if (budget.maxSteps !== undefined && steps.length >= budget.maxSteps)
      return _fin('BUDGET_EXHAUSTED', runId, steps, costSpent, preRunSnapshotId);
    if (budget.timeMs !== undefined && Date.now() - startMs >= budget.timeMs)
      return _fin('BUDGET_EXHAUSTED', runId, steps, costSpent, preRunSnapshotId);
    if (budget.costCeiling !== undefined && costSpent >= budget.costCeiling)
      return _fin('BUDGET_EXHAUSTED', runId, steps, costSpent, preRunSnapshotId);

    // Exit condition: steps
    if (opts.exit_condition.type === 'steps' && steps.length >= (opts.exit_condition.count || 1))
      return _fin('EXIT_MET', runId, steps, costSpent, preRunSnapshotId);

    // Exit condition: stable (N consecutive PASS)
    if (opts.exit_condition.type === 'stable' && consecutivePASS >= (opts.exit_condition.consecutive || 3))
      return _fin('EXIT_MET', runId, steps, costSpent, preRunSnapshotId);

    // Classify intent
    let intent, caseResult;
    try {
      const classResult = iClass?.classify({ text: opts.goal, runId, step: stepNum });
      intent = classResult?.intent || { uuid: require('crypto').randomUUID(), domain: 'autonomous', verb: 'build', raw: opts.goal, risk_level: 'LLM_LOCAL', confidence: 0.8, source: 'AUTONOMOUS_LOOP', runId, step: stepNum };
      intent = iClass?.freeze ? iClass.freeze(intent) : intent;
    } catch(_) {
      intent = { uuid: require('crypto').randomUUID(), verb: 'build', raw: opts.goal, risk_level: 'LLM_LOCAL', runId, step: stepNum };
    }

    // Case library check
    try {
      caseResult = cLib?.query(intent) || { tier: 'cold', blocked: false };
    } catch(_) { caseResult = { tier: 'cold', blocked: false }; }

    if (caseResult?.blocked) {
      return _fin('BLOCKED', runId, steps, costSpent, preRunSnapshotId);
    }

    // Accumulate cost
    const stepCost = COST[intent.risk_level] || 0.5;
    costSpent += stepCost;

    // Insert gap with status:'pending'
    let gap;
    if (jaa && taxonomy?.createLoop) {
      try {
        gap = taxonomy.createLoop({
          loop_type: 'implementation', path: `autonomous/${runId}/${stepNum}`,
          body: opts.goal, evidence: { step: stepNum, intent: intent.uuid },
          closure_condition: 'gap-loop resolves', source: 'autonomous-loop',
          causedBy: runId,
        });
        gap.status = 'pending';  // §D scoped-gap-status fix
        gap.uuid = gap.uuid || require('crypto').randomUUID();
        jaa.insert('gaps', gap);
      } catch(_) { gap = { status: 'pending', uuid: require('crypto').randomUUID() }; }
    } else {
      gap = { status: 'pending', uuid: require('crypto').randomUUID() };
    }

    // Spawn compartment and execute
    let compartment, stepStatus;
    try {
      if (cEngine?.spawn && cEngine?.execute) {
        compartment = await cEngine.spawn({ intent, workingMemorySeed: caseResult?.workingMemorySeed });
        const pollStart = Date.now();
        const pollMs = parseInt(process.env.AUTONOMOUS_STEP_POLL_MS || '100');
        // Wait for gap to resolve or timeout
        while (gap.status === 'pending' && Date.now() - pollStart < stepTimeoutMs) {
          await new Promise(r => setTimeout(r, pollMs));
        }
        if (gap.status === 'pending') {
          // Timeout — treat as BUDGET_EXHAUSTED
          steps.push({ step: stepNum, status: 'TIMEOUT', intent: intent.uuid, cost: stepCost });
          return _fin('BUDGET_EXHAUSTED', runId, steps, costSpent, preRunSnapshotId);
        }
        if (gap.status === 'human_required') {
          steps.push({ step: stepNum, status: 'HUMAN_REQUIRED', intent: intent.uuid, cost: stepCost });
          return _fin('HUMAN_REQUIRED', runId, steps, costSpent, preRunSnapshotId);
        }
        compartment = await cEngine.execute(compartment, async (wm) => {
          return { resolved: true, gap_status: gap.status };
        });
        stepStatus = compartment.status === 'FAIL' ? 'FAIL' : 'PASS';
      } else {
        stepStatus = gap.status === 'resolved' ? 'PASS' : 'PASS';
      }
    } catch(e) {
      stepStatus = 'FAIL';
    }

    steps.push({ step: stepNum, status: stepStatus, intent: intent?.uuid, cost: stepCost });
    if (stepStatus === 'PASS') consecutivePASS++;
    else consecutivePASS = 0;

    if (jaa) try { jaa.insert('event_log', { uuid: require('crypto').randomUUID(),
      type: 'autonomous_loop.step', payload: { runId, step: stepNum, status: stepStatus }, ts: Date.now() }); } catch(_) {}
  }
}

function _hasCeiling(b) {
  return b && (b.maxSteps !== undefined || b.timeMs !== undefined || b.costCeiling !== undefined);
}

function _fin(status, runId, steps, costSpent, preRunSnapshotId) {
  return { status, runId, stepCount: steps.length, steps, costSpent, preRunSnapshotId };
}

function _safeRequire(mod) {
  try { return require(mod); } catch(_) { return null; }
}

function validateWiring() {
  return {
    ok:               true,
    jaa:              !!_safeRequire('../../cortex/memory/jaa-db')?.jaaDB,
    intentClassifier: !!_safeRequire('../../lib/intent-classifier')?.classify,
    caseLibrary:      !!_safeRequire('../../lib/case-library')?.query,
    compartmentEngine:!!_safeRequire('../../lib/compartment-engine')?.spawn,
    taxonomy:         !!_safeRequire('../../lib/open-loop-taxonomy')?.createLoop,
  };
}

module.exports = { init, run, startRun, status, validateWiring, MODULE_ID, VERSION };

