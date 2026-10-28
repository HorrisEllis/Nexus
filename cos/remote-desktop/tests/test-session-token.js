'use strict';
// test-session-token.js — exercises session-token.js purely through its
// event bus, the way signal.js will. No reaching into its internal Map.

const path = require('path');
const { createSessionAuthority } = require('../session-token');

const DATA_DIR = path.join(__dirname, '.test-data');

function log(ok, label) {
  console.log(`  ${ok ? '\x1b[92m✓\x1b[0m' : '\x1b[91m✗\x1b[0m'}  ${label}`);
  if (!ok) process.exitCode = 1;
}

async function main() {
  const authority = createSessionAuthority({ dataDir: DATA_DIR });
  const seen = [];
  authority.on('*', (evt) => seen.push(evt));

  const identity = await authority.init();
  log(!!identity.uuid, 'init() resolves with an identity');
  log(seen.some(e => e.type === 'authority:ready'), 'authority:ready event fired');

  const sessionId = 'test-session-1';
  const record = authority.issueToken(sessionId);
  log(!!record.token && record.sessionId === sessionId, 'issueToken() returns a token record');
  log(seen.some(e => e.type === 'token:issued' && e.sessionId === sessionId), 'token:issued event fired');

  const okVerify = authority.verifyToken(record.token, sessionId);
  log(okVerify === true, 'verifyToken() accepts the real token');
  log(seen.some(e => e.type === 'token:verified'), 'token:verified event fired');

  const badSession = authority.verifyToken(record.token, 'wrong-session');
  log(badSession === false, 'verifyToken() rejects a session-id mismatch');
  log(seen.some(e => e.type === 'token:rejected' && e.reason === 'session_mismatch'), 'token:rejected(session_mismatch) event fired');

  const badToken = authority.verifyToken('not-a-real-token', sessionId);
  log(badToken === false, 'verifyToken() rejects an unknown token');
  log(seen.some(e => e.type === 'token:rejected' && e.reason === 'unknown'), 'token:rejected(unknown) event fired');

  const revoked = authority.revoke(record.token);
  log(revoked === true, 'revoke() succeeds on a live token');
  log(seen.some(e => e.type === 'token:revoked'), 'token:revoked event fired');

  const afterRevoke = authority.verifyToken(record.token, sessionId);
  log(afterRevoke === false, 'verifyToken() rejects a revoked token');

  authority._stop();
  console.log(process.exitCode ? '\nFAILED' : '\nall passed');
}

main().catch((e) => { console.error(e); process.exit(1); });
