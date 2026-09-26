/* ═══════════════════════════════════════════════════════════
   MOD: MASTER FX  v1.0.0
   id: eravos.master-fx

   Control surface for KERNEL.audio's shared send buses.
   Every voice mod that calls audio.send(node, withReverb,
   withDelay, withComp) reaches this bus — turning these knobs
   changes the reverb/delay/compressor for the whole mix at once.
   ═══════════════════════════════════════════════════════════ */

window.MasterFXEngine = (() => {
'use strict';

function mount(instanceId, sBus, audio, config = {}) {
  const gBus = KERNEL.bus;

  let _params = {
    reverbMix:   config.reverbMix   != null ? config.reverbMix   : 0.35,
    reverbTime:  config.reverbTime  != null ? config.reverbTime  : 2.4,
    reverbDecay: config.reverbDecay != null ? config.reverbDecay : 3.2,
    delayMix:    config.delayMix    != null ? config.delayMix    : 0.28,
    delayTime:   config.delayTime   != null ? config.delayTime   : 0.32,
    delayFB:     config.delayFB     != null ? config.delayFB     : 0.35,
    compThresh:  config.compThresh  != null ? config.compThresh  : -24,
    compRatio:   config.compRatio   != null ? config.compRatio   : 12,
  };

  function _apply(key, val) {
    _params[key] = val;
    audio.boot();
    switch (key) {
      case 'reverbMix':   audio.setReverb({ mix: val }); break;
      case 'reverbTime':  audio.setReverb({ time: val, decay: _params.reverbDecay }); break;
      case 'reverbDecay': audio.setReverb({ time: _params.reverbTime, decay: val }); break;
      case 'delayMix':    audio.setDelay({ mix: val }); break;
      case 'delayTime':   audio.setDelay({ time: val }); break;
      case 'delayFB':     audio.setDelay({ feedback: val }); break;
      case 'compThresh':  audio.setCompressor({ threshold: val }); break;
      case 'compRatio':   audio.setCompressor({ ratio: val }); break;
    }
  }

  function _applyAll() {
    audio.boot();
    audio.setReverb({ mix: _params.reverbMix, time: _params.reverbTime, decay: _params.reverbDecay });
    audio.setDelay({ mix: _params.delayMix, time: _params.delayTime, feedback: _params.delayFB });
    audio.setCompressor({ threshold: _params.compThresh, ratio: _params.compRatio });
  }

  function _syncUI() {
    sBus.publish('org:state_sync', { params: { ..._params } });
  }

  const _unsubs = [
    gBus.subscribe('ui:config_change:' + instanceId, ({ key, value }) => _apply(key, value)),
  ];

  _applyAll();
  _syncUI();

  KERNEL.registry.register({
    instanceId,
    id:       'eravos.master-fx',
    label:    'Master FX',
    provides: ['capability.master_fx_control'],
    requires: ['capability.audio_context'],
    permissions: ['audio_out', 'bus_publish', 'bus_subscribe'],
    hooks: [],
  });

  return {
    unmount() { _unsubs.forEach(u => u()); KERNEL.registry.unregister(instanceId); },
    get params() { return { ..._params }; },
  };
}

return { mount };
})();
