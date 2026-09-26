'use strict';
// ── lib/intent-classifier.js ─────────────────────────────────────────────────
// UUID: nexus-intent-classifier-v1-0000-4500-0000-000000000001
// Version: 1.0.0
// Phase: 45 — Intent Classifier: RAID Entry Gate
//
// Every request — from user, orchestrator, or autonomous loop — enters RAID
// through this gate. Raw input is never handed directly to cluster selection.
// Intent is the first deterministic transformation step.
//
// INTENT object (immutable once RAID begins):
//   uuid            §1.1 — assigned at gate, propagated through entire execution
//   domain          what system area this touches
//   verb            canonical action
//   objects         what the verb acts on
//   constraints     hard limits declared in the request
//   risk_level      READ · COMPUTE · LLM_LOCAL · LLM_REMOTE · FORGE · IRREVERSIBLE
//   confidence      classifier confidence in this parse (0–1)
//   execution_class DETERMINISTIC · INFERENTIAL · GENERATIVE · AUTONOMOUS
//   source          USER · ORCHESTRATOR · AUTONOMOUS_LOOP · GUARDIAN
//   raw             original input preserved verbatim, never modified
//
// Revisable before execution. Frozen at execution start.
// Low confidence → emit intent.low_confidence gap. Never silently proceed.
//
// AXIOMS:
//   §1.1  UUID assigned before any routing decision
//   §1.2  Every classification logged to JAA — nothing silent
//   §2.1  Intent written to disk before dispatch
//   §5.1  UUID+hook+bus on every intent object
//
// Deps: jaa ✓ · request-handler ✓ · gap-loop ✓
// Unlocks: Phase 46 (case library), Phase 25 (compartment engine),
//          Phase 31 (grammar ↔ intent), Phase 13 (autonomous loop)

const { jaaDB, uid } = require('../cortex/memory/jaa-db');

const MODULE_ID = 'intent-classifier';
const VERSION   = '1.0.0';

// ── Risk levels (aligned with request-handler cost tiers) ────────────────────
const RISK_LEVEL = {
  READ:        'READ',        // 0.1 — memory read, status check
  COMPUTE:     'COMPUTE',     // 0.3 — local reasoning, grammar resolve
  LLM_LOCAL:   'LLM_LOCAL',   // 0.5 — Ollama inference
  LLM_REMOTE:  'LLM_REMOTE',  // 0.8 — Claude/ChatGPT via NCP
  FORGE:       'FORGE',       // 0.9 — code modification
  IRREVERSIBLE: 'IRREVERSIBLE', // 1.0 — rollback, delete, overwrite
};

// ── Execution classes ─────────────────────────────────────────────────────────
const EXEC_CLASS = {
  DETERMINISTIC: 'DETERMINISTIC', // grammar/SNR resolves it — zero LLM
  INFERENTIAL:   'INFERENTIAL',   // local LLM (Ollama) sufficient
  GENERATIVE:    'GENERATIVE',    // remote LLM required
  AUTONOMOUS:    'AUTONOMOUS',    // autonomous loop — carries runId + causedBy
};

// ── Source types ──────────────────────────────────────────────────────────────
const SOURCE = {
  USER:           'USER',
  ORCHESTRATOR:   'ORCHESTRATOR',
  AUTONOMOUS_LOOP: 'AUTONOMOUS_LOOP',
  GUARDIAN:       'GUARDIAN',
};

// ── Confidence threshold below which we emit a gap ───────────────────────────
const LOW_CONFIDENCE_THRESHOLD = parseFloat(process.env.NEXUS_INTENT_CONFIDENCE_FLOOR || '0.45');

// ── Domain map ────────────────────────────────────────────────────────────────
// Maps text patterns to system domains. Order matters — first match wins.
const DOMAIN_PATTERNS = [
  { domain: 'cortex',      re: /\b(cortex|memory|jaa|recall|forget|gaps?|crystal|lattice|invariant|snapshot|open.loop|fault)\b/i },
  { domain: 'guardian',    re: /\b(guardian|dispatch|job|provider|claude|ollama|chatgpt|gemini|perplexity|ncp|route)\b/i },
  { domain: 'orchestrator',re: /\b(orchestrator|health|status|channel|bus|sse|event|api.map|push)\b/i },
  { domain: 'idearium',    re: /\b(idea|idearium|spec|blueprint|plan|note|capture|promote|tension)\b/i },
  { domain: 'auth',        re: /\b(auth|token|jwt|rsa|key|session|permission|policy)\b/i },
  { domain: 'bridge',      re: /\b(bridge|peer|p2p|mesh|circuit|ledger|identity|causal)\b/i },
  { domain: 'emerge',      re: /\b(emerge|forge|compile|scaffold|codegen|seam|t1|t2)\b/i },
  { domain: 'architect',   re: /\b(architect|ui|interface|component|render|layout|designer)\b/i },
  { domain: 'filesystem',  re: /\b(file|folder|directory|path|write|read|disk|repo|zip)\b/i },
  { domain: 'system',      re: /\b(system|nexus|restart|boot|shutdown|sigma|diverge|integrity)\b/i },
];

// ── Verb map ──────────────────────────────────────────────────────────────────
// Canonical verb extraction. Returns { verb, risk_level, execution_class }.
const VERB_PATTERNS = [
  // IRREVERSIBLE — must be flagged before anything else
  { verb: 'delete',   risk: RISK_LEVEL.IRREVERSIBLE, exec: EXEC_CLASS.DETERMINISTIC,
    re: /\b(delete|remove|destroy|wipe|purge|drop)\b/i },
  { verb: 'rollback', risk: RISK_LEVEL.IRREVERSIBLE, exec: EXEC_CLASS.DETERMINISTIC,
    re: /\b(rollback|revert|undo|restore)\b/i },
  { verb: 'overwrite',risk: RISK_LEVEL.IRREVERSIBLE, exec: EXEC_CLASS.DETERMINISTIC,
    re: /\b(overwrite|replace.file|clobber)\b/i },

  // FORGE — code/spec modification
  { verb: 'forge',    risk: RISK_LEVEL.FORGE, exec: EXEC_CLASS.GENERATIVE,
    re: /\b(forge|patch|repair|self.heal|autonomous.fix|hot.patch)\b/i },
  { verb: 'build',    risk: RISK_LEVEL.FORGE, exec: EXEC_CLASS.GENERATIVE,
    re: /\b(build|compile|scaffold|generate|emit|create.spec|make.spec)\b/i },
  { verb: 'write',    risk: RISK_LEVEL.FORGE, exec: EXEC_CLASS.GENERATIVE,
    re: /\b(write|implement|code|develop|refactor)\b/i },
  // §ADDED 2026-09-02 — James: "maybe intent: contract or officiator for
  // synthesizing contracts." A real, distinct act from 'build' (which
  // produces CODE) — this produces a real, structured B1-schema
  // CONTRACT from raw context/an artifact, the input TO a later build,
  // not the build itself. FORGE/GENERATIVE — same real risk tier as
  // build/write (an LLM call that produces real, structured output
  // other real systems will act on), not a lighter tier.
  { verb: 'officiate',risk: RISK_LEVEL.FORGE, exec: EXEC_CLASS.GENERATIVE,
    re: /\b(officiate|synthesize.contract|draft.contract|compose.contract)\b/i },

  // LLM_REMOTE — needs remote inference
  { verb: 'analyze',  risk: RISK_LEVEL.LLM_REMOTE, exec: EXEC_CLASS.GENERATIVE,
    re: /\b(analyze|analyse|audit|review|evaluate|diagnose.complex)\b/i },
  { verb: 'explain',  risk: RISK_LEVEL.LLM_REMOTE, exec: EXEC_CLASS.GENERATIVE,
    re: /\b(explain|describe|summarize|document)\b/i },

  // LLM_LOCAL — Ollama sufficient
  { verb: 'dispatch', risk: RISK_LEVEL.LLM_LOCAL, exec: EXEC_CLASS.INFERENTIAL,
    re: /\b(dispatch|send|route|ask|prompt)\b/i },
  { verb: 'diagnose', risk: RISK_LEVEL.LLM_LOCAL, exec: EXEC_CLASS.INFERENTIAL,
    re: /\b(diagnose|debug|trace|investigate|find.error)\b/i },

  // COMPUTE — local reasoning only
  { verb: 'heal',     risk: RISK_LEVEL.COMPUTE, exec: EXEC_CLASS.DETERMINISTIC,
    re: /\b(heal|fix|resolve.gap|close.gap|retry)\b/i },
  { verb: 'snapshot', risk: RISK_LEVEL.COMPUTE, exec: EXEC_CLASS.DETERMINISTIC,
    re: /\b(snapshot|checkpoint|capture.state)\b/i },
  { verb: 'validate', risk: RISK_LEVEL.COMPUTE, exec: EXEC_CLASS.DETERMINISTIC,
    re: /\b(validate|verify|check|test|prove|assert)\b/i },

  // READ — zero cost
  { verb: 'query',    risk: RISK_LEVEL.READ, exec: EXEC_CLASS.DETERMINISTIC,
    re: /\b(query|list|search|find|get|show|view|status|health|watch)\b/i },
  { verb: 'recall',   risk: RISK_LEVEL.READ, exec: EXEC_CLASS.DETERMINISTIC,
    re: /\b(recall|remember|fetch.memory|retrieve)\b/i },
];

// ── Object extraction ─────────────────────────────────────────────────────────
// Pulls the noun phrase the verb acts on from the raw text.
function _extractObjects(text, verb) {
  if (!text || !verb) return [];

  // Strip the verb and common stop words, take the meaningful remainder
  const stripped = text
    .replace(new RegExp(`\\b${verb}\\b`, 'gi'), '')
    .replace(/\b(the|a|an|my|your|all|some|this|that|from|to|in|on|at|by|for|with|about|please|now|just)\b/gi, '')
    .trim();

  // Split on common separators, filter noise
  const parts = stripped
    .split(/[\s,;]+/)
    .map(p => p.trim())
    .filter(p => p.length > 1 && !/^(and|or|if|when|then|else)$/i.test(p));

  return parts.slice(0, 6); // cap at 6 object tokens
}

// ── Constraint extraction ─────────────────────────────────────────────────────
// Extracts hard limits declared inline in the request.
function _extractConstraints(text) {
  const constraints = [];

  if (/\b(dry.run|preview|simulate|no.side.effects)\b/i.test(text))
    constraints.push('DRY_RUN');
  if (/\b(no.llm|deterministic.only|grammar.only|zero.tokens)\b/i.test(text))
    constraints.push('NO_LLM');
  if (/\b(force|confirmed|i.confirm|yes.delete)\b/i.test(text))
    constraints.push('CONFIRMED');
  if (/\b(urgent|now|immediately|asap|critical)\b/i.test(text))
    constraints.push('URGENT');
  if (/\b(ollama.only|local.only)\b/i.test(text))
    constraints.push('LOCAL_ONLY');
  if (/\b(skip.cost|ignore.ceiling|override.cost)\b/i.test(text))
    constraints.push('COST_OVERRIDE');

  return constraints;
}

// ── Domain classification ─────────────────────────────────────────────────────
function _classifyDomain(text) {
  for (const { domain, re } of DOMAIN_PATTERNS) {
    if (re.test(text)) return { domain, confidence: 0.8 };
  }
  return { domain: 'general', confidence: 0.4 };
}

// ── Verb classification ───────────────────────────────────────────────────────
function _classifyVerb(text) {
  for (const entry of VERB_PATTERNS) {
    if (entry.re.test(text)) {
      return {
        verb:            entry.verb,
        risk_level:      entry.risk,
        execution_class: entry.exec,
        confidence:      0.85,
      };
    }
  }
  return {
    verb:            'unknown',
    risk_level:      RISK_LEVEL.LLM_REMOTE,
    execution_class: EXEC_CLASS.GENERATIVE,
    confidence:      0.3,
  };
}

// ── Source detection ──────────────────────────────────────────────────────────
function _detectSource(req) {
  if (req?.source) {
    const s = req.source.toUpperCase();
    if (Object.values(SOURCE).includes(s)) return s;
  }
  if (req?.autonomous || req?.runId) return SOURCE.AUTONOMOUS_LOOP;
  if (req?.fromGuardian)             return SOURCE.GUARDIAN;
  if (req?.fromOrchestrator)         return SOURCE.ORCHESTRATOR;
  return SOURCE.USER;
}

// ── Confidence composite ──────────────────────────────────────────────────────
// Final confidence is the harmonic mean of domain + verb confidences.
// Low confidence on either side drags the composite down.
function _compositeConfidence(domainConf, verbConf) {
  if (domainConf === 0 || verbConf === 0) return 0;
  return parseFloat(((2 * domainConf * verbConf) / (domainConf + verbConf)).toFixed(3));
}

// ── Gap emission for low confidence ──────────────────────────────────────────
// §2026-08-09 UNIFIED — was a raw jaaDB.insert('gaps', ...) with NO dedup at
// all, same bug class user-model.checkContradictions had: every low-confidence
// classification of a similar request would insert a fresh duplicate gap row
// forever. Found while checking that "intention" (James's own word) is really
// wired into the diagnostic system's monitoring, not just producing data no
// one dedupes or watches. Now routes through lib/gap-field.js like every
// other producer — same dedup/occurrence/causal-wire treatment, domain:
// 'system' (an intent-classification gap is about NEXUS's own parsing, not
// about James — 'user-model' stays reserved for the actual user-model file).
function _emitLowConfidenceGap(intent) {
  try {
    const gapField = require('./gap-field');
    gapField.report({
      type: 'intent.low_confidence',
      body: `Intent parsed with confidence ${intent.confidence} (threshold: ${LOW_CONFIDENCE_THRESHOLD}). ` +
            `verb="${intent.verb}" domain="${intent.domain}" raw="${intent.raw?.slice(0, 80)}"`,
      source: MODULE_ID,
      domain: 'system',
      severity: intent.confidence < 0.25 ? 'high' : 'medium',
      meta: { causedBy: intent.uuid, path: 'intent-classifier/confidence' },
    });
  } catch(e) {
    console.warn(`[${MODULE_ID}] gap emission failed: ${e.message}`);
  }
}

// ── Log intent to JAA (§1.2 §2.1) ────────────────────────────────────────────
function _logIntent(intent) {
  try {
    jaaDB.insert('event_log', {
      uuid:    uid(),
      type:    'intent.classified',
      source:  MODULE_ID,
      ts:      Date.now(),
      payload: {
        intentUuid:     intent.uuid,
        verb:           intent.verb,
        domain:         intent.domain,
        risk_level:     intent.risk_level,
        execution_class:intent.execution_class,
        confidence:     intent.confidence,
        source:         intent.source,
        objectCount:    intent.objects.length,
        constraintCount:intent.constraints.length,
        lowConfidence:  intent.confidence < LOW_CONFIDENCE_THRESHOLD,
      },
    });
  } catch(e) {
    console.warn(`[${MODULE_ID}] intent log failed: ${e.message}`);
  }
}

// ── Freeze ────────────────────────────────────────────────────────────────────
// Makes the intent object immutable. Called at execution start.
// After freeze, any attempt to modify the intent throws.
function freeze(intent) {
  return Object.freeze({ ...intent, _frozen: true, _frozenAt: Date.now() });
}

// ── Classify ─────────────────────────────────────────────────────────────────
// Primary entry point. Takes a raw request, returns an INTENT object.
// The INTENT is mutable until freeze() is called at execution start.
//
// req shape: { text, source?, provider?, autonomous?, runId?, causedBy?, ... }
//
// Returns: { intent, lowConfidence: boolean }
function classify(req) {
  const raw  = (typeof req === 'string') ? req : (req?.text || req?.prompt || req?.input || '');
  const text = raw.trim();

  const intentUuid = uid();
  const source     = _detectSource(req);

  const { domain, confidence: domConf } = _classifyDomain(text);
  const { verb, risk_level, execution_class, confidence: verbConf } = _classifyVerb(text);
  const confidence   = _compositeConfidence(domConf, verbConf);
  const objects      = _extractObjects(text, verb);
  const constraints  = _extractConstraints(text);

  // Autonomous loop upgrades execution_class if runId present
  const finalExecClass = (source === SOURCE.AUTONOMOUS_LOOP && execution_class !== EXEC_CLASS.DETERMINISTIC)
    ? EXEC_CLASS.AUTONOMOUS
    : execution_class;

  const intent = {
    uuid:            intentUuid,
    domain,
    verb,
    objects,
    constraints,
    risk_level,
    confidence,
    execution_class: finalExecClass,
    source,
    raw,
    // Autonomous loop context — propagated forward
    ...(req?.runId    && { runId:    req.runId }),
    ...(req?.step     && { step:     req.step }),
    ...(req?.causedBy && { causedBy: req.causedBy }),
    // Classification metadata
    _classified_at: Date.now(),
    _classifier_version: VERSION,
  };

  // §1.2 §2.1 — log before anything else touches this intent
  _logIntent(intent);

  const lowConfidence = confidence < LOW_CONFIDENCE_THRESHOLD;
  if (lowConfidence) {
    _emitLowConfidenceGap(intent);
  }

  return { intent, lowConfidence };
}

// ── Revise ────────────────────────────────────────────────────────────────────
// Allowed before execution start. Produces a new intent with updated fields.
// Original intent preserved in revision history (logged).
// Cannot revise a frozen intent.
function revise(intent, updates) {
  if (intent._frozen) {
    throw new Error(`[${MODULE_ID}] Cannot revise frozen intent ${intent.uuid} — execution has started`);
  }

  const revised = {
    ...intent,
    ...updates,
    uuid: intent.uuid,   // UUID never changes
    raw:  intent.raw,    // raw never changes
    _revised_at:    Date.now(),
    _revision_from: intent._classified_at,
  };

  // Log the revision (§1.2)
  try {
    jaaDB.insert('event_log', {
      uuid:    uid(),
      type:    'intent.revised',
      source:  MODULE_ID,
      ts:      Date.now(),
      payload: {
        intentUuid: intent.uuid,
        fields:     Object.keys(updates),
        previous:   Object.fromEntries(Object.keys(updates).map(k => [k, intent[k]])),
        revised:    updates,
      },
    });
  } catch(e) {
    console.warn(`[${MODULE_ID}] revision log failed: ${e.message}`);
  }

  return revised;
}

// ── RAID bridge ───────────────────────────────────────────────────────────────
// Converts an INTENT object into the cluster string RAID v6 expects.
// Phase 45 inserts before RAID — RAID still does cluster routing internally,
// but now it receives structured intent instead of raw text.
function intentToCluster(intent) {
  // Domain → cluster mapping for RAID v6
  const DOMAIN_TO_CLUSTER = {
    emerge:       'code',
    filesystem:   'code',
    idearium:     'spec',
    architect:    'spec',
    cortex:       'diagnostic',
    orchestrator: 'diagnostic',
    guardian:     'diagnostic',
    bridge:       'data',
    auth:         'data',
    system:       'diagnostic',
    general:      'general',
  };

  // Verb overrides — some verbs have stronger cluster signal than domain
  const VERB_TO_CLUSTER = {
    forge:    'forge',
    build:    'code',
    write:    'code',
    analyze:  'analysis',
    explain:  'analysis',
    diagnose: 'diagnostic',
    heal:     'forge',    // heal is production-critical, forge-class provider
  };

  return VERB_TO_CLUSTER[intent.verb]
    || DOMAIN_TO_CLUSTER[intent.domain]
    || 'general';
}

// ── Query ─────────────────────────────────────────────────────────────────────
// Look up past intents by signature for Phase 46 (case library) integration.
// Returns recent classified intents matching domain + verb.
function queryBySignature(domain, verb, limit = 5) {
  try {
    return jaaDB.query(
      'event_log',
      r => r.type === 'intent.classified' &&
           r.payload?.domain === domain &&
           r.payload?.verb === verb,
      limit
    );
  } catch(e) {
    console.warn(`[${MODULE_ID}] signature query failed: ${e.message}`);
    return [];
  }
}

module.exports = {
  classify,
  revise,
  freeze,
  intentToCluster,
  queryBySignature,
  RISK_LEVEL,
  EXEC_CLASS,
  SOURCE,
  LOW_CONFIDENCE_THRESHOLD,
  MODULE_ID,
  VERSION,
  // §2026-09-03 — cortex/core/raid/contract-intake.js's synthesizeContract()
  // needs to validate a real intent verb against the real, current set
  // without re-deriving VERB_PATTERNS' own regex table a second time
  // (§10.3). Additive export only — every existing caller unaffected.
  VALID_VERBS: VERB_PATTERNS.map(v => v.verb),
};
