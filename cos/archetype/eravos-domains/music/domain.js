/* ERAVOS music domain — domain.js
 * The one place the music domain plugs into the domain-free skeleton. Everything here goes through a
 * public extension slot; nothing in kernel/ or runtime/ knows any of it exists.
 *   Kernel.use            → K.audio / K.music, port kinds, wire types, decoders, permissions (audio.js)
 *   OrganismFactory       → v10 plugin preset seeding (onDefine), view.ac/key/bpm/tap (extendView), observable topics
 *   Recipes.defineOp      → bpm, key
 *   Workspace.contribute  → tempo + key saved/restored with the workspace
 *   Intake.defineHandler  → audio files → Sample Player, .mid → Sequencer ; voice_pack pack type
 *   CanvasWM title action → MIDI arm button on organisms that take midi:note
 *   WireSystem.ambient    → global broadcasts that are not drawn as port dots
 *   shell(S)              → transport bar, BPM/tap, key label, master meter, Space = play/stop, boot copy */
(function (global) {
  'use strict';
  const MUSIC = 'music';


  // ---------------------------------------------------------------- factory
  const F = global.OrganismFactory;
  // 3.34 speed per tool: every tool that follows the transport tick gets Speed + Own BPM (written here once, not per
  // tool). sdk-music resamples its ticks from the master's — see eravos.phase34-map.spec §C. A tool opts out with tempo:false.
  F.onDefine((desc) => {
    if (desc.tempo === false || (desc.config || []).some(c => c.key === 'tempoX')) return;
    if (!(desc.hooks || []).some(hk => hk.direction === 'in' && /transport:tick/.test(String(hk.event_type || '')))) return;
    desc.config = (desc.config || []).concat([
      { key: 'tempoX', type: 'enum', options: ['¼', '½', '¾', '1', '1½', '2', '3', '4', 'own'], default: '1', label: 'Speed', group: 'TEMPO', hint: 'this tool’s speed against the song: ½ = half time, 2 = double time, own = its own BPM below', settingsOnly: true },
      { key: 'tempoBpm', type: 'number', default: 120, min: 30, max: 300, step: 0.5, unit: 'BPM', label: 'Own BPM', group: 'TEMPO', hint: 'used when Speed is “own” — stays locked to the song’s start', settingsOnly: true },
    ]);
  });
  F.onDefine((desc) => {
    // v10 plugin JSON presets → factory presets (eravos.v10-conversion: "each FX organism seeds factory presets from its file")
    if (!desc.v10 || !global.ERAVOS_DATA || !global.ERAVOS_DATA.plugins || desc._v10Seeded) return;
    desc._v10Seeded = true;
    desc.presets = desc.presets || {};
    desc.v10.plugins.forEach(pid => {
      const pl = global.ERAVOS_DATA.plugins[pid]; if (!pl) return;
      const defaults = {}; (pl.params || []).forEach(p => { defaults[p.k || p.n] = p.v; });
      Object.keys(pl.presets || {}).forEach(name => {
        try { desc.presets['v10 ' + pl.name.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) + ' · ' + name] = { params: desc.v10.map(pid, Object.assign({}, defaults, pl.presets[name])), v10: pid }; }
        catch (e) { console.warn('v10 preset map failed', pid, name, e); }
      });
    });
  });
  F.extendView((view, rec) => {
    const K = rec.K; if (!K.audio) return;
    Object.defineProperties(view, {
      ac: { get: () => K.audio.ctx }, key: { get: () => K.music.key }, bpm: { get: () => K.music.bpm },
    });
    view.tap = (portId, fft) => K.audio.tap(rec.instanceId, portId, fft);
    view.tapStereo = (portId, fft) => K.audio.tapStereo(rec.instanceId, portId, fft);
  });
  F.allowObserve(['transport:', 'theory:', 'master:', 'pad:bank-change']);

  // ---------------------------------------------------------------- recipes
  global.Recipes.defineOp('bpm', (st, { K }) => K.bus.publish('ui:transport-bpm', { bpm: st.bpm }));
  global.Recipes.defineOp('key', (st, { K, alias }) => {
    const t = alias[st.target] || st.target;
    K.bus.publish('ui:config_change:' + t, { key: 'root', value: st.root });
    if (st.scale) K.bus.publish('ui:config_change:' + t, { key: 'scale', value: st.scale });
  });

  // ---------------------------------------------------------------- workspace
  global.Workspace.contribute({
    id: MUSIC, domain: MUSIC,
    save: (K) => ({ bpm: K.music.bpm, key: K.music.key.root, scale: K.music.key.scale, trims: K.audio.trims(), mix: K.audio.mixState ? K.audio.mixState() : null }),
    beforeRestore: (K) => K.bus.publish('ui:transport-stop', {}),
    restore(K, st, snap) {
      st = st || { bpm: snap.bpm, key: snap.key, scale: snap.scale }; // workspaces saved before domain packs
      K.audio.loadTrims(st.trims || []);
      if (K.audio.loadMix) K.audio.loadMix(st.mix || null); // 3.34: strips + lines (an old workspace = an empty mix)
      if (st.bpm) K.bus.publish('ui:transport-bpm', { bpm: st.bpm });
      if (typeof st.key === 'number') K.bus.publish('theory:key-change', { root: st.key, scale: st.scale || 'minor', _from: 'workspace' });
    },
  });

  // ---------------------------------------------------------------- intake
  const I = global.Intake;
  I.definePackType('voice_pack', { spawnAssets: true });
  I.defineHandler({
    id: 'music.midi-file', domain: MUSIC, asset_type: 'midi',
    match: (name, mime, b) => (b[0] === 0x4d && b[1] === 0x54 && b[2] === 0x68 && b[3] === 0x64) || /\.midi?$/i.test(name) || /midi/.test(mime),
    handle({ K, name, bytes, pos, asset }) {
      const id = F.spawn('eravos.sequencer', Object.assign({ K }, pos));
      if (id) K.bus.publish('ui:import:' + id, { arrayBuffer: bytes, name });
      return { kind: 'midi', instanceId: id, asset };
    },
  });
  I.defineHandler({
    id: 'music.audio-file', domain: MUSIC, asset_type: 'audio',
    match: (name, mime) => global.MusicAudio.AUDIO_EXT.test(name) || /^audio\/(?!midi)/.test(mime),
    handle({ K, name, bytes, pos, asset, pack }) {
      const id = F.spawn('eravos.sample-player', Object.assign({ K }, pos, pack ? { w: 440, h: 250 } : {}));
      if (id) K.bus.publish('ui:load:' + id, { arrayBuffer: bytes, name });
      return { kind: 'audio', instanceId: id, asset };
    },
  });

  // ---------------------------------------------------------------- canvas + wires
  // 3.34 Settings → Output: this tool's Mixer strip (the same strip the Mixer and the title-bar volume move)
  if (global.ToolSettings) global.ToolSettings.addSection({
    id: 'music.output', label: 'Output · mixer strip', order: 20,
    when: (d) => (d.hooks || []).some(x => x.wire_type === 'audio' && x.direction === 'out') && d.id !== 'eravos.mixer',
    make(rec, K) {
      const UI = global.UIKit, h = UI.h, A = K.audio; if (!A || !A.strip) return null;
      const st = () => A.strip(rec.instanceId, 'out'), set = (p) => st().set(p);
      const s0 = st().get();
      const vol = UI.Knob({ label: 'Volume', min: -60, max: 12, step: 0.1, unit: 'dB', value: s0.db, default: 0, size: 34, onChange: (v) => set({ db: v }) });
      const pan = UI.Knob({ label: 'Pan', min: -1, max: 1, step: 0.01, value: s0.pan, default: 0, size: 34, onChange: (v) => set({ pan: v }) });
      const lc = UI.Knob({ label: 'Low cut', min: 10, max: 600, step: 1, unit: 'Hz', value: s0.lowCut || 10, default: 10, size: 34, onChange: (v) => set({ lowCut: v }) });
      const eq = ['low', 'mid', 'high'].map(k => UI.Knob({ label: k[0].toUpperCase() + k.slice(1), min: -15, max: 15, step: 0.1, unit: 'dB', value: s0[k], default: 0, size: 30, onChange: (v) => set({ [k]: v }) }));
      const mute = UI.Toggle({ label: 'Mute', value: !!s0.mute, onChange: (v) => set({ mute: v }) });
      const out = h('select', { class: 'uk-select', title: 'where this tool goes' }); out.addEventListener('change', () => set({ line: out.value || null }));
      const sends = h('div', { class: 'org-row' });
      function fill() {
        const s = st().get(), groups = A.lines.list().filter(l => l.kind === 'group'), aux = A.lines.builtin().concat(A.lines.list().filter(l => l.kind === 'aux'));
        out.innerHTML = ''; [['', 'Master']].concat(groups.map(g => [g.id, '→ ' + g.name])).forEach(([v, l]) => out.appendChild(h('option', { value: v, text: l }))); out.value = s.line || '';
        sends.innerHTML = ''; aux.forEach(a => sends.appendChild(UI.Knob({ label: 'Send ' + a.name, min: 0, max: 1, step: 0.01, value: (s.sends || {})[a.id] || 0, default: 0, size: 28, onChange: (v) => set({ sends: { [a.id]: v } }) }).el));
        vol.set(s.db); pan.set(s.pan); lc.set(s.lowCut || 10); eq.forEach((k, i) => k.set(s[['low', 'mid', 'high'][i]])); mute.set && mute.set(!!s.mute);
      }
      fill();
      const mine = (p) => p && p.instanceId === rec.instanceId;
      ['audio:lines'].forEach(t => rec.uiDisposers.push(K.bus.subscribe(t, () => fill(), 'settings')));
      rec.uiDisposers.push(K.bus.subscribe('audio:trim', (p) => { if (mine(p)) { vol.set(p.db); mute.set && mute.set(!!p.mute); } }, 'settings'));
      const openMx = UI.Button({ label: '🎛 Open the Mixer', hint: 'every strip side by side', onClick: () => { const ex = K.registry.byOrganism('eravos.mixer'); if (ex.length) K.bus.publish('canvas:focus-request', { instanceId: ex[0].instance_id }); else global.OrganismFactory.spawn('eravos.mixer', { K }); } });
      return h('div', {}, [h('div', { class: 'org-row' }, [vol.el, pan.el, lc.el].concat(eq.map(k => k.el)).concat([mute.el])), h('div', { class: 'org-row' }, [h('span', { class: 'org-label', text: 'Output' }), out, openMx.el]), h('div', { class: 'uk-hint', text: 'Sends (effect lines — add more in the Mixer):' }), sends]);
    },
  });
  if (global.CanvasWM) global.CanvasWM.addTitleAction({
    when: (d) => d.hooks.some(x => x.event_type === 'midi:note' && x.direction === 'in'),
    make(rec, K) {
      const b = global.UIKit.h('button', { class: 'wm-midi', title: 'arm for MIDI input', text: 'MIDI' });
      b.addEventListener('click', () => K.bus.publish('ui:midi_arm:' + rec.instanceId, { on: !b.classList.contains('on') }));
      const un = K.bus.subscribe('org:state_sync:' + rec.instanceId, (s) => b.classList.toggle('on', !!(s && s.midiArmed)), 'wm');
      rec.uiDisposers.push(un);
      return b;
    },
  });
  // 3.28: every tool that makes sound has a stop in its title bar — that tool goes quiet now (its drones, latches,
  // echo/reverb tails included); playing it again brings it straight back
  if (global.CanvasWM) global.CanvasWM.addTitleAction({
    when: (d) => d.domain === MUSIC && d.hooks.some(x => x.wire_type === 'audio' && x.direction === 'out'),
    make(rec, K) {
      const b = global.UIKit.h('button', { class: 'wm-stop', title: 'Stop this tool — quiet now, tails included', 'aria-label': 'Stop this tool’s sound', text: '■' });
      b.addEventListener('click', (e) => { e.stopPropagation(); K.bus.publish('ui:silence:' + rec.instanceId, {}); b.classList.add('hit'); setTimeout(() => b.classList.remove('hit'), 250); });
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      return b;
    },
  });
  // P14: per-tool volume in the title bar of every tool that makes sound (drag / wheel; dbl-click types; right-click mutes)
  if (global.CanvasWM) global.CanvasWM.addTitleAction({
    when: (d) => d.domain === MUSIC && d.hooks.some(x => x.wire_type === 'audio' && x.direction === 'out'),
    make(rec, K) {
      const UI = global.UIKit, h = UI.h;
      const port = (rec.def.hooks.find(x => x.wire_type === 'audio' && x.direction === 'out') || {}).port || 'out';
      const t0 = K.audio.getTrim(rec.instanceId, port);
      const num = UI.NumberDrag({ min: -60, max: 12, step: 0.5, value: t0.db, label: 'Volume (dB)', hint: 'tool volume — drag or scroll; right-click mutes', format: (v) => (v > 0 ? '+' : '') + (+v).toFixed(1) + ' dB', onChange: (v) => K.audio.setTrim(rec.instanceId, port, { db: v }) });
      const el = h('span', { class: 'wm-vol', title: 'Volume of this tool — drag up/down or scroll · double-click to type · right-click to mute' }, [h('span', { class: 'wm-vol-ic', text: '🔊' }), num.el]);
      el.addEventListener('wheel', (e) => { e.preventDefault(); e.stopPropagation(); const cur = K.audio.getTrim(rec.instanceId, port).db; const v = Math.max(-60, Math.min(12, cur + (e.deltaY < 0 ? 1 : -1))); num.set(v); K.audio.setTrim(rec.instanceId, port, { db: v }); }, { passive: false });
      el.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); const m = !K.audio.getTrim(rec.instanceId, port).mute; K.audio.setTrim(rec.instanceId, port, { mute: m }); });
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
      const un = K.bus.subscribe('audio:trim', (p) => { if (p.instanceId !== rec.instanceId) return; num.set(p.db); el.classList.toggle('muted', p.mute); el.firstChild.textContent = p.mute ? '🔇' : '🔊'; }, 'wm');
      rec.uiDisposers.push(un);
      if (t0.mute) { el.classList.add('muted'); el.firstChild.textContent = '🔇'; }
      return el;
    },
  });
  if (global.WireSystem) global.WireSystem.ambient(['theory:key-change', 'transport:tick', 'midi:note', 'ui:transport', 'transport:recorded']);

  // ---------------------------------------------------------------- dependency list (spec eravos.shell-expansion)
  // Every music tool's needs are DERIVED from its declared hooks, so a new organism gets a correct list for free;
  // a descriptor may add to it with needs: { mode, units, services, works_with, notes }.
  const CATEGORIES = ['Start here', 'Sound sources', 'Wubs', 'Genre instruments', 'Sound Forge', 'Xenharmonic', 'Analysis', 'Voice & samples', 'Drums & rhythm', 'Arrange', 'Effects', 'Mix', 'Modulation', 'Generators', 'Tools'];
  // 3.26: two modes. Music Production = everything that makes a song (Sound Design + Beat Making folded in);
  // Lab = the tools that are not for making songs (xenharmonic, analysis, breathing) — out of the studio's way
  const LAB_CATEGORIES = ['Xenharmonic', 'Analysis'];
  const STUDIO_CATEGORIES = CATEGORIES.filter(c => !LAB_CATEGORIES.includes(c));
  const UNITS = {
    engine: { id: 'music.engine', label: 'Audio engine', icon: '◉', describes: 'sound output, master bus and the clock every tool shares' },
    transport: { id: 'music.transport', label: 'Transport', icon: '▶', describes: 'play / stop, record, position, loop, metronome · Space plays' },
    tempo: { id: 'music.tempo', label: 'Tempo', icon: '♩', describes: 'BPM + tap tempo' },
    key: { id: 'music.key', label: 'Song key', icon: '♯', describes: 'the key and scale tools follow' },
    meter: { id: 'music.meter', label: 'Master meter', icon: '▮', describes: 'output level, right of the toolbar' },
    dock: { id: 'music.dock', label: 'Song Recorder', icon: '⏺', describes: 'record the song along the bottom, edit takes, export every format' },
    midi: { id: 'music.midi', label: 'MIDI button', icon: '🎛', describes: 'your pad controller: status light, one click opens the MIDI Map' },
    studio: { id: 'music.studio', label: 'Songs · Sounds · Learn', icon: '📖', describes: 'Songbook, Sounds (presets, kit packs, capture to pad) and Learn — pages of their own, off the canvas' },
  };
  function resolveNeeds(d) {
    if (!d || d.domain !== MUSIC) return null;
    const hooks = d.hooks || [], perms = d.permissions || [];
    const has = (fn) => hooks.some(fn);
    const ev = (t) => (h) => String(h.event_type || '').split('|').some(e => e.trim() === t);
    const units = [UNITS.engine.id], services = [];
    const audioOut = has(h => h.wire_type === 'audio' && h.direction === 'out'), audioIn = has(h => h.wire_type === 'audio' && h.direction === 'in');
    services.push({ id: 'audio', label: 'Audio engine', why: audioOut && audioIn ? 'processes sound' : audioOut ? 'makes sound' : audioIn ? 'listens to sound' : 'shares the audio clock' });
    if (has(ev('transport:tick')) || has(ev('transport:play'))) { units.push(UNITS.transport.id, UNITS.tempo.id); services.push({ id: 'clock', label: 'Master clock & tempo', why: 'locks to the beat' }); }
    else if (has(ev('ui:transport-bpm'))) { units.push(UNITS.tempo.id); services.push({ id: 'clock', label: 'Tempo', why: 'sets the song tempo' }); }
    if (has(ev('theory:key-change'))) { units.push(UNITS.key.id); services.push({ id: 'key', label: 'Song key & scale', why: has(h => h.direction === 'out' && ev('theory:key-change')(h)) ? 'sets the key' : 'plays in key' }); }
    if (audioOut) units.push(UNITS.meter.id);
    if (has(ev('midi:note'))) units.push(UNITS.midi.id);
    if (has(ev('midi:note'))) services.push({ id: 'midi', label: 'MIDI input', why: 'plays from a controller (arm with the MIDI button)' });
    const mods = hooks.filter(h => h.wire_type === 'modulation' && h.direction === 'in').length;
    if (mods) services.push({ id: 'mod', label: `${mods} modulation input${mods > 1 ? 's' : ''}`, why: 'LFO / XY / Macro can move them' });
    if (has(ev('note:trigger')) && has(h => h.direction === 'in' && ev('note:trigger')(h))) services.push({ id: 'notes', label: 'Notes from a sequencer, timeline or keys', why: 'or play its own keyboard' });
    if (perms.includes('filesystem_read')) services.push({ id: 'files', label: 'Your files', why: 'drop audio / MIDI on it' });
    if (hooks.some(h => h.event_type === 'asset:ready' && h.direction === 'out')) services.push({ id: 'assets', label: 'Clip output', why: 'renders sounds other tools can load' });
    return { mode: (d.needs && d.needs.mode) || (LAB_CATEGORIES.includes(d.category) ? 'music.lab' : 'music'), units, services };
  }
  global.MusicDeps = { resolve: resolveNeeds, UNITS, CATEGORIES };

  // ---------------------------------------------------------------- shell contribution
  // Agnostic shell (has S.unit): register units + modes + the resolver, build NOTHING until a mode is picked or a
  // music tool is added. Older shells: build every unit now (previous behaviour).
  function shell(S) {
    const K = S.K, UI = global.UIKit, h = UI.h;
    let T = null;
    const btn = (id, cls, title, text) => h('button', { class: 'tb-btn ' + cls, id, title, text });
    const unitDefs = [
      Object.assign({}, UNITS.engine, { domain: MUSIC, build() {
        T = global.MasterTransport.create(K, { bpm: 140 });
        global.Transport = T; global.MasterTransportInstance = T; S.T = T;
        S.onActivate(() => { K.audio.boot(); T.boot(); });
        K.audio.boot(); T.boot();
        // a browser may start the audio engine suspended (no click yet, or a restored workspace): any first touch wakes it,
        // capture phase so a tool that stops propagation (pads, knobs) still counts
        const wake = () => { const ac = K.audio.ctx; if (ac && ac.state === 'suspended' && ac.resume) ac.resume().catch(() => {}); };
        ['pointerdown', 'keydown', 'touchstart'].forEach(t => global.addEventListener(t, wake, true));
        // P11 L-01: opened straight from disk → MIDI (Firefox), mic and dependable saving are limited; say so, once, visibly
        if (global.location && global.location.protocol === 'file:') {
          const chip = h('button', { class: 'tb-btn', title: 'Opened from a file — click for why this matters', style: { color: 'var(--amber, #ffaa00)', borderColor: 'var(--amber, #ffaa00)' }, text: '⚠ file mode' });
          chip.onclick = () => S.toast('ERAVOS is open straight from a file. MIDI controllers (Firefox), the microphone and saving work best via “Start ERAVOS” in the ERAVOS folder, which opens http://localhost:4747. Save your song first (Session → Save), then open it there.', 'bad', 12000);
          S.slot('bar').appendChild(chip);
        }
      } }),
      Object.assign({}, UNITS.transport, { domain: MUSIC, requires: [UNITS.engine.id], build() {
        const restartBtn = btn('restart', '', 'Back to the start — the loop start when the loop is on (Home). Keeps playing.', '⏮');
        const playBtn = btn('play', '', 'Play / stop (Space)', '▶'), recBtn = btn('rec', 'rec', 'Record the master output', '⏺');
        const loopBtn = btn('loopBtn', '', 'Loop region on/off', '⟲'), metro = btn('metro', '', 'Metronome', '𝅘𝅥');
        const pos = h('div', { id: 'pos', title: 'bar : beat', text: '1 : 1' });
        S.slot('bar').appendChild(h('div', { class: 'tb-group', 'data-unit': UNITS.transport.id }, [restartBtn, playBtn, recBtn, pos, loopBtn, metro]));
        restartBtn.onclick = () => { K.audio.boot(); K.bus.publish('ui:transport-restart', {}); };
        playBtn.onclick = () => K.bus.publish('ui:transport-play', { toggle: true });
        recBtn.onclick = () => K.bus.publish('ui:transport-record', {});
        loopBtn.onclick = () => K.bus.publish('ui:transport-loop', { on: !T.loop.on });
        metro.onclick = () => K.bus.publish('ui:transport-metronome', { on: !T.metronome });
        K.bus.subscribe('transport:state', (s) => {
          playBtn.textContent = s.playing ? '■' : '▶'; playBtn.classList.toggle('on', s.playing);
          recBtn.classList.toggle('on', s.recording); loopBtn.classList.toggle('on', s.loop.on); metro.classList.toggle('on', s.metronome);
          if (!s.playing) pos.textContent = `${Math.floor(s.position16 / 16) + 1} : ${Math.floor((s.position16 % 16) / 4) + 1}`;
        }, 'shell');
        K.bus.subscribe('transport:tick', (t) => { if (t.sixteenth === 1) UI.atTime(K.audio.ctx, t.time, () => { pos.textContent = `${t.bar} : ${t.beat}`; }); }, 'shell');
        K.bus.subscribe('transport:bounce', (p) => { if (p.state === 'start') S.toast(`Bouncing ${p.bars} bars… (plays in real time)`, 'good'); if (p.state === 'done') S.toast(`Bounce finished (${(p.duration || 0).toFixed(2)} s)`, 'good'); }, 'shell');
        S.bindKey('Space', () => { K.audio.boot(); K.bus.publish('ui:transport-play', { toggle: true }); });
        S.bindKey('Home', () => { K.audio.boot(); K.bus.publish('ui:transport-restart', {}); });
      } }),
      Object.assign({}, UNITS.tempo, { domain: MUSIC, requires: [UNITS.engine.id], build() {
        const bpm = UI.NumberDrag({ min: 40, max: 240, step: 1, value: T.bpm, label: 'BPM', onChange: (v) => K.bus.publish('ui:transport-bpm', { bpm: v }) });
        bpm.el.id = 'bpm';
        const tap = btn('tap', '', 'Tap tempo', 'TAP');
        S.slot('bar').appendChild(h('div', { class: 'tb-group', 'data-unit': UNITS.tempo.id }, [h('span', { style: { color: 'var(--dim)', fontSize: '11px' }, text: 'BPM' }), bpm.el, tap]));
        tap.onclick = () => K.bus.publish('ui:transport-tap', {});   // 3.35: the transport owns tap tempo (pads can tap too)
        K.bus.subscribe('transport:state', (s) => bpm.set(s.bpm), 'shell');
        K.bus.subscribe('transport:bpm', (p) => bpm.set(p.bpm), 'shell');
      } }),
      Object.assign({}, UNITS.key, { domain: MUSIC, requires: [UNITS.engine.id], build() {
        const k = K.music.key;
        const keyLabel = h('span', { id: 'keyLabel', title: 'Song key — change it in the Session window', text: `${global.MusicTheory.NAMES[k.root]} ${String(k.scale).replace('_', ' ')}` });
        S.slot('bar').appendChild(h('div', { class: 'tb-group', 'data-unit': UNITS.key.id }, [keyLabel]));
        K.bus.subscribe('theory:key-change', (kk) => { keyLabel.textContent = `${global.MusicTheory.NAMES[kk.root]} ${String(kk.scale).replace('_', ' ')}`; }, 'shell');
      } }),
      Object.assign({}, UNITS.meter, { domain: MUSIC, requires: [UNITS.engine.id], build() {
        const mm = h('canvas', { id: 'masterMeter', width: 180, height: 44, title: 'Master output level', 'data-unit': UNITS.meter.id });
        S.slot('bar-right').appendChild(mm);
        const mg = mm.getContext('2d');
        (function meterLoop() {
          const m = K.audio.chain ? K.audio.meters() : null;
          mg.clearRect(0, 0, 180, 44); mg.fillStyle = '#0b0f14'; mg.fillRect(0, 0, 180, 44);
          if (m) [m.L, m.R].forEach((c, i) => {
            const n = (db) => Math.max(0, Math.min(1, (db + 48) / 48));
            const g = mg.createLinearGradient(0, 0, 180, 0); g.addColorStop(0, '#00ff88'); g.addColorStop(0.8, '#ffdd00'); g.addColorStop(1, '#ff2266');
            mg.fillStyle = g; mg.globalAlpha = 0.4; mg.fillRect(0, 4 + i * 20, n(c.peakDb) * 180, 16); mg.globalAlpha = 1; mg.fillRect(0, 4 + i * 20, n(c.rmsDb) * 180, 16);
          });
          requestAnimationFrame(meterLoop);
        })();
      } }),
      Object.assign({}, UNITS.dock, { domain: MUSIC, requires: [UNITS.engine.id, UNITS.transport.id], build() {
        const b = h('button', { class: 'tb-btn', id: 'dockBtn', title: 'Song Recorder — pinned along the bottom', 'data-unit': UNITS.dock.id, text: '⏺ Song' });
        const ensure = () => { const ex = K.registry.byOrganism('eravos.song-recorder')[0]; if (ex) return ex.instance_id; return global.OrganismFactory.spawn('eravos.song-recorder'); };
        b.onclick = () => { const had = K.registry.byOrganism('eravos.song-recorder').length; ensure(); const d = global.document.getElementById('dock'); if (had && d) { d.classList.toggle('folded'); global.CanvasWM.layoutDock(); } };
        S.slot('bar').appendChild(h('div', { class: 'tb-group', 'data-unit': UNITS.dock.id }, [b]));
        setTimeout(ensure, 0); // after a restore has spawned its own recorder (singleton)
        K.bus.subscribe('recipe:done', () => setTimeout(ensure, 0), 'shell'); // 3.27: a new song keeps its recorder in the dock
      } }),
      Object.assign({}, UNITS.midi, { domain: MUSIC, requires: [UNITS.engine.id], build() {
        const led = h('span', { class: 'midi-led' }), name = h('span', { text: 'MIDI' });
        const b = h('button', { class: 'tb-btn', id: 'midiBtn', title: 'Pad controller — open the MIDI Map', 'data-unit': UNITS.midi.id }, [led, name]);
        b.onclick = () => {
          const ex = K.registry.byOrganism('eravos.midi-mapper')[0];
          if (ex && global.OrganismFactory.show(ex.instance_id)) return; // the background pad service gets its window
          if (ex) { K.bus.publish('canvas:collapse', { instanceId: ex.instance_id, on: false }); K.bus.publish('canvas:focus-request', { instanceId: ex.instance_id }); }
          else { const id = global.OrganismFactory.spawn('eravos.midi-mapper'); if (id) K.bus.publish('ui:connect:' + id, {}); }
        };
        S.slot('bar').appendChild(h('div', { class: 'tb-group', 'data-unit': UNITS.midi.id }, [b]));
        K.bus.subscribe('midi:status', (st) => {
          led.classList.toggle('on', !!st.connected);
          if (st.device) { name.textContent = st.device.length > 16 ? st.device.slice(0, 15) + '…' : st.device; b.title = st.device + (st.learned ? ' · learned pads' : ' · factory pad map') + ' — open the MIDI Map'; }
          if (st.activity) { led.classList.add('hit'); clearTimeout(led._t); led._t = setTimeout(() => led.classList.remove('hit'), 90); }
        }, 'shell');
        // pulse while a pad-playable tool waits for its controller and no MIDI Map exists yet
        const nudge = () => { const need = K.registry.list().some(r => r.organism_id === 'eravos.pads' || r.organism_id === 'eravos.drum-forge') && !K.registry.byOrganism('eravos.midi-mapper').length; b.classList.toggle('nudge', need); if (need) name.textContent = 'Connect pads'; else if (name.textContent === 'Connect pads') name.textContent = 'MIDI'; };
        K.bus.subscribe('kernel:organism-mounted', nudge, 'shell'); K.bus.subscribe('kernel:organism-unmounted', nudge, 'shell'); setTimeout(nudge, 0);
        // plug-and-play: a pad controller that is plugged in (now or later) plays the canvas without clicking anything
        const nav = global.navigator;
        if (nav && nav.requestMIDIAccess && !global.__ERAVOS_NO_AUTOMIDI) setTimeout(() => {
          nav.requestMIDIAccess({ sysex: false }).then((acc) => {
            const check = () => {
              if (K.registry.byOrganism('eravos.midi-mapper').length) return;
              const ins = Array.from(acc.inputs.values()).filter(i => i.state !== 'disconnected'); if (!ins.length) return;
              // 3.30: pads work with NO window open — the MIDI Map runs as a background service (not saved, survives
              // clearing the canvas); the MIDI button gives it its window when you want to learn or map knobs
              const id = global.OrganismFactory.spawn('eravos.midi-mapper', { service: true }); if (!id) return;
              K.bus.publish('ui:connect:' + id, {});
              S.toast('🎛 ' + ins[0].name + ' connected — hit a pad. (Click MIDI to open its map.)', 'good', 5000);
            };
            check(); acc.addEventListener('statechange', () => setTimeout(check, 300));
            K.bus.subscribe('kernel:organism-unmounted', (p) => { if (p && p.organismId === 'eravos.midi-mapper') setTimeout(check, 300); }, 'shell'); // closed its window → back to the background
          }).catch(() => {});
        }, 1500); // after a restored workspace has spawned its own MIDI Map
      } }),
      // 3.29: Songbook + Learn live OFF the canvas (their own full-screen pages, data/songbook.js · data/learn.js)
      Object.assign({}, UNITS.studio, { domain: MUSIC, requires: [UNITS.engine.id], build() {
        const g = h('div', { class: 'tb-group', 'data-unit': UNITS.studio.id });
        const sb = h('button', { class: 'tb-btn', id: 'songbookBtn', title: 'Songs — every song in one place: write a new one in any genre, the song for her, your saved songs (off the canvas)', text: '📖 Songs' });
        const lb = h('button', { class: 'tb-btn', id: 'learnBtn', title: 'Learn — short lessons, a map you choose your own path through (off the canvas)', text: '🧠 Learn' });
        const sd = h('button', { class: 'tb-btn', id: 'soundsBtn', title: 'Sounds — every preset, drum kit packs (mix & match pads), capture any sound to a pad (off the canvas)', text: '🎚 Sounds' });
        sb.onclick = () => global.Songbook && global.Songbook.open(); lb.onclick = () => global.Learn && global.Learn.open(); sd.onclick = () => global.Sounds && global.Sounds.open();
        g.append(sb, sd, lb); S.slot('bar').appendChild(g);
      } }),
    ];
    const brand = {
      tagline: 'A canvas of living instruments. Everything is in key, everything is on the beat — you can\'t play a wrong note.',
      tip: 'Tip: drag audio files (her voice clips), a voice-pack .zip, a .mid or a saved .eravos.json anywhere onto the canvas.',
    };
    const all = Object.values(UNITS).map(u => u.id);
    if (typeof S.unit !== 'function') { // pre-expansion shell: paint everything now
      S.brand(Object.assign({ categories: CATEGORIES }, brand));
      unitDefs.forEach(u => u.build(S));
      return;
    }
    unitDefs.forEach(u => S.unit(u));
    S.needs(resolveNeeds);
    S.mode({ id: 'music', domain: MUSIC, label: 'Music Production', icon: '🎛', accent: '#ff2266', units: all, categories: STUDIO_CATEGORIES, brand,
      blurb: 'The studio. Song Engine writes whole songs in any genre; every synth, drum, effect and sound-design tool. Songs, drops, mixing, export.' });
    S.mode({ id: 'music.lab', domain: MUSIC, label: 'Lab', icon: '∿', accent: '#00ffcc', units: [UNITS.engine.id, UNITS.meter.id, UNITS.dock.id],
      categories: LAB_CATEGORIES.concat(['Effects', 'Modulation']),
      brand: { tagline: 'The other tools: irrational tunings, inharmonic spectra, harmonic analysis, breathing.' },
      blurb: 'Everything that is not song-making: xenharmonic synths, spectra, analysis, breath. Engine and meter only — no song key, no grid.' });
  }
  // registered LAST: when the shell already exists (desktop: the domain arrives as a pack) the shell hook runs
  // synchronously inside Kernel.use — everything above must be initialised by then
  global.Kernel.use({
    id: MUSIC, version: '1.0.0', label: 'Music',
    install(K, opts) { global.MusicAudio.install(K, opts); },
    prepare(K) { if (K.audio) K.audio.boot(); },
    shell(S) { shell(S); },
  });
})(typeof window !== 'undefined' ? window : globalThis);
