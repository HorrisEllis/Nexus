/* ═══════════════════════════════════════════════════════════
   MOD: ACID SYNTH  v1.0.0
   id: eravos.acid-synth

   303-style acid synthesizer. Sawtooth through a resonant
   lowpass with filter envelope. Accent + glide modes.
   One-shot trigger per pad event or ui:fire.
   ═══════════════════════════════════════════════════════════ */

window.AcidSynthEngine = (() => {
'use strict';

function mount(instanceId, sBus, audio, config = {}) {
  const gBus = KERNEL.bus;

  let _params = {
    pitch:    config.pitch    || 45,   /* MIDI note */
    cutoff:   config.cutoff   || 300,
    res:      config.res      || 6,
    env:      config.env      || 0.4,  /* env amount */
    decay:    config.decay    || 0.3,
    accent:   config.accent   || false,
    glide:    config.glide    || false,
    wave:     config.wave     || 'sawtooth',
  };

  let _lastFreq = null;

  function _midiToHz(note) {
    return 440 * Math.pow(2, (note - 69) / 12);
  }

  function _trigger(vel = 1) {
    const AC   = audio.boot();
    const t    = AC.currentTime + 0.01;
    const freq = _midiToHz(_params.pitch);
    const accentMult = _params.accent ? 1.4 : 1.0;
    const decay = _params.decay * (1 + (_params.accent ? 0.5 : 0));

    const o  = AC.createOscillator(); o.type = _params.wave;
    const f  = AC.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = _params.res;
    const g  = AC.createGain();

    /* Glide from last frequency */
    if (_params.glide && _lastFreq) {
      o.frequency.setValueAtTime(_lastFreq, t);
      o.frequency.exponentialRampToValueAtTime(freq, t + 0.08);
    } else {
      o.frequency.value = freq;
    }
    _lastFreq = freq;

    /* Filter envelope */
    const envCutoff = _params.cutoff * (1 + _params.env * 8);
    f.frequency.setValueAtTime(envCutoff * accentMult, t);
    f.frequency.exponentialRampToValueAtTime(_params.cutoff, t + decay);

    /* Amplitude */
    g.gain.setValueAtTime(vel * 0.85 * accentMult, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + decay + 0.04);

    o.connect(f); f.connect(g); audio.send(g, true, false, true);
    o.start(t); o.stop(t + decay + 0.06);

    sBus.publish('org:triggered', { freq, vel, accent: _params.accent });
    gBus.publish('audio:signal', { instanceId, source: 'acid-synth' });
  }

  function _syncUI() {
    sBus.publish('org:state_sync', { params: { ..._params } });
  }

  const _unsubs = [
    gBus.subscribe('ui:acid_trigger:' + instanceId, ({ vel }) => _trigger(vel || 1)),
    gBus.subscribe('ui:config_change:' + instanceId, ({ key, value }) => {
      if (key in _params) _params[key] = value;
    }),
    gBus.subscribe('pad:trigger', ({ sound }) => { if (sound === 'acid') _trigger(0.88); }),
  ];

  _syncUI();

  KERNEL.registry.register({
    instanceId,
    id:       'eravos.acid-synth',
    label:    'Acid Synth',
    provides: ['capability.audio_out'],
    requires: ['capability.audio_context'],
    permissions: ['audio_out', 'bus_publish', 'bus_subscribe'],
    hooks: [
      { hook_id: 'acid.hook.trig_in',   direction: 'in',  event_type: 'pad:trigger',  contract_version: '1.0.0' },
      { hook_id: 'acid.hook.audio_out', direction: 'out', event_type: 'audio:signal', contract_version: '1.0.0' },
    ],
  });

  return {
    unmount() { _unsubs.forEach(u => u()); KERNEL.registry.unregister(instanceId); },
    trigger: _trigger,
    get params() { return { ..._params }; },
  };
}

return { mount };
})();
