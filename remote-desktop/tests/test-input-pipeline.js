'use strict';
// tests/test-input-pipeline.js — signFrame -> verifyFrame -> replayGuard ->
// injector.inject(), the same four calls in the same order as
// bridge-electron/main.js's 'inject-input' IPC handler. This is the part
// of that handler that's real Node logic and can run without Electron;
// the IPC plumbing around it is what's flagged not_verified in the spec.

const { signFrame, verifyFrame, createReplayGuard } = require('../input-auth');
const { createInputInjector } = require('../input-injector');

function log(ok, label) {
  console.log(`  ${ok ? '\x1b[92m✓\x1b[0m' : '\x1b[91m✗\x1b[0m'}  ${label}`);
  if (!ok) process.exitCode = 1;
}

async function main() {
  const TOKEN = 'session-token-for-pipeline-test';
  const applied = [];
  const backend = {
    name: 'test',
    async click(x, y) { applied.push({ kind: 'click', x, y }); },
    async mousemove() {},
    async keydown() {},
  };
  const injector = createInputInjector({ backend });
  const replayGuard = createReplayGuard({ windowMs: 5000 });

  // mirrors main.js's ipcMain.handle('inject-input', ...)
  async function handleInjectInput(signedFrame, token) {
    if (!token) return { ok: false, reason: 'no_active_session' };
    if (!(await verifyFrame(signedFrame, token))) return { ok: false, reason: 'bad_signature' };
    if (!replayGuard.check(signedFrame)) return { ok: false, reason: 'replay_or_stale' };
    return injector.inject(signedFrame);
  }

  // the honest path: viewer signs with the real token, host has the real token
  const legit = await signFrame({ kind: 'click', x: 50, y: 60 }, TOKEN);
  const r1 = await handleInjectInput(legit, TOKEN);
  log(r1.ok === true, 'a properly signed frame with the matching token is injected');
  log(applied.some((a) => a.x === 50 && a.y === 60), 'the click actually reaches the backend');

  // replaying the exact same frame again must fail even though the signature is still valid
  const r2 = await handleInjectInput(legit, TOKEN);
  log(r2.ok === false && r2.reason === 'replay_or_stale', 'replaying the same signed frame is rejected');

  // a MITM without the token can't forge a frame that verifies
  const forged = { kind: 'click', x: 999, y: 999, ts: Date.now(), nonce: 'forged-nonce', sig: 'deadbeef'.repeat(8) };
  const r3 = await handleInjectInput(forged, TOKEN);
  log(r3.ok === false && r3.reason === 'bad_signature', 'a forged/unsigned frame is rejected before it ever reaches the injector');

  // no active session yet (host hasn't captured a token) — must fail closed, not open
  const r4 = await handleInjectInput(legit, null);
  log(r4.ok === false && r4.reason === 'no_active_session', 'with no session token set yet, injection fails closed');

  console.log(process.exitCode ? '\nFAILED' : '\nall passed');
}

main().catch((e) => { console.error(e); process.exit(1); });
