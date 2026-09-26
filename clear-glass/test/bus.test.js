'use strict';
/**
 * test/bus.test.js — Clear Glass SISO bus tests
 * UUID: cg-test-bus-v1-0000-0000-000000000007
 *
 * Tests run in pure Node.js — no Electron, no browser.
 * This proves the bus architecture works before any UI loads.
 *
 * Run: node test/bus.test.js
 */

// Reset module cache so bus singleton can be re-created per test
function freshBus() {
  Object.keys(require.cache).forEach(k => {
    if (k.includes('clear-glass-v3/siso') || k.includes('clear-glass-v3/src/core')) {
      delete require.cache[k];
    }
  });
  const { createBus, emit, on, getBus, Event, Gate } = require('../src/core/bus');
  return { createBus, emit, on, getBus, Event, Gate };
}

let passed = 0;
let failed = 0;
const results = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    results.push({ name, ok: true });
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    results.push({ name, ok: false, error: err.message });
    console.log(`  ✗ ${name}: ${err.message}`);
  }
}

function assert(condition, msg = 'assertion failed') {
  if (!condition) throw new Error(msg);
}

function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(a)} === ${JSON.stringify(b)}`);
}

// ── SISO Core tests ─────────────────────────────────────────────────────────
console.log('\n[1] SISO Core');
{
  const { Event, Gate, Stream, StreamLog } = require('../siso/index');

  test('Event has uuid, type, data, ts', () => {
    const e = new Event('test.event', { x: 1 });
    assert(e.uuid, 'uuid missing');
    assertEqual(e.type, 'test.event');
    assertEqual(e.data.x, 1);
    assert(e.ts > 0);
  });

  test('Event data is frozen (immutable)', () => {
    const e = new Event('test', { x: 1 });
    assert(Object.isFrozen(e.data), 'data not frozen');
  });

  test('Event rejects empty type §1.2', () => {
    try { new Event(''); assert(false, 'should throw'); }
    catch (err) { assert(err.message.includes('§1.2')); }
  });

  test('Gate requires signature §1.2', () => {
    try { new Gate(''); assert(false, 'should throw'); }
    catch (err) { assert(err.message.includes('§1.2')); }
  });

  test('Stream O(1) gate lookup by signature', () => {
    const { Stream, Event, Gate } = require('../siso/index');
    const stream = new Stream();
    let hit = false;
    const g = new Gate('test.sig');
    g.transform = (e, s) => { hit = true; };
    stream.register(g);
    stream.emit(new Event('test.sig', {}));
    assert(hit, 'gate not called');
  });

  test('Stream signature collision throws', () => {
    const { Stream, Gate } = require('../siso/index');
    const stream = new Stream();
    const g1 = new Gate('dupe'); g1.transform = () => {};
    const g2 = new Gate('dupe'); g2.transform = () => {};
    stream.register(g1);
    try { stream.register(g2); assert(false, 'should throw'); }
    catch (err) { assert(err.message.includes('collision')); }
  });

  test('Unclaimed events land in pending', () => {
    const { Stream, Event } = require('../siso/index');
    const stream = new Stream();
    stream.emit(new Event('unclaimed', {}));
    const { pending } = stream.sampleHere();
    assertEqual(pending.length, 1);
    assertEqual(pending[0].type, 'unclaimed');
  });

  test('StreamLog records events', () => {
    const { Stream, StreamLog, Event, Gate } = require('../siso/index');
    const log = new StreamLog('DATA');
    const stream = new Stream({ log });
    const g = new Gate('logged.event');
    g.transform = (e, s) => {};
    stream.register(g);
    stream.emit(new Event('logged.event', { val: 42 }));
    const { entries } = log.sample();
    assertEqual(entries.length, 1);
    assertEqual(entries[0].type, 'logged.event');
  });

  test('Depth-first synchronous transform', () => {
    const { Stream, Event, Gate } = require('../siso/index');
    const stream = new Stream();
    const order = [];

    const g1 = new Gate('step.1');
    g1.transform = (e, s) => { order.push(1); s.emit(new Event('step.2', {})); order.push(3); };
    const g2 = new Gate('step.2');
    g2.transform = (e, s) => { order.push(2); };

    stream.register(g1);
    stream.register(g2);
    stream.emit(new Event('step.1', {}));

    // Depth-first: 1 → 2 → (back to 3 is wrong actually — depth-first means 1, then 2 is emitted synchronously, then 3)
    assert(order[0] === 1, `first should be 1, got ${order[0]}`);
    assert(order[1] === 2, `second should be 2 (depth-first), got ${order[1]}`);
    assert(order[2] === 3, `third should be 3, got ${order[2]}`);
  });

  test('pub/sub on() receives events', () => {
    const { Stream, Event, Gate } = require('../siso/index');
    const stream = new Stream();
    const received = [];
    stream.on('pub.event', e => received.push(e.data.val));
    stream.emit(new Event('pub.event', { val: 99 }));
    assertEqual(received[0], 99);
  });

  test('pub/sub wildcard * receives all events', () => {
    const { Stream, Event } = require('../siso/index');
    const stream = new Stream();
    const types = [];
    stream.on('*', e => types.push(e.type));
    stream.emit(new Event('a', {}));
    stream.emit(new Event('b', {}));
    assertEqual(types.length, 2);
    assertEqual(types[0], 'a');
    assertEqual(types[1], 'b');
  });

  test('on() returns unsubscribe function', () => {
    const { Stream, Event } = require('../siso/index');
    const stream = new Stream();
    const calls = [];
    const unsub = stream.on('unsub.test', e => calls.push(1));
    stream.emit(new Event('unsub.test', {}));
    unsub();
    stream.emit(new Event('unsub.test', {}));
    assertEqual(calls.length, 1, 'should only receive once');
  });
}

// ── Gate factory tests ──────────────────────────────────────────────────────
console.log('\n[2] Gate factory');
{
  const { gate } = require('../src/gates/index');
  const { Event, Stream } = require('../siso/index');

  test('gate() factory creates valid Gate', () => {
    const g = gate('factory.test', (e, s) => {});
    assert(g.signature === 'factory.test');
    assert(typeof g.transform === 'function');
  });

  test('gate transform receives event and stream', () => {
    const stream = new Stream();
    let gotEvent, gotStream;
    const g = gate('recv.test', (e, s) => { gotEvent = e; gotStream = s; });
    stream.register(g);
    stream.emit(new Event('recv.test', { x: 42 }));
    assert(gotEvent?.data?.x === 42);
    assert(gotStream === stream);
  });

  test('gate can emit downstream events', () => {
    const stream = new Stream();
    const downstream = [];
    const g1 = gate('chain.1', (e, s) => { s.emit(new Event('chain.2', { from: 'g1' })); });
    const g2 = gate('chain.2', (e, s) => { downstream.push(e.data.from); });
    stream.register(g1);
    stream.register(g2);
    stream.emit(new Event('chain.1', {}));
    assertEqual(downstream[0], 'g1', 'chain did not work');
  });
}

// ── Bus singleton tests ─────────────────────────────────────────────────────
console.log('\n[3] Bus singleton');
{
  // Fresh require to avoid singleton collision
  delete require.cache[require.resolve('../src/core/bus')];
  const busModule = require('../src/core/bus');

  test('createBus() creates singleton', () => {
    const bus = busModule.createBus('OFF');
    assert(bus, 'bus not created');
  });

  test('getBus() returns same instance', () => {
    const b1 = busModule.getBus();
    const b2 = busModule.getBus();
    assert(b1 === b2, 'not singleton');
  });

  test('emit() creates and emits Event on bus', () => {
    const received = [];
    busModule.on('bus.test', e => received.push(e));
    busModule.emit('bus.test', { val: 'hello' });
    assertEqual(received.length, 1);
    assertEqual(received[0].data.val, 'hello');
  });

  test('createBus() throws if called twice', () => {
    try { busModule.createBus('OFF'); assert(false, 'should throw'); }
    catch (err) { assert(err.message.includes('Already created')); }
  });
}

// ── URL Listener pattern tests ──────────────────────────────────────────────
console.log('\n[4] URL Listener patterns');
{
  // Test pattern compilation in isolation (no Electron needed)
  const compile = (pattern) => {
    if (pattern instanceof RegExp) return pattern;
    const escaped = String(pattern)
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    return new RegExp(escaped, 'i');
  };

  test('glob pattern matches', () => {
    const re = compile('*://api.openai.com/*');
    assert(re.test('https://api.openai.com/v1/chat/completions'));
  });

  test('glob pattern rejects non-match', () => {
    const re = compile('*://api.openai.com/*');
    assert(!re.test('https://www.google.com/'));
  });

  test('exact URL match', () => {
    const re = compile('https://claude.ai/api/messages');
    assert(re.test('https://claude.ai/api/messages'));
    assert(!re.test('https://claude.ai/api/other'));
  });

  test('regex pattern', () => {
    const re = compile(/claude\.ai\/api/);
    assert(re.test('https://claude.ai/api/messages'));
  });

  test('wildcard matches everything', () => {
    const re = compile('*');
    assert(re.test('https://anything.com/whatever'));
  });
}

// ── Fingerprint Engine tests ────────────────────────────────────────────────
console.log('\n[5] Fingerprint Engine');
{
  const FingerprintEngine = require('../src/fingerprint/engine');

  test('generate() returns complete Firefox profile', () => {
    const fp = new FingerprintEngine();
    const p = fp.generate('test-agent-1');
    assert(p.uuid, 'missing uuid');
    assert(p.ua?.includes('Firefox'), `UA should include Firefox: ${p.ua}`);
    assert(p.canvas, 'missing canvas');
    assert(p.webgl, 'missing webgl');
    assert(p.screen, 'missing screen');
    assert(p.timezone, 'missing timezone');
  });

  test('getOrGenerate() is deterministic per agentId', () => {
    const fp = new FingerprintEngine();
    const p1 = fp.getOrGenerate('stable-agent');
    const p2 = fp.getOrGenerate('stable-agent');
    assertEqual(p1.agentId, p2.agentId);
    assertEqual(p1.ua, p2.ua);
  });

  test('different agentIds get different profiles', () => {
    const fp = new FingerprintEngine();
    const p1 = fp.generate('agent-a');
    const p2 = fp.generate('agent-b');
    // Should have same structure but different seeds
    assert(p1.uuid !== p2.uuid, 'should have different UUIDs');
  });

  test('generateSpoofScript() returns injectable JS string', () => {
    const fp = new FingerprintEngine();
    fp.generate('spoof-test');
    const script = fp.generateSpoofScript('spoof-test');
    assert(typeof script === 'string');
    assert(script.includes('navigator'));
    assert(script.includes('webdriver'));
    assert(script.includes('Firefox'));
  });

  test('importFirefox() merges profile correctly', () => {
    const fp = new FingerprintEngine();
    const p = fp.importFirefox('ff-import-test', {
      userAgent: 'Mozilla/5.0 Firefox/120.0',
      intlLocale: 'en-GB',
      timezone: 'Europe/London',
    });
    assertEqual(p.ua, 'Mozilla/5.0 Firefox/120.0');
    assertEqual(p.language, 'en-GB');
    assertEqual(p.timezone, 'Europe/London');
    assertEqual(p.source, 'firefox-import');
  });
}

// ── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`Clear Glass v3 — Bus Tests`);
console.log(`Passed: ${passed}  Failed: ${failed}  Total: ${passed + failed}`);
if (failed > 0) {
  console.log('\nFailed tests:');
  results.filter(r => !r.ok).forEach(r => console.log(`  ✗ ${r.name}: ${r.error}`));
  process.exit(1);
} else {
  console.log('All tests pass ✓');
  process.exit(0);
}
