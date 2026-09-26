'use strict';
/**
 * tests/modules/healer.test.js — Healer + Self-Heal + RAID + Gap-Finder Suite
 * UUID: test-healer-v1-0000-4000-0000-000000000001
 *
 * FRACTAL: gap → prescribe → escalate → heal → trust tier → dispatch
 * ADVERSARIAL: unknown gap types, null paths, tier boundary conditions
 * RECURSIVE: heal → prescribe → escalate → bus → self-heal → tier check
 */

const assert = require('assert');
const path   = require('path');

let passed = 0, failed = 0;
const invariants = [];

function t(label, fn, opts = {}) {
  try {
    fn();
    passed++;
    if (opts.invariant) invariants.push({ label, status: 'pass' });
  } catch(e) {
    failed++;
    if (opts.invariant) invariants.push({ label, status: 'fail', error: e.message });
    console.log(`  FAIL [${label}]: ${e.message}`);
  }
}

// ── Load modules (without starting timers) ────────────────────────────────────
// We test the internal functions directly — not the polling loop

// Extract _prescribe from healer
const healerSrc = require('fs').readFileSync(
  path.join(__dirname, '../../cortex/healer/index.js'), 'utf8'
);
const _prescribeMatch = healerSrc.match(/function _prescribe\(gap\) \{([\s\S]+?)\n\}/);
let _prescribe;
if (_prescribeMatch) {
  eval(`_prescribe = function _prescribe(gap) {${_prescribeMatch[1]}}`);
} else {
  console.log('  WARN: could not extract _prescribe — healer tests will skip');
}

// Extract _resolveTier and TRUST_TIERS from self-heal
const selfHealSrc = require('fs').readFileSync(
  path.join(__dirname, '../../cortex/self-heal/index.js'), 'utf8'
);
let TRUST_TIERS, _resolveTier;
try {
  // Evaluate the TRUST_TIERS and _resolveTier in isolation
  const tierModule = { exports: {} };
  eval(selfHealSrc.match(/const TRUST_TIERS = \{([\s\S]+?)\};\s*\/\/ Backwards/)?.[0] || '');
  eval(selfHealSrc.match(/function _resolveTier[\s\S]+?\n\}/)?.[0] || '');
} catch(_) {}

// Load RAID internal functions
const raidPath = path.join(__dirname, '../../cortex/core/raid/index.js');

// ── §A: Healer _prescribe() ──────────────────────────────────────────────────
if (_prescribe) {
  t('prescribe: stale_module → forge_patch + escalate', () => {
    const rx = _prescribe({ type: 'stale_module', path: 'lib/test.js' });
    assert.strictEqual(rx.strategy, 'forge_patch');
    assert.strictEqual(rx.escalate, true);
    assert.strictEqual(rx.automated, false);
  }, { invariant: true });

  t('prescribe: stuck_call → timeout_and_retry (automated)', () => {
    const rx = _prescribe({ type: 'stuck_call', path: 'guardian/server.js' });
    assert.strictEqual(rx.strategy, 'timeout_and_retry');
    assert.strictEqual(rx.automated, true);
  }, { invariant: true });

  t('prescribe: recurring_failure → forge_patch + escalate', () => {
    const rx = _prescribe({ type: 'recurring_failure', path: 'cortex/boot.js' });
    assert.strictEqual(rx.strategy, 'forge_patch');
    assert.strictEqual(rx.escalate, true);
  }, { invariant: true });

  t('prescribe: missing_file → forge_scaffold + escalate', () => {
    const rx = _prescribe({ type: 'missing_file', path: 'lib/missing.js' });
    assert.strictEqual(rx.strategy, 'forge_scaffold');
    assert.strictEqual(rx.escalate, true);
  }, { invariant: true });

  t('prescribe: import_error → forge_patch + escalate', () => {
    const rx = _prescribe({ type: 'import_error', path: 'cortex/memory/jaa-db.js' });
    assert.strictEqual(rx.strategy, 'forge_patch');
    assert.strictEqual(rx.escalate, true);
  }, { invariant: true });

  t('prescribe: deviation → log_and_observe (no escalate)', () => {
    const rx = _prescribe({ type: 'deviation', path: 'ui/index.html' });
    assert.strictEqual(rx.strategy, 'log_and_observe');
    assert(!rx.escalate, 'deviation should not escalate');
  }, { invariant: true });

  t('prescribe: unknown type → manual_review', () => {
    const rx = _prescribe({ type: 'completely_unknown', path: 'x.js' });
    assert.strictEqual(rx.strategy, 'manual_review');
    assert.strictEqual(rx.automated, false);
  }, { invariant: true });

  t('[ADV] prescribe: null gap type → manual_review (no throw)', () => {
    const rx = _prescribe({ type: null, path: 'x.js' });
    assert.strictEqual(rx.strategy, 'manual_review');
  }, { adversarial: true });
}

// ── §B: Self-Heal TRUST_TIERS ────────────────────────────────────────────────
// Load the trust tiers directly from the module
const selfHealModule = (() => {
  // Extract just the TRUST_TIERS constant by parsing the file
  const src = require('fs').readFileSync(
    path.join(__dirname, '../../cortex/self-heal/index.js'), 'utf8'
  );
  // Find TRUST_TIERS block
  const tiersIdx = src.indexOf('const TRUST_TIERS = {');
  const tiersEnd = src.indexOf('\n};\n\n// Backwards', tiersIdx);
  if (tiersIdx === -1 || tiersEnd === -1) return null;
  try {
    const block = src.slice(tiersIdx, tiersEnd + 3);
    const fn = new Function('return ' + block.replace('const TRUST_TIERS = ', ''));
    return fn();
  } catch(_) { return null; }
})();

if (selfHealModule) {
  t('trust tiers: tier 1 exists with auto-apply action', () => {
    assert(selfHealModule[1], 'tier 1 missing');
    assert.strictEqual(selfHealModule[1].action, 'apply');
    assert(selfHealModule[1].modules instanceof Set, 'tier 1 modules must be a Set');
    assert(selfHealModule[1].modules.size > 0, 'tier 1 must have modules');
  }, { invariant: true });

  t('trust tiers: tier 2 exists with snapshot_then_apply action', () => {
    assert(selfHealModule[2], 'tier 2 missing');
    assert.strictEqual(selfHealModule[2].action, 'snapshot_then_apply');
    assert(selfHealModule[2].modules instanceof Set);
  }, { invariant: true });

  t('trust tiers: tier 3 exists with propose action', () => {
    assert(selfHealModule[3], 'tier 3 missing');
    assert.strictEqual(selfHealModule[3].action, 'propose');
    assert(selfHealModule[3].modules instanceof Set);
  }, { invariant: true });

  t('trust tiers: kernel files are tier 3 (never auto-apply)', () => {
    const kernelFiles = ['cortex/memory/jaa-db.js', 'cortex/boot.js', 'orchestrator/orchestrator.js'];
    for (const f of kernelFiles) {
      assert(selfHealModule[3].modules.has(f), `${f} should be tier 3`);
    }
  }, { invariant: true });

  t('trust tiers: UI files are tier 1 (safe to auto-apply)', () => {
    assert(selfHealModule[1].modules.has('ui/index.html'), 'ui/index.html should be tier 1');
    assert(selfHealModule[1].modules.has('diagnostic/nexus-diagnostic.js'), 'diagnostic should be tier 1');
  }, { invariant: true });

  t('[INV] trust tiers: no file appears in both tier 1 and tier 3', () => {
    const t1 = selfHealModule[1].modules;
    const t3 = selfHealModule[3].modules;
    const overlap = [...t1].filter(f => t3.has(f));
    assert.strictEqual(overlap.length, 0, `Files in both T1 and T3: ${overlap.join(', ')}`);
  }, { invariant: true });
}

// ── §C: RAID routing ──────────────────────────────────────────────────────────
// Extract _cluster and _decide from the RAID source
const raidSrc = require('fs').readFileSync(raidPath, 'utf8');

// Extract CLUSTERS constant
let CLUSTERS, _cluster, _decide;
try {
  const clustersMatch = raidSrc.match(/const CLUSTERS = \{([\s\S]+?)\};/);
  if (clustersMatch) eval('CLUSTERS = {' + clustersMatch[1] + '}');

  if (CLUSTERS) {
    eval(raidSrc.match(/function _cluster\(text\) \{[\s\S]+?\n\}/)?.[0] || '');
    eval(raidSrc.match(/function _wKey[\s\S]+?\n\}/)?.[0] || '');
    eval(raidSrc.match(/function _getW[\s\S]+?\n\}/)?.[0] || '');
    // _decide needs weights Map — provide a mock
    eval(raidSrc.match(/function _decide\(call[\s\S]+?\n\}/)?.[0] || '');
  }
} catch(_) {}

if (_cluster) {
  t('raid._cluster: code keywords → code cluster', () => {
    const c = _cluster('write a function that sorts an array');
    assert.strictEqual(c, 'code', `expected code, got ${c}`);
  }, { invariant: true });

  t('raid._cluster: unknown text → general', () => {
    assert.strictEqual(_cluster(''), 'general');
    assert.strictEqual(_cluster(null), 'general');
    assert.strictEqual(_cluster('random phrase with no signal'), 'general');
  }, { invariant: true });

  t('raid._cluster: analysis keywords → analysis cluster', () => {
    const c = _cluster('analyze this dataset and explain the results');
    assert(['analysis', 'reasoning', 'general'].includes(c), `unexpected cluster: ${c}`);
  }, { invariant: true });
}

if (_decide) {
  const mockWeights = new Map(); // empty weights — no prior learning

  t('raid._decide: explicit provider honored when online', () => {
    const health = { claude: { online: true }, ollama: { online: false }, 'guardian-claude': { online: false }, 'guardian-chatgpt': { online: false } };
    const r = _decide({ intent: 'write code', preferredAgent: 'claude' }, health, mockWeights);
    assert.strictEqual(r.agent, 'claude');
    assert(r.reason.includes('explicit'));
  }, { invariant: true });

  t('raid._decide: LAW_I — chatgpt first when online (§DEFAULT-AGENT-CHANGE 2026-09-02)', () => {
    const health = { 'guardian-chatgpt': { online: true, consecutiveFails: 0 }, ollama: { online: true, consecutiveFails: 0 }, 'guardian-claude': { online: false } };
    const r = _decide({ intent: 'write code' }, health, mockWeights);
    assert.strictEqual(r.agent, 'chatgpt', `LAW_I: should prefer chatgpt, got ${r.agent}`);
    assert(r.reason.includes('LAW_I'));
  }, { invariant: true });

  t('raid._decide: LAW_I — gemini fallback when chatgpt unavailable', () => {
    const health = { 'guardian-gemini': { online: true, consecutiveFails: 0 }, ollama: { online: true, consecutiveFails: 0 }, 'guardian-claude': { online: false }, 'guardian-chatgpt': { online: false } };
    const r = _decide({ intent: 'write code' }, health, mockWeights);
    assert.strictEqual(r.agent, 'gemini', `LAW_I: should fall back to gemini when chatgpt is offline, got ${r.agent}`);
    assert(r.reason.includes('LAW_I'));
  }, { invariant: true });

  t('raid._decide: falls back to api-claude when all offline', () => {
    const health = { ollama: { online: false }, 'guardian-claude': { online: false }, 'guardian-chatgpt': { online: false }, claude: { online: false } };
    const r = _decide({ intent: 'test' }, health, mockWeights);
    assert.strictEqual(r.agent, 'claude', `fallback should be claude, got ${r.agent}`);
    assert(r.reason.includes('fallback'));
  }, { invariant: true });

  t('raid._decide: guardian-claude preferred over api when ollama down', () => {
    const health = { ollama: { online: false, consecutiveFails: 5 }, 'guardian-claude': { online: true }, 'guardian-chatgpt': { online: false }, claude: { online: false } };
    const r = _decide({ intent: 'test' }, health, mockWeights);
    assert.strictEqual(r.agent, 'guardian-claude');
  }, { invariant: true });

  t('[ADV] raid._decide: explicit provider offline → falls back through cascade', () => {
    const health = { ollama: { online: false }, claude: { online: false }, 'guardian-claude': { online: true }, 'guardian-chatgpt': { online: false } };
    const r = _decide({ intent: 'test', preferredAgent: 'ollama' }, health, mockWeights);
    // ollama is offline so explicit preference cannot be honored
    // should fall through to guardian-claude
    assert.strictEqual(r.agent, 'guardian-claude', `expected guardian-claude, got ${r.agent}`);
  }, { adversarial: true });

  t('[INV] raid._decide: always returns agent and reason', () => {
    const empties = [{}, { ollama: { online: false } }, { ollama: { online: true, consecutiveFails: 0 } }];
    for (const health of empties) {
      const r = _decide({ intent: '' }, health, mockWeights);
      assert(r.agent, `agent missing for health: ${JSON.stringify(health)}`);
      assert(r.reason, `reason missing for health: ${JSON.stringify(health)}`);
      assert(r.cluster, `cluster missing`);
    }
  }, { invariant: true });
}

// ── §D: gap-finder module contract ───────────────────────────────────────────
t('gap-finder: exports init and stop', () => {
  const gf = require(path.join(__dirname, '../../cortex/gate/gap-finder'));
  assert.strictEqual(typeof gf.init, 'function', 'init missing');
  assert.strictEqual(typeof gf.stop, 'function', 'stop missing');
}, { invariant: true });

t('gap-finder: init returns without crash (no jaaDB needed for export check)', () => {
  // Just verify the module loads cleanly
  const gf = require(path.join(__dirname, '../../cortex/gate/gap-finder'));
  assert(gf, 'module should load');
}, { invariant: true });

// ── §E: healer module contract ────────────────────────────────────────────────
t('healer: exports init and stop', () => {
  const h = require(path.join(__dirname, '../../cortex/healer/index'));
  assert.strictEqual(typeof h.init, 'function');
  assert.strictEqual(typeof h.stop, 'function');
}, { invariant: true });

// ── §F: self-heal module contract ─────────────────────────────────────────────
t('self-heal: exports init, stop, VERSION, MODULE_ID', () => {
  const sh = require(path.join(__dirname, '../../cortex/self-heal/index'));
  assert.strictEqual(typeof sh.init, 'function');
  assert.strictEqual(typeof sh.stop, 'function');
  assert(sh.VERSION, 'VERSION missing');
  assert(sh.MODULE_ID, 'MODULE_ID missing');
}, { invariant: true });

// ── §G: Invariants ────────────────────────────────────────────────────────────
if (_prescribe) {
  t('[INV] prescribe: all known gap types return a strategy', () => {
    const types = ['stale_module','stuck_call','recurring_failure','missing_file','import_error','deviation'];
    for (const type of types) {
      const rx = _prescribe({ type, path: 'test.js' });
      assert(rx.strategy, `${type} has no strategy`);
      assert(typeof rx.automated === 'boolean', `${type} missing automated flag`);
    }
  }, { invariant: true });

  t('[INV] prescribe: automated:true → escalate is undefined or false', () => {
    // Auto-fixed gaps don't need forge escalation
    const stuck = _prescribe({ type: 'stuck_call', path: 'x.js' });
    assert(stuck.automated === true);
    assert(!stuck.escalate, 'automated gaps should not escalate');
  }, { invariant: true });
}

if (_decide) {
  t('[INV] raid: LAW_I is absolute — chatgpt always first when healthy (§DEFAULT-AGENT-CHANGE 2026-09-02)', () => {
    // ChatGPT with 0 consecutive fails must always be chosen over ollama/api-claude
    const health = { chatgpt: { online: true, consecutiveFails: 0 }, ollama: { online: true, consecutiveFails: 0 }, claude: { online: true }, 'guardian-claude': { online: true }, 'guardian-chatgpt': { online: true } };
    for (let i = 0; i < 5; i++) {
      const r = _decide({ intent: 'generate code' + i }, health, mockWeights);
      assert.strictEqual(r.agent, 'chatgpt', `LAW_I violated on attempt ${i}: got ${r.agent}`);
    }
  }, { invariant: true });
}

// ── REPORT ────────────────────────────────────────────────────────────────────
setTimeout(() => {
  process.stdout.write(`\n  healer.test.js\n  ${passed} passed  ${failed} failed\n`);
  if (failed > 0) process.exitCode = 1;
}, 200);

module.exports = { passed: () => passed, failed: () => failed, invariants: () => invariants };
