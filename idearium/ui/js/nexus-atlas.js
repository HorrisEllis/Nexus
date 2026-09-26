// idearium/ui/js/nexus-atlas.js — the nexus repo's Home is the Nexus atlas.
// comp_id: nexus.idearium.ui.nexus-atlas
//
// §0.39.263 — James: "nexus is the repo, not 15, just nexus, then clicking inside of
// it, shows the rest of them in … the nexus atlas, wire that completely in as the
// homepage of the nexus repo, and everything referenced can be opened in idearium,
// including each system."
//
// The page is docs/atlases/nexus-atlas.md from the immutable base, rendered, with:
//   · every system as a block at the top (click → that system's repo)
//   · live numbers joined under each "### <system>" module heading
//   · every reference — `code spans`, file-tree lines, ports, "*-atlas.md" — resolved
//     by POST /api/nexus-self/resolve and made clickable:
//       system → its repo · file → its repo's editor, opened on that file
//       doc (.md) → rendered here, its own references clickable too · dir → its repo's Files
//     A reference the snapshot does not have stays plain text, marked, never guessed.
// Loaded after app.js; uses its api(), escapeHtml(), toast(), enterRepoDetail(), …

const NX_DOC_TRAIL = [];   // docs opened from the atlas, for the breadcrumb

// ── a small markdown renderer: what the atlases use, nothing more ──────────
function _nxInline(s) {
  let h = escapeHtml(s);
  // §0.39.264 — code spans are set aside before emphasis runs, so a `docs/*-phasemap.spec`
  // keeps its asterisk instead of turning into <em> inside the reference
  const codes = [];
  h = h.replace(/`([^`]+)`/g, (_m, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, '$1<em>$2</em>');
  h = h.replace(/\u0000(\d+)\u0000/g, (_m, i) => `<code class="nx-ref" data-ref="${codes[+i]}">${codes[+i]}</code>`);
  h = h.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, t, u) => /^https?:/.test(u) ? `<a href="${u}" target="_blank" rel="noopener">${t}</a>` : `<span class="nx-ref" data-ref="${u}">${t}</span>`);
  h = h.replace(/(^|[\s(])(:\d{4,5})(?=[\s),.;]|$)/g, (_m, a, p) => `${a}<span class="nx-ref" data-ref="${p}">${p}</span>`);
  h = h.replace(/(^|[\s(])([\w.-]+-atlas\.md)(?=[\s),.;]|$)/g, (_m, a, f) => `${a}<span class="nx-ref" data-ref="${f}">${f}</span>`);
  return h;
}
// a code block: the first path-looking token of each line becomes a reference. In a
// file-tree block an indented entry is under the directory above it, so its reference
// is the full path (guardian/ → lib/ → node-registry.js = guardian/lib/node-registry.js).
// A root line named after the whole tree (NEXUS/) is not part of any path.
function _nxCode(lines) {
  const stack = [];   // [{ indent, name }] — the open directories
  return lines.map(l => {
    const m = /^(\s*)([\w.@-]+(?:\/[\w.@<>-]*)*\/?|[\w.-]+\.\w+)(\s.*)?$/.exec(l);
    if (!(m && (m[2].includes('/') || /\.\w{1,6}$/.test(m[2])) && !/^https?:/.test(m[2]))) return escapeHtml(l);
    const indent = m[1].length, tok = m[2];
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    const full = stack.map(d => d.name).join('') + tok;
    if (tok.endsWith('/')) stack.push({ indent, name: /^nexus\/$/i.test(tok) && !stack.length ? '' : tok });
    return `${escapeHtml(m[1])}<span class="nx-ref" data-ref="${escapeHtml(full)}">${escapeHtml(tok)}</span>${escapeHtml(m[3] || '')}`;
  }).join('\n');
}
function nxMarkdown(md) {
  const src = String(md || '').replace(/<!--[\s\S]*?-->/g, '').split('\n');
  const out = []; let i = 0;
  const cells = (row) => row.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
  while (i < src.length) {
    const line = src[i];
    if (/^```/.test(line)) {
      const buf = []; i++;
      while (i < src.length && !/^```/.test(src[i])) buf.push(src[i++]);
      i++; out.push(`<pre class="nx-pre">${_nxCode(buf)}</pre>`); continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const n = h[1].length, text = h[2].trim();
      const ref = n === 3 && /^[\w.-]+$/.test(text) ? ` data-ref="${escapeHtml(text)}" data-module="${escapeHtml(text)}"` : '';
      out.push(`<h${n} class="nx-h nx-h${n}"${ref}>${_nxInline(text)}</h${n}>`); i++; continue;
    }
    if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) { out.push('<hr class="nx-hr">'); i++; continue; }
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < src.length && /^\s*\|[\s:|-]+\|\s*$/.test(src[i + 1])) {
      const head = cells(line); i += 2; const rows = [];
      while (i < src.length && /^\s*\|.*\|\s*$/.test(src[i])) rows.push(cells(src[i++]));
      out.push(`<table class="nx-table"><thead><tr>${head.map(c => `<th>${_nxInline(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${_nxInline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    if (/^\s*>/.test(line)) {
      const buf = []; while (i < src.length && /^\s*>/.test(src[i])) buf.push(src[i++].replace(/^\s*>\s?/, ''));
      out.push(`<blockquote class="nx-quote">${_nxInline(buf.join(' '))}</blockquote>`); continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line); const buf = [];
      while (i < src.length && /^\s*([-*]|\d+\.)\s+/.test(src[i])) buf.push(src[i++].replace(/^\s*([-*]|\d+\.)\s+/, ''));
      out.push(`<${ordered ? 'ol' : 'ul'} class="nx-list">${buf.map(b => `<li>${_nxInline(b)}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`); continue;
    }
    if (!line.trim()) { i++; continue; }
    const buf = []; while (i < src.length && src[i].trim() && !/^(#{1,6}\s|```|\s*\||\s*>|\s*([-*]|\d+\.)\s|\s*---+\s*$)/.test(src[i])) buf.push(src[i++]);
    if (!buf.length) buf.push(src[i++]);
    out.push(`<p class="nx-p">${_nxInline(buf.join(' '))}</p>`);
  }
  return out.join('\n');
}

// ── references: resolve every one on the page in a single request ─────────
async function nxWireRefs(root) {
  const els = [...root.querySelectorAll('[data-ref]')];
  const refs = [...new Set(els.map(e => e.dataset.ref))];
  if (!refs.length) return {};
  let map = {};
  try { map = (await api('/api/nexus-self/resolve', { method: 'POST', body: JSON.stringify({ refs }) }, 15000)).refs || {}; }
  catch (e) { console.warn('[nexus-atlas] resolve failed:', e.message); return {}; }
  for (const el of els) {
    const hit = map[el.dataset.ref];
    // a path the snapshot does not have is marked; a plain term (sigma, AX-013) simply is not a reference
    if (!hit) { if (!el.dataset.module && /\/|\.\w{1,6}$/.test(el.dataset.ref)) { el.classList.add('nx-unres'); el.title = 'not in the snapshot'; } continue; }
    el.classList.add('nx-link', `nx-${hit.kind}`);
    el.title = hit.kind === 'nexus' ? 'the nexus repo' : hit.kind === 'system' ? `open nexus/${hit.system}` : `${hit.path} · in nexus/${hit.system}${hit.alternatives ? ` (also: ${hit.alternatives.join(', ')})` : ''}`;
    el.onclick = (ev) => { ev.preventDefault(); ev.stopPropagation(); nexusOpenRef(hit); };
  }
  return map;
}

function _nxRepoFor(system) { return API_REPOS.find(r => r.nexusSelf && r.nexusSelf.role === 'system' && r.nexusSelf.system === system) || null; }
function _nxParent() { return API_REPOS.find(r => r.nexusSelf && r.nexusSelf.role === 'parent') || null; }
// §0.39.265 — James: "why not combine nexus and nexus core?" They are one repo
// now: nexus/core (everything the systems share) is where you work — Files,
// Agent, Spec… — and its Home is the Nexus atlas. The old parent record stays
// as the index behind it; it is used only until core has synced once.
function _nxMain() { return _nxRepoFor('core') || _nxParent(); }
function _nxIsMain(r) { return !!(r && r.nexusSelf && (r.nexusSelf.system === 'core' || (r.nexusSelf.role === 'parent' && !_nxRepoFor('core')))); }

function _nxEnter(uuid) {
  if (!REPO_DETAIL_OPEN) enterRepoDetail(uuid); else selectApiRepo(uuid);
}

/** open whatever a reference points at, inside idearium */
async function nexusOpenRef(hit) {
  if (!hit) return;
  if (hit.kind === 'nexus') return nexusAtlasHome();
  if (hit.kind === 'doc') return nexusOpenDoc(hit.path);
  const repo = hit.repoUuid ? API_REPOS.find(r => r.uuid === hit.repoUuid) : _nxRepoFor(hit.system);
  if (!repo) { toast(`nexus/${hit.system} is not synced yet — sync the nexus repo first`, 'err'); return; }
  NX_DOC_TRAIL.length = 0;
  _nxEnter(repo.uuid);
  if (hit.kind === 'system') return;
  setRepoSubtab('files');
  if (hit.kind === 'file') return openApiRepoFile(repo.uuid, hit.path);
  if (hit.kind === 'dir') {
    const f = document.getElementById('repo-tree-filter') || document.getElementById('api-tree-filter');
    if (f) { f.value = hit.path + '/'; f.dispatchEvent(new Event('input', { bubbles: true })); }
    toast(`${hit.path}/ — in nexus/${hit.system}`);
  }
}

/** a doc (.md) from the atlas: rendered on the nexus Home, its references live too */
async function nexusOpenDoc(p) {
  const parent = _nxMain();
  if (!parent) { toast('the nexus repo is not synced yet', 'err'); return; }
  if (!CURRENT_API_REPO || CURRENT_API_REPO.uuid !== parent.uuid) _nxEnter(parent.uuid);
  if (CURRENT_REPO_SUBTAB !== 'home') setRepoSubtab('home');
  if (NX_DOC_TRAIL[NX_DOC_TRAIL.length - 1] !== p) NX_DOC_TRAIL.push(p);
  const el = document.getElementById('repo-subtab-home');
  el.innerHTML = `<div class="detail-empty">loading ${escapeHtml(p)}…</div>`;
  let r;
  try { r = await api(`/api/nexus-self/file?path=${encodeURIComponent(p)}`, {}, 15000); }
  catch (e) { el.innerHTML = `<div class="detail-empty">${escapeHtml(e.message)}</div>`; return; }
  const crumbs = [`<span class="nx-link" onclick="nexusAtlasHome()">nexus atlas</span>`, ...NX_DOC_TRAIL.map((d, i) => i === NX_DOC_TRAIL.length - 1 ? `<b>${escapeHtml(d.split('/').pop())}</b>` : `<span class="nx-link" onclick="nexusDocBack(${i})">${escapeHtml(d.split('/').pop())}</span>`)];
  el.innerHTML = `<div class="nx-crumbs">${crumbs.join(' › ')} <span class="nx-dim">· read-only, snapshot ${escapeHtml(String(r.snapshot || '').slice(0, 8))} · nexus/${escapeHtml(r.system)}</span>
      <button class="action-btn" style="float:right" onclick='nexusOpenRef(${JSON.stringify({ kind: 'file', system: r.system, path: r.path })})'>open in editor</button></div>
    <div class="nx-doc">${/\.md$/i.test(p) ? nxMarkdown(r.content) : `<pre class="nx-pre">${escapeHtml(r.content)}</pre>`}</div>`;
  nxToc(el.querySelector('.nx-doc'));
  nxWireRefs(el);
}
function nexusDocBack(i) { const p = NX_DOC_TRAIL[i]; NX_DOC_TRAIL.length = i; nexusOpenDoc(p); }
function nexusAtlasHome() {
  NX_DOC_TRAIL.length = 0;
  const parent = _nxMain(); if (!parent) return;
  if (!CURRENT_API_REPO || CURRENT_API_REPO.uuid !== parent.uuid) return _nxEnter(parent.uuid);
  if (CURRENT_REPO_SUBTAB !== 'home') return setRepoSubtab('home');
  renderRepoHome(parent);
}

const _nxN = (n) => (n === null || n === undefined) ? '—' : (typeof n === 'number' && !Number.isInteger(n) ? n.toFixed(2) : String(n));
function _nxSysStrip(s) {
  const U = s.now || {};
  const bits = [
    `${_nxN(s.fileCount)} files`, `${s.versions} version(s)`,
    s.phases ? `phases ${s.phases.done}/${s.phases.total}` : null,
    U.symbols !== undefined ? `${_nxN(U.symbols)} symbols` : null,
    U.nexusResolution !== undefined ? `resolution ${_nxN(U.nexusResolution)}` : (U.resolution !== undefined ? `resolution ${_nxN(U.resolution)}` : null),
    s.port ? `:${s.port}` : null,
  ].filter(Boolean);
  return bits.join(' · ');
}

/** the nexus repo's Home: the atlas, wired */
async function renderNexusAtlasHome(repo, el) {
  if (NX_DOC_TRAIL.length) return nexusOpenDoc(NX_DOC_TRAIL[NX_DOC_TRAIL.length - 1]);
  el.innerHTML = `<div class="detail-empty">loading the Nexus atlas…</div>`;
  let a;
  try { a = await api('/api/nexus-self/atlas', {}, 20000); }
  catch (e) { el.innerHTML = `<div class="detail-empty">${escapeHtml(e.message)}</div>`; return; }
  if (CURRENT_API_REPO?.uuid !== repo.uuid || CURRENT_REPO_SUBTAB !== 'home' || NX_DOC_TRAIL.length) return;   // a doc opened meanwhile owns the panel
  const bySys = Object.fromEntries(a.systems.map(s => [s.system, s]));
  const ag = a.aggregate;
  const blocks = a.systems.map(s => `
    <div class="repo-block nx-sys${s.repoUuid ? '' : ' nx-unsynced'}" onclick='nexusOpenRef(${JSON.stringify({ kind: 'system', system: s.system, repoUuid: s.repoUuid })})' title="${s.repoUuid ? `open nexus/${escapeHtml(s.system)}` : 'not synced yet'}">
      <div class="repo-block-head"><span class="repo-block-icon">⌥</span><span class="repo-block-name">${escapeHtml(s.system)}</span></div>
      <div class="repo-block-desc">${escapeHtml(_nxSysStrip(s))}</div>
      <div class="repo-block-meta">${s.atlasDoc ? `<span class="nx-link" onclick='event.stopPropagation();nexusOpenDoc(${JSON.stringify(s.atlasDoc)})'>atlas ›</span>` : '<span class="nx-dim">no atlas doc</span>'}</div>
    </div>`).join('');
  el.innerHTML = `
    <div class="ds"><div class="ds-label">nexus · ${a.systems.length} systems · immutable snapshot ${escapeHtml(String(a.snapshot || '—').slice(0, 12))}</div>
      <div class="ds-mono">${ag ? `${ag.totalFiles} files parsed across ${ag.systemCount} synced system(s) · ${escapeHtml(Object.entries(ag.byLanguage || {}).sort((x, y) => y[1] - x[1]).slice(0, 6).map(([k, n]) => `${k} ${n}`).join(' · '))}` : 'no system synced yet'}${a.understanding ? `\nunderstanding ${new Date(a.understanding.at).toLocaleString()}${a.understanding.improved && a.understanding.improved.length ? ` · improved: ${escapeHtml(a.understanding.improved.join(', '))}` : ''}${a.understanding.regressed && a.understanding.regressed.length ? ` · regressed: ${escapeHtml(a.understanding.regressed.join(', '))}` : ''}` : ''}</div>
      <div class="action-row"><button class="action-btn" onclick="nexusSelfSync()">sync now</button>${a.otherAtlases.map(p => `<button class="action-btn" onclick='nexusOpenDoc(${JSON.stringify(p)})'>${escapeHtml(p.split('/').pop())}</button>`).join('')}</div></div>
    <div class="nx-sys-grid">${blocks}</div>
    <div class="nx-doc" id="nx-atlas-doc">${a.doc ? nxMarkdown(a.doc.content) : `<div class="detail-empty">${escapeHtml(a.docError || 'no atlas document')}</div>`}</div>
    <details class="nx-ops"><summary>snapshot · understanding · system graph · compartments · applied changes</summary><div id="nx-ops-body"><div class="detail-empty">loading…</div></div></details>`;
  // live numbers under each module heading of the document, and (§0.39.264)
  // the way into that system's own atlas — "open the nested"
  for (const h of el.querySelectorAll('#nx-atlas-doc h3[data-module]')) {
    const name = h.dataset.module;
    const s = bySys[name] || bySys[{ 'ollama': 'ollama-bridge' }[name]];
    if (!s) continue;
    const strip = document.createElement('div');
    strip.className = 'nx-live';
    strip.innerHTML = `live · ${escapeHtml(_nxSysStrip(s))}${s.atlasDoc ? ` · <span class="nx-link nx-nested" data-doc="${escapeHtml(s.atlasDoc)}" title="${escapeHtml(s.atlasDoc)}">open its atlas ›</span>` : ''} · <span class="nx-link nx-nested-repo" title="open nexus/${escapeHtml(s.system)}">open the repo ›</span>`;
    const nested = strip.querySelector('.nx-nested');
    if (nested) nested.onclick = (ev) => { ev.stopPropagation(); nexusOpenDoc(nested.dataset.doc); };
    strip.querySelector('.nx-nested-repo').onclick = (ev) => { ev.stopPropagation(); nexusOpenRef({ kind: 'system', system: s.system, repoUuid: s.repoUuid }); };
    h.after(strip);
  }
  nxToc(el.querySelector('#nx-atlas-doc'));
  const ops = el.querySelector('details.nx-ops');
  ops.addEventListener('toggle', () => { if (ops.open && typeof _nexusOpsInto === 'function') _nexusOpsInto(document.getElementById('nx-ops-body'), repo); }, { once: true });
  await nxWireRefs(el);
}

/**
 * nxToc(docEl) — §0.39.264: a contents list of the document's sections (h2, and
 * the h3 modules under them) at its top; each entry scrolls to its section.
 * The atlas is long now — this is how it is read without scrolling blind.
 */
function nxToc(docEl) {
  if (!docEl) return;
  const hs = [...docEl.querySelectorAll('h2.nx-h, h3.nx-h')];
  if (hs.length < 4) return;
  const toc = document.createElement('div');
  toc.className = 'nx-toc';
  let html = '<div class="nx-dim" style="font-size:10px;letter-spacing:.08em">CONTENTS</div>';
  hs.forEach((h, i) => {
    h.id = h.id || `nx-sec-${i}`;
    html += `<div class="nx-toc-${h.tagName.toLowerCase()}" style="padding-left:${h.tagName === 'H3' ? 14 : 0}px"><span class="nx-link" data-to="${h.id}">${escapeHtml(h.textContent)}</span></div>`;
  });
  toc.innerHTML = html;
  toc.querySelectorAll('[data-to]').forEach(a => { a.onclick = () => { const t = document.getElementById(a.dataset.to); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }; });
  docEl.prepend(toc);
}

/** a system repo's atlas document, rendered with live references, for its Home */
async function nxSystemAtlasDoc(target, docPath) {
  if (!target) return;
  if (!docPath) { target.innerHTML = '<div class="ds-mono">this system has no hand-written atlas in docs/atlases/ — the machine atlas below is all there is</div>'; return; }
  try {
    const r = await api(`/api/nexus-self/file?path=${encodeURIComponent(docPath)}`, {}, 15000);
    target.innerHTML = `<div class="nx-doc">${nxMarkdown(r.content)}</div>`;
    nxToc(target.querySelector('.nx-doc'));
    nxWireRefs(target);
  } catch (e) { target.textContent = e.message; }
}
