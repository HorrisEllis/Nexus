/* ═══════════════════════════════════════════════════════════
   MOD: LFO  v1.0.0
   id: eravos.lfo

   Generates a continuous low-frequency modulation signal.
   Publishes mod:signal on the bus every animation frame.
   Other mods can subscribe to mod:signal and apply
   the value to any parameter.

   Shapes: sine, triangle, square, sawtooth, S&H (random)
   ═══════════════════════════════════════════════════════════ */

window.LFOEngine = (() => {
'use strict';

function mount(instanceId, sBus, audio, config = {}) {
  const gBus = KERNEL.bus;

  let _params = {
    shape:   config.shape   || 'sine',
    rate:    config.rate    || 4,      /* Hz */
    depth:   config.depth   || 0.5,   /* 0-1 */
    phase:   config.phase   || 0,     /* degrees */
    bipolar: config.bipolar !== false, /* true = -1 to 1, false = 0 to 1 */
    sync:    config.sync    || false,  /* sync to BPM */
    xDest:   config.xDest   || 'cutoff',
    yDest:   config.yDest   || 'depth',
  };

  let _running  = false;
  let _phase    = (_params.phase / 360) * Math.PI * 2;
  let _shValue  = 0; /* S&H hold value */
  let _rafId    = null;
  let _lastTime = 0;

  function _compute(dt) {
    const rate = _params.sync
      ? (KERNEL.clock.BPM / 60) * (_params.rate)
      : _params.rate;

    _phase += rate * Math.PI * 2 * dt;
    if (_phase > Math.PI * 2) {
      _phase -= Math.PI * 2;
      if (_params.shape === 'S&H') _shValue = Math.random() * 2 - 1;
    }

    let raw = 0;
    switch (_params.shape) {
      case 'sine':     raw = Math.sin(_phase); break;
      case 'triangle': raw = (2 / Math.PI) * Math.asin(Math.sin(_phase)); break;
      case 'square':   raw = Math.sign(Math.sin(_phase)); break;
      case 'sawtooth': raw = (_phase / Math.PI) - 1; break;
      case 'S&H':      raw = _shValue; break;
      default:         raw = Math.sin(_phase);
    }

    const value = _params.bipolar
      ? raw * _params.depth
      : (raw * 0.5 + 0.5) * _params.depth;

    return { value, phase: _phase, raw };
  }

  function _tick(timestamp) {
    if (!_running) return;
    const dt = _lastTime ? Math.min((timestamp - _lastTime) / 1000, 0.05) : 0;
    _lastTime = timestamp;

    const { value, phase, raw } = _compute(dt);

    /* Publish scoped — for UI visualisation */
    sBus.publish('org:lfo_tick', { value, phase, raw, shape: _params.shape, depth: _params.depth });

    /* Publish global — for other mods to modulate */
    gBus.publish('mod:signal', {
      instanceId,
      value,
      xDest: _params.xDest,
      yDest: _params.yDest,
    });

    _rafId = requestAnimationFrame(_tick);
  }

  function start() {
    if (_running) return;
    _running  = true;
    _lastTime = 0;
    _rafId    = requestAnimationFrame(_tick);
    sBus.publish('org:state_sync', { running: true, params: { ..._params } });
  }

  function stop() {
    _running = false;
    cancelAnimationFrame(_rafId);
    sBus.publish('org:state_sync', { running: false });
  }

  function _syncUI() {
    sBus.publish('org:state_sync', {
      running: _running,
      params:  { ..._params },
    });
  }

  const _unsubs = [
    gBus.subscribe('ui:lfo_toggle:' + instanceId, () => _running ? stop() : start()),
    gBus.subscribe('ui:config_change:' + instanceId, ({ key, value }) => {
      if (key in _params) _params[key] = value;
    }),
  ];

  _syncUI();

  KERNEL.registry.register({
    instanceId,
    id:       'eravos.lfo',
    label:    'LFO',
    provides: ['capability.lfo', 'capability.mod_signal'],
    requires: [],
    permissions: ['bus_publish', 'bus_subscribe'],
    hooks: [
      { hook_id: 'lfo.hook.mod_out', direction: 'out', event_type: 'mod:signal', contract_version: '1.0.0' },
    ],
  });

  return {
    unmount() {
      stop();
      _unsubs.forEach(u => u());
      KERNEL.registry.unregister(instanceId);
    },
    start, stop,
    get params() { return { ..._params }; },
  };
}

return { mount };
})();
