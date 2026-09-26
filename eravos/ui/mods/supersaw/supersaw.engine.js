/* ═══════════════════════════════════════════════════════════
   MOD: SUPERSAW  v1.0.0
   id: eravos.supersaw

   7-voice detuned sawtooth unison through a lowpass filter.
   Classic festival/EDM lead stack. Voices spread across the
   stereo field via per-voice panners. One-shot trigger or
   sustained hold (start/stop).
   ═══════════════════════════════════════════════════════════ */

window.SupersawEngine = (() => {
'use strict';

function mount(instanceId, sBus, audio, config = {}) {
  const gBus = KERNEL.bus;

  let _params = {
    pitch:  config.pitch  || 60,
    voices: config.voices || 7,
    detune: config.detune != null ? config.detune : 18,
    spread: config.spread != null ? config.spread : 0.6,
    cutoff: config.cutoff || 5000,
    attack: config.attack != null ? config.attack : 0.01,
    decay:  config.decay  || 0.6,
    active: false,
  };

  let _nodes = null; /* sustained voice set, when active */

  function _midiToHz(note) { return 440 * Math.pow(2, (note - 69) / 12); }

  function _buildStack(AC, freq, gainNode) {
    const filt = AC.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = _params.cutoff;
    filt.Q.value = 0.7;
    filt.connect(gainNode);

    const n = _params.voices;
    const oscs = [];
    for (let i = 0; i < n; i++) {
      const o = AC.createOscillator();
      o.type = 'sawtooth';
      /* Spread detune symmetrically across voices: center voice = 0 detune */
      const pos = n === 1 ? 0 : (i / (n - 1)) * 2 - 1; /* -1..1 */
      o.detune.value = pos * _params.detune;
      o.frequency.value = freq;

      const pan = AC.createStereoPanner ? AC.createStereoPanner() : null;
      if (pan) { pan.pan.value = pos * _params.spread; o.connect(pan); pan.connect(filt); }
      else       { o.connect(filt); }

      oscs.push(o);
    }
    return { oscs, filt };
  }

  function _trigger(vel = 1) {
    const AC = audio.boot();
    const t  = AC.currentTime + 0.01;
    const freq = _midiToHz(_params.pitch);

    const g = AC.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel * 0.55, t + Math.max(0.005, _params.attack));
    g.gain.exponentialRampToValueAtTime(0.001, t + _params.attack + _params.decay);

    const { oscs, filt } = _buildStack(AC, freq, g);
    audio.send(g, true, false, true);

    oscs.forEach(o => { o.start(t); o.stop(t + _params.attack + _params.decay + 0.1); });

    sBus.publish('org:triggered', { freq, vel });
    gBus.publish('audio:signal', { instanceId, source: 'supersaw' });
  }

  function _start() {
    if (_nodes) return;
    const AC = audio.boot();
    const freq = _midiToHz(_params.pitch);
    const g = AC.createGain();
    g.gain.setValueAtTime(0, AC.currentTime);
    g.gain.linearRampToValueAtTime(0.5, AC.currentTime + Math.max(0.005, _params.attack));

    const { oscs, filt } = _buildStack(AC, freq, g);
    audio.send(g, true, false, true);
    oscs.forEach(o => o.start());

    _nodes = { oscs, filt, g };
    _params.active = true;
    sBus.publish('org:state_sync', { active: true, params: { ..._params } });
    gBus.publish('audio:signal', { instanceId, source: 'supersaw' });
  }

  function _stop() {
    if (!_nodes) return;
    const AC = audio.boot();
    const { oscs, g } = _nodes;
    g.gain.setTargetAtTime(0, AC.currentTime, 0.05);
    oscs.forEach(o => { try { o.stop(AC.currentTime + 0.2); } catch (e) {} });
    _nodes = null;
    _params.active = false;
    sBus.publish('org:state_sync', { active: false });
  }

  function _updateParam(key, val) {
    _params[key] = val;
    if (_nodes && key === 'cutoff') _nodes.filt.frequency.setTargetAtTime(val, audio.AC.currentTime, 0.02);
  }

  function _syncUI() {
    sBus.publish('org:state_sync', { active: _params.active, params: { ..._params } });
  }

  const _unsubs = [
    gBus.subscribe('ui:supersaw_trigger:' + instanceId, ({ vel }) => _trigger(vel || 1)),
    gBus.subscribe('ui:supersaw_toggle:'  + instanceId, () => _params.active ? _stop() : _start()),
    gBus.subscribe('ui:config_change:'    + instanceId, ({ key, value }) => _updateParam(key, value)),
    gBus.subscribe('pad:trigger', ({ sound }) => { if (sound === 'supersaw') _trigger(0.9); }),
    gBus.subscribe('midi:note',  ({ note, velocity, on }) => {
      if (on === false) return;
      _params.pitch = note;
      _trigger((velocity || 100) / 127);
    }),
  ];

  _syncUI();

  KERNEL.registry.register({
    instanceId,
    id:       'eravos.supersaw',
    label:    'Supersaw',
    provides: ['capability.audio_out', 'capability.lead_voice'],
    requires: ['capability.audio_context'],
    permissions: ['audio_out', 'bus_publish', 'bus_subscribe'],
    hooks: [
      { hook_id: 'supersaw.hook.trig_in',   direction: 'in',  event_type: 'pad:trigger',  contract_version: '1.0.0' },
      { hook_id: 'supersaw.hook.audio_out', direction: 'out', event_type: 'audio:signal', contract_version: '1.0.0' },
    ],
  });

  return {
    unmount() { _stop(); _unsubs.forEach(u => u()); KERNEL.registry.unregister(instanceId); },
    trigger: _trigger, start: _start, stop: _stop,
    get params() { return { ..._params }; },
  };
}

return { mount };
})();
