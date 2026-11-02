'use strict';
// run-all: timeout 180000
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-cos-console.test.js — SC1–SC6, 0.60.379 (docs/2026-11-02-cos-console-phasemap.spec).
 * James, 2026-11-02: "Also have a notification bell for update, system status,  notications" · "There shouldn't be two intelligence." · "an add
 * system in the proposal section, or just in the general homepage" · "Need the system cli." · "Need configuration for each system ... set ram,
 * cpu and network limits. Percent or gbs. Ports and network settings."
 * A real supervisor and manager over a fixture tree with two real systems (tiny Node servers), and COS's cockpit driven in Clear Glass.
 *   CC-01  units: percent or sizes — 25% of 16 GB is 4096 MB, 2GB, 1536MB; "2 cores" of 8 is 25%; 10MB/s is 80 Mbps; nonsense refused, saying the form
 *   CC-02  configuration: every setting with its layer and how it applies; the port's env var discovered in the system's own file; network said
 *          not enforced; memory through the caps (read back); an agent refused; a bad unit refused; clear returns the declared value
 *   CC-03  applied by the supervisor: a port and an env var set → the real process listens on the new port with the var; autostart off → boot
 *          skips it, saying why; restart never → a crash leaves it down, said
 *   CC-04  the bell: a crash is an unread error notice; reading clears it; an update version is told once; what an update did is told
 *   CC-05  COS's command line: ps, config set, help, an unknown verb; an agent's act refused
 *   CC-06  add a system: his add writes <folder>/compartment.json and declares it live (startable); the same again refused; an agent's add is held
 *   CC-07  one Intelligence: the real tree declares one intelligence process; its server starts the consumer; the update restarts one kernel
 *   CC-08  wired: the contract declares every route and the event; the cockpit has Configuration; the command rows exist
 *   CC-09  in Clear Glass: the bell counts and lists; the command line answers ps; a system's Configuration shows its settings and saves one;
 *          Add system on Overview adds a system
 */
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), net = require('net');
const ROOT = path.join(__dirname, '..', '..');
if (!process.env.GLASS_CHROMIUM) { const c = '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'; if (fs.existsSync(c) && !fs.existsSync(path.join(ROOT, 'node_modules/electron/dist/electron'))) process.env.GLASS_CHROMIUM = c; }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cos-console-'));
process.env.COS_MANAGER_DATA = path.join(tmp, 'data');
const { createSupervisor, readDeclarations } = require(path.join(ROOT, 'cos/manager/supervisor.js'));
const { parse } = require(path.join(ROOT, 'cos/manager/system-config.js'));
const { createNotices } = require(path.join(ROOT, 'cos/manager/notices.js'));

let passed = 0, failed = 0;
async function test(id, d, fn) { try { await fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${(e.stack || e.message).split('\n').slice(0, 5).join('\n    ')}`); failed++; } }
const W = (f, s) => { fs.mkdirSync(path.dirname(path.join(tmp, f)), { recursive: true }); fs.writeFileSync(path.join(tmp, f), s); };
const freePort = () => new Promise(r => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const wait = async (fn, ms = 8000) => { const until = Date.now() + ms; while (Date.now() < until) { const v = await fn(); if (v) return v; await new Promise(r => setTimeout(r, 100)); } throw new Error('timed out waiting'); };
const getJ = (port, p) => new Promise((res, rej) => http.get({ host: '127.0.0.1', port, path: p, timeout: 3000 }, r => { let t = ''; r.on('data', c => t += c); r.on('end', () => { try { res({ status: r.statusCode, j: JSON.parse(t) }); } catch (e) { rej(e); } }); }).on('error', rej));
const send = (port, method, p, body) => new Promise((res, rej) => { const b = JSON.stringify(body || {}); const q = http.request({ host: '127.0.0.1', port, path: p, method, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b) } }, r => { let t = ''; r.on('data', c => t += c); r.on('end', () => { try { res({ status: r.statusCode, j: JSON.parse(t) }); } catch (e) { rej(e); } }); }); q.on('error', rej); q.end(b); });
// a tiny system: answers /health with its port and GREETING, on the port its own env var names
const SERVER = (envVar, def) => `const http=require('http');const PORT=parseInt(process.env.${envVar}||'${def}',10);http.createServer((q,r)=>{r.setHeader('Content-Type','application/json');r.end(JSON.stringify({ok:true,port:PORT,greeting:process.env.GREETING||null}));}).listen(PORT,'127.0.0.1');\n`;

(async () => {
  console.log('\n⬢  COS console: the bell, configuration per system, add a system, the command line, one Intelligence (SC1–SC6)\n');
  const pA = await freePort(), pB = await freePort();
  W('alpha/server.js', SERVER('ALPHA_PORT', pA));
  W('alpha/compartment.json', JSON.stringify({ schema: 'nexus.compartment/1', name: 'alpha', runtime: { process: { name: 'alpha', cmd: 'node', args: ['alpha/server.js'], phase: 1, healthUrl: `http://127.0.0.1:${pA}/health` } } }));
  W('beta/config.js', `module.exports={PORT:parseInt(process.env.BETA_PORT||'${pB}',10)};\n`); W('beta/server.js', SERVER('BETA_PORT', pB));
  W('beta/compartment.json', JSON.stringify({ schema: 'nexus.compartment/1', name: 'beta', runtime: { process: { name: 'beta', cmd: 'node', args: ['beta/server.js'], phase: 2, healthUrl: `http://127.0.0.1:${pB}/health` } } }));
  W('gamma/server.js', SERVER('GAMMA_PORT', 1)); W('delta/server.js', SERVER('DELTA_PORT', 1));
  const sup = createSupervisor({ root: tmp, ledgerFile: path.join(tmp, 'data', 'ledger.jsonl'), policy: { phaseGateMs: 6000, restart: { backoffMs: [60000, 60000] } }, log: () => {} });
  const { createServer } = require(path.join(ROOT, 'cos/manager/server.js'));
  const srv = createServer(sup, { root: tmp }); await new Promise(r => srv.listen(0, '127.0.0.1', r)); const M = srv.address().port;

  await test('CC-01', 'units: percent or sizes; cores; a rate; nonsense refused saying the form', () => {
    assert.strictEqual(parse.size('25%', 16384), 4096); assert.strictEqual(parse.size('2GB', 16384), 2048); assert.strictEqual(parse.size('1.5 gb', 16384), 1536); assert.strictEqual(parse.size('1536MB'), 1536); assert.strictEqual(parse.size('900'), 900);
    assert.strictEqual(parse.cpu('2 cores', 8), 25); assert.strictEqual(parse.cpu('50%', 8), 50);
    assert.deepStrictEqual(parse.bandwidth('10MB/s'), { mbps: 80 }); assert.deepStrictEqual(parse.bandwidth('100Mbps'), { mbps: 100 }); assert.deepStrictEqual(parse.bandwidth('20%'), { pct: 20 });
    assert.throws(() => parse.size('lots'), /"25%", "2GB", "1536MB"/); assert.throws(() => parse.size('120%', 16384), /more than the host/); assert.throws(() => parse.cpu('9 cores', 8), /between 1% and 100%/); assert.throws(() => parse.size('10MB'), /at least 64 MB/);
  });

  await test('CC-02', 'configuration: layers and how; the port env discovered; network not enforced; memory through the caps; agent and bad unit refused; clear', async () => {
    let r = await getJ(M, '/api/cos/systems/beta/config'); assert.strictEqual(r.status, 200, JSON.stringify(r.j));
    const s = r.j.settings;
    assert.deepStrictEqual([s['network.port'].value, s['network.port'].from], [pB, 'declared']);
    assert.strictEqual(s['network.port'].how.env, 'BETA_PORT'); assert.match(s['network.port'].how.envFrom, /discovered in beta\/config\.js/);
    assert.strictEqual(s['network.limit'].how.state, 'not-enforced'); assert.strictEqual(s['network.outbound'].how.state, 'not-enforced');
    assert.strictEqual(s['memory.limit'].how.state, 'none');
    r = await send(M, 'PATCH', '/api/cos/systems/beta/config', { patch: { 'memory.limit': '1GB', 'cpu.priority': 'below-normal', 'network.limit': '10MB/s', 'general.notes': 'his note' }, by: 'person' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.j));
    assert.deepStrictEqual([r.j.settings['memory.limit'].value, r.j.settings['memory.limit'].from, r.j.settings['memory.limit'].how.state], [1024, 'his', 'watched']);
    assert.deepStrictEqual(r.j.settings['network.limit'].value, { mbps: 80 }); assert.strictEqual(r.j.settings['general.notes'].value, 'his note');
    const caps = (await getJ(M, '/api/cos/systems/beta/caps')).j.caps; assert.deepStrictEqual([caps.rssLimitMB, caps.priority, caps.layers.priority], [1024, 'below-normal', 'his'], 'memory and priority are the caps (CP6a), not a copy');
    r = await send(M, 'PATCH', '/api/cos/systems/beta/config', { patch: { 'memory.limit': '1GB' }, by: 'agent:helper' }); assert.strictEqual(r.status, 403);
    r = await send(M, 'PATCH', '/api/cos/systems/beta/config', { patch: { 'memory.heap': 'a lot' }, by: 'person' }); assert.strictEqual(r.status, 400); assert.match(r.j.error, /"25%", "2GB"/);
    r = await send(M, 'PATCH', '/api/cos/systems/beta/config', { patch: { 'disk.size': '1GB' }, by: 'person' }); assert.strictEqual(r.status, 400); assert.match(r.j.error, /no setting "disk\.size"/);
    r = await send(M, 'POST', '/api/cos/systems/beta/config/clear', { keys: ['cpu.priority'], by: 'person' }); assert.strictEqual(r.j.settings['cpu.priority'].from === 'his', false, 'cleared: no longer his');
    assert.ok(sup.ledger({ system: 'beta' }).some(e => e.kind === 'config' && /memory\.limit/.test(e.why)), 'each change on the ledger, before it applies');
  });

  await test('CC-03', 'applied by the supervisor: a new port and an env var on the real process; autostart off skipped, said; restart never leaves it down', async () => {
    const p2 = await freePort();
    let r = await send(M, 'PATCH', '/api/cos/systems/alpha/config', { patch: { 'network.port': p2, 'env.GREETING': 'hello from his config' }, by: 'person' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.j)); assert.strictEqual(r.j.settings['network.port'].how.env, 'ALPHA_PORT'); assert.match(r.j.settings['network.port'].how.envFrom, /discovered in alpha\/server\.js/);
    assert.strictEqual(sup.effective('alpha').healthUrl, `http://127.0.0.1:${p2}/health`, 'the health URL follows the port');
    sup.start('alpha', { by: 'person' });
    const h = await wait(async () => { try { return (await getJ(p2, '/health')).j; } catch (_) { return null; } });
    assert.deepStrictEqual([h.port, h.greeting], [p2, 'hello from his config'], 'the real process: his port and his env var');
    await wait(() => sup.get('alpha').state === 'up');
    r = await send(M, 'PATCH', '/api/cos/systems/beta/config', { patch: { 'start.autostart': 'false' }, by: 'person' }); assert.strictEqual(r.status, 200);
    const b = await sup.boot({ by: 'test' });
    assert.ok(b.skipped.some(s => s.name === 'beta' && /autostart off/.test(s.why)), JSON.stringify(b.skipped));
    await send(M, 'PATCH', '/api/cos/systems/alpha/config', { patch: { 'start.restart': 'never' }, by: 'person' });
    process.kill(sup.get('alpha').pid, 'SIGKILL');
    await wait(() => sup.ledger({ system: 'alpha' }).some(e => e.kind === 'no-restart'));
    assert.strictEqual(sup.get('alpha').state, 'down');
  });

  await test('CC-04', 'the bell: the crash is an unread error; read clears it; an update told once; what an update did told', async () => {
    let r = await getJ(M, '/api/cos/notices?unread=1');
    const crash = r.j.notices.find(n => n.system === 'alpha' && /crashed$/.test(n.title));
    assert.ok(crash, JSON.stringify(r.j.notices.map(n => n.title))); assert.deepStrictEqual([crash.kind, crash.level, crash.read], ['system', 'error', false], JSON.stringify(crash));
    assert.ok(r.j.notices.some(n => /left down/.test(n.title)), 'and that it was left down, said');
    assert.ok(r.j.counts.unread >= 2 && r.j.counts.error >= 1);
    r = await send(M, 'POST', '/api/cos/notices/read', { all: true }); assert.strictEqual(r.j.counts.unread, 0);
    const N = createNotices({ file: path.join(tmp, 'n2.json') });
    const avail = { show: true, kind: 'available', title: 'Nexus 0.60.400 is available', text: 'You have 0.60.379.', latest: '0.60.400' };
    assert.ok(N.fromNotice(avail)); assert.strictEqual(N.fromNotice(avail), null, 'the same version, told once');
    const done = N.fromUpdate({ phase: 'updated', to: '0.60.400', restarted: ['guardian'], waitForHim: ['clear-glass'] });
    assert.deepStrictEqual([done.kind, done.level], ['update', 'warn']); assert.match(done.body, /restarted: guardian; waits for you: clear-glass/);
    assert.strictEqual(N.counts().update, 2);
  });

  await test('CC-05', 'COS\'s command line: ps, config set, help, an unknown verb; an agent\'s act refused', async () => {
    let r = await send(M, 'POST', '/api/cos/cli', { line: 'ps', by: 'person' }); assert.ok(r.j.ok); assert.ok(!r.j.lines.join('\n').includes('[object'), r.j.lines.join('\n')); assert.ok(r.j.lines.some(l => /^alpha\s+down/.test(l)) && r.j.lines.some(l => /^beta /.test(l)), r.j.lines.join('\n'));
    r = await send(M, 'POST', '/api/cos/cli', { line: 'config beta memory.heap=2GB cpu.limit="2 cores"', by: 'person' }); assert.ok(r.j.ok, r.j.lines.join('\n'));
    assert.ok(r.j.lines.some(l => /memory\.heap\s+2048 MB\s+his/.test(l)), r.j.lines.join('\n'));
    r = await send(M, 'POST', '/api/cos/cli', { line: 'help', by: 'person' }); assert.ok(r.j.lines.length >= 14 && r.j.lines.some(l => /^config <system>/.test(l)));
    r = await send(M, 'POST', '/api/cos/cli', { line: 'launch rockets', by: 'person' }); assert.strictEqual(r.j.ok, false); assert.match(r.j.lines[0], /no verb "launch"/);
    r = await send(M, 'POST', '/api/cos/cli', { line: 'restart beta', by: 'agent:helper' }); assert.strictEqual(r.j.ok, false); assert.match(r.j.lines[0], /an agent proposes/);
    r = await send(M, 'POST', '/api/cos/cli', { line: 'config beta', by: 'agent:helper' }); assert.ok(r.j.ok, 'reading is anyone\'s');
  });

  await test('CC-06', 'add a system: written and declared live; again refused; an agent\'s add held', async () => {
    const pG = await freePort();
    let r = await send(M, 'POST', '/api/cos/systems', { name: 'gamma', dir: 'gamma', args: 'server.js', port: pG, by: 'person' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.j)); assert.strictEqual(r.j.taken.status, 'taken');
    const decl = JSON.parse(fs.readFileSync(path.join(tmp, 'gamma', 'compartment.json'), 'utf8'));
    assert.deepStrictEqual([decl.name, decl.runtime.process.args, decl.runtime.process.healthUrl, decl.added.by], ['gamma', ['gamma/server.js'], `http://127.0.0.1:${pG}/health`, 'person']);
    assert.ok(sup.list().some(v => v.name === 'gamma'), 'declared live');
    assert.ok(readDeclarations(tmp).some(d => d.name === 'gamma'), 'and found again at COS\'s next start');
    r = await send(M, 'POST', '/api/cos/systems', { name: 'gamma', dir: 'gamma', by: 'person' }); assert.strictEqual(r.status, 409);
    r = await send(M, 'POST', '/api/cos/systems', { name: 'delta', dir: 'delta', by: 'agent:builder', why: 'a new service' });
    assert.strictEqual(r.status, 200); assert.strictEqual(r.j.proposal.status, 'held'); assert.ok(!fs.existsSync(path.join(tmp, 'delta', 'compartment.json')), 'an agent\'s add waits for him');
    r = await send(M, 'POST', '/api/cos/systems', { name: 'nope', dir: 'nowhere', by: 'person' }); assert.strictEqual(r.status, 404);
  });

  await test('CC-07', 'one Intelligence: one declared process; its server starts the consumer; the update restarts one kernel', () => {
    const ds = readDeclarations(ROOT).filter(d => d.system === 'intelligence');
    assert.deepStrictEqual(ds.map(d => d.name), ['intelligence']);
    const c = JSON.parse(fs.readFileSync(path.join(ROOT, 'intelligence/compartment.json'), 'utf8'));
    assert.ok(!c.runtime.processes && c.runtime.retiredProcesses[0].name === 'intelligence-consumer', 'the second declaration retired, kept (§0.3)');
    assert.match(fs.readFileSync(path.join(ROOT, 'intelligence/server.js'), 'utf8'), /require\('\.\/consumer\.js'\)\.start\(\)/);
    assert.deepStrictEqual(require(path.join(ROOT, 'lib/nexus-update.js')).restartPlan(['intelligence'], false, ['intelligence', 'guardian']).restart, ['intelligence']);
  });

  await test('CC-08', 'wired: the contract, the cockpit\'s Configuration, the command rows', () => {
    const c = JSON.parse(fs.readFileSync(path.join(ROOT, 'cos/manager/contract.json'), 'utf8'));
    const have = new Set(c.routes.map(r => `${r.method} ${r.path}`));
    for (const r of ['GET /api/cos/notices', 'POST /api/cos/notices/read', 'GET /api/cos/systems/:name/config', 'PATCH /api/cos/systems/:name/config', 'POST /api/cos/systems/:name/config/clear', 'POST /api/cos/systems', 'GET /api/cos/cli', 'POST /api/cos/cli']) assert.ok(have.has(r), r);
    assert.ok(c.events['cos.notice']); const shell = c.pages.find(p => p.id === 'shell'), cockpit = c.pages.find(p => p.id === 'cockpit');
    assert.ok(shell.emits.includes('cos.notice') && shell.routes.includes('POST /api/cos/cli') && cockpit.routes.includes('PATCH /api/cos/systems/:name/config'));
    assert.match(fs.readFileSync(path.join(ROOT, 'cos/ui/cockpit/page.js'), 'utf8'), /\['config', 'Configuration', 'gear'\]/);
    const rows = require(path.join(ROOT, 'idearium/cli/route-commands.js')); const keys = JSON.stringify(rows, (k, v) => (typeof v === 'function' ? undefined : v));
    for (const k of ['cos.config', 'cos.notices', 'cos.cli']) assert.ok(keys.includes(`"${k}"`), k);
  });

  const glass = require(path.join(ROOT, 'clear-glass/src/driver/glass.js'));
  let browser; try { browser = await glass.chromium.launch(); } catch (e) { console.log(`  - CC-09 SKIPPED: the engine could not start (${e.message.split('\n')[0]})`); }
  if (browser) {
    await test('CC-09', 'in Clear Glass: the bell, the command line, a system\'s Configuration, Add system', async () => {
      // something unread for the bell
      sup.note('over-limit', 'resident 1300 MB over its limit 1024 MB (test)', { by: 'rule:resources', system: 'beta' });
      const ui = require(path.join(ROOT, 'cos/ui/serve.js')).createServer({ port: 0, manager: `http://127.0.0.1:${M}` });
      await new Promise(r => ui.listen(0, '127.0.0.1', r)); const U = ui.address().port;
      const page = await browser.newPage({ viewport: { width: 1360, height: 860 } });
      const errors = []; page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(`http://127.0.0.1:${U}/shell/#/overview`);
      await page.waitForFunction(() => !document.getElementById('bell-n').hidden, null, { timeout: 15000 });
      assert.ok(Number(await page.evaluate(() => document.getElementById('bell-n').textContent)) >= 1);
      await page.evaluate(() => document.getElementById('bell').click());
      await page.waitForFunction(() => /over its limit/.test(document.getElementById('bell-list').textContent));
      if (process.env.CC_SHOTS) await page.screenshot({ path: path.join(process.env.CC_SHOTS, 'cos-bell.png') });
      await page.evaluate(() => document.getElementById('bell-read').click());
      try { await page.waitForFunction(() => document.getElementById('bell-n').hidden, null, { timeout: 5000 }); } catch (e) { throw new Error(`still unread after Mark all read: ${await page.evaluate(() => document.getElementById('bell-n').textContent)} · ${JSON.stringify((await getJ(M, '/api/cos/notices?unread=1')).j.notices.map(n => n.title))}`); }
      await page.evaluate(() => document.body.click());
      // the command line
      await page.keyboard.press('Control+`');
      await page.waitForFunction(() => !document.getElementById('console').hidden);
      await page.fill('#console-line', 'ps'); await page.keyboard.press('Enter');
      try { await page.waitForFunction(() => /alpha\s+down/.test(document.getElementById('console-out').textContent), null, { timeout: 6000 }); } catch (e) { throw new Error('console: ' + await page.evaluate(() => JSON.stringify([document.getElementById('console-out').textContent, document.getElementById('console-line').value, document.activeElement && document.activeElement.id]))); }
      if (process.env.CC_SHOTS) await page.screenshot({ path: path.join(process.env.CC_SHOTS, 'cos-cli.png') });
      await page.evaluate(() => document.getElementById('console-close').click());
      assert.strictEqual(await page.evaluate(() => getComputedStyle(document.getElementById('console')).display), 'none', 'closed is gone from the screen, not only marked hidden');
      assert.strictEqual(await page.evaluate(() => getComputedStyle(document.getElementById('bell-panel')).display), 'none', 'the bell\'s panel closed when clicked away');
      // a system's Configuration
      await page.evaluate(() => { location.hash = '#/c/beta/config'; });
      // the cockpit's frame (same origin): its Configuration section's shadow root
      const SR = `(() => { const f = document.querySelector('iframe[data-page="cockpit"].on') || document.querySelector('iframe[data-page="cockpit"]'); const d = f && f.contentDocument; const s = d && d.querySelector('#sections > .on'); return s && s.shadowRoot; })()`;
      await wait(async () => page.evaluate(`(() => { const r = ${SR}; return !!(r && r.querySelector('[name="memory.limit"]')); })()`), 15000);
      const v = await page.evaluate(`${SR}.querySelector('[name="memory.limit"]').value`);
      assert.strictEqual(v, '1GB', 'his 1 GB, shown in his unit');
      const how = await page.evaluate(`[...${SR}.querySelectorAll('.how b')].map(b => b.dataset.s)`);
      assert.ok(how.includes('watched') && how.includes('enforced'), JSON.stringify(how));
      if (process.env.CC_SHOTS) await page.screenshot({ path: path.join(process.env.CC_SHOTS, 'cos-config.png') });
      await page.evaluate(`(() => { const r = ${SR}; r.querySelector('[name="memory.limit"]').value = '25%'; r.querySelector('#pane').requestSubmit(); })()`);
      await page.waitForFunction(() => !document.getElementById('confirm').hidden); await page.evaluate(() => document.getElementById('confirm-yes').click());
      const want = parse.size('25%');
      await wait(async () => (await getJ(M, '/api/cos/systems/beta/config')).j.settings['memory.limit'].value === want);
      // Add system, from the homepage
      await page.evaluate(() => { location.hash = '#/overview'; });
      await wait(async () => page.evaluate(() => { const f = document.querySelector('iframe[data-page="overview"]'); return !!(f && f.contentDocument && f.contentDocument.getElementById('add-system')); }), 15000);
      await page.evaluate(() => document.querySelector('iframe[data-page="overview"]').contentDocument.getElementById('add-system').click());
      await page.waitForFunction(() => !document.getElementById('add-sys').hidden);
      const pD = await freePort();
      await page.fill('#add-form [name="name"]', 'epsilon');
      W('epsilon/server.js', SERVER('EPSILON_PORT', 1));
      await page.fill('#add-form [name="port"]', String(pD));
      if (process.env.CC_SHOTS) await page.screenshot({ path: path.join(process.env.CC_SHOTS, 'cos-add.png') });
      await page.evaluate(() => document.getElementById('add-yes').click());
      await wait(() => sup.list().some(x => x.name === 'epsilon'));
      assert.ok(fs.existsSync(path.join(tmp, 'epsilon', 'compartment.json')));
      assert.deepStrictEqual(errors, [], 'no page error');
      ui.close();
    });
    await browser.close();
  }

  sup.shutdown({ by: 'test' }); srv.close();
  await new Promise(r => setTimeout(r, 300));
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
