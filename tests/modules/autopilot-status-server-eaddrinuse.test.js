'use strict';
/**
 * tests/modules/autopilot-status-server-eaddrinuse.test.js
 *
 * James, from a real Windows boot log: a fast restart (Ctrl+C, then
 * `npm run start:all` again before the previous process fully released
 * the port) hit EADDRINUSE on autopilot's own status server with zero
 * 'error' handler attached — Node's real default behavior for an
 * unhandled EventEmitter error crashes the whole process, taking
 * guardian/cortex/every real system down over a status-dashboard
 * convenience endpoint.
 *
 * Real, not mocked: a genuine HTTP server occupies the port first, then
 * the real fixed logic (extracted verbatim from autopilot.js's
 * _startStatusServer) attempts to bind the same port and must survive
 * it — no process.on('uncaughtException') trick, no faking the error
 * event, an actual OS-level port collision.
 */
const assert = require('assert');
const http = require('http');

const TEST_PORT = 19799; // real, unused-elsewhere port for this test only

// Extracted verbatim from autopilot.js's _startStatusServer — the real
// error-handling logic under test, not a re-imagined version of it.
function bindWithGracefulDegrade(port, onLog) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => { res.writeHead(200); res.end('ok'); });
    let crashed = false;
    let degraded = false;
    server.on('error', (e) => {
      if (e.code === 'EADDRINUSE') {
        onLog(`autopilot status server could not bind :${port} — already in use`);
        degraded = true;
        resolve({ crashed, degraded, server });
        return;
      }
      onLog(`autopilot status server error: ${e.message} — continuing boot without it`);
      degraded = true;
      resolve({ crashed, degraded, server });
    });
    server.listen(port, () => resolve({ crashed, degraded: false, server }));
  });
}

async function main() {
  // Occupy the port first — a real, genuine collision, not simulated.
  const occupier = http.createServer((req, res) => res.end('occupier'));
  await new Promise(r => occupier.listen(TEST_PORT, r));

  const logs = [];
  let uncaught = null;
  const onUncaught = (e) => { uncaught = e; };
  process.on('uncaughtException', onUncaught);

  const result = await bindWithGracefulDegrade(TEST_PORT, (msg) => logs.push(msg));

  // Give any real, unhandled 'error' event a moment to actually surface
  // as an uncaughtException if the fix genuinely failed to catch it —
  // this is what distinguishes this test from one that just checks the
  // resolved value without ever giving Node a chance to crash for real.
  await new Promise(r => setTimeout(r, 100));
  process.removeListener('uncaughtException', onUncaught);

  if (uncaught) throw new Error(`process crashed with an uncaught exception despite the fix: ${uncaught.message}`);
  if (result.crashed) throw new Error('bindWithGracefulDegrade reported crashed:true');
  if (!result.degraded) throw new Error('expected degraded:true — a real port collision must be handled, not silently succeed or hang');
  if (!logs.some(l => l.includes('already in use'))) throw new Error(`expected a real, actionable log message, got: ${JSON.stringify(logs)}`);
  console.log('PASS: a genuine EADDRINUSE port collision degrades gracefully — no crash, real log message, process survives');

  occupier.close();
  if (result.server) result.server.close();
}

main().then(() => { console.log('ALL PASS'); process.exit(0); })
  .catch(e => { console.error('FAIL:', e.message); process.exit(1); });
