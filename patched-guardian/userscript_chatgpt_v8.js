// ==UserScript==
// @name         Guardian — ChatGPT v8
// @namespace    nexus.guardian.chatgpt
// @version      8.0.0
// @description  Guardian v8: SISO bus, Jaa persistence, GapHunter v3, Prompt Archaeology, session greeting
// @author       James Brooks / Nexus
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      *
// @run-at       document-idle
// ==/UserScript==

// ─── This is the ChatGPT mirror of userscript_claude_v8.js ────────────────────
// Core engine is identical. Differences:
//   PROVIDER = 'chatgpt'
//   All selectors use ChatGPT DOM ([data-message-author-role="assistant"])
//   chatIdFromUrl uses /c/<uuid> pattern
//   injectText targets contenteditable (ChatGPT layout)
//   submit uses ChatGPT send button selectors
//   Tab claim system (TAB_CLAIM_KEY) for multi-tab agent management
// ─────────────────────────────────────────────────────────────────────────────

(function () {
'use strict';

const WS_URL     = 'wss://127.0.0.1:7821';
const API_URL    = 'http://127.0.0.1:7820';
const MEMORY_URL = 'http://127.0.0.1:7823';
const RECONNECT_MS=3000,HB_INTERVAL=8000,LOG_MAX=150,LEDGER_MAX=200,ARTIFACT_MAX=500;
const PROVIDER='chatgpt',VERSION='8.0.0';

// Tab claim system
const TAB_CLAIM_KEY='guardian_claimed_tab',TAB_ID_KEY='guardian_tab_id';
if(!sessionStorage.getItem(TAB_ID_KEY))sessionStorage.setItem(TAB_ID_KEY,`tab_${Date.now()}_${Math.random().toString(36).slice(2,7)}`);
const MY_TAB_ID=sessionStorage.getItem(TAB_ID_KEY);
let isClaimed=false;
function amIClaimed(){return localStorage.getItem(TAB_CLAIM_KEY)===MY_TAB_ID;}
function claimTab(){localStorage.setItem(TAB_CLAIM_KEY,MY_TAB_ID);isClaimed=true;sessionStorage.setItem('guardian_is_claimed','1');updateClaimBadge();addLog('ok','Tab claimed',MY_TAB_ID.slice(-8));}
function releaseTab(){if(amIClaimed())localStorage.removeItem(TAB_CLAIM_KEY);isClaimed=false;sessionStorage.removeItem('guardian_is_claimed');updateClaimBadge();}
window.addEventListener('beforeunload',releaseTab);
function tryAutoClaimIfNoneActive(){const ex=localStorage.getItem(TAB_CLAIM_KEY);if(!ex){claimTab();}else if(ex===MY_TAB_ID){isClaimed=true;sessionStorage.setItem('guardian_is_claimed','1');updateClaimBadge();}else{addLog('info','Another tab claimed — passive mode');updateClaimBadge();}}
function updateClaimBadge(){const b=document.getElementById('__g8gptclaim__');if(!b)return;b.textContent=isClaimed?'ACTIVE':'PASSIVE';b.style.color=isClaimed?'#22c55e':'#64748b';b.style.background=isClaimed?'rgba(34,197,94,.12)':'rgba(100,116,139,.12)';}

// Settings
let CFG={scan_debounce_ms:1500,artifact_max:500,gap_min_score:0.25,pa_enabled:true,memory_auto_push:true,dropzone_auto_upload:true,session_greeting_enabled:true,session_greeting_text:'Guardian session initialising. Please ask me: "What are we calling this session?" — then wait for my answer before we begin.',greeting_delay_ms:1200,poll_interval_ms:500,stable_count_threshold:5,stream_log_level:'EVENTS',rebuild_from_server:false};
async function apiGet(p){try{const r=await fetch(API_URL+p);return r.ok?r.json():null;}catch(_){return null;}}
async function apiPut(p,b){try{const r=await fetch(API_URL+p,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});return r.ok?r.json():null;}catch(_){return null;}}
async function apiPost(p,b){try{const r=await fetch(API_URL+p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});return r.ok?r.json():null;}catch(_){return null;}}
async function loadSettings(){try{const r=await apiGet('/settings');if(r?.settings)for(const[k,v]of Object.entries(r.settings)){if(k in CFG){if(v==='true')CFG[k]=true;else if(v==='false')CFG[k]=false;else if(!isNaN(v)&&v!=='')CFG[k]=Number(v);else CFG[k]=v;}}}catch(_){}}

// SISO BroadcastChannel
const sisoChannel=new BroadcastChannel('guardian-siso-v8');
function sisoEmit(type,data={}){try{sisoChannel.postMessage({type,data,ts:Date.now(),provider:PROVIDER});}catch(_){}}

// State
let ws=null,hb=null,currentJobId=null,connState='disconnected',panelOpen=false,activeTab='log';
let logEntries=[],ledgerEntries=[],unreadCount=0,reconnectTimer=null;
let scanDebounceTimer=null,domSystems={},domObserver=null;
let seenArtifactHashes=new Set(),accountState=null,sessionStartTime=Date.now(),sessionTokenTotal=0;
let artifactStore=[],detectedDownloads=[],agentEndpointActive=false,agentPollInterval=null;
const pa={session:null,sessions:[]};
const greetedChats=new Set((()=>{try{return JSON.parse(sessionStorage.getItem('guardian_greeted_gpt_v8')||'[]');}catch(_){return [];}})());
function saveGreeted(){try{sessionStorage.setItem('guardian_greeted_gpt_v8',JSON.stringify([...greetedChats]));}catch(_){}}

let lastPathname=location.pathname,lastChatId=chatIdFromUrl(),currentGaps=[];

// Utils
function simpleHash(s){let h=0;for(let i=0;i<s.length;i++){h=((h<<5)-h)+s.charCodeAt(i);h|=0;}return Math.abs(h).toString(16).slice(0,8);}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,6);}
function escHtml(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function fts(ts){return new Date(ts).toLocaleTimeString();}
function estimateTokens(s){return Math.max(1,Math.round(s.length/4));}

// ChatGPT-specific selectors
function chatIdFromUrl(){const m=location.pathname.match(/\/c\/([a-zA-Z0-9_-]+)/);return m?m[1]:'home';}
function getAccount(){
  if(accountState)return accountState;
  const sels=['[data-testid="user-email"]','[data-testid="profile-button"] span','nav button[aria-label*="@"]'];
  for(const sel of sels){const el=document.querySelector(sel);if(el){const t=(el.getAttribute('aria-label')||el.textContent||'').trim();if(t.includes('@')||t.length>3){accountState=t.slice(0,60);return accountState;}}}
  try{for(const s of document.querySelectorAll('script[type="application/json"]')){const d=JSON.parse(s.textContent||'{}');const email=d?.email||d?.user?.email;if(email){accountState=email;return accountState;}}}catch(_){}
  accountState=location.hostname;return accountState;
}

function detectLangFromEl(el){
  const codeEl=el.tagName==='CODE'?el:el.querySelector('code');
  if(codeEl){const cls=Array.from(codeEl.classList).find(c=>c.startsWith('language-'));if(cls)return cls.replace('language-','');}
  const langEl=el.querySelector('div:first-child span:first-child');
  if(langEl){const t=langEl.textContent.trim().toLowerCase();if(t&&t.length<20)return t;}
  return null;
}
function detectArtifactName(el){
  const w=el.closest('div.contain-inline-size')||el.parentElement;
  if(w){const l=w.querySelector('div:first-child span:first-child');if(l){const t=l.textContent.trim();if(t.length>0&&t.length<60)return `${t} block`;}}
  const firstLine=(el.innerText||el.textContent||'').split('\n')[0].trim();
  const m=firstLine.match(/^(?:\/\/|#|--|<!--)?\s*([\w.\-/ ]+\.\w{1,6})/);if(m)return m[1].trim();
  const lang=detectLangFromEl(el);return lang?`${lang} block`:'artifact';
}

// GapHunter v3 (shared implementation)
function gaphunterAnalyze(text){
  const gaps=[];if(!text||text.length<50)return gaps;
  const lines=text.split('\n'),words=text.toLowerCase().match(/\b\w+\b/g)||[],wc=words.length;
  const bd=lines.filter(l=>/^\s*[-*•]|\d+\./.test(l)).length/Math.max(1,lines.length);
  const ld=wc>5?(new Set(words).size/wc):1;
  const freq={};for(const ch of text)freq[ch]=(freq[ch]||0)+1;
  let H=0;for(const f of Object.values(freq)){const p=f/text.length;H-=p*Math.log2(p);}H=parseFloat(H.toFixed(3));
  const hedges=(text.match(/\b(might|may|could|perhaps|possibly|seems|appears|likely|probably|generally|often)\b/gi)||[]).length;
  const hedgeRate=wc>0?hedges/wc:0,lastLine=lines[lines.length-1]?.trim()||'',min=CFG.gap_min_score??0.25;
  if(bd>0.5){const s=Math.min(0.95,bd);if(s>=min)gaps.push({type:'assumption',domain:'communication',reason:'compression',description:`High bullet density ${(bd*100).toFixed(0)}%`,score:s,evidence:{metric:bd}});}
  if(ld<0.35){const s=Math.min(0.9,1-ld);if(s>=min)gaps.push({type:'obligation',domain:'communication',reason:'structural_limit',description:`Low lexical diversity ${ld}`,score:s,evidence:{metric:ld}});}
  if(H<3.2&&wc>80){const s=parseFloat(((4-H)/4).toFixed(3));if(s>=min)gaps.push({type:'temporal',domain:'ai_ml',reason:'compression',description:`Low entropy H=${H}`,score:s,evidence:{metric:H}});}
  if(hedgeRate>0.04){const s=Math.min(0.85,hedgeRate*10);if(s>=min)gaps.push({type:'assumption',domain:'epistemological',reason:'avoidance',description:`High hedge rate ${(hedgeRate*100).toFixed(1)}%`,score:s,evidence:{metric:hedgeRate}});}
  if(wc>200&&(lastLine.endsWith('...')||lastLine.length<12))gaps.push({type:'obligation',domain:'communication',reason:'structural_limit',description:'Possible truncation',score:0.75,evidence:{pattern:'truncation'}});
  if(text.includes('```')){const todos=(text.match(/\bTODO\b|\bFIXME\b|\bHACK\b/g)||[]).length;if(todos>0)gaps.push({type:'obligation',domain:'code',reason:'deferred_variable',description:`${todos} TODO/FIXME markers — §1.3`,score:Math.min(0.9,0.3+todos*0.15),evidence:{metric:todos}});}
  return gaps;
}

// PA
function newPASession(){return{id:Date.now(),startTime:null,chunks:[],totalTokens:0,burstZones:[],pauseZones:[],entropyHistory:[],hypotheses:[]};}
function entropy(s){if(!s||!s.length)return 0;const f={};for(const c of s)f[c]=(f[c]||0)+1;const n=s.length;let H=0;for(const v of Object.values(f)){const p=v/n;H-=p*Math.log2(p);}return parseFloat(H.toFixed(3));}
function generateHypotheses(session){
  const hyps=[],text=session.chunks.map(c=>c.text).join('');
  const wc=text.match(/\b\w+\b/g)?.length||0;
  const bd=text.split('\n').filter(l=>/^\s*[-*•]/.test(l)).length/Math.max(1,text.split('\n').length);
  const pauses=(()=>{const chunks=session.chunks;if(chunks.length<3)return[];const rates=chunks.slice(1).map((c,i)=>({dt:c.t-chunks[i].t}));return rates.filter(r=>r.dt>500);})();
  if(pauses.length>=3)hyps.push({label:'Inference hesitation zones',confidence:Math.min(0.85,0.4+pauses.length*0.08),evidence:[`${pauses.length} pauses >500ms`]});
  if(bd>0.5)hyps.push({label:'Structured synthesis mode',confidence:Math.min(0.9,0.5+bd),evidence:[`Bullet density: ${(bd*100).toFixed(0)}%`]});
  if(!hyps.length)hyps.push({label:'No strong behavioral signals',confidence:0.5,evidence:['Low-signal response']});
  session.burstZones=[];session.pauseZones=pauses;
  return hyps;
}

// Session greeting — ChatGPT
function isChatBlank(){return document.querySelectorAll('[data-message-author-role="assistant"],[data-message-author-role="user"]').length===0;}
function sendGreeting(chatId){
  if(!CFG.session_greeting_enabled||greetedChats.has(chatId))return;
  greetedChats.add(chatId);saveGreeted();
  let attempts=0;
  function tryInject(){attempts++;if(attempts>20)return;if(!isChatBlank())return;
    setTimeout(()=>{const ok=injectText(CFG.session_greeting_text);if(!ok){setTimeout(tryInject,500);return;}
      addLog('sys','Session greeting injected',chatId.slice(0,8));ledgerRecord('SYSTEM',`Session greeting → #${chatId.slice(0,8)}`);
      setTimeout(()=>{submit();watchForSessionName(chatId);},600);},300);}
  setTimeout(tryInject,CFG.greeting_delay_ms||1200);
}
function watchForSessionName(chatId){
  let attempts=0;
  function poll(){attempts++;if(attempts>60)return;
    const msgs=document.querySelectorAll('[data-message-author-role="assistant"]');if(!msgs.length){setTimeout(poll,500);return;}
    const text=(msgs[msgs.length-1].innerText||msgs[msgs.length-1].textContent||'').trim();if(text.length<10){setTimeout(poll,500);return;}
    const m=text.match(/[""]([^""]{3,60})[""]/)
      ||text.match(/calling (?:this |it )?["']?([A-Z][^.!?\n]{2,50})["']?/i)
      ||text.match(/session[:\s]+["']?([A-Z][^.!?\n]{2,40})["']?/i);
    if(m){const sn=m[1].trim();addLog('ok',`Session: ${sn}`);ledgerRecord('SYSTEM',`Session: "${sn}"`,{chatId,sessionName:sn});sendToServer({type:'GUARDIAN_SESSION_NAMED',chatId,sessionName:sn,account:getAccount(),provider:PROVIDER,chatUrl:location.href});apiPost('/sessions/'+chatId+'/name',{name:sn,account:getAccount(),provider:PROVIDER,chatUrl:location.href}).catch(()=>{});try{sessionStorage.setItem('guardian_session_'+chatId,sn);}catch(_){}}}
  setTimeout(poll,2000);
}
function onNavigate(){
  const np=location.pathname,nc=chatIdFromUrl();if(np===lastPathname)return;lastPathname=np;
  if(nc&&nc!=='home'&&nc!==lastChatId){lastChatId=nc;addLog('sys','New chat',nc.slice(0,8));setTimeout(()=>{if(isChatBlank())sendGreeting(nc);},800);}
  if(!nc||nc==='home'){lastChatId='pending';let w=0;function wid(){w++;if(w>30)return;const id=chatIdFromUrl();if(id&&id!=='home'&&id!=='pending'){lastChatId=id;setTimeout(()=>{if(isChatBlank())sendGreeting(id);},600);return;}setTimeout(wid,300);}setTimeout(wid,500);}
}
function startNavWatcher(){setInterval(onNavigate,500);const op=history.pushState.bind(history),or=history.replaceState.bind(history);history.pushState=(...a)=>{op(...a);setTimeout(onNavigate,100);};history.replaceState=(...a)=>{or(...a);setTimeout(onNavigate,100);};window.addEventListener('popstate',()=>setTimeout(onNavigate,100));}

// Memory
function sendToMemory(obj){const body=JSON.stringify({...obj,source:'guardian-chatgpt-v8',chatUrl:location.href,account:getAccount(),chatId:chatIdFromUrl(),ts:Date.now()});if(typeof GM_xmlhttpRequest!=='undefined'){GM_xmlhttpRequest({method:'POST',url:`${MEMORY_URL}/ingest`,headers:{'Content-Type':'application/json'},data:body,onerror:()=>{}});}else{fetch(`${MEMORY_URL}/ingest`,{method:'POST',headers:{'Content-Type':'application/json'},body}).catch(()=>{});}}

// Ledger
const LEDGER_COLORS={UPGRADE:'#34d399',IDEA:'#a78bfa',EVENT:'#94a3b8',GAP:'#f472b6',SYSTEM:'#818cf8',INPUT:'#60a5fa',OUTPUT:'#a78bfa'};
function ledgerRecord(category,msg,meta={}){const entry={ts:Date.now(),category,msg,meta,icon:{UPGRADE:'⬆',IDEA:'💡',EVENT:'◈',GAP:'△',SYSTEM:'◉',INPUT:'↓',OUTPUT:'↑'}[category]||'·',color:LEDGER_COLORS[category]||'#94a3b8'};ledgerEntries.unshift(entry);if(ledgerEntries.length>LEDGER_MAX)ledgerEntries.pop();sendToServer({type:'GUARDIAN_LEDGER_EVENT',level:category,category,msg,meta,chatUrl:location.href,account:getAccount(),requestId:currentJobId});sendToMemory({type:'LEDGER',payload:entry});sisoEmit('guardian.ledger',{category,msg,meta});return entry;}

// Artifact store
function artifactSave(entry){
  if(artifactStore.find(a=>a.hash===entry.hash))return null;
  const full={id:uid(),hash:entry.hash,name:entry.name||'artifact',type:entry.type||'code_block',lang:entry.lang||null,content:entry.content||'',context:entry.context||null,chatUrl:entry.chatUrl||location.href,chatId:entry.chatId||chatIdFromUrl(),account:entry.account||getAccount(),jobId:entry.jobId||currentJobId,ts:entry.ts||Date.now(),direction:entry.direction||'output'};
  artifactStore.unshift(full);if(artifactStore.length>ARTIFACT_MAX)artifactStore.pop();
  if(CFG.memory_auto_push)sendToMemory({type:'ARTIFACT',payload:full});sisoEmit('guardian.artifact',full);return full;
}

// DOM scanner — ChatGPT selectors
function scanDOM(){
  const systems={};
  const SELS=[{selector:'[data-message-author-role="assistant"]',type:'assistant_turn'},{selector:'[data-message-author-role="user"]',type:'human_turn'},{selector:'div.contain-inline-size',type:'code_block'},{selector:'[data-testid*="code-block"]',type:'code_block'}];
  for(const{selector,type}of SELS){
    const els=document.querySelectorAll(selector);if(!els.length)continue;
    if(!systems[type])systems[type]={type,count:0,lastSeen:Date.now(),samples:[]};
    systems[type].count+=els.length;
    if(type==='code_block'){
      for(const el of els){
        const codeEl=el.querySelector('code')||(el.tagName==='CODE'?el:null);
        const content=(codeEl||el).innerText?.trim()||(codeEl||el).textContent?.trim()||'';
        if(!content||content.length<10)continue;
        const hash=simpleHash(content);if(seenArtifactHashes.has(hash))continue;seenArtifactHashes.add(hash);
        const lang=detectLangFromEl(el),name=detectArtifactName(el);
        const msgEl=el.closest('[data-message-author-role="assistant"]');
        const context=msgEl?(msgEl.innerText||'').slice(0,300):null;
        const saved=artifactSave({hash,name,type:'code_block',lang,content:content.slice(0,8000),context,direction:'output'});
        if(saved){addLog('out',`code_block · ${lang||'text'} · ${content.length}ch`,name);ledgerRecord('OUTPUT',`code_block · ${lang||'text'} · ${content.length}ch`,{lang,hash,jobId:currentJobId});sendToServer({type:'GUARDIAN_ARTIFACT',jobId:currentJobId,content:content.slice(0,4000),lang,hash,name,chatUrl:location.href,account:getAccount(),provider:PROVIDER});if(activeTab==='artifacts')renderArtifactsTab();}
      }
    }
  }
  domSystems=systems;
}
function scheduleScan(){clearTimeout(scanDebounceTimer);scanDebounceTimer=setTimeout(scanDOM,CFG.scan_debounce_ms);}
function startDOMObserver(){if(domObserver)return;domObserver=new MutationObserver(()=>{scheduleScan();detectFileChips();});domObserver.observe(document.body,{childList:true,subtree:true});setTimeout(scanDOM,800);}
const seenFileChips=new Set();
function detectFileChips(){for(const sel of['[data-testid="file-attachment"]','[class*="upload"]','[class*="attachment"]']){for(const chip of document.querySelectorAll(sel)){const name=(chip.getAttribute('aria-label')||chip.textContent||'').trim().slice(0,100);if(!name||seenFileChips.has(name))continue;seenFileChips.add(name);onFilesDetected([{name,size:null,type:'unknown'}]);}}}
function onFilesDetected(files){if(!files?.length)return;addLog('in',`Files: ${files.map(f=>f.name).join(', ')}`);ledgerRecord('INPUT',`Upload: ${files.map(f=>f.name).join(', ')}`,{files});sendToServer({type:'GUARDIAN_FILE_UPLOAD',jobId:currentJobId,files,chatUrl:location.href,account:getAccount()});}

// Agent polling
function startAgentEndpointPolling(){if(agentPollInterval)return;agentEndpointActive=true;addLog('sys','Agent polling active');agentPollInterval=setInterval(async()=>{try{const r=await fetch(`${API_URL}/jobs?status=pending&limit=5`);if(!r.ok)return;const data=await r.json();for(const job of(data.jobs||[])){if(job.provider===PROVIDER&&job.status==='pending'&&isClaimed)handleJob({jobId:job.id,command:job.command,prompt:job.prompt,content:job.content});}}catch(_){}},2000);}
function stopAgentEndpointPolling(){if(agentPollInterval){clearInterval(agentPollInterval);agentPollInterval=null;}agentEndpointActive=false;}

// Inject/submit — ChatGPT specific
function injectText(text){
  const ce=document.querySelector('[contenteditable="true"]');
  if(ce){ce.focus();document.execCommand('selectAll',false,null);document.execCommand('delete',false,null);const ok=document.execCommand('insertText',false,text);if(!ok){ce.textContent=text;ce.dispatchEvent(new InputEvent('input',{bubbles:true,cancelable:true,inputType:'insertText',data:text}));}return true;}
  const ta=document.querySelector('textarea#prompt-textarea')||document.querySelector('textarea');
  if(ta){const nv=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value');nv.set.call(ta,text);ta.dispatchEvent(new Event('input',{bubbles:true}));return true;}
  return false;
}
function submit(){
  const btn=document.querySelector('button[data-testid="send-button"]:not([disabled])')||document.querySelector('button[aria-label="Send prompt"]:not([disabled])');
  if(btn){btn.click();return;}
  const input=document.querySelector('[contenteditable="true"]')||document.querySelector('textarea');
  if(input)input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true,cancelable:true}));
}

// Response watch
function stopWatch(){currentJobId=null;const bar=document.getElementById('__g8gptjobbar__');if(bar)bar.style.display='none';}
function startWatch(jobId,prompt){
  stopWatch();currentJobId=jobId;
  const bar=document.getElementById('__g8gptjobbar__');if(bar){bar.style.display='flex';const t=document.getElementById('__g8gptjobtext__');if(t)t.textContent=(prompt||'Job running…').slice(0,60);}
  if(CFG.pa_enabled)pa.session=newPASession();
  let lastText='',stableCount=0,generatingEmitted=false;
  const STABLE=CFG.stable_count_threshold||5;
  function findResponseEl(){const all=document.querySelectorAll('[data-message-author-role="assistant"]');if(all.length)return all[all.length-1];return document.querySelector('[class*="result-streaming"]');}
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
        const gaps=gaphunterAnalyze(lastText);
        currentGaps=[...gaps,...currentGaps].slice(0,200);
        if(gaps.length>0){sendToServer({type:'GUARDIAN_GAPS',jobId,gaps,chatUrl:location.href,account:getAccount()});for(const g of gaps)ledgerRecord('GAP',`${g.domain||g.type} · ${((g.score||0)*100).toFixed(0)}%`,g);addLog('gap',`${gaps.length} gap(s)`,gaps.map(g=>g.type).join(','));}
        if(CFG.pa_enabled&&pa.session){pa.session.hypotheses=generateHypotheses(pa.session);pa.sessions.push(pa.session);if(pa.sessions.length>10)pa.sessions.shift();sendToServer({type:'GUARDIAN_PA_SESSION',jobId,tokens:pa.session.totalTokens,pauses:pa.session.pauseZones?.length||0,entropy:pa.session.entropyHistory.slice(-3),hypotheses:pa.session.hypotheses.map(h=>({label:h.label,confidence:h.confidence})),chatUrl:location.href,account:getAccount(),provider:PROVIDER});}
        sendToServer({type:'GUARDIAN_DONE',jobId,chatUrl:location.href,account:getAccount(),requestId:jobId});
        sendToMemory({type:'JOB_COMPLETE',payload:{jobId,chars:lastText.length,gaps:gaps.length}});
        stopWatch();return;
      }
    }else{
      const delta=text.slice(lastText.length);
      if(delta){
        if(!generatingEmitted){generatingEmitted=true;sendToServer({type:'GUARDIAN_GENERATING',jobId,chatUrl:location.href,account:getAccount(),requestId:jobId});addLog('job','Generating…',`#${jobId.slice(0,8)}`);}
        sendToServer({type:'GUARDIAN_CHUNK',jobId,text:delta,chatUrl:location.href,account:getAccount()});
        if(CFG.pa_enabled&&pa.session){const now=Date.now(),tokens=estimateTokens(delta);if(!pa.session.startTime)pa.session.startTime=now;pa.session.chunks.push({t:now-pa.session.startTime,text:delta,tokens});pa.session.totalTokens+=tokens;pa.session.entropyHistory.push(entropy(delta));}
      }
      lastText=text;stableCount=0;
    }
    setTimeout(poll,CFG.poll_interval_ms||500);
  }
  setTimeout(poll,1500);
}

// Job handler — respect tab claim
async function handleJob(msg){
  if(!isClaimed){addLog('info','Job ignored — not claimed',msg.jobId?.slice(0,8));return;}
  const{jobId,prompt,content,command}=msg;
  const text=content?(prompt?`${prompt}\n\n${content}`:content):(prompt||'');
  addLog('job',`Job: ${command}`,text.slice(0,80));ledgerRecord('INPUT',`Job · ${command} · #${jobId.slice(0,8)}`,{jobId,command});
  if(!text.trim()){sendToServer({type:'GUARDIAN_ERROR',jobId,error:'Empty prompt',chatUrl:location.href,account:getAccount()});return;}
  const ok=injectText(text);if(!ok){sendToServer({type:'GUARDIAN_ERROR',jobId,error:'Input not found',chatUrl:location.href,account:getAccount()});return;}
  seenArtifactHashes.clear();sendToServer({type:'GUARDIAN_DELIVERED',jobId,chatUrl:location.href,account:getAccount(),requestId:jobId});startWatch(jobId,text);setTimeout(submit,500);
}

// Styles (minimal — same color palette as Claude v8)
function injectStyles(){
  const s=document.createElement('style');
  s.textContent=`
    @keyframes gpulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.8)}}
    @keyframes gfadein{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
    #__g8gptroot__{position:fixed;bottom:16px;right:16px;z-index:2147483647;font-family:'SF Mono','Fira Code',monospace;font-size:11px;user-select:none}
    #__g8gptpill__{display:flex;align-items:center;gap:7px;background:rgba(15,15,20,.92);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,.08);border-radius:20px;padding:5px 12px 5px 8px;cursor:pointer;box-shadow:0 4px 20px rgba(0,0,0,.5);transition:opacity .2s;margin-left:auto}
    #__g8gptpill__:hover{opacity:.85}
    #__g8gptpanel__{width:420px;background:rgba(10,10,16,.97);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.08);border-radius:12px;box-shadow:0 8px 40px rgba(0,0,0,.7);overflow:hidden;margin-bottom:8px;display:none;flex-direction:column;animation:gfadein .15s ease}
    #__g8gpttabs__{display:flex;border-bottom:1px solid rgba(255,255,255,.06);background:rgba(0,0,0,.3);flex-shrink:0}
    .g8gpttab{flex:1;padding:7px 3px;text-align:center;cursor:pointer;font-size:9.5px;color:#334155;border-bottom:2px solid transparent;transition:all .15s;letter-spacing:.04em;font-weight:600;text-transform:uppercase}
    .g8gpttab:hover{color:#64748b}.g8gpttab.active{color:#cbd5e1;border-bottom-color:#22c55e}
    .g8gptarea{flex:1;overflow-y:auto;padding:8px 12px;min-height:200px;max-height:340px}
    .g8gptarea::-webkit-scrollbar{width:3px}.g8gptarea::-webkit-scrollbar-thumb{background:#1e293b;border-radius:3px}
    .g8row:hover{background:rgba(255,255,255,.03)!important}
    .ga-card{border:1px solid #1e1e3a;border-radius:4px;margin-bottom:5px;cursor:pointer}.ga-card:hover{border-color:#334155}.ga-card.exp{border-color:#22c55e}
    .ga-hdr{display:flex;align-items:center;gap:6px;padding:5px 10px;background:#080812;font-size:.73rem}
    .ga-name{color:#cbd5e1;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
    .ga-lang{color:#475569;font-size:.62rem}.ga-ts{color:#1e293b;font-size:.6rem}
    .ga-body{padding:6px 10px;border-top:1px solid #1e1e3a;background:#060610}
    .ga-pre{background:#030308;border:1px solid #1e1e3a;border-radius:3px;padding:5px 8px;font-size:.65rem;color:#64748b;white-space:pre-wrap;word-break:break-all;max-height:120px;overflow-y:auto;margin-top:4px;font-family:inherit}
    .ga-acts{display:flex;gap:3px;margin-top:4px}
    .ga-btn{background:none;border:1px solid rgba(255,255,255,.08);color:#475569;border-radius:3px;padding:2px 7px;font-size:.65rem;cursor:pointer;font-family:inherit}
    .ga-btn:hover{border-color:#22c55e;color:#86efac}
    .gg-row{padding:3px 0;border-bottom:1px solid rgba(30,30,58,.5);display:flex;gap:5px;font-size:.67rem}
    .gg-type{font-weight:700;flex-shrink:0;width:74px}.gg-domain{color:#475569;flex-shrink:0;width:74px;font-size:.6rem}
    .gg-desc{color:#475569;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .gg-score{flex-shrink:0;width:30px;text-align:right;font-weight:700}
    .gs-card{background:#080812;border:1px solid #1e1e3a;border-radius:4px;padding:7px 10px;margin-bottom:5px}
    .gs-key{font-size:.6rem;color:#334155;text-transform:uppercase;letter-spacing:.1em;margin-bottom:2px}
    .gs-label{font-size:.72rem;color:#cbd5e1;margin-bottom:3px;font-weight:600}
    .gs-desc{font-size:.6rem;color:#1e293b;margin-bottom:5px}
    .gs-card input[type=range]{width:100%;accent-color:#22c55e}.gs-card select,.gs-card textarea,.gs-card input[type=text]{background:#050510;border:1px solid #1e1e3a;color:#94a3b8;padding:3px 7px;font-family:inherit;font-size:.7rem;width:100%;outline:none}
    .gs-tgl{position:relative;width:32px;height:18px;cursor:pointer;display:inline-block}
    .gs-tgl input{opacity:0;width:0;height:0}
    .gs-tsl{position:absolute;inset:0;background:#1e1e3a;border-radius:18px;transition:.2s}
    .gs-tsl::before{content:'';position:absolute;height:12px;width:12px;left:3px;bottom:3px;background:#334155;border-radius:50%;transition:.2s}
    .gs-tgl input:checked+.gs-tsl{background:#22c55e}.gs-tgl input:checked+.gs-tsl::before{transform:translateX(14px);background:#fff}
  `;
  document.head.appendChild(s);
}

function el(tag,id,styles){const e=document.createElement(tag);if(id)e.id=id;Object.assign(e.style,styles||{});return e;}

function buildUI(){
  injectStyles();
  const root=el('div','__g8gptroot__',{});document.body.appendChild(root);
  const pill=el('div','__g8gptpill__',{});
  const dot=el('div','__g8gptdot__',{width:'7px',height:'7px',borderRadius:'50%',background:'#888',transition:'background .4s',flexShrink:'0'});
  const lbl=el('span','__g8gptlabel__',{color:'#cbd5e1',fontSize:'11px',fontWeight:'500'});lbl.textContent='Guardian';
  const prov=el('span',null,{color:'#475569',fontSize:'10px',borderLeft:'1px solid rgba(255,255,255,.1)',paddingLeft:'7px',marginLeft:'1px'});prov.textContent='chatgpt v8';
  const claimBadge=el('span','__g8gptclaim__',{fontSize:'9px',padding:'1px 6px',borderRadius:'8px',fontWeight:'700',letterSpacing:'.05em',transition:'all .3s',background:'rgba(100,116,139,.12)',color:'#64748b'});claimBadge.textContent='PASSIVE';
  const badge=el('span','__g8gptbadge__',{background:'#7c3aed',color:'#fff',borderRadius:'10px',padding:'0 5px',fontSize:'10px',display:'none',fontWeight:'600'});
  pill.append(dot,lbl,prov,claimBadge,badge);

  const panel=el('div','__g8gptpanel__',{});
  const hdr=el('div',null,{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px',borderBottom:'1px solid rgba(255,255,255,.07)',background:'rgba(255,255,255,.03)',flexShrink:'0'});
  const hdrL=el('div',null,{display:'flex',alignItems:'center',gap:'8px'});
  const hdrDot=el('div','__g8gpthdrdot__',{width:'8px',height:'8px',borderRadius:'50%',background:'#888',flexShrink:'0'});
  const hdrTitle=el('span',null,{color:'#e2e8f0',fontWeight:'600',fontSize:'12px'});hdrTitle.textContent='Guardian v8 — ChatGPT';
  const hdrBadge=el('span','__g8gpthdrbadge__',{fontSize:'9px',padding:'1px 7px',borderRadius:'10px',background:'rgba(136,136,136,.2)',color:'#888',textTransform:'uppercase',letterSpacing:'.06em',fontWeight:'600'});hdrBadge.textContent='DISCONNECTED';
  hdrL.append(hdrDot,hdrTitle,hdrBadge);
  const clearBtn=el('button',null,{background:'none',border:'1px solid rgba(255,255,255,.1)',color:'#475569',borderRadius:'6px',padding:'2px 8px',cursor:'pointer',fontSize:'10px'});clearBtn.textContent='Clear';clearBtn.onclick=()=>{logEntries=[];ledgerEntries=[];renderActiveTab();};
  hdr.append(hdrL,clearBtn);

  const jobBar=el('div','__g8gptjobbar__',{display:'none',alignItems:'center',gap:'8px',padding:'7px 14px',background:'rgba(251,191,36,.08)',borderBottom:'1px solid rgba(251,191,36,.15)',flexShrink:'0'});
  const jDot=el('div',null,{width:'6px',height:'6px',borderRadius:'50%',background:'#fbbf24',animation:'gpulse 1.2s ease-in-out infinite',flexShrink:'0'});
  const jText=el('span','__g8gptjobtext__',{color:'#fde68a',fontSize:'10px',fontWeight:'500',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:'1'});jText.textContent='Job running…';jobBar.append(jDot,jText);

  const tabs=el('div','__g8gpttabs__',{});
  for(const[id,lbl2]of[['log','Log'],['artifacts','Arts'],['gaps','Gaps'],['pa','PA'],['settings','Settings'],['api','API']]){
    const t=el('div',null,{});t.className='g8gpttab'+(id===activeTab?' active':'');t.textContent=lbl2;t.dataset.tab=id;t.addEventListener('click',()=>switchTab(id));tabs.appendChild(t);
  }

  const logArea=el('div','__g8gptlog__',{});logArea.className='g8gptarea';
  const artsArea=el('div','__g8gptarts__',{display:'none'});artsArea.className='g8gptarea';
  const gapsArea=el('div','__g8gptgaps__',{display:'none'});gapsArea.className='g8gptarea';
  const paArea=el('div','__g8gptpa__',{display:'none'});paArea.className='g8gptarea';
  const settingsArea=el('div','__g8gptsettings__',{display:'none'});settingsArea.className='g8gptarea';
  const apiArea=el('div','__g8gptapi__',{display:'none'});apiArea.className='g8gptarea';

  const footer=el('div',null,{padding:'7px 14px',borderTop:'1px solid rgba(255,255,255,.05)',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:'0'});
  const fL=el('span','__g8gptfooter__',{color:'#334155',fontSize:'10px'});fL.textContent='wss://127.0.0.1:7821 · chatgpt';
  const fR=el('span',null,{color:'#1e293b',fontSize:'10px'});fR.textContent=`v${VERSION}`;footer.append(fL,fR);

  panel.append(hdr,jobBar,tabs,logArea,artsArea,gapsArea,paArea,settingsArea,apiArea,footer);
  pill.addEventListener('click',()=>{panelOpen=!panelOpen;panel.style.display=panelOpen?'flex':'none';if(panelOpen){renderActiveTab();unreadCount=0;badge.style.display='none';}});
  root.append(panel,pill);
}

// Tabs
const AREAS_GPT={log:'__g8gptlog__',artifacts:'__g8gptarts__',gaps:'__g8gptgaps__',pa:'__g8gptpa__',settings:'__g8gptsettings__',api:'__g8gptapi__'};
function switchTab(id){
  activeTab=id;
  document.querySelectorAll('.g8gpttab').forEach(t=>t.classList.toggle('active',t.dataset.tab===id));
  for(const[k,elId]of Object.entries(AREAS_GPT)){const e=document.getElementById(elId);if(e)e.style.display=k===id?'block':'none';}
  renderActiveTab();
}

// Log
const LOG_TYPES={info:{color:'#94a3b8',icon:'·'},in:{color:'#60a5fa',icon:'↓'},out:{color:'#a78bfa',icon:'↑'},ok:{color:'#34d399',icon:'✓'},err:{color:'#f87171',icon:'✗'},job:{color:'#fbbf24',icon:'⚡'},hb:{color:'#475569',icon:'♥'},sys:{color:'#818cf8',icon:'◈'},gap:{color:'#f472b6',icon:'△'}};
const COLORS={connecting:{dot:'#888',badge:'#888'},handshaking:{dot:'#f59e0b',badge:'#f59e0b'},ready:{dot:'#22c55e',badge:'#22c55e'},disconnected:{dot:'#ef4444',badge:'#ef4444'}};
function addLog(type,msg,detail){const t=LOG_TYPES[type]||LOG_TYPES.info;const entry={ts:Date.now(),type,msg,detail:detail||null,color:t.color,icon:t.icon};logEntries.push(entry);if(logEntries.length>LOG_MAX)logEntries.shift();if(panelOpen&&activeTab==='log'){renderLogEntry(entry);scrollLog();}else if(type!=='hb'){unreadCount++;const b=document.getElementById('__g8gptbadge__');if(b){b.textContent=unreadCount>99?'99+':unreadCount;b.style.display='inline';}}}
function renderLog(){const a=document.getElementById('__g8gptlog__');if(!a)return;a.innerHTML='';logEntries.forEach(e=>renderLogEntry(e));scrollLog();}
function scrollLog(){const a=document.getElementById('__g8gptlog__');if(a)a.scrollTop=a.scrollHeight;}
function renderLogEntry(entry){const a=document.getElementById('__g8gptlog__');if(!a)return;const row=document.createElement('div');row.className='g8row';Object.assign(row.style,{display:'flex',alignItems:'flex-start',gap:'8px',padding:'3px 12px',transition:'background .15s'});const ts=document.createElement('span');ts.textContent=fts(entry.ts);Object.assign(ts.style,{color:'#1e293b',fontSize:'10px',flexShrink:'0'});const ic=document.createElement('span');ic.textContent=entry.icon;Object.assign(ic.style,{color:entry.color,flexShrink:'0',width:'10px',textAlign:'center'});const ct=document.createElement('div');Object.assign(ct.style,{flex:'1',minWidth:'0'});const m=document.createElement('span');m.textContent=entry.msg;Object.assign(m.style,{color:entry.color,fontSize:'10px'});ct.appendChild(m);if(entry.detail){const d=document.createElement('div');d.textContent=entry.detail;Object.assign(d.style,{color:'#334155',fontSize:'10px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'});ct.appendChild(d);}row.append(ts,ic,ct);a.appendChild(row);}

function setConnState(state){connState=state;const c=COLORS[state]||COLORS.disconnected;const d=document.getElementById('__g8gptdot__');if(d)d.style.background=c.dot;const hd=document.getElementById('__g8gpthdrdot__');if(hd)hd.style.background=c.dot;const hb2=document.getElementById('__g8gpthdrbadge__');if(hb2){const labels={connecting:'CONNECTING',handshaking:'HANDSHAKING',ready:'READY',disconnected:'DISCONNECTED'};hb2.textContent=labels[state]||state.toUpperCase();hb2.style.background=`${c.badge}22`;hb2.style.color=c.badge;}const l=document.getElementById('__g8gptlabel__');if(l)l.textContent=state==='ready'?'Guardian':'Guardian';}

function renderActiveTab(){
  if(activeTab==='log')renderLog();
  if(activeTab==='artifacts')renderArtifactsTab();
  if(activeTab==='gaps')renderGapsTab();
  if(activeTab==='pa')renderPATab();
  if(activeTab==='settings')renderSettingsTab();
  if(activeTab==='api')renderApiTab();
}

// Artifacts
let artFilter='all',artSearch='',artExpanded=new Set();
const ART_ICONS={typescript:'🔷',ts:'🔷',javascript:'🟨',js:'🟨',python:'🐍',html:'🌐',css:'🎨',json:'📋',bash:'💲',rust:'🦀'};
function renderArtifactsTab(){
  const area=document.getElementById('__g8gptarts__');if(!area)return;area.innerHTML='';
  area.innerHTML=`<div style="display:flex;gap:5px;margin-bottom:6px;flex-wrap:wrap">${['all','ts','js','python','html','css','json'].map(f=>`<button onclick="artFilter='${f}';renderArtifactsTab()" style="background:${artFilter===f?'rgba(34,197,94,.08)':'#0d0d1a'};border:1px solid ${artFilter===f?'#22c55e':'rgba(255,255,255,.08)'};color:${artFilter===f?'#86efac':'#334155'};border-radius:3px;padding:1px 6px;font-size:9px;cursor:pointer;font-family:inherit">${f}</button>`).join('')}</div>`;
  const items=artifactStore.filter(a=>artFilter==='all'||a.lang===artFilter||(artFilter==='ts'&&a.lang==='typescript')||(artFilter==='js'&&a.lang==='javascript'));
  if(!items.length){area.innerHTML+='<div style="color:#1e293b;font-size:10px;padding:16px;text-align:center">No artifacts yet. Start a conversation.</div>';return;}
  for(const item of items.slice(0,60)){
    const hash=item.hash||item.id,isExp=artExpanded.has(hash),ic=ART_ICONS[item.lang]||'◻';
    const card=document.createElement('div');card.className='ga-card'+(isExp?' exp':'');
    const hdrEl=document.createElement('div');hdrEl.className='ga-hdr';
    hdrEl.innerHTML=`<span>${ic}</span><span class="ga-name" style="color:#a78bfa">${escHtml(item.name||'artifact')}</span>${item.lang?`<span class="ga-lang">${item.lang}</span>`:''}<span class="ga-ts">${fts(item.ts)}</span>`;
    hdrEl.onclick=()=>{if(isExp)artExpanded.delete(hash);else artExpanded.add(hash);renderArtifactsTab();};card.appendChild(hdrEl);
    if(isExp){const body=document.createElement('div');body.className='ga-body';if(item.content){const pre=document.createElement('pre');pre.className='ga-pre';pre.textContent=item.content.slice(0,2000);body.appendChild(pre);}const acts=document.createElement('div');acts.className='ga-acts';const copyB=document.createElement('button');copyB.className='ga-btn';copyB.textContent='⎘ Copy';copyB.onclick=e=>{e.stopPropagation();navigator.clipboard.writeText(item.content||'').then(()=>{copyB.textContent='✓';setTimeout(()=>copyB.textContent='⎘ Copy',1200);});};acts.appendChild(copyB);body.appendChild(acts);card.appendChild(body);}
    area.appendChild(card);
  }
}

// Gaps
function renderGapsTab(){const area=document.getElementById('__g8gptgaps__');if(!area)return;area.innerHTML='';if(!currentGaps.length){area.innerHTML='<div style="color:#1e293b;font-size:10px;padding:16px;text-align:center">No gaps detected yet.</div>';return;}for(const g of currentGaps){const col=g.score>0.7?'#ef4444':g.score>0.4?'#f59e0b':'#f472b6';const row=document.createElement('div');row.className='gg-row';row.innerHTML=`<span class="gg-type" style="color:${col}">${g.type||'—'}</span><span class="gg-domain">${g.domain||'—'}</span><span class="gg-desc" title="${escHtml(g.description||'')}">${escHtml(g.description||'')}</span><span class="gg-score" style="color:${col}">${((g.score||0)*100).toFixed(0)}%</span>`;area.appendChild(row);}}

// PA
function renderPATab(){const area=document.getElementById('__g8gptpa__');if(!area)return;area.innerHTML='';const session=pa.session;if(!session||!session.chunks.length){area.innerHTML='<div style="color:#1e293b;font-size:10px;padding:16px;text-align:center">No PA session active.</div>';return;}const elapsed=session.chunks.length>1?(session.chunks.at(-1).t-session.chunks[0].t)/1000:0;const tps=elapsed>0?(session.totalTokens/elapsed).toFixed(1):'—';area.innerHTML=`<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-bottom:8px"><div style="background:#080812;border:1px solid #1e1e3a;padding:4px 6px;text-align:center"><div style="color:#a0d0ff;font-size:.85rem;font-weight:600">${session.totalTokens}</div><div style="color:#1e293b;font-size:.58rem;text-transform:uppercase">Tokens</div></div><div style="background:#080812;border:1px solid #1e1e3a;padding:4px 6px;text-align:center"><div style="color:#a0d0ff;font-size:.85rem;font-weight:600">${tps}</div><div style="color:#1e293b;font-size:.58rem;text-transform:uppercase">Tok/s</div></div><div style="background:#080812;border:1px solid #1e1e3a;padding:4px 6px;text-align:center"><div style="color:#a0d0ff;font-size:.85rem;font-weight:600">${session.pauseZones?.length||0}</div><div style="color:#1e293b;font-size:.58rem;text-transform:uppercase">Pauses</div></div><div style="background:#080812;border:1px solid #1e1e3a;padding:4px 6px;text-align:center"><div style="color:#a0d0ff;font-size:.85rem;font-weight:600">${session.hypotheses?.length||0}</div><div style="color:#1e293b;font-size:.58rem;text-transform:uppercase">Hyp</div></div></div>`;for(const h of(session.hypotheses||[])){const d=document.createElement('div');d.style.cssText='background:#060610;border-left:2px solid #22c55e;padding:4px 8px;margin-bottom:4px';d.innerHTML=`<div style="color:#c7d2fe;font-size:.7rem;margin-bottom:2px">${escHtml(h.label||'')}</div><div style="color:#22c55e;font-size:.62rem">${((h.confidence||0)*100).toFixed(0)}% confidence</div>`;area.appendChild(d);}}

// Settings
const SETTING_META=[{key:'session_greeting_enabled',label:'Session Greeting',type:'toggle',desc:'Auto-inject greeting on new blank chats'},{key:'scan_debounce_ms',label:'DOM Scan Debounce',type:'range',min:200,max:5000,step:100,unit:'ms',desc:'Delay after DOM mutations before scanning'},{key:'gap_min_score',label:'Gap Min Score',type:'range',min:0,max:1,step:0.05,unit:'',desc:'Minimum gap magnitude'},{key:'pa_enabled',label:'Prompt Archaeology',type:'toggle',desc:'Enable PA chunk collection'},{key:'memory_auto_push',label:'Auto Memory Push',type:'toggle',desc:'Auto-POST artifacts to memory'},{key:'poll_interval_ms',label:'Poll Interval',type:'range',min:100,max:2000,step:50,unit:'ms',desc:'Response check frequency'},{key:'stable_count_threshold',label:'Stable Threshold',type:'range',min:2,max:15,step:1,unit:'',desc:'Polls before job complete'},{key:'greeting_delay_ms',label:'Greeting Delay',type:'range',min:400,max:5000,step:100,unit:'ms',desc:'Wait before greeting inject'}];
function renderSettingsTab(){
  const area=document.getElementById('__g8gptsettings__');if(!area)return;area.innerHTML='';
  // Claim control
  const claimCard=document.createElement('div');claimCard.className='gs-card';
  claimCard.innerHTML=`<div class="gs-key">tab_claim</div><div class="gs-label">Tab Claim</div><div class="gs-desc">Only claimed tabs receive and execute jobs</div><div style="display:flex;align-items:center;gap:8px"><span style="font-size:.7rem;color:${isClaimed?'#22c55e':'#475569'}">${isClaimed?'CLAIMED':'PASSIVE'}</span><button onclick="isClaimed?releaseTab():claimTab();renderSettingsTab()" style="background:none;border:1px solid rgba(255,255,255,.1);color:#475569;border-radius:3px;padding:2px 8px;font-size:.68rem;cursor:pointer;font-family:inherit">${isClaimed?'Release':'Claim'}</button></div>`;
  area.appendChild(claimCard);
  for(const m of SETTING_META){const val=CFG[m.key];const card=document.createElement('div');card.className='gs-card';const kEl=document.createElement('div');kEl.className='gs-key';kEl.textContent=m.key;const lEl=document.createElement('div');lEl.className='gs-label';lEl.textContent=m.label;const dEl=document.createElement('div');dEl.className='gs-desc';dEl.textContent=m.desc;card.append(kEl,lEl,dEl);let ctrl;if(m.type==='toggle'){const wrap=document.createElement('div');wrap.style.cssText='display:flex;align-items:center;gap:6px';const lbl=document.createElement('label');lbl.className='gs-tgl';const inp=document.createElement('input');inp.type='checkbox';inp.checked=!!val;const sl=document.createElement('span');sl.className='gs-tsl';lbl.append(inp,sl);const vl=document.createElement('span');vl.style.cssText='font-size:.7rem;color:#475569';vl.textContent=val?'ON':'OFF';inp.onchange=async(e)=>{CFG[m.key]=e.target.checked;vl.textContent=e.target.checked?'ON':'OFF';await apiPut('/settings/'+m.key,{value:e.target.checked?'true':'false'});};wrap.append(lbl,vl);ctrl=wrap;}else if(m.type==='range'){const wrap=document.createElement('div');const vl=document.createElement('span');vl.style.cssText='font-size:.7rem;color:#22c55e;float:right';vl.textContent=val+(m.unit||'');const inp=document.createElement('input');inp.type='range';inp.min=m.min;inp.max=m.max;inp.step=m.step;inp.value=val;inp.oninput=e=>{vl.textContent=e.target.value+(m.unit||'');};inp.onchange=async(e)=>{CFG[m.key]=Number(e.target.value);await apiPut('/settings/'+m.key,{value:e.target.value});};wrap.append(vl,inp);ctrl=wrap;}card.appendChild(ctrl);area.appendChild(card);}
  const resetBtn=document.createElement('button');resetBtn.className='gs-save';resetBtn.textContent='↺ Reset all to defaults';resetBtn.onclick=async()=>{if(confirm('Reset all settings?')){await apiPost('/settings/reset',{});await loadSettings();renderSettingsTab();}};area.appendChild(resetBtn);
}

// API
function renderApiTab(){
  const area=document.getElementById('__g8gptapi__');if(!area)return;area.innerHTML='';
  function sec(l){const d=document.createElement('div');d.style.cssText='margin-bottom:10px';const lEl=document.createElement('div');lEl.style.cssText='font-size:.65rem;color:#334155;text-transform:uppercase;letter-spacing:.1em;font-weight:700;margin-bottom:5px';lEl.textContent=l;d.appendChild(lEl);area.appendChild(d);return d;}
  function crd(p,title,val,cls=''){const c=document.createElement('div');c.style.cssText='background:#080812;border:1px solid #1e1e3a;border-radius:4px;padding:6px 10px;margin-bottom:5px';c.innerHTML=`<div style="color:#818cf8;font-size:.65rem;font-weight:700;margin-bottom:2px">${escHtml(title)}</div><div style="color:#64748b;font-size:.7rem;word-break:break-all" class="${cls}">${escHtml(val)}</div>`;p.appendChild(c);}
  const idSec=sec('Identity');crd(idSec,'Account',getAccount()||'—');crd(idSec,'Chat ID',chatIdFromUrl());crd(idSec,'Tab ID',MY_TAB_ID.slice(-12));
  const agSec=sec('Agent Status');
  const sc=document.createElement('div');sc.style.cssText='background:#080812;border:1px solid #1e1e3a;border-radius:4px;padding:6px 10px;margin-bottom:5px';
  sc.innerHTML=`<div style="color:#818cf8;font-size:.65rem;font-weight:700;margin-bottom:2px">Tab Claim</div><div style="color:${isClaimed?'#22c55e':'#475569'};font-size:.7rem">${isClaimed?'CLAIMED — will receive jobs':'PASSIVE — jobs ignored'}</div>`;agSec.appendChild(sc);
  const stBtn=document.createElement('button');stBtn.style.cssText='background:#0d0d1a;border:1px solid rgba(255,255,255,.1);color:#64748b;border-radius:3px;padding:3px 8px;font-size:.68rem;cursor:pointer;font-family:inherit;margin-right:3px';stBtn.textContent=agentEndpointActive?'⏹ Stop Polling':'▶ Start Polling';stBtn.onclick=()=>{if(agentEndpointActive)stopAgentEndpointPolling();else startAgentEndpointPolling();renderApiTab();};agSec.appendChild(stBtn);
  const clBtn=document.createElement('button');clBtn.style.cssText='background:#0d0d1a;border:1px solid rgba(255,255,255,.1);color:#64748b;border-radius:3px;padding:3px 8px;font-size:.68rem;cursor:pointer;font-family:inherit';clBtn.textContent=isClaimed?'Release tab':'Claim tab';clBtn.onclick=()=>{if(isClaimed)releaseTab();else claimTab();renderApiTab();};agSec.appendChild(clBtn);
  const ckBtn=document.createElement('button');ckBtn.style.cssText='background:#0d0d1a;border:1px solid rgba(255,255,255,.1);color:#64748b;border-radius:3px;padding:3px 8px;font-size:.68rem;cursor:pointer;font-family:inherit;margin-left:3px';ckBtn.textContent='⬡ Cockpit';ckBtn.onclick=()=>window.open('http://127.0.0.1:7820/cockpit','_blank');agSec.appendChild(ckBtn);
}

// WS
function sendToServer(obj){if(ws&&ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(obj));}
function connect(){
  if(reconnectTimer){clearTimeout(reconnectTimer);reconnectTimer=null;}
  setConnState('connecting');addLog('info','Connecting…',WS_URL);
  ws=new WebSocket(WS_URL);
  ws.onopen=()=>{setConnState('handshaking');ws.send(JSON.stringify({type:'GUARDIAN_REGISTER',provider:PROVIDER,host:location.hostname,tabId:MY_TAB_ID,claimed:amIClaimed()}));hb=setInterval(()=>sendToServer({type:'GUARDIAN_HEARTBEAT',provider:PROVIDER,tabId:MY_TAB_ID,ts:Date.now()}),HB_INTERVAL);};
  ws.onmessage=(e)=>{let msg;try{msg=JSON.parse(e.data);}catch{return;}switch(msg.type){case 'GUARDIAN_READY':setConnState('ready');addLog('ok',`Ready · ${msg.provider||PROVIDER}`);tryAutoClaimIfNoneActive();startDOMObserver();setTimeout(()=>{getAccount();},500);setTimeout(()=>{const id=chatIdFromUrl();if(id&&id!=='home'&&isChatBlank())sendGreeting(id);},2000);break;case 'GUARDIAN_CLAIM':if(msg.tabId===MY_TAB_ID||msg.tabId==='any'){claimTab();sendToServer({type:'GUARDIAN_CLAIM_ACK',tabId:MY_TAB_ID,provider:PROVIDER});}break;case 'GUARDIAN_RELEASE':if(msg.tabId===MY_TAB_ID||msg.tabId==='any'){releaseTab();addLog('info','Tab released');}break;case 'GUARDIAN_JOB':handleJob(msg);break;case 'GUARDIAN_HEARTBEAT_ACK':break;default:addLog('in',`← ${msg.type}`,JSON.stringify(msg).slice(0,80));}};
  ws.onclose=(e)=>{clearInterval(hb);setConnState('disconnected');addLog('err',`Disconnected (${e.code})`);if(currentJobId)stopWatch();reconnectTimer=setTimeout(connect,RECONNECT_MS);};
  ws.onerror=()=>{setConnState('disconnected');addLog('err','WebSocket error');};
}

// Init
async function init(){buildUI();await loadSettings();connect();startNavWatcher();startDOMObserver();switchTab('log');addLog('sys',`Guardian v${VERSION} — ChatGPT — SISO+GapHunter+PA`);setInterval(loadSettings,60000);}
if(document.readyState==='complete')setTimeout(init,600);
else window.addEventListener('load',()=>setTimeout(init,600));

})();
