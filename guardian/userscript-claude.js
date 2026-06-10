// ==UserScript==
// @name         Guardian — Claude v9.0
// @namespace    nexus.guardian.claude
// @version      9.0.0
// @description  Guardian v9.0: lean pill, full bus wiring, auto-error detection,
//               retry, usage tracking, SEAM delivery, all heavy ops delegated to CLI.
// @author       James Brooks / Nexus
// @match        https://claude.ai/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      *
// @run-at       document-idle
// ==/UserScript==

(function () {
'use strict';

// ── §5.1 Constants — all ports canonical ─────────────────────────────────────
// NCP — NEXUS Channel Protocol (replaces WebSocket)
// Plain HTTP — no TLS, no ws package, no port 7821
const NCP_URL    = 'http://127.0.0.1:7820';
const NCP_CHANNEL = `${NCP_URL}/channel`;
const NCP_RESULT  = `${NCP_URL}/result`;
const NCP_HB      = `${NCP_URL}/heartbeat`;
// Keep WS_URL alias so any remaining code that reads it gets a useful value
const WS_URL     = NCP_CHANNEL;
const API_URL    = 'http://127.0.0.1:7820';
const ORCH_URL   = 'http://127.0.0.1:9000';
const GUARDIAN_NCP = 'http://127.0.0.1:7820';  // NCP — direct guardian channel
const CORTEX_URL = 'http://127.0.0.1:3748';
const PROVIDER   = 'claude';
const VERSION    = '9.0.0';
const RECONNECT_MS = 3000;
const HB_MS        = 8000;
const LOG_MAX      = 300;

// ── State ────────────────────────────────────────────────────────────────────
let _es = null, hb = null, reconnectTimer = null;
let connState = 'disconnected';
let currentJobId = null, jobActive = false;
let panelOpen = false, activeTab = 'log';
let isClaimed = false;
let sessionStart = Date.now(), sessionTokens = 0, sessionJobs = 0;
let logEntries = [], unreadCount = 0;
let currentGaps = [], artifactStore = [], seenHashes = new Set();
let accountState = null;

// ── Tab claim ─────────────────────────────────────────────────────────────────
const TAB_KEY = 'guardian_claimed_tab_claude';
const MY_TAB  = sessionStorage.getItem('gd_tab_id') || (() => {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
  sessionStorage.setItem('gd_tab_id', id); return id;
})();
function amIClaimed() { return localStorage.getItem(TAB_KEY) === MY_TAB; }
function claimTab()   { localStorage.setItem(TAB_KEY, MY_TAB); isClaimed = true; updatePill(); }
function releaseTab() { if (amIClaimed()) localStorage.removeItem(TAB_KEY); isClaimed = false; updatePill(); }
function autoClaimIfFree() {
  const ex = localStorage.getItem(TAB_KEY);
  if (!ex) { claimTab(); return; }
  // Check if holder tab is still alive via heartbeat key
  const hbKey = 'gd_hb_' + ex;
  const last  = parseInt(localStorage.getItem(hbKey)||'0');
  if (Date.now() - last > 15000) { localStorage.removeItem(TAB_KEY); claimTab(); }
}
// Heartbeat to prove this tab is alive
setInterval(() => localStorage.setItem('gd_hb_' + MY_TAB, Date.now()), 5000);

// ── Utils ─────────────────────────────────────────────────────────────────────
function uid()       { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
function fts(ts)     { return new Date(ts).toTimeString().slice(0,8); }
function escHtml(s)  { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function estimateTokens(s) { return Math.max(1, Math.round((s||'').length / 4)); }
function simpleHash(s) { let h=0; for (let i=0;i<s.length;i++){h=((h<<5)-h)+s.charCodeAt(i);h|=0;} return Math.abs(h).toString(16).slice(0,8); }
function chatId()    { const m=location.pathname.match(/\/chat\/([a-zA-Z0-9_-]+)/); return m?m[1]:'home'; }
function getAccount() {
  if (accountState) return accountState;
  const sels = ['[data-testid="user-email"]','[data-testid="account-email"]','[aria-label*="@"]','nav [title*="@"]'];
  for (const sel of sels) {
    const el = document.querySelector(sel);
    if (el) { const t=(el.getAttribute('aria-label')||el.getAttribute('title')||el.textContent||'').trim(); if(t.includes('@')||t.length>3){accountState=t.slice(0,60);return accountState;} }
  }
  return location.hostname;
}
function detectLang(el) {
  const c = el.tagName==='CODE'?el:el.querySelector('code');
  if (c) { const cl=Array.from(c.classList).find(x=>x.startsWith('language-')); if(cl) return cl.replace('language-',''); }
  return null;
}

// ── §1.2 Gate — every significant operation gated + logged ────────────────────
async function gate(name, fn, opts = {}) {
  const { jobId = null, silent = false } = opts;
  const t0 = Date.now();
  try {
    const result = await fn();
    _log('ok', `✓ ${name}`, `${Date.now()-t0}ms`);
    _toOrc('repl', `gate.${name}.ok`, { ms: Date.now()-t0 });
    return { ok: true, result };
  } catch (e) {
    const msg = `${name}: ${e.message}`;
    _log('err', `§1.2 GATE FAIL: ${name}`, e.message);
    toast(msg, 'error', 4000);
    _toOrc('guardian', `gate.${name}.failed`, { error: e.message, ms: Date.now()-t0 });
    if (jobId) send({ type:'GUARDIAN_ERROR', jobId, gate:name, error:msg, chatUrl:location.href, account:getAccount() });
    if (!silent) _toCortex(`guardian.gate.failed`, { gate:name, error:e.message });
    return { ok: false, error: msg };
  }
}

// ── §5.2 Bus connections — send to all systems ───────────────────────────────
function _toOrc(system, type, payload = {}) {
  try {
    fetch(`${ORCH_URL}/api/ledger`, { method:'POST', headers:{'Content-Type':'application/json'}, keepalive:true,
      body: JSON.stringify({ system, type, payload }) }).catch(()=>{});
  } catch(_) {}
}
function _toBridge(type, payload = {}) {
  try {
    fetch(`${GUARDIAN_NCP}/result`, { method:'POST', headers:{'Content-Type':'application/json'}, keepalive:true,
      body: JSON.stringify({ type, ...payload, ts:Date.now() }) }).catch(()=>{});
  } catch(_) {}
}
// ── Cortex channel — direct writes from userscript to cortex JAA ────────────
// These bypass the guardian relay so cortex gets data even when guardian is slow.
// POST /api/event uses the WELL_KNOWN router to write the correct table.
function _toCortex(type, payload = {}) {
  try {
    fetch(`${CORTEX_URL}/api/event`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
      body: JSON.stringify({
        type, payload: { ...payload, _account: getAccount(), _chatUrl: location.href },
        source: 'userscript-claude', causedBy: currentJobId || null, ts: Date.now(),
      }),
    }).catch(() => {});
  } catch(_) {}
}

// Streaming: batch chunks before hitting cortex — flush at ≥400 chars, every 5th chunk, or sentence end
let _streamBuf = '', _streamCnt = 0;
function _streamToCortex(jobId, delta, full) {
  _streamBuf += delta;
  _streamCnt++;
  const flush = _streamBuf.length >= 400 || _streamCnt % 5 === 0 || /[.!?\n]$/.test(delta);
  if (!flush) return;
  const batch = _streamBuf; const cnt = _streamCnt;
  _streamBuf = '';
  try {
    fetch(`${CORTEX_URL}/api/event`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
      body: JSON.stringify({
        type: 'guardian.job.stream',
        payload: {
          jobId, provider: PROVIDER, text: batch.slice(0, 2000), chars: batch.length,
          chunkIndex: cnt, fullLen: full ? full.length : 0,
          chatUrl: location.href, account: getAccount(),
        },
        source: 'userscript-claude-stream', causedBy: jobId, ts: Date.now(),
      }),
    }).catch(() => {});
  } catch(_) {}
}

// Job start → agent_calls table
function _jobStartToCortex(jobId, command, prompt) {
  _toCortex('agent.call.start', {
    jobId, provider: PROVIDER, command,
    promptLen: (prompt || '').length,
    chatUrl: location.href, account: getAccount(), startedAt: Date.now(),
  });
}

// Full completion → cortex_memory + agent_messages (via WELL_KNOWN router)
function _completeToCortex(jobId, text, ms, usage) {
  try {
    fetch(`${CORTEX_URL}/api/event`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
      body: JSON.stringify({
        type: 'guardian.job.complete',
        payload: {
          jobId, provider: PROVIDER, chars: text.length,
          response: text.slice(0, 8000), durationMs: ms,
          chatUrl: location.href, account: getAccount(),
          completedAt: Date.now(), tokens: usage ? usage.tokens : 0,
        },
        source: 'userscript-claude', causedBy: jobId, ts: Date.now(),
      }),
    }).catch(() => {});
  } catch(_) {}
  // Reset stream buffer on completion
  _streamBuf = ''; _streamCnt = 0;
}

// Gaps → cortex gaps table (via WELL_KNOWN router)
function _gapsToCortex(jobId, gapList) {
  for (const g of (gapList || [])) {
    _toCortex('cortex.gap.found', {
      jobId, provider: PROVIDER,
      type: g.type, domain: g.domain, reason: g.reason,
      description: g.reason || g.description || '',
      score: g.score, source: 'userscript-gaphunter',
    });
  }
}
function send(obj) {
  // NCP: all outbound messages go via fetch() POST /result
  ncpPost(NCP_RESULT, obj).catch(() => {});
}
function sendLedger(category, msg, meta={}) {
  send({ type:'GUARDIAN_LEDGER_EVENT', level:category, category, msg, meta, chatUrl:location.href, account:getAccount(), requestId:currentJobId });
  _toOrc('guardian', `guardian.ledger.${category.toLowerCase()}`, { msg, meta });
}

// ── §2.3 Event log — all state observable ────────────────────────────────────
function _log(type, msg, detail) {
  const TYPES = { info:{c:'#94a3b8',i:'·'}, in:{c:'#60a5fa',i:'↓'}, out:{c:'#a78bfa',i:'↑'}, ok:{c:'#34d399',i:'✓'},
    err:{c:'#f87171',i:'✗'}, job:{c:'#fbbf24',i:'⚡'}, gap:{c:'#f472b6',i:'△'}, sys:{c:'#818cf8',i:'◈'}, use:{c:'#2dd4bf',i:'~'} };
  const t = TYPES[type] || TYPES.info;
  const entry = { ts:Date.now(), type, msg, detail:detail||null, color:t.c, icon:t.i };
  logEntries.push(entry);
  if (logEntries.length > LOG_MAX) logEntries.shift();
  if (panelOpen && activeTab==='log') _appendLogRow(entry);
  else if (type !== 'hb') { unreadCount++; _setBadge(unreadCount); }
  // Phase 3: sync significant events to server event-ledger (§LAW II)
  if (type === 'err' || type === 'gap' || type === 'job' || type === 'ok') {
    try {
      fetch(NCP_RESULT, { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ type:'GUARDIAN_EVENT', event:entry,
          provider:'claude', chatUrl:location.href, account:getAccount() }),
        keepalive:true }).catch(function(){});
    } catch(e) {}
  }
}

// ── Toast ─────────────────────────────────────────────────────────────────────
let _toastTimer = null;
function toast(msg, type='info', dur=3000) {
  let el = document.getElementById('__g9toast__');
  if (!el) {
    el = document.createElement('div'); el.id='__g9toast__';
    Object.assign(el.style, { position:'fixed',bottom:'72px',right:'20px',zIndex:'2147483648',
      maxWidth:'340px',padding:'8px 13px',borderRadius:'6px',fontFamily:"'SF Mono','Fira Code',monospace",
      fontSize:'11px',fontWeight:'500',lineHeight:'1.4',pointerEvents:'none',transition:'opacity .2s,transform .2s',
      opacity:'0',transform:'translateY(6px)' });
    document.body.appendChild(el);
  }
  const S = { success:{bg:'rgba(34,197,94,.13)',bd:'rgba(34,197,94,.4)',c:'#86efac',i:'✓'},
    error:{bg:'rgba(239,68,68,.13)',bd:'rgba(239,68,68,.4)',c:'#fca5a5',i:'✗'},
    warn:{bg:'rgba(245,158,11,.13)',bd:'rgba(245,158,11,.4)',c:'#fde68a',i:'⚠'},
    info:{bg:'rgba(96,165,250,.1)',bd:'rgba(96,165,250,.35)',c:'#93c5fd',i:'·'},
    job:{bg:'rgba(167,139,250,.1)',bd:'rgba(167,139,250,.35)',c:'#c4b5fd',i:'⚡'} };
  const s = S[type]||S.info;
  el.textContent = `${s.i} ${msg}`;
  Object.assign(el.style,{background:s.bg,border:`1px solid ${s.bd}`,color:s.c,opacity:'1',transform:'translateY(0)'});
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(()=>{el.style.opacity='0';el.style.transform='translateY(6px)';},dur);
}

// ── Error / truncation detection (inline, auto) ───────────────────────────────
// Detects: truncation, error messages, refusals — auto-flags and retries if claimed
function detectResponseErrors(text, jobId) {
  const issues = [];
  const lastLine = text.split('\n').filter(Boolean).pop() || '';
  const lower = text.toLowerCase();

  // Truncation signals
  if (text.length > 100 && (lastLine.endsWith('...') || lastLine.endsWith('…') || lastLine.length < 10))
    issues.push({ type:'truncation', score:0.9, reason:'trailing ellipsis or empty last line' });
  if (text.length > 0 && text.length < 120 && !lastLine.match(/[.!?"`]/))
    issues.push({ type:'truncation', score:0.8, reason:'too short, no sentence end' });

  // Claude error messages
  if (/i('m| am) unable to|i can't help|i cannot (assist|help|continue)|let me know if you.d like me to/i.test(text))
    issues.push({ type:'refusal', score:0.95, reason:'refusal phrase detected' });
  if (/\bcontext window\b|\btoken limit\b|\btoo long\b/i.test(text))
    issues.push({ type:'context_limit', score:0.9, reason:'context limit mentioned' });
  if (/something went wrong|an error occurred|please try again/i.test(lower))
    issues.push({ type:'claude_error', score:1.0, reason:'error page text detected' });
  if (/\bseam verdict:\s*fail/i.test(text))
    issues.push({ type:'seam_fail', score:1.0, reason:'SEAM VERDICT: FAIL' });

  // Gap analysis (inline)
  const words = lower.match(/\b\w+\b/g)||[];
  const hedges = (text.match(/\b(might|may|could|perhaps|possibly|seems|appears|likely|probably)\b/gi)||[]).length;
  const bulletDens = text.split('\n').filter(l=>/^\s*[-*•]|\d+\./.test(l)).length / Math.max(1,text.split('\n').length);
  if (bulletDens > 0.55) issues.push({ type:'compression', score:bulletDens, reason:'high bullet density — load-bearing assumptions hidden' });
  if (words.length > 80 && hedges/words.length > 0.05) issues.push({ type:'epistemic_hedge', score:hedges/words.length*10, reason:'high hedge rate' });

  return issues;
}

function autoRetry(jobId, text, retryCount = 0) {
  const MAX_RETRIES = 2;
  if (retryCount >= MAX_RETRIES) {
    _log('err', `Max retries (${MAX_RETRIES}) reached for job ${jobId.slice(0,8)}`, 'escalating to gap');
    _toBridge('guardian.job.escalated', { jobId, retries:retryCount });
    sendLedger('GAP', `Job escalated after ${retryCount} retries`, { jobId });
    return;
  }
  const issues = detectResponseErrors(text, jobId);
  if (!issues.length) return;

  const top = issues.sort((a,b)=>b.score-a.score)[0];
  const retryPrompt = buildRetryPrompt(top, text);

  _log('err', `Auto-retry ${retryCount+1}/${MAX_RETRIES}: ${top.type}`, top.reason);
  toast(`Retry ${retryCount+1}: ${top.reason.slice(0,40)}`, 'warn', 4000);
  sendLedger('EVENT', `Auto-retry ${retryCount+1} — ${top.type}`, { jobId, reason:top.reason, score:top.score });
  _toOrc('guardian', 'guardian.job.retry', { jobId, retry:retryCount+1, reason:top.type });
  _toBridge('guardian.job.retry', { jobId, retry:retryCount+1, reason:top.type });

  setTimeout(async () => {
    if (!injectText(retryPrompt)) { _log('err', 'Retry inject failed — no input'); return; }
    setTimeout(() => { submit(); startWatch(jobId, retryPrompt, retryCount+1); }, 400);
  }, 1000);
}

function buildRetryPrompt(issue, originalText) {
  if (issue.type === 'truncation') return `Your previous response appears to be truncated (it ended: "${(originalText.slice(-80)).trim()}"). Please continue from exactly where you left off without repeating anything.`;
  if (issue.type === 'refusal')    return `Please continue with the previous task. If there is a specific concern, state it precisely.`;
  if (issue.type === 'context_limit') return `The previous response mentioned context limits. Please summarise what was completed and list exactly what remains to be done.`;
  if (issue.type === 'seam_fail') return `Your SEAM VERDICT was FAIL. Please fix the failing tests and re-run them, reporting the corrected SEAM VERDICT.`;
  return `The previous response had an issue (${issue.type}: ${issue.reason}). Please retry the task.`;
}

// ── Usage tracking — §2.3 all state observable ───────────────────────────────
let _usageHistory = []; // { ts, jobId, chars, tokens, ms, provider, command }
function recordUsage(jobId, text, ms) {
  const tokens = estimateTokens(text);
  sessionTokens += tokens;
  sessionJobs++;
  const entry = { ts:Date.now(), jobId, chars:text.length, tokens, ms, provider:PROVIDER, chatId:chatId() };
  _usageHistory.push(entry);
  if (_usageHistory.length > 500) _usageHistory.shift();
  // Report to orchestrator ledger
  _toOrc('guardian', 'guardian.usage', entry);
  _toBridge('guardian.usage', entry);
  return entry;
}

// ── DOM helpers — response finding ───────────────────────────────────────────
function findResponseEl() {
  // Try most specific/stable selectors first
  const all = document.querySelectorAll('[data-testid="assistant-message"]');
  if (all.length) return all[all.length - 1];
  // Claude artifact renderer
  const arts = document.querySelectorAll('.font-claude-message');
  if (arts.length) return arts[arts.length - 1];
  // Prose fallback
  const prose = document.querySelectorAll('.prose');
  if (prose.length) return prose[prose.length - 1];
  return null;
}
function injectText(text) {
  // Claude uses a React-controlled contenteditable div
  // Must trigger React's synthetic event system — not just set textContent
  const SELECTORS = [
    'div[contenteditable="true"].ProseMirror',
    'div[contenteditable="true"][data-testid="chat-input"]',
    'div[contenteditable="true"]',
  ];
  let input = null;
  for (const sel of SELECTORS) {
    const el = document.querySelector(sel);
    if (el) { input = el; break; }
  }
  if (!input) return false;
  input.focus();
  // Use execCommand first — works in most cases
  document.execCommand('selectAll', false, null);
  document.execCommand('delete', false, null);
  const ok = document.execCommand('insertText', false, text);
  if (ok && input.textContent.trim() === text.trim()) return true;
  // Fallback: React synthetic input event path
  input.textContent = '';
  const dataTransfer = new DataTransfer();
  dataTransfer.setData('text/plain', text);
  input.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dataTransfer, bubbles: true }));
  if (input.textContent.trim()) return true;
  // Last resort: direct textContent + InputEvent
  input.textContent = text;
  input.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: text }));
  return !!input.textContent.trim();
}
function submit() {
  // Try send button first
  const BTN_SELS = [
    'button[data-testid="send-button"]:not([disabled])',
    'button[aria-label="Send message"]:not([disabled])',
    'button[aria-label="Send"]:not([disabled])',
  ];
  for (const sel of BTN_SELS) {
    const btn = document.querySelector(sel);
    if (btn) { btn.click(); return; }
  }
  // Fallback: Enter key on the input
  const input = document.querySelector('div[contenteditable="true"]');
  if (input) {
    input.dispatchEvent(new KeyboardEvent('keydown', { key:'Enter', code:'Enter', keyCode:13, which:13, bubbles:true, cancelable:true }));
  }
}
function isChatBlank() { return !document.querySelector('[data-testid="assistant-message"],[data-testid="human-message"]'); }

// ── Artifact / code block detection ──────────────────────────────────────────
const ARTIFACT_SELECTORS = ['pre code','[class*="CodeBlock"] code','[class*="artifact"] code','.language-','[data-testid="code-snippet"] code'];
function scanDOM() {
  for (const sel of ARTIFACT_SELECTORS) {
    document.querySelectorAll(sel).forEach(el => {
      const content = (el.innerText||el.textContent||'').trim();
      if (!content || content.length < 30) return;
      const hash = simpleHash(content);
      if (seenHashes.has(hash)) return;
      seenHashes.add(hash);
      const lang = detectLang(el);
      const entry = { id:uid(), hash, lang, content:content.slice(0,5000), ts:Date.now(), jobId:currentJobId, chatId:chatId() };
      artifactStore.push(entry);
      if (artifactStore.length > 200) artifactStore.shift();
      _log('out', `Artifact: ${lang||'text'} (${content.length}ch)`, hash);
      send({ type:'GUARDIAN_ARTIFACT', jobId:currentJobId, content:content.slice(0,4000), lang, hash, chatUrl:location.href, account:getAccount(), provider:PROVIDER });
      _toBridge('guardian.artifact', { hash, lang, chars:content.length, jobId:currentJobId });
      _toOrc('guardian','guardian.artifact.detected',{hash,lang,chars:content.length});
    });
  }
}
let _scanTimer = null;
function scheduleScan() { clearTimeout(_scanTimer); _scanTimer = setTimeout(scanDOM, 800); }
let _domObs = null;
function startObserver() {
  if (_domObs) return;
  _domObs = new MutationObserver(scheduleScan);
  _domObs.observe(document.body, { childList:true, subtree:true, characterData:true });
}

// ── Response watcher — the job execution loop ─────────────────────────────────
let _watchObs = null, _watchTimer = null, _watchStart = 0;

function stopWatch() {
  if (_watchObs)   { _watchObs.disconnect(); _watchObs = null; }
  if (_watchTimer) { clearTimeout(_watchTimer); _watchTimer = null; }
  currentJobId = null; jobActive = false;
  setJobBar(false);
}

// Is Claude currently generating? — checks for stop/streaming indicator
function _isGenerating() {
  return !!(
    document.querySelector('button[aria-label="Stop generating"]') ||
    document.querySelector('button[data-testid="stop-button"]') ||
    document.querySelector('[data-testid="streaming-indicator"]') ||
    document.querySelector('.text-streaming')
  );
}

function startWatch(jobId, prompt, retryCount = 0) {
  stopWatch();
  currentJobId = jobId; jobActive = true; _watchStart = Date.now();
  setJobBar(true, prompt, jobId);

  let lastText = '', stableCount = 0;
  const STABLE_NEEDED = 3;   // 3 mutation-free cycles = done
  const STABLE_MS     = 300; // ms between stable checks

  let _lastChunkLen = 0;  // track how much we've streamed

  function checkStable() {
    if (!currentJobId || currentJobId !== jobId) return;
    const el = findResponseEl();
    if (!el) { _watchTimer = setTimeout(checkStable, 600); return; }
    const text = (el.innerText || el.textContent || '').trim();
    if (text === lastText && !_isGenerating()) {
      stableCount++;
      if (stableCount >= STABLE_NEEDED) {
        const ms = Date.now() - _watchStart;
        stopWatch();
        _onJobComplete(jobId, text, ms, prompt, retryCount);
        return;
      }
    } else {
      // Text changed — stream the new portion to guardian
      if (text.length > _lastChunkLen) {
        const delta = text.slice(_lastChunkLen);
        _lastChunkLen = text.length;
        // Throttle: only send if delta is meaningful (>10 chars or ends a sentence)
        if (delta.length > 10 || /[.!?\n]/.test(delta)) {
          send({ type:'GUARDIAN_CHUNK', jobId, text: delta, full: text,
            provider: PROVIDER, chatUrl: location.href, ts: Date.now() });
          // Also stream directly to cortex (batch-throttled)
          _streamToCortex(jobId, delta, text);
        }
      }
      lastText = text;
      stableCount = 0;
      scheduleScan();
    }
    _watchTimer = setTimeout(checkStable, STABLE_MS);
  }

  // MutationObserver — fires on every DOM change (token by token as Claude streams)
  const target = document.querySelector('main') || document.body;
  _watchObs = new MutationObserver(() => {
    stableCount = 0; // any mutation resets stable counter
    if (_watchTimer) { clearTimeout(_watchTimer); _watchTimer = null; }
    _watchTimer = setTimeout(checkStable, STABLE_MS);
  });
  _watchObs.observe(target, { childList: true, subtree: true, characterData: true });

  // Fallback timer in case observer misses something
  _watchTimer = setTimeout(checkStable, 1500);
}

function _onJobComplete(jobId, text, ms, prompt, retryCount) {
  // §LAW II — ledger write first
  send({ type:'GUARDIAN_LEDGER_WRITE', jobId, category:'UPGRADE',
    msg:`Complete · ${text.length}ch · ${Math.round(ms/1000)}s`,
    meta:{ jobId, chars:text.length, ms, provider:PROVIDER, ts:Date.now() }
  });
  _log('ok', `Complete · ${text.length}ch`, `${Math.round(ms/1000)}s · #${jobId.slice(0,8)}`);
  toast(`Done: ${text.length} chars in ${Math.round(ms/1000)}s`, 'success', 3500);

  const usage = recordUsage(jobId, text, ms);

  // Detect errors / gaps — auto-retry if issues found
  const issues = detectResponseErrors(text, jobId);
  if (issues.length) {
    const top = issues[0];
    _log('gap', `${issues.length} issue(s)`, issues.map(i=>i.type).join(','));
    currentGaps = [...issues, ...currentGaps].slice(0,100);
    if (retryCount === 0) { // only auto-retry on first completion
      autoRetry(jobId, text, retryCount);
    } else {
      sendLedger('GAP', `Issues after retry ${retryCount}`, { issues });
    }
    send({ type:'GUARDIAN_GAPS', jobId, gaps:issues, chatUrl:location.href, account:getAccount() });
    _toBridge('guardian.gaps', { jobId, gaps:issues });
    _gapsToCortex(jobId, issues);
  } else {
    // Clean completion
    sendLedger('UPGRADE', `Job complete · #${jobId.slice(0,8)}`, { jobId, chars:text.length, ms });
    send({ type:'GUARDIAN_COMPLETE', jobId, text, chatUrl:location.href, account:getAccount(), requestId:jobId });
        parseCortexCommands(lastText, jobId);
    _toBridge('guardian.job.complete', { jobId, chars:text.length, ms, provider:PROVIDER });
    _toCortex('guardian.job.complete', { jobId, chars:text.length, ms, usage });
    _completeToCortex(jobId, text, ms, usage);
    _toOrc('guardian','guardian.job.complete',{ jobId, chars:text.length, ms });
    scanDOM();
    stopWatch();
  }
}

// ── Job handler ───────────────────────────────────────────────────────────────
async function handleJob(msg) {
  if (!isClaimed) {
    _log('info', 'Job ignored — PASSIVE', msg.jobId?.slice(0,8));
    toast('Job ignored — tab not claimed (click PASSIVE to claim)', 'warn', 3000);
    return;
  }
  const { jobId, prompt='', content='', command='' } = msg;
  const text = content ? (prompt ? `${prompt}\n\n${content}` : content) : prompt;
  if (!text.trim()) { _log('err','Empty job','skipping'); return; }

  // §LAW II — ledger write IS the state change. Write first, act second.
  send({ type:'GUARDIAN_LEDGER_WRITE', jobId, category:'INPUT',
    msg:`Job: ${command} #${jobId.slice(0,8)}`,
    meta:{ jobId, command, chars:text.length, provider:PROVIDER, chatUrl:location.href, ts:Date.now() }
  });

  _log('job', `Job: ${command}`, `${text.length}ch · #${jobId.slice(0,8)}`);
  toast(`⚡ ${command} · #${jobId.slice(0,8)}`, 'job', 3000);
  _toOrc('guardian', 'guardian.job.received', { jobId, command, chars:text.length });
  _jobStartToCortex(jobId, command, text);
  _toBridge('guardian.job.dispatched', { jobId, command, provider:PROVIDER });

  await gate('handleJob', async () => {
    seenHashes.clear();
    const ctx = await pullCortexContext(text);
    const finalText = ctx ? ctx + text : text;
    if (!injectText(finalText)) throw new Error('Input not found — no contenteditable');
    // Ledger write: DELIVERED — before submit fires
    send({ type:'GUARDIAN_LEDGER_WRITE', jobId, category:'EVENT',
      msg:`Delivered: ${command} #${jobId.slice(0,8)}`,
      meta:{ jobId, command, provider:PROVIDER, ts:Date.now() }
    });
    send({ type:'GUARDIAN_DELIVERED', jobId, chatUrl:location.href, account:getAccount(), requestId:jobId });
    setTimeout(() => { submit(); startWatch(jobId, text, 0); }, 500);
    return true;
  }, { jobId });
}

// ── Cortex context pull ───────────────────────────────────────────────────────
async function pullCortexContext(prompt) {
  try {
    var q = encodeURIComponent(prompt.slice(0, 120));
    var r = await fetch(NCP_URL + '/memory/context?q=' + q, { signal: AbortSignal.timeout(2000) });
    if (!r.ok) return '';
    var d = await r.json();
    var parts = [];
    if (d.gaps && d.gaps.length) {
      var gapLines = d.gaps.slice(0,3).map(function(g) { return '- ' + g.type + ': ' + (g.description||'').slice(0,80); });
      parts.push('[OPEN GAPS]\n' + gapLines.join('\n'));
    }
    if (d.artifacts && d.artifacts.length) {
      var artLines = d.artifacts.slice(0,2).map(function(a) { return '- ' + (a.name||a.lang||'artifact'); });
      parts.push('[RECENT ARTIFACTS]\n' + artLines.join('\n'));
    }
    return parts.length ? '[NEXUS CONTEXT]\n' + parts.join('\n') + '\n\n' : '';
  } catch(e) { return ''; }
}

// ── Post-response cortex command parser ──────────────────────────────────────
// Scans completed response for ?CORTEX:query lines.
// Executes against guardian memory API, posts result back for SEAM queue injection.
async function parseCortexCommands(text, jobId) {
  var cmds = text.split('\n').filter(function(l) { return /^\?CORTEX:/i.test(l.trim()); });
  if (!cmds.length) return;
  for (var i = 0; i < cmds.length; i++) {
    var q = cmds[i].replace(/^\?CORTEX:/i,'').trim();
    try {
      var r = await fetch(NCP_URL + '/memory/query?q=' + encodeURIComponent(q),
        { signal: AbortSignal.timeout(2000) });
      if (!r.ok) continue;
      var d = await r.json();
      var result = (d.results||[]).slice(0,3).map(function(x) { return x.text||x.content||''; }).join('\n') || '(no results)';
      send({ type:'GUARDIAN_CORTEX_RESULT', jobId:jobId, query:q, result:result });
      _log('info', '?CORTEX: ' + q, (d.results||[]).length + ' results');
    } catch(e) {}
  }
}

// ── Navigation ────────────────────────────────────────────────────────────────
let _lastPath = location.pathname;
function checkNavigate() {
  if (location.pathname === _lastPath) return;
  _lastPath = location.pathname;
  seenHashes.clear();
  if (currentJobId) stopWatch();
  _log('sys', `Nav → ${chatId()}`);
  setTimeout(scanDOM, 1000);
}
setInterval(checkNavigate, 800);

// ── WebSocket ─────────────────────────────────────────────────────────────────
function connect() {
  // NCP: SSE for server→browser push, fetch() for browser→server
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (_es) { try { _es.close(); } catch(_) {} }

  const tabParam = `tabId=${MY_TAB}&provider=${PROVIDER}`;
  _log('info', 'NCP connecting…', `${NCP_CHANNEL}?${tabParam}`);
  connState = 'connecting'; setConnState('connecting');

  _es = new EventSource(`${NCP_CHANNEL}?${tabParam}`);

  _es.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      _handleServerMessage(msg);
    } catch(err) {
      _log('err', 'NCP parse error', err.message);
    }
  };

  _es.onopen = () => {
    connState = 'ready'; setConnState('ready');
    _log('ok', `NCP connected · ${PROVIDER}`, NCP_CHANNEL);
    // Register with server via POST (EventSource opened = we're live)
    ncpPost(NCP_RESULT, {
      type: 'GUARDIAN_REGISTER', provider: PROVIDER,
      host: location.hostname, tabId: MY_TAB, claimed: amIClaimed(),
    });
    // Start heartbeat via POST /heartbeat
    if (hb) clearInterval(hb);
    hb = setInterval(async () => {
      const res = await ncpPost(NCP_HB, {
        type: 'GUARDIAN_HEARTBEAT', provider: PROVIDER,
        tabId: MY_TAB, ts: Date.now(),
      });
      // ACK is in the response body — no separate message needed
    }, HB_MS);
  };

  _es.onerror = (e) => {
    connState = 'disconnected'; setConnState('disconnected');
    _log('err', 'NCP error — reconnecting in ' + RECONNECT_MS + 'ms');
    _es.close();
    clearInterval(hb);
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    reconnectTimer = setTimeout(connect, RECONNECT_MS);
  };
}


// POST helper for NCP results
async function ncpPost(url, data) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, chatUrl: location.href, account: getAccount() }),
      keepalive: true,
    });
    return res.ok ? await res.json() : null;
  } catch(_) { return null; }
}

// Unified server message handler (replaces ws.onmessage switch)
function _handleServerMessage(msg) {
  switch(msg.type) {
    case 'NCP_READY':
    case 'GUARDIAN_READY':
      setConnState('ready');
      _log('ok', `Ready · ${msg.provider||PROVIDER}`, NCP_CHANNEL);
      toast('Guardian connected ✓', 'success', 2000);
      autoClaimIfFree();
      startObserver();
      setTimeout(scanDOM, 800);
      break;

    case 'GUARDIAN_CLAIM':
      if (msg.tabId===MY_TAB||msg.tabId==='any') {
        claimTab();
        ncpPost(NCP_RESULT, { type:'GUARDIAN_CLAIM_ACK', tabId:MY_TAB, provider:PROVIDER });
        toast('Tab claimed — ACTIVE', 'success', 2000);
      }
      break;

    case 'GUARDIAN_RELEASE':
      releaseTab?.();
      break;

    case 'GUARDIAN_JOB':
      currentJobId = msg.jobId;
      handleJob(msg);
      break;

    case 'GUARDIAN_SESSION_NAMED':
      _log('info', 'Session named', msg.name);
      break;

    case 'GUARDIAN_ARTIFACT_SAVED':
      _log('ok', 'Artifact saved', msg.artifactId);
      break;

    default:
      _log('debug', `NCP msg: ${msg.type}`);
  }
}

// ── UI — Styles ───────────────────────────────────────────────────────────────
function injectStyles() {
  const s = document.createElement('style');
  s.textContent = `
    @keyframes gpulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.8)}}
    @keyframes gfadein{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
    #__g9root__{position:fixed;bottom:16px;right:16px;z-index:2147483647;font-family:'SF Mono','Fira Code',monospace;font-size:11px;user-select:none}
    #__g9pill__{display:flex;align-items:center;gap:6px;background:rgba(10,10,16,.94);backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.09);border-radius:22px;padding:5px 12px 5px 8px;cursor:pointer;box-shadow:0 4px 24px rgba(0,0,0,.6);transition:opacity .2s;margin-left:auto}
    #__g9pill__:hover{opacity:.88}
    #__g9panel__{width:480px;background:rgba(8,8,14,.98);backdrop-filter:blur(18px);border:1px solid rgba(255,255,255,.08);border-radius:14px;box-shadow:0 10px 50px rgba(0,0,0,.8);overflow:hidden;margin-bottom:8px;display:none;flex-direction:column;max-height:520px;animation:gfadein .14s ease}
    #__g9tabs__{display:flex;border-bottom:1px solid rgba(255,255,255,.06);background:rgba(0,0,0,.35);flex-shrink:0}
    .g9tab{flex:1;padding:6px 2px;text-align:center;cursor:pointer;font-size:9px;color:#334155;border-bottom:2px solid transparent;transition:all .14s;letter-spacing:.04em;font-weight:700;text-transform:uppercase}
    .g9tab:hover{color:#64748b}.g9tab.active{color:#e2e8f0;border-bottom-color:#6366f1}
    #__g9log__{flex:1;overflow-y:auto;padding:4px 0;min-height:180px;max-height:320px}
    .g9row{display:flex;align-items:flex-start;gap:7px;padding:3px 12px;transition:background .12s}
    .g9row:hover{background:rgba(255,255,255,.02)}
    .g9ts{color:#1e293b;font-size:9px;flex-shrink:0;padding-top:1px;width:52px}
    .g9ic{flex-shrink:0;width:10px;text-align:center;padding-top:1px}
    .g9ct{flex:1;min-width:0}
    .g9msg{font-size:10px}.g9det{color:#334155;font-size:9px;margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    /* Usage tab */
    .g9use-row{display:flex;justify-content:space-between;align-items:center;padding:4px 12px;border-bottom:1px solid rgba(255,255,255,.03);font-size:9px}
    .g9use-label{color:#475569}.g9use-val{color:#e2e8f0;font-weight:600}
    .g9use-bar{height:3px;background:#1e293b;border-radius:2px;margin:2px 12px 0;overflow:hidden}
    .g9use-fill{height:100%;background:linear-gradient(90deg,#6366f1,#2dd4bf);border-radius:2px;transition:width .4s}
    /* Gaps tab */
    .g9gap{padding:6px 10px;border-bottom:1px solid rgba(255,255,255,.03);font-size:9px}
    .g9gap-type{color:#f472b6;font-weight:700;font-size:8px;text-transform:uppercase;letter-spacing:.08em}
    .g9gap-desc{color:#64748b;margin-top:2px;line-height:1.5}
    .g9gap-score{color:#475569;font-size:8px}
    /* Artifacts */
    .g9art{padding:5px 10px;border-bottom:1px solid rgba(255,255,255,.03);cursor:pointer}
    .g9art:hover{background:rgba(255,255,255,.02)}
    .g9art-hdr{display:flex;align-items:center;gap:6px;font-size:9px}
    .g9art-lang{color:#6366f1;font-weight:700;min-width:40px}.g9art-sz{color:#334155}.g9art-hash{color:#1e293b}
    .g9art-pre{font-size:9px;color:#475569;padding:4px 0;white-space:pre-wrap;word-break:break-all;max-height:80px;overflow:hidden;line-height:1.4}
    /* Footer */
    .g9footer{padding:6px 12px;border-top:1px solid rgba(255,255,255,.05);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;font-size:9px;color:#1e293b}
    /* Job bar */
    #__g9jobbar__{display:none;align-items:center;gap:8px;padding:6px 12px;background:rgba(251,191,36,.07);border-bottom:1px solid rgba(251,191,36,.14);flex-shrink:0}
    .g9jdot{width:5px;height:5px;border-radius:50%;background:#fbbf24;animation:gpulse 1.2s ease-in-out infinite;flex-shrink:0}
    .g9jtext{color:#fde68a;font-size:10px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}
    .g9jid{color:#78716c;font-size:9px}
    /* Claim badge */
    #__g9claim__{font-size:9px;padding:1px 6px;border-radius:8px;font-weight:700;cursor:pointer;letter-spacing:.05em;border:1px solid rgba(100,116,139,.25);color:#64748b;background:rgba(100,116,139,.08)}
    #__g9claim__.active{border-color:rgba(34,197,94,.4);color:#22c55e;background:rgba(34,197,94,.08)}
    #__g9badge__{background:#7c3aed;color:#fff;border-radius:10px;padding:0 5px;font-size:9px;display:none;font-weight:700}
    #__g9hdr__{display:flex;align-items:center;justify-content:space-between;padding:9px 12px;border-bottom:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.02);flex-shrink:0}
    .g9hdr-l{display:flex;align-items:center;gap:7px}
    .g9hdr-dot{width:7px;height:7px;border-radius:50%;background:#888;flex-shrink:0;transition:background .3s}
    .g9hdr-title{color:#e2e8f0;font-weight:700;font-size:11px}
    .g9hdr-badge{font-size:9px;padding:1px 7px;border-radius:10px;background:rgba(136,136,136,.2);color:#888;text-transform:uppercase;letter-spacing:.06em;font-weight:600}
    .g9clear{background:none;border:1px solid rgba(255,255,255,.08);color:#334155;border-radius:5px;padding:2px 8px;cursor:pointer;font-size:9px;font-family:inherit}
    .g9clear:hover{color:#64748b}
    /* CLI hint box */
    .g9cli{background:rgba(99,102,241,.06);border:1px solid rgba(99,102,241,.2);border-radius:6px;padding:8px 10px;margin:8px;font-size:9px;color:#475569;line-height:1.7}
    .g9cli-cmd{color:#818cf8;font-weight:600}.g9cli-desc{color:#334155}
    .g9cli a{color:#6366f1;text-decoration:none}
  `;
  document.head.appendChild(s);
}

// ── UI — Build ────────────────────────────────────────────────────────────────
function buildUI() {
  injectStyles();
  const root = document.createElement('div'); root.id='__g9root__';
  document.body.appendChild(root);

  // Pill
  const pill = document.createElement('div'); pill.id='__g9pill__';
  const dot   = document.createElement('div'); dot.id='__g9dot__';
  Object.assign(dot.style,{width:'7px',height:'7px',borderRadius:'50%',background:'#888',transition:'background .4s',flexShrink:'0'});
  const lbl   = document.createElement('span'); lbl.id='__g9label__'; lbl.style.cssText='color:#cbd5e1;font-size:11px;font-weight:600'; lbl.textContent='Guardian';
  const prov  = document.createElement('span'); prov.style.cssText='color:#475569;font-size:9px;border-left:1px solid rgba(255,255,255,.1);padding-left:6px;margin-left:1px'; prov.textContent=`claude v${VERSION}`;
  const claim = document.createElement('span'); claim.id='__g9claim__'; claim.textContent='PASSIVE';
  claim.addEventListener('click', e => { e.stopPropagation(); isClaimed?releaseTab():claimTab(); toast(isClaimed?'ACTIVE — jobs will execute':'PASSIVE — jobs ignored', isClaimed?'success':'warn',2500); });
  const badge = document.createElement('span'); badge.id='__g9badge__';
  pill.append(dot,lbl,prov,claim,badge);

  // Panel
  const panel = document.createElement('div'); panel.id='__g9panel__';

  // Header
  const hdr = document.createElement('div'); hdr.id='__g9hdr__';
  const hdrL = document.createElement('div'); hdrL.className='g9hdr-l';
  const hdrDot = document.createElement('div'); hdrDot.id='__g9hdrdot__'; hdrDot.className='g9hdr-dot';
  const hdrTitle = document.createElement('span'); hdrTitle.className='g9hdr-title'; hdrTitle.textContent='Guardian';
  const hdrBadge = document.createElement('span'); hdrBadge.id='__g9hdrbadge__'; hdrBadge.className='g9hdr-badge'; hdrBadge.textContent='DISCONNECTED';
  hdrL.append(hdrDot,hdrTitle,hdrBadge);
  const clearBtn = document.createElement('button'); clearBtn.className='g9clear'; clearBtn.textContent='Clear';
  clearBtn.onclick = () => { logEntries=[]; unreadCount=0; renderLog(); _setBadge(0); };
  hdr.append(hdrL,clearBtn);

  // Job bar
  const jobBar = document.createElement('div'); jobBar.id='__g9jobbar__';
  const jDot   = document.createElement('div'); jDot.className='g9jdot';
  const jText  = document.createElement('span'); jText.id='__g9jtext__'; jText.className='g9jtext'; jText.textContent='Job running…';
  const jId    = document.createElement('span'); jId.id='__g9jid__'; jId.className='g9jid';
  jobBar.append(jDot,jText,jId);

  // Tabs: Log | Use | Gaps | Arts | SEAM | API
  const tabs = document.createElement('div'); tabs.id='__g9tabs__';
  const TAB_LIST = [['log','Log'],['use','Usage'],['gaps','Gaps'],['arts','Arts'],['seam','SEAM'],['api','API']];
  for (const [id,label] of TAB_LIST) {
    const t = document.createElement('div'); t.className='g9tab'+(id===activeTab?' active':'');
    t.textContent=label; t.dataset.tab=id; t.addEventListener('click',()=>switchTab(id)); tabs.appendChild(t);
  }

  // Content areas
  const logArea  = document.createElement('div'); logArea.id='__g9log__';
  const useArea  = document.createElement('div'); useArea.id='__g9use__';  useArea.style.display='none';
  const gapsArea = document.createElement('div'); gapsArea.id='__g9gaps__'; gapsArea.style.cssText='display:none;overflow-y:auto;max-height:340px';
  const artsArea = document.createElement('div'); artsArea.id='__g9arts__'; artsArea.style.cssText='display:none;overflow-y:auto;max-height:340px';
  const seamArea = document.createElement('div'); seamArea.id='__g9seam__'; seamArea.style.cssText='display:none;padding:8px;overflow-y:auto;max-height:340px';
  const apiArea  = document.createElement('div'); apiArea.id='__g9api__';  apiArea.style.display='none';

  const footer = document.createElement('div'); footer.className='g9footer';
  const fL = document.createElement('span'); fL.id='__g9fl__'; fL.textContent=`${WS_URL} · claude`;
  const fR = document.createElement('span'); fR.textContent=`v${VERSION}`;
  footer.append(fL,fR);

  panel.append(hdr,jobBar,tabs,logArea,useArea,gapsArea,artsArea,seamArea,apiArea,footer);
  pill.addEventListener('click', () => {
    panelOpen=!panelOpen; panel.style.display=panelOpen?'flex':'none';
    if (panelOpen) { renderActiveTab(); unreadCount=0; _setBadge(0); }
  });
  root.append(panel,pill);
}

// ── UI helpers ────────────────────────────────────────────────────────────────
const AREAS = { log:'__g9log__', use:'__g9use__', gaps:'__g9gaps__', arts:'__g9arts__', seam:'__g9seam__', api:'__g9api__' };
function switchTab(id) {
  activeTab=id;
  document.querySelectorAll('.g9tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===id));
  for (const [k,eid] of Object.entries(AREAS)) { const el=document.getElementById(eid); if(el)el.style.display=k===id?(k==='log'?'block':'block'):'none'; }
  renderActiveTab();
}
function renderActiveTab() {
  if (activeTab==='log')  renderLog();
  if (activeTab==='use')  renderUse();
  if (activeTab==='gaps') renderGaps();
  if (activeTab==='arts') renderArts();
  if (activeTab==='seam') renderSeam();
  if (activeTab==='api')  renderApi();
}
function _setBadge(n) { const b=document.getElementById('__g9badge__'); if(b){b.textContent=n>99?'99+':n; b.style.display=n>0?'inline':'none';} }
function setConnState(state) {
  connState=state;
  const COLORS = { connecting:'#888', handshaking:'#f59e0b', ready:'#22c55e', disconnected:'#ef4444' };
  const LABELS = { connecting:'CONNECTING', handshaking:'HANDSHAKING', ready:'READY', disconnected:'DISCONNECTED' };
  const col = COLORS[state]||'#ef4444';
  const d=document.getElementById('__g9dot__'); if(d)d.style.background=col;
  const hd=document.getElementById('__g9hdrdot__'); if(hd)hd.style.background=col;
  const hb=document.getElementById('__g9hdrbadge__'); if(hb){hb.textContent=LABELS[state]||state.toUpperCase();hb.style.background=col+'22';hb.style.color=col;}
}
function updatePill() {
  const c=document.getElementById('__g9claim__');
  if (!c) return;
  c.textContent=isClaimed?'ACTIVE':'PASSIVE';
  c.classList.toggle('active',isClaimed);
}
function setJobBar(active, prompt, jobId) {
  const bar=document.getElementById('__g9jobbar__'); if(!bar)return;
  bar.style.display=active?'flex':'none';
  if (active) {
    const t=document.getElementById('__g9jtext__'); if(t)t.textContent=(prompt||'Job running…').slice(0,60);
    const i=document.getElementById('__g9jid__'); if(i)i.textContent=jobId?`#${jobId.slice(0,8)}`:'';
  }
}
function updateFooter() {
  const el=document.getElementById('__g9fl__'); if(!el)return;
  const secs = Math.round((Date.now()-sessionStart)/1000);
  el.textContent=`${getAccount().slice(0,18)} · ${Math.floor(secs/60)}m · ~${sessionTokens.toLocaleString()}tok · ${sessionJobs}j`;
}

// ── Log render ─────────────────────────────────────────────────────────────────
function _appendLogRow(entry) {
  const a=document.getElementById('__g9log__'); if(!a)return;
  const row=document.createElement('div'); row.className='g9row';
  const ts=document.createElement('span'); ts.className='g9ts'; ts.textContent=fts(entry.ts);
  const ic=document.createElement('span'); ic.className='g9ic'; ic.style.color=entry.color; ic.textContent=entry.icon;
  const ct=document.createElement('div'); ct.className='g9ct';
  const m=document.createElement('span'); m.className='g9msg'; m.style.color=entry.color; m.textContent=entry.msg; ct.appendChild(m);
  if (entry.detail) { const d=document.createElement('div'); d.className='g9det'; d.textContent=entry.detail; ct.appendChild(d); }
  row.append(ts,ic,ct); a.appendChild(row);
  a.scrollTop=a.scrollHeight;
}
function renderLog() { const a=document.getElementById('__g9log__'); if(!a)return; a.innerHTML=''; logEntries.forEach(e=>_appendLogRow(e)); }

// ── Usage tab ─────────────────────────────────────────────────────────────────
function renderUse() {
  const a=document.getElementById('__g9use__'); if(!a)return;
  const secs = Math.round((Date.now()-sessionStart)/1000);
  const tps   = sessionJobs > 0 ? (sessionTokens/sessionJobs).toFixed(0) : '—';
  const rows = [
    ['Session time',  `${Math.floor(secs/60)}m ${secs%60}s`],
    ['Jobs complete', sessionJobs],
    ['Est. tokens',   sessionTokens.toLocaleString()],
    ['Avg tok/job',   tps],
    ['Gaps detected', currentGaps.length],
    ['Artifacts',     artifactStore.length],
    ['Retries',       _usageHistory.filter(u=>u.retried).length],
    ['Account',       getAccount().slice(0,30)],
    ['Tab',           isClaimed?'ACTIVE (executing jobs)':'PASSIVE (ignoring jobs)'],
    ['Chat ID',       chatId()],
  ];
  a.innerHTML = rows.map(([k,v])=>`<div class="g9use-row"><span class="g9use-label">${k}</span><span class="g9use-val">${v}</span></div>`).join('');

  // Token bar
  const maxTok = 100000;
  const pct = Math.min(100, (sessionTokens/maxTok)*100).toFixed(1);
  a.innerHTML += `<div class="g9use-bar" title="~${pct}% of 100k session budget"><div class="g9use-fill" style="width:${pct}%"></div></div>`;

  // Recent jobs
  if (_usageHistory.length) {
    a.innerHTML += `<div style="padding:8px 12px 2px;font-size:8px;color:#1e293b;text-transform:uppercase;letter-spacing:.08em">Recent jobs</div>`;
    for (const u of [..._usageHistory].reverse().slice(0,8)) {
      const t=new Date(u.ts).toTimeString().slice(0,8);
      a.innerHTML += `<div class="g9use-row"><span class="g9use-label">${t} · ${u.chatId.slice(0,8)}</span><span class="g9use-val">${u.chars}ch / ~${u.tokens}tok / ${Math.round(u.ms/1000)}s</span></div>`;
    }
  }

  // CLI hint
  a.innerHTML += `<div class="g9cli"><b class="g9cli-cmd">nexus> ledger guardian</b><br><span class="g9cli-desc">Full usage history available in the NEXUS CLI</span><br><b class="g9cli-cmd">nexus> jobs</b> · <b class="g9cli-cmd">nexus> events</b></div>`;
}

// ── Gaps tab ──────────────────────────────────────────────────────────────────
function renderGaps() {
  const a=document.getElementById('__g9gaps__'); if(!a)return;
  if (!currentGaps.length) { a.innerHTML='<div style="color:#1e293b;font-size:9px;padding:20px;text-align:center">No gaps detected this session</div>'; return; }
  a.innerHTML = currentGaps.map(g=>`<div class="g9gap"><div class="g9gap-type">${g.type||'—'}</div><div class="g9gap-desc">${escHtml(g.reason||g.description||'')}</div><div class="g9gap-score">score: ${(g.score||0).toFixed(2)}</div></div>`).join('');
  a.innerHTML += `<div class="g9cli"><b class="g9cli-cmd">nexus> gaps</b><br><span class="g9cli-desc">Gap history → cortex event_log + idearium gaps</span></div>`;
}

// ── Artifacts tab ─────────────────────────────────────────────────────────────
let _artExpanded = new Set();
function renderArts() {
  const a=document.getElementById('__g9arts__'); if(!a)return;
  if (!artifactStore.length) { a.innerHTML='<div style="color:#1e293b;font-size:9px;padding:20px;text-align:center">No artifacts this session</div>'; return; }
  a.innerHTML = '';
  for (const art of [...artifactStore].reverse()) {
    const div=document.createElement('div'); div.className='g9art';
    const exp = _artExpanded.has(art.hash);
    div.innerHTML=`<div class="g9art-hdr"><span class="g9art-lang">${art.lang||'text'}</span><span class="g9art-sz">${art.content.length}ch</span><span class="g9art-hash">#${art.hash}</span><span style="color:#334155;margin-left:auto">${exp?'▲':'▼'}</span></div>${exp?`<div class="g9art-pre">${escHtml(art.content.slice(0,400))}${art.content.length>400?'…':''}</div>`:''}`;
    div.addEventListener('click',()=>{ if(exp)_artExpanded.delete(art.hash);else _artExpanded.add(art.hash); renderArts(); });
    a.appendChild(div);
  }
  a.innerHTML += `<div class="g9cli"><b class="g9cli-cmd">nexus> </b><span class="g9cli-desc">Artifacts synced to guardian memory server & cortex</span></div>`;
}

// ── SEAM tab — minimal (parse + inject) ──────────────────────────────────────
let seamState = { chunks:[], title:'', sysPrompt:'nexus' };
function seamLoad() { try { const s=localStorage.getItem('seam_v9'); if(s)seamState=JSON.parse(s); }catch(_){} }
function seamSave() { try { localStorage.setItem('seam_v9',JSON.stringify(seamState)); }catch(_){} }
seamLoad();

function renderSeam() {
  const a=document.getElementById('__g9seam__'); if(!a)return;
  a.innerHTML='';

  // Title bar
  const tb=document.createElement('div'); tb.style.cssText='display:flex;gap:4px;margin-bottom:6px;align-items:center';
  const ti=document.createElement('input'); ti.style.cssText='flex:1;background:#030308;border:1px solid #1e1e3a;color:#94a3b8;padding:3px 7px;font:inherit;font-size:9px;outline:none;border-radius:2px';
  ti.placeholder='Spec title…'; ti.value=seamState.title||'';
  ti.oninput=e=>{seamState.title=e.target.value;seamSave();};

  const parseBtn=document.createElement('button'); parseBtn.style.cssText='background:none;border:1px solid #1e1e3a;color:#f59e0b;border-radius:2px;padding:2px 7px;font:inherit;font-size:9px;cursor:pointer';
  parseBtn.textContent='+ Parse'; parseBtn.onclick=()=>{
    const text=prompt('Paste spec text:'); if(!text)return;
    const rawChunks=text.split(/\n(?=#+\s|Phase\s*\d+|PHASE\s*\d+|\d+\.\s+\*\*)/);
    seamState.chunks=rawChunks.filter(c=>c.trim().length>30).map((c,i)=>({
      id:i, title:c.split('\n')[0].replace(/^#+\s*/,'').trim().slice(0,60)||`Chunk ${i+1}`,
      content:c.trim(), status:'pending', ts:Date.now(),
    }));
    seamState.title=ti.value||'Spec';
    seamSave(); renderSeam();
    _toOrc('guardian','guardian.seam.parsed',{chunks:seamState.chunks.length,title:seamState.title});
    _toBridge('guardian.seam.parsed',{chunks:seamState.chunks.length});
    toast(`Parsed ${seamState.chunks.length} chunks`,'success',2500);
  };

  const clearBtn=document.createElement('button'); clearBtn.style.cssText='background:none;border:1px solid #1e1e3a;color:#475569;border-radius:2px;padding:2px 7px;font:inherit;font-size:9px;cursor:pointer';
  clearBtn.textContent='✕'; clearBtn.onclick=()=>{if(confirm('Clear SEAM?')){seamState={chunks:[],title:'',sysPrompt:'nexus'};seamSave();renderSeam();}};
  tb.append(ti,parseBtn,clearBtn); a.appendChild(tb);

  if (!seamState.chunks.length) {
    a.innerHTML+='<div style="color:#1e293b;font-size:9px;padding:16px;text-align:center;line-height:1.8">Paste a spec → Parse → inject chunks one by one.<br>Verified chunks push to idearium + cortex.</div>';
    return;
  }

  // Progress
  const done=seamState.chunks.filter(c=>c.status==='verified').length;
  const pct=Math.round(done/seamState.chunks.length*100);
  a.innerHTML+=`<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><div style="flex:1;height:3px;background:#1e1e3a;border-radius:2px;overflow:hidden"><div style="width:${pct}%;height:100%;background:linear-gradient(90deg,#f59e0b,#22c55e);border-radius:2px"></div></div><span style="font-size:9px;color:#475569">${done}/${seamState.chunks.length}</span></div>`;

  // Chunks
  for (const c of seamState.chunks) {
    const div=document.createElement('div');
    const scol={pending:'#334155',verified:'#22c55e',failed:'#ef4444',skipped:'#475569'}[c.status];
    div.style.cssText='padding:5px 8px;border:1px solid #1e1e3a;border-radius:3px;margin-bottom:4px;cursor:pointer';
    if(c.status==='verified')div.style.borderColor='rgba(34,197,94,.3)';
    if(c.status==='failed')div.style.borderColor='rgba(239,68,68,.3)';
    div.innerHTML=`<div style="display:flex;align-items:center;gap:6px"><span style="color:#1e293b;font-size:8px;width:16px">${c.id+1}</span><span style="color:${scol};font-size:9px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(c.title)}</span><span style="color:${scol};font-size:9px">${{pending:'○',verified:'✓',failed:'✗',skipped:'—'}[c.status]}</span></div>`;

    if (c.status!=='verified') {
      const injectBtn=document.createElement('button');
      injectBtn.style.cssText='margin-top:4px;background:none;border:1px solid rgba(245,158,11,.3);color:#f59e0b;border-radius:2px;padding:2px 7px;font:inherit;font-size:8px;cursor:pointer;width:100%';
      injectBtn.textContent=`↗ Inject chunk ${c.id+1}`;
      injectBtn.disabled=!!currentJobId||!isClaimed;
      if(!isClaimed)injectBtn.title='Claim tab first';
      injectBtn.onclick=e=>{
        e.stopPropagation();
        const sysPrompts={nexus:'You are building the NEXUS system. Implement exactly what is described. Do not stub or defer. End with SEAM VERDICT: PASS or FAIL.',seam:'Receive spec, implement, test, report SEAM VERDICT: PASS or FAIL.'};
        const prompt=`${sysPrompts[seamState.sysPrompt]||sysPrompts.nexus}\n\n${c.content}`;
        if(!injectText(prompt)){toast('No input found','error');return;}
        const jid=uid();
        send({type:'GUARDIAN_DELIVERED',jobId:jid,chatUrl:location.href,account:getAccount()});
        startWatch(jid,prompt,0);
        setTimeout(submit,500);
        _toOrc('guardian','guardian.seam.inject',{chunk:c.id,title:c.title,chars:prompt.length});
        toast(`Injecting chunk ${c.id+1}…`,'job',2500);
      };
      div.appendChild(injectBtn);

      const btns=document.createElement('div'); btns.style.cssText='display:flex;gap:4px;margin-top:3px';
      for (const [label,status,col] of [['✓ Pass','verified','#22c55e'],['✗ Fail','failed','#ef4444'],['— Skip','skipped','#475569']]) {
        const b=document.createElement('button');
        b.style.cssText=`flex:1;background:none;border:1px solid ${col}40;color:${col};border-radius:2px;padding:2px 4px;font:inherit;font-size:8px;cursor:pointer`;
        b.textContent=label;
        b.onclick=e=>{
          e.stopPropagation();
          c.status=status; c.verifiedAt=Date.now(); seamSave(); renderSeam();
          if(status==='verified'){
            _toOrc('guardian','guardian.seam.verified',{chunk:c.id,title:c.title});
            _toBridge('guardian.seam.verified',{chunk:c.id,title:c.title});
            _toCortex('guardian.seam.verified', { chunkIdx: c.id, chunkTitle: c.title });
            // Push to idearium
            fetch(`http://127.0.0.1:4800/api/ideas`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:`SEAM ✓ ${c.title}`,tags:['seam','verified'],source:'guardian'})}).catch(()=>{});
          }
        };
        btns.appendChild(b);
      }
      div.appendChild(btns);
    }
    a.appendChild(div);
  }
}

// ── API tab — minimal, power ops ─────────────────────────────────────────────
function renderApi() {
  const a=document.getElementById('__g9api__'); if(!a)return;
  function sec(title) { const d=document.createElement('div'); d.style.cssText='padding:8px 12px 4px;font-size:8px;color:#1e293b;text-transform:uppercase;letter-spacing:.1em;border-top:1px solid rgba(255,255,255,.04)'; d.textContent=title; a.appendChild(d); return a; }
  function row(label,val,col='#e2e8f0') { const d=document.createElement('div');d.style.cssText='display:flex;justify-content:space-between;padding:3px 12px;font-size:9px';d.innerHTML=`<span style="color:#475569">${label}</span><span style="color:${col};font-weight:600">${escHtml(String(val))}</span>`;a.appendChild(d); }
  function btn(label,col,fn) { const b=document.createElement('button');b.style.cssText=`margin:3px 12px;background:none;border:1px solid ${col}40;color:${col};border-radius:3px;padding:3px 10px;font:inherit;font-size:9px;cursor:pointer;display:block;width:calc(100% - 24px)`;b.textContent=label;b.onclick=fn;a.appendChild(b); }
  a.innerHTML='';

  sec('Identity');
  row('Account', getAccount().slice(0,28));
  row('Chat ID',  chatId());
  row('Tab ID',   MY_TAB.slice(-10));
  row('Provider', `${PROVIDER} v${VERSION}`);
  row('Status',   connState, connState==='ready'?'#22c55e':'#ef4444');

  sec('Tab Control');
  row('Claim', isClaimed?'ACTIVE — executing jobs':'PASSIVE — ignoring jobs', isClaimed?'#22c55e':'#f59e0b');
  btn(isClaimed?'Release tab (→ PASSIVE)':'Claim tab (→ ACTIVE)', isClaimed?'#f87171':'#22c55e', ()=>{ isClaimed?releaseTab():claimTab(); renderApi(); });

  sec('Connection');
  row('NCP Channel', NCP_CHANNEL); row('State', connState + ' (NCP/SSE)');
  btn('Reconnect now', '#818cf8', ()=>{ connect(); renderApi(); });

  sec('SEAM state');
  row('Sys prompt', seamState.sysPrompt);
  const spBtn=document.createElement('div'); spBtn.style.cssText='display:flex;gap:4px;padding:3px 12px';
  for (const k of ['nexus','seam','generic']) {
    const b=document.createElement('button');
    b.style.cssText=`flex:1;background:${seamState.sysPrompt===k?'rgba(245,158,11,.15)':'none'};border:1px solid ${seamState.sysPrompt===k?'rgba(245,158,11,.5)':'#1e1e3a'};color:${seamState.sysPrompt===k?'#f59e0b':'#475569'};border-radius:2px;padding:2px;font:inherit;font-size:8px;cursor:pointer`;
    b.textContent=k; b.onclick=()=>{seamState.sysPrompt=k;seamSave();renderApi();};
    spBtn.appendChild(b);
  }
  a.appendChild(spBtn);

  sec('CLI — full power');
  a.innerHTML += `<div class="g9cli" style="margin:6px 12px">These ops live in the NEXUS CLI:<br><b class="g9cli-cmd">nexus> status</b> — all systems health<br><b class="g9cli-cmd">nexus> jobs</b> — job queue<br><b class="g9cli-cmd">nexus> ledger guardian</b> — full ledger<br><b class="g9cli-cmd">nexus> bus guardian</b> — SISO bus log<br><b class="g9cli-cmd">nexus> gaps</b> — all open gaps<br><b class="g9cli-cmd">nexus> dispatch chatgpt &lt;prompt&gt;</b> — queue job<br><span class="g9cli-desc">Run: <b>node cli/nexus-repl.js --repl</b></span></div>`;

  sec('Debug');
  btn('Export log (JSON)', '#6366f1', ()=>{
    const a2=document.createElement('a');
    a2.href=URL.createObjectURL(new Blob([JSON.stringify({log:logEntries,usage:_usageHistory,gaps:currentGaps,artifacts:artifactStore.map(a=>({...a,content:a.content.slice(0,200)}))},null,2)],{type:'application/json'}));
    a2.download=`guardian-${Date.now()}.json`; a2.click();
    toast('Exported','success',2000);
  });
  btn('Scan DOM now', '#6366f1', ()=>{ scanDOM(); toast('Scan complete — check Arts tab','info',2000); });
}

// ── Footer updater ────────────────────────────────────────────────────────────
setInterval(updateFooter, 20000);

// ── Boot ──────────────────────────────────────────────────────────────────────
buildUI();
setConnState('disconnected');
connect();
_log('sys', `Guardian v${VERSION} loaded`, location.hostname);

// Phase 6: version check — fire and forget, never blocks
setTimeout(async function() {
  try {
    var r = await fetch(NCP_URL + '/version', { signal: AbortSignal.timeout(3000) });
    if (!r.ok) return;
    var d = await r.json();
    var serverVer = d.userscript_claude;
    if (serverVer && serverVer !== VERSION) {
      _log('sys', 'Version mismatch — server expects v' + serverVer + ', running v' + VERSION, 'Reinstall userscript from Forge');
      toast('Update available: userscript v' + serverVer + ' (running v' + VERSION + ')', 'warn', 8000);
    }
  } catch(e) {}
}, 4000);

})();
