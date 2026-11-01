'use strict';
// run-all: timeout 120000
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-tension-channel.test.js — CI8, 0.60.351. Map: docs/2026-10-31-causal-interconnect-phasemap.spec CI8.
 * James, 2026-11-01: "72% so make sure it is tv ui and i can access it,".
 *   TC-01  the orchestrator forwards /api/tension-field/{tension,friction} to Intelligence; a silent one is a 503 naming it (source read)
 *   TC-02  the command row `tension` calls the orchestrator
 *   TC-03  the channel in Clear Glass against a stand-in orchestrator: systems sorted by tension with regimes and parts; sources shown
 *   TC-04  Cortex down: open loops said as unknown, never 0; Intelligence down: said in red, by name
 *   TC-05  the TV: TENSION appended after EMERGENCE, its page loaded on tune
 */
const assert = require('assert'), http = require('http'), path = require('path'), fs = require('fs');
const ROOT = path.join(__dirname, '..', '..'), UI = path.join(ROOT, 'lib/ui/tv-shell');
if (!process.env.GLASS_CHROMIUM) { const c = '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'; if (fs.existsSync(c) && !fs.existsSync(path.join(ROOT, 'node_modules/electron'))) process.env.GLASS_CHROMIUM = c; }
let passed = 0, failed = 0;
async function test(id, d, fn) { try { await fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${(e.stack || e.message).split('\n').slice(0, 4).join('\n    ')}`); failed++; } }
const { tensionOf } = require(path.join(ROOT, 'intelligence/friction.js'));

(async () => {
  console.log('\n◬  The TENSION channel (CI8)\n');
  await test('TC-01', 'the orchestrator forwards to Intelligence; silent → 503 naming it (source read, not run)', () => {
    const src = fs.readFileSync(path.join(ROOT, 'orchestrator/orchestrator.js'), 'utf8');
    const i = src.indexOf("sub === 'tension-field'"); assert.ok(i > 0);
    const b = src.slice(i, i + 900);
    assert.ok(/GET\('intelligence', `\/api\/intelligence\/\$\{what\}`/.test(b) && /503/.test(b) && /intelligence did not answer/.test(b), b);
  });
  await test('TC-02', 'the command row calls the orchestrator', async () => {
    const { SPEC } = await import(require('url').pathToFileURL(path.join(ROOT, 'idearium/cli/route-commands.js')).href);
    const row = SPEC.find(r => r.key === 'tension');
    assert.deepStrictEqual(row.req({ args: [], flags: {} }), { system: 'orchestrator', method: 'GET', path: '/api/tension-field/tension' });
    assert.strictEqual(row.req({ args: ['friction'], flags: {} }).path, '/api/tension-field/friction');
  });

  let mode = 'ok';
  const reply = () => {
    const fr = { guardian: { friction: 0.9, monitorGaps: 2, slope: 0.25, sigma: 1 }, loom: { friction: 0.1, monitorGaps: 0, slope: 0, sigma: 0 } };
    const loops = mode === 'nocortex' ? null : { guardian: { total: 1.5, count: 3, top: [{ uuid: 'g1', type: 'dangling-hook', tension: 0.9 }] } };
    const T = tensionOf(fr, loops);
    return { ok: true, tension: T.bySystem, max: T.max, regime: T.regime, loopsKnown: T.loopsKnown, field: { friction: 0.3 }, ts: Date.now(), by: 'intelligence', formula: 'intelligence/friction.js',
      sources: [{ source: 'diagnostic', ok: true, what: 'x' }, { source: 'cortex', ok: mode !== 'nocortex', what: 'y', ...(mode === 'nocortex' ? { why: 'ECONNREFUSED' } : {}) }, { source: 'cfr', ok: true, what: 'z' }] };
  };
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0]); res.setHeader('Access-Control-Allow-Origin', '*');
    const j = (s, d) => { res.statusCode = s; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(d)); };
    if (u === '/api/tension-field/tension') return mode === 'nointel' ? j(503, { ok: false, error: 'intelligence did not answer: timeout' }) : j(200, reply());
    const f = path.join(UI, u); if (!f.startsWith(UI) || !fs.existsSync(f)) { res.statusCode = 404; return res.end(); }
    res.setHeader('Content-Type', f.endsWith('.css') ? 'text/css' : f.endsWith('.js') ? 'application/javascript' : 'text/html'); res.end(fs.readFileSync(f));
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${srv.address().port}`;
  const glass = require(path.join(ROOT, 'clear-glass/src/driver/glass.js'));
  let browser; try { browser = await glass.chromium.launch(); } catch (e) { console.log(`  - TC-03..04 SKIPPED: the engine could not start (${e.message.split('\n')[0]})`); }
  if (browser) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
    const open = async () => { await page.goto(`${origin}/channels/tension/tension.html?orch=${encodeURIComponent(origin)}`); await page.waitForFunction(() => !/reading…/.test(document.getElementById('tn-systems').textContent)); };
    await test('TC-03', 'systems sorted by tension, regimes and parts shown, sources shown', async () => {
      mode = 'ok'; await open();
      const names = await page.evaluate(() => [...document.querySelectorAll('.tn-sys')].map(e => e.dataset.system));
      assert.deepStrictEqual(names, ['guardian', 'loom']);
      const g = await page.evaluate(() => document.querySelector('.tn-sys[data-system="guardian"]').textContent);
      // 0.9 × 1.4 × 1.5 = 1.89; + 0.3 × 1.5 = 2.34 → critical
      assert.ok(/2\.34/.test(g) && /critical/.test(g) && /open loops 3/.test(g) && /dangling-hook/.test(g), g);
      assert.ok(/cortex ✓/.test(await page.evaluate(() => document.getElementById('tn-sources').textContent)));
      if (process.env.TC_SHOTS) await page.screenshot({ path: path.join(process.env.TC_SHOTS, 'tension-channel.png') });
    });
    await test('TC-04', 'Cortex down → unknown, never 0; Intelligence down → said by name', async () => {
      mode = 'nocortex'; await open();
      const g = await page.evaluate(() => document.querySelector('.tn-sys[data-system="guardian"]').textContent);
      assert.ok(/loops unknown/.test(g) && /open loops unknown/.test(g), g);
      assert.ok(/cortex ✗ ECONNREFUSED/.test(await page.evaluate(() => document.getElementById('tn-sources').textContent)));
      mode = 'nointel'; await open();
      assert.ok(/intelligence did not answer: timeout/.test(await page.evaluate(() => document.querySelector('.tn-bad').textContent)));
      mode = 'ok';
    });
    await browser.close();
  }
  srv.close();
  await test('TC-05', 'the TV: TENSION appended after EMERGENCE, loaded on tune', () => {
    const html = fs.readFileSync(path.join(UI, 'index.html'), 'utf8');
    const meta = html.slice(html.indexOf('const CH_META=['), html.indexOf('];', html.indexOf('const CH_META=[')));
    const ids = [...meta.matchAll(/\{id:'([^']+)'/g)].map(m => m[1]);
    assert.ok(ids.indexOf('ch-tension') > ids.indexOf('ch-emergence'), 'appended, never inserted');
    assert.ok(/id="ch-tension"/.test(html) && /f\.src='channels\/tension\/tension\.html'/.test(html));
  });
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
