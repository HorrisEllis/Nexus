'use strict';
/**
 * tests/modules/test-build-surface-2.test.js — 0.39.280, docs/2026-09-29-build-surface-phasemap.spec BS13 + BS15.
 *   BS13-*  a chosen provider is the only one tried; a code spec with no repo builds as its original (not "nobody")
 *   BS15-*  deleting a code repo tells its original: the document spec forgets it (kept in codeRetired), the hat link goes
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
let passed = 0, failed = 0;
async function t(id, name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${id} ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${id} ${name}\n    ${e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n    ') : e}`); }
}
(async () => {
  console.log('\n  test-build-surface-2.test.js');
  process.env.NEXUS_VERSIONIUM_URL = 'http://127.0.0.1:9';
  const { providersFor } = require(path.join(ROOT, 'lib/seam/adapters/warp-cascade.js'));
  const api = await import(path.join(ROOT, 'idearium', 'api', 'index.js'));
  const L = api.getRepoLayer();
  const make = async (name, extra = {}) => {
    for (let i = 0; i < 20; i++) {
      const r = L.ingest({ name, source: 'test', files: [{ path: 'a.js', content: `// ${name}\n` }], ...extra });
      if (!(r && r.error && /no spec-engine/.test(r.error))) return r;
      await new Promise(x => setTimeout(x, 250));
    }
  };
  const orig = (await make(`bs2-orig-${Date.now()}`)).repo;
  const code = (await make(`bs2-code-${Date.now()}`, { source: 'spec.codegen', promotedFromSpec: orig.specUuid })).repo;

  await t('BS13-01', 'the cascade tries only the chosen provider; nothing chosen → the chain as before', () => {
    assert.deepStrictEqual(providersFor({ preferredProvider: 'chatgpt', seam_id: 'x' }, null), ['chatgpt']);
    assert.deepStrictEqual(providersFor({ seam_id: 'x' }, null), ['ollama', 'chatgpt', 'claude']);
  });

  await t('BS13-02', 'a code spec whose repo is missing builds as its ORIGINAL (codeFor); no repo and no original → left to the chunk', () => {
    const RA = require(path.join(ROOT, 'lib/repo-agent.js'));
    RA.setProvider(orig.uuid, RA.providers().includes('gemini') ? 'gemini' : RA.providers()[0]);
    const want = RA.getProvider(orig.uuid);
    const se = L.se;
    const codeSpec = se.createFileTreeSpec({ name: 'lonely · code', description: 'x', plan: { files: [{ path: 'a.js', purpose: 'x', layer: 'core' }], layers: ['core'] } });
    codeSpec.codeFor = orig.specUuid; se.saveSpec(codeSpec);
    const who = api._buildIdentity(codeSpec.uuid);
    assert.strictEqual(who.repoUuid, orig.uuid, 'the original repo');
    assert.strictEqual(who.provider, require(path.join(ROOT, 'lib/agent-providers.js')).normalize(want));
    assert.strictEqual(api._buildIdentity(null).provider, null, 'no repo, no original: left to the chunk (H-010)');
  });

  await t('BS15-01', 'deleting a code repo: the document spec forgets it (kept in codeRetired), the response names the original', async () => {
    const se = L.se;
    const doc = se.loadSpec(orig.specUuid); doc.codeSpecUuid = code.specUuid; se.saveSpec(doc);
    const r = await api._route('DELETE', `/api/repos/${code.uuid}`);
    assert.strictEqual(r.status, 200, JSON.stringify(r.json).slice(0, 300));
    assert.deepStrictEqual([r.json.original.of.uuid, r.json.original.spec.codeSpecCleared], [orig.uuid, true]);
    const after = se.loadSpec(orig.specUuid);
    assert.strictEqual(after.codeSpecUuid, undefined, 'Code can plan a new one');
    assert.deepStrictEqual([after.codeRetired[0].specUuid, after.codeRetired[0].repoUuid], [code.specUuid, code.uuid], 'nothing lost');
    const plain = (await make(`bs2-plain-${Date.now()}`)).repo;
    const p = await api._route('DELETE', `/api/repos/${plain.uuid}`);
    assert.ok(p.status === 200 && !p.json.original, 'a repo that is not code has nothing to tell');
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.log('  ! crashed:', e && e.stack || e); process.exit(1); });
