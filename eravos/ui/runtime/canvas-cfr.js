/* ═══════════════════════════════════════════════════════════
   ERAVOS CANVAS CFR  v1.0.0
   runtime/canvas-cfr.js

   Constraint Field Runtime canvas layer.
   Wraps ALK-GL particle field engine.
   Wires ERAVOS kernel bus events → field physics.

   MOD LIFECYCLE → ATTRACTORS:
     canvas:mod-spawned  → upsertAttractor(instanceId, x, y)
     canvas:window-closed     → removeAttractor(instanceId)
     canvas:window-moved      → upsertAttractor (update position)

   AUDIO → FIELD:
     analyser RMS              → field.structure
     dominant frequency band   → field.entropy / field.curl
     beat detected             → injectStress at attractor

   KERNEL FAULTS → TURBULENCE:
     kernel:fault              → entropy spike + stress inject

   The field shows the system. Calm system = laminar flow.
   Many active mods = structured attractors.
   Faults = turbulence.
   ═══════════════════════════════════════════════════════════ */

window.CanvasCFR = (() => {
'use strict';

let _engine     = null;   /* ALKGL instance */
let _canvas     = null;   /* WebGL canvas element */
let _rafId      = null;
let _running    = false;
let _analyser   = null;
let _fftData    = null;

/* World coordinate system: canvas pixels → world units
   ALK-GL default bound=6 means world is [-6,6] x [-6,6]
   We map canvas pixels to that space.                    */
const BOUND = 6;

function _pxToWorld(px, py, canvasW, canvasH) {
  return [
    ((px / canvasW) - 0.5) * BOUND * 2,
    (0.5 - (py / canvasH)) * BOUND * 2,
  ];
}

/* ── Boot ───────────────────────────────────────────────── */
function boot(hostEl) {
  if (_engine) return; /* already running */

  /* Create WebGL canvas filling the host */
  _canvas = document.createElement('canvas');
  _canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0;';
  hostEl.insertBefore(_canvas, hostEl.firstChild);

  /* Remove dot-grid background */
  hostEl.style.backgroundImage = 'none';
  hostEl.style.backgroundColor = '#010308';

  try {
    _engine = new ALKGL(_canvas, {
      N:      12000,   /* 12k particles — works on integrated GPU */
      bound:  BOUND,
      boundZ: 4,
    });

    /* Set initial field state — dark, slow, ready */
    _engine.field.entropy   = 0.08;
    _engine.field.structure = 0.65;
    _engine.field.curl      = 0.3;
    _engine.field.damping   = 0.18;
    _engine.field.vmax      = 0.12;

    _running = true;
    _loop();

    console.log('[CFR] particle field active');
  } catch(e) {
    console.warn('[CFR] WebGL2 unavailable, keeping dot-grid:', e.message);
    if (_canvas) { _canvas.remove(); _canvas = null; }
    /* Restore dot-grid */
    hostEl.style.backgroundImage = 'radial-gradient(circle,rgba(42,60,88,.42) 1px,transparent 1px)';
    hostEl.style.backgroundSize  = '24px 24px';
  }
}

/* ── Render loop ────────────────────────────────────────── */
function _loop() {
  if (!_running || !_engine) return;
  _rafId = requestAnimationFrame(_loop);

  /* Audio-driven field update */
  if (_analyser && _fftData) {
    _analyser.getByteFrequencyData(_fftData);

    /* RMS → structure */
    let rms = 0;
    for (let i = 0; i < _fftData.length; i++) rms += (_fftData[i]/255) ** 2;
    rms = Math.sqrt(rms / _fftData.length);

    /* Sub bass energy (bins 0-3) → entropy */
    let subEnergy = 0;
    for (let i = 0; i < 4; i++) subEnergy += _fftData[i] / 255;
    subEnergy /= 4;

    /* High frequency (upper third) → curl */
    let hiEnergy = 0;
    const hiStart = Math.floor(_fftData.length * 0.66);
    for (let i = hiStart; i < _fftData.length; i++) hiEnergy += _fftData[i] / 255;
    hiEnergy /= (_fftData.length - hiStart);

    /* Smooth field towards audio state */
    const EMA = 0.06;
    _engine.field.structure = _engine.field.structure * (1-EMA) + (0.4 + rms * 0.5) * EMA;
    _engine.field.entropy   = _engine.field.entropy   * (1-EMA) + (0.05 + subEnergy * 0.4) * EMA;
    _engine.field.curl      = _engine.field.curl      * (1-EMA) + (0.2 + hiEnergy * 0.5) * EMA;
  }

  _engine.step(1/60);
}

/* ── Analyser hookup ────────────────────────────────────── */
function connectAnalyser(analyserNode) {
  _analyser = analyserNode;
  _fftData  = new Uint8Array(analyserNode.frequencyBinCount);
}

/* ── Mod → attractor bridge ───────────────────────── */
function onSpawn(instanceId, x, y, accent) {
  if (!_engine || !_canvas) return;
  const W = _canvas.offsetWidth  || 1;
  const H = _canvas.offsetHeight || 1;
  const [wx, wy] = _pxToWorld(x, y, W, H);

  /* Mass based on mod type (larger mods = stronger attractors) */
  const mass = 0.8 + Math.random() * 0.4;
  _engine.upsertAttractor(instanceId, wx, wy, 0, mass);
}

function onMove(instanceId, x, y) {
  if (!_engine || !_canvas) return;
  const W = _canvas.offsetWidth  || 1;
  const H = _canvas.offsetHeight || 1;
  const [wx, wy] = _pxToWorld(x, y, W, H);
  _engine.upsertAttractor(instanceId, wx, wy, 0, 1.0);
}

function onClose(instanceId) {
  if (!_engine) return;
  _engine.removeAttractor(instanceId);
  /* Inject turbulence where the mod was */
  _engine.injectStress(
    (Math.random() - 0.5) * BOUND,
    (Math.random() - 0.5) * BOUND,
    0, 200, 3
  );
}

function onFault() {
  if (!_engine) return;
  /* Faults create turbulence at a random attractor position */
  _engine.field.entropy = Math.min(0.85, _engine.field.entropy + 0.12);
  _engine.injectStress(
    (Math.random() - 0.5) * BOUND * 1.5,
    (Math.random() - 0.5) * BOUND * 1.5,
    0, 400, 5
  );
}

function setFieldPreset(preset) {
  if (!_engine) return;
  const presets = {
    calm:    { entropy:.04, structure:.75, curl:.2,  damping:.25, vmax:.08 },
    active:  { entropy:.18, structure:.65, curl:.45, damping:.12, vmax:.16 },
    chaos:   { entropy:.55, structure:.35, curl:.7,  damping:.05, vmax:.28 },
    tranki:  { entropy:.22, structure:.58, curl:.52, damping:.10, vmax:.18 },
    drop:    { entropy:.72, structure:.20, curl:.80, damping:.02, vmax:.35 },
  };
  const p = presets[preset];
  if (p) Object.assign(_engine.field, p);
}

function stop() {
  _running = false;
  cancelAnimationFrame(_rafId);
  if (_engine) { /* no dispose method in ALKGL, just stop loop */ }
}

return { boot, stop, onSpawn, onMove, onClose, onFault, connectAnalyser, setFieldPreset };
})();
