'use strict';
// Real test for spawnProviderTab() (guardian/clear-glass-bridge.js) —
// James: "adding agent on canvas opens tab in clear glass." Two real
// mock HTTP servers, since the function genuinely calls both: autopilot's
// spawn-gate (AUTOPILOT_STATUS_PORT, default 7799) via _ensureClearGlassUp,
// then Clear Glass's real POST /providers/:id/start (CLEARGL_IPC_PORT,
// default 7702). Not mocking spawnProviderTab's own internals — only the
// two external services it talks to, same boundary chunk-dispatch.js's
// own tests use for guardian.
//
// Run: node tests/spawn-provider-tab.test.js

const http = require('http');

const AUTOPILOT_PORT = 19799;
const CG_IPC_PORT     = 19702;
process.env.AUTOPILOT_STATUS_PORT = String(AUTOPILOT_PORT);
process.env.CLEARGL_IPC_PORT      = String(CG_IPC_PORT);

const { spawnProviderTab } = require('../guardian/clear-glass-bridge.js');

function mockServer(port, handler) {
  const server = http.createServer(handler);
  return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve(server)));
}
function closeServer(server) {
  return new Promise(resolve => server.close(() => setTimeout(resolve, 50)));
}

async function main() {
  // ── autopilot: always says Clear Glass is up ─────────────────────────
  const autopilot = await mockServer(AUTOPILOT_PORT, (req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });

  // ── clear-glass: records the real request it received, responds like
  // the real ph.start() call would ─────────────────────────────────────
  let received = null;
  const clearGlass = await mockServer(CG_IPC_PORT, (req, res) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      received = { method: req.method, url: req.url, body: JSON.parse(body || '{}') };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ providerId: 'claude', tabId: 'tab-real-123', show: true }));
    });
  });

  const result = await spawnProviderTab('claude');

  if (!received) throw new Error('Clear Glass mock never received a request — spawnProviderTab did not call out');
  if (received.method !== 'POST') throw new Error(`expected POST, got ${received.method}`);
  if (received.url !== '/providers/claude/start') throw new Error(`expected /providers/claude/start, got ${received.url}`);
  if (received.body.show !== true) throw new Error(`expected show:true in the real request body (default), got ${JSON.stringify(received.body)}`);
  console.log('PASS: real POST /providers/claude/start with show:true');

  if (!result.ok) throw new Error(`expected ok:true, got ${JSON.stringify(result)}`);
  if (result.provider.tabId !== 'tab-real-123') throw new Error(`expected the real response passed through, got ${JSON.stringify(result)}`);
  console.log('PASS: real Clear Glass response passed through to the caller');

  // ── failure path — Clear Glass reachable but reports a real error ────
  await closeServer(clearGlass);
  const clearGlassErr = await mockServer(CG_IPC_PORT, (req, res) => {
    req.on('data', () => {});
    req.on('end', () => { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'provider claude already running' })); });
  });
  const errResult = await spawnProviderTab('claude');
  if (errResult.ok) throw new Error('expected ok:false on a real 500 from Clear Glass');
  if (!errResult.error.includes('already running')) throw new Error(`expected the real Clear Glass error message passed through, got: ${errResult.error}`);
  console.log('PASS: real Clear Glass error passed through, not swallowed');

  // ── §FIXED 2026-09-06 — clear-glass promoted from on-demand to a real,
  // always-running kernel (autopilot.js). requestSpawn() now honestly
  // answers with ok:false + "already always-on" for a spawn request on a
  // kernel that was never on-demand in the first place — real, correct
  // from requestSpawn's own point of view, but this caller must not treat
  // it as a genuine failure and block the dispatch on what is actually
  // good news (clear-glass is supposed to already be up).
  await closeServer(clearGlassErr);
  await closeServer(autopilot);
  const autopilotAlwaysOn = await mockServer(AUTOPILOT_PORT, (req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: "clear-glass is not an on-demand kernel — it's already always-on" }));
  });
  let receivedAfterAlwaysOn = null;
  const clearGlassAfterAlwaysOn = await mockServer(CG_IPC_PORT, (req, res) => {
    let body = ''; req.on('data', c => body += c);
    req.on('end', () => {
      receivedAfterAlwaysOn = true;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ providerId: 'chatgpt', tabId: 'tab-real-456', show: true }));
    });
  });
  const alwaysOnResult = await spawnProviderTab('chatgpt');
  if (!receivedAfterAlwaysOn) throw new Error('spawnProviderTab blocked the real dispatch on an "already always-on" spawn response instead of proceeding');
  if (!alwaysOnResult.ok) throw new Error(`expected ok:true (the always-on response is good news, not a failure), got ${JSON.stringify(alwaysOnResult)}`);
  console.log('PASS: an "already always-on" spawn response is treated as success, not a blocking failure — the dispatch still reaches Clear Glass');

  await closeServer(autopilotAlwaysOn);
  await closeServer(clearGlassAfterAlwaysOn);
}

main().then(() => { console.log('ALL PASS'); process.exit(0); }).catch(e => { console.error('FAIL:', e.message); process.exit(1); });
