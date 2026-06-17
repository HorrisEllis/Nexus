'use strict';
// ── cortex/intelligence/macro-compiler.js ────────────────────────────────────
// UUID: nexus-macro-compiler-v1-0000-4000-0000-000000000001
//
// Builds a compressed causal macro from crystallised BEP patterns and
// event history, mapping what led to a sigma divergence event.
//
// A "macro" is:
//   {
//     divergeTs,             — timestamp of the divergence
//     windowDays,            — how far back we looked
//     causeChain: [...],     — ordered list of contributing events/patterns
//     patterns: [...],       — crystallised patterns that were active
//     precursors: [...],     — event types that reliably precede this divergence class
//     recurrence: {...},     — has this pattern of divergence happened before?
//     summary: "...",        — plain English description
//     confidence: 0.0-1.0,   — how confident are we in the causal map
//   }
//
// Data sources:
//   event_log        — raw event timeline
//   bep_patterns     — crystallised co-occurrence + precursor patterns
//   sigma_records    — prior sigma spikes (are we repeating a known pattern?)
//   failures         — failure events in the window
//   gaps             — open/recently-resolved gaps
//
// §11.1  Every cause is as important as the conditions of its effect.
// §6.1   Documentation generated from proof — macro written from evidence only.

const { jaaDB, uid } = require('../memory/jaa-db');

const MODULE_ID = 'macro-compiler';
const VERSION   = '1.0.0';

// How far back to look for causal context (7 days default, up to 30)
const DEFAULT_WINDOW_DAYS = 7;
const MAX_WINDOW_DAYS     = 30;

// ── Compile a macro for a divergence event ────────────────────────────────────

async function compile(opts = {}) {
  const {
    divergeTs  = Date.now(),
    sigma      = 0,
    eventType  = '',
    reason     = '',
    windowDays = DEFAULT_WINDOW_DAYS,
  } = opts;

  const windowMs  = Math.min(windowDays, MAX_WINDOW_DAYS) * 86400000;
  const fromTs    = divergeTs - windowMs;

  // ── 1. Get crystallised patterns active before divergence ─────────────────
  const allPatterns = jaaDB.query('bep_patterns', () => true, 300);
  const relevantPatterns = allPatterns.filter(p => {
    if (!p.crystallised) return false;
    // Pattern involves the diverge event type, or is a known failure precursor
    const sig = p.signature || '';
    return sig.includes(eventType) ||
           p.patternType === 'failure_precursor' ||
           p.patternType === 'bottleneck';
  });

  // ── 2. Build timeline of events in the window ──────────────────────────────
  const events = jaaDB.query('event_log',
    r => r.ts && r.ts >= fromTs && r.ts <= divergeTs,
    2000
  ).sort((a, b) => a.ts - b.ts);

  // ── 3. Find failure precursors from pattern index ─────────────────────────
  const precursorPatterns = allPatterns.filter(p =>
    p.patternType === 'failure_precursor' && p.crystallised
  );

  // Check which precursor types actually fired in the window
  const eventTypeSet = new Set(events.map(e => e.type));
  const firedPrecursors = precursorPatterns
    .filter(p => {
      const sig = p.signature || '';
      // failure_precursor signature: "precursor_type:failure1,failure2"
      const [precType] = sig.split(':');
      return eventTypeSet.has(precType);
    })
    .map(p => ({
      type:       p.signature?.split(':')?.[0],
      leadsTo:    p.signature?.split(':')?.[1]?.split(',') || [],
      confidence: p.confidence || 0,
      occurrences: p.count || 0,
    }));

  // ── 4. Build cause chain ───────────────────────────────────────────────────
  // Walk backwards from divergeTs finding the sequence of state changes
  const causeChain = _buildCauseChain(events, divergeTs, sigma);

  // ── 5. Check recurrence — has this divergence class happened before? ───────
  const priorDivergences = jaaDB.query('event_log',
    r => r.type === 'divergence.snapshot' &&
         r.ts && r.ts >= (divergeTs - MAX_WINDOW_DAYS * 86400000) &&
         r.ts < divergeTs,
    20
  );

  const recurrence = {
    count:       priorDivergences.length,
    firstSeen:   priorDivergences[0]?.ts || null,
    lastSeen:    priorDivergences[priorDivergences.length - 1]?.ts || null,
    avgSigma:    priorDivergences.length
      ? +(priorDivergences.reduce((s, r) => s + (r.payload?.sigma || 0), 0) / priorDivergences.length).toFixed(3)
      : 0,
    isRecurring: priorDivergences.length >= 3,
  };

  // ── 6. Cross-reference with open gaps at diverge time ────────────────────
  const openGapsAtDiverge = jaaDB.query('gaps',
    g => g.ts && g.ts <= divergeTs && g.status === 'open',
    50
  );
  const gapContribution = _topN(openGapsAtDiverge.map(g => g.type || 'unknown'), 5);

  // ── 7. Sigma trajectory in the window ────────────────────────────────────
  const sigmaInWindow = jaaDB.query('sigma_records',
    r => r.ts && r.ts >= fromTs && r.ts <= divergeTs,
    500
  ).sort((a, b) => a.ts - b.ts);

  const sigmaTrajectory = _summarizeSigmaTrajectory(sigmaInWindow, divergeTs);

  // ── 8. Compute confidence ─────────────────────────────────────────────────
  const confidence = _computeConfidence({
    patternCount:    relevantPatterns.length,
    precursorCount:  firedPrecursors.length,
    causeChainLen:   causeChain.length,
    sigmaDataPoints: sigmaInWindow.length,
    eventCount:      events.length,
  });

  // ── 9. Generate plain-English summary ────────────────────────────────────
  const summary = _buildSummary({
    sigma, eventType, reason,
    causeChain, firedPrecursors,
    recurrence, gapContribution,
    sigmaTrajectory, confidence,
  });

  return {
    format:          'NEXUS-MACRO/1.0',
    compiledAt:      Date.now(),
    divergeTs,
    windowDays:      Math.min(windowDays, MAX_WINDOW_DAYS),
    windowMs,
    sigma,
    eventType,
    reason,
    causeChain,
    patterns:        relevantPatterns.map(p => ({
      type:       p.patternType,
      signature:  p.signature,
      confidence: p.confidence,
      count:      p.count,
    })),
    precursors:      firedPrecursors,
    recurrence,
    gapContribution,
    sigmaTrajectory,
    summary,
    confidence,
    eventCount:      events.length,
    sigmaDataPoints: sigmaInWindow.length,
  };
}

// ── Build a cause chain from the event timeline ───────────────────────────────
// Walks backwards from divergeTs identifying inflection points:
// - sigma spikes
// - error/failure events
// - gap openings
// - escalations
// Returns ordered list from earliest to latest.

function _buildCauseChain(events, divergeTs, finalSigma) {
  const chain = [];
  const INFLECTION_TYPES = [
    'gap.found', 'healer.escalated', 'self-heal.forge_failed',
    'self-heal.escalated', 'divergence.snapshot', 'failure',
    'escalation', 'heartbeat.api.degraded', 'baseline_drift',
  ];

  // Walk events from newest to oldest, collect inflection points
  const reversed = [...events].reverse();
  let sigmaAtPoint = finalSigma;
  let chainDepth = 0;

  for (const ev of reversed) {
    if (chainDepth >= 20) break; // max 20 links in chain

    const isInflection = INFLECTION_TYPES.some(t => (ev.type || '').includes(t)) ||
                         (ev.payload?.sigma >= 0.5);
    if (!isInflection) continue;

    const ageMs  = divergeTs - ev.ts;
    const ageMin = Math.round(ageMs / 60000);

    chain.unshift({
      ts:        ev.ts,
      ageMin:    ageMin,
      type:      ev.type,
      source:    ev.source || '',
      sigma:     ev.payload?.sigma || ev.sigma?.score || null,
      summary:   _summarizeEvent(ev),
    });
    chainDepth++;
  }

  return chain;
}

// ── Sigma trajectory summary ──────────────────────────────────────────────────
// Compresses the sigma timeline into a few key observations

function _summarizeSigmaTrajectory(sigmaRows, divergeTs) {
  if (!sigmaRows.length) return { trend: 'unknown', peakSigma: 0, dataPoints: 0 };

  const scores  = sigmaRows.map(r => r.score || 0);
  const peak    = Math.max(...scores);
  const first   = scores[0] || 0;
  const last    = scores[scores.length - 1] || 0;
  const avg     = scores.reduce((s, x) => s + x, 0) / scores.length;

  // Find the sigma inflection point (steepest rise)
  let maxRise = 0, inflectionTs = null;
  for (let i = 1; i < sigmaRows.length; i++) {
    const rise = (sigmaRows[i].score || 0) - (sigmaRows[i-1].score || 0);
    if (rise > maxRise) {
      maxRise = rise;
      inflectionTs = sigmaRows[i].ts;
    }
  }

  const trend = last > first + 0.2 ? 'rising'
              : last < first - 0.2 ? 'falling'
              : Math.abs(avg - first) > 0.15 ? 'volatile'
              : 'stable';

  return {
    trend,
    first:          +first.toFixed(3),
    last:           +last.toFixed(3),
    peakSigma:      +peak.toFixed(3),
    avgSigma:       +avg.toFixed(3),
    dataPoints:     sigmaRows.length,
    inflectionTs,
    inflectionMinBefore: inflectionTs
      ? Math.round((divergeTs - inflectionTs) / 60000)
      : null,
    maxRise:        +maxRise.toFixed(3),
  };
}

// ── Confidence score ──────────────────────────────────────────────────────────

function _computeConfidence({ patternCount, precursorCount, causeChainLen, sigmaDataPoints, eventCount }) {
  let score = 0;
  if (patternCount >= 3)       score += 0.25;
  else if (patternCount >= 1)  score += 0.10;
  if (precursorCount >= 2)     score += 0.25;
  else if (precursorCount >= 1)score += 0.12;
  if (causeChainLen >= 5)      score += 0.20;
  else if (causeChainLen >= 2) score += 0.10;
  if (sigmaDataPoints >= 50)   score += 0.20;
  else if (sigmaDataPoints >= 10) score += 0.10;
  if (eventCount >= 100)       score += 0.10;
  else if (eventCount >= 20)   score += 0.05;
  return +Math.min(1, score).toFixed(2);
}

// ── Plain-English summary ─────────────────────────────────────────────────────

function _buildSummary({ sigma, eventType, reason, causeChain, firedPrecursors, recurrence, gapContribution, sigmaTrajectory, confidence }) {
  const parts = [];

  // What happened
  parts.push(`Sigma diverged to ${sigma.toFixed(3)} (${reason || 'threshold crossed'}).`);

  // Trajectory
  if (sigmaTrajectory.trend !== 'unknown') {
    const trajDesc = sigmaTrajectory.trend === 'rising'
      ? `Sigma was rising from ${sigmaTrajectory.first} over the observation window.`
      : sigmaTrajectory.trend === 'volatile'
      ? `Sigma was volatile (avg ${sigmaTrajectory.avgSigma}, peak ${sigmaTrajectory.peakSigma}).`
      : `Sigma was stable before this spike.`;
    parts.push(trajDesc);
    if (sigmaTrajectory.inflectionMinBefore) {
      parts.push(`Inflection point was ${sigmaTrajectory.inflectionMinBefore}min before divergence (rise: +${sigmaTrajectory.maxRise}).`);
    }
  }

  // Known precursors that fired
  if (firedPrecursors.length) {
    const precNames = firedPrecursors.slice(0, 3).map(p => p.type).join(', ');
    parts.push(`Known precursor patterns fired: ${precNames}.`);
  }

  // Open gaps contributing
  if (gapContribution.length) {
    const topGap = gapContribution[0];
    parts.push(`${gapContribution.length} open gap type(s) at diverge time; top: "${topGap.k}" (${topGap.v}×).`);
  }

  // Recurrence
  if (recurrence.isRecurring) {
    parts.push(`This divergence class has recurred ${recurrence.count}× (avg σ=${recurrence.avgSigma}).`);
  }

  // Cause chain summary
  if (causeChain.length) {
    const earliest = causeChain[0];
    parts.push(`Earliest contributing event: "${earliest.type}" ${earliest.ageMin}min before divergence.`);
  }

  parts.push(`Confidence: ${(confidence * 100).toFixed(0)}%.`);
  return parts.join(' ');
}

// ── Event summarizer ──────────────────────────────────────────────────────────

function _summarizeEvent(ev) {
  const p = ev.payload || {};
  if (ev.type === 'gap.found')         return `gap opened: ${p.type || p.loop_type || '?'} on ${p.path || '?'}`;
  if (ev.type === 'healer.escalated')  return `escalated: ${p.reason || p.gapUuid || '?'}`;
  if (ev.type?.includes('forge_failed'))return `forge patch failed on ${p.module || '?'}`;
  if (ev.type?.includes('divergence')) return `prior divergence σ=${p.sigma?.toFixed?.(3) || '?'}`;
  return `${ev.type} from ${ev.source || '?'}`;
}

function _topN(arr, n) {
  const freq = {};
  for (const x of arr) freq[x] = (freq[x] || 0) + 1;
  return Object.entries(freq).sort(([,a],[,b]) => b - a).slice(0, n).map(([k, v]) => ({ k, v }));
}

module.exports = { compile, MODULE_ID, VERSION };
