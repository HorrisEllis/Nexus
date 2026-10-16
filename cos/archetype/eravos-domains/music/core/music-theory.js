/* ERAVOS runtime R1 — music-theory.js → window.MusicTheory (pure, no state)
 * spec: eravos.runtime.music R1 */
(function (global) {
  'use strict';
  const SCALES = {
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
    dorian: [0, 2, 3, 5, 7, 9, 10],
    phrygian: [0, 1, 3, 5, 7, 8, 10],
    lydian: [0, 2, 4, 6, 7, 9, 11],
    mixolydian: [0, 2, 4, 5, 7, 9, 10],
    harmonic_minor: [0, 2, 3, 5, 7, 8, 11],
    pentatonic_major: [0, 2, 4, 7, 9],
    pentatonic_minor: [0, 3, 5, 7, 10],
    blues: [0, 3, 5, 6, 7, 10],
    chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  };
  const HINTS = {
    major: 'bright, happy, open', minor: 'darker, emotional — most EDM lives here', dorian: 'minor but hopeful',
    phrygian: 'dark, exotic, heavy', lydian: 'dreamy, floating', mixolydian: 'bluesy major, rock',
    harmonic_minor: 'dramatic, cinematic', pentatonic_major: 'can\'t-go-wrong happy', pentatonic_minor: 'can\'t-go-wrong dark',
    blues: 'gritty, soulful', chromatic: 'every note (no lock)',
  };
  const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  function scaleOf(scale) { return SCALES[scale] || SCALES.minor; }
  function mod(a, n) { return ((a % n) + n) % n; }

  function degreeToMidi(degree, octave, root, scale) {
    const s = scaleOf(scale), n = s.length;
    const d = Math.round(degree) - 1;
    const oct = Math.floor(d / n), idx = mod(d, n);
    return (octave + 1 + oct) * 12 + mod(root, 12) + s[idx];
  }
  function quantize(midi, root, scale) {
    const s = scaleOf(scale);
    let best = midi, bestD = Infinity;
    for (let m = midi - 12; m <= midi + 12; m++) {
      if (!s.includes(mod(m - root, 12))) continue;
      const d = Math.abs(m - midi);
      if (d < bestD || (d === bestD && m < best)) { best = m; bestD = d; } // ties go down
    }
    return best;
  }
  function inScale(midi, root, scale) { return scaleOf(scale).includes(mod(midi - root, 12)); }
  function degreeOf(midi, root, scale) {
    // 1-based degree + octave of an in-scale (or quantized) note
    const q = quantize(midi, root, scale), s = scaleOf(scale);
    const rel = q - mod(root, 12);
    const oct = Math.floor(rel / 12), pc = mod(rel, 12);
    return { degree: s.indexOf(pc) + 1, octave: oct - 1 };
  }
  function chord(degree, root, scale, type, octave) {
    const o = octave === undefined ? 4 : octave;
    const step = (k) => degreeToMidi(degree + k, o, root, scale);
    switch (type || 'triad') {
      case 'seventh': return [step(0), step(2), step(4), step(6)];
      case 'sus2': return [step(0), step(1), step(4)];
      case 'sus4': return [step(0), step(3), step(4)];
      case 'power': return [step(0), step(0) + 7, step(0) + 12];
      case 'add9': return [step(0), step(2), step(4), step(8)];
      default: return [step(0), step(2), step(4)];
    }
  }
  function chordName(notes) {
    if (!notes || !notes.length) return '';
    const r = notes[0], pcs = notes.map(n => mod(n - r, 12));
    let q = '';
    if (pcs.includes(3) && pcs.includes(7)) q = 'm';
    else if (pcs.includes(4) && pcs.includes(7)) q = '';
    else if (pcs.includes(3) && pcs.includes(6)) q = 'dim';
    else if (pcs.includes(4) && pcs.includes(8)) q = 'aug';
    else if (pcs.includes(2) && pcs.includes(7) && !pcs.includes(3) && !pcs.includes(4)) q = 'sus2';
    else if (pcs.includes(5) && pcs.includes(7)) q = 'sus4';
    else if (pcs.includes(7)) q = '5';
    if (pcs.includes(10)) q += '7'; else if (pcs.includes(11)) q += 'maj7';
    if (pcs.includes(2) && (pcs.includes(3) || pcs.includes(4))) q += ' add9';
    if (pcs.includes(1)) q += ' b9';
    if (pcs.includes(6) && q.indexOf('dim') < 0) q += ' #11';
    return NAMES[mod(r, 12)] + q;
  }
  function noteName(midi) { return NAMES[mod(midi, 12)] + (Math.floor(midi / 12) - 1); }
  function hz(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }
  function midiOfHz(f) { return 69 + 12 * Math.log2(f / 440); }
  function divisionBeats(div) {
    let s = String(div).trim(), mult = 1;
    if (s.endsWith('.')) { mult = 1.5; s = s.slice(0, -1); }
    else if (s.endsWith('t')) { mult = 2 / 3; s = s.slice(0, -1); }
    const [n, d] = s.split('/').map(Number);
    if (!n || !d) return 1;
    return (4 * n / d) * mult;
  }
  function divisionSec(div, bpm) { return divisionBeats(div) * 60 / bpm; }

  // ---------------- MIDI (SMF) ----------------
  function readVLQ(dv, p) { let v = 0, b; do { b = dv.getUint8(p.i++); v = (v << 7) | (b & 0x7f); } while (b & 0x80); return v; }
  function parse(ab) {
    const dv = new DataView(ab);
    const str = (o, n) => String.fromCharCode(...new Uint8Array(ab, o, n));
    if (str(0, 4) !== 'MThd') throw new Error('not a MIDI file');
    const ntr = dv.getUint16(10), division = dv.getUint16(12);
    if (division & 0x8000) throw new Error('SMPTE time division unsupported');
    const out = { ppq: division, tracks: [], tempo: 120 };
    let off = 8 + dv.getUint32(4);
    for (let t = 0; t < ntr && off < ab.byteLength; t++) {
      if (str(off, 4) !== 'MTrk') throw new Error('bad track chunk');
      const len = dv.getUint32(off + 4), end = off + 8 + len;
      const p = { i: off + 8 };
      let tick = 0, running = 0, name = 'Track ' + (t + 1);
      const open = new Map(), events = [];
      while (p.i < end) {
        tick += readVLQ(dv, p);
        let st = dv.getUint8(p.i);
        if (st & 0x80) p.i++; else st = running;
        if (st === 0xff) {
          const type = dv.getUint8(p.i++), l = readVLQ(dv, p);
          if (type === 0x03) name = str(p.i, l);
          if (type === 0x51) { const us = (dv.getUint8(p.i) << 16) | (dv.getUint8(p.i + 1) << 8) | dv.getUint8(p.i + 2); out.tempo = Math.round(60000000 / us * 1000) / 1000; }
          p.i += l; continue;
        }
        if (st === 0xf0 || st === 0xf7) { const l = readVLQ(dv, p); p.i += l; continue; }
        running = st;
        const hi = st & 0xf0;
        const d1 = dv.getUint8(p.i++), d2 = (hi === 0xc0 || hi === 0xd0) ? 0 : dv.getUint8(p.i++);
        if (hi === 0x90 && d2 > 0) { const k = d1; if (!open.has(k)) open.set(k, []); open.get(k).push({ tick, vel: d2 }); }
        else if (hi === 0x80 || (hi === 0x90 && d2 === 0)) {
          const q = open.get(d1);
          if (q && q.length) { const s = q.shift(); events.push({ tick: s.tick, note: d1, vel: s.vel / 127, dur: tick - s.tick }); }
        }
      }
      off = end;
      events.sort((a, b) => a.tick - b.tick || a.note - b.note);
      if (events.length || t > 0) out.tracks.push({ name, events });
    }
    out.tracks = out.tracks.filter(t => t.events.length);
    return out;
  }
  function vlq(n) { const b = [n & 0x7f]; while ((n >>= 7)) b.unshift((n & 0x7f) | 0x80); return b; }
  function write(song) {
    const ppq = song.ppq || 96, tempo = song.tempo || 120;
    const chunks = [];
    const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
    const text = (s) => Array.from(unescape(encodeURIComponent(s))).map(c => c.charCodeAt(0));
    const tempoTrack = [];
    const us = Math.round(60000000 / tempo);
    tempoTrack.push(0, 0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255);
    tempoTrack.push(0, 0xff, 0x58, 4, 4, 2, 24, 8);
    tempoTrack.push(0, 0xff, 0x2f, 0);
    chunks.push(tempoTrack);
    (song.tracks || []).forEach((tr, ti) => {
      const ev = [];
      tr.events.forEach(e => {
        const v = Math.max(1, Math.min(127, Math.round((e.vel === undefined ? 0.8 : e.vel) * 127)));
        const ch = tr.drums ? 9 : (ti % 15 >= 9 ? ti % 15 + 1 : ti % 15); // GM: drums on channel 10, melodic tracks skip it
        ev.push({ tick: e.tick, order: 1, bytes: [0x90 | ch, e.note, v] });
        ev.push({ tick: e.tick + Math.max(1, e.dur || 1), order: 0, bytes: [0x80 | ch, e.note, 0] });
      });
      ev.sort((a, b) => a.tick - b.tick || a.order - b.order);
      const bytes = [];
      const nm = text(tr.name || ('Track ' + (ti + 1)));
      bytes.push(0, 0xff, 0x03, ...vlq(nm.length), ...nm);
      let last = 0;
      ev.forEach(e => { bytes.push(...vlq(e.tick - last), ...e.bytes); last = e.tick; });
      bytes.push(0, 0xff, 0x2f, 0);
      chunks.push(bytes);
    });
    const out = [0x4d, 0x54, 0x68, 0x64, ...u32(6), 0, 1, (chunks.length >> 8) & 255, chunks.length & 255, (ppq >> 8) & 255, ppq & 255];
    chunks.forEach(c => out.push(0x4d, 0x54, 0x72, 0x6b, ...u32(c.length), ...c));
    return new Uint8Array(out).buffer;
  }

  global.MusicTheory = {
    SCALES, NAMES, HINTS, scales: Object.keys(SCALES),
    degreeToMidi, quantize, inScale, degreeOf, chord, chordName, noteName, hz, midiOfHz, divisionBeats, divisionSec,
    midi: { parse, write },
  };
})(typeof window !== 'undefined' ? window : globalThis);
