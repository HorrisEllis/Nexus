'use strict';
// P5 — faculty-as-tool adapters (docs/copilot-omniscience-phasemap.spec). The
// copilot faculties (module-builder, adversarial, axiom-manager, analysis) are
// now callable through the agentic loop as tools, WITHOUT moving them (§16.5).
// Both copilot's and Guardian's loops get them.

// Silence jaa store logging so the runner parses the result line.
const _log = console.log;
console.log = (...a) => { if (typeof a[0] === 'string' && a[0].startsWith('[jaa]')) return; _log(...a); };

const assert = require('assert');
const path = require('path');
let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); _log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { _log(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const ROOT = path.join(__dirname, '../..');
const at = require(path.join(ROOT, 'lib/agent-tools'));

(async () => {
  await test('T-001', 'all seven faculty tools are registered alongside the base tools', () => {
    const names = at.getToolSchemas().map(s => (s.function ? s.function.name : s.name));
    for (const t of ['module_builder', 'run_adversarial', 'axiom_check', 'analyze', 'intuition', 'mastermind', 'synthesize']) {
      assert.ok(names.includes(t), `${t} must be registered`);
    }
    assert.ok(at.TOOLS.size >= 17, `expected >=17 tools, got ${at.TOOLS.size}`);
  });

  await test('T-002', 'axiom_check executes through the loop and returns a real result', async () => {
    const r = await at.executeTool('axiom_check', { text: 'a proposed action to check' });
    assert.ok(r && (r.ok || r.result), 'axiom_check must return a real result');
  });

  await test('T-003', 'faculty tools validate their required params (fail loud, not silent)', async () => {
    const r = await at.executeTool('module_builder', {});
    assert.ok(r.error, 'missing description must error, not silently proceed');
  });

  await test('T-004', 'the faculties were WRAPPED, not moved — they still live in copilot/', () => {
    const fs = require('fs');
    for (const f of ['module-builder', 'adversarial', 'axiom-manager', 'analysis']) {
      assert.ok(fs.existsSync(path.join(ROOT, 'copilot', `${f}.js`)), `copilot/${f}.js must still exist (§16.5)`);
    }
    // and the adapter file is separate, in agent-tools
    assert.ok(fs.existsSync(path.join(ROOT, 'lib/agent-tools/tools/faculty/faculty-tools.js')), 'adapters live in agent-tools');
  });

  // §ADDED 2026-09-02 — James: "agent tool for analysis, intuition,
  // mastermind, synthesis... co-pilot should have all those tools,
  // same with guardian agents." Real, sovereign-transport-based tools —
  // these make real HTTP calls (cortex/orchestrator) that aren't
  // running in this test environment, so these tests pin real,
  // reachable-in-code-not-network things: registration, required-param
  // validation, and (unlike faculty tools T-004 above) that these
  // three do NOT live in copilot/ — intuition/mastermind are cortex's
  // own, synthesize reaches orchestrator's own officiator route.
  await test('T-005', 'intuition validates its required prompt param', async () => {
    const r = await at.executeTool('intuition', {});
    assert.ok(r.error, 'missing prompt must error, not silently proceed');
  });

  await test('T-006', 'mastermind validates its required prompt param', async () => {
    const r = await at.executeTool('mastermind', {});
    assert.ok(r.error, 'missing prompt must error, not silently proceed');
  });

  // §MERGED 2026-09-02 — a parallel session independently built this
  // same tool (named `synthesize`, contextText param, submit:true/false)
  // and reached officiator.js via a direct require() — a real cross-
  // process AX-010 violation, since officiator.js runs in orchestrator's
  // own process and this file is loaded by both copilot's and
  // guardian's. Reconciled: kept their name/design, fixed the transport
  // to route through orchestrator's real POST /api/officiator/synthesize
  // (see faculty-tools.js's own merge comment for the full reasoning).
  await test('T-007', 'synthesize validates its required contextText param', async () => {
    const r = await at.executeTool('synthesize', {});
    assert.ok(r.error && r.error.includes('contextText is required'), 'missing contextText must error through the real function, not a fake success');
  });

  await test('T-008', 'intuition, mastermind, and synthesize all reach their real backends over sovereign transport, not a direct require — the same AX-010 class fix this session already applied twice elsewhere', () => {
    const src = require('fs').readFileSync(path.join(ROOT, 'lib/agent-tools/tools/faculty/faculty-tools.js'), 'utf8');
    const intuitionBlock = src.slice(src.indexOf("name: 'intuition'"), src.indexOf("name: 'mastermind'"));
    const mastermindBlock = src.slice(src.indexOf("name: 'mastermind'"), src.indexOf("const synthesizeTool"));
    const synthesizeBlock = src.slice(src.indexOf("const synthesizeTool"));
    assert.ok(intuitionBlock.includes("require('../../../nexus-client.js')"), 'intuition must use sovereign transport');
    assert.ok(mastermindBlock.includes("require('../../../nexus-client.js')"), 'mastermind must use sovereign transport');
    assert.ok(synthesizeBlock.includes("require('../../../nexus-client.js')"), 'synthesize must use sovereign transport, not a direct require of officiator.js');
    assert.ok(!synthesizeBlock.match(/require\(['"].*cortex\/core\/raid\/officiator/), 'synthesize must NOT directly require officiator.js — that runs in a different process');
  });

  _log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
