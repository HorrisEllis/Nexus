'use strict';
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-skip-and-page-agents.test.js — AC7 and AC5, 0.60.335. Spec: idearium/spec/agent-control.spec MOD-AC-SKIP, MOD-AC-PAGE-AGENTS.
 * James, 2026-10-31: "also its too back and fourth lke we are. I also want skip buttons which will autofill generic/default values in each
 * step of the pipeline." · "so i can change the agemnts for the spacial void and spec workshop."
 *   SK-01 a skip fills only empty sections, each marked (default); his text is untouched; nothing to fill is said
 *   SK-02 the plan step's default is the no-agent plan; the Void's is normal · stable; an unknown step says it has none
 *   PA-01 learned by default; his choice is stored, read back, and goes first for its page only; 'learned' undoes it; a bad page refused
 *   PA-02 wired: the skip route and button, the plan skip, the rows, and _agentAsk putting his choice first
 */
const assert = require('assert'), path = require('path'), fs = require('fs');
const ROOT = path.join(__dirname, '..', '..');
let passed = 0, failed = 0;
async function test(id, d, fn) { try { await fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${e.message}`); failed++; } }
(async () => {
  console.log('\n⬡  skip buttons and his agents per page (AC7, AC5)\n');
  const SD = await import(path.join(ROOT, 'idearium/lib/step-defaults.js'));
  const PA = await import(path.join(ROOT, 'idearium/lib/page-agents.js'));
  await test('SK-01', 'only empty sections filled, each marked; his text untouched', () => {
    const d = SD.defaultsFor('workshop.sections', { session: { sections: [{ id: 'a', title: 'Purpose', body: '' }, { id: 'b', title: 'Mine', body: 'his words' }, { id: 'c', title: 'Build order', body: '  ' }] } });
    assert.deepStrictEqual(d.values.sections.map(x => x.id), ['a', 'c']);
    assert.ok(d.values.sections.every(x => x.default && x.body.startsWith('(default)')) && d.marked);
    assert.ok(/foundation first/.test(d.values.sections[1].body));
    assert.ok(/nothing to fill/.test(SD.defaultsFor('workshop.sections', { session: { sections: [{ id: 'b', title: 'x', body: 'y' }] } }).none));
  });
  await test('SK-02', 'the plan skip is the no-agent plan; the Void is normal · stable; unknown steps say so', () => {
    assert.deepStrictEqual(SD.defaultsFor('workshop.plan').values, { plan: 'derive' });
    assert.deepStrictEqual(SD.defaultsFor('void.sliders').values, { creativity: 0, stability: 0 });
    assert.ok(/no defaults/.test(SD.defaultsFor('nope').none));
  });
  await test('PA-01', 'learned by default; his choice first for its page; learned undoes it; a bad page refused', () => {
    assert.deepStrictEqual(PA.get().void, { mode: 'learned' }); assert.strictEqual(PA.routeFirst('page:void'), null);
    PA.set({ void: 'claude:sonnet' }, { providers: ['claude', 'ollama'] });
    assert.deepStrictEqual(PA.routeFirst('page:void'), { provider: 'claude', model: 'sonnet' }); assert.strictEqual(PA.routeFirst('page:workshop'), null);
    assert.ok(/no provider "zork"/.test(PA.set({ workshop: 'zork' }, { providers: ['claude'] }).error));
    assert.ok(/no page/.test(PA.set({ attic: 'claude' }).error));
    PA.set({ void: 'learned' }); assert.strictEqual(PA.routeFirst('page:void'), null);
  });
  await test('PA-02', 'wired: route, button, plan skip, rows, and his choice first in _agentAsk', () => {
    const api = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8'), ws = fs.readFileSync(path.join(ROOT, 'idearium/ui/js/workshop.js'), 'utf8');
    const html = fs.readFileSync(path.join(ROOT, 'idearium/ui/workshop.html'), 'utf8'), rc = fs.readFileSync(path.join(ROOT, 'idearium/cli/route-commands.js'), 'utf8');
    assert.ok(/'workshop\.skip'\]/.test(api) && /case 'workshop\.skip'/.test(api) && /'settings\.page-agents'\]/.test(api));
    assert.ok(/routeFirst\(jobType\)/.test(api) && /his choice for this page/.test(api));
    assert.ok(/id="skipBtn"/.test(html) && /\/skip`/.test(ws) && /SKIP — PLAN FROM THE SPEC NOW/.test(ws));
    assert.ok(/key: 'settings\.page-agents'/.test(rc) && /key: 'workshop\.skip'/.test(rc));
  });
  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
