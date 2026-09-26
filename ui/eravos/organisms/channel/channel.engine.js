/* ═══════════════════════════════════════════════════════════
   ORGANISM: CHANNEL STRIP  v1.0.0
   id: eravos.channel

   Receives audio:signal events on the bus, applies
   gain, pan, mute, solo. Routes to master output.
   Publishes metering data for UI VU meter animation.
   ═══════════════════════════════════════════════════════════ */

window.ChannelEngine = (() => {
'use strict';

function mount(instanceId, sBus, audio, config = {}) {
  const gBus = KERNEL.bus;

  let _params = {
    gain:    config.gain    || 1.0,
    pan:     config.pan     || 0,
    sendRev: config.sendRev || 0.2,
    sendDel: config.sendDel || 0.0,
    mute:    config.mute    || false,
    solo:    config.solo    || false,
    name:    config.name    || 'CHANNEL',
  };

  let _level    = 0;
  let _peakHold = 0;
  let _peakTimer= null;

  /* Build audio graph when AC is ready */
  let _gainNode = null;
  let _panNode  = null;

  function _ensureGraph() {
    if (_gainNode) return;
    const AC = audio.boot();
    _gainNode = AC.createGain(); _gainNode.gain.value = _params.mute ? 0 : _params.gain;
    _panNode  = AC.createStereoPanner ? AC.createStereoPanner() : AC.createPanner();
    if (_panNode.pan) _panNode.pan.value = _params.pan;
    _gainNode.connect(_panNode); _panNode.connect(AC.destination);
  }

  /* Metering — simulated from level updates */
  const _meterInterval = setInterval(() => {
    _level = Math.max(0, _level - 0.04);
    if (_level > _peakHold) {
      _peakHold = _level;
      clearTimeout(_peakTimer);
      _peakTimer = setTimeout(() => { _peakHold = 0; }, 1800);
    }
    sBus.publish('org:meter', { level: _level, peak: _peakHold });
  }, 33);

  function _updateGain() {
    if (!_gainNode) return;
    const target = _params.mute ? 0 : _params.gain;
    _gainNode.gain.setTargetAtTime(target, audio.AC?.currentTime || 0, 0.02);
  }

  function _syncUI() {
    sBus.publish('org:state_sync', { params: { ..._params } });
  }

  const _unsubs = [
    gBus.subscribe('ui:config_change:' + instanceId, ({ key, value }) => {
      if (key in _params) _params[key] = value;
      if (key === 'gain' || key === 'mute') _updateGain();
      if (key === 'pan' && _panNode?.pan) _panNode.pan.setTargetAtTime(value, audio.AC?.currentTime || 0, 0.02);
    }),

    /* Receive audio signals from other organisms and meter them */
    gBus.subscribe('audio:signal', ({ source }) => {
      _ensureGraph();
      _level = Math.min(1, _level + 0.15 + Math.random() * 0.1);
    }),
  ];

  _syncUI();

  KERNEL.registry.register({
    instanceId,
    id:       'eravos.channel',
    label:    _params.name,
    provides: ['capability.channel_strip'],
    requires: [],
    permissions: ['audio_out', 'audio_in', 'bus_publish', 'bus_subscribe'],
    hooks: [
      { hook_id: 'ch.hook.audio_in',  direction: 'in',  event_type: 'audio:signal', contract_version: '1.0.0' },
      { hook_id: 'ch.hook.bus_out',   direction: 'out', event_type: 'bus:send',     contract_version: '1.0.0' },
    ],
  });

  return {
    unmount() {
      clearInterval(_meterInterval);
      clearTimeout(_peakTimer);
      _unsubs.forEach(u => u());
      if (_gainNode) { try { _gainNode.disconnect(); _panNode.disconnect(); } catch(e){} }
      KERNEL.registry.unregister(instanceId);
    },
    get params() { return { ..._params }; },
  };
}

return { mount };
})();
