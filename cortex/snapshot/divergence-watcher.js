'use strict';
// ── cortex/snapshot/divergence-watcher.js ────────────────────────────────────
// UUID: nexus-divergence-watcher-v1-0000-4000-0000-000000000001
//
// Watches sigma_records in real time. When sigma diverges above threshold,
// triggers an automatic .nex snapshot that includes:
//   - system_state (heap, uptime, open gaps, friction)
//   - blackbox (compressed last 10 min of events + 30s post-divergence capture)
//   - divergence_context (what changed, what sigma axis fired)
//   - macro (causal chain from pattern engine — compiled async after snapshot)
//
// COOLDOWN:  after a divergence snapshot, no further auto-snapshots for
//            COOLDOWN_MS (default 90s). This prevents snapshot storms during
//            a cascade while still capturing the onset.
//
// HALF-LIFE: divergence snapshots decay faster than manual ones.
//            They are tagged type:'divergence' and given priority 3.5
//            (between manual:5 and auto:3) so they survive meaningful
//            half-life pruning without crowding the timeline.
//
// §2.1  Snapshot written before any further state change
// §1.2  All divergence events logged to event_log
// §M1   init(cfg) + stop()

const zlib = require('zlib');
const { jaaDB, uid } = require('../memory/jaa-db');

const MODULE_ID  = 'divergence-watcher';
const VERSION    = '1.0.0';

// ── Thresholds ────────────────────────────────────────────────────────────────
const SIGMA_THRESHOLD    = 0.65;   // score above this = divergence event
const SIGMA_SPIKE_DELTA  = 0.20;   // OR: score rose by this much vs last reading
const COOLDOWN_MS        = 90_000; // 90s between auto-snapshots
const POLL_MS            = 5_000;  // check every 5s
const BLACKBOX_PRE_MS    = 10 * 60 * 1000;  // capture 10 min before
const BLACKBOX_POST_MS   = 30_000;           // capture 30s after (deferred)

// ── State ─────────────────────────────────────────────────────────────────────
let _interval        = null;
let _lastSnapshotTs  = 0;
let _lastSigmaScore  = 0;
let _pendingPostCaptures = []; // { snapId, captureAt }
let _cfg             = {};

// ── System state capture ──────────────────────────────────────────────────────
// Returns a plain object with the full runtime context at this moment.
// This is what allows resume — when a .nex is loaded, the UI shows
// exactly what state the system was in when the snapshot fired.

function _captureSystemState() {
  const mem = process.memoryUsage();
  const openGaps = jaaDB.query('gaps', r => r.status === 'open', 200);

  // Friction from recent delta_records
  const recentDeltas = jaaDB.query('delta_records',
    r => r.ts && r.ts > Date.now() - 60_000, 50
  );
  const avgFriction = recentDeltas.length
    ? recentDeltas.reduce((s, r) => s + (r.friction || 0), 0) / recentDeltas.length
    : 0;

  // Active modules from project_registry
  const modules = jaaDB.query('project_registry', () => true, 50).map(m => ({
    name:       m.name,
    status:     m.status,
    lastSeenAt: m.lastSeenAt,
    port:       m.port,
  }));

  // Recent failures
  const recentFailures = jaaDB.query('failures',
    r => r.ts && r.ts > Date.now() - 300_000, 20
  ).map(f => ({ source: f.source, error: (f.error || '').slice(0, 120), ts: f.ts }));

  // CFR field state
  let cfrState = {};
  try {
    const latest = jaaDB.query('sigma_records', () => true, 1);
    cfrState = latest[0]?.cfrState || {};
  } catch (_) {}

  return {
    capturedAt:    Date.now(),
    uptimeMs:      process.uptime() * 1000,
    pid:           process.pid,
    nodeVersion:   process.version,
    platform:      process.platform,
    heap: {
      used:  mem.heapUsed,
      total: mem.heapTotal,
      rss:   mem.rss,
    },
    openGaps: {
      total:    openGaps.length,
      high:     openGaps.filter(g => g.severity === 'high').length,
      medium:   openGaps.filter(g => g.severity === 'medium').length,
      topTypes: _topN(openGaps.map(g => g.type || 'unknown'), 5),
    },
    avgFriction:    +avgFriction.toFixed(3),
    modules,
    recentFailures,
    cfrState,
  };
}

function _topN(arr, n) {
  const freq = {};
  for (const x of arr) freq[x] = (freq[x] || 0) + 1;
  return Object.entries(freq).sort(([,a],[,b]) => b - a).slice(0, n).map(([k, v]) => ({ k, v }));
}

// ── Blackbox event capture ────────────────────────────────────────────────────
// Grabs event_log rows from [now - preMs] compressed to a zlib buffer.
// Returns base64-encoded deflated JSON — decompressible with:
//   zlib.inflateSync(Buffer.from(b64, 'base64')).toString()

function _captureBlackbox(opts = {}) {
  const now       = Date.now();
  const fromTs    = opts.fromTs || (now - BLACKBOX_PRE_MS);
  const toTs      = opts.toTs   || now;
  const label     = opts.label  || 'pre';

  const events = jaaDB.query('event_log',
    r => r.ts && r.ts >= fromTs && r.ts <= toTs,
    5000
  );

  const sigmaRows = jaaDB.query('sigma_records',
    r => r.ts && r.ts >= fromTs && r.ts <= toTs,
    1000
  );

  const payload = {
    format:       'NEXUS-BLACKBOX/1.0',
    label,
    fromTs,
    toTs,
    capturedAt:   now,
    eventCount:   events.length,
    sigmaCount:   sigmaRows.length,
    events:       events.map(e => ({
      ts:     e.ts,
      type:   e.type,
      source: e.source,
      // Only include payload summary to keep size manageable
      payloadKeys: e.payload ? Object.keys(e.payload) : [],
      sigma:  e.sigma?.score,
    })),
    sigmaTimeline: sigmaRows.map(r => ({
      ts:      r.ts,
      score:   r.score,
      eventType: r.eventType,
      reason:  r.reason,
    })),
  };

  try {
    const json   = JSON.stringify(payload);
    const buf    = zlib.deflateSync(json, { level: 9 });
    return {
      encoding:    'deflate/base64',
      sizeRaw:     json.length,
      sizeComp:    buf.length,
      ratio:       +(json.length / Math.max(1, buf.length)).toFixed(1),
      fromTs,
      toTs,
      eventCount:  events.length,
      data:        buf.toString('base64'),
    };
  } catch (e) {
    return { encoding: 'none', error: e.message, eventCount: events.length };
  }
}

// ── Decompression helper (used by UI / replay engine) ─────────────────────────
function decompressBlackbox(blackboxField) {
  if (!blackboxField?.data) return null;
  const buf = Buffer.from(blackboxField.data, 'base64');
  return JSON.parse(zlib.inflateSync(buf).toString());
}

// ── Divergence detection ──────────────────────────────────────────────────────

function _detectDivergence() {
  const now = Date.now();

  // Read last 3 sigma records to detect both absolute threshold and spike
  const recent = jaaDB.query('sigma_records',
    r => r.ts && r.ts > now - POLL_MS * 3,
    10
  ).sort((a, b) => b.ts - a.ts);

  if (!recent.length) return null;

  const latest = recent[0];
  const score  = latest.score || 0;
  const prev   = recent[1]?.score || _lastSigmaScore;

  const aboveThreshold = score >= SIGMA_THRESHOLD;
  const spiked         = (score - prev) >= SIGMA_SPIKE_DELTA;

  _lastSigmaScore = score;

  if (!aboveThreshold && !spiked) return null;

  return {
    score,
    prev,
    delta:    +(score - prev).toFixed(3),
    reason:   aboveThreshold
      ? `sigma ${score.toFixed(3)} >= threshold ${SIGMA_THRESHOLD}`
      : `sigma spike +${(score - prev).toFixed(3)} (${prev.toFixed(3)} → ${score.toFixed(3)})`,
    eventType:  latest.eventType,
    cfrAxes:    latest.axes,
    cfrReason:  latest.reason,
    sigmaRecord: latest,
  };
}

// ── Snapshot on divergence ─────────────────────────────────────────────────────

async function _onDivergence(div) {
  const now = Date.now();

  // Enforce cooldown
  if (now - _lastSnapshotTs < COOLDOWN_MS) {
    const remaining = Math.round((COOLDOWN_MS - (now - _lastSnapshotTs)) / 1000);
    // Still log the divergence — just don't snapshot again yet
    jaaDB.insert('event_log', {
      uuid: uid(), type: 'divergence.suppressed',
      payload: {
        sigma:     div.score,
        reason:    div.reason,
        cooldownRemainingSec: remaining,
      },
      source: MODULE_ID, ts: now,
    });
    return;
  }

  _lastSnapshotTs = now;

  // 1. Capture system state first (synchronous, instant)
  const systemState = _captureSystemState();

  // 2. Capture pre-divergence blackbox (10 min window ending now)
  const blackboxPre = _captureBlackbox({
    fromTs: now - BLACKBOX_PRE_MS,
    toTs:   now,
    label:  'pre_divergence',
  });

  // 3. Create the .nex snapshot with extended fields
  const snap = require('./index');
  const result = snap.create({
    type:    'divergence',
    message: `auto:divergence — sigma ${div.score.toFixed(3)} (${div.reason})`,
    trigger: div.eventType || 'sigma_threshold',
    // Extra fields injected into the .nex
    _extra: {
      divergence_context: {
        sigma:        div.score,
        sigmaDelta:   div.delta,
        prevSigma:    div.prev,
        reason:       div.reason,
        eventType:    div.eventType,
        cfrAxes:      div.cfrAxes,
        cfrReason:    div.cfrReason,
        detectedAt:   now,
      },
      system_state: systemState,
      blackbox_pre: blackboxPre,
      // blackbox_post filled in 30s by _pendingPostCaptures
      resume: {
        // Enough context for the UI/orchestrator to resume from this point
        channel:    _cfg.currentChannel || 'NEXUS',
        openGapIds: jaaDB.query('gaps', r => r.status === 'open', 50).map(g => g.uuid),
        modules:    systemState.modules,
        cfrState:   systemState.cfrState,
        friction:   systemState.avgFriction,
      },
      // macro compiled async by intelligence module — written back once ready
      macro: null,
    },
  });

  // 4. Schedule post-divergence blackbox capture (+30s)
  _pendingPostCaptures.push({
    snapId:    result.snapId,
    captureAt: now + BLACKBOX_POST_MS,
    fromTs:    now,
  });

  // 5. Log the divergence event
  jaaDB.insert('event_log', {
    uuid: uid(), type: 'divergence.snapshot',
    payload: {
      snapId:       result.snapId,
      sigma:        div.score,
      sigmaDelta:   div.delta,
      reason:       div.reason,
      blackboxPre:  { eventCount: blackboxPre.eventCount, sizeComp: blackboxPre.sizeComp },
      cooldownMs:   COOLDOWN_MS,
    },
    source: MODULE_ID, ts: now,
  });

  console.log(`[${MODULE_ID}] divergence snapshot ${result.snapId} — σ=${div.score.toFixed(3)} (${div.reason})`);

  // 6. Async: request macro compilation from intelligence module (fire-and-forget)
  _compileMacroAsync(result.snapId, div, now).catch(() => {});
}

// ── Post-divergence blackbox (30s after) ─────────────────────────────────────

function _flushPostCaptures() {
  const now = Date.now();
  const due = _pendingPostCaptures.filter(p => now >= p.captureAt);
  _pendingPostCaptures = _pendingPostCaptures.filter(p => now < p.captureAt);

  for (const pending of due) {
    try {
      const blackboxPost = _captureBlackbox({
        fromTs: pending.fromTs,
        toTs:   now,
        label:  'post_divergence',
      });

      // Patch the .nex file on disk with the post capture
      const snap   = require('./index');
      const record = jaaDB.query('backup_records', r => r.snapId === pending.snapId, 1)[0];
      if (!record?.snapPath) continue;

      const fs   = require('fs');
      const path = require('path');
      const nex  = JSON.parse(fs.readFileSync(record.snapPath, 'utf8'));
      nex.blackbox_post = blackboxPost;
      nex.blackbox_post_capturedAt = now;
      fs.writeFileSync(record.snapPath, JSON.stringify(nex), 'utf8');

      jaaDB.insert('event_log', {
        uuid: uid(), type: 'divergence.blackbox_post',
        payload: {
          snapId:    pending.snapId,
          eventCount: blackboxPost.eventCount,
          sizeComp:  blackboxPost.sizeComp,
        },
        source: MODULE_ID, ts: now,
      });

      console.log(`[${MODULE_ID}] post-blackbox written to ${pending.snapId} (${blackboxPost.eventCount} events)`);
    } catch (e) {
      console.warn(`[${MODULE_ID}] post-capture failed for ${pending.snapId}: ${e.message}`);
    }
  }
}

// ── Macro compilation (async, via intelligence pattern engine) ────────────────

async function _compileMacroAsync(snapId, div, divergeTs) {
  try {
    // Give intelligence engine a moment to process the event before we query patterns
    await new Promise(r => setTimeout(r, 3000));

    const macroCompiler = require('../intelligence/macro-compiler');
    const macro = await macroCompiler.compile({
      divergeTs,
      sigma:     div.score,
      eventType: div.eventType,
      reason:    div.reason,
    });

    // Patch the macro into the .nex file
    const record = jaaDB.query('backup_records', r => r.snapId === snapId, 1)[0];
    if (!record?.snapPath) return;

    const fs  = require('fs');
    const nex = JSON.parse(fs.readFileSync(record.snapPath, 'utf8'));
    nex.macro = macro;
    nex.macro_compiled_at = Date.now();
    fs.writeFileSync(record.snapPath, JSON.stringify(nex), 'utf8');

    jaaDB.insert('event_log', {
      uuid: uid(), type: 'divergence.macro_compiled',
      payload: {
        snapId,
        causeChainLength: macro.causeChain?.length || 0,
        patterns:         macro.patterns?.length || 0,
        windowDays:       macro.windowDays,
      },
      source: MODULE_ID, ts: Date.now(),
    });

    console.log(`[${MODULE_ID}] macro compiled for ${snapId} — ${macro.causeChain?.length || 0} links, ${macro.patterns?.length || 0} patterns`);
  } catch (e) {
    console.warn(`[${MODULE_ID}] macro compile failed for ${snapId}: ${e.message}`);
  }
}

// ── Poll loop ─────────────────────────────────────────────────────────────────

async function _tick() {
  try {
    // Check for post-divergence captures due
    _flushPostCaptures();

    // Detect divergence
    const div = _detectDivergence();
    if (div) {
      await _onDivergence(div);
    }
  } catch (e) {
    console.warn(`[${MODULE_ID}] tick error: ${e.message}`);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

function init(cfg = {}) {
  _cfg = cfg;
  _interval = setInterval(_tick, cfg.pollMs ?? POLL_MS);
  _interval.unref();

  console.log(`[${MODULE_ID}] v${VERSION} — sigma threshold: ${SIGMA_THRESHOLD}, cooldown: ${COOLDOWN_MS / 1000}s`);
}

function stop() {
  if (_interval) { clearInterval(_interval); _interval = null; }
}

function status() {
  return {
    lastSnapshotTs:  _lastSnapshotTs,
    lastSigmaScore:  _lastSigmaScore,
    pendingPostCount: _pendingPostCaptures.length,
    cooldownMs:       COOLDOWN_MS,
    sigmaThreshold:   SIGMA_THRESHOLD,
    cooldownRemainingSec: Math.max(0, Math.round((COOLDOWN_MS - (Date.now() - _lastSnapshotTs)) / 1000)),
  };
}

module.exports = {
  init, stop, status,
  decompressBlackbox,
  MODULE_ID, VERSION,
  SIGMA_THRESHOLD, COOLDOWN_MS,
};
