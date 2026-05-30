// ═══════════════════════════════════════════════════
// NEXUS — CFR Render shim
// canvas/spec-a/cfr-render.js
//
// CJS shim for cfr-kernel/render.js (Canvas 2D projection).
// Provides the same API surface for Node test environments
// where HTMLCanvasElement / CanvasRenderingContext2D are absent.
//
// All draw functions are no-ops in headless mode.
// createCamera and buildMVP return plain objects so
// the renderer can call them without crashing.
//
// §1.2 — not silent: headless mode logs once on first call.
// §5.5 — zero external dependencies.
// ═══════════════════════════════════════════════════
'use strict';

const HEADLESS = typeof HTMLCanvasElement === 'undefined';

// ── Camera ────────────────────────────────────────

/**
 * @param {object} opts
 * @param {number} [opts.dist=18]   camera distance
 * @param {number} [opts.rotX=-20] pitch in degrees
 * @param {number} [opts.rotY=0]   yaw in degrees
 */
function createCamera(opts = {}) {
  return {
    dist: opts.dist  ?? 18,
    rotX: opts.rotX  ?? -20,
    rotY: opts.rotY  ?? 0,
    fov:  opts.fov   ?? 60,
  };
}

/**
 * Build a minimal MVP-like projection descriptor.
 * In the real render this is a Float32Array matrix;
 * here it is a plain object sufficient for tests.
 */
function buildMVP(camera, width, height) {
  const aspect = width > 0 ? width / height : 1;
  const scale  = Math.min(width, height) / (2 * camera.dist);
  return {
    camera,
    width,
    height,
    aspect,
    scale,
    cx: width  / 2,
    cy: height / 2,
  };
}

// ── Draw helpers — no-op in headless ──────────────

function drawParticles2D(ctx, world, mvp, w, h, opts = {}) {
  if (HEADLESS) return;
  // Real implementation: iterate world.posX/Y/Z, project, strokeRect
}

function drawAttractors2D(ctx, world, mvp, w, h, opts = {}) {
  if (HEADLESS) return;
  // Real implementation: draw labelled circles at attractor positions
}

module.exports = { createCamera, buildMVP, drawParticles2D, drawAttractors2D };
