(function() {
  if (window.__meshPickerActive) { window.__meshPickerActive.destroy?.(); }

  // ── Injected styles — same real visual language as guardian-picker.js
  // (IBM Plex Mono / Rajdhani, #00ffa3 accent) per James: "do not change
  // any css, style, themes" — this is a sibling picker, not a redesign. ──
  const STYLE = document.createElement('style');
  STYLE.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Rajdhani:wght@600;700&display=swap');

    #__mp-panel {
      position: fixed; top: 16px; right: 16px; z-index: 2147483646;
      width: 260px; max-height: 70vh; overflow-y: auto;
      background: #080c10; border: 1px solid rgba(0,255,163,0.3);
      border-top: 2px solid #00ffa3; border-radius: 3px;
      box-shadow: 0 8px 40px rgba(0,0,0,0.85), 0 0 20px rgba(0,255,163,0.1);
      font-family: 'IBM Plex Mono', monospace;
      animation: mp-in 0.18s ease-out;
    }
    @keyframes mp-in { from { opacity:0; transform: translateY(-6px); } to { opacity:1; transform: translateY(0); } }

    #__mp-hdr {
      display: flex; align-items: center; justify-content: space-between;
      padding: 8px 11px; background: rgba(0,255,163,0.06);
      border-bottom: 1px solid rgba(0,255,163,0.15);
    }
    #__mp-title { font-family: 'Rajdhani', sans-serif; font-size: 12px; font-weight: 700; letter-spacing: 0.15em; color: #00ffa3; }
    #__mp-close { background: none; border: none; cursor: pointer; color: rgba(0,255,163,0.4); font-size: 14px; line-height: 1; padding: 0 2px; }
    #__mp-close:hover { color: #00ffa3; }

    #__mp-list { padding: 6px; }
    .__mp-row {
      display: flex; align-items: center; gap: 7px; padding: 6px 7px;
      border-radius: 2px; cursor: pointer; margin-bottom: 2px;
    }
    .__mp-row:hover { background: rgba(0,255,163,0.08); }
    .__mp-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
    .__mp-dot.alive { background: #00ffa3; box-shadow: 0 0 6px rgba(0,255,163,0.6); }
    .__mp-dot.idle  { background: #ffcc00; box-shadow: 0 0 6px rgba(255,204,0,0.5); }
    .__mp-dot.dead  { background: #ff4444; box-shadow: 0 0 6px rgba(255,68,68,0.4); }
    .__mp-label { font-size: 11px; color: #c8d8e8; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .__mp-kind  { font-size: 9px; letter-spacing: 0.08em; color: rgba(200,220,240,0.35); text-transform: uppercase; }

    #__mp-empty { padding: 16px 11px; font-size: 10px; color: rgba(200,220,240,0.35); text-align: center; }
  `;
  document.documentElement.appendChild(STYLE);

  const panel = document.createElement('div');
  panel.id = '__mp-panel';
  panel.innerHTML = `
    <div id="__mp-hdr">
      <span id="__mp-title">AGENT MESH</span>
      <button id="__mp-close">✕</button>
    </div>
    <div id="__mp-list"><div id="__mp-empty">connecting…</div></div>
  `;
  document.documentElement.appendChild(panel);

  document.getElementById('__mp-close').addEventListener('click', () => destroy());

  // ── Live data ─────────────────────────────────────────────────────────
  // src/mesh/agent-mesh.js broadcasts mesh.nodes.snapshot every 5s and
  // mesh.node.status_changed on real transitions, over clear-glass's own
  // real SSE (src/sse/server.js), which sets Access-Control-Allow-Origin:
  // '*' specifically so a picker injected into an arbitrary agent page
  // (claude.ai, chatgpt.com — a different origin from clear-glass's own
  // shell) can still subscribe directly, same as this file does.
  //
  // Port: the outer chrome (renderer/browser.js) reads `ssePort` from its
  // OWN document's URL query string — not available here, since this
  // script runs inside the webview's page (e.g. claude.ai), a genuinely
  // separate document. Falls back to the same default browser.js itself
  // uses (`params.get('ssePort') || 7701`) — consistent with this
  // codebase's existing convention for cross-context ports that can't be
  // read from process.env inside a page script (see agent-mesh.js's own
  // EROS_WIRE_PORT / GUARDIAN_PORT defaults for the same pattern).
  const SSE_PORT = 7701;
  let es = null;
  let latestAgents = [];

  function _eh(v) { return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  function renderEmpty(msg) {
    document.getElementById('__mp-list').innerHTML = `<div id="__mp-empty">${_eh(msg)}</div>`;
  }

  function render(nodes) {
    const list = document.getElementById('__mp-list');
    if (!nodes.length) { renderEmpty('no live nodes yet'); return; }
    list.innerHTML = nodes.map((n, i) => `
      <div class="__mp-row" data-idx="${i}" title="${_eh(n.label)}">
        <span class="__mp-dot ${_eh(n.status)}"></span>
        <span class="__mp-label">${_eh(n.label)}</span>
        <span class="__mp-kind">${_eh(n.kind)}</span>
      </div>
    `).join('');
    list.querySelectorAll('.__mp-row').forEach(row => {
      row.addEventListener('click', () => {
        const n = nodes[parseInt(row.dataset.idx, 10)];
        try { window.__cg?.send('mesh:node-selected', { id: n.id, label: n.label, kind: n.kind, status: n.status }); } catch (_) {}
        // Hand off to the element picker, already-injected or not — same
        // real control surface guardian-picker.js exposes.
        if (window.__gPickerActive?.startPick) window.__gPickerActive.startPick();
      });
    });
  }

  function connect() {
    try {
      es = new EventSource(`http://127.0.0.1:${SSE_PORT}/events?replay=1`);
    } catch (_) { renderEmpty('SSE unavailable'); return; }

    es.addEventListener('mesh.nodes.snapshot', (e) => {
      try {
        const d = JSON.parse(e.data);
        // nodes.snapshot only carries pulse-tracked nodes (guardian,
        // clearglass, etc) — merge with the last-seen agent list so the
        // panel shows the same unified view listMeshView() returns.
        render([...latestAgents, ...(d.nodes || []).map(n => ({ id: n.instanceId, label: n.logicalId, kind: 'node', status: n.status }))]);
      } catch (_) {}
    });

    es.addEventListener('mesh.agent.spawned', (e) => {
      try {
        const d = JSON.parse(e.data);
        latestAgents = latestAgents.filter(a => a.id !== d.contextId);
        latestAgents.push({ id: d.contextId, label: d.agentKey, kind: 'agent', status: 'alive' });
      } catch (_) {}
    });

    es.addEventListener('identity', () => renderEmpty('waiting for first snapshot…'));
    es.onerror = () => renderEmpty('SSE disconnected — retrying…');
  }

  connect();

  window.__meshPickerActive = {
    destroy() {
      if (es) { try { es.close(); } catch (_) {} es = null; }
      panel.remove();
      STYLE.remove();
      window.__meshPickerActive = null;
    },
  };

  function destroy() { window.__meshPickerActive?.destroy(); }
})();
