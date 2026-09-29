'use strict';
/**
 * tests/modules/test-run-all-process-group.test.js — 0.39.282 N29
 *
 * The full run showed failures no suite had on its own (4771/45). One cause: when run-all timed a suite out it killed
 * only the suite's pid; the guardian/autopilot/orchestrator the suite had started stayed up, holding ports and writing
 * into sandboxes, and later suites talked to them. run-all now starts each suite in its own process group and kills the
 * group on timeout and on exit, and a suite states a longer budget in its own header ("run-all: timeout <ms>").
 * PG-01 checks the source; PG-02 runs the same spawn/kill pattern live against a hung suite that started a child.
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

let passed = 0, failed = 0;
async function test(id, name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${id} ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${id} ${name}\n    ${e.message}`); }
}
// a killed process nobody has reaped yet is a zombie: kill(pid, 0) still succeeds, but it runs nothing and holds nothing
const alive = (pid) => {
  try { process.kill(pid, 0); } catch (_) { return false; }
  try { return !/^\d+ \(.*\) Z/.test(fs.readFileSync(`/proc/${pid}/stat`, 'utf8')); } catch (_) { return true; }
};

(async () => {
  const SRC = fs.readFileSync(path.join(__dirname, 'run-all.js'), 'utf8');
  await test('PG-01', 'run-all starts each suite detached and kills its whole group on timeout and on close; budgets come from the suite', () => {
    assert.match(SRC, /detached: group/);
    assert.match(SRC, /process\.kill\(-proc\.pid, 'SIGKILL'\)/);
    assert.match(SRC, /proc\.on\('close', \(\) => \{ killGroup\(\); sb\.cleanup\(\); \}\)/);
    assert.match(SRC, /run-all:\\s\*timeout\\s\+\(\\d\+\)/);
    for (const f of ['test-repo-agent-late.test.js', 'test-autopilot-boot-gates.js'])
      assert.match(fs.readFileSync(path.join(__dirname, f), 'utf8').slice(0, 400), /run-all: timeout \d+/, f);
  });

  await test('PG-02', 'live: a hung suite that started a child — killing the group takes the child too (killing the pid alone does not)', async () => {
    if (process.platform === 'win32') return;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-probe-'));
    const probe = path.join(dir, 'probe.js');
    fs.writeFileSync(probe, `const c=require('child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});require('fs').writeFileSync(process.argv[2],String(c.pid));setInterval(()=>{},1000);`);
    const run = async (useGroup) => {
      const pidFile = path.join(dir, `pid-${useGroup}`);
      const p = spawn(process.execPath, [probe, pidFile], { stdio: 'ignore', detached: true });
      for (let i = 0; i < 50 && !fs.existsSync(pidFile); i++) await new Promise(r => setTimeout(r, 50));
      const child = parseInt(fs.readFileSync(pidFile, 'utf8'), 10);
      if (useGroup) process.kill(-p.pid, 'SIGKILL'); else p.kill('SIGKILL');
      await new Promise(r => setTimeout(r, 300));
      const survived = alive(child);
      try { process.kill(-p.pid, 'SIGKILL'); } catch (_) {}
      return survived;
    };
    assert.strictEqual(await run(false), true, 'precondition: killing only the suite pid leaves its child running (the bug)');
    assert.strictEqual(await run(true), false, 'killing the group leaves nothing behind');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exitCode = failed ? 1 : 0;
})();
