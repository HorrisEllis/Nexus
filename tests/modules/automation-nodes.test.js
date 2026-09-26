'use strict';
// §SANDBOX — workflows, macros (JAA), node files under a throwaway root (lib/test-sandbox.js).
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/automation-nodes.test.js — §0.39.266
 *
 * James: "make the macros and workflow automation, exportable node types.
 * .macro, and maybe .workflow or .framework?"
 *
 * A workflow that runs a macro and calls a sub-workflow (which runs another
 * macro) is exported as ONE .workflow node file, then imported on "another
 * machine" (everything deleted first) and actually run: the macros and the
 * sub-workflow come with it and the steps point at them. Name clashes,
 * re-imports, the older JSON format, the library folder, the wire routes and
 * the macro tool's own .macro export/import.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const NX = require(path.join(ROOT, 'lib/node-export.js'));
const SCHEMAS = require(path.join(ROOT, 'lib/node-schemas.js'));
const N = require(path.join(ROOT, 'clear-glass/src/automation/nodes.js'));
const ROUTES = require(path.join(ROOT, 'clear-glass/src/automation/routes.js'));
const { AutomationEngine, WORKFLOWS_DIR, RUNS_DIR, NODES_DIR } = require(path.join(ROOT, 'clear-glass/src/mesh/automation-engine.js'));

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack}`); failed++; }
}
const clean = () => { for (const d of [WORKFLOWS_DIR, RUNS_DIR, NODES_DIR]) try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} };

/** an in-memory macro store with the macro tool's get/create answers */
function macroStore(seed = {}) {
  const m = new Map(Object.entries(seed));
  return {
    m,
    getMacro: async (name) => (m.has(name) ? { ok: true, macro: m.get(name) } : { error: `no macro named "${name}"` }),
    createMacro: async (x) => { if (m.has(x.name)) return { error: 'exists' }; const row = { uuid: `u-${m.size}`, ...x, params: x.params || [], createdAt: 1, runCount: 0 }; m.set(x.name, row); return { ok: true, macro: row }; },
  };
}
const LOGIN = { uuid: 'mac-1', name: 'login', urlPattern: '*://work.test/*', steps: [{ action: 'navigate', data: { url: 'https://work.test/login' } }, { action: 'type', data: { selector: '#pw', text: '{{password}}' } }], params: ['password'], profile: null, description: 'sign in', createdAt: 5, runCount: 3, lastRunAt: 9 };
const APPLY = { uuid: 'mac-2', name: 'apply', urlPattern: null, steps: [{ action: 'click', data: { selector: '.apply' } }], params: [], createdAt: 6, runCount: 0, lastRunAt: null };

(async () => {

await test('NODE-01', '.workflow is a registered node type with a REAL schema; .macro was already one', () => {
  assert.ok(NX.KNOWN_TYPES.includes('workflow') && NX.KNOWN_TYPES.includes('macro'));
  assert.strictEqual(SCHEMAS.get('workflow').status, 'REAL');
  assert.deepStrictEqual(Object.keys(SCHEMAS.get('workflow').fields).filter(k => SCHEMAS.get('workflow').fields[k].required).sort(), ['format', 'name', 'requires', 'steps', 'uuid', 'version']);
});

let text;
await test('NODE-02', 'a workflow exports as ONE .workflow YAML node — header, tags, fingerprint, bundled macros and sub-workflows, no secrets', async () => {
  clean();
  const e = new AutomationEngine({});
  const S = macroStore({ login: LOGIN, apply: APPLY });
  const sub = e.create({ name: 'Apply to one', steps: [{ type: 'macro', config: { name: 'apply' } }, { type: 'log', config: { message: 'applied {{vars.url}}' } }] }).workflow;
  const wf = e.create({ name: 'Job run', description: 'Sign in, then apply', vars: { url: 'x' }, settings: { concurrency: 'queue' }, status: 'active', steps: [
    { type: 'trigger', config: { cron: '0 9 * * 1-5' } }, { type: 'trigger', config: { webhook: true } },
    { id: 'm', type: 'macro', label: 'Sign in', retry: { count: 2, delayMs: 10 }, config: { name: 'login', params: { password: 'pw' } } },
    { id: 'c', type: 'condition', config: { left: '{{last}}', op: 'exists', onTrue: 'w', onFalse: 'stop' } },
    { id: 'w', type: 'workflow', saveAs: 'res', config: { workflow: sub.id, vars: { url: '{{vars.url}}' } } },
    { type: 'macro', config: { name: 'ghost' } }] }).workflow;
  const token = wf.steps[1].config.token;
  const n = await N.workflowNode(e, wf.id, { getMacro: S.getMacro, tags: ['jobs'] });
  assert.strictEqual(n.ok, true);
  assert.strictEqual(n.filename, 'job-run.workflow');
  assert.deepStrictEqual(n.missing, ['macro “ghost”']);
  text = n.text;
  assert.ok(!text.includes(token), 'the webhook secret never leaves');
  const doc = NX.fromYaml(text);
  assert.strictEqual(doc.type, 'workflow'); assert.strictEqual(doc.id, wf.id); assert.strictEqual(doc.system, 'clear-glass.automation');
  assert.strictEqual(doc.intent, 'Sign in, then apply');
  assert.match(doc.summary, /^4 steps; runs cron, webhook; bundles 2 macros; bundles 1 workflow$/);
  for (const t of ['workflow', 'jobs', 'trigger:cron', 'trigger:webhook', 'step:macro', 'step:workflow', 'step:condition']) assert.ok(doc.tags.includes(t), t);
  assert.ok(/^[0-9a-f]{16}$/.test(doc.fingerprint));
  assert.deepStrictEqual(doc.payload.requires.macros.map(m => m.name).sort(), ['apply', 'login']);
  assert.strictEqual(doc.payload.requires.workflows[0].ref, sub.id);
  assert.deepStrictEqual(SCHEMAS.checkPayload('workflow', doc.payload), { ok: true, missing: [], wrongType: [] });
  assert.deepStrictEqual(SCHEMAS.checkPayload('macro', doc.payload.requires.macros[0]), { ok: true, missing: [], wrongType: [] });
  assert.strictEqual(N.workflowFingerprint(e.get(wf.id).steps), doc.fingerprint);
});

await test('NODE-03', 'imported on another machine it runs: macros and the sub-workflow come with it, every reference re-pointed', async () => {
  clean();   // "another machine": nothing here
  const e = new AutomationEngine({});
  const S = macroStore();
  const ran = [];
  e.setHooks({ runMacroFn: async ({ name }) => { ran.push(name); return { ok: true }; } });
  const r = await N.importNode(e, text, S);
  assert.strictEqual(r.ok, true, r.error);
  assert.deepStrictEqual(r.macros.map(m => [m.name, m.reused]).sort(), [['apply', false], ['login', false]]);
  assert.strictEqual(r.workflows.length, 1);
  assert.ok(r.warnings.some(w => /macro “ghost” is not in the file and not on this machine/.test(w)));
  assert.strictEqual(S.m.get('login').params[0], 'password'); assert.strictEqual(S.m.get('login').urlPattern, '*://work.test/*');
  const wf = r.workflow;
  assert.strictEqual(wf.status, 'paused');
  assert.ok(wf.steps[1].config.token && wf.steps[1].config.token.length > 10, 'a fresh webhook secret');
  const subId = r.workflows[0].id;
  assert.strictEqual(wf.steps.find(s => s.type === 'workflow').config.workflow, subId);
  assert.strictEqual(wf.steps.find(s => s.type === 'condition').config.onTrue, wf.steps.find(s => s.type === 'workflow').id, 'branches point at the copy’s own steps');
  assert.deepStrictEqual(wf.steps.find(s => s.label === 'Sign in').retry, { count: 2, delayMs: 10 });
  e.updateStep(wf.id, wf.steps[5].id, { enabled: false });   // the macro that was never bundled
  const run = await e.run(wf.id);
  assert.strictEqual(run.ok, true, run.error);
  assert.deepStrictEqual(ran, ['login', 'apply']);
  assert.strictEqual(run.vars.res.url, 'x', 'the sub-workflow got the value and handed its variables back');
  assert.ok(e.getRun(run.runId).steps.some(s => s.type === 'workflow' && s.status === 'ok'));
  // importing the same file again finds it; asked to, it makes a second copy
  const again = await N.importNode(e, text, S);
  assert.strictEqual(again.existing, true); assert.strictEqual(e.list().filter(w => w.name === 'Job run').length, 1);
  const dup = await N.importNode(e, text, { ...S, allowDuplicate: true });
  assert.strictEqual(dup.ok, true);
  assert.ok(dup.macros.every(m => m.reused), 'identical macros are reused, not duplicated');
  assert.strictEqual(dup.workflows[0].name, 'Apply to one (imported)');
  assert.strictEqual(S.m.size, 2);
});

await test('NODE-04', 'a macro name taken by a DIFFERENT macro: the bundled one arrives as “<name> (imported)” and the step runs it', async () => {
  clean();
  const e = new AutomationEngine({});
  const S = macroStore({ login: { ...LOGIN, steps: [{ action: 'reload', data: {} }] } });
  const r = await N.importNode(e, text, S);
  assert.strictEqual(r.ok, true);
  assert.ok(r.macros.some(m => m.from === 'login' && m.name === 'login (imported)' && !m.reused));
  assert.strictEqual(r.workflow.steps.find(s => s.label === 'Sign in').config.name, 'login (imported)');
  assert.deepStrictEqual(S.m.get('login').steps, [{ action: 'reload', data: {} }], 'the one already here is untouched');
});

await test('NODE-05', '.macro nodes: export, parse, import (reuse / rename); wrong types and junk are refused plainly', async () => {
  const n = N.macroNode(LOGIN, { tags: ['auth'] });
  assert.strictEqual(n.filename, 'login.macro');
  const doc = N.parse(n.text);
  assert.strictEqual(doc.type, 'macro'); assert.strictEqual(doc.payload.name, 'login');
  assert.ok(doc.tags.includes('auth') && doc.tags.includes('step:navigate') && doc.tags.includes('step:type'));
  assert.match(doc.summary, /2 browser steps for \*:\/\/work\.test\/\*; asks for password/);
  const e = new AutomationEngine({});
  const S = macroStore();
  assert.deepStrictEqual((await N.importNode(e, n.text, S)).macro, { name: 'login', reused: false, renamed: false });
  assert.deepStrictEqual((await N.importNode(e, n.text, S)).macro, { name: 'login', reused: true, renamed: false });
  assert.match((await N.importNode(e, NX.toYaml(NX.wrap('hat', 'h1', {})), S)).error, /this is a \.hat node — only \.workflow and \.macro import here/);
  assert.match((await N.importNode(e, 'nonsense: [', S)).error, /not a NEXUS node file/);
  assert.match((await N.importNode(e, '', S)).error, /empty/);
});

await test('NODE-06', 'the older JSON export still imports', async () => {
  clean();
  const e = new AutomationEngine({});
  const old = e.create({ name: 'Old', steps: [{ type: 'log', config: { message: 'hi' } }] }).workflow;
  const json = JSON.stringify(e.exportWorkflow(old.id).workflow);
  e.remove(old.id);
  const r = await N.importNode(e, json, macroStore());
  assert.strictEqual(r.ok, true); assert.strictEqual(r.workflow.name, 'Old'); assert.strictEqual(r.workflow.steps[0].config.message, 'hi');
});

await test('NODE-07', 'the library over the wire: save (same export saved once), list, download, import, delete; macro nodes; the tool actions', async () => {
  clean();
  const e = new AutomationEngine({});
  const S = macroStore({ apply: APPLY });
  const deps = { getMacro: S.getMacro, createMacro: S.createMacro };
  const call = (method, url, body = {}) => ROUTES.handle(e, { method, url, body, headers: {} }, deps);
  const wf = e.create({ name: 'Lib wf', steps: [{ type: 'macro', config: { name: 'apply' } }] }).workflow;
  const s1 = await call('POST', `/automation/workflows/${wf.id}/node/save`);
  const s2 = await call('POST', `/automation/workflows/${wf.id}/node/save`);
  assert.strictEqual(s1.body.file, 'lib-wf.workflow'); assert.strictEqual(s2.body.file, 'lib-wf.workflow', 'the same export is not saved twice');
  e.update(wf.id, { steps: [...e.get(wf.id).steps, { id: 'n', type: 'log', config: { message: 'v2' } }] });
  assert.strictEqual((await call('POST', `/automation/workflows/${wf.id}/node/save`)).body.file, 'lib-wf-2.workflow', 'a changed workflow is a new version');
  assert.strictEqual((await call('POST', '/automation/macros/apply/node/save')).body.file, 'apply.macro');
  const list = (await call('GET', '/automation/nodes')).body.nodes;
  assert.deepStrictEqual(list.map(n => n.file).sort(), ['apply.macro', 'lib-wf-2.workflow', 'lib-wf.workflow']);
  assert.ok(list.find(n => n.file === 'apply.macro').summary.startsWith('1 browser step'));
  const got = await call('GET', '/automation/nodes/lib-wf.workflow');
  assert.strictEqual(NX.fromYaml(got.body.text).payload.name, 'Lib wf');
  assert.strictEqual((await call('GET', '/automation/nodes/..%2F..%2Fsecret.workflow')).status, 404);
  e.remove(wf.id);
  const imp = await call('POST', '/automation/nodes/lib-wf-2.workflow/import');
  assert.strictEqual(imp.body.ok, true); assert.strictEqual(imp.body.workflow.steps.length, 2);
  const byText = await call('POST', '/automation/import', { text: (await call('GET', '/automation/macros/apply/node')).body.text });
  assert.deepStrictEqual(byText.body.macro, { name: 'apply', reused: true, renamed: false });
  assert.strictEqual((await call('DELETE', '/automation/nodes/apply.macro')).body.ok, true);
  assert.strictEqual((await call('GET', '/automation/nodes')).body.nodes.length, 2);
  clean();
});

await test('NODE-08', 'the macro tool itself: export writes <name>.macro, import brings it back (reused when identical)', async () => {
  const MT = require(path.join(ROOT, 'lib/agent-tools/tools/clear-glass/macro.js'));
  const nm = `node-test-${Date.now()}`;
  assert.strictEqual((await MT.execute({ action: 'create', name: nm, steps: [{ action: 'navigate', data: { url: 'https://a.test' } }], params: ['x'] })).ok, true);
  const dir = path.join(NODES_DIR, 'tool');
  const ex = await MT.execute({ action: 'export', name: nm, dir });
  assert.strictEqual(ex.ok, true); assert.ok(fs.existsSync(ex.file) && ex.file.endsWith(`${nm}.macro`));
  assert.deepStrictEqual(await MT.execute({ action: 'import', file: ex.file }), { ok: true, name: nm, reused: true, renamed: false });
  await MT.execute({ action: 'delete', name: nm });
  assert.deepStrictEqual(await MT.execute({ action: 'import', file: ex.file }), { ok: true, name: nm, reused: false, renamed: false });
  assert.deepStrictEqual((await MT.execute({ action: 'get', name: nm })).macro.params, ['x']);
  assert.match((await MT.execute({ action: 'import', file: '/nope.macro' })).error, /no such file/);
  clean();
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
})();
