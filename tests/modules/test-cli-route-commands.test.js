'use strict';
/**
 * tests/modules/test-cli-route-commands.test.js — §0.39.374: every capability is a command.
 * James: "That was fantastic. Everything needs to be available as commands."
 * The real Idearium API (api._route) answers on a port; the real CLI (idearium/cli/index.js) runs as its own process
 * against it, as a person at a terminal would. A Claude Code stand-in answers `repo ask`.
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFile } = require('child_process');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '..', '..');
const CLI = path.join(ROOT, 'idearium/cli/index.js');

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 4).join('\n    ') : e.message}`); failed++; }
}
const quiet = async (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; } };
const strip = (s) => String(s).replace(/\x1b\[[0-9;]*m/g, '');
function cli(args, env = {}) {
  return new Promise((res) => execFile(process.execPath, [CLI, ...args], { env: { ...process.env, ...env }, timeout: 120000 }, (err, stdout, stderr) =>
    res({ code: err ? (err.code ?? 1) : 0, out: strip(stdout), err: strip(stderr) })));
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'clirc-'));
const standin = path.join(tmp, 'claude-standin.js');
fs.writeFileSync(standin, `#!/usr/bin/env node
const fs = require('fs'); let input = ''; process.stdin.on('data', d => input += d); process.stdin.on('end', () => {
  fs.writeFileSync('hello.js', 'module.exports = "hello";\\n');
  process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'wrote hello.js', session_id: 's', total_cost_usd: 0, num_turns: 1, usage: { input_tokens: 1, output_tokens: 1 } }));
});
`);
fs.chmodSync(standin, 0o755);
process.env.CLAUDE_CODE_BIN = standin;
process.on('exit', () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {} });

(async () => {
  console.log('\n⬡  EVERY CAPABILITY A COMMAND — the real CLI against the real API\n');
  process.env.NEXUS_VERSIONIUM_URL = 'http://127.0.0.1:9';
  const api = await quiet(() => import(pathToFileURL(path.join(ROOT, 'idearium/api/index.js')).href));
  const R = (m, p, b) => api._route(m, p, b);
  const repoUuid = await quiet(async () => {
    const w = (await R('POST', '/api/workshop', { from: { kind: 'blank' }, title: 'Command Garden' })).json.workshop;
    await R('POST', `/api/workshop/${w.uuid}`, { sections: [{ id: 'purpose', body: 'A garden of commands.' }] });
    return (await R('POST', `/api/workshop/${w.uuid}/save`, {})).json.repoUuid;
  });
  require(path.join(ROOT, 'cortex/memory/jaa-db.js')).jaaDB.flush();
  const srv = await new Promise((res) => { const sv = http.createServer((q, r) => { let b = ''; q.on('data', d => { b += d; }); q.on('end', async () => {
    let body = {}; try { body = b ? JSON.parse(b) : {}; } catch (_) {}
    const o = await quiet(() => R(q.method, q.url, body)); r.statusCode = o.status || 200; r.setHeader('content-type', 'application/json'); r.end(JSON.stringify(o.json || {})); }); });
    sv.listen(0, '127.0.0.1', () => res(sv)); });
  const env = { IDEARIUM_PORT: String(srv.address().port) };
  const name = 'Command Garden';

  await test('CL-01', '`idearium help` lists every table command with what it does', async () => {
    const r = await cli(['help'], env);
    const SPEC = (await import(pathToFileURL(path.join(ROOT, 'idearium/cli/route-commands.js')).href)).SPEC;
    for (const row of SPEC) assert.ok(r.out.includes(row.usage.split(' ').slice(1).join(' ').slice(0, 30)) && r.out.includes(row.about.slice(0, 30)), `help misses ${row.key}`);
  });

  await test('CL-02', '`repo agent` shows and sets who wears the hat (by repo name)', async () => {
    const set = await cli(['repo', 'agent', name, '--provider', 'claude-code', '--inject', 'review'], env);
    assert.strictEqual(set.code, 0, set.err);
    const show = await cli(['repo', 'agent', name, '--json'], env);
    const d = JSON.parse(show.out);
    assert.strictEqual((d.settings || d).provider, 'claude-code', show.out.slice(0, 300));
  });

  let injectId;
  await test('CL-03', '`repo ask` talks to the agent; its code lands as a proposal, listed by `repo changes`', async () => {
    const r = await cli(['repo', 'ask', name, 'write hello.js'], env);
    assert.strictEqual(r.code, 0, r.err || r.out);
    assert.match(r.out, /wrote hello\.js/);
    assert.match(r.out, /◇ hello\.js proposed/);
    const ch = await cli(['repo', 'changes', name, '--json'], env);
    const list = JSON.parse(ch.out).injects || [];
    const inj = list.find(i => i.path === 'hello.js' && i.status === 'proposed');
    assert.ok(inj, ch.out.slice(0, 300)); injectId = inj.uuid;
  });

  await test('CL-04', '`repo apply` applies it; the activity log says the person (cli) did', async () => {
    const r = await cli(['repo', 'apply', name, injectId], env);
    assert.strictEqual(r.code, 0, r.err);
    require(path.join(ROOT, 'cortex/memory/jaa-db.js')).jaaDB.flush();
    const log = await cli(['repo', 'activity', name, '--kind', 'inject', '--json'], env);
    const rows = JSON.parse(log.out).rows;
    assert.ok(rows.some(x => x.kind === 'inject.applied' && x.actor === 'cli') && rows.some(x => x.kind === 'inject.proposed'), JSON.stringify(rows.map(x => [x.kind, x.actor])));
  });

  await test('CL-05', '`repo tasks` and `repo activity` and `activity` print the work, readable', async () => {
    const t = await cli(['repo', 'tasks', name], env);
    assert.ok(t.code === 0 && /chat/.test(t.out) && /claude-code/.test(t.out), t.out + t.err);
    const a = await cli(['repo', 'activity', name, '--limit', '5'], env);
    assert.ok(a.code === 0 && /inject\.applied/.test(a.out), a.out + a.err);
    const all = await cli(['activity', '--limit', '50'], env);
    assert.ok(all.code === 0 && all.out.includes(name), all.out + all.err);
  });

  await test('CL-06', '`repo charter` shows it, `set <file>` writes it, `check` checks its end state', async () => {
    const f = path.join(tmp, 'charter.spec');
    fs.writeFileSync(f, 'charter:\n  axioms: ["least code"]\n  end_state:\n    - { says: "hello exists", check: { kind: file, path: hello.js } }\n');
    const set = await cli(['repo', 'charter', name, 'set', f], env);
    assert.strictEqual(set.code, 0, set.err);
    const show = await cli(['repo', 'charter', name], env);
    assert.ok(/axiom\s+least code/.test(show.out), show.out);
    const chk = await cli(['repo', 'charter', name, 'check'], env);
    assert.ok(chk.code === 0 && /1\/1 of its end state met/.test(chk.out), chk.out + chk.err);
  });

  await test('CL-07', 'refusals exit 1 with the reason: no desktop compartment, not a Nexus system, a missing argument', async () => {
    const sys = await cli(['repo', 'system', name], env);
    assert.ok(sys.code !== 0 && /not a Nexus system repo/.test(sys.err), sys.err);
    const rw = await cli(['repo', 'desktop', name, 'rewind'], env);
    assert.ok(rw.code !== 0 && /usage: idearium repo desktop <repo> rewind <tag>/.test(rw.err), rw.err);
    const nomsg = await cli(['repo', 'ask', name], env);
    assert.ok(nomsg.code !== 0 && /a message is needed/.test(nomsg.err), nomsg.err);
    const norepo = await cli(['repo', 'tasks', 'no-such-repo'], env);
    assert.ok(norepo.code !== 0 && /repo not found/.test(norepo.err), norepo.err);
  });

  await test('CL-08', 'another system unreachable is said (`perf` with no orchestrator)', async () => {
    const r = await cli(['perf'], { ...env, NEXUS_ORCHESTRATOR_PORT: '9' });
    assert.ok(r.code === 0 || /running\?|unreachable|ECONNREFUSED|HTTP/.test(r.err), r.err);
  });

  srv.close();
  console.log(`\n  ${passed} passed · ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
