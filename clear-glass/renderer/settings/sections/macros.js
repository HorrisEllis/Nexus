'use strict';
/**
 * renderer/settings/sections/macros.js — Browser action  (styles: macros.css)
 */
/**
 * renderer/settings/sections/macros.js — Macros (with step builder) + ErosmancerOS
 * §BUILT 2026-09-23. Macros: list/run plus the step builder the 2026-08-29
 * bridge note deferred ("a real step-builder UI is a separate, larger
 * piece... rather than half-built as a bare JSON textarea"). Every step is a
 * real browser_action action (enum fetched live via macros:schema, not
 * hardcoded) or an erosmancer step; create goes through macro.js's own
 * validation, so the UI can't define a macro the engine would refuse.
 * ErosmancerOS: clear-glass's /eros/* proxy onto erosmancer-os's real REST
 * API (health, connect, behavior profile, routing level, hostile state,
 * adaptive patterns).
 */
(function () {
  const { cg, h, call, wire, toast, busy, modal, confirmDo, field, pane, row, btn, chip, empty, ago, select, agentOptions, section } = window.CGS;

  // The common data keys browser_action steps take; anything else goes in "More".
  const COMMON = { navigate: ['url'], click: ['selector'], type: ['selector', 'text'], hover: ['selector'], scroll: ['selector'], wait: ['ms'], wait_for: ['selector'], eval: ['code'], screenshot: [], find_in_page: ['text'], toast: ['text'] };

  function stepRow(schema, step, onRemove, onMove) {
    const engine = select([{ value: 'browser', label: 'Browser action' }, { value: 'erosmancer', label: 'Erosmancer (human-like)' }], step.engine === 'erosmancer' ? 'erosmancer' : 'browser');
    const action = h('select');
    const a = h('input', { type: 'text' }), b = h('input', { type: 'text' });
    const more = h('input', { type: 'text', class: 'mono', placeholder: 'More data as JSON, e.g. {"agentId":"{{tab}}"}' });
    const el = h('div', { class: 'step' });
    const fillActions = () => {
      const list = engine.value === 'erosmancer' ? schema.erosActions : schema.actions;
      action.replaceChildren(...list.map(x => h('option', { value: x, text: x })));
      if (list.includes(step.action)) action.value = step.action;
      el.classList.toggle('eros', engine.value === 'erosmancer');
      labels();
    };
    const labels = () => {
      if (engine.value === 'erosmancer') { a.placeholder = 'Erosmancer node uuid (targetUuid)'; b.placeholder = 'Payload (text, url, code…)'; return; }
      const keys = COMMON[action.value] || ['selector', 'text'];
      a.placeholder = keys[0] || 'selector'; b.placeholder = keys[1] || '(unused)';
    };
    engine.addEventListener('change', fillActions); action.addEventListener('change', labels);
    const d = step.data || {};
    if (step.engine === 'erosmancer') { a.value = step.targetUuid || ''; b.value = typeof d.payload === 'string' ? d.payload : ''; }
    else { const keys = COMMON[step.action] || ['selector', 'text']; a.value = d[keys[0]] ?? ''; b.value = d[keys[1]] ?? ''; }
    el.append(h('span', { class: 'n' }), h('div', { style: { display: 'grid', gap: '4px' } }, engine, action), a, b,
      h('div', { style: { display: 'flex', gap: '2px' } }, btn('\u2191', () => onMove(-1), 'sm ghost'), btn('\u2193', () => onMove(1), 'sm ghost'), btn('\u2715', onRemove, 'sm ghost')),
      h('div', { class: 'more' }, more));
    fillActions();
    el.read = () => {
      let extra = {};
      if (more.value.trim()) { try { extra = JSON.parse(more.value); } catch (_) { throw new Error(`Step ${action.value}: “More data” isn’t valid JSON.`); } }
      if (engine.value === 'erosmancer') return { engine: 'erosmancer', action: action.value, targetUuid: a.value.trim() || undefined, data: { ...(b.value ? { payload: b.value } : {}), ...extra } };
      const keys = COMMON[action.value] || ['selector', 'text'];
      const data = { ...extra };
      if (keys[0] && a.value !== '') data[keys[0]] = keys[0] === 'ms' ? Number(a.value) : a.value;
      if (keys[1] && b.value !== '') data[keys[1]] = b.value;
      return { action: action.value, data };
    };
    return el;
  }

  async function builder(schema, rerender) {
    const name = h('input', { type: 'text', placeholder: 'apply-greenhouse' });
    const url = h('input', { type: 'text', placeholder: 'https://boards.greenhouse.io/*' });
    const desc = h('input', { type: 'text' });
    const params = h('input', { type: 'text', placeholder: 'name, email (use as {{name}} in any step)' });
    const profile = select([{ value: '', label: 'Let Erosmancer choose' }, ...schema.profiles.map(p => ({ value: p, label: p }))], '');
    const list = h('div', { class: 'steps' });
    const renumber = () => [...list.children].forEach((c, i) => { c.querySelector('.n').textContent = String(i + 1); });
    const add = (step = { action: 'navigate', data: {} }) => {
      let el;
      el = stepRow(schema, step, () => { el.remove(); renumber(); }, (dir) => {
        const sib = dir < 0 ? el.previousElementSibling : el.nextElementSibling;
        if (sib) { dir < 0 ? list.insertBefore(el, sib) : list.insertBefore(sib, el); renumber(); }
      });
      list.append(el); renumber();
    };
    add();
    const r = await modal({ title: 'New macro', wide: true, body: [
      h('div', { class: 'grid' }, field('Name', name), field('Runs on (URL pattern)', url, 'Blank = any page'), field('Behaviour profile', profile, 'Only used by Erosmancer steps')),
      field('Description', desc), field('Parameters', params),
      h('div', { class: 'field' }, h('span', { text: 'Steps' }), list), h('div', {}, btn('Add step', () => add(), 'sm')),
      h('p', { class: 'blurb', text: 'Every run takes a rewind snapshot first, so a macro that goes wrong can be rolled back.' }),
    ], actions: [{ label: 'Create macro', primary: true, run: () => {
      const steps = [...list.children].map(c => c.read());
      if (!name.value.trim()) throw new Error('Name the macro.');
      return call(() => cg.macros.create({ name: name.value.trim(), urlPattern: url.value.trim() || null, description: desc.value.trim() || null,
        params: params.value.split(',').map(s => s.trim()).filter(Boolean), profile: profile.value || undefined, steps }), 'create macro');
    } }] });
    if (r) { toast('Macro created'); rerender(); }
  }

  async function runFlow(m) {
    const agents = await agentOptions();
    if (!agents.length) throw new Error('Open a tab to run the macro in first.');
    const agentSel = select(agents);
    const inputs = (m.params || []).map(p => ({ p, el: h('input', { type: 'text' }) }));
    const r = await modal({ title: `Run “${m.name}”`, body: [field('Run in', agentSel), ...inputs.map(i => field(i.p, i.el))],
      actions: [{ label: 'Run macro', primary: true, run: () => call(() => cg.macros.run(m.name, { agentId: agentSel.value, params: Object.fromEntries(inputs.map(i => [i.p, i.el.value])) }), 'run macro') }] });
    if (r) toast(`“${m.name}” finished — ${(r.results || []).length} steps`);
  }

  section({
    id: 'macros', group: 'Agents', icon: '\u2318', label: 'Macros',
    keywords: 'macro steps record replay rewind job application erosmancer behavior',
    blurb: 'Named, repeatable sequences of browser actions. Run them in any tab; parameters fill {{placeholders}}.',
    async render({ tools, rerender }) {
      const [lr, schema] = await Promise.all([call(() => cg.macros.list(), 'macros'), call(() => cg.macros.schema(), 'macro schema')]);
      tools.append(btn('New macro', () => builder(schema, rerender), 'primary'));
      const macros = lr.macros || [];
      return pane({ title: 'Macros', flush: true, body: macros.length ? macros.map(m => row(m.name,
        `${m.urlPattern || 'any page'} \u00B7 ${m.steps} step${m.steps === 1 ? '' : 's'} \u00B7 ${m.runCount} runs \u00B7 last ${ago(m.lastRunAt)}${(m.params || []).length ? ` \u00B7 needs ${m.params.join(', ')}` : ''}`,
        btn('Run', () => runFlow(m).catch(e => toast(e.message, 'bad')), 'sm primary'),
        btn('Steps', async () => { const g = await call(() => cg.macros.get(m.name), 'macro'); modal({ title: m.name, wide: true, body: [h('pre', { class: 'out', text: JSON.stringify(g.macro.steps, null, 2) })] }); }, 'sm'),
        btn('Delete', async () => { if (await confirmDo(`Delete “${m.name}”?`, 'It stops appearing here; the history is kept in the macro ledger.', 'Delete')) { await busy(null, () => call(() => cg.macros.delete(m.name), 'delete')); rerender(); } }, 'sm danger')))
        : empty('No macros yet.', btn('Build one', () => builder(schema, rerender), 'sm')) });
    },
  });
})();
