'use strict';
/**
 * tests/modules/test-loom-into-cos.test.js — 0.60.241 LM0–LM3 (docs/2026-10-24-loom-into-cos-phasemap.spec)
 * James, 2026-10-24: "Isn't loom in a compartment already or clearglass?" · "Do it."
 *   LI-01  the ollama port: in-process when the bridge provides it; its route otherwise (POST /api/generate, caller named); said when down
 *   LI-02  the bridge's route: caller required; answers { ok, text } from the one door
 *   LI-03  Loom's own store: its four tables brought home from Cortex's with every row, Cortex's rows kept; a second open copies nothing again
 *   LI-04  the census: Loom reaches into no other system (its 5 ways out are gone)
 */
const assert = require('assert');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const ROOT = path.resolve(__dirname, '../..');

let pass = 0, fail = 0;
async function test(id, name, fn) { try { await fn(); pass++; console.log(`  ✓ ${id} ${name}`); } catch (e) { fail++; console.log(`  ✗ ${id} ${name}\n    ${e.stack.split('\n').slice(0, 2).join('\n    ')}`); } }

(async () => {
  console.log('\ntest-loom-into-cos — Loom sealed for its compartment');
  const OP = require(path.join(ROOT, 'lib/ollama-port.js'));

  await test('LI-01', 'the ollama port: in-process, route, down', async () => {
    assert.strictEqual((await OP.generate({ prompt: 'x' })).ok, false, 'no caller, refused');
    OP.provide({ generate: async (o) => `echo:${o.prompt}:${o.caller}` });
    assert.deepStrictEqual(await OP.generate({ prompt: 'hi', caller: 't' }), { ok: true, text: 'echo:hi:t' });
    OP.provide(null);
    const got = [];
    const srv = http.createServer((req, res) => { let b = ''; req.on('data', c => { b += c; }); req.on('end', () => { got.push([req.url, JSON.parse(b)]); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, text: 'from the bridge' })); }); });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    process.env.OLLAMA_BRIDGE_PORT = String(srv.address().port);
    try {
      assert.strictEqual((await OP.generate({ model: 'm', prompt: 'p', system: 's', temperature: 0.3, caller: 'loom/agent-suite' })).text, 'from the bridge');
      assert.deepStrictEqual(got[0], ['/api/generate', { model: 'm', prompt: 'p', system: 's', temperature: 0.3, timeoutMs: 120000, caller: 'loom/agent-suite' }]);
    } finally { srv.close(); }
    const s2 = http.createServer(); await new Promise(r => s2.listen(0, '127.0.0.1', r)); const port = s2.address().port; await new Promise(r => s2.close(r));
    process.env.OLLAMA_BRIDGE_PORT = String(port);
    try { const r = await OP.generate({ prompt: 'p', caller: 't' }); assert.ok(r.ok === false && r.unreachable === true && /not answering on :\d+/.test(r.error)); }
    finally { delete process.env.OLLAMA_BRIDGE_PORT; }
  });

  await test('LI-02', 'the bridge\'s POST /api/generate', async () => {
    const st = require(path.join(ROOT, 'ollama/lib/state.js')).state;
    const OC = require(path.join(ROOT, 'ollama/lib/ollama-client.js'));
    const real = OC.callOllamaRaw, online = st.ollamaOnline;
    OC.callOllamaRaw = async (model, prompt, mt, to, caller, opts) => `${model}|${prompt}|${caller}|${opts.system}`;
    delete require.cache[require.resolve(path.join(ROOT, 'ollama/routes/generate.js'))];
    const G = require(path.join(ROOT, 'ollama/routes/generate.js'));
    st.ollamaOnline = true;
    const srv = http.createServer((req, res) => G.handle(req, res, { method: req.method, pathname: req.url }));
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const post = (body) => new Promise((resolve) => { const d = JSON.stringify(body); const q = http.request({ hostname: '127.0.0.1', port: srv.address().port, path: '/api/generate', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } }, (res) => { let b = ''; res.on('data', c => { b += c; }); res.on('end', () => resolve([res.statusCode, JSON.parse(b)])); }); q.write(d); q.end(); });
    try {
      const [c1, r1] = await post({ prompt: 'p' }); assert.deepStrictEqual([c1, r1.ok, /caller required/.test(r1.error)], [400, false, true]);
      const [c2, r2] = await post({ model: 'qwen', prompt: 'p', system: 'sys', caller: 'loom/agent-suite' }); assert.deepStrictEqual([c2, r2], [200, { ok: true, text: 'qwen|p|loom/agent-suite|sys' }]);
    } finally { srv.close(); OC.callOllamaRaw = real; st.ollamaOnline = online; }
  });

  await test('LI-03', 'Loom\'s own store: brought home, nothing lost', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-store-'));
    const sb = path.join(tmp, 'sb'), cx = path.join(tmp, 'cortex'); fs.mkdirSync(sb); fs.mkdirSync(cx);
    const prev = { sb: process.env.NEXUS_TEST_SANDBOX, jaa: process.env.JAA_DATA_DIR };
    process.env.NEXUS_TEST_SANDBOX = sb; process.env.JAA_DATA_DIR = cx;
    try {
      const { JaaStore } = require(path.join(ROOT, 'lib/jaa-store.js'));
      const src = new JaaStore(cx, { tables: ['hooks', 'hook_bindings', 'loom_changelog', 'phasemap_history'], settings: false });
      for (let i = 0; i < 3; i++) src.insert('hooks', { uuid: `h${i}`, name: `hook-${i}`, type: 'api', status: 'active' });
      src.insert('hook_bindings', { uuid: 'b0', fromId: 'h0', toId: 'h1' });
      src.insert('loom_changelog', { uuid: 'c0', version: '1.0.0', releasedAt: 1 });
      for (let i = 0; i < 2; i++) src.insert('phasemap_history', { uuid: `p${i}`, map: 'm', phaseId: `X${i}`, status: 'done', recordedAt: i });
      src.flushAll();
      const SS = require(path.join(ROOT, 'lib/system-store.js'));
      const L = SS.openStore('loom', { tables: ['hooks', 'hook_bindings', 'loom_changelog', 'phasemap_history'], migrate: ['hooks', 'hook_bindings', 'loom_changelog', 'phasemap_history'].map(table => ({ table })) });
      assert.deepStrictEqual(['hooks', 'hook_bindings', 'loom_changelog', 'phasemap_history'].map(t => L.count(t)), [3, 1, 1, 2]);
      assert.ok(L.dir.startsWith(sb), 'in the sandbox, never the tree');
      const again = new JaaStore(cx, { tables: ['hooks'], settings: false }); assert.strictEqual(again.count('hooks', {}), 3, 'Cortex\'s rows kept');
      const HR = require(path.join(ROOT, 'lib/hook-registry.js')); const reg = new HR.HookRegistry({ jaa: L }); reg.init();
      assert.strictEqual(reg.summary().total, 3, 'the registry reads them from Loom\'s store');
    } finally { process.env.NEXUS_TEST_SANDBOX = prev.sb || ''; if (!prev.sb) delete process.env.NEXUS_TEST_SANDBOX; if (prev.jaa) process.env.JAA_DATA_DIR = prev.jaa; else delete process.env.JAA_DATA_DIR; }
  });

  await test('LI-04', 'Loom reaches into no other system', () => {
    const SB = require(path.join(ROOT, 'lib/system-boundary.js'));
    const row = SB.sovereignty({ root: ROOT, system: 'loom' }).systems[0];
    const out = Object.values(row.list).flat().map(c => `${c.from} -> ${c.to}`);
    assert.deepStrictEqual(out, []);
    assert.strictEqual(row.sovereign, true);
  });

  console.log(`\n  ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
