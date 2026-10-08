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

// §0.47.0 SP2 — James: "the spec engine needs to have autocomplete for the areas that are blank". One quiet line above
// the build bar: what is blank in this spec (sections with no body, empty files), and ✦ draft — each blank part drafted
// as workshop proposals (POST …/spec/complete), reviewed and accepted in the workshop; the spec changes only then.
const LSBLANK = { key: null, data: null, busy: false, done: null };
async function lsBlanksLoad(p) {
  const repo = CURRENT_API_REPO; if (!repo) return;
  LSBLANK.key = `${repo.uuid}::${p}`; LSBLANK.data = null; LSBLANK.done = null;
  try { LSBLANK.data = await api(`/api/repos/${repo.uuid}/spec/blanks?path=${encodeURIComponent(p)}`, {}, 15000); } catch (_) { LSBLANK.data = null; }
  const el = document.getElementById('ls-blanks'); if (el) el.innerHTML = _lsBlanksHtml(p);
}
function _lsBlanksHtml() {
  const d = LSBLANK.data; if (!d) return '';
  const parts = [...(d.blank || []).map(b => b.title || b.id), ...(d.emptyFiles || []).map(f => f.split('/').pop())];
  if (LSBLANK.done) return `<div class="ls-blank-line"><span class="ls-blank-ok">✦ ${LSBLANK.done.n} draft${LSBLANK.done.n === 1 ? '' : 's'} ready</span><span>review and accept them in the workshop — the spec changes only when you do</span><button class="ls-blank-go" onclick="openWorkshop(null, '${escapeHtml(LSBLANK.done.id)}')">open the workshop ↗</button></div>`;
  if (!parts.length) return '';
  return `<div class="ls-blank-line"><span class="ls-blank-n">${parts.length} blank</span><span class="ls-blank-list" title="${escapeHtml(parts.join(', '))}">${escapeHtml(parts.join(' · '))}</span>
    <button class="ls-blank-go" ${LSBLANK.busy ? 'disabled' : ''} onclick="lsBlanksDraft()">${LSBLANK.busy ? 'drafting…' : '✦ draft them'}</button></div>`;
}
async function lsBlanksDraft() {
  const repo = CURRENT_API_REPO; if (!repo || !LSBLANK.data || LSBLANK.busy) return;
  LSBLANK.busy = true; const el = () => document.getElementById('ls-blanks'); if (el()) el().innerHTML = _lsBlanksHtml();
  try {
    const r = await api(`/api/repos/${repo.uuid}/spec/complete`, { method: 'POST', body: JSON.stringify({ path: LSBLANK.data.specPath }) }, 600000);
    const n = (r.results || []).reduce((k, x) => k + (x.proposals || 0), 0), bad = (r.results || []).filter(x => !x.ok);
    LSBLANK.done = { id: r.workshopId, n };
    if (bad.length && typeof toast === 'function') toast(`${bad.length} part(s) not drafted: ${bad.map(x => `${x.section} — ${x.error}`).join('; ').slice(0, 200)}`, 'err');
  } catch (e) { if (typeof toast === 'function') toast(`drafting failed: ${e.message}`, 'err'); }
  LSBLANK.busy = false; if (el()) el().innerHTML = _lsBlanksHtml();
}

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
      </div><div id="ls-blanks" class="ls-blanks">${_lsBlanksHtml(o.path)}</div><div id="ls-build" class="ls-build">${_lsBuildHtml()}</div><div class="ls-tabs">${tabs}</div>${body}`;
  }
  if (o && !o.error && LSBUILD.key !== `${LSPEC.uuid}::${o.path}`) specBuildLoad(o.path);
  if (o && !o.error && LSBLANK.key !== `${LSPEC.uuid}::${o.path}`) lsBlanksLoad(o.path);
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

// ── §0.39.280 BS9 — build the open spec ──────────────────────────────────────
// James (on a screenshot of this tab): "i want to have a build button." · "i want each spec to have the entire build
// split into phases, chunked, bottom up, and with the axioms" · "click on a spec in the spec tab and have it built.
// phases the same way." The spec's phasemap (<spec>-phasemap.spec, idearium/repo/spec-plan.js) is written by the
// repo's agent on "plan"; then its phases build one at a time, bottom-up, each after a Versionium snapshot
// (POST /api/repos/:uuid/spec/build → the Phases manager's build). Deviation from the baseline is shown here too.
const LSBUILD = { key: null, plan: null, dev: null, busy: false, error: null, waiting: false };
const _LS_LAYER_COLOR = { foundation: 'var(--violet)', library: 'var(--sky)', api: 'var(--mint)', cli: 'var(--amber)', automation: 'var(--amber)', ui: 'var(--coral)' };

async function specBuildLoad(specPath) {
  const repo = CURRENT_API_REPO; if (!repo || !specPath) return;
  const key = `${repo.uuid}::${specPath}`;
  Object.assign(LSBUILD, { key, plan: null, error: null });
  try {
    const [plan, dev] = await Promise.all([
      api(`/api/repos/${repo.uuid}/spec/plan?path=${encodeURIComponent(specPath)}`, {}, 30000),
      api(`/api/repos/${repo.uuid}/deviation`, {}, 60000).catch(() => null),
    ]);
    if (LSBUILD.key !== key) return;
    LSBUILD.plan = plan; LSBUILD.dev = dev;
  } catch (e) { if (LSBUILD.key === key) LSBUILD.error = e.message; }
  const el = document.getElementById('ls-build'); if (el) el.innerHTML = _lsBuildHtml();
}

function _lsDevLine() {
  const d = LSBUILD.dev; if (!d) return '';
  const pct = (x) => `${(x * 100).toFixed(1)}%`;
  const b = d.fromBaseline, v = d.sinceVersion;
  return `<div class="ls-dev" title="recalculated on every version and every major file change (${escapeHtml(d.reason || '')}, ${new Date(d.ts || d.at).toLocaleString()})">deviation — from baseline ${b ? `<b>${pct(b.fraction)}</b> (${b.added}+ ${b.removed}− ${b.changed}~)` : '<i>no baseline yet</i>'} · since last version ${v ? `<b>${pct(v.fraction)}</b> (${v.added}+ ${v.removed}− ${v.changed}~)` : '—'} <button class="ls-mini" onclick="specDeviationRecalc()">recalculate</button></div>`;
}

function _lsBuildHtml() {
  const p = LSBUILD.plan;
  if (LSBUILD.error) return `<div class="ls-bar"><span class="ls-err">build plan: ${escapeHtml(LSBUILD.error)}</span></div>`;
  if (!p) return `<div class="ls-bar"><span style="color:var(--text3)">reading the build plan…</span></div>`;
  if (!p.exists) return `<div class="ls-bar">
      <button class="ls-go" ${LSBUILD.busy ? 'disabled' : ''} onclick="specPlanAsk()">▶ Build this spec</button>
      <button class="ls-mini" ${LSBUILD.busy ? 'disabled' : ''} onclick="specPlanDerive()" title="no agent: one phase per section of this spec, its layer read from the section — written at once, refine it later">⚡ plan from the spec now</button>
      <span>first its phases: the repo's agent splits the whole build into phases — chunked, bottom-up (${escapeHtml((p.layers || []).join(' → '))}), with the axioms (§3.1 §3.3 §3.4 …) — into <code>${escapeHtml(p.mapPath)}</code>. If the agent writes none, the plan is derived from the spec's sections.</span></div>
    ${LSBUILD.waiting ? `<div class="ls-dev ls-waiting">the agent is planning… this updates when <code>${escapeHtml(p.mapPath)}</code> lands</div>` : ''}${_lsDevLine()}`;
  const next = p.phases.find(x => x.id === p.next);
  const done = p.phases.filter(x => x.status === 'done' || x.status === 'complete').length;
  const rows = p.phases.map(x => {
    const complete = x.status === 'done' || x.status === 'complete';
    return `<div class="ls-ph ${complete ? 'done' : ''} ${x.id === p.next ? 'next' : ''}">
      <span class="ls-ph-mark">${complete ? '✓' : x.id === p.next ? '◌' : '○'}</span>
      <span class="ls-ph-layer" style="color:${_LS_LAYER_COLOR[x.layer] || 'var(--text3)'}">${escapeHtml(x.layer || '?')}</span>
      <span class="ls-ph-id">${escapeHtml(x.key)}</span><span class="ls-ph-name" title="${escapeHtml(x.does || '')}">${escapeHtml(x.id.split('_').slice(1).join(' '))}</span>
      ${x.axioms.length ? `<span class="ls-ph-ax" title="axioms">${escapeHtml(x.axioms.join(' '))}</span>` : ''}
      ${complete ? '' : `<button class="ls-mini" ${LSBUILD.busy ? 'disabled' : ''} onclick="specBuildPhase('${escapeHtml(x.id)}')">▶ build</button>`}</div>`;
  }).join('');
  return `<div class="ls-bar">
      <button class="ls-go" ${LSBUILD.busy || !next || !p.valid ? 'disabled' : ''} onclick="specBuildPhase(null)">▶ Build next${next ? ` · ${escapeHtml(next.key)} (${escapeHtml(next.layer)})` : ''}</button>
      <span>${done} of ${p.phases.length} phases done · <code>${escapeHtml(p.mapPath)}</code>${p.specChanged ? ' · <span style="color:var(--amber)">the spec changed since it was planned</span>' : ''}</span>
      <button class="ls-mini" onclick="openPlanPanel && openPlanPanel({ map: '${escapeHtml(p.mapPath)}' })">plan ▸</button>
      <button class="ls-mini" onclick="specPlanAsk(true)" title="ask the agent to plan it again; the current map stays in versionium">re-plan</button></div>
    ${p.valid ? '' : `<div class="ls-err">not a valid bottom-up map — ${escapeHtml(p.problems.slice(0, 4).join(' · '))}</div>`}
    <details class="ls-phases" ${done < p.phases.length ? 'open' : ''}><summary>phases, bottom-up</summary>${rows}</details>${_lsDevLine()}`;
}

async function specPlanAsk(replan = false) {
  const repo = CURRENT_API_REPO; if (!repo || !LSPEC.path) return;
  LSBUILD.busy = true; document.getElementById('ls-build').innerHTML = _lsBuildHtml();
  try {
    const r = await api(`/api/repos/${repo.uuid}/spec/plan`, { method: 'POST', body: JSON.stringify({ path: LSPEC.path, replan }) }, 60000);
    toast(`planning ${LSPEC.path}: snapshot ${String(r.snapshot).slice(0, 12)} taken · the agent is writing ${r.mapPath}`, 'ok');
    if (typeof openPlanPanel === 'function') openPlanPanel({ map: r.mapPath });
    _specPlanWatch(LSPEC.path);
  } catch (e) { toast(`not planned: ${e.message}`, 'err'); }
  LSBUILD.busy = false; specBuildLoad(LSPEC.path);
}
// §0.39.284 W2 — the plan lands (the agent's, its reply's, or derived); watch for it so the tab fills without a click
let _specPlanTimer = null;
function _specPlanWatch(specPath, tries = 60) {
  clearTimeout(_specPlanTimer); LSBUILD.waiting = true;
  _specPlanTimer = setTimeout(async () => {
    if (LSPEC.path !== specPath) { LSBUILD.waiting = false; return; }
    await specBuildLoad(specPath);
    if (LSBUILD.plan && LSBUILD.plan.exists) { LSBUILD.waiting = false; const el = document.getElementById('ls-build'); if (el) el.innerHTML = _lsBuildHtml(); toast(`${LSBUILD.plan.mapPath}: ${LSBUILD.plan.phases.length} phases — the Phases tab has them`, 'ok'); if (typeof renderPhasesRefresh === 'function') renderPhasesRefresh(); return; }
    if (tries > 1) _specPlanWatch(specPath, tries - 1); else LSBUILD.waiting = false;
  }, 5000);
}
async function specPlanDerive(specPath = LSPEC.path) {
  const repo = CURRENT_API_REPO; if (!repo || !specPath) return null;
  LSBUILD.busy = true; const el0 = document.getElementById('ls-build'); if (el0) el0.innerHTML = _lsBuildHtml();
  let r = null;
  try {
    r = await api(`/api/repos/${repo.uuid}/spec/plan`, { method: 'POST', body: JSON.stringify({ path: specPath, derive: true }) }, 60000);
    toast(`${r.mapPath}: ${r.phases} phases, derived from the spec — build them bottom-up`, 'ok');
    if (typeof renderPhasesRefresh === 'function') renderPhasesRefresh();
  } catch (e) { toast(`not planned: ${e.message}`, 'err'); }
  LSBUILD.busy = false; if (LSPEC.path === specPath) specBuildLoad(specPath);
  return r;
}
async function specBuildPhase(phase) {
  const repo = CURRENT_API_REPO; if (!repo || !LSPEC.path) return;
  LSBUILD.busy = true; document.getElementById('ls-build').innerHTML = _lsBuildHtml();
  try {
    const r = await api(`/api/repos/${repo.uuid}/spec/build`, { method: 'POST', body: JSON.stringify({ path: LSPEC.path, phase }) }, 120000);
    toast(`${r.phase} (${r.layer}): snapshot ${String(r.snapshot).slice(0, 12)} · ${r.targetName}'s agent is building it`, 'ok');
    if (typeof openPlanPanel === 'function') openPlanPanel({ map: r.mapPath, focus: r.runId });
  } catch (e) { toast(`not built: ${e.message}`, 'err'); }
  LSBUILD.busy = false; specBuildLoad(LSPEC.path);
}
async function specDeviationRecalc() {
  const repo = CURRENT_API_REPO; if (!repo) return;
  try { LSBUILD.dev = await api(`/api/repos/${repo.uuid}/deviation`, { method: 'POST', body: '{}' }, 120000); const el = document.getElementById('ls-build'); if (el) el.innerHTML = _lsBuildHtml(); }
  catch (e) { toast(e.message, 'err'); }
}
