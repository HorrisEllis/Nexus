/* ═══════════════════════════════════════════════════════════
   ORGANISM: XY CONTROLLER  v1.0.0
   id: eravos.xy-pad

   Two-dimensional modulation surface.
   Broadcasts mod:xy on bus with x, y, xDest, yDest.
   Other organisms subscribe to mod:xy and route the value
   to whichever parameter is declared as the destination.
   Leaves a fading trail in the UI.
   ═══════════════════════════════════════════════════════════ */

window.XYPadEngine = (() => {
'use strict';

function mount(instanceId, sBus, audio, config = {}) {
  const gBus = KERNEL.bus;

  let _params = {
    x:     config.x     || 0.5,
    y:     config.y     || 0.5,
    xDest: config.xDest || 'cutoff',
    yDest: config.yDest || 'depth',
    snapCenter: config.snapCenter || false,
  };

  /* Publish trail for UI — last N positions */
  const _trail = [];
  const TRAIL_MAX = 24;

  function _move(x, y) {
    _params.x = Math.max(0, Math.min(1, x));
    _params.y = Math.max(0, Math.min(1, y));

    _trail.push({ x: _params.x, y: _params.y, t: Date.now() });
    if (_trail.length > TRAIL_MAX) _trail.shift();

    /* Broadcast modulation */
    gBus.publish('mod:xy', {
      instanceId,
      x:     _params.x,
      y:     _params.y,
      xDest: _params.xDest,
      yDest: _params.yDest,
    });

    sBus.publish('org:xy_update', {
      x:     _params.x,
      y:     _params.y,
      trail: _trail.slice(),
    });
  }

  function _release() {
    if (!_params.snapCenter) return;
    _move(0.5, 0.5);
  }

  function _syncUI() {
    sBus.publish('org:state_sync', {
      params: { ..._params },
      x: _params.x,
      y: _params.y,
    });
  }

  const _unsubs = [
    gBus.subscribe('ui:xy_move:' + instanceId, ({ x, y }) => _move(x, y)),
    gBus.subscribe('ui:xy_release:' + instanceId, _release),
    gBus.subscribe('ui:config_change:' + instanceId, ({ key, value }) => {
      if (key in _params) _params[key] = value;
    }),
  ];

  _syncUI();

  KERNEL.registry.register({
    instanceId,
    id:       'eravos.xy-pad',
    label:    'XY Controller',
    provides: ['capability.mod_signal'],
    requires: [],
    permissions: ['bus_publish', 'bus_subscribe'],
    hooks: [
      { hook_id: 'xy.hook.mod_out', direction: 'out', event_type: 'mod:xy', contract_version: '1.0.0' },
    ],
  });

  return {
    unmount() { _unsubs.forEach(u => u()); KERNEL.registry.unregister(instanceId); },
    move: _move, release: _release,
    get params() { return { ..._params }; },
    get trail() { return _trail.slice(); },
  };
}

return { mount };
})();
