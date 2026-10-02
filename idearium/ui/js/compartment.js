// idearium/ui/js/compartment.js — the Compartment view + recursive tab tree
// component_id: idearium.ui.compartment
//
// §BUILT 2026-09-26 — James: "make the tabs much more recursive, deep and
// expanded fully? interconnected. i want ideas once promoted to move to the
// compartment idea section for brainstorming, problem solving, expanding,
// and improving."
//
// Two surfaces, one data source (GET /api/workbench, lib/idea-workbench.js):
//   1. #view-compartment — idea tree (recursive: spun-out ideas nest under
//      the idea they came from) → the selected idea's four lanes, each a
//      recursive thread of entries, with inbound/outbound links.
//   2. Tab tree — the Compartment tab's dropdown nests idea → child idea →
//      lane as flyouts, and "expand all" (⊞) swaps the tab bar for a full
//      tree rail of every view, every compartment idea, every repo and
//      every repo subtab.
// Loaded after app.js; uses its api(), toast(), escapeHtml(), setView(),
// IDEAS, API_REPOS, CONNECTED, setRepoSubtab(), enterRepoDetail().
//
// §0.39.263 — James: "should not be a compartments tab, repos are compartments …
// move it where it belongs", and: "ideas promoted to specs get a repo." There is no
// Compartment view. The lanes render where the idea lives:
//   · an idea that is a spec has a repo → that repo's Idea tab
//   · an idea that is not a spec yet → its detail in Create › Ideas
// (a .cmp-host in either; nothing here ever creates a repo). The navigator tree
// shows repos only, with the nexus systems nested in nexus.

const WBC = {
  index: null,         // { lanes, tree }
  current: null,       // workbench.show payload for the open idea
  ideaUuid: null,
  lane: 'all',         // 'all' | lane id | 'links'
  collapsed: new Set(),// entry uuids whose children are folded
  linking: null,       // entry uuid waiting for a link target click
  lanes: {
    brainstorm: { label: 'Brainstorm', icon: '✎' },
    problem:    { label: 'Problem solving', icon: '⚠' },
    expand:     { label: 'Expand', icon: '⤢' },
    improve:    { label: 'Improve', icon: '↑' },
  },
};

const _wbEsc = (s) => escapeHtml(s);
const _wbShort = (s, n = 48) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

// ── data ────────────────────────────────────────────────────────────────────
async function loadCompartment() {
  if (!CONNECTED) return;
  try {
    WBC.index = await api('/api/workbench');
    if (WBC.index.lanes) WBC.lanes = WBC.index.lanes;
    renderCompartmentTree();
    renderCompartmentTabMenu();
    renderTabTree();
    const badge = document.getElementById('compartment-count-badge');
    if (badge) badge.textContent = _wbCount(WBC.index.tree) || '';
    if (WBC.ideaUuid) await openCompartmentIdea(WBC.ideaUuid, { keepLane: true, quiet: true });
  } catch (e) { console.warn('[idearium] loadCompartment failed:', e.message); }
}
function _wbCount(nodes) { return (nodes || []).reduce((n, x) => n + 1 + _wbCount(x.children), 0); }

async function openCompartmentIdea(uuid, { lane, keepLane, quiet } = {}) {
  // Link mode armed: clicking another idea (tree, crumb, link chip) links
  // the waiting entry to that idea instead of navigating.
  if (WBC.linking && uuid !== WBC.ideaUuid) {
    const from = WBC.linking; WBC.linking = null;
    return _patchEntry(from, { addLink: uuid });
  }
  if (!quiet) return openIdeaLanes(uuid, { lane });   // 0.39.263 — the lanes live where the idea lives
  WBC.ideaUuid = uuid;
  if (lane) WBC.lane = lane; else if (!keepLane) WBC.lane = 'all';
  try {
    WBC.current = await api(`/api/ideas/${uuid}/workbench`);
  } catch (e) { toast(e.message, 'err'); return; }
  renderCompartmentTree();
  renderCompartmentDetail();
}

async function admitToCompartment(uuid) { return openIdeaLanes(uuid); }

/** the idea's repo if it is a spec (its Idea tab), else the idea in Create › Ideas — the lanes are in both */
function _repoOfIdea(ideaUuid) { return typeof ideaRepoOf === 'function' ? ideaRepoOf(ideaUuid) : null; }
async function openIdeaLanes(ideaUuid, { lane } = {}) {
  WBC.ideaUuid = ideaUuid; WBC.lane = lane || 'all';
  const repo = _repoOfIdea(ideaUuid);
  if (repo) {
    setView('repo');
    if (typeof enterRepoDetail === 'function') enterRepoDetail(repo.uuid);
    setRepoSubtab('idea');
    return;
  }
  setView('ideas');
  if (typeof selectIdea === 'function') selectIdea(ideaUuid);
}

// ── left: recursive idea tree ───────────────────────────────────────────────
function renderCompartmentTree() {
  const el = document.getElementById('cmp-tree');
  if (!el) return;
  const tree = WBC.index?.tree || [];
  const q = (document.getElementById('cmp-filter')?.value || '').toLowerCase();
  if (!tree.length) {
    el.innerHTML = `<div class="detail-empty">nothing in the compartment yet.<br><br>promote a brainstorm, or open an idea and click “work in compartment”.</div>`;
    return;
  }
  const match = (n) => !q || n.text.toLowerCase().includes(q) || (n.children || []).some(match);
  const node = (n, depth) => {
    if (!match(n)) return '';
    const active = n.ideaUuid === WBC.ideaUuid ? ' active' : '';
    const lanes = Object.keys(WBC.lanes).map(l => n.counts.lanes[l] ? `<span class="cmp-lc" title="${_wbEsc(WBC.lanes[l].label)}">${WBC.lanes[l].icon}${n.counts.lanes[l]}</span>` : '').join('');
    return `<div class="cmp-node${active}" style="--d:${depth}" onclick="openCompartmentIdea('${n.ideaUuid}')">
        <span class="cmp-node-branch">${depth ? '└' : '◆'}</span>
        <span class="cmp-node-text${n.missing ? ' missing' : ''}">${_wbEsc(_wbShort(n.text, 60))}</span>
        <span class="cmp-node-lanes">${lanes}${n.counts.open ? `<span class="cmp-open">${n.counts.open} open</span>` : ''}</span>
      </div>${(n.children || []).map(c => node(c, depth + 1)).join('')}`;
  };
  el.innerHTML = tree.map(n => node(n, 0)).join('');
}

// ── right: the idea's lanes ─────────────────────────────────────────────────
function setCompartmentLane(lane) { WBC.lane = lane; renderCompartmentDetail(); }

function renderCompartmentDetail() {
  // the host in the view on screen: a repo's Idea tab, or an idea's detail in Create › Ideas
  const el = document.querySelector('.view.active .cmp-host') || document.querySelector('.cmp-host');
  const d = WBC.current;
  if (!el) return;
  if (!d) { el.innerHTML = `<div class="detail-empty">← pick an idea to work it</div>`; return; }
  const title = document.getElementById('cmp-title');
  if (title) title.textContent = _wbShort(d.idea.text, 60);
  // 0.39.263 — hosted in a repo's Idea tab or an idea's detail, where the idea's text is already shown above
  const inRepo = !!el.closest('#repo-subtab-idea') || !!el.closest('#view-ideas');

  const crumbs = [...(d.path || []), { ideaUuid: d.idea.uuid, text: d.idea.text }]
    .map((p, i, a) => i === a.length - 1
      ? `<span class="cmp-crumb here">${_wbEsc(_wbShort(p.text, 36))}</span>`
      : `<span class="cmp-crumb" onclick="openCompartmentIdea('${p.ideaUuid}')">${_wbEsc(_wbShort(p.text, 36))}</span>`).join('<span class="cmp-crumb-sep">›</span>');

  const count = (l) => _flatten(d.tree[l]).length;
  const laneTabs = [['all', '◎', 'All lanes', Object.keys(WBC.lanes).reduce((n, l) => n + count(l), 0)]]
    .concat(Object.entries(WBC.lanes).map(([id, L]) => [id, L.icon, L.label, count(id)]))
    .concat([['links', '⇄', 'Links', (d.inbound || []).length + (d.outbound || []).length + (d.childIdeas || []).length]])
    .map(([id, icon, label, n]) => `<button class="repo-subtab-btn${WBC.lane === id ? ' active' : ''}" onclick="setCompartmentLane('${id}')">${icon} ${_wbEsc(label)}${n ? ` <span class="cmp-tab-n">${n}</span>` : ''}</button>`).join('');

  let body;
  if (WBC.lane === 'links') body = _renderLinks(d);
  else {
    const lanes = WBC.lane === 'all' ? Object.keys(WBC.lanes) : [WBC.lane];
    body = `<div class="cmp-lanes cols-${lanes.length}">${lanes.map(l => _renderLane(l, d.tree[l] || [])).join('')}</div>`;
  }

  el.innerHTML = `
    <div class="cmp-head">
      <div class="cmp-crumbs">${crumbs}</div>
      ${inRepo ? '' : `<div class="cmp-idea-text">${_wbEsc(d.idea.text)}</div>`}
      <div class="cmp-idea-meta">
        <span class="ic-tag">${_wbEsc(d.idea.phase || 'seed')}</span>
        ${(d.idea.tags || []).map(t => `<span class="ic-tag">#${_wbEsc(t)}</span>`).join('')}
        ${inRepo ? '' : `<button class="action-btn" onclick="setView('ideas');selectIdea('${d.idea.uuid}')">open in Ideas</button>`}
      </div>
      ${WBC.linking ? `<div class="cmp-linking">link mode — click any entry or idea to link it · <button class="action-btn" onclick="cancelCompartmentLink()">cancel</button></div>` : ''}
    </div>
    <div class="repo-subtab-bar cmp-lane-bar">${laneTabs}</div>
    ${body}`;
}

function _flatten(nodes) { return (nodes || []).flatMap(n => [n, ..._flatten(n.children)]); }

function _renderLane(lane, nodes) {
  const L = WBC.lanes[lane];
  return `<div class="cmp-lane" data-lane="${lane}">
    <div class="cmp-lane-head"><span>${L.icon} ${_wbEsc(L.label)}</span><span class="cmp-tab-n">${_flatten(nodes).length}</span></div>
    <div class="cmp-add-row">
      <textarea class="cmp-add" id="cmp-add-${lane}" rows="1" placeholder="${_wbEsc(L.verb ? L.verb + '…' : 'add…')}" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();addCompartmentEntry('${lane}')}"></textarea>
      <button class="action-btn primary" onclick="addCompartmentEntry('${lane}')">+</button>
    </div>
    <div class="cmp-thread">${nodes.length ? nodes.map(n => _renderEntry(n, 0)).join('') : '<div class="cmp-empty">empty</div>'}</div>
  </div>`;
}

function _renderEntry(n, depth) {
  const folded = WBC.collapsed.has(n.uuid);
  const kids = n.children || [];
  const links = (n.links || []).map(ref => {
    const o = (WBC.current.outbound || []).find(x => x.ref === ref);
    if (!o || o.kind === 'missing') return `<span class="cmp-link missing" title="${_wbEsc(ref)}">⇢ missing</span>`;
    const label = o.kind === 'idea' ? `◇ ${_wbShort(o.text, 28)}` : `${WBC.lanes[o.lane]?.icon || '·'} ${_wbShort(o.text, 28)}`;
    return `<span class="cmp-link" onclick="event.stopPropagation();openCompartmentIdea('${o.ideaUuid}')" title="${_wbEsc(o.ideaText || o.text)}">⇢ ${_wbEsc(label)}<span class="cmp-unlink" onclick="event.stopPropagation();unlinkCompartmentEntry('${n.uuid}','${ref}')">×</span></span>`;
  }).join('');
  const inbound = (WBC.current.inbound || []).filter(x => (x.links || []).includes(n.uuid)).length;
  return `<div class="cmp-entry status-${n.status}${WBC.linking ? ' linkable' : ''}" style="--d:${depth}" onclick="compartmentEntryClick(event,'${n.uuid}')">
      <div class="cmp-entry-row">
        ${kids.length ? `<span class="cmp-fold" onclick="event.stopPropagation();toggleCompartmentFold('${n.uuid}')">${folded ? '▸' : '▾'}${folded ? kids.length : ''}</span>` : '<span class="cmp-fold none">·</span>'}
        <span class="cmp-entry-text" ondblclick="event.stopPropagation();editCompartmentEntry('${n.uuid}')">${_wbEsc(n.text)}</span>
      </div>
      <div class="cmp-entry-meta">
        ${links}${inbound ? `<span class="cmp-link in">⇠ ${inbound}</span>` : ''}
        ${n.spawnedIdea ? `<span class="cmp-link idea" onclick="event.stopPropagation();openCompartmentIdea('${n.spawnedIdea}')">◆ own idea →</span>` : ''}
      </div>
      <div class="cmp-entry-actions" onclick="event.stopPropagation()">
        <button title="reply / go deeper" onclick="replyCompartmentEntry('${n.uuid}','${n.lane}')">↳</button>
        <button title="copilot — work this in its lane" onclick="assistCompartmentEntry('${n.uuid}')">✨</button>
        <select title="move to lane" onchange="moveCompartmentEntry('${n.uuid}',this.value)">${Object.entries(WBC.lanes).map(([id, L]) => `<option value="${id}"${id === n.lane ? ' selected' : ''}>${L.icon}</option>`).join('')}</select>
        <button title="link to another entry or idea" onclick="startCompartmentLink('${n.uuid}')">⇄</button>
        <button title="${n.status === 'resolved' ? 'reopen' : 'resolve'}" onclick="statusCompartmentEntry('${n.uuid}','${n.status === 'resolved' ? 'open' : 'resolved'}')">${n.status === 'resolved' ? '↺' : '✓'}</button>
        <button title="spin out into its own idea (recursive)" onclick="spawnCompartmentEntry('${n.uuid}')">◆</button>
        <button title="delete (with its subtree)" class="danger" onclick="deleteCompartmentEntry('${n.uuid}')">✕</button>
      </div>
      <div class="cmp-assist" id="cmp-assist-${n.uuid}" style="display:none"></div>
      <div class="cmp-reply" id="cmp-reply-${n.uuid}" style="display:none"></div>
    </div>${folded ? '' : kids.map(c => _renderEntry(c, depth + 1)).join('')}`;
}

function _renderLinks(d) {
  const row = (x, dir) => `<div class="link-item" style="cursor:pointer" onclick="openCompartmentIdea('${x.ideaUuid}')">
      <span class="link-type ${dir === 'in' ? 'tension' : 'resonance'}">${dir}</span>
      <span>${x.lane ? (WBC.lanes[x.lane]?.icon || '') + ' ' : '◇ '}${_wbEsc(_wbShort(x.text, 70))}</span>
      <span class="ic-uuid" style="margin-left:auto">${_wbEsc(_wbShort(x.ideaText || '', 30))}</span></div>`;
  const out = (d.outbound || []).filter(x => x.kind !== 'missing');
  return `<div class="cmp-links">
    <div class="ds"><div class="ds-label">spun-out ideas (${(d.childIdeas || []).length})</div>${(d.childIdeas || []).map(c => `<div class="link-item" style="cursor:pointer" onclick="openCompartmentIdea('${c.ideaUuid}')"><span class="link-type causal">child</span><span>${_wbEsc(_wbShort(c.text, 80))}</span></div>`).join('') || '<div class="cmp-empty">none — ◆ on any entry spins one out</div>'}</div>
    <div class="ds"><div class="ds-label">links out (${out.length})</div>${out.map(x => row(x, 'out')).join('') || '<div class="cmp-empty">none — ⇄ on any entry links it</div>'}</div>
    <div class="ds"><div class="ds-label">links in (${(d.inbound || []).length})</div>${(d.inbound || []).map(x => row(x, 'in')).join('') || '<div class="cmp-empty">nothing links here yet</div>'}</div>
    <div class="ds"><div class="ds-label">idea graph (${(d.links || []).length})</div>${(d.links || []).map(l => `<div class="link-item" style="cursor:pointer" onclick="openCompartmentIdea('${l.other}')"><span class="link-type ${_wbEsc(l.linkType || l.type || 'resonance')}">${_wbEsc(l.linkType || l.type || 'link')}</span><span>${_wbEsc(_wbShort(l.otherText || l.other, 80))}</span></div>`).join('') || '<div class="cmp-empty">no idea-level links</div>'}</div>
  </div>`;
}

// ── entry actions ───────────────────────────────────────────────────────────
async function addCompartmentEntry(lane, parentUuid = null, textOverride = null) {
  const input = parentUuid ? document.getElementById(`cmp-reply-in-${parentUuid}`) : document.getElementById(`cmp-add-${lane}`);
  const text = (textOverride ?? input?.value ?? '').trim();
  if (!text) return;
  try {
    await api(`/api/ideas/${WBC.ideaUuid}/workbench`, { method: 'POST', body: JSON.stringify({ lane, text, parentUuid }) });
    if (input && textOverride == null) input.value = '';
    if (parentUuid) WBC.collapsed.delete(parentUuid);
    await openCompartmentIdea(WBC.ideaUuid, { keepLane: true, quiet: true });
    _refreshIndexQuiet();
  } catch (e) { toast(e.message, 'err'); }
}

function replyCompartmentEntry(uuid, lane) {
  const el = document.getElementById(`cmp-reply-${uuid}`);
  if (el.style.display !== 'none') { el.style.display = 'none'; return; }
  el.style.display = '';
  el.innerHTML = `<textarea id="cmp-reply-in-${uuid}" rows="2" class="cmp-add" placeholder="go one level deeper…"
    onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();addCompartmentEntry('${lane}','${uuid}')}if(event.key==='Escape')this.parentNode.style.display='none'"></textarea>
    <button class="action-btn primary" onclick="addCompartmentEntry('${lane}','${uuid}')">add</button>`;
  el.querySelector('textarea').focus();
}

async function _patchEntry(uuid, patch) {
  try {
    await api(`/api/workbench/${uuid}`, { method: 'PATCH', body: JSON.stringify(patch) });
    await openCompartmentIdea(WBC.ideaUuid, { keepLane: true, quiet: true });
    _refreshIndexQuiet();
  } catch (e) { toast(e.message, 'err'); }
}
const statusCompartmentEntry = (uuid, status) => _patchEntry(uuid, { status });
const moveCompartmentEntry = (uuid, lane) => _patchEntry(uuid, { lane });
const unlinkCompartmentEntry = (uuid, ref) => _patchEntry(uuid, { removeLink: ref });

function editCompartmentEntry(uuid) {
  const e = _flatten(Object.values(WBC.current.tree).flat()).find(x => x.uuid === uuid);
  if (!e) return;
  const text = window.prompt('edit entry', e.text);
  if (text != null && text.trim() && text.trim() !== e.text) _patchEntry(uuid, { text });
}

async function deleteCompartmentEntry(uuid) {
  const e = _flatten(Object.values(WBC.current.tree).flat()).find(x => x.uuid === uuid);
  const n = e ? _flatten(e.children).length : 0;
  if (!confirm(n ? `delete this entry and its ${n} nested entr${n === 1 ? 'y' : 'ies'}?` : 'delete this entry?')) return;
  try {
    await api(`/api/workbench/${uuid}`, { method: 'DELETE' });
    await openCompartmentIdea(WBC.ideaUuid, { keepLane: true, quiet: true });
    _refreshIndexQuiet();
  } catch (err) { toast(err.message, 'err'); }
}

async function spawnCompartmentEntry(uuid) {
  try {
    const r = await api(`/api/workbench/${uuid}/spawn`, { method: 'POST', body: '{}' });
    toast(r.existed ? 'already its own idea — opening it' : 'spun out into its own idea', 'ok');
    await loadCompartment();
    if (typeof loadIdeas === 'function') loadIdeas();
    await openCompartmentIdea(r.idea.uuid);
  } catch (e) { toast(e.message, 'err'); }
}

async function assistCompartmentEntry(uuid) {
  const el = document.getElementById(`cmp-assist-${uuid}`);
  el.style.display = '';
  el.innerHTML = `<div class="bap-label">✨ copilot</div>thinking…`;
  try {
    const r = await api(`/api/workbench/${uuid}/assist`, { method: 'POST', body: '{}' }, 60000);
    if (!r.suggestions?.length) { el.innerHTML = `<div class="bap-label">✨ copilot</div><span class="bap-err">${_wbEsc(r.reason || 'no suggestions')}</span>`; return; }
    const e = _flatten(Object.values(WBC.current.tree).flat()).find(x => x.uuid === uuid);
    el.innerHTML = `<div class="bap-label">✨ ${_wbEsc(WBC.lanes[r.lane]?.label || r.lane)} — pick what to keep (added one level deeper)</div>` +
      r.suggestions.map((s, i) => `<label class="cmp-sugg"><input type="checkbox" data-i="${i}" checked> ${_wbEsc(s)}</label>`).join('') +
      `<div class="bap-actions"><button class="action-btn primary" id="cmp-sugg-add-${uuid}">add selected</button><button class="action-btn" onclick="this.closest('.cmp-assist').style.display='none'">dismiss</button></div>`;
    document.getElementById(`cmp-sugg-add-${uuid}`).onclick = async () => {
      const picked = [...el.querySelectorAll('input[type=checkbox]')].filter(c => c.checked).map(c => r.suggestions[+c.dataset.i]);
      for (const text of picked) {
        await api(`/api/ideas/${WBC.ideaUuid}/workbench`, { method: 'POST', body: JSON.stringify({ lane: e?.lane || r.lane, text, parentUuid: uuid }) }).catch(err => toast(err.message, 'err'));
      }
      WBC.collapsed.delete(uuid);
      await openCompartmentIdea(WBC.ideaUuid, { keepLane: true, quiet: true });
      _refreshIndexQuiet();
    };
  } catch (err) { el.innerHTML = `<div class="bap-label">✨ copilot</div><span class="bap-err">${_wbEsc(err.message)}</span>`; }
}

function toggleCompartmentFold(uuid) {
  WBC.collapsed.has(uuid) ? WBC.collapsed.delete(uuid) : WBC.collapsed.add(uuid);
  renderCompartmentDetail();
}

// Link mode: ⇄ arms it, the next entry click (this idea) completes it; an
// idea in the left tree or another idea's entry can be targeted by typing
// its uuid, or by clicking an idea node while link mode is armed.
function startCompartmentLink(uuid) {
  WBC.linking = uuid;
  renderCompartmentDetail();
  toast('link mode — click another entry, or an idea in the tree', 'ok');
}
function cancelCompartmentLink() { WBC.linking = null; renderCompartmentDetail(); }
function compartmentEntryClick(ev, uuid) {
  if (!WBC.linking) return;
  if (WBC.linking === uuid) { cancelCompartmentLink(); return; }
  const from = WBC.linking; WBC.linking = null;
  _patchEntry(from, { addLink: uuid });
}
let _wbIdxTimer = null;
function _refreshIndexQuiet() {
  clearTimeout(_wbIdxTimer);
  _wbIdxTimer = setTimeout(async () => {
    try {
      WBC.index = await api('/api/workbench');
      renderCompartmentTree(); renderCompartmentTabMenu(); renderTabTree();
    } catch (_) {}
  }, 150);
}

// ── tabs: recursive Compartment dropdown ────────────────────────────────────
// Each idea is a flyout holding its lanes and, recursively, its spun-out
// child ideas — as deep as the idea tree goes.
function renderCompartmentTabMenu() {
  const menu = document.getElementById('compartment-tab-menu');
  if (!menu) return;
  const tree = WBC.index?.tree || [];
  const laneItems = (n) => Object.entries(WBC.lanes).map(([id, L]) =>
    `<button class="tab-sub" onclick="event.stopPropagation();openCompartmentIdea('${n.ideaUuid}',{lane:'${id}'})"><span class="tab-icon">${L.icon}</span>${_wbEsc(L.label)}${n.counts.lanes[id] ? `<span class="tab-sub-n">${n.counts.lanes[id]}</span>` : ''}</button>`).join('') +
    `<button class="tab-sub" onclick="event.stopPropagation();openCompartmentIdea('${n.ideaUuid}',{lane:'links'})"><span class="tab-icon">⇄</span>Links</button>`;
  const item = (n) => `<div class="tab-nest">
      <button class="tab-sub" onclick="event.stopPropagation();openCompartmentIdea('${n.ideaUuid}')"><span class="tab-icon">◆</span><span class="tab-sub-text">${_wbEsc(_wbShort(n.text, 34))}</span><span class="tab-caret">▸</span></button>
      <div class="tab-flyout">${laneItems(n)}${(n.children || []).length ? `<div class="tab-sep">spun-out ideas</div>${n.children.map(item).join('')}` : ''}</div>
    </div>`;
  menu.innerHTML = `<button class="tab-sub" data-view="compartment" onclick="setView('compartment')"><span class="tab-icon">◎</span>All compartment ideas</button>` +
    (tree.length ? `<div class="tab-sep">ideas</div>` + tree.map(item).join('') : `<div class="tab-sep">promote a brainstorm to start</div>`);
}

// ── tabs: fully expanded tree rail ──────────────────────────────────────────
const TAB_TREE_KEY = 'idearium.tabTree.open';
function _tabTreeOpen() { try { return localStorage.getItem(TAB_TREE_KEY) === '1'; } catch (_) { return false; } }
function toggleTabTree(force) {
  const on = typeof force === 'boolean' ? force : !document.body.classList.contains('tab-tree-open');
  document.body.classList.toggle('tab-tree-open', on);
  try { localStorage.setItem(TAB_TREE_KEY, on ? '1' : '0'); } catch (_) {}
  renderTabTree();
}

function renderTabTree() {
  const el = document.getElementById('tab-tree');
  if (!el || !document.body.classList.contains('tab-tree-open')) return;
  // Repo branches and leaf ideas start folded the first time they are seen.
  for (const r of (typeof API_REPOS !== 'undefined' ? API_REPOS : [])) { const k = `repo:${r.uuid}`; if (!TT_SEEN.has(k)) { TT_SEEN.add(k); TT_COLLAPSED.add(k); } }
  const seed = (ns) => ns.forEach(n => { const k = `cmp:${n.ideaUuid}`; if (!TT_SEEN.has(k)) { TT_SEEN.add(k); if (!(n.children || []).length) TT_COLLAPSED.add(k); } seed(n.children || []); });
  seed(WBC.index?.tree || []);
  const leaf = (icon, label, onclick, extra = '') => `<div class="tt-leaf" onclick="${onclick}"><span class="tt-icon">${icon}</span><span class="tt-label">${_wbEsc(label)}</span>${extra}</div>`;
  const branch = (key, icon, label, inner, onclick = '') => {
    const open = !TT_COLLAPSED.has(key);
    return `<div class="tt-branch${open ? ' open' : ''}">
      <div class="tt-leaf tt-head" onclick="${onclick || `toggleTabTreeBranch('${key}')`}"><span class="tt-caret" onclick="event.stopPropagation();toggleTabTreeBranch('${key}')">${open ? '▾' : '▸'}</span><span class="tt-icon">${icon}</span><span class="tt-label">${_wbEsc(label)}</span></div>
      ${open ? `<div class="tt-kids">${inner}</div>` : ''}</div>`;
  };
  const repoSubtabs = [...document.querySelectorAll('.repo-subtab-btn[data-subtab]')].map(b => [b.dataset.subtab, b.textContent.trim()]);
  // a repo is its subtabs; nexus also holds its systems (0.39.263 — "the rest are nested in the nexus repo")
  const systemsOf = (r) => (r.nexusSelf && r.nexusSelf.role === 'parent') ? repos.filter(x => x.nexusSelf && x.nexusSelf.role === 'system').sort((a, b) => a.name.localeCompare(b.name)) : [];
  // §0.39.264 — Create and Build live inside the repo you are in (James: "only show in nested
  // compartments/repos"), not at the top of the tree
  const openUuid = (typeof REPO_DETAIL_OPEN !== 'undefined' && REPO_DETAIL_OPEN && typeof CURRENT_API_REPO !== 'undefined' && CURRENT_API_REPO) ? CURRENT_API_REPO.uuid : null;
  if (openUuid) {   // the repo you are in (and nexus, when it is a system of nexus) is shown open, so its Create/Build are visible
    TT_COLLAPSED.delete(`repo:${openUuid}`);
    const cur = CURRENT_API_REPO;
    if (cur && cur.nexusSelf && cur.nexusSelf.role === 'system') for (const r of (typeof API_REPOS !== 'undefined' ? API_REPOS : [])) if (r.nexusSelf && r.nexusSelf.role === 'parent') TT_COLLAPSED.delete(`repo:${r.uuid}`);
  }
  const workBranches = (r) => r.uuid !== openUuid ? '' : `<div class="tt-sep">work in this repo</div>` +
    // §0.39.295 — Ideas and Brainstorm are the Void now (its own page); their ideas and sparks live there
    branch(`create:${r.uuid}`, '∞', 'Create',
      leaf('∞', 'The Void', 'openVoid()', `<span class="tt-n">${ideas.length || ''}</span>`) +
      leaf('✎', 'Spec workshop', 'openWorkshop()')) +
    branch(`build:${r.uuid}`, '▦', 'Build',
      leaf('◈', 'Eravos — organism canvas', "setView('eravos')") +
      leaf('⌘', 'Architect — block canvas', "setView('architect-build')") +
      leaf('▤', 'Spec Builder', "setView('spec-wizard')"));
  const repoNode = (r) => branch(`repo:${r.uuid}`, '▣', _wbShort(r.name || r.uuid, 36),
    repoSubtabs.map(([id, label]) => leaf('·', label, `tabTreeOpenRepo('${r.uuid}','${id}')`)).join('') + workBranches(r) +
    (systemsOf(r).length ? `<div class="tt-sep">systems</div>` + systemsOf(r).map(repoNode).join('') : ''),
    `tabTreeOpenRepo('${r.uuid}','home')`);
  const repos = (typeof API_REPOS !== 'undefined' ? API_REPOS : []).filter(r => !r.archived);
  const ideas = (typeof IDEAS !== 'undefined' ? IDEAS : []).filter(i => i.phase !== 'archived');
  el.innerHTML = `
    <div class="tt-top"><span>NAVIGATOR</span><button class="tt-close" onclick="toggleTabTree(false)" title="collapse to tabs">⊟</button></div>
    ${leaf('⌂', 'Welcome', "setView('welcome')")}
    ${branch('repos', '🗂', 'Repos', repos.filter(r => !(r.nexusSelf && r.nexusSelf.role === 'system')).map(repoNode).join('') || '<div class="tt-empty">none</div>', "setView('repo')")}`;
}

// Deep branches start folded so a large tree stays readable; the top level starts open.
const TT_COLLAPSED = new Set(['ideas']);
const TT_SEEN = new Set();
function toggleTabTreeBranch(key) { TT_COLLAPSED.has(key) ? TT_COLLAPSED.delete(key) : TT_COLLAPSED.add(key); renderTabTree(); }
function tabTreeOpenRepo(uuid, subtab) {
  setView('repo');
  enterRepoDetail(uuid);
  setTimeout(() => { try { setRepoSubtab(subtab); } catch (_) {} }, 50);
}
// ── boot ────────────────────────────────────────────────────────────────────
(function bootCompartment() {
  if (_tabTreeOpen()) document.body.classList.add('tab-tree-open');
  let tries = 0;
  const t = setInterval(() => {
    if (CONNECTED || ++tries > 60) { clearInterval(t); if (CONNECTED) loadCompartment(); }
  }, 500);
})();
