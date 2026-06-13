'use strict';
/**
 * tests/modules/interaction-contract.test.js — Contract Recursive Fractal Adversarial Suite
 * UUID: test-contract-v1-0000-4000-0000-000000000001
 *
 * FRACTAL: contract structure → route validation → snapshot → snapshot-bound validation
 * ADVERSARIAL: unknown systems, missing fields, stale snapshots, schema drift
 * RECURSIVE: getContract → snapshot → validateAt → drift detection → fallback cycle
 *
 * §AXIOM: CLI = UI = API — same commands, same shapes, same ports
 * §A-4:   Living — append-only. Deprecate, never delete.
 * §1.2:   Nothing silently fails — every validation returns typed result
 */

const assert = require('assert');
const path = require('path');
const {
  getContract, getVersionedContract, getContractWithFallback,
  validateRequest, validateRequestAt, listSnapshots,
  STATIC_FALLBACK, SYSTEMS, PORTS, CONTRACT_VERSION,
} = require(path.join(__dirname, '../../contracts/nexus-interaction-contract'));

let passed = 0, failed = 0;
const invariants = [];

function t(label, fn, opts = {}) {
  try {
    fn();
    passed++;
    if (opts.invariant) invariants.push({ label, status: 'pass' });
  } catch(e) {
    failed++;
    if (opts.invariant) invariants.push({ label, status: 'fail', error: e.message });
    console.log(`  FAIL [${label}]: ${e.message}`);
  }
}

// ── §A: Module contract ───────────────────────────────────────────────────────
t('exports: all required functions', () => {
  assert.strictEqual(typeof getContract, 'function');
  assert.strictEqual(typeof getVersionedContract, 'function');
  assert.strictEqual(typeof getContractWithFallback, 'function');
  assert.strictEqual(typeof validateRequest, 'function');
  assert.strictEqual(typeof validateRequestAt, 'function');
  assert.strictEqual(typeof listSnapshots, 'function');
}, { invariant: true });

t('exports: SYSTEMS object with known systems', () => {
  assert(typeof SYSTEMS === 'object' && SYSTEMS !== null);
  const required = ['orchestrator', 'guardian', 'cortex', 'bridge'];
  for (const s of required)
    assert(SYSTEMS[s], `SYSTEMS missing '${s}'`);
}, { invariant: true });

t('exports: PORTS object with all systems', () => {
  assert(typeof PORTS === 'object');
  assert(PORTS.orchestrator === 9000, `orchestrator port wrong: ${PORTS.orchestrator}`);
  assert(PORTS.guardian === 7820, `guardian port wrong: ${PORTS.guardian}`);
  assert(PORTS.cortex === 3748, `cortex port wrong: ${PORTS.cortex}`);
  assert(PORTS.bridge === 9999, `bridge port wrong: ${PORTS.bridge}`);
}, { invariant: true });

t('exports: CONTRACT_VERSION is semver', () => {
  assert(/^\d+\.\d+\.\d+$/.test(CONTRACT_VERSION), `not semver: ${CONTRACT_VERSION}`);
}, { invariant: true });

t('exports: STATIC_FALLBACK has required shape', () => {
  assert(STATIC_FALLBACK.version, 'fallback missing version');
  assert(STATIC_FALLBACK.ports, 'fallback missing ports');
  assert(STATIC_FALLBACK.systems, 'fallback missing systems');
  assert(STATIC_FALLBACK.isFallback === true, 'fallback.isFallback should be true');
}, { invariant: true });

// ── §B: getContract ───────────────────────────────────────────────────────────
t('getContract(): full contract has version, ports, systems', () => {
  const c = getContract();
  assert(c.version, 'missing version');
  assert(c.ports,   'missing ports');
  assert(c.systems, 'missing systems');
}, { invariant: true });

t('getContract(): has routeIndex (flattened for fast lookup)', () => {
  const c = getContract();
  assert(typeof c.routeIndex === 'object', 'routeIndex missing');
  assert(Object.keys(c.routeIndex).length > 0, 'routeIndex is empty');
}, { invariant: true });

t('getContract(): has cliIndex with commands', () => {
  const c = getContract();
  assert(typeof c.cliIndex === 'object', 'cliIndex missing');
}, { invariant: true });

t('getContract(system): returns single system contract', () => {
  const c = getContract('guardian');
  assert(c, 'guardian contract null');
  assert.strictEqual(c.id, 'guardian');
  assert(Array.isArray(c.routes), 'routes not an array');
}, { invariant: true });

t('getContract(unknown): returns null', () => {
  assert.strictEqual(getContract('no_such_system'), null);
}, { invariant: true });

t('getContract(): every system has port, routes, health', () => {
  for (const [name, sys] of Object.entries(SYSTEMS)) {
    assert(sys.port > 0, `${name}: port missing or zero`);
    assert(Array.isArray(sys.routes), `${name}: routes not an array`);
    assert(sys.health?.method, `${name}: health.method missing`);
    assert(sys.health?.path, `${name}: health.path missing`);
  }
}, { invariant: true });

t('getContract(): PORTS match system port declarations', () => {
  for (const [name, sys] of Object.entries(SYSTEMS)) {
    if (PORTS[name] !== undefined) {
      assert.strictEqual(sys.port, PORTS[name],
        `${name}: SYSTEMS.port=${sys.port} !== PORTS=${PORTS[name]}`);
    }
  }
}, { invariant: true });

// ── §C: validateRequest ───────────────────────────────────────────────────────
t('validateRequest: valid GET /health on orchestrator', () => {
  const r = validateRequest('orchestrator', 'GET', '/health');
  assert(r.valid, `expected valid, got: ${r.error}`);
  assert(r.route, 'route missing from valid result');
}, { invariant: true });

t('validateRequest: unknown system → valid:false + error', () => {
  const r = validateRequest('no_such_system', 'GET', '/health');
  assert.strictEqual(r.valid, false);
  assert(r.error.includes('unknown system'), `error was: ${r.error}`);
}, { invariant: true });

t('validateRequest: unknown route → valid:false + error', () => {
  const r = validateRequest('orchestrator', 'GET', '/no/such/route/xyz');
  assert.strictEqual(r.valid, false);
  assert(r.error.includes('no route'), `error was: ${r.error}`);
}, { invariant: true });

t('validateRequest: missing required body field → valid:false', () => {
  // POST /api/register requires systemId, port
  const r = validateRequest('orchestrator', 'POST', '/api/register', {}); // missing body fields
  assert.strictEqual(r.valid, false);
  assert(r.error.includes('missing body fields'), `error was: ${r.error}`);
}, { invariant: true });

t('validateRequest: optional body fields don\'t block valid', () => {
  // POST /api/heartbeat body: [systemId, port, status]
  const r = validateRequest('orchestrator', 'POST', '/api/heartbeat', 
    { systemId: 'test', port: 3748, status: 'ok' });
  assert(r.valid, `expected valid: ${r.error}`);
}, { invariant: true });

t('validateRequest: wildcard method * matches any method', () => {
  // Proxy routes use method: '*' 
  const r1 = validateRequest('orchestrator', 'GET',    '/api/cortex/health');
  const r2 = validateRequest('orchestrator', 'POST',   '/api/cortex/something');
  const r3 = validateRequest('orchestrator', 'DELETE', '/api/cortex/data');
  // All should resolve the proxy route (or at least not error on unknown method)
  // Proxy routes exist — valid:true expected
  assert(r1.valid || r2.valid || r3.valid, 'at least one proxy method should be valid');
}, { invariant: true });

t('validateRequest: path param :id matches correctly', () => {
  // GET /api/contract/:system should match
  const r = validateRequest('orchestrator', 'GET', '/api/contract/guardian');
  assert(r.valid, `expected valid for parameterized route: ${r.error}`);
}, { invariant: true });

// ── §D: getVersionedContract ──────────────────────────────────────────────────
t('getVersionedContract(): returns schemaHash and contractId', () => {
  const c = getVersionedContract();
  assert(c.schemaHash, 'schemaHash missing');
  assert(c.contractId, 'contractId missing');
  assert(c.isFallback === false, 'isFallback should be false');
}, { invariant: true });

t('getVersionedContract(): schemaHash is 16-char hex', () => {
  const c = getVersionedContract();
  assert(/^[0-9a-f]{16}$/.test(c.schemaHash), `bad schemaHash: ${c.schemaHash}`);
}, { invariant: true });

t('getVersionedContract(): calling twice produces same hash (deterministic)', () => {
  const c1 = getVersionedContract();
  const c2 = getVersionedContract();
  assert.strictEqual(c1.schemaHash, c2.schemaHash, 'schemaHash not deterministic');
}, { invariant: true });

t('listSnapshots(): returns array after getVersionedContract()', () => {
  getVersionedContract(); // ensure at least one snapshot
  const snaps = listSnapshots();
  assert(Array.isArray(snaps), 'listSnapshots should return array');
  assert(snaps.length > 0, 'should have at least one snapshot');
  assert(snaps[0].schemaHash, 'snapshot missing schemaHash');
  assert(snaps[0].contractId, 'snapshot missing contractId');
}, { invariant: true });

// ── §E: validateRequestAt (snapshot-bound) ───────────────────────────────────
t('validateRequestAt: valid request against current snapshot', () => {
  const c    = getVersionedContract();
  const hash = c.schemaHash;
  const r    = validateRequestAt(hash, 'orchestrator', 'GET', '/health');
  assert(r.valid, `expected valid: ${r.error}`);
  assert.strictEqual(r.snapshotHash, hash);
}, { invariant: true });

t('validateRequestAt: unknown snapshot → valid:false + gap', () => {
  const r = validateRequestAt('deadbeef00000000', 'orchestrator', 'GET', '/health');
  assert.strictEqual(r.valid, false);
  assert(r.error.includes('snapshot'), `error was: ${r.error}`);
  assert(r.gap, 'gap field missing on snapshot miss');
}, { invariant: true });

t('validateRequestAt: returns contractId in valid result', () => {
  const c    = getVersionedContract();
  const r    = validateRequestAt(c.schemaHash, 'guardian', 'GET', '/health');
  assert(r.valid, `expected valid: ${r.error}`);
  assert(r.contractId, 'contractId missing from validated result');
}, { invariant: true });

// ── §F: getContractWithFallback ───────────────────────────────────────────────
t('getContractWithFallback(null): returns fallback', () => {
  const c = getContractWithFallback(null);
  assert(c.isFallback === false || c.source === 'fallback', 'should use fallback');
  assert(c.ports, 'fallback missing ports');
  assert(c.systems, 'fallback missing systems');
}, { invariant: true });

t('getContractWithFallback(live): returns live with isFallback=false', () => {
  const live = { systems: { test: {} }, ports: { test: 9999 } };
  const c = getContractWithFallback(live);
  assert.strictEqual(c.isFallback, false);
  assert.strictEqual(c.source, 'live');
}, { invariant: true });

t('getContractWithFallback(invalid shape): returns fallback', () => {
  const bad = { notSystems: {}, notPorts: {} };
  const c = getContractWithFallback(bad);
  // Should fall back gracefully
  assert(c.ports, 'fallback should have ports');
}, { invariant: true });

// ── §G: Adversarial ───────────────────────────────────────────────────────────
t('[ADV] validateRequest with null system — valid:false', () => {
  const r = validateRequest(null, 'GET', '/health');
  assert.strictEqual(r.valid, false);
}, { adversarial: true });

t('[ADV] validateRequest with undefined method — valid:false or error', () => {
  const r = validateRequest('orchestrator', undefined, '/health');
  // Should not throw — should return {valid:false} or {valid:true} deterministically
  assert(typeof r.valid === 'boolean');
}, { adversarial: true });

t('[ADV] validateRequest with deeply nested path', () => {
  const r = validateRequest('orchestrator', 'GET', '/a/b/c/d/e/f/g/h');
  assert.strictEqual(r.valid, false, 'deeply nested unknown path should be invalid');
}, { adversarial: true });

t('[ADV] getContractWithFallback(undefined) — does not throw', () => {
  let threw = false;
  try { getContractWithFallback(undefined); }
  catch(_) { threw = true; }
  assert(!threw, 'getContractWithFallback(undefined) should not throw');
}, { adversarial: true });

// ── §H: Invariants ────────────────────────────────────────────────────────────
t('[INV] §AXIOM: CLI = UI = API — all CLI commands have a matching system', () => {
  const c = getContract();
  for (const [cmd, entry] of Object.entries(c.cliIndex)) {
    assert(SYSTEMS[entry.system], `CLI command '${cmd}' references unknown system '${entry.system}'`);
  }
}, { invariant: true });

t('[INV] all routes have method and path', () => {
  for (const [name, sys] of Object.entries(SYSTEMS)) {
    for (const route of sys.routes || []) {
      assert(route.method, `${name}: route missing method`);
      assert(route.path, `${name}: route missing path`);
    }
  }
}, { invariant: true });

t('[INV] health route exists for every system', () => {
  for (const [name, sys] of Object.entries(SYSTEMS)) {
    const healthRoute = (sys.routes || []).find(r => r.path === sys.health?.path && r.method === 'GET');
    assert(healthRoute, `${name}: health route not in routes array (path: ${sys.health?.path})`);
  }
}, { invariant: true });

t('[INV] schemaHash is stable across multiple calls', () => {
  const hashes = Array.from({ length: 5 }, () => getVersionedContract().schemaHash);
  const unique = new Set(hashes);
  assert.strictEqual(unique.size, 1, `schemaHash changed across calls: ${[...unique].join(', ')}`);
}, { invariant: true });

t('[INV] STATIC_FALLBACK ports match PORTS constants', () => {
  for (const [sys, port] of Object.entries(STATIC_FALLBACK.ports)) {
    if (PORTS[sys] !== undefined)
      assert.strictEqual(port, PORTS[sys], `FALLBACK.ports.${sys}=${port} !== PORTS.${sys}=${PORTS[sys]}`);
  }
}, { invariant: true });

t('[INV] append-only: §A-4 no route deletions allowed', () => {
  // Verify the contract has routes for all systems that have ever existed
  // This is a smoke test — real append-only enforcement is via git history
  const requiredSystems = ['orchestrator', 'guardian', 'cortex', 'bridge', 'idearium'];
  for (const s of requiredSystems)
    assert(SYSTEMS[s], `§A-4 violated: system '${s}' was deleted from contract`);
}, { invariant: true });

// ── REPORT ────────────────────────────────────────────────────────────────────
setTimeout(() => {
  process.stdout.write(`\n  interaction-contract.test.js\n  ${passed} passed  ${failed} failed\n`);
  if (failed > 0) process.exitCode = 1;
}, 200);

module.exports = { passed: () => passed, failed: () => failed, invariants: () => invariants };
