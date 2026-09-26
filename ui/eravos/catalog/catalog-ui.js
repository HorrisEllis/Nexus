/* ═══════════════════════════════════════════════════════════
   ERAVOS CATALOG UI  v1.0.0
   catalog/catalog-ui.js

   Rendering layer. Reads from CatalogRegistry. No data logic.

   API (all callable from outside):
     CatalogUI.open()        — open the popup
     CatalogUI.close()       — close
     CatalogUI.toggle()      — open if closed, close if open
     CatalogUI.refresh()     — re-render without closing
     CatalogUI.init(el)      — attach to a mount element (call once)

   Depends on:
     CatalogRegistry         — data source
     OrganismFactory         — spawn()
     KERNEL.bus              — publish spawn events
     catalog.css             — loaded by index.html

   Does NOT depend on:
     index.html structure
     inline script blocks
     global functions defined elsewhere
   ═══════════════════════════════════════════════════════════ */

window.CatalogUI = (() => {
'use strict';

let _overlay = null;
let _body    = null;
let _search  = null;
let _inited  = false;

/* ── Bootstrap DOM ────────────────────────────────────────── */

function init(mountEl) {
  if (_inited) return;
  _inited = true;
  const target = mountEl || document.body;

  // Overlay
  _overlay = document.createElement('div');
  _overlay.id = 'eravos-catalog-overlay';
  _overlay.addEventListener('click', e => { if (e.target === _overlay) close(); });

  // Box
  const box = document.createElement('div');
  box.id = 'eravos-catalog-box';

  // Header
  const hdr = document.createElement('div');
  hdr.id = 'eravos-catalog-header';

  const title = document.createElement('div');
  title.id = 'eravos-catalog-title';
  title.textContent = 'ORGANISM CATALOG';

  _search = document.createElement('input');
  _search.id = 'eravos-catalog-search';
  _search.placeholder = 'search…';
  _search.addEventListener('input', () => _render(_search.value));

  const createBtn = document.createElement('button');
  createBtn.className = 'eravos-catalog-btn';
  createBtn.textContent = '+ NEW';
  createBtn.title = 'Start a new organism in Idearium — as an idea or a spec';
  createBtn.addEventListener('click', _openCreateFlow);

  const closeBtn = document.createElement('button');
  closeBtn.id = 'eravos-catalog-close';
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', close);

  hdr.appendChild(title);
  hdr.appendChild(_search);
  hdr.appendChild(createBtn);
  hdr.appendChild(closeBtn);

  // Body
  _body = document.createElement('div');
  _body.id = 'eravos-catalog-body';

  box.appendChild(hdr);
  box.appendChild(_body);
  _overlay.appendChild(box);
  target.appendChild(_overlay);

  // Seed CatalogRegistry from OrganismFactory (catches boot-time reg() calls
  // that fired before CatalogRegistry was loaded)
  if (typeof OrganismFactory !== 'undefined') {
    OrganismFactory.defs().forEach(def => {
      if (!CatalogRegistry.get(def.id)) {
        CatalogRegistry.register({ source: 'built-in', ...def });
      }
    });
  }

  // Keyboard
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && _overlay.classList.contains('open')) close();
  });

  // Live refresh when registry changes
  CatalogRegistry.on('catalog:registered', () => { if (isOpen()) _render(_search.value); });
  CatalogRegistry.on('catalog:updated',    () => { if (isOpen()) _render(_search.value); });
  CatalogRegistry.on('catalog:removed',    () => { if (isOpen()) _render(_search.value); });
}

/* ── Public API ───────────────────────────────────────────── */

function open() {
  if (!_inited) init();
  _search.value = '';
  _render('');
  _overlay.classList.add('open');
  _search.focus();
}

function close() {
  _overlay?.classList.remove('open');
}

function toggle() {
  isOpen() ? close() : open();
}

function refresh() {
  if (isOpen()) _render(_search?.value || '');
}

function isOpen() {
  return _overlay?.classList.contains('open') || false;
}

/* ── Render ───────────────────────────────────────────────── */

function _render(query) {
  _body.innerHTML = '';
  const organisms = query ? CatalogRegistry.search(query) : CatalogRegistry.list();

  if (!organisms.length) {
    const empty = document.createElement('div');
    empty.className = 'eravos-cat-empty';
    empty.textContent = query ? `No organisms match "${query}"` : 'No organisms registered yet.';
    _body.appendChild(empty);
    return;
  }

  // Group by category
  const byCategory = new Map();
  organisms.forEach(o => {
    if (!byCategory.has(o.category)) byCategory.set(o.category, []);
    byCategory.get(o.category).push(o);
  });

  const cats = [...byCategory.keys()].sort();
  cats.forEach(cat => {
    const section = document.createElement('div');

    const catHdr = document.createElement('div');
    catHdr.className = 'eravos-cat-section-hdr';
    catHdr.textContent = cat.toUpperCase();
    section.appendChild(catHdr);

    const grid = document.createElement('div');
    grid.className = 'eravos-cat-grid';

    byCategory.get(cat).forEach(o => {
      grid.appendChild(_buildCard(o));
    });

    section.appendChild(grid);
    _body.appendChild(section);
  });
}

function _buildCard(o) {
  const color = o.accent || 'var(--accent)';
  const card  = document.createElement('div');
  card.className = 'eravos-cat-card';

  const thumb = document.createElement('div');
  thumb.className = 'eravos-cat-thumb';
  thumb.style.background = `linear-gradient(135deg, ${color}22, ${color}06)`;
  thumb.style.borderBottomColor = `${color}33`;
  thumb.textContent = o.icon;

  const body = document.createElement('div');
  body.className = 'eravos-cat-body';

  const label = document.createElement('div');
  label.className = 'eravos-cat-label';
  label.style.color = color;
  label.textContent = o.label;

  const summary = document.createElement('div');
  summary.className = 'eravos-cat-summary';
  summary.textContent = o.summary || '';

  const needs = document.createElement('div');
  needs.className = 'eravos-cat-needs';
  needs.textContent = o.needs?.length
    ? 'NEEDS: ' + o.needs.map(n => n.label).join(', ')
    : 'NEEDS: nothing extra';

  const source = document.createElement('div');
  source.className = 'eravos-cat-source' + (o.source === 'nexus-build' ? ' nexus-build' : '');
  source.textContent = o.source === 'nexus-build' ? '⬡ NEXUS built' : o.source === 'pack' ? '📦 pack' : '';

  const addBtn = document.createElement('button');
  addBtn.className = 'eravos-cat-add';
  addBtn.style.border = `1px solid ${color}55`;
  addBtn.style.color  = color;
  addBtn.textContent  = '+ ADD';
  addBtn.addEventListener('click', () => _add(o));

  body.appendChild(label);
  body.appendChild(summary);
  body.appendChild(needs);
  if (source.textContent) body.appendChild(source);
  body.appendChild(addBtn);

  card.appendChild(thumb);
  card.appendChild(body);
  return card;
}

/* ── Add organism ─────────────────────────────────────────── */

function _add(o) {
  if (o.needs && o.needs.length) {
    _openNeedsPrompt(o);
  } else {
    _spawn(o, {});
  }
}

function _spawn(o, config) {
  if (typeof bootAudio === 'function') bootAudio();
  const pos = { x: 80 + Math.random() * 320, y: 80 + Math.random() * 160 };
  OrganismFactory.spawn(o.id, pos, null, config);
  close();
}

/* ── Needs config prompt ──────────────────────────────────── */

function _openNeedsPrompt(o) {
  // Build a lightweight prompt overlay inline
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:9700;display:flex;align-items:center;justify-content:center;';

  const box = document.createElement('div');
  box.style.cssText = 'width:min(380px,90vw);background:var(--bg1);border:1px solid var(--b2);border-radius:8px;padding:18px;display:flex;flex-direction:column;gap:10px;';

  const title = document.createElement('div');
  title.style.cssText = 'font-family:var(--orb);font-size:10px;font-weight:700;letter-spacing:.12em;color:var(--accent);';
  title.textContent = `CONFIGURE ${o.label.toUpperCase()}`;

  const fields = document.createElement('div');
  fields.style.cssText = 'display:flex;flex-direction:column;gap:9px;';

  o.needs.forEach(n => {
    const lbl = document.createElement('label');
    lbl.style.cssText = 'font-family:var(--mono);font-size:7px;color:var(--dim);letter-spacing:.06em;display:flex;flex-direction:column;gap:3px;';
    lbl.textContent = n.label;
    const inp = document.createElement('input');
    inp.value = n.default ?? '';
    inp.dataset.key = n.key;
    inp.style.cssText = 'background:var(--bg3);border:1px solid var(--b2);border-radius:3px;color:var(--white);font-family:var(--mono);font-size:9px;padding:6px 8px;';
    lbl.appendChild(inp);
    fields.appendChild(lbl);
  });

  const btns = document.createElement('div');
  btns.style.cssText = 'display:flex;gap:8px;margin-top:4px;';

  const confirmBtn = document.createElement('button');
  confirmBtn.style.cssText = 'flex:1;background:var(--accent);border:none;color:#000;font-family:var(--mono);font-size:8px;font-weight:700;letter-spacing:.08em;padding:8px;border-radius:4px;cursor:pointer;';
  confirmBtn.textContent = '+ ADD';
  confirmBtn.addEventListener('click', () => {
    const config = {};
    fields.querySelectorAll('input').forEach(i => { config[i.dataset.key] = i.value; });
    document.body.removeChild(overlay);
    _spawn(o, config);
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.style.cssText = 'background:transparent;border:1px solid var(--b2);color:var(--dim2);font-family:var(--mono);font-size:8px;letter-spacing:.08em;padding:8px 12px;border-radius:4px;cursor:pointer;';
  cancelBtn.textContent = 'CANCEL';
  cancelBtn.addEventListener('click', () => document.body.removeChild(overlay));

  overlay.addEventListener('click', e => { if (e.target === overlay) document.body.removeChild(overlay); });

  btns.appendChild(confirmBtn);
  btns.appendChild(cancelBtn);
  box.appendChild(title);
  box.appendChild(fields);
  box.appendChild(btns);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

/* ── New organism → an Idearium idea or spec ─────────────────
   0.39.264 — James: "instead of download, it should create a idea or spec for
   a new organism." The old flow downloaded a starter engine.js + schema.json
   (superseded; it is in git history at 34c7753). A new organism now starts where
   every other piece of work starts: as an idea in Idearium, or straight away as
   a spec — which Idearium makes into a repo with its own COS compartment.

   Inside Idearium (this page is its Build › Eravos frame) the request goes to
   the parent page by postMessage, and Idearium does it with its own API and
   opens the result (the new idea, or the New Spec dialog filled in). Standalone,
   the page calls Idearium's API itself (base: localStorage 'eravos.idearium.base',
   default http://127.0.0.1:4800) and opens Idearium on the result.            */

function _ideariumBase() {
  try { return (localStorage.getItem('eravos.idearium.base') || 'http://127.0.0.1:4800').replace(/\/+$/, ''); }
  catch (_) { return 'http://127.0.0.1:4800'; }
}

function _describe(o) {
  return `ERAVOS organism: ${o.label} (${o.id})` + (o.what ? ` — ${o.what}` : '')
    + `\n\nConvention: organisms/${o.id}/ with ${o.id}.engine.js (mount(instanceId, sBus, audio, config) → { unmount }),`
    + ` registered in KERNEL.registry with hooks ${o.id}.hook.in / ${o.id}.hook.out, and schema.json for its input/output payloads.`
    + ` Category: ${o.category}. Icon: ${o.icon}.`;
}

async function _createInIdearium(mode, o, statusEl) {
  const payload = { type: 'nexus:organism.create', mode, kind: 'organism', organism: o, text: _describe(o),
                    tags: ['eravos', 'organism', `organism:${o.id}`, `category:${o.category}`] };
  // Embedded in Idearium: it owns ideas and specs, so it does the work and navigates.
  if (window.parent && window.parent !== window) {
    window.parent.postMessage(payload, '*');
    return { handedOff: true };
  }
  // Standalone: call Idearium directly.
  const base = _ideariumBase();
  const post = async (p, body) => {
    const r = await fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status} from ${p}`);
    return j.data || j;
  };
  statusEl.textContent = 'creating the idea in Idearium…';
  const made = await post('/api/ideas', { text: payload.text, tags: payload.tags });
  const idea = made.idea || made;
  if (mode === 'spec') {
    statusEl.textContent = 'making it a spec (and its repo)…';
    await post('/api/spec-engine/specs', { name: o.label, description: payload.text, ideaUuid: idea.uuid, fileTree: false });
  }
  window.open(`${base}/ui/idearium/`, '_blank');
  return { idea };
}

function _openCreateFlow() {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:9700;display:flex;align-items:center;justify-content:center;';

  const box = document.createElement('div');
  box.style.cssText = 'width:min(420px,90vw);background:var(--bg1);border:1px solid var(--b2);border-radius:8px;padding:18px;display:flex;flex-direction:column;gap:10px;';

  const title = document.createElement('div');
  title.style.cssText = 'font-family:var(--orb);font-size:10px;font-weight:700;letter-spacing:.12em;color:var(--accent);';
  title.textContent = 'NEW ORGANISM';

  const desc = document.createElement('div');
  desc.style.cssText = 'font-family:var(--mono);font-size:7px;color:var(--dim2);line-height:1.6;';
  desc.textContent = 'Starts the organism in Idearium: as an idea to grow, or straight away as a spec — a repo with its own compartment, built to the ERAVOS organism convention (organisms/<id>/).';

  function mkField(labelText, placeholder, id, multiline) {
    const wrap = document.createElement('label');
    wrap.style.cssText = 'font-family:var(--mono);font-size:7px;color:var(--dim);letter-spacing:.08em;display:flex;flex-direction:column;gap:3px;';
    wrap.textContent = labelText;
    const inp = document.createElement(multiline ? 'textarea' : 'input');
    inp.id = id; inp.placeholder = placeholder;
    if (multiline) inp.rows = 3;
    inp.style.cssText = 'width:100%;background:var(--bg3);border:1px solid var(--b2);border-radius:3px;color:var(--white);font-family:var(--mono);font-size:9px;padding:6px 8px;resize:vertical;';
    wrap.appendChild(inp);
    return wrap;
  }

  box.appendChild(title);
  box.appendChild(desc);
  box.appendChild(mkField('ID (kebab-case)', 'my-organism', '_create-id'));
  box.appendChild(mkField('LABEL', 'My Organism', '_create-label'));
  box.appendChild(mkField('WHAT IT DOES', 'one or two sentences — this becomes the idea', '_create-what', true));
  box.appendChild(mkField('ICON', '◆', '_create-icon'));
  box.appendChild(mkField('CATEGORY', 'Custom', '_create-cat'));

  const status = document.createElement('div');
  status.style.cssText = 'font-family:var(--mono);font-size:7px;color:var(--dim2);min-height:9px;';

  const read = () => ({
    id:       (document.getElementById('_create-id')?.value    || 'my-organism').trim().replace(/\s+/g, '-').toLowerCase(),
    label:    (document.getElementById('_create-label')?.value || 'My Organism').trim(),
    what:     (document.getElementById('_create-what')?.value  || '').trim(),
    icon:     (document.getElementById('_create-icon')?.value  || '◆').trim(),
    category: (document.getElementById('_create-cat')?.value   || 'Custom').trim(),
  });
  const close = () => { if (overlay.parentNode) document.body.removeChild(overlay); };
  const go = async (mode, btn) => {
    const o = read();
    if (!/^[a-z0-9][a-z0-9-]*$/.test(o.id)) { status.style.color = 'var(--red,#f66)'; status.textContent = 'ID must be kebab-case: letters, digits and dashes'; return; }
    btn.disabled = true; status.style.color = ''; status.textContent = 'sending to Idearium…';
    try { await _createInIdearium(mode, o, status); close(); }
    catch (e) { btn.disabled = false; status.style.color = 'var(--red,#f66)'; status.textContent = `Idearium did not take it: ${e.message} — is Idearium running at ${_ideariumBase()}?`; }
  };

  const btns = document.createElement('div');
  btns.style.cssText = 'display:flex;gap:8px;margin-top:4px;';
  const mkBtn = (text, primary, onClick) => {
    const b = document.createElement('button');
    b.style.cssText = primary
      ? 'flex:1;background:var(--accent);border:none;color:#000;font-family:var(--mono);font-size:8px;font-weight:700;letter-spacing:.08em;padding:8px;border-radius:4px;cursor:pointer;'
      : 'flex:1;background:transparent;border:1px solid var(--accent);color:var(--accent);font-family:var(--mono);font-size:8px;font-weight:700;letter-spacing:.08em;padding:8px;border-radius:4px;cursor:pointer;';
    b.textContent = text;
    b.addEventListener('click', () => onClick(b));
    return b;
  };
  const ideaBtn = mkBtn('✎ CREATE IDEA', true, (b) => go('idea', b));
  const specBtn = mkBtn('▤ CREATE SPEC', false, (b) => go('spec', b));

  const cancelBtn = document.createElement('button');
  cancelBtn.style.cssText = 'background:transparent;border:1px solid var(--b2);color:var(--dim2);font-family:var(--mono);font-size:8px;letter-spacing:.08em;padding:8px 12px;border-radius:4px;cursor:pointer;';
  cancelBtn.textContent = 'CANCEL';
  cancelBtn.addEventListener('click', close);

  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  btns.appendChild(ideaBtn);
  btns.appendChild(specBtn);
  btns.appendChild(cancelBtn);
  box.appendChild(btns);
  box.appendChild(status);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

return { init, open, close, toggle, refresh, isOpen, createInIdearium: _createInIdearium, describe: _describe };
})();
