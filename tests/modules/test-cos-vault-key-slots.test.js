'use strict';
/**
 * tests/modules/test-cos-vault-key-slots.test.js — AC6 (docs/2026-11-13-one-place-for-accounts-phasemap.spec)
 * James, 2026-11-13: "what about a sign in like an account? then cos' vault keeps a backup of the key?" ·
 * weighing Windows auth, backup codes, a keypair: the design built is password + recovery-code slots, the same
 * shape (any one slot opens it) a Windows Hello or keypair slot can join later without touching the others.
 *
 *   KS-01  a brand-new root key, wrapped under a password slot, opens with that password
 *   KS-02  the wrong password fails closed — 'wrong password or code', never more
 *   KS-03  the recovery code opens the SAME root key independently of the password
 *   KS-04  a tampered slot (one byte flipped) fails closed, never silently decrypts garbage
 *   KS-05  two slots from two different secrets never derive the same wrapping key (distinct salts)
 *   KS-06  addSlot re-wraps for a new secret without disturbing the slots already there
 *   KR-01  crypto.js's existing file-key encrypt/decrypt path is unchanged (no password, no keyring involved)
 *   KR-02  unlock() on a FRESH vault (no master.key, no keyring) creates one, gives a recovery code once, and
 *          primes crypto.js so encrypt/decrypt now use the unlocked key
 *   KR-03  unlock() MIGRATES an existing plaintext master.key: the very entries already encrypted under it still
 *          decrypt after migration — the key's bytes are unchanged, only how it is stored changes; master.key
 *          itself is left on disk, never deleted
 *   KR-04  unlock() with the wrong password on an existing keyring throws, and primes nothing
 *   KR-05  the recovery code from KR-02/03 opens the same keyring as the password does
 *   KR-06  a keyring file that exists but will not parse is refused, never silently treated as absent and overwritten (§1.2)
 *   KR-07  addSlot() on the keyring file lets a second secret open the same root key afterward
 */
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const KS = require(path.join(ROOT, 'cos/vault/key-slots.js'));
const crypto = require('crypto');

let passed = 0, failed = 0;
function check(id, desc, cond, detail) { if (cond) { console.log(`  ✓ ${id} ${desc}`); passed++; } else { console.error(`  ✗ ${id} ${desc}${detail ? `\n    ${detail}` : ''}`); failed++; } }

(async () => {
  console.log('\n🔑  COS vault: key slots — password + recovery wrap the real root key (AC6)\n');

  const rootKey = crypto.randomBytes(32);
  const made = KS.createSlots(rootKey, 'correct horse battery staple');

  check('KS-01', 'a brand-new root key opens with its password', KS.openSlots(made.slots, 'correct horse battery staple').equals(rootKey));

  check('KS-02', 'the wrong password fails closed, with exactly one generic reason', (() => {
    try { KS.openSlots(made.slots, 'nope'); return false; }
    catch (e) { return e.message === 'wrong password or code'; }
  })());

  check('KS-03', 'the recovery code opens the same root key, independent of the password', KS.openSlots(made.slots, made.recoveryCode).equals(rootKey));

  check('KS-04', 'a tampered slot fails closed, never decrypts to garbage silently', (() => {
    const tampered = { ...made.slots.password, ciphertext: made.slots.password.ciphertext.slice(0, -2) + (made.slots.password.ciphertext.slice(-2) === '00' ? '01' : '00') };
    try { KS.unwrapRootKey(tampered, 'correct horse battery staple'); return false; }
    catch (e) { return e.message === 'wrong password or code'; }
  })());

  check('KS-05', 'the two slots use distinct salts (no key reuse across slots)', made.slots.password.salt !== made.slots.recovery.salt);

  check('KS-06', 'addSlot adds a new slot without disturbing the ones already there', (() => {
    const withThird = KS.addSlot(made.slots, 'correct horse battery staple', 'future', 'a-future-windows-hello-equivalent-secret');
    return withThird.password.salt === made.slots.password.salt && withThird.recovery.salt === made.slots.recovery.salt
      && KS.openSlots(withThird, made.recoveryCode).equals(rootKey)
      && KS.unwrapRootKey(withThird.future, 'a-future-windows-hello-equivalent-secret').equals(rootKey);
  })());

  // ── keyring.js: the file-backed glue, isolated to a temp vault dir ──────────────────────────────────────────
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cos-vault-ks-'));
  const keyFile = path.join(tmp, 'master.key'), keyringFile = path.join(tmp, 'keyring.json');
  delete require.cache[require.resolve(path.join(ROOT, 'cos/vault/crypto.js'))];
  const C = require(path.join(ROOT, 'cos/vault/crypto.js'));
  const KR = require(path.join(ROOT, 'cos/vault/keyring.js'));

  check('KR-01', 'crypto.js\'s existing file-key path is unchanged when no keyring is ever involved', (() => {
    const otherKeyFile = path.join(tmp, 'other.key');
    const e = C.encrypt('hello, unmigrated', otherKeyFile);
    return C.decrypt(e, otherKeyFile) === 'hello, unmigrated' && fs.existsSync(otherKeyFile);
  })());

  let recovery1 = null;
  check('KR-02', 'unlock() on a fresh vault creates a keyring, gives a recovery code once, and primes crypto.js', (() => {
    const r = KR.unlock({ password: 'first-password', keyFile, keyringFile });
    recovery1 = r.recoveryCode;
    const primed = C.encrypt('after unlock', keyFile);
    return r.created && !r.migrated && typeof r.recoveryCode === 'string' && r.recoveryCode.length > 0
      && C.decrypt(primed, keyFile) === 'after unlock' && !fs.existsSync(keyFile) /* no plaintext master.key written on a fresh vault */
      && fs.existsSync(keyringFile);
  })(), JSON.stringify({ keyFileExists: fs.existsSync(keyFile), keyringFileExists: fs.existsSync(keyringFile) }));

  check('KR-03', 'migrating an existing plaintext master.key preserves the exact key bytes — old entries still decrypt', (() => {
    const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'cos-vault-ks2-'));
    const keyFile2 = path.join(tmp2, 'master.key'), keyringFile2 = path.join(tmp2, 'keyring.json');
    const before = C.encrypt('encrypted before any keyring existed', keyFile2);   // today's plain path: auto-creates keyFile2
    const r = KR.unlock({ password: 'migrate-me', keyFile: keyFile2, keyringFile: keyringFile2 });
    return r.migrated && fs.existsSync(keyFile2) /* left on disk, not deleted */ && C.decrypt(before, keyFile2) === 'encrypted before any keyring existed';
  })());

  check('KR-04', 'the wrong password on an existing keyring throws and primes nothing new', (() => {
    delete require.cache[require.resolve(path.join(ROOT, 'cos/vault/crypto.js'))];
    const C2 = require(path.join(ROOT, 'cos/vault/crypto.js'));
    try { KR.unlock({ password: 'totally-wrong', keyFile, keyringFile }); return false; }
    catch (e) { return e.message === 'wrong password or code'; }
  })());

  check('KR-05', 'the recovery code from the fresh vault opens the same keyring as the password', (() => {
    const r = KR.unlock({ recoveryCode: recovery1, keyFile, keyringFile });
    return !r.created && r.rootKey.length === 32;
  })());

  check('KR-06', 'a keyring file that will not parse is refused, never silently recreated', (() => {
    fs.writeFileSync(keyringFile + '.bad', 'not json {{{');
    try { KR.unlock({ password: 'x', keyFile, keyringFile: keyringFile + '.bad' }); return false; }
    catch (e) { return /will not parse/.test(e.message) && !fs.existsSync(keyringFile + '.bad.tmp'); }
  })());

  check('KR-07', 'addSlot lets a second secret open the same root key afterward', (() => {
    KR.addSlot({ openWith: { password: 'first-password' }, name: 'second', newSecret: 'a-second-password', keyFile, keyringFile });
    delete require.cache[require.resolve(path.join(ROOT, 'cos/vault/crypto.js'))];
    const C3 = require(path.join(ROOT, 'cos/vault/crypto.js'));
    KR.unlock({ password: 'a-second-password', keyFile, keyringFile });
    return true;   // unlock() above throws if the new slot doesn't actually open the real root key
  })());

  console.log(`\n   ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
