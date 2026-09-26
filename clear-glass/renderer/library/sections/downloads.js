'use strict';
/**
 * renderer/library/sections/downloads.js — Library → Downloads  (styles: downloads.css)
 * §BUILT 0.39.241 — James: "the download manager in clearglass" with Firefox's
 * Library (Downloads) as the picture: one row per file — its type, its name,
 * "size — site — time", and a folder button. Ctrl+J opens the Library here.
 *
 * Rows come from Clear Glass's DownloadsStore (GET /cli/downloads) — every
 * download from every Clear Glass window and provider tab, with the agent tab it
 * came from. Opening a file and showing it in its folder go through the OS shell
 * (downloads:openFile / downloads:openFolder). Removing a row never deletes the
 * file. Agent replies are not files: they live under Responses.
 */
(function () {
  const { cg, h, busy, confirmDo, pane, btn, empty, onLeave, toast, section } = window.CGS;
  const { api, fmtBytes, fmtWhen, host, matches } = window.CGL;

  const KIND = [
    [/^(zip|rar|7z|gz|tgz|tar|bz2|xz)$/, 'archive'], [/^(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/, 'image'],
    [/^(pdf|docx?|txt|md|rtf|odt|pptx?|xlsx?|csv)$/, 'doc'], [/^(js|mjs|cjs|ts|tsx|jsx|json|py|html?|css|sh|ps1|java|go|rs|c|cpp|h|rb|php|yml|yaml|xml|sql)$/, 'code'],
    [/^(exe|msi|dmg|pkg|appimage|deb|rpm|bat|cmd)$/, 'exec'], [/^(mp4|mkv|webm|mov|mp3|wav|flac|ogg|m4a)$/, 'media'],
  ];
  const extOf = (name) => { const m = /\.([A-Za-z0-9]{1,8})$/.exec(name || ''); return m ? m[1].toLowerCase() : ''; };
  const kindOf = (ext) => (KIND.find(([re]) => re.test(ext)) || [null, 'file'])[1];
  const STATE = { cancelled: 'Canceled', interrupted: 'Failed', paused: 'Paused' };

  function statusLine(d) {
    const parts = [];
    if (d.state === 'in_progress') parts.push(d.bytes ? `Downloading — ${fmtBytes(d.bytes)}` : 'Downloading…');
    else if (STATE[d.state]) parts.push(STATE[d.state]);
    else parts.push(fmtBytes(d.bytes));
    const site = host(d.url); if (site) parts.push(site);
    const when = fmtWhen(d.updatedAt || d.startedAt); if (when) parts.push(when);
    return parts.join(' — ');
  }

  function dlRow(d, rerender) {
    const ext = extOf(d.filename);
    const done = d.state === 'completed';
    const open = () => busy(null, async () => {
      const r = await cg.downloads.openFile(d.id);
      if (r && r.ok === false) throw new Error(r.error || 'could not open the file');
    });
    const name = h('button', { class: 'dl-name', title: done ? `Open ${d.filename}` : d.filename, disabled: done ? null : true, onclick: open, text: d.filename || '(unnamed)' });
    return h('div', { class: `row dl dl-${d.state}`, dataset: { id: d.id } },
      h('div', { class: `dl-glyph k-${kindOf(ext)}`, 'aria-hidden': 'true', text: (ext || 'file').slice(0, 4).toUpperCase() }),
      h('div', { class: 'what' },
        name,
        h('div', { class: 'd' }, statusLine(d),
          d.agentId && d.agentId !== 'default' ? h('span', { class: 'chip plain dl-agent', title: 'The agent tab this came from', text: d.agentId }) : null),
        d.state === 'in_progress' ? h('div', { class: 'dl-bar', role: 'progressbar', 'aria-label': `Downloading ${d.filename}` }) : null),
      h('div', { class: 'acts' },
        h('button', { class: 'btn ghost sm dl-folder', title: 'Show in folder', 'aria-label': `Show ${d.filename} in folder`, disabled: d.savePath ? null : true,
          onclick: () => busy(null, async () => { const r = await cg.downloads.openFolder(d.id); if (r && r.ok === false) throw new Error(r.error); }), text: '\u{1F4C2}' }),
        h('button', { class: 'btn ghost sm', title: 'Remove from list (the file stays on disk)', 'aria-label': `Remove ${d.filename} from the list`,
          onclick: () => busy(null, async () => { await api(`/cli/downloads/${encodeURIComponent(d.id)}`, { method: 'DELETE' }); rerender(); }), text: '✕' })));
  }

  // ── Download listeners — moved here 0.39.241 from the browser window's
  //    Downloads dropdown (browser.js _renderDownloadsPanel, 2026-08-28: James,
  //    "a download listener for artifacts"), which this area replaces. Same
  //    store, same seven link targets, same IPC (downloads:*Listener). ──────
  const TARGETS = [
    ['ledger', 'Event ledger'], ['intelligence', 'Intelligence'], ['compartment', 'Another system (+ intent)'],
    ['sse-system', 'SSE → system'], ['copilot-cli', 'Co-pilot CLI (+ intent)'], ['copilot-panel', 'Co-pilot panel'], ['ollama-stream', 'Ollama stream'],
  ];
  const SYSTEMS = ['cortex', 'guardian', 'orchestrator', 'bridge', 'loom', 'copilot', 'intelligence', 'eravos', 'idearium', 'architect'];
  const targetLabel = (t) => (TARGETS.find(x => x[0] === t) || [t, t])[1];

  function listenersPane(listeners, rerender) {
    const { field, select } = window.CGS;
    const pattern = h('input', { type: 'text', class: 'mono', placeholder: '*.pdf — blank matches every file' });
    const target = select(TARGETS.map(([value, label]) => ({ value, label })), 'ledger');
    const system = select(SYSTEMS, 'cortex');
    const intent = h('input', { type: 'text', placeholder: 'e.g. flag-for-review' });
    const sysField = field('System', system), intentField = field('Intent', intent);
    const sync = () => {
      const t = target.value;
      sysField.style.display = (t === 'compartment' || t === 'sse-system') ? '' : 'none';
      intentField.style.display = (t === 'compartment' || t === 'copilot-cli') ? '' : 'none';
    };
    target.addEventListener('change', sync); sync();
    const add = btn('Add listener', (e) => busy(e.currentTarget, async () => {
      const linkTarget = { type: target.value };
      if (sysField.style.display !== 'none') linkTarget.system = system.value;
      if (intentField.style.display !== 'none') linkTarget.intent = intent.value.trim() || null;
      const r = await cg.downloads.registerListener({ filenamePattern: pattern.value.trim() || null, linkTarget });
      if (r && r.error) throw new Error(r.error);
      toast('Listener added'); rerender();
    }), 'sm primary');
    return pane({
      title: 'Download listeners', sub: 'When a finished file matches, it is handed to a NEXUS system.', cls: 'dl-listeners',
      body: [
        listeners.length ? h('div', { class: 'dl-lrows' }, listeners.map(l => h('div', { class: 'dl-lrow' },
          h('span', { class: 'mono', text: l.filenamePattern || '*' }), h('span', { class: 'arrow', text: '→' }),
          h('span', { text: `${targetLabel(l.linkTarget && l.linkTarget.type)}${l.linkTarget && l.linkTarget.system ? ` · ${l.linkTarget.system}` : ''}${l.linkTarget && l.linkTarget.intent ? ` · ${l.linkTarget.intent}` : ''}${l.agentId ? ` (${l.agentId})` : ''}` }),
          h('button', { class: 'btn ghost sm', 'aria-label': 'Remove listener', title: 'Remove', text: '✕',
            onclick: () => busy(null, async () => { await cg.downloads.removeListener(l.id); rerender(); }) })))) : h('p', { class: 'blurb', text: 'None yet.' }),
        h('div', { class: 'grid dl-lform' }, field('Filename pattern', pattern), field('Send to', target), sysField, intentField),
        h('div', { class: 'dl-ladd' }, add),
      ],
    });
  }

  section({
    id: 'downloads', group: 'Library', icon: '⤓', label: 'Downloads',
    blurb: 'Every file downloaded in any Clear Glass window or provider tab. Click a name to open it. Agent replies are under Responses.',
    async render({ tools, rerender, query }) {
      const r = await api('/cli/downloads');
      const all = (r.downloads || []).slice().sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
      const list = all.filter(d => matches(query, d.filename, d.url, d.savePath, d.agentId));
      const finished = all.filter(d => d.state === 'completed').length;
      tools.append(btn('Clear completed', (e) => busy(e.currentTarget, async () => {
        if (!finished) return toast('Nothing completed to clear', 'warn');
        const x = await api('/cli/downloads/clear-completed', { method: 'POST' });
        toast(`Cleared ${x.removed || 0} from the list — the files stay on disk`); rerender();
      }), 'sm'));

      // Live: a changed list (new file, finished, failed) re-renders; an unchanged one does nothing.
      const sig = (xs) => xs.map(d => `${d.id}:${d.state}:${d.bytes}`).join('|');
      const was = sig(all);
      const timer = setInterval(async () => {
        try { const n = await api('/cli/downloads'); if (sig((n.downloads || []).slice().sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))) !== was) rerender(); }
        catch (_) { /* bridge briefly away — the next tick tries again */ }
      }, all.some(d => d.state === 'in_progress') ? 1500 : 4000);
      onLeave(() => clearInterval(timer));

      const listeners = await cg.downloads.listListeners().catch(() => []);
      const files = !all.length
        ? pane({ body: empty('No downloads yet. Files you download in Clear Glass appear here.'), flush: true })
        : pane({
            title: query ? `${list.length} of ${all.length}` : `${all.length} file${all.length === 1 ? '' : 's'}`, flush: true,
            body: list.length ? list.map(d => dlRow(d, rerender)) : empty(`Nothing matches “${query}”.`),
          });
      return [files, listenersPane(Array.isArray(listeners) ? listeners : [], rerender)];
    },
  });
})();
