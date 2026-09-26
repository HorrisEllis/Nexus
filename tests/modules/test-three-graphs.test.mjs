// tests/modules/test-three-graphs.test.mjs — 0.39.246
// James: "can you make sure the 3 graphs are hooked in?" — code (what the
// source says), execution (what ran), spec (what is declared), per the
// 2026-09-19 graph-field design. Drives the REAL import pipeline on a
// scratch repo and checks each graph lands, plus the spec↔code findings.
import fs from 'fs';
import os from 'os';
import path from 'path';
import assert from 'assert';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'three-graphs-'));
const repoDir = path.join(tmp, 'repo');
const FILES = {
  'src/store.js':  "function put(k, v) { return { k, v }; }\nmodule.exports = { put };\n",
  'src/api.js':    "const { put } = require('./store.js');\nconst { log } = require('./log.js');\nfunction save(x) { log(x); return put('x', x); }\nmodule.exports = { save };\n",
  'src/log.js':    "function log(m) { return String(m); }\nmodule.exports = { log };\n",
  'src/cli.js':    "function main() { return 0; }\nmodule.exports = { main };\n",
  'src/api.test.js': "const assert = require('assert');\nconst { save } = require('./api.js');\nassert.deepStrictEqual(save(1), { k: 'x', v: 1 });\n",
  // the declared map — agrees on api→store, disagrees twice on purpose:
  //   cli → api declared but cli imports nothing          (declared_not_imported)
  //   api imports log but the spec never declares it      (imported_not_declared)
  'spec/app.spec': [
    'catalog APP {',
    '  file "src/store.js" {\n    uuid = aa0001-store\n    intent = keep_values\n    depends = []\n  }',
    '  file "src/log.js" {\n    uuid = aa0002-log\n    intent = format_messages\n    depends = []\n  }',
    '  file "src/api.js" {\n    uuid = aa0003-api\n    intent = save_through_store\n    depends = [ "aa0001" ]\n  }',
    '  file "src/cli.js" {\n    uuid = aa0004-cli\n    intent = command_door\n    depends = [ "aa0003" ]\n  }',
    '  file "src/not-built-yet.js" {\n    uuid = aa0005-todo\n    intent = declared_but_absent\n    depends = [ "aa0003" ]\n  }',
    '}', ''].join('\n'),
};
for (const [rel, content] of Object.entries(FILES)) {
  fs.mkdirSync(path.dirname(path.join(repoDir, rel)), { recursive: true });
  fs.writeFileSync(path.join(repoDir, rel), content);
}

let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log(`  ✓ ${name}`); } catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.message}`); } };
const read = f => { try { return JSON.parse(fs.readFileSync(path.join(repoDir, f), 'utf8')); } catch { return null; } };

const pipeline = await import('../../idearium/repo/import-pipeline.js');
const verifyLazy = await import('../../idearium/repo/verify-lazy.js');
const workQueue = require('../../lib/work-queue.js');
const events = [];
const result = pipeline.runImportPipeline({ uuid: 'three-graphs-repo', files: Object.keys(FILES).map(p => ({ path: p })) }, repoDir, { onEvent: e => events.push(e.type) });

console.log('\nthree graphs, hooked into import');

await t('TG-01 import reaches READY', () => assert.equal(result.state, 'READY', JSON.stringify(result.error || result.verification?.tiers?.filter(x => !x.passed))));

await t('TG-02 code graph: built by the import, api.js imports store.js and log.js', () => {
  const g = read('graph.json'); assert.ok(g, 'graph.json missing');
  const imp = g.edges.filter(e => e.relation === 'imports' && e.from === 'file:src/api.js' && e.resolution === 'resolved').map(e => e.to).sort();
  assert.deepEqual(imp, ['file:src/log.js', 'file:src/store.js']);
});

await t('TG-03 spec graph: built by the import, its event fired after the code graph', () => {
  const sg = read('spec-graph.json'); assert.ok(sg, 'spec-graph.json missing');
  assert.equal(sg.status, 'built'); assert.equal(sg.summary.specs, 1); assert.equal(sg.summary.entries, 5);
  assert.ok(events.indexOf('spec:graph:complete') > events.indexOf('graph:build:complete'), events.join(','));
  assert.equal(result.specGraph.status, 'built');
});

await t('TG-04 spec graph resolves declared files onto repo files and reports the one not built yet', () => {
  const s = read('spec-graph.json').sources[0];
  assert.equal(s.resolvedToRepoFiles, 4); assert.equal(s.notInRepo, 1);
  assert.equal(s.entriesDetail.find(e => e.id === 'aa0005').repoFile, null);
});

await t('TG-05 disagreement: declared but not imported (cli → api)', () => {
  const d = read('spec-graph.json').disagreements.find(x => x.divergence === 'declared_not_imported');
  assert.ok(d); assert.equal(d.entity, 'src/cli.js → src/api.js'); assert.equal(d.kind, 'ledger_divergence'); assert.deepEqual(d.graphs, ['spec', 'code']);
});

await t('TG-06 disagreement: imported but not declared (api → log)', () => {
  const d = read('spec-graph.json').disagreements.find(x => x.divergence === 'imported_not_declared');
  assert.ok(d); assert.equal(d.entity, 'src/api.js → src/log.js');
});

await t('TG-07 agreement is silent: api → store appears in neither list', () => {
  assert.equal(read('spec-graph.json').disagreements.some(x => x.entity === 'src/api.js → src/store.js'), false);
  assert.equal(read('spec-graph.json').summary.disagreements, 2);
});

await t('TG-08 execution graph: queued by the import itself, then built — no manual POST', async () => {
  await workQueue.get(verifyLazy.QUEUE_NAME).drain();
  const deadline = Date.now() + 60000;
  let lazy = read('verification.lazy.json');
  while (!(lazy && lazy.runtimeProof && ['built', 'failed'].includes(lazy.runtimeProof.status)) && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 250)); lazy = read('verification.lazy.json');
  }
  assert.equal(lazy?.runtimeProof?.status, 'built', JSON.stringify(lazy?.runtimeProof));
  const proof = read('proof.json'); assert.ok(proof, 'proof.json missing');
  const apiChunks = proof.chunks.filter(c => c.file === 'src/api.js');
  assert.ok(apiChunks.some(c => c.proof === 'passed'), 'api.js ran under the passing test');
});

await t('TG-09 the L6-L8 result survives: runtimeProof is merged into verification.lazy.json, not written over it', () => {
  const lazy = read('verification.lazy.json');
  assert.ok(Array.isArray(lazy.tiers) && lazy.tiers.length === 3, 'L6-L8 tiers lost');
});

await t('TG-10 a repo with no catalog .spec says not_applicable, never fakes a graph', async () => {
  const d2 = path.join(tmp, 'repo2'); fs.mkdirSync(path.join(d2, 'src'), { recursive: true });
  fs.writeFileSync(path.join(d2, 'src/a.js'), 'module.exports = 1;\n');
  const r2 = pipeline.runImportPipeline({ uuid: 'three-graphs-2', files: [{ path: 'src/a.js' }] }, d2);
  assert.equal(r2.specGraph.status, 'not_applicable');
  assert.equal(JSON.parse(fs.readFileSync(path.join(d2, 'spec-graph.json'), 'utf8')).status, 'not_applicable');
});

await t('TG-11 API: /graphs and /graph/spec are routed; UI reads /graphs and knows the spec stage', () => {
  const api = fs.readFileSync(new URL('../../idearium/api/index.js', import.meta.url), 'utf8');
  assert.match(api, /\['api','repos',\s*':uuid','graphs'\],\s*'repo\.graphs'\]/);
  assert.match(api, /\['api','repos',\s*':uuid','graph','spec'\],\s*'repo\.graph\.spec'\]/);
  assert.match(api, /case 'repo\.graphs':/); assert.match(api, /case 'repo\.graph\.spec':/);
  const ui = fs.readFileSync(new URL('../../idearium/ui/js/app.js', import.meta.url), 'utf8');
  assert.match(ui, /\/api\/repos\/\$\{repo\.uuid\}\/graphs/); assert.match(ui, /'spec:graph:complete'/);
});

await workQueue.get(verifyLazy.QUEUE_NAME).drain();
await workQueue.get(verifyLazy.PROOF_QUEUE).drain();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
