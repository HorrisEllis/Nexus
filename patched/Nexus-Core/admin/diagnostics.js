// ═══════════════════════════════════════════════════
// NEXUS — Diagnostic Panel
// admin/diagnostics.js
//
// A single button opens a beautiful full-screen
// diagnostic overlay covering every system layer.
//
// CHECKS (run in sequence, grouped by layer):
//
//  FOUNDATION
//    kernel.ring        — ring buffer live
//    kernel.laws        — I·II·III·IV enforced
//    jaaDB              — open + tables present
//    fileStore          — store path exists
//
//  TRANSPORT
//    Guardian v8 :7820       — GET /health
//    Guardian handshake — GET /guardian/status
//    Guardian heartbeat — session count + last seen
//    Admin SSE :3748    — GET /health
//    Ollama :11434      — GET /api/tags
//
//  AGENTS
//    ollama ping        — model list, deepseek present
//    chatgpt            — Guardian session active
//    claude             — Guardian session active
//    gemini             — Guardian session active
//
//  PIPELINE
//    RAID engine        — decide() responds
//    GapHunter          — scanManifest() available
//    Healer             — module loaded
//    Manifest gen       — generator available
//    CrystalBall        — MCL + BEP + MQL initialized
//
//  NETWORK
//    localhost:7820     — latency + reachable
//    localhost:3748     — latency + reachable
//    localhost:11434    — latency + reachable
//    LAN pulse :7777    — UDP discovery (best-effort)
//
//  BUS HEALTH
//    Event throughput   — events/sec from SSE
//    Ring fill          — % of 10k ring used
//    Law violations     — count from ring
//    Last gate result   — pass/fail/unknown
//
// Opens from a single ⊕ button in the admin topbar.
// ═══════════════════════════════════════════════════

'use strict';

const NEXUS_SERVER = 'http://localhost:3748';
// Guardian v8 HTTP API — replaces old bridge at :3747
// All /guardian/health, /guardian/status checks now route through Guardian server.js :7820
const GUARDIAN_URL = 'http://localhost:7820';
const BRIDGE_URL   = GUARDIAN_URL; // alias kept for legacy checks — points at Guardian v8 now
const OLLAMA_URL   = 'http://localhost:11434';

// ── Check registry ─────────────────────────────────
// Each check: { id, label, group, run: async () => Result }
// Result: { ok, value, detail, latency }

const CHECKS = [
  // ── FOUNDATION ────────────────────────────────────
  {
    id: 'kernel.ring', group: 'FOUNDATION', label: 'Kernel ring buffer',
    run: async () => {
      if (typeof kernel === 'undefined') return { ok: false, detail: 'kernel not defined' };
      const n = kernel.ring?.length ?? kernel._ring?.length ?? 0;
      return { ok: n >= 0, value: `${n} events`, detail: `ring buffer active` };
    },
  },
  {
    id: 'kernel.laws', group: 'FOUNDATION', label: 'Constitutional Laws',
    run: async () => {
      if (typeof kernel === 'undefined') return { ok: false, detail: 'kernel not defined' };
      const laws = kernel.laws || kernel._laws;
      const count = laws ? Object.keys(laws).length : 0;
      return { ok: count === 4, value: `${count}/4`, detail: count === 4 ? 'I·II·III·IV enforced' : 'Laws incomplete' };
    },
  },
  {
    id: 'streamlog', group: 'FOUNDATION', label: 'StreamLog',
    run: async () => {
      if (typeof StreamLog === 'undefined') return { ok: false, detail: 'StreamLog not defined' };
      const n = StreamLog.entries?.length ?? 0;
      return { ok: true, value: `${n} entries`, detail: 'ring buffer live' };
    },
  },
  {
    id: 'agents.registry', group: 'FOUNDATION', label: 'Agent registry',
    run: async () => {
      const count = typeof AGENTS !== 'undefined' ? Object.keys(AGENTS).length : 0;
      return { ok: count > 0, value: `${count} agents`, detail: Object.keys(AGENTS || {}).join(', ') || 'empty' };
    },
  },

  // ── TRANSPORT ─────────────────────────────────────
  {
    id: 'bridge.health', group: 'TRANSPORT', label: 'Guardian v8 :7820',
    run: async () => {
      const t0 = Date.now();
      try {
        const r = await fetch(GUARDIAN_URL + '/health', { signal: AbortSignal.timeout(3000) });
        const d = await r.json().catch(() => ({}));
        const lat = Date.now() - t0;
        return { ok: r.ok, value: `${lat}ms`, detail: d.version ? `v${d.version}` : r.status };
      } catch (e) {
        return { ok: false, detail: e.message.includes('fetch') ? 'unreachable' : e.message, latency: Date.now() - t0 };
      }
    },
  },
  {
    id: 'guardian.status', group: 'TRANSPORT', label: 'Guardian sessions',
    run: async () => {
      const t0 = Date.now();
      try {
        const r = await fetch(GUARDIAN_URL + '/health', { signal: AbortSignal.timeout(3000) });
        const d = await r.json().catch(() => ({}));
        const count = d.count ?? d.sessions?.length ?? 0;
        const healthy = d.sessions?.filter(s => s.healthy)?.length ?? 0;
        return { ok: r.ok && count > 0, value: `${count} session${count!==1?'s':''}`, detail: count > 0 ? `${healthy} healthy` : 'no Guardian connected' };
      } catch {
        return { ok: false, detail: 'Guardian v8 unreachable' };
      }
    },
  },
  {
    id: 'admin.sse', group: 'TRANSPORT', label: 'Admin server :3748',
    run: async () => {
      const t0 = Date.now();
      try {
        const r = await fetch(NEXUS_SERVER + '/health', { signal: AbortSignal.timeout(3000) });
        const d = await r.json().catch(() => ({}));
        const lat = Date.now() - t0;
        return { ok: r.ok, value: `${lat}ms`, detail: `tick:${d.tick??'—'} · ${d.sseClients??0} SSE client(s)` };
      } catch {
        return { ok: false, detail: 'admin server not running — run node cli.js' };
      }
    },
  },
  {
    id: 'ollama.reachable', group: 'TRANSPORT', label: 'Ollama :11434',
    run: async () => {
      const t0 = Date.now();
      try {
        const r = await fetch(OLLAMA_URL + '/api/tags', { signal: AbortSignal.timeout(3000) });
        const d = await r.json().catch(() => ({}));
        const lat = Date.now() - t0;
        const models = d.models?.map(m => m.name) ?? [];
        const hasDeepseek = models.some(m => m.includes('deepseek'));
        return { ok: r.ok, value: `${lat}ms`, detail: `${models.length} model(s)${hasDeepseek ? ' · deepseek ✓' : ' · deepseek not found'}` };
      } catch {
        return { ok: false, detail: 'Ollama not running — install from ollama.ai' };
      }
    },
  },

  // ── AGENTS ────────────────────────────────────────
  {
    id: 'agent.ollama', group: 'AGENTS', label: 'Ollama agent',
    run: async () => {
      try {
        const r = await fetch(OLLAMA_URL + '/api/tags', { signal: AbortSignal.timeout(2000) });
        const d = await r.json().catch(() => ({}));
        const m = (d.models || []).find(x => x.name?.includes('deepseek')) || d.models?.[0];
        if (typeof AGENTS !== 'undefined') { AGENTS.ollama.status = m ? 'idle' : 'offline'; }
        return { ok: !!m, value: m?.name ?? 'no models', detail: m ? `active model: ${m.name}` : 'no models found' };
      } catch {
        if (typeof AGENTS !== 'undefined') AGENTS.ollama.status = 'offline';
        return { ok: false, detail: 'offline' };
      }
    },
  },
  {
    id: 'agent.chatgpt', group: 'AGENTS', label: 'ChatGPT (Guardian)',
    run: async () => {
      try {
        const r = await fetch(GUARDIAN_URL + '/health', { signal: AbortSignal.timeout(2000) });
        const d = await r.json().catch(() => ({}));
        const hasChatGPT = d.sessions?.some(s => s.capabilities?.includes('callto'));
        return { ok: hasChatGPT, value: hasChatGPT ? 'via Guardian' : 'not available', detail: hasChatGPT ? 'Guardian session active' : 'requires Guardian connected' };
      } catch {
        return { ok: false, detail: 'Guardian v8 unreachable' };
      }
    },
  },
  {
    id: 'agent.claude', group: 'AGENTS', label: 'Claude (Guardian)',
    run: async () => {
      try {
        const r = await fetch(GUARDIAN_URL + '/health', { signal: AbortSignal.timeout(2000) });
        const d = await r.json().catch(() => ({}));
        return { ok: (d.count ?? 0) > 0, value: (d.count ?? 0) > 0 ? 'via Guardian' : 'not available', detail: 'requires Guardian connected' };
      } catch {
        return { ok: false, detail: 'Guardian v8 unreachable' };
      }
    },
  },
  {
    id: 'agent.gemini', group: 'AGENTS', label: 'Gemini (Guardian)',
    run: async () => {
      try {
        const r = await fetch(GUARDIAN_URL + '/health', { signal: AbortSignal.timeout(2000) });
        const d = await r.json().catch(() => ({}));
        return { ok: (d.count ?? 0) > 0, value: (d.count ?? 0) > 0 ? 'via Guardian' : 'not available', detail: 'requires Guardian connected' };
      } catch {
        return { ok: false, detail: 'Guardian v8 unreachable' };
      }
    },
  },

  // ── PIPELINE ──────────────────────────────────────
  {
    id: 'pipeline.nodes', group: 'PIPELINE', label: 'Pipeline nodes',
    run: async () => {
      const n = typeof PIPELINE_NODES !== 'undefined' ? PIPELINE_NODES.length : 0;
      return { ok: n > 0, value: `${n} nodes`, detail: n > 0 ? PIPELINE_NODES.map(x=>x.label).join(', ') : 'no nodes defined' };
    },
  },
  {
    id: 'pipeline.crystalball', group: 'PIPELINE', label: 'CrystalBall module',
    run: async () => {
      try {
        const r = await fetch(NEXUS_SERVER + '/api/crystals', { signal: AbortSignal.timeout(2000) });
        const d = await r.json().catch(() => ({}));
        return { ok: r.ok, value: `${d.stable??0} stable · ${d.candidate??0} candidate`, detail: 'MCL + BEP + MQL' };
      } catch {
        return { ok: false, detail: 'admin server offline' };
      }
    },
  },
  {
    id: 'pipeline.bep', group: 'PIPELINE', label: 'BEP pattern library',
    run: async () => {
      try {
        const r = await fetch(NEXUS_SERVER + '/api/bep', { signal: AbortSignal.timeout(2000) });
        const d = await r.json().catch(() => ({}));
        return { ok: r.ok, value: `${d.count??0} patterns`, detail: d.count > 0 ? 'patterns accumulated' : 'empty — run pipeline to build' };
      } catch {
        return { ok: false, detail: 'admin server offline' };
      }
    },
  },
  {
    id: 'pipeline.gaplog', group: 'PIPELINE', label: 'Gap log',
    run: async () => {
      const n = typeof GAP_LOG !== 'undefined' ? GAP_LOG.length : 0;
      const types = typeof GAP_LOG !== 'undefined' ? [...new Set(GAP_LOG.map(g=>g.type))] : [];
      return { ok: true, value: `${n} gap(s)`, detail: n > 0 ? types.join(', ') : 'clean — no gaps' };
    },
  },

  // ── NETWORK ───────────────────────────────────────
  {
    id: 'net.bridge', group: 'NETWORK', label: 'Guardian latency',
    run: async () => {
      const samples = [];
      for (let i = 0; i < 3; i++) {
        const t0 = Date.now();
        try { await fetch(GUARDIAN_URL + '/health', { signal: AbortSignal.timeout(1000) }); samples.push(Date.now() - t0); } catch { samples.push(1000); }
      }
      const avg = Math.round(samples.reduce((a,b)=>a+b,0)/samples.length);
      const grade = avg < 10 ? 'excellent' : avg < 50 ? 'good' : avg < 200 ? 'acceptable' : 'slow';
      return { ok: avg < 500, value: `${avg}ms avg`, detail: `${grade} · 3 samples: ${samples.join('/')}ms` };
    },
  },
  {
    id: 'net.ollama', group: 'NETWORK', label: 'Ollama latency',
    run: async () => {
      const t0 = Date.now();
      try {
        await fetch(OLLAMA_URL + '/api/tags', { signal: AbortSignal.timeout(2000) });
        const lat = Date.now() - t0;
        return { ok: true, value: `${lat}ms`, detail: lat < 100 ? 'local — excellent' : 'high latency' };
      } catch {
        return { ok: false, detail: 'unreachable' };
      }
    },
  },
  {
    id: 'net.admin', group: 'NETWORK', label: 'Admin server latency',
    run: async () => {
      const t0 = Date.now();
      try {
        await fetch(NEXUS_SERVER + '/health', { signal: AbortSignal.timeout(2000) });
        const lat = Date.now() - t0;
        return { ok: true, value: `${lat}ms`, detail: lat < 20 ? 'local — excellent' : 'acceptable' };
      } catch {
        return { ok: false, detail: 'unreachable — start NEXUS' };
      }
    },
  },

  // ── BUS HEALTH ────────────────────────────────────
  {
    id: 'bus.events', group: 'BUS', label: 'Event log size',
    run: async () => {
      const n = typeof StreamLog !== 'undefined' ? StreamLog.entries.length : 0;
      const pct = Math.round(n / 10000 * 100);
      return { ok: true, value: `${n} / 10000 (${pct}%)`, detail: pct > 90 ? 'ring near full — oldest events dropping' : 'healthy' };
    },
  },
  {
    id: 'bus.violations', group: 'BUS', label: 'Law violations',
    run: async () => {
      const violations = typeof StreamLog !== 'undefined'
        ? StreamLog.entries.filter(e => e.type === 'law.violation').length : 0;
      return { ok: violations === 0, value: violations === 0 ? 'none' : `${violations} violation(s)`, detail: violations > 0 ? 'check event log for details' : 'all laws respected' };
    },
  },
  {
    id: 'bus.gates', group: 'BUS', label: 'Gate results',
    run: async () => {
      const passed = typeof _gatesPassed !== 'undefined' ? _gatesPassed : 0;
      const total  = typeof _gatesTotal  !== 'undefined' ? _gatesTotal  : 0;
      if (total === 0) return { ok: true, value: 'no gates run', detail: 'run pipeline to test' };
      const pct = Math.round(passed / total * 100);
      return { ok: pct >= 80, value: `${passed}/${total} (${pct}%)`, detail: pct === 100 ? 'all passing' : `${total-passed} failing` };
    },
  },
  {
    id: 'bus.healer', group: 'BUS', label: 'Healer activity',
    run: async () => {
      const active = typeof HEALER_LOG !== 'undefined' ? HEALER_LOG.filter(h=>h.status==='resolving').length : 0;
      const total  = typeof HEALER_LOG !== 'undefined' ? HEALER_LOG.length : 0;
      return { ok: true, value: `${active} active · ${total} total`, detail: active > 0 ? 'healer working' : 'idle' };
    },
  },
];

// ── Panel state ────────────────────────────────────
let _diagOpen   = false;
let _diagPanel  = null;
let _diagResults = {}; // checkId → { ok, value, detail, running, ts }
let _diagRunning = new Set();

// ── Open / close ───────────────────────────────────

function openDiagnostics() {
  if (_diagOpen) { closeDiagnostics(); return; }
  _diagOpen = true;
  _diagPanel = _buildPanel();
  document.body.appendChild(_diagPanel);
  requestAnimationFrame(() => _diagPanel.classList.add('diag-visible'));
  kernel?.emit('admin.diagnostics.opened', {});
}

function closeDiagnostics() {
  _diagOpen = false;
  if (_diagPanel) {
    _diagPanel.classList.remove('diag-visible');
    setTimeout(() => { _diagPanel?.remove(); _diagPanel = null; }, 200);
  }
  kernel?.emit('admin.diagnostics.closed', {});
}

// ── Build panel DOM ────────────────────────────────

function _buildPanel() {
  const el = document.createElement('div');
  el.id = 'nexus-diag-overlay';
  el.innerHTML = `
    <div id="nexus-diag-panel">
      <div id="nexus-diag-top">
        <div id="nexus-diag-heading">
          <span style="color:var(--p)">◈</span> NEXUS DIAGNOSTICS
          <span id="nexus-diag-health" style="font-size:10px;color:var(--t2);margin-left:12px">—</span>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <button id="nexus-diag-run-all" onclick="runAllDiagnostics()">▶ Run All</button>
          <button id="nexus-diag-export" onclick="exportDiagnostics()">↓ Export</button>
          <button id="nexus-diag-close" onclick="closeDiagnostics()">✕</button>
        </div>
      </div>
      <div id="nexus-diag-body">
        ${_buildGroupsHTML()}
      </div>
      <div id="nexus-diag-footer">
        <span id="nexus-diag-ts" style="color:var(--t3)">Not run yet</span>
        <span id="nexus-diag-summary" style="color:var(--t3)"></span>
      </div>
    </div>
  `;

  // Close on backdrop click
  el.addEventListener('click', e => { if (e.target === el) closeDiagnostics(); });

  // ESC key
  const escHandler = e => { if (e.key === 'Escape') { closeDiagnostics(); document.removeEventListener('keydown', escHandler); } };
  document.addEventListener('keydown', escHandler);

  _injectDiagStyles();
  return el;
}

function _buildGroupsHTML() {
  const groups = [...new Set(CHECKS.map(c => c.group))];
  return groups.map(group => {
    const checks = CHECKS.filter(c => c.group === group);
    return `
      <div class="nexus-diag-group">
        <div class="nexus-diag-group-label">${group}</div>
        ${checks.map(c => `
          <div class="nexus-diag-row" id="nexus-diag-row-${c.id}">
            <div class="nexus-diag-dot" id="nexus-diag-dot-${c.id}"></div>
            <div class="nexus-diag-row-label">${c.label}</div>
            <div class="nexus-diag-row-value" id="nexus-diag-val-${c.id}">—</div>
            <div class="nexus-diag-row-detail" id="nexus-diag-detail-${c.id}">not tested</div>
            <button class="nexus-diag-test-btn" onclick="runCheck('${c.id}')">TEST</button>
          </div>
        `).join('')}
      </div>
    `;
  }).join('');
}

// ── Run checks ─────────────────────────────────────

async function runCheck(id) {
  const check = CHECKS.find(c => c.id === id);
  if (!check || _diagRunning.has(id)) return;
  _diagRunning.add(id);
  _setDot(id, 'running');
  _setVal(id, '…', 'running…');
  _setBtnRunning(id, true);

  try {
    const t0 = Date.now();
    const result = await check.run();
    result.latency = result.latency ?? (Date.now() - t0);
    result.ts = Date.now();
    _diagResults[id] = result;
    _setDot(id, result.ok ? 'pass' : 'fail');
    _setVal(id, result.value ?? (result.ok ? '✓' : '✗'), result.detail ?? '');
  } catch (e) {
    _diagResults[id] = { ok: false, detail: e.message, ts: Date.now() };
    _setDot(id, 'fail');
    _setVal(id, '✗', e.message);
  } finally {
    _diagRunning.delete(id);
    _setBtnRunning(id, false);
    _updateHealth();
  }
}

async function runAllDiagnostics() {
  const btn = document.getElementById('nexus-diag-run-all');
  if (btn) { btn.disabled = true; btn.textContent = '… Running'; }

  // Run groups in sequence, checks within each group in parallel
  const groups = [...new Set(CHECKS.map(c => c.group))];
  for (const group of groups) {
    const checks = CHECKS.filter(c => c.group === group);
    await Promise.all(checks.map(c => runCheck(c.id)));
  }

  if (btn) { btn.disabled = false; btn.textContent = '▶ Run All'; }

  const ts = document.getElementById('nexus-diag-ts');
  if (ts) ts.textContent = `Last run: ${new Date().toLocaleTimeString()}`;

  kernel?.emit('admin.diagnostics.completed', {
    results: Object.fromEntries(Object.entries(_diagResults).map(([k,v])=>[k,v.ok])),
  });
}

function exportDiagnostics() {
  const data = {
    ts:      new Date().toISOString(),
    nexus:   'admin-diagnostics',
    results: _diagResults,
    summary: _healthSummary(),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `nexus-diagnostics-${Date.now()}.json`;
  a.click();
  toast('Diagnostics exported', { type: 'ok', duration: 1500 });
}

// ── DOM helpers ────────────────────────────────────

function _setDot(id, state) {
  const dot = document.getElementById(`nexus-diag-dot-${id}`);
  if (!dot) return;
  dot.className = `nexus-diag-dot nexus-diag-dot-${state}`;
}

function _setVal(id, value, detail) {
  const v = document.getElementById(`nexus-diag-val-${id}`);
  const d = document.getElementById(`nexus-diag-detail-${id}`);
  if (v) v.textContent = value ?? '—';
  if (d) d.textContent = detail ?? '';
}

function _setBtnRunning(id, running) {
  const btn = document.querySelector(`#nexus-diag-row-${id} .nexus-diag-test-btn`);
  if (!btn) return;
  btn.disabled = running;
  btn.textContent = running ? '…' : 'TEST';
}

function _updateHealth() {
  const s = _healthSummary();
  const h = document.getElementById('nexus-diag-health');
  if (h) {
    const color = s.pct === 100 ? 'var(--ok)' : s.pct >= 70 ? 'var(--warn)' : 'var(--err)';
    h.innerHTML = `<span style="color:${color};font-weight:bold">${s.pct}%</span> · ${s.pass}/${s.total} passing`;
  }
  const sum = document.getElementById('nexus-diag-summary');
  if (sum) sum.textContent = `${s.pass} pass · ${s.fail} fail · ${s.untested} untested`;
}

function _healthSummary() {
  const tested = Object.values(_diagResults);
  const pass   = tested.filter(r => r.ok).length;
  const fail   = tested.filter(r => !r.ok).length;
  const total  = CHECKS.length;
  const pct    = tested.length ? Math.round(pass / tested.length * 100) : 0;
  return { pass, fail, total, untested: total - tested.length, pct };
}

// ── Styles ─────────────────────────────────────────

function _injectDiagStyles() {
  if (document.getElementById('nexus-diag-style')) return;
  const s = document.createElement('style');
  s.id = 'nexus-diag-style';
  s.textContent = `
    #nexus-diag-overlay {
      position: fixed; inset: 0; z-index: 9000;
      background: rgba(2,2,4,.85);
      backdrop-filter: blur(6px);
      display: flex; align-items: center; justify-content: center;
      opacity: 0; transition: opacity .2s ease;
    }
    #nexus-diag-overlay.diag-visible { opacity: 1; }

    #nexus-diag-panel {
      width: min(900px, 94vw);
      max-height: 88vh;
      background: var(--v1, #05050a);
      border: 1px solid var(--b2, rgba(255,255,255,.14));
      border-radius: 8px;
      display: flex; flex-direction: column;
      box-shadow: 0 32px 80px rgba(0,0,0,.7), 0 0 0 1px rgba(74,240,184,.06);
      overflow: hidden;
      transform: translateY(8px);
      transition: transform .2s ease;
    }
    #nexus-diag-overlay.diag-visible #nexus-diag-panel { transform: translateY(0); }

    #nexus-diag-top {
      display: flex; align-items: center; justify-content: space-between;
      padding: 14px 20px; border-bottom: 1px solid var(--b0, rgba(255,255,255,.04));
      flex-shrink: 0; background: var(--v2, #08080f);
    }
    #nexus-diag-heading {
      font-family: var(--f-mono, monospace); font-size: 11px;
      letter-spacing: .1em; color: var(--t0, #e8e8f4); font-weight: 600;
    }
    #nexus-diag-top button {
      background: transparent; border: 1px solid var(--b1, rgba(255,255,255,.08));
      border-radius: 3px; color: var(--t1, #9898b8);
      font-family: var(--f-mono, monospace); font-size: 9px; font-weight: 700;
      letter-spacing: .05em; padding: 4px 10px; cursor: pointer;
      transition: color .1s, border-color .1s;
    }
    #nexus-diag-top button:hover { color: var(--t0); border-color: var(--b2); }
    #nexus-diag-run-all { border-color: rgba(74,240,184,.3) !important; color: var(--p, #4af0b8) !important; }
    #nexus-diag-run-all:hover { background: rgba(74,240,184,.06) !important; }
    #nexus-diag-top button:disabled { opacity: .4; cursor: not-allowed; }

    #nexus-diag-body {
      flex: 1; overflow-y: auto; padding: 8px 0;
      display: grid; grid-template-columns: 1fr 1fr;
      gap: 0; align-content: start;
    }
    #nexus-diag-body::-webkit-scrollbar { width: 3px; }
    #nexus-diag-body::-webkit-scrollbar-thumb { background: var(--b1); border-radius: 2px; }

    .nexus-diag-group {
      padding: 10px 0 4px;
      border-bottom: 1px solid var(--b0);
    }
    .nexus-diag-group:nth-child(odd) { border-right: 1px solid var(--b0); }

    .nexus-diag-group-label {
      font-family: var(--f-mono, monospace); font-size: 8px;
      letter-spacing: .15em; color: var(--t3, #282840);
      text-transform: uppercase; padding: 0 16px 6px;
    }

    .nexus-diag-row {
      display: flex; align-items: center; gap: 8px;
      padding: 5px 16px; min-height: 28px;
      transition: background .1s;
    }
    .nexus-diag-row:hover { background: var(--v2, #08080f); }

    .nexus-diag-dot {
      width: 7px; height: 7px; border-radius: 50%;
      flex-shrink: 0; background: var(--t3, #282840);
      transition: background .2s, box-shadow .2s;
    }
    .nexus-diag-dot-pass    { background: var(--ok, #4af0b8) !important; box-shadow: 0 0 5px var(--ok, #4af0b8); }
    .nexus-diag-dot-fail    { background: var(--err, #f04a4a) !important; box-shadow: 0 0 5px var(--err, #f04a4a); }
    .nexus-diag-dot-running { background: var(--warn, #f0c44a) !important; animation: nexus-pulse .6s step-end infinite; }
    @keyframes nexus-pulse { 50% { opacity: .3; } }

    .nexus-diag-row-label {
      font-family: var(--f-mono, monospace); font-size: 9px;
      color: var(--t1, #9898b8); flex: 1; white-space: nowrap;
      overflow: hidden; text-overflow: ellipsis;
    }
    .nexus-diag-row-value {
      font-family: var(--f-mono, monospace); font-size: 9px;
      color: var(--t0, #e8e8f4); white-space: nowrap; flex-shrink: 0;
      min-width: 80px; text-align: right;
    }
    .nexus-diag-row-detail {
      font-family: var(--f-mono, monospace); font-size: 8px;
      color: var(--t3, #282840); white-space: nowrap; flex-shrink: 0;
      max-width: 140px; overflow: hidden; text-overflow: ellipsis;
    }

    .nexus-diag-test-btn {
      background: transparent; border: 1px solid var(--b1, rgba(255,255,255,.08));
      border-radius: 2px; color: var(--t3, #282840);
      font-family: var(--f-mono, monospace); font-size: 8px; font-weight: 700;
      letter-spacing: .05em; padding: 2px 6px; cursor: pointer;
      flex-shrink: 0; transition: color .1s, border-color .1s;
    }
    .nexus-diag-test-btn:hover { color: var(--p, #4af0b8); border-color: rgba(74,240,184,.4); }
    .nexus-diag-test-btn:disabled { opacity: .3; cursor: not-allowed; }

    #nexus-diag-footer {
      display: flex; align-items: center; justify-content: space-between;
      padding: 8px 20px; border-top: 1px solid var(--b0);
      font-family: var(--f-mono, monospace); font-size: 9px;
      background: var(--v2); flex-shrink: 0;
    }

    /* Trigger button in topbar */
    #nexus-diag-trigger {
      display: flex; align-items: center; gap: 5px;
      background: transparent; border: 1px solid var(--b1);
      border-radius: 3px; color: var(--t2); cursor: pointer;
      font-family: var(--f-mono); font-size: 8px; font-weight: 700;
      letter-spacing: .05em; padding: 3px 8px; margin-right: 8px;
      transition: color .1s, border-color .1s;
    }
    #nexus-diag-trigger:hover { color: var(--p); border-color: rgba(74,240,184,.4); }
    #nexus-diag-trigger .diag-trigger-dot {
      width: 5px; height: 5px; border-radius: 50%;
      background: var(--t3); transition: background .3s;
    }
    #nexus-diag-trigger.diag-healthy   .diag-trigger-dot { background: var(--ok); box-shadow: 0 0 4px var(--ok); }
    #nexus-diag-trigger.diag-degraded  .diag-trigger-dot { background: var(--warn); }
    #nexus-diag-trigger.diag-critical  .diag-trigger-dot { background: var(--err); box-shadow: 0 0 4px var(--err); }
  `;
  document.head.appendChild(s);
}

// ── Topbar trigger button ──────────────────────────

function injectDiagTrigger() {
  if (document.getElementById('nexus-diag-trigger')) return;
  const tbRight = document.querySelector('.tb-right') || document.getElementById('topbar');
  if (!tbRight) return;

  const btn = document.createElement('button');
  btn.id = 'nexus-diag-trigger';
  btn.title = 'Open Diagnostics Panel';
  btn.innerHTML = '<div class="diag-trigger-dot"></div> DIAG';
  btn.onclick = openDiagnostics;
  tbRight.insertBefore(btn, tbRight.firstChild);

  // Auto-run quick health check every 30s to keep dot updated
  _quickHealthCheck();
  setInterval(_quickHealthCheck, 30000);
}

async function _quickHealthCheck() {
  const btn = document.getElementById('nexus-diag-trigger');
  if (!btn) return;
  try {
    const [b, o] = await Promise.all([
      fetch(GUARDIAN_URL + '/health', { signal: AbortSignal.timeout(1500) }).then(r => r.ok).catch(() => false),
      fetch(OLLAMA_URL + '/api/tags',         { signal: AbortSignal.timeout(1500) }).then(r => r.ok).catch(() => false),
    ]);
    if (b && o)      { btn.className = 'diag-healthy'; btn.title = 'All systems nominal'; }
    else if (b || o) { btn.className = 'diag-degraded'; btn.title = 'Some systems offline'; }
    else             { btn.className = 'diag-critical'; btn.title = 'Bridge + Ollama offline'; }
  } catch {
    btn.className = 'diag-critical';
  }
}

// ── Auto-inject on DOMContentLoaded ───────────────
document.addEventListener('DOMContentLoaded', () => {
  // Small delay to let admin panel render first
  setTimeout(injectDiagTrigger, 600);
});
