/**
 * ui/tv-shell/components/system-component.js
 * UUID: nexus-tv-component-base-v1-0000-2026-0704
 *
 * Base class for all tv-shell channel components.
 * Each system component:
 *   1. Fetches GET /contract from its system
 *   2. Renders a consistent card from the contract data
 *   3. Then fetches live data from the routes the contract declares
 *   4. Polls on a timer — no hardcoded assumptions about what routes exist
 *
 * Usage:
 *   const comp = new SystemComponent('guardian', 7820, { orch: 9000 });
 *   comp.mount(document.getElementById('ch-guardian'));
 */

class SystemComponent {
  constructor(id, port, ports = {}) {
    this.id      = id;
    this.port    = port;
    this.ports   = ports;
    this.orch    = ports.orch ? `http://127.0.0.1:${ports.orch}` : 'http://127.0.0.1:9000';
    this.base    = `http://127.0.0.1:${port}`;
    this.contract = null;
    this.el       = null;
    this._timer   = null;
    this._mounted = false;
  }

  // ── Contract fetch ──────────────────────────────────────────────────────────
  async fetchContract() {
    try {
      const r = await fetch(`${this.base}/contract`, { signal: AbortSignal.timeout(3000) });
      if (!r.ok) throw new Error(`${r.status}`);
      this.contract = await r.json();
      return this.contract;
    } catch (e) {
      // Try via orchestrator proxy
      try {
        const r2 = await fetch(`${this.orch}/contract/${this.id}`, { signal: AbortSignal.timeout(3000) });
        if (r2.ok) { this.contract = await r2.json(); return this.contract; }
      } catch (_) {}
      return null;
    }
  }

  // ── Health check ────────────────────────────────────────────────────────────
  async fetchHealth() {
    const healthPath = this.contract?.health?.path || '/health';
    try {
      const r = await fetch(`${this.base}${healthPath}`, { signal: AbortSignal.timeout(2000) });
      return r.ok ? await r.json().catch(() => ({ ok: true })) : null;
    } catch (_) { return null; }
  }

  // ── Route fetch — only fetches routes the contract declares ─────────────────
  async fetchRoute(path, method = 'GET') {
    if (!this.contract) return null;
    const declared = (this.contract.routes || []).find(r => r.path === path && (r.method || 'GET') === method);
    if (!declared) {
      console.warn(`[${this.id}] route ${method} ${path} not in contract — refusing to call`);
      return null;
    }
    try {
      const r = await fetch(`${this.base}${path}`, { signal: AbortSignal.timeout(5000) });
      return r.ok ? await r.json().catch(() => null) : null;
    } catch (_) { return null; }
  }

  // ── Mount — fetch contract, render shell, start polling ─────────────────────
  async mount(el) {
    if (!el) return;
    this.el = el;
    this._mounted = true;

    // Show loading state immediately
    el.innerHTML = this._renderLoading();

    // Fetch contract
    const contract = await this.fetchContract();
    const health   = await this.fetchHealth();

    // Render from contract
    el.innerHTML = this._renderFromContract(contract, health);
    this.afterMount(el, contract, health);

    // Start polling for live data
    this._poll();
    this._timer = setInterval(() => this._poll(), this.pollInterval || 5000);
  }

  unmount() {
    this._mounted = false;
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  }

  async _poll() {
    if (!this._mounted || !this.el) return;
    const health = await this.fetchHealth();
    const live   = await this.fetchLive();
    this.updateLive(this.el, health, live);
  }

  // ── Override these in subclasses ────────────────────────────────────────────
  async fetchLive()                        { return {}; }
  afterMount(el, contract, health)         {}
  updateLive(el, health, live)             { this._updateStatusDot(el, health); }

  // ── Shared rendering helpers ────────────────────────────────────────────────
  _renderLoading() {
    return `<div style="padding:24px;font-family:'Space Mono',monospace;font-size:11px;color:rgba(255,255,255,.3)">
      Loading ${this.id} contract…
    </div>`;
  }

  _renderFromContract(contract, health) {
    if (!contract) {
      return `<div class="comp-error">
        <div class="comp-error-title">⚠ ${this.id}</div>
        <div class="comp-error-body">
          Contract unreachable at <code>${this.base}/contract</code>.<br>
          System may be offline or not yet started.
        </div>
        <div class="comp-meta">Port: ${this.port} · <a href="${this.base}/health" target="_blank">health check</a></div>
      </div>`;
    }

    const online = health?.ok !== false;
    const statusColor = online ? '#00e5ff' : '#ff4444';
    const routes = contract.routes || [];

    return `
      <div class="comp-header">
        <div class="comp-title">
          <span class="comp-status-dot" style="background:${statusColor}" data-status></span>
          <span class="comp-name">${contract.namespace || this.id}</span>
          <span class="comp-port">:${this.port}</span>
          <span class="comp-version">${contract.version || ''}</span>
        </div>
        <div class="comp-role">${contract.role || ''}</div>
      </div>

      <div class="comp-metrics" data-metrics></div>

      <div class="comp-routes">
        <div class="comp-section-head">Contract Routes (${routes.length})</div>
        ${routes.slice(0, 8).map(r => `
          <div class="comp-route">
            <span class="comp-route-method ${(r.method||'GET').toLowerCase()}">${r.method || 'GET'}</span>
            <span class="comp-route-path">${r.path}</span>
            <span class="comp-route-desc">${r.description || ''}</span>
          </div>
        `).join('')}
        ${routes.length > 8 ? `<div class="comp-route-more">+${routes.length - 8} more</div>` : ''}
      </div>

      <div class="comp-live" data-live></div>
    `;
  }

  _updateStatusDot(el, health) {
    const dot = el.querySelector('[data-status]');
    if (dot) dot.style.background = health?.ok !== false ? '#00e5ff' : '#ff4444';
  }

  _setMetrics(el, pairs) {
    const m = el.querySelector('[data-metrics]');
    if (!m) return;
    m.innerHTML = pairs.map(([val, lbl]) => `
      <div class="comp-metric">
        <div class="comp-metric-val">${val}</div>
        <div class="comp-metric-lbl">${lbl}</div>
      </div>
    `).join('');
  }

  _setLive(el, html) {
    const l = el.querySelector('[data-live]');
    if (l) l.innerHTML = html;
  }
}

// ── Component registry ────────────────────────────────────────────────────────
const NexusComponents = {};

function registerComponent(id, Class) {
  NexusComponents[id] = Class;
}

function mountComponent(id, port, el, ports) {
  const Class = NexusComponents[id] || SystemComponent;
  const comp  = new Class(id, port, ports);
  comp.mount(el);
  return comp;
}

// ── CSS for components ────────────────────────────────────────────────────────
(function injectComponentCSS() {
  if (document.getElementById('nexus-comp-css')) return;
  const style = document.createElement('style');
  style.id = 'nexus-comp-css';
  style.textContent = `
    .comp-error {
      padding: 24px; border: 1px solid rgba(255,68,68,.2); border-radius: 8px;
      margin: 16px; background: rgba(255,68,68,.03);
    }
    .comp-error-title { font-family:'Space Mono',monospace; font-size:12px; color:#ff6666; margin-bottom:8px; }
    .comp-error-body  { font-size:12px; color:rgba(255,255,255,.4); line-height:1.6; }
    .comp-error-body code { font-family:'Space Mono',monospace; font-size:10px; color:rgba(255,255,255,.25); }
    .comp-meta { font-family:'Space Mono',monospace; font-size:10px; color:rgba(255,255,255,.2); margin-top:12px; }
    .comp-meta a { color:rgba(0,229,255,.4); }

    .comp-header { padding: 16px 20px 12px; border-bottom: 1px solid rgba(255,255,255,.06); }
    .comp-title  { display:flex; align-items:center; gap:10px; margin-bottom:6px; }
    .comp-status-dot { width:7px; height:7px; border-radius:50%; flex-shrink:0; }
    .comp-name   { font-family:'Space Mono',monospace; font-size:13px; font-weight:700; color:#e0e8ff; letter-spacing:.06em; text-transform:uppercase; }
    .comp-port   { font-family:'Space Mono',monospace; font-size:10px; color:rgba(255,255,255,.25); }
    .comp-version{ font-family:'Space Mono',monospace; font-size:9px; color:rgba(255,255,255,.2); margin-left:auto; }
    .comp-role   { font-size:12px; color:rgba(255,255,255,.4); line-height:1.5; }

    .comp-metrics { display:flex; gap:24px; padding:14px 20px; border-bottom:1px solid rgba(255,255,255,.05); }
    .comp-metric-val { font-family:'Space Mono',monospace; font-size:20px; color:#00e5ff; }
    .comp-metric-lbl { font-family:'Space Mono',monospace; font-size:9px; color:rgba(255,255,255,.3); text-transform:uppercase; letter-spacing:.08em; margin-top:2px; }

    .comp-routes { padding:12px 20px; }
    .comp-section-head { font-family:'Space Mono',monospace; font-size:9px; color:rgba(255,255,255,.2); text-transform:uppercase; letter-spacing:.1em; margin-bottom:8px; }
    .comp-route  { display:flex; align-items:baseline; gap:8px; padding:4px 0; border-bottom:1px solid rgba(255,255,255,.03); }
    .comp-route-method { font-family:'Space Mono',monospace; font-size:9px; padding:1px 5px; border-radius:3px; flex-shrink:0; }
    .comp-route-method.get  { background:rgba(0,229,255,.1); color:#00e5ff; }
    .comp-route-method.post { background:rgba(255,170,0,.1); color:#ffaa00; }
    .comp-route-method.put  { background:rgba(130,100,255,.1); color:#8264ff; }
    .comp-route-method.delete { background:rgba(255,68,68,.1); color:#ff4444; }
    .comp-route-path { font-family:'Space Mono',monospace; font-size:10px; color:rgba(255,255,255,.6); flex-shrink:0; }
    .comp-route-desc { font-size:10px; color:rgba(255,255,255,.25); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .comp-route-more { font-size:10px; color:rgba(255,255,255,.2); padding-top:6px; font-style:italic; }

    .comp-live { padding:12px 20px; }
  `;
  document.head.appendChild(style);
})();
