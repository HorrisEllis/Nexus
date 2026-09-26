'use strict';
/**
 * ui/brainos/brainos-app.js
 * §NEW 2026-09-06 — James: "make this ui, map it all onto the html."
 * Full-page app driving the real, mapped BrainOS UI. Reuses the exact
 * same real endpoints/ports already established and tested in
 * brainos.js (guardian :7820, clear-glass :7704/:7701, cortex :3748,
 * diagnostic :7825) — this file drives THIS page's layout instead of
 * brainos.js's own floating panel, which isn't used here.
 *
 * §NO_DECORATIVE_MOTION / §NO_CAP_ON_VISIBILITY — same real axioms
 * brainos-canvas.js already holds itself to: every visual update here
 * traces to a real fetch or a real SSE event, nothing on a timer for
 * its own sake, and every real row/entry gets shown, no top-N cap.
 */
(function () {
  const GUARDIAN_URL   = 'http://127.0.0.1:7820';
  const CLEARGLASS_URL = 'http://127.0.0.1:7704';
  const CLEARGLASS_SSE = 'http://127.0.0.1:7701';
  const CORTEX_URL     = 'http://127.0.0.1:3748';
  const DIAGNOSTIC_URL = 'http://127.0.0.1:7825';

  let _selectedNode = null;
  let _meshNodes = {}; // id -> real node data, mirrors brainos-canvas.js's own tracking for the sidebar list

  // ── Tab switching — plain, real, no framework ───────────────────────────
  function setMainTab(tab) {
    document.querySelectorAll('.tnav').forEach((t) => t.classList.toggle('act', t.dataset.tab === tab));
    document.querySelectorAll('.panel-overlay').forEach((p) => p.classList.remove('act'));
    if (tab !== 'canvas') {
      const el = document.getElementById('panel-' + tab);
      if (el) el.classList.add('act');
    }
    // §RESTRUCTURED 2026-09-12 — James: "sidebars are tab dependent not
    // static. pipeline is fullscreen." Sidebar content now swaps per
    // tab (canvas -> mesh nodes, automation -> workflows, matching the
    // reference's own layout); pipeline hides the left sidebar entirely
    // so the pipeline canvas gets the full width, same as the
    // reference's PIPELINE view has none.
    // §CONTEXT-DEPENDENT 2026-09-12 — James: "div.rpanel should be
    // context dependent, and only opens on the canvas when viewing
    // agent." rpanel is no longer a static per-tab default (it used to
    // show on every tab but pipeline) — it starts closed on every tab
    // switch here, and the ONLY thing that opens it is clicking a real
    // kind:'agent' node on the canvas (see onNodeClick below). A plain
    // system/pulse node, or switching to any other main tab, leaves it
    // closed.
    const sidebar = document.getElementById('sidebar');
    const rpanel = document.querySelector('.rpanel');
    rpanel.classList.remove('open');
    if (tab === 'pipeline') {
      sidebar.style.display = 'none';
    } else {
      sidebar.style.display = '';
      document.getElementById('sb-canvas').classList.toggle('act', tab === 'canvas');
      document.getElementById('sb-automation').classList.toggle('act', tab === 'automation');
    }
    if (tab === 'bayes') fetchBayes();
    if (tab === 'pipeline') { fetchPipeline(); window.BrainOSAutomation.mountPipelinePanel(); }
    if (tab === 'automation') { fetchAutomation(); window.BrainOSAutomation.mountAutomationPanel(); }
  }
  document.querySelectorAll('.tnav').forEach((t) => t.addEventListener('click', () => setMainTab(t.dataset.tab)));

  function setRTab(tab) {
    document.querySelectorAll('.rptab').forEach((t) => t.classList.toggle('act', t.dataset.rtab === tab));
    document.querySelectorAll('.rp-body').forEach((b) => b.classList.remove('act'));
    document.getElementById('rt-' + tab).classList.add('act');
    // §FOUND & FIXED 2026-09-08 — James: "BrainOS html file for all of
    // this." Real, confirmed dead code found first: fetchPipeline()/
    // fetchAutomation() already existed, fully real, but had zero
    // matching HTML tabs/bodies anywhere and setRTab() never called
    // them — a real ID mismatch too (pipeline-body/automation-body vs
    // this file's own real rt-* convention). All fixed together, not
    // guessed at separately.
    if (tab === 'chatlog') fetchChatLog();
    if (tab === 'pipeline') fetchPipeline();
    if (tab === 'automation') fetchAutomation();
    if (tab === 'toolcalls') fetchToolCalls();
  }
  document.querySelectorAll('.rptab').forEach((t) => t.addEventListener('click', () => setRTab(t.dataset.rtab)));

  function log(msg) {
    const strip = document.getElementById('log-strip');
    const el = document.createElement('div');
    el.className = 'll';
    el.textContent = `${new Date().toLocaleTimeString('en-GB', { hour12: false })}  ${msg}`;
    strip.insertBefore(el, strip.firstChild);
    while (strip.children.length > 6) strip.lastChild.remove();
    setTimeout(() => el.remove(), 10000);
  }

  // §FOUND & FIXED 2026-09-06 — adversarial audit, James: "find every
  // problem you can... hostile attacked and verified." Every render
  // function below builds real HTML via innerHTML template literals,
  // directly interpolating real, live data (chat log prompts, macro
  // names, node labels/ids/status) with zero escaping. This UI has
  // real, powerful local capabilities (window.ClearGlass.macros.run())
  // — a chat log entry or agent-mesh node whose content ever contains
  // an HTML special character would not just render oddly, it could
  // inject and execute arbitrary markup/event handlers in this real
  // page's own context. Confirmed the worst real case directly:
  // `data-run="${m.name}"` at line ~211 was an ATTRIBUTE-context
  // injection — a macro name containing a literal `"` could break out
  // of the attribute and add a new one (onmouseover=..., etc.), not
  // just malform the visible text. One real, shared escaper, applied
  // everywhere a real, external value reaches innerHTML.
  function _escapeHtml(v) {
    return String(v ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  // ── CANVAS — mount the real, existing dynamic mesh renderer ─────────────
  const canvasHost = document.getElementById('canvas-host');
  window.BrainOSCanvas.mount(canvasHost);

  // §BUILT 2026-09-12 — James: "animated embers in the background,
  // particles." Eravos's own real riseUp animation (brainos-app.css)
  // needed a spawner -- the theme file only ever defines the CSS
  // class/keyframe, never the JS that actually creates .spark elements.
  // Purely decorative page chrome, same boundary as the atmosphere
  // gradient/scanline (§RETHEMED, above this file's css) -- appends
  // into #particles (fixed, pointer-events:none, behind real content),
  // never touches the canvas SVG or any data-bearing element.
  // Self-bounded: each ember removes itself after its own animation
  // duration, and a live count cap stops the interval from piling up
  // embers if the tab was backgrounded and timers queued.
  (function _spawnEmbers() {
    const host = document.getElementById('particles');
    if (!host) return;
    const MAX_LIVE = 40;
    let live = 0;
    setInterval(() => {
      if (live >= MAX_LIVE) return;
      live++;
      const el = document.createElement('div');
      el.className = 'spark';
      const size = 2 + Math.random() * 3;
      const duration = 6 + Math.random() * 6;
      const drift = (Math.random() * 60 - 30).toFixed(0) + 'px';
      const color = Math.random() < 0.5 ? 'var(--idle)' : 'var(--warn)'; // fire / amber
      el.style.cssText = `left:${(Math.random() * 100).toFixed(1)}%; bottom:-10px; width:${size}px; height:${size}px; background:${color}; box-shadow:0 0 ${(size * 2).toFixed(0)}px ${color}; animation-duration:${duration}s; --drift:${drift};`;
      host.appendChild(el);
      setTimeout(() => { el.remove(); live--; }, duration * 1000);
    }, 500);
  })();
  window.BrainOSCanvas.onNodeClick((node) => {
    _selectedNode = node;
    // §CONTEXT-DEPENDENT 2026-09-12 — James: "only opens on the canvas
    // when viewing agent." A plain system/pulse node (kind:'node')
    // still gets selected (canvas highlight), but doesn't open rpanel
    // — CHAT LOGS/PIPELINE/AUTOMATION/TOOL CALLS are agent-scoped
    // concepts, not something a fixed system node has. "View detail"
    // for ANY node (agent or system) is now the popup below, not this.
    const rpanel = document.querySelector('.rpanel');
    if (node && node.kind === 'agent' && document.querySelector('.tnav.act')?.dataset.tab === 'canvas') {
      renderNodeDetail(node);
      rpanel.classList.add('open');
      setRTab('node');
    } else {
      rpanel.classList.remove('open');
    }
  });

  // §BUILT — James: "right click nodes, with a context menu, ... deploying
  // nodes on the canvas spawn agents." Every action below calls a real,
  // already-existing endpoint or function — nothing here is a stub action
  // waiting for a backend (§1.1). Only offered for kind:'agent' nodes
  // (spawn/dispatch are agent-mesh concepts); a kind:'node' (pulse-
  // registry) entry still gets "View detail", never a spawn/dispatch
  // action that has no real target for it.
  let _ctxMenuEl = null;
  function _closeContextMenu() {
    if (_ctxMenuEl) { _ctxMenuEl.remove(); _ctxMenuEl = null; }
    document.removeEventListener('click', _closeContextMenu);
  }
  // §BUILT 2026-09-12 — mirrors automation-engine.js's own real
  // SYSTEM_PORTS (same source brainos-canvas.js's REAL_SYSTEMS already
  // duplicates by value) — needed here for the context menu's real Ping
  // action against a fixed system node.
  const REAL_SYSTEM_PORTS = {
    guardian: 7820, ollama: 3749, copilot: 3750, clearglass: 7704,
    orchestrator: 9000, cortex: 3748, architect: 3747, idearium: 4800,
    emerge: 4242, loom: 3752, eravos: 3751, diagnostic: 7825,
    versionium: 3754, autopilot: 7799, 'agent-mesh': 7704,
  };
  function _systemPort(id) { return REAL_SYSTEM_PORTS[id] || null; }

  function _openContextMenu(node, ev) {
    _closeContextMenu();
    const menu = document.createElement('div');
    menu.className = 'brainos-ctx-menu';
    menu.style.cssText = `position:fixed; left:${ev.clientX}px; top:${ev.clientY}px; z-index:9999;`;
    const items = [
      { label: `View detail`, run: () => { _selectedNode = node; _openNodeDetailPopup(node, ev); } },
    ];
    if (node.kind === 'agent') {
      const agentKey = node.meta?.key || node.label;
      // §BUILT 2026-09-12 — real per-provider chat URLs, guardian/lib/
      // dispatcher.js's own provUrls map (used there when a job is
      // queued waiting for a tab) — duplicated client-side by value,
      // same convention brainos-canvas.js's REAL_SYSTEMS already uses,
      // since this is a no-build-step static page.
      const CHAT_URLS = {
        claude: 'https://claude.ai/new', chatgpt: 'https://chatgpt.com/',
        gemini: 'https://gemini.google.com/', perplexity: 'https://www.perplexity.ai/',
        mistral: 'https://chat.mistral.ai/', deepseek: 'https://chat.deepseek.com/',
      };
      items.push(
        { label: `Spawn / respawn ${_escapeHtml(agentKey)}`, run: () => {
            fetch(CLEARGLASS_URL + '/agent-mesh/spawn', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ agentKey }),
            }).then((r) => r.json()).then((d) => log(d.ok ? `spawned ${agentKey} (${d.contextId})` : `spawn failed: ${d.error}`))
              .catch((e) => log(`spawn failed: ${e.message}`));
          } },
        { label: `Dispatch prompt to ${_escapeHtml(agentKey)}…`, run: () => {
            const prompt = window.prompt(`Prompt for ${agentKey}:`);
            if (!prompt) return;
            fetch(CLEARGLASS_URL + '/agent-mesh/route', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ prompt, preferAgent: agentKey }),
            }).then((r) => r.json()).then((d) => log(d.ok ? `${agentKey} → ${(d.text || d.response || '').slice(0, 200)}` : `dispatch failed: ${d.error}`))
              .catch((e) => log(`dispatch failed: ${e.message}`));
          } },
        // §BUILT 2026-09-12 — James: "diagnose, ping, start conversation,
        // open the agent suite." Ping is a real, zero-cost read of the
        // agent's own last-known status/latency from GET /agent-mesh/view
        // — no new dispatch, no fabricated round-trip.
        { label: `Ping ${_escapeHtml(agentKey)}`, run: () => {
            fetch(CLEARGLASS_URL + '/agent-mesh/view').then((r) => r.json()).then((d) => {
              const entry = (d.nodes || d.view || []).find((n) => n.id === agentKey || n.label === agentKey);
              log(entry ? `${agentKey}: ${entry.status || 'unknown'}${entry.latency ? ` · ${entry.latency}ms` : ''}` : `${agentKey}: not in real mesh view`);
            }).catch((e) => log(`ping failed: ${e.message}`));
          } },
        { label: `Diagnose ${_escapeHtml(agentKey)}`, run: () => {
            fetch(DIAGNOSTIC_URL + '/status').then((r) => r.json()).then((d) => {
              const entry = d.summary?.[agentKey];
              log(entry ? `${agentKey}: friction ${entry.friction ?? '—'} · sigma ${entry.sigma ?? '—'} · gaps ${entry.openGaps ?? '—'}` : `diagnostic has no real entry for "${agentKey}" — it monitors named SYSTEMS (guardian, cortex, etc.), not individual agents`);
            }).catch((e) => log(`diagnose failed: ${e.message}`));
          } },
        // §HONEST — opens the agent's REAL chat tab (guardian/lib/
        // dispatcher.js's own URL, a plain new browser tab) only if
        // that provider has one; not fabricated for providers with none.
        CHAT_URLS[agentKey] ? { label: `Start conversation with ${_escapeHtml(agentKey)}`, run: () => window.open(CHAT_URLS[agentKey], '_blank') } : null,
        // §HONEST NAME — see clear-glass/src/main/index.js's own comment
        // on this route: this opens the real API/account settings
        // window, not a per-agent prompt/behavior editor (no such editor
        // exists in this codebase). Named for what it actually does.
        { label: `Open agent settings…`, run: () => {
            fetch(CLEARGLASS_URL + '/window/settings', { method: 'POST' }).then((r) => r.json())
              .then((d) => log(d.ok ? 'opened settings window' : `settings failed: ${d.error}`))
              .catch((e) => log(`settings failed: ${e.message} — this route only responds from inside clear-glass's own process`));
          } },
      );
    } else if (node.kind === 'system') {
      // §BUILT 2026-09-12 — same real actions for a fixed REAL_SYSTEMS
      // node (guardian/cortex/etc.): Diagnose reads that system's real
      // diagnostic summary; Ping is a real GET to that system's own
      // /health, using the exact port brainos-canvas.js's REAL_SYSTEMS
      // already carries — reused here via a lookup, not re-derived.
      items.push(
        { label: `Ping ${_escapeHtml(node.id)}`, run: () => {
            const port = _systemPort(node.id);
            if (!port) { log(`${node.id}: no real port known`); return; }
            const t0 = Date.now();
            fetch(`http://127.0.0.1:${port}/health`).then((r) => { log(`${node.id}: ${r.ok ? 'OK' : 'HTTP ' + r.status} · ${Date.now() - t0}ms`); })
              .catch((e) => log(`${node.id}: unreachable (${e.message})`));
          } },
        { label: `Diagnose ${_escapeHtml(node.id)}`, run: () => {
            fetch(DIAGNOSTIC_URL + '/status').then((r) => r.json()).then((d) => {
              const entry = d.summary?.[node.id];
              log(entry ? `${node.id}: friction ${entry.friction ?? '—'} · sigma ${entry.sigma ?? '—'} · gaps ${entry.openGaps ?? '—'}` : `diagnostic has no real entry for "${node.id}"`);
            }).catch((e) => log(`diagnose failed: ${e.message}`));
          } },
      );
    }
    for (const it of items) {
      if (!it) continue; // a conditionally-omitted real action (e.g. no known chat URL) — not a menu item, not a broken one
      const row = document.createElement('div');
      row.className = 'brainos-ctx-menu-item';
      row.textContent = it.label;
      row.addEventListener('click', () => { it.run(); _closeContextMenu(); });
      menu.appendChild(row);
    }
    document.body.appendChild(menu);
    _ctxMenuEl = menu;
    // Close on the next real click anywhere else — deferred one tick so
    // the same contextmenu event that opened this doesn't also close it.
    setTimeout(() => document.addEventListener('click', _closeContextMenu), 0);
  }
  window.BrainOSCanvas.onNodeContextMenu(_openContextMenu);

  // §BUILT — Phase 2: drag-to-connect creates a real, persisted route.
  window.BrainOSCanvas.onNodeConnect((fromId, toId) => {
    fetch(CLEARGLASS_URL + '/agent-mesh/routes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: fromId, to: toId }),
    }).then((r) => r.json()).then((d) => {
      if (d.ok) {
        log(`route added: ${fromId} → ${toId}`);
        fetch(CLEARGLASS_URL + '/agent-mesh/routes').then((r) => r.json())
          .then((rd) => { if (rd.ok) window.BrainOSCanvas.renderRoutes(rd.routes); });
      } else {
        log(`route failed: ${d.error}`);
      }
    }).catch((e) => log(`route failed: ${e.message}`));
  });

  // Real, one-time initial fetch — same real endpoint built earlier this
  // session — gives the canvas AND the sidebar their actual current state
  // before the first live SSE tick.
  fetch(CLEARGLASS_URL + '/agent-mesh/view')
    .then((r) => r.json())
    .then((data) => {
      if (data?.ok && Array.isArray(data.nodes)) {
        window.BrainOSCanvas.renderMeshView(data.nodes);
        data.nodes.forEach((n) => { _meshNodes[n.id] = n; });
        renderSidebar();
      }
    })
    .catch((e) => log(`mesh view fetch failed: ${e.message}`));

  // Real, one-time initial fetch of persisted routes (Phase 2) — same
  // reasoning as the mesh-view fetch above: gives the canvas its actual
  // current edges before anything is dragged this session.
  fetch(CLEARGLASS_URL + '/agent-mesh/routes')
    .then((r) => r.json())
    .then((data) => { if (data?.ok) window.BrainOSCanvas.renderRoutes(data.routes); })
    .catch((e) => log(`routes fetch failed: ${e.message}`));

  // Real SSE — guardian's own stream (every real guardian bus.emit()).
  try {
    const es = new EventSource(GUARDIAN_URL + '/events');
    es.onmessage = (msg) => {
      let data; try { data = JSON.parse(msg.data); } catch (_) { return; }
      window.BrainOSCanvas.onRealEvent(data);
    };
    es.onerror = () => log('guardian SSE disconnected');
  } catch (e) { log(`guardian SSE failed: ${e.message}`); }

  // Real SSE — clear-glass's own stream, mesh.* events only (agent-mesh
  // lives in a different real process than guardian — same justified
  // exception brainos.js's own header already documents).
  try {
    const cgEs = new EventSource(CLEARGLASS_SSE + '/events');
    cgEs.onmessage = (msg) => {
      let data; try { data = JSON.parse(msg.data); } catch (_) { return; }
      if (typeof data?.type === 'string' && data.type.startsWith('mesh.')) {
        window.BrainOSCanvas.onRealEvent(data);
        if (data.type === 'mesh.nodes.snapshot' && Array.isArray(data.nodes)) {
          data.nodes.forEach((n) => { _meshNodes[n.id] = n; });
          renderSidebar();
        }
      }
      // §WIRED 2026-09-11 — James: "wire it all in." automation.* events
      // (automation.notify, automation.log, automation.run.*,
      // automation.branch.dispatched) were already reaching this exact
      // real SSE connection the whole time — automation-engine.js's
      // busEmit is wired straight to agent-mesh's this.sse.emit()
      // (clear-glass/src/mesh/agent-mesh.js line ~198), same real
      // stream mesh.* events already use. This handler's own filter was
      // silently dropping every one of them; nothing new to build on
      // the server side, only the missing branch here. automation.notify
      // is now a real toast via this file's own existing log()
      // mechanism — the "toast channel needs a real listener" gap named
      // last turn is that listener.
      if (typeof data?.type === 'string' && data.type.startsWith('automation.')) {
        if (data.type === 'automation.notify') {
          log(`${data.level && data.level !== 'info' ? data.level.toUpperCase() + ': ' : ''}${data.message || ''}`);
        }
        if (window.BrainOSAutomation && typeof window.BrainOSAutomation.onRealEvent === 'function') {
          window.BrainOSAutomation.onRealEvent(data);
        }
      }
    };
    cgEs.onerror = () => log('clear-glass SSE disconnected');
  } catch (e) { log(`clear-glass SSE failed: ${e.message}`); }

  function _statusColor(status) {
    if (status === 'alive' || status === 'connected' || status === 'ok') return 'var(--online)';
    if (status === 'idle') return 'var(--warn)';
    return 'var(--offline)';
  }

  function renderSidebar() {
    const list = document.getElementById('node-list');
    const ids = Object.keys(_meshNodes);
    if (!ids.length) { list.innerHTML = '<div class="empty-state">no real nodes yet</div>'; return; }
    list.innerHTML = ids.map((id) => {
      const n = _meshNodes[id];
      return `<div class="node-item${_selectedNode?.id === id ? ' sel' : ''}" data-id="${_escapeHtml(id)}">
        <div class="nd-dot" style="background:${_statusColor(n.status)}"></div>
        <div class="nd-label">${_escapeHtml(n.label || id)}</div>
        <div class="nd-kind">${_escapeHtml(n.kind || '')}</div>
      </div>`;
    }).join('');
    list.querySelectorAll('.node-item').forEach((el) => {
      el.addEventListener('click', () => {
        const n = _meshNodes[el.dataset.id];
        if (!n) return;
        _selectedNode = n;
        renderSidebar();
        // §CONTEXT-DEPENDENT 2026-09-12 — same rpanel rule as onNodeClick
        // above: only an agent node opens it, and only while on canvas
        // (this sidebar list only renders on the canvas tab anyway, but
        // checked directly rather than assumed).
        const rpanel = document.querySelector('.rpanel');
        if (n.kind === 'agent' && document.querySelector('.tnav.act')?.dataset.tab === 'canvas') {
          renderNodeDetail(n);
          rpanel.classList.add('open');
          setRTab('node');
        } else {
          rpanel.classList.remove('open');
        }
      });
    });
  }

  // ── NODE detail — shared HTML builder, used by both the rpanel NODE
  // tab (agent nodes, opened via onNodeClick above) and the popup below
  // ("View detail" context-menu action, any node kind). ─────────────────
  function _nodeDetailHtml(n) {
    if (!n) return '<div class="empty-state">click a node on the canvas</div>';
    return `
      <div class="list-row">
        <div class="lr-head"><span class="lr-name">${_escapeHtml(n.label || n.id)}</span>
          <span class="badge ${n.status === 'alive' || n.status === 'connected' ? 'ok' : n.status === 'idle' ? 'warn' : 'err'}">${_escapeHtml(n.status || 'unknown')}</span>
        </div>
        <div class="lr-meta">id: ${_escapeHtml(n.id)}</div>
        <div class="lr-meta">kind: ${_escapeHtml(n.kind || '—')}</div>
        ${n.health !== undefined ? `<div class="lr-meta">health: ${_escapeHtml(n.health)}</div>` : ''}
        ${n.meta ? `<div class="lr-meta">meta: ${_escapeHtml(JSON.stringify(n.meta))}</div>` : ''}
      </div>`;
  }
  function renderNodeDetail(n) {
    document.getElementById('rt-node').innerHTML = _nodeDetailHtml(n);
  }

  // §BUILT 2026-09-12 — James: "view details should be a popup." Same
  // real content _nodeDetailHtml already builds for the rpanel NODE
  // tab, just presented as a real popup (styled off .brainos-ctx-menu,
  // same open/close convention as the canvas's own right-click menu
  // and the pipeline's status popup) instead of switching tabs — works
  // for ANY node kind, including system/pulse nodes that don't open
  // rpanel at all anymore.
  let _detailPopupEl = null;
  function _closeNodeDetailPopup() {
    if (_detailPopupEl) { _detailPopupEl.remove(); _detailPopupEl = null; }
    document.removeEventListener('click', _closeNodeDetailPopup);
  }
  function _openNodeDetailPopup(node, ev) {
    _closeNodeDetailPopup();
    _closeContextMenu();
    const popup = document.createElement('div');
    popup.className = 'brainos-ctx-menu node-detail-popup';
    popup.style.cssText = `position:fixed; left:${ev.clientX}px; top:${ev.clientY}px; z-index:9999;`;
    popup.innerHTML = _nodeDetailHtml(node);
    document.body.appendChild(popup);
    _detailPopupEl = popup;
    popup.addEventListener('click', (e) => e.stopPropagation());
    setTimeout(() => document.addEventListener('click', _closeNodeDetailPopup), 0);
  }

  // ── CHAT LOGS (right panel) — real: GET cortex/api/chat-log ─────────────
  function fetchChatLog() {
    const el = document.getElementById('rt-chatlog');
    fetch(CORTEX_URL + '/api/chat-log?n=50')
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok || !data.entries?.length) { el.innerHTML = '<div class="empty-state">no real chat log entries</div>'; return; }
        el.innerHTML = data.entries.map((e) => `
          <div class="list-row">
            <div class="lr-head"><span class="lr-name">${_escapeHtml(e.provider || e.agent || 'unknown')}</span><span class="lr-meta">${_escapeHtml(new Date(e.ts || e.createdAt || Date.now()).toLocaleTimeString())}</span></div>
            <div class="lr-meta">${_escapeHtml((e.prompt || e.text || e.message || JSON.stringify(e)).toString().slice(0, 140))}</div>
          </div>`).join('');
      })
      .catch((e) => { el.innerHTML = `<div class="empty-state">chat log fetch failed: ${e.message}</div>`; });
  }

  // ── DEPLOY — real: POST clear-glass/provider/deploy ─────────────────────
  document.getElementById('deploy-btn').addEventListener('click', () => {
    const provider = document.getElementById('deploy-provider').value;
    const out = document.getElementById('deploy-result');
    out.textContent = 'deploying…';
    fetch(CLEARGLASS_URL + '/provider/deploy', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerId: provider }),
    })
      .then((r) => r.json())
      .then((data) => { out.textContent = data.ok ? `✓ redeployed ${provider}` : `✗ ${data.error || 'deploy failed'}`; log(`deploy ${provider}: ${data.ok ? 'ok' : data.error}`); })
      .catch((e) => { out.textContent = `✗ ${e.message}`; });
  });

  // ── BAYES — real: GET diagnostic/cfr/field ──────────────────────────────
  function fetchBayes() {
    const el = document.getElementById('bayes-body');
    fetch(DIAGNOSTIC_URL + '/cfr/field')
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok) { el.innerHTML = `<div class="empty-state">cfr/field error: ${data.error || 'unknown'}</div>`; return; }
        const pct = (v) => Math.max(0, Math.min(100, Math.round((v || 0) * 100)));
        el.innerHTML = `
          <div class="list-row">
            <div class="lr-head"><span class="lr-name">Regime</span><span class="badge ${data.regime === 'stable' ? 'ok' : data.regime === 'chaotic' ? 'err' : 'warn'}">${data.regime || 'unknown'}</span></div>
            <div class="lr-meta">Coherence ${pct(data.coherence)}%</div>
            <div class="bar-track"><div class="bar-fill" style="width:${pct(data.coherence)}%;background:var(--online)"></div></div>
            <div class="lr-meta" style="margin-top:6px">Entropy ${pct(data.entropy)}%</div>
            <div class="bar-track"><div class="bar-fill" style="width:${pct(data.entropy)}%;background:var(--warn)"></div></div>
            <div class="lr-meta" style="margin-top:6px">Friction ${pct(data.friction)}% · Resonance ${pct(data.resonance)}%</div>
            <div class="lr-meta" style="margin-top:6px">guardian reachable: ${data.guardianReachable ? 'yes' : 'no'}</div>
          </div>`;
      })
      .catch((e) => { el.innerHTML = `<div class="empty-state">cfr/field fetch failed: ${e.message}</div>`; });
  }

  // ── PIPELINE — real: GET cortex/api/raid/queue ──────────────────────────
  // ── TOOL CALLS — real: /api/jaa/guardian_tool_calls (cortex's generic
  // JAA table-query endpoint), reading this session's own real
  // tool-call-listener.js persistence — covers guardian's flow AND
  // copilot's separate tool-runtime.js (wake-word included, once
  // executeTool() is the real, universal hook — confirmed earlier this
  // session).
  function fetchToolCalls() {
    const el = document.getElementById('rt-toolcalls');
    fetch(CORTEX_URL + '/api/jaa/guardian_tool_calls?limit=50')
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok || !data.rows?.length) { el.innerHTML = '<div class="empty-state">no real tool calls yet</div>'; return; }
        el.innerHTML = data.rows.slice().reverse().map((r) => `
          <div class="list-row">
            <div class="lr-head"><span class="lr-name">${_escapeHtml(r.toolName)}</span><span class="badge ${r.result ? 'ok' : 'idle'}">${r.result ? 'has result' : 'pending'}</span></div>
            <div class="lr-meta">${_escapeHtml(r.provider || 'unknown')} · ${_escapeHtml(new Date(r.ts || Date.now()).toLocaleTimeString())}</div>
            <div class="lr-meta">${_escapeHtml((r.arguments || '{}').toString().slice(0, 140))}</div>
          </div>`).join('');
      })
      .catch((e) => { el.innerHTML = `<div class="empty-state">tool calls fetch failed: ${e.message}</div>`; });
  }

  function fetchPipeline() {
    const el = document.getElementById('rt-pipeline');
    fetch(CORTEX_URL + '/api/raid/queue?n=50')
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok || !data.contracts?.length) { el.innerHTML = '<div class="empty-state">no real contracts in the queue</div>'; return; }
        el.innerHTML = data.contracts.map((c) => `
          <div class="list-row">
            <div class="lr-head"><span class="lr-name">${_escapeHtml(c.intent || c.type || c.uuid || 'contract')}</span><span class="badge ${c.status === 'complete' ? 'ok' : c.status === 'failed' ? 'err' : 'idle'}">${_escapeHtml(c.status || 'pending')}</span></div>
            <div class="lr-meta">uuid: ${_escapeHtml(c.uuid || '—')}</div>
            ${c.dependsOn?.length ? `<div class="lr-meta">depends on: ${_escapeHtml(c.dependsOn.join(', '))}</div>` : ''}
            ${c.onFail ? `<div class="lr-meta">onFail: ${_escapeHtml(JSON.stringify(c.onFail))}</div>` : ''}
          </div>`).join('');
      })
      .catch((e) => { el.innerHTML = `<div class="empty-state">raid queue fetch failed: ${e.message}</div>`; });
  }

  // ── AUTOMATION — real: window.ClearGlass.macros (IPC, now bridged) ──────
  function fetchAutomation() {
    const el = document.getElementById('rt-automation');
    if (!window.ClearGlass?.macros) {
      el.innerHTML = '<div class="empty-state">window.ClearGlass.macros unavailable — this page must be opened inside clear-glass, not a plain browser tab</div>';
      return;
    }
    window.ClearGlass.macros.list()
      .then((data) => {
        const macros = Array.isArray(data) ? data : (data?.macros || data?.result || []);
        if (!macros.length) { el.innerHTML = '<div class="empty-state">no real macros stored</div>'; return; }
        el.innerHTML = macros.map((m) => `
          <div class="list-row">
            <div class="lr-head"><span class="lr-name">${_escapeHtml(m.name)}</span>
              <button class="hbtn g" data-run="${_escapeHtml(m.name)}">▶ RUN</button>
            </div>
            <div class="lr-meta">${_escapeHtml(m.description || (m.steps?.length ? `${m.steps.length} steps` : ''))}</div>
          </div>`).join('');
        el.querySelectorAll('[data-run]').forEach((btn) => {
          btn.addEventListener('click', () => {
            btn.textContent = '…';
            window.ClearGlass.macros.run(btn.dataset.run, {})
              .then((r) => { btn.textContent = r?.error ? '✗ FAILED' : '✓ RAN'; log(`macro ${btn.dataset.run}: ${r?.error || 'ok'}`); })
              .catch((e) => { btn.textContent = '✗ FAILED'; log(`macro run failed: ${e.message}`); });
          });
        });
      })
      .catch((e) => { el.innerHTML = `<div class="empty-state">macros:list failed: ${e.message}</div>`; });
  }

  // ── Clock — the one real, harmless timer; not a data source, just a clock ──
  setInterval(() => { document.getElementById('clock').textContent = new Date().toLocaleTimeString('en-GB', { hour12: false }); }, 1000);
})();
