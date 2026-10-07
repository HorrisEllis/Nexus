/**
 * test/test.js
 * COMPARTMENT OS — Test Suite (Phase 0 + 1 + 2)
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * Zero external dependencies. Plain Node.js assertions.
 * Run: node test/test.js
 */

'use strict';

const assert = require('assert');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');

// ─── Test harness ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✖  ${name}`);
    console.log(`     ${err.message}`);
    failures.push({ name, err });
    failed++;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✖  ${name}`);
    console.log(`     ${err.message}`);
    failures.push({ name, err });
    failed++;
  }
}

function section(title) {
  console.log(`\n  ── ${title} ──`);
}

// ─── Temp dir for I/O tests ───────────────────────────────────────────────────

const TMP = path.join(os.tmpdir(), `cos-test-${Date.now()}`);
fs.mkdirSync(TMP, { recursive: true });

function tmpFile(name) { return path.join(TMP, name); }
function tmpDir(name)  { const d = path.join(TMP, name); fs.mkdirSync(d, { recursive: true }); return d; }

// ─── Load modules ────────────────────────────────────────────────────────────

const { makeCompartment, makeHook, makeSystemMap, makePipe,
        isValidTransition, COMPARTMENT_STATES }
  = require('../foundation/types.js');

const { CosAxiomError, enforce, getAxiomDefs, AXIOMS }
  = require('../foundation/axioms.js');

const { HookSchemaError, validateHook, isUUID, isSemver, isEventType, isKebab }
  = require('../foundation/hook-schema.js');

const { HOST, COMP, WATCHDOG, ALL_EVENT_TYPES, isKnownEvent }
  = require('../foundation/event-contracts.js');

const { COS_VERSION, compartmentPaths, DEFAULT_API_PORT }
  = require('../foundation/constants.js');

const { RUNTIME_IDS }  = require('../foundation/runtime-enum.js');
const { COMPILER_IDS } = require('../foundation/compiler-enum.js');

const { StateStore }     = require('../host/state-store.js');
const { createEventBus } = require('../host/event-bus.js');
const { SystemMap }      = require('../host/system-map.js');
const { createHost }     = require('../host/index.js');

const { createCompartment, toSlug } = require('../cli/commands/create.js');
const { renderTable }               = require('../cli/commands/list.js');
const { renderTree }                = require('../cli/commands/map.js');
const { parseArgs }                 = require('../cli/index.js');

// ═════════════════════════════════════════════════════════════════════════════
// PHASE 0 — FOUNDATION
// ═════════════════════════════════════════════════════════════════════════════

section('Phase 0 — foundation/types.js');

test('makeCompartment returns a compartment with defaults', () => {
  const c = makeCompartment({ id: 'abc', name: 'test' });
  assert.strictEqual(c.id,    'abc');
  assert.strictEqual(c.name,  'test');
  assert.strictEqual(c.state, 'created');
  assert.strictEqual(c.network.isolated, true);
  assert.strictEqual(c.watchdog.enabled, false);
  assert.deepStrictEqual(c.hooks, []);
  assert.deepStrictEqual(c.tags,  []);
});

test('makeCompartment overrides merge correctly', () => {
  const c = makeCompartment({ network: { isolated: false } });
  assert.strictEqual(c.network.isolated, false);
  assert.strictEqual(c.network.proxyPort, null);
});

test('makeHook returns a hook with defaults', () => {
  const h = makeHook({ id: 'abc', name: 'test-hook' });
  assert.strictEqual(h.id,   'abc');
  assert.strictEqual(h.name, 'test-hook');
  assert.deepStrictEqual(h.contract.inputs, []);
  assert.strictEqual(h.meta.autoDetected, false);
});

test('makeSystemMap returns a system map with arrays', () => {
  const m = makeSystemMap();
  assert.ok(Array.isArray(m.compartments));
  assert.ok(Array.isArray(m.hooks));
  assert.ok(Array.isArray(m.pipes));
  assert.ok(typeof m.generatedAt === 'number');
});

test('makePipe returns pipe with defaults', () => {
  const p = makePipe({ id: 'p1', name: 'test-pipe' });
  assert.strictEqual(p.state, 'active');
  assert.strictEqual(p.eventLog, true);
});

test('isValidTransition: created → running is valid', () => {
  assert.ok(isValidTransition('created', 'running'));
});

test('isValidTransition: running → created is invalid', () => {
  assert.ok(!isValidTransition('running', 'created'));
});

test('COMPARTMENT_STATES is frozen and correct', () => {
  assert.ok(COMPARTMENT_STATES.includes('running'));
  assert.ok(COMPARTMENT_STATES.includes('error'));
});

// ─────────────────────────────────────────────────────────────────────────────
section('Phase 0 — foundation/axioms.js');

test('CosAxiomError has correct shape', () => {
  const e = new CosAxiomError('COS-3', 'test', { foo: 1 });
  assert.strictEqual(e.name,    'CosAxiomError');
  assert.strictEqual(e.axiomId, 'COS-3');
  assert.ok(e.message.includes('COS-3'));
});

test('getAxiomDefs returns all 17 axioms', () => {
  const defs = getAxiomDefs();
  assert.strictEqual(defs.length, 17);
  assert.ok(defs.every(d => d.id && d.description));
});

test('enforce COS-3: throws on missing hook id', () => {
  assert.throws(() => {
    enforce('COS-3', { hook: { version: '1.0.0', contract: {}, bindings: { event: 'x:y:z' } } });
  }, CosAxiomError);
});

test('enforce COS-3: passes on valid hook', () => {
  assert.doesNotThrow(() => {
    enforce('COS-3', {
      hook: {
        id:       '550e8400-e29b-41d4-a716-446655440000',
        version:  '1.0.0',
        contract: {},
        bindings: { event: 'host:compartment:created' },
      },
    });
  });
});

test('enforce COS-4: throws on direct-import', () => {
  assert.throws(() => {
    enforce('COS-4', { method: 'direct-import' });
  }, CosAxiomError);
});

test('enforce COS-7: throws if mapUpdated is false', () => {
  assert.throws(() => enforce('COS-7', { mapUpdated: false }), CosAxiomError);
});

test('enforce COS-7: passes if mapUpdated is true', () => {
  assert.doesNotThrow(() => enforce('COS-7', { mapUpdated: true }));
});

test('enforce COS-11: throws if isolated is undefined in config', () => {
  assert.throws(() => {
    enforce('COS-11', { networkConfig: { proxyPort: null } });
  }, CosAxiomError);
});

test('enforce COS-11: passes if isolated is explicitly set', () => {
  assert.doesNotThrow(() => {
    enforce('COS-11', { networkConfig: { isolated: true } });
  });
});

test('enforce COS-15: throws if pipe.eventLog is false', () => {
  assert.throws(() => enforce('COS-15', { pipe: { eventLog: false } }), CosAxiomError);
});

test('enforce unknown axiom throws', () => {
  assert.throws(() => enforce('COS-99', {}), CosAxiomError);
});

// ─────────────────────────────────────────────────────────────────────────────
section('Phase 0 — foundation/hook-schema.js');

test('isUUID: accepts valid v4', () => {
  assert.ok(isUUID('550e8400-e29b-41d4-a716-446655440000'));
});

test('isUUID: rejects non-uuid', () => {
  assert.ok(!isUUID('not-a-uuid'));
  assert.ok(!isUUID(null));
  assert.ok(!isUUID(''));
});

test('isSemver: accepts x.y.z', () => {
  assert.ok(isSemver('1.0.0'));
  assert.ok(isSemver('12.3.4'));
});

test('isSemver: rejects bad semver', () => {
  assert.ok(!isSemver('1.0'));
  assert.ok(!isSemver('v1.0.0'));
});

test('isEventType: accepts {layer}:{noun}:{verb}', () => {
  assert.ok(isEventType('host:compartment:created'));
  assert.ok(isEventType('comp:process:started'));
});

test('isEventType: rejects malformed', () => {
  assert.ok(!isEventType('host:compartment'));
  assert.ok(!isEventType('HOST:COMP:CREATED'));
  assert.ok(!isEventType(''));
});

test('isKebab: accepts kebab-case', () => {
  assert.ok(isKebab('my-hook'));
  assert.ok(isKebab('create'));
});

test('isKebab: rejects spaces and caps', () => {
  assert.ok(!isKebab('My Hook'));
  assert.ok(!isKebab(''));
});

const VALID_HOOK = Object.freeze({
  id:            '550e8400-e29b-41d4-a716-446655440000',
  name:          'create-compartment',
  version:       '1.0.0',
  compartmentId: 'host',
  contract: { inputs: [], outputs: [], sideEffects: [], axioms: [] },
  bindings: { ui: null, cli: 'cos create', event: 'host:compartment:created' },
  meta: { description: 'Creates a compartment', autoDetected: false, sourceFile: null, createdAt: Date.now(), updatedAt: null },
});

test('validateHook: passes on valid hook', () => {
  const result = validateHook(VALID_HOOK);
  assert.strictEqual(result.id, VALID_HOOK.id);
});

test('validateHook: throws on non-object', () => {
  assert.throws(() => validateHook(null),  HookSchemaError);
  assert.throws(() => validateHook('str'), HookSchemaError);
});

test('validateHook: throws on missing id', () => {
  assert.throws(() => validateHook({ ...VALID_HOOK, id: null }), HookSchemaError);
});

test('validateHook: throws on bad version', () => {
  assert.throws(() => validateHook({ ...VALID_HOOK, version: '1.0' }), HookSchemaError);
});

test('validateHook: throws on bad event type', () => {
  assert.throws(() => validateHook({ ...VALID_HOOK, bindings: { ...VALID_HOOK.bindings, event: 'bad' } }), HookSchemaError);
});

test('validateHook: throws on non-array contract.inputs', () => {
  assert.throws(() => validateHook({ ...VALID_HOOK, contract: { ...VALID_HOOK.contract, inputs: 'bad' } }), HookSchemaError);
});

// ─────────────────────────────────────────────────────────────────────────────
section('Phase 0 — foundation/event-contracts.js');

test('HOST events are correctly named', () => {
  assert.strictEqual(HOST.COMPARTMENT_CREATED, 'host:compartment:created');
  assert.strictEqual(HOST.MAP_UPDATED,         'host:map:updated');
});

test('COMP events are correctly named', () => {
  assert.strictEqual(COMP.PROCESS_STARTED, 'comp:process:started');
});

test('isKnownEvent returns true for known events', () => {
  assert.ok(isKnownEvent('host:compartment:created'));
  assert.ok(isKnownEvent('watchdog:anomaly:detected'));
});

test('isKnownEvent returns false for unknown events', () => {
  assert.ok(!isKnownEvent('fake:event:type'));
  assert.ok(!isKnownEvent(''));
});

test('ALL_EVENT_TYPES is a Set with > 50 events', () => {
  assert.ok(ALL_EVENT_TYPES instanceof Set);
  assert.ok(ALL_EVENT_TYPES.size > 50);
});

// ─────────────────────────────────────────────────────────────────────────────
section('Phase 0 — foundation/constants.js');

test('COS_VERSION is a semver string', () => {
  assert.match(COS_VERSION, /^\d+\.\d+\.\d+$/);
});

test('compartmentPaths returns correct shape', () => {
  const p = compartmentPaths('test-id');
  assert.ok(p.root.includes('test-id'));
  assert.ok(p.manifest.endsWith('.cos-manifest.json'));
  assert.ok(p.nexDir.endsWith('.nex'));
  assert.ok(p.walDir.endsWith('.cos-wal'));
});

test('DEFAULT_API_PORT is 3748', () => {
  assert.strictEqual(DEFAULT_API_PORT, 3748);
});

// ─────────────────────────────────────────────────────────────────────────────
section('Phase 0 — runtime-enum.js + compiler-enum.js');

test('RUNTIME_IDS includes node, python, electron', () => {
  assert.ok(RUNTIME_IDS.includes('node'));
  assert.ok(RUNTIME_IDS.includes('python'));
  assert.ok(RUNTIME_IDS.includes('electron'));
});

test('COMPILER_IDS includes tsc, esbuild, vite', () => {
  assert.ok(COMPILER_IDS.includes('tsc'));
  assert.ok(COMPILER_IDS.includes('esbuild'));
  assert.ok(COMPILER_IDS.includes('vite'));
});

// ═════════════════════════════════════════════════════════════════════════════
// PHASE 1 — HOST CORE
// ═════════════════════════════════════════════════════════════════════════════

section('Phase 1 — host/state-store.js');

test('StateStore: loads from empty dir', () => {
  const stateFile = tmpFile('state1.json');
  const store = new StateStore(stateFile);
  store.load();
  assert.deepStrictEqual(store.listCompartments(), []);
});

test('StateStore: setCompartment + getCompartment', () => {
  const store = new StateStore(tmpFile('state2.json'));
  store.load();
  const c = makeCompartment({ id: 'c1', name: 'test' });
  store.setCompartment(c);
  const got = store.getCompartment('c1');
  assert.strictEqual(got.id,   'c1');
  assert.strictEqual(got.name, 'test');
});

test('StateStore: mutation returns deep clone (not reference)', () => {
  const store = new StateStore(tmpFile('state3.json'));
  store.load();
  const c = makeCompartment({ id: 'c2', name: 'original' });
  store.setCompartment(c);
  const got = store.getCompartment('c2');
  got.name = 'mutated';
  const got2 = store.getCompartment('c2');
  assert.strictEqual(got2.name, 'original');
});

test('StateStore: getCompartmentByName (case-insensitive)', () => {
  const store = new StateStore(tmpFile('state4.json'));
  store.load();
  store.setCompartment(makeCompartment({ id: 'c3', name: 'MyService', slug: 'myservice' }));
  assert.ok(store.getCompartmentByName('myservice'));
  assert.ok(store.getCompartmentByName('MYSERVICE'));
});

test('StateStore: deleteCompartment removes it', () => {
  const store = new StateStore(tmpFile('state5.json'));
  store.load();
  store.setCompartment(makeCompartment({ id: 'c4', name: 'del-me' }));
  store.deleteCompartment('c4');
  assert.strictEqual(store.getCompartment('c4'), null);
});

test('StateStore: persists to disk and survives reload', () => {
  const stateFile = tmpFile('state6.json');
  const store1 = new StateStore(stateFile);
  store1.load();
  store1.setCompartment(makeCompartment({ id: 'c5', name: 'persist-test' }));
  store1.flushSync();

  const store2 = new StateStore(stateFile);
  store2.load();
  const got = store2.getCompartment('c5');
  assert.strictEqual(got.name, 'persist-test');
});

test('StateStore: setCompartment throws without id', () => {
  const store = new StateStore(tmpFile('state7.json'));
  store.load();
  assert.throws(() => store.setCompartment({ name: 'no-id' }), /requires compartment.id/);
});

test('StateStore: corrupted file is backed up, starts fresh', () => {
  const stateFile = tmpFile('state8.json');
  fs.writeFileSync(stateFile, '{ NOT VALID JSON {{{{', 'utf8');
  const store = new StateStore(stateFile);
  store.load();  // should not throw
  assert.deepStrictEqual(store.listCompartments(), []);
});

// ─────────────────────────────────────────────────────────────────────────────
section('Phase 1 — host/event-bus.js');

test('EventBus: emit returns stamped event', () => {
  const bus = createEventBus();
  const ev  = bus.emit('host:test:done', { value: 42 });
  assert.strictEqual(ev.type, 'host:test:done');
  assert.strictEqual(ev.payload.value, 42);
  assert.ok(typeof ev.seq === 'number');
  assert.ok(typeof ev.timestamp === 'number');
});

test('EventBus: on receives events', () => {
  const bus = createEventBus();
  let received = null;
  bus.on('host:test:ping', ev => { received = ev; });
  bus.emit('host:test:ping', { msg: 'hello' });
  assert.ok(received);
  assert.strictEqual(received.payload.msg, 'hello');
});

test('EventBus: onAny catches all events', () => {
  const bus = createEventBus();
  const seen = [];
  bus.onAny(ev => seen.push(ev.type));
  bus.emit('host:a:b', {});
  bus.emit('comp:x:y', {});
  assert.ok(seen.includes('host:a:b'));
  assert.ok(seen.includes('comp:x:y'));
});

test('EventBus: tail returns last N events', () => {
  const bus = createEventBus();
  for (let i = 0; i < 10; i++) bus.emit(`host:test:${i}`, {});
  const tail = bus.tail(3);
  assert.strictEqual(tail.length, 3);
  assert.ok(tail[2].type.includes('9'));
});

test('EventBus: since(seq) returns events after that seq', () => {
  const bus = createEventBus();
  bus.emit('host:a:one',   {});
  const mid = bus.seq;
  bus.emit('host:a:two',   {});
  bus.emit('host:a:three', {});
  const after = bus.since(mid);
  assert.strictEqual(after.length, 2);
});

test('EventBus: seq increments monotonically', () => {
  const bus = createEventBus();
  bus.emit('host:a:b', {});
  bus.emit('host:c:d', {});
  assert.strictEqual(bus.seq, 2);
});

// ─────────────────────────────────────────────────────────────────────────────
section('Phase 1 — host/system-map.js');

test('SystemMap: loads and returns a map', () => {
  const mapFile = tmpFile('sysmap1.json');
  const bus     = createEventBus();
  const sysmap  = new SystemMap({ mapFile, eventBus: bus });
  sysmap.load();
  const m = sysmap.get();
  assert.ok(typeof m.version === 'string');
  assert.ok(Array.isArray(m.compartments));
  assert.ok(m.runtimes.length > 0);
  assert.ok(m.axioms.length === 17);
});

test('SystemMap: upsertCompartment adds it', () => {
  const sysmap = new SystemMap({ mapFile: tmpFile('sysmap2.json') });
  sysmap.load();
  sysmap.upsertCompartment({ id: 'x1', name: 'foo' });
  const m = sysmap.get();
  assert.ok(m.compartments.some(c => c.id === 'x1'));
});

test('SystemMap: upsertCompartment updates existing', () => {
  const sysmap = new SystemMap({ mapFile: tmpFile('sysmap3.json') });
  sysmap.load();
  sysmap.upsertCompartment({ id: 'x2', name: 'before' });
  sysmap.upsertCompartment({ id: 'x2', name: 'after' });
  const m = sysmap.get();
  const found = m.compartments.filter(c => c.id === 'x2');
  assert.strictEqual(found.length, 1);
  assert.strictEqual(found[0].name, 'after');
});

test('SystemMap: removeCompartment removes it', () => {
  const sysmap = new SystemMap({ mapFile: tmpFile('sysmap4.json') });
  sysmap.load();
  sysmap.upsertCompartment({ id: 'x3', name: 'temp' });
  sysmap.removeCompartment('x3');
  const m = sysmap.get();
  assert.ok(!m.compartments.some(c => c.id === 'x3'));
});

test('SystemMap: emits host:map:updated on mutation', () => {
  const bus    = createEventBus();
  const sysmap = new SystemMap({ mapFile: tmpFile('sysmap5.json'), eventBus: bus });
  sysmap.load();
  let fired = false;
  bus.on('host:map:updated', () => { fired = true; });
  sysmap.upsertCompartment({ id: 'x4', name: 'trigger' });
  assert.ok(fired);
});

test('SystemMap: get returns deep clone', () => {
  const sysmap = new SystemMap({ mapFile: tmpFile('sysmap6.json') });
  sysmap.load();
  sysmap.upsertCompartment({ id: 'x5', name: 'original' });
  const m1 = sysmap.get();
  m1.compartments[0].name = 'mutated';
  const m2 = sysmap.get();
  assert.ok(m2.compartments.find(c => c.id === 'x5')?.name !== 'mutated');
});

// ─────────────────────────────────────────────────────────────────────────────
section('Phase 1 — host/index.js (createHost)');

test('createHost: boots without error', () => {
  const host = createHost({
    stateFile: tmpFile('host1-state.json'),
    mapFile:   tmpFile('host1-map.json'),
  });
  assert.ok(host.store);
  assert.ok(host.bus);
  assert.ok(host.sysmap);
  assert.strictEqual(host.version, COS_VERSION);
});

test('createHost: syncs compartments from store to sysmap', () => {
  const stateFile = tmpFile('host2-state.json');
  const mapFile   = tmpFile('host2-map.json');

  // Pre-populate state store
  const store = new StateStore(stateFile);
  store.load();
  store.setCompartment(makeCompartment({ id: 'pre-existing', name: 'pre' }));
  store.flushSync();

  // Boot host — should sync pre-existing to sysmap
  const host = createHost({ stateFile, mapFile });
  const m    = host.sysmap.get();
  assert.ok(m.compartments.some(c => c.id === 'pre-existing'));
});

// ═════════════════════════════════════════════════════════════════════════════
// PHASE 2 — CLI COMMANDS
// ═════════════════════════════════════════════════════════════════════════════

section('Phase 2 — cli/commands/create.js');

test('toSlug: converts name to kebab slug', () => {
  assert.strictEqual(toSlug('My Service'),  'my-service');
  assert.strictEqual(toSlug('  hello  '),   'hello');
  assert.strictEqual(toSlug('API Server v2'), 'api-server-v2');
});

test('toSlug: strips invalid characters', () => {
  const slug = toSlug('foo@bar!baz');
  assert.match(slug, /^[a-z0-9-]+$/);
});

test('createCompartment: creates with correct fields', () => {
  const host = createHost({
    stateFile: tmpFile('cli-create1-state.json'),
    mapFile:   tmpFile('cli-create1-map.json'),
  });
  const comp = createCompartment(host, {
    name:      'test-create',
    purpose:   'unit test',
    runtimeId: 'node',
    networkIsolated: true,
  });
  assert.ok(comp.id);
  assert.strictEqual(comp.name,    'test-create');
  assert.strictEqual(comp.slug,    'test-create');
  assert.strictEqual(comp.purpose, 'unit test');
  assert.strictEqual(comp.runtimeId, 'node');
  assert.strictEqual(comp.network.isolated, true);
  assert.strictEqual(comp.state, 'created');
});

test('createCompartment: persists to state store', () => {
  const stateFile = tmpFile('cli-create2-state.json');
  const host = createHost({ stateFile, mapFile: tmpFile('cli-create2-map.json') });
  const comp = createCompartment(host, { name: 'persist-comp' });
  const found = host.store.getCompartment(comp.id);
  assert.strictEqual(found.name, 'persist-comp');
});

test('createCompartment: appears in system map', () => {
  const host = createHost({
    stateFile: tmpFile('cli-create3-state.json'),
    mapFile:   tmpFile('cli-create3-map.json'),
  });
  const comp = createCompartment(host, { name: 'map-comp' });
  const m    = host.sysmap.get();
  assert.ok(m.compartments.some(c => c.id === comp.id));
});

// ── §2026-10-07 — a compartment's intent is its end state (foundation/intent.js) ─────────────────────────────────
// James: "im saying to add that to cos. the conditions. like the intent of compartment is the end state."
{
  const INTENT = require('../foundation/intent.js');
  const { setIntent, verifyCompartment, intentLines } = require('../cli/commands/intent.js');
  const { advanceWorkPhase } = require('../cli/commands/advance-work-phase.js');
  const mk = (n) => createHost({ stateFile: tmpFile(`intent-${n}-state.json`), mapFile: tmpFile(`intent-${n}-map.json`) });
  const notes = {
    endState: [
      { says: 'a note can be kept', check: { kind: 'file', path: 'notes.txt' } },
      { says: 'the notes can be read back', check: { kind: 'command', run: 'node -e "process.exit(require(\'fs\').readFileSync(\'notes.txt\',\'utf8\').includes(\'hello\')?0:1)"' } },
    ],
    conditions: [{ says: 'nothing is written outside the compartment', check: { kind: 'command', run: 'node -e "process.exit(0)"' } }],
    axioms: ['use the least amount of code with the highest leverage that achieves the end state'],
  };

  test('intent: a compartment is born with its intent — the end state, its conditions, its axioms', () => {
    const host = mk(1);
    const comp = createCompartment(host, { name: 'notes-a', purpose: 'keeps notes', intent: notes });
    assert.strictEqual(comp.intent.endState.length, 2);
    assert.strictEqual(comp.intent.conditions.length, 1);
    assert.deepStrictEqual(comp.intent.axioms, notes.axioms);
    assert.strictEqual(host.store.getCompartment(comp.id).intent.endState[0].says, 'a note can be kept', 'persisted');
  });

  test('intent: an end state that says nothing, or cannot be checked, is refused whole — nothing is created', () => {
    const host = mk(2);
    assert.throws(() => createCompartment(host, { name: 'notes-b', intent: { endState: ['it works'] } }), /has no check/);
    assert.strictEqual(host.store.getCompartmentByName('notes-b'), null, 'not created');
    assert.match(INTENT.normalize({ endState: [{ says: 'x', check: { kind: 'vibes' } }] }).errors[0], /not one of file, command, tests/);
    assert.match(INTENT.normalize({ axioms: ['a', 'b', 'c', 'd', 'e', 'f'] }).errors[0], /at most 5/);
  });

  test('intent: verify — how much of the end state is reached, whether the conditions hold; an empty file proves nothing', () => {
    const host = mk(3);
    const comp = createCompartment(host, { name: 'notes-c', intent: notes });
    fs.writeFileSync(path.join(comp.fs.root, 'notes.txt'), '');
    let r = verifyCompartment(host, { name: 'notes-c' }).status;
    assert.strictEqual(r.endState.met, 0, 'an empty notes.txt does not count as a kept note');
    assert.strictEqual(r.ok, true, 'its condition holds');
    fs.writeFileSync(path.join(comp.fs.root, 'notes.txt'), 'hello\n');
    r = verifyCompartment(host, { name: 'notes-c' }).status;
    assert.strictEqual(r.endState.met, 2); assert.strictEqual(r.reached, true);
    assert.strictEqual(host.store.getCompartment(comp.id).intentStatus.endState.met, 2, 'the last check is kept on the compartment');
  });

  test('intent: VERIFYING checks ACTING\'s result against the end state', () => {
    const host = mk(4);
    const comp = createCompartment(host, { name: 'notes-d', intent: notes });
    advanceWorkPhase(host, { name: 'notes-d', nextPhase: 'EXPLORING' });
    advanceWorkPhase(host, { name: 'notes-d', nextPhase: 'ACTING' });
    fs.writeFileSync(path.join(comp.fs.root, 'notes.txt'), 'hello\n');
    const v = advanceWorkPhase(host, { name: 'notes-d', nextPhase: 'VERIFYING' });
    assert.ok(v.intentStatus && v.intentStatus.reached, JSON.stringify(v.intentStatus));
  });

  test('intent: a broken condition is said — the end state can be reached and the compartment still not ok', () => {
    const host = mk(5);
    createCompartment(host, { name: 'notes-e', intent: { ...notes, conditions: [{ says: 'the tests pass', check: { kind: 'tests', run: 'node -e "process.exit(1)"' } }] } });
    const r = verifyCompartment(host, { name: 'notes-e' }).status;
    assert.strictEqual(r.ok, false); assert.strictEqual(r.reached, false);
    assert.match(r.conditions.results[0].evidence, /exit 1/);
  });

  test('intent: nesting — a child holds its parent\'s conditions and axioms (marked), adds its own, keeps its own end state', () => {
    const host = mk(6);
    createCompartment(host, { name: 'nexus-p', intent: { endState: [{ says: 'nexus runs', check: { kind: 'command', run: 'node -e "0"' } }], conditions: notes.conditions, axioms: notes.axioms } });
    const child = createCompartment(host, { name: 'notes-f', parentId: 'nexus-p', intent: { endState: notes.endState, conditions: [{ says: 'notes are plain text', check: { kind: 'command', run: 'node -e "0"' } }], axioms: ['reuse before writing'] } });
    const eff = INTENT.effective(child, host.store);
    assert.deepStrictEqual(eff.conditions.map(c => [c.says, c.inherited || null]), [['nothing is written outside the compartment', 'nexus-p'], ['notes are plain text', null]]);
    assert.deepStrictEqual(eff.axioms, [notes.axioms[0], 'reuse before writing']);
    assert.deepStrictEqual(eff.endState.map(e => e.says), ['a note can be kept', 'the notes can be read back'], 'its own end state, not the parent\'s');
    const dropped = INTENT.inherit({ conditions: [] }, { conditions: notes.conditions, axioms: [] }, 'p');
    assert.strictEqual(dropped.conditions.length, 1, 'a child cannot drop what its parent holds');
    const r = verifyCompartment(host, { name: 'notes-f' }).status;
    assert.strictEqual(r.conditions.total, 2); assert.strictEqual(r.inheritedConditions, 1);
  });

  test('intent: set later through its gate; cos intent and cos verify are commands; status and the brief say it', () => {
    const host = mk(7);
    createCompartment(host, { name: 'notes-g' });
    assert.throws(() => setIntent(host, { name: 'notes-g', intent: 'intent:\n  end_state:\n    - "it works"\n' }), /has no check/);
    const comp = setIntent(host, { name: 'notes-g', intent: 'intent:\n  end_state:\n    - { says: "a note can be kept", check: { kind: file, path: notes.txt } }\n' });
    assert.strictEqual(comp.intent.endState[0].says, 'a note can be kept');
    const { loadNodes } = require('../nodes/index.js');
    const nodes = loadNodes();
    assert.ok(nodes.nodes.has('intent') && nodes.nodes.has('verify'), JSON.stringify(nodes.errors));
    assert.match(intentLines(comp, host.store).join('\n'), /end state:\s+not checked yet/);
    assert.match(INTENT.brief(INTENT.effective(host.store.getCompartmentByName('notes-g'), host.store)), /the end state: a note can be kept/);
    assert.ok(isKnownEvent(HOST.COMPARTMENT_VERIFIED) && isKnownEvent(HOST.COMPARTMENT_INTENT_SET));
  });

  test('intent: idearium\'s charter.spec is a repo\'s compartment intent — one definition (lib/charter.js parses through cos)', () => {
    const CH = require('../../lib/charter.js');
    const c = CH.parse('charter:\n  axioms: ["least code"]\n  end_state:\n    - { says: "it runs", check: { kind: command, run: "true" } }\n');
    assert.deepStrictEqual(c.axioms, ['least code']); assert.strictEqual(c.endState[0].says, 'it runs');
    assert.match(CH.parse('charter:\n  conditions:\n    - "no check"\n').errors[0], /has no check/);
    assert.ok(/foundation\/intent\.js/.test(fs.readFileSync(path.join(__dirname, '../../lib/charter.js'), 'utf8')));
  });
}

test('createCompartment: emits host:compartment:created', () => {
  const host = createHost({
    stateFile: tmpFile('cli-create4-state.json'),
    mapFile:   tmpFile('cli-create4-map.json'),
  });
  let fired = false;
  host.bus.on(HOST.COMPARTMENT_CREATED, () => { fired = true; });
  createCompartment(host, { name: 'event-comp' });
  assert.ok(fired);
});

test('createCompartment: creates .cos-manifest.json on disk', () => {
  const host = createHost({
    stateFile: tmpFile('cli-create5-state.json'),
    mapFile:   tmpFile('cli-create5-map.json'),
  });
  const comp = createCompartment(host, { name: 'disk-comp' });
  assert.ok(fs.existsSync(comp.fs.root));
  const manifestPath = path.join(comp.fs.root, '.cos-manifest.json');
  assert.ok(fs.existsSync(manifestPath));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.strictEqual(manifest.id, comp.id);
});

test('createCompartment: throws on duplicate name', () => {
  const host = createHost({
    stateFile: tmpFile('cli-create6-state.json'),
    mapFile:   tmpFile('cli-create6-map.json'),
  });
  createCompartment(host, { name: 'dupe-comp' });
  assert.throws(
    () => createCompartment(host, { name: 'dupe-comp' }),
    /already exists/
  );
});

test('createCompartment: throws on empty name', () => {
  const host = createHost({
    stateFile: tmpFile('cli-create7-state.json'),
    mapFile:   tmpFile('cli-create7-map.json'),
  });
  assert.throws(() => createCompartment(host, { name: '' }), /required/);
});

// ─────────────────────────────────────────────────────────────────────────────
section('Phase 2 — cli/commands/list.js');

test('renderTable: empty compartments', () => {
  const out = renderTable([]);
  assert.ok(out.includes('No compartments'));
});

test('renderTable: renders compartment rows', () => {
  const comps = [
    makeCompartment({ id: 'id-1', name: 'my-app', state: 'running', runtimeId: 'node' }),
    makeCompartment({ id: 'id-2', name: 'my-db',  state: 'stopped', runtimeId: 'python' }),
  ];
  const out = renderTable(comps);
  assert.ok(out.includes('my-app'));
  assert.ok(out.includes('my-db'));
  assert.ok(out.includes('running'));
  assert.ok(out.includes('node'));
  assert.ok(out.includes('2 compartments'));
});

test('renderTable: singular "1 compartment"', () => {
  const out = renderTable([makeCompartment({ id: 'x', name: 'one' })]);
  assert.ok(out.includes('1 compartment'));
  assert.ok(!out.includes('1 compartments'));
});

// ─────────────────────────────────────────────────────────────────────────────
section('Phase 2 — cli/commands/map.js');

test('renderTree: empty system map renders header', () => {
  const map = makeSystemMap({ version: '1.0.0' });
  const out = renderTree(map);
  assert.ok(out.includes('COMPARTMENT OS'));
  assert.ok(out.includes('Compartments (0)'));
  assert.ok(out.includes('Hooks (0)'));
});

test('renderTree: shows compartments', () => {
  const map = makeSystemMap({
    compartments: [
      makeCompartment({ id: 'c1', name: 'web-api', state: 'running' }),
    ],
  });
  const out = renderTree(map);
  assert.ok(out.includes('web-api'));
  assert.ok(out.includes('running'));
});

test('renderTree: shows pipe arrows', () => {
  const map = makeSystemMap({
    pipes: [makePipe({ id: 'p1', name: 'build-to-deploy', state: 'active' })],
  });
  const out = renderTree(map);
  assert.ok(out.includes('build-to-deploy'));
});

// ─────────────────────────────────────────────────────────────────────────────
section('Phase 2 — cli/index.js (parseArgs)');

test('parseArgs: parses command and positional args', () => {
  const { command, args, flags } = parseArgs(['node', 'cos', 'create', 'my-app']);
  assert.strictEqual(command, 'create');
  assert.deepStrictEqual(args, ['my-app']);
  assert.deepStrictEqual(flags, {});
});

test('parseArgs: parses --json flag', () => {
  const { flags } = parseArgs(['node', 'cos', 'list', '--json']);
  assert.strictEqual(flags.json, true);
});

test('parseArgs: parses --watch flag', () => {
  const { flags } = parseArgs(['node', 'cos', 'map', '--watch']);
  assert.strictEqual(flags.watch, true);
});

test('parseArgs: no command returns null', () => {
  const { command } = parseArgs(['node', 'cos']);
  assert.strictEqual(command, null);
});

test('parseArgs: --key=value flags', () => {
  const { flags } = parseArgs(['node', 'cos', 'map', '--out=file.json']);
  assert.strictEqual(flags.out, 'file.json');
});

// ─── New command requires ─────────────────────────────────────────────────────

const { startCompartment }   = require('../cli/commands/start.js');
const { stopCompartment }    = require('../cli/commands/stop.js');
const { destroyCompartment, runDestroyWizard } = require('../cli/commands/destroy.js');
const { showStatus }         = require('../cli/commands/status.js');
const { runHooksCommand, listHooks, showHook, fireHook } = require('../cli/commands/hooks.js');
const { runEventsCommand, tailEvents, formatEvent } = require('../cli/commands/events.js');
const { validateSchema }     = require('../cli/commands/schema.js');
const { parseArgs: parseArgsFresh } = require('../cli/index.js');

// ─── Phase 2 — cli/commands/start.js ─────────────────────────────────────────

section('Phase 2 — cli/commands/start.js');

test('startCompartment: transitions created → running', () => {
  const host = createHost({ stateFile: tmpFile('start-state.json'), mapFile: tmpFile('start-map.json') });
  const { createCompartment } = require('../cli/commands/create.js');
  const comp = createCompartment(host, { name: 'start-test', purpose: 'test', runtimeId: 'node', networkIsolated: true });
  assert.strictEqual(comp.state, 'created');
  const updated = startCompartment(host, 'start-test', { log: () => {}, error: () => {} });
  assert.strictEqual(updated.state, 'running');
  assert.ok(typeof updated.lastStartAt === 'number');
});

test('startCompartment: persists state to store', () => {
  const host = createHost({ stateFile: tmpFile('start-persist.json'), mapFile: tmpFile('start-persist-map.json') });
  const { createCompartment } = require('../cli/commands/create.js');
  createCompartment(host, { name: 'start-persist', purpose: 'test', runtimeId: 'node', networkIsolated: true });
  startCompartment(host, 'start-persist', { log: () => {}, error: () => {} });
  const stored = host.store.getCompartmentByName('start-persist');
  assert.strictEqual(stored.state, 'running');
});

test('startCompartment: throws on invalid transition (already running)', () => {
  const host = createHost({ stateFile: tmpFile('start-dup.json'), mapFile: tmpFile('start-dup-map.json') });
  const { createCompartment } = require('../cli/commands/create.js');
  createCompartment(host, { name: 'start-dup', purpose: 'test', runtimeId: 'node', networkIsolated: true });
  startCompartment(host, 'start-dup', { log: () => {}, error: () => {} });
  assert.throws(
    () => startCompartment(host, 'start-dup', { log: () => {}, error: () => {} }),
    /cannot transition/
  );
});

test('startCompartment: throws on not found', () => {
  const host = createHost({ stateFile: tmpFile('start-nf.json'), mapFile: tmpFile('start-nf-map.json') });
  assert.throws(
    () => startCompartment(host, 'ghost', { log: () => {}, error: () => {} }),
    /not found/
  );
});

// ─── Phase 2 — cli/commands/stop.js ──────────────────────────────────────────

section('Phase 2 — cli/commands/stop.js');

test('stopCompartment: transitions running → stopped', () => {
  const host = createHost({ stateFile: tmpFile('stop-state.json'), mapFile: tmpFile('stop-map.json') });
  const { createCompartment } = require('../cli/commands/create.js');
  createCompartment(host, { name: 'stop-test', purpose: 'test', runtimeId: 'node', networkIsolated: true });
  startCompartment(host, 'stop-test', { log: () => {}, error: () => {} });
  const updated = stopCompartment(host, 'stop-test', { log: () => {}, error: () => {} });
  assert.strictEqual(updated.state, 'stopped');
  assert.ok(typeof updated.lastStopAt === 'number');
});

test('stopCompartment: throws on invalid transition (already stopped)', () => {
  const host = createHost({ stateFile: tmpFile('stop-dup.json'), mapFile: tmpFile('stop-dup-map.json') });
  const { createCompartment } = require('../cli/commands/create.js');
  createCompartment(host, { name: 'stop-dup', purpose: 'test', runtimeId: 'node', networkIsolated: true });
  startCompartment(host, 'stop-dup', { log: () => {}, error: () => {} });
  stopCompartment(host, 'stop-dup', { log: () => {}, error: () => {} });
  assert.throws(
    () => stopCompartment(host, 'stop-dup', { log: () => {}, error: () => {} }),
    /cannot transition/
  );
});

test('stopCompartment: throws on not found', () => {
  const host = createHost({ stateFile: tmpFile('stop-nf.json'), mapFile: tmpFile('stop-nf-map.json') });
  assert.throws(
    () => stopCompartment(host, 'ghost', { log: () => {}, error: () => {} }),
    /not found/
  );
});

// ─── Phase 2 — cli/commands/destroy.js ───────────────────────────────────────

section('Phase 2 — cli/commands/destroy.js');

test('destroyCompartment: removes from store + sysmap', () => {
  const host = createHost({ stateFile: tmpFile('dest-state.json'), mapFile: tmpFile('dest-map.json') });
  const { createCompartment } = require('../cli/commands/create.js');
  createCompartment(host, { name: 'dest-test', purpose: 'test', runtimeId: 'node', networkIsolated: true });
  destroyCompartment(host, 'dest-test', { force: true });
  assert.strictEqual(host.store.getCompartmentByName('dest-test'), null);
  const map = host.sysmap.get();
  assert.ok(!map.compartments.find(c => c.name === 'dest-test'));
});

test('destroyCompartment: emits host:compartment:destroyed', () => {
  const host = createHost({ stateFile: tmpFile('dest-event.json'), mapFile: tmpFile('dest-event-map.json') });
  const { createCompartment } = require('../cli/commands/create.js');
  createCompartment(host, { name: 'dest-event', purpose: 'test', runtimeId: 'node', networkIsolated: true });
  let fired = null;
  host.bus.on('host:compartment:destroyed', ev => { fired = ev.payload; });
  destroyCompartment(host, 'dest-event', { force: true });
  assert.ok(fired !== null);
  assert.strictEqual(fired.name, 'dest-event');
});

test('destroyCompartment: throws on running without force', () => {
  const host = createHost({ stateFile: tmpFile('dest-run.json'), mapFile: tmpFile('dest-run-map.json') });
  const { createCompartment } = require('../cli/commands/create.js');
  createCompartment(host, { name: 'dest-run', purpose: 'test', runtimeId: 'node', networkIsolated: true });
  startCompartment(host, 'dest-run', { log: () => {}, error: () => {} });
  assert.throws(
    () => destroyCompartment(host, 'dest-run'),
    /stop it first/
  );
});

test('destroyCompartment: force destroys running compartment', () => {
  const host = createHost({ stateFile: tmpFile('dest-force.json'), mapFile: tmpFile('dest-force-map.json') });
  const { createCompartment } = require('../cli/commands/create.js');
  createCompartment(host, { name: 'dest-force', purpose: 'test', runtimeId: 'node', networkIsolated: true });
  startCompartment(host, 'dest-force', { log: () => {}, error: () => {} });
  assert.doesNotThrow(() => destroyCompartment(host, 'dest-force', { force: true }));
  assert.strictEqual(host.store.getCompartmentByName('dest-force'), null);
});

test('destroyCompartment: throws on not found', () => {
  const host = createHost({ stateFile: tmpFile('dest-nf.json'), mapFile: tmpFile('dest-nf-map.json') });
  assert.throws(
    () => destroyCompartment(host, 'ghost', { force: true }),
    /not found/
  );
});

// ─── Phase 2 — cli/commands/status.js ────────────────────────────────────────

section('Phase 2 — cli/commands/status.js');

test('showStatus: returns compartment for valid name', () => {
  const host = createHost({ stateFile: tmpFile('status-state.json'), mapFile: tmpFile('status-map.json') });
  const { createCompartment } = require('../cli/commands/create.js');
  createCompartment(host, { name: 'status-test', purpose: 'testing status', runtimeId: 'node', networkIsolated: true });
  const logs = [];
  const comp = showStatus(host, 'status-test', {}, { log: s => logs.push(s), error: () => {} });
  assert.ok(comp !== null);
  assert.strictEqual(comp.name, 'status-test');
  assert.ok(logs.some(l => l.includes('status-test')));
});

test('showStatus: returns null for missing compartment', () => {
  const host = createHost({ stateFile: tmpFile('status-nf.json'), mapFile: tmpFile('status-nf-map.json') });
  const result = showStatus(host, 'ghost', {}, { log: () => {}, error: () => {} });
  assert.strictEqual(result, null);
});

test('showStatus: --json returns raw compartment JSON', () => {
  const host = createHost({ stateFile: tmpFile('status-json.json'), mapFile: tmpFile('status-json-map.json') });
  const { createCompartment } = require('../cli/commands/create.js');
  createCompartment(host, { name: 'status-json', purpose: 'test', runtimeId: 'node', networkIsolated: true });
  const logs = [];
  showStatus(host, 'status-json', { json: true }, { log: s => logs.push(s), error: () => {} });
  const parsed = JSON.parse(logs[0]);
  assert.strictEqual(parsed.name, 'status-json');
});

// ─── Phase 2 — cli/commands/hooks.js ─────────────────────────────────────────

section('Phase 2 — cli/commands/hooks.js');

test('listHooks: empty system map prints no-hooks message', () => {
  const host = createHost({ stateFile: tmpFile('hk-empty.json'), mapFile: tmpFile('hk-empty-map.json') });
  const logs = [];
  listHooks(host, {}, { log: s => logs.push(s), error: () => {} });
  assert.ok(logs.some(l => l.includes('No hooks')));
});

test('listHooks: shows hooks from system map', () => {
  const host = createHost({ stateFile: tmpFile('hk-list.json'), mapFile: tmpFile('hk-list-map.json') });
  const { randomUUID } = require('crypto');
  const hook = {
    id:            randomUUID(),
    name:          'test-hook',
    version:       '1.0.0',
    compartmentId: 'host',
    contract:      { inputs: [], outputs: [], sideEffects: [], axioms: [] },
    bindings:      { ui: null, cli: 'cos test', event: 'host:test:fired' },
    meta:          { description: 'test', autoDetected: false, sourceFile: null, createdAt: Date.now(), updatedAt: Date.now() },
  };
  host.sysmap.upsertHook(hook);
  const logs = [];
  listHooks(host, {}, { log: s => logs.push(s), error: () => {} });
  assert.ok(logs.some(l => l.includes('test-hook')));
});

test('showHook: returns null for missing hook', () => {
  const host = createHost({ stateFile: tmpFile('hk-show-nf.json'), mapFile: tmpFile('hk-show-nf-map.json') });
  const result = showHook(host, 'ghost', {}, { log: () => {}, error: () => {} });
  assert.strictEqual(result, null);
});

test('fireHook: emits hook event on bus', () => {
  const host = createHost({ stateFile: tmpFile('hk-fire.json'), mapFile: tmpFile('hk-fire-map.json') });
  const { randomUUID } = require('crypto');
  const hook = {
    id:            randomUUID(),
    name:          'fire-test-hook',
    version:       '1.0.0',
    compartmentId: 'host',
    contract:      { inputs: [], outputs: [], sideEffects: [], axioms: [] },
    bindings:      { ui: null, cli: null, event: 'host:test:fired' },
    meta:          { description: 'fire test', autoDetected: false, sourceFile: null, createdAt: Date.now(), updatedAt: Date.now() },
  };
  host.sysmap.upsertHook(hook);
  let fired = null;
  host.bus.on('host:test:fired', ev => { fired = ev.payload; });
  fireHook(host, 'fire-test-hook', {}, { log: () => {}, error: () => {} });
  assert.ok(fired !== null);
  assert.strictEqual(fired.hookId, hook.id);
  assert.strictEqual(fired.manual, true);
});

// ─── Phase 2 — cli/commands/events.js ────────────────────────────────────────

section('Phase 2 — cli/commands/events.js');

test('formatEvent: formats event with seq and type', () => {
  const ev = { seq: 42, ts: 1700000000000, type: 'host:test:event', payload: { x: 1 } };
  const out = formatEvent(ev);
  assert.ok(out.includes('42'));
  assert.ok(out.includes('host:test:event'));
});

test('formatEvent: --json returns raw JSON', () => {
  const ev = { seq: 1, ts: 1700000000000, type: 'host:test:event', payload: {} };
  const out = formatEvent(ev, { json: true });
  const parsed = JSON.parse(out);
  assert.strictEqual(parsed.type, 'host:test:event');
});

test('tailEvents: prints last N from ring buffer', () => {
  const host = createHost({ stateFile: tmpFile('ev-tail.json'), mapFile: tmpFile('ev-tail-map.json') });
  // Emit a few events
  host.bus.emit('host:test:one', { v: 1 });
  host.bus.emit('host:test:two', { v: 2 });
  host.bus.emit('host:test:three', { v: 3 });
  const logs = [];
  tailEvents(host, 10, {}, { log: s => logs.push(s) });
  assert.ok(logs.some(l => l.includes('host:test:one') || l.includes('host:test:two') || l.includes('host:test:three')));
});

// ─── Phase 2 — cli/commands/schema.js ────────────────────────────────────────

section('Phase 2 — cli/commands/schema.js');

test('validateSchema: no hooks → valid result', () => {
  const host = createHost({ stateFile: tmpFile('schema-empty.json'), mapFile: tmpFile('schema-empty-map.json') });
  const result = validateSchema(host, {}, { log: () => {}, error: () => {} });
  assert.strictEqual(result.total, 0);
  assert.strictEqual(result.invalid, 0);
});

test('validateSchema: valid hook passes', () => {
  const host = createHost({ stateFile: tmpFile('schema-valid.json'), mapFile: tmpFile('schema-valid-map.json') });
  const { randomUUID } = require('crypto');
  const hook = {
    id:            randomUUID(),
    name:          'schema-valid-hook',
    version:       '1.0.0',
    compartmentId: 'host',
    contract:      { inputs: [], outputs: [], sideEffects: [], axioms: [] },
    bindings:      { ui: null, cli: null, event: 'host:schema:validated' },
    meta:          { description: 'ok', autoDetected: false, sourceFile: null, createdAt: Date.now(), updatedAt: Date.now() },
  };
  host.sysmap.upsertHook(hook);
  const result = validateSchema(host, {}, { log: () => {}, error: () => {} });
  assert.strictEqual(result.valid, 1);
  assert.strictEqual(result.invalid, 0);
});

test('validateSchema: invalid hook surfaces error', () => {
  const host = createHost({ stateFile: tmpFile('schema-bad.json'), mapFile: tmpFile('schema-bad-map.json') });
  // Inject a malformed hook directly into sysmap (bypasses validateHook)
  const map = host.sysmap.get();
  map.hooks.push({ id: 'not-a-uuid', name: 'bad-hook' });
  host.sysmap._map = map;  // force-set for test purposes
  const result = validateSchema(host, {}, { log: () => {}, error: () => {} });
  assert.ok(result.invalid >= 1);
});

// ─── Phase 2 — cli/index.js (updated parseArgs) ───────────────────────────────

section('Phase 2 — cli/index.js (updated parseArgs)');

test('parseArgs: parses --force flag', () => {
  const { flags } = parseArgsFresh(['node', 'cos', 'destroy', 'mycomp', '--force']);
  assert.strictEqual(flags.force, true);
});

test('parseArgs: parses --wipe flag', () => {
  const { flags } = parseArgsFresh(['node', 'cos', 'destroy', 'mycomp', '--wipe']);
  assert.strictEqual(flags.wipe, true);
});

test('parseArgs: parses subcommand in args', () => {
  const { command, args } = parseArgsFresh(['node', 'cos', 'hooks', 'list']);
  assert.strictEqual(command, 'hooks');
  assert.strictEqual(args[0], 'list');
});

// ─── SISO primitive requires ──────────────────────────────────────────────────

const { Event: SisoEvent, Gate: SisoGate, Stream: SisoStream, StreamLog: SisoStreamLog }
  = require('../siso/index.js');

// ─── SISO — Event ─────────────────────────────────────────────────────────────

section('SISO — Event');

test('Event: type and data stored', () => {
  const e = new SisoEvent('host:test:event', { x: 1 });
  assert.strictEqual(e.type, 'host:test:event');
  assert.strictEqual(e.data.x, 1);
});

test('Event: data defaults to empty object', () => {
  const e = new SisoEvent('host:test:bare');
  assert.strictEqual(typeof e.data, 'object');
  assert.strictEqual(Object.keys(e.data).length, 0);
});

// ─── SISO — Gate ──────────────────────────────────────────────────────────────

section('SISO — Gate');

test('Gate: signature stored', () => {
  const g = new SisoGate('host:test:sig');
  assert.strictEqual(g.signature, 'host:test:sig');
});

test('Gate: empty signature throws', () => {
  assert.throws(() => new SisoGate(''), /signature must be a non-empty string/);
});

test('Gate: base transform is a no-op (does not throw)', () => {
  const g = new SisoGate('noop');
  assert.doesNotThrow(() => g.transform(new SisoEvent('noop'), {}));
});

// ─── SISO — Stream ────────────────────────────────────────────────────────────

section('SISO — Stream');

test('Stream: register gate and lookup', () => {
  const s = new SisoStream();
  const g = new SisoGate('test.sig');
  s.register(g);
  assert.ok(s.gates.has('test.sig'));
});

test('Stream: signature collision throws', () => {
  const s = new SisoStream();
  s.register(new SisoGate('x'));
  assert.throws(() => s.register(new SisoGate('x')), /Signature collision/);
});

test('Stream: unclaimed event goes to pending', () => {
  const s = new SisoStream();
  s.emit(new SisoEvent('unknown', { v: 42 }));
  assert.strictEqual(s.pending.length, 1);
  assert.strictEqual(s.pending[0].type, 'unknown');
});

test('Stream: claimed event does not go to pending', () => {
  class Sink extends SisoGate {
    constructor() { super('sink'); }
    transform() {}
  }
  const s = new SisoStream();
  s.register(new Sink());
  s.emit(new SisoEvent('sink'));
  assert.strictEqual(s.sampleHere().pending.length, 0);
});

test('Stream: gate transform receives event and stream', () => {
  let received = null;
  class Spy extends SisoGate {
    constructor() { super('spy'); }
    transform(event, stream) {
      received = { type: event.type, val: event.data.val, hasEmit: typeof stream.emit === 'function' };
    }
  }
  const s = new SisoStream();
  s.register(new Spy());
  s.emit(new SisoEvent('spy', { val: 99 }));
  assert.strictEqual(received.type, 'spy');
  assert.strictEqual(received.val, 99);
  assert.ok(received.hasEmit);
});

test('Stream: depth-first dispatch (gate-emitted events run before parent finishes)', () => {
  const order = [];
  class A extends SisoGate {
    constructor() { super('a'); }
    transform(event, stream) {
      order.push('a-start');
      stream.emit(new SisoEvent('b'));
      order.push('a-end');
    }
  }
  class B extends SisoGate {
    constructor() { super('b'); }
    transform() { order.push('b'); }
  }
  const s = new SisoStream();
  s.register(new A());
  s.register(new B());
  s.emit(new SisoEvent('a'));
  assert.strictEqual(order.join(','), 'a-start,b,a-end');
});

test('Stream: sampleHere returns copy of pending', () => {
  const s = new SisoStream();
  s.emit(new SisoEvent('x'));
  const sample = s.sampleHere();
  sample.pending.pop();
  assert.strictEqual(s.sampleHere().pending.length, 1);
});

test('Stream: eventCount tracks all emits', () => {
  class Echo extends SisoGate {
    constructor() { super('echo'); }
    transform(event, stream) { stream.emit(new SisoEvent('out')); }
  }
  const s = new SisoStream();
  s.register(new Echo());
  s.emit(new SisoEvent('echo'));
  assert.strictEqual(s.sampleHere().eventCount, 2);
});

test('Stream: deregister removes a gate', () => {
  const s = new SisoStream();
  s.register(new SisoGate('removeme'));
  s.deregister('removeme');
  assert.ok(!s.gates.has('removeme'));
});

test('Stream: onAny observer sees all events (not a gate)', () => {
  const s = new SisoStream();
  const seen = [];
  s.onAny(ev => seen.push(ev.type));
  s.emit(new SisoEvent('x'));
  s.emit(new SisoEvent('y'));
  assert.ok(seen.includes('x'));
  assert.ok(seen.includes('y'));
  assert.strictEqual(s.sampleHere().pending.length, 2); // still goes to pending
});

test('Stream: on observer fires only for matching type', () => {
  const s = new SisoStream();
  const seen = [];
  s.on('target', ev => seen.push(ev.type));
  s.emit(new SisoEvent('target'));
  s.emit(new SisoEvent('other'));
  assert.strictEqual(seen.length, 1);
  assert.strictEqual(seen[0], 'target');
});

test('Stream: ring buffer tail returns last N stamped events', () => {
  const s = new SisoStream();
  s.emit(new SisoEvent('a'));
  s.emit(new SisoEvent('b'));
  s.emit(new SisoEvent('c'));
  const tail = s.tail(2);
  assert.strictEqual(tail.length, 2);
  assert.strictEqual(tail[0].type, 'b');
  assert.strictEqual(tail[1].type, 'c');
});

test('Stream: stamped event has seq + timestamp', () => {
  const s = new SisoStream();
  const stamped = s.emit(new SisoEvent('test.stamp', { v: 1 }));
  assert.ok(typeof stamped.seq === 'number');
  assert.ok(typeof stamped.timestamp === 'number');
  assert.strictEqual(stamped.type, 'test.stamp');
  assert.strictEqual(stamped.payload.v, 1);
});

// ─── SISO — StreamLog ─────────────────────────────────────────────────────────

section('SISO — StreamLog');

test('StreamLog: OFF records nothing', () => {
  const log = new SisoStreamLog('OFF');
  log.record({ streamId: 1, eventType: 'x', gateClaimed: 'x', eventData: {} });
  assert.strictEqual(log.sample().count, 0);
});

test('StreamLog: EVENTS records type and claimed', () => {
  const log = new SisoStreamLog('EVENTS');
  log.record({ streamId: 1, eventType: 'foo', gateClaimed: 'foo', eventData: { big: true } });
  const entries = log.sample().entries;
  assert.strictEqual(entries.length, 1);
  assert.strictEqual(entries[0].type, 'foo');
  assert.strictEqual(entries[0].claimed, 'foo');
  assert.strictEqual(entries[0].streamId, undefined); // not at EVENTS level
  assert.strictEqual(entries[0].data, undefined);
});

test('StreamLog: DEEP includes streamId', () => {
  const log = new SisoStreamLog('DEEP');
  log.record({ streamId: 5, parentStreamId: 3, eventType: 'x', gateClaimed: 'x', eventData: {} });
  const e = log.sample().entries[0];
  assert.strictEqual(e.streamId, 5);
  assert.strictEqual(e.parentStreamId, 3);
  assert.strictEqual(e.data, undefined);
});

test('StreamLog: DATA includes full payload', () => {
  const log = new SisoStreamLog('DATA');
  log.record({ streamId: 1, parentStreamId: null, eventType: 'y', gateClaimed: 'y', eventData: { val: 42 } });
  assert.strictEqual(log.sample().entries[0].data.val, 42);
});

test('StreamLog: seq increments', () => {
  const log = new SisoStreamLog('EVENTS');
  log.record({ streamId: 1, eventType: 'a', gateClaimed: null, eventData: {} });
  log.record({ streamId: 1, eventType: 'b', gateClaimed: null, eventData: {} });
  assert.strictEqual(log.sample().entries[0].seq, 0);
  assert.strictEqual(log.sample().entries[1].seq, 1);
});

test('StreamLog: clear resets entries and seq', () => {
  const log = new SisoStreamLog('EVENTS');
  log.record({ streamId: 1, eventType: 'x', gateClaimed: null, eventData: {} });
  log.clear();
  assert.strictEqual(log.sample().count, 0);
  assert.strictEqual(log.seq, 0);
});

test('StreamLog: since() returns entries after given seq', () => {
  const log = new SisoStreamLog('EVENTS');
  log.record({ streamId: 1, eventType: 'a', gateClaimed: null, eventData: {} });
  log.record({ streamId: 1, eventType: 'b', gateClaimed: null, eventData: {} });
  log.record({ streamId: 1, eventType: 'c', gateClaimed: null, eventData: {} });
  const after = log.since(0);
  assert.strictEqual(after.length, 2); // seq 1 and 2
});

test('StreamLog: shared across stream — EventBus.log captures all events', () => {
  const bus = require('../host/event-bus.js').createEventBus({ logLevel: 'DATA' });
  bus.emit('host:test:one', { v: 1 });
  bus.emit('host:test:two', { v: 2 });
  const entries = bus.log.sample().entries;
  assert.ok(entries.some(e => e.type === 'host:test:one'));
  assert.ok(entries.some(e => e.type === 'host:test:two'));
});

// ─── SISO — Gate Pipeline integration ────────────────────────────────────────

section('SISO — Gate pipeline in EventBus');

test('EventBus: register gate — gate transforms event, result goes to pending', () => {
  const { createEventBus } = require('../host/event-bus.js');
  const bus = createEventBus();

  class DoubleGate extends SisoGate {
    constructor() { super('test:double:run'); }
    transform(event, stream) {
      stream.emit(new SisoEvent('test:double:result', { value: event.data.x * 2 }));
    }
  }

  bus.register(new DoubleGate());
  bus.emit('test:double:run', { x: 7 });
  const { pending } = bus.sampleHere();
  assert.strictEqual(pending.length, 1);
  assert.strictEqual(pending[0].type, 'test:double:result');
  assert.strictEqual(pending[0].data.value, 14);
});

test('EventBus: gate signature collision throws', () => {
  const { createEventBus } = require('../host/event-bus.js');
  const bus = createEventBus();
  bus.register(new SisoGate('test:collision:a'));
  assert.throws(() => bus.register(new SisoGate('test:collision:a')), /Signature collision/);
});

test('EventBus: deregister removes gate, event goes to pending after', () => {
  const { createEventBus } = require('../host/event-bus.js');
  const bus = createEventBus();

  class Sink extends SisoGate {
    constructor() { super('test:sink:go'); }
    transform() {}
  }

  bus.register(new Sink());
  bus.emit('test:sink:go', {});
  assert.strictEqual(bus.sampleHere().pending.length, 0); // claimed

  bus.deregister('test:sink:go');
  bus.emit('test:sink:go', {});
  assert.strictEqual(bus.sampleHere().pending.length, 1); // unclaimed after deregister
});

test('EventBus: host boot registers 4 compartment lifecycle gates', () => {
  const { createHost } = require('../host/index.js');
  const host = createHost({
    stateFile: tmpFile('gate-boot.json'),
    mapFile:   tmpFile('gate-boot-map.json'),
  });
  const { gateCount } = host.bus.sampleHere();
  // 4 lifecycle gates registered at boot
  assert.ok(gateCount >= 4, `expected >= 4 gates, got ${gateCount}`);
});

// ─── Phase 4 requires ────────────────────────────────────────────────────────

const { spawnProcess, killProcess, getProcess, resolveRuntime }
  = require('../compartment/process-runner.js');
const { ProcessSpawnGate, ProcessKillGate } = require('../host/gates/process.js');

// ─── Phase 4 — resolveRuntime ─────────────────────────────────────────────────

section('Phase 4 — resolveRuntime');

test('resolveRuntime: node → process.execPath', () => {
  const { bin } = resolveRuntime('node', 'index.js');
  assert.strictEqual(bin, process.execPath);
});

test('resolveRuntime: unknown runtime → uses runtimeId as bin', () => {
  const { bin, args } = resolveRuntime('deno', 'main.ts');
  assert.strictEqual(bin, 'deno');
  assert.ok(args.includes('main.ts'));
});

test('resolveRuntime: go prefixes with run', () => {
  const { bin, args } = resolveRuntime('go', 'main.go');
  assert.strictEqual(bin, 'go');
  assert.strictEqual(args[0], 'run');
  assert.ok(args.includes('main.go'));
});

// ─── Phase 4 — spawnProcess (real process) ───────────────────────────────────

section('Phase 4 — spawnProcess (live Node.js)');

// Async test helper that returns a Promise — wraps test()
// We use a manual approach: collect events over a timeout
function spawnTestHost() {
  const { createEventBus }  = require('../host/event-bus.js');
  const bus   = createEventBus();
  const store = {
    getCompartment:    () => null,
    setCompartment:    () => {},
    flushSync:         () => {},
  };
  const sysmap = { upsertCompartment: () => {} };
  return { bus, store, sysmap };
}

function collectEvents(bus, types, timeoutMs = 800) {
  return new Promise(resolve => {
    const collected = {};
    for (const t of types) collected[t] = [];
    const unsubs = types.map(t =>
      bus.on(t, ev => collected[t].push(ev.payload))
    );
    setTimeout(() => {
      unsubs.forEach(u => u());
      resolve(collected);
    }, timeoutMs);
  });
}

// We use a special test runner wrapper for async process tests
const asyncTests = [];
function testProcess(name, fn) {
  asyncTests.push({ name, fn });
}

testProcess('spawnProcess: emits comp:process:started with pid', async () => {
  const { bus, store, sysmap } = spawnTestHost();
  const p = collectEvents(bus, ['comp:process:started', 'comp:process:exited'], 800);

  spawnProcess({
    compartmentId: 'proc-test-1',
    name:          'proc-test-1',
    runtimeId:     'node',
    entryFile:     '-e',
    entryArgs:     ['process.exit(0)'],
    cwd:           '/tmp',
    env:           {},
    bus, store, sysmap,
  });

  const events = await p;
  const started = events['comp:process:started'];
  assert.strictEqual(started.length, 1);
  assert.ok(typeof started[0].pid === 'number');
  assert.ok(started[0].pid > 0);
  assert.strictEqual(started[0].runtimeId, 'node');
});

testProcess('spawnProcess: emits stdout lines', async () => {
  const { bus, store, sysmap } = spawnTestHost();
  const p = collectEvents(bus, ['comp:process:stdout', 'comp:process:exited'], 800);

  spawnProcess({
    compartmentId: 'proc-test-2',
    name:          'proc-test-2',
    runtimeId:     'node',
    entryFile:     '-e',
    entryArgs:     ['console.log("line-one"); console.log("line-two"); process.exit(0)'],
    cwd:           '/tmp',
    env:           {},
    bus, store, sysmap,
  });

  const events = await p;
  const lines  = events['comp:process:stdout'].map(e => e.line);
  assert.ok(lines.includes('line-one'), `expected line-one in ${JSON.stringify(lines)}`);
  assert.ok(lines.includes('line-two'), `expected line-two in ${JSON.stringify(lines)}`);
});

testProcess('spawnProcess: emits stderr lines', async () => {
  const { bus, store, sysmap } = spawnTestHost();
  const p = collectEvents(bus, ['comp:process:stderr', 'comp:process:exited'], 800);

  spawnProcess({
    compartmentId: 'proc-test-3',
    name:          'proc-test-3',
    runtimeId:     'node',
    entryFile:     '-e',
    entryArgs:     ['process.stderr.write("err-line\\n"); process.exit(0)'],
    cwd:           '/tmp',
    env:           {},
    bus, store, sysmap,
  });

  const events = await p;
  const lines  = events['comp:process:stderr'].map(e => e.line);
  assert.ok(lines.includes('err-line'), `expected err-line in ${JSON.stringify(lines)}`);
});

testProcess('spawnProcess: emits comp:process:exited on clean exit', async () => {
  const { bus, store, sysmap } = spawnTestHost();
  const p = collectEvents(bus, ['comp:process:exited'], 800);

  spawnProcess({
    compartmentId: 'proc-test-4',
    name:          'proc-test-4',
    runtimeId:     'node',
    entryFile:     '-e',
    entryArgs:     ['process.exit(0)'],
    cwd:           '/tmp',
    env:           {},
    bus, store, sysmap,
  });

  const events = await p;
  const exited = events['comp:process:exited'];
  assert.strictEqual(exited.length, 1);
  assert.strictEqual(exited[0].code, 0);
});

testProcess('spawnProcess: emits comp:process:crashed on non-zero exit', async () => {
  const { bus, store, sysmap } = spawnTestHost();
  const p = collectEvents(bus, ['comp:process:crashed'], 800);

  spawnProcess({
    compartmentId: 'proc-test-5',
    name:          'proc-test-5',
    runtimeId:     'node',
    entryFile:     '-e',
    entryArgs:     ['process.exit(1)'],
    cwd:           '/tmp',
    env:           {},
    bus, store, sysmap,
  });

  const events = await p;
  const crashed = events['comp:process:crashed'];
  assert.strictEqual(crashed.length, 1);
  assert.strictEqual(crashed[0].code, 1);
});

testProcess('spawnProcess: nonexistent entry emits comp:process:crashed (exit code 1)', async () => {
  const { bus, store, sysmap } = spawnTestHost();
  const p = collectEvents(bus, ['comp:process:crashed'], 800);

  // Node binary exists; the entry file does not — node spawns, then exits with code 1
  spawnProcess({
    compartmentId: 'proc-test-6',
    name:          'proc-test-6',
    runtimeId:     'node',
    entryFile:     '/nonexistent/absolutely/does/not/exist.js',
    entryArgs:     [],
    cwd:           '/tmp',
    env:           {},
    bus, store, sysmap,
  });

  const events = await p;
  const crashed = events['comp:process:crashed'];
  assert.strictEqual(crashed.length, 1);
  assert.strictEqual(crashed[0].code, 1);
});

testProcess('spawnProcess: duplicate spawn emits comp:spawn:failed', async () => {
  const { bus, store, sysmap } = spawnTestHost();
  const p = collectEvents(bus, ['comp:spawn:failed', 'comp:process:exited'], 800);

  // First spawn (will run and exit)
  spawnProcess({
    compartmentId: 'proc-test-dup',
    name:          'proc-test-dup',
    runtimeId:     'node',
    entryFile:     '-e',
    entryArgs:     ['setTimeout(() => process.exit(0), 300)'],
    cwd:           '/tmp',
    env:           {},
    bus, store, sysmap,
  });

  // Second spawn immediately — should fail
  spawnProcess({
    compartmentId: 'proc-test-dup',
    name:          'proc-test-dup',
    runtimeId:     'node',
    entryFile:     '-e',
    entryArgs:     ['process.exit(0)'],
    cwd:           '/tmp',
    env:           {},
    bus, store, sysmap,
  });

  const events = await p;
  assert.ok(events['comp:spawn:failed'].length >= 1);
});

testProcess('spawnProcess: missing runtimeId emits comp:spawn:failed', async () => {
  const { bus, store, sysmap } = spawnTestHost();
  const p = collectEvents(bus, ['comp:spawn:failed'], 300);
  const { ProcessSpawnGate: PSG } = require('../host/gates/process.js');
  const { Stream } = require('../siso/Stream.js');
  const { Event }  = require('../siso/Event.js');

  const s = new Stream();
  s.register(new PSG());
  // Route SPAWN_FAILED to bus for collection
  s.on('comp:spawn:failed', ev => bus.emit('comp:spawn:failed', ev.payload));

  s.emit(new Event('comp:process:spawn', {
    compartmentId: 'proc-no-runtime',
    name:          'no-runtime',
    runtimeId:     null,
    entryFile:     'index.js',
    bus, store, sysmap,
  }));

  const events = await p;
  assert.ok(events['comp:spawn:failed'].length >= 1);
});

testProcess('killProcess: SIGTERM stops a running process', async () => {
  const { bus, store, sysmap } = spawnTestHost();
  const p = collectEvents(bus, ['comp:process:started', 'comp:process:exited'], 2000);

  spawnProcess({
    compartmentId: 'proc-test-kill',
    name:          'proc-test-kill',
    runtimeId:     'node',
    entryFile:     '-e',
    entryArgs:     ['setInterval(() => {}, 10000)'], // runs forever
    cwd:           '/tmp',
    env:           {},
    bus, store, sysmap,
  });

  // Wait for process to start, then kill
  await new Promise(resolve => setTimeout(resolve, 150));
  killProcess('proc-test-kill');

  const events = await p;
  assert.strictEqual(events['comp:process:started'].length, 1);
  // Process should exit (clean because killRequested=true)
  assert.strictEqual(events['comp:process:exited'].length, 1);
  assert.ok(events['comp:process:exited'][0].killRequested);
});

testProcess('getProcess: returns record for running process, null after exit', async () => {
  const { bus, store, sysmap } = spawnTestHost();
  const p = collectEvents(bus, ['comp:process:started', 'comp:process:exited'], 800);

  spawnProcess({
    compartmentId: 'proc-test-get',
    name:          'proc-test-get',
    runtimeId:     'node',
    entryFile:     '-e',
    entryArgs:     ['setTimeout(() => process.exit(0), 200)'],
    cwd:           '/tmp',
    env:           {},
    bus, store, sysmap,
  });

  // Check registry immediately — should be there
  await new Promise(resolve => setTimeout(resolve, 50));
  const rec = getProcess('proc-test-get');
  assert.ok(rec !== null);
  assert.ok(rec.process.pid > 0);

  // Wait for exit — should be gone
  await p;
  assert.strictEqual(getProcess('proc-test-get'), null);
});

testProcess('host boot: cos start + entryFile triggers real spawn', async () => {
  const entryFile = tmpFile('entry.js');
  require('fs').writeFileSync(entryFile,
    'console.log("spawned-ok"); process.exit(0);', 'utf8');

  const host = createHost({
    stateFile: tmpFile('spawn-boot.json'),
    mapFile:   tmpFile('spawn-boot-map.json'),
  });

  const { createCompartment } = require('../cli/commands/create.js');
  const { startCompartment }  = require('../cli/commands/start.js');

  const stdout = [];
  host.bus.on('comp:process:stdout', ev => stdout.push(ev.payload.line));

  const comp = createCompartment(host, {
    name:            'spawn-boot-comp',
    purpose:         'spawn test',
    runtimeId:       'node',
    networkIsolated: true,
  });

  // Set entryFile on the compartment before starting
  const updated = Object.assign({}, comp, { entryFile });
  host.store.setCompartment(updated);
  host.sysmap.upsertCompartment(updated);

  startCompartment(host, 'spawn-boot-comp', { log: () => {}, error: () => {} });

  // Wait for process to complete
  await new Promise(resolve => setTimeout(resolve, 600));

  assert.ok(stdout.includes('spawned-ok'),
    `expected "spawned-ok" in stdout: ${JSON.stringify(stdout)}`);
});

// ─── Run async process tests ──────────────────────────────────────────────────

section('Phase 4 — process tests (async)');

// Run all async tests sequentially
async function runProcessTests() {
  for (const { name, fn } of asyncTests) {
    try {
      await fn();
      console.log(`  ✓  ${name}`);
      passed++;
    } catch (err) {
      console.log(`  ✖  ${name}`);
      console.log(`     ${err.message}`);
      failures.push({ name, err });
      failed++;
    }
  }
}

// We need to run async tests before the summary — use a top-level await pattern
// Since Node.js CJS doesn't support top-level await, we use a trick:
// The summary block is patched to run after async tests complete.
// See bottom of file for the async runner invocation.

// ═════════════════════════════════════════════════════════════════════════════
// SUMMARY (runs after async process tests)
// ═════════════════════════════════════════════════════════════════════════════

function printSummary() {
  console.log('');console.log('─'.repeat(56));
  console.log(`  ${passed + failed} tests  ·  ${passed} passed  ·  ${failed} failed`);
  console.log('─'.repeat(56));

  if (failed > 0) {
    console.log('');console.log('  Failures:');
    for (const { name, err } of failures) {
      console.log(`    ✖  ${name}`);
      console.log(`       ${err.message}`);
    }
    console.log('');
    process.exit(1);
  } else {
    console.log('  All tests passed.\n');
    process.exit(0);
  }
}

runProcessTests().then(printSummary).catch(err => {
  console.error('Async test runner error:', err);
  process.exit(1);
});
