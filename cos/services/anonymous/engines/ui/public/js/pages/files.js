/* NexusPanel — pages/files.js */
import { $, html, api, apiSoft, act, esc, empty, bytes, toast } from '../core.js';
import { icon } from '../icons.js';

export async function init() {
  await browse();
}

async function browse() {
  const p = ($('fm-path')?.value || '').trim() || 'sites';
  const disp = $('fm-path-display');
  if (disp) disp.textContent = '/' + p;
  const r = await apiSoft('/ui/files?path=' + encodeURIComponent(p));
  if (!r?.entries) {
    html('fm-content', empty('Path not found', 'Check the path and try again.'));
    return;
  }
  if (!r.entries.length) {
    html('fm-content', empty('Empty directory', 'Nothing is stored here yet.'));
    return;
  }
  html('fm-content',
    '<table><thead><tr><th>Name</th><th>Size</th><th></th></tr></thead><tbody>' +
    r.entries.map(e => {
      const glyph = e.type === 'dir' ? icon('folder', 13) : icon('file', 13);
      const name = e.type === 'dir'
        ? '<a href="#" onclick="panel.fmNav(\'' + esc(p + '/' + e.name) + '\');return false">' + esc(e.name) + '</a>'
        : esc(e.name);
      return '<tr><td class="num" style="display:flex;gap:7px;align-items:center">' + glyph + name + '</td>' +
        '<td style="color:var(--dim)">' + (e.type === 'file' ? esc(bytes(e.size)) : '—') + '</td>' +
        '<td>' + (e.type === 'file'
          ? '<button class="sec sm" onclick="panel.fmEdit(\'' + esc(p + '/' + e.name) + '\')">Edit</button>'
          : '') + '</td></tr>';
    }).join('') + '</tbody></table>');
}

window.panel = window.panel || {};
window.panel.fmBrowse = browse;
window.panel.fmNav = p => { const el = $('fm-path'); if (el) el.value = p; browse(); };

window.panel.fmEdit = async p => {
  try {
    const r = await api('/ui/files/read?path=' + encodeURIComponent(p));
    if ($('fm-newname')) $('fm-newname').value = p;
    if ($('fm-newcontent')) $('fm-newcontent').value = r.content ?? '';
    toast('Loaded ' + p);
  } catch (e) { toast('Could not read file — ' + e.message, 'err'); }
};

window.panel.fmSave = async () => {
  const path = ($('fm-newname')?.value || '').trim();
  if (!path) { toast('Enter a file path', 'err'); return; }
  const ok = await act('Saved ' + path, () => api('/ui/files/write', {
    method: 'POST', body: { path, content: $('fm-newcontent')?.value ?? '' },
  }));
  if (ok) browse();
};
