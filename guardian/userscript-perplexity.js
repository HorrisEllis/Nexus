// ==UserScript==
// @name         Guardian — Perplexity v1.0
// @namespace    nexus.guardian.perplexity
// @version      1.0.0
// @description  Guardian NCP bridge for Perplexity. Drives perplexity.ai via DOM.
//               Strengths: real-world grounded facts, citations, web search, research.
//               Uses NCP SSE — no API keys, no external calls. Browser tab only.
// @author       James Brooks / Nexus
// @match        https://www.perplexity.ai/*
// @match        https://perplexity.ai/*
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
const PROVIDER   = 'perplexity';
const VERSION    = '1.0.0';
const RECONNECT_MS = 3000;
const HB_MS        = 8000;

const MY_TAB = sessionStorage.getItem('gd_perp_id') || (() => {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
  sessionStorage.setItem('gd_perp_id', id); return id;
})();

let _es = null, _hb = null, _reconnectTimer = null;
let _busy = false, _currentJob = null;

// ── DOM selectors for Perplexity ──────────────────────────────────────────────
function _getInput() {
  return document.querySelector('textarea[placeholder]') ||
         document.querySelector('div[contenteditable="true"]') ||
         document.querySelector('#ask-input') ||
         document.querySelector('[data-testid="ask-input"]');
}

function _getSendBtn() {
  return document.querySelector('button[aria-label*="Submit"]') ||
         document.querySelector('button[aria-label*="Ask"]') ||
         document.querySelector('button[type="submit"]') ||
         document.querySelector('[data-testid="submit-button"]');
}

function _getResponse() {
  // Perplexity response — last answer block
  const answers = document.querySelectorAll(
    '.prose, [data-testid="answer"], .answer-text, .result__content'
  );
  if (answers.length) return answers[answers.length - 1].innerText?.trim();
  return null;
}

function _getCitations() {
  // Extract citation URLs from Perplexity's sources panel
  const links = document.querySelectorAll(
    '.source-link, [data-testid="source"] a, .citation a'
  );
  return [...links].map(a => a.href).filter(Boolean).slice(0, 10);
}

function _isGenerating() {
  return !!document.querySelector(
    '.loading-dots, .streaming, [data-testid="stop-button"], .stop-generating'
  );
}

// ── Inject + submit ────────────────────────────────────────────────────────────
async function _submit(text) {
  const inp = _getInput();
  if (!inp) throw new Error('Perplexity input not found');

  inp.focus();
  if (inp.tagName === 'TEXTAREA') {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype, 'value'
    )?.set;
    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(inp, text);
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      inp.value = text;
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    }
  } else {
    // contenteditable
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, text);
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  }

  await new Promise(r => setTimeout(r, 600));

  const btn = _getSendBtn();
  if (!btn || btn.disabled) {
    // Try Enter key
    inp.dispatchEvent(new KeyboardEvent('keydown', { key:'Enter', keyCode:13, bubbles:true }));
    return;
  }
  btn.click();
}

// ── Wait for response ─────────────────────────────────────────────────────────
async function _waitResponse(timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;
  await new Promise(r => setTimeout(r, 2500)); // wait for generation to start

  while (Date.now() < deadline) {
    if (!_isGenerating()) {
      await new Promise(r => setTimeout(r, 1500));
      if (!_isGenerating()) {
        const text = _getResponse();
        if (text && text.length > 20) {
          const citations = _getCitations();
          return { text, citations };
        }
      }
    }
    await new Promise(r => setTimeout(r, 800));
  }
  throw new Error('Perplexity response timeout');
}

// ── Post result back ──────────────────────────────────────────────────────────
function _postResult(jobId, result, error) {
  const payload = {
    jobId, provider: PROVIDER, tabId: MY_TAB,
    result:    result?.text || null,
    citations: result?.citations || [],
    error:     error || null,
    ts:        Date.now(),
  };
  GM_xmlhttpRequest({
    method: 'POST', url: NCP_RESULT,
    headers: { 'Content-Type': 'application/json' },
    data: JSON.stringify(payload),
    onerror: (e) => console.warn('[guardian-perplexity] result post failed', e),
  });
}

// ── Process job ────────────────────────────────────────────────────────────────
async function _processJob(job) {
  if (_busy) { console.log('[guardian-perplexity] busy'); return; }
  _busy = true; _currentJob = job;
  console.log('[guardian-perplexity] processing:', job.id?.slice(0,8));
  try {
    const prompt = job.prompt || job.text || '';
    await _submit(prompt);
    const result = await _waitResponse();
    _postResult(job.id, result, null);
    console.log('[guardian-perplexity] complete:', job.id?.slice(0,8),
      result.text.length + ' chars', result.citations.length + ' citations');
  } catch(e) {
    console.error('[guardian-perplexity] failed:', e.message);
    _postResult(job.id, null, e.message);
  } finally {
    _busy = false; _currentJob = null;
  }
}

// ── NCP SSE connection ────────────────────────────────────────────────────────
function _connect() {
  if (_es) { _es.close(); _es = null; }
  _es = new EventSource(`${NCP_CH}?provider=${PROVIDER}&tabId=${MY_TAB}&v=${VERSION}`);
  _es.onopen = () => { console.log('[guardian-perplexity] NCP connected'); clearTimeout(_reconnectTimer); };
  _es.onmessage = (e) => {
    try {
      const job = JSON.parse(e.data);
      if (job.type === 'job' || job.command) _processJob(job);
    } catch(err) { console.warn('[guardian-perplexity] parse error', err); }
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
  w.style.cssText = 'position:fixed;bottom:12px;right:12px;z-index:99999;background:#05080f;border:1px solid #818cf8;border-radius:4px;padding:6px 10px;font:10px monospace;color:#818cf8;user-select:none;cursor:pointer;opacity:0.85';
  w.textContent = '⬡ NEXUS › Perplexity';
  w.onclick = () => w.style.opacity = w.style.opacity === '0.85' ? '0.3' : '0.85';
  document.body.appendChild(w);
  setInterval(() => {
    const conn = _es && _es.readyState === 1;
    w.style.borderColor = conn ? (_busy ? '#ff6b35' : '#818cf8') : '#ff2d55';
    w.textContent = `⬡ NEXUS › Perplexity ${conn ? (_busy ? '⟳' : '✓') : '✗'}`;
  }, 2000);
}

// ── Boot ──────────────────────────────────────────────────────────────────────
function _boot() {
  console.log(`[guardian-perplexity] v${VERSION} booting — tab:${MY_TAB}`);
  _connect();
  _startHB();
  _injectWidget();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _boot);
else _boot();

})();
