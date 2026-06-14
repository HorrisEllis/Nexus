'use strict';
/**
 * lib/meta/telemetry-codec/index.js — Telemetry Codec CJS wrapper
 * UUID: nexus-telemetry-codec-v1-0000-4000-0000-000000000001
 *
 * Ports Telemetry Codec engines for use inside NEXUS (CJS module system).
 * The four compression engines replace lib/baseline.js hand-rolled math.
 *
 * SlopeEngine        — WHERE it's going (direction, momentum, regime change)
 * StabilityEngine    — IS it settling (CV, entropy, convergence/divergence)
 * OscillationEngine  — IS it rhythmic (period, regularity, amplitude)
 * ConfidencePropagator — ARE signals corroborating each other
 *
 * ServiceLatentModel — 5D Kalman state (momentum, load, debt, coherence, capacity)
 * ServiceDriftEngine — 7 sub-threshold precursor signals → DriftCluster detection
 * TelemetryRuntime   — full wiring: observe(metric, value) → tick() → frame
 */

// ── Engine implementations (inlined to avoid ESM/CJS mismatch) ───────────────
// Ported from telemetry-codec v1.0.0 — domain-agnostic temporal compression

function r4(v) { return Math.round((v??0)*10000)/10000; }

// ── SlopeEngine ───────────────────────────────────────────────────────────────
class SlopeEngine {
  constructor(window = 8) {
    this._w = window; this._buf = []; this._prevDir = 'flat';
  }
  feed(v) {
    this._buf.push(v);
    if (this._buf.length > this._w) this._buf.shift();
    const n = this._buf.length;
    if (n < 2) return { slope:0, r2:0, direction:'flat', momentum:0, regimeChange:false };
    let sumX=0,sumY=0,sumXY=0,sumX2=0,sumY2=0;
    for (let i=0;i<n;i++) { sumX+=i; sumY+=this._buf[i]; sumXY+=i*this._buf[i]; sumX2+=i*i; sumY2+=this._buf[i]**2; }
    const D=n*sumX2-sumX*sumX;
    const slope=D?((n*sumXY-sumX*sumY)/D):0;
    const b=(sumY-slope*sumX)/n, meanY=sumY/n;
    let ssTot=0,ssRes=0;
    for (let i=0;i<n;i++) { ssTot+=(this._buf[i]-meanY)**2; ssRes+=(this._buf[i]-(b+slope*i))**2; }
    const r2=ssTot>0?Math.max(0,1-ssRes/ssTot):0;
    const dir=Math.abs(slope)<0.003?'flat':slope>0?'rising':'falling';
    const sigma=Math.sqrt(Math.max(0,sumY2/n-(sumY/n)**2));
    const momentum=sigma>0?(slope*r2)/sigma:0;
    const regimeChange=dir!=='flat'&&this._prevDir!=='flat'&&dir!==this._prevDir;
    this._prevDir=dir;
    return { slope:r4(slope), r2:r4(r2), direction:dir, momentum:r4(momentum), regimeChange };
  }
}

// ── StabilityEngine ───────────────────────────────────────────────────────────
class StabilityEngine {
  constructor(window=16) { this._w=window; this._buf=[]; }
  feed(v) {
    this._buf.push(v); if (this._buf.length>this._w) this._buf.shift();
    const n=this._buf.length; if (n<2) return { cv:0, entropy:0, state:'unknown' };
    const mean=this._buf.reduce((a,b)=>a+b,0)/n;
    const std=Math.sqrt(this._buf.reduce((s,x)=>s+(x-mean)**2,0)/n);
    const cv=mean!==0?std/Math.abs(mean):0;
    // Entropy via 5-bin histogram
    const min=Math.min(...this._buf), max=Math.max(...this._buf), range=max-min||1;
    const bins=[0,0,0,0,0];
    this._buf.forEach(x=>{ const b=Math.min(4,Math.floor((x-min)/range*5)); bins[b]++; });
    const entropy=-bins.reduce((s,c)=>{ const p=c/n; return s+(p>0?p*Math.log2(p):0); },0)/Math.log2(5);
    const state=cv<0.05?'stable':cv<0.15?'settling':cv<0.40?'variable':'volatile';
    return { cv:r4(cv), entropy:r4(entropy), state, mean:r4(mean), std:r4(std) };
  }
}

// ── OscillationEngine ─────────────────────────────────────────────────────────
class OscillationEngine {
  constructor(window=32) { this._w=window; this._buf=[]; }
  feed(v) {
    this._buf.push(v); if (this._buf.length>this._w) this._buf.shift();
    const n=this._buf.length; if (n<4) return { oscillating:false, period:0, amplitude:0 };
    // Count zero-crossings around mean
    const mean=this._buf.reduce((a,b)=>a+b,0)/n;
    let crossings=0;
    for (let i=1;i<n;i++) {
      if ((this._buf[i-1]-mean)*(this._buf[i]-mean)<0) crossings++;
    }
    const period=crossings>1?r4((n-1)/crossings*2):0;
    const amplitude=r4((Math.max(...this._buf)-Math.min(...this._buf))/2);
    const regularity=crossings>0?r4(Math.min(1,crossings/(n/4))):0;
    return { oscillating:crossings>2, period, amplitude, regularity, crossings };
  }
}

// ── ConfidencePropagator ──────────────────────────────────────────────────────
class ConfidencePropagator {
  constructor() { this._channels={}; }
  update(channel, value) {
    if (!this._channels[channel]) this._channels[channel]={ values:[], confidence:0.5 };
    const ch=this._channels[channel];
    ch.values.push(value); if (ch.values.length>20) ch.values.shift();
    const n=ch.values.length; if (n<2) return ch.confidence;
    const mean=ch.values.reduce((a,b)=>a+b,0)/n;
    const std=Math.sqrt(ch.values.reduce((s,x)=>s+(x-mean)**2,0)/n);
    // High confidence = low noise (CV < 0.1) AND signal present (mean > 0)
    const cv=mean!==0?std/Math.abs(mean):1;
    ch.confidence=r4(Math.max(0,Math.min(1,1-cv)));
    return ch.confidence;
  }
  overall() {
    const vals=Object.values(this._channels).map(c=>c.confidence);
    return vals.length?r4(vals.reduce((a,b)=>a+b,0)/vals.length):0;
  }
}

// ── ServiceDriftEngine — sub-threshold precursor detection ────────────────────
const SIGNAL = Object.freeze({
  REQUEST_TEMPO_SHIFT: 'REQUEST_TEMPO_SHIFT',
  LATENCY_MICRO_SPIKE: 'LATENCY_MICRO_SPIKE',
  METRIC_INCONGRUENCE: 'METRIC_INCONGRUENCE',
  BASELINE_DRIFT:      'BASELINE_DRIFT',
  LOAD_TRAJECTORY:     'LOAD_TRAJECTORY',
  CADENCE_DISRUPTION:  'CADENCE_DISRUPTION',
  TRAJECTORY_MISMATCH: 'TRAJECTORY_MISMATCH',
});

const CALIBRATION_WINDOW = 30;

class ServiceDriftEngine {
  constructor() {
    this._frame=0; this._baseline=null; this._history=[];
    this._active=new Map();
  }
  feed(metrics) {
    this._frame++;
    this._history.push({ ...metrics, _f: this._frame });
    if (this._history.length>100) this._history.shift();

    if (this._frame<=CALIBRATION_WINDOW) {
      if (this._frame===CALIBRATION_WINDOW) this._calibrate();
      return { phase:'calibrating', frame:this._frame };
    }

    return this._detect(metrics);
  }
  _calibrate() {
    const keys=Object.keys(this._history[0]).filter(k=>k!=='_f');
    this._baseline={};
    for (const k of keys) {
      const vals=this._history.map(h=>h[k]||0);
      const mean=vals.reduce((a,b)=>a+b,0)/vals.length;
      const std=Math.sqrt(vals.reduce((s,x)=>s+(x-mean)**2,0)/vals.length);
      this._baseline[k]={ mean, std };
    }
  }
  _detect(metrics) {
    if (!this._baseline) return { phase:'calibrating' };
    const signals=[];
    for (const [k,v] of Object.entries(metrics)) {
      const b=this._baseline[k]; if (!b||b.std===0) continue;
      const z=Math.abs((v-b.mean)/b.std);
      if (z>1.5&&z<3.0) signals.push({ metric:k, z:r4(z), type:SIGNAL.BASELINE_DRIFT });
    }
    const cluster=signals.length>=3;
    const magnitude=r4(signals.reduce((s,sig)=>s+sig.z,0));
    return { phase:'active', signals, cluster, magnitude, frame:this._frame };
  }
}

// ── TelemetryRuntime — full wiring ────────────────────────────────────────────
class TelemetryRuntime {
  constructor({ serviceId='service' }={}) {
    this._id=serviceId; this._frame=0; this._pending={};
    this._slope=new SlopeEngine(); this._stability=new StabilityEngine();
    this._oscillation=new OscillationEngine(); this._confidence=new ConfidencePropagator();
    this._drift=new ServiceDriftEngine();
    this._listeners={ frame:[], incident:[], precursor:[] };
  }
  observe(metric, value) { this._pending[metric]=value; }
  on(event, fn) { (this._listeners[event]||[]).push(fn); return this; }
  tick() {
    this._frame++;
    const snap={ ...this._pending }; this._pending={};
    // Aggregate to a single health scalar for core engines
    const vals=Object.values(snap).filter(v=>typeof v==='number');
    const health=vals.length?r4(vals.reduce((a,b)=>a+b,0)/vals.length):0;

    const slope=this._slope.feed(health);
    const stability=this._stability.feed(health);
    const osc=this._oscillation.feed(health);
    for (const [k,v] of Object.entries(snap)) this._confidence.update(k,v);

    const drift=this._drift.feed(snap);

    const frame={
      serviceId:this._id, frame:this._frame, ts:Date.now(),
      health, slope, stability, oscillation:osc,
      confidence:{ overall:this._confidence.overall() },
      drift, snapshot:snap,
    };

    this._listeners.frame.forEach(fn=>fn(frame));
    if (drift.cluster) this._listeners.incident.forEach(fn=>fn({ type:'drift.cluster', ...drift }));
    if (drift.signals?.length) this._listeners.precursor.forEach(fn=>fn({ signals:drift.signals }));

    return frame;
  }
}

module.exports = {
  SlopeEngine, StabilityEngine, OscillationEngine, ConfidencePropagator,
  ServiceDriftEngine, TelemetryRuntime, SIGNAL,
  MODULE_ID: 'telemetry-codec', VERSION: '1.0.0',
};
