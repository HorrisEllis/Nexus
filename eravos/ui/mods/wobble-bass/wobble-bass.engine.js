/* ═══════════════════════════════════════════════════════════
   MOD: WOBBLE BASS  v1.0.0
   id: eravos.wobble-bass

   Sawtooth oscillator through a fast LFO-swept resonant
   lowpass filter with distortion. Classic dubstep wobble.
   Triggered by pad:trigger(sound=wobble) or ui:fire.
   Continuous mode: runs until stopped.
   ═══════════════════════════════════════════════════════════ */

window.WobbleBassEngine = (() => {
'use strict';

function _dist(AC, amt) {
  const s = AC.createWaveShaper();
  const n = 256, c = new Float32Array(n), k = amt * 100;
  for (let i = 0; i < n; i++) { const x=(i*2)/n-1; c[i]=((Math.PI+k)*x)/(Math.PI+k*Math.abs(x)); }
  s.curve = c; s.oversample = '4x'; return s;
}

function mount(instanceId, sBus, audio, config = {}) {
  const gBus = KERNEL.bus;

  let _params = {
    freq:     config.freq     || 110,
    cutoff:   config.cutoff   || 600,
    res:      config.res      || 8,
    rate:     config.rate     || 4,
    depth:    config.depth    || 600,
    drive:    config.drive    || 0.4,
    waveform: config.waveform || 'sawtooth',
    active:   false,
  };

  let _nodes = null;

  function _start() {
    if (_nodes) _stop();
    const AC = audio.boot();

    const o1   = AC.createOscillator(); o1.type = _params.waveform; o1.frequency.value = _params.freq;
    const o2   = AC.createOscillator(); o2.type = _params.waveform; o2.frequency.value = _params.freq * 1.006;
    const lfo  = AC.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = _params.rate;
    const lfoG = AC.createGain(); lfoG.gain.value = _params.depth;
    const filt = AC.createBiquadFilter(); filt.type = 'lowpass';
    filt.frequency.value = _params.cutoff; filt.Q.value = _params.res;
    const dist = _dist(AC, _params.drive);
    const gain = AC.createGain(); gain.gain.value = 0.75;

    lfo.connect(lfoG); lfoG.connect(filt.frequency);
    o1.connect(dist); o2.connect(dist); dist.connect(filt); filt.connect(gain);
    audio.send(gain, false, false, true);

    [o1, o2, lfo].forEach(n => n.start());
    _nodes = { o1, o2, lfo, lfoG, filt, dist, gain };
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
    /* One-shot trigger — plays for 0.9s */
    const AC = audio.boot();
    const t = AC.currentTime + 0.01;
    const o = AC.createOscillator(); o.type = _params.waveform; o.frequency.value = _params.freq;
    const lfo = AC.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = _params.rate;
    const lG  = AC.createGain(); lG.gain.value = _params.depth;
    const f   = AC.createBiquadFilter(); f.type='lowpass'; f.frequency.value=_params.cutoff; f.Q.value=_params.res;
    const d   = _dist(AC, _params.drive);
    const g   = AC.createGain();
    lfo.connect(lG); lG.connect(f.frequency);
    o.connect(d); d.connect(f); f.connect(g); audio.send(g, true, false, true);
    g.gain.setValueAtTime(vel * 0.75, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    [o, lfo].forEach(n => n.start(t));
    [o, lfo].forEach(n => n.stop(t + 1));
  }

  function _updateParam(key, val) {
    _params[key] = val;
    if (!_nodes) return;
    const { o1, o2, lfo, lfoG, filt } = _nodes;
    if (key === 'freq')   { o1.frequency.setTargetAtTime(val, audio.AC.currentTime, 0.02); o2.frequency.setTargetAtTime(val*1.006, audio.AC.currentTime, 0.02); }
    if (key === 'cutoff') filt.frequency.setTargetAtTime(val, audio.AC.currentTime, 0.02);
    if (key === 'res')    filt.Q.setTargetAtTime(val, audio.AC.currentTime, 0.02);
    if (key === 'rate')   lfo.frequency.setTargetAtTime(val, audio.AC.currentTime, 0.02);
    if (key === 'depth')  lfoG.gain.setTargetAtTime(val, audio.AC.currentTime, 0.02);
  }

  function _syncUI() {
    sBus.publish('org:state_sync', { active: _params.active, params: { ..._params } });
  }

  const _unsubs = [
    gBus.subscribe('ui:wobble_toggle:' + instanceId, () => _params.active ? _stop() : _start()),
    gBus.subscribe('ui:wobble_trigger:' + instanceId, ({ vel }) => _trigger(vel || 1)),
    gBus.subscribe('ui:config_change:' + instanceId, ({ key, value }) => _updateParam(key, value)),
    gBus.subscribe('pad:trigger', ({ sound }) => { if (sound === 'wobble') _trigger(0.9); }),
  ];

  _syncUI();

  KERNEL.registry.register({
    instanceId,
    id:       'eravos.wobble-bass',
    label:    'Wobble Bass',
    provides: ['capability.audio_out'],
    requires: ['capability.audio_context'],
    permissions: ['audio_out', 'bus_publish', 'bus_subscribe'],
    hooks: [
      { hook_id: 'wobble.hook.trig_in',  direction: 'in',  event_type: 'pad:trigger',    contract_version: '1.0.0' },
      { hook_id: 'wobble.hook.audio_out',direction: 'out', event_type: 'audio:signal',   contract_version: '1.0.0' },
    ],
  });

  return {
    unmount() { _stop(); _unsubs.forEach(u => u()); KERNEL.registry.unregister(instanceId); },
    start: _start, stop: _stop, trigger: _trigger,
  };
}

return { mount };
})();
