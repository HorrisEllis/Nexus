/* ═══════════════════════════════════════════════════════════
   MOD: SIDECHAIN COMPRESSOR  v1.0.0
   id: eravos.sidechain-compressor

   A control mod, not a voice — it has no sound of its own.
   Ducks KERNEL.audio's master gain node every time the chosen
   source sound fires on the bus. Fast attack down, exponential
   release back up to unity: the classic EDM "pump".
   ═══════════════════════════════════════════════════════════ */

window.SidechainCompressorEngine = (() => {
'use strict';

function mount(instanceId, sBus, audio, config = {}) {
  const gBus = KERNEL.bus;

  let _params = {
    source:  config.source  || 'kick',
    amount:  config.amount != null ? config.amount : 0.7,
    attack:  config.attack != null ? config.attack : 0.005,
    release: config.release || 0.28,
    enabled: config.enabled !== false,
  };

  let _pumpCount = 0;

  function _duck() {
    if (!_params.enabled) return;
    const AC = audio.boot();
    const master = audio.masterGainNode;
    if (!master) return;
    const now = AC.currentTime;
    const base = 0.88; /* kernel's default master gain level */
    const floor = base * (1 - _params.amount);

    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(floor, now + _params.attack);
    master.gain.exponentialRampToValueAtTime(Math.max(0.001, base), now + _params.attack + _params.release);

    _pumpCount++;
    sBus.publish('org:pumped', { count: _pumpCount });
  }

  function _updateParam(key, val) {
    _params[key] = val;
  }

  function _syncUI() {
    sBus.publish('org:state_sync', { params: { ..._params } });
  }

  const _unsubs = [
    gBus.subscribe('pad:trigger', ({ sound }) => { if (sound === _params.source) _duck(); }),
    gBus.subscribe('ui:sidechain_test:'  + instanceId, _duck),
    gBus.subscribe('ui:config_change:'   + instanceId, ({ key, value }) => _updateParam(key, value)),
  ];

  _syncUI();

  KERNEL.registry.register({
    instanceId,
    id:       'eravos.sidechain-compressor',
    label:    'Sidechain',
    provides: ['capability.sidechain_duck'],
    requires: ['capability.audio_context'],
    permissions: ['audio_out', 'bus_publish', 'bus_subscribe'],
    hooks: [
      { hook_id: 'sidechain.hook.trig_in', direction: 'in', event_type: 'pad:trigger', contract_version: '1.0.0' },
    ],
  });

  return {
    unmount() { _unsubs.forEach(u => u()); KERNEL.registry.unregister(instanceId); },
    duck: _duck,
    get params() { return { ..._params }; },
  };
}

return { mount };
})();
