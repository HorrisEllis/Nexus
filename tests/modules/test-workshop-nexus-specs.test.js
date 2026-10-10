'use strict';
/**
 * tests/modules/test-workshop-nexus-specs.test.js — 0.59.2. James: "need the specs to be relevant to the system they are
 * for … also the spec workshop uses them, and idearium has the option to choose spec from library to create a repo with."
 * The workshop's sources list Nexus's own specs by system (lib/spec-census.js); one opens as a NEW workshop with its
 * sections; saving it makes a new repo (the original spec untouched); a path that is not a Nexus spec is refused.
 */
require(require('path').join(__dirname, '../../lib/test-sandbox.js')).ensure();
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '..', '..');
let passed = 0, failed = 0;
async function test(id, d, fn) { try { await fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${e.stack}`); failed++; } }
const quiet = async (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; } };

(async () => {
  const api = await quiet(() => import(pathToFileURL(path.join(ROOT, 'idearium/api/index.js')).href));
  const R = (m, p, b) => quiet(() => api._route(m, p, b));
  const before = fs.readFileSync(path.join(ROOT, 'idearium/spec/idea-to-spec.spec'), 'utf8');
  let src;
  await test('WN-01', 'the workshop\'s sources list Nexus\'s own specs, each with its system and how built', async () => {
    src = (await R('GET', '/api/workshop/sources')).json;
    const n = src.nexus || [];
    assert.ok(n.length > 50, `only ${n.length}`);
    const it = n.find(x => x.path === 'idearium/spec/idea-to-spec.spec');
    assert.deepStrictEqual([it.system, it.title], ['idearium', 'Idea to spec']);
    assert.ok(n.find(x => x.path === 'docs/language-routing.spec' && x.system === 'core'));
    assert.ok(!n.some(x => /phase-?map/.test(x.path)), 'phasemaps are not specs to start from');
  });
  await test('WN-02', 'a Nexus spec opens as a new workshop with its sections — choices and all', async () => {
    const r = await R('POST', '/api/workshop', { from: { kind: 'nexus', id: 'idearium/spec/idea-to-spec.spec' } });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    const w = r.json.workshop;
    assert.strictEqual(w.title, 'Idea to spec');
    assert.strictEqual(w.source.kind, 'nexus');
    assert.ok(w.sections.some(s => s.id === 'primitives' && /choices — the kinds of primitive/.test(s.body)));
    assert.strictEqual(w.repoUuid, null, 'not tied to the Nexus repo — saving makes a new one');
    const saved = await R('POST', `/api/workshop/${w.uuid}/save`, {});
    assert.strictEqual(saved.status, 200, JSON.stringify(saved.json));
    assert.ok(saved.json.repoUuid);
    assert.strictEqual(fs.readFileSync(path.join(ROOT, 'idearium/spec/idea-to-spec.spec'), 'utf8'), before, 'the original spec is untouched');
  });
  await test('WN-03', 'a path that is not a Nexus spec is refused', async () => {
    assert.strictEqual((await R('POST', '/api/workshop', { from: { kind: 'nexus', id: '../../etc/passwd' } })).status, 404);
    assert.strictEqual((await R('POST', '/api/workshop', { from: { kind: 'nexus', id: 'docs/2026-10-10-idearium-solid-phasemap.spec' } })).status, 404);
  });
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
