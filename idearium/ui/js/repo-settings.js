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
  // §OP4 0.57.0 — James: "have the envirement and desktop tabs in the same manu, have it dynamic"
  { group: 'Environment', items: [['environment', 'Environment & desktop']] },
];
const RS_IDS = RS_CATEGORIES.flatMap(g => g.items.map(i => i[0]));
const RS_KEY = 'idearium.repoSettings.category';
const RS = { uuid: null, cat: null };

function _rsSavedCategory() {
  try { let v = localStorage.getItem(RS_KEY); if (v === 'desktop') v = 'environment'; return RS_IDS.includes(v) ? v : null; } catch (_) { return null; }   // storage may be blocked; 'desktop' lives in Environment since OP4
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
  if (id === 'desktop') id = 'environment';   // §OP4 0.57.0 — the desktop lives in Environment & desktop
  if (!RS_IDS.includes(id)) return;
  RS.cat = id; _rsSaveCategory(id);
  for (const b of document.querySelectorAll('.rs-item[data-rs]')) b.classList.toggle('on', b.dataset.rs === id);
  _rsPaint(CURRENT_API_REPO);
}

/** §0.47.0 OS5 — James: "the idearium settings still have iframes". The desktop's compartment, branching and VM, drawn
 *  here from the console's own detail (GET /api/settings/console/:uuid) — the same data settings.html shows, no frame. */
async function _rsDesktopDetail(repo) {
  const el = document.getElementById('rs-desktop-detail'); if (!el) return;
  let d, vm = null;
  try {
    [d, vm] = await Promise.all([
      api(`/api/settings/console/${encodeURIComponent(repo.uuid)}`, {}, 15000),
      api('/api/cos/testenv', {}, 15000).then(t => (t && t.vm) || null).catch(() => null),   // §OP4 — is the machine set up (QEMU + a base image)?
    ]);
  } catch (e) { el.innerHTML = `<div class="ds-mono">the compartment could not be read: ${escapeHtml(e.message)}</div>`; return; }
  if (!document.getElementById('rs-desktop-detail') || CURRENT_API_REPO !== repo) return;
  const c = d.compartment, dk = d.desktop, r = d.repo || repo, st = dk && dk.ok !== false ? dk.state : null;
  _rsDesktopActions(repo, { setUp: !!(vm && vm.ok), reason: vm ? vm.reason : 'the machine\'s setup could not be read', state: st });
  const kv = (label, text) => `<div class="ds"><div class="ds-label">${escapeHtml(label)}</div><div class="ds-mono">${escapeHtml(text)}</div></div>`;
  el.innerHTML = kv(`compartment${c ? ` · ${c.state}` : ''}`, c ? `name    ${c.name}\nid      ${c.id}\nroot    ${c.root || '—'}\nparent  ${c.parentId || '—'}${c.purpose ? `\npurpose ${c.purpose}` : ''}` : 'no compartment attached to this repo')
    + kv('branching', r.branchOf ? `branch ${r.branch || '?'} of ${r.branchOf}\nfiles: a git worktree of the original (one history) · VM disk: an overlay of the original's`
      : `original repo${(d.branches || []).length ? `\nbranches: ${d.branches.map(b => `${b.name} (${b.branch || '?'})`).join(', ')}` : '\nno branches yet'}`)
    + kv(`virtual machine${st ? ` · ${st}` : ''}`, dk && dk.ports ? `VNC ${dk.ports.vncPort} · websocket ${dk.ports.wsPort}${dk.branchedFrom ? ` · disk: branch of the ${dk.branchedFrom}` : ''}${dk.repoIn && dk.repoIn !== 'none' ? ` · files: ${dk.repoIn}` : ''}${dk.error ? `\nlast exit: ${dk.error}` : ''}`
      : 'not running — RAM, CPUs and network: Global → desktop.* · needs QEMU and a base image')
    ;   // §OP4 — stop is in the desktop's buttons above (_rsDesktopActions), not repeated here
}
/** §OP4 0.57.0 — the desktop's buttons, by its state. Not set up: ⚙ Set up desktop (and why). Set up: ▣ Open desktop ·
 *  ✎ Edit desktop (the same setup, to change the account, memory, CPUs, languages) · ⚙ (the desktop's settings in the
 *  console); running: ■ Stop in place of Edit. */
function _rsDesktopActions(repo, { setUp, reason, state }) {
  const el = document.getElementById('rs-desktop-actions'); if (!el || !repo.compartmentId) return;
  const gear = `<button class="action-btn" title="the desktop's settings — memory, CPUs, network, account" onclick="_rsDesktopSettings('${repo.uuid}')">⚙</button>`;
  if (!setUp) {
    el.innerHTML = `<button class="action-btn primary" onclick="openDesktopSetup(CURRENT_API_REPO)" title="install what the desktop needs and build its image">⚙ set up desktop</button>${gear}
      <span class="ds-mono" style="opacity:.7">${escapeHtml(reason || 'not set up yet')}</span>`;
    return;
  }
  const running = state === 'running' || state === 'booting';
  el.innerHTML = `<button class="action-btn primary" onclick="openRepoDesktop('${repo.uuid}')" title="boot this repo's VM if needed and open it as a desktop">▣ open desktop</button>`
    + (running ? `<button class="action-btn" onclick="_rsDesktopStop('${repo.uuid}')" title="stop the VM — its disk is kept">■ stop</button>`
               : `<button class="action-btn" onclick="openDesktopSetup(CURRENT_API_REPO)" title="change the desktop's account, memory, CPUs and languages">✎ edit desktop</button>`)
    + gear + `<span class="ds-mono" style="opacity:.7">${escapeHtml(running ? state : 'set up · stopped')}</span>`;
}
function _rsDesktopSettings(uuid) {
  if (typeof API_BASE === 'undefined' || !API_BASE) { if (typeof toast === 'function') toast('idearium is offline — its settings are served by it', 'err'); return; }
  const w = window.open(`${API_BASE}/settings.html?repo=${encodeURIComponent(uuid)}&tab=env`, 'idearium-settings', 'width=1280,height=900');
  if (!w && typeof toast === 'function') toast('the settings window was blocked — allow pop-ups for idearium', 'err');
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
  if (id === 'environment' || id === 'desktop') {
    // §OP4 0.57.0 — one menu: what the codebase needs, then its desktop; the desktop's buttons follow its state (_rsDesktopDetail)
    pane.innerHTML = head('Environment & desktop', 'Whether the code is downloaded and configured, what it needs installed, and its desktop.')
      + '<div id="repo-env-section"></div>'
      + `<div class="ds-label" style="margin-top:18px">desktop</div>
      <div class="ds"><div class="action-row" id="rs-desktop-actions">${repo.compartmentId ? '<span class="ds-mono">reading the desktop…</span>' : '<span class="ds-mono">no compartment attached — no desktop</span>'}</div></div>
      <div id="rs-desktop-detail"><div class="ds-mono">reading the compartment…</div></div>`;
    if (typeof renderRepoEnvironment === 'function') renderRepoEnvironment(repo);
    _rsDesktopDetail(repo);   // §0.47.0 OS5 — native, no iframe
    return;
  }

}
