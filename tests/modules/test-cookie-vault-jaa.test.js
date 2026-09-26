'use strict';
/**
 * tests/modules/test-cookie-vault-jaa.test.js — v0.39.243
 * James: "use jaa for the database", then "yes jaa" for the cookie vault.
 * clear-glass/src/cookies/vault.js stores in a JaaStore at <vault>/jaa/. Every real
 * install ran the loose-file store before (better-sqlite3 absent), so the records
 * that exist on James's machine are files: they must come across, still encrypted,
 * and a deleted account must not come back from its old file.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
require(path.join(ROOT, 'lib', 'test-sandbox.js')).ensure();
const CookieVault = require(path.join(ROOT, 'clear-glass/src/cookies/vault.js'));
const { loadVaultKey, encryptWith } = require(path.join(ROOT, 'clear-glass/src/security/vault-key.js'));

let passed = 0, failed = 0;
async function test(id, d, fn) { try { await fn(); console.log(`  ✓ ${id} ${d}`); passed++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${e.message}`); failed++; } }
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cv-jaa-'));
const fakeSS = () => ({ isEncryptionAvailable: () => true, encryptString: (s) => Buffer.from('SS:' + s), decryptString: (b) => b.toString().slice(3) });
const SECRET = 'sk-ant-sid01-VERY-SECRET-VALUE';

(async () => {
  console.log('\n⬡  COOKIE VAULT ON JAA\n');

  await test('VJ-01', 'no better-sqlite3 anywhere in the vault; storage is guardian/jaa-store.js', () => {
    const src = fs.readFileSync(path.join(ROOT, 'clear-glass/src/cookies/vault.js'), 'utf8').replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '');
    assert.ok(!/better-sqlite3|this\.db\b|\.prepare\(/.test(src));
    assert.ok(/require\('\.\.\/\.\.\/\.\.\/guardian\/jaa-store\.js'\)/.test(src));
  });

  await test('VJ-02', 'writes land in <vault>/jaa as two JAA tables, encrypted — the cookie value is nowhere on disk in the clear', async () => {
    const dir = tmp();
    const v = new CookieVault({ dir, safeStorage: fakeSS() }); await v.init();
    await v.save({ agentId: 'claude', accountId: 'acc-1', domain: 'claude.ai', cookies: [{ name: 'sessionKey', value: SECRET, domain: '.claude.ai' }] });
    await v.snapshot('claude', { cookies: { get: async () => [{ name: 'sessionKey', value: SECRET }] } });
    assert.deepStrictEqual(fs.readdirSync(path.join(dir, 'jaa')).filter(f => f.endsWith('.json')).sort(), ['account_cookies.json', 'cookie_snapshots.json']);
    for (const f of fs.readdirSync(dir, { recursive: true })) {
      const p = path.join(dir, f); if (fs.statSync(p).isFile()) assert.ok(!fs.readFileSync(p, 'utf8').includes(SECRET), `${f} holds the cookie in the clear`);
    }
    assert.strictEqual(fs.readdirSync(dir).filter(f => /^account-|^claude-\d+\.json$/.test(f)).length, 0, 'no loose files written any more');
  });

  // The records that exist today: the old file store's own formats, written with the vault's own key.
  const dir = tmp();
  const key = loadVaultKey({ name: 'cookie-vault', legacyPassphrase: 'clear-glass-vault-key-v1', dir, safeStorage: fakeSS() });
  const acctFile = path.join(dir, 'account-repo-nexus-id-repo-0473b4ed-work-acc.json');   // agent id WITH dashes
  fs.writeFileSync(acctFile, JSON.stringify({ encrypted: encryptWith(key.key, JSON.stringify([{ name: 'sid', value: SECRET, domain: 'chatgpt.com' }])), domain: 'chatgpt.com', ts: 111, count: 1 }));
  for (const vnum of [1, 2]) fs.writeFileSync(path.join(dir, `claude-${vnum}.json`), JSON.stringify({ ...encryptWith(key.key, JSON.stringify([{ name: `s${vnum}` }])), ts: 100 + vnum, label: `snapshot-${vnum}` }));

  await test('VJ-03', 'existing file-store snapshots are imported on open, readable by version, and numbering continues (no overwrite)', async () => {
    const v = new CookieVault({ dir, safeStorage: fakeSS() }); await v.init();
    assert.strictEqual((await v._loadSnapshot('claude', 1))[0].name, 's1');
    assert.strictEqual((await v._loadSnapshot('claude', 2))[0].name, 's2');
    assert.strictEqual(v._nextVersion('claude'), 3);
    assert.deepStrictEqual(v.listSnapshots('claude').map(s => s.version), [2, 1]);
  });

  await test('VJ-04', 'an existing account file is imported on first read by exact name — even when the agent id has dashes', async () => {
    const v = new CookieVault({ dir, safeStorage: fakeSS() }); await v.init();
    const m = v.accountMeta('repo-nexus-id-repo-0473b4ed', 'work-acc');
    assert.ok(m.stored && m.count === 1 && m.updatedAt === 111, JSON.stringify(m));
    assert.strictEqual((await v._loadAccountCookies('repo-nexus-id-repo-0473b4ed', 'work-acc'))[0].value, SECRET);
    assert.ok(fs.existsSync(acctFile), 'the original file is left in place');
  });

  await test('VJ-05', 'importing twice (a restart) duplicates nothing', async () => {
    const v = new CookieVault({ dir, safeStorage: fakeSS() }); await v.init();
    v.accountMeta('repo-nexus-id-repo-0473b4ed', 'work-acc');
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'jaa', 'cookie_snapshots.json'), 'utf8')).length, 2);
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'jaa', 'account_cookies.json'), 'utf8')).length, 1);
  });

  await test('VJ-06', 'deleting an account also removes its old file, so it cannot come back on the next start', async () => {
    const v = new CookieVault({ dir, safeStorage: fakeSS() }); await v.init();
    assert.strictEqual(v.deleteAccountCookies('repo-nexus-id-repo-0473b4ed', 'work-acc').removed, 1);
    assert.ok(!fs.existsSync(acctFile));
    const v2 = new CookieVault({ dir, safeStorage: fakeSS() }); await v2.init();
    assert.strictEqual(v2.accountMeta('repo-nexus-id-repo-0473b4ed', 'work-acc').stored, false);
  });

  await test('VJ-07', 'saving the same account+domain again replaces it (one row), and the newest save is what restores', async () => {
    const d = tmp(); const v = new CookieVault({ dir: d, safeStorage: fakeSS() }); await v.init();
    await v.save({ agentId: 'gemini', accountId: 'a', domain: 'gemini.google.com', cookies: [{ name: 'old' }] });
    await v.save({ agentId: 'gemini', accountId: 'a', domain: 'gemini.google.com', cookies: [{ name: 'new' }] });
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(d, 'jaa', 'account_cookies.json'), 'utf8')).length, 1);
    assert.strictEqual((await v._loadAccountCookies('gemini', 'a'))[0].name, 'new');
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
