/**
 * ui/contract-renderer.js — NEXUS Contract-Driven UI Renderer
 * UUID: nexus-contract-renderer-v1-0000-4000-0000-000000000001
 * Status: pre-release
 *
 * Reads a NEXUS interaction contract and renders a fully functional UI
 * from it — no hardcoded HTML, no system-specific knowledge required.
 *
 * A contract describes:
 *   - What a system IS (id, role, label, color)
 *   - What it CAN DO (routes: method, path, description, body shape)
 *   - What it EMITS (sse events)
 *   - What CLI commands address it
 *   - What its intent is per seam
 *
 * This renderer turns that description into:
 *   - A system card (identity)
 *   - A route explorer (every route as a clickable form)
 *   - An SSE monitor (live events)
 *   - A CLI reference
 *   - A trust badge (VERIFIED / DEGRADED / MISMATCH)
 *
 * Domain agnostic — works for any system that publishes a contract.
 * The NEXUS orchestrator uses this to render remote peer systems
 * without knowing anything about them in advance.
 *
 * Usage:
 *   const renderer = new ContractRenderer(contract, opts);
 *   document.getElementById('mount').appendChild(renderer.render());
 *   renderer.startSSE(); // optional — start live event stream
 *
 * Or as a standalone page:
 *   GET /ui/contract-view?system=guardian
 *   → fetches /api/contract/guardian, renders full UI
 */

'use strict';

class ContractRenderer {
  constructor(contract, opts = {}) {
    this._contract  = contract;
    this._orchBase  = opts.orchBase  || 'http://127.0.0.1:9000';
    this._peerId    = opts.peerId    || null; // if non-null, proxy through /api/remote/:peerId
    this._theme     = opts.theme     || ContractRenderer.DEFAULT_THEME;
    this._mount     = null;
    this._sseSource = null;
    this._eventLog  = [];
    this._MAX_LOG   = 200;
  }

  // ── API base for this system ───────────────────────────────────────────────
  _base() {
    const sys = this._contract.id || this._contract.systemId || 'unknown';
    if (this._peerId) {
      return `${this._orchBase}/api/remote/${this._peerId}/api/${sys}`;
    }
    const port = this._contract.port;
    return port ? `http://127.0.0.1:${port}` : `${this._orchBase}/api/${sys}`;
  }

  _proxyBase() {
    const sys = this._contract.id || this._contract.systemId || 'unknown';
    return `${this._orchBase}/api/${sys}`;
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  render() {
    const c   = this._contract;
    const col = c.color || '#00d4ff';

    const root = document.createElement('div');
    root.className = 'cr-root';
    root.style.cssText = `font-family:var(--mono,'Cascadia Code',monospace);font-size:11px;color:#d4d4e8;`;

    root.innerHTML = this._css() + `
<div class="cr-system">

  <!-- Header card -->
  <div class="cr-card cr-header">
    <div class="cr-dot" style="background:${col}"></div>
    <div class="cr-meta">
      <div class="cr-id" style="color:${col}">${c.id || c.label || 'system'}</div>
      <div class="cr-role">${c.role || ''}</div>
      ${c.port ? `<div class="cr-port">:${c.port}</div>` : ''}
    </div>
    <div class="cr-trust cr-trust-${this._trustClass()}" id="cr-trust-${c.id}">
      ${this._trustBadge()}
    </div>
    <button class="cr-btn" onclick="this.closest('.cr-system')._renderer.refreshTrust()">↺ verify</button>
  </div>

  <!-- Tabs -->
  <div class="cr-tabs" id="cr-tabs-${c.id}">
    <div class="cr-tab active" onclick="this.closest('.cr-system')._renderer.showTab('routes',this)">Routes</div>
    <div class="cr-tab" onclick="this.closest('.cr-system')._renderer.showTab('live',this)">Live</div>
    <div class="cr-tab" onclick="this.closest('.cr-system')._renderer.showTab('cli',this)">CLI</div>
    <div class="cr-tab" onclick="this.closest('.cr-system')._renderer.showTab('contract',this)">Contract</div>
  </div>

  <!-- Routes panel -->
  <div class="cr-panel active" id="cr-panel-routes-${c.id}">
    ${this._renderRoutes()}
  </div>

  <!-- Live events panel -->
  <div class="cr-panel" id="cr-panel-live-${c.id}">
    <div style="display:flex;align-items:center;gap:8px;padding:8px 0">
      <button class="cr-btn cr-btn-signal" onclick="this.closest('.cr-system')._renderer.toggleSSE(this)">▶ Connect</button>
      <span style="font-size:9px;color:#4a4a7a" id="cr-sse-status-${c.id}">not connected</span>
      <span style="margin-left:auto;font-size:9px;color:#4a4a7a" id="cr-event-count-${c.id}">0 events</span>
    </div>
    <div id="cr-events-${c.id}" style="max-height:320px;overflow-y:auto;display:flex;flex-direction:column;gap:3px"></div>
  </div>

  <!-- CLI panel -->
  <div class="cr-panel" id="cr-panel-cli-${c.id}">
    ${this._renderCLI()}
  </div>

  <!-- Contract panel -->
  <div class="cr-panel" id="cr-panel-contract-${c.id}">
    <pre style="font-size:9px;color:#4a4a7a;overflow:auto;max-height:400px">${
      JSON.stringify(this._contract, null, 2).replace(/</g,'&lt;')
    }</pre>
  </div>

</div>`;

    // Store renderer ref on DOM node so onclick handlers can find it
    root.querySelector('.cr-system')._renderer = this;
    this._mount = root;
    return root;
  }

  // ── Render route list ──────────────────────────────────────────────────────
  _renderRoutes() {
    const routes = this._contract.routes || [];
    if (!routes.length) return '<div style="color:#4a4a7a;padding:8px">No routes declared.</div>';

    return routes.map((r, i) => {
      const method = r.method || 'GET';
      const path   = r.path   || '';
      const desc   = r.description || r.desc || '';
      const body   = r.body   || [];
      const params = r.params || [];
      const methodColor = {
        GET:'#4a9eff', POST:'#3ecf8e', PUT:'#f0a500', DELETE:'#e85d3c', PATCH:'#9b7fe8'
      }[method] || '#4a4a7a';

      const hasInput = body.length > 0 || params.length > 0;
      const id = `cr-route-${i}-${this._contract.id}`;

      return `
<div class="cr-route" id="${id}">
  <div class="cr-route-hdr" onclick="document.getElementById('${id}-body').style.display=document.getElementById('${id}-body').style.display==='none'?'block':'none'">
    <span class="cr-method" style="color:${methodColor}">${method}</span>
    <span class="cr-path">${path}</span>
    <span class="cr-desc">${desc}</span>
  </div>
  <div id="${id}-body" style="display:none;padding:8px 12px 10px;background:#0e0e14;border-top:1px solid #1c1c2e">
    ${hasInput ? `
    <div style="margin-bottom:6px">
      ${params.map(p => `<div class="cr-field"><label>${p}</label><input class="cr-input" placeholder="${p}" id="${id}-p-${p}"></div>`).join('')}
      ${body.map(b => `<div class="cr-field"><label>${b}</label><input class="cr-input" placeholder="${b}" id="${id}-b-${b}"></div>`).join('')}
    </div>` : ''}
    <button class="cr-btn cr-btn-signal" onclick="this.closest('.cr-system')._renderer.executeRoute(${i}, '${id}')">→ Execute</button>
    <div id="${id}-result" style="margin-top:8px;font-size:10px;word-break:break-all;max-height:200px;overflow-y:auto"></div>
  </div>
</div>`;
    }).join('');
  }

  // ── Execute a route ────────────────────────────────────────────────────────
  async executeRoute(routeIndex, elId) {
    const route   = (this._contract.routes || [])[routeIndex];
    if (!route) return;

    const method  = route.method || 'GET';
    const path    = route.path.replace(/:([a-z_]+)/g, (_, p) => {
      const el = document.getElementById(`${elId}-p-${p}`);
      return el ? encodeURIComponent(el.value || `:${p}`) : `:${p}`;
    });

    const bodyObj = {};
    (route.body || []).forEach(b => {
      const el = document.getElementById(`${elId}-b-${b}`);
      if (el?.value) bodyObj[b] = el.value;
    });

    const resultEl = document.getElementById(`${elId}-result`);
    if (resultEl) resultEl.innerHTML = '<span style="color:#4a4a7a">executing…</span>';

    try {
      const base = this._proxyBase();
      const url  = base + path;
      const opts = { method, headers: { 'Content-Type': 'application/json' } };
      if (method !== 'GET' && Object.keys(bodyObj).length) {
        opts.body = JSON.stringify(bodyObj);
      }

      const r   = await fetch(url, opts);
      const txt = await r.text();
      let display;
      try {
        const d = JSON.parse(txt);
        display = JSON.stringify(d, null, 2);
      } catch(_) { display = txt; }

      if (resultEl) {
        const col = r.ok ? '#3ecf8e' : '#e85d3c';
        resultEl.innerHTML = `<span style="color:${col}">HTTP ${r.status}</span><pre style="margin-top:4px;font-size:9px;color:#4a4a7a">${display.replace(/</g,'&lt;').slice(0,2000)}</pre>`;
      }
    } catch(e) {
      if (resultEl) resultEl.innerHTML = `<span style="color:#e85d3c">✗ ${e.message}</span>`;
    }
  }

  // ── Render CLI reference ───────────────────────────────────────────────────
  _renderCLI() {
    const cmds = this._contract.cli || [];
    if (!cmds.length) return '<div style="color:#4a4a7a;padding:8px">No CLI commands declared.</div>';

    return `<div style="display:flex;flex-direction:column;gap:4px">` +
      cmds.map(c => `
<div style="display:flex;align-items:baseline;gap:12px;padding:5px 0;border-bottom:1px solid #1c1c2e">
  <code style="color:#4a9eff;flex-shrink:0">${c.cmd || c.command}</code>
  <span style="color:#4a4a7a;font-size:10px">${c.description || c.desc || ''}</span>
</div>`).join('') + '</div>';
  }

  // ── Trust badge ────────────────────────────────────────────────────────────
  _trustClass() {
    const t = this._contract._trust || 'UNVERIFIED';
    return { VERIFIED:'ok', DEGRADED:'warn', MISMATCH:'err', UNREACHABLE:'err', UNVERIFIED:'dim' }[t] || 'dim';
  }
  _trustBadge() {
    const t = this._contract._trust || 'UNVERIFIED';
    return `<span>${t}</span>`;
  }

  async refreshTrust() {
    try {
      const r = await fetch(`${this._orchBase}/api/trust`);
      const d = await r.json();
      const entry = (d.all || []).find(e => e.systemId === this._contract.id);
      if (entry) {
        this._contract._trust = entry.trust;
        const badge = this._mount?.querySelector(`#cr-trust-${this._contract.id}`);
        if (badge) {
          badge.className = `cr-trust cr-trust-${this._trustClass()}`;
          badge.innerHTML = this._trustBadge();
        }
      }
    } catch(_) {}
  }

  // ── Tab switching ──────────────────────────────────────────────────────────
  showTab(name, tabEl) {
    const id = this._contract.id;
    this._mount?.querySelectorAll('.cr-tab').forEach(t => t.classList.remove('active'));
    this._mount?.querySelectorAll('.cr-panel').forEach(p => p.classList.remove('active'));
    tabEl?.classList.add('active');
    const panel = this._mount?.querySelector(`#cr-panel-${name}-${id}`);
    if (panel) panel.classList.add('active');
    if (name === 'live') this._ensureSSE();
  }

  // ── SSE ───────────────────────────────────────────────────────────────────
  _ensureSSE() {
    if (this._sseSource) return;
    this.toggleSSE();
  }

  toggleSSE(btn) {
    if (this._sseSource) {
      this._sseSource.close();
      this._sseSource = null;
      if (btn) btn.textContent = '▶ Connect';
      const s = this._mount?.querySelector(`#cr-sse-status-${this._contract.id}`);
      if (s) s.textContent = 'disconnected';
      return;
    }

    const ssePath = this._contract.sse?.path || '/events';
    const url     = this._proxyBase() + ssePath;

    try {
      this._sseSource = new EventSource(url);
      if (btn) btn.textContent = '■ Disconnect';
      const s = this._mount?.querySelector(`#cr-sse-status-${this._contract.id}`);
      if (s) s.textContent = 'connected';

      this._sseSource.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          this._addEvent(data);
        } catch(_) { this._addEvent({ raw: e.data }); }
      };
      this._sseSource.onerror = () => {
        const s = this._mount?.querySelector(`#cr-sse-status-${this._contract.id}`);
        if (s) s.textContent = 'reconnecting…';
      };
    } catch(e) {}
  }

  _addEvent(data) {
    this._eventLog.unshift(data);
    if (this._eventLog.length > this._MAX_LOG) this._eventLog.pop();

    const el  = this._mount?.querySelector(`#cr-events-${this._contract.id}`);
    const cnt = this._mount?.querySelector(`#cr-event-count-${this._contract.id}`);
    if (cnt) cnt.textContent = `${this._eventLog.length} events`;
    if (!el) return;

    const row = document.createElement('div');
    row.style.cssText = 'padding:2px 0;border-bottom:1px solid #1c1c2e;font-size:9px;color:#4a4a7a';
    row.textContent = JSON.stringify(data).slice(0, 120);
    el.prepend(row);
    if (el.children.length > this._MAX_LOG) el.lastChild?.remove();
  }

  // ── CSS ───────────────────────────────────────────────────────────────────
  _css() {
    return `<style>
.cr-root{--cr-bg:#08080f;--cr-bg2:#0d0d1a;--cr-bg3:#111120;--cr-border:#1c1c35;--cr-text:#d4d4e8;--cr-muted:#4a4a7a;background:var(--cr-bg2);border:1px solid var(--cr-border);border-radius:4px;overflow:hidden}
.cr-system{display:flex;flex-direction:column}
.cr-header{display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--cr-bg3);border-bottom:1px solid var(--cr-border)}
.cr-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.cr-meta{flex:1}
.cr-id{font-size:13px;font-weight:700;letter-spacing:.06em}
.cr-role{font-size:9px;color:var(--cr-muted);margin-top:2px}
.cr-port{font-size:9px;color:var(--cr-muted)}
.cr-trust{font-size:9px;padding:2px 8px;border-radius:10px;border:1px solid}
.cr-trust-ok{color:#3ecf8e;border-color:#3ecf8e;background:rgba(62,207,142,.08)}
.cr-trust-warn{color:#f0a500;border-color:#f0a500;background:rgba(240,165,0,.08)}
.cr-trust-err{color:#e85d3c;border-color:#e85d3c;background:rgba(232,93,60,.08)}
.cr-trust-dim{color:#4a4a7a;border-color:#4a4a7a}
.cr-tabs{display:flex;background:var(--cr-bg3);border-bottom:1px solid var(--cr-border)}
.cr-tab{padding:6px 14px;font-size:10px;cursor:pointer;color:var(--cr-muted);border-bottom:2px solid transparent;text-transform:uppercase;letter-spacing:.06em}
.cr-tab.active{color:#00d4ff;border-bottom-color:#00d4ff}
.cr-tab:hover:not(.active){color:var(--cr-text)}
.cr-panel{display:none;padding:10px 14px;overflow-y:auto;max-height:600px}
.cr-panel.active{display:block}
.cr-route{border-bottom:1px solid var(--cr-border)}
.cr-route-hdr{display:flex;align-items:center;gap:10px;padding:7px 4px;cursor:pointer}
.cr-route-hdr:hover{background:var(--cr-bg3)}
.cr-method{font-size:9px;font-weight:700;width:42px;flex-shrink:0;letter-spacing:.06em}
.cr-path{color:var(--cr-text);flex-shrink:0}
.cr-desc{color:var(--cr-muted);font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cr-field{display:flex;align-items:center;gap:6px;margin-bottom:4px}
.cr-field label{font-size:9px;color:var(--cr-muted);width:80px;flex-shrink:0}
.cr-input{flex:1;background:var(--cr-bg);border:1px solid var(--cr-border);color:var(--cr-text);font:11px monospace;padding:3px 6px;outline:none}
.cr-btn{background:var(--cr-bg3);border:1px solid var(--cr-border);color:var(--cr-muted);font:10px monospace;padding:3px 10px;cursor:pointer}
.cr-btn:hover{border-color:#00d4ff;color:#00d4ff}
.cr-btn-signal{border-color:#3ecf8e;color:#3ecf8e}
.cr-btn-signal:hover{border-color:#00d4ff;color:#00d4ff}
.cr-card{background:var(--cr-bg3)}
</style>`;
  }

  // ── Default theme ─────────────────────────────────────────────────────────
  static DEFAULT_THEME = {
    bg: '#08080f', bg2: '#0d0d1a', border: '#1c1c35',
    text: '#d4d4e8', muted: '#4a4a7a', signal: '#00d4ff',
  };
}

// ── ContractExplorer — renders ALL contracts in one view ──────────────────────
// Usage: new ContractExplorer({ orchBase }).mount(document.getElementById('app'))
class ContractExplorer {
  constructor(opts = {}) {
    this._orchBase  = opts.orchBase  || 'http://127.0.0.1:9000';
    this._filter    = opts.filter    || null; // category filter
    this._renderers = new Map();
    this._mount     = null;
  }

  async mount(el) {
    this._mount = el;
    el.innerHTML = `
<div style="font-family:monospace;font-size:11px;color:#d4d4e8">
  <div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #1c1c35;margin-bottom:12px">
    <span style="color:#00d4ff;font-weight:700">NEXUS CONTRACT EXPLORER</span>
    <button onclick="this.closest('[data-cr-explorer]').explorer.refresh()" style="background:none;border:1px solid #1c1c35;color:#4a4a7a;font:10px monospace;padding:2px 8px;cursor:pointer">↺ refresh</button>
    <span style="margin-left:auto;font-size:9px;color:#4a4a7a" id="cr-status">loading…</span>
  </div>
  <div id="cr-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:16px"></div>
  <div style="margin-top:16px;padding-top:12px;border-top:1px solid #1c1c35">
    <div style="font-size:9px;color:#4a4a7a;margin-bottom:6px">REMOTE PEERS</div>
    <div id="cr-peers" style="display:flex;gap:8px;flex-wrap:wrap"></div>
    <div style="margin-top:8px;display:flex;gap:6px">
      <input id="cr-peer-url" placeholder="remote orchestrator URL (e.g. https://nexus.example.com)" style="flex:1;background:#0d0d1a;border:1px solid #1c1c35;color:#d4d4e8;font:11px monospace;padding:4px 8px">
      <button onclick="this.closest('[data-cr-explorer]').explorer.connectPeer()" style="background:none;border:1px solid #3ecf8e;color:#3ecf8e;font:10px monospace;padding:3px 10px;cursor:pointer">→ Connect Peer</button>
    </div>
  </div>
</div>`;

    el.setAttribute('data-cr-explorer', '1');
    el.explorer = this;
    await this.refresh();
  }

  async refresh() {
    const status = this._mount?.querySelector('#cr-status');
    if (status) status.textContent = 'fetching contracts…';

    try {
      const r = await fetch(`${this._orchBase}/api/contract`);
      const d = await r.json();
      const contract = d.contract || d;
      const systems  = contract.systems || {};
      const trust    = await fetch(`${this._orchBase}/api/trust`)
        .then(r => r.json()).then(d => d.all || []).catch(() => []);

      const trustMap = {};
      trust.forEach(e => { trustMap[e.systemId] = e; });

      const grid = this._mount?.querySelector('#cr-grid');
      if (!grid) return;
      grid.innerHTML = '';

      for (const [id, sysCon] of Object.entries(systems)) {
        const enriched = { ...sysCon, id, _trust: trustMap[id]?.trust || 'UNVERIFIED' };
        const renderer = new ContractRenderer(enriched, { orchBase: this._orchBase });
        this._renderers.set(id, renderer);
        grid.appendChild(renderer.render());
      }

      // Render peers
      await this._renderPeers();

      if (status) status.textContent = `${Object.keys(systems).length} systems · ${trust.filter(t=>t.trust==='VERIFIED').length} verified`;
    } catch(e) {
      if (status) status.textContent = `error: ${e.message}`;
    }
  }

  async _renderPeers() {
    const peersEl = this._mount?.querySelector('#cr-peers');
    if (!peersEl) return;

    try {
      const r = await fetch(`${this._orchBase}/api/peer/list`);
      const d = await r.json();
      const peers = d.peers || [];

      if (!peers.length) {
        peersEl.innerHTML = '<span style="color:#4a4a7a;font-size:10px">No remote peers connected.</span>';
        return;
      }

      peersEl.innerHTML = peers.map(p => {
        const col = p.status === 'online' ? '#3ecf8e' : p.status === 'degraded' ? '#f0a500' : '#e85d3c';
        return `<div style="background:#0d0d1a;border:1px solid ${col};border-radius:3px;padding:6px 10px;min-width:160px">
          <div style="color:${col};font-size:10px;font-weight:700">${p.peerId}</div>
          <div style="color:#4a4a7a;font-size:9px">${p.host}:${p.port}</div>
          <div style="color:#4a4a7a;font-size:9px">${p.trust} · ${p.routeCount || '?'} routes</div>
          <button onclick="this.closest('[data-cr-explorer]').explorer.exploreRemote('${p.peerId}')"
            style="margin-top:4px;background:none;border:1px solid #1c1c35;color:#4a4a7a;font:9px monospace;padding:1px 6px;cursor:pointer">explore →</button>
        </div>`;
      }).join('');
    } catch(_) {}
  }

  async connectPeer() {
    const input = this._mount?.querySelector('#cr-peer-url');
    const url   = input?.value?.trim();
    if (!url) return;

    try {
      const r = await fetch(`${this._orchBase}/api/peer/announce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ peerId: 'remote-' + Date.now(), host: new URL(url).hostname, port: parseInt(new URL(url).port) || 9000 }),
      });
      const d = await r.json();
      if (d.ok) { if (input) input.value = ''; await this._renderPeers(); }
      else alert('Peer connection failed: ' + d.error);
    } catch(e) { alert('Error: ' + e.message); }
  }

  async exploreRemote(peerId) {
    // Fetch the remote's contract through the peer proxy and render it
    try {
      const r = await fetch(`${this._orchBase}/api/remote/${peerId}/api/contract`);
      const d = await r.json();
      const contract = d.contract || d;
      const systems  = contract.systems || {};
      const grid     = this._mount?.querySelector('#cr-grid');
      if (!grid) return;

      // Clear local systems, render remote ones
      grid.innerHTML = `<div style="color:#f0a500;font-size:9px;padding:4px 0;grid-column:1/-1">▶ REMOTE: ${peerId}</div>`;
      for (const [id, sysCon] of Object.entries(systems)) {
        const enriched = { ...sysCon, id, _trust: 'REMOTE' };
        const renderer = new ContractRenderer(enriched, { orchBase: this._orchBase, peerId });
        grid.appendChild(renderer.render());
      }
    } catch(e) { alert('Cannot reach remote: ' + e.message); }
  }
}

// ── Export (browser + Node) ───────────────────────────────────────────────────
if (typeof module !== 'undefined') module.exports = { ContractRenderer, ContractExplorer };
