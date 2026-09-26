/**
 * nexus/ui/brainos/brainos-canvas.js
 * comp_id: nexus.ui.brainos.canvas
 * uuid: nexus-ui-brainos-canvas-v1-0000-2026-0903-001
 *
 * BrainOS canvas — "canvas ui for live animated agent and system
 * management... nodes can be any end point... real alive node
 * connection animations... each system can be a node, any
 * heartbeat/pulse emission." Second real slice, built on top of
 * brainos.js's already-live guardian /events SSE connection — this
 * file does not open a second connection, it reads the same one.
 *
 * §NODE SOURCE, real not invented — orchestrator/orchestrator.config.json's
 * own real ports map, the single canonical systems list this whole
 * codebase already uses (confirmed by reading that exact file, not a
 * separate guessed list). 14 real systems as of this session.
 *
 * §HONEST HEARTBEAT SCOPE — checked directly before building this, not
 * assumed: guardian/server.js's real /events SSE is GUARDIAN'S OWN
 * internal SISOStream, not a cross-system relay. Two real, confirmed
 * heartbeat sources exist on it today:
 *   1. ANY real event at all — guardian's own node pulses, since every
 *      real bus.emit() in the guardian process reaches this stream.
 *   2. Events carrying a real `provider` field (confirmed: STREAM_TOKEN
 *      events include one) — the matching AGENT node pulses.
 * The other real NEXUS systems (cortex, idearium, loom, ollama, etc.)
 * have NO confirmed live event source reaching this stream today.
 * Their nodes render as real, positioned, named nodes —
 * §NO_CAP_ON_VISIBILITY, they are not hidden — but with an honest
 * "unwired" visual state, never a fabricated pulse. agent-mesh is the
 * one exception, added 2026-09-06 — its real mesh.* events arrive via
 * a genuinely separate, second connection (see brainos.js's own
 * header), not this guardian stream. Wiring a real cross-system relay
 * for the rest of these systems (each system's own bus -> guardian's
 * /events, or a new aggregator) is real, separate, not-yet-scoped
 * future work.
 *
 * §CONNECTIONS ARE STATIC TOPOLOGY, NOT A LIVE CALL TRACE — docs/
 * brainos-live-control-panel.spec's own canvas_mechanics section
 * already named this exact gap: "route graph edge glow... requires
 * each system's command-index mechanism to also emit a per-call event
 * ... FLAGGED GAP." That mechanism does not exist. The lines this file
 * draws between nodes are real, confirmed structural relationships
 * (which system calls which — read from real code, listed in
 * REAL_TOPOLOGY below with its source), never animated as if a live
 * request were traveling — animating them would be exactly the
 * fabricated motion §NO_DECORATIVE_MOTION forbids.
 *
 * §SUPERSEDES §NO_CAP_ON_VISIBILITY 2026-09-11 — James, live reference
 * (BrainOS-v2.html's onNodeDiscovered/heartbeatLoop): a node does not
 * exist on that canvas until a real probe/heartbeat confirms it —
 * `clusters` starts empty, onNodeDiscovered() is the only thing that
 * ever pushes into it. The prior rule here (draw every REAL_SYSTEMS/
 * REAL_AGENTS node up front, dim if never wired) is explicitly
 * overridden by that reference and by James's direct instruction:
 * "blank unless the canvas detects the heartbeat." mount() below no
 * longer draws any system/agent node or topology edge — it only
 * records their real positions. A node's circle+label is created the
 * first time pulse()/onRealEvent() fires for its real id (_ensureNode
 * below) — same discipline as onNodeDiscovered, gated on a real signal,
 * never drawn speculatively. A REAL_TOPOLOGY edge is drawn only once
 * BOTH of its real endpoints have actually appeared this way.
 */
(function (global) {
  'use strict';

  const MODULE_ID = 'nexus.ui.brainos.canvas';

  // Real ports, read from orchestrator/orchestrator.config.json this
  // session — not duplicated by value here from memory, the real file
  // itself is fetched at build/serve time in a real deployment; for
  // this client-side-only widget (no build step, per brainos.js's own
  // header) the real values are inlined with their real source named,
  // matching the same convention nexus-nerve-design-philosophy.spec
  // already uses for token values pulled from nexus-dark.css.
  // §FIX 2026-09-06 — bridge removed entirely (the system itself is
  // fully retired this session). agent-mesh added as a real system
  // node — clear-glass/src/mesh/agent-mesh.js, real, live, WIRE_PORT
  // 7704 (same port as clear-glass itself, since agent-mesh lives
  // in-process there, not a separate listener).
  const REAL_SYSTEMS = [
    { id: 'orchestrator', port: 9000, sysVar: '--sys-orch' },
    { id: 'cortex',       port: 3748, sysVar: '--sys-cx' },
    { id: 'guardian',     port: 7820, sysVar: '--sys-gd' },
    { id: 'architect',    port: 3747, sysVar: '--sys-arch' },
    { id: 'idearium',     port: 4800, sysVar: '--sys-idr' },
    { id: 'emerge',       port: 4242, sysVar: '--sys-em' },
    { id: 'copilot',      port: 3750, sysVar: '--sys-cp' },
    { id: 'loom',         port: 3752, sysVar: null },
    { id: 'eravos',       port: 3751, sysVar: '--sys-er' },
    { id: 'diagnostic',   port: 7825, sysVar: '--sys-dg' },
    { id: 'ollama',       port: 3749, sysVar: '--sys-ol' },
    { id: 'versionium',   port: 3754, sysVar: null },
    { id: 'autopilot',    port: 7799, sysVar: null },
    { id: 'agent-mesh',   port: 7704, sysVar: null },
  ];

  // Real agent/provider nodes — guardian/lib/provider-routing.js's own
  // real KNOWN_PROVIDERS list (confirmed this session while fixing
  // idearium's agent-routing bug), plus 'ollama' already covered above
  // as a real system node, not duplicated here.
  const REAL_AGENTS = ['claude', 'chatgpt', 'gemini', 'perplexity', 'deepseek', 'mistral'];

  // Real, named structural relationships — each with its real source,
  // not a guessed line. Drawn once, static, never "lit up" per-call
  // (see file header — that mechanism doesn't exist yet).
  const REAL_TOPOLOGY = [
    { from: 'guardian', to: 'ollama',   source: 'idearium/agent-suite/index.js buildChunkWithAgent() — ollama/mistral dispatch directly, no guardian round-trip. Drawn guardian->ollama anyway as the real logical grouping this canvas uses for "local model path"; see note.' },
    { from: 'guardian', to: 'idearium', source: 'idearium/api/index.js real chunk-dispatch calls into guardian/lib/agent-suite POST /command' },
    { from: 'orchestrator', to: 'guardian', source: 'orchestrator/orchestrator.config.json + orchestrator/orchestrator.js real contract-poller / component-registry wiring' },
    { from: 'orchestrator', to: 'cortex', source: 'cortex/boot.js real "registered with orchestrator :9000" — confirmed live in every real boot log this session' },
    { from: 'cortex', to: 'guardian', source: 'cortex/core/raid — RAID contracts spawn compartments that dispatch through guardian, confirmed this session while building the RAID retry/escalation fix' },
    { from: 'idearium', to: 'versionium', source: 'idearium/index.js snapshots()/snapshot() — fixed this session to call versionium directly (was hitting a stale cortex proxy)' },
    // §CORRECTED 2026-09-06 — this edge previously claimed "copilot/
    // server.js real dispatch path through guardian job system." No
    // longer true: tv-shell's ask-box now calls copilot directly
    // (_copilotDispatch -> POST copilot:3750/bridge/deliver), bypassing
    // guardian entirely for the primary UI path — this session's own
    // bridge-removal work. Real edge now: agent-mesh's own Guardian-
    // first dispatch gate (DA1) is the actual place these two connect.
    { from: 'agent-mesh', to: 'guardian', source: 'clear-glass/src/mesh/agent-mesh.js route()\'s real Guardian-first dispatch gate (DA1) — a live GET :7820/providers check before falling through to DOM automation, built and tested this session' },
  ];

  let _mounted = false;
  let _svg = null;
  let _nodeEls = {}; // id -> {circle, pulseTimer} — fixed REAL_SYSTEMS/REAL_AGENTS nodes, created lazily (see _ensureNode)
  let _positions = {}; // id -> {x,y,port?,sysVar?} — real layout, computed once at mount, NOT drawn until _ensureNode fires
  let _nodeGroup = null; // <g> parent for lazily-created system/agent nodes
  let _lineGroup = null; // <g> parent for lazily-drawn REAL_TOPOLOGY edges
  let _drawnEdges = {}; // "from|to" -> true, once an edge has been drawn (both endpoints real)
  let _meshLayer = null;
  let _meshNodeEls = {}; // dynamic mesh node id -> {g, circle, label, kind}
  let _meshNodeData = {}; // dynamic mesh node id -> the real last-known full data object
  let _onNodeClick = null; // real callback, registered via onNodeClick()
  let _onNodeContextMenu = null; // real callback, registered via onNodeContextMenu()
  let _onNodeConnect = null; // real callback, registered via onNodeConnect() — Phase 2 drag-to-connect
  let _meshEdgeLayer = null;
  let _dragFrom = null;
  let _lastRoutes = [];
  const MESH_RADIUS = 280; // outer ring, beyond REAL_SYSTEMS' r=220 — no visual collision

  function _svgEl(tag, attrs) {
    const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function _layoutCircle(items, cx, cy, r) {
    return items.map((item, i) => {
      const angle = (i / items.length) * Math.PI * 2 - Math.PI / 2;
      return { ...item, x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
    });
  }

  // §BUGFIX — a real, per-id-only position: same id always lands in the
  // same spot, independent of how many other dynamic nodes exist right
  // now or the order they arrived in (see call site's own comment for
  // why _layoutCircle was wrong for this use).
  function _hashPos(id, cx, cy, r) {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    const angle = (h % 3600) / 3600 * Math.PI * 2;
    const rJitter = r - ((h >>> 8) % 40); // ±40px radius spread, still id-stable, reduces label overlap for near-hash ids
    return { x: cx + rJitter * Math.cos(angle), y: cy + rJitter * Math.sin(angle) };
  }

  function _colorFor(sysVar) {
    return sysVar ? `var(${sysVar})` : 'var(--dim)';
  }

  function mount(container) {
    if (_mounted) return _svg;
    const width = 640, height = 640;
    const svg = _svgEl('svg', {
      viewBox: `0 0 ${width} ${height}`, width: '100%', height: '100%',
      class: 'brainos-canvas',
    });
    // Arrowhead marker for real route/pipeline edges (renderRoutes below) —
    // defined once, referenced by marker-end on each edge line.
    const defs = _svgEl('defs', {});
    const marker = _svgEl('marker', {
      id: 'brainos-route-arrow', viewBox: '0 0 10 10', refX: '9', refY: '5',
      markerWidth: '6', markerHeight: '6', orient: 'auto-start-reverse',
    });
    const arrowPath = _svgEl('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: 'var(--idle, #ff6a00)' });
    marker.appendChild(arrowPath);
    defs.appendChild(marker);
    svg.appendChild(defs);

    const systems = _layoutCircle(REAL_SYSTEMS, width / 2, height / 2, 220);
    const agentList = REAL_AGENTS.map((id) => ({ id, sysVar: null }));
    const agents = _layoutCircle(agentList, width / 2, height / 2, 90);
    const isAgentId = new Set(agentList.map((n) => n.id));
    _positions = {};
    systems.concat(agents).forEach((n) => { _positions[n.id] = { ...n, isAgent: isAgentId.has(n.id) }; });

    // §BLANK UNTIL DETECTED — real system/agent nodes and their topology
    // edges are NOT drawn here. Only the (empty) parent groups are
    // created; _ensureNode() populates a node's <g> the first time a
    // real pulse arrives for it (see pulse()/_maybeDrawEdges() below).
    _lineGroup = _svgEl('g', { class: 'brainos-canvas-lines' });
    svg.appendChild(_lineGroup);
    _nodeGroup = _svgEl('g', { class: 'brainos-canvas-nodes' });
    svg.appendChild(_nodeGroup);
    _drawnEdges = {};

    // §NEW 2026-09-06 — James: "brainos is important. do that next."
    // Dynamic mesh layer — agent-mesh's real, live, CHANGING node list
    // (listMeshView()), not the fixed REAL_SYSTEMS/REAL_AGENTS rings
    // above. Empty at mount; populated by renderMeshView() below, once
    // from the real initial GET /agent-mesh/view fetch (brainos.js's
    // own job) and kept live by real mesh.nodes.snapshot/mesh.node.
    // status_changed SSE events after that.
    // §BUILT — Phase 2 real route/pipeline edges (docs/2026-09-11-brainos-
    // agent-orchestration-phasemap.spec). Drawn BELOW the mesh node layer
    // so node dots stay on top and clickable.
    _meshEdgeLayer = _svgEl('g', { class: 'brainos-canvas-mesh-edges' });
    svg.appendChild(_meshEdgeLayer);
    _meshLayer = _svgEl('g', { class: 'brainos-canvas-mesh-layer' });
    svg.appendChild(_meshLayer);

    container.appendChild(svg);
    _svg = svg;
    _mounted = true;
    // Cancel a real in-progress drag-to-connect if dropped anywhere that
    // isn't a node's own mouseup handler above (which stops propagation).
    svg.addEventListener('mouseup', () => { _dragFrom = null; });
    return svg;
  }

  // §BLANK UNTIL DETECTED — creates a real system/agent node's <g> the
  // FIRST time a real signal for its id arrives. No-ops if the id isn't
  // one of REAL_SYSTEMS/REAL_AGENTS (no fabricated node) or if it
  // already exists. After creating, checks REAL_TOPOLOGY for any edge
  // now satisfiable (both real endpoints present) and draws it.
  function _ensureNode(nodeId) {
    if (_nodeEls[nodeId]) return _nodeEls[nodeId];
    const n = _positions[nodeId];
    if (!n || !_nodeGroup) return null; // unrecognized id — no guessed node
    const g = _svgEl('g', { class: 'brainos-canvas-node', 'data-node-id': n.id });
    const circle = _svgEl('circle', {
      cx: n.x, cy: n.y, r: n.isAgent ? 10 : 14,
      fill: n.sysVar ? _colorFor(n.sysVar) : 'var(--panel)',
      stroke: n.sysVar ? _colorFor(n.sysVar) : 'var(--rim)',
      'stroke-width': '1.5',
      class: 'brainos-canvas-dot',
    });
    const label = _svgEl('text', {
      x: n.x, y: n.y + (n.port ? 26 : 22), 'text-anchor': 'middle',
      class: 'brainos-canvas-label',
    });
    label.textContent = n.id;
    g.appendChild(circle);
    g.appendChild(label);
    _nodeGroup.appendChild(g);
    // §EXTENDED 2026-09-11 — James: "connect it to the agent mesh in
    // clearglass." Fixed system/agent nodes previously had no
    // interactivity at all — only the dynamic mesh layer (renderMeshView
    // below) got click/context-menu/drag-to-connect. Same real handlers,
    // same real callbacks (_onNodeClick/_onNodeContextMenu/_onNodeConnect
    // — already wired in brainos-app.js to real GET/POST
    // /agent-mesh/routes, /agent-mesh/spawn, /agent-mesh/route), applied
    // here too. A REAL_AGENTS node (claude/chatgpt/etc.) is passed
    // kind:'agent' so brainos-app.js's existing context-menu code (which
    // branches on node.kind === 'agent' for Spawn/Dispatch) fires
    // identically to how it already does for dynamic agent-kind mesh
    // nodes — no new branch invented, the real one is reused.
    const nodeData = { id: n.id, kind: n.isAgent ? 'agent' : 'system', label: n.id };
    if (g.addEventListener) {
      g.style && (g.style.cursor = 'pointer');
      g.addEventListener('click', () => {
        if (typeof _onNodeClick === 'function') _onNodeClick(nodeData);
      });
      g.addEventListener('contextmenu', (ev) => {
        ev.preventDefault();
        if (typeof _onNodeContextMenu === 'function') _onNodeContextMenu(nodeData, ev);
      });
      g.addEventListener('mousedown', (ev) => { ev.stopPropagation(); _dragFrom = n.id; });
      g.addEventListener('mouseup', (ev) => {
        ev.stopPropagation();
        if (_dragFrom && _dragFrom !== n.id && typeof _onNodeConnect === 'function') {
          _onNodeConnect(_dragFrom, n.id);
        }
        _dragFrom = null;
      });
    }
    const entry = { circle, pulseTimer: null };
    _nodeEls[nodeId] = entry;
    _maybeDrawEdges();
    return entry;
  }

  // Draws any REAL_TOPOLOGY edge whose both endpoints now exist
  // (real, already-pulsed nodes) and hasn't been drawn yet. Never
  // redrawn/animated per call — see header's §CONNECTIONS note.
  function _maybeDrawEdges() {
    if (!_lineGroup) return;
    for (const edge of REAL_TOPOLOGY) {
      const key = `${edge.from}|${edge.to}`;
      if (_drawnEdges[key]) continue;
      const a = _nodeEls[edge.from], b = _nodeEls[edge.to];
      const ap = _positions[edge.from], bp = _positions[edge.to];
      if (!a || !b || !ap || !bp) continue; // one endpoint hasn't been detected yet
      const line = _svgEl('line', {
        x1: ap.x, y1: ap.y, x2: bp.x, y2: bp.y,
        stroke: 'var(--rim)', 'stroke-width': '1', class: 'brainos-canvas-edge',
      });
      const title = _svgEl('title', {});
      title.textContent = edge.source;
      line.appendChild(title);
      _lineGroup.appendChild(line);
      _drawnEdges[key] = true;
    }
  }

  // ── Real pulse — called only from a real event, never on a timer ─────────
  // §HONEST NAME — "pulse", not "heartbeat interval": there is no
  // interval. One real event in, one real, bounded CSS animation out,
  // per §NO_DECORATIVE_MOTION. Now also the real detection point: a
  // node's <g> is created here on its first pulse, not before.
  function pulse(nodeId) {
    const entry = _ensureNode(nodeId);
    if (!entry) return; // an unrecognized/unwired node id — no fabricated pulse
    entry.circle.classList.remove('brainos-pulse');
    // Force reflow so re-triggering the same node's pulse restarts the
    // real CSS animation instead of silently no-op'ing on rapid events.
    void entry.circle.getBoundingClientRect();
    entry.circle.classList.add('brainos-pulse');
  }

  function _meshPulse(id) {
    const entry = _meshNodeEls[id];
    if (!entry) return;
    entry.circle.classList.remove('brainos-pulse');
    void entry.circle.getBoundingClientRect();
    entry.circle.classList.add('brainos-pulse');
  }

  function _meshColorFor(status) {
    // Real, honest mapping — matches listMeshView()'s own real status
    // vocabulary (agent-mesh.js: 'alive'/'idle'/'dead' for nodes, real
    // agent health-derived status strings for agents), not invented.
    // §BUGFIX 2026-09-12, found while retheming — this referenced
    // var(--ok, ...) and var(--dim, ...), neither ever declared in
    // brainos-app.css (checked directly), so both silently ran on
    // their hardcoded fallback literals forever, never the real
    // theme — the exact class of bug already fixed for --rim
    // (0.39.90) and --sys-* (this same pass). Every other real
    // "alive/connected" status color in this file family (badges,
    // the legend, brainos-app.js's own status color helper) already
    // uses --online/--offline for this exact vocabulary; matched.
    if (status === 'alive' || status === 'connected' || status === 'ok') return 'var(--online)';
    if (status === 'idle') return 'var(--warn)';
    return 'var(--offline)';
  }

  // §NEW 2026-09-06 — the real, live dynamic mesh render. Genuinely
  // different from the fixed rings above: agent-mesh's real node list
  // CHANGES (processes/contexts appear and disappear), so this does a
  // real, keyed diff every call — create new, update existing, remove
  // ones no longer present — rather than draw-once-and-pulse.
  //
  // §PRECISION — checked directly, not assumed: the real, periodic
  // mesh.nodes.snapshot SSE event (agent-mesh.js's own _startNodePulse
  // tick) only ever contains kind:'node' entries (its own real source
  // is listNodes(), not the full listMeshView()) — the real chat-agent
  // DOM contexts (kind:'agent') have no periodic snapshot event of
  // their own today. A naive full-replace diff on every 5s node-only
  // snapshot would wrongly erase every agent-kind entry populated by
  // the one real initial GET /agent-mesh/view fetch. Scoped by kind:
  // when `opts.onlyKind` is given, only that kind's entries are
  // diffed/removed; entries of other kinds are left untouched.
  function renderMeshView(nodes, opts = {}) {
    if (!_meshLayer || !Array.isArray(nodes)) return;
    const onlyKind = opts.onlyKind || null;
    const incomingIds = new Set(nodes.map((n) => n.id));

    // Remove entries within scope that are no longer present.
    for (const id of Object.keys(_meshNodeEls)) {
      const entry = _meshNodeEls[id];
      if (onlyKind && entry.kind !== onlyKind) continue; // out of scope — leave alone
      if (!incomingIds.has(id)) {
        entry.g.remove();
        delete _meshNodeEls[id];
      }
    }

    // Add or update.
    for (const n of nodes) {
      let entry = _meshNodeEls[n.id];
      if (!entry) {
        const g = _svgEl('g', { class: 'brainos-canvas-mesh-node', 'data-node-id': n.id, 'data-kind': n.kind });
        const circle = _svgEl('circle', { r: 8, class: 'brainos-canvas-mesh-dot' });
        const label = _svgEl('text', { 'text-anchor': 'middle', class: 'brainos-canvas-mesh-label' });
        g.appendChild(circle);
        g.appendChild(label);
        // §NEW 2026-09-06 — real click handling, for the new NODE
        // detail right-panel tab. Reads the LATEST real data at click
        // time from _meshNodeData, not a stale closure snapshot.
        if (g.addEventListener) {
          g.style && (g.style.cursor = 'pointer');
          g.addEventListener('click', () => {
            if (typeof _onNodeClick === 'function') _onNodeClick(_meshNodeData[n.id] || n);
          });
          // §BUILT — James: "right click nodes, with a context menu."
          // Real data at open time (_meshNodeData[n.id]), same freshness
          // guarantee the click handler above already gives — never a
          // stale closure snapshot from whenever this <g> was first drawn.
          g.addEventListener('contextmenu', (ev) => {
            ev.preventDefault();
            if (typeof _onNodeContextMenu === 'function') _onNodeContextMenu(_meshNodeData[n.id] || n, ev);
          });
          // §BUILT — Phase 2 drag-to-connect: mousedown here, mouseup on a
          // DIFFERENT node fires onNodeConnect(fromId, toId). Same node
          // start+end (a click, or a deliberate drop back on itself) is
          // NOT treated as a feedback-loop edge here — that's ambiguous
          // with a plain click; a feedback loop is created explicitly via
          // the context menu instead (kept separate, not inferred from a
          // possibly-accidental same-node drag).
          g.addEventListener('mousedown', (ev) => { ev.stopPropagation(); _dragFrom = n.id; });
          g.addEventListener('mouseup', (ev) => {
            ev.stopPropagation();
            if (_dragFrom && _dragFrom !== n.id && typeof _onNodeConnect === 'function') {
              _onNodeConnect(_dragFrom, n.id);
            }
            _dragFrom = null;
          });
        }
        _meshLayer.appendChild(g);
        entry = _meshNodeEls[n.id] = { g, circle, label, kind: n.kind };
      }
      entry.circle.setAttribute('fill', _meshColorFor(n.status));
      entry.circle.setAttribute('stroke', _meshColorFor(n.status));
      entry.label.textContent = n.label || n.id;
      _meshNodeData[n.id] = n; // real, current data — always overwritten, never stale by design
    }

    // §BUGFIX — James, live screenshot: "nodes are free on the canvas...
    // it's not fixed." Confirmed real: the previous _layoutCircle(ids...)
    // call recomputes angle as i/items.length for EVERY node on EVERY
    // render — despite this comment's own prior claim of "stable order,"
    // adding or removing even one dynamic node changes items.length for
    // every OTHER node too, reshuffling the whole ring. Replaced with a
    // per-id hash angle: a node's position depends only on its own id,
    // never on how many other nodes currently exist, so it never moves
    // once assigned, regardless of arrivals/departures elsewhere.
    for (const id of Object.keys(_meshNodeEls)) {
      const entry = _meshNodeEls[id];
      const pos = _hashPos(id, 320, 320, MESH_RADIUS);
      entry.circle.setAttribute('cx', pos.x);
      entry.circle.setAttribute('cy', pos.y);
      entry.label.setAttribute('x', pos.x);
      entry.label.setAttribute('y', pos.y + 18);
    }
    // Node positions just changed — redraw any real routes against them
    // so an edge never lags a node that just moved to a new slot.
    renderRoutes(_lastRoutes);
  }

  /**
   * renderRoutes(routes) — real, persisted node-to-node edges (Phase 2).
   * `routes` is the exact array GET /agent-mesh/routes returns — each
   * {id, from, to, kind}. An edge whose endpoint isn't currently a real,
   * rendered node (agent not spawned / node not yet pulsed) is simply
   * skipped, not drawn to a guessed position, same discipline the static
   * REAL_TOPOLOGY lines already use in mount() above.
   */
  function renderRoutes(routes) {
    if (!_meshEdgeLayer) return;
    _lastRoutes = Array.isArray(routes) ? routes : [];
    _meshEdgeLayer.textContent = ''; // real, full redraw — the list is small; no incremental-diff complexity earned yet
    for (const r of _lastRoutes) {
      const a = _meshNodeEls[r.from], b = _meshNodeEls[r.to];
      if (!a || !b) continue;
      const ax = a.circle.getAttribute('cx'), ay = a.circle.getAttribute('cy');
      const bx = b.circle.getAttribute('cx'), by = b.circle.getAttribute('cy');
      const line = _svgEl('line', {
        x1: ax, y1: ay, x2: bx, y2: by,
        class: `brainos-canvas-route-edge brainos-canvas-route-${r.kind || 'pipeline'}`,
        'marker-end': 'url(#brainos-route-arrow)',
      });
      const title = _svgEl('title', {});
      title.textContent = `${r.from} → ${r.to} (${r.kind || 'pipeline'})`;
      line.appendChild(title);
      _meshEdgeLayer.appendChild(line);
    }
  }

  // ── Real event router — called by brainos.js with every real SSE
  // message it already receives, so this file never opens its own
  // second connection (guardian's stream). §EXCEPTION 2026-09-06 —
  // brainos.js now ALSO forwards clear-glass's own real mesh.* events
  // here, from a genuinely separate, deliberate second connection
  // (documented in brainos.js's own header) since agent-mesh lives in
  // a different real process than guardian. ────────────────────────────
  function onRealEvent(ev) {
    if (!ev || typeof ev !== 'object') return;
    // Real agent-mesh events — mesh.node.status_changed, mesh.nodes.
    // snapshot, mesh.raid.decision, mesh.raid.unavailable — all real,
    // confirmed emit() call sites in agent-mesh.js, not invented names.
    if (typeof ev.type === 'string' && ev.type.startsWith('mesh.')) {
      pulse('agent-mesh'); // the fixed aggregate node still pulses on any real mesh activity
      // §NEW 2026-09-06 — use the REAL event payload, not just a pulse.
      if (ev.type === 'mesh.nodes.snapshot' && Array.isArray(ev.nodes)) {
        // Real, confirmed scope: this event's nodes are kind:'node'
        // only (see renderMeshView's own header) — scoped so agent-kind
        // entries from the initial fetch are never wrongly erased.
        renderMeshView(ev.nodes, { onlyKind: 'node' });
      } else if (ev.type === 'mesh.node.status_changed' && ev.instanceId) {
        _meshPulse(ev.instanceId);
      }
      return;
    }
    // Every real event on guardian's stream is guardian's own — its node
    // always pulses, honestly reflecting that this whole stream IS
    // guardian's real internal bus, not a claim any other system is live.
    pulse('guardian');
    if (ev.provider && REAL_AGENTS.includes(ev.provider)) pulse(ev.provider);
    if (ev.provider === 'ollama' || ev.provider === 'mistral') pulse('ollama');
  }

  function onNodeClick(fn) { _onNodeClick = typeof fn === 'function' ? fn : null; }
  function onNodeContextMenu(fn) { _onNodeContextMenu = typeof fn === 'function' ? fn : null; }
  function onNodeConnect(fn) { _onNodeConnect = typeof fn === 'function' ? fn : null; }

  function unmount() {
    if (_svg) { _svg.remove(); _svg = null; }
    _nodeEls = {};
    _positions = {};
    _nodeGroup = null;
    _lineGroup = null;
    _drawnEdges = {};
    _meshLayer = null;
    _meshNodeEls = {};
    _meshNodeData = {};
    _mounted = false;
  }

  function getRealSystemIds() { return REAL_SYSTEMS.map((s) => s.id); }
  function getRealAgentIds() { return REAL_AGENTS.slice(); }

  global.BrainOSCanvas = { mount, unmount, pulse, onRealEvent, renderMeshView, renderRoutes, onNodeClick, onNodeContextMenu, onNodeConnect, getRealSystemIds, getRealAgentIds, MODULE_ID };
})(typeof window !== 'undefined' ? window : globalThis);
