'use strict';
// tests/modules/test-spec-workshop.test.js — 0.39.294 SW1, docs/2026-10-02-workshop-codex-rewind-phasemap.spec.
// James: "need the spec workshop, completely destroy the spec builder, and build the spec workshop" · "the workshop and
// maybe it hooks into the spec field" · "ai assited or manual … levels of ambitoiun higher is more outside the box. the
// user is the idea generator … open loops, outside the box questions, what ifs, d20 cross domain dice … reverse causal
// chain … inspiration from nexus".
//
//   WS-01  a session: sections from what it starts from; edit, add, remove (kept), restore
//   WS-02  the d20: twenty domains, the roll names one and its mechanism; the dial changes the agent's instructions
//   WS-03  the agent only proposes: proposals are apart from the sections; accept (append / replace keeps the old /
//          new section), dismiss, reopen; a failed agent is said and adds nothing
//   WS-04  the spec file: reads the library form, other YAML and Markdown; specText → sectionsFromSpecText round-trips
//   WS-05  the real router: sources, create from an idea, feed (a stand-in agent), decide, save → a NEW repo with
//          spec/<slug>.spec; reopen from that repo reads the same sections back (the Spec field)
//   WS-06  from the spec library: save goes into the document's repo (the 0.39.292 pipeline), the library row knows it
//   WS-07  the surfaces: routes + caps, the page served, the CLI, Welcome / idea / Spec tab / library entry points; the
//          page (0.39.297 SW2): the Void's shared look, capitals (no lowercase tooltip, no browser prompt), the spec-shaping asks only
//   WS-08  0.39.297 SW2 — the dial in his words; section ≤ 20000 / title ≤ 160; an idea's Void dials at the start
require('../../lib/test-sandbox.js').ensure();

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '../..');
const yaml = require('js-yaml');
let passed = 0, failed = 0;
async function test(id, name, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${name}\n    ${e.stack}`); failed++; }
}
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);

async function main() {
  const WS = await imp('idearium/lib/workshop.js');

  await test('WS-01', 'a session: sections, edit, add, remove (kept), restore', () => {
    assert.ok(WS.makeSession({ title: '' }).error, 'a title is required');
    const { session: s } = WS.makeSession({ title: 'Orbit Garden', source: { kind: 'idea', id: 'i1' }, sections: [{ id: 'idea', title: 'The idea', body: '<!-- imported: x -->\n\nA garden by sunlight.' }, { id: 'idea', title: 'Again', body: '' }] });
    assert.deepStrictEqual(s.sections.map(x => x.id), ['idea', 'idea-2'], 'ids stay unique');
    assert.strictEqual(s.sections[0].body, 'A garden by sunlight.', 'the import tag is not part of the text');
    const blank = WS.makeSession({ title: 'Blank' }).session;
    assert.deepStrictEqual(blank.sections.map(x => x.id), ['purpose']);
    WS.editSection(s, { id: 'idea', body: 'A garden that plans by sunlight hours.' });
    assert.strictEqual(s.sections[0].by, 'james');
    const add = WS.editSection(s, { add: true, title: 'Beds', after: 'idea' });
    assert.strictEqual(s.sections[1].id, 'beds', 'added after the one asked');
    WS.editSection(s, { id: 'beds', remove: true });
    assert.ok(!s.sections.find(x => x.id === 'beds') && s.removed.find(x => x.id === 'beds'), 'removed is kept (§0.3)');
    WS.restoreSection(s, 'beds');
    assert.ok(s.sections.find(x => x.id === 'beds') && !s.removed.length);
    assert.ok(WS.editSection(s, { id: 'nope', body: 'x' }).error);
    assert.ok(add.section && s.history.length >= 3);
  });

  await test('WS-02', 'the d20 and the ambition dial', () => {
    assert.strictEqual(WS.DOMAINS.length, 20);
    assert.deepStrictEqual(WS.rollD20(() => 0).roll, 1); assert.strictEqual(WS.rollD20(() => 0.9999).roll, 20);
    const r = WS.rollD20(() => 0.12);
    assert.strictEqual(r.domain, WS.DOMAINS[r.roll - 1].domain);
    const { session: s } = WS.makeSession({ title: 'Workbench', sections: [{ id: 'purpose', title: 'Purpose', body: 'A bench.' }], ambition: 1 });
    const d = WS.feedPrompt(s, 'd20', { roll: { roll: 7, ...WS.DOMAINS[6] } });
    assert.match(d.prompt, /rolled 7: cooking/); assert.match(d.prompt, /mise en place/); assert.strictEqual(d.meta.domain, 'cooking');
    assert.match(d.prompt, /James is the idea generator; you only propose/);
    const low = WS.feedPrompt(s, 'what-ifs').prompt; s.ambition = 5; const high = WS.feedPrompt(s, 'what-ifs').prompt;
    assert.match(low, /Ambition 1 of 5 \(normal\)/); assert.match(high, /Ambition 5 of 5 \(outlier\)/); assert.notStrictEqual(low, high);
    assert.match(WS.feedPrompt(s, 'reverse-chain').prompt, /workbench that automatically clears off/);
    assert.match(WS.feedPrompt(s, 'inspiration', { inspiration: [{ title: 'RHEON STUDIO', summary: 'templates' }] }).prompt, /RHEON STUDIO/);
    assert.ok(WS.feedPrompt(s, 'section').error, 'drafting needs a section');
    assert.ok(WS.feedPrompt(s, 'nonsense').error);
    assert.strictEqual(WS.clampAmbition(9), 3); assert.strictEqual(WS.clampAmbition('2'), 2);
  });

  await test('WS-03', 'the agent only proposes; James decides', async () => {
    const { session: s } = WS.makeSession({ title: 'Garden', sections: [{ id: 'purpose', title: 'Purpose', body: 'Plan beds.' }] });
    const before = JSON.stringify(s.sections);
    WS.setAsk(async (prompt) => ({ ok: true, text: 'Here are some ideas:\n- What if beds moved with the sun?\n2) What if water followed the shade?\n' }));
    const r = await WS.feed(s, 'what-ifs');
    assert.strictEqual(r.added.length, 2, JSON.stringify(r.added)); assert.strictEqual(JSON.stringify(s.sections), before, 'the sections are untouched');
    assert.ok(r.added.every(p => p.status === 'open' && p.ambition === 3));
    const a1 = WS.decide(s, r.added[0].uuid, { action: 'accept', sectionId: 'purpose' });
    assert.match(a1.section.body, /Plan beds\.\n\n- What if beds moved with the sun\?/);
    assert.ok(WS.decide(s, r.added[0].uuid, { action: 'accept', sectionId: 'purpose' }).error, 'not twice');
    const a2 = WS.decide(s, r.added[1].uuid, { action: 'accept', mode: 'new', title: 'Water' });
    assert.strictEqual(a2.section.title, 'Water'); assert.strictEqual(a2.section.by, 'agent, accepted by james');
    WS.setAsk(async () => ({ ok: true, text: 'Purpose: a planner that schedules beds by measured sunlight.' }));
    const d = await WS.feed(s, 'section', { sectionId: 'purpose' });
    assert.strictEqual(d.added.length, 1, 'a draft is one proposal');
    const rep = WS.decide(s, d.added[0].uuid, { action: 'accept', mode: 'replace', sectionId: 'purpose' });
    assert.match(rep.section.body, /^Purpose: a planner/); assert.match(rep.section.prior[0].body, /Plan beds/, 'the old text is kept');
    WS.setAsk(async () => ({ ok: true, text: 'one\ntwo' }));
    const q = await WS.feed(s, 'questions');
    WS.decide(s, q.added[0].uuid, { action: 'dismiss' }); assert.strictEqual(q.added[0].status, 'dismissed');
    WS.decide(s, q.added[0].uuid, { action: 'reopen' }); assert.strictEqual(q.added[0].status, 'open');
    const n = s.proposals.length;
    WS.setAsk(async () => ({ ok: false, error: 'copilot unreachable' }));
    const bad = await WS.feed(s, 'open-loops');
    assert.match(bad.error, /did not answer: copilot unreachable/); assert.strictEqual(s.proposals.length, n, 'nothing added on a failure');
    WS.setAsk(null);
    assert.match((await WS.feed(s, 'open-loops')).error, /no agent connected/);
  });

  await test('WS-04', 'the spec file round-trips; other shapes are read', () => {
    const { session: s } = WS.makeSession({ title: 'Garden', sections: [{ id: 'purpose', title: 'Purpose', body: 'Plan beds.\n\nBy sun.' }, { id: 'water', title: 'Water', body: 'Drip.' }], ambition: 4 });
    const text = WS.specText(s, yaml);
    assert.match(text, /^# Garden — made in the spec workshop/);
    const doc = yaml.load(text); assert.strictEqual(doc.spec.name, 'Garden'); assert.match(doc.spec.ambition, /^4/);
    assert.deepStrictEqual(WS.sectionsFromSpecText(text, yaml).map(x => [x.id, x.body]), [['purpose', 'Plan beds.\n\nBy sun.'], ['water', 'Drip.']]);
    const other = WS.sectionsFromSpecText('spec:\n  meta:\n    name: X\n  purpose: Do x.\n', yaml);
    assert.ok(other.length === 1 || other.length === 2);
    const top = WS.sectionsFromSpecText('meta:\n  name: X\npurpose: Do x.\n', yaml);
    assert.deepStrictEqual(top.map(x => x.id), ['meta', 'purpose']); assert.strictEqual(top[1].body, 'Do x.');
    const md = WS.sectionsFromSpecText('# T\n\nintro\n\n## A\none\n\n## B\ntwo\n', yaml);
    assert.deepStrictEqual(md.map(x => x.title), ['Preamble', 'A', 'B']);
    assert.deepStrictEqual(WS.sectionsFromSpecText('', yaml), []);
  });

  // ── the real router ──
  process.env.NEXUS_VERSIONIUM_URL = 'http://127.0.0.1:9';
  const api = await imp('idearium/api/index.js');
  const R = (m, p, b) => api._route(m, p, b);
  const { getIdeaOS } = await imp('idearium/core/index.js');
  const os = getIdeaOS();

  await test('WS-05', 'the router: from an idea → feed → decide → save into a new repo → reopen from its Spec field', async () => {
    const l0 = await R('GET', '/api/workshop');   // loads the module (it installs the real agent) — the stand-in goes in after
    assert.strictEqual(l0.status, 200, JSON.stringify(l0.json));
    WS.setAsk(async (prompt) => ({ ok: true, text: /d20 rolled/.test(prompt) ? 'Beds that remember last year\'s blight\nA watering rota like immune memory' : 'Who tends it when you travel?\nWhat breaks first in a drought?', by: 'stand-in' }));
    os.emit('idearium.idea.create', { text: 'Orbit garden — a planner that schedules beds by sunlight hours', tags: ['test'], source: 'test' });
    const idea = [...os.db.ideas].reverse().find(i => /^Orbit garden/.test(i.text));
    const src = await R('GET', '/api/workshop/sources');
    assert.ok(src.json.ideas.find(i => i.uuid === idea.uuid), 'the idea is offered');
    const c = await R('POST', '/api/workshop', { from: { kind: 'idea', id: idea.uuid }, ambition: 5 });
    assert.strictEqual(c.status, 200, JSON.stringify(c.json));
    const w = c.json.workshop;
    assert.strictEqual(w.title, 'Orbit garden'); assert.strictEqual(w.ambition, 5); assert.strictEqual(w.ideaUuid, idea.uuid);
    assert.deepStrictEqual(w.sections.map(x => x.id), ['idea', 'purpose']);
    const u = await R('POST', `/api/workshop/${w.uuid}`, { sections: [{ id: 'purpose', body: 'Plan beds by measured sun.' }, { add: true, title: 'Beds' }] });
    assert.strictEqual(u.json.workshop.sections.length, 3);
    const f = await R('POST', `/api/workshop/${w.uuid}/feed`, { kind: 'd20' });
    assert.strictEqual(f.status, 200, JSON.stringify(f.json)); assert.ok(f.json.meta.domain && f.json.added.length === 2);
    assert.strictEqual(f.json.workshop.sections.find(x => x.id === 'purpose').body, 'Plan beds by measured sun.', 'a feed writes no section');
    const dd = await R('POST', `/api/workshop/${w.uuid}/proposal/${f.json.added[1].uuid}`, { action: 'accept', sectionId: 'purpose' });
    assert.strictEqual(dd.status, 200, JSON.stringify(dd.json)); assert.match(dd.json.section.body, /immune memory/);
    const bad = await R('POST', `/api/workshop/${w.uuid}/feed`, { kind: 'bogus' });
    assert.strictEqual(bad.status, 400);
    const sv = await R('POST', `/api/workshop/${w.uuid}/save`, {});
    assert.strictEqual(sv.status, 200, JSON.stringify(sv.json));
    assert.strictEqual(sv.json.madeRepo, 'new'); assert.strictEqual(sv.json.specPath, 'spec/orbit-garden.spec');
    const repo = api.getRepoLayer().get(sv.json.repoUuid);
    assert.ok(repo, 'a real repo'); assert.strictEqual(repo.ideaUuid, idea.uuid, 'the idea is the repo\'s idea');
    const file = api.getRepoLayer().readFile(sv.json.repoUuid, 'spec/orbit-garden.spec');
    assert.ok(!file.error, file.error); assert.match(file.content, /immune memory/);
    // saving again writes the same file, no second repo
    const sv2 = await R('POST', `/api/workshop/${w.uuid}/save`, {});
    assert.strictEqual(sv2.json.repoUuid, sv.json.repoUuid); assert.strictEqual(sv2.json.madeRepo, null); assert.strictEqual(sv2.json.created, false);
    // the Spec field: a workshop opened from that repo reads the same sections back
    const src2 = await R('GET', '/api/workshop/sources');
    const offered = src2.json.repos.find(r => r.uuid === sv.json.repoUuid);
    assert.deepStrictEqual(offered && offered.specFiles, ['spec/orbit-garden.spec']);
    const c2 = await R('POST', '/api/workshop', { from: { kind: 'repo', id: sv.json.repoUuid } });
    assert.strictEqual(c2.status, 200, JSON.stringify(c2.json));
    assert.deepStrictEqual(c2.json.workshop.sections.map(x => x.title), sv2.json.workshop.sections.map(x => x.title));
    assert.strictEqual(c2.json.workshop.specPath, 'spec/orbit-garden.spec');
    const l = await R('GET', '/api/workshop');
    assert.ok(l.json.workshops.find(x => x.uuid === w.uuid && x.specPath === 'spec/orbit-garden.spec'));
    assert.strictEqual((await R('GET', '/api/workshop/nope')).status, 404);
    assert.strictEqual((await R('POST', '/api/workshop', { from: { kind: 'idea', id: 'nope' } })).status, 404);
  });

  await test('WS-06', 'from the spec library: saved into the document\'s own repo', async () => {
    const Zip = require(path.join(ROOT, 'lib/zip.js'));
    const LI = await imp('idearium/lib/spec-library-import.js');
    const se = await imp('idearium/spec-engine/index.js');
    const MD = '# TIDE CLOCK\n\nA clock that tells the tide.\n\n## Face\nRound.\n\n## Data\nLocal tables.\n';
    const r = await LI.importLibrary({ buf: Zip.create([{ path: 'TIDE-CLOCK.md', data: Buffer.from(MD) }]), name: 't.zip', se, os });
    assert.strictEqual(r.failed.length, 0, JSON.stringify(r.failed));
    const row = LI.listLibrary().find(x => x.title === 'TIDE CLOCK');
    const c = await R('POST', '/api/workshop', { from: { kind: 'library', id: row.sha } });
    assert.strictEqual(c.status, 200, JSON.stringify(c.json));
    const w = c.json.workshop;
    assert.deepStrictEqual(w.sections.map(x => x.title), ['preamble', 'Face', 'Data'], 'the document\'s own headings');
    assert.ok(!w.sections.some(x => /<!-- imported/.test(x.body)));
    await R('POST', `/api/workshop/${w.uuid}`, { sections: [{ id: 'face', body: 'Round, with a moon hand.' }] });
    const sv = await R('POST', `/api/workshop/${w.uuid}/save`, {});
    assert.strictEqual(sv.status, 200, JSON.stringify(sv.json));
    assert.strictEqual(sv.json.madeRepo, 'library'); assert.strictEqual(sv.json.specPath, 'spec/tide-clock.spec');
    const lib = LI.listLibrary().find(x => x.sha === row.sha);
    assert.strictEqual(lib.repoUuid, sv.json.repoUuid, 'the library row knows its repo');
    const file = api.getRepoLayer().readFile(sv.json.repoUuid, 'spec/tide-clock.spec');
    assert.match(file.content, /moon hand/); assert.match(file.content, /made in the spec workshop/);
  });

  await test('WS-07', 'the surfaces', () => {
    const A = fs.readFileSync(path.join(ROOT, 'idearium/api/index.js'), 'utf8');
    for (const [m, segs, act] of [['GET', "'api','workshop'", 'workshop.list'], ['POST', "'api','workshop'", 'workshop.create'], ['POST', "'api','workshop',':id','feed'", 'workshop.feed'],
      ['POST', "'api','workshop',':id','proposal',':pid'", 'workshop.decide'], ['POST', "'api','workshop',':id','save'", 'workshop.save']]) {
      assert.ok(new RegExp(`\\['${m}',\\s*\\[${segs.replace(/[[\]()]/g, '\\$&')}\\],\\s*'${act.replace('.', '\\.')}'\\]`).test(A), `${m} ${segs}`);
      assert.match(A, new RegExp(`'${act.replace('.', '\\.')}':\\s*CAPS\\.`));
    }
    assert.match(A, /cleanUrl === '\/workshop\.html'/);
    assert.match(A, /channel: 'idearium-workshop'/, 'the same copilot route the repo agents use');
    // 0.39.297 SW2 — its own page in the Void's look (James: "I hate that ui you made … all of it needs to be isolated,
    // in its own pages" · "no lowercase. and make sure its enterprise grade")
    const page = fs.readFileSync(path.join(ROOT, 'idearium/ui/workshop.html'), 'utf8');
    assert.match(page, /js\/window-chrome\.js/); assert.match(page, /href="css\/void-theme\.css"/, 'the Void\'s look, shared'); assert.match(page, /src="js\/void-sky\.js"/);
    assert.match(page, /<title>THE SPEC WORKSHOP<\/title>/); assert.match(page, /data-title="THE SPEC WORKSHOP"/);
    for (const k of ['section', 'open-loops', 'questions']) assert.ok(page.includes(`data-k="${k}"`), k);
    for (const k of ['d20', 'reverse-chain', 'what-ifs', 'inspiration']) assert.ok(!page.includes(`data-k="${k}"`), `${k} belongs to the Void`);
    const tips = [...page.matchAll(/title="([^"$]*)"/g)].map(m => m[1]).filter(t => /[a-z]/.test(t));
    assert.deepStrictEqual(tips, [], 'no lowercase tooltip');
    const code = page.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    assert.ok(!/\bprompt\(|\bconfirm\(/.test(code), 'no browser prompt()/confirm() — they speak lowercase');
    for (const st of ['OPENING THE WORKSHOP', 'THE WORKSHOP IS UNREACHABLE']) assert.ok(page.includes(st), st);
    assert.match(page, /const AGENT_MS = 330000/); assert.match(page, /maxlength="20000"/);
    assert.match(page, /\['NORMAL'.*\['CREATIVE'.*\['OUTSIDE THE BOX'.*\['NOVEL'.*\['OUTLIER'/s, 'the dial in his words');
    const theme = fs.readFileSync(path.join(ROOT, 'idearium/ui/css/void-theme.css'), 'utf8');
    assert.match(theme, /html \{ text-transform: uppercase; \}/); assert.match(theme, /url\(\.\.\/fonts\/bebas-neue-400\.woff2\)/);
    const app = fs.readFileSync(path.join(ROOT, 'idearium/ui/js/app.js'), 'utf8');
    assert.match(app, /function openWorkshop\(/); assert.match(app, /openWorkshop\('repo:\$\{repo\.uuid\}'\)/, 'the Spec tab'); assert.match(app, /openWorkshop\('idea:\$\{idea\.uuid\}'\)/, 'an idea');
    assert.match(fs.readFileSync(path.join(ROOT, 'idearium/ui/index.html'), 'utf8'), /onclick="openWorkshop\(\)"[^>]*>Spec workshop</);
    assert.match(fs.readFileSync(path.join(ROOT, 'idearium/ui/spec-library.html'), 'utf8'), /nexus:workshop\.open/);
    const cli = fs.readFileSync(path.join(ROOT, 'idearium/cli/index.js'), 'utf8');
    for (const c of ['list', 'new', 'show', 'write', 'ambition', 'feed', 'accept', 'dismiss', 'save']) assert.match(cli, new RegExp(`async 'workshop\\.${c}'`));
  });

  await test('WS-08', '0.39.297 SW2 — the dial in his words, the limits, the Void\'s dials at the start', async () => {
    assert.deepStrictEqual([1, 2, 3, 4, 5].map(n => WS.AMBITION[n].label), ['normal', 'creative', 'outside the box', 'novel', 'outlier']);
    const { session: s } = WS.makeSession({ title: 'Limits' });
    assert.match(WS.editSection(s, { id: 'purpose', body: 'z'.repeat(20001) }).error, /limit is 20000/);
    assert.match(WS.editSection(s, { id: 'purpose', title: 't'.repeat(161) }).error, /limit is 160/);
    assert.ok(!WS.editSection(s, { id: 'purpose', body: 'fine' }).error);
    const c = await R('POST', '/api/workshop', { from: { kind: 'blank' }, title: 'Limits' });
    const long = await R('POST', `/api/workshop/${c.json.workshop.uuid}`, { title: 'q'.repeat(161) });
    assert.strictEqual(long.status, 400);
    const big = await R('POST', `/api/workshop/${c.json.workshop.uuid}`, { sections: [{ id: 'purpose', body: 'z'.repeat(20001) }] });
    assert.strictEqual(big.status, 400);
    const v = await R('POST', '/api/void/idea', { text: 'An idea from the void for the workshop', creativity: 4, stability: 1 });
    const src = await R('GET', '/api/workshop/sources');
    const it = src.json.ideas.find(i => i.uuid === v.json.idea.uuid);
    assert.deepStrictEqual(it && it.void, { creativity: 4, stability: 1, tension: 3 }, 'the Void\'s dials come with the idea');
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
