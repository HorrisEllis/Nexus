'use strict';
// ui/home/areas/agent-suite.js — Agent suite channel + agent forge + stored-mode restore.
// Split from ui/home/index.html (inline script, lines 2238-2535 at v0.39.227). Load order is set by index.html; do not reorder.
function _injectAgentSuiteTab() {
  // Add agent suite to CH_META if not there
  const idx = CH_META.findIndex(c => c.id === 'ch-agent-suite');
  if (idx === -1) {
    CH_META.push({id:'ch-agent-suite', name:MODE_CONFIG[_activeMode].name, accent:'Agent Suite'});
    // Inject rail button
    const rail = document.getElementById('ch-rail');
    if (rail) {
      const btn = document.createElement('button');
      btn.className = 'ch-btn';
      btn.id = 'rail-suite';
      btn.innerHTML = `<span class="ch-dot" id="rd-suite" style="background:${MODE_CONFIG[_activeMode].color}"></span>${MODE_CONFIG[_activeMode].icon} ${MODE_CONFIG[_activeMode].name}`;
      btn.style.color = MODE_CONFIG[_activeMode].color;
      btn.onclick = () => tuneSuite();
      rail.insertBefore(btn, rail.children[1]);
    }
  }
}

function tuneSuite() {
  document.querySelectorAll('.ch').forEach(c => c.classList.remove('active'));
  document.getElementById('ch-agent-suite').classList.add('active');
  document.querySelectorAll('.ch-btn').forEach(b => b.classList.remove('on'));
  const sBtn = document.getElementById('rail-suite');
  if (sBtn) sBtn.classList.add('on');
  document.getElementById('ch-name').textContent = MODE_CONFIG[_activeMode]?.name || 'AGENT';
  document.getElementById('ch-accent').textContent = 'Agent Suite';
  document.getElementById('menu-label').textContent = MODE_CONFIG[_activeMode]?.name || 'AGENT';
  _refreshAgentSuite();
}

function tuneById(id) {
  const idx = CH_META.findIndex(c => c.id === id);
  if (idx === -1) { console.error(`tuneById: no channel with id "${id}"`); return; }
  tune(idx);
}

function goToActiveMode() {
  if (!_activeMode) { openModeSelector(); return; }
  const agentChannels = {
    chatgpt:     'ch-chatgpt-agent',
    claude:      'ch-claude-agent',
    mistral:     'ch-mistral-agent',
    gemini:      'ch-gemini-agent',
    perplexity:  'ch-perplexity-agent',
    mistral:      'ch-agent-suite',
  };
  const ch = agentChannels[_activeMode];
  if (ch) tuneById(ch);
  else tuneSuite();
}

function _bootAgentSuite(mode) {
  const cfg = MODE_CONFIG[mode];
  document.getElementById('as-name').textContent = cfg.name + ' SUITE';
  document.getElementById('as-sub').textContent = cfg.sub;
  // Token budget visibility
  const tb = document.getElementById('as-token-budget');
  if (tb) tb.style.display = cfg.tokenLimit ? 'block' : 'none';
  if (cfg.tokenLimit) {
    document.getElementById('tb-limit').textContent = cfg.tokenLimit >= 1000 ? Math.round(cfg.tokenLimit/1000)+'k' : cfg.tokenLimit;
  }
  // Constraint flags
  const flags = document.getElementById('as-constraint-flags');
  if (flags) {
    flags.querySelectorAll('.cflag').forEach(f => f.classList.remove('active'));
    cfg.constraints.forEach(c => {
      const f = flags.querySelector(`[data-c="${c.toLowerCase().replace(/[§ ]/g,'-').replace(/\./g,'')}"]`);
      if (f) f.classList.add('active');
    });
  }
  // SEAM/SNR toggles
  const seam = document.getElementById('as-seam-toggle');
  const snr = document.getElementById('as-snr-toggle');
  if (seam) seam.classList.toggle('active', cfg.seam);
  if (snr) snr.classList.toggle('active', cfg.snrDefault);
  // Structured-output toggle — only visible for modes that actually have the
  // capability (chatgpt today), not another flag shared identically by all three
  const structToggle = document.getElementById('as-structured-toggle');
  if (structToggle) {
    structToggle.style.display = cfg.structuredOutput ? '' : 'none';
    structToggle.classList.remove('active'); // off by default — changes response shape, shouldn't be silently on
  }
  // Phase dots
  const dots = document.getElementById('as-phase-dots');
  if (dots) dots.innerHTML = PHASE_SUMMARY.map(p =>
    `<div class="pdot ${p.status}" title="Phase ${p.n}"></div>`
  ).join('');
  goToActiveMode();
}

async function _refreshAgentSuite() {
  if (!_activeMode) return;
  const cfg = MODE_CONFIG[_activeMode];
  // Provider pill
  const provPill = document.getElementById('as-provider-pill');
  const provLbl = document.getElementById('as-provider-label');
  if (cfg.provider === 'ollama') {
    // Ollama has no orchestrator proxy either (like Bridge/Diagnostic) — it's
    // a local HTTP service, not one of orchestrator's SYS entries with a
    // dedicated /api/<name>/* block. Direct call, same flagged category.
    const ol = await get('http://127.0.0.1:11434/api/tags').catch(() => null);
    const alive = !!ol;
    if (provPill) provPill.className = 'agent-stat-pill ' + (alive ? 'live' : '');
    if (provLbl) provLbl.textContent = alive ? 'Ollama online' : 'Ollama offline';
  } else {
    const gd = await get(`${B.orch}/api/guardian/providers`).catch(() => null);
    const prov = gd?.providers || gd?.connected || {};
    const channels = gd?.channels || {};
    const connected = Object.keys(prov).some(k => k.startsWith(cfg.provider) && prov[k] === 'connected');
    if (provPill) provPill.className = 'agent-stat-pill ' + (connected ? 'live' : '');
    if (provLbl) provLbl.textContent = connected ? cfg.name + ' tab connected' : 'Open ' + cfg.name + ' tab + userscript';
    // Tab pill
    const tabPill = document.getElementById('as-tab-pill');
    const tabLbl = document.getElementById('as-tab-label');
    if (tabPill) tabPill.className = 'agent-stat-pill ' + (connected ? 'live' : '');
    if (tabLbl) tabLbl.textContent = connected ? 'NCP active' : 'NCP waiting';
    // Usage pill — real signal from the userscript's detectUsageLimit(), riding
    // the heartbeat through lib/ncp.js's client.usage. Lives in gd.channels
    // (per-provider detail), NOT gd.providers (just a connection-status string
    // map) — reading it off the wrong field meant this pill was always hidden.
    const usagePill = document.getElementById('as-usage-pill');
    const usageLbl = document.getElementById('as-usage-label');
    if (usagePill) {
      const usage = channels[cfg.provider]?.usage;
      if (!connected || !usage) {
        usagePill.style.display = 'none';
      } else {
        usagePill.style.display = '';
        if (usage.limited === true) {
          usagePill.className = 'agent-stat-pill';
          usagePill.style.borderColor = '#ff3355'; usagePill.style.color = '#ff3355';
          if (usageLbl) usageLbl.textContent = usage.resetHint ? `Limited — ${usage.resetHint}` : 'Limited';
        } else if (usage.limited === 'suspected') {
          usagePill.className = 'agent-stat-pill';
          usagePill.style.borderColor = '#ffaa00'; usagePill.style.color = '#ffaa00';
          if (usageLbl) usageLbl.textContent = 'Usage — unclear';
        } else {
          usagePill.className = 'agent-stat-pill live';
          usagePill.style.borderColor = ''; usagePill.style.color = '';
          if (usageLbl) usageLbl.textContent = 'Usage OK';
        }
      }
    }
  }
  // Jobs pill
  const jd = await get(`${B.orch}/api/guardian/jobs`).catch(() => null);
  const jobs = Array.isArray(jd) ? jd : (jd?.jobs || []);
  const pending = jobs.filter(j => j.status === 'queued' || j.status === 'pending').length;
  const jobPill = document.getElementById('as-jobs-pill');
  const jobLbl = document.getElementById('as-jobs-label');
  if (jobPill) jobPill.className = 'agent-stat-pill ' + (pending > 0 ? 'live' : '');
  if (jobLbl) jobLbl.textContent = jobs.length + ' jobs' + (pending ? ', ' + pending + ' pending' : '');
  // Gaps pill
  const gapD = await get(`${B.orch}/api/cortex/gaps?status=open`).catch(() => null);
  const gapCount = Array.isArray(gapD) ? gapD.length : (gapD?.gaps || []).length;
  const gapPill = document.getElementById('as-gaps-pill');
  const gapLbl = document.getElementById('as-gaps-label');
  if (gapPill) gapPill.className = 'agent-stat-pill ' + (gapCount > 0 ? '' : 'live');
  if (gapLbl) gapLbl.textContent = gapCount + ' open gaps';
  // SEAM queue — /seam/queues returns an array (q.toJSON() per active queue),
  // not an object keyed by id, and isn't provider-filtered server-side —
  // filter to this mode's provider here so Claude's view doesn't show
  // ChatGPT's chunks and vice versa.
  const sq = await get(`${B.orch}/api/guardian/seam/queues`).catch(() => null);
  const allQueues = Array.isArray(sq?.queues) ? sq.queues : [];
  const myQueues = allQueues.filter(q => q.provider === cfg.provider);
  const seam = document.getElementById('as-seam-rows');
  if (seam && myQueues.length === 0) {
    seam.innerHTML = '<div style="font-size:11px;color:rgba(255,255,255,.2)">No active chunks</div>';
  } else if (seam) {
    seam.innerHTML = myQueues.slice(0, 8).map(q => {
      const stats = q.stats || {};
      return `<div class="seam-row">
        <span class="seam-chunk-id">${(q.uuid||'').slice(0,12)}</span>
        <span class="seam-chunk-type">seam</span>
        <span class="seam-chunk-body">${(q.title || '').slice(0,60)}</span>
        <span class="seam-chunk-tokens">${stats.verified||0}/${stats.total||q.total||'?'}</span>
        <span class="seam-status-dot ${q.completedAt ? 'verified' : (stats.active ? 'generating' : 'queued')}"></span>
      </div>`;
    }).join('');
  }
  // Token budget
  if (cfg.tokenLimit) {
    const pct = Math.min(100, Math.round((_sessionTokens / cfg.tokenLimit) * 100));
    const fill = document.getElementById('tb-bar-fill');
    if (fill) {
      fill.style.width = pct + '%';
      fill.style.background = pct > 80 ? '#ff3355' : pct > 50 ? '#ffaa00' : cfg.color;
    }
    const usedEl = document.getElementById('tb-used');
    if (usedEl) usedEl.textContent = _sessionTokens >= 1000 ? Math.round(_sessionTokens/1000)+'k' : _sessionTokens;
    const chunksEl = document.getElementById('tb-chunks');
    if (chunksEl) chunksEl.textContent = _sessionChunks;
    const snrEl = document.getElementById('tb-snr');
    if (snrEl) {
      // /api/resilience/status doesn't exist server-side (see loadDiagCFR
      // above) — always resolves null, snrEl correctly falls back to '—'.
      const snrD = await get(`${B.orch}/api/cortex/resilience/status`).catch(() => null);
      const s = snrD?.sigma?.score ?? snrD?.sigma ?? null;
      snrEl.textContent = s !== null ? s.toFixed(3) : '—';
    }
  }
}

function toggleCtxChip(el) { el.classList.toggle('active'); }

async function agentForge() {
  if (!_activeMode) return;
  const cfg = MODE_CONFIG[_activeMode];
  const input = document.getElementById('as-forge-input');
  const prompt = input?.value?.trim();
  if (!prompt) return;
  const status = document.getElementById('as-forge-status');
  const btn = document.getElementById('as-forge-btn');
  if (btn) btn.disabled = true;
  if (status) status.textContent = 'Dispatching…';

  // Build constraint prefix
  const activeFlags = [...document.querySelectorAll('#as-constraint-flags .cflag.active')]
    .map(f => f.textContent.trim()).join(' · ');
  const activeCtx = [...document.querySelectorAll('#as-ctx-chips .ctx-chip.active')]
    .map(c => c.dataset.comp).join(', ');
  const useSeam = document.getElementById('as-seam-toggle')?.classList.contains('active');
  const useSnr = document.getElementById('as-snr-toggle')?.classList.contains('active');
  const useStructured = cfg.structuredOutput && document.getElementById('as-structured-toggle')?.classList.contains('active');

  const fullPrompt = [
    activeFlags ? `[CONSTRAINTS: ${activeFlags}]` : '',
    activeCtx ? `[CONTEXT COMPONENTS: ${activeCtx}]` : '',
    useSnr ? '[SNR FILTER: ON — surface invariants first, LLM last]' : '',
    useStructured ? '[OUTPUT FORMAT: respond with a single valid JSON object only — no prose, no markdown fencing, no commentary before or after]' : '',
    '',
    prompt,
  ].filter(Boolean).join('\n');

  try {
    if (useSeam && cfg.seam && cfg.chunkSize) {
      // §SEAM-GLUE-FIX: this used to call _chunkPrompt() (a local paragraph
      // splitter) and fire each chunk as an independent /command 'forge' job
      // — no real verification, no retry, no persisted session, and
      // seam_chunk/seam_total were decorative metadata on plain jobs, not
      // real SEAMQueue dispatch. Routes through the real pipeline now —
      // same one the userscript SEAM tab submits to. splitOn:'size' because
      // an arbitrary prompt typed here won't have the formal `# heading`
      // structure a real .spec file has; parseSpec() degrades to plain
      // size-based chunking when there's nothing to split on semantically.
      const d = await post(`${B.orch}/api/guardian/dispatch`, {
        command: 'spec',
        provider: cfg.provider,
        specText: fullPrompt,
        splitOn: 'size',
        maxChunkSize: cfg.chunkSize,
        title: prompt.slice(0, 60),
      });
      if (d?.ok) {
        _sessionChunks += (d.total || 1);
        if (status) status.textContent = `✓ SEAM queue ${d.queueId?.slice(0,8)} — ${d.total} chunks`;
      } else {
        if (status) status.textContent = `✗ SEAM dispatch failed: ${d?.error || 'unknown error'}`;
      }
    } else {
      const d = await post(`${B.orch}/api/guardian/dispatch`, {
        provider: cfg.provider,
        command: 'forge',
        prompt: fullPrompt,
        meta: { source: 'agent-suite', mode: _activeMode, ts: Date.now() }
      });
      if (status) status.textContent = d?.jobId ? `✓ Job ${d.jobId.slice(0,10)} dispatched` : '✗ Dispatch failed';
      if (d?.tokens) _sessionTokens += d.tokens;
    }
    if (input) input.value = '';
    setTimeout(_refreshAgentSuite, 1000);
  } catch(e) {
    if (status) status.textContent = '✗ Guardian offline';
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ── Boot: check stored mode ───────────────────────────────────────────
(function initMode() {
  // Add mode indicator to menu button
  const menuBtn = document.getElementById('menu-btn');
  if (menuBtn) {
    const ind = document.createElement('span');
    ind.id = 'mode-indicator';
    ind.style.display = 'none';
    menuBtn.appendChild(ind);
  }
  // Restore stored mode silently — stay on overview, don't open overlay
  const stored = localStorage.getItem('nexus_mode');
  if (stored && MODE_CONFIG[stored]) {
    selectMode(stored, false); // false = don't navigate to suite
  }
})();


