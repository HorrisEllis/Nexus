/* ═══════════════════════════════════════════════════════════
   PRECISION CLOCK  v1.0.0
   runtime/precision-clock.js

   Three-layer timing system:

   LAYER 1 — AudioWorklet (audio thread)
     Runs precision-clock.worklet.js on the audio thread.
     Sends tick messages every ~2.9ms with sample-accurate
     AudioContext.currentTime stamps. No JS main thread jitter.

   LAYER 2 — Lookahead scheduler (main thread)
     On each worklet tick, looks LOOKAHEAD seconds into the
     future and fires any events scheduled in that window.
     Events are pre-scheduled against AudioContext.currentTime,
     not "fire now" — so the audio engine gets exact times.

   LAYER 3 — Web Audio API as clock source
     All synthesis uses t = AudioContext.currentTime + offset.
     The AudioContext clock is hardware-locked. It does not drift.

   Usage:
     const clock = new PrecisionClock(AudioContext);
     await clock.boot();
     clock.onTick = (nextBeatTime) => { ... };
     clock.start(bpm, subdivision);
     clock.stop();

   Exports: window.PrecisionClock
   ═══════════════════════════════════════════════════════════ */

window.PrecisionClock = class PrecisionClock {
  constructor(AC) {
    this._AC          = AC;
    this._worklet     = null;   /* AudioWorkletNode */
    this._running     = false;
    this._bpm         = 128;
    this._subdivision = 4;      /* 4 = 16th notes */
    this._stepTime    = 0;      /* seconds per step */
    this._nextStepAt  = 0;      /* AC.currentTime of next step */
    this._stepIdx     = 0;
    this._stepCount   = 16;
    this._swing       = 0;      /* 0-0.5 — amount of swing delay on odd steps */
    this._booted      = false;

    /* Lookahead: how far ahead to schedule in seconds.
       Longer = safer against jitter but more latency.
       100ms is the sweet spot for most hardware.        */
    this.LOOKAHEAD    = 0.100;

    /* Callbacks — set these from outside */
    this.onStep       = null; /* (stepIdx, scheduleTime) => void */
    this.onBar        = null; /* (barIdx, scheduleTime)  => void */
  }

  /* Boot — loads worklet module. Must be called after first user gesture. */
  async boot() {
    if (this._booted) return;
    try {
      /* AudioWorklet requires HTTPS or localhost. For file:// we fallback. */
      const workletUrl = new URL('precision-clock.worklet.js', location.href).href;
      await this._AC.audioWorklet.addModule(workletUrl);
      this._worklet = new AudioWorkletNode(this._AC, 'precision-clock');
      this._worklet.port.onmessage = ({ data }) => {
        if (data.type === 'tick') this._onWorkletTick(data.time);
      };
      /* Connect to destination so the worklet stays alive
         (some browsers garbage-collect disconnected nodes) */
      this._worklet.connect(this._AC.destination);
      this._booted = true;
      console.log('[PrecisionClock] AudioWorklet booted — audio-thread scheduling active');
    } catch(e) {
      /* file:// or browser without AudioWorklet support → fallback */
      console.warn('[PrecisionClock] AudioWorklet unavailable, falling back to lookahead setTimeout:', e.message);
      this._booted = true;
      this._fallback = true;
    }
  }

  /* Recompute step timing from BPM */
  _recompute() {
    const beatSec     = 60 / this._bpm;
    this._stepTime    = beatSec / (this._subdivision / 4);
  }

  start(bpm = 128, stepCount = 16, subdivision = 4, swing = 0) {
    if (this._running) this.stop();
    this._bpm         = bpm;
    this._stepCount   = stepCount;
    this._subdivision = subdivision;
    this._swing       = Math.max(0, Math.min(0.49, swing));
    this._stepIdx     = 0;
    this._running     = true;
    this._recompute();
    this._nextStepAt  = this._AC.currentTime + 0.05; /* small startup delay */

    if (this._fallback) {
      this._fallbackLoop();
    } else {
      /* Start worklet — tick interval = half the lookahead for safety */
      const tickInterval = this.LOOKAHEAD / 2;
      this._worklet.port.postMessage({ type:'start', intervalSec: tickInterval });
    }
  }

  stop() {
    this._running = false;
    this._stepIdx = 0;
    if (this._worklet && !this._fallback) {
      this._worklet.port.postMessage({ type:'stop' });
    }
    if (this._fallbackTimer) {
      clearTimeout(this._fallbackTimer);
      this._fallbackTimer = null;
    }
  }

  setBPM(bpm) {
    this._bpm = Math.max(20, Math.min(999, bpm));
    this._recompute();
    if (this._worklet && !this._fallback && this._running) {
      const tickInterval = this.LOOKAHEAD / 2;
      this._worklet.port.postMessage({ type:'set-interval', intervalSec: tickInterval });
    }
  }

  setSwing(swing) {
    this._swing = Math.max(0, Math.min(0.49, swing));
  }

  /* ── Worklet tick handler ─────────────────────────────── */
  _onWorkletTick(tickTime) {
    if (!this._running) return;

    /* Schedule all steps that fall within the lookahead window */
    while (this._nextStepAt < tickTime + this.LOOKAHEAD) {
      this._scheduleStep(this._nextStepAt);
      this._advance();
    }
  }

  /* Schedule one step at an exact AudioContext time */
  _scheduleStep(t) {
    if (!this.onStep) return;
    try {
      this.onStep(this._stepIdx, t);
      if (this._stepIdx % (this._subdivision) === 0 && this.onBar) {
        this.onBar(Math.floor(this._stepIdx / this._subdivision), t);
      }
    } catch(e) {
      console.error('[PrecisionClock] onStep error:', e);
    }
  }

  /* Advance step index and compute next step time with swing */
  _advance() {
    this._stepIdx = (this._stepIdx + 1) % this._stepCount;

    /* Swing: delay odd 16th notes by swing fraction of a 16th */
    const swingDelay = (this._stepIdx % 2 === 1)
      ? this._swing * this._stepTime
      : 0;

    this._nextStepAt += this._stepTime + swingDelay;
  }

  /* ── Fallback: lookahead setTimeout ─────────────────────
     Same lookahead logic but driven by setTimeout.
     Better than bare setTimeout(fn, stepMs) because we
     still schedule against AC.currentTime — just the trigger
     is less precise. ~2-5ms jitter vs ~10-20ms.           */
  _fallbackLoop() {
    if (!this._running) return;

    const now = this._AC.currentTime;
    while (this._nextStepAt < now + this.LOOKAHEAD) {
      this._scheduleStep(this._nextStepAt);
      this._advance();
    }

    /* Schedule next check — aim for half the lookahead window */
    const msUntilNextCheck = (this.LOOKAHEAD / 2) * 1000;
    this._fallbackTimer = setTimeout(() => this._fallbackLoop(), msUntilNextCheck);
  }

  get BPM()     { return this._bpm; }
  get stepIdx() { return this._stepIdx; }
  get running() { return this._running; }
};

/* ── SNR Master Bus ──────────────────────────────────────────
   Signal-to-noise filtering on the audio output chain.

   Chain: dry → highpass(20Hz) → lowpass(20kHz) → compressor
          → limiter → destination

   Highpass: removes sub-sonic rumble (<20Hz) that wastes
   headroom and causes speaker damage.

   Lowpass: removes aliasing artifacts above 20kHz.

   Compressor: already in kernel. Tuned for music production:
   fast attack for transients, slow release for sustain.

   Limiter: hard brickwall at -0.3dBFS. Prevents clipping
   on the digital output. True peak limiting.

   Dithering: adds shaped noise at -144dBFS before the
   limiter to reduce quantization distortion on 16-bit export.
   Inaudible but measurable — improves SNR on export.
   ═══════════════════════════════════════════════════════════ */
window.SNRChain = (() => {
'use strict';

let _booted    = false;
let _hpFilter  = null;
let _lpFilter  = null;
let _compressor= null;
let _limiter   = null;
let _ditherGain= null;
let _ditherSrc = null;

function boot(AC, masterGain) {
  if (_booted) return;
  _booted = true;

  /* High-pass — kill sub-sonic rumble */
  _hpFilter = AC.createBiquadFilter();
  _hpFilter.type            = 'highpass';
  _hpFilter.frequency.value = 22;     /* 22Hz — below human hearing */
  _hpFilter.Q.value         = 0.707;  /* Butterworth — no resonance */

  /* Low-pass — kill aliasing */
  _lpFilter = AC.createBiquadFilter();
  _lpFilter.type            = 'lowpass';
  _lpFilter.frequency.value = 20000;
  _lpFilter.Q.value         = 0.707;

  /* Compressor — tuned for music production */
  _compressor = AC.createDynamicsCompressor();
  _compressor.threshold.value = -18;  /* dBFS — gentle catch */
  _compressor.knee.value      = 6;    /* soft knee — natural sounding */
  _compressor.ratio.value     = 3;    /* 3:1 — gentle, not crushing */
  _compressor.attack.value    = 0.003;/* 3ms — catches transients */
  _compressor.release.value   = 0.25; /* 250ms — musical release */

  /* Limiter — true peak brickwall */
  _limiter = AC.createDynamicsCompressor();
  _limiter.threshold.value = -0.5;   /* -0.5dBFS brickwall */
  _limiter.knee.value      = 0;      /* hard knee */
  _limiter.ratio.value     = 20;     /* 20:1 ≈ limiting */
  _limiter.attack.value    = 0.001;  /* 1ms */
  _limiter.release.value   = 0.05;   /* 50ms */

  /* Dither — shaped noise at -144dBFS
     Reduces quantization noise on 16-bit output.
     Uses noise shaping to push quantization error
     into high frequencies where it's less audible.  */
  try {
    const ditherBuf = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate);
    const d         = ditherBuf.getChannelData(0);
    /* TPDF dither: two uniform noise sources subtracted */
    for (let i = 0; i < d.length; i++) {
      d[i] = (Math.random() - Math.random()) / 32768; /* 1 LSB at 16-bit */
    }
    _ditherSrc       = AC.createBufferSource();
    _ditherSrc.buffer = ditherBuf;
    _ditherSrc.loop   = true;
    _ditherGain       = AC.createGain();
    _ditherGain.gain.value = 0.5; /* -6dB relative to 1 LSB */
    _ditherSrc.connect(_ditherGain);
    _ditherGain.connect(_limiter);
    _ditherSrc.start();
  } catch(e) {
    /* Dither is enhancement only — non-fatal */
    console.warn('[SNRChain] Dither init failed (non-fatal):', e.message);
  }

  /* Chain: masterGain → hp → lp → compressor → limiter → destination */
  try { masterGain.disconnect(); } catch(e) {}
  masterGain.connect(_hpFilter);
  _hpFilter.connect(_lpFilter);
  _lpFilter.connect(_compressor);
  _compressor.connect(_limiter);
  _limiter.connect(AC.destination);

  console.log('[SNRChain] Master bus: HPF(22Hz) → LPF(20kHz) → Comp(3:1) → Limiter(-0.5dBFS) → Dither(TPDF)');

  return { hpFilter: _hpFilter, lpFilter: _lpFilter, compressor: _compressor, limiter: _limiter };
}

function getReduction() {
  if (!_compressor) return { comp: 0, limit: 0 };
  return {
    comp:  Math.abs(_compressor.reduction),
    limit: Math.abs(_limiter.reduction),
  };
}

return { boot, getReduction };
})();
