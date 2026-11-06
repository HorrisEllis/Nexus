'use strict';
/**
 * renderer/element-engine/sections/lists.js — Element Engine → Filter lists  (styles: lists.css). EE3a, 0.60.416.
 * Every list (the catalogue and his own): on/off, update one, remove one of his; add by address, from files or a folder, or pasted.
 * The same doors as `adblock list|update|import|remove` (POST /cli/adblock/*); file and folder choosing is main's (plugins:pick).
 */
(function () {
  const { h, cg, busy, pane, row, btn, chip, toggle, empty, field, modal, confirmDo, ago, toast, section } = window.CGS;
  const { api, matches } = window.CGL;

  async function importPaths(kind, rerender) {
    const r = await cg.plugins.pick(kind, { title: kind === 'folder' ? 'Choose a folder of lists' : 'Choose list files' }).catch(e => ({ ok: false, error: e.message }));
    if (!r || r.ok === false) return toast(`Could not open the picker: ${r && r.error}`, 'bad');
    if (r.canceled || !(r.paths || []).length) return;
    toast(`Reading ${r.paths.length} item(s)…`);
    const x = await api('/cli/adblock/import', { method: 'POST', body: { paths: r.paths } });
    const ok = (x.lists || []).filter(l => l.ok);
    toast(ok.length ? `Added ${ok.map(l => `${l.title} (${(l.rules || 0).toLocaleString('en')} rules)`).join(', ')}` : 'Nothing added', ok.length ? 'ok' : 'bad', 6000);
    rerender();
  }

  section({
    id: 'lists', group: 'Ad blocking', icon: '☰', label: 'Filter lists',
    keywords: 'easylist easyprivacy ublock subscribe import hosts',
    blurb: 'What decides what is blocked and hidden. Switch a list on and it downloads; your own lists can be removed.',
    async render({ rerender, query }) {
      const o = await api('/cli/element-engine/overview');
      if (!o.blocker) return pane({ body: empty(o.note || 'The blocker is not running.') });
      const all = o.blocker.lists; const L = all.filter(l => matches(query, l.title, l.about, l.id, l.url));
      const url = h('input', { type: 'text', placeholder: 'https://…/list.txt', class: 'ee-wide', 'aria-label': 'List address' });
      const title = h('input', { type: 'text', placeholder: 'Name (optional)', 'aria-label': 'List name' });
      const add = pane({ title: 'Add a list', body: [
        h('div', { class: 'ee-bar' }, url, title, btn('Subscribe', (e) => busy(e.currentTarget, async () => {
          if (!url.value.trim()) throw new Error('an address is needed');
          const r = await api('/cli/adblock/import', { method: 'POST', body: { url: url.value.trim(), title: title.value.trim() || undefined } });
          toast(r.ok === false ? `Not added: ${r.error}` : `Subscribed${r.rules ? `: ${r.rules.toLocaleString('en')} rules` : ''}`, r.ok === false ? 'bad' : 'ok'); rerender();
        }), 'primary')),
        row('From your files', 'A filter list, a hosts file or a list of domains — or a whole folder of them. Each becomes a list you can switch off or remove.',
          btn('Import files…', () => importPaths('file', rerender)), btn('Import folder…', () => importPaths('folder', rerender)),
          btn('Paste a list…', async () => {
            const text = h('textarea', { class: 'mono', rows: 12, placeholder: '||ads.example.com^\nexample.com##.banner\n0.0.0.0 tracker.example' });
            const name = h('input', { type: 'text', value: 'pasted list' });
            const ok = await modal({ title: 'Paste a list', wide: true, body: [field('Name', name), field('Rules', text, 'Adblock Plus / uBlock syntax, a hosts file, or one domain per line')],
              actions: [{ label: 'Add list', primary: true, run: async () => { if (!text.value.trim()) throw new Error('nothing pasted'); const r = await api('/cli/adblock/import', { method: 'POST', body: { text: text.value, title: name.value.trim() || 'pasted list' } }); if (r.ok === false) throw new Error(r.error); return r; } }] });
            if (ok) { toast('List added'); rerender(); }
          })),
      ] });
      const rows = L.map(l => row(`${l.title}${l.imported ? '  · yours' : ''}`,
        [l.about, l.on ? (l.loaded ? `${l.rules.toLocaleString('en')} rules` : 'not downloaded yet') : 'off', l.url && l.on ? (l.updatedAt ? `updated ${ago(l.updatedAt)}` : 'never updated') : null, l.skipped ? `${l.skipped} skipped` : null, l.error ? `last update failed: ${l.error}` : null].filter(Boolean).join(' · '),
        l.error ? chip('failed', 'bad') : null,
        l.url && l.on ? btn('Update', (e) => busy(e.currentTarget, async () => { const r = await api('/cli/adblock/update', { method: 'POST', body: { id: l.id } }); toast(r.ok === false ? `${l.title}: failed` : `${l.title} updated`, r.ok === false ? 'bad' : 'ok'); rerender(); }), 'sm') : null,
        l.imported ? btn('Remove', async (e) => { if (!await confirmDo(`Remove ${l.title}?`, 'Its rules stop applying. You can add it again later.', 'Remove')) return; await busy(e.target, async () => { await api('/cli/adblock/remove', { method: 'POST', body: { id: l.id } }); toast('List removed'); rerender(); }); }, 'sm danger') : null,
        toggle(l.on, async (on) => { toast(on ? `${l.title}: downloading…` : `${l.title} off`); await api('/cli/adblock/list', { method: 'POST', body: { id: l.id, on } }); rerender(); }, `${l.on ? 'Turn off' : 'Turn on'} ${l.title}`)));
      return [add, pane({ title: query ? `${L.length} of ${all.length}` : `${all.length} lists`, flush: true, body: rows.length ? rows : empty('No list matches.') })];
    },
  });
})();
