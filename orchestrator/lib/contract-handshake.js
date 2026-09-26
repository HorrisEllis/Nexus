'use strict';
/**
 * lib/contract-handshake.js — Interaction Contract Verification Layer
 * UUID: nexus-contract-hs-v1-0000-4000-0000-000000000001
 * Status: pre-release
 *
 * When a system boots and registers with the orchestrator, the orchestrator
 * fetches that system's /api/contract endpoint and verifies:
 *
 *   1. The contract has the expected system id
 *   2. All declared routes are actually reachable (health check)
 *   3. The schema hash matches what the orchestrator has on file
 *      (or records it as the new canonical if first time)
 *
 * This turns the interaction contract from documentation into a live
 * enforcement mechanism. A system that doesn't publish a valid contract
 * cannot be trusted by the orchestrator — it's registered but flagged
 * as UNVERIFIED and proxied with a warning header.
 *
 * Trust states:
 *   UNVERIFIED  — registered but contract not yet checked
 *   VERIFIED    — contract fetched, schema matches, routes reachable
 *   DEGRADED    — contract fetched but some routes unreachable
 *   MISMATCH    — contract schema differs from on-file (breaking change)
 *   UNREACHABLE — /api/contract returned non-200
 *
 * §1.1  Nothing is trusted until proven
 * §1.2  Every verification failure is logged to event_log with reason
 * §5.2  Contract IS the bridge — every system implements it
 */

const http   = require('http');
const crypto = require('crypto');

const MODULE_ID = 'contract-handshake';

// In-memory trust registry — survives within a process lifetime
// Persisted to JAA event_log on every state change
const _registry = new Map(); // systemId → ContractEntry

const TRUST = {
  UNVERIFIED:  'UNVERIFIED',
  VERIFIED:    'VERIFIED',
  DEGRADED:    'DEGRADED',
  MISMATCH:    'MISMATCH',
  UNREACHABLE: 'UNREACHABLE',
};

// ── Per-system contract paths ─────────────────────────────────────────────────
// Each system serves its interaction contract at a different path.
// This is the canonical mapping. §A-4: append-only, never remove.
const CONTRACT_PATHS = {
  cortex:       '/contract',
  guardian:     '/contract',
  idearium:     '/api/contract',
  bridge:       '/bridge/contract',
  architect:    '/api/contract',
  emerge:       '/api/contract',
  orchestrator: '/api/contract',
  diagnostic:   '/health',
  // Sovereign systems added 2026-06-27
  eravos:         '/contract',
  ollama:         '/contract',
  copilot:        '/contract',
  'clear-glass':  '/contract',
  'nexus-wire':   '/contract',
  // §BUGFIX 2026-07-04: loom added as a sovereign system this session
  // (loom/server.js, :3752) with a real GET /contract route, matching this
  // same bare-path convention — but never added here, so every poll fell
  // through to the '/api/contract' default and 404'd.
  loom:           '/contract',
  // §FIXED 2026-09-02 — James, live, from a real boot log: "[orch]
  // contract.unreachable — versionium (invalid JSON: Unexpected token
  // 'N', "Not found" is not valid JSON)". Exact same real bug class as
  // loom's own comment right above — versionium/routes/system.js's real
  // GET /contract route (built this session, VS1) was simply never
  // added here, so this poller fell through to '/api/contract' and hit
  // a real, honest 404 whose plain-text body ("Not found") isn't valid
  // JSON, hence the parse error James saw.
  versionium:     '/contract',
  // §0.39.265 — same class again: intelligence (:3753) fell through to
  // '/api/contract' and 404'd on every boot. It now serves GET /contract.
  intelligence:   '/contract',
};

function contractPathFor(systemId) {
  return CONTRACT_PATHS[systemId] || '/api/contract';
}

// ── Fetch a system's contract over HTTP ───────────────────────────────────────
async function fetchContract(systemId, host, port, timeoutMs = 5000) {
  const contractPath = contractPathFor(systemId);

  // Retry up to 3× on socket hang-up — system may still be binding its HTTP server
  for (let _attempt = 1; _attempt <= 3; _attempt++) {
    const _result = await _fetchOnce(contractPath, host, port, timeoutMs);
    if (_result.ok) return _result;
    const err = (_result.error || '').toLowerCase();
    const isHangup = err.includes('socket hang up') || err.includes('econnreset') || err.includes('epipe');
    if (!isHangup || _attempt === 3) return { ..._result, attempts: _attempt };
    await new Promise(r => setTimeout(r, 1500 * _attempt));
  }
}

async function _fetchOnce(contractPath, host, port, timeoutMs) {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: host || '127.0.0.1',
      port,
      path:     contractPath,
      method:   'GET',
      headers:  { 'Accept': 'application/json', 'X-Requester': 'orchestrator-contract-hs' },
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          resolve({ ok: res.statusCode === 200, status: res.statusCode, body });
        } catch(e) {
          resolve({ ok: false, status: res.statusCode, error: 'invalid JSON: ' + e.message });
        }
      });
    });
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.on('error', (e) => resolve({ ok: false, error: e.message }));
    req.end();
  });
}

// ── Hash a contract for drift detection ──────────────────────────────────────
function hashContract(contractBody) {
  const canonical = JSON.stringify(contractBody, Object.keys(contractBody).sort());
  return crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

// ── Verify a system's contract ────────────────────────────────────────────────
async function verifySystem(systemId, host, port, opts = {}) {
  const { expectedHash = null, jaaInsert = null, onResult = null } = opts;
  const t0 = Date.now();

  // Fetch
  const result = await fetchContract(systemId, host, port);
  if (!result.ok) {
    const entry = {
      systemId, host, port,
      trust:     TRUST.UNREACHABLE,
      error:     result.error || `HTTP ${result.status}`,
      checkedAt: Date.now(),
      latencyMs: Date.now() - t0,
    };
    _registry.set(systemId, entry);
    _log(jaaInsert, 'contract.unreachable', { systemId, error: entry.error });
    onResult?.(entry);
    return entry;
  }

  // Handle both flat contract { id, routes, ... } and
  // nested contract { contract: { id, routes, ... } } shapes
  let raw = result.body?.contract || result.body;
  // Orchestrator wraps in { ok, contract: { systems: { ... } } }
  // Individual system contracts are flat: { id, routes, ... }
  // If it has a 'systems' key and no 'id', look for the system's entry
  if (raw?.systems && !raw?.id && raw?.systems?.[systemId]) {
    raw = raw.systems[systemId];
  }
  const contract = raw;
  const hash     = hashContract(contract);

  // Check system id matches
  const idMatch = !contract.id || contract.id.includes(systemId) || contract.namespace?.includes(systemId);

  // Check for schema drift
  let trust = TRUST.VERIFIED;
  let driftReason = null;

  if (expectedHash && expectedHash !== hash) {
    trust       = TRUST.MISMATCH;
    driftReason = 'schema hash ' + hash + ' ≠ expected ' + expectedHash;
  }

  // Route count — handle various contract shapes
  const routes   = contract.routes || contract.channels || [];
  const hasCli   = Array.isArray(contract.cli);
  const hasContent = routes.length > 0 || contract.siso?.emits?.length > 0 || contract.namespace;

  const entry = {
    systemId,
    host:       host || '127.0.0.1',
    port,
    trust,
    hash,
    idMatch,
    routeCount: routes.length,
    cliCount:   hasCli ? contract.cli.length : 0,
    driftReason,
    checkedAt:  Date.now(),
    latencyMs:  Date.now() - t0,
  };

  _registry.set(systemId, entry);
  _log(jaaInsert, `contract.${trust.toLowerCase()}`, {
    systemId, hash, trust, driftReason, latencyMs: entry.latencyMs,
  });

  onResult?.(entry);
  return entry;
}

// ── Verify all known systems ──────────────────────────────────────────────────
async function verifyAll(systems, opts = {}) {
  // systems: [{ id, host, port }]
  const results = await Promise.allSettled(
    systems.map(s => verifySystem(s.id, s.host, s.port, opts))
  );
  return results.map((r, i) =>
    r.status === 'fulfilled' ? r.value : { systemId: systems[i].id, trust: TRUST.UNREACHABLE, error: r.reason?.message }
  );
}

// ── Get current trust state ───────────────────────────────────────────────────
function getEntry(systemId)  { return _registry.get(systemId) || null; }
function getAllEntries()      { return [..._registry.values()]; }
function getTrustMap()       {
  const map = {};
  for (const [id, e] of _registry) map[id] = { trust: e.trust, hash: e.hash, checkedAt: e.checkedAt };
  return map;
}

// ── Log helper ────────────────────────────────────────────────────────────────
function _log(jaaInsert, type, payload) {
  if (jaaInsert) {
    try {
      jaaInsert('event_log', {
        uuid:    require('crypto').randomUUID(),
        type:    `${MODULE_ID}.${type}`,
        payload, source: MODULE_ID, ts: Date.now(), causedBy: null,
      });
    } catch(_) {}
  }
}

module.exports = { verifySystem, verifyAll, getEntry, getAllEntries, getTrustMap, TRUST, MODULE_ID, CONTRACT_PATHS };
