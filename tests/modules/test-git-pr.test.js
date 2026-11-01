'use strict';
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-git-pr.test.js — UP12: open a PR from any tree, for any agent. 0.60.357.
 * James, 2026-11-01: "Open the PR" · "okay but for all agents, as a agent tool".
 *   GP-01 gh present: push, then gh pr create; its URL answered
 *   GP-02 gh absent: the compare URL, title and body prefilled, the fallback said
 *   GP-03 refused on the base branch and on a dirty tree (nothing pushed)
 *   GP-04 the row is in the one command table, run locally, so every agent has it through nexus.command
 */
const assert = require('assert'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const { open } = require(path.join(ROOT, 'lib/git-pr.js'));
let passed = 0, failed = 0;
async function test(id, d, fn) { try { await fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${e.message}`); failed++; } }
const fake = ({ branch = 'feat', dirty = '', gh = true } = {}) => { const calls = []; return { calls, run: (cmd, a) => { calls.push([cmd, ...a].join(' '));
  if (cmd === 'gh') { if (!gh) throw Object.assign(new Error('spawn gh ENOENT'), { code: 'ENOENT' }); return 'https://github.com/o/r/pull/7'; }
  const k = a.join(' '); if (k.startsWith('rev-parse')) return branch; if (k.startsWith('status')) return dirty; if (k.startsWith('remote')) return 'https://github.com/o/r.git';
  if (k.startsWith('log')) return 'last commit'; return ''; } }; };

(async () => {
  console.log('\n⬡  open a pull request for any agent (UP12)\n');
  await test('GP-01', 'gh present: push, then gh pr create', () => {
    const f = fake(); const r = open({ dir: '.', run: f.run, title: 'T', body: 'B' });
    assert.deepStrictEqual([r.ok, r.via, r.url, r.pushed], [true, 'gh', 'https://github.com/o/r/pull/7', true]);
    assert.ok(f.calls.indexOf('git push -u origin feat') < f.calls.findIndex(c => c.startsWith('gh pr create')));
  });
  await test('GP-02', 'gh absent: the compare URL, prefilled, the fallback said', () => {
    const r = open({ dir: '.', run: fake({ gh: false }).run, body: 'B b' });
    assert.strictEqual(r.via, 'compare'); assert.ok(r.url.startsWith('https://github.com/o/r/compare/main...feat?expand=1&title=last%20commit&body=B%20b'), r.url);
    assert.ok(/gh is not installed/.test(r.said));
  });
  await test('GP-03', 'refused on the base branch and on a dirty tree; nothing pushed', () => {
    const a = fake({ branch: 'main' }); assert.ok(!open({ run: a.run }).ok && !a.calls.some(c => /push/.test(c)));
    const b = fake({ dirty: ' M x.js' }); const r = open({ run: b.run }); assert.ok(!r.ok && /uncommitted/.test(r.error) && !b.calls.some(c => /push|stash/.test(c)));
  });
  await test('GP-04', 'the row is in the one command table, run locally', async () => {
    const { SPEC } = await import('file:///' + path.join(ROOT, 'idearium/cli/route-commands.js').replace(/\\/g, '/'));
    const row = SPEC.find(r => r.key === 'pr.open'); assert.ok(row && typeof row.local === 'function' && !row.personOnly);
  });
  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
