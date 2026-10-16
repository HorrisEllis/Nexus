/* ERAVOS Learn (3.29) — lessons on a page of their own (off the canvas), for a brain that wants novelty.
 * Design (spec eravos.phase16-map § 3):
 *   sound first     every lesson opens on something you hear, not a rule
 *   predict → press before a step you guess what will happen (3 choices); your hit rate is kept (metacognition)
 *   open loops      every lesson ends on a question; the lesson that answers it is marked on the map
 *   pattern fill    3 of 4 shown, you finish the 4th
 *   systems view    every lesson ends with "the system": what feeds what, where the loop is
 *   micro steps     ≤ 90 s each; "just do it for me" never shames; hints in 3 rungs (nudge → where → do it)
 *   rewards         finishing a lesson opens a locked Songbook song
 *   your path       the map shows every lesson; start anywhere
 * A step is done ONLY when its event really happens on the bus (K.bus.tap) — nothing is ticked for you except by
 * "do it for me", which performs the real action (spawns, sets the knob, runs the song) and then the event ticks it.
 * The lesson runs in a small strip at the bottom-left of the window, outside the canvas world. */
(function () {
  'use strict';
  const STORE = 'eravos.learn.v1';
  const load = () => { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { return {}; } };
  const save = (x) => { try { localStorage.setItem(STORE, JSON.stringify(x)); } catch (e) {} };
  const mem = Object.assign({ done: {}, predictions: { right: 0, total: 0 } }, load());

  // ---------------------------------------------------------------- helpers for steps
  const mounted = (org) => ({ topic: 'kernel:organism-mounted', where: { organismId: org } });
  const knob = (org, key) => ({ topic: 'ui:config_change:*', topicOrganism: org, where: { key } });
  const first = (org) => { const K = window.Kernel; const r = K && K.registry.byOrganism(org)[0]; return r && r.instance_id; };
  const spawn = (org) => () => { const id = first(org) || window.OrganismFactory.spawn(org); return id; };
  const setKnob = (org, key, value) => () => { const id = first(org) || window.OrganismFactory.spawn(org); if (id) window.Kernel.bus.publish('ui:config_change:' + id, { key, value }); };
  const play = () => { const K = window.Kernel, T = window.Transport; if (K.audio && K.audio.boot) K.audio.boot(); if (T && T.playing) T.stop(); K.bus.publish('ui:transport-play', {}); };
  const song = (genre, seed) => () => window.SongEngine && window.SongEngine.write(genre, seed);
  // wire the first `type` out of A into the first matching in of B (B spawned if missing) — the real wire, as a plug would
  const wire = (a, b, type) => () => { const K = window.Kernel, F = window.OrganismFactory, ia = first(a) || F.spawn(a), ib = first(b) || F.spawn(b), ra = K.registry.get(ia), rb = K.registry.get(ib); if (!ra || !rb) return;
    const out = Array.from(ra.hooks.values()).find(x => x.wire_type === type && x.direction === 'out'), inn = Array.from(rb.hooks.values()).find(x => x.wire_type === type && x.direction === 'in');
    if (out && inn) K.wires.register({ src: { instanceId: ia, hookId: out.hook_id }, dst: { instanceId: ib, hookId: inn.hook_id } }); };

  // ---------------------------------------------------------------- the map (data)
  const TRACKS = [
    { id: 'her', label: 'Make music for her', icon: '💘', reveal: 'You can now take her real voice, place it on the beat, pick the mood and send her a finished song. Next: Songbook → “Give Your Head a Shake” — build it again with her line in the gap.', lessons: [
      { id: 'her-1', title: 'Her voice is an instrument', hook: 'A recording becomes something you can play.',
        steps: [
          { say: 'Any clip of her — a word, a laugh, a breath — can be played like a drum.', predict: { q: 'If you drop her clip on the canvas, you get…', options: ['A file attachment', 'A Sample window you can play, chop and send anywhere', 'Nothing until you import it'], answer: 1, why: 'Every sound you drop becomes a playable tool. That is the whole idea: anything can be an instrument.' },
            do: 'Drag one of her voice clips onto the canvas.', done: { topic: 'asset:ready' },
            hints: ['Any audio file works: .wav .mp3 .m4a .ogg.', 'Drop it on empty canvas — a Sample window opens.', 'The whole voice-pack .zip works too.'] },
          { say: 'Now play it: press ▶ in the Sample window, or hit a pad that holds it.', do: 'Play her clip.', done: [{ topic: 'note:trigger', where: { target: { $organism: 'eravos.sample-player' } } }, { topic: 'ui:play_press:*' }, { topic: 'ui:pad_press:*' }],
            hints: ['The ▶ in the Sample window.', 'Or Send clip to… → Drum Machine, then hit that pad.'] },
        ],
        loop: 'Where in a song does one line hit hardest? → “Her voice right before the hit”' },
      { id: 'drop-2', title: 'Her voice right before the hit', hook: 'One line, placed to the beat.',
        steps: [
          { say: 'Open “Make a song for her”.', do: 'Start it.', done: { topic: 'recipe:done', where: { recipe_id: 'eravos.recipe.raven-drop' } }, auto: () => window.Recipes.run('eravos.recipe.raven-drop', { clear: true }) },
          { say: 'Drag one of her voice clips anywhere onto the canvas.', do: 'Drop a clip on the canvas.', done: { topic: 'asset:ready' },
            hints: ['Any audio file: .wav, .mp3, .m4a.', 'Drop it on empty canvas — a Sample window opens.', 'Or drop the whole voice-pack .zip.'] },
          { say: 'In the Sample window: Send clip to… → Drop Builder. It will END exactly on drop beat 1.', predict: { q: 'Where does the clip START?', options: ['On beat 1 of the build', 'Its length before the drop — it is placed backwards from the drop', 'Wherever you click'], answer: 1, why: 'End-on-DROP works backwards: the last word lands on the hit, wherever the first word falls.' },
            do: 'Send it to the Drop Builder.', done: { topic: 'asset:ready', where: { target: { $organism: 'eravos.bass-drop-builder' } } } },
        ],
        loop: 'The same song in a different key feels like a different person. Which key is hers? → “Her key”' },
      { id: 'her-3', title: 'Her key', hook: 'Mood is a choice of notes.',
        steps: [
          { say: 'Every note in ERAVOS follows the song key, so changing it re-colours everything at once.', predict: { q: 'Switching the scale from minor to major makes the song…', options: ['Faster', 'Brighter, more hopeful', 'Louder'], answer: 1, why: 'Major raises three notes of the scale; the same melody suddenly sounds like sunlight instead of rain.' },
            do: 'Change the scale in the Session window.', done: knob('eravos.session', 'scale'), auto: setKnob('eravos.session', 'scale', 'major') },
          { say: 'Play it. Then try dorian — minor, but with a hopeful note in it.', do: 'Play.', done: { topic: 'transport:play' }, auto: play },
        ],
        loop: 'It sounds right. How does it get to her? → “Send it to her”' },
      { id: 'her-4', title: 'Send it to her', hook: 'Finished beats perfect.',
        steps: [
          { say: 'Bounce turns the whole song into one file.', predict: { q: 'Bounce plays the song…', options: ['Instantly in the background', 'Once through, in real time, then saves a WAV', 'Only the selected window'], answer: 1, why: 'It records exactly what you hear, so what she hears is what you heard.' },
            do: 'Session → BOUNCE WAV (it plays once).', done: { topic: 'transport:bounce', where: { state: 'done' } },
            hints: ['The Session window (＋ Add → Session if it is not there).', 'BOUNCE WAV is the big button at the bottom.', 'Wait until it finishes playing — then the file downloads.'],
            auto: () => { const id = first('eravos.session') || window.OrganismFactory.spawn('eravos.session'); window.Kernel.bus.publish('ui:bounce:' + id, {}); } },
        ],
        loop: 'You made a song. Now make one that sounds like YOU → Express yourself' },
    ] },
    { id: 'express', label: 'Express yourself', icon: '✶', reveal: 'You can now play live, shape a sound until it is yours, finish half-made ideas and make sound move. Combine them: load a Songbook song, swap in your preset, play pads over it, record it.', lessons: [
      { id: 'express-1', title: 'Play, don’t program', hook: 'Your timing is your voice.',
        steps: [
          { say: 'A Drum Machine. Its pads play when you click them, press 1-4 Q-R A-F Z-V, or hit your StarryPad.', do: 'Add a Drum Machine.', done: mounted('eravos.pads'), auto: spawn('eravos.pads') },
          { say: 'Play a rhythm with your hands — not perfect, just yours.', predict: { q: 'Hitting the TOP of a pad (with the mouse) plays it…', options: ['Louder', 'Higher pitched', 'Longer'], answer: 0, why: 'Top of a pad = loud, bottom = soft. Dynamics are half of feel.' },
            do: 'Hit any pad.', done: [{ topic: 'ui:pad_press:*' }, { topic: 'midi:note' }], auto: () => { const id = first('eravos.pads'); if (id) window.Kernel.bus.publish('ui:pad_press:' + id, { index: 0, velocity: 0.9 }); } },
        ],
        loop: 'A pad plays a sound. Can the sound itself be yours? → “Your sound, saved”' },
      { id: 'express-2', title: 'Your sound, saved', hook: 'A signature sound is a decision you keep.',
        steps: [
          { say: 'The Reese Bass. Move any knob until it sounds like you.', do: 'Add the Reese and change a knob.', done: knob('eravos.reese-bass', 'detune'), auto: setKnob('eravos.reese-bass', 'detune', 0.45),
            hints: ['Detune, Cutoff and Drift change it the most.'] },
          { say: 'Keep it: the ＋ next to its preset menu saves your own preset.', predict: { q: 'A saved preset keeps…', options: ['Only the volume', 'Every knob of the tool', 'The whole song'], answer: 1, why: 'A preset is the tool’s full setting; load it in any song, any time.' },
            do: 'Save it as a preset (＋ next to the preset menu).', done: { topic: 'ui:preset_save:*' }, auto: () => { const id = first('eravos.reese-bass'); if (id) window.Kernel.bus.publish('ui:preset_save:' + id, { name: 'My Reese' }); } },
        ],
        loop: 'Half an idea is still an idea. Can you finish one? → “Finish the pattern”' },
      { id: 'express-3', title: 'Finish the pattern', hook: 'Your brain completes patterns — use it.',
        steps: [
          { say: 'A beat with something missing: kick on 1, 2, 3… The Sequencer is loaded with the house starter.', do: 'Load a starter in the Sequencer.', done: { topic: 'ui:starter_load:*' }, auto: () => { const id = first('eravos.sequencer') || window.OrganismFactory.spawn('eravos.sequencer'); window.Kernel.bus.publish('ui:starter_load:' + id, { name: 'four-on-floor house' }); } },
          { say: 'Now break the symmetry: add one hit where nothing is.', predict: { q: 'One extra hit just before beat 1 of the next bar makes it feel…', options: ['Broken', 'Like it is pulling forward', 'Slower'], answer: 1, why: 'A pickup note creates expectation — the ear leans into the next bar. That is groove.' },
            do: 'Turn on one empty step.', done: { topic: 'ui:step_edit:*' }, auto: () => { const id = first('eravos.sequencer'); if (id) window.Kernel.bus.publish('ui:step_edit:' + id, { track: 0, step: 15, patch: { on: true } }); } },
        ],
        loop: 'The pattern repeats. How does a sound change while it repeats? → “Make it move”' },
      { id: 'express-4', title: 'Make it move', hook: 'Movement is what makes a loop feel alive.',
        steps: [
          { say: 'An LFO is a hand that turns a knob for you, forever, in time.', do: 'Add an LFO.', done: mounted('eravos.lfo'), auto: spawn('eravos.lfo') },
          { say: 'Plug the LFO into any instrument knob (drag its plug onto a window).', predict: { q: 'An LFO on a filter cutoff makes the sound…', options: ['Louder', 'Open and close, wah-wah, in time', 'Change key'], answer: 1, why: 'The LFO sweeps the cutoff up and down — that rhythmic opening is the “wub”.' },
            do: 'Connect the LFO to something.', done: { topic: 'kernel:wire-registered', where: { 'src.instanceId': { $organism: 'eravos.lfo' } } },
            hints: ['The ⇢ plug in the LFO title bar.', 'Click it: a list of everything it can plug into appears.', 'Pick a synth — then a knob.'], auto: wire('eravos.lfo', 'eravos.organ', 'modulation') },
        ],
        loop: 'Every tool is a system you can wire. → Systems track' },
    ] },
    { id: 'beats', label: 'Beats', icon: '🥁', lessons: [
      { id: 'beats-1', title: 'The beat with a hole', hook: 'A beat is mostly the spaces between hits.',
        steps: [
          { say: 'A beat is about to play.', predict: { q: 'What makes a beat feel like a beat?', options: ['The kick', 'Where the gaps are', 'The loudest sound'], answer: 1, why: 'The hits only mean something because of the silence around them. Move one gap and the whole groove changes.' },
            do: 'Start a Quick Beat (do it for me builds it).', done: { topic: 'recipe:done', where: { recipe_id: 'eravos.recipe.quick-beat' } }, auto: () => window.Recipes.run('eravos.recipe.quick-beat', { clear: true }) },
          { say: 'Press Space. Listen to 2 bars.', do: 'Play it.', done: { topic: 'transport:play' }, auto: play },
          { say: 'Now make a hole: click any lit step in the Sequencer to turn it off.', do: 'Turn one step off — listen to what the gap does.', done: { topic: 'ui:step_edit:*' },
            hints: ['Look for the Sequencer window: rows of squares.', 'A lit square is a hit. Click one.', 'Any lit square in the hat row is a good first hole.'],
            auto: () => { const id = first('eravos.sequencer'); if (id) window.Kernel.bus.publish('ui:step_edit:' + id, { track: 0, step: 0, patch: { on: false } }); } },
        ],
        loop: 'Why does pushing a hat 1/16 late make the whole beat swing? → “Swing is a delay”' },
      { id: 'beats-2', title: 'Swing is a delay', hook: 'Groove is time bent on purpose.',
        steps: [
          { say: 'Swing pushes every second 16th a little late.', predict: { q: 'Swing at 60 % will make the beat feel…', options: ['Faster', 'Lazier / bouncier', 'Louder'], answer: 1, why: 'Nothing gets faster — the off-beats arrive late, so it leans back.' },
            do: 'Turn Swing up on the Sequencer.', done: knob('eravos.sequencer', 'swing'), auto: setKnob('eravos.sequencer', 'swing', 0.6) },
          { say: 'Play it and listen for the bounce.', do: 'Play.', done: { topic: 'transport:play' }, auto: play },
        ],
        loop: 'Every genre is a recipe of gaps and delays. Can you hear which one is reggae? → “Steal a genre’s DNA”' },
      { id: 'beats-3', title: 'Steal a genre’s DNA', hook: 'Reggae puts the kick where house leaves it out.',
        steps: [
          { say: 'Pattern: house = kick on 1 2 3 4. Trap = kick on 1 and the “and” of 2. Reggae one-drop = kick on …?', predict: { q: 'Fill the pattern — one-drop puts the kick on…', options: ['Beat 1', 'Beat 3 only', 'Every beat'], answer: 1, why: 'One-drop drops beat 1 and hits only on 3 — the bar feels like it hangs in the air.' },
            do: 'Write “Bun Dem” (reggae) and play it.', done: { topic: 'recipe:done', where: { recipe_id: 'eravos.recipe.engine.reggae' } }, auto: song('reggae', 75) },
          { say: 'Listen for the kick: only on 3. Then the drop switches to steppers (every beat).', do: 'Play.', done: { topic: 'transport:play' }, auto: play },
        ],
        loop: 'The gap before a drop is the loudest thing in a song. Why? → The Drop track', unlock: 'bonus-island' },
    ] },
    { id: 'drop', label: 'The Drop', icon: '🔻', lessons: [
      { id: 'drop-1', title: 'Silence is the loudest part', hook: 'Contrast, not volume.',
        steps: [
          { say: 'A dubstep song is about to be written.', predict: { q: 'What makes a drop hit hardest?', options: ['Louder bass', 'Quiet → a gap → everything at once', 'More effects'], answer: 1, why: 'Your ear measures change. Half a beat of nothing makes the next hit feel twice as big.' },
            do: 'Write a dubstep song.', done: { topic: 'recipe:done', where: { recipe_id: 'eravos.recipe.engine.dubstep' } }, auto: song('dubstep', 1407) },
          { say: 'Play from the start. Listen at the end of “build”: half a beat of silence, then the crash.', do: 'Play and wait for the drop.', done: { topic: 'transport:play' }, auto: play },
        ],
        loop: 'What if her voice ended exactly in that silence? → “Her voice right before the hit”', unlock: 'bonus-gap' },
      { id: 'drop-3', title: 'Tension you can tune', hook: 'Uneasy is a sound you design.',
        steps: [
          { say: 'The Drop Builder’s TENSION has its own sound.', predict: { q: 'Swell at 0 means…', options: ['Silent', 'Same level all section — no build', 'Maximum build'], answer: 1, why: 'Swell 0 keeps it flat; the build only comes from the riser and the roll.' },
            do: 'Pick a tension sound (TENSION → Start from).', done: { topic: 'ui:tension_sound:*' }, auto: () => { const id = first('eravos.bass-drop-builder') || window.OrganismFactory.spawn('eravos.bass-drop-builder'); window.Kernel.bus.publish('ui:tension_sound:' + id, { name: 'Glass' }); } },
          { say: 'Hear it alone.', do: 'Press ▶ hear tension.', done: { topic: 'ui:tension_audition:*' }, auto: () => { const id = first('eravos.bass-drop-builder'); if (id) window.Kernel.bus.publish('ui:tension_audition:' + id, {}); } },
        ],
        loop: 'A sound that throbs in time with the song — how? → Sound track: “The organ that breathes on the beat”' },
    ] },
    { id: 'sound', label: 'Sound Design', icon: '🎛', lessons: [
      { id: 'sound-1', title: 'The organ that breathes on the beat', hook: 'A tremolo that knows the tempo.',
        steps: [
          { say: 'The Gothic Organ — Hanging Tree.', do: 'Add it.', done: mounted('eravos.organ'), auto: spawn('eravos.organ') },
          { say: 'Pulse throbs the volume. Pulse rate is in note lengths, not Hz.', predict: { q: 'At 140 BPM, Pulse rate 1/8 throbs…', options: ['1.4 times a second', 'About 4.7 times a second', '140 times a second'], answer: 1, why: '140 beats/min ÷ 60 = 2.33 beats/s × 2 eighths = 4.67/s. Change the BPM and it follows.' },
            do: 'Change Pulse rate.', done: knob('eravos.organ', 'pulseRate'), auto: setKnob('eravos.organ', 'pulseRate', '1/16T') },
          { say: 'Now spin the speaker: Rotor → fast. It speeds up slowly, like a real one.', do: 'Set Rotor to fast.', done: knob('eravos.organ', 'rotorSpeed'), auto: setKnob('eravos.organ', 'rotorSpeed', 'fast') },
        ],
        loop: 'Why does a Reese sound alive when it is just two saws? → “Two saws arguing”', unlock: 'bonus-rotor' },
      { id: 'sound-2', title: 'Two saws arguing', hook: 'Detune = beating = life.',
        steps: [
          { say: 'The Reese Bass.', do: 'Add it.', done: mounted('eravos.reese-bass'), auto: spawn('eravos.reese-bass') },
          { say: 'Detune spreads its saws apart.', predict: { q: 'More detune makes it…', options: ['Higher', 'Wider and more moving', 'Quieter'], answer: 1, why: 'Two close pitches beat against each other; further apart = faster beating = more motion.' },
            do: 'Move Detune.', done: knob('eravos.reese-bass', 'detune'), auto: setKnob('eravos.reese-bass', 'detune', 0.6) },
        ],
        loop: 'Where does a sound go after the synth? → Systems: “Everything is a signal flow”' },
    ] },
    { id: 'systems', label: 'Systems', icon: '🕸', lessons: [
      { id: 'systems-1', title: 'Everything is a signal flow', hook: 'Sound moves along wires; follow it.',
        steps: [
          { say: 'Add Haunt (an effect).', do: 'Add Haunt.', done: mounted('eravos.fx-haunt'), auto: spawn('eravos.fx-haunt') },
          { say: 'Plug any instrument into Haunt (⇢ plug in its title bar → Haunt).', predict: { q: 'After plugging the organ into Haunt you hear…', options: ['Organ and Haunt side by side', 'The organ only through Haunt', 'Silence'], answer: 1, why: 'A wire re-routes: the organ’s sound now goes through Haunt before the master.' },
            do: 'Connect something into Haunt.', done: { topic: 'kernel:wire-registered', where: { 'dst.instanceId': { $organism: 'eravos.fx-haunt' } } },
            auto: () => { const K = window.Kernel, a = first('eravos.organ') || window.OrganismFactory.spawn('eravos.organ'), b = first('eravos.fx-haunt'); const ra = K.registry.get(a), rb = K.registry.get(b); if (!ra || !rb) return;
              const out = Array.from(ra.hooks.values()).find(x => x.wire_type === 'audio' && x.direction === 'out'), inn = Array.from(rb.hooks.values()).find(x => x.wire_type === 'audio' && x.direction === 'in');
              if (out && inn) K.wires.register({ src: { instanceId: a, hookId: out.hook_id }, dst: { instanceId: b, hookId: inn.hook_id } }); } },
        ],
        loop: 'What happens when a sound is fed back into itself? → “Feedback is a loop”' },
      { id: 'systems-2', title: 'Feedback is a loop', hook: 'An echo is a sound fed back into itself.',
        steps: [
          { say: 'Add an Echo.', do: 'Add Echo.', done: mounted('eravos.fx-echo'), auto: spawn('eravos.fx-echo') },
          { say: 'Feedback = how much of the echo goes back in.', predict: { q: 'Feedback near 100 % gives…', options: ['One echo', 'Echoes that never die (and grow)', 'No echo'], answer: 1, why: 'Each repeat feeds the next. Above 100 % the loop grows — that is a runaway system.' },
            do: 'Turn Feedback up.', done: knob('eravos.fx-echo', 'feedback'), auto: setKnob('eravos.fx-echo', 'feedback', 0.85) },
        ],
        loop: 'A song is a tension system too: build, release. → back to The Drop' },
    ] },
  ];
  const SKILL = {
    'her-1': ['Sampling', 'Any sound in your life becomes an instrument.'],
    'drop-2': ['Placement', 'One line at the right moment outweighs ten in the wrong one.'],
    'her-3': ['Harmony by choice', 'Change the mood of a whole song with one setting.'],
    'her-4': ['Finishing', 'A song that exists beats a perfect one that does not.'],
    'express-1': ['Performance', 'Your timing and touch become part of the track.'],
    'express-2': ['Sound identity', 'A sound you made, reusable in every song.'],
    'express-3': ['Pattern completion', 'Turn half-ideas into grooves; break symmetry on purpose.'],
    'express-4': ['Modulation', 'Make anything move in time — the basis of every wub, swell and sweep.'],
    'beats-1': ['Rhythm as space', 'You hear gaps — the first skill of every producer.'],
    'beats-2': ['Groove', 'Swing turns stiff loops human.'],
    'beats-3': ['Genre DNA', 'Recognise and steal any style by its kick placement.'],
    'drop-1': ['Contrast', 'Make anything hit harder without making it louder.'],
    'drop-3': ['Tension design', 'Control how much the listener waits — and wants.'],
    'sound-1': ['Tempo-locked motion', 'Effects that breathe with the beat.'],
    'sound-2': ['Detune & beating', 'Width and life from two sounds disagreeing.'],
    'systems-1': ['Signal flow', 'Route anything through anything — the mixer in your head.'],
    'systems-2': ['Feedback', 'Loops that grow, decay or run away — in sound and in systems.'],
  };
  TRACKS.forEach(t => t.lessons.forEach(l => { const k = SKILL[l.id]; if (k) { l.gives = k[0]; l.leverage = k[1]; } }));
  const REVEAL = { beats: 'You can now hear, bend and borrow rhythm. Next: build a Songbook reggae song and switch it to steppers yourself.', drop: 'You can now design the moment everyone waits for. Next: write “The Silence Before” and move its gaps.', sound: 'You can now make sounds that move and breathe. Next: the Organ through Haunt through Echo — a chain no one has built.', systems: 'You can now see any tool as a system. Next: wire an LFO into an Echo’s feedback — a loop that controls a loop.' };
  TRACKS.forEach(t => { if (!t.reveal) t.reveal = REVEAL[t.id]; });
  const ALL = TRACKS.flatMap(t => t.lessons.map(l => Object.assign(l, { track: t.id })));
  // tracks can arrive later (a genre tour, a pack's lessons): addTrack keeps the map open-ended, not a fixed box
  function addTrack(t, at) { if (!t || TRACKS.some(x => x.id === t.id)) return false; TRACKS.splice(at === undefined ? TRACKS.length : at, 0, t); t.lessons.forEach(l => { l.track = t.id; ALL.push(l); }); return true; }
  const byId = (id) => ALL.find(l => l.id === id);

  // ---------------------------------------------------------------- matcher (same grammar as the Coach)
  function get(o, path) { return path.split('.').reduce((a, k) => (a == null ? a : a[k]), o); }
  function matchVal(K, v, want) {
    if (want && typeof want === 'object') {
      if ('$organism' in want) { const r = K.registry.get(v); return !!(r && r.organism_id === want.$organism); }
      if ('$in' in want) return want.$in.includes(v);
      if ('$exists' in want) return (v !== undefined) === !!want.$exists;
      if ('$gt' in want) return typeof v === 'number' && v > want.$gt;
    }
    return v === want;
  }
  function matches(K, pred, topic, payload) {
    const t = pred.topic;
    if (t.endsWith('*') ? !topic.startsWith(t.slice(0, -1)) : topic !== t) return false;
    if (pred.topicOrganism) { const r = K.registry.get(topic.slice(t.length - 1)); if (!r || r.organism_id !== pred.topicOrganism) return false; }
    return Object.keys(pred.where || {}).every(k => matchVal(K, get(payload || {}, k), pred.where[k]));
  }

  // ---------------------------------------------------------------- runner + HUD (outside the canvas)
  let run = null;
  function start(id) {
    const L = byId(id); if (!L) return;
    stop(); const K = window.Kernel, UI = window.UIKit, h = UI.h;
    const hud = h('div', { class: 'learn-hud', role: 'region', 'aria-label': 'Lesson' });
    document.body.appendChild(hud);
    run = { L, i: 0, hint: 0, predicted: false, hud, untap: K.bus.tap((topic, p) => { const st = run && run.L.steps[run.i]; if (st && st.done && (!st.predict || run.predicted) && [].concat(st.done).some(d => matches(K, d, topic, p))) setTimeout(next, 250); }) };
    paint();
  }
  function stop() { if (!run) return; run.untap(); run.hud.remove(); run = null; }
  function next() {
    if (!run) return; run.i++; run.hint = 0; run.predicted = false;
    if (run.i >= run.L.steps.length) { mem.done[run.L.id] = Date.now(); save(mem); }
    paint();
  }
  function precheck() {
    const r = run, st = r && r.L.steps[r.i]; if (!st || !st.done || st.predict) return;
    if (st.rate && window.Taste && window.Taste.rated(st.rate)) return setTimeout(next, 400);
    const K = window.Kernel; if ([].concat(st.done).some(d => d.topic === 'kernel:organism-mounted' && d.where && K.registry.byOrganism(d.where.organismId).length)) setTimeout(next, 600);
  }
  function paint() {
    const UI = window.UIKit, h = UI.h, r = run; if (!r) return; precheck();
    r.hud.innerHTML = '';
    const head = h('div', { class: 'lh-head' }, [h('b', { text: r.L.title }), h('span', { class: 'lh-dots' }, r.L.steps.map((_, k) => h('i', { class: k < r.i ? 'd' : k === r.i ? 'c' : '' }))), h('button', { class: 'lh-x', title: 'Close lesson', text: '×', onclick: stop })]);
    r.hud.appendChild(head);
    if (r.i >= r.L.steps.length) {
      const unlock = r.L.unlock && window.Songbook && window.Songbook.songs().find(s => s.id === r.L.unlock);
      r.hud.append(h('div', { class: 'lh-win', text: '✓ Done.' + (r.L.gives ? '  ⚡ ' + r.L.gives : '') }), r.L.leverage ? h('div', { class: 'lh-say', text: 'What it gives you: ' + r.L.leverage }) : h('span'),
        unlock ? h('div', { class: 'lh-unlock', text: '🔓 Unlocked in the Songbook: “' + unlock.title + '”' }) : h('span'),
        h('div', { class: 'lh-loop' }, [h('b', { text: 'Open loop: ' }), document.createTextNode(r.L.loop || '')]),
        h('div', { class: 'lh-row' }, [h('button', { class: 'lh-go', text: 'Next lesson →', onclick: () => { const nx = nextAfter(r.L.id); nx ? start(nx.id) : stop(); } }), h('button', { class: 'lh-alt', text: 'Map', onclick: () => { stop(); open(); } })]));
      return;
    }
    const st = r.L.steps[r.i];
    r.hud.appendChild(h('div', { class: 'lh-say', text: st.say }));
    if (st.rate && !(window.Taste && window.Taste.rated(st.rate))) {
      r.hud.append(h('div', { class: 'lh-q', text: '🎧 How does it feel to you? (there is no wrong answer — this is how you find your taste)' }));
      r.hud.append(h('div', { class: 'lh-opts' }, [['💜 Love it', 2], ['🙂 It’s okay', 1], ['🙅 Not me', -1]].map(([t, v]) => h('button', { class: 'lh-opt', text: t, onclick: () => window.Taste.rate(st.rate, v) }))));
      return;
    }
    if (st.predict && !r.predicted) {
      r.hud.append(h('div', { class: 'lh-q', text: '🤔 Predict first: ' + st.predict.q }));
      const row = h('div', { class: 'lh-opts' });
      st.predict.options.forEach((o, k) => row.appendChild(h('button', { class: 'lh-opt', text: o, onclick: () => {
        mem.predictions.total++; if (k === st.predict.answer) mem.predictions.right++; save(mem);
        r.predicted = true; r.verdict = (k === st.predict.answer ? '✓ Yes. ' : '✗ Not quite. ') + st.predict.why; paint(); const K = window.Kernel; if ([].concat(st.done).some(d => d.topic === 'kernel:organism-mounted' && d.where && K.registry.byOrganism(d.where.organismId).length)) setTimeout(next, 900);
      } })));
      r.hud.append(row, h('div', { class: 'lh-score', text: 'Your prediction hit rate: ' + rate() }));
      return;
    }
    if (r.verdict) { r.hud.appendChild(h('div', { class: 'lh-verdict', text: r.verdict })); }
    r.hud.appendChild(h('div', { class: 'lh-do', text: '→ ' + st.do }));
    const hints = st.hints || ['Look for the window the step names.', 'Use ＋ Add if it is not on the canvas yet.'];
    if (r.hint > 0) r.hud.appendChild(h('div', { class: 'lh-hint', text: '💡 ' + hints[Math.min(r.hint, hints.length) - 1] }));
    r.hud.appendChild(h('div', { class: 'lh-row' }, [
      r.hint < hints.length ? h('button', { class: 'lh-alt', text: 'Hint', onclick: () => { r.hint++; paint(); } }) : h('span'),
      st.auto ? h('button', { class: 'lh-alt', text: 'Do it for me', title: 'performs the real action; the step ticks when it happens', onclick: () => { r.verdict = ''; try { st.auto(); } catch (e) {} } }) : h('span'),
    ]));
  }
  function rate() { const p = mem.predictions; return p.total ? Math.round(100 * p.right / p.total) + ' % (' + p.right + '/' + p.total + ')' : '—'; }
  function nextAfter(id) { const i = ALL.findIndex(l => l.id === id); return ALL[i + 1] || null; }

  // ---------------------------------------------------------------- the map page (overlay)
  let page = null;
  function open(focus) {
    if (page) { page.close(); if (!focus) return; }
    const UI = window.UIKit, h = UI.h, S = window.Shell; if (S && S.X) S.X.enterMode('music');
    const ov = h('div', { class: 'overlay sbk learn', role: 'dialog', 'aria-label': 'Learn' });
    const close = () => { ov.remove(); document.removeEventListener('keydown', key, true); page = null; };
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    const map = h('div', { class: 'ln-map' });
    TRACKS.forEach(t => {
      const col = h('div', { class: 'ln-track' }, [h('div', { class: 'ln-th', text: t.icon + ' ' + t.label })]);
      t.lessons.forEach((l, k) => {
        const done = !!mem.done[l.id];
        const n = h('button', { class: 'ln-node' + (done ? ' done' : '') + (focus === l.id ? ' focus' : ''), title: l.loop || '' }, [h('b', { text: (done ? '✓ ' : '') + l.title }), h('small', { text: l.hook }),
          l.gives ? h('span', { class: 'ln-skill', text: '⚡ ' + l.gives + ' — ' + l.leverage }) : h('span'),
          h('em', { text: l.steps.length + (l.steps.length > 1 ? ' steps' : ' step') + ' · ~' + l.steps.length + ' min' + (l.unlock ? ' · 🔓 unlocks a song' : '') })]);
        n.onclick = () => { close(); start(l.id); };
        col.appendChild(n); col.appendChild(h('div', { class: 'ln-link', text: '↓ open loop' }));
      });
      const all = t.lessons.every(l => mem.done[l.id]), left = t.lessons.filter(l => !mem.done[l.id]).length;
      col.appendChild(h('div', { class: 'ln-node ln-mystery' + (all ? ' done' : '') }, [h('b', { text: all ? '✦ What this track gave you' : '✦ ? ? ?' }), h('small', { text: all ? t.reveal : left + ' lesson' + (left > 1 ? 's' : '') + ' left to reveal what you can build with this.' })]));
      map.appendChild(col);
    });
    ov.append(h('div', { class: 'sbk-box' }, [
      h('header', { class: 'sbk-head' }, [h('div', {}, [h('b', { text: '🧠 Learn' }), h('span', { class: 'sbk-sub', text: ' pick any lesson — each one ends on a question the next one answers. Prediction hit rate: ' + rate() })]), h('button', { class: 'sbk-x', title: 'Close (Esc)', text: '×', onclick: close })]),
      window.Goals ? window.Goals.panel(h, close) : h('span'), map, h('p', { class: 'sbk-note', text: 'Lessons run in a small strip at the bottom-left, outside the canvas. A step ticks only when it really happens. “Do it for me” does the real thing.' }),
    ]));
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(); });
    document.addEventListener('keydown', key, true);
    document.body.appendChild(ov); page = { close };
  }

  window.Learn = { addTrack, open, start, stop, done: (id) => !!mem.done[id], title: (id) => (byId(id) || {}).title, tracks: () => TRACKS, lessons: () => ALL.slice(), get current() { return run && { id: run.L.id, step: run.i, predicted: run.predicted }; }, _matches: matches, _reset() { mem.done = {}; mem.predictions = { right: 0, total: 0 }; save(mem); } };
})();
