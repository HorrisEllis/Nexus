// ==UserScript==
// @name         Guardian — Claude v8.4 NCP
// @namespace    nexus.guardian.claude
// @version      8.4.0
// @description  Guardian v8.4: NCP (SSE+fetch), no WebSocket, no ws package.
//               Thin DOM client — server owns all state, SEAM, queue, gaps, detector.
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

// ── Config ────────────────────────────────────────────────────────────────────
const API_URL    = 'http://127.0.0.1:7820';   // Guardian HTTP
const NCP_CH     = API_URL + '/channel';       // SSE channel (replaces WSS)
const NCP_RESULT = API_URL + '/result';        // POST results
const NCP_HB     = API_URL + '/heartbeat';     // POST heartbeat
const MEMORY_URL = 'http://127.0.0.1:7823';
const PROVIDER   = 'claude';
const VERSION    = '8.4.0';
const HB_MS      = 8000;
const RECONNECT_MS = 3000;

// ── Tab identity (DOM-side, stays in userscript) ──────────────────────────────
if (!sessionStorage.getItem('g9_tab')) sessionStorage.setItem('g9_tab', `tab_${Date.now()}_${Math.random().toString(36).slice(2,7)}`);
const MY_TAB = sessionStorage.getItem('g9_tab');
const TAB_KEY = 'guardian_claimed_tab_claude';
let isClaimed = false;

function amIClaimed() { return localStorage.getItem(TAB_KEY) === MY_TAB; }
function claimTab() {
  localStorage.setItem(TAB_KEY, MY_TAB); isClaimed = true;
  sessionStorage.setItem('guardian_is_claimed','1');
  updateClaimBadge(); toast('Tab claimed — ACTIVE','success',2000);
  post({ type:'NCP_TAB_CLAIMED', provider:PROVIDER, tabId:MY_TAB });
}
function releaseTab() {
  if (amIClaimed()) localStorage.removeItem(TAB_KEY);
  isClaimed = false; sessionStorage.removeItem('guardian_is_claimed');
  updateClaimBadge();
}
function tryAutoClaim() {
  const ex = localStorage.getItem(TAB_KEY);
  if (!ex) claimTab();
  else if (ex === MY_TAB) { isClaimed = true; sessionStorage.setItem('guardian_is_claimed','1'); updateClaimBadge(); }
  else toast('Another tab claimed — passive mode','info',2000);
}
window.addEventListener('beforeunload', releaseTab);

// ── NCP — SSE for server→browser, fetch for browser→server ───────────────────
let _es = null, _hb = null, connState = 'disconnected';

async function post(data) {
  try {
    await fetch(NCP_RESULT, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        ...data,
        chatUrl: location.href,
        account: getAccount(),
        tabId:   MY_TAB,
        provider: PROVIDER,
        ts: Date.now(),
      }),
      keepalive: true,
    });
  } catch(_) {}
}

function connect() {
  if (_es) { try { _es.close(); } catch(_) {} }
  connState = 'connecting'; updateConnState();
  _es = new EventSource(`${NCP_CH}?provider=${PROVIDER}&tabId=${MY_TAB}`);

  _es.onmessage = e => {
    try { handleServerMsg(JSON.parse(e.data)); } catch(_) {}
  };

  _es.onopen = () => {
    connState = 'ready'; updateConnState();
    // Register with server
    post({ type:'GUARDIAN_REGISTER', claimed: amIClaimed() });
    // Start heartbeat — server tracks BPM from these
    if (_hb) clearInterval(_hb);
    _hb = setInterval(async () => {
      const t0 = Date.now();
      try {
        const r = await fetch(NCP_HB, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ provider:PROVIDER, tabId:MY_TAB, ts:t0 }),
        });
        const ack = await r.json();
        // Server returns latency — update footer
        updateFooter({ latency: ack.latency });
      } catch(_) {}
    }, HB_MS);
    toast('Guardian ready ✓','success',2000);
    tryAutoClaim();
    startDOMObserver();
    interceptDownloads();
    setTimeout(() => { const id = chatIdFromUrl(); if (id && id !== 'home' && isChatBlank()) sendGreeting(id); }, 2000);
  };

  _es.onerror = () => {
    connState = 'disconnected'; updateConnState();
    clearInterval(_hb);
    _es.close();
    setTimeout(connect, RECONNECT_MS);
  };
}

function handleServerMsg(msg) {
  switch(msg.type) {
    case 'NCP_READY':
      connState = 'ready'; updateConnState();
      break;

    case 'GUARDIAN_CLAIM':
      if (msg.tabId === MY_TAB || msg.tabId === 'any') claimTab();
      break;

    case 'GUARDIAN_RELEASE':
      if (msg.tabId === MY_TAB || msg.tabId === 'any') releaseTab();
      break;

    case 'GUARDIAN_JOB':
      // Server dispatches job — userscript injects + submits
      handleJob(msg);
      break;

    case 'GUARDIAN_SESSION_NAMED':
      toast(`Session: "${msg.sessionName}"`, 'success', 4000);
      break;

    case 'NCP_HEARTBEAT_ACK':
      // Handled in heartbeat fetch response
      break;

    default:
      // Unknown message — log to server
      post({ type:'NCP_UNKNOWN_MSG', originalType: msg.type });
  }
}

// ── Job handling (DOM — injects text, polls response) ────────────────────────
let currentJobId = null;

async function handleJob(msg) {
  if (!isClaimed) { toast('Job ignored — tab not claimed','warn',3000); return; }
  const { jobId, prompt, content, command } = msg;
  const text = content ? (prompt ? `${prompt}\n\n${content}` : content) : (prompt || '');
  if (!text.trim()) { post({ type:'GUARDIAN_ERROR', jobId, error:'empty prompt' }); return; }

  toast(`Job: ${command} · #${(jobId||'').slice(0,8)}`, 'job', 3000);
  currentJobId = jobId;
  setJobState(true, text, jobId);

  if (!injectText(text)) {
    post({ type:'GUARDIAN_ERROR', jobId, error:'no contenteditable input found' });
    stopWatch(); return;
  }

  seenArtifactHashes.clear();
  post({ type:'GUARDIAN_DELIVERED', jobId });
  setTimeout(submit, 500);
  startWatch(jobId, text);
}

// ── Response watcher ─────────────────────────────────────────────────────────
let _watchTimer = null;

function stopWatch() {
  currentJobId = null;
  if (_watchTimer) { clearTimeout(_watchTimer); _watchTimer = null; }
  setJobState(false);
}

function startWatch(jobId, prompt) {
  stopWatch(); currentJobId = jobId;
  let lastText = '', stableCount = 0;
  const STABLE = 5;

  function findResponseEl() {
    return document.querySelector('.font-claude-message:last-of-type')
      || document.querySelector('[data-testid="assistant-message"]:last-child')
      || (() => { const a = document.querySelectorAll('[class*="assistant"]'); return a.length ? a[a.length-1] : null; })();
  }

  function poll() {
    if (!currentJobId || currentJobId !== jobId) return;
    const el = findResponseEl();
    if (!el) { _watchTimer = setTimeout(poll, 400); return; }
    const text = el.innerText || el.textContent || '';
    if (text === lastText) {
      stableCount++;
      if (stableCount >= STABLE) {
        // Response complete — send to server
        post({ type:'GUARDIAN_COMPLETE', jobId, text: lastText });
        toast(`Job complete: ${lastText.length} chars`, 'success', 3000);
        stopWatch();
        // Check for SEAM verdict (server handles the chunk verification)
        const v = seamVerdict(lastText);
        if (v) post({ type:'GUARDIAN_SEAM_VERDICT', jobId, verdict:v, text: lastText.slice(0,500) });
        return;
      }
    } else {
      const delta = text.slice(lastText.length);
      if (delta) {
        post({ type:'GUARDIAN_CHUNK', jobId, text: delta });
      }
      lastText = text; stableCount = 0;
    }
    _watchTimer = setTimeout(poll, 500);
  }
  _watchTimer = setTimeout(poll, 1500);
}

function seamVerdict(text) {
  if (/SEAM VERDICT:\s*PASS/i.test(text)) return 'pass';
  if (/SEAM VERDICT:\s*FAIL/i.test(text)) return 'fail';
  return null;
}

// ── DOM scanner — artifacts (DOM-only, must stay in userscript) ───────────────
const seenArtifactHashes = new Set();
let domObserver = null, scanTimer = null;

function scheduleScan() {
  clearTimeout(scanTimer);
  scanTimer = setTimeout(scanDOM, 1500);
}

function scanDOM() {
  const SELECTORS = [
    { selector:'pre code', type:'code_block' },
    { selector:'[class*="artifact"]', type:'artifact' },
  ];
  for (const { selector, type } of SELECTORS) {
    for (const el of document.querySelectorAll(selector)) {
      const content = (el.innerText || el.textContent || '').trim();
      if (!content || content.length < 10) continue;
      const hash = simpleHash(content);
      if (seenArtifactHashes.has(hash)) continue;
      seenArtifactHashes.add(hash);
      const lang = detectLang(el);
      const name = detectArtifactName(el);
      // Send to server — server persists in JAA artifacts table
      post({
        type: 'GUARDIAN_ARTIFACT',
        jobId: currentJobId,
        content: content.slice(0, 4000),
        lang, hash, name,
      });
      toast(`Artifact: ${name.slice(0,30)} [${lang||type}]`, 'info', 2500);
    }
  }
  // Send DOM system scan for Brain tab
  const systems = {};
  for (const sel of [
    ['[data-testid="assistant-message"]','assistant_turn'],
    ['[data-testid="human-message"]','human_turn'],
    ['pre code','code_block'],
  ]) {
    const n = document.querySelectorAll(sel[0]).length;
    if (n) systems[sel[1]] = n;
  }
  post({ type:'GUARDIAN_DOM_SCAN', systems });
}

function startDOMObserver() {
  if (domObserver) return;
  domObserver = new MutationObserver(() => scheduleScan());
  domObserver.observe(document.body, { childList:true, subtree:true });
  setTimeout(scanDOM, 800);
}

// ── File chip detection ───────────────────────────────────────────────────────
const seenChips = new Set();
function detectFileChips() {
  for (const sel of ['[data-testid="file-attachment"]','.file-chip']) {
    for (const chip of document.querySelectorAll(sel)) {
      const name = (chip.getAttribute('aria-label') || chip.textContent || '').trim().slice(0,100);
      if (!name || seenChips.has(name)) continue;
      seenChips.add(name);
      post({ type:'GUARDIAN_FILE_UPLOAD', files:[{ name }] });
    }
  }
}

// ── Download intercept ────────────────────────────────────────────────────────
function interceptDownloads() {
  document.addEventListener('click', e => {
    const a = e.target.closest('a[download],a[href*="blob:"]');
    if (!a) return;
    const filename = a.getAttribute('download') || a.href.split('/').pop() || 'download';
    post({ type:'GUARDIAN_DOWNLOAD', filename, href: a.href, jobId: currentJobId });
    toast(`Download: ${filename}`, 'info', 2500);
  }, true);
}

// ── Session greeting ──────────────────────────────────────────────────────────
const greetedChats = new Set((() => { try { return JSON.parse(sessionStorage.getItem('g9_greeted')||'[]'); } catch(_) { return []; } })());
const DEFAULT_GREETING = 'Guardian session initialising. Please ask me: "What are we calling this session?" — then wait for my answer before we begin.';

function isChatBlank() { return document.querySelectorAll('[data-testid="assistant-message"]').length === 0; }

async function sendGreeting(chatId) {
  if (greetedChats.has(chatId)) return;
  greetedChats.add(chatId);
  try { sessionStorage.setItem('g9_greeted', JSON.stringify([...greetedChats])); } catch(_) {}
  let attempts = 0;
  function tryInject() {
    attempts++;
    if (attempts > 20 || !isChatBlank()) return;
    setTimeout(() => {
      if (injectText(DEFAULT_GREETING)) {
        post({ type:'GUARDIAN_GREETING_INJECTED', chatId });
        setTimeout(submit, 600);
        watchForSessionName(chatId);
      } else setTimeout(tryInject, 500);
    }, 300);
  }
  setTimeout(tryInject, 1200);
}

function watchForSessionName(chatId) {
  let n = 0;
  function poll() {
    n++; if (n > 60) return;
    const msgs = document.querySelectorAll('[data-testid="assistant-message"]');
    if (!msgs.length) { setTimeout(poll,500); return; }
    const text = (msgs[msgs.length-1].innerText||'').trim();
    if (text.length < 10) { setTimeout(poll,500); return; }
    const m = text.match(/[""]([^""]{3,60})[""]/)
      || text.match(/calling (?:this |it )?["']?([A-Z][^.!?\n]{2,50})["']?/i);
    if (m) {
      const name = m[1].trim();
      toast(`Session: "${name}"`, 'success', 4000);
      post({ type:'GUARDIAN_SESSION_NAMED', chatId, sessionName: name });
    }
  }
  setTimeout(poll, 2000);
}

// ── Navigation watcher ────────────────────────────────────────────────────────
let lastPath = location.pathname, lastChat = chatIdFromUrl();
function onNavigate() {
  const np = location.pathname, nc = chatIdFromUrl();
  if (np === lastPath) return; lastPath = np;
  if (nc && nc !== 'home' && nc !== lastChat) {
    lastChat = nc;
    toast(`New chat: ${nc.slice(0,8)}`, 'info', 2000);
    setTimeout(() => { if (isChatBlank()) sendGreeting(nc); }, 800);
  }
}
function startNavWatcher() {
  setInterval(onNavigate, 500);
  const op = history.pushState.bind(history), or = history.replaceState.bind(history);
  history.pushState = (...a) => { op(...a); setTimeout(onNavigate,100); };
  history.replaceState = (...a) => { or(...a); setTimeout(onNavigate,100); };
  window.addEventListener('popstate', () => setTimeout(onNavigate,100));
}

// ── DOM utils ─────────────────────────────────────────────────────────────────
function injectText(text) {
  const input = document.querySelector('[contenteditable="true"]');
  if (!input) return false;
  input.focus();
  document.execCommand('selectAll', false, null);
  document.execCommand('delete', false, null);
  const ok = document.execCommand('insertText', false, text);
  if (!ok) {
    input.textContent = text;
    input.dispatchEvent(new InputEvent('input', { bubbles:true, data:text, inputType:'insertText' }));
  }
  return true;
}

function submit() {
  const btn = document.querySelector('button[data-testid="send-button"]:not([disabled])');
  if (btn) { btn.click(); return; }
  const input = document.querySelector('[contenteditable="true"]');
  if (input) input.dispatchEvent(new KeyboardEvent('keydown', { key:'Enter', keyCode:13, bubbles:true }));
}

function simpleHash(s) { let h=0; for(let i=0;i<s.length;i++){h=((h<<5)-h)+s.charCodeAt(i);h|=0;} return Math.abs(h).toString(16).slice(0,8); }
function chatIdFromUrl() { const m = location.pathname.match(/\/chat\/([a-zA-Z0-9_-]+)/); return m ? m[1] : 'home'; }
function getAccount() {
  for (const sel of ['[data-testid="user-email"]','[data-testid="account-email"]','nav [title*="@"]']) {
    const el = document.querySelector(sel);
    if (el) { const t = (el.getAttribute('title')||el.textContent||'').trim(); if (t.includes('@')) return t.slice(0,60); }
  }
  return location.hostname;
}
function detectLang(el) {
  const c = el.tagName==='CODE' ? el : el.querySelector('code');
  if (c) { const cl = Array.from(c.classList).find(x=>x.startsWith('language-')); if(cl) return cl.replace('language-',''); }
  return null;
}
function detectArtifactName(el) {
  const p = el.closest('[class*="artifact"]') || el.parentElement;
  if (p) { const t = p.querySelector('[class*="title"]'); if(t) return t.textContent.trim().slice(0,120); }
  const first = (el.innerText||'').split('\n')[0].trim();
  const m = first.match(/^(?:\/\/|#|--|<!--)?\s*([\w.\-/ ]+\.\w{1,6})/);
  if (m) return m[1].trim();
  return detectLang(el) ? `${detectLang(el)} block` : 'artifact';
}

// ── Minimal pill UI ────────────────────────────────────────────────────────────
// v8.4 philosophy: the full UI lives in Forge (http://localhost:7820/cockpit)
// The pill is a status indicator + quick actions only.
// All SEAM/Queue/Brain/Settings panels are in Forge.

let toastTimer = null;
function toast(msg, type='info', dur=3000) {
  let el = document.getElementById('__g9toast__');
  if (!el) {
    el = document.createElement('div');
    el.id = '__g9toast__';
    Object.assign(el.style, {
      position:'fixed', bottom:'72px', right:'20px', zIndex:'2147483648',
      maxWidth:'340px', padding:'8px 13px', borderRadius:'6px',
      fontFamily:"'SF Mono','Fira Code',monospace", fontSize:'11px',
      fontWeight:'500', lineHeight:'1.4', pointerEvents:'none',
      transition:'opacity .25s,transform .25s', opacity:'0', transform:'translateY(6px)',
    });
    document.body.appendChild(el);
  }
  const S = {
    success:{ bg:'rgba(34,197,94,.13)',  b:'rgba(34,197,94,.4)',  c:'#86efac', i:'✓' },
    error:  { bg:'rgba(239,68,68,.13)',  b:'rgba(239,68,68,.4)',  c:'#fca5a5', i:'✗' },
    warn:   { bg:'rgba(245,158,11,.13)', b:'rgba(245,158,11,.4)', c:'#fde68a', i:'⚠' },
    info:   { bg:'rgba(96,165,250,.1)',  b:'rgba(96,165,250,.35)',c:'#93c5fd', i:'·' },
    job:    { bg:'rgba(167,139,250,.1)', b:'rgba(167,139,250,.35)',c:'#c4b5fd',i:'⚡' },
  };
  const s = S[type] || S.info;
  el.textContent = `${s.i} ${msg}`;
  Object.assign(el.style, { background:s.bg, border:`1px solid ${s.b}`, color:s.c, opacity:'1', transform:'translateY(0)' });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.style.opacity='0'; }, dur);
}

function buildPill() {
  const st = document.createElement('style');
  st.textContent = `
    #__g9root__{position:fixed;bottom:16px;right:16px;z-index:2147483647;font-family:'SF Mono','Fira Code',monospace;font-size:11px;user-select:none}
    #__g9pill__{display:flex;align-items:center;gap:7px;background:rgba(15,15,20,.92);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,.08);border-radius:20px;padding:5px 12px 5px 8px;cursor:pointer;box-shadow:0 4px 20px rgba(0,0,0,.5)}
    @keyframes g9pulse{0%,100%{opacity:1}50%{opacity:.4}}
    #__g9jobdot__{animation:g9pulse 1.2s ease-in-out infinite;display:none}
  `;
  document.head.appendChild(st);

  const root = document.createElement('div'); root.id = '__g9root__';
  const pill = document.createElement('div'); pill.id = '__g9pill__';

  const dot    = document.createElement('div');
  dot.id = '__g9dot__';
  Object.assign(dot.style, { width:'7px', height:'7px', borderRadius:'50%', background:'#888', transition:'background .4s', flexShrink:'0' });

  const jdot   = document.createElement('div');
  jdot.id = '__g9jobdot__';
  Object.assign(jdot.style, { width:'6px', height:'6px', borderRadius:'50%', background:'#fbbf24', flexShrink:'0' });

  const lbl = document.createElement('span');
  Object.assign(lbl.style, { color:'#cbd5e1', fontSize:'11px', fontWeight:'500' });
  lbl.textContent = 'Guardian';

  const prov = document.createElement('span');
  Object.assign(prov.style, { color:'#475569', fontSize:'10px', borderLeft:'1px solid rgba(255,255,255,.1)', paddingLeft:'7px' });
  prov.textContent = `claude v${VERSION}`;

  const claim = document.createElement('span');
  claim.id = '__g9claim__';
  Object.assign(claim.style, { fontSize:'9px', padding:'1px 6px', borderRadius:'8px', fontWeight:'700', letterSpacing:'.05em', transition:'all .3s', background:'rgba(100,116,139,.12)', color:'#64748b' });
  claim.textContent = 'PASSIVE';

  const forge = document.createElement('span');
  Object.assign(forge.style, { fontSize:'9px', padding:'1px 6px', borderRadius:'8px', background:'rgba(99,102,241,.15)', color:'#818cf8', cursor:'pointer', marginLeft:'2px', border:'1px solid rgba(99,102,241,.3)' });
  forge.textContent = 'Forge';
  forge.title = 'Open Forge IDE';
  forge.onclick = e => { e.stopPropagation(); window.open('http://127.0.0.1:7820/cockpit', '_blank'); };

  const connLbl = document.createElement('span');
  connLbl.id = '__g9conn__';
  Object.assign(connLbl.style, { fontSize:'9px', color:'#334155' });
  connLbl.textContent = 'NCP';

  pill.append(dot, jdot, lbl, prov, claim, forge, connLbl);
  pill.onclick = () => {
    // Single click: toggle tab claim
    if (!isClaimed) claimTab(); else releaseTab();
  };
  root.appendChild(pill);
  document.body.appendChild(root);
}

function updateConnState() {
  const colors = { ready:'#22c55e', connecting:'#f59e0b', disconnected:'#ef4444' };
  const d = document.getElementById('__g9dot__');
  if (d) d.style.background = colors[connState] || '#888';
  const c = document.getElementById('__g9conn__');
  if (c) c.textContent = connState.toUpperCase();
}

function updateClaimBadge() {
  const b = document.getElementById('__g9claim__');
  if (!b) return;
  b.textContent = isClaimed ? 'ACTIVE' : 'PASSIVE';
  b.style.color = isClaimed ? '#22c55e' : '#64748b';
  b.style.background = isClaimed ? 'rgba(34,197,94,.12)' : 'rgba(100,116,139,.12)';
}

function setJobState(active, prompt, jobId) {
  const jd = document.getElementById('__g9jobdot__');
  if (jd) jd.style.display = active ? 'block' : 'none';
}

let _footerLatency = null;
function updateFooter(data = {}) {
  if (data.latency) _footerLatency = data.latency;
}

// ── Init ──────────────────────────────────────────────────────────────────────
function init() {
  buildPill();
  connect();
  startNavWatcher();
  toast(`Guardian v${VERSION} — NCP`, 'info', 2500);
  // Poll server for settings every 60s
  setInterval(async () => {
    try {
      const r = await fetch(API_URL + '/settings');
      const data = await r.json();
      if (data.settings) {
        // Apply relevant settings
        const hbMs = parseInt(data.settings.hb_interval_ms);
        if (hbMs && _hb) { clearInterval(_hb); /* will restart on next connect */ }
      }
    } catch(_) {}
  }, 60000);
}

if (document.readyState === 'complete') setTimeout(init, 500);
else window.addEventListener('load', () => setTimeout(init, 500));

})();
