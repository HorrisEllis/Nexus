'use strict';
/** lib/idea-provenance.js — agent vs user, enforced. */
const assert = require('assert');
const path = require('path');
const P = require(path.join(__dirname, '../../lib/idea-provenance.js'));

let passed = 0, failed = 0;
function test(id, name, fn) {
  try { fn(); console.log(`  ✓ ${id} ${name}`); passed++; }
  catch (e) { console.log(`  ✗ ${id} ${name}\n    ${e.message}`); failed++; }
}
const uniq = () => 'probe idea for the provenance suite, unique marker ' + Math.random().toString(36).slice(2, 9);
const agentIdea = (over = {}) => ({
  text: uniq(), origin: 'agent', agent: 'test-agent', about: 'nexus',
  evidence: [{ kind: 'lens', detail: 'observed something specific', where: 'lib/lenses.js' }], ...over,
});

test('IP-1', 'the vocabulary is closed — an unknown namespace is REFUSED, not stored', () => {
  const v = P.validateTags(['origin:agent', 'wat:something']);
  assert.strictEqual(v.ok, false);
  assert.ok(v.errors.some(e => /unknown namespace "wat"/.test(e)));
  // A freeform tag looks like structure and cannot be filtered on — the exact
  // reason idearium's existing ["test"] / ["e2e"] tags are useless.
  assert.strictEqual(P.validateTags(['freeform']).ok, false);
});

test('IP-2', 'an agent proposal without EVIDENCE is refused', () => {
  const r = P.propose(agentIdea({ evidence: [] }));
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors.some(e => /evidence: required for agent/.test(e)));
});

test('IP-3', 'evidence must name WHERE a reviewer can check it', () => {
  const r = P.propose(agentIdea({ evidence: [{ kind: 'lens', detail: 'something' }] }));
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors.some(e => /evidence\[0\]\.where/.test(e)));
});

test('IP-4', 'a USER may propose without evidence — a person is allowed a hunch', () => {
  const r = P.propose({ text: uniq(), origin: 'user', about: 'process' });
  assert.strictEqual(r.ok, true, JSON.stringify(r.errors));
  assert.ok(r.tags.includes('origin:user'));
  assert.ok(r.tags.includes('status:proposed'));
});

test('IP-5', 'AN AGENT CANNOT ACCEPT — the rule the review surface exists for', () => {
  const p = P.propose(agentIdea());
  assert.strictEqual(p.ok, true);
  for (const kind of ['agent', 'system', undefined, 'admin']) {
    const r = P.review(p.slug, 'accepted', { reviewer: 'test-agent', reviewerKind: kind });
    assert.strictEqual(r.ok, false, `reviewerKind "${kind}" must not be able to accept`);
    assert.ok(/only a USER can accept/.test(r.reason));
  }
  const ok = P.review(p.slug, 'accepted', { reviewer: 'human', reviewerKind: 'user' });
  assert.strictEqual(ok.ok, true);
  assert.strictEqual(ok.status, 'accepted');
});

test('IP-6', 'a rejection REQUIRES a note', () => {
  const p = P.propose(agentIdea());
  const bad = P.review(p.slug, 'rejected', { reviewer: 'human', reviewerKind: 'user' });
  assert.strictEqual(bad.ok, false);
  assert.ok(/requires a note/.test(bad.reason));
  const good = P.review(p.slug, 'rejected', { reviewer: 'human', reviewerKind: 'user', note: 'out of scope this quarter' });
  assert.strictEqual(good.ok, true);
});

test('IP-7', 'an unattributed decision is refused', () => {
  const p = P.propose(agentIdea());
  const r = P.review(p.slug, 'rejected', { note: 'no' });
  assert.strictEqual(r.ok, false);
  assert.ok(/reviewer required/.test(r.reason));
});

test('IP-8', 're-proposing a REJECTED idea is flagged, not silently landed', () => {
  const text = 'the run-all harness scores a crashed suite as a pass because the glyph reads failed equals zero ' + Math.random();
  const first = P.propose({ text, origin: 'agent', agent: 'a', about: 'nexus',
    evidence: [{ kind: 'test', detail: 'seven suites score 0/0', where: 'tests/modules/run-all.js' }] });
  P.review(first.slug, 'rejected', { reviewer: 'human', reviewerKind: 'user', note: 'later' });
  const again = P.propose({ text, origin: 'agent', agent: 'a', about: 'nexus',
    evidence: [{ kind: 'test', detail: 'seven suites score 0/0', where: 'tests/modules/run-all.js' }] });
  assert.strictEqual(again.ok, true, 'a re-proposal is allowed');
  assert.ok(again.priorRejections && again.priorRejections.length, 'and must be FLAGGED with the prior rejection');
});

test('IP-9', 'legacy untagged ideas are counted as UNTAGGED, never guessed into a bucket', () => {
  // §0.39.282 — this relied on the live tree's own legacy ideas; the test sandbox (lib/test-sandbox.js) gives it an
  // empty store, so it seeds one legacy row of the shape pre-provenance ideas have (freeform tags, no origin).
  require(path.join(__dirname, '../../cortex/memory/jaa-db.js')).jaaDB.insert(P.TABLE, { id: `legacy-${Date.now()}`, title: 'a legacy idea', tags: ['ui', 'someday'], status: 'open' });
  const s = P.stats();
  assert.strictEqual(s.ok, true);
  assert.ok(s.untagged > 0, 'a legacy freeform-tagged idea is present');
  assert.ok(s.untaggedNote && /NOT counted as user or agent/.test(s.untaggedNote));
  const bucketed = Object.values(s.byOrigin).reduce((a, b) => a + b, 0);
  assert.strictEqual(bucketed + s.untagged, s.total, 'every row is either tagged or counted untagged — none vanish');
});

test('IP-10', 'the review queue puts AGENT proposals first', () => {
  const q = P.pending();
  const firstUser = q.findIndex(r => P.originOf(r) === 'user');
  const lastAgent = q.map(r => P.originOf(r)).lastIndexOf('agent');
  if (firstUser >= 0 && lastAgent >= 0) assert.ok(lastAgent < firstUser || firstUser === -1,
    'agent proposals accumulate unread — they sort first');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
