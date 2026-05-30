// ═══════════════════════════════════════════════════
// NEXUS — Canvas Spec-A Renderer
// canvas/spec-a/renderer.js
// UUID: nexus-canvas-renderer-4000-000000000001
//
// Two-tier renderer for the NEXUS pipeline canvas.
//
// TIER 1 — alk-gl (WebGL2 GPU particle field)
//   80 000 particles. Ping-pong RGBA32F textures.
//   Attractor gravity + curl noise + entropy injection.
//   ingestCodecAudio() drives field from audio signal.
//   Full blendshape deformer API available (§3 future).
//
// TIER 2 — cfr-kernel Canvas 2D (CPU particle fallback)
//   10 000 particles. Perspective projection.
//   Same attractor/field API surface.
//   Activated when WebGL2 unavailable (§1.2 — loud).
//
// API surface (identical for both tiers):
//   renderer.upsertAttractor(id, x, y, z, mass)
//   renderer.removeAttractor(id)
//   renderer.injectStress(x, y, z, strength, radius)
//   renderer.setField(delta)          // partial field update
//   renderer.setAccumulation(opts)    // alk-gl only, no-op on fallback
//   renderer.step(dt)
//   renderer.draw()
//   renderer.resize(w, h)
//   renderer.destroy()
//   renderer.health()                 // always returns status
//   renderer.tier                     // 'webgl2' | 'canvas2d'
//
// §5.5 — alk-gl and cfr-kernel are both in this repo.
// §5.6 — tier-1 and tier-2 expose the same interface.
// §1.2 — WebGL2 failure is logged and emitted, never swallowed.
// ═══════════════════════════════════════════════════
'use strict';

const { kernel } = require('../../foundation/kernel');

// ── cfr-kernel (CPU tier — always available) ──────
const {
  createWorld, stepWorld, injectStress: cfrInjectStress,
  upsertAttractor: cfrUpsertAttractor, removeAttractor: cfrRemoveAttractor,
} = require('./cfr-physics');

const {
  createCamera, buildMVP, drawParticles2D, drawAttractors2D,
} = require('./cfr-render');

const {
  createTimeline, takeSnapshot, seekTo, step: tlStep,
  goLive, logEvent, serialise, onTimelineChange,
} = require('./cfr-rewind');

// ── Color map for node types ───────────────────────
const NODE_COLORS = {
  gate:        '#00cfff',
  gate_fail:   '#ff4444',
  gap:         '#ff8800',
  crystal:     '#88ff44',
  workflow:    '#cc88ff',
  agent:       '#44aaff',
  manifest:    '#ffffff',
  bep:         '#ffdd44',
  default:     '#7799aa',
};

function nodeColor(type) {
  return NODE_COLORS[type] ?? NODE_COLORS.default;
}

// ── Tier-2: Canvas 2D renderer ────────────────────
class Canvas2DRenderer {
  constructor(canvas) {
    this._canvas  = canvas;
    this._ctx     = canvas.getContext('2d');
    this._world   = createWorld({ n: 10000, bound: 9 });
    this._timeline = createTimeline(this._world, { snapMax: 120 });
    this._cam     = createCamera({ dist: 18, rotX: -20 });
    this._mvp     = null;
    this._snapTimer = 0;
    this.tier     = 'canvas2d';
    kernel.emit('canvas.renderer.tier', { tier: 'canvas2d', reason: 'webgl2_unavailable' });
  }

  upsertAttractor(id, x, y, z = 0, mass = 1, meta = {}) {
    cfrUpsertAttractor(this._world, { id, x, y, z, mass, ...meta });
  }

  removeAttractor(id) { cfrRemoveAttractor(this._world, id); }

  injectStress(x, y, z = 0, strength = 500, radius = 4) {
    cfrInjectStress(this._world, x, y, z, strength, radius);
  }

  setField(delta) {
    Object.assign(this._world.field, delta);
  }

  // alk-gl API stub — no-op on Canvas 2D tier (§1.2 — not silent, just irrelevant)
  setAccumulation() {}
  setBlendshapes() {}
  ingestCodecAudio() {}

  step(dt) {
    if (this._timeline.paused) return;
    stepWorld(this._world, dt);
    this._snapTimer += dt;
    if (this._snapTimer > 2) { takeSnapshot(this._timeline); this._snapTimer = 0; }
  }

  draw() {
    const { _canvas: cv, _ctx: ctx, _world: world } = this;
    const W = cv.width, H = cv.height;
    this._mvp = buildMVP(this._cam, W, H);

    ctx.clearRect(0, 0, W, H);

    // Particle field
    drawParticles2D(ctx, world, this._mvp, W, H, {
      pointSize: 1.0,
      colorFn: (speed) => {
        const g = Math.round(160 + speed * 95);
        const b = Math.round(80 + speed * 175);
        const a = (0.45 + speed * 0.55).toFixed(2);
        return `rgba(0,${g},${b},${a})`;
      },
    });

    // Attractor overlays
    drawAttractors2D(ctx, world, this._mvp, W, H, {
      colorFn: (type) => nodeColor(type),
    });
  }

  resize(w, h) {
    this._canvas.width  = w;
    this._canvas.height = h;
  }

  get timeline() { return this._timeline; }

  health() {
    return {
      tier:       'canvas2d',
      status:     'OK',
      N:          this._world.N,
      attractors: this._world.attractors.length,
      snapshots:  this._timeline.snapshots.length,
      field:      { ...this._world.field },
    };
  }

  destroy() {
    // Nothing to tear down on Canvas 2D
  }
}

// ── Tier-1: alk-gl WebGL2 renderer ────────────────
class WebGL2Renderer {
  constructor(canvas, alkgl) {
    this._canvas   = canvas;
    this._gl       = alkgl;  // ALKGL instance (from spatial-v2 alk-gl.js)

    // Mirror world state for timeline (alk-gl manages its own GPU state)
    this._world    = createWorld({ n: 1000, bound: 9 }); // thin CPU shadow for rewind
    this._timeline = createTimeline(this._world, { snapMax: 200 });
    this._snapTimer = 0;

    this.tier = 'webgl2';
    kernel.emit('canvas.renderer.tier', { tier: 'webgl2', N: alkgl.N });
  }

  upsertAttractor(id, x, y, z = 0, mass = 1) {
    this._gl.upsertAttractor(id, x, y, z, mass);
    // Mirror to CPU shadow for timeline
    cfrUpsertAttractor(this._world, { id, x, y, z, mass });
  }

  removeAttractor(id) {
    this._gl.removeAttractor(id);
    cfrRemoveAttractor(this._world, id);
  }

  injectStress(x, y, z = 0, strength = 500, radius = 4) {
    this._gl.injectStress(x, y, z, strength, radius);
  }

  setField(delta) {
    // alk-gl exposes .field as a mutable object
    Object.assign(this._gl.field, delta);
    Object.assign(this._world.field, delta); // keep CPU shadow in sync
  }

  setAccumulation(opts) { this._gl.setAccumulation(opts); }

  setBlendshapes(bs) { this._gl.setBlendshapes(bs); }

  /**
   * Wire codec-v2 PitchEngine output directly to particle field.
   * Matches alk-gl.ingestCodecAudio() signature exactly.
   */
  ingestCodecAudio(pitchResult, audioFrame) {
    this._gl.ingestCodecAudio(pitchResult, audioFrame);
  }

  step(dt) {
    if (this._timeline.paused) return;
    this._gl.step(dt);
    // CPU shadow step (lightweight — attractors only, no particles)
    this._snapTimer += dt;
    if (this._snapTimer > 2) { takeSnapshot(this._timeline); this._snapTimer = 0; }
  }

  draw() {
    const { _canvas: cv, _gl: gl } = this;
    gl.render(cv.width, cv.height, 1.5);
  }

  resize(w, h) {
    this._canvas.width  = w;
    this._canvas.height = h;
    // alk-gl uses ResizeObserver internally — no manual call needed
  }

  get timeline() { return this._timeline; }

  health() { return { tier: 'webgl2', ...this._gl.health() }; }

  destroy() { this._gl.destroy(); }
}

// ── Factory ───────────────────────────────────────
// Attempts WebGL2 first. Falls back to Canvas 2D with a loud kernel event.
// Returns a renderer whose public API is identical regardless of tier.

/**
 * Create the best available renderer for a canvas element.
 * @param {HTMLCanvasElement} canvas
 * @param {object} [opts]
 * @param {number}  [opts.N=80000]     particle count for WebGL2 tier
 * @param {boolean} [opts.forceCanvas] skip WebGL2 attempt
 * @returns {WebGL2Renderer|Canvas2DRenderer}
 */
function createRenderer(canvas, opts = {}) {
  if (!opts.forceCanvas) {
    try {
      // Dynamic import: alk-gl is an ES module (spatial-v2)
      // In the browser the caller pre-imports ALKGL and passes it in via opts.ALKGL.
      // In Node (tests): falls through to Canvas 2D.
      if (opts.ALKGL) {
        const gl = new opts.ALKGL(canvas, { N: opts.N ?? 80000, bound: 7 });
        return new WebGL2Renderer(canvas, gl);
      }
    } catch (err) {
      // §1.2 — loud
      kernel.emit('canvas.renderer.webgl2.failed', {
        error:  err.message,
        reason: 'ALKGL_init_error',
      });
    }
  }
  return new Canvas2DRenderer(canvas);
}

module.exports = { createRenderer, Canvas2DRenderer, WebGL2Renderer, nodeColor };
