'use strict';
// ID-01..07 (0.60.92): the autopilot's idle signal, GET /idle. Real _state, Guardian's job list faked (its own tests cover the queue).
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert'), fs = require('fs'), path = require('path');
const _l = console.log, _e = console.error; console.log = console.error = () => {}; const AP = require('../../lib/nexus/autopilot.js'); console.log = _l; console.error = _e;   // the autopilot announces itself on load; the runner counts lines
let passed = 0, failed = 0;
const SEEDED = ['guardian', 'alpha', 'beta'];
async function test(name, fn) { for (const k of SEEDED) if (!AP._state[k]) AP._state[k] = { status: 'stable', proc: null, crashes: [] }; const snap = JSON.stringify(Object.fromEntries(Object.entries(AP._state).map(([k, s]) => [k, s.status]))); const procs = Object.fromEntries(Object.entries(AP._state).map(([k, s]) => [k, s.proc]));
  try { await fn(); console.log('  ok ' + name); passed++; } catch (e) { console.log('  FAIL ' + name + '\n    ' + String(e.stack || e).split('\n').slice(0, 4).join('\n    ')); failed++; }
  finally { for (const k of SEEDED) delete AP._state[k]; } }
const settle = () => { for (const s of Object.values(AP._state)) { s.status = 'stable'; s.proc = null; } };
const live = () => ({ exitCode: null, killed: false });
(async () => {
  await test('ID-01 nothing running: idle, no reasons, Guardian reported as not running', async () => { settle(); const r = await AP._idleReport(); assert.strictEqual(r.idle, true); assert.deepStrictEqual(r.reasons, []); assert.deepStrictEqual(r.guardian, { running: false }); });
  await test('ID-02 a kernel that is starting or restarting is not idle, and is named', async () => { settle(); const [a, b] = ['alpha', 'beta']; AP._state[a].status = 'starting'; AP._state[b].status = 'restarting'; const r = await AP._idleReport(); assert.strictEqual(r.idle, false); assert.ok(r.reasons.includes(`${a} is starting`)); assert.ok(r.reasons.includes(`${b} is restarting`)); });
  await test('ID-03 Guardian running with an active job (queued, pending, dispatched, started, responding): not idle, counted, statuses named', async () => {
    settle(); AP._state.guardian.proc = live(); for (const st of ['queued', 'pending', 'dispatched', 'started', 'responding']) { const r = await AP._idleReport({ fetchJobs: async () => ({ jobs: [{ id: 1, status: 'complete' }, { id: 2, status: st }] }) }); assert.strictEqual(r.idle, false, st); assert.match(r.reasons[0], new RegExp(`1 Guardian job in progress \\(${st}\\)`)); assert.strictEqual(r.guardian.active, 1); }
  });
  await test('ID-04 Guardian running with only finished jobs (complete, error): idle', async () => { settle(); AP._state.guardian.proc = live(); const r = await AP._idleReport({ fetchJobs: async () => ({ jobs: [{ status: 'complete' }, { status: 'error' }, { status: 'ignored' }] }) }); assert.strictEqual(r.idle, true); assert.strictEqual(r.guardian.active, 0); assert.strictEqual(r.guardian.total, 3); });
  await test('ID-05 Guardian is running but does not answer: NOT idle, and it says it cannot tell (never a guess)', async () => { settle(); AP._state.guardian.proc = live(); const r = await AP._idleReport({ fetchJobs: async () => { throw new Error('timed out'); } }); assert.strictEqual(r.idle, false); assert.match(r.reasons[0], /cannot tell.*did not answer \/jobs.*timed out/); });
  await test('ID-06 the route exists on the status server, is read-only (GET), and is exported', () => { const src = fs.readFileSync(path.join(__dirname, '..', '..', 'lib', 'nexus', 'autopilot.js'), 'utf8'); assert.match(src, /req\.method === 'GET' && req\.url === '\/idle'/); assert.strictEqual(typeof AP._idleReport, 'function'); });
  await test('ID-07 the active-job words are the ones Guardian really writes (queued, pending, dispatched, started, responding)', () => { const g = fs.readFileSync(path.join(__dirname, '..', '..', 'guardian', 'server.js'), 'utf8'); for (const w of ['queued', 'pending', 'dispatched', 'started', 'responding']) assert.ok(new RegExp(`status\\s*[:=]\\s*'${w}'|status: '${w}'`).test(g), w); });
  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
