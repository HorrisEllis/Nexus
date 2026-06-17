'use strict';
// ── cortex/boot.js ────────────────────────────────────────────────────────────
// UUID: cortex-boot-v2-0000-4000-0000-000000000001
// Status: pre-release
//
// §3.1  Bottom-up boot: storage → siso → jaa → modules → admin → orchestrator
// §1.2  Every failure loud, specific, halts boot
// §2.1  Persistence before everything else
// §8.3  SISO and Jaa are load-order prerequisites

'use strict';

const path        = require('path');
const nc          = require('../nexus-connect');
const uidSystem   = require('../lib/uid'); // §14: component identity
const { JaaDB, uid } = require('./memory/jaa-db');
const { createCFRLedger } = require('../lib/cfr/ledger');
const { FileStore }  = require('./foundation/store/FileStore');
const { FileRefs }   = require('./foundation/store/FileRefs');
const { core }       = require('./foundation/cobalt-core');
const { AdminServer }= require('./foundation/admin-server');
const pollRegistry   = require('./foundation/poll-registry');
const { dataPoller } = require('./memory/data-poller');
const workingMemory  = require('./memory/working-memory');
const versionium     = require('./versionium');
const agentDispatch  = require('./agents');
const ollamaAgent    = require('./agents/ollama');
const claudeAgent    = require('./agents/claude');

const DATA_DIR  = process.env.NEXUS_DATA_DIR  || path.join(__dirname, 'data');
const STORE_DIR = process.env.NEXUS_STORE_DIR || path.join(__dirname, 'store');
const PORT      = parseInt(process.env.NEXUS_PORT || '3748');
const VERSION   = '3.0.0';

let jaaDB, fileStore, fileRefs, adminServer;

async function bootAsync() {
  const { BootSequence } = require('../lib/boot-sequence');

  const seq = new BootSequence({
    systemId: 'cortex', port: PORT, version: VERSION,
    label: 'Nexus Cortex', maxRetries: 1,
  });

  // ── Phase 0 SOFT: orchestrator registration ──────────────────────────────
  // §14: register cortex in the component identity system
  uidSystem.register('nexus-cx'); // cortex registers itself and its parent chain
  console.log('[boot] nexus-cx registered in component map');

  seq.phase({ name:'orchestrator.register', type:'SOFT',
    label:'Register with orchestrator (§AXIOM)',
    fn: async () => {
      const r = await nc.registerWithOrchestrator('cortex', PORT,
        { role:'source-of-truth', version:VERSION });
      if (r.ok) nc.startHeartbeat('cortex', PORT);
    },
  });

  // ── Phase 0.5 SOFT: Bridge handshake ─────────────────────────────────────
  seq.phase({ name:'bridge.handshake', type:'SOFT',
    label:'Handshake with Bridge (identity + session token)',
    fn: async () => {
      const r = await nc.postBridge('bridge.handshake', {
        systemId: 'cortex',
        secret:   process.env.BRIDGE_SECRET_CORTEX || 'nexus-cortex-internal-v1',
        port:     PORT,
      });
      if (r.ok && r.token) process.env.BRIDGE_TOKEN = r.token;
    },
  });

  // ── Phase 1 HARD: storage init ───────────────────────────────────────────
  seq.phase({ name:'storage.init', type:'HARD',
    label:'JAA database open + FileStore init (§2.1)',
    fn: async () => {
      // CRITICAL: open the SHARED singleton at cortex/data — not a private
      // instance. Every module (versionium, admin-server, healer, memory)
      // imports the singleton; a private `new JaaDB()` here creates a second,
      // never-persisted database and all API writes evaporate on restart.
      jaaDB     = require('./memory/jaa-db').jaaDB;
      fileStore = new FileStore({ dir: STORE_DIR });
      fileRefs  = new FileRefs({ store: fileStore,
        dir: path.join(STORE_DIR, 'refs') });
      await jaaDB.open(DATA_DIR);

      // ── Data Poller — cortex pulls from all system data folders ──────────
      // §2.1: disk-first. Every system writes local data/ first.
      // Cortex polls and ingests anything new into its JAA tables.
      dataPoller.init({
        pollMs:   parseInt(process.env.CORTEX_POLL_MS || '5000'),
        dataRoot: DATA_DIR,
      });

      // ── CFR-Ω Ledger — cortex kernel ─────────────────────────────────────
      // Every event through cortex bus gets sigma + delta + CFR snapshot.
      // /cfr/* HTTP routes served directly from this ledger instance.
      global._cortexCFRLedger = createCFRLedger({
        ledgerDir: DATA_DIR,
        systemId:  'cortex',
        onGap: (gap) => {
          // Write CFR-triggered gaps into JAA — deduplicated
          // §FIX-CFR-GAP: DELTA.TENSION is a signal, not an open loop.
          // It feeds the tension score, not the gap table.
          // Only structural CFR gaps (missing contract, protocol violation) become gap rows.
          try {
            const SIGNAL_TYPES = new Set(['DELTA.TENSION','delta.tension','tension','cfr.tension']);
            if (SIGNAL_TYPES.has(gap.type)) return; // tension signals → diagnostic, not gaps

            // Dedup: don't insert if identical open gap exists
            const existing = jaaDB.query('gaps',
              r => r.type === gap.type && r.source === 'cfr-ledger' &&
                   r.status !== 'resolved' && r.status !== 'forge_applied',
              1
            );
            if (existing.length) return;

            jaaDB.insert('gaps', {
              uuid:      uid(),
              type:      gap.type,
              body:      gap.message,
              severity:  gap.severity > 0.8 ? 'high' : 'medium',
              status:    'pending',
              source:    'cfr-ledger',
              path:      gap.path || 'cfr/' + gap.type,
              causedBy:  gap.entry?.uuid || null,
              createdAt: Date.now(),
              ts:        Date.now(),
            });
          } catch(_) {}
        },
      });
      global._cortexCFRLedger.open();
      global._cortexCFRLedger.startAutoSave(60000);

      jaaDB.insert('event_log', {
        uuid: uid(), type: 'cortex.storage.opened', ts: Date.now(),
        payload: { dataDir: DATA_DIR,
          tables: Object.keys(jaaDB._tables || {}).length },
        source: 'boot', causedBy: null,
      });
      // Record boot event through CFR ledger too
      global._cortexCFRLedger.record('cortex.storage.opened', {
        dataDir: DATA_DIR, tables: Object.keys(jaaDB._tables || {}).length,
      }, { source: 'boot' });
    },
  });

  // ── Phase 2 HARD: cobalt core ────────────────────────────────────────────
  seq.phase({ name:'core.init', type:'HARD',
    label:'Cobalt core open + project connect',
    fn: async () => {
      core.open();
      try {
        const schema = require('./cobalt.manifest.json');
        core.load(schema);
      } catch {
        core.connect({
          uuid: 'nexus-project-0000-4000-0000-000000000001',
          name: 'nexus', type: 'core', version: VERSION,
          meta: { intent: 'NEXUS cortex source-of-truth' },
        });
      }
    },
  });

  // ── Phase 3 HARD: module dependencies ───────────────────────────────────
  seq.phase({ name:'deps.init', type:'HARD',
    label:'Wire Versionium + AgentDispatch deps',
    fn: async () => {
      versionium.setDeps({ fileStore, fileRefs });
      agentDispatch.setDeps({
        ollama: ollamaAgent, claude: claudeAgent,
        chatgpt: null, gemini: null,
      });
    },
  });

  // ── Phase 4 HARD: poll registry ──────────────────────────────────────────
  seq.phase({ name:'poll.start', type:'HARD',
    label:'Start all module poll loops',
    fn: async () => {
      pollRegistry.start();
      // Working memory maintenance (5-min context snapshots)
      workingMemory.init({});
    },
  });

  // ── Phase 5 HARD: admin server ───────────────────────────────────────────
  seq.phase({ name:'server.start', type:'HARD',
    label:'HTTP admin server on :' + PORT,
    fn: async () => {
      adminServer = new AdminServer({ port: PORT, deps: { fileStore, fileRefs } });
      await adminServer.start();
    },
  });

  // ── Phase 5.2 SOFT: Vector memory ────────────────────────────────────────
  seq.phase({ name:'vector.memory.init', type:'SOFT',
    label:'Vector memory index (SNR-gated semantic search)',
    fn: async () => {
      try {
        const vm = require('../lib/vector-memory');
        await vm.init();
        const st = await vm.status();
        return { ok: true, items: st.indexStats?.items || 0, ollama: st.ollamaOk };
      } catch(e) {
        return { ok: false, error: e.message }; // SOFT — never blocks boot
      }
    }
  });

  // ── Phase 5.3 SOFT: Intelligence core ────────────────────────────────────
  // Starts after admin server so HTTP routes are live.
  // Starts before snapshot so first scan can run during snapshot window.
  // SOFT — intelligence degraded is better than intelligence blocking boot.
  // Drift: intelligence reads JAA tables that may have 0 rows on first boot.
  //        It accounts for this — all scans guard against insufficient data.
  seq.phase({ name:'intelligence.init', type:'SOFT',
    label:'Intelligence core (pattern recognition + failure taxonomy)',
    fn: async () => {
      try {
        const intelligence = require('./intelligence');
        intelligence.init({
          pollMs:     parseInt(process.env.CORTEX_INTEL_MS || '60000'),
          jaaDB,
        });
        // Wire intelligence HTTP routes into admin-server
        adminServer.registerIntelligence(intelligence);
        jaaDB.insert('event_log', {
          uuid: uid(), type: 'intelligence.booted', ts: Date.now(),
          payload: { version: '1.0.0', scanIntervals: {
            patterns:   60000,
            failures:   30000,
            reuseIndex: 120000,
            crossLedger:90000,
          }},
          source: 'boot', causedBy: null,
        });
      } catch(e) {
        // §SOFT — log and continue, never halt boot
        console.warn(`[cortex/boot] intelligence core degraded: ${e.message}`);
        jaaDB.insert('event_log', {
          uuid: uid(), type: 'intelligence.boot.degraded', ts: Date.now(),
          payload: { error: e.message, stack: e.stack?.split('\n')[1] || '' },
          source: 'boot', causedBy: null,
        });
      }
    },
  });

  // ── Phase 5.4 SOFT: operational intelligence organs ─────────────────────
  // These modules exist, pass unit tests, and have never started at boot.
  // gap-finder, self-heal, orion/sensor, orion/policy, raid, heartbeat.
  // All have identical contract: init({ jaaDB, pollMs }) + stop().
  // All use .unref() on their intervals — consistent with existing pattern.
  // SOFT — any one failing degrades but never blocks boot.
  // §3.1 wiring: Alexander's audit + forensic audit both confirmed this gap.
  seq.phase({ name:'organs.init', type:'SOFT',
    label:'Operational intelligence organs (gap-finder, healer, self-heal, gap-loop, orion, raid, heartbeat)',
    fn: async () => {
      const organs = [
        { name: 'gap-finder',   path: './gate/gap-finder'   },
        { name: 'healer',       path: './healer/index'      },
        { name: 'self-heal',    path: './self-heal/index'   },
        { name: 'gap-loop',     path: './gap-loop'          },
        { name: 'orion/sensor', path: './orion/sensor'      },
        { name: 'orion/policy', path: './orion/policy'      },
        { name: 'raid',         path: './core/raid/index'   },
        { name: 'heartbeat',    path: './heartbeat/index'   },
        { name: 'behavioral-boundary', path: './behavioral-boundary/index' },
        { name: 'liminal-space',        path: './liminal-space/index'        },
      ];

      const pollMs = parseInt(process.env.CORTEX_ORGAN_MS || '15000');
      const started = [], failed = [];

      for (const organ of organs) {
        try {
          const mod = require(organ.path);
          mod.init({ jaaDB, pollMs });
          started.push(organ.name);
          // Wire RAID into admin server so guardian can consult it (seam, not import)
          if (organ.name === 'raid' || (organ.id && String(organ.id).includes('raid'))) {
            try { adminServer.registerRaid(mod); }
            catch (e) { console.warn(`[cortex/boot] raid route not wired: ${e.message}`); }
          }
        } catch(e) {
          failed.push({ name: organ.name, error: e.message });
          console.warn(`[cortex/boot] organ degraded — ${organ.name}: ${e.message}`);
        }
      }

      jaaDB.insert('event_log', {
        uuid: uid(), type: 'cortex.organs.booted', ts: Date.now(),
        payload: { started, failed: failed.map(f => f.name), total: organs.length },
        source: 'boot', causedBy: null,
      });

      if (started.length > 0) {
        console.log(`[cortex/boot] organs online: ${started.join(', ')}`);
      }
      if (failed.length > 0) {
        console.warn(`[cortex/boot] organs degraded: ${failed.map(f=>f.name).join(', ')}`);
      }
    },
  });

  // ── Phase 5.5 SOFT: boot snapshot + agent-tools init ───────────────────────
  seq.phase({ name:'snapshot.boot', type:'SOFT',
    label:'Take boot snapshot (§2.1 persistence baseline)',
    fn: async () => {
      try {
        const snapshotMod = require('./snapshot');
        snapshotMod.bootSnapshot();
        // Start divergence watcher — sigma-triggered auto-snapshots with blackbox
        snapshotMod.divergenceWatcher.init();
      } catch(_) {}
      // Register agent-tools manifest in event_log so agents can discover tools
      try {
        const agentTools = require('./agent-tools');
        jaaDB.insert('event_log', {
          uuid: uid(), type: 'agent-tools.ready',
          payload: { tools: agentTools.manifest().map(t => t.name), count: agentTools.manifest().length },
          source: 'boot', causedBy: null, ts: Date.now(),
        });
      } catch(_) {}
    },
  });

  // ── Phase 5.7 SOFT: Bridge SSE subscription ──────────────────────────────
  // Cortex subscribes to Bridge's SSE stream.
  // Every bridge.request.* event updates the JAA requests table projection.
  // This makes GET /api/requests a live view of Bridge's ledger.
  seq.phase({ name:'bridge.subscribe', type:'SOFT',
    label:'Subscribe to Bridge SSE (requests table projection)',
    fn: async () => {
      const http = require('http');
      const BRIDGE_PORT = parseInt(process.env.BRIDGE_PORT || '9999');

      function _connectBridgeSSE() {
        const req = http.get({
          hostname: '127.0.0.1', port: BRIDGE_PORT,
          path: '/bridge/sse', headers: { Accept: 'text/event-stream' },
        }, res => {
          let buf = '';
          res.on('data', chunk => {
            buf += chunk.toString();
            const lines = buf.split('\n'); buf = lines.pop();
            for (const line of lines) {
              if (!line.startsWith('data:')) continue;
              try {
                const event = JSON.parse(line.slice(5).trim());
                _handleBridgeEvent(event);
              } catch(_) {}
            }
          });
          res.on('end', () => setTimeout(_connectBridgeSSE, 5000)); // reconnect
        });
        req.setTimeout(0);
        req.on('error', () => setTimeout(_connectBridgeSSE, 10000));
        req.end();
      }

      function _handleBridgeEvent(event) {
        // Project Bridge request events into JAA requests table
        try {
          if (event.type === 'bridge.request.created') {
            jaaDB.insert('requests', {
              uuid:       event.data.uuid,
              type:       event.data.type,
              source:     event.data.source,
              target:     event.data.target,
              status:     'pending',
              createdAt:  event.ts,
              updatedAt:  event.ts,
              ts:         event.ts,
            });
          } else if (event.type === 'bridge.request.updated') {
            // Patch existing row
            const rows = jaaDB.query('requests', r => r.uuid === event.data.uuid, 1);
            if (rows.length) {
              jaaDB.update('requests', rows[0].uuid, {
                status:    event.data.status,
                updatedAt: event.ts,
              });
            }
          }
        } catch(_) {}
      }

      // Connect in background — SOFT phase, never blocks boot
      setTimeout(_connectBridgeSSE, 2000);
    },
  });

  // ── Phase 6 SOFT: boot record ────────────────────────────────────────────
  seq.phase({ name:'boot.record', type:'SOFT',
    label:'Write boot record to event_log (§M1)',
    fn: async () => {
      // §ALK: load decision history from disk so session is not empty
      try {
        const alk = require('../lib/alk');
        const loaded = alk.load();
        console.log(`[cortex/boot] ALK loaded ${loaded} decisions from disk`);
      } catch(_) {}
      jaaDB.insert('event_log', {
        uuid: uid(), type: 'system.booted', ts: Date.now(),
        payload: { version: VERSION,
          modules: pollRegistry.modules.map(m => m.id), port: PORT },
        source: 'boot', causedBy: null,
      });
      // seed project registry with known systems
      try {
        const systems = ['cortex','guardian','idearium','emerge'];
        for (const s of systems) {
          jaaDB.insert('project_registry', {
            uuid: require('crypto').randomUUID(), name: s, system: s,
            ts: Date.now(), source: 'boot',
          });
        }
      } catch(_) {}

      // ── Register system-wide contracts on boot (§5.1 — self-awareness) ──
      try {
        const C = require('../contracts/SYSTEM-CONTRACTS');
        jaaDB.insert('event_log', {
          uuid: uid(), type: 'cortex.contracts.loaded', ts: Date.now(),
          payload: {
            systems:    Object.keys(C.SYSTEMS).length,
            eventTypes: C.allEventTypes().length,
            gapTypes:   Object.keys(C.GAPS.TYPES).length,
            faultClasses: Object.keys(C.FAULTS.CLASS).length,
            axioms:     Object.keys(C.AXIOMS).length,
            verificationChecks: [
              ...C.VERIFICATION_CONTRACTS.UNIVERSAL,
              ...C.VERIFICATION_CONTRACTS.CORTEX,
            ].length,
          },
          source: 'boot', causedBy: null,
        });
      } catch(_) {}
    },
  });


  const result = await seq.run();
  if (!result.ok) process.exit(1);
}

bootAsync().catch(err => {
  console.error('\x1b[31m[cortex/boot §1.2] BOOT FAILED:\x1b[0m', err.message);
  console.error(err.stack);
  process.exit(1);
});
