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
const WS_URL     = 'wss://127.0.0.1:7821';
const API_URL    = 'http://127.0.0.1:7820';
const ORCH_URL   = 'http://127.0.0.1:9000';
const BRIDGE_URL = 'http://127.0.0.1:9999';
const CORTEX_URL = 'http://127.0.0.1:3748';
const PROVIDER   = 'claude';
const VERSION    = '9.0.0';
const RECONNECT_MS = 3000;
const HB_MS        = 8000;
const LOG_MAX      = 300;

// ── State ────────────────────────────────────────────────────────────────────
let ws = null, hb = null, reconnectTimer = null;
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
    fetch(`${BRIDGE_URL}/bridge/broadcast`, { method:'POST', headers:{'Content-Type':'application/json'}, keepalive:true,
      body: JSON.stringify({ type, ...payload, ts:Date.now() }) }).catch(()=>{});
  } catch(_) {}
}
function _toCortex(type, payload = {}) {
  try {
    fetch(`${CORTEX_URL}/api/event`, { method:'POST', headers:{'Content-Type':'application/json'}, keepalive:true,
      body: JSON.stringify({ type, payload, source:'guardian-claude', causedBy:currentJobId, ts:Date.now() }) }).catch(()=>{});
  } catch(_) {}
}
function send(obj) { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj)); }
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
  return document.querySelector('.font-claude-message:last-of-type')
    || document.querySelector('[data-testid="assistant-message"]:last-child')
    || (()=>{ const all=document.querySelectorAll('[class*="assistant"]'); return all.length?all[all.length-1]:null; })()
    || document.querySelector('.prose:last-of-type');
}
function injectText(text) {
  const input = document.querySelector('[contenteditable="true"]');
  if (!input) return false;
  input.focus();
  document.execCommand('selectAll', false, null);
  document.execCommand('delete', false, null);
  const ok = document.execCommand('insertText', false, text);
  if (!ok) { input.textContent = text; input.dispatchEvent(new InputEvent('input',{bubbles:true,data:text,inputType:'insertText'})); }
  return true;
}
function submit() {
  const btn = document.querySelector('button[data-testid="send-button"]:not([disabled])');
  if (btn) { btn.click(); return; }
  const input = document.querySelector('[contenteditable="true"]');
  if (input) input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',keyCode:13,bubbles:true}));
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
let _watchInterval = null, _watchStart = 0;
function stopWatch() {
  clearInterval(_watchInterval); _watchInterval = null;
  currentJobId = null; jobActive = false;
  setJobBar(false);
}
function startWatch(jobId, prompt, retryCount = 0) {
  stopWatch();
  currentJobId = jobId; jobActive = true; _watchStart = Date.now();
  setJobBar(true, prompt, jobId);
  let lastText = '', stable = 0;
  const STABLE_THRESH = 5;
  _watchInterval = setInterval(() => {
    if (!currentJobId) { clearInterval(_watchInterval); return; }
    const el = findResponseEl();
    if (!el) return;
    const text = (el.innerText||el.textContent||'').trim();
    if (text === lastText) {
      stable++;
      if (stable >= STABLE_THRESH) {
        const ms = Date.now() - _watchStart;
        clearInterval(_watchInterval);
        _onJobComplete(jobId, text, ms, prompt, retryCount);
      }
    } else { lastText = text; stable = 0; scheduleScan(); }
  }, 400);
}

function _onJobComplete(jobId, text, ms, prompt, retryCount) {
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
  } else {
    // Clean completion
    sendLedger('UPGRADE', `Job complete · #${jobId.slice(0,8)}`, { jobId, chars:text.length, ms });
    send({ type:'GUARDIAN_COMPLETE', jobId, text, chatUrl:location.href, account:getAccount(), requestId:jobId });
    _toBridge('guardian.job.complete', { jobId, chars:text.length, ms, provider:PROVIDER });
    _toCortex('guardian.job.complete', { jobId, chars:text.length, ms, usage });
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

  _log('job', `Job: ${command}`, `${text.length}ch · #${jobId.slice(0,8)}`);
  toast(`⚡ Job: ${command} · #${jobId.slice(0,8)}`, 'job', 3000);
  sendLedger('INPUT', `Job: ${command} #${jobId.slice(0,8)}`, { jobId, command, chars:text.length });
  _toOrc('guardian','guardian.job.received',{ jobId, command, chars:text.length });
  _toBridge('guardian.job.dispatched', { jobId, command, provider:PROVIDER });

  await gate('handleJob', async () => {
    seenHashes.clear();
    if (!injectText(text)) throw new Error('Input not found — no contenteditable');
    send({ type:'GUARDIAN_DELIVERED', jobId, chatUrl:location.href, account:getAccount(), requestId:jobId });
    setTimeout(() => { submit(); startWatch(jobId, text, 0); }, 500);
    return true;
  }, { jobId });
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
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer=null; }
  setConnState('connecting');
  _log('info', 'Connecting…', WS_URL);
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    setConnState('handshaking');
    ws.send(JSON.stringify({ type:'GUARDIAN_REGISTER', provider:PROVIDER, host:location.hostname, tabId:MY_TAB, claimed:amIClaimed() }));
    hb = setInterval(() => send({ type:'GUARDIAN_HEARTBEAT', provider:PROVIDER, tabId:MY_TAB, ts:Date.now() }), HB_MS);
  };

  ws.onmessage = (e) => {
    let msg; try { msg = JSON.parse(e.data); } catch { _log('err','Bad WS msg'); return; }
    switch (msg.type) {
      case 'GUARDIAN_READY':
        setConnState('ready');
        _log('ok', `Ready · ${msg.provider||PROVIDER}`, WS_URL);
        toast('Guardian connected ✓', 'success', 2000);
        sendLedger('SYSTEM', 'Connected to Guardian');
        _toOrc('guardian','guardian.userscript.connected',{ provider:PROVIDER, account:getAccount() });
        _toBridge('guardian.userscript.connected',{ provider:PROVIDER });
        autoClaimIfFree();
        startObserver();
        setTimeout(scanDOM, 800);
        break;
      case 'GUARDIAN_CLAIM':
        if (msg.tabId===MY_TAB||msg.tabId==='any') { claimTab(); send({type:'GUARDIAN_CLAIM_ACK',tabId:MY_TAB,provider:PROVIDER}); toast('Tab claimed — ACTIVE','success',2000); }
        break;
      case 'GUARDIAN_RELEASE':
        if (msg.tabId===MY_TAB||msg.tabId==='any') { releaseTab(); toast('Tab released — PASSIVE','warn',2000); }
        break;
      case 'GUARDIAN_JOB':
        handleJob(msg);
        break;
      case 'GUARDIAN_HEARTBEAT_ACK':
        break;
      default:
        _log('in', `← ${msg.type}`, JSON.stringify(msg).slice(0,80));
    }
  };

  ws.onclose = (e) => {
    clearInterval(hb); setConnState('disconnected');
    _log('err', `WS closed (${e.code})`, `retry in ${RECONNECT_MS/1000}s`);
    toast(`Guardian disconnected (${e.code})`, 'error', 4000);
    if (currentJobId) stopWatch();
    reconnectTimer = setTimeout(connect, RECONNECT_MS);
  };
  ws.onerror = () => {
    setConnState('disconnected');
    _log('err','WS error');
  };
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
  row('WS URL', WS_URL); row('State', connState);
  btn('Reconnect now', '#818cf8', ()=>{ if(ws)ws.close(); connect(); renderApi(); });

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

})();
