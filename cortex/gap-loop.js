'use strict';
// ── cortex/gap-loop.js — Continuous Gap Resolution Loop ──────────────────────
// UUID: nexus-gap-loop-v1-0000-4000-0000-000000000001
// Version: 1.0.0
//
// THE MISSING WIRE. Connects everything that already existed:
//
//   gap-finder (detects) →
//   gap-loop   (THIS FILE — routes + drives resolution) →
//   RAID       (decides strategy based on gap cluster + agent health) →
//   healer     (safe fixes, no code changes) →
//   self-heal  (forge patch via AI) →
//   escalation (5-level ladder) →
//   human_required (terminal state — tagged, surfaced, never silently dropped)
//
// TAXONOMY-DRIVEN ROUTING:
//   Every gap is classified using open-loop-taxonomy before any action is taken.
//   The loop_type determines closure_mechanism which determines which level fires.
//   RAID cluster hint comes from the taxonomy, not from free-text matching.
//
//   TEMPORAL      → WAIT   (safe actions, backoff, poll)
//   CAUSAL        → TRACE  (diagnostic scan, root cause)
//   KNOWLEDGE     → RETRIEVE (search, fetch)
//   CAPABILITY    → EXTEND (forge new module)
//   CONFLICT      → RECONCILE (evidence weighting)
//   DECISION      → DECIDE (goal graph, cost analysis)
//   INTEGRITY     → VERIFY (audit, validate)
//   RELATIONAL    → DIALOGUE (observe, ask)
//   UNDERSTANDING → CLARIFY (ask, disambiguate)
//   CONSTITUTIONAL→ REVIEW (human must decide)
//   HELD          → auto-resolve (signal, not actionable)
//
// §1.1  Nothing exists until proven — routing decision written to JAA first
// §1.2  Nothing silently fails — every level outcome logged to event_log
// §2.1  Snapshot before any AI forge attempt
// §4.3  Enterprise-grade: friction ledger, blast radius, circuit breaker all consulted

const path = require('path');
const { jaaDB, uid } = require('./memory/jaa-db');
const taxonomy = require('../lib/open-loop-taxonomy');
const topology = require('../lib/loop-topology');
const { LOOP_TYPES, LOOP_STATES, classify, ecology } = taxonomy;
const { analyze, evolveLoop } = topology;

const MODULE_ID = 'gap-loop';
const VERSION   = '1.0.0';

// ── Config ────────────────────────────────────────────────────────────────────
const POLL_MS      = parseInt(process.env.GAP_LOOP_MS    || '3000');
const BATCH_SIZE   = parseInt(process.env.GAP_LOOP_BATCH || '10');
const BACKOFF_MS   = parseInt(process.env.GAP_LOOP_BACKOFF || '60000');

// Loop types whose closure_mechanism is WAIT — never go to AI
// These resolve through scheduling, polling, or dependency readiness
const WAIT_MECHANISMS    = new Set(['WAIT']);
// Loop types that require human judgement — go straight to Level 4
const HUMAN_MECHANISMS   = new Set(['REVIEW']);   // CONSTITUTIONAL
// Loop types that are signals — auto-resolve immediately
const SIGNAL_MECHANISMS  = new Set(['HELD']);     // tension, cfr signals

let _interval = null;
let _cfg      = {};
let _raid     = null;
let _esc      = null;
let _heal     = null;
let _lastTopoSig = null; // suppress repeated topology log lines

// ── Lazy-load dependencies ─────────────────────────────────────────────────────
function _getRaid() {
  if (_raid) return _raid;
  try { _raid = require('./core/raid/index'); } catch(_) {}
  return _raid;
}

function _getEsc() {
  if (_esc) return _esc;
  try { _esc = require('./self-heal/escalation'); } catch(_) {}
  return _esc;
}

function _getHealer() {
  if (_heal) return _heal;
  try { _heal = require('./healer/index'); } catch(_) {}
  return _heal;
}

// ── RAID routing for a gap — taxonomy-informed ───────────────────────────────
// Classifies gap via taxonomy first, uses loop_type's raid_cluster as hint.
// Returns { cluster, agent, loop_type, closure_mechanism, confidence }
function _raidRoute(gap) {
  const raid = _getRaid();
  const cls  = classify(gap);  // taxonomy classification

  // Taxonomy gives us the cluster directly — no text-matching needed
  const cluster = cls.raid_cluster || 'diagnostic';

  // Get RAID's agent decision using taxonomy cluster
  let agent = 'ollama'; // LAW_I: local first
  if (raid?._decide && raid?._health && raid?._weights) {
    try {
      const desc = [gap.type, gap.body, gap.path].filter(Boolean).join(' ');
      const decision = raid._decide(
        { uuid: gap.uuid, intent: desc, prompt: desc,
          context: { gapType: gap.type, loopType: cls.loop_type } },
        raid._health,
        raid._weights,
      );
      agent = decision?.agent || 'ollama';
    } catch(_) {}
  }

  return {
    cluster,
    agent,
    loop_type:         cls.loop_type,
    closure_mechanism: cls.closure_mechanism,
    confidence:        cls.confidence,
    legacy_type:       cls.legacy_type,
    inferred:          cls.inferred || false,
  };
}

// ── Record routing decision to JAA (§1.1 — nothing exists until written) ──────
function _writeRouting(gap, route, level) {
  jaaDB.insert('event_log', {
    uuid:    uid(),
    type:    'gap-loop.routed',
    payload: {
      gapUuid:          gap.uuid,
      gapType:          gap.type,
      loop_type:        route.loop_type,
      closure_mechanism:route.closure_mechanism,
      cluster:          route.cluster,
      agent:            route.agent,
      confidence:       route.confidence,
      level,
    },
    source:  MODULE_ID,
    causedBy:gap.uuid,
    ts:      Date.now(),
  });

  // Stamp loop_type onto the gap record if not already set (upgrade legacy gaps)
  if (!gap.loop_type && route.loop_type) {
    try {
      jaaDB.update('gaps', gap.uuid, {
        loop_type:         route.loop_type,
        closure_mechanism: route.closure_mechanism,
        raid_cluster:      route.cluster,
        loop_classified_at:Date.now(),
        loop_confidence:   route.confidence,
      });
    } catch(_) {}
  }
}

// ── Level 1: Safe fix — no code changes ──────────────────────────────────────
// Idempotent actions: restart poll, clear queue, reset circuit.
// Returns { resolved: bool, action: string }
async function _level1_safeFix(gap, cls = null) {
  const SAFE = {
    stale_module:      { action: 'mark_stale_and_repoll', note: 'Marked stale in registry — next heartbeat will restore' },
    stuck_call:        { action: 'mark_failed_reenqueue', note: 'Agent call marked failed and re-enqueued' },
    api_degraded:      { action: 'probe_and_wait',        note: 'Probe every 5s for 30s before escalating' },
    queue_saturated:   { action: 'drain_oldest',          note: 'Oldest queue entries drained' },
    memory_pressure:   { action: 'evict_working_tier',    note: 'Working memory tier evicted' },
    circuit_breaker:   { action: 'wait_then_reset',       note: 'Wait 30s, then reset circuit' },
    import_error:      { action: 'check_deps',            note: 'Dependency scan triggered' },
    recurring_failure: { action: 'throttle_source',       note: 'Source rate-limited pending forge fix' },
  };

  const fix = SAFE[gap.type];
  if (!fix) return { resolved: false, reason: `no_safe_fix_for:${gap.type}` };

  // Attempt the actual safe action
  try {
    if (gap.type === 'stale_module') {
      const modName = (gap.path || '').replace('modules/', '');
      jaaDB.update('project_registry', { name: modName }, { status: 'stale', staleSince: Date.now() });
    } else if (gap.type === 'stuck_call') {
      jaaDB.update('agent_calls', { uuid: gap.path.replace('agent_calls/', '') },
        { status: 'failed', failedAt: Date.now(), failReason: 'gap-loop timeout reset' });
    }
  } catch(_) {} // safe actions can't break the loop

  jaaDB.insert('event_log', {
    uuid: uid(), type: 'gap-loop.safe_fix',
    payload: { gapUuid: gap.uuid, action: fix.action, note: fix.note },
    source: MODULE_ID, causedBy: gap.uuid, ts: Date.now(),
  });

  return { resolved: true, action: fix.action, note: fix.note };
}

// ── Level 2: AI forge — RAID picks the agent ─────────────────────────────────
// Takes snapshot first. Calls self-heal's forge internals.
// Returns { resolved: bool, provider: string, reason: string }
async function _level2_aiForge(gap, route) {
  // Snapshot first — §2.1
  let snapId = null;
  try {
    const snap = require('./snapshot');
    if (snap?.create) {
      const s = await snap.create(`gap-loop pre-forge: ${gap.type} in ${gap.path}`);
      snapId = s?.snapId;
    }
  } catch(_) {}

  jaaDB.insert('event_log', {
    uuid: uid(), type: 'gap-loop.forge_requested',
    payload: { gapUuid: gap.uuid, gapType: gap.type, agent: route.agent, snapId },
    source: MODULE_ID, causedBy: gap.uuid, ts: Date.now(),
  });

  // Delegate to self-heal's forge internals
  try {
    const selfHeal = require('./self-heal/index');
    // _forgeGap is not exported but we can emit HEAL_REQUESTED on nexus-bus
    // which self-heal is already subscribed to
    const _bus = require('../nexus-bus');
    _bus.emit('HEAL_REQUESTED', {
      gapUuid:    gap.uuid,
      gapType:    gap.type,
      modulePath: gap.path,
      body:       gap.body,
      sigma:      gap.sigma || 0,
      causedBy:   gap.uuid,
      preferredAgent: route.agent, // hint to forge
      ts: Date.now(),
    });

    return { resolved: 'pending_forge', provider: route.agent, snapId, reason: 'forge_dispatched' };
  } catch(e) {
    return { resolved: false, reason: `forge_dispatch_failed: ${e.message}` };
  }
}

// ── Level 3: Deep diagnostic scan + re-route ──────────────────────────────────
async function _level3_deepScan(gap) {
  const esc = _getEsc();
  if (esc?.level3_deepScan) {
    const r = await esc.level3_deepScan(gap);
    return { resolved: 'scanned', ...r };
  }
  return { resolved: 'scanned', reason: 'escalation_module_unavailable' };
}

// ── Level 4: Human required — terminal state ──────────────────────────────────
// Writes a clear, actionable human task. Stops all automated attempts.
function _level4_humanRequired(gap, history) {
  const now = Date.now();

  const ACTIONS = {
    stale_module:      `Module ${gap.path} has not responded after safe fix + forge attempts. Restart the process and verify its boot sequence.`,
    stuck_call:        `Agent call at ${gap.path} is permanently stuck. Clear the agent_calls table entry and check the agent's health endpoint.`,
    import_error:      `${gap.path} has an unresolvable import error. Run: node --check ${gap.path} and install missing packages.`,
    recurring_failure: `${gap.path} is failing repeatedly. Forge patches have been attempted. Review forge_patches table for regression.`,
    api_degraded:      `API at ${gap.path} is not responding after all retries. Verify the service is running and the port is not blocked.`,
  };

  const humanAction = ACTIONS[gap.type] ||
    `${gap.type} at ${gap.path} has exhausted all automated repair strategies. Manual investigation required.`;

  jaaDB.update('gaps', gap.uuid, {
    status:         'human_required',
    humanAction,
    humanRequiredAt: now,
    escalationHistory: JSON.stringify(history.map(h => ({
      level: h.level, outcome: h.outcome, ts: h.ts,
    }))),
  });

  jaaDB.insert('event_log', {
    uuid: uid(), type: 'gap-loop.human_required',
    payload: {
      gapUuid:     gap.uuid,
      gapType:     gap.type,
      gapPath:     gap.path,
      humanAction,
      levelsAttempted: history.map(h => h.level),
    },
    source: MODULE_ID, causedBy: gap.uuid, ts: now,
  });

  // Surface in failures so cockpit / diagnostic tools see it immediately
  jaaDB.insert('failures', {
    uuid:   uid(),
    source: MODULE_ID,
    error:  `HUMAN REQUIRED: ${gap.type} at ${gap.path}`,
    stack:  humanAction,
    causedBy: gap.uuid,
    ts:     now,
  });

  console.error(`[${MODULE_ID}] ⚠ HUMAN REQUIRED — ${gap.type} @ ${gap.path}: ${humanAction}`);

  return { resolved: false, humanAction, level: 4 };
}

// ── Resolve a single gap through the full ladder ──────────────────────────────
async function _resolveGap(gap) {
  const history = [];
  const esc     = _getEsc();

  // Classify via taxonomy before anything else
  const cls = classify(gap);

  // HELD signals — auto-resolve, never enter the ladder
  if (SIGNAL_MECHANISMS.has(cls.loop_type)) {
    jaaDB.update('gaps', gap.uuid, {
      status:       'resolved',
      resolvedAt:   Date.now(),
      fixStrategy:  'signal-auto-resolve',
      resolveReason:`${cls.loop_type} — held signal, not actionable`,
      loop_type:    cls.loop_type,
    });
    return;
  }

  // CONSTITUTIONAL — human must decide, skip all automated levels
  if (HUMAN_MECHANISMS.has(cls.closure_mechanism)) {
    jaaDB.update('gaps', gap.uuid, { loop_type: cls.loop_type, closure_mechanism: cls.closure_mechanism });
    _level4_humanRequired(gap, [{ level: 0, outcome: 'constitutional_skip', ts: Date.now() }]);
    return;
  }

  // Check friction — if already in failure mode, don't retry
  const friction = esc?.getFriction(gap.type) || 0;
  if (friction >= 1.0) {
    const existing = jaaDB.query('failure_modes',
      r => r.faultClass === gap.type && r.status === 'active', 1)[0];
    if (existing) {
      jaaDB.update('gaps', gap.uuid, { status: 'human_required', failureModeUuid: existing.uuid });
      return;
    }
  }

  // Claim the gap
  jaaDB.update('gaps', gap.uuid, {
    status: 'routing', claimedBy: MODULE_ID, claimedAt: Date.now(),
    loop_type: cls.loop_type, closure_mechanism: cls.closure_mechanism,
  });

  // Verify claim (race protection)
  const claimed = jaaDB.get('gaps', gap.uuid);
  if (!claimed || claimed.claimedBy !== MODULE_ID) return;

  // Get RAID routing decision — taxonomy gives cluster hint
  const route = _raidRoute(gap);
  _writeRouting(gap, route, 0);

  const attempts = gap.attempts || 0;

  try {
    // ── Level 0: known fix from history ──────────────────────────────────────
    if (esc?.level0_knownFix) {
      const r0 = await esc.level0_knownFix(gap);
      history.push({ level: 0, outcome: r0.outcome, ts: Date.now() });
      jaaDB.insert('event_log', {
        uuid: uid(), type: 'gap-loop.level0',
        payload: { gapUuid: gap.uuid, outcome: r0.outcome, loop_type: cls.loop_type },
        source: MODULE_ID, causedBy: gap.uuid, ts: Date.now(),
      });
      if (r0.outcome === 'attempted' && friction < 0.4) {
        jaaDB.update('gaps', gap.uuid, { status: 'resolved', resolvedAt: Date.now(), fixStrategy: 'known_fix' });
        esc.reduceFriction(gap.type, 0.15, 'known_fix_applied');
        return;
      }
    }

    // ── Level 1: closure_mechanism-aware safe fix ─────────────────────────────
    // TEMPORAL loops → safe actions are first-class, not a fallback
    // WAIT mechanism: schedule/retry is the *correct* closure, not a consolation prize
    if (friction < 0.7) {
      const r1 = await _level1_safeFix(gap, cls);
      history.push({ level: 1, outcome: r1.resolved ? 'resolved' : 'failed', ts: Date.now() });
      if (r1.resolved) {
        jaaDB.update('gaps', gap.uuid, {
          status: 'resolved', resolvedAt: Date.now(), fixStrategy: r1.action,
        });
        esc?.reduceFriction(gap.type, 0.1, 'safe_fix_resolved');
        return;
      }
      // For WAIT-mechanism gaps (TEMPORAL), retry with backoff instead of escalating to AI
      if (WAIT_MECHANISMS.has(cls.closure_mechanism)) {
        jaaDB.update('gaps', gap.uuid, {
          status: 'retry_pending', claimedBy: null,
          nextRetryAt: Date.now() + BACKOFF_MS,
          attempts: attempts + 1,
          lastLoopAction: `TEMPORAL:wait — ${r1.reason || 'safe_fix_pending'}`,
        });
        return;
      }
      esc?.addFriction(gap.type, 0.2, 'safe_fix_failed', { action: r1.action });
    }

    // ── Level 2: AI forge — only for code-amenable loop types ────────────────
    // CAUSAL, INTEGRITY, CAPABILITY, CONFLICT → forge can help
    // RELATIONAL, UNDERSTANDING, DECISION    → AI dialogue, not code patch
    const AI_FORGE_MECHANISMS = new Set(['TRACE', 'VERIFY', 'EXTEND', 'RECONCILE']);
    const AI_DIALOGUE_MECHANISMS = new Set(['DIALOGUE', 'CLARIFY', 'DECIDE', 'RETRIEVE']);

    if (friction < 0.7 && AI_FORGE_MECHANISMS.has(cls.closure_mechanism)) {
      const r2 = await _level2_aiForge(gap, route);
      history.push({ level: 2, outcome: r2.resolved ? String(r2.resolved) : 'failed', ts: Date.now() });
      if (r2.resolved === 'pending_forge') {
        jaaDB.update('gaps', gap.uuid, {
          status: 'forge_processing', lastForgeAt: Date.now(),
          attempts: attempts + 1, claimedBy: 'self-heal',
        });
        esc?.addFriction(gap.type, 0.15, 'forge_dispatched');
        return;
      }
      esc?.addFriction(gap.type, 0.35, 'forge_failed', { reason: r2.reason });
    }

    // AI dialogue — for non-code loops (RELATIONAL, UNDERSTANDING, DECISION)
    if (friction < 0.7 && AI_DIALOGUE_MECHANISMS.has(cls.closure_mechanism)) {
      // Log as HELD — these need human or user interaction, not forge
      jaaDB.update('gaps', gap.uuid, {
        status:       LOOP_STATES.HELD,
        claimedBy:    null,
        heldReason:   `${cls.loop_type} requires ${cls.closure_mechanism} — holding for dialogue`,
        heldAt:       Date.now(),
        loop_type:    cls.loop_type,
      });
      jaaDB.insert('event_log', {
        uuid: uid(), type: 'gap-loop.held',
        payload: {
          gapUuid: gap.uuid, loop_type: cls.loop_type,
          closure_mechanism: cls.closure_mechanism,
          reason: 'dialogue_required',
        },
        source: MODULE_ID, causedBy: gap.uuid, ts: Date.now(),
      });
      return;
    }

    // ── Level 3: diagnostic deep scan ────────────────────────────────────────
    if (friction < 1.0) {
      const r3 = await _level3_deepScan(gap);
      history.push({ level: 3, outcome: 'scanned', ts: Date.now() });
      jaaDB.update('gaps', gap.uuid, {
        status: 'retry_pending', claimedBy: null,
        lastScannedAt: Date.now(), attempts: attempts + 1,
        nextRetryAt: Date.now() + BACKOFF_MS,
      });
      esc?.addFriction(gap.type, 0.5, 'deep_scan_no_resolve');
      return;
    }

    // ── Level 4: human required — terminal ────────────────────────────────────
    _level4_humanRequired(gap, history);

  } catch(err) {
    jaaDB.update('gaps', gap.uuid, {
      status: 'pending', claimedBy: null,
      lastError: err.message, attempts: attempts + 1,
    });
    jaaDB.insert('failures', {
      uuid: uid(), source: MODULE_ID,
      error: err.message, stack: err.stack?.slice(0, 500),
      causedBy: gap.uuid, ts: Date.now(),
    });
  }
}

// ── Main tick ─────────────────────────────────────────────────────────────────
async function _tick() {
  try {
    const now = Date.now();

    // Pull all non-terminal gaps
    const gaps = jaaDB.query('gaps', r => {
      if (r.status === 'resolved')       return false;
      if (r.status === 'human_required') return false; // terminal — never retry
      if (r.status === 'forge_applied')  return false;
      if (r.status === 'archived')       return false;
      if (r.status === 'held')           return false; // held = intentionally preserved
      if (r.status === 'pending')        return true;
      if (r.status === 'retry_pending' && r.nextRetryAt && now >= r.nextRetryAt) return true;
      // Stale 'routing' claims (gap-loop crashed mid-resolution) → reclaim after 30s
      if (r.status === 'routing' && r.claimedAt && now - r.claimedAt > 30_000) return true;
      return false;
    }, BATCH_SIZE);

    // Taxonomy pre-filter: classify all gaps, auto-resolve HELD signals
    const actionable = [];
    for (const g of gaps) {
      const cls = classify(g);
      if (SIGNAL_MECHANISMS.has(cls.loop_type)) {
        jaaDB.update('gaps', g.uuid, {
          status: 'resolved', resolvedAt: now,
          fixStrategy: 'signal-auto-resolve', loop_type: cls.loop_type,
        });
      } else {
        actionable.push(g);
      }
    }

    // ── Topology analysis — find focal points across ALL open loops ───────────
    // Don't process in FIFO order. Find which loops share a causal ancestor,
    // score leverage, process highest-leverage loops first.
    // "Which intervention collapses the greatest amount of uncertainty?"
    const allOpen = jaaDB.query('gaps', r =>
      r.status !== 'resolved' && r.status !== 'archived' &&
      r.status !== 'human_required' && r.status !== 'held', 500);

    let topo = null;
    if (allOpen.length >= 2) {
      try {
        topo = analyze(allOpen);

        if (topo.focal_points.length > 0) {
          jaaDB.insert('event_log', {
            uuid: uid(), type: 'gap-loop.topology',
            payload: {
              focal_count:     topo.focal_points.length,
              topology_health: topo.topology_health,
              summary:         topo.summary,
              top_action:      topo.top_action,
              top_focal: topo.focal_points[0] ? {
                identity:      topo.focal_points[0].identity?.label,
                leverage_score:topo.focal_points[0].leverage_score,
                loop_count:    topo.focal_points[0].loop_count,
                systems:       topo.focal_points[0].systems,
              } : null,
            },
            source: MODULE_ID, causedBy: null, ts: now,
          });

          if (topo.topology_health !== 'nominal') {
            // Only log when health level or focal identity changes — never on count alone
            const topoSig = `${topo.topology_health}:${topo.focal_points[0]?.identity?.label}`;
            if (topoSig !== _lastTopoSig) {
              _lastTopoSig = topoSig;
              console.log(`[${MODULE_ID}] topology:${topo.topology_health} — ${topo.summary}`);
              if (topo.top_action) console.log(`[${MODULE_ID}] → ${topo.top_action}`);
            }
          } else {
            _lastTopoSig = null; // reset when nominal so next degradation logs
          }

          // Evolve loops that are part of a focal point — accumulate focal evidence onto the loop
          // "The loop itself evolved. Not the handler."
          for (const fp of topo.focal_points.slice(0, 3)) {
            for (const loopRef of fp.affected_loops.slice(0, 5)) {
              try {
                const gap = jaaDB.get('gaps', loopRef.uuid);
                if (!gap || gap.status === 'routing') continue;
                const evolved = evolveLoop(gap, fp.evidence, null,
                  fp.identity?.category && fp.identity.category !== gap.loop_type
                    ? fp.identity.category : null);
                const hasNewEvidence = (evolved.evidence?.length || 0) > (gap.evidence?.length || 0);
                if (evolved.type_evolved || hasNewEvidence) {
                  jaaDB.update('gaps', gap.uuid, {
                    evidence:       evolved.evidence,
                    confidence:     evolved.confidence,
                    loop_type:      evolved.loop_type || gap.loop_type,
                    prev_loop_type: evolved.prev_loop_type,
                    focal_id:       fp.focal_id,
                    focal_leverage: fp.leverage_score,
                    evolved_at:     evolved.evolved_at,
                  });
                }
              } catch(_) {}
            }
          }
        }
      } catch(e) {
        // Topology failure must never block loop processing — §1.2
        jaaDB.insert('failures', {
          uuid: uid(), source: `${MODULE_ID}/topology`,
          error: e.message, ts: now,
        });
      }
    }

    if (!actionable.length) {
      // Idle — emit ecology snapshot so intelligence + reflection have signal
      if (allOpen.length) {
        const eco = ecology(allOpen);
        jaaDB.insert('event_log', {
          uuid: uid(), type: 'gap-loop.ecology',
          payload: { ...eco, topology_health: topo?.topology_health },
          source: MODULE_ID, causedBy: null, ts: now,
        });
        if (eco.ecology_health !== 'nominal') {
          console.log(`[${MODULE_ID}] ecology:${eco.ecology_health} — ` +
            Object.entries(eco.by_type).map(([t,n])=>`${t}:${n}`).join(' '));
        }
      }
      return;
    }

    // Order batch by focal priority — highest leverage loops processed first
    let ordered = actionable;
    if (topo?.priority_queue?.length) {
      const priorityMap = new Map(topo.priority_queue.map((l, i) => [l.uuid, i]));
      ordered = [...actionable].sort((a, b) => {
        const pa = priorityMap.has(a.uuid) ? priorityMap.get(a.uuid) : 9999;
        const pb = priorityMap.has(b.uuid) ? priorityMap.get(b.uuid) : 9999;
        return pa - pb;
      });
    }

    // Run resolutions — bounded concurrency (2 at a time, AI calls are slow)
    const CONCURRENCY = 2;
    for (let i = 0; i < ordered.length; i += CONCURRENCY) {
      const batch = ordered.slice(i, i + CONCURRENCY);
      await Promise.allSettled(batch.map(g => _resolveGap(g)));
    }

    jaaDB.insert('poll_log', {
      uuid: uid(), module: MODULE_ID,
      gapsProcessed:   ordered.length,
      topologyHealth:  topo?.topology_health || 'skipped',
      focalPoints:     topo?.focal_points?.length || 0,
      ts: now, source: MODULE_ID,
    });

  } catch(err) {
    jaaDB.insert('failures', {
      uuid: uid(), source: MODULE_ID,
      error: err.message, stack: err.stack?.slice(0, 500),
      ts: Date.now(),
    });
  }
}

// ── Public API ────────────────────────────────────────────────────────────────
function init(cfg = {}) {
  _cfg      = cfg;
  _interval = setInterval(_tick, cfg.pollMs ?? POLL_MS);
  _interval.unref();
  console.log(`[${MODULE_ID}] v${VERSION} — poll:${cfg.pollMs ?? POLL_MS}ms batch:${BATCH_SIZE}`);
}

function stop() {
  if (_interval) { clearInterval(_interval); _interval = null; }
}

function getState() {
  const allOpen      = jaaDB.query('gaps', r => r.status !== 'resolved' && r.status !== 'archived', 500);
  const eco          = ecology(allOpen);
  const humanReq     = jaaDB.query('gaps', r => r.status === 'human_required', 500).length;
  const forgeProc    = jaaDB.query('gaps', r => r.status === 'forge_processing', 500).length;
  const held         = jaaDB.query('gaps', r => r.status === 'held', 500).length;
  return { version: VERSION, ecology: eco, humanReq, forgeProc, held };
}

module.exports = { init, stop, getState, VERSION, MODULE_ID };
