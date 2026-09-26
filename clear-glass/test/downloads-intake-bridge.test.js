'use strict';
/**
 * test/downloads-intake-bridge.test.js — clear-glass/src/downloads/
 * intake-bridge.js coverage.
 * UUID: cg-test-downloads-intake-bridge-v1-0000-2026-0903-001
 *
 * Real mock guardian HTTP server on a scratch port (never the real
 * :7820) so the whole path — bus event -> install()'s handler ->
 * http.request -> a real server receiving a real POST body — is
 * exercised, not just the payload-shaping logic in isolation.
 *
 * Run: node test/downloads-intake-bridge.test.js
 */

const http = require('http');

function freshModules() {
  Object.keys(require.cache).forEach(k => {
    if (k.includes('clear-glass-v3/siso') || k.includes('clear-glass-v3/src/core') ||
        k.includes('clear-glass-v3/src/downloads')) {
      delete require.cache[k];
    }
  });
  const { createBus, emit } = require('../src/core/bus');
  createBus('SILENT');
  return { emit };
}

let passed = 0, failed = 0;
const results = [];
function test(name, fn) {
  return fn()
    .then(() => { passed++; results.push({ name, ok: true }); console.log(`  ✓ ${name}`); })
    .catch(err => { failed++; results.push({ name, ok: false, error: err.message }); console.log(`  ✗ ${name}: ${err.message}`); });
}
function assert(cond, msg = 'assertion failed') { if (!cond) throw new Error(msg); }
function assertEqual(a, b, msg) { if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(a)} === ${JSON.stringify(b)}`); }

// Real mock guardian server on a scratch port.
function mockGuardian(port) {
  const received = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      received.push(JSON.parse(body || '{}'));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, dropId: 'test-drop-id' }));
    });
  });
  return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve({ server, received })));
}

async function main() {
  const PORT = 18820; // scratch — never the real guardian :7820
  process.env.GUARDIAN_HOST = '127.0.0.1';
  process.env.GUARDIAN_HTTP_PORT = String(PORT);

  const { server, received } = await mockGuardian(PORT);
  const { emit } = freshModules();
  const { install } = require('../src/downloads/intake-bridge');

  const logs = [];
  const bridge = install({ log: (...a) => logs.push(a.join(' ')) });

  console.log('\n[1] downloads/intake-bridge');

  await test('completed download is announced to guardian /api/intake', async () => {
    emit('downloads.completed', {
      agentId: 'agent-abc123', filename: 'report.pdf', url: 'https://example.com/report.pdf',
      savePath: '/tmp/report.pdf', mimeType: 'application/pdf', bytes: 4096, state: 'completed',
    });
    await new Promise(r => setTimeout(r, 100));
    assertEqual(received.length, 1, 'guardian should have received exactly one POST');
    const body = received[0];
    assertEqual(body.provider, 'browsing', 'provider must be the distinct sentinel, not a real provider id');
    assertEqual(body.agentId, 'agent-abc123');
    assertEqual(body.chatUrl, null, 'a browsing download has no originating chat — must be honestly null');
    assertEqual(body.source, '/tmp/report.pdf');
    assertEqual(body.filename, 'report.pdf');
  });

  await test('interrupted download is NOT announced', async () => {
    received.length = 0;
    emit('downloads.completed', { agentId: 'a', filename: 'x.bin', savePath: '/tmp/x.bin', state: 'interrupted' });
    await new Promise(r => setTimeout(r, 100));
    assertEqual(received.length, 0, 'non-completed states must not reach guardian');
  });

  await test('cancelled download is NOT announced', async () => {
    received.length = 0;
    emit('downloads.completed', { agentId: 'a', filename: 'x.bin', savePath: '/tmp/x.bin', state: 'cancelled' });
    await new Promise(r => setTimeout(r, 100));
    assertEqual(received.length, 0);
  });

  await test('completed download with no savePath is skipped, not announced', async () => {
    received.length = 0;
    emit('downloads.completed', { agentId: 'a', filename: 'x.bin', state: 'completed' });
    await new Promise(r => setTimeout(r, 100));
    assertEqual(received.length, 0, 'a completed event with no real savePath cannot be staged');
    assert(logs.some(l => l.includes('cannot stage')), 'a skip must be logged, not silent');
  });

  await test('detach() stops future events from being announced', async () => {
    received.length = 0;
    bridge.detach();
    emit('downloads.completed', { agentId: 'a', filename: 'y.bin', savePath: '/tmp/y.bin', state: 'completed' });
    await new Promise(r => setTimeout(r, 100));
    assertEqual(received.length, 0, 'detached bridge must not still be listening');
  });

  server.close();

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Clear Glass — Downloads Intake Bridge Tests`);
  console.log(`Passed: ${passed}  Failed: ${failed}  Total: ${passed + failed}`);
  if (failed > 0) {
    console.log('\nFailed tests:');
    results.filter(r => !r.ok).forEach(r => console.log(`  ✗ ${r.name}: ${r.error}`));
    process.exit(1);
  } else {
    console.log('All tests pass ✓');
    process.exit(0);
  }
}

main();
