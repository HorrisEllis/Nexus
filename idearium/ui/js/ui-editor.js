// ════════════════════════════════════════════════════════════════════════════
// idearium/ui/js/ui-editor.js — the UI editor page (UE1, 0.60.122). Map: docs/2026-10-10-design-surface-phasemap.spec
//
// Opens ?repo=<uuid>&path=<file.html>: reads the page and its local stylesheets through the repo's file route, and hands
// them to GrapesJS (the engine: layers, style manager, traits, blocks, devices, undo, code view). The page's own
// stylesheets are loaded into the canvas as they are and never rewritten; what is changed in the editor is kept as its
// own CSS in one marked <style> in the page's head, so a save never drops a rule the editor did not understand. The body
// is replaced, everything outside it kept byte for byte (js/ui-editor-doc.js). Save goes through POST …/file, the one
// write path, so it is a version and can be undone. A page whose markup a script builds is opened but not saved over
// (UE2: the edit would erase what the script makes); the page says so.
// ════════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';
  const D = window.UIEditorDoc;
  const q = new URLSearchParams(location.search);
  const repo = q.get('repo'), file = q.get('path');
  const $ = (id) => document.getElementById(id);
  const state = (t, k = '') => { const el = $('ue-state'); el.textContent = t; el.className = k; };
  const UE = window.UE = { repo, file, editor: null, original: null, doc: null, blobs: [], dirty: false, saving: false };

  async function api(path, body) {
    const r = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
    return j;
  }
  const read = (p) => api(`/api/repos/${encodeURIComponent(repo)}/file?path=${encodeURIComponent(p)}`).then(j => String(j.content == null ? '' : j.content));

  async function open() {
    if (!repo || !file) { state('open from the Code tab (an .html file → edit UI), or ?repo=<uuid>&path=<file.html>', 'bad'); return; }
    $('ue-file').textContent = file;
    let html;
    try { html = await read(file); } catch (e) { state(`could not read ${file}: ${e.message}`, 'bad'); return; }
    UE.original = html; UE.doc = D.split(html);
    // the page's own stylesheets, as they are, into the canvas (blob URLs: the repo's files are not served by URL)
    const sheets = [];
    for (const href of UE.doc.links) {
      const p = D.resolve(file, href); if (!p) continue;
      try { const css = await read(p); const u = URL.createObjectURL(new Blob([css], { type: 'text/css' })); UE.blobs.push(u); sheets.push({ href, path: p, url: u }); }
      catch (e) { sheets.push({ href, path: p, error: e.message }); }
    }
    const inline = UE.doc.styles.filter(s => !s.ours).map(s => s.css).join('\n');
    if (inline) { const u = URL.createObjectURL(new Blob([inline], { type: 'text/css' })); UE.blobs.push(u); sheets.push({ href: '(inline)', url: u }); }
    const ours = UE.doc.styles.filter(s => s.ours).map(s => s.css).join('\n');   // an earlier save's edits: editable again
    UE.sheets = sheets;
    UE.editor = grapesjs.init({
      container: '#gjs', height: '100%', fromElement: false, storageManager: false,
      components: UE.doc.body, style: ours,
      canvas: { styles: sheets.filter(s => s.url).map(s => s.url) },
      deviceManager: { devices: [{ id: 'desktop', name: 'Desktop', width: '' }, { id: 'tablet', name: 'Tablet', width: '768px', widthMedia: '992px' }, { id: 'mobile', name: 'Mobile', width: '375px', widthMedia: '480px' }] },
      blockManager: { blocks: [
        { id: 'section', label: 'Section', category: 'Layout', content: '<section style="padding:24px"><h2>Section</h2><p>Text</p></section>' },
        { id: 'row', label: 'Row', category: 'Layout', content: '<div style="display:flex;gap:12px"><div style="flex:1;padding:8px">Cell</div><div style="flex:1;padding:8px">Cell</div></div>' },
        { id: 'text', label: 'Text', category: 'Basic', content: { type: 'text', content: 'Text' } },
        { id: 'heading', label: 'Heading', category: 'Basic', content: '<h2>Heading</h2>' },
        { id: 'button', label: 'Button', category: 'Basic', content: '<button type="button">Button</button>' },
        { id: 'link', label: 'Link', category: 'Basic', content: { type: 'link', content: 'Link', attributes: { href: '#' } } },
        { id: 'image', label: 'Image', category: 'Media', content: { type: 'image' }, activate: true },
        { id: 'input', label: 'Input', category: 'Forms', content: '<input type="text" placeholder="…">' },
      ] },
    });
    const failed = sheets.filter(s => s.error);
    state(`${UE.doc.links.length} stylesheet(s) loaded as they are${failed.length ? ` — ${failed.length} could not be read: ${failed.map(s => s.path).join(', ')}` : ''}${UE.doc.scripted ? ' · this page builds markup from script: saving is off (the save would erase what the script makes; UE2)' : ''}`, UE.doc.scripted || failed.length ? 'bad' : '');
    UE.editor.on('update', () => { UE.dirty = true; $('ue-save').disabled = UE.doc.scripted || UE.saving; });
    $('ue-undo').onclick = () => UE.editor.UndoManager.undo();
    $('ue-redo').onclick = () => UE.editor.UndoManager.redo();
    $('ue-save').onclick = save;
    window.addEventListener('beforeunload', (e) => { if (UE.dirty) { e.preventDefault(); e.returnValue = ''; } });
  }

  function _bodyHtml() {
    const h = UE.editor.getHtml();
    const m = h.match(/^\s*<body\b[^>]*>([\s\S]*)<\/body>\s*$/i);
    return m ? m[1] : h;
  }

  async function save() {
    if (!UE.editor || UE.doc.scripted || UE.saving) return;
    UE.saving = true; $('ue-save').disabled = true; state('saving…');
    try {
      const css = UE.editor.getCss({ avoidProtected: true }) || '';
      const out = D.merge(UE.original, { body: `\n${_bodyHtml()}\n`, css, target: 'inline' });
      await api(`/api/repos/${encodeURIComponent(repo)}/file`, { path: file, content: out });
      UE.original = out; UE.doc = D.split(out); UE.dirty = false;
      state(`saved ${file} — a version was kept; undo it from the file's history`, 'ok');
    } catch (e) { state(`not saved: ${e.message}`, 'bad'); $('ue-save').disabled = false; }
    UE.saving = false;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', open); else open();
})();
