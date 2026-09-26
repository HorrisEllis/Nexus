'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-test-'));
process.env.JAA_DATA_DIR = tmp;

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  \u2713 ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  \u2717 ${id} ${desc}\n    ${e.stack}`); failed++; }
}

const searchEngine = require('./lib/agent-tools/tools/clear-glass/search-engine.js');
const dedupTable = require('./lib/agent-tools/tools/execution/dedup-table.js');

(async () => {

// ── pure functions, no jaaDB needed ─────────────────────────────────────────

await test('SE-001', 'validateRegister rejects missing fields', () => {
  assert.strictEqual(searchEngine._validateRegister({}), 'id is required');
  assert.strictEqual(searchEngine._validateRegister({ id: 'x' }), 'name is required');
  assert.strictEqual(searchEngine._validateRegister({ id: 'x', name: 'X' }), 'urlTemplate is required');
});

await test('SE-002', 'validateRegister requires a literal {query} placeholder', () => {
  const err = searchEngine._validateRegister({ id: 'x', name: 'X', urlTemplate: 'https://example.com/search?q=foo' });
  assert.ok(err && err.includes('{query}'));
});

await test('SE-003', 'validateRegister accepts a valid payload', () => {
  assert.strictEqual(searchEngine._validateRegister({ id: 'gh', name: 'GitHub', urlTemplate: 'https://api.github.com/search/code?q={query}' }), null);
});

await test('SE-004', 'substitute URL-encodes the query', () => {
  const url = searchEngine._substitute('https://example.com/search?q={query}', 'foo bar/baz');
  assert.strictEqual(url, 'https://example.com/search?q=foo%20bar%2Fbaz');
});

await test('SE-005', 'pluck reads a dot-path out of a parsed body', () => {
  assert.deepStrictEqual(searchEngine._pluck({ data: { items: [1, 2, 3] } }, 'data.items'), [1, 2, 3]);
});

await test('SE-006', 'pluck with no dotPath returns the body unchanged', () => {
  const body = { a: 1 };
  assert.strictEqual(searchEngine._pluck(body, null), body);
});

await test('SE-007', 'deriveFromPick builds a GET-style template from a real picker shape', () => {
  const result = searchEngine._deriveFromPick({ tag: 'input', name: 'q', type: 'search', url: 'https://example.com/products' });
  assert.strictEqual(result.urlTemplate, 'https://example.com/products?q={query}');
});

await test('SE-008', 'deriveFromPick defaults the param name to "q" when the picked element has none', () => {
  const result = searchEngine._deriveFromPick({ tag: 'input', url: 'https://example.com/' });
  assert.strictEqual(result.urlTemplate, 'https://example.com/?q={query}');
});

await test('SE-009', 'deriveFromPick rejects a pick with no url', () => {
  const result = searchEngine._deriveFromPick({ tag: 'input', name: 'q' });
  assert.ok(result.error);
});

// ── real end-to-end, against a real temp jaaDB (JAA_DATA_DIR redirected) ────

await test('SE-010', 'register writes a real row, retrievable via list', async () => {
  const reg = await searchEngine.execute({
    action: 'register', id: 'gh', name: 'GitHub code search', method: 'api',
    urlTemplate: 'https://api.github.com/search/code?q={query}',
    headers: { Authorization: 'token FAKE' }, resultsPath: 'items',
  });
  assert.ok(reg.ok, JSON.stringify(reg));
  assert.strictEqual(reg.engine.id, 'gh');

  const list = await searchEngine.execute({ action: 'list' });
  assert.ok(list.ok);
  assert.ok(list.engines.find(e => e.id === 'gh'));
});

await test('SE-011', 'search with method:"navigate" resolves the URL without a network call', async () => {
  await searchEngine.execute({
    action: 'register', id: 'ddg', name: 'DuckDuckGo', method: 'navigate',
    urlTemplate: 'https://duckduckgo.com/?q={query}',
  });
  const result = await searchEngine.execute({ action: 'search', id: 'ddg', query: 'nexus taxonomy' });
  assert.ok(result.ok);
  assert.strictEqual(result.method, 'navigate');
  assert.strictEqual(result.url, 'https://duckduckgo.com/?q=nexus%20taxonomy');
});

await test('SE-012', 'register_from_pick derives and stores a real engine from a picker-shaped object', async () => {
  const result = await searchEngine.execute({
    action: 'register_from_pick', id: 'site-search', name: 'Site search',
    pick: { tag: 'input', name: 'query', type: 'search', url: 'https://mysite.example/shop' },
  });
  assert.ok(result.ok, JSON.stringify(result));
  assert.strictEqual(result.engine.urlTemplate, 'https://mysite.example/shop?query={query}');
  assert.strictEqual(result.engine.derivedFromPick.tag, 'input');
});

await test('SE-013', 'delete soft-deletes — the engine no longer appears in list, and search fails honestly', async () => {
  await searchEngine.execute({ action: 'delete', id: 'ddg' });
  const list = await searchEngine.execute({ action: 'list' });
  assert.ok(!list.engines.find(e => e.id === 'ddg'));
  const result = await searchEngine.execute({ action: 'search', id: 'ddg', query: 'x' });
  assert.ok(result.error);
});

await test('SE-014', 'export_node as "command" writes a real, importable .command file', async () => {
  const result = await searchEngine.execute({ action: 'export_node', id: 'gh', exportAs: 'command' });
  assert.ok(result.ok, JSON.stringify(result));
  assert.ok(fs.existsSync(result.filePath));
  const nodeExport = require('./lib/node-export.js');
  const doc = nodeExport.importFromFile(result.filePath);
  assert.strictEqual(doc.type, 'command');
  assert.deepStrictEqual(doc.payload, { method: 'GET', path: '/search/gh' });
});

await test('SE-015', 'export_node as "tool" writes a real, importable forged .tool file, using steps not execute', async () => {
  const result = await searchEngine.execute({ action: 'export_node', id: 'gh', exportAs: 'tool' });
  assert.ok(result.ok, JSON.stringify(result));
  const nodeExport = require('./lib/node-export.js');
  const doc = nodeExport.importFromFile(result.filePath);
  assert.strictEqual(doc.type, 'tool');
  assert.ok(Array.isArray(doc.payload.steps));
  assert.strictEqual(doc.payload.steps[0].target, 'clearglass.search_engine.tool');
  assert.strictEqual(doc.payload.name, 'clearglass.search_gh.tool');
});

await test('SE-016', 'export_node rejects an unknown id honestly', async () => {
  const result = await searchEngine.execute({ action: 'export_node', id: 'does-not-exist', exportAs: 'command' });
  assert.ok(result.error);
});

// ── dedup-table.js, against the same real temp jaaDB ────────────────────────

await test('DT-001', 'dedup_table removes an exact uuid-collision duplicate and logs it', async () => {
  const { jaaDB } = require('./cortex/memory/jaa-db.js');
  const dupUuid = 'dup-uuid-fixed-for-test';
  jaaDB.insert('dt_test_table', { uuid: dupUuid, ts: 1000, note: 'older' });
  jaaDB.insert('dt_test_table', { uuid: dupUuid, ts: 2000, note: 'newer' });

  const result = await dedupTable.execute({ tables: ['dt_test_table'] });
  assert.ok(result.ok, JSON.stringify(result));
  assert.strictEqual(result.removedTotal, 1);

  const rows = jaaDB.query('dt_test_table', () => true);
  const survivors = rows.filter(r => r.uuid === dupUuid);
  assert.strictEqual(survivors.length, 1);
  assert.strictEqual(survivors[0].note, 'newer'); // most recent real timestamp wins
});

await test('DT-002', 'dedup_table requires an explicit, non-empty tables[] list', async () => {
  const result = await dedupTable.execute({ tables: [] });
  assert.ok(result.error);
});

})().then(() => {
  console.log(`\n${passed} passed, ${failed} failed`);
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exitCode = failed ? 1 : 0;
});
