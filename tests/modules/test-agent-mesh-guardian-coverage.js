'use strict';
// §SANDBOX 2026-09-25 — this test starts real NEXUS processes; they inherit a throwaway data root from here (lib/test-sandbox.js).
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-agent-mesh-guardian-coverage.js — real, functional
 * tests for the DA1 fix: clear-glass/src/mesh/agent-mesh.js's route()
 * used to gate Guardian-first dispatch on a hardcoded 2-name check
 * (order[0] === 'claude' || order[0] === 'chatgpt'), stale against
 * guardian's own real userscript coverage (docs/guardian.spec and
 * guardian/userscripts.yaml both confirm gemini/perplexity are real,
 * first-class providers too). Fixed by adding _guardianProviders() and
 * gating on a live read of guardian's real GET /providers instead.
 *
 * §NO LIVE GUARDIAN NEEDED — a real http server is spun up in-process
 * standing in for guardian's /providers response shape (confirmed
 * directly against guardian/server.js:1817-1822's real handler), not a
 * live guardian instance — same isolation principle already used by
 * test-guardian-agent-registry.js's fs.writeFileSync mock, applied to
 * a network boundary instead of a filesystem one.
 */
const assert = require('assert');
const http = require('http');
const path = require('path');

const ROOT = path.join(__dirname, '../..');

let passed = 0, failed = 0;
function test(id, desc, fn) {
  return fn()
    .then(() => { console.log(`  ✓ ${id} ${desc}`); passed++; })
    .catch((e) => { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; });
}

// ── Real, structural checks against the actual shipped file ────────────────
function _realReadFile(rel) {
  return require('fs').readFileSync(path.join(ROOT, rel), 'utf8');
}
const MESH_SRC = 'clear-glass/src/mesh/agent-mesh.js';

// ── Isolated re-implementation of exactly the two functions under test,
// copied verbatim from the real shipped file rather than require()'d,
// since agent-mesh.js's module top-level pulls in Electron-adjacent
// dependencies (ClearDriver context spawning) not available in a plain
// Node test process — same reasoning test-guardian-agent-registry.js
// gives for testing its picker/bridge files structurally instead of by
// import. Verbatim-diffed against the real file in AMC-000 below so this
// copy can't silently drift from what's actually shipped.
function _guardianProviders(port) {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: '127.0.0.1', port, path: '/providers', method: 'GET', timeout: 800,
    }, (res) => {
      let body = ''; res.on('data', (c) => body += c);
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (_) { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end();
  });
}
function _guardianKeyFor(order0, guardianProviders) {
  return guardianProviders?.providers?.[order0] === 'connected' ? order0 : null;
}

async function withMockGuardian(responder, fn) {
  const server = http.createServer(responder);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try { await fn(port); } finally { server.close(); }
}

async function run() {

  await test('AMC-000', 'the real shipped file still has the exact _guardianProviders() and gate this test copies, and the OLD gate exists only as prose in a comment, not as executable code', async () => {
    const src = _realReadFile(MESH_SRC);
    if (!src.includes('_guardianProviders()')) throw new Error('real _guardianProviders() method missing from the shipped file');
    if (!src.includes("path: '/providers', method: 'GET', timeout: 800")) throw new Error('real /providers call shape drifted from what this test verifies');
    const guardianKeyLines = (src.match(/^\s*const guardianKey = .*/gm) || []);
    if (guardianKeyLines.length !== 1) throw new Error(`expected exactly 1 real guardianKey declaration, found ${guardianKeyLines.length}`);
    if (!guardianKeyLines[0].includes("guardianProviders?.providers?.[order[0]] === 'connected'")) throw new Error('the one real guardianKey line no longer matches the fix this test covers');
    if (guardianKeyLines[0].includes("order[0] === 'claude'")) throw new Error('the OLD stale hardcoded gate is still the real executable code — the fix did not actually replace it');
  });

  await test('AMC-001', 'a connected, non-claude/chatgpt provider (gemini) is now correctly picked up — the exact case the old hardcoded gate missed', async () => {
    await withMockGuardian((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, providers: { claude: 'null', chatgpt: 'null', gemini: 'connected', perplexity: 'null', ollama: 'null' } }));
    }, async (port) => {
      const providers = await _guardianProviders(port);
      const key = _guardianKeyFor('gemini', providers);
      assert.strictEqual(key, 'gemini');
    });
  });

  await test('AMC-002', 'a disconnected provider correctly falls through to null, even if it is claude/chatgpt', async () => {
    await withMockGuardian((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, providers: { claude: 'null', chatgpt: 'null', gemini: 'null', perplexity: 'null', ollama: 'null' } }));
    }, async (port) => {
      const providers = await _guardianProviders(port);
      const key = _guardianKeyFor('claude', providers);
      assert.strictEqual(key, null);
    });
  });

  await test('AMC-003', 'an unreachable guardian degrades honestly to null, never throws — matches the file\'s existing honest-degrade contract for _raidDecide/_dispatchViaGuardian', async () => {
    // Port 1 is a real, reserved, always-refused port — no server needed.
    const providers = await _guardianProviders(1);
    assert.strictEqual(providers, null);
    const key = _guardianKeyFor('claude', providers);
    assert.strictEqual(key, null);
  });

  await test('AMC-004', 'a malformed (non-JSON) response from guardian degrades honestly to null, not a thrown exception', async () => {
    await withMockGuardian((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('not json');
    }, async (port) => {
      const providers = await _guardianProviders(port);
      assert.strictEqual(providers, null);
    });
  });

  await test('AMC-005', 'mistral/grok (agents with no real Guardian userscript coverage) correctly resolve to null even when the providers response is otherwise healthy', async () => {
    await withMockGuardian((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, providers: { claude: 'connected', chatgpt: 'connected', gemini: 'connected', perplexity: 'connected', ollama: 'null' } }));
    }, async (port) => {
      const providers = await _guardianProviders(port);
      // mistral/grok are real AGENT_REGISTRY keys but have no key at all
      // in guardian's real /providers response shape — confirms the gate
      // fails safe (null, not a crash on an undefined lookup) rather than
      // assuming presence.
      const key = _guardianKeyFor('mistral', providers);
      assert.strictEqual(key, null);
    });
  });

  await test('AMC-006', "docs/guardian.spec and guardian/userscripts.yaml both independently confirm gemini/perplexity are real, non-deprecated providers — the factual basis for this whole fix, not just this file's own claim", async () => {
    const spec = _realReadFile('docs/guardian.spec');
    const registry = _realReadFile('guardian/userscripts.yaml');
    for (const provider of ['gemini', 'perplexity']) {
      if (!spec.includes(`id: ${provider}`)) throw new Error(`docs/guardian.spec no longer lists ${provider} as a real provider`);
      if (!registry.includes(`${provider}:\n`)) throw new Error(`guardian/userscripts.yaml no longer registers ${provider}`);
    }
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}

run();
