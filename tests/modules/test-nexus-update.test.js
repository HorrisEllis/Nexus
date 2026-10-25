'use strict';
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-nexus-update.test.js — UP1–UP4 (0.60.252).
 * James, 2026-10-25: "can we make a tool for the copilot (remmber copilot is meant to be a hat.) like a update tool using github?"
 * · "first one but the second one needs to be the end state" (git now, COS later).
 *
 * Real git repos in a temp folder: an origin with a newer release, and an install cloned one release behind it.
 *   UP-01  detect: a clone is git, an unzipped folder is told the one-time clone, a COS store version is the COS driver (end state)
 *   UP-02  check: this version vs origin's, his words for the release in between, the systems it changes, the lockfile
 *   UP-03  apply refuses without confirm, and refuses his edit to code the update also changes — naming it, touching nothing
 *   UP-04  his changed data file is copied aside first, then the update fast-forwards; recorded in history
 *   UP-05  rollback returns to the commit the update came from; a second rollback has nothing to go back to
 *   UP-06  local commits (diverged) are refused: merging is his
 *   UP-07  wired: the tool, the co-pilot hat, the rows (apply/rollback the person's), the routes, the page, the co-pilot's names, loom
 *   UP-09  adopt: from an unzipped folder into the clone, his state comes across (ignored files, tracked data), code never does
 *   UP-08  the Updates page, driven in Clear Glass (glass.js) over the real lib/nexus-update.js: his words, Update, Roll back, history
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const U = require('../../lib/nexus-update.js');

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 4).join('\n    ') : e.message}`); failed++; }
}
const G = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'init.defaultBranch=main', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const W = (dir, f, text) => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), text); };
const versionJs = (v, quote, prev) => `const VERSION = {\n  system: '${v}',   // [${v}: James, 2026-10-25: "${quote}" built it.]\n${prev ? `  // prev system: '${prev.v}',   // [${prev.v}: James, 2026-10-24: "${prev.q}" built it.]\n` : ''}};\n`;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-update-'));
const origin = path.join(tmp, 'origin.git'), seed = path.join(tmp, 'seed'), install = path.join(tmp, 'install');
function setup() {
  G(tmp, 'init', '--bare', '-q', origin);
  fs.mkdirSync(seed); G(seed, 'init', '-q'); G(seed, 'remote', 'add', 'origin', origin);
  W(seed, 'VERSION', '0.1.0\n'); W(seed, 'lib/version.js', versionJs('0.1.0', 'first')); W(seed, 'a.js', 'one\n');
  W(seed, 'data/x/state.json', '{"n":1}\n'); W(seed, 'package-lock.json', '{"v":1}\n');
  G(seed, 'add', '-A'); G(seed, 'commit', '-q', '-m', '0.1.0'); G(seed, 'push', '-q', 'origin', 'HEAD:main');
  G(tmp, 'clone', '-q', '--branch', 'main', origin, install);
  W(seed, 'VERSION', '0.1.1\n'); W(seed, 'lib/version.js', versionJs('0.1.1', 'make it update itself', { v: '0.1.0', q: 'first' }));
  W(seed, 'a.js', 'two\n'); W(seed, 'data/x/state.json', '{"n":2}\n'); W(seed, 'package-lock.json', '{"v":2}\n');
  G(seed, 'add', '-A'); G(seed, 'commit', '-q', '-m', '0.1.1'); G(seed, 'push', '-q', 'origin', 'HEAD:main');
}

(async () => {
  setup();
  const head0 = G(install, 'rev-parse', 'HEAD');

  await test('UP-01', 'detect: a clone is git; an unzipped folder is told the clone; a COS store version is the COS driver', async () => {
    assert.strictEqual(U.detect({ root: install }).driver, 'git');
    const folder = path.join(tmp, 'nexus-0.1.0'); fs.mkdirSync(folder);
    const f = U.detect({ root: folder }); assert.strictEqual(f.driver, 'folder'); assert.match(f.why, /git clone https:\/\/github\.com\/HorrisEllis\/Nexus\.git/);
    assert.strictEqual(U.detect({ root: path.join(tmp, 'COS', 'projects', 'nexus', 'versions', '0.60.251') }).driver, 'cos');
    const c = U.check({ root: folder }); assert.strictEqual(c.ok, false); assert.strictEqual(c.driver, 'folder');
  });

  await test('UP-02', 'check: 0.1.0 → 0.1.1 from origin, his words for the release, the systems, the lockfile', async () => {
    const c = U.check({ root: install });
    assert.ok(c.ok, c.error);
    assert.deepStrictEqual([c.current, c.latest, c.behind, c.ahead, c.upToDate], ['0.1.0', '0.1.1', 1, 0, false]);
    assert.deepStrictEqual(c.releases.map(r => [r.version, r.quote]), [['0.1.1', 'James, 2026-10-25: "make it update itself"']]);
    assert.ok(c.systems.includes('data') && c.systems.includes('lib'), JSON.stringify(c.systems));
    assert.strictEqual(c.lockChanged, true);
    assert.deepStrictEqual([c.plan.archive.length, c.plan.blocks.length], [0, 0]);
  });

  await test('UP-03', 'apply refuses without confirm, and refuses his edit to code the update changes — naming it, touching nothing', async () => {
    const n = U.apply({ root: install }); assert.strictEqual(n.needsConfirm, true);
    W(install, 'a.js', 'mine\n');
    const r = U.apply({ root: install, confirm: true, runNpm: false });
    assert.strictEqual(r.ok, false); assert.match(r.error, /a\.js/);
    assert.strictEqual(G(install, 'rev-parse', 'HEAD'), head0, 'nothing moved');
    assert.strictEqual(fs.readFileSync(path.join(install, 'a.js'), 'utf8'), 'mine\n', 'his edit is untouched');
    G(install, 'checkout', '--', 'a.js');
  });

  await test('UP-04', 'his changed data file is copied aside, then the update fast-forwards; recorded', async () => {
    W(install, 'data/x/state.json', '{"n":"his"}\n');
    const r = U.apply({ root: install, confirm: true, by: 'person', runNpm: false });
    assert.ok(r.ok, r.error);
    assert.deepStrictEqual([r.from.version, r.to.version, r.archived], ['0.1.0', '0.1.1', ['data/x/state.json']]);
    assert.strictEqual(fs.readFileSync(path.join(install, r.archivedTo, 'data/x/state.json'), 'utf8'), '{"n":"his"}\n', 'his copy kept');
    assert.strictEqual(fs.readFileSync(path.join(install, 'data/x/state.json'), 'utf8'), '{"n":2}\n');
    assert.strictEqual(G(install, 'rev-parse', 'HEAD'), G(seed, 'rev-parse', 'HEAD'));
    assert.strictEqual(r.npm.ran, false); assert.match(r.npm.why, /changed, npm install was not run here/, 'a skipped install is said');
    assert.ok(r.restart && r.restart.systems.includes('lib'));
    const h = U.history({ root: install }); assert.strictEqual(h[0].kind, 'update'); assert.strictEqual(h[0].by, 'person');
    assert.strictEqual(U.check({ root: install, fetch: false }).upToDate, true);
  });

  await test('UP-05', 'rollback returns to the commit the update came from; a second has nothing to go back to', async () => {
    assert.strictEqual(U.rollback({ root: install }).needsConfirm, true);
    const r = U.rollback({ root: install, confirm: true, runNpm: false });
    assert.ok(r.ok, r.error); assert.deepStrictEqual([r.from.version, r.to.version], ['0.1.1', '0.1.0']);
    assert.strictEqual(G(install, 'rev-parse', 'HEAD'), head0);
    assert.match(r.note, /_archive[\\/]update/);
    const again = U.rollback({ root: install, confirm: true, runNpm: false }); assert.strictEqual(again.ok, false); assert.match(again.error, /did not come from an update/);
    assert.strictEqual(U.history({ root: install })[0].kind, 'rollback');
  });

  await test('UP-06', 'local commits are refused: merging is his', async () => {
    W(install, 'b.js', 'local\n'); G(install, 'add', 'b.js'); G(install, 'commit', '-q', '-m', 'local');
    const r = U.apply({ root: install, confirm: true, runNpm: false });
    assert.strictEqual(r.ok, false); assert.match(r.error, /diverged: 1 local commit/);
  });

  await test('UP-07', 'wired: tool, co-pilot hat, rows (apply/rollback his), routes, page, co-pilot names, loom', async () => {
    const quiet = console.log; console.log = () => {}; let T; try { T = require('../../lib/agent-tools'); } finally { console.log = quiet; }   // [jaa] lines would miscount the runner
    assert.ok(T.TOOLS.has('nexus.update.tool'));
    const tool = T.TOOLS.get('nexus.update.tool');
    assert.strictEqual((await tool.execute({ action: 'apply' })).needsConfirm, true, 'the tool will not apply without confirm');
    const seedSrc = fs.readFileSync(path.join(ROOT, 'lib/hat-seed.js'), 'utf8');
    assert.match(seedSrc, /'nexus\.update\.tool',\n\s*\],/); assert.match(seedSrc, /'0\.60\.252': \['nexus\.update\.tool'\]/);
    const SPEC = require('../../idearium/cli/route-commands.js').SPEC; const by = Object.fromEntries(SPEC.map(r => [r.key, r]));
    for (const k of ['update', 'update.apply', 'update.rollback', 'update.history']) assert.ok(by[k], k);
    assert.ok(by['update.apply'].personOnly() && by['update.rollback'].personOnly(), 'an agent through nexus.command is refused');
    assert.strictEqual(by['update'].req({ args: [], flags: { 'no-fetch': true } }).path, '/api/update?fetch=0');
    const api = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    for (const r of ["['GET',    ['api','update'], 'update.check']", "['POST',   ['api','update','apply'], 'update.apply']", "['POST',   ['api','update','restart'], 'update.restart']", "'update.apply': CAPS.ADMIN", "cleanUrl === '/update.html'"]) assert.ok(api.includes(r), r);
    assert.ok(fs.existsSync(path.join(ROOT, 'idearium/ui/update.html')));
    const V = require('../../clear-glass/src/copilot/verbs.js');
    assert.deepStrictEqual(V.updateIntent('is there an update?'), { kind: 'update' }); assert.strictEqual(V.updateIntent('update the readme'), null);
    assert.match(V.describeJob({ kind: 'update' }, { ok: true, current: '0.1.0', latest: '0.1.1', behind: 1, releases: [{ version: '0.1.1', quote: 'make it update itself' }], plan: { blocks: [] } }), /0\.1\.0 → 0\.1\.1.*\n0\.1\.1 — "make it update itself"/);
    const names = require('../../clear-glass/src/copilot/tools.js').TOOLS.map(t => t.name);
    for (const n of ['update.check', 'update.apply', 'update.rollback', 'update.history']) assert.ok(names.includes(n), n);
    assert.match(fs.readFileSync(path.join(ROOT, 'clear-glass/src/copilot/bridge.js'), 'utf8'), /update: 'nexus\.update\.tool'/);
    assert.match(fs.readFileSync(path.join(ROOT, 'loom/maps/economy-map.js'), 'utf8'), /0\.60\.252 UP4 nexus\.update\.tool/);
  });

  await test('UP-08', 'the Updates page in Clear Glass over the real backend: his words, Update, Roll back, history', async () => {
    const ui = path.join(tmp, 'ui-install'); G(tmp, 'clone', '-q', '--branch', 'main', origin, ui); G(ui, 'reset', '-q', '--hard', 'HEAD~1');
    const http = require('http');
    const page = fs.readFileSync(path.join(ROOT, 'idearium/ui/update.html'), 'utf8');
    const send = (res, code, body, type = 'application/json') => { res.writeHead(code, { 'Content-Type': type }); res.end(typeof body === 'string' ? body : JSON.stringify(body)); };
    const srv = http.createServer((req, res) => {
      let raw = ''; req.on('data', c => { raw += c; }); req.on('end', () => {
        const b = raw ? JSON.parse(raw) : {}; const u = req.url;
        if (u === '/update.html') return send(res, 200, page, 'text/html');
        if (u.startsWith('/js/')) return send(res, 200, '', 'application/javascript');
        if (u.startsWith('/api/update/history')) return send(res, 200, { ok: true, history: U.history({ root: ui }) });
        if (u.startsWith('/api/update/apply')) return send(res, 200, U.apply({ root: ui, confirm: b.confirm === true, runNpm: false }));
        if (u.startsWith('/api/update/rollback')) return send(res, 200, U.rollback({ root: ui, confirm: b.confirm === true, runNpm: false }));
        if (u.startsWith('/api/update')) return send(res, 200, U.check({ root: ui, fetch: !u.includes('fetch=0') }));
        send(res, 404, { ok: false });
      });
    });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const glass = require(path.join(ROOT, 'clear-glass/src/driver/glass.js'));
    let browser; try { browser = await glass.chromium.launch(); } catch (e) { srv.close(); console.log(`  - UP-08 SKIPPED: the engine could not start (${e.message.split('\n')[0]})`); return; }
    try {
      const pg = await browser.newPage({ viewport: { width: 1100, height: 900 } }); const errors = []; pg.on('pageerror', e => errors.push(e.message));
      await pg.addInitScript(() => { window.confirm = () => true; });
      await pg.goto(`http://127.0.0.1:${srv.address().port}/update.html`);
      await pg.waitForFunction(() => /Update to 0\.1\.1/.test(document.body.innerText), null, { timeout: 10000 });
      const t0 = await pg.evaluate(() => document.body.innerText);
      assert.ok(/1 commit\(s\) behind/.test(t0) && /make it update itself/.test(t0), 'his words for the release are on the page');
      await pg.click('#b-apply');
      await pg.waitForFunction(() => /0\.1\.0 → 0\.1\.1/.test(document.getElementById('msg').innerText), null, { timeout: 10000 });
      assert.ok(await pg.evaluate(() => !!document.querySelector('[data-restart="lib"]')), 'Restart buttons for the systems it changed');
      await pg.waitForFunction(() => /up to date/.test(document.body.innerText) && !!document.getElementById('b-rollback'), null, { timeout: 10000 });
      assert.strictEqual(G(ui, 'rev-parse', 'HEAD'), G(seed, 'rev-parse', 'HEAD'), 'the page really updated it');
      await pg.click('#b-rollback');
      await pg.waitForFunction(() => /rolled back 0\.1\.1 → 0\.1\.0/.test(document.body.innerText), null, { timeout: 10000 });
      await pg.waitForFunction(() => /rollback 0\.1\.1 → 0\.1\.0/.test(document.getElementById('history').innerText), null, { timeout: 10000 });
      assert.deepStrictEqual(errors, []); await pg.close();
    } finally { await browser.close(); srv.close(); }
  });

  await test('UP-09', 'adopt: his state comes across from the old folder (ignored files, tracked data), code never does', async () => {
    const clone = path.join(tmp, 'clone2'); G(tmp, 'clone', '-q', '--branch', 'main', origin, clone);
    W(clone, '.gitignore', 'data/mem/\n'); G(clone, 'add', '.gitignore'); G(clone, 'commit', '-q', '-m', 'ignore');
    const old = path.join(tmp, 'nexus-0.1.0-unzipped');
    W(old, 'VERSION', '0.1.0\n'); W(old, 'a.js', 'old code\n'); W(old, 'data/x/state.json', '{"n":"his runtime"}\n'); W(old, 'data/mem/store.jaa', 'his memory\n'); W(old, 'node_modules/z/i.js', 'x');
    assert.strictEqual(U.adopt({ root: clone, from: old }).needsConfirm, true);
    const r = U.adopt({ root: clone, from: old, confirm: true });
    assert.ok(r.ok, r.error);
    assert.deepStrictEqual([r.copied, r.ignoredState, r.trackedData], [2, 1, 1]);
    assert.strictEqual(fs.readFileSync(path.join(clone, 'data/mem/store.jaa'), 'utf8'), 'his memory\n', 'the ignored store came across');
    assert.strictEqual(fs.readFileSync(path.join(clone, 'data/x/state.json'), 'utf8'), '{"n":"his runtime"}\n', 'his runtime data, not the release snapshot');
    assert.strictEqual(fs.readFileSync(path.join(clone, r.archivedTo, 'data/x/state.json'), 'utf8'), '{"n":2}\n', 'the clone\'s copy kept');
    assert.strictEqual(fs.readFileSync(path.join(clone, 'a.js'), 'utf8'), 'two\n', 'code is never copied back');
    assert.ok(!fs.existsSync(path.join(clone, 'node_modules')), 'node_modules is not copied');
    assert.strictEqual(fs.readFileSync(path.join(old, 'data/x/state.json'), 'utf8'), '{"n":"his runtime"}\n', 'the old folder is only read');
    assert.match(U.adopt({ root: clone, from: path.join(tmp, 'nope'), confirm: true }).error, /not a Nexus folder/);
  });

  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
