'use strict';
// tests/modules/test-component-store.test.js — 0.39.266 (C1–C4).
// James: "warp is the build logic. supposed to reuse components. i wanted a components store for all components
// build in folders with their dependancies." Answers: everything WARP builds · deps referenced by id + version ·
// a nested repo in Idearium. docs/2026-09-27-components-store-and-atlases-phasemap.spec.
//
//   CS-001  put: components/<id>/<version>/<file> + component.json + index.json; id = <project>.<dotted path>
//   CS-002  the same bytes never make a new version (the reuse key is added); new bytes → 1.0.1
//   CS-003  deps: relative requires pinned { id: version }; a dep stored LATER is pinned when it lands; npm listed,
//           node builtins not
//   CS-004  reuse: byContract and byPrompt return the stored bytes; a hand-edited file is not the component;
//           invalidate() stops a wrong version being reused
//   CS-005  closure: everything a component needs, pinned
//   CS-006  the harness: find kind "stored", card and read "store:<id>@<version>"
//   CS-007  nested repo: nexus-self system "components"; loom never scans it; tests write to the sandbox, not the tree
//   CS-008  the build path asks the store before dispatch and stores after completion (sync + callback)
require('../../lib/test-sandbox.js').ensure();

const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passed = 0, failed = 0;
async function test(id, name, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${name}\n    ${e.stack}`); failed++; }
}

async function main() {
  const CS = require('../../lib/component-store.js');
  const dir = CS.storeDir();
  const ROOT = path.resolve(__dirname, '..', '..');

  const storeJs = "/** keeps rows on disk */\nconst lock = require('./lock');\nconst fs = require('fs');\nconst yaml = require('js-yaml/dist');\nmodule.exports = { flush: () => lock.acquire() };\n";
  const lockJs = "// the flush lock\nmodule.exports = { acquire: () => true };\n";
  let first;

  await test('CS-001', 'put writes a folder, a manifest and the index', () => {
    first = CS.put({ project: 'My App', path: 'src/store.js', content: storeJs, contract: { path: 'src/store.js', layer: 'engine', purpose: 'keeps rows on disk' }, prompt: 'P1', builtBy: { specName: 'My App', agent: 'chatgpt' } });
    assert.strictEqual(first.id, 'my-app.src.store');
    assert.strictEqual(first.version, '1.0.0');
    assert.strictEqual(first.created, true);
    assert.strictEqual(fs.readFileSync(path.join(dir, 'my-app.src.store', '1.0.0', 'store.js'), 'utf8'), storeJs, 'byte for byte');
    const m = JSON.parse(fs.readFileSync(path.join(dir, 'my-app.src.store', '1.0.0', 'component.json'), 'utf8'));
    assert.deepStrictEqual([m.id, m.namespace, m.name, m.version, m.path], ['my-app.src.store', 'my-app', 'src.store', '1.0.0', 'src/store.js']);
    assert.strictEqual(m.purpose, 'keeps rows on disk');
    assert.ok(JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')).components['my-app.src.store']);
  });

  await test('CS-002', 'same bytes → same version; new bytes → 1.0.1', () => {
    const again = CS.put({ project: 'My App', path: 'src/store.js', content: storeJs, prompt: 'P2' });
    assert.deepStrictEqual([again.version, again.created], ['1.0.0', false]);
    assert.strictEqual(CS.byPrompt('P2').version, '1.0.0', 'the new reuse key points at the existing version');
    const next = CS.put({ project: 'My App', path: 'src/store.js', content: storeJs + '// v2\n' });
    assert.deepStrictEqual([next.version, next.created], ['1.0.1', true]);
    assert.strictEqual(CS.loadIndex().components['my-app.src.store'].latest, '1.0.1');
  });

  await test('CS-003', 'deps pinned by id + version, late deps pinned when they land, npm listed', () => {
    const m0 = CS.manifest('my-app.src.store', '1.0.0');
    assert.deepStrictEqual(m0.dependencies, {});
    assert.deepStrictEqual(m0.unresolved, [{ spec: './lock', path: 'src/lock' }], 'kept, never dropped (CI2)');
    assert.deepStrictEqual(m0.npm, ['js-yaml'], 'fs is a builtin; a deep import names its package');
    const lock = CS.put({ project: 'My App', path: 'src/lock.js', content: lockJs });
    assert.ok(lock.pinned >= 1);
    for (const v of ['1.0.0', '1.0.1']) {
      const m = CS.manifest('my-app.src.store', v);
      assert.deepStrictEqual(m.dependencies, { 'my-app.src.lock': '1.0.0' }, v);
      assert.deepStrictEqual(m.unresolved, []);
    }
    const api = CS.put({ project: 'My App', path: 'src/api/index.js', content: "import s from '../store.js';\nexport default s;\n" });
    assert.deepStrictEqual(api.dependencies, { 'my-app.src.store': '1.0.1' }, 'pinned to the latest at store time');
    assert.strictEqual(api.id, 'my-app.src.api', 'a/index.js is the component a');
  });

  await test('CS-004', 'reuse by contract and by prompt; a hand-edited file is refused', () => {
    const c = CS.byContract({ path: 'src/store.js', layer: 'Engine', purpose: '  keeps rows  on disk ' });
    assert.ok(c, 'contract is normalised (case, spaces)');
    assert.strictEqual(c.content, storeJs);
    assert.strictEqual(CS.byContract({ path: 'src/store.js', layer: 'engine', purpose: 'something else' }), null);
    assert.strictEqual(CS.byPrompt('P1').content, storeJs);
    assert.strictEqual(CS.byPrompt('never built'), null);
    const f = path.join(dir, 'my-app.src.lock', '1.0.0', 'lock.js');
    fs.writeFileSync(f, lockJs + '// edited\n');
    assert.strictEqual(CS.get('my-app.src.lock@1.0.0'), null, 'sha256 no longer matches');
    fs.writeFileSync(f, lockJs);
    assert.ok(CS.get('store:my-app.src.lock@1.0.0'));
    const tmp = CS.put({ project: 'My App', path: 'src/bad.js', content: 'bad\n', prompt: 'PB' });
    assert.ok(CS.byPrompt('PB'));
    assert.strictEqual(CS.invalidate(`${tmp.id}@${tmp.version}`), 1);
    assert.strictEqual(CS.byPrompt('PB'), null, 'an invalidated version is never reused');
  });

  await test('CS-005', 'closure: everything a component needs', () => {
    assert.deepStrictEqual(CS.closure('my-app.src.api').map(x => `${x.id}@${x.version}`),
      ['my-app.src.api@1.0.0', 'my-app.src.store@1.0.1', 'my-app.src.lock@1.0.0']);
  });

  await test('CS-006', 'the harness finds, cards and reads stored components', () => {
    const H = require('../../lib/registry-harness.js');
    const idx = { kind: 'repo', files: new Set(), idOf: (p) => p, fileOf: () => null, requires: new Map(), requiredBy: new Map(), routes: new Map(), events: { byFile: {}, byEvent: {} }, read: () => { throw new Error('none'); } };
    const f = H.find(idx, 'flush lock', { kind: 'stored' });
    assert.ok(f.results.some(r => r.id === 'store:my-app.src.lock@1.0.0'), JSON.stringify(f.results));
    assert.ok(H.find(idx, 'rows on disk', { kind: 'stored' }).results[0].id.startsWith('store:my-app.src.store@'));
    const c = H.card(idx, 'store:my-app.src.store@1.0.0');
    assert.deepStrictEqual(c.dependencies, { 'my-app.src.lock': '1.0.0' });
    assert.deepStrictEqual(c.exports, ['flush']);
    assert.deepStrictEqual(c.versions, ['1.0.0', '1.0.1']);
    const r = H.read(idx, 'store:my-app.src.lock@1.0.0');
    assert.match(r.text, /^1\t\/\/ the flush lock/);
    assert.match(H.read(idx, 'store:nope@1.0.0').error, /kind "stored"/);
  });

  await test('CS-007', 'a nested repo; loom never scans it; the sandbox holds test writes', () => {
    const S = require('../../lib/nexus-self/systems.js');
    assert.deepStrictEqual(S.get('components').dirs, ['components']);
    assert.strictEqual(S.ownerOf('components/x.y/1.0.0/component.json'), 'components');
    assert.ok(require('../../loom/scanners/source-map.js').SKIP_PATHS.has('components'));
    assert.ok(!dir.startsWith(path.join(ROOT, 'components')), `test store is ${dir}`);
    assert.ok(fs.existsSync(path.join(ROOT, 'components', 'index.json')), 'the shipped store exists (empty)');
  });

  await test('CS-008', 'the build path asks the store first and stores what it builds', () => {
    const api = fs.readFileSync(path.join(ROOT, 'idearium', 'api', 'index.js'), 'utf8');
    const build = api.slice(api.indexOf("case 'speceng.build':"), api.indexOf("case 'speceng.chunk.fail':"));
    const at = (s) => build.indexOf(s);
    assert.ok(at('_storedFor(chunk)') > 0 && at('_storedFor(chunk)') < at('se.findPriorSection('), 'contract reuse before prior-section reuse');
    assert.ok(at('_storedFor(chunk, { prompt: chunkPrompt })') > at('buildChunkPrompt(') && at('_storedFor(chunk, { prompt: chunkPrompt })') < at('dispatchChunkWithVerification('), 'prompt reuse before dispatch');
    assert.ok(at('_storeBuilt(manifest, chunk, se.loadSpec') > at('dispatchChunkWithVerification('), 'stored after a synchronous build');
    const cb = build.slice(at("case 'speceng.chunk.complete':"));
    assert.ok(/_storeBuilt\(/.test(cb), 'stored after a queued (callback) build');
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
