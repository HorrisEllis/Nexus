'use strict';
// Tests lib/local-vector-index.js — the dependency-free vectra replacement.
// Run: node tests/local-vector-index.test.js

const { LocalIndex } = require('../lib/local-vector-index');
const os = require('os'), path = require('path'), fs = require('fs');

async function main() {
  const dir = path.join(os.tmpdir(), 'lvi-test-' + Date.now());
  const idx = new LocalIndex(dir);

  if (await idx.isIndexCreated()) throw new Error('FAIL: index should not exist yet');
  await idx.createIndex({ version: 1 });
  if (!(await idx.isIndexCreated())) throw new Error('FAIL: index should exist now');
  console.log('PASS: isIndexCreated/createIndex');

  await idx.insertItem({ id: 'a', vector: [1,0,0], metadata: { table: 'gaps', text: 'alpha' } });
  await idx.insertItem({ id: 'b', vector: [0,1,0], metadata: { table: 'jobs', text: 'beta' } });
  await idx.insertItem({ id: 'c', vector: [0.9,0.1,0], metadata: { table: 'gaps', text: 'gamma — close to a' } });

  const stats = await idx.getIndexStats();
  if (stats.items !== 3) throw new Error(`FAIL: expected 3 items, got ${stats.items}`);
  console.log('PASS: insertItem + getIndexStats');

  const got = await idx.getItem('b');
  if (!got || got.metadata.text !== 'beta') throw new Error('FAIL: getItem');
  console.log('PASS: getItem');

  const results = await idx.queryItems([1,0,0], 3);
  if (results[0].item.id !== 'a' || results[1].item.id !== 'c' || results[2].item.id !== 'b') {
    throw new Error(`FAIL: ranking wrong — got ${results.map(r=>r.item.id).join(',')}`);
  }
  if (!(results[0].score > results[2].score)) throw new Error('FAIL: score ordering wrong');
  console.log('PASS: queryItems ranks by cosine similarity correctly');

  const filtered = await idx.queryItems([1,0,0], 5, { table: 'gaps' });
  if (filtered.length !== 2 || !filtered.every(r => r.item.metadata.table === 'gaps')) {
    throw new Error('FAIL: metadata filter leaked or dropped rows');
  }
  console.log('PASS: metadata filter');

  let threw = false;
  try { await idx.insertItem({ id: 'a', vector: [1,1,1] }); } catch (_) { threw = true; }
  if (!threw) throw new Error('FAIL: duplicate insert should throw');
  console.log('PASS: duplicate id rejected');

  const idx2 = new LocalIndex(dir);
  const stats2 = await idx2.getIndexStats();
  if (stats2.items !== 3) throw new Error(`FAIL: persistence — new instance saw ${stats2.items} items, expected 3`);
  console.log('PASS: persists across instances (reads its own file back correctly)');

  fs.rmSync(dir, { recursive: true, force: true });
  console.log('\nAll assertions passed.');
}

main().catch(e => { console.error('\nTEST FAILED:', e.message); process.exit(1); });
