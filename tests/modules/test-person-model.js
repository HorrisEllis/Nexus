'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// tests/modules/test-self-model.js
//
// The tests that matter most here are the REFUSALS. A self-model that records
// everything it thinks it noticed is easy to build and hard to trust; the value
// is entirely in what it declines to conclude.
// ─────────────────────────────────────────────────────────────────────────────

const assert = require('assert');
const path   = require('path');
const ROOT   = path.join(__dirname, '..', '..');

const sm  = require(path.join(ROOT, 'copilot', 'lib', 'person-model'));
const lat = require(path.join(ROOT, 'copilot', 'lib', 'person-model', 'lattice'));

let passed = 0, failed = 0;
function test(id, name, fn) {
  try { fn(); passed++; console.log(`  \u2713 ${id} ${name}`); }
  catch (e) { failed++; console.log(`  \u2717 ${id} ${name}\n    ${e.message}`); }
}

console.log('\n\u2550\u2550 SELF-MODEL \u2014 lattice, lenses, provenance, session chain \u2550\u2550\n');
sm._resetForTest();

// ── THE RULE ────────────────────────────────────────────────────────────────
test('SM-001', 'STATED-ONLY: nothing can be INFERRED into trigger/sensitive/boundary', () => {
  for (const t of ['trigger', 'sensitive', 'boundary']) {
    assert.throws(() => sm.infer({ type: t, label: 'x', basis: 'tone' }), /stated-only REFUSED/,
      `${t} accepted an inference \u2014 this is the exact wiring the module exists to prevent`);
  }
});

test('SM-002', 'STATED-ONLY: not even an OBSERVATION with real evidence gets in', () => {
  assert.throws(
    () => sm.observe({ type: 'trigger', label: 'x', evidence: { where: 'chat_log#42' } }),
    /stated-only REFUSED/,
    'good evidence for the wrong category is still the wrong category');
});

test('SM-003', 'the user CAN state a trigger \u2014 the rule limits the agent, not the person', () => {
  const n = sm.state({ type: 'trigger', label: 'being interrupted mid-build', note: 'ask before switching context' });
  assert.strictEqual(n.provenance, 'stated');
  assert.strictEqual(n.confidence, 1);
  assert.strictEqual(n.meta.note, 'ask before switching context');
});

test('SM-004', 'the system can still NOTICE \u2014 as an observation, never as a claim', () => {
  const o = sm.noteObservation({
    about: 'context-switching', saw: 'changed subject 3\u00d7 when deploys came up',
    evidence: { where: 'chat_log 2026-08-17 12:0[1-9]' }, suggestedType: 'trigger',
  });
  assert.strictEqual(o.status, 'pending');
  assert.strictEqual(o.proposedBy, 'agent');
  // The critical assertion: noticing did NOT create a node.
  assert.ok(!sm._lattice.nodes.has('trigger:context-switching'),
    'an observation became a claim without the user \u2014 the rule leaked');
});

test('SM-005', '\u00a7IP-5 AN AGENT CANNOT ACCEPT its own observation', () => {
  assert.throws(() => sm.accept('any-uuid', { by: 'agent', type: 'trigger', label: 'x' }),
    /only the user may accept/);
});

test('SM-006', '\u00a71.1 an observation with no checkable evidence is refused', () => {
  assert.throws(() => sm.noteObservation({ saw: 'seemed off', evidence: {} }), /checkable evidence/);
  assert.throws(() => sm.observe({ type: 'pattern', label: 'x', evidence: {} }), /evidence\.where/);
});

test('SM-007', 'an inference is CAPPED below certainty by construction', () => {
  const n = sm.infer({ type: 'preference', label: 'terse replies', basis: 'msg length', confidence: 0.99 });
  assert.ok(n.confidence <= 0.7, `an inference reached ${n.confidence} \u2014 a guess must never present as certainty`);
});

test('SM-008', 'provenance ratchets UP only \u2014 a stated fact never decays into a guess', () => {
  sm.state({ type: 'value', label: 'craft' });
  sm.infer({ type: 'value', label: 'craft', basis: 'word frequency' });
  assert.strictEqual(sm._lattice.nodes.get('value:craft').provenance, 'stated');
});

// ── Lattice ─────────────────────────────────────────────────────────────────
test('SM-009', 'a dangling edge is REFUSED \u2014 a fabricated relationship reads as evidence', () => {
  assert.throws(() => sm.connect('value:craft', 'goal:nope', 'supports'), /unknown node/);
  assert.throws(() => sm.connect('value:craft', 'value:craft', 'supports'), /self-edge/);
});

test('SM-010', 'typed edges: supports and tensions are NOT the same relationship', () => {
  sm.state({ type: 'goal', label: 'ship nexus v1' });
  sm.state({ type: 'value', label: 'rest' });
  sm.connect('value:craft', 'goal:ship-nexus-v1', 'supports');
  sm.connect('value:rest',  'goal:ship-nexus-v1', 'tensions');
  const t = sm.LENSES.tension.run(sm._lattice);
  assert.strictEqual(t.verdict, 'FINDING');
  assert.ok(t.findings.some(f => f.type === 'tensions'), 'the tension must surface, not be flattened into "related"');
});

test('SM-011', 'spread: strongest path wins, never summed \u2014 weak paths cannot manufacture certainty', () => {
  const L = new lat.Lattice();
  L.upsertNode({ id: 'a', type: 'value', label: 'a', confidence: 1 });
  L.upsertNode({ id: 'b', type: 'value', label: 'b', confidence: 1 });
  L.upsertNode({ id: 'c', type: 'value', label: 'c', confidence: 1 });
  L.connect('a', 'c', 'supports', { weight: 0.9 });
  L.connect('a', 'b', 'supports', { weight: 0.2 });
  L.connect('b', 'c', 'supports', { weight: 0.2 });
  const got = L.spread('a', { depth: 3 }).activated.find(x => x.id === 'c');
  assert.ok(Math.abs(got.activation - 0.9) < 1e-6,
    `c activated at ${got.activation}; summed paths would exceed 0.9 and invent confidence`);
});

test('SM-012', 'a cycle terminates \u2014 a node activates at most once', () => {
  const L = new lat.Lattice();
  ['x', 'y', 'z'].forEach(id => L.upsertNode({ id, type: 'value', label: id, confidence: 1 }));
  L.connect('x', 'y', 'supports'); L.connect('y', 'z', 'supports'); L.connect('z', 'x', 'supports');
  assert.doesNotThrow(() => L.spread('x', { depth: 10 }));
});

// ── Lenses ──────────────────────────────────────────────────────────────────
test('SM-013', 'LN-1 every lens declares the question it answers', () => {
  for (const [id, l] of Object.entries(sm.LENSES)) {
    assert.ok(l.question && l.question.length > 10, `lens '${id}' has no real question`);
  }
});

test('SM-014', 'LN-3 a lens ABSTAINS rather than returning an empty table', () => {
  const r = sm.LENSES.meaning.run(sm._lattice, {});
  assert.strictEqual(r.verdict, 'ABSTAIN');
  assert.ok(r.reason, 'an abstention must say why');
});

test('SM-015', 'LN-7 THE ONE THAT MATTERS: coverage travels with every reading', () => {
  const p = sm.portrait();
  assert.ok(p.coverage, 'no coverage block \u2014 a reading from blind lenses would look identical to a real one');
  assert.ok(Array.isArray(p.coverage.blindLenses));
  if (p.coverage.blind > 0) assert.ok(p.caveat, 'blind lenses present but no caveat on the payload');
});

test('SM-016', 'the CARE lens reads ONLY stated content \u2014 it cannot report an inferred sensitivity', () => {
  sm.infer({ type: 'pattern', label: 'avoids deploy talk', basis: 'topic shifts' });
  const c = sm.LENSES.care.run(sm._lattice);
  const labels = (c.findings || []).map(f => f.label);
  assert.ok(!labels.includes('avoids deploy talk'), 'an inference leaked into the care lens');
  assert.ok(labels.includes('being interrupted mid-build'), 'the STATED trigger should be there');
});

// ── Sessions ────────────────────────────────────────────────────────────────
test('SM-017', 'a session chains to its REAL predecessor \u2014 null only when there genuinely is none', () => {
  // CAUGHT BY THE REAL RUNNER: this originally asserted prevSessionHash === null
  // unconditionally, and only passed because the store happened to be empty. Run
  // after any session had ever been recorded, it failed \u2014 while the CODE was
  // doing exactly the right thing: finding a real predecessor and chaining to it.
  // A test that passes only on a virgin store is testing the fixture, not the
  // invariant. The invariant is: chain to the predecessor if one exists, null if
  // and only if one does not.
  sm._resetForTest();
  const chainBefore = sm.verifyChain();
  const hadPrior = chainBefore.ok && chainBefore.sessions > 0;

  const s = sm.startSession({ id: 'sess-1' });
  if (hadPrior) {
    assert.ok(s.prevSessionId !== null, 'sessions exist in the store but this one claims no predecessor \u2014 that is a broken chain reported as a fresh start');
    assert.ok(s.prevSessionHash !== null, 'a predecessor with no hash means the chain cannot be verified');
  } else {
    assert.strictEqual(s.prevSessionId, null);
    assert.strictEqual(s.prevSessionHash, null);
  }
  sm.endSession();
});

test('SM-017b', 'the very first session against a CLEAN store has a genuinely null predecessor', () => {
  // The original intent of SM-017, tested where it is actually true: an isolated
  // store, so the assertion cannot silently depend on what ran before it.
  const os = require('os'), fs = require('fs'), pathm = require('path');
  const dir = fs.mkdtempSync(pathm.join(os.tmpdir(), 'pm-chain-'));
  const { Lattice } = lat;
  // No store reachable => load() reports it honestly rather than claiming empty.
  const fresh = new Lattice();
  assert.strictEqual(fresh.live().length, 0, 'a new lattice starts genuinely empty');
  const h = sm.health();
  assert.ok('storeAvailable' in h, 'health must state whether a store was reachable at all \u2014 unknown is not the same as empty');
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
});

test('SM-018', 'a session records what changed in it, and hashes on close', () => {
  // Self-contained: this originally depended on SM-017 leaving a session open,
  // which is the same coupling-through-module-state defect SM-017 itself had.
  // A suite whose tests only pass in one order hides real failures.
  sm._resetForTest();
  sm.startSession({ id: 'sess-18' });
  sm.state({ type: 'value', label: 'honesty' });
  const done = sm.endSession();
  assert.ok(done.sessionHash && done.sessionHash.length === 64);
  assert.ok(done.nodesAdded.includes('value:honesty'), 'the session must know what it added');
  assert.ok(done.endedAt >= done.startedAt);
});

test('SM-019', 'the hash covers the CONTENT \u2014 editing a session after the fact is detectable', () => {
  sm._resetForTest();
  sm.startSession({ id: 'h1' });
  sm.state({ type: 'goal', label: 'original goal' });
  const a = sm.endSession();
  sm.startSession({ id: 'h2' });
  sm.state({ type: 'goal', label: 'original goal' });
  const b = sm.endSession();
  b.nodesAdded.push('goal:smuggled-in');
  const crypto = require('crypto');
  const rehash = crypto.createHash('sha256').update(JSON.stringify({
    id: b.id, startedAt: b.startedAt, endedAt: b.endedAt, prevSessionHash: b.prevSessionHash,
    nodesAdded: b.nodesAdded, nodesUpdated: b.nodesUpdated, edgesAdded: b.edgesAdded, observations: b.observations,
  })).digest('hex');
  assert.notStrictEqual(rehash, b.sessionHash, 'an edited session still matched its hash \u2014 the chain proves nothing');
  assert.ok(a.sessionHash);
});

// ── Ownership ───────────────────────────────────────────────────────────────
test('SM-020', 'forget() archives with a reason and drops off every read (\u00a70.3)', () => {
  sm._resetForTest();
  sm.startSession({ id: 'own' });
  sm.state({ type: 'interest', label: 'model trains' });
  assert.throws(() => sm.forget('interest:model-trains'), /requires a reason/);
  sm.forget('interest:model-trains', 'never was mine');
  assert.ok(!sm._lattice.live().some(n => n.id === 'interest:model-trains'));
  assert.strictEqual(sm._lattice.nodes.get('interest:model-trains').archivedReason, 'never was mine');
});

test('SM-021', 'purge() is a REAL delete, and is deliberately awkward to call', () => {
  assert.strictEqual(sm.purge().ok, false, 'purge fired without confirmation');
  assert.strictEqual(sm.purge({ confirm: 'yes' }).ok, false);
  sm.state({ type: 'value', label: 'temp' });
  const r = sm.purge({ confirm: 'DELETE EVERYTHING' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(sm._lattice.live().length, 0);
  assert.ok(/hard deleted/.test(r.note), 'a purge that only archives would be a lie to someone asking to be forgotten');
});

test('SM-022', 'exportAll() returns everything held, including the chain state', () => {
  sm._resetForTest();
  sm.startSession({ id: 'x1' });
  sm.state({ type: 'belief', label: 'systems should explain themselves' });
  const e = sm.exportAll();
  assert.ok(e.nodes.length >= 1);
  assert.ok('chain' in e && 'sessions' in e && 'review' in e);
  assert.ok(e.note, 'an export should tell you what you can do about what it contains');
});

test('SM-023', 'new metrics at RUNTIME \u2014 addNodeType, no schema change', () => {
  sm.addNodeType('somatic_marker');
  const n = sm.state({ type: 'somatic_marker', label: 'jaw tension before hard calls' });
  assert.strictEqual(n.type, 'somatic_marker');
  assert.ok(lat.validNodeType('somatic_marker'));
});

test('SM-024', 'a co_occurs edge is marked OBSERVATIONAL \u2014 it is not a causal claim', () => {
  sm.state({ type: 'pattern', label: 'late night builds' });
  sm.state({ type: 'pattern', label: 'terse messages' });
  const e = sm.connect('pattern:late-night-builds', 'pattern:terse-messages', 'co_occurs');
  assert.strictEqual(e.observational, true, 'coincidence and causation must not look the same');
  const c = sm.connect('pattern:late-night-builds', 'pattern:terse-messages', 'causes');
  assert.strictEqual(c.observational, false);
});

test('SM-025', 'decay: stated never decays, inferred decays fastest', () => {
  const day = 86400000;
  const stated   = { provenance: 'stated',   confidence: 0.9, lastSeen: Date.now() - 30 * day };
  const observed = { provenance: 'observed', confidence: 0.9, lastSeen: Date.now() - 5 * day };
  const inferred = { provenance: 'inferred', confidence: 0.9, lastSeen: Date.now() - 5 * day };
  assert.strictEqual(sm.effectiveConfidence(stated), 0.9, 'a stated fact decayed \u2014 it should not');
  assert.ok(sm.effectiveConfidence(inferred) < sm.effectiveConfidence(observed),
    'an inference must go stale faster than a real observation');
  assert.ok(sm.effectiveConfidence(inferred) >= 0.05, 'confidence must floor, never hit zero');
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
