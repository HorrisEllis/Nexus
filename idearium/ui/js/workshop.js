/*
 * idearium/ui/js/workshop.js — THE SPEC WORKSHOP, the full writer (0.39.354 WS7). The page: ui/workshop.html.
 * Map: docs/2026-10-02-workshop-codex-rewind-phasemap.spec (WS7_the_full_workshop)
 * James: "needs to be a full workshop. like a full document writter. emerge. like we talked about. animated, alive, like
 * void, like not a small little ui,fully featured," · "needs to be enterprise grade. feed the pipeline".
 *
 * Three surfaces, one script:
 *   the start   — the template picker (0.39.357 RS5, js/template-picker.js): + CUSTOM / MANUAL, every template the quick
 *                 spec offers and his saved ones, previewed; titled, started from nothing / an idea / a library
 *                 document / a repo's spec, in a mode. His workshops as cards.
 *   the writer  — one document: every section a heading and its text, kept as he types (debounced, per section);
 *                 the outline (jump, move, remove, restore); the PARTS (WS6: MINIMUM · MODS · COMPONENTS, from the spec
 *                 engine's blocks) — a missing part is one click to add, and drafted unless the mode is manual;
 *                 the agent in three MODES; its proposals, which reach a section only when he says yes.
 *   the pipeline — SEND TO THE PIPELINE: save → plan (the repo's agent, or derived from the sections) → its phases in
 *                 order → build the next one. The routes are the repo's own (/spec/plan, /spec/build, /plan) — the
 *                 same the Spec tab's build bar uses (ui/js/living-spec.js).
 * Server: /api/workshop (idearium/lib/workshop.js). Capitals by his rule; the document can be read AS TYPED.
 */
(function () {
'use strict';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const enc = encodeURIComponent;
const Q = new URLSearchParams(location.search);
const KIND = { section: 'DRAFT', 'open-loops': 'OPEN LOOP', questions: 'QUESTION', 'what-ifs': 'WHAT IF', d20: 'D20', 'reverse-chain': 'REVERSE CHAIN', inspiration: 'INSPIRATION' };
const TIERS = { minimum: ['MINIMUM', 'WHAT A BUILD CAN START FROM'], mods: ['MODS', 'ADDED WHEN THE SPEC NEEDS THEM'], components: ['COMPONENTS', 'THE REGISTRY AND ITS CONTRACT'] };
const MODE_NOTE = {
  manual: 'MANUAL — YOU WRITE. THE AGENT ONLY CHECKS WHAT IS MISSING OR UNDECIDED.',
  assisted: 'ASSISTED — THE AGENT PROPOSES, PART BY PART. NOTHING ENTERS THE SPEC WITHOUT YOUR YES.',
  stretched: 'STRETCHED — THE AGENT CARRIES YOUR IDEA THROUGH EVERY PART. STILL NOTHING ENTERS WITHOUT YOUR YES.',
};
const MODE_FEEDS = { manual: ['open-loops', 'questions'], assisted: ['section', 'open-loops', 'questions'], stretched: ['section', 'open-loops', 'questions'] };
const AGENT_MS = 330000;
const PLAN_POLL_MS = 3000, PLAN_WAIT_MS = 6 * 60 * 1000;

let W = null, PARTS = [], SEL = null, SRC = null, ALL = [], BUSY = false, STOP = false, timer = null, BLOCK_KEY = '';
const PEND = new Map();   // section id → { title?, body? } typed, not yet kept
const SEEN = new Set();
let PIPE = null;          // { repo, path, mapPath, runId, poll, t0, plan }

// ── plumbing ──────────────────────────────────────────────────────────────────────────────────────────────────────
function toast(t, bad) { const d = document.createElement('div'); d.className = 'toast' + (bad ? ' bad' : ''); d.textContent = t; $('toasts').appendChild(d); while ($('toasts').children.length > 4) $('toasts').firstChild.remove(); setTimeout(() => d.remove(), bad ? 7000 : 3400); }
async function api(path, body, ms = body === undefined ? 20000 : 30000) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms);
  let r;
  try { r = await fetch(path, { signal: ac.signal, ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) }); }
  catch (e) { throw new Error(e.name === 'AbortError' ? `NO ANSWER IN ${Math.round(ms / 1000)}S` : 'IDEARIUM IS NOT ANSWERING — IS IT RUNNING?'); }
  finally { clearTimeout(t); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) { const e = new Error(j.error || `HTTP ${r.status}`); e.status = r.status; e.code = j.code || null; e.body = j; throw e; }
  return j;
}
function setState(kind, msg) {
  const el = $('state');
  if (!kind) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden'); el.classList.toggle('bad', kind === 'bad');
  el.innerHTML = kind === 'bad' ? `<b>THE WORKSHOP IS UNREACHABLE</b>${esc(msg)}<br><button class="btn small" id="retry">TRY AGAIN</button>` : `<b>OPENING THE WORKSHOP</b>${esc(msg || 'READING…')}`;
  const r = $('retry'); if (r) r.onclick = () => boot();
}
/** a dialog in the page's own look — the text (with value) or true; null when cancelled */
function dialog({ q, note = '', value = null, ok = 'OK' }) {
  return new Promise((done) => {
    const back = document.createElement('div'); back.className = 'sheet-back';
    back.innerHTML = `<div class="dlg glass" role="dialog" aria-modal="true" aria-label="${esc(q)}"><div class="q">${esc(q)}</div>${note ? `<div class="note">${esc(note)}</div>` : ''}${value !== null ? `<input class="field" style="width:100%;margin-bottom:12px" maxlength="160" value="${esc(value)}">` : ''}<div class="row" style="justify-content:flex-end"><button class="btn small ghost" data-no>CANCEL</button><button class="btn small" data-ok>${esc(ok)}</button></div></div>`;
    document.body.appendChild(back);
    const input = back.querySelector('input'); (input || back.querySelector('[data-ok]')).focus(); if (input) input.select();
    const end = (v) => { back.remove(); done(v); };
    back.querySelector('[data-no]').onclick = () => end(null);
    back.querySelector('[data-ok]').onclick = () => end(input ? (input.value.trim() || null) : true);
    back.addEventListener('keydown', (e) => { if (e.key === 'Escape') end(null); if (e.key === 'Enter' && input) end(input.value.trim() || null); });
    back.addEventListener('click', (e) => { if (e.target === back) end(null); });
  });
}
const words = (t) => String(t || '').trim().split(/\s+/).filter(Boolean).length;
const sec = (id) => W && W.sections.find(s => s.id === id);
const partOf = (id) => PARTS.find(p => p.sectionId === id);
function take(d) {
  if (d.workshop) W = d.workshop;
  if (Array.isArray(d.parts)) PARTS = d.parts;
  // what he typed while the request was out stays his
  for (const [id, v] of PEND) { const s = sec(id); if (s) Object.assign(s, v); }
}

// ── the stations ──────────────────────────────────────────────────────────────────────────────────────────────────
function stations() {
  // IDEA → SPEC → ARCHITECT → BLUEPRINT → REPO → COS, true to state (BLUEPRINT and COS are mapped, not built)
  const s = [
    ['IDEA', 'stIdea', (W && W.source && W.source.kind === 'idea' ? 'done ' : '') + 'link', 'THE VOID — WHERE THE IDEAS ARE'],
    ['SPEC', null, 'now', null],
    ['ARCHITECT', W ? 'stArch' : null, W ? 'link' : '', W ? 'NEXT: LAY THIS SPEC OUT AS COMPONENTS' : 'OPENS ONCE THE SPEC IS STARTED'],
    ['BLUEPRINT', null, 'soon', 'MAPPED (BP1), NOT BUILT YET'],
    ['REPO', W && W.repoUuid ? 'stRepo' : null, W && W.repoUuid ? 'done link' : '', W && W.repoUuid ? 'OPEN THE REPO IN IDEARIUM — ITS SPEC TAB' : 'THE REPO THIS SPEC IS SAVED INTO'],
    ['COS', null, 'soon', 'MAPPED, NOT BUILT YET'],
  ];
  $('stations').innerHTML = s.map(([n, id, c, tip], i) => `${i ? `<span class="flow${i > 2 ? ' dim' : ''}"></span>` : ''}<span class="st ${c}"${id ? ` id="${id}" tabindex="0"` : ''}${tip ? ` title="${tip}"` : ''}><span class="i">0${i + 1}</span>${n}</span>`).join('');
  const bind = (id, go) => { const el = $(id); if (el) { el.onclick = go; el.onkeydown = (e) => { if (e.key === 'Enter') go(); }; } };
  bind('stIdea', () => flush().then(() => { location.href = 'void.html'; }));
  bind('stArch', () => flush().then(() => { location.href = `architect.html?from=workshop:${enc(W.uuid)}`; }));
  bind('stRepo', () => openRepo('spec'));
}

// ── the start ─────────────────────────────────────────────────────────────────────────────────────────────────────
// §0.39.357 RS5 — the start is the template picker; a source picked in the sheet becomes its START FROM
let TP = null;
async function showStart(fromParam = null) {
  W = null; PARTS = []; history.replaceState(null, '', location.pathname); document.title = 'THE SPEC WORKSHOP';
  document.body.classList.remove('focus');
  $('start').classList.remove('hidden'); $('writer').classList.add('hidden');
  ['saveBtn', 'sendBtn'].forEach(id => $(id).classList.add('hidden')); $('saved').textContent = '';
  stations();
  if (!TP) TP = window.TemplatePicker({ api, esc, toast, dialog, onCreate: ({ from, title, template, mode }) => create(from, title, { template, mode }), onSource: pickSource });
  TP.load();
  try { const d = await api('/api/workshop'); ALL = d.workshops || []; $('wsCount').textContent = ALL.length || ''; paintWorkshops(); setState(null); }
  catch (e) { setState('bad', e.message); return; }
  setTimeout(() => $('beginTitle').focus(), 300);
  try { SRC = await api('/api/workshop/sources'); } catch (e) { SRC = { ideas: [], library: [], repos: [] }; toast(`SOURCES DID NOT LOAD: ${e.message}`, true); }
  $('nIdea').textContent = SRC.ideas.length; $('nLibrary').textContent = SRC.library.length; $('nRepo').textContent = SRC.repos.length;
  // a promoted idea (?from=idea:<uuid>) opens the picker with the idea as its START FROM (RS5: the picker first)
  if (fromParam) { const i = SRC.ideas.find(x => x.uuid === fromParam.id); TP.setFrom({ kind: 'idea', id: fromParam.id, label: i ? String(i.text).slice(0, 80) : fromParam.id }); }
}
function paintWorkshops() {
  const q = $('wsFilter').value.trim().toLowerCase();
  const list = ALL.filter(w => !q || String(w.title).toLowerCase().includes(q));
  const FROM = { idea: 'FROM THE VOID', library: 'FROM THE LIBRARY', repo: "FROM A REPO'S SPEC", blank: 'BLANK' };
  $('wsGrid').innerHTML = list.length ? list.map((w, i) => `<div class="wscard emerge" style="--i:${Math.min(i, 12)}" tabindex="0" data-id="${esc(w.uuid)}">
      <div class="t">${esc(w.title)}</div>
      <div class="m">${FROM[(w.source && w.source.kind) || 'blank'] || ''} · ${w.sections} SECTIONS · ${new Date(w.updatedAt).toLocaleDateString()}</div>
      <div class="f"><span class="tag m">${esc(String(w.mode || 'assisted').toUpperCase())}</span>${w.open ? `<span class="tag m">${w.open} OPEN</span>` : ''}${w.specPath ? `<span class="tag g">SAVED · ${esc(w.specPath)}</span>` : '<span class="tag y">NOT SAVED YET</span>'}</div></div>`).join('')
    : `<div class="empty">${ALL.length ? 'NOTHING MATCHES' : 'NONE YET — TYPE WHAT YOU ARE SPECCING ABOVE, OR START FROM AN IDEA IN THE VOID'}</div>`;
  $('wsGrid').querySelectorAll('.wscard').forEach(el => { el.onclick = () => open(el.dataset.id); el.onkeydown = (e) => { if (e.key === 'Enter') open(el.dataset.id); }; });
}
$('wsFilter').oninput = paintWorkshops;
async function create(from, title, { template = null, mode = null } = {}) {
  // a blank spec with no template needs a title; a template or a source names it when he does not
  if (!title && (!from || from.kind === 'blank') && (!template || template === 'custom')) { $('beginTitle').focus(); toast('SAY WHAT YOU ARE SPECCING FIRST'); return; }
  try { const d = await api('/api/workshop', { from, title: title || null, ...(template ? { template } : {}), ...(mode ? { mode } : {}) }); await open(d.workshop.uuid); }
  catch (e) { toast(`NOT OPENED: ${e.message}`, true); }
}
/** a source: a sheet over the start, with a filter — the pick becomes the new spec's START FROM */
function pickSource(kind) {
  if (!SRC) { toast('STILL READING WHAT YOU HAVE…'); return; }
  const C = ['NORMAL', 'CREATIVE', 'OUTSIDE THE BOX', 'NOVEL', 'OUTLIER'], S = ['STABLE', 'SHAKY', 'RISKY', 'DANGEROUS', 'UNSTABLE'];
  const items = kind === 'idea' ? SRC.ideas.map(i => ({ id: i.uuid, t: i.text, m: i.void ? `${C[i.void.creativity] || ''} · ${S[i.void.stability] || ''}` : (i.phase || ''), cls: i.void && i.void.tension >= 2 ? 'wild' : i.void && i.void.tension <= -2 ? 'unsteady' : '' }))
    : kind === 'library' ? SRC.library.map(r => ({ id: r.sha, t: r.title, m: `${r.family || ''} · ${r.sections} SECTIONS${r.repoUuid ? ' · HAS A REPO' : ''}` }))
    : SRC.repos.map(r => ({ id: r.uuid, t: r.name, m: r.specFiles.length ? r.specFiles.join(', ') : 'NO .SPEC YET — STARTS EMPTY' }));
  const Q2 = { idea: 'FROM THE VOID', library: 'FROM THE SPEC LIBRARY', repo: "FROM A REPO'S SPEC" }[kind];
  const EMPTY = { idea: 'NO IDEAS YET. <a class="btn small" href="void.html">OPEN THE VOID</a>', library: 'NOTHING IMPORTED YET. <a class="btn small" href="spec-library.html">OPEN THE SPEC LIBRARY</a>', repo: 'NO REPOS YET — SAVE A SPEC AND ONE IS MADE FOR IT.' }[kind];
  let pick = null;
  const back = document.createElement('div'); back.className = 'sheet-back'; back.id = 'picker';
  back.innerHTML = `<div class="sheet glass" role="dialog" aria-modal="true" aria-label="${Q2}"><div class="q">${Q2} <span class="lbl" style="margin:0"><span class="n">${items.length}</span></span><button class="btn small ghost x" data-no title="CLOSE">CLOSE</button></div>
    ${items.length ? `<input class="field" id="pickQ" placeholder="FILTER…" aria-label="filter"><div class="pick" id="pickList" role="listbox"></div>
    <div class="row" style="justify-content:flex-end"><button class="btn" id="pickGo" disabled title="START THE NEW SPEC FROM IT">USE IT →</button></div>` : `<div class="empty" style="padding:30px 0">${EMPTY}</div>`}</div>`;
  document.body.appendChild(back);
  const close = () => back.remove();
  back.querySelector('[data-no]').onclick = close;
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  back.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  if (!items.length) return;
  const paint = () => {
    const q = $('pickQ').value.toLowerCase();
    $('pickList').innerHTML = items.filter(x => !q || String(x.t).toLowerCase().includes(q)).slice(0, 400).map(x => `<div class="it ${pick === x.id ? 'on' : ''}" role="option" aria-selected="${pick === x.id}" tabindex="0" data-id="${esc(x.id)}"><span>${esc(x.t)}</span><span class="m ${x.cls || ''}">${esc(x.m || '')}</span></div>`).join('') || '<div class="it empty">NOTHING MATCHES</div>';
    $('pickList').querySelectorAll('.it[data-id]').forEach(it => {
      const choose = () => { pick = it.dataset.id; $('pickGo').disabled = false; paint(); };
      it.onclick = choose; it.ondblclick = () => { choose(); go(); };
      it.onkeydown = (e) => { if (e.key === 'Enter') { choose(); go(); } else if (e.key === ' ') { e.preventDefault(); choose(); } };
    });
  };
  const go = () => { if (!pick) return; const x = items.find(i => i.id === pick); close(); TP.setFrom({ kind, id: pick, label: x ? String(x.t).slice(0, 80) : pick }); $('beginBtn').focus(); };
  $('pickQ').oninput = paint; $('pickGo').onclick = go; paint(); $('pickQ').focus();
}

// ── the writer ────────────────────────────────────────────────────────────────────────────────────────────────────
async function open(id) {
  setState('loading');
  let d;
  try { d = await api(`/api/workshop/${enc(id)}`); }
  catch (e) { setState(null); toast(`NOT OPENED: ${e.message}`, true); return showStart(); }
  setState(null); PEND.clear(); W = d.workshop; PARTS = d.parts || []; BLOCK_KEY = '';
  history.replaceState(null, '', `?id=${enc(W.uuid)}`);
  $('start').classList.add('hidden'); $('writer').classList.remove('hidden');
  ['saveBtn', 'sendBtn'].forEach(x => $(x).classList.remove('hidden'));
  if (!SEL || !sec(SEL)) SEL = (W.sections[0] || {}).id || null;
  W.proposals.forEach(p => SEEN.add(p.uuid));
  paint();
}
function paint() {
  if (!W) return;
  document.title = `${String(W.title).toUpperCase()} — THE SPEC WORKSHOP`;
  stations(); savedNote(); paintOutline(); paintParts(); paintDoc(); paintAgent(); paintProposals(); paintStats();
  const h = $('hist'); h.innerHTML = (W.history || []).slice(-30).reverse().map(x => `<div>${new Date(x.at).toLocaleTimeString()} · ${esc(x.what)}</div>`).join('') || '<div>NOTHING YET</div>';
}
function savedNote() {
  const dirty = !!(W && (!W.savedAt || W.updatedAt > W.savedAt + 1500 || PEND.size));
  $('saved').textContent = !W ? '' : W.savedAt ? `SAVED TO ${W.specPath} · ${new Date(W.savedAt).toLocaleTimeString()}${dirty ? ' · CHANGED SINCE' : ''}` : 'NOT SAVED TO A REPO YET';
  $('saved').classList.toggle('dirty', dirty);
}
function paintStats() {
  const all = W.sections.map(s => s.body).join(' '), n = words(all);
  $('sWords').textContent = n.toLocaleString(); $('sRead').textContent = Math.max(n ? 1 : 0, Math.round(n / 200)); $('sSecs').textContent = W.sections.length;
}

function paintOutline() {
  $('olCount').textContent = W.sections.length;
  $('outline').innerHTML = W.sections.map((s, i) => {
    const full = !!String(s.body || '').trim(), agent = /agent/.test(String(s.by || ''));
    return `<div class="ol ${s.id === SEL ? 'on' : ''}" role="option" aria-selected="${s.id === SEL}" tabindex="0" data-id="${esc(s.id)}">
      <span class="no">${String(i + 1).padStart(2, '0')}</span><span class="dot ${full ? (agent ? 'agent' : 'full') : ''}"></span><span class="t">${esc(s.title)}</span>
      <span class="mv"><button data-mv="up" ${i === 0 ? 'disabled' : ''} title="MOVE UP">↑</button><button data-mv="down" ${i === W.sections.length - 1 ? 'disabled' : ''} title="MOVE DOWN">↓</button></span></div>`;
  }).join('') || '<div class="empty">NO SECTIONS — ADD ONE, OR ADD A PART BELOW</div>';
  $('outline').querySelectorAll('.ol').forEach(el => {
    el.onclick = (e) => { const mv = e.target.closest('[data-mv]'); if (mv) { e.stopPropagation(); move(el.dataset.id, mv.dataset.mv); return; } jump(el.dataset.id); };
    el.onkeydown = (e) => { if (e.key === 'Enter') jump(el.dataset.id); if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); move(el.dataset.id, e.key === 'ArrowUp' ? 'up' : 'down'); } };
  });
  const rm = W.removed || [];
  $('removed').innerHTML = rm.length ? `<div class="lbl" style="margin-top:16px">REMOVED <span class="n">${rm.length} · KEPT</span></div>${rm.map(s => `<div class="ol"><span class="t">${esc(s.title)}</span><button class="btn small ghost" data-r="${esc(s.id)}" title="BRING IT BACK">RESTORE</button></div>`).join('')}` : '';
  $('removed').querySelectorAll('[data-r]').forEach(b => b.onclick = () => update({ sections: [{ restore: b.dataset.r }] }));
}
function paintParts() {
  const min = PARTS.filter(p => p.tier === 'minimum'), have = min.filter(p => p.filled).length;
  $('minNote').textContent = PARTS.length ? `MINIMUM ${have} OF ${min.length}${have === min.length && min.length ? ' — A BUILD CAN START FROM THIS' : ' — WHAT A BUILD NEEDS TO START'}` : 'THE SPEC ENGINE IS STILL LOADING ITS PARTS';
  $('minGauge').classList.toggle('g', have === min.length && min.length > 0);
  $('minGauge').firstElementChild.style.width = `${min.length ? Math.round(have / min.length * 100) : 0}%`;
  const manual = (W.mode || 'assisted') === 'manual';
  $('parts').innerHTML = Object.keys(TIERS).map(t => {
    const ps = PARTS.filter(p => p.tier === t); if (!ps.length) return '';
    return `<div class="tier"><div class="th" title="${TIERS[t][1]}"><span>${TIERS[t][0]}</span><span>${ps.filter(p => p.filled).length}/${ps.length}</span></div>${ps.map(p => `<div class="part ${p.sectionId ? 'has' : 'missing'}" data-part="${esc(p.id)}" tabindex="0" title="${p.sectionId ? 'GO TO IT' : 'NOT IN THE SPEC YET'}">
      <span class="dot ${p.filled ? 'full' : ''}"></span><span class="t">${esc(String(p.title).toUpperCase())}</span>${p.sectionId ? `<span class="w">${p.words ? `${p.words} W` : 'EMPTY'}</span>` : `<button class="add" data-add="${esc(p.id)}" title="${manual ? 'ADD THIS PART AS A SECTION' : 'ADD THIS PART, AND ASK THE AGENT FOR A DRAFT OF IT'}">${manual ? '+ ADD' : '+ ADD · DRAFT'}</button>`}</div>`).join('')}</div>`;
  }).join('');
  $('parts').querySelectorAll('.part').forEach(el => {
    const p = PARTS.find(x => x.id === el.dataset.part);
    const go = () => p.sectionId ? jump(p.sectionId) : addPart(p, (W.mode || 'assisted') !== 'manual');   // the mode now, not when painted
    el.onclick = (e) => { e.stopPropagation(); go(); };
    el.onkeydown = (e) => { if (e.key === 'Enter') go(); };
  });
}

// the document: built when its sections change; patched in place while he types (focus and caret are never lost)
function paintDoc() {
  const ti = $('docTitle'); if (document.activeElement !== ti) ti.value = W.title;
  const src = W.source || {}, FROM = { idea: 'FROM THE VOID', library: 'FROM THE LIBRARY', repo: "FROM A REPO'S SPEC", blank: 'BLANK' };
  $('docMeta').innerHTML = `<span>${FROM[src.kind] || 'BLANK'}${src.title ? ` · <b>${esc(src.title)}</b>` : ''}</span>${W.template && W.template.id !== 'custom' ? `<span>TEMPLATE · <b>${esc(W.template.label || W.template.id)}</b>${W.template.version ? ` V${W.template.version}` : ''}</span>` : ''}<span>${W.specPath ? `SPEC · <b>${esc(W.specPath)}</b>` : 'NOT IN A REPO YET'}</span><span>STARTED ${new Date(W.createdAt || W.updatedAt).toLocaleDateString()}</span>`;
  const key = W.sections.map(s => s.id).join('|');
  if (key !== BLOCK_KEY) {
    BLOCK_KEY = key;
    $('blocks').innerHTML = W.sections.map((s, i) => `<div class="blk ${s.id === SEL ? 'on' : ''}" data-id="${esc(s.id)}" id="blk-${esc(s.id)}">
        <div class="hd"><span class="dot"></span><input class="h" maxlength="160" aria-label="section title"><span class="pt"></span>
          <span class="acts"><button class="btn small m" data-act="draft" title="ASK THE AGENT FOR A DRAFT OF THIS SECTION">✎</button><button class="btn small ghost" data-act="up" ${i === 0 ? 'disabled' : ''} title="MOVE UP">↑</button><button class="btn small ghost" data-act="down" ${i === W.sections.length - 1 ? 'disabled' : ''} title="MOVE DOWN">↓</button><button class="btn small ghost" data-act="rm" title="REMOVE — IT IS KEPT AND CAN BE RESTORED">✕</button></span></div>
        <textarea class="b" maxlength="20000" rows="2" aria-label="section text" placeholder="WRITE THIS SECTION — OR ASK THE AGENT FOR A DRAFT, AND TAKE WHAT YOU WANT OF IT"></textarea>
        <div class="ft"><span class="by"></span><span class="limit"></span></div></div>
      <div class="add-here"><button data-after="${esc(s.id)}" title="ADD A SECTION HERE">+ SECTION HERE</button></div>`).join('')
      || `<div class="empty" style="padding:40px 0;text-align:center">AN EMPTY SPEC. ADD ITS FIRST SECTION — OR ADD THE MINIMUM PARTS FROM THE LEFT.<br><br><button class="btn" id="firstSec">+ FIRST SECTION</button></div>`;
    $('blocks').querySelectorAll('.blk').forEach(bindBlock);
    $('blocks').querySelectorAll('[data-after]').forEach(b => b.onclick = () => addSection(b.dataset.after));
    const f = $('firstSec'); if (f) f.onclick = () => addSection(null);
  }
  for (const s of W.sections) {
    const el = $(`blk-${s.id}`); if (!el) continue;
    const h = el.querySelector('.h'), b = el.querySelector('.b');
    if (document.activeElement !== h && (PEND.get(s.id) || {}).title == null) h.value = s.title;
    if (document.activeElement !== b && (PEND.get(s.id) || {}).body == null) { b.value = s.body || ''; size(b); }
    const p = partOf(s.id);
    el.querySelector('.pt').textContent = p ? `${TIERS[p.tier][0]} · ${String(p.title).toUpperCase()}` : '';
    el.querySelector('.dot').className = `dot ${String(s.body || '').trim() ? (/agent/.test(String(s.by || '')) ? 'agent' : 'full') : ''}`;
    const by = el.querySelector('.by'); by.textContent = s.by ? `BY ${String(s.by).toUpperCase()} · ${new Date(s.updatedAt).toLocaleString()}` : ''; by.classList.toggle('agent', /agent/.test(String(s.by || '')));
    el.classList.toggle('on', s.id === SEL);
    limit(el);
  }
}
function size(t) { t.style.height = 'auto'; t.style.height = `${Math.max(64, t.scrollHeight + 2)}px`; }
function limit(el) { const n = el.querySelector('.b').value.length, l = el.querySelector('.limit'); l.textContent = n > 15000 ? `${n} / 20000` : ''; l.className = 'limit' + (n >= 20000 ? ' over' : n > 18000 ? ' near' : ''); }
function bindBlock(el) {
  const id = el.dataset.id, h = el.querySelector('.h'), b = el.querySelector('.b');
  el.addEventListener('focusin', () => select(id));
  const typed = (field, v) => { const p = PEND.get(id) || {}; p[field] = v; PEND.set(id, p); el.querySelector('.by').textContent = 'EDITING…'; savedNote(); clearTimeout(timer); timer = setTimeout(flush, 800); };
  h.oninput = () => { typed('title', h.value); const o = $('outline').querySelector(`.ol[data-id="${CSS.escape(id)}"] .t`); if (o) o.textContent = h.value; };
  b.oninput = () => { typed('body', b.value); size(b); limit(el); liveStats(); };
  h.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); b.focus(); } };
  b.onblur = h.onblur = () => flush();
  el.querySelectorAll('[data-act]').forEach(btn => btn.onclick = (e) => {
    e.stopPropagation(); const a = btn.dataset.act;
    if (a === 'draft') { select(id); ask('section'); }
    else if (a === 'up' || a === 'down') move(id, a);
    else if (a === 'rm') removeSection(id);
  });
}
function liveStats() { const n = W.sections.reduce((a, s) => a + words(((PEND.get(s.id) || {}).body != null ? PEND.get(s.id).body : s.body)), 0); $('sWords').textContent = n.toLocaleString(); $('sRead').textContent = Math.max(n ? 1 : 0, Math.round(n / 200)); }
function select(id) {
  if (SEL === id) return; SEL = id;
  document.querySelectorAll('.blk').forEach(b => b.classList.toggle('on', b.dataset.id === id));
  document.querySelectorAll('.ol').forEach(o => { const on = o.dataset.id === id; o.classList.toggle('on', on); o.setAttribute('aria-selected', on); });
  paintAgent(); paintProposals();
}
function jump(id) {
  select(id); const el = $(`blk-${id}`); if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => el.querySelector('.b').focus({ preventScroll: true }), 250);
}
function landed(id) { const el = $(`blk-${id}`); if (el) { el.classList.remove('landed'); void el.offsetWidth; el.classList.add('landed'); } }

/** keeps what was typed: every section with a pending edit, in one request */
function flush() {
  clearTimeout(timer);
  if (!W || !PEND.size) return Promise.resolve();
  const sent = [...PEND.entries()].map(([id, v]) => ({ id, ...v })); PEND.clear();
  return api(`/api/workshop/${W.uuid}`, { sections: sent }).then(d => {
    take(d); $('sKept').textContent = `KEPT · ${new Date().toLocaleTimeString()}`;
    for (const s of sent) { const el = $(`blk-${s.id}`); if (el && !PEND.has(s.id)) { const x = sec(s.id); el.querySelector('.by').textContent = x && x.by ? `BY ${String(x.by).toUpperCase()} · ${new Date(x.updatedAt).toLocaleString()}` : ''; } }
    savedNote(); paintParts(); paintStats();
  }).catch(e => {
    for (const s of sent) if (!PEND.has(s.id)) { const { id, ...v } = s; PEND.set(id, v); }   // not lost: it goes again
    toast(`NOT KEPT: ${e.message}`, true); savedNote();
  });
}
async function update(body) {
  await flush();
  try { take(await api(`/api/workshop/${W.uuid}`, body)); if (!sec(SEL)) SEL = (W.sections[W.sections.length - 1] || {}).id || null; paint(); return true; }
  catch (e) { toast(`NOT DONE: ${e.message}`, true); return false; }
}
async function addSection(after, title = null, part = null) {
  const t = title || await dialog({ q: 'NEW SECTION', value: '', ok: 'ADD' }); if (!t) return null;
  const before = new Set(W.sections.map(s => s.id));
  if (!await update({ sections: [{ add: true, title: t, after: after || (W.sections[W.sections.length - 1] || {}).id || null, ...(part ? { part } : {}) }] })) return null;
  const made = W.sections.find(s => !before.has(s.id)); if (made) { SEL = null; jump(made.id); }
  return made || null;
}
async function addPart(p, draft) {
  const made = await addSection(null, p.title, p.id);
  if (made && draft) await ask('section', made.id);
}
const move = (id, dir) => update({ sections: [{ id, move: dir }] });
async function removeSection(id) {
  const s = sec(id); if (!s) return;
  if (await dialog({ q: `REMOVE ${String(s.title).toUpperCase()}?`, note: 'IT IS KEPT UNDER REMOVED AND CAN BE RESTORED.', ok: 'REMOVE' })) update({ sections: [{ id, remove: true }] });
}
$('addSec').onclick = () => addSection(SEL);
$('docTitle').onchange = () => { const t = $('docTitle').value.trim(); if (t && t !== W.title) update({ title: t }); };
$('docTitle').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); $('docTitle').blur(); } };

// ── the agent ─────────────────────────────────────────────────────────────────────────────────────────────────────
function paintAgent() {
  const mode = W.mode || 'assisted';
  document.querySelectorAll('.mode').forEach(b => { const on = b.dataset.mode === mode; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); b.disabled = BUSY; });
  $('modeNote').textContent = MODE_NOTE[mode];
  const s = sec(SEL);
  document.querySelectorAll('#feeds [data-k]').forEach(b => {
    b.classList.toggle('hidden', !MODE_FEEDS[mode].includes(b.dataset.k));
    b.disabled = BUSY || (b.dataset.k === 'section' && !s);
    if (b.dataset.k === 'section') b.textContent = s ? `✎ DRAFT ${String(s.title).toUpperCase().slice(0, 28)}` : '✎ DRAFT THIS SECTION';
  });
  $('carry').classList.toggle('hidden', mode !== 'stretched');
  $('carryBtn').disabled = BUSY || !PARTS.length;
}
document.querySelectorAll('.mode').forEach(b => b.onclick = async () => { if (BUSY || b.dataset.mode === W.mode) return; if (await update({ mode: b.dataset.mode })) toast(MODE_NOTE[W.mode]); });
document.querySelectorAll('#feeds [data-k]').forEach(b => b.onclick = () => ask(b.dataset.k));
let _meterT = null;
function live(on, text) {
  BUSY = on; $('live').classList.toggle('hidden', !on); if (text) $('liveText').textContent = text;
  clearInterval(_meterT); $('meter').textContent = '';
  if (on) { const t0 = Date.now(); _meterT = setInterval(() => { $('meter').textContent = `${Math.round((Date.now() - t0) / 1000)}S`; }, 1000); }
  $('stopBtn').classList.toggle('hidden', !on || !CARRYING);
  paintAgent();
}
/** one ask of the agent — its lines come back as proposals */
async function ask(kind, sectionId = SEL, quiet = false) {
  if (!W || (BUSY && !CARRYING)) return null;
  await flush();
  const s = sec(sectionId);
  live(true, kind === 'section' ? `THE AGENT IS DRAFTING ${String((s && s.title) || '').toUpperCase()}` : `THE AGENT IS LOOKING FOR ${KIND[kind]}S`);
  try {
    const d = await api(`/api/workshop/${W.uuid}/feed`, { kind, sectionId }, AGENT_MS); take(d);
    if (!quiet) toast(`${d.added.length} PROPOSAL${d.added.length === 1 ? '' : 'S'}`);
    return d;
  } catch (e) { toast(e.message, true); return null; }
  finally { if (!CARRYING) live(false); paint(); }
}
// STRETCHED — carry it through every part: each missing part added, each empty part drafted, one at a time, stoppable
let CARRYING = false;
$('carryBtn').onclick = async () => {
  if (BUSY) return; CARRYING = true; STOP = false; live(true, 'CARRYING IT THROUGH EVERY PART');
  let n = 0;
  try {
    for (const p0 of PARTS.slice()) {
      if (STOP) break;
      const p = PARTS.find(x => x.id === p0.id) || p0; if (p.filled) continue;
      let id = p.sectionId;
      if (!id) { const made = await addSection(null, p.title, p.id); if (!made) break; id = made.id; }
      if (W.proposals.some(x => x.status === 'open' && x.kind === 'section' && x.sectionId === id)) continue;   // a draft already waits for him
      live(true, `CARRYING IT THROUGH · ${String(p.title).toUpperCase()}`);
      const d = await ask('section', id, true); if (!d) break; n += d.added.length;
    }
  } finally { CARRYING = false; live(false); paint(); toast(`${STOP ? 'STOPPED · ' : ''}${n} DRAFT${n === 1 ? '' : 'S'} — EACH ONE WAITS FOR YOUR YES`); }
};
$('stopBtn').onclick = () => { STOP = true; $('liveText').textContent = 'STOPPING AFTER THIS PART…'; };

function paintProposals() {
  const showDone = $('showDone').checked;
  const list = W.proposals.slice().reverse().filter(p => showDone || p.status === 'open');
  $('propCount').textContent = `${W.proposals.filter(p => p.status === 'open').length} OPEN`;
  const cur = sec(SEL);
  $('props').innerHTML = list.length ? list.map(p => {
    const target = p.kind === 'section' && sec(p.sectionId) ? sec(p.sectionId) : cur;
    const into = p.status !== 'open' && p.into ? (sec(p.into) || {}).title || p.into : null;
    return `<div class="prop ${p.status} ${SEEN.has(p.uuid) ? 'seen' : ''}">
      <div class="k"><span>${KIND[p.kind] || esc(p.kind)}</span>${p.kind === 'section' && sec(p.sectionId) ? `<span class="d">FOR ${esc(String(sec(p.sectionId).title).toUpperCase())}</span>` : ''}${p.domain ? `<span class="d">ROLLED ${p.roll}: ${esc(p.domain)}</span>` : ''}${p.status !== 'open' ? `<span class="d">${esc(String(p.status).toUpperCase())}${into ? ` → ${esc(String(into).toUpperCase())}` : ''}</span>` : ''}</div>
      <div class="x">${esc(p.text)}</div>
      <div class="a">${p.status === 'open' ? `${target ? `<button class="btn small" data-p="${p.uuid}" data-a="append" data-s="${esc(target.id)}" title="ADD IT TO THE END OF THE SECTION">INTO ${esc(String(target.title).toUpperCase().slice(0, 22))}</button>` : ''}${p.kind === 'section' && target ? `<button class="btn small" data-p="${p.uuid}" data-a="replace" data-s="${esc(target.id)}" title="REPLACE THE SECTION'S TEXT — THE OLD TEXT IS KEPT">REPLACE</button>` : ''}<button class="btn small" data-p="${p.uuid}" data-a="new" title="MAKE IT A SECTION OF ITS OWN">AS NEW SECTION</button><button class="btn small ghost" data-p="${p.uuid}" data-a="dismiss" title="SET IT ASIDE">DISMISS</button>`
        : `<button class="btn small ghost" data-p="${p.uuid}" data-a="reopen" title="OPEN IT AGAIN">REOPEN</button>`}</div></div>`;
  }).join('') : `<div class="empty">${W.proposals.length ? 'NOTHING OPEN — TICK DECIDED TO SEE THE REST' : 'ASK THE AGENT ABOVE. ITS PROPOSALS LAND HERE, AND ONLY WHAT YOU ACCEPT GOES INTO THE SPEC.'}</div>`;
  list.forEach(p => SEEN.add(p.uuid));
  $('props').querySelectorAll('[data-p]').forEach(b => b.onclick = () => decide(b.dataset.p, b.dataset.a, b.dataset.s));
}
$('showDone').onchange = paintProposals;
async function decide(pid, a, sid) {
  await flush();
  const body = a === 'dismiss' || a === 'reopen' ? { action: a } : { action: 'accept', mode: a, sectionId: sid || SEL };
  if (a === 'new') { const p = W.proposals.find(x => x.uuid === pid); const t = await dialog({ q: 'TITLE FOR THE NEW SECTION', value: p && p.kind !== 'section' ? (KIND[p.kind] || 'SECTION') : 'SECTION', ok: 'ADD' }); if (!t) return; body.title = t; }
  try {
    const d = await api(`/api/workshop/${W.uuid}/proposal/${pid}`, body); take(d);
    if (d.section) SEL = d.section.id;
    paint(); if (d.section) { jump(d.section.id); landed(d.section.id); }
  } catch (e) { toast(e.message, true); }
}

// ── save, and the pipeline ────────────────────────────────────────────────────────────────────────────────────────
async function save(quiet = false) {
  if (!W) return null; await flush(); $('saveBtn').disabled = true;
  try {
    const d = await api(`/api/workshop/${W.uuid}/save`, {}, 120000); take(d); paint();
    if (!quiet) toast(`SAVED TO ${d.specPath}${d.madeRepo === 'new' ? ' — IN A NEW REPO' : d.madeRepo ? " — IN ITS LIBRARY DOCUMENT'S REPO" : ''}`);
    return d;
  } catch (e) { if (quiet) throw e; toast(`NOT SAVED: ${e.message}`, true); return null; }
  finally { $('saveBtn').disabled = false; }
}
$('saveBtn').onclick = () => save();
function openRepo(subtab) {
  const repo = (PIPE && PIPE.repo) || (W && W.repoUuid); if (!repo) return;
  if (window.opener && !window.opener.closed) { window.opener.postMessage({ type: 'nexus:repo.open', repoUuid: repo, label: W ? W.title : '', subtab }, '*'); toast(subtab === 'phases' ? 'OPENED IN IDEARIUM — ITS PHASES' : 'OPENED IN IDEARIUM — THE SPEC TAB'); }
  else toast(`ITS REPO: ${repo} — OPEN IDEARIUM TO FOLLOW IT`);
}

const STEPS = ['pSave', 'pPlan', 'pPhases', 'pBuild'];
function openPipe() {
  closePipe();
  const back = document.createElement('div'); back.className = 'sheet-back'; back.id = 'pipeBack';
  back.innerHTML = `<div class="pipe glass" role="dialog" aria-modal="true" aria-label="the pipeline">
    <div class="row"><div class="q">THE PIPELINE</div><button class="btn small ghost" id="pClose" style="margin-left:auto" title="CLOSE — WHAT IS RUNNING KEEPS RUNNING">CLOSE</button></div>
    <div class="sub2">${esc(String(W.title).toUpperCase())} · SAVE → PLAN → PHASES → BUILD · BOTTOM-UP, ONE PHASE AT A TIME, A SNAPSHOT BEFORE EACH</div>
    <div class="steps"><div class="line" id="pLine"></div>
      ${['SAVED', 'PLANNED', 'PHASES', 'BUILDING'].map((t, i) => `<div class="step" id="${STEPS[i]}"><div class="o">${i + 1}</div><div class="t">${t}</div><div class="s"></div></div>`).join('')}</div>
    <div class="pmsg hidden" id="pMsg"></div>
    <div class="phl hidden" id="pList"></div>
    <div class="pacts" id="pActs"></div></div>`;
  document.body.appendChild(back);
  $('pClose').onclick = closePipe;
  back.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePipe(); });
  $('pClose').focus();
}
function closePipe() { const b = $('pipeBack'); if (b) b.remove(); if (PIPE) { clearTimeout(PIPE.poll); PIPE.poll = null; } }
function step(i, state, text) {
  const el = $(STEPS[i]); if (!el) return;
  el.className = `step ${state || ''}`; el.querySelector('.o').textContent = state === 'done' ? '✓' : state === 'bad' ? '!' : String(i + 1);
  if (text != null) el.querySelector('.s').textContent = text;
  const done = STEPS.filter(id => $(id) && $(id).classList.contains('done')).length;
  $('pLine').style.width = `${Math.max(0, Math.min(3, done - 1 + (state === 'run' ? .5 : 0))) / 3 * 75}%`;
}
function pmsg(text, kind) { const el = $('pMsg'); if (!el) return; el.className = `pmsg ${kind || ''}${text ? '' : ' hidden'}`; el.textContent = text || ''; }
function acts(list) {
  const el = $('pActs'); if (!el) return;
  el.innerHTML = list.map((a, i) => `<button class="btn ${a.cls || 'small'}" data-i="${i}" ${a.disabled ? 'disabled' : ''} title="${esc(a.tip || a.label)}">${esc(a.label)}</button>`).join('');
  el.querySelectorAll('[data-i]').forEach(b => b.onclick = () => list[+b.dataset.i].go());
}
const OPEN_ACT = () => ({ label: 'OPEN IN IDEARIUM', tip: "THE REPO'S PHASES IN IDEARIUM", go: () => openRepo('phases') });

async function sendToPipeline() {
  if (!W) return;
  openPipe(); step(0, 'run', 'WRITING THE SPEC INTO ITS REPO'); acts([]);
  let d;
  try { d = await save(true); }
  catch (e) { step(0, 'bad', e.message); pmsg(`NOT SAVED: ${e.message}`, 'bad'); acts([{ label: 'TRY AGAIN', go: sendToPipeline }]); return; }
  if (PIPE) clearTimeout(PIPE.poll);
  PIPE = { repo: d.repoUuid, path: d.specPath, mapPath: null, runId: null, poll: null };
  step(0, 'done', d.specPath);
  await planStage(false);
}
async function planStage(replan) {
  if (!PIPE) return;
  step(1, 'run', replan ? 'PLANNING IT AGAIN' : 'READING ITS PLAN'); pmsg(''); acts([]);
  let p;
  try { p = await api(`/api/repos/${enc(PIPE.repo)}/spec/plan?path=${enc(PIPE.path)}`, undefined, 30000); }
  catch (e) { step(1, 'bad', e.message); pmsg(`THE PLAN COULD NOT BE READ: ${e.message}`, 'bad'); acts([{ label: 'TRY AGAIN', go: () => planStage(replan) }]); return; }
  PIPE.mapPath = p.mapPath; PIPE.exists = p.exists;
  if (p.exists && !replan) {
    step(1, 'done', `${p.phases.length} PHASES · ${p.mapPath}`);
    if (p.specChanged) pmsg('THE SPEC CHANGED SINCE IT WAS PLANNED. PLAN IT AGAIN TO CARRY THE CHANGES INTO ITS PHASES — THE OLD PLAN IS KEPT IN VERSIONIUM — OR BUILD FROM THE PLAN YOU HAVE.', 'y');
    return phasesStage(p);
  }
  let r;
  try { r = await api(`/api/repos/${enc(PIPE.repo)}/spec/plan`, { path: PIPE.path, replan: !!p.exists }, 60000); }
  catch (e) { step(1, 'bad', e.message); pmsg(`NOT PLANNED: ${e.message}`, 'bad'); acts([{ label: 'PLAN FROM THE SPEC NOW', tip: 'NO AGENT: ONE PHASE PER SECTION, ITS LAYER READ FROM THE SECTION', go: derive }, { label: 'TRY AGAIN', go: () => planStage(replan) }]); return; }
  PIPE.runId = r.runId; PIPE.t0 = Date.now();
  step(1, 'run', `THE REPO'S AGENT IS SPLITTING IT INTO PHASES · ${r.mapPath}`);
  pmsg(`A SNAPSHOT WAS TAKEN (${String(r.snapshot || '').slice(0, 12)}). THE REPO'S AGENT IS WRITING ${r.mapPath} — CHUNKED, BOTTOM-UP. IF IT WRITES NONE, THE PLAN IS DERIVED FROM YOUR SECTIONS.`);
  acts([{ label: 'PLAN FROM THE SPEC NOW', tip: 'DO NOT WAIT FOR THE AGENT: ONE PHASE PER SECTION', go: derive }, OPEN_ACT()]);
  watchPlan();
}
function watchPlan() {
  if (!PIPE) return; clearTimeout(PIPE.poll);
  PIPE.poll = setTimeout(async () => {
    if (!PIPE || !$('pipeBack')) return;
    try {
      const pl = await api(`/api/repos/${enc(PIPE.repo)}/plan?map=${enc(PIPE.mapPath)}`, undefined, 30000);
      const rows = (pl.planning || []).filter(x => x.runId === PIPE.runId);
      const end = rows.find(x => x.state === 'replied') || rows.find(x => x.state === 'failed' || x.state === 'blocked');
      if (end) {
        const p = await api(`/api/repos/${enc(PIPE.repo)}/spec/plan?path=${enc(PIPE.path)}`, undefined, 30000);
        if (p.exists && p.valid) {
          step(1, 'done', `${p.phases.length} PHASES · ${end.plannedBy === 'derived' ? 'DERIVED FROM THE SPEC' : end.plannedBy === 'agent-reply' ? "FROM THE AGENT'S REPLY" : 'BY THE AGENT'}`);
          pmsg(end.note ? String(end.note).toUpperCase() : `PLANNED: ${p.phases.length} PHASES IN ${p.mapPath}.`, 'ok');
          return phasesStage(p);
        }
        step(1, 'bad', String(end.state).toUpperCase());
        pmsg(`THE PLAN DID NOT LAND: ${String(end.error || (p.problems || []).slice(0, 3).join('; ') || end.state).toUpperCase()}`, 'bad');
        acts([{ label: 'PLAN FROM THE SPEC NOW', go: derive }, { label: 'ASK THE AGENT AGAIN', go: () => planStage(true) }, OPEN_ACT()]);
        return;
      }
    } catch (e) { pmsg(`STILL WAITING — THE LAST CHECK FAILED: ${e.message}`, 'y'); }
    if (Date.now() - PIPE.t0 > PLAN_WAIT_MS) {
      step(1, 'bad', 'NO PLAN AFTER 6 MINUTES');
      pmsg('THE AGENT HAS NOT FINISHED. IT MAY BE WAITING FOR APPROVAL IN THE AGENT TAB. PLAN FROM THE SPEC NOW, OR KEEP WAITING.', 'y');
      acts([{ label: 'PLAN FROM THE SPEC NOW', go: derive }, { label: 'KEEP WAITING', go: () => { PIPE.t0 = Date.now(); step(1, 'run', 'WAITING FOR THE AGENT'); watchPlan(); } }, OPEN_ACT()]);
      return;
    }
    $(STEPS[1]).querySelector('.s').textContent = `THE REPO'S AGENT IS PLANNING · ${Math.round((Date.now() - PIPE.t0) / 1000)}S`;
    watchPlan();
  }, PLAN_POLL_MS);
}
async function derive() {
  if (!PIPE) return; clearTimeout(PIPE.poll);
  step(1, 'run', 'DERIVING THE PLAN FROM THE SECTIONS'); acts([]);
  try {
    const r = await api(`/api/repos/${enc(PIPE.repo)}/spec/plan`, { path: PIPE.path, derive: true, replan: true }, 60000);
    step(1, 'done', `${r.phases} PHASES · DERIVED FROM THE SPEC`); pmsg(`${r.mapPath}: ${r.phases} PHASES, ONE PER SECTION, BOTTOM-UP. REFINE THEM IN IDEARIUM'S PHASES WHENEVER YOU WANT.`, 'ok');
    const p = await api(`/api/repos/${enc(PIPE.repo)}/spec/plan?path=${enc(PIPE.path)}`, undefined, 30000);
    phasesStage(p);
  } catch (e) {
    step(1, 'bad', e.message);
    pmsg(`NOT PLANNED: ${e.message}${e.body && e.body.problems && e.body.problems.length ? ` — ${e.body.problems.slice(0, 3).join('; ')}` : ''}`, 'bad');
    acts([{ label: 'ASK THE AGENT', go: () => planStage(PIPE.exists) }, { label: 'BACK TO THE SPEC', go: closePipe }]);
  }
}
function phasesStage(p) {
  PIPE.plan = p;
  const done = (x) => x.status === 'done' || x.status === 'complete';
  const n = p.phases.filter(done).length, next = p.phases.find(x => x.id === p.next);
  if (!p.valid) { step(2, 'bad', 'NOT A VALID BOTTOM-UP MAP'); pmsg(`${p.mapPath} IS NOT A VALID BOTTOM-UP MAP: ${(p.problems || []).slice(0, 4).join(' · ')}`, 'bad'); }
  else step(2, 'done', `${n} OF ${p.phases.length} BUILT${next ? ` · NEXT ${next.key}` : ''}`);
  const list = $('pList'); list.classList.remove('hidden');
  list.innerHTML = p.phases.map((x, i) => `<div class="ph ${done(x) ? 'done' : ''} ${x.id === p.next ? 'next' : ''}" style="--i:${Math.min(i, 20)}">
      <span class="mk">${done(x) ? '✓' : x.id === p.next ? '◉' : '○'}</span><span class="ly">${esc(String(x.layer || '?').toUpperCase())}</span><span class="ky">${esc(x.key)}</span>
      <span class="nm" title="${esc(String(x.does || '').toUpperCase())}">${esc(x.id.split('_').slice(1).join(' ').toUpperCase())}</span>
      <span class="pacts">${done(x) ? '' : `<button class="btn small ghost" data-ph="${esc(x.id)}" title="BUILD THIS PHASE">BUILD</button>`}</span></div>`).join('') || '<div class="it empty">NO PHASES</div>';
  list.querySelectorAll('[data-ph]').forEach(b => b.onclick = () => build(b.dataset.ph));
  const all = p.phases.length && n === p.phases.length;
  if (all) { step(3, 'done', 'EVERY PHASE IS BUILT'); pmsg('EVERY PHASE OF THIS SPEC IS BUILT. PROVE IT IN IDEARIUM.', 'ok'); }
  else if (!step3Busy) step(3, '', next ? `READY · ${next.key} (${String(next.layer || '').toUpperCase()})` : 'NOTHING READY — EACH WAITS ON ONE NOT BUILT');
  acts([
    { label: next ? `BUILD NEXT · ${next.key}` : 'BUILD NEXT PHASE', cls: 'send', disabled: !next || !p.valid || all, tip: 'A SNAPSHOT, THEN THE REPO\'S AGENT BUILDS IT', go: () => build(null) },
    { label: 'PLAN AGAIN', tip: 'ASK THE AGENT TO PLAN IT AGAIN — THE OLD PLAN IS KEPT IN VERSIONIUM', go: () => planStage(true) },
    OPEN_ACT(),
  ]);
}
let step3Busy = false;
async function build(phase) {
  if (!PIPE) return; step3Busy = true;
  step(3, 'run', `A SNAPSHOT, THEN THE AGENT BUILDS ${phase || (PIPE.plan && PIPE.plan.next) || 'THE NEXT PHASE'}`); acts([]);
  try {
    const r = await api(`/api/repos/${enc(PIPE.repo)}/spec/build`, { path: PIPE.path, ...(phase ? { phase } : {}) }, 120000);
    step(3, 'done', `${r.phase} (${String(r.layer || '').toUpperCase()}) · BUILDING`);
    pmsg(`${r.phase} IS BUILDING — SNAPSHOT ${String(r.snapshot || '').slice(0, 12)}${r.targetName ? `, ${String(r.targetName).toUpperCase()}'S AGENT` : ''}. FOLLOW IT IN IDEARIUM'S PLAN PANEL; THE NEXT PHASE IS READY WHEN THIS ONE IS DONE.`, 'ok');
    acts([OPEN_ACT(), { label: 'REFRESH THE PHASES', go: async () => { try { phasesStage(await api(`/api/repos/${enc(PIPE.repo)}/spec/plan?path=${enc(PIPE.path)}`, undefined, 30000)); } catch (e) { toast(e.message, true); } } }, { label: 'BACK TO THE SPEC', go: closePipe }]);
  } catch (e) {
    step(3, 'bad', e.code || e.message);
    pmsg(`NOT BUILT: ${e.message}`, 'bad');
    acts([{ label: 'TRY AGAIN', go: () => build(phase) }, OPEN_ACT()]);
  } finally { step3Busy = false; }
}
$('sendBtn').onclick = sendToPipeline;

// ── the page ──────────────────────────────────────────────────────────────────────────────────────────────────────
let CAPS = true; try { CAPS = localStorage.getItem('workshop.caps') !== 'typed'; } catch (_) {}
function paintCaps() { document.body.classList.toggle('as-typed', !CAPS); $('capsBtn').textContent = CAPS ? 'CAPS' : 'AS TYPED'; $('capsBtn').classList.toggle('on', !CAPS); document.querySelectorAll('.blk .b').forEach(size); }
$('capsBtn').onclick = () => { CAPS = !CAPS; try { localStorage.setItem('workshop.caps', CAPS ? 'caps' : 'typed'); } catch (_) {} paintCaps(); };
$('focusBtn').onclick = () => { document.body.classList.toggle('focus'); $('focusBtn').classList.toggle('on', document.body.classList.contains('focus')); };
const home = async () => { await flush(); closePipe(); showStart(); };
// §0.39.357 RS5 — this spec's sections as a template: opened from a saved template, its next version (the old kept)
$('tplSave').onclick = async () => {
  if (!W) return;
  await flush();
  const fromSaved = W.template && String(W.template.id).startsWith('saved:');
  const label = await dialog({ q: 'SAVE AS TEMPLATE', note: fromSaved ? `KEEP THE NAME TO SAVE THE NEXT VERSION OF ${String(W.template.label || '').toUpperCase()} — THE OLD ONE IS KEPT. A NEW NAME MAKES A NEW TEMPLATE.` : 'ITS SECTIONS, AS THEY ARE NOW, BECOME A TEMPLATE IN THE PICKER (SAVED)', value: fromSaved ? (W.template.label || '') : W.title, ok: 'SAVE' });
  if (!label) return;
  try {
    const same = fromSaved && label === W.template.label;
    const d = await api('/api/workshop/templates', { workshop: W.uuid, ...(same ? {} : { label }) });
    toast(`SAVED AS A TEMPLATE — ${d.template.label} V${d.version}`);
  } catch (e) { toast(`NOT SAVED: ${e.message}`, true); }
};
$('home').onclick = home; $('home').onkeydown = (e) => { if (e.key === 'Enter') home(); };
document.addEventListener('keydown', (e) => {
  if (!W) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
  else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); sendToPipeline(); }
  else if (e.key === 'Escape' && document.body.classList.contains('focus') && !document.querySelector('.sheet-back')) { document.body.classList.remove('focus'); $('focusBtn').classList.remove('on'); }
});
window.addEventListener('beforeunload', () => { if (W && PEND.size) fetch(`/api/workshop/${W.uuid}`, { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sections: [...PEND.entries()].map(([id, v]) => ({ id, ...v })) }) }); });

async function boot() {
  setState('loading'); paintCaps();
  if (Q.get('id')) return open(Q.get('id'));
  const f = Q.get('from');
  if (f && /^idea:.+/.test(f)) return showStart({ kind: 'idea', id: f.slice(5) });   // §0.39.357 RS5 — a promoted idea: the picker first
  if (f && /^(library|repo):.+/.test(f)) {
    const [kind, ...rest] = f.split(':');
    try { const d = await api('/api/workshop', { from: { kind, id: rest.join(':') } }); return open(d.workshop.uuid); }
    catch (e) { toast(`COULD NOT START FROM THAT ${kind.toUpperCase()}: ${e.message}`, true); }
  }
  showStart();
}
window.WORKSHOP = { get W() { return W; }, get PARTS() { return PARTS; }, get PIPE() { return PIPE; }, flush, sendToPipeline };   // for the tests (Clear Glass reads the state)
boot();
})();
