// idearium/test/idea-workbench.test.js — pure model of the Compartment (lib/idea-workbench.js)
import assert from 'node:assert/strict';
import * as WB from '../lib/idea-workbench.js';

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log(`[PASS] ${name}`); };

t('unknown lane is a hard error', () => {
  assert.match(WB.makeEntry({ ideaUuid: 'i1', lane: 'nope', text: 'x' }).error, /unknown lane/);
});
t('empty text rejected', () => {
  assert.match(WB.makeEntry({ ideaUuid: 'i1', lane: 'problem', text: '  ' }).error, /text required/);
});

const a = WB.makeEntry({ ideaUuid: 'i1', lane: 'problem', text: 'root problem' }).entry;
const b = WB.makeEntry({ ideaUuid: 'i1', lane: 'problem', text: 'sub', parentUuid: a.uuid }, [a]).entry;
const c = WB.makeEntry({ ideaUuid: 'i1', lane: 'problem', text: 'sub-sub', parentUuid: b.uuid }, [a, b]).entry;
const d = WB.makeEntry({ ideaUuid: 'i2', lane: 'improve', text: 'elsewhere', links: [c.uuid, 'i1'] }).entry;

t('parent must exist and belong to the same idea', () => {
  assert.match(WB.makeEntry({ ideaUuid: 'i1', lane: 'expand', text: 'x', parentUuid: 'missing' }, [a]).error, /not found/);
  assert.match(WB.makeEntry({ ideaUuid: 'i2', lane: 'expand', text: 'x', parentUuid: a.uuid }, [a]).error, /different idea/);
});
t('buildTree nests to any depth under the lane', () => {
  const tree = WB.buildTree([c, a, b]);
  assert.equal(tree.problem.length, 1);
  assert.equal(tree.problem[0].children[0].children[0].text, 'sub-sub');
  assert.deepEqual(tree.brainstorm, []);
});
t('descendants walks the whole subtree', () => {
  assert.deepEqual(WB.descendants([a, b, c], a.uuid).sort(), [b.uuid, c.uuid].sort());
});
t('backlinks find inbound links to entries and ideas', () => {
  assert.deepEqual(WB.backlinks([a, b, c, d], c.uuid).map(e => e.uuid), [d.uuid]);
  assert.deepEqual(WB.backlinks([a, b, c, d], 'i1').map(e => e.uuid), [d.uuid]);
});
t('patchEntry validates status/lane and edits links', () => {
  assert.match(WB.patchEntry(a, { status: 'bogus' }).error, /unknown status/);
  const r = WB.patchEntry(a, { status: 'resolved', addLink: 'x', lane: 'improve' }).entry;
  assert.equal(r.status, 'resolved'); assert.equal(r.lane, 'improve'); assert.deepEqual(r.links, ['x']);
  assert.deepEqual(WB.patchEntry(r, { removeLink: 'x' }).entry.links, []);
});
t('memberTree nests child ideas and counts lanes', () => {
  const members = [WB.makeMember({ ideaUuid: 'i1' }), WB.makeMember({ ideaUuid: 'i2', parentIdea: 'i1' }), WB.makeMember({ ideaUuid: 'i3', parentIdea: 'i2' })];
  const ideas = new Map([['i1', { text: 'one' }], ['i2', { text: 'two' }]]);
  const tree = WB.memberTree(members, [a, b, c, d], ideas);
  assert.equal(tree.length, 1);
  assert.equal(tree[0].counts.lanes.problem, 3);
  assert.equal(tree[0].children[0].children[0].missing, true);
  assert.deepEqual(WB.ancestry(members, 'i3'), ['i1', 'i2']);
});
t('ancestry survives a parent cycle', () => {
  const m = [WB.makeMember({ ideaUuid: 'x', parentIdea: 'y' }), WB.makeMember({ ideaUuid: 'y', parentIdea: 'x' })];
  assert.ok(WB.ancestry(m, 'x').length <= 2);
});
t('lanePrompt carries the thread', () => {
  const p = WB.lanePrompt('problem', 'idea', 'leaf', ['root', 'mid']);
  assert.match(p, /root/); assert.match(p, /root causes/);
});
console.log(`\n${pass} passed`);
