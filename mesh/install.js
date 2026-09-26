'use strict';
// mesh/install.js — wires the ported mesh modules together.
// UUID: nexus-mesh-install-v1-0000-4700-0000-000000000002
//
// Rebuilt from BrainOS's nexus-bridge-modules.js (v1.0.0,
// bridge-modules-wire-v1000-0000-000000000001) for nexus:
//
//   §BUS — BrainOS wired every module's connectBus() to its own
//   standalone bus.js (a second, parallel Event→Gate→Stream implementation
//   of the exact same SISO pattern guardian's `bus` already is —
//   guardian/server.js's SISOStream). That duplicate was NOT ported (see
//   mesh/README.md). Every module below is instead connected to guardian's
//   real bus, passed in at install() time. Each module's own connectBus()
//   already takes a plain (type, data, level) function — SISOStream.emit's
//   (type, data) signature is call-compatible; the extra `level` argument
//   a module passes is simply ignored by nexus's bus, same as it would be
//   by any other 2-arg listener.
//
//   §DATA DIR — BrainOS persisted under its own ./data/ next to the bridge
//   server. Ported modules persist under nexus's data/mesh/ instead (see
//   mesh/config.js), matching every other nexus subsystem's data/<name>/
//   convention (data/guardian/, data/cortex/, etc.).
//
//   §NOT PORTED — BrainOS's agent-factory.js, agent-registry.js,
//   intent-parser.js, intent-router.js, intent-scoring.js, routing-engine.js,
//   workflow-engine.js, account-manager.js, delta.js, router.js, adapters.js
//   are BrainOS's own provider/agent orchestration layer. nexus already has
//   an equivalent — larger and more developed — in lib/intent-classifier.js,
//   guardian/lib/jobs.js, the RAID pipeline (cortex/core/raid/*), and
//   orchestrator/. Porting BrainOS's version would mean two competing
//   orchestration layers in the same codebase; see mesh/README.md for the
//   full breakdown of what was left out and why.

const fs   = require('fs');
const path = require('path');
const config = require('./config');

let _snr      = null;
let _keys     = null;
let _hosts    = null;
let _ports    = null;
let _canvas   = null;
let _engine   = null;
let _installed = false;
let _bus      = () => {};

function loadModule(name, modulePath) {
  try {
    return require(modulePath);
  } catch (e) {
    console.error(`[mesh/install] Failed to load ${name}: ${e.message}`);
    return null;
  }
}

// ─── INSTALL ────────────────────────────────────────────────────────────────
// install(bus, opts?) — bus is guardian's real SISOStream instance (its
// .emit(type, data) is what every module's connectBus() gets bound to).
function install(bus, opts = {}) {
  if (_installed) return module.exports;
  _installed = true;
  _bus = (type, data, level) => { try { bus.emit(`mesh.${type}`, { ...data, level }); } catch (_) {} };

  const dataDir = opts.dataDir || config.DATA_DIR;
  fs.mkdirSync(dataDir, { recursive: true });

  // ── Crypto Engine (no persistence, just primitives) ───────────────────────
  const CryptoModule = loadModule('crypto-engine', path.join(__dirname, 'lib', 'crypto-engine.js'));
  if (CryptoModule) {
    _engine = CryptoModule.CryptoEngine ? new CryptoModule.CryptoEngine() : CryptoModule;
    const h = _engine.health?.();
    if (!h?.allOk) console.warn('[mesh/install] CryptoEngine partial:', h?.checks);
  }

  // ── SNR Filter (mesh-scoped — distinct from cortex/core/raid/snr-filter.js,
  //    which gates RAID call resolution; this one is a general rule/blocklist
  //    gate: ublock/DNS-firewall/AV-list imports, used by the DNS/firewall
  //    daemons below) ─────────────────────────────────────────────────────────
  const SNRFilter = loadModule('mesh-snr-filter', path.join(__dirname, 'lib', 'mesh-snr-filter.js'));
  if (SNRFilter) {
    _snr = new SNRFilter({
      name:    'Mesh SNR Gate',
      persist: path.join(dataDir, 'snr-rules.json'),
      logFile: path.join(dataDir, 'snr-decisions.jsonl'),
    });
    _snr.connectBus(_bus);
    if (SNRFilter.PRESETS?.security) SNRFilter.PRESETS.security(_snr);
  }

  // ── Key Manager ─────────────────────────────────────────────────────────────
  const KeyManager = loadModule('key-manager', path.join(__dirname, 'lib', 'key-manager.js'));
  if (KeyManager) {
    _keys = new KeyManager({
      name:         'Mesh Key Manager',
      persist:      path.join(dataDir, 'canvas-keys.json'),
      cryptoEngine: _engine || null,
      intervals:    config.KEY_INTERVALS,
    });
    _keys.connectBus(_bus);
    _keys.startAllSchedules();
  }

  // ── Host Rotation ────────────────────────────────────────────────────────────
  const HostRotation = loadModule('host-rotation', path.join(__dirname, 'lib', 'host-rotation.js'));
  if (HostRotation) {
    _hosts = new HostRotation({
      name:    'Mesh Host Rotation',
      persist: path.join(dataDir, 'canvas-hosts.json'),
    });
    _hosts.connectBus(_bus);
  }

  // ── Port Registry ────────────────────────────────────────────────────────────
  const PortRegistry = loadModule('port-registry', path.join(__dirname, 'lib', 'port-registry.js'));
  if (PortRegistry) {
    _ports = new PortRegistry({
      name:     'Mesh Port Registry',
      persist:  path.join(dataDir, 'canvas-ports.json'),
      defaults: true,
    });
    _ports.connectBus(_bus);
  }

  // ── Canvas Persistence ────────────────────────────────────────────────────────
  const CanvasPersist = loadModule('canvas-persistence', path.join(__dirname, 'lib', 'canvas-persistence.js'));
  if (CanvasPersist) {
    CanvasPersist.install(dataDir, _bus, opts.saveCfg || (() => {}));
    _canvas = CanvasPersist;
  }

  bus.emit('mesh.ready', {
    snr: !!_snr, keys: !!_keys, hosts: !!_hosts, ports: !!_ports,
    canvas: !!_canvas, engine: !!_engine,
  });

  return module.exports;
}

module.exports = {
  install,
  get snr()    { return _snr;    },
  get keys()   { return _keys;   },
  get hosts()  { return _hosts;  },
  get ports()  { return _ports;  },
  get canvas() { return _canvas; },
  get engine() { return _engine; },
  get installed() { return _installed; },
  VERSION: '1.0.0',
  UUID:    'nexus-mesh-install-v1-0000-4700-0000-000000000002',
};
