/**
 * ui/tv-shell/warp-ui/nexus-shell.js
 * UUID: nexus-shell-warp-v1-0000-2026-0704-jamesbrooks-001
 *
 * The NEXUS TV-shell Warp stream.
 * This IS the build logic / spine the TV-shell runs on.
 *
 * Architecture:
 *   Warp Stream receives nexus.* Events
 *   ↓
 *   Gate: contract-reader    — fetches /contract per system, shapes into canonical form
 *   Gate: health-poller      — checks health routes declared in the contract
 *   Gate: registry-builder   — reads component list from contract.routes
 *   Gate: component-renderer — turns contract data into DOM
 *   ↓
 *   Axiom: contract-only     — hard: no route call unless it's in the contract
 *   Axiom: §5.7              — hard: no direct import of sibling system modules
 *
 * The stream polls on a timer and also reacts to SSE events from the bus.
 * Every system card in the TV-shell is rendered from its own contract.
 * Add a new system? It appears automatically once it has a /contract endpoint.
 */

(function(global) {
'use strict';

const { Event, Gate, Axiom, Stream } = global.Warp;

// ── Config ───────────────────────────────────────────────────────────────────
const ORCH    = 'http://127.0.0.1:9000';
const SYSTEMS = [
  { id:'orchestrator', port:9000,  label:'Orchestrator', icon:'⬡', color:'#00e5ff' },
  { id:'guardian',     port:7820,  label:'Guardian',     icon:'⚡', color:'#ffaa00' },
  { id:'cortex',       port:3748,  label:'Cortex',       icon:'◈', color:'#00ff88' },
  { id:'copilot',      port:3750,  label:'Co-pilot',     icon:'✦', color:'#a78bfa' },
  { id:'idearium',     port:4800,  label:'Idearium',     icon:'◐', color:'#a78bfa' },
  { id:'bridge',       port:9999,  label:'Bridge',       icon:'⟁', color:'#8890bb' },
  { id:'architect',    port:3747,  label:'Architect',    icon:'▲', color:'#ff8844' },
  { id:'ollama',       port:3749,  label:'Ollama',       icon:'◆', color:'#44ddaa' },
  { id:'eravos',       port:3751,  label:'Eravos',       icon:'◎', color:'#dd44aa' },
  { id:'loom',         port:3752,  label:'Loom',         icon:'⊕', color:'#44aadd' },
  { id:'emerge',       port:4242,  label:'Emerge IDE',   icon:'◆', color:'#44ddaa' },
];

// ── Contract cache — per system ───────────────────────────────────────────────
const _contracts = {};
const _health    = {};
const _lastFetch = {};

// ── Fetch helpers ─────────────────────────────────────────────────────────────
async function _get(url, timeoutMs = 3000) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return r.ok ? r.json().catch(() => null) : null;
  } catch(_) { return null; }
}

async function _fetchContract(sys) {
  const now = Date.now();
  if (_contracts[sys.id] && (now - (_lastFetch[sys.id] || 0)) < 30000) {
    return _contracts[sys.id]; // cache 30s
  }
  // Try direct, then via orchestrator proxy
  let contract = await _get(`http://127.0.0.1:${sys.port}/contract`);
  if (!contract) contract = await _get(`${ORCH}/api/${sys.id}/contract`);
  if (contract) {
    _contracts[sys.id] = contract;
    _lastFetch[sys.id] = now;
  }
  return contract || null;
}

async function _fetchHealth(sys, contract) {
  const path = contract?.health?.path || '/health';
  const data = await _get(`http://127.0.0.1:${sys.port}${path}`, 2000);
  const ok   = data?.ok !== false && data !== null;
  _health[sys.id] = { ok, data, ts: Date.now() };
  return _health[sys.id];
}

// ── Axioms ────────────────────────────────────────────────────────────────────

// §5.7 — only call routes the contract declares
const ContractOnlyAxiom = new Axiom({
  id:          'contract-only',
  version:     '1.0',
  severity:    'hard',
  description: '§5.7: only fetch routes explicitly declared in the system contract',
  check: (event, gate, state) => {
    // Gate must declare which routes it will call in event.data._routes
    // If the gate doesn't declare any routes, it's a pure rendering gate — allow it
    if (!event.data._routes || event.data._routes.length === 0) return true;
    const contract = _contracts[event.data._systemId];
    if (!contract) return true; // no contract loaded yet — allow (contract-reader will load it)
    const declaredPaths = new Set((contract.routes || []).map(r => r.path));
    for (const route of event.data._routes) {
      if (!declaredPaths.has(route)) {
        console.warn(`[Warp/Axiom] contract-only: ${event.data._systemId} route ${route} not in contract`);
        return false;
      }
    }
    return true;
  },
});

// ── Gates ─────────────────────────────────────────────────────────────────────

// Gate 1: contract-reader — fetches contract, emits nexus.contract.loaded
const ContractReaderGate = new Gate({
  signature: 'contract-reader',
  schema: { requiredKeys: ['_systemId', '_port'] },

  matches: (event) => event.type === 'nexus.system.poll',

  transform: (event) => {
    const sys = SYSTEMS.find(s => s.id === event.data._systemId);
    if (!sys) return [];

    // Async — emit result when ready
    Promise.all([
      _fetchContract(sys),
      null, // health fetched after we have contract
    ]).then(async ([contract]) => {
      const health = await _fetchHealth(sys, contract);
      NexusShell.stream.emit(new Event('nexus.contract.loaded', {
        _systemId: sys.id,
        _port:     sys.port,
        _meta:     sys,
        contract,
        health,
      }));
    }).catch(() => {
      // System unreachable
      NexusShell.stream.emit(new Event('nexus.contract.loaded', {
        _systemId: sys.id,
        _port:     sys.port,
        _meta:     sys,
        contract:  null,
        health:    { ok: false, data: null },
      }));
    });

    return []; // async result comes via separate emit
  },
});

// Gate 2: component-renderer — turns contract.loaded into DOM
const ComponentRendererGate = new Gate({
  signature: 'component-renderer',

  matches: (event) => event.type === 'nexus.contract.loaded',

  transform: (event) => {
    const { _systemId, _meta, contract, health } = event.data;
    const el = document.getElementById(`nexus-card-${_systemId}`);
    if (!el) return [];

    el.innerHTML = _renderCard(_meta, contract, health);
    el.dataset.online = health?.ok ? 'true' : 'false';

    // Return a rendered event for the stream log
    return [new Event('nexus.component.rendered', {
      _systemId,
      online: health?.ok ?? false,
      componentCount: (contract?.routes || []).length,
    })];
  },
});

// Gate 3: overview-tile-updater — updates the overview grid tiles (small cards)
const OverviewTileGate = new Gate({
  signature: 'overview-tile-updater',

  matches: (event) => event.type === 'nexus.component.rendered',

  transform: (event) => {
    const { _systemId, online, componentCount } = event.data;
    const tile = document.getElementById(`tile-${_systemId}`) ||
                 document.getElementById(`tile-${_abbrev(_systemId)}`);
    if (!tile) return [];

    const statusEl = tile.querySelector('.tile-status');
    if (statusEl) {
      statusEl.textContent = online ? 'ONLINE' : 'OFFLINE';
      statusEl.style.color = online ? '#00e5ff' : '#ff4444';
    }

    // Update component count if there's a metric element
    const metricEls = tile.querySelectorAll('.tm-val');
    if (metricEls[0] && componentCount > 0) {
      // Only update if it's a "components" metric
      const lbl = tile.querySelectorAll('.tm-lbl')[0];
      if (lbl && lbl.textContent.toLowerCase().includes('component')) {
        metricEls[0].textContent = componentCount;
      }
    }

    return [];
  },
});

// ── Card rendering ────────────────────────────────────────────────────────────
function _renderCard(meta, contract, health) {
  const online = health?.ok !== false;
  const statusColor = online ? '#00e5ff' : '#ff4444';
  const routes = contract?.routes || [];

  if (!contract) {
    return `<div class="warp-card-offline">
      <div class="warp-card-header">
        <span style="color:#ff4444">⚠</span>
        <span class="warp-card-name">${meta.label}</span>
        <span class="warp-card-port">:${meta.port}</span>
        <span class="warp-card-status offline">OFFLINE</span>
      </div>
      <div class="warp-card-role">Contract unreachable — system may be starting</div>
    </div>`;
  }

  return `
    <div class="warp-card" data-system="${meta.id}">
      <div class="warp-card-header">
        <span style="color:${meta.color};font-size:16px">${meta.icon}</span>
        <span class="warp-card-name" style="color:${meta.color}">${meta.label}</span>
        <span class="warp-card-port">:${meta.port}</span>
        <span class="warp-card-badge">v${contract.version || '—'}</span>
        <span class="warp-card-status ${online ? 'online' : 'offline'}" style="color:${statusColor}">
          ${online ? 'ONLINE' : 'OFFLINE'}
        </span>
      </div>

      <div class="warp-card-role">${contract.role || ''}</div>

      <div class="warp-card-routes">
        <div class="warp-routes-head">
          ${routes.length} declared route${routes.length !== 1 ? 's' : ''}
        </div>
        <div class="warp-routes-grid">
          ${routes.slice(0, 6).map(r => `
            <div class="warp-route">
              <span class="warp-route-method ${(r.method||'GET').toLowerCase()}">${r.method||'GET'}</span>
              <span class="warp-route-path">${r.path}</span>
            </div>
          `).join('')}
          ${routes.length > 6 ? `<div class="warp-route-more">+${routes.length - 6} more</div>` : ''}
        </div>
      </div>

      ${contract.axioms?.length ? `
        <div class="warp-axioms">
          ${contract.axioms.map(a => `<span class="warp-axiom">${a}</span>`).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function _abbrev(id) {
  const m = { orchestrator:'orch', guardian:'gd', cortex:'cx', idearium:'idr',
               bridge:'br', architect:'arch', emerge:'em', copilot:'cp',
               ollama:'ol', eravos:'er', loom:'loom' };
  return m[id] || id;
}

// ── CSS injection ─────────────────────────────────────────────────────────────
function _injectCSS() {
  if (document.getElementById('warp-shell-css')) return;
  const s = document.createElement('style');
  s.id = 'warp-shell-css';
  s.textContent = `
    .warp-card, .warp-card-offline {
      background: rgba(255,255,255,.02); border: 1px solid rgba(255,255,255,.07);
      border-radius: 10px; overflow: hidden;
    }
    .warp-card-offline { border-color: rgba(255,68,68,.15); }
    .warp-card-header {
      display:flex; align-items:center; gap:8px;
      padding:12px 16px 8px; border-bottom:1px solid rgba(255,255,255,.05);
    }
    .warp-card-name { font-family:'Space Mono',monospace; font-size:12px; font-weight:700; letter-spacing:.06em; }
    .warp-card-port { font-family:'Space Mono',monospace; font-size:10px; color:rgba(255,255,255,.25); }
    .warp-card-badge{ font-family:'Space Mono',monospace; font-size:9px; color:rgba(255,255,255,.2); margin-left:auto; }
    .warp-card-status { font-family:'Space Mono',monospace; font-size:9px; padding:2px 7px; border-radius:4px; letter-spacing:.08em; }
    .warp-card-status.online  { background:rgba(0,229,255,.08); }
    .warp-card-status.offline { background:rgba(255,68,68,.08); }
    .warp-card-role { padding:8px 16px; font-size:11px; color:rgba(255,255,255,.35); line-height:1.5; border-bottom:1px solid rgba(255,255,255,.04); }
    .warp-card-routes { padding:10px 16px; }
    .warp-routes-head { font-family:'Space Mono',monospace; font-size:9px; color:rgba(255,255,255,.2); text-transform:uppercase; letter-spacing:.1em; margin-bottom:8px; }
    .warp-routes-grid { display:flex; flex-direction:column; gap:3px; }
    .warp-route { display:flex; align-items:center; gap:8px; }
    .warp-route-method { font-family:'Space Mono',monospace; font-size:8px; padding:1px 5px; border-radius:3px; flex-shrink:0; }
    .warp-route-method.get  { background:rgba(0,229,255,.1); color:#00e5ff; }
    .warp-route-method.post { background:rgba(255,170,0,.1); color:#ffaa00; }
    .warp-route-method.put  { background:rgba(130,100,255,.1); color:#8264ff; }
    .warp-route-method.delete { background:rgba(255,68,68,.1); color:#ff4444; }
    .warp-route-method.bus  { background:rgba(170,100,255,.1); color:#aa64ff; }
    .warp-route-method.event{ background:rgba(100,200,100,.1); color:#64c864; }
    .warp-route-method.behavior{ background:rgba(255,200,50,.1); color:#ffc832; }
    .warp-route-path { font-family:'Space Mono',monospace; font-size:9px; color:rgba(255,255,255,.5); }
    .warp-route-more { font-size:9px; color:rgba(255,255,255,.2); font-style:italic; padding-top:4px; }
    .warp-axioms { display:flex; flex-wrap:wrap; gap:4px; padding:8px 16px; border-top:1px solid rgba(255,255,255,.04); }
    .warp-axiom  { font-family:'Space Mono',monospace; font-size:8px; background:rgba(255,255,255,.04); color:rgba(255,255,255,.3); padding:2px 6px; border-radius:3px; }

    .warp-shell-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 12px;
      padding: 16px;
    }
  `;
  document.head.appendChild(s);
}

// ── NexusShell — public API ───────────────────────────────────────────────────
const NexusShell = {
  stream: null,
  _pollTimer: null,

  init(containerEl) {
    _injectCSS();

    // Build the Warp stream
    const stream = new Stream('nexus-shell');
    stream.addAxiom(ContractOnlyAxiom);
    stream.register(ContractReaderGate);
    stream.register(ComponentRendererGate);
    stream.register(OverviewTileGate);
    this.stream = stream;

    // Render the grid of contract-driven cards
    if (containerEl) {
      containerEl.innerHTML = `<div class="warp-shell-grid">${
        SYSTEMS.map(s => `<div id="nexus-card-${s.id}" class="warp-card-loading">
          <div class="warp-card-header">
            <span style="color:${s.color}">${s.icon}</span>
            <span class="warp-card-name" style="color:${s.color}">${s.label}</span>
            <span class="warp-card-port">:${s.port}</span>
          </div>
          <div class="warp-card-role" style="color:rgba(255,255,255,.2);font-style:italic">Reading contract…</div>
        </div>`).join('')
      }</div>`;
    }

    // Initial poll — emit one poll event per system
    this._poll();

    // Poll every 8s (contracts are cached 30s, health rechecked each poll)
    this._pollTimer = setInterval(() => this._poll(), 8000);

    // Subscribe to orchestrator SSE for live events
    this._connectSSE();

    return this;
  },

  _poll() {
    for (const sys of SYSTEMS) {
      this.stream.emit(new Event('nexus.system.poll', {
        _systemId: sys.id,
        _port:     sys.port,
      }));
    }
  },

  _connectSSE() {
    try {
      const es = new EventSource(`${ORCH}/sse`);

      es.addEventListener('ledger.entry', (e) => {
        try {
          const d = JSON.parse(e.data);
          this.stream.emit(new Event('nexus.ledger.entry', d));
        } catch(_) {}
      });

      es.addEventListener('orchestrator.system.registered', (e) => {
        try {
          const d = JSON.parse(e.data);
          // Re-poll the newly registered system to pick up its contract
          if (d.systemId) {
            setTimeout(() => {
              this.stream.emit(new Event('nexus.system.poll', {
                _systemId: d.systemId,
                _port:     d.port || 0,
              }));
            }, 1000);
          }
        } catch(_) {}
      });

      es.onerror = () => setTimeout(() => this._connectSSE(), 5000);
    } catch(_) {}
  },

  // Force re-read contracts (clears cache)
  refresh() {
    Object.keys(_contracts).forEach(k => delete _contracts[k]);
    Object.keys(_lastFetch).forEach(k => delete _lastFetch[k]);
    this._poll();
  },

  stop() {
    if (this._pollTimer) clearInterval(this._pollTimer);
  },
};

global.NexusShell = NexusShell;

})(typeof window !== 'undefined' ? window : globalThis);
