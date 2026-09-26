'use strict';
/**
 * tests/modules/test-cg-autofill-jobs.test.js — §0.39.265
 *
 * James: "expand the job application autofill. really struggling for money,
 * maybe add fiverr and upwork support?"
 *   - matcher: fields named only by their visible label / aria-label match;
 *     job and freelance questions (salary, sponsorship, hourly rate, skills,
 *     GitHub, LinkedIn, cover letter …) match their own fields, before the
 *     generic ones; a question label never matches a generic word in it.
 *   - LinkedIn / portfolio / cover letter / proposal values come from the
 *     profile's documents (LinkedIn was stored but could never be filled).
 *   - templates: profile placeholders fill; a letter with one left is LOW
 *     confidence, so the default fill leaves it for the person.
 *   - proposal prompts are built only from the profile, per platform.
 *   - store accepts the new fields; IPC + preload expose proposal/readPage.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passed = 0, failed = 0;
async function test(desc, fn) {
  try { await fn(); console.log(`  ✓ ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${desc}\n    ${e.message}`); failed++; }
}
const CG = path.join(__dirname, '../../clear-glass');
const { matchFields } = require(path.join(CG, 'src/autofill/matcher.js'));
const { fillTemplate, profileVars, buildProposalPrompt } = require(path.join(CG, 'src/autofill/proposal.js'));
const { EXTRA_FIELDS, DOCUMENT_FIELDS } = require(path.join(CG, 'src/autofill/store.js'));

const PROFILE = {
  fields: { 'given-name': 'James', 'family-name': 'Brooks', email: 'j@example.com', organization: 'Acme', 'organization-title': 'Engineer',
    'desired-salary': '£55,000', sponsorship: 'No', 'work-authorization': 'Yes — UK citizen', 'years-experience': '6', 'hourly-rate': '$45',
    skills: 'Node.js, Electron', headline: 'Full-stack Node.js developer', summary: 'I build browser automation.', github: 'https://github.com/jb' },
  documents: { linkedinUrl: 'https://linkedin.com/in/jb', portfolioUrl: 'https://jb.dev', coverLetter: 'Dear {{company}} team, I am {{first_name}}.', proposal: 'Hi, I\'m {{first_name}} — {{headline}}.' },
};
let n = 0;
const F = (extra) => ({ id: `cg${++n}`, tag: 'input', type: 'text', attrs: {}, ...extra });
const byId = (m) => Object.fromEntries(m.map(x => [x.cgId, x]));

(async () => {
  console.log('\n  job applications, Upwork and Fiverr');

  await test('a field named only by its visible label or aria-label matches (medium, source "label")', () => {
    const fields = [F({ id: 'a', label: 'First name *' }), F({ id: 'b', attrs: { 'aria-label': 'Email address' } }), F({ id: 'c', label: 'Desired salary' })];
    const m = byId(matchFields(fields, PROFILE));
    assert.deepStrictEqual([m.a.value, m.a.confidence, m.a.source], ['James', 'medium', 'label']);
    assert.strictEqual(m.b.value, 'j@example.com');
    assert.strictEqual(m.c.value, '£55,000');
  });

  await test('LinkedIn / GitHub / portfolio are their own fields, not "website"; LinkedIn comes from documents', () => {
    const m = byId(matchFields([F({ id: 'l', label: 'LinkedIn profile URL' }), F({ id: 'g', name: 'github_url' }), F({ id: 'p', label: 'Portfolio' })], PROFILE));
    assert.strictEqual(m.l.value, 'https://linkedin.com/in/jb');
    assert.strictEqual(m.g.value, 'https://github.com/jb');
    assert.strictEqual(m.p.value, 'https://jb.dev');
  });

  await test('question labels only match question-shaped fields — "…join our company?" never gets the current employer', () => {
    const m = byId(matchFields([
      F({ id: 'q1', tag: 'textarea', label: 'Why do you want to join our company?' }),
      F({ id: 'q2', label: 'Will you now or in the future require visa sponsorship?' }),
      F({ id: 'q3', label: 'Are you legally authorized to work in the UK?' }),
    ], PROFILE));
    assert.ok(!m.q1, 'left to on-screen answers, not filled with "Acme"');
    assert.strictEqual(m.q2.value, 'No');
    assert.strictEqual(m.q3.value, 'Yes — UK citizen');
  });

  await test('Upwork/Fiverr fields: hourly rate, skills, headline, overview, and the cover-letter/proposal box', () => {
    const m = byId(matchFields([
      F({ id: 'r', label: 'Hourly rate' }), F({ id: 's', label: 'Skills' }), F({ id: 'h', attrs: { 'aria-label': 'Professional headline' } }),
      F({ id: 'o', tag: 'textarea', label: 'Overview' }), F({ id: 'cl', tag: 'textarea', label: 'Cover Letter' }),
    ], { ...PROFILE, documents: { proposal: PROFILE.documents.proposal } }));
    assert.strictEqual(m.r.value, '$45'); assert.strictEqual(m.s.value, 'Node.js, Electron');
    assert.strictEqual(m.h.value, 'Full-stack Node.js developer'); assert.strictEqual(m.o.value, 'I build browser automation.');
    assert.strictEqual(m.cl.value, 'Hi, I\'m James — Full-stack Node.js developer.', 'the proposal template, placeholders filled');
    assert.strictEqual(m.cl.confidence, 'medium');
  });

  await test('a letter with a placeholder still unfilled is LOW confidence (needsEdit) — page vars can fill it', () => {
    const f = [F({ id: 'cl', tag: 'textarea', label: 'Cover letter' })];
    const m = matchFields(f, PROFILE)[0];
    assert.strictEqual(m.confidence, 'low'); assert.ok(m.needsEdit);
    assert.strictEqual(m.value, 'Dear {{company}} team, I am James.');
    const m2 = matchFields(f, PROFILE, { vars: { company: 'Initech' } })[0];
    assert.strictEqual(m2.value, 'Dear Initech team, I am James.'); assert.ok(!m2.needsEdit);
  });

  await test('a long letter never goes into a one-line input', () => {
    const long = { ...PROFILE, documents: { coverLetter: 'x'.repeat(800) } };
    assert.deepStrictEqual(matchFields([F({ id: 'i', label: 'Cover letter' })], long), []);
    assert.strictEqual(matchFields([F({ id: 't', tag: 'textarea', label: 'Cover letter' })], long).length, 1);
  });

  await test('fillTemplate reports what is left; profileVars exposes the profile', () => {
    const t = fillTemplate('Hi {{client}}, I\'m {{first_name}} ({{ rate }}/h)', profileVars(PROFILE));
    assert.strictEqual(t.text, 'Hi {{client}}, I\'m James ($45/h)');
    assert.deepStrictEqual(t.missing, ['client']);
    assert.strictEqual(profileVars(PROFILE).linkedin, 'https://linkedin.com/in/jb');
  });

  await test('proposal prompts: platform guidance, profile facts only, never-invent rule; refuses an empty post or profile', () => {
    const post = 'Looking for a Node.js developer to build an Electron app that syncs leads to HubSpot. Budget $1,500.';
    const up = buildProposalPrompt({ profile: PROFILE, jobPost: post, platform: 'upwork' });
    assert.ok(/Upwork proposal/.test(up.prompt) && /Never invent/.test(up.prompt) && up.prompt.includes('Skills: Node.js, Electron') && up.prompt.includes(post));
    assert.ok(up.prompt.includes('Hi, I\'m James'), 'the proposal template is used for voice');
    const fv = buildProposalPrompt({ profile: PROFILE, jobPost: post, platform: 'fiverr', length: 'long' });
    assert.ok(/Fiverr offer/.test(fv.prompt) && /250–350 words/.test(fv.prompt));
    const job = buildProposalPrompt({ profile: PROFILE, jobPost: post, platform: 'job' });
    assert.ok(/cover letter for a job application/.test(job.prompt) && job.prompt.includes('Dear {{company}} team'), 'the cover-letter template for jobs');
    assert.match(buildProposalPrompt({ profile: PROFILE, jobPost: 'short' }).error, /job post/);
    assert.match(buildProposalPrompt({ profile: { fields: {} }, jobPost: post }).error, /profile is empty/);
  });

  await test('the store accepts the new fields and the proposal document; IPC + preload expose proposal/readPage', () => {
    const { AutofillStore } = require(path.join(CG, 'src/autofill/store.js'));
    const s = new AutofillStore();
    s._persist = () => {};
    const p = s.createProfile({ label: 'x', fields: { skills: 'a', 'hourly-rate': '$1', sponsorship: 'No' }, documents: { proposal: 'Hi' } });
    assert.ok(p.id && !p.error, JSON.stringify(p));
    assert.ok(s.createProfile({ fields: { 'made-up': 'x' } }).error);
    assert.ok(Object.values(EXTRA_FIELDS).includes('upwork-url') && DOCUMENT_FIELDS.PROPOSAL === 'proposal');
    const br = fs.readFileSync(path.join(CG, 'src/ipc/bridge.js'), 'utf8'), pre = fs.readFileSync(path.join(CG, 'src/preload/index.js'), 'utf8');
    for (const ch of ['autofill:proposal', 'autofill:readPage']) { assert.ok(br.includes(`ipcMain.handle('${ch}'`)); assert.ok(pre.includes(`'${ch}'`)); }
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
