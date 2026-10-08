'use strict';
/**
 * tests/modules/test-spec-document.test.js — RS3 (docs/2026-10-05-spec-workshop-rebuild-phasemap.spec), 0.49.0.
 * James: "I'm thinking like document editor but for the emerge and .spec files. each block has a block id, which can be
 *        completely custom, can be anything." · "okay now the phases with the spec workshop. needs to be rebuilt,
 *        enterprise grade. interconnected"
 *
 *   SD-01  genesis.spec opens as its blocks (emerge: its domains and sections) and saves byte-identical untouched;
 *          so does a YAML phasemap and a markdown spec
 *   SD-02  an edited block keeps every comment and every other block byte for byte; the check runs on the result
 *   SD-03  an id can be anything: a custom id is written as the block's marker and read back; a taken id is refused
 *   SD-04  a renamed id is renamed where it is referenced (a phasemap planned from that spec: blocks: and sections:),
 *          and nowhere else (another spec's map)
 *   SD-05  the checks: YAML by its parser, emerge structurally (an unclosed quote or bracket, a domain without its
 *          quoted name), each with its line
 *   SD-06  two blocks of the same name: the second is said, not silently merged; a duplicate marker is a problem
 *   SD-07  the workshop's own form (sections: [{ id, title, body }], main's SP1): each section a block, its id its id:
 *          field (a rename edits it), the idea's framing bookkeeping; byte-identical
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const D = require(path.join(ROOT, 'lib/spec-document.js'));

let passed = 0, failed = 0;
function test(id, desc, fn) {
  try { fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack ? e.stack.split('\n').slice(0, 4).join('\n    ') : e.message}`); failed++; }
}

const GEN = fs.readFileSync(path.join(ROOT, 'idearium/spec-engine/templates/genesis.spec'), 'utf8');
const EG = [
  '// a tiny emerge spec',
  'version 1.0.0',
  '',
  '// ── Spine ──────────',
  'spine WARP',
  'spine.rule = one_path',
  '',
  '// the schema domain: what a record is',
  '// (two comment lines)',
  'domain "schema"',
  '  record.id = string',
  '  record.tags = [a, b]',
  '',
  'domain "core"',
  '  core.loop = event',
  '',
].join('\n');

test('SD-01', 'genesis.spec opens as its blocks and saves byte-identical; a YAML map and a markdown spec too', () => {
  const d = D.parse(GEN, { path: 'genesis.spec' });
  assert.strictEqual(d.format, 'emerge');
  assert.strictEqual(D.serialize(d), GEN, 'untouched → byte-identical');
  const ids = d.blocks.map(b => b.id);
  for (const want of ['_preamble', 'shape', 'schema', 'core', 'contract', 'registry', 'nodes', 'pulse', 'routing']) assert.ok(ids.includes(want), `${want} in ${ids.join(',')}`);
  assert.strictEqual(new Set(ids).size, ids.length, 'ids unique');
  assert.ok(d.blocks.every(b => /^[0-9a-f]{64}$/.test(b.hash)));
  const map = fs.readFileSync(path.join(ROOT, 'docs/2026-10-05-spec-workshop-rebuild-phasemap.spec'), 'utf8');
  const m = D.parse(map, { path: 'x-phasemap.spec' });
  assert.strictEqual(m.format, 'yaml'); assert.strictEqual(D.serialize(m), map);
  assert.ok(m.blocks.some(b => b.id === 'phases'));
  const md = '# Title\nintro\n\n## One\na\n\n## Two\nb\n';
  const k = D.parse(md, { path: 'x.md' });
  assert.deepStrictEqual(k.blocks.map(b => b.id), ['title', 'one', 'two']); assert.strictEqual(D.serialize(k), md);
});

test('SD-02', 'an edited block keeps every comment and every other block byte for byte', () => {
  const d = D.parse(EG, { path: 'x.eg' });
  assert.deepStrictEqual(d.blocks.map(b => b.id), ['_preamble', 'spine', 'schema', 'core']);
  const schema = d.blocks.find(b => b.id === 'schema');
  assert.ok(schema.text.startsWith('// the schema domain'), 'the comments directly above belong to the block');
  const edited = schema.text.replace('record.tags = [a, b]', 'record.tags = [a, b, c]\n  record.owner = string');
  const r = D.replaceBlock(EG, 'schema', edited, { path: 'x.eg' });
  assert.ok(r.ok, r.error);
  assert.ok(r.text.includes('// the schema domain: what a record is\n// (two comment lines)\ndomain "schema"'), 'its comments kept');
  const after = D.parse(r.text, { path: 'x.eg' });
  for (const id of ['_preamble', 'spine', 'core']) assert.strictEqual(after.blocks.find(b => b.id === id).text, d.blocks.find(b => b.id === id).text, `${id} untouched`);
  assert.notStrictEqual(after.blocks.find(b => b.id === 'schema').hash, schema.hash, 'its hash moved');
  assert.strictEqual(r.check.ok, true); assert.strictEqual(r.idChanged, null);
  const noNl = D.replaceBlock(EG, 'spine', '// ── Spine ──────────\nspine WARP', { path: 'x.eg' });
  assert.ok(/spine WARP\n\/\/ the schema domain/.test(noNl.text), 'a block keeps its line break so the next head starts a line');
  assert.strictEqual(D.replaceBlock(EG, 'nope', 'x').ok, false);
});

test('SD-03', 'an id can be anything: written as the marker, read back; a taken id is refused', () => {
  const r = D.setId(EG, 'schema', 'Record shape — v2 (James)', { path: 'x.eg' });
  assert.ok(r.ok, r.error);
  assert.ok(r.text.includes('// @block Record shape — v2 (James)\n// the schema domain'), 'the marker is the block\'s first line');
  const d = D.parse(r.text, { path: 'x.eg' });
  assert.ok(d.blocks.some(b => b.id === 'Record shape — v2 (James)' && b.marked && b.natural === 'schema'));
  const again = D.setId(r.text, 'Record shape — v2 (James)', 'rs-2', { path: 'x.eg' });
  assert.ok(again.text.includes('// @block rs-2\n') && !again.text.includes('@block Record shape'), 'a marked block\'s marker is changed, not duplicated');
  assert.ok(/taken/.test(D.setId(EG, 'schema', 'core', { path: 'x.eg' }).error), 'a taken id is refused');
  assert.ok(/anything but empty or a line break/.test(D.setId(EG, 'schema', 'a\nb', { path: 'x.eg' }).error));
  assert.ok(/preamble/.test(D.setId(EG, '_preamble', 'p', { path: 'x.eg' }).error));
  const y = D.setId('spec:\n  meta:\n    a: 1\n  body:\n    b: 2\n', 'body', 'the body', { path: 'x.spec' });
  assert.ok(y.text.includes('# @block the body\n  body:') && D.parse(y.text).blocks.some(b => b.id === 'the body'));
  const ym = D.parse(y.text);
  assert.doesNotThrow(() => require('js-yaml').load(y.text), 'the marker is a comment: the YAML still parses');
  void ym;
});

test('SD-04', 'a renamed id is renamed where it is referenced — that spec\'s maps only', () => {
  const map = [
    'spec:', '  meta:', '    spec: spec/shop.spec', '  phases:',
    '    SH0_schema:', '      sections: [schema, core]', '      depends_on: []',
    '    SH1_core:', '      blocks:', '        - core', '        - "schema"', '      depends_on: [SH0_schema]', '',
  ].join('\n');
  const r = D.renameRefs(map, { spec: 'spec/shop.spec', from: 'schema', to: 'record-shape' });
  assert.strictEqual(r.count, 2);
  assert.ok(r.text.includes('sections: [record-shape, core]') && r.text.includes('        - "record-shape"'));
  assert.ok(r.text.includes('depends_on: [SH0_schema]'), 'a phase id that merely contains the word is not touched');
  assert.strictEqual(D.renameRefs(map, { spec: 'spec/other.spec', from: 'schema', to: 'x' }).count, 0, 'another spec\'s map is left alone');
});

test('SD-05', 'the checks: YAML by its parser, emerge structurally, each with its line', () => {
  const bad = D.check('spec:\n  a: [1, 2\n  b: 3\n', 'yaml');
  assert.strictEqual(bad.ok, false); assert.ok(bad.problems[0].line >= 2);
  const e = D.check('domain schema\n  x = "open\n  y = [a, b\n', 'emerge');
  const msgs = e.problems.map(p => `${p.line}: ${p.message}`).join(' | ');
  assert.ok(/1: a domain line names its domain in quotes/.test(msgs), msgs);
  assert.ok(/2: a quote is opened and not closed/.test(msgs), msgs);
  assert.ok(/3: "\[" is opened and never closed/.test(msgs), msgs);
  assert.strictEqual(D.check(GEN, 'emerge').ok, true, D.check(GEN, 'emerge').problems.slice(0, 3).map(p => `${p.line}: ${p.message}`).join(' | '));
  const r = D.replaceBlock(EG, 'core', 'domain "core"\n  core.loop = [event\n', { path: 'x.eg' });
  assert.strictEqual(r.ok, true, 'an edit is taken'); assert.strictEqual(r.check.ok, false, 'and its check says what broke');
});

test('SD-06', 'two blocks of one name: the second is said; a duplicate marker is a problem', () => {
  const two = 'domain "x"\n  a = 1\n\ndomain "x"\n  b = 2\n';
  const d = D.parse(two, { path: 'y.eg' });
  assert.deepStrictEqual(d.blocks.map(b => b.id), ['x', 'x~2']);
  assert.ok(/two blocks are named "x"/.test(d.problems[0].message));
  const dupe = '// @block same\ndomain "a"\n  a = 1\n\n// @block same\ndomain "b"\n  b = 1\n';
  assert.ok(D.parse(dupe, { path: 'y.eg' }).problems.some(p => /duplicate block id "same"/.test(p.message)));
  const r = D.replaceBlock(EG, 'core', '// @block spine\ndomain "core"\n', { path: 'x.eg' });
  assert.strictEqual(r.ok, false, 'an edit that would duplicate an id is refused'); assert.ok(/duplicate block id "spine"/.test(r.error));
});

test('SD-07', 'the workshop form: each section a block by its id: field; a rename edits it; the framing is bookkeeping', () => {
  const W = 'spec:\n  meta:\n    name: shop\nsections:\n  - id: idea\n    title: The idea\n    body: a shop\n  # the record\n  - id: schema\n    title: Schema\n    body: |\n      an order with lines\n  - id: api\n    title: API\n    body: ""\n';
  const d = D.parse(W);
  assert.strictEqual(d.format, 'sections'); assert.strictEqual(D.serialize(d), W);
  assert.deepStrictEqual(d.blocks.map(b => [b.id, D.isBookkeeping(b)]), [['_preamble', true], ['idea', true], ['schema', false], ['api', false]]);
  assert.ok(d.blocks.find(b => b.id === 'schema').text.startsWith('  # the record\n'), 'its comment above belongs to it');
  const r = D.setId(W, 'schema', 'record shape');
  assert.ok(r.ok && r.text.includes('  - id: "record shape"') && D.parse(r.text).blocks.some(b => b.id === 'record shape'));
  assert.ok(/taken/.test(D.setId(W, 'schema', 'api').error));
  assert.strictEqual(D.check(W, 'sections').ok, true);
});

console.log(`\n  ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
