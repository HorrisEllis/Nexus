'use strict';
/**
 * tests/modules/test-pipeline-method.test.js — a task's method (0.60.614, cos/automation/method.eg).
 * James, 2026-11-20: "Like you can set the method or framework per gate or step. Remember the pipeline and gates are agnostic." · "framework
 * per step. or pipeline. like i want it to use my framework."
 *   PM-01  a task names its method (a framework's steps, one per gate of the step); COS resolves it from its frameworks folder; the step reads
 *          {{vars.method}}; a task with none reads null
 *   PM-02  a method naming what does not exist fails the task and says so, and the step never runs
 */
require('../../lib/test-sandbox.js').ensure();
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
process.env.NEXUS_DATA_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-test-'));
const fwDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-fw-'));
fs.writeFileSync(path.join(fwDir, 'tk.framework'), '# a framework\n```json framework-steps\n' + JSON.stringify({ id: 'tk', status: 'draft', steps: [
  { id: 'gap', section: 'Section 3', does: 'frame first', gives: ['gap'] }, { id: 'hostile', section: 'Section 10', does: 'attack it', gives: ['output'] }] }) + '\n```\n');
process.env.COS_FRAMEWORKS_DIR = fwDir;
const ROOT = path.join(__dirname, '..', '..');
let passed = 0, failed = 0;
async function test(id, name, fn) { try { await fn(); passed++; console.log(`  ✓ ${id} ${name}`); } catch (e) { failed++; console.log(`  ✗ ${id} ${name}\n    ${e.stack.split('\n').slice(0, 3).join('\n    ')}`); } }

(async () => {
  const PL = require(path.join(ROOT, 'cos/automation/pipeline.js'));
  const { AutomationEngine } = require(path.join(ROOT, 'cos/automation/engine.js'));
  const asked = [];
  const A = new AutomationEngine({ askAgentFn: async ({ agentKey, prompt }) => { asked.push(prompt); return { text: 'ok' }; } });
  const P = new PL.Pipelines(A);
  const agent = (prompt) => ({ type: 'agent', config: { agentKey: 'a', prompt, await: true } });

  await test('PM-01', 'a task names its method; COS resolves it; the step reads {{vars.method}}', async () => {
    const c = P.create({ name: 'Method per step', tasks: [
      { id: 'one', step: agent('M={{vars.method}}'), method: { diagnose: { framework: 'tk', steps: ['gap'] }, test: { framework: 'tk', steps: ['hostile'] } } },
      { id: 'two', step: agent('N={{vars.method}}'), depends_on: ['one'] }] });
    assert.ok(c.ok, JSON.stringify(c));
    const r = await P.run(c.pipeline.id);
    assert.strictEqual(r.status, 'ok', JSON.stringify(r.run.tasks));
    const got = asked.find(x => x.startsWith('M=')); let m; try { m = JSON.parse(got.slice(2)); } catch (e) { throw new Error('not JSON: ' + got); }
    assert.deepStrictEqual(m, { diagnose: '- Section 3: frame first', test: '- Section 10: attack it' });
    assert.ok(asked.includes('N=null'), 'a task with no method reads null: ' + JSON.stringify(asked));
  });

  await test('PM-02', 'a method naming what does not exist fails the task, said, and the step never runs', async () => {
    const before = asked.length;
    const c = P.create({ name: 'Bad method', tasks: [{ id: 'x', step: agent('never'), method: { framework: 'ghost' } }] });
    const r = await P.run(c.pipeline.id);
    assert.ok(r.status !== 'ok' && /method: no framework ghost/.test(r.run.tasks.x.error || ''), JSON.stringify(r.run.tasks.x));
    assert.strictEqual(asked.length, before, 'the step did not run');
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
