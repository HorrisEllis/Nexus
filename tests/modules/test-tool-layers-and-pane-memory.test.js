'use strict';
/**
 * tests/modules/test-tool-layers-and-pane-memory.test.js — 0.39.278.
 *   TL-*  the agent tools as layers: nexus.tools.tool (categories) → nexus.tools_expand.tool (one category's tree),
 *         over the LIVE registry, scope-aware; the repo agent's first message and scopes carry them.
 *   PM-*  the Clear Glass co-pilot pane keeps its conversation in Clear Glass's own JAA store and sends the recent
 *         turns with every call, whichever backend answers; layered tool surface does not fetch the orchestrator.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const _log = console.log; const _warn = console.warn;
const quiet = () => { console.log = (...a) => { if (!/^\[jaa\]/.test(String(a[0]))) _log(...a); }; console.warn = () => {}; };
const loud = () => { console.log = _log; console.warn = _warn; };

let passed = 0, failed = 0;
async function t(id, name, fn) {
  try { quiet(); await fn(); loud(); passed++; _log(`  ✓ ${id} ${name}`); }
  catch (e) { loud(); failed++; _log(`  ✗ ${id} ${name}\n    ${e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n    ') : e}`); }
}

(async () => {
  _log('\n  test-tool-layers-and-pane-memory.test.js');
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-pm-'));
  process.env.CG_JAA_DIR = path.join(tmpHome, 'jaa');
  process.env.JAA_DATA_DIR = process.env.JAA_DATA_DIR || path.join(tmpHome, 'cortex-memory');
  process.env.CG_LEDGER_ROOT = path.join(tmpHome, 'downloads-index');   // the pane mirrors into the chat ledger (not the real COS compartment)

  quiet();
  const A = require(path.join(ROOT, 'lib/agent-tools/index.js'));
  const C = require(path.join(ROOT, 'lib/agent-tools/tool-catalog.js'));
  loud();
  const run = async (name, args, opts = {}) => { const r = await A.executeTool(name, args, opts); return r && r.result !== undefined ? r.result : r; };

  await t('TL-01', 'layer 1: nexus.tools.tool lists the categories, Code first, none empty, no "Other", counts add up to the registry', async () => {
    const r = await run('nexus.tools.tool', {}, { agent: 'test' });
    assert.strictEqual(r.layer, 1);
    assert.strictEqual(r.categories[0].id, 'code');
    assert.ok(r.categories.every(c => c.count > 0));
    assert.ok(!r.categories.some(c => c.id === 'other'), 'a registered tool fell into Other');
    assert.strictEqual(r.categories.reduce((n, c) => n + c.count, 0), r.total);
    assert.match(r.next, /nexus\.tools_expand\.tool/);
  });

  await t('TL-02', 'layer 2: expand("code") gives branches per owning system, every tool with summary and typed parameters', async () => {
    const r = await run('nexus.tools_expand.tool', { category: 'code' }, { agent: 'test' });
    assert.strictEqual(r.layer, 2);
    const systems = r.branches.map(b => b.system);
    assert.ok(systems.includes('idearium') && systems.includes('loom'), systems.join(','));
    const edit = r.branches.flatMap(b => b.tools).find(x => x.name === 'idearium.code_edit.tool');
    assert.ok(edit && edit.summary, 'code_edit missing or no summary');
    assert.ok(edit.params.length && edit.params.every(p => p.name && p.type && typeof p.required === 'boolean'));
    assert.strictEqual(r.branches.reduce((n, b) => n + b.tools.length, 0), r.count);
  });

  await t('TL-03', 'layer 2 by title works; an unknown category is an error naming the real ids, never an empty tree', async () => {
    const byTitle = await run('nexus.tools_expand.tool', { category: 'Versions (Versionium)' });
    assert.strictEqual(byTitle.category, 'version');
    const bad = await run('nexus.tools_expand.tool', { category: 'nope' });
    assert.ok(bad.error && /one of: .*code/.test(bad.error), JSON.stringify(bad));
    const none = await run('nexus.tools_expand.tool', {});
    assert.ok(none.error);
  });

  await t('TL-04', 'every category from layer 1 expands, and together they hold every visible tool exactly once', async () => {
    const l1 = await run('nexus.tools.tool', {});
    const seen = new Set();
    for (const c of l1.categories) {
      const x = await run('nexus.tools_expand.tool', { category: c.id });
      for (const b of x.branches) for (const tool of b.tools) { assert.ok(!seen.has(tool.name), `${tool.name} twice`); seen.add(tool.name); }
    }
    assert.strictEqual(seen.size, l1.total);
  });

  await t('TL-05', 'a run\'s allowedTools narrows both layers (a tool the agent cannot call is not shown)', async () => {
    const ctx = { context: { allowedTools: ['read_file', 'idearium.code_read.tool', 'nexus.tools.tool'] } };
    const l1 = await run('nexus.tools.tool', {}, ctx);
    assert.strictEqual(l1.total, 3);
    const code = await run('nexus.tools_expand.tool', { category: 'code' }, ctx);
    assert.deepStrictEqual(code.branches.flatMap(b => b.tools.map(x => x.name)), ['idearium.code_read.tool']);
  });

  await t('TL-06', 'the repo agent carries the layers: listed in the harness first message, in every scope, in a new repo hat', () => {
    const RA = require(path.join(ROOT, 'lib/repo-agent.js'));
    const RH = require(path.join(ROOT, 'lib/repo-hat.js'));
    for (const n of ['nexus.tools.tool', 'nexus.tools_expand.tool']) {
      assert.ok(RA.listedTools().includes(n), `${n} not listed`);
      assert.ok(RA.ALWAYS_IN_SCOPE.includes(n), `${n} not always in scope`);
      assert.ok(RH.REPO_TOOL_SCOPE.includes(n), `${n} not in a new repo hat`);
    }
    assert.strictEqual(C.groupOf('idearium.code_edit.tool').id, 'code');
    assert.strictEqual(C.groupOf('read_file').id, 'files');
  });

  // ── the pane's kept conversation ─────────────────────────────────────────────
  const CS = require(path.join(ROOT, 'clear-glass/src/copilot/chat-store.js'));

  await t('PM-01', 'chat-store: append/list oldest-first per pane; empty text and unknown roles are not stored', () => {
    CS.append({ agentId: 'a1', role: 'user', text: 'open google' });
    CS.append({ agentId: 'a1', role: 'assistant', text: 'opened', via: 'ollama' });
    CS.append({ agentId: 'a1', role: 'user', text: '   ' });
    CS.append({ agentId: 'a1', role: 'system', text: 'x' });
    CS.append({ agentId: 'a2', role: 'user', text: 'other pane' });
    const l = CS.list({ agentId: 'a1' });
    assert.deepStrictEqual(l.turns.map(x => [x.role, x.text]), [['user', 'open google'], ['assistant', 'opened']]);
    assert.strictEqual(CS.list({ agentId: 'a2' }).turns.length, 1);
  });

  await t('PM-02', 'historyBlock: the recent turns as text; over budget it drops the OLDEST and says so', () => {
    for (let i = 0; i < 6; i++) CS.append({ agentId: 'h1', role: i % 2 ? 'assistant' : 'user', text: `turn ${i} ` + 'x'.repeat(100) });
    const all = CS.historyBlock({ agentId: 'h1', turns: 10, chars: 4000 });
    assert.match(all, /^## Conversation so far/);
    assert.ok(all.indexOf('turn 0') < all.indexOf('turn 5'));
    const cut = CS.historyBlock({ agentId: 'h1', turns: 10, chars: 300 });
    assert.ok(!cut.includes('turn 0') && cut.includes('turn 5'));
    assert.match(cut, /earlier turn\(s\) left out for length/);
    assert.strictEqual(CS.historyBlock({ agentId: 'nobody' }), '');
  });

  await t('PM-03', 'startNew: a fresh conversation for the pane; the old one is kept, not deleted (§0.3)', () => {
    const before = CS.list({ agentId: 'a1' });
    const next = CS.startNew('a1');
    assert.notStrictEqual(next, before.conversationId);
    assert.strictEqual(CS.list({ agentId: 'a1' }).turns.length, 0);
    assert.strictEqual(CS.list({ agentId: 'a1', conversationId: before.conversationId }).turns.length, 2);
  });

  await t('PM-04', 'bounded: a conversation keeps its newest MAX_TURNS rows', () => {
    const conv = CS.startNew('cap');
    for (let i = 0; i < CS.MAX_TURNS + 5; i++) CS.append({ agentId: 'cap', role: 'user', text: `m${i}` });
    const l = CS.list({ agentId: 'cap', limit: CS.MAX_TURNS });
    assert.strictEqual(l.conversationId, conv);
    assert.strictEqual(l.turns.length, CS.MAX_TURNS);
    assert.strictEqual(l.turns[0].text, 'm5');
  });

  const Bridge = require(path.join(ROOT, 'clear-glass/src/copilot/bridge.js'));
  const events = [];
  const mk = (over = {}) => {
    const settings = { copilotAutoRunCommands: false, copilotWearHat: false, copilotDomContext: false, ...over };
    const b = new Bridge({ sse: { emit: (type, d) => events.push({ type, d }) }, apiSettings: { get: () => settings, copilotDirectUrl: p => `http://127.0.0.1:1${p}` } });
    b._ingestToNexus = () => {};
    b.calls = [];
    b._ask = async (a) => { b.calls.push(a); return { text: `reply to ${a.message}`, via: 'ollama', modelUsed: 'ollama:test' }; };
    return b;
  };

  await t('PM-05', 'the bridge stores both sides and sends the earlier turns with the next call (any backend)', async () => {
    const b = mk();
    await b.send({ message: 'first question', agentId: 'pane1' });
    await b.send({ message: 'second question', agentId: 'pane1' });
    const sys2 = b.calls[1].systemExtra || '';
    assert.match(sys2, /Conversation so far/);
    assert.ok(sys2.includes('James: first question') && sys2.includes('You: reply to first question'));
    assert.ok(!sys2.includes('second question'), 'the message itself must not be duplicated into its own history');
    assert.deepStrictEqual(CS.list({ agentId: 'pane1' }).turns.map(x => x.role), ['user', 'assistant', 'user', 'assistant']);
  });

  await t('PM-06', '"Nothing answered" is not stored as the assistant\'s turn; copilotRemember off stores nothing', async () => {
    const b = mk();
    b._ask = async () => ({ text: 'Nothing answered. Tried: …', via: 'none', modelUsed: 'none' });
    await b.send({ message: 'hello?', agentId: 'pane2' });
    assert.deepStrictEqual(CS.list({ agentId: 'pane2' }).turns.map(x => x.role), ['user']);
    const off = mk({ copilotRemember: false });
    await off.send({ message: 'private', agentId: 'pane3' });
    assert.strictEqual(CS.list({ agentId: 'pane3' }).turns.length, 0);
    assert.ok(!(off.calls[0].systemExtra || '').includes('Conversation so far'));
  });

  await t('PM-07', 'layered tool surface: Clear Glass\'s own actions + the layer line; the orchestrator is not asked', async () => {
    const b = mk();
    const origFetch = global.fetch; let fetched = 0;
    global.fetch = async () => { fetched++; throw new Error('should not be called'); };
    try {
      const ctx = await b._buildCgContext('pane4', null);
      assert.strictEqual(fetched, 0);
      assert.match(ctx, /nexus\.tools\.tool/);
      assert.match(ctx, /nexus\.tools_expand\.tool/);
    } finally { global.fetch = origFetch; }
  });

  await t('PM-08', 'renderer: replies are escaped before innerHTML, replayed through the same formatter; /new exists', () => {
    const src = fs.readFileSync(path.join(ROOT, 'clear-glass/renderer/browser.js'), 'utf8');
    const f = src.slice(src.indexOf('function formatReply'), src.indexOf('function formatReply') + 600);
    assert.ok(f.indexOf("replace(/</g, '&lt;')") > -1 && f.indexOf("replace(/</g, '&lt;')") < f.indexOf('<code>'), 'escape must come before markup');
    assert.match(src, /restoreConversation\(\);/);
    assert.match(src, /addMsg\('assistant', formatReply\(res\.text\), true\)/);
    const cli = fs.readFileSync(path.join(ROOT, 'clear-glass/renderer/copilot-cli.js'), 'utf8');
    assert.match(cli, /case 'new':/);
  });

  _log(`\n  ${passed} passed, ${failed} failed\n`);
  try { fs.rmSync(tmpHome, { recursive: true, force: true }); } catch (_) {}
  process.exit(failed ? 1 : 0);
})();