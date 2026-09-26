/* ═══════════════════════════════════════════════════════════
   CANVAS INTELLIGENCE  v1.0.0
   ui/eravos/runtime/canvas-intelligence.js

   Intelligence system → ALK-GL particle field driver.
   Follows canvas-cfr.js pattern exactly — same boot(), same
   _rafLoop(), same ALK-GL integration. Different data source:
   CFR field + Nerve snapshot + intelligence events instead of audio.

   DATA SOURCES (sovereign consumer per §5.7 — no direct imports):
     GET /api/guardian/nerve/snapshot  → nodes, field, stresses
     org:state_sync bus events         → per-system health for mass
     NEXUS_CANVAS_EVENTS global        → simulation results, gaps, sigma

   FIELD MAPPING:
     field.entropy   ← cfr.entropy       (disorder)
     field.structure ← cfr.coherence     (alignment)
     field.curl      ← cfr.friction      (turbulence)
     field.damping   ← 1 - cfr.resonance (decay rate)

   ATTRACTOR MAPPING:
     one attractor per sovereign system
     mass = (1 - sigma) × BASE_MASS

   BLENDSHAPE MAPPING (face — intelligence states):
     jawOpen    ← generation pulse (tokens/s)
     blinkL/R   ← thought boundary (start/end of response)
     browIU     ← concern (sigma 0.3→0.6, open gaps)
     browDL/R   ← concentration (analysis/mastermind mode)
     squintL/R  ← deep analysis, uncertainty
     wideL/R    ← novel input, structural deviation (RFR2 C-field)
     smileL/R   ← positive outcome (gap closed, dispatch succeeded)
     frownL/R   ← fault (CONSTITUTIONAL/INTEGRITY, halt threshold)
     sneerL/R   ← contradiction (CFR friction between two systems)
     cheekPuff  ← high confidence (intuition > 0.85, clean simulation)
     gazeL/R    ← attention target (query surface current subject)
   ═══════════════════════════════════════════════════════════ */

window.CanvasIntelligence = (() => {
'use strict';

// ── Config ─────────────────────────────────────────────────────────────────────
const POLL_MS      = 2000;
const BASE_MASS    = 1.2;
const EMA_FAST     = 0.25;   // gaze, jawOpen pulses — 50ms feel
const EMA_MED      = 0.08;   // squint, brow — 200ms feel
const EMA_SLOW     = 0.03;   // smile, frown, concern — 500ms feel
const ORCH         = (window.__NEXUS_ORCH__ || 'http://127.0.0.1:9000');

// spoke layout — world space [-6,6]² — matches Nerve canvas positions
const SYSTEM_POSITIONS = {
  orchestrator: [ 0.00,  5.2],
  guardian:     [ 4.95,  2.85],
  cortex:       [ 4.95, -2.85],
  copilot:      [ 0.00, -5.2],
  idearium:     [-4.95, -2.85],
  emerge:       [-4.95,  2.85],
  ollama:       [ 2.4,   0.0],
  eravos:       [-2.4,   0.0],
  bridge:       [ 0.00,  0.0],
  architect:    [ 0.00,  2.8],
};

// ── State ───────────────────────────────────────────────────────────────────────
let _engine    = null;
let _canvas    = null;
let _running   = false;
let _rafId     = null;

// CFR field shadow (updated from Nerve snapshot)
let _field = { coherence:0.8, friction:0.2, resonance:0.6, entropy:0.15,
               regime:'stable', sigma:0.05 };

// Per-system health { [systemId]: { sigma:0, online:true, latencyMs:0 } }
let _health = {};

// EMA-smoothed blendshape values — current display values
let _bs = {
  jawOpen:0, blinkL:0, blinkR:0,
  browIU:0, browDL:0, browDR:0,
  squintL:0, squintR:0,
  wideL:0, wideR:0,
  smileL:0, smileR:0,
  frownL:0, frownR:0,
  sneerL:0, sneerR:0,
  cheekPuff:0,
};

// Blendshape targets — what we're animating toward
let _bsTarget = { ..._bs };

// Gaze target — system id or null (forward)
let _gazeTarget  = null;
let _gazeVec     = { L:[0,0], R:[0,0], str:0.15 };

// Intelligence mode from events
let _mode = 'idle'; // idle | generating | thinking | analyzing | mastermind | fault
let _activeFault = null;

// Generation rhythm state
let _genPhase = 0;
let _genRate  = 0; // tokens/s normalized

// Scheduled one-shot events (blinks, cheek pulses)
let _oneshots  = []; // { bs: string, value: number, durationMs: number, startMs: number }

// Sigma per-system from last snapshot (needed for mass computation)
let _systemSigma = {};

// ── Helper — EMA step ──────────────────────────────────────────────────────────
function _ema(current, target, alpha) {
  return current + (target - current) * alpha;
}

// ── Fetch Nerve snapshot ───────────────────────────────────────────────────────
async function _pollSnapshot() {
  try {
    const d = await fetch(`${ORCH}/api/guardian/nerve/snapshot`, {
      signal: AbortSignal.timeout(3000),
    }).then(r => r.ok ? r.json() : null).catch(() => null);
    if (!d?.ok) return;

    // Update field from first node's health (global field in Phase 1)
    if (d.nodes?.[0]?.health) {
      const h = d.nodes[0].health;
      _field.coherence = h.coherence ?? _field.coherence;
      _field.friction  = h.friction  ?? _field.friction;
      _field.resonance = h.resonance ?? _field.resonance;
      _field.entropy   = h.entropy   ?? _field.entropy;
      _field.regime    = h.regime    || _field.regime;
    }

    // Update per-system sigma from node presence
    for (const node of (d.nodes || [])) {
      if (!node.id) continue;
      _systemSigma[node.id] = node.health?.sigma ?? 0;
    }

    // Ingest stresses from nerve (sigma spikes already classified there)
    for (const stress of (d.stresses || [])) {
      const pos = SYSTEM_POSITIONS[stress.source] || [0, 0];
      const strength = (stress.strength ?? 200);
      _engine.injectStress(pos[0], pos[1], 0, strength, 3 + strength / 200);
    }

    _updateAttractors();
    _updateFieldUniforms();

  } catch (_) {}
}

// ── Attractor mass from health ─────────────────────────────────────────────────
function _updateAttractors() {
  if (!_engine) return;
  for (const [id, [x, y]] of Object.entries(SYSTEM_POSITIONS)) {
    const sigma  = _systemSigma[id] ?? 0;
    const online = _health[id]?.online !== false;
    const mass   = online ? Math.max(0.05, BASE_MASS * (1 - sigma)) : 0.05;
    _engine.upsertAttractor(id, x, y, 0, mass);
  }
}

// ── CFR field → ALK-GL field uniforms ─────────────────────────────────────────
function _updateFieldUniforms() {
  if (!_engine) return;
  // Additive intelligence modulation on top of base field
  // (same pattern as _audioField in ingestCodecAudio)
  _engine.field.entropy   = Math.min(0.95, _field.entropy);
  _engine.field.structure = Math.min(0.95, _field.coherence);
  _engine.field.curl      = Math.min(0.95, _field.friction);
  _engine.field.damping   = Math.max(0.05, Math.min(0.4, 1 - _field.resonance));
}

// ── Gaze computation ───────────────────────────────────────────────────────────
function _updateGaze() {
  if (!_engine) return;
  if (_gazeTarget && SYSTEM_POSITIONS[_gazeTarget]) {
    const [tx, ty] = SYSTEM_POSITIONS[_gazeTarget];
    // Normalize direction from face center [0,0] toward target
    const len = Math.sqrt(tx*tx + ty*ty) || 1;
    const gx  = tx / len * 0.8;
    const gy  = ty / len * 0.8;
    _gazeVec.L = [_gazeVec.L[0] + (gx - _gazeVec.L[0]) * EMA_FAST,
                  _gazeVec.L[1] + (gy - _gazeVec.L[1]) * EMA_FAST];
    _gazeVec.R = [..._gazeVec.L];
    _gazeVec.str = _gazeVec.str + (0.75 - _gazeVec.str) * EMA_FAST;
  } else {
    // No target — ambient forward gaze, gentle drift
    _gazeVec.L[0] *= 0.97;
    _gazeVec.L[1] *= 0.97;
    _gazeVec.R[0] *= 0.97;
    _gazeVec.R[1] *= 0.97;
    _gazeVec.str   = _gazeVec.str + (0.15 - _gazeVec.str) * EMA_MED;
  }
  _engine.setGaze(_gazeVec.L, _gazeVec.R, _gazeVec.str);
}

// ── Blendshape target computation from current mode ────────────────────────────
function _computeTargets(nowMs) {
  const sigma = _field.sigma || 0;
  const t     = { ..._bsTarget }; // start from current targets

  // Clear all to zero then set what applies — prevents stale additive drift
  for (const k of Object.keys(t)) t[k] = 0;

  // ── Jaw — generation rhythm ──────────────────────────────────────────────────
  if (_mode === 'generating') {
    _genPhase += 0.08 * (0.5 + _genRate);
    t.jawOpen = 0.25 + 0.45 * Math.abs(Math.sin(_genPhase));
  }

  // ── Mode-specific blendshape sets ────────────────────────────────────────────
  switch (_mode) {
    case 'thinking':
      t.squintL = 0.5; t.squintR = 0.5;
      t.browDL  = 0.4; t.browDR  = 0.4;
      break;

    case 'analyzing':
      t.squintL = 0.7; t.squintR = 0.7;
      t.browDL  = 0.35; t.browDR  = 0.35;
      t.browIU  = 0.2;
      break;

    case 'mastermind':
      t.squintL = 0.8; t.squintR = 0.8;
      t.browDL  = 0.6; t.browDR  = 0.6;
      t.browIU  = 0.2;
      // gaze scanning handled separately
      break;

    case 'confident':
      t.browDL  = 0.1; t.browDR  = 0.1;
      break;

    case 'uncertain':
      t.squintL = 0.7; t.squintR = 0.7;
      t.browDL  = 0.35; t.browDR  = 0.35;
      t.browIU  = 0.5;
      if (_mode === 'generating') {
        t.jawOpen = 0.1 + 0.15 * Math.abs(Math.sin(_genPhase * 0.4)); // hesitant
      }
      break;

    case 'fault':
      t.jawOpen  = 0; // stops talking
      t.frownL   = _activeFault === 'CONSTITUTIONAL' ? 1.0 : 0.8;
      t.frownR   = _activeFault === 'CONSTITUTIONAL' ? 1.0 : 0.8;
      t.browIU   = 0.7;
      if (_activeFault === 'INTEGRITY') {
        t.sneerL = 0.3; t.sneerR = 0.3;
      }
      break;

    case 'idle':
    default:
      // All zeros — ambient gaze carries it
      break;
  }

  // ── Sigma-driven concern (additive, mode-independent) ─────────────────────────
  if (sigma > 0.3 && _mode !== 'fault') {
    const concern = Math.min(0.7, (sigma - 0.3) * 2.5);
    t.browIU  = Math.max(t.browIU,  concern);
    if (sigma > 0.5) {
      t.frownL = Math.max(t.frownL, (sigma - 0.5) * 1.6);
      t.frownR = Math.max(t.frownR, (sigma - 0.5) * 1.6);
    }
  }

  // ── Friction-driven sneer (CFR friction between systems) ──────────────────────
  if (_field.friction > 0.5 && _mode !== 'fault') {
    const sneer = Math.min(0.6, (_field.friction - 0.5) * 1.6);
    t.sneerL = Math.max(t.sneerL, sneer);
    t.sneerR = Math.max(t.sneerR, sneer);
  }

  // ── One-shot events — applied BEFORE mutual exclusions ───────────────────────
  // §fix: one-shots must not override exclusions. Running them first means
  // the exclusion check below can still clear a conflicting one-shot value.
  for (const ev of _oneshots) {
    const elapsed  = nowMs - ev.startMs;
    const progress = Math.min(1, elapsed / ev.durationMs);
    const envelope = Math.sin(progress * Math.PI);
    t[ev.bs] = Math.max(t[ev.bs] || 0, ev.value * envelope);
  }
  _oneshots = _oneshots.filter(ev => (nowMs - ev.startMs) < ev.durationMs);

  // ── Mutual exclusions — applied last, override everything ─────────────────────
  if (t.smileL > 0.1 || t.smileR > 0.1) {
    t.frownL = 0; t.frownR = 0;
  }
  if (t.frownL > 0.1 || t.frownR > 0.1) {
    t.smileL = 0; t.smileR = 0;
  }
  if (t.wideL > 0.2 || t.wideR > 0.2) {
    t.squintL = 0; t.squintR = 0;
  }

  _bsTarget = t;
}

// ── EMA step blendshapes toward targets ───────────────────────────────────────
function _stepBlendshapes() {
  if (!_engine) return;

  // Determine EMA alpha per blendshape class
  const alphas = {
    jawOpen: EMA_FAST,
    blinkL:  EMA_FAST, blinkR:  EMA_FAST,
    wideL:   EMA_MED,  wideR:   EMA_MED,
    squintL: EMA_MED,  squintR: EMA_MED,
    browDL:  EMA_MED,  browDR:  EMA_MED,
    browIU:  EMA_MED,
    smileL:  EMA_SLOW, smileR:  EMA_SLOW,
    frownL:  EMA_SLOW, frownR:  EMA_SLOW,
    sneerL:  EMA_MED,  sneerR:  EMA_MED,
    cheekPuff: EMA_MED,
  };

  for (const [k, alpha] of Object.entries(alphas)) {
    _bs[k] = _ema(_bs[k], _bsTarget[k] ?? 0, alpha);
  }

  // Push to engine using internal _bs map (same pattern as canvas-cfr)
  if (!_engine._bs) _engine._bs = {};
  _engine._bs.eyeBlinkLeft    = _bs.blinkL;
  _engine._bs.eyeBlinkRight   = _bs.blinkR;
  _engine._bs.eyeWideLeft     = _bs.wideL;
  _engine._bs.eyeWideRight    = _bs.wideR;
  _engine._bs.eyeSquintLeft   = _bs.squintL;
  _engine._bs.eyeSquintRight  = _bs.squintR;
  _engine._bs.browInnerUp     = _bs.browIU;
  _engine._bs.browDownLeft    = _bs.browDL;
  _engine._bs.browDownRight   = _bs.browDR;
  _engine._bs.jawOpen         = _bs.jawOpen;
  _engine._bs.mouthSmileLeft  = _bs.smileL;
  _engine._bs.mouthSmileRight = _bs.smileR;
  _engine._bs.mouthFrownLeft  = _bs.frownL;
  _engine._bs.mouthFrownRight = _bs.frownR;
  _engine._bs.noseSneerLeft   = _bs.sneerL;
  _engine._bs.noseSneerRight  = _bs.sneerR;
  _engine._bs.cheekPuff       = _bs.cheekPuff;
}

// ── One-shot helpers ───────────────────────────────────────────────────────────
function _blink(durationMs = 280) {
  const now = performance.now();
  _oneshots.push({ bs:'blinkL', value:1.0, durationMs, startMs:now });
  _oneshots.push({ bs:'blinkR', value:1.0, durationMs, startMs:now });
}

function _pulseSmile(strength = 0.8, durationMs = 2000) {
  const now = performance.now();
  _oneshots.push({ bs:'smileL', value:strength, durationMs, startMs:now });
  _oneshots.push({ bs:'smileR', value:strength, durationMs, startMs:now });
}

function _pulseCheek(strength = 0.6, durationMs = 700) {
  const now = performance.now();
  _oneshots.push({ bs:'cheekPuff', value:strength, durationMs, startMs:now });
}

// ── Intelligence event handlers ────────────────────────────────────────────────
// Called by the host page or co-pilot bridge via window.NexusIntelligenceEvents

function onGenerationStart(tokensPerSec = 10) {
  _genRate = Math.min(1, tokensPerSec / 30);
  _mode = 'generating';
  _blink(300); // thought-start blink
}

function onGenerationEnd() {
  _bsTarget.jawOpen = 0;
  _blink(280); // thought-end blink
  setTimeout(() => {
    if (_mode === 'generating') _mode = 'idle';
  }, 400);
}

function onThinkingStart() {
  _mode = 'thinking';
  _blink(280);
}

function onAnalysisStart() {
  _mode = 'analyzing';
}

function onMastermindStart() {
  _mode = 'mastermind';
}

function onMastermindEnd() {
  _mode = 'idle';
  _blink(280);
}

function onPositiveOutcome(systemId) {
  _pulseSmile(0.85, 2200);
  if (systemId && SYSTEM_POSITIONS[systemId]) {
    _gazeTarget = systemId;
    setTimeout(() => { if (_gazeTarget === systemId) _gazeTarget = null; }, 1500);
  }
}

function onFault(faultClass, systemId) {
  _activeFault = faultClass;
  _mode = 'fault';
  if (systemId && SYSTEM_POSITIONS[systemId]) {
    _gazeTarget = systemId;
    const [x, y] = SYSTEM_POSITIONS[systemId];
    const strength = faultClass === 'CONSTITUTIONAL' ? 900 :
                     faultClass === 'INTEGRITY'      ? 650 :
                     faultClass === 'CAPABILITY'     ? 350 : 200;
    _engine?.injectStress(x, y, 0, strength, 3.5);
  }
}

function onFaultResolved() {
  _activeFault = null;
  _mode = 'idle';
  _gazeTarget = null;
  _pulseSmile(0.5, 1500);
}

function onHighConfidence(systemId) {
  _mode = 'confident';
  _pulseCheek(0.6, 600);
  if (systemId) _gazeTarget = systemId;
  setTimeout(() => { if (_mode === 'confident') _mode = 'idle'; }, 2000);
}

function onQueryFocus(systemId) {
  _gazeTarget = systemId;
}

function onSigmaUpdate(sigma, systemId) {
  _field.sigma = sigma;
  if (systemId) _systemSigma[systemId] = sigma;
  _updateAttractors();
}

// ── RAF loop ───────────────────────────────────────────────────────────────────
function _rafLoop(nowMs) {
  if (!_running || !_engine) return;
  _computeTargets(nowMs);
  _stepBlendshapes();
  _updateGaze();
  _rafId = requestAnimationFrame(_rafLoop);
}

// ── Boot ───────────────────────────────────────────────────────────────────────
function boot(hostEl) {
  if (_engine) return;

  _canvas = document.createElement('canvas');
  _canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0;';
  hostEl.insertBefore(_canvas, hostEl.firstChild);
  hostEl.style.backgroundColor = '#01020a';
  hostEl.style.backgroundImage = 'none';

  try {
    _engine = new ALKGL(_canvas, { N:192 });
  } catch (e) {
    console.error('[canvas-intelligence] ALK-GL init failed:', e.message);
    return;
  }

  // Initialize attractors
  for (const [id, [x, y]] of Object.entries(SYSTEM_POSITIONS)) {
    _engine.upsertAttractor(id, x, y, 0, BASE_MASS);
  }

  // Base field — calmer than audio default, intelligence data will modulate it
  _engine.field.entropy   = 0.12;
  _engine.field.structure = 0.78;
  _engine.field.curl      = 0.22;
  _engine.field.damping   = 0.14;
  _engine.field.vmax      = 0.14;

  // Subscribe to Eravos organism bus for system health
  if (window.KERNEL?.bus?.subscribe) {
    KERNEL.bus.subscribe('org:state_sync', (data) => {
      if (!data?.key) return;
      _health[data.key] = { online: data.online, latencyMs: data.latencyMs };
      _updateAttractors();
    });
  }

  _running = true;
  _rafId   = requestAnimationFrame(_rafLoop);

  // Start polling Nerve snapshot
  _pollSnapshot();
  setInterval(() => _pollSnapshot().catch(() => {}), POLL_MS);

  console.log('[canvas-intelligence] v1.0.0 — intelligence field active');
}

function pause()  { _running = false; cancelAnimationFrame(_rafId); }
function resume() { if (!_running && _engine) { _running = true; _rafId = requestAnimationFrame(_rafLoop); } }

// ── Public surface ─────────────────────────────────────────────────────────────
return {
  boot, pause, resume,
  // Intelligence event hooks — called by co-pilot bridge or host page
  on: {
    generationStart:  onGenerationStart,
    generationEnd:    onGenerationEnd,
    thinkingStart:    onThinkingStart,
    analysisStart:    onAnalysisStart,
    mastermindStart:  onMastermindStart,
    mastermindEnd:    onMastermindEnd,
    positiveOutcome:  onPositiveOutcome,
    fault:            onFault,
    faultResolved:    onFaultResolved,
    highConfidence:   onHighConfidence,
    queryFocus:       onQueryFocus,
    sigmaUpdate:      onSigmaUpdate,
  },
};

})();
