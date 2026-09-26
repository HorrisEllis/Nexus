'use strict';
// §SANDBOX — real spec-engine under a throwaway data root (lib/test-sandbox.js).
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-idearium-codegen.test.js — §0.39.265
 *
 * James: "now what? no code actually generated." A finished document spec
 * (purpose, schema, api, … tests — prose) had no next step. "Generate code":
 *   - lib/spec-digest.js condenses the finished spec (most useful sections
 *     first, a fair share of one budget each);
 *   - speceng.codegen plans a file tree FROM it and creates a code spec
 *     (createFileTreeSpec — one chunk per real file), linked both ways, with
 *     its own repo, refusing an unfinished spec and not re-planning twice;
 *   - the spec list carries the link, so the UI offers "generate code →" /
 *     "open the code →";
 *   - the phase sync no longer logs "spec.update … spec not found" for a
 *     spec-engine spec that has no IdeaOS twin;
 *   - the page stays connected through one missed health probe.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
process.env.IDEARIUM_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'codegen-idearium-'));
process.env.NEXUS_FILETREE_DIR = path.join(process.env.IDEARIUM_DATA_DIR, 'filetree');

let passed = 0, failed = 0;
async function test(desc, fn) {
  try { await fn(); console.log(`  ✓ ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${desc}\n    ${e.message}`); failed++; }
}
const { specDigest } = require(path.join(ROOT, 'lib', 'spec-digest.js'));
const API = fs.readFileSync(path.join(ROOT, 'idearium', 'api', 'index.js'), 'utf8');
const APP = fs.readFileSync(path.join(ROOT, 'idearium', 'ui', 'js', 'app.js'), 'utf8');

(async () => {
  console.log('\n  idearium — generate code from a finished spec');

  await test('the digest puts purpose and build order first, skips unbuilt sections, and stays inside its budget', () => {
    const m = { chunks: [
      { sectionId: 'meta', sectionTitle: 'Meta', status: 'complete', content: 'M'.repeat(5000) },
      { sectionId: 'tests', sectionTitle: 'Tests', status: 'complete', content: 'T'.repeat(5000) },
      { sectionId: 'purpose', sectionTitle: 'Purpose & Intent', status: 'complete', content: 'P'.repeat(5000) },
      { sectionId: 'api', sectionTitle: 'API', status: 'pending', content: null },
      { sectionId: 'build_order', sectionTitle: 'Build Order', status: 'complete', content: 'B'.repeat(100) },
    ] };
    const d = specDigest(m, 3000);
    const at = (t) => d.indexOf(`## ${t}`);
    assert.ok(at('Purpose & Intent') === 0 && at('Build Order') > 0 && at('Tests') > at('Build Order') && at('Meta') > at('Tests'), d.slice(0, 200));
    assert.ok(!d.includes('## API'), 'an unbuilt section is not in it');
    assert.ok(d.replace(/## .*\n|…|\n/g, '').length <= 3000, 'within budget');
    assert.ok(d.includes('B'.repeat(100)), 'a short section is kept whole');
    assert.strictEqual(specDigest({ chunks: [] }), '');
  });

  await test('a finished spec becomes a linked code spec: one chunk per planned file, the spec in every file prompt', async () => {
    const se = await import(path.join(ROOT, 'idearium', 'spec-engine', 'index.js'));
    const doc = se.createSpec({ name: 'tool-test', description: 'tests run_closed_loop' });
    for (const c of doc.chunks) se.completeChunk(doc.uuid, c.uuid, `${c.sectionId} content: the ${c.sectionId} of tool-test.`);
    const done = se.loadSpec(doc.uuid);
    assert.ok(done.chunks.every(c => c.status === 'complete'));
    const description = specDigest(done);
    assert.ok(/## .*\npurpose content/.test(description));
    const plan = { ok: true, planSource: 'agent', rejected: [], files: [
      { path: 'src/kernel/record.js', layer: 'kernel', purpose: 'execution record' },
      { path: 'src/engine/run.js', layer: 'engine', purpose: 'invokes run_closed_loop' },
      { path: 'test/run.test.js', layer: 'test', purpose: 'proves it' },
    ] };
    const code = se.createFileTreeSpec({ name: 'tool-test · code', description, plan });
    code.codeFor = doc.uuid; se.saveSpec(code);
    const d2 = se.loadSpec(doc.uuid); d2.codeSpecUuid = code.uuid; se.saveSpec(d2);
    assert.deepStrictEqual(code.chunks.map(c => c.realPath), ['src/kernel/record.js', 'src/engine/run.js', 'test/run.test.js']);
    const prompt = se.buildChunkPrompt(se.loadSpec(code.uuid), code.chunks[1]);
    assert.ok(prompt.includes('purpose content') && prompt.includes('src/engine/run.js'), 'the file prompt carries the spec');
    const list = se.listSpecs();
    const docRow = list.find(s => s.uuid === doc.uuid), codeRow = list.find(s => s.uuid === code.uuid);
    assert.strictEqual(docRow.codeSpecUuid, code.uuid);
    assert.ok(codeRow.fileTree && codeRow.codeFor === doc.uuid, 'the list carries the link both ways');
  });

  await test('the route: registered, refuses an unfinished spec, reuses an existing code spec, plans from the digest, makes a repo', () => {
    assert.ok(/\['POST',\s*\['api','spec-engine','specs',':uuid','codegen'\],\s*'speceng\.codegen'\]/.test(API));
    const i = API.indexOf("case 'speceng.codegen': {"), block = API.slice(i, API.indexOf("case 'speceng.create': {", i));
    assert.ok(i > 0);
    assert.ok(/return err\(res, 409, `finish the spec first/.test(block), 'unfinished spec refused');
    assert.ok(/doc\.codeSpecUuid && !body\.again/.test(block) && /existing: true/.test(block), 'no second plan unless asked');
    assert.ok(/spec-digest\.js'\)\.specDigest\(doc\)/.test(block) && /FTP\.plan\(\{ name: doc\.name, description, ask \}\)/.test(block));
    assert.ok(/se\.createFileTreeSpec\(/.test(block) && /manifest\.codeFor = doc\.uuid/.test(block) && /freshDoc\.codeSpecUuid = manifest\.uuid/.test(block));
    assert.ok(/getRepoLayer\(\)\.ingest\(/.test(block) && /source: 'spec\.codegen'/.test(block));
  });

  await test('the phase sync only updates an IdeaOS spec that exists (no more "spec not found" at every build end)', () => {
    const i = API.indexOf('function _syncPhaseFromManifest'), block = API.slice(i, i + 900);
    assert.ok(/os\.spec\(manifest\.uuid\)\) \{\s*\n\s*os\.emit\('idearium\.spec\.update'/.test(block), block);
  });

  await test('the UI: a finished spec offers "generate code →" (or "open the code →"); a code spec links back', () => {
    assert.ok(/generate code →/.test(APP) && /open the code →/.test(APP) && /← the spec it came from/.test(APP));
    assert.ok(/async function generateCode\(specUuid\)/.test(APP) && /\/codegen`, \{ method: 'POST'/.test(APP) && /createRepoThenBuild\(code\.uuid\)/.test(APP));
    assert.ok(/next: generate code/.test(APP), 'finishing the spec points at the next step');
  });

  await test('the page stays connected through one missed health probe (two in a row → offline)', () => {
    assert.ok(/_healthMisses >= 2/.test(APP) && /setConnUI\('slow'/.test(APP));
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
