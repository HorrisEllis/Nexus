// ════════════════════════════════════════════════════════════════════════════
// §WORK SURFACE — idearium/ui/js/work-surface.js (0.39.284 W3)
// UUID: nexus-idearium-ui-work-surface-v1-0000-2026-0930-jamesbrooks-001
// Map: docs/2026-09-30-idearium-coding-flow-phasemap.spec (W3_work_surface)
//
// James: "i want below the plan, in idearium, the worksurface from cos or the ide identicle to yours" — under the Plan
// panel: every file the agent changed, one card each (+added −removed, the diff's lines in green and red, collapsible),
// Apply / Reject / Revert / Promote on the card, and the TOOLS the agent has and the calls it made ("the tools arent
// exposed still"). GET /api/repos/:uuid/worksurface (idearium/repo/work-surface.js — a projection, it stores nothing).
// ════════════════════════════════════════════════════════════════════════════

const WSURF = { uuid: null, data: null, open: new Set(), filter: 'all', loading: false, error: null, showTools: false };

async function wsLoad(el) {
  const repo = CURRENT_API_REPO; if (!repo || !el) return;
  if (WSURF.uuid !== repo.uuid) Object.assign(WSURF, { uuid: repo.uuid, data: null, open: new Set(), error: null });
  WSURF.loading = true; if (!WSURF.data) el.innerHTML = '<div class="ws-empty">reading the changes…</div>';
  try { WSURF.data = await api(`/api/repos/${repo.uuid}/worksurface`, {}, 30000); WSURF.error = null; }
  catch (e) { WSURF.error = e.message; }
  WSURF.loading = false;
  if (WSURF.uuid === repo.uuid) wsPaint(el);
}

function _wsSplitPath(p) { const i = p.lastIndexOf('/'); return i === -1 ? ['', p] : [p.slice(0, i + 1), p.slice(i + 1)]; }
function _wsIcon(p) { const ext = (p.split('.').pop() || '').toLowerCase(); return ({ js: 'JS', mjs: 'JS', cjs: 'JS', ts: 'TS', tsx: 'TX', jsx: 'JX', json: '{}', md: 'MD', css: '#', html: '<>', py: 'PY', spec: 'SP', yaml: 'YM', yml: 'YM' })[ext] || '··'; }

function _wsDiffHtml(diff) {
  if (!diff) return '<div class="ws-nodiff">no difference from the file as it is now</div>';
  const out = []; let a = 0, b = 0;
  for (const line of diff.split('\n')) {
    if (line.startsWith('--- ') || line.startsWith('+++ ')) continue;
    const h = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (h) { a = +h[1]; b = +h[2]; out.push(`<div class="ws-ln ws-hunk"><span class="ws-g"></span><span class="ws-g"></span><span class="ws-t">${escapeHtml(line)}</span></div>`); continue; }
    if (line.startsWith('… ')) { out.push(`<div class="ws-ln ws-more"><span class="ws-g"></span><span class="ws-g"></span><span class="ws-t">${escapeHtml(line)}</span></div>`); continue; }
    const k = line[0], text = line.slice(1);
    if (k === '+') out.push(`<div class="ws-ln ws-add"><span class="ws-g"></span><span class="ws-g">${b++}</span><span class="ws-s">+</span><span class="ws-t">${escapeHtml(text) || ' '}</span></div>`);
    else if (k === '-') out.push(`<div class="ws-ln ws-del"><span class="ws-g">${a++}</span><span class="ws-g"></span><span class="ws-s">−</span><span class="ws-t">${escapeHtml(text) || ' '}</span></div>`);
    else out.push(`<div class="ws-ln"><span class="ws-g">${a++}</span><span class="ws-g">${b++}</span><span class="ws-s"> </span><span class="ws-t">${escapeHtml(text) || ' '}</span></div>`);
  }
  return out.join('');
}

function _wsCard(f, i) {
  const open = WSURF.open.has(f.path) || (!WSURF.open.has(`!${f.path}`) && i < 2 && f.added + f.removed <= 400);
  const [dir, base] = _wsSplitPath(f.path);
  // §CT5 0.39.351 — a card opens its file in the Code tab (not shown when that file is already open there)
  const inCode = typeof CS !== 'undefined' && typeof CURRENT_REPO_SUBTAB !== 'undefined' && CURRENT_REPO_SUBTAB === 'code' && CS.open === f.path;
  const toCode = typeof csOpen === 'function' && f.op !== 'delete' && !inCode ? `<button class="ws-act ws-act-code" title="open this file in the Code tab" onclick="event.stopPropagation();wsOpenInCode('${escapeHtml(f.path.replace(/'/g, "\\'"))}')">open in Code</button>` : '';
  const acts = (f.actions || []).map(a => `<button class="ws-act ws-act-${a}" onclick="event.stopPropagation();wsAct('${escapeHtml(f.id)}','${a}')">${({ apply: 'Apply', reject: 'Reject', revert: 'Revert', promote: 'Promote' })[a] || a}</button>`).join('');
  return `<div class="ws-card ${open ? 'open' : ''}" data-path="${escapeHtml(f.path)}">
    <div class="ws-head" onclick="wsToggle('${escapeHtml(f.path)}', ${open})">
      <span class="ws-chev">${open ? '▾' : '▸'}</span><span class="ws-ico">${_wsIcon(f.path)}</span>
      <span class="ws-name">${escapeHtml(base)}</span><span class="ws-dir">${escapeHtml(dir.replace(/\/$/, ''))}</span>
      <span class="ws-grow"></span>
      ${f.creates ? '<span class="ws-chip ws-new">new</span>' : ''}${f.op === 'delete' ? '<span class="ws-chip ws-delchip">delete</span>' : ''}
      <span class="ws-chip ws-st-${escapeHtml(f.status)}">${escapeHtml(f.status)}</span>
      <span class="ws-plus">+${f.added}</span><span class="ws-minus">−${f.removed}</span>${toCode}${acts}
    </div>
    ${open ? `<div class="ws-meta">${f.by ? `${escapeHtml(f.by)} · ` : ''}${f.at ? new Date(f.at).toLocaleString() : ''}${f.run ? ` · ${escapeHtml(f.run.phase || '')} run ${escapeHtml(String(f.run.runId).slice(-8))} (${escapeHtml(f.run.state || '')})` : ''}${f.history ? ` · ${f.history} earlier change${f.history === 1 ? '' : 's'}` : ''}${f.lines ? ` · ${f.lines} lines` : ''}</div>
      <div class="ws-diff" onclick="wsPickLine(event,'${escapeHtml(f.path)}')">${_wsDiffHtml(f.diff)}</div>
      ${f.op === 'delete' ? '' : `<div class="ws-ask"><span>lines</span><input class="ws-n" id="ws-from-${escapeHtml(f.id)}" placeholder="from"><input class="ws-n" id="ws-to-${escapeHtml(f.id)}" placeholder="to">
        <input class="ws-q" id="ws-q-${escapeHtml(f.id)}" placeholder="ask the agent for a small change here — click a line number to pick it" onkeydown="if(event.key==='Enter')wsAsk('${escapeHtml(f.id)}','${escapeHtml(f.path)}')">
        <button class="ws-act ws-act-apply" onclick="wsAsk('${escapeHtml(f.id)}','${escapeHtml(f.path)}')">✎ edit</button></div>`}` : ''}
  </div>`;
}

function _wsTools(t) {
  if (!t) return '';
  const used = {}; for (const c of t.calls || []) used[c.name] = (used[c.name] || 0) + 1;
  const failed = (t.calls || []).filter(c => !c.ok);
  const chip = (n) => `<span class="ws-tool ${used[n] ? 'used' : ''}" title="${used[n] ? `used ${used[n]}×` : 'not used yet'}">${escapeHtml(n.replace(/\.tool$/, ''))}${used[n] ? `<b>${used[n]}</b>` : ''}</span>`;
  const extra = Object.keys(used).filter(n => !(t.listed || []).includes(n));
  return `<div class="ws-tools">
    <div class="ws-tools-head" onclick="WSURF.showTools=!WSURF.showTools;wsPaint(document.getElementById('pp-ws'))">
      <span class="ws-chev">${WSURF.showTools ? '▾' : '▸'}</span> tools · scope <b>${escapeHtml(t.scope || '?')}</b> · ${(t.listed || []).length} given · ${Object.keys(used).length} used in ${(t.calls || []).length} call${(t.calls || []).length === 1 ? '' : 's'}${failed.length ? ` · <span style="color:var(--coral)">${failed.length} failed</span>` : ''}</div>
    ${WSURF.showTools ? `<div class="ws-tool-row">${(t.listed || []).map(chip).join('')}${extra.map(chip).join('')}</div>
      <div class="ws-tool-note">every other NEXUS tool is one <code>nexus.tools</code> → <code>nexus.tools_expand</code> call away (or <code>loom.find</code>); the Agent tab's <code>/tools</code> lists them all.</div>
      ${(t.calls || []).length ? `<div class="ws-calls">${t.calls.slice(0, 40).map(c => `<div class="ws-call ${c.ok ? '' : 'bad'}">${c.ok ? '✓' : '✗'} <b>${escapeHtml(c.name)}</b> <span>${escapeHtml(c.args || '')}</span>${c.error ? ` — ${escapeHtml(c.error)}` : ''} <i>${escapeHtml(c.phase || '')}</i></div>`).join('')}</div>` : '<div class="ws-tool-note">no tool calls recorded yet — they are kept on each run from 0.39.284</div>'}` : ''}
  </div>`;
}

function wsPaint(el) {
  el = el || document.getElementById('pp-ws'); if (!el) return;
  if (WSURF.error) { el.innerHTML = `<div class="pp-sec">work surface</div><div class="ws-empty">could not read the changes: ${escapeHtml(WSURF.error)}</div>`; return; }
  const d = WSURF.data; if (!d) return;
  const files = (d.files || []).filter(f => WSURF.filter === 'all' || (WSURF.filter === 'pending' ? (f.status === 'proposed' || f.status === 'staged') : f.status === WSURF.filter));
  const t = d.totals || {};
  const filt = ['all', 'pending', 'applied', 'reverted'].map(k => `<button class="ws-f ${WSURF.filter === k ? 'on' : ''}" onclick="WSURF.filter='${k}';wsPaint()">${k}</button>`).join('');
  el.innerHTML = `<div class="ws-top"><span class="pp-sec" style="margin:0">work surface</span>
      <span class="ws-sum">${t.files || 0} file${t.files === 1 ? '' : 's'} <span class="ws-plus">+${t.added || 0}</span> <span class="ws-minus">−${t.removed || 0}</span>${t.pending ? ` · <span style="color:var(--amber)">${t.pending} waiting</span>` : ''}</span>
      <span class="ws-grow"></span>${filt}<button class="ws-f" title="reload" onclick="wsLoad(document.getElementById('pp-ws'))">↻</button></div>
    ${_wsTools(d.tools)}
    ${files.length ? `<div class="ws-note">${files.length > 2 ? 'Large diffs start collapsed — click a file to open it.' : ''}</div>${files.map(_wsCard).join('')}`
      : `<div class="ws-empty">${(d.files || []).length ? 'nothing in this filter' : 'no changes yet — when the agent builds a phase, every file it writes shows here with its diff.'}</div>`}`;
}

function wsToggle(p, wasOpen) {
  if (wasOpen) { WSURF.open.delete(p); WSURF.open.add(`!${p}`); } else { WSURF.open.add(p); WSURF.open.delete(`!${p}`); }
  wsPaint();
  if (typeof csRepaint === 'function') csRepaint();   // §CT3 — the same cards in the Code tab
}

async function wsAct(id, action) {
  const repo = CURRENT_API_REPO; if (!repo) return;
  try {
    if (action === 'promote') await api(`/api/repos/${repo.uuid}/code/promote`, { method: 'POST', body: JSON.stringify({ injects: [id] }) }, 60000);
    else await api(`/api/repos/${repo.uuid}/injects/${encodeURIComponent(id)}/${action}`, { method: 'POST', body: '{}' }, 60000);
    toast(`${action}: done`, 'ok');
  } catch (e) { toast(`${action} failed: ${e.message}`, 'err'); }
  wsLoad(document.getElementById('pp-ws'));
  if (typeof csAfterChange === 'function') csAfterChange();   // §CT3 — the Code tab's tree, diffs and file follow
}

// §0.39.284 — James: "hook the agents into the worksurface, to edit or modify small amounts of code at a time". Click a
// line number (the new side) to pick it — a second click widens the range; the ask goes to the repo's agent as a Manage
// 'edit' of just those lines (POST /api/repos/:uuid/manage — a snapshot first, the run on the Plan, its change a new card).
function wsPickLine(ev, p) {
  const g = ev.target.closest('.ws-g'); if (!g || !g.textContent.trim()) return;
  const n = parseInt(g.textContent, 10); if (!Number.isFinite(n)) return;
  const card = ev.target.closest('.ws-card'); const f = (WSURF.data.files || []).find(x => x.path === p); if (!card || !f) return;
  const a = document.getElementById(`ws-from-${f.id}`), b = document.getElementById(`ws-to-${f.id}`);
  if (!a.value || (a.value && b.value)) { a.value = n; b.value = ''; } else { const x = +a.value; a.value = Math.min(x, n); b.value = Math.max(x, n); }
  const q = document.getElementById(`ws-q-${f.id}`); if (q) q.focus();
}
async function wsAsk(id, p) {
  const repo = CURRENT_API_REPO; if (!repo) return;
  const q = document.getElementById(`ws-q-${id}`); const note = (q && q.value || '').trim();
  if (!note) { toast('say what to change', 'err'); return; }
  const from = document.getElementById(`ws-from-${id}`).value, to = document.getElementById(`ws-to-${id}`).value;
  try {
    const r = await api(`/api/repos/${repo.uuid}/manage`, { method: 'POST', body: JSON.stringify({ path: p, action: 'edit', from: from || undefined, to: to || from || undefined, note }) }, 60000);
    toast(`the agent is editing ${p}${from ? ` lines ${from}–${to || from}` : ''} (run ${String(r.runId || '').slice(-8)}) — its change lands here`, 'ok');
    if (q) q.value = '';
  } catch (e) { toast(`not sent: ${e.message}`, 'err'); }
}

// §CT5 0.39.351 — James: "can we have this hooked into the plan and work surface panel". A card (or a file a run wrote) opens
// in the Code tab: the file, its chunks, this change above it.
async function wsOpenInCode(p) {
  if (typeof setRepoSubtab === 'function' && CURRENT_REPO_SUBTAB !== 'code') setRepoSubtab('code');
  if (typeof csOpen === 'function') await csOpen(p);
}
