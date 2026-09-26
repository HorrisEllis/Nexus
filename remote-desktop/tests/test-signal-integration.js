'use strict';
// tests/test-signal-integration.js — spins up signal.js for real, connects
// a host and two viewers (one with a bad token, one with the real one),
// and checks the gate actually gates.

const { spawn } = require('child_process');
// §0.39.261 — Node's own WebSocket client (global since Node 22) instead of the
// ws package; wrapped to the .on('open'|'message'|'error') shape this test uses.
function WebSocket(url) {
  const sock = new globalThis.WebSocket(url);
  const on = (ev, fn) => sock.addEventListener(ev, ev === 'message' ? (e) => fn(typeof e.data === 'string' ? e.data : Buffer.from(e.data)) : fn);
  return { on, send: (d) => sock.send(d), close: () => sock.close(), get readyState() { return sock.readyState; } };
}
const path = require('path');

const PORT = 8099;
const DATA_DIR = path.join(__dirname, '.test-data-integration');

function log(ok, label) {
  console.log(`  ${ok ? '\x1b[92m✓\x1b[0m' : '\x1b[91m✗\x1b[0m'}  ${label}`);
  if (!ok) process.exitCode = 1;
}

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

function connectAndCollect(url) {
  const ws = new WebSocket(url);
  const messages = [];
  ws.on('message', (raw) => { try { messages.push(JSON.parse(raw)); } catch {} });
  return new Promise((resolve, reject) => {
    ws.on('open', () => resolve({ ws, messages }));
    ws.on('error', reject);
  });
}

async function main() {
  const server = spawn('node', ['signal.js'], {
    cwd: __dirname + '/..',
    env: { ...process.env, SIGNAL_PORT: PORT, NEXUS_DATA_DIR: DATA_DIR },
  });
  server.stdout.on('data', (d) => process.stdout.write(`  [server] ${d}`));
  server.stderr.on('data', (d) => process.stderr.write(`  [server:err] ${d}`));
  await wait(1200); // let it boot the session authority + bind the port

  const sessionId = 'itest-session';

  // host joins, should get a token
  const { ws: hostWs, messages: hostMsgs } = await connectAndCollect(`ws://localhost:${PORT}`);
  hostWs.send(JSON.stringify({ type: 'join', sessionId, role: 'host' }));
  await wait(300);
  const tokenMsg = hostMsgs.find((m) => m.type === 'token:issued');
  log(!!tokenMsg?.token, 'host join receives a token');

  // viewer with a bad token should be rejected
  const { ws: badViewerWs, messages: badMsgs } = await connectAndCollect(`ws://localhost:${PORT}`);
  badViewerWs.send(JSON.stringify({ type: 'join', sessionId, role: 'viewer', token: 'not-a-real-token' }));
  await wait(300);
  log(badMsgs.some((m) => m.type === 'join:rejected'), 'viewer with bad token is rejected');

  // viewer with the real token should be accepted
  const { ws: viewerWs, messages: viewerMsgs } = await connectAndCollect(`ws://localhost:${PORT}`);
  viewerWs.send(JSON.stringify({ type: 'join', sessionId, role: 'viewer', token: tokenMsg.token }));
  await wait(300);
  log(viewerMsgs.some((m) => m.type === 'join:accepted'), 'viewer with the real token is accepted');
  log(hostMsgs.some((m) => m.type === 'viewer:joined'), 'host is notified once a viewer actually joins (fixes the offer-before-viewer race)');

  // and a relay actually flows host -> viewer now that both are joined
  hostWs.send(JSON.stringify({ type: 'offer', sdp: { fake: 'offer' } }));
  await wait(300);
  log(viewerMsgs.some((m) => m.type === 'offer'), 'offer relays from host to the accepted viewer');

  // and the answer relays back the other direction, closing the loop
  // host.html/viewer.html now actually depend on
  viewerWs.send(JSON.stringify({ type: 'answer', sdp: { fake: 'answer' } }));
  await wait(300);
  log(hostMsgs.some((m) => m.type === 'answer'), 'answer relays from viewer back to host');

  hostWs.close(); badViewerWs.close(); viewerWs.close();
  server.kill();
  console.log(process.exitCode ? '\nFAILED' : '\nall passed');
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
