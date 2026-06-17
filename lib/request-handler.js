'use strict';
// ── lib/request-handler.js ────────────────────────────────────────────────────
// UUID: nexus-request-handler-v1-0000-4000-0000-000000000001
// Version: 1.0.0
//
// THE CONSTITUTIONAL CHOKE POINT.
//
// Every request that enters NEXUS flows through here.
// No bypasses. No exceptions.
// ALL_REQUESTS_FLOW_THROUGH_HANDLER = FATAL if violated.
//
// ── PIPELINE ─────────────────────────────────────────────────────────────────
//
//   Phase A: Should we act?
//     intent extraction → goal graph check → constitution check → cost estimate
//     → ALLOW | DEFER | DENY | CLARIFY | HELD | UNRESOLVED
//
//   Phase B: How?
//     grammar resolve → SNR filter → memory recall → RAID route → execute
//
//   Phase C: Reflect
//     Was this worth doing?
//     decision + reason + outcome logged to JAA
//
//   Phase D: Learn
//     memory update → crystallisation candidate → gap registration
//
// ── OUTCOMES ─────────────────────────────────────────────────────────────────
//   RESOLVED            — completed, outcome recorded
//   DEFERRED            — valid but not now (TEMPORAL loop)
//   DENIED              — violates constitution or cost ceiling
//   CLARIFICATION_REQUIRED — UNDERSTANDING loop, need more context
//   HELD                — intentionally preserved open loop
//   UNRESOLVED          — cannot determine correct action (first-class state)
//
// HELD ≠ UNRESOLVED:
//   HELD       = We know and are intentionally waiting
//   UNRESOLVED = We genuinely don't know what to do — recorded with full context
//
// ── AXIOMS ───────────────────────────────────────────────────────────────────
// §1.1  Every request has a UUID before it touches anything
// §1.2  Every decision logged — nothing silent
// §2.1  Snapshot before any destructive or irreversible action
// §4.3  Enterprise-grade: cost ceiling enforced, blast radius checked
// §5.1  Every request on the bus
// USER_AUTONOMY        — user intent is respected unless constitution violated
// REVERSIBILITY        — prefer reversible actions; flag irreversible ones
// TRUTH_OVER_COHERENCE — surface uncertainty rather than fabricate confidence
// EXPLAINABILITY       — every DENY/DEFER/HELD has a reason the user can read

const crypto = require('crypto');

const MODULE_ID = 'request-handler';
const VERSION   = '1.0.0';

// ── Outcome constants ─────────────────────────────────────────────────────────
const OUTCOME = {
  RESOLVED:               'RESOLVED',
  DEFERRED:               'DEFERRED',
  DENIED:                 'DENIED',
  CLARIFICATION_REQUIRED: 'CLARIFICATION_REQUIRED',
  HELD:                   'HELD',
  UNRESOLVED:             'UNRESOLVED',
};

// ── Cost tiers ────────────────────────────────────────────────────────────────
// Every action has an estimated cost. Requests above ceiling → DEFER or DENY.
const COST_TIERS = {
  READ:        0.1,   // memory read, status check
  COMPUTE:     0.3,   // local reasoning, grammar resolve
  LLM_LOCAL:  0.5,   // Ollama inference
  LLM_REMOTE: 0.8,   // Claude/ChatGPT via NCP
  FORGE:       0.9,   // code modification
  IRREVERSIBLE:1.0,   // rollback, delete, overwrite
};

const DEFAULT_COST_CEILING = parseFloat(process.env.NEXUS_COST_CEILING || '0.85');

// ── Lazy-load dependencies (never block boot) ─────────────────────────────────
let _jaa, _uid, _bus, _grammar, _snr, _raid, _memory, _chat, _replay, _liminal;

function _getJAA() {
  if (_jaa) return _jaa;
  try { ({ jaaDB: _jaa, uid: _uid } = require('../cortex/memory/jaa-db')); } catch(_) {}
  return _jaa;
}
function uid() { return _uid?.() ?? crypto.randomUUID(); }

function _getBus() {
  if (_bus) return _bus;
  try { _bus = require('../nexus-bus'); } catch(_) {}
  return _bus;
}
function _getGrammar() {
  if (_grammar) return _grammar;
  try { _grammar = require('./grammar-engine'); } catch(_) {}
  return _grammar;
}
function _getSNR() {
  if (_snr) return _snr;
  try { _snr = require('../cortex/core/raid/snr-filter'); } catch(_) {}
  return _snr;
}
function _getRAID() {
  if (_raid) return _raid;
  try { _raid = require('../cortex/core/raid/index'); } catch(_) {}
  return _raid;
}
function _getMemory() {
  if (_memory) return _memory;
  try { _memory = require('./vector-memory'); } catch(_) {}
  return _memory;
}
function _getChat() {
  if (_chat) return _chat;
  try { _chat = require('./chat-logger'); } catch(_) {}
  return _chat;
}
function _getReplay() {
  if (_replay) return _replay;
  try { _replay = require('./replay-engine'); } catch(_) {}
  return _replay;
}
function _getLiminal() {
  if (_liminal) return _liminal;
  try { _liminal = require('../cortex/liminal-space/index'); } catch(_) {}
  return _liminal;
}

// ── Intent extraction ─────────────────────────────────────────────────────────
// Pull structured intent from a raw request.
function _extractIntent(req) {
  const text = req.prompt || req.command || req.body || req.text || '';
  const words = text.toLowerCase().match(/\b\w+\b/g) || [];

  // Classify primary action
  const READ_SIGNALS   = ['what','show','get','list','status','check','query','find','search','recall'];
  const WRITE_SIGNALS  = ['create','add','insert','write','save','update','patch','set'];
  const FORGE_SIGNALS  = ['forge','fix','repair','apply','patch','build','generate','refactor'];
  const DELETE_SIGNALS = ['delete','remove','drop','rollback','rewind','undo'];
  const ASK_SIGNALS    = ['how','why','explain','describe','what is','who','when','where'];

  let action = 'unknown';
  if (words.some(w => READ_SIGNALS.includes(w)))   action = 'read';
  if (words.some(w => ASK_SIGNALS.includes(w)))    action = 'ask';
  if (words.some(w => WRITE_SIGNALS.includes(w)))  action = 'write';
  if (words.some(w => FORGE_SIGNALS.includes(w)))  action = 'forge';
  if (words.some(w => DELETE_SIGNALS.includes(w))) action = 'delete';

  // Target system
  const SYSTEMS = ['cortex','guardian','bridge','idearium','orchestrator','emerge','raid','gap','memory'];
  const target = SYSTEMS.find(s => text.toLowerCase().includes(s)) || null;

  return {
    text,
    action,
    target,
    words: words.slice(0, 20),
    isQuestion:  /\?$/.test(text.trim()) || words.some(w => ASK_SIGNALS.includes(w)),
    isEmpty:     !text.trim(),
  };
}

// ── Goal graph check ──────────────────────────────────────────────────────────
// Does this request serve the system's current goals?
// Simplified: check against open gaps + active fault classes.
function _goalGraphCheck(intent, jaa) {
  if (!jaa) return { aligned: true, reason: 'no-jaa' };

  // Delete/rollback actions on healthy systems → flag
  if (intent.action === 'delete' || intent.action === 'rollback') {
    const openFaults = jaa.query('fault_taxonomy', r => r.friction > 0.8, 5);
    if (!openFaults.length) {
      return {
        aligned: false,
        reason:  'Destructive action requested with no active fault. Confirm intent.',
        cost:    COST_TIERS.IRREVERSIBLE,
      };
    }
  }

  return { aligned: true, reason: 'goal-aligned' };
}

// ── Constitution check ────────────────────────────────────────────────────────
// Hard rules. These cannot be overridden by any request.
function _constitutionCheck(intent, req) {
  // No API keys for AI inference — ever
  if (/api[_-]?key|openai\.com|anthropic\.com\/v1(?!\/messages via ncp)/i.test(intent.text)) {
    return {
      pass:   false,
      axiom:  'NO_EXTERNAL_AI_API',
      reason: 'NEXUS uses NCP browser tabs for AI inference. No external API calls.',
    };
  }

  // No silent data deletion
  if (intent.action === 'delete' && !req.confirmed) {
    return {
      pass:   false,
      axiom:  'REVERSIBILITY',
      reason: 'Deletion requires explicit confirmation. Set req.confirmed = true.',
    };
  }

  // Provider must be specified for forge actions
  if (intent.action === 'forge' && !req.provider && !req.skipProvider) {
    return {
      pass:   false,
      axiom:  'EXPLAINABILITY',
      reason: 'Forge actions require a provider (ollama | claude | chatgpt). Set req.provider.',
    };
  }

  return { pass: true };
}

// ── Cost estimation ───────────────────────────────────────────────────────────
function _estimateCost(intent, req) {
  if (intent.action === 'read' || intent.action === 'ask') return COST_TIERS.COMPUTE;
  if (intent.action === 'write') return COST_TIERS.LLM_LOCAL;
  if (intent.action === 'forge') {
    return req.provider === 'ollama' ? COST_TIERS.LLM_LOCAL : COST_TIERS.LLM_REMOTE;
  }
  if (intent.action === 'delete') return COST_TIERS.IRREVERSIBLE;
  return COST_TIERS.LLM_REMOTE; // unknown → assume expensive
}

// ── Phase A: Should we act? ───────────────────────────────────────────────────
async function _phaseA(req, ctx) {
  const { intent, jaa, requestId, costCeiling } = ctx;

  // A1: Empty request → CLARIFICATION_REQUIRED
  if (intent.isEmpty) {
    return {
      outcome: OUTCOME.CLARIFICATION_REQUIRED,
      reason:  'Empty request. What would you like NEXUS to do?',
      phase:   'A1',
    };
  }

  // A2: Unknown intent after grammar fails → UNDERSTANDING loop
  if (intent.action === 'unknown' && !req.provider) {
    // Try grammar engine for structured resolution
    const grammar = _getGrammar();
    if (grammar) {
      try {
        const resolved = grammar.resolve(intent.text);
        if (resolved?.componentId) {
          ctx.grammarResolved = resolved;
          // Grammar knows what this is — allow with context
        }
      } catch(_) {}
    }
  }

  // A3: Goal graph — does this serve current objectives?
  const goal = _goalGraphCheck(intent, jaa);
  if (!goal.aligned) {
    return {
      outcome: OUTCOME.HELD,
      reason:  goal.reason,
      phase:   'A3',
      held:    { intent: intent.action, target: intent.target },
    };
  }

  // A4: Constitution — hard rules
  const constitution = _constitutionCheck(intent, req);
  if (!constitution.pass) {
    return {
      outcome: OUTCOME.DENIED,
      reason:  constitution.reason,
      axiom:   constitution.axiom,
      phase:   'A4',
    };
  }

  // A5: Cost ceiling
  const cost = _estimateCost(intent, req);
  ctx.estimatedCost = cost;
  if (cost > costCeiling) {
    return {
      outcome: OUTCOME.DEFERRED,
      reason:  `Estimated cost ${cost.toFixed(2)} exceeds ceiling ${costCeiling.toFixed(2)}. Set req.costCeiling to override.`,
      cost,
      phase:   'A5',
    };
  }

  return { outcome: OUTCOME.RESOLVED, phase: 'A-pass', cost };
}

// ── Phase B: How? ─────────────────────────────────────────────────────────────
async function _phaseB(req, ctx) {
  const { intent, jaa, requestId } = ctx;
  let result = null;

  // B1: Grammar resolve — structured command?
  if (ctx.grammarResolved) {
    const { componentId, params } = ctx.grammarResolved;
    result = { source: 'grammar', componentId, params };
  }

  // B2: SNR filter — is this answerable from invariants/patterns before hitting AI?
  const snr = _getSNR();
  if (snr && !result) {
    try {
      const snrResult = snr.filter({
        intent: intent.text,
        cluster: intent.target || 'general',
        faultClass: null,
      });
      if (!snrResult.dispatch) {
        // SNR resolved it — no AI needed
        result = { source: 'snr', ...snrResult };
      }
      ctx.snrResult = snrResult;
    } catch(_) {}
  }

  // B3: Memory recall — relevant context
  const memory = _getMemory();
  if (memory) {
    try {
      const recalled = await memory.search(intent.text, { n: 5, snrThreshold: 0.4 });
      ctx.memoryContext = recalled || [];
    } catch(_) { ctx.memoryContext = []; }
  }

  // B4: RAID routing — pick agent
  if (!result) {
    const raid = _getRAID();
    if (raid?._decide && raid?._health && raid?._weights) {
      try {
        const routingDecision = raid._decide(
          { uuid: requestId, intent: intent.text, prompt: intent.text,
            context: { action: intent.action, target: intent.target,
                       memoryContext: ctx.memoryContext?.length || 0 } },
          raid._health,
          raid._weights,
        );
        ctx.raidDecision = routingDecision;
        result = { source: 'raid', agent: routingDecision.agent, cluster: routingDecision.cluster };
      } catch(_) {}
    }
  }

  // B5: Execute
  if (result?.source === 'snr' && result.result) {
    // SNR has a cached answer
    return {
      executed: true,
      source:   'snr',
      response: result.result,
      tokens:   result.tokens,
      snr:      result.snr,
    };
  }

  if (result?.source === 'grammar' && result.componentId) {
    // Grammar resolved to a component — return routing info for caller to execute
    return {
      executed: false,  // caller executes against the component
      source:   'grammar',
      componentId: result.componentId,
      params:   result.params,
    };
  }

  if (result?.source === 'raid') {
    // RAID picked an agent — return dispatch info for caller
    return {
      executed: false,
      source:   'raid',
      agent:    result.agent,
      cluster:  result.cluster,
      prompt:   intent.text,
      context:  ctx.memoryContext,
    };
  }

  // B6: Fallthrough — couldn't route
  return {
    executed: false,
    source:   'unrouted',
    prompt:   intent.text,
  };
}

// ── Phase C: Reflect ──────────────────────────────────────────────────────────
// Was this worth doing? Record decision + reason + outcome.
function _phaseC(ctx, phaseAResult, phaseBResult, executionResult) {
  const jaa    = _getJAA();
  const replay = _getReplay();

  const decision = {
    requestId:   ctx.requestId,
    actor:       MODULE_ID,
    input:       ctx.intent.text,
    output:      executionResult?.response || phaseBResult?.agent || phaseAResult?.reason,
    chosen:      phaseAResult?.outcome || OUTCOME.UNRESOLVED,
    alternatives:_getAlternatives(phaseAResult, phaseBResult),
    cost: {
      tokens:     executionResult?.tokens || 0,
      timeMs:     Date.now() - ctx.startTs,
      complexity: ctx.estimatedCost || 0,
    },
    outcome:     executionResult ? 'executed' : phaseAResult?.outcome,
    satisfaction:null,  // filled in later via feedback
  };

  // Log to replay engine
  if (replay) {
    try { replay.logDecision({ ...decision, snapshotId: ctx.snapshotId }); } catch(_) {}
  }

  // Log to JAA
  if (jaa) {
    try {
      jaa.insert('event_log', {
        uuid:    uid(),
        type:    `request.${(phaseAResult?.outcome || 'processed').toLowerCase()}`,
        payload: decision,
        source:  MODULE_ID,
        causedBy:ctx.requestId,
        ts:      Date.now(),
      });
    } catch(_) {}
  }

  return decision;
}

function _getAlternatives(phaseAResult, phaseBResult) {
  const alts = [];
  if (phaseAResult?.outcome === OUTCOME.DENIED)  alts.push('HELD', 'CLARIFICATION_REQUIRED');
  if (phaseAResult?.outcome === OUTCOME.DEFERRED) alts.push('DENIED', 'HELD');
  if (phaseBResult?.source === 'raid')            alts.push('ollama', 'claude', 'chatgpt');
  return alts;
}

// ── Phase D: Learn ────────────────────────────────────────────────────────────
async function _phaseD(ctx, phaseAResult, phaseBResult, executionResult) {
  // D1: Memory update
  const chat = _getChat();
  if (chat && executionResult?.response) {
    try {
      await chat.log({
        role:    'assistant',
        content: executionResult.response,
        source:  phaseBResult?.agent || 'system',
        meta:    { requestId: ctx.requestId, outcome: phaseAResult?.outcome },
      });
    } catch(_) {}
  }

  // D2: Gap registration for UNRESOLVED or HELD
  const jaa = _getJAA();
  if (jaa && [OUTCOME.UNRESOLVED, OUTCOME.HELD].includes(phaseAResult?.outcome)) {
    try {
      const taxonomy = require('./open-loop-taxonomy');
      const loopType = phaseAResult?.outcome === OUTCOME.HELD ? 'DECISION' : 'UNDERSTANDING';
      const loop = taxonomy.createLoop({
        loop_type:         loopType,
        source:            MODULE_ID,
        path:              `request/${ctx.requestId?.slice(0,8)}`,
        body:              ctx.intent.text.slice(0, 200),
        evidence:          [phaseAResult?.reason].filter(Boolean),
        closure_condition: 'User provides clarification or system gains sufficient context',
        causedBy:          ctx.requestId,
      });
      jaa.insert('gaps', { uuid: uid(), ...loop, createdAt: Date.now() });
    } catch(_) {}
  }

  // D3: Feed outcome back to RAID weights
  const raid = _getRAID();
  if (raid?._decide && ctx.raidDecision && executionResult) {
    const satisfaction = executionResult.response ? 1 : 0;
    try {
      const jaa2 = _getJAA();
      if (jaa2) {
        jaa2.insert('event_log', {
          uuid: uid(), type: 'user.satisfied',
          payload: { agent: ctx.raidDecision.agent, satisfied: !!executionResult.response,
                     requestId: ctx.requestId, cluster: ctx.raidDecision.cluster },
          source: MODULE_ID, causedBy: ctx.requestId, ts: Date.now(),
        });
      }
    } catch(_) {}
  }
}

// ── Main entry point ──────────────────────────────────────────────────────────
// handle(req, opts) → { requestId, outcome, reason?, result?, decision }
//
// req: {
//   prompt?:      string — natural language or command
//   command?:     string — explicit command (grammar-resolved first)
//   provider?:    'ollama' | 'claude' | 'chatgpt' | 'gemini'
//   confirmed?:   boolean — explicit user confirmation for destructive actions
//   skipProvider?:boolean — allow forge without provider (test/internal)
//   costCeiling?: number  — override default 0.85
//   meta?:        object  — caller context (session, jobId, etc.)
// }
async function handle(req = {}, opts = {}) {
  const requestId    = uid();
  const startTs      = Date.now();
  const costCeiling  = req.costCeiling ?? opts.costCeiling ?? DEFAULT_COST_CEILING;
  const jaa          = _getJAA();
  const bus          = _getBus();

  // §1.1 — UUID before touching anything
  const intent = _extractIntent(req);

  const ctx = {
    requestId,
    startTs,
    intent,
    jaa,
    costCeiling,
    snapshotId:    null,
    grammarResolved: null,
    raidDecision:  null,
    snrResult:     null,
    memoryContext: [],
    estimatedCost: 0,
  };

  // §5.1 — every request on the bus
  if (bus?.emit) {
    try { bus.emit('request.received', { requestId, intent: intent.action, target: intent.target }); } catch(_) {}
  }

  // §1.1 — log to JAA before processing
  if (jaa) {
    try {
      jaa.insert('requests', {
        uuid:      requestId,
        intent:    intent.text?.slice(0, 200),
        action:    intent.action,
        target:    intent.target,
        provider:  req.provider || null,
        status:    'processing',
        ts:        startTs,
        source:    req.meta?.source || 'api',
      });
    } catch(_) {}
  }

  let phaseAResult, phaseBResult, executionResult;

  try {
    // ── Phase A: Should we act? ──────────────────────────────────────────────
    phaseAResult = await _phaseA(req, ctx);

    if (phaseAResult.outcome !== OUTCOME.RESOLVED) {
      // Non-RESOLVED outcomes: reflect + learn, then return
      const decision = _phaseC(ctx, phaseAResult, null, null);
      await _phaseD(ctx, phaseAResult, null, null);
      _updateRequestStatus(jaa, requestId, phaseAResult.outcome);
      return {
        requestId,
        outcome:  phaseAResult.outcome,
        reason:   phaseAResult.reason,
        axiom:    phaseAResult.axiom,
        phase:    phaseAResult.phase,
        decision,
        durationMs: Date.now() - startTs,
      };
    }

    // ── Phase B: How? ────────────────────────────────────────────────────────
    phaseBResult = await _phaseB(req, ctx);

    // §2.1 — snapshot before any forge/irreversible action
    if (intent.action === 'forge' || intent.action === 'delete') {
      try {
        const snap = require('../cortex/snapshot/index');
        const s = snap.create({ type: 'pre_forge', message: `request-handler: ${intent.action} ${intent.target || ''}`, causedBy: requestId });
        ctx.snapshotId = s?.snapId;
      } catch(_) {}
    }

    // Pass through the routing decision — caller executes
    executionResult = req._execute
      ? await req._execute(phaseBResult, ctx)
      : null;

    // ── Phase C: Reflect ─────────────────────────────────────────────────────
    const decision = _phaseC(ctx, phaseAResult, phaseBResult, executionResult);

    // ── Phase D: Learn ───────────────────────────────────────────────────────
    await _phaseD(ctx, phaseAResult, phaseBResult, executionResult);

    _updateRequestStatus(jaa, requestId, OUTCOME.RESOLVED);

    return {
      requestId,
      outcome:    OUTCOME.RESOLVED,
      result:     phaseBResult,
      executed:   phaseBResult?.executed || false,
      execution:  executionResult,
      snapshotId: ctx.snapshotId,
      decision,
      durationMs: Date.now() - startTs,
    };

  } catch(err) {
    // §1.2 — nothing silent — handler itself must not crash callers
    const errOutcome = {
      outcome: OUTCOME.UNRESOLVED,
      reason:  `Handler error: ${err.message}`,
      phase:   'error',
    };
    try { _phaseC(ctx, errOutcome, null, null); } catch(_) {}
    _updateRequestStatus(jaa, requestId, OUTCOME.UNRESOLVED);

    if (jaa) {
      try {
        jaa.insert('failures', {
          uuid: uid(), source: MODULE_ID,
          error: err.message, stack: err.stack?.slice(0, 500),
          causedBy: requestId, ts: Date.now(),
        });
      } catch(_) {}
    }

    return {
      requestId,
      outcome:    OUTCOME.UNRESOLVED,
      reason:     err.message,
      durationMs: Date.now() - startTs,
    };
  }
}

function _updateRequestStatus(jaa, requestId, status) {
  if (!jaa) return;
  try { jaa.update('requests', requestId, { status, completedAt: Date.now() }); } catch(_) {}
}

// ── Convenience: handle a plain text prompt ───────────────────────────────────
async function prompt(text, opts = {}) {
  return handle({ prompt: text, ...opts });
}

// ── Validate wiring (§AXIOM check) ───────────────────────────────────────────
// Call at boot to verify the handler is reachable.
function validateWiring() {
  const checks = {
    jaa:     !!_getJAA(),
    grammar: !!_getGrammar(),
    snr:     !!_getSNR(),
    raid:    !!_getRAID(),
    memory:  !!_getMemory(),
    replay:  !!_getReplay(),
  };
  const online = Object.values(checks).filter(Boolean).length;
  console.log(`[${MODULE_ID}] wiring: ${online}/${Object.keys(checks).length} systems reachable`);
  return checks;
}

module.exports = {
  handle, prompt, validateWiring,
  OUTCOME, COST_TIERS, DEFAULT_COST_CEILING,
  MODULE_ID, VERSION,
};
