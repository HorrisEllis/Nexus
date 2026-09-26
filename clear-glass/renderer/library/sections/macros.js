'use strict';
/**
 * renderer/library/sections/macros.js — Library → Macros  (styles: macros.css)
 * Ported 0.39.241 from ui/library/library-app.js (TABS.macros + runMacro): list
 * and run (GET /cli/macros, POST /cli/macros/:name/run). A macro acts on a live
 * agent tab and this window has none of its own, so the target is picked from
 * the windows open right now (CGS.agentOptions — fresh on every open). Building
 * and editing macros stays in Settings → Macros.
 */
(function () {
  const { cg, h, call, modal, field, pane, row, btn, chip, empty, fail, toast, agentOptions, select, ago, section } = window.CGS;
  const { api, matches } = window.CGL;

  async function run(m, rerender) {
    const opts = await agentOptions();
    if (!opts.length) return toast('No agent windows are open — open one first.', 'warn', 5000);
    const target = select(opts, opts[0].value);
    const inputs = (m.params || []).map(p => ({ p, el: h('input', { type: 'text' }) }));
    const res = await modal({
      title: `Run “${m.name}”`,
      body: [field('Run against', target), ...inputs.map(i => field(i.p, i.el))],
      actions: [{ label: 'Run', primary: true, run: async () => {
        const r = await api(`/cli/macros/${encodeURIComponent(m.name)}/run`, { method: 'POST', body: { agentId: target.value, params: Object.fromEntries(inputs.map(i => [i.p, i.el.value])) } }).catch(e => ({ ok: false, error: e.message }));
        if (!r.ok) throw new Error(`${r.error || 'failed'}${r.failedAtStep !== undefined ? ` (step ${r.failedAtStep})` : ''}`);
        return r;
      } }],
    });
    if (res) { toast(`“${m.name}” completed — ${res.results ? res.results.length : 0} step(s)`); rerender(); }
  }

  section({
    id: 'macros', group: 'Agents', icon: '⌘', label: 'Macros',
    blurb: 'Run a saved macro against an open agent window. Build and edit macros in Settings → Macros.',
    async render({ tools, rerender, query }) {
      tools.append(btn('Open Settings', () => call(() => cg.window.openSettings(), 'open settings').catch(fail), 'sm ghost'));
      const r = await api('/cli/macros');
      const all = r.macros || [];
      const list = all.filter(m => matches(query, m.name, m.urlPattern));
      if (!all.length) return pane({ flush: true, body: empty('No macros yet. Build one in Settings → Macros.') });
      return pane({
        title: query ? `${list.length} of ${all.length}` : `${all.length} macro${all.length === 1 ? '' : 's'}`, flush: true,
        body: list.length ? list.map(m => row(m.name,
          [m.urlPattern, `${m.steps} step${m.steps === 1 ? '' : 's'}`, `${m.runCount || 0} run${m.runCount === 1 ? '' : 's'}`, m.lastRunAt ? `last ${ago(m.lastRunAt)}` : null].filter(Boolean).join(' · '),
          (m.params || []).length ? chip(`${m.params.length} param${m.params.length === 1 ? '' : 's'}`, 'plain') : null,
          btn('Run', () => run(m, rerender).catch(fail), 'sm primary'))) : empty(`Nothing matches “${query}”.`),
      });
    },
  });
})();
