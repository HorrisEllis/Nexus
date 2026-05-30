// ==UserScript==
// @name         Guardian — Claude v8
// @namespace    nexus.guardian.claude
// @version      8.0.0
// @description  Guardian v8: SISO bus, Jaa persistence, GapHunter v3, Prompt Archaeology, session greeting, cockpit controls
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

// ══════════════════════════════════════════════════════════════════════════════
//  GUARDIAN v8 — CLAUDE USERSCRIPT
//  SISO event bus (BroadcastChannel) + full GapHunter v3 taxonomy inline
//  Prompt Archaeology + session greeting + Jaa/SQLite via server API
//  All settings pulled from /settings and cached locally.
//  "Rebuild from server" setting: wipes local state, reloads from Jaa.
// ══════════════════════════════════════════════════════════════════════════════

// ── Constants ──────────────────────────────────────────────────────────────────
const WS_URL        = 'wss://127.0.0.1:7821';
const API_URL       = 'http://127.0.0.1:7820';
const MEMORY_URL    = 'http://127.0.0.1:7823';
const RECONNECT_MS  = 3000;
const HB_INTERVAL   = 8000;
const LOG_MAX       = 150;
const LEDGER_MAX    = 200;
const ARTIFACT_MAX  = 500;
const PROVIDER      = 'claude';
const VERSION       = '8.0.0';

// ── Runtime settings (synced from /settings) ─────────────────────────────────
let CFG = {
  scan_debounce_ms:        1500,
  artifact_max:            500,
  gap_min_score:           0.25,
  pa_enabled:              true,
  memory_auto_push:        true,
  dropzone_auto_upload:    true,
  session_greeting_enabled:true,
  session_greeting_text:   'Guardian session initialising. Please ask me: "What are we calling this session?" — then wait for my answer before we begin.',
  greeting_delay_ms:       1200,
  poll_interval_ms:        500,
  stable_count_threshold:  5,
  stream_log_level:        'EVENTS',
  rebuild_from_server:     false,  // if true: clear local state + reload from Jaa on next init
};

async function loadSettings() {
  try {
    const r = await apiGet('/settings');
    if (r?.settings) {
      for (const [k,v] of Object.entries(r.settings)) {
        if (k in CFG) {
          if (v === 'true') CFG[k] = true;
          else if (v === 'false') CFG[k] = false;
          else if (!isNaN(v) && v !== '') CFG[k] = Number(v);
          else CFG[k] = v;
        }
      }
      if (CFG.rebuild_from_server) {
        await rebuildFromServer();
        await apiPut('/settings/rebuild_from_server', { value: 'false' });
        CFG.rebuild_from_server = false;
      }
    }
  } catch(_) {}
}

async function rebuildFromServer() {
  addLog('sys', 'Rebuilding from server (Jaa)…');
  try {
    const r = await apiGet('/artifacts?limit=200');
    if (r?.artifacts?.length) {
      artifactStore = r.artifacts.map(a => ({
        id:a.id,hash:a.hash,name:a.name,type:a.type,lang:a.lang,
        content:a.content,context:a.context,chatUrl:a.chat_url,
        chatId:a.chat_id,account:a.account,jobId:a.job_id,
        ts:a.ts,direction:a.direction,
      }));
      seenArtifactHashes = new Set(artifactStore.map(a=>a.hash));
      addLog('ok', `Rebuilt ${artifactStore.length} artifacts from server`);
    }
  } catch(e) { addLog('err', 'Rebuild failed: '+e.message); }
}

// ── SISO BroadcastChannel bus ─────────────────────────────────────────────────
const sisoChannel = new BroadcastChannel('guardian-siso-v8');
function sisoEmit(type, data = {}) {
  try { sisoChannel.postMessage({ type, data, ts: Date.now(), provider: PROVIDER }); } catch(_) {}
}

// ── API helpers ───────────────────────────────────────────────────────────────
async function apiGet(path) {
  const r = await fetch(API_URL + path); return r.ok ? r.json() : null;
}
async function apiPost(path, body) {
  const r = await fetch(API_URL + path, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
  return r.ok ? r.json() : null;
}
async function apiPut(path, body) {
  const r = await fetch(API_URL + path, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
  return r.ok ? r.json() : null;
}

// ── State ─────────────────────────────────────────────────────────────────────
let ws             = null;
let hb             = null;
let currentJobId   = null;
let connState      = 'disconnected';
let panelOpen      = false;
let activeTab      = 'log';
let logEntries     = [];
let ledgerEntries  = [];
let unreadCount    = 0;
let reconnectTimer = null;

let scanDebounceTimer = null;
let domSystems        = {};
let domObserver       = null;

let seenArtifactHashes = new Set();
let accountState       = null;
let sessionStartTime   = Date.now();
let sessionTokenTotal  = 0;
let artifactStore      = [];
let detectedDownloads  = [];
let agentEndpointActive= false;
let agentPollInterval  = null;

// PA state
const pa = { session: null, sessions: [] };

// Session greeting
const greetedChats = new Set(
  (() => { try { return JSON.parse(sessionStorage.getItem('guardian_greeted_v8')||'[]'); } catch(_) { return []; } })()
);
function saveGreeted() { try { sessionStorage.setItem('guardian_greeted_v8', JSON.stringify([...greetedChats])); } catch(_){} }

// Navigation state
let lastPathname = location.pathname;
let lastChatId   = chatIdFromUrl();

// ── Selectors ─────────────────────────────────────────────────────────────────
const SYSTEM_SELECTORS = [
  { selector:'[data-testid="assistant-message"]', type:'assistant_turn' },
  { selector:'[data-testid="human-message"]',     type:'human_turn'     },
  { selector:'.font-claude-message',              type:'assistant_turn' },
  { selector:'[class*="tool-use"]',               type:'tool_use'       },
  { selector:'[class*="thinking"]',               type:'thinking_block' },
  { selector:'[class*="artifact"]',               type:'artifact'       },
  { selector:'pre code',                          type:'code_block'     },
];

// ══════════════════════════════════════════════════════════════════════════════
//  UTILS
// ══════════════════════════════════════════════════════════════════════════════

function simpleHash(str) {
  let h=0; for(let i=0;i<str.length;i++){h=((h<<5)-h)+str.charCodeAt(i);h|=0;} return Math.abs(h).toString(16).slice(0,8);
}
function uid() { return Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
function escHtml(s) { return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fts(ts) { return new Date(ts).toTimeString().slice(0,8); }
function chatIdFromUrl() { const m=location.pathname.match(/\/chat\/([a-zA-Z0-9_-]+)/); return m?m[1]:'home'; }

function getAccount() {
  if (accountState) return accountState;
  const sels=['[data-testid="user-email"]','[data-testid="account-email"]','.account-email','[aria-label*="@"]','nav [title*="@"]'];
  for(const sel of sels){const el=document.querySelector(sel);if(el){const t=(el.getAttribute('aria-label')||el.getAttribute('title')||el.textContent||'').trim();if(t.includes('@')||t.length>3){accountState=t.slice(0,60);return accountState;}}}
  accountState=location.hostname; return accountState;
}

function estimateTokens(s) { return Math.max(1,Math.round(s.length/4)); }

function detectLang(el) {
  const codeEl=el.tagName==='CODE'?el:el.querySelector('code');
  if(codeEl){const cls=Array.from(codeEl.classList).find(c=>c.startsWith('language-'));if(cls)return cls.replace('language-','');}
  return null;
}

function detectArtifactName(el) {
  const parent=el.closest('[class*="artifact"]')||el.parentElement;
  if(parent){const titleEl=parent.querySelector('[class*="title"],[class*="name"],[data-testid*="title"]');if(titleEl){const t=titleEl.textContent.trim();if(t.length>0&&t.length<120)return t;}}
  const firstLine=(el.innerText||el.textContent||'').split('\n')[0].trim();
  const m=firstLine.match(/^(?:\/\/|#|--|<!--)?\s*([\w.\-/ ]+\.\w{1,6})/);
  if(m)return m[1].trim();
  const lang=detectLang(el); return lang?`${lang} block`:'artifact';
}

// ══════════════════════════════════════════════════════════════════════════════
//  GAPHUNTER v3 — INLINE TAXONOMY
//  Full taxonomy from gap-taxonomy.js (200+ gaps, 60+ domains, 9 reasons)
// ══════════════════════════════════════════════════════════════════════════════

const GAP_TYPE = Object.freeze({
  LOGICAL:'logical',EVIDENTIAL:'evidential',TEMPORAL:'temporal',DEFINITIONAL:'definitional',
  REFERENCE:'reference',OBLIGATION:'obligation',ASSUMPTION:'assumption',CONTRADICTION:'contradiction',
  IDENTITY_ATTACK:'identity_attack',CONSENT:'consent',BOUNDARY:'boundary',HIERARCHY:'hierarchy',
  COERCION:'coercion',ISOLATION:'isolation',OSCILLATORY:'oscillatory',CONDITION:'condition',
});
const GAP_REASON = Object.freeze({
  COMPRESSION:'compression',AVOIDANCE:'avoidance',COMPATIBILITY:'compatibility',
  ATTENTION:'attention',EMOTIONAL_OCCLUSION:'emotional_occlusion',
  NARRATIVE_SOOTHING:'narrative_soothing',IDENTITY_REFLECTION:'identity_reflection',
  DEFERRED_VARIABLE:'deferred_variable',STRUCTURAL_LIMIT:'structural_limit',
});
const DOMAIN = Object.freeze({
  CODE:'code',AI_ML:'ai_ml',SOFTWARE_ARCH:'software_arch',EPISTEMOLOGICAL:'epistemological',
  LOGIC:'logic',COMMUNICATION:'communication',INTERPERSONAL:'interpersonal',
  PSYCHOLOGICAL:'psychological',RESEARCH:'research',LANG_JS:'lang_javascript',
  LANG_TS:'lang_typescript',LANG_PYTHON:'lang_python',SECURITY:'security',
  DATABASE:'database',API_DESIGN:'api_design',SYSTEM_DESIGN:'system_design',
});

function gaphunterAnalyze(text) {
  const gaps=[]; if(!text||text.length<50) return gaps;
  const lines=text.split('\n'), words=text.toLowerCase().match(/\b\w+\b/g)||[], wc=words.length;
  const bd=lines.filter(l=>/^\s*[-*•]|\d+\./.test(l)).length/Math.max(1,lines.length);
  const ld=wc>5?(new Set(words).size/wc):1;
  const freq={}; for(const ch of text) freq[ch]=(freq[ch]||0)+1;
  let H=0; for(const f of Object.values(freq)){const p=f/text.length;H-=p*Math.log2(p);} H=parseFloat(H.toFixed(3));
  const hedges=(text.match(/\b(might|may|could|perhaps|possibly|seems|appears|likely|probably|generally|often|sometimes|usually|arguably|potentially)\b/gi)||[]).length;
  const hedgeRate=wc>0?hedges/wc:0;
  const lastLine=lines[lines.length-1]?.trim()||'';
  const min=CFG.gap_min_score??0.25;

  if(bd>0.5){const s=Math.min(0.95,bd);if(s>=min)gaps.push({type:GAP_TYPE.ASSUMPTION,domain:DOMAIN.COMMUNICATION,reason:GAP_REASON.COMPRESSION,description:`High bullet density ${(bd*100).toFixed(0)}% — reasoning compressed, load-bearing assumptions hidden`,score:s,evidence:{metric:bd,pattern:'bullet_density'}});}
  if(ld<0.35){const s=Math.min(0.9,1-ld);if(s>=min)gaps.push({type:GAP_TYPE.OBLIGATION,domain:DOMAIN.COMMUNICATION,reason:GAP_REASON.STRUCTURAL_LIMIT,description:`Low lexical diversity ${ld} — formulaic or repetitive phrasing`,score:s,evidence:{metric:ld,pattern:'lexical_diversity'}});}
  if(H<3.2&&wc>80){const s=parseFloat(((4-H)/4).toFixed(3));if(s>=min)gaps.push({type:GAP_TYPE.TEMPORAL,domain:DOMAIN.AI_ML,reason:GAP_REASON.COMPRESSION,description:`Low entropy H=${H} — pre-planned or template content`,score:s,evidence:{metric:H,pattern:'entropy'}});}
  if(hedgeRate>0.04){const s=Math.min(0.85,hedgeRate*10);if(s>=min)gaps.push({type:GAP_TYPE.ASSUMPTION,domain:DOMAIN.EPISTEMOLOGICAL,reason:GAP_REASON.AVOIDANCE,description:`High hedge density ${(hedgeRate*100).toFixed(1)}% — epistemic evasion`,score:s,evidence:{metric:hedgeRate,pattern:'hedge_rate'}});}
  if(wc>200&&(lastLine.endsWith('...')||lastLine.endsWith('etc.')||lastLine.length<12))gaps.push({type:GAP_TYPE.OBLIGATION,domain:DOMAIN.COMMUNICATION,reason:GAP_REASON.STRUCTURAL_LIMIT,description:'Possible truncation — context window pressure',score:0.75,evidence:{pattern:'truncation'}});
  const asserts=(text.match(/\b(always|never|all|every|definitely|certainly|obviously|clearly)\b/gi)||[]).length;
  const assertRate=wc>0?asserts/wc:0;
  if(assertRate>0.02&&hedgeRate<0.01&&wc>100){const s=Math.min(0.8,assertRate*20);if(s>=min)gaps.push({type:GAP_TYPE.EVIDENTIAL,domain:DOMAIN.EPISTEMOLOGICAL,reason:GAP_REASON.IDENTITY_REFLECTION,description:'High assertion density without evidence markers — claims without proof',score:s,evidence:{metric:assertRate,pattern:'assertion_without_evidence'}});}
  const negRate=(text.match(/\b(however|but|although|despite|yet|nevertheless|conversely|on the other hand)\b/gi)||[]).length/Math.max(1,wc);
  if(negRate>0.03&&wc>100){const s=Math.min(0.7,negRate*15);if(s>=min)gaps.push({type:GAP_TYPE.LOGICAL,domain:DOMAIN.LOGIC,reason:GAP_REASON.COMPATIBILITY,description:'High contradiction density — internal tensions unresolved',score:s,evidence:{metric:negRate,pattern:'contradiction_density'}});}
  if(text.includes('```')||text.includes('function ')||text.includes('const ')){
    const todos=(text.match(/\bTODO\b|\bFIXME\b|\bHACK\b|\bXXX\b/g)||[]).length;
    if(todos>0)gaps.push({type:GAP_TYPE.OBLIGATION,domain:DOMAIN.CODE,reason:GAP_REASON.DEFERRED_VARIABLE,description:`${todos} deferred variable(s) — §1.3 violation: stubs in output`,score:Math.min(0.9,0.3+todos*0.15),evidence:{metric:todos,pattern:'todo_markers'}});
    const stubs=(text.match(/\/\/ stub|pass\s*$|throw new Error\(['"]not implemented/gim)||[]).length;
    if(stubs>0)gaps.push({type:GAP_TYPE.OBLIGATION,domain:DOMAIN.CODE,reason:GAP_REASON.DEFERRED_VARIABLE,description:`${stubs} stub/unimplemented — §1.3 violation`,score:0.85,evidence:{metric:stubs,pattern:'stubs'}});
  }
  return gaps;
}

// ══════════════════════════════════════════════════════════════════════════════
//  PROMPT ARCHAEOLOGY
// ══════════════════════════════════════════════════════════════════════════════

function newPASession() {
  return { id:Date.now(),startTime:null,chunks:[],totalTokens:0,burstZones:[],pauseZones:[],entropyHistory:[],structureEvents:[],hypotheses:[] };
}

function entropy(str) {
  if(!str||!str.length)return 0;
  const freq={}; for(const ch of str)freq[ch]=(freq[ch]||0)+1;
  const n=str.length; let H=0; for(const f of Object.values(freq)){const p=f/n;H-=p*Math.log2(p);}
  return parseFloat(H.toFixed(3));
}

function bulletDensity(text) { const l=text.split('\n'); return l.filter(x=>/^\s*[-*•]|\d+\./.test(x)).length/Math.max(1,l.length); }
function lexicalDiversity(text) { const w=text.toLowerCase().match(/\b\w+\b/g)||[]; return w.length<5?1:parseFloat((new Set(w).size/w.length).toFixed(3)); }

function detectBurstsAndPauses(session) {
  const bursts=[],pauses=[],chunks=session.chunks;
  if(chunks.length<3)return{bursts,pauses};
  const rates=chunks.slice(1).map((c,i)=>{const dt=c.t-chunks[i].t;return{t:c.t,dt,tps:dt>0?(c.tokens/dt)*1000:0};});
  const tpsVals=rates.map(r=>r.tps),mean=tpsVals.reduce((a,b)=>a+b,0)/tpsVals.length;
  const std=Math.sqrt(tpsVals.map(v=>(v-mean)**2).reduce((a,b)=>a+b,0)/tpsVals.length);
  let burstStart=null;
  for(let i=0;i<rates.length;i++){const r=rates[i];if(r.tps>mean+std){if(!burstStart)burstStart=r.t;}else{if(burstStart){bursts.push({start:burstStart,end:r.t,rate:r.tps});burstStart=null;}}if(r.dt>500)pauses.push({t:r.t,duration:r.dt});}
  return{bursts,pauses};
}

function generateHypotheses(session) {
  const hyps=[],text=session.chunks.map(c=>c.text).join('');
  const{bursts,pauses}=detectBurstsAndPauses(session);
  const ld=lexicalDiversity(text),bd=bulletDensity(text);
  const totalDur=session.chunks.length>1?session.chunks.at(-1).t-session.chunks[0].t:0;
  const avgTps=totalDur>0?(session.totalTokens/totalDur)*1000:0;
  session.burstZones=bursts;session.pauseZones=pauses;
  const structEvents=[];
  if(pauses.length>=3)hyps.push({label:'Inference hesitation zones',confidence:Math.min(0.85,0.4+pauses.length*0.08),evidence:[`${pauses.length} pauses >500ms`,`longest: ${Math.max(...pauses.map(p=>p.duration)).toFixed(0)}ms`]});
  if(bursts.length>=3&&avgTps>20)hyps.push({label:'Pre-planned content burst',confidence:0.65,evidence:[`${bursts.length} burst clusters`,`~${avgTps.toFixed(1)} tok/s`]});
  if(ld<0.35)hyps.push({label:'Context window pressure / compressive phrasing',confidence:Math.min(0.8,0.4+(1-ld)*2),evidence:[`Lexical diversity: ${ld}`,'Repetitive vocabulary signal']});
  if(bd>0.5)hyps.push({label:'Mode shift: direct → structured synthesis',confidence:Math.min(0.9,0.5+bd),evidence:[`Bullet density: ${(bd*100).toFixed(0)}%`,'Structure-heavy response']});
  if(!hyps.length)hyps.push({label:'No strong behavioral signals',confidence:0.5,evidence:['Low-signal or short response']});
  return hyps;
}

// ══════════════════════════════════════════════════════════════════════════════
//  SESSION GREETING
// ══════════════════════════════════════════════════════════════════════════════

function isChatBlank() {
  return document.querySelectorAll('[data-testid="assistant-message"],[data-testid="human-message"]').length===0;
}

function sendGreeting(chatId) {
  if(!CFG.session_greeting_enabled||greetedChats.has(chatId))return;
  greetedChats.add(chatId); saveGreeted();
  let attempts=0;
  function tryInject(){
    attempts++;if(attempts>20)return;if(!isChatBlank())return;
    setTimeout(()=>{
      const ok=injectText(CFG.session_greeting_text);
      if(!ok){setTimeout(tryInject,500);return;}
      addLog('sys','Session greeting injected',chatId.slice(0,8));
      ledgerRecord('SYSTEM',`Session greeting → #${chatId.slice(0,8)}`);
      setTimeout(()=>{submit();watchForSessionName(chatId);},600);
    },300);
  }
  setTimeout(tryInject,CFG.greeting_delay_ms||1200);
}

function watchForSessionName(chatId) {
  let attempts=0;
  function poll(){
    attempts++;if(attempts>60)return;
    const msgs=document.querySelectorAll('[data-testid="assistant-message"]');
    if(!msgs.length){setTimeout(poll,500);return;}
    const text=(msgs[msgs.length-1].innerText||msgs[msgs.length-1].textContent||'').trim();
    if(text.length<10){setTimeout(poll,500);return;}
    const m=text.match(/[""]([^""]{3,60})[""]/)
      ||text.match(/calling (?:this |it |the session )?["']?([A-Z][^.!?\n]{2,50})["']?/i)
      ||text.match(/session[:\s]+["']?([A-Z][^.!?\n]{2,40})["']?/i);
    if(m){
      const sessionName=m[1].trim();
      addLog('ok',`Session: ${sessionName}`,chatId.slice(0,8));
      ledgerRecord('SYSTEM',`Session: "${sessionName}"`,{chatId,sessionName});
      sendToServer({type:'GUARDIAN_SESSION_NAMED',chatId,sessionName,account:getAccount(),provider:PROVIDER,chatUrl:location.href});
      apiPost('/sessions/'+chatId+'/name',{name:sessionName,account:getAccount(),provider:PROVIDER,chatUrl:location.href}).catch(()=>{});
      try{sessionStorage.setItem('guardian_session_'+chatId,sessionName);}catch(_){}
    }
  }
  setTimeout(poll,2000);
}

// ── Navigation watcher ────────────────────────────────────────────────────────
function onNavigate(){
  const newPath=location.pathname,newChatId=chatIdFromUrl();
  if(newPath===lastPathname)return;
  lastPathname=newPath;
  if(newChatId&&newChatId!=='home'&&newChatId!==lastChatId){
    lastChatId=newChatId;
    addLog('sys','New chat',newChatId.slice(0,8));
    setTimeout(()=>{if(isChatBlank())sendGreeting(newChatId);},800);
  }
  if(!newChatId||newChatId==='home'){
    lastChatId='pending';
    let w=0;
    function watchId(){w++;if(w>30)return;const id=chatIdFromUrl();if(id&&id!=='home'&&id!=='pending'){lastChatId=id;setTimeout(()=>{if(isChatBlank())sendGreeting(id);},600);return;}setTimeout(watchId,300);}
    setTimeout(watchId,500);
  }
}

function startNavigationWatcher(){
  setInterval(onNavigate,500);
  const op=history.pushState.bind(history),or=history.replaceState.bind(history);
  history.pushState=(...a)=>{op(...a);setTimeout(onNavigate,100);};
  history.replaceState=(...a)=>{or(...a);setTimeout(onNavigate,100);};
  window.addEventListener('popstate',()=>setTimeout(onNavigate,100));
}

// ══════════════════════════════════════════════════════════════════════════════
//  ARTIFACT STORE
// ══════════════════════════════════════════════════════════════════════════════

function artifactSave(entry) {
  if(artifactStore.find(a=>a.hash===entry.hash))return null;
  const full={id:uid(),hash:entry.hash,name:entry.name||'artifact',type:entry.type||'code_block',lang:entry.lang||null,content:entry.content||'',context:entry.context||null,chatUrl:entry.chatUrl||location.href,chatId:entry.chatId||chatIdFromUrl(),account:entry.account||getAccount(),jobId:entry.jobId||currentJobId,ts:entry.ts||Date.now(),direction:entry.direction||'output'};
  artifactStore.unshift(full);
  if(artifactStore.length>ARTIFACT_MAX)artifactStore.pop();
  if(CFG.memory_auto_push)sendToMemory({type:'ARTIFACT',payload:full});
  sisoEmit('guardian.artifact',full);
  return full;
}

// ══════════════════════════════════════════════════════════════════════════════
//  MEMORY / DOWNLOAD INTERCEPT
// ══════════════════════════════════════════════════════════════════════════════

function sendToMemory(obj) {
  const body=JSON.stringify({...obj,source:'guardian-claude-v8',chatUrl:location.href,account:getAccount(),chatId:chatIdFromUrl(),ts:Date.now()});
  if(typeof GM_xmlhttpRequest!=='undefined'){GM_xmlhttpRequest({method:'POST',url:`${MEMORY_URL}/ingest`,headers:{'Content-Type':'application/json'},data:body,onerror:()=>{}});}
  else{fetch(`${MEMORY_URL}/ingest`,{method:'POST',headers:{'Content-Type':'application/json'},body}).catch(()=>{});}
}

function interceptDownloads() {
  document.addEventListener('click',(e)=>{
    const a=e.target.closest('a[download],a[href*="blob:"],a[href*="data:"]');if(!a)return;
    const filename=a.getAttribute('download')||a.href.split('/').pop()||'download';
    const entry={id:uid(),ts:Date.now(),filename,href:a.href,chatUrl:location.href,chatId:chatIdFromUrl(),account:getAccount(),jobId:currentJobId,type:'download'};
    detectedDownloads.unshift(entry);if(detectedDownloads.length>100)detectedDownloads.pop();
    addLog('in',`Download: ${filename}`);
    sendToMemory({type:'DOWNLOAD',payload:entry});
    sendToServer({type:'GUARDIAN_DOWNLOAD',...entry,provider:PROVIDER});
    if(activeTab==='artifacts')renderArtifactsTab();
  },true);
}

// ══════════════════════════════════════════════════════════════════════════════
//  LEDGER
// ══════════════════════════════════════════════════════════════════════════════

const LEDGER_COLORS={UPGRADE:'#34d399',IDEA:'#a78bfa',EVENT:'#94a3b8',GAP:'#f472b6',SYSTEM:'#818cf8',INPUT:'#60a5fa',OUTPUT:'#a78bfa'};

function ledgerRecord(category,msg,meta={}) {
  const entry={ts:Date.now(),category,msg,meta,icon:{UPGRADE:'⬆',IDEA:'💡',EVENT:'◈',GAP:'△',SYSTEM:'◉',INPUT:'↓',OUTPUT:'↑'}[category]||'·',color:LEDGER_COLORS[category]||'#94a3b8'};
  ledgerEntries.unshift(entry);
  if(ledgerEntries.length>LEDGER_MAX)ledgerEntries.pop();
  sendToServer({type:'GUARDIAN_LEDGER_EVENT',level:category,category,msg,meta,chatUrl:location.href,account:getAccount(),requestId:currentJobId});
  sendToMemory({type:'LEDGER',payload:entry});
  sisoEmit('guardian.ledger',{category,msg,meta});
  return entry;
}

// ══════════════════════════════════════════════════════════════════════════════
//  DOM SCANNER
// ══════════════════════════════════════════════════════════════════════════════

function scanDOM() {
  const systems={};
  for(const{selector,type}of SYSTEM_SELECTORS){
    const els=document.querySelectorAll(selector);if(!els.length)continue;
    if(!systems[type])systems[type]={type,count:0,lastSeen:Date.now(),samples:[]};
    systems[type].count+=els.length;
    const last=els[els.length-1];
    const sample=(last.innerText||last.textContent||'').trim().slice(0,80);
    if(sample&&!systems[type].samples.includes(sample))systems[type].samples.push(sample);
    if(type==='artifact'||type==='code_block'){
      for(const el of els){
        const content=(el.innerText||el.textContent||'').trim();if(!content||content.length<10)continue;
        const hash=simpleHash(content);if(seenArtifactHashes.has(hash))continue;
        seenArtifactHashes.add(hash);
        const lang=detectLang(el),name=detectArtifactName(el);
        const msgEl=el.closest('[data-testid="assistant-message"]')||el.closest('.font-claude-message');
        const context=msgEl?(msgEl.innerText||'').slice(0,300):null;
        const saved=artifactSave({hash,name,type,lang,content:content.slice(0,8000),context,direction:'output'});
        if(saved){
          addLog('out',`${type} · ${lang||'text'} · ${content.length}ch`,name);
          ledgerRecord('OUTPUT',`${type} · ${lang||'text'} · ${content.length}ch`,{type,lang,hash,jobId:currentJobId});
          sendToServer({type:'GUARDIAN_ARTIFACT',jobId:currentJobId,content:content.slice(0,4000),lang,hash,name,chatUrl:location.href,account:getAccount(),provider:PROVIDER});
          if(activeTab==='artifacts')renderArtifactsTab();
        }
      }
    }
  }
  domSystems=systems;
  sendToServer({type:'GUARDIAN_DOM_SYSTEMS',systems:Object.values(systems),chatId:chatIdFromUrl(),chatUrl:location.href,account:getAccount()});
}

function scheduleScan(){clearTimeout(scanDebounceTimer);scanDebounceTimer=setTimeout(scanDOM,CFG.scan_debounce_ms);}

function startDOMObserver(){
  if(domObserver)return;
  domObserver=new MutationObserver(()=>{scheduleScan();detectFileChips();});
  domObserver.observe(document.body,{childList:true,subtree:true});
  setTimeout(scanDOM,800);
  document.addEventListener('change',(e)=>{if(e.target?.type==='file'&&e.target.files?.length>0){onFilesDetected(Array.from(e.target.files).map(f=>({name:f.name,size:f.size,type:f.type})));}},true);
}

const seenFileChips=new Set();
function detectFileChips(){
  for(const sel of['[data-testid="file-attachment"]','.file-chip','[class*="file-attachment"]']){
    for(const chip of document.querySelectorAll(sel)){
      const name=(chip.getAttribute('aria-label')||chip.querySelector('[class*="name"]')?.textContent||chip.textContent||'').trim().slice(0,100);
      if(!name||seenFileChips.has(name))continue;seenFileChips.add(name);onFilesDetected([{name,size:null,type:'unknown'}]);
    }
  }
}

function onFilesDetected(files){
  if(!files?.length)return;
  addLog('in',`File upload: ${files.map(f=>f.name).join(', ')}`);
  ledgerRecord('INPUT',`Upload: ${files.map(f=>f.name).join(', ')}`,{files});
  sendToServer({type:'GUARDIAN_FILE_UPLOAD',jobId:currentJobId,files,chatUrl:location.href,account:getAccount()});
}

// ══════════════════════════════════════════════════════════════════════════════
//  AGENT ENDPOINT POLLING
// ══════════════════════════════════════════════════════════════════════════════

function startAgentEndpointPolling(){
  if(agentPollInterval)return;agentEndpointActive=true;
  addLog('sys','Agent polling active',API_URL+'/jobs?status=pending');
  agentPollInterval=setInterval(async()=>{
    try{
      const r=await fetch(`${API_URL}/jobs?status=pending&limit=5`);if(!r.ok)return;
      const data=await r.json();
      for(const job of(data.jobs||[])){if(job.provider===PROVIDER&&job.status==='pending')handleJob({jobId:job.id,command:job.command,prompt:job.prompt,content:job.content});}
    }catch(_){}
  },2000);
  updateApiStatusEl();
}
function stopAgentEndpointPolling(){if(agentPollInterval){clearInterval(agentPollInterval);agentPollInterval=null;}agentEndpointActive=false;updateApiStatusEl();}
function updateApiStatusEl(){const el=document.getElementById('__g8api_status__');if(!el)return;el.textContent=agentEndpointActive?'● ACTIVE':'○ INACTIVE';el.style.color=agentEndpointActive?'#34d399':'#475569';}

// ══════════════════════════════════════════════════════════════════════════════
//  STYLES
// ══════════════════════════════════════════════════════════════════════════════

function injectStyles(){
  const s=document.createElement('style');
  s.textContent=`
    @keyframes gpulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.8)}}
    @keyframes gfadein{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
    #__g8root__{position:fixed;bottom:16px;right:16px;z-index:2147483647;font-family:'SF Mono','Fira Code',monospace;font-size:11px;user-select:none}
    #__g8pill__{display:flex;align-items:center;gap:7px;background:rgba(15,15,20,.92);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,.08);border-radius:20px;padding:5px 12px 5px 8px;cursor:pointer;box-shadow:0 4px 20px rgba(0,0,0,.5);transition:opacity .2s;margin-left:auto}
    #__g8pill__:hover{opacity:.85}
    #__g8panel__{width:440px;background:rgba(10,10,16,.97);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.08);border-radius:12px;box-shadow:0 8px 40px rgba(0,0,0,.7);overflow:hidden;margin-bottom:8px;display:none;flex-direction:column;animation:gfadein .15s ease}
    #__g8tabs__{display:flex;border-bottom:1px solid rgba(255,255,255,.06);background:rgba(0,0,0,.3);flex-shrink:0}
    .g8tab{flex:1;padding:7px 3px;text-align:center;cursor:pointer;font-size:9.5px;color:#334155;border-bottom:2px solid transparent;transition:all .15s;letter-spacing:.04em;font-weight:600;text-transform:uppercase}
    .g8tab:hover{color:#64748b}.g8tab.active{color:#cbd5e1;border-bottom-color:#6366f1}
    #__g8log__,#__g8ledger__,#__g8artifacts__,#__g8gaps__,#__g8pa__{flex:1;overflow-y:auto;padding:6px 0;min-height:200px;max-height:360px}
    #__g8log__::-webkit-scrollbar,#__g8ledger__::-webkit-scrollbar,#__g8artifacts__::-webkit-scrollbar,#__g8gaps__::-webkit-scrollbar,#__g8pa__::-webkit-scrollbar{width:3px}
    #__g8log__::-webkit-scrollbar-thumb,#__g8ledger__::-webkit-scrollbar-thumb,#__g8artifacts__::-webkit-scrollbar-thumb,#__g8gaps__::-webkit-scrollbar-thumb,#__g8pa__::-webkit-scrollbar-thumb{background:#1e293b;border-radius:3px}
    .g8row:hover,.g8lrow:hover{background:rgba(255,255,255,.03)!important}
    #__g8settings__{flex:1;overflow-y:auto;padding:10px 12px;min-height:200px;max-height:360px}
    #__g8api__{flex:1;overflow-y:auto;padding:10px 12px;min-height:200px;max-height:360px}
    /* --- artifact cards --- */
    .ga-search{background:#060610;border:1px solid #1e1e3a;color:#94a3b8;font-family:inherit;font-size:10px;padding:5px 10px;width:100%;box-sizing:border-box;outline:none;margin-bottom:6px}
    .ga-fb{display:flex;gap:4px;margin-bottom:6px;flex-wrap:wrap}
    .ga-f{background:#0d0d1a;border:1px solid rgba(255,255,255,.08);color:#334155;border-radius:3px;padding:1px 6px;font-size:9px;cursor:pointer;font-family:inherit}
    .ga-f.on{border-color:#6366f1;color:#a5b4fc;background:#1e1e3a}
    .ga-card{border:1px solid #1e1e3a;border-radius:5px;margin-bottom:5px;overflow:hidden;cursor:pointer;transition:border-color .15s}
    .ga-card:hover{border-color:#334155}.ga-card.exp{border-color:#4f46e5}
    .ga-hdr{display:flex;align-items:center;gap:7px;padding:6px 10px;background:#080812;font-size:.75rem}
    .ga-name{color:#cbd5e1;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
    .ga-lang{color:#475569;font-size:.62rem}.ga-ts{color:#1e293b;font-size:.6rem}
    .ga-body{padding:7px 10px;border-top:1px solid #1e1e3a;background:#060610}
    .ga-meta{display:flex;gap:8px;font-size:.62rem;margin-bottom:5px;flex-wrap:wrap}
    .ga-ml{color:#1e293b;text-transform:uppercase;letter-spacing:.08em}.ga-mv{color:#475569}
    .ga-mv.url{color:#4f46e5;cursor:pointer;text-decoration:underline}
    .ga-ctx{color:#334155;font-size:.62rem;padding:3px 0;border-top:1px solid #1e1e3a;margin-top:3px;max-height:50px;overflow-y:auto;white-space:pre-wrap}
    .ga-pre{background:#030308;border:1px solid #1e1e3a;border-radius:3px;padding:5px 8px;font-size:.65rem;color:#64748b;white-space:pre-wrap;word-break:break-all;max-height:140px;overflow-y:auto;margin-top:4px;font-family:inherit}
    .ga-acts{display:flex;gap:3px;margin-top:5px}
    .ga-btn{background:none;border:1px solid rgba(255,255,255,.08);color:#475569;border-radius:3px;padding:2px 7px;font-size:.65rem;cursor:pointer;font-family:inherit}
    .ga-btn:hover{border-color:#6366f1;color:#a5b4fc}
    .ga-stats{display:flex;gap:6px;padding:6px 0;flex-wrap:wrap;margin-bottom:4px}
    .ga-stat{background:#080812;border:1px solid #1e1e3a;border-radius:3px;padding:3px 8px;font-size:.65rem}
    .ga-sv{color:#a0d0ff;font-weight:600}.ga-sl{color:#1e293b}
    /* --- gap tab --- */
    .gg-row{padding:3px 0;border-bottom:1px solid rgba(30,30,58,.5);display:flex;gap:6px;font-size:.68rem;align-items:flex-start}
    .gg-type{font-weight:700;flex-shrink:0;width:76px}.gg-domain{color:#475569;flex-shrink:0;width:80px;font-size:.6rem}
    .gg-reason{color:#1e293b;flex-shrink:0;width:82px;font-size:.58rem}
    .gg-desc{color:#475569;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .gg-score{flex-shrink:0;width:32px;text-align:right;font-weight:700}
    .gg-stats{display:flex;gap:6px;padding:4px 0;margin-bottom:4px;flex-wrap:wrap}
    .gg-drift{display:flex;align-items:center;gap:6px;margin-bottom:6px}
    .gg-dbar{flex:1;height:3px;background:#1e1e3a;border-radius:2px;overflow:hidden}
    .gg-dfill{height:100%;background:#f472b6;border-radius:2px;transition:width .5s}
    /* --- PA tab --- */
    .pa-mets{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-bottom:6px}
    .pa-met{background:#080812;border:1px solid #1e1e3a;border-radius:3px;padding:4px 6px;text-align:center}
    .pa-mv{color:#a0d0ff;font-size:.85rem;font-weight:600}.pa-ml{color:#1e293b;font-size:.58rem;text-transform:uppercase}
    .pa-canvas{width:100%;height:64px;border:1px solid #1e1e3a;border-radius:3px;background:#050510;display:block;margin-bottom:6px}
    .pa-hyp{background:#060610;border-left:2px solid #6366f1;padding:4px 7px;margin-bottom:3px}
    .pa-hl{color:#c7d2fe;font-size:.7rem;margin-bottom:2px}.pa-hc{color:#6366f1;font-size:.62rem}
    .pa-bar{height:2px;background:#1e1e3a;border-radius:2px;overflow:hidden;margin:2px 0}
    .pa-barf{height:100%;background:#818cf8;border-radius:2px}
    /* --- settings tab --- */
    .gs-card{background:#080812;border:1px solid #1e1e3a;border-radius:5px;padding:8px 10px;margin-bottom:6px}
    .gs-key{font-size:.6rem;color:#334155;text-transform:uppercase;letter-spacing:.1em;margin-bottom:2px}
    .gs-label{font-size:.74rem;color:#cbd5e1;margin-bottom:4px;font-weight:600}
    .gs-desc{font-size:.6rem;color:#1e293b;margin-bottom:6px}
    input[type=range]{width:100%;accent-color:#6366f1;cursor:pointer}
    .gs-card input[type=text],.gs-card textarea,.gs-card select{background:#050510;border:1px solid #1e1e3a;color:#94a3b8;padding:4px 7px;font-family:inherit;font-size:.7rem;width:100%;outline:none;box-sizing:border-box}
    .gs-card textarea{resize:vertical;min-height:52px;font-size:.65rem}
    .gs-tgl{position:relative;width:32px;height:18px;cursor:pointer;display:inline-block}
    .gs-tgl input{opacity:0;width:0;height:0}
    .gs-tsl{position:absolute;inset:0;background:#1e1e3a;border-radius:18px;transition:.2s}
    .gs-tsl::before{content:'';position:absolute;height:12px;width:12px;left:3px;bottom:3px;background:#334155;border-radius:50%;transition:.2s}
    .gs-tgl input:checked+.gs-tsl{background:#6366f1}
    .gs-tgl input:checked+.gs-tsl::before{transform:translateX(14px);background:#fff}
    .gs-save{background:#0d0d1a;border:1px solid rgba(255,255,255,.12);color:#64748b;border-radius:3px;padding:3px 8px;font-size:.68rem;cursor:pointer;font-family:inherit;margin-top:5px}
    .gs-save:hover{border-color:#6366f1;color:#a5b4fc}
    /* --- api tab --- */
    .gapi-card{background:#080812;border:1px solid #1e1e3a;border-radius:4px;padding:7px 10px;margin-bottom:5px}
    .gapi-t{color:#818cf8;font-size:.65rem;font-weight:700;margin-bottom:3px;letter-spacing:.06em}
    .gapi-v{color:#64748b;font-size:.7rem;word-break:break-all}
    .gapi-v.ok{color:#34d399}.gapi-v.url{color:#4f46e5;cursor:pointer}
    .gapi-btn{background:#0d0d1a;border:1px solid rgba(255,255,255,.1);color:#64748b;border-radius:3px;padding:3px 8px;font-size:.68rem;cursor:pointer;font-family:inherit;margin-right:3px;margin-bottom:3px}
    .gapi-btn:hover{border-color:#6366f1;color:#a5b4fc}.gapi-btn.on{border-color:#34d399;color:#34d399}
    .gapi-ep{display:flex;align-items:center;gap:5px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,.03);font-size:.68rem}
    .gapi-m{font-weight:700;flex-shrink:0;width:34px}.gapi-m.get{color:#34d399}.gapi-m.post{color:#f59e0b}
    .gapi-p{color:#64748b;flex:1}.gapi-d{color:#1e293b;font-size:.6rem}
  `;
  document.head.appendChild(s);
}

// ══════════════════════════════════════════════════════════════════════════════
//  UI BUILD
// ══════════════════════════════════════════════════════════════════════════════

function el(tag,id,styles){const e=document.createElement(tag);if(id)e.id=id;Object.assign(e.style,styles||{});return e;}

function buildUI(){
  injectStyles();
  const root=el('div','__g8root__',{});
  document.body.appendChild(root);

  // Pill
  const pill=el('div','__g8pill__',{});
  const dot=el('div','__g8dot__',{width:'7px',height:'7px',borderRadius:'50%',background:'#888',transition:'background .4s',flexShrink:'0'});
  const lbl=el('span','__g8label__',{color:'#cbd5e1',fontSize:'11px',fontWeight:'500'});lbl.textContent='Guardian';
  const prov=el('span',null,{color:'#475569',fontSize:'10px',borderLeft:'1px solid rgba(255,255,255,.1)',paddingLeft:'7px',marginLeft:'1px'});prov.textContent='claude v8';
  const badge=el('span','__g8badge__',{background:'#7c3aed',color:'#fff',borderRadius:'10px',padding:'0 5px',fontSize:'10px',display:'none',fontWeight:'600'});
  pill.append(dot,lbl,prov,badge);

  // Panel
  const panel=el('div','__g8panel__',{});
  const hdr=el('div',null,{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px',borderBottom:'1px solid rgba(255,255,255,.07)',background:'rgba(255,255,255,.03)',flexShrink:'0'});
  const hdrL=el('div',null,{display:'flex',alignItems:'center',gap:'8px'});
  const hdrDot=el('div','__g8hdrdot__',{width:'8px',height:'8px',borderRadius:'50%',background:'#888',flexShrink:'0'});
  const hdrTitle=el('span',null,{color:'#e2e8f0',fontWeight:'600',fontSize:'12px'});hdrTitle.textContent='Guardian v8';
  const hdrBadge=el('span','__g8hdrbadge__',{fontSize:'9px',padding:'1px 7px',borderRadius:'10px',background:'rgba(136,136,136,.2)',color:'#888',textTransform:'uppercase',letterSpacing:'.06em',fontWeight:'600'});hdrBadge.textContent='DISCONNECTED';
  hdrL.append(hdrDot,hdrTitle,hdrBadge);
  const clearBtn=el('button',null,{background:'none',border:'1px solid rgba(255,255,255,.1)',color:'#475569',borderRadius:'6px',padding:'2px 8px',cursor:'pointer',fontSize:'10px'});clearBtn.textContent='Clear';clearBtn.onclick=()=>{logEntries=[];ledgerEntries=[];renderActiveTab();};
  hdr.append(hdrL,clearBtn);

  const jobBar=el('div','__g8jobbar__',{display:'none',alignItems:'center',gap:'8px',padding:'7px 14px',background:'rgba(251,191,36,.08)',borderBottom:'1px solid rgba(251,191,36,.15)',flexShrink:'0'});
  const jDot=el('div',null,{width:'6px',height:'6px',borderRadius:'50%',background:'#fbbf24',animation:'gpulse 1.2s ease-in-out infinite',flexShrink:'0'});
  const jText=el('span','__g8jobtext__',{color:'#fde68a',fontSize:'10px',fontWeight:'500',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:'1'});jText.textContent='Job running…';
  const jId=el('span','__g8jobid__',{color:'#78716c',fontSize:'9px'});
  jobBar.append(jDot,jText,jId);

  // Systems strip
  const sysStrip=el('div','__g8sys__',{padding:'5px 14px',borderBottom:'1px solid rgba(255,255,255,.05)',display:'flex',flexWrap:'wrap',gap:'4px'});
  sysStrip.style.display='none';

  // Tabs: Log | Artifacts | Gaps | PA | Settings | API
  const tabs=el('div','__g8tabs__',{});
  const TAB_LIST=[['log','Log'],['artifacts','Artifacts'],['gaps','Gaps'],['pa','PA'],['settings','Settings'],['api','API']];
  for(const[id,lbl] of TAB_LIST)makeTab(id,lbl,tabs);

  // Content areas
  const logArea=el('div','__g8log__',{});
  const artsArea=el('div','__g8artifacts__',{display:'none',padding:'8px 10px'});
  const gapsArea=el('div','__g8gaps__',{display:'none',padding:'8px 10px'});
  const paArea=el('div','__g8pa__',{display:'none',padding:'8px 10px'});
  const settingsArea=el('div','__g8settings__',{display:'none'});
  const apiArea=el('div','__g8api__',{display:'none'});

  // Footer
  const footer=el('div',null,{padding:'7px 14px',borderTop:'1px solid rgba(255,255,255,.05)',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:'0'});
  const fL=el('span','__g8footer__',{color:'#334155',fontSize:'10px'});fL.textContent=`wss://127.0.0.1:7821 · claude`;
  const fR=el('span',null,{color:'#1e293b',fontSize:'10px'});fR.textContent=`v${VERSION}`;
  footer.append(fL,fR);

  panel.append(hdr,jobBar,sysStrip,tabs,logArea,artsArea,gapsArea,paArea,settingsArea,apiArea,footer);

  pill.addEventListener('click',()=>{
    panelOpen=!panelOpen;panel.style.display=panelOpen?'flex':'none';
    if(panelOpen){renderActiveTab();unreadCount=0;badge.style.display='none';renderSysStrip();}
  });

  root.append(panel,pill);
}

function makeTab(id,label,container){
  const t=el('div',null,{});t.className='g8tab'+(id===activeTab?' active':'');
  t.textContent=label;t.dataset.tab=id;t.addEventListener('click',()=>switchTab(id));
  container.appendChild(t);
}

function switchTab(id){
  activeTab=id;
  document.querySelectorAll('.g8tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===id));
  const AREAS={log:'__g8log__',artifacts:'__g8artifacts__',gaps:'__g8gaps__',pa:'__g8pa__',settings:'__g8settings__',api:'__g8api__'};
  for(const[k,elId]of Object.entries(AREAS)){const e=document.getElementById(elId);if(e)e.style.display=k===id?'block':'none';}
  // pa canvas needs 'block' -> inline-block for height
  const pac=document.getElementById('__g8pa__');if(pac&&id==='pa')pac.style.display='block';
  renderActiveTab();
}

function renderActiveTab(){
  if(activeTab==='log')       renderLog();
  if(activeTab==='artifacts') renderArtifactsTab();
  if(activeTab==='gaps')      renderGapsTab();
  if(activeTab==='pa')        renderPATab();
  if(activeTab==='settings')  renderSettingsTab();
  if(activeTab==='api')       renderApiTab();
}

// ── Log tab ───────────────────────────────────────────────────────────────────

const LOG_TYPES={info:{color:'#94a3b8',icon:'·'},in:{color:'#60a5fa',icon:'↓'},out:{color:'#a78bfa',icon:'↑'},ok:{color:'#34d399',icon:'✓'},err:{color:'#f87171',icon:'✗'},job:{color:'#fbbf24',icon:'⚡'},hb:{color:'#475569',icon:'♥'},sys:{color:'#818cf8',icon:'◈'},gap:{color:'#f472b6',icon:'△'}};
const COLORS={connecting:{dot:'#888',label:'Connecting…',badge:'#888'},handshaking:{dot:'#f59e0b',label:'Handshaking…',badge:'#f59e0b'},ready:{dot:'#22c55e',label:'Ready',badge:'#22c55e'},disconnected:{dot:'#ef4444',label:'Disconnected',badge:'#ef4444'}};

function addLog(type,msg,detail){
  const t=LOG_TYPES[type]||LOG_TYPES.info;
  const entry={ts:Date.now(),type,msg,detail:detail||null,color:t.color,icon:t.icon};
  logEntries.push(entry);if(logEntries.length>LOG_MAX)logEntries.shift();
  if(panelOpen&&activeTab==='log'){renderLogEntry(entry);scrollLog();}
  else if(type!=='hb'){unreadCount++;const b=document.getElementById('__g8badge__');if(b){b.textContent=unreadCount>99?'99+':unreadCount;b.style.display='inline';}}
}

function renderLog(){const a=document.getElementById('__g8log__');if(!a)return;a.innerHTML='';logEntries.forEach(e=>renderLogEntry(e));scrollLog();}
function scrollLog(){const a=document.getElementById('__g8log__');if(a)a.scrollTop=a.scrollHeight;}

function renderLogEntry(entry){
  const a=document.getElementById('__g8log__');if(!a)return;
  const row=document.createElement('div');row.className='g8row';
  Object.assign(row.style,{display:'flex',alignItems:'flex-start',gap:'8px',padding:'3px 14px',transition:'background .15s'});
  const ts=document.createElement('span');ts.textContent=fts(entry.ts);Object.assign(ts.style,{color:'#1e293b',fontSize:'10px',flexShrink:'0',paddingTop:'1px'});
  const ic=document.createElement('span');ic.textContent=entry.icon;Object.assign(ic.style,{color:entry.color,flexShrink:'0',width:'10px',textAlign:'center',paddingTop:'1px'});
  const ct=document.createElement('div');Object.assign(ct.style,{flex:'1',minWidth:'0'});
  const m=document.createElement('span');m.textContent=entry.msg;Object.assign(m.style,{color:entry.color});ct.appendChild(m);
  if(entry.detail){const d=document.createElement('div');d.textContent=entry.detail;Object.assign(d.style,{color:'#334155',fontSize:'10px',marginTop:'1px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'});ct.appendChild(d);}
  row.append(ts,ic,ct);a.appendChild(row);
}

function setConnState(state){
  connState=state;const c=COLORS[state]||COLORS.disconnected;
  const d=document.getElementById('__g8dot__');if(d)d.style.background=c.dot;
  const l=document.getElementById('__g8label__');if(l)l.textContent=c.label==='Ready'?'Guardian':c.label;
  const hd=document.getElementById('__g8hdrdot__');if(hd)hd.style.background=c.dot;
  const hb=document.getElementById('__g8hdrbadge__');if(hb){hb.textContent=c.label.toUpperCase();hb.style.background=`${c.badge}22`;hb.style.color=c.badge;}
}

function setJobState(active,prompt,jobId){
  const bar=document.getElementById('__g8jobbar__');if(!bar)return;
  bar.style.display=active?'flex':'none';
  if(active){const t=document.getElementById('__g8jobtext__');if(t)t.textContent=(prompt||'Job running…').slice(0,60);const i=document.getElementById('__g8jobid__');if(i)i.textContent=jobId?`#${jobId.slice(0,8)}`:'`';}
}

function renderSysStrip(){
  const strip=document.getElementById('__g8sys__');if(!strip)return;
  if(!Object.keys(domSystems).length){strip.style.display='none';return;}
  strip.style.display='flex';strip.innerHTML='';
  for(const[type,info]of Object.entries(domSystems)){
    const b=document.createElement('span');
    Object.assign(b.style,{background:'rgba(99,102,241,.1)',border:'1px solid rgba(99,102,241,.25)',color:'#818cf8',borderRadius:'3px',padding:'1px 6px',fontSize:'9px'});
    b.textContent=`${type.replace('_',' ')} ×${info.count}`;strip.appendChild(b);
  }
}

// ── Artifacts tab ─────────────────────────────────────────────────────────────

let artFilter='all', artSearch='', artExpanded=new Set();
const ART_ICONS={typescript:'🔷',ts:'🔷',javascript:'🟨',js:'🟨',python:'🐍',html:'🌐',css:'🎨',json:'📋',bash:'💲',sh:'💲',rust:'🦀',go:'🟦'};

function renderArtifactsTab(){
  const area=document.getElementById('__g8artifacts__');if(!area)return;area.innerHTML='';
  const total=artifactStore.length,langs=[...new Set(artifactStore.map(a=>a.lang).filter(Boolean))];
  area.innerHTML=`<div class="ga-stats"><div class="ga-stat"><span class="ga-sv">${total}</span> <span class="ga-sl">arts</span></div><div class="ga-stat"><span class="ga-sv">${langs.length}</span> <span class="ga-sl">langs</span></div><div class="ga-stat"><span class="ga-sv">${detectedDownloads.length}</span> <span class="ga-sl">dls</span></div><div class="ga-stat"><span class="ga-sv">${[...new Set(artifactStore.map(a=>a.chatId))].length}</span> <span class="ga-sl">chats</span></div></div>`;
  const srch=document.createElement('input');srch.className='ga-search';srch.placeholder='Search…';srch.value=artSearch;srch.oninput=e=>{artSearch=e.target.value;renderArtifactsTab();};area.appendChild(srch);
  const fb=document.createElement('div');fb.className='ga-fb';
  for(const f of['all','artifact','code_block','download','ts','js','python','html','css','json']){const b=document.createElement('button');b.className='ga-f'+(artFilter===f?' on':'');b.textContent=f;b.onclick=()=>{artFilter=f;renderArtifactsTab();};fb.appendChild(b);}
  area.appendChild(fb);
  let items=[...artifactStore.map(a=>({...a,_kind:'artifact'})),...detectedDownloads.map(d=>({...d,_kind:'download',type:'download',name:d.filename,content:d.href,lang:null}))].sort((a,b)=>b.ts-a.ts);
  if(artFilter!=='all')items=items.filter(a=>a.type===artFilter||a.lang===artFilter||(artFilter==='download'&&a._kind==='download')||(artFilter==='ts'&&(a.lang==='typescript'||a.lang==='ts'))||(artFilter==='js'&&(a.lang==='javascript'||a.lang==='js')));
  if(artSearch){const q=artSearch.toLowerCase();items=items.filter(a=>(a.name||'').toLowerCase().includes(q)||(a.lang||'').toLowerCase().includes(q)||(a.content||'').toLowerCase().includes(q));}
  if(!items.length){const em=document.createElement('div');em.style.cssText='color:#1e293b;font-size:10px;padding:20px;text-align:center';em.textContent=total===0?'No artifacts yet. Start a conversation.':'No matches.';area.appendChild(em);return;}
  for(const item of items.slice(0,80)){
    const hash=item.hash||item.id,isExp=artExpanded.has(hash),isDl=item._kind==='download';
    const card=document.createElement('div');card.className='ga-card'+(isExp?' exp':'');
    const ic=isDl?'⬇':(ART_ICONS[item.lang]||(item.type==='artifact'?'◈':'◻'));
    const nc=isDl?'#60a5fa':(item.direction==='output'?'#a78bfa':'#60a5fa');
    const hdrEl=document.createElement('div');hdrEl.className='ga-hdr';
    hdrEl.innerHTML=`<span>${ic}</span><span class="ga-name" style="color:${nc}">${escHtml(item.name||'artifact')}</span>${item.lang?`<span class="ga-lang">${item.lang}</span>`:''}<span class="ga-ts">${fts(item.ts)}</span>`;
    hdrEl.onclick=()=>{if(isExp)artExpanded.delete(hash);else artExpanded.add(hash);renderArtifactsTab();};card.appendChild(hdrEl);
    if(isExp){
      const body=document.createElement('div');body.className='ga-body';
      body.innerHTML=`<div class="ga-meta"><span><span class="ga-ml">Account </span><span class="ga-mv">${escHtml((item.account||'').slice(0,28))}</span></span><span><span class="ga-ml">Chat </span><span class="ga-mv url" onclick="window.open('${escHtml(item.chatUrl||'')}','_blank')">${(item.chatId||'').slice(0,14)}</span></span><span><span class="ga-ml">Hash </span><span class="ga-mv">${(hash||'').slice(0,8)}</span></span></div>`;
      if(item.context){const ctx=document.createElement('div');ctx.className='ga-ctx';ctx.textContent=item.context.slice(0,150);body.appendChild(ctx);}
      if(item.content){const pre=document.createElement('pre');pre.className='ga-pre';pre.textContent=item.content.slice(0,2500);body.appendChild(pre);}
      const acts=document.createElement('div');acts.className='ga-acts';
      const copyB=document.createElement('button');copyB.className='ga-btn';copyB.textContent='⎘ Copy';copyB.onclick=e=>{e.stopPropagation();navigator.clipboard.writeText(item.content||'').then(()=>{copyB.textContent='✓';setTimeout(()=>copyB.textContent='⎘ Copy',1200);});};acts.appendChild(copyB);
      const memB=document.createElement('button');memB.className='ga-btn';memB.textContent='↑ Mem';memB.onclick=e=>{e.stopPropagation();sendToMemory({type:'ARTIFACT_MANUAL_PUSH',payload:item});memB.textContent='✓';setTimeout(()=>memB.textContent='↑ Mem',1200);};acts.appendChild(memB);
      const chatB=document.createElement('button');chatB.className='ga-btn';chatB.textContent='↗ Chat';chatB.onclick=e=>{e.stopPropagation();window.open(item.chatUrl||location.href,'_blank');};acts.appendChild(chatB);
      body.appendChild(acts);card.appendChild(body);
    }
    area.appendChild(card);
  }
}

// ── Gaps tab ──────────────────────────────────────────────────────────────────

let currentGaps = [];

function renderGapsTab(){
  const area=document.getElementById('__g8gaps__');if(!area)return;area.innerHTML='';
  if(!currentGaps.length){area.innerHTML='<div style="color:#1e293b;font-size:10px;padding:16px;text-align:center">No gaps detected yet. Complete a job first.</div>';return;}
  const total=currentGaps.length,open=currentGaps.filter(g=>!g._closed).length;
  const driftScore=total>0?open/total:0;
  area.innerHTML=`<div class="gg-drift"><span style="font-size:.65rem;color:#475569">Drift</span><div class="gg-dbar"><div class="gg-dfill" style="width:${(driftScore*100).toFixed(0)}%"></div></div><span style="font-size:.7rem;font-weight:700;color:#f472b6;width:32px;text-align:right">${(driftScore*100).toFixed(0)}%</span></div>
  <div class="gg-stats">${Object.entries(currentGaps.reduce((m,g)=>{m[g.type]=(m[g.type]||0)+1;return m;},{})).map(([t,c])=>`<div class="ga-stat"><span class="ga-sv" style="color:#f472b6">${c}</span> <span class="ga-sl">${t}</span></div>`).join('')}</div>`;
  for(const g of currentGaps){
    const col=g.score>0.7?'#ef4444':g.score>0.4?'#f59e0b':'#f472b6';
    const row=document.createElement('div');row.className='gg-row';
    row.innerHTML=`<span class="gg-type" style="color:${col}">${g.type||'—'}</span><span class="gg-domain">${g.domain||'—'}</span><span class="gg-reason">${g.reason||'—'}</span><span class="gg-desc" title="${escHtml(g.description||'')}">${escHtml(g.description||'')}</span><span class="gg-score" style="color:${col}">${((g.score||0)*100).toFixed(0)}%</span>`;
    area.appendChild(row);
  }
}

// ── PA tab ────────────────────────────────────────────────────────────────────

function renderPATab(){
  const area=document.getElementById('__g8pa__');if(!area)return;area.innerHTML='';
  const session=pa.session;
  if(!session||!session.chunks.length){area.innerHTML='<div style="color:#1e293b;font-size:10px;padding:16px;text-align:center">No PA session active. Send a job first.</div>';return;}
  const elapsed=session.chunks.length>1?(session.chunks.at(-1).t-session.chunks[0].t)/1000:0;
  const tps=elapsed>0?(session.totalTokens/elapsed).toFixed(1):'—';
  const{pauses}=detectBurstsAndPauses(session);
  const avgH=session.entropyHistory.length>0?(session.entropyHistory.reduce((a,b)=>a+b,0)/session.entropyHistory.length).toFixed(2):'—';
  area.innerHTML=`<div class="pa-mets"><div class="pa-met"><div class="pa-mv">${session.totalTokens}</div><div class="pa-ml">Tokens</div></div><div class="pa-met"><div class="pa-mv">${tps}</div><div class="pa-ml">Tok/s</div></div><div class="pa-met"><div class="pa-mv">${pauses.length}</div><div class="pa-ml">Pauses</div></div><div class="pa-met"><div class="pa-mv">${avgH}</div><div class="pa-ml">Entropy</div></div></div>`;
  // Waveform canvas
  const canvas=document.createElement('canvas');canvas.className='pa-canvas';canvas.id='__g8pacanvas__';canvas.width=400;canvas.height=64;area.appendChild(canvas);
  drawWaveform(session,canvas);
  // Hypotheses
  const hyps=session.hypotheses||[];
  if(hyps.length){
    const hl=document.createElement('div');hl.style.cssText='font-size:.62rem;color:#334155;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px';hl.textContent='Hypotheses';area.appendChild(hl);
    for(const h of hyps){
      const hd=document.createElement('div');hd.className='pa-hyp';
      hd.innerHTML=`<div class="pa-hl">${escHtml(h.label)}</div><div class="pa-hc">${((h.confidence||0)*100).toFixed(0)}% confidence</div><div class="pa-bar"><div class="pa-barf" style="width:${((h.confidence||0)*100)}%"></div></div><div style="color:#334155;font-size:.6rem">${(h.evidence||[]).join(' · ')}</div>`;
      area.appendChild(hd);
    }
  }
  // Sessions archive
  if(pa.sessions.length>1){
    const sl=document.createElement('div');sl.style.cssText='font-size:.62rem;color:#334155;text-transform:uppercase;letter-spacing:.08em;margin:6px 0 3px';sl.textContent=`Archive (${pa.sessions.length-1} sessions)`;area.appendChild(sl);
    for(const sess of pa.sessions.slice(0,-1).reverse().slice(0,5)){
      const row=document.createElement('div');row.style.cssText='padding:3px 0;border-bottom:1px solid #1e1e3a;display:flex;gap:8px;font-size:.65rem';
      row.innerHTML=`<span style="color:#1e293b;width:60px">${fts(sess.id)}</span><span style="color:#475569">${sess.totalTokens} tok</span><span style="color:#818cf8">${sess.hypotheses?.length||0} hyp</span>`;
      area.appendChild(row);
    }
  }
}

function drawWaveform(session,canvas){
  if(!canvas||session.chunks.length<2)return;
  const ctx=canvas.getContext('2d'),W=canvas.width,H=canvas.height;
  ctx.clearRect(0,0,W,H);
  const velocities=[];
  for(let i=1;i<session.chunks.length;i++){const dt=session.chunks[i].t-session.chunks[i-1].t;velocities.push(dt>0?(session.chunks[i].tokens/dt)*1000:0);}
  if(velocities.length<2)return;
  const maxV=Math.max(...velocities,1),step=W/velocities.length;
  const grad=ctx.createLinearGradient(0,0,0,H);grad.addColorStop(0,'rgba(99,102,241,.6)');grad.addColorStop(1,'rgba(99,102,241,.04)');
  ctx.beginPath();ctx.moveTo(0,H);velocities.forEach((v,i)=>ctx.lineTo(i*step,H-(v/maxV)*(H-4)));ctx.lineTo(velocities.length*step,H);ctx.closePath();ctx.fillStyle=grad;ctx.fill();
  ctx.beginPath();ctx.strokeStyle='#818cf8';ctx.lineWidth=1.5;velocities.forEach((v,i)=>{const x=i*step,y=H-(v/maxV)*(H-4);i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);});ctx.stroke();
}

// ── Settings tab ──────────────────────────────────────────────────────────────

const SETTING_META=[
  {key:'session_greeting_enabled',label:'Session Greeting',type:'toggle',desc:'Auto-inject greeting on new blank chats'},
  {key:'session_greeting_text',label:'Greeting Text',type:'textarea',desc:'Text injected into blank chats — model names the session'},
  {key:'scan_debounce_ms',label:'DOM Scan Debounce',type:'range',min:200,max:5000,step:100,unit:'ms',desc:'Delay after DOM mutations before scanning'},
  {key:'artifact_max',label:'Artifact Store Limit',type:'range',min:50,max:2000,step:50,unit:'',desc:'Max artifacts kept in memory (not DB limit)'},
  {key:'gap_min_score',label:'Gap Min Score',type:'range',min:0,max:1,step:0.05,unit:'',desc:'Minimum gap magnitude to record (0=all, 1=only critical)'},
  {key:'pa_enabled',label:'Prompt Archaeology',type:'toggle',desc:'Enable chunk collection and PA waveform analysis'},
  {key:'memory_auto_push',label:'Auto Memory Push',type:'toggle',desc:'Auto-POST artifacts to memory server on capture'},
  {key:'dropzone_auto_upload',label:'Auto Dropzone Upload',type:'toggle',desc:'Auto-upload artifacts to Dropzone file server'},
  {key:'greeting_delay_ms',label:'Greeting Delay',type:'range',min:400,max:5000,step:100,unit:'ms',desc:'Wait before injecting greeting (let page settle)'},
  {key:'poll_interval_ms',label:'Response Poll Interval',type:'range',min:100,max:2000,step:50,unit:'ms',desc:'How often to check for new response content'},
  {key:'stable_count_threshold',label:'Stable Threshold',type:'range',min:2,max:15,step:1,unit:'',desc:'Polls with no change before job is marked complete'},
  {key:'stream_log_level',label:'SISO Log Level',type:'select',options:['OFF','EVENTS','DEEP','DATA'],desc:'Verbosity of SISO event bus (server-side)'},
  {key:'rebuild_from_server',label:'Rebuild From Server',type:'toggle',desc:'On next init: wipe local state and reload from Jaa DB'},
];

function renderSettingsTab(){
  const area=document.getElementById('__g8settings__');if(!area)return;area.innerHTML='';
  for(const m of SETTING_META){
    const val=CFG[m.key];
    const card=document.createElement('div');card.className='gs-card';
    const keyEl=document.createElement('div');keyEl.className='gs-key';keyEl.textContent=m.key;
    const lblEl=document.createElement('div');lblEl.className='gs-label';lblEl.textContent=m.label;
    const descEl=document.createElement('div');descEl.className='gs-desc';descEl.textContent=m.desc;
    card.append(keyEl,lblEl,descEl);
    let ctrl;
    if(m.type==='toggle'){
      const wrap=document.createElement('div');wrap.style.cssText='display:flex;align-items:center;gap:6px';
      const lbl=document.createElement('label');lbl.className='gs-tgl';
      const inp=document.createElement('input');inp.type='checkbox';inp.checked=!!val;
      inp.onchange=async(e)=>{CFG[m.key]=e.target.checked;await apiPut('/settings/'+m.key,{value:e.target.checked?'true':'false'});};
      const sl=document.createElement('span');sl.className='gs-tsl';lbl.append(inp,sl);
      const vl=document.createElement('span');vl.style.cssText='font-size:.7rem;color:#475569';vl.textContent=val?'ON':'OFF';
      inp.onchange=async(e)=>{CFG[m.key]=e.target.checked;vl.textContent=e.target.checked?'ON':'OFF';await apiPut('/settings/'+m.key,{value:e.target.checked?'true':'false'});};
      wrap.append(lbl,vl);ctrl=wrap;
    }else if(m.type==='range'){
      const wrap=document.createElement('div');
      const vl=document.createElement('span');vl.style.cssText='font-size:.7rem;color:#6366f1;float:right';vl.textContent=val+(m.unit||'');
      const inp=document.createElement('input');inp.type='range';inp.min=m.min;inp.max=m.max;inp.step=m.step;inp.value=val;
      inp.oninput=e=>{vl.textContent=e.target.value+(m.unit||'');};
      inp.onchange=async(e)=>{CFG[m.key]=Number(e.target.value);await apiPut('/settings/'+m.key,{value:e.target.value});};
      wrap.append(vl,inp);ctrl=wrap;
    }else if(m.type==='select'){
      const inp=document.createElement('select');
      for(const opt of(m.options||[])){const o=document.createElement('option');o.value=opt;o.textContent=opt;if(opt===val)o.selected=true;inp.appendChild(o);}
      inp.onchange=async(e)=>{CFG[m.key]=e.target.value;await apiPut('/settings/'+m.key,{value:e.target.value});};ctrl=inp;
    }else if(m.type==='textarea'){
      const inp=document.createElement('textarea');inp.value=val||'';
      inp.onchange=async(e)=>{CFG[m.key]=e.target.value;await apiPut('/settings/'+m.key,{value:e.target.value});};ctrl=inp;
    }else{
      const inp=document.createElement('input');inp.type='text';inp.value=val||'';
      inp.onchange=async(e)=>{CFG[m.key]=e.target.value;await apiPut('/settings/'+m.key,{value:e.target.value});};ctrl=inp;
    }
    if(ctrl)card.appendChild(ctrl);
    area.appendChild(card);
  }
  // Reset button
  const resetBtn=document.createElement('button');resetBtn.className='gs-save';resetBtn.textContent='↺ Reset all to defaults';
  resetBtn.onclick=async()=>{if(confirm('Reset all settings to server defaults?')){await apiPost('/settings/reset',{});await loadSettings();renderSettingsTab();}};
  area.appendChild(resetBtn);
}

// ── API tab ───────────────────────────────────────────────────────────────────

function renderApiTab(){
  const area=document.getElementById('__g8api__');if(!area)return;area.innerHTML='';
  function gsec(label){const d=document.createElement('div');d.style.cssText='margin-bottom:12px';const l=document.createElement('div');l.style.cssText='font-size:.65rem;color:#334155;text-transform:uppercase;letter-spacing:.1em;font-weight:700;margin-bottom:5px';l.textContent=label;d.appendChild(l);area.appendChild(d);return d;}
  function gcard(parent,title,val,cls=''){const c=document.createElement('div');c.className='gapi-card';c.innerHTML=`<div class="gapi-t">${escHtml(title)}</div><div class="gapi-v ${cls}">${escHtml(val)}</div>`;parent.appendChild(c);}

  const idSec=gsec('Identity');
  gcard(idSec,'Account',getAccount()||'—');gcard(idSec,'Chat ID',chatIdFromUrl());gcard(idSec,'Chat URL',location.href);gcard(idSec,'Provider',PROVIDER+' v'+VERSION);

  const epSec=gsec('Agent Endpoint');
  const stCard=document.createElement('div');stCard.className='gapi-card';
  stCard.innerHTML=`<div class="gapi-t">Polling Status</div><div class="gapi-v" id="__g8api_status__" style="color:${agentEndpointActive?'#34d399':'#475569'}">${agentEndpointActive?'● ACTIVE':'○ INACTIVE'}</div>`;
  epSec.appendChild(stCard);
  const tBtn=document.createElement('button');tBtn.className='gapi-btn'+(agentEndpointActive?' on':'');tBtn.textContent=agentEndpointActive?'⏹ Stop':'▶ Start';tBtn.onclick=()=>{if(agentEndpointActive)stopAgentEndpointPolling();else startAgentEndpointPolling();renderApiTab();};epSec.appendChild(tBtn);

  const apiSec=gsec('HTTP API (LAN)');
  for(const ep of[{m:'POST',p:'/command',d:'Dispatch job to this tab'},{m:'GET',p:'/jobs',d:'List jobs'},{m:'GET',p:'/response/:id',d:'Get response'},{m:'GET',p:'/stream/:id',d:'SSE stream'},{m:'GET',p:'/artifacts',d:'Artifact store'},{m:'GET',p:'/gaps',d:'Gap store'},{m:'GET',p:'/sessions',d:'Sessions'},{m:'GET',p:'/pa',d:'PA sessions'},{m:'GET',p:'/memory/query?q=',d:'Full-text search'},{m:'GET',p:'/memory/context',d:'Context bundle'},{m:'GET',p:'/settings',d:'All settings'},{m:'PUT',p:'/settings/:key',d:'Update setting'},{m:'GET',p:'/cockpit',d:'Cockpit dashboard'},{m:'GET',p:'/events',d:'SSE event stream'},{m:'GET',p:'/health',d:'Health check'}]){
    const row=document.createElement('div');row.className='gapi-ep';
    row.innerHTML=`<span class="gapi-m ${ep.m.toLowerCase()}">${ep.m}</span><span class="gapi-p">${ep.p}</span><span class="gapi-d">${ep.d}</span>`;apiSec.appendChild(row);
  }

  const ctxSec=gsec('Context Export');
  const note=document.createElement('div');note.style.cssText='font-size:.68rem;color:#334155;margin-bottom:6px';
  note.textContent=`${artifactStore.length} artifacts · ${currentGaps.length} gaps · ${ledgerEntries.length} ledger entries`;ctxSec.appendChild(note);
  const exBtn=document.createElement('button');exBtn.className='gapi-btn';exBtn.textContent='↓ Export JSON';
  exBtn.onclick=()=>{const b={version:VERSION,provider:PROVIDER,ts:Date.now(),account:getAccount(),chatUrl:location.href,chatId:chatIdFromUrl(),artifacts:artifactStore.map(a=>({...a,content:(a.content||'').slice(0,2000)})),gaps:currentGaps,log:logEntries.slice(-20)};const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(b,null,2)],{type:'application/json'}));a.download=`guardian-ctx-${Date.now()}.json`;a.click();};ctxSec.appendChild(exBtn);

  const cockpitBtn=document.createElement('button');cockpitBtn.className='gapi-btn';cockpitBtn.textContent='⬡ Open Cockpit';
  cockpitBtn.onclick=()=>window.open('http://127.0.0.1:7820/cockpit','_blank');ctxSec.appendChild(cockpitBtn);
}

// ── Ledger tab ────────────────────────────────────────────────────────────────
// (rendered on demand from ledgerEntries array)

// ══════════════════════════════════════════════════════════════════════════════
//  TEXT INJECTION + SUBMIT
// ══════════════════════════════════════════════════════════════════════════════

function injectText(text){
  const input=document.querySelector('[contenteditable="true"]');if(!input)return false;
  input.focus();document.execCommand('selectAll',false,null);document.execCommand('delete',false,null);
  const ok=document.execCommand('insertText',false,text);
  if(!ok){input.textContent=text;input.dispatchEvent(new InputEvent('input',{bubbles:true,cancelable:true,data:text,inputType:'insertText'}));}
  return true;
}

function submit(){
  const btn=document.querySelector('button[data-testid="send-button"]:not([disabled])');
  if(btn){btn.click();return;}
  const input=document.querySelector('[contenteditable="true"]');
  if(input)input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true,cancelable:true}));
}

// ══════════════════════════════════════════════════════════════════════════════
//  RESPONSE WATCH
// ══════════════════════════════════════════════════════════════════════════════

function stopWatch(){currentJobId=null;setJobState(false);}

function startWatch(jobId,prompt){
  stopWatch();currentJobId=jobId;setJobState(true,prompt,jobId);
  if(CFG.pa_enabled)pa.session=newPASession();
  let lastText='',stableCount=0,generatingEmitted=false;
  const STABLE=CFG.stable_count_threshold||5;
  sendToMemory({type:'JOB_START',payload:{jobId,prompt:(prompt||'').slice(0,500),chatUrl:location.href,account:getAccount()}});
  function findResponseEl(){
    return document.querySelector('.font-claude-message:last-of-type')
      ||document.querySelector('[data-testid="assistant-message"]:last-child')
      ||(()=>{const all=document.querySelectorAll('[class*="assistant"]');return all.length?all[all.length-1]:null;})()
      ||document.querySelector('.prose:last-of-type');
  }
  function poll(){
    if(!currentJobId)return;
    const el=findResponseEl();if(!el){setTimeout(poll,400);return;}
    const text=el.innerText||el.textContent||'';
    if(text===lastText){
      stableCount++;
      if(stableCount>=STABLE){
        addLog('ok','Job complete',`${lastText.length}ch · #${jobId.slice(0,8)}`);
        sendToServer({type:'GUARDIAN_COMPLETE',jobId,text:lastText,chatUrl:location.href,account:getAccount(),requestId:jobId});
        ledgerRecord('UPGRADE',`Job complete · #${jobId.slice(0,8)}`,{jobId,chars:lastText.length});
        sessionTokenTotal+=pa.session?.totalTokens||0;
        // Full GapHunter v3 analysis
        const gaps=gaphunterAnalyze(lastText);
        currentGaps=[...gaps,...currentGaps].slice(0,200);
        if(gaps.length>0){
          sendToServer({type:'GUARDIAN_GAPS',jobId,gaps,chatUrl:location.href,account:getAccount()});
          for(const g of gaps)ledgerRecord('GAP',`${g.domain||g.type} · ${((g.score||0)*100).toFixed(0)}%`,g);
          addLog('gap',`${gaps.length} gap(s)`,gaps.map(g=>g.type).join(','));
          if(activeTab==='gaps')renderGapsTab();
        }
        if(CFG.pa_enabled&&pa.session){
          pa.session.hypotheses=generateHypotheses(pa.session);
          pa.sessions.push(pa.session);if(pa.sessions.length>10)pa.sessions.shift();
          sendToServer({type:'GUARDIAN_PA_SESSION',jobId,tokens:pa.session.totalTokens,tps:pa.session.chunks.length>1?((pa.session.totalTokens/((pa.session.chunks.at(-1).t-pa.session.chunks[0].t)/1000)).toFixed(1)):0,pauses:pa.session.pauseZones?.length||0,entropy:pa.session.entropyHistory.slice(-3),hypotheses:pa.session.hypotheses.map(h=>({label:h.label,confidence:h.confidence})),chatUrl:location.href,account:getAccount(),provider:PROVIDER});
          if(activeTab==='pa')renderPATab();
        }
        sendToServer({type:'GUARDIAN_DONE',jobId,chatUrl:location.href,account:getAccount(),requestId:jobId});
        sendToMemory({type:'JOB_COMPLETE',payload:{jobId,chars:lastText.length,gaps:gaps.length}});
        sisoEmit('guardian.job.complete',{jobId,chars:lastText.length,gaps:gaps.length});
        updateFooter();stopWatch();return;
      }
    }else{
      const delta=text.slice(lastText.length);
      if(delta){
        if(!generatingEmitted){generatingEmitted=true;sendToServer({type:'GUARDIAN_GENERATING',jobId,chatUrl:location.href,account:getAccount(),requestId:jobId});addLog('job','Generating…',`#${jobId.slice(0,8)}`);}
        sendToServer({type:'GUARDIAN_CHUNK',jobId,text:delta,chatUrl:location.href,account:getAccount()});
        if(CFG.pa_enabled&&pa.session){
          const now=Date.now(),tokens=estimateTokens(delta);
          if(!pa.session.startTime)pa.session.startTime=now;
          pa.session.chunks.push({t:now-pa.session.startTime,text:delta,tokens});
          pa.session.totalTokens+=tokens;
          pa.session.entropyHistory.push(entropy(delta));
          if(pa.session.entropyHistory.length>200)pa.session.entropyHistory.shift();
          if(activeTab==='pa')renderPATab();
        }
      }
      lastText=text;stableCount=0;
    }
    setTimeout(poll,CFG.poll_interval_ms||500);
  }
  setTimeout(poll,1500);
}

// ══════════════════════════════════════════════════════════════════════════════
//  JOB HANDLER
// ══════════════════════════════════════════════════════════════════════════════

async function handleJob(msg){
  const{jobId,prompt,content,command}=msg;
  const text=content?(prompt?`${prompt}\n\n${content}`:content):(prompt||'');
  addLog('job',`Job: ${command}`,text.slice(0,80));ledgerRecord('INPUT',`Job · ${command} · #${jobId.slice(0,8)}`,{jobId,command});
  if(!text.trim()){sendToServer({type:'GUARDIAN_ERROR',jobId,error:'Empty prompt',chatUrl:location.href,account:getAccount()});return;}
  const ok=injectText(text);
  if(!ok){sendToServer({type:'GUARDIAN_ERROR',jobId,error:'Input not found',chatUrl:location.href,account:getAccount()});return;}
  seenArtifactHashes.clear();
  sendToServer({type:'GUARDIAN_DELIVERED',jobId,chatUrl:location.href,account:getAccount(),requestId:jobId});
  startWatch(jobId,text);
  setTimeout(submit,500);
}

// ══════════════════════════════════════════════════════════════════════════════
//  WEBSOCKET
// ══════════════════════════════════════════════════════════════════════════════

function updateFooter(){
  const el=document.getElementById('__g8footer__');if(!el)return;
  const elapsed=Math.round((Date.now()-sessionStartTime)/1000);
  el.textContent=`${getAccount().slice(0,20)} · ${Math.floor(elapsed/60)}m ${elapsed%60}s · ~${sessionTokenTotal.toLocaleString()} tok`;
}

function sendToServer(obj){if(ws&&ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(obj));}

function connect(){
  if(reconnectTimer){clearTimeout(reconnectTimer);reconnectTimer=null;}
  setConnState('connecting');addLog('info','Connecting…',WS_URL);
  ws=new WebSocket(WS_URL);
  ws.onopen=()=>{
    setConnState('handshaking');
    ws.send(JSON.stringify({type:'GUARDIAN_REGISTER',provider:PROVIDER,host:location.hostname}));
    hb=setInterval(()=>sendToServer({type:'GUARDIAN_HEARTBEAT',provider:PROVIDER,ts:Date.now()}),HB_INTERVAL);
  };
  ws.onmessage=(e)=>{
    let msg;try{msg=JSON.parse(e.data);}catch{return;}
    switch(msg.type){
      case 'GUARDIAN_READY':
        setConnState('ready');addLog('ok',`Ready · ${msg.provider||PROVIDER}`);
        ledgerRecord('EVENT',`Connected · ${msg.provider||PROVIDER}`);
        startDOMObserver();
        setTimeout(()=>{getAccount();updateFooter();},500);
        setInterval(updateFooter,30000);setTimeout(scanDOM,500);
        // Check for greeting on current chat
        setTimeout(()=>{const id=chatIdFromUrl();if(id&&id!=='home'&&isChatBlank())sendGreeting(id);},2000);
        break;
      case 'GUARDIAN_JOB': handleJob(msg);break;
      case 'GUARDIAN_SESSION_NAMED': addLog('ok',`Session: ${msg.sessionName||'unnamed'}`);break;
      case 'GUARDIAN_HEARTBEAT_ACK': break;
      default: addLog('in',`← ${msg.type}`,JSON.stringify(msg).slice(0,80));
    }
  };
  ws.onclose=(e)=>{
    clearInterval(hb);setConnState('disconnected');
    addLog('err',`Disconnected (${e.code})`,`Reconnecting in ${RECONNECT_MS/1000}s…`);
    if(currentJobId)stopWatch();
    reconnectTimer=setTimeout(connect,RECONNECT_MS);
  };
  ws.onerror=()=>{setConnState('disconnected');addLog('err','WebSocket error');};
}

// ══════════════════════════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════════════════════════

async function init(){
  buildUI();
  await loadSettings();
  interceptDownloads();
  connect();
  startNavigationWatcher();
  switchTab('log');
  addLog('sys',`Guardian v${VERSION} — SISO+GapHunter+PA+SessionGreeting`);
  // Reload settings every 60s
  setInterval(loadSettings,60000);
}

if(document.readyState==='complete')setTimeout(init,500);
else window.addEventListener('load',()=>setTimeout(init,500));

})();
