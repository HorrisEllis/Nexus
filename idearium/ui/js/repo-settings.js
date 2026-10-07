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
  // §0.48.0 OS8 — James: "all agent settings and options in the options tab under agents". Every agent setting is
  // here, drawn natively (js/agent-options.js); the agent itself — talking to it, its proposals — is the Code tab.
  { group: 'Agents', items: [['agent-behaviour', 'Behaviour'], ['agent-prompt', 'Prompt'], ['agent-hat', 'Hat & tools'], ['agent-models', 'Models']] },
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
  if (!RS.cat || !RS_IDS.includes(RS.cat)) RS.cat = _rsSavedCategory() || 'general';
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

/** §0.47.0 OS5 — James: "the idearium settings still have iframes". The desktop's compartment, branching and VM, drawn
 *  here from the console's own detail (GET /api/settings/console/:uuid) — the same data settings.html shows, no frame. */
async function _rsDesktopDetail(repo) {
  const el = document.getElementById('rs-desktop-detail'); if (!el) return;
  let d;
  try { d = await api(`/api/settings/console/${encodeURIComponent(repo.uuid)}`, {}, 15000); }
  catch (e) { el.innerHTML = `<div class="ds-mono">the compartment could not be read: ${escapeHtml(e.message)}</div>`; return; }
  if (!document.getElementById('rs-desktop-detail') || CURRENT_API_REPO !== repo) return;
  const c = d.compartment, dk = d.desktop, r = d.repo || repo, st = dk && dk.ok !== false ? dk.state : null;
  const kv = (label, text) => `<div class="ds"><div class="ds-label">${escapeHtml(label)}</div><div class="ds-mono">${escapeHtml(text)}</div></div>`;
  el.innerHTML = kv(`compartment${c ? ` · ${c.state}` : ''}`, c ? `name    ${c.name}\nid      ${c.id}\nroot    ${c.root || '—'}\nparent  ${c.parentId || '—'}${c.purpose ? `\npurpose ${c.purpose}` : ''}` : 'no compartment attached to this repo')
    + kv('branching', r.branchOf ? `branch ${r.branch || '?'} of ${r.branchOf}\nfiles: a git worktree of the original (one history) · VM disk: an overlay of the original's`
      : `original repo${(d.branches || []).length ? `\nbranches: ${d.branches.map(b => `${b.name} (${b.branch || '?'})`).join(', ')}` : '\nno branches yet'}`)
    + kv(`virtual machine${st ? ` · ${st}` : ''}`, dk && dk.ports ? `VNC ${dk.ports.vncPort} · websocket ${dk.ports.wsPort}${dk.branchedFrom ? ` · disk: branch of the ${dk.branchedFrom}` : ''}${dk.repoIn && dk.repoIn !== 'none' ? ` · files: ${dk.repoIn}` : ''}${dk.error ? `\nlast exit: ${dk.error}` : ''}`
      : 'not running — RAM, CPUs and network: Global → desktop.* · needs QEMU and a base image')
    + (st === 'running' || st === 'booting' ? `<div class="action-row"><button class="action-btn" onclick="_rsDesktopStop('${repo.uuid}')">■ stop the VM</button><span class="ds-mono" style="opacity:.6">its disk is kept</span></div>` : '');
}
async function _rsDesktopStop(uuid) {
  try { await api(`/api/repos/${encodeURIComponent(uuid)}/desktop`, { method: 'DELETE', body: '{}' }); if (typeof toast === 'function') toast('VM stopping — its disk is kept', 'ok'); }
  catch (e) { if (typeof toast === 'function') toast(e.message, 'err'); }
  if (CURRENT_API_REPO) _rsDesktopDetail(CURRENT_API_REPO);
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
  // §0.48.0 OS8 — the Agents group
  const AGENT_PANES = { 'agent-behaviour': ['Behaviour', 'Who answers, which model, the tools it may use and what happens to the code it writes.'],
    'agent-prompt': ['Prompt', 'Everything the agent is sent, block by block — edit, switch off, preview.'],
    'agent-hat': ['Hat & tools', 'The persona this repo\'s agent wears, the tools it carries and what it has learned.'],
    'agent-models': ['Models', 'Whether Ollama is wired in: every installed model asked through copilot, and the route every caller gets.'] };
  if (AGENT_PANES[id] && typeof agentSettingsPane === 'function') {
    pane.innerHTML = head(...AGENT_PANES[id]) + agentSettingsPane(id, repo);
    agentSettingsFill(id);
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
        ${repo.compartmentId ? `<button class="action-btn primary" onclick="openRepoDesktop('${repo.uuid}')" title="Boot this repo's VM and open it as a desktop (Clear Glass window)">▣ open desktop</button> <button class="action-btn" onclick="openDesktopSetup(CURRENT_API_REPO)" title="§0.39.340 DK2 — the account, the VM's memory and CPUs, and the setup's progress">⚙ set up desktop</button>` : '<span class="ds-mono">no compartment attached — no desktop</span>'}
      </div></div>
      <div id="rs-desktop-detail"><div class="ds-mono">reading the compartment…</div></div>`;
    _rsDesktopDetail(repo);   // §0.47.0 OS5 — native, no iframe
  }

}
