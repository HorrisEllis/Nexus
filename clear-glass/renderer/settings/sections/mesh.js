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
  const { cg, h, call, wire, toast, busy, modal, confirmDo, field, pane, row, btn, chip, empty, ago, select, toggle, onLeave, section } = window.CGS;

  // §EXPANDED 2026-09-26 — James: "expand … agent mesh." Every pane below is a
  // real wire route in src/main/index.js: /agent-mesh/view (network nodes),
  // /agent-mesh/intake + /job (guardian's jobs through the mesh), /diagnose
  // (DOM selectors per provider), routes with kind + {{output}} transform,
  // and a live refresh while this page is open.
  let LIVE = false;

  // Each wire-backed pane fails on its own, loudly, instead of taking the page down.
  async function wirePane(title, build) {
    try { return await build(); }
    catch (e) { return pane({ title, body: h('div', { class: 'err-box' }, h('span', { text: e.message })) }); }
  }

  section({
    id: 'mesh', group: 'Agents', icon: '\u2B21', label: 'Agent mesh',
    keywords: 'mesh spawn route pipeline feedback queue health constraints raid jobs intake nodes diagnose transform',
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

      const diagnose = (provider, agentId) => async (e) => busy(e.currentTarget, async () => {
        const r = await wire('/agent-mesh/diagnose', { method: 'POST', body: { provider, agentId }, allowNotOk: true });
        modal({ title: `DOM check \u2014 ${provider}`, wide: true, body: [
          h('p', { class: 'blurb', text: r.ok === false ? `Problem: ${r.error || 'see below'}` : r.repaired ? 'Selectors were stale and have been repaired.' : 'The page\u2019s input, send button and reply area were found.' }),
          h('pre', { class: 'out', text: JSON.stringify(r, null, 2) })] });
      });
      const constraintText = (c) => !c ? '' : Object.entries(c).map(([k, v]) => `${k.replace(/([A-Z])/g, ' $1').toLowerCase()} ${typeof v === 'number' ? v.toLocaleString() : v}`).join(', ');
      const live = pane({ title: 'Running now', sub: `${m.agents.length} agent tab${m.agents.length === 1 ? '' : 's'}`, tools: h('label', { class: 'live-tog' }, toggle(LIVE, (on) => { LIVE = on; rerender(); }, 'Live refresh'), h('span', { text: 'Live' })), flush: true, body: m.agents.length ? m.agents.map(s => {
        const r = row(
          `${s.key} \u00B7 ${label(s.accountId)}`, `${s.contextId} \u00B7 ${s.taskCount} task${s.taskCount === 1 ? '' : 's'} \u00B7 last used ${ago(s.lastUsed)}${s.constraints ? ` \u00B7 ${constraintText(s.constraints)}` : ''}`,
          chip(s.status, s.status === 'error' ? 'bad' : s.status === 'working' ? 'warn' : 'ok'),
          h('span', { class: 'health', title: `health ${s.health}` }, h('span', { style: { width: `${Math.max(0, Math.min(100, s.health))}%`, background: s.health > 60 ? 'var(--ok)' : s.health > 30 ? 'var(--warn)' : 'var(--bad)' } })),
          btn('Check page', diagnose(s.key, s.contextId), 'sm'));
        return r;
      }) : empty('No mesh agents running. Open a tab above or dispatch through Guardian.') });
      if (LIVE) { const t = setTimeout(() => rerender(), 5000); onLeave(() => clearTimeout(t)); }

      const promptIn = h('textarea', { rows: 3, placeholder: 'Ask the mesh something \u2014 it routes to the healthiest agent' });
      const prefer = select([{ value: '', label: 'Any agent' }, ...m.registry.map(a => ({ value: a.id, label: a.name }))], '');
      const outBox = h('pre', { class: 'out' });
      const raw = h('details', { class: 'raw', hidden: true }, h('summary', { text: 'Raw reply' }), outBox);
      const answer = h('div', { class: 'answer', hidden: true });
      const fallback = h('input', { type: 'text', placeholder: 'claude, chatgpt (optional order if the first fails)' });
      const tryIt = pane({ title: 'Try a dispatch', body: [
        field('Prompt', promptIn), h('div', { class: 'grid', style: { marginTop: '10px' } }, field('Prefer', prefer), field('Then try', fallback)),
        h('div', { style: { marginTop: '10px' } }, btn('Send through the mesh', (e) => busy(e.currentTarget, async () => {
          if (!promptIn.value.trim()) throw new Error('Write a prompt first.');
          const t0 = Date.now();
          const r = await wire('/agent-mesh/route', { method: 'POST', body: { prompt: promptIn.value, preferAgent: prefer.value || undefined, fallbackOrder: fallback.value.split(',').map(x => x.trim()).filter(Boolean) } });
          const text = r.text || r.response || r.result?.text || '';
          answer.hidden = false;
          answer.replaceChildren(h('div', { class: 'ans-meta', text: [r.agentKey || r.agent || r.provider, r.contextId, `${((Date.now() - t0) / 1000).toFixed(1)}s`].filter(Boolean).join(' \u00B7 ') }),
            h('div', { class: 'ans-text', text: text || '(no text in the reply — see raw)' }));
          outBox.textContent = JSON.stringify(r, null, 2); raw.hidden = false;
        }), 'primary')), answer, raw] });

      const routes = await wirePane('Routes', async () => {
        const r = await wire('/agent-mesh/routes');
        const names = Object.fromEntries(m.registry.map(a => [a.id, a.name]));
        const add = btn('Add route', async () => {
          const opts = m.registry.map(a => ({ value: a.id, label: a.name }));
          const from = select(opts), to = select(opts), sys = h('textarea', { rows: 2, placeholder: 'Optional: instructions for the receiving agent' });
          const tf = h('input', { type: 'text', class: 'mono', placeholder: 'Review this critically: {{output}}' });
          const note = h('p', { class: 'blurb' });
          const paint = () => { note.textContent = from.value === to.value ? 'Same agent on both ends: a feedback loop \u2014 the agent reviews its own answer.' : 'A pipeline step: the second agent receives the first one\u2019s answer.'; };
          from.addEventListener('change', paint); to.addEventListener('change', paint); paint();
          const ok = await modal({ title: 'New route', body: [h('div', { class: 'grid' }, field('When this agent answers', from), field('Send the answer to', to)), note,
            field('System prompt', sys), field('Transform', tf, '{{output}} is replaced by the answer. Plain text \u2014 never run as code.')],
            actions: [{ label: 'Add route', primary: true, run: () => {
              if (tf.value.trim() && !tf.value.includes('{{output}}')) throw new Error('A transform needs {{output}} somewhere in it.');
              return wire('/agent-mesh/routes', { method: 'POST', body: { from: from.value, to: to.value, systemPrompt: sys.value.trim() || undefined, transform: tf.value.trim() || undefined } });
            } }] });
          if (ok) { toast('Route added'); rerender(); }
        }, 'sm');
        // chains: follow pipeline edges from each start node (no incoming edge)
        const outs = {}; const ins = new Set();
        r.routes.filter(x => x.kind !== 'feedback').forEach(x => { (outs[x.from] = outs[x.from] || []).push(x.to); ins.add(x.to); });
        const chains = Object.keys(outs).filter(k => !ins.has(k)).map(start => {
          const seen = new Set([start]); const path = [start]; let cur = start;
          while (outs[cur] && outs[cur].length && !seen.has(outs[cur][0])) { cur = outs[cur][0]; seen.add(cur); path.push(cur); }
          return path.map(k => names[k] || k).join(' \u2192 ');
        });
        return pane({ title: 'Routes', sub: chains.length ? `Pipelines: ${chains.join('  |  ')}` : 'Same agent on both ends makes a feedback loop.', tools: add, flush: true,
          body: r.routes.length ? r.routes.map(rt => row(`${names[rt.from] || rt.from} \u2192 ${names[rt.to] || rt.to}`, [rt.systemPrompt, rt.transform ? `transform: ${rt.transform}` : null].filter(Boolean).join(' \u00B7 ') || 'passes the answer through unchanged', chip(rt.kind, 'plain'),
            btn('Delete', async () => { if (await confirmDo('Delete route?', `${rt.from} will stop passing answers to ${rt.to}.`, 'Delete')) { await busy(null, () => wire(`/agent-mesh/routes/${rt.id}`, { method: 'DELETE' })); rerender(); } }, 'sm danger')))
            : empty('No routes. Add one to chain agents into a pipeline.') });
      });
      const nodes = await wirePane('Network nodes', async () => {
        const v = await wire('/agent-mesh/view');
        const ns = (v.nodes || []).filter(n => n.kind === 'node');
        return pane({ title: 'Network nodes', sub: 'NEXUS services this browser can see pulsing', flush: true, body: ns.length ? ns.map(n => row(n.label, n.id,
          chip(n.status, n.status === 'alive' ? 'ok' : n.status === 'idle' ? 'warn' : 'bad'))) : empty('No network nodes reported yet.') });
      });
      const jobs = await wirePane('Jobs', async () => {
        const j = await wire('/agent-mesh/intake', { allowNotOk: true });
        if (j.ok === false) return pane({ title: 'Jobs', body: h('p', { class: 'blurb', text: j.error || 'Job intake not ready' }) });
        const list = (j.jobs || []).slice(0, 25);
        return pane({ title: 'Jobs', sub: `Guardian jobs sent through the mesh \u00B7 ${j.dir || ''}`, flush: true, body: list.length ? list.map(x => row(
          `${x.provider || x.agentKey || 'job'} \u00B7 ${String(x.jobId || '').slice(0, 12)}`, `${ago(x.acceptedAt)}${x.error ? ` \u00B7 ${x.error}` : ''}`,
          chip(x.status || '?', x.status === 'done' ? 'ok' : x.status === 'error' ? 'bad' : 'warn'),
          btn('Status', async (e) => busy(e.currentTarget, async () => { const st = await wire(`/agent-mesh/job?jobId=${encodeURIComponent(x.jobId)}`); modal({ title: `Job ${x.jobId}`, wide: true, body: [h('pre', { class: 'out', text: JSON.stringify(st, null, 2) })] }); }), 'sm'))) : empty('No jobs yet.') });
      });
      return [registry, live, tryIt, routes, jobs, nodes];
    },
  });
})();
