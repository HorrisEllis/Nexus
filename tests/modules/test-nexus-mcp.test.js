'use strict';
/**
 * tests/modules/test-nexus-mcp.test.js — IN1: Nexus as Claude Code's toolbox (orchestrator/lib/mcp-stdio.js,
 * orchestrator/lib/mcp-server.js, .mcp.json). James: "i want to get you to work from inside nexus … then you could use
 * introspect".
 *
 *   MC-01  the real stdio server, spoken to as Claude Code speaks: initialize, tools/list carries the builder tools,
 *          tools/call nexus_loom_impact on lib/component-store.js returns its real wires (the map's proof)
 *   MC-02  honest degradation: a tool whose service is down fails with the service and port — never an empty answer
 *          (nexus_gaps used to say "No open gaps ✓" with guardian down); a 404 is still "nothing there"
 *   MC-03  the contract check through MCP; the proof check and introspect fail honestly with their services down
 *   MC-04  registered: .mcp.json names the server and the file exists; Idearium's claude-code runs get the same server
 *          by absolute path with mcp__nexus allowed; NEXUS_CLAUDE_CODE_MCP=0 leaves it out
 *   MC-05  `nexus mcp list` / `nexus mcp call`
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const DOWN = 'http://127.0.0.1:9';   // nothing listens on the discard port

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 3).join('\n    ') : e.message}`); failed++; }
}

/** a session with the real stdio server: send(method, params) → the JSON-RPC reply */
function session(env = {}) {
  const child = spawn(process.execPath, [path.join(ROOT, 'orchestrator/lib/mcp-stdio.js')], { cwd: ROOT, env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
  let buf = '', id = 0; const waiting = new Map();
  child.stdout.on('data', d => {
    buf += d; const lines = buf.split('\n'); buf = lines.pop();
    for (const l of lines) { if (!l.trim()) continue; const m = JSON.parse(l); const w = waiting.get(m.id); if (w) { waiting.delete(m.id); w(m); } }
  });
  return {
    send(method, params = {}) { const myId = ++id; return new Promise((res, rej) => { const t = setTimeout(() => rej(new Error(`no reply to ${method}`)), 20000); waiting.set(myId, (m) => { clearTimeout(t); res(m); }); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: myId, method, params }) + '\n'); }); },
    close() { child.stdin.end(); child.kill(); },
  };
}

(async () => {
  console.log('\ntest-nexus-mcp — Nexus as Claude Code\'s toolbox (IN1)');
  const env = { GUARDIAN_URL: DOWN, CORTEX_URL: DOWN, INTELLIGENCE_URL: DOWN, ORCH_URL: DOWN, IDEARIUM_URL: DOWN, COPILOT_URL: DOWN };
  const s = session(env);
  try {
    await test('MC-01', 'stdio as Claude Code speaks it: the builder tools are listed; loom impact on lib/component-store.js gives its real wires', async () => {
      const init = await s.send('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
      assert.strictEqual(init.result.serverInfo.name, 'nexus-mcp');
      const list = (await s.send('tools/list')).result.tools.map(t => t.name);
      for (const n of ['nexus_loom_impact', 'nexus_contracts_check', 'nexus_proof_check', 'nexus_introspect', 'nexus_loom_query', 'nexus_gaps']) assert.ok(list.includes(n), n);
      const r = await s.send('tools/call', { name: 'nexus_loom_impact', arguments: { query: 'lib/component-store.js' } });
      const text = r.result.content[0].text;
      assert.match(text, /^nexus\.lib\.component-store/);
      assert.match(text, /used by \(\d+\) — the impact of changing it: [^\n]*nexus\.idearium\.api/, 'idearium/api reaches the component store (its real wire)');
      const none = (await s.send('tools/call', { name: 'nexus_loom_impact', arguments: { query: 'no-such-thing-xyz' } })).result.content[0].text;
      assert.match(none, /No loom component matches/);
    });

    await test('MC-02', 'a tool whose service is down fails with the service and port — never an empty answer', async () => {
      const r = await s.send('tools/call', { name: 'nexus_gaps', arguments: {} });
      assert.ok(r.error, 'an error, not a result');
      assert.match(r.error.message, /guardian :9|not reachable/);
      assert.ok(!/No open gaps/.test(JSON.stringify(r)), 'never "No open gaps ✓"');
      for (const name of ['nexus_jobs', 'nexus_patterns', 'nexus_ideas']) {
        const x = await s.send('tools/call', { name, arguments: name === 'nexus_ideas' ? { query: 'x' } : {} });
        assert.ok(x.error && /not reachable/.test(x.error.message), `${name}: ${JSON.stringify(x).slice(0, 200)}`);
      }
      const st = (await s.send('tools/call', { name: 'nexus_status', arguments: {} })).result.content[0].text;
      assert.match(st, /offline/, 'status still reports offline rather than failing');
    });

    await test('MC-03', 'the contract check through MCP; proof check and introspect fail honestly when down', async () => {
      const c = (await s.send('tools/call', { name: 'nexus_contracts_check', arguments: { system: 'emerge' } })).result.content[0].text;
      assert.match(c, /✓ emerge: \d+ emitted, 0 not yet declared/); assert.match(c, /no new drift/);
      const bad = await s.send('tools/call', { name: 'nexus_contracts_check', arguments: { system: 'nope' } });
      assert.match(bad.error.message, /not held to the contract/);
      const p = await s.send('tools/call', { name: 'nexus_proof_check', arguments: { repoUuid: 'r', conditions: [] } });
      assert.ok(p.error && /idearium|the proof run did not run/.test(p.error.message), JSON.stringify(p));
      const i = await s.send('tools/call', { name: 'nexus_introspect', arguments: { prompt: 'a', response: 'b' } });
      assert.ok(i.error && /introspect failed/.test(i.error.message), JSON.stringify(i));
    });
  } finally { s.close(); }

  await test('MC-04', 'registered: .mcp.json, and the same server on every Idearium claude-code run', async () => {
    const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, '.mcp.json'), 'utf8'));
    assert.strictEqual(cfg.mcpServers.nexus.command, 'node');
    assert.ok(fs.existsSync(path.join(ROOT, cfg.mcpServers.nexus.args[0])), 'the server file exists');
    const CC = require(path.join(ROOT, 'lib/claude-code-backend.js'));
    const a = CC.argsFor();
    assert.ok(a.includes('mcp__nexus'), 'its tools are allowed');
    const m = JSON.parse(a[a.indexOf('--mcp-config') + 1]);
    assert.ok(path.isAbsolute(m.mcpServers.nexus.args[0]) && fs.existsSync(m.mcpServers.nexus.args[0]), 'by absolute path — the run works in a copy of another repo');
    process.env.NEXUS_CLAUDE_CODE_MCP = '0';
    const off = CC.argsFor();
    delete process.env.NEXUS_CLAUDE_CODE_MCP;
    assert.ok(!off.includes('--mcp-config') && !off.includes('mcp__nexus'), 'off when asked');
  });

  await test('MC-05', '`nexus mcp list` and `nexus mcp call`', async () => {
    const l = spawnSync(process.execPath, [path.join(ROOT, 'cli/nexus.js'), 'mcp', 'list', '--json'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ...env } });
    assert.ok(JSON.parse(l.stdout).some(t => t.name === 'nexus_loom_impact'));
    const c = spawnSync(process.execPath, [path.join(ROOT, 'cli/nexus.js'), 'mcp', 'call', 'nexus_loom_impact', '--args={"query":"lib/component-store.js"}'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ...env } });
    assert.match(c.stdout, /nexus\.idearium\.api/);
    const g = spawnSync(process.execPath, [path.join(ROOT, 'cli/nexus.js'), 'mcp', 'call', 'nexus_gaps'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ...env } });
    assert.strictEqual(g.status, 1, 'a failed call exits 1'); assert.match(g.stdout + g.stderr, /not reachable/);
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
})();
