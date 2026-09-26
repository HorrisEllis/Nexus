'use strict';
/**
 * lib/meta/spatial/sigma.js — Spatial Sigma Engine (CJS)
 * UUID: nexus-spatial-sigma-v1-0000-4000-0000-000000000001
 * Ported from @spatial/sigma v1.0.0
 *
 * Entropy detection. Slope. Trajectory. Regime classification.
 * Domain-agnostic — works on any 5D latent state vector.
 * In NEXUS: maps system health dimensions to behavioral regimes.
 */

const SIGMA_VERSION = '1.0.0';

const REGIMES = Object.freeze({
  STABLE:           'stable',
  ACTIVATING:       'activating',
  UNGROUNDED:       'ungrounded',
  DYSREGULATED:     'dysregulated',
  OSCILLATORY:      'oscillatory',
  COLLAPSING:       'collapsing',
  OFFLINE:          'offline',
  INSUFFICIENT_DATA:'insufficient_data',
});

const DEFAULT_CONFIG = Object.freeze({
  minWindow:         4,
  slopeThreshold:    0.18,
  dysregThreshold:   0.45,
  collapseThreshold: 0.72,
  oscillationCount:  3,
  windowSize:        8,
});

function r4(v) { return Math.round((v??0)*10000)/10000; }

class SigmaEngine {
  constructor(cfg = {}) {
    this._cfg   = { ...DEFAULT_CONFIG, ...cfg };
    this._buf   = [];   // rolling window of scalar values
    this._dirs  = [];   // direction history for oscillation detection
  }

  feed(value) {
    this._buf.push(value);
    if (this._buf.length > this._cfg.windowSize) this._buf.shift();
    return this.classify(value);
  }

  classify(currentValue) {
    const value = currentValue ?? (this._buf.length ? this._buf[this._buf.length-1] : 0);
    const n = this._buf.length;
    if (n < this._cfg.minWindow) return { regime: REGIMES.INSUFFICIENT_DATA, slope: 0, entropy: 0 };

    // OLS slope
    const mean = this._buf.reduce((a,b)=>a+b,0)/n;
    const xs   = this._buf.map((_,i)=>i);
    const mx   = (n-1)/2;
    const num  = xs.reduce((s,x,i)=>s+(x-mx)*(this._buf[i]-mean),0);
    const den  = xs.reduce((s,x)=>s+(x-mx)**2,0);
    const slope= den ? num/den : 0;

    // Entropy via std
    const std  = Math.sqrt(this._buf.reduce((s,x)=>s+(x-mean)**2,0)/n);
    const entropy = r4(Math.min(1, std * 2));

    // Direction for oscillation
    const dir = Math.abs(slope) < 0.01 ? 'flat' : slope > 0 ? 'up' : 'down';
    this._dirs.push(dir);
    if (this._dirs.length > 12) this._dirs.shift();
    const flips = this._dirs.slice(1).filter((d,i)=>d!=='flat'&&this._dirs[i]!=='flat'&&d!==this._dirs[i]).length;

    // Regime
    const absSlope = Math.abs(slope);
    let regime;
    if (value > 0.9 && absSlope > 0.3)       regime = REGIMES.OFFLINE;
    else if (absSlope > this._cfg.collapseThreshold) regime = REGIMES.COLLAPSING;
    else if (flips >= this._cfg.oscillationCount) regime = REGIMES.OSCILLATORY;
    else if (entropy > 0.45 && absSlope > this._cfg.dysregThreshold) regime = REGIMES.DYSREGULATED;
    else if (entropy > 0.30) regime = REGIMES.UNGROUNDED;
    else if (absSlope > this._cfg.slopeThreshold) regime = REGIMES.ACTIVATING;
    else regime = REGIMES.STABLE;

    return { regime, slope: r4(slope), entropy, mean: r4(mean), std: r4(std), flips, n };
  }

  reset() { this._buf = []; this._dirs = []; }
}

// Stateless classify for one-shot use
function classify(values, cfg = {}) {
  const eng = new SigmaEngine(cfg);
  values.forEach(v => eng.feed(v));
  return eng.classify();
}

module.exports = { SigmaEngine, classify, REGIMES, DEFAULT_CONFIG, SIGMA_VERSION, MODULE_ID: 'spatial-sigma' };
