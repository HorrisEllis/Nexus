'use strict';
const assert = require('assert');
let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const cap = require('../../lib/capability-registry');

// Fake component-registry with a controllable component set + the real list() filter semantics
let _components = [];
const fakeRegistry = {
  list: (filter = {}) => {
    let items = _components.filter(c => !c._hardDeleted);
    if (filter.available !== undefined) items = items.filter(c => c.available === filter.available);
    if (filter.deprecated !== undefined) items = items.filter(c => c.deprecated === filter.deprecated);
    if (filter.namespace) items = items.filter(c => c.namespace === filter.namespace);
    if (filter.q) {
      const q = filter.q.toLowerCase();
      items = items.filter(c =>
        c.id.includes(q) || (c.description || '').toLowerCase().includes(q) ||
        (c.grammar || []).some(g => g.toLowerCase().includes(q)) ||
        (c.tags || []).some(t => t.toLowerCase().includes(q)));
    }
    return items;
  },
};

function comp(id, over = {}) {
  return {
    id, namespace: id.split('.')[0], name: id, description: `does ${id}`,
    grammar: [`run ${id}`], params: [], examples: [], available: true, deprecated: false,
    route: { method: 'POST', path: `/api/${id}` }, ...over,
  };
}

cap.init(fakeRegistry);

test('T-001', 'capabilities() projects live components — the emergent surface', () => {
  _components = [comp('cortex.gap.find'), comp('guardian.dispatch')];
  const caps = cap.capabilities();
  assert.strictEqual(caps.length, 2);
  assert.ok(caps.every(c => c.source === 'emergent'));
  assert.strictEqual(caps[0].name, 'cortex.gap.find');
});

test('T-002', 'deprecated and unavailable components are NEVER offered as tools', () => {
  _components = [
    comp('live.one'),
    comp('dead.one', { deprecated: true }),
    comp('offline.one', { available: false }),
  ];
  const names = cap.capabilities().map(c => c.name);
  assert.deepStrictEqual(names, ['live.one']);
});

test('T-003', 'grammar becomes the "when to use" signal', () => {
  _components = [comp('x.y', { grammar: ['find the gap', 'show gaps'] })];
  assert.deepStrictEqual(cap.capabilities()[0].when, ['find the gap', 'show gaps']);
});

test('T-004', 'THE LOOP: a newly-registered component appears as a tool on the next read (no code change)', () => {
  _components = [comp('old.tool')];
  assert.strictEqual(cap.capabilities().length, 1);
  // module-builder registers a brand-new capability at runtime:
  _components.push(comp('newly.built.tool', { description: 'a tool NEXUS built itself' }));
  const caps = cap.capabilities();
  assert.strictEqual(caps.length, 2);
  assert.ok(caps.find(c => c.name === 'newly.built.tool'), 'emergent tool must appear with zero code change');
});

test('T-005', 'buildToolsPrompt merges fixed browser tools with the live registry', () => {
  _components = [comp('cortex.memory.search', { namespace: 'cortex' })];
  const fixed = [{ name: 'navigate', cat: 'browser', desc: 'go to a URL', params: { url: 'string' } }];
  const prompt = cap.buildToolsPrompt(fixed);
  assert.ok(prompt.includes('navigate'), 'fixed tool present');
  assert.ok(prompt.includes('cortex.memory.search'), 'emergent tool present');
  assert.ok(prompt.includes('System Capabilities'), 'live section rendered');
});

test('T-006', 'resolve() answers "can you X?" — hit', () => {
  _components = [comp('cortex.gap.find', { description: 'finds gaps in the system', grammar: ['find gaps'] })];
  const r = cap.resolve('find gaps');
  assert.strictEqual(r.found, true);
  assert.strictEqual(r.capabilities[0].name, 'cortex.gap.find');
});

test('T-007', 'resolve() answers honestly on a miss — "may need to be built", not a fake', () => {
  _components = [comp('cortex.gap.find')];
  const r = cap.resolve('brew coffee');
  assert.strictEqual(r.found, false);
  assert.ok(/may need to be built/.test(r.message));
});

test('T-008', 'health reports registry connection + live count', () => {
  _components = [comp('a.b'), comp('c.d')];
  const h = cap.health();
  assert.strictEqual(h.registryConnected, true);
  assert.strictEqual(h.liveCapabilities, 2);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
