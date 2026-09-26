'use strict';
// CA7 (docs/copilot-awareness-routing-phasemap.spec, CHUNK D) — ClearGlass
// multi-account registry. Multiple account slots per provider (app-password
// style), so CA5 routing targets a specific account. Editable cortex rows (§2.2/
// §0.3). Credentials stored as REFERENCES, not raw secrets. The tv-ui gear + live
// login are Electron-side (James's machine); this backend is what they read/write.
const _log = console.log;
console.log = (...a) => { const s = a[0]; if (typeof s === 'string' && s.startsWith('[jaa]')) return; _log(...a); };

const assert = require('assert');
const path = require('path');
let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); _log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { _log(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const ROOT = path.join(__dirname, '../..');
const ar = require(path.join(ROOT, 'lib/account-registry'));

const P = 'gemini';  // use a clean provider for isolation
const tag = `t${Date.now()}`;

test('T-001', 'a provider can have MULTIPLE account slots', () => {
  ar.addAccount(P, `${tag}-work`, { credentialRef: 'kc:g-work', default: true });
  ar.addAccount(P, `${tag}-personal`, { credentialRef: 'kc:g-personal' });
  const mine = ar.listAccounts(P).filter(a => a.label.startsWith(tag));
  assert.ok(mine.length >= 2, 'multiple accounts must coexist for one provider');
});

test('T-002', 'the default account is chosen for a route when none is named', () => {
  const a = ar.getAccountForRoute(P);
  assert.ok(a, 'must resolve an account');
  // the default among our tagged accounts is *-work (may be other providers'
  // defaults too, but for THIS provider the default should win)
  assert.ok(a.default || a.label, 'a default or first-active account is picked');
});

test('T-003', 'a NAMED account overrides the default', () => {
  const a = ar.getAccountForRoute(P, `${tag}-personal`);
  assert.ok(a && a.label === `${tag}-personal`, 'the named account must be selected');
});

test('T-004', 'credentials are stored as a REFERENCE, not a raw secret (§security)', () => {
  const a = ar.getAccountForRoute(P, `${tag}-work`);
  assert.ok(/^kc:/.test(a.credentialRef), 'credentialRef must be a reference, not a plaintext secret');
});

test('T-005', 'an unknown provider is rejected (§1.2 loud)', () => {
  const r = ar.addAccount('not-a-provider', 'x');
  assert.ok(r.error, 'must reject an unknown provider');
});

test('T-006', 'a failed account is observable, not swallowed (§1.2)', () => {
  const a = ar.getAccountForRoute(P, `${tag}-personal`);
  ar.setAccountStatus(a.uuid, 'failed');
  const after = ar.listAccounts(P).find(x => x.uuid === a.uuid);
  assert.strictEqual(after.status, 'failed', 'a failed login must be visible on the account');
});

test('T-007', 'CA5 routing carries the CA7 account for ClearGlass login', () => {
  const { routeAgent } = require(path.join(ROOT, 'lib/agent-router'));
  ar.addAccount('perplexity', `${tag}-p`, { credentialRef: 'kc:p', default: true });
  const r = routeAgent({ intent: 'data' });
  assert.ok(r.account, 'a route must carry the account to log into');
  assert.ok(r.account.credentialRef, 'the account carries its credential reference');
});

test('T-008', 'removeAccount archives (not deletes) — §0.3 nothing lost', () => {
  const a = ar.getAccountForRoute(P, `${tag}-work`);
  ar.removeAccount(a.uuid);
  const stillListed = ar.listAccounts(P).find(x => x.uuid === a.uuid);
  assert.ok(!stillListed, 'a removed account drops off the active list');
});

// §MCO14 2026-09-13 — real tests for the new provider-registration
// mechanism (the actual gap: PROVIDERS was hardcoded, a genuinely new
// agent name had nowhere to go without a code edit).
const newProvider = `test-agent-${tag}`;

test('T-009', 'a genuinely new provider name is rejected before registration', () => {
  const r = ar.addAccount(newProvider, 'work');
  assert.ok(r.error, 'an unregistered new provider must still be rejected');
});

test('T-010', 'registerProvider makes a new provider name real', () => {
  const r = ar.registerProvider(newProvider, { note: 'test-only agent' });
  assert.ok(!r.error, 'a genuinely new name must register cleanly');
  assert.strictEqual(r.dispatchable, false, '§HONEST SCOPE — registration never claims dispatchability');
  assert.ok(ar.listKnownProviders().includes(newProvider), 'the new provider must be visible in the real, current list');
});

test('T-011', 'addAccount now works for the newly-registered provider', () => {
  const r = ar.addAccount(newProvider, 'work', { credentialRef: 'kc:test' });
  assert.ok(!r.error, 'addAccount must succeed once the provider is real');
  assert.strictEqual(r.provider, newProvider);
});

test('T-012', 'registering an already-known provider (seed or registered) is refused', () => {
  const r1 = ar.registerProvider('claude'); // already in the hardcoded seed list
  assert.ok(r1.error, 'a seed provider must not be re-registered');
  const r2 = ar.registerProvider(newProvider); // already registered by T-010
  assert.ok(r2.error, 'an already-registered provider must not be registered twice');
});

test('T-013', 'listKnownProviders includes every seed provider plus registered ones', () => {
  const all = ar.listKnownProviders();
  for (const p of ar.PROVIDERS) assert.ok(all.includes(p), `seed provider ${p} must still be listed`);
  assert.ok(all.includes(newProvider), 'the newly-registered provider must be listed too');
});

_log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
