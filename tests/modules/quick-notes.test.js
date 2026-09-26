'use strict';
/**
 * tests/modules/quick-notes.test.js — Phase 35
 * UUID: test-quick-notes-v1-0000-3500-0000-000000000001
 *
 * Covers: create/list/delete against a mock JAA, broadcast fires on every
 * create and delete, tag-to-idea only fires when tags are present, a
 * broadcast or idea-post failure never blocks the note itself from being
 * saved, empty text is rejected loudly, and deleted notes are excluded
 * from listNotes() (soft-delete, matching JaaDB's no-delete() reality —
 * same pattern case-library.test.js already established for this codebase).
 */

const assert = require('assert');
let passed = 0, failed = 0;

async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack || e.message}`); failed++; }
}

function makeMockJaa() {
  const store = { quick_notes: [] };
  return {
    store,
    insert(table, record) { (store[table] ||= []).push(record); return record; },
    update(table, uuid, patch) {
      const rows = store[table] || [];
      const idx = rows.findIndex(r => r.uuid === uuid);
      if (idx === -1) throw new Error('not found');
      rows[idx] = { ...rows[idx], ...patch };
      return rows[idx];
    },
    query(table, pred = () => true, limit = 500) {
      return (store[table] || []).filter(pred).slice(0, limit);
    },
  };
}

async function run() {
  function fresh() {
    delete require.cache[require.resolve('../../orchestrator/lib/quick-notes')];
    return require('../../orchestrator/lib/quick-notes');
  }

  await test('QN-01', 'create note succeeds and broadcasts', async () => {
    const qn = fresh();
    const jaa = makeMockJaa();
    const broadcasts = [];
    qn.init(jaa, { broadcast: (p) => broadcasts.push(p) });

    const r = await qn.createNote({ text: 'remember to check the seam.spec rename' });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.note.text, 'remember to check the seam.spec rename');
    assert.strictEqual(broadcasts.length, 1);
    assert.strictEqual(broadcasts[0].type, 'notes.created');
  });

  await test('QN-02', 'empty text rejected loudly, not silently dropped', async () => {
    const qn = fresh();
    const jaa = makeMockJaa();
    qn.init(jaa);
    const r1 = await qn.createNote({ text: '' });
    const r2 = await qn.createNote({ text: '   ' });
    const r3 = await qn.createNote({});
    assert.strictEqual(r1.ok, false);
    assert.strictEqual(r2.ok, false);
    assert.strictEqual(r3.ok, false);
  });

  await test('QN-03', 'tagged note posts an idea; untagged note does not', async () => {
    const qn = fresh();
    const jaa = makeMockJaa();
    const ideaCalls = [];
    qn.init(jaa, { postIdea: async (body) => { ideaCalls.push(body); return { ok: true, idea: { uuid: 'mock' } }; } });

    await qn.createNote({ text: 'no tags here' });
    assert.strictEqual(ideaCalls.length, 0);

    const r = await qn.createNote({ text: 'tagged note', tags: ['phase-40'] });
    assert.strictEqual(ideaCalls.length, 1);
    assert.deepStrictEqual(ideaCalls[0], { text: 'tagged note', tags: ['phase-40'] });
    assert.strictEqual(r.idea.ok, true);
  });

  await test('QN-04', 'idea-post failure does not undo the saved note', async () => {
    const qn = fresh();
    const jaa = makeMockJaa();
    qn.init(jaa, { postIdea: async () => { throw new Error('idearium offline'); } });

    const r = await qn.createNote({ text: 'tagged note', tags: ['x'] });
    assert.strictEqual(r.ok, true, 'note must still be saved even if idea-tagging fails');
    assert.strictEqual(r.idea.ok, false);
    assert.ok(r.idea.error.includes('idearium offline'));
    assert.strictEqual(jaa.store.quick_notes.length, 1);
  });

  await test('QN-05', 'broadcast failure does not prevent the note from being saved', async () => {
    const qn = fresh();
    const jaa = makeMockJaa();
    qn.init(jaa, { broadcast: () => { throw new Error('no clients connected'); } });

    const r = await qn.createNote({ text: 'still saved' });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(jaa.store.quick_notes.length, 1);
  });

  await test('QN-06', 'delete soft-deletes and excludes from listNotes(), broadcasts', async () => {
    const qn = fresh();
    const jaa = makeMockJaa();
    const broadcasts = [];
    qn.init(jaa, { broadcast: (p) => broadcasts.push(p) });

    const created = await qn.createNote({ text: 'temporary' });
    assert.strictEqual(qn.listNotes().length, 1);

    const del = await qn.deleteNote(created.note.uuid);
    assert.strictEqual(del.ok, true);
    assert.strictEqual(qn.listNotes().length, 0, 'deleted note must not appear in listNotes()');
    // Row still physically exists (soft delete) — JaaDB has no real delete().
    assert.strictEqual(jaa.store.quick_notes.length, 1);
    assert.strictEqual(jaa.store.quick_notes[0].deleted, true);
    assert.ok(broadcasts.some(b => b.type === 'notes.deleted'));
  });

  await test('QN-07', 'deleting a nonexistent uuid fails loudly, not silently', async () => {
    const qn = fresh();
    const jaa = makeMockJaa();
    qn.init(jaa);
    const r = await qn.deleteNote('does-not-exist');
    assert.strictEqual(r.ok, false);
    assert.ok(r.error);
  });

  console.log(`\n  quick-notes: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

run();
