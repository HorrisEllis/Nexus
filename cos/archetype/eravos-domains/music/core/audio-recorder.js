/* ERAVOS runtime R5 — audio-recorder.js → window.AudioRecorder
 * capture: AudioWorklet (Blob) posting Float32 frames + frame index; fallback ScriptProcessor 4096
 * encode: WAV PCM 16-bit (TPDF dither) | 24-bit | 32-bit float ; trim by exact frame indices */
(function (global) {
  'use strict';
  const WORKLET_SRC = `
class EravosRecorder extends AudioWorkletProcessor {
  constructor() { super(); this.on = false; this.port.onmessage = (e) => { if (e.data === 'start') this.on = true; else if (e.data === 'stop') { this.on = false; this.port.postMessage({ done: true, frame: currentFrame }); } else if (e.data === 'kill') this.dead = true; }; }
  process(inputs) {
    if (this.dead) return false;
    if (!this.on) return true;
    const inp = inputs[0];
    const L = inp[0] ? inp[0].slice() : new Float32Array(128);
    const R = inp[1] ? inp[1].slice() : L.slice();
    this.port.postMessage({ frame: currentFrame, L, R }, [L.buffer, R.buffer]);
    return true;
  }
}
registerProcessor('eravos-recorder', EravosRecorder);`;

  function create(ac, sourceNode) {
    const rec = { recording: false, mode: null, sampleRate: ac.sampleRate };
    let chunks = [], node = null, sp = null, sink = null, doneResolve = null;

    const ready = (async () => {
      sink = ac.createGain(); sink.gain.value = 0; sink.connect(ac.destination);
      try {
        await global.OrganismSDK.loadWorklet(ac, 'eravos-recorder', WORKLET_SRC);
        node = new AudioWorkletNode(ac, 'eravos-recorder', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 2, channelCountMode: 'explicit' });
        node.port.onmessage = (e) => {
          const d = e.data;
          if (d.done) { if (doneResolve) { doneResolve(); doneResolve = null; } return; }
          chunks.push(d);
        };
        sourceNode.connect(node); node.connect(sink);
        rec.mode = 'worklet';
      } catch (e) {
        sp = ac.createScriptProcessor(4096, 2, 2);
        sp.onaudioprocess = (ev) => {
          if (!rec.recording) return;
          const frame = Math.round(ev.playbackTime * ac.sampleRate);
          chunks.push({ frame, L: ev.inputBuffer.getChannelData(0).slice(), R: ev.inputBuffer.getChannelData(1).slice() });
        };
        sourceNode.connect(sp); sp.connect(sink);
        rec.mode = 'scriptprocessor';
      }
      return rec.mode;
    })();
    rec.ready = ready;

    rec.start = async function () {
      await ready;
      chunks = []; rec.recording = true;
      if (node) node.port.postMessage('start');
    };
    rec.stop = async function () {
      await ready;
      rec.recording = false;
      if (node) { await new Promise(res => { doneResolve = res; node.port.postMessage('stop'); setTimeout(res, 500); }); }
      const out = chunks; chunks = [];
      return out;
    };
    // assemble chunks into AudioBuffer covering [startFrame, endFrame)
    rec.assemble = function (cs, startFrame, endFrame) {
      if (!cs.length) return ac.createBuffer(2, 1, ac.sampleRate);
      const first = cs[0].frame, last = cs[cs.length - 1].frame + cs[cs.length - 1].L.length;
      const s = startFrame === undefined ? first : startFrame, e = endFrame === undefined ? last : endFrame;
      const len = Math.max(1, e - s);
      const buf = ac.createBuffer(2, len, ac.sampleRate);
      const L = buf.getChannelData(0), R = buf.getChannelData(1);
      cs.forEach(c => {
        for (let i = 0; i < c.L.length; i++) {
          const idx = c.frame + i - s;
          if (idx >= 0 && idx < len) { L[idx] = c.L[i]; R[idx] = c.R[i]; }
        }
      });
      return buf;
    };
    rec.dispose = function () {
      try { if (node) { node.port.postMessage('kill'); sourceNode.disconnect(node); node.disconnect(); } } catch (e) {}
      try { if (sp) { sourceNode.disconnect(sp); sp.disconnect(); } } catch (e) {}
      try { sink.disconnect(); } catch (e) {}
    };
    return rec;
  }

  function encodeWAV(buffer, bits) {
    bits = bits || 24;
    const ch = buffer.numberOfChannels !== undefined ? buffer.numberOfChannels : buffer.channels.length;
    const sr = buffer.sampleRate;
    const data = []; for (let c = 0; c < ch; c++) data.push(buffer.getChannelData ? buffer.getChannelData(c) : buffer.channels[c]);
    const n = data[0].length;
    const float = bits === 32;
    const bps = bits / 8, blockAlign = ch * bps, dataLen = n * blockAlign;
    const ab = new ArrayBuffer(44 + dataLen), dv = new DataView(ab);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); dv.setUint32(4, 36 + dataLen, true); w(8, 'WAVE'); w(12, 'fmt ');
    dv.setUint32(16, 16, true); dv.setUint16(20, float ? 3 : 1, true); dv.setUint16(22, ch, true);
    dv.setUint32(24, sr, true); dv.setUint32(28, sr * blockAlign, true); dv.setUint16(32, blockAlign, true); dv.setUint16(34, bits, true);
    w(36, 'data'); dv.setUint32(40, dataLen, true);
    let o = 44;
    let seed = 22222;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < ch; c++) {
        let x = data[c][i];
        if (float) { dv.setFloat32(o, x, true); o += 4; continue; }
        if (bits === 16) {
          x = x * 32767 + (rnd() - rnd()); // TPDF dither ±1 LSB
          x = Math.max(-32768, Math.min(32767, Math.round(x)));
          dv.setInt16(o, x, true); o += 2;
        } else {
          x = Math.max(-8388608, Math.min(8388607, Math.round(x * 8388607)));
          dv.setUint8(o, x & 255); dv.setUint8(o + 1, (x >> 8) & 255); dv.setUint8(o + 2, (x >> 16) & 255); o += 3;
        }
      }
    }
    return ab;
  }

  function decodeWAVHeader(ab) {
    const dv = new DataView(ab);
    const s = (o, l) => String.fromCharCode(...new Uint8Array(ab, o, l));
    if (s(0, 4) !== 'RIFF' || s(8, 4) !== 'WAVE') return null;
    return { format: dv.getUint16(20, true), channels: dv.getUint16(22, true), sampleRate: dv.getUint32(24, true), bits: dv.getUint16(34, true), frames: dv.getUint32(40, true) / (dv.getUint16(32, true)) };
  }

  global.AudioRecorder = { create, encodeWAV, decodeWAVHeader, WORKLET_SRC };
})(typeof window !== 'undefined' ? window : globalThis);
