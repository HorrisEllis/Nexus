/* ERAVOS runtime R4 — master-transport.js → window.MasterTransport (sole clock owner)
 * spec: eravos.runtime.music R4. Resolves F-07 (no Space here — shell owns it), F-08 (BPM never restarts).
 * MasterTransport.create(K, {offline}) — offline universes are driven with renderTicks(). */
(function (global) {
  'use strict';

  function create(K, opts) {
    opts = opts || {};
    const bus = K.bus;
    const T = {
      playing: false, recording: false, bpm: opts.bpm || 128, position16: 0,
      loop: { on: false, startBar: 1, endBar: 5 }, metronome: false, countIn: 0,
      instanceId: 'transport', clockMode: null,
    };
    let ac = null, clock = null, nextTime = 0, step = 0, startTime = 0, recorder = null, clickPort = null, clickGain = null;
    let pendingStopAt = null, bounceJob = null, countInSteps = 0;

    const descriptor = {
      id: 'eravos.transport', label: 'Transport', version: '3.1.0', system: true,
      permissions: ['audio_out', 'bus_publish', 'bus_subscribe'],
      provides: ['capability.transport', 'capability.clock_source', 'capability.seek'],
      hooks: [
        { hook_id: 'transport.hook.tick_out', direction: 'out', wire_type: 'event_bus', event_type: 'transport:tick|transport:play|transport:stop|transport:loop|transport:bpm', contract_version: '1.0.0', schema: { type: 'object' }, failure_mode: 'RUNTIME_002' },
        { hook_id: 'transport.hook.recorded_out', direction: 'out', wire_type: 'event_bus', event_type: 'transport:recorded', contract_version: '1.0.0', schema: { type: 'object' }, failure_mode: 'RUNTIME_002' },
        { hook_id: 'transport.hook.control_in', direction: 'in', wire_type: 'event_bus', event_type: 'ui:transport-play|ui:transport-stop|ui:transport-record|ui:transport-bpm|ui:transport-seek|ui:transport-loop|ui:transport-bounce|ui:transport-restart|ui:transport-tap', contract_version: '1.0.0', schema: { type: 'object' }, failure_mode: 'RUNTIME_002' },
        { hook_id: 'transport.hook.click_out', direction: 'out', wire_type: 'audio', port: 'click', event_type: 'audio', contract_version: '2.0.0', schema: {}, failure_mode: 'PORT_001' },
      ],
    };

    const stepDur = () => 60 / T.bpm / 4;
    const barSec = () => 60 / T.bpm * 4;
    T.stepDur = stepDur; T.barSec = barSec;

    function boot() {
      if (ac) return;
      ac = K.audio.boot();
      if (!K.registry.has('transport')) K.registry.register('transport', descriptor);
      clickGain = ac.createGain(); clickGain.gain.value = 0.5;
      clickPort = K.audio.registerPort('transport', 'click', { kind: 'audio', direction: 'out', node: clickGain, label: 'metronome' });
      if (!opts.offline) {
        clock = global.PrecisionClock.create(ac, schedule);
        clock.ready.then(m => { T.clockMode = m; });
      }
      bus.publish('transport:bpm', { bpm: T.bpm });
    }
    T.boot = boot;

    function click(t, accent) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.value = accent ? 1760 : 1100;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(accent ? 0.9 : 0.5, t + 0.001); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      o.connect(g); g.connect(clickGain); o.start(t); o.stop(t + 0.06);
      o.onended = () => { try { g.disconnect(); } catch (e) {} };
    }

    function emitTick(s, t) {
      const bar = Math.floor(s / 16) + 1, beat = Math.floor((s % 16) / 4) + 1, sixteenth = (s % 4) + 1;
      if (T.metronome && s % 4 === 0) click(t, s % 16 === 0);
      bus.publish('transport:tick', { step16: s, time: t, bar, beat, sixteenth, stepDur: stepDur(), bpm: T.bpm });
    }

    function schedule() {
      if (!T.playing || !ac) return;
      const horizon = ac.currentTime + (clock ? clock.lookahead : 0.1);
      while (nextTime < horizon) {
        if (countInSteps > 0) {
          if (countInSteps % 4 === 0) click(nextTime, countInSteps === 16);
          countInSteps--; nextTime += stepDur();
          if (countInSteps === 0) { startTime = nextTime; bus.publish('transport:play', { BPM: T.bpm, bpm: T.bpm, time: nextTime, step16: step }); bus.publish('seq:play', { bpm: T.bpm, time: nextTime }); if (T.recording && recorder) T.recordStartTime = nextTime; }
          continue;
        }
        if (T.loop.on && step >= (T.loop.endBar - 1) * 16) {
          step = (T.loop.startBar - 1) * 16;
          bus.publish('transport:loop', { toStep16: step, time: nextTime });
        }
        if (pendingStopAt !== null && nextTime >= pendingStopAt - 1e-9) { finishStop(pendingStopAt); return; }
        emitTick(step, nextTime);
        T.position16 = step;
        step++;
        nextTime += stepDur();
      }
    }

    T.play = function (o) {
      boot();
      if (T.playing) return;
      o = o || {};
      T.playing = true;
      step = T.position16;
      nextTime = (o.at !== undefined ? o.at : ac.currentTime + 0.06);
      countInSteps = (o.countIn || 0) * 16;
      if (!countInSteps) {
        startTime = nextTime;
        bus.publish('transport:play', { BPM: T.bpm, bpm: T.bpm, time: nextTime, step16: step });
        bus.publish('seq:play', { bpm: T.bpm, time: nextTime });
      }
      if (clock) clock.start(); else schedule();
      publishState();
    };
    function finishStop(t) {
      T.playing = false; pendingStopAt = null;
      if (clock) clock.stop();
      bus.publish('transport:stop', { time: t !== undefined ? t : (ac ? ac.currentTime : 0) });
      bus.publish('seq:stop', {});
      publishState();
      if (T.recording) T.stopRecord(t);
    }
    // 3.28: Stop always stops — pressed while the transport is already stopped it still ends drones, latches and
    // endless loops that run on their own (a soft silence to every tool)
    T.stop = function () { if (!T.playing) { if (T.recording) T.stopRecord(); T.position16 = T.position16; publishState(); if (K.silence) K.silence({ hard: false, reason: 'stop' }); return; } finishStop(ac.currentTime); };
    // "Stop all" (a hard silence with no target) also stops the transport
    bus.subscribe('kernel:silence', (p) => { if (p && p.hard && !p.instanceId && T.playing) finishStop(ac.currentTime); }, 'kernel');
    T.stopAt = function (t) { pendingStopAt = t; };
    T.toggle = function () { T.playing ? T.stop() : T.play(); };
    T.seek = function (bar) {
      const s = Math.max(0, Math.round((bar - 1) * 16));
      T.position16 = s;
      if (T.playing) { step = s; bus.publish('transport:loop', { toStep16: s, time: nextTime, seek: true }); }
      publishState();
    };
    T.setBpm = function (b) {
      b = Math.max(40, Math.min(240, Number(b) || T.bpm));
      if (b === T.bpm) return;
      T.bpm = b; // next tick uses new stepDur — no restart (F-08)
      bus.publish('transport:bpm', { bpm: b });
      publishState();
    };
    // 3.35 ⏮ restart: back to the loop start when the loop is on, else bar 1 (to: 'start' | 'loop' forces one);
    // keeps playing if playing; play:true also starts a stopped transport. One place — top bar, Timeline, Home key and pads all use it.
    T.restart = function (o) {
      o = o || {}; const bar = o.to === 'start' ? 1 : (o.to === 'loop' || T.loop.on) ? T.loop.startBar : 1;
      T.seek(bar); if (o.play && !T.playing) T.play({}); publishState(); return bar;
    };
    // tap tempo as an event (was only the top-bar button): 2+ taps less than 2 s apart → the mean of the last 4 intervals
    let taps = [];
    T.tap = function (now) {
      now = now === undefined ? performance.now() : now; if (taps.length && now - taps[taps.length - 1] > 2000) taps = [];
      taps.push(now); taps = taps.slice(-5); if (taps.length < 2) return null;
      const iv = []; for (let i = 1; i < taps.length; i++) iv.push(taps[i] - taps[i - 1]);
      const m = iv.slice(-4).reduce((a, b) => a + b, 0) / Math.min(4, iv.length), b = Math.round(60000 / m);
      if (b >= 40 && b <= 300) T.setBpm(b); return b;
    };
    T.setLoop = function (l) { Object.assign(T.loop, l || {}); publishState(); };
    T.currentTimeSec = function () {
      if (!T.playing || !ac) return T.position16 * stepDur();
      return T.position16 * stepDur() + Math.max(0, ac.currentTime - (nextTime - stepDur()));
    };

    // ---- recording
    T.record = async function (o) {
      boot();
      o = o || {};
      if (!recorder) recorder = global.AudioRecorder.create(ac, K.audio.output);
      await recorder.ready;
      T.recording = true; T.recordStartTime = null;
      await recorder.start();
      publishState();
      if (!T.playing && o.play !== false) T.play({ countIn: o.countIn !== undefined ? o.countIn : T.countIn });
      if (T.recordStartTime === null) T.recordStartTime = startTime;
    };
    T.stopRecord = async function (endT) {
      if (!recorder || !T.recording) return null;
      T.recording = false;
      const end = endT !== undefined ? endT : ac.currentTime;
      await new Promise(r => setTimeout(r, 150)); // let final blocks arrive
      const cs = await recorder.stop();
      const sf = Math.round((T.recordStartTime || 0) * ac.sampleRate), ef = Math.round(end * ac.sampleRate);
      const buf = recorder.assemble(cs, sf, ef);
      const wav = global.AudioRecorder.encodeWAV(buf, T.bitDepth || 24);
      const payload = { arrayBuffer: wav, duration: buf.length / ac.sampleRate, sampleRate: ac.sampleRate, startStep16: T.recordStartStep || 0, buffer: buf, tag: T.bounceTag || null };
      bus.publish('transport:recorded', payload);
      publishState();
      return payload;
    };
    // bounce(bars): seek 0 → record → play → stop at exact AC time → trim to first tick sample → WAV
    T.bounce = async function (bars, o) {
      boot();
      o = o || {};
      if (bounceJob) return bounceJob;
      bounceJob = (async () => {
        if (T.playing) T.stop();
        await new Promise(r => setTimeout(r, 60));
        T.seek(o.fromBar || 1);
        if (!recorder) recorder = global.AudioRecorder.create(ac, K.audio.output);
        await recorder.ready;
        T.bitDepth = o.bitDepth || 24; T.bounceTag = o.tag || null; // X: a tagged bounce (e.g. a stem) is collected by whoever asked
        T.recording = true;
        await recorder.start();
        const t0 = ac.currentTime + 0.15;
        T.recordStartTime = t0; T.recordStartStep = T.position16;
        bus.publish('transport:bounce', { state: 'start', bars, time: t0 });
        const recordedP = new Promise(res => {
          const un = bus.subscribe('transport:recorded', (p) => { un(); res(p); }, 'transport');
          setTimeout(() => { un(); res(null); }, (bars * barSec() + 8) * 1000);
        });
        T.play({ at: t0 });
        const endT = t0 + bars * barSec();
        pendingStopAt = endT;
        const total = bars * barSec();
        await new Promise(res => {
          const iv = setInterval(() => {
            const p = Math.min(1, (ac.currentTime - t0) / total);
            bus.publish('transport:bounce', { state: 'progress', progress: p });
            if (!T.playing || ac.currentTime > endT + 0.3) { clearInterval(iv); res(); }
          }, 100);
        });
        if (T.playing) finishStop(endT);
        const out = await recordedP;
        T.bounceTag = null;
        bus.publish('transport:bounce', { state: 'done', duration: out && out.duration, tag: o.tag || null });
        return out;
      })();
      try { return await bounceJob; } finally { bounceJob = null; }
    };

    // ---- offline driver (tests + offline render): publish ticks for steps [from, to) starting at time t0
    T.renderTicks = function (fromStep, toStep, t0) {
      boot();
      T.playing = true;
      bus.publish('transport:play', { BPM: T.bpm, bpm: T.bpm, time: t0, step16: fromStep });
      let t = t0;
      for (let s = fromStep; s < toStep; s++) { emitTick(s, t); T.position16 = s; t += stepDur(); }
      return t;
    };
    T.renderStop = function (t) { T.playing = false; bus.publish('transport:stop', { time: t }); };

    function publishState() {
      bus.publish('transport:state', { playing: T.playing, recording: T.recording, bpm: T.bpm, position16: T.position16, loop: Object.assign({}, T.loop), metronome: T.metronome, clockMode: T.clockMode });
    }
    T.publishState = publishState;

    // ---- consumes
    const on = (t, fn) => bus.subscribe(t, (p) => { try { fn(p || {}); } catch (e) { K.fault('RUNTIME_003', { organism_id: 'eravos.transport', message: t + ': ' + e.message }); } }, 'transport');
    on('ui:transport-play', (p) => { if (p.toggle) T.toggle(); else if (T.playing && p.stopIfPlaying) T.stop(); else T.play(p); });
    on('ui:transport-stop', () => T.stop());
    on('ui:transport-record', (p) => { if (T.recording) T.stop(); else T.record(p); });
    on('ui:transport-bpm', (p) => { if (typeof p.bpm === 'number') T.setBpm(p.bpm); else K.fault('RUNTIME_002', { organism_id: 'eravos.transport', message: 'ui:transport-bpm needs {bpm:number}' }); });
    on('ui:transport-seek', (p) => T.seek(p.bar !== undefined ? p.bar : 1));
    on('ui:transport-restart', (p) => T.restart(p));
    on('ui:transport-tap', () => T.tap());
    on('ui:transport-loop', (p) => T.setLoop({ on: p.on !== undefined ? !!p.on : T.loop.on, startBar: p.start || p.startBar || T.loop.startBar, endBar: p.end || p.endBar || T.loop.endBar }));
    on('ui:transport-bounce', (p) => T.bounce(p.bars || 8, p));
    on('ui:transport-metronome', (p) => { T.metronome = !!p.on; if (p.countIn !== undefined) T.countIn = p.countIn; publishState(); });

    return T;
  }

  global.MasterTransport = { create };
})(typeof window !== 'undefined' ? window : globalThis);
