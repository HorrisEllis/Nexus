'use strict';
/**
 * tests/modules/test-cos-services.test.js — SV0: his engines in COS, each stack inside its own root (0.60.235)
 * Spec: cos/spec/cos-services.spec (MOD-SV-KERNEL, -SDK, -ENGINES). Map: docs/2026-10-24-cos-services-phasemap.spec SV0.
 * James, 2026-10-24: "i want to use those engines for test env, web servers, etc all of them" · "this is all the networking backend for
 * anything needed netwroking wise"
 *
 *   SV-01  the gate grammar: every gate the engines send (read from their own source) compiles and filters as JavaScript would; a gate
 *          carrying code or a stray quote is refused (auth.js built gates from a login's handle: that ran code in the kernel)
 *   SV-02  two kernels in two temp roots both come up and answer status on their own control socket; stopping one leaves the other
 *   SV-03  the engines, the SDK and the upstream files are exactly as he brought them (UPSTREAM.sha256); only nexus.js differs, and every
 *          change in it is marked "COS:"
 *   SV-04  nothing secret came in: no conf/, state/, logs/, .key or identity file under cos/services
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const A = path.join(ROOT, 'cos/services/anonymous');
process.env.SERVICES_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'sv-k-'));   // the kernel opens its store under its root: never inside the code
const K = require(path.join(A, 'nexus.js'));

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 5).join('\n    ') : e.message}`); failed++; }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('\n  test-cos-services — SV0 his engines in COS\n');

  await test('SV-01', 'every gate the engines send compiles and filters as JS would; code or a stray quote is refused', () => {
    let n = 0;
    for (const f of fs.readdirSync(path.join(A, 'engines')).filter(x => x.endsWith('.js'))) {
      const src = fs.readFileSync(path.join(A, 'engines', f), 'utf8');
      for (const m of src.matchAll(/db\.(?:query|update|delete|upsert)\(\s*'[a-z_]+'\s*,\s*`(r\s*=>[^`]*)`/g)) {
        const gate = m[1].replace(/'\$\{[^}]+\}'/g, "'v'").replace(/\$\{[^}]+\}/g, '5');
        const fn = K.compileGate(gate);
        const js = new Function(`return (${gate})`)();   // eslint-disable-line no-new-func -- the test compares with real JS, on its own literals
        const rows = [{}, { handle: 'v', tenantId: 'v', status: 'v', key: 'v', bucket: 'v', domain: 'v', id: 'v', userId: 'v', hashed: 'v', address: 'v', _id: 5, trialEnd: 1, finishedAt: 1, nextRunAt: 5, expiresAt: 9 }, { tenantId: 'w', _id: 6, expiresAt: 1 }];
        assert.deepStrictEqual(rows.map(r => !!fn(r)), rows.map(r => !!js(r)), `${f}: ${gate}`);
        n++;
      }
    }
    assert.ok(n >= 30, `${n} gates read from the engines`);
    for (const bad of ["r => r.handle === 'x' || process.exit() || ''", "r => r.handle === 'x\\' || true || \\''", "r => `r.hashed === 'h'`", "r => require('fs')", "r => r.constructor.constructor('x')()", '']) assert.throws(() => K.compileGate(bad), /gate refused/, bad);
    const code = fs.readFileSync(path.join(A, 'nexus.js'), 'utf8').split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).map(l => l.replace(/\/\/.*$/, '')).join('\n');
    assert.ok(!/new Function\s*\(/.test(code), 'the kernel builds no function from an IPC string (its code, comments aside)');
  });

  await test('SV-02', 'two kernels in two temp roots both answer status; stopping one leaves the other', async () => {
    const roots = [0, 1].map(() => fs.mkdtempSync(path.join(os.tmpdir(), 'sv-')));
    const kids = roots.map(r => spawn(process.execPath, [path.join(A, 'nexus.js'), 'up', 'signal'], { env: { ...process.env, SERVICES_ROOT: r }, stdio: 'ignore' }));
    try {
      const status = (r) => { const s = spawnSync(process.execPath, [path.join(A, 'nexus.js'), 'status'], { env: { ...process.env, SERVICES_ROOT: r }, encoding: 'utf8', timeout: 15000 }); return s.stdout || ''; };
      let st = ['', ''];
      for (let i = 0; i < 40 && !st.every(x => /"signal"/.test(x)); i++) { await sleep(250); st = roots.map(status); }
      assert.ok(st.every(x => /"signal"/.test(x) && /"alive":\s*true/.test(x)), st.join('\n---\n').slice(0, 600));
      assert.ok(fs.existsSync(path.join(roots[0], 'state', 'pids.json')) && fs.existsSync(path.join(roots[1], 'state', 'pids.json')), 'each root recorded its own processes');
      kids[0].kill('SIGTERM'); await sleep(1500);
      assert.ok(!/"alive":\s*true/.test(status(roots[0])), 'the first is down');
      assert.ok(/"signal"/.test(status(roots[1])) && /"alive":\s*true/.test(status(roots[1])), 'the second still answers');
    } finally { for (const k of kids) { try { k.kill('SIGKILL'); } catch (_) {} } for (const r of roots) { try { const p = JSON.parse(fs.readFileSync(path.join(r, 'state', 'pids.json'), 'utf8')); for (const pid of Object.values(p.engines || {})) { try { process.kill(pid, 'SIGKILL'); } catch (_) {} } } catch (_) {} } }
  });

  await test('SV-03', 'the engines and upstream files are as he brought them; only nexus.js differs, its changes marked', () => {
    const lines = fs.readFileSync(path.join(A, 'UPSTREAM.sha256'), 'utf8').trim().split('\n');
    assert.ok(lines.length >= 40, `${lines.length} upstream files`);
    const differ = [];
    for (const l of lines) {
      const [sum, rel] = l.split(/\s+/);
      const here = rel === 'README.md' ? 'README-upstream.md' : rel;
      const now = crypto.createHash('sha256').update(fs.readFileSync(path.join(A, here))).digest('hex');
      if (now !== sum) differ.push(rel);
    }
    assert.deepStrictEqual(differ, ['nexus.js'], 'only the kernel was changed');
    const k = fs.readFileSync(path.join(A, 'nexus.js'), 'utf8');
    assert.ok((k.match(/COS:/g) || []).length >= 6, 'each change in the kernel is marked COS: with why');
    assert.ok(/async function killOrphansMachineWide/.test(k), 'his machine-wide sweep is kept (§0.3), unused');
  });

  await test('SV-04', 'nothing secret came in: no conf/, state/, logs/, key or identity under cos/services', () => {
    const bad = [];
    (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (['conf', 'state', 'logs'].includes(e.name) && !p.includes(`${path.sep}defaults${path.sep}`)) bad.push(p); else walk(p); } else if (/\.(key|pem)$|^identity\.json$|\.conf$/.test(e.name)) bad.push(p); } })(path.join(ROOT, 'cos/services'));
    assert.deepStrictEqual(bad.map(p => path.relative(ROOT, p)), []);
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
