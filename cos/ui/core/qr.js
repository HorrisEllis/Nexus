'use strict';
/**
 * cos/ui/core/qr.js — a QR code from text, no dependencies (cos/spec/network.spec MOD-NET-QR).
 *
 * James, 2026-11-03: "i want to have it connect to a cloudflared url and popup on the screen with a qr code and the link under it"
 * Nothing in the tree drew a QR code, and COS takes no dependencies, so this is the encoder itself: byte mode, error correction M,
 * versions 1–10 (up to 213 bytes: a tunnel address is about 55). Longer text is refused, said, never cut.
 *
 *   COSQR.matrix(text) → { size, version, mask, modules: boolean[size][size] }
 *   COSQR.svg(text, { quiet = 4, dark = '#000', light = '#fff' }) → '<svg …>' (always black on white: a phone's scanner wants it so, in any theme)
 *
 * Checked against a reference encoder and a real decoder in tests/modules/test-cos-tunnel.test.js (CF-01).
 * Runs in the browser (window.COSQR) and in node (module.exports).
 */
(function (root) {
  // ── tables (error correction M): data codewords, EC codewords per block, [blocks, data codewords per block] groups ────────────────
  const EC_M = [null,
    { ec: 10, groups: [[1, 16]] }, { ec: 16, groups: [[1, 28]] }, { ec: 26, groups: [[1, 44]] }, { ec: 18, groups: [[2, 32]] },
    { ec: 24, groups: [[2, 43]] }, { ec: 16, groups: [[4, 27]] }, { ec: 18, groups: [[4, 31]] }, { ec: 22, groups: [[2, 38], [2, 39]] },
    { ec: 22, groups: [[3, 36], [2, 37]] }, { ec: 26, groups: [[4, 43], [1, 44]] }];
  const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
  const dataCodewords = (v) => EC_M[v].groups.reduce((a, [n, d]) => a + n * d, 0);
  const MAX_VERSION = 10;

  // ── Reed–Solomon over GF(256), polynomial 0x11D ───────────────────────────────────────────────────────────────────────────────
  const EXP = new Array(512), LOG = new Array(256);
  (function () { let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; } for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; })();
  const gmul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);
  function generator(n) { let g = [1]; for (let i = 0; i < n; i++) { const next = new Array(g.length + 1).fill(0); for (let j = 0; j < g.length; j++) { next[j] ^= g[j]; next[j + 1] ^= gmul(g[j], EXP[i]); } g = next; } return g; }
  function rsRemainder(data, n) {
    const g = generator(n), res = new Array(n).fill(0);
    for (const b of data) { const f = b ^ res.shift(); res.push(0); if (f) for (let i = 0; i < n; i++) res[i] ^= gmul(g[i + 1], f); }
    return res;
  }

  // ── the bit stream ────────────────────────────────────────────────────────────────────────────────────────────────────────────
  const utf8 = (s) => (typeof TextEncoder !== 'undefined' ? Array.from(new TextEncoder().encode(s)) : Array.from(Buffer.from(s, 'utf8')));
  function pickVersion(n) {
    for (let v = 1; v <= MAX_VERSION; v++) { const lenBits = v < 10 ? 8 : 16; if (4 + lenBits + n * 8 <= dataCodewords(v) * 8) return v; }
    throw new Error(`QR: ${n} bytes is more than this encoder holds (213); the address was not cut`);
  }
  function codewords(bytes, v) {
    const bits = []; const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    const cap = dataCodewords(v) * 8;
    put(0b0100, 4); put(bytes.length, v < 10 ? 8 : 16); bytes.forEach(b => put(b, 8));
    put(0, Math.min(4, cap - bits.length)); while (bits.length % 8) bits.push(0);
    const out = []; for (let i = 0; i < bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8).join(''), 2));
    for (let pad = 0xec; out.length < dataCodewords(v); pad ^= 0xec ^ 0x11) out.push(pad);
    // split into blocks, add each block's error correction, interleave
    const { ec, groups } = EC_M[v]; const blocks = []; let at = 0;
    for (const [n, d] of groups) for (let i = 0; i < n; i++) { const data = out.slice(at, at + d); at += d; blocks.push({ data, ec: rsRemainder(data, ec) }); }
    const res = []; const maxD = Math.max(...blocks.map(b => b.data.length));
    for (let i = 0; i < maxD; i++) for (const b of blocks) if (i < b.data.length) res.push(b.data[i]);
    for (let i = 0; i < ec; i++) for (const b of blocks) res.push(b.ec[i]);
    return res;
  }

  // ── the grid ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  // BCH codes for the format and version words (the standard shift-and-xor division)
  function formatBits(mask) { const data = (0b00 << 3) | mask; let rem = data; for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537); return ((data << 10) | rem) ^ 0x5412; }   // error correction M = 00
  function versionBits(v) { let rem = v; for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25); return (v << 12) | rem; }

  function build(v, cw, mask) {
    const size = 17 + 4 * v; const m = Array.from({ length: size }, () => new Array(size).fill(null)); const fn = Array.from({ length: size }, () => new Array(size).fill(false));
    const setF = (r, c, val) => { if (r >= 0 && r < size && c >= 0 && c < size) { m[r][c] = val; fn[r][c] = true; } };
    const finder = (r0, c0) => { for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) { const on = r >= 0 && r <= 6 && c >= 0 && c <= 6 && (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)); setF(r0 + r, c0 + c, on); } };
    finder(0, 0); finder(0, size - 7); finder(size - 7, 0);
    for (let i = 8; i < size - 8; i++) { setF(6, i, i % 2 === 0); setF(i, 6, i % 2 === 0); }
    const al = ALIGN[v];
    for (const r of al) for (const c of al) { if ((r === 6 && c === 6) || (r === 6 && c === al[al.length - 1]) || (r === al[al.length - 1] && c === 6)) continue; for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) setF(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1); }
    setF(size - 8, 8, true);   // the dark module
    for (let i = 0; i < 9; i++) { if (!fn[8][i]) setF(8, i, false); if (!fn[i][8]) setF(i, 8, false); }   // reserve the format areas
    for (let i = 0; i < 8; i++) { setF(8, size - 1 - i, false); setF(size - 1 - i, 8, false); }
    setF(size - 8, 8, true);
    if (v >= 7) { const vb = versionBits(v); for (let i = 0; i < 18; i++) { const bit = ((vb >> i) & 1) === 1; setF(Math.floor(i / 3), size - 11 + (i % 3), bit); setF(size - 11 + (i % 3), Math.floor(i / 3), bit); } }
    // data, zig-zag from the bottom right, two columns at a time, skipping the timing column
    const bits = []; for (const b of cw) for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1);
    let k = 0, up = true;
    for (let c = size - 1; c > 0; c -= 2) {
      if (c === 6) c--;
      for (let i = 0; i < size; i++) { const r = up ? size - 1 - i : i; for (const cc of [c, c - 1]) { if (fn[r][cc]) continue; let bit = k < bits.length ? bits[k++] === 1 : false; if (maskFn(mask, r, cc)) bit = !bit; m[r][cc] = bit; } }
      up = !up;
    }
    // format information, both copies (row, column)
    const fb = formatBits(mask); const bit = (i) => ((fb >> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) m[i][8] = bit(i); m[7][8] = bit(6); m[8][8] = bit(7); m[8][7] = bit(8); for (let i = 9; i < 15; i++) m[8][14 - i] = bit(i);
    for (let i = 0; i < 8; i++) m[8][size - 1 - i] = bit(i); for (let i = 8; i < 15; i++) m[size - 15 + i][8] = bit(i);
    m[size - 8][8] = true;
    return m;
  }
  function maskFn(n, r, c) {
    switch (n) {
      case 0: return (r + c) % 2 === 0; case 1: return r % 2 === 0; case 2: return c % 3 === 0; case 3: return (r + c) % 3 === 0;
      case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0; case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
      case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0; default: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
    }
  }
  function penalty(m) {
    const n = m.length; let p = 0;
    const runs = (line) => { let s = 0, run = 1; for (let i = 1; i < n; i++) { if (line[i] === line[i - 1]) { run++; } else { if (run >= 5) s += 3 + (run - 5); run = 1; } } if (run >= 5) s += 3 + (run - 5); return s; };
    const pat = [true, false, true, true, true, false, true], light4 = [false, false, false, false];
    const finderLike = (line) => { let s = 0; for (let i = 0; i + 11 <= n; i++) { const w = line.slice(i, i + 11); const a = pat.every((x, j) => w[j] === x) && light4.every((x, j) => w[7 + j] === x); const b = light4.every((x, j) => w[j] === x) && pat.every((x, j) => w[4 + j] === x); if (a) s += 40; if (b) s += 40; } return s; };
    for (let r = 0; r < n; r++) { p += runs(m[r]); p += finderLike(m[r]); }
    for (let c = 0; c < n; c++) { const col = m.map(row => row[c]); p += runs(col); p += finderLike(col); }
    for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++) { const x = m[r][c]; if (x === m[r][c + 1] && x === m[r + 1][c] && x === m[r + 1][c + 1]) p += 3; }
    let dark = 0; for (const row of m) for (const x of row) if (x) dark++;
    p += Math.floor(Math.abs((dark * 100) / (n * n) - 50) / 5) * 10;
    return p;
  }

  function matrix(text) {
    const bytes = utf8(String(text)); const v = pickVersion(bytes.length); const cw = codewords(bytes, v);
    let best = null;
    for (let mask = 0; mask < 8; mask++) { const m = build(v, cw, mask); const p = penalty(m); if (!best || p < best.p) best = { p, mask, m }; }
    return { size: best.m.length, version: v, mask: best.mask, modules: best.m };
  }
  function svg(text, { quiet = 4, dark = '#000', light = '#fff', label = 'QR code' } = {}) {
    const { size, modules } = matrix(text); const total = size + quiet * 2; let d = '';
    for (let r = 0; r < size; r++) for (let c = 0; c < size;) { if (!modules[r][c]) { c++; continue; } let e = c; while (e < size && modules[r][e]) e++; d += `M${c + quiet} ${r + quiet}h${e - c}v1h${-(e - c)}z`; c = e; }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges" role="img" aria-label="${label}"><rect width="${total}" height="${total}" fill="${light}"/><path d="${d}" fill="${dark}"/></svg>`;
  }

  const api = { matrix, svg, MAX_BYTES: 213 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.COSQR = api;
})(typeof window !== 'undefined' ? window : globalThis);
