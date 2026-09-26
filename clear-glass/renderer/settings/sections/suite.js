'use strict';
/**
 * renderer/settings/sections/suite.js — Ledger (Cortex event)  (styles: suite.css)
 */
/**
 * renderer/settings/sections/suite.js — Agent suite
 * §BUILT 2026-09-23. The Guardian-plugin surface in one place, all over
 * already-real IPC: custom input/output agents (AM8, options.registerAgent),
 * DOM listeners (TX16), download listeners, the callto index, and
 * userscripts. Custom agents and DOM listeners are CAPTURED with the
 * Guardian picker on a live page (they need a real element fingerprint);
 * this page manages them, it doesn't pretend to capture a selector it
 * cannot see.
 */
(function () {
  const { cg, h, call, toast, busy, modal, confirmDo, field, pane, row, btn, chip, empty, ago, toggle, select, section } = window.CGS;

  const TARGETS = [
    { value: 'ledger', label: 'Ledger (Cortex event)' }, { value: 'intelligence', label: 'Intelligence observation' },
    { value: 'copilot-panel', label: 'Co-pilot panel' }, { value: 'copilot-cli', label: 'Co-pilot (answer back)' },
    { value: 'ollama-stream', label: 'Ollama (answer back)' }, { value: 'sse-system', label: 'A NEXUS system\u2019s stream' },
    { value: 'compartment', label: 'A compartment' },
  ];
  const targetLabel = (t) => !t ? 'no destination' : (TARGETS.find(x => x.value === t.type) || { label: t.type }).label + (t.system ? ` \u00B7 ${t.system}` : '');

  async function newDownloadListener(rerender) {
    const pattern = h('input', { type: 'text', placeholder: '*.pdf  (blank = every download)' });
    const agent = h('input', { type: 'text', placeholder: 'blank = every tab' });
    const tgt = select(TARGETS, 'ledger');
    const sys = h('input', { type: 'text', placeholder: 'system name (for stream / compartment)' });
    const r = await modal({ title: 'New download listener', body: [field('File name', pattern), field('Only from tab', agent), field('Send to', tgt), field('System', sys)],
      actions: [{ label: 'Add listener', primary: true, run: () => call(() => cg.downloads.registerListener({
        filenamePattern: pattern.value.trim() || null, agentId: agent.value.trim() || null,
        linkTarget: { type: tgt.value, ...(sys.value.trim() ? { system: sys.value.trim() } : {}) } }), 'add listener') }] });
    if (r) { toast('Download listener added'); rerender(); }
  }

  section({
    id: 'suite', group: 'Agents', icon: '\u25CE', label: 'Agent suite',
    keywords: 'guardian plugin picker listener callto custom agent userscript download watch',
    blurb: 'Sites you\u2019ve turned into agents, elements Guardian watches or can act on, what happens to downloads, and the scripts injected into pages.',
    async render({ rerender }) {
      const [custom, listeners, dls, calltos, scripts] = await Promise.all([
        cg.customAgents.list().catch(e => ({ error: e.message })), cg.listeners.list().catch(e => ({ error: e.message })),
        cg.downloads.listListeners().catch(e => ({ error: e.message })), cg.calltos.list().catch(e => ({ error: e.message })),
        cg.userscripts.list().catch(e => ({ error: e.message })),
      ]);
      const guard = (x, fn) => (x && x.error) ? h('div', { class: 'err-box', text: x.error }) : fn(x || []);
      const pickerHint = 'Capture new ones with the Guardian picker (\u25CE) on the page itself.';

      return [
        pane({ title: 'Custom agents', sub: pickerHint, flush: true, body: guard(custom, list => list.length ? list.map(a => row(a.agentName, `${a.origin} \u00B7 in ${a.input.selector} \u00B7 out ${a.output.selector}`, chip(a.enabled ? 'enabled' : 'off', a.enabled ? 'ok' : 'plain')))
          : empty('No custom agents. Pick an input box and a response area on any chat site to add one.')) }),

        pane({ title: 'Page listeners', sub: pickerHint, flush: true, body: guard(listeners, list => list.length ? list.map(l => row(l.label || l.urlPattern,
          `${l.eventType} on ${l.urlPattern} \u2192 ${targetLabel(l.linkTarget)}`,
          toggle(l.enabled, (on) => call(() => cg.listeners.update(l.id, { enabled: on }), 'update listener'), 'Listener enabled'),
          btn('Delete', async () => { if (await confirmDo('Delete listener?', `Stops watching ${l.urlPattern}.`, 'Delete')) { await busy(null, () => call(() => cg.listeners.remove(l.id), 'delete')); rerender(); } }, 'sm danger')))
          : empty('No page listeners.')) }),

        pane({ title: 'Download listeners', tools: btn('Add', () => newDownloadListener(rerender), 'sm'), flush: true, body: guard(dls, list => list.length ? list.map(l => row(l.filenamePattern || 'Every download',
          `${l.agentId ? `from ${l.agentId}` : 'from any tab'} \u2192 ${targetLabel(l.linkTarget)}`,
          toggle(l.enabled, (on) => call(() => cg.downloads.updateListener(l.id, { enabled: on }), 'update listener'), 'Listener enabled'),
          btn('Delete', () => busy(null, async () => { await call(() => cg.downloads.removeListener(l.id), 'delete'); rerender(); }), 'sm danger')))
          : empty('Nothing happens to downloads yet.', btn('Add listener', () => newDownloadListener(rerender), 'sm'))) }),

        pane({ title: 'Callable elements', sub: 'Elements Guardian and co-pilot can click, type into or read.', flush: true, body: guard(calltos, list => list.length ? list.map(c => row(c.label, `${c.action} \u00B7 ${c.host || c.url || ''} \u00B7 ${c.selector}`,
          btn('Delete', () => busy(null, async () => { await call(() => cg.calltos.remove(c.id), 'delete'); rerender(); }), 'sm danger')))
          : empty('None yet. Use \u201CAdd to index\u201D in the Guardian picker.')) }),

        pane({ title: 'Userscripts', flush: true, body: guard(scripts, list => list.length ? list.map(s => row(s.name, `${s.type || 'user'} \u00B7 ${(s.matches || []).join(', ')}${s.agentId && s.agentId !== '*' ? ` \u00B7 ${s.agentId}` : ''}`,
          s.readOnly ? chip('built in', 'plain') : null,
          toggle(s.enabled, (on) => call(() => cg.userscripts.toggle(s.id, on), 'toggle script'), 'Script enabled'),
          s.readOnly ? null : btn('Delete', async () => { if (await confirmDo(`Delete “${s.name}”?`, 'The script file is removed.', 'Delete')) { await busy(null, () => call(() => cg.userscripts.delete(s.id), 'delete')); rerender(); } }, 'sm danger')))
          : empty('No userscripts.')) }),
      ];
    },
  });
})();
