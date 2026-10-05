'use strict';
// §SANDBOX 2026-09-25 — this test starts real NEXUS processes; they inherit a throwaway data root from here (lib/test-sandbox.js).
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-file-tree-plan.js
 * §2026-09-21 — file tree first (James: "the file tree needs to be generated
 * first with the list of files, the kernel, engine and runtime... all the
 * templates from cos available for the promote to spec menu"), plus the two
 * defects his boot log showed: chunk failures that gave no reason, and a
 * stalled spec re-reported every 15s forever.
 *
 * Real modules throughout: the COS registries, the real spec-engine (under a
 * temp IDEARIUM_DATA_DIR), and the real WARP cascade with a generator that
 * fails the way a missing provider tab does.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
process.env.IDEARIUM_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ftp-idearium-'));
process.env.NEXUS_FILETREE_DIR = path.join(process.env.IDEARIUM_DATA_DIR, 'filetree');

let pass = 0, fail = 0;
function check(n, c, d = '') { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } }

async function run() {
  console.log('\ntest-file-tree-plan\n');
  const P = require(path.join(ROOT, 'lib', 'file-tree-plan.js'));
  const A = require(path.join(ROOT, 'cos', 'archetype', 'index.js'));
  const B = require(path.join(ROOT, 'cos', 'blueprint', 'index.js'));

  // ── every COS template is offered, read live ──
  const cos = P.listCosTemplates();
  check('every COS archetype is offered', cos.filter(t => t.source === 'cos-archetype').length === A.listArchetypes().length);
  check('every COS blueprint is offered', cos.filter(t => t.source === 'cos-blueprint').length === B.listBlueprints().length);
  check('COS entries use the picker\'s own shape (id, label, description)', cos.every(t => t.id && t.label && typeof t.description === 'string'));
  check('COS ids are namespaced so they never collide with spec-document templates', cos.every(t => P.isCosTemplate(t.id)));

  // ── a COS archetype yields real files, {{name}} substituted ──
  const ag = P.fromCosTemplate('cos-archetype:ai-agent', { name: 'drumpad' });
  check('an archetype yields its real files', ag.ok && ['agent.js', 'system-prompt.txt', 'tools.json', '.env.example'].every(p => ag.files.some(f => f.path === p)));
  check('template content is carried, with {{name}} substituted', ag.files.every(f => typeof f.content === 'string') && !ag.files.some(f => /\{\{name\}\}/.test(f.content)));
  const fsA = P.fromCosTemplate('cos-blueprint:fullstack-app', { name: 'drumpad' });
  check('a blueprint lays out one directory per role', fsA.ok && ['frontend/', 'api/', 'db/'].every(d => fsA.files.some(f => f.path.startsWith(d))));
  check('a blueprint file carries its role\'s stated purpose', fsA.files.some(f => /Serves the user-facing UI/.test(f.purpose)));
  check('an unknown COS template is refused, not guessed', P.fromCosTemplate('cos-archetype:nope').ok === false);

  // ── §BUILT 2026-09-21 — eravos mods offered the same way, read live ──
  const realMods = fs.readdirSync(path.join(ROOT, 'eravos', 'ui', 'mods'), { withFileTypes: true })
    .filter(d => d.isDirectory() && fs.existsSync(path.join(ROOT, 'eravos', 'ui', 'mods', d.name, 'schema', 'schema.json'))).map(d => d.name);
  const eros = P.listEravosMods();
  check('every real, complete eravos mod is offered', eros.length === realMods.length && realMods.every(n => eros.some(t => t.name === n)));
  check('nexus-shared is excluded — no schema.json, not itself a spawnable mod', !eros.some(t => t.name === 'nexus-shared'));
  check('eravos ids are namespaced so they never collide with COS or spec-document ids', eros.every(t => P.isEravosMod(t.id) && !P.isCosTemplate(t.id)));
  check('isFileTreeTemplate covers both real catalogs', P.isFileTreeTemplate('cos-archetype:ai-agent') && P.isFileTreeTemplate(eros[0].id) && !P.isFileTreeTemplate('00-meta'));
  const modR = P.fromEravosMod('eravos-mod:sample-player', { name: 'my-daw' });
  check('a mod yields its real two files (schema + engine)', modR.ok && modR.files.some(f => f.path === 'schema/schema.json') && modR.files.some(f => f.path === 'sample-player.engine.js'));
  check('the schema file lands as runtime, the engine file as engine — layerFor is not duplicated for mods', modR.files.find(f => f.path === 'schema/schema.json').layer === 'runtime' && modR.files.find(f => f.path.endsWith('.engine.js')).layer === 'engine');
  check('an unknown eravos mod is refused, not guessed', P.fromEravosMod('eravos-mod:nope').ok === false);
  const modClash = await P.plan({ name: 'x', templateIds: ['eravos-mod:sample-player', 'cos-archetype:ai-agent'], ask: null });
  check('a mod and a COS template merge in one plan() call when their files do not clash', modClash.ok && modClash.template.kind === 'combined');

  // ── layering of template files ──
  check('tests → test', P.layerFor('test/index.test.js') === 'test');
  check('entrypoints and config → runtime', ['index.js', 'package.json', '.env.example', 'api/server.js'].every(p => P.layerFor(p) === 'runtime'));
  check('other template code → engine (kernel is never invented)', P.layerFor('processor.js') === 'engine' && P.layerFor('queue.js') === 'engine');

  // ── parsing the agent's plan ──
  const good = P.parsePlan('Sure!\n```json\n[{"path":"src/kernel/pattern.js","layer":"kernel","purpose":"step grid"},{"path":"src/engine/sequencer.js","layer":"engine","purpose":"plays patterns"}]\n```');
  check('a fenced/prose-wrapped JSON plan is read', good.files.length === 2 && good.files[0].layer === 'kernel');
  const bad = P.parsePlan('[{"path":"../x.js","layer":"kernel"},{"path":"a.js","layer":"middleware"},{"path":"b.js","layer":"engine"},{"path":"b.js","layer":"engine"}]');
  check('unsafe paths, unknown layers and duplicates are rejected with reasons',
    bad.files.length === 1 && bad.rejected.length === 3 && bad.rejected.every(r => r.reason));
  check('a reply with no JSON is reported, not thrown', P.parsePlan('I cannot do that').rejected[0].reason.includes('no JSON array'));

  // ── plan(): template + agent ──
  let asked = null;
  const ask = async (prompt) => { asked = prompt; return JSON.stringify([
    { path: 'src/kernel/pattern.js', layer: 'kernel', purpose: 'the step grid' },
    { path: 'src/engine/sequencer.js', layer: 'engine', purpose: 'plays patterns' },
    { path: 'agent.js', layer: 'runtime', purpose: 'agent entry (template has it)' },
    { path: 'test/sequencer.test.js', layer: 'test', purpose: 'sequencer tests' },
  ]); };
  const pl = await P.plan({ name: 'drumpad', description: 'a DAW for my drumpad', templateIds: ['cos-archetype:ai-agent'], ask });
  check('plan succeeds from template + agent', pl.ok && pl.planSource === 'template + agent', JSON.stringify(pl.errors));
  check('the agent is told the template files and the four layers', /agent\.js \[runtime\]/.test(asked) && /kernel:/.test(asked) && /engine:/.test(asked) && /runtime:/.test(asked));
  check('a template file wins a path clash — its real content is kept', pl.files.find(f => f.path === 'agent.js').content !== null);
  check('files are ordered kernel → engine → runtime → test', pl.files.map(f => P.LAYER_ORDER[f.layer]).every((v, i, a) => i === 0 || a[i - 1] <= v));

  const noAgent = await P.plan({ name: 'x', templateIds: ['cos-archetype:ai-agent'], ask: async () => { throw new Error('chatgpt tab not connected'); } });
  check('agent unreachable → template files only, and the reason is reported', noAgent.ok && noAgent.planSource === 'template only' && /tab not connected/.test(noAgent.agentError));
  const nothing = await P.plan({ name: 'x', ask: async () => 'nope' });
  check('no template and no usable plan → refused, never padded with an invented skeleton', nothing.ok === false);
  const clash = await P.plan({ name: 'x', templateIds: ['cos-archetype:web-server', 'cos-archetype:api-server'], ask: null });
  check('two COS templates writing the same path are refused with both named', clash.ok === false && /index\.js is provided by both/.test(clash.errors[0]));

  // ── the spec: chunks ARE the files ──
  const se = await import(path.join(ROOT, 'idearium', 'spec-engine', 'index.js'));
  const m = se.createFileTreeSpec({ name: 'drumpad', description: 'a DAW', plan: pl });
  check('the spec is a file tree, not document sections', m.type === 'filetree' && !m.chunks.some(c => c.sectionId === 'axioms'));
  check('every planned file is a chunk with its real path', pl.files.every(f => m.chunks.some(c => c.realPath === f.path)));
  check('NO markdown plan file in the tree', !m.chunks.some(c => /\.md$/i.test(c.realPath || '')));
  check('the plan lives on the manifest as data', m.fileTree.files.length === pl.files.length);
  const nodeFile = P.writeTreeNode(m);
  const NX = require(path.join(ROOT, 'lib', 'node-export.js'));
  const env = NX.importFromFile(nodeFile);
  check('the plan is a .filetree NODE', /\.filetree$/.test(nodeFile) && env.type === 'filetree' && env.payload.layers.kernel.length === 1);
  check('the node records bottom-up build order', JSON.stringify(env.payload.buildOrder) === JSON.stringify(['kernel', 'engine', 'runtime', 'test']));
  const onDisk = fs.readdirSync(path.join(process.env.IDEARIUM_DATA_DIR, 'specs', m.uuid));
  check('completed file chunks are stored under their real extension, not .md', onDisk.some(f => /agent-js-[0-9a-f]{8}\.js$/.test(f)) && !onDisk.some(f => /agent-js.*\.md$/.test(f)));
  const agentJs = m.chunks.find(c => c.realPath === 'agent.js');
  check('template files are complete at creation with their exact bytes', agentJs.status === 'complete' && agentJs.content === pl.files.find(f => f.path === 'agent.js').content);
  check('agent-planned files start pending', m.chunks.find(c => c.realPath === 'src/kernel/pattern.js').status === 'pending');
  const seq = m.chunks.find(c => c.realPath === 'src/engine/sequencer.js');
  const kern = m.chunks.find(c => c.realPath === 'src/kernel/pattern.js');
  check('engine waits on the kernel (bottom-up, via the existing dependsOn gate)', seq.dependsOn.includes(kern.sectionId));
  check('the next buildable file is a kernel file, not engine', se.nextPendingChunk(m.uuid).realPath === 'src/kernel/pattern.js');
  check('the layer summary is recorded on the spec', m.fileTree && m.fileTree.layers.kernel === 1 && m.fileTree.layers.engine === 1);

  const prompt = se.buildChunkPrompt(se.loadSpec(m.uuid), seq);
  check('a file chunk is asked for the FILE, not a "section of a spec"', prompt.includes('Write the complete file `src/engine/sequencer.js`') && !prompt.includes('section of a NEXUS component spec'));
  check('the file prompt carries its layer, the rules, and the tree', prompt.includes('Layer: engine') && prompt.includes('may only depend on its own layer') && prompt.includes('THE FILE TREE') && prompt.includes('src/kernel/pattern.js [kernel]'));
  se.completeChunk(m.uuid, kern.uuid, 'export const STEPS = 16;\n', { preserveWhitespace: true });
  const prompt2 = se.buildChunkPrompt(se.loadSpec(m.uuid), seq);
  check('once the kernel is built, the engine file is shown it', prompt2.includes('export const STEPS = 16;'));
  check('after the kernel is built, the engine file becomes buildable', se.nextPendingChunk(m.uuid).realPath === 'src/engine/sequencer.js');

  const doc = se.createSpec({ name: 'doc-spec', type: 'system' });
  check('document-section specs are unchanged', doc.type === 'system' && doc.chunks.some(c => c.sectionId === 'axioms') && !doc.chunks.some(c => c.file));
  const docPrompt = se.buildChunkPrompt(doc, doc.chunks[1]);
  // §0.39.305 SB3 — the document prompt was rewritten domain-agnostic on purpose (it was "section of a NEXUS component
  // spec"); what this guards is unchanged: a document section gets the document prompt, never the file prompt.
  check('document chunks keep the document prompt', docPrompt.includes('one section of the specification for') && !/write the complete file/i.test(docPrompt));

  // ── failures say why ──
  const { createWarpDispatch } = require(path.join(ROOT, 'lib', 'seam', 'adapters', 'warp-cascade.js'));
  const { FlatFileCrystallizer } = require(path.join(ROOT, 'warp', 'plugins', 'crystallizer-flatfile.js'));
  const { PopulationStore } = require(path.join(ROOT, 'warp', 'dispatch', 'population.js'));
  const d = createWarpDispatch({ generate: async (prov) => { throw new Error(`${prov} tab not connected`); },
    crystallizer: new FlatFileCrystallizer({ path: path.join(process.env.IDEARIUM_DATA_DIR, 'c.json') }), population: new PopulationStore({ maxPerClass: 8 }), maxAttempts: 3 });
  const r = await d({ seam_uuid: `t:${Date.now()}`, seam_id: 't', description: 't', preferredProvider: 'claude', contract: { exports: [] } }, [{ id: 'x', severity: 'hard', check: () => true }]);
  check('a failed cascade still reports its attempt count (existing callers unchanged)', r.ok === false && r.attempts === 3);
  check('…and now carries each attempt\'s provider and error', Array.isArray(r.attemptLog) && r.attemptLog.length === 3 && r.attemptLog[0].provider === 'claude' && /tab not connected/.test(r.attemptLog[0].error));
  const WBD = fs.readFileSync(path.join(ROOT, 'idearium', 'spec-engine', 'warp-build-dispatch.js'), 'utf8');
  check('the chunk failure message includes the per-attempt reasons', /attemptLog[\s\S]{0,400}a\.provider[\s\S]{0,200}a\.error/.test(WBD));

  // ── routes + stall reporting (structural: they live inside the running server) ──
  const API = fs.readFileSync(path.join(ROOT, 'idearium', 'api', 'index.js'), 'utf8');
  // §BUILT 2026-09-21 — updated: the route now also merges eravos mods.
  check('the templates route merges COS templates AND eravos mods into the picker list', /\[\.\.\.se\.listTemplates\(\), \.\.\.cos, \.\.\.eros\]/.test(API));
  check('spec creation treats an eravos-mod id the same as a COS id — the file-tree path, not the document-section path', /isFileTreeTemplate\(id\)/.test(API));
  check('create branches to a file-tree spec for a COS template, an eravos mod, or fileTree:true', /body\.fileTree === true \|\| fileTreeIds\.length/.test(API) && /createFileTreeSpec\(/.test(API));
  check('the plan goes through the same WARP dispatch the build uses', /getWarpChunkDispatch\(\)[\s\S]{0,300}chunkTitle: `plan: \$\{name\}`/.test(API));
  // §STABILITY 2026-09-21 — this assertion pinned the OLD stall check
  // (keyed on "any chunk pending", so a failed kernel file with pending
  // DEPENDENTS still read as buildable and re-triggered every tick
  // forever). Deliberately updated to the fixed pattern, found stale by
  // this exact suite failing when run as part of the full 307-suite pass
  // rather than in isolation — a real gap in the 0.39.204 regression
  // check, not a false alarm.
  check('the poller keys on the FULL chunk-status signature, not just "any pending"', /fullSig = chunks\.map\(c => `\$\{c\.uuid\}:\$\{c\.status\}`\)\.join\('\|'\)/.test(API));
  check('a stalled spec is skipped until a chunk changes state or the retry window elapses', /prior\.sig === fullSig && \(Date\.now\(\) - prior\.ts\) < STALL_RETRY_MS\) continue/.test(API));

  // ── UI ──
  const HTML = fs.readFileSync(path.join(ROOT, 'idearium', 'ui', 'index.html'), 'utf8');
  const APP = fs.readFileSync(path.join(ROOT, 'idearium', 'ui', 'js', 'app.js'), 'utf8');
  check('the picker has a file-tree-first switch, on by default', /id="ns-file-tree" checked/.test(HTML));
  check('the picker groups COS archetypes, COS blueprints and document templates', APP.includes("'cos-archetype'") && APP.includes("'cos-blueprint'") && APP.includes('spec-document templates'));
  // §0.39.282 — James, 0.39.267: "the eravos options need to be removed from this prompt." The picker leaves them out;
  // GET /api/spec-engine/templates?include=eravos still lists them.
  check('the New Spec modal leaves eravos mods out (0.39.267), the templates API still offers them on request', !/Eravos mods/.test(APP) && /t\.source !== 'eravos-mod'/.test(APP));
  check('create sends fileTree and waits long enough for a real plan', /fileTree \}\),\s*\}, fileTree \? 180000/.test(APP));

  // One unparseable schema takes the whole tool registry down ("tool registry
  // unavailable"), which is how a comma in schema.filetree's first draft broke
  // four unrelated suites. Every schema must parse.
  const yaml = require('js-yaml');
  const badSchemas = [];
  for (const d of ['lib/node-schemas', 'guardian/schemas', 'ollama/schemas']) {
    const dir = path.join(ROOT, d); if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) if (f.startsWith('schema.')) { try { yaml.load(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { badSchemas.push(`${d}/${f}`); } }
  }
  check('every node schema parses as YAML', badSchemas.length === 0, badSchemas.join(', '));
  check('schema.filetree exists and is REAL', /status: REAL/.test(fs.readFileSync(path.join(ROOT, 'lib', 'node-schemas', 'schema.filetree'), 'utf8')));

  fs.rmSync(process.env.IDEARIUM_DATA_DIR, { recursive: true, force: true });
  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exitCode = fail === 0 ? 0 : 1;
  setTimeout(() => process.exit(process.exitCode), 200);
}
run().catch(e => { console.log('  ! crashed:', e.stack); process.exit(1); });
