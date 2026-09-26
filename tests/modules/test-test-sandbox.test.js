'use strict';
/**
 * tests/modules/test-test-sandbox.test.js — lib/test-sandbox.js
 *
 * James 2026-09-25: "the tests need to stop in idearium. they keep generating."
 * Proves, with the real modules and a real child process, that a test that
 * creates a spec, a repo, repo/chunk nodes and a compartment leaves NOTHING in
 * idearium/data, cortex memory or COMPARTMENT OS — and that no production entry
 * point autopilot supervises is mistaken for a test.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const SB = require(path.join(ROOT, 'lib', 'test-sandbox.js'));
const STORE_KEYS = Object.keys(SB.STORES);

// ── child mode: behave like any careless test — no env set, just write ──
if (process.argv[2] === '--child') {
  (async () => {
    const out = { sandbox: null, dirs: {} };
    const se = await import(path.join(ROOT, 'idearium', 'spec-engine', 'index.js'));
    const spec = se.createSpec({ name: `sandbox-probe-${Date.now()}`, type: 'component' });
    const api = await import(path.join(ROOT, 'idearium', 'api', 'index.js'));
    const layer = api.getRepoLayer();
    let rec = null;
    for (let i = 0; i < 20; i++) {
      rec = layer.ingest({ name: `sandbox-probe-repo-${Date.now()}`, source: 'test', files: [{ path: 'src/a.js', content: 'const a = 1;\n' }] });
      if (!(rec && rec.error && /no spec-engine/.test(rec.error))) break;
      await new Promise(r => setTimeout(r, 250));
    }
    const cos = require(path.join(ROOT, 'lib', 'cos-bridge.js'));
    const comp = cos.createCompartment({ name: cos.uniqueName('sandbox-probe'), purpose: 'probe', networkIsolated: true });
    out.sandbox = process.env.NEXUS_TEST_SANDBOX || null;
    for (const k of STORE_KEYS) out.dirs[k] = process.env[k] || null;
    out.specUuid = spec && spec.uuid;
    out.repoUuid = rec && (rec.repo || rec).uuid;
    out.compartmentOk = !!(comp && comp.ok);
    out.cosRoot = require(path.join(ROOT, 'cos', 'foundation', 'constants.js')).COS_DATA_ROOT;
    out.sandboxFiles = out.sandbox ? _walk(out.sandbox).length : 0;
    process.stdout.write('\nRESULT ' + JSON.stringify(out) + '\n');
    setTimeout(() => process.exit(0), 200);
  })().catch(e => { process.stdout.write('\nRESULT ' + JSON.stringify({ error: e.stack }) + '\n'); process.exit(1); });
  return;
}

function _walk(d) {
  const r = [];
  if (!fs.existsSync(d)) return r;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) r.push(..._walk(p)); else r.push(p);
  }
  return r;
}

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? '\n      ' + detail : ''}`); }
}

console.log('\ntest-test-sandbox\n');

// ── 1. who counts as a test ──
const AUTOPILOT = fs.readFileSync(path.join(ROOT, 'nexus', 'autopilot.js'), 'utf8');
const entries = [...AUTOPILOT.matchAll(/args:\s*\['([^']+\.js)'\]/g)].map(m => m[1]);
check('autopilot\'s supervised entry points were found (≥ 10)', entries.length >= 10, entries.join(', '));
const misread = entries.concat(['nexus/autopilot.js', 'orchestrator/orchestrator.js', 'cli/clear-idearium.js'])
  .filter(e => SB.isTestProcess(path.join(ROOT, e), {}));
check('no production entry point is taken for a test process', misread.length === 0, misread.join(', '));
check('clear-glass (electron ".") is not a test process', !SB.isTestProcess(path.join(ROOT, '.'), {}));
check('a script outside the repo with no marker is not a test process', !SB.isTestProcess(path.join(os.tmpdir(), 'x.js'), {}));
for (const t of ['tests/modules/test-repo-inject.js', 'tests/modules/idearium-phase-sync.test.mjs',
  'idearium/test/e2e-pipeline.test.js', 'cos/test/anything.js', 'tests/verify-ncp-agents.js']) {
  check(`${t} is a test process`, SB.isTestProcess(path.join(ROOT, t), {}));
}
check('a runner\'s marker makes any child a test process', SB.isTestProcess(path.join(os.tmpdir(), 'x.js'), { NEXUS_TEST_SANDBOX: '/x' }));

// ── 2. a careless test, for real, in its own process ──
const cleanEnv = { ...process.env };
delete cleanEnv.NEXUS_TEST_SANDBOX; delete cleanEnv.NEXUS_TEST_RUN_DEPTH;
for (const k of STORE_KEYS) delete cleanEnv[k];
const REAL_IDEARIUM = path.join(ROOT, 'idearium', 'data');
const REAL_JAA = path.join(ROOT, 'data', 'cortex', 'memory');
const REAL_LEDGER = path.join(ROOT, 'data', 'idearium');
const _sizes = () => new Map([REAL_IDEARIUM, REAL_JAA, REAL_LEDGER].flatMap(_walk).map(f => [f, fs.statSync(f).size]));
const before = _sizes();
const child = spawnSync(process.execPath, [__filename, '--child'], { cwd: ROOT, env: cleanEnv, encoding: 'utf8', timeout: 45000 });
const line = (child.stdout || '').split('\n').find(l => l.startsWith('RESULT '));
const R = line ? JSON.parse(line.slice(7)) : { error: (child.stderr || child.stdout || '').slice(-600) };
check('the probe ran (spec + repo + compartment created)', !R.error && !!R.specUuid && !!R.repoUuid && R.compartmentOk, R.error || JSON.stringify(R).slice(0, 300));
check('it got a sandbox without asking for one', !!R.sandbox && R.sandbox.startsWith(os.tmpdir()));
for (const k of STORE_KEYS) check(`${k} pointed inside the sandbox`, !!R.dirs && typeof R.dirs[k] === 'string' && R.dirs[k].startsWith(R.sandbox || '\0'));
check('COMPARTMENT OS root was inside the sandbox', typeof R.cosRoot === 'string' && R.cosRoot.startsWith(R.sandbox || '\0'), R.cosRoot);
check('its writes really happened (files existed in the sandbox)', R.sandboxFiles > 0, String(R.sandboxFiles));
const after = [..._sizes()].filter(([f, n]) => before.get(f) !== n).map(([f]) => path.relative(ROOT, f));
check('nothing new or grown in the real idearium/data, data/cortex/memory or data/idearium (event ledger)', after.length === 0, after.slice(0, 5).join('\n      '));
check('the sandbox was removed when the probe exited', !!R.sandbox && !fs.existsSync(R.sandbox));

// ── 3. production is unchanged ──
const prod = spawnSync(process.execPath, ['-e',
  `const d=require(${JSON.stringify(path.join(ROOT, 'idearium', 'lib', 'data-dir.cjs'))});process.stdout.write(JSON.stringify({dir:d.ideariumDataDir(),real:d.REAL_DEFAULT,sb:process.env.NEXUS_TEST_SANDBOX||null}))`],
  { cwd: ROOT, env: cleanEnv, encoding: 'utf8' });
let P = {}; try { P = JSON.parse(prod.stdout); } catch (_) {}
check('a production process still gets idearium/data, no sandbox', P.dir === P.real && P.real === REAL_IDEARIUM && P.sb === null, prod.stdout || prod.stderr);

// ── 4. no second resolver can reappear ──
const IDEA_FILES = _walk(path.join(ROOT, 'idearium')).filter(f => /\.(c|m)?js$/.test(f) && !/node_modules|[\\/]test[\\/]|[\\/]data[\\/]/.test(f) && !f.endsWith('data-dir.cjs'));
const stray = IDEA_FILES.filter(f => { const s = fs.readFileSync(f, 'utf8'); return /IDEARIUM_DATA_DIR\s*\|\||'\.\.',\s*'data'/.test(s.replace(/^\s*(\/\/|\*).*$/gm, '')); });
check('every idearium data path goes through idearium/lib/data-dir.cjs', stray.length === 0, stray.map(f => path.relative(ROOT, f)).join(', '));
const RUNALL = fs.readFileSync(path.join(ROOT, 'tests', 'modules', 'run-all.js'), 'utf8');
check('run-all gives every suite its own sandbox', /test-sandbox\.js'\)\.childEnv\(\)/.test(RUNALL) && /env: sb\.env/.test(RUNALL));
check('autopilot\'s boot vitals check and container test run are sandboxed', (AUTOPILOT.match(/test-sandbox\.js'\)\.childEnv\(/g) || []).length === 2);
check('the vitals check is no longer killed at 30s', /VITALS_TIMEOUT_MS = 180000/.test(AUTOPILOT));
const PROD_ENTRY = /(idearium\/api\/index\.js|'idearium', 'api'|cortex\/boot|guardian\/server|orchestrator\/orchestrator|copilot\/server|loom\/server|versionium\/server|intelligence\/server|architect\/service|nexus\/autopilot)/;
const TEST_FILES = ['tests', path.join('idearium', 'test'), path.join('cos', 'test')].flatMap(d => _walk(path.join(ROOT, d)))
  .filter(f => /\.(c|m)?js$/.test(f) && !/node_modules/.test(f) && f !== __filename);
const unguarded = TEST_FILES.filter(f => { const s = fs.readFileSync(f, 'utf8'); return /spawn|fork|exec(File)?(Sync)?\(/.test(s) && PROD_ENTRY.test(s) && !s.includes('test-sandbox.js'); });
check('every test that starts a NEXUS process puts it in a sandbox first', unguarded.length === 0, unguarded.map(f => path.relative(ROOT, f)).join(', '));
const SLM = fs.readFileSync(path.join(ROOT, 'tests', 'modules', 'spec-list-merge.test.mjs'), 'utf8');
check('spec-list-merge never talks to the real port 4800', !/port:\s*4800/.test(SLM) && /IDEARIUM_PORT: String\(PORT\)/.test(SLM));

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exitCode = fail ? 1 : 0;
