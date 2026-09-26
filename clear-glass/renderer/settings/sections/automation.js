'use strict';
/**
 * renderer/settings/sections/automation.js — Automation  (styles: automation.css)
 *
 * v0.39.227 — split out of sections/mesh.js. The engine is
 * src/mesh/automation-engine.js (the same backend BrainOS's Automation tab
 * uses, not a second engine), reached over the wire's /automation/* routes.
 *
 * §0.39.265 — James: "can you make the workflow settings more user friendly and
 * expand it fully." Rebuilt around reading a workflow as a sentence:
 *   - "When" (the trigger) and "Then" (numbered step cards), each step written
 *     out in plain words, with its own on/off switch, ↑ ↓, edit, delete.
 *   - Schedules are Manual / Every N minutes-hours / Daily at a time on chosen
 *     days — no milliseconds anywhere.
 *   - Step types are picked from cards with a one-line explanation: Ask an
 *     agent (optionally as an account), Run a macro, Wait, Check a value
 *     (branches pick "next step / step N / stop" — no raw step ids), Call a
 *     NEXUS system, Notify me.
 *   - Templates for a new workflow; rename, describe, duplicate; next-run time;
 *     each workflow's own run history.
 */
(function () {
  const { cg, h, call, wire, toast, busy, modal, confirmDo, field, pane, row, btn, chip, empty, ago, select, toggle, agentOptions, section } = window.CGS;

  // ── Vocabulary ─────────────────────────────────────────────────────────
  const TYPES = [
    { id: 'agent',     icon: '✦', label: 'Ask an agent',        help: 'Send a prompt to Claude, ChatGPT or another agent in the mesh.' },
    { id: 'macro',     icon: '⌘', label: 'Run a macro',         help: 'Replay a saved macro (Macros page) in a window.' },
    { id: 'delay',     icon: '⏱', label: 'Wait',                help: 'Pause before the next step (up to 5 minutes).' },
    { id: 'condition', icon: '⑂', label: 'Check a value',       help: 'Compare something live, then continue, jump to a step, or stop.' },
    { id: 'command',   icon: '⇄', label: 'Call a NEXUS system', help: 'Call Guardian, Ollama, Co-pilot or Clear Glass over HTTP.' },
    { id: 'notify',    icon: '🔔', label: 'Notify me',     help: 'Show a desktop notification.' },
  ];
  const typeOf = (id) => TYPES.find(t => t.id === id) || { id, icon: '•', label: id, help: '' };
  const SYSTEMS = [{ value: 'guardian', label: 'Guardian' }, { value: 'ollama', label: 'Ollama' }, { value: 'copilot', label: 'Co-pilot' }, { value: 'clear-glass', label: 'Clear Glass' }];
  const OPS = [{ value: '==', label: 'is' }, { value: '!=', label: 'is not' }, { value: '>', label: 'is more than' }, { value: '<', label: 'is less than' }, { value: '>=', label: 'is at least' }, { value: '<=', label: 'is at most' }];
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const UNITS = [{ value: '60000', label: 'minutes' }, { value: '3600000', label: 'hours' }, { value: '1000', label: 'seconds' }];

  // ── Plain-English sentences ─────────────────────────────────────────────
  function whenText(trigger) {
    const c = (trigger && trigger.config) || {};
    if (!trigger || trigger.enabled === false) return 'Only when you press Run now';
    if (c.at) {
      const ds = Array.isArray(c.days) && c.days.length ? [...c.days].map(Number).sort() : [0, 1, 2, 3, 4, 5, 6];
      const days = ds.length === 7 ? 'day' : ds.join() === '1,2,3,4,5' ? 'weekday' : ds.join() === '0,6' ? 'weekend day' : ds.map(d => DAYS[d]).join(', ');
      return `Every ${days} at ${c.at}`;
    }
    if (c.intervalMs) {
      const ms = c.intervalMs;
      if (ms % 3600000 === 0) return `Every ${ms / 3600000 === 1 ? 'hour' : `${ms / 3600000} hours`}`;
      if (ms % 60000 === 0) return `Every ${ms / 60000 === 1 ? 'minute' : `${ms / 60000} minutes`}`;
      return `Every ${Math.round(ms / 1000)} seconds`;
    }
    return 'Only when you press Run now';
  }
  const stepNo = (steps, id) => { const i = steps.filter(s => s.type !== 'trigger').findIndex(s => s.id === id); return i >= 0 ? i + 1 : null; };
  function branchText(steps, target) {
    if (!target || target === 'next') return 'continue';
    if (target === 'stop') return 'stop';
    const n = stepNo(steps, target);
    return n ? `go to step ${n}` : 'continue (that step is gone)';
  }
  function stepText(s, ctx) {
    const c = s.config || {};
    switch (s.type) {
      case 'agent': {
        const a = ctx.agentName(c.agentKey);
        return `Ask ${a}${c.accountId ? ` as “${ctx.accountName(c.accountId)}”` : ''}: “${(c.prompt || '').slice(0, 90)}${(c.prompt || '').length > 90 ? '…' : ''}”`;
      }
      case 'macro': return `Run the macro “${c.name || '?'}” in ${c.agentId || 'the main window'}${c.params && Object.keys(c.params).length ? ` with ${Object.keys(c.params).join(', ')}` : ''}`;
      case 'delay': { const ms = c.ms || 1000; return `Wait ${ms >= 60000 && ms % 60000 === 0 ? `${ms / 60000} min` : `${Math.round(ms / 1000)} s`}`; }
      case 'condition': return `If ${ctx.varName(c.var)} ${(OPS.find(o => o.value === c.op) || { label: c.op }).label} ${c.value} → ${branchText(ctx.steps, c.onTrue)}, otherwise ${branchText(ctx.steps, c.onFalse)}`;
      case 'command': return `${(c.method || 'GET').toUpperCase()} ${(SYSTEMS.find(x => x.value === c.system) || { label: c.system }).label} ${c.endpoint || '/health'}`;
      case 'notify': return `Notify: “${String(c.title || '{{workflow}}').replace(/\{\{workflow\}\}/g, ctx.wfName || 'the workflow name')}”${c.body ? ` — ${c.body.slice(0, 60)}` : ''}`;
      default: return JSON.stringify(c);
    }
  }
  function whenNext(ts) {
    if (!ts) return null;
    const d = new Date(ts), now = new Date();
    const same = d.toDateString() === now.toDateString();
    const tmr = new Date(now.getTime() + 86400000).toDateString() === d.toDateString();
    const t = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return same ? `today ${t}` : tmr ? `tomorrow ${t}` : `${d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })} ${t}`;
  }

  // ── Editors ─────────────────────────────────────────────────────────────
  async function triggerEditor(trigger) {
    const c = (trigger && trigger.enabled !== false && trigger.config) || {};
    const mode0 = c.at ? 'daily' : c.intervalMs ? 'every' : 'manual';
    const radios = h('div', { class: 'seg', role: 'radiogroup' });
    const panes = {};
    let mode = mode0;
    const unit0 = c.intervalMs && c.intervalMs % 3600000 === 0 ? '3600000' : c.intervalMs && c.intervalMs % 60000 === 0 ? '60000' : c.intervalMs ? '1000' : '60000';
    const n = h('input', { type: 'number', min: 1, value: c.intervalMs ? c.intervalMs / parseInt(unit0, 10) : 30 });
    const unit = select(UNITS, unit0);
    const at = h('input', { type: 'time', value: c.at || '09:00' });
    const daySet = new Set(Array.isArray(c.days) && c.days.length ? c.days.map(Number) : [0, 1, 2, 3, 4, 5, 6]);
    const dayBtns = DAYS.map((d, i) => { const b = h('button', { type: 'button', class: 'day', 'aria-pressed': String(daySet.has(i)), text: d }); b.addEventListener('click', () => { daySet.has(i) ? daySet.delete(i) : daySet.add(i); b.setAttribute('aria-pressed', String(daySet.has(i))); }); return b; });
    panes.manual = h('p', { class: 'blurb', text: 'The workflow runs only when you press Run now.' });
    panes.every = h('div', { class: 'inline' }, h('span', { text: 'Every' }), n, unit);
    panes.daily = h('div', {}, h('div', { class: 'inline' }, h('span', { text: 'At' }), at), h('div', { class: 'days' }, dayBtns),
      h('div', { class: 'inline', style: { marginTop: '6px' } }, btn('Weekdays', () => { daySet.clear(); [1, 2, 3, 4, 5].forEach(d => daySet.add(d)); dayBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(daySet.has(i)))); }, 'sm ghost'),
        btn('Every day', () => { [0, 1, 2, 3, 4, 5, 6].forEach(d => daySet.add(d)); dayBtns.forEach(b => b.setAttribute('aria-pressed', 'true')); }, 'sm ghost')));
    const holder = h('div', { class: 'sched' });
    const paint = () => { holder.replaceChildren(panes[mode]); radios.querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.m === mode))); };
    for (const [m, label] of [['manual', 'Manual only'], ['every', 'Repeat every…'], ['daily', 'At a time of day']]) {
      const b = h('button', { type: 'button', role: 'radio', dataset: { m }, text: label });
      b.addEventListener('click', () => { mode = m; paint(); });
      radios.append(b);
    }
    paint();
    return modal({ title: 'When should it run?', body: [radios, holder], actions: [{ label: 'Save', primary: true, run: () => {
      if (mode === 'manual') return { config: {} };
      if (mode === 'every') {
        const ms = Math.round(parseFloat(n.value) * parseInt(unit.value, 10));
        if (!(ms >= 5000)) throw new Error('Pick at least 5 seconds.');
        return { config: { intervalMs: ms } };
      }
      if (!daySet.size) throw new Error('Pick at least one day.');
      return { config: { at: at.value || '09:00', days: [...daySet].sort() } };
    } }] });
  }

  async function stepEditor(ctx, step, workflowSteps) {
    let type = step ? step.type : null;
    const c = (step && step.config) || {};
    const picker = h('div', { class: 'type-grid' });
    const form = h('div', { class: 'step-form' });
    const inputs = {};
    const I = (k, el) => (inputs[k] = el);
    const others = workflowSteps.filter(s => s.type !== 'trigger' && (!step || s.id !== step.id));
    const branchOpts = [{ value: 'next', label: 'Continue to the next step' }, { value: 'stop', label: 'Stop the workflow' },
      ...others.map(s => ({ value: s.id, label: `Go to step ${stepNo(workflowSteps, s.id)} — ${typeOf(s.type).label}` }))];

    const draw = async () => {
      picker.querySelectorAll('.type-card').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.t === type)));
      form.replaceChildren();
      if (!type) { form.append(h('p', { class: 'blurb', text: 'Pick what this step does.' })); return; }
      const label = I('label', h('input', { type: 'text', value: (step && step.label) || '', placeholder: 'Optional name for this step' }));
      if (type === 'agent') {
        const agent = I('agentKey', select(ctx.registry.map(a => ({ value: a.id, label: a.name })), c.agentKey || (ctx.registry[0] && ctx.registry[0].id)));
        const acct = I('accountId', h('select'));
        const fillAccts = () => {
          const mine = ctx.accounts.filter(a => (a.agentKeys || []).includes(agent.value));
          acct.replaceChildren(...[{ value: '', label: 'Its default account' }, ...mine.map(a => ({ value: a.id, label: a.label }))].map(o => h('option', { value: o.value, text: o.label, selected: o.value === (c.accountId || '') ? 'selected' : null })));
        };
        agent.addEventListener('change', fillAccts); fillAccts();
        form.append(h('div', { class: 'grid' }, field('Agent', agent), field('Send as', acct, 'Accounts come from Accounts & sign-in')),
          field('Prompt', I('prompt', h('textarea', { rows: 4, value: c.prompt || '', placeholder: 'Summarise today’s unread notifications in five bullet points.' }))));
      }
      if (type === 'macro') {
        const macros = ctx.macros.length ? ctx.macros.map(m => ({ value: m.name, label: m.name })) : [{ value: '', label: 'No macros yet — record one on the Macros page' }];
        const wins = await agentOptions().catch(() => []);
        const winOpts = [{ value: 'default', label: 'Main window' }, ...wins.filter(w => w.value !== 'default')];
        const params = c.params ? Object.entries(c.params).map(([k, v]) => `${k}=${v}`).join('\n') : '';
        form.append(h('div', { class: 'grid' }, field('Macro', I('name', select(macros, c.name || (ctx.macros[0] && ctx.macros[0].name) || ''))), field('Run in', I('agentId', select(winOpts, c.agentId || 'default')))),
          field('Values for the macro', I('params', h('textarea', { rows: 3, value: params, placeholder: 'name=Jane Doe\nemail=jane@example.com' })), 'One per line, name=value — fills the macro’s {{name}} slots'));
      }
      if (type === 'delay') {
        const ms = c.ms || 60000;
        const unitV = ms % 60000 === 0 ? '60000' : '1000';
        form.append(h('div', { class: 'inline' }, h('span', { text: 'Wait' }), I('n', h('input', { type: 'number', min: 1, value: ms / parseInt(unitV, 10) })),
          I('unit', select([{ value: '1000', label: 'seconds' }, { value: '60000', label: 'minutes' }], unitV))), h('p', { class: 'blurb', text: 'Up to 5 minutes.' }));
      }
      if (type === 'condition') {
        const vars = [{ value: 'mesh.queueDepth', label: 'Mesh queue length' }, { value: 'mesh.agentCount', label: 'Number of agent tabs open' },
          ...ctx.view.flatMap(n => [{ value: `${n.id}.status`, label: `${n.label} — status` }, { value: `${n.id}.health`, label: `${n.label} — health` }])];
        if (c.var && !vars.some(v => v.value === c.var)) vars.push({ value: c.var, label: c.var });
        form.append(h('div', { class: 'grid' }, field('When', I('var', select(vars, c.var || 'mesh.queueDepth'))), field('', I('op', select(OPS, c.op || '>')))),
          field('This value', I('value', h('input', { type: 'text', value: c.value ?? '0', placeholder: '0, alive, 60…' }))),
          h('div', { class: 'grid' }, field('If it matches', I('onTrue', select(branchOpts, c.onTrue || 'next'))), field('Otherwise', I('onFalse', select(branchOpts, c.onFalse || 'stop')))));
      }
      if (type === 'command') {
        form.append(h('div', { class: 'grid' }, field('System', I('system', select(SYSTEMS, c.system === 'clearglass' ? 'clear-glass' : (c.system || 'guardian')))), field('Method', I('method', select(['GET', 'POST'], (c.method || 'GET').toUpperCase())))),
          field('Endpoint', I('endpoint', h('input', { type: 'text', value: c.endpoint || '/health', class: 'mono' })), 'Each system lists what it offers at GET /commands'),
          field('Body (JSON, for POST)', I('body', h('textarea', { rows: 3, class: 'mono', value: c.body || '' }))));
      }
      if (type === 'notify') {
        form.append(field('Title', I('title', h('input', { type: 'text', value: c.title || '{{workflow}}' })), '{{workflow}} becomes the workflow’s name'),
          field('Message', I('body', h('textarea', { rows: 2, value: c.body || '' }))));
      }
      form.append(field('Step name', label));
    };
    for (const t of TYPES) {
      const b = h('button', { type: 'button', class: 'type-card', dataset: { t: t.id } }, h('span', { class: 'ico', text: t.icon }), h('span', { class: 't', text: t.label }), h('span', { class: 'd', text: t.help }));
      b.addEventListener('click', () => { type = t.id; draw(); });
      picker.append(b);
    }
    draw();
    return modal({ title: step ? 'Edit step' : 'Add a step', wide: true, body: [picker, form], actions: [{ label: step ? 'Save step' : 'Add step', primary: true, run: () => {
      if (!type) throw new Error('Pick what this step does.');
      const v = (k) => (inputs[k] ? inputs[k].value : '');
      const cfg = {};
      if (type === 'agent') {
        cfg.agentKey = v('agentKey'); cfg.prompt = v('prompt').trim();
        if (v('accountId')) cfg.accountId = v('accountId');
        if (!cfg.agentKey) throw new Error('Pick an agent.');
        if (!cfg.prompt) throw new Error('Write the prompt.');
      }
      if (type === 'macro') {
        cfg.name = v('name'); cfg.agentId = v('agentId') || 'default';
        if (!cfg.name) throw new Error('Pick a macro (record one on the Macros page first).');
        const params = {};
        for (const line of v('params').split('\n')) { const i = line.indexOf('='); if (i > 0) params[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
        if (Object.keys(params).length) cfg.params = params;
      }
      if (type === 'delay') {
        cfg.ms = Math.round(parseFloat(v('n')) * parseInt(v('unit'), 10));
        if (!(cfg.ms > 0)) throw new Error('How long should it wait?');
        if (cfg.ms > 300000) throw new Error('A wait can be at most 5 minutes.');
      }
      if (type === 'condition') Object.assign(cfg, { var: v('var'), op: v('op'), value: v('value'), onTrue: v('onTrue'), onFalse: v('onFalse') });
      if (type === 'command') {
        Object.assign(cfg, { system: v('system'), method: v('method'), endpoint: v('endpoint') || '/health' });
        if (!cfg.endpoint.startsWith('/')) throw new Error('The endpoint starts with /');
        if (v('body').trim()) { try { JSON.parse(v('body')); } catch (e) { throw new Error(`The body isn’t valid JSON: ${e.message}`); } cfg.body = v('body'); }
      }
      if (type === 'notify') { cfg.title = v('title').trim(); cfg.body = v('body').trim(); if (!cfg.title && !cfg.body) throw new Error('Write a title or a message.'); }
      return { type, config: cfg, label: v('label').trim() };
    } }] });
  }

  // ── Templates ───────────────────────────────────────────────────────────
  const TEMPLATES = [
    { id: 'blank', name: 'Blank workflow', help: 'Start empty and add your own steps.', steps: [{ type: 'trigger', config: {} }] },
    { id: 'digest', name: 'Morning digest', help: 'Every weekday at 08:30, ask an agent for a briefing, then notify you.',
      steps: [{ type: 'trigger', config: { at: '08:30', days: [1, 2, 3, 4, 5] } }, { type: 'agent', config: { agentKey: 'claude', prompt: 'Give me a short morning briefing: what to focus on today.' } }, { type: 'notify', config: { title: '{{workflow}}', body: 'Your briefing has been sent to Claude.' } }] },
    { id: 'health', name: 'Guardian health check', help: 'Every 15 minutes, check that Guardian answers. A failed check shows in the run history.',
      steps: [{ type: 'trigger', config: { intervalMs: 900000 } }, { type: 'command', config: { system: 'guardian', method: 'GET', endpoint: '/health' } }] },
    { id: 'queue', name: 'Queue watchdog', help: 'Every 5 minutes, warn you when more than 5 prompts are waiting in the mesh.',
      steps: [{ id: 't1', type: 'trigger', config: { intervalMs: 300000 } }, { id: 'c1', type: 'condition', config: { var: 'mesh.queueDepth', op: '>', value: '5', onTrue: 'next', onFalse: 'stop' } }, { id: 'n1', type: 'notify', config: { title: 'Mesh queue is backing up', body: 'More than 5 prompts are waiting.' } }] },
    { id: 'macro', name: 'Daily macro', help: 'Every day at 09:00, replay a macro (pick it after creating).', steps: [{ type: 'trigger', config: { at: '09:00', days: [] } }] },
  ];

  async function newWorkflow(rerender) {
    let chosen = 'blank';
    const name = h('input', { type: 'text', placeholder: 'Morning digest' });
    const list = h('div', { class: 'tpl-list', role: 'radiogroup' });
    const paint = () => list.querySelectorAll('.tpl').forEach(b => b.setAttribute('aria-checked', String(b.dataset.t === chosen)));
    for (const t of TEMPLATES) {
      const b = h('button', { type: 'button', role: 'radio', class: 'tpl', dataset: { t: t.id } }, h('span', { class: 't', text: t.name }), h('span', { class: 'd', text: t.help }));
      b.addEventListener('click', () => { chosen = t.id; if (!name.value.trim() || TEMPLATES.some(x => x.name === name.value)) name.value = t.id === 'blank' ? '' : t.name; paint(); });
      list.append(b);
    }
    paint();
    const r = await modal({ title: 'New workflow', wide: true, body: [field('Start from', list), field('Name', name)], actions: [{ label: 'Create workflow', primary: true, run: () => {
      if (!name.value.trim()) throw new Error('Name it first.');
      const t = TEMPLATES.find(x => x.id === chosen);
      return wire('/automation/workflows', { method: 'POST', body: { name: name.value.trim(), description: t.id === 'blank' ? '' : t.help, status: 'paused', steps: t.steps } });
    } }] });
    if (r) { toast('Workflow created — check its steps, then switch it on'); rerender(); }
  }

  // ── The page ────────────────────────────────────────────────────────────
  section({
    id: 'automation', group: 'Agents', icon: '↻', label: 'Automation',
    keywords: 'workflow trigger schedule step condition delay command tasker notify macro daily every',
    blurb: 'Workflows read as sentences: when something happens, do these steps. Ask agents, run macros, check values, call NEXUS systems and get notified — on a schedule or when you press Run now.',
    related: ['macros', 'mesh'],
    async render({ tools, rerender }) {
      const [wf, m, accounts, macros] = await Promise.all([
        wire('/automation/workflows'), call(() => cg.mesh.list(), 'mesh'),
        cg.accounts.list().catch(() => []), cg.macros.list().then(r => (r && r.macros) || (Array.isArray(r) ? r : [])).catch(() => []),
      ]);
      const view = await wire('/agent-mesh/view').then(v => v.nodes || []).catch(() => []);
      const ctx = {
        registry: m.registry || [], accounts: accounts || [], macros: macros || [], view,
        agentName: (k) => ((m.registry || []).find(a => a.id === k) || { name: k || '?' }).name,
        accountName: (id) => ((accounts || []).find(a => a.id === id) || { label: id ? id.slice(0, 8) + '…' : '' }).label,
        varName: (v) => v === 'mesh.queueDepth' ? 'the mesh queue length' : v === 'mesh.agentCount' ? 'the number of agent tabs' : (() => { const [id, f] = String(v || '').split('.'); const n = view.find(x => x.id === id); return n ? `${n.label}’s ${f}` : v; })(),
      };
      tools.append(btn('New workflow', () => newWorkflow(rerender), 'primary'));
      const W = (id) => `/automation/workflows/${encodeURIComponent(id)}`;

      const panes = wf.workflows.map(w => {
        const steps = w.steps || [];
        const trigger = steps.find(s => s.type === 'trigger');
        const body = steps.filter(s => s.type !== 'trigger');
        const sctx = { ...ctx, steps, wfName: w.name };
        const active = w.status === 'active';

        const whenCard = h('div', { class: 'when' }, h('span', { class: 'kw', text: 'When' }), h('span', { class: 'txt', text: whenText(trigger) }),
          btn('Change', async () => {
            const r = await triggerEditor(trigger);
            if (!r) return;
            await busy(null, () => trigger ? wire(`${W(w.id)}/steps/${trigger.id}`, { method: 'PATCH', body: { config: r.config, enabled: true } })
              : wire(`${W(w.id)}/steps`, { method: 'POST', body: { type: 'trigger', config: r.config } }).then(async (x) => {
                // a new trigger goes first
                const st = x && x.step; if (st) for (let i = 0; i < body.length; i++) await wire(`${W(w.id)}/steps/${st.id}/move`, { method: 'POST', body: { dir: 'up' } });
              }));
            rerender();
          }, 'sm'));

        const cards = body.map((s, i) => {
          const t = typeOf(s.type), off = s.enabled === false;
          const card = h('div', { class: `step-card${off ? ' off' : ''}` },
            h('span', { class: 'n', text: String(i + 1) }), h('span', { class: 'ico', 'aria-hidden': 'true', text: t.icon }),
            h('div', { class: 'what' }, h('div', { class: 't', text: s.label || t.label }), h('div', { class: 'd', text: stepText(s, sctx) })),
            h('div', { class: 'acts' },
              toggle(!off, async (on) => { await call(() => wire(`${W(w.id)}/steps/${s.id}`, { method: 'PATCH', body: { enabled: on } }), 'switch step'); rerender(); }, `Step ${i + 1} on`),
              btn('↑', () => busy(null, async () => { await wire(`${W(w.id)}/steps/${s.id}/move`, { method: 'POST', body: { dir: 'up' } }); rerender(); }), 'sm ghost'),
              btn('↓', () => busy(null, async () => { await wire(`${W(w.id)}/steps/${s.id}/move`, { method: 'POST', body: { dir: 'down' } }); rerender(); }), 'sm ghost'),
              btn('Edit', async () => { const st = await stepEditor(ctx, s, steps); if (st) { await busy(null, () => wire(`${W(w.id)}/steps/${s.id}`, { method: 'PATCH', body: st })); rerender(); } }, 'sm'),
              btn('✕', async () => { if (await confirmDo('Remove this step?', stepText(s, sctx), 'Remove')) { await busy(null, () => wire(`${W(w.id)}/steps/${s.id}`, { method: 'DELETE' })); rerender(); } }, 'sm ghost')));
          card.querySelector('.acts button.ghost').setAttribute('aria-label', 'Move up');
          return card;
        });
        const addStep = btn('+ Add a step', async () => {
          const st = await stepEditor(ctx, null, steps);
          if (st) { await busy(null, () => wire(`${W(w.id)}/steps`, { method: 'POST', body: st })); rerender(); }
        }, 'sm add-step');

        const history = h('details', { class: 'history' }, h('summary', { text: 'Run history' }), h('div', { class: 'blurb', text: 'Loading…' }));
        history.addEventListener('toggle', async () => {
          if (!history.open) return;
          const lg = await wire(`/automation/log?workflowId=${encodeURIComponent(w.id)}&limit=40`).catch(e => ({ error: e.message }));
          const box = history.querySelector('div');
          box.replaceChildren(lg.error ? h('div', { class: 'err-box', text: lg.error }) : (lg.log || []).length
            ? h('pre', { class: 'out', text: lg.log.map(e => `${new Date(e.ts).toLocaleString()}  ${e.msg}`).join('\n') }) : h('p', { class: 'blurb', text: 'Not run since Clear Glass started.' }));
        });

        const next = active ? whenNext(w.nextRunAt) : null;
        const sub = [active ? (next ? `next run ${next}` : 'on — runs when you press Run now') : 'off', `${w.runCount || 0} run${w.runCount === 1 ? '' : 's'}`, w.lastRun ? `last ${ago(w.lastRun)}` : null].filter(Boolean).join(' · ');
        const more = btn('⋯', async () => {
          const nm = h('input', { type: 'text', value: w.name });
          const ds = h('textarea', { rows: 2, value: w.description || '', placeholder: 'What this workflow is for' });
          const r = await modal({ title: 'Workflow', body: [field('Name', nm), field('Description', ds)], actions: [
            { label: 'Duplicate', run: () => wire('/automation/workflows', { method: 'POST', body: { name: `${w.name} (copy)`, description: w.description || '', status: 'paused', steps } }).then(() => 'dup') },
            { label: 'Delete', danger: true, run: async () => { if (!await confirmDo(`Delete “${w.name}”?`, 'The workflow and its steps are removed.', 'Delete')) return false; await wire(W(w.id), { method: 'DELETE' }); return 'deleted'; } },
            { label: 'Save', primary: true, run: () => { if (!nm.value.trim()) throw new Error('Give it a name.'); return wire(W(w.id), { method: 'PATCH', body: { name: nm.value.trim(), description: ds.value.trim() } }); } }] });
          if (r) { toast(r === 'dup' ? 'Duplicated (switched off)' : r === 'deleted' ? 'Workflow deleted' : 'Saved'); rerender(); }
        }, 'sm ghost');
        more.setAttribute('aria-label', `More for ${w.name}`);

        return pane({ title: w.name, sub, cls: `wf${active ? ' on' : ''}`,
          tools: h('div', { class: 'wf-tools' },
            h('label', { class: 'onoff' }, toggle(active, async (on) => { await call(() => wire(W(w.id), { method: 'PATCH', body: { status: on ? 'active' : 'paused' } }), 'switch workflow'); toast(on ? `“${w.name}” is on` : `“${w.name}” is off`); rerender(); }, `${w.name} on`), h('span', { text: active ? 'On' : 'Off' })),
            btn('Run now', (e) => busy(e.currentTarget, async () => { const r = await wire(`${W(w.id)}/run`, { method: 'POST', allowNotOk: true }); r.ok === false ? toast(`“${w.name}” stopped: ${r.error}`, 'err', 7000) : toast(`Ran “${w.name}”`); rerender(); }), 'sm primary'), more),
          body: [w.description ? h('p', { class: 'blurb desc', text: w.description }) : null, whenCard,
            h('div', { class: 'then' }, h('span', { class: 'kw', text: 'Then' }), cards.length ? cards : h('p', { class: 'blurb', text: 'No steps yet.' }), addStep), history] });
      });

      const log = await wire('/automation/log').catch(e => ({ log: [], error: e.message }));
      const entries = (log.log || []).slice(0, 40); // engine keeps newest first
      return [
        ...(panes.length ? panes : [pane({ title: 'No workflows yet', body: [h('p', { class: 'blurb', text: 'A workflow runs steps for you — ask an agent every morning, replay a macro, or warn you when something needs attention.' }), h('div', { style: { marginTop: '10px' } }, btn('Create your first workflow', () => newWorkflow(rerender), 'primary'))] })]),
        pane({ title: 'Recent runs', sub: 'All workflows, newest first', body: log.error ? h('div', { class: 'err-box', text: log.error }) : entries.length ? h('pre', { class: 'out', text: entries.map(e => `${new Date(e.ts).toLocaleString()}  ${e.workflowName || e.workflowId}: ${e.msg}`).join('\n') }) : h('p', { class: 'blurb', text: 'Nothing has run yet.' }) }),
      ];
    },
  });
})();
