// ════════════════════════════════════════════════════════════════════════════
// §ENVIRONMENT — idearium/ui/js/repo-environment.js (0.39.280 BS10)
// UUID: nexus-idearium-ui-repo-environment-v1-0000-2026-0929-jamesbrooks-001
// Map: docs/2026-09-29-build-surface-phasemap.spec (BS10)
//
// James: "also supposed to have per repo settings also like in the settings tab of the repos. it needs to run a check
// to make sure its downloaded and configured, it needs to make a envirement reletive to the codebase, like install all
// the needed dependancies, have a full list of additional options for the envirement."
//
// The Settings tab's Environment category (renderRepoSettings, repo-settings.js — 0.39.310: the option list behind a
// button; the "All settings" iframe below is gone, see repo-settings.js). Was two sections of the tab:
//   Environment   GET /api/repos/:uuid/environment — downloaded / configured / VM, each with its reason; the install
//                 plan the codebase needs (cos/testenv/detect.js); every option (cos/testenv/environment.js OPTIONS),
//                 editable, saved on the repo (POST …/environment); Set up environment (POST …/environment/setup).
//   All settings  the settings console's repo view (settings.html?repo=<uuid>&embed=1), in place.
// ════════════════════════════════════════════════════════════════════════════

const REPOENV = { uuid: null, data: null, edits: {}, showOptions: false };   // §0.39.310 VP7 — the option list behind a button

async function renderRepoEnvironment(repo) {
  const el = document.getElementById('repo-env-section'); if (!el || !repo) return;
  if (REPOENV.uuid !== repo.uuid) Object.assign(REPOENV, { uuid: repo.uuid, data: null, edits: {}, showOptions: false });
  el.innerHTML = `<div class="ds"><div class="ds-label">environment</div><div class="ds-mono">checking — downloaded, configured, the VM…</div></div>`;
  let d;
  try { d = await api(`/api/repos/${repo.uuid}/environment`, {}, 60000); }
  catch (e) { el.innerHTML = `<div class="ds"><div class="ds-label">environment</div><div class="ds-mono">could not check: ${escapeHtml(e.message)}</div></div>`; return; }
  if (CURRENT_API_REPO?.uuid !== repo.uuid) return;
  REPOENV.data = d; _envPaint();
}

function _envMark(v) { return v === true ? '<span style="color:var(--mint)">✓</span>' : v === false ? '<span style="color:var(--coral)">✗</span>' : '<span style="color:var(--text3)">?</span>'; }

function _envPaint() {
  const el = document.getElementById('repo-env-section'); const d = REPOENV.data; if (!el || !d) return;
  const c = d.check || {};
  const dl = c.downloaded || {}, cf = c.configured || {}, vm = c.vm || {}, pl = c.plan || {};
  const status = c.ready ? '<span style="color:var(--mint)">ready</span>' : '<span style="color:var(--amber)">not ready</span>';
  const opts = { ...(d.options || {}), ...REPOENV.edits };
  const groups = {};
  for (const o of d.catalogue || []) (groups[o.group] = groups[o.group] || []).push(o);
  const ctl = (o) => {
    const v = opts[o.key] !== undefined ? opts[o.key] : o.default;
    const on = `onchange="envEdit('${o.key}', this)"`;
    if (o.type === 'bool') return `<input type="checkbox" ${v ? 'checked' : ''} ${on}>`;
    if (o.type === 'enum') return `<select class="field-input env-in" ${on}>${o.values.map(x => `<option ${x === v ? 'selected' : ''}>${escapeHtml(x)}</option>`).join('')}</select>`;
    if (o.type === 'set') return o.values.map(x => `<label class="env-chk"><input type="checkbox" data-set="${o.key}" value="${escapeHtml(x)}" ${(v || []).includes(x) ? 'checked' : ''} onchange="envEditSet('${o.key}')"> ${escapeHtml(x)}</label>`).join('');
    if (o.type === 'int') return `<input class="field-input env-in" type="number" min="${o.min}" max="${o.max}" value="${escapeHtml(String(v))}" ${on}>`;
    if (o.type === 'map') return `<input class="field-input env-in" placeholder="KEY=value, KEY2=value" value="${escapeHtml(Object.entries(v || {}).map(([a, b]) => `${a}=${b}`).join(', '))}" ${on}>`;
    if (o.type === 'list') return `<input class="field-input env-in" placeholder="space or comma separated" value="${escapeHtml((v || []).join(' '))}" ${on}>`;
    return `<input class="field-input env-in" value="${escapeHtml(String(v || ''))}" ${on}>`;
  };
  const dirty = Object.keys(REPOENV.edits).length;
  el.innerHTML = `
    <div class="ds"><div class="ds-label">environment — ${status}${c.checkedAt ? ` · checked ${new Date(c.checkedAt).toLocaleTimeString()}` : ''}</div>
      <div class="ds-mono">${_envMark(dl.ok)} downloaded   ${dl.ok === null ? escapeHtml(dl.reason || '') : `${dl.files || 0} files${dl.missingCount ? ` · ${dl.missingCount} missing: ${escapeHtml((dl.missing || []).slice(0, 5).join(', '))}` : ''}${dl.differentCount ? ` · ${dl.differentCount} different` : ''}`}
${_envMark(cf.ok)} configured   ${cf.reason ? escapeHtml(cf.reason) : (cf.stacks || []).map(s => `${s.stack}: ${escapeHtml(s.detail)}`).join('\n               ')}
${_envMark(vm.available === false ? false : vm.missing && vm.missing.length ? false : vm.available)} VM           ${vm.available === false ? escapeHtml(vm.reason || 'unavailable') : `base image ${escapeHtml(vm.baseImage || '—')}${vm.runtimes ? ` · has ${escapeHtml(vm.runtimes.join(', '))}` : ''}${vm.missing && vm.missing.length ? ` · lacks ${escapeHtml(vm.missing.join(', '))}` : ''}`}${vm.extras && vm.extras.length ? ` · needs extras ${escapeHtml(vm.extras.join(', '))}` : ''}</div>
      ${(c.todo || []).length ? `<div class="ds-mono" style="color:var(--amber);margin-top:6px">to do:\n${c.todo.map(x => `  · ${escapeHtml(x)}`).join('\n')}</div>` : ''}
      <div class="ds-mono" style="margin-top:6px">relative to the codebase: ${escapeHtml(pl.describe || 'nothing detected')}
install  ${(pl.install || []).map(i => `${escapeHtml(i.command)}   <span style="opacity:.55"># ${escapeHtml(i.why)}</span>`).join('\n         ') || '—'}
test     ${(pl.suite || []).map(i => escapeHtml(i.command)).join(' ; ') || `${pl.testFiles || 0} test file(s)`}${(pl.gaps || []).length ? `\ngaps     ${pl.gaps.map(escapeHtml).join('; ')}` : ''}</div>
      <div class="action-row">
        <button class="action-btn primary" onclick="envSetup()" title="set up the VM: the desktop account, memory and CPUs, what this codebase needs — with its progress">⚙ set up environment</button>
        <button class="action-btn" onclick="renderRepoEnvironment(CURRENT_API_REPO)">↻ check again</button>
        ${d.setup ? `<span class="ds-mono" style="opacity:.7">setup job: ${escapeHtml(d.setup.state)}${d.setup.last && d.setup.last.length ? ` — ${escapeHtml(((e) => typeof e === 'string' ? e : (e && (e.msg || e.text)) || '')(d.setup.last[d.setup.last.length - 1]).slice(0, 90))}` : ''}</span>` : ''}
      </div></div>
    <div class="ds"><div class="ds-label">environment options — ${(d.catalogue || []).length}${dirty ? ` · <span style="color:var(--amber)">${dirty} unsaved</span>` : ''}</div>
      <div class="action-row"><button class="action-btn" onclick="REPOENV.showOptions=!REPOENV.showOptions;_envPaint()">${REPOENV.showOptions || dirty ? 'hide options' : `show options (${(d.catalogue || []).length})`}</button></div>
      ${!(REPOENV.showOptions || dirty) ? '' : Object.entries(groups).map(([g, list]) => `<div class="env-group"><div class="env-gname">${escapeHtml(g)}</div>${list.map(o => `<div class="env-row"><div><div class="env-k">${escapeHtml(o.key)}</div><div class="env-d">${escapeHtml(o.does)}</div></div><div class="env-c">${ctl(o)}</div></div>`).join('')}</div>`).join('')}
      <div class="action-row"><button class="action-btn primary" ${dirty ? '' : 'disabled'} onclick="envSave()">save options</button>${dirty ? '<button class="action-btn" onclick="REPOENV.edits={};_envPaint()">discard</button>' : ''}</div></div>`;
}

function envEdit(key, input) {
  const o = (REPOENV.data.catalogue || []).find(x => x.key === key); if (!o) return;
  let v = input.type === 'checkbox' ? input.checked : input.value;
  if (o.type === 'map') v = Object.fromEntries(String(v).split(',').map(x => x.split('=').map(y => y.trim())).filter(([a]) => a));
  if (o.type === 'list') v = String(v).split(/[\s,]+/).filter(Boolean);
  REPOENV.edits[key] = v; _envPaint();
}
function envEditSet(key) { REPOENV.edits[key] = [...document.querySelectorAll(`input[data-set="${key}"]:checked`)].map(x => x.value); _envPaint(); }
async function envSave() {
  const repo = CURRENT_API_REPO; if (!repo) return;
  try {
    const r = await api(`/api/repos/${repo.uuid}/environment`, { method: 'POST', body: JSON.stringify({ options: { ...(REPOENV.data.options || {}), ...REPOENV.edits } }) }, 30000);
    toast(`environment options saved${r.dropped && r.dropped.length ? ` (not kept: ${r.dropped.join(', ')})` : ''}`, r.dropped && r.dropped.length ? 'err' : 'ok');
    REPOENV.edits = {}; renderRepoEnvironment(repo);
  } catch (e) { toast(`not saved: ${e.message}`, 'err'); }
}
async function envSetup() {
  const repo = CURRENT_API_REPO; if (!repo) return;
  // §0.39.340 DK2 — the setup popup: the account, the VM, the setup's own progress (js/desktop-setup.js)
  if (typeof openDesktopSetup === 'function') { await openDesktopSetup(repo); return; }
  try {
    const r = await api(`/api/repos/${repo.uuid}/environment/setup`, { method: 'POST', body: '{}' }, 30000);
    toast(`environment setup ${r.job.state}${r.extras.length ? ` · extras ${r.extras.join(', ')}` : ''} — 10–40 minutes the first time`, 'ok');
    setTimeout(() => renderRepoEnvironment(repo), 1500);
  } catch (e) { toast(`setup not started: ${e.message}`, 'err'); }
}

// §0.39.310 VP7 — repoSettingsConsoleEmbed (the whole console in an iframe) is gone: repo-settings.js shows one console
// view, only when its button is clicked.
