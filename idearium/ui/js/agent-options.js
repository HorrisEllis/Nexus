/* idearium/ui/js/agent-options.js — §0.48.0 OS8: every agent setting, in Settings → Agents.
 * Map: docs/2026-10-07-idearium-one-surface-phasemap.spec (OS8_settings_agents_holds_every_agent_option)
 * James: "no. all agent settings and options in the options tab under agents. the agents tab should maybe merge with the
 * code tab." (0.47.0 had put them in an Agent tab — reversed.)
 *
 * The panes repo-settings.js shows under its Agents group, each drawn natively (no iframe), nothing stored here:
 *   behaviour    who answers by default and its Ollama model, tool scope, what happens to the code it writes
 *                (POST …/agent/settings)
 *   prompt       every block it is sent (agent-blocks.js renderAgentBlocks)
 *   hat & tools  the persona it wears, the tools it carries, what it learned · teach / export / import / forge (app.js)
 *   models       whether Ollama is wired in (ollama-check.js)
 * The agent itself — the conversation, its proposals, its live feed — is the Code tab's (code-surface.js, OS9). */
const AO = { uuid: null, detail: null, models: null };

/** agentSettingsPane(id, repo) — the pane's HTML; agentSettingsFill(id) reads what it needs after it is drawn */
function agentSettingsPane(id, repo) {
  if (AO.uuid !== repo.uuid) Object.assign(AO, { uuid: repo.uuid, detail: null });
  const cfg = typeof AGENT_SETTINGS !== 'undefined' ? AGENT_SETTINGS.get(repo.uuid) : null;
  if (id === 'agent-behaviour') return `<div class="ao-body" id="ao-behaviour">${cfg ? _aoBehaviour(cfg, cfg.settingsFrom) : '<div class="pp-empty">reading…</div>'}</div>`;
  if (id === 'agent-prompt') return '<div id="agent-blocks-section"><div class="pp-empty">reading…</div></div>';
  if (id === 'agent-hat') return '<div class="ao-body" id="ao-hat"><div class="pp-empty">reading…</div></div>';
  if (id === 'agent-models') return '<div id="ollama-check"></div>';
  return '';
}
async function agentSettingsFill(id) {
  const repo = CURRENT_API_REPO; if (!repo) return;
  if (id === 'agent-behaviour') {
    let cfg = null; try { cfg = await api(`/api/repos/${repo.uuid}/agent/settings`); AGENT_SETTINGS.set(repo.uuid, cfg); } catch (_) {}
    if (!AO.models) { try { const m = await api('/api/ollama/models', {}, 8000); AO.models = (m.models || []).map(x => (typeof x === 'string' ? x : x.name)).filter(Boolean); } catch (_) { AO.models = []; } }
    const el = document.getElementById('ao-behaviour'); if (el) el.innerHTML = cfg ? _aoBehaviour(cfg, cfg.settingsFrom) : '<div class="pp-empty">the agent settings could not be read</div>';
  }
  if (id === 'agent-prompt' && typeof renderAgentBlocks === 'function') renderAgentBlocks(repo);
  if (id === 'agent-models' && typeof renderOllamaCheck === 'function') { const el = document.getElementById('ollama-check'); if (el) renderOllamaCheck(el); }
  if (id === 'agent-hat') return aoFill('hat');
}

function _aoBehaviour(cfg, ro) {
  if (!cfg) return '<div class="pp-empty">the agent settings could not be read</div>';
  const sel = (key, list, cur) => `<select class="ao-select" ${ro ? 'disabled' : ''} onchange="aoSet('${key}', this.value, this)">${(list || []).map(o => `<option ${o === cur ? 'selected' : ''}>${escapeHtml(o)}</option>`).join('')}</select>`;
  const models = ['', ...(AO.models || [])]; if (cfg.ollamaModel && !models.includes(cfg.ollamaModel)) models.push(cfg.ollamaModel);
  const modelSel = `<select class="ao-select" ${ro ? 'disabled' : ''} onchange="aoSet('ollamaModel', this.value || null, this)">${models.map(o => `<option value="${escapeHtml(o)}" ${o === (cfg.ollamaModel || '') ? 'selected' : ''}>${escapeHtml(o || "the bridge's default")}</option>`).join('')}</select>`;
  return `${ro ? `<div class="ao-note">these settings belong to the original repo — change them there</div>` : ''}
    <div class="ao-row"><div><div class="ao-k">who answers</div><div class="ao-d">copilot decides · ollama — a local model · claude-code — headless, in a copy of the repo · a guardian agent — through its own browser tab. The Code tab can pick another for one ask.</div></div>${sel('provider', cfg.providers, cfg.provider)}</div>
    <div class="ao-row"><div><div class="ao-k">ollama model</div><div class="ao-d">when Ollama answers</div></div>${modelSel}</div>
    <div class="ao-row"><div><div class="ao-k">tools</div><div class="ao-d">harness — the code tools and the layers are listed, every tool allowed · all — every tool listed · project — only the hat's own</div></div>${sel('toolScope', cfg.toolScopes, cfg.toolScope)}</div>
    <div class="ao-row"><div><div class="ao-k">code it writes</div><div class="ao-d">review — waits for you, as a proposal · auto — written into the repo · off — kept, never written${(cfg.modes || []).length === 1 ? ' · a Nexus repo is always review' : ''}</div></div>${sel('injectMode', cfg.modes, cfg.injectMode)}</div>`;
}

async function aoSet(key, value, el) {
  const repo = CURRENT_API_REPO; if (!repo) return;
  el.disabled = true;
  try {
    const r = await api(`/api/repos/${repo.uuid}/agent/settings`, { method: 'POST', body: JSON.stringify({ [key]: value }) });
    const cfg = AGENT_SETTINGS.get(repo.uuid); if (cfg) Object.assign(cfg, { [key]: r[key] ?? value });
    if (typeof toast === 'function') toast(`${({ toolScope: 'tools', injectMode: 'code it writes', provider: 'who answers', ollamaModel: 'ollama model' })[key] || key}: ${value || 'default'}`, 'ok');
  } catch (e) { if (typeof toast === 'function') toast(e.message, 'err'); }
  el.disabled = false;
}

/** aoFill(id) — an open section's body, read when it opens (and when the tab is drawn with it open) */
async function aoFill(id) {
  const repo = CURRENT_API_REPO; if (!repo) return;
  if (id === 'hat') {
    const el = document.getElementById('ao-hat'); if (!el) return;
    try { AO.detail = AO.detail || await api(`/api/settings/console/${encodeURIComponent(repo.uuid)}`, {}, 15000); }
    catch (e) { el.innerHTML = `<div class="pp-empty">the hat could not be read: ${escapeHtml(e.message)}</div>`; return; }
    const h = AO.detail.hat;
    el.innerHTML = (h ? `<div class="ao-row"><div><div class="ao-k">${escapeHtml(h.name || 'hat')}</div><div class="ao-d">${escapeHtml([h.baseAgent, h.model].filter(Boolean).join(' · '))} — generated from the repo and what it learned; to write your own, edit the persona block in prompt</div></div></div>
      <details class="ao-more"><summary>persona · ${(h.personaChars || (h.persona || '').length).toLocaleString()} chars</summary><pre class="ao-pre">${escapeHtml(h.persona || '')}</pre></details>
      <details class="ao-more"><summary>tools it carries · ${(h.toolScope || []).length || 'every tool, by scope'}</summary><pre class="ao-pre">${escapeHtml((h.toolScope || []).join('\n') || '(none listed — every tool, by its scope)')}</pre></details>`
      : '<div class="pp-empty">no hat yet — it is forged the first time its agent is asked something</div>')
      + await _aoLearned(repo)
      + `<div class="ao-acts">${h ? '<button class="pp-mini" onclick="agentTeach()">teach</button><button class="pp-mini" onclick="agentExport()">export</button><button class="pp-mini" onclick="agentImport()">import</button>' : '<button class="pp-mini" onclick="agentForgeHat()">forge this repo\'s agent</button>'}</div>`;
  }
}
async function _aoLearned(repo) {
  let obs = [];
  try { obs = (await api(`/api/repos/${repo.uuid}/agent/memory`, {}, 12000)).observations || []; } catch (_) { return ''; }
  if (!obs.length) return '';
  return `<details class="ao-more"><summary>what it learned · ${obs.length}</summary>${obs.slice(0, 60).map(o => `<div class="ao-obs"><span class="ao-k2">${escapeHtml(o.kind || '')}</span> ${escapeHtml(o.text || '')}${(o.occurrences || 1) > 1 ? ` <span class="ao-d">${o.occurrences}×</span>` : ''}</div>`).join('')}</details>`;
}
