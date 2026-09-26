'use strict';
/**
 * lib/cfr/contract-verifier.js — Runtime interaction contract verifier
 * UUID: nexus-cfr-contract-verifier-v1-0000-4000-0000-000000000001
 *
 * This is the gap between spec and reality made visible.
 *
 * Each system has an interaction-contract.json declaring:
 *   - what routes it exposes
 *   - what events it emits (siso.emits)
 *   - what events it consumes (siso.consumes)
 *   - expected response shapes (health.returns)
 *
 * The verifier subscribes to each system's CFR ledger stream and
 * validates actual behavior against the contract. Violations become
 * gaps in cortex with a contract.* CFR event.
 *
 * Three verification layers (per the spec document):
 *
 *   1. Structural  — event types declared in contract vs observed
 *   2. Behavioral  — expected event sequences (job lifecycle)
 *   3. Temporal    — max time between events (response time SLAs)
 *
 * Drop-in usage:
 *   const verifier = createContractVerifier({ contracts, onViolation });
 *   verifier.observe(systemId, entry);  // call on every ledger entry
 */

'use strict';

const path = require('path');
const fs   = require('fs');

// ── Expected behavioral sequences ─────────────────────────────────────────────
// If event A fires, event B must follow within maxMs.
const BEHAVIORAL_RULES = [
  {
    id:     'job-lifecycle',
    from:   'guardian.job.queued',
    to:     ['guardian.job.dispatched', 'guardian.job.complete', 'guardian.job.error'],
    maxMs:  120000,  // 2 minutes
    desc:   'queued job must reach dispatched/complete/error within 2min',
  },
  {
    id:     'seam-completion',
    from:   'seam.chunk.injected',
    to:     ['seam.chunk.stable', 'seam.chunk.failed'],
    maxMs:  180000,  // 3 minutes
    desc:   'injected chunk must reach stable or failed within 3min',
  },
  {
    id:     'gap-resolution',
    from:   'cortex.gap.found',
    to:     ['cortex.gap.resolved', 'healer.escalated'],
    maxMs:  600000,  // 10 minutes
    desc:   'found gap must resolve or escalate within 10min',
  },
  {
    id:     'provider-heartbeat',
    from:   'guardian.provider.connected',
    to:     ['guardian.provider.disconnected'],  // absence checked differently
    maxMs:  35000,   // 35s — if no heartbeat, provider should disconnect
    desc:   'connected provider must heartbeat within 35s',
    negated: true,   // gap fires if TO event does NOT arrive
  },
];

// ── Temporal SLAs ──────────────────────────────────────────────────────────────
// Event type must not go silent for more than maxSilenceMs.
const TEMPORAL_RULES = [
  { type: 'orchestrator.pulse',   maxSilenceMs: 35000,  system: 'orchestrator' },
  { type: 'guardian.job.complete', maxSilenceMs: 300000, system: 'guardian' },
];

function createContractVerifier({ contracts = {}, onViolation } = {}) {
  // contracts: { systemId → parsed interaction-contract.json }
  // onViolation: ({ type, system, message, severity, entry }) => void

  // Track pending behavioral rules: { ruleId + fromEntryId → { rule, ts, jobId } }
  const _pendingBehaviors = new Map();

  // Track last seen timestamp per event type
  const _lastSeen = {};

  // Declared event types per system from contracts
  const _declaredEmits = {};
  for (const [sysId, contract] of Object.entries(contracts)) {
    _declaredEmits[sysId] = new Set(contract?.siso?.emits || []);
  }

  // Set of observed event types per system (learned from ledger)
  const _observedEmits = {};

  /**
   * observe — validate a ledger entry against its system's contract.
   * Call this for every entry from every system's CFR ledger.
   */
  function observe(systemId, entry) {
    const type = entry.type || '';
    _lastSeen[`${systemId}:${type}`] = entry.ts || Date.now();

    if (!_observedEmits[systemId]) _observedEmits[systemId] = new Set();
    _observedEmits[systemId].add(type);

    // ── 1. Structural verification ─────────────────────────────────────────
    // Is this event declared in the contract?
    const declared = _declaredEmits[systemId];
    if (declared && declared.size > 0) {
      // Events prefixed with the system name should be declared
      if (type.startsWith(systemId + '.') && !declared.has(type)) {
        _emit('contract.structural.fail', systemId, {
          rule:    'undeclared-emit',
          type,
          message: `${systemId} emitted undeclared event type '${type}'`,
          entry,
        }, 0.4);
      }
    }

    // ── 2. Behavioral verification ─────────────────────────────────────────
    // Start pending behavioral rule when FROM event fires
    for (const rule of BEHAVIORAL_RULES) {
      if (type === rule.from) {
        const key = `${rule.id}:${entry.uuid}`;
        _pendingBehaviors.set(key, {
          rule,
          fromTs: entry.ts || Date.now(),
          fromId: entry.uuid,
          systemId,
          entry,
          jobId: entry.payload?.jobId || entry.trace?.jobId || null,
        });
      }
    }

    // Check if current event resolves any pending rule
    for (const [key, pending] of _pendingBehaviors) {
      const { rule, fromTs, fromId, entry: fromEntry } = pending;
      if (rule.negated) continue; // handled in tick()

      if (rule.to.includes(type)) {
        const elapsed = (entry.ts || Date.now()) - fromTs;
        if (elapsed > rule.maxMs) {
          _emit('contract.behavioral.fail', systemId, {
            rule:     rule.id,
            type,
            message:  `${rule.desc} (took ${Math.round(elapsed/1000)}s, max ${rule.maxMs/1000}s)`,
            elapsed,
            maxMs:    rule.maxMs,
            fromEntry,
            entry,
          }, 0.5);
        } else {
          // Rule satisfied within SLA — emit positive signal
          _emitPositive('contract.ok', systemId, { rule: rule.id, elapsed });
        }
        _pendingBehaviors.delete(key);
      }
    }

    // ── 3. CFR-based violation amplification ──────────────────────────────
    // Any event under CFR collapse is itself a violation signal
    if (entry.cfr?.regime === 'chaotic' && type.includes('error')) {
      _emit('contract.temporal.fail', systemId, {
        rule:    'cfr-collapse',
        type,
        message: `error event under CFR collapse (coherence: ${entry.cfr?.coherence?.toFixed(2)})`,
        cfr:     entry.cfr,
        entry,
      }, entry.sigma?.score || 0.6);
    }
  }

  /**
   * tick — call periodically (every 5s) to check temporal rules and
   * expired behavioral rules that never resolved.
   */
  function tick() {
    const now = Date.now();

    // Check expired pending behaviors
    for (const [key, pending] of _pendingBehaviors) {
      const { rule, fromTs, systemId, entry: fromEntry } = pending;
      const elapsed = now - fromTs;
      if (elapsed > rule.maxMs) {
        if (rule.negated) {
          // Negated rule: gap fires if the TO event did NOT arrive
          _emit('contract.behavioral.fail', systemId, {
            rule:    rule.id,
            message: `${rule.desc} (silence for ${Math.round(elapsed/1000)}s)`,
            elapsed,
            fromEntry,
          }, 0.6);
        } else {
          _emit('contract.behavioral.fail', systemId, {
            rule:    rule.id,
            message: `${rule.desc} — TO event never arrived (${Math.round(elapsed/1000)}s elapsed)`,
            elapsed,
            maxMs:   rule.maxMs,
            fromEntry,
          }, 0.7);
        }
        _pendingBehaviors.delete(key);
      }
    }

    // Check temporal silence rules
    for (const rule of TEMPORAL_RULES) {
      const key     = `${rule.system}:${rule.type}`;
      const lastTs  = _lastSeen[key];
      if (lastTs && now - lastTs > rule.maxSilenceMs) {
        _emit('contract.temporal.fail', rule.system, {
          rule:    'silence',
          type:    rule.type,
          message: `${rule.system} has not emitted '${rule.type}' in ${Math.round((now-lastTs)/1000)}s (max ${rule.maxSilenceMs/1000}s)`,
          silenceMs: now - lastTs,
          maxMs:   rule.maxSilenceMs,
        }, 0.5);
        // Back off — don't fire this repeatedly until it recovers
        _lastSeen[key] = now;
      }
    }
  }

  /**
   * auditReport — full structural audit of all systems.
   * Returns events declared but never observed, and vice versa.
   */
  function auditReport() {
    const report = {};
    for (const [sysId, declared] of Object.entries(_declaredEmits)) {
      const observed = _observedEmits[sysId] || new Set();
      report[sysId] = {
        declared:       [...declared],
        observed:       [...observed],
        declaredNotSeen: [...declared].filter(t => !observed.has(t)),
        seenNotDeclared: [...observed].filter(t =>
          t.startsWith(sysId + '.') && !declared.has(t)
        ),
      };
    }
    return report;
  }

  function _emit(contractType, systemId, details, severity = 0.5) {
    onViolation?.({
      type:     contractType,
      system:   systemId,
      severity,
      message:  details.message || contractType,
      details,
      ts:       Date.now(),
    });
  }

  function _emitPositive(contractType, systemId, details) {
    onViolation?.({
      type:     contractType,
      system:   systemId,
      severity: 0,
      message:  details.rule,
      details,
      ts:       Date.now(),
    });
  }

  return { observe, tick, auditReport };
}

/**
 * loadContracts — load all interaction-contract.json files from known paths.
 * Returns { systemId → contract }
 */
function loadContracts(rootDir) {
  const PATHS = {
    guardian:     path.join(rootDir, 'guardian/interaction-contract.json'),
    cortex:       path.join(rootDir, 'cortex/interaction-contract.json'),
    idearium:     path.join(rootDir, 'idearium/interaction-contract.json'),
    orchestrator: path.join(rootDir, 'orchestrator', 'orchestrator-contract.json'),
  };
  const contracts = {};
  for (const [sys, p] of Object.entries(PATHS)) {
    try {
      if (fs.existsSync(p)) {
        contracts[sys] = JSON.parse(fs.readFileSync(p, 'utf8'));
      }
    } catch(e) {
      console.warn(`[contract-verifier] failed to load ${sys} contract:`, e.message);
    }
  }
  return contracts;
}

module.exports = { createContractVerifier, loadContracts };
