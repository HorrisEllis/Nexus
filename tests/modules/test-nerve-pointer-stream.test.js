'use strict';
/**
 * tests/modules/test-nerve-pointer-stream.test.js — the virtual mouse in Ollama's live stream (0.60.272)
 * James, 2026-10-28: "What about the nexus nerve and interaction field with ollama continuous data stream with its using the virtual
 * input/mouse"
 *
 *   NP-01  Clear Glass attention keeps each window's recent pointer acts (label, via) — a choose's open and pick are both there
 *   NP-02  pushContext sends every act since the last push to the stream, in order, with what, where and via; the next push without a
 *          new act sends nothing
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const http = require('http');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${(e.stack || e.message).split('\n').slice(0, 6).join('\n    ')}`); failed++; } }

(async () => {
  console.log('\n⬡  The virtual mouse in the live stream\n');
  const Att = require(path.join(ROOT, 'clear-glass/src/page/attention.js'));
  const factory = Att.createAttention || Att.create || Att;
  let t = 1000; const A = typeof factory === 'function' ? factory({ now: () => t }) : factory;

  let wins;
  await test('NP-01', 'attention keeps the recent acts with label and via; the open and the pick both stay', async () => {
    A.note('field.pointer', { agentId: 'w1', do: 'click', x: 100, y: 200, label: 'open BASIC', via: 'eros', ts: 1000 });
    t = 1400; A.note('field.pointer', { agentId: 'w1', do: 'click', x: 110, y: 260, label: '3 Days', via: 'native', ts: 1400 });
    wins = A.windows();
    const f = wins.find(w => w.agentId === 'w1').focus;
    assert.deepStrictEqual(f.acts.map(a => [a.label, a.via]), [['open BASIC', 'eros'], ['3 Days', 'native']]);
    assert.strictEqual(f.pointer.label, '3 Days');
  });

  await test('NP-02', 'pushContext streams every act since the last push, then nothing new', async () => {
    const got = [];
    const srv = http.createServer((req, res) => { let b = ''; req.on('data', c => b += c); req.on('end', () => { got.push({ url: req.url, body: JSON.parse(b) }); res.end('{"ok":true}'); }); });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    process.env.OLLAMA_PORT = String(srv.address().port);
    const nervePath = require.resolve(path.join(ROOT, 'lib/nerve/index.js'));
    require.cache[nervePath] = { id: nervePath, filename: nervePath, loaded: true, exports: { getSnapshot: () => ({ windows: wins.map(w => ({ ...w, mutationCount: 0 })) }) } };
    delete require.cache[require.resolve(path.join(ROOT, 'lib/nerve-ollama-bridge.js'))];
    const B = require(path.join(ROOT, 'lib/nerve-ollama-bridge.js'));
    B._resetForTest();
    try {
      const r1 = await B.pushContext('nexus-live');
      assert.strictEqual(r1.pointerActs, 2, JSON.stringify(r1));
      const ctx = got[0].body.context;
      assert.ok(ctx.indexOf('pointer click "open BASIC" at (100,200) via eros') < ctx.indexOf('pointer click "3 Days" at (110,260) via native'), ctx);
      assert.ok(ctx.indexOf('open BASIC') > 0, ctx);
      assert.strictEqual(got[0].url, '/api/stream/nexus-live/context');
      wins = wins.map(w => ({ ...w })); // same acts, nothing new
      const r2 = await B.pushContext('nexus-live');
      assert.ok(!r2.pointerActs, JSON.stringify(r2));
      assert.strictEqual(got.length, r2.pushed ? 2 : 1);
    } finally { srv.close(); delete require.cache[nervePath]; }
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`); process.exitCode = failed ? 1 : 0;
})();
