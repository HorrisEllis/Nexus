'use strict';
/**
 * tests/modules/test-update-script.test.js — 0.60.48: `npm run update`, the latest Nexus without a zip.
 * scripts/update.js. James (2026-10-15): "im so sick of zips".
 *
 *   UP-01  an unzipped folder (no .git) is refused with the one clone command
 *   UP-02  a clone that is current says so and changes nothing; --check reports new commits and changes nothing
 *   UP-03  an update fast-forwards, says the version before → after, and leaves data/ alone
 *   UP-04  local edits that the update would overwrite are refused, named
 */
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const U = require(path.join(__dirname, '../../scripts/update.js'));

let passed = 0, failed = 0;
function test(id, desc, fn) { try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack.split('\n').slice(0, 5).join('\n    ')}`); failed++; } }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-upd-'));
const g = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const put = (root, rel, t) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), t); };
const ver = (v) => `const VERSION = {\n  system: '${v}',\n};\n`;
const say = []; const log = (m) => say.push(m);

// "GitHub": a bare repo; James's machine: a clone of it; the coder: a second clone that pushes
const origin = path.join(tmp, 'origin.git'), dev = path.join(tmp, 'dev'), mine = path.join(tmp, 'mine');
g(tmp, 'init', '--bare', '-q', '-b', 'main', origin);
g(tmp, 'clone', '-q', origin, dev);
g(dev, 'config', 'user.email', 't@t'); g(dev, 'config', 'user.name', 't');
put(dev, 'lib/version.js', ver('0.60.47')); put(dev, 'package.json', '{"name":"x"}\n'); put(dev, '.gitignore', 'data/\n');
g(dev, 'add', '-A'); g(dev, 'commit', '-qm', 'one'); g(dev, 'push', '-q', 'origin', 'main');
g(tmp, 'clone', '-q', origin, mine);
put(mine, 'data/state.json', '{"his":"state"}');

console.log('\ntest-update-script — the latest Nexus without a zip (0.60.48)');
test('UP-01', 'an unzipped folder is refused with the clone command', () => {
  const zipped = path.join(tmp, 'unzipped'); put(zipped, 'lib/version.js', ver('0.60.44'));
  const r = U.run({ root: zipped, log });
  assert.ok(!r.ok && r.code === 'NOT_A_CLONE' && /git clone https:\/\/github\.com\/HorrisEllis\/Nexus\.git/.test(r.why), JSON.stringify(r));
});
test('UP-02', 'current: says so; --check reports and changes nothing', () => {
  const r = U.run({ root: mine, log });
  assert.ok(r.ok && !r.updated && /already the latest/.test(say[say.length - 1]));
  put(dev, 'lib/version.js', ver('0.60.48')); put(dev, 'package.json', '{"name":"x","v":2}\n');
  g(dev, 'commit', '-qam', 'two'); g(dev, 'push', '-q', 'origin', 'main');
  const c = U.run({ root: mine, check: true, log });
  assert.ok(c.ok && !c.updated && c.ahead === 1 && c.deps && U.versionAt(mine) === '0.60.47', JSON.stringify(c));
});
test('UP-03', 'an update fast-forwards, says before → after, and leaves data/ alone', () => {
  const p = U.plan({ root: mine }); assert.ok(p.ok && p.ahead === 1);
  // the npm install step is the real one on his machine; here dependencies are left as they are
  fs.writeFileSync(path.join(dev, 'package.json'), '{"name":"x","v":2}\n');
  const pkgSame = { ...p };
  execFileSync('git', ['pull', '--ff-only', '-q', 'origin', 'main'], { cwd: mine });
  assert.strictEqual(U.versionAt(mine), '0.60.48');
  assert.strictEqual(fs.readFileSync(path.join(mine, 'data/state.json'), 'utf8'), '{"his":"state"}', 'his state is untouched');
  put(dev, 'lib/version.js', ver('0.60.49')); g(dev, 'commit', '-qam', 'three'); g(dev, 'push', '-q', 'origin', 'main');
  const r = U.run({ root: mine, log });
  assert.ok(r.ok && r.updated && r.from === '0.60.48' && r.to === '0.60.49' && !r.deps, JSON.stringify(r));
  assert.match(say[say.length - 1], /Nexus 0\.60\.48 → 0\.60\.49/);
  assert.ok(pkgSame.deps, 'a package.json change is noticed (npm install runs on his machine)');
});
test('UP-04', 'local edits the update would overwrite are refused, named', () => {
  put(mine, 'lib/version.js', ver('9.9.9'));   // his own edit
  put(dev, 'lib/version.js', ver('0.60.50')); g(dev, 'commit', '-qam', 'four'); g(dev, 'push', '-q', 'origin', 'main');
  const r = U.run({ root: mine, log });
  assert.ok(!r.ok && r.code === 'LOCAL_EDITS' && /lib\/version\.js/.test(r.why), JSON.stringify(r));
  assert.strictEqual(U.versionAt(mine), '9.9.9', 'nothing was overwritten');
});
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n  ${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
