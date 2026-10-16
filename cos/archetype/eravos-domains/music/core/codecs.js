/* ERAVOS music domain — codecs.js → window.Codecs (spec eravos.codecs)
 * Every export format from one AudioBuffer:
 *   WAV  16 / 24-bit PCM, 32-bit float · AIFF 16 / 24 · FLAC 16 / 24 (own encoder: fixed predictors 0–4 per channel,
 *   Rice2 residuals, CRC-8/16 — lossless, verified by round-trip) · MP3 128 / 192 / 256 / 320 (lamejs, LGPL, separate
 *   file) · Opus in WebM or Ogg (MediaRecorder — real-time, where the browser offers it) · stems as a ZIP of WAVs.
 * encode(buffer, id) → Promise<{ blob, ext, mime, bytes }>. Formats the runtime cannot make are listed with ok:false. */
(function (global) {
  'use strict';
  const clamp = (x) => x < -1 ? -1 : x > 1 ? 1 : x;
  function chans(buf) { const c = []; for (let i = 0; i < buf.numberOfChannels; i++) c.push(buf.getChannelData(i)); return c; }
  // TPDF dither for 16-bit
  function quant(x, bits, rnd) { const m = Math.pow(2, bits - 1) - 1; const d = bits <= 16 && rnd ? (rnd() - rnd()) / m : 0; return Math.max(-m - 1, Math.min(m, Math.round(clamp(x + d) * m))); }
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  // ---------------------------------------------------------------- WAV
  function wav(buf, bits) {
    const C = chans(buf), n = buf.length, nc = C.length, flt = bits === 32, bps = bits / 8, data = n * nc * bps;
    const ab = new ArrayBuffer(44 + data), dv = new DataView(ab), w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); dv.setUint32(4, 36 + data, true); w(8, 'WAVE'); w(12, 'fmt '); dv.setUint32(16, 16, true);
    dv.setUint16(20, flt ? 3 : 1, true); dv.setUint16(22, nc, true); dv.setUint32(24, buf.sampleRate, true); dv.setUint32(28, buf.sampleRate * nc * bps, true);
    dv.setUint16(32, nc * bps, true); dv.setUint16(34, bits, true); w(36, 'data'); dv.setUint32(40, data, true);
    let o = 44; const r = rng(7);
    for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) {
      const x = C[c][i];
      if (flt) { dv.setFloat32(o, x, true); o += 4; }
      else if (bits === 16) { dv.setInt16(o, quant(x, 16, r), true); o += 2; }
      else { const v = quant(x, 24); dv.setUint8(o, v & 255); dv.setUint8(o + 1, (v >> 8) & 255); dv.setUint8(o + 2, (v >> 16) & 255); o += 3; }
    }
    return ab;
  }
  // ---------------------------------------------------------------- AIFF (big-endian, 80-bit extended sample rate)
  function ext80(v, dv, o) {
    let exp = 16383 + Math.floor(Math.log2(v)); let mant = v / Math.pow(2, Math.floor(Math.log2(v)));
    dv.setUint16(o, exp); const hi = Math.floor(mant * 0x80000000); dv.setUint32(o + 2, hi >>> 0); dv.setUint32(o + 6, Math.floor((mant * 0x80000000 - hi) * 0x100000000) >>> 0);
  }
  function aiff(buf, bits) {
    const C = chans(buf), n = buf.length, nc = C.length, bps = bits / 8, data = n * nc * bps;
    const ab = new ArrayBuffer(54 + data), dv = new DataView(ab), w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'FORM'); dv.setUint32(4, 46 + data); w(8, 'AIFF'); w(12, 'COMM'); dv.setUint32(16, 18); dv.setUint16(20, nc); dv.setUint32(22, n); dv.setUint16(26, bits); ext80(buf.sampleRate, dv, 28);
    w(38, 'SSND'); dv.setUint32(42, data + 8); dv.setUint32(46, 0); dv.setUint32(50, 0);
    let o = 54; const r = rng(7);
    for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) { const v = quant(C[c][i], bits, bits === 16 ? r : null); if (bits === 16) { dv.setInt16(o, v); o += 2; } else { dv.setUint8(o, (v >> 16) & 255); dv.setUint8(o + 1, (v >> 8) & 255); dv.setUint8(o + 2, v & 255); o += 3; } }
    return ab;
  }

  // ---------------------------------------------------------------- FLAC
  function BitWriter(cap) {
    let buf = new Uint8Array(cap || 1 << 16), pos = 0, acc = 0, nb = 0;
    const grow = () => { const b = new Uint8Array(buf.length * 2); b.set(buf); buf = b; };
    return {
      bits(v, n) { // v unsigned, n ≤ 36 — word-level: ≤ 24 bits per step into a 31-bit accumulator
        if (n > 24) { this.bits(Math.floor(v / 16777216), n - 24); this.bits(v % 16777216, 24); return; }
        acc = (acc << n) | (v & ((1 << n) - 1)); nb += n;
        while (nb >= 8) { nb -= 8; if (pos >= buf.length - 8) grow(); buf[pos++] = (acc >>> nb) & 255; }
        acc &= (1 << nb) - 1;
      },
      sbits(v, n) { this.bits(v < 0 ? v + Math.pow(2, n) : v, n); },
      unary(q) { while (q >= 24) { this.bits(0, 24); q -= 24; } this.bits(1, q + 1); },
      align() { if (nb) this.bits(0, 8 - nb); },
      get pos() { return pos; }, bytes(from, to) { return buf.subarray(from, to); }, out() { return buf.slice(0, pos); },
    };
  }
  const CRC8 = new Uint8Array(256), CRC16 = new Uint16Array(256);
  for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 0x80 ? ((c << 1) ^ 0x07) & 255 : (c << 1) & 255; CRC8[i] = c; let d = i << 8; for (let k = 0; k < 8; k++) d = d & 0x8000 ? ((d << 1) ^ 0x8005) & 0xffff : (d << 1) & 0xffff; CRC16[i] = d; }
  const crc8 = (b) => { let c = 0; for (let i = 0; i < b.length; i++) c = CRC8[c ^ b[i]]; return c; };
  const crc16 = (b) => { let c = 0; for (let i = 0; i < b.length; i++) c = ((c << 8) ^ CRC16[(c >> 8) ^ b[i]]) & 0xffff; return c; };
  function utf8num(w, v) { // FLAC "UTF-8" coded frame number
    if (v < 0x80) { w.bits(v, 8); return; }
    const n = v < 0x800 ? 2 : v < 0x10000 ? 3 : v < 0x200000 ? 4 : v < 0x4000000 ? 5 : 6;
    w.bits((0xff00 >> n) & 0xff | (v >> (6 * (n - 1))), 8);
    for (let i = n - 2; i >= 0; i--) w.bits(0x80 | ((v >> (6 * i)) & 0x3f), 8);
  }
  function flacSubframe(w, x, bps) {
    const n = x.length;
    if (x.every(v => v === x[0])) { w.bits(0, 1); w.bits(0, 6); w.bits(0, 1); w.sbits(x[0], bps); return; } // CONSTANT
    // pick the fixed predictor (order 0–4) with the smallest residual magnitude
    let best = null;
    for (let ord = 0; ord <= 4 && ord < n; ord++) {
      const r = new Int32Array(n - ord); let sum = 0;
      for (let i = ord; i < n; i++) {
        const p = ord === 0 ? 0 : ord === 1 ? x[i - 1] : ord === 2 ? 2 * x[i - 1] - x[i - 2] : ord === 3 ? 3 * x[i - 1] - 3 * x[i - 2] + x[i - 3] : 4 * x[i - 1] - 6 * x[i - 2] + 4 * x[i - 3] - x[i - 4];
        r[i - ord] = x[i] - p; sum += Math.abs(r[i - ord]);
      }
      if (!best || sum < best.sum) best = { ord, r, sum };
    }
    const mean = best.sum / Math.max(1, best.r.length);
    let k = mean > 0 ? Math.max(0, Math.floor(Math.log2(mean * 0.69 + 1))) : 0; k = Math.min(30, k);
    const est = best.r.length * (k + 1) + best.r.reduce((s, v) => s + ((v >= 0 ? 2 * v : -2 * v - 1) >>> k), 0);
    if (est > n * bps) { w.bits(0, 1); w.bits(1, 6); w.bits(0, 1); for (let i = 0; i < n; i++) w.sbits(x[i], bps); return; } // VERBATIM
    w.bits(0, 1); w.bits(8 | best.ord, 6); w.bits(0, 1);
    for (let i = 0; i < best.ord; i++) w.sbits(x[i], bps);
    w.bits(1, 2); w.bits(0, 4); w.bits(k, 5); // RICE2, partition order 0
    for (let i = 0; i < best.r.length; i++) { const v = best.r[i], u = v >= 0 ? 2 * v : -2 * v - 1; w.unary(Math.floor(u / Math.pow(2, k))); if (k) w.bits(u % Math.pow(2, k), k); }
  }
  function flac(buf, bps) {
    const C = chans(buf).slice(0, 8), nc = C.length, n = buf.length, BS = 4096, sr = buf.sampleRate;
    const r = bps === 16 ? rng(7) : null;
    const ints = C.map(() => new Int32Array(n)); for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) ints[c][i] = quant(C[c][i], bps, r); // interleaved order = same dither as WAV/AIFF
    const w = BitWriter(n * nc * bps / 8 + 4096);
    w.bits(0x664c6143, 32); // fLaC
    w.bits(1, 1); w.bits(0, 7); w.bits(34, 24); // last metadata block, STREAMINFO, length 34
    w.bits(BS, 16); w.bits(BS, 16); w.bits(0, 24); w.bits(0, 24); w.bits(sr, 20); w.bits(nc - 1, 3); w.bits(bps - 1, 5); w.bits(n, 36);
    for (let i = 0; i < 4; i++) w.bits(0, 32); // MD5 unknown (allowed)
    for (let f = 0, s = 0; s < n; f++, s += BS) {
      const len = Math.min(BS, n - s), h0 = w.pos;
      w.bits(0x3ffe, 14); w.bits(0, 1); w.bits(0, 1); w.bits(7, 4); w.bits(0, 4); w.bits(nc - 1, 4); w.bits(bps === 16 ? 4 : 6, 3); w.bits(0, 1);
      utf8num(w, f); w.bits(len - 1, 16);
      w.bits(crc8(w.bytes(h0, w.pos)), 8);
      for (let c = 0; c < nc; c++) flacSubframe(w, ints[c].subarray(s, s + len), bps);
      w.align(); w.bits(crc16(w.bytes(h0, w.pos)), 16);
    }
    return w.out().buffer;
  }

  // ---------------------------------------------------------------- MP3 (lamejs)
  function mp3(buf, kbps) {
    const L = global.lamejs; if (!L || !L.Mp3Encoder) throw new Error('MP3 encoder (lame.min.js) not loaded');
    const nc = Math.min(2, buf.numberOfChannels), enc = new L.Mp3Encoder(nc, buf.sampleRate, kbps), C = chans(buf), n = buf.length, r = rng(5);
    const to16 = (a) => { const o = new Int16Array(a.length); for (let i = 0; i < a.length; i++) o[i] = quant(a[i], 16, r); return o; };
    const l = to16(C[0]), rr = nc > 1 ? to16(C[1]) : null, parts = [];
    for (let i = 0; i < n; i += 1152) { const d = nc > 1 ? enc.encodeBuffer(l.subarray(i, i + 1152), rr.subarray(i, i + 1152)) : enc.encodeBuffer(l.subarray(i, i + 1152)); if (d.length) parts.push(new Uint8Array(d)); }
    const e = enc.flush(); if (e.length) parts.push(new Uint8Array(e));
    return new Blob(parts, { type: 'audio/mpeg' });
  }
  // ---------------------------------------------------------------- Opus (MediaRecorder, real time)
  function opusMime(container) {
    const MR = global.MediaRecorder; if (!MR || !MR.isTypeSupported) return null;
    const c = container === 'ogg' ? ['audio/ogg;codecs=opus', 'audio/ogg'] : ['audio/webm;codecs=opus', 'audio/webm'];
    return c.find(t => MR.isTypeSupported(t)) || null;
  }
  function opus(buf, container, kbps, onProgress) {
    const mime = opusMime(container); if (!mime) return Promise.reject(new Error(`this browser cannot record ${container}/Opus`));
    const ac = new (global.AudioContext || global.webkitAudioContext)({ sampleRate: buf.sampleRate });
    const src = ac.createBufferSource(); src.buffer = buf; const dst = ac.createMediaStreamDestination(); src.connect(dst);
    const rec = new global.MediaRecorder(dst.stream, { mimeType: mime, audioBitsPerSecond: kbps * 1000 }); const parts = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) parts.push(e.data); };
    return new Promise((res, rej) => {
      rec.onstop = () => { ac.close(); res(new Blob(parts, { type: mime })); }; rec.onerror = (e) => rej(e.error || new Error('MediaRecorder error'));
      const t0 = ac.currentTime; const iv = setInterval(() => { if (onProgress) onProgress(Math.min(1, (ac.currentTime - t0) / buf.duration)); }, 200);
      src.onended = () => { clearInterval(iv); setTimeout(() => rec.stop(), 120); };
      rec.start(250); src.start();
    });
  }
  // ---------------------------------------------------------------- ZIP (stored) for stems
  const CRC32 = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC32[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  function zip(files) { // [{name, data:Uint8Array}]
    const enc = new TextEncoder(), locals = [], cents = []; let off = 0;
    files.forEach(f => {
      const nm = enc.encode(f.name), d = f.data, crc = crc32(d), lh = new DataView(new ArrayBuffer(30)), ch = new DataView(new ArrayBuffer(46));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint32(14, crc, true); lh.setUint32(18, d.length, true); lh.setUint32(22, d.length, true); lh.setUint16(26, nm.length, true);
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint32(16, crc, true); ch.setUint32(20, d.length, true); ch.setUint32(24, d.length, true); ch.setUint16(28, nm.length, true); ch.setUint32(42, off, true);
      locals.push(new Uint8Array(lh.buffer), nm, d); cents.push(new Uint8Array(ch.buffer), nm); off += 30 + nm.length + d.length;
    });
    const cdLen = cents.reduce((s, x) => s + x.length, 0), end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdLen, true); end.setUint32(16, off, true);
    return new Blob(locals.concat(cents, [new Uint8Array(end.buffer)]), { type: 'application/zip' });
  }

  const FORMATS = [
    { id: 'wav24', label: 'WAV 24-bit', ext: 'wav', mime: 'audio/wav', kind: 'lossless', make: (b) => wav(b, 24) },
    { id: 'wav16', label: 'WAV 16-bit (CD, dithered)', ext: 'wav', mime: 'audio/wav', kind: 'lossless', make: (b) => wav(b, 16) },
    { id: 'wav32f', label: 'WAV 32-bit float', ext: 'wav', mime: 'audio/wav', kind: 'lossless', make: (b) => wav(b, 32) },
    { id: 'flac24', label: 'FLAC 24-bit', ext: 'flac', mime: 'audio/flac', kind: 'lossless', make: (b) => flac(b, 24) },
    { id: 'flac16', label: 'FLAC 16-bit', ext: 'flac', mime: 'audio/flac', kind: 'lossless', make: (b) => flac(b, 16) },
    { id: 'aiff24', label: 'AIFF 24-bit', ext: 'aiff', mime: 'audio/aiff', kind: 'lossless', make: (b) => aiff(b, 24) },
    { id: 'aiff16', label: 'AIFF 16-bit', ext: 'aiff', mime: 'audio/aiff', kind: 'lossless', make: (b) => aiff(b, 16) },
    { id: 'mp3-320', label: 'MP3 320 kbps', ext: 'mp3', mime: 'audio/mpeg', kind: 'lossy', make: (b) => mp3(b, 320), ok: () => !!(global.lamejs && global.lamejs.Mp3Encoder) },
    { id: 'mp3-192', label: 'MP3 192 kbps', ext: 'mp3', mime: 'audio/mpeg', kind: 'lossy', make: (b) => mp3(b, 192), ok: () => !!(global.lamejs && global.lamejs.Mp3Encoder) },
    { id: 'mp3-128', label: 'MP3 128 kbps', ext: 'mp3', mime: 'audio/mpeg', kind: 'lossy', make: (b) => mp3(b, 128), ok: () => !!(global.lamejs && global.lamejs.Mp3Encoder) },
    { id: 'opus-webm', label: 'Opus 192 (WebM, real-time)', ext: 'webm', mime: 'audio/webm', kind: 'lossy', realtime: true, make: (b, o) => opus(b, 'webm', 192, o && o.onProgress), ok: () => !!opusMime('webm') },
    { id: 'opus-ogg', label: 'Opus 192 (Ogg, real-time)', ext: 'ogg', mime: 'audio/ogg', kind: 'lossy', realtime: true, make: (b, o) => opus(b, 'ogg', 192, o && o.onProgress), ok: () => !!opusMime('ogg') },
  ];
  async function encode(buffer, id, o) {
    const f = FORMATS.find(x => x.id === id); if (!f) throw new Error('unknown format ' + id);
    if (f.ok && !f.ok()) throw new Error(f.label + ' is not available in this runtime');
    const r = await f.make(buffer, o);
    const blob = r instanceof Blob ? r : new Blob([r], { type: f.mime });
    return { blob, ext: f.ext, mime: f.mime, bytes: blob.size, label: f.label };
  }
  function download(blob, name) {
    const url = URL.createObjectURL(blob), a = global.document.createElement('a'); a.href = url; a.download = name; global.document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  global.Codecs = { FORMATS: FORMATS.map(f => ({ id: f.id, label: f.label, ext: f.ext, kind: f.kind, realtime: !!f.realtime, available: () => !f.ok || f.ok() })), encode, download, wav, aiff, flac, mp3, zip, crc32 };
})(typeof window !== 'undefined' ? window : globalThis);
