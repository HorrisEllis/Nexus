'use strict';
/**
 * tests/modules/test-agent-tools-and-graph.test.js — v0.39.257
 * James: "the toolscope for the agents tab. need the full capabilities, with the /help and tool awareness to help.
 * need the commands as user friendly as possible. including debugging, using the intelligence system … also context
 * on by default and wire in the graph". Asked which tools: "i want everything, at least for now."
 *
 * Real code throughout, in the test sandbox (nothing reaches the real tree):
 *   A. lib/agent-tools — tool-root, the three file tools with a repo context, runToolLoop (context reaches the tool,
 *      scope enforced, a failed model call ends the run as a failure), tool-catalog over the LIVE registry;
 *      copilot/tool-runtime runViaAgent (identity, context, failure with jobId).
 *   B. lib/repo-context — the graph: connections for matched files; the project map when nothing matches.
 *   C. lib/repo-agent through idearium's real repo layer, with a stub copilot on :3750 recording what the dispatch
 *      sends: tools on ollama/guardian, scope all (default) vs project, none on auto; listTools; debugReport.
 *   D. The Agent tab's CLI helpers run from idearium/ui/js/app.js; copilot/server.js wiring (static).
 */
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
require('../../lib/test-sandbox.js').ensure();
process.env.NEXUS_INJECT_DIR = process.env.NEXUS_INJECT_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'at-inject-'));
const ROOT = path.resolve(__dirname, '..', '..');

let passed = 0, failed = 0;
async function test(id, d, fn) { try { await fn(); console.log(`  \u2713 ${id} ${d}`); passed++; } catch (e) { console.error(`  \u2717 ${id} ${d}\n    ${e.message}`); failed++; } }

// A small repo on disk, with a chunk index and a graph.json in the import pipeline's shapes.
function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'at-repo-'));
  const files = {
    'src/index.js': "const k = require('./kernel');\nconst f = require('./factory');\nk.boot(f);\n",
    'src/kernel.js': "exports.boot = function boot(factory) { return factory.spawn('genome'); };\n",
    'src/factory.js': "const k = require('./kernel');\nexports.spawn = function spawn(g) { return { organism: g }; };\n",
    'src/broken.js': 'function (\n',
    'README.md': '# eravos\n',
  };
  for (const [f, c] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), c); }
  fs.mkdirSync(path.join(dir, 'chunks'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'chunks', 'index.json'), JSON.stringify([
    { id: 'c1', file: 'src/kernel.js', range: { start_line: 1, end_line: 1 }, symbols: [{ name: 'boot' }] },
    { id: 'c2', file: 'src/factory.js', range: { start_line: 2, end_line: 2 }, symbols: [{ name: 'spawn' }] },
  ]));
  const f = (p) => `file:${p}`;
  fs.writeFileSync(path.join(dir, 'graph.json'), JSON.stringify({
    nodes: ['src/index.js', 'src/kernel.js', 'src/factory.js', 'src/broken.js', 'README.md'].map(p => ({ id: f(p), kind: 'file', file: p })),
    edges: [
      { from: f('src/index.js'), to: f('src/kernel.js'), target: 'src/kernel.js', relation: 'imports' },
      { from: f('src/index.js'), to: f('src/factory.js'), target: 'src/factory.js', relation: 'imports' },
      { from: f('src/factory.js'), to: f('src/kernel.js'), target: 'src/kernel.js', relation: 'imports' },
      { from: f('src/index.js'), to: null, target: './missing', relation: 'imports', line: 3 },
      { from: f('src/kernel.js'), to: f('src/index.js'), target: 'src/index.js', relation: 'depended_on_by' },
    ],
    edgeCount: 5, unresolvedCount: 1, generatedFrom: { fileCount: 5 },
  }));
  return dir;
}

(async () => {
  console.log('\n\u2B21  agent tools (everything, enforced), /help, /debug, the graph in context\n');
  const repoDir = makeRepo();

  // ── A. tools ─────────────────────────────────────────────────────────────
  const TR = require(path.join(ROOT, 'lib/agent-tools/tool-root.js'));
  await test('AT-01', 'tool-root: a run with a repo works in the repo; where:"nexus" works in NEXUS; where:"repo" with no repo is refused; nothing escapes', () => {
    assert.deepStrictEqual(TR.rootFor({}, { context: { repoDir } }), { root: path.resolve(repoDir), where: 'repo' });
    assert.strictEqual(TR.rootFor({ where: 'nexus' }, { context: { repoDir } }).where, 'nexus');
    assert.strictEqual(TR.rootFor({}, {}).where, 'nexus', 'no context → NEXUS, as before');
    assert.ok(TR.rootFor({ where: 'repo' }, {}).error);
    assert.strictEqual(TR.safeResolve(repoDir, '../../etc/passwd'), null);
  });

  const readFile = require(path.join(ROOT, 'lib/agent-tools/tools/query/read-file.js'));
  const fileTree = require(path.join(ROOT, 'lib/agent-tools/tools/query/file-tree.js'));
  const searchFiles = require(path.join(ROOT, 'lib/agent-tools/tools/query/search-files.js'));
  await test('AT-02', 'read_file / file_tree / search_files work in the project\'s own files by default, NEXUS on request, and refuse traversal', async () => {
    const ctx = { context: { repoDir } };
    const r1 = await readFile.execute({ path: 'src/kernel.js' }, ctx);
    assert.deepStrictEqual([r1.where, /exports\.boot/.test(r1.content)], ['repo', true], JSON.stringify(r1));
    const r2 = await readFile.execute({ path: 'package.json', where: 'nexus' }, ctx);
    assert.ok(r2.where === 'nexus' && /"name"/.test(r2.content));
    assert.ok(/outside the repo root/.test((await readFile.execute({ path: '../../../etc/passwd' }, ctx)).error));
    const t = await fileTree.execute({ path: 'src' }, ctx);
    assert.ok(t.where === 'repo' && t.entries.some(e => /kernel\.js/.test(JSON.stringify(e))), JSON.stringify(t).slice(0, 200));
    const s = await searchFiles.execute({ keyword: 'spawn' }, ctx);
    assert.deepStrictEqual([s.where, s.matches.map(m => m.path).filter(p => p.startsWith('src/')).sort()], ['repo', ['src/factory.js', 'src/kernel.js']]);
    const noCtx = await readFile.execute({ path: 'package.json' });
    assert.ok(/"name"/.test(noCtx.content), 'a call with no context reads NEXUS exactly as before');
  });

  const agentTools = require(path.join(ROOT, 'lib/agent-tools/index.js'));
  await test('AT-03', 'runToolLoop: the run\'s context reaches the tool, the scope is enforced, and a failed model call ends the run as a failure (reason + jobId)', async () => {
    let n = 0;
    const callModel = async () => (++n === 1 ? { text: '', toolCalls: [{ name: 'read_file', arguments: { path: 'src/kernel.js' } }, { name: 'delete_file', arguments: { path: 'x' } }] } : { text: 'done', toolCalls: null });
    const r = await agentTools.runToolLoop(callModel, 'sys', 'go', { allowedTools: ['read_file'], context: { repoDir } });
    assert.strictEqual(r.text, 'done');
    assert.ok(/exports\.boot/.test(r.toolCallLog[0].result.content), 'read_file read the repo through the context');
    assert.ok(r.toolCallLog[1].scopeRejected && /outside the allowed tool scope/.test(r.toolCallLog[1].result.error));
    const f = await agentTools.runToolLoop(async () => ({ text: '[x]', failed: true, error: 'stopped at gate 7/8 "reply appears"', jobId: 'j-9' }), 'sys', 'go', {});
    assert.deepStrictEqual([f.failed, f.error, f.jobId], [true, 'stopped at gate 7/8 "reply appears"', 'j-9']);
  });

  const TRt = require(path.join(ROOT, 'copilot/tool-runtime.js'));
  await test('AT-04', 'runViaAgent: the repo hat is the identity (not "the NEXUS co-pilot"); a round whose job stopped at a gate fails with guardian\'s reason and its jobId', async () => {
    const sent = [];
    const ok = await TRt.runViaAgent('chatgpt', async (p) => { sent.push(p); return { ok: true, text: 'the kernel boots the factory' }; }, 'what boots?',
      { identity: 'You are repo_abc, the project agent for "ERAVOS".', context: { repoDir }, maxIterations: 2 });
    assert.strictEqual(ok.text, 'the kernel boots the factory');
    assert.ok(/You are repo_abc, the project agent for "ERAVOS"\.\nYou are running as chatgpt/.test(sent[0]) && !/You are the NEXUS co-pilot/.test(sent[0]), sent[0].slice(0, 200));
    const bad = await TRt.runViaAgent('chatgpt', async () => ({ ok: false, error: 'stopped at gate 7/8 "reply appears" (chatgpt): no completion', jobId: 'job-7' }), 'q', { maxIterations: 2 });
    assert.deepStrictEqual([bad.failed, bad.jobId], [true, 'job-7']);
    assert.ok(/gate 7\/8/.test(bad.error));
  });

  const CAT = require(path.join(ROOT, 'lib/agent-tools/tool-catalog.js'));
  await test('AT-05', 'the catalog: every LIVE tool in a named group (none left in "Other"), plain summaries, search, scope marks', () => {
    const list = CAT.catalog({ tools: [...agentTools.TOOLS.values()], noteFor: require(path.join(ROOT, 'lib/agent-tools/tool-guide.js')).noteFor, scope: ['read_file'] });
    assert.strictEqual(list.length, agentTools.TOOLS.size);
    assert.deepStrictEqual(list.filter(t => t.group === 'other').map(t => t.name), []);
    assert.ok(list.every(t => t.summary && t.summary.length <= 230));
    assert.deepStrictEqual(list.filter(t => t.inScope).map(t => t.name), ['read_file']);
    assert.ok(CAT.search(list, 'compartment').every(t => /compartment/i.test(`${t.name} ${t.groupTitle} ${t.summary} ${t.use || ''}`)) && CAT.search(list, 'cos').length >= 7);
    const dbg = list.filter(t => t.group === 'debug').map(t => t.name);
    for (const n of ['intelligence_query', 'nexus_intelligence', 'diagnose', 'fault_log']) assert.ok(dbg.includes(n), `${n} not under Debugging`);
  });

  // ── B. the graph in context ──────────────────────────────────────────────
  const RC = require(path.join(ROOT, 'lib/repo-context.js'));
  await test('AT-06', 'context: a matched chunk comes with how its file connects (imports / imported by)', () => {
    const r = RC.retrieve({ repoDir, message: 'how does spawn work in the factory' });
    assert.ok(r.chunks.some(c => c.file === 'src/factory.js'));
    assert.ok(/## How these files connect/.test(r.block) && /src\/factory\.js imports src\/kernel\.js; imported by src\/index\.js/.test(r.block), r.block);
    assert.ok(r.graph && r.graph.connections >= 1);
  });
  await test('AT-07', 'context: "hello" (names no code) gets the project map from the graph instead of nothing', () => {
    const r = RC.retrieve({ repoDir, message: 'hello' });
    assert.strictEqual(r.chunks.length, 0);
    assert.ok(/## This project, from its graph/.test(r.block) && /5 files, 3 import links, 1 unresolved/.test(r.block), r.block);
    assert.ok(/entry points \(import others, nothing imports them\): src\/index\.js/.test(r.block) && /most depended on \(importers\): src\/kernel\.js \(2\)/.test(r.block));
    assert.ok(/the project map from its graph was given instead/.test(r.reason) && r.graph.overview === true);
    const noGraph = RC.retrieve({ repoDir: fs.mkdtempSync(path.join(os.tmpdir(), 'at-empty-')), message: 'hello' });
    assert.strictEqual(noGraph.block, '', 'no graph → still nothing, said as before');
  });

  // ── C. repo-agent through idearium's real repo layer ─────────────────────
  const RA = require(path.join(ROOT, 'lib/repo-agent.js'));
  const api = await import(path.join(ROOT, 'idearium', 'api', 'index.js'));
  const layer = api.getRepoLayer();
  let repoRec = null;
  for (let i = 0; i < 20; i++) {
    repoRec = layer.ingest({ name: `tools-${Date.now()}`, source: 'test', files: [{ path: 'src/a.js', content: 'const a = 1;\n' }] });
    if (!(repoRec && repoRec.error && /no spec-engine/.test(repoRec.error))) break;
    await new Promise(r => setTimeout(r, 250));
  }
  const repo = { ...(repoRec.repo || repoRec), compartmentId: 'cos.test.tools' };
  const U = repo.uuid;
  const bodies = [], gets = [], runs = [];
  const srv = await new Promise((res, rej) => {
    const s = http.createServer((q, r) => { let d = ''; q.on('data', c => d += c); q.on('end', () => {
      let b = {}; try { b = JSON.parse(d); } catch (_) {}
      r.writeHead(200, { 'Content-Type': 'application/json' });
      if (q.url === '/api/prompt/resolve') return r.end(JSON.stringify({ ok: true, provider: 'auto', backend: 'ollama', agent: null }));
      if (q.url === '/api/prompt') { bodies.push(b); return r.end(JSON.stringify({ ok: true, text: 'answer', provider_used: b.agent || b.backend, toolCallLog: [{ name: 'read_file', arguments: { path: 'src/a.js' }, ok: true }], tools: { scope: 'all', calls: 1 } })); }
      if (q.url.startsWith('/api/tools/list')) { gets.push(q.url); return r.end(JSON.stringify({ ok: true, total: 102, count: 1, tools: [{ name: 'read_file', groupTitle: 'Files & code', summary: 'Read a file.', inScope: true }] })); }
      if (q.url === '/api/tools/run') { runs.push(b); return r.end(JSON.stringify({ ok: true, name: b.name, result: { from: b.name } })); }
      r.end('{}');
    }); });
    s.on('error', rej); s.listen(3750, '127.0.0.1', () => res(s));
  }).catch(e => { console.log(`  ! cannot bind :3750 — ${e.message}`); return null; });
  if (!srv) { failed++; }
  else {
    // 0.39.266 — the default is 'harness': every tool still ALLOWED (scope 'all' on the wire, James: "everything"),
    // only the five registry-harness tools LISTED in the prompt ("thats way too much to inject when we have tools").
    await test('AT-08', 'a fresh compartment\'s tool scope is "harness": a guardian dispatch sends tools: every tool allowed, the hat as identity, this repo\'s dir', async () => {
      assert.strictEqual(RA.getToolScope(U), 'harness');
      RA.setProvider(U, 'chatgpt'); bodies.length = 0;
      const out = await RA.dispatch({ repo, repoDir, message: 'what boots the factory?', noContext: true });
      const b = bodies[0];
      assert.ok(b && b.tools, 'no tools on the dispatch');
      assert.deepStrictEqual([b.tools.scope, b.tools.repoDir, b.backend, b.agent], ['all', repoDir, 'guardian', 'chatgpt']);
      // 0.39.258 — the identity line is gone (a second persona nobody could edit); the dispatch is composed and the
      // tool-result frame is the repo's own editable block.
      assert.strictEqual(b.tools.identity, undefined, 'no identity line on a composed dispatch');
      assert.strictEqual(b.tools.composed, true);
      assert.strictEqual(b.tools.resultTemplate, require('../../lib/repo-prompt-blocks.js').DEFAULT_BLOCKS.find(x => x.id === 'tool-result').text);
      assert.deepStrictEqual([out.ok, out.toolCalls[0].name], [true, 'read_file']);
      assert.strictEqual(b.tools.repoUuid, U, '0.39.266 — the harness tools learn their repo from the context');
      assert.ok(!/\{tools\}|\{tool_guide\}/.test(b.prompt), 'harness: the tool placeholders are filled before copilot sees them');
    });
    await test('AT-09', '/scope project sends the hat\'s own list (enforced); ollama gets tools too; auto resolves through copilot and gets them as well (0.39.258)', async () => {
      assert.strictEqual(RA.setToolScope(U, 'nope').ok, false);
      RA.setToolScope(U, 'project'); bodies.length = 0;
      await RA.dispatch({ repo, repoDir, message: 'hi', noContext: true });
      const hat = RA.status({ repo, repoDir }).hat;
      assert.deepStrictEqual(bodies[0].tools.scope, hat.toolScope);
      RA.setToolScope(U, 'all'); RA.setProvider(U, 'ollama'); bodies.length = 0;
      await RA.dispatch({ repo, repoDir, message: 'hi', noContext: true });
      assert.strictEqual(bodies[0].tools.scope, 'all');
      RA.setProvider(U, 'auto'); bodies.length = 0;
      await RA.dispatch({ repo, repoDir, message: 'hi', noContext: true });
      // 0.39.258 — auto resolves through copilot to a named backend, so it runs the enforced, composed tool loop too
      assert.deepStrictEqual([bodies[0].backend, bodies[0].tools && bodies[0].tools.composed], ['ollama', true]);
      assert.deepStrictEqual([RA.status({ repo, repoDir }).toolScopeEnforced, RA.settingsView(U).toolScope], [true, 'all']);
      RA.setProvider(U, 'chatgpt');
      assert.strictEqual(RA.status({ repo, repoDir }).toolScopeEnforced, true);
    });
    await test('AT-10', 'listTools: copilot\'s catalog, with this compartment\'s scope passed and reported', async () => {
      RA.setToolScope(U, 'project'); gets.length = 0;
      const r = await RA.listTools({ repo, q: 'read file' });
      assert.ok(r.ok && r.scope === 'project' && r.enforced === true);
      assert.ok(/q=read\+file/.test(gets[0]) && /scope=read_file/.test(gets[0]), gets[0]);
      RA.setToolScope(U, 'all');
      await RA.listTools({ repo });
      assert.ok(!/scope=/.test(gets[1]), 'scope all sends no scope list');
    });
    await test('AT-11', '/debug report: syntax (the broken file named), unresolved imports from the graph, this agent\'s failures, and the intelligence system — each saying its source', async () => {
      runs.length = 0;
      const r = await RA.debugReport({ repo, repoDir });
      const by = Object.fromEntries(r.sections.map(s => [s.title, s]));
      assert.ok(by['Syntax (node --check)'].ok === false && by['Syntax (node --check)'].lines.some(l => /src\/broken\.js/.test(l)), JSON.stringify(by['Syntax (node --check)']));
      assert.ok(by['Graph (imports)'].ok === false && by['Graph (imports)'].lines.some(l => /src\/index\.js:3 → \.\/missing/.test(l)));
      assert.deepStrictEqual(runs.map(x => x.name), ['intelligence_query', 'fault_log', 'diagnose']);
      assert.ok(runs.every(x => x.context && x.context.repoDir === repoDir));
      assert.strictEqual(runs[1].args.component, RA.agentIdFor(U));
      assert.ok(by['Failure patterns'].source === 'intelligence system (intelligence_query)');
    });
    srv.close();
  }

  // ── D. the Agent tab and copilot wiring ──────────────────────────────────
  const app = fs.readFileSync(path.join(ROOT, 'idearium/ui/js/app.js'), 'utf8');
  const grab = (re, what) => { const m = app.match(re); if (!m) throw new Error(`no ${what} in app.js`); return m[0]; };
  const ui = new Function(`${grab(/^const AGENT_CLI_HELP = \[[\s\S]*?\]\.join\('\\n'\);$/m, 'AGENT_CLI_HELP')}
    ${grab(/^const AGENT_CLI_ALIASES = .*$/m, 'ALIASES')}
    ${grab(/^const AGENT_CLI_COMMANDS = \[[\s\S]*?\];$/m, 'COMMANDS')}
    ${grab(/^function _agentClosest\([\s\S]*?\n\}\n/m, '_agentClosest')}
    ${grab(/^const AGENT_DEBUG_DIRECTIVE = .*$/m, 'DEBUG_DIRECTIVE')}
    ${grab(/^function _agentToolsText\([\s\S]*?\n\}\n/m, '_agentToolsText')}
    return { AGENT_CLI_HELP, AGENT_CLI_ALIASES, AGENT_CLI_COMMANDS, _agentClosest, AGENT_DEBUG_DIRECTIVE, _agentToolsText };`)();
  await test('AT-12', 'the Agent tab CLI: every command in /help is handled; aliases; a typo suggests the closest; /tools groups; /debug <q> asks the agent to use the intelligence system', () => {
    for (const c of ui.AGENT_CLI_COMMANDS) {
      assert.ok(new RegExp(`/${c}\\b`).test(ui.AGENT_CLI_HELP), `/help does not mention /${c}`);
      assert.ok(new RegExp(`case '${c}'`).test(app), `agentCommand does not handle /${c}`);
    }
    assert.deepStrictEqual([ui.AGENT_CLI_ALIASES.dbg, ui.AGENT_CLI_ALIASES.t, ui.AGENT_CLI_ALIASES['?']], ['debug', 'tools', 'help']);
    assert.deepStrictEqual([ui._agentClosest('tols'), ui._agentClosest('degub'), ui._agentClosest('statsu'), ui._agentClosest('zzzzzzz')], ['tools', 'debug', 'status', null]);
    const txt = ui._agentToolsText({ tools: [{ name: 'read_file', groupTitle: 'Files & code', summary: 'Read a file.', use: 'before editing', inScope: true }, { name: 'cos_vault', groupTitle: 'Compartments (COS)', summary: 'Vault.', inScope: false }] });
    assert.ok(/^FILES & CODE\n {4}read_file +Read a file\.\n {6}when: before editing\n\nCOMPARTMENTS \(COS\)\n  ✗ cos_vault/.test(txt), txt);
    assert.ok(/intelligence_query, nexus_intelligence, diagnose, fault_log/.test(ui.AGENT_DEBUG_DIRECTIVE('why does boot fail')));
    assert.ok(!/toolScope is not enforced on this path/.test(app), 'the old "not enforced" footer is gone');
  });
  await test('AT-13', 'copilot/server.js: /api/prompt runs the tool loop when body.tools is sent (scope enforced, identity, repoDir), and serves /api/tools/list and /api/tools/run', () => {
    const s = fs.readFileSync(path.join(ROOT, 'copilot/server.js'), 'utf8');
    assert.ok(/if \(body\.tools && typeof body\.tools === 'object'\)/.test(s));
    // 0.39.258 — composed callers get no identity; composed + resultTemplate travel to the loop
    assert.ok(/toolRuntime\.runViaAgent\(agent, dispatchToAgent, prompt, \{ toolScope: scope, identity: composed \? null : identity, context, maxIterations, composed, resultTemplate(, maxToolErrors, onToolCall)? \}\)/.test(s));   // §CT6/CT8 0.39.352 — the cap and the live reporter ride along
    assert.ok(/toolRuntime\.run\(\{ userPrompt: prompt, identity: composed \? null : identity, context, toolScope: scope, maxIterations, composed, resultTemplate,/.test(s));
    assert.ok(/if \(loop\.failed\) \{ json\(res, 502, \{ ok: false, error: loop\.error, (\.\.\.\(loop\.toolErrors \? \{ toolErrors: true \} : \{\}\), )?jobId: loop\.jobId/.test(s), 'a failed round must keep its jobId (the late watch needs it)');
    assert.ok(/p === '\/api\/tools\/list'/.test(s) && /p === '\/api\/tools\/run'/.test(s));
    assert.ok(/is outside this caller's tool scope — not run/.test(s));
  });

  console.log(`\n  ${passed} passed \u00B7 ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
