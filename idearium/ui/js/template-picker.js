// idearium/ui/js/template-picker.js — the workshop's new-spec picker (0.39.357 RS5)
// Map: docs/2026-10-05-spec-workshop-rebuild-phasemap.spec (RS5_the_template_picker)
// James: "opens a pick template screen like photoshop does when you first open it. with a custom or manual option with a
// plus sign. then you pick a template from the list, including all the quick spec options" · asked whether the
// workshop's start page becomes it: "yes with a custom or manual."
//
// Like a new-document dialog: the templates down the middle in tabs (every template the quick spec offers — the
// spec-document templates with genesis first, the COS archetypes and blueprints — and his saved ones), + CUSTOM / MANUAL
// first; the details on the right — the 11 parts, each lit where the template fills it (its first lines on hover), a COS
// template's starting files by layer, the title, what it starts from, the mode, CREATE. Double-click or Enter creates.
// GET /api/workshop/templates; CREATE posts { from, title, template, mode } (workshop.js create()).
// window.TemplatePicker({ api, esc, toast, dialog, onCreate, onSource }) → { load, setFrom, from }
'use strict';
window.TemplatePicker = function TemplatePicker({ api, esc, toast, dialog, onCreate, onSource }) {
  const $ = (id) => document.getElementById(id);
  const GROUPS = [
    ['all', 'ALL'], ['document', 'DOCUMENT'], ['cos-archetype', 'COS ARCHETYPES'], ['cos-blueprint', 'COS BLUEPRINTS'], ['saved', 'SAVED'],
  ];
  const TIER = { minimum: 'MINIMUM', mods: 'MODS', components: 'COMPONENTS' };
  const S = { list: [], custom: null, blocks: [], tab: 'all', q: '', sel: 'custom', from: null, mode: null, error: null };
  try { const t = localStorage.getItem('workshop.tpl.tab'); if (t && GROUPS.some(g => g[0] === t)) S.tab = t; } catch (_) {}

  const cur = () => S.list.find(t => t.id === S.sel) || S.list[0] || null;
  const modeOf = (t) => S.mode || (t && t.mode) || (t && t.id === 'custom' ? 'manual' : 'assisted');
  const inTab = (t) => t.id === 'custom' || S.tab === 'all' || t.group === S.tab;
  const shown = () => S.list.filter(t => inTab(t) && (t.id === 'custom' || !S.q || `${t.label} ${t.description || ''}`.toLowerCase().includes(S.q)));   // the + card is always there

  async function load() {
    $('np').removeAttribute('data-ready');   // set again when this load has painted (the page, and its tests, can wait on it)
    try {
      const d = await api('/api/workshop/templates');
      S.custom = d.custom; S.blocks = d.blocks || [];
      S.list = [{ ...d.custom, preview: (d.templates.find(t => t.id === 'custom') || {}).preview || [] }, ...d.templates.filter(t => t.id !== 'custom')];
      S.error = null;
    } catch (e) {
      // the picker still starts a spec: CUSTOM needs nothing from the server
      S.error = e.message; S.list = [{ id: 'custom', label: 'CUSTOM / MANUAL', group: 'custom', mode: 'manual', description: 'A blank document. You write it; the agent only points at what is missing.', preview: [] }];
    }
    if (!S.list.some(t => t.id === S.sel)) S.sel = 'custom';
    paint();
    $('np').dataset.ready = '1';
  }

  // ── the grid ──────────────────────────────────────────────────────────────────────────────────────────────────
  function thumb(t) {
    if (t.id === 'custom') return '<div class="np-th plus"><span>+</span></div>';
    if (t.group === 'cos-archetype' || t.group === 'cos-blueprint') {
      const f = (t.files || []).slice(0, 7);
      return `<div class="np-th files">${f.map(x => `<i style="--d:${(x.path.match(/\//g) || []).length}">${esc(x.path.split('/').pop())}</i>`).join('')}${(t.files || []).length > 7 ? `<i class="more">+${t.files.length - 7}</i>` : ''}</div>`;
    }
    return `<div class="np-th doc">${(t.preview || []).map(p => `<b class="${p.filled ? 'on' : p.laid ? 'laid' : ''}"></b>`).join('')}</div>`;
  }
  function meta(t) {
    if (t.id === 'custom') return 'BLANK · MANUAL';
    if (t.group === 'saved') return `SAVED · V${t.version}${t.versions > 1 ? ` OF ${t.versions}` : ''}`;
    if (t.group === 'document') { const n = (t.preview || []).filter(p => p.filled).length; return `DOCUMENT · ${n ? `FILLS ${n} PART${n === 1 ? '' : 'S'}` : 'STRUCTURE'}`; }
    return `${t.group === 'cos-blueprint' ? 'BLUEPRINT' : 'ARCHETYPE'} · ${(t.files || []).length} FILE${(t.files || []).length === 1 ? '' : 'S'}`;
  }
  function paintTabs() {
    $('npTabs').innerHTML = GROUPS.map(([g, label]) => {
      const n = g === 'all' ? S.list.length : S.list.filter(t => t.group === g).length;
      return `<button class="np-tab${S.tab === g ? ' on' : ''}" role="tab" aria-selected="${S.tab === g}" data-g="${g}" title="${label}">${label}<span class="n">${n}</span></button>`;
    }).join('');
    $('npTabs').querySelectorAll('.np-tab').forEach(b => { b.onclick = () => { S.tab = b.dataset.g; try { localStorage.setItem('workshop.tpl.tab', S.tab); } catch (_) {} paint(); }; });
  }
  function paintGrid() {
    const list = shown();
    $('npCount').textContent = S.error ? '' : `${list.length}`;
    $('npGrid').innerHTML = (S.error ? `<div class="np-err">THE TEMPLATES DID NOT LOAD: ${esc(S.error)} — CUSTOM STILL WORKS</div>` : '')
      + list.map((t, i) => `<div class="np-card emerge${t.id === 'custom' ? ' custom' : ''}${t.id === S.sel ? ' on' : ''}" style="--i:${Math.min(i, 14)}" role="option" tabindex="0" aria-selected="${t.id === S.sel}" data-id="${esc(t.id)}" title="${esc(t.label)}">
          ${thumb(t)}<div class="np-l">${esc(t.id === 'custom' ? 'CUSTOM / MANUAL' : t.label)}</div><div class="np-m">${esc(meta(t))}${t.default ? ' · <span class="def">DEFAULT</span>' : ''}</div></div>`).join('')
      + (list.length <= 1 && S.q ? '<div class="np-err">NOTHING ELSE MATCHES</div>' : '');
    $('npGrid').querySelectorAll('.np-card').forEach(c => {
      c.onclick = () => { if (S.sel !== c.dataset.id) { S.sel = c.dataset.id; S.mode = null; paintSide(); $('npGrid').querySelectorAll('.np-card').forEach(x => { const on = x.dataset.id === S.sel; x.classList.toggle('on', on); x.setAttribute('aria-selected', on); }); } };
      c.ondblclick = () => { S.sel = c.dataset.id; create(); };
      c.onkeydown = (e) => {
        if (e.key === 'Enter') { S.sel = c.dataset.id; create(); }
        else if (e.key === ' ') { e.preventDefault(); c.click(); }
        else if (/^Arrow(Left|Right|Up|Down)$/.test(e.key)) {
          e.preventDefault();
          const cards = [...$('npGrid').querySelectorAll('.np-card')]; const i = cards.indexOf(c);
          const cols = Math.max(1, Math.round($('npGrid').clientWidth / (c.offsetWidth + 12)));
          const j = i + ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols })[e.key];
          if (cards[j]) { cards[j].focus(); cards[j].click(); }
        }
      };
    });
  }

  // ── the details ───────────────────────────────────────────────────────────────────────────────────────────────
  function paintSide() {
    const t = cur(); if (!t) return;
    $('npName').textContent = t.id === 'custom' ? 'CUSTOM / MANUAL' : t.label;
    $('npDesc').textContent = (t.description || '') + (t.note ? ` — ${t.note}` : '') + (t.basedOn ? ` — BASED ON ${t.basedOn.label || t.basedOn.id}` : '');
    const P = t.preview || [];
    const filled = P.filter(p => p.filled).length, laid = P.filter(p => p.laid && !p.filled).length;
    $('npFill').textContent = t.id === 'custom' ? '· NONE — YOU ADD THEM AS YOU GO' : `· ${filled} FILLED${laid ? ` · ${laid} LAID OUT EMPTY` : ''}`;
    $('npParts').innerHTML = P.map(p => `<div class="np-part${p.filled ? ' on' : p.laid ? ' laid' : ''}" data-part="${esc(p.id)}" title="${esc(p.excerpt || (p.laid ? 'LAID OUT, EMPTY — YOU OR THE AGENT WRITE IT' : 'NOT IN THIS TEMPLATE — ADDED WHEN THE SPEC NEEDS IT'))}">
        <span class="d"></span><span class="t">${esc(p.title)}</span><span class="tier">${TIER[p.tier] || ''}</span></div>`).join('');
    const files = t.files || [];
    $('npFiles').classList.toggle('hidden', !files.length);
    if (files.length) {
      const by = {}; for (const f of files) (by[f.layer || 'runtime'] = by[f.layer || 'runtime'] || []).push(f.path);
      $('npFiles').innerHTML = `<div class="np-sub">STARTING FILES · ${files.length}${t.roles ? ` · ${t.roles.length} ROLES` : ''}</div>` + Object.entries(by).map(([l, ps]) => `<div class="np-layer"><b>${esc(l.toUpperCase())}</b> ${ps.map(esc).join(' · ')}</div>`).join('');
    }
    const m = modeOf(t);
    document.querySelectorAll('#npModes .np-mode').forEach(b => { b.classList.toggle('on', b.dataset.mode === m); b.setAttribute('aria-checked', b.dataset.mode === m); });
    $('npRemove').classList.toggle('hidden', t.group !== 'saved');
    paintFrom();
  }
  function paintFrom() {
    const f = S.from;
    document.querySelectorAll('#np .src').forEach(el => el.classList.toggle('on', f ? el.dataset.k === f.kind : el.dataset.k === 'none'));
    $('npFrom').innerHTML = f ? `<span class="np-chip">${esc({ idea: 'IDEA', library: 'LIBRARY', repo: 'REPO' }[f.kind])} · ${esc(f.label || f.id)}<button class="x" title="START FROM NOTHING" aria-label="clear">×</button></span>` : '';
    const x = $('npFrom').querySelector('.x'); if (x) x.onclick = () => setFrom(null);
  }
  function paint() { paintTabs(); paintGrid(); paintSide(); }

  function setFrom(f) { S.from = f && f.kind && f.id ? f : null; paintFrom(); }
  function create() {
    const t = cur(); if (!t) return;
    onCreate({ from: S.from ? { kind: S.from.kind, id: S.from.id } : { kind: 'blank' }, title: $('beginTitle').value.trim() || null, template: t.id, mode: modeOf(t) });
  }

  $('npQ').oninput = () => { S.q = $('npQ').value.trim().toLowerCase(); paintGrid(); };
  $('beginBtn').onclick = create;
  $('beginTitle').onkeydown = (e) => { if (e.key === 'Enter') create(); };
  document.querySelectorAll('#npModes .np-mode').forEach(b => { b.onclick = () => { S.mode = b.dataset.mode; paintSide(); }; });
  document.querySelectorAll('#np .src').forEach(el => {
    const go = () => (el.dataset.k === 'none' ? setFrom(null) : onSource(el.dataset.k));
    el.onclick = go; el.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
  });
  $('npRemove').onclick = async () => {
    const t = cur(); if (!t || t.group !== 'saved') return;
    const ok = await dialog({ q: `REMOVE "${String(t.label).toUpperCase()}"?`, note: `IT IS ARCHIVED — EVERY VERSION KEPT (${t.versions}), NO LONGER OFFERED HERE`, ok: 'REMOVE' });
    if (!ok) return;
    try { await api(`/api/workshop/templates/${encodeURIComponent(t.id)}/remove`, {}); toast(`REMOVED — ${t.label} IS ARCHIVED, ITS VERSIONS KEPT`); S.sel = 'custom'; await load(); }
    catch (e) { toast(`NOT REMOVED: ${e.message}`, true); }
  };
  return { load, setFrom, get from() { return S.from; }, get state() { return S; } };
};
