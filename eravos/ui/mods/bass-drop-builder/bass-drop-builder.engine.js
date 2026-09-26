/* ═══════════════════════════════════════════════════════════
   MOD: BASS DROP BUILDER  v1.0.0
   id: eravos.bass-drop-builder

   Builds complete drop sequences:
     TENSION   — rising harmonic dissonance, filter sweep up
     SLOPE     — BPM feel acceleration, density increase
     BUILD     — layered riser + neuro wobble + sub roll
     DROP      — impact + full bass + rhythm explosion
     VOCAL     — trigger loaded Raven voice clip at any stage

   The whole system is parameter-driven.
   Load a voice clip, set the drop point, fire.
   ═══════════════════════════════════════════════════════════ */

window.BassDropBuilderEngine = (() => {
'use strict';

/* ── Synthesis helpers ──────────────────────────────────── */
function _distort(AC, amount = 0.5) {
  const s = AC.createWaveShaper();
  const n = 256, c = new Float32Array(n), k = amount * 100;
  for (let i = 0; i < n; i++) { const x = (i*2)/n-1; c[i] = ((Math.PI+k)*x)/(Math.PI+k*Math.abs(x)); }
  s.curve = c; s.oversample = '4x'; return s;
}

/* ── Stage engines ──────────────────────────────────────── */

/* TENSION — rising dissonant pad + filter squeeze */
function _tension(AC, t, dur, params, masterGain) {
  const { freq = 110, intensity = 0.6 } = params;
  const nodes = [];

  /* Tritone dissonance (the most unstable interval) */
  [1, 1.414, 2, 2.828].forEach((ratio, i) => {
    const o  = AC.createOscillator();
    const g  = AC.createGain();
    const lfo = AC.createOscillator();
    const lg = AC.createGain();
    o.type      = 'sawtooth';
    o.frequency.value = freq * ratio;
    lfo.type    = 'sine';
    lfo.frequency.value = 0.3 + i * 0.1;
    lg.gain.value = freq * ratio * 0.005;
    lfo.connect(lg); lg.connect(o.frequency);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(intensity * 0.15 / (i + 1), t + dur * 0.3);
    g.gain.linearRampToValueAtTime(intensity * 0.22 / (i + 1), t + dur);
    o.connect(g); g.connect(masterGain);
    lfo.start(t); o.start(t);
    lfo.stop(t + dur + 0.1); o.stop(t + dur + 0.1);
    nodes.push(o, g, lfo, lg);
  });

  /* Filter sweep — closes to near-DC then explodes at drop */
  const nb  = AC.createBufferSource();
  const len = Math.ceil(AC.sampleRate * (dur + 0.1));
  const buf = AC.createBuffer(1, len, AC.sampleRate);
  const d   = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  nb.buffer = buf;
  const nf  = AC.createBiquadFilter(); nf.type = 'lowpass';
  const ng  = AC.createGain();
  nf.frequency.setValueAtTime(800, t);
  nf.frequency.linearRampToValueAtTime(200 + (1 - intensity) * 600, t + dur * 0.8);
  nf.frequency.exponentialRampToValueAtTime(4000, t + dur);
  nf.Q.value = 8 + intensity * 10;
  ng.gain.setValueAtTime(0, t);
  ng.gain.linearRampToValueAtTime(intensity * 0.2, t + dur * 0.4);
  ng.gain.linearRampToValueAtTime(intensity * 0.35, t + dur);
  nb.connect(nf); nf.connect(ng); ng.connect(masterGain);
  nb.start(t); nb.stop(t + dur + 0.15);
  nodes.push(nb, nf, ng);

  return nodes;
}

/* SLOPE — density build. Rapid-fire percussion ghosts. */
function _slope(AC, t, dur, params, masterGain) {
  const { density = 0.7, bpm = 128 } = params;
  const beatSec  = 60 / bpm;
  const step16   = beatSec / 4;
  const numHits  = Math.floor(dur / step16 * density);
  const nodes    = [];

  for (let i = 0; i < numHits; i++) {
    const hitT  = t + (i / numHits) * dur;
    const vel   = 0.15 + (i / numHits) * 0.5; /* velocity crescendo */
    const freq  = 6000 + Math.random() * 4000;

    const nb  = AC.createBufferSource();
    const len = Math.ceil(AC.sampleRate * 0.025);
    const buf = AC.createBuffer(1, len, AC.sampleRate);
    const d   = buf.getChannelData(0);
    for (let j = 0; j < len; j++) d[j] = Math.random() * 2 - 1;
    nb.buffer = buf;

    const nf  = AC.createBiquadFilter(); nf.type = 'highpass'; nf.frequency.value = freq;
    const ng  = AC.createGain();
    ng.gain.setValueAtTime(vel * 0.25, hitT);
    ng.gain.exponentialRampToValueAtTime(0.001, hitT + 0.025);
    nb.connect(nf); nf.connect(ng); ng.connect(masterGain);
    nb.start(hitT); nb.stop(hitT + 0.03);
    nodes.push(nb, nf, ng);
  }

  /* BPM feel: increase perceived tempo via pitch-up riser */
  const riserO = AC.createOscillator();
  const riserG = AC.createGain();
  riserO.type  = 'sawtooth';
  riserO.frequency.setValueAtTime(55, t);
  riserO.frequency.exponentialRampToValueAtTime(880, t + dur);
  const riserF = AC.createBiquadFilter(); riserF.type = 'lowpass';
  riserF.frequency.setValueAtTime(300, t);
  riserF.frequency.exponentialRampToValueAtTime(8000, t + dur);
  riserG.gain.setValueAtTime(0, t);
  riserG.gain.linearRampToValueAtTime(density * 0.3, t + dur * 0.6);
  riserG.gain.linearRampToValueAtTime(density * 0.5, t + dur);
  riserO.connect(riserF); riserF.connect(riserG); riserG.connect(masterGain);
  riserO.start(t); riserO.stop(t + dur + 0.05);
  nodes.push(riserO, riserF, riserG);

  return nodes;
}

/* BUILD — full pre-drop layer stack */
function _build(AC, t, dur, params, masterGain) {
  const { freq = 110, cutoff = 600, res = 8, rate = 6, depth = 800 } = params;
  const nodes = [];

  /* Neuro wobble growing */
  const wO   = AC.createOscillator(); wO.type = 'sawtooth'; wO.frequency.value = freq;
  const wO2  = AC.createOscillator(); wO2.type = 'sawtooth'; wO2.frequency.value = freq * 1.006;
  const wLFO = AC.createOscillator(); wLFO.type = 'sine'; wLFO.frequency.value = rate;
  const wLG  = AC.createGain(); wLG.gain.value = depth;
  const wF   = AC.createBiquadFilter(); wF.type = 'lowpass'; wF.frequency.value = cutoff; wF.Q.value = res;
  const wDist= _distort(AC, 0.5);
  const wG   = AC.createGain();
  wLFO.connect(wLG); wLG.connect(wF.frequency);
  wO.connect(wDist); wO2.connect(wDist); wDist.connect(wF); wF.connect(wG); wG.connect(masterGain);
  wG.gain.setValueAtTime(0, t);
  wG.gain.linearRampToValueAtTime(0.4, t + dur * 0.4);
  wG.gain.linearRampToValueAtTime(0.65, t + dur);
  wO.start(t); wO2.start(t); wLFO.start(t);
  wO.stop(t + dur + 0.1); wO2.stop(t + dur + 0.1); wLFO.stop(t + dur + 0.1);
  nodes.push(wO, wO2, wLFO, wLG, wF, wDist, wG);

  /* Sub roll growing under the wobble */
  const sO  = AC.createOscillator(); sO.type = 'sine'; sO.frequency.value = freq * 0.5;
  const sF  = AC.createBiquadFilter(); sF.type = 'lowpass'; sF.frequency.value = 180;
  const sG  = AC.createGain();
  sG.gain.setValueAtTime(0, t);
  sG.gain.linearRampToValueAtTime(0.5, t + dur * 0.5);
  sG.gain.linearRampToValueAtTime(0.8, t + dur);
  sO.connect(sF); sF.connect(sG); sG.connect(masterGain);
  sO.start(t); sO.stop(t + dur + 0.05);
  nodes.push(sO, sF, sG);

  /* White noise sweep */
  const nBuf = AC.createBuffer(1, Math.ceil(AC.sampleRate * (dur + 0.1)), AC.sampleRate);
  const nD   = nBuf.getChannelData(0);
  for (let i = 0; i < nD.length; i++) nD[i] = Math.random() * 2 - 1;
  const nSrc = AC.createBufferSource(); nSrc.buffer = nBuf;
  const nF   = AC.createBiquadFilter(); nF.type = 'highpass';
  const nG   = AC.createGain();
  nF.frequency.setValueAtTime(8000, t);
  nF.frequency.exponentialRampToValueAtTime(200, t + dur);
  nG.gain.setValueAtTime(0, t);
  nG.gain.linearRampToValueAtTime(0.18, t + dur * 0.7);
  nG.gain.linearRampToValueAtTime(0.3, t + dur);
  nSrc.connect(nF); nF.connect(nG); nG.connect(masterGain);
  nSrc.start(t); nSrc.stop(t + dur + 0.15);
  nodes.push(nSrc, nF, nG);

  return nodes;
}

/* DROP — the moment */
function _drop(AC, t, params, masterGain) {
  const { freq = 55, drive = 0.6, bpm = 128 } = params;
  const beatSec = 60 / bpm;
  const nodes   = [];

  /* Sub boom */
  const subO = AC.createOscillator(); subO.type = 'sine';
  const subG = AC.createGain();
  subO.frequency.setValueAtTime(freq * 2, t);
  subO.frequency.exponentialRampToValueAtTime(freq * 0.8, t + 0.5);
  subG.gain.setValueAtTime(1.3, t);
  subG.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
  subO.connect(subG); subG.connect(masterGain);
  subO.start(t); subO.stop(t + 0.75);
  nodes.push(subO, subG);

  /* Distorted body thud */
  const thudO = AC.createOscillator(); thudO.type = 'sine';
  const thudD = _distort(AC, drive);
  const thudF = AC.createBiquadFilter(); thudF.type = 'lowpass'; thudF.frequency.value = freq * 6;
  const thudG = AC.createGain();
  thudO.frequency.setValueAtTime(freq * 3, t);
  thudO.frequency.exponentialRampToValueAtTime(freq, t + 0.18);
  thudG.gain.setValueAtTime(1.0, t);
  thudG.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
  thudO.connect(thudD); thudD.connect(thudF); thudF.connect(thudG); thudG.connect(masterGain);
  thudO.start(t); thudO.stop(t + 0.25);
  nodes.push(thudO, thudD, thudF, thudG);

  /* Air crack */
  const crBuf = AC.createBuffer(1, Math.ceil(AC.sampleRate * 0.018), AC.sampleRate);
  const crD   = crBuf.getChannelData(0);
  for (let i = 0; i < crD.length; i++) crD[i] = Math.random() * 2 - 1;
  const crSrc = AC.createBufferSource(); crSrc.buffer = crBuf;
  const crF   = AC.createBiquadFilter(); crF.type = 'highpass'; crF.frequency.value = 8000;
  const crG   = AC.createGain();
  crG.gain.setValueAtTime(0.9, t);
  crG.gain.exponentialRampToValueAtTime(0.001, t + 0.018);
  crSrc.connect(crF); crF.connect(crG); crG.connect(masterGain);
  crSrc.start(t); crSrc.stop(t + 0.02);
  nodes.push(crSrc, crF, crG);

  /* Reese bass drop — two detuned saws sweep in */
  const rO1 = AC.createOscillator(); rO1.type = 'sawtooth'; rO1.frequency.value = freq * 1.006;
  const rO2 = AC.createOscillator(); rO2.type = 'sawtooth'; rO2.frequency.value = freq * 0.994;
  const rF  = AC.createBiquadFilter(); rF.type = 'lowpass';
  const rG  = AC.createGain();
  const rDur = beatSec * 2;
  rF.frequency.setValueAtTime(freq * 0.8, t);
  rF.frequency.exponentialRampToValueAtTime(freq * 6, t + 0.05);
  rF.frequency.exponentialRampToValueAtTime(freq * 2.5, t + rDur);
  rF.Q.value = 2;
  rG.gain.setValueAtTime(0, t);
  rG.gain.linearRampToValueAtTime(0.85, t + 0.02);
  rG.gain.exponentialRampToValueAtTime(0.001, t + rDur);
  rO1.connect(rF); rO2.connect(rF); rF.connect(rG); rG.connect(masterGain);
  rO1.start(t); rO2.start(t);
  rO1.stop(t + rDur + 0.05); rO2.stop(t + rDur + 0.05);
  nodes.push(rO1, rO2, rF, rG);

  /* Neuro wobble burst after the impact */
  const wDelay = 0.03;
  const wO  = AC.createOscillator(); wO.type = 'sawtooth'; wO.frequency.value = freq;
  const wLFO= AC.createOscillator(); wLFO.type = 'sine'; wLFO.frequency.value = 8;
  const wLG = AC.createGain(); wLG.gain.value = 900;
  const wF  = AC.createBiquadFilter(); wF.type = 'lowpass'; wF.frequency.value = 800; wF.Q.value = 10;
  const wDst= _distort(AC, 0.55);
  const wG  = AC.createGain();
  wLFO.connect(wLG); wLG.connect(wF.frequency);
  wO.connect(wDst); wDst.connect(wF); wF.connect(wG); wG.connect(masterGain);
  wG.gain.setValueAtTime(0, t + wDelay);
  wG.gain.linearRampToValueAtTime(0.7, t + wDelay + 0.02);
  wG.gain.exponentialRampToValueAtTime(0.001, t + wDelay + beatSec * 4);
  wO.start(t + wDelay); wLFO.start(t + wDelay);
  wO.stop(t + wDelay + beatSec * 4 + 0.1); wLFO.stop(t + wDelay + beatSec * 4 + 0.1);
  nodes.push(wO, wLFO, wLG, wF, wDst, wG);

  return nodes;
}

/* VOCAL TRIGGER — plays loaded buffer at specified time */
function _triggerVocal(AC, t, audioBuffer, params, masterGain) {
  if (!audioBuffer) return [];
  const { gain = 0.9, pitch = 0, reverse = false } = params;
  const src = AC.createBufferSource();
  src.buffer = audioBuffer;
  src.playbackRate.value = Math.pow(2, pitch / 12) * (reverse ? -1 : 1);
  const g = AC.createGain(); g.gain.value = gain;
  src.connect(g); g.connect(masterGain);
  src.start(t);
  return [src, g];
}

/* ── MOUNT ──────────────────────────────────────────────── */
function mount(instanceId, sBus, audio, config = {}) {
  const gBus = KERNEL.bus;

  /* Stage params */
  const params = {
    bpm:         config.bpm         || KERNEL.clock.BPM,
    freq:        config.freq        || 55,
    drive:       config.drive       || 0.6,
    tensionDur:  config.tensionDur  || 4.0,
    slopeDur:    config.slopeDur    || 2.0,
    buildDur:    config.buildDur    || 4.0,
    tensionIntensity: config.tensionIntensity || 0.6,
    slopeDensity:     config.slopeDensity     || 0.7,
    wobbleFreq:  config.wobbleFreq  || 110,
    wobbleCutoff:config.wobbleCutoff|| 600,
    wobbleRes:   config.wobbleRes   || 8,
    wobbleRate:  config.wobbleRate  || 6,
    wobbleDepth: config.wobbleDepth || 800,
    vocalGain:   config.vocalGain   || 0.9,
    vocalPitch:  config.vocalPitch  || 0,
    vocalStage:  config.vocalStage  || 'build', /* tension|slope|build|drop|after */
    vocalOffset: config.vocalOffset || 0,      /* seconds offset within stage */
  };

  /* Loaded vocal buffer */
  let _vocalBuffer = null;
  let _vocalName   = null;

  /* Running state */
  let _running     = false;
  let _activeNodes = [];

  /* Master gain for the whole sequence */
  let _masterGain  = null;

  function _getMasterGain() {
    const AC = audio.boot();
    if (!_masterGain || _masterGain.context !== AC) {
      _masterGain = AC.createGain();
      _masterGain.gain.value = 0.85;
      audio.send(_masterGain, false, false, true);
    }
    return _masterGain;
  }

  function _stopAll() {
    _activeNodes.forEach(n => { try { if (n.stop) n.stop(0); } catch(e) {} });
    _activeNodes = [];
    _running = false;
    sBus.publish('org:state-sync', { running: false });
  }

  function _fire() {
    if (_running) { _stopAll(); return; }
    const AC  = audio.boot();
    const mg  = _getMasterGain();
    const bpm = params.bpm || KERNEL.clock.BPM;
    let   t   = AC.currentTime + 0.05;
    const nodes = [];

    /* Stage timing */
    const stageStart = {
      tension: t,
      slope:   t + params.tensionDur,
      build:   t + params.tensionDur + params.slopeDur,
      drop:    t + params.tensionDur + params.slopeDur + params.buildDur,
      after:   t + params.tensionDur + params.slopeDur + params.buildDur + 0.1,
    };

    /* Fire each stage */
    nodes.push(..._tension(AC, stageStart.tension, params.tensionDur, { freq: params.freq * 2, intensity: params.tensionIntensity }, mg));
    nodes.push(..._slope(  AC, stageStart.slope,   params.slopeDur,   { density: params.slopeDensity, bpm }, mg));
    nodes.push(..._build(  AC, stageStart.build,   params.buildDur,   { freq: params.wobbleFreq, cutoff: params.wobbleCutoff, res: params.wobbleRes, rate: params.wobbleRate, depth: params.wobbleDepth }, mg));
    nodes.push(..._drop(   AC, stageStart.drop,    { freq: params.freq, drive: params.drive, bpm }, mg));

    /* Vocal */
    if (_vocalBuffer) {
      const vocalT = stageStart[params.vocalStage] + params.vocalOffset;
      nodes.push(..._triggerVocal(AC, vocalT, _vocalBuffer, { gain: params.vocalGain, pitch: params.vocalPitch }, mg));
    }

    _activeNodes = nodes;
    _running = true;

    const totalDur = params.tensionDur + params.slopeDur + params.buildDur + 6;
    sBus.publish('org:state-sync', {
      running: true,
      stageTimings: stageStart,
      totalDur,
      bpm,
      vocalLoaded: !!_vocalBuffer,
      vocalName: _vocalName,
    });

    /* Broadcast stage events for UI progress bar */
    Object.entries(stageStart).forEach(([stage, time]) => {
      const delay = (time - AC.currentTime) * 1000;
      setTimeout(() => {
        if (_running) sBus.publish('org:stage-active', { stage });
        gBus.publish('bass-drop:stage', { stage, instanceId });
      }, Math.max(0, delay));
    });

    /* Auto-stop after sequence */
    setTimeout(() => {
      _running = false;
      sBus.publish('org:state-sync', { running: false });
    }, totalDur * 1000);
  }

  /* ── UI hooks ── */
  const _unsubs = [
    gBus.subscribe('ui:fire:' + instanceId, _fire),
    gBus.subscribe('ui:stop:' + instanceId, _stopAll),
    gBus.subscribe('ui:config-change:' + instanceId, ({ key, value }) => {
      if (key in params) {
        params[key] = value;
        if (key === 'bpm') KERNEL.clock.BPM = value;
      }
    }),
    gBus.subscribe('ui:load-vocal:' + instanceId, ({ arrayBuffer, name }) => {
      if (!arrayBuffer) return;
      const AC = audio.boot();
      AC.decodeAudioData(arrayBuffer.slice(0)).then(ab => {
        _vocalBuffer = ab;
        _vocalName   = name;
        sBus.publish('org:vocal-loaded', { name, duration: ab.duration });
      }).catch(e => KERNEL.fault('ASSET_002', instanceId, `vocal decode failed: ${e.message}`));
    }),

    /* Accept audio drops directly */
    gBus.subscribe('intake:file', result => {
      if (result.id !== 'audio:sample') return;
      gBus.publish('ui:load-vocal:' + instanceId, { arrayBuffer: result.arrayBuffer, name: result.name });
    }),

    /* Receive BPM updates */
    gBus.subscribe('kernel:bpm-change', ({ BPM }) => { params.bpm = BPM; }),
  ];

  /* Initial state push */
  setTimeout(() => {
    sBus.publish('org:state-sync', {
      running: false,
      params: { ...params },
      vocalLoaded: !!_vocalBuffer,
      vocalName: _vocalName,
    });
  }, 50);

  KERNEL.registry.register({
    instanceId, id: 'eravos.bass-drop-builder', label: 'Bass Drop Builder',
    provides: ['capability.audio_out'],
    requires: ['capability.audio_context'],
    permissions: ['audio_out', 'bus_publish', 'bus_subscribe'],
    hooks: [
      { hook_id: 'drop.hook.fire',       direction: 'in',  event_type: 'ui:fire',           contract_version: '1.0.0' },
      { hook_id: 'drop.hook.vocal-in',   direction: 'in',  event_type: 'audio:buffer',      contract_version: '1.0.0' },
      { hook_id: 'drop.hook.stage-out',  direction: 'out', event_type: 'bass-drop:stage',   contract_version: '1.0.0' },
    ],
  });

  return {
    unmount() { _stopAll(); _unsubs.forEach(u => u()); KERNEL.registry.unregister(instanceId); },
    fire: _fire, stop: _stopAll,
  };
}

return { mount };
})();
