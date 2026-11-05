'use strict';
/**
 * tests/modules/test-eros-options.test.js — ES1 and ES3 (docs/2026-11-05-cleardriver-mutators-and-erosmancer-surface-phasemap.spec)
 * James, 2026-11-05: "can you expand erosmanceros. add as much human ledgible options as possible, inscluding adding typescripts, threats, etc,
 * all cli first, then into the browser.html." · "finish erosmancer"
 *
 *   EO-01  ES1  every option in ErosmancerOS's OSConfig is listed (settable, fixed in its code, or set by Clear Glass) with plain words; the
 *               defaults are read from its source, never copied by hand
 *   EO-02  ES1  a set is read back and recorded; a bad value is refused with the allowed ones; default puts it back; the connect carries whole
 *               sections (its merge is one level deep) and nothing when nothing changed
 *   EO-03  ES3  every threat type hostile/ names has its words; the states are said in plain words
 *   EO-04  ES3  the page check, run in a real page (Clear Glass's engine): a Turnstile, a reCAPTCHA and "Just a moment" are seen; a plain page is
 *               not; the hand-over pauses a run and says which check, on which page — and nothing in it clicks or changes the page
 *   EO-05  the doors and the CLI: /cli/eros/options, /cli/eros/threats, the hand-over before every macro step, eros options|set|threats rows;
 *          ErosmancerOS's own files untouched
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
if (!process.env.GLASS_CHROMIUM) { const c = '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'; if (fs.existsSync(c) && !fs.existsSync(path.join(ROOT, 'node_modules/electron/dist/electron'))) process.env.GLASS_CHROMIUM = c; }
const O = require(path.join(ROOT, 'clear-glass/src/eros/options.js'));
const T = require(path.join(ROOT, 'clear-glass/src/eros/threats.js'));

let passed = 0, failed = 0;
async function test(id, d, fn) { try { await fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${(e.stack || e.message).split('\n').slice(0, 5).join('\n    ')}`); failed++; } }

(async () => {
  console.log('\n⬡  ErosmancerOS in plain words: options and threats (ES1, ES3)\n');

  await test('EO-01', 'every option listed in plain words; defaults read from its source', () => {
    const leaves = O.leavesFromSource();
    assert.ok(leaves.length >= 20, `only ${leaves.length} leaves read`);
    const listed = new Set([...O.CATALOGUE.map(o => o.key), ...Object.keys(O.FIXED), ...Object.keys(O.MANAGED)]);
    assert.deepStrictEqual(leaves.filter(k => !listed.has(k)), [], 'an option in the code with no words');
    for (const o of O.CATALOGUE) assert.ok(o.words && o.does && o.does.length > 20, o.key);
    const d = O.defaultsFromSource();
    assert.deepStrictEqual([d['bridge.commandTimeoutMs'], d['dispatcher.defaultMaxRetries'], d['behavior.maxSessionAgeMs'], d['routing.mismatchThreshold'], d['observer.enabled']], [30000, 3, 1800000, 0.3, true]);
    assert.strictEqual(d['selector.fallbackChain'][0], 'uuid');
  });

  await test('EO-02', 'set, read back, refuse, reset; recorded; the connect config', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'eros-opt-')), 'options.json'); const recs = [];
    const E = O.createOptions({ file, record: (r) => recs.push(r) });
    assert.strictEqual(E.connectConfig(), null, 'nothing changed → nothing sent (the connect is as before)');
    const r = E.set('selector.timeoutMs', '8s');
    assert.deepStrictEqual([r.value, r.when], [8000, 'connect']);
    assert.strictEqual(E.get('selector.timeoutMs').changed, true);
    assert.match(recs[0].message, /selector\.timeoutMs: 5000 → 8000/);
    assert.throws(() => E.set('pace', 'sneaky'), /one of precise, cautious, exploratory, turbo/);
    assert.throws(() => E.set('selector.fallbackChain', 'xpath, magic'), /magic is not a way/);
    assert.throws(() => E.set('dispatcher.defaultMaxRetries', 99), /between 0 and 20/);
    assert.throws(() => E.set('nope', 1), /no ErosmancerOS option "nope"/);
    E.set('Pace', 'cautious');
    const c = E.connectConfig();
    assert.deepStrictEqual(Object.keys(c), ['selector']);
    assert.deepStrictEqual(c.selector.timeoutMs, 8000); assert.ok(Array.isArray(c.selector.fallbackChain) && c.selector.fallbackChain.length === 7, 'the whole section, so its other values stay');
    E.reset('selector.timeoutMs'); assert.strictEqual(E.connectConfig(), null);
    // the supervisor sends it with the connect
    const { ErosSupervisor } = require(path.join(ROOT, 'clear-glass/src/eros/supervisor.js'));
    E.set('bridge.commandTimeoutMs', 60000);
    const sent = []; const sup = new ErosSupervisor({ dataDir: path.dirname(file), log: () => {}, _post: async (port, p, body) => { sent.push(body); return { ok: true }; } });
    return sup.connect({ tries: 1 }).then(() => { assert.strictEqual(sent[0].config.bridge.commandTimeoutMs, 60000); assert.strictEqual(sent[0].target.type, 'local'); });
  });

  await test('EO-03', 'every threat type has its words; states said plainly', () => {
    const types = T.typesFromSource();
    assert.ok(types.length >= 10, types.join(','));
    assert.deepStrictEqual(types.filter(t => !T.WORDS[t]), []);
    const said = T.describe({ tab1: { level: 'high', score: 70, activeSignals: [{ type: 'cloudflare-turnstile', level: 'high', evidence: 'iframe challenges.cloudflare.com', ts: 1 }] }, tab2: { level: 'none', activeSignals: [] } });
    assert.strictEqual(said.length, 1);
    assert.match(said[0].signals[0].what, /Turnstile/); assert.match(said[0].signals[0].then, /yours/);
    for (const t of ['fingerprint-script', 'cdp-detection']) assert.match(T.WORDS[t].then, /nothing is changed to hide/);
  });

  await test('EO-04', 'the page check in a real page; the hand-over pauses and says which check', async () => {
    const glass = require(path.join(ROOT, 'clear-glass/src/driver/glass.js'));
    let browser; try { browser = await glass.chromium.launch(); } catch (e) { console.log(`    (the page part skipped: the engine could not start — ${e.message.split('\n')[0]})`); }
    if (browser) {
      const page = await browser.newPage();
      const seen = async (html, title = 'x') => { await page.goto(`data:text/html,${encodeURIComponent(`<title>${title}</title>${html}`)}`); return page.evaluate(T.PAGE_CHECK); };
      try {
      assert.strictEqual((await seen('<div class="cf-turnstile"></div>')).challenge, 'cloudflare-turnstile');
      assert.strictEqual((await seen('<div class="g-recaptcha"></div>')).challenge, 'recaptcha');
      assert.strictEqual((await seen('<p>Checking your browser</p>', 'Just a moment...')).challenge, 'cloudflare-challenge');
      assert.strictEqual((await seen('<h1>Gig overview</h1><input name="title">')).challenge, null);
      } finally { await browser.close(); }
    }
    let paused = 0, told = null;
    const h = await T.handOver({ check: async () => ({ result: { challenge: 'hcaptcha', saw: 'an hCaptcha' } }), pause: () => paused++, notify: (m) => { told = m; }, url: 'https://www.fiverr.com/x' });
    assert.deepStrictEqual([h.handedOver, h.type, paused], [true, 'hcaptcha', 1]);
    assert.match(told, /hCaptcha on https:\/\/www\.fiverr\.com\/x — the macro is paused; the page is yours: solve it, then press resume/);
    const n = await T.handOver({ check: async () => ({ challenge: 'fingerprint-script' }), pause: () => paused++ });
    assert.strictEqual(n.handedOver, false, 'only a check a person answers pauses the run'); assert.strictEqual(paused, 1);
    assert.doesNotMatch(T.PAGE_CHECK, /\.click\(|\.value\s*=|dispatchEvent|removeChild|\.remove\(\)|setAttribute/, 'the check only looks');
  });

  await test('EO-05', 'the doors, the CLI rows, the hand-over before each step; ErosmancerOS untouched', () => {
    const b = fs.readFileSync(path.join(ROOT, 'clear-glass/src/ipc/bridge.js'), 'utf8');
    for (const r of ["this.app.get('/cli/eros/options'", "this.app.post('/cli/eros/options'", "this.app.get('/cli/eros/threats'"]) assert.ok(b.includes(r), r);
    assert.match(b, /const runStep = async \(\{ action, data = \{\} \}\) => \{\n\s+await handOver\(\);/);
    const rows = require(path.join(ROOT, 'idearium/cli/route-commands.js'));
    const all = JSON.stringify(Object.keys(rows)) + fs.readFileSync(path.join(ROOT, 'idearium/cli/route-commands.js'), 'utf8');
    for (const k of ["key: 'eros.options'", "key: 'eros.set'", "key: 'eros.threats'"]) assert.ok(all.includes(k), k);
    const changed = execSync('git status --porcelain -- clear-glass/erosmancer/erosmancer-os/src', { cwd: ROOT, encoding: 'utf8' }).trim();
    assert.strictEqual(changed, '', `ErosmancerOS's source was changed: ${changed}`);
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`); process.exitCode = failed ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 300);
})();
