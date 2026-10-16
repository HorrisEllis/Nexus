/* ERAVOS music domain — audio.js → window.MusicAudio
 * The signal graph and master chain that used to live in the kernel (amendment 3.1), now installed into a
 * universe by the music domain through the kernel's extension slots:
 *   port kinds audio / mod / param · wire types audio (acyclic) / modulation · audio + midi asset decoders ·
 *   permissions audio_out / audio_in / midi_in / midi_out · K.audio (graph + master chain) · K.music (bpm, key).
 * Master chain: master.in → dj.hpf → dj.lpf → duck → comp → makeup → limiter → clip → out → destination,
 * returns: reverb (gate + freeze/shimmer loop) and ping-pong delay. */
(function (global) {
  'use strict';
  const AUDIO_EXT = /\.(wav|mp3|ogg|oga|flac|m4a|aac|webm|aif|aiff)$/i;

  function install(K, opts) {
    opts = opts || {};
    const fault = K.fault, ledger = K.ledger, bus = K.bus;
    K.permissions.declare(['audio_out', 'audio_in', 'midi_in', 'midi_out']);
    const routes = new Map();          // `${inst}/${port}` → Set(wireId) non-tap audio routes from this out port
    const audioConns = new Map();      // wireId → {sp, dp, scaler, type}
    let chain = null;
    const audio = { ctx: null, booted: false };

    function key(i, p) { return i + '/' + p; }

    function makeImpulse(ctx, seconds, decay) {
      const rate = ctx.sampleRate, len = Math.max(1, Math.floor(rate * seconds));
      const buf = ctx.createBuffer(2, len, rate);
      for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        let seed = ch ? 0x9e3779b9 : 0x7f4a7c15;
        for (let i = 0; i < len; i++) {
          seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
          const n = ((seed >>> 0) / 4294967296) * 2 - 1;
          const t = i / len;
          d[i] = n * Math.pow(1 - t, decay) * (i < rate * 0.004 ? i / (rate * 0.004) : 1);
        }
      }
      return buf;
    }

    function buildChain(ctx) {
      const c = {};
      c.masterIn = ctx.createGain();
      c.djHpf = ctx.createBiquadFilter(); c.djHpf.type = 'highpass'; c.djHpf.frequency.value = 10; c.djHpf.Q.value = 0.707;
      c.djLpf = ctx.createBiquadFilter(); c.djLpf.type = 'lowpass'; c.djLpf.frequency.value = 22000; c.djLpf.Q.value = 0.707;
      c.duck = ctx.createGain();
      c.comp = ctx.createDynamicsCompressor();
      c.makeup = ctx.createGain();
      c.limiter = ctx.createDynamicsCompressor();
      c.clipIn = ctx.createGain(); c.clipIn.gain.value = 0.5;
      c.clip = ctx.createWaveShaper();
      const N = 4097, curve = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const x = ((i / (N - 1)) * 2 - 1) * 2; // input domain ±2 (pre-scaled by 0.5)
        const a = Math.abs(x);
        curve[i] = a <= 0.95 ? x : Math.sign(x) * (0.95 + 0.05 * Math.tanh((a - 0.95) / 0.05));
      }
      c.clip.curve = curve;
      c.out = ctx.createGain();
      c.masterIn.connect(c.djHpf); c.djHpf.connect(c.djLpf); c.djLpf.connect(c.duck); c.duck.connect(c.comp);
      c.comp.connect(c.makeup); c.makeup.connect(c.limiter); c.limiter.connect(c.clipIn); c.clipIn.connect(c.clip); c.clip.connect(c.out);
      c.out.connect(ctx.destination);
      // P14: post bus — joins AFTER the master output tap (song recorder playback: heard + metered, never re-recorded)
      c.post = ctx.createGain(); c.post.connect(ctx.destination);
      // meters
      c.splitter = ctx.createChannelSplitter(2);
      c.meterL = ctx.createAnalyser(); c.meterR = ctx.createAnalyser();
      c.meterL.fftSize = 2048; c.meterR.fftSize = 2048;
      c.out.connect(c.splitter); c.post.connect(c.splitter); c.splitter.connect(c.meterL, 0); c.splitter.connect(c.meterR, 1);
      // reverb return
      c.reverbSend = ctx.createGain();
      c.predelay = ctx.createDelay(1); c.predelay.delayTime.value = 0.02;
      c.convolver = ctx.createConvolver();
      c.dampHpf = ctx.createBiquadFilter(); c.dampHpf.type = 'highpass'; c.dampHpf.frequency.value = 120;
      c.dampLpf = ctx.createBiquadFilter(); c.dampLpf.type = 'lowpass'; c.dampLpf.frequency.value = 6000;
      c.reverbRet = ctx.createGain(); c.reverbRet.gain.value = 0.25;
      c.reverbGate = ctx.createGain(); // freeze mutes new input (A-5)
      c.reverbSend.connect(c.reverbGate); c.reverbGate.connect(c.predelay); c.predelay.connect(c.convolver); c.convolver.connect(c.dampHpf);
      c.dampHpf.connect(c.dampLpf); c.dampLpf.connect(c.reverbRet); c.reverbRet.connect(c.masterIn);
      // freeze / shimmer feedback loop: tail → [shimmer insert] → soft clip → fb → predelay (loop contains a DelayNode)
      c.revFbIn = ctx.createGain(); c.revShimmerSlot = ctx.createGain(); c.revFbClip = ctx.createWaveShaper(); c.revFb = ctx.createGain(); c.revFb.gain.value = 0;
      const fc = new Float32Array(1025); for (let i = 0; i < 1025; i++) { const x = (i / 1024) * 2 - 1; fc[i] = Math.tanh(x * 1.5) / Math.tanh(1.5); }
      c.revFbClip.curve = fc;
      c.dampLpf.connect(c.revFbIn); c.revFbIn.connect(c.revShimmerSlot); c.revShimmerSlot.connect(c.revFbClip); c.revFbClip.connect(c.revFb); c.revFb.connect(c.predelay);
      c.reverbState = { mix: 0.25, size: 2.2, decay: 3, predelay: 0.02, damping: 0.5 };
      c.convolver.buffer = makeImpulse(ctx, 2.2, 3);
      // delay return (ping-pong)
      c.delaySend = ctx.createGain();
      c.dSplit = ctx.createChannelSplitter(2);
      c.dSum = ctx.createGain(); // mono sum into L
      c.dL = ctx.createDelay(4); c.dR = ctx.createDelay(4);
      c.dL.delayTime.value = 0.375; c.dR.delayTime.value = 0.375;
      c.dLoopL = ctx.createBiquadFilter(); c.dLoopL.type = 'lowpass'; c.dLoopL.frequency.value = 4000;
      c.dLoopR = ctx.createBiquadFilter(); c.dLoopR.type = 'lowpass'; c.dLoopR.frequency.value = 4000;
      c.dFbL = ctx.createGain(); c.dFbR = ctx.createGain(); c.dFbL.gain.value = 0.35; c.dFbR.gain.value = 0.35;
      c.dWidthL = ctx.createStereoPanner(); c.dWidthR = ctx.createStereoPanner(); c.dWidthL.pan.value = -0.8; c.dWidthR.pan.value = 0.8;
      c.delayRet = ctx.createGain(); c.delayRet.gain.value = 0.2;
      c.delaySend.connect(c.dSum); c.dSum.connect(c.dL);
      c.dL.connect(c.dLoopL); c.dLoopL.connect(c.dFbL); c.dFbL.connect(c.dR);     // L → R
      c.dR.connect(c.dLoopR); c.dLoopR.connect(c.dFbR); c.dFbR.connect(c.dL);     // R → L
      c.dLoopL.connect(c.dWidthL); c.dLoopR.connect(c.dWidthR);
      c.dWidthL.connect(c.delayRet); c.dWidthR.connect(c.delayRet); c.delayRet.connect(c.masterIn);
      c.delayState = { mix: 0.2, time: 0.375, feedback: 0.35, tone: 4000, width: 0.8 };
      // defaults (F-17)
      applyComp(c, { threshold: -12, ratio: 2, attack: 0.010, release: 0.200, knee: 6, makeup: 0 }, true);
      c.limiter.threshold.value = -1; c.limiter.ratio.value = 20; c.limiter.knee.value = 0; c.limiter.attack.value = 0.001; c.limiter.release.value = 0.05;
      c.djValue = 0;
      return c;
    }
    function smooth(param, v, now) {
      if (!audio.ctx) return;
      const t = now !== undefined ? now : audio.ctx.currentTime;
      try { param.cancelScheduledValues(t); param.setTargetAtTime(v, t, 0.01); } catch (e) { param.value = v; }
    }
    function applyComp(c, o, immediate) {
      const set = (p, v) => immediate ? (p.value = v) : smooth(p, v);
      if (o.threshold !== undefined) set(c.comp.threshold, o.threshold);
      if (o.ratio !== undefined) set(c.comp.ratio, o.ratio);
      if (o.attack !== undefined) set(c.comp.attack, o.attack);
      if (o.release !== undefined) set(c.comp.release, o.release);
      if (o.knee !== undefined) set(c.comp.knee, o.knee);
      if (o.makeup !== undefined) set(c.makeup.gain, Math.pow(10, o.makeup / 20));
    }

    audio.boot = function (ctx) {
      if (!audio.ctx) {
        const AC = global.AudioContext || global.webkitAudioContext;
        audio.ctx = ctx || opts.ctx || new AC({ latencyHint: 'interactive' });
        chain = buildChain(audio.ctx);
        audio.chain = chain;
        audio.booted = true;
        K.registry.provideKernelCapability('capability.audio_context');
        bus.publish('audio:ready', { sampleRate: audio.ctx.sampleRate });
      }
      if (audio.ctx.state === 'suspended' && typeof audio.ctx.resume === 'function' && !(audio.ctx instanceof (global.OfflineAudioContext || function () {}))) {
        audio.ctx.resume().catch(() => {});
      }
      return audio.ctx;
    };
    Object.defineProperty(audio, 'output', { get: () => chain && chain.out });
    Object.defineProperty(audio, 'post', { get: () => chain && chain.post });
    Object.defineProperty(audio, 'masterIn', { get: () => chain && chain.masterIn });
    Object.defineProperty(audio, 'reverbSend', { get: () => chain && chain.reverbSend });
    Object.defineProperty(audio, 'delaySend', { get: () => chain && chain.delaySend });
    Object.defineProperty(audio, 'dry', { get: () => chain && chain.masterIn }); // compat
    audio.send = function () { return chain && chain.masterIn; };            // compat: c ignored

    audio.setReverb = function (o) {
      if (!chain) return;
      const s = chain.reverbState, prevSize = s.size, prevDecay = s.decay;
      Object.assign(s, o || {});
      if (o.mix !== undefined) smooth(chain.reverbRet.gain, s.mix);
      if (o.predelay !== undefined) smooth(chain.predelay.delayTime, s.predelay);
      if (o.damping !== undefined) smooth(chain.dampLpf.frequency, 16000 * Math.pow(1500 / 16000, s.damping));
      if (o.freeze !== undefined || o.shimmer !== undefined) {
        const fz = !!s.freeze, sh = s.shimmer || 0;
        smooth(chain.reverbGate.gain, fz ? 0 : 1);
        smooth(chain.revFb.gain, fz ? 0.93 : sh * 0.55);
      }
      if ((o.size !== undefined && o.size !== prevSize) || (o.decay !== undefined && o.decay !== prevDecay)) {
        clearTimeout(chain._irT);
        const build = () => { chain.convolver.buffer = makeImpulse(audio.ctx, s.size, s.decay); };
        if (typeof setTimeout === 'function' && !opts.syncIR) chain._irT = setTimeout(build, 60); else build();
      }
    };
    audio.setDelay = function (o) {
      if (!chain) return;
      const s = chain.delayState; Object.assign(s, o || {});
      if (o.mix !== undefined) smooth(chain.delayRet.gain, s.mix);
      if (o.time !== undefined) { smooth(chain.dL.delayTime, Math.min(4, Math.max(0.001, s.time))); smooth(chain.dR.delayTime, Math.min(4, Math.max(0.001, s.time))); }
      if (o.feedback !== undefined) { const fb = Math.min(0.95, Math.max(0, s.feedback)); smooth(chain.dFbL.gain, fb); smooth(chain.dFbR.gain, fb); }
      if (o.tone !== undefined) { smooth(chain.dLoopL.frequency, s.tone); smooth(chain.dLoopR.frequency, s.tone); }
      if (o.width !== undefined) { smooth(chain.dWidthL.pan, -s.width); smooth(chain.dWidthR.pan, s.width); }
    };
    audio.setCompressor = (o) => chain && applyComp(chain, o || {}, false);
    audio.setLimiter = function (o) { if (chain && o && o.ceiling !== undefined) smooth(chain.limiter.threshold, o.ceiling); };
    audio.setOutGain = function (db) { if (chain) smooth(chain.out.gain, Math.pow(10, db / 20)); };
    audio.djMap = function (v) {
      v = Math.max(-1, Math.min(1, v));
      return {
        lpf: v < 0 ? 22000 * Math.pow(200 / 22000, -v) : 22000,
        hpf: v > 0 ? 10 * Math.pow(2000 / 10, v) : 10,
      };
    };
    audio.setDJFilter = function (o, atTime, rampTo) {
      if (!chain) return;
      const v = typeof o === 'number' ? o : o.value;
      chain.djValue = v;
      const m = audio.djMap(v);
      if (atTime !== undefined) {
        // scheduled (used by conductors): exponential ramp to target at atTime
        const f = rampTo ? 'exponentialRampToValueAtTime' : 'setValueAtTime';
        chain.djLpf.frequency[f](m.lpf, atTime); chain.djHpf.frequency[f](m.hpf, atTime);
      } else { smooth(chain.djLpf.frequency, m.lpf); smooth(chain.djHpf.frequency, m.hpf); }
      const q = Math.abs(v) > 0.02 ? 0.707 + Math.abs(v) * 1.8 : 0.707;
      smooth(chain.djLpf.Q, v < 0 ? q : 0.707); smooth(chain.djHpf.Q, v > 0 ? q : 0.707);
    };
    audio.getDJFilter = () => chain ? chain.djValue : 0;
    // modulation inputs (kernel-owned): a −1..1 signal into djModInput sweeps LP (neg) / HP (pos) in cents
    audio.djModInput = function () {
      if (!chain) return null;
      if (!chain.djMod) {
        const ac = audio.ctx, inp = ac.createGain(), lpS = ac.createWaveShaper(), hpS = ac.createWaveShaper();
        const N = 1025, lc = new Float32Array(N), hc = new Float32Array(N);
        const lpC = 1200 * Math.log2(200 / 22000), hpC = 1200 * Math.log2(2000 / 10);
        for (let i = 0; i < N; i++) { const x = i / (N - 1) * 2 - 1; lc[i] = x < 0 ? -x * lpC : 0; hc[i] = x > 0 ? x * hpC : 0; }
        lpS.curve = lc; hpS.curve = hc;
        inp.connect(lpS); inp.connect(hpS); lpS.connect(chain.djLpf.detune); hpS.connect(chain.djHpf.detune);
        chain.djMod = inp;
      }
      return chain.djMod;
    };
    audio.revMixModInput = () => chain ? chain.reverbRet.gain : null;
    audio.duckAt = function (t, shape) {
      if (!chain) return;
      const g = chain.duck.gain;
      const depth = shape.depth !== undefined ? shape.depth : 0.8;
      const a = Math.max(0.0005, shape.attack !== undefined ? shape.attack : 0.005);
      const h = shape.hold || 0, r = Math.max(0.005, shape.release !== undefined ? shape.release : 0.2);
      if (shape.curve && shape.curve.length) {
        // scheduled custom curve over one duck period; caller's curve starts at the current computed value (no clicks)
        const busyC = chain.duckEnd !== undefined && t < chain.duckEnd;
        if (busyC && typeof g.cancelAndHoldAtTime === 'function') g.cancelAndHoldAtTime(t); else { g.cancelScheduledValues(t); g.setValueAtTime(shape.curve[0], t); }
        try { g.setValueCurveAtTime(shape.curve, t + 1e-6, shape.duration || (a + h + r)); } catch (e) { fault('RUNTIME_003', { message: 'duck curve: ' + e.message }); }
        chain.duckEnd = t + (shape.duration || (a + h + r));
        return;
      }
      if (shape.releaseCurve) {
        // exact ramps for attack/hold, caller-supplied release curve; starts from caller's computed value
        const low = 1 - depth, from = shape.from !== undefined ? shape.from : 1;
        const busyR = chain.duckEnd !== undefined && t < chain.duckEnd;
        if (busyR && typeof g.cancelAndHoldAtTime === 'function') g.cancelAndHoldAtTime(t); else { g.cancelScheduledValues(t); g.setValueAtTime(from, t); }
        if (shape.attack > 0) g.linearRampToValueAtTime(low, t + a); else g.setValueAtTime(low, t + 1e-6);
        g.setValueAtTime(low, t + a + h);
        try { g.setValueCurveAtTime(shape.releaseCurve, t + a + h + 1e-6, r); } catch (e) { fault('RUNTIME_003', { message: 'duck release: ' + e.message }); }
        chain.duckEnd = t + a + h + r;
        return;
      }
      const busy = chain.duckEnd !== undefined && t < chain.duckEnd;
      if (busy && typeof g.cancelAndHoldAtTime === 'function') g.cancelAndHoldAtTime(t);
      else { g.cancelScheduledValues(t); g.setValueAtTime(busy ? 1 - depth * 0.5 : 1, t); }
      chain.duckEnd = t + (shape.duration || (a + h + r));
      g.linearRampToValueAtTime(1 - depth, t + a);
      if (h) g.setValueAtTime(1 - depth, t + a + h);
      g.linearRampToValueAtTime(1, t + a + h + r);
    };
    audio.setReverbShimmer = function (node) { // insert a pitch processor in the reverb feedback loop (A-5); null removes
      if (!chain) return;
      try { chain.revFbIn.disconnect(); } catch (e) {}
      if (chain._shimNode) { try { chain._shimNode.disconnect(); } catch (e) {} }
      chain._shimNode = node || null;
      if (node) { chain.revFbIn.connect(node); node.connect(chain.revShimmerSlot); } else chain.revFbIn.connect(chain.revShimmerSlot);
    };
    audio.duckTarget = function (v, t, tau) { if (!chain) return; chain.duck.gain.setTargetAtTime(v, t, Math.max(0.0005, tau || 0.005)); };
    audio.duckReset = function () { if (!chain) return; const g = chain.duck.gain, t = audio.ctx.currentTime; g.cancelScheduledValues(t); g.setTargetAtTime(1, t, 0.01); chain.duckEnd = undefined; };
    audio.meters = function () {
      if (!chain) return null;
      const read = (an) => {
        const d = new Float32Array(an.fftSize); an.getFloatTimeDomainData(d);
        let pk = 0, sq = 0; for (let i = 0; i < d.length; i++) { const x = Math.abs(d[i]); if (x > pk) pk = x; sq += d[i] * d[i]; }
        return { peakDb: 20 * Math.log10(pk + 1e-12), rmsDb: 10 * Math.log10(sq / d.length + 1e-24) };
      };
      return { L: read(chain.meterL), R: read(chain.meterR), reduction: chain.comp.reduction, limiterReduction: chain.limiter.reduction };
    };
    audio.compressorReduction = () => chain ? chain.comp.reduction : 0;

    // ---- ports: kinds audio / mod / param live in the kernel port registry; this domain defines them
    const perm = (dir) => dir === 'out' ? 'audio_out' : 'audio_in';
    K.ports.defineKind('audio', {
      permission: perm, validate: (spec) => spec.node ? null : 'node required',
      onRegister(port) {
        port.tap = !!port.tap; port._taps = [];
        // P14: every audio OUT gets a trim stage (per-tool volume + mute) — the tool keeps its own node; routing,
        // taps and wires all use port.node = the trim
        if (port.direction === 'out' && audio.ctx) {
          const trim = audio.ctx.createGain(); const k = key(port.instance_id, port.port_id), t = trims.get(k);
          trim.gain.value = t ? (t.mute ? 0 : Math.pow(10, t.db / 20)) : 1;
          // 3.28: a GUARD before the trim — "Stop all" / a tool's ■ closes it at once (tails included); it stays closed
          // until that tool is played or touched again (a note for it, MIDI, Play, any control in its window)
          const guard = audio.ctx.createGain(); guard.gain.value = 1;
          // 3.37 (QA: DC offsets on Pad Forge, Channel, Acid, Destroyer): a SOURCE's output is DC-free — 5 Hz high-pass, Q 0.5
          // (−0.1 dB at 30 Hz). A tool that PROCESSES audio (has an audio input) stays bit-transparent and removes any DC it
          // makes in its own wet chain; control signals use 'mod' ports and are never filtered.
          let head = guard;
          const rec = K.registry && K.registry.get ? K.registry.get(port.instance_id) : null, dd = rec && global.OrganismFactory ? global.OrganismFactory.def(rec.organism_id) : null;
          const processes = !!(dd && (dd.hooks || []).some(h => h.wire_type === 'audio' && h.direction === 'in'));
          if (port.dc !== true && !processes) { const dc = audio.ctx.createBiquadFilter(); dc.type = 'highpass'; dc.frequency.value = 5; dc.Q.value = 0.5; dc.connect(guard); head = dc; port.dcBlock = dc; }
          port.node.connect(head); guard.connect(trim); port.src = port.node; port.node = trim; port.trim = trim; port.guard = guard; port.head = head;
        }
        if (port.direction === 'out' && audio.ctx) { const st = stripState.get(key(port.instance_id, port.port_id)); if (st) port.line = st.line && lines.has(st.line) ? st.line : null; }
        if (port.direction === 'out' && chain && port.bus === 'post') { port.node.connect(chain.post); port.onPost = true; }
        else if (port.direction === 'out' && chain) {
          port.node.connect(homeOf(port)); port.onMaster = true;
          routes.set(key(port.instance_id, port.port_id), new Set());
          ledger.write('route_changed', { instance_id: port.instance_id, port_id: port.port_id, from: null, to: 'master.in' });
        }
        if (port.direction === 'out' && port.trim && chain) restoreStrip(port); // 3.34: its mixer strip (saved or solo state)
      },
      onRemove: dropPort,
    });
    K.ports.defineKind('mod', { permission: perm, validate: (spec) => spec.node ? null : 'node required', onRegister(port) { port._taps = []; port.range = port.range || { min: -1, max: 1 }; }, onRemove: dropPort });
    K.ports.defineKind('param', { directions: ['in'], permission: () => ['audio_out', 'audio_in'], validate: (spec) => spec.param ? null : 'param required', onRegister(port) { port._taps = []; port.range = port.range || { min: -1, max: 1 }; }, onRemove: dropPort });
    function dropPort(p) {
      if (p.src && p.head) { try { p.src.disconnect(p.head); if (p.dcBlock) p.dcBlock.disconnect(); p.guard.disconnect(); } catch (e) {} }
      if (p.node) { try { p.node.disconnect(); } catch (e) {} }
      (p._taps || []).forEach(an => { try { an.disconnect(); } catch (e) {} });
      routes.delete(key(p.instance_id, p.port_id));
      if (p.strip) { Object.values(p.strip.nodes).forEach(n => { try { n.disconnect(); } catch (e) {} }); try { p.strip.nodes.pan.input.disconnect(); p.strip.nodes.pan.input.disconnect(); p.strip.nodes.pan.gL.disconnect(); p.strip.nodes.pan.gR.disconnect(); } catch (e) {} Object.values(p.strip.sends).forEach(g => { try { g.disconnect(); } catch (e) {} }); p.strip = null; }
    }
    audio.registerPort = (instanceId, portId, spec) => K.ports.register(instanceId, portId, spec);
    const trims = new Map(); // `${inst}/${port}` → { db, mute }
    audio.setTrim = function (instanceId, portId, o) {
      const k = key(instanceId, portId || 'out'), cur = Object.assign({ db: 0, mute: false }, trims.get(k) || {}, o || {});
      cur.db = Math.max(-60, Math.min(12, +cur.db || 0)); trims.set(k, cur);
      const p = audio.port(instanceId, portId || 'out');
      if (p && p.trim) { const t = audio.ctx.currentTime; p.trim.gain.cancelScheduledValues(t); p.trim.gain.setTargetAtTime(cur.mute ? 0 : Math.pow(10, cur.db / 20), t, 0.015); }
      bus.publish('audio:trim', { instanceId, portId: portId || 'out', db: cur.db, mute: cur.mute });
      return cur;
    };
    // ---- 3.28 stop contract: the guard side (the tool side is ctx.onSilence)
    audio.hush = function (instanceId, at) {
      if (!audio.ctx) return 0; const t = Math.max(audio.ctx.currentTime, typeof at === 'number' ? at : 0); let n = 0;
      (instanceId ? K.ports.list(instanceId) : K.ports.all()).forEach(p => {
        if (!p.guard || (instanceId && p.instance_id !== instanceId)) return;
        const g = p.guard.gain;
        g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0, t + 0.008);
        p.hushedUntil = Infinity; n++;
      });
      return n;
    };
    audio.unhush = function (instanceId, at) {
      if (!audio.ctx) return; const t = Math.max(audio.ctx.currentTime, typeof at === 'number' ? at : 0);
      (instanceId ? K.ports.list(instanceId) : K.ports.all()).forEach(p => {
        if (!p.guard || !(p.hushedUntil > t) || (instanceId && p.instance_id !== instanceId)) return;
        const g = p.guard.gain; g.cancelScheduledValues(t); g.setValueAtTime(0, t); g.linearRampToValueAtTime(1, t + 0.01); p.hushedUntil = 0;
      });
    };
    audio.hushed = (instanceId) => K.ports.list(instanceId).some(p => p.guard && p.hushedUntil > audio.ctx.currentTime);
    bus.subscribe('kernel:silence', (p) => { if (p && p.hard) audio.hush(p.instanceId, p.time); }, 'kernel');
    // playing again reopens at once: a note for that tool, or the transport starting
    bus.subscribe('note:trigger', (p) => { if (p && p.target && p.target !== '*') audio.unhush(p.target, p.time); else if (p && p.target === '*') audio.unhush(null, p.time); }, 'kernel');
    bus.subscribe('transport:play', (p) => audio.unhush(null, p && p.time), 'kernel');
    bus.subscribe('midi:note', (p) => { if (p && p.on) audio.unhush(null); }, 'kernel');
    // touching a tool (any control in its window) opens it again — except the stop itself and passive state reads
    if (bus.tap) bus.tap((topic) => { const m = /^ui:([a-z_]+):(.+)$/.exec(topic); if (m && m[1] !== 'silence' && m[1] !== 'request_state' && !/^want_/.test(m[1])) audio.unhush(m[2]); });
    audio.getTrim = (instanceId, portId) => Object.assign({ db: 0, mute: false }, trims.get(key(instanceId, portId || 'out')) || {});
    audio.trims = () => Array.from(trims.entries()).filter(([, v]) => v.db !== 0 || v.mute).map(([k, v]) => ({ k, db: v.db, mute: v.mute }));
    audio.loadTrims = (list) => { trims.clear(); (list || []).forEach(x => { if (x && x.k) trims.set(x.k, { db: +x.db || 0, mute: !!x.mute }); }); };
    // ---- 3.34 the mixer layer (eravos.phase34-map §E). The Mixer window, Settings → Output and the title-bar volume are
    // faces of this one layer. Strip: guard → gate (solo) → low cut → low / mid / high → pan → trim (fader + mute) →
    // home (master or a GROUP line) · post-fader sends → AUX lines. Lines: GROUP (sum) / AUX (send-fed effect) →
    // low / high → pan → fader → mute → master. The built-in Reverb and Echo returns are the first two AUX lines.
    const STRIP0 = { pan: 0, lowCut: 0, low: 0, mid: 0, midFreq: 1000, high: 0, solo: false, line: null, sends: {} };
    const stripState = new Map(), lines = new Map(); let lineSeq = 1;
    function homeOf(port) { const l = port && port.line && lines.get(port.line); return l && l.input ? l.input : chain.masterIn; }
    // balance pan: unity at centre (adding a strip never changes a level), mono is spread to both sides first
    function makePan(ac) {
      const up = ac.createGain(), sp = ac.createChannelSplitter(2), gL = ac.createGain(), gR = ac.createGain(), mg = ac.createChannelMerger(2);
      up.channelCount = 2; up.channelCountMode = 'explicit'; up.channelInterpretation = 'speakers'; up.connect(sp);
      sp.connect(gL, 0); sp.connect(gR, 1); gL.connect(mg, 0, 0); gR.connect(mg, 0, 1);
      const node = { input: up, output: mg, gL, gR, connect: (d) => mg.connect(d), disconnect: () => { try { mg.disconnect(); } catch (e) {} },
        set(v) { v = Math.max(-1, Math.min(1, +v || 0)); sm(gL.gain, v > 0 ? 1 - v : 1); sm(gR.gain, v < 0 ? 1 + v : 1); } };
      return node;
    }
    function ensureStrip(port) {
      if (port.strip || !port.guard || !port.trim) return port.strip;
      const ac = audio.ctx, n = {
        gate: ac.createGain(), hp: ac.createBiquadFilter(), lo: ac.createBiquadFilter(), mid: ac.createBiquadFilter(), hi: ac.createBiquadFilter(),
        pan: makePan(ac) };
      n.hp.type = 'highpass'; n.hp.frequency.value = 10; n.hp.Q.value = -3.01; // Q is in dB for high-pass: −3 dB = Butterworth (no bump)
      n.lo.type = 'lowshelf'; n.lo.frequency.value = 120; n.mid.type = 'peaking'; n.mid.frequency.value = 1000; n.mid.Q.value = 0.9; n.hi.type = 'highshelf'; n.hi.frequency.value = 8000;
      try { port.guard.disconnect(port.trim); } catch (e) { try { port.guard.disconnect(); } catch (e2) {} }
      port.guard.connect(n.gate); n.gate.connect(n.hp); n.hp.connect(n.lo); n.lo.connect(n.mid); n.mid.connect(n.hi); n.hi.connect(n.pan.input); n.pan.connect(port.trim);
      port.strip = { nodes: n, sends: {} };
      return port.strip;
    }
    const sm = (prm, v) => { const t = audio.ctx.currentTime; prm.cancelScheduledValues(t); prm.setTargetAtTime(v, t, 0.012); };
    function sendTarget(id) { if (id === 'reverb') return chain.reverbSend; if (id === 'echo') return chain.delaySend; const l = lines.get(id); return l && l.kind === 'aux' ? l.input : null; }
    function applyStrip(port, st) {
      const needs = st.pan || st.lowCut > 10 || st.low || st.mid || st.high || soloOn() || Object.keys(st.sends || {}).some(k => st.sends[k] > 0);
      if (needs || port.strip) {
        const S = ensureStrip(port); if (!S) return; const n = S.nodes;
        n.pan.set(st.pan);
        sm(n.hp.frequency, Math.max(10, +st.lowCut || 10)); sm(n.lo.gain, +st.low || 0); sm(n.mid.gain, +st.mid || 0); sm(n.mid.frequency, +st.midFreq || 1000); sm(n.hi.gain, +st.high || 0);
        const k = key(port.instance_id, port.port_id); sm(n.gate.gain, !soloOn() || soloKeys().has(k) ? 1 : 0);
        Object.keys(S.sends).forEach(id => { if (!(id in (st.sends || {})) || !sendTarget(id)) { try { S.sends[id].disconnect(); } catch (e) {} delete S.sends[id]; } });
        Object.keys(st.sends || {}).forEach(id => {
          const dst = sendTarget(id); if (!dst) return;
          if (!S.sends[id]) { const g = audio.ctx.createGain(); g.gain.value = 0; port.trim.connect(g); g.connect(dst); S.sends[id] = g; }
          sm(S.sends[id].gain, Math.max(0, Math.min(1, +st.sends[id] || 0)));
        });
      }
      // home: master or a group line (only while the tool is not wired somewhere else)
      const want = st.line && lines.has(st.line) && lines.get(st.line).kind === 'group' ? st.line : null;
      if ((port.line || null) !== want) {
        if (port.onMaster) { try { port.node.disconnect(homeOf(port)); } catch (e) {} port.line = want; port.node.connect(homeOf(port)); }
        else port.line = want;
        ledger.write('route_changed', { instance_id: port.instance_id, port_id: port.port_id, from: 'mixer', to: want || 'master.in' });
      }
    }
    function restoreStrip(port) { const st = stripState.get(key(port.instance_id, port.port_id)); if (st) applyStrip(port, st); else if (soloOn()) applyStrip(port, Object.assign({}, STRIP0)); }
    const soloKeys = () => new Set(Array.from(stripState.entries()).filter(([, v]) => v.solo).map(([k]) => k));
    const soloOn = () => Array.from(stripState.values()).some(v => v.solo);
    function reapplyAll() { K.ports.all().forEach(p => { if (p.kind === 'audio' && p.direction === 'out' && p.trim) applyStrip(p, stripState.get(key(p.instance_id, p.port_id)) || Object.assign({}, STRIP0)); }); }
    audio.strip = function (instanceId, portId) {
      const k = key(instanceId, portId || 'out');
      return {
        get: () => Object.assign({}, STRIP0, stripState.get(k) || {}, { sends: Object.assign({}, (stripState.get(k) || {}).sends || {}) }, audio.getTrim(instanceId, portId)),
        set(patch) {
          const wasSolo = soloOn();
          const cur = Object.assign({}, STRIP0, stripState.get(k) || {}); cur.sends = Object.assign({}, cur.sends || {});
          Object.keys(patch || {}).forEach(f => { if (f === 'sends') Object.assign(cur.sends, patch.sends); else if (f in STRIP0) cur[f] = patch[f]; });
          stripState.set(k, cur);
          if ('db' in (patch || {}) || 'mute' in (patch || {})) audio.setTrim(instanceId, portId, { db: patch.db, mute: patch.mute });
          if (wasSolo !== soloOn() || 'solo' in (patch || {})) reapplyAll(); else { const p = audio.port(instanceId, portId || 'out'); if (p && p.trim) applyStrip(p, cur); }
          bus.publish('audio:strip', { instanceId, portId: portId || 'out', state: cur });
          return cur;
        },
      };
    };
    // ---- lines
    function buildLine(L) {
      const ac = audio.ctx;
      const n = { input: ac.createGain(), lo: ac.createBiquadFilter(), hi: ac.createBiquadFilter(), pan: makePan(ac), fader: ac.createGain(), mute: ac.createGain() };
      n.lo.type = 'lowshelf'; n.lo.frequency.value = 150; n.hi.type = 'highshelf'; n.hi.frequency.value = 6000;
      let head = n.input;
      if (L.kind === 'aux' && L.fx === 'reverb') { n.fx = ac.createConvolver(); n.fx.buffer = makeImpulse(ac, L.size || 2.2, L.decay || 2.5); n.input.connect(n.fx); head = n.fx; }
      else if (L.kind === 'aux' && L.fx === 'echo') {
        n.fx = ac.createDelay(4); n.fb = ac.createGain(); n.fx.delayTime.value = L.time || 0.375; n.fb.gain.value = L.feedback === undefined ? 0.35 : L.feedback;
        n.input.connect(n.fx); n.fx.connect(n.fb); n.fb.connect(n.fx); head = n.fx;
      }
      head.connect(n.lo); n.lo.connect(n.hi); n.hi.connect(n.pan.input); n.pan.connect(n.fader); n.fader.connect(n.mute); n.mute.connect(chain.masterIn);
      L.nodes = n; L.input = n.input; applyLine(L);
    }
    function applyLine(L) {
      const n = L.nodes; if (!n) return;
      sm(n.fader.gain, Math.pow(10, (+L.db || 0) / 20)); sm(n.mute.gain, L.mute ? 0 : 1); sm(n.lo.gain, +L.low || 0); sm(n.hi.gain, +L.high || 0);
      n.pan.set(L.pan);
      if (n.fx && L.fx === 'echo') { sm(n.fx.delayTime, Math.max(0.01, Math.min(4, +L.time || 0.375))); sm(n.fb.gain, Math.max(0, Math.min(0.92, +L.feedback || 0))); }
      if (n.fx && L.fx === 'reverb' && (L._ir !== (L.size + '/' + L.decay))) { L._ir = L.size + '/' + L.decay; n.fx.buffer = makeImpulse(audio.ctx, L.size || 2.2, L.decay || 2.5); }
    }
    const pub = (o) => ({ id: o.id, kind: o.kind, name: o.name, fx: o.fx, db: o.db, mute: o.mute, pan: o.pan, low: o.low, high: o.high, size: o.size, decay: o.decay, time: o.time, feedback: o.feedback, builtin: !!o.builtin });
    audio.lines = {
      builtin: () => chain ? [
        { id: 'reverb', kind: 'aux', name: 'Reverb', fx: 'reverb', builtin: true, ret: chain.reverbState ? chain.reverbState.mix : chain.reverbRet.gain.value },
        { id: 'echo', kind: 'aux', name: 'Echo', fx: 'echo', builtin: true, ret: chain.delayState ? chain.delayState.mix : chain.delayRet.gain.value }] : [],
      list: () => Array.from(lines.values()).map(pub),
      add(o) {
        if (!chain) return null; o = Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v !== undefined && v !== null));
        const kind = o.kind === 'aux' ? 'aux' : 'group', fx = kind === 'aux' ? (['reverb', 'echo', 'plain'].includes(o.fx) ? o.fx : 'reverb') : null;
        let id = o.id && !lines.has(o.id) ? o.id : null; while (!id || lines.has(id)) id = 'line' + (lineSeq++);
        const L = Object.assign({ id, kind, fx, name: o.name || (kind === 'group' ? 'Group ' : (fx === 'echo' ? 'Echo ' : fx === 'plain' ? 'Aux ' : 'Verb ')) + (lines.size + 1), db: 0, mute: false, pan: 0, low: 0, high: 0, size: 2.2, decay: 2.5, time: 0.375, feedback: 0.35 }, o, { id, kind, fx });
        lines.set(id, L); buildLine(L); bus.publish('audio:lines', { op: 'add', id }); return id;
      },
      set(id, patch) {
        if (id === 'reverb' && patch && patch.ret !== undefined) { audio.setReverb({ mix: Math.max(0, +patch.ret) }); bus.publish('audio:lines', { op: 'set', id }); return; }
        if (id === 'echo' && patch && patch.ret !== undefined) { audio.setDelay({ mix: Math.max(0, +patch.ret) }); bus.publish('audio:lines', { op: 'set', id }); return; }
        const L = lines.get(id); if (!L) return; ['name', 'db', 'mute', 'pan', 'low', 'high', 'size', 'decay', 'time', 'feedback'].forEach(f => { if (patch[f] !== undefined) L[f] = patch[f]; });
        applyLine(L); bus.publish('audio:lines', { op: 'set', id });
      },
      remove(id) {
        const L = lines.get(id); if (!L) return false;
        // everything routed or sending into it goes back home first
        stripState.forEach((st) => { if (st.line === id) st.line = null; if (st.sends && id in st.sends) delete st.sends[id]; });
        lines.delete(id); reapplyAll();
        Object.values(L.nodes || {}).forEach(nd => { try { nd.disconnect(); } catch (e) {} });
        bus.publish('audio:lines', { op: 'remove', id }); return true;
      },
      tap(id, fftSize) { const L = lines.get(id); if (!L || !L.nodes || !audio.ctx) return null; const an = audio.ctx.createAnalyser(); an.fftSize = fftSize || 256; L.nodes.mute.connect(an); return an; },
    };
    // the whole mix as data (workspace + the Mixer's undo snapshots) — one format, read and written here only
    audio.mixState = () => ({ strips: Array.from(stripState.entries()).map(([k, v]) => ({ k, s: v })), lines: audio.lines.list(), seq: lineSeq });
    audio.loadMix = function (m) {
      if (!chain) return;
      Array.from(lines.keys()).forEach(id => { const L = lines.get(id); Object.values(L.nodes || {}).forEach(nd => { try { nd.disconnect(); } catch (e) {} }); lines.delete(id); });
      stripState.clear(); lineSeq = Math.max(1, (m && m.seq) || 1);
      ((m && m.lines) || []).forEach(L => audio.lines.add(Object.assign({}, L)));
      ((m && m.strips) || []).forEach(x => { if (x && x.k) stripState.set(x.k, Object.assign({}, STRIP0, x.s || {})); });
      K.ports.all().forEach(p => { if (p.kind === 'audio' && p.direction === 'out' && p.trim) { if (!stripState.has(key(p.instance_id, p.port_id)) && p.line) applyStrip(p, Object.assign({}, STRIP0)); } });
      reapplyAll(); bus.publish('audio:lines', { op: 'load' });
    };
    audio.port = (instanceId, portId) => K.ports.get(instanceId, portId);
    audio.ports = (instanceId) => K.ports.list(instanceId);
    audio.removePorts = (instanceId) => K.ports.removeAll(instanceId);
    audio.isOnMaster = (instanceId, portId) => { const p = audio.port(instanceId, portId); return !!(p && p.onMaster); };
    audio.tap = function (instanceId, portId, fftSize) {
      // kernel-owned analyser on any audio/mod port — read-only view for UIs
      const p = audio.port(instanceId, portId);
      if (!p || !p.node || !audio.ctx) return null;
      const an = audio.ctx.createAnalyser(); an.fftSize = fftSize || 2048; an.smoothingTimeConstant = 0.6;
      p.node.connect(an); p._taps.push(an);
      return an;
    };
    audio.tapStereo = function (instanceId, portId, fftSize) {
      const p = audio.port(instanceId, portId);
      if (!p || !p.node || !audio.ctx) return null;
      const sp = audio.ctx.createChannelSplitter(2), L = audio.ctx.createAnalyser(), R = audio.ctx.createAnalyser();
      L.fftSize = R.fftSize = fftSize || 1024;
      p.node.connect(sp); sp.connect(L, 0); sp.connect(R, 1); p._taps.push(sp, L, R);
      return { L, R };
    };
    audio.tapMaster = function (fftSize) {
      if (!chain) return null;
      const an = audio.ctx.createAnalyser(); an.fftSize = fftSize || 2048; chain.out.connect(an); return an;
    };
    function connect(wireId, sp, dp) { // called by the kernel wire registry only
      if (sp.kind === 'audio' && dp.kind === 'audio') {
        sp.node.connect(dp.node);
        audioConns.set(wireId, { sp, dp, type: 'audio' });
        if (!dp.tap) {
          const r = routes.get(key(sp.instance_id, sp.port_id)) || new Set();
          r.add(wireId); routes.set(key(sp.instance_id, sp.port_id), r);
          if (r.size === 1 && sp.onMaster) {
            try { sp.node.disconnect(homeOf(sp)); } catch (e) {}
            sp.onMaster = false;
            ledger.write('route_changed', { instance_id: sp.instance_id, port_id: sp.port_id, from: 'master.in', to: dp.instance_id + '/' + dp.port_id });
          }
        }
        return { ok: true };
      }
      if (sp.kind === 'mod' && dp.kind === 'param') {
        const scaler = audio.ctx.createGain();
        scaler.gain.value = (dp.range.max - dp.range.min) / 2;
        sp.node.connect(scaler); scaler.connect(dp.param);
        audioConns.set(wireId, { sp, dp, scaler, type: 'modulation' });
        return { ok: true, data: { scaler } };
      }
      return { ok: false, fault: fault('WIRE_005', { message: `port kinds incompatible ${sp.kind} → ${dp.kind}` }) };
    }
    function disconnect(wireId) {
      const c = audioConns.get(wireId);
      if (!c) return;
      audioConns.delete(wireId);
      if (c.type === 'audio') {
        try { c.sp.node.disconnect(c.dp.node); } catch (e) {}
        // other wires between same nodes? reconnect them (disconnect(node) removes all)
        audioConns.forEach(o => { if (o.type === 'audio' && o.sp === c.sp && o.dp === c.dp) o.sp.node.connect(o.dp.node); });
        const r = routes.get(key(c.sp.instance_id, c.sp.port_id));
        if (r && r.has(wireId)) {
          r.delete(wireId);
          if (r.size === 0 && !c.sp.onMaster && K.ports.get(c.sp.instance_id, c.sp.port_id) && chain) {
            c.sp.node.connect(homeOf(c.sp)); c.sp.onMaster = true;
            ledger.write('route_changed', { instance_id: c.sp.instance_id, port_id: c.sp.port_id, from: c.dp.instance_id + '/' + c.dp.port_id, to: 'master.in' });
          }
        }
      } else {
        try { c.sp.node.disconnect(c.scaler); } catch (e) {}
        try { c.scaler.disconnect(); } catch (e) {}
      }
      return c;
    }
    K.wires.defineType('audio', { connect, disconnect, acyclic: true, color: '#00ff88' });
    K.wires.defineType('modulation', { connect, disconnect, color: '#b066ff' });
    audio.modScaler = (wireId) => { const c = audioConns.get(wireId); return c && c.scaler; };

    audio.putBuffer = function (buffer, meta) { // an in-memory AudioBuffer (clip-maker, bounces) as a WAV-backed asset
      const wav = global.AudioRecorder ? global.AudioRecorder.encodeWAV(buffer, 24) : new ArrayBuffer(8);
      return K.assets.registerDecoded(wav, buffer, Object.assign({ mime: 'audio/wav', asset_type: 'audio' }, meta || {}));
    };
    K.extend('audio', audio, 'music');

    K.assets.defineDecoder({
      asset_type: 'midi', mime: /midi/,
      sniff: (b, name) => (b[0] === 0x4d && b[1] === 0x54 && b[2] === 0x68 && b[3] === 0x64) || /\.midi?$/i.test(name),
      decode: async (bytes) => global.MusicTheory.midi.parse(bytes),
    });
    K.assets.defineDecoder({
      asset_type: 'audio', mime: /^audio\/(?!midi)/,
      sniff: (b, name) => AUDIO_EXT.test(name) || String.fromCharCode(b[0], b[1], b[2], b[3]) === 'RIFF' || String.fromCharCode(b[0], b[1], b[2]) === 'ID3' || String.fromCharCode(b[0], b[1], b[2], b[3]) === 'OggS' || String.fromCharCode(b[0], b[1], b[2], b[3]) === 'fLaC' || (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70),
      decode: async (bytes) => await audio.boot().decodeAudioData(bytes),
    });

    // shared musical state (was K.state in kernel 3.1)
    const music = { bpm: 128, key: { root: 9, scale: 'minor' } };
    bus.subscribe('theory:key-change', (p) => { if (p && typeof p.root === 'number') music.key = { root: p.root, scale: p.scale }; }, 'music');
    bus.subscribe('transport:bpm', (p) => { if (p && p.bpm) music.bpm = p.bpm; }, 'music');
    K.extend('music', music, 'music');

    if (opts.ctx) audio.boot(opts.ctx);
  }

  global.MusicAudio = { install, AUDIO_EXT };
})(typeof window !== 'undefined' ? window : globalThis);
