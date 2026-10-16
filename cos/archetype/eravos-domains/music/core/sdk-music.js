/* ERAVOS music domain — sdk-music.js
 * Extends the domain-free OrganismSDK with everything music engines use: note / midi / theory / transport
 * contracts, audio + modulation hook builders, DSP helpers, worklet loading, the STD.fx shell, and a ctx
 * extension (ctx.ac, ctx.bpm, ctx.key, modBus, atAudioTime, onNote/onMidi/onKey/onTick/onPlay/onStop/onBpm, MIDI arm). */
(function (global) {
  'use strict';
  const SDK = global.OrganismSDK;
  const NOTE_SCHEMA = {
    type: 'object', required: ['target', 'note', 'velocity', 'time'],
    properties: {
      target: { type: 'string' }, note: { type: 'integer', minimum: 0, maximum: 127 },
      velocity: { type: 'number', minimum: 0, maximum: 1 }, time: { type: 'number' },
      duration: { type: 'number', minimum: 0 }, accent: { type: 'boolean' }, slide: { type: 'boolean' },
      freq: { type: 'number', minimum: 0 }, // xen: an exact (often irrational) frequency; `note` stays the nearest 12-TET key
    },
  };
  const MIDI_SCHEMA = { type: 'object', required: ['note', 'velocity', 'on'], properties: { note: { type: 'integer', minimum: 0, maximum: 127 }, velocity: { type: 'number', minimum: 0, maximum: 1 }, on: { type: 'boolean' } } };
  const THEORY_SCHEMA = { type: 'object', required: ['root', 'scale'], properties: { root: { type: 'integer', minimum: 0, maximum: 11 }, scale: { type: 'string' } } };
  const TICK_SCHEMA = { type: 'object', required: ['step16', 'time'], properties: { step16: { type: 'integer' }, time: { type: 'number' } } };
  const MUSIC_STD = {
    note_in: (hook_id) => ({ hook_id, hook_type: 'receiver', direction: 'in', wire_type: 'event_bus', event_type: 'note:trigger', contract_version: '2.0.0', schema: NOTE_SCHEMA, failure_mode: 'RUNTIME_002', intent: 'play notes addressed to this instance' }),
    note_out: (hook_id) => ({ hook_id, hook_type: 'emitter', direction: 'out', wire_type: 'event_bus', event_type: 'note:trigger', contract_version: '2.0.0', schema: NOTE_SCHEMA, failure_mode: 'RUNTIME_002', intent: 'emit notes to a target instrument' }),
    midi_in: (hook_id) => ({ hook_id, hook_type: 'receiver', direction: 'in', wire_type: 'event_bus', event_type: 'midi:note', contract_version: '1.0.0', schema: MIDI_SCHEMA, failure_mode: 'RUNTIME_002', intent: 'play from armed MIDI input' }),
    theory_in: (hook_id) => ({ hook_id, hook_type: 'receiver', direction: 'in', wire_type: 'event_bus', event_type: 'theory:key-change', contract_version: '1.0.0', schema: THEORY_SCHEMA, failure_mode: 'RUNTIME_002', intent: 'follow song key/scale' }),
    transport_in: (hook_id) => ({ hook_id, hook_type: 'receiver', direction: 'in', wire_type: 'event_bus', event_type: 'transport:tick|transport:play|transport:stop', contract_version: '1.0.0', schema: TICK_SCHEMA, failure_mode: 'RUNTIME_002', intent: 'follow the master transport' }),
    audio_out: (hook_id, port) => ({ hook_id, hook_type: 'emitter', direction: 'out', wire_type: 'audio', port: port || 'out', event_type: 'audio', contract_version: '2.0.0', schema: {}, failure_mode: 'PORT_001', intent: 'audio signal out (default route master)' }),
    audio_in: (hook_id, port, tap) => ({ hook_id, hook_type: 'receiver', direction: 'in', wire_type: 'audio', port: port || 'in', tap: !!tap, event_type: 'audio', contract_version: '2.0.0', schema: {}, failure_mode: 'PORT_001', intent: 'audio signal in' }),
    mod_in: (hook_id, key) => ({ hook_id, hook_type: 'receiver', direction: 'in', wire_type: 'modulation', port: 'mod.' + key, mod_key: key, event_type: 'modulation', contract_version: '2.0.0', schema: {}, failure_mode: 'PORT_001', intent: 'modulate ' + key }),
    mod_out: (hook_id, port) => ({ hook_id, hook_type: 'emitter', direction: 'out', wire_type: 'modulation', port: port || 'out', event_type: 'modulation', contract_version: '2.0.0', schema: {}, failure_mode: 'PORT_001', intent: 'control signal out' }),
  };
  const STD_FX_CONFIG = [
    { key: 'mix', type: 'number', default: 1, min: 0, max: 1, step: 0.01, label: 'Mix', group: 'IO' },
    { key: 'inGain', type: 'number', default: 0, min: -24, max: 24, step: 0.1, unit: 'dB', label: 'In', group: 'IO' },
    { key: 'outGain', type: 'number', default: 0, min: -24, max: 24, step: 0.1, unit: 'dB', label: 'Out', group: 'IO' },
    { key: 'bypass', type: 'boolean', default: false, label: 'Bypass', group: 'IO' },
  ];

  // ---------------------------------------------------------------- DSP helpers (shared; engines stay novel)
  const noiseCache = new WeakMap();
  const dsp = {
    mulberry32(seed) {
      let a = seed >>> 0;
      return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    },
    noise(ac, seconds, color) {
      let m = noiseCache.get(ac); if (!m) { m = {}; noiseCache.set(ac, m); }
      const k = (color || 'white') + (seconds || 2);
      if (m[k]) return m[k];
      const len = Math.floor(ac.sampleRate * (seconds || 2)), b = ac.createBuffer(1, len, ac.sampleRate), d = b.getChannelData(0);
      const r = dsp.mulberry32(1234 + len);
      let b0 = 0, b1 = 0, b2 = 0, last = 0;
      for (let i = 0; i < len; i++) {
        const w = r() * 2 - 1;
        if (color === 'pink') { b0 = 0.99765 * b0 + w * 0.0990460; b1 = 0.96300 * b1 + w * 0.2965164; b2 = 0.57000 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2; }
        else if (color === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
        else d[i] = w;
      }
      m[k] = b; return b;
    },
    noiseSource(ac, color, loop) { const s = ac.createBufferSource(); s.buffer = dsp.noise(ac, 2, color); s.loop = loop !== false; return s; },
    curve(kind, amount, n) {
      n = n || 4096; const c = new Float32Array(n); const k = amount === undefined ? 0.5 : amount;
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * 2 - 1;
        let y;
        switch (kind) {
          case 'hard': { const g = 1 + k * 20; y = Math.max(-1, Math.min(1, x * g)); break; }
          case 'tube': { const g = 1 + k * 10; const xa = x * g; y = xa >= 0 ? 1 - Math.exp(-xa) : -(1 - Math.exp(xa * 1.4)) / 1.1; break; }
          case 'asym': { const g = 1 + k * 12; y = Math.tanh(x * g + k * 0.3) - Math.tanh(k * 0.3); break; }
          case 'fold': { const g = 1 + k * 8; y = Math.sin(x * g * Math.PI / 2); break; }
          case 'sinfold': { const folds = k; y = Math.sin(x * (1 + folds) * Math.PI / 2); break; }
          // 'tape': unity gain for small signals (slope 1 at 0) that rounds peaks off toward 1/g — the curve for anything
          // INSIDE a feedback loop: loop gain = the feedback knob exactly, so a loop below 1 always dies away (3.28)
          case 'tape': { const g = 1 + k * 4; y = Math.tanh(x * g) / g; break; }
          case 'abs': y = Math.abs(x); break;
          case 'crush': { const lv = Math.pow(2, Math.max(1, Math.round(k))) / 2; y = Math.round(x * lv) / lv; break; }
          default: { const g = 1 + k * 15; y = Math.tanh(x * g) / Math.tanh(g); }
        }
        c[i] = y;
      }
      return c;
    },
    curveRms(curve) { // RMS of a full-scale sine through the curve → auto-level
      let s = 0; const N = 512;
      for (let i = 0; i < N; i++) { const x = Math.sin(2 * Math.PI * i / N); const idx = Math.round((x + 1) / 2 * (curve.length - 1)); s += curve[idx] * curve[idx]; }
      return Math.sqrt(s / N);
    },
    dbToGain: (db) => Math.pow(10, db / 20),
    gainToDb: (g) => 20 * Math.log10(Math.max(1e-12, g)),
    setSmooth(param, v, ac, tau) { const t = ac.currentTime; try { param.cancelScheduledValues(t); param.setTargetAtTime(v, t, tau || 0.012); } catch (e) { param.value = v; } },
    adsr(param, t, o) { // o: {a,d,s,peak,base}
      const base = o.base || 0, peak = o.peak === undefined ? 1 : o.peak;
      param.cancelScheduledValues(t); param.setValueAtTime(base, t);
      param.linearRampToValueAtTime(peak, t + Math.max(0.001, o.a));
      param.setTargetAtTime(base + (peak - base) * o.s, t + Math.max(0.001, o.a), Math.max(0.002, o.d) / 3);
    },
    release(param, t, r, base) {
      if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(t); else param.cancelScheduledValues(t);
      param.setTargetAtTime(base || 0, t, Math.max(0.002, r) / 4);
    },
    equalPower(mix) { return { dry: Math.cos(mix * Math.PI / 2), wet: Math.sin(mix * Math.PI / 2) }; },
    hann(n) { const w = new Float32Array(n); for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1)); return w; },
    fft(re, im) { // in-place radix-2
      const n = re.length;
      for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
      for (let len = 2; len <= n; len <<= 1) {
        const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
        for (let i = 0; i < n; i += len) {
          let cr = 1, ci = 0;
          for (let j = 0; j < len / 2; j++) {
            const a = i + j, b = a + len / 2;
            const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
            re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
            const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
          }
        }
      }
    },
    peaks(buffer, n) {
      n = n || 1024; const out = new Float32Array(n * 2); const ch = buffer.numberOfChannels;
      const len = buffer.length, per = Math.max(1, Math.floor(len / n));
      const datas = []; for (let c = 0; c < ch; c++) datas.push(buffer.getChannelData(c));
      for (let i = 0; i < n; i++) {
        let mn = 0, mx = 0; const s = i * per, e = Math.min(len, s + per);
        for (let j = s; j < e; j++) for (let c = 0; c < ch; c++) { const v = datas[c][j]; if (v < mn) mn = v; if (v > mx) mx = v; }
        out[i * 2] = mn; out[i * 2 + 1] = mx;
      }
      return Array.from(out);
    },
    reverseBuffer(ac, buf) {
      const r = ac.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
      for (let c = 0; c < buf.numberOfChannels; c++) { const s = buf.getChannelData(c), d = r.getChannelData(c); for (let i = 0, n = s.length; i < n; i++) d[i] = s[n - 1 - i]; }
      return r;
    },
    onsets(buffer, sensitivity) { // spectral-flux onsets with adaptive threshold → seconds
      const sr = buffer.sampleRate, hop = 512, N = 1024, d = buffer.getChannelData(0);
      const frames = Math.max(0, Math.floor((d.length - N) / hop));
      const win = dsp.hann(N), prev = new Float32Array(N / 2), flux = new Float32Array(frames);
      const re = new Float32Array(N), im = new Float32Array(N);
      for (let f = 0; f < frames; f++) {
        for (let i = 0; i < N; i++) { re[i] = d[f * hop + i] * win[i]; im[i] = 0; }
        dsp.fft(re, im); let s = 0;
        for (let k = 0; k < N / 2; k++) { const m = Math.sqrt(re[k] * re[k] + im[k] * im[k]); const df = m - prev[k]; if (df > 0) s += df; prev[k] = m; }
        flux[f] = s;
      }
      const out = []; const w = 8; const mult = 1.2 + (1 - (sensitivity === undefined ? 0.4 : sensitivity)) * 2.5;
      let mx = 0; for (let i = 0; i < frames; i++) mx = Math.max(mx, flux[i]);
      let lastOn = -99;
      for (let f = 1; f < frames - 1; f++) {
        let mean = 0, c = 0; for (let j = Math.max(0, f - w); j <= Math.min(frames - 1, f + w); j++) { mean += flux[j]; c++; } mean /= c;
        if (flux[f] > mean * mult && flux[f] >= flux[f - 1] && flux[f] >= flux[f + 1] && flux[f] > mx * 0.05 && f - lastOn > 4) { out.push((f * hop) / sr); lastOn = f; }
      }
      return out;
    },
  };

  // Shared pitch-shift worklet (eravos.fx-pitch algorithm; reused internally by master-fx shimmer — amendment A-5)
  // two crossfaded read heads over a circular buffer; Hann windows sum to 1; ratio = 2^(st/12); latency ≈ window/2
  dsp.PITCH_WORKLET = `
class EravosPitch extends AudioWorkletProcessor {
  static get parameterDescriptors() { return [{ name: 'ratio', defaultValue: 1, minValue: 0.125, maxValue: 8 }, { name: 'window', defaultValue: 0.05, minValue: 0.01, maxValue: 0.2 }]; }
  constructor() { super(); this.N = 1 << 17; this.M = this.N - 1; this.buf = [new Float32Array(this.N), new Float32Array(this.N)]; this.w = 0; this.ph = 0; }
  read(b, pos) { const i = Math.floor(pos), f = pos - i; return b[i & this.M] * (1 - f) + b[(i + 1) & this.M] * f; }
  process(inputs, outputs, params) {
    const inp = inputs[0], out = outputs[0], n = out[0].length, R = params.ratio, W = params.window;
    for (let i = 0; i < n; i++) {
      const r = R.length > 1 ? R[i] : R[0], win = (W.length > 1 ? W[i] : W[0]) * sampleRate;
      for (let c = 0; c < 2; c++) { const src = inp[c] || inp[0]; this.buf[c][this.w] = src ? src[i] : 0; }
      this.ph += (1 - r) / win; this.ph -= Math.floor(this.ph);
      const p1 = this.ph, p2 = (this.ph + 0.5) % 1;
      const g1 = Math.sin(Math.PI * p1) ** 2, g2 = Math.sin(Math.PI * p2) ** 2;
      for (let c = 0; c < out.length; c++) {
        const b = this.buf[Math.min(c, 1)];
        out[c][i] = this.read(b, this.w - 2 - p1 * win) * g1 + this.read(b, this.w - 2 - p2 * win) * g2;
      }
      this.w = (this.w + 1) & this.M;
    }
    return true;
  }
}
registerProcessor('eravos-pitch', EravosPitch);`;

  // ---------------------------------------------------------------- AudioWorklet from inline source (F-06: works on file://)
  const workletCache = new WeakMap();
  function loadWorklet(ac, name, source) {
    if (!ac.audioWorklet) return Promise.reject(new Error('AudioWorklet unsupported'));
    let m = workletCache.get(ac); if (!m) { m = {}; workletCache.set(ac, m); }
    // 3.37 (QA RCA: two different processors were both registered as 'eravos-pitch' — whichever loaded first won and the
    // other tool silently got the wrong parameters): one name = one source; a second source under a taken name is refused
    const srcs = m.__src || (m.__src = {});
    if (srcs[name] !== undefined && srcs[name] !== source) return Promise.reject(new Error(`audio processor name "${name}" is already taken by different code`));
    srcs[name] = source;
    if (m[name]) return m[name];
    // Blob URL first; file:// (opaque origin) rejects blob worklets in Chromium → data: URL fallback
    const url = URL.createObjectURL(new Blob([source], { type: 'application/javascript' }));
    const dataUrl = 'data:application/javascript;charset=utf-8,' + encodeURIComponent(source);
    m[name] = ac.audioWorklet.addModule(url)
      .catch(() => ac.audioWorklet.addModule(dataUrl))
      .then(() => { URL.revokeObjectURL(url); return true; })
      .catch((e) => { delete m[name]; delete srcs[name]; throw e; });
    return m[name];
  }

  // ---------------------------------------------------------------- STD.fx contract (all eravos.fx-* inherit)
  // in → inputGain → [DRY] + [WET: algorithm] → equal-power mix → outputGain → out ; bypass ramped 10 ms
  function fxHooks(extra) {
    return [
      Object.assign(MUSIC_STD.audio_in('fx.hook.audio_in', 'in'), { intent: 'signal to process' }),
      MUSIC_STD.audio_out('fx.hook.audio_out', 'out'),
      MUSIC_STD.mod_in('fx.hook.mod_mix', 'mix'),
    ].concat(extra || []);
  }
  function fxShell(ctx, o) {
    o = o || {};
    const ac = ctx.ac, P = ctx.params;
    const inp = ac.createGain(), inGain = ac.createGain(), dry = ac.createGain(), wet = ac.createGain(), sum = ac.createGain(), outGain = ac.createGain();
    const wetIn = ac.createGain(), wetOut = ac.createGain();
    inp.channelCount = 2; inp.channelCountMode = 'explicit'; inp.channelInterpretation = 'speakers';
    inp.connect(inGain); inGain.connect(dry); dry.connect(sum); inGain.connect(wetIn); wetOut.connect(wet); wet.connect(sum); sum.connect(outGain);
    ctx.port('in', { kind: 'audio', direction: 'in', node: inp, label: 'in' });
    ctx.port('out', { kind: 'audio', direction: 'out', node: outGain, label: 'out' });
    const mixMod = ctx.modBus('mix', { min: 0, max: 1 }); const neg = ac.createGain(); neg.gain.value = -1;
    mixMod.connect(wet.gain); mixMod.connect(neg); neg.connect(dry.gain);
    [inp, inGain, dry, wet, sum, outGain, wetIn, wetOut, neg].forEach(n => ctx.track(n));
    function levels(ramp) {
      const t = ac.currentTime, m = o.fixedMix !== undefined ? o.fixedMix : P.get('mix');
      const bp = P.get('bypass');
      const d = bp ? 1 : Math.cos(m * Math.PI / 2), w = bp ? 0 : Math.sin(m * Math.PI / 2);
      [[dry.gain, d], [wet.gain, w]].forEach(([g, v]) => { g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(v, t + (ramp === false ? 0.0005 : 0.01)); });
      inGain.gain.setTargetAtTime(dsp.dbToGain(P.get('inGain')), t, 0.01);
      outGain.gain.setTargetAtTime(dsp.dbToGain(P.get('outGain')), t, 0.01);
    }
    // exact initial values (null test at mix 0 must be exact from sample 0)
    { const m = o.fixedMix !== undefined ? o.fixedMix : P.get('mix'); dry.gain.value = Math.cos(m * Math.PI / 2); wet.gain.value = Math.sin(m * Math.PI / 2); inGain.gain.value = dsp.dbToGain(P.get('inGain')); outGain.gain.value = dsp.dbToGain(P.get('outGain')); }
    ['mix', 'bypass', 'inGain', 'outGain'].forEach(k => P.onChange(k, () => levels()));
    let latency = 0;
    return {
      inp, wetIn, wetOut, dry, wet, outGain, levels,
      setLatency(sec) { if (sec !== latency) { latency = sec; ctx.K.ledger.write('latency_reported', { instance_id: ctx.id, organism_id: ctx.descriptor.id, latency_sec: sec }); ctx.emitUI('latency', { sec }); } },
      get latency() { return latency; },
    };
  }


  SDK.extend({
    id: 'music',
    std: MUSIC_STD,
    uiHooks: ['audition', 'audition_off', 'midi_arm'],
    statics: { STD_FX_CONFIG, fxHooks, fxShell, NOTE_SCHEMA, MIDI_SCHEMA, THEORY_SCHEMA, TICK_SCHEMA, dsp, loadWorklet },
    ctx(ctx, api) {
      const K = ctx.K;
      if (!K.audio) return; // this universe has no music domain installed
      const ac = K.audio.boot();
      let midiArmed = false;
      const RATES = { '¼': 0.25, '½': 0.5, '¾': 0.75, '1': 1, '1½': 1.5, '2': 2, '3': 3, '4': 4 };
      const hasTempo = () => (ctx.descriptor.config || []).some(c => c.key === 'tempoX');
      function tempoRate() {
        if (!ctx.params || !hasTempo()) return 1;
        const x = ctx.params.get('tempoX'); if (x === 'own') { const b = +ctx.params.get('tempoBpm'); return b > 0 && K.music.bpm > 0 ? b / K.music.bpm : 1; }
        return RATES[x] || 1;
      }
      ctx.tempoRate = tempoRate;
      Object.defineProperties(ctx, {
        ac: { value: ac, enumerable: true },
        bpm: { get: () => K.music.bpm * tempoRate(), enumerable: true }, // 3.34: this tool's own tempo (Speed)
        key: { get: () => K.music.key, enumerable: true },
        midiArmed: { get: () => midiArmed, enumerable: true },
      });
      ctx.dsp = dsp;
      ctx.now = () => ac.currentTime;
      ctx.modBus = function (key, range, opts2) {
        // shared ConstantSource summing bus → port 'mod.<key>' (kind param) — connect output to any number of AudioParams
        const cs = ac.createConstantSource(); cs.offset.value = 0; cs.start();
        ctx.track(cs);
        ctx.port('mod.' + key, { kind: 'param', direction: 'in', param: cs.offset, range, label: (opts2 && opts2.label) || key });
        return cs;
      };
      // run fn when AUDIO time reaches t (not wall-clock) — correct in offline renders and when ticks run ahead
      // P11.5 (gate P): is anything wired into this modulation input? Per-voice connections to a modulation bus turn
      // every oscillator / filter of that voice into per-sample (a-rate) work — so voices only connect when it is wired.
      ctx.modWired = function (key) {
        const hk = (ctx.descriptor.hooks || []).find(h => h.wire_type === 'modulation' && h.direction === 'in' && h.mod_key === key); if (!hk) return false;
        return K.wires.list().some(w => w.dst.instanceId === ctx.id && w.dst.hookId === hk.hook_id);
      };
      ctx.atAudioTime = function (t, fn) {
        const k = ac.createConstantSource(); k.offset.value = 0; const sink = ac.createGain(); sink.gain.value = 0;
        k.connect(sink); sink.connect(ac.destination);
        k.onended = () => { try { k.disconnect(); sink.disconnect(); } catch (e) {} if (!ctx.disposed) api.safe(fn); };
        k.start(Math.max(ac.currentTime, t - 0.001)); k.stop(Math.max(ac.currentTime + 0.001, t));
        return k;
      };
      // P11.5 (gate P): a hard ceiling on simultaneous notes per tool — a runaway pattern can't swamp the audio thread.
      // Each tool still steals its own voices below this; this only stops pathological floods (counted, never silent).
      const NOTE_CEILING = 32; let sounding = []; ctx.notesDropped = 0;
      ctx.onNote = (fn) => ctx.on('note:trigger', NOTE_SCHEMA, (p) => {
        if (!ctx.isTarget(p)) return;
        const t = typeof p.time === 'number' ? p.time : ac.currentTime, end = t + (typeof p.duration === 'number' ? p.duration : 1);
        sounding = sounding.filter(e => e > t);
        if (sounding.length >= NOTE_CEILING) { if (ctx.notesDropped++ % 64 === 0) K.fault('RUNTIME_005', { instance_id: ctx.id, message: `more than ${NOTE_CEILING} notes at once — extra notes skipped`, quiet: true }); return; }
        sounding.push(end); fn(p);
      });
      ctx.onMidi = (fn) => ctx.on('midi:note', MIDI_SCHEMA, (p) => { if (midiArmed) fn(p); });
      ctx.onKey = (fn) => ctx.on('theory:key-change', THEORY_SCHEMA, fn);
      // 3.34 speed per tool: the master's 16ths resampled to this tool's rate — sample-accurate (tick times are audio
      // times), phase-locked to the song position (tool step = master step × rate), resynced on any jump (play, loop, seek)
      ctx.onTick = (fn) => {
        let phase = null, n = 0, last = null;
        return ctx.on('transport:tick', TICK_SCHEMA, (t) => {
          const r = tempoRate();
          if (r === 1) { phase = null; last = t.step16; return fn(t); }
          if (phase === null || last === null || t.step16 !== last + 1) { phase = t.step16 * r; n = Math.ceil(phase - 1e-9); }
          last = t.step16;
          const next = phase + r, sd = t.stepDur / r;
          while (n < next - 1e-9) {
            const s16 = n, time = t.time + ((n - phase) / r) * t.stepDur;
            fn(Object.assign({}, t, { step16: s16, time, stepDur: sd, bpm: t.bpm * r, bar: Math.floor(s16 / 16) + 1, beat: Math.floor((s16 % 16) / 4) + 1, sixteenth: (s16 % 4) + 1, rate: r }));
            n++;
          }
          phase = next;
        });
      };
      ctx.onPlay = (fn) => ctx.on('transport:play', null, fn);
      ctx.onStop = (fn) => ctx.on('transport:stop', null, fn);
      // 3.28 stop contract: the transport's Stop is a soft silence for every music tool (latches end, endless loops
      // fade; natural tails ring). Subscribed on the bus directly so it reaches tools with no transport hook too.
      { const un = K.bus.subscribe('transport:stop', (p) => ctx.silenceNow({ hard: false, reason: 'stop', time: p && typeof p.time === 'number' ? p.time : null }), ctx.id); ctx.onDispose(un); }
      ctx.onSilence((p) => { if (ctx.allNotesOff) ctx.allNotesOff(p); });
      const bpmFns = [];
      ctx.onBpm = (fn) => { bpmFns.push(fn); return ctx.on('transport:bpm', { type: 'object', required: ['bpm'] }, (p) => fn(p.bpm * tempoRate())); };
      if (hasTempo()) ['tempoX', 'tempoBpm'].forEach(k => ctx.params.onChange(k, () => bpmFns.forEach(fn => api.safe(() => fn(ctx.bpm)))));
      ctx.loadWorklet = (name, src) => loadWorklet(ac, name, src);
      ctx.onUI('midi_arm', { type: 'object', required: ['on'] }, (p) => { midiArmed = !!p.on; ctx.syncUI(); });
      ctx.onUI('audition', null, (p) => { if (ctx.audition) ctx.audition(p || {}); });
      ctx.onUI('audition_off', null, (p) => { if (ctx.auditionOff) ctx.auditionOff(p || {}); });
      api.addState(() => ({ midiArmed }));
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
