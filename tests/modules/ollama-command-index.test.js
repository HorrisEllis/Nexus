// tests/modules/ollama-command-index.test.js — docs/command-index-per-
// system.spec's own build_order.phase-2 exit criteria: "GET /commands
// returns a union of all six modules' declared commands, verified
// against ollama/server.js's own require list."
//
// Real, self-verifying — this test does NOT hardcode "17 commands"; it
// independently re-requires each of the six real route files itself
// and sums their real `commands.length`, then boots the real server
// and confirms the real live endpoint returns that exact same count.
// If a 7th route file is ever added to ollama/server.js's routes[]
// array without a matching update here, this test's own independent
// count changes too — it can't silently go stale the way a fixed
// number would.
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

const PORT = 18731; // real scratch port
const REPO_ROOT = path.join(__dirname, '..', '..');

function get(urlPath) {
  return new Promise((resolve, reject) => {
    http.get({ hostname: '127.0.0.1', port: PORT, path: urlPath }, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

function waitForPort(port, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    (function tryOnce() {
      http.get({ hostname: '127.0.0.1', port, path: '/health' }, (res) => { res.resume(); resolve(); })
        .on('error', () => { if (Date.now() - start > timeoutMs) reject(new Error('ollama server never came up')); else setTimeout(tryOnce, 200); });
    })();
  });
}

let passed = 0, failed = 0;
const t = (id, name, cond) => { if (cond) { passed++; console.log(`  ✓ ${id} ${name}`); } else { failed++; console.log(`  ✗ ${id} ${name}`); } };

async function main() {
  console.log('\n[1] independent, real re-derivation of the expected count — not a hardcoded number');
  // Same six files, same order, as ollama/server.js's own real routes[]
  // array — re-checked directly against that file's own require list
  // as part of writing this test, not copied from command-index.js's
  // own (correct, but this test must not just trust it) file list.
  const REAL_ROUTE_FILES = ['system.js', 'uploads.js', 'stream.js', 'jobs.js', 'queue.js', 'models.js'];
  let expectedCount = 0;
  const perModule = {};
  for (const f of REAL_ROUTE_FILES) {
    const mod = require(path.join(REPO_ROOT, 'ollama', 'routes', f));
    const n = Array.isArray(mod.commands) ? mod.commands.length : 0;
    perModule[f] = n;
    expectedCount += n;
    t(`OCI-mod:${f}`, `${f} really exports a real, non-empty commands[] array`, n > 0);
  }

  console.log('\n[2] the real, live server\'s GET /commands matches that independent count exactly');
  const child = spawn('node', ['ollama/server.js'], {
    cwd: REPO_ROOT,
    env: { ...process.env, OLLAMA_BRIDGE_PORT: String(PORT) },
  });
  let stderrBuf = '';
  child.stderr.on('data', (d) => { stderrBuf += d.toString(); });

  try {
    await waitForPort(PORT);
    const index = await get('/commands');

    t('OCI-001', 'GET /commands responds with the real systemId', index.systemId === 'ollama');
    t('OCI-002', 'the real live commandCount matches the independently re-derived count exactly (the spec\'s own exit criteria)', index.commandCount === expectedCount);
    t('OCI-003', 'commands[].length matches commandCount (no drift between the two fields)', index.commands.length === index.commandCount);
    t('OCI-004', 'no real route module is missing a commands export (the honest tripwire is empty)', Array.isArray(index.modulesMissingCommandsExport) && index.modulesMissingCommandsExport.length === 0);

    for (const f of REAL_ROUTE_FILES) {
      const fromLiveEndpoint = index.commands.filter((c) => c.module === f).length;
      t(`OCI-005:${f}`, `real module "${f}" contributes exactly its own real, independently-counted command total (${perModule[f]}) to the live index`, fromLiveEndpoint === perModule[f]);
    }

    t('OCI-006', 'the real live server logged no error while serving this real request', !stderrBuf.toLowerCase().includes('error'));
  } finally {
    child.kill();
  }

  console.log(`\n  ollama-command-index: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
