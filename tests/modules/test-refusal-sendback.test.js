'use strict';
/**
 * tests/modules/test-refusal-sendback.test.js — a refused proposal goes back to its agent with the failing test; one message, not five (0.60.202)
 * Map: docs/2026-10-10-idearium-solid-phasemap.spec (SD19_a_refusal_goes_back_to_its_agent).
 * James, 2026-10-21, after SP5's title.js was refused three times for changing an error message a test checks: "need a retry or
 * automatically ask for the fix if possible, or a tool or something" · "still didn't work." · "that error needs to be fixed."
 *
 *   RS-01  through the real API: an agent's proposal that breaks a test passing on the current file is refused, rejected with the
 *          failing test (expected and actual) as its reason, and the answer says it was sent back; a second click sends nothing
 *   RS-02b a person's own change is never sent back (the regression gate guards agents' proposals only, unchanged)
 *   RS-02  repos.retry_on_refusal:false (or sendBack:false) leaves it proposed, as before
 *   RS-03  in Clear Glass: five identical errors are one toast counted ×5; a long one shows its first line, the whole on hover
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '..', '..');

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 5).join('\n    ') : e.message}`); failed++; }
}
const quiet = async (fn) => { const l = console.log, w = console.warn, e = console.error; console.log = () => {}; console.warn = () => {}; console.error = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; console.error = e; } };

const TITLE = "'use strict';\nfunction title(input) {\n  if (typeof input !== 'string') {\n    throw new Error('Input must be a string');\n  }\n  return input.trim();\n}\nmodule.exports = { title };\n";
const TEST = "'use strict';\nconst assert = require('assert');\nconst { title } = require('../lib/title.js');\nassert.throws(() => title({}), /Input must be a string/);\nassert.strictEqual(title(' a '), 'a');\nconsole.log('ok');\n";
const BROKEN = TITLE.replace("'Input must be a string'", "'title: expected string input, received object'");

(async () => {
  console.log('\n⬡  a refusal goes back to its agent\n');
  const api = await quiet(() => import(pathToFileURL(path.join(ROOT, 'idearium/api/index.js')).href));
  const R = (m, p, b) => quiet(() => api._route(m, p, b));
  const RI = require(path.join(ROOT, 'lib/repo-inject.js'));
  const repoUuid = await quiet(async () => {
    const w = (await R('POST', '/api/workshop', { from: { kind: 'blank' }, title: `Looking Glass RS ${Date.now().toString(36)}` })).json.workshop;
    await R('POST', `/api/workshop/${w.uuid}`, { sections: [{ id: 'purpose', body: 'Titles.' }] });
    return (await R('POST', `/api/workshop/${w.uuid}/save`, {})).json.repoUuid;
  });
  for (const [p, c] of [['lib/title.js', TITLE], ['tests/sp5-title.test.js', TEST]]) await R('POST', `/api/repos/${repoUuid}/file`, { path: p, content: c });
  // the evidence (the linked tests run on the current file and on the proposal) is gathered in the background after a proposal;
  // in his session it was there when he clicked Apply — here it is waited for
  const propose = async (kind) => { const inj = RI.propose({ layer: api.getRepoLayer(), repo: api.getRepoLayer().get(repoUuid), path: 'lib/title.js', content: BROKEN, source: { kind, goal: 'SP5 title' }, hat: kind === 'agent' ? { name: 'gemini' } : null }).inject; await quiet(() => RI.attachEvidence(inj.uuid, { run: true, layer: api.getRepoLayer() })); return RI.get(inj.uuid); };

  await test('RS-01', 'an agent\'s breaking proposal: refused, rejected with the failing test as its reason, said as sent back; a person\'s stays', async () => {
    const inj = await propose('agent');
    const a = await R('POST', `/api/repos/${repoUuid}/injects/${inj.uuid}/apply`, {});
    assert.ok(a.status >= 400 && a.json.detail && a.json.detail.sentBack === true && a.json.detail.regressed === true, JSON.stringify(a.json).slice(0, 400));
    assert.ok(/Sent back to gemini with the failing test/.test(a.json.error) && !/apply with force if you accept the break/.test(a.json.error), a.json.error);
    const after = RI.get(inj.uuid);
    assert.strictEqual(after.status, 'rejected');
    const reason = JSON.stringify(after.history || after.reason || after);
    assert.ok(/Input must be a string/.test(reason) && /tests\/sp5-title\.test\.js/.test(reason), reason.slice(0, 600));
    const again = await R('POST', `/api/repos/${repoUuid}/injects/${inj.uuid}/apply`, {});
    assert.ok(!(again.json.detail && again.json.detail.sentBack), 'a second click does not send it again');
  });

  await test('RS-02', 'sendBack:false leaves it proposed, as before', async () => {
    const inj = await propose('agent');
    const a = await R('POST', `/api/repos/${repoUuid}/injects/${inj.uuid}/apply`, { sendBack: false });
    assert.ok(a.status >= 400 && !(a.json.detail && a.json.detail.sentBack) && RI.get(inj.uuid).status === 'proposed');
    RI.reject(inj.uuid, { reason: 'test cleanup' });
  });

  await test('RS-02b', 'a person\'s own change is never sent anywhere: the regression gate guards agents\' proposals only (as before)', async () => {
    const mine = await propose('person');
    const b = await R('POST', `/api/repos/${repoUuid}/injects/${mine.uuid}/apply`, {});
    assert.ok(!(b.json.detail && b.json.detail.sentBack) && RI.get(mine.uuid).status !== 'rejected', JSON.stringify(b.json).slice(0, 300));
  });

  await test('RS-03', 'in Clear Glass: five identical errors are one toast ×5; a long one shows its first line, the whole on hover', async () => {
    const glass = require(path.join(ROOT, 'clear-glass/src/driver/glass.js'));
    if (!glass.engine()) { console.log('    - SKIPPED: Clear Glass has no engine here'); return; }
    const app = fs.readFileSync(path.join(ROOT, 'idearium/ui/js/app.js'), 'utf8');
    const fn = app.match(/function toast\(msg, type='ok'\) \{[\s\S]*?\n\}\n/)[0];
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-ui-'));
    fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html><body><div id="toast-area"></div><script>${fn}</script></body></html>`);
    const browser = await glass.chromium.launch();
    try {
      const page = await browser.newPage();
      await page.goto(pathToFileURL(path.join(dir, 'index.html')).href);
      const long = `apply failed: lib/title.js: 1 linked test that pass on the current file fail on this proposal — nothing applied.\nlib/title.js: 7 → 7 lines; ${'x'.repeat(400)}`;
      const r = await page.evaluate((m) => { for (let i = 0; i < 5; i++) toast(m, 'err'); const a = document.getElementById('toast-area'); return { n: a.children.length, text: a.children[0].textContent, title: a.children[0].title }; }, long);
      assert.strictEqual(r.n, 1, 'one box');
      assert.ok(/×5$/.test(r.text) && r.text.length < 340 && !/x{300}/.test(r.text), r.text);
      assert.strictEqual(r.title, long, 'the whole message on hover');
      const two = await page.evaluate(() => { toast('another', 'err'); return document.getElementById('toast-area').children.length; });
      assert.strictEqual(two, 2, 'a different message is its own toast');
    } finally { await browser.close(); }
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
