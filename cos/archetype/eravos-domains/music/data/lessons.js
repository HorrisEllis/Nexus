/* data/lessons.json (as JS for file://) — eravos.coach lessons. Steps complete on REAL bus events.
 * done_when: { topic, where?: {path: value | {$organism}|{$in}|{$exists}|{$gt}} } — or manual: true (Next button). */
window.ERAVOS_DATA = window.ERAVOS_DATA || {};
window.ERAVOS_DATA.lessons = [
  {
    id: 'song-for-her', title: 'Make a song for her', icon: '💘',
    intro: 'Seven small steps. The song, the drums and the bass are already built — you add her voice and press play.',
    steps: [
      { text: 'Press ▶ (or Space) and listen. This is your song skeleton: an intro, a build, a pause — then the drop.', show: 'eravos.bass-drop-builder', done_when: { topic: 'transport:play' } },
      { text: 'Pick the mood in the Session window: the KEY wheel and the scale. “minor” is dark and emotional. Nothing can sound wrong — every note follows. (Press Next when you like it.)', show: 'eravos.session', manual: true },
      { text: 'Bring her voice in: drag her voice clips (or the whole voice-pack .zip) anywhere onto the canvas. Each clip opens in its own Sample window.', done_when: { topic: 'asset:ready', where: { _from: { $organism: 'eravos.sample-player' } } }, spawn: null },
      { text: 'Find the line for the drop — “give your head a shake”. Click a Sample window’s ▶ to hear it. If it has extra words, send it to the Clip Maker (Send clip to… → Clip Maker), drag across the exact words and press “Keep only selection”.', show: 'eravos.clip-maker', manual: true },
      { text: 'Send that line to the Drop Builder: in its Sample (or Clip Maker) window choose “Send clip to… → Drop Builder”. It will end exactly on the first beat of the drop.', show: 'eravos.bass-drop-builder', done_when: { topic: 'asset:ready', where: { target: { $organism: 'eravos.bass-drop-builder' } } } },
      { text: 'Press ▶ from the start and wait for it… her voice, one beat of silence, then the bass hits. Try Stutter ×3 on the Drop Builder for “gi-gi-give your head a shake”.', show: 'eravos.bass-drop-builder', done_when: { topic: 'edm:drop-fired' } },
      { text: 'Is it loud enough? The Master window says “quiet / on target / too loud”. Turn Makeup up until it says on target.', show: 'eravos.master-fx', manual: true },
      { text: 'Save it (Session → Save) and press “BOUNCE WAV”. The song plays through once and downloads as a WAV you can send her.', show: 'eravos.session', done_when: { topic: 'transport:bounce', where: { state: 'done' } } },
    ],
  },
  {
    id: 'first-beat', title: 'First Beat', icon: '🥁',
    intro: 'Drums in three steps.',
    steps: [
      { text: 'Add a Drum Machine (＋ Add → Drum Machine, or press “do it”). Click its pads — top of a pad = loud, bottom = soft.', spawn: 'eravos.pads', done_when: { topic: 'kernel:organism-mounted', where: { organismId: 'eravos.pads' } } },
      { text: 'Add a Sequencer and choose a Genre starter (try “four-on-floor house”). Its lanes point at the drum machine.', spawn: 'eravos.sequencer', done_when: [{ topic: 'ui:starter_load:*', topicOrganism: 'eravos.sequencer' }, { topic: 'ui:track_edit:*', topicOrganism: 'eravos.sequencer', where: { 'patch.target': { $organism: 'eravos.pads' } } }] },
      { text: 'Press ▶. That’s a beat.', done_when: { topic: 'transport:play' } },
    ],
  },
  {
    id: 'bassline-in-key', title: 'Bassline in Key', icon: '🔊',
    intro: 'A bassline that can’t be wrong.',
    steps: [
      { text: 'Add a Wobble Bass.', spawn: 'eravos.wobble-bass', done_when: { topic: 'kernel:organism-mounted', where: { organismId: 'eravos.wobble-bass' } } },
      { text: 'In the Sequencer, drag a wire from its right-edge dot to the Wobble Bass (or choose “dubstep half-time 140”). A melodic lane appears — its steps are scale degrees, always in key.', show: 'eravos.sequencer', done_when: { topic: 'note:trigger', where: { target: { $organism: 'eravos.wobble-bass' } } } },
      { text: 'Right-click a bass step and change its Wobble rate to 1/16 — that is the dubstep “talk”.', manual: true },
    ],
  },
  {
    id: 'chop-voice', title: 'Chop Raven’s Voice', icon: '✂',
    intro: 'Turn one recording into playable pieces.',
    steps: [
      { text: 'Add a Clip Maker and drop her recording on it (or press ● Record).', spawn: 'eravos.clip-maker', done_when: [{ topic: 'ui:load:*', topicOrganism: 'eravos.clip-maker' }, { topic: 'ui:record:*', topicOrganism: 'eravos.clip-maker', where: { on: false } }] },
      { text: 'Press “Split on silence” — each phrase becomes its own clip.', show: 'eravos.clip-maker', manual: true },
      { text: 'Send a clip to the Drum Machine’s empty sample pad (or a new Sample player) and play it.', done_when: { topic: 'asset:ready', where: { _from: { $organism: 'eravos.clip-maker' } } } },
    ],
  },
  {
    id: 'build-and-drop', title: 'Build and Drop', icon: '🔻',
    intro: 'Tension, build, silence, DROP.',
    steps: [
      { text: 'Add a Drop Builder.', spawn: 'eravos.bass-drop-builder', done_when: { topic: 'kernel:organism-mounted', where: { organismId: 'eravos.bass-drop-builder' } } },
      { text: 'Click the DROP section and choose which sequencer pattern plays there (e.g. C).', show: 'eravos.bass-drop-builder', manual: true },
      { text: 'Press FIRE, then ▶. Wait for the drop.', done_when: { topic: 'edm:drop-fired' } },
    ],
  },
  {
    id: 'mix-loud', title: 'Mix It Loud Enough', icon: '🎚',
    intro: 'Loud, not broken.',
    steps: [
      { text: 'Add the Master window.', spawn: 'eravos.master-fx', done_when: { topic: 'kernel:organism-mounted', where: { organismId: 'eravos.master-fx' } } },
      { text: 'Play the song and raise Makeup until the status says “on target”.', done_when: { topic: 'master:loudness', where: { shortTerm: { $gt: -16 } } } },
    ],
  },
  {
    id: 'export', title: 'Export Your Song', icon: '⤓',
    intro: 'Get a WAV file.',
    steps: [
      { text: 'Open the Session window (＋ Add → Session).', spawn: 'eravos.session', done_when: { topic: 'kernel:organism-mounted', where: { organismId: 'eravos.session' } } },
      { text: 'Press BOUNCE WAV. It plays once in real time, then downloads.', show: 'eravos.session', done_when: { topic: 'transport:bounce', where: { state: 'done' } } },
    ],
  },
];
