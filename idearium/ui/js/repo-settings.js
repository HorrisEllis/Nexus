// ════════════════════════════════════════════════════════════════════════════
// §REPO SETTINGS — idearium/ui/js/repo-settings.js (0.39.310 VP7)
// UUID: nexus-idearium-ui-repo-settings-v1-0000-2026-1005-jamesbrooks-001
// Map: docs/2026-10-05-verified-primitives-phasemap.spec (VP7)
//
// James, 2026-10-05: "the settings tab needs to be cleaned up. Like the desktop envirement settings are shown at all
// times. Those need to be hidden or show when you clikc the button. Also the iframes. Needs to be rebuilt cleaner and
// more organized. With catagories of options like github. Not in a long list. In tabs."
//
// The repo's Settings tab: categories on the left, ONE pane at a time (GitHub's settings layout). Was one long column
// with the whole settings console in an iframe below the same sections rendered inline (the prompt blocks twice).
// Each pane reuses the renderer that already owned it — renderRepoAgentSettings (app.js), renderAgentBlocks
// (agent-blocks.js), renderRepoEnvironment (repo-environment.js) — so only one copy of any section exists at a time.
// A view that lives only in the settings console (Hat & tools, the desktop's VM details, the agent's tool scope and
// inject mode) is shown as that ONE view (settings.html?tab=…&embed=1&single=1 — no console nav, no tab strip), and
// only when its button is clicked. The settings console page still has everything (⚙ settings console).
// ════════════════════════════════════════════════════════════════════════════

const RS_CATEGORIES = [
  { group: 'Repository', items: [['general', 'General'], ['repository', 'Files & danger zone']] },
  { group: 'Agent', items: [['agent', 'Agent'], ['prompt', 'Prompt'], ['hat', 'Hat & tools']] },
  { group: 'Environment', items: [['environment', 'Environment'], ['desktop', 'Desktop']] },
];
const RS_IDS = RS_CATEGORIES.flatMap(g => g.items.map(i => i[0]));
const RS_KEY = 'idearium.repoSettings.category';
const RS = { uuid: null, cat: null };

function _rsSavedCategory() {
  try { const v = localStorage.getItem(RS_KEY); return RS_IDS.includes(v) ? v : null; } catch (_) { return null; }   // storage may be blocked
}
function _rsSaveCategory(id) { try { localStorage.setItem(RS_KEY, id); } catch (_) { /* a per-browser convenience only */ } }

function renderRepoSettings(repo) {
  const el = document.getElementById('repo-subtab-settings');
  if (!el || !repo) return;
  if (RS.uuid !== repo.uuid) RS.uuid = repo.uuid;
  if (!RS.cat) RS.cat = _rsSavedCategory() || 'general';
  el.innerHTML = `<div class="rs">
    <nav class="rs-nav" aria-label="settings categories">
      ${RS_CATEGORIES.map(g => `<div class="rs-group">${escapeHtml(g.group)}</div>` + g.items.map(([id, name]) =>
        `<button class="rs-item${RS.cat === id ? ' on' : ''}" data-rs="${id}" onclick="repoSettingsShow('${id}')">${escapeHtml(name)}</button>`).join('')).join('')}
      <button class="rs-item rs-console" onclick="openSettingsConsole('${repo.uuid}')" title="Every compartment and agent setting, in its own window">⚙ settings console</button>
    </nav>
    <section class="rs-pane" id="rs-pane"></section>
  </div>`;
  _rsPaint(repo);
}

function repoSettingsShow(id) {
  if (!RS_IDS.includes(id)) return;
  RS.cat = id; _rsSaveCategory(id);
  for (const b of document.querySelectorAll('.rs-item[data-rs]')) b.classList.toggle('on', b.dataset.rs === id);
  _rsPaint(CURRENT_API_REPO);
}

/** one console view, only when asked: settings.html in single-view embed (no console nav, no tab strip) */
function _rsConsoleView(repo, tab, title) {
  if (!API_BASE || !repo) return '<div class="ds-mono">the settings console is not reachable from here</div>';
  return `<iframe class="rs-embed" src="${API_BASE}/settings.html?repo=${encodeURIComponent(repo.uuid)}&tab=${encodeURIComponent(tab)}&embed=1&single=1" title="${escapeHtml(title)}"></iframe>`;
}
function repoSettingsReveal(btn, targetId, tab, title) {
  const t = document.getElementById(targetId); if (!t) return;
  const open = !t.hidden;
  if (open) { t.hidden = true; t.innerHTML = ''; btn.textContent = btn.dataset.show; return; }
  t.innerHTML = _rsConsoleView(CURRENT_API_REPO, tab, title); t.hidden = false; btn.textContent = btn.dataset.hide;
}
function _rsRevealButton(label, targetId, tab, title) {
  return `<button class="action-btn" data-show="${escapeHtml(label)}" data-hide="hide ${escapeHtml(label.replace(/^show\s+/, ''))}" onclick="repoSettingsReveal(this,'${targetId}','${tab}','${escapeHtml(title)}')">${escapeHtml(label)}</button>
    <div class="rs-reveal" id="${targetId}" hidden></div>`;
}

function _rsPaint(repo) {
  const pane = document.getElementById('rs-pane'); if (!pane || !repo) return;
  const head = (title, note) => `<div class="rs-head"><h3>${escapeHtml(title)}</h3>${note ? `<div class="rs-note">${note}</div>` : ''}</div>`;
  const id = RS.cat;
  if (id === 'general') {
    const compartmentLine = repo.compartmentId ? `compartment ${repo.compartmentId}` : 'compartment — none attached';
    const branchLine = repo.branchOf ? `branch ${repo.branch || '—'} of repo ${repo.branchOf}\nfiles: a git worktree of the original (shared history); VM disk: an overlay of the original's` : 'its own files and compartment';
    pane.innerHTML = head('General', 'What this repo is and where it came from.')
      + `<div class="ds"><div class="ds-label">compartment</div><div class="ds-mono">${escapeHtml(compartmentLine)}</div></div>
      <div class="ds"><div class="ds-label">environment</div><div class="ds-mono">${escapeHtml(branchLine)}</div></div>
      <div class="ds"><div class="ds-label">provenance</div><div class="ds-mono">source ${escapeHtml(repo.source || 'unknown')}\nspec ${escapeHtml(repo.specUuid || '—')}\nidea ${escapeHtml(repo.ideaUuid || '—')}\npromoted from ${escapeHtml(repo.promotedFromSpec || '—')}</div></div>`;
    return;
  }
  if (id === 'repository') {
    pane.innerHTML = head('Files & danger zone')
      + `<div class="ds"><div class="ds-label">files</div><div class="action-row">
        ${repo.immutable ? '' : `<button class="action-btn" onclick="addApiRepoFile('${repo.uuid}')">+ add file</button>
        <button class="action-btn" onclick="forkApiRepo('${repo.uuid}')">⑂ fork</button>`}
        <button class="action-btn" onclick="exportApiRepo()">⇩ export .zip</button></div></div>
      <div class="rs-danger"><div class="ds-label">danger zone</div>
        ${repo.immutable ? '<div class="ds-mono" title="0.39.266 — its lifecycle belongs to the nexus-self sync">immutable — edit on a COS branch, apply through the gate</div>'
          : '<div class="rs-danger-row"><div><b>Delete this repo</b><div class="rs-note">It is archived, not erased — see the delete dialog.</div></div><button class="action-btn danger" onclick="openDeleteRepoModal()">✕ delete repo</button></div>'}
      </div>`;
    return;
  }
  if (id === 'agent') {
    pane.innerHTML = head('Agent', 'The agent this compartment wears its hat on: who answers, what it learned, the code it wrote.')
      + `<div id="repo-agents-section"><div class="ds-mono">loading…</div></div>
      <div class="ds"><div class="ds-label">advanced</div><div class="rs-note">Tool scope and what happens to code the agent writes.</div>
        ${_rsRevealButton('show advanced settings', 'rs-agent-adv', 'agent', 'agent settings')}</div>`;
    renderRepoAgentSettings(repo);
    return;
  }
  if (id === 'prompt') {
    pane.innerHTML = head('Prompt', 'Everything the agent is sent, block by block — edit, switch off, preview.')
      + '<div id="agent-blocks-section"><div class="ds-mono">loading…</div></div>';
    if (typeof renderAgentBlocks === 'function') renderAgentBlocks(repo);
    return;
  }
  if (id === 'hat') {
    pane.innerHTML = head('Hat & tools', 'The persona this repo\'s agent wears and the tools it carries.')
      + _rsConsoleView(repo, 'hat', 'hat and tools');
    return;
  }
  if (id === 'environment') {
    pane.innerHTML = head('Environment', 'Whether the code is downloaded and configured, and what this codebase needs installed.')
      + '<div id="repo-env-section"></div>';
    if (typeof renderRepoEnvironment === 'function') renderRepoEnvironment(repo);
    return;
  }
  if (id === 'desktop') {
    pane.innerHTML = head('Desktop', 'The compartment\'s VM, opened as a desktop in a Clear Glass window.')
      + `<div class="ds"><div class="action-row">
        ${repo.compartmentId ? `<button class="action-btn primary" onclick="openRepoDesktop('${repo.uuid}')" title="Boot this repo's VM and open it as a desktop (Clear Glass window)">▣ open desktop</button>` : '<span class="ds-mono">no compartment attached — no desktop</span>'}
      </div></div>
      <div class="ds"><div class="ds-label">desktop settings</div><div class="rs-note">The VM's state, ports, branch and stop — hidden until you ask.</div>
        ${_rsRevealButton('show desktop settings', 'rs-desktop-settings', 'env', 'desktop settings')}</div>`;
  }
}
