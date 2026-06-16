// ==UserScript==
// @name         Guardian — ChatGPT v9.0
// @namespace    nexus.guardian.chatgpt
// @version      9.1.0
// @description  Guardian v9: IndexedDB kernel, SHA-256 dedup, pre-prompt intelligence
//               injection, full system widget, SEAM, queue, tags — same architecture as claude v10.
// @author       James Brooks / Nexus
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      *
// @run-at       document-idle
// ==/UserScript==

(function () {
'use strict';

// ── Constants ─────────────────────────────────────────────────────────────────
const NCP_URL    = 'http://127.0.0.1:7820';
const NCP_CH     = NCP_URL + '/channel';
const NCP_RESULT = NCP_URL + '/result';
const NCP_HB     = NCP_URL + '/heartbeat';
const CORTEX_URL = 'http://127.0.0.1:3748';
const ORCH_URL   = 'http://127.0.0.1:9000';
const PROVIDER   = 'chatgpt';
const VERSION    = '9.1.0';
const RECONNECT_MS = 3000;
const HB_MS        = 8000;

// ── Tab identity ──────────────────────────────────────────────────────────────
const MY_TAB = sessionStorage.getItem('gd_cgpt_id') || (() => {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
  sessionStorage.setItem('gd_cgpt_id', id); return id;
})();
const TAB_KEY = 'guardian_claimed_tab_chatgpt';

// ── Runtime state ─────────────────────────────────────────────────────────────
let _es = null, _hb = null, _reconnectTimer = null;
let connState = 'disconnected';
let currentJobId = null, jobActive = false;
let _watchTimer = null, _watchObs = null, _watchStart = 0;
let panelOpen = false, activeTab = 'log';
let isClaimed = false;
let sessionStart = Date.now(), sessionTokens = 0, sessionJobs = 0;
let logEntries = [], unreadCount = 0;
let currentGaps = [], artifactStore = [], _usageHistory = [];
let accountState = null;
let _settings = {};
let _systemStatus = {};
let _intelligenceCtx = null;
let _seenHashes = new Set();

// ── IndexedDB Kernel — §US-02 ─────────────────────────────────────────────────
const IDB_NAME = 'nexus_guardian_chatgpt';
let _db = null;
function dbOpen() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('requests')) {
        const s = db.createObjectStore('requests', { keyPath:'uuid' });
        s.createIndex('status','status'); s.createIndex('sessionId','sessionId');
      }
      if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions', { keyPath:'sessionId' });
      if (!db.objectStoreNames.contains('artifacts')) {
        const a = db.createObjectStore('artifacts', { keyPath:'hash' });
        a.createIndex('jobId','jobId'); a.createIndex('ts','ts');
      }
    };
    req.onsuccess = e => { _db = e.target.result; res(_db); };
    req.onerror   = e => rej(e.target.error);
  });
}
function dbPut(store, obj) {
  if (!_db) return Promise.resolve(null);
  return new Promise((res,rej)=>{ const tx=_db.transaction(store,'readwrite'); const req=tx.objectStore(store).put(obj); req.onsuccess=()=>res(req.result); req.onerror=e=>rej(e.target.error); });
}
function dbGet(store, key) {
  if (!_db) return Promise.resolve(null);
  return new Promise((res,rej)=>{ const tx=_db.transaction(store,'readonly'); const req=tx.objectStore(store).get(key); req.onsuccess=()=>res(req.result||null); req.onerror=e=>rej(e.target.error); });
}
function dbGetAll(store, idx, val) {
  if (!_db) return Promise.resolve([]);
  return new Promise((res,rej)=>{ const tx=_db.transaction(store,'readonly'); const s=tx.objectStore(store); const req=idx?s.index(idx).getAll(val):s.getAll(); req.onsuccess=()=>res(req.result||[]); req.onerror=e=>rej(e.target.error); });
}

// ── SHA-256 dedup — §US-05 ────────────────────────────────────────────────────
async function sha256(text) {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,16);
  } catch(_) {
    let h=0; for(let i=0;i<text.length;i++){h=Math.imul(31,h)+text.charCodeAt(i)|0;} return Math.abs(h).toString(16).padStart(8,'0');
  }
}

// ── Session UUID chain — §IDENTITY-03 ────────────────────────────────────────
let _sessionId = null;
async function getSessionId() {
  if (_sessionId) return _sessionId;
  const key = location.pathname;
  const stored = await dbGet('sessions', key);
  if (stored) { _sessionId = stored.sessionId; return _sessionId; }
  _sessionId = `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  await dbPut('sessions', { sessionId:_sessionId, chatPath:key, provider:PROVIDER, startedAt:Date.now() });
  return _sessionId;
}

// ── Replay — §US-03 ───────────────────────────────────────────────────────────
async function replayPending() {
  const pending = await dbGetAll('requests','status','pending');
  if (!pending.length) return;
  _log('sys', `Replaying ${pending.length} pending`);
  for (const r of pending) {
    ncpPost(NCP_RESULT, { type:'GUARDIAN_REPLAY', ...r }).catch(()=>{});
    await dbPut('requests', { ...r, status:'replayed', replayedAt:Date.now() });
  }
}

// ── Utils ─────────────────────────────────────────────────────────────────────
function uid()  { return Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
function fts(ts){ return new Date(ts).toTimeString().slice(0,8); }
function escHtml(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function estimateTokens(s){ return Math.max(1,Math.round((s||'').length/4)); }
function chatIdFromUrl(){ const m=location.pathname.match(/\/c\/([a-zA-Z0-9_-]+)/); return m?m[1]:'home'; }
function getAccount() {
  if (accountState) return accountState;
  const sels=['[data-testid="user-email"]','[data-testid="account-email"]','.account-email','[aria-label*="@"]','nav [title*="@"]'];
  for (const sel of sels) { const el=document.querySelector(sel); if(el){const t=(el.getAttribute('aria-label')||el.getAttribute('title')||el.textContent||'').trim(); if(t.includes('@')||t.length>3){accountState=t.slice(0,60);return accountState;}}}
  return location.hostname;
}
function detectLang(el) {
  const c=el.tagName==='CODE'?el:el.querySelector('code');
  if(c){const cl=Array.from(c.classList).find(x=>x.startsWith('language-'));if(cl)return cl.replace('language-','');}
  return null;
}

// ── Tab claim ─────────────────────────────────────────────────────────────────
function amIClaimed(){ return GM_getValue(TAB_KEY,'')===MY_TAB; }
function claimTab()  { GM_setValue(TAB_KEY,MY_TAB); isClaimed=true; updatePill(); }
function releaseTab(){ if(amIClaimed())GM_setValue(TAB_KEY,''); isClaimed=false; updatePill(); }
function autoClaimIfFree(){
  const ex=GM_getValue(TAB_KEY,'');
  if(!ex){claimTab();return;}
  const last=GM_getValue('gd_hb_'+ex,0);
  if(Date.now()-last>15000){GM_setValue(TAB_KEY,'');claimTab();}
}
setInterval(()=>GM_setValue('gd_hb_'+MY_TAB,Date.now()),5000);

// ── Bus ───────────────────────────────────────────────────────────────────────
function _toCortex(type, payload={}) {
  fetch(CORTEX_URL+'/api/event',{method:'POST',headers:{'Content-Type':'application/json'},keepalive:true,
    body:JSON.stringify({type,payload:{...payload,_account:getAccount(),_chatUrl:location.href},
      source:'userscript-chatgpt',causedBy:currentJobId||null,ts:Date.now()})}).catch(()=>{});
}
function _toOrc(system,type,payload={}){
  fetch(ORCH_URL+'/api/ledger',{method:'POST',headers:{'Content-Type':'application/json'},keepalive:true,
    body:JSON.stringify({system,type,payload})}).catch(()=>{});
}
function _toBridge(type,payload={}){
  fetch(NCP_URL+'/result',{method:'POST',headers:{'Content-Type':'application/json'},keepalive:true,
    body:JSON.stringify({type,...payload,ts:Date.now()})}).catch(()=>{});
}

// ── Gate ──────────────────────────────────────────────────────────────────────
async function gate(name,fn,opts={}) {
  const {jobId=null}=opts; const t0=Date.now();
  try { const r=await fn(); _log('ok',`✓ ${name}`,`${Date.now()-t0}ms`); return {ok:true,result:r}; }
  catch(e) {
    const msg=`${name}: ${e.message}`;
    _log('err',`§1.2 GATE FAIL: ${name}`,e.message); toast(msg,'error',4000);
    if(jobId) send({type:'GUARDIAN_ERROR',jobId,gate:name,error:msg,chatUrl:location.href,account:getAccount()});
    _toCortex('guardian.gate.failed',{gate:name,error:e.message});
    return {ok:false,error:msg};
  }
}

// ── Intelligence context — §US-04 ────────────────────────────────────────────
async function pullIntelligenceContext(intent, command) {
  try {
    const url=`${CORTEX_URL}/api/intelligence/context?intent=${encodeURIComponent((intent||'').slice(0,120))}&command=${encodeURIComponent(command||'')}&provider=${PROVIDER}`;
    const r=await fetch(url,{signal:AbortSignal.timeout(3000)});
    if(!r.ok) return null;
    _intelligenceCtx=await r.json(); return _intelligenceCtx;
  } catch(_){return null;}
}
function buildContextHeader(ctx) {
  if(!ctx) return '';
  const parts=[];
  if(ctx.failureModes?.length){
    const modes=ctx.failureModes.slice(0,3).map(f=>`  - ${f.faultClass} (×${f.count})`).join('\n');
    parts.push(`[KNOWN FAILURE MODES]\n${modes}`);
  }
  if(ctx.reuse?.length){
    const items=ctx.reuse.slice(0,2).map(r=>`  - ${r.lang||'?'} #${r.hash}: ${r.intent||''}`).join('\n');
    parts.push(`[REUSABLE ARTIFACTS]\n${items}`);
  }
  if(ctx.systemState?.criticalGaps>0) parts.push(`[SYSTEM] ${ctx.systemState.criticalGaps} critical gaps open`);
  return parts.length?`[NEXUS CONTEXT]\n${parts.join('\n')}\n\n`:'';
}

// ── Log ───────────────────────────────────────────────────────────────────────
function _log(type,msg,detail) {
  const T={info:{c:'#94a3b8',i:'·'},in:{c:'#60a5fa',i:'↓'},out:{c:'#a78bfa',i:'↑'},
    ok:{c:'#34d399',i:'✓'},err:{c:'#f87171',i:'✗'},job:{c:'#fbbf24',i:'⚡'},
    gap:{c:'#f472b6',i:'△'},sys:{c:'#818cf8',i:'◈'},debug:{c:'#334155',i:'·'}};
  const t=T[type]||T.info;
  const entry={ts:Date.now(),type,msg,detail:detail||null,color:t.c,icon:t.i};
  logEntries.push(entry); if(logEntries.length>300)logEntries.shift();
  if(panelOpen&&activeTab==='log') _appendLogRow(entry);
  else { unreadCount++; _setBadge(unreadCount); }
}
function toast(msg,type='info',ms=3000) {
  const C={success:'#34d399',error:'#f87171',warn:'#f59e0b',job:'#fbbf24',info:'#818cf8'};
  const el=document.createElement('div');
  el.style.cssText=`position:fixed;bottom:80px;right:20px;z-index:2147483647;background:rgba(8,8,14,.95);border:1px solid ${C[type]||C.info}44;color:${C[type]||C.info};padding:8px 14px;border-radius:6px;font:600 11px 'SF Mono',monospace;box-shadow:0 4px 20px rgba(0,0,0,.6);max-width:340px;animation:gfadein .12s ease`;
  el.textContent=msg; document.body.appendChild(el); setTimeout(()=>el.remove(),ms);
}

// ── Streaming ─────────────────────────────────────────────────────────────────
let _streamBuf='', _streamCnt=0;
function _streamToCortex(jobId,delta,full) {
  _streamBuf+=delta; _streamCnt++;
  if(_streamBuf.length<400&&_streamCnt%5!==0&&!/[.!?\n]$/.test(delta))return;
  const batch=_streamBuf; _streamBuf='';
  _toCortex('guardian.job.stream',{jobId,provider:PROVIDER,text:batch.slice(0,2000),chars:batch.length,fullLen:(full||'').length});
}
function recordUsage(jobId,text,ms) {
  const tokens=estimateTokens(text); sessionTokens+=tokens; sessionJobs++;
  const u={jobId,chatId:chatIdFromUrl(),chars:text.length,tokens,ms,ts:Date.now(),retried:false};
  _usageHistory.push(u); if(_usageHistory.length>50)_usageHistory.shift(); return u;
}

// ── Artifact capture — §US-05 ─────────────────────────────────────────────────
async function scanArtifacts(jobId) {
  const els=document.querySelectorAll('pre code,[class*="CodeBlock"] code,[class*="code-block"] code');
  for(const el of els){
    const content=(el.innerText||el.textContent||'').trim();
    if(content.length<50)continue;
    const hash=await sha256(content);
    if(_seenHashes.has(hash))continue;
    const existing=await dbGet('artifacts',hash);
    if(existing){_seenHashes.add(hash);continue;}
    _seenHashes.add(hash);
    const lang=detectLang(el)||'text';
    const art={hash,lang,content:content.slice(0,4000),jobId,provider:PROVIDER,sessionId:await getSessionId(),ts:Date.now()};
    await dbPut('artifacts',art);
    artifactStore.push(art); if(artifactStore.length>200)artifactStore.shift();
    send({type:'GUARDIAN_ARTIFACT',jobId,content:art.content,lang,hash,chatUrl:location.href,account:getAccount()});
    _toCortex('guardian.artifact',{jobId,hash,lang,chars:content.length});
    _log('ok',`Artifact: ${lang} ${hash}`,`${content.length}ch`);
  }
}

// ── DOM helpers — ChatGPT specific ───────────────────────────────────────────
function findResponseEl() {
  const msgs=document.querySelectorAll('[data-message-author-role="assistant"]');
  return msgs.length ? msgs[msgs.length-1] : null;
}
function _isGenerating() { return !!document.querySelector('[class*="result-streaming"],.result-streaming'); }
function injectText(text) {
  const ce=document.querySelector('[contenteditable="true"]');
  if(ce){ce.focus();document.execCommand('selectAll',false,null);document.execCommand('insertText',false,text);
    if(!ce.textContent.includes(text.slice(0,20))){ce.textContent=text;ce.dispatchEvent(new Event('input',{bubbles:true}));}
    return true;}
  const ta=document.querySelector('textarea#prompt-textarea')||document.querySelector('textarea');
  if(ta){ta.focus();const nativeSetter=Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set;
    nativeSetter.call(ta,text);ta.dispatchEvent(new Event('input',{bubbles:true}));return true;}
  return false;
}
function submit() {
  const btn=document.querySelector('button[data-testid="send-button"]:not([disabled])')||
            document.querySelector('button[aria-label="Send prompt"]:not([disabled])');
  if(btn){btn.click();return;}
  const input=document.querySelector('[contenteditable="true"]')||document.querySelector('textarea');
  if(input)input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',keyCode:13,which:13,bubbles:true,cancelable:true}));
}
function sendDOMMap() {
  if(connState!=='ready')return;
  const nodes=Array.from(document.querySelectorAll('[data-message-author-role]')).slice(0,20).map(el=>({
    tag:el.tagName,role:el.getAttribute('data-message-author-role')||null,text:(el.innerText||'').slice(0,60),
  }));
  send({type:'NEXUS_DOM_MAP',provider:PROVIDER,tabId:MY_TAB,nodes,context:{url:location.href,chatId:chatIdFromUrl(),ts:Date.now()}});
}

// ── Gap detection ─────────────────────────────────────────────────────────────
function detectResponseErrors(text) {
  const issues=[];
  if(/\bcannot\s+assist|\bunable\s+to\s+help\b/i.test(text))issues.push({type:'refusal',score:0.9,reason:'refusal'});
  if(/\bcontext\s+window\b|\btoken\s+limit\b|\btoo\s+long\b/i.test(text))issues.push({type:'context_limit',score:0.9,reason:'context limit'});
  if(text.length<80&&jobActive)issues.push({type:'truncation',score:0.7,reason:'very short'});
  if((text.match(/```/g)||[]).length%2!==0)issues.push({type:'unclosed_code_block',score:0.8,reason:'unclosed code'});
  return issues;
}
function autoRetry(jobId,text,retryCount) {
  const issue=detectResponseErrors(text)[0];
  if(!issue||retryCount>=2)return;
  const prompts={context_limit:'Context limit reached. Please summarise what was done and list what remains.',
    truncation:'Your response was cut off. Continue from exactly where you stopped.',
    unclosed_code_block:'Your last code block was unclosed. Please complete it.',
    refusal:'Please provide the technical assistance requested.'};
  const retry=prompts[issue.type]||`Issue: ${issue.type}. Please revise.`;
  _log('gap',`Auto-retry: ${issue.type}`,`attempt ${retryCount+1}`);
  setTimeout(()=>{ if(!injectText(retry))return; _usageHistory[_usageHistory.length-1].retried=true; setTimeout(submit,500); startWatch(jobId,retry,retryCount+1); },1000);
}

// ── Watch ─────────────────────────────────────────────────────────────────────
function stopWatch() {
  if(_watchObs){_watchObs.disconnect();_watchObs=null;}
  if(_watchTimer){clearTimeout(_watchTimer);_watchTimer=null;}
  currentJobId=null; jobActive=false; setJobBar(false);
}
function startWatch(jobId,prompt,retryCount=0) {
  stopWatch(); currentJobId=jobId; jobActive=true; _watchStart=Date.now();
  setJobBar(true,prompt,jobId);
  let lastText='',stableCount=0,_lastChunkLen=0;
  function checkStable() {
    if(!currentJobId||currentJobId!==jobId)return;
    const el=findResponseEl();
    if(!el){_watchTimer=setTimeout(checkStable,600);return;}
    const text=(el.innerText||el.textContent||'').trim();
    if(text===lastText&&!_isGenerating()){
      stableCount++;
      if(stableCount>=3){const ms=Date.now()-_watchStart;_onJobComplete(jobId,text,ms,prompt,retryCount);return;}
    } else {
      if(text.length>_lastChunkLen){const delta=text.slice(_lastChunkLen);_lastChunkLen=text.length;
        if(delta.length>10||/[.!?\n]/.test(delta)){send({type:'GUARDIAN_CHUNK',jobId,text:delta,full:text,provider:PROVIDER,chatUrl:location.href,ts:Date.now()});_streamToCortex(jobId,delta,text);}}
      lastText=text;stableCount=0;
    }
    _watchTimer=setTimeout(checkStable,300);
  }
  const target=document.querySelector('main')||document.body;
  _watchObs=new MutationObserver(()=>{stableCount=0;if(_watchTimer){clearTimeout(_watchTimer);_watchTimer=null;}_watchTimer=setTimeout(checkStable,300);});
  _watchObs.observe(target,{childList:true,subtree:true,characterData:true});
  _watchTimer=setTimeout(checkStable,1500);
}
async function _onJobComplete(jobId,text,ms,prompt,retryCount) {
  stopWatch();
  send({type:'GUARDIAN_LEDGER_WRITE',jobId,category:'UPGRADE',msg:`Complete · ${text.length}ch · ${Math.round(ms/1000)}s`,meta:{jobId,chars:text.length,ms,provider:PROVIDER,ts:Date.now()}});
  _log('ok',`Complete · ${text.length}ch`,`${Math.round(ms/1000)}s · #${jobId.slice(0,8)}`);
  toast(`Done: ${text.length}ch in ${Math.round(ms/1000)}s`,'success',3500);
  const usage=recordUsage(jobId,text,ms);
  await scanArtifacts(jobId);
  await dbPut('requests',{uuid:jobId,status:'fulfilled',completedAt:Date.now(),sessionId:await getSessionId()});
  const issues=detectResponseErrors(text);
  if(issues.length){currentGaps=[...issues,...currentGaps].slice(0,100);if(retryCount===0)autoRetry(jobId,text,retryCount);send({type:'GUARDIAN_GAPS',jobId,gaps:issues,chatUrl:location.href,account:getAccount()});_toCortex('cortex.gap.found',{jobId,gaps:issues});}
  send({type:'GUARDIAN_COMPLETE',jobId,text,chatUrl:location.href,account:getAccount(),requestId:jobId});
  _toCortex('guardian.job.complete',{jobId,chars:text.length,ms,usage});
  _toBridge('guardian.job.complete',{jobId,chars:text.length,ms,provider:PROVIDER});
  if(panelOpen)renderActiveTab();
}

// ── Job handler ───────────────────────────────────────────────────────────────
async function handleJob(msg) {
  if(!isClaimed){_log('info','Job ignored — PASSIVE',msg.jobId?.slice(0,8));toast('Job ignored — not claimed','warn',3000);return;}
  const{jobId,prompt='',content='',command=''}=msg;
  const text=content?(prompt?`${prompt}\n\n${content}`:content):prompt;
  if(!text.trim()){_log('err','Empty job','skipping');return;}
  const sessionId=await getSessionId();
  await dbPut('requests',{uuid:jobId,status:'pending',command,promptLen:text.length,sessionId,provider:PROVIDER,createdAt:Date.now()});
  send({type:'GUARDIAN_LEDGER_WRITE',jobId,category:'INPUT',msg:`Job: ${command} #${jobId.slice(0,8)}`,meta:{jobId,command,chars:text.length,provider:PROVIDER,chatUrl:location.href,ts:Date.now()}});
  _log('job',`Job: ${command}`,`${text.length}ch · #${jobId.slice(0,8)}`);
  toast(`⚡ ${command} · #${jobId.slice(0,8)}`,'job',3000);
  _toCortex('agent.call.start',{jobId,provider:PROVIDER,command,promptLen:text.length});
  _toBridge('guardian.job.dispatched',{jobId,command,provider:PROVIDER});
  await gate('handleJob',async()=>{
    const intel=await pullIntelligenceContext(text,command);
    const hdr=buildContextHeader(intel);
    const finalText=hdr+text;
    if(!injectText(finalText))throw new Error('Input not found');
    send({type:'GUARDIAN_DELIVERED',jobId,chatUrl:location.href,account:getAccount(),requestId:jobId});
    await dbPut('requests',{uuid:jobId,status:'dispatched',sessionId,dispatchedAt:Date.now()});
    setTimeout(()=>{submit();startWatch(jobId,text,0);},500);
    return true;
  },{jobId});
}

// ── NCP ───────────────────────────────────────────────────────────────────────
async function ncpPost(url,data) {
  try { const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},keepalive:true,body:JSON.stringify({...data,chatUrl:location.href,account:getAccount()})}); return res.ok?await res.json():null; }
  catch(_){return null;}
}
function send(obj){ncpPost(NCP_RESULT,obj).catch(()=>{});}
function sendLedger(cat,msg,meta={}){send({type:'GUARDIAN_LEDGER_EVENT',level:cat,category:cat,msg,meta,chatUrl:location.href,account:getAccount(),requestId:currentJobId});}

function connect() {
  if(_reconnectTimer){clearTimeout(_reconnectTimer);_reconnectTimer=null;}
  if(_es){try{_es.close();}catch(_){}}
  const params=`tabId=${MY_TAB}&provider=${PROVIDER}`;
  _log('info','NCP connecting…',`${NCP_CH}?${params}`);
  connState='connecting';setConnState('connecting');
  _es=new EventSource(`${NCP_CH}?${params}`);
  _es.onmessage=e=>{try{_handleMsg(JSON.parse(e.data));}catch(err){_log('err','NCP parse',err.message);}};
  _es.onopen=()=>{connState='ready';setConnState('ready');_log('ok',`NCP connected · ${PROVIDER}`,NCP_CH);ncpPost(NCP_RESULT,{type:'GUARDIAN_REGISTER',provider:PROVIDER,host:location.hostname,tabId:MY_TAB,claimed:amIClaimed()});if(_hb)clearInterval(_hb);_hb=setInterval(()=>ncpPost(NCP_HB,{type:'GUARDIAN_HEARTBEAT',provider:PROVIDER,tabId:MY_TAB,ts:Date.now()}),HB_MS);autoClaimIfFree();replayPending();setTimeout(()=>sendDOMMap(),2000);pollSystemStatus();};
  _es.onerror=()=>{connState='disconnected';setConnState('disconnected');_log('err',`NCP error — retry ${RECONNECT_MS}ms`);_es.close();clearInterval(_hb);_reconnectTimer=setTimeout(connect,RECONNECT_MS);};
}
function _handleMsg(msg) {
  switch(msg.type){
    case 'NCP_READY': case 'GUARDIAN_READY': setConnState('ready');_log('ok',`Ready · ${PROVIDER}`);toast('Guardian ✓','success',2000);break;
    case 'GUARDIAN_CLAIM': if(msg.tabId===MY_TAB||msg.tabId==='any'){claimTab();ncpPost(NCP_RESULT,{type:'GUARDIAN_CLAIM_ACK',tabId:MY_TAB,provider:PROVIDER});toast('ACTIVE','success',2000);}break;
    case 'GUARDIAN_RELEASE': releaseTab();break;
    case 'GUARDIAN_JOB': currentJobId=msg.jobId;handleJob(msg);break;
    case 'NEXUS_CONTEXT_RESPONSE': if(msg.context){_intelligenceCtx=msg.context;_log('sys','Context updated');}break;
    case 'GUARDIAN_ARTIFACT_SAVED': _log('ok','Artifact saved',msg.artifactId);break;
    default: _log('debug',`NCP: ${msg.type}`);
  }
}

// System status
async function pollSystemStatus(){try{const r=await fetch(`${ORCH_URL}/health`,{signal:AbortSignal.timeout(2000)});if(r.ok){_systemStatus=await r.json();if(panelOpen&&activeTab==='sys')renderSys();}}catch(_){}}
setInterval(pollSystemStatus,15000);

// Navigation
let _lastPath=location.pathname;
setInterval(()=>{if(location.pathname!==_lastPath){_lastPath=location.pathname;_sessionId=null;if(currentJobId)stopWatch();_log('sys',`Nav → ${chatIdFromUrl()}`);setTimeout(()=>sendDOMMap(),1000);}},800);

// ══════════════════════════════════════════════════════════════════════════════
// UI — same design system as claude v10, g8 prefix for ChatGPT
// ══════════════════════════════════════════════════════════════════════════════
function injectStyles() {
  const s=document.createElement('style');
  s.textContent=`
    @keyframes gfadein{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
    @keyframes gpulse{0%,100%{opacity:1}50%{opacity:.4}}
    #__g8root__{position:fixed;bottom:16px;right:16px;z-index:2147483647;font-family:'SF Mono','Fira Code',monospace;font-size:11px;user-select:none}
    #__g8pill__{display:flex;align-items:center;gap:6px;background:rgba(8,8,14,.95);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.08);border-radius:20px;padding:5px 12px 5px 8px;cursor:pointer;box-shadow:0 4px 24px rgba(0,0,0,.6);transition:opacity .2s;margin-left:auto}
    #__g8pill__:hover{opacity:.85}
    #__g8panel__{width:520px;background:rgba(6,6,12,.98);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,.07);border-radius:14px;box-shadow:0 12px 60px rgba(0,0,0,.85);overflow:hidden;margin-bottom:8px;display:none;flex-direction:column;max-height:580px;animation:gfadein .14s ease}
    #__g8hdr__{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.05);flex-shrink:0}
    .g8hdr-l{display:flex;align-items:center;gap:8px}
    .g8hdr-dot{width:8px;height:8px;border-radius:50%;background:#888;transition:background .4s}
    .g8hdr-title{color:#e2e8f0;font-weight:700;font-size:12px;letter-spacing:.04em}
    .g8hdr-badge{font-size:9px;padding:2px 7px;border-radius:10px;background:#88888822;color:#888;font-weight:600}
    .g8clear{background:none;border:1px solid rgba(255,255,255,.08);color:#475569;border-radius:3px;padding:2px 8px;font:inherit;font-size:9px;cursor:pointer}
    #__g8jobbar__{display:none;align-items:center;gap:8px;padding:6px 14px;background:rgba(251,191,36,.05);border-bottom:1px solid rgba(251,191,36,.1);flex-shrink:0}
    .g8jdot{width:6px;height:6px;border-radius:50%;background:#fbbf24;animation:gpulse 1.2s infinite}
    .g8jtext{color:#fbbf24;font-size:10px;font-weight:600;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .g8jid{color:#78716c;font-size:9px}
    #__g8tabs__{display:flex;border-bottom:1px solid rgba(255,255,255,.05);flex-shrink:0}
    .g8tab{flex:1;text-align:center;padding:7px 0;cursor:pointer;color:#334155;font-size:9px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;border-bottom:2px solid transparent;transition:color .2s}
    .g8tab:hover{color:#64748b}
    .g8tab.active{color:#10b981;border-bottom-color:#10b981}
    #__g8log__{flex:1;overflow-y:auto;padding:6px 0;min-height:0}
    .g8row{display:flex;align-items:flex-start;gap:6px;padding:2px 12px}
    .g8row:hover{background:rgba(255,255,255,.02)}
    .g8ts{color:#1e293b;font-size:9px;flex-shrink:0;width:52px}
    .g8ic{font-size:10px;flex-shrink:0;width:12px;text-align:center}
    .g8ct{flex:1;min-width:0}
    .g8msg{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .g8det{color:#1e293b;font-size:9px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:1px}
    .g8use-row{display:flex;justify-content:space-between;padding:3px 12px;border-bottom:1px solid rgba(255,255,255,.03)}
    .g8use-label{color:#334155;font-size:9px}.g8use-val{color:#64748b;font-size:9px;font-weight:600}
    .g8gap{padding:6px 12px;border-bottom:1px solid rgba(255,255,255,.03)}
    .g8gap-type{color:#f472b6;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.05em}
    .g8gap-desc{color:#475569;font-size:9px;margin-top:2px}
    .g8art{padding:6px 12px;border-bottom:1px solid rgba(255,255,255,.03);cursor:pointer}
    .g8art:hover{background:rgba(255,255,255,.02)}
    .g8art-hdr{display:flex;align-items:center;gap:6px}
    .g8art-lang{color:#2dd4bf;font-size:9px;font-weight:700;text-transform:uppercase}
    .g8art-sz{color:#334155;font-size:9px}.g8art-hash{color:#1e293b;font-size:9px;font-family:monospace}
    .g8art-pre{color:#475569;font-size:9px;margin-top:4px;white-space:pre-wrap;word-break:break-all;max-height:80px;overflow:hidden}
    #__g8sys__{overflow-y:auto;max-height:460px}
    .g8sys-section{padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.04)}
    .g8sys-title{color:#334155;font-size:8px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:5px;font-weight:700}
    .g8sys-row{display:flex;justify-content:space-between;align-items:center;padding:2px 0}
    .g8sys-label{color:#1e293b;font-size:9px}.g8sys-val{font-size:9px;font-weight:600}
    .g8sys-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0}
    .g8online{color:#34d399}.g8offline{color:#f87171}.g8warn{color:#f59e0b}
    #__g8opts__{overflow-y:auto;max-height:460px;padding:8px 0}
    .g8opt-row{display:flex;justify-content:space-between;align-items:center;padding:6px 14px;border-bottom:1px solid rgba(255,255,255,.03)}
    .g8opt-label{color:#64748b;font-size:9px}
    .g8opt-toggle{width:28px;height:14px;border-radius:7px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.05);cursor:pointer;position:relative;transition:background .2s}
    .g8opt-toggle.on{background:#10b98133;border-color:#10b98155}
    .g8opt-toggle::after{content:'';position:absolute;width:10px;height:10px;border-radius:50%;background:#475569;top:1px;left:1px;transition:all .2s}
    .g8opt-toggle.on::after{background:#10b981;left:15px}
    .g8intel-section{padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.04);font-size:9px}
    .g8intel-title{color:#f59e0b;font-size:8px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px;font-weight:700}
    .g8intel-row{color:#334155;padding:2px 0;line-height:1.5}
    .g8intel-val{color:#64748b}
    .g8footer{display:flex;justify-content:space-between;padding:5px 12px;border-top:1px solid rgba(255,255,255,.04);flex-shrink:0}
    .g8footer span{color:#1e293b;font-size:9px}
    #__g8badge__{background:#f87171;color:#fff;border-radius:8px;padding:0 5px;font-size:9px;font-weight:700;display:none;min-width:16px;text-align:center}
    #__g8claim__{font-size:8px;padding:2px 7px;border-radius:10px;border:1px solid rgba(255,255,255,.08);color:#475569;cursor:pointer;font-weight:700;letter-spacing:.04em}
    #__g8claim__.active{color:#10b981;border-color:#10b98133;background:#10b98110}
    .g8ledger-row{display:flex;gap:6px;padding:3px 12px;border-bottom:1px solid rgba(255,255,255,.02);align-items:flex-start}
    .g8ledger-ts{color:#1e293b;font-size:9px;flex-shrink:0;width:52px}
    .g8ledger-cat{font-size:8px;font-weight:700;text-transform:uppercase;flex-shrink:0;width:50px;letter-spacing:.04em}
    .g8ledger-msg{color:#475569;font-size:9px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .cat-ok{color:#34d399}.cat-input{color:#60a5fa}.cat-event{color:#818cf8}.cat-gap{color:#f472b6}.cat-error{color:#f87171}
    .g8seam-area{padding:8px 12px;overflow-y:auto;max-height:400px}
    .g8seam-chunk{border:1px solid rgba(255,255,255,.05);border-radius:4px;margin-bottom:6px}
    .g8seam-hdr{display:flex;align-items:center;gap:6px;padding:5px 8px;background:rgba(255,255,255,.02)}
    .g8seam-title{color:#94a3b8;font-size:9px;font-weight:600;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .g8seam-inject{background:none;border:1px solid rgba(16,185,129,.3);color:#10b981;border-radius:2px;padding:2px 7px;font:inherit;font-size:8px;cursor:pointer;flex-shrink:0}
    .g8seam-inject:disabled{opacity:.3;cursor:default}
  `;
  document.head.appendChild(s);
}

function buildUI() {
  injectStyles();
  const root=document.createElement('div');root.id='__g8root__';document.body.appendChild(root);
  const pill=document.createElement('div');pill.id='__g8pill__';
  const dot=document.createElement('div');dot.id='__g8dot__';Object.assign(dot.style,{width:'7px',height:'7px',borderRadius:'50%',background:'#888',transition:'background .4s',flexShrink:'0'});
  const lbl=document.createElement('span');lbl.id='__g8label__';lbl.style.cssText='color:#cbd5e1;font-size:11px;font-weight:600';lbl.textContent='Guardian';
  const prov=document.createElement('span');prov.style.cssText='color:#475569;font-size:9px;border-left:1px solid rgba(255,255,255,.08);padding-left:6px;margin-left:1px';prov.textContent=`chatgpt v${VERSION}`;
  const claim=document.createElement('span');claim.id='__g8claim__';claim.textContent='PASSIVE';
  claim.addEventListener('click',e=>{e.stopPropagation();isClaimed?releaseTab():claimTab();toast(isClaimed?'ACTIVE':'PASSIVE',isClaimed?'success':'warn',2500);});
  const badge=document.createElement('span');badge.id='__g8badge__';
  pill.append(dot,lbl,prov,claim,badge);
  const panel=document.createElement('div');panel.id='__g8panel__';
  const hdr=document.createElement('div');hdr.id='__g8hdr__';
  const hdrL=document.createElement('div');hdrL.className='g8hdr-l';
  const hdrDot=document.createElement('div');hdrDot.id='__g8hdrdot__';hdrDot.className='g8hdr-dot';
  const hdrTitle=document.createElement('span');hdrTitle.className='g8hdr-title';hdrTitle.textContent='Guardian';
  const hdrBadge=document.createElement('span');hdrBadge.id='__g8hdrbadge__';hdrBadge.className='g8hdr-badge';hdrBadge.textContent='DISCONNECTED';
  hdrL.append(hdrDot,hdrTitle,hdrBadge);
  const clearBtn=document.createElement('button');clearBtn.className='g8clear';clearBtn.textContent='Clear';clearBtn.onclick=()=>{logEntries=[];unreadCount=0;renderLog();_setBadge(0);};
  hdr.append(hdrL,clearBtn);
  const jobBar=document.createElement('div');jobBar.id='__g8jobbar__';
  const jDot=document.createElement('div');jDot.className='g8jdot';
  const jText=document.createElement('span');jText.id='__g8jtext__';jText.className='g8jtext';jText.textContent='Job running…';
  const jId=document.createElement('span');jId.id='__g8jid__';jId.className='g8jid';
  jobBar.append(jDot,jText,jId);
  const tabs=document.createElement('div');tabs.id='__g8tabs__';
  const TAB_LIST=[['log','Log'],['ledger','Ledger'],['gaps','Gaps'],['arts','Arts'],['seam','SEAM'],['intel','Intel'],['nexus','NEXUS'],['sys','Sys'],['opts','Opts']];
  for(const[id,label]of TAB_LIST){const t=document.createElement('div');t.className='g8tab'+(id===activeTab?' active':'');t.textContent=label;t.dataset.tab=id;t.addEventListener('click',()=>switchTab(id));tabs.appendChild(t);}
  const logArea=document.createElement('div');logArea.id='__g8log__';
  const ledgerArea=document.createElement('div');ledgerArea.id='__g8ledger__';ledgerArea.style.cssText='display:none;overflow-y:auto;max-height:460px';
  const gapsArea=document.createElement('div');gapsArea.id='__g8gaps__';gapsArea.style.cssText='display:none;overflow-y:auto;max-height:460px';
  const artsArea=document.createElement('div');artsArea.id='__g8arts__';artsArea.style.cssText='display:none;overflow-y:auto;max-height:460px';
  const seamArea=document.createElement('div');seamArea.id='__g8seam__';seamArea.style.display='none';
  const intelArea=document.createElement('div');intelArea.id='__g8intel__';intelArea.style.cssText='display:none;overflow-y:auto;max-height:460px';
  const sysArea=document.createElement('div');sysArea.id='__g8sys__';sysArea.style.display='none';
  const optsArea=document.createElement('div');optsArea.id='__g8opts__';optsArea.style.display='none';
  const footer=document.createElement('div');footer.className='g8footer';
  const fL=document.createElement('span');fL.id='__g8fl__';fL.textContent=`${NCP_URL} · chatgpt`;
  const fR=document.createElement('span');fR.textContent=`v${VERSION}`;
  footer.append(fL,fR);
  panel.append(hdr,jobBar,tabs,logArea,ledgerArea,gapsArea,artsArea,seamArea,intelArea,nexusArea,sysArea,optsArea,footer);
  pill.addEventListener('click',()=>{panelOpen=!panelOpen;panel.style.display=panelOpen?'flex':'none';if(panelOpen){renderActiveTab();unreadCount=0;_setBadge(0);}});
  root.append(panel,pill);
}

const AREAS={log:'__g8log__',ledger:'__g8ledger__',gaps:'__g8gaps__',arts:'__g8arts__',seam:'__g8seam__',intel:'__g8intel__',sys:'__g8sys__',opts:'__g8opts__',nexus:'__g10nexus__'};
function switchTab(id){activeTab=id;document.querySelectorAll('.g8tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===id));Object.entries(AREAS).forEach(([k,eid])=>{const el=document.getElementById(eid);if(el)el.style.display=k===id?'block':'none';});renderActiveTab();}
function renderActiveTab(){
  if(activeTab==='log')renderLog();if(activeTab==='ledger')renderLedger();
  if(activeTab==='gaps')renderGaps();if(activeTab==='arts')renderArts();
  if(activeTab==='seam')renderSeam();if(activeTab==='intel')renderIntel();if(activeTab==='nexus')renderNexus();
  if(activeTab==='sys')renderSys();if(activeTab==='opts')renderOpts();
}
function _setBadge(n){const b=document.getElementById('__g8badge__');if(b){b.textContent=n>99?'99+':n;b.style.display=n>0?'inline':'none';}}
function setConnState(state){const C={connecting:'#f59e0b',ready:'#22c55e',disconnected:'#ef4444'};const L={connecting:'CONNECTING',ready:'READY',disconnected:'DISCONNECTED'};const col=C[state]||'#ef4444';['__g8dot__','__g8hdrdot__'].forEach(id=>{const el=document.getElementById(id);if(el)el.style.background=col;});const hb=document.getElementById('__g8hdrbadge__');if(hb){hb.textContent=L[state]||state.toUpperCase();hb.style.background=col+'22';hb.style.color=col;}}
function updatePill(){const c=document.getElementById('__g8claim__');if(c){c.textContent=isClaimed?'ACTIVE':'PASSIVE';c.classList.toggle('active',isClaimed);}}
function setJobBar(active,prompt,jobId){const bar=document.getElementById('__g8jobbar__');if(!bar)return;bar.style.display=active?'flex':'none';if(active){const t=document.getElementById('__g8jtext__');if(t)t.textContent=(prompt||'Job running…').slice(0,60);const i=document.getElementById('__g8jid__');if(i)i.textContent=jobId?`#${jobId.slice(0,8)}`:'';};}

function _appendLogRow(entry){const a=document.getElementById('__g8log__');if(!a)return;const row=document.createElement('div');row.className='g8row';const ts=document.createElement('span');ts.className='g8ts';ts.textContent=fts(entry.ts);const ic=document.createElement('span');ic.className='g8ic';ic.style.color=entry.color;ic.textContent=entry.icon;const ct=document.createElement('div');ct.className='g8ct';const m=document.createElement('span');m.className='g8msg';m.style.color=entry.color;m.textContent=entry.msg;ct.appendChild(m);if(entry.detail){const d=document.createElement('div');d.className='g8det';d.textContent=entry.detail;ct.appendChild(d);}row.append(ts,ic,ct);a.appendChild(row);a.scrollTop=a.scrollHeight;}
function renderLog(){const a=document.getElementById('__g8log__');if(!a)return;a.innerHTML='';logEntries.forEach(e=>_appendLogRow(e));}

async function renderLedger(){const a=document.getElementById('__g8ledger__');if(!a)return;a.innerHTML='<div style="color:#1e293b;font-size:9px;padding:10px 12px">Loading…</div>';try{const r=await fetch(`${CORTEX_URL}/api/events?limit=30&source=userscript-chatgpt`,{signal:AbortSignal.timeout(2000)});const d=r.ok?await r.json():{rows:[]};const rows=(d.rows||d.events||[]).slice(0,30);if(!rows.length){a.innerHTML='<div style="color:#1e293b;font-size:9px;padding:20px;text-align:center">No ledger entries</div>';return;}a.innerHTML=rows.map(row=>{const cat=(row.type||'').split('.').pop().toUpperCase();const cls=row.type?.includes('error')||row.type?.includes('fail')?'cat-error':row.type?.includes('gap')?'cat-gap':row.type?.includes('complete')||row.type?.includes('ok')?'cat-ok':'cat-event';return`<div class="g8ledger-row"><span class="g8ledger-ts">${fts(row.ts||0)}</span><span class="g8ledger-cat ${cls}">${escHtml(cat.slice(0,8))}</span><span class="g8ledger-msg">${escHtml((row.type||'')+' '+JSON.stringify(row.payload||{}).slice(0,60))}</span></div>`;}).join('');}catch(_){a.innerHTML='<div style="color:#f87171;font-size:9px;padding:12px">Cortex offline</div>';}}

function renderGaps(){const a=document.getElementById('__g8gaps__');if(!a)return;if(!currentGaps.length){a.innerHTML='<div style="color:#1e293b;font-size:9px;padding:20px;text-align:center">No gaps this session</div>';return;}a.innerHTML=currentGaps.map(g=>`<div class="g8gap"><div class="g8gap-type">${escHtml(g.type||'?')}</div><div class="g8gap-desc">${escHtml(g.reason||g.description||'')}</div></div>`).join('');}

let _artExpanded=new Set();
function renderArts(){const a=document.getElementById('__g8arts__');if(!a)return;if(!artifactStore.length){a.innerHTML='<div style="color:#1e293b;font-size:9px;padding:20px;text-align:center">No artifacts (SHA-256 dedup)</div>';return;}a.innerHTML='';for(const art of[...artifactStore].reverse()){const div=document.createElement('div');div.className='g8art';const exp=_artExpanded.has(art.hash);div.innerHTML=`<div class="g8art-hdr"><span class="g8art-lang">${escHtml(art.lang||'text')}</span><span class="g8art-sz">${art.content.length}ch</span><span class="g8art-hash">#${art.hash}</span><span style="color:#334155;margin-left:auto">${exp?'▲':'▼'}</span></div>${exp?`<div class="g8art-pre">${escHtml(art.content.slice(0,400))}</div>`:''}`;div.addEventListener('click',()=>{if(exp)_artExpanded.delete(art.hash);else _artExpanded.add(art.hash);renderArts();});a.appendChild(div);}}

let _seamState={chunks:[],parsed:false};
function renderSeam(){const a=document.getElementById('__g8seam__');if(!a)return;a.innerHTML='';const tw=document.createElement('div');tw.style.cssText='padding:8px 12px';const ta=document.createElement('textarea');ta.style.cssText='width:100%;background:#030308;border:1px solid #1e1e3a;color:#64748b;padding:6px 8px;font-family:inherit;font-size:.68rem;outline:none;resize:none;border-radius:2px;min-height:70px;display:block;box-sizing:border-box';ta.placeholder='Paste .spec content here…';const pb=document.createElement('button');pb.style.cssText='margin-top:4px;background:none;border:1px solid rgba(16,185,129,.3);color:#10b981;border-radius:2px;padding:3px 10px;font:inherit;font-size:9px;cursor:pointer';pb.textContent='Parse Spec';pb.onclick=()=>{const lines=ta.value.split('\n');const chunks=[];let cur=null;for(const l of lines){const h=l.match(/^#+\s+(.*)/);if(h){if(cur)chunks.push(cur);cur={title:h[1],id:chunks.length,lines:[]};}else if(cur)cur.lines.push(l);}if(cur)chunks.push(cur);_seamState.chunks=chunks.map(c=>({...c,content:c.lines.join('\n').trim()}));_seamState.parsed=true;renderSeamChunks(a);};tw.append(ta,pb);a.appendChild(tw);if(_seamState.parsed)renderSeamChunks(a);}
function renderSeamChunks(a){const ex=a.querySelector('.g8seam-area');if(ex)ex.remove();const area=document.createElement('div');area.className='g8seam-area';for(const chunk of _seamState.chunks){const div=document.createElement('div');div.className='g8seam-chunk';const hdr2=document.createElement('div');hdr2.className='g8seam-hdr';const title=document.createElement('span');title.className='g8seam-title';title.textContent=`#${chunk.id+1} ${chunk.title}`;const btn=document.createElement('button');btn.className='g8seam-inject';btn.textContent='↗ Inject';btn.disabled=!!currentJobId||!isClaimed;btn.onclick=()=>{const prompt=`[SEAM ${chunk.id+1}/${_seamState.chunks.length}] ${chunk.title}\n\n${chunk.content}`;if(!injectText(prompt)){toast('No input','error');return;}send({type:'GUARDIAN_SEAM_CHUNK',chunkId:chunk.id,title:chunk.title,total:_seamState.chunks.length,jobId:currentJobId||uid(),chatUrl:location.href,account:getAccount()});setTimeout(submit,300);};hdr2.append(title,btn);div.appendChild(hdr2);area.appendChild(div);}a.appendChild(area);}

async function renderIntel(){const a=document.getElementById('__g8intel__');if(!a)return;a.innerHTML='<div style="color:#1e293b;font-size:9px;padding:10px 12px">Loading…</div>';try{const r=await fetch(`${CORTEX_URL}/api/intelligence/status`,{signal:AbortSignal.timeout(2000)});const status=r.ok?await r.json():null;const ctx=_intelligenceCtx;let html='';if(status){html+=`<div class="g8intel-section"><div class="g8intel-title">Intelligence Core</div><div class="g8intel-row">Patterns: <span class="g8intel-val">${status.patterns||0} (${status.crystallised||0} crystallised)</span></div><div class="g8intel-row">Fault classes: <span class="g8intel-val">${status.faultClasses||0}</span></div><div class="g8intel-row">Reuse index: <span class="g8intel-val">${status.reuseItems||0}</span></div><div class="g8intel-row">Drift: <span class="g8intel-val">${status.driftLevel||'?'}</span></div></div>`;}if(ctx?.failureModes?.length){html+=`<div class="g8intel-section"><div class="g8intel-title">Failure Modes</div>`;for(const f of ctx.failureModes.slice(0,5)){html+=`<div class="g8intel-row">${escHtml(f.faultClass)} <span class="g8intel-val">×${f.count}</span></div>`;}html+='</div>';}if(ctx?.reuse?.length){html+=`<div class="g8intel-section"><div class="g8intel-title">Reusable Artifacts</div>`;for(const r2 of ctx.reuse.slice(0,3)){html+=`<div class="g8intel-row">${escHtml(r2.lang||'?')} <span class="g8intel-val">#${r2.hash}</span></div>`;}html+='</div>';}a.innerHTML=html||'<div style="color:#1e293b;font-size:9px;padding:20px;text-align:center">No context yet</div>';}catch(_){a.innerHTML='<div style="color:#f87171;font-size:9px;padding:12px">Intelligence offline</div>';}}

function renderSys(){const a=document.getElementById('__g8sys__');if(!a)return;const systems=[{id:'orchestrator',port:9000},{id:'bridge',port:9999},{id:'cortex',port:3748},{id:'guardian',port:7820},{id:'idearium',port:4800},{id:'emerge',port:4242}];const h=_systemStatus;let html=`<div class="g8sys-section"><div class="g8sys-title">System Health</div>`;for(const sys of systems){const online=h[sys.id]?.ok||h.systems?.[sys.id]?.ok;html+=`<div class="g8sys-row"><div class="g8sys-dot" style="background:${online?'#22c55e':'#ef4444'}"></div><span class="g8sys-label">${sys.id}</span><span class="g8sys-val ${online?'g8online':'g8offline'}">:${sys.port} ${online?'ONLINE':'OFFLINE'}</span></div>`;}html+=`</div><div class="g8sys-section"><div class="g8sys-title">Connection</div><div class="g8sys-row"><span class="g8sys-label">NCP</span><span class="g8sys-val">${NCP_URL}</span></div><div class="g8sys-row"><span class="g8sys-label">Provider</span><span class="g8sys-val">${PROVIDER}</span></div><div class="g8sys-row"><span class="g8sys-label">State</span><span class="g8sys-val ${connState==='ready'?'g8online':'g8offline'}">${connState.toUpperCase()}</span></div><div class="g8sys-row"><span class="g8sys-label">Claimed</span><span class="g8sys-val ${isClaimed?'g8online':'g8offline'}">${isClaimed?'ACTIVE':'PASSIVE'}</span></div></div><div class="g8sys-section"><div class="g8sys-title">Session</div><div class="g8sys-row"><span class="g8sys-label">Account</span><span class="g8sys-val">${escHtml(getAccount().slice(0,25))}</span></div><div class="g8sys-row"><span class="g8sys-label">Jobs</span><span class="g8sys-val">${sessionJobs}</span></div><div class="g8sys-row"><span class="g8sys-label">~Tokens</span><span class="g8sys-val">${sessionTokens.toLocaleString()}</span></div><div class="g8sys-row"><span class="g8sys-label">Artifacts (IDB)</span><span class="g8sys-val">${artifactStore.length}</span></div></div>`;a.innerHTML=html;}

const OPTIONS=[{key:'enableContextInjection',label:'Pre-prompt intelligence injection',default:true},{key:'enableArtifactCapture',label:'Artifact capture (SHA-256)',default:true},{key:'enableAutoRetry',label:'Auto-retry on gap detection',default:true},{key:'enableDOMMap',label:'Send DOM map on navigation',default:true},{key:'enableStreamCapture',label:'Stream response to cortex',default:true},{key:'verboseLog',label:'Verbose logging',default:false}];
function loadSettings(){for(const opt of OPTIONS){const v=GM_getValue('g8_'+opt.key,null);_settings[opt.key]=v===null?opt.default:v;}}
function renderOpts(){const a=document.getElementById('__g8opts__');if(!a)return;a.innerHTML='';for(const opt of OPTIONS){const row=document.createElement('div');row.className='g8opt-row';const lbl=document.createElement('span');lbl.className='g8opt-label';lbl.textContent=opt.label;const toggle=document.createElement('div');toggle.className='g8opt-toggle'+(_settings[opt.key]?' on':'');toggle.addEventListener('click',()=>{_settings[opt.key]=!_settings[opt.key];GM_setValue('g8_'+opt.key,_settings[opt.key]);toggle.classList.toggle('on',_settings[opt.key]);_log('sys',`${opt.key}`,_settings[opt.key]?'on':'off');});row.append(lbl,toggle);a.appendChild(row);}const testDiv=document.createElement('div');testDiv.style.cssText='padding:10px 12px';const testBtn=document.createElement('button');testBtn.style.cssText='background:none;border:1px solid rgba(16,185,129,.3);color:#10b981;border-radius:3px;padding:4px 12px;font:inherit;font-size:9px;cursor:pointer;width:100%';testBtn.textContent='↺ Test all connections';testBtn.onclick=async()=>{testBtn.textContent='Testing…';await pollSystemStatus();switchTab('sys');testBtn.textContent='↺ Test all connections';};testDiv.appendChild(testBtn);a.appendChild(testDiv);}

// ── NEXUS MODULE (ChatGPT) ────────────────────────────────────────────────────
const _nexus={observer:null,lastMsgCount:0,sessionId:null,signals:[],context:[],ollamaOk:null,pending:false};
function _nexusGetMessages(){
  const msgs=[];
  const all=document.querySelectorAll('[data-message-author-role]');
  for(const el of all){
    const role=el.getAttribute('data-message-author-role')||'unknown';
    const text=(el.innerText||el.textContent||'').trim();
    if(text&&text.length>5) msgs.push({role:role==='user'?'user':'assistant',text:text.slice(0,2000)});
  }
  return msgs;
}
function _nexusLogMessage(msg){
  GM_xmlhttpRequest({method:'POST',url:CORTEX_URL+'/api/meta/observe',
    headers:{'Content-Type':'application/json'},
    data:JSON.stringify({role:msg.role,text:msg.text,sessionId:_nexus.sessionId,source:'chatgpt'}),
    onload:(r)=>{try{const d=JSON.parse(r.responseText);if(d?.result?.signals){_nexus.signals.push({...d.result.signals,role:msg.role,ts:Date.now()});if(activeTab==='nexus')renderNexus();}}catch(_){}},
    onerror:()=>{}});
}
function _nexusPullContext(query){
  if(!query||_nexus.pending)return;
  _nexus.pending=true;
  GM_xmlhttpRequest({method:'GET',url:ORCH_URL+'/api/search?q='+encodeURIComponent(query.slice(0,200))+'&k=5&threshold=0.68',
    onload:(r)=>{_nexus.pending=false;try{const d=JSON.parse(r.responseText);if(d?.results?.length){_nexus.context=d.results;if(activeTab==='nexus')renderNexus();}}catch(_){_nexus.pending=false;}},
    onerror:()=>{_nexus.pending=false;}});
}
function _nexusOllamaQuery(prompt,cb){
  GM_xmlhttpRequest({method:'POST',url:'http://127.0.0.1:11434/api/generate',
    headers:{'Content-Type':'application/json'},
    data:JSON.stringify({model:'qwen2.5-coder:1.5b',prompt,stream:false}),
    timeout:30000,
    onload:(r)=>{try{const d=JSON.parse(r.responseText);_nexus.ollamaOk=true;cb(null,d.response||'');}catch(e){cb(e.message,null);}},
    onerror:()=>{_nexus.ollamaOk=false;cb('Ollama unreachable',null);},
    ontimeout:()=>{_nexus.ollamaOk=false;cb('Ollama timeout',null);}});
}
function _nexusCheckOllama(){GM_xmlhttpRequest({method:'GET',url:'http://127.0.0.1:11434/api/tags',timeout:3000,onload:()=>{_nexus.ollamaOk=true;if(activeTab==='nexus')renderNexus();},onerror:()=>{_nexus.ollamaOk=false;}});}
function renderNexus(){
  const el=document.getElementById('__g10nexus__');if(!el)return;
  const msgs=_nexusGetMessages();const signals=_nexus.signals.slice(-5);const context=_nexus.context||[];
  const os=_nexus.ollamaOk===null?'...':_nexus.ollamaOk?'✓ online':'✗ offline';
  const oc=_nexus.ollamaOk?'#00ff88':_nexus.ollamaOk===false?'#ff2d55':'#818cf8';
  el.innerHTML='';
  const pad='padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.06)';
  const dim='color:#334466;font-size:9px';
  const sb=document.createElement('div');sb.style.cssText=pad+';display:flex;gap:10px;align-items:center;flex-wrap:wrap';
  sb.innerHTML='<span style="'+dim+';text-transform:uppercase">NEXUS</span><span style="font:9px monospace;color:'+oc+'">ollama '+os+'</span><span style="'+dim+'">'+msgs.length+' msgs</span><span style="'+dim+'">'+context.length+' hits</span><button onclick="_nexusCheckOllama()" style="margin-left:auto;background:none;border:1px solid rgba(129,140,248,.3);color:#818cf8;border-radius:3px;padding:2px 8px;font:9px monospace;cursor:pointer">↺</button>';
  el.appendChild(sb);
  if(signals.length){const sd=document.createElement('div');sd.style.cssText=pad;sd.innerHTML='<div style="'+dim+';margin-bottom:4px;text-transform:uppercase">BDA SIGNALS</div>';const axes=['valence','certainty','openness','tension','selfref'];const sr=document.createElement('div');sr.style.cssText='display:flex;gap:6px;flex-wrap:wrap';const lat=signals[signals.length-1];for(const ax of axes){const v=lat[ax]??0;const pct=Math.round(v*100);const col=ax==='tension'?(pct>60?'#ff2d55':'#818cf8'):ax==='valence'?(pct>50?'#00ff88':'#ff6b35'):'#818cf8';const chip=document.createElement('div');chip.style.cssText='font:9px monospace;color:'+col+';border:1px solid '+col+';border-radius:3px;padding:2px 5px';chip.textContent=ax+':'+pct+'%';sr.appendChild(chip);}sd.appendChild(sr);el.appendChild(sd);}
  if(context.length){const cd=document.createElement('div');cd.style.cssText=pad;cd.innerHTML='<div style="'+dim+';margin-bottom:4px;text-transform:uppercase">MEMORY</div>';for(const hit of context.slice(0,3)){const pct=Math.round((hit.snr||hit.similarity||0)*100);const col=pct>=85?'#00ff88':pct>=72?'#00d4ff':'#818cf8';const row=document.createElement('div');row.style.cssText='margin-bottom:3px;padding:4px 7px;background:rgba(0,0,0,.3);border-radius:3px;border-left:2px solid '+col;row.innerHTML='<div style="font:9px monospace;color:'+col+'">'+pct+'% · '+(hit.type||'?')+'</div><div style="font:9px monospace;color:#334466;margin-top:1px">'+(hit.text||'').slice(0,80)+'</div>';cd.appendChild(row);}el.appendChild(cd);}
  const qd=document.createElement('div');qd.style.cssText=pad;qd.innerHTML='<div style="'+dim+';margin-bottom:4px;text-transform:uppercase">OLLAMA DIRECT</div>';const qi=document.createElement('textarea');qi.id='__nx_query__';qi.placeholder='Ask qwen2.5-coder:1.5b…';qi.style.cssText='width:100%;background:rgba(0,0,0,.4);border:1px solid rgba(255,255,255,.07);color:#b8cfe0;font:10px monospace;padding:5px 7px;border-radius:3px;resize:none;height:46px;outline:none;box-sizing:border-box';const qb=document.createElement('button');qb.textContent='↗ ask';qb.style.cssText='margin-top:3px;background:none;border:1px solid rgba(0,255,136,.3);color:#00ff88;border-radius:3px;padding:2px 8px;font:9px monospace;cursor:pointer';const qo=document.createElement('div');qo.id='__nx_qout__';qo.style.cssText='margin-top:4px;font:9px monospace;color:#334466;line-height:1.5';qb.onclick=()=>{const q=document.getElementById('__nx_query__')?.value?.trim();if(!q)return;qo.style.color='#818cf8';qo.textContent='⟳ querying…';_nexusOllamaQuery(q,(err,text)=>{const o=document.getElementById('__nx_qout__');if(!o)return;if(err){o.style.color='#ff2d55';o.textContent='✗ '+err;}else{o.style.color='#b8cfe0';o.textContent=text.slice(0,400);}});};qd.append(qi,qb,qo);el.appendChild(qd);
}
function _nexusStartObserver(){const target=document.querySelector('main')||document.body;_nexus.observer=new MutationObserver(()=>{const msgs=_nexusGetMessages();if(msgs.length===_nexus.lastMsgCount)return;_nexus.lastMsgCount=msgs.length;const newest=msgs[msgs.length-1];if(!newest)return;_nexusLogMessage(newest);if(newest.role==='user')_nexusPullContext(newest.text);if(activeTab==='nexus')renderNexus();});_nexus.observer.observe(target,{childList:true,subtree:true});}
function _nexusInit(){_nexus.sessionId=MY_TAB+'-'+Date.now().toString(36);_nexusCheckOllama();setTimeout(_nexusStartObserver,2000);}

async function init() {
  loadSettings();
  await dbOpen().catch(()=>{ _log('err','IDB failed — degraded'); });
  buildUI();
  connect();
  _log('sys',`Guardian v${VERSION}`,`${PROVIDER} · ${location.hostname}`);
  if(_settings.enableDOMMap)setTimeout(()=>sendDOMMap(),3000);
  setInterval(()=>{const el=document.getElementById('__g8fl__');if(el){const secs=Math.round((Date.now()-sessionStart)/1000);el.textContent=`${getAccount().slice(0,16)} · ${Math.floor(secs/60)}m · ~${sessionTokens.toLocaleString()}tok`;}},5000);
}

init().catch(e=>console.error('[Guardian §1.2]',e));

})();
