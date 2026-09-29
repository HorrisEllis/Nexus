// ════════════════════════════════════════════════════════════════════════════
// §LIVING SPEC — idearium/ui/js/living-spec.js (0.39.271 S2)
// UUID: nexus-idearium-ui-living-spec-v1-0000-2026-0927-jamesbrooks-001
// Map: docs/2026-09-27-one-idearium-phases-living-spec-nodes-phasemap.spec (S2)
//
// James: "the spec tab is for the .spec in the spec folder, the living model."
// GET /api/repos/:uuid/living-spec[?path=] (idearium/repo/living-spec.js) gives the
// repo's spec files and one of them parsed. This shows it as the model it is:
// the meta, every section as a tree, version history (the audit trail), gaps,
// the dated addenda (drift, §12.5), and the raw text. Read-only: a .spec is
// changed where it lives (the Files tab, the agent, the apply gate for NEXUS).
// ════════════════════════════════════════════════════════════════════════════

const LSPEC = { uuid: null, path: null, view: 'model', data: null };

async function renderLivingSpec(repo, specPath = null) {
  const el = document.getElementById('repo-living-spec');
  if (!el || !repo) return;
  if (LSPEC.uuid !== repo.uuid) Object.assign(LSPEC, { uuid: repo.uuid, path: null, view: 'model', data: null });
  const want = specPath || LSPEC.path;
  if (!LSPEC.data) el.innerHTML = `<div class="detail-empty">reading the spec folder…</div>`;
  let d;
  try { d = await api(`/api/repos/${repo.uuid}/living-spec${want ? `?path=${encodeURIComponent(want)}` : ''}`, {}, 20000); }
  catch (e) {
    if (CURRENT_API_REPO?.uuid !== repo.uuid || CURRENT_REPO_SUBTAB !== 'spec') return;
    el.innerHTML = `<div class="ds"><div class="ds-label">living spec</div><div class="ds-mono">could not read the spec folder: ${escapeHtml(e.message)}</div></div>`;
    return;
  }
  if (CURRENT_API_REPO?.uuid !== repo.uuid || CURRENT_REPO_SUBTAB !== 'spec') return;
  LSPEC.data = d; LSPEC.path = d.open ? d.open.path : null;
  const manifest = document.getElementById('repo-build-manifest');
  if (manifest && !d.specs.length) manifest.open = true;
  _lsPaint();
}

function _lsPaint() {
  const el = document.getElementById('repo-living-spec');
  const d = LSPEC.data; if (!el || !d) return;
  if (!d.specs.length) {
    el.innerHTML = `<div class="ds"><div class="ds-label">living spec</div><div class="ds-mono">this repo has no spec folder yet — no .spec under spec/ or specs/, and none at its root.

A living spec is the repo's model of itself, edited as the code changes (docs/architecture-spec/architecture-spec.spec, SPEC_IS_LIVING_MODEL). Put it at spec/${escapeHtml(String((CURRENT_API_REPO || {}).name || 'repo').split('/').pop())}.spec.</div></div>`;
    return;
  }
  const files = d.specs.map(s => `<div class="ls-file ${s.path === LSPEC.path ? 'on' : ''}" onclick="livingSpecOpen('${escapeHtml(s.path)}')">${escapeHtml(s.system ? `${s.system} · ` : '')}${escapeHtml(s.path.split('/').pop())}<small>${escapeHtml(s.path)}${s.bytes ? ` · ${(s.bytes / 1024).toFixed(1)} KB` : ''}</small></div>`).join('');
  const o = d.open;
  let main = '';
  if (!o) main = `<div class="detail-empty">pick a spec</div>`;
  else if (o.error) main = `<div class="ds-mono">${escapeHtml(o.error)}</div>`;
  else {
    const p = o.parsed; const m = p.meta || {};
    const metaKeys = Object.keys(m).filter(k => m[k] != null && typeof m[k] !== 'object').slice(0, 14);
    const tabs = [['model', `model · ${p.sections.length} sections`], ['history', `version history · ${p.versionHistory.length}`], ['gaps', `gaps · ${p.gaps.length}`], ['addenda', `addenda · ${p.addenda.length}`], ['raw', `text · ${p.lines} lines`]]
      .map(([k, l]) => `<button class="ls-tab ${LSPEC.view === k ? 'on' : ''}" onclick="livingSpecView('${k}')">${l}</button>`).join('');
    let body;
    if (LSPEC.view === 'raw') body = `<div class="ls-raw">${escapeHtml(o.text)}</div>`;
    else if (LSPEC.view === 'history') body = p.versionHistory.length ? p.versionHistory.slice().reverse().map(v => {
      const obj = v && typeof v === 'object' ? v : { note: v };
      const ver = obj.version || obj.v || obj.date || '';
      const rest = Object.entries(obj).filter(([k]) => !['version', 'v'].includes(k)).map(([k, x]) => `${k}: ${typeof x === 'object' ? JSON.stringify(x) : x}`).join('\n');
      return `<div class="ls-ver"><b>${escapeHtml(String(ver))}</b><div style="white-space:pre-wrap;color:var(--text2)">${escapeHtml(rest)}</div></div>`;
    }).join('') : `<div class="ds-mono">no version_history in this spec — the living-model rule wants one (the audit trail of in-place edits)</div>`;
    else if (LSPEC.view === 'gaps') body = p.gaps.length ? `<div class="ls-tree">${p.gaps.map(g => `<div style="padding:4px 0;border-bottom:1px solid var(--b0)">${_lsTree(g, 0)}</div>`).join('')}</div>` : `<div class="ds-mono">no gaps recorded</div>`;
    else if (LSPEC.view === 'addenda') body = p.addenda.length ? p.addenda.slice().reverse().map(a => `<details class="ls-sec"><summary>${escapeHtml(a.title)}<span>line ${a.line}</span></summary><div class="ls-tree"><span class="s">${escapeHtml(a.text || '(banner only)')}</span></div></details>`).join('') : `<div class="ds-mono">no addenda — drift is recorded as a dated "# ── ADDENDUM" banner (docs/CLAUDE.md rule 4)</div>`;
    else body = p.sections.map((s, i) => `<details class="ls-sec" ${i < 2 ? 'open' : ''}><summary>${escapeHtml(s.key)}<span>${s.kind}${s.size ? ` · ${s.size}` : ''}</span></summary><div class="ls-tree">${s.value !== undefined ? _lsTree(s.value, 0) : `<span class="s">line ${s.line || '?'}</span>`}</div></details>`).join('');
    main = `<div class="ls-head">
        <div class="ls-name">${escapeHtml(m.name || o.path.split('/').pop())}${m.version ? ` <span style="color:var(--mint);font-size:11px">v${escapeHtml(String(m.version))}</span>` : ''}</div>
        <div class="ls-kv">${metaKeys.filter(k => !['name', 'version'].includes(k)).map(k => `<div>${escapeHtml(k)}</div><div>${escapeHtml(String(m[k]).slice(0, 600))}</div>`).join('')}<div>file</div><div>${escapeHtml(o.path)}${o.system ? ` · nexus/${escapeHtml(o.system)} (immutable base)` : ''}</div></div>
        ${p.error ? `<div class="ls-err">not valid YAML at line ${p.error.line ?? '?'}: ${escapeHtml(p.error.message)} — shown from its text</div>` : ''}
      </div><div class="ls-tabs">${tabs}</div>${body}`;
  }
  el.innerHTML = `<div class="ds"><div class="ds-label">living spec — ${d.specs.length} file${d.specs.length === 1 ? '' : 's'} in the spec folder${d.scope === 'nexus-all' ? ' (each system\'s own)' : ''}</div>
    <div class="ls-wrap"><div class="ls-files">${files}</div><div>${main}</div></div></div>`;
}

// a YAML value as an indented tree; long lists and deep levels are cut with a count, never silently
function _lsTree(v, depth) {
  if (depth > 7) return `<span class="s">…</span>`;
  if (v === null || v === undefined) return `<span class="s">—</span>`;
  if (typeof v === 'number' || typeof v === 'boolean') return `<span class="n">${escapeHtml(String(v))}</span>`;
  if (typeof v === 'string') return `<span class="s">${escapeHtml(v.length > 1500 ? v.slice(0, 1500) + ' …' : v)}</span>`;
  if (Array.isArray(v)) {
    const shown = v.slice(0, 120);
    return `<div class="i">${shown.map(x => `<div>· ${_lsTree(x, depth + 1)}</div>`).join('')}${v.length > shown.length ? `<div class="s">… ${v.length - shown.length} more</div>` : ''}</div>`;
  }
  if (typeof v === 'object') {
    const ks = Object.keys(v); const shown = ks.slice(0, 150);
    return `<div class="i">${shown.map(k => `<div><span class="k">${escapeHtml(k)}</span>: ${(v[k] && typeof v[k] === 'object') ? _lsTree(v[k], depth + 1) : _lsTree(v[k], depth + 1)}</div>`).join('')}${ks.length > shown.length ? `<div class="s">… ${ks.length - shown.length} more keys</div>` : ''}</div>`;
  }
  return `<span class="s">${escapeHtml(String(v))}</span>`;
}

function livingSpecOpen(p) { if (CURRENT_API_REPO) renderLivingSpec(CURRENT_API_REPO, p); }
function livingSpecView(v) { LSPEC.view = v; _lsPaint(); }
