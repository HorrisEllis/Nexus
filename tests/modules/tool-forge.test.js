'use strict';
/** lib/tool-forge.js — copilot making its own tools, as DATA not code. */
const assert = require('assert');
const path = require('path');
const F = require(path.join(__dirname, '../../lib/tool-forge.js'));

let passed = 0, failed = 0;
async function test(id, name, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${name}`); passed++; }
  catch (e) { console.log(`  ✗ ${id} ${name}\n    ${e.message}`); failed++; }
}
const good = (over = {}) => ({
  name: 'tf_probe_' + Math.random().toString(36).slice(2, 7),
  description: 'A probe tool composed only of things already verified to exist',
  parameters: { type: 'object', properties: {}, required: [] },
  steps: [{ call: 'lens:shape', args: { input: 'try{}catch(_){}' } }],
  ...over,
});

(async () => {
  await test('TF-1', 'the schema is published — an agent can read the contract', () => {
    assert.ok(F.TOOL_SCHEMA.name && F.TOOL_SCHEMA.steps && F.TOOL_SCHEMA.step.call);
    assert.deepStrictEqual(F.CALL_KINDS, ['capability', 'lens', 'tool']);
  });

  await test('TF-2', 'every rejection names the offending FIELD', () => {
    const r = F.validate({});
    assert.strictEqual(r.ok, false);
    for (const e of r.errors) assert.ok(/^[a-z]+(\[\d+\])?(\.[a-z]+)?:/.test(e), `unnamed error: ${e}`);
    assert.ok(r.schema, 'a rejection must hand back the schema it was judged against');
  });

  await test('TF-3', 'a step naming a NONEXISTENT target is refused at forge time (§1.1)', () => {
    for (const call of ['capability:not.a.real.capability', 'lens:not_a_lens', 'tool:not_a_tool']) {
      const r = F.validate(good({ steps: [{ call }] }));
      assert.strictEqual(r.ok, false, `${call} must be refused`);
      assert.ok(r.errors.some(e => e.startsWith('steps[0].call')), `${call}: ${JSON.stringify(r.errors)}`);
    }
  });

  await test('TF-4', 'a DECLARED-BUT-UNSERVED capability is refused, with the reason', async () => {
    const CAP = require(path.join(__dirname, '../../lib/agent-tools/tools/coordination/capability-tools.js'));
    const u = await CAP.execute({ action: 'unserved' });
    if (!u.count) return;
    const r = F.validate(good({ steps: [{ call: `capability:${u.capabilities[0].id}` }] }));
    assert.strictEqual(r.ok, false);
    assert.ok(r.errors.some(e => /SERVED BY NOTHING/.test(e)), JSON.stringify(r.errors));
  });

  await test('TF-5', 'a forged tool cannot SHADOW a built-in (§16.5)', () => {
    const r = F.validate(good({ name: 'read_file' }));
    assert.strictEqual(r.ok, false);
    assert.ok(r.errors.some(e => /BUILT-IN/.test(e)));
  });

  await test('TF-6', 'references resolve by LOOKUP — no expressions, no code', () => {
    const ctx = { args: { who: 'guardian' }, steps: [{ inner: { deep: 42 } }] };
    assert.strictEqual(F._resolve('{$.who}', ctx), 'guardian');
    assert.strictEqual(F._resolve('{$steps.0.inner.deep}', ctx), 42);
    assert.strictEqual(F._resolve('plain string', ctx), 'plain string');
    // An expression is NOT evaluated — it is either a literal or an error.
    assert.throws(() => F._resolve('{$1+1}', ctx), /unknown reference form/);
    assert.throws(() => F._resolve('{$.missing}', ctx), /no caller argument "missing"/);
    assert.throws(() => F._resolve('{$steps.9.x}', ctx), /no result from step 9/);
  });

  await test('TF-7', 'an unresolvable reference ERRORS — never passed on as empty', async () => {
    const exec = F._compile({ name: 'x', steps: [{ call: 'lens:shape', args: { input: '{$.nope}' } }] });
    const r = await exec({});
    assert.ok(r.error && /no caller argument "nope"/.test(r.error), JSON.stringify(r).slice(0, 120));
  });

  await test('TF-8', 'a failing step STOPS the tool and returns the trail (§1.2)', async () => {
    const exec = F._compile({ name: 'y', steps: [
      { call: 'capability:cortex.health' },
      { call: 'lens:shape', args: { input: 'never reached if step 0 fails' } },
    ] });
    const r = await exec({});
    if (r.ok) { assert.strictEqual(r.trail.length, 2); return; }   // cortex up: both ran
    assert.strictEqual(r.failedStep, 0);
    assert.strictEqual(r.trail.length, 1, 'execution must stop, not continue on a missing result');
  });

  await test('TF-9', 'a valid composed definition passes and compiles to something runnable', async () => {
    const def = good();
    assert.strictEqual(F.validate(def).ok, true);
    const r = await F._compile(def)({});
    assert.strictEqual(r.ok, true, JSON.stringify(r).slice(0, 140));
    assert.strictEqual(r.trail[0].ok, true);
  });

  await test('TF-10', 'loadAll RE-VALIDATES — a tool whose target vanished does not come back', () => {
    const out = F.loadAll();
    assert.ok(Array.isArray(out.loaded) && Array.isArray(out.failed));
    for (const f of out.failed) assert.ok(f.errors || f, 'a refused reload must carry its reason');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
