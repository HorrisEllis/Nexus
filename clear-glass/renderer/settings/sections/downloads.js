'use strict';
/**
 * renderer/settings/sections/downloads.js — Downloads  (styles: downloads.css)
 *
 * §BUILT 2026-09-25 — James: "Yes build all the ui" (Firefox-reference gap
 * pass: "no dedicated Downloads settings area"). Real gap found, not
 * assumed: cg.downloads.list/clearItem/openFolder have been real, working
 * IPC handlers since 2026-08-24 (src/ipc/bridge.js's downloads:list,
 * downloads:clearItem, downloads:openFolder — checked directly) and were
 * already exposed on window.ClearGlass, but NO section ever called
 * list/openFolder, and only sections/privacy.js's "Clear list" button
 * called clearCompleted (bulk, not per-item). This is the missing
 * per-download view: real items, real "reveal in folder", real per-item
 * removal from the list. The save-location field mirrors General's own
 * downloadDirectory field (same real option, same real consumer —
 * src/downloads/adapter.js's getDownloadDirectory) so this page reads
 * complete without sending someone to a different section for it.
 */
(function () {
  const { cg, h, call, toast, busy, confirmDo, field, pane, row, btn, empty, ago, section } = window.CGS;

  const setOpt = (patch, msg) => call(() => cg.options.set(patch), 'save').then(() => msg && toast(msg));

  section({
    id: 'downloads', group: 'Browser', icon: '⤓', label: 'Downloads',
    keywords: 'downloads save location folder files clear',
    blurb: 'Where files land, and what has downloaded so far.',
    async render({ rerender }) {
      const [o, items] = await Promise.all([
        call(() => cg.options.get(), 'options'),
        cg.downloads.list().catch(() => []),
      ]);
      const dl = h('input', { type: 'text', value: o.downloadDirectory || '', placeholder: 'System default Downloads folder' });
      dl.addEventListener('change', () => setOpt({ downloadDirectory: dl.value.trim() || null }, 'Download folder saved').catch(e => toast(e.message, 'bad')));

      const list = Array.isArray(items) ? items : [];
      return [
        pane({ title: 'Save location', body: field('Save files to', dl, 'Takes effect for the next download. Leave blank to use the system default.') }),
        pane({
          title: 'Downloads', sub: `${list.length} item${list.length === 1 ? '' : 's'}`, flush: true,
          tools: list.length ? btn('Clear completed', () => busy(null, async () => { await cg.downloads.clearCompleted(); rerender(); }), 'sm') : null,
          body: list.length ? list.map(d => row(
            d.filename || d.name || d.url || d.id,
            `${d.state || 'unknown'} · ${ago(d.startedAt || d.ts)}${d.totalBytes ? ` · ${Math.round(d.totalBytes / 1024)} KB` : ''}`,
            btn('Show in folder', () => busy(null, () => cg.downloads.openFolder(d.id)), 'sm'),
            btn('Remove', async () => { if (await confirmDo('Remove from list?', 'The file itself is not deleted.', 'Remove', false)) await busy(null, async () => { await cg.downloads.clearItem(d.id); rerender(); }); }, 'sm danger'),
          )) : empty('Nothing downloaded yet.'),
        }),
      ];
    },
  });
})();
