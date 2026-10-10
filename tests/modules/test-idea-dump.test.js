'use strict';
/**
 * tests/modules/test-idea-dump.test.js — 0.59.3. James: "maybe even like a raw idea dump. like where i can type it all or
 * send it from a cli or copilot". `idearium dump` → the Void, verbatim; many at once.
 */
require(require('path').join(__dirname, '../../lib/test-sandbox.js')).ensure();
const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '..', '..');
const quiet = async (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; } };
let passed = 0, failed = 0;
async function test(id, d, fn) { try { await fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${e.stack}`); failed++; } }
(async () => {
  const api = await quiet(() => import(pathToFileURL(path.join(ROOT, 'idearium/api/index.js')).href));
  const { SPEC } = await import(pathToFileURL(path.join(ROOT, 'idearium/cli/route-commands.js')).href);
  const row = SPEC.find(r => r.key === 'dump');
  const R = (m, p, b) => quiet(() => api._route(m, p, b));
  await test('ID-01', 'one idea from the command lands in the Void verbatim', async () => {
    const rq = row.req({ args: ['a', 'gig', 'that', 'builds', 'booking', 'sites'], flags: {} });
    const r = await R(rq.method, rq.path, rq.body);
    assert.strictEqual(r.status, 200, JSON.stringify(r.json)); assert.strictEqual(r.json.idea.text, 'a gig that builds booking sites');
  });
  await test('ID-02', 'many at once (--lines): each its own idea, in his words; empty lines dropped', async () => {
    const rq = row.req({ args: ['first idea\nsecond idea\n\nthird idea'], flags: { lines: true } });
    assert.strictEqual(rq.path, '/api/void/ideas');
    const r = await R(rq.method, rq.path, rq.body);
    assert.deepStrictEqual(r.json.ideas.map(i => i.text), ['first idea', 'second idea', 'third idea']);
    const field = (await R('GET', '/api/void')).json;
    const all = JSON.stringify(field);
    assert.ok(all.includes('second idea'), 'it is in the Void');
  });
  await test('ID-03', 'nothing to drop is refused', async () => {
    assert.ok(/<text>/.test(row.need({ args: [], flags: {} })));
    assert.strictEqual((await R('POST', '/api/void/ideas', { texts: [] })).status, 400);
  });
  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
