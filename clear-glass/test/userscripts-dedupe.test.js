'use strict';
// 0.60.7 — James: "the interaction field and nexus nerve doesn't do much. besides inject 1300 scripts." A plugin's
// userscript re-registered on every boot must stay ONE script, keep its name and @match across restarts, and the
// copies an older build left on disk are archived (kept, not deleted) and never injected.
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-us-'));
process.env.CG_USERSCRIPTS_DIR = dir;
const M = require('../src/userscripts/manager.js');
(async () => {
  // what an older build left behind: three bare copies of the same script, no name, no @match
  for (const id of ['a1', 'b2', 'c3']) fs.writeFileSync(path.join(dir, `${id}.js`), 'console.log("detector")');
  const boot = async () => { const m = new M({}); await m.init(); return m; };
  let m = await boot();
  assert.strictEqual([...m._scripts.values()].length, 1, 'the three copies load as one');
  assert.strictEqual(m.duplicatesArchived, 2);
  assert.strictEqual(fs.readdirSync(path.join(dir, '_duplicates')).length, 2, 'the copies are kept, archived');
  // a plugin registers its script on every boot: still one script, its name and matches kept across restarts
  for (let boots = 0; boots < 5; boots++) {
    m = await boot();
    m.create({ name: 'Password Form Detector', source: 'detect()', matches: ['https://*/*'], persistent: true });
  }
  m = await boot();
  const det = [...m._scripts.values()].filter(s => s.name === 'Password Form Detector');
  assert.strictEqual(det.length, 1, 'five boots, one script');
  assert.deepStrictEqual(det[0].matches, ['https://*/*'], 'its @match survives a restart');
  assert.strictEqual(m._matchesUrl(det[0].matches, 'http://127.0.0.1:9000/'), false, 'and it is not injected where it does not match');
  // a script that is not persistent is never written
  m.create({ name: 'one-off', source: 'x()', persistent: false });
  m = await boot();
  assert.ok(![...m._scripts.values()].some(s => s.name === 'one-off'), 'a non-persistent script does not come back');
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('userscripts-dedupe: ok');
})().catch(e => { console.error(e); process.exit(1); });
