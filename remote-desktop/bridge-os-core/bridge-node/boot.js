'use strict';
/**
 * bridge-node/boot.js — CORE build
 *
 * Everything MANIFEST.json marks "vital": true, and nothing else.
 * Cut vs the full boot.js: bridge-integrity, bridge-cobalt, bridge-nat,
 * bridge-plugin (WS gateway), bridge-mesh/trust-mesh, bridge-causal,
 * bridge-dht, bridge-pipeline, network-identity, and every tryRequire'd
 * soft module (routing/gateway/magnet/bayesian/sovereign-vote). None of
 * those are dependencies of the vital 7 — they're additive subsystems the
 * original boot.js wires in alongside them, not underneath them.
 *
 * Phase numbers below match MANIFEST.json's boot.phases so this core build
 * stays a legible subset of the original, not a fork with its own numbering.
 */

const path = require('path');

const { loadOrInit }             = require('../bridge-identity/index');
const { createBus }              = require('../bridge-core/bus');
const { createNodeRegistry }     = require('../bridge-core/registry/index');
const { createIME }              = require('../bridge-IME/index');
const { createSNGate }           = require('../bridge-sngate/index');
const { createDataBus }          = require('../bridge-data/index');
const { createHeartbeatManager } = require('../bridge-heartbeat/index');
const { validate }               = require('../bridge-contracts/index');

const VERSION = '1.2.0-core';

const DEFAULT_CFG = {
  port:      Number(process.env.NEXUS_PORT) || 3747,
  bindHost:  process.env.NEXUS_BIND_HOST    || '0.0.0.0',
  dataDir:   process.env.NEXUS_DATA_DIR     || path.join(process.cwd(), 'data'),
  groupHint: process.env.NEXUS_GROUP        || null,
  logLevel:  process.env.NEXUS_LOG          || 'INFO',
};

const R='\x1b[0m',B='\x1b[1m',DIM='\x1b[2m',GR='\x1b[92m',RD='\x1b[91m';
function printPhase(num, name, status, detail='') {
  const icon = status === 'ok' ? `${GR}✓${R}` : `${RD}✗${R}`;
  console.log(`  ${icon}  Phase ${String(num).padStart(2)}  ${name.padEnd(12)}  ${DIM}${detail}${R}`);
}

async function boot(userCfg = {}) {
  const config = { ...DEFAULT_CFG, ...userCfg };
  console.log(`\n  ${B}BRIDGE OS — CORE  v${VERSION}${R}`);
  console.log(`  ${DIM}identity · core · IME · sngate · data · heartbeat · contracts${R}\n`);

  // Phase 1 — identity
  let identity;
  try {
    identity = await loadOrInit({ dataDir: config.dataDir, groupHint: config.groupHint });
    validate('identity-to-IME', require('../bridge-identity/index'));
    printPhase(1, 'identity', 'ok', identity.uuid.slice(0, 8));
  } catch (e) { printPhase(1, 'identity', 'fail', e.message); throw e; }

  // Phase 2 — core (SISO bus scaffolding + node registry)
  let busRef = null;
  const deferredEmit = (sig, data, level) => busRef?.(sig, data, level);
  const nodeRegistry = createNodeRegistry({ busEmit: deferredEmit });
  printPhase(2, 'core', 'ok', 'registry + SISO');

  // Phase 3 — IME (behavioral memory / trust scoring)
  let ime;
  try {
    ime = createIME({ storeDir: path.join(config.dataDir, 'ime'), baselineMinEvents: 100 });
    printPhase(3, 'IME', 'ok', 'behavioral memory');
  } catch (e) { printPhase(3, 'IME', 'fail', e.message); throw e; }

  // Phase 4 — sngate (allow/deny/observe gate)
  let gate;
  try {
    gate = createSNGate({
      logDir:     path.join(config.dataDir, 'sngate-logs'),
      rulesPath:  path.join(config.dataDir, 'sngate-rules.json'),
    }, ime);
    validate('IME-to-sngate', ime);
    validate('sngate-to-adapters', gate);
    printPhase(4, 'sngate', 'ok', 'allow/deny/observe');
  } catch (e) { printPhase(4, 'sngate', 'fail', e.message); throw e; }

  // Phase 5 — bus + data (SISO bus live, intake pipeline)
  let bus, busEmit, dataBus;
  try {
    bus = createBus({ logLevel: config.logLevel, ime });
    busEmit = (sig, data, level = 'INFO') => bus.emit(sig, data, level);
    busRef = busEmit;
    ime.install({ busEmit });
    dataBus = createDataBus({ gate, ime, busEmit, deltaDir: path.join(config.dataDir, 'delta') });
    validate('data-to-sngate', dataBus);
    printPhase(5, 'bus+data', 'ok', 'SISO bus live');
  } catch (e) { printPhase(5, 'bus+data', 'fail', e.message); throw e; }

  // Phase 6 — heartbeat (BPM tracker, UDP pulse, liveness)
  let heartbeat;
  try {
    heartbeat = createHeartbeatManager({ busEmit, nodeRegistry });
    heartbeat.register(identity.uuid, `http://localhost:${config.port}/health`);
    printPhase(6, 'heartbeat', 'ok', 'BPM + UDP :7777');
  } catch (e) { printPhase(6, 'heartbeat', 'fail', e.message); throw e; }

  console.log(`\n  ${GR}●${R}  Core online — nexus://${identity.uuid.slice(0, 8)}\n`);

  return { identity, nodeRegistry, ime, gate, bus, busEmit, dataBus, heartbeat, config };
}

module.exports = { boot };
