'use strict';
/**
 * tests/modules/test-nexus-command-tool.test.js — §0.39.376 CM2: every command a person has, for copilot and every agent.
 * James: "Yes. And copilot. Copilot is the entrance of nexus. Like I want it to be able to do anything, nexus can."
 * The real API answers on a port; the tool is called through the real registry (lib/agent-tools executeTool) — as
 * copilot, and as a repo agent with its own repo — and through the MCP server's nexus_command (Claude Code).
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '..', '..');

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 4).join('\n    ') : e.message}`); failed++; }
}
const quiet = async (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; } };

(async () => {
  console.log('\n⬡  NEXUS.COMMAND — every command, for copilot and every agent\n');
  process.env.NEXUS_VERSIONIUM_URL = 'http://127.0.0.1:9';
  const api = await quiet(() => import(pathToFileURL(path.join(ROOT, 'idearium/api/index.js')).href));
  const R = (m, p, b) => api._route(m, p, b);
  const repoUuid = await quiet(async () => {
    const w = (await R('POST', '/api/workshop', { from: { kind: 'blank' }, title: 'Tool Orchard' })).json.workshop;
    await R('POST', `/api/workshop/${w.uuid}`, { sections: [{ id: 'purpose', body: 'An orchard of tools.' }] });
    return (await R('POST', `/api/workshop/${w.uuid}/save`, {})).json.repoUuid;
  });
  const srv = await new Promise((res) => { const sv = http.createServer((q, r) => { let b = ''; q.on('data', d => { b += d; }); q.on('end', async () => {
    let body = {}; try { body = b ? JSON.parse(b) : {}; } catch (_) {}
    const o = await quiet(() => R(q.method, q.url, body)); r.statusCode = o.status || 200; r.setHeader('content-type', 'application/json'); r.end(JSON.stringify(o.json || {})); }); });
    sv.listen(0, '127.0.0.1', () => res(sv)); });
  process.env.IDEARIUM_PORT = String(srv.address().port); process.env.IDEARIUM_HOST = '127.0.0.1';
  const AT = await quiet(() => require(path.join(ROOT, 'lib/agent-tools/index.js')));
  const run = (args, opts) => quiet(() => AT.executeTool('nexus.command.tool', args, opts));
  const asCopilot = { agent: 'copilot' };
  const asRepoAgent = { agent: 'repo_toolorchard', context: { repoUuid } };

  await test('NC-01', 'registered for every caller; "list" answers every command with its usage — the CLI\'s own table', async () => {
    assert.ok(AT.TOOLS.has('nexus.command.tool'));
    const SPEC = (await import(pathToFileURL(path.join(ROOT, 'idearium/cli/route-commands.js')).href)).SPEC;
    const l = await run({ action: 'list' }, asCopilot);
    assert.strictEqual(l.commands.length, SPEC.length);
    assert.ok(l.commands.some(c => c.command === 'repo desktop' && /rewind <tag>/.test(c.usage)));
  });

  await test('NC-02', 'copilot names the repo by name; a repo agent gets its own repo by default', async () => {
    const c = await run({ command: 'repo tasks', repo: 'Tool Orchard' }, asCopilot);
    assert.ok(!c.error && c.result && Array.isArray(c.result.tasks), JSON.stringify(c).slice(0, 300));
    const a = await run({ command: 'repo charter' }, asRepoAgent);
    assert.ok(!a.error && /Tool Orchard/.test(a.command), JSON.stringify(a).slice(0, 300));
    const none = await run({ command: 'repo tasks' }, asCopilot);
    assert.match(none.error, /which repo/);
  });

  await test('NC-03', 'flags and args go through: activity filtered, the desktop asked for its status', async () => {
    const act = await run({ command: 'activity', flags: { kind: 'task', limit: 5 } }, asCopilot);
    assert.ok(!act.error && Array.isArray(act.result.rows) && act.result.rows.every(r => /^task/.test(r.kind)), JSON.stringify(act).slice(0, 300));
    const d = await run({ command: 'repo desktop', args: ['status'] }, asRepoAgent);
    assert.ok(d.result || d.error, JSON.stringify(d));
  });

  await test('NC-04', "what is the person's is refused with how they do it: approving a proposal, stopping a system", async () => {
    const ap = await run({ command: 'repo apply', args: ['some-inject'] }, asRepoAgent);
    assert.ok(ap.refused && /approving a proposal is the person's/.test(ap.reason), JSON.stringify(ap));
    const st = await run({ command: 'repo system', args: ['restart'] }, asCopilot);
    assert.ok(st.refused || /not a Nexus system repo/.test(st.error || ''), JSON.stringify(st));
    const st2 = await run({ command: 'repo system', repo: 'Tool Orchard', args: ['stop'] }, asCopilot);
    assert.ok(st2.refused && /the person's/.test(st2.reason), JSON.stringify(st2));
  });

  await test('NC-05', 'an unknown command names the near ones; a missing argument says what is needed', async () => {
    const u = await run({ command: 'repo taks' }, asCopilot);
    assert.match(u.error, /no command "repo taks"/);
    const m = await run({ command: 'repo ask', repo: 'Tool Orchard' }, asCopilot);
    assert.match(m.error, /a message is needed/);
  });

  await test('NC-06', 'a big answer is trimmed for a small model, and says how to narrow it', () => {
    const T = require(path.join(ROOT, 'lib/agent-tools/tools/nexus/command.js'));
    const big = T._trim({ rows: Array.from({ length: 400 }, (_, i) => ({ i, title: 'x'.repeat(60) })) });
    assert.ok(big.rows.length === 26 && /375 more — narrow it/.test(big.rows[25]));
  });

  await test('NC-07', 'Claude Code: the MCP server\'s nexus_command is the same tool; its run knows its repo', async () => {
    const { TOOLS } = require(path.join(ROOT, 'orchestrator/lib/mcp-server.js'));
    const t = TOOLS.find(x => x.name === 'nexus_command');
    assert.ok(t);
    process.env.NEXUS_MCP_REPO = repoUuid;
    const out = JSON.parse(await quiet(() => t.handler({ command: 'repo charter' })));
    delete process.env.NEXUS_MCP_REPO;
    assert.match(out.command, /Tool Orchard/);
    assert.ok(require(path.join(ROOT, 'lib/claude-code-backend.js')).mcpConfig({ repoUuid }).includes(`"NEXUS_MCP_REPO":"${repoUuid}"`));
    const ra = fs.readFileSync(path.join(ROOT, 'lib/repo-agent.js'), 'utf8');
    assert.ok(/CC\.run\(\{ repoDir, prompt, timeoutMs, repoUuid: repo\.uuid \}\)/.test(ra) && /nexus\.command\.tool/.test(ra));
  });

  srv.close();
  console.log(`\n  ${passed} passed · ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
