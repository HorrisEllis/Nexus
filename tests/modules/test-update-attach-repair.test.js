'use strict';
// 2026-11-15 UPA1 — a folder with a .git but no readable origin is not "no .git yet": it is said as broken and repaired on the next check
require('../../lib/test-sandbox.js').ensure();
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
const U = require('../../lib/nexus-update.js');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upa1-'));
fs.writeFileSync(path.join(dir, 'VERSION'), '0.0.0\n');
execFileSync('git', ['init', '-q'], { cwd: dir });
const d = U.detect({ root: dir });
assert.strictEqual(d.driver, 'broken-git', 'a .git with no origin is broken, not a plain folder');
assert.match(d.why, /cannot read its GitHub origin/);
assert.doesNotMatch(d.why, /no \.git yet/);
const r = U.check({ root: dir, fetch: false, attach: false });
assert.strictEqual(r.ok, false); assert.match(r.error, /origin/);
console.log('update attach repair: 2 passed, 0 failed');
