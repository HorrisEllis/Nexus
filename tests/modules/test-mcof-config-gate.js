'use strict';
/**
 * tests/modules/test-mcof-config-gate.js — MCO-F's gate, proven.
 * docs/idearium-repository-overhaul-phasemap.spec MCO-F_config:
 *   "MET when chunk_cap changes the real cap live, and a copilot write
 *    differs from a human write only in the event's actor field."
 *
 * The config was built (idearium/lib/config.js + config-core.cjs) and its
 * status still read NOT STARTED because nothing had proven the gate. This does,
 * against the REAL config module and the REAL spec-engine (its ingest reads the
 * cap on every call), with isolated data, jaa and config-file paths.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '../..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'mcof-'));
process.env.IDEARIUM_DATA_DIR = path.join(TMP, 'data');
process.env.JAA_DATA_DIR = path.join(TMP, 'jaa');
process.env.IDEARIUM_CONFIG_FILE = path.join(TMP, 'idearium.config.json');
fs.mkdirSync(process.env.IDEARIUM_DATA_DIR, { recursive: true });

let pass = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.stack ? e.stack.split('\n').slice(0, 3).join('\n      ') : e.message}`); }
}

(async () => {
  const cfg = await import(path.join(ROOT, 'idearium/lib/config.js'));
  const se = await import(path.join(ROOT, 'idearium/spec-engine/index.js'));
  const files = (n) => Array.from({ length: n }, (_, i) => ({ path: `src/f${i}.js`, content: `module.exports = ${i};\n` }));

  console.log('\n── GATE part 1: chunk_cap changes the real cap, live ────');
  await t('the shipped default is 20000 (the phasemap\'s "real 500-cap" was raised on purpose)', () => {
    assert.strictEqual(cfg.getValue('chunk_cap'), 20000);
  });
  await t('setting chunk_cap to 2 makes the REAL ingest refuse 3 files, naming the cap — no restart', () => {
    cfg.setConfig('chunk_cap', 2, { actor: 'user' });
    assert.throws(() => se.ingestFilesAsSpec({ name: 'over-cap', files: files(3) }), /chunk_cap \(2\)/);
  });
  await t('raising it to 50 lets the SAME ingest through, live, and it really creates the spec on disk', () => {
    cfg.setConfig('chunk_cap', 50, { actor: 'user' });
    const m = se.ingestFilesAsSpec({ name: 'under-cap', files: files(3) });
    const manifest = m.manifest || m;
    assert.ok(manifest && (manifest.uuid || manifest.spec?.uuid), 'no spec returned');
    const id = manifest.uuid || manifest.spec.uuid;
    assert.ok(fs.existsSync(path.join(process.env.IDEARIUM_DATA_DIR, 'specs', id)), 'no spec directory on disk');
  });
  await t('the old top-level key and the grouped key are the same setting', () => {
    cfg.setConfig('chunking.chunk_cap', 77);
    assert.strictEqual(cfg.getValue('chunk_cap'), 77);
    assert.strictEqual(cfg.getValue('chunking.chunk_cap'), 77);
  });

  console.log('\n── GATE part 2: copilot and human writes differ only in actor ──');
  await t('the same write by "user" and by "copilot" yields events identical except for actor (and timestamp)', () => {
    const strip = (e) => { const { actor, at, ...rest } = e; return rest; };
    const a = cfg.setConfig('pipeline.snapshot_mode', 'full', { actor: 'user' });
    const b = cfg.setConfig('pipeline.snapshot_mode', 'full', { actor: 'copilot' });
    assert.deepStrictEqual(strip(a), strip(b));
    assert.strictEqual(a.actor, 'user'); assert.strictEqual(b.actor, 'copilot');
    assert.deepStrictEqual(Object.keys(a).sort(), Object.keys(b).sort());
    assert.strictEqual(cfg.getValue('pipeline.snapshot_mode'), 'full');
  });
  await t('the resulting state is the same whichever actor wrote (only updatedBy records who)', () => {
    cfg.setConfig('pipeline.zoom_levels', 6, { actor: 'copilot' });
    const viaCopilot = cfg.getValue('pipeline.zoom_levels');
    cfg.setConfig('pipeline.zoom_levels', 6, { actor: 'user' });
    assert.strictEqual(cfg.getValue('pipeline.zoom_levels'), viaCopilot);
    assert.strictEqual(cfg.describe().updatedBy, 'user');
  });
  await t('copilot may NOT write keys that are not copilot_writable (ssh key path, port, node dir); a human may', () => {
    for (const [k, v] of [['cicd.ssh_key_path', '/some/key'], ['api.port', 4801], ['chunking.chunk_nodes_dir', 'x/y']]) {
      assert.throws(() => cfg.setConfig(k, v, { actor: 'copilot' }), /not copilot_writable/, k);
      assert.notStrictEqual(cfg.getValue(k), v, `${k} was written despite the refusal`);
    }
    cfg.setConfig('cicd.ssh_key_path', '/some/key', { actor: 'user' });
    assert.strictEqual(cfg.getValue('cicd.ssh_key_path'), '/some/key');
  });
  await t('describe() marks exactly which keys a copilot may write (ssh_key_path is false)', () => {
    const d = Object.fromEntries(cfg.describe().keys.map(k => [k.key, k]));
    assert.strictEqual(d['cicd.ssh_key_path'].copilot_writable, false);
    assert.strictEqual(d['chunking.chunk_cap'].copilot_writable, true);
    assert.strictEqual(d['snapshots.import_baseline'].copilot_writable, true);
  });

  console.log('\n── it is loud, not lenient ──────────────────────────────');
  await t('out-of-range and wrongly-typed values THROW; nothing is clamped or stored', () => {
    const before = cfg.getValue('chunk_cap');
    for (const bad of [0, -5, 999999999, 'lots', null]) assert.throws(() => cfg.setConfig('chunk_cap', bad, { actor: 'user' }), undefined, String(bad));
    assert.strictEqual(cfg.getValue('chunk_cap'), before);
    assert.throws(() => cfg.setConfig('pipeline.snapshot_mode', 'partial', { actor: 'user' }));
    assert.throws(() => cfg.setConfig('no.such.key', 1, { actor: 'user' }), /unknown config key/);
    assert.throws(() => cfg.setConfig('pipeline', 1, { actor: 'user' }), /config group/);
  });

  console.log('\n── layers: default < file < runtime ─────────────────────');
  await t('a value in idearium.config.json shows through with source "file", and an edit needs no restart', () => {
    cfg.resetConfig('chunk_cap', { actor: 'user' });
    fs.writeFileSync(process.env.IDEARIUM_CONFIG_FILE, JSON.stringify({ chunking: { chunk_cap: 7 } }));
    assert.strictEqual(cfg.getValue('chunk_cap'), 7);
    assert.strictEqual(cfg.describe().keys.find(k => k.key === 'chunking.chunk_cap').source, 'file');
    fs.writeFileSync(process.env.IDEARIUM_CONFIG_FILE, JSON.stringify({ chunking: { chunk_cap: 8 } }));
    assert.strictEqual(cfg.getValue('chunk_cap'), 8);
  });
  await t('a runtime write shadows the file; resetting it lets the file show through again', () => {
    cfg.setConfig('chunk_cap', 9, { actor: 'user' });
    assert.strictEqual(cfg.getValue('chunk_cap'), 9);
    assert.strictEqual(cfg.describe().keys.find(k => k.key === 'chunking.chunk_cap').source, 'runtime');
    cfg.resetConfig('chunk_cap', { actor: 'user' });
    assert.strictEqual(cfg.getValue('chunk_cap'), 8);
  });
  await t('an unreadable config file is IGNORED and reported (configFileError), not a crash', () => {
    fs.writeFileSync(process.env.IDEARIUM_CONFIG_FILE, '{ not json');
    assert.strictEqual(cfg.getValue('chunk_cap'), 20000);
    assert.ok(cfg.describe().configFileError, 'the parse error should be surfaced');
    fs.rmSync(process.env.IDEARIUM_CONFIG_FILE);
  });
  await t('a copilot cannot reset a key it cannot write', () => {
    cfg.setConfig('cicd.ssh_key_path', '/k', { actor: 'user' });
    assert.throws(() => cfg.resetConfig('cicd.ssh_key_path', { actor: 'copilot' }), /not copilot_writable/);
    assert.strictEqual(cfg.getValue('cicd.ssh_key_path'), '/k');
  });

  console.log('\n── the phasemap\'s named capabilities exist as routes ────');
  const api = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
  await t('config.get and config.set are routed (GET/POST /api/config)', () => {
    assert.ok(/\['GET',\s*\['api','config'\],\s*'config\.get'\]/.test(api));
    assert.ok(/\['POST',\s*\['api','config'\],\s*'config\.set'\]/.test(api));
  });

  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(`\n${fail ? '✗' : '✓'} mcof-config-gate: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
