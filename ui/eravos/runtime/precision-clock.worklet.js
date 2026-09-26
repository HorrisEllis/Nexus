/* ═══════════════════════════════════════════════════════════
   PRECISION CLOCK WORKLET  v1.0.0
   runtime/precision-clock.worklet.js

   Runs on the audio thread — completely isolated from the
   JavaScript main thread, GC, rendering, and event loop.

   Fires a tick message to the main thread every process()
   call (~2.9ms at 44.1kHz / 128 samples). Main thread
   uses these ticks to drive the lookahead scheduler.

   This file is loaded via AudioContext.audioWorklet.addModule()
   ═══════════════════════════════════════════════════════════ */

class PrecisionClockProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._running    = false;
    this._interval   = 0;      /* samples between ticks */
    this._phase      = 0;      /* sample counter */
    this._sampleRate = sampleRate;

    this.port.onmessage = ({ data }) => {
      if (data.type === 'start') {
        this._running  = true;
        this._interval = Math.round(this._sampleRate * data.intervalSec);
        this._phase    = 0;
      }
      if (data.type === 'stop') {
        this._running = false;
        this._phase   = 0;
      }
      if (data.type === 'set-interval') {
        this._interval = Math.round(this._sampleRate * data.intervalSec);
      }
    };
  }

  process() {
    if (!this._running || this._interval <= 0) return true;

    const blockSize = 128;
    for (let i = 0; i < blockSize; i++) {
      this._phase++;
      if (this._phase >= this._interval) {
        this._phase = 0;
        /* currentTime is the time of the FIRST sample in this block.
           The tick fires at sample i within the block.              */
        const tickTime = currentTime + i / this._sampleRate;
        this.port.postMessage({ type: 'tick', time: tickTime });
      }
    }
    return true; /* keep alive */
  }
}

registerProcessor('precision-clock', PrecisionClockProcessor);
