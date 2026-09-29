'use strict';
/**
 * tests/modules/test-settings-console.test.js — 0.39.279. The settings console's server half, through idearium's REAL
 * router and handler (api._route): GET /api/settings/console lists the layered config with sources + every repo;
 * GET /api/settings/console/:uuid has the agent, prompt blocks, hat and compartment of one repo; a config write and
 * reset (repos.code_repo_mode) round-trip; the desktop routes refuse a repo with no compartment. The page itself is
 * proven in a real page by tests/probe/settings-console-chromium.js (SC-10 runs it).
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
let passed = 0, failed = 0;
async function t(id, name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${id} ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${id} ${name}\n    ${e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n    ') : e}`); }
}

(async () => {
  console.log('\n  test-settings-console.test.js');
  const api = await import(path.join(ROOT, 'idearium', 'api', 'index.js'));
  const layer = api.getRepoLayer();
  const tag = Date.now();
  let made = null;
  for (let i = 0; i < 20; i++) {   // the spec-engine attaches to the layer asynchronously at import
    made = layer.ingest({ name: `console-${tag}`, source: 'test', files: [{ path: 'src/a.js', content: `const a = ${tag};\n` }] });
    if (!(made && made.error && /no spec-engine/.test(made.error))) break;
    await new Promise(x => setTimeout(x, 250));
  }
  const repo = made && made.repo;
  if (!repo) throw new Error(`could not make a test repo: ${JSON.stringify(made)}`);

  await t('SC-01', 'the console: the layered config (with sources and bounds) and every repo', async () => {
    const r = await api._route('GET', '/api/settings/console');
    assert.strictEqual(r.status, 200, JSON.stringify(r.json).slice(0, 300));
    const keys = r.json.config.keys;
    const mode = keys.find(k => k.key === 'repos.code_repo_mode');
    assert.deepStrictEqual([mode.default, mode.enum, mode.type], ['branch', ['branch', 'copy'], 'string']);
    assert.ok(keys.find(k => k.key === 'desktop.ram_mb' && k.min === 512 && k.max === 65536));
    assert.ok(['default', 'file', 'runtime'].includes(mode.source));
    assert.ok(r.json.repos.some(x => x.uuid === repo.uuid && x.name === repo.name));
    assert.ok(Array.isArray(r.json.providers) && r.json.providers.includes('ollama'));
    assert.deepStrictEqual(r.json.toolScopes, ['harness', 'all', 'project']);
  });

  await t('SC-02', 'one repo: agent (provider, scope, inject mode), every prompt block, compartment, desktop — failures named, not blank', async () => {
    const r = await api._route('GET', `/api/settings/console/${repo.uuid}`);
    assert.strictEqual(r.status, 200, JSON.stringify(r.json).slice(0, 300));
    const j = r.json;
    assert.strictEqual(j.repo.uuid, repo.uuid);
    assert.ok(j.agent && j.agent.toolScope === 'harness' && Array.isArray(j.agent.providers) && j.agent.modes.length);
    const ids = j.blocks.list.map(b => b.id);
    assert.ok(['persona', 'context-tools', 'wake', 'memory', 'question'].every(i => ids.includes(i)), ids.join(','));
    assert.strictEqual(j.blocks.list.find(b => b.id === 'memory').enabled, false, 'memory is fetched by tool by default');
    assert.ok(Array.isArray(j.blind));
    assert.strictEqual((await api._route('GET', '/api/settings/console/nope-xyz')).status, 404);
  });

  await t('SC-03', 'a config write shows as "runtime", and reset drops it back', async () => {
    const w = await api._route('POST', '/api/config', { key: 'repos.code_repo_mode', value: 'copy', actor: 'test' });
    assert.strictEqual(w.status, 200, JSON.stringify(w.json));
    let k = (await api._route('GET', '/api/settings/console')).json.config.keys.find(x => x.key === 'repos.code_repo_mode');
    assert.deepStrictEqual([k.value, k.source], ['copy', 'runtime']);
    const bad = await api._route('POST', '/api/config', { key: 'repos.code_repo_mode', value: 'sideways' });
    assert.strictEqual(bad.status, 400, 'the enum is enforced');
    const rs = await api._route('POST', '/api/config/reset', { key: 'repos.code_repo_mode', actor: 'test' });
    assert.strictEqual(rs.status, 200, JSON.stringify(rs.json));
    k = (await api._route('GET', '/api/settings/console')).json.config.keys.find(x => x.key === 'repos.code_repo_mode');
    assert.notStrictEqual(k.source, 'runtime');
  });

  await t('SC-04', 'desktop routes: a repo with no compartment is told why; the pages are served', async () => {
    const d = await api._route('GET', `/api/repos/${repo.uuid}/desktop`);
    assert.strictEqual(d.status, 409);
    assert.match(d.json.error, /no COS compartment/);
    const b = await api._route('GET', `/api/repos/${repo.uuid}/branches`);
    assert.strictEqual(b.status, 200);
    assert.deepStrictEqual(b.json.repos, []);
  });

  await t('SC-10', 'the console page in a real page (Clear Glass\'s engine): tests/probe/settings-console-chromium.js', () => {
    const probe = spawnSync(process.execPath, [path.join(ROOT, 'tests/probe/settings-console-chromium.js')], { encoding: 'utf8', timeout: 180000 });
    if (probe.status === 3 || probe.error) { console.log(`    (skipped, not passed: no page engine — ${probe.error ? probe.error.message : 'electron not installed'})`); return; }
    assert.strictEqual(probe.status, 0, (probe.stdout || '').split('\n').filter(l => /"pass": ?false|summary/.test(l)).join('\n') || probe.stderr);
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.log('  ! crashed:', e && e.stack || e); process.exit(1); });
