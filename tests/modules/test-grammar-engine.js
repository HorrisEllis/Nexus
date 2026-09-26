'use strict';
const assert = require('assert');
const ge     = require('../../lib/grammar-engine');

let passed = 0, failed = 0;

function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch(e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

// Build trie from a mock grammar tree
const mockTree = {
  cortex: {
    gaps: {
      list:    { componentId: 'cortex.gaps.list',    params: [{ name:'status', type:'enum', values:['open','closed'], default:'open', cli:'--status' }], returns: { render:'table' } },
      resolve: { componentId: 'cortex.gaps.resolve', params: [{ name:'uuid', type:'string', required:true }], returns: { render:'json' } },
    },
    memory: {
      write: { componentId: 'cortex.memory.write', params: [], returns: { render:'json' } },
      list:  { componentId: 'cortex.memory.list',  params: [], returns: { render:'table' } },
    },
    search: { componentId: 'cortex.search', params: [{ name:'q', type:'string', required:true, cli:'--q' }], returns: { render:'table' } },
  },
  forge: {
    patch: { componentId: 'forge.patch', params: [], returns: { render:'json' } },
  },
  liminal: {
    list:    { componentId: 'liminal.spaces.list',    params: [], returns: { render:'table' } },
    show:    { componentId: 'liminal.spaces.show',    params: [], returns: { render:'panel' } },
    resolve: { componentId: 'liminal.spaces.resolve', params: [], returns: { render:'json' } },
  },
};

const mockAliases = {
  'gaps':   'cortex.gaps.list',
  'gl':     'cortex.gaps.list',
  'search': 'cortex.search',
  'lm':     'liminal.spaces.list',
  'fp':     'forge.patch',
};

// Load mock grammar directly (bypasses HTTP fetch)
const trie = ge.buildTrie(mockTree);
ge.load(mockTree, mockAliases);

// T-001: buildTrie produces correct structure
test('T-001', 'buildTrie → correct trie structure', () => {
  assert.ok(trie.children.cortex, 'cortex missing');
  assert.ok(trie.children.cortex.children.gaps, 'gaps missing');
  assert.ok(trie.children.cortex.children.gaps.children.list.componentId === 'cortex.gaps.list');
  assert.ok(trie.children.liminal.children.list.componentId === 'liminal.spaces.list');
});

// T-002: resolve canonical command
test('T-002', 'resolve "cortex gaps list" → cortex.gaps.list', () => {
  const r = ge.resolve('cortex gaps list');
  assert.ok(r, 'no result');
  assert.strictEqual(r.componentId, 'cortex.gaps.list');
  assert.strictEqual(r.matched, 'cortex gaps list');
  assert.ok(!r.fromAlias);
});

// T-003: resolve alias
test('T-003', 'resolve alias "gaps" → cortex.gaps.list', () => {
  const r = ge.resolve('gaps');
  assert.ok(r);
  assert.strictEqual(r.componentId, 'cortex.gaps.list');
  assert.ok(r.fromAlias);
});

// T-004: resolve short alias
test('T-004', 'resolve alias "gl" → cortex.gaps.list', () => {
  const r = ge.resolve('gl');
  assert.ok(r);
  assert.strictEqual(r.componentId, 'cortex.gaps.list');
});

// T-005: resolve with remainder (params)
test('T-005', 'resolve "cortex search --q rate limiting" → remainder captured', () => {
  const r = ge.resolve('cortex search --q rate limiting');
  assert.ok(r);
  assert.strictEqual(r.componentId, 'cortex.search');
  assert.ok(r.remainder.includes('--q'));
});

// T-006: resolve unknown → null
test('T-006', 'resolve unknown command → null', () => {
  const r = ge.resolve('nonexistent command here');
  assert.strictEqual(r, null);
});

// T-007: complete partial namespace
test('T-007', 'complete "cortex" → shows cortex subcommands', () => {
  const c = ge.complete('cortex');
  assert.ok(c.length > 0, 'no completions');
  assert.ok(c.some(x => x.includes('gaps') || x.includes('cortex gaps')));
});

// T-008: complete partial command
test('T-008', 'complete "cortex gaps" → list and resolve', () => {
  const c = ge.complete('cortex gaps');
  assert.ok(c.length >= 2, 'expected at least 2 completions');
  assert.ok(c.some(x => x.includes('list')));
  assert.ok(c.some(x => x.includes('resolve')));
});

// T-009: complete partial token
test('T-009', 'complete "cortex g" → suggests gaps', () => {
  const c = ge.complete('cortex g');
  assert.ok(c.some(x => x.includes('gaps')), 'gaps not suggested');
});

// T-010: complete alias prefix
test('T-010', 'complete "l" → suggests lm alias', () => {
  const c = ge.complete('l');
  assert.ok(c.some(x => x === 'lm' || x.includes('liminal')));
});

// T-011: parseParams with flag
test('T-011', 'parseParams --status closed → { status: "closed" }', () => {
  const schema = [{ name:'status', type:'enum', values:['open','closed'], default:'open', cli:'--status' }];
  const r = ge.parseParams(['--status', 'closed'], schema);
  assert.ok(r.ok);
  assert.strictEqual(r.parsed.status, 'closed');
});

// T-012: parseParams enum violation
test('T-012', 'parseParams --status invalid → error', () => {
  const schema = [{ name:'status', type:'enum', values:['open','closed'], default:'open', cli:'--status' }];
  const r = ge.parseParams(['--status', 'invalid'], schema);
  assert.ok(!r.ok);
  assert.ok(r.errors.some(e => e.includes('must be one of')));
});

// T-013: parseParams missing required
test('T-013', 'parseParams missing required → error', () => {
  const schema = [{ name:'uuid', type:'string', required:true }];
  const r = ge.parseParams([], schema);
  assert.ok(!r.ok);
  assert.ok(r.errors.some(e => e.includes('required')));
});

// T-014: parseParams default applied
test('T-014', 'parseParams uses default when not provided', () => {
  const schema = [{ name:'status', type:'enum', values:['open','closed'], default:'open', cli:'--status' }];
  const r = ge.parseParams([], schema);
  assert.ok(r.ok);
  assert.strictEqual(r.parsed.status, 'open');
});

// T-015: status returns correct shape
test('T-015', 'status() returns ready, componentCount, aliasCount', () => {
  const s = ge.status();
  assert.ok(s.ready);
  assert.ok(s.componentCount > 0);
  assert.ok(s.aliasCount > 0);
});

// T-016: invalidate → not ready
test('T-016', 'invalidate() → ready false', () => {
  ge.invalidate();
  const s = ge.status();
  assert.ok(!s.ready);
  // Restore
  ge.load(mockTree, mockAliases);
});

// §PHASE-31 — confidence scoring on resolve()
test('T-017', 'full match (no remainder) → high confidence 0.95', () => {
  const r = ge.resolve('cortex gaps list');
  assert.strictEqual(r.confidence, 0.95);
});

test('T-018', 'alias match → high confidence 0.95', () => {
  const r = ge.resolve('gaps');
  assert.strictEqual(r.confidence, 0.95);
  const r2 = ge.resolve('gl');
  assert.strictEqual(r2.confidence, 0.95);
});

test('T-019', 'partial match (remainder left) → scaled confidence, never as high as a full match', () => {
  const r = ge.resolve('cortex search --q rate limiting');
  assert.ok(r.remainder.length > 0, 'expected this fixture to leave a remainder');
  assert.ok(r.confidence < 0.95, 'partial match must score below a full match');
  assert.ok(r.confidence >= 0.3, 'partial match must never go below the floor');
});

test('T-020', 'unknown command → null, not a zero-confidence object (no match is not a low-confidence match)', () => {
  const r = ge.resolve('nonexistent command here');
  assert.strictEqual(r, null);
});

test('T-021', '§CLI-FIX getAliases() returns a real copy of the alias map, not the live private reference', () => {
  const aliases = ge.getAliases();
  assert.strictEqual(typeof aliases, 'object');
  assert.ok(Object.keys(aliases).length > 0, 'expected at least one alias from this suite\'s fixture load');
  // Mutating the returned object must not corrupt the engine's internal state.
  aliases.__poison = 'should not leak back in';
  const aliasesAgain = ge.getAliases();
  assert.strictEqual(aliasesAgain.__poison, undefined, 'getAliases() must return a copy, not a live reference');
});

console.log(`\n  grammar-engine: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
