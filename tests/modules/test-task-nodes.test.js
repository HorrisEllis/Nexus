'use strict';
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-task-nodes.test.js — OC1, 0.60.348. Spec: docs/orchestration-console.spec MOD-OC-TASK-NODE.
 * James, 2026-11-01: "scheduler with a calender with persistent data, .task nodes. .pipeline nodes  expand the taxonomy"
 *   TN-01  a task written, read back equal (defaults filled, his time zone), one file <id>.task, the envelope of the other nodes
 *   TN-02  refused with a bad do.kind, a kind this engine does not know, a bad cron, no by — every problem listed, nothing written
 *   TN-03  saved again: changed, createdAt kept; listed; a broken file listed in bad, never dropped
 *   TN-04  archived under _archive/<date>/, not deleted
 *   TN-05  lib/node-schemas/schema.task names every field the module writes
 */
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const yaml = require('js-yaml');
const ROOT = path.join(__dirname, '..', '..');
const T = require(path.join(ROOT, 'lib/automation/task-node.js'));
const { KNOWN_TYPES } = require(path.join(ROOT, 'lib/automation/steps.js'));
let passed = 0, failed = 0;
function test(id, d, fn) { try { fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${(e.stack || e.message).split('\n').slice(0, 4).join('\n    ')}`); failed++; } }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-nodes-'));
const TASK = { id: 'fiverr-gig-daily', title: 'Refresh the gig every morning', do: { kind: 'pipeline', ref: 'fiverr-overview', args: { gig: 'ai-agent' } },
  target: { system: 'clear-glass' }, schedule: { cron: '41 8 * * 1-5' }, by: 'person', tags: ['fiverr'] };

console.log('\n⬡  .task nodes (OC1)\n');
test('TN-01', 'written, read back equal, one file, the shared envelope', () => {
  const r = T.saveTask(TASK, { dir, stepTypes: KNOWN_TYPES });
  assert.ok(r.ok && r.file === path.join(dir, 'fiverr-gig-daily.task') && !r.changed, JSON.stringify(r));
  const doc = yaml.load(fs.readFileSync(r.file, 'utf8'));
  assert.deepStrictEqual([doc.envelope, doc.type, doc.id, doc.system], [1, 'task', 'fiverr-gig-daily', 'clear-glass']);
  const back = T.loadTask('fiverr-gig-daily', { dir });
  for (const k of ['id', 'title', 'do', 'target', 'by', 'tags']) assert.deepStrictEqual(back[k], TASK[k], k);
  assert.deepStrictEqual([back.schedule.cron, back.schedule.tz, back.schedule.catchUp, back.concurrency, back.priority], ['41 8 * * 1-5', 'America/Los_Angeles', 'once', 'skip-if-running', 5]);
});
test('TN-02', 'refused: bad kind, unknown engine kind, bad cron, no by — every problem, nothing written', () => {
  const r = T.saveTask({ id: 'Bad Id', do: { kind: 'teleport', ref: 'x' }, schedule: { cron: '99 * * * *', every: 60000 } }, { dir, stepTypes: KNOWN_TYPES });
  assert.ok(!r.ok); const all = r.problems.join(' | ');
  for (const re of [/^id:/m, /do\.kind "teleport"/, /by:/, /exactly one of cron, at, every/, /schedule\.cron:/]) assert.match(all, re);
  assert.ok(!fs.existsSync(path.join(dir, 'Bad Id.task')));
  const r2 = T.validateTask({ ...TASK, do: { kind: 'macro', ref: 'm' } }, { stepTypes: ['browser', 'http'] });
  assert.ok(!r2.ok && /not a step this engine knows/.test(r2.problems[0]), JSON.stringify(r2));
});
test('TN-03', 'saved again: changed, createdAt kept; listed; a broken file in bad', () => {
  const first = T.loadTask('fiverr-gig-daily', { dir }).createdAt;
  const r = T.saveTask({ ...TASK, title: 'Refresh the gig (weekdays)' }, { dir, stepTypes: KNOWN_TYPES });
  assert.ok(r.ok && r.changed); const back = T.loadTask('fiverr-gig-daily', { dir });
  assert.strictEqual(back.title, 'Refresh the gig (weekdays)'); assert.strictEqual(back.createdAt, first);
  fs.writeFileSync(path.join(dir, 'broken.task'), 'type: macro\npayload: {}\n');
  const l = T.listTasks({ dir }); assert.deepStrictEqual(l.map(t => t.id), ['fiverr-gig-daily']); assert.strictEqual(l.bad[0].file, 'broken.task');
});
test('TN-04', 'archived, not deleted', () => {
  const r = T.archiveTask('fiverr-gig-daily', { dir, by: 'person' });
  assert.ok(r.ok && fs.existsSync(r.file) && /_archive/.test(r.file)); assert.strictEqual(T.loadTask('fiverr-gig-daily', { dir }), null);
});
test('TN-05', 'the schema names every field the module writes', () => {
  const s = yaml.load(fs.readFileSync(path.join(ROOT, 'lib/node-schemas/schema.task'), 'utf8'));
  const written = Object.keys(T.parseTask(T.taskNode(TASK)));
  for (const k of written) assert.ok(s.payload.fields[k], `schema.task lacks ${k}`);
});
fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
