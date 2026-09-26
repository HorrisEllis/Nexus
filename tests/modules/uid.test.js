'use strict';
/**
 * tests/modules/uid.test.js — UID System Recursive Fractal Adversarial Suite
 * UUID: test-uid-v1-0000-4000-0000-000000000001
 *
 * FRACTAL: format → parse → resolve → register → config → validate
 * ADVERSARIAL: null, empty, unknown, malformed, immutable override attempts
 * RECURSIVE: uid → resolve → parent chain → config inheritance → validate cycle
 *
 * §5.1  Everything has a UUID — uid() is the single factory
 * §1.2  Nothing silently fails — unknown componentId warns, never throws
 * §1.1  Nothing pretends — validateConfig flags unknown keys
 */

const assert = require('assert');
const {
  uid, rawUid, parseUid, resolveUid, componentUid,
  isStructured, register, getChildren, getAncestors, COMPONENT_MAP,
} = require(require('path').join(__dirname, '../../lib/uid'));
const { getConfig, getAllConfigs, validateConfig } = require(require('path').join(__dirname, '../../lib/uid/config-schema'));

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

// ── §A: COMPONENT_MAP contract ────────────────────────────────────────────────
t('map: all entries have required fields', () => {
  for (const [id, entry] of Object.entries(COMPONENT_MAP)) {
    assert(entry.componentId === id,   `${id}: componentId mismatch`);
    assert(typeof entry.name === 'string' && entry.name, `${id}: name missing`);
    assert(typeof entry.intent === 'string' && entry.intent, `${id}: intent missing`);
    assert(typeof entry.context === 'object', `${id}: context missing`);
    assert(Array.isArray(entry.content), `${id}: content not array`);
    assert(Array.isArray(entry.children), `${id}: children not array`);
    assert(typeof entry.config === 'object', `${id}: config not object`);
    assert(typeof entry.immutable === 'boolean', `${id}: immutable not boolean`);
  }
}, { invariant: true });

t('map: component IDs are human-readable (≤ 12 chars)', () => {
  for (const id of Object.keys(COMPONENT_MAP)) {
    assert(id.length <= 12, `componentId '${id}' exceeds 12 chars (got ${id.length}) — keep IDs short and readable`);
  }
}, { invariant: true });

t('map: all parent refs point to existing entries', () => {
  for (const [id, entry] of Object.entries(COMPONENT_MAP)) {
    if (entry.parent !== null) {
      assert(COMPONENT_MAP[entry.parent], `${id}: parent '${entry.parent}' not in map`);
    }
  }
}, { invariant: true });

t('map: immutable entries have no parent controlling them at runtime', () => {
  // Immutable = only the core itself or kernel-tier entries
  for (const [id, entry] of Object.entries(COMPONENT_MAP)) {
    if (entry.immutable) {
      // immutable entries either have null parent (the root) or a parent that is also immutable
      if (entry.parent !== null) {
        const parent = COMPONENT_MAP[entry.parent];
        assert(parent?.immutable === true, `${id}: immutable component's parent '${entry.parent}' is not immutable`);
      }
    }
  }
}, { invariant: true });

t('map: nexus-co is the root — parent: null, immutable: true', () => {
  const core = COMPONENT_MAP['nexus-co'];
  assert(core, 'nexus-co missing from map');
  assert(core.parent === null, 'nexus-co must have parent: null');
  assert(core.immutable === true, 'nexus-co must be immutable: true');
}, { invariant: true });

t('map: all 8 NEXUS systems are registered', () => {
  const required = ['nexus-or','nexus-br','nexus-cx','nexus-gu','nexus-id','nexus-ar','nexus-em','nexus-di'];
  for (const id of required) assert(COMPONENT_MAP[id], `${id} missing from map`);
}, { invariant: true });

// ── §B: uid() format ─────────────────────────────────────────────────────────
t('uid(): returns structured format', () => {
  const id = uid('nexus-gu', 1);
  assert(isStructured(id), `not structured: ${id}`);
  assert(id.startsWith('nexus-gu-v001-'), `wrong prefix: ${id}`);
  assert(/[0-9a-f]{12}$/.test(id), `instance not 12hex: ${id}`);
}, { invariant: true });

t('uid(): version padded to 3 digits', () => {
  assert(uid('nexus-gu', 1).includes('-v001-'));
  assert(uid('nexus-gu', 42).includes('-v042-'));
  assert(uid('nexus-gu', 100).includes('-v100-'));
}, { invariant: true });

t('uid(): two calls produce different instances', () => {
  const a = uid('nexus-gu', 1);
  const b = uid('nexus-gu', 1);
  assert(a !== b, 'uid() must be non-deterministic');
}, { invariant: true });

t('uid(): no componentId → falls back to rawUid format', () => {
  const id = uid(null);
  assert(!isStructured(id), 'null componentId should produce raw UUID');
  assert(/^[0-9a-f-]{36}$/.test(id), `not a UUID: ${id}`);
}, { invariant: true });

t('[ADV] uid(): unknown componentId → still returns valid string', () => {
  let result;
  // Should emit warning to stderr but not throw
  const orig = process.stderr.write.bind(process.stderr);
  let warned = false;
  process.stderr.write = (...args) => { warned = true; return orig(...args); };
  try { result = uid('bad-comp', 1); } finally { process.stderr.write = orig; }
  assert(typeof result === 'string' && result.length > 0, 'must return a string');
  assert(warned, '§1.2: must emit warning for unknown componentId');
}, { adversarial: true });

// ── §C: rawUid() ──────────────────────────────────────────────────────────────
t('rawUid(): standard UUID format', () => {
  const id = rawUid();
  assert(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id), `bad UUID: ${id}`);
}, { invariant: true });

t('rawUid(): non-deterministic', () => {
  assert(rawUid() !== rawUid());
}, { invariant: true });

// ── §D: parseUid() ────────────────────────────────────────────────────────────
t('parseUid(): decomposes structured uid correctly', () => {
  const id  = uid('nexus-gu', 7);
  const p   = parseUid(id);
  assert.strictEqual(p.componentId, 'nexus-gu');
  assert.strictEqual(p.version,     7);
  assert(/^[0-9a-f]{12}$/.test(p.instance));
  assert(p.structured === true);
}, { invariant: true });

t('parseUid(): handles raw UUID gracefully', () => {
  const p = parseUid(rawUid());
  assert(p.componentId === null, 'raw UUID should have null componentId');
  assert(p.structured === false);
}, { invariant: true });

t('[ADV] parseUid(): null input → null fields, no throw', () => {
  const p = parseUid(null);
  assert(p.componentId === null);
  assert(p.structured === false);
}, { adversarial: true });

t('[ADV] parseUid(): empty string → null fields', () => {
  const p = parseUid('');
  assert(p.componentId === null);
}, { adversarial: true });

t('[ADV] parseUid(): partial format → falls back to raw', () => {
  const p = parseUid('nexus-gu-v001'); // missing instance
  assert(p.structured === false, 'incomplete format should not be structured');
}, { adversarial: true });

// ── §E: resolveUid() ─────────────────────────────────────────────────────────
t('resolveUid(): enriches with meta for known component', () => {
  const id = uid('nexus-cx', 1);
  const r  = resolveUid(id);
  assert(r.meta !== null, 'meta should not be null for known componentId');
  assert(r.meta.name === 'cortex', `wrong name: ${r.meta.name}`);
  assert(r.meta.intent, 'intent missing from meta');
  assert(r.meta.parent === 'nexus-co');
}, { invariant: true });

t('resolveUid(): meta is null for raw UUID', () => {
  const r = resolveUid(rawUid());
  assert(r.meta === null, 'raw UUID should have null meta');
}, { invariant: true });

t('[ADV] resolveUid(): unknown componentId → meta is null, no throw', () => {
  const r = resolveUid('unknown-xx-v001-aabbccddeeff');
  assert(r.meta === null);
  assert(r.componentId === 'unknown-xx');
}, { adversarial: true });

// ── §F: isStructured() ────────────────────────────────────────────────────────
t('isStructured(): true for structured uids', () => {
  assert(isStructured(uid('nexus-gu', 1)));
  assert(isStructured('nexus-gu-v001-aabbccddeeff'));
}, { invariant: true });

t('isStructured(): false for raw UUIDs', () => {
  assert(!isStructured(rawUid()));
  assert(!isStructured('550e8400-e29b-41d4-a716-446655440000'));
}, { invariant: true });

t('[ADV] isStructured(): false for null/empty', () => {
  assert(!isStructured(null));
  assert(!isStructured(''));
  assert(!isStructured(undefined));
}, { adversarial: true });

// ── §G: componentUid() ────────────────────────────────────────────────────────
t('componentUid(): finds by name', () => {
  assert.strictEqual(componentUid('guardian'),    'nexus-gu');
  assert.strictEqual(componentUid('cortex'),      'nexus-cx');
  assert.strictEqual(componentUid('core'),        'nexus-co');
  assert.strictEqual(componentUid('diagnostic'),  'nexus-di');
}, { invariant: true });

t('componentUid(): unknown name → null', () => {
  assert.strictEqual(componentUid('does-not-exist'), null);
}, { invariant: true });

// ── §H: register() + getChildren() + getAncestors() ─────────────────────────
t('register(): idempotent — double register does not duplicate child', () => {
  // Clone COMPONENT_MAP children to test in isolation
  const original = [...(COMPONENT_MAP['nexus-co'].children || [])];
  register('nexus-gu');
  register('nexus-gu'); // second call
  const children = getChildren('nexus-co');
  const dupes = children.filter(c => c === 'nexus-gu').length;
  assert(dupes <= 1, `'nexus-gu' appears ${dupes} times in children — should be ≤ 1`);
}, { invariant: true });

t('register(): unknown componentId → returns false with warning', () => {
  const orig = process.stderr.write.bind(process.stderr);
  let warned = false;
  process.stderr.write = (...args) => { warned = true; return orig(...args); };
  const result = register('bad-comp');
  process.stderr.write = orig;
  assert(result === false, 'unknown componentId should return false');
  assert(warned, '§1.2: must warn on unknown componentId');
}, { adversarial: true });

t('getChildren(): returns direct children only when recursive=false', () => {
  register('nexus-gu');
  register('nexus-cx');
  const children = getChildren('nexus-co', false);
  assert(Array.isArray(children));
  // Should include registered children, not grandchildren
  assert(children.includes('nexus-gu') || children.includes('nexus-cx'), 'registered children missing');
}, { invariant: true });

t('getAncestors(): returns parent chain nearest first', () => {
  const anc = getAncestors('nexus-gu');
  assert(Array.isArray(anc));
  assert(anc[0] === 'nexus-co', `first ancestor should be nexus-co, got ${anc[0]}`);
}, { invariant: true });

t('getAncestors(): root has empty ancestor chain', () => {
  const anc = getAncestors('nexus-co');
  assert.deepStrictEqual(anc, []);
}, { invariant: true });

// ── §I: getConfig() ──────────────────────────────────────────────────────────
t('getConfig(): returns defaults for known component', () => {
  const cfg = getConfig('nexus-gu');
  assert.strictEqual(cfg.MAX_CONCURRENT, 3);
  assert.strictEqual(cfg.HEARTBEAT_MS, 15000);
  assert.strictEqual(cfg.__found, true);
  assert.strictEqual(cfg.__immutable, false);
}, { invariant: true });

t('getConfig(): immutable components return __immutable:true', () => {
  const cfg = getConfig('nexus-jaa');
  assert(cfg.__immutable === true, 'jaaDB should be immutable');
  assert(cfg.__found === true);
}, { invariant: true });

t('getConfig(): immutable components ignore ENV overrides', () => {
  const env = { NEXUS_JAA_DECAY_INTERVAL_MS: '99999' };
  const cfg = getConfig('nexus-jaa', { env });
  // Immutable — env override should NOT apply
  assert.notStrictEqual(cfg.DECAY_INTERVAL_MS, 99999, 'immutable config should not be overridden by env');
}, { invariant: true });

t('getConfig(): mutable components accept ENV overrides', () => {
  const env = { NEXUS_GU_MAX_CONCURRENT: '8' };
  const cfg = getConfig('nexus-gu', { env });
  assert.strictEqual(cfg.MAX_CONCURRENT, 8, 'env override should apply to mutable config');
}, { invariant: true });

t('getConfig(): unknown componentId → __found:false, no throw', () => {
  const cfg = getConfig('unknown-component');
  assert.strictEqual(cfg.__found, false);
}, { adversarial: true });

t('getConfig(): ENV value type-coerced to match default type', () => {
  // MAX_CONCURRENT is a number — env string should be coerced
  const env = { NEXUS_GU_MAX_CONCURRENT: '5' };
  const cfg = getConfig('nexus-gu', { env });
  assert(typeof cfg.MAX_CONCURRENT === 'number', `expected number, got ${typeof cfg.MAX_CONCURRENT}`);
  assert.strictEqual(cfg.MAX_CONCURRENT, 5);
}, { invariant: true });

t('[ADV] getConfig(): malformed ENV number → falls back to default', () => {
  const env = { NEXUS_GU_MAX_CONCURRENT: 'not-a-number' };
  const cfg = getConfig('nexus-gu', { env });
  assert.strictEqual(cfg.MAX_CONCURRENT, 3, 'malformed number should fall back to default');
}, { adversarial: true });

// ── §J: validateConfig() ─────────────────────────────────────────────────────
t('validateConfig(): valid config → valid:true', () => {
  const r = validateConfig('nexus-gu', { MAX_CONCURRENT: 5 });
  assert.strictEqual(r.valid, true);
  assert.deepStrictEqual(r.unknown, []);
}, { invariant: true });

t('validateConfig(): unknown key → valid:false + unknown list', () => {
  const r = validateConfig('nexus-gu', { UNKNOWN_KEY: 'x', ANOTHER: 1 });
  assert.strictEqual(r.valid, false);
  assert(r.unknown.includes('UNKNOWN_KEY'));
  assert(r.unknown.includes('ANOTHER'));
}, { invariant: true });

t('validateConfig(): empty config → valid:true (all have defaults)', () => {
  const r = validateConfig('nexus-gu', {});
  assert.strictEqual(r.valid, true);
}, { invariant: true });

t('[ADV] validateConfig(): unknown component → error field set', () => {
  const r = validateConfig('nonexistent');
  assert.strictEqual(r.valid, false);
  assert(r.error, 'error field should be set for unknown component');
}, { adversarial: true });

// ── §K: getAllConfigs() ───────────────────────────────────────────────────────
t('getAllConfigs(): returns config for every component', () => {
  const all = getAllConfigs();
  for (const componentId of Object.keys(COMPONENT_MAP)) {
    assert(all[componentId], `${componentId} missing from getAllConfigs()`);
    assert(all[componentId].__found === true, `${componentId}.__found should be true`);
  }
}, { invariant: true });

// ── §L: Invariants ────────────────────────────────────────────────────────────
t('[INV] §5.1: uid() always returns a non-empty string', () => {
  for (let i = 0; i < 20; i++) {
    const id = uid('nexus-gu', i + 1);
    assert(typeof id === 'string' && id.length > 0, `uid() returned empty on attempt ${i}`);
  }
}, { invariant: true });

t('[INV] uid() never returns the same value twice (collision resistance)', () => {
  const ids = new Set();
  for (let i = 0; i < 100; i++) ids.add(uid('nexus-gu', 1));
  assert.strictEqual(ids.size, 100, `collision detected: only ${ids.size} unique IDs from 100 calls`);
}, { invariant: true });

t('[INV] parseUid(uid(c,v)).componentId === c for all known components', () => {
  for (const componentId of Object.keys(COMPONENT_MAP)) {
    const id = uid(componentId, 1);
    const p  = parseUid(id);
    assert.strictEqual(p.componentId, componentId, `round-trip failed for ${componentId}`);
  }
}, { invariant: true });

t('[INV] immutable core entries cannot have mutable parents', () => {
  for (const [id, entry] of Object.entries(COMPONENT_MAP)) {
    if (entry.immutable && entry.parent) {
      const parent = COMPONENT_MAP[entry.parent];
      assert(parent.immutable, `immutable '${id}' has mutable parent '${entry.parent}'`);
    }
  }
}, { invariant: true });

t('[INV] nexus-co is reachable as ancestor from every non-core component', () => {
  for (const [id, entry] of Object.entries(COMPONENT_MAP)) {
    if (id === 'nexus-co') continue;
    if (!entry.parent) continue; // skip components with no parent declared
    const ancestors = getAncestors(id);
    assert(ancestors.includes('nexus-co') || entry.parent === 'nexus-co',
      `${id}: nexus-co not reachable in ancestor chain`);
  }
}, { invariant: true });

// ── REPORT ────────────────────────────────────────────────────────────────────
setTimeout(() => {
  process.stdout.write(`\n  uid.test.js\n  ${passed} passed  ${failed} failed\n`);
  if (failed > 0) process.exitCode = 1;
}, 200);

module.exports = { passed: () => passed, failed: () => failed, invariants: () => invariants };
