'use strict';
// tests/modules/test-raid-input.test.js — RD9: an input to RAID is a .input node before it is routed; the decision is written back (slice a);
// it becomes a contract from the template and is booked as RAID's v2 contract (slice b, RI-03..RI-06).
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const RI = require('../../cortex/core/raid/input.js'); const NE = require('../../lib/node-export.js');
(async () => {
  let p = 0, f = 0; const t = async (id, d, fn) => { try { await fn(); console.log(`  ✓ ${id} ${d}`); p++; } catch (e) { console.error(`  ✗ ${id} ${d}\n    ${e.message}`); f++; } };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'raid-in-'));
  await t('RI-01', 'kept as a .input node before RAID decides; the decision and its why written back', async () => {
    let seenBefore = null;
    const r = await RI.take({ text: 'build the next phase', from: 'cli', by: 'person' }, { dir, decide: async (intent, env) => { seenBefore = NE.fromYaml(fs.readFileSync(path.join(dir, fs.readdirSync(dir)[0]), 'utf8')).payload; return { provider: 'idearium', why: 'a build request' }; } });
    assert.ok(r.ok); assert.strictEqual(seenBefore.text, 'build the next phase'); assert.strictEqual(seenBefore.decision, null, 'on disk before the decision');
    const n = NE.fromYaml(fs.readFileSync(r.file, 'utf8')); assert.strictEqual(n.type, 'input');
    assert.strictEqual(n.payload.decision.provider, 'idearium'); assert.strictEqual(n.payload.decision.why, 'a build request'); assert.strictEqual(n.payload.from, 'cli'); assert.ok(n.payload.envelopeId);
  });
  await t('RI-02', 'RAID failing to decide keeps the input, said; no words or no asker is refused; listed newest first', async () => {
    const r = await RI.take({ text: 'x', by: 'agent:a' }, { dir, decide: async () => { throw new Error('down'); } });
    assert.ok(r.ok); assert.match(r.decision.error, /could not decide: down/);
    assert.strictEqual((await RI.take({ text: ' ', by: 'person' }, { dir })).code, 400); assert.strictEqual((await RI.take({ text: 'y' }, { dir })).code, 400);
    const l = RI.list({ dir }); assert.strictEqual(l.length, 2); assert.strictEqual(l[0].text, 'x');
  });
  // RD9 slice b (2026-11-14), his: "input -> raid uses agent and contract tool with the schema or template listing the system, agent, what hat if
  // applicaple, capability/command, the data from the compartment whether the contents of a file, zip or context synthesized from a dag, tags, dag to
  // determin the conditions, etc. contract as the end state."
  const T = require('../../cortex/core/raid/contract-template.js'); const CG = require('../../cortex/core/raid/contract-gates.js'); const DOOR = require('../../cortex/core/raid/contract-v2-door.js');
  const cdir = fs.mkdtempSync(path.join(os.tmpdir(), 'raid-c-')); const root = fs.mkdtempSync(path.join(os.tmpdir(), 'raid-root-'));
  fs.mkdirSync(path.join(root, 'src')); fs.writeFileSync(path.join(root, 'src/parser.js'), 'module.exports = 1\n'); fs.writeFileSync(path.join(root, 'gig.zip'), 'PK\u0003\u0004 a zip');
  const book = async (id, payload) => (await DOOR.handle('POST', '/api/raid/contracts/v2', { id, payload, by: 'raid' }, { dir: cdir })).json;
  const ask = (args) => RI.take({ text: 'fix the parser', from: 'cli', by: 'person', args }, { dir, book, decide: async () => ({ agent: 'ollama', reason: 'health=100' }) });
  const FULL = { system: 'idearium', hat: 'coder', command: 'repo.build', tags: ['phase:IN0', 'kind:fix'], outcome: { what: 'the parser accepts a trailing comma' },
    dag: [{ id: 'read', type: 'context', does: 'read the parser' }, { id: 'write', needs: ['read'] }, { id: 'prove', type: 'verification', needs: ['write'], pass_when: [{ test: 'tests/parser.test.js' }] }] };
  await t('RI-03', 'an input with a file: every field of the template filled, the file referenced by its hash, the DAG its gates, booked as RAID\'s v2 contract', async () => {
    const r = await RI.take({ text: 'fix the parser', from: 'cli', by: 'person', args: { contract: { ...FULL, data: [{ kind: 'file', path: path.join(root, 'src/parser.js') }] } } }, { dir, book, decide: async () => ({ agent: 'ollama', reason: 'health=100' }) });
    assert.ok(r.contract && r.contract.booked, JSON.stringify(r.contract)); assert.deepStrictEqual(r.contract.gaps, []);
    const L = CG.load(path.join(cdir, `${r.contract.id}.contract`)); const p = L.payload;
    assert.deepStrictEqual(p.template.system, 'idearium'); assert.strictEqual(p.template.agent.name, 'ollama'); assert.strictEqual(p.template.agent.why, 'health=100');
    assert.strictEqual(p.template.hat, 'coder'); assert.strictEqual(p.template.command, 'repo.build'); assert.strictEqual(p.template.input.id, r.id);
    assert.strictEqual(p.outcome.what, 'the parser accepts a trailing comma'); assert.strictEqual(p.endState, p.outcome.what, 'B1 endState mapped in');
    assert.deepStrictEqual(p.gates.map(g => g.id), ['template', 'data', 'read', 'write', 'prove']);
    assert.deepStrictEqual(p.outcome.done_when, [{ gate: 'read' }, { gate: 'write' }, { gate: 'prove' }], 'the DAG is the conditions');
    assert.deepStrictEqual(p.gates.find(g => g.id === 'write').depends_on, ['read']); assert.deepStrictEqual(p.gates.find(g => g.id === 'read').depends_on, ['data']);
    assert.match(p.refs['data-1'].hash, /^[0-9a-f]{64}$/);
    assert.ok(['input:' + r.id, 'system:idearium', 'hat:coder', 'phase:IN0'].every(x => p.tags.includes(x)), p.tags.join());
    const node = NE.fromYaml(fs.readFileSync(r.file, 'utf8')).payload; assert.strictEqual(node.contract.id, r.contract.id, 'the .input node names the contract it became');
  });
  await t('RI-04', 'an input with a zip and one with context from a DAG: referenced by path and hash, or by source and hash; never copied', async () => {
    const z = T.fill({ ...FULL, agent: { name: 'ollama' }, data: [{ kind: 'zip', path: 'gig.zip', entries: ['a', 'b'] }] }, { root });
    assert.ok(z.ok, z.problems.join('; ')); assert.match(z.payload.refs['data-1'].note, /zip, 2 entries/); assert.match(z.payload.refs['data-1'].hash, /^[0-9a-f]{64}$/);
    assert.deepStrictEqual(z.payload.gates.find(g => g.id === 'data').pass_when, [{ exists: 'gig.zip' }]);
    const c = T.fill({ ...FULL, agent: { name: 'ollama' }, data: [{ kind: 'context', source: 'docs/atlases/idearium-atlas.md', id: 'atlas', excerpt: 'the parser lives in idearium/lang' }] }, { root });
    assert.ok(c.ok, c.problems.join('; ')); assert.strictEqual(c.payload.refs['data-1'].path, 'docs/atlases/idearium-atlas.md'); assert.match(c.payload.refs['data-1'].hash, /^[0-9a-f]{64}$/);
    assert.ok(!JSON.stringify(c.payload).includes('module.exports'), 'contents are referenced, not copied');
    assert.deepStrictEqual(c.payload.gates.find(g => g.id === 'data').pass_when, [{ evidence: 'context:data-1' }]);
  });
  await t('RI-05', 'what the template cannot fill is a gap, named and put to him, blocking the first gate; never guessed', async () => {
    const r = await ask({});
    assert.ok(r.contract.booked, JSON.stringify(r.contract));
    assert.deepStrictEqual(r.contract.gaps, ['which system owns this work', 'what is invoked: a capability or a command', 'the end state: what must be true when it is done', 'what must be known or done first (the DAG)']);
    const v = (await DOOR.handle('GET', `/api/raid/contracts/v2/${r.contract.id}`, {}, { dir: cdir })).json;
    assert.strictEqual(v.complete, false); assert.ok(v.gaps.every(g => g.blocks[0] === 'template'));
    const missing = T.fill({ ...FULL, agent: { name: 'x' }, data: [{ kind: 'file', path: 'nope.txt' }] }, { root });
    assert.ok(missing.gaps.some(g => /the file nope.txt is not there/.test(g.missing)));
  });
  await t('RI-06', 'refused before booking: a tag outside the grammar, a DAG node naming one that is not there, a loop', async () => {
    const bad = T.fill({ ...FULL, agent: { name: 'x' }, tags: ['whatever'], dag: [{ id: 'a', needs: ['b'] }, { id: 'b', needs: ['a'] }, { id: 'c', needs: ['zz'] }] }, { root });
    assert.ok(!bad.ok); const all = bad.problems.join(' | ');
    assert.match(all, /tag "whatever" is not in the grammar/); assert.match(all, /needs "zz", which is not in the DAG/); assert.match(all, /gates loop/);
    const r = await ask({ contract: { ...FULL, tags: ['nope'] } }); assert.strictEqual(r.contract.booked, false); assert.ok(r.contract.problems.length);
    assert.strictEqual(T.TEMPLATE.length, 9);
  });
  await t('RI-07', 'his "only emerge based contracts that need emerges code": Emerge work is read by Emerge\'s own say (end state, gaps); other work never asks Emerge', async () => {
    // the real say, as Emerge's route runs it (eg say <words> --json); Cortex reaches it by route, here stood in by the same command
    const realSay = async (sentence) => { const r = require('child_process').spawnSync(process.execPath, [path.join(__dirname, '../../emerge/emerge/lang/eg.js'), 'say', sentence, '--json'], { encoding: 'utf8' }); return JSON.parse(r.stdout.trim().split('\n').pop()); };
    let asked = 0; const say = async (w) => { asked++; return realSay(w); };
    const words = 'a compartment called counter so that it counts the visits, never negative, at most 100';
    const r = await RI.take({ text: words, from: 'cli', by: 'person', args: { contract: { system: 'emerge', command: 'emerge.lang.build', dag: [{ id: 'write' }] } } }, { dir, book, say, decide: async () => ({ agent: 'ollama', reason: 'local' }) });
    assert.strictEqual(asked, 1); assert.ok(r.contract.booked, JSON.stringify(r.contract));
    const p = CG.load(path.join(cdir, `${r.contract.id}.contract`)).payload;
    assert.strictEqual(p.outcome.what, 'it counts the visits', 'the end state, read by Emerge from his words');
    assert.strictEqual(p.emerge.kind, 'compartment'); assert.strictEqual(p.emerge.name, 'Counter'); assert.ok(p.tags.includes('kind:emerge'));
    assert.ok(r.contract.gaps.some(g => /^Emerge: what at most applies to/.test(g)), r.contract.gaps.join(' | '));
    assert.ok(p.gaps.find(g => /what at most applies to/.test(g.missing)).hint, 'with the words that teach it');
    const plain = await RI.take({ text: 'fix the parser', from: 'cli', by: 'person', args: { contract: { ...FULL } } }, { dir, book, say, decide: async () => ({ agent: 'ollama' }) });
    assert.strictEqual(asked, 1, 'not Emerge work: Emerge is not asked'); assert.ok(!CG.load(path.join(cdir, `${plain.contract.id}.contract`)).payload.emerge);
    assert.ok(T.needsEmerge({ args: { files: ['x/y.eg'] } })); assert.ok(T.needsEmerge({}, { command: 'emerge.lang.run' })); assert.ok(!T.needsEmerge({}, { system: 'idearium' }));
    const down = await RI.take({ text: 'write it in emerge', from: 'cli', by: 'person', args: { contract: { emerge: true, system: 'emerge', command: 'emerge.lang.build', dag: [{ id: 'w' }], outcome: { what: 'x' } } } }, { dir, book, say: async () => { throw new Error('ECONNREFUSED'); }, decide: async () => ({ agent: 'ollama' }) });
    assert.ok(down.contract.gaps.some(g => /Emerge could not read it: ECONNREFUSED/.test(g)), 'Emerge down is a gap, said');
  });
  fs.rmSync(cdir, { recursive: true, force: true }); fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\n  ${p} passed, ${f} failed`); process.exit(f ? 1 : 0);
})();
