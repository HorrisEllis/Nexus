'use strict';
/**
 * tests/modules/test-clear-idearium.test.js — cli/clear-idearium.js 0.2.0
 *
 * Builds the exact leftovers of 2026-09-25 with the REAL modules, inside this
 * test's sandbox (lib/test-sandbox.js): a spec + repo ingested through
 * RepoLayer, its COS compartment, a guardian .job carrying that repo's
 * project-agent prompt (lib/repo-hat.js's own wording), and one unrelated
 * guardian job that must survive. Then runs the CLI for real, dry-run and
 * --apply, as its own process.
 */
const SB = require('../../lib/test-sandbox.js');
const root = SB.ensure();
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
process.env.GUARDIAN_JOBS_DIR = path.join(root, 'guardian-jobs');
// Ports nothing listens on, so the live-system refusal does not fire here —
// the refusal itself is checked separately below.
const CLI = path.join(ROOT, 'cli', 'clear-idearium.js');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? '\n      ' + detail : ''}`); }
}

(async () => {
  console.log('\ntest-clear-idearium\n');
  const api = await import(path.join(ROOT, 'idearium', 'api', 'index.js'));
  const layer = api.getRepoLayer();
  const NAME = `inject-test-${Date.now()}`;
  let rec = null;
  for (let i = 0; i < 20; i++) {
    rec = layer.ingest({ name: NAME, source: 'test', files: [{ path: 'src/a.js', content: 'const a = 1;\n' }] });
    if (!(rec && rec.error && /no spec-engine/.test(rec.error))) break;
    await new Promise(r => setTimeout(r, 250));
  }
  const repo = rec && (rec.repo || rec);
  check('setup: a real repo exists', !!(repo && repo.uuid), JSON.stringify(rec).slice(0, 200));

  const cos = require(path.join(ROOT, 'lib', 'cos-bridge.js'));
  const comp = cos.createCompartment({ name: cos.uniqueName(`idearium-repo-${repo.uuid.slice(-8)}`), purpose: NAME, networkIsolated: true });
  const other = cos.createCompartment({ name: cos.uniqueName('not-idearium'), purpose: 'must survive', networkIsolated: true });
  check('setup: an idearium compartment and an unrelated one exist', comp.ok && other.ok, comp.error || other.error);

  const { createJobStore } = require(path.join(ROOT, 'guardian', 'lib', 'jobs.js'));
  const store = createJobStore();
  const RH = require(path.join(ROOT, 'lib', 'repo-hat.js'));
  const hatSrc = fs.readFileSync(path.join(ROOT, 'lib', 'repo-hat.js'), 'utf8');
  check('the prompt wording matched is lib/repo-hat.js\'s own', hatSrc.includes('You are the project agent for "${repoName}".'));
  const repoJob = store.createJob({ command: 'ask', provider: 'chatgpt', prompt: `You are the project agent for "${NAME}". You exist for this one project.`, source: 'repo-agent' });
  const keepJob = store.createJob({ command: 'ask', provider: 'chatgpt', prompt: 'an unrelated job', source: 'cli' });
  const jobFile = id => path.join(process.env.GUARDIAN_JOBS_DIR, `${id}.job`);
  check('setup: both .job files exist', fs.existsSync(jobFile(repoJob.id)) && fs.existsSync(jobFile(keepJob.id)));
  void RH;

  const env = { ...process.env };
  const dry = spawnSync(process.execPath, [CLI], { cwd: ROOT, env, encoding: 'utf8', timeout: 60000 });
  check('dry run lists the repo by name', dry.stdout.includes(NAME), dry.stdout.slice(-800));
  check('dry run lists the idearium compartment, not the other', dry.stdout.includes(comp.compartment.name) && !dry.stdout.includes(other.compartment.name));
  check('dry run lists the repo\'s guardian job, not the other', dry.stdout.includes(`${repoJob.id}.job`) && !dry.stdout.includes(`${keepJob.id}.job`));
  check('dry run removes nothing', fs.existsSync(jobFile(repoJob.id)) && !!cos.getCompartment(comp.compartment.name));

  const app = spawnSync(process.execPath, [CLI, '--apply'], { cwd: ROOT, env, encoding: 'utf8', timeout: 60000 });
  check('--apply reports clean', /Clear\./.test(app.stdout) && app.status === 0, (app.stdout + app.stderr).slice(-1200));
  check('the repo\'s guardian job is gone', !fs.existsSync(jobFile(repoJob.id)));
  check('the unrelated guardian job survived', fs.existsSync(jobFile(keepJob.id)));
  const after = require(path.join(ROOT, 'cos', 'foundation', 'constants.js'));
  const compDirs = fs.existsSync(after.COS_COMP_DIR) ? fs.readdirSync(after.COS_COMP_DIR) : [];
  check('the idearium compartment is destroyed, the unrelated one is not',
    !compDirs.includes(comp.compartment.id) && compDirs.includes(other.compartment.id), compDirs.join(','));
  const specs = path.join(process.env.IDEARIUM_DATA_DIR, 'specs');
  check('specs and repo nodes are gone from the (sandboxed) idearium data dir',
    (!fs.existsSync(specs) || fs.readdirSync(specs).length === 0) &&
    !fs.existsSync(path.join(process.env.IDEARIUM_DATA_DIR, 'nodes', 'chunk')) || fs.readdirSync(path.join(process.env.IDEARIUM_DATA_DIR, 'nodes', 'chunk')).length === 0);

  // ── refuses while the live system answers ──
  // The fake "live idearium" must be ANOTHER process — the CLI probes with a
  // blocking child, exactly as it would against the real running system.
  const { spawn } = require('child_process');
  const fake = spawn(process.execPath, ['-e', "require('http').createServer((q,r)=>r.end('{}')).listen(4800,'127.0.0.1',()=>console.log('up')).on('error',()=>{console.log('taken');process.exit(0)})"], { stdio: ['ignore', 'pipe', 'ignore'] });
  const state = await new Promise(r => fake.stdout.once('data', d => r(String(d).trim())));
  const ref = spawnSync(process.execPath, [CLI, '--apply'], { cwd: ROOT, env, encoding: 'utf8', timeout: 60000 });
  check(`--apply refuses while something answers on idearium's port (${state === 'up' ? 'fake server' : 'port already in use here'})`,
    ref.status === 2 && /REFUSING --apply/.test(ref.stderr), ref.stderr || ref.stdout.slice(-300));
  fake.kill();

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exitCode = fail ? 1 : 0;
  setTimeout(() => process.exit(process.exitCode), 300);
})().catch(e => { console.log('  ✗ threw: ' + e.stack); console.log('\n  0 passed, 1 failed\n'); process.exit(1); });
