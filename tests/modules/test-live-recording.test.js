'use strict';
// LR-01..LR-08 (0.60.57): a recording is a .macro node file from the first second, grows live, survives navigation, never stores a password,
// keeps scroll and paging keys. jsdom + a fake webContents (AXIOMS 4.1: no Playwright).
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert'), path = require('path'), fs = require('fs'), os = require('os'), { EventEmitter } = require('events');
const { JSDOM } = require(path.join(__dirname, '..', '..', 'node_modules', 'jsdom'));
const ROOT = path.resolve(__dirname, '..', '..');
const { LiveRecorder } = require(path.join(ROOT, 'clear-glass/src/macros/live-recording.js'));
const nodes = require(path.join(ROOT, 'lib/automation-nodes.js'));
const { recordingToSteps } = require(path.join(ROOT, 'clear-glass/src/macros/recording.js'));
let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); console.log('  ✓ ' + name); passed++; } catch (e) { console.error('  ✗ ' + name + '\n    ' + (e.stack || e).toString().split('\n').slice(0, 4).join('\n    ')); failed++; } }

const HTML = '<html><body><input id="q" name="q"><input id="pw" type="password" name="password"><button id="go">Go</button><div id="box" style="overflow:auto"></div></body></html>';
function rig() {
  const wc = new EventEmitter(); let win = null;
  const open = (url, carry) => { win = new JSDOM(HTML, { url, runScripts: 'outside-only' }).window; if (carry) win.sessionStorage.setItem('__cgRecQ', carry); };
  open('https://example.test/a');
  wc.eval = (code) => win.eval(code);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-'));
  const clock = { t: 1000 };
  const rec = new LiveRecorder({ getWebContents: () => wc, evalJs: async (w, code) => w.eval(code), dir, now: () => clock.t, setTimer: () => 0, clearTimer: () => {} });
  const navigate = (url) => { win.dispatchEvent(new win.Event('pagehide')); const carry = win.sessionStorage.getItem('__cgRecQ'); open(url, carry); wc.emit('did-navigate', {}, url); wc.emit('dom-ready'); };
  return { wc, rec, dir, clock, win: () => win, navigate };
}
function mk2() { const r = rig(); r.rec.evalJs = async (w, code) => r.win().eval(code); return r; }

(async () => {
  console.log('live-recording');
  await test('LR-01 the .macro file exists, with 0 steps, before any event', async () => {
    const r = mk2(); const s = await r.rec.start({ agentId: 'a', name: 'My Rec' });
    assert.ok(s.ok && fs.existsSync(s.file) && s.file.endsWith('.macro'));
    const p = nodes.parse(fs.readFileSync(s.file, 'utf8')); assert.strictEqual(p.type, 'macro');
  });
  await test('LR-02 it grows as events arrive', async () => {
    const r = mk2(); const s = await r.rec.start({ agentId: 'a' });
    r.win().document.getElementById('go').click(); await r.rec.flush('a');
    const t = fs.readFileSync(s.file, 'utf8'); assert.ok(/#go/.test(t), 'click on #go is in the file');
    assert.strictEqual(r.rec.status('a').steps >= 1, true);
  });
  await test('LR-03 navigation is recorded and the page script is reinstalled', async () => {
    const r = mk2(); const s = await r.rec.start({ agentId: 'a' });
    r.navigate('https://example.test/b'); r.clock.t += 10;
    r.win().document.getElementById('go').click(); const out = await r.rec.stop('a');
    const acts = out.steps.map(x => x.action + ':' + (x.data.url || x.data.selector || ''));
    assert.ok(acts.includes('navigate:https://example.test/b'), acts.join(','));
    assert.ok(acts.includes('click:#go'), acts.join(','));
  });
  await test('LR-04 events queued just before a navigation are carried over, not lost', async () => {
    const r = mk2(); await r.rec.start({ agentId: 'a' });
    r.win().document.getElementById('go').click();            // not drained yet
    r.navigate('https://example.test/c');
    const out = await r.rec.stop('a');
    assert.ok(out.steps.some(x => x.action === 'click' && x.data.selector === '#go'), JSON.stringify(out.steps));
  });
  await test('LR-05 a password never reaches the file', async () => {
    const r = mk2(); const s = await r.rec.start({ agentId: 'a' });
    const pw = r.win().document.getElementById('pw'); pw.value = 'hunter2-secret'; pw.dispatchEvent(new (r.win().Event)('input', { bubbles: true }));
    await r.rec.stop('a'); const t = fs.readFileSync(s.file, 'utf8');
    assert.ok(!/hunter2-secret/.test(t) && /\{\{password\}\}/.test(t));
  });
  await test('LR-06 scroll and paging keys become steps', async () => {
    const r = mk2(); const s = await r.rec.start({ agentId: 'a' });
    const w = r.win(); const se = w.document.scrollingElement || w.document.documentElement;
    se.scrollTop = 400; se.dispatchEvent(new w.Event('scroll', { bubbles: true })); w.document.dispatchEvent(new w.Event('scroll'));
    w.document.body.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    const out = await r.rec.stop('a');
    assert.ok(out.steps.some(x => x.action === 'driver_exec' && x.data.key === 'ArrowDown'), JSON.stringify(out.steps));
  });
  await test('LR-07 a second start on the same tab is refused and names the open file', async () => {
    const r = mk2(); const a = await r.rec.start({ agentId: 'a' }); const b = await r.rec.start({ agentId: 'a' });
    assert.ok(!b.ok && b.file === a.file);
  });
  await test('LR-08 recordingToSteps: scroll sums per scroller, slow gaps become waits, gaps are capped', () => {
    const o = recordingToSteps([{ type: 'scroll', y: 100, ts: 1 }, { type: 'scroll', y: 300, ts: 2 }, { type: 'keydown', key: 'PageDown', ts: 60000 }], {});
    assert.deepStrictEqual(o.steps[0], { action: 'scroll', data: { deltaY: 300 } });
    assert.deepStrictEqual(o.steps[1], { action: 'wait', data: { ms: 5000 } });
    assert.strictEqual(o.steps[2].data.key, 'PageDown');
  });
  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
