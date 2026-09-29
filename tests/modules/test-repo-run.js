'use strict';
// §0.39.282 — starts NEXUS processes: into the test sandbox first (test-test-sandbox's rule), so nothing writes real data.
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-repo-run.js — §2026-09-21 Run/Test through COS.
 * Real BranchEngine + real SandboxRunner; a temp repo with a passing test, a
 * failing test, a hanging test, and a probe that tries to read a secret.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const R = require(path.join(ROOT, 'lib', 'repo-run.js'));

let pass = 0, fail = 0;
function check(n, c, d = '') { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } }

async function main() {
  console.log('\ntest-repo-run\n');
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-run-'));
  const w = (p, c) => { fs.mkdirSync(path.dirname(path.join(repoDir, p)), { recursive: true }); fs.writeFileSync(path.join(repoDir, p), c); };
  w('package.json', '{"main":"index.js"}');
  w('index.js', 'require("fs").writeFileSync("written.txt","x"); console.log("sandbox=" + process.env.NEXUS_SANDBOX + " secret=" + (process.env.NEXUS_TEST_SECRET || "none"))');
  w('test/a.test.js', 'console.log("ok")');
  w('test/b.test.js', 'console.error("boom"); process.exit(3)');
  const comp = { id: `rr-test-${Date.now()}` };
  const repo = { uuid: 'r-test' };
  process.env.NEXUS_TEST_SECRET = 'must-not-leak';

  check('entry resolves from package.json main', R.resolveTargets(repoDir).targets[0].file === 'index.js');
  check('test mode finds every test file', R.resolveTargets(repoDir, { mode: 'test' }).targets.length === 2);
  check('an escaping entry is refused', R.resolveTargets(repoDir, { entry: '../../etc/passwd' }).targets.length === 0);

  const a = await R.run({ repo, repoDir, compartment: comp });
  check('run executes in the COS sandbox', a.ok && a.runs[0].exitCode === 0 && /sandbox=1/.test(a.runs[0].stdout), JSON.stringify(a.errors || a.runs));
  check('the parent environment\'s secrets do NOT reach the child (cleanEnv)', /secret=none/.test(a.runs[0].stdout));
  check('the run happened on a branch copy — the repo itself is untouched', !fs.existsSync(path.join(repoDir, 'written.txt')));
  check('the branch is discarded after the run by default', a.branchKept === false);

  const t = await R.run({ repo, repoDir, mode: 'test', compartment: comp });
  check('each test file is its own sandbox run', t.runs.length === 2);
  check('a passing and a failing test are both reported', t.passed === 1 && t.failed === 1 && !t.allPassed);
  const b = t.runs.find(x => x.file === 'test/b.test.js');
  check('a failure carries its exit code and stderr', b.exitCode === 3 && /boom/.test(b.stderr));

  w('test/c.test.js', 'setInterval(()=>{}, 1000)');
  const h = await R.run({ repo, repoDir, mode: 'test', entry: 'test/c.test.js', timeoutMs: 800, compartment: comp });
  check('a hanging program is killed by the COS watchdog and reported', h.runs[0].killedByTimeout && !h.runs[0].passed);

  check('a repo with no compartment is refused with the reason', /no COS compartment/.test((await R.run({ repo, repoDir })).errors[0]));
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-run-empty-'));
  check('a repo with nothing to run is refused, not guessed', /no entry/.test((await R.run({ repo, repoDir: empty, compartment: comp })).errors[0]));

  const HTML = fs.readFileSync(path.join(ROOT, 'idearium', 'ui', 'index.html'), 'utf8');
  const API = fs.readFileSync(path.join(ROOT, 'idearium', 'api', 'index.js'), 'utf8');
  check('the Run button is wired (not .tb-unwired)', /id="repo-tb-run"(?![^>]*tb-unwired)/.test(HTML) && /tb-btn" id="repo-tb-run"/.test(HTML));
  // §0.39.261 — the route now runs the COS run menu (lib/cos-run.js), which forks
  // into the same COS compartment branch; lib/repo-run.js remains a library
  // (runtime-proof uses it) and is still exercised directly above.
  check('the repo.run route calls the COS run menu (lib/cos-run.js)', /case 'repo\.run'[\s\S]{0,400}cos-run\.js/.test(API));

  fs.rmSync(repoDir, { recursive: true, force: true }); fs.rmSync(empty, { recursive: true, force: true });
  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exitCode = fail === 0 ? 0 : 1;
}
main().catch(e => { console.log('  ! crashed:', e.stack); process.exit(1); });
