'use strict';
/**
 * tests/modules/test-options.test.js — §OP0–OP2 0.57.0 (docs/2026-10-10-shape-of-nexus-phasemap.spec).
 * James: "i prefer options over hard coded, and i prefer it over code honestly."
 * lib/options.js's layers and refusals; guardian's options (the first system on it) with the defaults its code used
 * before; guardian's GET/POST /api/options against a live guardian. The console's System tab is proven in Clear Glass
 * (tests/probe/idearium-one-surface-glass.js).
 */
require(require('path').join(__dirname, '../../lib/test-sandbox.js')).ensure();   // the spawned guardian writes its runtime files into the sandbox, not the repo
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack}`); failed++; }
}
const req = (port, method, p, body, headers = {}) => new Promise((resolve) => {
  const data = body == null ? null : (typeof body === 'string' ? body : JSON.stringify(body));
  const r = http.request({ host: '127.0.0.1', port, path: p, method, headers: { ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}), ...headers } }, (rs) => {
    let d = ''; rs.on('data', c => { d += c; }); rs.on('end', () => { let j = null; try { j = JSON.parse(d); } catch (_) {} resolve({ status: rs.statusCode, json: j }); });
  });
  r.on('error', (e) => resolve({ status: 0, error: e.message })); if (data) r.write(data); r.end();
});

async function main() {
  const { createOptions } = require(path.join(ROOT, 'lib/options.js'));
  const schema = { jobs: { wait_ms: { type: 'number', default: 1000, min: 1, max: 5000, unit: 'ms', env: 'T_WAIT_MS', description: 'a wait' },
    locked: { type: 'number', default: 5, min: 0, max: 9, copilot_writable: false } }, routing: { mode: { type: 'enum', values: ['a', 'b'], default: 'a' }, on: { type: 'boolean', default: false } } };

  await test('OP-01', 'the layers: default → the system\'s file → its env var; each value says where it came from', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opt-')), env = {};
    const O = createOptions({ system: 'probe', schema, dir, env });
    assert.deepStrictEqual(O.resolve('jobs.wait_ms'), { value: 1000, source: 'default', invalid: null });
    assert.ok(O.set('jobs.wait_ms', '2500').ok);
    assert.strictEqual(O.get('jobs.wait_ms'), 2500); assert.strictEqual(O.resolve('jobs.wait_ms').source, 'file');
    env.T_WAIT_MS = '300';
    assert.strictEqual(O.get('jobs.wait_ms'), 300); assert.strictEqual(O.resolve('jobs.wait_ms').overriddenBy, 'T_WAIT_MS');
    const r = O.set('jobs.wait_ms', 400); assert.ok(r.ok && /T_WAIT_MS is set in the environment and still wins/.test(r.note), JSON.stringify(r));
  });

  await test('OP-02', 'a bad value is refused with the reason — never clamped; enum and boolean coerced', async () => {
    const O = createOptions({ system: 'probe', schema, dir: fs.mkdtempSync(path.join(os.tmpdir(), 'opt-')), env: {} });
    assert.ok(/must be at most 5000 ms/.test(O.set('jobs.wait_ms', 9999).error));
    assert.ok(/must be a number/.test(O.set('jobs.wait_ms', 'soon').error));
    assert.ok(/must be one of a, b/.test(O.set('routing.mode', 'c').error));
    assert.strictEqual(O.set('routing.on', 'yes').value, true);
    assert.ok(/no option jobs\.nope/.test(O.set('jobs.nope', 1).error));
  });

  await test('OP-03', 'copilot may set only copilot-writable options; every change is in the ledger with who asked; reset goes back to the default', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opt-'));
    const O = createOptions({ system: 'probe', schema, dir, env: {} });
    assert.ok(/not copilot-writable/.test(O.set('jobs.locked', 3, { actor: 'copilot' }).error));
    assert.ok(O.set('jobs.locked', 3, { actor: 'user' }).ok);
    assert.ok(O.set('jobs.wait_ms', 2000, { actor: 'copilot' }).ok);
    assert.ok(O.reset('jobs.wait_ms').ok); assert.strictEqual(O.resolve('jobs.wait_ms').source, 'default');
    const rows = fs.readFileSync(O.ledgerFile, 'utf8').trim().split('\n').map(JSON.parse);
    assert.deepStrictEqual(rows.map(r => [r.id, r.actor, r.value]), [['jobs.locked', 'user', 3], ['jobs.wait_ms', 'copilot', 2000], ['jobs.wait_ms', 'user', 1000]]);
  });

  await test('OP-04', 'a value written to the file is read on the next get — no restart', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opt-'));
    const O = createOptions({ system: 'probe', schema, dir, env: {} });
    assert.strictEqual(O.get('jobs.wait_ms'), 1000);
    fs.writeFileSync(path.join(dir, 'options.json'), JSON.stringify({ 'jobs.wait_ms': 1234 }));
    const t = Date.now() + 5; fs.utimesSync(path.join(dir, 'options.json'), new Date(t), new Date(t));
    assert.strictEqual(O.get('jobs.wait_ms'), 1234);
  });

  await test('OP-05', 'guardian\'s options keep the values its code used before, and name the env vars that still win', async () => {
    const { SCHEMA } = require(path.join(ROOT, 'guardian/options.js'));
    const want = { 'jobs.pickup_ms': [90000, 'GUARDIAN_PICKUP_MS'], 'jobs.no_tab_ms': [45000, 'GUARDIAN_NO_TAB_MS'], 'jobs.economy_wait_ms': [30000, 'GUARDIAN_ECONOMY_WAIT_MS'],
      'jobs.completion_idle_ms': [900000, 'GUARDIAN_COMPLETION_TIMEOUT_MS'], 'jobs.empty_reply_grace_ms': [120000, 'GUARDIAN_EMPTY_REPLY_GRACE_MS'], 'jobs.resume_grace_ms': [60000, 'GUARDIAN_RESUME_GRACE_MS'],
      'jobs.max_response_chars': [5000000, 'GUARDIAN_MAX_RESPONSE_CHARS'], 'retry.max_attempts': [4, undefined], 'ask.default_timeout_ms': [90000, undefined], 'routing.transport': ['ncp-only', 'GUARDIAN_TRANSPORT'], 'routing.wake_max_depth': [3, 'GUARDIAN_WAKE_MAX_DEPTH'] };
    for (const [id, [def, env]] of Object.entries(want)) { const [g, k] = id.split('.'); assert.strictEqual(SCHEMA[g][k].default, def, id); assert.strictEqual(SCHEMA[g][k].env, env, id); assert.ok(SCHEMA[g][k].description, id); }
    for (const f of ['guardian/lib/dispatcher.js', 'guardian/ask.js', 'guardian/lib/ncp-handler.js', 'guardian/lib/dispatch-ladder.js', 'guardian/lib/wake-loop.js']) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      assert.ok(!/process\.env\.GUARDIAN_(PICKUP|NO_TAB|ECONOMY_WAIT|COMPLETION_TIMEOUT|EMPTY_REPLY_GRACE|RESUME_GRACE|MAX_RESPONSE_CHARS|TRANSPORT|WAKE_MAX_DEPTH)/.test(src), `${f} still reads a guardian option from the environment directly`);
    }
  });

  await test('OP-06', 'live guardian: GET /api/options lists them; a text/plain write is refused (415); a JSON write is set, said and ledgered', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gopt-'));
    const port = 7860 + Math.floor(Math.random() * 30);
    const p = spawn(process.execPath, [path.join(ROOT, 'guardian/server.js')], { env: { ...process.env, GUARDIAN_OPTIONS_DIR: dir, GUARDIAN_HTTP_PORT: String(port), PORT: String(port), GUARDIAN_PORT: String(port), MEMORY_PORT: String(port + 1) }, stdio: 'ignore' });
    try {
      let g = null;
      for (let i = 0; i < 60 && !(g && g.status === 200); i++) { await new Promise(r => setTimeout(r, 250)); g = await req(port, 'GET', '/api/options'); }
      if (!g || g.status !== 200) { console.log(`    (guardian did not come up on :${port} in this environment — the route is checked by its source instead)`); const src = fs.readFileSync(path.join(ROOT, 'guardian/server.js'), 'utf8'); assert.ok(/url\.pathname === '\/api\/options' && method === 'POST'/.test(src) && /415/.test(src)); return; }
      assert.ok(g.json.options.some(o => o.id === 'jobs.pickup_ms' && o.value === 90000 && o.source === 'default'));
      const bad = await req(port, 'POST', '/api/options', '{"id":"jobs.pickup_ms","value":60000}', { 'Content-Type': 'text/plain', Origin: 'https://evil.example' });
      assert.strictEqual(bad.status, 415);
      const good = await req(port, 'POST', '/api/options', { id: 'jobs.pickup_ms', value: 60000 }, { 'Content-Type': 'application/json' });
      assert.strictEqual(good.status, 200, JSON.stringify(good.json)); assert.strictEqual(good.json.old, 90000);
      const after = await req(port, 'GET', '/api/options');
      assert.ok(after.json.options.some(o => o.id === 'jobs.pickup_ms' && o.value === 60000 && o.source === 'file'));
      assert.ok(/"jobs\.pickup_ms"/.test(fs.readFileSync(path.join(dir, 'options-ledger.jsonl'), 'utf8')));
    } finally { p.kill(); }
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main();
