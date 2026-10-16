/* ERAVOS Song Engine (3.27) — music that makes music.
 * A genre is DATA (tempo range, keys, progressions, instruments + presets, drum grammar, bass/chord/lead styles,
 * song form). The engine turns a genre + a seed into a recipe: every run is a new, finished song written as
 * instrument tracks on the Timeline (editable in the piano roll), in key, with markers per section.
 * Add a genre (a pack can do this too):  SongEngine.addGenre({ id, label, … })  → it appears on the Start screen.
 * Same song again:                        SongEngine.write('synthwave', 4242)  (the seed is in the song name). */
(function () {
  'use strict';
  const R = window.Recipes;
  if (!R) return;
  const genres = new Map();

  // ---------------------------------------------------------------- seeded randomness (mulberry32)
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const pick = (r, a) => a[Math.floor(r() * a.length) % a.length];
  const VEL = { X: 1, x: 0.8, o: 0.45 };
  const PAD = { kick: 0, snare: 1, clap: 2, hat: 3, ohat: 4, b808: 5, rim: 6, tom: 7, crash: 8, perc: 9, shaker: 10, cowbell: 11 };

  // ---------------------------------------------------------------- drums
  function drumBar(G, r, mode, bar, bars, energy) {
    const n = [], hit = (s, pad, v, l) => n.push({ s, l: l || 1, n: 36 + pad, v: Math.max(0.05, Math.min(1, v)) });
    if (mode === 'none') return n;
    if (mode === 'build') { // snare roll that doubles every quarter of the build, rising
      const q = Math.min(3, Math.floor(bar / Math.max(1, bars / 4))), div = [4, 2, 1, 1][q];
      for (let s = 0; s < 16; s += div) hit(s, PAD.snare, 0.35 + 0.6 * (bar * 16 + s) / (bars * 16));
      if (q < 2) for (let s = 0; s < 16; s += 4) hit(s, PAD.kick, 0.9);
      return n;
    }
    const pat = (G.drums && G.drums[mode]) || G.drums.main;
    Object.keys(pat).forEach(lane => {
      const str = pat[lane].replace(/\|/g, ''), pad = PAD[lane];
      for (let s = 0; s < 16; s++) { const c = str[s % str.length]; if (VEL[c]) hit(s, pad, VEL[c] * (0.85 + 0.15 * energy)); }
    });
    // variation: ghost hats + the odd extra kick, seeded
    if (mode !== 'light') for (let s = 1; s < 16; s += 2) if (r() < 0.12 * energy) hit(s, PAD.hat, 0.35);
    if (r() < 0.25 && mode === 'main') hit(pick(r, [7, 11, 14]), PAD.kick, 0.7);
    // last bar of a section: a fill into the next one
    if (bar === bars - 1 && bars >= 4) for (let s = 12; s < 16; s++) hit(s, s % 2 ? PAD.snare : PAD.clap, 0.6 + (s - 12) * 0.1);
    return n;
  }

  // ---------------------------------------------------------------- pitched parts (always in key)
  function bassBar(style, deg, key, r, bar) {
    const MT = window.MusicTheory, root = (o) => MT.degreeToMidi(deg, o, key.root, key.scale), n = [], N = (s, l, m, v) => n.push({ s, l, n: m, v: v || 0.95 });
    const lo = root(1), hi = root(2);
    switch (style) {
      case 'half':    N(0, 6, lo); N(8, 3, lo, 0.85); if (r() < 0.6) N(12, 3, r() < 0.5 ? hi : lo, 0.8); break;   // dubstep / riddim / melodic
      case 'stutter': [0, 3, 6, 8, 11, 14].forEach((s, i) => N(s, i === 0 ? 3 : 2, i % 3 === 2 ? hi : lo, i ? 0.8 : 1)); break;
      case 'roll':    [0, 3, 6, 10, 12, 14].forEach((s, i) => N(s, 2, i === 3 && r() < 0.5 ? hi : lo, i ? 0.8 : 1)); break; // dnb
      case 'offbeat': [2, 6, 10, 14].forEach(s => N(s, 2, lo, 0.9)); if (r() < 0.4) N(15, 1, hi, 0.6); break;              // house
      case 'pulse8':  for (let s = 0; s < 16; s += 2) N(s, 1.5, s === 8 || s === 14 ? hi : lo, s % 4 ? 0.75 : 0.95); break; // synthwave
      case 'acid': { const sc = [0, 0, 2, 4, 7, -3]; for (let s = 0; s < 16; s++) if (r() < 0.62 || s % 4 === 0) n.push({ s, l: r() < 0.25 ? 2 : 1, n: MT.degreeToMidi(deg + pick(r, sc), 2, key.root, key.scale) + (r() < 0.2 ? 12 : 0), v: s % 4 === 0 || r() < 0.25 ? 1 : 0.7 }); break; }
      case '808':     N(0, 7, lo); if (r() < 0.7) N(7, 3, lo, 0.85); N(10, 6, r() < 0.3 ? hi : lo, 0.9); break;               // trap
      case 'drone':   N(0, 16, lo, 0.8); break;
      case 'onedrop': { const f = MT.degreeToMidi(deg + 4, 1, key.root, key.scale); N(0, 3, lo); N(4, 2, lo, 0.8); N(6, 2, MT.degreeToMidi(deg + 2, 1, key.root, key.scale), 0.8); if (r() < 0.6) N(10, 2, f, 0.75); N(12, 3, MT.degreeToMidi(deg + 4, 1, key.root, key.scale), 0.85); break; } // reggae: root, walk up, rest on beat 3
      case 'psy':     for (let s = 0; s < 16; s++) if (s % 4) N(s, 0.9, s % 4 === 3 && r() < 0.3 ? hi : lo, s % 4 === 2 ? 0.9 : 0.75); break; // rolling 16ths between the kicks (psytrance, tech house)
      case 'gallop':  for (let s = 0; s < 16; s += 4) { N(s + 2, 1, lo, 0.9); N(s + 3, 1, lo, 0.7); } break;                           // hardstyle / big room off-beat punch
      case 'dembow':  [0, 3, 6, 8, 11, 14].forEach((s, i) => N(s, i === 2 || i === 5 ? 2 : 3, i === 4 && r() < 0.5 ? hi : lo, i % 3 ? 0.85 : 1)); break; // 3-3-2 dancehall
      default:        for (let s = 0; s < 16; s += 2) N(s, 1.75, lo, s % 4 ? 0.8 : 1);
    }
    return n;
  }
  const FUTURE = [[0, 3], [3, 3], [6, 2], [8, 2], [10, 2], [12, 3.5]];
  function chordBar(style, deg, key, voicing, oct) {
    const MT = window.MusicTheory, ch = MT.chord(deg, key.root, key.scale, voicing || 'triad', oct || 4), n = [];
    switch (style) {
      case 'stab':   [2, 6, 10, 14].forEach(s => ch.forEach(m => n.push({ s, l: 1, n: m, v: 0.85 }))); break;
      case 'future': FUTURE.forEach(([s, l], i) => ch.forEach(m => n.push({ s, l, n: m, v: i ? 0.8 : 0.95 }))); break;
      case 'arp':    for (let s = 0; s < 16; s++) n.push({ s, l: 0.9, n: ch[s % ch.length] + (Math.floor(s / ch.length) % 2 ? 12 : 0), v: s % 4 ? 0.65 : 0.9 }); break;
      case 'pluck':  for (let e = 0; e < 8; e++) n.push({ s: e * 2, l: 1.5, n: ch[e % ch.length] + (e >= ch.length && e % 2 ? 12 : 0), v: e % 2 ? 0.7 : 0.9 }); break;
      case 'skank':  [4, 12].forEach(s => ch.forEach(m => n.push({ s, l: 1, n: m, v: 0.85 }))); break;                       // reggae: chops on 2 and 4
      case 'bubble': for (let e = 0; e < 8; e++) n.push({ s: e * 2 + 1, l: 0.8, n: e % 2 ? ch[ch.length - 1] : ch[0] - 12, v: e % 2 ? 0.7 : 0.55 }); break; // organ bubble on the off-beats
      case 'pulse':  for (let s = 0; s < 16; s += 2) ch.forEach(m => n.push({ s, l: 1.2, n: m, v: s % 4 ? 0.6 : 0.8 })); break;
      default:       ch.forEach(m => n.push({ s: 0, l: 16, n: m, v: 0.75 }));
    }
    return n;
  }
  // a 2-bar motif on chord tones, repeated with a changed answer — melodies that sound written, not random
  const RHYTHMS = {
    anthem: [[0, 3], [3, 3], [6, 2], [8, 4], [12, 2], [14, 2]],
    pluck:  [[0, 1], [2, 1], [3, 1], [6, 2], [8, 1], [10, 2], [12, 1], [14, 2]],
    sparse: [[0, 6], [8, 2], [10, 6]],
    synth:  [[0, 2], [2, 2], [4, 4], [8, 2], [10, 2], [12, 4]],
  };
  function makeMotif(r, rhythm) {
    const steps = [0, 2, 4, 7], bars = [];
    for (let b = 0; b < 2; b++) bars.push(RHYTHMS[rhythm].map(([s, l]) => ({ s, l, off: pick(r, steps), v: 0.8 + r() * 0.2 })).filter(() => r() > 0.12));
    return bars;
  }
  function leadBar(motif, bar, deg, key, r, oct) {
    const MT = window.MusicTheory, m = motif[bar % 2];
    return m.map((x, i) => {
      let off = x.off; if (bar % 4 === 3 && i === m.length - 1) off = pick(r, [0, 4, 7]); // the answer phrase lands somewhere new
      return { s: x.s, l: x.l, n: MT.degreeToMidi(deg + off, oct || 5, key.root, key.scale), v: x.v };
    });
  }

  // ---------------------------------------------------------------- genre → recipe steps
  const SIZE = { w: 500, h: 460 };
  // X (optional, 3.34.1 — used by RhythmExpand): { name, form:[sections], bar(ctx) → notes[] | null } — a caller can supply its own form and
  // write a part's bar itself (null = the genre's own bar). Without X nothing here changes: same seed → the same song as before.
  function generate(G, seed, X) {
    const r = rng(seed), bpm = G.bpm[0] + Math.round(r() * (G.bpm[1] - G.bpm[0]));
    const key = { root: pick(r, G.roots), scale: pick(r, G.scales || ['minor']) };
    const prog = pick(r, G.progs), energyOf = { intro: 0.4, build: 0.7, drop: 1, break: 0.3, outro: 0.5, verse: 0.6, chorus: 0.9 };
    const name = (X && X.name) || `${G.label} #${seed}`, form = (X && X.form) || G.form;
    const steps = [
      { op: 'bpm', bpm },
      { op: 'mount', organism: 'eravos.session', as: 'session', at: [0, 0], size: [400, 540] },
      { op: 'configure', target: 'session', params: { songName: name, root: key.root, scale: key.scale, bpm, autoLength: true } },
      { op: 'mount', organism: 'eravos.timeline', as: 'tl', at: [420, 0], size: [1180, 640] },
    ];
    const parts = Object.keys(G.parts);
    // lay windows out by their real sizes (4 per row) so nothing overlaps; tall tools grow to fit, so rows get headroom
    const sz = (org) => { const d = window.OrganismFactory && window.OrganismFactory.def(org); return (d && d.size) || SIZE; };
    let cx = 0, cy = 680, rowH = 0, col = 0;
    const place = (org) => { const z = sz(org); if (col === 4) { cx = 0; cy += rowH + 120; rowH = 0; col = 0; } const at = [cx, cy]; cx += z.w + 30; rowH = Math.max(rowH, z.h); col++; return at; };
    parts.forEach((p) => {
      const P = G.parts[p], preset = Array.isArray(P.preset) ? pick(r, P.preset) : P.preset;
      steps.push({ op: 'mount', organism: P.organism, as: p, at: place(P.organism), preset });
      if (P.configure) steps.push({ op: 'configure', target: p, params: P.configure });
      steps.push({ op: 'event', target: 'tl', topic: 'lane_add', payload: { kind: 'inst', target: '@' + p, name: P.name || p } });
    });
    (G.fx || []).forEach((f, i) => {
      if (i === 0) col = 4;                      // effects start their own row under the instruments
      steps.push({ op: 'mount', organism: f.organism, as: 'fx' + i, at: place(f.organism), preset: f.preset });
      steps.push({ op: 'patch', from: f.on, to: 'fx' + i });
    });
    // form → markers + clips
    let bar = 1; const motif = makeMotif(r, G.leadRhythm || 'anthem');
    form.forEach(sec => {
      const kind = sec.kind || sec.name.replace(/\s*\d+$/, ''), e = energyOf[kind] !== undefined ? energyOf[kind] : 0.7;
      steps.push({ op: 'event', target: 'tl', topic: 'marker_edit', payload: { op: 'add', bar, name: sec.name } });
      const plays = sec.play;
      parts.forEach(p => {
        const P = G.parts[p]; if (!plays.includes(p)) return;
        const notes = [];
        const nextIsDrop = G.impact !== false && form[form.indexOf(sec) + 1] && (form[form.indexOf(sec) + 1].kind || form[form.indexOf(sec) + 1].name).replace(/\s*\d+$/, '') === 'drop';
        for (let b = 0; b < sec.bars; b++) {
          const deg = prog[b % prog.length], o = b * 16, add = (arr) => arr.forEach(x => notes.push(Object.assign({}, x, { s: x.s + o })));
          // 3.34.2: a genre can write its own bars too (G.bar) — same contract as X.bar; X wins, then the genre, then the stock bar below
          const cx = { role: P.role, P, sec, kind, b, deg, r, e, key, prog, partKey: p, motif, G };
          let own = X && X.bar ? X.bar(cx) : null;
          if (!own && G.bar) own = G.bar(cx);
          if (own) add(own);
          else if (P.role === 'drums') add(drumBar(G, r, sec.drums || (kind === 'drop' || kind === 'chorus' ? 'main' : kind === 'build' ? 'build' : 'light'), b, sec.bars, e));
          else if (P.role === 'bass') add(bassBar(sec.bassStyle || P.style, deg, key, r, b));
          else if (P.role === 'chords') add(chordBar(sec.chordStyle || P.style, deg, key, P.voicing, P.octave));
          else if (P.role === 'lead') add(leadBar(motif, b, deg, key, r, P.octave));
          if (P.role === 'drums' && kind === 'drop' && b === 0 && G.impact !== false) add([{ s: 0, l: 4, n: 36 + PAD.crash, v: 1 }, { s: 0, l: 1, n: 36 + PAD.kick, v: 1 }]);
        }
        // the gap: everything stops half a beat before the drop, so the drop hits out of silence (the head-shake)
        if (nextIsDrop) { const cut = (sec.bars - 1) * 16 + 14; for (let i = notes.length - 1; i >= 0; i--) { const x = notes[i]; if (x.s >= cut) notes.splice(i, 1); else if (x.s + x.l > cut) x.l = cut - x.s; } }
        if (notes.length) steps.push({ op: 'event', target: 'tl', topic: 'clip_add', payload: { kind: 'notes', target: '@' + p, startBar: bar, bars: sec.bars, name: `${P.name || p} · ${sec.name}`, notes } });
      });
      bar += sec.bars;
    });
    if (G.master) { steps.push({ op: 'mount', organism: 'eravos.master-fx', as: 'master', at: [1620, 0], size: [640, 440], reuse: true }); steps.push({ op: 'configure', target: 'master', params: G.master }); }
    return steps;
  }

  // ---------------------------------------------------------------- recipe op: patch A's sound into B (first audio out → first audio in)
  R.defineOp('patch', (st, c) => {
    const K = c.K, a = c.alias[st.from] || st.from, b = c.alias[st.to] || st.to;
    const ra = K.registry.get(a), rb = K.registry.get(b); if (!ra || !rb) return;
    const out = Array.from(ra.hooks.values()).find(h => h.wire_type === 'audio' && h.direction === 'out');
    const inn = Array.from(rb.hooks.values()).find(h => h.wire_type === 'audio' && h.direction === 'in');
    if (out && inn) K.wires.register({ src: { instanceId: a, hookId: out.hook_id }, dst: { instanceId: b, hookId: inn.hook_id } });
  });

  // ---------------------------------------------------------------- registration: one Start card per genre, a new seed every press
  function addGenre(G) {
    genres.set(G.id, G);
    const rec = {
      id: 'eravos.recipe.engine.' + G.id, label: G.label, icon: G.icon || '✦', accent: G.accent || '#00d4ff', genome: 'eravos.genome.music',
      section: 'SONG ENGINE — every press writes a new song', tagline: G.tagline || '',
      hidden: true, // 3.34: every song lives behind ONE button — 📖 Songs (the Songbook writes these); not on the Start screen
      _seed: G.seed || 1,
      get steps() { return generate(G, this._seed); },
    };
    R.register(rec);
  }
  R.onBeforeRun((r) => { if (r && /^eravos\.recipe\.engine\./.test(r.id)) { if (r._pinned) { r._seed = r._pinned; r._pinned = 0; } else r._seed = 1 + Math.floor(Math.random() * 99999); } });

  // ---------------------------------------------------------------- the genres (data)
  const half = { kick: 'X.........X.....', snare: '........X.......', clap: '........x.......', hat: '..x...x...x...x.' };
  const halfLight = { hat: 'x.o.x.o.x.o.x.o.', kick: 'X...............' };
  const four = { kick: 'X...x...x...x...', clap: '....x.......x...', hat: '..x...x...x...x.', shaker: 'oxoxoxoxoxoxoxox' };
  const fourLight = { hat: '..x...x...x...x.', kick: 'x...............' };
  const twoStep = { kick: 'X.........X.....', snare: '....X.......X...', hat: 'x.x.x.xox.x.x.xo', shaker: 'oooooooooooooooo' };
  const trap = { kick: 'X......X..X.....', snare: '........X.......', hat: 'x.x.x.x.x.xxx.x.', b808: '................', ohat: '..............x.' };
  const eighties = { kick: 'X.......X.......', snare: '....X.......X...', hat: 'x.x.x.x.x.x.x.x.', tom: '..............o.' };
  const FORM_DROP = (drop2) => [
    { name: 'intro', bars: 8, play: ['chords', 'drums'] },
    { name: 'build', bars: 8, play: ['chords', 'drums', 'lead'] },
    { name: 'drop', bars: 16, play: ['drums', 'bass', 'lead', 'chords'] },
    { name: 'break', bars: 8, play: ['chords', 'lead'] },
    { name: 'build 2', kind: 'build', bars: 8, play: ['chords', 'drums'] },
    { name: 'drop 2', kind: 'drop', bars: 16, play: ['drums', 'bass', 'lead', 'chords'], bassStyle: drop2 },
    { name: 'outro', bars: 8, play: ['chords', 'drums'] },
  ];
  const FORM_SONG = [
    { name: 'intro', bars: 8, play: ['chords', 'drums'] },
    { name: 'verse', bars: 16, play: ['drums', 'bass', 'chords'] },
    { name: 'chorus', bars: 16, play: ['drums', 'bass', 'chords', 'lead'] },
    { name: 'verse 2', kind: 'verse', bars: 16, play: ['drums', 'bass', 'chords', 'lead'] },
    { name: 'chorus 2', kind: 'chorus', bars: 16, play: ['drums', 'bass', 'chords', 'lead'] },
    { name: 'outro', bars: 8, play: ['chords', 'drums'] },
  ];

  [
    { id: 'dubstep', label: 'Dubstep', icon: '🔊', accent: '#ff2266', bpm: [140, 140], roots: [5, 9, 2, 7], progs: [[1, 6, 3, 7], [1, 1, 6, 7], [1, 4, 6, 5]],
      tagline: '140 half-time, wobble drop, wide pads', drums: { main: half, light: halfLight }, leadRhythm: 'sparse', form: FORM_DROP('stutter'),
      parts: { drums: { role: 'drums', organism: 'eravos.pads', preset: 'Heavy (Dubstep/Trap)', name: 'Drums' },
        bass: { role: 'bass', organism: 'eravos.wobble-bass', preset: ['Classic Wub 1/8', 'Yoi Talker', 'Head Shaker', 'Laser Dive Wub', 'Half-time Growl 1/4t'], style: 'half', name: 'Wobble' },
        chords: { role: 'chords', organism: 'eravos.pad-forge', preset: ['Dark Choir', 'Her Essence', 'Underwater'], style: 'sustain', voicing: 'triad', octave: 4, name: 'Pad' },
        lead: { role: 'lead', organism: 'eravos.supersaw', preset: ['Festival Lead', 'Euphoric Lead'], octave: 5, name: 'Lead' } },
      master: { compThresh: -10, compRatio: 3, reverbMix: 0.15 } },
    { id: 'riddim', label: 'Riddim', icon: '🤖', accent: '#ff3355', bpm: [140, 150], roots: [5, 7, 2], progs: [[1, 1, 1, 6], [1, 1, 2, 1]],
      tagline: 'Stripped, robotic, square-wave riddim at 140–150', drums: { main: half, light: halfLight }, leadRhythm: 'sparse', form: FORM_DROP('half'),
      parts: { drums: { role: 'drums', organism: 'eravos.pads', preset: 'Heavy (Dubstep/Trap)', name: 'Drums' },
        bass: { role: 'bass', organism: 'eravos.wobble-bass', preset: ['Riddim Square 1/16t', 'Robot 1/16 square', 'Sub Quake (-2 oct)'], style: 'stutter', name: 'Riddim' },
        chords: { role: 'chords', organism: 'eravos.pad-forge', preset: ['Dark Choir', 'Underwater'], style: 'sustain', octave: 4, name: 'Atmos' },
        lead: { role: 'lead', organism: 'eravos.bass-forge', preset: ['Laser Zap', 'Screech'], octave: 4, name: 'Zap' } },
      master: { compThresh: -10, compRatio: 3, reverbMix: 0.1 } },
    { id: 'dnb', label: 'Drum & Bass', icon: '⚡', accent: '#00ccff', bpm: [172, 176], roots: [9, 2, 4, 0], progs: [[1, 6, 4, 5], [1, 7, 6, 7], [1, 3, 6, 4]],
      tagline: 'Rolling two-step at 174, Reese underneath', drums: { main: twoStep, light: { hat: 'x.x.x.x.x.x.x.x.', shaker: 'oooooooooooooooo' } }, leadRhythm: 'pluck', form: FORM_DROP('roll'),
      parts: { drums: { role: 'drums', organism: 'eravos.pads', preset: 'EDM Core', name: 'Drums' },
        bass: { role: 'bass', organism: 'eravos.reese-bass', preset: ['Classic Reese', 'Wide Rumble', 'Colour Bass'], style: 'roll', name: 'Reese' },
        chords: { role: 'chords', organism: 'eravos.pad-forge', preset: ['Celestial Glass', 'Golden Hour Strings'], style: 'sustain', voicing: 'seventh', octave: 4, name: 'Pad' },
        lead: { role: 'lead', organism: 'eravos.supersaw', preset: ['Trance Pluck', 'Monstercat Pluck'], octave: 5, name: 'Pluck' } },
      master: { compThresh: -10, compRatio: 2.5, reverbMix: 0.18 } },
    { id: 'neuro', label: 'Neurofunk', icon: '🧠', accent: '#8844ff', bpm: [172, 174], roots: [4, 5, 2], scales: ['minor', 'phrygian'], progs: [[1, 1, 2, 1], [1, 6, 1, 7]],
      tagline: 'Dark 174, flanged neuro Reese and stabs', drums: { main: twoStep, light: { hat: 'x.x.x.x.x.x.x.x.' } }, leadRhythm: 'sparse', form: FORM_DROP('stutter'),
      parts: { drums: { role: 'drums', organism: 'eravos.pads', preset: 'Heavy (Dubstep/Trap)', name: 'Drums' },
        bass: { role: 'bass', organism: 'eravos.reese-bass', preset: ['Neuro Flange', 'Melodic Growl', 'Hoover-ish'], style: 'roll', name: 'Neuro' },
        chords: { role: 'chords', organism: 'eravos.retro-poly', preset: ['Darksynth Saw', 'Brass Stab \'84'], configure: { arp: 'off' }, style: 'stab', octave: 4, name: 'Stabs' },
        lead: { role: 'lead', organism: 'eravos.bass-forge', preset: ['Neuro Reese-FM', 'Screech'], octave: 4, name: 'Growl' } },
      master: { compThresh: -9, compRatio: 3, reverbMix: 0.08 } },
    { id: 'future-bass', label: 'Future Bass', icon: '🌅', accent: '#ff66cc', bpm: [145, 155], roots: [5, 0, 7, 2], progs: [[1, 6, 3, 7], [6, 7, 5, 1], [4, 6, 1, 7], [1, 5, 6, 4]],
      tagline: 'Monstercat chops, plucks, colour bass', drums: { main: { kick: 'X.........x.....', clap: '........X.......', snare: '........x.......', hat: 'x.x.x.x.x.x.x.x.', ohat: '..............x.' }, light: { hat: 'x...x...x...x...' } },
      leadRhythm: 'pluck', form: FORM_DROP('half'),
      parts: { drums: { role: 'drums', organism: 'eravos.pads', preset: 'Future (Monstercat)', name: 'Drums' },
        bass: { role: 'bass', organism: 'eravos.reese-bass', preset: ['Colour Bass', 'Warm Future Sub'], style: 'half', name: 'Colour bass' },
        chords: { role: 'chords', organism: 'eravos.supersaw', preset: ['Future Bass Chords (add9)', 'Future Bass Chords (7th)'], configure: { chordMode: 'off' }, style: 'future', voicing: 'add9', octave: 4, name: 'Chords' },
        lead: { role: 'lead', organism: 'eravos.supersaw', preset: ['Monstercat Pluck', 'Trance Pluck'], octave: 5, name: 'Pluck' } },
      fx: [{ organism: 'eravos.fx-echo', preset: 'Future Pluck Echo', on: 'lead' }],
      master: { compThresh: -10, compRatio: 2.5, reverbMix: 0.2 } },
    { id: 'melodic', label: 'Melodic Dubstep', icon: '🌌', accent: '#aa66ff', bpm: [148, 152], roots: [2, 9, 5], progs: [[6, 4, 1, 5], [1, 6, 3, 7], [4, 6, 1, 7]],
      tagline: 'Strings, euphoric lead, growling melodic drop', drums: { main: half, light: halfLight }, leadRhythm: 'anthem', form: FORM_DROP('half'),
      parts: { drums: { role: 'drums', organism: 'eravos.pads', preset: 'Future (Monstercat)', name: 'Drums' },
        bass: { role: 'bass', organism: 'eravos.reese-bass', preset: ['Melodic Growl', 'Colour Bass'], style: 'half', name: 'Growl' },
        chords: { role: 'chords', organism: 'eravos.pad-forge', preset: ['Golden Hour Strings', 'Celestial Glass', 'Her Essence'], style: 'sustain', voicing: 'add9', octave: 4, name: 'Strings' },
        lead: { role: 'lead', organism: 'eravos.supersaw', preset: ['Euphoric Lead', 'Festival Lead'], octave: 5, name: 'Lead' } },
      fx: [{ organism: 'eravos.fx-echo', preset: 'Ping-pong 1/8.', on: 'lead' }],
      master: { compThresh: -10, compRatio: 2.5, reverbMix: 0.25 } },
    { id: 'house', label: 'House', icon: '🏠', accent: '#00ff88', bpm: [122, 126], roots: [9, 0, 7, 2], scales: ['minor', 'dorian'], progs: [[1, 4, 6, 5], [1, 7, 6, 7], [1, 1, 4, 4]],
      tagline: 'Four-on-the-floor, chord stabs, off-beat bass', drums: { main: four, light: fourLight }, leadRhythm: 'synth', form: FORM_SONG,
      parts: { drums: { role: 'drums', organism: 'eravos.pads', preset: 'EDM Core', name: 'Drums' },
        bass: { role: 'bass', organism: 'eravos.sub-engine', preset: ['Garage Punch', 'Deep Sine'], style: 'offbeat', name: 'Bass' },
        chords: { role: 'chords', organism: 'eravos.supersaw', preset: ['Chord Stab (triad)', 'Sidechain Chord Pump'], configure: { chordMode: 'off' }, style: 'stab', voicing: 'seventh', octave: 4, name: 'Stabs' },
        lead: { role: 'lead', organism: 'eravos.retro-poly', preset: ['Neon Keys', 'Arp Pluck'], configure: { arp: 'off' }, octave: 5, name: 'Keys' } },
      master: { compThresh: -12, compRatio: 2, reverbMix: 0.15 } },
    { id: 'techno', label: 'Techno', icon: '⚙', accent: '#cccccc', bpm: [128, 134], roots: [9, 4, 2], scales: ['minor', 'phrygian'], progs: [[1, 1, 1, 1], [1, 1, 6, 1]],
      tagline: 'Acid line, rolling kick, dark pad', drums: { main: { kick: 'X...X...X...X...', hat: '..x...x...x...x.', rim: '...o..o....o..o.', clap: '....x.......x...' }, light: { kick: 'X...X...X...X...', hat: '..x...x...x...x.' } },
      leadRhythm: 'sparse', form: FORM_SONG.map(s => Object.assign({}, s, { play: s.play.map(p => p === 'lead' ? 'bass' : p) })),
      parts: { drums: { role: 'drums', organism: 'eravos.pads', preset: 'EDM Core', name: 'Drums' },
        bass: { role: 'bass', organism: 'eravos.acid-synth', preset: ['Hardfloor Growl', 'Phuture Squelch', 'Rolling Bassline'], style: 'acid', name: '303' },
        chords: { role: 'chords', organism: 'eravos.pad-forge', preset: ['Underwater', 'Dark Choir'], style: 'sustain', octave: 3, name: 'Pad' } },
      master: { compThresh: -12, compRatio: 2.5, reverbMix: 0.12 } },
    { id: 'trap', label: 'Trap', icon: '💎', accent: '#ffaa00', bpm: [138, 146], roots: [1, 6, 11, 4], scales: ['minor', 'harmonic_minor'], progs: [[1, 6, 4, 5], [1, 1, 6, 5], [1, 7, 6, 5]],
      tagline: 'Half-time 140, sliding 808, hat rolls', drums: { main: trap, light: { hat: 'x.x.x.x.x.x.x.x.' } }, leadRhythm: 'pluck', form: FORM_SONG,
      parts: { drums: { role: 'drums', organism: 'eravos.pads', preset: 'Heavy (Dubstep/Trap)', name: 'Drums' },
        bass: { role: 'bass', organism: 'eravos.sub-engine', preset: ['808 Long Slide', '808 Boom'], style: '808', name: '808' },
        chords: { role: 'chords', organism: 'eravos.pad-forge', preset: ['Dark Choir', 'Her Essence'], style: 'sustain', octave: 4, name: 'Choir' },
        lead: { role: 'lead', organism: 'eravos.retro-poly', preset: ['Arp Pluck', 'Neon Keys'], configure: { arp: 'off' }, octave: 5, name: 'Bells' } },
      master: { compThresh: -10, compRatio: 3, reverbMix: 0.15 } },
    { id: 'synthwave', label: 'Synthwave (80s)', icon: '🌆', accent: '#ff44cc', bpm: [96, 110], roots: [9, 4, 2, 7], scales: ['minor', 'dorian'], progs: [[1, 6, 3, 7], [1, 7, 6, 7], [6, 4, 1, 5]],
      tagline: 'Neon 80s: pulsing bass, Juno pads, outrun lead', drums: { main: eighties, light: { kick: 'X.......X.......', hat: 'x.x.x.x.x.x.x.x.' } }, leadRhythm: 'synth', form: FORM_SONG,
      parts: { drums: { role: 'drums', organism: 'eravos.pads', preset: 'EDM Core', name: 'Drums' },
        bass: { role: 'bass', organism: 'eravos.retro-poly', preset: 'Synthwave Bass (arp)', configure: { arp: 'off', mono: true }, style: 'pulse8', name: 'Bass' },
        chords: { role: 'chords', organism: 'eravos.retro-poly', preset: ['Nightdrive Pad', 'String Machine'], configure: { arp: 'off' }, style: 'sustain', voicing: 'seventh', octave: 4, name: 'Pad' },
        lead: { role: 'lead', organism: 'eravos.retro-poly', preset: ['Outrun Lead', 'Brass Stab \'84'], configure: { arp: 'off' }, octave: 5, name: 'Lead' } },
      fx: [{ organism: 'eravos.fx-moddelay', preset: 'Juno Wide', on: 'chords' }, { organism: 'eravos.fx-echo', preset: 'Ping-pong 1/8.', on: 'lead' }],
      master: { compThresh: -12, compRatio: 2, reverbMix: 0.3, size: 3.5 } },
    { id: 'darkwave', label: 'Darkwave (80s)', icon: '🖤', accent: '#aa2255', bpm: [112, 124], roots: [4, 9, 11], scales: ['minor', 'phrygian'], progs: [[1, 6, 7, 1], [1, 4, 6, 5], [1, 7, 6, 5]],
      tagline: 'Cold 80s: driving bass, gothic organ, brass stabs', drums: { main: eighties, light: { kick: 'X.......X.......' } }, leadRhythm: 'synth', form: FORM_SONG,
      parts: { drums: { role: 'drums', organism: 'eravos.pads', preset: 'EDM Core', name: 'Drums' },
        bass: { role: 'bass', organism: 'eravos.retro-poly', preset: 'Darksynth Saw', configure: { arp: 'off', mono: true }, style: 'pulse8', name: 'Bass' },
        chords: { role: 'chords', organism: 'eravos.organ', preset: ['Vampire Ballroom', 'Cathedral Full', 'Hanging Tree'], style: 'sustain', octave: 4, name: 'Organ' },
        lead: { role: 'lead', organism: 'eravos.retro-poly', preset: ['Brass Stab \'84', 'Outrun Lead'], configure: { arp: 'off' }, octave: 5, name: 'Lead' } },
      fx: [{ organism: 'eravos.fx-echo', preset: 'Dub Throw', on: 'lead' }],
      master: { compThresh: -12, compRatio: 2, reverbMix: 0.28 } },
    { id: 'witch-house', label: 'Witch House', icon: '🔮', accent: '#6633aa', bpm: [64, 72], roots: [1, 4, 6], scales: ['minor', 'phrygian'], progs: [[1, 6, 1, 7], [1, 2, 1, 7]],
      tagline: 'Slow, screwed choir, 808 boom, haze', drums: { main: { kick: 'X.......X.......', snare: '........X.......', hat: 'x...x...x...x...' }, light: { hat: 'x.......x.......' } }, leadRhythm: 'sparse', form: FORM_SONG,
      parts: { drums: { role: 'drums', organism: 'eravos.pads', preset: 'Heavy (Dubstep/Trap)', name: 'Drums' },
        bass: { role: 'bass', organism: 'eravos.sub-engine', preset: ['808 Boom', 'Earthquake Drop'], style: 'drone', name: 'Boom' },
        chords: { role: 'chords', organism: 'eravos.coven', preset: ['Witch House Choir', 'Séance Pad'], style: 'sustain', octave: 4, name: 'Choir' },
        lead: { role: 'lead', organism: 'eravos.coven', preset: ['Ritual Bell', 'Crystal Coven'], octave: 5, name: 'Bell' } },
      fx: [{ organism: 'eravos.fx-haunt', preset: 'Chopped & Screwed', on: 'chords' }],
      master: { compThresh: -12, compRatio: 2, reverbMix: 0.35 } },
  ].forEach(addGenre);

  window.SongEngine = {
    styles: { bass: ['half', 'stutter', 'roll', 'offbeat', 'pulse8', 'acid', '808', 'drone', 'onedrop', 'dembow', 'psy', 'gallop'], chords: ['stab', 'future', 'arp', 'pluck', 'skank', 'bubble', 'pulse', 'sustain'] },
    addGenre, genres: () => Array.from(genres.values()), generate: (id, seed, X) => genres.has(id) ? generate(genres.get(id), seed, X) : null,
    helpers: { rng, pick, drumBar, bassBar, chordBar, leadBar, PAD },   // 3.34.1: what RhythmExpand builds on
    // same song again: SongEngine.write('synthwave', 4242)
    write(id, seed, o) { const rec = R.get('eravos.recipe.engine.' + id); if (!rec) return null; rec._pinned = seed || 1; return R.run(rec.id, Object.assign({ clear: true, origin: { x: 30, y: 20 } }, o || {})); },
  };
})();
