'use strict';
/**
 * renderer/settings/sections/automation.js — Automation  (styles: automation.css)
 *
 * v0.39.227 — split out of sections/mesh.js (James: "each UI area its own file, including its own CSS file"). Notes below are that file's, kept for provenance.
 */
/**
 * renderer/settings/sections/mesh.js — Agent mesh + Automation
 * §BUILT 2026-09-23. Mesh: IPC mesh:list (registry, live agents with their
 * accountId/health/constraints, queue depth) plus the wire's real
 * /agent-mesh/spawn, /agent-mesh/route and /agent-mesh/routes. Automation:
 * the wire's /automation/workflows CRUD + per-step editor over
 * src/mesh/automation-engine.js's five real step types (trigger, agent,
 * delay, condition, command) — the same backend BrainOS's Automation tab
 * uses, not a second engine (§10.3).
 */
(function () {
  const { cg, h, call, wire, toast, busy, modal, confirmDo, field, pane, row, btn, chip, empty, ago, select, section } = window.CGS;

  // ── Automation ─────────────────────────────────────────────────────────
  const STEP_TYPES = ['trigger', 'agent', 'delay', 'condition', 'command'];
  const SYSTEMS = ['guardian', 'ollama', 'copilot', 'clear-glass'];
  function stepSummary(s) {
    const c = s.config || {};
    switch (s.type) {
      case 'trigger':   return c.intervalMs ? `every ${Math.round(c.intervalMs / 1000)}s` : 'manual';
      case 'agent':     return `${c.agentKey || '?'}: ${(c.prompt || '').slice(0, 60)}`;
      case 'delay':     return `${c.ms || 1000} ms`;
      case 'condition': return `if ${c.var} ${c.op} ${c.value} \u2192 ${c.onTrue || 'next'} / ${c.onFalse || 'next'}`;
      case 'command':   return `${(c.method || 'GET').toUpperCase()} ${c.system}${c.endpoint || '/health'}`;
      default:          return JSON.stringify(c);
    }
  }
  async function stepEditor(registry, step) {
    const c = (step && step.config) || {};
    const type = select(STEP_TYPES, step ? step.type : 'agent');
    const box = h('div', { class: 'grid' });
    const inputs = {};
    const I = (k, el) => (inputs[k] = el);
    const draw = () => {
      box.replaceChildren();
      const t = type.value;
      if (t === 'trigger') box.append(field('Run every (seconds, blank = manual only)', I('interval', h('input', { type: 'number', min: 0, value: c.intervalMs ? c.intervalMs / 1000 : '' }))));
      if (t === 'agent') box.append(field('Agent', I('agentKey', select(registry.map(a => ({ value: a.id, label: a.name })), c.agentKey))), field('Prompt', I('prompt', h('textarea', { rows: 3, value: c.prompt || '' }))));
      if (t === 'delay') box.append(field('Wait (ms, max 300000)', I('ms', h('input', { type: 'number', min: 0, max: 300000, value: c.ms || 1000 }))));
      if (t === 'condition') box.append(field('Mesh value', I('var', h('input', { type: 'text', value: c.var || '', placeholder: 'e.g. queueDepth' }))),
        field('Is', I('op', select(['==', '!=', '>', '<', '>=', '<='], c.op || '=='))), field('Value', I('value', h('input', { type: 'text', value: c.value ?? '' }))),
        field('If true, go to step id', I('onTrue', h('input', { type: 'text', value: c.onTrue || '', placeholder: 'next' }))), field('If false, go to step id', I('onFalse', h('input', { type: 'text', value: c.onFalse || '', placeholder: 'next' }))));
      if (t === 'command') box.append(field('System', I('system', select(SYSTEMS, c.system || 'guardian'))), field('Method', I('method', select(['GET', 'POST'], (c.method || 'GET').toUpperCase()))),
        field('Endpoint', I('endpoint', h('input', { type: 'text', value: c.endpoint || '/health' }))), field('Body (JSON, POST only)', I('body', h('textarea', { rows: 2, value: c.body || '' }))));
    };
    type.addEventListener('change', draw); draw();
    return modal({ title: step ? 'Edit step' : 'Add step', body: [field('Step type', type), box], actions: [{ label: step ? 'Save step' : 'Add step', primary: true, run: () => {
      const v = (k) => inputs[k] && inputs[k].value;
      const t = type.value, cfg = {};
      if (t === 'trigger' && v('interval')) cfg.intervalMs = Math.round(parseFloat(v('interval')) * 1000);
      if (t === 'agent') { cfg.agentKey = v('agentKey'); cfg.prompt = v('prompt'); if (!cfg.prompt.trim()) throw new Error('An agent step needs a prompt.'); }
      if (t === 'delay') cfg.ms = parseInt(v('ms'), 10) || 1000;
      if (t === 'condition') { Object.assign(cfg, { var: v('var'), op: v('op'), value: v('value'), onTrue: v('onTrue') || undefined, onFalse: v('onFalse') || undefined }); if (!cfg.var) throw new Error('Pick the mesh value to compare.'); }
      if (t === 'command') { Object.assign(cfg, { system: v('system'), method: v('method'), endpoint: v('endpoint') || '/health' }); if (v('body').trim()) { JSON.parse(v('body')); cfg.body = v('body'); } }
      return { type: t, config: cfg };
    } }] });
  }

  section({
    id: 'automation', group: 'Agents', icon: '\u21BB', label: 'Automation',
    keywords: 'workflow trigger schedule step condition delay command tasker',
    blurb: 'Workflows that run agent prompts, waits, checks and NEXUS calls on a schedule or on demand.',
    async render({ tools, rerender }) {
      const [wf, m] = await Promise.all([wire('/automation/workflows'), call(() => cg.mesh.list(), 'mesh')]);
      tools.append(btn('New workflow', async () => {
        const name = h('input', { type: 'text', placeholder: 'Morning digest' });
        const r = await modal({ title: 'New workflow', body: [field('Name', name)], actions: [{ label: 'Create workflow', primary: true, run: () => {
          if (!name.value.trim()) throw new Error('Name it first.');
          return wire('/automation/workflows', { method: 'POST', body: { name: name.value.trim(), status: 'paused', steps: [] } });
        } }] });
        // Steps get their ids from the engine's own addStep(), never minted here.
        if (r && r.workflow) await wire(`/automation/workflows/${r.workflow.id}/steps`, { method: 'POST', body: { type: 'trigger', config: {} } }).catch(e => toast(`Workflow created, trigger step not added: ${e.message}`, 'warn'));
        if (r) { toast('Workflow created — add steps, then set it active'); rerender(); }
      }, 'primary'));

      const panes = wf.workflows.map(w => {
        const steps = (w.steps || []).map((s, i) => h('div', { class: 'step' },
          h('span', { class: 'n', text: String(i + 1) }), chip(s.type, 'plain'),
          h('span', { style: { gridColumn: 'span 2' }, class: 'blurb', text: stepSummary(s) }),
          h('div', { class: 'acts', style: { display: 'flex', gap: '4px' } },
            btn('\u2191', () => busy(null, async () => { await wire(`/automation/workflows/${w.id}/steps/${s.id}/move`, { method: 'POST', body: { dir: 'up' } }); rerender(); }), 'sm ghost'),
            btn('\u2193', () => busy(null, async () => { await wire(`/automation/workflows/${w.id}/steps/${s.id}/move`, { method: 'POST', body: { dir: 'down' } }); rerender(); }), 'sm ghost'),
            btn('Edit', async () => { const st = await stepEditor(m.registry, s); if (st) { await busy(null, () => wire(`/automation/workflows/${w.id}/steps/${s.id}`, { method: 'PATCH', body: st })); rerender(); } }, 'sm'),
            btn('\u2715', () => busy(null, async () => { await wire(`/automation/workflows/${w.id}/steps/${s.id}`, { method: 'DELETE' }); rerender(); }), 'sm ghost'))));
        const active = w.status === 'active';
        return pane({ title: w.name, sub: `${(w.steps || []).length} steps \u00B7 ${w.runCount || 0} runs \u00B7 last ${ago(w.lastRun)}`,
          tools: h('div', { style: { display: 'flex', gap: '6px' } },
            chip(w.status || 'paused', active ? 'ok' : 'plain'),
            btn(active ? 'Pause' : 'Set active', () => busy(null, async () => { await wire(`/automation/workflows/${w.id}`, { method: 'PATCH', body: { status: active ? 'paused' : 'active' } }); rerender(); }), 'sm'),
            btn('Run now', (e) => busy(e.currentTarget, async () => { await wire(`/automation/workflows/${w.id}/run`, { method: 'POST' }); toast(`Ran “${w.name}”`); rerender(); }), 'sm primary'),
            btn('Delete', async () => { if (await confirmDo(`Delete “${w.name}”?`, 'The workflow and its steps are removed.', 'Delete')) { await busy(null, () => wire(`/automation/workflows/${w.id}`, { method: 'DELETE' })); rerender(); } }, 'sm danger')),
          body: [h('div', { class: 'steps' }, steps), h('div', { style: { marginTop: '10px' } }, btn('Add step', async () => {
            const st = await stepEditor(m.registry, null);
            if (st) { await busy(null, () => wire(`/automation/workflows/${w.id}/steps`, { method: 'POST', body: st })); rerender(); }
          }, 'sm'))] });
      });

      const log = await wire('/automation/log').catch(e => ({ log: [], error: e.message }));
      const entries = (log.log || []).slice(0, 40); // engine keeps newest first
      return [
        ...(panes.length ? panes : [pane({ title: 'No workflows yet', body: h('p', { class: 'blurb', text: 'Create one to schedule agent prompts, waits, checks and NEXUS calls.' }) })]),
        pane({ title: 'Recent runs', body: log.error ? h('div', { class: 'err-box', text: log.error }) : entries.length ? h('pre', { class: 'out', text: entries.map(e => `${new Date(e.ts).toLocaleString()}  ${e.status || ''}  ${e.workflowName || e.workflowId}: ${e.msg}`).join('\n') }) : h('p', { class: 'blurb', text: 'Nothing has run yet.' }) }),
      ];
    },
  });
})();
