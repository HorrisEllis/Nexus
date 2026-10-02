'use strict';
/**
 * versionium/server.js — Sovereign Versionium
 * UUID: nexus-versionium-server-v1-0000-2026-0902-jamesbrooks-001
 * Port: 3754
 *
 * §VS1 2026-09-02 (docs/2026-09-02-versionium-sovereign-and-cleanup-
 * phasemap.spec) — James: "versionium is its own folder. it's system
 * with a server.js. cli. api. event driven interaction contract. with
 * handshake gated verification... needs the component registery. spec
 * as living model. event taxonomy. data folder. ring buffer. causal
 * field to track changes and trajectory... need to respect architecture
 * and axioms. migrate cortex and idearium's versionium to the new
 * folder and system and map it in loom's system map."
 *
 * Versionium was previously embedded inside cortex/boot.js (init'd
 * in-process, routes mounted on cortex's own HTTP server). This file is
 * the real promotion to sovereignty, mirroring ollama/server.js's exact
 * composition-root shape: this file owns ONLY the HTTP listener and
 * route dispatch. All state lives in lib/store.js (own data folder, see
 * that file's own header), all commit/restore/calendar/getState logic
 * in lib/engine.js, causal tracing in lib/causality.js — all three
 * migrated wholesale from cortex/versionium/, not rewritten.
 *
 * §CROSS-PROCESS FIELD READ — engine.js's live-field sigma trigger used
 * to read cortex's _field in-process (same file, same boot.js). Now a
 * separate process: polls cortex's own real, already-working GET
 * /cfr/field (confirmed live before writing this — that route already
 * returns {..._field, ts}, no cortex change needed) via lib/nexus-
 * client.js, the same sovereign-transport primitive every other cross-
 * process capability in this codebase uses.
 */
const http = require('http');
const fs   = require('fs');

const config = require('./config.js');
const engine = require('./lib/engine.js');
const causality = require('./lib/causality.js');
const { json } = require('./lib/http-utils.js');

const PORT      = config.PORT;
const ORCH_URL  = config.ORCH_URL;
const SYSTEM_ID = config.SYSTEM_ID;
const VERSION   = config.VERSION;

try { fs.mkdirSync(config.DATA_DIR, { recursive: true }); } catch (_) {}

const routes = [
  require('./routes/system.js'),
  require('./routes/versionium.js'),
  require('./routes/files.js'),
];

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const ctx = { method: req.method, url, pathname: url.pathname };

  for (const route of routes) {
    try {
      if (await route.handle(req, res, ctx)) return;
    } catch (e) {
      json(res, 500, { ok: false, error: e.message });
      return;
    }
  }

  res.writeHead(404); res.end('Not found');
});

// ── Register with orchestrator ────────────────────────────────────────────
function register() {
  const components = require('./registry-components');
  const body = JSON.stringify({
    systemId: SYSTEM_ID, port: PORT, version: VERSION, status: 'online',
    meta: { label: 'VERSIONIUM', color: '#8855ff' },
    components: components.components || [],
  });
  const u = new URL(`${ORCH_URL}/api/register`);
  const r = http.request({
    hostname: u.hostname, port: u.port || 9000, path: u.pathname, method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    timeout: 4000,
  }, () => {
    console.log('[versionium] registered');
    try {
      const { startHeartbeat } = require('../nexus/nexus-connect');
      startHeartbeat(SYSTEM_ID, PORT);
    } catch (_) {}
  });
  r.on('error', () => setTimeout(register, 5000));
  r.write(body); r.end();
}

// §0.39.300 VX1 — a taken port is a sentence, not a raw EADDRINUSE stack
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error(`[versionium] port ${PORT} is already in use — another versionium is probably running (GET http://127.0.0.1:${PORT}/health); set VERSIONIUM_PORT to run a second one`);
  else console.error(`[versionium] the server could not start: ${e.message}`);
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`[versionium] :${PORT} — sovereign causal version control active`);
  setTimeout(register, 1000);

  // §VS1 — real, one-time, idempotent data-continuity migration (closes
  // versionium.spec's own gap V6). Safe to run every boot — see that
  // module's own header for why it never duplicates.
  try {
    const { migrateLegacyData } = require('./lib/migrate-legacy-data.js');
    migrateLegacyData({ log: (msg) => console.log(msg) });
  } catch (e) {
    console.warn(`[versionium] legacy data migration failed (non-fatal): ${e.message}`);
  }

  // §GAP V5 CLOSED 2026-09-15 — same idempotent, run-every-boot pattern as
  // migrate-legacy-data.js above (closes V6). Separate call, separate file:
  // see migrate-idearium-snapshots.js's own header for why V5 and V6 are
  // not the same migration despite the shared shape.
  // §D3 CLOSED 2026-09-19 — third migration in the same family, same
  // idempotent run-every-boot shape as V6 and V5 above. James: "cortex is
  // not versionium... there should not be any .nex files generating in
  // cortex." The .nex files that were under cortex/data/snapshots had NO
  // backup_records rows anywhere — already orphaned before the move, so
  // this rebuilds the index FROM the files rather than copying rows that
  // never existed. Separate file for the same §5.7 reason V5 is separate
  // from V6: a different source (a directory, not a table) and a
  // different real recovery shape.
  try {
    const { migrateCortexSnapshots } = require('./lib/migrate-cortex-snapshots.js');
    const r = migrateCortexSnapshots();
    if (r && r.indexed) {
      // §1.2 — an empty capture is reported, not quietly indexed as if it
      // were a usable rollback target.
      console.log(`[versionium] re-indexed ${r.indexed} relocated snapshot(s)` +
        (r.emptyCaptures ? ` — ${r.emptyCaptures} are EMPTY captures (pre-§BUGFIX-2026-08-25), rollback to those restores nothing` : ''));
    }
    if (r && r.unreadable && r.unreadable.length) {
      console.warn(`[versionium] ${r.unreadable.length} snapshot file(s) unreadable — see backup_records`);
    }
  } catch (e) {
    console.warn(`[versionium] cortex snapshot re-index failed (non-fatal): ${e.message}`);
  }

  // §VS1 — real cross-process field reader (see this file's own header).
  // A cortex that's unreachable degrades honestly: fieldReader returns
  // null entropy, engine.js's own real "no trigger fires without one"
  // logic (its _tick's own comment) already handles that without a
  // fabricated default.
  // §0.39.300 VX1 — an outage is said twice, not every tick: once when the field goes away (with why), once when it comes
  // back (with how long). Before, a down orchestrator printed the same warning every POLL_MS (3 s), forever.
  let fieldDownSince = null;
  engine.setDeps({
    fieldReader: async () => {
      try {
        const nx = require('../lib/nexus-client.js');
        const f = await nx.get('orchestrator', '/cfr/field', { timeout: 3000 });
        if (fieldDownSince) { console.log(`[versionium] orchestrator /cfr/field is back after ${Math.round((Date.now() - fieldDownSince) / 1000)}s — the sigma auto-commit trigger is live again`); fieldDownSince = null; }
        return f;
      } catch (e) {
        if (!fieldDownSince) { fieldDownSince = Date.now(); console.warn(`[versionium] orchestrator /cfr/field unreachable (non-fatal — no sigma auto-commit until it is back; said once): ${e.message}`); }
        return null;
      }
    },
  });
  engine.init({ pollMs: config.POLL_MS });
  causality.init({ pollMs: 5000 });
});

module.exports = { server };
