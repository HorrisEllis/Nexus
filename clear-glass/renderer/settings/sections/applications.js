'use strict';
/**
 * renderer/settings/sections/applications.js — Applications  (styles: applications.css)
 *
 * 0.60.281 AP4 — James, 2026-10-29: "also capturing the contact info for job applications."
 * The job applications and the contacts behind them. Both are the opportunity system's (lib/opportunity, served by Copilot on
 * /api/opportunity); this screen reaches them only through cg.applications.call → the bridge's allowlisted proxy (§5.15). A contact is
 * captured when a job page is read (opp capture / prepare), or added here by hand; edited here; archived, never deleted.
 */
(function () {
  const { cg, h, toast, fail, busy, modal, field, pane, btn, chip, empty, ago, copy, select, section } = window.CGS;
  const api = async (method, path, body) => {
    const r = await cg.applications.call(method, path, body);
    if (!r || r.ok === false || r.error) { const e = new Error((r && r.error) || 'no answer from Copilot'); e.down = !!(r && r.down); throw e; }
    return r;
  };
  const STAGE_KIND = { SUBMITTED: 'ok', RESPONDED: 'ok', INTERVIEW: 'ok', OFFER: 'ok', READY: 'ok', NEEDS_INPUT: 'warn', NEEDS_LOGIN: 'warn', FAILED: 'bad', REJECTED: 'bad', DISMISSED: '' };
  const FIELDS = [['name', 'Name'], ['role', 'Role'], ['company', 'Company'], ['email', 'Email'], ['phone', 'Phone'], ['site', 'Site'], ['linkedin', 'LinkedIn'], ['status', 'Status'], ['notes', 'Notes']];
  const state = { q: '', archived: false, stage: '' };

  async function editContact(c, jobs, rerender) {
    const inputs = {};
    const body = FIELDS.map(([k, label]) => {
      const i = k === 'notes' ? h('textarea', { rows: '3' }) : h('input', { type: k === 'email' ? 'email' : 'text', placeholder: k === 'status' ? 'empty: the job\'s stage' : '' });
      i.value = (c && c[k]) || ''; i.dataset.k = k; inputs[k] = i;
      return field(label, i);
    });
    const job = select([{ value: '', label: '— no job —' }, ...jobs.map(o => ({ value: o.id, label: `${o.title}${o.company ? ' · ' + o.company : ''}` }))], (c && c.oppId) || '', { 'data-k': 'oppId' });
    body.push(field('Job', job));
    const saved = await modal({ title: c ? 'Edit contact' : 'Add a contact', wide: true, body: [h('div', { class: 'ap-form' }, body)], actions: [{ label: c ? 'Save' : 'Add', primary: true, run: async () => {
      const patch = {}; for (const [k] of FIELDS) { const v = inputs[k].value.trim(); if (c ? v !== (c[k] || '') : v) patch[k] = v; }
      if (job.value !== ((c && c.oppId) || '')) patch.oppId = job.value || null;
      if (c && !Object.keys(patch).length) return 'unchanged';
      const r = c ? await api('PUT', `/api/opportunity/contacts/${encodeURIComponent(c.id)}`, patch) : await api('POST', '/api/opportunity/contacts', patch);
      return r.deduped ? 'held' : 'saved';
    } }] });
    if (saved === 'held') toast('That contact is already held for this job');
    else if (saved === 'saved') toast(c ? 'Contact saved' : 'Contact added');
    if (saved) rerender();
  }

  function contactRow(c, jobs, rerender) {
    const who = [c.name, c.role].filter(Boolean).join(' · ') || '(no name)';
    const reach = h('div', { class: 'ap-reach' },
      c.email ? h('a', { href: `mailto:${c.email}`, text: c.email, title: 'Write to them' }) : null,
      c.phone ? h('a', { href: `tel:${c.phone.replace(/[^\d+]/g, '')}`, text: c.phone }) : null,
      c.site ? h('span', { text: c.site }) : null, c.linkedin ? h('span', { text: c.linkedin }) : null);
    return h('div', { class: `ap-contact${c.archived ? ' archived' : ''}`, 'data-contact': c.id },
      h('div', { class: 'ap-who' }, h('div', { class: 't', text: who }), c.company ? h('div', { class: 'd', text: c.company }) : null, reach),
      h('div', { class: 'ap-job' }, h('div', { class: 'd', text: c.oppTitle || 'no job' }),
        h('div', { class: 'ap-chips' }, chip(c.status || '—', STAGE_KIND[c.status] || ''), chip(c.source === 'page' ? `from the page${c.how ? ' · ' + c.how : ''}` : 'by hand'),
          c.archived ? chip('archived', 'warn') : null, h('span', { class: 'ap-when', text: ago(c.updatedAt || c.createdAt) }))),
      h('div', { class: 'acts' },
        c.email ? btn('Copy', () => copy(c.email), 'sm ghost') : null,
        btn('Edit', () => editContact(c, jobs, rerender).catch(fail), 'sm'),
        btn(c.archived ? 'Restore' : 'Archive', (e) => busy(e.currentTarget, async () => {
          await api('POST', `/api/opportunity/contacts/${encodeURIComponent(c.id)}/archive`, { archived: !c.archived });
          toast(c.archived ? 'Restored' : 'Archived — kept, out of the list'); rerender();
        }), 'sm ghost')));
  }

  section({
    id: 'applications', group: 'Accounts & agents', icon: '✉', label: 'Applications',
    keywords: 'applications jobs contacts recruiter email phone hiring manager opportunity pipeline',
    blurb: 'Your job applications and the people behind them. Contacts are captured from each job page when it is read, or added here; archived, never deleted.',
    async render({ rerender } = {}) {
      const rr = () => rerender();
      let list, contacts;
      try {
        [list, contacts] = await Promise.all([
          api('GET', `/api/opportunity/list?limit=100${state.stage ? '&stage=' + encodeURIComponent(state.stage) : ''}`),
          api('GET', `/api/opportunity/contacts?${[state.q ? 'q=' + encodeURIComponent(state.q) : '', state.archived ? 'archived=1' : ''].filter(Boolean).join('&')}`),
        ]);
      } catch (e) {
        return [pane({ title: 'Applications', body: [empty(e.down ? `${e.message}. Start Nexus (Copilot) and open this again.` : e.message, btn('Try again', rr, 'sm'))] })];
      }
      const jobs = list.items || [];
      const byJob = {}; for (const c of contacts.contacts || []) if (c.oppId) byJob[c.oppId] = (byJob[c.oppId] || 0) + 1;
      const stages = [...new Set(jobs.map(o => o.stage))].sort();
      const stageSel = select([{ value: '', label: 'Every stage' }, ...stages.map(s => ({ value: s, label: s }))], state.stage, { 'aria-label': 'Stage' });
      stageSel.addEventListener('change', () => { state.stage = stageSel.value; rr(); });
      const q = h('input', { type: 'search', placeholder: 'Search contacts…', value: state.q, 'aria-label': 'Search contacts' });
      q.addEventListener('change', () => { state.q = q.value.trim(); rr(); });
      const arc = h('label', { class: 'ap-arc' }, h('input', { type: 'checkbox', checked: state.archived ? 'checked' : null, onchange: (e) => { state.archived = e.target.checked; rr(); } }), h('span', { text: 'Show archived' }));
      return [
        pane({ title: 'Contacts', sub: `${(contacts.contacts || []).length} shown`, anchor: 'contacts',
          tools: h('div', { class: 'ap-tools' }, q, arc, btn('Add a contact', () => editContact(null, jobs, rr).catch(fail), 'sm primary')), flush: true,
          body: (contacts.contacts || []).length ? (contacts.contacts || []).map(c => contactRow(c, jobs, rr))
            : [empty(state.q ? `No contact matches "${state.q}".` : 'No contacts yet. They are captured when a job page is read (opp capture, or Prepare), or add one here.')] }),
        pane({ title: 'Applications', sub: `${jobs.length} job${jobs.length === 1 ? '' : 's'}`, anchor: 'jobs', tools: stageSel, flush: true,
          body: jobs.length ? jobs.map(o => h('div', { class: 'row', 'data-opp': o.id },
            h('div', { class: 'what' }, h('div', { class: 't', text: o.title || o.url }), h('div', { class: 'd', text: [o.company, o.kind, o.score != null ? `score ${o.score}` : null].filter(Boolean).join(' · ') })),
            h('div', { class: 'acts' }, chip(o.stage, STAGE_KIND[o.stage] || ''), chip(`${byJob[o.id] || 0} contact${byJob[o.id] === 1 ? '' : 's'}`),
              o.url ? btn('Open', () => cg.window.open({ url: o.url }).catch(fail), 'sm ghost') : null)))
            : [empty('No applications yet. Capture a job page with `opp capture`, or run a cycle.')] }),
      ];
    },
  });
})();
