'use strict';
/**
 * renderer/element-engine/sections/typescript.js — Element Engine → Edit TypeScript  (styles: typescript.css). EE3a, 0.60.416.
 * James, 2026-11-05 (ES5): "can you make a way to import type scripts so i can edit it myself, and import the changes." · 2026-11-06: "It
 * needs to have a full page to edit, change and add."
 * An editor over HIS copy of ErosmancerOS's TypeScript (ES5's export folder), never the live code: open a file, change it, save it (the
 * syntax is checked on save), add a new file, show what changed, import (ES5's checks: syntax, conflicts, the old files kept in _archive,
 * the module's own test, put back if it fails; recorded in Versionium). GET/POST /cli/element-engine/copy*.
 */
(function () {
  const { h, busy, pane, row, btn, chip, empty, field, modal, toast, confirmDo, section } = window.CGS;
  const { api, matches } = window.CGL; const { his, hisRaw, say } = window.CGE;
  const S = { file: null, text: null, saved: null };   // what is open in the editor, kept across re-renders of this area

  const sayImport = (r) => {
    if (r.refused && r.refused.length) return `Not imported: ${r.refused.map(x => `${x.file} — ${x.why}${x.errors ? ` (${x.errors[0]})` : ''}`).join('; ')}`;
    if (r.restored) return `${r.why}. The old files are back.`;
    if (r.applied) return `Imported ${r.files.join(', ')}. Old files kept in ${r.archive}. ${(r.tests || []).map(t => t.ran ? `${t.module} test ${t.ok ? 'passed' : 'failed'}` : `${t.module} test not run (${t.why})`).join('; ')}. ${r.restart || ''}`;
    if (r.nothing) return 'Nothing changed in your copy: nothing to import.';
    return r.note || r.error || 'Nothing to import.';
  };
  function diffView(d) {
    const items = [...(d.changed || []).map(x => ({ ...x, k: 'changed' })), ...(d.added || []).map(x => ({ ...x, k: 'new' }))];
    return [
      ...items.map(x => row(x.file, `+${x.added} −${x.removed}`, chip(x.k, x.k === 'new' ? 'ok' : 'warn'), (d.conflicts || []).includes(x.file) ? chip('changed in Nexus since your export', 'bad') : null)),
      ...(d.missing || []).map(f => row(f, 'deleted in your copy (kept in Nexus: import never deletes)', chip('missing', 'bad'))),
      items.length || (d.missing || []).length ? null : empty('Nothing changed in your copy.'),
    ];
  }

  section({
    id: 'typescript', group: 'ErosmancerOS', icon: '⌨', label: 'Edit TypeScript',
    keywords: 'erosmancer typescript ts edit import export diff code',
    blurb: 'Edit your own copy of ErosmancerOS’s code, then import it. Import checks the syntax, refuses a file that changed in Nexus since your export, keeps the old files in _archive, runs the module’s own test and puts the old files back if it fails.',
    async render({ rerender, query }) {
      const c = await api('/cli/element-engine/copy');
      const exportBtn = (label, cls) => btn(label, async (e) => {
        if (c.exported && !await confirmDo('Export again?', `Your copy in ${c.dir} is overwritten with the live code. Edits you have not imported are lost.`, 'Export')) return;
        await busy(e.target, async () => { const r = await api('/cli/element-engine/copy/export', { method: 'POST', body: {} }); toast(`Exported ${r.files} files to ${r.dir}`); S.file = null; rerender(); });
      }, cls);
      if (!c.exported) return pane({ title: 'No copy yet', body: [row('Export a copy to edit', `ErosmancerOS’s TypeScript is copied to ${c.dir}. You edit the copy, never the live code.`, exportBtn('Export a copy', 'primary'))] });

      const files = c.files.filter(f => matches(query, f.file));
      if (S.file && !c.files.some(f => f.file === S.file)) S.file = null;
      if (S.file && S.text == null) { const r = await api(`/cli/element-engine/copy/file?file=${encodeURIComponent(S.file)}`); S.text = r.text; S.saved = r.text; }
      const changed = c.files.filter(f => f.changed).length;
      const bar = h('div', { class: 'ee-bar' },
        btn('Show my changes', (e) => busy(e.currentTarget, async () => { const d = await api('/cli/element-engine/copy/diff', { method: 'POST', body: {} }); await modal({ title: 'Your changes', wide: true, body: diffView(d), actions: [] }); })),
        btn('Import my changes', async (e) => {
          if (S.file && S.text !== S.saved && !await confirmDo('Import without saving?', `${S.file} has edits that are not saved; they will not be imported.`, 'Import anyway')) return;
          if (!await confirmDo('Import your changes into ErosmancerOS?', 'Checked first; the old files are kept in _archive; the module test runs and the old files come back if it fails. ErosmancerOS restarts with them.', 'Import', false)) return;
          await busy(e.target, async () => { const r = await hisRaw('/cli/element-engine/copy/import', {}); toast(sayImport(r), r.applied ? 'ok' : 'bad', 9000); rerender(); });
        }, 'primary'),
        btn('New file…', async () => {
          const name = h('input', { type: 'text', class: 'mono', placeholder: 'actions/my-action.ts' });
          const ok = await modal({ title: 'A new file in your copy', body: [field('Path inside src', name, 'Ends in .ts. Import adds it to ErosmancerOS.')],
            actions: [{ label: 'Create', primary: true, run: () => his('/cli/element-engine/copy/file', { file: name.value.trim(), text: '// ' + name.value.trim() + '\n' }) }] });
          if (ok) { say(ok); S.file = ok.file; S.text = null; rerender(); }
        }),
        exportBtn('Export again'));
      const list = pane({ title: `${c.files.length} files${changed ? ` · ${changed} changed` : ''}`, sub: c.dir, flush: true, cls: 'ee-files',
        body: files.length ? files.map(f => {
          const r = row(f.file, `${(f.bytes / 1024).toFixed(1)} KB`, f.changed ? chip(f.changed === 'new' ? 'new' : 'changed', f.changed === 'new' ? 'ok' : 'warn') : null,
            btn(S.file === f.file ? 'Open' : 'Edit', async () => {
              if (S.file && S.file !== f.file && S.text !== S.saved && !await confirmDo('Leave without saving?', `${S.file} has edits that are not saved.`, 'Leave')) return;
              S.file = f.file; S.text = null; rerender();
            }, S.file === f.file ? 'sm primary' : 'sm'));
          r.querySelector('.t').classList.add('ee-sel'); return r;
        }) : empty('No file matches.') });
      if (!S.file) return [pane({ body: bar }), list];

      const ta = h('textarea', { class: 'ee-big', spellcheck: 'false', 'aria-label': S.file, value: S.text });
      const meta = h('div', { class: 'ee-meta' });
      const upd = () => { S.text = ta.value; meta.textContent = `${ta.value.split('\n').length} lines${ta.value !== S.saved ? ' · not saved' : ' · saved in your copy'}`; };
      ta.addEventListener('input', upd);
      ta.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') { e.preventDefault(); const s = ta.selectionStart; ta.setRangeText('  ', s, ta.selectionEnd, 'end'); upd(); }
        if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save.click(); }
      });
      const save = btn('Save', (e) => busy(e.currentTarget, async () => { const r = await his('/cli/element-engine/copy/file', { file: S.file, text: ta.value }); S.saved = ta.value; say(r); rerender(); }), 'primary');
      const revert = btn('Revert', async () => { if (ta.value === S.saved || await confirmDo('Throw away your edits?', `${S.file} goes back to what is saved in your copy.`, 'Revert')) { ta.value = S.saved; upd(); } });
      const close = btn('Close', async () => { if (ta.value !== S.saved && !await confirmDo('Close without saving?', `${S.file} has edits that are not saved.`, 'Close')) return; S.file = null; S.text = null; rerender(); });
      upd();
      return [pane({ body: bar }), pane({ title: S.file, sub: 'Your copy · Ctrl+S saves · the syntax is checked on save', tools: h('div', { class: 'acts' }, close, revert, save), body: [ta, meta] }), list];
    },
  });
})();
