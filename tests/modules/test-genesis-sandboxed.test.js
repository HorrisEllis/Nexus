'use strict';
/**
 * tests/modules/test-genesis-sandboxed.test.js — the genesis fork: sealed sandbox, the registry the drawbridge, three tunnels (0.60.199)
 * Map: docs/2026-10-17-system-drawbridge-phasemap.spec (addendum f, DB19).
 * James, 2026-10-21: "can you add to a fork of genesis spec, its contained in a isolated sandbox using the component registry as a
 * drawbridge, and tunnel into the compartment, the bridge, and interaction contract."
 *
 *   GSB-01  the fork names the genesis version it forks, and that is genesis's version now (fails the day genesis moves on)
 *   GSB-02  its catalog passes the same manifest check genesis does; the fork carries only its additions (no copy of genesis)
 *   GSB-03  the wall, the drawbridge and the three tunnels are in it, and what it says it stands on exists in the code
 *   GSB-04  it is a template: listed, and seeded as genesis first, then the fork
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 4).join('\n    ') : e.message}`); failed++; }
}

(async () => {
  console.log('\n⬡  genesis-sandboxed — a fork of genesis\n');
  const fork = read('idearium/spec-engine/templates/genesis-sandboxed.spec');
  const genesis = read('idearium/spec-engine/templates/genesis.spec');

  await test('GSB-01', 'the fork names the genesis version it forks, and genesis is still at it', () => {
    const named = fork.match(/^fork_of genesis (\S+)$/m);
    const now = genesis.match(/^version (\S+)$/m);
    assert.ok(named && now, 'both versions readable');
    assert.strictEqual(named[1], now[1], `genesis is at ${now[1]}; the fork was written against ${named[1]} — read the change and bring the fork up to it`);
  });

  await test('GSB-02', 'its catalog checks clean; it carries only its additions', async () => {
    const { dispatch } = await import(pathToFileURL(path.join(ROOT, 'idearium/spec-engine/manifest/commands.js')).href);
    const r = dispatch(['check', path.join(ROOT, 'idearium/spec-engine/templates/genesis-sandboxed.spec')], {});
    assert.ok(r.result.ok && !r.result.violations.length, JSON.stringify(r.result.violations));
    assert.strictEqual(r.result.manifest.count, 6);
    assert.ok(!/catalog GENESIS_FILE_TREE/.test(fork) && !/^domain "registry"/m.test(fork), 'no copy of genesis inside the fork');
  });

  await test('GSB-03', 'the wall, the drawbridge, three tunnels; what it stands on exists', () => {
    for (const a of ['SEALED_SANDBOX', 'DRAWBRIDGE_IS_THE_ONLY_CROSSING', 'THREE_TUNNELS', 'TUNNEL_IS_DECLARED', 'HANDSHAKE_AT_THE_GATE', 'SANDBOX_IS_DISPOSABLE'])
      assert.ok(new RegExp(`^axiom ${a}\\b`, 'm').test(fork), a);
    for (const d of ['sandbox', 'drawbridge', 'tunnel']) assert.ok(new RegExp(`^domain "${d}"`, 'm').test(fork), d);
    for (const t of ['compartment', 'bridge', 'contract']) assert.ok(new RegExp(`^tunnel\\.${t}\\s+=`, 'm').test(fork), `tunnel.${t}`);
    assert.ok(/its contained in a isolated sandbox using the component registry as a drawbridge/.test(fork), 'his words, verbatim');
    const SR = require(path.join(ROOT, 'lib/system-registry.js'));
    assert.ok(typeof SR.tunnel === 'function' && typeof SR.heartbeat === 'function', 'the tunnel\'s outside end');
    for (const f of ['lib/drawbridge-registry.js', 'lib/cos-bridge.js', 'cos/compartment/qemu-runtime.js'])
      assert.ok(fs.existsSync(path.join(ROOT, f)), f);
    for (const f of ['lib/handoff.js', 'contracts/handshake.js', 'interaction-contract.json', 'lib/commands.js', 'lib/boundary.js'])
      assert.ok(genesis.includes(`file "${f}"`), `genesis's ${f}`);
  });

  await test('GSB-04', 'a template: listed, seeded as genesis then the fork', () => {
    const T = require(path.join(ROOT, 'idearium/spec-engine/templates.js'));
    const t = T.listTemplates().find(x => x.id === 'genesis-sandboxed');
    assert.ok(t && t.kind === 'system' && t.hasSeed, JSON.stringify(t));
    const seed = T.readSeed('genesis-sandboxed');
    assert.ok(seed.startsWith(genesis) && seed.endsWith(fork), 'genesis whole first, then the fork whole');
    assert.strictEqual(T.readSeed('genesis'), genesis, 'genesis itself is unchanged by the fork');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
