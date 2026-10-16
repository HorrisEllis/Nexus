/* ERAVOS runtime R3 — precision-clock.js → window.PrecisionClock
 * Worklet source inlined → Blob URL → audioWorklet.addModule (works on file://, F-06)
 * fallback_1: Blob Worker setInterval(25 ms) ; fallback_2: main-thread setTimeout
 * The clock only wakes the scheduler; all musical time is AudioContext time. */
(function (global) {
  'use strict';
  const TICK_INTERVAL = 0.025, LOOKAHEAD = 0.100;

  const WORKLET_SRC = `
class EravosClockProcessor extends AudioWorkletProcessor {
  constructor() { super(); this.interval = Math.round(sampleRate * ${TICK_INTERVAL}); this.acc = 0; this.running = true;
    this.port.onmessage = (e) => { if (e.data === 'stop') this.running = false; }; }
  process() { this.acc += 128; if (this.acc >= this.interval) { this.acc = 0; this.port.postMessage(currentTime); } return this.running; }
}
registerProcessor('eravos-clock', EravosClockProcessor);`;

  const WORKER_SRC = `let t=null; onmessage=(e)=>{ if(e.data==='start'){ if(t) clearInterval(t); t=setInterval(()=>postMessage('tick'), ${TICK_INTERVAL * 1000}); } else if(e.data==='stop'){ clearInterval(t); t=null; } };`;

  function create(ac, onWake) {
    const clock = { mode: 'timeout', running: false, lookahead: LOOKAHEAD, interval: TICK_INTERVAL };
    let node = null, worker = null, timer = null, sink = null;

    async function tryWorklet() {
      if (!ac.audioWorklet || typeof AudioWorkletNode === 'undefined') throw new Error('no worklet');
      await global.OrganismSDK.loadWorklet(ac, 'eravos-clock', WORKLET_SRC);
      node = new AudioWorkletNode(ac, 'eravos-clock', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1] });
      sink = ac.createGain(); sink.gain.value = 0;
      node.connect(sink); sink.connect(ac.destination);
      node.port.onmessage = () => { if (clock.running) onWake(); };
      clock.mode = 'worklet';
    }
    function tryWorker() {
      const url = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'application/javascript' }));
      worker = new Worker(url);
      worker.onmessage = () => { if (clock.running) onWake(); };
      worker.postMessage('start');
      clock.mode = 'worker';
    }
    function useTimeout() {
      clock.mode = 'timeout';
      const loop = () => { if (!clock.running) return; onWake(); timer = setTimeout(loop, TICK_INTERVAL * 1000); };
      timer = setTimeout(loop, 0);
    }

    clock.ready = (async () => {
      try { await tryWorklet(); }
      catch (e) {
        try { tryWorker(); } catch (e2) { clock.mode = 'timeout'; }
      }
      return clock.mode;
    })();

    clock.start = function () {
      clock.running = true;
      if (clock.mode === 'timeout') useTimeout();
      onWake();
    };
    clock.stop = function () { clock.running = false; if (timer) clearTimeout(timer); timer = null; };
    clock.dispose = function () {
      clock.stop();
      if (node) { try { node.port.postMessage('stop'); node.disconnect(); } catch (e) {} }
      if (sink) try { sink.disconnect(); } catch (e) {}
      if (worker) worker.terminate();
    };
    return clock;
  }

  global.PrecisionClock = { create, LOOKAHEAD, TICK_INTERVAL, WORKLET_SRC };
})(typeof window !== 'undefined' ? window : globalThis);
