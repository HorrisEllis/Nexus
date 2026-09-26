// ==UserScript==
// @name         Guardian — Ollama Stream v1.0
// @namespace    nexus.guardian.ollama
// @version      1.0.0
// @description  Continuous Ollama inference stream via Tampermonkey.
//               Bridges Guardian NCP → Ollama → Guardian /stream in real time.
//               Tokens arrive one by one. No waiting for full response.
//               GM_xmlhttpRequest bypasses CORS — works from any tab.
//               Install once, runs forever. No AI website needed.
// @author       James Brooks / Nexus
// @match        *://*/*
// @exclude      https://claude.ai/*
// @exclude      https://chatgpt.com/*
// @exclude      https://gemini.google.com/*
// @exclude      https://www.perplexity.ai/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// ==/UserScript==

(function () {
'use strict';

// ── Constants ─────────────────────────────────────────────────────────────────
const GUARDIAN_URL  = 'http://127.0.0.1:7820';
const OLLAMA_URL    = 'http://127.0.0.1:11434';
const NCP_CH        = GUARDIAN_URL + '/channel';
const NCP_STREAM    = GUARDIAN_URL + '/stream';
const NCP_RESULT    = GUARDIAN_URL + '/result';
const NCP_HB        = GUARDIAN_URL + '/heartbeat';
const PROVIDER      = 'ollama-ncp';
const VERSION       = '1.0.0';
const RECONNECT_MS  = 3000;
const HB_MS         = 8000;

// Model cascade — same as forge.js OLLAMA_SEAM_MODELS
// qwen2.5-coder:1.5b for code/SEAM chunks (~1GB VRAM, fast)
// mistral:7b-instruct-q4_K_M for general (~4GB VRAM)
const MODELS = {
  code:     'qwen2.5-coder:1.5b',
  seam:     'qwen2.5-coder:1.5b',
  general:  'mistral:7b-instruct-q4_K_M',
  analysis: 'mistral:7b-instruct-q4_K_M',
  default:  'qwen2.5-coder:1.5b',
};

function _pickModel(command) {
  return MODELS[command] || MODELS.default;
}

// ── Tab identity ──────────────────────────────────────────────────────────────
const MY_TAB = (function() {
  let id = GM_getValue('ollama_ncp_tab_id', null);
  if (!id) { id = Date.now().toString(36) + Math.random().toString(36).slice(2); GM_setValue('ollama_ncp_tab_id', id); }
  return id;
})();

// ── State ─────────────────────────────────────────────────────────────────────
let _es           = null;
let _hb           = null;
let _reconnectT   = null;
let _busy         = false;
let _currentJob   = null;
let _activeStream = null;  // current GM_xmlhttpRequest streaming handle
let _tokenCount   = 0;
let _ollamaOnline = false;

// ── Ollama health check ───────────────────────────────────────────────────────
function _checkOllama(cb) {
  GM_xmlhttpRequest({
    method: 'GET',
    url:    OLLAMA_URL + '/api/tags',
    timeout: 2000,
    onload: (r) => {
      try {
        const d = JSON.parse(r.responseText);
        const models = (d.models || []).map(m => m.name || m.model).filter(Boolean);
        _ollamaOnline = models.length > 0;
        cb(_ollamaOnline, models);
      } catch(_) { _ollamaOnline = false; cb(false, []); }
    },
    onerror:   () => { _ollamaOnline = false; cb(false, []); },
    ontimeout: () => { _ollamaOnline = false; cb(false, []); },
  });
}

// ── Core: streaming Ollama inference ─────────────────────────────────────────
// This is the heart of it. GM_xmlhttpRequest onprogress fires on every chunk.
// Each chunk is a JSON line from Ollama's streaming API.
// We forward each token immediately — continuous pipe, not request/response.
function _streamOllama(job, model) {
  const jobId  = job.id || job.jobId;
  const prompt = job.prompt || job.text || '';
  const system = job.systemPrompt || job.system || null;

  _tokenCount = 0;
  let _seenLen = 0;  // track how many chars of responseText we've already parsed

  const body = JSON.stringify({
    model,
    prompt,
    ...(system ? { system } : {}),
    stream:  true,
    options: {
      num_predict: job.maxTokens || 2048,
      temperature: job.temperature != null ? job.temperature : 0.3,
      // Token efficiency: stop on common end markers
      stop: ['```\n\n', '\n\n\n\n', '</s>'],
    },
  });

  _activeStream = GM_xmlhttpRequest({
    method:  'POST',
    url:     OLLAMA_URL + '/api/generate',
    headers: { 'Content-Type': 'application/json' },
    data:    body,
    timeout: 120000,

    // ── onprogress: fires on EVERY token chunk ────────────────────────────────
    // This is the continuous stream. Not waiting. Each token forwarded immediately.
    onprogress: (r) => {
      const raw  = r.responseText || '';
      const newChunk = raw.slice(_seenLen);
      _seenLen = raw.length;

      // Parse each newline-delimited JSON from Ollama
      const lines = newChunk.split('\n').filter(l => l.trim());
      for (const line of lines) {
        try {
          const chunk = JSON.parse(line);
          if (chunk.response) {
            _tokenCount++;
            // Stream each token to Guardian immediately
            _postTokenChunk(jobId, chunk.response, false, _tokenCount);
            _updateWidget(`⟳ ${_tokenCount} tokens — ${model.split(':')[0]}`);
          }
          if (chunk.done) {
            // Stream complete
            _postTokenChunk(jobId, '', true, _tokenCount);
            _onStreamComplete(jobId, model);
          }
        } catch(_) {}
      }
    },

    onload: (r) => {
      // Final parse in case onprogress missed the last chunk
      if (!_busy) return;
      const lines = (r.responseText || '').split('\n').filter(l => l.trim());
      const last  = lines[lines.length - 1];
      try {
        const chunk = JSON.parse(last);
        if (chunk.done && _busy) {
          _postTokenChunk(jobId, '', true, _tokenCount);
          _onStreamComplete(jobId, model);
        }
      } catch(_) {
        // Ensure we always complete
        _postTokenChunk(jobId, '', true, _tokenCount);
        _onStreamComplete(jobId, model);
      }
    },

    onerror: (r) => {
      console.error('[ollama-ncp] stream error:', r.status, r.statusText);
      _postError(jobId, `Ollama stream error: ${r.status} ${r.statusText}`);
      _onStreamComplete(jobId, model, true);
    },

    ontimeout: () => {
      console.error('[ollama-ncp] stream timeout');
      _postError(jobId, 'Ollama stream timeout after 120s');
      _onStreamComplete(jobId, model, true);
    },
  });
}

// ── Post a single token chunk to Guardian ─────────────────────────────────────
function _postTokenChunk(jobId, token, done, seq) {
  GM_xmlhttpRequest({
    method: 'POST',
    url:    NCP_STREAM + '/' + jobId,
    headers: { 'Content-Type': 'application/json' },
    data: JSON.stringify({
      jobId, provider: PROVIDER, tabId: MY_TAB,
      token,    // the token text (empty string on done)
      done,     // true = stream complete
      seq,      // token sequence number
      ts: Date.now(),
    }),
  });
}

// ── Post error ────────────────────────────────────────────────────────────────
function _postError(jobId, error) {
  GM_xmlhttpRequest({
    method: 'POST',
    url:    NCP_RESULT,
    headers: { 'Content-Type': 'application/json' },
    data: JSON.stringify({
      jobId, provider: PROVIDER, tabId: MY_TAB,
      result: null, error, ts: Date.now(),
    }),
  });
}

// ── Stream complete ────────────────────────────────────────────────────────────
function _onStreamComplete(jobId, model, errored) {
  console.log(`[ollama-ncp] job ${jobId?.slice(0,8)} complete — ${_tokenCount} tokens via ${model}`);
  _busy         = false;
  _currentJob   = null;
  _activeStream = null;
  _tokenCount   = 0;
  _updateWidget(`✓ ${PROVIDER} ready`);
}

// ── Process incoming job ───────────────────────────────────────────────────────
function _processJob(job) {
  if (_busy) {
    console.log('[ollama-ncp] busy — queuing job:', job.id?.slice(0,8));
    // Re-queue after 2s
    setTimeout(() => _processJob(job), 2000);
    return;
  }

  if (!_ollamaOnline) {
    _postError(job.id, 'Ollama offline — ollama-ncp cannot serve this job');
    return;
  }

  _busy       = true;
  _currentJob = job;
  const model = _pickModel(job.command || 'default');
  console.log(`[ollama-ncp] streaming job ${job.id?.slice(0,8)} → ${model}`);
  _updateWidget(`⟳ starting — ${model.split(':')[0]}`);
  _streamOllama(job, model);
}

// ── Abort current stream ──────────────────────────────────────────────────────
function _abort() {
  if (_activeStream && typeof _activeStream.abort === 'function') {
    _activeStream.abort();
    _activeStream = null;
  }
  _busy       = false;
  _currentJob = null;
}

// ── NCP SSE connection ────────────────────────────────────────────────────────
function _connect() {
  if (_es) { try { _es.close(); } catch(_) {} _es = null; }
  clearTimeout(_reconnectT);

  const url = `${NCP_CH}?provider=${PROVIDER}&tabId=${MY_TAB}&v=${VERSION}&stream=true`;
  _es = new EventSource(url);

  _es.onopen = () => {
    console.log('[ollama-ncp] NCP connected — continuous stream mode');
    _updateWidget('✓ connected');
    _checkOllama((ok, models) => {
      _updateWidget(ok ? `✓ ollama ${models[0]||'?'}` : '✗ ollama offline');
    });
  };

  _es.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === 'job' || msg.command || msg.prompt) {
        _processJob(msg);
      } else if (msg.type === 'abort' && _currentJob?.id === msg.jobId) {
        _abort();
      } else if (msg.type === 'ping') {
        // Keepalive — do nothing
      }
    } catch(err) {
      console.warn('[ollama-ncp] parse error:', err.message);
    }
  };

  _es.onerror = () => {
    _es.close(); _es = null;
    _updateWidget('✗ reconnecting…');
    _reconnectT = setTimeout(_connect, RECONNECT_MS);
  };
}

// ── Heartbeat ─────────────────────────────────────────────────────────────────
function _startHB() {
  if (_hb) clearInterval(_hb);
  _hb = setInterval(() => {
    GM_xmlhttpRequest({
      method: 'POST',
      url:    NCP_HB,
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({
        provider:     PROVIDER,
        tabId:        MY_TAB,
        busy:         _busy,
        tokenCount:   _tokenCount,
        ollamaOnline: _ollamaOnline,
        currentJob:   _currentJob?.id || null,
        ts:           Date.now(),
      }),
    });
    // Refresh Ollama status every heartbeat
    _checkOllama((ok) => { _ollamaOnline = ok; });
  }, HB_MS);
}

// ── Widget ────────────────────────────────────────────────────────────────────
let _widget = null;
function _injectWidget() {
  _widget = document.createElement('div');
  _widget.id = 'nexus-ollama-widget';
  _widget.style.cssText = [
    'position:fixed', 'bottom:12px', 'left:12px', 'z-index:99999',
    'background:#05080f', 'border:1px solid #00d4ff', 'border-radius:4px',
    'padding:6px 10px', 'font:10px monospace', 'color:#00d4ff',
    'user-select:none', 'cursor:pointer', 'opacity:0.85',
    'min-width:180px', 'transition:opacity .2s',
  ].join(';');
  _widget.textContent = '⬡ NEXUS › Ollama Stream';
  _widget.title = `Guardian Ollama NCP — v${VERSION}\nTab: ${MY_TAB}\nContinuous stream mode`;

  // Click to toggle collapse
  _widget.onclick = () => {
    _widget.style.opacity = _widget.style.opacity === '0.85' ? '0.2' : '0.85';
  };

  // Token stream indicator bar
  const _bar = document.createElement('div');
  _bar.id = 'nexus-ollama-bar';
  _bar.style.cssText = 'height:2px;background:#00d4ff;width:0%;margin-top:4px;transition:width .1s;border-radius:1px';
  _widget.appendChild(_bar);

  document.body.appendChild(_widget);
}

function _updateWidget(msg) {
  if (!_widget) return;
  const conn  = _es && _es.readyState === 1;
  const color = !conn ? '#ff2d55' : _busy ? '#ff6b35' : '#00d4ff';
  _widget.style.borderColor = color;
  _widget.style.color       = color;
  // Update text node (first text node, before the bar)
  const txt = _widget.childNodes[0];
  if (txt && txt.nodeType === 3) txt.nodeValue = `⬡ NEXUS › ${msg}`;

  // Animate bar while streaming
  const bar = document.getElementById('nexus-ollama-bar');
  if (bar) {
    if (_busy) {
      bar.style.background = color;
      // Pulse width based on token count
      bar.style.width = Math.min(95, (_tokenCount % 50) * 2) + '%';
    } else {
      bar.style.width = '0%';
    }
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────────
(function _boot() {
  // Only inject widget and connect once per page
  if (document.getElementById('nexus-ollama-widget')) return;

  console.log(`[ollama-ncp] v${VERSION} booting — tab:${MY_TAB} — continuous stream mode`);
  console.log(`[ollama-ncp] models: code=${MODELS.code} general=${MODELS.general}`);

  _injectWidget();
  _checkOllama((ok, models) => {
    console.log(`[ollama-ncp] ollama: ${ok ? 'online — ' + models.join(', ') : 'OFFLINE'}`);
    _connect();
    _startHB();
  });
})();

})();
