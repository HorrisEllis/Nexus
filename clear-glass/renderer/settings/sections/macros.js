'use strict';
/**
 * renderer/settings/sections/macros.js — Macros  (styles: macros.css)
 *
 * §BUILT 2026-09-23 — list/run + the step builder; every step is a real
 * browser_action action (enum via macros:schema) or an erosmancer step, and
 * create goes through macro.js's own validation.
 *
 * §REBUILT 2026-09-26 — James: "make the macros way more user friendly."
 * What changed, and why each is real rather than cosmetic:
 *   - Record: pick a tab, do the thing, stop — the driver's recorder
 *     (record.start/stop, src/driver/index.js) captures it and
 *     src/macros/recording.js turns it into steps. Passwords become a
 *     {{password}} parameter; the macro never holds the secret.
 *   - Templates: log in, fill a form, search, open-and-screenshot.
 *   - Steps read as sentences ("Type “…” into #email") and each action has
 *     labelled fields, not one placeholder-only pair. Every enum action is
 *     still reachable under "More actions".
 *   - Parameters are found in the steps ({{name}}) — no separate list to
 *     keep in sync by hand; extra ones can still be added.
 *   - Edit and Duplicate. Edit is delete-then-create (macro.js has no
 *     update); if the create is refused the old macro is put back.
 *   - Checks before save: a step with no url/selector is flagged in place.
 *   - Run: this tab by default, labelled parameter fields, an explicit
 *     "rewind snapshot first" choice.
 * UI-06's contract (first text input = name; first step input = the url of
 * a navigate step; steps read as {action, data}) is unchanged.
 */
(function () {
  const { cg, h, call, toast, busy, modal, confirmDo, field, pane, row, btn, chip, empty, ago, select, agentOptions, section } = window.CGS;

  // Friendly definitions for the actions people use; anything else in the
  // live enum still works through the generic two-field form.
  const ACTIONS = {
    navigate:     { label: 'Go to page',          fields: [['url', 'Page address', 'https://example.com/login']] },
    click:        { label: 'Click',               fields: [['selector', 'Element', 'button[type=submit]']] },
    type:         { label: 'Type text',           fields: [['selector', 'Into element', 'input[name=email]'], ['text', 'Text', 'jo@example.com or {{email}}']] },
    wait_for:     { label: 'Wait for element',    fields: [['selector', 'Element', '.results']] },
    wait:         { label: 'Pause',               fields: [['ms', 'Milliseconds', '1000']] },
    hover:        { label: 'Hover',               fields: [['selector', 'Element', 'nav .menu']] },
    scroll:       { label: 'Scroll',              fields: [['selector', 'Element (blank = page)', '#feed']] },
    find_in_page: { label: 'Find text on page',   fields: [['text', 'Text', 'Apply now']] },
    screenshot:   { label: 'Screenshot',          fields: [] },
    toast:        { label: 'Show a message',      fields: [['text', 'Message', 'Done']] },
    eval:         { label: 'Run script',          fields: [['code', 'JavaScript', 'document.title']] },
    back:         { label: 'Back',                fields: [] },
    forward:      { label: 'Forward',             fields: [] },
    reload:       { label: 'Reload',              fields: [] },
  };
  const REQUIRED = { navigate: 'url', click: 'selector', type: 'selector', wait_for: 'selector', hover: 'selector', find_in_page: 'text', eval: 'code' };
  const fieldsFor = (action) => (ACTIONS[action] ? ACTIONS[action].fields : [['selector', 'Selector', ''], ['text', 'Text', '']]);

  const TEMPLATES = [
    { id: 'login', label: 'Log in to a site', blurb: 'Go to the sign-in page, fill email and password, submit.',
      macro: { name: 'log-in', urlPattern: '', description: 'Sign in with an email and password', steps: [
        { action: 'navigate', data: { url: 'https://example.com/login' } },
        { action: 'type', data: { selector: 'input[type=email]', text: '{{email}}' } },
        { action: 'type', data: { selector: 'input[type=password]', text: '{{password}}' } },
        { action: 'click', data: { selector: 'button[type=submit]' } },
      ] } },
    { id: 'form', label: 'Fill a form', blurb: 'Type into fields from parameters, then submit.',
      macro: { name: 'fill-form', urlPattern: '', description: 'Fill name and email, then submit', steps: [
        { action: 'type', data: { selector: 'input[name=name]', text: '{{name}}' } },
        { action: 'type', data: { selector: 'input[name=email]', text: '{{email}}' } },
        { action: 'click', data: { selector: 'button[type=submit]' } },
        { action: 'wait', data: { ms: 1500 } },
        { action: 'screenshot', data: {} },
      ] } },
    { id: 'search', label: 'Search a site', blurb: 'Type a query into the search box and wait for results.',
      macro: { name: 'search', urlPattern: '', description: 'Search for {{query}}', steps: [
        { action: 'type', data: { selector: 'input[type=search]', text: '{{query}}' } },
        { action: 'type', data: { selector: 'input[type=search]', text: '\n' } },
        { action: 'wait_for', data: { selector: 'main' } },
      ] } },
    { id: 'shot', label: 'Open and screenshot', blurb: 'Go to a page, wait for it, take a screenshot.',
      macro: { name: 'open-and-screenshot', urlPattern: '', description: 'Capture {{url}}', steps: [
        { action: 'navigate', data: { url: '{{url}}' } },
        { action: 'wait', data: { ms: 2000 } },
        { action: 'screenshot', data: {} },
      ] } },
  ];

  function describe(step) {
    const d = step.data || {};
    if (step.engine === 'erosmancer') return `Erosmancer ${step.action}${d.payload ? ` “${String(d.payload).slice(0, 40)}”` : ''}`;
    switch (step.action) {
      case 'navigate': return `Go to ${d.url || '…'}`;
      case 'click': return `Click ${d.selector || '…'}`;
      case 'type': return d.text === '\n' ? `Press Enter in ${d.selector || '…'}` : `Type “${String(d.text ?? '').slice(0, 40)}” into ${d.selector || '…'}`;
      case 'wait': return `Pause ${d.ms ?? '…'} ms`;
      case 'wait_for': return `Wait until ${d.selector || '…'} appears`;
      case 'hover': return `Hover ${d.selector || '…'}`;
      case 'scroll': return `Scroll ${d.selector || 'the page'}`;
      case 'find_in_page': return `Find “${d.text || '…'}”`;
      case 'screenshot': return 'Take a screenshot';
      case 'toast': return `Show “${d.text || ''}”`;
      case 'eval': return `Run a script (${String(d.code || '').length} chars)`;
      default: return `${step.action}${Object.keys(d).length ? ' ' + JSON.stringify(d).slice(0, 60) : ''}`;
    }
  }
  const paramsIn = (steps, extra = []) => {
    const found = new Set();
    const walk = (v) => { if (typeof v === 'string') for (const m of v.matchAll(/\{\{\s*([a-zA-Z_][\w-]*)\s*\}\}/g)) found.add(m[1]); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
    steps.forEach(s => walk(s.data || {}));
    extra.forEach(p => p && found.add(p));
    return [...found];
  };

  // ── one step card ─────────────────────────────────────────────────────
  function stepCard(schema, step, hooks) {
    const el = h('div', { class: 'step' });
    const engine = select([{ value: 'browser', label: 'Browser' }, { value: 'erosmancer', label: 'Erosmancer (human-like)' }], step.engine === 'erosmancer' ? 'erosmancer' : 'browser', { title: 'Engine' });
    const action = h('select', { title: 'What this step does' });
    const inputs = h('div', { class: 'step-fields' });
    const sentence = h('div', { class: 'step-say' });
    const extra = h('input', { type: 'text', class: 'mono', placeholder: 'key=value, key=value (optional)' });
    const moreBox = h('details', { class: 'step-more' }, h('summary', { text: 'Extra data' }), extra);
    let current = {};   // key -> input
    const d0 = step.data || {};
    const known = new Set();

    const fillActions = () => {
      const eros = engine.value === 'erosmancer';
      const list = eros ? schema.erosActions : schema.actions;
      const common = list.filter(a => ACTIONS[a]), rest = list.filter(a => !ACTIONS[a]);
      action.replaceChildren(
        ...(eros ? list.map(a => h('option', { value: a, text: a })) : [
          h('optgroup', { label: 'Common' }, common.map(a => h('option', { value: a, text: ACTIONS[a].label }))),
          rest.length ? h('optgroup', { label: 'More actions' }, rest.map(a => h('option', { value: a, text: a.replace(/_/g, ' ') }))) : null,
        ].filter(Boolean)));
      if (list.includes(step.action)) action.value = step.action;
      el.classList.toggle('eros', eros);
      buildFields();
    };
    const buildFields = () => {
      const prev = Object.fromEntries(Object.entries(current).map(([k, i]) => [k, i.value]));
      current = {};
      const defs = engine.value === 'erosmancer'
        ? [['targetUuid', 'Erosmancer node', 'node uuid'], ['payload', 'Payload', 'text, url, code…']]
        : fieldsFor(action.value);
      inputs.replaceChildren(...defs.map(([k, label, ph]) => {
        const v = prev[k] ?? (k === 'targetUuid' ? step.targetUuid : k === 'payload' ? d0.payload : d0[k]);
        const inp = k === 'code' ? h('textarea', { rows: '2', class: 'mono', placeholder: ph }) : h('input', { type: k === 'ms' ? 'number' : 'text', placeholder: ph });
        if (v !== undefined && v !== null) inp.value = String(v);
        inp.addEventListener('input', say);
        current[k] = inp; known.add(k);
        return field(label, inp);
      }));
      say();
    };
    const say = () => {
      let s; try { s = el.read(true); } catch (_) { s = { action: action.value, data: {} }; }
      sentence.textContent = describe(s);
      el.classList.remove('bad');
      hooks.changed && hooks.changed();
    };
    engine.addEventListener('change', fillActions);
    action.addEventListener('change', buildFields);
    // extra data from the step that aren't one of this action's fields
    const leftovers = Object.entries(d0).filter(([k]) => !fieldsFor(step.action).some(([f]) => f === k) && k !== 'payload');
    if (leftovers.length) { extra.value = leftovers.map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`).join(', '); moreBox.open = true; }
    extra.addEventListener('input', say);

    el.append(
      h('span', { class: 'n' }),
      h('div', { class: 'step-main' },
        h('div', { class: 'step-top' }, action, engine, sentence),
        inputs, moreBox),
      h('div', { class: 'step-tools' },
        btn('↑', () => hooks.move(-1), 'sm ghost'), btn('↓', () => hooks.move(1), 'sm ghost'),
        btn('⧉', () => hooks.duplicate(), 'sm ghost'), btn('✕', () => hooks.remove(), 'sm ghost')));
    // Fields are built before read() is attached; say() tolerates that.
    el.read = (loose = false) => {
      const data = {};
      for (const part of extra.value.split(',').map(x => x.trim()).filter(Boolean)) {
        const i = part.indexOf('=');
        if (i < 1) { if (loose) continue; throw new Error(`Extra data “${part}” needs key=value`); }
        const k = part.slice(0, i).trim(); let v = part.slice(i + 1).trim();
        try { v = JSON.parse(v); } catch (_) { /* plain string */ }
        data[k] = v;
      }
      if (engine.value === 'erosmancer') {
        const t = current.targetUuid && current.targetUuid.value.trim();
        const p = current.payload && current.payload.value;
        return { engine: 'erosmancer', action: action.value, targetUuid: t || undefined, data: { ...(p ? { payload: p } : {}), ...data } };
      }
      for (const [k, inp] of Object.entries(current)) {
        if (inp.value === '') continue;
        data[k] = k === 'ms' ? Number(inp.value) : inp.value;
      }
      return { action: action.value, data };
    };
    el.check = () => {
      const s = el.read();
      const need = s.engine ? null : REQUIRED[s.action];
      if (need && !s.data[need]) { el.classList.add('bad'); throw new Error(`Step ${[...el.parentNode.children].indexOf(el) + 1} (${describe(s)}) needs a ${need}.`); }
      return s;
    };
    fillActions();
    return el;
  }

  // ── the builder (new / edit / from template / from recording) ─────────
  async function builder(schema, rerender, initial = null, { editing = null } = {}) {
    const m = initial || { steps: [{ action: 'navigate', data: {} }] };
    const name = h('input', { type: 'text', placeholder: 'apply-greenhouse', value: m.name || '' });
    const url = h('input', { type: 'text', placeholder: 'https://boards.greenhouse.io/*', value: m.urlPattern || '' });
    const desc = h('input', { type: 'text', placeholder: 'What it does, in a line', value: m.description || '' });
    const extraParams = h('input', { type: 'text', placeholder: 'other parameters, comma separated' });
    const found = h('div', { class: 'param-chips' });
    const profile = select([{ value: '', label: 'Let Erosmancer choose' }, ...schema.profiles.map(p => ({ value: p, label: p }))], m.profile || '');
    const list = h('div', { class: 'steps' });

    const refresh = () => {
      [...list.children].forEach((c, i) => { c.querySelector('.n').textContent = String(i + 1); });
      let steps = [];
      try { steps = [...list.children].map(c => c.read(true)); } catch (_) {}
      const ps = paramsIn(steps, extraParams.value.split(',').map(s => s.trim()));
      found.replaceChildren(...(ps.length ? ps.map(p => chip(`{{${p}}}`)) : [h('span', { class: 'hint', text: 'Write {{name}} in any field to make it a parameter — you’ll be asked for it when the macro runs.' })]));
    };
    extraParams.addEventListener('input', refresh);
    const add = (step = { action: 'click', data: {} }, after = null) => {
      let el;
      el = stepCard(schema, step, {
        changed: () => refresh(),
        remove: () => { el.remove(); refresh(); },
        duplicate: () => { let s; try { s = el.read(true); } catch (_) { return; } add(JSON.parse(JSON.stringify(s)), el); },
        move: (dir) => {
          const sib = dir < 0 ? el.previousElementSibling : el.nextElementSibling;
          if (sib) { dir < 0 ? list.insertBefore(el, sib) : list.insertBefore(sib, el); refresh(); }
        },
      });
      after ? after.after(el) : list.append(el);
      refresh();
    };
    m.steps.forEach(s => add(s));
    if (m.params) extraParams.value = m.params.filter(p => !paramsIn(m.steps).includes(p)).join(', ');
    refresh();

    const r = await modal({ title: editing ? `Edit “${editing.name}”` : 'New macro', wide: true, body: [
      h('div', { class: 'grid' }, field('Name', name, 'Letters, numbers and dashes'), field('Runs on (URL pattern)', url, 'Blank = any page. * matches anything.'), field('Behaviour profile', profile, 'Only used by Erosmancer steps')),
      field('Description', desc),
      h('div', { class: 'field' }, h('span', { text: 'Steps' }), list),
      h('div', { class: 'step-add' }, h('span', { class: 'hint', text: 'Add:' }),
        ['navigate', 'click', 'type', 'wait_for', 'wait', 'screenshot'].filter(a => schema.actions.includes(a)).map(a => btn(`+ ${ACTIONS[a].label}`, () => add({ action: a, data: {} }), 'sm'))),
      h('div', { class: 'field' }, h('span', { text: 'Parameters' }), found, extraParams),
      h('p', { class: 'blurb', text: 'Every run takes a rewind snapshot first unless you turn it off at run time, so a macro that goes wrong can be rolled back.' }),
    ], actions: [{ label: editing ? 'Save changes' : 'Create macro', primary: true, run: async () => {
      if (!name.value.trim()) throw new Error('Name the macro.');
      if (!list.children.length) throw new Error('Add at least one step.');
      const steps = [...list.children].map(c => c.check());
      const def = { name: name.value.trim(), urlPattern: url.value.trim() || null, description: desc.value.trim() || null,
        params: paramsIn(steps, extraParams.value.split(',').map(s => s.trim())), profile: profile.value || undefined, steps };
      if (!editing) return call(() => cg.macros.create(def), 'create macro');
      // Edit: macro.js has no update. Same name → delete then create, and put
      // the old one back if the new one is refused. New name → create first.
      if (def.name !== editing.name) {
        const made = await call(() => cg.macros.create(def), 'create macro');
        await call(() => cg.macros.delete(editing.name), 'remove old name');
        return made;
      }
      await call(() => cg.macros.delete(editing.name), 'replace macro');
      try { return await call(() => cg.macros.create(def), 'save macro'); }
      catch (e) {
        await cg.macros.create({ name: editing.name, urlPattern: editing.urlPattern, description: editing.description, params: editing.params, profile: editing.profile || undefined, steps: editing.steps }).catch(() => {});
        throw new Error(`${e.message} — the previous version was kept.`);
      }
    } }] });
    if (r) { toast(editing ? 'Macro saved' : 'Macro created'); rerender(); }
  }

  // ── record from a tab ─────────────────────────────────────────────────
  async function recordFlow(schema, rerender) {
    if (!cg.macros.recordStart) throw new Error('Recording needs the macro recorder IPC (update Clear Glass).');
    const agents = await agentOptions();
    if (!agents.length) throw new Error('Open a tab to record in first.');
    const agentSel = select(agents);
    const status = h('p', { class: 'blurb', text: 'Pick the tab, press Start, then do the steps in that tab. Come back and press Stop.' });
    let recording = null;
    const startBtn = btn('Start recording', (e) => busy(e.currentTarget, async () => {
      const r = await call(() => cg.macros.recordStart(agentSel.value), 'start recording');
      recording = agentSel.value; agentSel.disabled = true;
      status.textContent = `● Recording in ${recording}${r.startUrl ? ` from ${r.startUrl}` : ''}. Clicks, typing and Enter are captured; passwords are never stored.`;
      status.classList.add('rec');
    }), 'primary');
    const out = await modal({ title: 'Record a macro', body: [field('Tab', agentSel), h('div', {}, startBtn), status], actions: [{ label: 'Stop and edit steps', primary: true, run: async () => {
      if (!recording) throw new Error('Start recording first.');
      return call(() => cg.macros.recordStop(recording), 'stop recording');
    } }] });
    if (!out) { if (recording) cg.macros.recordStop(recording).catch(() => {}); return; }
    if (!out.steps || !out.steps.length) { toast(`Nothing usable was recorded (${out.events || 0} events).`, 'bad'); return; }
    toast(`Recorded ${out.steps.length} step${out.steps.length === 1 ? '' : 's'}`);
    const host = (() => { try { return new URL(out.steps.find(s => s.action === 'navigate')?.data.url).host; } catch (_) { return ''; } })();
    return builder(schema, rerender, { name: host ? `recorded-${host.replace(/[^a-z0-9]+/gi, '-')}` : 'recorded', urlPattern: host ? `https://${host}/*` : '', description: 'Recorded', params: out.params, steps: out.steps });
  }

  async function templateFlow(schema, rerender) {
    const pick = await modal({ title: 'Start from a template', body: [h('div', { class: 'tpl-list' }, TEMPLATES.map(t =>
      h('button', { class: 'tpl', dataset: { id: t.id }, onclick: (e) => { e.currentTarget.closest('.modal').querySelectorAll('.tpl').forEach(x => x.classList.toggle('on', x === e.currentTarget)); } },
        h('b', { text: t.label }), h('span', { text: t.blurb }))))],
    actions: [{ label: 'Use template', primary: true, run: () => {
      const on = document.querySelector('.modal .tpl.on');
      if (!on) throw new Error('Pick a template.');
      return on.dataset.id;
    } }] });
    if (!pick) return;
    const t = TEMPLATES.find(x => x.id === pick);
    const m = JSON.parse(JSON.stringify(t.macro));
    m.steps = m.steps.filter(s => schema.actions.includes(s.action));
    return builder(schema, rerender, m);
  }

  async function runFlow(m) {
    const agents = await agentOptions();
    if (!agents.length) throw new Error('Open a tab to run the macro in first.');
    const agentSel = select(agents);
    const snap = h('input', { type: 'checkbox', checked: true });
    const inputs = (m.params || []).map(p => ({ p, el: h('input', { type: /pass|secret|pin|otp/i.test(p) ? 'password' : 'text', autocomplete: 'off' }) }));
    const r = await modal({ title: `Run “${m.name}”`, body: [
      field('Run in', agentSel, m.urlPattern ? `Meant for ${m.urlPattern}` : null),
      ...inputs.map(i => field(i.p, i.el)),
      h('label', { class: 'check' }, snap, h('span', { text: ' Take a rewind snapshot first' })),
    ], actions: [{ label: 'Run macro', primary: true, run: () => {
      const missing = inputs.filter(i => !i.el.value).map(i => i.p);
      if (missing.length) throw new Error(`Fill ${missing.join(', ')}.`);
      return call(() => cg.macros.run(m.name, { agentId: agentSel.value, params: Object.fromEntries(inputs.map(i => [i.p, i.el.value])), skipSnapshot: !snap.checked }), 'run macro');
    } }] });
    if (r) toast(`“${m.name}” finished — ${(r.results || []).length} steps`);
  }

  section({
    id: 'macros', group: 'Agents', icon: '⌘', label: 'Macros',
    keywords: 'macro steps record replay rewind job application erosmancer behavior template',
    blurb: 'Repeatable sequences of browser actions. Record one from a tab, start from a template, or build it step by step. {{placeholders}} become questions when it runs.',
    async render({ tools, rerender }) {
      const [lr, schema] = await Promise.all([call(() => cg.macros.list(), 'macros'), call(() => cg.macros.schema(), 'macro schema')]);
      const fail = (e) => toast(e.message, 'bad');
      tools.append(
        btn('● Record', () => recordFlow(schema, rerender).catch(fail), 'primary'),
        btn('From template', () => templateFlow(schema, rerender).catch(fail)),
        btn('New macro', () => builder(schema, rerender).catch(fail)));
      const macros = lr.macros || [];
      const full = async (m) => (await call(() => cg.macros.get(m.name), 'macro')).macro;
      return pane({ title: 'Macros', sub: `${macros.length} macro${macros.length === 1 ? '' : 's'}`, flush: true, body: macros.length ? macros.map(m => row(m.name,
        `${m.description ? m.description + ' · ' : ''}${m.urlPattern || 'any page'} · ${m.steps} step${m.steps === 1 ? '' : 's'} · ${m.runCount} run${m.runCount === 1 ? '' : 's'} · last ${ago(m.lastRunAt)}${(m.params || []).length ? ` · asks for ${m.params.join(', ')}` : ''}`,
        btn('Run', () => runFlow(m).catch(fail), 'sm primary'),
        btn('Steps', async () => { const g = await full(m); modal({ title: m.name, wide: true, body: [h('ol', { class: 'step-read' }, (g.steps || []).map(s => h('li', { text: describe(s) })))] }); }, 'sm'),
        btn('Edit', async () => { const g = await full(m); builder(schema, rerender, g, { editing: g }).catch(fail); }, 'sm'),
        btn('Duplicate', async () => { const g = await full(m); builder(schema, rerender, { ...g, name: `${g.name}-copy` }).catch(fail); }, 'sm'),
        btn('Delete', async () => { if (await confirmDo(`Delete “${m.name}”?`, 'It stops appearing here; the history is kept in the macro ledger.', 'Delete')) { await busy(null, () => call(() => cg.macros.delete(m.name), 'delete')); rerender(); } }, 'sm danger')))
        : empty('No macros yet.', btn('Record one', () => recordFlow(schema, rerender).catch(fail), 'sm primary'), btn('Use a template', () => templateFlow(schema, rerender).catch(fail), 'sm')) });
    },
  });
})();
