'use strict';
/**
 * tests/modules/test-release-backfill-off-process.test.js — the full release backfill never blocks Versionium (0.60.285)
 * James's run log, 2026-10-29: after 0.60.278 made "every release's commits" the default inside Versionium's server, Versionium missed 74
 * pulses (1113 s) right after boot and Idearium's releases sync timed out at 120 s.
 *
 *   RB-01  syncInWorker reads every release with its commits in a child process: the parent's event loop keeps ticking meanwhile; the
 *          releases are posted in batches; a second call while one runs shares it
 *   RB-02  the route: a boot's sync ({}) records the recent commits and answers at once, starting the backfill in the background;
 *          { all: true } awaits the child's backfill
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

let passed = 0, failed = 0;
async function test(id, desc, fn) { try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${(e.stack || e.message).split('\n').slice(0, 6).join('\n    ')}`); failed++; } }

(async () => {
  console.log('\n⬡  The release backfill runs off Versionium\'s process\n');
  const NR = require(path.join(ROOT, 'versionium/lib/nexus-releases.js'));

  await test('RB-01', 'syncInWorker: a child process; the event loop keeps ticking; batches; one at a time', async () => {
    const posted = [];
    const v = async (m, p, body) => { posted.push(body.releases.length); return { recorded: body.releases.length, already: 0, refused: [] }; };
    let ticks = 0; const tick = setInterval(() => { ticks++; }, 20);
    const a = NR.syncInWorker(v, { root: ROOT, batch: 50 });
    const b = NR.syncInWorker(v, { root: ROOT, batch: 50 });
    assert.strictEqual(a, b, 'a second call shares the running one');
    const r = await a;
    clearInterval(tick);
    assert.ok(r.ok && r.in === 'a child process' && r.releases > 100, JSON.stringify(r).slice(0, 300));
    assert.strictEqual(posted.reduce((x, y) => x + y, 0), r.releases);
    assert.ok(posted.every(n => n <= 50), 'batched');
    assert.ok(ticks >= 5, `the parent kept answering while git read history (${ticks} ticks)`);
  });

  await test('RB-02', 'the route: a boot answers at once and starts the backfill; { all: true } awaits it', async () => {
    const src = fs.readFileSync(path.join(ROOT, 'versionium/routes/nexus-releases.js'), 'utf8');
    assert.match(src, /if \(b\.all\) \{ json\(res, 200, await NR\.syncInWorker\(_self\)\); return true; \}/);
    assert.match(src, /const r = await NR\.sync\(_self, \{ commits: b\.commits === false \? null : 'recent' \}\);/);
    assert.match(src, /NR\.syncInWorker\(_self\)\.catch\(\(\) => \{\}\);/);
    assert.ok(!/commits: b\.recent \? 'recent' : \(b\.commits === false \? null : 'all'\)/.test(src), 'the in-process all-history default is gone');
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`); process.exitCode = failed ? 1 : 0;
})();
