// tests/modules/test-manifest-phase1.test.mjs — spec-engine/manifest (phase 1)
// James: "generate a manifest and component registry from the file list.
// that's why it's vital to generate components and file list first."
// Phase 1 is deterministic: file list → wire-check → manifest + registry.
// No LLM, no stubs — every test runs the real modules on real text.
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { execFileSync, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { parseCatalog } from '../../idearium/spec-engine/manifest/parse-catalog.js';
import { fromSource } from '../../idearium/spec-engine/manifest/file-list.js';
import { wireCheck } from '../../idearium/spec-engine/manifest/wire-check.js';
import { generate, chunkContext } from '../../idearium/spec-engine/manifest/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const GENESIS = path.join(ROOT, 'idearium/spec-engine/templates/genesis.spec');
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log(`  ✓ ${name}`); } catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.message}`); } };
const codes = r => r.violations.map(v => v.code);
const cat = (...files) => files.map(([p, u, intent, deps, extra = '']) =>
  `file "${p}" {\n  uuid = ${u}\n  intent = ${intent}\n  depends = [ ${deps.map(d => `"${d}"`).join(', ')} ]\n${extra}}\n`).join('\n');

console.log('\nmanifest phase 1');

t('MP-01 parser reads catalog blocks, quoted summaries with // inside, and comments', () => {
  const e = parseCatalog('file "a.js" {\n uuid = aa0001-x\n summary = "see http://x // not a comment"\n depends = [] // trailing\n}\n');
  assert.equal(e.length, 1); assert.equal(e[0].fields.summary, 'see http://x // not a comment'); assert.deepEqual(e[0].fields.depends, []);
});

t('MP-02 genesis.spec is clean: 41 files (0.39.286: + registry/node-registry.js, spine/route-policy.js), no violations, 7 layers', () => {
  const r = generate(fs.readFileSync(GENESIS, 'utf8'), { source: 'genesis.spec' });
  assert.equal(r.ok, true, JSON.stringify(r.violations)); assert.equal(r.violations.length, 0);
  assert.equal(r.manifest.count, 41); assert.equal(r.manifest.layers.length, 7);
});

t('MP-03 genesis: config builds before the files that read it (boot, heartbeat)', () => {
  const m = generate(fs.readFileSync(GENESIS, 'utf8')).manifest, at = f => m.entries.find(e => e.file === f).buildIndex;
  assert.ok(at('config/genesis.config.json') < at('kernel/boot.js'));
  assert.ok(at('config/genesis.config.json') < at('pulse/heartbeat.js'));
});

t('MP-04 legacy ref is read as depends and flagged — the boot↔warp-bridge cycle it hid is caught', () => {
  const src = cat(['kernel/boot.js', 'ge1000-b', 'boot', []], ['spine/warp-bridge.js', 'ge2000-w', 'bridge', []])
    .replace('depends = [  ]', 'ref = [ "ge2000" ]').replace('depends = [  ]', 'ref = [ "ge1000" ]');
  const r = generate(src);
  assert.ok(codes(r).includes('LEGACY_REF')); assert.ok(codes(r).includes('CYCLE')); assert.equal(r.ok, false);
  assert.match(r.violations.find(v => v.code === 'CYCLE').message, /kernel\/boot\.js → spine\/warp-bridge\.js → kernel\/boot\.js/);
});

t('MP-05 every violation is listed, not just the first', () => {
  const r = generate(cat(['a.js', 'aa0001-a', 'a', ['zz9999']], ['b.js', 'bb0002-b', 'b', ['bb0002']], ['a.js', 'cc0003-c', '', []]));
  for (const c of ['UNRESOLVED_DEPENDENCY', 'SELF_DEPENDENCY', 'DUPLICATE_PATH', 'MISSING_INTENT']) assert.ok(codes(r).includes(c), c);
});

t('MP-06 depends resolves by uuid prefix, full uuid and path; related never orders', () => {
  const r = generate(cat(['a.js', 'aa0001-x-1', 'a', []], ['b.js', 'bb0002-x-2', 'b', ['aa0001-x-1']], ['c.js', 'cc0003-x-3', 'c', ['b.js'], '  related = [ "dd0004" ]\n'],
    ['d.js', 'dd0004-x-4', 'd', ['cc0003']]));
  assert.equal(r.ok, true, JSON.stringify(r.violations)); assert.deepEqual(r.manifest.buildOrder, ['aa0001', 'bb0002', 'cc0003', 'dd0004']);
});

t('MP-07 signals: one producer per signature (I3)', () => {
  const f = fromSource(JSON.stringify([{ path: 'a.js', intent: 'a', emits: ['x:y:z'] }, { path: 'b.js', intent: 'b', emits: ['x:y:z'] }, { path: 'c.js', intent: 'c', consumes: ['x:y:z'] }])).files;
  assert.ok(codes(wireCheck(f)).includes('MULTIPLE_PRODUCERS'));
});

t('MP-08 signals: an emit with no consumer must be declared residue (I4)', () => {
  const bad = fromSource(JSON.stringify([{ path: 'a.js', intent: 'a', emits: ['x:y:z'] }])).files;
  const ok = fromSource(JSON.stringify([{ path: 'a.js', intent: 'a', emits: [{ event: 'x:y:z', residue: true }] }])).files;
  assert.ok(codes(wireCheck(bad)).includes('UNDECLARED_RESIDUE')); assert.equal(wireCheck(ok).ok, true);
});

t('MP-09 signals: a consumer with no producer is an error', () => {
  const f = fromSource(JSON.stringify([{ path: 'a.js', intent: 'a', consumes: ['q:r:s'] }])).files;
  assert.ok(codes(wireCheck(f)).includes('NO_PRODUCER'));
});

t('MP-10 schemas: a consumer requiring a field the producer never sends — the 0.39.244 /events bug class', () => {
  const f = fromSource(JSON.stringify([
    { path: 'guardian/events.js', intent: 'feed', emits: [{ event: 'guardian:job:complete', schema: { properties: { seq: {}, type: {}, ts: {} } } }] },
    { path: 'idearium/stream.js', intent: 'relay', consumes: [{ signature: 'guardian:job:complete', schema: { required: ['jobId', 'agentId'] } }] },
  ])).files;
  const v = wireCheck(f).violations.find(x => x.code === 'SCHEMA_MISMATCH');
  assert.ok(v); assert.match(v.message, /jobId, agentId/);
});

t('MP-11 build_order YAML (compiler-t0 shape) goes through the same check', () => {
  const r = generate('- a.js\n- {path: b.js, dependsOn: [a.js]}\n- {path: c.js, dependsOn: [b.js]}\n');
  assert.equal(r.format, 'build_order'); assert.deepEqual(r.manifest.buildOrder, ['a.js', 'b.js', 'c.js']);
  assert.ok(codes(r).includes('MISSING_INTENT'), 'a file list without intents is not buildable');
});

t('MP-12 deterministic: same input, byte-identical manifest and registry', () => {
  const s = fs.readFileSync(GENESIS, 'utf8');
  assert.equal(JSON.stringify(generate(s).manifest), JSON.stringify(generate(s).manifest));
  assert.equal(JSON.stringify(generate(s).registry), JSON.stringify(generate(s).registry));
});

t('MP-13 no registry is emitted while the wiring has errors', () => {
  assert.equal(generate(cat(['a.js', 'aa0001-a', 'a', ['nope']])).registry, null);
});

t('MP-14 chunk context (I5) = own entry + direct depends only, never dependents or the rest', () => {
  const m = generate(fs.readFileSync(GENESIS, 'utf8')).manifest;
  const ctx = chunkContext(m, 'ge8002');
  assert.deepEqual(ctx.neighbours.map(n => n.id).sort(), ['ge8000', 'ge8001']);
  assert.ok(JSON.stringify(ctx).length < 1500, 'context stays small');
});

t('MP-15 pure CLI: context prints parseable JSON; check exits 1 on a cycle', () => {
  const cli = path.join(ROOT, 'idearium/spec-engine/manifest/cli.js');
  const out = execFileSync('node', [cli, 'context', GENESIS, 'ge2000'], { encoding: 'utf8' });
  assert.equal(JSON.parse(out).self.file, 'spine/warp-bridge.js');
  const tmp = path.join(fs.mkdtempSync('/tmp/mp-'), 'cyc.spec');
  fs.writeFileSync(tmp, cat(['a.js', 'aa0001-a', 'a', ['bb0002']], ['b.js', 'bb0002-b', 'b', ['aa0001']]));
  assert.equal(spawnSync('node', [cli, 'check', tmp]).status, 1);
});

t('MP-16 generate writes manifest.json + component-registry.json', () => {
  const dir = fs.mkdtempSync('/tmp/mp-gen-');
  execFileSync('node', [path.join(ROOT, 'idearium/spec-engine/manifest/cli.js'), 'generate', GENESIS, '--out', dir]);
  const reg = JSON.parse(fs.readFileSync(path.join(dir, 'component-registry.json'), 'utf8'));
  assert.equal(reg.count, 41); assert.equal(reg.components.ge1000.file, 'kernel/boot.js');
  assert.equal(reg.components.ge5005.file, 'registry/node-registry.js'); assert.equal(reg.components.ge2003.file, 'spine/route-policy.js');
  assert.ok(reg.components.ge1000.depends.includes('geB000'));
});

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exitCode = fail ? 1 : 0;
