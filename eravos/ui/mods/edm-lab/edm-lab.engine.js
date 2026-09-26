/* ═══════════════════════════════════════════════════════════
   ERAVOS EDM LAB ENGINE  v2.0.0
   id: eravos.edm-lab

   Three concurrent engines:
     BASS    — oscillator + LFO filter, plays continuously
     RHYTHM  — density-painted UKG kit, internal clock
     TENSION — harmonic dissonance stack, filter squeeze

   Drop trigger fires all three simultaneously with impact.
   State published to UI via sBus for visualisation.
   ═══════════════════════════════════════════════════════════ */

window.EDMLabEngine = (() => {
'use strict';

/* ── Waveshaper distortion ──────────────────────────────── */
function _dist(AC, amt = 0.5) {
  const s = AC.createWaveShaper();
  const n = 256, c = new Float32Array(n), k = amt * 100;
  for (let i = 0; i < n; i++) { const x = (i*2)/n-1; c[i]=((Math.PI+k)*x)/(Math.PI+k*Math.abs(x)); }
  s.curve = c; s.oversample = '4x'; return s;
}

/* ═══════════════════════════════════════════════════════
   BASS ENGINE
   Continuous oscillator + resonant filter controlled by LFO.
   Parameters: freq, cutoff, resonance, lfoRate, lfoDepth,
               drive, waveform, subLevel.
   Publishes filter position every frame for visualisation.
═══════════════════════════════════════════════════════ */
function BassEngine(AC, masterOut) {
  let _running = false;
  let _nodes = {};
  let _params = { freq:55, cutoff:600, res:8, lfoRate:4, lfoDepth:800, drive:0.5, wave:'sawtooth', subLevel:0.6 };
  let _filterPos = 0.5; /* 0-1 for UI */
  let _rafId = null;

  function start() {
    if (_running) return;
    _running = true;

    const o1  = AC.createOscillator(); o1.type = _params.wave; o1.frequency.value = _params.freq;
    const o2  = AC.createOscillator(); o2.type = _params.wave; o2.frequency.value = _params.freq * 1.006;
    const sub = AC.createOscillator(); sub.type = 'sine';      sub.frequency.value = _params.freq * 0.5;
    const lfo = AC.createOscillator(); lfo.type = 'sine';      lfo.frequency.value = _params.lfoRate;
    const lfoG = AC.createGain();       lfoG.gain.value = _params.lfoDepth;
    const filt = AC.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = _params.cutoff; filt.Q.value = _params.res;
    const dist = _dist(AC, _params.drive);
    const gMain = AC.createGain(); gMain.gain.value = 0.7;
    const gSub  = AC.createGain(); gSub.gain.value  = _params.subLevel * 0.6;

    lfo.connect(lfoG); lfoG.connect(filt.frequency);
    o1.connect(dist); o2.connect(dist); dist.connect(filt); filt.connect(gMain);
    sub.connect(gSub);
    gMain.connect(masterOut); gSub.connect(masterOut);

    [o1, o2, sub, lfo].forEach(n => n.start());
    _nodes = { o1, o2, sub, lfo, lfoG, filt, dist, gMain, gSub };

    /* Track filter position for UI */
    function trackFilter() {
      if (!_running) return;
      /* filt.frequency is modulated — read approximate position */
      const min = Math.max(20, _params.cutoff - _params.lfoDepth);
      const max = Math.min(20000, _params.cutoff + _params.lfoDepth);
      /* Smooth approximation using AC time */
      const phase = (AC.currentTime * _params.lfoRate * Math.PI * 2) % (Math.PI * 2);
      const raw = _params.cutoff + Math.sin(phase) * _params.lfoDepth;
      _filterPos = Math.max(0, Math.min(1, (raw - 20) / (20000 - 20)));
      _rafId = requestAnimationFrame(trackFilter);
    }
    trackFilter();
  }

  function stop() {
    if (!_running) return;
    _running = false;
    cancelAnimationFrame(_rafId);
    Object.values(_nodes).forEach(n => { try { if (n.stop) n.stop(0); n.disconnect(); } catch(e){} });
    _nodes = {};
  }

  function set(key, val) {
    _params[key] = val;
    if (!_running) return;
    const { o1, o2, sub, lfo, lfoG, filt, dist, gSub } = _nodes;
    if (key === 'freq'     && o1) { o1.frequency.value = val; o2.frequency.value = val*1.006; sub.frequency.value = val*0.5; }
    if (key === 'cutoff'   && filt) filt.frequency.setTargetAtTime(val, AC.currentTime, 0.02);
    if (key === 'res'      && filt) filt.Q.setTargetAtTime(val, AC.currentTime, 0.02);
    if (key === 'lfoRate'  && lfo) lfo.frequency.setTargetAtTime(val, AC.currentTime, 0.02);
    if (key === 'lfoDepth' && lfoG) lfoG.gain.setTargetAtTime(val, AC.currentTime, 0.02);
    if (key === 'subLevel' && gSub) gSub.gain.setTargetAtTime(val * 0.6, AC.currentTime, 0.02);
  }

  function impact(t) {
    /* Hard filter close → snap open on the drop */
    const { filt } = _nodes; if (!filt) return;
    filt.frequency.setValueAtTime(80, t);
    filt.frequency.exponentialRampToValueAtTime(_params.cutoff * 3, t + 0.04);
    filt.frequency.exponentialRampToValueAtTime(_params.cutoff, t + 0.4);
  }

  return { start, stop, set, impact, get filterPos() { return _filterPos; }, get params() { return _params; }, get running() { return _running; } };
}

/* ═══════════════════════════════════════════════════════
   RHYTHM ENGINE
   Internal clock. Density map: 8 kit pieces × 32 positions.
   Each cell has a density value 0–1.
   On each 16th note, fires if Math.random() < density[track][step].
   This produces probabilistic rhythm, not deterministic steps.
   Publishes beat events for UI cursor.
═══════════════════════════════════════════════════════ */
const KIT_NAMES = ['KICK','SNARE','GALLOP','GALLOP2','OPEN HAT','CLAP','808','RISER'];
const KIT_COLORS = ['#00ff88','#00ff88','#00d4ff','#00d4ff','#6a88a8','#00ff88','#ff2266','#aa44ff'];

function RhythmEngine(AC, masterOut, bus) {
  let _running = false;
  let _step    = 0;
  let _timer   = null;
  let _bpm     = 128;
  const STEPS  = 32;
  const TRACKS = 8;

  /* Density map — float32 0-1 per cell */
  const density = Array.from({ length: TRACKS }, (_, ti) => {
    const row = new Float32Array(STEPS).fill(0);
    /* Default patterns */
    if (ti === 0) { row[0]=.9; row[8]=.9; row[16]=.9; row[24]=.9; }
    if (ti === 1) { row[4]=.85; row[12]=.85; row[20]=.85; row[28]=.85; }
    if (ti === 2) { [0,2,3,6,8,10,11,14,16,18,19,22,24,26,27,30].forEach(s=>row[s]=.7); }
    if (ti === 3) { [1,5,9,13,17,21,25,29].forEach(s=>row[s]=.4); }
    return row;
  });

  function _fireKit(track, vel) {
    const t = AC.currentTime + 0.01;
    switch(track) {
      case 0: { /* KICK */
        const g=AC.createGain(),o=AC.createOscillator(); o.type='sine'; o.frequency.setValueAtTime(160,t); o.frequency.exponentialRampToValueAtTime(40,t+0.18); g.gain.setValueAtTime(vel*1.2,t); g.gain.exponentialRampToValueAtTime(.001,t+0.22); o.connect(g); g.connect(masterOut); o.start(t); o.stop(t+.25); break; }
      case 1: { /* SNARE */
        const nb=AC.createBufferSource(),buf=AC.createBuffer(1,Math.ceil(AC.sampleRate*.18),AC.sampleRate),d=buf.getChannelData(0); for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1; nb.buffer=buf; const nf=AC.createBiquadFilter(); nf.type='bandpass'; nf.frequency.value=2000; nf.Q.value=0.9; const ng=AC.createGain(); ng.gain.setValueAtTime(vel*.85,t); ng.gain.exponentialRampToValueAtTime(.001,t+.18); nb.connect(nf); nf.connect(ng); ng.connect(masterOut); nb.start(t); nb.stop(t+.2); break; }
      case 2: case 3: { /* GALLOP HAT */
        const nb=AC.createBufferSource(),buf=AC.createBuffer(1,Math.ceil(AC.sampleRate*.03),AC.sampleRate),d=buf.getChannelData(0); for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1; nb.buffer=buf; const nf=AC.createBiquadFilter(); nf.type='highpass'; nf.frequency.value=9000; const ng=AC.createGain(); ng.gain.setValueAtTime(vel*(track===2?.48:.3),t); ng.gain.exponentialRampToValueAtTime(.001,t+.03); nb.connect(nf); nf.connect(ng); ng.connect(masterOut); nb.start(t); nb.stop(t+.04); break; }
      case 4: { /* OPEN HAT */
        const nb=AC.createBufferSource(),buf=AC.createBuffer(1,Math.ceil(AC.sampleRate*.34),AC.sampleRate),d=buf.getChannelData(0); for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1; nb.buffer=buf; const nf=AC.createBiquadFilter(); nf.type='highpass'; nf.frequency.value=7000; const ng=AC.createGain(); ng.gain.setValueAtTime(vel*.44,t); ng.gain.exponentialRampToValueAtTime(.001,t+.34); nb.connect(nf); nf.connect(ng); ng.connect(masterOut); nb.start(t); nb.stop(t+.38); break; }
      case 5: { /* CLAP */
        [0,.01,.022].forEach(d=>{ const nb=AC.createBufferSource(),buf=AC.createBuffer(1,Math.ceil(AC.sampleRate*.1),AC.sampleRate),dd=buf.getChannelData(0); for(let i=0;i<dd.length;i++)dd[i]=Math.random()*2-1; nb.buffer=buf; const nf=AC.createBiquadFilter(); nf.type='bandpass'; nf.frequency.value=1500; nf.Q.value=1.1; const ng=AC.createGain(); ng.gain.setValueAtTime(vel*.68,t+d); ng.gain.exponentialRampToValueAtTime(.001,t+d+.1); nb.connect(nf); nf.connect(ng); ng.connect(masterOut); nb.start(t+d); nb.stop(t+d+.12); }); break; }
      case 6: { /* 808 */
        const o=AC.createOscillator(); o.type='sine'; o.frequency.setValueAtTime(110,t); o.frequency.exponentialRampToValueAtTime(55*.85,t+.06); const g=AC.createGain(); g.gain.setValueAtTime(vel*.95,t); g.gain.exponentialRampToValueAtTime(.001,t+.6); const clip=AC.createWaveShaper(); const cv=new Float32Array(256); for(let i=0;i<256;i++){const x=(i*2)/256-1;cv[i]=Math.max(-.7,Math.min(.7,x*2))/.7;} clip.curve=cv; o.connect(clip); clip.connect(g); g.connect(masterOut); o.start(t); o.stop(t+.65); break; }
      case 7: { /* RISER TEXTURE */
        const o=AC.createOscillator(); o.type='sawtooth'; o.frequency.value=440+Math.random()*220; const f=AC.createBiquadFilter(); f.type='lowpass'; f.frequency.value=2000; const g=AC.createGain(); g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(vel*.15,t+.04); g.gain.exponentialRampToValueAtTime(.001,t+.12); o.connect(f); f.connect(g); g.connect(masterOut); o.start(t); o.stop(t+.15); break; }
    }
  }

  /* PrecisionClock replaces setTimeout — audio-thread scheduling */
  let _pclock = null;

  async function _bootClock() {
    if (_pclock) return;
    _pclock = new PrecisionClock(AC);
    await _pclock.boot();
    _pclock.onStep = (stepIdx, t) => {
      /* t is a precise future AudioContext time — schedule synthesis there */
      for (let ti = 0; ti < TRACKS; ti++) {
        const d = density[ti][stepIdx];
        if (d > 0 && Math.random() < d) {
          _fireKitAt(ti, 0.7 + Math.random() * 0.3, t);
        }
      }
      bus.publish('edm:rhythm-step', {
        step: stepIdx,
        density: Array.from({ length: TRACKS }, (_, ti) => density[ti][stepIdx]),
      });
      _step = stepIdx;
    };
  }

  /* _fireKitAt: same as _fireKit but uses precise time t instead of AC.currentTime+0.01 */
  function _fireKitAt(track, vel, t) {
    switch(track) {
      case 0: { const g=AC.createGain(),o=AC.createOscillator(); o.type='sine'; o.frequency.setValueAtTime(160,t); o.frequency.exponentialRampToValueAtTime(40,t+0.18); g.gain.setValueAtTime(vel*1.2,t); g.gain.exponentialRampToValueAtTime(.001,t+0.22); o.connect(g); g.connect(masterOut); o.start(t); o.stop(t+.25); break; }
      case 1: { const nb=AC.createBufferSource(),buf=AC.createBuffer(1,Math.ceil(AC.sampleRate*.18),AC.sampleRate),d=buf.getChannelData(0); for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1; nb.buffer=buf; const nf=AC.createBiquadFilter(); nf.type='bandpass'; nf.frequency.value=2000; nf.Q.value=0.9; const ng=AC.createGain(); ng.gain.setValueAtTime(vel*.85,t); ng.gain.exponentialRampToValueAtTime(.001,t+.18); nb.connect(nf); nf.connect(ng); ng.connect(masterOut); nb.start(t); nb.stop(t+.2); break; }
      case 2: case 3: { const nb=AC.createBufferSource(),buf=AC.createBuffer(1,Math.ceil(AC.sampleRate*.03),AC.sampleRate),d=buf.getChannelData(0); for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1; nb.buffer=buf; const nf=AC.createBiquadFilter(); nf.type='highpass'; nf.frequency.value=9000; const ng=AC.createGain(); ng.gain.setValueAtTime(vel*(track===2?.48:.3),t); ng.gain.exponentialRampToValueAtTime(.001,t+.03); nb.connect(nf); nf.connect(ng); ng.connect(masterOut); nb.start(t); nb.stop(t+.04); break; }
      case 4: { const nb=AC.createBufferSource(),buf=AC.createBuffer(1,Math.ceil(AC.sampleRate*.34),AC.sampleRate),d=buf.getChannelData(0); for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1; nb.buffer=buf; const nf=AC.createBiquadFilter(); nf.type='highpass'; nf.frequency.value=7000; const ng=AC.createGain(); ng.gain.setValueAtTime(vel*.44,t); ng.gain.exponentialRampToValueAtTime(.001,t+.34); nb.connect(nf); nf.connect(ng); ng.connect(masterOut); nb.start(t); nb.stop(t+.38); break; }
      case 5: { [0,.01,.022].forEach(d=>{ const nb=AC.createBufferSource(),buf=AC.createBuffer(1,Math.ceil(AC.sampleRate*.1),AC.sampleRate),dd=buf.getChannelData(0); for(let i=0;i<dd.length;i++)dd[i]=Math.random()*2-1; nb.buffer=buf; const nf=AC.createBiquadFilter(); nf.type='bandpass'; nf.frequency.value=1500; nf.Q.value=1.1; const ng=AC.createGain(); ng.gain.setValueAtTime(vel*.68,t+d); ng.gain.exponentialRampToValueAtTime(.001,t+d+.1); nb.connect(nf); nf.connect(ng); ng.connect(masterOut); nb.start(t+d); nb.stop(t+d+.12); }); break; }
      case 6: { const o=AC.createOscillator(); o.type='sine'; o.frequency.setValueAtTime(110,t); o.frequency.exponentialRampToValueAtTime(55*.85,t+.06); const g=AC.createGain(); g.gain.setValueAtTime(vel*.95,t); g.gain.exponentialRampToValueAtTime(.001,t+.6); const clip=AC.createWaveShaper(); const cv=new Float32Array(256); for(let i=0;i<256;i++){const x=(i*2)/256-1;cv[i]=Math.max(-.7,Math.min(.7,x*2))/.7;} clip.curve=cv; o.connect(clip); clip.connect(g); g.connect(masterOut); o.start(t); o.stop(t+.65); break; }
      case 7: { const o=AC.createOscillator(); o.type='sawtooth'; o.frequency.value=440+Math.random()*220; const f=AC.createBiquadFilter(); f.type='lowpass'; f.frequency.value=2000; const g=AC.createGain(); g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(vel*.15,t+.04); g.gain.exponentialRampToValueAtTime(.001,t+.12); o.connect(f); f.connect(g); g.connect(masterOut); o.start(t); o.stop(t+.15); break; }
    }
  }

  async function start() {
    if (_running) return;
    _running = true; _step = 0;
    await _bootClock();
    _pclock.start(_bpm, STEPS, 4, 0);
  }
  function stop() {
    _running = false;
    if (_pclock) _pclock.stop();
    _step = 0;
  }

  function setDensity(track, step, val) {
    if (density[track]) density[track][step] = Math.max(0, Math.min(1, val));
  }

  function getDensityMap() {
    return Array.from({ length: TRACKS }, (_, ti) => Array.from(density[ti]));
  }

  function paintBrush(track, step, radius, val) {
    /* Paint with falloff around (track, step) */
    for (let ti = Math.max(0, track-1); ti <= Math.min(TRACKS-1, track+1); ti++) {
      for (let si = Math.max(0, step-radius); si <= Math.min(STEPS-1, step+radius); si++) {
        const dist = Math.hypot(ti-track, si-step);
        const falloff = Math.max(0, 1 - dist / (radius + 1));
        density[ti][si] = Math.max(0, Math.min(1, density[ti][si] + val * falloff * 0.8));
      }
    }
  }

  function setBPM(bpm) { _bpm = Math.max(60, Math.min(220, bpm)); if (_pclock) _pclock.setBPM(_bpm); }

  return { start, stop, setDensity, getDensityMap, paintBrush, setBPM,
           get running() { return _running; }, get step() { return _step; },
           KIT_NAMES, KIT_COLORS, STEPS, TRACKS };
}

/* ═══════════════════════════════════════════════════════
   TENSION ENGINE
   Harmonic dissonance stack. Consonance=0 → Dissonance=100.
   Overtones spread apart as tension increases.
   Publishes overtone positions for visualisation.
═══════════════════════════════════════════════════════ */
function TensionEngine(AC, masterOut) {
  let _running  = false;
  let _tension  = 0; /* 0-100 */
  let _nodes    = [];
  let _masterG  = null;
  let _baseFreq = 110;

  /* Interval table: tension 0=consonant, 100=dissonant cluster */
  function _intervals(t) {
    /* t 0-1. At 0: octaves/fifths. At 1: semitone clusters. */
    const consonant = [1, 1.5, 2, 3, 4];           /* root, 5th, oct, oct+5th, 2oct */
    const dissonant = [1, 1.059, 1.122, 1.189, 1.414]; /* root, m2, M2, m3, tritone */
    return consonant.map((c, i) => c * (1-t) + dissonant[i] * t);
  }

  function start() {
    if (_running) return;
    _running = true;
    _masterG = AC.createGain(); _masterG.gain.value = 0;
    _masterG.connect(masterOut);
    _rebuild();
  }

  function _rebuild() {
    _nodes.forEach(n => { try { if(n.stop) n.stop(0); n.disconnect(); } catch(e){} });
    _nodes = [];
    if (!_running) return;

    const ratios = _intervals(_tension / 100);
    ratios.forEach((r, i) => {
      const o   = AC.createOscillator(); o.type = 'sawtooth';
      const lfo = AC.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.2 + i * 0.07;
      const lg  = AC.createGain(); lg.gain.value = _baseFreq * r * 0.003;
      const f   = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 800 - i * 80;
      const g   = AC.createGain(); g.gain.value = 0.12 / (i + 1);
      o.frequency.value = _baseFreq * r;
      lfo.connect(lg); lg.connect(o.frequency);
      o.connect(f); f.connect(g); g.connect(_masterG);
      [o, lfo].forEach(n => n.start());
      _nodes.push(o, lfo, lg, f, g);
    });
  }

  function setTension(val) {
    _tension = Math.max(0, Math.min(100, val));
    _rebuild();
  }

  function setLevel(val) {
    if (_masterG) _masterG.gain.setTargetAtTime(val * 0.4, AC.currentTime, 0.05);
  }

  function setBaseFreq(f) { _baseFreq = f; if (_running) _rebuild(); }

  function stop() {
    _running = false;
    _nodes.forEach(n => { try { if(n.stop) n.stop(0); n.disconnect(); } catch(e){} });
    _nodes = [];
    if (_masterG) { _masterG.gain.setTargetAtTime(0, AC.currentTime, 0.1); }
  }

  function impact(t) {
    /* Tension peaks then releases */
    if (!_masterG) return;
    _masterG.gain.setValueAtTime(_masterG.gain.value, t);
    _masterG.gain.linearRampToValueAtTime(0.6, t + 0.02);
    _masterG.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
  }

  function getOvertones() {
    return _intervals(_tension / 100).map((r, i) => ({
      freq:      _baseFreq * r,
      ratio:     r,
      amplitude: 1 / (i + 1),
    }));
  }

  return { start, stop, setTension, setLevel, setBaseFreq, impact, getOvertones,
           get tension() { return _tension; }, get running() { return _running; } };
}

/* ═══════════════════════════════════════════════════════
   MOUNT
═══════════════════════════════════════════════════════ */
function mount(instanceId, sBus, audio, config = {}) {
  const gBus = KERNEL.bus;

  const AC = audio.boot();

  /* Shared master gain for all three engines */
  const masterGain = AC.createGain(); masterGain.gain.value = 0.85;
  audio.send(masterGain, false, false, true);

  const bass    = BassEngine(AC, masterGain);
  const rhythm  = RhythmEngine(AC, masterGain, gBus);
  const tension = TensionEngine(AC, masterGain);

  let _bpm = KERNEL.clock.BPM;
  rhythm.setBPM(_bpm);

  /* State sync loop — 30fps */
  let _syncTimer = setInterval(() => {
    sBus.publish('org:state-sync', {
      bass: {
        running:   bass.running,
        filterPos: bass.filterPos,
        params:    { ...bass.params },
      },
      rhythm: {
        running:    rhythm.running,
        step:       rhythm.step,
        densityMap: rhythm.getDensityMap(),
      },
      tension: {
        running:   tension.running,
        value:     tension.tension,
        overtones: tension.getOvertones(),
      },
      bpm: _bpm,
    });
  }, 33);

  /* ── Drop trigger ── */
  function _drop() {
    const t = AC.currentTime + 0.05;
    /* Impact synthesis */
    const subO = AC.createOscillator(); subO.type = 'sine';
    const subG = AC.createGain();
    subO.frequency.setValueAtTime(80, t); subO.frequency.exponentialRampToValueAtTime(30, t + .5);
    subG.gain.setValueAtTime(1.4, t); subG.gain.exponentialRampToValueAtTime(.001, t + .65);
    subO.connect(subG); subG.connect(masterGain); subO.start(t); subO.stop(t + .7);

    const nb = AC.createBufferSource();
    const buf = AC.createBuffer(1, Math.ceil(AC.sampleRate * .015), AC.sampleRate);
    const d = buf.getChannelData(0); for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
    nb.buffer = buf;
    const nf = AC.createBiquadFilter(); nf.type='highpass'; nf.frequency.value=8000;
    const ng = AC.createGain(); ng.gain.setValueAtTime(1.1, t); ng.gain.exponentialRampToValueAtTime(.001, t+.015);
    nb.connect(nf); nf.connect(ng); ng.connect(masterGain); nb.start(t); nb.stop(t+.02);

    bass.impact(t);
    tension.impact(t);

    gBus.publish('edm:drop-fired', { timestamp: t });
    sBus.publish('org:drop-fired', { timestamp: t });
  }

  /* ── UI subscriptions ── */
  const _unsubs = [
    /* Bass */
    gBus.subscribe('ui:bass-toggle:' + instanceId, () => { bass.running ? bass.stop() : bass.start(); }),
    gBus.subscribe('ui:bass-param:' + instanceId,  ({ key, val }) => bass.set(key, val)),

    /* Rhythm */
    gBus.subscribe('ui:rhythm-toggle:' + instanceId, () => { rhythm.running ? rhythm.stop() : rhythm.start(); }),
    gBus.subscribe('ui:rhythm-paint:' + instanceId,  ({ track, step, radius, val }) => rhythm.paintBrush(track, step, radius, val)),
    gBus.subscribe('ui:rhythm-clear:' + instanceId,  ({ track }) => { if (track !== undefined) { for(let s=0;s<rhythm.STEPS;s++) rhythm.setDensity(track,s,0); } }),
    gBus.subscribe('ui:rhythm-preset:' + instanceId, ({ preset }) => _loadRhythmPreset(preset)),

    /* Tension */
    gBus.subscribe('ui:tension-toggle:' + instanceId, () => { tension.running ? tension.stop() : tension.start(); }),
    gBus.subscribe('ui:tension-val:' + instanceId,    ({ val }) => tension.setTension(val)),
    gBus.subscribe('ui:tension-level:' + instanceId,  ({ val }) => tension.setLevel(val)),
    gBus.subscribe('ui:tension-freq:' + instanceId,   ({ val }) => tension.setBaseFreq(val)),

    /* Drop + BPM */
    gBus.subscribe('ui:drop:' + instanceId, _drop),
    gBus.subscribe('ui:bpm:' + instanceId, ({ val }) => { _bpm = val; KERNEL.clock.BPM = val; rhythm.setBPM(val); }),
  ];

  function _loadRhythmPreset(preset) {
    const map = {
      'tranki': [[0,8,16,24],[4,12,20,28],[0,2,3,6,8,10,11,14],[1,5,9,13],[],[4,12],[],[],],
      'drop':   [[0,4,8,10,12],[4,12,28],[0,1,2,3,4,5,6,7],[8,16,24],[2,6,10,14],[4,12],[0,16],[],],
      'build':  [[0,8,16],[4,20],[0,2,4,6,8,10,12,14,16,18,20,22,24,26,28,30],[2,10,18,26],[],[],[0,8,16,24],[7,15,23,31],],
    };
    const pat = map[preset];
    if (!pat) return;
    for (let ti = 0; ti < rhythm.TRACKS; ti++) {
      for (let si = 0; si < rhythm.STEPS; si++) rhythm.setDensity(ti, si, 0);
      (pat[ti] || []).forEach(s => rhythm.setDensity(ti, s, 0.85));
    }
    sBus.publish('org:density-reset', { densityMap: rhythm.getDensityMap() });
  }

  KERNEL.registry.register({
    instanceId, id: 'eravos.edm-lab', label: 'EDM Lab',
    provides: ['capability.audio_out'],
    requires: ['capability.audio_context'],
    permissions: ['audio_out', 'bus_publish', 'bus_subscribe'],
    hooks: [
      { hook_id: 'edm.hook.audio_out',   direction: 'out', event_type: 'audio:signal',    contract_version: '1.0.0' },
      { hook_id: 'edm.hook.drop-out',    direction: 'out', event_type: 'edm:drop-fired',  contract_version: '1.0.0' },
      { hook_id: 'edm.hook.step-out',    direction: 'out', event_type: 'edm:rhythm-step', contract_version: '1.0.0' },
    ],
  });

  return {
    unmount() {
      clearInterval(_syncTimer);
      bass.stop(); rhythm.stop(); tension.stop();
      _unsubs.forEach(u => u());
      KERNEL.registry.unregister(instanceId);
    },
    bass, rhythm, tension, drop: _drop,
  };
}

return { mount };
})();
