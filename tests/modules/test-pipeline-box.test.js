'use strict';
// run-all: timeout 120000
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-pipeline-box.test.js — PC1_one_box_shape (docs/2026-11-08-pipeline-canvas-phasemap.spec), MOD-PC-BOX (cos/spec/pipeline-canvas.spec).
 * James, 2026-11-08: "steps as boxes, with wires as the flow into the hooks of gates" · "using emerge as the language".
 * The box shape is written in Emerge (cos/automation/box.eg); this file only runs Emerge's own tools on it for the Nexus suite. It is also the
 * TEMPORARY harness that converts the tree's YAML node files to JSON, because Emerge has no YAML reader yet (CIE14, found 2026-11-08); it goes
 * when parse_yaml lands.
 *   PB-01  eg check passes on box.eg and cli.eg; eg test passes on cos/automation/test/box.test.eg
 *   PB-02  every .pipeline and .procedure node in the tree round-trips through the box shape unchanged (PCS-002: no second store)
 *   PB-03  §1.2: an unknown command is refused (exit 1) and the commands named
 *   PB-04  §17.13: the box shape is .eg; no .js in cos/automation/
 *   PB-05  through COS (James, 2026-11-08: "i want this built and added to cos ui"): GET /api/cos/boxes for a pipeline made in COS's engine and
 *          for a procedure read from Idearium by its route; the command rows; the Pipelines page in Clear Glass through the real cockpit
 */
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..'), EG = path.join(ROOT, 'emerge/emerge/lang/eg.js'), DIR = path.join(ROOT, 'cos/automation');
const yaml = require('js-yaml');
let passed = 0, failed = 0;
function test(id, d, fn) { try { fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${(e.stack || e.message).split('\n').slice(0, 4).join('\n    ')}`); failed++; } }
const eg = (...a) => spawnSync(process.execPath, [EG, ...a], { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => {
  if (/^(node_modules|data|\.git|_archive)$/.test(e.name)) return [];
  return e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]; });

console.log('\n▢  one box shape, in Emerge (PC1)\n');

test('PB-01', 'eg check and eg test pass on the box shape', () => {
  for (const f of ['box.eg', 'cli.eg']) { const r = eg('check', path.join(DIR, f)); assert.strictEqual(r.status, 0, `${f}: ${r.stdout}${r.stderr}`); }
  const r = eg('test', path.join(DIR, 'test/box.test.eg')); assert.strictEqual(r.status, 0, r.stdout + r.stderr); assert.match(r.stdout, /\d+ passed, 0 failed/);
});

test('PB-02', 'every .pipeline and .procedure in the tree round-trips unchanged', () => {
  const nodes = walk(ROOT).filter(f => /\.(pipeline|procedure)$/.test(f) && !/node-schemas/.test(f));
  assert.ok(nodes.length >= 2, `found ${nodes.length}`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pc1-'));
  try {
    for (const f of nodes) {
      const n = yaml.load(fs.readFileSync(f, 'utf8')); const p = n && n.payload ? n.payload : n;
      const j = path.join(tmp, path.basename(f) + '.json'); fs.writeFileSync(j, JSON.stringify(p));
      const r = eg('run', path.join(DIR, 'cli.eg'), 'roundtrip', j); assert.strictEqual(r.status, 0, `${path.relative(ROOT, f)}: ${r.stderr}`);
      const out = JSON.parse(r.stdout.trim().split('\n').pop());
      assert.strictEqual(out.same, true, `${path.relative(ROOT, f)} changed in the round trip`);
      assert.deepStrictEqual(out.problems, [], `${path.relative(ROOT, f)}: ${out.problems.join('; ')}`);
      console.log(`      ${path.relative(ROOT, f)}: ${out.kind}, ${out.boxes} boxes, ${out.wires} wires, unchanged`);
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('PB-03', 'an unknown command is refused, the commands named', () => {
  const r = eg('run', path.join(DIR, 'cli.eg'), 'nope'); assert.strictEqual(r.status, 1); assert.match(r.stderr, /the commands are version, boxes/);
});

test('PB-04', 'the box shape is Emerge: no .js in cos/automation/', () => {
  const js = walk(DIR).filter(f => f.endsWith('.js')); assert.deepStrictEqual(js, []);
});

(async () => {
  const http = require('http'), net = require('net');
  if (!process.env.GLASS_CHROMIUM) { const c = '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'; if (fs.existsSync(c) && !fs.existsSync(path.join(ROOT, 'node_modules/electron'))) process.env.GLASS_CHROMIUM = c; }
  const freePort = () => new Promise(r => { const sv = net.createServer(); sv.listen(0, '127.0.0.1', () => { const p = sv.address().port; sv.close(() => r(p)); }); });
  const req = (port, method, p, body) => new Promise((res) => { const q = http.request({ host: '127.0.0.1', port, path: p, method, headers: { 'Content-Type': 'application/json' } }, (x) => { let t = ''; x.on('data', c => t += c); x.on('end', () => res({ status: x.statusCode, body: JSON.parse(t || '{}') })); }); q.end(body ? JSON.stringify(body) : undefined); });
  const PROC = { id: 'tidy', name: 'Tidy up', steps: [{ tool: 'nexus.command', args: { command: 'status' } }, { confirm: 'tidy now' }, { check: { of: 1, contains: 'ok' } }] };
  const idearium = http.createServer((q, r) => { r.setHeader('Content-Type', 'application/json');
    if (q.url === '/api/procedures') return r.end(JSON.stringify({ ok: true, procedures: [PROC] }));
    if (q.url === '/api/procedures/tidy') return r.end(JSON.stringify({ ok: true, procedure: PROC }));
    r.statusCode = 404; r.end('{"ok":false}'); });
  await new Promise(r => idearium.listen(0, '127.0.0.1', r));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc1-cos-'));
  const { createSupervisor } = require(path.join(ROOT, 'cos/manager/supervisor.js'));
  const sup = createSupervisor({ root: dir, ledgerFile: path.join(dir, 'ledger.jsonl'), log: () => {}, declarations: [
    { name: 'idearium', system: 'idearium', cmd: process.execPath, args: ['-e', ''], healthUrl: `http://127.0.0.1:${idearium.address().port}/health` }] });
  const mgr = await require(path.join(ROOT, 'cos/manager/server.js')).listen(sup, 0, { root: dir }); const mp = mgr.address().port;
  const cp = await freePort();
  const cockpit = require(path.join(ROOT, 'cos/ui/serve.js')).createServer({ port: cp, manager: `http://127.0.0.1:${mp}` });
  await new Promise(r => cockpit.listen(cp, '127.0.0.1', r));
  const T = async (id, d, fn) => { try { await fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${(e.stack || e.message).split('\n').slice(0, 4).join('\n    ')}`); failed++; } };
  await T('PB-05', 'through COS: the route, the command rows, the Pipelines page in Clear Glass', async () => {
    const mk = await req(mp, 'POST', '/api/cos/automation/pipelines', { name: 'PC1 proof', tasks: [
      { id: 'pick', depends_on: [], step: { type: 'log', config: { message: 'pick' } } },
      { id: 'build', depends_on: ['pick'], step: { type: 'pipeline', config: { pipeline: 'pc1-inner' } }, gate: { notEmpty: true } },
      { id: 'note', depends_on: ['pick'], step: { type: 'log', config: { message: 'note' } } },
      { id: 'done', depends_on: ['build', 'note'], step: { type: 'log', config: { message: 'done' } } }] });
    assert.ok(mk.status < 300 && mk.body.ok !== false, JSON.stringify(mk.body));
    const pid = (mk.body.pipeline || mk.body).id; assert.ok(pid, JSON.stringify(mk.body));
    const b = await req(mp, 'GET', `/api/cos/boxes?pipeline=${encodeURIComponent(pid)}`); assert.strictEqual(b.status, 200, JSON.stringify(b.body));
    assert.strictEqual(b.body.kind, 'pipeline'); assert.deepStrictEqual(b.body.graph.boxes.map(x => x.kind), ['tool', 'pipeline', 'tool', 'tool']);
    assert.strictEqual(b.body.graph.wires.length, 4); assert.deepStrictEqual(b.body.problems, []);
    // .erv for ERAVOS (James, 2026-11-08: "eravos is the build surface for nexus"): one Box tool per step, the wires as dataflow wires
    const ev = await req(mp, 'GET', `/api/cos/boxes?as=erv&pipeline=${encodeURIComponent(pid)}`); assert.strictEqual(ev.status, 200, JSON.stringify(ev.body));
    const tl = ev.body.erv.layers.find(l => l.id === 'tools').layers, wl = ev.body.erv.layers.find(l => l.id === 'wires').data;
    assert.strictEqual(ev.body.erv.erv, 1); assert.ok(tl.every(t => t.tool === 'eravos.orchestration.box'), 'every step is ERAVOS\'s Box tool');
    assert.deepStrictEqual(tl.map(t => t.state.params.kind), ['tool', 'pipeline', 'tool', 'tool']); assert.strictEqual(wl.length, 4);
    assert.ok(wl.every(w => w.type === 'dataflow' && w.from[1] === 'box.hook.out' && w.to[1] === 'box.hook.in'));
    assert.deepStrictEqual(tl.find(t => t.id === 'done').at.x > tl.find(t => t.id === 'pick').at.x, true, 'laid out by the DAG');
    const pr = await req(mp, 'GET', '/api/cos/boxes?procedure=tidy'); assert.strictEqual(pr.status, 200, JSON.stringify(pr.body));
    assert.deepStrictEqual(pr.body.graph.boxes.map(x => x.kind), ['tool', 'gate', 'gate']);
    assert.strictEqual((await req(mp, 'GET', '/api/cos/boxes?pipeline=nope')).status, 404);
    assert.strictEqual((await req(mp, 'GET', '/api/cos/boxes')).status, 400);
    assert.strictEqual((await req(cp, 'GET', `/api/cos/boxes?procedure=tidy`)).status, 200, 'the cockpit forwards it (in the contract)');
    const SPEC = (await import(require('url').pathToFileURL(path.join(ROOT, 'idearium/cli/route-commands.js')).href)).SPEC;
    assert.deepStrictEqual(b.body.kinds, ['gate', 'system', 'agent', 'macro', 'pipeline', 'procedure', 'tool', 'build'], 'the kinds come from the box shape');
    for (const k of ['cos.boxes', 'cos.erv', 'cos.pipelines', 'cos.procedures']) { const row = SPEC.find(r => r.key === k); assert.ok(row && !row.personOnly, `${k}: a row agents and copilot reach`); }
    assert.strictEqual(SPEC.find(r => r.key === 'cos.boxes').req({ args: [], flags: { procedure: 'tidy' } }).path, '/api/cos/boxes?procedure=tidy');
    const glass = require(path.join(ROOT, 'clear-glass/src/driver/glass.js'));
    let browser; try { browser = await glass.chromium.launch(); } catch (e) { console.log(`  - PB-05 page part SKIPPED: the engine could not start (${e.message.split('\n')[0]})`); return; }
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
      await page.goto(`http://127.0.0.1:${cp}/pipelines/index.html`);
      let n = 0; for (let k = 0; k < 50 && !n; k++) { await new Promise(r => setTimeout(r, 200)); n = await page.evaluate(() => document.querySelectorAll('[data-pipeline]').length); }
      assert.ok(n >= 1, 'pipelines listed: ' + await page.evaluate(() => document.getElementById('pl-pipes').textContent));
      await page.evaluate((id) => document.querySelector(`[data-pipeline="${id}"]`).click(), pid);
      let boxes = 0; for (let k = 0; k < 50 && boxes < 4; k++) { await new Promise(r => setTimeout(r, 200)); boxes = await page.evaluate(() => document.querySelectorAll('#pl-svg .pl-box').length); }
      assert.strictEqual(boxes, 4); assert.strictEqual(await page.evaluate(() => document.querySelectorAll('#pl-svg .pl-wire').length), 4);
      await page.evaluate(() => document.querySelector('#pl-svg [data-box="build"]').dispatchEvent(new MouseEvent('click', { bubbles: true })));
      assert.match(await page.evaluate(() => document.getElementById('pl-detail').textContent), /"kind": "pipeline"/);
      if (process.env.PB_SHOTS) await page.screenshot({ path: path.join(process.env.PB_SHOTS, 'cos-pipelines.png'), fullPage: true });
      await page.evaluate(() => document.querySelector('[data-procedure="tidy"]').click());
      let pk = []; for (let k = 0; k < 50 && pk.length < 3; k++) { await new Promise(r => setTimeout(r, 200)); pk = await page.evaluate(() => [...document.querySelectorAll('#pl-svg .pl-box')].map(e => e.dataset.kind)); }
      assert.deepStrictEqual(pk, ['tool', 'gate', 'gate']);
      if (process.env.PB_SHOTS) await page.screenshot({ path: path.join(process.env.PB_SHOTS, 'cos-procedure.png'), fullPage: true });
    } finally { await browser.close(); }
  });
  cockpit.close(); mgr.close(); idearium.close(); sup.shutdown({ by: 'test' }); fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\n  ${passed} passed, ${failed} failed\n`); process.exit(failed ? 1 : 0);
})();
