/* Genomes + recipes (eravos.genome.music, eravos.genomes-v10, eravos.recipe.*) as runnable data.
 * Ops: mount {organism, as, at:[x,y], size:[w,h], preset} · configure {target, params} · event {target, topic, payload}
 *      wire {from:[alias, hook], to:[alias, hook]} · bpm {bpm} · wait {ms}. '@alias' in payloads resolves to instance ids. */
(function () {
  const R = window.Recipes;
  const G = (id, label, tagline, archetypes, accent) => R.registerGenome({ id, label, tagline, archetypes, accent });
  G('eravos.genome.music', 'Music Production', 'COMPOSE · ARRANGE · MIX', ['eravos.pads', 'eravos.sequencer', 'eravos.timeline', 'eravos.sample-player', 'eravos.lfo', 'eravos.wobble-bass', 'eravos.acid-synth', 'eravos.reese-bass', 'eravos.channel', 'eravos.xy-pad'], '#00d4ff');
  G('eravos.genome.spatial', 'Spatial', 'ORBITAL · MELODIC · GENERATIVE', ['eravos.orbit', 'eravos.supersaw', 'eravos.arp', 'eravos.fx-echo', 'eravos.channel'], '#00ccff');
  G('eravos.genome.visual', 'Visual', 'GRID PAINTER · PATTERN SEQUENCER', ['eravos.pads', 'eravos.sequencer', 'eravos.euclid', 'eravos.sidechain-compressor'], '#ff44aa');
  G('eravos.genome.emerge', 'Emerge', 'GRANULAR CLOUD · EMERGENCE', ['eravos.granular', 'eravos.sample-player', 'eravos.fx-moddelay', 'eravos.fx-echo', 'eravos.lfo'], '#aaff44');
  G('eravos.genome.vagal', 'Vagal', 'BREATH · EMOTION · RESONANCE', ['eravos.breath', 'eravos.organ', 'eravos.granular', 'eravos.channel'], '#8844ff');

  // ---- the purpose recipe (from James's intent)
  R.register({
    id: 'eravos.recipe.raven-drop', label: 'Make a song for her', icon: '💘', accent: '#ff2266', genome: 'eravos.genome.music',
    featured: { icon: '💘', title: 'Make a song for her', text: 'Dubstep at 140. Her voice lands on the drop, then the bass hits. The Coach walks you through it: add her clips, pick the line, bounce a WAV. No music theory needed.' },
    tagline: 'Dubstep at 140, her voice on the drop, a coach, one-click export',
    steps: [
      { op: 'bpm', bpm: 140 },
      { op: 'mount', organism: 'eravos.session', as: 'session', at: [0, 0], size: [400, 540] },
      { op: 'configure', target: 'session', params: { songName: 'for her', root: 9, scale: 'minor', autoLength: true } },
      { op: 'mount', organism: 'eravos.coach', as: 'coach', at: [420, 0], size: [420, 300] },
      { op: 'configure', target: 'coach', params: { lesson: 'song-for-her' } },
      { op: 'mount', organism: 'eravos.pads', as: 'pads', at: [860, 580], size: [470, 470] },
      { op: 'configure', target: 'pads', params: { volume: 1.0 } },
      // 3.26: the Reese is her song's bass (James) — Wobble stays one click away in ＋ Add
      { op: 'mount', organism: 'eravos.reese-bass', as: 'bass', at: [1350, 580], size: [540, 420], preset: 'Her Drop (dubstep reese)' },
      { op: 'mount', organism: 'eravos.sequencer', as: 'seq', at: [0, 560], size: [840, 460] },
      { op: 'event', target: 'seq', topic: 'starter_load', payload: { name: 'dubstep half-time 140' } },
      { op: 'mount', organism: 'eravos.sample-player', as: 'vocal', at: [420, 310], size: [420, 240] },
      { op: 'mount', organism: 'eravos.clip-maker', as: 'clips', at: [0, 1040], size: [840, 470] },
      { op: 'mount', organism: 'eravos.bass-drop-builder', as: 'drop', at: [860, 0], size: [800, 560], preset: 'Song for her (8/7¾/¼/16)' },
      { op: 'configure', target: 'drop', params: { autoFire: false, outroBars: 8, vocalGain: 0.9, throw: 0.6, impactLevel: 0.65, padLevel: 0.25, riserLevel: 0.4, rollLevel: 0.5 } },
      { op: 'event', target: 'drop', topic: 'cue_edit', payload: { section: 'TENSION', patch: { target: '@seq', slot: 'A', djStart: -0.6, djEnd: -0.35 } } },
      { op: 'event', target: 'drop', topic: 'cue_edit', payload: { section: 'BUILD', patch: { target: '@seq', slot: 'B', djStart: -0.6, djEnd: -0.12 } } },
      { op: 'event', target: 'drop', topic: 'cue_edit', payload: { section: 'PAUSE', patch: { target: '@seq', slot: 'E' } } },
      { op: 'event', target: 'drop', topic: 'cue_edit', payload: { section: 'DROP', patch: { target: '@seq', slot: 'C' } } },
      { op: 'event', target: 'drop', topic: 'cue_edit', payload: { section: 'AFTER', patch: { target: '@seq', slot: 'D' } } },
      { op: 'mount', organism: 'eravos.master-fx', as: 'master', at: [860, 1070], size: [640, 440], reuse: true },
      { op: 'configure', target: 'master', params: { reverbMix: 0.18, size: 2.6, delayMix: 0.12, compThresh: -8, compRatio: 2.5, compAttack: 0.02, compRelease: 0.15, makeup: 0, ceiling: -1 } },
      { op: 'wire', from: ['clips', 'clip.hook.asset_out'], to: ['vocal', 'samp.hook.asset_in'] },
      { op: 'wire', from: ['vocal', 'samp.hook.asset_out'], to: ['drop', 'drop.hook.asset_in'] },
    ],
  });
  // ---- P9: a whole future-bass song written as instrument tracks (timeline 2.1), Monstercat palette
  const FD = { kick: 36, snare: 37, clap: 38, hat: 39, ohat: 40, crash: 44, snap: 47, clap2: 48 }; // pads bank D
  function futureDrums(bars, mode) {
    const n = [], hit = (s, p, v, l) => n.push({ s, l: l || 1, n: p, v });
    for (let b = 0; b < bars; b++) {
      const o = b * 16;
      if (mode === 'build') { const div = [4, 2, 1, 1][Math.min(3, b)]; for (let s = 0; s < 16; s += div) hit(o + s, FD.snap, 0.45 + 0.5 * (b * 16 + s) / (bars * 16)); if (b < 2) for (let s = 2; s < 16; s += 4) hit(o + s, FD.hat, 0.5); continue; }
      if (mode === 'drop' && b === 0) hit(o, FD.crash, 0.9, 8);
      hit(o, FD.kick, 1); hit(o + 10, FD.kick, 0.85);
      hit(o + 8, FD.clap, 1); hit(o + 8, FD.snare, 0.8); hit(o + 8, FD.clap2, 0.6);
      for (let s = 0; s < 16; s += 2) hit(o + s, FD.hat, s % 4 ? 0.55 : 0.8);
      hit(o + 14, FD.ohat, 0.6);
      if (b % 4 === 3) { hit(o + 13, FD.snap, 0.6); hit(o + 15, FD.snap, 0.8); }
    }
    return n;
  }
  const TL = (topic, payload) => ({ op: 'event', target: 'tl', topic, payload });
  R.register({
    id: 'eravos.recipe.future-bass', label: 'Future Bass (Monstercat)', icon: '🌅', accent: '#ff66cc', genome: 'eravos.genome.music',
    featured: { icon: '🌅', title: 'Future Bass song', text: 'A 16-bar melodic EDM song already written as tracks: chords, pluck, colour bass, drums, with echo and chorus patched in. Click any clip to edit its notes, drag dots to rewire, bounce a WAV.' },
    tagline: 'Instrument tracks + piano roll, future-bass chords, pluck, colour bass, drums at 150',
    steps: [
      { op: 'bpm', bpm: 150 },
      { op: 'mount', organism: 'eravos.session', as: 'session', at: [0, 0], size: [400, 540] },
      { op: 'configure', target: 'session', params: { songName: 'future bass', root: 5, scale: 'minor' } },
      { op: 'mount', organism: 'eravos.timeline', as: 'tl', at: [420, 0], size: [1100, 640] },
      { op: 'mount', organism: 'eravos.supersaw', as: 'chords', at: [0, 660], size: [480, 420], preset: 'Future Bass Chords (add9)' },
      { op: 'configure', target: 'chords', params: { chordMode: 'off' } },
      { op: 'mount', organism: 'eravos.supersaw', as: 'pluck', at: [500, 660], size: [480, 420], preset: 'Monstercat Pluck' },
      { op: 'mount', organism: 'eravos.reese-bass', as: 'bass', at: [1000, 660], size: [480, 420], preset: 'Colour Bass' },
      { op: 'mount', organism: 'eravos.pads', as: 'drums', at: [1500, 660], size: [470, 470], preset: 'Future (Monstercat)' },
      TL('lane_add', { kind: 'inst', target: '@chords', name: 'Chords' }),
      TL('lane_add', { kind: 'inst', target: '@pluck', name: 'Pluck' }),
      TL('lane_add', { kind: 'inst', target: '@bass', name: 'Bass' }),
      TL('lane_add', { kind: 'inst', target: '@drums', name: 'Drums' }),
      TL('marker_edit', { op: 'add', bar: 1, name: 'intro' }), TL('marker_edit', { op: 'add', bar: 5, name: 'build' }), TL('marker_edit', { op: 'add', bar: 9, name: 'drop' }),
      TL('clip_add', { kind: 'notes', target: '@chords', startBar: 1, bars: 8, name: 'chords · pads', fill: { progression: 'anthem', style: 'sustain', voicing: 'add9' } }),
      TL('clip_add', { kind: 'notes', target: '@chords', startBar: 9, bars: 8, name: 'chords · chops', fill: { progression: 'anthem', style: 'future', voicing: 'add9' } }),
      TL('clip_add', { kind: 'notes', target: '@pluck', startBar: 5, bars: 12, name: 'pluck', fill: { progression: 'anthem', style: 'pluck', voicing: 'add9' } }),
      TL('clip_add', { kind: 'notes', target: '@bass', startBar: 9, bars: 8, name: 'colour bass', fill: { progression: 'anthem', style: 'bass' } }),
      TL('clip_add', { kind: 'notes', target: '@drums', startBar: 5, bars: 4, name: 'build roll', notes: futureDrums(4, 'build') }),
      TL('clip_add', { kind: 'notes', target: '@drums', startBar: 9, bars: 8, name: 'drop beat', notes: futureDrums(8, 'drop') }),
      // P10: effects already patched in, so the wires show how routing works (drag any orange dot onto a window to add more)
      { op: 'mount', organism: 'eravos.fx-echo', as: 'echo', at: [500, 1100], size: [460, 470], preset: 'Future Pluck Echo' },
      { op: 'wire', from: ['pluck', 'saw.hook.audio_out'], to: ['echo', 'fx.hook.audio_in'] },
      { op: 'mount', organism: 'eravos.fx-moddelay', as: 'wide', at: [0, 1100], size: [440, 440], preset: 'Supersaw Widener' },
      { op: 'wire', from: ['chords', 'saw.hook.audio_out'], to: ['wide', 'fx.hook.audio_in'] },
    ],
  });
  // ---- 3.37: the Wub rig — a dancehall-style dubstep drop built from the separate Wubs tools, already wired
  R.register({
    id: 'eravos.recipe.wub-drop', label: 'Wub Drop (dancehall style)', icon: '🔊', accent: '#ff2266', genome: 'eravos.genome.music',
    tagline: 'Wub Osc → Wub Filter (talking mouth) → Destroyer, Wub Rate opening it, Wub Sub under it, a half-time beat at 140',
    steps: [
      { op: 'mount', organism: 'eravos.pads', as: 'pads', at: [0, 0] },
      { op: 'mount', organism: 'eravos.wub-osc', as: 'osc', at: [0, 520], preset: 'Dancehall Growl Stack (FM 1:1)' },
      { op: 'mount', organism: 'eravos.wub-filter', as: 'mouth', at: [540, 520], preset: 'Bun Dem Throat (OO → AE)' },
      { op: 'mount', organism: 'eravos.fx-destroyer', as: 'grit', at: [1080, 520], preset: 'Fold Growl' },
      { op: 'mount', organism: 'eravos.wub-rate', as: 'rate', at: [540, 1060], preset: 'Dancehall Switch-up' },
      { op: 'mount', organism: 'eravos.wub-sub', as: 'sub', at: [0, 1060], preset: 'Clean Sine' },
      { op: 'mount', organism: 'eravos.sequencer', as: 'seq', at: [500, 0] },
      { op: 'event', target: 'seq', topic: 'starter_load', payload: { name: 'dubstep half-time 140' } },
      { op: 'wire', from: ['seq', 'seq.hook.fire_out'], to: ['pads', 'pads.hook.seq_fire_in'] },
      { op: 'wire', from: ['osc', 'wubo.hook.audio_out'], to: ['mouth', 'fx.hook.audio_in'] },
      { op: 'wire', from: ['mouth', 'fx.hook.audio_out'], to: ['grit', 'fx.hook.audio_in'] },
      { op: 'wire', from: ['rate', 'wubrate.hook.mod_out'], to: ['mouth', 'wubf.hook.mod_wub'] },
    ],
  });
  R.register({
    id: 'eravos.recipe.quick-beat', label: 'Quick Beat', icon: '🥁', accent: '#00ff88', genome: 'eravos.genome.music',
    tagline: 'Drum machine + sequencer, wired, ready to play',
    steps: [
      { op: 'mount', organism: 'eravos.pads', as: 'pads', at: [0, 0] },
      { op: 'mount', organism: 'eravos.sequencer', as: 'seq', at: [500, 0] },
      { op: 'event', target: 'seq', topic: 'starter_load', payload: { name: 'four-on-floor house' } },
      { op: 'wire', from: ['seq', 'seq.hook.fire_out'], to: ['pads', 'pads.hook.seq_fire_in'] },
      { op: 'wire', from: ['pads', 'pads.hook.bank_change_out'], to: ['seq', 'seq.hook.bank_in'] },
    ],
  });
  R.register({
    id: 'eravos.recipe.full-session', label: 'Full Session', icon: '🎛', accent: '#00d4ff', genome: 'eravos.genome.music',
    tagline: 'Session, drums, bass, lead, timeline, mixer, master',
    steps: [
      { op: 'mount', organism: 'eravos.session', as: 'session', at: [0, 0] },
      { op: 'mount', organism: 'eravos.pads', as: 'pads', at: [440, 0] },
      { op: 'mount', organism: 'eravos.reese-bass', as: 'bass', at: [930, 0], preset: 'Classic Reese' },
      { op: 'mount', organism: 'eravos.supersaw', as: 'lead', at: [1490, 0], preset: 'Chord Stab (triad)' },
      { op: 'mount', organism: 'eravos.sequencer', as: 'seq', at: [0, 560] },
      { op: 'event', target: 'seq', topic: 'starter_load', payload: { name: 'DnB two-step 174' } },
      { op: 'mount', organism: 'eravos.channel', as: 'chBass', at: [800, 560] },
      { op: 'mount', organism: 'eravos.channel', as: 'chLead', at: [1040, 560] },
      { op: 'wire', from: ['bass', 'reese.hook.audio_out'], to: ['chBass', 'ch.hook.audio_in'] },
      { op: 'wire', from: ['lead', 'saw.hook.audio_out'], to: ['chLead', 'ch.hook.audio_in'] },
      { op: 'configure', target: 'chLead', params: { name: 'LEAD', sendRev: 0.3 } },
      { op: 'configure', target: 'chBass', params: { name: 'BASS' } },
      { op: 'mount', organism: 'eravos.timeline', as: 'tl', at: [0, 1060] },
      { op: 'mount', organism: 'eravos.master-fx', as: 'master', at: [1300, 560], reuse: true },
    ],
  });
  // ---- v10 modes as recipes (eravos.genomes-v10)
  R.register({
    id: 'eravos.recipe.spatial', label: 'Spatial', icon: '◌', accent: '#00ccff', genome: 'eravos.genome.spatial', tagline: 'ORBITAL · MELODIC · GENERATIVE — place notes in space',
    steps: [
      { op: 'mount', organism: 'eravos.orbit', as: 'orbit', at: [40, 40] },
      { op: 'mount', organism: 'eravos.supersaw', as: 'saw', at: [560, 40], preset: 'Trance Pluck' },
      { op: 'mount', organism: 'eravos.fx-echo', as: 'echo', at: [560, 500] },
      { op: 'mount', organism: 'eravos.channel', as: 'ch', at: [1140, 40] },
      { op: 'configure', target: 'orbit', params: { target: '@saw' } },
      { op: 'wire', from: ['saw', 'saw.hook.audio_out'], to: ['echo', 'fx.hook.audio_in'] },
      { op: 'wire', from: ['echo', 'fx.hook.audio_out'], to: ['ch', 'ch.hook.audio_in'] },
      { op: 'event', target: 'orbit', topic: 'preset_load', payload: { name: 'Pentatonic Rain' } },
      { op: 'configure', target: 'orbit', params: { target: '@saw' } },
    ],
  });
  R.register({
    id: 'eravos.recipe.visual', label: 'Visual', icon: '▦', accent: '#ff44aa', genome: 'eravos.genome.visual', tagline: 'GRID PAINTER · PATTERN SEQUENCER',
    steps: [
      { op: 'mount', organism: 'eravos.pads', as: 'pads', at: [40, 40] },
      { op: 'mount', organism: 'eravos.sequencer', as: 'seq', at: [540, 40] },
      { op: 'configure', target: 'seq', params: { view: 'paint' } },
      { op: 'event', target: 'seq', topic: 'starter_load', payload: { name: 'UKG 2-step' } },
      { op: 'configure', target: 'seq', params: { view: 'paint' } },
      { op: 'mount', organism: 'eravos.euclid', as: 'euclid', at: [540, 540] },
      { op: 'event', target: 'euclid', topic: 'ring_edit', payload: { ring: 0, patch: { target: '@pads', note: 42, hits: 5, steps: 16, rotation: 0 } } },
      { op: 'mount', organism: 'eravos.sidechain-compressor', as: 'sc', at: [1340, 40] },
      { op: 'configure', target: 'sc', params: { target: 'master', triggerMode: 'tempo', division: '1/4', depth: 0.5 } },
    ],
  });
  R.register({
    id: 'eravos.recipe.emerge', label: 'Emerge', icon: '∞', accent: '#aaff44', genome: 'eravos.genome.emerge', tagline: 'GRANULAR CLOUD · EMERGENCE — her voice as a shimmering cloud',
    steps: [
      { op: 'mount', organism: 'eravos.sample-player', as: 'samp', at: [40, 40] },
      { op: 'mount', organism: 'eravos.granular', as: 'gran', at: [540, 40] },
      { op: 'mount', organism: 'eravos.lfo', as: 'lfo', at: [540, 520] },
      { op: 'mount', organism: 'eravos.fx-moddelay', as: 'md', at: [1100, 40] },
      { op: 'wire', from: ['samp', 'samp.hook.asset_out'], to: ['gran', 'gran.hook.asset_in'] },
      { op: 'configure', target: 'lfo', params: { div: '4/1', depth: 0.3, polarity: 'bipolar' } },
      { op: 'wire', from: ['lfo', 'lfo.hook.mod_out'], to: ['gran', 'gran.hook.mod_position'] },
      { op: 'wire', from: ['gran', 'gran.hook.audio_out'], to: ['md', 'fx.hook.audio_in'] },
    ],
  });
  R.register({
    id: 'eravos.recipe.vagal', label: 'Vagal', icon: '◎', accent: '#8844ff', genome: 'eravos.genome.vagal', tagline: 'BREATH · EMOTION · RESONANCE — breathe with the music',
    steps: [
      { op: 'mount', organism: 'eravos.breath', as: 'breath', at: [40, 40] },
      { op: 'configure', target: 'breath', params: { pattern: 'COHERENCE' } },
      { op: 'mount', organism: 'eravos.organ', as: 'organ', at: [480, 40], preset: 'Hanging Tree' },
      { op: 'mount', organism: 'eravos.channel', as: 'ch', at: [1020, 40] },
      { op: 'wire', from: ['breath', 'breath.hook.breath_out'], to: ['organ', 'organ.hook.breath_in'] },
      { op: 'wire', from: ['organ', 'organ.hook.audio_out'], to: ['ch', 'ch.hook.audio_in'] },
      { op: 'configure', target: 'ch', params: { sendRev: 0.6 } },
    ],
  });
})();
