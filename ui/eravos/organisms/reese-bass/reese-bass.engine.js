/* ═══════════════════════════════════════════════════════════
   ORGANISM: REESE BASS  v1.0.0
   id: eravos.reese-bass

   Two slightly detuned sawtooth oscillators through a sweeping
   lowpass filter. Sub oscillator at half frequency for weight.
   The DNB/neuro foundation sound.
   Continuous or one-shot triggered.
   ═══════════════════════════════════════════════════════════ */

window.ReeseBassEngine = (() => {
'use strict';

function mount(instanceId, sBus, audio, config = {}) {
  const gBus = KERNEL.bus;

  let _params = {
    pitch:  config.pitch  || 55,   /* Hz */
    detune: config.detune || 10,   /* cents */
    cutoff: config.cutoff || 400,
    sweep:  config.sweep  || 0.9,  /* filter sweep duration */
    gain:   config.gain   || 0.85,
    sub:    config.sub !== false,
    active: false,
  };

  let _nodes = null;

  function _start() {
    if (_nodes) _stop();
    const AC = audio.boot();

    const o1   = AC.createOscillator(); o1.type = 'sawtooth';
    const o2   = AC.createOscillator(); o2.type = 'sawtooth';
    const filt = AC.createBiquadFilter(); filt.type = 'lowpass'; filt.Q.value = 1.8;
    const gain = AC.createGain(); gain.gain.value = _params.gain;

    o1.frequency.value = _params.pitch * Math.pow(2,  _params.detune / 1200);
    o2.frequency.value = _params.pitch * Math.pow(2, -_params.detune / 1200);

    /* Continuous slow sweep */
    filt.frequency.value = _params.cutoff * 0.4;

    o1.connect(filt); o2.connect(filt); filt.connect(gain); gain.connect(AC.destination);

    if (_params.sub) {
      const subO = AC.createOscillator(); subO.type = 'sine';
      subO.frequency.value = _params.pitch * 0.5;
      const subG = AC.createGain(); subG.gain.value = 0.4;
      subO.connect(subG); subG.connect(AC.destination);
      subO.start(); _nodes = { o1, o2, filt, gain, subO, subG };
    } else {
      _nodes = { o1, o2, filt, gain };
    }

    [o1, o2].forEach(n => n.start());
    _params.active = true;
    sBus.publish('org:state_sync', { active: true, params: { ..._params } });
  }

  function _stop() {
    if (!_nodes) return;
    Object.values(_nodes).forEach(n => { try { if (n.stop) n.stop(0); n.disconnect(); } catch(e){} });
    _nodes = null;
    _params.active = false;
    sBus.publish('org:state_sync', { active: false });
  }

  function _trigger(vel = 1) {
    const AC = audio.boot();
    const t  = AC.currentTime + 0.01;
    const dur = _params.sweep + 0.1;

    const o1 = AC.createOscillator(); o1.type = 'sawtooth';
    const o2 = AC.createOscillator(); o2.type = 'sawtooth';
    o1.frequency.value = _params.pitch * Math.pow(2,  _params.detune / 1200);
    o2.frequency.value = _params.pitch * Math.pow(2, -_params.detune / 1200);

    const filt = AC.createBiquadFilter(); filt.type = 'lowpass'; filt.Q.value = 1.8;
    filt.frequency.setValueAtTime(_params.cutoff * 0.4, t);
    filt.frequency.linearRampToValueAtTime(_params.cutoff * 2.6, t + _params.sweep * 0.4);
    filt.frequency.exponentialRampToValueAtTime(_params.cutoff * 0.5, t + _params.sweep);

    const gain = AC.createGain();
    gain.gain.setValueAtTime(vel * _params.gain, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    o1.connect(filt); o2.connect(filt); filt.connect(gain); gain.connect(AC.destination);
    [o1, o2].forEach(n => { n.start(t); n.stop(t + dur + 0.05); });

    if (_params.sub) {
      const subO = AC.createOscillator(); subO.type = 'sine';
      subO.frequency.value = _params.pitch * 0.5;
      const subG = AC.createGain();
      subG.gain.setValueAtTime(vel * 0.4, t);
      subG.gain.exponentialRampToValueAtTime(0.001, t + dur + 0.05);
      subO.connect(subG); subG.connect(AC.destination);
      subO.start(t); subO.stop(t + dur + 0.1);
    }
  }

  function _updateParam(key, val) {
    _params[key] = val;
    if (!_nodes) return;
    const { o1, o2, filt, gain } = _nodes;
    if (key === 'pitch') {
      o1.frequency.setTargetAtTime(val * Math.pow(2, _params.detune/1200), audio.AC.currentTime, 0.05);
      o2.frequency.setTargetAtTime(val * Math.pow(2, -_params.detune/1200), audio.AC.currentTime, 0.05);
    }
    if (key === 'cutoff') filt.frequency.setTargetAtTime(val * 0.4, audio.AC.currentTime, 0.05);
    if (key === 'gain')   gain.gain.setTargetAtTime(val, audio.AC.currentTime, 0.05);
  }

  function _syncUI() {
    sBus.publish('org:state_sync', { active: _params.active, params: { ..._params } });
  }

  const _unsubs = [
    gBus.subscribe('ui:reese_toggle:' + instanceId, () => _params.active ? _stop() : _start()),
    gBus.subscribe('ui:reese_trigger:' + instanceId, ({ vel }) => _trigger(vel || 1)),
    gBus.subscribe('ui:config_change:' + instanceId, ({ key, value }) => _updateParam(key, value)),
    gBus.subscribe('pad:trigger', ({ sound }) => { if (sound === 'reese') _trigger(0.88); }),
  ];

  _syncUI();

  KERNEL.registry.register({
    instanceId,
    id:       'eravos.reese-bass',
    label:    'Reese Bass',
    provides: ['capability.audio_out'],
    requires: ['capability.audio_context'],
    permissions: ['audio_out', 'bus_publish', 'bus_subscribe'],
    hooks: [
      { hook_id: 'reese.hook.trig_in',   direction: 'in',  event_type: 'pad:trigger',  contract_version: '1.0.0' },
      { hook_id: 'reese.hook.audio_out', direction: 'out', event_type: 'audio:signal', contract_version: '1.0.0' },
    ],
  });

  return {
    unmount() { _stop(); _unsubs.forEach(u => u()); KERNEL.registry.unregister(instanceId); },
    start: _start, stop: _stop, trigger: _trigger,
    get params() { return { ..._params }; },
  };
}

return { mount };
})();
