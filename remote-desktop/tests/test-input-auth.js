'use strict';
const { signFrame, verifyFrame, createReplayGuard } = require('../input-auth');

function log(ok, label) {
  console.log(`  ${ok ? '\x1b[92m✓\x1b[0m' : '\x1b[91m✗\x1b[0m'}  ${label}`);
  if (!ok) process.exitCode = 1;
}

async function main() {
  const TOKEN = 'test-token-abc123';
  const OTHER_TOKEN = 'a-different-token';

  const signed = await signFrame({ kind: 'click', x: 10, y: 20 }, TOKEN);
  log(!!signed.sig && !!signed.nonce, 'signFrame() produces a sig and a nonce');

  log(await verifyFrame(signed, TOKEN) === true, 'verifyFrame() accepts a correctly signed frame');
  log(await verifyFrame(signed, OTHER_TOKEN) === false, 'verifyFrame() rejects the wrong token');

  const tampered = { ...signed, x: 9999 };
  log(await verifyFrame(tampered, TOKEN) === false, 'verifyFrame() rejects a tampered field');

  log(await verifyFrame({ kind: 'click' }, TOKEN) === false, 'verifyFrame() rejects a frame with no sig/nonce (malformed)');
  log(await verifyFrame(null, TOKEN) === false, 'verifyFrame() rejects null without throwing');

  // replay guard
  const guard = createReplayGuard({ windowMs: 500 });
  const fresh = { ts: Date.now(), nonce: 'nonce-1' };
  log(guard.check(fresh) === true, 'replay guard accepts a fresh frame');
  log(guard.check(fresh) === false, 'replay guard rejects the same nonce replayed');

  const stale = { ts: Date.now() - 5000, nonce: 'nonce-2' };
  log(guard.check(stale) === false, 'replay guard rejects a stale timestamp outside the window');

  const malformed = { ts: 'not-a-number', nonce: 'nonce-3' };
  log(guard.check(malformed) === false, 'replay guard rejects a malformed frame without throwing');

  guard._stop();
  console.log(process.exitCode ? '\nFAILED' : '\nall passed');
}

main().catch((e) => { console.error(e); process.exit(1); });
