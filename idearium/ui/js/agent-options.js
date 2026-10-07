/* idearium/ui/js/agent-options.js — §0.47.0 OS4 + OS7: every agent option in the Agent tab, and its proposals.
 * Map: docs/2026-10-07-idearium-one-surface-phasemap.spec (OS4_every_agent_option_in_the_agent_tab, OS7_one_proposal_surface)
 * James: "need more settings moved into the correct tabs. like all agent options go into the agents tab" · "look in the
 * agent settings and plan, and code tab for the propals. make sure its enterprise grade, consistent with nexus axioms
 * and ideariums style."
 *
 * Folded sections under the Agent tab's head, the Plan panel's look (pp-actwrap / pp-sec):
 *   proposals    the work surface's cards (work-surface.js) — the same diff, Apply / Reject and "open in Code" the Plan
 *                panel and the Code tab show; one proposal surface, three places
 *   behaviour    tool scope and what happens to the code it writes — native controls, POST …/agent/settings
 *   prompt       every block it is sent (agent-blocks.js renderAgentBlocks)
 *   hat & tools  the persona it wears and the tools it carries (GET /api/settings/console/:uuid) · forge / teach /
 *                export / import (app.js)
 *   models       whether Ollama is wired in (ollama-check.js)
 * Who answers (copilot · ollama · claude-code · a guardian agent) stays where it is used: the Agent tab's cli bar.
 * Nothing is stored here; no iframe. */
const AO = { uuid: null, open: (() => { try { return new Set(JSON.parse(localStorage.getItem('idearium.ao.open') || '["proposals"]')); } catch (_) { return new Set(['proposals']); } })(), detail: null };

function _aoSaveOpen() { try { localStorage.setItem('idearium.ao.open', JSON.stringify([...AO.open])); } catch (_) { /* a per-browser convenience */ } }
function _aoSec(id, title, sub, body) {
  return `<details class="pp-actwrap ao-sec" data-ao="${id}" ${AO.open.has(id) ? 'open' : ''} ontoggle="aoToggle(this)"><summary class="pp-sec">${escapeHtml(title)}${sub ? ` <span class="ao-sub">${sub}</span>` : ''}</summary><div class="ao-body" id="ao-${id}">${body}</div></details>`;
}

/** agentOptionsHtml(repo, cfg) — the sections, folded as the person left them; their bodies fill as they open */
function agentOptionsHtml(repo, cfg) {
  if (AO.uuid !== repo.uuid) Object.assign(AO, { uuid: repo.uuid, detail: null });
  const ro = cfg && cfg.settingsFrom;
  const pending = (typeof WSURF !== 'undefined' && WSURF.uuid === repo.uuid && WSURF.data) ? (WSURF.data.files || []).filter(f => f.status === 'proposed' || f.status === 'staged').length : null;
  return `<div class="ao">
    ${_aoSec('proposals', 'proposals', pending ? `${pending} waiting` : '', '<div id="ao-ws" class="pp-ws"></div>')}
    ${_aoSec('behaviour', 'behaviour', escapeHtml([cfg && cfg.toolScope, cfg && cfg.injectMode].filter(Boolean).join(' · ')), _aoBehaviour(cfg, ro))}
    ${_aoSec('prompt', 'prompt', '', '<div id="agent-blocks-section"><div class="pp-empty">reading…</div></div>')}
    ${_aoSec('hat', 'hat & tools', '', '<div class="pp-empty">reading…</div>')}
    ${_aoSec('models', 'models', '', '<div id="ollama-check"></div>')}
  </div>`;
}

function _aoBehaviour(cfg, ro) {
  if (!cfg) return '<div class="pp-empty">the agent settings could not be read</div>';
  const sel = (key, list, cur) => `<select class="ao-select" ${ro ? 'disabled' : ''} onchange="aoSet('${key}', this.value, this)">${(list || []).map(o => `<option ${o === cur ? 'selected' : ''}>${escapeHtml(o)}</option>`).join('')}</select>`;
  return `${ro ? `<div class="ao-note">these settings belong to the original repo — change them there</div>` : ''}
    <div class="ao-row"><div><div class="ao-k">tools</div><div class="ao-d">harness — the code tools and the layers are listed, every tool allowed · all — every tool listed · project — only the hat's own</div></div>${sel('toolScope', cfg.toolScopes, cfg.toolScope)}</div>
    <div class="ao-row"><div><div class="ao-k">code it writes</div><div class="ao-d">review — waits for you, as a proposal · auto — written into the repo · off — kept, never written${(cfg.modes || []).length === 1 ? ' · a Nexus repo is always review' : ''}</div></div>${sel('injectMode', cfg.modes, cfg.injectMode)}</div>`;
}

async function aoSet(key, value, el) {
  const repo = CURRENT_API_REPO; if (!repo) return;
  el.disabled = true;
  try {
    const r = await api(`/api/repos/${repo.uuid}/agent/settings`, { method: 'POST', body: JSON.stringify({ [key]: value }) });
    const cfg = AGENT_SETTINGS.get(repo.uuid); if (cfg) Object.assign(cfg, { [key]: r[key] ?? value });
    if (typeof toast === 'function') toast(`${key === 'toolScope' ? 'tools' : 'code it writes'}: ${value}`, 'ok');
  } catch (e) { if (typeof toast === 'function') toast(e.message, 'err'); }
  el.disabled = false;
}

function aoToggle(d) {
  const id = d.dataset.ao; if (d.open) AO.open.add(id); else AO.open.delete(id); _aoSaveOpen();
  if (d.open) aoFill(id);
}
/** aoFill(id) — an open section's body, read when it opens (and when the tab is drawn with it open) */
async function aoFill(id) {
  const repo = CURRENT_API_REPO; if (!repo) return;
  if (id === 'proposals' && typeof wsLoad === 'function') { const w = document.getElementById('ao-ws'); if (w) { if (WSURF.data && WSURF.uuid === repo.uuid) wsPaint(w); wsLoad(w); } }
  if (id === 'prompt' && typeof renderAgentBlocks === 'function') renderAgentBlocks(repo);
  if (id === 'models' && typeof renderOllamaCheck === 'function') { const el = document.getElementById('ollama-check'); if (el && !el.dataset.done) { el.dataset.done = '1'; renderOllamaCheck(el); } }
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
/** agentOptionsMounted() — after the Agent tab drew: fill whatever is open */
function agentOptionsMounted() { for (const id of AO.open) aoFill(id); }
