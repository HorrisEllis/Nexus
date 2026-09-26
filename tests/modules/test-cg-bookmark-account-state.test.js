'use strict';
/**
 * tests/modules/test-cg-bookmark-account-state.test.js — §0.39.265
 *
 * James: "the bookmark system is supposed to be hooked in to the system
 * state/rewind engine and account. Like a bookmark with a check mark to attach
 * to the account … different accounts in each tab."
 *
 *   - IpcBridge._bookmarkAddWithState: a rewind snapshot is taken and linked;
 *     the account the ★ dialog names wins over the agent's default (null =
 *     none); a caller naming no account still gets the default.
 *   - _bookmarkOpenWithState restores through rewind, and reports a failed
 *     restore instead of pretending.
 *   - bookmarks:linkState is exposed end to end (bridge + preload).
 *   - main: an account window (acct-<id>) is signed in with every provider
 *     session saved for that account.
 *   - renderer: ★ opens the dialog; bookmarks with an account open in that
 *     account's window; the Library can attach an account.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passed = 0, failed = 0;
async function test(desc, fn) {
  try { await fn(); console.log(`  ✓ ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${desc}\n    ${e.message}`); failed++; }
}

const CG = path.join(__dirname, '../../clear-glass');
const IpcBridge = require(path.join(CG, 'src/ipc/bridge.js'));
const read = (rel) => fs.readFileSync(path.join(CG, rel), 'utf8');

// A bookmark store with the real add/linkState semantics, in memory.
function fakeBookmarks() {
  const data = [];
  return {
    data,
    add({ url, title, agentId = 'default' }) {
      const ex = data.find(b => b.url === url && b.agentId === agentId);
      if (ex) return { bookmark: ex, added: false };
      const bookmark = { id: `bk${data.length + 1}`, url, title, agentId, snapshotId: null, accountId: null };
      data.push(bookmark); return { bookmark, added: true };
    },
    linkState({ id, snapshotId, accountId }) {
      const bk = data.find(b => b.id === id);
      if (snapshotId !== undefined) bk.snapshotId = snapshotId;
      if (accountId !== undefined) bk.accountId = accountId;
      return { bookmark: bk };
    },
    list({ agentId } = {}) { return data.filter(b => !agentId || b.agentId === agentId); },
    recordVisit() {},
  };
}
function ctx({ snap = { id: 'snap-1' }, restore } = {}) {
  const calls = [];
  return {
    calls,
    bookmarks: fakeBookmarks(),
    rewind: {
      snapshot: async (agentId, o) => { calls.push(['snapshot', agentId, o.label]); return snap; },
      restore: restore || (async (o) => { calls.push(['restore', o]); return { ok: true }; }),
    },
    options: { resolveDefaultAccountForAgent: () => 'default-acct' },
  };
}

(async () => {
  console.log('\n  bookmarks ↔ account ↔ rewind');

  await test('the ★ dialog\'s account wins; null means no account; silence means the default', async () => {
    const c = ctx();
    const a = await IpcBridge.prototype._bookmarkAddWithState.call(c, { url: 'https://a.com', title: 'A', agentId: 'default', accountId: 'acct-9' });
    assert.strictEqual(a.bookmark.accountId, 'acct-9');
    assert.strictEqual(a.bookmark.snapshotId, 'snap-1');
    assert.deepStrictEqual(c.calls[0], ['snapshot', 'default', `cg-bookmark:${a.bookmark.id}`]);
    const b = await IpcBridge.prototype._bookmarkAddWithState.call(c, { url: 'https://b.com', title: 'B', agentId: 'default', accountId: null });
    assert.strictEqual(b.bookmark.accountId, null);
    const d = await IpcBridge.prototype._bookmarkAddWithState.call(c, { url: 'https://d.com', title: 'D', agentId: 'default' });
    assert.strictEqual(d.bookmark.accountId, 'default-acct');
  });

  await test('a page rewind will not capture still saves the bookmark and says why state is missing', async () => {
    const c = ctx({ snap: null });
    const r = await IpcBridge.prototype._bookmarkAddWithState.call(c, { url: 'https://a.com', agentId: 'default', accountId: 'x' });
    assert.ok(r.bookmark && r.added);
    assert.match(r.stateError, /no snapshot/);
    assert.strictEqual(r.bookmark.snapshotId, null);
  });

  await test('opening restores through rewind; a failed restore is reported, not hidden', async () => {
    const c = ctx();
    const { bookmark } = await IpcBridge.prototype._bookmarkAddWithState.call(c, { url: 'https://a.com', agentId: 'acct-1', accountId: '1' });
    const ok = await IpcBridge.prototype._bookmarkOpenWithState.call(c, { id: bookmark.id, agentId: 'acct-1' });
    assert.strictEqual(ok.restored, true);
    assert.deepStrictEqual(c.calls.find(x => x[0] === 'restore')[1], { agentId: 'acct-1', snapshotId: 'snap-1' });
    c.rewind.restore = async () => { throw new Error('Snapshot not found: snap-1'); };
    const bad = await IpcBridge.prototype._bookmarkOpenWithState.call(c, { id: bookmark.id, agentId: 'acct-1' });
    assert.strictEqual(bad.restored, false);
    assert.match(bad.restoreError, /Snapshot not found/);
  });

  await test('bookmarks:linkState, addWithState and openWithState reach the renderer', () => {
    const br = read('src/ipc/bridge.js'), pre = read('src/preload/index.js');
    for (const ch of ['bookmarks:linkState', 'bookmarks:addWithState', 'bookmarks:openWithState']) {
      assert.ok(br.includes(`ipcMain.handle('${ch}'`), `bridge handles ${ch}`);
      assert.ok(pre.includes(`ipcRenderer.invoke('${ch}'`), `preload exposes ${ch}`);
    }
  });

  await test('an account window (acct-<id>) is signed in with that account\'s saved provider sessions', () => {
    const main = read('src/main/index.js');
    assert.ok(/await _restoreAccountWindow\(agentId, partition\);/.test(main), 'openAgentWindow restores the account');
    const fn = main.slice(main.indexOf('async function _restoreAccountWindow'), main.indexOf('// ── Window management'));
    assert.ok(/for \(const provider of acc\.agentKeys/.test(fn));
    assert.ok(/cookieVault\.restore\(\{ agentId: provider, accountId, ses \}\)/.test(fn), 'the same vault records the mesh restores');
    assert.ok(/cookieVault = vault;/.test(main));
  });

  await test('renderer: ★ opens the dialog; account bookmarks open in the account\'s window; the Library attaches accounts', () => {
    const js = read('renderer/browser.js');
    assert.ok(/getElementById\('btn-bookmark'\)\.addEventListener\('click', \(\) => \{ openBookmarkDialog\(\)/.test(js));
    assert.ok(/cg\.window\.open\(\{ agentId: target, url: bk\.url \}\)/.test(js));
    assert.ok(/cg\.bookmarks\.linkState\(\{ id: bk\.id, accountId: chosen/.test(js));
    assert.ok(/Remember page state \(rewind\)/.test(js));
    const lib = read('renderer/library/sections/bookmarks.js');
    assert.ok(/cg\.bookmarks\.linkState\(\{ id: b\.id, accountId: sel\.value \|\| null \}\)/.test(lib));
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
