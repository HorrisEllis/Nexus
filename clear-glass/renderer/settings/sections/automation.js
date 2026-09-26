'use strict';
/**
 * renderer/settings/sections/automation.js — Automation  (styles: automation.css)
 *
 * v0.39.227 — split out of sections/mesh.js. The engine is
 * src/mesh/automation-engine.js (the same backend BrainOS's Automation tab
 * uses, not a second engine), reached over the wire's /automation/* routes.
 *
 * §0.39.265 — James: "can you make the workflow settings more user friendly and
 * expand it fully." A workflow reads as a sentence: "When" (its triggers) and
 * "Then" (numbered step cards in plain words), each step with its own on/off
 * switch, ↑ ↓, edit, delete.
 *
 * §0.39.265 (v2) — "expand the workflow, and macros, as much as you can … tasker,
 * automate … as much as i can automate on a browser, with scheduling, dom tools,
 * full enterprise grade." The step editor is drawn from the engine's own
 * catalogue (GET /automation/catalogue — src/automation/steps.js), so every
 * step type the engine knows — browser actions, reading the page, wait until,
 * variables, loops, web requests, files, sub-workflows — has a form, with the
 * values earlier steps produce offered as {{placeholders}} and a "Try it" for
 * browser steps. Triggers: every N, daily, cron (with a live preview), events,
 * webhooks. Each workflow shows its variables, problems, live runs (cancel),
 * and a run history you can open step by step; plus settings, import/export,
 * a template gallery, "from a macro", and the automation pages.
 */
(function () {
  const { cg, h, call, wire, toast, busy, modal, confirmDo, field, pane, btn, chip, ago, select, toggle, agentOptions, section, copy, onLeave, WIRE_PORT } = window.CGS;

  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const SYSTEMS = [{ value: 'guardian', label: 'Guardian' }, { value: 'ollama', label: 'Ollama' }, { value: 'copilot', label: 'Co-pilot' }, { value: 'clear-glass', label: 'Clear Glass' }];
  const DUR_UNITS = [{ value: '1', label: 'ms' }, { value: '1000', label: 'seconds' }, { value: '60000', label: 'minutes' }, { value: '3600000', label: 'hours' }];
  const clip = (s, n = 80) => { s = s == null ? '' : typeof s === 'object' ? JSON.stringify(s) : String(s); return s.length > n ? s.slice(0, n) + '…' : s; };
  const durText = (ms) => { ms = parseInt(ms, 10) || 0; if (!ms) return '0 s'; if (ms % 3600000 === 0) return `${ms / 3600000} h`; if (ms % 60000 === 0) return `${ms / 60000} min`; if (ms % 1000 === 0) return `${ms / 1000} s`; return `${ms} ms`; };
  const kvText = (v) => (v && typeof v === 'object' ? Object.entries(v).map(([k, x]) => `${k} = ${typeof x === 'object' ? JSON.stringify(x) : x}`).join('\n') : (v || ''));
  const kvObj = (s) => { const o = {}; for (const line of String(s || '').split('\n')) { const i = line.search(/[=:]/); if (i > 0) o[line.slice(0, i).trim()] = line.slice(i + 1).trim(); } return o; };
  let CAT = null;   // the catalogue, fetched once per render
  const catOf = (type) => (CAT && CAT.catalogue.find(c => c.type === type)) || { type, icon: '•', label: type, help: '', fields: [] };
  // the label of one choice of a step's field (the action, the read mode, the wait kind); the value itself if unknown
  const optLabel = (type, key, value) => { const f = catOf(type).fields.find(x => x.key === key); const o = f && (f.options || []).find(x => (x.value ?? x) === value); return o ? (o.label ?? o) : value; };
  const EMPTY_CAT = { catalogue: [], trigger: { kinds: [{ value: 'manual', label: 'Only when I press Run' }], events: [] }, common: [], ops: [] };

  // ── Plain-English sentences ─────────────────────────────────────────────
  function triggerText(t) {
    const c = (t && t.config) || {};
    if (!t || t.enabled === false) return 'Only when you press Run';
    if (c.cron) return `On the schedule “${c.cron}”`;
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
    if (c.event) {
      const ev = CAT && CAT.trigger.events.find(e => e.value === c.event);
      return `When ${ev ? ev.label.replace(/^I /, 'you ').replace(/ \(.*\)$/, '') : `the event “${c.event}” fires`}${c.match ? ` — “${c.match}”` : ''}`;
    }
    if (c.webhook) return 'When a web request arrives (webhook)';
    return 'Only when you press Run';
  }
  const bodyOnly = (steps) => steps.filter(s => s.type !== 'trigger');
  const stepNo = (steps, id) => { const i = bodyOnly(steps).findIndex(s => s.id === id); return i >= 0 ? i + 1 : null; };
  function branchText(steps, target) {
    if (!target || target === 'next') return 'continue';
    if (target === 'stop') return 'stop'; if (target === 'fail') return 'fail the run';
    if (target === 'continue') return 'skip to the next item'; if (target === 'break') return 'leave the loop';
    const n = stepNo(steps, target);
    return n ? `go to step ${n}` : 'continue (that step is gone)';
  }
  function stepText(s, ctx) {
    const c = s.config || {};
    const OPL = (op) => ((CAT && CAT.ops.find(o => o.value === op)) || { label: op }).label;
    switch (s.type) {
      case 'agent': return `${c.await ? 'Ask' : 'Send to'} ${ctx.agentName(c.agentKey)}${c.accountId ? ` as “${ctx.accountName(c.accountId)}”` : ''}: “${clip(c.prompt, 90)}”${c.await ? ' — and wait for the reply' : ''}`;
      case 'macro': return `Run the macro “${c.name || '?'}” in ${c.agentId || 'the main window'}${c.params && Object.keys(c.params).length ? ` with ${Object.keys(typeof c.params === 'object' ? c.params : kvObj(c.params)).join(', ')}` : ''}`;
      case 'delay': return `Wait ${durText(c.ms || 1000)}${c.jitterMs ? ` (+ up to ${durText(c.jitterMs)})` : ''}`;
      case 'condition': return `If ${c.left ? clip(c.left, 50) : ctx.varName(c.var)} ${OPL(c.op)}${['empty', 'not_empty', 'exists', 'missing', 'changed'].includes(c.op) ? '' : ` ${clip(c.value, 40)}`} → ${branchText(ctx.steps, c.onTrue)}, otherwise ${branchText(ctx.steps, c.onFalse)}`;
      case 'command': return `${(c.method || 'GET').toUpperCase()} ${(SYSTEMS.find(x => x.value === c.system) || { label: c.system }).label} ${c.endpoint || '/health'}`;
      case 'notify': return `Notify: “${clip(String(c.title || '{{workflow}}').replace(/\{\{\s*workflow\s*\}\}/g, ctx.wfName || 'the workflow'), 60)}”${c.body ? ` — ${clip(c.body, 60)}` : ''}`;
      case 'browser': {
        const a = optLabel('browser', 'action', c.action);
        const where = !c.page || c.page === 'auto' ? '' : ` in ${c.page === 'default' ? 'the main window' : c.page}`;
        const what = c.action === 'navigate' ? ` ${clip(c.url, 70)}` : c.action === 'eval' ? ` (${String(c.code || '').length} characters)` : c.selector ? ` ${clip(c.selector, 50)}` : '';
        const val = ['fill', 'type', 'select'].includes(c.action) && c.value != null ? ` ← “${clip(c.value, 40)}”` : c.action === 'press' ? ` ${c.key || 'Enter'}` : '';
        return `${a}${what}${val}${where}${c.waitAfterMs ? `, then wait ${durText(c.waitAfterMs)}` : ''}`;
      }
      case 'extract': {
        const m = optLabel('extract', 'mode', c.mode);
        return `Read ${m}${c.selector ? ` — ${clip(c.selector, 50)}` : ''}${c.mode === 'attr' ? ` @${c.attr || 'href'}` : ''}${c.transform ? ` | ${c.transform}` : ''}`;
      }
      case 'wait_until': {
        const k = optLabel('wait_until', 'kind', c.kind);
        return `Wait until ${k}${c.selector ? ` — ${clip(c.selector, 40)}` : ''}${c.text ? ` “${clip(c.text, 30)}”` : ''}${c.url ? ` ${clip(c.url, 40)}` : ''}${c.left ? ` ${clip(c.left, 30)} ${OPL(c.op)} ${clip(c.value, 20)}` : ''} (up to ${durText(c.timeoutMs || 30000)})`;
      }
      case 'set': return `Set ${Object.keys(typeof c.assign === 'object' ? c.assign || {} : kvObj(c.assign)).map(k => k).join(', ') || '…'}`;
      case 'loop': return `${c.items ? `For each item in ${clip(c.items, 50)}` : `Repeat ${c.times || '?'} times`} — the next ${c.body || 1} step${(c.body || 1) == 1 ? '' : 's'}${c.onlyNew ? ', only items not seen before' : ''}`;
      case 'http': return `${(c.method || 'GET').toUpperCase()} ${clip(c.url, 70)}`;
      case 'file': return `${c.mode === 'write' ? 'Write' : 'Add'} ${c.format === 'csv' ? 'CSV rows' : c.format === 'json' ? 'JSON' : c.format === 'jsonl' ? 'JSON lines' : 'text'} to ${clip(c.path, 50)}`;
      case 'workflow': return `Run the workflow “${ctx.wfNameOf(c.workflow)}”${c.vars && Object.keys(typeof c.vars === 'object' ? c.vars : kvObj(c.vars)).length ? ' with values' : ''}`;
      case 'log': return `Log “${clip(c.message, 80)}”`;
      case 'emit': return `Send the event “${c.event || '?'}”`;
      case 'stop': return 'Finish the run here';
      case 'fail': return `Fail: “${clip(c.message, 60)}”`;
      default: return JSON.stringify(c);
    }
  }
  function badges(s, steps) {
    const out = [];
    if (s.saveAs) out.push(chip(`→ ${s.saveAs}`));
    if (s.retry && parseInt(s.retry.count, 10) > 0) out.push(chip(`retry ×${s.retry.count}`));
    if (s.timeoutMs) out.push(chip(`≤ ${durText(s.timeoutMs)}`));
    if (s.onError && s.onError !== 'fail') out.push(chip(`on error: ${s.onError === 'continue' ? 'carry on' : s.onError === 'stop' ? 'stop' : branchText(steps, s.onError)}`, 'warn'));
    return out;
  }
  function whenNext(ts) {
    if (!ts) return null;
    const d = new Date(ts), now = new Date();
    const t = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === now.toDateString()) return `today ${t}`;
    if (new Date(now.getTime() + 86400000).toDateString() === d.toDateString()) return `tomorrow ${t}`;
    return `${d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })} ${t}`;
  }

  // ── Trigger editor ──────────────────────────────────────────────────────
  async function triggerEditor(trigger, hookUrl) {
    const c = (trigger && trigger.enabled !== false && trigger.config) || {};
    let mode = c.cron ? 'cron' : c.at ? 'daily' : c.intervalMs ? 'every' : c.event ? 'event' : c.webhook ? 'webhook' : 'manual';
    const kinds = CAT.trigger.kinds;
    const radios = h('div', { class: 'seg wrap', role: 'radiogroup' });
    const panes = {};
    const unit0 = c.intervalMs && c.intervalMs % 3600000 === 0 ? '3600000' : c.intervalMs && c.intervalMs % 60000 === 0 ? '60000' : c.intervalMs ? '1000' : '60000';
    const n = h('input', { type: 'number', min: 1, value: c.intervalMs ? c.intervalMs / parseInt(unit0, 10) : 30 });
    const unit = select([{ value: '1000', label: 'seconds' }, { value: '60000', label: 'minutes' }, { value: '3600000', label: 'hours' }], unit0);
    const at = h('input', { type: 'time', value: c.at || '09:00' });
    const daySet = new Set(Array.isArray(c.days) && c.days.length ? c.days.map(Number) : [0, 1, 2, 3, 4, 5, 6]);
    const dayBtns = DAYS.map((d, i) => { const b = h('button', { type: 'button', class: 'day', 'aria-pressed': String(daySet.has(i)), text: d }); b.addEventListener('click', () => { daySet.has(i) ? daySet.delete(i) : daySet.add(i); b.setAttribute('aria-pressed', String(daySet.has(i))); }); return b; });
    const setDays = (ds) => { daySet.clear(); ds.forEach(d => daySet.add(d)); dayBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(daySet.has(i)))); };
    panes.manual = h('p', { class: 'blurb', text: 'The workflow runs only when you press Run (or another workflow runs it).' });
    panes.every = h('div', { class: 'inline' }, h('span', { text: 'Every' }), n, unit);
    panes.daily = h('div', {}, h('div', { class: 'inline' }, h('span', { text: 'At' }), at), h('div', { class: 'days' }, dayBtns),
      h('div', { class: 'inline', style: { marginTop: '6px' } }, btn('Weekdays', () => setDays([1, 2, 3, 4, 5]), 'sm ghost'), btn('Every day', () => setDays([0, 1, 2, 3, 4, 5, 6]), 'sm ghost')));
    // cron, with a live reading and the next three times
    const cron = h('input', { type: 'text', class: 'mono', value: c.cron || '0 9 * * 1-5', placeholder: 'minute hour day month weekday' });
    const cronOut = h('div', { class: 'blurb' });
    let cronOk = true;
    const previewCron = async () => {
      const r = await wire(`/automation/cron?expr=${encodeURIComponent(cron.value)}`, { allowNotOk: true }).catch(e => ({ ok: false, error: e.message }));
      cronOk = !!r.ok;
      cronOut.replaceChildren(r.ok ? h('span', {}, h('b', { text: r.text }), ` — next: ${r.next.map(t => new Date(t).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })).join(' · ')}`) : h('span', { style: { color: 'var(--bad)' }, text: r.error }));
    };
    let cronTimer = null;
    cron.addEventListener('input', () => { clearTimeout(cronTimer); cronTimer = setTimeout(previewCron, 250); });
    const presets = [['Every 15 min', '*/15 * * * *'], ['Hourly', '0 * * * *'], ['Weekdays 9:00', '0 9 * * 1-5'], ['Mon 8:30', '30 8 * * 1'], ['1st of month', '0 9 1 * *'], ['Every 2 h, work hours', '0 8-18/2 * * 1-5']];
    panes.cron = h('div', {}, field('Cron expression', cron, 'minute  hour  day-of-month  month  weekday — e.g. */30 8-20 * * 1-5'),
      h('div', { class: 'inline wrap' }, presets.map(([l, v]) => btn(l, () => { cron.value = v; previewCron(); }, 'sm ghost'))), cronOut);
    // events
    const evSel = select(CAT.trigger.events, CAT.trigger.events.some(e => e.value === c.event) ? c.event : c.event ? 'custom' : 'page.visited');
    const custom = h('input', { type: 'text', placeholder: 'jobs.found', value: c.event && !CAT.trigger.events.some(e => e.value === c.event) ? c.event : '' });
    const match = h('input', { type: 'text', value: c.match || '', placeholder: '*://*.upwork.com/jobs/*' });
    const cool = h('input', { type: 'number', min: 0, value: c.cooldownMs != null ? Math.round(c.cooldownMs / 1000) : '' , placeholder: '30' });
    const evExtra = h('div');
    const paintEv = () => {
      const ev = CAT.trigger.events.find(e => e.value === evSel.value) || {};
      evExtra.replaceChildren(
        evSel.value === 'custom' ? field('Event name', custom, 'Sent by a “Send an event” step, or POST /automation/events/<name>') : null,
        ev.match || evSel.value === 'custom' ? field(`Only when the ${ev.match || 'event name'} matches`, match, 'Leave empty for any. * is a wildcard; without *, “contains”.') : null,
        field('Not more often than every (seconds)', cool, evSel.value === 'page.visited' ? 'Default 30 s, so reloading a page does not start it again and again' : 'Optional'));
    };
    evSel.addEventListener('change', paintEv); paintEv();
    panes.event = h('div', {}, field('When', evSel), evExtra);
    panes.webhook = h('div', {}, h('p', { class: 'blurb', text: 'A POST to this address starts the workflow; its JSON body is {{trigger.*}}. The address works on this computer (Clear Glass listens on 127.0.0.1) — tunnel it to reach it from outside.' }),
      hookUrl ? h('div', { class: 'inline' }, h('code', { class: 'mono hook', text: hookUrl }), btn('Copy', () => copy(hookUrl), 'sm')) : h('p', { class: 'blurb', text: 'The address (with its secret token) appears after you save.' }),
      hookUrl ? h('p', { class: 'blurb', text: `curl -X POST '${hookUrl}' -H 'Content-Type: application/json' -d '{"text":"hello"}'` }) : null);
    const holder = h('div', { class: 'sched' });
    const paint = () => { holder.replaceChildren(panes[mode]); radios.querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.m === mode))); if (mode === 'cron') previewCron(); };
    for (const k of kinds) {
      const b = h('button', { type: 'button', role: 'radio', dataset: { m: k.value }, text: k.label });
      b.addEventListener('click', () => { mode = k.value; paint(); });
      radios.append(b);
    }
    paint();
    return modal({ title: 'When should it run?', wide: true, body: [radios, holder], actions: [{ label: 'Save', primary: true, run: () => {
      if (mode === 'manual') return { config: {} };
      if (mode === 'every') {
        const ms = Math.round(parseFloat(n.value) * parseInt(unit.value, 10));
        if (!(ms >= 5000)) throw new Error('Pick at least 5 seconds.');
        return { config: { intervalMs: ms } };
      }
      if (mode === 'daily') { if (!daySet.size) throw new Error('Pick at least one day.'); return { config: { at: at.value || '09:00', days: [...daySet].sort() } }; }
      if (mode === 'cron') { if (!cronOk) throw new Error('Fix the cron expression first.'); return { config: { cron: cron.value.trim() } }; }
      if (mode === 'event') {
        const ev = evSel.value === 'custom' ? custom.value.trim() : evSel.value;
        if (!ev) throw new Error('Name the event.');
        const cfg = { event: ev };
        if (match.value.trim()) cfg.match = match.value.trim();
        if (cool.value !== '') cfg.cooldownMs = Math.max(0, parseInt(cool.value, 10) || 0) * 1000;
        return { config: cfg };
      }
      if (mode === 'webhook') return { config: { webhook: true } };
      return { config: {} };
    } }] });
  }

  // ── Step editor — drawn from the catalogue ─────────────────────────────
  function fieldApplies(f, cur, cat) {
    if (!f.when) return true;
    return Object.entries(f.when).every(([k, vals]) => {
      const def = cat.fields.find(x => x.key === k);
      const v = cur[k] !== undefined && cur[k] !== '' ? cur[k] : def && def.default;
      return vals.includes(v);
    });
  }
  function durationInput(ms) {
    ms = parseInt(ms, 10) || 0;
    const u = ms && ms % 3600000 === 0 ? '3600000' : ms && ms % 60000 === 0 ? '60000' : ms && ms % 1000 === 0 ? '1000' : ms ? '1' : '1000';
    const num = h('input', { type: 'number', min: 0, step: 'any', value: ms / parseInt(u, 10) });
    const un = select(DUR_UNITS, u);
    const wrap = h('div', { class: 'inline' }, num, un);
    wrap.getValue = () => Math.round((parseFloat(num.value) || 0) * parseInt(un.value, 10));
    return wrap;
  }
  function placeholderBar(ctx, stepsBefore, insert) {
    const opts = [['{{last}}', 'the previous step’s output'], ...stepsBefore.filter(s => s.label).map(s => [`{{steps.${s.label}.output}}`, `what “${s.label}” returned`]),
      ...Object.keys(ctx.vars || {}).map(k => [`{{vars.${k}}}`, 'a workflow variable']), ['{{item}}', 'the loop’s current item'], ['{{index}}', 'the loop’s position (0, 1, …)'],
      ['{{trigger}}', 'what started the run'], ['{{now:YYYY-MM-DD HH:mm}}', 'the time'], ['{{error.message}}', 'the last error'], ['{{workflow}}', 'this workflow’s name']];
    return h('details', { class: 'ph-bar' }, h('summary', { text: 'Use values from the run: {{…}}' }),
      h('div', { class: 'ph-list' }, opts.map(([v, d]) => h('button', { type: 'button', class: 'ph', title: d, text: v, onclick: () => insert(v) }))),
      h('p', { class: 'blurb', text: 'Filters: {{last | number}}, | trim, | upper, | length, | first, | join:", ", | json, | match:"(\\d+)", | default:"none", | date:"YYYY-MM-DD", | slice:0,100 …' }));
  }

  async function stepEditor(ctx, step, workflowSteps, wf) {
    let type = step ? step.type : null;
    let cur = { ...((step && step.config) || {}) };
    let lastText = null;   // the text field a {{placeholder}} goes into
    const meta = { saveAs: (step && step.saveAs) || '', retryCount: (step && step.retry && step.retry.count) || 0, retryDelay: (step && step.retry && step.retry.delayMs) || 2000, backoff: !!(step && step.retry && step.retry.backoff), timeoutMs: (step && step.timeoutMs) || 0, onError: (step && step.onError) || 'fail' };
    const picker = h('div', { class: 'type-groups' });
    const form = h('div', { class: 'step-form' });
    const readers = {};   // key → () => value
    const idx = step ? workflowSteps.findIndex(s => s.id === step.id) : workflowSteps.length;
    const before = workflowSteps.slice(0, idx < 0 ? workflowSteps.length : idx).filter(s => s.type !== 'trigger');
    const others = workflowSteps.filter(s => s.type !== 'trigger' && (!step || s.id !== step.id));
    const branchOpts = (extra = []) => [...extra, { value: 'next', label: 'Continue to the next step' }, { value: 'stop', label: 'Stop the workflow' }, { value: 'fail', label: 'Fail the run' },
      { value: 'continue', label: 'Skip to the next loop item' }, { value: 'break', label: 'Leave the loop' },
      ...others.map(s => ({ value: s.id, label: `Go to step ${stepNo(workflowSteps, s.id)} — ${s.label || catOf(s.type).label}` }))];
    const label = h('input', { type: 'text', value: (step && step.label) || '', placeholder: 'Name it to use its output: {{steps.<name>.output}}' });

    const collect = () => { for (const [k, r] of Object.entries(readers)) { const v = r(); if (v === undefined) delete cur[k]; else cur[k] = v; } };
    const input = (f, v) => {
      const val = v === undefined ? f.default : v;
      let el;
      switch (f.type) {
        case 'textarea': case 'code': case 'json': el = h('textarea', { rows: f.type === 'code' ? 5 : 3, class: f.type !== 'textarea' ? 'mono' : null, placeholder: f.placeholder || '', value: val == null ? '' : typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val) }); break;
        case 'kv': el = h('textarea', { rows: 3, class: 'mono', placeholder: f.placeholder || 'name = value', value: kvText(val) }); readers[f.key] = () => { const o = kvObj(el.value); return Object.keys(o).length ? o : undefined; }; break;
        case 'number': el = h('input', { type: 'text', inputmode: 'numeric', placeholder: f.placeholder || '', value: val == null ? '' : String(val) }); readers[f.key] = () => { const s = el.value.trim(); if (!s) return undefined; return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : s; }; break;
        case 'bool': el = h('input', { type: 'checkbox', checked: val === true || val === 'true' }); readers[f.key] = () => el.checked; el.addEventListener('change', () => { collect(); draw(); }); return el;
        case 'duration': el = durationInput(val); readers[f.key] = () => el.getValue(); return el;
        case 'select': el = select((f.options || []).map(o => (typeof o === 'string' ? { value: o, label: o } : o)), val == null ? '' : String(val)); break;
        case 'agent': el = select(ctx.registry.map(a => ({ value: a.id, label: a.name })), val || (ctx.registry[0] && ctx.registry[0].id)); break;
        case 'account': {
          const mine = ctx.accounts.filter(a => (a.agentKeys || []).includes(cur.agentKey || (ctx.registry[0] && ctx.registry[0].id)));
          el = select([{ value: '', label: 'Its default account' }, ...mine.map(a => ({ value: a.id, label: a.label }))], val || ''); break;
        }
        case 'macro': el = select(ctx.macros.length ? ctx.macros.map(m => ({ value: m.name, label: m.name })) : [{ value: '', label: 'No macros yet — record one on the Macros page' }], val || (ctx.macros[0] && ctx.macros[0].name) || ''); break;
        case 'page': {
          const opts = [{ value: 'auto', label: 'This workflow’s automation page (hidden)' }, { value: 'default', label: 'The main window' }, ...ctx.windows.filter(w => w.value !== 'default')];
          if (val && !opts.some(o => o.value === val)) opts.push({ value: val, label: val });
          el = select(opts, val || f.default || 'auto'); break;
        }
        case 'branch': el = select(branchOpts(f.extra || []), val || f.default || 'next'); break;
        case 'system': el = select(SYSTEMS, val === 'clearglass' ? 'clear-glass' : (val || 'guardian')); break;
        case 'workflow': el = select(ctx.workflows.filter(w => !wf || w.id !== wf.id).map(w => ({ value: w.id, label: w.name })), val || ''); break;
        case 'meshvar': {
          const vars = [{ value: '', label: '— (use the value above)' }, { value: 'mesh.queueDepth', label: 'Mesh queue length' }, { value: 'mesh.agentCount', label: 'Number of agent tabs open' },
            ...ctx.view.flatMap(nd => [{ value: `${nd.id}.status`, label: `${nd.label} — status` }, { value: `${nd.id}.health`, label: `${nd.label} — health` }])];
          if (val && !vars.some(x => x.value === val)) vars.push({ value: val, label: val });
          el = select(vars, val || ''); break;
        }
        default: el = h('input', { type: 'text', placeholder: f.placeholder || '', value: val == null ? '' : typeof val === 'object' ? JSON.stringify(val) : String(val), class: /selector|url|path/i.test(f.key) ? 'mono' : null });
      }
      if (!readers[f.key]) readers[f.key] = () => { const s = el.value; if (f.type === 'json' && s.trim()) { try { return JSON.parse(s); } catch (_) { return s; } } return s === '' ? undefined : s; };
      if (el.tagName === 'SELECT') el.addEventListener('change', () => { collect(); draw(); });
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') el.addEventListener('focus', () => { lastText = el; });
      return el;
    };

    const tryOut = h('pre', { class: 'out try-out', hidden: true });
    const draw = () => {
      picker.querySelectorAll('.type-card').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.t === type)));
      form.replaceChildren();
      for (const k of Object.keys(readers)) delete readers[k];
      if (!type) { form.append(h('p', { class: 'blurb', text: 'Pick what this step does.' })); return; }
      const cat = catOf(type);
      form.append(h('p', { class: 'blurb', text: cat.help + (cat.output ? ` Output: ${cat.output}.` : '') }));
      // short fields (choices, one-liners) in a grid first, then the long ones full width
      const seen = new Set();
      const grid = h('div', { class: 'grid' });
      const long = [];
      for (const f of cat.fields) {
        if (seen.has(f.key) || !fieldApplies(f, cur, cat)) continue;
        seen.add(f.key);
        const fl = field(`${f.label || ''}${f.required ? ' *' : ''}`, input(f, cur[f.key]), f.help);
        if (['textarea', 'code', 'kv', 'json'].includes(f.type)) long.push(fl); else grid.append(fl);
      }
      form.append(grid, ...long);
      form.append(placeholderBar({ vars: (wf && wf.vars) || {} }, before, (v) => {
        const el = lastText || form.querySelector('textarea, input[type=text]');
        if (!el) return;
        const a = el.selectionStart ?? el.value.length, b = el.selectionEnd ?? el.value.length;
        el.value = el.value.slice(0, a) + v + el.value.slice(b); el.focus(); el.selectionStart = el.selectionEnd = a + v.length;
      }));
      if (['browser', 'extract', 'wait_until', 'http'].includes(type)) {
        form.append(h('div', { class: 'inline' }, btn('Try this step now', async (e) => busy(e.currentTarget, async () => {
          collect();
          const r = await wire('/automation/step', { method: 'POST', body: { step: { type, config: cur }, workflowId: wf && wf.id }, allowNotOk: true });
          tryOut.hidden = false;
          tryOut.textContent = r.ok ? `✓ ${r.note || 'done'}\n${typeof r.output === 'string' ? r.output : JSON.stringify(r.output, null, 2)}` : `✕ ${r.error}`;
        }), 'sm'), h('span', { class: 'blurb', text: 'Runs on the page for real — {{placeholders}} from earlier steps are empty here.' })), tryOut);
      }
      // per-step options
      const sa = h('input', { type: 'text', value: meta.saveAs, placeholder: 'jobs → {{vars.jobs}}' });
      const rc = h('input', { type: 'number', min: 0, max: 20, value: meta.retryCount });
      const rd = durationInput(meta.retryDelay);
      const bo = h('input', { type: 'checkbox', checked: meta.backoff });
      const tm = durationInput(meta.timeoutMs);
      const oe = select([{ value: 'fail', label: 'Fail the run' }, { value: 'continue', label: 'Carry on with the next step' }, { value: 'stop', label: 'Stop the workflow (no error)' },
        ...others.map(o => ({ value: o.id, label: `Go to step ${stepNo(workflowSteps, o.id)} — ${o.label || catOf(o.type).label}` }))], meta.onError);
      const syncMeta = () => { meta.saveAs = sa.value.trim(); meta.retryCount = parseInt(rc.value, 10) || 0; meta.retryDelay = rd.getValue(); meta.backoff = bo.checked; meta.timeoutMs = tm.getValue(); meta.onError = oe.value; };
      [sa, rc, bo, oe].forEach(x => x.addEventListener('change', syncMeta));
      rd.addEventListener('change', syncMeta); tm.addEventListener('change', syncMeta);
      const adv = h('details', { class: 'adv', open: !!(meta.saveAs || meta.retryCount || meta.timeoutMs || meta.onError !== 'fail') },
        h('summary', { text: 'Output, retries and errors' }),
        h('div', { class: 'grid' }, field('Also keep the output as variable', sa, 'Then use {{vars.<name>}}; “memory.<name>” keeps it between runs'), field('If it fails, retry', rc, 'times'),
          field('Between retries', rd), h('label', { class: 'field chk' }, bo, h('span', { text: 'Double the wait each retry' })), field('Time limit', tm, '0 = none'), field('If it still fails', oe)));
      adv.syncMeta = syncMeta;
      form.append(field('Step name', label), adv);
      form._adv = adv;
    };

    const groups = new Map();
    for (const c of CAT.catalogue) { if (!groups.has(c.group)) groups.set(c.group, []); groups.get(c.group).push(c); }
    for (const [g, list] of groups) {
      const grid = h('div', { class: 'type-grid' });
      for (const t of list) {
        const b = h('button', { type: 'button', class: 'type-card', dataset: { t: t.type } }, h('span', { class: 'ico', text: t.icon }), h('span', { class: 't', text: t.label }), h('span', { class: 'd', text: t.help }));
        b.addEventListener('click', () => { if (type !== t.type) { collect(); type = t.type; cur = {}; } draw(); });
        grid.append(b);
      }
      picker.append(h('div', { class: 'type-group' }, h('div', { class: 'kw', text: g }), grid));
    }
    if (step) picker.hidden = true;   // editing: the type is fixed — change it with "Change type"
    const changeType = step ? h('div', { class: 'inline' }, h('span', { class: 'blurb', text: `${catOf(type).icon} ${catOf(type).label}` }), btn('Change type', () => { picker.hidden = !picker.hidden; }, 'sm ghost')) : null;
    draw();
    return modal({ title: step ? 'Edit step' : 'Add a step', wide: true, body: [changeType, picker, form], actions: [{ label: step ? 'Save step' : 'Add step', primary: true, run: () => {
      if (!type) throw new Error('Pick what this step does.');
      collect();
      if (form._adv) form._adv.syncMeta();
      const cat = catOf(type);
      const cfg = {};
      const seen = new Set();
      for (const f of cat.fields) {
        if (seen.has(f.key) || !fieldApplies(f, cur, cat)) continue;
        seen.add(f.key);
        const v = cur[f.key];
        if (v !== undefined && v !== '') cfg[f.key] = v;
        else if (f.required && f.default === undefined) throw new Error(`“${f.label || f.key}” is needed.`);
        else if (f.default !== undefined && f.type !== 'bool') cfg[f.key] = f.default;
      }
      if (type === 'condition' && !cfg.left && !cfg.var) throw new Error('Say what to check — a value, or a live value.');
      if (type === 'loop' && !cfg.items && !cfg.times) throw new Error('Give it a list (For each item in) or a number of times.');
      if (type === 'command' && cfg.endpoint && !String(cfg.endpoint).startsWith('/')) throw new Error('The endpoint starts with /');
      const out = { type, config: cfg, label: label.value.trim(), saveAs: meta.saveAs || '', onError: meta.onError === 'fail' ? '' : meta.onError, timeoutMs: meta.timeoutMs || '' };
      out.retry = meta.retryCount > 0 ? { count: meta.retryCount, delayMs: meta.retryDelay || 2000, ...(meta.backoff ? { backoff: true } : {}) } : '';
      return out;
    } }] });
  }

  // ── Runs ────────────────────────────────────────────────────────────────
  const STATUS = { ok: ['✓', 'ok'], error: ['✕', 'bad'], cancelled: ['■', 'warn'], running: ['●', 'run'] };
  async function openRun(runId) {
    const r = await wire(`/automation/runs/${encodeURIComponent(runId)}`);
    const run = r.run;
    const rows = (run.steps || []).map(s => h('tr', { class: s.status }, h('td', { text: (STATUS[s.status] || ['•'])[0] }), h('td', { text: `${s.label || catOf(s.type).label}${s.item != null ? ` [${s.item}]` : ''}${s.attempt ? ` (retry ${s.attempt})` : ''}` }),
      h('td', { class: 'num', text: `${s.ms} ms` }), h('td', { class: 'mono', text: s.error ? s.error : clip(s.output, 300) })));
    await modal({ title: `Run — ${run.workflowName}`, wide: true, body: [
      h('p', { class: 'blurb', text: `${new Date(run.startedAt).toLocaleString()} · ${run.reason} · ${run.status}${run.finishedAt ? ` · ${((run.finishedAt - run.startedAt) / 1000).toFixed(1)} s` : ''}${run.error ? ` — ${run.error}` : ''}` }),
      rows.length ? h('table', { class: 'runs-steps' }, h('thead', {}, h('tr', {}, h('th', {}), h('th', { text: 'Step' }), h('th', { text: 'Time' }), h('th', { text: 'Output / error' }))), h('tbody', {}, rows)) : h('p', { class: 'blurb', text: 'No steps ran.' }),
      h('details', {}, h('summary', { text: 'Log' }), h('pre', { class: 'out', text: (run.log || []).map(l => `${new Date(l.ts).toLocaleTimeString()}  ${l.msg}`).join('\n') })),
      run.vars && Object.keys(run.vars).length ? h('details', {}, h('summary', { text: 'Variables at the end' }), h('pre', { class: 'out', text: JSON.stringify(run.vars, null, 2) })) : null,
      run.trigger && Object.keys(run.trigger).length ? h('details', {}, h('summary', { text: 'What started it' }), h('pre', { class: 'out', text: JSON.stringify(run.trigger, null, 2) })) : null,
    ], actions: [] });
  }
  function runsList(runs, rerender) {
    if (!runs.length) return h('p', { class: 'blurb', text: 'No runs yet.' });
    return h('div', { class: 'runs' }, runs.map(r => {
      const [ic, kind] = STATUS[r.status] || ['•', ''];
      return h('div', { class: `run-row ${kind}` }, h('span', { class: 'st', text: ic }),
        h('button', { class: 'link', text: `${new Date(r.startedAt).toLocaleString()} · ${r.reason}`, onclick: () => openRun(r.id).catch(e => toast(e.message, 'bad')) }),
        h('span', { class: 'dur', text: r.status === 'running' ? `running ${Math.round(r.durationMs / 1000)} s${r.current ? ` — ${r.current.label}` : ''}` : `${(r.durationMs / 1000).toFixed(1)} s` }),
        r.error ? h('span', { class: 'err', text: clip(r.error, 120) }) : null,
        r.status === 'running' ? btn('Cancel', async () => { await busy(null, () => wire(`/automation/runs/${encodeURIComponent(r.id)}/cancel`, { method: 'POST' })); toast('Cancelling…'); setTimeout(rerender, 600); }, 'sm danger') : null);
    }));
  }

  // ── Templates / new / import ────────────────────────────────────────────
  async function newWorkflow(rerender, ctx) {
    const { templates } = await wire('/automation/templates');
    let chosen = 'blank';
    const name = h('input', { type: 'text', placeholder: 'Job board watcher' });
    const list = h('div', { class: 'tpl-list', role: 'radiogroup' });
    const paint = () => list.querySelectorAll('.tpl').forEach(b => b.setAttribute('aria-checked', String(b.dataset.t === chosen)));
    const cats = [...new Set(templates.map(t => t.category || 'Other'))];
    for (const c of cats) {
      list.append(h('div', { class: 'kw', text: c }));
      for (const t of templates.filter(x => (x.category || 'Other') === c)) {
        const b = h('button', { type: 'button', role: 'radio', class: 'tpl', dataset: { t: t.id } }, h('span', { class: 't', text: t.name }), h('span', { class: 'd', text: t.help }));
        b.addEventListener('click', () => { chosen = t.id; if (!name.value.trim() || templates.some(x => x.name === name.value)) name.value = t.id === 'blank' ? '' : t.name; paint(); });
        list.append(b);
      }
    }
    const fromMacro = ctx.macros.length ? h('div', { class: 'inline' }, h('span', { class: 'blurb', text: 'Or grow a recorded macro into a workflow:' }),
      select(ctx.macros.map(m => ({ value: m.name, label: m.name })), ctx.macros[0].name, { class: 'from-macro' })) : null;
    paint();
    const r = await modal({ title: 'New workflow', wide: true, body: [field('Start from', list), field('Name', name), fromMacro], actions: [
      ...(fromMacro ? [{ label: 'From the macro', run: async () => { const m = fromMacro.querySelector('select').value; const x = await wire('/automation/from-macro', { method: 'POST', body: { name: m, workflowName: name.value.trim() || undefined } }); if (x.warnings && x.warnings.length) toast(`Steps ${x.warnings.join(', ')} need replacing (marked in the workflow)`, 'warn', 7000); return x; } }] : []),
      { label: 'Create workflow', primary: true, run: () => {
        if (!name.value.trim()) throw new Error('Name it first.');
        const t = templates.find(x => x.id === chosen);
        return wire('/automation/workflows', { method: 'POST', body: { name: name.value.trim(), description: t.id === 'blank' ? '' : t.help, status: 'paused', steps: t.steps, vars: t.vars } });
      } }] });
    if (r) { toast('Workflow created — check its steps and variables, then switch it on'); rerender(); }
  }
  async function importWorkflow(rerender) {
    const ta = h('textarea', { rows: 12, class: 'mono', placeholder: '{ "format": "nexus-workflow", "name": …, "steps": [ … ] }' });
    const file = h('input', { type: 'file', accept: '.json,application/json' });
    file.addEventListener('change', async () => { const f = file.files[0]; if (f) ta.value = await f.text(); });
    const r = await modal({ title: 'Import a workflow', wide: true, body: [field('From a file', file), field('Or paste it', ta)], actions: [{ label: 'Import', primary: true, run: () => {
      let obj; try { obj = JSON.parse(ta.value); } catch (e) { throw new Error(`That is not JSON: ${e.message}`); }
      return wire('/automation/import', { method: 'POST', body: obj });
    } }] });
    if (r) { toast('Imported (switched off)'); rerender(); }
  }
  async function exportWorkflow(w) {
    const r = await wire(`/automation/workflows/${encodeURIComponent(w.id)}/export`);
    const text = JSON.stringify(r.workflow, null, 2);
    const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: `${w.name.replace(/[^\w.-]+/g, '-')}.workflow.json` });
    document.body.append(a); a.click(); a.remove();
    copy(text);
  }
  async function settingsEditor(w) {
    const s = w.settings || {};
    const conc = select([{ value: 'skip', label: 'Skip a scheduled run while one is going (Run now always runs)' }, { value: 'queue', label: 'Queue runs one after another' }, { value: 'parallel', label: 'Run them side by side' }], s.concurrency || 'skip');
    const tl = durationInput(s.timeoutMs != null ? s.timeoutMs : 3600000);
    const ms = h('input', { type: 'number', min: 10, value: s.maxSteps || 5000 });
    const show = h('input', { type: 'checkbox', checked: !!s.showPage });
    const own = h('input', { type: 'checkbox', checked: !!(s.partition && s.partition !== 'persist:automation') });
    return modal({ title: `Settings — ${w.name}`, wide: true, body: [
      field('When a run is already going', conc), h('div', { class: 'grid' }, field('Stop a run after', tl, '0 = no limit'), field('Stop a run after this many steps', ms, 'Catches a loop that never ends')),
      h('label', { class: 'field chk' }, show, h('span', { text: 'Show the automation page while it runs (sign in there once; it stays signed in)' })),
      h('label', { class: 'field chk' }, own, h('span', { text: 'Give this workflow its own cookies (not shared with other workflows)' })),
      h('div', { class: 'inline' }, btn('Forget what it remembers', async () => { if (await confirmDo('Forget?', 'Seen items (“only new”), “changed since last run” values and memory.* variables are cleared.', 'Forget')) { await wire(`/automation/workflows/${encodeURIComponent(w.id)}`, { method: 'PATCH', body: { resetMemory: true } }); toast('Forgotten'); } }, 'sm ghost'),
        btn('Open the output folder', () => wire(`/automation/workflows/${encodeURIComponent(w.id)}/output`, { method: 'POST' }).catch(e => toast(e.message, 'bad')), 'sm ghost')),
    ], actions: [{ label: 'Save', primary: true, run: () => wire(`/automation/workflows/${encodeURIComponent(w.id)}`, { method: 'PATCH', body: { settings: {
      concurrency: conc.value, timeoutMs: tl.getValue(), maxSteps: Math.max(10, parseInt(ms.value, 10) || 5000), showPage: show.checked,
      partition: own.checked ? `persist:automation-${w.id.slice(0, 8)}` : 'persist:automation' } } }) }] });
  }
  async function varsEditor(w) {
    const ta = h('textarea', { rows: 8, class: 'mono', value: kvText(w.vars || {}), placeholder: 'searchUrl = https://…\nminScore = 7' });
    return modal({ title: `Variables — ${w.name}`, wide: true, body: [h('p', { class: 'blurb', text: 'Defaults for {{vars.<name>}}. Runs can override them (Run with values…, a webhook, another workflow). One per line: name = value.' }), ta],
      actions: [{ label: 'Save', primary: true, run: () => wire(`/automation/workflows/${encodeURIComponent(w.id)}`, { method: 'PATCH', body: { vars: kvObj(ta.value) } }) }] });
  }
  async function runWith(w) {
    const ta = h('textarea', { rows: 6, class: 'mono', value: kvText(w.vars || {}) });
    const r = await modal({ title: `Run “${w.name}” with values`, body: [h('p', { class: 'blurb', text: 'These replace the workflow’s variables for this run only.' }), ta], actions: [{ label: 'Run', primary: true, run: () => kvObj(ta.value) }] });
    return r || null;
  }
  async function pagesPane() {
    const r = await wire('/automation/pages').catch(() => ({ pages: [] }));
    if (!r.pages || !r.pages.length) return null;
    return pane({ title: 'Automation pages', sub: 'Hidden pages workflows (and agents) are driving now', body: r.pages.map(p => h('div', { class: 'row' },
      h('div', { class: 'what' }, h('div', { class: 't mono', text: p.agentId }), h('div', { class: 'd', text: p.url || '' })),
      h('div', { class: 'acts' }, btn('Show', () => wire(`/automation/pages/${encodeURIComponent(p.agentId)}/show`, { method: 'POST' }).catch(e => toast(e.message, 'bad')), 'sm'),
        btn('Close', async (e) => { await busy(e.currentTarget, () => wire(`/automation/pages/${encodeURIComponent(p.agentId)}/close`, { method: 'POST' })); e.currentTarget.closest('.row').remove(); }, 'sm ghost')))) });
  }

  // ── The page ────────────────────────────────────────────────────────────
  let poll = null;
  section({
    id: 'automation', group: 'Agents', icon: '↻', label: 'Automation',
    keywords: 'workflow trigger schedule cron webhook event step condition loop delay command tasker automate notify macro daily every browser scrape extract dom click fill form wait variable http csv',
    blurb: 'Workflows read as sentences: when something happens, do these steps. Drive web pages (open, click, fill, read, wait), loop over what you read, ask agents and use their replies, call web APIs, save CSV/JSON, get notified — on a schedule, a cron, an event, a webhook, or when you press Run.',
    related: ['macros', 'mesh'],
    async render({ tools, rerender }) {
      if (poll) { clearTimeout(poll); poll = null; }
      const [wf, m, accounts, macros, cat, windows] = await Promise.all([
        wire('/automation/workflows'), call(() => cg.mesh.list(), 'mesh'),
        cg.accounts.list().catch(() => []), cg.macros.list().then(r => (r && r.macros) || (Array.isArray(r) ? r : [])).catch(() => []),
        wire('/automation/catalogue').catch(() => null), agentOptions().catch(() => []),   // an older Clear Glass has no catalogue: the page still shows
      ]);
      CAT = cat && Array.isArray(cat.catalogue) && cat.trigger ? cat : EMPTY_CAT;
      const view = await wire('/agent-mesh/view').then(v => v.nodes || []).catch(() => []);
      const ctx = {
        registry: m.registry || [], accounts: accounts || [], macros: macros || [], view, windows, workflows: wf.workflows,
        agentName: (k) => ((m.registry || []).find(a => a.id === k) || { name: k || '?' }).name,
        accountName: (id) => ((accounts || []).find(a => a.id === id) || { label: id ? id.slice(0, 8) + '…' : '' }).label,
        wfNameOf: (id) => (wf.workflows.find(x => x.id === id || x.name === id) || { name: id || '?' }).name,
        varName: (v) => v === 'mesh.queueDepth' ? 'the mesh queue length' : v === 'mesh.agentCount' ? 'the number of agent tabs' : (() => { const [id, f] = String(v || '').split('.'); const n = view.find(x => x.id === id); return n ? `${n.label}’s ${f}` : v; })(),
      };
      tools.append(btn('Import', () => importWorkflow(rerender), 'ghost'), btn('New workflow', () => newWorkflow(rerender, ctx), 'primary'));
      const W = (id) => `/automation/workflows/${encodeURIComponent(id)}`;
      let anyRunning = false;

      const panes = await Promise.all(wf.workflows.map(async (w) => {
        const steps = w.steps || [];
        const triggers = steps.filter(s => s.type === 'trigger');
        const body = bodyOnly(steps);
        const sctx = { ...ctx, steps, wfName: w.name };
        const active = w.status === 'active';
        const [val, runs] = await Promise.all([wire(`${W(w.id)}/validate`).catch(() => ({ problems: [] })), wire(`${W(w.id)}/runs?limit=8`).catch(() => ({ runs: [] }))]);
        const running = (runs.runs || []).filter(r => r.status === 'running');
        if (running.length) anyRunning = true;

        // When
        const hook = (t) => t.config && t.config.webhook && t.config.token ? `http://127.0.0.1:${WIRE_PORT}/automation/hook/${w.id}?token=${t.config.token}` : null;
        const editTrigger = async (t) => {
          const r = await triggerEditor(t, t && hook(t));
          if (!r) return;
          await busy(null, async () => {
            if (t) await wire(`${W(w.id)}/steps/${t.id}`, { method: 'PATCH', body: { config: r.config, enabled: true } });
            else await wire(`${W(w.id)}/steps`, { method: 'POST', body: { type: 'trigger', config: r.config, index: 0 } });
          });
          rerender();
        };
        const whenCards = (triggers.length ? triggers : [null]).map(t => h('div', { class: 'when' }, h('span', { class: 'kw', text: 'When' }),
          h('span', { class: 'txt', text: triggerText(t) }),
          t && hook(t) ? btn('Copy address', () => copy(hook(t)), 'sm ghost') : null,
          t && t.config && t.config.webhook ? btn('New secret', async () => { if (await confirmDo('New webhook secret?', 'The old address stops working.', 'Change it')) { await wire(`${W(w.id)}/steps/${t.id}`, { method: 'PATCH', body: { regenerateToken: true } }); rerender(); } }, 'sm ghost') : null,
          btn('Change', () => editTrigger(t), 'sm'),
          t && triggers.length > 1 ? btn('✕', async () => { await busy(null, () => wire(`${W(w.id)}/steps/${t.id}`, { method: 'DELETE' })); rerender(); }, 'sm ghost') : null));
        const addTrigger = btn('+ Another trigger', () => editTrigger(null), 'sm ghost add-trigger');

        // Then — loop bodies indented
        const depth = new Map(); { const ends = []; body.forEach((s, i) => { while (ends.length && i > ends[ends.length - 1]) ends.pop(); depth.set(s.id, ends.length); if (s.type === 'loop') ends.push(i + (parseInt(s.config && s.config.body, 10) || 1)); }); }
        const cards = body.map((s, i) => {
          const t = catOf(s.type), off = s.enabled === false;
          const card = h('div', { class: `step-card${off ? ' off' : ''}`, style: { marginLeft: `${(depth.get(s.id) || 0) * 22}px` } },
            h('span', { class: 'n', text: String(i + 1) }), h('span', { class: 'ico', 'aria-hidden': 'true', text: t.icon }),
            h('div', { class: 'what' }, h('div', { class: 't', text: s.label || t.label }), h('div', { class: 'd', text: stepText(s, sctx) }), h('div', { class: 'badges' }, badges(s, steps))),
            h('div', { class: 'acts' },
              toggle(!off, async (on) => { await call(() => wire(`${W(w.id)}/steps/${s.id}`, { method: 'PATCH', body: { enabled: on } }), 'switch step'); rerender(); }, `Step ${i + 1} on`),
              h('button', { class: 'btn sm ghost', 'aria-label': 'Move up', text: '↑', onclick: () => busy(null, async () => { await wire(`${W(w.id)}/steps/${s.id}/move`, { method: 'POST', body: { dir: 'up' } }); rerender(); }) }),
              h('button', { class: 'btn sm ghost', 'aria-label': 'Move down', text: '↓', onclick: () => busy(null, async () => { await wire(`${W(w.id)}/steps/${s.id}/move`, { method: 'POST', body: { dir: 'down' } }); rerender(); }) }),
              btn('Edit', async () => { const st = await stepEditor(ctx, s, steps, w); if (st) { await busy(null, () => wire(`${W(w.id)}/steps/${s.id}`, { method: 'PATCH', body: st })); rerender(); } }, 'sm'),
              h('button', { class: 'btn sm ghost', title: 'Duplicate', 'aria-label': 'Duplicate step', text: '⧉', onclick: () => busy(null, async () => { await wire(`${W(w.id)}/steps`, { method: 'POST', body: { type: s.type, config: s.config, label: s.label ? `${s.label} copy` : '', saveAs: s.saveAs, retry: s.retry, onError: s.onError, timeoutMs: s.timeoutMs, index: steps.indexOf(s) + 1 } }); rerender(); }) }),
              btn('✕', async () => { if (await confirmDo('Remove this step?', stepText(s, sctx), 'Remove')) { await busy(null, () => wire(`${W(w.id)}/steps/${s.id}`, { method: 'DELETE' })); rerender(); } }, 'sm ghost')));
          return card;
        });
        const addStep = btn('+ Add a step', async () => {
          const st = await stepEditor(ctx, null, steps, w);
          if (st) { await busy(null, () => wire(`${W(w.id)}/steps`, { method: 'POST', body: st })); rerender(); }
        }, 'sm add-step');

        const varsLine = h('div', { class: 'vars' }, h('span', { class: 'kw', text: 'Variables' }),
          Object.keys(w.vars || {}).length ? Object.entries(w.vars).map(([k, v]) => chip(`${k} = ${clip(v, 40)}`)) : h('span', { class: 'blurb', text: 'none' }),
          btn('Edit', async () => { if (await varsEditor(w)) rerender(); }, 'sm ghost'));
        const problems = (val.problems || []).length ? h('div', { class: 'err-box' }, h('b', { text: 'Needs attention: ' }), val.problems.map(p => p.problem).join(' · ')) : null;

        const history = h('details', { class: 'history', open: running.length > 0 }, h('summary', { text: `Runs${w.lastStatus ? ` — last ${w.lastStatus === 'ok' ? 'worked' : w.lastStatus === 'error' ? 'failed' : w.lastStatus}` : ''}` }),
          runsList(runs.runs || [], rerender), h('div', { class: 'inline' }, btn('Output folder', () => wire(`${W(w.id)}/output`, { method: 'POST' }).catch(e => toast(e.message, 'bad')), 'sm ghost')));

        const next = active ? whenNext(w.nextRunAt) : null;
        const sub = [running.length ? `running (${running.length})` : null, active ? (next ? `next run ${next}` : 'on') : 'off', `${w.runCount || 0} run${w.runCount === 1 ? '' : 's'}`, w.lastRun ? `last ${ago(w.lastRun)}` : null,
          w.lastStatus === 'error' ? `failed: ${clip(w.lastError, 60)}` : null].filter(Boolean).join(' · ');
        const more = btn('⋯', async () => {
          const nm = h('input', { type: 'text', value: w.name });
          const ds = h('textarea', { rows: 2, value: w.description || '', placeholder: 'What this workflow is for' });
          const r = await modal({ title: 'Workflow', body: [field('Name', nm), field('Description', ds)], actions: [
            { label: 'Run with values…', run: () => 'runwith' },
            { label: 'Settings…', run: () => 'settings' },
            { label: 'Export', run: () => exportWorkflow(w).then(() => 'exported') },
            { label: 'Duplicate', run: () => wire('/automation/workflows', { method: 'POST', body: { name: `${w.name} (copy)`, description: w.description || '', status: 'paused', steps, vars: w.vars, settings: w.settings } }).then(() => 'dup') },
            { label: 'Delete', danger: true, run: async () => { if (!await confirmDo(`Delete “${w.name}”?`, 'The workflow, its steps and its run history are removed. Files it saved stay.', 'Delete')) return false; await wire(W(w.id), { method: 'DELETE' }); return 'deleted'; } },
            { label: 'Save', primary: true, run: () => { if (!nm.value.trim()) throw new Error('Give it a name.'); return wire(W(w.id), { method: 'PATCH', body: { name: nm.value.trim(), description: ds.value.trim() } }); } }] });
          if (r === 'runwith') { const vars = await runWith(w); if (vars) { await wire(`${W(w.id)}/start`, { method: 'POST', body: { vars } }); toast(`Started “${w.name}”`); setTimeout(rerender, 400); } return; }
          if (r === 'settings') { if (await settingsEditor(w)) { toast('Saved'); rerender(); } return; }
          if (r === 'exported') { toast('Exported — saved as a file and copied'); return; }
          if (r) { toast(r === 'dup' ? 'Duplicated (switched off)' : r === 'deleted' ? 'Workflow deleted' : 'Saved'); rerender(); }
        }, 'sm ghost');
        more.setAttribute('aria-label', `More for ${w.name}`);

        return pane({ title: w.name, sub, cls: `wf${active ? ' on' : ''}${running.length ? ' running' : ''}`,
          tools: h('div', { class: 'wf-tools' },
            h('label', { class: 'onoff' }, toggle(active, async (on) => { await call(() => wire(W(w.id), { method: 'PATCH', body: { status: on ? 'active' : 'paused' } }), 'switch workflow'); toast(on ? `“${w.name}” is on` : `“${w.name}” is off`); rerender(); }, `${w.name} on`), h('span', { text: active ? 'On' : 'Off' })),
            running.length ? btn('Stop', (e) => busy(e.currentTarget, async () => { await wire(`${W(w.id)}/cancel`, { method: 'POST' }); toast('Stopping…'); setTimeout(rerender, 600); }), 'sm danger') : null,
            btn('Run now', (e) => busy(e.currentTarget, async () => { await wire(`${W(w.id)}/start`, { method: 'POST', body: {} }); toast(`Started “${w.name}”`); setTimeout(rerender, 400); }), 'sm primary'), more),
          body: [w.description ? h('p', { class: 'blurb desc', text: w.description }) : null, problems, whenCards, addTrigger, varsLine,
            h('div', { class: 'then' }, h('span', { class: 'kw', text: 'Then' }), cards.length ? cards : h('p', { class: 'blurb', text: 'No steps yet.' }), addStep), history] });
      }));

      if (anyRunning) { poll = setTimeout(rerender, 2500); onLeave(() => { clearTimeout(poll); poll = null; }); }   // live status while something runs
      const log = await wire('/automation/log').catch(e => ({ log: [], error: e.message }));
      const entries = (log.log || []).slice(0, 60); // engine keeps newest first
      const pages = await pagesPane();
      return [
        ...(panes.length ? panes : [pane({ title: 'No workflows yet', body: [h('p', { class: 'blurb', text: 'A workflow runs steps for you — watch a job board and send you the good ones, check a price every hour, fill a form from a webhook, ask an agent every morning. Start from a template.' }), h('div', { style: { marginTop: '10px' } }, btn('Create your first workflow', () => newWorkflow(rerender, ctx), 'primary'))] })]),
        pages,
        pane({ title: 'Recent activity', sub: 'All workflows, newest first — open a workflow’s Runs for step-by-step detail', body: log.error ? h('div', { class: 'err-box', text: log.error }) : entries.length ? h('pre', { class: 'out', text: entries.map(e => `${new Date(e.ts).toLocaleString()}  ${e.workflowName || e.workflowId}: ${e.msg}`).join('\n') }) : h('p', { class: 'blurb', text: 'Nothing has run yet.' }) }),
      ].filter(Boolean);
    },
  });
})();
