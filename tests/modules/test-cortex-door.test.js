'use strict';
/**
 * tests/modules/test-cortex-door.test.js — Cortex's door (DO3a, docs/2026-10-31-system-doors-phasemap.spec)
 * James, 2026-11-05: "they all need the door build". 2026-11-03: "the server.js is the process for each system. It’s what cos manages."
 *
 *   DR-01  node cortex/server.js is Cortex: /handshake names the door, its component count and its registry's hash; /registry lists them
 *   DR-02  the route table recorded through boot.js alone, replayed through the door: every route answers the same (status and keys)
 *   DR-03  the CLI on the door: a line runs the component whose grammar it starts with, through its own route; an unknown line is
 *          refused with the commands, never guessed
 *   DR-04  COS starts the door: compartment.json and the compartment table name cortex/server.js; boot.js run directly still starts
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const D = require(path.join(ROOT, 'cortex/server.js'));
const REG = require(path.join(ROOT, 'cortex/registry-components.js'));

let passed = 0, failed = 0;
const kids = [];
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${(e.stack || e.message).split('\n').slice(0, 5).join('\n    ')}`); failed++; } }
const freePort = () => new Promise((r) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
function req(port, method, p, body) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({ hostname: '127.0.0.1', port, path: p, method, timeout: 15000, headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {} }, (res) => {
      let b = ''; res.on('data', d => { b += d; }); res.on('end', () => { let json = null; try { json = JSON.parse(b); } catch (_) {} resolve({ status: res.statusCode, json }); });
    });
    r.on('error', (e) => resolve({ status: 0, error: e.message })); r.on('timeout', () => { r.destroy(); resolve({ status: 0, error: 'timeout' }); });
    if (data) r.write(data); r.end();
  });
}
async function boot(entry) {
  const port = await freePort();
  const child = spawn(process.execPath, [entry], { cwd: ROOT, env: { ...process.env, NEXUS_PORT: String(port), ORCH_URL: 'http://127.0.0.1:1', INTELLIGENCE_PORT: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  kids.push(child); let out = ''; child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
  for (let i = 0; i < 120; i++) { const h = await req(port, 'GET', '/health'); if (h.status === 200) return { port, child, out: () => out }; await new Promise(r => setTimeout(r, 250)); }
  throw new Error(`${entry} did not answer /health on :${port}\n${out.slice(-800)}`);
}
// what a route answers, without its moving parts: the status and the top-level keys of its JSON
const shape = (r) => ({ status: r.status, keys: r.json && typeof r.json === 'object' && !Array.isArray(r.json) ? Object.keys(r.json).sort() : (Array.isArray(r.json) ? 'array' : typeof r.json) });
const STABLE_GETS = REG.filter(c => c.route && c.route.method === 'GET' && !/[:*]/.test(c.route.path) && !/stream/.test((c.tags || []).join(' ')) && c.route.path !== '/events').map(c => c.route.path);

(async () => {
  console.log('\n⬡  Cortex\'s door (DO3a)\n');
  let viaDoor = null, viaBoot = null;
  try { viaDoor = await boot('cortex/server.js'); } catch (e) { console.error(e.message); }

  await test('DR-01', 'cortex/server.js answers the handshake and the registry from its own registry', async () => {
    assert.ok(viaDoor, 'the door did not start');
    const h = await req(viaDoor.port, 'GET', '/handshake');
    assert.strictEqual(h.status, 200);
    const comps = REG.filter(c => c && c.route && c.route.path);
    assert.deepStrictEqual([h.json.system, h.json.door, h.json.components, h.json.registryHash, h.json.port], ['cortex', 'cortex/server.js', comps.length, D.registryHash(comps), viaDoor.port], JSON.stringify(h.json));
    const r = await req(viaDoor.port, 'GET', '/registry');
    assert.strictEqual(r.json.components.length, comps.length);
    assert.ok(r.json.components.some(c => c.id === 'cortex.raid.decide' && c.route.path === '/api/raid/decide'));
    assert.match(viaDoor.out(), /door open on :\d+ — registry, handshake and CLI/);
  });

  await test('DR-02', `the route table through boot.js alone, replayed through the door: the same (${STABLE_GETS.length} GET routes)`, async () => {
    assert.ok(viaDoor, 'the door did not start');
    viaBoot = await boot('cortex/boot.js');
    const diff = [];
    for (const p of STABLE_GETS) {
      const a = shape(await req(viaBoot.port, 'GET', p)), b = shape(await req(viaDoor.port, 'GET', p));
      if (JSON.stringify(a) !== JSON.stringify(b)) diff.push(`${p}: boot ${JSON.stringify(a)} door ${JSON.stringify(b)}`);
    }
    assert.ok(STABLE_GETS.length >= 10, `only ${STABLE_GETS.length} routes to replay`);
    assert.deepStrictEqual(diff, []);
    const before = await req(viaBoot.port, 'GET', '/handshake');
    assert.ok(!(before.json && before.json.door), 'boot.js alone has no door');
  });

  await test('DR-03', 'the CLI runs a component through its own route; an unknown line is refused with the commands', async () => {
    assert.ok(viaDoor, 'the door did not start');
    const ok = await req(viaDoor.port, 'POST', '/cli', { line: 'health' });
    assert.deepStrictEqual([ok.status, ok.json.component, ok.json.status], [200, 'cortex.health', 200], JSON.stringify(ok.json).slice(0, 300));
    assert.ok(ok.json.result && ok.json.result.ok, 'the result is the route\'s own answer');
    const no = await req(viaDoor.port, 'POST', '/cli', { line: 'make me a sandwich' });
    assert.ok(no.status === 404 && /no Cortex command starts/.test(no.json.error) && no.json.commands.includes('health'), JSON.stringify(no.json).slice(0, 300));
    const bad = await req(viaDoor.port, 'POST', '/cli', { nope: 1 });
    assert.strictEqual(bad.status, 400);
    const door = D.createDoor({ registry: [{ id: 'x.raid', route: { method: 'GET', path: '/a' }, grammar: ['raid'] }, { id: 'x.raid.status', route: { method: 'GET', path: '/b' }, grammar: ['raid status'] }] });
    assert.strictEqual(door.match('raid status now').component.id, 'x.raid.status', 'the longest grammar wins');
    assert.strictEqual(door.match('raids'), null, 'a word is matched whole');
  });

  await test('DR-04', 'COS starts the door: compartment.json and the compartment table name cortex/server.js', () => {
    const c = JSON.parse(fs.readFileSync(path.join(ROOT, 'cortex/compartment.json'), 'utf8'));
    assert.strictEqual(c.runtime.entry, 'cortex/server.js');
    assert.ok(JSON.stringify(c.runtime.process || c.runtime).includes('cortex/server.js') && !JSON.stringify(c.runtime).includes('cortex/boot.js'));
    assert.match(fs.readFileSync(path.join(ROOT, 'lib/cli/compartments.js'), 'utf8'), /cortex: 'cortex\/server\.js'/);
    assert.ok(viaBoot, 'boot.js run directly still starts (an old launcher keeps working until DO4)');
  });

  for (const k of kids) { try { k.kill(); } catch (_) {} }
  console.log(`\n  ${passed} passed, ${failed} failed\n`); process.exitCode = failed ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 300);
})();
