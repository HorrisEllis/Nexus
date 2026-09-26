'use strict';
/**
 * test/userscripts-manifest.test.js — clear-glass/src/userscripts/
 * manager.js's YAML-driven _loadGuardianScripts() coverage.
 * UUID: cg-test-userscripts-manifest-v1-0000-2026-0903-001
 *
 * Real scratch guardianDir + real guardian/userscripts.yaml-shaped
 * manifest written to disk — exercises the real yaml.load()+fs path, not
 * a mocked loader.
 *
 * Run: node test/userscripts-manifest.test.js
 */

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const UserscriptManager = require('../src/userscripts/manager');

let passed = 0, failed = 0;
const results = [];
async function test(name, fn) {
  try { await fn(); passed++; results.push({ name, ok: true }); console.log(`  ✓ ${name}`); }
  catch (err) { failed++; results.push({ name, ok: false, error: err.message }); console.log(`  ✗ ${name}: ${err.message}`); }
}
function assert(cond, msg = 'assertion failed') { if (!cond) throw new Error(msg); }
function assertEqual(a, b, msg) { if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(a)} === ${JSON.stringify(b)}`); }

function makeScratchGuardianDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-userscripts-test-'));
  fs.writeFileSync(path.join(dir, 'userscript-claude.js'), '// ==UserScript==\n// fake claude script\n');
  fs.writeFileSync(path.join(dir, 'userscript-memory.js'), '// ==UserScript==\n// fake memory script\n');
  fs.writeFileSync(path.join(dir, 'userscript-ollama.js.deprecated'), '// deprecated\n');
  // Deliberately no userscript-nexus-wake.js on disk — standalone: false
  // means the loader should never look for it as an independent entry.
  fs.writeFileSync(path.join(dir, 'userscripts.yaml'), `
version: 1
components:
  claude:
    id: guardian-claude
    name: "Guardian — Claude"
    file: userscript-claude.js
    matches: ["https://claude.ai/*"]
    standalone: true
  memory:
    id: guardian-memory
    name: "Cortex Memory Observer"
    file: userscript-memory.js
    matches: ["https://claude.ai/*", "https://chatgpt.com/*"]
    standalone: true
  nexus_wake:
    id: guardian-nexus-wake
    name: "Nexus Wake Word"
    file: userscript-nexus-wake.js
    matches: []
    standalone: false
    composed_into: [claude]
  ollama:
    id: guardian-ollama
    name: "Guardian — Ollama"
    file: userscript-ollama.js
    matches: ["http://localhost:11434/*"]
    standalone: true
    loadable: false
`);
  return dir;
}

async function main() {
  console.log('\n[1] YAML-driven guardian userscript loading');

  const dir = makeScratchGuardianDir();
  const mgr = new UserscriptManager({ guardianDir: dir });
  await mgr.init();
  const loaded = mgr.list({ type: 'guardian' });

  await test('claude script loads from the real manifest', async () => {
    const c = loaded.find(s => s.id === 'guardian-claude');
    assert(c, 'guardian-claude not loaded');
    assertEqual(c.matches[0], 'https://claude.ai/*');
  });

  await test('memory script loads — the real gap this rewrite closes', async () => {
    const m = loaded.find(s => s.id === 'guardian-memory');
    assert(m, 'guardian-memory not loaded — this is the exact gap guardian/userscripts.yaml documents fixing');
  });

  await test('standalone:false component (nexus_wake) is never independently loaded', async () => {
    const w = loaded.find(s => s.id === 'guardian-nexus-wake');
    assert(!w, 'nexus_wake must not appear as its own loadable entry');
  });

  await test('loadable:false component (ollama) is skipped even though listed', async () => {
    const o = loaded.find(s => s.id === 'guardian-ollama');
    assert(!o, 'ollama is explicitly loadable:false and must not load');
  });

  await test('a stale manifest entry pointing at a missing file warns, does not throw', async () => {
    const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-userscripts-test2-'));
    fs.writeFileSync(path.join(dir2, 'userscripts.yaml'), `
version: 1
components:
  ghost:
    id: guardian-ghost
    name: "Ghost"
    file: userscript-does-not-exist.js
    matches: []
    standalone: true
`);
    const mgr2 = new UserscriptManager({ guardianDir: dir2 });
    await mgr2.init(); // must not throw
    assertEqual(mgr2.list({ type: 'guardian' }).length, 0);
    fs.rmSync(dir2, { recursive: true, force: true });
  });

  await test('a missing userscripts.yaml warns and yields zero scripts, not a crash', async () => {
    const dir3 = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-userscripts-test3-'));
    const mgr3 = new UserscriptManager({ guardianDir: dir3 });
    await mgr3.init();
    assertEqual(mgr3.list({ type: 'guardian' }).length, 0);
    fs.rmSync(dir3, { recursive: true, force: true });
  });

  fs.rmSync(dir, { recursive: true, force: true });

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Clear Glass — Userscripts Manifest Tests`);
  console.log(`Passed: ${passed}  Failed: ${failed}  Total: ${passed + failed}`);
  if (failed > 0) {
    results.filter(r => !r.ok).forEach(r => console.log(`  ✗ ${r.name}: ${r.error}`));
    process.exit(1);
  } else {
    console.log('All tests pass ✓');
    process.exit(0);
  }
}

main();
