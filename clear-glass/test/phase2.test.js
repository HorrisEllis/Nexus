'use strict';
/**
 * test/phase2.test.js — Phase 2 tests
 * Bookmarks, Rewind, Provider registry, new gate factories
 * Run: node test/phase2.test.js
 */

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (err) { failed++; console.log(`  ✗ ${name}: ${err.message}`); }
}
async function testAsync(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (err) { failed++; console.log(`  ✗ ${name}: ${err.message}`); }
}
function assert(c, m = 'fail') { if (!c) throw new Error(m); }
function assertEqual(a, b, m)  { if (a !== b) throw new Error(m || `${JSON.stringify(a)} !== ${JSON.stringify(b)}`); }

// ── Bookmark Store ──────────────────────────────────────────────────────────
console.log('\n[1] BookmarkStore');
{
  const BookmarkStore = require('../src/bookmarks/store');

  test('constructs with empty data', () => {
    const bk = new BookmarkStore();
    assertEqual(bk.data.length, 0);
  });

  test('add() creates a bookmark with required fields', () => {
    const bk = new BookmarkStore();
    const { bookmark, added } = bk.add({ url: 'https://example.com', title: 'Example', agentId: 'a1' });
    assert(added === true);
    assert(bookmark.id, 'missing id');
    assertEqual(bookmark.url, 'https://example.com');
    assertEqual(bookmark.title, 'Example');
    assertEqual(bookmark.agentId, 'a1');
    assertEqual(bookmark.visitCount, 0);
    assert(Array.isArray(bookmark.tags));
  });

  test('add() deduplicates by url + agentId', () => {
    const bk = new BookmarkStore();
    bk.add({ url: 'https://example.com', title: 'Example', agentId: 'a1' });
    const { added } = bk.add({ url: 'https://example.com', title: 'Example 2', agentId: 'a1' });
    assertEqual(added, false, 'should not add duplicate');
    assertEqual(bk.data.length, 1);
  });

  test('add() allows same url for different agents', () => {
    const bk = new BookmarkStore();
    bk.add({ url: 'https://example.com', title: 'A', agentId: 'a1' });
    const { added } = bk.add({ url: 'https://example.com', title: 'B', agentId: 'a2' });
    assertEqual(added, true);
    assertEqual(bk.data.length, 2);
  });

  test('remove() by id', () => {
    const bk = new BookmarkStore();
    const { bookmark } = bk.add({ url: 'https://example.com', title: 'X', agentId: 'a1' });
    bk.remove({ id: bookmark.id });
    assertEqual(bk.data.length, 0);
  });

  test('list() filters by agentId', () => {
    const bk = new BookmarkStore();
    bk.add({ url: 'https://a.com', title: 'A', agentId: 'a1' });
    bk.add({ url: 'https://b.com', title: 'B', agentId: 'a2' });
    const list = bk.list({ agentId: 'a1' });
    assertEqual(list.length, 1);
    assertEqual(list[0].agentId, 'a1');
  });

  test('list() filters by query (url and title)', () => {
    const bk = new BookmarkStore();
    bk.add({ url: 'https://claude.ai', title: 'Claude', agentId: 'default' });
    bk.add({ url: 'https://google.com', title: 'Google', agentId: 'default' });
    const results = bk.list({ query: 'claude' });
    assertEqual(results.length, 1);
    assertEqual(results[0].title, 'Claude');
  });

  test('recordVisit() increments visitCount', () => {
    const bk = new BookmarkStore();
    const { bookmark } = bk.add({ url: 'https://example.com', title: 'X', agentId: 'a1' });
    bk.recordVisit({ id: bookmark.id });
    bk.recordVisit({ id: bookmark.id });
    assertEqual(bk.data[0].visitCount, 2);
    assert(bk.data[0].lastVisited > 0);
  });

  test('isBookmarked() returns correct boolean', () => {
    const bk = new BookmarkStore();
    bk.add({ url: 'https://example.com', title: 'X', agentId: 'default' });
    assert(bk.isBookmarked({ url: 'https://example.com', agentId: 'default' }) === true);
    assert(bk.isBookmarked({ url: 'https://other.com',   agentId: 'default' }) === false);
  });

  test('tag() adds tags to bookmark', () => {
    const bk = new BookmarkStore();
    const { bookmark } = bk.add({ url: 'https://example.com', title: 'X', agentId: 'a1' });
    const updated = bk.tag({ id: bookmark.id, tags: ['work', 'nexus'] });
    assert(updated.tags.includes('work'));
    assert(updated.tags.includes('nexus'));
  });

  test('add() throws if url is missing', () => {
    const bk = new BookmarkStore();
    try { bk.add({ title: 'No URL', agentId: 'a1' }); assert(false, 'should throw'); }
    catch (err) { assert(err.message.includes('url required')); }
  });
}

// ── Rewind Engine ───────────────────────────────────────────────────────────
console.log('\n[2] RewindEngine');
{
  const RewindEngine = require('../src/rewind/engine');

  const mockDriver = {
    exec: async ({ action }) => {
      if (action === 'getUrl')   return { url: 'https://example.com/page' };
      if (action === 'getTitle') return { title: 'Example Page' };
      if (action === 'navigate') return { ok: true };
      if (action === 'eval')     return { result: 5 };
      return {};
    }
  };
  const mockSse    = { emit: () => {} };
  const mockVault  = { snapshot: async () => ({ version: 1 }) };

  testAsync('snapshot() creates an entry', async () => {
    const rw = new RewindEngine({ driver: mockDriver, sse: mockSse, vault: mockVault });
    const entry = await rw.snapshot('agent-1', { label: 'test' });
    assert(entry.id, 'missing id');
    assertEqual(entry.agentId, 'agent-1');
    assertEqual(entry.url, 'https://example.com/page');
    assertEqual(entry.label, 'test');
    assert(entry.ts > 0);
  });

  testAsync('list() returns snapshots most-recent first', async () => {
    const rw = new RewindEngine({ driver: mockDriver, sse: mockSse, vault: mockVault });
    await rw.snapshot('agent-2', { label: 'first' });
    mockDriver.exec = async ({ action }) => {
      if (action === 'getUrl')   return { url: 'https://example.com/page2' };
      if (action === 'getTitle') return { title: 'Page 2' };
      if (action === 'eval')     return { result: 3 };
      return {};
    };
    await rw.snapshot('agent-2', { label: 'second' });
    const list = rw.list('agent-2');
    assertEqual(list.length, 2);
    assertEqual(list[0].label, 'second'); // most recent first
  });

  testAsync('does not duplicate same URL consecutively', async () => {
    const sameDriver = {
      exec: async ({ action }) => {
        if (action === 'getUrl')   return { url: 'https://same.com' };
        if (action === 'getTitle') return { title: 'Same' };
        if (action === 'eval')     return { result: 1 };
        return {};
      }
    };
    const rw = new RewindEngine({ driver: sameDriver, sse: mockSse, vault: mockVault });
    await rw.snapshot('agent-3');
    await rw.snapshot('agent-3'); // same URL — should not add
    assertEqual(rw.list('agent-3').length, 1);
  });

  testAsync('clear() removes all snapshots for agent', async () => {
    const rw = new RewindEngine({ driver: mockDriver, sse: mockSse, vault: mockVault });
    await rw.snapshot('agent-4');
    rw.clear('agent-4');
    assertEqual(rw.list('agent-4').length, 0);
  });

  testAsync('restore() calls driver.navigate with snapshot url', async () => {
    const navigated = [];
    const d = {
      exec: async ({ action, url, agentId }) => {
        if (action === 'getUrl')   return { url: 'https://original.com' };
        if (action === 'getTitle') return { title: 'Original' };
        if (action === 'eval')     return { result: 1 };
        if (action === 'navigate') { navigated.push(url); return { ok: true }; }
        return {};
      }
    };
    const rw = new RewindEngine({ driver: d, sse: mockSse, vault: mockVault });
    await rw.snapshot('agent-5');
    await rw.restore({ agentId: 'agent-5', steps: 1 });
    assert(navigated.length > 0, 'navigate should be called');
    assertEqual(navigated[0], 'https://original.com');
  });
}

// ── Provider Registry ────────────────────────────────────────────────────────
console.log('\n[3] Provider Registry');
{
  const { NCP_PROVIDERS, getProvider, listProviders } = require('../src/providers/registry');

  test('NCP_PROVIDERS has claude, chatgpt, gemini, perplexity', () => {
    assert(NCP_PROVIDERS.claude,     'missing claude');
    assert(NCP_PROVIDERS.chatgpt,    'missing chatgpt');
    assert(NCP_PROVIDERS.gemini,     'missing gemini');
    assert(NCP_PROVIDERS.perplexity, 'missing perplexity');
  });

  test('each provider has required fields', () => {
    for (const p of Object.values(NCP_PROVIDERS)) {
      assert(p.id,             `${p.id} missing id`);
      assert(p.url,            `${p.id} missing url`);
      assert(p.userscriptFile, `${p.id} missing userscriptFile`);
      assert(Array.isArray(p.hosts), `${p.id} hosts should be array`);
    }
  });

  test('getProvider() returns correct provider', () => {
    const p = getProvider('claude');
    assertEqual(p.id, 'claude');
    assertEqual(p.url, 'https://claude.ai');
  });

  test('getProvider() throws for unknown id', () => {
    try { getProvider('unknown'); assert(false, 'should throw'); }
    catch (err) { assert(err.message.includes('Unknown NCP provider')); }
  });

  test('listProviders() returns array of all providers', () => {
    const list = listProviders();
    assert(Array.isArray(list));
    assert(list.length >= 4);
    assert(list.every(p => p.id && p.url));
  });
}

// ── New gate factories smoke test ────────────────────────────────────────────
console.log('\n[4] New gate factories');
{
  const { Stream, Event } = require('../siso/index');
  const {
    bookmarkAddGate, bookmarkListGate, bookmarkRemoveGate,
    rewindListGate, rewindRestoreGate,
    providerListGate, providerStopGate,
  } = require('../src/gates/index');
  const BookmarkStore = require('../src/bookmarks/store');

  test('bookmarkAddGate emits bookmarks.added', () => {
    const stream = new Stream();
    const bk     = new BookmarkStore();
    const added  = [];
    stream.on('bookmarks.added', e => added.push(e));
    stream.register(bookmarkAddGate(bk));
    stream.emit(new Event('bookmarks.add', { url: 'https://test.com', title: 'Test', agentId: 'a1' }));
    assertEqual(added.length, 1);
    assert(added[0].data.bookmark.id, 'should have bookmark id');
  });

  test('bookmarkListGate emits bookmarks.listed', () => {
    const stream = new Stream();
    const bk     = new BookmarkStore();
    bk.add({ url: 'https://x.com', title: 'X', agentId: 'default' });
    const listed = [];
    stream.on('bookmarks.listed', e => listed.push(e));
    stream.register(bookmarkListGate(bk));
    stream.emit(new Event('bookmarks.list', {}));
    assertEqual(listed.length, 1);
    assertEqual(listed[0].data.bookmarks.length, 1);
  });

  test('rewindListGate emits rewind.listed', () => {
    const stream  = new Stream();
    const mockRew = { list: (agentId) => [] };
    const listed  = [];
    stream.on('rewind.listed', e => listed.push(e));
    stream.register(rewindListGate(mockRew));
    stream.emit(new Event('rewind.list', { agentId: 'default' }));
    assertEqual(listed.length, 1);
    assert(Array.isArray(listed[0].data.snapshots));
  });

  test('providerListGate emits provider.listed', () => {
    const stream  = new Stream();
    const mockPh  = { list: () => [{ id: 'claude', name: 'Claude', hosted: false }] };
    const listed  = [];
    stream.on('provider.listed', e => listed.push(e));
    stream.register(providerListGate(mockPh));
    stream.emit(new Event('provider.list', {}));
    assertEqual(listed.length, 1);
    assertEqual(listed[0].data.providers[0].id, 'claude');
  });

  test('providerStopGate emits provider.stopped', () => {
    const stream  = new Stream();
    const mockPh  = { stop: (id) => ({ ok: true, providerId: id }) };
    const stopped = [];
    stream.on('provider.stopped', e => stopped.push(e));
    stream.register(providerStopGate(mockPh));
    stream.emit(new Event('provider.stop', { providerId: 'claude' }));
    assertEqual(stopped.length, 1);
    assertEqual(stopped[0].data.providerId, 'claude');
  });
}

// ── Summary ──────────────────────────────────────────────────────────────────
const waiting = new Promise(r => setTimeout(r, 200)); // let async tests settle
waiting.then(() => {
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Phase 2 Tests`);
  console.log(`Passed: ${passed}  Failed: ${failed}  Total: ${passed + failed}`);
  if (failed > 0) { process.exit(1); }
  else { console.log('All Phase 2 tests pass ✓'); process.exit(0); }
});
