'use strict';
/**
 * renderer/settings/sections/mesh.js — Agent mesh  (styles: mesh.css)
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

  // Each wire-backed pane fails on its own, loudly, instead of taking the page down.
  async function wirePane(title, build) {
    try { return await build(); }
    catch (e) { return pane({ title, body: h('div', { class: 'err-box' }, h('span', { text: e.message })) }); }
  }

  section({
    id: 'mesh', group: 'Agents', icon: '\u2B21', label: 'Agent mesh',
    keywords: 'mesh spawn route pipeline feedback queue health constraints raid',
    blurb: 'The agents Clear Glass can drive in their own background tabs, what\u2019s running now, and the routes that pass one agent\u2019s answer to another.',
    async render({ rerender }) {
      const m = await call(() => cg.mesh.list(), 'mesh');
      const [accounts, defaults] = await Promise.all([cg.accounts.list().catch(() => []), cg.accounts.defaults().catch(() => ({}))]);
      const label = (id) => { const a = accounts.find(x => x.id === id); return a ? a.label : (id ? id.slice(0, 8) + '…' : 'default'); };

      const registry = pane({ title: 'Agents', sub: `${m.registry.length} available \u00B7 ${m.queueDepth} queued`, flush: true, body: m.registry.map(a => {
        const r = row(a.name, a.url, chip(defaults[a.id] ? `default: ${label(defaults[a.id])}` : 'no default account', defaults[a.id] ? 'ok' : 'plain'),
          btn('Open tab', (e) => busy(e.currentTarget, async () => { const r = await wire('/agent-mesh/spawn', { method: 'POST', body: { agentKey: a.id } }); toast(`${a.name} tab ready (${r.contextId})`); rerender(); }), 'sm'));
        r.style.setProperty('--prov', a.color || 'var(--cyan)'); r.prepend(h('span', { class: 'dot' })); return r;
      }) });

      const live = pane({ title: 'Running now', flush: true, body: m.agents.length ? m.agents.map(s => row(
        `${s.key} \u00B7 ${label(s.accountId)}`, `${s.contextId} \u00B7 ${s.taskCount} tasks \u00B7 last used ${ago(s.lastUsed)}${s.constraints ? ` \u00B7 ${JSON.stringify(s.constraints)}` : ''}`,
        chip(s.status, s.status === 'error' ? 'bad' : s.status === 'working' ? 'warn' : 'ok'), chip(`health ${s.health}`, s.health > 60 ? 'ok' : 'warn'))) : empty('No mesh agents running. Open a tab above or dispatch through Guardian.') });

      const promptIn = h('textarea', { rows: 3, placeholder: 'Ask the mesh something \u2014 it routes to the healthiest agent' });
      const prefer = select([{ value: '', label: 'Any agent' }, ...m.registry.map(a => ({ value: a.id, label: a.name }))], '');
      const outBox = h('pre', { class: 'out', hidden: true });
      const tryIt = pane({ title: 'Try a dispatch', body: [
        field('Prompt', promptIn), h('div', { class: 'grid', style: { marginTop: '10px' } }, field('Prefer', prefer)),
        h('div', { style: { marginTop: '10px' } }, btn('Send through the mesh', (e) => busy(e.currentTarget, async () => {
          if (!promptIn.value.trim()) throw new Error('Write a prompt first.');
          const r = await wire('/agent-mesh/route', { method: 'POST', body: { prompt: promptIn.value, preferAgent: prefer.value || undefined } });
          outBox.hidden = false; outBox.textContent = JSON.stringify(r, null, 2);
        }), 'primary')), outBox] });

      const routes = await wirePane('Routes', async () => {
        const r = await wire('/agent-mesh/routes');
        const names = Object.fromEntries(m.registry.map(a => [a.id, a.name]));
        const add = btn('Add route', async () => {
          const opts = m.registry.map(a => ({ value: a.id, label: a.name }));
          const from = select(opts), to = select(opts), sys = h('textarea', { rows: 2, placeholder: 'Optional: instructions for the receiving agent' });
          const ok = await modal({ title: 'New route', body: [h('div', { class: 'grid' }, field('When this agent answers', from), field('Send the answer to', to)), field('System prompt', sys)],
            actions: [{ label: 'Add route', primary: true, run: () => wire('/agent-mesh/routes', { method: 'POST', body: { from: from.value, to: to.value, systemPrompt: sys.value.trim() || undefined } }) }] });
          if (ok) { toast('Route added'); rerender(); }
        }, 'sm');
        return pane({ title: 'Routes', sub: 'Same agent on both ends makes a feedback loop.', tools: add, flush: true,
          body: r.routes.length ? r.routes.map(rt => row(`${names[rt.from] || rt.from} \u2192 ${names[rt.to] || rt.to}`, rt.systemPrompt || 'passes the answer through unchanged', chip(rt.kind, 'plain'),
            btn('Delete', async () => { if (await confirmDo('Delete route?', `${rt.from} will stop passing answers to ${rt.to}.`, 'Delete')) { await busy(null, () => wire(`/agent-mesh/routes/${rt.id}`, { method: 'DELETE' })); rerender(); } }, 'sm danger')))
            : empty('No routes. Add one to chain agents into a pipeline.') });
      });
      return [registry, live, tryIt, routes];
    },
  });
})();
