'use strict';
// ── lib/diag-engines/index.js ─────────────────────────────────────────────────
// UUID: nexus-diag-engines-v1-0000-4000-0000-000000000003
// Version: 1.0.0
// Phase: 47 — Diagnostic Engine Composite Health Pack
//
// THE IMMUNE SYSTEM.
//
// The diagnostic service (:7825) has been calling _getDiagEngines() and
// null-checking the result on every audit cycle since this gap was opened.
// The service returns 503 for the 6 engines that require this module.
// The gap-loop cannot escalate gaps with missing health signal.
// The autonomous loop cannot sense system fitness before taking steps.
//
// This module builds all 12 engines. Each is a function that takes a snapshot
// of system state (ledger rows, JAA tables, CFR field, bus metrics) and returns
// a typed diagnostic result: { engine, score, status, findings, recommendations }.
//
// ── ENGINES ──────────────────────────────────────────────────────────────────
// 1.  entropy_rate      — event diversity and information density over time
// 2.  snr_floor         — signal-to-noise ratio: meaningful vs. noise events
// 3.  homeostasis       — system return-to-baseline after disturbance
// 4.  fault_tree        — causal chain analysis from failure events
// 5.  cascade_risk      — probability that one failure propagates to others
// 6.  fingerprint       — system identity drift (is it still NEXUS?)
// 7.  gap_pressure      — unresolved gap load relative to resolution capacity
// 8.  friction_ledger   — cumulative friction by subsystem and gap type
// 9.  latency_gradient  — response time trajectory (speeding up / slowing down)
// 10. bus_saturation    — event bus throughput vs. historical capacity
// 11. memory_coherence  — JAA table consistency and cross-reference integrity
// 12. recovery_velocity — how fast the system resolves gaps after detecting them
//
// ── OUTPUT CONTRACT ───────────────────────────────────────────────────────────
// Every engine returns:
//   engine:          string (engine ID)
//   score:           0.0–1.0 (1.0 = fully healthy)
//   status:          'healthy' | 'degraded' | 'critical' | 'unknown'
//   findings:        string[] (specific observations, not generic advice)
//   recommendations: string[] (actionable, gap-level)
//   evidence:        object (raw numbers that produced the score)
//   ts:              number
//
// ── AXIOMS ───────────────────────────────────────────────────────────────────
// §1.1  Every engine result has a UUID — emitted to event_log.
// §1.2  Degraded results are surfaced — never silently scored as 'healthy'.
// §2.2  Engines read JAA as source of truth; never infer from bus alone.

const crypto = require('crypto');

const MODULE_ID = 'diag-engines';
const VERSION   = '1.0.0';

function uid() { return crypto.randomUUID(); }

// ── Status thresholds ─────────────────────────────────────────────────────────
function _status(score) {
  if (score >= 0.75) return 'healthy';
  if (score >= 0.45) return 'degraded';
  return 'critical';
}

function _result(engine, score, findings, recommendations, evidence = {}) {
  return {
    uuid:            uid(),
    engine,
    score:           +score.toFixed(4),
    status:          _status(score),
    findings:        findings || [],
    recommendations: recommendations || [],
    evidence,
    ts:              Date.now(),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function _clamp(v) { return Math.min(1, Math.max(0, v)); }
function _mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

// ── 1. entropy_rate ───────────────────────────────────────────────────────────
// Measures event type diversity in the ledger over the last N events.
// Low entropy = the system is stuck in a loop (same types repeating).
// High entropy = healthy variety of events. Very high = chaotic.
function entropy_rate(snapshot) {
  const { ledgerRows = [] } = snapshot;
  if (!ledgerRows.length) {
    return _result('entropy_rate', 0.5,
      ['Insufficient ledger data (< 1 row) — engine running in degraded mode'],
      ['Ensure the event ledger has data before running diagnostics'],
      { rowCount: 0 });
  }

  // Count event type frequencies
  const freq = {};
  for (const r of ledgerRows) {
    const t = r.type || 'unknown';
    freq[t] = (freq[t] || 0) + 1;
  }
  const total = ledgerRows.length;
  const types = Object.keys(freq);

  // Shannon entropy: H = -Σ p(t) * log2(p(t))
  let H = 0;
  for (const t of types) {
    const p = freq[t] / total;
    H -= p * Math.log2(p);
  }
  const maxH = Math.log2(Math.max(types.length, 1));
  const normalized = maxH > 0 ? H / maxH : 1;

  // Healthy range: 0.35–0.85. Below = stuck, above = chaotic
  let score;
  const findings = [];
  const recs = [];
  if (normalized < 0.25) {
    score = normalized / 0.25 * 0.5;
    findings.push(`Event entropy critically low (${normalized.toFixed(3)}) — system may be stuck in a loop`);
    const dominant = types.sort((a, b) => freq[b] - freq[a])[0];
    findings.push(`Dominant event type '${dominant}' accounts for ${((freq[dominant] / total) * 100).toFixed(1)}% of events`);
    recs.push('Inspect gap-loop for runaway retry cycles on dominant event type');
    recs.push('Check if a single subsystem is flooding the bus');
  } else if (normalized > 0.92) {
    score = _clamp(1.0 - (normalized - 0.92) * 3);
    findings.push(`Event entropy high (${normalized.toFixed(3)}) — system may be chaotic`);
    recs.push('Review bus saturation and consider adding event sampling');
  } else {
    score = _clamp(0.5 + (normalized - 0.35) / 0.50 * 0.5);
    findings.push(`Event entropy nominal (${normalized.toFixed(3)}, ${types.length} types across ${total} events)`);
  }

  return _result('entropy_rate', score, findings, recs,
    { entropy: +H.toFixed(4), normalizedEntropy: +normalized.toFixed(4), uniqueTypes: types.length, total });
}

// ── 2. snr_floor ──────────────────────────────────────────────────────────────
// Signal = events that carry diagnostic meaning (gaps, decisions, errors).
// Noise  = heartbeats, watchdog ticks, routine health probes.
function snr_floor(snapshot) {
  const { ledgerRows = [], busMetrics = {} } = snapshot;
  const NOISE_RE = /heartbeat|watchdog\.tick|pulse|health\.check|register\.ack/;
  const SIGNAL_RE = /gap\.|error|failure|decision|boundary|sigma\.|constitutional|seam\.|artifact/;

  let signal = 0, noise = 0, other = 0;
  for (const r of ledgerRows) {
    const t = r.type || '';
    if (SIGNAL_RE.test(t))  signal++;
    else if (NOISE_RE.test(t)) noise++;
    else other++;
  }
  const total = ledgerRows.length || 1;
  const snr = signal / Math.max(noise + other, 1);

  // Healthy SNR: 0.15–0.60. Too low = can't see signal. Too high = noise suppression may be failing.
  let score;
  const findings = [];
  const recs = [];
  if (snr < 0.05) {
    score = snr / 0.05 * 0.3;
    findings.push(`SNR critically low (${snr.toFixed(3)}) — ${signal}/${total} events are diagnostic signals`);
    recs.push('Increase diagnostic event emission or reduce heartbeat frequency');
  } else if (snr > 0.80) {
    score = _clamp(1.0 - (snr - 0.80));
    findings.push(`SNR unusually high (${snr.toFixed(3)}) — system may be in alarm state`);
    recs.push('Investigate whether error flooding is suppressing normal operational events');
  } else {
    score = _clamp(0.5 + (snr - 0.05) / 0.55 * 0.5);
    findings.push(`SNR healthy (${snr.toFixed(3)}) — ${signal} signal events, ${noise} noise events`);
  }

  return _result('snr_floor', score, findings, recs,
    { signal, noise, other, total, snr: +snr.toFixed(4) });
}

// ── 3. homeostasis ────────────────────────────────────────────────────────────
// Does the system return to baseline after disturbance?
// Measured by: sigma trajectory — does sigma spike then return, or stay elevated?
function homeostasis(snapshot) {
  const { sigmaRecords = [] } = snapshot;
  if (sigmaRecords.length < 10) {
    return _result('homeostasis', 0.6,
      ['Insufficient sigma history — homeostasis engine needs 10+ sigma records'],
      ['Allow system to run for at least one COMPOSITE_WINDOW before evaluating homeostasis'],
      { recordCount: sigmaRecords.length });
  }

  // Split into windows and check mean sigma per window
  const windowSize = Math.floor(sigmaRecords.length / 4);
  const windows = [];
  for (let i = 0; i < 4; i++) {
    const slice = sigmaRecords.slice(i * windowSize, (i + 1) * windowSize);
    windows.push(_mean(slice.map(r => r.sigma || 0)));
  }

  // Homeostasis: spikes should resolve. Check if last window < first window + threshold
  const first = windows[0], last = windows[3];
  const peak  = Math.max(...windows);
  const findings = [];
  const recs = [];
  let score;

  if (peak - last < 0.05) {
    // Sigma stayed flat or returned to baseline — healthy
    score = _clamp(1.0 - last * 0.5);
    findings.push(`System returning to baseline. Peak sigma: ${peak.toFixed(3)}, current: ${last.toFixed(3)}`);
  } else if (last > peak * 0.85) {
    // Sigma spiked and stayed elevated
    score = _clamp(0.3 - (last - 0.5) * 0.4);
    findings.push(`Sigma remains elevated after disturbance. Peak: ${peak.toFixed(3)}, current: ${last.toFixed(3)}`);
    recs.push('Check for unresolved gaps that are sustaining system stress');
    recs.push('Review gap-loop escalation ladder — CONSTITUTIONAL gaps may be blocking resolution');
  } else {
    score = _clamp(0.5 + (1 - (last / peak)) * 0.5);
    findings.push(`System partially recovering. Peak: ${peak.toFixed(3)}, current: ${last.toFixed(3)}`);
  }

  return _result('homeostasis', score, findings, recs,
    { windows, peak: +peak.toFixed(4), currentMean: +last.toFixed(4), recordCount: sigmaRecords.length });
}

// ── 4. fault_tree ─────────────────────────────────────────────────────────────
// Builds a causal chain from failure events in the JAA failures table.
// Score = inverse of failure chain depth (deep chains = systemic, not isolated).
function fault_tree(snapshot) {
  const { failures = [], gaps = [] } = snapshot;
  if (!failures.length) {
    return _result('fault_tree', 0.95,
      ['No failures in failures table — fault tree has nothing to analyze'],
      [],
      { failureCount: 0 });
  }

  // Group failures by causedBy to find chains
  const causalMap = {};
  for (const f of failures) {
    const cause = f.causedBy || 'root';
    if (!causalMap[cause]) causalMap[cause] = [];
    causalMap[cause].push(f);
  }

  // Find root failures (no parent in failures table)
  const failureIds = new Set(failures.map(f => f.uuid));
  const roots = failures.filter(f => !failureIds.has(f.causedBy));

  // Compute max chain depth from each root
  function chainDepth(id, visited = new Set()) {
    if (visited.has(id)) return 0; // cycle guard
    visited.add(id);
    const children = causalMap[id] || [];
    if (!children.length) return 1;
    return 1 + Math.max(...children.map(c => chainDepth(c.uuid, new Set(visited))));
  }

  const maxDepth = roots.length ? Math.max(...roots.map(r => chainDepth(r.uuid))) : 1;
  const recentFailures = failures.filter(f => Date.now() - (f.ts || 0) < 3600000); // last hour

  // Deep chains (> 3) indicate systemic issues
  const score = _clamp(1.0 - Math.min(1, (maxDepth - 1) / 5) * 0.7 - (recentFailures.length / 100) * 0.3);
  const findings = [
    `${failures.length} total failures. Max causal chain depth: ${maxDepth}. ${recentFailures.length} in last hour.`,
  ];
  const recs = [];
  if (maxDepth > 3) {
    const deepRoot = roots.reduce((a, b) => chainDepth(a.uuid) > chainDepth(b.uuid) ? a : b, roots[0]);
    findings.push(`Deepest chain originates from: ${deepRoot?.source || 'unknown'} — ${deepRoot?.error?.slice(0, 80) || ''}`);
    recs.push(`Investigate root failure in '${deepRoot?.source}' — ${maxDepth}-level cascade detected`);
  }

  return _result('fault_tree', score, findings, recs,
    { failureCount: failures.length, rootCount: roots.length, maxDepth, recentFailures: recentFailures.length });
}

// ── 5. cascade_risk ───────────────────────────────────────────────────────────
// Cross-system failure correlation. If system A fails, how likely is B to follow?
// Computed from co-occurrence of failure sources within a 30-second window.
function cascade_risk(snapshot) {
  const { failures = [] } = snapshot;
  if (failures.length < 3) {
    return _result('cascade_risk', 0.9,
      ['Insufficient failure data for cascade correlation analysis'],
      [],
      { failureCount: failures.length });
  }

  // Sort by timestamp
  const sorted = [...failures].sort((a, b) => (a.ts || 0) - (b.ts || 0));

  // Sliding 30-second windows — count co-occurring sources
  const WINDOW_MS = 30000;
  const coOccurrences = {};
  for (let i = 0; i < sorted.length; i++) {
    const anchor = sorted[i];
    const sources = new Set([anchor.source]);
    for (let j = i + 1; j < sorted.length; j++) {
      if ((sorted[j].ts || 0) - (anchor.ts || 0) > WINDOW_MS) break;
      sources.add(sorted[j].source);
    }
    if (sources.size > 1) {
      const key = [...sources].sort().join(':');
      coOccurrences[key] = (coOccurrences[key] || 0) + 1;
    }
  }

  const cascadeCount = Object.values(coOccurrences).reduce((a, b) => a + b, 0);
  const maxCascade   = Math.max(...Object.values(coOccurrences), 0);
  const score = _clamp(1.0 - Math.min(1, cascadeCount / 20) * 0.8);

  const findings = [
    `${cascadeCount} co-failure windows detected across ${Object.keys(coOccurrences).length} source pairs`,
  ];
  const recs = [];
  if (maxCascade > 3) {
    const hotPair = Object.entries(coOccurrences).sort((a, b) => b[1] - a[1])[0];
    findings.push(`Highest cascade risk: ${hotPair[0]} (co-failed ${hotPair[1]}x)`);
    recs.push(`Introduce circuit breaker between ${hotPair[0].split(':').join(' and ')}`);
  }

  return _result('cascade_risk', score, findings, recs,
    { cascadeWindows: cascadeCount, uniquePairs: Object.keys(coOccurrences).length, maxCascade });
}

// ── 6. fingerprint ────────────────────────────────────────────────────────────
// Is this system still behaving like NEXUS? Checks that core axiom-enforcing
// subsystems are emitting their expected event signatures.
function fingerprint(snapshot) {
  const { ledgerRows = [], registeredSystems = [] } = snapshot;
  const EXPECTED_SYSTEMS = ['orchestrator', 'bridge', 'cortex', 'guardian', 'idearium', 'architect', 'diagnostic'];
  const EXPECTED_EVENTS  = ['bridge.request', 'cortex.gap', 'guardian.job', 'orchestrator.watchdog'];

  const presentSystems = new Set(registeredSystems.map(s => s.id || s.name || s));
  const eventTypes     = new Set(ledgerRows.map(r => r.type || ''));

  const systemCoverage = EXPECTED_SYSTEMS.filter(s => [...presentSystems].some(p => p.includes(s)));
  const eventCoverage  = EXPECTED_EVENTS.filter(e => [...eventTypes].some(t => t.includes(e.split('.')[0])));

  const systemScore = systemCoverage.length / EXPECTED_SYSTEMS.length;
  const eventScore  = eventCoverage.length  / EXPECTED_EVENTS.length;
  const score       = _clamp(systemScore * 0.6 + eventScore * 0.4);

  const findings = [
    `${systemCoverage.length}/${EXPECTED_SYSTEMS.length} expected subsystems registered`,
    `${eventCoverage.length}/${EXPECTED_EVENTS.length} expected event signatures present`,
  ];
  const recs = [];
  const missingSystems = EXPECTED_SYSTEMS.filter(s => !systemCoverage.includes(s));
  if (missingSystems.length) {
    findings.push(`Missing subsystems: ${missingSystems.join(', ')}`);
    recs.push(`Start missing subsystems: ${missingSystems.join(', ')}`);
  }

  return _result('fingerprint', score, findings, recs,
    { systemCoverage: systemCoverage.length, eventCoverage: eventCoverage.length,
      missingSystems, presentSystems: [...presentSystems] });
}

// ── 7. gap_pressure ───────────────────────────────────────────────────────────
// Gap load = unresolved gaps / (gaps resolved in last hour).
// High pressure = gaps accumulating faster than they're being resolved.
function gap_pressure(snapshot) {
  const { gaps = [] } = snapshot;
  const now     = Date.now();
  const HOUR    = 3600000;

  const pending   = gaps.filter(g => g.status === 'pending' || g.status === 'open').length;
  const escalated = gaps.filter(g => g.status === 'escalated').length;
  const resolved  = gaps.filter(g => g.status === 'resolved' && now - (g.resolvedAt || 0) < HOUR).length;
  const constitutional = gaps.filter(g => g.loop_type === 'CONSTITUTIONAL' && g.status !== 'archived').length;

  const resolutionRate = resolved / Math.max(pending + resolved, 1);
  const pressureIndex  = pending / Math.max(resolved + 1, 1);
  const score = _clamp(resolutionRate * 0.7 + (1 - Math.min(1, pressureIndex / 10)) * 0.3);

  const findings = [
    `${pending} pending gaps, ${escalated} escalated, ${resolved} resolved in last hour`,
    `Resolution rate: ${(resolutionRate * 100).toFixed(1)}%`,
  ];
  if (constitutional > 0) findings.push(`${constitutional} CONSTITUTIONAL gaps require human review`);
  const recs = [];
  if (pressureIndex > 3) recs.push('Gap accumulation exceeding resolution — review gap-loop POLL_MS and batch size');
  if (constitutional > 2) recs.push('Multiple CONSTITUTIONAL gaps queued — operator review needed to unblock self-healing');

  return _result('gap_pressure', score, findings, recs,
    { pending, escalated, resolved, constitutional, resolutionRate: +resolutionRate.toFixed(4), pressureIndex: +pressureIndex.toFixed(4) });
}

// ── 8. friction_ledger ────────────────────────────────────────────────────────
// Cumulative friction by subsystem and gap type.
// Friction >= 1.0 blocks gap-loop retry for that type.
function friction_ledger(snapshot) {
  const { failureModes = [], gaps = [] } = snapshot;

  const frictionBySource = {};
  for (const fm of failureModes) {
    const src = fm.source || 'unknown';
    frictionBySource[src] = (frictionBySource[src] || 0) + (fm.friction || 0);
  }

  const blocked = Object.entries(frictionBySource).filter(([, v]) => v >= 1.0);
  const total   = Object.values(frictionBySource).reduce((a, b) => a + b, 0);
  const sources = Object.keys(frictionBySource).length;

  const score = _clamp(1.0 - (blocked.length / Math.max(sources, 1)) * 0.8 - Math.min(0.2, total / 100));
  const findings = [
    `${sources} sources with friction data. ${blocked.length} sources at friction >= 1.0 (blocked).`,
  ];
  if (blocked.length) findings.push(`Blocked sources: ${blocked.map(([s]) => s).join(', ')}`);
  const recs = [];
  if (blocked.length) recs.push(`Reset friction for ${blocked.map(([s]) => s).join(', ')} after investigating root cause`);

  return _result('friction_ledger', score, findings, recs,
    { totalFriction: +total.toFixed(4), blockedSources: blocked.length, sourcesTotal: sources, blocked: blocked.map(([k, v]) => ({ source: k, friction: +v.toFixed(3) })) });
}

// ── 9. latency_gradient ───────────────────────────────────────────────────────
// Is the system responding faster or slower over time?
// Approximated from event-to-event intervals in the ledger.
function latency_gradient(snapshot) {
  const { ledgerRows = [] } = snapshot;
  if (ledgerRows.length < 20) {
    return _result('latency_gradient', 0.7,
      ['Insufficient ledger data for latency gradient analysis (need 20+ rows)'],
      [],
      { rowCount: ledgerRows.length });
  }

  const sorted = [...ledgerRows].sort((a, b) => (a.ts || 0) - (b.ts || 0));
  const intervals = [];
  for (let i = 1; i < sorted.length; i++) {
    intervals.push((sorted[i].ts || 0) - (sorted[i - 1].ts || 0));
  }

  const half     = Math.floor(intervals.length / 2);
  const earlyMean = _mean(intervals.slice(0, half));
  const lateMean  = _mean(intervals.slice(half));
  const gradient  = (lateMean - earlyMean) / Math.max(earlyMean, 1);  // positive = slowing down

  let score;
  const findings = [];
  const recs = [];
  if (gradient > 0.5) {
    score = _clamp(0.5 - gradient * 0.3);
    findings.push(`Latency increasing — early mean ${earlyMean.toFixed(0)}ms vs recent ${lateMean.toFixed(0)}ms (+${(gradient * 100).toFixed(0)}%)`);
    recs.push('System slowing down — check for resource contention, large JAA tables, or ledger write bottlenecks');
  } else if (gradient < -0.3) {
    score = 0.85;
    findings.push(`Latency decreasing — system warming up or shedding load (${(Math.abs(gradient) * 100).toFixed(0)}% faster)`);
  } else {
    score = _clamp(0.85 - Math.abs(gradient) * 0.2);
    findings.push(`Latency stable — early ${earlyMean.toFixed(0)}ms, recent ${lateMean.toFixed(0)}ms`);
  }

  return _result('latency_gradient', score, findings, recs,
    { earlyMeanMs: +earlyMean.toFixed(2), lateMeanMs: +lateMean.toFixed(2), gradient: +gradient.toFixed(4) });
}

// ── 10. bus_saturation ────────────────────────────────────────────────────────
// Is the event bus approaching capacity limits?
function bus_saturation(snapshot) {
  const { busMetrics = {}, ledgerRows = [] } = snapshot;
  const { historyRingSize = 1000, subscriberCount = 0, emitRate1m = 0 } = busMetrics;

  // Infer emit rate from ledger if busMetrics not available
  const WINDOW_MS = 60000;
  const recentRows = ledgerRows.filter(r => Date.now() - (r.ts || 0) < WINDOW_MS);
  const inferredRate = recentRows.length; // per minute

  const effectiveRate = emitRate1m || inferredRate;
  const saturation    = effectiveRate / Math.max(historyRingSize, 1000);
  const score         = _clamp(1.0 - Math.min(1, saturation) * 0.8);

  const findings = [
    `~${effectiveRate} events/min. History ring: ${historyRingSize}. Subscribers: ${subscriberCount}.`,
  ];
  const recs = [];
  if (saturation > 0.8) {
    findings.push('Bus approaching saturation — history ring may begin dropping events');
    recs.push('Increase NexusBus history ring size or add event sampling for high-frequency types');
  }

  return _result('bus_saturation', score, findings, recs,
    { eventsPerMin: effectiveRate, historyRingSize, subscriberCount, saturation: +saturation.toFixed(4) });
}

// ── 11. memory_coherence ──────────────────────────────────────────────────────
// JAA table cross-reference integrity.
// Checks that gap causedBy references exist, failure causedBy references exist, etc.
function memory_coherence(snapshot) {
  const { gaps = [], failures = [], decisions = [] } = snapshot;

  const gapIds     = new Set(gaps.map(g => g.uuid));
  const decisionIds = new Set(decisions.map(d => d.uuid));
  const failureIds  = new Set(failures.map(f => f.uuid));

  let danglingGapRefs = 0, danglingDecisionRefs = 0;

  for (const f of failures) {
    if (f.causedBy && !gapIds.has(f.causedBy) && !failureIds.has(f.causedBy)) danglingGapRefs++;
  }
  for (const g of gaps) {
    if (g.causedBy && !gapIds.has(g.causedBy) && !decisionIds.has(g.causedBy)) danglingDecisionRefs++;
  }

  const totalRefs  = failures.length + gaps.length;
  const dangling   = danglingGapRefs + danglingDecisionRefs;
  const coherence  = totalRefs > 0 ? 1 - (dangling / totalRefs) : 1;
  const score      = _clamp(coherence * 0.9 + 0.1); // floor at 0.1

  const findings = [
    `${gaps.length} gaps, ${failures.length} failures, ${decisions.length} decisions in JAA`,
    `${dangling} dangling cross-references (${((dangling / Math.max(totalRefs, 1)) * 100).toFixed(1)}%)`,
  ];
  const recs = [];
  if (dangling > 10) recs.push('High dangling reference count — JAA tables may need cross-reference repair');

  return _result('memory_coherence', score, findings, recs,
    { gaps: gaps.length, failures: failures.length, decisions: decisions.length, danglingRefs: dangling, coherence: +coherence.toFixed(4) });
}

// ── 12. recovery_velocity ─────────────────────────────────────────────────────
// How fast does the system move from gap detected to gap resolved?
function recovery_velocity(snapshot) {
  const { gaps = [] } = snapshot;
  const resolved = gaps.filter(g => g.status === 'resolved' && g.resolvedAt && g.createdAt);
  if (!resolved.length) {
    return _result('recovery_velocity', 0.7,
      ['No resolved gaps with timing data — cannot compute recovery velocity'],
      ['Ensure resolvedAt is set when gaps are archived'],
      { resolvedCount: 0 });
  }

  const times = resolved.map(g => g.resolvedAt - g.createdAt).filter(t => t > 0);
  const meanMs  = _mean(times);
  const medianMs = times.sort((a, b) => a - b)[Math.floor(times.length / 2)];

  // Healthy: median < 5 minutes. Degraded: > 30 minutes. Critical: > 2 hours.
  const HEALTHY_MS  = 5   * 60 * 1000;
  const DEGRADED_MS = 30  * 60 * 1000;
  const CRITICAL_MS = 120 * 60 * 1000;

  let score;
  const findings = [`${resolved.length} resolved gaps. Median recovery: ${(medianMs / 60000).toFixed(1)}min. Mean: ${(meanMs / 60000).toFixed(1)}min.`];
  const recs = [];
  if (medianMs < HEALTHY_MS) {
    score = 0.95;
  } else if (medianMs < DEGRADED_MS) {
    score = _clamp(0.95 - ((medianMs - HEALTHY_MS) / (DEGRADED_MS - HEALTHY_MS)) * 0.4);
  } else if (medianMs < CRITICAL_MS) {
    score = _clamp(0.55 - ((medianMs - DEGRADED_MS) / (CRITICAL_MS - DEGRADED_MS)) * 0.4);
    recs.push('Recovery velocity degraded — review gap-loop BACKOFF_MS and batch size');
  } else {
    score = 0.1;
    findings.push('Recovery critically slow — gaps taking >2 hours to resolve');
    recs.push('Immediate investigation required: gap escalation ladder may be broken');
  }

  return _result('recovery_velocity', score, findings, recs,
    { resolvedCount: resolved.length, medianMs: +medianMs.toFixed(0), meanMs: +meanMs.toFixed(0) });
}

// ── Composite runner ──────────────────────────────────────────────────────────
// Runs all 12 engines against the snapshot and returns a composite result.
function runAll(snapshot) {
  const engines = [
    entropy_rate, snr_floor, homeostasis, fault_tree, cascade_risk,
    fingerprint, gap_pressure, friction_ledger, latency_gradient,
    bus_saturation, memory_coherence, recovery_velocity,
  ];

  const results = {};
  for (const engine of engines) {
    try {
      results[engine.name] = engine(snapshot);
    } catch (e) {
      results[engine.name] = {
        uuid:    uid(),
        engine:  engine.name,
        score:   0,
        status:  'unknown',
        findings: [`Engine threw: ${e.message}`],
        recommendations: ['Fix engine error before relying on this diagnostic'],
        evidence: { error: e.message },
        ts:      Date.now(),
      };
    }
  }

  const scores    = Object.values(results).map(r => r.score);
  const composite = +(_mean(scores).toFixed(4));
  const critical  = Object.values(results).filter(r => r.status === 'critical').map(r => r.engine);

  return {
    composite,
    status: _status(composite),
    engines: results,
    critical,
    engineCount: engines.length,
    ts: Date.now(),
  };
}

module.exports = {
  runAll,
  // Individual engines — exposed for targeted diagnostics
  entropy_rate, snr_floor, homeostasis, fault_tree, cascade_risk,
  fingerprint, gap_pressure, friction_ledger, latency_gradient,
  bus_saturation, memory_coherence, recovery_velocity,
  MODULE_ID, VERSION,
};
