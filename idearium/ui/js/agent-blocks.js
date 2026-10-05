'use strict';
// idearium/ui/js/agent-blocks.js — Settings → Agents → "what the agent is sent". 0.39.258.
// James: "not to inject anything into it that i cant edit in the agent settings." Every block of the repo agent's
// prompt is here: on/off, its full text, and the placeholders (data) it may carry. "preview" shows the exact first
// message the agent would be sent for a question — the same compose() the dispatch uses, not a copy of it.
// Uses app.js's api() and escapeHtml(); reads/writes GET/POST /api/repos/:uuid/agent/blocks.

const _AB = { repo: null, blocks: [], placeholders: {} };

const _AB_WHEN = { always: 'every dispatch', tools: 'guardian + ollama (tool loop)', guardian: 'guardian (browser agents) only', build: 'file builds (spec chunks) only' };

async function renderAgentBlocks(repo) {
  const el = document.getElementById('agent-blocks-section');
  if (!el) return;
  _AB.repo = repo;
  try {
    const r = await api(`/api/repos/${repo.uuid}/agent/blocks`);
    _AB.blocks = r.blocks || []; _AB.placeholders = r.placeholders || {};
  } catch (e) {
    el.innerHTML = `<div class="ds"><div class="ds-label">what the agent is sent</div><div class="ab-note">unavailable: ${escapeHtml(e.message)}</div></div>`;
    return;
  }
  el.innerHTML = `<div class="ds ab-wrap"><div class="ds-label">what the agent is sent</div>
    <div class="ab-note">This is the whole prompt, in this order. Nothing else is added by copilot, guardian or the provider tab.
      A <code>{placeholder}</code> is data filled in at send time — delete it and that data is not sent. Your question is always sent, even with its block off.</div>
    ${_AB.blocks.map(_abBlockHtml).join('')}
    <div class="ab-row">
      <button class="action-btn" onclick="agentBlocksSave()">save</button>
      <button class="action-btn" onclick="agentBlocksReset()">reset all to defaults</button>
      <input id="ab-preview-q" class="ab-text" style="min-height:0;width:220px" placeholder="question to preview (default: hello)">
      <button class="action-btn" onclick="agentBlocksPreview()">preview what is sent</button>
      <span id="ab-status" class="ab-status"></span>
    </div>
    <div id="ab-preview" class="ab-preview"></div>
  </div>`;
}

function _abBlockHtml(b) {
  const ph = (_AB.placeholders[b.id] || []).join(' ');
  return `<div class="ab-block${b.enabled ? '' : ' ab-off'}" id="ab-${b.id}">
    <div class="ab-head" onclick="agentBlockToggleOpen('${b.id}')">
      <input type="checkbox" ${b.enabled ? 'checked' : ''} onclick="event.stopPropagation();agentBlockEnable('${b.id}',this.checked)" title="send this block">
      <span class="ab-label">${escapeHtml(b.label)}</span>
      ${b.edited ? '<span class="ab-edited">edited</span>' : ''}
      <span class="ab-tag">${escapeHtml(_AB_WHEN[b.when] || b.when)}</span>
    </div>
    <div class="ab-body">
      <textarea class="ab-text" id="ab-text-${b.id}" spellcheck="false">${escapeHtml(b.text)}</textarea>
      ${ph ? `<div class="ab-ph">placeholders: ${escapeHtml(ph)}</div>` : ''}
      <div class="ab-row"><button class="action-btn" onclick="agentBlocksReset('${b.id}')">reset this block</button></div>
    </div>
  </div>`;
}

function agentBlockToggleOpen(id) { const n = document.getElementById(`ab-${id}`); if (n) n.classList.toggle('ab-open'); }

function agentBlockEnable(id, on) {
  const b = _AB.blocks.find(x => x.id === id); if (b) b.enabled = !!on;
  const n = document.getElementById(`ab-${id}`); if (n) n.classList.toggle('ab-off', !on);
}

function _abStatus(msg) { const s = document.getElementById('ab-status'); if (s) s.textContent = msg; }

async function agentBlocksSave() {
  if (!_AB.repo) return;
  const blocks = _AB.blocks.map(b => {
    const t = document.getElementById(`ab-text-${b.id}`);
    return { id: b.id, enabled: b.enabled, text: t ? t.value : b.text };
  });
  try {
    const r = await api(`/api/repos/${_AB.repo.uuid}/agent/blocks`, { method: 'POST', body: JSON.stringify({ blocks }) });
    _AB.blocks = r.blocks || _AB.blocks;
    await renderAgentBlocks(_AB.repo);
    _abStatus('saved — the next message uses this');
  } catch (e) { _abStatus(`not saved: ${e.message}`); }
}

async function agentBlocksReset(id) {
  if (!_AB.repo) return;
  if (!confirm(id ? `Reset "${id}" to its default text?` : 'Reset every block to its default text?')) return;
  try {
    await api(`/api/repos/${_AB.repo.uuid}/agent/blocks`, { method: 'POST', body: JSON.stringify({ reset: id ? [id] : true }) });
    await renderAgentBlocks(_AB.repo);
    _abStatus(id ? `${id} reset` : 'all reset');
  } catch (e) { _abStatus(`not reset: ${e.message}`); }
}

async function agentBlocksPreview() {
  if (!_AB.repo) return;
  const q = (document.getElementById('ab-preview-q') || {}).value || 'hello';
  const box = document.getElementById('ab-preview');
  try {
    const r = await api(`/api/repos/${_AB.repo.uuid}/agent/blocks/preview`, { method: 'POST', body: JSON.stringify({ message: q }) }, 15000);
    box.style.display = 'block';
    box.textContent = r.text;
    _abStatus(`${r.chars} chars · ${r.backend || 'copilot'} · context: ${r.context}${r.toolsFilled ? '' : ' · {tools} shown unfilled'} — unsaved edits are not in this preview`);
  } catch (e) { _abStatus(`preview failed: ${e.message}`); }
}
