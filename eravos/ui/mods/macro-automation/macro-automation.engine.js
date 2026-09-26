/* ═══════════════════════════════════════════════════════════
   MOD: MACRO AUTOMATION  v1.0.0
   id: eravos.macro-automation

   In-app parameter automation. While armed, listens to
   'ui:config_change:<targetInstanceId>' events destined for a
   chosen mod and records { key, value, tMs }. On playback,
   re-publishes those same events at the same relative offsets —
   a real automation lane, not a demo: it genuinely drives the
   target mod's knobs over time.
   ═══════════════════════════════════════════════════════════ */

window.MacroAutomationEngine = (() => {
'use strict';

function mount(instanceId, sBus, config = {}) {
  const gBus = KERNEL.bus;

  let _params = {
    targetInstanceId: config.targetInstanceId || null,
    loop:  config.loop !== false,
    speed: config.speed || 1,
  };

  let _recording  = false;
  let _playing    = false;
  let _events     = [];   /* { key, value, tMs } relative to record start */
  let _recStartAt = 0;
  let _playTimers = [];
  let _targetSub  = null;

  function _clearTargetSub() { if (_targetSub) { _targetSub(); _targetSub = null; } }

  function setTarget(id) {
    _params.targetInstanceId = id;
    _clearTargetSub();
    if (!id) return;
    _targetSub = gBus.subscribe('ui:config_change:' + id, ({ key, value }) => {
      if (!_recording) return;
      _events.push({ key, value, tMs: performance.now() - _recStartAt });
    });
  }

  function arm() {
    if (!_params.targetInstanceId) { sBus.publish('org:error', { message: 'Pick a target mod first.' }); return; }
    _events = [];
    _recStartAt = performance.now();
    _recording = true;
    sBus.publish('org:state_sync', { recording: true, playing: _playing, count: 0 });
  }

  function stopRecording() {
    _recording = false;
    sBus.publish('org:state_sync', { recording: false, playing: _playing, count: _events.length });
  }

  function _clearPlayTimers() { _playTimers.forEach(t => clearTimeout(t)); _playTimers = []; }

  function play() {
    if (!_params.targetInstanceId || !_events.length) return;
    _clearPlayTimers();
    _playing = true;
    const targetTopic = 'ui:config_change:' + _params.targetInstanceId;
    const duration = _events[_events.length - 1].tMs / _params.speed;

    _events.forEach(ev => {
      const t = ev.tMs / _params.speed;
      _playTimers.push(setTimeout(() => {
        gBus.publish(targetTopic, { key: ev.key, value: ev.value });
        sBus.publish('org:step', { key: ev.key, value: ev.value });
      }, t));
    });

    _playTimers.push(setTimeout(() => {
      if (_params.loop) { play(); } else { _playing = false; sBus.publish('org:state_sync', { recording: false, playing: false, count: _events.length }); }
    }, duration + 20));

    sBus.publish('org:state_sync', { recording: false, playing: true, count: _events.length });
  }

  function stopPlayback() {
    _clearPlayTimers();
    _playing = false;
    sBus.publish('org:state_sync', { recording: _recording, playing: false, count: _events.length });
  }

  function clearMacro() {
    _events = [];
    sBus.publish('org:state_sync', { recording: _recording, playing: _playing, count: 0 });
  }

  function _updateParam(key, val) {
    if (key === 'targetInstanceId') { setTarget(val); return; }
    if (key in _params) _params[key] = val;
  }

  const _unsubs = [
    gBus.subscribe('ui:macro_arm:'    + instanceId, arm),
    gBus.subscribe('ui:macro_stop_rec:' + instanceId, stopRecording),
    gBus.subscribe('ui:macro_play:'   + instanceId, play),
    gBus.subscribe('ui:macro_stop:'   + instanceId, stopPlayback),
    gBus.subscribe('ui:macro_clear:'  + instanceId, clearMacro),
    gBus.subscribe('ui:config_change:' + instanceId, ({ key, value }) => _updateParam(key, value)),
  ];

  if (_params.targetInstanceId) setTarget(_params.targetInstanceId);
  sBus.publish('org:state_sync', { recording: false, playing: false, count: 0 });

  KERNEL.registry.register({
    instanceId,
    id:       'eravos.macro-automation',
    label:    'Macro Automation',
    provides: ['capability.automation_record', 'capability.automation_playback'],
    requires: [],
    permissions: ['bus_publish', 'bus_subscribe'],
    hooks: [
      { hook_id: 'macro.hook.drive_out', direction: 'out', event_type: 'ui:config_change', contract_version: '1.0.0' },
    ],
  });

  return {
    unmount() { _clearPlayTimers(); _clearTargetSub(); _unsubs.forEach(u => u()); KERNEL.registry.unregister(instanceId); },
    setTarget, arm, stopRecording, play, stopPlayback, clearMacro,
    get events() { return _events.slice(); },
    get params() { return { ..._params }; },
  };
}

return { mount };
})();
