'use strict';
/**
 * tests/modules/test-clear-glass-rewind-vault.test.js — AC9 (docs/2026-11-13-one-place-for-accounts-phasemap.spec)
 * James, 2026-11-13: "use the rewind system to take backups" (answering it found the leak) · "just enough to get
 * it integrated."
 *
 *   RV-01  COS_VAULT_PASSWORD unset: a snapshot is written as plain JSON, exactly as before AC9
 *   RV-02  COS_VAULT_PASSWORD set: the same snapshot is written encrypted — no readable token/url in the raw file
 *   RV-03  an encrypted snapshot round-trips: loaded back in a fresh engine instance, the session data matches
 *   RV-04  an OLD plain-JSON snapshot (from before this existed) still loads, even with a password now set
 */
require('../../lib/test-sandbox.js').ensure();   // isolates COMPARTMENT OS's real data root (cos/vault included) from this test
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');

let passed = 0, failed = 0;
function check(id, desc, cond, detail) { if (cond) { console.log(`  ✓ ${id} ${desc}`); passed++; } else { console.error(`  ✗ ${id} ${desc}${detail ? `\n    ${detail}` : ''}`); failed++; } }

// REWIND_DIR is a module-level const computed from process.env.APPDATA the instant engine.js is required — so the
// isolating temp dir MUST be set before that require, or this test would read/write the real machine's rewind files.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-rewind-vault-'));
process.env.APPDATA = tmp;
const RewindEngine = require(path.join(ROOT, 'clear-glass/src/rewind/engine.js'));
const SNAP_DIR = path.join(tmp, '.clear-glass', 'rewind');

(async () => {
  console.log('\n⏪  Clear Glass rewind, through the vault when a password is set (AC9)\n');

  const mkEngine = () => { const e = new RewindEngine({ vault: null, driver: null, sse: { emit: () => {} }, busOn: () => {}, ctxMgr: null }); return e; };

  await new Promise(r => fs.mkdir(SNAP_DIR, { recursive: true }, r));

  check('RV-01', 'with no password set, a snapshot is written as plain, readable JSON', (() => {
    delete process.env.COS_VAULT_PASSWORD;
    const e = mkEngine();
    e._sessions.set('agentA', [{ url: 'https://example.com/plain-marker-unlocked-token-xyz', ts: 1 }]);
    e._persist('agentA');
    const raw = fs.readFileSync(path.join(SNAP_DIR, 'agentA.json'), 'utf8');
    return raw.includes('plain-marker-unlocked-token-xyz') && !JSON.parse(raw).encrypted;
  })());

  check('RV-02', 'with a password set, the same write is encrypted — the marker is not readable in the raw file', (() => {
    process.env.COS_VAULT_PASSWORD = 'rewind-test-password';
    const e = mkEngine();
    e._sessions.set('agentB', [{ url: 'https://example.com/secret-marker-should-not-leak-abc', ts: 2 }]);
    e._persist('agentB');
    const raw = fs.readFileSync(path.join(SNAP_DIR, 'agentB.json'), 'utf8');
    return !raw.includes('secret-marker-should-not-leak-abc') && JSON.parse(raw).encrypted === true;
  })());

  check('RV-03', 'an encrypted snapshot round-trips through a fresh engine instance', (() => {
    const e2 = mkEngine();
    e2._loadIfNeeded('agentB');
    const got = e2._sessions.get('agentB');
    return Array.isArray(got) && got[0] && got[0].url === 'https://example.com/secret-marker-should-not-leak-abc';
  })());

  check('RV-04', 'an old plain-JSON snapshot (written before this existed) still loads, even with a password now set', (() => {
    fs.writeFileSync(path.join(SNAP_DIR, 'agentC.json'), JSON.stringify([{ url: 'https://example.com/old-format', ts: 3 }]), 'utf8');
    const e3 = mkEngine();
    e3._loadIfNeeded('agentC');
    const got = e3._sessions.get('agentC');
    return Array.isArray(got) && got[0] && got[0].url === 'https://example.com/old-format';
  })());

  console.log(`\n   ${passed} passed, ${failed} failed`);
  delete process.env.COS_VAULT_PASSWORD;
  process.exit(failed ? 1 : 0);
})();
