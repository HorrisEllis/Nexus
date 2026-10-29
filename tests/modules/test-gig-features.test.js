'use strict';
/**
 * tests/modules/test-gig-features.test.js — a gig's package rows (AP1, 0.60.281)
 * James, 2026-10-29: "update the gig files."
 *
 *   GF-01  features: in a .gig — numbers and text kept, yes/no → ticked/clear, empty values warned and dropped; gigParts lists them;
 *          every bundled gig parses with them; the template carries the line
 *   GF-02  in Clear Glass: checkAt ticks only a box in the wrong state and reads it back; rowLabels lists the rows left of a column
 *   GF-03  in Clear Glass: the fill's rows (_gigFeatures) — a dropdown row picked and read back, a checkbox row ticked, a row the gig
 *          does not name listed back, a value the menu lacks failed with why
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const CG = (p) => path.join(ROOT, 'clear-glass', p);

let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${(e.stack || e.message).split('\n').slice(0, 6).join('\n    ')}`); failed++; } }

(async () => {
  console.log('\n⬡  A gig\'s package rows\n');
  const G = require(CG('src/autofill/gig.js'));

  await test('GF-01', 'features parsed; gigParts lists them; the bundled gigs parse; the template carries the line', async () => {
    const yaml = ['title: I will build an agent workflow that automates your repetitive work', 'packages:',
      '  basic:', '    name: A', '    description: one', '    deliveryDays: 3', '    revisions: 1', '    price: 60',
      '    features:', '      "Number of APIs integrated": 1', '      "Data Syncing": no', '      "Conditional Logic": yes', '      "Empty one": ""', '      "Plan": Monthly'].join('\n');
    const r = G.parseGig(yaml);
    assert.ok(r.ok, JSON.stringify(r));
    assert.deepStrictEqual(r.gig.packages.basic.features, { 'Number of APIs integrated': 1, 'Data Syncing': false, 'Conditional Logic': true, Plan: 'Monthly' });
    assert.ok(r.warnings.some(w => /the basic feature "Empty one" has no value/.test(w)), JSON.stringify(r.warnings));
    const part = G.gigParts(r.gig).find(p => p.key === 'basic.features');
    assert.strictEqual(part.text, 'Number of APIs integrated: 1 · Data Syncing: no · Conditional Logic: yes · Plan: Monthly');
    assert.match(G.parseGig(yaml.replace(/    features:[\s\S]*/, '    features: [1, 2]')).warnings.join(' '), /features are not "row label: value" pairs/);
    for (const f of fs.readdirSync(CG('docs/gigs')).filter(f => f.endsWith('.gig'))) {
      const g = G.parseGig(fs.readFileSync(CG('docs/gigs/' + f), 'utf8'));
      assert.ok(g.ok, f);
      for (const t of Object.keys(g.gig.packages)) assert.ok(g.gig.packages[t].features && typeof g.gig.packages[t].features === 'object', `${f} ${t}`);
    }
    const agent = G.parseGig(fs.readFileSync(CG('docs/gigs/ai-agent-workflow-automation.gig'), 'utf8')).gig.packages;
    assert.deepStrictEqual(Object.keys(agent.standard.features), ['Number of APIs integrated', 'Number of Triggers / Actions', 'Number of Platform/Tools Integrated', 'Data Syncing', 'Conditional Logic']);
    assert.match(G.gigTemplate().text, /features: \{\}/);
  });

  const glass = require(CG('src/driver/glass.js'));
  let browser; try { browser = await glass.chromium.launch(); } catch (e) { console.log(`  - GF-02/03 SKIPPED: the engine could not start (${e.message.split('\n')[0]})`); }
  // a pricing table like Fiverr's: row labels on the left, a dropdown or a checkbox per tier
  const PAGE = `<!doctype html><html><head><style>body{font:14px sans-serif;margin:0} table{margin:40px;border-collapse:collapse} td,th{border:1px solid #ccc;padding:10px;width:180px}
  .dd{cursor:pointer} .menu{position:absolute;width:200px;background:#fff;border:1px solid #888} .menu div{padding:6px}</style></head><body>
  <table><tr><th></th><th>BASIC</th><th>STANDARD</th><th>PREMIUM</th></tr>
  <tr><td>Number of APIs integrated</td><td><div class="dd">Select</div></td><td><div class="dd">Select</div></td><td><div class="dd">Select</div></td></tr>
  <tr><td>Data Syncing</td><td><input type="checkbox"></td><td><input type="checkbox" checked></td><td><input type="checkbox"></td></tr>
  <tr><td>Source code</td><td><input type="checkbox"></td><td><input type="checkbox"></td><td><input type="checkbox"></td></tr></table>
  <script>var opts = ['Select','1','2','3','4','5']; var menu = null;
  function close(){ if (menu) { menu.remove(); menu = null; } }
  document.querySelectorAll('.dd').forEach(function(dd){ dd.addEventListener('click', function(){ close();
    menu = document.createElement('div'); menu.className = 'menu'; var r = dd.getBoundingClientRect(); menu.style.left = r.left + 'px'; menu.style.top = (r.bottom + scrollY) + 'px';
    opts.forEach(function(t){ var o = document.createElement('div'); o.textContent = t; o.addEventListener('click', function(){ dd.textContent = t; close(); }); menu.appendChild(o); });
    document.body.appendChild(menu); }); });</script></body></html>`;
  const MAP = { mouseMove: 'mouseMoved', mouseDown: 'mousePressed', mouseUp: 'mouseReleased' };
  const fast = { openWait: [40, 60], pickWait: [20, 30], settleWait: [60, 80], optionsWaitMs: 1500, via: 'native', spotlight: false };
  async function driverOn(page) {
    const ClearDriver = require(CG('src/driver/index.js'));
    const d = new ClearDriver({ ctxMgr: {}, dom: {}, vault: {}, sse: { emit: () => {} } });
    d._getWebContents = () => ({ executeJavaScript: (c) => page._eval(c), getURL: () => 'https://www.fiverr.com/edit', sendInputEvent: (e) => {
      if (MAP[e.type]) return page._send('Input.dispatchMouseEvent', { type: MAP[e.type], x: e.x, y: e.y, button: e.type === 'mouseMove' ? 'none' : (e.button || 'left'), buttons: e.type === 'mouseDown' ? 1 : 0, clickCount: e.type === 'mouseMove' ? 0 : (e.clickCount || 1) }); } });
    return d;
  }
  const checked = (page) => page.evaluate(() => Array.prototype.map.call(document.querySelectorAll('input'), i => i.checked));

  if (browser) {
    await test('GF-02', 'in Clear Glass: checkAt ticks only a box in the wrong state, read back; rowLabels lists the rows', async () => {
      const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
      await page.goto('data:text/html;charset=utf-8,' + encodeURIComponent(PAGE));
      const d = await driverOn(page);
      const a = await d.exec({ agentId: 'w', action: 'checkAt', column: 'BASIC', row: 'Data Syncing', checked: true, via: 'native' });
      assert.deepStrictEqual([a.changed, a.checked], [true, true]);
      const b = await d.exec({ agentId: 'w', action: 'checkAt', column: 'STANDARD', row: 'Data Syncing', checked: true, via: 'native' });
      assert.strictEqual(b.changed, false, 'already ticked: not clicked');
      const c = await d.exec({ agentId: 'w', action: 'checkAt', column: 'STANDARD', row: 'Data Syncing', checked: false, via: 'native' });
      assert.strictEqual(c.changed, true);
      assert.deepStrictEqual((await checked(page)).slice(0, 3), [true, false, false]);
      await assert.rejects(d.exec({ agentId: 'w', action: 'checkAt', column: 'BASIC', row: 'Number of APIs integrated' }), /no checkbox at column "BASIC", row "Number of APIs integrated"/);
      await assert.rejects(d.exec({ agentId: 'w', action: 'checkAt', column: 'BASIC', row: 'Nope' }), /no row labelled "Nope"/);
      const rl = await d.exec({ agentId: 'w', action: 'rowLabels', column: 'BASIC' });
      assert.deepStrictEqual(rl.labels, ['Number of APIs integrated', 'Data Syncing', 'Source code']);
      await page.close();
    });

    await test('GF-03', 'in Clear Glass: the fill\'s rows — picked and read back, ticked, an unnamed row listed, a missing value failed with why', async () => {
      const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
      await page.goto('data:text/html;charset=utf-8,' + encodeURIComponent(PAGE));
      const d = await driverOn(page);
      // the fill's driver calls go through the real driver, with the test's quick waits
      const self = { driver: { exec: (a) => d.exec({ ...a, ...(a.action === 'choose' ? fast : { via: 'native' }) }) } };
      const Bridge = require(CG('src/ipc/bridge.js'));
      const gig = { packages: {
        basic: { features: { 'Number of APIs integrated': 1, 'Data Syncing': true } },
        standard: { features: { 'Number of APIs integrated': 3, 'Data Syncing': false } },
        premium: { features: { 'Number of APIs integrated': 9 } } } };
      const r = await Bridge.prototype._gigFeatures.call(self, 'w', gig);
      assert.deepStrictEqual(r.filled.map(f => `${f.tier}:${f.row}=${f.value}`), ['basic:Number of APIs integrated=1', 'basic:Data Syncing=true', 'standard:Number of APIs integrated=3', 'standard:Data Syncing=false'], JSON.stringify(r));
      assert.deepStrictEqual(await page.evaluate(() => Array.prototype.map.call(document.querySelectorAll('.dd'), x => x.textContent)), ['1', '3', 'Select']);
      assert.deepStrictEqual((await checked(page)).slice(0, 3), [true, false, false]);
      assert.strictEqual(r.failed.length, 1);
      assert.strictEqual(r.failed[0].tier, 'premium');
      assert.ok(r.failed[0].why.length > 0, JSON.stringify(r.failed));
      assert.deepStrictEqual(r.unlisted, ['Source code']);
      await page.close();
    });
    await browser.close();
  }

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
