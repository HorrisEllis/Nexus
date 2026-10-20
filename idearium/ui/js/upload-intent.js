// idearium/ui/js/upload-intent.js — UP4 0.60.173: the Code tab's "upload" panel. A zip with an intent, placed, answered by him.
// Map: docs/2026-10-19-upload-intent-and-page-map-phasemap.spec (UP4_upload_ui)
// James, 2026-10-19: "upload zip with an intent, have it map to nexus using a tool, then ask me with the option to edit the location
// and where they go in relation to the system or the registry."
// Holds no placement logic: every place, reason, system and neighbour comes from POST/GET /api/repos/:uuid/uploads
// (lib/upload-placement.js). This panel only shows them and sends his answer (POST …/uploads/:id/answer).
const UPS = { list: null, rules: [], open: null, one: null, edits: {}, error: null, busy: false, result: null };

async function cxUploadLoad(repo) {
  try { const r = await api(`/api/repos/${repo.uuid}/uploads`, {}, 20000); UPS.list = r.uploads || []; UPS.rules = r.rules || []; UPS.error = null; }
  catch (e) { UPS.list = []; UPS.error = (e.data && e.data.error) || e.message; }
  if (!UPS.open && UPS.list.length && UPS.list[0].state === 'needs-you') return cxUploadOpen(UPS.list[0].uuid);
  _cxUploadPaint();
}
function _cxUploadPaint() { if (typeof CX !== 'undefined' && CX.panel === 'upload') _cxPaintPanel(); }

async function cxUploadOpen(id) {
  const repo = CURRENT_API_REPO; if (!repo) return;
  UPS.open = id; UPS.one = null; UPS.edits = {}; UPS.result = null; _cxUploadPaint();
  try { UPS.one = await api(`/api/repos/${repo.uuid}/uploads/${encodeURIComponent(id)}`, {}, 20000); }
  catch (e) { UPS.one = { error: (e.data && e.data.error) || e.message }; }
  _cxUploadPaint();
}

async function cxUploadSend() {
  const repo = CURRENT_API_REPO; if (!repo || UPS.busy) return;
  const f = document.getElementById('up-zip'), intent = (document.getElementById('up-intent') || {}).value || '';
  const file = f && f.files && f.files[0];
  if (!file) return toast('choose a .zip first', 'err');
  if (!intent.trim()) return toast('say what these files are for — the intent is how they are placed', 'err');
  UPS.busy = true; _cxUploadPaint();
  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    const r = await api(`/api/repos/${repo.uuid}/uploads`, { method: 'POST', body: JSON.stringify({ name: file.name, intent, contentBase64: btoa(bin) }) }, 120000);
    toast(`${r.plan.stats.files} file(s) placed — waiting for your answer`);
    UPS.open = r.uuid; UPS.one = r; UPS.edits = {}; UPS.result = null;
    await cxUploadLoad(repo);
  } catch (e) { toast(`upload refused: ${(e.data && e.data.error) || e.message}`, 'err'); }
  finally { UPS.busy = false; _cxUploadPaint(); }
}

function cxUploadEdit(from, key, value) {
  const e = UPS.edits[from] || (UPS.edits[from] = {});
  e[key] = value;
  if (key === 'to') { const inp = document.querySelector(`input.up-to[data-from="${CSS.escape(from)}"]`); if (inp && inp.value !== value) inp.value = value; }
}

async function cxUploadAnswer() {
  const repo = CURRENT_API_REPO, u = UPS.one; if (!repo || !u || !u.plan || UPS.busy) return;
  const rows = [];
  for (const r of u.plan.rows) {
    const e = UPS.edits[r.from] || {};
    if (e.skip) rows.push({ from: r.from, skip: true });
    else if (e.to != null && e.to.trim() && e.to.trim() !== r.to) rows.push({ from: r.from, to: e.to.trim() });
    else if (e.keep && r.action === 'identical') rows.push({ from: r.from, to: r.to });
  }
  UPS.busy = true; _cxUploadPaint();
  try {
    UPS.result = await api(`/api/repos/${repo.uuid}/uploads/${encodeURIComponent(u.uuid)}/answer`, { method: 'POST', body: JSON.stringify({ rows }) }, 120000);
    toast(`${UPS.result.written} written · ${UPS.result.skipped.length} skipped${UPS.result.errors.length ? ` · ${UPS.result.errors.length} failed` : ''}`, UPS.result.errors.length ? 'err' : 'ok');
    UPS.one = await api(`/api/repos/${repo.uuid}/uploads/${encodeURIComponent(u.uuid)}`, {}, 20000);
    await cxUploadLoad(repo);
    if (typeof loadFileStates === 'function') loadFileStates(repo, { force: true });
  } catch (e) { toast(`answer refused: ${(e.data && e.data.error) || e.message}`, 'err'); }
  finally { UPS.busy = false; _cxUploadPaint(); }
}

function _upSure(c) { return c >= 0.8 ? 'up-hi' : c >= 0.5 ? 'up-mid' : 'up-lo'; }

function _cxUploadRow(r, answered) {
  const e = UPS.edits[r.from] || {}, esc = escapeHtml, f = esc(r.from);
  const alts = (r.alternatives || []).map(a => `<option value="${esc(a.to)}">${esc(a.to)} — ${esc(a.why)} ${Math.round(a.confidence * 100)}%</option>`).join('');
  const notes = [r.risk ? `<div class="up-warn">${esc(r.risk)}</div>` : '', ...(r.warnings || []).map(w => `<div class="up-warn">${esc(w)}</div>`),
    (r.requiredBy || []).length ? `<div class="cs-dim">required by ${r.requiredBy.slice(0, 5).map(esc).join(', ')}${r.requiredBy.length > 5 ? ` +${r.requiredBy.length - 5}` : ''}</div>` : '',
    Array.isArray(r.requires) && r.requires.length ? `<div class="cs-dim">requires ${r.requires.map(q => q.resolved ? `${esc(q.resolved)} <i>(${esc(q.in)})</i>` : q.in === 'missing' ? `<b class="up-lo">${esc(q.spec)} (nowhere)</b>` : esc(q.spec)).join(', ')}</div>` : '',
    r.note ? `<div class="cs-dim">${esc(r.note)}</div>` : '', r.conflict ? `<div class="up-warn">same place as ${esc(r.conflict)} — move one</div>` : ''].join('');
  return `<div class="up-row${e.skip ? ' up-skip' : ''}">
    <div class="up-head"><span class="up-act up-${esc(r.action)}">${esc(r.action)}</span> <span class="cs-dim">${f}</span>
      <span class="up-sys${r.systemExists ? '' : ' up-newsys'}" title="the system (top-level folder) it lands in">${esc(r.system)}${r.systemExists ? '' : ' · new'}</span>
      <span class="${_upSure(r.confidence)}" title="why this place">${esc(r.why)} ${Math.round(r.confidence * 100)}%</span></div>
    ${answered ? `<div class="up-to-fixed">→ ${esc(r.to)}</div>` : `<div class="up-edit">→ <input class="up-to" data-from="${f}" value="${esc(e.to != null ? e.to : r.to)}" oninput="cxUploadEdit(this.dataset.from,'to',this.value)">
      ${alts ? `<select onchange="if(this.value)cxUploadEdit('${f.replace(/'/g, '&#39;')}','to',this.value)"><option value="">other places…</option>${alts}</select>` : ''}
      <label><input type="checkbox" ${e.skip ? 'checked' : ''} onchange="cxUploadEdit('${f.replace(/'/g, '&#39;')}','skip',this.checked);_cxUploadPaint()"> skip</label>
      ${r.action === 'identical' ? `<label title="identical files are skipped unless you keep them"><input type="checkbox" ${e.keep ? 'checked' : ''} onchange="cxUploadEdit('${f.replace(/'/g, '&#39;')}','keep',this.checked)"> write anyway</label>` : ''}</div>`}
    ${notes}</div>`;
}

function _cxUpload() {
  const esc = escapeHtml;
  const form = `<div class="up-form"><b>Upload a zip with an intent</b> <span class="cs-dim">— every file is placed against this repo; nothing is written until you answer</span>
    <div><input type="file" id="up-zip" accept=".zip"> <input id="up-intent" class="up-intent" placeholder="what are these files for? (e.g. a page reader for clear glass)">
    <button onclick="cxUploadSend()" ${UPS.busy ? 'disabled' : ''}>${UPS.busy ? 'working…' : 'Upload'}</button></div>
    ${UPS.rules.length ? `<div class="cs-dim">learned from your answers: ${UPS.rules.slice(0, 4).map(r => `${esc(r.from)} → ${esc(r.to)} (${r.n}×)`).join(' · ')}</div>` : ''}</div>`;
  if (UPS.error) return form + `<div class="cs-empty cs-bad">${esc(UPS.error)}</div>`;
  if (!UPS.list) return form + '<div class="cs-empty">reading the uploads…</div>';
  const list = UPS.list.length ? `<div class="up-list">${UPS.list.map(u => `<span class="up-chip${UPS.open === u.uuid ? ' up-chip-on' : ''}" onclick="cxUploadOpen('${esc(u.uuid)}')">${u.state === 'needs-you' ? '⚑ ' : ''}${esc(u.name)} <i class="cs-dim">${(u.stats && u.stats.files) || 0} · "${esc(u.intent)}"</i></span>`).join('')}</div>` : '<div class="cs-empty">no uploads yet</div>';
  const u = UPS.one;
  if (!UPS.open || !u) return form + list + (UPS.open ? '<div class="cs-dim">reading…</div>' : '');
  if (u.error) return form + list + `<div class="cs-empty cs-bad">${esc(u.error)}</div>`;
  const p = u.plan || {}, st = p.stats || {}, answered = u.state !== 'needs-you';
  const head = `<div class="up-sum">${answered ? '<b>answered</b>' : '<b class="up-mid">⚑ needs you</b>'} · "${esc(u.intent)}" · ${st.files || 0} file(s): ${st.create || 0} new, ${st.replace || 0} replace, ${st.identical || 0} identical${st.learned ? `, ${st.learned} placed by your earlier answers` : ''}${st.conflicts ? ` · <b class="up-lo">${st.conflicts} conflict(s)</b>` : ''}${p.strip && p.strip.wrapper ? ` · wrapper "${esc(p.strip.wrapper)}/" stripped (it lands on real paths)` : ''}${(p.intentSystems || []).length ? ` · the intent names ${p.intentSystems.map(esc).join(', ')}` : ''}</div>`;
  const skipped = (p.skipped || []).length ? `<div class="cs-dim">not placed: ${p.skipped.map(s => `${esc(s.from)} (${esc(s.why)})`).join(' · ')}</div>` : '';
  const res = UPS.result || (u.answer ? { written: (u.answer.results || []).filter(r => r.ok).length, results: u.answer.results || [], errors: u.answer.errors || [] } : null);
  const out = res ? `<div class="up-res">${res.written} written${res.errors.length ? ` · <b class="up-lo">${res.errors.length} failed</b>` : ''}${(res.results || []).filter(r => !r.ok).map(r => `<div class="up-warn">${esc(r.to)}: ${esc(r.error || '')}</div>`).join('')}</div>` : '';
  const act = answered ? '' : `<div class="up-go"><button onclick="cxUploadAnswer()" ${UPS.busy ? 'disabled' : ''}>Apply my answer</button> <span class="cs-dim">text goes through the proposal door; your moves are learned for next time</span></div>`;
  return form + list + head + skipped + (p.rows || []).map(r => _cxUploadRow(r, answered)).join('') + act + out;
}
