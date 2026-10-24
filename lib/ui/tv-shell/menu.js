/**
 * ui/tv-shell/menu.js
 * comp_id: nexus.ui.tv-shell.menu
 * uuid: nexus-tv-shell-menu-v1-0000-2026-0627-jamesbrooks-001
 * spec: docs/contract-queue.spec
 *
 * Sovereign floating menu button module.
 * Zero coupling to the shell. Zero inline logic.
 * Loads as <script src="./menu.js">.
 *
 * Public API (window.NexusMenu):
 *   NexusMenu.toggle()      — open/close the menu
 *   NexusMenu.open()        — open
 *   NexusMenu.close()       — close
 *   NexusMenu.diagnose()    — trigger system diagnosis via co-pilot
 *   NexusMenu.rewind()      — open rewind overlay
 *   NexusMenu.inspect()     — open inspect overlay
 *   NexusMenu.setBackend(m) — 'ollama' | 'copilot' | 'guardian', same command as typing /backend <m>
 *   NexusMenu.setAgent(a)   — one of CP_GUARDIAN_AGENTS, same command as typing /agent <a>
 *
 * The CLI inside the menu routes through co-pilot (:3750/api/prompt).
 * Co-pilot uses RAID, INTUITION, ANALYSIS — the menu doesn't need to know.
 *
 * §FIXED 2026-09-08 — James: "It's giving me blank responses with a
 * confidence score. The toggle, and drop menus aren't hooked into
 * anything. Make them event driven command line based, since they're
 * commands, routing to agents." This module never had a backend toggle
 * or agent dropdown at all — ui/tv-shell/index.html's bot-bar has the
 * real one (ollama | copilot | guardian, 'copilot' resolving through
 * copilot/config.js's DEFAULT_PROVIDER, guardian exposing the 4 real
 * NCP agents) — mirrored here rather than reinvented, same values, same
 * resolution. And copilot/server.js's /api/prompt handler (this
 * module's only endpoint) never read body.provider at all, unlike its
 * sibling /api/prompt/fulfill — fixed there too, same date, same real
 * resolution — so no caller's choice ever reached lifeline before now.
 * That's also the actual cause of "blank response with a confidence
 * score": lifeline's own honest low-confidence fallback text is
 * literally `[CONFIDENCE: N%] ${text}` — with no provider ever
 * reaching it, there was no way to opt out of the cascade that
 * produces it. New here, not in index.html: the toggle and dropdown
 * are real commands (/backend, /agent) — typing them into the CLI
 * does exactly what clicking does, one event-driven path either way.
 */
'use strict';

(function() {

// ── Config ────────────────────────────────────────────────────────────────────
const COPILOT_URL = 'http://127.0.0.1:3750';
const ORCH_URL    = 'http://127.0.0.1:9000';
const SESSION_ID  = 'tv-shell-menu-' + Date.now();

// Real, NCP-confirmed agent set — same 4 as ui/tv-shell/index.html's
// CP_GUARDIAN_AGENTS, not guessed independently.
const CP_GUARDIAN_AGENTS = ['claude', 'chatgpt', 'gemini', 'perplexity', 'deepseek'];   // §0.59.1 — James: "deepseek is absent." Must name every guardian userscript (tests/modules/test-provider-lists.test.js)

// ── State ─────────────────────────────────────────────────────────────────────
let _open       = false;
let _diagActive = false;
// 'ollama' | 'copilot' | 'guardian' — 'copilot' is the real, middle,
// default option (resolves through copilot/config.js's DEFAULT_PROVIDER
// server-side), matching index.html's bot-bar default.
let _backend    = 'copilot';
let _agent      = CP_GUARDIAN_AGENTS[0]; // only meaningful when _backend === 'guardian'

// ── Fetch helper ──────────────────────────────────────────────────────────────
async function _post(url, body) {
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Session-Id': SESSION_ID },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    return r.ok ? r.json() : { ok: false, error: `HTTP ${r.status}` };
  } catch(e) { return { ok: false, error: e.message }; }
}

// ── Co-pilot prompt via sovereign co-pilot module ─────────────────────────────
async function _copilotPrompt(prompt, outputEl) {
  if (outputEl) outputEl.textContent = '…';
  // §FIXED 2026-09-08 — send the toggle/dropdown's actual current
  // choice on every call, the same real value index.html's bot-bar
  // sends: a real agent name when backend === 'guardian', otherwise
  // the literal 'ollama' or 'copilot' string (server resolves
  // 'copilot' through config.DEFAULT_PROVIDER — not decided here).
  const provider = _backend === 'guardian' ? _agent : _backend;
  // §NEW 2026-09-11 — James, direct: "I don't want it to route through
  // lifeline. Toggle needs to actually toggle copilot between guardian."
  // backend is a genuinely distinct real field from provider — the
  // server only bypasses lifeline entirely when backend is 'guardian'
  // or 'ollama'; 'copilot' (the third toggle position) falls through to
  // the existing, unchanged, lifeline-routed resolvedProvider path.
  const result = await _post(`${COPILOT_URL}/api/prompt`, {
    prompt, sessionId: SESSION_ID, channel: 'menu', channelName: 'Menu', provider,
    backend: _backend, agent: _backend === 'guardian' ? _agent : undefined,
  });
  if (outputEl) {
    // §BUG FIXED 2026-07-11 — "co-pilot in the tv-ui is showing json
    // strings, fixed over and over but keeps getting changed back."
    // Traced /api/prompt's actual server-side code thoroughly (every
    // branch — intuition fast-path, cortex intuition, the full lifeline
    // ask pipeline) and found no JSON.stringify-into-.text leak in THIS
    // endpoint specifically (that bug was real, but lived in
    // /api/prompt/fulfill's dispatchFn — fixed separately, see
    // copilot/server.js's extractDispatchText). This endpoint's own code
    // looks correct on every path traced. Rather than keep guessing at a
    // cause I can't reproduce live, this is the other half: a guard here
    // that can never silently display malformed data, and that makes the
    // NEXT occurrence immediately diagnosable instead of another round of
    // "it's back, fix it again" with no trace of what shape broke.
    const text = result?.text;
    if (text !== undefined && typeof text !== 'string') {
      console.error('[menu] /api/prompt returned non-string .text — this IS the json-strings bug if you\'re seeing it. Shape:', result);
      outputEl.textContent = `[co-pilot response was not plain text — logged to console for diagnosis]\n${JSON.stringify(text, null, 2)}`;
    } else {
      outputEl.textContent = text || result?.error || 'No response';
    }
  }
  return result;
}

// ── Diagnosis via co-pilot ────────────────────────────────────────────────────
async function diagnose() {
  const out = document.getElementById('menu-diag-out');
  if (!out) return;

  _diagActive = true;
  out.style.display = 'block';
  out.textContent = 'Diagnosing…';

  // Ask co-pilot to diagnose — it uses INTUITION + ANALYSIS
  const result = await _copilotPrompt('/diagnose', out);

  // Also pull live system health
  try {
    const h = await fetch(`${ORCH_URL}/health`).then(r => r.json());
    const online = Object.entries(h.systems || {})
      .filter(([,v]) => v.online)
      .map(([k]) => k).join(', ');
    const offline = Object.entries(h.systems || {})
      .filter(([,v]) => !v.online)
      .map(([k]) => k).join(', ');
    out.textContent = (result?.text || '') + `\n\n● online: ${online || 'none'}\n○ offline: ${offline || 'none'}`;
  } catch(_) {}

  _diagActive = false;
}

// ── Menu DOM ──────────────────────────────────────────────────────────────────
function _buildMenu() {
  // Don't rebuild if already exists
  if (document.getElementById('nexus-menu-root')) return;

  const style = document.createElement('style');
  style.textContent = `
    /* comp_id: nexus.ui.tv-shell.menu / ui/tv-shell/menu.js */
    #nexus-menu-root {
      position: fixed;
      bottom: 28px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 9000;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      pointer-events: none;
    }
    #nexus-menu-panel {
      background: rgba(8,8,20,.96);
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 16px;
      padding: 16px 20px;
      min-width: 320px;
      max-width: 520px;
      box-shadow: 0 8px 48px rgba(0,0,0,.8);
      pointer-events: auto;
      opacity: 0;
      transform: translateY(8px);
      transition: opacity .15s, transform .15s;
    }
    #nexus-menu-panel.open {
      opacity: 1;
      transform: translateY(0);
    }
    #nexus-menu-btn {
      pointer-events: auto;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 20px;
      background: rgba(8,8,20,.9);
      border: 1px solid rgba(255,255,255,.18);
      border-radius: 24px;
      color: rgba(255,255,255,.7);
      font-family: 'Space Mono', monospace;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: .08em;
      cursor: pointer;
      transition: all .15s;
    }
    #nexus-menu-btn:hover { border-color: rgba(255,255,255,.35); color:#fff; }
    #nexus-menu-btn.open  { border-color: var(--ac, #00e5ff); color: var(--ac, #00e5ff); }
    .menu-row {
      display: flex;
      gap: 8px;
      margin-bottom: 10px;
    }
    .menu-btn {
      flex: 1;
      padding: 8px 12px;
      background: rgba(255,255,255,.04);
      border: 1px solid rgba(255,255,255,.09);
      border-radius: 8px;
      color: rgba(255,255,255,.6);
      font-family: 'Space Mono', monospace;
      font-size: 10px;
      cursor: pointer;
      transition: all .12s;
      text-align: center;
    }
    .menu-btn:hover { background: rgba(255,255,255,.09); color:#fff; border-color: rgba(255,255,255,.2); }
    .menu-btn.accent { border-color: rgba(0,229,255,.3); color: #00e5ff; }
    .menu-btn.accent:hover { background: rgba(0,229,255,.08); }
    .menu-btn.warn { border-color: rgba(204,68,255,.3); color: #cc44ff; }
    .menu-cli-row {
      display: flex;
      gap: 6px;
      margin-top: 8px;
    }
    #menu-cli-input {
      flex: 1;
      background: rgba(255,255,255,.04);
      border: 1px solid rgba(255,255,255,.1);
      border-radius: 8px;
      padding: 8px 10px;
      color: #fff;
      font-family: 'Space Mono', monospace;
      font-size: 11px;
      outline: none;
    }
    #menu-cli-input:focus { border-color: var(--ac, #00e5ff); }
    #menu-cli-send {
      padding: 8px 14px;
      background: rgba(0,229,255,.1);
      border: 1px solid rgba(0,229,255,.3);
      border-radius: 8px;
      color: #00e5ff;
      font-family: 'Space Mono', monospace;
      font-size: 10px;
      cursor: pointer;
    }
    #menu-cli-out {
      margin-top: 8px;
      padding: 8px 10px;
      background: rgba(0,0,0,.3);
      border-radius: 6px;
      color: rgba(255,255,255,.6);
      font-family: 'Space Mono', monospace;
      font-size: 10px;
      line-height: 1.5;
      white-space: pre-wrap;
      max-height: 120px;
      overflow-y: auto;
      display: none;
    }
    #menu-diag-out {
      margin-top: 8px;
      padding: 8px 10px;
      background: rgba(0,0,0,.3);
      border-radius: 6px;
      color: rgba(0,229,255,.7);
      font-family: 'Space Mono', monospace;
      font-size: 10px;
      line-height: 1.5;
      white-space: pre-wrap;
      max-height: 160px;
      overflow-y: auto;
      display: none;
    }
    .menu-section-label {
      font-family: 'Space Mono', monospace;
      font-size: 9px;
      letter-spacing: .1em;
      color: rgba(255,255,255,.3);
      margin-bottom: 6px;
    }
    .menu-backend-row {
      display: flex;
      gap: 6px;
      margin-bottom: 10px;
      align-items: center;
    }
    .menu-toggle-btn {
      flex: 1;
      padding: 6px 8px;
      background: rgba(255,255,255,.04);
      border: 1px solid rgba(255,255,255,.09);
      border-radius: 6px;
      color: rgba(255,255,255,.5);
      font-family: 'Space Mono', monospace;
      font-size: 9px;
      letter-spacing: .04em;
      cursor: pointer;
      transition: all .12s;
      text-align: center;
    }
    .menu-toggle-btn:hover { background: rgba(255,255,255,.08); color: #fff; }
    .menu-toggle-btn.menu-toggle-active {
      background: rgba(0,229,255,.12);
      border-color: rgba(0,229,255,.4);
      color: #00e5ff;
    }
    #menu-agent-select {
      flex: 1;
      background: rgba(255,255,255,.04);
      border: 1px solid rgba(255,255,255,.1);
      border-radius: 6px;
      padding: 6px 8px;
      color: #00e5ff;
      font-family: 'Space Mono', monospace;
      font-size: 9px;
      outline: none;
    }
  `;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.id = 'nexus-menu-root';
  root.innerHTML = `
    <div id="nexus-menu-panel">
      <div class="menu-section-label">NAVIGATION</div>
      <div class="menu-row" id="menu-nav-row"></div>

      <div class="menu-section-label">SYSTEM</div>
      <div class="menu-row">
        <button class="menu-btn accent" onclick="NexusMenu.diagnose()">⊕ DIAGNOSE</button>
        <button class="menu-btn" onclick="NexusMenu.rewind()">⟲ REWIND</button>
        <button class="menu-btn warn" onclick="NexusMenu.inspect()">◈ INSPECT</button>
      </div>
      <div id="menu-diag-out"></div>

      <div class="menu-section-label">BACKEND</div>
      <div class="menu-backend-row" id="menu-backend-row" title="Which backend answers: ollama (local models), copilot (whatever copilot/config.js's DEFAULT_PROVIDER says), or guardian (a specific real NCP agent)">
        <button id="menu-toggle-ollama" class="menu-toggle-btn" onclick="NexusMenu.setBackend('ollama')">ollama</button>
        <button id="menu-toggle-copilot" class="menu-toggle-btn menu-toggle-active" onclick="NexusMenu.setBackend('copilot')">copilot</button>
        <button id="menu-toggle-guardian" class="menu-toggle-btn" onclick="NexusMenu.setBackend('guardian')">guardian</button>
        <select id="menu-agent-select" title="Which real NCP agent answers" style="display:none"></select>
      </div>

      <div class="menu-section-label">CO-PILOT CLI</div>
      <div class="menu-cli-row">
        <input id="menu-cli-input" placeholder="Ask NEXUS anything… /backend guardian, /agent claude, /gaps /status /health" />
        <button id="menu-cli-send" onclick="NexusMenu.sendCLI()">→</button>
      </div>
      <div id="menu-cli-out"></div>
    </div>

    <button id="nexus-menu-btn" onclick="NexusMenu.toggle()">
      <span id="nexus-menu-icon">⬡</span>
      <span id="nexus-menu-label">NEXUS</span>
    </button>
  `;
  document.body.appendChild(root);

  // Wire CLI enter key
  document.getElementById('menu-cli-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); NexusMenu.sendCLI(); }
  });

  // Wire agent dropdown (only meaningful when backend === 'guardian')
  document.getElementById('menu-agent-select').onchange = function() {
    _agent = this.value;
    const out = document.getElementById('menu-cli-out');
    if (out) { out.style.display = 'block'; out.textContent = `→ agent: ${_agent}`; }
  };

  // Reflect initial state ('copilot' default) into the dropdown
  _renderAgentOptions();

  // Build nav buttons from CH_META if available
  _buildNavButtons();
}

// ── Backend toggle + agent dropdown ──────────────────────────────────────────
// Same real values and resolution as ui/tv-shell/index.html's bot-bar —
// mirrored, not reinvented. Reachable two ways: clicking a toggle
// button / picking a dropdown option, or typing the equivalent command
// into the CLI (/backend <mode>, /agent <name>) — both call the same
// functions, so there is exactly one event-driven path underneath.
function setBackend(mode) {
  if (mode !== 'ollama' && mode !== 'copilot' && mode !== 'guardian') return false;
  _backend = mode;
  const ollamaBtn   = document.getElementById('menu-toggle-ollama');
  const copilotBtn  = document.getElementById('menu-toggle-copilot');
  const guardianBtn = document.getElementById('menu-toggle-guardian');
  if (ollamaBtn)   ollamaBtn.classList.toggle('menu-toggle-active', mode === 'ollama');
  if (copilotBtn)  copilotBtn.classList.toggle('menu-toggle-active', mode === 'copilot');
  if (guardianBtn) guardianBtn.classList.toggle('menu-toggle-active', mode === 'guardian');
  _renderAgentOptions();
  return true;
}

function _renderAgentOptions() {
  const sel = document.getElementById('menu-agent-select');
  if (!sel) return;
  // Dropdown is a real, meaningful choice only for guardian (which of
  // the 4 real agents/tabs answers) — ollama and copilot are each
  // already one specific thing, so it gets out of the way rather than
  // showing a fake, single-option "choice."
  if (_backend === 'guardian') {
    sel.style.display = '';
    sel.disabled = false;
    sel.innerHTML = CP_GUARDIAN_AGENTS.map(o => `<option value="${o}">${o}</option>`).join('');
    if (!CP_GUARDIAN_AGENTS.includes(_agent)) _agent = CP_GUARDIAN_AGENTS[0];
    sel.value = _agent;
  } else {
    sel.style.display = 'none';
    sel.disabled = true;
    sel.innerHTML = '';
  }
}

function setAgent(name) {
  if (!CP_GUARDIAN_AGENTS.includes(name)) return false;
  _agent = name;
  if (_backend !== 'guardian') setBackend('guardian'); // picking an agent implies guardian
  const sel = document.getElementById('menu-agent-select');
  if (sel) sel.value = name;
  return true;
}

// ── CLI commands ──────────────────────────────────────────────────────────────
// "Make them event driven command line based, since they're commands."
// /backend and /agent are real commands, handled locally (no network
// round-trip — they're UI state, not a question for co-pilot), so the
// same slash-command grammar the CLI already documents (/gaps /status
// /health) now also drives the toggle and dropdown. Returns a response
// string if the input was a recognized command, otherwise null so the
// caller falls through to a normal co-pilot prompt.
function _runCommand(input) {
  let m = input.match(/^\/backend\s+(ollama|copilot|guardian)\s*$/i);
  if (m) {
    const mode = m[1].toLowerCase();
    setBackend(mode);
    return `→ backend: ${mode}`;
  }
  m = input.match(/^\/agent\s+(\S+)\s*$/i);
  if (m) {
    const name = m[1].toLowerCase();
    if (!CP_GUARDIAN_AGENTS.includes(name)) {
      return `→ unknown agent "${name}" — try: ${CP_GUARDIAN_AGENTS.join(', ')}`;
    }
    setAgent(name);
    return `→ agent: ${name} (backend: guardian)`;
  }
  return null;
}

function _buildNavButtons() {
  const row = document.getElementById('menu-nav-row');
  if (!row) return;
  // Read from shell's CH_META if available
  const channels = window.CH_META || [];
  const show = channels.slice(0, 6); // first 6
  row.innerHTML = show.map(ch =>
    `<button class="menu-btn" onclick="NexusMenu.go('${ch.id}')">${ch.name}</button>`
  ).join('');
}

// ── CLI send ──────────────────────────────────────────────────────────────────
async function sendCLI() {
  const input = document.getElementById('menu-cli-input');
  const out   = document.getElementById('menu-cli-out');
  if (!input || !out) return;

  const prompt = input.value.trim();
  if (!prompt) return;

  input.value = '';
  out.style.display = 'block';

  // §NEW 2026-09-11 — James, direct: "Routing / Agent switching / Tell
  // <provider> prompt uses lifeline." A real, deliberate exception to
  // the backend-bypass fix above: /tell explicitly wants lifeline's own
  // real cascade (confidence check, auto-escalation) for a ONE-OFF
  // named-agent request — independent of whatever the toggle is
  // currently set to. Sends provider (the named agent) but genuinely
  // omits backend, so the server's new bypass never triggers and this
  // falls through to the existing, unchanged resolvedProvider +
  // lifeline.route() path — the same real mechanism already proven for
  // the guardian dropdown's individual agent names.
  const tellMatch = prompt.match(/^\/tell\s+(\S+)\s+([\s\S]+)$/i);
  if (tellMatch) {
    const [, targetAgent, tellPrompt] = tellMatch;
    out.textContent = '…';
    const result = await _post(`${COPILOT_URL}/api/prompt`, {
      prompt: tellPrompt, sessionId: SESSION_ID, channel: 'menu', channelName: 'Menu',
      provider: targetAgent.toLowerCase(),
    });
    out.textContent = (result?.text || result?.error || '(no real response)');
    return;
  }

  // /backend and /agent are handled locally — everything else is a
  // normal co-pilot prompt, unchanged.
  const cmdResult = _runCommand(prompt);
  if (cmdResult !== null) {
    out.textContent = cmdResult;
    return;
  }

  out.textContent = '…';
  await _copilotPrompt(prompt, out);
}

// ── Navigation ────────────────────────────────────────────────────────────────
function go(channelId) {
  if (typeof tuneById === 'function') tuneById(channelId);
  close();
}

// ── Public API ────────────────────────────────────────────────────────────────
function toggle() {
  _open ? close() : open();
}
function open() {
  _open = true;
  const panel = document.getElementById('nexus-menu-panel');
  const btn   = document.getElementById('nexus-menu-btn');
  if (panel) panel.classList.add('open');
  if (btn)   btn.classList.add('open');
  // Rebuild nav buttons in case CH_META loaded after menu init
  _buildNavButtons();
}
function close() {
  _open = false;
  const panel = document.getElementById('nexus-menu-panel');
  const btn   = document.getElementById('nexus-menu-btn');
  if (panel) { panel.classList.remove('open'); }
  if (btn)   { btn.classList.remove('open'); }
  // Clear diag output
  const diag = document.getElementById('menu-diag-out');
  if (diag) diag.style.display = 'none';
}
function rewind() {
  if (typeof openRewind === 'function') openRewind();
  close();
}
function inspect() {
  if (typeof openInspect === 'function') openInspect();
  close();
}

// ── Mount ─────────────────────────────────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _buildMenu);
} else {
  _buildMenu();
}

// ── Export ────────────────────────────────────────────────────────────────────
window.NexusMenu = { toggle, open, close, diagnose, rewind, inspect, go, sendCLI, setBackend, setAgent };

})();
