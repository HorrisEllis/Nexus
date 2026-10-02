'use strict';
/**
 * renderer/settings/sections/autofill.js — Autofill & answers  (styles: autofill.css)
 *
 * v0.39.227 — split out of sections/browser.js (James: "each UI area its own file, including its own CSS file"). Notes below are that file's, kept for provenance.
 */
/**
 * renderer/settings/sections/browser.js — General, Autofill & screen answers, Privacy
 * §BUILT 2026-09-23. General: NexusOptions (window behaviour, start page,
 * download folder, co-pilot pane, background-tab default) + toolbar pins from
 * src/toolbar/commands.js (the one source of what's pinnable). Autofill:
 * AutofillStore CRUD + the screen Q&A settings that lived in the old page.
 * Privacy: the password vault (metadata only — list() never decrypts),
 * per-site settings, history, downloads.
 */
(function () {
  const { cg, h, call, toast, busy, modal, confirmDo, field, pane, row, btn, chip, empty, ago, toggle, select, agentOptions, section } = window.CGS;

  // ── Autofill ───────────────────────────────────────────────────────────
  // §EXPANDED 2026-09-26 — James: "expand the autofill section." Every
  // field src/autofill/store.js accepts (FIELD_TYPES / DOCUMENT_FIELDS —
  // the store refuses anything else), grouped the way a form asks for
  // them; was 12 of 25. Plus: completeness per profile, duplicate, fill a
  // live tab with a detect preview first (same autofill:detect/fill the
  // Library uses), and a test box for on-screen answers.
  const GROUPS = [
    ['Name', [['honorific-prefix', 'Prefix'], ['given-name', 'First name'], ['additional-name', 'Middle name'], ['family-name', 'Last name'], ['honorific-suffix', 'Suffix'], ['nickname', 'Preferred name'], ['name', 'Full name (if a form asks for one field)']]],
    ['Contact', [['email', 'Email'], ['tel', 'Phone'], ['tel-country-code', 'Phone country code'], ['tel-national', 'Phone without country code'], ['url', 'Website']]],
    ['Address', [['street-address', 'Street address'], ['address-line1', 'Address line 1'], ['address-line2', 'Address line 2'], ['address-level2', 'City'], ['address-level1', 'State / region'], ['postal-code', 'Postal code'], ['country', 'Country code (US, GB…)'], ['country-name', 'Country']]],
    ['Work', [['organization', 'Current employer'], ['organization-title', 'Current title']]],
    // §0.39.265 — the questions job applications and Upwork/Fiverr ask that have
    // no standard autocomplete token (src/autofill/store.js EXTRA_FIELDS).
    ['Job applications', [['years-experience', 'Years of experience'], ['desired-salary', 'Desired salary'], ['notice-period', 'Notice period'], ['available-from', 'Available to start'],
      ['work-authorization', 'Authorized to work?', 'Yes — UK citizen'], ['sponsorship', 'Need visa sponsorship?', 'No'], ['relocate', 'Willing to relocate?', 'Yes, within the UK'], ['remote-preference', 'Remote / hybrid / on-site', 'Remote or hybrid'], ['github', 'GitHub URL'], ['pronouns', 'Pronouns']]],
    ['Freelance (Upwork, Fiverr)', [['headline', 'Professional headline', 'Full-stack Node.js developer'], ['summary', 'Summary / overview', 'Two or three sentences: what you do, for whom, and a result you can point to.'], ['skills', 'Skills', 'Node.js, Electron, web scraping'], ['hourly-rate', 'Hourly rate', '$45'],
      ['hours-per-week', 'Hours per week'], ['languages', 'Languages'], ['upwork-url', 'Upwork profile URL'], ['fiverr-url', 'Fiverr profile URL']]],
  ];
  const LONG = new Set(['summary']);
  const FIELDS = GROUPS.flatMap(([, f]) => f);
  const DOCS = [['linkedinUrl', 'LinkedIn URL'], ['portfolioUrl', 'Portfolio URL'], ['coverLetter', 'Cover letter template'], ['proposal', 'Proposal template (Upwork, Fiverr)']];
  const TEMPLATE_HELP = 'Placeholders: {{first_name}}, {{name}}, {{headline}}, {{skills}}, {{years}}, {{rate}}, {{portfolio}} come from this profile. Anything else ({{company}}, {{client}}) is left for you — a letter with one left is never filled in automatically.';
  const CORE = ['given-name', 'family-name', 'email', 'tel', 'street-address', 'address-level2', 'postal-code', 'country-name'];
  const completeness = (p) => Math.round(100 * CORE.filter(k => p.fields && p.fields[k]).length / CORE.length);

  async function profileEditor(p, rerender, { copy = false } = {}) {
    const label = h('input', { type: 'text', value: p ? (copy ? `${p.label} (copy)` : p.label) : '', placeholder: 'Job applications' });
    const f = Object.fromEntries(FIELDS.map(([k, , ph]) => [k, LONG.has(k) ? h('textarea', { rows: 4, value: (p && p.fields && p.fields[k]) || '', placeholder: ph || '' })
      : h('input', { placeholder: ph || '', type: k === 'email' ? 'email' : k.startsWith('tel') ? 'tel' : ['url', 'github', 'upwork-url', 'fiverr-url'].includes(k) ? 'url' : 'text', autocomplete: 'off', value: (p && p.fields && p.fields[k]) || '' })]));
    const TEXT_DOCS = new Set(['coverLetter', 'proposal']);
    const d = Object.fromEntries(DOCS.map(([k]) => [k, TEXT_DOCS.has(k) ? h('textarea', { rows: 5, value: (p && p.documents && p.documents[k]) || '', placeholder: k === 'proposal' ? 'Hi, I read your post about … I’m {{first_name}}, {{headline}} with {{years}} years in {{skills}}. …' : 'Dear {{company}} team, …' }) : h('input', { type: 'url', value: (p && p.documents && p.documents[k]) || '' })]));
    const meter = h('div', { class: 'af-meter' });
    const paintMeter = () => {
      const n = CORE.filter(k => f[k].value.trim()).length;
      meter.replaceChildren(h('span', { style: { width: `${Math.round(100 * n / CORE.length)}%` } }), h('b', { text: `${n}/${CORE.length} of the fields most forms ask for` }));
    };
    Object.values(f).forEach(i => i.addEventListener('input', paintMeter)); paintMeter();
    const resume = p && p.documents && p.documents.resume;
    const r = await modal({ title: p && !copy ? `Edit “${p.label}”` : copy ? 'Duplicate profile' : 'New autofill profile', wide: true, body: [
      field('Profile name', label), meter,
      GROUPS.map(([g, fs]) => h('details', { class: 'af-group', open: ['Name', 'Contact'].includes(g) || fs.some(([k]) => f[k].value) ? '' : null },
        h('summary', { text: `${g} \u00B7 ${fs.filter(([k]) => f[k].value).length}/${fs.length}` }), h('div', { class: 'grid' }, fs.filter(([k]) => !LONG.has(k)).map(([k, l]) => field(l, f[k]))),
        fs.filter(([k]) => LONG.has(k)).map(([k, l]) => h('div', { style: { marginTop: '10px' } }, field(l, f[k]))))),
      h('details', { class: 'af-group', open: '' }, h('summary', { text: 'Documents' }),
        h('div', { class: 'grid' }, DOCS.filter(([k]) => !TEXT_DOCS.has(k)).map(([k, l]) => field(l, d[k]))), field('Cover letter template', d.coverLetter, TEMPLATE_HELP), field('Proposal template (Upwork, Fiverr)', d.proposal),
        resume ? h('p', { class: 'blurb', text: `Résumé on file: ${resume.filename || resume.path || 'attached'} — kept as is.` }) : null),
    ], actions: [{ label: p && !copy ? 'Save profile' : 'Create profile', primary: true, run: () => {
      const fields = Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.value.trim()]).filter(([, v]) => v));
      const documents = Object.fromEntries(Object.entries(d).map(([k, el]) => [k, el.value.trim()]).filter(([, v]) => v));
      if (resume) documents.resume = resume; // not editable here — keep it, never drop it silently
      if (!label.value.trim() && !(p && !copy)) throw new Error('Name the profile.');
      return call(() => p && !copy ? cg.autofill.updateProfile(p.id, { label: label.value.trim() || p.label, fields, documents }) : cg.autofill.createProfile({ label: label.value.trim(), fields, documents }), 'save profile');
    } }] });
    if (r) { toast('Profile saved'); rerender(); }
  }

  async function fillFlow(p) {
    const agents = await agentOptions();
    if (!agents.length) throw new Error('Open the tab with the form first.');
    const target = select(agents);
    const conf = select([{ value: 'high', label: 'High only' }, { value: 'medium', label: 'Medium and up' }, { value: 'low', label: 'Low and up' }], 'medium');
    const out = h('div', { class: 'af-out', 'aria-live': 'polite' });
    const line = (text, kind = '') => h('div', { class: `af-line ${kind}`.trim(), text });
    const detect = btn('Preview matches', (e) => busy(e.currentTarget, async () => {
      out.replaceChildren(line('Looking at the page…'));
      const r = await call(() => cg.autofill.detect(p.id, target.value), 'detect');
      out.replaceChildren(...((r.matches || []).length
        ? [line(`${r.matches.length} of ${r.totalFields} field${r.totalFields === 1 ? '' : 's'} on the page match this profile:`), ...r.matches.map(m => line(`${m.fieldType} \u2014 ${m.confidence} confidence \u2014 ${m.source}${m.needsEdit ? ' \u2014 template still has {{placeholders}}, left for you' : ''}`, `c-${m.confidence}`))]
        : [line(`No field matches (${r.totalFields || 0} on the page).`)]));
    }), 'sm');
    const doFill = btn('Fill', (e) => busy(e.currentTarget, async () => {
      out.replaceChildren(line('Filling…'));
      const r = await call(() => cg.autofill.fill(p.id, target.value, conf.value), 'fill');
      const lines = [line(`Filled ${(r.filled || []).length} field(s) — nothing is submitted.`, 'ok')];
      if (r.skipped && r.skipped.length) lines.push(line(`Left ${r.skipped.length} below \u201C${conf.value}\u201D confidence for you`));
      (r.failed || []).forEach(x => lines.push(line(`${x.fieldType}: ${x.error}`, 'bad')));
      out.replaceChildren(...lines);
    }), 'sm primary');
    await modal({ title: `Fill a form with \u201C${p.label}\u201D`, wide: true, body: [h('div', { class: 'grid' }, field('Tab', target), field('Fill fields matched with', conf)), h('div', { class: 'af-acts' }, detect, doFill), out] });
  }

  async function answerTest(s) {
    const q = h('textarea', { rows: 2, placeholder: 'Why do you want to work here?' });
    const out = h('pre', { class: 'out', hidden: true });
    await modal({ title: 'Try an answer', wide: true, body: [
      field('Question', q, 'Answered with the context and profile set on this page — nothing is typed anywhere'),
      h('div', {}, btn('Answer', (e) => busy(e.currentTarget, async () => {
        if (!q.value.trim()) throw new Error('Write a question.');
        const r = await call(() => cg.screenQa.answer(q.value.trim(), s.screenQaContext || '', 'settings'), 'answer');
        out.hidden = false; out.textContent = r.text || r.answer || JSON.stringify(r, null, 2);
      }), 'primary')), out] });
  }

  // ── Proposals & cover letters — §0.39.265 ──────────────────────────────
  // Draft an Upwork proposal, a Fiverr offer or a cover letter for one job post
  // from a profile (src/autofill/proposal.js, through the co-pilot). The job
  // post is pasted or read from an open tab. A draft only: you edit and copy it.
  function proposalPane(profiles) {
    if (!profiles.length) return pane({ title: 'Proposals & cover letters', body: h('p', { class: 'blurb', text: 'Create a profile first — its headline, skills and summary are what a proposal is written from.' }) });
    const prof = select(profiles.map(p => ({ value: p.id, label: p.label })), profiles[0].id);
    const platform = select([{ value: 'upwork', label: 'Upwork proposal' }, { value: 'fiverr', label: 'Fiverr offer / buyer request' }, { value: 'job', label: 'Job cover letter' }], 'upwork');
    const length = select([{ value: 'short', label: 'Short (80–140 words)' }, { value: 'medium', label: 'Medium (150–220)' }, { value: 'long', label: 'Long (250–350)' }], 'short');
    const post = h('textarea', { rows: 7, placeholder: 'Paste the job post here, or read it from the tab it is open in.' });
    const extra = h('input', { type: 'text', placeholder: 'Optional: mention my 24-hour turnaround; ask about their deadline' });
    const draft = h('textarea', { rows: 10, class: 'af-draft', placeholder: 'The draft appears here. Edit it before you send it.' });
    const meta = h('div', { class: 'blurb' });
    const readTab = btn('Read from a tab', async (e) => {
      const agents = await agentOptions();
      if (!agents.length) throw new Error('Open the job post in a tab first.');
      const tab = select(agents);
      const ok = await modal({ title: 'Read the job post from…', body: [field('Tab', tab)], actions: [{ label: 'Read', primary: true, run: () => true }] });
      if (!ok) return;
      await busy(e.currentTarget, async () => {
        const r = await call(() => cg.autofill.readPage(tab.value), 'read page');
        if (!r.ok) throw new Error(r.error);
        post.value = r.text.trim(); meta.textContent = r.url ? `Read from ${r.url}` : '';
        if (r.url && /upwork\.com/.test(r.url)) platform.value = 'upwork'; else if (r.url && /fiverr\.com/.test(r.url)) platform.value = 'fiverr';
      });
    }, 'sm');
    const go = btn('Draft it', (e) => busy(e.currentTarget, async () => {
      if (post.value.trim().length < 40) throw new Error('Paste the job post first.');
      draft.value = ''; meta.textContent = 'Drafting…';
      const r = await call(() => cg.autofill.proposal({ profileId: prof.value, jobPost: post.value, platform: platform.value, length: length.value, extra: extra.value }), 'draft');
      if (!r.ok) { meta.textContent = ''; throw new Error(r.error); }
      draft.value = r.text; meta.textContent = `${r.text.split(/\s+/).filter(Boolean).length} words — check every claim before sending.`;
    }), 'primary');
    const copyBtn = btn('Copy', () => { if (!draft.value.trim()) return toast('Nothing to copy yet', 'warn'); navigator.clipboard.writeText(draft.value).then(() => toast('Copied — paste it into the proposal box')); }, 'sm');
    return pane({ title: 'Proposals & cover letters', sub: 'Upwork, Fiverr or a job ad — written only from what your profile says. Nothing is sent.', body: [
      h('div', { class: 'grid' }, field('Profile', prof), field('For', platform), field('Length', length)),
      h('div', { class: 'af-post-head' }, h('span', { class: 'lbl', text: 'Job post' }), readTab), post,
      field('Anything to add', extra),
      h('div', { class: 'af-acts' }, go, copyBtn), meta, draft] });
  }

  // ── Fiverr gigs — §0.39.301 ────────────────────────────────────────────
  // James: "I just want it to write gigs for me. Not automate talking or posting." A gig written from a profile and
  // one line of what it offers (src/autofill/gig.js, through the co-pilot), every part editable and copyable, and —
  // only when asked — typed into Fiverr's gig editor in a tab. Nothing is saved or published: that stays his click.
  const GIG_LIMIT = { title: 80, tags: 200, description: 1200, name: 35, 'package-description': 100, question: 150, answer: 300, requirement: 200 };
  function _limitFor(key) {
    if (key === 'title') return GIG_LIMIT.title;
    if (key === 'description') return GIG_LIMIT.description;
    if (/\.name$/.test(key)) return GIG_LIMIT.name;
    if (/^(basic|standard|premium)\.description$/.test(key)) return GIG_LIMIT['package-description'];
    if (/\.question$/.test(key)) return GIG_LIMIT.question;
    if (/\.answer$/.test(key)) return GIG_LIMIT.answer;
    if (/^requirement\./.test(key)) return GIG_LIMIT.requirement;
    return 0;
  }
  // write an edited part back into the gig the fill uses, so what is typed is what he edited
  function _setPart(gig, key, text) {
    const v = String(text);
    if (key === 'title') gig.title = /^i will\b/i.test(v) ? v : `I will ${v}`;
    else if (key === 'tags') gig.tags = v.split(',').map(t => t.trim()).filter(Boolean);
    else if (key === 'description') gig.description = v;
    else if (key === 'category') gig.category = v;
    else {
      const m = /^(basic|standard|premium)\.(name|description)$/.exec(key);
      const f = /^faq\.(\d+)\.(question|answer)$/.exec(key);
      const q = /^requirement\.(\d+)$/.exec(key);
      if (m && gig.packages[m[1]]) gig.packages[m[1]][m[2]] = v;
      else if (f && gig.faq[+f[1]]) gig.faq[+f[1]][f[2]] = v;
      else if (q) gig.requirements[+q[1]] = v;
    }
  }
  function gigPane(profiles) {
    if (!profiles.length) return pane({ title: 'Fiverr gigs', body: h('p', { class: 'blurb', text: 'Create a profile first — the gig is written only from what it says about you.' }) });
    const prof = select(profiles.map(p => ({ value: p.id, label: p.label })), profiles[0].id);
    const offer = h('input', { type: 'text', placeholder: 'What this gig offers, in your words — e.g. simple websites for small businesses' });
    const extra = h('input', { type: 'text', placeholder: 'Optional: keep the basic package under $40; mention 3-day delivery' });
    const meta = h('div', { class: 'blurb' });
    const warn = h('div', { class: 'af-gig-warn' });
    const parts = h('div', { class: 'af-gig-parts' });
    let gig = null;
    const copy = (text, what) => navigator.clipboard.writeText(text).then(() => toast(`${what} copied`));
    const render = (r) => {
      gig = r.gig;
      warn.replaceChildren(...(r.warnings || []).map(w => h('div', { text: `⚠ ${w}` })));
      parts.replaceChildren(...r.parts.map(p => {
        const lim = _limitFor(p.key);
        const ta = h('textarea', { rows: p.key === 'description' ? 8 : Math.min(4, Math.max(1, Math.ceil(p.text.length / 90))), value: p.text });
        const n = h('div', { class: 'n' });
        const count = () => { n.textContent = lim ? `${ta.value.length} / ${lim}` : ''; n.classList.toggle('over', !!lim && ta.value.length > lim); };
        ta.addEventListener('input', () => { _setPart(gig, p.key, ta.value); count(); });
        count();
        return h('div', { class: 'af-gig-part' }, h('span', { class: 'lbl', text: p.label }), ta, btn('Copy', () => copy(ta.value, p.label), 'sm'), n);
      }));
      meta.textContent = 'Read every part before you use it. Nothing has been typed anywhere.';
    };
    const write = btn('Write the gig', (e) => busy(e.currentTarget, async () => {
      if (offer.value.trim().length < 8) throw new Error('Say in a line what this gig offers.');
      parts.replaceChildren(); warn.replaceChildren(); meta.textContent = 'Writing…';
      const r = await call(() => cg.autofill.gig({ profileId: prof.value, offer: offer.value.trim(), extra: extra.value.trim() }), 'write gig');
      if (!r.ok) { meta.textContent = ''; throw new Error(r.error); }
      render(r);
    }), 'primary');
    const copyAll = btn('Copy everything', () => {
      if (!gig) return toast('Write the gig first', 'warn');
      const all = [...parts.querySelectorAll('.af-gig-part')].map(el => `${el.querySelector('.lbl').textContent.toUpperCase()}\n${el.querySelector('textarea').value}`).join('\n\n');
      copy(all, 'The gig');
    }, 'sm');
    const fill = btn('Fill the gig editor in a tab', () => gigFillFlow(() => gig).catch(e => toast(e.message, 'bad')), 'sm');
    return pane({ title: 'Fiverr gigs', sub: 'Written only from your profile and your one line. It types into the gig editor only when you ask, and never saves or publishes.', body: [
      h('div', { class: 'grid' }, field('Profile', prof), field('What the gig offers', offer)),
      field('Anything to add', extra),
      h('div', { class: 'af-acts' }, write, copyAll, fill), meta, warn, parts] });
  }
  async function gigFillFlow(getGig) {
    const gig = getGig();
    if (!gig) throw new Error('Write the gig first.');
    const agents = await agentOptions();
    if (!agents.length) throw new Error('Open Fiverr’s gig editor in a tab first (Selling › Gigs › Create a new gig).');
    const target = select(agents);
    const conf = select([{ value: 'medium', label: 'Medium and up' }, { value: 'low', label: 'Low and up' }], 'medium');
    const out = h('div', { class: 'af-out', 'aria-live': 'polite' });
    const line = (text, kind = '') => h('div', { class: `af-line ${kind}`.trim(), text });
    const left = (keys) => keys && keys.length ? [line(`Still to copy by hand (${keys.length}): ${keys.join(', ')} — Fiverr’s dropdowns and some boxes are its own widgets`)] : [];
    const preview = btn('Preview', (e) => busy(e.currentTarget, async () => {
      out.replaceChildren(line('Looking at the page…'));
      const r = await call(() => cg.autofill.gigDetect(gig, target.value), 'preview');
      if (r.error) throw new Error(r.error);
      out.replaceChildren(...(r.matches.length
        ? [line(`${r.matches.length} of ${r.totalFields} field${r.totalFields === 1 ? '' : 's'} on this page take a part of the gig:`), ...r.matches.map(m => line(`${m.key} — ${m.confidence} — by ${m.source}`, `c-${m.confidence}`))]
        : [line(`No field on this page matches a part of the gig (${r.totalFields} fields). Fiverr’s editor has several steps — open the step you want filled.`)]), ...left(r.leftToCopy));
    }), 'sm');
    const doFill = btn('Fill', (e) => busy(e.currentTarget, async () => {
      out.replaceChildren(line('Filling…'));
      const r = await call(() => cg.autofill.gigFill(gig, target.value, conf.value), 'fill');
      if (r.error) throw new Error(r.error);
      const lines = [line(`Filled ${r.filled.length} field(s). Nothing is saved or published — check the page, then save it yourself.`, 'ok')];
      if (r.skipped.length) lines.push(line(`Left ${r.skipped.length} below “${conf.value}” confidence for you`));
      r.failed.forEach(x => lines.push(line(`${x.key}: ${x.error}`, 'bad')));
      out.replaceChildren(...lines, ...left(r.leftToCopy));
    }), 'sm primary');
    await modal({ title: 'Fill Fiverr’s gig editor', wide: true, body: [
      h('p', { class: 'blurb', text: 'Fiverr’s editor is in steps (Overview, Pricing, Description & FAQ, Requirements). Open a step in the tab, fill it here, check it, save it on Fiverr, then do the next step.' }),
      h('div', { class: 'grid' }, field('Tab', target), field('Fill fields matched with', conf)), h('div', { class: 'af-acts' }, preview, doFill), out] });
  }

  section({
    id: 'autofill', group: 'Browser', icon: '\u270E', label: 'Autofill & answers',
    keywords: 'autofill profile job application screen question answer ctrl shift a resume cover letter address phone email fill form detect upwork fiverr freelance proposal gig salary',
    blurb: 'Profiles Clear Glass fills forms from, and how it answers open questions on a page (Ctrl+Shift+A or right-click \u2192 Answer this question).',
    async render({ tools, rerender }) {
      const [profiles, s] = await Promise.all([call(() => cg.autofill.listProfiles(), 'profiles'), call(() => cg.api.get(), 'settings')]);
      tools.append(btn('New profile', () => profileEditor(null, rerender), 'primary'));
      const save = (patch) => call(() => cg.api.set(patch), 'save');
      const minConf = select([{ value: 'high', label: 'High only' }, { value: 'medium', label: 'Medium and up' }, { value: 'low', label: 'Low and up' }], s.screenQaMinConfidence || 'medium');
      minConf.addEventListener('change', () => save({ screenQaMinConfidence: minConf.value }).then(() => toast('Saved'), e => toast(e.message, 'bad')));
      const prof = select([{ value: '', label: 'None' }, ...profiles.map(p => ({ value: p.id, label: p.label }))], s.screenQaProfileId || '');
      prof.addEventListener('change', () => save({ screenQaProfileId: prof.value }).then(() => toast('Saved'), e => toast(e.message, 'bad')));
      const ctx = h('textarea', { rows: 4, value: s.screenQaContext || '', placeholder: 'e.g. 5 years backend engineering, Node.js and distributed systems, based in Portland OR' });
      ctx.addEventListener('change', () => save({ screenQaContext: ctx.value }).then(() => toast('Context saved'), e => toast(e.message, 'bad')));
      return [
        pane({ title: 'Profiles', sub: 'Filling never submits a form. Low-confidence matches are left for you.', flush: true, body: profiles.length ? profiles.map(p => row(p.label, `${Object.keys(p.fields || {}).length} fields${p.documents && Object.keys(p.documents).length ? ` \u00B7 ${Object.keys(p.documents).join(', ')}` : ''} \u00B7 updated ${ago(p.updatedAt)}${s.screenQaProfileId === p.id ? ' \u00B7 used for answers' : ''}`,
          chip(`${completeness(p)}% complete`, completeness(p) >= 75 ? 'ok' : 'warn'),
          btn('Fill a tab', () => fillFlow(p).catch(e => toast(e.message, 'bad')), 'sm primary'),
          btn('Edit', () => profileEditor(p, rerender), 'sm'),
          btn('Duplicate', () => profileEditor(p, rerender, { copy: true }), 'sm'),
          btn('Delete', async () => { if (await confirmDo(`Delete “${p.label}”?`, 'Forms can no longer be filled from it.', 'Delete')) { await busy(null, () => call(() => cg.autofill.deleteProfile(p.id), 'delete')); rerender(); } }, 'sm danger')))
          : empty('No profiles yet.', btn('Create one', () => profileEditor(null, rerender), 'sm')) }),
        proposalPane(profiles),
        gigPane(profiles),
        pane({ title: 'Answering questions on screen', body: [
          h('div', { class: 'row', style: { padding: '0 0 12px', borderTop: 0 } }, h('div', { class: 'what' }, h('div', { class: 't', text: 'Enabled' }), h('div', { class: 'd', text: 'Every answer is shown to you first \u2014 nothing is typed into a page on its own.' })),
            toggle(s.screenQaEnabled !== false, (on) => save({ screenQaEnabled: on }))),
          h('div', { class: 'grid' }, field('Leave to autofill when confidence is', minConf), field('Use this profile as context', prof)),
          h('div', { style: { marginTop: '12px' } }, field('Extra context for every answer', ctx)),
          cg.screenQa && cg.screenQa.answer ? h('div', { style: { marginTop: '12px' } }, btn('Try an answer', () => answerTest(s).catch(e => toast(e.message, 'bad')), 'sm')) : null,
        ] }),
      ];
    },
  });
})();
