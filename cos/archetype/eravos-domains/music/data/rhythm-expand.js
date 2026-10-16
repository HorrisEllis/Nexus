/* ERAVOS RhythmExpand (3.34.1) — the rhythm of your words grows into music.
 * Words → Lyrics → Rhythm places every syllable on the beat (analyse + place). This turns that rhythm into a whole song:
 *   · the words are cut into sections (a blank line = a new section; one block of lines is cut every `per` lines),
 *     each section is as many bars as its words need (rounded up to an even number)
 *   · DRUMS play the words: a strong syllable is a kick (beats 1, 3) or a snare (beats 2, 4), an accent adds a clap, a weak
 *     syllable is a hat, a weak line end is a perc — over a quiet bar of the genre's own groove so the time never drops out
 *   · BASS lands on the strong syllables (the chord's root; a line end goes up to the fifth); bars with no words get the
 *     genre's own bass pattern
 *   · LEAD sings the words' contour: strong syllables climb, a question rises at the line end, a statement comes home
 *   · CHORDS, instruments, presets, effects and the master are the genre's own (Song Engine) — an intro and an outro frame it
 * Same words + genre + seed + flow → the same song. It is a Song Engine song with the words' rhythm in it: the engine's
 * output is untouched (RhythmExpand uses its optional generate(…, X) hook and helpers).
 *   RhythmExpand.write(text, { genre:'darkwave', seed, flow:'spoken', per:4 })  → the song on the canvas
 *   RhythmExpand.generate(text, opts)                                            → the recipe steps (no canvas) */
(function () {
  'use strict';
  const R = window.Recipes; if (!R) return;
  const ID = 'eravos.recipe.rhythm-expand'; let pending = null;
  const MT = () => window.MusicTheory, SE = () => window.SongEngine, LR = () => window.LyricRhythm;

  // words → sections: [{ lines, notes (placed syllables, with .off = lead scale offset), steps, bars }]
  function sections(text, o) {
    const L = LR(); if (!L) throw new Error('Lyrics → Rhythm is not loaded');
    let groups = String(text || '').replace(/\r/g, '').split(/\n\s*\n/).map(g => g.split('\n').map(l => l.trim()).filter(Boolean)).filter(g => g.length);
    if (groups.length < 2) {
      const lines = groups[0] || [], per = Math.max(1, (o.per | 0) || 4); groups = [];
      for (let i = 0; i < lines.length; i += per) groups.push(lines.slice(i, i + per));
    }
    return groups.map((lines, i) => {
      const pl = L.place(L.analyse(lines.join('\n')), o.flow, o.seed + i), seen = {};
      pl.notes.forEach(n => {   // the melody: strong syllables climb along the line; the line end rises on a question, comes home on a statement
        if (n.last) n.off = n.question ? 4 : 0;
        else if (n.stress) { seen[n.line] = seen[n.line] || 0; n.off = [0, 2, 4, 7, 4, 2][seen[n.line]++ % 6]; }
      });
      return { lines, notes: pl.notes, steps: pl.steps, bars: Math.max(2, 2 * Math.ceil(pl.steps / 32)) };
    });
  }

  function generate(text, o) {
    o = o || {};
    const S = SE(), L = LR(), H = S && S.helpers;
    if (!S || !H || !L) throw new Error('Song Engine and Lyrics → Rhythm must both be loaded');
    const G = S.genres().find(g => g.id === (o.genre || 'darkwave')); if (!G) throw new Error('unknown genre: ' + o.genre);
    const flow = L.FLOWS.includes(o.flow) ? o.flow : 'spoken', seed = (o.seed | 0) || 1;
    const secs = sections(text, { flow, seed, per: o.per }); if (!secs.length) throw new Error('no words to build a song from');
    const words = (lines) => lines[0].replace(/[^A-Za-z0-9'’ ]/g, '').trim().split(/\s+/).slice(0, 4).join(' ').toLowerCase();
    // 3.34.2: a genre whose parts are not called bass / chords / lead (the Bass Pack) names the parts that sing the words: G.wordsPlay = { verse: [...], frame: [...] }
    const WP = G.wordsPlay || {}, vplay = WP.verse || ['drums', 'bass', 'chords', 'lead'], fplay = WP.frame || ['chords', 'drums'];
    const form = [{ name: 'intro', kind: 'intro', bars: 4, play: fplay }]
      .concat(secs.map((s, i) => ({ name: `verse ${i + 1} · ${words(s.lines)}`, kind: 'verse', bars: s.bars, play: vplay, words: s })))
      .concat([{ name: 'outro', kind: 'outro', bars: 4, play: fplay }]);
    const PAD = H.PAD, N = (s, l, n, v) => ({ s, l, n, v });
    const X = {
      name: o.name || ('Words · ' + secs[0].lines[0].slice(0, 28)),
      form,
      bar(c) {
        const w = c.sec.words; if (!w) return null;               // intro / outro: the genre's own bar
        const lo = c.b * 16, here = w.notes.filter(n => n.s >= lo && n.s < lo + 16).map(n => Object.assign({}, n, { s: n.s - lo }));
        if (c.role === 'drums') {
          const out = H.drumBar(G, c.r, 'light', c.b, c.sec.bars, 0.5).map(x => Object.assign(x, { v: x.v * 0.5 }));   // the groove, quiet
          here.forEach(n => {
            if (n.stress) { out.push(N(n.s, 1, 36 + (Math.floor(n.s / 4) % 2 ? PAD.snare : PAD.kick), n.stress === 2 ? 1 : 0.9)); if (n.stress === 2) out.push(N(n.s, 1, 36 + PAD.clap, 0.85)); }
            else out.push(N(n.s, 0.5, 36 + (n.last ? PAD.perc : PAD.hat), n.last ? 0.6 : 0.45));
          });
          return out;
        }
        if (c.role === 'bass') {
          const strong = here.filter(n => n.stress);
          if (!strong.length) return H.bassBar(c.sec.bassStyle || c.P.style, c.deg, c.key, c.r, c.b);
          return strong.map((n, i) => N(n.s, Math.max(1, Math.min(6, (strong[i + 1] ? strong[i + 1].s : 16) - n.s)), MT().degreeToMidi(c.deg + (n.last ? 4 : 0), 1, c.key.root, c.key.scale), n.stress === 2 ? 1 : 0.9));
        }
        if (c.role === 'lead') {
          return here.filter(n => n.stress || n.last).map(n => N(n.s, Math.max(1, Math.min(4, n.l)), MT().degreeToMidi(c.deg + (n.off || 0), c.P.octave || 5, c.key.root, c.key.scale), n.stress === 2 ? 1 : 0.85));
        }
        return null;                                               // chords: the genre's own
      },
    };
    const steps = S.generate(G.id, seed, X);
    // onto a canvas that already has a Session / Timeline (the button path): add to those, don't mount a second pair
    if (o.reuse) steps.forEach(s => { if (s.op === 'mount' && (s.organism === 'eravos.session' || s.organism === 'eravos.timeline')) s.reuse = true; });
    return steps;
  }

  // same registration pattern as a Song Engine genre: a hidden recipe; write() runs it with the words
  R.register({ id: ID, label: 'Words → Song', icon: '♫', accent: '#ff7eb6', genome: 'eravos.genome.music', section: 'SONG FROM WORDS', tagline: '', hidden: true,
    get steps() { return pending ? generate(pending.text, pending.o) : []; } });
  window.RhythmExpand = {
    sections, generate,
    write(text, o) { pending = { text, o: o || {} }; return R.run(ID, Object.assign({ clear: true, origin: { x: 30, y: 20 } }, (o && o.run) || {})); },
  };
})();
