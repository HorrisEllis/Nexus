'use strict';
/**
 * bridge/index.js — Bridge Entry Point
 * UUID: nexus-bridge-index-v1-0000-4000-0000-000000000001
 * Status: pre-release
 *
 * Boots via BootSequence (lib/boot-sequence.js).
 * Wires identity → registry → ledger → router → server.
 * Registers with orchestrator. Starts pulse. Announces via nc.postBridge.
 *
 * Boot order (§3.1 bottom-up):
 *   Phase 0 SOFT  — register with orchestrator
 *   Phase 1 HARD  — open request ledger
 *   Phase 2 HARD  — init identity layer
 *   Phase 3 HARD  — init registry + start heartbeat polling
 *   Phase 4 HARD  — init router (wires ledger + registry)
 *   Phase 5 HARD  — start HTTP server :9999
 *   Phase 6 SOFT  — replay held requests from before crash
 *   Phase 7 SOFT  — announce boot to system
 *
 * §AXIOM boot order: bridge → cortex → guardian → idearium → emerge
 * Bridge must be first. Everything else handshakes into it.
 */

'use strict';

const path = require('path');
const nc   = require('../nexus-connect');

const { BootSequence }     = require('../lib/boot-sequence');
const { createBridgeLedger }   = require('./ledger');
const { createCFRLedger }      = require('../lib/cfr');
const { createBridgeIdentity } = require('./identity');
const { createBridgeRegistry } = require('./registry');
const { createBridgeRouter }   = require('./router');
const { createBridgeServer, BRIDGE_PORT } = require('./server');

const ROOT       = path.join(__dirname, '..');
const DATA_DIR   = path.join(ROOT, 'data', 'bridge');
const LEDGER_DIR = process.env.BRIDGE_LEDGER_DIR || path.join(DATA_DIR, 'ledger');
const VERSION    = '3.0.0';

let ledger, identity, registry, router, server, cfrLedger;

async function bootBridge() {
  const seq = new BootSequence({
    systemId: 'bridge', port: BRIDGE_PORT, version: VERSION,
    label: 'Nexus Bridge', maxRetries: 1,
  });

  // ── Phase 0 SOFT — orchestrator registration ──────────────────────────────
  seq.phase({ name: 'orchestrator.register', type: 'SOFT',
    label: 'Register with orchestrator (§AXIOM)',
    fn: async () => {
      const r = await nc.registerWithOrchestrator('bridge', BRIDGE_PORT, {
        role: 'trust-relay', version: VERSION,
      });
      if (r.ok) nc.startHeartbeat('bridge', BRIDGE_PORT);
    },
  });

  // ── Phase 1 HARD — open request ledger ───────────────────────────────────
  seq.phase({ name: 'ledger.open', type: 'HARD',
    label: 'Open request ledger (§2.1 persistence before everything)',
    fn: async () => {
      ledger = createBridgeLedger({ ledgerDir: LEDGER_DIR });
      const { replayed } = ledger.open();
      if (replayed) console.log(`[bridge] replayed ${replayed} requests from ledger`);

      // CFR-Ω field ledger — powers /cfr/* routes (CFR FIELD panel)
      cfrLedger = createCFRLedger({ ledgerDir: path.join(LEDGER_DIR, 'cfr'), systemId: 'bridge' });
      cfrLedger.open();
    },
  });

  // ── Phase 2 HARD — identity layer ────────────────────────────────────────
  seq.phase({ name: 'identity.init', type: 'HARD',
    label: 'Identity layer ready',
    fn: async () => {
      identity = createBridgeIdentity({ ledgerDir: LEDGER_DIR });
    },
  });

  // ── Phase 3 HARD — registry + heartbeat ──────────────────────────────────
  seq.phase({ name: 'registry.init', type: 'HARD',
    label: 'Registry init + heartbeat polling started',
    fn: async () => {
      registry = createBridgeRegistry({
        // When a system comes back online, drain its held requests
        onHeldQueue: (systemId) => {
          if (router) router.drainHeld(systemId).catch(e => {
            console.error(`[bridge] drainHeld error for ${systemId}:`, e.message);
          });
        },
      });
      registry.init();
    },
  });

  // ── Phase 4 HARD — router ─────────────────────────────────────────────────
  seq.phase({ name: 'router.init', type: 'HARD',
    label: 'Router wired (ledger + registry + circuit breaker)',
    fn: async () => {
      router = createBridgeRouter({ registry, ledger });
    },
  });

  // ── Phase 5 HARD — HTTP server ────────────────────────────────────────────
  seq.phase({ name: 'server.start', type: 'HARD',
    label: `HTTP server on :${BRIDGE_PORT}`,
    fn: async () => {
      server = createBridgeServer({ identity, registry, router, ledger, cfrLedger });
      await server.start();
    },
  });

  // ── Phase 6 SOFT — replay held requests ──────────────────────────────────
  seq.phase({ name: 'held.replay', type: 'SOFT',
    label: 'Replay held requests (targets may have come up while Bridge was down)',
    fn: async () => {
      const heldItems = ledger.held();
      if (!heldItems.length) return;
      console.log(`[bridge] ${heldItems.length} held requests — attempting replay`);
      for (const req of heldItems) {
        router.dispatch(req).catch(() => {});
        await new Promise(r => setTimeout(r, 50));
      }
    },
  });

  // ── Phase 7 SOFT — announce boot ─────────────────────────────────────────
  seq.phase({ name: 'boot.announce', type: 'SOFT',
    label: 'Announce Bridge boot to system',
    fn: async () => {
      await nc.postBridge('bridge.booted', { version: VERSION, port: BRIDGE_PORT, pid: process.pid });
      await nc.postLedger('bridge', 'bridge.booted', { version: VERSION, port: BRIDGE_PORT });
    },
  });

  const result = await seq.run();
  if (!result.ok) process.exit(1);

  console.log(`\x1b[1m\x1b[36m[bridge] ready — trust relay on :${BRIDGE_PORT}\x1b[0m`);
}

bootBridge().catch(err => {
  console.error('\x1b[31m[bridge §1.2] BOOT FAILED:\x1b[0m', err.message);
  console.error(err.stack);
  process.exit(1);
});
