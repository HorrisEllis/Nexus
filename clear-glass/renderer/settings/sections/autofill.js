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
  ];
  const FIELDS = GROUPS.flatMap(([, f]) => f);
  const DOCS = [['linkedinUrl', 'LinkedIn URL'], ['portfolioUrl', 'Portfolio URL'], ['coverLetter', 'Cover letter template']];
  const CORE = ['given-name', 'family-name', 'email', 'tel', 'street-address', 'address-level2', 'postal-code', 'country-name'];
  const completeness = (p) => Math.round(100 * CORE.filter(k => p.fields && p.fields[k]).length / CORE.length);

  async function profileEditor(p, rerender, { copy = false } = {}) {
    const label = h('input', { type: 'text', value: p ? (copy ? `${p.label} (copy)` : p.label) : '', placeholder: 'Job applications' });
    const f = Object.fromEntries(FIELDS.map(([k]) => [k, h('input', { type: k === 'email' ? 'email' : k.startsWith('tel') ? 'tel' : k === 'url' ? 'url' : 'text', autocomplete: 'off', value: (p && p.fields && p.fields[k]) || '' })]));
    const d = Object.fromEntries(DOCS.map(([k]) => [k, k === 'coverLetter' ? h('textarea', { rows: 5, value: (p && p.documents && p.documents[k]) || '', placeholder: 'Dear {{company}} team, …' }) : h('input', { type: 'url', value: (p && p.documents && p.documents[k]) || '' })]));
    const meter = h('div', { class: 'af-meter' });
    const paintMeter = () => {
      const n = CORE.filter(k => f[k].value.trim()).length;
      meter.replaceChildren(h('span', { style: { width: `${Math.round(100 * n / CORE.length)}%` } }), h('b', { text: `${n}/${CORE.length} of the fields most forms ask for` }));
    };
    Object.values(f).forEach(i => i.addEventListener('input', paintMeter)); paintMeter();
    const resume = p && p.documents && p.documents.resume;
    const r = await modal({ title: p && !copy ? `Edit “${p.label}”` : copy ? 'Duplicate profile' : 'New autofill profile', wide: true, body: [
      field('Profile name', label), meter,
      GROUPS.map(([g, fs]) => h('details', { class: 'af-group', open: g !== 'Address' || fs.some(([k]) => f[k].value) ? '' : null },
        h('summary', { text: `${g} \u00B7 ${fs.filter(([k]) => f[k].value).length}/${fs.length}` }), h('div', { class: 'grid' }, fs.map(([k, l]) => field(l, f[k]))))),
      h('details', { class: 'af-group', open: '' }, h('summary', { text: 'Documents' }),
        h('div', { class: 'grid' }, DOCS.filter(([k]) => k !== 'coverLetter').map(([k, l]) => field(l, d[k]))), field('Cover letter template', d.coverLetter),
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
        ? [line(`${r.matches.length} of ${r.totalFields} field${r.totalFields === 1 ? '' : 's'} on the page match this profile:`), ...r.matches.map(m => line(`${m.fieldType} \u2014 ${m.confidence} confidence \u2014 ${m.source}`, `c-${m.confidence}`))]
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

  section({
    id: 'autofill', group: 'Browser', icon: '\u270E', label: 'Autofill & answers',
    keywords: 'autofill profile job application screen question answer ctrl shift a resume cover letter address phone email fill form detect',
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
