'use strict';
/**
 * tests/modules/test-repo-graph.js — idearium/repo/graph.js (MCO1).
 *
 * §12.2 — no fixture graph anywhere in this file. A real multi-file,
 * multi-language repository is written to a real temp directory, the
 * REAL import pipeline is run over it, and the graph is built from that
 * pipeline's own real on-disk output. If the pipeline changes shape,
 * these tests break — which is the point.
 *
 * The phasemap's own gate for MCO1 is asserted directly (GR-GATE).
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.message}`); }
}

// ── a real repository on disk ────────────────────────────────────────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-graph-'));
const repoDir = path.join(tmp, 'repo');

const FILES = {
  'src/index.js':
    "const { helper } = require('./lib/helper');\n" +
    "const express = require('express');\n" +           // external — must survive unresolved
    "function main() { return helper(); }\n" +
    "function second() { return 2; }\n" +
    "module.exports = { main, second };\n",
  'src/lib/helper.js':
    "import { util } from '../util.js';\n" +
    "export function helper() { return util(); }\n",
  'src/util.js':
    "/* require('./ghost') in a docblock must NOT count as an edge */\n" +
    "export function util() { return 1; }\n",
  'src/dyn.js':
    "const name = 'x';\nconst m = require(name);\nfunction load() { return m; }\n",
  'app/main.py':
    "from .worker import run\nimport os\n\ndef start():\n    return run()\n",
  'app/worker.py':
    "def run():\n    return 42\n",
  'native/thing.c':
    '#include "thing.h"\n#include <stdio.h>\nint thing(void) { return 1; }\n',
  'native/thing.h':
    'int thing(void);\n',
  'src/broken.js':
    "function open() { return {  \n",                  // unbalanced — parse failure
};

for (const [rel, content] of Object.entries(FILES)) {
  const abs = path.join(repoDir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
}

const repo = { uuid: 'repo-graph-test-0001', files: Object.keys(FILES).map(p => ({ path: p })) };

(async () => {
  const pipeline = await import('../../idearium/repo/import-pipeline.js');
  const G = await import('../../idearium/repo/graph.js');

  console.log('\n── real pipeline run ──────────────────────────────────────');
  const result = pipeline.runImportPipeline(repo, repoDir);
  t('the real import pipeline reaches READY on this repo', () => {
    assert.strictEqual(result.state, 'READY', `state=${result.state} error=${result.error || ''}`);
  });
  t('it produced real chunks and indexes on disk', () => {
    assert.ok(fs.existsSync(path.join(repoDir, 'indexes', 'files.json')));
    assert.ok(result.chunks.count > 0, 'expected real chunks');
  });

  console.log('\n── reference extraction ───────────────────────────────────');

  t('js require + import + export-from are all found', () => {
    const refs = G.extractReferences(
      "require('./a');\nimport x from './b';\nexport { y } from './c';\n", 'javascript');
    assert.deepStrictEqual(refs.map(r => r.specifier), ['./a', './b', './c']);
  });

  t('a require inside a docblock is NOT an edge (loom\'s own proven bug)', () => {
    const refs = G.extractReferences("/* require('./ghost') */\nrequire('./real');", 'javascript');
    assert.deepStrictEqual(refs.map(r => r.specifier), ['./real']);
  });

  t('a require inside a template literal is NOT an edge', () => {
    const refs = G.extractReferences("const s = `require('./ghost')`;\nrequire('./real');", 'javascript');
    assert.deepStrictEqual(refs.map(r => r.specifier), ['./real']);
  });

  t('dynamic require is detected as dynamic, never guessed at', () => {
    const refs = G.extractReferences('const m = require(name);', 'javascript');
    assert.strictEqual(refs.length, 1);
    assert.strictEqual(refs[0].kind, 'dynamic');
    assert.strictEqual(refs[0].specifier, null);
  });

  t('python from-import and plain import both found', () => {
    const refs = G.extractReferences('from .worker import run\nimport os\n', 'python');
    assert.deepStrictEqual(refs.map(r => r.specifier).sort(), ['.worker', 'os']);
  });

  t('c quoted include is an import, angle include is a system header', () => {
    const refs = G.extractReferences('#include "a.h"\n#include <stdio.h>\n', 'c');
    assert.strictEqual(refs.find(r => r.specifier === 'a.h').kind, 'import');
    assert.strictEqual(refs.find(r => r.specifier === 'stdio.h').kind, 'system');
  });

  t('a language with no extractor returns [] (and the graph says so separately)', () => {
    assert.deepStrictEqual(G.extractReferences('whatever', 'brainfuck'), []);
  });

  console.log('\n── graph construction ─────────────────────────────────────');
  const graph = G.buildGraph({ repoDir, repository: repo.uuid });

  t('every real file has a node', () => {
    for (const p of Object.keys(FILES)) {
      assert.ok(graph.nodes.find(n => n.id === `file:${p}`), `missing node for ${p}`);
    }
  });

  t('a parse-failed file STILL has a node (§10 on_failure)', () => {
    assert.ok(graph.nodes.find(n => n.id === 'file:src/broken.js'), 'broken.js vanished from the model');
  });

  t('file contains chunk, and chunk belongs_to file (both directions real)', () => {
    const c = graph.edges.find(e => e.relation === 'contains' && e.from === 'file:src/index.js' && e.to);
    assert.ok(c, 'no contains edge for src/index.js');
    assert.ok(graph.edges.find(e => e.relation === 'belongs_to' && e.from === c.to && e.to === c.from));
  });

  t('a chunk contains the symbols whose lines fall in its range', () => {
    const e = graph.edges.find(x => x.relation === 'contains' && x.from.startsWith('chunk:') && x.via === 'line-range');
    assert.ok(e, 'no chunk->symbol containment found');
  });

  t('a real relative require resolves to a real file node', () => {
    const e = graph.edges.find(x =>
      x.relation === 'imports' && x.from === 'file:src/index.js' && x.target === 'src/lib/helper.js');
    assert.ok(e, 'index.js -> lib/helper.js not resolved');
    assert.strictEqual(e.resolution, 'resolved');
    assert.strictEqual(e.to, 'file:src/lib/helper.js');
  });

  t('an ESM import with a ../ path and an extension resolves too', () => {
    const e = graph.edges.find(x =>
      x.relation === 'imports' && x.from === 'file:src/lib/helper.js' && x.target === 'src/util.js');
    assert.ok(e, 'helper.js -> util.js not resolved');
    assert.strictEqual(e.resolution, 'resolved');
  });

  t('THE RULE: an external import survives as an unresolved edge, not omitted', () => {
    const e = graph.edges.find(x =>
      x.from === 'file:src/index.js' && x.relation === 'imports' && x.target === 'express');
    assert.ok(e, "the 'express' import disappeared — that is the invented-completeness failure §24 forbids");
    assert.strictEqual(e.resolution, 'unresolved');
    assert.strictEqual(e.reason, 'external-or-unresolved');
    assert.strictEqual(e.to, null);
  });

  t('a dynamic require is an unresolved edge with reason dynamic', () => {
    const e = graph.edges.find(x => x.from === 'file:src/dyn.js' && x.reason === 'dynamic');
    assert.ok(e, 'dynamic require produced no edge at all');
    assert.strictEqual(e.resolution, 'unresolved');
  });

  t('the docblock ghost import produced no edge anywhere in the real graph', () => {
    assert.ok(!graph.edges.find(e => String(e.target).includes('ghost')), 'a docblock require became a real edge');
  });

  // §GAP CLOSED 2026-09-20 — these three cases have now been rewritten
  // TWICE, and the history is the point. They started life asserting
  // that C imports resolve; they failed, and the failure was correct:
  // import-pipeline.js's LANGUAGES table had no .c/.h entry, so C files
  // arrived with language:null and the C extractor could never fire.
  // They were rewritten to pin that gap honestly rather than bending the
  // module to pass, with the note that "fixing it upstream has to update
  // them deliberately." lib/languages.js then closed the gap at the one
  // real owner of language detection, these failed again, and this is
  // that deliberate update — back to the original assertions, which now
  // hold for real.
  t('a quoted C include of a real file in the repo resolves', () => {
    const e = graph.edges.find(x =>
      x.from === 'file:native/thing.c' && x.relation === 'imports' && x.target === 'native/thing.h');
    assert.ok(e, 'thing.c -> thing.h not resolved');
    assert.strictEqual(e.resolution, 'resolved');
  });

  t('a system header is unresolved with its own distinct reason', () => {
    const e = graph.edges.find(x => x.target === 'stdio.h');
    assert.ok(e, 'the system header produced no edge at all');
    assert.strictEqual(e.reason, 'system-header');
    assert.strictEqual(e.resolution, 'unresolved');
  });

  t('nothing is left undetected upstream for a language we can extract', () => {
    // The inverse of the gap test this replaces: the graph should now
    // have NOTHING to report here for any language it has an extractor
    // for. If a future language is added to an extractor without being
    // added to lib/languages.js, this fails.
    assert.deepStrictEqual(graph.languagesUndetectedUpstream, [],
      `still undetected: ${JSON.stringify(graph.languagesUndetectedUpstream)}`);
  });

  t('a python relative import resolves to the real sibling module', () => {
    const e = graph.edges.find(x =>
      x.from === 'file:app/main.py' && x.relation === 'imports' && x.target === 'app/worker.py');
    assert.ok(e, 'main.py -> worker.py not resolved');
  });

  t('depends_on and depended_on_by are both materialized', () => {
    assert.ok(graph.edges.find(e =>
      e.relation === 'depends_on' && e.from === 'file:src/index.js' && e.to === 'file:src/lib/helper.js'));
    assert.ok(graph.edges.find(e =>
      e.relation === 'depended_on_by' && e.from === 'file:src/lib/helper.js' && e.to === 'file:src/index.js'));
  });

  t('the graph declares what it does NOT produce (calls, implements, ...)', () => {
    assert.ok(graph.relationsDeclaredUnsupported.includes('calls'));
    assert.ok(!graph.relationsSupported.includes('calls'));
    assert.ok(!graph.edges.find(e => e.relation === 'calls'), 'a calls edge was invented');
  });

  t('the graph records provenance and an unresolved count', () => {
    assert.ok(graph.generatedFrom.atlasHash, 'no atlas hash — a stale graph would be undetectable');
    assert.ok(graph.unresolvedCount >= 3, `expected real unresolved edges, got ${graph.unresolvedCount}`);
  });

  // §24's envelope (adopted 2026-09-20) puts real observation timestamps
  // on every edge, which are BY DESIGN not identical between two runs.
  // Determinism is therefore asserted over the STRUCTURE — everything a
  // consumer reasons about — with the timestamps stripped. Weakening the
  // comparison to `edgeCount` instead would have hidden a real structural
  // regression behind a number that stays the same.
  const structural = g => JSON.stringify(g.edges.map(
    ({ first_seen, last_seen, ...rest }) => rest));

  t('determinism: the same repo builds a structurally identical graph', () => {
    const again = G.buildGraph({ repoDir, repository: repo.uuid });
    assert.strictEqual(JSON.stringify(again.nodes), JSON.stringify(graph.nodes));
    assert.strictEqual(structural(again), structural(graph), 'edge structure drifted between builds');
  });

  t('ENV-001 every edge carries the §24 provenance envelope', () => {
    for (const e of graph.edges.slice(0, 50)) {
      assert.ok(e.status, 'no status');
      assert.strictEqual(e.confidence, 'structural');
      assert.ok(e.source && e.source.extractor_version, 'no extractor_version');
      assert.strictEqual(e.graph_version, G.GRAPH_VERSION);
      assert.ok(e.first_seen && e.last_seen, 'no timestamps');
    }
  });

  t('ENV-002 status distinguishes what was OBSERVED from what was DERIVED', () => {
    const observed = graph.edges.find(e => e.status === 'observed');
    const derived = graph.edges.find(e => e.status === 'derived');
    const unresolved = graph.edges.find(e => e.status === 'unresolved');
    assert.ok(observed, 'nothing marked observed');
    assert.ok(derived, 'nothing marked derived — inverses and containment are derived');
    assert.ok(unresolved, 'an unresolved edge should say so in status too');
  });

  t('ENV-003 it claims only the vocabulary it can honestly produce', () => {
    // 'inferred', 'conflicting' and 'stale' are real §24 values that
    // nothing in this module produces. Claiming one would be the
    // invented-completeness §24 forbids, one level up from edges.
    const claimed = new Set(graph.edges.map(e => e.status));
    for (const never of ['inferred', 'conflicting', 'stale']) {
      assert.ok(!claimed.has(never), `claimed "${never}" without a producer for it`);
    }
  });

  t('ENV-004 first_seen is CARRIED FORWARD on rebuild, last_seen moves', () => {
    // The field's whole purpose: telling a genuinely new edge from one
    // that has been there all along. If first_seen reset every build it
    // would answer that question wrongly, every time.
    G.writeGraph(repoDir, graph);
    const before = G.buildGraph({ repoDir, repository: repo.uuid });
    const pick = e => e.relation === 'depends_on' && e.to === 'file:src/lib/helper.js';
    const e1 = before.edges.find(pick);
    assert.ok(e1, 'test edge missing');
    G.writeGraph(repoDir, before);
    const after = G.buildGraph({ repoDir, repository: repo.uuid });
    const e2 = after.edges.find(pick);
    assert.strictEqual(e2.first_seen, e1.first_seen, 'first_seen reset on rebuild');
    assert.ok(e2.last_seen >= e1.last_seen, 'last_seen went backwards');
  });

  t('no source content is stored in the graph (§14 applied one layer down)', () => {
    const blob = JSON.stringify(graph);
    assert.ok(!blob.includes('return helper()'), 'graph is carrying source content');
  });

  console.log('\n── §25 traversal ──────────────────────────────────────────');

  t('GR-GATE: traverse(start=<real chunk file>, depends_on, depth=2) returns a real edge set', () => {
    const r = G.traverse(graph, { start: 'file:src/index.js', relation: 'depends_on', depth: 2 });
    const reached = r.visited.map(n => n.id);
    assert.ok(reached.includes('file:src/lib/helper.js'), 'depth 1 target missing');
    assert.ok(reached.includes('file:src/util.js'), 'depth 2 transitive target missing');
    assert.ok(r.edges.length >= 2);
  });

  t('GR-GATE: unresolved relations come back marked, not omitted', () => {
    const r = G.traverse(graph, { start: 'file:src/index.js', relation: 'imports', depth: 1 });
    assert.ok(r.unresolved.find(e => e.target === 'express'), 'unresolved edge hidden by traversal');
  });

  t('depth is honored — depth 1 does not reach the transitive dependency', () => {
    const r = G.traverse(graph, { start: 'file:src/index.js', relation: 'depends_on', depth: 1 });
    assert.ok(!r.visited.map(n => n.id).includes('file:src/util.js'));
  });

  t('direction in walks the inverse', () => {
    const r = G.traverse(graph, { start: 'file:src/util.js', relation: 'depends_on', direction: 'in', depth: 1 });
    assert.ok(r.visited.map(n => n.id).includes('file:src/lib/helper.js'));
  });

  t('includeUnresolved:false filters them out, and nothing else changes', () => {
    const r = G.traverse(graph, { start: 'file:src/index.js', relation: 'imports', depth: 1, includeUnresolved: false });
    assert.strictEqual(r.unresolved.length, 0);
    assert.ok(r.edges.find(e => e.target === 'src/lib/helper.js'));
  });

  t('asking for an unsupported relation says so — empty is not the same as none', () => {
    const r = G.traverse(graph, { start: 'file:src/index.js', relation: 'calls' });
    assert.strictEqual(r.unsupported, true);
    assert.ok(r.note.includes('calls'));
  });

  t('traverse refuses garbage loudly', () => {
    assert.throws(() => G.traverse(null, { start: 'x' }), /real graph/);
    assert.throws(() => G.traverse(graph, {}), /start node/);
  });

  t('a cycle does not hang the traversal', () => {
    const cyc = JSON.parse(JSON.stringify({ nodes: graph.nodes, edges: graph.edges }));
    cyc.edges.push({ from: 'file:src/util.js', to: 'file:src/index.js', target: 'src/index.js', relation: 'depends_on', resolution: 'resolved' });
    const r = G.traverse(cyc, { start: 'file:src/index.js', relation: 'depends_on', depth: 50 });
    assert.ok(r.visited.length < 10, 'cycle expanded unboundedly');
  });

  console.log('\n── §26 dependency cone ────────────────────────────────────');

  t('changing a leaf reports what depends on it, transitively', () => {
    const cone = G.dependencyCone(graph, { start: 'src/util.js' });
    assert.strictEqual(cone.found, true);
    const ids = cone.affected.map(n => n.id);
    assert.ok(ids.includes('file:src/lib/helper.js'), 'direct dependent missing');
    assert.ok(ids.includes('file:src/index.js'), 'transitive dependent missing');
  });

  t("a chunk's cone resolves through its file", () => {
    const chunkNode = graph.nodes.find(n => n.kind === 'chunk' && n.file === 'src/util.js');
    const cone = G.dependencyCone(graph, { start: chunkNode.id });
    assert.strictEqual(cone.found, true);
    assert.ok(cone.affected.map(n => n.id).includes('file:src/index.js'));
  });

  t('the cone carries the chunks and symbols in scope', () => {
    const cone = G.dependencyCone(graph, { start: 'src/util.js' });
    assert.ok(cone.chunks.length > 0, 'no chunks in the cone');
    assert.ok(cone.symbols.find(s => s.symbol === 'main'), 'affected symbol missing');
  });

  t('the cone names what it does NOT yet include, rather than returning a bare empty', () => {
    const cone = G.dependencyCone(graph, { start: 'src/util.js' });
    assert.ok(cone.notYetInCone.includes('tests'));
    assert.ok(cone.notYetInCone.includes('contracts'));
  });

  t('an unknown start is an honest miss, not a crash or an empty success', () => {
    const cone = G.dependencyCone(graph, { start: 'nope/missing.js' });
    assert.strictEqual(cone.found, false);
    assert.ok(cone.reason);
  });

  t('affected() unions the cone across a changeset', () => {
    const a = G.affected(graph, ['src/util.js', 'app/worker.py']);
    const ids = a.files.map(n => n.id);
    assert.ok(ids.includes('file:src/index.js'));
    assert.ok(ids.includes('file:app/main.py'));
  });

  console.log('\n── persistence ────────────────────────────────────────────');

  t('writeGraph then readGraph round-trips', () => {
    const w = G.writeGraph(repoDir, graph);
    assert.strictEqual(w.ok, true);
    const back = G.readGraph(repoDir);
    assert.strictEqual(back.edgeCount, graph.edgeCount);
  });

  t('PERSIST-001 the written file is lean and says exactly what it omitted', () => {
    G.writeGraph(repoDir, graph);
    const raw = JSON.parse(fs.readFileSync(path.join(repoDir, 'graph.json'), 'utf8'));
    assert.strictEqual(raw.persisted, 'lean');
    assert.ok(!raw.nodes.find(n => n.kind !== 'file'), 'chunk/symbol nodes were still written');
    assert.ok(!raw.edges.find(e => G.DERIVED_ELSEWHERE.has(e.relation)), 'containment edges were still written');
    assert.ok(raw.omittedFromDisk.edges > 0 && raw.omittedFromDisk.nodes > 0, 'omission not declared');
    assert.ok(raw.omittedFromDisk.reason.includes('§10.2'));
  });

  t('PERSIST-002 readGraph rebuilds a graph IDENTICAL to buildGraph — nothing lost', () => {
    // The whole justification for not persisting containment is that it
    // can be rebuilt exactly. Asserting a count would not prove that;
    // this compares every node and every edge.
    G.writeGraph(repoDir, graph);
    const back = G.readGraph(repoDir);
    assert.strictEqual(JSON.stringify(back.nodes), JSON.stringify(graph.nodes), 'rebuilt nodes differ');
    const strip = g => JSON.stringify(g.edges.map(({ first_seen, last_seen, ...r }) => r));
    assert.strictEqual(strip(back), strip(graph), 'rebuilt edge structure differs');
  });

  t('PERSIST-003 a rebuilt graph traverses and cones identically', () => {
    G.writeGraph(repoDir, graph);
    const back = G.readGraph(repoDir);
    const a = G.traverse(graph, { start: 'file:src/index.js', relation: 'depends_on', depth: 2 });
    const b = G.traverse(back, { start: 'file:src/index.js', relation: 'depends_on', depth: 2 });
    assert.strictEqual(JSON.stringify(b.visited), JSON.stringify(a.visited));
    const ca = G.dependencyCone(graph, { start: 'src/util.js' });
    const cb = G.dependencyCone(back, { start: 'src/util.js' });
    assert.strictEqual(JSON.stringify(cb.chunks), JSON.stringify(ca.chunks));
  });

  t('PERSIST-004 the lean file is materially smaller than the full graph', () => {
    G.writeGraph(repoDir, graph);
    const leanBytes = fs.statSync(path.join(repoDir, 'graph.json')).size;
    const fullBytes = Buffer.byteLength(JSON.stringify(graph));
    assert.ok(leanBytes < fullBytes * 0.6,
      `lean ${leanBytes} vs full ${fullBytes} — the saving that justified this is not real`);
  });

  t('PERSIST-005 a pre-lean graph file is read back unchanged, not double-counted', () => {
    // Backward compatibility, asserted rather than assumed: an artifact
    // written before this change already carries containment inline.
    const legacyDir = path.join(tmp, 'legacy');
    fs.mkdirSync(legacyDir, { recursive: true });
    const { _byFrom, ...full } = graph;
    fs.writeFileSync(path.join(legacyDir, 'graph.json'), JSON.stringify(full), 'utf8');
    const back = G.readGraph(legacyDir);
    assert.strictEqual(back.edges.length, graph.edges.length, 'legacy graph was rebuilt on top of itself');
  });

  t('readGraph returns null when there is no graph (not an empty one)', () => {
    const empty = path.join(tmp, 'nograph');
    fs.mkdirSync(empty, { recursive: true });
    assert.strictEqual(G.readGraph(empty), null);
  });

  t('buildGraph refuses a nonexistent repoDir loudly', () => {
    assert.throws(() => G.buildGraph({ repoDir: path.join(tmp, 'does-not-exist') }), /does not exist/);
  });

  console.log(`\n${fail === 0 ? '✓' : '✗'} repo-graph: ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('HARNESS FAILURE:', e); process.exit(1); });
