/* ERAVOS Songbook (3.29) — finished songs to start from, on a page of its own (off the canvas).
 * 1. New Song Engine genres (data only): Reggae Dub (Bun Dem) · Dancehall · Hanging Tree (desert goth) · Phonk ·
 *    Lo-fi · Breath Ambient. They also appear as SONG ENGINE cards on the Start screen.
 * 2. The Songbook: named songs = a genre + a pinned seed (the same song every time) + what to listen for, what the
 *    drop does and where her voice clips go. "Write it" builds it on the canvas; "Another like it" rolls a new seed.
 *    Some songs are locked until a Learn lesson unlocks them (Learn.unlocked()).
 * Nothing here touches the canvas code: the page is its own overlay; songs land on the canvas through SongEngine/Recipes. */
(function () {
  'use strict';
  const SE = window.SongEngine, R = window.Recipes;
  if (!SE || !R) return;

  // ---------------------------------------------------------------- genres
  const FORM_DUB = [
    { name: 'intro', bars: 4, play: ['drums', 'skank'], drums: 'light' },
    { name: 'verse', bars: 16, play: ['drums', 'bass', 'skank', 'organ'], drums: 'main' },
    { name: 'chorus', bars: 8, play: ['drums', 'bass', 'skank', 'organ', 'lead'] },
    { name: 'dub break', kind: 'break', bars: 8, play: ['drums', 'bass'], drums: 'light' },
    { name: 'build', bars: 4, play: ['drums', 'skank'] },
    { name: 'drop', bars: 16, play: ['drums', 'bass', 'skank', 'organ', 'lead'], drums: 'steppers' },
    { name: 'outro', bars: 8, play: ['skank', 'organ', 'drums'], drums: 'light' },
  ];
  const FORM_SONG = [
    { name: 'intro', bars: 8, play: ['chords', 'drums'] },
    { name: 'verse', bars: 16, play: ['drums', 'bass', 'chords'] },
    { name: 'build', bars: 4, play: ['drums', 'chords'] },
    { name: 'drop', bars: 16, play: ['drums', 'bass', 'chords', 'lead'] },
    { name: 'verse 2', kind: 'verse', bars: 16, play: ['drums', 'bass', 'chords', 'lead'] },
    { name: 'outro', bars: 8, play: ['chords', 'drums'] },
  ];
  [
    { id: 'reggae', label: 'Reggae Dub (Bun Dem)', icon: '🔥', accent: '#ffcc00', bpm: [72, 80], roots: [7, 2, 9, 4], scales: ['minor', 'dorian'], progs: [[1, 4, 1, 4], [1, 7, 1, 7], [1, 4, 5, 4]],
      tagline: 'One-drop at 75: skank on 2 and 4, organ bubble, sound-system sub, dub echo throws',
      drums: { main: { kick: '........X.......', rim: '........X.......', hat: 'x.x.x.x.x.x.x.x.' }, light: { rim: '........x.......', hat: '..x...x...x...x.' }, steppers: { kick: 'X...X...X...X...', rim: '........X.......', hat: 'x.xox.xox.xox.xo' } },
      leadRhythm: 'sparse', form: FORM_DUB,
      parts: { drums: { role: 'drums', organism: 'eravos.pads', preset: 'Breaks & World', name: 'Drums' },
        bass: { role: 'bass', organism: 'eravos.sub-engine', preset: 'Sound-System Sub (reggae)', style: 'onedrop', name: 'Bass' },
        skank: { role: 'chords', organism: 'eravos.pad-forge', preset: 'Dub Chord Bed', style: 'skank', voicing: 'triad', octave: 4, name: 'Skank' },
        organ: { role: 'chords', organism: 'eravos.organ', preset: 'Desert Gospel', style: 'bubble', octave: 4, name: 'Bubble' },
        lead: { role: 'lead', organism: 'eravos.retro-poly', preset: ['Neon Keys', 'Arp Pluck'], configure: { arp: 'off' }, octave: 5, name: 'Melodica' } },
      fx: [{ organism: 'eravos.dub-station', preset: 'Tubby Echo Chamber', on: 'skank' }, { organism: 'eravos.fx-echo', preset: 'Dub Throw', on: 'lead' }],
      master: { compThresh: -12, compRatio: 2.5, reverbMix: 0.2 } },
    { id: 'dancehall', label: 'Dancehall Riddim', icon: '🇯🇲', accent: '#00cc66', bpm: [92, 100], roots: [1, 6, 9], progs: [[1, 6, 7, 1], [1, 1, 4, 5], [1, 7, 6, 7]],
      tagline: 'Dembow at 96: 3-3-2 bass, rim clicks, airhorn-ready',
      drums: { main: { kick: 'X...X...X...X...', snare: '...X..X....X..X.', hat: 'x.x.x.x.x.x.x.x.', perc: '..o...o...o...o.' }, light: { kick: 'X...X...X...X...', rim: '...x..x....x..x.' } },
      leadRhythm: 'pluck', form: FORM_SONG,
      parts: { drums: { role: 'drums', organism: 'eravos.pads', preset: 'Breaks & World', name: 'Drums' },
        bass: { role: 'bass', organism: 'eravos.sub-engine', preset: ['808 Boom', 'Sound-System Sub (reggae)'], style: 'dembow', name: 'Bass' },
        chords: { role: 'chords', organism: 'eravos.pad-forge', preset: 'Dub Chord Bed', style: 'stab', octave: 4, name: 'Stabs' },
        lead: { role: 'lead', organism: 'eravos.retro-poly', preset: ['Arp Pluck', 'Neon Keys'], configure: { arp: 'off' }, octave: 5, name: 'Hook' } },
      fx: [{ organism: 'eravos.dub-station', preset: 'Bun Dem (dancehall)', on: 'lead' }],
      master: { compThresh: -10, compRatio: 3, reverbMix: 0.12 } },
    { id: 'hanging-tree', label: 'Hanging Tree (desert goth)', icon: '🌵', accent: '#8a2be2', bpm: [72, 80], roots: [4, 9, 2], scales: ['minor', 'phrygian'], progs: [[1, 1, 6, 7], [1, 6, 1, 7], [1, 1, 2, 1]],
      tagline: 'Hypnotic organ throb locked to the beat, fuzz rumble, dry drums, a bell in the dark',
      drums: { main: { kick: 'X.......X.x.....', snare: '....X.......X...', hat: 'x.x.x.x.x.x.x.x.', tom: '..............o.' }, light: { tom: 'x.......x.......', hat: '..x...x...x...x.' } },
      leadRhythm: 'sparse', form: FORM_SONG,
      parts: { drums: { role: 'drums', organism: 'eravos.pads', preset: 'Breaks & World', name: 'Drums' },
        bass: { role: 'bass', organism: 'eravos.reese-bass', preset: 'Wide Rumble', style: 'pulse8', name: 'Fuzz bass' },
        chords: { role: 'chords', organism: 'eravos.organ', preset: ['Hanging Tree', 'Lanegan Drone'], style: 'sustain', octave: 3, name: 'Organ' },
        lead: { role: 'lead', organism: 'eravos.coven', preset: ['Ritual Bell', 'Crystal Coven'], octave: 5, name: 'Bell' } },
      fx: [{ organism: 'eravos.fx-haunt', preset: 'Haunted Cassette', on: 'lead' }],
      master: { compThresh: -12, compRatio: 2, reverbMix: 0.25 } },
    { id: 'phonk', label: 'Phonk', icon: '🚗', accent: '#ff4400', bpm: [128, 140], roots: [1, 4, 6], scales: ['minor', 'phrygian'], progs: [[1, 1, 6, 5], [1, 7, 6, 7]],
      tagline: 'Cowbell melody, distorted 808, Memphis haze',
      drums: { main: { kick: 'X......X..X.....', snare: '....X.......X...', hat: 'x.x.x.x.x.xxx.x.', cowbell: 'X..X..X...X..X..' }, light: { cowbell: 'X..X..X...X..X..', hat: 'x...x...x...x...' } },
      leadRhythm: 'pluck', form: FORM_SONG,
      parts: { drums: { role: 'drums', organism: 'eravos.pads', preset: 'Heavy (Dubstep/Trap)', name: 'Drums' },
        bass: { role: 'bass', organism: 'eravos.sub-engine', preset: ['808 Boom', '808 Long Slide'], style: '808', name: '808' },
        chords: { role: 'chords', organism: 'eravos.pad-forge', preset: ['Dark Choir', 'Underwater'], style: 'sustain', octave: 4, name: 'Haze' },
        lead: { role: 'lead', organism: 'eravos.retro-poly', preset: ['Arp Pluck', '80s · Stranger Arp'], configure: { arp: 'off' }, octave: 5, name: 'Bell' } },
      fx: [{ organism: 'eravos.fx-haunt', preset: 'Telephone From Below', on: 'chords' }],
      master: { compThresh: -9, compRatio: 3, reverbMix: 0.1 } },
    { id: 'lofi', label: 'Lo-fi Chopped', icon: '📼', accent: '#c9a36b', bpm: [70, 86], roots: [0, 5, 7, 2], scales: ['dorian', 'minor'], progs: [[2, 5, 1, 6], [1, 6, 2, 5], [4, 3, 6, 2]],
      tagline: 'Lazy swing, warm sevenths, tape warble and vinyl',
      drums: { main: { kick: 'X......x..X.....', snare: '....X.......X...', hat: 'x.xox.x.x.xox.xo' }, light: { hat: 'x...x...x...x...' } },
      leadRhythm: 'sparse', form: FORM_SONG.map(s => Object.assign({}, s)), impact: false,
      parts: { drums: { role: 'drums', organism: 'eravos.pads', preset: 'Breaks & World', name: 'Drums' },
        bass: { role: 'bass', organism: 'eravos.sub-engine', preset: 'Deep Sine', style: 'half', name: 'Bass' },
        chords: { role: 'chords', organism: 'eravos.retro-poly', preset: ['Neon Keys', 'EDM Pad · Chillwave Juno Wash'], configure: { arp: 'off' }, style: 'sustain', voicing: 'seventh', octave: 4, name: 'Keys' },
        lead: { role: 'lead', organism: 'eravos.pad-forge', preset: ['EDM Pad · Lo-fi Tape Pad', 'Celestial Glass'], octave: 5, name: 'Tape' } },
      fx: [{ organism: 'eravos.fx-haunt', preset: 'Haunted Cassette', on: 'chords' }],
      master: { compThresh: -14, compRatio: 2, reverbMix: 0.2 } },
    { id: 'ambient', label: 'Breath Ambient', icon: '🫧', accent: '#66ccff', bpm: [60, 68], roots: [0, 2, 4, 7], scales: ['dorian', 'major'], progs: [[1, 4, 6, 5], [1, 5, 6, 4], [4, 1, 5, 6]],
      tagline: 'No drums. Glass, choir and a sub that breathes; the "drop" is the harmony opening',
      drums: { main: {}, light: {} }, leadRhythm: 'sparse', impact: false,
      form: [{ name: 'breathe in', kind: 'intro', bars: 8, play: ['chords'] }, { name: 'open', kind: 'chorus', bars: 16, play: ['chords', 'bass', 'lead'] }, { name: 'drift', kind: 'break', bars: 8, play: ['chords', 'lead'] }, { name: 'open 2', kind: 'chorus', bars: 16, play: ['chords', 'bass', 'lead'] }, { name: 'drift 2', kind: 'break', bars: 8, play: ['chords', 'bass', 'lead'] }, { name: 'breathe out', kind: 'outro', bars: 8, play: ['chords', 'bass'] }],
      parts: { bass: { role: 'bass', organism: 'eravos.sub-engine', preset: 'Deep Sine', style: 'drone', name: 'Sub' },
        chords: { role: 'chords', organism: 'eravos.pad-forge', preset: ['Celestial Glass', 'Her Essence', 'EDM Pad · Arctic Shimmer'], style: 'sustain', voicing: 'add9', octave: 4, name: 'Glass' },
        lead: { role: 'lead', organism: 'eravos.coven', preset: 'Crystal Coven', octave: 5, name: 'Choir' } },
      master: { compThresh: -16, compRatio: 1.5, reverbMix: 0.4 } },
  ].forEach(SE.addGenre);

  // ---------------------------------------------------------------- the songbook (data)
  // voice: where her clips go. The steps are the same everywhere (drop a clip on the canvas → its Sample window →
  // "Send clip to… → Drop Builder" or drag onto a Timeline audio lane); the text says WHERE in this song it lands best.
  const SONGS = [
    { id: 'for-her', title: 'Make a song for her', recipe: 'eravos.recipe.raven-drop', mood: ['heavy', 'her'], bpm: 140, genre: 'Dubstep',
      listen: 'Intro, build, one beat of silence, then the bass. The Coach walks you through it.',
      drop: 'Her line ends exactly on drop beat 1; stutter ×3 makes "gi-gi-give…". Then everything hits at once.',
      voice: 'This one is built for her clips: drop them on the canvas and follow the Coach.' },
    { id: 'shake', title: 'Give Your Head a Shake', genre: 'dubstep', seed: 1407, mood: ['heavy', 'her'],
      listen: 'Half-time pads, a wobble that talks, and the gap before each drop.',
      drop: 'Everything stops half a beat before the drop, then crash + kick + wobble land together.',
      voice: 'Put her line at the end of "build" so the last word lands in the gap.' },
    { id: 'bun-dem', title: 'Bun Dem', genre: 'reggae', seed: 75, mood: ['island', 'warm'],
      listen: 'Kick and rim only on beat 3 (one-drop), skank on 2 and 4, organ bubbling on the off-beats.',
      drop: 'After the dub break (just drums + bass), the drop switches to steppers: kick on every beat.',
      voice: 'Her clips through the Dub Station echo in the dub break — throw the last word into the echo.' },
    { id: 'riddim-yard', title: 'Yard Riddim', genre: 'dancehall', seed: 96, mood: ['island', 'party'],
      listen: 'The dembow: kick on every beat, snare on the 3-3-2. Bass follows the same 3-3-2.',
      drop: 'Gap, crash, then the hook comes in over the full riddim.',
      voice: 'Short phrases work best — chop one word and play it as a pad on the off-beats.' },
    { id: 'midnight-drive', title: 'Midnight Drive', genre: 'synthwave', seed: 1984, mood: ['80s', 'warm'],
      listen: 'Eighth-note pulse bass, Juno pad, outrun lead with ping-pong echo.',
      drop: 'No hard drop — the chorus lifts with the lead and the full drums.',
      voice: 'Her voice under the chorus lead, low and wide, with a long reverb.' },
    { id: 'hanging-tree', title: 'Under the Hanging Tree', genre: 'hanging-tree', seed: 66, mood: ['dark', 'goth'],
      listen: 'The organ throbs on the 8ths, locked to the beat; the rotor spins slow; a bell answers.',
      drop: 'The gap before the drop, then the fuzz bass joins the organ.',
      voice: 'Slowed down through Haunt (Screw 3–5) — her voice becomes part of the organ.' },
    { id: 'coven', title: 'Coven at 70', genre: 'witch-house', seed: 13, mood: ['dark', 'goth'],
      listen: 'Screwed choir, 808 boom, a ritual bell; everything slowed and hazy.',
      drop: 'The verse drops in with the boom under the choir.',
      voice: 'Reverse-ghost her clip (Haunt → Reverse Ghost) so it swells in before each phrase.' },
    { id: 'darkwave', title: 'Cold Ballroom', genre: 'darkwave', seed: 1987, mood: ['80s', 'dark', 'goth'],
      listen: 'Driving 8th bass under a gothic organ, brass stabs on top.',
      drop: 'Chorus: the lead enters and the drums open up.',
      voice: 'Spoken, dry, close — no reverb, right on the beat.' },
    { id: 'riddim', title: 'Robot Riddim', genre: 'riddim', seed: 150, mood: ['heavy'],
      listen: 'The bass IS the rhythm: stutters and gaps, square-wave talk.',
      drop: 'Gap, crash, then the riddim stutter.',
      voice: 'One word, stuttered (Drop Builder Stutter ×4) right before the drop.' },
    { id: 'melodic', title: 'Golden Hour Drop', genre: 'melodic', seed: 150, mood: ['heavy', 'warm', 'her'],
      listen: 'Strings, a euphoric lead, then a growl that still sings the chords.',
      drop: 'Emotional drop: the lead keeps the melody over the growl.',
      voice: 'Her clip at the end of the break — the most open moment in the song.' },
    { id: 'liquid', title: 'Liquid Night', genre: 'dnb', seed: 174, mood: ['warm', 'fast'],
      listen: 'Rolling two-step at 174, Reese underneath, pluck on top.',
      drop: 'Gap, then the Reese rolls in under the full beat.',
      voice: 'Chop her phrase into 3 pieces on the pads; play them between the snares.' },
    { id: 'neuro', title: 'Neuro Grid', genre: 'neuro', seed: 4, mood: ['heavy', 'dark', 'fast'],
      listen: 'Dark 174, flanged Reese, stabs.',
      drop: 'Gap, crash, growl.', voice: 'Through Haunt "Telephone From Below" for a broken radio voice.' },
    { id: 'future', title: 'Monstercat Morning', genre: 'future-bass', seed: 152, mood: ['warm', 'party'],
      listen: 'Chord chops, plucks, colour bass.', drop: 'The chords chop in the 3-3-2 future-bass rhythm.',
      voice: 'Pitch her clip up (Pitch FX +12) as a vocal chop lead.' },
    { id: 'trap', title: 'Ice 808', genre: 'trap', seed: 140, mood: ['heavy', 'party'],
      listen: 'Half-time, sliding 808, hat rolls.', drop: 'Chorus: bells over the 808.', voice: 'Dry and up-front between the 808 hits.' },
    { id: 'phonk', title: 'Cowbell Drift', genre: 'phonk', seed: 666, mood: ['dark', 'party'],
      listen: 'The cowbell is the melody; 808 and choir haze underneath.', drop: 'Gap, crash, the cowbell and 808 together.',
      voice: 'Screwed and chopped (Haunt "Chopped & Screwed").' },
    { id: 'house', title: 'Four to the Floor', genre: 'house', seed: 124, mood: ['party', 'warm'],
      listen: 'Kick on every beat, off-beat bass, chord stabs.', drop: 'Chorus lifts with the keys.', voice: 'A short phrase on loop, filtered.' },
    { id: 'techno', title: 'Acid Hours', genre: 'techno', seed: 303, mood: ['dark', 'party'],
      listen: 'A 303 line that never repeats exactly; rolling kick.', drop: 'No break-drop: it just gets deeper.', voice: 'One word, delayed into infinity (Echo → Infinite Freeze).' },
    { id: 'lofi', title: 'Tape for Her', genre: 'lofi', seed: 88, mood: ['warm', 'calm', 'her'],
      listen: 'Lazy swing, sevenths, vinyl and warble.', drop: 'No drop — the verse just settles in.',
      voice: 'Her clips as they are, a little quiet, like a memory under the keys.' },
    { id: 'breath', title: 'Breathe With Me', genre: 'ambient', seed: 4, mood: ['calm', 'her'],
      listen: 'No drums. Glass, choir and a breathing sub.', drop: 'The "drop" is the harmony opening in "open".',
      voice: 'Her voice slowed, long reverb, in "drift".' },
    // unlocked by Learn lessons (variable reward — finishing a lesson opens one of these)
    { id: 'bonus-gap', title: 'The Silence Before', genre: 'dubstep', seed: 7, mood: ['heavy'], lock: 'drop-1',
      listen: 'A dubstep song written around its gaps.', drop: 'Two gaps, two drops.', voice: 'Her line in the first gap.' },
    { id: 'bonus-rotor', title: 'Spinning Cathedral', genre: 'hanging-tree', seed: 9, mood: ['goth', 'dark'], lock: 'sound-1',
      listen: 'The organ with the rotor sped up in the chorus.', drop: 'Fuzz enters on the drop.', voice: 'Through the organ\'s echo.' },
    { id: 'bonus-island', title: 'Steppers at Dawn', genre: 'reggae', seed: 33, mood: ['island'], lock: 'beats-3',
      listen: 'Roots to steppers.', drop: 'Steppers kick after the dub break.', voice: 'Siren and her voice trade phrases.' },
  ];
  const MOODS = [['mine', '📖 My songs'], ['foryou', '💜 For you'], ['all', 'All'], ['edm', 'EDM'], ['her', 'For her'], ['heavy', 'Heavy'], ['dark', 'Dark'], ['goth', 'Goth'], ['80s', '80s'], ['island', 'Island'], ['warm', 'Warm'], ['party', 'Party'], ['calm', 'Calm'], ['fast', 'Fast']];

  // every genre the Song Engine knows gets a card, even without a hand-written one (a new genre pack shows up by itself)
  function allSongs() {
    const used = new Set(SONGS.map(x => x.genre)), EDM = (window.Goals && window.Goals.EDM) || [];
    return SONGS.concat(SE.genres().filter(g => !used.has(g.id)).map(g => ({ id: 'g-' + g.id, title: g.label, genre: g.id, seed: 1 + (g.id.length * 977) % 9999, mood: EDM.includes(g.id) || g.family === 'EDM' ? ['edm'] : [],
      listen: g.tagline + '.', drop: g.impact === false ? 'No hard drop — it settles into the groove.' : 'Half a beat of silence, then crash + kick + bass together.', voice: 'Drop her clip on the canvas, then Send clip to… → Drop Builder or a Drum Machine pad.' })))
      .map(x => (window.Goals && window.Goals.EDM.includes(x.genre) && !x.mood.includes('edm')) ? Object.assign({}, x, { mood: x.mood.concat(['edm']) }) : x);
  }
  // ---- My songs: what the Song Recorder saves (audio + the whole canvas as a project)
  const IDB = () => window.OrganismSDK && window.OrganismSDK.IDB;
  async function mySongs() { return ((await IDB().get('library', 'mysongs')) || []).slice().sort((a, b) => b.time - a.time); }
  async function keepSong(p) {
    const name = String(p.name || 'my song').trim().slice(0, 80), W = window.Workspace;
    await IDB().put('library', 'song:' + name, { name, time: Date.now(), mime: p.mime, audio: p.audio, duration: p.duration, bpm: p.bpm });
    if (W && W.projects) await W.projects.save('♪ ' + name);
    const idx = (await mySongs()).filter(x => x.name !== name); idx.push({ name, time: Date.now(), duration: p.duration, bpm: p.bpm, project: '♪ ' + name });
    await IDB().put('library', 'mysongs', idx);
    if (window.Shell) window.Shell.toast('📖 Saved “' + name + '” to Songs → My songs', 'good', 3500);
  }
  if (window.Kernel) window.Kernel.bus.subscribe('song:saved', (p) => { keepSong(p || {}); }, 'songbook');
  let audioEl = null;
  async function playSong(name, btn) {
    if (audioEl) { audioEl.pause(); const was = audioEl._n; URL.revokeObjectURL(audioEl.src); audioEl = null; if (was === name) { if (btn) btn.textContent = '▶'; return; } }
    const r = await IDB().get('library', 'song:' + name); if (!r || !r.audio) return;
    audioEl = new Audio(URL.createObjectURL(new Blob([r.audio], { type: r.mime || 'audio/mpeg' }))); audioEl._n = name; audioEl.play(); if (btn) { btn.textContent = '■'; audioEl.onended = () => { btn.textContent = '▶'; }; }
  }
  async function removeSong(name) { await IDB().put('library', 'song:' + name, null); await IDB().put('library', 'mysongs', (await mySongs()).filter(x => x.name !== name)); }
  function genreOf(s) { return s.recipe ? null : SE.genres().find(g => g.id === s.genre); }
  function locked(s) { return !!(s.lock && !(window.Learn && window.Learn.done(s.lock))); }
  function write(s, fresh) {
    if (locked(s)) return false;
    if (s.recipe) { const r = R.get(s.recipe); if (!r) return false; R.run(s.recipe, { clear: true, origin: { x: 30, y: 20 } }); return true; }
    const seed = fresh ? 1 + Math.floor(Math.random() * 99999) : s.seed;
    SE.write(s.genre, seed); return true;
  }

  // ---------------------------------------------------------------- the page (overlay, off the canvas)
  let open = null;
  function show() {
    if (open) { open.close(); return; }
    const UI = window.UIKit, h = UI.h, S = window.Shell;
    if (S && S.X) S.X.enterMode('music');
    let mood = 'all', sel = SONGS[0];
    const ov = h('div', { class: 'overlay sbk', role: 'dialog', 'aria-label': 'Songs' });
    const chips = h('div', { class: 'sbk-chips' }), grid = h('div', { class: 'sbk-grid' }), detail = h('aside', { class: 'sbk-detail' });
    const close = () => { ov.remove(); document.removeEventListener('keydown', key, true); open = null; };
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    ov.append(h('div', { class: 'sbk-box' }, [
      h('header', { class: 'sbk-head' }, [h('div', {}, [h('b', { text: '📖 Songs' }), h('span', { class: 'sbk-sub', text: ' every song in one place — write one in any genre (a new one every press), the song for her, and My songs you saved' })]), h('button', { class: 'sbk-x', title: 'Close (Esc)', text: '×', onclick: close })]),
      chips, h('div', { class: 'sbk-body' }, [grid, detail]),
    ]));
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(); });
    document.addEventListener('keydown', key, true);
    function paint() {
      chips.innerHTML = ''; MOODS.forEach(([id, label]) => { const c = h('button', { class: 'sbk-chip' + (mood === id ? ' on' : ''), text: label }); c.onclick = () => { mood = id; paint(); }; chips.appendChild(c); });
      grid.innerHTML = '';
      if (mood === 'mine') { paintMine(); return; }
      const T = window.Taste, list = allSongs().filter(s => mood === 'all' || (mood === 'foryou' ? T && T.get(s.genre) > 0 : s.mood.includes(mood)));
      if (mood === 'foryou') list.sort((a, b) => T.get(b.genre) - T.get(a.genre));
      if (!list.length) grid.appendChild(h('p', { class: 'sbk-note', text: mood === 'foryou' ? 'Nothing yet — rate genres (💜 below a song, or Learn → EDM tour) and the ones you love appear here first.' : 'Nothing here.' }));
      if (!list.includes(sel)) sel = list[0] || sel;
      list.forEach(s => {
        const G = genreOf(s), lk = locked(s);
        const card = h('button', { class: 'sbk-card' + (sel === s ? ' sel' : '') + (lk ? ' locked' : ''), style: { '--acc': (G && G.accent) || '#ff2266' } }, [
          h('span', { class: 'sbk-ic', text: lk ? '🔒' : ((G && G.icon) || '💘') }), h('b', { text: s.title }), h('small', { text: (G ? G.label : s.genre) + ' · ' + (G ? G.bpm[0] + (G.bpm[1] !== G.bpm[0] ? '–' + G.bpm[1] : '') : s.bpm) + ' BPM' })]);
        card.onclick = () => { sel = s; paint(); }; card.ondblclick = () => { if (write(s)) close(); };
        grid.appendChild(card);
      });
      const s = sel, G = genreOf(s), lk = locked(s);
      detail.innerHTML = '';
      detail.append(h('h3', { text: s.title }), h('div', { class: 'sbk-meta', text: (G ? G.label + ' · ' + G.tagline : s.genre) }),
        h('h4', { text: 'Listen for' }), h('p', { text: s.listen }),
        h('h4', { text: 'The drop' }), h('p', { text: s.drop }),
        h('h4', { text: 'Her voice clips' }), h('p', { text: s.voice }));
      if (window.Taste && s.genre && !s.recipe) { const v = window.Taste.get(s.genre); detail.append(h('h4', { text: 'Is this you?' }), h('div', { class: 'sbk-actions', style: { marginTop: '4px' } }, [['💜', 2, 'love it'], ['🙂', 1, 'okay'], ['🙅', -1, 'not me']].map(([t, val, tip]) => h('button', { class: 'sbk-alt' + (v === val ? ' on' : ''), style: { marginTop: 0 }, text: t, title: tip, onclick: () => { window.Taste.rate(s.genre, val); paint(); } })))); }
      if (lk) detail.append(h('p', { class: 'sbk-lock', text: '🔒 Finish the Learn lesson “' + ((window.Learn && window.Learn.title(s.lock)) || s.lock) + '” to open this one.' }),
        h('button', { class: 'sbk-go', text: '🧠 Go to that lesson', onclick: () => { close(); window.Learn && window.Learn.open(s.lock); } }));
      else detail.append(h('div', { class: 'sbk-actions' }, [
        h('button', { class: 'sbk-go', text: '▶ Write this song', title: 'replaces what is on the canvas (Ctrl+Z brings it back)', onclick: () => { if (write(s)) close(); } }),
        s.recipe ? h('span') : h('button', { class: 'sbk-alt', text: '🎲 Another like it', onclick: () => { if (write(s, true)) close(); } })]),
        h('p', { class: 'sbk-note', text: 'It replaces the canvas. Press Space to play. Every clip opens in the piano roll.' }));
    }
    async function paintMine() {
      const list = await mySongs(); if (mood !== 'mine') return;
      if (!list.length) grid.appendChild(h('p', { class: 'sbk-note', text: 'No songs saved yet. Record in the Song Recorder (bottom of the screen) and press 📖 Save to Songs — it keeps the audio and everything on the canvas.' }));
      list.forEach(x => grid.appendChild(h('div', { class: 'sbk-card', style: { '--acc': '#00ff88' } }, [h('span', { class: 'sbk-ic', text: '📖' }), h('b', { text: x.name }), h('small', { text: new Date(x.time).toLocaleString() + (x.duration ? ' · ' + Math.round(x.duration) + ' s' : '') }),
        h('div', { class: 'org-row', style: { margin: '4px 0 0' } }, [h('button', { class: 'sbk-alt', style: { marginTop: 0 }, text: '▶', title: 'listen', onclick: (e) => playSong(x.name, e.currentTarget) }),
          h('button', { class: 'sbk-alt', style: { marginTop: 0 }, text: '⟲ Open', title: 'open the song on the canvas (with every tool as it was)', onclick: async () => { close(); if (window.Shell) window.Shell.activate(); await window.Workspace.projects.load(x.project); } }),
          h('button', { class: 'sbk-alt', style: { marginTop: 0 }, text: '🗑', title: 'delete', onclick: async () => { if (!confirm('Delete “' + x.name + '” from My songs?')) return; await removeSong(x.name); paint(); } })])])));
      detail.innerHTML = ''; detail.append(h('h3', { text: 'My songs' }), h('p', { text: 'Every song you save from the Song Recorder: listen here, or open it back onto the canvas exactly as it was.' }));
    }
    paint(); document.body.appendChild(ov); open = { close, ov };
  }
  window.Songbook = { open: show, songs: () => SONGS.slice(), all: allSongs, mySongs, keepSong, write, locked, add(s) { if (s && s.id && !SONGS.some(x => x.id === s.id)) SONGS.push(s); } };
})();
