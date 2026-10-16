/* ERAVOS Bass Pack (3.34.2) — wubs, dubs, bass drops. Data + one bar-writer: eight new Song Engine genres.
 *   tearout · dubstep-og · riddim-war · drumstep · trapstep · bass-house · deathstep · tension-study
 * What a genre can do now (Song Engine's new G.bar hook; genres without one are untouched):
 *   · BARS WRITTEN BY THE GENRE — a section names a bass pattern per part (sec.pat = { wub: ['wub','yoi'] } alternates bar by bar).
 *     Patterns include triplets, 32nd-note machine-gun rolls, octave-jump "yoi", 3-3-2 riddim bounce, stair-steps.
 *   · REAL BUILDS — kind 'build' no longer repeats the stock snare roll. Drums: the kick drops out in the last 40%, hats go 8ths → 16ths,
 *     the snare goes backbeat → 8ths → 16ths → 32nds, all crescendo. A lead flagged `riser: true` climbs ~an octave and a half across
 *     the build while its notes get denser (quarters → 8ths → 16ths → 32nds). Chords follow sec.prog (VI → VII → iv → V: the tension
 *     the drop resolves).
 *   · THE PAUSE — kind 'pause': a bar or two where only a held chord sounds, cut half a beat before the drop (the engine's gap).
 *   · LIFT — sec.lift raises the chords and lead by N scale degrees without moving the bass (the last drop opens up over the same root).
 * Same genre + seed → the same song, as always.   SongEngine.write('tearout', 1234) */
(function () {
  'use strict';
  const SE = window.SongEngine; if (!SE || !SE.helpers) return;
  const H = SE.helpers, PAD = H.PAD, MT = () => window.MusicTheory;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const N = (s, l, n, v) => ({ s, l, n, v: clamp(v, 0.05, 1) });

  // ---------------------------------------------------------------- bass patterns: [step, length, octave (1 low / 2 high), scale-degree offset, velocity]
  const PAT = {
    sub:      [[0, 6, 1, 0, 1], [8, 5, 1, 0, 0.9]],                                                       // half-time sub: one on 1, one on 3
    dubsub:   [[0, 7, 1, 0, 1], [8, 3, 1, 0, 0.85], [12, 2, 1, 0, 0.7]],                                  // the 2006 sub: long, then a tail
    drone:    [[0, 16, 1, 0, 0.8]],                                                                       // one held note
    pulse8:   [0, 2, 4, 6, 8, 10, 12, 14].map((s, i) => [s, 1.5, 1, 0, i % 4 ? 0.7 : 0.9]),                // steady 8ths
    wub:      [[0, 7, 1, 0, 1], [8, 3, 1, 0, 0.92], [12, 4, 1, 0, 0.88]],                                  // long wobbles on the half-time grid
    wubHi:    [[0, 7, 1, 0, 1], [8, 3, 1, 0, 0.92], [12, 2, 2, 0, 0.85], [14, 2, 1, 2, 0.8]],
    yoi:      [[0, 2, 1, 0, 1], [2, 2, 2, 0, 0.9], [4, 2, 1, 0, 0.9], [6, 2, 2, 0, 0.85], [8, 4, 1, 0, 1], [12, 2, 2, 0, 0.9], [14, 2, 1, 0, 0.88]],   // the talker: low-high-low-high
    bounce:   [[0, 3, 1, 0, 1], [3, 3, 1, 0, 0.85], [6, 2, 2, 0, 0.8], [8, 3, 1, 0, 1], [11, 3, 1, 0, 0.85], [14, 2, 2, 0, 0.8]],               // 3-3-2, 3-3-2 — the riddim bounce
    bounceB:  [[0, 3, 1, 0, 1], [3, 3, 1, 0, 0.85], [6, 1, 1, 0, 0.8], [7, 1, 2, 0, 0.8], [8, 4, 1, 0, 1], [12, 2, 1, 2, 0.85], [14, 2, 1, 0, 0.85]], // the answer bar
    stair:    [[0, 2, 1, 0, 1], [3, 2, 1, 0, 0.85], [6, 2, 1, 2, 0.9], [8, 2, 1, 2, 0.9], [11, 2, 1, 4, 0.9], [14, 2, 1, 4, 0.85]],           // climbs
    stairB:   [[0, 2, 1, 4, 1], [3, 2, 1, 4, 0.85], [6, 2, 1, 2, 0.9], [8, 2, 1, 2, 0.9], [11, 2, 1, 0, 0.9], [14, 2, 1, 0, 0.85]],           // comes back down
    tri:      [0, 1.3333, 2.6667, 4, 5.3333, 6.6667].map(s => [s, 1.1, 1, 0, s % 4 ? 0.8 : 1]).concat([[8, 3, 1, 0, 1], [12, 1.1, 1, 0, 0.9], [13.3333, 1.1, 2, 0, 0.8], [14.6667, 1.1, 1, 0, 0.85]]), // triplet wub
    gunroll:  Array.from({ length: 16 }, (_, i) => [i * 0.5, 0.4, 1, 0, 0.5 + 0.5 * i / 15]).concat([[8, 5, 1, 0, 1]]),                      // 16 thirty-second notes, then a hit
    dnbroll:  [[0, 2, 1, 0, 1], [3, 2, 1, 0, 0.8], [6, 2, 1, 0, 0.8], [10, 2, 2, 0, 0.85], [12, 2, 1, 0, 0.8], [14, 2, 1, 0, 0.8]],
    bhA:      [[2, 2, 1, 0, 0.95], [6, 2, 1, 0, 0.9], [10, 2, 1, 0, 0.95], [14, 1, 1, 0, 0.8], [15, 1, 2, 0, 0.7]],                          // bass house: off-beats
    bhB:      [[2, 2, 1, 0, 0.95], [6, 2, 2, 0, 0.9], [10, 2, 1, 0, 0.95], [13, 1, 2, 0, 0.8], [14, 2, 1, 2, 0.85]],
  };
  const patNotes = (name, c, deg) => PAT[name] ? PAT[name].map(([s, l, o, d, v]) => N(s, l, MT().degreeToMidi(deg + d, o, c.key.root, c.key.scale), v)) : null;

  // ---------------------------------------------------------------- builds
  // drums: kick leaves in the last 40%, hats and snare speed up, everything crescendos
  function buildDrums(c) {
    const n = c.sec.bars, b = c.b, f = n > 1 ? b / (n - 1) : 1, out = [], t = (s) => (b * 16 + s) / (n * 16);
    const hit = (s, pad, v, l) => out.push(N(s, l || 0.5, 36 + pad, v));
    if (f < 0.6) [0, 8].forEach(s => hit(s, PAD.kick, 0.9, 1));
    const hs = f < 0.5 ? 2 : 1; for (let s = 0; s < 16; s += hs) hit(s, PAD.hat, 0.3 + 0.4 * t(s));
    if (f < 0.34) hit(8, PAD.snare, 0.7, 1);
    else { const st = f < 0.6 ? 2 : f < 0.86 ? 1 : 0.5; for (let s = 0; s < 16; s += st) hit(s, PAD.snare, 0.3 + 0.7 * t(s)); }
    if (b === n - 1) hit(0, PAD.clap, 0.8, 1);
    return out;
  }
  // a lead that climbs ~1.5 octaves while its notes get denser; base is the tonic so the climb is steady whatever the chords do
  function riser(c) {
    const n = c.sec.bars, f = n > 1 ? c.b / (n - 1) : 1, out = [], oct = c.P.octave || 5;
    const rate = f < 0.3 ? 4 : f < 0.6 ? 2 : f < 0.86 ? 1 : 0.5;
    for (let s = 0; s < 16; s += rate) { const t = (c.b * 16 + s) / (n * 16); out.push(N(s, Math.max(0.25, rate * 0.9), MT().degreeToMidi(1 + Math.round(t * 9), oct, c.key.root, c.key.scale), 0.35 + 0.65 * t)); }
    return out;
  }
  // the same acceleration on one bass note (a growl that speeds up under the build)
  function ramp(c, deg) {
    const n = c.sec.bars, f = n > 1 ? c.b / (n - 1) : 1, out = [], rate = f < 0.3 ? 4 : f < 0.6 ? 2 : f < 0.86 ? 1 : 0.5;
    for (let s = 0; s < 16; s += rate) out.push(N(s, Math.max(0.25, rate * 0.9), MT().degreeToMidi(deg, 1, c.key.root, c.key.scale), 0.4 + 0.6 * (c.b * 16 + s) / (n * 16)));
    return out;
  }

  // ---------------------------------------------------------------- the bar writer (G.bar) — null means "the stock bar"
  function bar(c) {
    const { role, P, sec, kind, b, key } = c, prog = sec.prog, deg = prog ? prog[b % prog.length] : c.deg, lift = sec.lift || 0;
    if (role === 'drums') return kind === 'build' && !sec.drums ? buildDrums(c) : null;
    if (role === 'bass') {
      const spec = sec.pat && sec.pat[c.partKey], x = Array.isArray(spec) ? spec[b % spec.length] : spec;
      if (x === 'ramp') return ramp(c, deg);
      const n = x && patNotes(x, c, deg); if (n) return n;
      return prog ? H.bassBar(sec.bassStyle || P.style, deg, key, c.r, b) : null;
    }
    if (role === 'chords') return prog || lift ? H.chordBar(sec.chordStyle || P.style, deg + lift, key, P.voicing, P.octave) : null;
    if (role === 'lead') {
      if (kind === 'build' && P.riser) return riser(c);
      return prog || lift ? H.leadBar(c.motif, b, deg + lift, key, c.r, P.octave) : null;
    }
    return null;
  }

  // ---------------------------------------------------------------- helpers for writing forms
  const S = (name, kind, bars, play, o) => Object.assign({ name, kind, bars, play }, o || {});
  const CLIMB = [6, 6, 7, 7, 4, 4, 5, 5];     // VI VI VII VII iv iv v v → i : the build the drop answers
  const PADS = (p) => ({ role: 'drums', organism: 'eravos.pads', preset: p, name: 'Drums' });
  const CHOIR = (presets, o) => Object.assign({ role: 'chords', organism: 'eravos.pad-forge', preset: presets, style: 'sustain', voicing: 'triad', octave: 4, name: 'Pad' }, o || {});

  // ---------------------------------------------------------------- the grids (16 steps: X loud · x normal · o ghost)
  const HALF = { kick: 'X.....x...x.....', snare: '........X.......', clap: '........X.......', hat: 'x.x.x.x.x.x.x.x.', ohat: '..............x.' };
  const LIGHT = { kick: 'X.......X.......', hat: 'x...x...x...x...' };
  const DOUBLE = { kick: 'X.......X..x....', snare: '....X.......X...', clap: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', ohat: '..x...x...x...x.' };
  const STRIP = { snare: '........X.......', hat: '..x...x...x...x.' };

  // ---------------------------------------------------------------- genres
  const GENRES = [
    // 1 ─ TEAROUT: screech, machine-gun, switch-ups; the second drop is heavier than the first
    { id: 'tearout', label: 'Tearout Brostep', icon: '🩸', accent: '#ff1744', family: 'EDM', bpm: [148, 152], roots: [4, 5, 2, 9, 7], scales: ['phrygian', 'minor', 'harmonic_minor'], progs: [[1, 1, 1, 1], [1, 1, 2, 1], [1, 1, 6, 7], [1, 7, 6, 5]],
      wordsPlay: { verse: ['drums', 'sub', 'wub', 'pad', 'screech'], frame: ['pad', 'drums'] },
      tagline: '150 half-time: screech lead, machine-gun roll, a switch-up to double time, and a second drop that is heavier',
      drums: { main: HALF, light: LIGHT, double: DOUBLE, strip: STRIP }, leadRhythm: 'sparse', bar,
      form: [S('intro', 'intro', 8, ['pad', 'drums']), S('build', 'build', 8, ['pad', 'drums', 'screech'], { prog: CLIMB }), S('pause', 'pause', 1, ['pad'], { prog: [5] }),
        S('drop', 'drop', 16, ['drums', 'sub', 'wub', 'screech', 'pad'], { pat: { sub: 'sub', wub: ['wub', 'wub', 'yoi', 'wubHi'] } }),
        S('switch', 'chorus', 8, ['drums', 'sub', 'gun', 'screech'], { drums: 'double', pat: { sub: 'sub', gun: ['bounce', 'bounceB', 'bounce', 'gunroll'] } }),
        S('break', 'break', 8, ['pad', 'melody']), S('build 2', 'build', 8, ['pad', 'drums', 'screech', 'gun'], { prog: CLIMB, pat: { gun: 'ramp' } }), S('pause 2', 'pause', 1, ['pad'], { prog: [5] }),
        S('drop 2', 'drop', 16, ['drums', 'sub', 'wub', 'gun', 'screech', 'pad'], { lift: 2, pat: { sub: 'sub', wub: ['yoi', 'wubHi', 'yoi', 'tri'], gun: ['bounce', 'bounceB'] } }),
        S('outro', 'outro', 8, ['pad', 'drums'])],
      parts: { drums: PADS('Heavy (Dubstep/Trap)'), sub: { role: 'bass', organism: 'eravos.sub-engine', preset: 'Dubstep Sub Layer', style: 'half', name: 'Sub' },
        wub: { role: 'bass', organism: 'eravos.wobble-bass', preset: ['Tearout Screech', 'Classic Wub 1/8', 'Head Shaker'], style: 'half', name: 'Wub' },
        gun: { role: 'bass', organism: 'eravos.bass-forge', preset: ['Machine Gun 1/32', 'Tearout Metal'], style: 'stutter', name: 'Machine gun' },
        screech: { role: 'lead', organism: 'eravos.bass-forge', preset: ['Screech', 'Tearout Metal'], octave: 4, riser: true, name: 'Screech' },
        melody: { role: 'lead', organism: 'eravos.supersaw', preset: ['Euphoric Lead', 'Festival Lead'], octave: 5, name: 'Break lead' },
        pad: CHOIR(['Dark Choir', 'Underwater', 'Frozen Halo (hold)'])},
      fx: [{ organism: 'eravos.fx-destroyer', preset: 'Bass Grit (parallel)', on: 'wub' }, { organism: 'eravos.fx-echo', preset: 'Dub Throw', on: 'melody' }],
      master: { compThresh: -9, compRatio: 3.5, reverbMix: 0.1 } },

    // 2 ─ DUBSTEP 2006: space is the instrument — sub, a skanking chord, echo, a dub break
    { id: 'dubstep-og', label: 'Dubstep (2006 · sub & space)', icon: '🕳', accent: '#7c4dff', family: 'EDM', bpm: [138, 142], roots: [9, 2, 4, 7, 0], scales: ['minor', 'dorian', 'phrygian'], progs: [[1, 1, 1, 1], [1, 1, 6, 1], [1, 7, 1, 6]],
      wordsPlay: { verse: ['drums', 'sub', 'chords', 'talk'], frame: ['chords', 'drums'] },
      tagline: '140: kick on 1, snare on 3, a sub you feel in your chest, dub chords on 2 and 4 thrown into echo',
      drums: { main: { kick: 'X.....x.........', snare: '........X.......', hat: '..x...x...x...x.', perc: '.o.....o...o....' }, light: { hat: '..x.....x.......', rim: '........o.......' }, sparse: { kick: 'X...............', snare: '........X.......', rim: '..............o.' } },
      leadRhythm: 'sparse', bar,
      form: [S('intro', 'intro', 8, ['chords', 'bell', 'drums']), S('verse', 'verse', 16, ['drums', 'sub', 'chords'], { drums: 'main', pat: { sub: 'dubsub' } }),
        S('build', 'build', 4, ['chords', 'drums'], { prog: [6, 7, 4, 5] }),
        S('drop', 'drop', 16, ['drums', 'sub', 'wub', 'chords', 'bell'], { pat: { sub: 'dubsub', wub: ['wub', 'wubHi'] } }),
        S('dub break', 'break', 8, ['drums', 'chords', 'bell'], { drums: 'sparse' }),
        S('drop 2', 'drop', 16, ['drums', 'sub', 'wub', 'chords', 'talk'], { pat: { sub: 'dubsub', wub: ['yoi', 'wub'] }, lift: 2 }),
        S('outro', 'outro', 8, ['chords', 'bell', 'drums'], { drums: 'sparse' })],
      parts: { drums: PADS('Breaks & World'), sub: { role: 'bass', organism: 'eravos.sub-engine', preset: ['Earthquake Drop', 'Dubstep Sub Layer'], style: 'half', name: 'Sub' },
        wub: { role: 'bass', organism: 'eravos.wobble-bass', preset: ['Half-time Growl 1/4t', 'Sub Pressure'], style: 'half', name: 'Wub' },
        chords: { role: 'chords', organism: 'eravos.pad-forge', preset: 'Dub Chord Bed', style: 'skank', voicing: 'triad', octave: 4, name: 'Dub chords' },
        bell: { role: 'lead', organism: 'eravos.coven', preset: ['Ritual Bell', 'Crystal Coven'], octave: 5, name: 'Bell' },
        talk: { role: 'lead', organism: 'eravos.wobble-bass', preset: 'Wobble Vibrato Lead', octave: 4, name: 'Talker' } },
      fx: [{ organism: 'eravos.dub-station', preset: 'Tubby Echo Chamber', on: 'chords' }, { organism: 'eravos.fx-echo', preset: 'Dub Throw', on: 'bell' }],
      master: { compThresh: -12, compRatio: 2.5, reverbMix: 0.22 } },

    // 3 ─ RIDDIM: a 2-bar loop that never changes, then stair-steps, then nothing but a snare
    { id: 'riddim-war', label: 'Riddim Warfare', icon: '🪖', accent: '#ff6d00', family: 'EDM', bpm: [148, 152], roots: [5, 7, 4, 2], scales: ['minor', 'phrygian'], progs: [[1, 1, 1, 1], [1, 1, 1, 7]],
      wordsPlay: { verse: ['drums', 'sub', 'sq', 'pad', 'zap'], frame: ['pad', 'drums'] },
      tagline: '150: the 3-3-2 bounce, stair-steps, a mute section that is only a snare, a zap that climbs the builds',
      drums: { main: { kick: 'X.....x.........', snare: '........X.......', clap: '........x.......', hat: 'x.x.x.x.x.x.x.x.' }, light: LIGHT, double: { kick: 'X.......X.......', snare: '....X.......X...', hat: '..x...x...x...x.' }, strip: { snare: '........X.......' } },
      leadRhythm: 'sparse', bar,
      form: [S('intro', 'intro', 4, ['pad', 'drums']), S('build', 'build', 8, ['pad', 'drums', 'zap'], { prog: CLIMB }), S('pause', 'pause', 1, ['pad'], { prog: [5] }),
        S('drop', 'drop', 16, ['drums', 'sub', 'sq', 'pad'], { pat: { sub: 'sub', sq: ['bounce', 'bounceB'] } }),
        S('switch', 'chorus', 8, ['drums', 'sub', 'stair'], { drums: 'double', pat: { sub: 'sub', stair: ['stair', 'stairB'] } }),
        S('mute', 'break', 4, ['drums', 'zap'], { drums: 'strip' }),
        S('build 2', 'build', 4, ['pad', 'drums', 'zap'], { prog: [6, 7, 4, 5] }), S('pause 2', 'pause', 1, ['pad'], { prog: [5] }),
        S('drop 2', 'drop', 16, ['drums', 'sub', 'sq', 'stair', 'zap', 'pad'], { lift: 2, pat: { sub: 'sub', sq: ['bounce', 'bounceB', 'bounce', 'tri'], stair: ['stair', 'stairB'] } }),
        S('outro', 'outro', 4, ['pad', 'drums'])],
      parts: { drums: PADS('Heavy (Dubstep/Trap)'), sub: { role: 'bass', organism: 'eravos.sub-engine', preset: 'Dubstep Sub Layer', style: 'half', name: 'Sub' },
        sq: { role: 'bass', organism: 'eravos.wobble-bass', preset: ['Riddim Square 1/16t', 'Robot 1/16 square'], style: 'stutter', name: 'Riddim' },
        stair: { role: 'bass', organism: 'eravos.bass-forge', preset: 'Riddim Stair', style: 'roll', name: 'Stair' },
        zap: { role: 'lead', organism: 'eravos.bass-forge', preset: ['Laser Zap', 'Screech'], octave: 4, riser: true, name: 'Zap' },
        pad: CHOIR(['Dark Choir', 'Underwater'], { name: 'Atmos' }) },
      master: { compThresh: -10, compRatio: 3, reverbMix: 0.08 } },

    // 4 ─ DRUMSTEP: the whole song flips between half-time and double-time
    { id: 'drumstep', label: 'Drumstep (half-time ⇄ double-time)', icon: '🥁', accent: '#00e5ff', family: 'EDM', bpm: [170, 174], roots: [9, 2, 4, 0], scales: ['minor', 'harmonic_minor', 'phrygian'], progs: [[1, 6, 4, 5], [1, 7, 6, 7], [1, 3, 6, 4]],
      wordsPlay: { verse: ['drums', 'sub', 'reese', 'pad', 'pluck'], frame: ['pad', 'drums'] },
      tagline: '172: a half-time drop with a Reese you can feel, then the drums double and the bass rolls',
      drums: { main: { kick: 'X.........x.....', snare: '........X.......', clap: '........x.......', hat: 'x.x.x.x.x.x.x.x.', ohat: '..............x.' }, light: { hat: 'x.x.x.x.x.x.x.x.', shaker: 'oooooooooooooooo' },
        fast: { kick: 'X.........X.....', snare: '....X.......X...', hat: 'x.x.x.xox.x.x.xo', shaker: 'oooooooooooooooo' } },
      leadRhythm: 'pluck', bar,
      form: [S('intro', 'intro', 8, ['pad', 'drums']), S('build', 'build', 8, ['pad', 'drums', 'pluck'], { prog: CLIMB }), S('pause', 'pause', 1, ['pad'], { prog: [5] }),
        S('drop', 'drop', 16, ['drums', 'sub', 'reese', 'pad'], { pat: { sub: 'sub', reese: ['wub', 'wubHi'] } }),
        S('fast', 'chorus', 16, ['drums', 'sub', 'reese', 'pluck', 'pad'], { drums: 'fast', pat: { sub: 'dnbroll', reese: 'dnbroll' } }),
        S('break', 'break', 8, ['pad', 'pluck']), S('build 2', 'build', 8, ['pad', 'drums', 'pluck'], { prog: CLIMB }), S('pause 2', 'pause', 1, ['pad'], { prog: [5] }),
        S('drop 2', 'drop', 16, ['drums', 'sub', 'reese', 'pad'], { lift: 2, pat: { sub: 'sub', reese: ['yoi', 'wub', 'yoi', 'tri'] } }),
        S('fast 2', 'chorus', 8, ['drums', 'sub', 'reese', 'pluck'], { drums: 'fast', pat: { sub: 'dnbroll', reese: 'dnbroll' } }),
        S('outro', 'outro', 8, ['pad', 'drums'])],
      parts: { drums: PADS('Heavy (Dubstep/Trap)'), sub: { role: 'bass', organism: 'eravos.sub-engine', preset: 'Dubstep Sub Layer', style: 'half', name: 'Sub' },
        reese: { role: 'bass', organism: 'eravos.reese-bass', preset: ['Her Drop (dubstep reese)', 'Neuro Flange', 'Classic Reese'], style: 'half', name: 'Reese' },
        pluck: { role: 'lead', organism: 'eravos.supersaw', preset: ['Monstercat Pluck', 'Trance Pluck'], octave: 5, riser: true, name: 'Pluck' },
        pad: CHOIR(['Celestial Glass', 'Golden Hour Strings'], { voicing: 'seventh' }) },
      master: { compThresh: -10, compRatio: 2.5, reverbMix: 0.18 } },

    // 5 ─ TRAP WUB: 808 slides under a wobble, rolling hats
    { id: 'trapstep', label: 'Trap Wub (808 + wobble)', icon: '🧨', accent: '#ffd600', family: 'EDM', bpm: [140, 144], roots: [1, 6, 8, 3], scales: ['minor', 'phrygian'], progs: [[1, 1, 6, 7], [1, 6, 1, 7]],
      wordsPlay: { verse: ['drums', 'sub', 'pad', 'bell'], frame: ['pad', 'drums'] },
      tagline: '140: 808 slides, hats that roll at the end of every beat, a wobble that answers the snare',
      drums: { main: { kick: 'X......X..X.....', snare: '........X.......', clap: '........X.......', hat: 'x.x.x.xxx.x.xxxx', ohat: '..............x.' }, light: { hat: 'x.x.x.x.x.x.x.x.', kick: 'X.......X.......' }, double: { kick: 'X..X..X...X.....', snare: '....X.......X...', hat: 'xxxxxxxxxxxxxxxx' } },
      leadRhythm: 'pluck', bar,
      form: [S('intro', 'intro', 8, ['pad', 'drums']), S('build', 'build', 8, ['pad', 'drums', 'bell'], { prog: CLIMB }),
        S('drop', 'drop', 16, ['drums', 'sub', 'wub', 'bell', 'pad'], { pat: { wub: ['wubHi', 'wub', 'wubHi', 'yoi'] } }),
        S('roll', 'chorus', 8, ['drums', 'sub', 'bell'], { drums: 'double' }),
        S('break', 'break', 8, ['pad', 'bell']), S('build 2', 'build', 8, ['pad', 'drums', 'bell'], { prog: CLIMB }),
        S('drop 2', 'drop', 16, ['drums', 'sub', 'wub', 'bell', 'pad'], { lift: 2, pat: { wub: ['yoi', 'wubHi', 'yoi', 'tri'] } }), S('outro', 'outro', 8, ['pad', 'drums'])],
      parts: { drums: PADS('Heavy (Dubstep/Trap)'), sub: { role: 'bass', organism: 'eravos.sub-engine', preset: ['808 Long Slide', '808 Boom'], style: '808', name: '808' },
        wub: { role: 'bass', organism: 'eravos.wobble-bass', preset: 'Trap Wub 808', style: 'half', name: 'Trap wub' },
        bell: { role: 'lead', organism: 'eravos.coven', preset: ['Crystal Coven', 'Ritual Bell'], octave: 5, name: 'Bell' },
        pad: CHOIR(['Dark Choir', 'Underwater']) },
      master: { compThresh: -10, compRatio: 3, reverbMix: 0.12 } },

    // 6 ─ BASS HOUSE: four on the floor, the bass talks on the off-beat
    { id: 'bass-house', label: 'Bass House', icon: '🏚', accent: '#76ff03', family: 'EDM', bpm: [126, 128], roots: [9, 0, 7, 2, 4], scales: ['minor', 'dorian'], progs: [[1, 1, 1, 7], [1, 1, 6, 7]],
      wordsPlay: { verse: ['drums', 'sub', 'stab', 'zap'], frame: ['stab', 'drums'] },
      tagline: '127: four on the floor, the wobble answers on the off-beat, a gap, a drop that swings',
      drums: { main: { kick: 'X...X...X...X...', clap: '....X.......X...', hat: 'x.x.x.x.x.x.x.x.', perc: '.o..o..o..o..o..' }, light: { kick: 'X...X...X...X...', hat: '..x...x...x...x.' } },
      leadRhythm: 'synth', bar,
      form: [S('intro', 'intro', 8, ['stab', 'drums']), S('build', 'build', 8, ['stab', 'drums', 'zap'], { prog: [6, 6, 7, 7, 4, 4, 5, 5], chordStyle: 'pulse' }),
        S('drop', 'drop', 16, ['drums', 'sub', 'wub', 'stab', 'zap'], { pat: { sub: 'bhA', wub: ['bhA', 'bhA', 'bhA', 'bhB'] } }),
        S('break', 'break', 8, ['stab', 'zap']), S('build 2', 'build', 8, ['stab', 'drums', 'zap'], { prog: [6, 6, 7, 7, 4, 4, 5, 5], chordStyle: 'pulse' }),
        S('drop 2', 'drop', 16, ['drums', 'sub', 'wub', 'stab', 'zap'], { lift: 2, pat: { sub: 'bhA', wub: ['bhB', 'bhA'] } }), S('outro', 'outro', 8, ['stab', 'drums'])],
      parts: { drums: PADS('EDM Core'), sub: { role: 'bass', organism: 'eravos.sub-engine', preset: 'Garage Punch', style: 'offbeat', name: 'Sub' },
        wub: { role: 'bass', organism: 'eravos.wobble-bass', preset: ['Off-beat Yoi (phase ½)', 'Monstercat Wub 1/4', 'Talking Chord Bass 1/8t'], style: 'offbeat', name: 'Wub' },
        stab: { role: 'chords', organism: 'eravos.supersaw', preset: ['Chord Stab (triad)', 'Sidechain Chord Pump'], configure: { chordMode: 'off' }, style: 'stab', voicing: 'seventh', octave: 4, name: 'Stabs' },
        zap: { role: 'lead', organism: 'eravos.bass-forge', preset: ['Laser Zap', 'Yoi Talker'], octave: 4, riser: true, name: 'Zap' } },
      master: { compThresh: -11, compRatio: 2.5, reverbMix: 0.12 } },

    // 7 ─ DEATHSTEP: dread. No drums for the first 8 bars, a 16-bar build, a long pause
    { id: 'deathstep', label: 'Deathstep (dread)', icon: '☠', accent: '#b71c1c', family: 'EDM', bpm: [140, 140], roots: [4, 1, 6], scales: ['phrygian', 'harmonic_minor', 'blues'], progs: [[1, 1, 1, 1], [1, 2, 1, 1], [1, 1, 2, 1]],
      wordsPlay: { verse: ['drums', 'sub', 'choir', 'metal'], frame: ['hex', 'choir', 'drums'] },
      tagline: '140: no drums at first, a 16-bar build up the scale, two bars of held dread, then the drop',
      drums: { main: { kick: 'X.........x.....', snare: '........X.......', clap: '........X.......', hat: '..x...x...x...x.', tom: '............o...' }, light: { hat: 'x.......x.......', kick: 'X...............' } },
      leadRhythm: 'sparse', bar,
      form: [S('drone', 'intro', 8, ['hex', 'choir']), S('pulse', 'verse', 8, ['drums', 'sub', 'choir'], { drums: 'light', pat: { sub: 'pulse8' } }),
        S('build', 'build', 16, ['choir', 'drums', 'metal', 'hex'], { prog: [6, 6, 7, 7, 6, 6, 7, 7, 4, 4, 5, 5, 5, 5, 5, 5] }), S('pause', 'pause', 2, ['choir'], { prog: [5, 5] }),
        S('drop', 'drop', 16, ['drums', 'sub', 'vow', 'metal'], { pat: { sub: 'sub', vow: ['wub', 'wub', 'yoi', 'tri'] } }),
        S('break', 'break', 8, ['choir', 'hex']), S('build 2', 'build', 8, ['choir', 'drums', 'metal', 'vow'], { prog: CLIMB, pat: { vow: 'ramp' } }), S('pause 2', 'pause', 1, ['choir'], { prog: [5] }),
        S('drop 2', 'drop', 16, ['drums', 'sub', 'vow', 'metal', 'choir'], { lift: 2, pat: { sub: 'sub', vow: ['yoi', 'wubHi', 'yoi', 'gunroll'] } }),
        S('outro', 'outro', 8, ['hex', 'choir'])],
      parts: { drums: PADS('Heavy (Dubstep/Trap)'), sub: { role: 'bass', organism: 'eravos.wobble-bass', preset: 'Sub Quake (-2 oct)', style: 'half', name: 'Sub quake' },
        vow: { role: 'bass', organism: 'eravos.wobble-bass', preset: 'Vowel Morph (shifted down)', style: 'half', name: 'Vowel' },
        metal: { role: 'lead', organism: 'eravos.bass-forge', preset: ['Tearout Metal', 'Screech'], octave: 4, riser: true, name: 'Metal' },
        choir: CHOIR(['Dark Choir', 'Frozen Halo (hold)'], { name: 'Choir' }),
        hex: { role: 'chords', organism: 'eravos.coven', preset: ['Hex Drone', 'Séance Pad'], style: 'sustain', octave: 3, name: 'Hex drone' } },
      fx: [{ organism: 'eravos.fx-destroyer', preset: 'Bass Grit (parallel)', on: 'vow' }, { organism: 'eravos.fx-haunt', preset: 'Telephone From Below', on: 'choir' }],
      master: { compThresh: -9, compRatio: 3, reverbMix: 0.2 } },

    // 8 ─ TENSION STUDY: every lever in one song — the benchmark
    { id: 'tension-study', label: 'Tension Study (everything)', icon: '🧪', accent: '#ff2266', family: 'EDM', bpm: [140, 140], roots: [9, 2, 4], scales: ['harmonic_minor'], progs: [[1, 6, 7, 1], [1, 1, 6, 5]],
      wordsPlay: { verse: ['drums', 'sub', 'pad', 'lead'], frame: ['pad', 'drums'] },
      tagline: 'Drone → pulse → build → pause → drop → double-time switch → bass-only strip → heavier build → final drop, lifted',
      drums: { main: HALF, light: LIGHT, double: DOUBLE, strip: STRIP, pulse: { kick: 'x...x...x...x...', hat: '..x...x...x...x.' } },
      leadRhythm: 'sparse', bar,
      form: [S('drone', 'intro', 8, ['pad', 'sub'], { pat: { sub: 'drone' } }),
        S('pulse', 'verse', 8, ['pad', 'sub', 'drums', 'bell'], { drums: 'pulse', pat: { sub: 'pulse8' } }),
        S('build', 'build', 8, ['pad', 'drums', 'lead'], { prog: CLIMB }), S('pause', 'pause', 1, ['pad'], { prog: [5] }),
        S('drop', 'drop', 16, ['drums', 'sub', 'wub', 'lead'], { pat: { sub: 'sub', wub: ['wub', 'yoi'] } }),
        S('switch', 'chorus', 8, ['drums', 'sub', 'riddim'], { drums: 'double', pat: { sub: 'sub', riddim: ['bounce', 'bounceB'] } }),
        S('strip', 'break', 8, ['drums', 'sub', 'bell'], { drums: 'strip', pat: { sub: 'sub' } }),
        S('build 2', 'build', 8, ['pad', 'drums', 'lead', 'growl'], { prog: CLIMB, pat: { growl: 'ramp' } }), S('pause 2', 'pause', 1, ['pad'], { prog: [5] }),
        S('final drop', 'drop', 16, ['drums', 'sub', 'wub', 'riddim', 'growl', 'lead', 'pad'], { lift: 2, pat: { sub: 'sub', wub: ['yoi', 'wubHi', 'yoi', 'wubHi'], riddim: ['bounce', 'bounceB'], growl: ['wub', 'wub', 'wub', 'gunroll'] } }),
        S('outro', 'outro', 8, ['pad', 'drums'], { drums: 'light' })],
      parts: { drums: PADS('Heavy (Dubstep/Trap)'), sub: { role: 'bass', organism: 'eravos.sub-engine', preset: 'Dubstep Sub Layer', style: 'half', name: 'Sub' },
        wub: { role: 'bass', organism: 'eravos.wobble-bass', preset: 'Classic Wub 1/8', style: 'half', name: 'Wub' },
        riddim: { role: 'bass', organism: 'eravos.wobble-bass', preset: 'Riddim Square 1/16t', style: 'stutter', name: 'Riddim' },
        growl: { role: 'bass', organism: 'eravos.bass-forge', preset: 'Brostep Growl', style: 'half', name: 'Growl' },
        lead: { role: 'lead', organism: 'eravos.bass-forge', preset: 'Screech', octave: 4, riser: true, name: 'Screech' },
        bell: { role: 'lead', organism: 'eravos.coven', preset: 'Ritual Bell', octave: 5, name: 'Bell' },
        pad: CHOIR('Dark Choir') },
      fx: [{ organism: 'eravos.fx-destroyer', preset: 'Bass Grit (parallel)', on: 'wub' }],
      master: { compThresh: -9, compRatio: 3, reverbMix: 0.15 } },
  ];
  GENRES.forEach(SE.addGenre);

  // ---------------------------------------------------------------- the Songbook: named songs on pinned seeds (the same song every time)
  const SONGS = [
    { id: 'bp-tearout', title: 'Tearout Cathedral', genre: 'tearout', seed: 62, mood: ['heavy', 'fast'],
      listen: 'Eight bars of choir and a light kick, then a build: the kick leaves, the snare goes backbeat → 8ths → 16ths → 32nds, and the screech climbs.',
      drop: 'One bar of held choir, half a beat of silence, then wub + sub + screech. The switch-up flips to double-time with a machine-gun roll; drop 2 adds the gun layer and lifts the choir.',
      voice: 'Her line in the pause bar (just the choir sounding) — the last word lands in the gap.' },
    { id: 'bp-dub', title: 'Sub & Space', genre: 'dubstep-og', seed: 47, mood: ['heavy', 'dark'],
      listen: 'Kick on 1, snare on 3, the chord on 2 and 4 thrown into the Tubby echo. The sub does the talking.',
      drop: 'Space first: the sub opens under the chord. The dub break thins the drums to kick and snare while the chords and bell ring into the echo; drop 2 brings the talker in, lifted.',
      voice: 'Throw her last word into the echo at the end of each dub chord.' },
    { id: 'bp-riddim', title: 'Riddim Warfare', genre: 'riddim-war', seed: 1, mood: ['heavy', 'fast'],
      listen: 'The same 3-3-2 bounce, bar after bar, until the stair-steps climb. Then the mute section: just a snare and the zap.',
      drop: 'Drop 2 adds stair + zap over the bounce, and every fourth bar flips to triplets.',
      voice: 'Chop one word to the 3-3-2 and play it where the wub would be.' },
    { id: 'bp-drumstep', title: 'Half-Time Murder', genre: 'drumstep', seed: 3, mood: ['heavy', 'fast'],
      listen: 'Feel 87 BPM in the drop, then the drums double and it is 174 — same tempo, twice the energy.',
      drop: 'Half-time Reese drop, a fast roll, a break, then a second drop (lifted) and another fast roll.',
      voice: 'Her line over the break, then cut it dry into the pause.' },
    { id: 'bp-trap', title: 'Slide Rule', genre: 'trapstep', seed: 1, mood: ['heavy', 'party'],
      listen: '808 slides under a trap wobble; the hats roll at the end of each beat.',
      drop: 'The roll section runs the hats as straight 16ths with a 2-and-4 snare for 8 bars, then returns to the drop.',
      voice: 'Short phrases landing on the snare.' },
    { id: 'bp-bhouse', title: 'Low End Lease', genre: 'bass-house', seed: 1, mood: ['party', 'fast'],
      listen: 'Four on the floor; the wobble answers in the gaps between kicks.',
      drop: 'Gap, crash, then the off-beat bass. Drop 2 lifts the stabs two degrees.',
      voice: 'Chopped one-word hits on the off-beats.' },
    { id: 'bp-dread', title: 'Dread Protocol', genre: 'deathstep', seed: 2, mood: ['dark', 'heavy'],
      listen: 'No drums for 8 bars. A 16-bar build climbs VI → VII → iv → V, then two bars of held dread.',
      drop: 'Two bars of just the choir, half a beat of silence, then vowel bass + tearout metal. Drop 2 ends on a machine-gun roll.',
      voice: 'Slow, dry, in the two-bar pause.' },
    { id: 'bp-study', title: 'Tension Study No. 1', genre: 'tension-study', seed: 3, mood: ['heavy', 'dark'],
      listen: 'Drone, pulse, build, pause, drop, switch, strip, heavier build, final drop (lifted). Every section is a different kind of contrast.',
      drop: 'Two drops, one switch-up, one stripped section (sub, hats and a bell) — put Contrast on a pair of sections and compare.',
      voice: 'The strip section is the place for her voice: it is only a sub, hats and a bell.' },
  ];
  if (window.Songbook && window.Songbook.add) SONGS.forEach(window.Songbook.add);
  window.BassPack = { genres: GENRES.map(g => g.id), songs: SONGS.map(s => s.id), patterns: Object.keys(PAT) };
})();
