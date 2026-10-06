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
  // §0.39.361 — an undone change (reverted, rejected) starts closed: it is history, not something to act on
  const open = WSURF.open.has(f.path) || (!WSURF.open.has(`!${f.path}`) && !f.undone && i < 2 && f.added + f.removed <= 400);
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
      <span class="ws-plus${f.undone ? ' ws-undone' : ''}">+${f.added}</span><span class="ws-minus${f.undone ? ' ws-undone' : ''}">−${f.removed}</span>${toCode}${acts}
    </div>
    ${_wsNow(f)}
    ${open ? `<div class="ws-meta">${f.run && f.run.provider ? `by <b>${escapeHtml(f.run.provider)}</b> · ` : ''}${f.by ? `${escapeHtml(f.by)} · ` : ''}${f.at ? new Date(f.at).toLocaleString() : ''}${f.run ? ` · ${escapeHtml(f.run.phase || '')} run ${escapeHtml(String(f.run.runId).slice(-8))} (${escapeHtml(f.run.state || '')})` : ''}${f.history ? ` · ${f.history} earlier change${f.history === 1 ? '' : 's'}` : ''}${f.lines ? ` · ${f.lines} lines` : ''}</div>
      ${f.undone ? `<div class="ws-undone-cap">${f.status === 'reverted' ? 'what was undone — none of this is in the file now' : 'what was proposed — it was never written'}</div>` : ''}
      <div class="ws-diff${f.undone ? ' ws-diff-undone' : ''}" onclick="wsPickLine(event,'${escapeHtml(f.path)}')">${_wsDiffHtml(f.diff)}</div>
      ${f.op === 'delete' || f.undone ? '' : `<div class="ws-ask"><span>lines</span><input class="ws-n" id="ws-from-${escapeHtml(f.id)}" placeholder="from"><input class="ws-n" id="ws-to-${escapeHtml(f.id)}" placeholder="to">
        <input class="ws-q" id="ws-q-${escapeHtml(f.id)}" placeholder="ask the agent for a small change here — click a line number to pick it" onkeydown="if(event.key==='Enter')wsAsk('${escapeHtml(f.id)}','${escapeHtml(f.path)}')">
        <button class="ws-act ws-act-apply" onclick="wsAsk('${escapeHtml(f.id)}','${escapeHtml(f.path)}')">✎ edit</button></div>`}` : ''}
  </div>`;
}

// §0.39.361 — James: "i dont use git." What the file is now, said on the card itself — no git status to check.
function _wsNow(f) {
  const n = f.now; if (!n) return '';
  if (n.untouched) return '<div class="ws-now ok">rejected — the file was never changed</div>';
  if (n.restored) return `<div class="ws-now ok">✓ reverted — the file is back exactly as it was${n.lines ? ` (${n.lines} lines)` : ' (removed again — it was new)'}</div>`;
  return `<div class="ws-now bad">⚠ reverted, but the file is not as it was before: it has ${n.lines} lines, it had ${n.wasLines}${n.lines ? ' — something changed it since' : ' — it is missing'}. Open it in Code, or restore a snapshot in Versionium.</div>`;
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
      <span class="ws-sum" title="changes in effect or waiting — reverted and rejected ones are not counted">${t.files || 0} file${t.files === 1 ? '' : 's'} <span class="ws-plus">+${t.added || 0}</span> <span class="ws-minus">−${t.removed || 0}</span>${t.pending ? ` · <span style="color:var(--amber)">${t.pending} waiting</span>` : ''}${t.undone ? ` · <span class="ws-undone">${t.undone} undone</span>` : ''}</span>
      <span class="ws-grow"></span>${filt}<button class="ws-f" title="reload" onclick="wsLoad(document.getElementById('pp-ws'))">↻</button></div>
    ${_wsTools(d.tools)}
    <div id="ws-forming" class="ws-forming-wrap">${_wsFormingHtml(WSURF.uuid)}</div>
    ${files.length ? `<div class="ws-note">${files.length > 2 ? 'Large diffs start collapsed — click a file to open it.' : ''}</div>${files.map(_wsCard).join('')}`
      : `<div class="ws-empty">${(d.files || []).length ? 'nothing in this filter' : 'no changes yet — when the agent builds a phase, every file it writes shows here with its diff.'}</div>`}`;
}

// ── §0.39.362 WS2 — the agent writing, as cards ──────────────────────────────────────────────────────────────────────
// James: "the work surface could also stream the dom mutator". The live feed (app.js AGENT_FEED: a browser agent's DOM
// mutations and node anchor through guardian, or an Ollama model's text through copilot) was a strip of raw text above
// the cards. Now each file the agent is writing is a card of its own while it writes: its path, its lines so far (the
// newest at the bottom), 'writing' while its fence is open, 'written — landing' once closed, until the real card lands.
/** wsFormingBlocks(text) -> [{ path, lang, lines, code, open }] — every fenced block in a reply that names a file */
function wsFormingBlocks(text) {
  const out = []; const t = String(text || '');
  const re = /```([^\n`]*)\n/g; let m;
  while ((m = re.exec(t))) {
    const info = m[1].trim();
    const start = m.index + m[0].length;
    const end = t.indexOf('\n```', start - 1);
    const close = end === -1 ? -1 : end;
    const code = close === -1 ? t.slice(start) : t.slice(start, close);
    const pathTok = info.split(/\s+/).reverse().find(x => /[\w-]\.[A-Za-z0-9]+$/.test(x) && !/^\.\./.test(x) && !x.startsWith('/'));
    if (pathTok) out.push({ path: pathTok.replace(/^[`'"]|[`'"]$/g, ''), lang: info.split(/\s+/)[0] || '', code, lines: code ? code.replace(/\n$/, '').split('\n').length : 0, open: close === -1 });
    if (close === -1) break;
    re.lastIndex = close + 4;
  }
  return out;
}
function _wsFormingHtml(uuid) {
  const st = typeof AGENT_FEED !== 'undefined' ? AGENT_FEED.get(uuid) : null;
  if (!st || !st.jobId || !st.text) return '';
  const landed = new Set(((WSURF.data && WSURF.data.files) || []).filter(f => f.at && f.at >= (st.updated || 0) - 120000).map(f => f.path));
  const blocks = wsFormingBlocks(st.text).filter(b => b.open || !landed.has(b.path));
  if (!blocks.length) return '';
  const a = st.anchor;
  return `<div class="ws-forming-h"><span class="al-dot${st.generating ? ' on' : ''}"></span>${escapeHtml(st.provider || 'the agent')} is ${st.generating ? 'writing' : 'done writing'}${st.mutations != null ? ` · ${st.mutations} mutations` : ''}${a ? ` · ⌖ ${escapeHtml(a.path || a.tag || '')}` : ''}</div>`
    + blocks.map(b => { const [dir, base] = _wsSplitPath(b.path); const tail = b.code.replace(/\n$/, '').split('\n').slice(-14);
      return `<div class="ws-card ws-forming${b.open ? ' open' : ''}"><div class="ws-head"><span class="ws-chev">${b.open ? '✎' : '✓'}</span><span class="ws-ico">${_wsIcon(b.path)}</span>
        <span class="ws-name">${escapeHtml(base)}</span><span class="ws-dir">${escapeHtml(dir.replace(/\/$/, ''))}</span><span class="ws-grow"></span>
        <span class="ws-chip ${b.open ? 'ws-st-writing' : 'ws-st-proposed'}">${b.open ? 'writing' : 'written — landing'}</span><span class="ws-plus">${b.lines} line${b.lines === 1 ? '' : 's'}</span></div>
        ${b.open ? `<div class="ws-diff">${tail.map((l, i) => `<div class="ws-ln ws-add"><span class="ws-g"></span><span class="ws-g">${b.lines - tail.length + i + 1}</span><span class="ws-s">+</span><span class="ws-t">${escapeHtml(l) || ' '}</span></div>`).join('')}</div>` : ''}</div>`; }).join('');
}
/** repaint only the forming cards — every frame of the feed, never the whole surface */
function wsLivePaint(uuid) {
  const el = document.getElementById('ws-forming');
  if (!el || WSURF.uuid !== uuid) return;
  el.innerHTML = _wsFormingHtml(uuid);
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
