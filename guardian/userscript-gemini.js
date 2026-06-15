// ==UserScript==
// @name         Guardian — Gemini v1.0
// @namespace    nexus.guardian.gemini
// @version      1.0.0
// @description  Guardian NCP bridge for Gemini. Same architecture as claude/chatgpt.
//               Injects prompts via DOM, reads responses, posts back to Guardian.
//               Strengths: vision, UI analysis, image understanding, multimodal, speed.
// @author       James Brooks / Nexus
// @match        https://gemini.google.com/*
// @match        https://aistudio.google.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      127.0.0.1
// @run-at       document-idle
// ==/UserScript==

(function () {
'use strict';

const NCP_URL    = 'http://127.0.0.1:7820';
const NCP_CH     = NCP_URL + '/channel';
const NCP_RESULT = NCP_URL + '/result';
const NCP_HB     = NCP_URL + '/heartbeat';
const PROVIDER   = 'gemini';
const VERSION    = '1.0.0';
const RECONNECT_MS = 3000;
const HB_MS        = 8000;

const MY_TAB = sessionStorage.getItem('gd_gemini_id') || (() => {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
  sessionStorage.setItem('gd_gemini_id', id); return id;
})();

let _es = null, _hb = null, _reconnectTimer = null;
let _busy = false, _currentJob = null;

// ── DOM selectors for Gemini ──────────────────────────────────────────────────
// Gemini's input is a rich text editor (contenteditable)
function _getInput() {
  return document.querySelector('div[contenteditable="true"][aria-label]') ||
         document.querySelector('.ql-editor') ||
         document.querySelector('[data-placeholder]');
}

function _getSendBtn() {
  return document.querySelector('button[aria-label*="Send"]') ||
         document.querySelector('button[aria-label*="send"]') ||
         document.querySelector('mat-icon[fonticon="send"]')?.closest('button');
}

function _getResponse() {
  // Gemini response container
  const msgs = document.querySelectorAll('.model-response-text, .response-content, [data-testid="response"]');
  if (msgs.length) return msgs[msgs.length - 1].innerText?.trim();
  // AI Studio
  const out = document.querySelector('ms-chunk, .output-content');
  if (out) return out.innerText?.trim();
  return null;
}

function _isGenerating() {
  return !!document.querySelector('.loading-indicator, .streaming-indicator, [aria-label*="Stop"]') ||
         !!document.querySelector('button[aria-label*="Stop generating"]');
}

// ── Inject + submit ────────────────────────────────────────────────────────────
async function _submit(text) {
  const inp = _getInput();
  if (!inp) throw new Error('Gemini input not found');

  inp.focus();
  // Set value via execCommand (works on contenteditable)
  document.execCommand('selectAll', false, null);
  document.execCommand('insertText', false, text);
  // Dispatch input events
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  inp.dispatchEvent(new Event('change', { bubbles: true }));

  await new Promise(r => setTimeout(r, 800));

  const btn = _getSendBtn();
  if (!btn || btn.disabled) throw new Error('Gemini send button not found or disabled');
  btn.click();
}

// ── Wait for response ─────────────────────────────────────────────────────────
async function _waitResponse(timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;
  // Wait for generation to start
  await new Promise(r => setTimeout(r, 2000));
  // Poll until generation stops
  while (Date.now() < deadline) {
    if (!_isGenerating()) {
      await new Promise(r => setTimeout(r, 1200));
      if (!_isGenerating()) {
        const text = _getResponse();
        if (text && text.length > 10) return text;
      }
    }
    await new Promise(r => setTimeout(r, 800));
  }
  throw new Error('Gemini response timeout');
}

// ── Post result back ──────────────────────────────────────────────────────────
function _postResult(jobId, result, error) {
  GM_xmlhttpRequest({
    method: 'POST', url: NCP_RESULT,
    headers: { 'Content-Type': 'application/json' },
    data: JSON.stringify({
      jobId, provider: PROVIDER, tabId: MY_TAB,
      result: result || null, error: error || null,
      ts: Date.now(),
    }),
    onerror: (e) => console.warn('[guardian-gemini] result post failed', e),
  });
}

// ── Process job ────────────────────────────────────────────────────────────────
async function _processJob(job) {
  if (_busy) { console.log('[guardian-gemini] busy, queueing'); return; }
  _busy = true; _currentJob = job;
  console.log('[guardian-gemini] processing job:', job.id?.slice(0,8));
  try {
    const prompt = job.prompt || job.text || '';
    await _submit(prompt);
    const result = await _waitResponse();
    _postResult(job.id, result, null);
    console.log('[guardian-gemini] job complete:', job.id?.slice(0,8), result.length + ' chars');
  } catch(e) {
    console.error('[guardian-gemini] job failed:', e.message);
    _postResult(job.id, null, e.message);
  } finally {
    _busy = false; _currentJob = null;
  }
}

// ── NCP SSE connection ────────────────────────────────────────────────────────
function _connect() {
  if (_es) { _es.close(); _es = null; }
  const url = `${NCP_CH}?provider=${PROVIDER}&tabId=${MY_TAB}&v=${VERSION}`;
  _es = new EventSource(url);

  _es.onopen = () => {
    console.log('[guardian-gemini] NCP connected');
    clearTimeout(_reconnectTimer);
  };

  _es.onmessage = (e) => {
    try {
      const job = JSON.parse(e.data);
      if (job.type === 'job' || job.command) _processJob(job);
    } catch(err) { console.warn('[guardian-gemini] parse error', err); }
  };

  _es.onerror = () => {
    _es.close(); _es = null;
    _reconnectTimer = setTimeout(_connect, RECONNECT_MS);
  };
}

// ── Heartbeat ─────────────────────────────────────────────────────────────────
function _startHB() {
  _hb = setInterval(() => {
    GM_xmlhttpRequest({
      method: 'POST', url: NCP_HB,
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({ provider: PROVIDER, tabId: MY_TAB, busy: _busy, ts: Date.now() }),
    });
  }, HB_MS);
}

// ── Widget ────────────────────────────────────────────────────────────────────
function _injectWidget() {
  const w = document.createElement('div');
  w.id = 'nexus-gd-widget';
  w.style.cssText = 'position:fixed;bottom:12px;right:12px;z-index:99999;background:#05080f;border:1px solid #00ff88;border-radius:4px;padding:6px 10px;font:10px monospace;color:#00ff88;user-select:none;cursor:pointer;opacity:0.85';
  w.textContent = '⬡ NEXUS › Gemini';
  w.title = `Guardian NCP — Gemini v${VERSION}\nTab: ${MY_TAB}`;
  w.onclick = () => w.style.opacity = w.style.opacity === '0.85' ? '0.3' : '0.85';
  document.body.appendChild(w);

  // Update widget with status
  setInterval(() => {
    const conn = _es && _es.readyState === 1;
    w.style.borderColor = conn ? (_busy ? '#ff6b35' : '#00ff88') : '#ff2d55';
    w.textContent = `⬡ NEXUS › Gemini ${conn ? (_busy ? '⟳' : '✓') : '✗'}`;
  }, 2000);
}

// ── Boot ──────────────────────────────────────────────────────────────────────
function _boot() {
  console.log(`[guardian-gemini] v${VERSION} booting — tab:${MY_TAB}`);
  _connect();
  _startHB();
  _injectWidget();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _boot);
else _boot();

})();
