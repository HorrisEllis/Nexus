'use strict';
/**
 * ui/brainos/brainos-automation.js
 * comp_id: nexus.ui.brainos.automation
 * uuid: nexus-ui-brainos-automation-v1-0000-2026-0911-001
 *
 * James: "the pipeline tab with all steps. automation with all the
 * tasker, automate, and all the conditions, triggers, delays,
 * scheduled, events etc." Fills the two real, previously-empty
 * top-level panels — #automation-body and #pipeline-body
 * (ui/brainos/index.html's panel-automation / panel-pipeline) were
 * dead stubs: their tab buttons existed, setMainTab() even had the
 * if-branches, but nothing ever rendered into them. The RIGHT-panel
 * condensed rt-automation/rt-pipeline tabs are a DIFFERENT, separate,
 * already-real thing (clear-glass macros / RAID queue) — untouched
 * here, no collision.
 *
 * §NO NEW BACKEND — every capability below is a thin client over
 * clear-glass/src/mesh/automation-engine.js's already-complete real
 * CRUD+run+log HTTP surface (/automation/workflows[...]) and
 * route-graph.js's already-complete real edge CRUD
 * (/agent-mesh/routes[...]) — both already wired into
 * clear-glass/src/main/index.js. Nothing here invents a server route.
 *
 * §HONEST STEP SET 2026-09-11 — James: "expand it all, invent,
 * innovate, enterprise grade." All 8 real automation-engine.js step
 * types are now offered: trigger, condition, agent, delay, command,
 * branch, http, notification. Two are honestly caveated in their own
 * config UI rather than presented as fully solved: branch's
 * mode/mergeStrategy controls dispatch order only, no real race/merge
 * (automation-engine.js has no completion signal to act on); http is
 * a real arbitrary-URL fetch, an inherent SSRF-shaped surface by
 * nature of the feature, never eval'd.
 * It does NOT invent a distinct "schedule" step type — the engine has
 * no separate scheduler, only trigger.config.intervalMs (checked by
 * tick() against wall-clock time); the UI below names that field
 * "Interval (ms)" on the trigger step itself, not a fabricated second
 * step type. It does NOT offer an "event" trigger — the engine has no
 * real event-driven trigger source today (tick() only ever checks
 * intervalMs); that's a genuine, separate, real gap, not simulated
 * here. Condition variables now also resolve against real cortex CFR
 * (cfr.*) and RAID queue (raid.*) data, not just live mesh fields —
 * see automation-engine.js's own _resolveVar.
 */
(function (global) {
  const CLEARGLASS_URL = 'http://127.0.0.1:7704';

  const STEP_TYPES = [
    { type: 'trigger',   label: 'Trigger' },
    { type: 'condition', label: 'Condition (if/then)' },
    { type: 'agent',     label: 'Agent' },
    { type: 'delay',     label: 'Delay' },
    { type: 'command',   label: 'Command' },
    { type: 'branch',    label: 'Branch / Parallel' },
    { type: 'http',      label: 'HTTP Request' },
    { type: 'notification', label: 'Notification' },
  ];
  // §STYLED 2026-09-11 — James: "like this. nothing less" (reference
  // screenshot's color-coded, iconed step rows). Reuses this app's own
  // existing real tokens (--warn/--relay/--idle/--online/--bridge/
  // --danger, already declared in brainos-app.css) rather than
  // inventing new hex values — one consistent palette, not a second one
  // for this panel. No entry added for a "schedule" type: the reference
  // shows TRIGGER and SCHEDULE as separate steps, but the real engine
  // has only one (trigger.config.intervalMs) — giving it a second,
  // differently-colored row here would visually promise a capability
  // that isn't real. Matching the reference's polish, not its
  // fabrication.
  const STEP_META = {
    trigger:      { icon: '⚡', color: 'var(--warn)' },
    condition:    { icon: '◆', color: 'var(--relay)' },
    agent:        { icon: '◆', color: 'var(--idle)' },
    delay:        { icon: '⏱', color: 'var(--online)' },
    command:      { icon: '⌘', color: 'var(--online)' },
    branch:       { icon: '∨', color: 'var(--relay)' },
    http:         { icon: '○', color: 'var(--danger)' },
    notification: { icon: '▲', color: 'var(--bridge)' },
  };
  // No longer-disabled list — every real step type automation-engine.js
  // runs is now offered above. Kept as an empty, named export point so a
  // future genuinely-not-built step type has somewhere honest to go
  // rather than silently appearing as if it were real.
  const NOT_BUILT_STEP_TYPES = [];
  // §FIXED 2026-09-12 -- James: "way more in the dropdown." Checked
  // the real source directly: clear-glass/src/mesh/agent-mesh.js's own
  // AGENT_REGISTRY has exactly 7 real entries -- claude, chatgpt,
  // gemini, perplexity, mistral, deepseek, grok. This list previously
  // had 'ollama' (not a real AGENT_REGISTRY member -- it's a SYSTEM
  // node in brainos-canvas.js's REAL_SYSTEMS, a different real thing)
  // and was missing 'grok' entirely. Not expanded to match the
  // reference's fuller list (ollama/lmstudio/koboldcpp/venice/mancer
  // as PROVIDERS) -- those aren't real agent-mesh members here.
  const REAL_AGENT_KEYS = ['claude', 'chatgpt', 'gemini', 'perplexity', 'mistral', 'deepseek', 'grok'];
  // §EXPANDED 2026-09-11 — mirrors clear-glass/src/mesh/automation-
  // engine.js's own real SYSTEM_PORTS (14 systems, same source as
  // brainos-canvas.js's REAL_SYSTEMS) — duplicated client-side by
  // value since this is a no-build-step static page, same convention
  // brainos-canvas.js's own header already documents for this reason.
  // Keep in sync with the server-side const of the same name.
  const SYSTEM_PORTS = {
    guardian: 7820, ollama: 3749, copilot: 3750, clearglass: 7704,
    orchestrator: 9000, cortex: 3748, architect: 3747, idearium: 4800,
    emerge: 4242, loom: 3752, eravos: 3751, diagnostic: 7825,
    versionium: 3754, autopilot: 7799,
  };

  function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  // §FOUND & FIXED 2026-09-11 — James: "where is it all?" Root cause,
  // confirmed by review not guessed: this function had no catch around
  // fetch() itself — only around .json() parsing. If clear-glass isn't
  // reachable at CLEARGLASS_URL (not running, wrong port, CORS), fetch()
  // rejects and every caller's `await api(...)` throws uncaught — the
  // skeleton HTML (already synchronous, e.g. the "+ NEW WORKFLOW"
  // button) renders, but everything downstream of that await silently
  // never runs. No error ever reached the screen; only an easy-to-miss
  // unhandled-rejection in devtools. Every caller below now gets a real
  // {ok:false, error} it can actually show, instead of a blank div.
  async function api(path, opts) {
    try {
      const r = await fetch(CLEARGLASS_URL + path, {
        headers: { 'Content-Type': 'application/json' },
        ...opts,
      });
      return await r.json().catch(() => ({ ok: false, error: 'invalid JSON response' }));
    } catch (e) {
      return { ok: false, error: `unreachable: ${e.message} (${CLEARGLASS_URL}${path})` };
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // AUTOMATION — real Tasker-style workflow list + step editor
  // ═══════════════════════════════════════════════════════════════════
  let _wfs = [];
  let _selectedWfId = null;

  function _stepSummary(step) {
    const c = step.config || {};
    switch (step.type) {
      case 'trigger':   return c.intervalMs ? `every ${c.intervalMs}ms` : 'manual only';
      case 'condition': return `if ${esc(c.var || '?')} ${esc(c.op || '==')} ${esc(c.value ?? '?')} → ${esc(c.onTrue || 'next')} / ${esc(c.onFalse || 'next')}`;
      case 'agent':     return `${esc(c.agentKey || '?')}: “${esc((c.prompt || '').slice(0, 60))}”`;
      case 'delay':     return `${c.ms || 0}ms`;
      case 'command':   return `${esc(c.method || 'GET')} ${esc(c.system || '?')}${esc(c.endpoint || '/health')}`;
      case 'branch':    return `${esc(c.mode || 'parallel')} · ${(c.agentKeys || []).join(', ') || '?'}`;
      case 'http':      return `${esc(c.method || 'GET')} ${esc(c.url || '?')}`;
      case 'notification': return `${esc(c.type || 'bus')}: “${esc((c.message || '').slice(0, 60))}”`;
      default:          return '';
    }
  }

  function _stepConfigFields(step) {
    const c = step.config || {};
    switch (step.type) {
      case 'trigger':
        return `<div class="field-row"><label>Interval (ms)</label><input type="number" data-cfg="intervalMs" value="${esc(c.intervalMs || '')}" placeholder="blank = manual only"></div>`;
      case 'condition':
        return `
          <div class="field-row"><label>Variable</label><input data-cfg="var" value="${esc(c.var || '')}" placeholder="e.g. deepseek.status, cfr.posterior, raid.pending"></div>
          <div class="field-row"><label>Operator</label>
            <select data-cfg="op">${['==', '!=', '>', '<', '>=', '<='].map((o) => `<option ${c.op === o ? 'selected' : ''}>${o}</option>`).join('')}</select>
          </div>
          <div class="field-row"><label>Value</label><input data-cfg="value" value="${esc(c.value ?? '')}"></div>
          <div class="field-row"><label>If true → step id</label><input data-cfg="onTrue" value="${esc(c.onTrue || '')}" placeholder="blank = next step"></div>
          <div class="field-row"><label>If false → step id</label><input data-cfg="onFalse" value="${esc(c.onFalse || '')}" placeholder="blank = next step"></div>`;
      case 'agent':
        return `
          <div class="field-row"><label>Agent</label>
            <select data-cfg="agentKey">${REAL_AGENT_KEYS.map((a) => `<option ${c.agentKey === a ? 'selected' : ''}>${a}</option>`).join('')}</select>
          </div>
          <div class="field-row"><label>Prompt</label><input data-cfg="prompt" value="${esc(c.prompt || '')}"></div>`;
      case 'delay':
        return `<div class="field-row"><label>Milliseconds</label><input type="number" data-cfg="ms" value="${esc(c.ms || 1000)}" placeholder="capped at 300000 (5m)"></div>`;
      case 'command':
        return `
          <div class="field-row"><label>System</label>
            <select data-cfg="system">${Object.keys(SYSTEM_PORTS).map((s) => `<option ${c.system === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
          </div>
          <div class="field-row"><label>Method</label>
            <select data-cfg="method">${['GET', 'POST'].map((m) => `<option ${c.method === m ? 'selected' : ''}>${m}</option>`).join('')}</select>
          </div>
          <div class="field-row"><label>Endpoint</label><input data-cfg="endpoint" value="${esc(c.endpoint || '/health')}"></div>
          <div class="field-row"><label>Body (POST, JSON)</label><input data-cfg="body" value="${esc(c.body || '')}"></div>`;
      case 'branch':
        return `
          <div class="field-row"><label>Mode</label>
            <select data-cfg="mode">${['parallel', 'sequential', 'race'].map((m) => `<option ${c.mode === m ? 'selected' : ''}>${m}</option>`).join('')}</select>
          </div>
          <div class="field-row"><label>Agents (comma list)</label><input data-cfg-list="agentKeys" value="${esc((c.agentKeys || []).join(','))}" placeholder="e.g. claude,deepseek"></div>
          <div class="field-row"><label>Prompt</label><input data-cfg="prompt" value="${esc(c.prompt || '')}"></div>
          <div class="field-row"><label>Merge strategy</label>
            <select data-cfg="mergeStrategy">${['first_wins', 'all', 'none'].map((m) => `<option ${c.mergeStrategy === m ? 'selected' : ''}>${m}</option>`).join('')}</select>
          </div>
          <div class="lr-meta" style="margin-top:2px">note: mode controls dispatch order only — no real merge/race is evaluated (see automation-engine.js header)</div>`;
      case 'http':
        return `
          <div class="field-row"><label>URL</label><input data-cfg="url" value="${esc(c.url || '')}" placeholder="https://…"></div>
          <div class="field-row"><label>Method</label>
            <select data-cfg="method">${['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].map((m) => `<option ${c.method === m ? 'selected' : ''}>${m}</option>`).join('')}</select>
          </div>
          <div class="field-row"><label>Body (JSON)</label><input data-cfg="body" value="${esc(c.body || '')}"></div>
          <div class="field-row"><label>Expected status</label><input type="number" data-cfg="expectedStatus" value="${esc(c.expectedStatus || 200)}"></div>`;
      case 'notification':
        return `
          <div class="field-row"><label>Channel</label>
            <select data-cfg="type">${['bus', 'console'].map((t) => `<option ${c.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
          </div>
          <div class="field-row"><label>Message</label><input data-cfg="message" value="${esc(c.message || '')}"></div>
          <div class="field-row"><label>Level</label>
            <select data-cfg="level">${['info', 'warn', 'error'].map((l) => `<option ${c.level === l ? 'selected' : ''}>${l}</option>`).join('')}</select>
          </div>`;
      default: return '';
    }
  }

  // §DECLUTTERED 2026-09-11 — James: "its getting cluttered." Root
  // cause: every one of _refreshWfList/_refreshLog/_refreshPipelineView
  // independently rendered the SAME "clear-glass unreachable" error in
  // full, in its own column — three copies of one fact, each wrapping
  // badly in a narrow column. One shared banner now carries that fact
  // once; the individual columns fall back to a plain, short neutral
  // state instead of repeating it.
  function _connBanner(msg, hostSelector) {
    const bannerId = hostSelector === '.pipe-wrap' ? 'brainos-pipe-conn-banner' : 'brainos-auto-conn-banner';
    let el = document.getElementById(bannerId);
    if (!msg) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement('div');
      el.id = bannerId;
      el.style.cssText = 'color:var(--danger);font-family:var(--mono);font-size:9px;margin-bottom:10px;padding:6px 8px;border:1px solid var(--danger);border-radius:2px;background:rgba(255,34,68,.08)';
      const host = document.querySelector(hostSelector);
      if (host) host.parentElement.insertBefore(el, host);
    }
    el.textContent = msg;
  }

  async function _refreshWfList() {
    const r = await api('/automation/workflows');
    _wfs = r.ok ? r.workflows : [];
    const listEl = document.getElementById('auto-wf-list');
    if (!listEl) return;
    if (!r.ok) {
      _connBanner(r.error?.startsWith('unreachable:') ? 'clear-glass unreachable at 127.0.0.1:7704 — start clear-glass to use Automation.' : r.error, '.auto-wrap');
      listEl.innerHTML = '<div class="empty-state">—</div>';
      return;
    }
    _connBanner(null, '.auto-wrap');
    _renderRunQueue();
    if (!_wfs.length) { listEl.innerHTML = '<div class="empty-state">no workflows yet</div>'; return; }
    listEl.innerHTML = _wfs.map((wf) => `
      <div class="node-item ${wf.id === _selectedWfId ? 'sel' : ''}" data-wf="${esc(wf.id)}">
        <div class="nd-dot" style="background:${wf.status === 'active' ? 'var(--online)' : 'var(--text3)'}"></div>
        <div class="nd-label">${esc(wf.name)}</div>
        <div class="nd-kind">${wf.steps.length} step${wf.steps.length === 1 ? '' : 's'}</div>
      </div>`).join('');
    listEl.querySelectorAll('[data-wf]').forEach((row) => {
      row.addEventListener('click', () => { _selectedWfId = row.dataset.wf; _renderEditor(); _refreshWfList(); });
    });
  }

  function _renderEditor() {
    const el = document.getElementById('auto-editor');
    if (!el) return;
    const wf = _wfs.find((w) => w.id === _selectedWfId);
    if (!wf) { el.innerHTML = '<div class="empty-state">select or create a workflow</div>'; return; }
    el.innerHTML = `
      <div class="field-row"><label>Name</label><input id="auto-name" value="${esc(wf.name)}"></div>
      <div class="field-row"><label>Status</label>
        <select id="auto-status">
          <option value="draft" ${wf.status === 'draft' ? 'selected' : ''}>Draft</option>
          <option value="active" ${wf.status === 'active' ? 'selected' : ''}>Active</option>
        </select>
      </div>
      <div style="display:flex;gap:6px;margin:8px 0 14px">
        <button class="hbtn g" id="auto-save">SAVE</button>
        <button class="hbtn g" id="auto-run">▶ RUN NOW</button>
        <button class="hbtn" id="auto-del">✕ DELETE</button>
      </div>
      <div id="auto-steps"></div>
      <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap">
        ${STEP_TYPES.map((s) => `<button class="hbtn" data-add="${s.type}" style="border-color:${STEP_META[s.type].color};color:${STEP_META[s.type].color}">${STEP_META[s.type].icon} ${esc(s.label)}</button>`).join('')}
        ${NOT_BUILT_STEP_TYPES.map((s) => `<button class="hbtn" disabled title="real, wanted, not-yet-built in automation-engine.js — see this file's header">+ ${esc(s.label)} (not built)</button>`).join('')}
      </div>`;

    const stepsEl = document.getElementById('auto-steps');
    stepsEl.innerHTML = wf.steps.map((step, i) => {
      const meta = STEP_META[step.type] || { icon: '•', color: 'var(--text2)' };
      return `
      <div class="astep" data-step="${esc(step.id)}">
        <div class="astep-row">
          <span class="astep-icon" style="color:${meta.color};border-color:${meta.color}">${meta.icon}</span>
          <span class="astep-num">${i + 1}</span>
          <span class="astep-type" style="color:${meta.color}">${esc(step.type.toUpperCase())}</span>
          <span class="astep-summary">${_stepSummary(step)}</span>
          <span class="astep-actions">
            <button class="hbtn" data-up="${esc(step.id)}" ${i === 0 ? 'disabled' : ''}>↑</button>
            <button class="hbtn" data-down="${esc(step.id)}" ${i === wf.steps.length - 1 ? 'disabled' : ''}>↓</button>
            <button class="hbtn" data-edit="${esc(step.id)}">EDIT</button>
            <button class="hbtn danger" data-rm="${esc(step.id)}">✕</button>
          </span>
        </div>
        ${i < wf.steps.length - 1 ? '<div class="astep-connector"><span></span><i></i></div>' : ''}
        <div class="step-config" id="cfg-${esc(step.id)}" style="display:none">
          ${_stepConfigFields(step)}
          <button class="hbtn g" data-save-cfg="${esc(step.id)}">SAVE STEP</button>
        </div>
      </div>`;
    }).join('') || '<div class="empty-state">no steps — add one below</div>';

    document.getElementById('auto-save').addEventListener('click', async () => {
      const name = document.getElementById('auto-name').value;
      const status = document.getElementById('auto-status').value;
      await api(`/automation/workflows/${wf.id}`, { method: 'PATCH', body: JSON.stringify({ name, status }) });
      _refreshWfList();
    });
    document.getElementById('auto-run').addEventListener('click', async (ev) => {
      ev.target.textContent = '…';
      const r = await api(`/automation/workflows/${wf.id}/run`, { method: 'POST' });
      ev.target.textContent = '▶ RUN NOW';
      _refreshLog();
      if (!r.ok) alert(`Run failed: ${r.error || 'unknown error'}`);
    });
    document.getElementById('auto-del').addEventListener('click', async () => {
      if (!confirm(`Delete "${wf.name}"? This cannot be undone.`)) return;
      await api(`/automation/workflows/${wf.id}`, { method: 'DELETE' });
      _selectedWfId = null;
      _refreshWfList(); _renderEditor();
    });
    stepsEl.querySelectorAll('[data-edit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cfgEl = document.getElementById(`cfg-${btn.dataset.edit}`);
        cfgEl.style.display = cfgEl.style.display === 'none' ? 'block' : 'none';
      });
    });
    stepsEl.querySelectorAll('[data-rm]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await api(`/automation/workflows/${wf.id}/steps/${btn.dataset.rm}`, { method: 'DELETE' });
        await _refreshWfList(); _renderEditor();
      });
    });
    stepsEl.querySelectorAll('[data-up],[data-down]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const stepId = btn.dataset.up || btn.dataset.down;
        const dir = btn.dataset.up ? 'up' : 'down';
        await api(`/automation/workflows/${wf.id}/steps/${stepId}/move`, { method: 'POST', body: JSON.stringify({ dir }) });
        await _refreshWfList(); _renderEditor();
      });
    });
    stepsEl.querySelectorAll('[data-save-cfg]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const stepId = btn.dataset.saveCfg;
        const cfgEl = document.getElementById(`cfg-${stepId}`);
        const config = {};
        cfgEl.querySelectorAll('[data-cfg]').forEach((input) => { config[input.dataset.cfg] = input.value; });
        cfgEl.querySelectorAll('[data-cfg-list]').forEach((input) => {
          config[input.dataset.cfgList] = input.value.split(',').map((s) => s.trim()).filter(Boolean);
        });
        await api(`/automation/workflows/${wf.id}/steps/${stepId}`, { method: 'PATCH', body: JSON.stringify({ config }) });
        await _refreshWfList(); _renderEditor();
      });
    });
    el.querySelectorAll('[data-add]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await api(`/automation/workflows/${wf.id}/steps`, { method: 'POST', body: JSON.stringify({ type: btn.dataset.add, config: {} }) });
        await _refreshWfList(); _renderEditor();
      });
    });
  }

  async function _refreshLog() {
    const el = document.getElementById('auto-log');
    if (!el) return;
    const r = await api('/automation/log');
    if (!r.ok) { el.innerHTML = '<div class="empty-state">—</div>'; return; }
    const log = r.log || [];
    el.innerHTML = log.length
      ? log.map((e) => `<div class="ll" style="color:${e.status === 'error' ? 'var(--danger)' : e.status === 'running' ? 'var(--idle)' : 'var(--text2)'}">${new Date(e.ts).toLocaleTimeString('en-GB', { hour12: false })} · ${esc(e.workflowName)} · ${esc(e.msg)}</div>`).join('')
      : '<div class="empty-state">no runs yet</div>';
  }

  let _autoLogTimer = null;
  function _renderRunQueue() {
    const el = document.getElementById('auto-runqueue');
    if (!el) return;
    // §BUILT 2026-09-11 -- real, derived from data already returned by
    // GET /automation/workflows (status + steps + lastRun) -- no new
    // endpoint. "next run" is computed the same way tick()'s own
    // wf._nextRun logic works (lastRun + intervalMs), not a separate
    // guess; a workflow with no interval trigger is real too -- it only
    // ever runs manually, shown honestly as such, not omitted.
    const active = _wfs.filter((w) => w.status === 'active');
    if (!active.length) { el.innerHTML = '<div class="empty-state">no active workflows</div>'; return; }
    el.innerHTML = active.map((wf) => {
      const trigger = wf.steps.find((s) => s.type === 'trigger');
      const intervalMs = parseInt(trigger?.config?.intervalMs, 10);
      let when = 'manual only';
      if (intervalMs > 0) {
        when = wf.lastRun ? `next ~${new Date(wf.lastRun + intervalMs).toLocaleTimeString('en-GB', { hour12: false })}` : 'pending first run';
      }
      return `<div class="lr-meta">${esc(wf.name)} -- ${when}</div>`;
    }).join('');
  }

  let _sidebarWfBound = false;
  async function mountAutomationPanel() {
    // §RESTRUCTURED 2026-09-12 — James: "sidebar is for the workflows."
    // The workflow list + its own "+ NEW WORKFLOW" button now live in
    // the persistent left sidebar (#sb-automation, index.html), not
    // duplicated inside this panel — bound once, independent of
    // automation-body's own mount flag, since the sidebar node exists
    // in the DOM from page load regardless of which tab is active.
    if (!_sidebarWfBound) {
      _sidebarWfBound = true;
      document.getElementById('auto-new').addEventListener('click', async () => {
        const r = await api('/automation/workflows', { method: 'POST', body: JSON.stringify({ name: 'New Workflow' }) });
        if (r.ok) { _selectedWfId = r.workflow.id; await _refreshWfList(); _renderEditor(); }
        else alert(`Failed to create workflow: ${r.error || 'unknown error'}`);
      });
    }
    const host = document.getElementById('automation-body');
    if (!host || host.dataset.mounted) { await _refreshWfList(); await _refreshLog(); _renderRunQueue(); return; }
    host.dataset.mounted = '1';
    host.innerHTML = `
      <div class="auto-toolbar">
        <button class="hbtn" id="auto-run-all">▶ RUN ALL ACTIVE</button>
        <button class="hbtn danger" id="auto-stop-all" title="sets every active workflow to draft so tick() stops re-triggering it -- cannot cancel a run already in progress (no real cancellation token in run()'s synchronous loop)">■ STOP ALL</button>
        <button class="hbtn" id="auto-export">↓ EXPORT</button>
        <button class="hbtn" id="auto-import">↑ IMPORT</button>
        <input type="file" id="auto-import-file" accept="application/json" style="display:none">
      </div>
      <div class="auto-wrap">
        <div class="auto-col auto-editor-col"><div id="auto-editor"><div class="empty-state">select or create a workflow</div></div></div>
        <div class="auto-col auto-log-col">
          <div class="panel-title" style="font-size:9px;margin-bottom:6px">RUN QUEUE</div>
          <div id="auto-runqueue"></div>
          <div class="panel-title" style="font-size:9px;margin:14px 0 6px">EXECUTION LOG</div>
          <div id="auto-log"></div>
        </div>
      </div>`;
    document.getElementById('auto-run-all').addEventListener('click', async () => {
      for (const wf of _wfs.filter((w) => w.status === 'active')) await api(`/automation/workflows/${wf.id}/run`, { method: 'POST' });
      await _refreshWfList(); _refreshLog();
    });
    document.getElementById('auto-stop-all').addEventListener('click', async () => {
      for (const wf of _wfs.filter((w) => w.status === 'active')) await api(`/automation/workflows/${wf.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'draft' }) });
      await _refreshWfList(); _renderEditor();
    });
    document.getElementById('auto-export').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(_wfs, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'automation-workflows.json'; a.click();
      URL.revokeObjectURL(a.href);
    });
    document.getElementById('auto-import').addEventListener('click', () => document.getElementById('auto-import-file').click());
    document.getElementById('auto-import-file').addEventListener('change', async (ev) => {
      const file = ev.target.files[0]; if (!file) return;
      try {
        const parsed = JSON.parse(await file.text());
        const list = Array.isArray(parsed) ? parsed : [parsed];
        for (const wf of list) await api('/automation/workflows', { method: 'POST', body: JSON.stringify({ name: wf.name, status: 'draft', steps: wf.steps || [] }) });
        await _refreshWfList();
      } catch (e) { alert(`Import failed: ${e.message}`); }
      ev.target.value = '';
    });
    await _refreshWfList();
    await _refreshLog();
    _renderRunQueue();
    if (!_autoLogTimer) _autoLogTimer = setInterval(_refreshLog, 4000); // real poll of a real log endpoint -- only source of "live" here, no fabricated ticks
  }

  // ═══════════════════════════════════════════════════════════════════
  // PIPELINE — real route-graph agent-chain builder
  // §HONEST SHAPE — route-graph.js is a flat list of {from,to,kind}
  // edges, not a step-numbered engine; a "pipeline" here is an ordered
  // chain of real agents where each completion enqueues the next
  // (kind:'pipeline'), built as N-1 real POST /agent-mesh/routes calls.
  // Reordering the chain removes and recreates edges — there is no
  // real "move" primitive on route-graph.js to call instead.
  // ═══════════════════════════════════════════════════════════════════
  // §REBUILT 2026-09-12 -- James: "the steps need to build on the
  // canvas... like the third image." Was a plain form (agent picker +
  // buttons) leaving the whole real canvas area empty. Now a real,
  // numbered step-box row, click-to-configure, matching the reference's
  // layout -- built on the exact same real schema as before
  // (route-graph.js's {from,to,systemPrompt,transform}), nothing new
  // invented server-side. Each step box IS one real agent in the
  // pending chain; building creates N-1 real edges, edge i carrying
  // step i's own real systemPrompt/transform (the only two per-edge
  // fields route-graph.js actually has -- no fabricated
  // provider/intent/model/max-tokens fields the reference shows but
  // this real engine doesn't store).
  let _chainSteps = []; // [{ id, agentKey, systemPrompt, transform }]
  let _editingStepId = null;

  function _newStepId() { return `s${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`; }

  async function _refreshPipelineView() {
    const el = document.getElementById('pipe-existing');
    if (!el) return;
    const r = await api('/agent-mesh/routes');
    if (!r.ok) {
      _connBanner(r.error?.startsWith('unreachable:') ? 'clear-glass unreachable at 127.0.0.1:7704 -- start clear-glass to use Pipeline.' : r.error, '.pipe-wrap');
      el.innerHTML = '<div class="empty-state">-</div>';
      return;
    }
    _connBanner(null, '.pipe-wrap');
    const routes = r.routes || [];
    if (!routes.length) { el.innerHTML = '<div class="empty-state">no real routes yet</div>'; return; }
    el.innerHTML = routes.map((route) => `
      <div class="list-row">
        <div class="lr-head">
          <span class="lr-name">${esc(route.from)} \u2192 ${esc(route.to)}</span>
          <span><span class="badge ${route.kind === 'feedback' ? 'warn' : 'idle'}">${esc(route.kind)}</span> <button class="hbtn" data-rmroute="${esc(route.id)}">\u2715</button></span>
        </div>
        ${route.systemPrompt ? `<div class="lr-meta">prompt: ${esc(route.systemPrompt)}</div>` : ''}
      </div>`).join('');
    el.querySelectorAll('[data-rmroute]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await api(`/agent-mesh/routes/${btn.dataset.rmroute}`, { method: 'DELETE' });
        _refreshPipelineView();
      });
    });
  }

  function _closeStepPopup() {
    const el = document.getElementById('pipe-step-popup');
    if (el) el.remove();
    _editingStepId = null;
  }

  function _openStepPopup(step, anchorEl) {
    _closeStepPopup();
    _editingStepId = step.id;
    const rect = anchorEl.getBoundingClientRect();
    const popup = document.createElement('div');
    popup.id = 'pipe-step-popup';
    popup.className = 'pipe-step-popup';
    popup.style.left = `${rect.left}px`;
    popup.style.top = `${rect.bottom + 8}px`;
    const isFirst = _chainSteps.indexOf(step) === 0;
    popup.innerHTML = `
      <div class="panel-title" style="font-size:10px;margin-bottom:10px">STEP ${_chainSteps.indexOf(step) + 1}</div>
      <div class="field-row"><label>Agent</label>
        <select id="ps-agent">${REAL_AGENT_KEYS.map((a) => `<option ${step.agentKey === a ? 'selected' : ''}>${a}</option>`).join('')}</select>
      </div>
      <div class="field-row"><label>Intent</label>
        <input id="ps-intent" list="ps-intent-list" value="${esc(step.intent || '')}" placeholder="e.g. code, summarize, general">
        <datalist id="ps-intent-list"><option value="general"><option value="code"><option value="summarize"><option value="research"></datalist>
        <button class="hbtn" id="ps-suggest" title="real GET cortex:3748/api/raid/decide -- suggests an agent, does not auto-apply">SUGGEST</button>
      </div>
      <div id="ps-suggest-result" class="lr-meta" style="margin:-4px 0 8px"></div>
      <div class="field-row"><label>Command</label><input id="ps-prompt" value="${esc(step.systemPrompt || '')}" placeholder="the instruction/directive for this agent"></div>
      <div class="field-row"><label>Input / data</label>
        <input id="ps-input-data" value="${esc(step.inputData || '')}" placeholder="${isFirst ? 'the real dispatch input when you Run Pipeline' : 'reference only -- real input is the previous step output'}">
        <button class="hbtn" id="ps-file-pick" title="reads a local file's text content into this field">FILE</button>
        <input type="file" id="ps-file-input" style="display:none">
      </div>
      <div class="field-row"><label>Transform</label><input id="ps-transform" value="${esc(step.transform || '')}" placeholder="optional, e.g. {{output}}.toUpperCase()-style not supported -- plain {{output}} substitution only"></div>
      <div style="display:flex;gap:6px;margin-top:10px">
        <button class="hbtn" id="ps-cancel">CANCEL</button>
        <button class="hbtn danger" id="ps-delete">DELETE</button>
        <button class="hbtn g" id="ps-save">SAVE</button>
      </div>`;
    document.body.appendChild(popup);
    // §RESTRUCTURED 2026-09-12 -- James: "Agent dropdown / intent
    // dropdown / command / input and data." "Command" is the same real
    // route-graph.js systemPrompt field, relabeled for what it actually
    // is (the instruction, not a hidden system message). "Input/data" is
    // new, client-side only -- route-graph.js has no per-step input
    // field; it's honest about its own scope right in its own
    // placeholder: real for step 1 (becomes the real dispatch prompt on
    // Run Pipeline, replacing the old separate PIPELINE INPUT box),
    // reference-only for later steps since their real input is whatever
    // the previous step's agent actually returned (onAgentComplete),
    // not something this UI can inject.
    document.getElementById('ps-file-pick').addEventListener('click', () => document.getElementById('ps-file-input').click());
    document.getElementById('ps-file-input').addEventListener('change', async (ev) => {
      const file = ev.target.files[0]; if (!file) return;
      try { document.getElementById('ps-input-data').value = await file.text(); }
      catch (e) { alert(`Could not read file as text: ${e.message}`); }
      ev.target.value = '';
    });
    document.getElementById('ps-suggest').addEventListener('click', async () => {
      const intent = document.getElementById('ps-intent').value || 'general';
      const resultEl = document.getElementById('ps-suggest-result');
      resultEl.textContent = 'asking RAID...';
      try {
        const r = await fetch(`http://127.0.0.1:3748/api/raid/decide?intent=${encodeURIComponent(intent)}`).then((res) => res.json());
        if (!r.ok) { resultEl.textContent = `RAID decide failed: ${r.error || 'unknown'}`; return; }
        resultEl.textContent = `RAID suggests: ${r.agent} (${r.reason})`;
        if (REAL_AGENT_KEYS.includes(r.agent)) {
          document.getElementById('ps-agent').value = r.agent;
        } else {
          resultEl.textContent += ` -- not a real pipeline agent option, left as-is`;
        }
      } catch (e) { resultEl.textContent = `RAID unreachable: ${e.message}`; }
    });
    document.getElementById('ps-cancel').addEventListener('click', _closeStepPopup);
    document.getElementById('ps-delete').addEventListener('click', () => {
      _chainSteps = _chainSteps.filter((s) => s.id !== step.id);
      _closeStepPopup(); _renderChainBuilder();
    });
    document.getElementById('ps-save').addEventListener('click', () => {
      step.intent = document.getElementById('ps-intent').value;
      step.agentKey = document.getElementById('ps-agent').value;
      step.systemPrompt = document.getElementById('ps-prompt').value;
      step.inputData = document.getElementById('ps-input-data').value;
      step.transform = document.getElementById('ps-transform').value;
      _closeStepPopup(); _renderChainBuilder();
    });
  }

  function _renderChainBuilder() {
    const canvasEl = document.getElementById('pipe-canvas');
    if (!canvasEl) return;
    canvasEl.innerHTML = _chainSteps.map((step, i) => `
      <div class="pipe-step" data-step="${esc(step.id)}">
        <div class="pipe-step-box">
          <span class="pipe-step-num">${i + 1}</span>
          <span class="pipe-step-agent">${esc(step.agentKey)}</span>
          ${step.systemPrompt || step.transform || step.inputData ? '<span class="pipe-step-cfg-dot" title="has command/input/transform"></span>' : ''}
        </div>
        ${i < _chainSteps.length - 1 ? '<span class="pipe-step-arrow">\u2192</span>' : ''}
      </div>`).join('') || '<div class="empty-state">no steps -- add one below</div>';
    canvasEl.querySelectorAll('.pipe-step-box').forEach((box, i) => {
      box.addEventListener('click', () => _openStepPopup(_chainSteps[i], box));
    });
    document.getElementById('pipe-step-count').textContent = `${_chainSteps.length} step${_chainSteps.length === 1 ? '' : 's'}`;
    document.getElementById('pipe-chain-build').disabled = _chainSteps.length < 2;
  }

  async function _buildPipeline() {
    for (let i = 0; i < _chainSteps.length - 1; i++) {
      await api('/agent-mesh/routes', {
        method: 'POST',
        body: JSON.stringify({
          from: _chainSteps[i].agentKey, to: _chainSteps[i + 1].agentKey, kind: 'pipeline',
          systemPrompt: _chainSteps[i].systemPrompt || undefined,
          transform: _chainSteps[i].transform || undefined,
        }),
      });
    }
    _refreshPipelineView();
  }

  async function mountPipelinePanel() {
    const host = document.getElementById('pipeline-body');
    if (!host || host.dataset.mounted) { await _refreshPipelineView(); return; }
    host.dataset.mounted = '1';
    host.innerHTML = `
      <div class="pipe-wrap">
        <div class="pipe-main">
          <div class="pipe-toolbar">
            <button class="hbtn" id="pipe-agent-add">+ ADD STEP</button>
            <button class="hbtn" id="pipe-chain-clear">CLEAR</button>
            <button class="hbtn" id="pipe-json-export">\u2193 JSON</button>
            <button class="hbtn" id="pipe-json-import">\u2191 IMPORT</button>
            <input type="file" id="pipe-json-file" accept="application/json" style="display:none">
            <button class="hbtn g" id="pipe-chain-build" disabled>BUILD PIPELINE</button>
            <span id="pipe-step-count" class="lr-meta" style="margin-left:auto"></span>
            <button class="hbtn" id="pipe-status-btn">\u22ee STATUS / ROUTES</button>
          </div>
          <div id="pipe-canvas" class="pipe-canvas"></div>
        </div>
      </div>`;
    // §CHANGED 2026-09-12 -- James: "move agent to the dropdown when
    // adding a step, like the fourth image." No separate toolbar
    // picker anymore -- ADD STEP creates the step (defaulting to the
    // first real agent) and opens its own real editor immediately, the
    // same popup EDIT already uses, so agent selection happens there.
    document.getElementById('pipe-agent-add').addEventListener('click', () => {
      const step = { id: _newStepId(), agentKey: REAL_AGENT_KEYS[0], intent: '', systemPrompt: '', inputData: '', transform: '' };
      _chainSteps.push(step);
      _renderChainBuilder();
      const box = document.querySelector(`.pipe-step[data-step="${step.id}"] .pipe-step-box`);
      if (box) _openStepPopup(step, box);
    });
    document.getElementById('pipe-chain-clear').addEventListener('click', () => { _chainSteps = []; _closeStepPopup(); _renderChainBuilder(); });
    document.getElementById('pipe-chain-build').addEventListener('click', _buildPipeline);
    document.getElementById('pipe-json-export').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(_chainSteps, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'pipeline-steps.json'; a.click();
      URL.revokeObjectURL(a.href);
    });
    document.getElementById('pipe-json-import').addEventListener('click', () => document.getElementById('pipe-json-file').click());
    document.getElementById('pipe-json-file').addEventListener('change', async (ev) => {
      const file = ev.target.files[0]; if (!file) return;
      try {
        const parsed = JSON.parse(await file.text());
        _chainSteps = (Array.isArray(parsed) ? parsed : []).map((s) => ({ id: _newStepId(), agentKey: s.agentKey || REAL_AGENT_KEYS[0], intent: s.intent || '', systemPrompt: s.systemPrompt || '', inputData: s.inputData || '', transform: s.transform || '' }));
        _renderChainBuilder();
      } catch (e) { alert(`Import failed: ${e.message}`); }
      ev.target.value = '';
    });
    document.getElementById('pipe-status-btn').addEventListener('click', (ev) => {
      ev.stopPropagation();
      _toggleStatusMenu(document.getElementById('pipe-status-btn'));
    });
    _renderChainBuilder();
    await _refreshPipelineView();
  }

  // §BUILT 2026-09-12 — James, screenshot of the browser's own real
  // context menu: "have this sidebar on the right be a context menu."
  // Replaces the old persistent .pipe-side column with a popup styled
  // like brainos-app.js's own real .brainos-ctx-menu (canvas node
  // right-click) — same open/close convention (append to body, close
  // on the next outside click, deferred one tick so the opening click
  // doesn't also close it), just richer content than a plain click-row
  // list. Real functionality unchanged: same #pipe-run dispatch logic
  // (moved here since the button is now created fresh each open,
  // rather than living in the static, always-present markup) and the
  // same #pipe-existing route list via the existing, untouched
  // _refreshPipelineView().
  let _statusMenuEl = null;
  function _closeStatusMenu() {
    if (_statusMenuEl) { _statusMenuEl.remove(); _statusMenuEl = null; }
    document.removeEventListener('click', _closeStatusMenu);
  }
  function _toggleStatusMenu(anchorEl) {
    if (_statusMenuEl) { _closeStatusMenu(); return; }
    const rect = anchorEl.getBoundingClientRect();
    const menu = document.createElement('div');
    menu.className = 'brainos-ctx-menu pipe-status-menu';
    menu.style.cssText = `position:fixed; right:${window.innerWidth - rect.right}px; top:${rect.bottom + 8}px; z-index:9999;`;
    menu.innerHTML = `
      <div class="panel-title" style="font-size:9px">RUN STATUS</div>
      <div id="pipe-run-status" class="empty-state">add steps, build, then run</div>
      <button class="hbtn g" id="pipe-run" style="width:100%;margin-top:8px">\u25b6 RUN PIPELINE</button>
      <div class="lr-meta" style="margin-top:4px">uses Step 1's own Input/data field -- no separate input box</div>
      <div class="panel-title" style="font-size:9px;margin-top:16px">EXISTING REAL ROUTES</div>
      <div id="pipe-existing"></div>`;
    document.body.appendChild(menu);
    _statusMenuEl = menu;
    menu.addEventListener('click', (ev) => ev.stopPropagation()); // real clicks inside (run/delete) must not self-close via the outside-click listener below
    // §CHANGED 2026-09-12 -- James: "remove the pipeline input from the
    // right and use the input from step one." No separate textarea
    // anymore -- reads step 1's own real Input/data field at Run time.
    document.getElementById('pipe-run').addEventListener('click', async () => {
      const statusEl = document.getElementById('pipe-run-status');
      if (!_chainSteps.length) { statusEl.textContent = 'no steps to run'; return; }
      const input = _chainSteps[0].inputData;
      if (!input) { statusEl.textContent = "step 1 has no Input/data set -- open it and fill that in first"; return; }
      statusEl.textContent = `dispatching ${_chainSteps[0].agentKey}...`;
      const r = await api('/agent-mesh/route', { method: 'POST', body: JSON.stringify({ prompt: input, preferAgent: _chainSteps[0].agentKey }) });
      statusEl.textContent = r.ok
        ? `${_chainSteps[0].agentKey} started -- remaining steps fire as each real completion lands (route-graph.js)`
        : `dispatch failed: ${r.error}`;
    });
    _refreshPipelineView();
    setTimeout(() => document.addEventListener('click', _closeStatusMenu), 0);
  }

  // §WIRED 2026-09-11 — real push handler, called by brainos-app.js with
  // every real automation.* SSE event it already receives (no second
  // connection opened here). Refreshes the log immediately instead of
  // waiting for the next 4s poll; automation.run.* also refreshes the
  // workflow list so lastRun/runCount reflect the real state without a
  // manual re-click.
  function onRealEvent(ev) {
    if (!ev || typeof ev.type !== 'string') return;
    _refreshLog();
    if (ev.type === 'automation.run.start' || ev.type === 'automation.run.complete' || ev.type === 'automation.run.error') {
      _refreshWfList();
    }
  }

  global.BrainOSAutomation = { mountAutomationPanel, mountPipelinePanel, onRealEvent };
})(typeof window !== 'undefined' ? window : globalThis);
