'use strict';
// tests/modules/test-build-from-the-spec.test.js — 0.39.305, docs/2026-10-05-build-from-the-spec-phasemap.spec.
// James (with i_want_to_make_a_daw_for_my_girl.zip): "here is an example of an idea i was trying to get built. like it
// needs to use the templates as default." · "like nexus needs to be able to build itself from the spec." · "nexus needs
// to be able to build itself from within also. i havce hundreds of specs i want built. that why i had the resuable
// architecture"
//
//   BS-01  SB1 every new document spec is framed by the standing templates (config specs.default_templates); the
//          frame is the shape, the section stays the agent's; templateIds: [] means none; a named template still seeds
//          verbatim; an unknown name in the config is said, not hidden; the config list is read live
//   BS-02  SB2 his words become the spec's: purpose ← idea + purpose, a spec-section id ← his, by 'author'; an agent's
//          section is kept; his later words update his own section
//   BS-03  SB3 the DAW case: the section prompt carries his words, the frame and short excerpts — no internal ids, no
//          "NEXUS component", no AXIOMS-v1.0, no earlier section pasted whole, the meta echo never passed on
//   BS-04  the real router: the workshop's save makes a repo whose spec is described and written by his words
require('../../lib/test-sandbox.js').ensure();

const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '../..');
let passed = 0, failed = 0;
async function test(id, name, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${name}\n    ${e.stack}`); failed++; }
}
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const quiet = async (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.log = l; console.warn = w; } };

// What the DAW spec's meta section came back as — the block every later section echoed.
const META_ECHO = '## Meta & Identity\n\n### 1.2 Failure Modes\n\n- **Component Not Found:** The component could not be found.\n\n' +
  '### 2.1 JAA Writes\n\n- **Component Creation:** created.\n\n- **comp_id:** `idearium.spec-engine`\n- **seam_id:** `idearium.spec-engine:v1:chunk:x:meta`';

async function main() {
  const se = (await imp('idearium/spec-engine/index.js')).default;
  const cfg = await imp('idearium/lib/config.js');
  const chunkOf = (m, id) => m.chunks.find(c => c.sectionId === id);

  await test('BS-01', 'SB1 the standing templates frame every new spec by default', async () => {
    const m = await quiet(() => se.createSpec({ name: 'Frame check', type: 'component', description: 'x' }));
    assert.deepStrictEqual(m.templateFrames, ['axioms', 'architecture', 'schemas', 'checklists']);
    assert.deepStrictEqual(m.templateFramesMissing, []);
    for (const [sid, tpl] of [['axioms', 'axioms'], ['schema', 'schemas'], ['failure_modes', 'checklists'], ['tests', 'checklists'], ['build_order', 'architecture']]) {
      const c = chunkOf(m, sid);
      assert.strictEqual(c.frame && c.frame.templateId, tpl, `${sid} framed by ${tpl}`);
      assert.ok(c.frame.text.length > 100, `${sid}'s frame is the template's text`);
      assert.strictEqual(c.status, 'pending', `${sid} stays the agent's to write`);
    }
    assert.match(chunkOf(m, 'axioms').frame.text, /Evidence/, 'the axioms frame is the shape to fill');
    assert.ok(!chunkOf(m, 'meta').frame && !chunkOf(m, 'purpose').frame, 'meta and purpose are never framed');
    assert.ok(m.chunks.every(c => c.status === 'pending'), 'a frame completes nothing');

    const none = await quiet(() => se.createSpec({ name: 'Frame none', templateIds: [] }));
    assert.deepStrictEqual(none.templateFrames, []); assert.ok(!none.chunks.some(c => c.frame), 'templateIds: [] means none');

    const named = await quiet(() => se.createSpec({ name: 'Frame named', templateIds: ['checklists'] }));
    assert.strictEqual(chunkOf(named, 'tests').status, 'complete', 'a named template still seeds verbatim');
    assert.strictEqual(chunkOf(named, 'tests').agent, 'template');
    assert.strictEqual(chunkOf(named, 'axioms').frame.templateId, 'axioms', 'and the defaults still frame the rest');

    const set = cfg.setConfig('specs.default_templates', ['axioms', 'no-such-template']);
    assert.ok(!set || !set.error, JSON.stringify(set));
    try {
      const live = await quiet(() => se.createSpec({ name: 'Frame live' }));
      assert.deepStrictEqual(live.templateFrames, ['axioms'], 'the config is read live');
      assert.deepStrictEqual(live.templateFramesMissing, ['no-such-template'], 'an unknown name is said');
      assert.ok(!chunkOf(live, 'tests').frame);
    } finally { cfg.resetConfig('specs.default_templates'); }
  });

  await test('BS-02', 'SB2 his words become the spec\'s; an agent\'s section is kept', async () => {
    const m = await quiet(() => se.createSpec({ name: 'i want to make a daw for my girl' }));
    // an agent already wrote the schema section
    await quiet(() => se.completeChunk(m.uuid, chunkOf(m, 'schema').uuid, 'Project, Track, Clip, Pattern.'));
    const r = await quiet(() => se.setAuthorWords(m.uuid, [
      { id: 'idea', title: 'The idea', body: 'i want to make a daw for my girl' },
      { id: 'purpose', title: 'Purpose', body: 'i want to make a edm song for my girl.' },
      { id: 'schema', title: 'Schema', body: 'songs and loops' },
      { id: 'vibe', title: 'Vibe', body: 'pink, simple, big pads' },
      { id: 'api', title: 'API', body: '   ' },
    ]));
    assert.deepStrictEqual(r.written, ['purpose']); assert.deepStrictEqual(r.kept, ['schema']); assert.strictEqual(r.words, 4);
    let s = se.loadSpec(m.uuid);
    const p = chunkOf(s, 'purpose');
    assert.strictEqual(p.status, 'complete'); assert.strictEqual(p.agent, 'author');
    assert.match(p.content, /daw for my girl/); assert.match(p.content, /edm song for my girl/);
    assert.strictEqual(chunkOf(s, 'schema').content, 'Project, Track, Clip, Pattern.', 'an agent\'s section is never overwritten');
    assert.strictEqual(s.authorWords.sections.length, 4, 'every word is kept for the agents, the vibe included');
    // his later words update his own section
    const r2 = await quiet(() => se.setAuthorWords(m.uuid, [{ id: 'purpose', title: 'Purpose', body: 'an edm song, and the daw to make it in' }]));
    assert.deepStrictEqual(r2.written, ['purpose']);
    s = se.loadSpec(m.uuid);
    assert.strictEqual(chunkOf(s, 'purpose').content, 'an edm song, and the daw to make it in');
    const r3 = await quiet(() => se.setAuthorWords(m.uuid, [{ id: 'purpose', title: 'Purpose', body: 'an edm song, and the daw to make it in' }]));
    assert.deepStrictEqual(r3.written, [], 'unchanged words write nothing');
    // his words are his spec's — never handed to another spec as a reused section
    const other = await quiet(() => se.createSpec({ name: 'Some other idea' }));
    const prior = se.findPriorSection('purpose', chunkOf(other, 'purpose').sectionDesc, other.uuid);
    assert.ok(!prior || !/daw to make it in/.test(prior.content), 'an author section is never reused across specs');
  });

  await test('BS-03', 'SB3 the DAW case: the section prompt is about the DAW, in his words', async () => {
    const m = await quiet(() => se.createSpec({ name: 'i want to make a daw for my girl', description: 'i want to make a daw for my girl' }));
    await quiet(() => se.setAuthorWords(m.uuid, [{ id: 'idea', title: 'The idea', body: 'i want to make a daw for my girl' }, { id: 'purpose', title: 'Purpose', body: 'i want to make a edm song for my girl.' }]));
    let s = se.loadSpec(m.uuid);
    await quiet(() => se.completeChunk(m.uuid, chunkOf(s, 'meta').uuid, META_ECHO));
    await quiet(() => se.completeChunk(m.uuid, chunkOf(s, 'schema').uuid, 'Track: id, name, clips[]. Clip: start, length, sample. ' + 'x'.repeat(5000)));
    s = se.loadSpec(m.uuid);
    const prompt = se.buildChunkPrompt(s, chunkOf(s, 'axioms'));
    assert.match(prompt, /edm song for my girl/, 'his words');
    assert.match(prompt, /THE SHAPE THIS SECTION FOLLOWS \(the "axioms" template/, 'the frame');
    assert.match(prompt, /Evidence/);
    for (const banned of [/comp_id/, /seam_id/, /contract_id/, /NEXUS component spec/, /AXIOMS-v1\.0/, /JAA Writes/, /idearium\.spec-engine/]) {
      assert.ok(!banned.test(prompt), `the prompt carries no ${banned}`);
    }
    assert.ok(!prompt.includes('Component Not Found'), 'the meta echo is never passed on');
    const later = se.buildChunkPrompt(s, chunkOf(s, 'registry'));
    assert.ok(!/THE SHAPE THIS SECTION FOLLOWS/.test(later), 'a section with no frame has none');
    assert.match(later, /edm song for my girl/);
    assert.match(later, /Track: id, name/, 'an earlier section is excerpted');
    assert.ok(!later.includes('x'.repeat(3500)), 'never pasted whole');
    assert.ok(!later.includes('Component Not Found') && !/comp_id|JAA Writes/.test(later), 'the meta echo is never passed on');
    assert.ok(prompt.length < 12000 && later.length < 12000, `bounded (${prompt.length}, ${later.length})`);
  });

  // ── the real router ──
  process.env.NEXUS_VERSIONIUM_URL = 'http://127.0.0.1:9';
  const api = await imp('idearium/api/index.js');
  const R = (m, p, b) => quiet(() => api._route(m, p, b));

  await test('BS-04', 'the workshop\'s save: a repo whose spec is described and written by his words', async () => {
    const c = await R('POST', '/api/workshop', { from: { kind: 'blank' }, title: 'i want to make a daw for my girl' });
    assert.strictEqual(c.status, 200, JSON.stringify(c.json));
    const w = c.json.workshop;
    const u = await R('POST', `/api/workshop/${w.uuid}`, { sections: [{ id: 'purpose', body: 'i want to make a edm song for my girl.' }] });
    assert.strictEqual(u.status, 200, JSON.stringify(u.json));
    const sv = await R('POST', `/api/workshop/${w.uuid}/save`, {});
    assert.strictEqual(sv.status, 200, JSON.stringify(sv.json));
    assert.strictEqual(sv.json.madeRepo, 'new');
    assert.deepStrictEqual(sv.json.authored && sv.json.authored.written, ['purpose'], JSON.stringify(sv.json.authored));
    const repo = api.getRepoLayer().get(sv.json.repoUuid);
    const spec = se.loadSpec(repo.specUuid);
    assert.strictEqual(spec.description, 'i want to make a edm song for my girl.', 'described by his words, not "bare repo: …"');
    assert.strictEqual(chunkOf(spec, 'purpose').agent, 'author');
    assert.match(chunkOf(spec, 'purpose').content, /edm song for my girl/);
    assert.deepStrictEqual(spec.templateFrames, ['axioms', 'architecture', 'schemas', 'checklists'], 'and framed by the templates');
    // his next words reach it too
    await R('POST', `/api/workshop/${w.uuid}`, { sections: [{ id: 'purpose', body: 'an edm song, and the daw to make it in' }] });
    const sv2 = await R('POST', `/api/workshop/${w.uuid}/save`, {});
    assert.strictEqual(sv2.json.madeRepo, null);
    assert.strictEqual(chunkOf(se.loadSpec(repo.specUuid), 'purpose').content, 'an edm song, and the daw to make it in');
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
