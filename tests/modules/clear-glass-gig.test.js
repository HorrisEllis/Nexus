'use strict';
/**
 * tests/modules/clear-glass-gig.test.js — 0.39.301, the Fiverr gig writer (clear-glass/src/autofill/gig.js).
 * James: "I just want it to write gigs for me. Not automate talking or posting." · "No. I want ClearGlass to use autofill."
 *
 *   GG-01  the prompt: built from the profile's facts and his one line; refuses an empty offer / no profile; forbids
 *          inventing experience; with an empty profile it says to claim none
 *   GG-02  parseGig: JSON out of a chatty reply; "I will" ensured; every limit held (title 80, description 1200,
 *          5 tags of ≤20, package name 35 / description 100, price ≥ 5) and every cut reported, never silent
 *   GG-03  parseGig refuses a reply with no JSON or no title; warns when prices do not rise basic → premium
 *   GG-04  gigParts / gigText: every part, in the editor's order, each with its own label
 *   GG-05  matchGigFields: title/tags/description by label; three package names taken in page order (basic,
 *          standard, premium); FAQ pairs in order; dropdowns (select) and buttons left alone; "I will" not typed twice
 *   GG-06  fillGig through a stand-in dom bridge: only value mutations, nothing clicked or submitted; low-confidence
 *          (placeholder-only) matches left by default; what was not filled is listed as left to copy
 *   GG-07  wired: registry components, IPC handlers, preload, REST doors, event taxonomy (valid ET1), loom map,
 *          generated nodes, the settings panel — and no handler path calls submit/click/publish
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const G = require('../../clear-glass/src/autofill/gig.js');

let passed = 0, failed = 0;
async function test(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.message}`); failed++; }
}

const PROFILE = { id: 'p1', label: 'Me', fields: { headline: 'I turn ideas into working tools', skills: 'websites, automation, AI assistants', summary: 'Systems thinker who builds with AI and proves every delivery works.' }, documents: {} };
const REPLY = 'Sure! Here is your gig:\n```json\n' + JSON.stringify({
  title: 'build a clean, fast website for your small business',
  category: 'Programming & Tech', subcategory: 'Website Development',
  tags: ['#Website', 'small business website', 'landing page', 'website', 'a very very long tag that is too long', 'wordpress alternative', 'fast site'],
  description: 'You get a clean website. '.repeat(70),
  packages: {
    basic: { name: 'One page', description: 'A single landing page with your text and images', deliveryDays: 3, revisions: 1, price: 40 },
    standard: { name: 'Up to 4 pages', description: 'Home, about, services and contact pages, mobile friendly', deliveryDays: '5', revisions: '2', price: '$90' },
    premium: { name: 'A full small-business site with a booking form and everything', description: 'x'.repeat(140), deliveryDays: 0, revisions: 'unlimited', price: 2 },
  },
  faq: [{ question: 'Do I need hosting?', answer: 'I can deploy it to free hosting for you.' }, { q: 'Can I edit it later?', a: 'Yes, I hand over everything.' }],
  requirements: ['What is your business name?', { question: 'Send your logo and photos.' }],
}) + '\n```\nLet me know!';

(async () => {
  console.log('\nclear-glass-gig — the Fiverr gig writer (0.39.301)');

  await test('GG-01', 'the prompt is built from his line and his profile, and never lets the model invent', async () => {
    assert.strictEqual(G.buildGigPrompt({ profile: null, offer: 'websites for shops' }).error, 'pick an autofill profile');
    assert.match(G.buildGigPrompt({ profile: PROFILE, offer: 'x' }).error, /say in a line/);
    const { prompt } = G.buildGigPrompt({ profile: PROFILE, offer: 'simple websites for small businesses', extra: 'keep basic under $40' });
    assert.match(prompt, /simple websites for small businesses/);
    assert.match(prompt, /Skills: websites, automation, AI assistants/);
    assert.match(prompt, /Never invent clients, reviews, years/);
    assert.match(prompt, /Output ONLY a JSON object/);
    assert.match(prompt, /keep basic under \$40/);
    const bare = G.buildGigPrompt({ profile: { fields: {} }, offer: 'simple websites for small businesses' }).prompt;
    assert.match(bare, /do not claim any experience at all/);
  });

  let gig;
  await test('GG-02', 'parseGig holds every Fiverr limit and says every cut', async () => {
    const r = G.parseGig(REPLY);
    assert.ok(r.ok, r.error); gig = r.gig;
    assert.ok(gig.title.startsWith('I will '), gig.title);
    assert.ok(gig.title.length <= G.LIMITS.title);
    assert.ok(gig.tags.length <= 5 && gig.tags.every(t => t.length <= 20 && !t.startsWith('#') && t === t.toLowerCase()), JSON.stringify(gig.tags));
    assert.strictEqual(new Set(gig.tags).size, gig.tags.length, 'no duplicate tags ("#Website" and "website")');
    assert.ok(gig.description.length <= 1200);
    assert.ok(gig.packages.premium.name.length <= 35 && gig.packages.premium.description.length <= 100);
    assert.strictEqual(gig.packages.standard.price, 90); assert.strictEqual(gig.packages.standard.deliveryDays, 5);
    assert.strictEqual(gig.packages.premium.revisions, 'unlimited');
    assert.ok(gig.packages.premium.price >= 5 && gig.packages.premium.deliveryDays >= 1);
    assert.strictEqual(gig.faq.length, 2); assert.strictEqual(gig.faq[1].question, 'Can I edit it later?');
    assert.deepStrictEqual(gig.requirements, ['What is your business name?', 'Send your logo and photos.']);
    const w = r.warnings.join(' | ');
    for (const re of [/added/, /description was \d+ characters/, /premium package name/, /premium package description/, /premium price/, /premium delivery days/, /over 20 characters/])
      assert.match(w, re, `a warning for ${re}: ${w}`);
    const many = G.parseGig(JSON.stringify({ title: 'I will help', tags: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }));
    assert.deepStrictEqual(many.gig.tags, ['a', 'b', 'c', 'd', 'e']); assert.match(many.warnings.join(' '), /7 tags; kept the first 5/);
  });

  await test('GG-03', 'no JSON, no title → refused; prices that do not rise → said', async () => {
    assert.strictEqual(G.parseGig('I could not do that').ok, false);
    assert.strictEqual(G.parseGig('{"tags":["a"]}').ok, false);
    const r = G.parseGig(JSON.stringify({ title: 'I will help', description: 'd', packages: { basic: { name: 'a', description: 'b', deliveryDays: 2, revisions: 1, price: 50 }, standard: { name: 'c', description: 'd', deliveryDays: 3, revisions: 1, price: 40 } } }));
    assert.ok(r.ok); assert.match(r.warnings.join(' '), /standard price is not above the basic price/); assert.match(r.warnings.join(' '), /no premium package/);
  });

  await test('GG-04', 'every part, labelled, in the order the editor asks', async () => {
    const parts = G.gigParts(gig), keys = parts.map(p => p.key);
    assert.strictEqual(keys[0], 'title');
    assert.ok(keys.indexOf('tags') < keys.indexOf('basic.name') && keys.indexOf('premium.terms') < keys.indexOf('description') && keys.indexOf('description') < keys.indexOf('faq.0.question'));
    assert.ok(keys.includes('requirement.1'));
    const text = G.gigText(gig);
    assert.match(text, /^GIG TITLE\nI will /); assert.match(text, /STANDARD — DELIVERY, REVISIONS, PRICE\n5 days · 2 revisions · \$90/);
  });

  const PAGE = [
    { id: 'c1', tag: 'textarea', label: 'Gig title', attrs: { placeholder: "do something I'm really good at" } },
    { id: 'c2', tag: 'input', type: 'text', label: 'Search tags', attrs: {} },
    { id: 'c3', tag: 'select', label: 'Category', attrs: {} },
    { id: 'c4', tag: 'input', type: 'text', label: null, attrs: { 'aria-label': 'Name your package' } },
    { id: 'c5', tag: 'input', type: 'text', label: null, attrs: { 'aria-label': 'Name your package' } },
    { id: 'c6', tag: 'input', type: 'text', label: null, attrs: { 'aria-label': 'Name your package' } },
    { id: 'c7', tag: 'textarea', label: null, attrs: { 'aria-label': 'Describe the details of your offering' } },
    { id: 'c8', tag: 'input', type: 'number', label: 'Price', attrs: {} },
    { id: 'c9', tag: 'input', type: 'text', label: null, attrs: { placeholder: 'Add a Question: i.e. Do you translate to English as well?' } },
    { id: 'c10', tag: 'textarea', label: null, attrs: { placeholder: 'Add an Answer: i.e. Yes, I also translate from English to Hebrew.' } },
    { id: 'c11', tag: 'input', type: 'submit', label: 'Save & Continue', attrs: {} },
    { id: 'c12', tag: 'input', type: 'text', name: 'requirement', label: 'Write your question here', attrs: {} },
  ];
  await test('GG-05', 'fields are matched by evidence, repeated ones in page order, widgets and buttons left alone', async () => {
    const m = G.matchGigFields(PAGE, gig), by = Object.fromEntries(m.map(x => [x.cgId, x]));
    assert.strictEqual(by.c1.key, 'title'); assert.ok(!/^I will/.test(by.c1.value), 'the editor shows "I will" itself');
    assert.strictEqual(by.c2.value, gig.tags.join(', '));
    assert.ok(!by.c3 && !by.c11, 'the category dropdown and the submit button are never touched');
    assert.deepStrictEqual([by.c4.key, by.c5.key, by.c6.key], ['basic.name', 'standard.name', 'premium.name']);
    assert.strictEqual(by.c6.value, gig.packages.premium.name);
    assert.strictEqual(by.c7.key, 'basic.description'); assert.strictEqual(by.c8.value, '40');
    assert.strictEqual(by.c9.key, 'faq.0.question'); assert.strictEqual(by.c9.confidence, 'low', 'placeholder evidence is low');
    assert.strictEqual(by.c12.key, 'requirement.0'); assert.strictEqual(by.c12.source, 'name');
    assert.throws(() => G.matchGigFields(null, gig)); assert.throws(() => G.matchGigFields(PAGE, {}));
  });

  await test('GG-06', 'the fill only sets values — never clicks, submits or publishes — and leaves the rest to copy', async () => {
    const calls = [];
    const dom = { handleQuery: async ({ selector }) => { calls.push(['query', selector]); return PAGE; }, handleMutate: async (a) => { calls.push(['mutate', a]); return { ok: true }; } };
    const pre = await G.detectGig(dom, gig, { agentId: 't1' });
    assert.ok(pre.matches.length >= 8 && pre.leftToCopy.includes('description') && pre.leftToCopy.includes('category'));
    assert.ok(!calls.some(c => c[0] === 'mutate'), 'the preview types nothing');
    const r = await G.fillGig(dom, gig, { agentId: 't1' });
    const muts = calls.filter(c => c[0] === 'mutate').map(c => c[1]);
    assert.ok(muts.length && muts.every(x => Object.keys(x.mutation).length === 1 && 'value' in x.mutation && x.agentId === 't1'), 'only value mutations');
    assert.ok(!muts.some(x => ['c3', 'c11'].includes(x.cgId)));
    assert.ok(r.skipped.some(s => s.key === 'faq.0.question'), 'the placeholder-only match is left for him');
    assert.ok(r.leftToCopy.includes('faq.0.question') && r.leftToCopy.includes('description') && !r.leftToCopy.includes('title'));
    const failing = { handleQuery: async () => PAGE, handleMutate: async ({ cgId }) => cgId === 'c2' ? { error: 'Element not found' } : { ok: true } };
    const f = await G.fillGig(failing, gig);
    assert.deepStrictEqual(f.failed, [{ key: 'tags', error: 'Element not found' }]); assert.ok(f.leftToCopy.includes('tags'));
    assert.strictEqual((await G.detectGig({ handleQuery: async () => ({ error: 'no tab' }) }, gig)).error, 'no tab');
  });

  await test('GG-07', 'wired into every system it touches, and nothing in its path submits', async () => {
    const reg = require('../../clear-glass/registry-components.js');
    const ids = reg.components.map(c => c.id);
    for (const id of ['cg.autofill.gig', 'cg.autofill.gigDetect', 'cg.autofill.gigFill', 'cg.autofill.proposal', 'cg.autofill.readPage']) assert.ok(ids.includes(id), id);
    assert.ok(reg.events.emits.includes('autofill.gig.drafted') && reg.events.emits.includes('autofill.gig.filled'));
    const tax = require('../../clear-glass/src/event-taxonomy.js');
    assert.ok(tax.AUTOFILL_GIG_DRAFTED && tax.AUTOFILL_GIG_FILLED);
    assert.ok(require('../../lib/event-taxonomy-pattern.js').validateTaxonomy(tax).ok);
    const bridge = fs.readFileSync(path.join(ROOT, 'clear-glass/src/ipc/bridge.js'), 'utf8');
    for (const s of ["'autofill:gig'", "'autofill:gig:detect'", "'autofill:gig:fill'", "'/cli/autofill/gig'", "'/cli/autofill/gig/detect'", "'/cli/autofill/gig/fill'", "this.postEvent('autofill.gig.drafted'", "this.postEvent('autofill.gig.filled'"]) assert.ok(bridge.includes(s), s);
    const gigSrc = fs.readFileSync(path.join(ROOT, 'clear-glass/src/autofill/gig.js'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    assert.ok(!/\.click\(|\.submit\(|requestSubmit|new\s+(MouseEvent|SubmitEvent|KeyboardEvent)|mutation:\s*\{[^}]*\b(click|submit)/i.test(gigSrc), 'gig.js never clicks, submits or publishes');
    assert.ok(/mutation: \{ value: m\.value \}/.test(gigSrc), 'its one write is a value');
    const pre = fs.readFileSync(path.join(ROOT, 'clear-glass/src/preload/index.js'), 'utf8');
    for (const s of ["'autofill:gig'", "'autofill:gig:detect'", "'autofill:gig:fill'"]) assert.ok(pre.includes(s), s);
    const ui = fs.readFileSync(path.join(ROOT, 'clear-glass/renderer/settings/sections/autofill.js'), 'utf8');
    assert.ok(ui.includes('gigPane(profiles)') && ui.includes('cg.autofill.gigFill') && ui.includes('Copy everything'));
    const contract = require('../../clear-glass/interaction-contract.json');
    for (const p of ['autofill:gig', 'autofill:gig:detect', 'autofill:gig:fill', 'autofill:proposal', 'autofill:readPage']) assert.ok(contract.routes.some(r => r.path === p), p);
    const map = fs.readFileSync(path.join(ROOT, 'loom/maps/copilot-capability-map.js'), 'utf8');
    assert.ok(map.includes("'clear-glass/src/autofill/gig.js'") && map.includes("'clear-glass/src/autofill/proposal.js'"));
    for (const t of ['capability', 'command']) for (const n of ['cg.autofill.gig', 'cg.autofill.gigFill']) assert.ok(fs.existsSync(path.join(ROOT, `clear-glass/data/nodes/${t}/${n}.${t}`)), `${n}.${t}`);
  });

  console.log(`\n  ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
})();
