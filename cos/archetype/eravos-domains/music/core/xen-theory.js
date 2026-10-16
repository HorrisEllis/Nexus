/* ERAVOS music domain — xen-theory.js → window.XenTheory (spec eravos.xen-theory)
 * Non-standard harmonic data: tunings that are not 12-TET (any EDO, equal divisions of IRRATIONAL periods,
 * non-octave scales, irrational generators stacked into MOS scales, just intonation, Scala-style custom lists),
 * inharmonic partial spectra (stretched, piano-B, φ-series, bar / membrane / bell modes, tuning-matched),
 * and the maths to analyse them: cents, continued-fraction rational approximation, Tenney height, Sethares
 * sensory dissonance curves, beat rates, f0 + inharmonicity estimation, spectral peak picking.
 * Pure functions; no audio nodes — engines and analysers share it. */
(function (global) {
  'use strict';
  const PHI = (1 + Math.sqrt(5)) / 2;
  const CONST = {
    phi: PHI, 'φ': PHI, pi: Math.PI, 'π': Math.PI, e: Math.E, sqrt2: Math.SQRT2, sqrt3: Math.sqrt(3), sqrt5: Math.sqrt(5),
    silver: 1 + Math.SQRT2, bronze: (3 + Math.sqrt(13)) / 2, plastic: 1.324717957244746, tau: 2 * Math.PI,
  };
  const GENERATORS = { // irrational (and a few rational, for comparison) generators / periods, by name
    'φ (golden)': PHI, '√2': Math.SQRT2, '√3': Math.sqrt(3), '√5': Math.sqrt(5), 'π/2': Math.PI / 2, 'e/2': Math.E / 2,
    'silver mean 1+√2': CONST.silver, 'bronze mean': CONST.bronze, 'plastic ρ': CONST.plastic, 'π': Math.PI, 'e': Math.E,
    '3/2 (just fifth)': 1.5, '2 (octave)': 2, '3 (tritave)': 3,
  };
  const log2 = Math.log2;
  const cents = (r) => 1200 * log2(r);
  const ratio = (c) => Math.pow(2, c / 1200);
  const mod = (a, m) => ((a % m) + m) % m;
  const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a; };

  // ---------------------------------------------------------------- expression parser (Scala-like scale text)
  // numbers, a/b, ^, * , + , - , ( ), sqrt( ), named constants (phi, pi, e, sqrt2, silver…). Never eval().
  function evalExpr(src) {
    let i = 0; const s = String(src).replace(/\s+/g, '');
    const peek = () => s[i];
    function num() {
      let m = s.slice(i).match(/^\d+(\.\d+)?/); if (m) { i += m[0].length; return parseFloat(m[0]); }
      m = s.slice(i).match(/^(sqrt|cbrt|ln|log2)\(/); if (m) { i += m[0].length; const v = expr(); if (s[i] !== ')') throw new Error('missing )'); i++; return m[1] === 'sqrt' ? Math.sqrt(v) : m[1] === 'cbrt' ? Math.cbrt(v) : m[1] === 'ln' ? Math.log(v) : log2(v); }
      m = s.slice(i).match(/^(phi|φ|pi|π|tau|e|sqrt2|sqrt3|sqrt5|silver|bronze|plastic)/); if (m) { i += m[0].length; return CONST[m[1]]; }
      if (peek() === '(') { i++; const v = expr(); if (s[i] !== ')') throw new Error('missing )'); i++; return v; }
      if (peek() === '-') { i++; return -num(); }
      throw new Error(`can't read “${s.slice(i) || src}”`);
    }
    function pow() { let b = num(); while (peek() === '^') { i++; b = Math.pow(b, pow()); } return b; }
    function term() { let v = pow(); while (peek() === '*' || peek() === '/') { const op = s[i++]; const r = pow(); v = op === '*' ? v * r : v / r; } return v; }
    function expr() { let v = term(); while (peek() === '+' || peek() === '-') { const op = s[i++]; const r = term(); v = op === '+' ? v + r : v - r; } return v; }
    const v = expr(); if (i < s.length) throw new Error(`unexpected “${s.slice(i)}”`);
    if (!Number.isFinite(v)) throw new Error('not a finite number');
    return v;
  }
  // one scale entry → cents. "701.955" or "700c" = cents ; "3/2", "phi", "2^(7/12)", "5" = ratio
  function entryCents(tok) {
    const t = String(tok).trim(); if (!t) return null;
    if (/^-?\d+\.\d*$/.test(t)) return parseFloat(t);
    if (/^-?\d+(\.\d+)?c$/i.test(t)) return parseFloat(t);
    const r = evalExpr(t); if (r <= 0) throw new Error(`ratio ${t} must be > 0`);
    return cents(r);
  }
  // Scala convention: the LAST entry is the period; 1/1 is implied. One entry alone = an equal step with no period.
  function parseScale(text) {
    const toks = String(text || '').split('\n').filter(l => !l.trim().startsWith('!')).join(' ').split(/[\s,;]+/).map(x => x.trim()).filter(Boolean);
    const cs = toks.map(entryCents).filter(c => c !== null);
    if (!cs.length) throw new Error('empty scale');
    if (cs.length === 1) return { steps: [0], period: Math.abs(cs[0]), equalStep: true };
    const period = cs[cs.length - 1];
    if (period <= 0) throw new Error('the last entry (the period) must be above 1/1');
    const steps = [0].concat(cs.slice(0, -1).filter(c => c > 0 && c < period)).sort((a, b) => a - b);
    return { steps: Array.from(new Set(steps.map(c => +c.toFixed(6)))), period };
  }

  // ---------------------------------------------------------------- tunings
  function equal(n, periodRatio) { const P = cents(periodRatio); return { steps: Array.from({ length: n }, (_, k) => k * P / n), period: P }; }
  function generated(gen, count, periodRatio) { // stack an (often irrational) generator, reduce into the period: MOS-style
    const P = periodRatio ? cents(periodRatio) : null, g = cents(gen);
    let st = Array.from({ length: count }, (_, k) => P ? mod(k * g, P) : k * g);
    st = Array.from(new Set(st.map(c => +c.toFixed(6)))).sort((a, b) => a - b);
    return P ? { steps: st, period: P } : { steps: st, period: st[st.length - 1] + (st[1] || g) };
  }
  function ji(ratios, periodRatio) { const P = cents(periodRatio || 2); return { steps: Array.from(new Set(ratios.map(r => +mod(cents(r), P).toFixed(6)))).sort((a, b) => a - b), period: P }; }
  function diamond(odds) { const out = []; odds.forEach(a => odds.forEach(b => { let r = a / b; while (r >= 2) r /= 2; while (r < 1) r *= 2; out.push(r); })); return out; }

  const TUNINGS = {
    '12-TET': { family: 'equal', describe: 'the piano — 12 equal steps of the octave', build: () => equal(12, 2) },
    'EDO (any)': { family: 'equal', describe: 'N equal divisions of the octave — set N', params: ['n'], build: (o) => equal(Math.max(1, Math.round(o.n || 19)), 2) },
    '19-EDO': { family: 'equal', describe: 'better thirds than 12; meantone family', build: () => equal(19, 2) },
    '22-EDO': { family: 'equal', describe: 'Indian-shruti-like; strong 7- and 11-limit', build: () => equal(22, 2) },
    '24-EDO (quarter tones)': { family: 'equal', describe: 'Arabic maqam quarter tones', build: () => equal(24, 2) },
    '31-EDO': { family: 'equal', describe: 'Huygens / Fokker — near-just 5- and 7-limit', build: () => equal(31, 2) },
    '53-EDO': { family: 'equal', describe: 'near-perfect fifths and thirds (Turkish comma)', build: () => equal(53, 2) },
    '7-EDO': { family: 'equal', describe: 'equiheptatonic — Thai / Chopi-like', build: () => equal(7, 2) },
    '5-EDO': { family: 'equal', describe: 'equipentatonic — slendro-like', build: () => equal(5, 2) },
    'Bohlen–Pierce (13ED3)': { family: 'non-octave', describe: '13 equal steps of the TRITAVE 3:1 — no octave at all', build: () => equal(13, 3) },
    'Equal division of φ': { family: 'irrational', describe: 'N equal steps whose period is the golden ratio (833.09¢) — never returns to an octave', params: ['n'], build: (o) => equal(Math.max(1, Math.round(o.n || 5)), PHI) },
    'Equal division of π': { family: 'irrational', describe: 'period π (1981.8¢) split into N steps', params: ['n'], build: (o) => equal(Math.max(1, Math.round(o.n || 16)), Math.PI) },
    'Equal division of e': { family: 'irrational', describe: 'period e (1731.2¢) split into N steps', params: ['n'], build: (o) => equal(Math.max(1, Math.round(o.n || 14)), Math.E) },
    'Wendy Carlos α': { family: 'non-octave', describe: '78.0¢ steps — no period; pure 3:2, 5:4, 6:5 approximated', build: () => ({ steps: [0], period: 77.965, equalStep: true }) },
    'Wendy Carlos β': { family: 'non-octave', describe: '63.8¢ steps — no period', build: () => ({ steps: [0], period: 63.833, equalStep: true }) },
    'Wendy Carlos γ': { family: 'non-octave', describe: '35.1¢ steps — no period, very fine', build: () => ({ steps: [0], period: 35.099, equalStep: true }) },
    'Golden generator (φ-MOS)': { family: 'irrational', describe: 'stack the golden ratio N times, fold into the octave — an irrational Pythagorean scale', params: ['n'], build: (o) => generated(PHI, Math.max(2, Math.round(o.n || 8)), 2) },
    'Generator (any irrational)': { family: 'irrational', describe: 'stack the chosen generator N times into the chosen period', params: ['n', 'generator', 'period'], build: (o) => generated(GENERATORS[o.generator] || PHI, Math.max(2, Math.round(o.n || 8)), o.period === 'none' ? null : (GENERATORS[o.period] || 2)) },
    'Harmonic series 8–16': { family: 'just', describe: 'overtones 8…15 — the otonal "utopian" scale', build: () => ji([8, 9, 10, 11, 12, 13, 14, 15].map(n => n / 8)) },
    'Subharmonic 16–8': { family: 'just', describe: 'the undertone mirror — utonal, dark', build: () => ji([16, 15, 14, 13, 12, 11, 10, 9].map(n => 16 / n)) },
    'Ptolemy 5-limit major': { family: 'just', describe: 'pure thirds and fifths', build: () => ji([1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8]) },
    'Pythagorean 12': { family: 'just', describe: 'stacked pure 3:2 fifths', build: () => generated(1.5, 12, 2) },
    'Partch 11-limit diamond': { family: 'just', describe: '29 tones from odds 1,3,5,7,9,11 — Harry Partch', build: () => ji(diamond([1, 3, 5, 7, 9, 11])) },
    'Bohlen–Pierce just': { family: 'non-octave', describe: 'BP in odd-only just ratios, period 3:1', build: () => ji([1, 27 / 25, 25 / 21, 9 / 7, 7 / 5, 75 / 49, 5 / 3, 9 / 5, 49 / 25, 15 / 7, 7 / 3, 63 / 25, 25 / 9], 3) },
    'Slendro (approx.)': { family: 'world', describe: 'Javanese gamelan, 5 near-equal steps (one common measurement)', build: () => ({ steps: [0, 231, 474, 717, 955], period: 1200 }) },
    'Pelog (approx.)': { family: 'world', describe: 'Javanese gamelan, 7 unequal steps (one common measurement)', build: () => ({ steps: [0, 120, 258, 539, 675, 785, 943], period: 1200 }) },
    'Custom (text)': { family: 'custom', describe: 'type ratios (3/2, phi, 2^(1/7)) or cents (701.955); last entry = period', params: ['text'], build: (o) => parseScale(o.text || '9/8, 5/4, 4/3, 3/2, 5/3, 15/8, 2/1') },
  };
  function tuning(name, o) {
    const t = TUNINGS[name] || TUNINGS['12-TET'];
    const b = t.build(o || {});
    return Object.assign({ name, family: t.family, describe: t.describe }, b);
  }
  // step index (any integer) → cents above the base
  function stepCents(tun, step) {
    const N = tun.steps.length, k = Math.floor(step / N), i = step - k * N;
    return k * tun.period + tun.steps[i];
  }
  function freq(tun, step, baseHz) { return baseHz * ratio(stepCents(tun, step)); }

  // ---------------------------------------------------------------- spectra (partials as frequency RATIOS to f0)
  const BAR = [1, 2.756, 5.404, 8.933, 13.344, 18.638, 24.814, 31.877];                       // free-free beam
  const MEMBRANE = [1, 1.594, 2.136, 2.296, 2.653, 2.918, 3.156, 3.501, 3.600, 3.652, 4.060, 4.154, 4.227, 4.601, 4.832, 4.903]; // circular drum (Bessel zeros)
  const BELL = [0.5, 1, 1.183, 1.506, 2, 2.514, 2.662, 3.011, 4.166, 5.433, 6.796, 8.215];      // church bell: hum, prime, tierce, quint, nominal…
  const PRIMES = [1, 2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47];
  const FIB = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89];
  const SPECTRA = {
    harmonic: { describe: 'integer overtones 1,2,3… — ordinary pitched sound', ratios: (n) => Array.from({ length: n }, (_, k) => k + 1) },
    odd: { describe: 'odd overtones only — clarinet / square-like', ratios: (n) => Array.from({ length: n }, (_, k) => 2 * k + 1) },
    prime: { describe: 'only prime-numbered overtones — hollow, alien', ratios: (n) => PRIMES.slice(0, n) },
    stretched: { describe: 'octave stretched to S (2 = harmonic) — f_k = S^log2(k)', param: { label: 'Octave S', min: 1.7, max: 2.4, def: 2.1 }, ratios: (n, p) => Array.from({ length: n }, (_, k) => Math.pow(p || 2.1, log2(k + 1))) },
    piano: { describe: 'stiff-string inharmonicity f_k = k·√(1+B·k²)', param: { label: 'B ×1e-3', min: 0, max: 20, def: 2 }, ratios: (n, p) => Array.from({ length: n }, (_, k) => (k + 1) * Math.sqrt(1 + (p || 2) / 1000 * (k + 1) * (k + 1))) },
    golden: { describe: 'partials at powers of φ — irrational, never fuses into a pitch', ratios: (n) => Array.from({ length: n }, (_, k) => Math.pow(PHI, k)) },
    'golden-harmonic': { describe: 'k·φ^(k/8): harmonic at the bottom, drifting irrational at the top', ratios: (n) => Array.from({ length: n }, (_, k) => (k + 1) * Math.pow(PHI, k / 8)) },
    'root-k': { describe: 'f_k = k^p (p<1 compresses, p>1 stretches) — irrational for most k', param: { label: 'Power p', min: 0.5, max: 1.5, def: 0.8 }, ratios: (n, p) => Array.from({ length: n }, (_, k) => Math.pow(k + 1, p || 0.8)) },
    bar: { describe: 'free metal bar / beam modes — glockenspiel, anvil', ratios: (n) => BAR.slice(0, n) },
    membrane: { describe: 'circular drum-head modes (Bessel zeros) — timpani, tom', ratios: (n) => MEMBRANE.slice(0, n) },
    bell: { describe: 'church bell partials — hum, minor-third tierce', ratios: (n) => BELL.slice(0, n) },
    fibonacci: { describe: 'Fibonacci-numbered overtones 1,2,3,5,8,13…', ratios: (n) => FIB.slice(0, n) },
    'tuning-matched': { describe: 'harmonics bent onto the current tuning (Sethares) — makes any tuning consonant', ratios: (n, p, tun) => Array.from({ length: n }, (_, k) => { const c = cents(k + 1); if (!tun) return k + 1; const near = nearestStep(tun, c); return ratio(near.cents); }) },
  };
  function spectrum(kind, o) {
    o = o || {};
    const S = SPECTRA[kind] || SPECTRA.harmonic, n = Math.max(1, Math.min(32, o.partials || 12));
    const rs = S.ratios(n, o.param, o.tuning).filter(r => r > 0);
    const tilt = o.tilt === undefined ? 1 : o.tilt, even = o.even === undefined ? 1 : o.even;
    return rs.map((r, k) => ({ r, a: Math.pow(k + 1, -tilt) * (k % 2 === 1 ? even : 1) }));
  }
  function nearestStep(tun, c) {
    const N = tun.steps.length; let best = null;
    const k0 = Math.floor(c / tun.period);
    for (let k = k0 - 1; k <= k0 + 1; k++) for (let i = 0; i < N; i++) { const sc = k * tun.period + tun.steps[i]; const d = Math.abs(sc - c); if (!best || d < best.d) best = { step: k * N + i, cents: sc, d }; }
    return best;
  }

  // ---------------------------------------------------------------- rational approximation
  // best rational p/q with q ≤ maxDen (continued fractions + semiconvergents)
  function approx(x, maxDen) {
    maxDen = maxDen || 64;
    let h0 = 0, h1 = 1, k0 = 1, k1 = 0, v = x, best = { p: Math.round(x), q: 1 };
    for (let it = 0; it < 40; it++) {
      const a = Math.floor(v);
      const h2 = a * h1 + h0, k2 = a * k1 + k0;
      if (k2 > maxDen) { // semiconvergent
        const m = Math.floor((maxDen - k0) / k1);
        if (m > 0) { const hp = m * h1 + h0, kp = m * k1 + k0; if (Math.abs(hp / kp - x) < Math.abs(best.p / best.q - x)) best = { p: hp, q: kp }; }
        break;
      }
      best = { p: h2, q: k2 };
      h0 = h1; h1 = h2; k0 = k1; k1 = k2;
      const f = v - a; if (f < 1e-12) break; v = 1 / f;
    }
    const g = gcd(best.p, best.q) || 1; best.p /= g; best.q /= g;
    best.errCents = cents(x / (best.p / best.q));
    best.tenney = log2(best.p * best.q);
    return best;
  }
  const NAMES = {
    '1/1': 'unison', '2/1': 'octave', '3/2': 'perfect fifth', '4/3': 'perfect fourth', '5/4': 'major third', '6/5': 'minor third', '5/3': 'major sixth', '8/5': 'minor sixth',
    '9/8': 'major tone', '10/9': 'minor tone', '16/15': 'diatonic semitone', '15/8': 'major seventh', '9/5': 'minor seventh', '16/9': 'Pythagorean minor seventh', '7/4': 'harmonic seventh',
    '7/6': 'septimal minor third', '9/7': 'septimal major third', '7/5': 'septimal tritone', '10/7': 'Euler tritone', '8/7': 'septimal whole tone', '11/8': 'undecimal tritone (alphorn F)',
    '11/9': 'neutral third', '12/11': 'neutral second', '13/8': 'tridecimal neutral sixth', '11/6': 'neutral seventh', '3/1': 'tritave (twelfth)', '5/2': 'major tenth', '45/32': 'just tritone', '25/24': 'chromatic semitone',
    '81/80': 'syntonic comma', '128/125': 'diesis', '36/35': 'septimal diesis', '13/12': 'tridecimal neutral second', '14/11': 'undecimal major third', '17/16': 'septendecimal semitone', '19/16': 'nineteenth-harmonic minor third',
  };
  function describeRatio(x, maxDen) {
    const a = approx(x, maxDen || 32), key = a.p + '/' + a.q;
    const c = cents(x), et = Math.round(c / 100);
    const special = Object.entries({ 'φ': PHI, 'φ²': PHI * PHI, 'φ³': PHI * PHI * PHI, 'π': Math.PI, 'π/2': Math.PI / 2, 'e': Math.E, 'e/2': Math.E / 2, '√2': Math.SQRT2, '√3': Math.sqrt(3), '√5': Math.sqrt(5), 'silver': CONST.silver }).find(([, v]) => Math.abs(cents(x / v)) < 3);
    return {
      cents: c, ratio: x, p: a.p, q: a.q, errCents: a.errCents, tenney: a.tenney, name: NAMES[key] || null,
      et12: { semis: et, offset: c - et * 100 }, irrational: special ? special[0] : null,
      // how far the interval sits from ANY simple ratio (q ≤ 16) — 0 = plainly rational
      irrationality: Math.min(50, Math.abs(approx(x, 16).errCents)),
    };
  }

  // ---------------------------------------------------------------- sensory dissonance (Plomp–Levelt via Sethares)
  function pairDiss(f1, a1, f2, a2) {
    const fmin = Math.min(f1, f2), df = Math.abs(f2 - f1);
    const s = 0.24 / (0.0207 * fmin + 18.96);
    return Math.min(a1, a2) * (Math.exp(-3.51 * s * df) - Math.exp(-5.75 * s * df));
  }
  function dissonance(partials) { // [{f, a}]
    let d = 0;
    for (let i = 0; i < partials.length; i++) for (let j = i + 1; j < partials.length; j++) d += pairDiss(partials[i].f, partials[i].a, partials[j].f, partials[j].a);
    return d;
  }
  // dissonance of a timbre against itself transposed by c cents, c ∈ [from, to]
  function dissonanceCurve(spec, f0, from, to, step) {
    from = from || 0; to = to || 1300; step = step || 2; f0 = f0 || 261.63;
    const base = spec.map(p => ({ f: f0 * p.r, a: p.a }));
    const self = dissonance(base), out = [];
    for (let c = from; c <= to; c += step) {
      const k = ratio(c), moved = spec.map(p => ({ f: f0 * p.r * k, a: p.a }));
      out.push({ c, d: dissonance(base.concat(moved)) - 2 * self });
    }
    const mx = Math.max(...out.map(x => x.d)) || 1; out.forEach(x => { x.d /= mx; });
    return out;
  }
  function minima(curve, depth) { // local minima → candidate consonant intervals (a scale grown from the timbre)
    depth = depth || 0.02; const out = [];
    for (let i = 1; i < curve.length - 1; i++) {
      if (curve[i].d <= curve[i - 1].d && curve[i].d <= curve[i + 1].d) {
        let l = i, r = i; while (l > 0 && curve[l - 1].d >= curve[l].d) l--; while (r < curve.length - 1 && curve[r + 1].d >= curve[r].d) r++;
        const prom = Math.min(curve[l].d, curve[r].d) - curve[i].d;
        if (prom >= depth || i === 0) out.push({ c: curve[i].c, d: curve[i].d, prominence: prom });
      }
    }
    if (curve.length && curve[0].c === 0) out.unshift({ c: 0, d: curve[0].d, prominence: 1 });
    return out;
  }
  // slowest audible beat between two harmonic tones (m·f1 ≈ n·f2)
  function beat(f1, f2, maxHarm) {
    maxHarm = maxHarm || 8; let best = null;
    for (let m = 1; m <= maxHarm; m++) for (let n = 1; n <= maxHarm; n++) {
      const b = Math.abs(m * f1 - n * f2);
      if (b > 0.05 && b < 40 && (!best || b < best.hz)) best = { hz: b, m, n };
    }
    return best;
  }

  // ---------------------------------------------------------------- analysis helpers
  // spectral peaks (parabolic interpolation) from a dB magnitude array (bin k = k·sr/N)
  function peaks(db, sr, N, o) {
    o = o || {}; const max = o.max || 24, floor = o.floor === undefined ? -80 : o.floor, minHz = o.minHz || 25, rel = o.rel === undefined ? 60 : o.rel;
    let top = -Infinity; for (let k = 1; k < db.length - 1; k++) if (db[k] > top) top = db[k];
    const out = [];
    for (let k = 2; k < db.length - 2; k++) {
      const v = db[k]; if (v < floor || v < top - rel) continue;
      if (v > db[k - 1] && v >= db[k + 1] && v > db[k - 2] && v >= db[k + 2]) {
        const a = db[k - 1], b = v, c = db[k + 1], p = 0.5 * (a - c) / (a - 2 * b + c || 1e-9);
        const f = (k + p) * sr / N; if (f < minHz) continue;
        out.push({ f, db: b - 0.25 * (a - c) * p });
      }
    }
    out.sort((x, y) => y.db - x.db);
    return out.slice(0, max).sort((x, y) => x.f - y.f);
  }
  // f0: the candidate whose harmonic comb best explains the strongest peaks (works with a missing fundamental).
  // Score = matched energy − penalty for expected low harmonics that are absent − penalty for strong peaks the comb
  // leaves unexplained. The penalties stop sub-harmonic grids (f/2, f/3) from "explaining" stretched upper partials.
  function estimateF0(pk, o) {
    o = o || {}; if (!pk.length) return null;
    const strong = pk.slice().sort((a, b) => b.db - a.db).slice(0, 12), top = strong[0].db;
    const w = (p) => Math.pow(10, (p.db - top) / 20);
    const fmax = Math.max(...strong.map(p => p.f));
    const cands = new Set();
    strong.slice(0, 6).forEach(p => { for (let k = 1; k <= 6; k++) { const f = p.f / k; if (f >= (o.min || 25) && f <= (o.max || 4000)) cands.add(f); } });
    let best = null;
    cands.forEach(f => {
      let score = 0, missing = 0; const used = new Set();
      for (let k = 1; k <= 10; k++) {
        const target = k * f; if (target > fmax * 1.05) break;
        let hit = null, dev = 1e9;
        strong.forEach(p => { const d = Math.abs(cents(p.f / target)); if (d < 50 && d < dev) { dev = d; hit = p; } });
        if (hit) { score += w(hit) * (1 - dev / 60); used.add(hit); } else missing += 1 / Math.sqrt(k);
      }
      strong.forEach(p => { if (used.has(p)) return; const n = Math.round(p.f / f); const d = n >= 1 ? Math.abs(cents(p.f / (n * f))) : 1e9; if (d > 50 || n > 10) score -= 0.5 * w(p); });
      score -= 0.3 * missing;
      if (!best || score > best.score + 1e-9 || (Math.abs(score - best.score) < 1e-9 && f > best.f)) best = { f, score };
    });
    if (!best) return null;
    // an "f0" far below every audible partial only means the sound has no harmonic series (bells, φ-spectra):
    // then the lowest strong partial is the honest reference
    const low = strong.filter(p => p.db > top - 30).reduce((a, b) => (a.f < b.f ? a : b));
    if (best.f < low.f / 4.5) return low.f;
    // refine: weighted least squares on matched low harmonics
    let num = 0, den = 0;
    strong.forEach(p => { const n = Math.round(p.f / best.f); if (n >= 1 && n <= 6 && Math.abs(cents(p.f / (n * best.f))) < 30) { const ww = w(p); num += ww * p.f * n; den += ww * n * n; } });
    return den ? num / den : best.f;
  }
  // stiff-string inharmonicity: f_n² / n² = f0² + f0²·B·n²  → linear regression (x = n², y = f_n²/n²) gives f0 AND B
  function inharmonicFit(pk, f0guess) {
    // iterate: number the partials against the current stretched model, refit f0 and B, repeat
    let f0 = f0guess, B = 0, n0 = 0;
    for (let it = 0; it < 4; it++) {
      const pred = (n) => n * f0 * Math.sqrt(1 + Math.max(0, B) * n * n);
      const pts = [];
      pk.forEach(p => {
        let best = null; const guess = Math.max(1, Math.round(p.f / f0));
        for (let n = Math.max(1, guess - 2); n <= guess + 1; n++) { const d = Math.abs(cents(p.f / pred(n))); if (!best || d < best.d) best = { n, d }; }
        if (best && best.n <= 40 && best.d < (it ? 40 : 120)) pts.push({ x: best.n * best.n, y: (p.f * p.f) / (best.n * best.n) });
      });
      n0 = pts.length; if (pts.length < 3) break;
      const mx = pts.reduce((a2, q) => a2 + q.x, 0) / pts.length, my = pts.reduce((a2, q) => a2 + q.y, 0) / pts.length;
      let sxy = 0, sxx = 0; pts.forEach(q => { sxy += (q.x - mx) * (q.y - my); sxx += (q.x - mx) * (q.x - mx); });
      const slope = sxx ? sxy / sxx : 0, icpt = my - slope * mx;
      if (icpt <= 0) break;
      const nf = Math.sqrt(icpt), nB = slope / icpt;
      if (Math.abs(cents(nf / f0guess)) > 60 || nB < -0.01 || nB > 0.2) break;
      f0 = nf; B = nB;
    }
    return { f0, B, n: n0 };
  }
  function inharmonicity(pk, f0) { return inharmonicFit(pk, f0).B; }
  // full partial table for a measured sound
  function analyse(pk, o) {
    o = o || {};
    const g = o.f0 || estimateF0(pk, o); if (!g) return null;
    const fit = o.f0 ? { f0: g, B: inharmonicFit(pk, g).B } : inharmonicFit(pk, g);
    const f0 = fit.f0;
    const top = Math.max(...pk.map(p => p.db));
    const partials = pk.map(p => {
      const r = p.f / f0, n = Math.max(1, Math.round(r)), d = describeRatio(r, o.maxDen || 32);
      return { f: p.f, db: p.db, rel: p.db - top, ratio: r, harmonic: n, harmDevCents: cents(r / n), approx: d.p + '/' + d.q, approxErr: d.errCents, irrational: d.irrational, et12Offset: d.et12.offset };
    });
    const B = fit.B;
    const w = partials.map(p => Math.pow(10, p.rel / 20)), ws = w.reduce((a, b) => a + b, 0) || 1;
    const harmonicity = 1 - Math.min(1, partials.reduce((s, p, i) => s + w[i] * Math.min(50, Math.abs(p.harmDevCents)) / 50, 0) / ws);
    return { f0, B, harmonicity, partials, spectrum: partials.map((p, i) => ({ r: p.ratio, a: w[i] })) };
  }

  // ---------------------------------------------------------------- JI lattice
  function monzoRatio(a3, a5, a7, primeZ) { // 3^a · 5^b · p^c octave-reduced into [1,2)
    let r = Math.pow(3, a3) * Math.pow(5, a5) * Math.pow(primeZ || 7, a7 || 0);
    while (r >= 2) r /= 2; while (r < 1) r *= 2; return r;
  }

  global.XenTheory = {
    PHI, CONST, GENERATORS, TUNINGS, SPECTRA, NAMES,
    cents, ratio, evalExpr, entryCents, parseScale, tuning, stepCents, freq, nearestStep,
    spectrum, approx, describeRatio, pairDiss, dissonance, dissonanceCurve, minima, beat,
    peaks, estimateF0, inharmonicity, inharmonicFit, analyse, monzoRatio,
  };
})(typeof window !== 'undefined' ? window : globalThis);
