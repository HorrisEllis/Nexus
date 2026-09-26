/* ═══════════════════════════════════════════════════════════
   MOD: SERIAL BRIDGE  v1.0.0
   id: eravos.serial-bridge

   Real hardware I/O via the Web Serial API. Connects to a
   GRBL/Arduino/stepper-controller style device over USB-serial.
   Other mods can wire into this one (via the wire system)
   so their bus output drives physical hardware:
     mod:xy        → mapMode 'xy_to_gcode'    → streamed G-code moves
     pad:trigger   → mapMode 'trigger_to_line'→ one line per trigger
   Incoming bytes are parsed into lines and republished as
   'serial:rx' so any mod can react to device telemetry.

   Requires a Chromium-based browser and a direct user click to
   request the port — this cannot be done programmatically.
   ═══════════════════════════════════════════════════════════ */

window.SerialBridgeEngine = (() => {
'use strict';

function mount(instanceId, sBus, config = {}) {
  const gBus = KERNEL.bus;

  let _params = {
    baudRate:   config.baudRate   || 115200,
    lineEnding: config.lineEnding || '\n',
    mapMode:    config.mapMode    || 'off',
  };

  let _port      = null;
  let _writer    = null;
  let _reader    = null;
  let _connected = false;
  let _rxBuf     = '';
  let _readLoopStop = false;

  function supported() {
    return typeof navigator !== 'undefined' && !!navigator.serial;
  }

  async function connect() {
    if (!supported()) {
      sBus.publish('org:error', { message: 'Web Serial is not available in this browser (needs Chrome/Edge/Opera).' });
      return false;
    }
    try {
      _port = await navigator.serial.requestPort();
      await _port.open({ baudRate: _params.baudRate });
      _writer = _port.writable.getWriter();
      _connected = true;
      _readLoopStop = false;
      sBus.publish('org:connected', { baudRate: _params.baudRate });
      _readLoop();
      return true;
    } catch (err) {
      sBus.publish('org:error', { message: 'Connection failed or cancelled: ' + err.message });
      return false;
    }
  }

  async function _readLoop() {
    const decoder = new TextDecoderStream();
    const readable = _port.readable.pipeThrough(decoder);
    _reader = readable.getReader();
    try {
      while (!_readLoopStop) {
        const { value, done } = await _reader.read();
        if (done) break;
        if (value) {
          _rxBuf += value;
          let idx;
          while ((idx = _rxBuf.indexOf('\n')) >= 0) {
            const line = _rxBuf.slice(0, idx).replace(/\r$/, '');
            _rxBuf = _rxBuf.slice(idx + 1);
            if (line.length) {
              gBus.publish('serial:rx', { instanceId, line });
              sBus.publish('org:rx', { line });
            }
          }
        }
      }
    } catch (err) {
      sBus.publish('org:error', { message: 'Read error: ' + err.message });
    }
  }

  async function send(line) {
    if (!_connected || !_writer) {
      sBus.publish('org:error', { message: 'Not connected — click CONNECT and choose a port first.' });
      return;
    }
    const encoder = new TextEncoder();
    await _writer.write(encoder.encode(line + _params.lineEnding));
    sBus.publish('org:tx', { line });
  }

  async function disconnect() {
    _readLoopStop = true;
    try { if (_reader) { await _reader.cancel(); _reader.releaseLock(); } } catch (e) {}
    try { if (_writer) { _writer.releaseLock(); } } catch (e) {}
    try { if (_port)   { await _port.close(); } } catch (e) {}
    _connected = false;
    sBus.publish('org:disconnected', {});
  }

  /* Map an XY pad value (0..1, 0..1) into a bounded G-code jog move.
     Kept intentionally simple/general — a real rig would customize
     bounds per its own travel limits via config. */
  function _xyToGcode(x, y) {
    const maxTravel = config.travelMM || 100;
    const gx = (x * maxTravel).toFixed(2);
    const gy = (y * maxTravel).toFixed(2);
    return `G1 X${gx} Y${gy} F${config.feedRate || 3000}`;
  }

  function _updateParam(key, val) { if (key in _params) _params[key] = val; }

  function _syncUI() {
    sBus.publish('org:state_sync', { connected: _connected, params: { ..._params }, supported: supported() });
  }

  const _unsubs = [
    gBus.subscribe('ui:serial_connect:'    + instanceId, connect),
    gBus.subscribe('ui:serial_disconnect:' + instanceId, disconnect),
    gBus.subscribe('ui:serial_send:'       + instanceId, ({ line }) => send(line)),
    gBus.subscribe('ui:config_change:'     + instanceId, ({ key, value }) => _updateParam(key, value)),
    gBus.subscribe('mod:xy', ({ x, y }) => { if (_params.mapMode === 'xy_to_gcode' && _connected) send(_xyToGcode(x, y)); }),
    gBus.subscribe('pad:trigger', ({ sound }) => {
      if (_params.mapMode === 'trigger_to_line' && _connected) send(config.triggerLine || `M/${sound}`);
    }),
  ];

  _syncUI();

  KERNEL.registry.register({
    instanceId,
    id:       'eravos.serial-bridge',
    label:    'Serial Bridge',
    provides: ['capability.serial_io', 'capability.hardware_control'],
    requires: [],
    permissions: ['serial_access', 'bus_publish', 'bus_subscribe'],
    hooks: [
      { hook_id: 'serial.hook.data_in', direction: 'in',  event_type: 'mod:xy',      contract_version: '1.0.0' },
      { hook_id: 'serial.hook.trig_in', direction: 'in',  event_type: 'pad:trigger', contract_version: '1.0.0' },
      { hook_id: 'serial.hook.rx_out',  direction: 'out', event_type: 'serial:rx',   contract_version: '1.0.0' },
    ],
  });

  return {
    unmount() { disconnect(); _unsubs.forEach(u => u()); KERNEL.registry.unregister(instanceId); },
    connect, disconnect, send, supported,
    get connected() { return _connected; },
    get params()    { return { ..._params }; },
  };
}

return { mount };
})();
