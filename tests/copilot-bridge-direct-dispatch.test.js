'use strict';
/**
 * tests/copilot-bridge-direct-dispatch.test.js
 *
 * James, live, from his own running system: "thought you took care of
 * bridge man..." — clear-glass/src/copilot/bridge.js was still retrying
 * a handshake against bridge:9999 every 10s, and _bridgeDispatch (the
 * real mechanism behind every copilot prompt, guardian command, and
 * ollama generation) always threw "No bridge token — handshake
 * pending" since bridge is gone and the handshake could never succeed.
 *
 * Real, not mocked at the dispatch layer: real HTTP servers stand in
 * for copilot/guardian/ollama, a real CoPilotBridge instance dispatches
 * against them, using apiSettings' own real *DirectUrl() shape.
 */
const assert = require('assert');
const http = require('http');
const CoPilotBridge = require('../clear-glass/src/copilot/bridge.js');

function mockServer(port, handler) {
  const server = http.createServer(handler);
  return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve(server)));
}
function closeServer(server) {
  return new Promise(resolve => server.close(() => setTimeout(resolve, 50)));
}

function fakeSettings(ports) {
  return {
    get: () => ({ copilotPort: ports.copilot }),
    copilotDirectUrl: (p) => `http://127.0.0.1:${ports.copilot}${p}`,
    guardianDirectUrl: (p) => `http://127.0.0.1:${ports.guardian}${p}`,
    ollamaDirectUrl: (p) => `http://127.0.0.1:${ports.ollama}${p}`,
  };
}

let passed = 0, failed = 0;
async function test(desc, fn) {
  try { await fn(); console.log(`  ✓ ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${desc}\n    ${e.stack}`); failed++; }
}

async function main() {
  const PORTS = { copilot: 19750, guardian: 19820, ollama: 19434 };

  await test('_bridgeDispatch calls copilot\'s real /api/prompt directly, no bridge involved', async () => {
    let received = null;
    const copilot = await mockServer(PORTS.copilot, (req, res) => {
      let body = ''; req.on('data', c => body += c);
      req.on('end', () => {
        received = { path: req.url, body: JSON.parse(body) };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ result: { response: { text: 'real answer' } } }));
      });
    });
    const bridge = new CoPilotBridge({ sse: { emit() {} }, apiSettings: fakeSettings(PORTS) });
    const result = await bridge._bridgeDispatch('copilot', 'copilot.prompt', { prompt: 'hi' }, 2000);
    assert.strictEqual(received.path, '/api/prompt');
    assert.strictEqual(received.body.prompt, 'hi');
    assert.strictEqual(result.text, 'real answer');
    await closeServer(copilot);
  });

  await test('_bridgeDispatch calls guardian\'s real /command directly for guardian.command', async () => {
    let received = null;
    const guardian = await mockServer(PORTS.guardian, (req, res) => {
      let body = ''; req.on('data', c => body += c);
      req.on('end', () => {
        received = { path: req.url, body: JSON.parse(body) };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ result: { jobId: 'j1' } }));
      });
    });
    const bridge = new CoPilotBridge({ sse: { emit() {} }, apiSettings: fakeSettings(PORTS) });
    const result = await bridge._bridgeDispatch('guardian', 'guardian.command', { provider: 'chatgpt' }, 2000);
    assert.strictEqual(received.path, '/command');
    assert.strictEqual(result.jobId, 'j1');
    await closeServer(guardian);
  });

  await test('_bridgeDispatch calls guardian.fetch with the caller-supplied path directly, via GET', async () => {
    let received = null;
    const guardian = await mockServer(PORTS.guardian, (req, res) => {
      received = { method: req.method, path: req.url };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ providers: { chatgpt: 'connected' } }));
    });
    const bridge = new CoPilotBridge({ sse: { emit() {} }, apiSettings: fakeSettings(PORTS) });
    const result = await bridge._bridgeDispatch('guardian', 'guardian.fetch', { path: '/providers' }, 2000);
    assert.strictEqual(received.method, 'GET');
    assert.strictEqual(received.path, '/providers');
    assert.strictEqual(result.providers.chatgpt, 'connected');
    await closeServer(guardian);
  });

  await test('_bridgeDispatch calls ollama\'s real /api/generate directly', async () => {
    let received = null;
    const ollama = await mockServer(PORTS.ollama, (req, res) => {
      let body = ''; req.on('data', c => body += c);
      req.on('end', () => {
        received = { path: req.url, body: JSON.parse(body) };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ result: 'generated text' }));
      });
    });
    const bridge = new CoPilotBridge({ sse: { emit() {} }, apiSettings: fakeSettings(PORTS) });
    const result = await bridge._bridgeDispatch('ollama', 'ollama.generate', { model: 'llama3', prompt: 'hi' }, 2000);
    assert.strictEqual(received.path, '/api/generate');
    assert.strictEqual(result, 'generated text');
    await closeServer(ollama);
  });

  await test('the class no longer has a _bridgeHandshake method at all — not just unused, genuinely removed', () => {
    const bridge = new CoPilotBridge({ sse: { emit() {} }, apiSettings: fakeSettings(PORTS) });
    assert.strictEqual(typeof bridge._bridgeHandshake, 'undefined', '_bridgeHandshake must be genuinely removed, not left dormant');
    assert.strictEqual(typeof bridge._bridgeToken, 'undefined', 'no token state should exist either — nothing left to hold one');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}

main();
