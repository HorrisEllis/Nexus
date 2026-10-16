/* ERAVOS Goals (3.31) — goal- and achievement-based learning, plus your TASTE.
 *   Taste    rate genres (💜 / 🙂 / 🙅) — the EDM tour, the Songbook and the Learn map all read it ("For you").
 *   EDM tour a Learn track built from every EDM genre the Song Engine knows: write it → hear it → rate it. Genres that
 *            arrive later (a new genre pack) join the tour by themselves.
 *   Goals    achievements that unlock on REAL events (bus.tap) — never ticked for you. The next goal is always shown
 *            with how to get it, so there is always one clear thing to do next.
 * Stored in this browser (localStorage 'eravos.goals.v1'). */
(function () {
  'use strict';
  const STORE = 'eravos.goals.v1';
  const mem = (() => { try { return Object.assign({ taste: {}, got: {}, count: {} }, JSON.parse(localStorage.getItem(STORE)) || {}); } catch (e) { return { taste: {}, got: {}, count: {} }; } })();
  const keep = () => { try { localStorage.setItem(STORE, JSON.stringify(mem)); } catch (e) {} };
  const K = () => window.Kernel;
  const EDM = ['house', 'deep-house', 'tech-house', 'progressive', 'trance', 'psytrance', 'techno', 'electro', 'big-room', 'hardstyle', 'ukg', 'future-garage', 'breakbeat', 'jungle', 'dnb', 'neuro', 'dubstep', 'riddim', 'melodic', 'future-bass', 'trap', 'moombahton'];

  // ---------------------------------------------------------------- taste
  const Taste = window.Taste = {
    rate(genre, v) { mem.taste[genre] = v; keep(); K().bus.publish('taste:rated', { genre, value: v }); check(); },
    rated: (g) => mem.taste[g] !== undefined, get: (g) => mem.taste[g],
    top(n) { return Object.keys(mem.taste).filter(g => mem.taste[g] > 1).concat(Object.keys(mem.taste).filter(g => mem.taste[g] === 1)).slice(0, n || 5); },
    all: () => Object.assign({}, mem.taste),
  };

  // ---------------------------------------------------------------- the EDM tour (a Learn track made from genre data)
  function tour() {
    const SE = window.SongEngine, L = window.Learn; if (!SE || !L) return;
    const gs = EDM.map(id => SE.genres().find(g => g.id === id)).filter(Boolean).concat(SE.genres().filter(g => g.family === 'EDM' && !EDM.includes(g.id)));
    L.addTrack({ id: 'tour', label: 'EDM tour — find your taste', icon: '🧭', reveal: 'You have heard every kind of EDM and know which ones are you. Songs → “For you” now shows your genres first. Next: pick your favourite and make it yours in “Express yourself”.',
      lessons: gs.map(g => ({ id: 'tour-' + g.id, title: g.icon + ' ' + g.label, hook: g.tagline, gives: 'Taste', leverage: 'Hear what ' + g.label + ' is made of — and decide if it is you.',
        steps: [
          { say: g.label + ' at ' + g.bpm[0] + (g.bpm[1] !== g.bpm[0] ? '–' + g.bpm[1] : '') + ' BPM: ' + g.tagline + '.', do: 'Write a ' + g.label + ' song (do it for me writes one).', done: { topic: 'recipe:done', where: { recipe_id: 'eravos.recipe.engine.' + g.id } }, auto: () => SE.write(g.id, 1 + Math.floor(Math.random() * 99999)) },
          { say: 'Listen for 30 seconds. Notice the drums first, then the bass.', do: 'Play it.', done: { topic: 'transport:play' }, auto: () => { const T = window.Transport; if (T && T.playing) T.stop(); K().bus.publish('ui:transport-play', {}); } },
          { say: 'Was that you?', do: 'Rate it.', rate: g.id, done: { topic: 'taste:rated', where: { genre: g.id } } },
        ],
        loop: 'Next genre on the tour →' })) }, 2);
  }

  // ---------------------------------------------------------------- goals (achievements on real events)
  const has = (t) => (p, topic) => topic === t || (t.endsWith('*') && topic.startsWith(t.slice(0, -1)));
  const GOALS = [
    { id: 'sound', icon: '🔊', title: 'First sound', how: '＋ Add any instrument and click its keys (or hit a pad).', on: has('note:trigger') },
    { id: 'song', icon: '✍', title: 'First song written', how: 'Songs → any card → ▶ Write this song.', on: (p, t) => t === 'recipe:done' && /engine\.|raven-drop/.test(p.recipe_id || '') },
    { id: 'play', icon: '▶', title: 'Press play', how: 'Press Space (or ▶ in the toolbar).', on: has('transport:play') },
    { id: 'taste3', icon: '🧭', title: 'Explorer — rate 3 genres', how: 'Learn → EDM tour, or 💜/🙅 on any genre in Songs.', test: () => Object.keys(mem.taste).length >= 3 },
    { id: 'pad', icon: '🥁', title: 'Play a pad', how: 'Hit a Drum Machine pad (mouse, keys 1-4 Q-R A-F Z-V, or your StarryPad).', on: (p, t) => /^ui:pad_press:/.test(t) || (t === 'midi:note' && p && p.on) },
    { id: 'drop', icon: '🔻', title: 'First drop', how: 'Songs → Make a song for her → play until the drop.', on: has('edm:drop-fired') },
    { id: 'preset', icon: '🎛', title: 'Your own sound', how: 'Turn any knob, then ＋ next to the preset menu.', on: has('ui:preset_save:*') },
    { id: 'kit', icon: '🧩', title: 'Mix a kit', how: 'Sounds → Kits → pick a pad, drop it on your kit.', on: has('ui:pad_set:*') },
    { id: 'capture', icon: '🎙', title: 'Capture a sound to a pad', how: 'Sounds → Capture → pad.', on: has('sounds:captured') },
    { id: 'voice', icon: '💘', title: 'Her voice in', how: 'Drag one of her clips onto the canvas.', on: has('asset:ready') },
    { id: 'saved', icon: '📖', title: 'Saved a song', how: 'Song Recorder (bottom) → ⏺ record → 📖 Save to Songs.', on: has('song:saved') },
    { id: 'taste10', icon: '🗺', title: 'Taste map — rate 10 genres', how: 'Keep going on the EDM tour.', test: () => Object.keys(mem.taste).length >= 10 },
    { id: 'lessons5', icon: '🎓', title: 'Five lessons', how: 'Learn → any lesson.', test: () => window.Learn && window.Learn.lessons().filter(l => window.Learn.done(l.id)).length >= 5 },
    { id: 'bounce', icon: '📨', title: 'Sent it', how: 'Session → BOUNCE WAV.', on: (p, t) => t === 'transport:bounce' && p && p.state === 'done' },
    { id: 'tourall', icon: '🏆', title: 'Know your taste — the whole EDM tour', how: 'Rate every genre in the EDM tour.', test: () => EDM.every(g => mem.taste[g] !== undefined) },
  ];
  function got(g) { if (mem.got[g.id]) return; mem.got[g.id] = Date.now(); keep(); const S = window.Shell; if (S) setTimeout(() => S.toast('🏆 ' + g.icon + ' ' + g.title + (next() ? '  ·  next: ' + next().title : ''), 'good', 4500), 80); K().bus.publish('goal:achieved', { id: g.id }); }
  function check() { GOALS.forEach(g => { if (!mem.got[g.id] && g.test && g.test()) got(g); }); }
  function next() { return GOALS.find(g => !mem.got[g.id]) || null; }
  function panel(h, closePage) {
    const n = next(), done = GOALS.filter(g => mem.got[g.id]).length, top = Taste.top(3);
    return h('div', { class: 'gl-panel' }, [
      h('div', { class: 'gl-next' }, n ? [h('b', { text: '🎯 Next goal: ' + n.icon + ' ' + n.title }), h('span', { text: ' — ' + n.how })] : [h('b', { text: '🏆 Every goal reached.' })]),
      h('div', { class: 'gl-badges' }, GOALS.map(g => h('span', { class: 'gl-badge' + (mem.got[g.id] ? ' on' : ''), title: g.title + (mem.got[g.id] ? ' ✓' : ' — ' + g.how), text: g.icon }))),
      h('div', { class: 'gl-meta', text: done + ' / ' + GOALS.length + ' goals' + (top.length ? ' · your taste so far: ' + top.map(id => { const G = window.SongEngine && window.SongEngine.genres().find(x => x.id === id); return G ? G.label : id; }).join(', ') : ' · rate genres on the EDM tour to find your taste') }),
    ]);
  }
  function boot() {
    const k = K(); if (!k || !k.bus || !k.bus.tap) return setTimeout(boot, 200);
    k.bus.tap((topic, p) => { GOALS.forEach(g => { if (!mem.got[g.id] && g.on) { try { if (g.on(p || {}, topic)) got(g); } catch (e) {} } }); if (/^(taste:rated|goal:achieved)$/.test(topic)) return; });
    tour(); check();
  }
  window.Goals = { panel, list: () => GOALS.map(g => ({ id: g.id, title: g.title, how: g.how, got: !!mem.got[g.id] })), next, check, EDM, _reset() { mem.taste = {}; mem.got = {}; keep(); } };
  boot();
})();
