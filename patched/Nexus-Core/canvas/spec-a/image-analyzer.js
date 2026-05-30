// ═══════════════════════════════════════════════════
// NEXUS — Canvas Spec-A Image Analyzer
// canvas/spec-a/image-analyzer.js
// UUID: nexus-canvas-img-analyzer-4000-000000000001
//
// Codec-v2 pixel pipeline, adapted for static images.
// Applied to Canvas 2D snapshots of manifest node state.
//
// Where codec-v2 runs on video frames, this runs on
// the rendered thumbnail of each pipeline node.
// Pixel analysis output → CFR field parameter deltas:
//
//   luminance      → field.structure  (bright node = high fidelity)
//   motionScore    → field.entropy    (high delta from prior = instability)
//   edgeDensity    → field.curl       (complex node = more turbulence)
//   invariantRatio → field.damping    (stable node = less particle chaos)
//
// Two frames of a node (before/after a gate event) produces
// the delta signal. Single frame = baseline read only.
//
// §1.1 — outputs labeled as signal, not system truth.
// §5.5 — zero external dependencies.
// §5.7 — no DOM access; caller passes ImageData in.
// ═══════════════════════════════════════════════════
'use strict';

// ── Constants ─────────────────────────────────────
const DARK_THRESHOLD      = 60;    // mean luminance below = dark node
const PIXEL_INVARIANT_VAR = 8;     // pixel variance below = invariant
const EDGE_SOBEL_THRESH   = 30;    // Sobel gradient above = edge pixel

// ── Luminance ─────────────────────────────────────
// BT.601 coefficients — matches codec.js _avgLuminance exactly.
function avgLuminance(imageData) {
  const d = imageData.data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) {
    sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  }
  return sum / (d.length / 4);
}

// ── Frame diff ────────────────────────────────────
// codec.js _frameDiff: per-pixel RGB delta, averaged.
// Returns { score: 0-1, delta: [{x,y,r,g,b,diff}] }
function frameDiff(prev, curr) {
  if (!prev || prev.data.length !== curr.data.length) {
    return { score: 0, delta: [] };
  }
  const d1 = prev.data, d2 = curr.data;
  const w   = prev.width;
  let diffSum = 0;
  const total = d1.length / 4;
  const delta = [];

  for (let i = 0; i < d1.length; i += 4) {
    const dr   = Math.abs(d1[i]     - d2[i]);
    const dg   = Math.abs(d1[i + 1] - d2[i + 1]);
    const db   = Math.abs(d1[i + 2] - d2[i + 2]);
    const diff = (dr + dg + db) / 3;
    diffSum   += diff;
    if (diff > 12) {
      const px = (i / 4) % w;
      const py = Math.floor((i / 4) / w);
      delta.push({ x: px, y: py, r: d2[i], g: d2[i + 1], b: d2[i + 2], diff: Math.round(diff) });
    }
  }
  return { score: Math.min(1, (diffSum / total) / 60), delta };
}

// ── Background model update ────────────────────────
// codec.js _updateBgModel: alpha blend stable pixels.
// Returns new bg Uint8ClampedArray.
function updateBgModel(bgModel, frame) {
  const cur = frame.data;
  if (!bgModel) return new Uint8ClampedArray(cur);
  for (let i = 0; i < cur.length; i += 4) {
    bgModel[i]     = Math.round(0.95 * bgModel[i]     + 0.05 * cur[i]);
    bgModel[i + 1] = Math.round(0.95 * bgModel[i + 1] + 0.05 * cur[i + 1]);
    bgModel[i + 2] = Math.round(0.95 * bgModel[i + 2] + 0.05 * cur[i + 2]);
  }
  return bgModel;
}

// ── Invariant mask ────────────────────────────────
// codec.js _computeInvariantMask: pixels where |current - bg| < threshold.
// Returns Uint8Array (1 = invariant, 0 = changing).
function computeInvariantMask(bgModel, frame) {
  if (!bgModel) return null;
  const cur  = frame.data;
  const n    = cur.length / 4;
  const mask = new Uint8Array(n);
  for (let i = 0, j = 0; i < cur.length; i += 4, j++) {
    const dr = Math.abs(bgModel[i]     - cur[i]);
    const dg = Math.abs(bgModel[i + 1] - cur[i + 1]);
    const db = Math.abs(bgModel[i + 2] - cur[i + 2]);
    mask[j]  = ((dr + dg + db) / 3) < PIXEL_INVARIANT_VAR ? 1 : 0;
  }
  return mask;
}

// ── Edge density (Sobel) ──────────────────────────
// Not in codec.js — added here. Measures structural complexity
// of a node snapshot. High edge count → complex/active node → higher curl.
function edgeDensity(imageData) {
  const { data, width: w, height: h } = imageData;
  // Convert to greyscale first
  const grey = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    grey[j] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }

  let edgeCount = 0;
  const total = (w - 2) * (h - 2);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      const gx =
        -grey[idx - w - 1] - 2 * grey[idx - 1] - grey[idx + w - 1] +
         grey[idx - w + 1] + 2 * grey[idx + 1] + grey[idx + w + 1];
      const gy =
        -grey[idx - w - 1] - 2 * grey[idx - w] - grey[idx - w + 1] +
         grey[idx + w - 1] + 2 * grey[idx + w] + grey[idx + w + 1];
      if (Math.sqrt(gx * gx + gy * gy) > EDGE_SOBEL_THRESH) edgeCount++;
    }
  }
  return total > 0 ? edgeCount / total : 0;
}

// ── Color histogram ───────────────────────────────
// Compute dominant hue bucket (0-11) and saturation mean.
// Used to assign attractor color in the field.
function colorHistogram(imageData) {
  const d       = imageData.data;
  const hBuckets = new Uint32Array(12); // 30° buckets
  let   satSum  = 0, count = 0;

  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const delta = max - min;
    satSum += max > 0 ? delta / max : 0;
    count++;
    if (delta < 0.05) continue; // near-grey: skip hue
    let h = 0;
    if      (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else                h = (r - g) / delta + 4;
    h = (h * 60 + 360) % 360;
    hBuckets[Math.floor(h / 30)]++;
  }

  const dominantBucket = hBuckets.indexOf(Math.max(...hBuckets));
  const dominantHue    = dominantBucket * 30 + 15;
  const satMean        = count > 0 ? satSum / count : 0;

  return { dominantHue, satMean, hBuckets };
}

// ── Main analysis ─────────────────────────────────
// Takes current ImageData + optional prior frame state.
// Returns a FieldDelta ready to be applied to CFR world.field.

/**
 * Analyze a Canvas ImageData snapshot of a manifest node.
 *
 * @param {ImageData}      imageData  — current node snapshot
 * @param {object|null}    priorState — return value of a previous call, or null
 * @returns {{ fieldDelta, nodeSignal, priorState }}
 *
 * fieldDelta: { structure, entropy, curl, damping } — all 0-1, additive
 * nodeSignal: { luminance, motionScore, edgeDensity, invariantRatio, dominantHue }
 */
function analyzeNodeSnapshot(imageData, priorState = null) {
  const lum          = avgLuminance(imageData);
  const edge         = edgeDensity(imageData);
  const { dominantHue, satMean } = colorHistogram(imageData);

  // Frame diff vs prior
  let motionScore  = 0;
  let delta        = [];
  const bgModel    = updateBgModel(priorState?.bgModel ?? null, imageData);
  const invMask    = computeInvariantMask(priorState?.bgModel ?? null, imageData);
  const invRatio   = invMask
    ? invMask.reduce((s, v) => s + v, 0) / invMask.length
    : 1.0; // no prior = assume stable

  if (priorState?.lastFrame) {
    const diff   = frameDiff(priorState.lastFrame, imageData);
    motionScore  = diff.score;
    delta        = diff.delta;
  }

  // ── Field delta mapping ────────────────────────
  // structure: healthy luminance → high structure
  // entropy:   motion delta → turbulence
  // curl:      edge density → rotational complexity
  // damping:   invariant ratio → stability (more invariant = more damped)

  const structureBase = lum > DARK_THRESHOLD
    ? Math.min(0.95, lum / 255)      // bright → structured
    : Math.max(0.05, lum / 255);     // dark → low structure

  const fieldDelta = {
    structure: structureBase * 0.8 + satMean * 0.2,
    entropy:   Math.min(0.5, motionScore * 1.8),
    curl:      Math.min(0.6, edge * 1.2),
    damping:   0.06 + invRatio * 0.10,  // 0.06-0.16 range
  };

  const nodeSignal = {
    luminance:     Math.round(lum),
    isDark:        lum < DARK_THRESHOLD,
    motionScore:   Math.round(motionScore * 10000) / 10000,
    edgeDensity:   Math.round(edge * 1000) / 1000,
    invariantRatio:Math.round(invRatio * 1000) / 1000,
    dominantHue,
    satMean:       Math.round(satMean * 1000) / 1000,
    deltaPixelCount: delta.length,
  };

  // Carry forward for next frame
  const nextPriorState = {
    bgModel,
    lastFrame: imageData,
  };

  return { fieldDelta, nodeSignal, priorState: nextPriorState };
}

// ── Batch analyzer ────────────────────────────────
// Maintains per-node state between calls. Caller registers
// node IDs and feeds snapshots; this accumulates bg models.

class NodeImageAnalyzer {
  constructor() {
    this._state = new Map(); // nodeId → priorState
  }

  /**
   * Feed a new snapshot for a node.
   * @param {string}    nodeId
   * @param {ImageData} imageData
   * @returns {{ fieldDelta, nodeSignal }}
   */
  analyze(nodeId, imageData) {
    const prior = this._state.get(nodeId) ?? null;
    const result = analyzeNodeSnapshot(imageData, prior);
    this._state.set(nodeId, result.priorState);
    return { fieldDelta: result.fieldDelta, nodeSignal: result.nodeSignal };
  }

  /** Reset state for a node (e.g. on manifest change). */
  reset(nodeId) { this._state.delete(nodeId); }

  /** Reset all state. */
  resetAll() { this._state.clear(); }

  /** How many nodes have accumulated baseline state. */
  get baselineCount() { return this._state.size; }
}

module.exports = {
  analyzeNodeSnapshot,
  NodeImageAnalyzer,
  avgLuminance,
  frameDiff,
  edgeDensity,
  colorHistogram,
  computeInvariantMask,
  DARK_THRESHOLD,
  PIXEL_INVARIANT_VAR,
};
