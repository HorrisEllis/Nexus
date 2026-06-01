// ==UserScript==
// @name         Guardian — ChatGPT v8.3 + Queue + SEAM + Gates + Toasts
// @namespace    nexus.guardian.chatgpt
// @version      8.3.0
// @description  Guardian v8.3: job queue with gated states, sigma/delta/truncation detection,
//               retry with injected forensic context, Idearium progress sync, SISO bus,
//               GapHunter v3, Prompt Archaeology, SEAM delivery, tab claim, toasts
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

// ── Constants ────────────────────────────────────────────────────────────────
const WS_URL      = 'wss://127.0.0.1:7821';
const API_URL     = 'http://127.0.0.1:7820';
const MEMORY_URL  = 'http://127.0.0.1:7823';
const RECONNECT_MS = 3000, HB_INTERVAL = 8000, LOG_MAX = 200, LEDGER_MAX = 200, ARTIFACT_MAX = 500;
const PROVIDER = 'chatgpt', VERSION = '8.3.0';

// ── Toast system ─────────────────────────────────────────────────────────────
let _toastTimer = null;
function toast(msg, type = 'info', duration = 3000) {
  let el = document.getElementById('__g8gpt_toast__');
  if (!el) {
    el = document.createElement('div');
    el.id = '__g8gpt_toast__';
    Object.assign(el.style, {
      position:'fixed', bottom:'72px', right:'20px', zIndex:'2147483648',
      maxWidth:'340px', padding:'8px 13px', borderRadius:'6px', fontFamily:"'SF Mono','Fira Code',monospace",
      fontSize:'11px', fontWeight:'500', lineHeight:'1.4', pointerEvents:'none',
      transition:'opacity .25s,transform .25s', opacity:'0', transform:'translateY(6px)',
    });
    document.body.appendChild(el);
  }
  const STYLES = {
    success: { bg:'rgba(34,197,94,.13)',  border:'rgba(34,197,94,.4)',  color:'#86efac', icon:'✓' },
    error:   { bg:'rgba(239,68,68,.13)',  border:'rgba(239,68,68,.4)',  color:'#fca5a5', icon:'✗' },
    warn:    { bg:'rgba(245,158,11,.13)', border:'rgba(245,158,11,.4)', color:'#fde68a', icon:'⚠' },
    info:    { bg:'rgba(96,165,250,.1)',  border:'rgba(96,165,250,.35)',color:'#93c5fd', icon:'·' },
    job:     { bg:'rgba(167,139,250,.1)', border:'rgba(167,139,250,.35)',color:'#c4b5fd',icon:'⚡' },
  };
  const s = STYLES[type] || STYLES.info;
  el.textContent = `${s.icon} ${msg}`;
  Object.assign(el.style, { background:s.bg, border:`1px solid ${s.border}`, color:s.color, opacity:'1', transform:'translateY(0)' });
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.style.opacity='0'; el.style.transform='translateY(6px)'; }, duration);
}

// ── Gates ────────────────────────────────────────────────────────────────────
// Each gate: returns {ok, error} — logs on failure, shows toast, sends to server
async function gate(name, fn, opts = {}) {
  const { toastOnFail = true, logLevel = 'err', jobId = null } = opts;
  try {
    const result = await fn();
    evLog('gate.pass', { gate: name });
    return { ok: true, result };
  } catch (e) {
    const msg = `${name}: ${e.message || String(e)}`;
    addLog(logLevel, `Gate failed: ${name}`, e.message);
    evLog('gate.fail', { gate: name, error: e.message });
    if (toastOnFail) toast(msg, 'error', 4000);
    if (jobId) sendToServer({ type: 'GUARDIAN_ERROR', jobId, gate: name, error: msg, chatUrl: location.href, account: getAccount() });
    return { ok: false, error: msg };
  }
}

// ── Event logger (exhaustive) ─────────────────────────────────────────────────
const EVENT_LOG = [];
function evLog(type, data = {}) {
  const entry = { ts: Date.now(), type, data, chatId: chatIdFromUrl() };
  EVENT_LOG.push(entry);
  if (EVENT_LOG.length > 500) EVENT_LOG.shift();
  // Send to server for every significant event
  if (!type.startsWith('dom.') && !type.startsWith('pa.chunk')) {
    sendToServer({ type: 'GUARDIAN_EVENT', event: entry, account: getAccount(), provider: PROVIDER });
  }
  sisoEmit('guardian.event', entry);
}

// ── Settings ─────────────────────────────────────────────────────────────────
let CFG = {
  scan_debounce_ms:1500, artifact_max:500, gap_min_score:0.25, pa_enabled:true,
  memory_auto_push:true, dropzone_auto_upload:true, session_greeting_enabled:true,
  session_greeting_text:'Guardian session initialising. Please ask me: "What are we calling this session?" — then wait for my answer before we begin.',
  greeting_delay_ms:1200, poll_interval_ms:500, stable_count_threshold:5,
  stream_log_level:'EVENTS', rebuild_from_server:false,
};

async function apiGet(p, timeout = 7000) {
  const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), timeout);
  try { const r = await fetch(API_URL + p, { signal: ctrl.signal }); clearTimeout(timer); return r.ok ? r.json() : null; }
  catch(e) { clearTimeout(timer); throw e; }
}
async function apiPost(p, b) {
  const r = await fetch(API_URL+p, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(b) });
  return r.ok ? r.json() : null;
}
async function apiPut(p, b) {
  const r = await fetch(API_URL+p, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(b) });
  return r.ok ? r.json() : null;
}

async function loadSettings() {
  const result = await gate('loadSettings', async () => {
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
    return r;
  }, { toastOnFail: false, logLevel: 'info' });
  if (!result.ok) addLog('info', 'Settings load failed — using defaults');
}

async function rebuildFromServer() {
  addLog('sys', 'Rebuilding from server (JAA)…');
  toast('Rebuilding from JAA…', 'info');
  const result = await gate('rebuildFromServer', async () => {
    const r = await apiGet('/artifacts?limit=200');
    if (r?.artifacts?.length) {
      artifactStore = r.artifacts.map(a => ({
        id:a.id, hash:a.hash, name:a.name, type:a.type, lang:a.lang,
        content:a.content, context:a.context, chatUrl:a.chat_url,
        chatId:a.chat_id, account:a.account, jobId:a.job_id, ts:a.ts, direction:a.direction,
      }));
      seenArtifactHashes = new Set(artifactStore.map(a => a.hash));
      return r.artifacts.length;
    }
    return 0;
  });
  if (result.ok) {
    addLog('ok', `Rebuilt ${result.result} artifacts from server`);
    toast(`Rebuilt ${result.result} artifacts`, 'success');
  }
}

// ── Tab claim ────────────────────────────────────────────────────────────────
const TAB_CLAIM_KEY = 'guardian_claimed_tab', TAB_ID_KEY = 'guardian_tab_id';
if (!sessionStorage.getItem(TAB_ID_KEY)) sessionStorage.setItem(TAB_ID_KEY, `tab_${Date.now()}_${Math.random().toString(36).slice(2,7)}`);
const MY_TAB_ID = sessionStorage.getItem(TAB_ID_KEY);
let isClaimed = false;

function amIClaimed() { return localStorage.getItem(TAB_CLAIM_KEY) === MY_TAB_ID; }
function claimTab() {
  localStorage.setItem(TAB_CLAIM_KEY, MY_TAB_ID); isClaimed = true;
  sessionStorage.setItem('guardian_is_claimed', '1'); updateClaimBadge();
  addLog('ok', 'Tab claimed', MY_TAB_ID.slice(-8));
  toast('Tab claimed — ACTIVE', 'success', 2000);
  evLog('tab.claimed', { tabId: MY_TAB_ID });
}
function releaseTab() {
  if (amIClaimed()) localStorage.removeItem(TAB_CLAIM_KEY);
  isClaimed = false; sessionStorage.removeItem('guardian_is_claimed'); updateClaimBadge();
  evLog('tab.released', { tabId: MY_TAB_ID });
}
window.addEventListener('beforeunload', releaseTab);
function tryAutoClaimIfNoneActive() {
  const ex = localStorage.getItem(TAB_CLAIM_KEY);
  if (!ex) { claimTab(); }
  else if (ex === MY_TAB_ID) { isClaimed = true; sessionStorage.setItem('guardian_is_claimed', '1'); updateClaimBadge(); }
  else { addLog('info', 'Another tab claimed — passive mode'); updateClaimBadge(); }
}
function updateClaimBadge() {
  const b = document.getElementById('__g8gptclaim__');
  if (!b) return;
  b.textContent = isClaimed ? 'ACTIVE' : 'PASSIVE';
  b.style.color = isClaimed ? '#22c55e' : '#64748b';
  b.style.background = isClaimed ? 'rgba(34,197,94,.12)' : 'rgba(100,116,139,.12)';
}

// ── SISO Bus ─────────────────────────────────────────────────────────────────
const sisoChannel = new BroadcastChannel('guardian-siso-v8');
const seamChannel = new BroadcastChannel('guardian-seam-v1');
function sisoEmit(type, data = {}) {
  try { sisoChannel.postMessage({ type, data, ts: Date.now(), provider: PROVIDER }); } catch(_) {}
}

// ── State ────────────────────────────────────────────────────────────────────
let ws = null, hb = null, currentJobId = null, connState = 'disconnected', panelOpen = false, activeTab = 'log';
let logEntries = [], ledgerEntries = [], unreadCount = 0, reconnectTimer = null;
let scanDebounceTimer = null, domSystems = {}, domObserver = null;
let seenArtifactHashes = new Set(), accountState = null, sessionStartTime = Date.now(), sessionTokenTotal = 0;
let artifactStore = [], detectedDownloads = [], agentEndpointActive = false, agentPollInterval = null;
const pa = { session: null, sessions: [] };
const greetedChats = new Set((() => { try { return JSON.parse(sessionStorage.getItem('guardian_greeted_gpt_v82')||'[]'); } catch(_) { return []; } })());
function saveGreeted() { try { sessionStorage.setItem('guardian_greeted_gpt_v82', JSON.stringify([...greetedChats])); } catch(_) {} }
let lastPathname = location.pathname, lastChatId = chatIdFromUrl(), currentGaps = [];

// ── SEAM State ───────────────────────────────────────────────────────────────
let seamState = { chunks:[], activeChunk:0, specTitle:'Untitled', customSystemPrompt:'', created:Date.now() };
let seamAutoInject = false, seamView = 'deliver', seamExpandedChunk = -1;

const SEAM_SYSTEM_PROMPTS = {
  nexus: `You are building the NEXUS system. Read this spec chunk carefully and implement exactly what is described. Do not abbreviate, stub, or defer any functionality. When implementation is complete, run the specified tests and report results using the exact format:\n\nTEST RESULTS:\n[PASS/FAIL] Test 1: <description>\n...\nSEAM VERDICT: PASS | FAIL`,
  seam:  `You are a SEAM verifier. Your job is to receive a spec chunk, implement it, test it, and report a structured verdict. For each test step listed in the SEAM CONTRACT, report PASS or FAIL with evidence. End with:\n\nSEAM VERDICT: PASS\nor\nSEAM VERDICT: FAIL — <reason>`,
  none:  ``,
};

function seamSaveState() { try { localStorage.setItem('seam_state_chatgpt', JSON.stringify(seamState)); } catch(_) {} }
function seamLoadState() { try { const s = localStorage.getItem('seam_state_chatgpt'); if (s) { seamState = JSON.parse(s); return true; } } catch(_) {} return false; }
function seamUid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }

function seamAutoGenerateTests(content) {
  const tests = [];
  if (/^\|.+\|/m.test(content)) tests.push({ text:'All table entries implemented/acknowledged', pass:null });
  if (/```/.test(content)) tests.push({ text:'All code blocks acknowledged and queued for implementation', pass:null });
  const musts = (content.match(/\b(MUST|REQUIRED|SHALL|CRITICAL)\b/g)||[]).length;
  if (musts > 0) tests.push({ text:`${musts} mandatory requirement(s) confirmed understood`, pass:null });
  const jaaTables = (content.match(/`[a-z_]+`/g)||[]).filter(t=>t.match(/sessions|messages|records|nodes|edges|patterns|crystals|gaps|failures/)).length;
  if (jaaTables > 0) tests.push({ text:`${jaaTables} JAA table(s) identified and noted for ALL_TABLES`, pass:null });
  if (/schema\.json/.test(content)) tests.push({ text:'Schema files listed and noted as BUILD/RECONCILE items', pass:null });
  const testSeqMatch = content.match(/Test sequence[:\s\S]{0,600}/i);
  if (testSeqMatch) { const steps = testSeqMatch[0].split('\n').filter(l=>/^[-*•]|^\d+\./.test(l.trim())).slice(0,4); for (const s of steps) tests.push({ text:s.replace(/^[-*•\d.]\s*/,'').trim().slice(0,120), pass:null }); }
  if (tests.length === 0) tests.push({ text:'Chunk contents acknowledged and understood', pass:null });
  tests.push({ text:'No questions or blockers before proceeding', pass:null });
  return tests;
}

function seamParseSpec(text, splitOn, maxSize, customPat) {
  let sections = [];
  if (splitOn === 'heading') { const parts = text.split(/\n(?=#{1,3}\s)/); for (const p of parts) if (p.trim()) sections.push(p.trim()); }
  else if (splitOn === 'divider') { const parts = text.split(/\n---+\n/); for (const p of parts) if (p.trim()) sections.push(p.trim()); }
  else if (splitOn === 'phase') { const parts = text.split(/\n(?=(?:Phase|PHASE|Step|STEP)\s+\d)/); for (const p of parts) if (p.trim()) sections.push(p.trim()); }
  else if (splitOn === 'custom' && customPat) { try { const re = new RegExp(customPat,'gm'); const parts = text.split(re); for (const p of parts) if (p.trim()) sections.push(p.trim()); } catch(_) { sections = [text]; } }
  else { for (let i = 0; i < text.length; i += maxSize) { const slice = text.slice(i, i+maxSize); const lb = slice.lastIndexOf('\n'); sections.push(lb > maxSize*0.7 ? slice.slice(0,lb) : slice); } }
  const final = [];
  for (const s of sections) {
    if (s.length > maxSize) { const paras = s.split('\n\n'); let buf = ''; for (const p of paras) { if ((buf+p).length > maxSize && buf) { final.push(buf.trim()); buf = p+'\n\n'; } else buf += p+'\n\n'; } if (buf.trim()) final.push(buf.trim()); }
    else final.push(s);
  }
  return final.map((content, i) => {
    const tm = content.match(/^#{1,3}\s+(.+)|^(PHASE|Phase|Step)\s+\d+[:\s]+(.+)?/);
    const title = tm ? (tm[1]||tm[3]||`Section ${i+1}`).trim().slice(0,60) : `Chunk ${i+1}`;
    return { id:seamUid(), index:i, title, content, status:'pending', tests:seamAutoGenerateTests(content), verificationNote:'', deliveredAt:null, verifiedAt:null };
  });
}

function seamBuildPrompt(chunk, idx, sysPromptKey) {
  const total = seamState.chunks.length;
  const prevVerified = seamState.chunks.slice(0,idx).filter(x=>x.status==='verified').length;
  const hdr = `━━ SEAM CHUNK ${idx+1}/${total} — ${chunk.title} ━━\n[Prior chunks verified: ${prevVerified}/${idx}]\n\n`;
  const contract = `\n\n━━ SEAM CONTRACT (respond after reading) ━━\nWhen you have processed this chunk, respond with:\n\n${chunk.tests.map((t,i)=>`[PASS/FAIL] Test ${i+1}: ${t.text}`).join('\n')}\n\nSEAM VERDICT: PASS | FAIL`;
  const sys = SEAM_SYSTEM_PROMPTS[sysPromptKey] || seamState.customSystemPrompt || '';
  return (sys ? `[SYSTEM CONTEXT]\n${sys}\n\n` : '') + hdr + chunk.content + contract;
}

function seamVerdict(text) {
  if (/SEAM VERDICT:\s*PASS/i.test(text)) return 'pass';
  if (/SEAM VERDICT:\s*FAIL/i.test(text)) return 'fail';
  return null;
}

function seamVerifyChunk(idx, result) {
  const c = seamState.chunks[idx]; if (!c) return;
  if (result === 'pass') {
    c.tests.forEach(t => { if (t.pass === null) t.pass = true; });
    c.status = 'verified'; c.verifiedAt = Date.now();
    addLog('ok', `SEAM chunk ${idx+1} verified`, c.title);
    toast(`✓ SEAM chunk ${idx+1} verified: ${c.title.slice(0,30)}`, 'success');
    ledgerRecord('UPGRADE', `SEAM verified: ${c.title}`, { chunkIdx:idx });
    evLog('seam.chunk.verified', { idx, title:c.title });
    seamSaveState(); seamChannel.postMessage({ type:'chunk_verified', idx, ts:Date.now() });
    if (seamAutoInject && idx+1 < seamState.chunks.length) setTimeout(() => seamInjectChunk(idx+1), 2000);
  } else if (result === 'fail') {
    c.status = 'failed'; c.verifiedAt = Date.now();
    addLog('err', `SEAM chunk ${idx+1} FAILED`, c.title);
    toast(`✗ SEAM chunk ${idx+1} FAILED: ${c.title.slice(0,30)}`, 'error', 5000);
    evLog('seam.chunk.failed', { idx, title:c.title });
    seamSaveState();
  } else {
    c.status = 'skipped'; c.verifiedAt = Date.now();
    toast(`— SEAM chunk ${idx+1} skipped`, 'warn', 2000);
    evLog('seam.chunk.skipped', { idx });
    seamSaveState();
    if (seamAutoInject && idx+1 < seamState.chunks.length) setTimeout(() => seamInjectChunk(idx+1), 500);
  }
  if (activeTab === 'seam') renderSeamTab();
}

async function seamInjectChunk(idx) {
  if (!isClaimed) { toast('Not claimed — cannot inject SEAM chunk', 'warn'); return; }
  const c = seamState.chunks[idx];
  if (!c || c.status === 'verified') { toast('Chunk already verified or invalid', 'warn'); return; }

  const result = await gate('seamInjectChunk', async () => {
    seamState.activeChunk = idx;
    const sysKey = document.getElementById('__g8gpt_seam_sysprompt__')?.value || 'nexus';
    const promptText = seamBuildPrompt(c, idx, sysKey);
    c.deliveredAt = Date.now(); seamSaveState();
    if (!injectText(promptText)) throw new Error('Input not found — no contenteditable');
    seenArtifactHashes.clear();
    const jobId = seamUid();
    sendToServer({ type:'GUARDIAN_DELIVERED', jobId, chatUrl:location.href, account:getAccount(), requestId:jobId });
    startWatch(jobId, `SEAM ${idx+1}/${seamState.chunks.length}: ${c.title}`);
    setTimeout(submit, 500);
    addLog('job', `SEAM → chunk ${idx+1}`, c.title);
    toast(`↗ Injecting SEAM chunk ${idx+1}: ${c.title.slice(0,30)}`, 'job');
    evLog('seam.chunk.injected', { idx, title:c.title, jobId });
    return jobId;
  }, { jobId: currentJobId });

  if (!result.ok) {
    addLog('err', 'SEAM inject failed', result.error);
  }
  if (activeTab === 'seam') renderSeamTab();
}

function seamCheckResponse(text, jobId) {
  const v = seamVerdict(text); if (!v) return;
  const idx = seamState.activeChunk;
  const c = seamState.chunks[idx];
  if (!c || c.status !== 'pending') return;
  addLog('ok', `SEAM auto-verdict: ${v.toUpperCase()} · chunk ${idx+1}`);
  evLog('seam.auto.verdict', { verdict:v, idx, jobId });
  seamVerifyChunk(idx, v);
}

// ── GapHunter v3 — Full taxonomy ─────────────────────────────────────────────
const GAP_TYPE = Object.freeze({
  LOGICAL:'logical', EVIDENTIAL:'evidential', TEMPORAL:'temporal', DEFINITIONAL:'definitional',
  REFERENCE:'reference', OBLIGATION:'obligation', ASSUMPTION:'assumption', CONTRADICTION:'contradiction',
  IDENTITY_ATTACK:'identity_attack', CONSENT:'consent', BOUNDARY:'boundary', HIERARCHY:'hierarchy',
  COERCION:'coercion', ISOLATION:'isolation', OSCILLATORY:'oscillatory', CONDITION:'condition',
});
const GAP_REASON = Object.freeze({
  COMPRESSION:'compression', AVOIDANCE:'avoidance', COMPATIBILITY:'compatibility',
  ATTENTION:'attention', EMOTIONAL_OCCLUSION:'emotional_occlusion', NARRATIVE_SOOTHING:'narrative_soothing',
  IDENTITY_REFLECTION:'identity_reflection', DEFERRED_VARIABLE:'deferred_variable', STRUCTURAL_LIMIT:'structural_limit',
});
const DOMAIN = Object.freeze({
  CODE:'code', AI_ML:'ai_ml', SOFTWARE_ARCH:'software_arch', EPISTEMOLOGICAL:'epistemological',
  LOGIC:'logic', COMMUNICATION:'communication', INTERPERSONAL:'interpersonal', PSYCHOLOGICAL:'psychological',
  RESEARCH:'research', LANG_JS:'lang_javascript', LANG_TS:'lang_typescript', LANG_PYTHON:'lang_python',
  SECURITY:'security', DATABASE:'database', API_DESIGN:'api_design', SYSTEM_DESIGN:'system_design',
});

function gaphunterAnalyze(text) {
  const gaps = []; if (!text || text.length < 50) return gaps;
  const lines = text.split('\n'), words = text.toLowerCase().match(/\b\w+\b/g)||[], wc = words.length;
  const bd = lines.filter(l=>/^\s*[-*•]|\d+\./.test(l)).length / Math.max(1,lines.length);
  const ld = wc > 5 ? (new Set(words).size / wc) : 1;
  const freq = {}; for (const ch of text) freq[ch] = (freq[ch]||0)+1;
  let H = 0; for (const f of Object.values(freq)) { const p = f/text.length; H -= p*Math.log2(p); } H = parseFloat(H.toFixed(3));
  const hedges = (text.match(/\b(might|may|could|perhaps|possibly|seems|appears|likely|probably|generally|often|sometimes|usually|arguably|potentially)\b/gi)||[]).length;
  const hedgeRate = wc > 0 ? hedges/wc : 0;
  const lastLine = lines[lines.length-1]?.trim()||'';
  const min = CFG.gap_min_score ?? 0.25;
  if (bd > 0.5) { const s = Math.min(0.95,bd); if (s>=min) gaps.push({type:GAP_TYPE.ASSUMPTION,domain:DOMAIN.COMMUNICATION,reason:GAP_REASON.COMPRESSION,description:`High bullet density ${(bd*100).toFixed(0)}% — reasoning compressed`,score:s,evidence:{metric:bd}}); }
  if (ld < 0.35) { const s = Math.min(0.9,1-ld); if (s>=min) gaps.push({type:GAP_TYPE.OBLIGATION,domain:DOMAIN.COMMUNICATION,reason:GAP_REASON.STRUCTURAL_LIMIT,description:`Low lexical diversity ${ld} — formulaic phrasing`,score:s,evidence:{metric:ld}}); }
  if (H < 3.2 && wc > 80) { const s = parseFloat(((4-H)/4).toFixed(3)); if (s>=min) gaps.push({type:GAP_TYPE.TEMPORAL,domain:DOMAIN.AI_ML,reason:GAP_REASON.COMPRESSION,description:`Low entropy H=${H} — pre-planned content`,score:s,evidence:{metric:H}}); }
  if (hedgeRate > 0.04) { const s = Math.min(0.85,hedgeRate*10); if (s>=min) gaps.push({type:GAP_TYPE.ASSUMPTION,domain:DOMAIN.EPISTEMOLOGICAL,reason:GAP_REASON.AVOIDANCE,description:`High hedge density ${(hedgeRate*100).toFixed(1)}%`,score:s,evidence:{metric:hedgeRate}}); }
  if (wc > 200 && (lastLine.endsWith('...') || lastLine.length < 12)) gaps.push({type:GAP_TYPE.OBLIGATION,domain:DOMAIN.COMMUNICATION,reason:GAP_REASON.STRUCTURAL_LIMIT,description:'Possible truncation — context window pressure',score:0.75,evidence:{pattern:'truncation'}});
  const asserts = (text.match(/\b(always|never|all|every|definitely|certainly|obviously|clearly)\b/gi)||[]).length;
  const assertRate = wc > 0 ? asserts/wc : 0;
  if (assertRate > 0.02 && hedgeRate < 0.01 && wc > 100) { const s = Math.min(0.8,assertRate*20); if (s>=min) gaps.push({type:GAP_TYPE.EVIDENTIAL,domain:DOMAIN.EPISTEMOLOGICAL,reason:GAP_REASON.IDENTITY_REFLECTION,description:'High assertion density without evidence',score:s,evidence:{metric:assertRate}}); }
  if (text.includes('```') || text.includes('function ') || text.includes('const ')) {
    const todos = (text.match(/\bTODO\b|\bFIXME\b|\bHACK\b|\bXXX\b/g)||[]).length;
    if (todos > 0) gaps.push({type:GAP_TYPE.OBLIGATION,domain:DOMAIN.CODE,reason:GAP_REASON.DEFERRED_VARIABLE,description:`${todos} TODO/FIXME — §1.3 stub violation`,score:Math.min(0.9,0.3+todos*0.15),evidence:{metric:todos}});
    const stubs = (text.match(/\/\/ stub|pass\s*$|throw new Error\(['"]not implemented/gim)||[]).length;
    if (stubs > 0) gaps.push({type:GAP_TYPE.OBLIGATION,domain:DOMAIN.CODE,reason:GAP_REASON.DEFERRED_VARIABLE,description:`${stubs} stub/unimplemented — §1.3 violation`,score:0.85,evidence:{metric:stubs}});
  }
  return gaps;
}

// ── Prompt Archaeology ────────────────────────────────────────────────────────
function newPASession() { return { id:Date.now(), startTime:null, chunks:[], totalTokens:0, burstZones:[], pauseZones:[], entropyHistory:[], structureEvents:[], hypotheses:[] }; }
function entropy(str) { if (!str||!str.length) return 0; const f={}; for (const ch of str) f[ch]=(f[ch]||0)+1; const n=str.length; let H=0; for (const v of Object.values(f)){const p=v/n;H-=p*Math.log2(p);} return parseFloat(H.toFixed(3)); }
function bulletDensity(text) { const l=text.split('\n'); return l.filter(x=>/^\s*[-*•]|\d+\./.test(x)).length/Math.max(1,l.length); }
function lexicalDiversity(text) { const w=text.toLowerCase().match(/\b\w+\b/g)||[]; return w.length<5?1:parseFloat((new Set(w).size/w.length).toFixed(3)); }

function detectBurstsAndPauses(session) {
  const bursts=[], pauses=[], chunks=session.chunks;
  if (chunks.length < 3) return { bursts, pauses };
  const rates = chunks.slice(1).map((c,i) => { const dt=c.t-chunks[i].t; return{t:c.t,dt,tps:dt>0?(c.tokens/dt)*1000:0}; });
  const tpsVals=rates.map(r=>r.tps), mean=tpsVals.reduce((a,b)=>a+b,0)/tpsVals.length;
  const std=Math.sqrt(tpsVals.map(v=>(v-mean)**2).reduce((a,b)=>a+b,0)/tpsVals.length);
  let burstStart=null;
  for (let i=0; i<rates.length; i++) { const r=rates[i]; if(r.tps>mean+std){if(!burstStart)burstStart=r.t;}else{if(burstStart){bursts.push({start:burstStart,end:r.t,rate:r.tps});burstStart=null;}}if(r.dt>500)pauses.push({t:r.t,duration:r.dt}); }
  return { bursts, pauses };
}

function generateHypotheses(session) {
  const hyps=[], text=session.chunks.map(c=>c.text).join('');
  const { bursts, pauses } = detectBurstsAndPauses(session);
  const ld=lexicalDiversity(text), bd=bulletDensity(text);
  const totalDur=session.chunks.length>1?session.chunks.at(-1).t-session.chunks[0].t:0;
  const avgTps=totalDur>0?(session.totalTokens/totalDur)*1000:0;
  session.burstZones=bursts; session.pauseZones=pauses;
  if (pauses.length>=3) hyps.push({label:'Inference hesitation zones',confidence:Math.min(0.85,0.4+pauses.length*0.08),evidence:[`${pauses.length} pauses >500ms`,`longest: ${Math.max(...pauses.map(p=>p.duration)).toFixed(0)}ms`]});
  if (bursts.length>=3&&avgTps>20) hyps.push({label:'Pre-planned content burst',confidence:0.65,evidence:[`${bursts.length} burst clusters`,`~${avgTps.toFixed(1)} tok/s`]});
  if (ld<0.35) hyps.push({label:'Context window pressure / compressive phrasing',confidence:Math.min(0.8,0.4+(1-ld)*2),evidence:[`Lexical diversity: ${ld}`]});
  if (bd>0.5) hyps.push({label:'Mode shift: direct → structured synthesis',confidence:Math.min(0.9,0.5+bd),evidence:[`Bullet density: ${(bd*100).toFixed(0)}%`]});
  if (!hyps.length) hyps.push({label:'No strong behavioral signals',confidence:0.5,evidence:['Low-signal or short response']});
  return hyps;
}

// ── Session greeting ──────────────────────────────────────────────────────────
function isChatBlank() { return document.querySelectorAll('[data-message-author-role="assistant"],[data-message-author-role="user"]').length === 0; }

async function sendGreeting(chatId) {
  if (!CFG.session_greeting_enabled || greetedChats.has(chatId)) return;
  greetedChats.add(chatId); saveGreeted();
  let attempts = 0;
  function tryInject() {
    attempts++; if (attempts > 20) return; if (!isChatBlank()) return;
    setTimeout(async () => {
      const result = await gate('greeting.inject', () => {
        if (!injectText(CFG.session_greeting_text)) throw new Error('No input found');
        return true;
      }, { toastOnFail: true });
      if (!result.ok) { setTimeout(tryInject, 500); return; }
      addLog('sys', 'Session greeting injected', chatId.slice(0,8));
      ledgerRecord('SYSTEM', `Session greeting → #${chatId.slice(0,8)}`);
      evLog('greeting.injected', { chatId });
      setTimeout(() => { submit(); watchForSessionName(chatId); }, 600);
    }, 300);
  }
  setTimeout(tryInject, CFG.greeting_delay_ms||1200);
}

function watchForSessionName(chatId) {
  let attempts = 0;
  function poll() {
    attempts++; if (attempts > 60) return;
    const msgs = document.querySelectorAll('[data-message-author-role="assistant"]');
    if (!msgs.length) { setTimeout(poll,500); return; }
    const text = (msgs[msgs.length-1].innerText||msgs[msgs.length-1].textContent||'').trim();
    if (text.length < 10) { setTimeout(poll,500); return; }
    const m = text.match(/[""]([^""]{3,60})[""]/)
      || text.match(/calling (?:this |it )?["']?([A-Z][^.!?\n]{2,50})["']?/i)
      || text.match(/session[:\s]+["']?([A-Z][^.!?\n]{2,40})["']?/i);
    if (m) {
      const sessionName = m[1].trim();
      addLog('ok', `Session: ${sessionName}`, chatId.slice(0,8));
      toast(`Session: "${sessionName}"`, 'success', 4000);
      ledgerRecord('SYSTEM', `Session: "${sessionName}"`, { chatId, sessionName });
      evLog('session.named', { sessionName, chatId });
      sendToServer({ type:'GUARDIAN_SESSION_NAMED', chatId, sessionName, account:getAccount(), provider:PROVIDER, chatUrl:location.href });
      apiPost('/sessions/'+chatId+'/name', { name:sessionName, account:getAccount(), provider:PROVIDER, chatUrl:location.href }).catch(() => {});
      try { sessionStorage.setItem('guardian_session_'+chatId, sessionName); } catch(_) {}
    }
  }
  setTimeout(poll, 2000);
}

function onNavigate() {
  const np = location.pathname, nc = chatIdFromUrl();
  if (np === lastPathname) return; lastPathname = np;
  evLog('navigate', { from:lastChatId, to:nc, path:np });
  if (nc && nc !== 'home' && nc !== lastChatId) {
    lastChatId = nc;
    addLog('sys', 'New chat', nc.slice(0,8));
    toast(`New chat: ${nc.slice(0,8)}`, 'info', 2000);
    setTimeout(() => { if (isChatBlank()) sendGreeting(nc); }, 800);
  }
  if (!nc || nc === 'home') {
    lastChatId = 'pending';
    let w = 0;
    function wid() { w++; if (w>30) return; const id=chatIdFromUrl(); if(id&&id!=='home'&&id!=='pending'){lastChatId=id;setTimeout(()=>{if(isChatBlank())sendGreeting(id);},600);return;} setTimeout(wid,300); }
    setTimeout(wid, 500);
  }
}
function startNavigationWatcher() {
  setInterval(onNavigate, 500);
  const op=history.pushState.bind(history), or=history.replaceState.bind(history);
  history.pushState=(...a)=>{op(...a);setTimeout(onNavigate,100);};
  history.replaceState=(...a)=>{or(...a);setTimeout(onNavigate,100);};
  window.addEventListener('popstate', () => setTimeout(onNavigate,100));
}

// ── Memory ────────────────────────────────────────────────────────────────────
function sendToMemory(obj) {
  const body = JSON.stringify({...obj, source:'guardian-chatgpt-v82', chatUrl:location.href, account:getAccount(), chatId:chatIdFromUrl(), ts:Date.now()});
  if (typeof GM_xmlhttpRequest !== 'undefined') { GM_xmlhttpRequest({method:'POST', url:`${MEMORY_URL}/ingest`, headers:{'Content-Type':'application/json'}, data:body, onerror:()=>{}}); }
  else { fetch(`${MEMORY_URL}/ingest`, {method:'POST', headers:{'Content-Type':'application/json'}, body}).catch(()=>{}); }
}

// ── Ledger ────────────────────────────────────────────────────────────────────
const LEDGER_COLORS = { UPGRADE:'#34d399', IDEA:'#a78bfa', EVENT:'#94a3b8', GAP:'#f472b6', SYSTEM:'#818cf8', INPUT:'#60a5fa', OUTPUT:'#a78bfa' };
function ledgerRecord(category, msg, meta = {}) {
  const entry = { ts:Date.now(), category, msg, meta, icon:{UPGRADE:'⬆',IDEA:'💡',EVENT:'◈',GAP:'△',SYSTEM:'◉',INPUT:'↓',OUTPUT:'↑'}[category]||'·', color:LEDGER_COLORS[category]||'#94a3b8' };
  ledgerEntries.unshift(entry); if (ledgerEntries.length > LEDGER_MAX) ledgerEntries.pop();
  sendToServer({ type:'GUARDIAN_LEDGER_EVENT', level:category, category, msg, meta, chatUrl:location.href, account:getAccount(), requestId:currentJobId });
  sendToMemory({ type:'LEDGER', payload:entry });
  sisoEmit('guardian.ledger', { category, msg, meta });
  return entry;
}

// ── Artifact store ────────────────────────────────────────────────────────────
function artifactSave(entry) {
  if (artifactStore.find(a => a.hash === entry.hash)) return null;
  const full = { id:uid(), hash:entry.hash, name:entry.name||'artifact', type:entry.type||'code_block', lang:entry.lang||null, content:entry.content||'', context:entry.context||null, chatUrl:entry.chatUrl||location.href, chatId:entry.chatId||chatIdFromUrl(), account:entry.account||getAccount(), jobId:entry.jobId||currentJobId, ts:entry.ts||Date.now(), direction:entry.direction||'output' };
  artifactStore.unshift(full); if (artifactStore.length > ARTIFACT_MAX) artifactStore.pop();
  if (CFG.memory_auto_push) sendToMemory({ type:'ARTIFACT', payload:full });
  sisoEmit('guardian.artifact', full);
  evLog('artifact.saved', { hash:full.hash, name:full.name, lang:full.lang, chars:full.content.length });
  toast(`Artifact: ${full.name.slice(0,30)} [${full.lang||full.type}]`, 'info', 2500);
  return full;
}

// ── Download intercept ────────────────────────────────────────────────────────
function interceptDownloads() {
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[download],a[href*="blob:"],a[href*="data:"]'); if (!a) return;
    const filename = a.getAttribute('download') || a.href.split('/').pop() || 'download';
    const entry = { id:uid(), ts:Date.now(), filename, href:a.href, chatUrl:location.href, chatId:chatIdFromUrl(), account:getAccount(), jobId:currentJobId, type:'download' };
    detectedDownloads.unshift(entry); if (detectedDownloads.length > 100) detectedDownloads.pop();
    addLog('in', `Download: ${filename}`);
    toast(`Download: ${filename}`, 'info', 2500);
    evLog('download.detected', { filename });
    sendToMemory({ type:'DOWNLOAD', payload:entry });
    sendToServer({ type:'GUARDIAN_DOWNLOAD', ...entry, provider:PROVIDER });
    if (activeTab === 'artifacts') renderArtifactsTab();
  }, true);
}

// ── DOM Scanner ───────────────────────────────────────────────────────────────
const SYSTEM_SELECTORS = [
  { selector:'[data-testid="assistant-message"]', type:'assistant_turn' },
  { selector:'[data-testid="human-message"]',     type:'human_turn' },
  { selector:'.font-claude-message',              type:'assistant_turn' },
  { selector:'[class*="tool-use"]',               type:'tool_use' },
  { selector:'[class*="thinking"]',               type:'thinking_block' },
  { selector:'[class*="artifact"]',               type:'artifact' },
  { selector:'pre code',                          type:'code_block' },
];

function scanDOM() {
  const systems = {};
  for (const { selector, type } of SELS) {
    const els = document.querySelectorAll(selector); if (!els.length) continue;
    if (!systems[type]) systems[type] = { type, count:0, lastSeen:Date.now(), samples:[] };
    systems[type].count += els.length;
    if (type === 'artifact' || type === 'code_block') {
      for (const el of els) {
        const content = (el.innerText||el.textContent||'').trim(); if (!content || content.length < 10) continue;
        const hash = simpleHash(content); if (seenArtifactHashes.has(hash)) continue;
        seenArtifactHashes.add(hash);
        const lang = detectLang(el), name = detectArtifactName(el);
        const msgEl = el.closest('[data-testid="assistant-message"]') || el.closest('.font-claude-message');
        const context = msgEl ? (msgEl.innerText||'').slice(0,300) : null;
        const saved = artifactSave({ hash, name, type, lang, content:content.slice(0,8000), context, direction:'output' });
        if (saved) {
          addLog('out', `${type} · ${lang||'text'} · ${content.length}ch`, name);
          ledgerRecord('OUTPUT', `${type} · ${lang||'text'} · ${content.length}ch`, { type, lang, hash, jobId:currentJobId });
          sendToServer({ type:'GUARDIAN_ARTIFACT', jobId:currentJobId, content:content.slice(0,4000), lang, hash, name, chatUrl:location.href, account:getAccount(), provider:PROVIDER });
          if (activeTab === 'artifacts') renderArtifactsTab();
        }
      }
    }
  }
  domSystems = systems;
  evLog('dom.scan', { systems: Object.keys(systems), counts: Object.fromEntries(Object.entries(systems).map(([k,v])=>[k,v.count])) });
  sendToServer({ type:'GUARDIAN_DOM_SYSTEMS', systems:Object.values(systems), chatId:chatIdFromUrl(), chatUrl:location.href, account:getAccount() });
}

function scheduleScan() { clearTimeout(scanDebounceTimer); scanDebounceTimer = setTimeout(scanDOM, CFG.scan_debounce_ms); }
function startDOMObserver() {
  if (domObserver) return;
  domObserver = new MutationObserver(muts => {
    evLog('dom.mutation', { count:muts.length });
    scheduleScan(); detectFileChips();
  });
  domObserver.observe(document.body, { childList:true, subtree:true });
  setTimeout(scanDOM, 800);
  document.addEventListener('change', e => { if (e.target?.type==='file' && e.target.files?.length>0) onFilesDetected(Array.from(e.target.files).map(f=>({name:f.name,size:f.size,type:f.type}))); }, true);
}

const seenFileChips = new Set();
function detectFileChips() {
  for (const sel of ['[data-testid="file-attachment"]', '[class*="upload"]', '[class*="attachment"]']) {
    for (const chip of document.querySelectorAll(sel)) {
      const name = (chip.getAttribute('aria-label')||chip.querySelector('[class*="name"]')?.textContent||chip.textContent||'').trim().slice(0,100);
      if (!name || seenFileChips.has(name)) continue; seenFileChips.add(name);
      onFilesDetected([{ name, size:null, type:'unknown' }]);
    }
  }
}

function onFilesDetected(files) {
  if (!files?.length) return;
  addLog('in', `File upload: ${files.map(f=>f.name).join(', ')}`);
  toast(`Upload: ${files.map(f=>f.name).join(', ')}`, 'info');
  ledgerRecord('INPUT', `Upload: ${files.map(f=>f.name).join(', ')}`, { files });
  evLog('files.detected', { files:files.map(f=>f.name) });
  sendToServer({ type:'GUARDIAN_FILE_UPLOAD', jobId:currentJobId, files, chatUrl:location.href, account:getAccount() });
}

// ── Agent polling ─────────────────────────────────────────────────────────────
function startAgentEndpointPolling() {
  if (agentPollInterval) return;
  agentEndpointActive = true;
  addLog('sys', 'Agent polling active', API_URL+'/jobs?status=pending');
  toast('Agent polling started', 'info', 2000);
  evLog('agent.polling.start', { url: API_URL });
  agentPollInterval = setInterval(async () => {
    await gate('agentPoll', async () => {
      const r = await fetch(`${API_URL}/jobs?status=pending&limit=5`); if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      for (const job of (data.jobs||[])) {
        evLog('agent.job.received', { jobId:job.id, provider:job.provider, command:job.command });
        if (job.provider === PROVIDER && job.status === 'pending' && isClaimed) {
          handleJob({ jobId:job.id, command:job.command, prompt:job.prompt, content:job.content });
        } else if (job.provider === PROVIDER && !isClaimed) {
          addLog('info', 'Job ignored — not claimed', job.id?.slice(0,8));
        }
      }
    }, { toastOnFail: false, logLevel: 'info' });
  }, 2000);
  updateApiStatusEl();
}

function stopAgentEndpointPolling() {
  if (agentPollInterval) { clearInterval(agentPollInterval); agentPollInterval = null; }
  agentEndpointActive = false;
  evLog('agent.polling.stop', {});
  toast('Agent polling stopped', 'warn', 2000);
  updateApiStatusEl();
}
function updateApiStatusEl() { const el = document.getElementById('__g8gpt_api_status__'); if (!el) return; el.textContent = agentEndpointActive ? '● ACTIVE' : '○ INACTIVE'; el.style.color = agentEndpointActive ? '#34d399' : '#475569'; }

// ── Text injection + submit ───────────────────────────────────────────────────
function injectText(text) {
  const ce = document.querySelector('[contenteditable="true"]');
  if (ce) {
    ce.focus(); document.execCommand('selectAll',false,null); document.execCommand('delete',false,null);
    const ok = document.execCommand('insertText',false,text);
    if (!ok) { ce.textContent=text; ce.dispatchEvent(new InputEvent('input',{bubbles:true,cancelable:true,inputType:'insertText',data:text})); }
    evLog('inject.text',{chars:text.length}); return true;
  }
  const ta = document.querySelector('textarea#prompt-textarea') || document.querySelector('textarea');
  if (ta) {
    const nv = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value');
    nv.set.call(ta, text); ta.dispatchEvent(new Event('input',{bubbles:true}));
    evLog('inject.text.textarea',{chars:text.length}); return true;
  }
  return false;
}

function submit() {
  const btn = document.querySelector('button[data-testid="send-button"]:not([disabled])') || document.querySelector('button[aria-label="Send prompt"]:not([disabled])');
  if (btn) { btn.click(); evLog('submit.button',{}); return; }
  const input = document.querySelector('[contenteditable="true"]') || document.querySelector('textarea');
  if (input) { input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true,cancelable:true})); evLog('submit.enter',{}); }
}

// ── Response watcher ──────────────────────────────────────────────────────────
function stopWatch() { currentJobId = null; setJobState(false); }

function startWatch(jobId, prompt) {
  stopWatch(); currentJobId = jobId; setJobState(true, prompt, jobId);
  if (CFG.pa_enabled) pa.session = newPASession();
  let lastText = '', stableCount = 0, generatingEmitted = false;
  const STABLE = CFG.stable_count_threshold || 5;
  evLog('job.watch.start', { jobId, prompt:(prompt||'').slice(0,80) });
  sendToMemory({ type:'JOB_START', payload:{ jobId, prompt:(prompt||'').slice(0,500), chatUrl:location.href, account:getAccount() } });

  function findResponseEl() {
    const all=document.querySelectorAll('[data-message-author-role="assistant"]');
    if(all.length)return all[all.length-1];
    return document.querySelector('[class*="result-streaming"]');
  }

  function poll() {
    if (!currentJobId) return;
    const el = findResponseEl(); if (!el) { setTimeout(poll,400); return; }
    const text = el.innerText || el.textContent || '';
    if (text === lastText) {
      stableCount++;
      if (stableCount >= STABLE) {
        addLog('ok', 'Job complete', `${lastText.length}ch · #${jobId.slice(0,8)}`);
        toast(`Job complete: ${lastText.length} chars`, 'success', 3000);
        sendToServer({ type:'GUARDIAN_COMPLETE', jobId, text:lastText, chatUrl:location.href, account:getAccount(), requestId:jobId });
        ledgerRecord('UPGRADE', `Job complete · #${jobId.slice(0,8)}`, { jobId, chars:lastText.length });
        evLog('job.complete', { jobId, chars:lastText.length });
        sessionTokenTotal += pa.session?.totalTokens || 0;

        const gaps = gaphunterAnalyze(lastText);
        currentGaps = [...gaps, ...currentGaps].slice(0,200);
        if (gaps.length > 0) {
          addLog('gap', `${gaps.length} gap(s)`, gaps.map(g=>g.type).join(','));
          toast(`${gaps.length} gaps detected`, 'warn', 3000);
          evLog('gaps.detected', { count:gaps.length, types:gaps.map(g=>g.type) });
          sendToServer({ type:'GUARDIAN_GAPS', jobId, gaps, chatUrl:location.href, account:getAccount() });
          for (const g of gaps) ledgerRecord('GAP', `${g.domain||g.type} · ${((g.score||0)*100).toFixed(0)}%`, g);
          if (activeTab === 'gaps') renderGapsTab();
        }

        if (CFG.pa_enabled && pa.session) {
          pa.session.hypotheses = generateHypotheses(pa.session);
          pa.sessions.push(pa.session); if (pa.sessions.length > 10) pa.sessions.shift();
          evLog('pa.session.complete', { jobId, tokens:pa.session.totalTokens, hypotheses:pa.session.hypotheses.length });
          sendToServer({ type:'GUARDIAN_PA_SESSION', jobId, tokens:pa.session.totalTokens, pauses:pa.session.pauseZones?.length||0, entropy:pa.session.entropyHistory.slice(-3), hypotheses:pa.session.hypotheses.map(h=>({label:h.label,confidence:h.confidence})), chatUrl:location.href, account:getAccount(), provider:PROVIDER });
          if (activeTab === 'pa') renderPATab();
        }

        sendToServer({ type:'GUARDIAN_DONE', jobId, chatUrl:location.href, account:getAccount(), requestId:jobId });
        sendToMemory({ type:'JOB_COMPLETE', payload:{ jobId, chars:lastText.length, gaps:gaps.length } });
        sisoEmit('guardian.job.complete', { jobId, chars:lastText.length, gaps:gaps.length });

        // SEAM auto-verdict check
        seamCheckResponse(lastText, jobId);

        // Queue detection gate — runs after SEAM check so verdict is already in state
        jobQueue.onResponse(jobId, lastText);

        updateFooter(); stopWatch(); return;
      }
    } else {
      const delta = text.slice(lastText.length);
      if (delta) {
        if (!generatingEmitted) {
          generatingEmitted = true;
          sendToServer({ type:'GUARDIAN_GENERATING', jobId, chatUrl:location.href, account:getAccount(), requestId:jobId });
          addLog('job', 'Generating…', `#${jobId.slice(0,8)}`);
          evLog('job.generating', { jobId });
        }
        sendToServer({ type:'GUARDIAN_CHUNK', jobId, text:delta, chatUrl:location.href, account:getAccount() });
        if (CFG.pa_enabled && pa.session) {
          const now = Date.now(), tokens = estimateTokens(delta);
          if (!pa.session.startTime) pa.session.startTime = now;
          pa.session.chunks.push({ t:now-pa.session.startTime, text:delta, tokens });
          pa.session.totalTokens += tokens;
          pa.session.entropyHistory.push(entropy(delta));
          if (pa.session.entropyHistory.length > 200) pa.session.entropyHistory.shift();
          if (activeTab === 'pa') renderPATab();
        }
      }
      lastText = text; stableCount = 0;
    }
    setTimeout(poll, CFG.poll_interval_ms||500);
  }
  setTimeout(poll, 1500);
}

// ── Job handler ───────────────────────────────────────────────────────────────
async function handleJob(msg) {
  if (!isClaimed) {
    addLog('info', 'Job ignored — not claimed', msg.jobId?.slice(0,8));
    toast('Job ignored — tab not claimed', 'warn', 3000);
    evLog('job.ignored.not.claimed', { jobId:msg.jobId });
    return;
  }
  const { jobId, prompt, content, command } = msg;
  const text = content ? (prompt ? `${prompt}\n\n${content}` : content) : (prompt||'');
  addLog('job', `Job: ${command}`, text.slice(0,80));
  ledgerRecord('INPUT', `Job · ${command} · #${jobId.slice(0,8)}`, { jobId, command });
  evLog('job.start', { jobId, command, chars:text.length });
  toast(`Job: ${command} · #${jobId.slice(0,8)}`, 'job', 3000);

  const result = await gate('handleJob', async () => {
    if (!text.trim()) throw new Error('Empty prompt');
    if (!injectText(text)) throw new Error('Input not found — no contenteditable');
    seenArtifactHashes.clear();
    sendToServer({ type:'GUARDIAN_DELIVERED', jobId, chatUrl:location.href, account:getAccount(), requestId:jobId });
    startWatch(jobId, text);
    setTimeout(submit, 500);
    return true;
  }, { jobId, toastOnFail: true });

  if (!result.ok) {
    evLog('job.failed', { jobId, error:result.error });
  }
}

// ── Utils ─────────────────────────────────────────────────────────────────────
function simpleHash(str) { let h=0; for(let i=0;i<str.length;i++){h=((h<<5)-h)+str.charCodeAt(i);h|=0;} return Math.abs(h).toString(16).slice(0,8); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
function escHtml(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fts(ts) { return new Date(ts).toTimeString().slice(0,8); }
function chatIdFromUrl() { const m=location.pathname.match(/\/chat\/([a-zA-Z0-9_-]+)/); return m?m[1]:'home'; }
function getAccount() {
  if (accountState) return accountState;
  const sels = ['[data-testid="user-email"]','[data-testid="account-email"]','.account-email','[aria-label*="@"]','nav [title*="@"]'];
  for (const sel of sels) { const el=document.querySelector(sel); if (el) { const t=(el.getAttribute('aria-label')||el.getAttribute('title')||el.textContent||'').trim(); if (t.includes('@')||t.length>3){accountState=t.slice(0,60);return accountState;} } }
  accountState = location.hostname; return accountState;
}
function estimateTokens(s) { return Math.max(1, Math.round(s.length/4)); }
function detectLang(el) {
  const codeEl = el.tagName==='CODE' ? el : el.querySelector('code');
  if (codeEl) { const cls=Array.from(codeEl.classList).find(c=>c.startsWith('language-')); if (cls) return cls.replace('language-',''); }
  return null;
}
function detectArtifactName(el) {
  const parent = el.closest('[class*="artifact"]') || el.parentElement;
  if (parent) { const titleEl=parent.querySelector('[class*="title"],[class*="name"],[data-testid*="title"]'); if (titleEl) { const t=titleEl.textContent.trim(); if (t.length>0&&t.length<120) return t; } }
  const firstLine = (el.innerText||el.textContent||'').split('\n')[0].trim();
  const m = firstLine.match(/^(?:\/\/|#|--|<!--)?\s*([\w.\-/ ]+\.\w{1,6})/); if (m) return m[1].trim();
  const lang = detectLang(el); return lang ? `${lang} block` : 'artifact';
}

// ── Styles ────────────────────────────────────────────────────────────────────
function injectStyles() {
  const s = document.createElement('style');
  s.textContent = `
    @keyframes gpulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.8)}}
    @keyframes gfadein{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
    #__g8root__{position:fixed;bottom:16px;right:16px;z-index:2147483647;font-family:'SF Mono','Fira Code',monospace;font-size:11px;user-select:none}
    #__g8pill__{display:flex;align-items:center;gap:7px;background:rgba(15,15,20,.92);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,.08);border-radius:20px;padding:5px 12px 5px 8px;cursor:pointer;box-shadow:0 4px 20px rgba(0,0,0,.5);transition:opacity .2s;margin-left:auto}
    #__g8pill__:hover{opacity:.85}
    #__g8panel__{width:460px;background:rgba(10,10,16,.97);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.08);border-radius:12px;box-shadow:0 8px 40px rgba(0,0,0,.7);overflow:hidden;margin-bottom:8px;display:none;flex-direction:column;animation:gfadein .15s ease}
    #__g8tabs__{display:flex;border-bottom:1px solid rgba(255,255,255,.06);background:rgba(0,0,0,.3);flex-shrink:0;overflow:hidden}
    .g8tab{flex:1;padding:6px 2px;text-align:center;cursor:pointer;font-size:9px;color:#334155;border-bottom:2px solid transparent;transition:all .15s;letter-spacing:.04em;font-weight:600;text-transform:uppercase}
    .g8tab:hover{color:#64748b}.g8tab.active{color:#cbd5e1;border-bottom-color:#6366f1}
    .g8tab.seam-tab.active{border-bottom-color:#f59e0b;color:#fbbf24}
    #__g8log__,#__g8artifacts__,#__g8gaps__,#__g8pa__,#__g8seam__{flex:1;overflow-y:auto;padding:6px 0;min-height:200px;max-height:360px}
    #__g8log__::-webkit-scrollbar,#__g8artifacts__::-webkit-scrollbar,#__g8gaps__::-webkit-scrollbar,#__g8pa__::-webkit-scrollbar,#__g8seam__::-webkit-scrollbar{width:3px}
    #__g8log__::-webkit-scrollbar-thumb,#__g8artifacts__::-webkit-scrollbar-thumb,#__g8gaps__::-webkit-scrollbar-thumb,#__g8pa__::-webkit-scrollbar-thumb,#__g8seam__::-webkit-scrollbar-thumb{background:#1e293b;border-radius:3px}
    .g8row:hover{background:rgba(255,255,255,.03)!important}
    #__g8settings__{flex:1;overflow-y:auto;padding:10px 12px;min-height:200px;max-height:360px}
    #__g8api__{flex:1;overflow-y:auto;padding:10px 12px;min-height:200px;max-height:360px}
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
    .ga-pre{background:#030308;border:1px solid #1e1e3a;border-radius:3px;padding:5px 8px;font-size:.65rem;color:#64748b;white-space:pre-wrap;word-break:break-all;max-height:140px;overflow-y:auto;margin-top:4px;font-family:inherit}
    .ga-acts{display:flex;gap:3px;margin-top:5px}
    .ga-btn{background:none;border:1px solid rgba(255,255,255,.08);color:#475569;border-radius:3px;padding:2px 7px;font-size:.65rem;cursor:pointer;font-family:inherit}
    .ga-btn:hover{border-color:#6366f1;color:#a5b4fc}
    .gg-row{padding:3px 0;border-bottom:1px solid rgba(30,30,58,.5);display:flex;gap:6px;font-size:.68rem;align-items:flex-start}
    .gg-type{font-weight:700;flex-shrink:0;width:76px}.gg-domain{color:#475569;flex-shrink:0;width:80px;font-size:.6rem}
    .gg-reason{color:#1e293b;flex-shrink:0;width:82px;font-size:.58rem}
    .gg-desc{color:#475569;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .gg-score{flex-shrink:0;width:32px;text-align:right;font-weight:700}
    .gg-drift{display:flex;align-items:center;gap:6px;margin-bottom:6px}
    .gg-dbar{flex:1;height:3px;background:#1e1e3a;border-radius:2px;overflow:hidden}
    .gg-dfill{height:100%;background:#f472b6;border-radius:2px;transition:width .5s}
    .pa-mets{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-bottom:6px}
    .pa-met{background:#080812;border:1px solid #1e1e3a;border-radius:3px;padding:4px 6px;text-align:center}
    .pa-mv{color:#a0d0ff;font-size:.85rem;font-weight:600}.pa-ml{color:#1e293b;font-size:.58rem;text-transform:uppercase}
    .pa-canvas{width:100%;height:64px;border:1px solid #1e1e3a;border-radius:3px;background:#050510;display:block;margin-bottom:6px}
    .pa-hyp{background:#060610;border-left:2px solid #6366f1;padding:4px 7px;margin-bottom:3px}
    .pa-hl{color:#c7d2fe;font-size:.7rem;margin-bottom:2px}.pa-hc{color:#6366f1;font-size:.62rem}
    .pa-bar{height:2px;background:#1e1e3a;border-radius:2px;overflow:hidden;margin:2px 0}
    .pa-barf{height:100%;background:#818cf8;border-radius:2px}
    .gs-card{background:#080812;border:1px solid #1e1e3a;border-radius:5px;padding:8px 10px;margin-bottom:6px}
    .gs-key{font-size:.6rem;color:#334155;text-transform:uppercase;letter-spacing:.1em;margin-bottom:2px}
    .gs-label{font-size:.74rem;color:#cbd5e1;margin-bottom:4px;font-weight:600}
    .gs-desc{font-size:.6rem;color:#1e293b;margin-bottom:6px}
    input[type=range]{width:100%;accent-color:#6366f1;cursor:pointer}
    .gs-card input[type=text],.gs-card textarea,.gs-card select{background:#050510;border:1px solid #1e1e3a;color:#94a3b8;padding:4px 7px;font-family:inherit;font-size:.7rem;width:100%;outline:none;box-sizing:border-box}
    .gs-tgl{position:relative;width:32px;height:18px;cursor:pointer;display:inline-block}
    .gs-tgl input{opacity:0;width:0;height:0}.gs-tsl{position:absolute;inset:0;background:#1e1e3a;border-radius:18px;transition:.2s}
    .gs-tsl::before{content:'';position:absolute;height:12px;width:12px;left:3px;bottom:3px;background:#334155;border-radius:50%;transition:.2s}
    .gs-tgl input:checked+.gs-tsl{background:#6366f1}.gs-tgl input:checked+.gs-tsl::before{transform:translateX(14px);background:#fff}
    .gs-save{background:#0d0d1a;border:1px solid rgba(255,255,255,.12);color:#64748b;border-radius:3px;padding:3px 8px;font-size:.68rem;cursor:pointer;font-family:inherit;margin-top:5px}
    .gapi-card{background:#080812;border:1px solid #1e1e3a;border-radius:4px;padding:7px 10px;margin-bottom:5px}
    .gapi-t{color:#818cf8;font-size:.65rem;font-weight:700;margin-bottom:3px;letter-spacing:.06em}
    .gapi-v{color:#64748b;font-size:.7rem;word-break:break-all}
    .gapi-v.ok{color:#34d399}
    .gapi-btn{background:#0d0d1a;border:1px solid rgba(255,255,255,.1);color:#64748b;border-radius:3px;padding:3px 8px;font-size:.68rem;cursor:pointer;font-family:inherit;margin-right:3px;margin-bottom:3px}
    .gapi-btn:hover{border-color:#6366f1;color:#a5b4fc}.gapi-btn.on{border-color:#34d399;color:#34d399}
    /* SEAM tab */
    .seam-prog-bar{height:5px;background:#1e1e3a;border-radius:3px;overflow:hidden;margin:6px 0 3px}
    .seam-prog-fill{height:100%;background:linear-gradient(90deg,#f59e0b,#22c55e);border-radius:3px;transition:width .6s cubic-bezier(.34,1.56,.64,1)}
    .seam-ticks{display:flex;gap:2px;margin-bottom:8px}
    .seam-tick{flex:1;height:3px;border-radius:1px;background:#1e1e3a;cursor:pointer;transition:background .2s}
    .seam-tick.done{background:#22c55e}.seam-tick.active{background:#f59e0b}.seam-tick.fail{background:#ef4444}
    .seam-chunk{border:1px solid #1e1e3a;border-radius:4px;padding:7px 10px;margin-bottom:5px;cursor:pointer;transition:all .15s}
    .seam-chunk:hover{border-color:#334155;background:rgba(255,255,255,.02)}
    .seam-chunk.seam-active{border-color:#f59e0b;background:rgba(245,158,11,.06)}
    .seam-chunk.seam-verified{border-color:#22c55e;background:rgba(34,197,94,.05)}
    .seam-chunk.seam-failed{border-color:#ef4444;background:rgba(239,68,68,.05)}
    .sc-hdr{display:flex;align-items:center;gap:6px;font-size:.72rem}
    .sc-num{color:#334155;flex-shrink:0;font-size:.65rem}.sc-title{color:#cbd5e1;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sc-status{flex-shrink:0;font-size:.7rem}
    .sc-meta{font-size:.62rem;color:#334155;margin-top:2px;display:flex;gap:8px}
    .seam-inject-btn{background:none;border:1px solid rgba(245,158,11,.4);color:#f59e0b;border-radius:3px;padding:3px 10px;font-size:.7rem;cursor:pointer;font-family:inherit;font-weight:600;transition:all .15s}
    .seam-inject-btn:hover{background:rgba(245,158,11,.1)}.seam-inject-btn:disabled{opacity:.3;cursor:not-allowed}
    .seam-verdict-area{padding:6px 8px;background:#060610;border:1px solid #1e1e3a;border-radius:3px;margin-top:6px}
    .sva-label{font-size:.62rem;color:#334155;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px}
    .sva-ta{width:100%;background:#030308;border:1px solid #1e1e3a;color:#94a3b8;padding:5px 7px;font-family:inherit;font-size:.68rem;line-height:1.5;outline:none;resize:none;border-radius:2px;min-height:50px}
    .sva-ta:focus{border-color:#f59e0b}
    .sva-btns{display:flex;gap:4px;margin-top:5px}
    .sva-pass{background:#22c55e;color:#000;border:none;border-radius:2px;padding:3px 10px;font-size:.68rem;cursor:pointer;font-family:inherit;font-weight:700}
    .sva-fail{background:#ef4444;color:#fff;border:none;border-radius:2px;padding:3px 10px;font-size:.68rem;cursor:pointer;font-family:inherit;font-weight:700}
    .sva-skip{background:none;border:1px solid #1e1e3a;color:#475569;border-radius:2px;padding:3px 10px;font-size:.68rem;cursor:pointer;font-family:inherit}
    .seam-empty{color:#1e293b;font-size:.72rem;padding:20px;text-align:center;line-height:1.7}
    .seam-parse-area textarea{width:100%;background:#030308;border:1px solid #1e1e3a;color:#64748b;padding:6px 8px;font-family:inherit;font-size:.68rem;line-height:1.5;outline:none;resize:none;border-radius:2px;min-height:80px;display:block}
    .seam-parse-area textarea:focus{border-color:#f59e0b}
    .seam-toolbar{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid #1e1e3a}
    .seam-tgl-btn{background:none;border:1px solid #1e1e3a;color:#475569;border-radius:2px;padding:2px 7px;font-size:.67rem;cursor:pointer;font-family:inherit;transition:all .15s}
    .seam-tgl-btn:hover{border-color:#334155;color:#94a3b8}.seam-tgl-btn.on{border-color:rgba(34,197,94,.4);color:#22c55e;background:rgba(34,197,94,.06)}
    .seam-chunk-detail{margin-top:6px;padding:6px 8px;background:#060610;border:1px solid #1e1e3a;border-radius:3px;font-size:.65rem;color:#334155;white-space:pre-wrap;word-break:break-word;max-height:100px;overflow-y:auto;font-family:inherit}
    .seam-test-row{display:flex;align-items:flex-start;gap:6px;padding:3px 0;border-bottom:1px solid rgba(30,30,58,.5);font-size:.67rem}
    .str-num{color:#1e293b;flex-shrink:0;width:18px}.str-text{color:#475569;flex:1;line-height:1.4}.str-pass{flex-shrink:0}
    .str-btn{background:none;border:1px solid #1e1e3a;color:#334155;border-radius:2px;padding:1px 5px;font-size:.62rem;cursor:pointer;font-family:inherit;margin-left:2px}
    .str-btn.p-on{border-color:#22c55e;color:#22c55e}.str-btn.f-on{border-color:#ef4444;color:#ef4444}
  `;
  document.head.appendChild(s);
}

// ── UI Build ──────────────────────────────────────────────────────────────────
function el(tag, id, styles) { const e=document.createElement(tag); if(id)e.id=id; Object.assign(e.style,styles||{}); return e; }
function buildUI() {
  injectStyles();
  const root = el('div','__g8gptroot__',{});
  document.body.appendChild(root);

  // Pill
  const pill = el('div','__g8gptpill__',{});
  const dot  = el('div','__g8gptdot__',{width:'7px',height:'7px',borderRadius:'50%',background:'#888',transition:'background .4s',flexShrink:'0'});
  const lbl  = el('span','__g8gptlabel__',{color:'#cbd5e1',fontSize:'11px',fontWeight:'500'}); lbl.textContent='Guardian';
  const prov = el('span',null,{color:'#475569',fontSize:'10px',borderLeft:'1px solid rgba(255,255,255,.1)',paddingLeft:'7px',marginLeft:'1px'}); prov.textContent='chatgpt v8.3';
  const claimBadge = el('span','__g8gptclaim__',{fontSize:'9px',padding:'1px 6px',borderRadius:'8px',fontWeight:'700',letterSpacing:'.05em',transition:'all .3s',background:'rgba(100,116,139,.12)',color:'#64748b'}); claimBadge.textContent='PASSIVE';
  const badge = el('span','__g8gptbadge__',{background:'#7c3aed',color:'#fff',borderRadius:'10px',padding:'0 5px',fontSize:'10px',display:'none',fontWeight:'600'});
  pill.append(dot,lbl,prov,claimBadge,badge);

  // Panel
  const panel = el('div','__g8gptpanel__',{});
  const hdr   = el('div',null,{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px',borderBottom:'1px solid rgba(255,255,255,.07)',background:'rgba(255,255,255,.03)',flexShrink:'0'});
  const hdrL  = el('div',null,{display:'flex',alignItems:'center',gap:'8px'});
  const hdrDot= el('div','__g8gpthdrdot__',{width:'8px',height:'8px',borderRadius:'50%',background:'#888',flexShrink:'0'});
  const hdrTitle = el('span',null,{color:'#e2e8f0',fontWeight:'600',fontSize:'12px'}); hdrTitle.textContent='Guardian v8.3 + SEAM — ChatGPT';
  const hdrBadge = el('span','__g8gpthdrbadge__',{fontSize:'9px',padding:'1px 7px',borderRadius:'10px',background:'rgba(136,136,136,.2)',color:'#888',textTransform:'uppercase',letterSpacing:'.06em',fontWeight:'600'}); hdrBadge.textContent='DISCONNECTED';
  hdrL.append(hdrDot,hdrTitle,hdrBadge);
  const clearBtn = el('button',null,{background:'none',border:'1px solid rgba(255,255,255,.1)',color:'#475569',borderRadius:'6px',padding:'2px 8px',cursor:'pointer',fontSize:'10px'}); clearBtn.textContent='Clear'; clearBtn.onclick=()=>{logEntries=[];renderActiveTab();};
  hdr.append(hdrL,clearBtn);

  const jobBar = el('div','__g8gptjobbar__',{display:'none',alignItems:'center',gap:'8px',padding:'7px 14px',background:'rgba(251,191,36,.08)',borderBottom:'1px solid rgba(251,191,36,.15)',flexShrink:'0'});
  const jDot  = el('div',null,{width:'6px',height:'6px',borderRadius:'50%',background:'#fbbf24',animation:'gpulse 1.2s ease-in-out infinite',flexShrink:'0'});
  const jText = el('span','__g8gptjobtext__',{color:'#fde68a',fontSize:'10px',fontWeight:'500',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:'1'}); jText.textContent='Job running…';
  const jId   = el('span','__g8gptjobid__',{color:'#78716c',fontSize:'9px'});
  jobBar.append(jDot,jText,jId);

  const sysStrip = el('div','__g8gptsys__',{padding:'5px 14px',borderBottom:'1px solid rgba(255,255,255,.05)',display:'flex',flexWrap:'wrap',gap:'4px'}); sysStrip.style.display='none';

  // Tabs: Log | SEAM | Artifacts | Gaps | PA | Settings | API
  const tabs = el('div','__g8gpttabs__',{});
  const TAB_LIST = [['log','Log'],['seam','SEAM'],['queue','Queue'],['artifacts','Arts'],['gaps','Gaps'],['pa','PA'],['settings','Cfg'],['api','API']];
  for (const [id,label] of TAB_LIST) {
    const t = el('div',null,{}); t.className='g8gpttab'+(id==='seam'?' seam-tab':'')+(id===activeTab?' active':'');
    t.textContent=label; t.dataset.tab=id; t.addEventListener('click',()=>switchTab(id)); tabs.appendChild(t);
  }

  // Content areas
  const logArea      = el('div','__g8gptlog__',{});
  const seamArea     = el('div','__g8gptseam__',{display:'none',padding:'8px 10px'});
  const queueArea    = el('div','__g8gptqueue__',{display:'none',padding:'8px 10px'});
  const artsArea     = el('div','__g8gptarts__',{display:'none',padding:'8px 10px'});
  const gapsArea     = el('div','__g8gptgaps__',{display:'none',padding:'8px 10px'});
  const paArea       = el('div','__g8gptpa__',{display:'none',padding:'8px 10px'});
  const settingsArea = el('div','__g8gptsettings__',{display:'none'});
  const apiArea      = el('div','__g8gptapi__',{display:'none'});

  const footer = el('div',null,{padding:'7px 14px',borderTop:'1px solid rgba(255,255,255,.05)',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:'0'});
  const fL = el('span','__g8gptfooter__',{color:'#334155',fontSize:'10px'}); fL.textContent='wss://127.0.0.1:7821 · chatgpt';
  const fR = el('span',null,{color:'#1e293b',fontSize:'10px'}); fR.textContent=`v${VERSION}`;
  footer.append(fL,fR);

  panel.append(hdr,jobBar,sysStrip,tabs,logArea,seamArea,queueArea,artsArea,gapsArea,paArea,settingsArea,apiArea,footer);
  pill.addEventListener('click',()=>{
    panelOpen=!panelOpen; panel.style.display=panelOpen?'flex':'none';
    if (panelOpen) { renderActiveTab(); unreadCount=0; badge.style.display='none'; renderSysStrip(); }
  });
  root.append(panel,pill);
}

// ── Tab switching ─────────────────────────────────────────────────────────────
const AREAS_GPT = { log:'__g8gptlog__', seam:'__g8gptseam__', queue:'__g8gptqueue__', artifacts:'__g8gptarts__', gaps:'__g8gptgaps__', pa:'__g8gptpa__', settings:'__g8gptsettings__', api:'__g8gptapi__' };
function switchTab(id) {
  activeTab=id;
  document.querySelectorAll('.g8gpttab').forEach(t=>t.classList.toggle('active',t.dataset.tab===id));
  for (const [k,elId] of Object.entries(AREAS_GPT)) { const e=document.getElementById(elId); if(e) e.style.display=k===id?'block':'none'; }
  renderActiveTab();
}
function renderActiveTab() {
  if (activeTab==='log')       renderLog();
  if (activeTab==='seam')      renderSeamTab();
  if (activeTab==='queue')     renderQueueTab();
  if (activeTab==='artifacts') renderArtifactsTab();
  if (activeTab==='gaps')      renderGapsTab();
  if (activeTab==='pa')        renderPATab();
  if (activeTab==='settings')  renderSettingsTab();
  if (activeTab==='api')       renderApiTab();
}

// ── Log ───────────────────────────────────────────────────────────────────────
const LOG_TYPES = { info:{color:'#94a3b8',icon:'·'}, in:{color:'#60a5fa',icon:'↓'}, out:{color:'#a78bfa',icon:'↑'}, ok:{color:'#34d399',icon:'✓'}, err:{color:'#f87171',icon:'✗'}, job:{color:'#fbbf24',icon:'⚡'}, hb:{color:'#475569',icon:'♥'}, sys:{color:'#818cf8',icon:'◈'}, gap:{color:'#f472b6',icon:'△'} };
const CONN_COLORS = { connecting:{dot:'#888',badge:'#888'}, handshaking:{dot:'#f59e0b',badge:'#f59e0b'}, ready:{dot:'#22c55e',badge:'#22c55e'}, disconnected:{dot:'#ef4444',badge:'#ef4444'} };

function addLog(type, msg, detail) {
  const t = LOG_TYPES[type] || LOG_TYPES.info;
  const entry = { ts:Date.now(), type, msg, detail:detail||null, color:t.color, icon:t.icon };
  logEntries.push(entry); if (logEntries.length > LOG_MAX) logEntries.shift();
  if (panelOpen && activeTab==='log') { renderLogEntry(entry); scrollLog(); }
  else if (type !== 'hb') { unreadCount++; const b=document.getElementById('__g8gptbadge__'); if(b){b.textContent=unreadCount>99?'99+':unreadCount;b.style.display='inline';} }
}

function renderLog() { const a=document.getElementById('__g8gptlog__'); if(!a)return; a.innerHTML=''; logEntries.forEach(e=>renderLogEntry(e)); scrollLog(); }
function scrollLog() { const a=document.getElementById('__g8gptlog__'); if(a) a.scrollTop=a.scrollHeight; }
function renderLogEntry(entry) {
  const a=document.getElementById('__g8gptlog__'); if(!a)return;
  const row=document.createElement('div'); row.className='g8row';
  Object.assign(row.style,{display:'flex',alignItems:'flex-start',gap:'8px',padding:'3px 14px',transition:'background .15s'});
  const ts=document.createElement('span'); ts.textContent=fts(entry.ts); Object.assign(ts.style,{color:'#1e293b',fontSize:'10px',flexShrink:'0',paddingTop:'1px'});
  const ic=document.createElement('span'); ic.textContent=entry.icon; Object.assign(ic.style,{color:entry.color,flexShrink:'0',width:'10px',textAlign:'center',paddingTop:'1px'});
  const ct=document.createElement('div'); Object.assign(ct.style,{flex:'1',minWidth:'0'});
  const m=document.createElement('span'); m.textContent=entry.msg; Object.assign(m.style,{color:entry.color,fontSize:'10px'}); ct.appendChild(m);
  if (entry.detail) { const d=document.createElement('div'); d.textContent=entry.detail; Object.assign(d.style,{color:'#334155',fontSize:'10px',marginTop:'1px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}); ct.appendChild(d); }
  row.append(ts,ic,ct); a.appendChild(row);
}
function setConnState(state) {
  connState=state; const c=CONN_COLORS[state]||CONN_COLORS.disconnected;
  const d=document.getElementById('__g8gptdot__'); if(d) d.style.background=c.dot;
  const hd=document.getElementById('__g8gpthdrdot__'); if(hd) hd.style.background=c.dot;
  const labels={connecting:'CONNECTING',handshaking:'HANDSHAKING',ready:'READY',disconnected:'DISCONNECTED'};
  const hb=document.getElementById('__g8gpthdrbadge__'); if(hb){hb.textContent=labels[state]||state.toUpperCase();hb.style.background=`${c.badge}22`;hb.style.color=c.badge;}
  const l=document.getElementById('__g8gptlabel__'); if(l) l.textContent=state==='ready'?'Guardian':labels[state]||'Guardian';
}
function setJobState(active, prompt, jobId) {
  const bar=document.getElementById('__g8gptjobbar__'); if(!bar) return;
  bar.style.display=active?'flex':'none';
  if (active) { const t=document.getElementById('__g8gptjobtext__'); if(t) t.textContent=(prompt||'Job running…').slice(0,60); const i=document.getElementById('__g8gptjobid__'); if(i) i.textContent=jobId?`#${jobId.slice(0,8)}`:''; }
}
function renderSysStrip() {
  const strip=document.getElementById('__g8gptsys__'); if(!strip) return;
  if (!Object.keys(domSystems).length) { strip.style.display='none'; return; }
  strip.style.display='flex'; strip.innerHTML='';
  for (const [type,info] of Object.entries(domSystems)) {
    const b=document.createElement('span'); Object.assign(b.style,{background:'rgba(99,102,241,.1)',border:'1px solid rgba(99,102,241,.25)',color:'#818cf8',borderRadius:'3px',padding:'1px 6px',fontSize:'9px'});
    b.textContent=`${type.replace('_',' ')} ×${info.count}`; strip.appendChild(b);
  }
}

// ── SEAM Tab ─────────────────────────────────────────────────────────────────
function renderSeamTab() {
  const area = document.getElementById('__g8gptseam__'); if (!area) return;
  const total = seamState.chunks.length;
  const verified = seamState.chunks.filter(c=>c.status==='verified').length;
  const pct = total ? (verified/total)*100 : 0;
  const nextPending = seamState.chunks.findIndex(c=>c.status==='pending');
  area.innerHTML = '';

  // Toolbar
  const tb = document.createElement('div'); tb.className='seam-toolbar';
  const parseBtn = document.createElement('button'); parseBtn.className='seam-tgl-btn'+(seamView==='parse'?' on':''); parseBtn.textContent='+ Parse Spec'; parseBtn.onclick=()=>{seamView=seamView==='parse'?'deliver':'parse';renderSeamTab();};
  const autoBtn  = document.createElement('button'); autoBtn.className='seam-tgl-btn'+(seamAutoInject?' on':''); autoBtn.textContent=seamAutoInject?'Auto ▶ ON':'Auto ▶ OFF'; autoBtn.onclick=()=>{seamAutoInject=!seamAutoInject;renderSeamTab();if(seamAutoInject&&nextPending>=0&&!currentJobId)seamInjectChunk(nextPending);};
  const clearBtn = document.createElement('button'); clearBtn.className='seam-tgl-btn'; clearBtn.textContent='✕ Clear'; clearBtn.onclick=()=>{if(confirm('Clear SEAM state?')){seamState={chunks:[],activeChunk:0,specTitle:'Untitled',customSystemPrompt:'',created:Date.now()};seamSaveState();renderSeamTab();}};
  const exportBtn= document.createElement('button'); exportBtn.className='seam-tgl-btn'; exportBtn.textContent='↓ Export'; exportBtn.onclick=()=>{const blob=new Blob([JSON.stringify(seamState,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`seam-state-${Date.now()}.json`;a.click();};
  tb.append(parseBtn,autoBtn,clearBtn,exportBtn);

  const sysRow=document.createElement('div'); sysRow.style.cssText='display:flex;align-items:center;gap:4px;';
  const sysLbl=document.createElement('span'); sysLbl.style.cssText='font-size:.62rem;color:#334155;'; sysLbl.textContent='System:';
  const sysSelect=document.createElement('select'); sysSelect.id='__g8gpt_seam_sysprompt__'; sysSelect.style.cssText='background:#050510;border:1px solid #1e1e3a;color:#64748b;padding:2px 6px;font-family:inherit;font-size:.67rem;border-radius:2px;outline:none;';
  for (const [v,l] of [['nexus','NEXUS'],['seam','SEAM Verifier'],['none','None']]) { const o=document.createElement('option');o.value=v;o.textContent=l;sysSelect.appendChild(o); }
  sysRow.append(sysLbl,sysSelect); tb.appendChild(sysRow);
  area.appendChild(tb);

  // Parse view
  if (seamView === 'parse') {
    const wrap=document.createElement('div'); wrap.className='seam-parse-area';
    wrap.innerHTML=`<div style="font-size:.62rem;color:#334155;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px;">Paste spec</div>
      <textarea id="__seam_spec_input__" placeholder="Paste your spec here. SEAM will chunk it and auto-generate test contracts."></textarea>
      <div style="display:flex;gap:4px;margin-top:6px;flex-wrap:wrap;">
        <select id="__seam_split__" style="background:#050510;border:1px solid #1e1e3a;color:#64748b;padding:2px 6px;font-family:inherit;font-size:.67rem;border-radius:2px;outline:none;">
          <option value="heading">## Headings</option><option value="divider">--- Dividers</option>
          <option value="phase">Phase/Step N</option><option value="size">By size</option><option value="custom">Custom regex</option>
        </select>
        <input id="__seam_maxsize__" type="number" value="3000" min="500" max="20000" step="500" style="background:#050510;border:1px solid #1e1e3a;color:#64748b;padding:2px 6px;font-family:inherit;font-size:.67rem;border-radius:2px;outline:none;width:68px;">
        <button class="seam-inject-btn" id="__seam_parse_btn__">Parse →</button>
      </div>
      <div id="__seam_custpat__" style="display:none;margin-top:4px;">
        <input type="text" id="__seam_custpat_input__" placeholder="Custom regex e.g. ^## |^PHASE" style="background:#050510;border:1px solid #1e1e3a;color:#64748b;padding:3px 7px;font-family:inherit;font-size:.67rem;border-radius:2px;outline:none;width:100%;">
      </div>`;
    area.appendChild(wrap);
    area.querySelector('#__seam_split__')?.addEventListener('change', e => {
      const cr = area.querySelector('#__seam_custpat__'); if (cr) cr.style.display = e.target.value==='custom'?'block':'none';
    });
    area.querySelector('#__seam_parse_btn__')?.addEventListener('click', () => {
      const text = area.querySelector('#__seam_spec_input__')?.value?.trim();
      if (!text) { addLog('err','SEAM: paste a spec first'); toast('Paste a spec first', 'warn'); return; }
      const splitOn = area.querySelector('#__seam_split__')?.value || 'heading';
      const maxSize = parseInt(area.querySelector('#__seam_maxsize__')?.value) || 3000;
      const customPat = area.querySelector('#__seam_custpat_input__')?.value || '';
      seamState.chunks = seamParseSpec(text, splitOn, maxSize, customPat);
      seamState.activeChunk = 0;
      seamSaveState(); seamView = 'deliver';
      addLog('ok', `SEAM: parsed ${seamState.chunks.length} chunks`);
      toast(`SEAM: ${seamState.chunks.length} chunks parsed`, 'success');
      evLog('seam.parsed', { chunks:seamState.chunks.length, splitOn });
      renderSeamTab();
    });
    return;
  }

  // Deliver view
  if (!total) { area.innerHTML += '<div class="seam-empty">No spec loaded.<br>Click "+ Parse Spec" to start.</div>'; return; }

  // Progress bar
  const progWrap = document.createElement('div');
  progWrap.innerHTML = `<div style="display:flex;justify-content:space-between;font-size:.65rem;color:#475569;margin-bottom:3px;"><span>SEAM Delivery — test-gated</span><span style="color:${pct===100?'#22c55e':pct>0?'#f59e0b':'#334155'};font-weight:700;">${verified}/${total} · ${Math.round(pct)}%</span></div>
    <div class="seam-prog-bar"><div class="seam-prog-fill" style="width:${pct}%"></div></div>
    <div class="seam-ticks" id="__seam_ticks__"></div>`;
  area.appendChild(progWrap);
  const ticksEl = area.querySelector('#__seam_ticks__');
  if (ticksEl) {
    ticksEl.innerHTML = seamState.chunks.map((c,i)=>`<div class="seam-tick ${c.status==='verified'?'done':c.status==='failed'?'fail':i===seamState.activeChunk?'active':''}" data-idx="${i}" title="${escHtml(c.title)}"></div>`).join('');
    ticksEl.querySelectorAll('.seam-tick').forEach(t=>t.addEventListener('click',()=>{seamState.activeChunk=parseInt(t.dataset.idx);seamSaveState();renderSeamTab();}));
  }

  // Next action bar
  if (nextPending >= 0 && !seamAutoInject) {
    const nextC = seamState.chunks[nextPending];
    const nb = document.createElement('div'); nb.style.cssText='display:flex;align-items:center;gap:6px;padding:5px 8px;background:rgba(245,158,11,.06);border:1px solid rgba(245,158,11,.2);border-radius:3px;margin-bottom:6px;';
    nb.innerHTML=`<span style="font-size:.67rem;color:#f59e0b;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Next: ${escHtml(nextC.title)}</span>`;
    const injectBtn = document.createElement('button'); injectBtn.className='seam-inject-btn'; injectBtn.textContent=`↗ Inject ${nextPending+1}/${total}`; injectBtn.disabled=!!currentJobId||!isClaimed;
    injectBtn.onclick=()=>seamInjectChunk(nextPending);
    if (!isClaimed) { injectBtn.title='Claim this tab first'; }
    nb.appendChild(injectBtn);

    // Run all remaining via Queue
    const queueBtn = document.createElement('button');
    queueBtn.className = 'seam-inject-btn';
    queueBtn.style.cssText = 'border-color:rgba(99,102,241,.5);color:#818cf8;margin-left:4px;';
    queueBtn.textContent = '⑂ Run Queue';
    queueBtn.disabled = !isClaimed;
    queueBtn.onclick = () => {
      const pending = seamState.chunks.filter(c=>c.status==='pending'||c.status==='failed');
      if (!pending.length) { toast('No pending chunks', 'warn'); return; }
      const sysKey = document.getElementById('__g8gpt_seam_sysprompt__')?.value || 'nexus';
      const chunksForQueue = pending.map(c => ({
        content:    c.content,
        title:      c.title,
        builtPrompt: seamBuildPrompt(c, seamState.chunks.indexOf(c), sysKey),
      }));
      const queueId = jobQueue.createQueue({
        title:    seamState.specTitle || 'SEAM Delivery',
        chunks:   chunksForQueue,
        provider: document.getElementById('ck-provider')?.value || 'claude',
        axioms:   [],
      });
      jobQueue.start();
      switchTab('queue');
      toast(`Queue started — ${chunksForQueue.length} chunks`, 'success');
    };
    nb.appendChild(queueBtn);
    area.appendChild(nb);
  } else if (pct === 100) {
    const done = document.createElement('div'); done.style.cssText='padding:6px 10px;background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.3);border-radius:3px;font-size:.7rem;color:#22c55e;margin-bottom:6px;text-align:center;font-weight:700;'; done.textContent='✓ All chunks verified — spec delivery complete'; area.appendChild(done);
  }

  // Chunk list
  for (let i = 0; i < seamState.chunks.length; i++) {
    const c = seamState.chunks[i], isActive = i===seamState.activeChunk, isExpanded = seamExpandedChunk===i;
    const statusIcon = {pending:'○',verified:'✓',failed:'✗',skipped:'—'}[c.status]||'○';
    const statusColor = {pending:'#334155',verified:'#22c55e',failed:'#ef4444',skipped:'#475569'}[c.status];
    const chunk = document.createElement('div');
    chunk.className=`seam-chunk${isActive?' seam-active':''}${c.status==='verified'?' seam-verified':c.status==='failed'?' seam-failed':''}`;
    chunk.innerHTML=`<div class="sc-hdr"><span class="sc-num">${String(i+1).padStart(2,'0')}</span><span class="sc-title">${escHtml(c.title)}</span><span class="sc-status" style="color:${statusColor}">${statusIcon}</span></div><div class="sc-meta"><span>${c.content.length}ch</span><span>${c.tests.length} tests</span>${c.deliveredAt?'<span style="color:#f59e0b;">delivered</span>':''}${c.status!=='pending'?`<span style="color:${statusColor}">${c.status}</span>`:''}</div>`;
    chunk.addEventListener('click',()=>{seamState.activeChunk=i;seamExpandedChunk=seamExpandedChunk===i?-1:i;seamSaveState();renderSeamTab();});

    if (isExpanded) {
      const det=document.createElement('div');det.className='seam-chunk-detail';det.textContent=c.content.slice(0,400)+(c.content.length>400?'…':'');chunk.appendChild(det);
      if (c.tests.length) {
        const tw=document.createElement('div');tw.style.cssText='margin-top:5px;';
        for (let ti=0;ti<c.tests.length;ti++) {
          const t=c.tests[ti],row=document.createElement('div');row.className='seam-test-row';
          row.innerHTML=`<span class="str-num">${String(ti+1).padStart(2,'0')}</span><span class="str-text">${escHtml(t.text)}</span>`;
          const btns=document.createElement('span');btns.className='str-pass';
          const pBtn=document.createElement('button');pBtn.className='str-btn'+(t.pass===true?' p-on':'');pBtn.textContent='P';
          const fBtn=document.createElement('button');fBtn.className='str-btn'+(t.pass===false?' f-on':'');fBtn.textContent='F';
          pBtn.onclick=e=>{e.stopPropagation();t.pass=t.pass===true?null:true;seamSaveState();renderSeamTab();};
          fBtn.onclick=e=>{e.stopPropagation();t.pass=t.pass===false?null:false;seamSaveState();renderSeamTab();};
          btns.append(pBtn,fBtn);row.appendChild(btns);tw.appendChild(row);
        }
        chunk.appendChild(tw);
      }
      if (c.status==='pending'||c.status==='failed') {
        const va=document.createElement('div');va.className='seam-verdict-area';
        va.innerHTML=`<div class="sva-label">Paste Claude verdict or confirm manually</div><textarea class="sva-ta" id="__sva_note_${i}__" placeholder="SEAM VERDICT: PASS\n[PASS] Test 1: ..."></textarea>`;
        const bd=document.createElement('div');bd.className='sva-btns';
        const pBtn=document.createElement('button');pBtn.className='sva-pass';pBtn.textContent='✓ PASS';
        const fBtn=document.createElement('button');fBtn.className='sva-fail';fBtn.textContent='✗ FAIL';
        const sBtn=document.createElement('button');sBtn.className='sva-skip';sBtn.textContent='— Skip';
        pBtn.onclick=e=>{e.stopPropagation();const n=va.querySelector(`#__sva_note_${i}__`);if(n)c.verificationNote=n.value;seamVerifyChunk(i,'pass');};
        fBtn.onclick=e=>{e.stopPropagation();const n=va.querySelector(`#__sva_note_${i}__`);if(n)c.verificationNote=n.value;seamVerifyChunk(i,'fail');};
        sBtn.onclick=e=>{e.stopPropagation();seamVerifyChunk(i,'skip');};
        bd.append(pBtn,fBtn,sBtn);va.appendChild(bd);
        const ijBtn=document.createElement('button');ijBtn.className='seam-inject-btn';ijBtn.style.marginTop='4px';ijBtn.textContent='↗ Inject this chunk';ijBtn.disabled=!!currentJobId||!isClaimed;
        ijBtn.onclick=e=>{e.stopPropagation();seamInjectChunk(i);};
        va.appendChild(ijBtn);chunk.appendChild(va);
      } else if (c.status==='verified') {
        const vd=document.createElement('div');vd.style.cssText='margin-top:5px;padding:4px 8px;background:rgba(34,197,94,.06);border:1px solid rgba(34,197,94,.2);border-radius:2px;font-size:.65rem;color:#22c55e;';vd.textContent=`✓ Verified ${c.verifiedAt?new Date(c.verifiedAt).toLocaleTimeString():''}`;chunk.appendChild(vd);
      }
    }
    area.appendChild(chunk);
  }
}

// ── Queue Tab ─────────────────────────────────────────────────────────────────
const STATE_COLOR = { QUEUED:'#475569', INJECTING:'#60a5fa', GENERATING:'#fbbf24', DETECTING:'#a78bfa', VERIFIED:'#22c55e', FAILED:'#ef4444', RETRYING:'#f59e0b', ESCALATED:'#f472b6' };

function renderQueueTab() {
  const area = document.getElementById('__g8gptqueue__'); if (!area) return;
  area.innerHTML = '';
  const queues = jobQueue.getAll();
  if (!queues.length) {
    area.innerHTML = '<div style="color:#1e293b;font-size:10px;padding:20px;text-align:center">No queues yet.<br>Parse a spec in the SEAM tab and use "Run via Queue".</div>';
    return;
  }
  for (const q of queues.slice().reverse()) {
    const s = jobQueue.stats(q.id) || {};
    const pct = s.pct || 0;

    // Queue header
    const qHdr = document.createElement('div');
    qHdr.style.cssText = 'margin-bottom:10px;';
    qHdr.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
        <span style="font-size:11px;font-weight:600;color:#cbd5e1;">${escHtml(q.title)}</span>
        <span style="font-size:9px;color:${pct===100?'#22c55e':'#f59e0b'};font-weight:700;">${pct}% · ${s.verified||0}/${s.total||0}</span>
      </div>
      <div style="height:4px;background:#1e1e3a;border-radius:2px;overflow:hidden;margin-bottom:4px;">
        <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#6366f1,#22c55e);border-radius:2px;transition:width .5s;"></div>
      </div>
      <div style="display:flex;gap:8px;font-size:9px;color:#334155;margin-bottom:6px;">
        ${s.verified?`<span style="color:#22c55e">✓${s.verified}</span>`:''}
        ${s.retrying?`<span style="color:#f59e0b">↺${s.retrying}</span>`:''}
        ${s.escalated?`<span style="color:#f472b6">⚠${s.escalated}</span>`:''}
        ${s.active?`<span style="color:#fbbf24">⚡${s.active}</span>`:''}
        ${s.queued?`<span style="color:#475569">⧖${s.queued}</span>`:''}
      </div>`;
    area.appendChild(qHdr);

    // Compartment rows
    for (const comp of q.compartments) {
      const col = STATE_COLOR[comp.state] || '#475569';
      const row = document.createElement('div');
      row.style.cssText = `display:flex;align-items:flex-start;gap:6px;padding:5px 8px;border:1px solid #1e1e3a;border-radius:3px;margin-bottom:3px;border-left:3px solid ${col};cursor:pointer;transition:background .15s;`;
      row.onmouseover = () => row.style.background='rgba(255,255,255,.02)';
      row.onmouseout  = () => row.style.background='';

      const det = comp.detection;
      const detStr = det ? `Δ=${det.composite}${det.truncation?.truncated?' TRUNC':''}` : '';
      const retryStr = comp.retries > 0 ? `retry ${comp.retries}/${comp.maxRetries}` : '';

      row.innerHTML = `
        <span style="font-size:9px;color:#334155;flex-shrink:0;padding-top:1px;">${String(comp.chunkIdx+1).padStart(2,'0')}</span>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:5px;">
            <span style="font-size:10px;color:#94a3b8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">${escHtml(comp.chunkTitle)}</span>
            <span style="font-size:9px;color:${col};font-weight:700;flex-shrink:0;">${comp.state}</span>
          </div>
          ${detStr||retryStr ? `<div style="font-size:9px;color:#334155;margin-top:2px;">${[detStr,retryStr].filter(Boolean).join(' · ')}</div>` : ''}
          ${det && !det.passed ? `<div style="font-size:9px;color:#ef4444;margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(det.summary.slice(0,80))}</div>` : ''}
        </div>`;

      // Click to show failure detail
      row.addEventListener('click', () => {
        if (comp.failureLog.length === 0) return;
        const last = comp.failureLog[comp.failureLog.length - 1];
        addLog('info', `Chunk ${comp.chunkIdx+1} last detection`, last.detection.summary);
        toast(`Chunk ${comp.chunkIdx+1}: ${last.detection.summary.slice(0,60)}`, 'warn', 5000);
      });
      area.appendChild(row);
    }

    // Queue actions
    const acts = document.createElement('div');
    acts.style.cssText = 'display:flex;gap:5px;margin-bottom:12px;margin-top:4px;';
    if (!q.completedAt) {
      const pauseBtn = document.createElement('button');
      pauseBtn.className = 'gs-save';
      pauseBtn.textContent = jobQueue.running ? '⏸ Pause' : '▶ Resume';
      pauseBtn.onclick = () => { if (jobQueue.running) jobQueue.pause(); else jobQueue.resume(); renderQueueTab(); };
      acts.appendChild(pauseBtn);
    }
    const exportBtn = document.createElement('button');
    exportBtn.className = 'gs-save';
    exportBtn.textContent = '↓ Export';
    exportBtn.onclick = () => {
      const blob = new Blob([JSON.stringify({ queue:q, stats:jobQueue.stats(q.id) }, null, 2)], { type:'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = `queue-${q.id.slice(0,8)}-${Date.now()}.json`; a.click();
    };
    acts.appendChild(exportBtn);
    area.appendChild(acts);
  }
}

// ── Artifacts Tab ─────────────────────────────────────────────────────────────
let artFilter='all', artSearch='', artExpanded=new Set();
const ART_ICONS={typescript:'🔷',ts:'🔷',javascript:'🟨',js:'🟨',python:'🐍',html:'🌐',css:'🎨',json:'📋',bash:'💲',sh:'💲',rust:'🦀',go:'🟦'};

function renderArtifactsTab() {
  const area=document.getElementById('__g8gptarts__'); if(!area)return; area.innerHTML='';
  const total=artifactStore.length,langs=[...new Set(artifactStore.map(a=>a.lang).filter(Boolean))];
  area.innerHTML=`<div style="display:flex;gap:6px;font-size:9px;color:#334155;margin-bottom:6px;flex-wrap:wrap"><span>${total} arts</span><span>${langs.length} langs</span><span>${detectedDownloads.length} dls</span></div>`;
  const srch=document.createElement('input');srch.className='ga-search';srch.placeholder='Search…';srch.value=artSearch;srch.oninput=e=>{artSearch=e.target.value;renderArtifactsTab();};area.appendChild(srch);
  const fb=document.createElement('div');fb.className='ga-fb';
  for (const f of ['all','artifact','code_block','download','ts','js','python','html','json']) { const b=document.createElement('button');b.className='ga-f'+(artFilter===f?' on':'');b.textContent=f;b.onclick=()=>{artFilter=f;renderArtifactsTab();};fb.appendChild(b); }
  area.appendChild(fb);
  let items=[...artifactStore.map(a=>({...a,_kind:'artifact'})),...detectedDownloads.map(d=>({...d,_kind:'download',type:'download',name:d.filename,content:d.href,lang:null}))].sort((a,b)=>b.ts-a.ts);
  if (artFilter!=='all') items=items.filter(a=>a.type===artFilter||a.lang===artFilter||(artFilter==='download'&&a._kind==='download')||(artFilter==='ts'&&(a.lang==='typescript'||a.lang==='ts'))||(artFilter==='js'&&(a.lang==='javascript'||a.lang==='js')));
  if (artSearch) { const q=artSearch.toLowerCase(); items=items.filter(a=>(a.name||'').toLowerCase().includes(q)||(a.lang||'').toLowerCase().includes(q)||(a.content||'').toLowerCase().includes(q)); }
  if (!items.length) { const em=document.createElement('div');em.style.cssText='color:#1e293b;font-size:10px;padding:20px;text-align:center';em.textContent=total===0?'No artifacts yet.':'No matches.';area.appendChild(em);return; }
  for (const item of items.slice(0,80)) {
    const hash=item.hash||item.id,isExp=artExpanded.has(hash),isDl=item._kind==='download';
    const card=document.createElement('div');card.className='ga-card'+(isExp?' exp':'');
    const ic=isDl?'⬇':(ART_ICONS[item.lang]||(item.type==='artifact'?'◈':'◻'));
    const nc=isDl?'#60a5fa':(item.direction==='output'?'#a78bfa':'#60a5fa');
    const hdrEl=document.createElement('div');hdrEl.className='ga-hdr';
    hdrEl.innerHTML=`<span>${ic}</span><span class="ga-name" style="color:${nc}">${escHtml(item.name||'artifact')}</span>${item.lang?`<span class="ga-lang">${item.lang}</span>`:''}<span class="ga-ts">${fts(item.ts)}</span>`;
    hdrEl.onclick=()=>{if(isExp)artExpanded.delete(hash);else artExpanded.add(hash);renderArtifactsTab();};card.appendChild(hdrEl);
    if (isExp) {
      const body=document.createElement('div');body.className='ga-body';
      if (item.content) { const pre=document.createElement('pre');pre.className='ga-pre';pre.textContent=item.content.slice(0,2500);body.appendChild(pre); }
      const acts=document.createElement('div');acts.className='ga-acts';
      const copyB=document.createElement('button');copyB.className='ga-btn';copyB.textContent='⎘ Copy';copyB.onclick=e=>{e.stopPropagation();navigator.clipboard.writeText(item.content||'').then(()=>{copyB.textContent='✓';setTimeout(()=>copyB.textContent='⎘ Copy',1200);toast('Copied','success',1500);});};acts.appendChild(copyB);
      const memB=document.createElement('button');memB.className='ga-btn';memB.textContent='↑ Mem';memB.onclick=e=>{e.stopPropagation();sendToMemory({type:'ARTIFACT_MANUAL_PUSH',payload:item});memB.textContent='✓';toast('Pushed to memory','success',1500);setTimeout(()=>memB.textContent='↑ Mem',1200);};acts.appendChild(memB);
      body.appendChild(acts);card.appendChild(body);
    }
    area.appendChild(card);
  }
}

// ── Gaps Tab ──────────────────────────────────────────────────────────────────
function renderGapsTab() {
  const area=document.getElementById('__g8gptgaps__'); if(!area)return; area.innerHTML='';
  if (!currentGaps.length) { area.innerHTML='<div style="color:#1e293b;font-size:10px;padding:16px;text-align:center">No gaps detected yet.</div>'; return; }
  const total=currentGaps.length,open=currentGaps.filter(g=>!g._closed).length;
  const driftScore=total>0?open/total:0;
  area.innerHTML=`<div class="gg-drift"><span style="font-size:.65rem;color:#475569">Drift</span><div class="gg-dbar"><div class="gg-dfill" style="width:${(driftScore*100).toFixed(0)}%"></div></div><span style="font-size:.7rem;font-weight:700;color:#f472b6;width:32px;text-align:right">${(driftScore*100).toFixed(0)}%</span></div>`;
  for (const g of currentGaps) {
    const col=g.score>0.7?'#ef4444':g.score>0.4?'#f59e0b':'#f472b6';
    const row=document.createElement('div');row.className='gg-row';
    row.innerHTML=`<span class="gg-type" style="color:${col}">${g.type||'—'}</span><span class="gg-domain">${g.domain||'—'}</span><span class="gg-reason">${g.reason||'—'}</span><span class="gg-desc" title="${escHtml(g.description||'')}">${escHtml(g.description||'')}</span><span class="gg-score" style="color:${col}">${((g.score||0)*100).toFixed(0)}%</span>`;
    area.appendChild(row);
  }
}

// ── PA Tab ────────────────────────────────────────────────────────────────────
function renderPATab() {
  const area=document.getElementById('__g8gptpa__'); if(!area)return; area.innerHTML='';
  const session=pa.session;
  if (!session||!session.chunks.length) { area.innerHTML='<div style="color:#1e293b;font-size:10px;padding:16px;text-align:center">No PA session active.</div>'; return; }
  const elapsed=session.chunks.length>1?(session.chunks.at(-1).t-session.chunks[0].t)/1000:0;
  const tps=elapsed>0?(session.totalTokens/elapsed).toFixed(1):'—';
  const {pauses}=detectBurstsAndPauses(session);
  const avgH=session.entropyHistory.length>0?(session.entropyHistory.reduce((a,b)=>a+b,0)/session.entropyHistory.length).toFixed(2):'—';
  area.innerHTML=`<div class="pa-mets"><div class="pa-met"><div class="pa-mv">${session.totalTokens}</div><div class="pa-ml">Tokens</div></div><div class="pa-met"><div class="pa-mv">${tps}</div><div class="pa-ml">Tok/s</div></div><div class="pa-met"><div class="pa-mv">${pauses.length}</div><div class="pa-ml">Pauses</div></div><div class="pa-met"><div class="pa-mv">${avgH}</div><div class="pa-ml">Entropy</div></div></div>`;
  const canvas=document.createElement('canvas');canvas.className='pa-canvas';canvas.id='__g8pacanvas__';canvas.width=400;canvas.height=64;area.appendChild(canvas);
  drawWaveform(session,canvas);
  const hyps=session.hypotheses||[];
  if (hyps.length) { const hl=document.createElement('div');hl.style.cssText='font-size:.62rem;color:#334155;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px';hl.textContent='Hypotheses';area.appendChild(hl);for(const h of hyps){const hd=document.createElement('div');hd.className='pa-hyp';hd.innerHTML=`<div class="pa-hl">${escHtml(h.label)}</div><div class="pa-hc">${((h.confidence||0)*100).toFixed(0)}% confidence</div><div class="pa-bar"><div class="pa-barf" style="width:${((h.confidence||0)*100)}%"></div></div><div style="color:#334155;font-size:.6rem">${(h.evidence||[]).join(' · ')}</div>`;area.appendChild(hd);} }
}

function drawWaveform(session,canvas) {
  if (!canvas||session.chunks.length<2) return;
  const ctx=canvas.getContext('2d'),W=canvas.width,H=canvas.height;
  ctx.clearRect(0,0,W,H);
  const velocities=[]; for(let i=1;i<session.chunks.length;i++){const dt=session.chunks[i].t-session.chunks[i-1].t;velocities.push(dt>0?(session.chunks[i].tokens/dt)*1000:0);}
  if (velocities.length<2) return;
  const maxV=Math.max(...velocities,1),step=W/velocities.length;
  const grad=ctx.createLinearGradient(0,0,0,H);grad.addColorStop(0,'rgba(99,102,241,.6)');grad.addColorStop(1,'rgba(99,102,241,.04)');
  ctx.beginPath();ctx.moveTo(0,H);velocities.forEach((v,i)=>ctx.lineTo(i*step,H-(v/maxV)*(H-4)));ctx.lineTo(velocities.length*step,H);ctx.closePath();ctx.fillStyle=grad;ctx.fill();
  ctx.beginPath();ctx.strokeStyle='#818cf8';ctx.lineWidth=1.5;velocities.forEach((v,i)=>{const x=i*step,y=H-(v/maxV)*(H-4);i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);});ctx.stroke();
}

// ── Settings Tab ──────────────────────────────────────────────────────────────
const SETTING_META = [
  {key:'session_greeting_enabled',label:'Session Greeting',type:'toggle',desc:'Auto-inject greeting on new blank chats'},
  {key:'session_greeting_text',label:'Greeting Text',type:'textarea',desc:'Injected into blank chats — model names the session'},
  {key:'scan_debounce_ms',label:'DOM Scan Debounce',type:'range',min:200,max:5000,step:100,unit:'ms',desc:'Delay after DOM mutations before scanning'},
  {key:'artifact_max',label:'Artifact Store Limit',type:'range',min:50,max:2000,step:50,unit:'',desc:'Max artifacts kept in memory'},
  {key:'gap_min_score',label:'Gap Min Score',type:'range',min:0,max:1,step:0.05,unit:'',desc:'Minimum gap magnitude to record'},
  {key:'pa_enabled',label:'Prompt Archaeology',type:'toggle',desc:'Enable chunk collection and PA waveform analysis'},
  {key:'memory_auto_push',label:'Auto Memory Push',type:'toggle',desc:'Auto-POST artifacts to memory server'},
  {key:'greeting_delay_ms',label:'Greeting Delay',type:'range',min:400,max:5000,step:100,unit:'ms',desc:'Wait before injecting greeting'},
  {key:'poll_interval_ms',label:'Response Poll Interval',type:'range',min:100,max:2000,step:50,unit:'ms',desc:'How often to check for new response content'},
  {key:'stable_count_threshold',label:'Stable Threshold',type:'range',min:2,max:15,step:1,unit:'',desc:'Polls with no change before job marked complete'},
  {key:'stream_log_level',label:'SISO Log Level',type:'select',options:['OFF','EVENTS','DEEP','DATA'],desc:'SISO event bus verbosity'},
  {key:'rebuild_from_server',label:'Rebuild From Server',type:'toggle',desc:'On next init: wipe local state and reload from JAA'},
];

function renderSettingsTab() {
  const area=document.getElementById('__g8gptsettings__'); if(!area)return; area.innerHTML='';
  // Tab claim card
  const claimCard=document.createElement('div');claimCard.className='gs-card';
  claimCard.innerHTML=`<div class="gs-key">tab_claim</div><div class="gs-label">Tab Claim</div><div class="gs-desc">Only claimed tabs receive and execute jobs</div><div style="display:flex;align-items:center;gap:8px"><span style="font-size:.7rem;color:${isClaimed?'#22c55e':'#475569'}">${isClaimed?'CLAIMED':'PASSIVE'}</span><button onclick="isClaimed?releaseTab():claimTab();renderSettingsTab()" style="background:none;border:1px solid rgba(255,255,255,.1);color:#475569;border-radius:3px;padding:2px 8px;font-size:.68rem;cursor:pointer;font-family:inherit">${isClaimed?'Release':'Claim'}</button></div>`;
  area.appendChild(claimCard);
  for (const m of SETTING_META) {
    const val=CFG[m.key];const card=document.createElement('div');card.className='gs-card';
    card.innerHTML=`<div class="gs-key">${m.key}</div><div class="gs-label">${m.label}</div><div class="gs-desc">${m.desc}</div>`;
    let ctrl;
    if (m.type==='toggle') {
      const wrap=document.createElement('div');wrap.style.cssText='display:flex;align-items:center;gap:6px';
      const lbl=document.createElement('label');lbl.className='gs-tgl';const inp=document.createElement('input');inp.type='checkbox';inp.checked=!!val;
      const sl=document.createElement('span');sl.className='gs-tsl';lbl.append(inp,sl);
      const vl=document.createElement('span');vl.style.cssText='font-size:.7rem;color:#475569';vl.textContent=val?'ON':'OFF';
      inp.onchange=async(e)=>{CFG[m.key]=e.target.checked;vl.textContent=e.target.checked?'ON':'OFF';const r=await gate('saveSetting',()=>apiPut('/settings/'+m.key,{value:e.target.checked?'true':'false'}),{toastOnFail:true});if(r.ok)toast(`${m.label}: ${e.target.checked?'ON':'OFF'}`,'success',1500);};
      wrap.append(lbl,vl);ctrl=wrap;
    } else if (m.type==='range') {
      const wrap=document.createElement('div');const vl=document.createElement('span');vl.style.cssText='font-size:.7rem;color:#6366f1;float:right';vl.textContent=val+(m.unit||'');
      const inp=document.createElement('input');inp.type='range';inp.min=m.min;inp.max=m.max;inp.step=m.step;inp.value=val;
      inp.oninput=e=>{vl.textContent=e.target.value+(m.unit||'');};
      inp.onchange=async(e)=>{CFG[m.key]=Number(e.target.value);const r=await gate('saveSetting',()=>apiPut('/settings/'+m.key,{value:e.target.value}),{toastOnFail:true});if(r.ok)toast(`${m.label}: ${e.target.value}${m.unit||''}`,'success',1500);};
      wrap.append(vl,inp);ctrl=wrap;
    } else if (m.type==='select') {
      const inp=document.createElement('select');for(const opt of(m.options||[])){const o=document.createElement('option');o.value=opt;o.textContent=opt;if(opt===val)o.selected=true;inp.appendChild(o);}
      inp.onchange=async(e)=>{CFG[m.key]=e.target.value;const r=await gate('saveSetting',()=>apiPut('/settings/'+m.key,{value:e.target.value}),{toastOnFail:true});if(r.ok)toast(`${m.label}: ${e.target.value}`,'success',1500);};ctrl=inp;
    } else if (m.type==='textarea') {
      const inp=document.createElement('textarea');inp.value=val||'';inp.onchange=async(e)=>{CFG[m.key]=e.target.value;await gate('saveSetting',()=>apiPut('/settings/'+m.key,{value:e.target.value}),{toastOnFail:true});};ctrl=inp;
    }
    if (ctrl) card.appendChild(ctrl);
    area.appendChild(card);
  }
  const resetBtn=document.createElement('button');resetBtn.className='gs-save';resetBtn.textContent='↺ Reset all to defaults';
  resetBtn.onclick=async()=>{if(confirm('Reset all settings?')){const r=await gate('resetSettings',()=>apiPost('/settings/reset',{}),{toastOnFail:true});if(r.ok){await loadSettings();renderSettingsTab();toast('Settings reset','success');}}};
  area.appendChild(resetBtn);
}

// ── API Tab ───────────────────────────────────────────────────────────────────
function renderApiTab() {
  const area=document.getElementById('__g8gptapi__'); if(!area)return; area.innerHTML='';
  function gsec(label){const d=document.createElement('div');d.style.cssText='margin-bottom:12px';const l=document.createElement('div');l.style.cssText='font-size:.65rem;color:#334155;text-transform:uppercase;letter-spacing:.1em;font-weight:700;margin-bottom:5px';l.textContent=label;d.appendChild(l);area.appendChild(d);return d;}
  function gcard(parent,title,val,cls=''){const c=document.createElement('div');c.className='gapi-card';c.innerHTML=`<div class="gapi-t">${escHtml(title)}</div><div class="gapi-v ${cls}">${escHtml(val)}</div>`;parent.appendChild(c);}
  const idSec=gsec('Identity');gcard(idSec,'Account',getAccount()||'—');gcard(idSec,'Chat ID',chatIdFromUrl());gcard(idSec,'Tab ID',MY_TAB_ID.slice(-12));gcard(idSec,'Provider',PROVIDER+' v'+VERSION);
  const claimSec=gsec('Tab Claim');
  const sc=document.createElement('div');sc.className='gapi-card';sc.innerHTML=`<div class="gapi-t">Claim Status</div><div class="gapi-v ${isClaimed?'ok':''}">${isClaimed?'CLAIMED — will receive jobs':'PASSIVE — jobs ignored'}</div>`;claimSec.appendChild(sc);
  const cBtn=document.createElement('button');cBtn.className='gapi-btn';cBtn.textContent=isClaimed?'Release tab':'Claim tab';cBtn.onclick=()=>{if(isClaimed)releaseTab();else claimTab();renderApiTab();};claimSec.appendChild(cBtn);
  const agSec=gsec('Agent Polling');
  const stCard=document.createElement('div');stCard.className='gapi-card';stCard.innerHTML=`<div class="gapi-t">Status</div><div class="gapi-v" id="__g8api_status__" style="color:${agentEndpointActive?'#34d399':'#475569'}">${agentEndpointActive?'● ACTIVE':'○ INACTIVE'}</div>`;agSec.appendChild(stCard);
  const tBtn=document.createElement('button');tBtn.className='gapi-btn'+(agentEndpointActive?' on':'');tBtn.textContent=agentEndpointActive?'⏹ Stop':'▶ Start';tBtn.onclick=()=>{if(agentEndpointActive)stopAgentEndpointPolling();else startAgentEndpointPolling();renderApiTab();};agSec.appendChild(tBtn);
  const ckBtn=document.createElement('button');ckBtn.className='gapi-btn';ckBtn.textContent='⬡ Cockpit';ckBtn.onclick=()=>window.open('http://127.0.0.1:7820/cockpit','_blank');agSec.appendChild(ckBtn);
  const seamSec=gsec('SEAM State');
  const stotal=seamState.chunks.length,sver=seamState.chunks.filter(c=>c.status==='verified').length;
  gcard(seamSec,'Progress',`${sver}/${stotal} chunks (${stotal?Math.round(sver/stotal*100):0}%)`);gcard(seamSec,'Spec title',seamState.specTitle||'Untitled');gcard(seamSec,'Auto-inject',seamAutoInject?'ON':'OFF');
  const evSec=gsec(`Event Log (${EVENT_LOG.length})`);
  const exBtn=document.createElement('button');exBtn.className='gapi-btn';exBtn.textContent='↓ Export Events';exBtn.onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(EVENT_LOG,null,2)],{type:'application/json'}));a.download=`guardian-events-${Date.now()}.json`;a.click();};evSec.appendChild(exBtn);
  const last5=EVENT_LOG.slice(-5).reverse();for(const ev of last5){const r=document.createElement('div');r.style.cssText='font-size:.65rem;color:#334155;padding:2px 0;border-bottom:1px solid #1e1e3a';r.textContent=`${fts(ev.ts)} ${ev.type}`;evSec.appendChild(r);}
}

// ── WebSocket ─────────────────────────────────────────────────────────────────
function updateFooter() { const el=document.getElementById('__g8gptfooter__');if(!el)return;const e=Math.round((Date.now()-sessionStartTime)/1000);el.textContent=`${getAccount().slice(0,20)} · ${Math.floor(e/60)}m ${e%60}s · ~${sessionTokenTotal.toLocaleString()} tok`; }
function sendToServer(obj) { if (ws&&ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify(obj)); }

function connect() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer=null; }
  setConnState('connecting'); addLog('info','Connecting…',WS_URL);
  ws = new WebSocket(WS_URL);
  ws.onopen = () => {
    setConnState('handshaking');
    ws.send(JSON.stringify({ type:'GUARDIAN_REGISTER', provider:PROVIDER, host:location.hostname, tabId:MY_TAB_ID, claimed:amIClaimed() }));
    hb = setInterval(() => sendToServer({ type:'GUARDIAN_HEARTBEAT', provider:PROVIDER, tabId:MY_TAB_ID, ts:Date.now() }), HB_INTERVAL);
    evLog('ws.open', { url:WS_URL });
  };
  ws.onmessage = (e) => {
    let msg; try { msg=JSON.parse(e.data); } catch { addLog('err','Invalid WS message'); return; }
    evLog('ws.message', { type:msg.type });
    switch (msg.type) {
      case 'GUARDIAN_READY':
        setConnState('ready');
        addLog('ok', `Ready · ${msg.provider||PROVIDER}`);
        toast('Guardian ready ✓', 'success', 2000);
        ledgerRecord('EVENT', `Connected · ${msg.provider||PROVIDER}`);
        evLog('guardian.ready', { provider:msg.provider });
        tryAutoClaimIfNoneActive();
        startDOMObserver(); interceptDownloads();
        setTimeout(() => { getAccount(); updateFooter(); }, 500);
        setInterval(updateFooter, 30000); setTimeout(scanDOM, 500);
        setTimeout(() => { const id=chatIdFromUrl(); if(id&&id!=='home'&&isChatBlank()) sendGreeting(id); }, 2000);
        break;
      case 'GUARDIAN_CLAIM':
        if (msg.tabId===MY_TAB_ID||msg.tabId==='any') { claimTab(); sendToServer({type:'GUARDIAN_CLAIM_ACK',tabId:MY_TAB_ID,provider:PROVIDER}); }
        break;
      case 'GUARDIAN_RELEASE':
        if (msg.tabId===MY_TAB_ID||msg.tabId==='any') { releaseTab(); addLog('info','Tab released'); }
        break;
      case 'GUARDIAN_JOB':
        evLog('ws.job.received', { jobId:msg.jobId, command:msg.command });
        handleJob(msg);
        break;
      case 'GUARDIAN_SESSION_NAMED':
        addLog('ok', `Session: ${msg.sessionName||'unnamed'}`);
        break;
      case 'GUARDIAN_HEARTBEAT_ACK':
        break;
      default:
        addLog('in', `← ${msg.type}`, JSON.stringify(msg).slice(0,80));
        evLog('ws.unhandled', { type:msg.type });
    }
  };
  ws.onclose = (e) => {
    clearInterval(hb); setConnState('disconnected');
    addLog('err', `Disconnected (${e.code})`, `Reconnecting in ${RECONNECT_MS/1000}s…`);
    toast(`WS disconnected (${e.code}) — reconnecting`, 'error', 4000);
    evLog('ws.close', { code:e.code, reason:e.reason });
    if (currentJobId) stopWatch();
    reconnectTimer = setTimeout(connect, RECONNECT_MS);
  };
  ws.onerror = () => {
    setConnState('disconnected'); addLog('err','WebSocket error');
    toast('WebSocket error', 'error', 3000);
    evLog('ws.error', {});
  };
}

// SEAM BroadcastChannel listener
seamChannel.onmessage = (e) => {
  const { type, idx } = e.data || {};
  evLog('seam.channel.message', { type, idx });
  if (type==='chunk_verified'&&idx!=null) { seamLoadState(); if(activeTab==='seam') renderSeamTab(); }
  if (type==='state_updated') { seamLoadState(); if(activeTab==='seam') renderSeamTab(); }
};

// ══════════════════════════════════════════════════════════════════════════════
// QUEUE MODULE — Detector + QueueCompartment + JobQueue
// ══════════════════════════════════════════════════════════════════════════════

const Detector = {
  profile(chunk) {
    const lines = chunk.split('\n'), words = chunk.match(/\b\w+\b/g)||[];
    const codeBlocks = (chunk.match(/```/g)||[]).length / 2;
    return {
      words: words.length, chars: chunk.length,
      codeBlocks: Math.ceil(codeBlocks),
      headers: lines.filter(l=>/^#{1,4}\s/.test(l)).length,
      musts: (chunk.match(/\b(MUST|REQUIRED|SHALL|CRITICAL)\b/g)||[]).length,
      hasSeamContract: /SEAM CONTRACT|SEAM VERDICT/i.test(chunk),
      minResponseChars: Math.max(200, chunk.length * 0.4),
      maxResponseChars: chunk.length * 8,
    };
  },
  truncation(response, profile) {
    if (!response || response.length < 40) return { truncated:true, score:1.0, reason:'empty_or_tiny' };
    const lines = response.trim().split('\n'), last = lines[lines.length-1]?.trim()||'';
    if (last.length > 0 && !last.match(/[.!?:)\]'"»]$/) && last.length < 80)
      return { truncated:true, score:0.85, reason:'mid_sentence_end' };
    if (response.length < profile.minResponseChars) {
      const ratio = response.length / profile.minResponseChars;
      return { truncated:true, score:parseFloat((1-ratio).toFixed(3)), reason:'too_short', ratio };
    }
    if (profile.hasSeamContract && !/SEAM VERDICT/i.test(response))
      return { truncated:true, score:0.75, reason:'missing_seam_verdict' };
    return { truncated:false, score:0 };
  },
  sigma(response, profile) {
    const signals = []; let score = 0;
    const gotCodeBlocks = (response.match(/```/g)||[]).length / 2;
    if (profile.codeBlocks > 0 && gotCodeBlocks === 0) { signals.push({type:'missing_code_blocks',expected:profile.codeBlocks,got:0}); score+=0.3; }
    const ratio = response.length / Math.max(1, profile.chars);
    if (ratio < 0.3) { signals.push({type:'too_short',ratio}); score+=0.25; }
    const words = response.toLowerCase().match(/\b\w+\b/g)||[];
    const ld = words.length > 5 ? new Set(words).size/words.length : 1;
    if (ld < 0.25 && words.length > 100) { signals.push({type:'low_lexical_diversity',ld}); score+=0.2; }
    const hedgeRate = words.length > 0 ? (response.match(/\b(might|may|could|perhaps|possibly|seems|appears)\b/gi)||[]).length/words.length : 0;
    if (hedgeRate > 0.08) { signals.push({type:'high_hedge_rate',hedgeRate:parseFloat(hedgeRate.toFixed(3))}); score+=0.15; }
    if (profile.musts > 2) {
      const addressed = (response.match(/\b(implement|complete|done|added|created|built|resolved)\b/gi)||[]).length;
      if (addressed === 0) { signals.push({type:'mandatory_reqs_unaddressed',musts:profile.musts}); score+=0.2; }
    }
    return { score:parseFloat(Math.min(1,score).toFixed(3)), signals, deviating:score>=0.4 };
  },
  delta(response, chunkContent, axioms=[]) {
    const issues = []; let score = 0;
    for (const axiom of axioms) {
      if (axiom.startsWith('!')) {
        const pat = axiom.slice(1);
        if (response.toLowerCase().includes(pat.toLowerCase())) { issues.push({axiom,type:'axiom_violation',detail:`Forbidden: "${pat}"`}); score+=0.35; }
      } else {
        if (!response.toLowerCase().includes(axiom.toLowerCase())) { issues.push({axiom,type:'axiom_missing',detail:`Required: "${axiom}"`}); score+=0.2; }
      }
    }
    const kws = [
      ...(chunkContent.match(/`([^`]{2,40})`/g)||[]).map(m=>m.replace(/`/g,'')),
      ...(chunkContent.match(/\b([A-Z][a-zA-Z]{3,}(?:Store|Client|Engine|Manager|Service|Handler|Router|Bus))\b/g)||[]),
    ].filter((v,i,a)=>a.indexOf(v)===i).slice(0,20);
    const missing = kws.filter(kw=>!response.includes(kw)).length;
    if (kws.length > 0 && missing/kws.length > 0.6) { issues.push({type:'keyword_coverage_low',missingRate:parseFloat((missing/kws.length).toFixed(2)),total:kws.length}); score+=(missing/kws.length)*0.3; }
    const stubs = (response.match(/\bTODO\b|\bFIXME\b|\/\/ stub|throw new Error\(['"]not implemented/gi)||[]).length;
    if (stubs > 0) { issues.push({type:'stubs_in_response',count:stubs}); score+=Math.min(0.4,stubs*0.12); }
    return { score:parseFloat(Math.min(1,score).toFixed(3)), issues, deviating:score>=0.35 };
  },
  evaluate(response, chunkContent, profile, axioms=[]) {
    const trunc = Detector.truncation(response, profile);
    const sig   = Detector.sigma(response, profile);
    const delt  = Detector.delta(response, chunkContent, axioms);
    const composite = parseFloat((trunc.score*0.5 + sig.score*0.3 + delt.score*0.2).toFixed(3));
    const passed = composite < 0.35 && !trunc.truncated;
    return {
      passed, composite, truncation:trunc, sigma:sig, delta:delt,
      summary: passed ? `Δ=${composite} — accepted`
        : `Δ=${composite} — ${trunc.truncated?'TRUNCATED:'+trunc.reason:sig.deviating?'SIGMA:'+sig.signals.map(s=>s.type).join(','):'DELTA:'+delt.issues.map(i=>i.type).join(',')}`,
    };
  },
};

class QueueCompartment {
  constructor({ id, queueId, chunkIdx, chunkContent, chunkTitle, prompt, provider, axioms=[], total }) {
    this.id=id||(Date.now().toString(36)+Math.random().toString(36).slice(2,6));
    this.queueId=queueId; this.chunkIdx=chunkIdx; this.chunkTitle=chunkTitle;
    this.chunkContent=chunkContent; this.prompt=prompt; this.provider=provider;
    this.axioms=axioms; this.total=total;
    this.state='QUEUED'; this.retries=0; this.maxRetries=3;
    this.jobId=null; this.response=null; this.detection=null;
    this.failureLog=[]; this.createdAt=Date.now(); this.updatedAt=Date.now();
    this.profile=Detector.profile(chunkContent);
  }
  patch(u){ Object.assign(this,u,{updatedAt:Date.now()}); }
  buildRetryPrompt() {
    const last=this.failureLog[this.failureLog.length-1];
    if(!last)return this.prompt;
    const det=last.detection;
    return [
      `[FAILURE REPORT — attempt ${last.attempt}/${this.maxRetries}]`,
      `Detection score: ${det.composite} (threshold: 0.35)`,
      det.truncation.truncated ? `Truncation: ${det.truncation.reason}` : '',
      det.sigma.deviating ? `Sigma: ${det.sigma.signals.map(s=>s.type).join(', ')}` : '',
      det.delta.deviating ? `Delta: ${det.delta.issues.map(i=>i.type+': '+i.detail).join(', ')}` : '',
      '',`[FAILED RESPONSE (first 600 chars)]`,
      (last.response||'').slice(0,600)+(last.response?.length>600?'\n...[truncated]':''),
      '',`[RETRY — address all issues above, end with SEAM VERDICT: PASS or FAIL]`,'',
      this.prompt,
    ].filter(Boolean).join('\n');
  }
  toJSON(){return{id:this.id,queueId:this.queueId,chunkIdx:this.chunkIdx,chunkTitle:this.chunkTitle,provider:this.provider,state:this.state,retries:this.retries,maxRetries:this.maxRetries,jobId:this.jobId,composite:this.detection?.composite,failureCount:this.failureLog.length,createdAt:this.createdAt,updatedAt:this.updatedAt};}
}

class JobQueue {
  constructor(){
    this.queues=new Map(); this.active=new Map(); this.pending=[];
    this.running=false; this._IDEARIUM='http://127.0.0.1:4800';
  }
  createQueue({title,chunks,provider,axioms=[],ideaId=null}){
    const queueId=Date.now().toString(36)+Math.random().toString(36).slice(2,5);
    const comps=chunks.map((c,i)=>new QueueCompartment({
      id:`${queueId}_${i}`,queueId,chunkIdx:i,chunkContent:c.content,
      chunkTitle:c.title,prompt:c.builtPrompt||c.content,provider,axioms,total:chunks.length,
    }));
    this.queues.set(queueId,{id:queueId,title,ideaId,provider,total:chunks.length,compartments:comps,createdAt:Date.now(),completedAt:null});
    this.pending.push(...comps);
    addLog('ok',`Queue: "${title}" — ${chunks.length} compartments`,queueId.slice(0,8));
    toast(`Queue "${title}" — ${chunks.length} chunks`,'success');
    evLog('queue.created',{queueId,title,total:chunks.length,provider});
    this._pushProgress(queueId,comps[0],'QUEUED');
    return queueId;
  }
  async onResponse(jobId,responseText){
    const comp=[...this.active.values()].find(c=>c.jobId===jobId);
    if(!comp)return;
    this._gate(comp,'DETECTING');
    const result=Detector.evaluate(responseText,comp.chunkContent,comp.profile,comp.axioms);
    comp.patch({detection:result,response:responseText});
    evLog('queue.detect',{compartmentId:comp.id,chunkIdx:comp.chunkIdx,composite:result.composite,passed:result.passed,summary:result.summary});
    if(result.passed){
      this._gate(comp,'VERIFIED');
      addLog('ok',`Queue ✓ chunk ${comp.chunkIdx+1}/${comp.total}`,`${comp.chunkTitle} Δ=${result.composite}`);
      toast(`✓ Chunk ${comp.chunkIdx+1} verified (Δ=${result.composite})`,'success');
      this.active.delete(comp.id);
      this._checkComplete(comp.queueId);
      this._next();
    }else{
      this._fail(comp,result,responseText);
    }
  }
  start(){ if(!this.running){this.running=true;this._next();} }
  pause(){ this.running=false; }
  resume(){ this.running=true; this._next(); }
  stats(queueId){
    const q=this.queues.get(queueId); if(!q)return null;
    const cs=q.compartments;
    return{total:cs.length,verified:cs.filter(c=>c.state==='VERIFIED').length,failed:cs.filter(c=>c.state==='FAILED').length,escalated:cs.filter(c=>c.state==='ESCALATED').length,retrying:cs.filter(c=>c.state==='RETRYING').length,active:cs.filter(c=>['INJECTING','GENERATING','DETECTING'].includes(c.state)).length,queued:cs.filter(c=>c.state==='QUEUED').length,pct:Math.round(cs.filter(c=>c.state==='VERIFIED').length/cs.length*100)};
  }
  getAll(){ return [...this.queues.values()]; }
  _gate(comp,state){
    const prev=comp.state; comp.patch({state});
    evLog('queue.gate',{compartmentId:comp.id,from:prev,to:state,chunkIdx:comp.chunkIdx});
    this._pushProgress(comp.queueId,comp,state);
    sendToServer({type:'GUARDIAN_QUEUE_EVENT',compartmentId:comp.id,queueId:comp.queueId,chunkIdx:comp.chunkIdx,chunkTitle:comp.chunkTitle,from:prev,to:state,ts:Date.now()});
    if(activeTab==='queue')renderQueueTab();
  }
  async _next(){
    if(!this.running||this.active.size>0)return;
    const comp=this.pending.shift(); if(!comp)return;
    this._gate(comp,'INJECTING');
    this.active.set(comp.id,comp);
    const prompt=comp.retries>0?comp.buildRetryPrompt():comp.prompt;
    const ok=injectText(prompt);
    if(!ok){
      toast(`Inject failed — chunk ${comp.chunkIdx+1}`,'error',4000);
      evLog('queue.inject.fail',{compartmentId:comp.id});
      this._fail(comp,{composite:1,passed:false,truncation:{truncated:true,reason:'inject_failed'},sigma:{score:0,signals:[]},delta:{score:0,issues:[]},summary:'inject_failed'},'');
      return;
    }
    comp.patch({jobId:currentJobId||'pending'});
    this._gate(comp,'GENERATING');
    const label=`${comp.chunkTitle.slice(0,30)}${comp.retries?` [retry ${comp.retries}]`:''}`;
    addLog('job',`Queue → chunk ${comp.chunkIdx+1}/${comp.total}`,label);
    toast(`↗ Chunk ${comp.chunkIdx+1}/${comp.total}: ${label}`,'job');
    setTimeout(submit,500);
  }
  _fail(comp,detection,responseText){
    comp.failureLog.push({attempt:comp.retries+1,response:responseText,detection,ts:Date.now()});
    comp.patch({detection,state:'FAILED'});
    evLog('queue.fail',{compartmentId:comp.id,chunkIdx:comp.chunkIdx,detection,attempt:comp.retries+1});
    addLog('err',`Queue ✗ chunk ${comp.chunkIdx+1}`,detection.summary);
    if(comp.retries<comp.maxRetries){
      comp.patch({retries:comp.retries+1});
      this._gate(comp,'RETRYING');
      toast(`↺ Retry ${comp.retries}/${comp.maxRetries} — chunk ${comp.chunkIdx+1}: ${detection.summary.slice(0,50)}`,'warn',5000);
      this.active.delete(comp.id);
      this.pending.unshift(comp);
      setTimeout(()=>this._next(),1800);
    }else{
      this._gate(comp,'ESCALATED');
      addLog('err',`Queue ESCALATED chunk ${comp.chunkIdx+1} — ${comp.maxRetries} retries exhausted`,comp.chunkTitle);
      toast(`⚠ Chunk ${comp.chunkIdx+1} escalated after ${comp.maxRetries} retries`,'error',8000);
      evLog('queue.escalated',{compartmentId:comp.id,chunkIdx:comp.chunkIdx,failures:comp.failureLog.map(f=>({attempt:f.attempt,summary:f.detection.summary}))});
      this._escalateGap(comp);
      this.active.delete(comp.id);
      this._next();
    }
  }
  _checkComplete(queueId){
    const q=this.queues.get(queueId); if(!q)return;
    if(!q.compartments.every(c=>['VERIFIED','ESCALATED'].includes(c.state)))return;
    q.completedAt=Date.now();
    const s=this.stats(queueId);
    addLog('ok',`Queue complete: "${q.title}" — ${s.verified}/${s.total} verified, ${s.escalated} escalated`);
    toast(`Queue "${q.title}" complete — ${s.pct}% verified`,s.escalated>0?'warn':'success',5000);
    evLog('queue.complete',{queueId,title:q.title,stats:s});
    this._pushProgress(queueId,null,'COMPLETE',s);
  }
  async _pushProgress(queueId,comp,state,extraStats=null){
    const q=this.queues.get(queueId); if(!q)return;
    const s=extraStats||this.stats(queueId)||{};
    const payload={queueId,state,title:q.title,...s,compartment:comp?comp.toJSON():null,ts:Date.now()};
    if(q.ideaId){fetch(`http://127.0.0.1:4800/api/ideas/${q.ideaId}/progress`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}).catch(()=>{});}
    fetch(`http://127.0.0.1:4800/api/queue/${queueId}/progress`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}).catch(()=>{});
  }
  async _escalateGap(comp){
    fetch('http://127.0.0.1:4800/api/gaps',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:`[ESCALATED] Chunk ${comp.chunkIdx+1}: ${comp.chunkTitle}`,pressure:0.9,status:'open',tags:['queue-escalated','human-review'],description:[`Queue: ${comp.queueId}`,`Chunk ${comp.chunkIdx+1}/${comp.total}`,`Retries: ${comp.retries}/${comp.maxRetries}`,`Detection: ${comp.failureLog.at(-1)?.detection?.summary||'—'}`].join('\n')})}).catch(()=>{});
  }
}

// ── Queue singleton ───────────────────────────────────────────────────────────
const jobQueue = new JobQueue();

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  buildUI();
  await loadSettings();
  seamLoadState();
  jobQueue.start();
  connect();
  startNavigationWatcher();
  switchTab('log');
  addLog('sys', `Guardian v${VERSION} — chatgpt — Queue+SEAM+GapHunter v3+PA+TabClaim+Gates+Toasts`);
  toast(`Guardian v${VERSION} loaded`, 'info', 2500);
  evLog('guardian.init', { version:VERSION, provider:PROVIDER });
  setInterval(loadSettings, 60000);
}

if (document.readyState==='complete') setTimeout(init, 500);
else window.addEventListener('load', () => setTimeout(init, 500));

})();
