'use strict';
/**
 * renderer/library/sections/autofill.js — Library → Autofill  (styles: autofill.css)
 * Ported 0.39.241 from ui/library/library-app.js (TABS.autofill, editAutofillProfile,
 * fillAutofillProfile): profiles for job applications, contact forms and checkout
 * — not sign-ins (those are Passwords). CRUD through /cli/autofill/profiles; the
 * field list comes from the store's own FIELD_TYPES (/cli/autofill/field-types),
 * never a hand-kept copy. Detect and Fill act on a live agent tab picked from the
 * windows open right now.
 */
(function () {
  const { h, busy, modal, confirmDo, field, pane, row, btn, empty, fail, toast, agentOptions, select, section } = window.CGS;
  const { api, matches } = window.CGL;
  let fieldTypesCache = null;
  const fieldTypes = async () => fieldTypesCache || (fieldTypesCache = await api('/cli/autofill/field-types').catch(() => ({ fieldTypes: {} })));

  async function edit(existing, rerender) {
    const { fieldTypes: FT } = await fieldTypes();
    const label = h('input', { type: 'text', value: existing ? existing.label : '' });
    const inputs = Object.values(FT || {}).map(f => ({ f, el: h('input', { type: 'text', value: (existing && existing.fields && existing.fields[f]) || '' }) }));
    const ok = await modal({
      title: existing ? `Edit “${existing.label}”` : 'New autofill profile', wide: true,
      body: [field('Label', label), h('div', { class: 'grid' }, inputs.map(i => field(i.f, i.el)))],
      actions: [{ label: existing ? 'Save' : 'Create', primary: true, run: async () => {
        if (!label.value.trim()) throw new Error('A label is required.');
        const fields = Object.fromEntries(inputs.filter(i => i.el.value.trim()).map(i => [i.f, i.el.value.trim()]));
        await (existing
          ? api(`/cli/autofill/profiles/${encodeURIComponent(existing.id)}`, { method: 'PUT', body: { label: label.value.trim(), fields } })
          : api('/cli/autofill/profiles', { method: 'POST', body: { label: label.value.trim(), fields } }));
      } }],
    });
    if (ok) rerender();
  }

  async function fill(p) {
    const opts = await agentOptions();
    if (!opts.length) return toast('No agent windows are open — open one first.', 'warn', 5000);
    const target = select(opts, opts[0].value);
    const conf = select([{ value: 'high', label: 'High only' }, { value: 'medium', label: 'Medium and up' }, { value: 'low', label: 'Low and up' }], 'medium');
    const out = h('div', { class: 'af-out', 'aria-live': 'polite' });
    const line = (text, kind = '') => h('div', { class: `af-line ${kind}`.trim(), text });
    const detect = btn('Detect fields', (e) => busy(e.currentTarget, async () => {
      out.replaceChildren(line('Detecting…'));
      const r = await api('/cli/autofill/detect', { method: 'POST', body: { agentId: target.value, profileId: p.id } });
      out.replaceChildren(...((r.matches || []).length
        ? r.matches.map(m => line(`${m.fieldType} — ${m.confidence} — ${m.source}`, `c-${m.confidence}`))
        : [line(`No matching fields (${r.totalFields} field${r.totalFields === 1 ? '' : 's'} on the page).`)]));
    }), 'sm');
    const doFill = btn('Fill', (e) => busy(e.currentTarget, async () => {
      out.replaceChildren(line('Filling…'));
      const r = await api('/cli/autofill/fill', { method: 'POST', body: { agentId: target.value, profileId: p.id, minConfidence: conf.value } });
      const lines = [line(`Filled ${r.filled.length} field(s)`, 'ok')];
      if (r.skipped && r.skipped.length) lines.push(line(`Skipped ${r.skipped.length} below “${conf.value}” confidence`));
      (r.failed || []).forEach(f => lines.push(line(`${f.fieldType}: ${f.error}`, 'bad')));
      out.replaceChildren(...lines);
    }), 'sm primary');
    await modal({ title: `Fill a form with “${p.label}”`, body: [field('Target tab', target), field('Minimum confidence', conf), h('div', { class: 'af-acts' }, detect, doFill), out] });
  }

  section({
    id: 'autofill', group: 'Identity', icon: '✎', label: 'Autofill',
    blurb: 'Profiles for job applications, contact forms and checkout — not sign-ins (see Passwords).',
    async render({ tools, rerender, query }) {
      tools.append(btn('New profile', () => edit(null, rerender).catch(fail), 'primary sm'));
      const r = await api('/cli/autofill/profiles');
      const all = r.profiles || [];
      const list = all.filter(p => matches(query, p.label));
      if (!all.length) return pane({ flush: true, body: empty('No autofill profiles yet.', btn('New profile', () => edit(null, rerender).catch(fail), 'sm')) });
      return pane({
        title: query ? `${list.length} of ${all.length}` : `${all.length} profile${all.length === 1 ? '' : 's'}`, flush: true,
        body: list.length ? list.map(p => row(p.label,
          [`${Object.keys(p.fields || {}).length} field(s)`, Object.keys(p.documents || {}).length ? `${Object.keys(p.documents).length} document(s)` : null].filter(Boolean).join(' · '),
          btn('Fill…', () => fill(p).catch(fail), 'sm'),
          btn('Edit', () => edit(p, rerender).catch(fail), 'sm'),
          btn('Delete', async (e) => {
            if (!await confirmDo(`Delete “${p.label}”?`, 'Forms can no longer be filled from it.', 'Delete')) return;
            await busy(e.target, async () => { await api(`/cli/autofill/profiles/${encodeURIComponent(p.id)}`, { method: 'DELETE' }); rerender(); });
          }, 'sm danger'))) : empty(`Nothing matches “${query}”.`),
      });
    },
  });
})();
