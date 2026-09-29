'use strict';
/**
 * tests/modules/test-opportunity.test.js — 0.39.259: the job / freelance / lead pipeline.
 *
 * Real: lib/opportunity on a sandboxed JAA store (lib/test-sandbox.js), the stage gate, scoring, every source
 * normalizer against fixture rows in each API's published shape, the answer bank, planFill against a page read by the
 * REAL page reader in jsdom, drafting through render + an injected send, copilot's route table over real HTTP.
 * Fake: the browser (a scripted clearglass.browser.tool stand-in that records calls) and the model (send).
 * Not proven here: the live job APIs (this environment's egress allowlist blocks them) and a live Clear Glass window.
 */

const assert = require('assert');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

let passed = 0, failed = 0;
async function t(id, desc, fn) {
  try { await fn(); console.log(`  ✓ ${id} ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${id} ${desc}\n    ${e.stack || e.message}`); failed++; }
}

const O = require('../../lib/opportunity');
const { stages, scoring, sources, answers, apply, drafting } = O;

function readHtml(html, url) {
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM(html, { url, runScripts: 'outside-only' });
  const reader = require('../../clear-glass/src/page/reader.js');
  return reader.normalize(JSON.parse(JSON.stringify(dom.window.eval(reader.pageScript()))));
}
const APPLY_HTML = `<html><head><title>Apply — Backend Engineer</title></head><body><h1>Backend Engineer</h1>
<form><label for="fn">First name</label><input id="fn" name="first_name" required>
<label for="ln">Last name</label><input id="ln" name="last_name" required>
<label for="em">Email</label><input id="em" type="email" name="email" required>
<label for="li">LinkedIn profile</label><input id="li" name="linkedin">
<label for="cl">Cover letter</label><textarea id="cl" name="cover"></textarea>
<div class="field"><label for="q1">What is the most complex system you have built?</label><textarea id="q1" name="q1" required></textarea></div>
<fieldset><legend>Will you now or in the future require visa sponsorship?</legend>
<label><input type="radio" name="spons" value="y"> Yes</label><label><input type="radio" name="spons" value="n"> No</label></fieldset>
<label for="hear">How did you hear about this job?</label><select id="hear" name="hear"><option>Select</option><option>LinkedIn</option><option>Hacker News</option><option>Other</option></select>
<label for="cv">Resume</label><input type="file" id="cv" name="cv">
<label><input type="checkbox" name="terms"> I agree to the terms</label>
<button type="submit">Submit application</button></form></body></html>`;

function fakeBrowser(script) {
  const calls = [];
  const fn = async (a) => { calls.push(a); const h = script[a.action]; return typeof h === 'function' ? h(a, calls) : (h || { ok: true }); };
  fn.calls = calls;
  return fn;
}
const fakeSend = (text = 'DRAFT TEXT') => { const seen = []; const f = async (prompt) => { seen.push(prompt); return { text, backend: 'ollama' }; }; f.seen = seen; return f; };

async function run() {
  console.log('opportunity pipeline (0.39.259)');

  // ── stages ────────────────────────────────────────────────────────────────────────────────────────────
  await t('OP-001', 'stage gate: APPROVED is James\'s only; illegal moves are refused by name', () => {
    assert.strictEqual(stages.check('SHORTLISTED', 'APPROVED', 'agent').ok, false);
    assert.strictEqual(stages.check('SHORTLISTED', 'APPROVED', 'agent').userOnly, true);
    assert.strictEqual(stages.check('SHORTLISTED', 'APPROVED', 'user').ok, true);
    assert.match(stages.check('DISCOVERED', 'SUBMITTED', 'user').error, /not a legal move/);
    assert.match(stages.check('READY', 'NOPE').error, /unknown stage/);
  });

  // ── scoring ───────────────────────────────────────────────────────────────────────────────────────────
  const profile = { roles: ['backend', 'full stack'], skills: ['node', 'postgresql', 'electron', 'react'], mustHave: ['remote'], avoid: ['blockchain'],
    excludeCompanies: ['BadCorp'], remoteOnly: true, minSalary: 120000, maxAgeDays: 30 };
  const now = Date.parse('2026-09-27T00:00:00Z');
  await t('OP-101', 'score: every point has a reason; a good fit clears the shortlist line', () => {
    const r = scoring.score({ title: 'Senior Backend Engineer', company: 'Acme', description: 'Node and PostgreSQL. Fully remote.', remote: true, salary: { min: 130000, max: 160000 }, postedAt: '2026-09-25T00:00:00Z' }, profile, { now });
    assert.ok(r.score >= 55, `score ${r.score}`);
    assert.ok(r.reasons.find(x => /role "backend"/.test(x.why)));
    assert.ok(r.reasons.find(x => /skills matched \(2\/4\): node, postgresql/.test(x.why)));
    assert.ok(r.reasons.find(x => /pays from 130000/.test(x.why)));
  });
  await t('OP-102', 'score: excluded company and avoided title word are hard rejects, not low scores', () => {
    assert.match(scoring.score({ title: 'Backend', company: 'BadCorp Inc' }, profile).hardReject, /excluded company/);
    assert.match(scoring.score({ title: 'Blockchain Backend Engineer', company: 'X' }, profile).hardReject, /avoided keyword/);
  });
  await t('OP-103', 'score: on-site under remoteOnly, below the floor, and stale all subtract with their reason', () => {
    const r = scoring.score({ title: 'Backend Engineer', company: 'Y', description: 'node', remote: false, salary: { max: 90000 }, postedAt: '2026-07-01T00:00:00Z' }, profile, { now });
    assert.ok(r.reasons.find(x => x.w === -40 && /not remote/.test(x.why)));
    assert.ok(r.reasons.find(x => x.w === -25 && /floor 120000/.test(x.why)));
    assert.ok(r.reasons.find(x => x.w === -20 && /days ago/.test(x.why)));
  });
  await t('OP-104', 'dedupe: the same company+title from two sources is one key', () => {
    assert.strictEqual(scoring.dedupeKey({ company: 'Acme, Inc.', title: 'Backend Engineer' }), scoring.dedupeKey({ company: 'acme inc', title: 'backend  engineer' }));
  });

  // ── sources: normalizers against each API's published row shape ─────────────────────────────────────
  await t('OP-201', 'normalizers: remotive, arbeitnow, remoteok (skips its legal-notice row), greenhouse, lever, ashby', () => {
    const rm = sources.normalizeRemotive({ id: 7, url: 'https://remotive.com/j/7', title: 'Backend Dev', company_name: 'Acme', category: 'Software Development', tags: ['node'], job_type: 'full_time', publication_date: '2026-09-20T10:00:00', candidate_required_location: 'Worldwide', salary: '$120k - $150k', description: '<p>Node &amp; <b>Postgres</b></p>' });
    assert.deepStrictEqual([rm.source, rm.externalId, rm.company, rm.remote, rm.salary.min, rm.salary.max, rm.description], ['remotive', '7', 'Acme', true, 120000, 150000, 'Node & Postgres']);
    const an = sources.normalizeArbeitnow({ slug: 'dev-x', company_name: 'B', title: 'Dev', description: 'x', remote: false, url: 'https://arbeitnow.com/x', tags: [], job_types: ['full time'], location: 'Berlin', created_at: 1790000000 });
    assert.strictEqual(an.remote, false); assert.ok(an.postedAt.startsWith('2026-'));
    assert.strictEqual(sources.normalizeRemoteOk({ legal: 'notice' }), null);
    const ro = sources.normalizeRemoteOk({ id: '9', position: 'Engineer', company: 'C', tags: ['go'], salary_min: 100000, salary_max: 140000, url: 'https://remoteok.com/9', apply_url: 'https://c.test/apply', date: '2026-09-21T00:00:00Z', description: 'Go' });
    assert.deepStrictEqual([ro.applyUrl, ro.salary.max], ['https://c.test/apply', 140000]);
    const gh = sources.normalizeGreenhouse({ id: 5, title: 'SRE', absolute_url: 'https://boards.greenhouse.io/acme/jobs/5', location: { name: 'Remote - US' }, updated_at: '2026-09-22T00:00:00Z', content: '&lt;p&gt;Run &amp;amp; scale&lt;/p&gt;' }, 'acme');
    assert.deepStrictEqual([gh.externalId, gh.remote, gh.description], ['acme:5', true, 'Run & scale']);
    const lv = sources.normalizeLever({ id: 'u1', text: 'Frontend', hostedUrl: 'https://jobs.lever.co/x/u1', applyUrl: 'https://jobs.lever.co/x/u1/apply', categories: { location: 'NYC', commitment: 'Full-time', team: 'Web' }, workplaceType: 'hybrid', descriptionPlain: 'React', createdAt: 1790000000000 }, 'x');
    assert.deepStrictEqual([lv.applyUrl, lv.remote, lv.tags], ['https://jobs.lever.co/x/u1/apply', false, ['Web', 'Full-time']]);
    const ab = sources.normalizeAshby({ id: 'a1', title: 'ML Eng', location: 'Remote', isRemote: true, jobUrl: 'https://jobs.ashbyhq.com/o/a1', applyUrl: 'https://jobs.ashbyhq.com/o/a1/application', descriptionPlain: 'PyTorch', publishedAt: '2026-09-23T00:00:00Z', compensation: { compensationTierSummary: '$150K – $190K' } }, 'o');
    assert.deepStrictEqual([ab.remote, ab.salary.min, ab.salary.max], [true, 150000, 190000]);
  });
  await t('OP-202', 'normalizers: HN "Company | Role | Location" comments, RSS (WWR "Company: Role")', () => {
    const hn = sources.normalizeHn({ objectID: 123, comment_text: 'Acme | Staff Engineer | Remote (US) | $180k-$220k<p>We build things. https://acme.test/jobs', created_at_i: 1790000000 });
    assert.deepStrictEqual([hn.company, hn.title, hn.remote, hn.applyUrl, hn.salary.min], ['Acme', 'Staff Engineer', true, 'https://acme.test/jobs', 180000]);
    assert.strictEqual(sources.normalizeHn({ objectID: 1, comment_text: 'just a reply, no pipes' }), null);
    const items = sources.parseRss('<rss><channel><item><title><![CDATA[Acme: Senior Node Developer]]></title><link>https://weworkremotely.com/x</link><pubDate>Mon, 21 Sep 2026 10:00:00 +0000</pubDate><region>Anywhere in the World</region><description>&lt;p&gt;Node&lt;/p&gt;</description></item></channel></rss>');
    const r = sources.normalizeRss(items[0], 'weworkremotely');
    assert.deepStrictEqual([r.company, r.title, r.remote, r.description], ['Acme', 'Senior Node Developer', true, 'Node']);
  });
  await t('OP-203', 'fetchSource: rows that normalise to nothing are a reported shape change, not "no jobs"; a missing param is named', async () => {
    const fetchImpl = async () => ({ ok: true, json: async () => ({ jobs: [{ weird: 1 }, { weird: 2 }] }) });
    const r = await sources.fetchSource({ type: 'remotive' }, { fetchImpl });
    assert.strictEqual(r.ok, false); assert.match(r.error, /2 rows came back but none normalised/);
    assert.match((await sources.fetchSource({ type: 'greenhouse' })).error, /needs board/);
    assert.match((await sources.fetchSource({ type: 'nope' })).error, /unknown source type/);
  });
  await t('OP-204', 'fromPage: a page Clear Glass read becomes an opportunity; fiverr.com is a lead, upwork.com a gig', () => {
    const p = readHtml(APPLY_HTML, 'https://jobs.acme.test/apply/1');
    const o = sources.fromPage(p);
    assert.deepStrictEqual([o.kind, o.title, o.captured.applyButton], ['job', 'Backend Engineer', 'Submit application']);
    assert.strictEqual(sources.kindForHost('www.fiverr.com'.replace(/^www\./, '')), 'lead');
    assert.strictEqual(sources.kindForHost('upwork.com'), 'gig');
  });

  // ── answer bank ───────────────────────────────────────────────────────────────────────────────────────
  const P = O.setProfile({ contact: { firstName: 'James', lastName: 'Brooks', email: 'james@example.test', location: 'Portland, OR' }, links: { linkedin: 'https://linkedin.com/in/jb' },
    eligibility: { workAuthorization: true, needsSponsorship: false }, preferences: { referralSource: 'Hacker News' }, skills: profile.skills, roles: profile.roles, remoteOnly: false,
    headline: 'Systems engineer', summary: 'Builds event-driven systems.', resumeText: 'NEXUS: 20 systems, SISO event streams.', resumePath: __filename, shortlistAbove: 50, draftTop: 1,
    sources: [{ type: 'remotive', enabled: true }] }).profile;
  await t('OP-301', 'answerFor: profile rules answer the questions every form asks; yes/no maps onto the options offered', () => {
    assert.deepStrictEqual(answers.answerFor('First name', P).answer, 'James');
    assert.deepStrictEqual(answers.answerFor('Email address *', P).answer, 'james@example.test');
    const sp = answers.answerFor('Will you now or in the future require visa sponsorship?', P, { options: ['Yes', 'No'] });
    assert.deepStrictEqual([sp.answer, sp.mappedFrom, sp.source], ['No', 'No', 'profile:eligibility.needsSponsorship']);
    assert.strictEqual(answers.answerFor('Favourite colour?', P), null);
  });
  await t('OP-302', 'answer bank: an agent\'s answer is a candidate (not used); James\'s is used; a candidate never overwrites James', () => {
    answers.add({ question: 'Why do you want to work at a startup?', answer: 'agent words', by: 'agent' });
    assert.strictEqual(answers.answerFor('Why do you want to work at a startup?', P), null, 'candidate must not be auto-used');
    answers.add({ question: 'Why do you want to work at a startup?', answer: 'Ownership end to end.', by: 'user' });
    assert.strictEqual(answers.answerFor('why do you want to work at a startup', P).answer, 'Ownership end to end.');
    const r = answers.add({ question: 'Why do you want to work at a startup?', answer: 'agent again', by: 'agent' });
    assert.strictEqual(r.deduped, true);
    assert.strictEqual(answers.answerFor('Why do you want to work at a startup?', P).answer, 'Ownership end to end.');
  });

  // ── planFill against the REAL reader's output ─────────────────────────────────────────────────────────
  await t('OP-401', 'planFill: names/email/linkedin from the profile, radio + select mapped, resume uploaded, cover letter set, consent left for James, open question surfaced', () => {
    const page = readHtml(APPLY_HTML, 'https://jobs.acme.test/apply/1');
    const plan = apply.planFill(page.fields, { profile: P, answerFor: (q, o) => answers.answerFor(q, P, o), coverLetter: 'COVER', resumePath: '/r.pdf' });
    const bySel = Object.fromEntries(plan.steps.map(s => [s.selector, s]));
    assert.strictEqual(bySel['#fn'].value, 'James'); assert.strictEqual(bySel['#ln'].value, 'Brooks');
    assert.strictEqual(bySel['#em'].value, 'james@example.test'); assert.strictEqual(bySel['#li'].value, 'https://linkedin.com/in/jb');
    assert.strictEqual(bySel['#cl'].value, 'COVER');
    assert.deepStrictEqual(bySel['#cv'], { action: 'upload', selector: '#cv', paths: ['/r.pdf'] });
    assert.deepStrictEqual(bySel['#hear'], { action: 'select', selector: '#hear', text: 'Hacker News' });
    const radio = plan.steps.find(s => s.action === 'check' && s.checked === true);
    assert.ok(radio && page.fields.find(f => f.selector === radio.selector).label === 'No');
    assert.ok(plan.skipped.find(s => /consent box/.test(s.why)));
    assert.deepStrictEqual(plan.open.map(o => o.selector), ['#q1']);
  });

  // ── drafting ──────────────────────────────────────────────────────────────────────────────────────────
  await t('OP-501', 'render: placeholders are data; a line whose placeholders are all empty is dropped', () => {
    const txt = drafting.render('A {name}\nLinks: {links}\nB {title}', { name: 'J', links: '', title: 'T' });
    assert.strictEqual(txt, 'A J\nB T');
  });
  await t('OP-502', 'templates: James\'s edit is used as typed and survives; reset restores the default', async () => {
    drafting.setTemplate('follow_up', 'FOLLOW UP for {title} at {company} as {name}');
    const send = fakeSend('ok');
    const d = await drafting.draft('follow_up', { profile: P, opp: { title: 'SRE', company: 'Acme' }, send });
    assert.strictEqual(send.seen[0], 'FOLLOW UP for SRE at Acme as James Brooks');
    assert.strictEqual(d.edited, true);
    drafting.resetTemplate('follow_up');
    assert.strictEqual(drafting.getTemplate('follow_up').edited, false);
  });

  // ── the pipeline end to end ───────────────────────────────────────────────────────────────────────────
  const REMOTIVE = { jobs: [
    { id: 1, url: 'https://jobs.acme.test/apply/1', title: 'Senior Backend Engineer', company_name: 'Acme', tags: ['node', 'postgresql'], publication_date: new Date().toISOString(), candidate_required_location: 'Worldwide', description: 'Node, PostgreSQL, Electron. Remote.' },
    { id: 2, url: 'https://x.test/2', title: 'Blockchain Backend Engineer', company_name: 'Z', publication_date: new Date().toISOString(), description: 'node' },
    { id: 3, url: 'https://x.test/3', title: 'Office Manager', company_name: 'Q', publication_date: new Date().toISOString(), description: 'filing' },
  ] };
  O.setProfile({ avoid: ['blockchain'] });
  let jobId;
  await t('OP-601', 'cycle: fetch → normalise → score → shortlist → draft the top one; rejects dismissed with the rule', async () => {
    const send = fakeSend('Dear Acme, …');
    const r = await O.cycle({ fetchImpl: async () => ({ ok: true, json: async () => REMOTIVE }), send });
    assert.strictEqual(r.ok, true, JSON.stringify(r.problems));
    assert.deepStrictEqual([r.found, r.created, r.drafted], [3, 3, 1]);
    const all = O.list({ limit: 10 });
    const acme = all.find(x => x.company === 'Acme');
    assert.strictEqual(acme.stage, 'DRAFTED');
    assert.strictEqual(all.find(x => x.company === 'Z').stage, 'DISMISSED');
    assert.strictEqual(all.find(x => x.company === 'Q').stage, 'SCORED');
    assert.match(send.seen[0], /Senior Backend Engineer at Acme/);
    jobId = acme.id;
    const again = await O.cycle({ fetchImpl: async () => ({ ok: true, json: async () => REMOTIVE }), send, draft: 0 });
    assert.strictEqual(again.created, 0, 'the same jobs a second time are not new');
  });

  await t('OP-602', 'prepare before approval is refused; an agent cannot approve (tool + lib); James can', async () => {
    assert.match((await O.prepare(jobId)).error, /approval first/);
    const tool = require('../../lib/agent-tools/tools/opportunity/opportunity.js');
    const r = await tool.execute({ action: 'approve', id: jobId });
    assert.strictEqual(r.userOnly, true);
    assert.strictEqual(O.approve(jobId, { by: 'agent' }).ok, false);
    assert.strictEqual(O.approve(jobId, { by: 'user' }).ok, true);
  });

  let browser;
  await t('OP-603', 'prepare: opens a partitioned tab, fills from profile + bank + drafts in ONE sequence, drafts the open question, stops at READY', async () => {
    let reads = 0;
    const filled = readHtml(APPLY_HTML.replace(/required/g, ''), 'https://jobs.acme.test/apply/1');
    browser = fakeBrowser({
      open_tab: { agentId: 'x', url: 'u' },
      read: () => (++reads === 1 ? readHtml(APPLY_HTML, 'https://jobs.acme.test/apply/1') : { ...filled, unfilledRequired: [] }),
      sequence: (a) => ({ ok: true, results: a.steps.map((s, i) => ({ step: i, action: s.action, ok: true })) }),
      act: (a) => a.driverAction === 'screenshot' ? { ok: true, result: { format: 'png', bytes: 1234 } } : { ok: true },
    });
    O.setBrowser(browser);
    const r = await O.prepare(jobId, { send: fakeSend('The NEXUS platform: 20 services on one event bus.') });
    assert.strictEqual(r.ok, true, r.error);
    assert.strictEqual(r.stage, 'READY');
    const open = browser.calls.find(c => c.action === 'open_tab');
    assert.strictEqual(open.partition, 'persist:opportunity');
    assert.match(open.agentId, /^opp-/);
    const seq = browser.calls.filter(c => c.action === 'sequence');
    assert.strictEqual(seq.length, 1, 'one sequence call for the whole form');
    assert.ok(seq[0].steps.find(s => s.selector === '#q1' && /20 services/.test(s.value)), 'open question answered with a draft');
    assert.ok(seq[0].steps.find(s => s.selector === '#cl' && s.value === 'Dear Acme, …'), 'cover letter from the cycle\'s draft');
    assert.strictEqual(r.fillReport.generated.length, 1);
    assert.strictEqual(r.fillReport.screenshotBytes, 1234);
    assert.deepStrictEqual(r.submit.ok, false, 'default policy: James submits');
  });

  await t('OP-604', 'submit: the agent is refused under policy approve; ToS platforms need acknowledgeTos even under auto', async () => {
    assert.match((await O.submit(jobId, { by: 'agent' })).error, /policy is "approve"/);
    const m = apply.mayAutoSubmit({ policy: { 'fiverr.com': { mode: 'auto' } } }, { url: 'https://www.fiverr.com/inbox/x' });
    assert.match(m.why, /acknowledgeTos/);
    assert.strictEqual(apply.mayAutoSubmit({ policy: { 'fiverr.com': { mode: 'auto', acknowledgeTos: true } } }, { url: 'https://fiverr.com/x' }).ok, true);
  });

  await t('OP-605', 'submit by James: clicks the page\'s submit button, sees the confirmation, SUBMITTED; approving adopted the generated answer', async () => {
    const page = readHtml(APPLY_HTML, 'https://jobs.acme.test/apply/1');
    let n = 0;
    O.setBrowser(fakeBrowser({ read: () => (++n === 1 ? page : { ...page, url: 'https://jobs.acme.test/thanks', text: 'Thank you for applying! Your application was submitted.' }), act: { ok: true } }));
    const r = await O.submit(jobId, { by: 'user' });
    assert.strictEqual(r.ok, true, r.error);
    assert.strictEqual(r.opp.stage, 'SUBMITTED'); assert.strictEqual(r.opp.submitConfirmed, true);
    const adopted = answers.answerFor('What is the most complex system you have built?', O.getProfile());
    assert.ok(adopted && adopted.source === 'answer-bank' && /20 services/.test(adopted.answer), 'the drafted answer James submitted is reusable now');
  });

  await t('OP-606', 'submit with validation errors still showing → FAILED with the evidence; retry_count counts', async () => {
    const id = O.upsertFound({ source: 't', externalId: 'v1', kind: 'job', title: 'Backend Engineer', company: 'V', url: 'https://v.test/a', applyUrl: 'https://v.test/a', description: 'node remote' }, O.getProfile()).opp.id;
    O.approve(id, { by: 'user' });
    const page = readHtml(APPLY_HTML, 'https://v.test/a');
    O.setBrowser(fakeBrowser({ read: () => ({ ...page, unfilledRequired: [] }), sequence: { ok: true, results: [] }, act: { ok: true }, open_tab: {} }));
    await O.prepare(id, { send: fakeSend('x') });
    O.setBrowser(fakeBrowser({ read: () => ({ ...page, text: 'This field is required' }), act: { ok: true } }));
    const r = await O.submit(id, { by: 'user' });
    assert.strictEqual(r.opp.stage, 'FAILED');
    assert.match(r.opp.failure_log[0].error, /validation errors/);
    assert.strictEqual(r.opp.retry_count, 1);
  });

  await t('OP-607', 'prepare: a login wall is NEEDS_LOGIN naming the tab and partition, not a failure', async () => {
    const id = O.upsertFound({ source: 't', externalId: 'l1', kind: 'job', title: 'Backend Engineer', company: 'L', url: 'https://l.test/a', description: 'node' }, O.getProfile()).opp.id;
    O.approve(id, { by: 'user' });
    O.setBrowser(fakeBrowser({ read: () => readHtml('<form><label for=u>Email</label><input id=u><label for=p>Password</label><input id=p type=password></form>', 'https://l.test/login'), open_tab: {}, act: { ok: true } }));
    const r = await O.prepare(id);
    assert.strictEqual(r.opp.stage, 'NEEDS_LOGIN');
    assert.match(r.opp.history.slice(-1)[0].note, /log in once in tab opp-.* \(partition persist:opportunity\)/);
  });

  await t('OP-608', 'Fiverr lead: capture → draft reply (fiverr_reply, no off-platform contact) → approve → typed into the reply box → READY, never sent', async () => {
    const thread = readHtml('<h1>Inbox — buyer_joe</h1><p>Hi, can you build a Chrome extension that exports my tabs? Budget $200.</p><textarea aria-label="Type your message"></textarea><button>Send</button>', 'https://www.fiverr.com/inbox/buyer_joe');
    O.setBrowser(fakeBrowser({ read: () => thread, open_tab: {}, act: (a) => ({ ok: true, result: a.args }) }));
    const c = await O.capture({ agentId: 'default' });
    assert.strictEqual(c.kind, 'lead');
    const send = fakeSend('Yes — I can build that. Which browser data should the export include?');
    const d = await O.draftFor(c.id, { send });
    assert.strictEqual(d.kind, 'fiverr_reply');
    assert.match(send.seen[0], /never ask for or offer contact details or payment outside Fiverr/);
    assert.match(send.seen[0], /Chrome extension that exports my tabs/);
    O.approve(c.id, { by: 'user' });
    const b2 = fakeBrowser({ read: () => thread, open_tab: {}, act: (a) => ({ ok: true, result: a.args }) });
    O.setBrowser(b2);
    const r = await O.prepareReply(c.id);
    assert.strictEqual(r.opp.stage, 'READY');
    const typed = b2.calls.find(x => x.action === 'act' && x.driverAction === 'setValue');
    assert.match(typed.args.value, /Which browser data/);
    assert.ok(!b2.calls.find(x => x.action === 'act' && x.driverAction === 'click'), 'nothing was clicked — the reply is not sent');
  });

  await t('OP-609', 'followups: SUBMITTED past followUpDays → FOLLOW_UP_DUE with a drafted follow-up', async () => {
    const jaa = require('../../cortex/memory/jaa-db.js').jaaDB;
    jaa.update('opportunities', { id: jobId }, { submittedAt: Date.now() - 9 * 86400000 });
    const r = await O.followups({ send: fakeSend('Following up on Backend.') });
    assert.strictEqual(r.due, 1);
    assert.strictEqual(O.get(jobId).stage, 'FOLLOW_UP_DUE');
    assert.strictEqual(O.get(jobId).drafts.follow_up.text, 'Following up on Backend.');
  });

  await t('OP-610', 'status: needsYou lists what waits on James; every transition is in the ledger', () => {
    const s = O.status();
    assert.ok(s.needsYou.find(x => x.id === jobId && x.stage === 'FOLLOW_UP_DUE'));
    const led = O.show(jobId).ledger.filter(l => l.type === 'transition').map(l => l.shape);
    assert.deepStrictEqual(led.slice(0, 4), ['DISCOVERED->SCORED', 'SCORED->SHORTLISTED', 'SHORTLISTED->DRAFTED', 'DRAFTED->APPROVED']);
    assert.ok(O.show(jobId).ledger.every(l => /^[0-9a-f]{8}$/.test(l.shortid)));
  });

  await t('OP-611', 'autoApproveAbove: James\'s own policy approves high scorers in the cycle, recorded as his policy', async () => {
    O.setProfile({ policy: { default: { mode: 'approve', autoApproveAbove: 60 } } });
    const rows = { jobs: [{ id: 99, url: 'https://w.test/99', title: 'Backend Engineer', company_name: 'W', tags: ['node', 'postgresql', 'electron', 'react'], publication_date: new Date().toISOString(), description: 'node postgresql electron react remote' }] };
    const r = await O.cycle({ fetchImpl: async () => ({ ok: true, json: async () => rows }), draft: 0 });
    assert.strictEqual(r.autoApproved, 1);
    const w = O.list({ q: 'W', limit: 5 }).find(x => x.company === 'W');
    const full = O.get(w.id);
    assert.strictEqual(full.stage, 'APPROVED'); assert.strictEqual(full.approvedByPolicy, true);
    O.setProfile({ policy: { default: { mode: 'approve', autoApproveAbove: null } } });
  });

  // ── HTTP: copilot's route table ───────────────────────────────────────────────────────────────────────
  await t('OP-701', 'copilot /api/opportunity: status, list, approve is by:user, unknown id is 404, agent tool cannot reach approve', async () => {
    const routes = require('../../copilot/routes/opportunity.js');
    const srv = http.createServer(async (req, res) => {
      const url = new URL(req.url, 'http://x');
      const json = (r, code, body) => { r.writeHead(code, { 'Content-Type': 'application/json' }); r.end(JSON.stringify(body)); };
      const readBody = (q) => new Promise(ok => { let d = ''; q.on('data', c => d += c); q.on('end', () => ok(d ? JSON.parse(d) : {})); });
      if (!(await routes.handle(req, res, { method: req.method, url, pathname: url.pathname, json, readBody }))) json(res, 404, { unhandled: true });
    });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const port = srv.address().port;
    const call = (m, p, b) => new Promise((ok, no) => { const d = b ? JSON.stringify(b) : null; const q = http.request({ hostname: '127.0.0.1', port, path: p, method: m, headers: d ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } : {} }, r => { let s = ''; r.on('data', c => s += c); r.on('end', () => ok({ status: r.statusCode, json: JSON.parse(s) })); }); q.on('error', no); if (d) q.write(d); q.end(); });
    const st = await call('GET', '/api/opportunity/status');
    assert.strictEqual(st.status, 200); assert.ok(st.json.total >= 5);
    const ls = await call('GET', '/api/opportunity/list?stage=DISMISSED');
    assert.ok(ls.json.items.every(i => i.stage === 'DISMISSED'));
    const q = O.list({ stage: 'SCORED' })[0];
    const ap = await call('POST', `/api/opportunity/${q.id}/approve`, { by: 'agent' });   // body cannot downgrade: route says user
    assert.strictEqual(ap.status, 200); assert.strictEqual(O.get(q.id).approvedBy, 'user');
    assert.strictEqual((await call('GET', '/api/opportunity/nope-nope')).status, 404);
    const tpl = await call('GET', '/api/opportunity/templates');
    assert.deepStrictEqual(tpl.json.templates.map(x => x.id), drafting.IDS);
    const ctx = await call('GET', '/api/context/search?q=Acme%20Backend');
    assert.strictEqual(ctx.status, 200); assert.ok(ctx.json.hits.find(h => h.source === 'jaa:opportunities'));
    srv.close();
  });

  // ── CLI ───────────────────────────────────────────────────────────────────────────────────────────────
  await t('OP-801', 'CLI: a write in one process is readable by the next (the store is flushed before exit)', () => {
    const { execFileSync } = require('child_process');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opp-cli-'));
    const env = { ...process.env, JAA_DATA_DIR: dir, NEXUS_TEST_SANDBOX: '' };
    execFileSync(process.execPath, [path.join(__dirname, '../../cli/opportunity.js'), 'profile', 'set', 'skills=node,rust', 'minSalary=100000'], { env, stdio: 'pipe' });
    const shown = JSON.parse(execFileSync(process.execPath, [path.join(__dirname, '../../cli/opportunity.js'), 'profile', 'show'], { env, stdio: 'pipe' }).toString().split('\n').filter(l => !l.startsWith('[')).join('\n'));
    assert.deepStrictEqual([shown.skills, shown.minSalary], [['node', 'rust'], 100000]);
  });

  // §0.39.282 — a .docx resume read through lib/zip-ingest.js (was adm-zip, a removed package: every .docx import failed)
  await t('OP-DOCX', 'a .docx resume imports: text, email and suggested skills from word/document.xml, with no adm-zip', async () => {
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'opp-docx-')), 'cv.docx');
    require('child_process').execFileSync('python3', ['-c', `import zipfile;z=zipfile.ZipFile(${JSON.stringify(f)},'w');z.writestr('[Content_Types].xml','<Types/>');z.writestr('word/document.xml','<w:document><w:body><w:p><w:r><w:t>Jane Doe jane@example.com</w:t></w:r></w:p><w:p><w:r><w:t>Skills: javascript, react</w:t></w:r></w:p></w:body></w:document>');z.close()`]);
    const r = await require('../../lib/opportunity/index.js').importResume(f);
    assert.ok(r.ok, r.error);
    assert.strictEqual(r.email, 'jane@example.com');
    assert.ok(r.suggestedSkills.includes('javascript') && r.suggestedSkills.includes('react'));
    assert.ok(!/require\(['"]adm-zip['"]\)/.test(fs.readFileSync(path.join(__dirname, '../../lib/opportunity/index.js'), 'utf8')));
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  try { require('../../cortex/memory/jaa-db.js').jaaDB._store().flushAll(); } catch (_) {}
  process.exit(failed ? 1 : 0);
}
run();
