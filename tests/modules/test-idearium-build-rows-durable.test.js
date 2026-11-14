'use strict';
// 0.60.539 — Idearium's build records survive a hard stop. His run of the Idearium build, 2026-11-14: Idearium restarted mid-build and
// GET /api/repos/nexus/phases/runs?phase=CS12_the_mover_is_proven answered runs: [] — the rows were still in the store's debounce.
// James, 2026-11-14: "stop using memory for storage. persistence is non negiatiable until the contract has been fullfilled, or dag is complete"
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
let passed = 0, failed = 0;
function t(id, name, fn) { try { fn(); passed++; console.log(`  ✓ ${id} ${name}`); } catch (e) { failed++; console.log(`  ✗ ${id} ${name}: ${e.message}`); } }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jaa-durable-'));
const env = { ...process.env, JAA_DATA_DIR: dir };
const db = 'file://' + path.join(ROOT, 'idearium/lib/db.js').replace(/\\/g, '/');
const kill = (table) => spawnSync(process.execPath, ['--input-type=module', '-e',
  `import { appendRow } from '${db}'; appendRow('${table}', { uuid: 'b-1-started', repoUuid: 'r', phase: 'CS12', state: 'building', ts: Date.now() }); process.kill(process.pid, 'SIGKILL');`], { env, encoding: 'utf8' });
const read = (table) => spawnSync(process.execPath, ['--input-type=module', '-e',
  `import { loadTable } from '${db}'; console.log(JSON.stringify(loadTable('${table}').map(r => r.uuid)));`], { env, encoding: 'utf8' });
t('DR-01', 'a build row written, then the process killed at once (no exit, no flush): the row is on disk for the next process', () => {
  const k = kill('idearium_phase_runs'); assert.strictEqual(k.signal, 'SIGKILL', k.stderr);
  const r = read('idearium_phase_runs'); assert.match(r.stdout, /b-1-started/, r.stdout + r.stderr);
});
t('DR-02', 'a table not marked durable still waits for its debounce (the change is only where a restart must not lose rows)', () => {
  kill('some_other_table'); const r = read('some_other_table'); assert.doesNotMatch(r.stdout, /b-1-started/, r.stdout);
});
fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
