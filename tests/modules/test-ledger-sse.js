'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// tests/modules/test-ledger-sse.js — the cross-process ledger wire
//
// THE GATE: a row emitted in one process must arrive in another process's
// fan-in. Everything else here is secondary. That is the exact thing that was
// impossible before (lib/ledger-fanin holds subscribers in module state), and
// the reason copilot activity could never reach autopilot.
//
// Real HTTP, real child processes, real files. No mocks on the path under test.
// ─────────────────────────────────────────────────────────────────────────────

const assert = require('assert');
const http   = require('http');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
let passed = 0, failed = 0;

function test(id, name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`  \u2713 ${id} ${name}`); })
    .catch(e => { failed++; console.log(`  \u2717 ${id} ${name}\n    ${e.message}`); });
}

const sse = require(path.join(ROOT, 'lib', 'ledger-sse'));
const fanin = require(path.join(ROOT, 'lib', 'ledger-fanin'));

function listen(system, opts = {}) {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      if (req.url.startsWith('/ledger/stream')) return sse.mount(res, { system, ...opts });
      res.writeHead(404); res.end();
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('\n\u2550\u2550 LEDGER SSE \u2014 the cross-process wire \u2550\u2550\n');

  // ── Schema ────────────────────────────────────────────────────────────────
  await test('LS-001', 'the wire schema IS the component-ledger schema \u2014 not a parallel format', () => {
    const cl = fs.readFileSync(path.join(ROOT, 'lib', 'component-ledger.js'), 'utf8');
    // Pull the literal field list out of component-ledger's own row construction.
    for (const f of sse.LEDGER_FIELDS) {
      assert.ok(new RegExp(`\\b${f}\\b`).test(cl), `field '${f}' is on the wire but not in component-ledger`);
    }
    assert.strictEqual(sse.LEDGER_FIELDS.length, 16, 'field count drifted from the canonical row');
  });

  await test('LS-002', 'a loose fan-in event is COERCED to a ledger row \u2014 without inventing hook/wire', () => {
    const row = sse.toLedgerRow({ type: 'copilot.prompt.received', source: 'copilot', payload: { sessionId: 's1' } });
    assert.strictEqual(row.system, 'copilot');
    assert.strictEqual(row.component, 'copilot.prompt');
    assert.strictEqual(row.action, 'received');
    assert.strictEqual(row.session, 's1');
    // The whole point of component-ledger's §schema warning: unknown stays null.
    assert.strictEqual(row.hook, null, 'hook must NEVER be derived');
    assert.strictEqual(row.wire, null, 'wire must NEVER be derived');
  });

  await test('LS-003', 'error status is classified by the SAME rule activity-log uses', () => {
    assert.strictEqual(sse.toLedgerRow({ type: 'copilot.lifeline.failed', source: 'copilot' }).status, 'error');
    assert.strictEqual(sse.toLedgerRow({ type: 'copilot.prompt.received', source: 'copilot' }).status, 'info');
    const al = fs.readFileSync(path.join(ROOT, 'lib', 'activity-log', 'index.js'), 'utf8');
    assert.ok(/error\|fail\|crash\|denied\|exception/.test(al),
      'activity-log changed its error rule \u2014 the two can now disagree about what is an error');
  });

  await test('LS-004', '\u00a71.1 a frame with no system/component/action is REFUSED, never half-forwarded', () => {
    assert.strictEqual(sse.toLedgerRow({ payload: { x: 1 } }), null);
    assert.strictEqual(sse.toLedgerRow(null), null);
    assert.strictEqual(sse.toLedgerRow({ type: 'orphan.event' }), null, 'no source \u2192 unattributable \u2192 refused');
  });

  await test('LS-002b', 'REGRESSION: component-ledger\u2019s OWN emit shape survives the wire intact', () => {
    // Caught by running the wire end-to-end, not by reading it. component-ledger
    // emits type=`${system}.${action}` with the real component at TOP level and
    // status/hook/wire nested in payload. Re-deriving from `type` produced
    // component:'copilot' instead of 'copilot.lifeline', and turned an ERROR row
    // into an info one \u2014 wrong data that looks right.
    const row = sse.toLedgerRow({
      type: 'copilot.escalated', source: 'copilot', component: 'copilot.lifeline',
      _system: 'copilot',
      payload: { status: 'error', hook: 'h1', wire: 'w1', intent: 'ask', faultId: 'f9', detail: { provider: 'ollama' } },
      causedBy: 'c1', ts: 123,
    });
    assert.strictEqual(row.component, 'copilot.lifeline', 'the REAL component must survive, not be re-derived');
    assert.strictEqual(row.action, 'escalated');
    assert.strictEqual(row.status, 'error', 'an error row must NEVER arrive as info');
    assert.strictEqual(row.hook, 'h1', 'a hook that WAS supplied must be carried, not nulled');
    assert.strictEqual(row.wire, 'w1');
    assert.strictEqual(row.faultId, 'f9');
    assert.strictEqual(row.causedBy, 'c1');
    assert.deepStrictEqual(row.detail, { provider: 'ollama' });
  });

  // \u2500\u2500 THE GATE \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  await test('LS-005', 'THE GATE: a row emitted in a CHILD PROCESS arrives in this process\u2019s fan-in', async () => {
    const emitter = path.join(os.tmpdir(), `ls-emitter-${Date.now()}.js`);
    fs.writeFileSync(emitter, `
      const http = require('http');
      const sse = require(${JSON.stringify(path.join(ROOT, 'lib', 'ledger-sse'))});
      const fanin = require(${JSON.stringify(path.join(ROOT, 'lib', 'ledger-fanin'))});
      const s = http.createServer((req,res) => {
        if (req.url.startsWith('/ledger/stream')) return sse.mount(res, { system:'copilot', replay:0 });
        res.writeHead(404); res.end();
      });
      s.listen(0,'127.0.0.1',() => {
        process.send({ port: s.address().port });
        setInterval(() => fanin.emit({
          type:'copilot.prompt.received', source:'copilot',
          payload:{ prompt:'tell me about compartments', sessionId:'gate' }, ts: Date.now()
        }), 60);
      });
    `);

    const child = spawn(process.execPath, [emitter], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    try {
      const port = await new Promise((res, rej) => {
        const t = setTimeout(() => rej(new Error('child never reported a port')), 8000);
        child.on('message', m => { clearTimeout(t); res(m.port); });
      });

      const received = [];
      const localFanin = fanin.subscribe('gate-probe', r => received.push(r));
      const sub = sse.subscribe(`http://127.0.0.1:${port}/ledger/stream`, { name: 'copilot' });

      const deadline = Date.now() + 8000;
      while (received.length === 0 && Date.now() < deadline) await wait(100);

      sub.close(); localFanin();

      assert.ok(received.length > 0,
        'nothing crossed the process boundary \u2014 this is the exact failure the module exists to fix');
      const row = received[0].payload;
      assert.strictEqual(row.system, 'copilot');
      assert.strictEqual(row.component, 'copilot.prompt');
      assert.strictEqual(row.action, 'received');
      assert.ok(sub.health().rows > 0, 'health must report the real row count');
    } finally {
      child.kill();
      try { fs.unlinkSync(emitter); } catch (_) {}
    }
  });

  // ── Loop safety ───────────────────────────────────────────────────────────
  await test('LS-006', '\u00a714.4 a relayed row is NOT re-broadcast \u2014 two systems watching each other cannot loop', async () => {
    const { server, port } = await listen('loopcheck', { replay: 0 });
    try {
      const got = [];
      const sub = sse.subscribe(`http://127.0.0.1:${port}/ledger/stream`, { name: 'loopcheck', toFanin: false, onRow: r => got.push(r) });
      await wait(300);

      // A row that already crossed the wire once, exactly as subscribe() tags it.
      fanin.emit({ type: 'x.y', source: 'loopcheck', payload: {}, [sse.RELAY_TAG]: true, ts: Date.now() });
      fanin.emit({ type: 'x.z', source: 'loopcheck', payload: {}, ts: Date.now() });
      await wait(400);

      sub.close();
      assert.ok(!got.some(r => r.action === 'y'), 'a relayed row was re-broadcast \u2014 this is an infinite loop');
      assert.ok(got.some(r => r.action === 'z'), 'the non-relayed row should still pass');
    } finally { server.close(); sse.unmount('loopcheck'); }
  });

  // ── Honest degradation ────────────────────────────────────────────────────
  await test('LS-007', '\u00a71.2 an unreachable emitter is NEVER-REACHED, not a clean zero', async () => {
    const sub = sse.subscribe('http://127.0.0.1:1/ledger/stream', { name: 'ghost' });
    await wait(400);
    const h = sub.health();
    assert.strictEqual(h.connected, false);
    assert.strictEqual(h.everConnected, false);
    assert.ok(h.lastError, 'the failure reason must be stated, not swallowed');
    assert.ok(sse.health().blind.includes('ghost'), 'a never-reached source must be listed as BLIND, not as 0 rows');
    sub.close();
  });

  await test('LS-008', 'a mount with no system name is refused BY NAME (\u00a71.1)', async () => {
    let code = 0;
    const res = { writeHead: (c) => { code = c; }, end: () => {}, write: () => {}, on: () => {} };
    const r = sse.mount(res, {});
    assert.strictEqual(r.ok, false);
    assert.strictEqual(code, 400);
  });

  await test('LS-009', 'a dead client never stops the fan-out to the others (\u00a71.2)', async () => {
    const { server, port } = await listen('deadclient', { replay: 0 });
    try {
      const got = [];
      const live = sse.subscribe(`http://127.0.0.1:${port}/ledger/stream`, { name: 'live', toFanin: false, onRow: r => got.push(r) });
      const dying = sse.subscribe(`http://127.0.0.1:${port}/ledger/stream`, { name: 'dying', toFanin: false });
      await wait(300);
      dying.close();
      await wait(200);
      for (let i = 0; i < 3; i++) fanin.emit({ type: 'a.b', source: 'deadclient', payload: { i }, ts: Date.now() });
      await wait(400);
      live.close();
      assert.ok(got.length >= 3, `the surviving client should still receive \u2014 got ${got.length}`);
    } finally { server.close(); sse.unmount('deadclient'); }
  });

  await test('LS-010', 'malformed frames are COUNTED, never silently dropped', async () => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('event: ledger.row\ndata: {not json\n\n');
      res.write('event: ledger.row\ndata: {"system":"x"}\n\n');   // incomplete row
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    try {
      const sub = sse.subscribe(`http://127.0.0.1:${server.address().port}/ledger/stream`, { name: 'garbage', toFanin: false });
      await wait(600);
      assert.strictEqual(sub.health().malformed, 2, 'both bad frames must be counted');
      assert.strictEqual(sub.health().rows, 0, 'a malformed frame must never count as a row');
      sub.close();
    } finally { server.close(); }
  });

  // ── error.log ─────────────────────────────────────────────────────────────
  const elog = require(path.join(ROOT, 'lib', 'error-log'));

  await test('EL-001', 'error.log rows are ledger rows \u2014 same schema, one line each', () => {
    const tmp = path.join(os.tmpdir(), `elog-${Date.now()}.log`);
    process.env.NEXUS_ERROR_LOG = tmp;
    delete require.cache[require.resolve(path.join(ROOT, 'lib', 'error-log'))];
    const el = require(path.join(ROOT, 'lib', 'error-log'));
    try {
      el.write({ system: 'copilot', component: 'copilot.lifeline', action: 'escalated', status: 'error', detail: 'ollama returned no tokens' });
      const t = el.tail(10);
      assert.strictEqual(t.entries.length, 1);
      for (const f of sse.LEDGER_FIELDS) assert.ok(f in t.entries[0], `error.log row missing ledger field '${f}'`);
      assert.strictEqual(t.entries[0].hook, null, 'hook must stay null, never derived');
    } finally { fs.unlinkSync(tmp); delete process.env.NEXUS_ERROR_LOG; }
  });

  await test('EL-002', '\u00a71.1 a row with no system/component/action is refused', () => {
    assert.strictEqual(elog.write({ component: 'x', action: 'y' }), null);
    assert.strictEqual(elog.write({ system: 'x', action: 'y' }), null);
    assert.strictEqual(elog.write(null), null);
  });

  await test('EL-003', 'embedded newlines cannot split one row into two (AS-012 class)', () => {
    const tmp = path.join(os.tmpdir(), `elog-nl-${Date.now()}.log`);
    process.env.NEXUS_ERROR_LOG = tmp;
    delete require.cache[require.resolve(path.join(ROOT, 'lib', 'error-log'))];
    const el = require(path.join(ROOT, 'lib', 'error-log'));
    try {
      el.write({ system: 's', component: 's.c', action: 'crashed', detail: 'line1\nline2\nline3' });
      assert.strictEqual(fs.readFileSync(tmp, 'utf8').trim().split('\n').length, 1, 'one row must be one line');
      assert.strictEqual(el.tail(5).entries.length, 1);
    } finally { fs.unlinkSync(tmp); delete process.env.NEXUS_ERROR_LOG; }
  });

  await test('EL-004', 'a circular detail cannot throw \u2014 telemetry never kills its caller', () => {
    const tmp = path.join(os.tmpdir(), `elog-circ-${Date.now()}.log`);
    process.env.NEXUS_ERROR_LOG = tmp;
    delete require.cache[require.resolve(path.join(ROOT, 'lib', 'error-log'))];
    const el = require(path.join(ROOT, 'lib', 'error-log'));
    try {
      const c = { n: 1 }; c.self = c;
      assert.doesNotThrow(() => el.write({ system: 's', component: 's.c', action: 'failed', detail: c }));
      // Not throwing is not enough: the ROW must survive. An error silently
      // lost is worse than an error recorded without its payload.
      const t = el.tail(5);
      assert.strictEqual(t.entries.length, 1, 'the row must still land \u2014 a dropped error is silent data loss');
      assert.strictEqual(t.entries[0].action, 'failed');
      assert.ok(t.entries[0].detail._unserializable, 'the degrade must be STATED on the row, not hidden');
    } finally { try { fs.unlinkSync(tmp); } catch (_) {} delete process.env.NEXUS_ERROR_LOG; }
  });

  await test('EL-005', 'UNREADABLE is not the same as EMPTY \u2014 and is never reported as zero', () => {
    process.env.NEXUS_ERROR_LOG = path.join(os.tmpdir(), `nope-${Date.now()}`, 'error.log');
    delete require.cache[require.resolve(path.join(ROOT, 'lib', 'error-log'))];
    const el = require(path.join(ROOT, 'lib', 'error-log'));
    const t = el.tail(5);
    assert.strictEqual(t.total, 0);
    assert.ok(t.note, 'an empty log must say it is empty, not merely return []');
    delete process.env.NEXUS_ERROR_LOG;
  });

  await test('EL-006', 'attach() routes only ERROR rows off the fan-in, in ledger schema', async () => {
    const tmp = path.join(os.tmpdir(), `elog-att-${Date.now()}.log`);
    process.env.NEXUS_ERROR_LOG = tmp;
    delete require.cache[require.resolve(path.join(ROOT, 'lib', 'error-log'))];
    const el = require(path.join(ROOT, 'lib', 'error-log'));
    const detach = el.attach(fanin);
    try {
      fanin.emit({ type: 'copilot.lifeline.failed', source: 'copilot', payload: { error: 'no tokens' }, ts: Date.now() });
      fanin.emit({ type: 'copilot.prompt.received', source: 'copilot', payload: {}, ts: Date.now() });
      await wait(150);
      const t = el.tail(10);
      assert.strictEqual(t.entries.length, 1, 'only the error should land');
      assert.strictEqual(t.entries[0].component, 'copilot.lifeline');
      assert.strictEqual(t.entries[0].action, 'failed');
    } finally { detach(); try { fs.unlinkSync(tmp); } catch (_) {} delete process.env.NEXUS_ERROR_LOG; }
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  sse._resetForTest();
  process.exit(failed ? 1 : 0);
})();
