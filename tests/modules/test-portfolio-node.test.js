'use strict';
require('../../lib/test-sandbox.js').ensure();
/**
 * tests/modules/test-portfolio-node.test.js — PF1 (0.60.299).
 * James, 2026-10-30: "make a .portfolio node, all nodes are physical files in the backend. import and export."
 * The .portfolio node: a store of his portfolios (name, headline, bio, skills, project items) that exports to one
 * clearglass.portfolio/1 file and imports back, merging by id.
 *
 *   PF-01  create a portfolio with items → stored; items cleaned (only titled ones kept)
 *   PF-02  an item with no title is refused, nothing stored half
 *   PF-03  export → a clearglass.portfolio/1 file with portfolios[]
 *   PF-04  export → import round-trips into a fresh store (items + seller fields preserved)
 *   PF-05  import upsert by id: a newer file updates, no duplicate; an older file is kept
 *   PF-06  a bad file → { ok:false, error }, nothing stored
 *   PF-07  a single bare portfolio ({ name, items }) imports
 *   PF-08  update and remove
 */
const assert = require('assert');
const P = require('../../clear-glass/src/autofill/portfolio.js');

let p = 0, f = 0;
const t = (id, d, fn) => { try { fn(); console.log(`  ✓ ${id} ${d}`); p++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${e.stack || e.message}`); f++; } };
const fresh = () => { const s = new P.PortfolioStore(); try { s._rows().replaceAll([]); } catch (_) {} s.load(); return s; };

t('PF-01', 'create with valid items; fields kept', () => {
  const s = fresh();
  const r = s.create({ name: 'My work', headline: 'Systems builder', skills: 'Node.js', items: [
    { title: 'NEXUS', description: 'self-building platform', link: 'https://github.com/HorrisEllis/Nexus' },
  ] });
  assert.ok(!r.error, r.error);
  assert.strictEqual(s.list().length, 1);
  assert.strictEqual(r.items.length, 1);
  assert.strictEqual(r.items[0].title, 'NEXUS');
  assert.strictEqual(r.items[0].link, 'https://github.com/HorrisEllis/Nexus');
  assert.strictEqual(r.headline, 'Systems builder');
});

t('PF-02', 'an item with no title is refused (create)', () => {
  const s = fresh();
  const r = s.create({ name: 'X', items: [{ description: 'no title' }] });
  // _cleanItems drops untitled on create, but _validateItems refuses an explicitly titleless item first
  assert.ok(r.error && /title/.test(r.error), 'refused with a title reason');
  assert.strictEqual(s.list().length, 0, 'nothing stored');
});

t('PF-03', 'export → clearglass.portfolio/1 file', () => {
  const s = fresh();
  s.create({ name: 'My work', items: [{ title: 'NEXUS' }] });
  const e = P.exportNode(s);
  assert.ok(e.ok);
  assert.ok(/clearglass\.portfolio\/1/.test(e.text));
  assert.ok(e.filename.endsWith('.portfolio'));
  assert.strictEqual(e.count, 1);
});

t('PF-04', 'export → import round-trips', () => {
  const s = fresh();
  s.create({ name: 'My work', headline: 'Systems builder', bio: 'I build things', skills: 'Node.js', items: [{ title: 'NEXUS', description: 'platform', skills: 'specs' }] });
  const dump = P.exportNode(s);
  const s2 = fresh();
  const r = P.importNode({ store: s2, text: dump.text });
  assert.ok(r.ok, JSON.stringify(r.errors));
  assert.strictEqual(s2.list().length, 1);
  const got = s2.list()[0];
  assert.strictEqual(got.headline, 'Systems builder');
  assert.strictEqual(got.items[0].title, 'NEXUS');
  assert.strictEqual(got.items[0].description, 'platform');
});

t('PF-05', 'import upsert by id: newer updates, older kept, no duplicate', () => {
  const s = fresh();
  const made = s.create({ name: 'My work', items: [{ title: 'NEXUS' }] });
  // a newer file (updatedAt ahead) updates in place
  const newer = { format: P.FORMAT, portfolios: [{ id: made.id, name: 'My work (v2)', items: [{ title: 'NEXUS v2' }], updatedAt: (made.updatedAt || 0) + 1000 }] };
  const r1 = P.importNode({ store: s, text: JSON.stringify(newer) });
  assert.ok(r1.ok);
  assert.strictEqual(s.list().length, 1, 'no duplicate');
  assert.strictEqual(s.get(made.id).name, 'My work (v2)', 'updated in place');
  // an older file is kept (not overwritten)
  const older = { format: P.FORMAT, portfolios: [{ id: made.id, name: 'stale', items: [{ title: 'old' }], updatedAt: 1 }] };
  const r2 = P.importNode({ store: s, text: JSON.stringify(older) });
  assert.ok(r2.imported[0].kept, 'the older copy was kept');
  assert.strictEqual(s.get(made.id).name, 'My work (v2)', 'still the newer one');
});

t('PF-06', 'a bad file → clean error, nothing stored', () => {
  const s = fresh();
  const r = P.importNode({ store: s, text: '{ not json ' });
  assert.strictEqual(r.ok, false);
  assert.ok(/not a portfolio file/.test(r.error));
  assert.strictEqual(s.list().length, 0);
});

t('PF-07', 'a single bare portfolio imports', () => {
  const s = fresh();
  const r = P.importNode({ store: s, text: JSON.stringify({ name: 'Solo', items: [{ title: 'One' }] }) });
  assert.ok(r.ok, JSON.stringify(r.errors));
  assert.strictEqual(s.list().length, 1);
  assert.strictEqual(s.list()[0].name, 'Solo');
});

t('PF-08', 'update and remove', () => {
  const s = fresh();
  const made = s.create({ name: 'A', items: [{ title: 'x' }] });
  const u = s.update(made.id, { name: 'B', bio: 'hi' });
  assert.strictEqual(u.name, 'B');
  assert.strictEqual(u.bio, 'hi');
  const d = s.remove(made.id);
  assert.ok(d.ok);
  assert.strictEqual(s.list().length, 0);
  assert.ok(s.update('nope', {}).error, 'update unknown → error');
});

console.log(`\n  ${p} passed, ${f} failed`);
process.exitCode = f ? 1 : 0;
