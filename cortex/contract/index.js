'use strict';
// ── cortex/contract/index.js ──────────────────────────────────────────────────
// UUID: nexus-contract-v1-0000-4000-0000-000000000001
// Status: pre-release
//
// ORCHESTRATION CONTRACT LAYER
//
// Defines what every agent is allowed to do, enforces it at dispatch time,
// and writes every violation to JAA before the action is blocked.
//
// This is the line between "powerful system" and "formally governed system."
//
// Model:
//   Each agent has a ContractProfile with:
//     allowed_actions[]   — what it can call
//     denied_actions[]    — explicit blocks (overrides allowed)
//     rate_limits{}       — max calls per window per action type
//     required_fields[]   — fields every call must carry
//     proof_required      — whether calls need a causedBy chain
//
//   Every agent_call is checked BEFORE dispatch.
//   Violations → law_violations table + gap.
//   Compliant calls → contract_audit record.
//
// §2.1: contract_audit written before dispatch
// §1.2: violations are loud — written to law_violations, gaps, event_log
// §M1:  init(cfg) + stop()

const { jaaDB, uid } = require('../memory/jaa-db');

const MODULE_ID = 'contract';
const VERSION   = '1.0.0';

// ── Agent contract profiles ───────────────────────────────────────────────────
// These are the formal rules. Every dispatch goes through checkContract().

const CONTRACTS = {

  // Ollama — local model, trusted but rate-limited
  'ollama': {
    description: 'Local Ollama LLM — primary inference engine',
    allowed_actions: ['code', 'analyze', 'spec', 'chat', 'diagnose', 'forge', 'tool'],
    denied_actions:  [],
    rate_limits: {
      '*':     { max: 60,  windowMs: 60_000 },   // 60/min total
      'forge': { max: 10,  windowMs: 60_000 },   // 10 forge calls/min
    },
    required_fields: ['uuid', 'prompt'],
    proof_required:  false,
    trust_level:     'local',
  },

  // Guardian-Claude — browser-controlled Claude, high trust
  'guardian-claude': {
    description: 'Guardian-controlled Claude via browser tab',
    allowed_actions: ['code', 'analyze', 'spec', 'chat', 'diagnose', 'forge', 'tool'],
    denied_actions:  [],
    rate_limits: {
      '*':     { max: 30,  windowMs: 60_000 },
      'forge': { max: 5,   windowMs: 60_000 },
    },
    required_fields: ['uuid', 'prompt'],
    proof_required:  false,
    trust_level:     'browser',
  },

  // Guardian-ChatGPT — browser-controlled ChatGPT
  'guardian-chatgpt': {
    description: 'Guardian-controlled ChatGPT via browser tab',
    allowed_actions: ['code', 'analyze', 'chat', 'spec'],
    denied_actions:  ['forge', 'tool'],  // ChatGPT cannot trigger self-modification
    rate_limits: {
      '*': { max: 20, windowMs: 60_000 },
    },
    required_fields: ['uuid', 'prompt'],
    proof_required:  false,
    trust_level:     'browser',
  },

  // Claude API — direct API access, full trust
  'claude': {
    description: 'Anthropic Claude API',
    allowed_actions: ['code', 'analyze', 'spec', 'chat', 'diagnose', 'forge', 'tool'],
    denied_actions:  [],
    rate_limits: {
      '*':     { max: 20,  windowMs: 60_000 },
      'forge': { max: 3,   windowMs: 60_000 },
    },
    required_fields: ['uuid', 'prompt'],
    proof_required:  false,
    trust_level:     'api',
  },

  // Agent-tools — internal tool executor, highest trust
  'agent-tools': {
    description: 'Internal tool executor — reads JAA, runs diagnostics',
    allowed_actions: ['tool', 'diagnose', 'snapshot', 'replay', 'heal'],
    denied_actions:  ['forge'],  // agent-tools cannot self-modify
    rate_limits: {
      '*': { max: 120, windowMs: 60_000 },
    },
    required_fields: ['uuid'],
    proof_required:  false,
    trust_level:     'internal',
  },

  // Self-heal — forge-triggering agent, tightly constrained
  'self-heal': {
    description: 'Self-heal module — proposes code patches via forge',
    allowed_actions: ['forge'],
    denied_actions:  [],
    rate_limits: {
      'forge': { max: 5, windowMs: 300_000 },  // 5 forge attempts per 5 minutes
    },
    required_fields: ['uuid', 'prompt'],
    proof_required:  true,  // must have causedBy (a gap uuid)
    trust_level:     'internal',
  },

  // Unknown / unregistered agents — minimal permissions
  '_default': {
    description: 'Unregistered agent — minimal trust',
    allowed_actions: ['chat'],
    denied_actions:  ['forge', 'tool', 'snapshot', 'heal', 'diagnose'],
    rate_limits: {
      '*': { max: 5, windowMs: 60_000 },
    },
    required_fields: ['uuid', 'prompt'],
    proof_required:  true,
    trust_level:     'unknown',
  },
};

// ── Rate limit state (in-memory) ──────────────────────────────────────────────
const _rateLimitCounters = new Map(); // `${agent}:${action}` → [ts, ts, ...]

function _checkRateLimit(agent, action, contract) {
  const now     = Date.now();
  const limits  = contract.rate_limits || {};
  const specific = limits[action];
  const global_  = limits['*'];

  for (const [limitKey, limit] of [[action, specific], ['*', global_]]) {
    if (!limit) continue;
    const key    = `${agent}:${limitKey}`;
    const times  = (_rateLimitCounters.get(key) || []).filter(t => now - t < limit.windowMs);
    if (times.length >= limit.max) {
      return {
        allowed: false,
        reason:  `rate_limit: ${agent}/${limitKey} — ${times.length}/${limit.max} in ${limit.windowMs}ms window`,
      };
    }
    times.push(now);
    _rateLimitCounters.set(key, times);
  }
  return { allowed: true };
}

// ── Contract check ────────────────────────────────────────────────────────────
function checkContract(call) {
  const agent    = (call.routedTo || call.preferredAgent || '_default').toLowerCase();
  const action   = (call.command  || call.intent || 'chat').toLowerCase();
  const contract = CONTRACTS[agent] || CONTRACTS['_default'];

  const violations = [];

  // 1. Denied actions (hard block)
  if (contract.denied_actions?.includes(action)) {
    violations.push(`action_denied: '${action}' is explicitly denied for agent '${agent}'`);
  }

  // 2. Allowed actions check
  if (!violations.length && contract.allowed_actions?.length) {
    if (!contract.allowed_actions.includes(action) && !contract.allowed_actions.includes('*')) {
      violations.push(`action_not_permitted: '${action}' not in allowed_actions for '${agent}'`);
    }
  }

  // 3. Required fields
  for (const field of (contract.required_fields || [])) {
    if (!call[field]) {
      violations.push(`missing_required_field: '${field}' required for agent '${agent}'`);
    }
  }

  // 4. Proof of causality
  if (contract.proof_required && !call.causedBy) {
    violations.push(`causality_proof_required: agent '${agent}' must provide causedBy chain`);
  }

  // 5. Rate limits (only if no hard violations)
  if (!violations.length) {
    const rateResult = _checkRateLimit(agent, action, contract);
    if (!rateResult.allowed) {
      violations.push(rateResult.reason);
    }
  }

  return {
    agent,
    action,
    contract,
    violations,
    ok:          violations.length === 0,
    trust_level: contract.trust_level,
  };
}

// ── Enforce and log ───────────────────────────────────────────────────────────
// Call this from RAID or any dispatch point before sending to an agent.
// Returns { ok, violations, auditId }
function enforce(call) {
  const result   = checkContract(call);
  const auditId  = uid();
  const ts       = Date.now();

  if (result.ok) {
    // §2.1 — write audit record before dispatch
    jaaDB.insert('contract_audit', {
      uuid:        auditId,
      callUuid:    call.uuid,
      agent:       result.agent,
      action:      result.action,
      trust_level: result.trust_level,
      result:      'pass',
      causedBy:    call.causedBy || null,
      ts,
      source:      MODULE_ID,
    });
  } else {
    // Write violation before blocking
    for (const violation of result.violations) {
      jaaDB.insert('law_violations', {
        uuid:      uid(),
        law:       '§CONTRACT',
        violation,
        callUuid:  call.uuid,
        agent:     result.agent,
        action:    result.action,
        causedBy:  call.uuid,
        ts,
        source:    MODULE_ID,
      });
    }

    jaaDB.insert('contract_audit', {
      uuid:        auditId,
      callUuid:    call.uuid,
      agent:       result.agent,
      action:      result.action,
      trust_level: result.trust_level,
      result:      'violation',
      violations:  JSON.stringify(result.violations),
      causedBy:    call.uuid,
      ts,
      source:      MODULE_ID,
    });

    // Surface as a gap so self-heal and humans can see it
    const existing = jaaDB.query('gaps',
      r => r.path === `contract/${result.agent}` && r.type === 'contract_violation' && r.status !== 'resolved',
      1
    );
    if (!existing.length) {
      jaaDB.insert('gaps', {
        uuid:      uid(),
        path:      `contract/${result.agent}`,
        type:      'contract_violation',
        severity:  result.violations.some(v => v.startsWith('action_denied')) ? 'high' : 'medium',
        body:      `Agent '${result.agent}' violated contract: ${result.violations[0]}`,
        status:    'pending',
        source:    MODULE_ID,
        causedBy:  call.uuid,
        createdAt: ts,
        ts,
      });
    }

    jaaDB.insert('event_log', {
      uuid:    uid(),
      type:    'contract.violation',
      payload: { agent: result.agent, action: result.action, violations: result.violations, callUuid: call.uuid },
      source:  MODULE_ID,
      causedBy: call.uuid,
      ts,
    });
  }

  return { ok: result.ok, violations: result.violations, auditId, agent: result.agent };
}

// ── Query contract state ──────────────────────────────────────────────────────
function getContract(agent) {
  return CONTRACTS[agent] || CONTRACTS['_default'];
}

function listContracts() {
  return Object.entries(CONTRACTS).map(([agent, c]) => ({
    agent,
    description:   c.description,
    trust_level:   c.trust_level,
    allowed:       c.allowed_actions,
    denied:        c.denied_actions,
    proof_required: c.proof_required,
  }));
}

function getViolations(limit = 50) {
  return jaaDB.tail('law_violations', limit);
}

function getAudit(limit = 50) {
  return jaaDB.tail('contract_audit', limit);
}

// ── Poll loop: scan for unacknowledged violations ─────────────────────────────
let _interval = null;

async function _tick() {
  try {
    // Find contract violation gaps that haven't been acknowledged
    const violations = jaaDB.query('law_violations', v => !v.acknowledged, 20);
    if (!violations.length) return;

    // Group by agent and count
    const byAgent = {};
    for (const v of violations) {
      const key = v.agent || 'unknown';
      byAgent[key] = (byAgent[key] || 0) + 1;
    }

    // If any agent has 5+ unacknowledged violations → escalate severity
    for (const [agent, count] of Object.entries(byAgent)) {
      if (count >= 5) {
        const existing = jaaDB.query('gaps',
          r => r.path === `contract/${agent}/escalated` && r.status !== 'resolved',
          1
        );
        if (!existing.length) {
          jaaDB.insert('gaps', {
            uuid:     uid(),
            path:     `contract/${agent}/escalated`,
            type:     'contract_repeated_violation',
            severity: 'high',
            body:     `Agent '${agent}' has ${count} unacknowledged contract violations`,
            status:   'pending',
            source:   MODULE_ID,
            causedBy: null,
            createdAt: Date.now(),
            ts:       Date.now(),
          });
        }
      }
    }
  } catch (err) {
    jaaDB.insert('failures', {
      uuid: uid(), source: MODULE_ID,
      error: err.message, stack: err.stack?.slice(0, 500), ts: Date.now(),
    });
  }
}

function init(cfg = {}) {
  // Ensure contract tables exist
  _ensureTables();
  _interval = setInterval(_tick, cfg.pollMs ?? 30_000);
  _interval.unref();
  console.log(`[${MODULE_ID}] v${VERSION} — ${Object.keys(CONTRACTS).length} agent contracts loaded`);
}

function stop() {
  if (_interval) { clearInterval(_interval); _interval = null; }
}

function _ensureTables() {
  // contract_audit and law_violations are in jaa-tables already.
  // This is just a verification that they're accessible.
  try { jaaDB.tail('contract_audit', 1); } catch(_) {}
  try { jaaDB.tail('law_violations', 1); } catch(_) {}
}

module.exports = {
  init, stop,
  enforce, checkContract,
  getContract, listContracts,
  getViolations, getAudit,
  CONTRACTS, VERSION, MODULE_ID,
};
