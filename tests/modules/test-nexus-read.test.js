'use strict';
/**
 * tests/modules/test-nexus-read.test.js — 0.59.12. James: "the nexus> is for you. not me. give yourself the tools using
 * nexus>. dude...." The rows an agent in a watched chat uses on his machine: glass open, log, file, grep — read-only,
 * secrets refused, keys redacted, allowed by the chat's read-only policy.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const ROOT = path.join(__dirname, '..', '..');
const R = require(path.join(ROOT, 'lib/nexus-read.js'));
const LC = require(path.join(ROOT, 'lib/listener-commands.js'));
const NC = require(path.join(ROOT, 'clear-glass/src/page/nexus-chat.js'));
let passed = 0, failed = 0;
async function test(id, d, fn) { try { await fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${e.stack}`); failed++; } }

(async () => {
  await test('NR-01', 'secrets and his state are refused; code is read even when its name says password', () => {
    for (const p of ['.env', '.env.local', '../x', '/etc/passwd', '.git/config', 'a/id_rsa', 'k.pem', 'config/token.json', 'data/cortex/memory/x.json'])
      assert.ok(R.resolve(p).error, p);
    for (const p of ['lib/version.js', 'clear-glass/src/passwords/vault.js', 'clear-glass/src/passwords', 'data/autopilot/autopilot.log'])
      assert.ok(!R.resolve(p).error, p);
  });
  await test('NR-02', 'keys are redacted from anything that comes back', () => {
    const t = R.redact('sk-abcdefghijklmnopqrstu ghp_abcdefghijklmnopqrstuvwxyz12 Bearer abcdefghijklmnop "password": "hunter2" apiKey=xyz123');
    assert.ok(!/abcdefghijklmnopqrstu|hunter2|xyz123/.test(t), t);
    assert.strictEqual((t.match(/\[redacted\]/g) || []).length, 5);
  });
  await test('NR-03', 'file reads numbered lines and says where the next part starts; grep finds file:line; a log tails', () => {
    const f = R.readFile('lib/nexus-read.js', { from: 2, lines: 2 });
    assert.match(f.text, /^lib\/nexus-read\.js — lines 2–3 of \d+ \(next: file lib\/nexus-read\.js --from 4\)\n\s+2  \/\*\*/);
    const g = R.grep('const MODULE_ID = .nexus.lib.nexus-read', { limit: 5 });
    assert.match(g.text, /lib\/nexus-read\.js:\d+: const MODULE_ID/);
    const dir = path.join(ROOT, 'data', 'autopilot'); fs.mkdirSync(dir, { recursive: true });
    const log = path.join(dir, 'nr-test.log'); fs.writeFileSync(log, 'one\ntwo token=abc123456789\nthree\n');
    try { const l = R.tailLog('data/autopilot/nr-test.log', { lines: 2 }); assert.strictEqual(l.text, 'data/autopilot/nr-test.log — last 2 of 3 line(s)\ntwo token=[redacted]\nthree'); }
    finally { fs.unlinkSync(log); }
    assert.ok(R.tailLog('lib/version.js').error, 'only logs');
  });
  await test('NR-04', 'from a watched chat: file / grep / log run; glass open is allowed; a write is still refused; the answer may be long', async () => {
    const RC = await import(pathToFileURL(path.join(ROOT, 'idearium/cli/route-commands.js')).href);
    const keys = RC.SPEC.map(r => r.key.replace('.', ' '));
    for (const c of ['glass open', 'log', 'file', 'grep']) assert.ok(keys.includes(c), c);
    assert.strictEqual(await NC.readOnly({ command: 'file', args: ['x'], flags: {} }), null);
    assert.strictEqual(await NC.readOnly({ command: 'glass open', args: ['x'], flags: {} }), null);
    assert.ok(await NC.readOnly({ command: 'repo apply', args: ['x', '1'], flags: {} }));
    const run = LC.createRunner({ policy: NC.readOnly });
    const [r] = await run.hear('t', 'nexus> file lib/nexus-read.js --lines 150');
    assert.ok(!r.error && r.maxChars === 8000, JSON.stringify(r).slice(0, 200));
    assert.ok(LC.summary(r).length > 1200, 'longer than the 1200 every other answer is cut at');
    const o = RC.SPEC.find(x => x.key === 'glass.open');
    assert.strictEqual(o.req({ args: ['localhost:9000'] }).body.url, 'http://localhost:9000');
    assert.strictEqual(o.req({ args: ['google.com'] }).body.url, 'https://google.com');
  });
  console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
})();
