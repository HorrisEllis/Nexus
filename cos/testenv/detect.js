'use strict';
/**
 * cos/testenv/detect.js — what a repo needs to be tested, for ANY repo.
 * comp_id: nexus.cos.testenv.detect
 * Status: pre-release · §0.39.264
 *
 * James: "needs to be able to create a test env for any repo."
 *
 * plan(repoDir) reads only the repo's own files (manifests, lockfiles, test
 * layouts) and returns what a fresh Linux guest must do to test it:
 *
 *   stacks    node · python · go · rust · ruby · php · shell — each with the
 *             evidence that made it one ("package.json", "pytest.ini", …)
 *   install   shell commands that fetch the repo's dependencies (these are the
 *             ONLY commands that get network, and only in the VM)
 *   suite     the repo's own test commands ("npm test", "python3 -m pytest") —
 *             what its author runs, preferred over guessing files
 *   files     individual test files by every common convention, for runners
 *             that cannot start a shell (the process sandbox) and as the
 *             fallback when a stack has no suite command
 *   runtimes  guest runtimes the plan uses — checked against the base image's
 *             manifest, so a missing one is named before anything boots
 *
 * Nothing is executed and nothing is guessed silently: every command carries
 * `why`, and a stack with tests but no way to run them says so in `gaps`.
 */
const fs = require('fs');
const path = require('path');

const SKIP = new Set(['node_modules', '.git', '.venv', 'venv', '__pycache__', 'dist', 'build', 'target', 'vendor', 'data', '.nex', '.cos-testenv', '.tox', 'coverage', '.next']);

// Test files by convention. Deliberately broad: "no test files found" should
// mean there are none, not that they were named a way we did not look for.
const TEST_FILE_RULES = [
  { runtime: 'node',    re: /(^|\/)[^/]+\.(test|spec)\.[cm]?[jt]sx?$/ },                  // a.test.js, a.spec.ts
  { runtime: 'node',    re: /(^|\/)(__tests__|tests?)\/(.+\/)?[^/]+\.[cm]?js$/ },          // __tests__/x.js, test/x.js, tests/a/b.js
  { runtime: 'node',    re: /(^|\/)test-[^/]+\.[cm]?js$/ },                                  // test-foo.js (Nexus's own)
  { runtime: 'python3', re: /(^|\/)test_[^/]+\.py$/ },
  { runtime: 'python3', re: /(^|\/)[^/]+_test\.py$/ },
  { runtime: 'go',      re: /_test\.go$/, perFile: false },
  { runtime: 'ruby',    re: /(^|\/)(spec|test)\/.+_(spec|test)\.rb$/, perFile: false },
  { runtime: 'shell',   re: /(^|\/)tests?\/[^/]+\.(sh|bats)$/ },
];
// helper files inside a tests dir that are not tests themselves
// (a leading-underscore FILE is a helper — _purge-test-rows.js — but __tests__/ is a test dir)
const NOT_A_TEST = /(^|\/)(helpers?|fixtures?|__fixtures__|__mocks__|mocks?|utils?|support|setup)(\/|\.[cm]?js$)|(^|\/)_(?!_)[^/]*\.[cm]?js$|(^|\/)(conftest|__init__)\.py$|\.d\.ts$/;

const NPM_DEFAULT_TEST = /no test specified/;

function _walk(root, rel = '', out = [], depth = 0) {
  if (depth > 12 || out.length > 50000) return out;
  let ents; try { ents = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch (_) { return out; }
  for (const e of ents) {
    if (SKIP.has(e.name) || e.name.startsWith('.cos-')) continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) _walk(root, r, out, depth + 1); else if (e.isFile()) out.push(r);
  }
  return out;
}
const _read = (root, rel) => { try { return fs.readFileSync(path.join(root, rel), 'utf8'); } catch (_) { return null; } };
const _json = (root, rel) => { const t = _read(root, rel); try { return t ? JSON.parse(t) : null; } catch (_) { return null; } };

/** testFiles(files) -> [{ file, runtime, perFile }] — every test file by convention */
function testFiles(files) {
  const out = [];
  for (const f of files) {
    if (NOT_A_TEST.test(f)) continue;
    const rule = TEST_FILE_RULES.find(r => r.re.test(f));
    if (rule) out.push({ file: f, runtime: rule.runtime, perFile: rule.perFile !== false });
  }
  return out.sort((a, b) => a.file.localeCompare(b.file));
}

function _node(root, files, plan) {
  const pkg = _json(root, 'package.json');
  if (!pkg) return;
  const ev = ['package.json'];
  const pm = files.includes('pnpm-lock.yaml') ? 'pnpm' : files.includes('yarn.lock') ? 'yarn' : files.includes('bun.lockb') ? 'bun' : 'npm';
  const hasLock = files.includes('package-lock.json') || files.includes('npm-shrinkwrap.json');
  const deps = Object.keys({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}), ...(pkg.optionalDependencies || {}) });
  // --ignore-scripts: no postinstall downloads (electron, puppeteer's chromium)
  // and no install-time code from the dependency tree. A package that genuinely
  // needs its build step names itself in the run's output.
  if (deps.length || (pkg.workspaces && pkg.workspaces.length)) {
    const cmd = pm === 'npm' ? (hasLock ? 'npm ci --ignore-scripts --no-audit --no-fund' : 'npm install --ignore-scripts --no-audit --no-fund')
      : pm === 'pnpm' ? 'corepack enable && pnpm install --frozen-lockfile --ignore-scripts'
      : pm === 'yarn' ? 'corepack enable && yarn install --ignore-scripts' : 'npm install --ignore-scripts --no-audit --no-fund';
    plan.install.push({ stack: 'node', command: cmd, why: `${deps.length} dependencies in package.json${hasLock ? ' (lockfile: exact versions)' : ''}` });
  }
  const scripts = pkg.scripts || {};
  if (scripts.test && !NPM_DEFAULT_TEST.test(scripts.test)) {
    plan.suite.push({ stack: 'node', command: pm === 'npm' ? 'npm test' : `${pm} test`, why: `package.json "test": ${scripts.test}` });
  } else {
    const fw = ['vitest', 'jest', 'mocha', 'ava', 'tap'].find(d => deps.includes(d));
    if (fw) plan.suite.push({ stack: 'node', command: `npx --no-install ${fw === 'vitest' ? 'vitest run' : fw}`, why: `${fw} is a dependency, no "test" script` });
  }
  if (pkg.engines && pkg.engines.node) ev.push(`engines.node ${pkg.engines.node}`);
  plan.stacks.push({ stack: 'node', evidence: ev, packageManager: pm });
  plan.runtimes.add('node');
}

function _python(root, files, plan) {
  const ev = ['pyproject.toml', 'setup.py', 'setup.cfg', 'requirements.txt', 'Pipfile', 'pytest.ini', 'tox.ini', 'conftest.py'].filter(f => files.includes(f));
  const reqs = files.filter(f => /^requirements([-_.][\w-]+)?\.txt$/.test(f) || /^requirements\/[\w.-]+\.txt$/.test(f));
  const pyTests = files.some(f => /(^|\/)(test_[^/]+|[^/]+_test)\.py$/.test(f));
  if (!ev.length && !reqs.length && !pyTests) return;
  const pyproject = _read(root, 'pyproject.toml') || '';
  const usesPytest = files.includes('pytest.ini') || files.includes('conftest.py') || files.some(f => /(^|\/)conftest\.py$/.test(f))
    || /\[tool\.pytest/.test(pyproject) || /pytest/.test(reqs.map(r => _read(root, r) || '').join('\n')) || /\[pytest\]|\[tool:pytest\]/.test(_read(root, 'setup.cfg') || _read(root, 'tox.ini') || '');
  const steps = ['python3 -m venv .venv'];
  for (const r of reqs) steps.push(`.venv/bin/pip install -q -r ${r}`);
  if (files.includes('pyproject.toml') || files.includes('setup.py')) steps.push('.venv/bin/pip install -q -e . || .venv/bin/pip install -q .');
  if (pyTests || usesPytest) steps.push('.venv/bin/pip install -q pytest');
  plan.install.push({ stack: 'python', command: steps.join(' && '), why: `a virtualenv with ${[...reqs, ...ev.filter(e => /pyproject|setup\.py/.test(e))].join(', ') || 'pytest'}` });
  if (pyTests || usesPytest) plan.suite.push({ stack: 'python', command: '.venv/bin/python -m pytest -q', why: usesPytest ? 'pytest configuration found' : 'test_*.py / *_test.py files (pytest also runs unittest cases)' });
  plan.stacks.push({ stack: 'python', evidence: ev.length ? ev : reqs });
  plan.runtimes.add('python3');
}

function _go(root, files, plan) {
  if (!files.includes('go.mod')) return;
  plan.stacks.push({ stack: 'go', evidence: ['go.mod'] });
  plan.install.push({ stack: 'go', command: 'go mod download', why: 'go.mod' });
  plan.suite.push({ stack: 'go', command: 'go test ./...', why: 'go.mod' });
  plan.runtimes.add('go');
}

function _rust(root, files, plan) {
  if (!files.includes('Cargo.toml')) return;
  plan.stacks.push({ stack: 'rust', evidence: ['Cargo.toml'] });
  plan.install.push({ stack: 'rust', command: 'cargo fetch', why: 'Cargo.toml' });
  plan.suite.push({ stack: 'rust', command: 'cargo test --offline', why: 'Cargo.toml' });
  plan.runtimes.add('cargo');
}

function _ruby(root, files, plan) {
  if (!files.includes('Gemfile')) return;
  plan.stacks.push({ stack: 'ruby', evidence: ['Gemfile'] });
  plan.install.push({ stack: 'ruby', command: 'bundle config set --local path vendor/bundle && bundle install', why: 'Gemfile' });
  const gem = _read(root, 'Gemfile') || '';
  plan.suite.push(/rspec/.test(gem) || files.some(f => /^spec\//.test(f))
    ? { stack: 'ruby', command: 'bundle exec rspec', why: 'rspec in the Gemfile / spec/ directory' }
    : { stack: 'ruby', command: 'bundle exec rake test', why: 'Gemfile without rspec' });
  plan.runtimes.add('ruby');
}

function _php(root, files, plan) {
  if (!files.includes('composer.json')) return;
  plan.stacks.push({ stack: 'php', evidence: ['composer.json'] });
  plan.install.push({ stack: 'php', command: 'composer install --no-interaction --no-scripts', why: 'composer.json' });
  if (files.includes('phpunit.xml') || files.includes('phpunit.xml.dist')) plan.suite.push({ stack: 'php', command: 'vendor/bin/phpunit', why: 'phpunit.xml' });
  plan.runtimes.add('php');
}

function _make(root, files, plan) {
  if (!files.includes('Makefile') || plan.suite.length) return;
  if (/^test\s*:/m.test(_read(root, 'Makefile') || '')) {
    plan.suite.push({ stack: 'make', command: 'make test', why: 'Makefile has a test target' });
    plan.runtimes.add('make');
  }
}

/**
 * plan(repoDir, { files }) -> { stacks, install, suite, files, runtimes, gaps }
 * files: optional pre-listed repo-relative paths (a Nexus system passes its snapshot's).
 */
function plan(repoDir, { files = null } = {}) {
  const list = files || _walk(repoDir);
  const p = { stacks: [], install: [], suite: [], files: [], runtimes: new Set(), gaps: [] };
  if (repoDir && fs.existsSync(repoDir)) {
    _node(repoDir, list, p); _python(repoDir, list, p); _go(repoDir, list, p); _rust(repoDir, list, p);
    _ruby(repoDir, list, p); _php(repoDir, list, p); _make(repoDir, list, p);
  }
  p.files = testFiles(list);
  for (const f of p.files) if (f.perFile) p.runtimes.add(f.runtime === 'shell' ? 'sh' : f.runtime);
  // a stack whose tests we can see but cannot run is named, not dropped
  const byRuntime = (rt) => p.files.filter(f => f.runtime === rt);
  if (byRuntime('go').length && !p.suite.some(s => s.stack === 'go')) p.gaps.push('*_test.go files but no go.mod — go test needs a module');
  if (byRuntime('ruby').length && !p.suite.some(s => s.stack === 'ruby')) p.gaps.push('Ruby spec/test files but no Gemfile');
  if (!p.suite.length && !p.files.length) p.gaps.push('no test command (package.json "test", pytest, go test, cargo test, rspec, phpunit, make test) and no test files by any common naming');
  return { ...p, runtimes: [...p.runtimes] };
}

/** the one-line description the run menu shows */
function describe(pl) {
  const parts = [];
  if (pl.stacks.length) parts.push(pl.stacks.map(s => s.stack).join(' + '));
  if (pl.install.length) parts.push(`install: ${pl.install.map(i => i.command.split(' && ').pop().split(' ').slice(0, 2).join(' ')).join(', ')}`);
  if (pl.suite.length) parts.push(`test: ${pl.suite.map(s => s.command).join(' ; ')}`);
  else if (pl.files.length) parts.push(`${pl.files.length} test file(s)`);
  return parts.join(' · ');
}

module.exports = { plan, testFiles, describe, TEST_FILE_RULES, NOT_A_TEST };
