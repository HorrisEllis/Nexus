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
  const { cg, h, call, toast, busy, modal, confirmDo, field, pane, row, btn, chip, empty, ago, toggle, select, section } = window.CGS;

  // ── Autofill ───────────────────────────────────────────────────────────
  const FIELDS = [
    ['given-name', 'First name'], ['family-name', 'Last name'], ['email', 'Email'], ['tel', 'Phone'],
    ['street-address', 'Street address'], ['address-level2', 'City'], ['address-level1', 'State / region'], ['postal-code', 'Postal code'], ['country-name', 'Country'],
    ['organization', 'Current employer'], ['organization-title', 'Current title'], ['url', 'Website'],
  ];
  const DOCS = [['linkedinUrl', 'LinkedIn URL'], ['portfolioUrl', 'Portfolio URL'], ['coverLetter', 'Cover letter template']];

  async function profileEditor(p, rerender) {
    const label = h('input', { type: 'text', value: p ? p.label : '' , placeholder: 'Job applications' });
    const f = Object.fromEntries(FIELDS.map(([k]) => [k, h('input', { type: 'text', value: (p && p.fields && p.fields[k]) || '' })]));
    const d = Object.fromEntries(DOCS.map(([k]) => [k, k === 'coverLetter' ? h('textarea', { rows: 4, value: (p && p.documents && p.documents[k]) || '' }) : h('input', { type: 'url', value: (p && p.documents && p.documents[k]) || '' })]));
    const r = await modal({ title: p ? `Edit “${p.label}”` : 'New autofill profile', wide: true, body: [
      field('Profile name', label), h('div', { class: 'grid' }, FIELDS.map(([k, l]) => field(l, f[k]))), h('div', { class: 'grid' }, DOCS.map(([k, l]) => field(l, d[k]))),
    ], actions: [{ label: p ? 'Save profile' : 'Create profile', primary: true, run: () => {
      const fields = Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.value.trim()]).filter(([, v]) => v));
      const documents = Object.fromEntries(Object.entries(d).map(([k, el]) => [k, el.value.trim()]).filter(([, v]) => v));
      if (p && p.documents && p.documents.resume) documents.resume = p.documents.resume; // not editable here — keep it, never drop it silently
      return call(() => p ? cg.autofill.updateProfile(p.id, { label: label.value.trim() || p.label, fields, documents }) : cg.autofill.createProfile({ label: label.value.trim(), fields, documents }), 'save profile');
    } }] });
    if (r) { toast('Profile saved'); rerender(); }
  }

  section({
    id: 'autofill', group: 'Browser', icon: '\u270E', label: 'Autofill & answers',
    keywords: 'autofill profile job application screen question answer ctrl shift a resume cover letter',
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
        pane({ title: 'Profiles', flush: true, body: profiles.length ? profiles.map(p => row(p.label, `${Object.keys(p.fields || {}).length} fields${p.documents && Object.keys(p.documents).length ? ` \u00B7 ${Object.keys(p.documents).join(', ')}` : ''} \u00B7 updated ${ago(p.updatedAt)}`,
          btn('Edit', () => profileEditor(p, rerender), 'sm'),
          btn('Delete', async () => { if (await confirmDo(`Delete “${p.label}”?`, 'Forms can no longer be filled from it.', 'Delete')) { await busy(null, () => call(() => cg.autofill.deleteProfile(p.id), 'delete')); rerender(); } }, 'sm danger')))
          : empty('No profiles yet.', btn('Create one', () => profileEditor(null, rerender), 'sm')) }),
        pane({ title: 'Answering questions on screen', body: [
          h('div', { class: 'row', style: { padding: '0 0 12px', borderTop: 0 } }, h('div', { class: 'what' }, h('div', { class: 't', text: 'Enabled' }), h('div', { class: 'd', text: 'Every answer is shown to you first \u2014 nothing is typed into a page on its own.' })),
            toggle(s.screenQaEnabled !== false, (on) => save({ screenQaEnabled: on }))),
          h('div', { class: 'grid' }, field('Leave to autofill when confidence is', minConf), field('Use this profile as context', prof)),
          h('div', { style: { marginTop: '12px' } }, field('Extra context for every answer', ctx)),
        ] }),
      ];
    },
  });
})();
