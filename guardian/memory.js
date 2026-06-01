/**
 * guardian-memory.js — Guardian Memory & Storage System  v1.0.0
 *
 * A persistent, queryable memory layer for the entire NEXUS/ALK/Guardian ecosystem.
 *
 * HTTP on :7823 (default) — LAN-accessible (0.0.0.0)
 * All data stored to flat JSON files under ./memory_store/
 *
 * What it stores:
 *   - Artifacts (code blocks, Claude outputs, TypeScript, HTML, etc.)
 *   - Sessions  (per-chat context bundles)
 *   - Ledger    (all Guardian events across sessions)
 *   - Downloads (file download events)
 *   - Jobs      (mirrored from guardian server)
 *   - Context   (full "what was happening" snapshots)
 *
 * Any system can:
 *   POST /ingest           — push any event or artifact
 *   GET  /artifacts        — list all captured artifacts (filterable)
 *   GET  /artifacts/:hash  — get one artifact by hash
 *   GET  /query            — full-text search across all memory
 *   GET  /context          — full context bundle (current+history)
 *   GET  /sessions         — list sessions
 *   GET  /ledger           — event ledger
 *   GET  /downloads        — detected downloads
 *   POST /artifacts        — manually push an artifact
 *   DELETE /artifacts/:hash — remove an artifact
 *   GET  /stats            — memory store stats
 *   GET  /health           — uptime + counts
 *   GET  /                 — dashboard UI
 *
 * NEXUS/ALK integration:
 *   POST /ingest  { type: 'ARTIFACT', payload: {...} }
 *   POST /ingest  { type: 'LEDGER', payload: {...} }
 *   POST /ingest  { type: 'JOB_COMPLETE', payload: {...} }
 *   etc.
 */

'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { randomUUID } = require('crypto');

// ── Config ────────────────────────────────────────────────────────────────────

const PORT      = process.env.MEMORY_PORT || 7823;
const HOST      = '0.0.0.0';  // LAN accessible
const STORE_DIR = process.env.MEMORY_STORE_DIR || path.join(__dirname, 'memory_store');
const MAX_ARTIFACTS = 10000;
const MAX_LEDGER    = 5000;
const MAX_SESSIONS  = 200;

// ── Ensure store directory ────────────────────────────────────────────────────

if (!fs.existsSync(STORE_DIR)) fs.mkdirSync(STORE_DIR, { recursive: true });

// ── Persistence helpers ───────────────────────────────────────────────────────

function storeFile(name) { return path.join(STORE_DIR, `${name}.json`); }

function loadStore(name, fallback = []) {
  try {
    const f = storeFile(name);
    if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch (e) { console.error(`[memory] loadStore(${name}) error: ${e.message}`); }
  return fallback;
}

function saveStore(name, data) {
  try { fs.writeFileSync(storeFile(name), JSON.stringify(data), 'utf8'); }
  catch (e) { console.error(`[memory] saveStore(${name}) error: ${e.message}`); }
}

// ── In-memory stores (warm from disk on start) ────────────────────────────────

let artifacts = loadStore('artifacts', []);
let ledger    = loadStore('ledger',    []);
let sessions  = loadStore('sessions',  []);
let downloads = loadStore('downloads', []);
let jobs      = loadStore('jobs',      []);
let contexts  = loadStore('contexts',  []);

console.log(`[memory] Loaded: ${artifacts.length} artifacts, ${ledger.length} ledger entries, ${sessions.length} sessions`);

// Debounced save
const saveTimers = {};
function debounceSave(name, data, delay = 2000) {
  clearTimeout(saveTimers[name]);
  saveTimers[name] = setTimeout(() => saveStore(name, data), delay);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = ((h << 5) - h) + str.charCodeAt(i); h |= 0; }
  return Math.abs(h).toString(16).slice(0, 8);
}

function getLocalIPs() {
  const ifaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) ips.push({ name, address: iface.address });
    }
  }
  return ips;
}

function fmtSize(bytes) {
  if (bytes < 1024)      return bytes + ' B';
  if (bytes < 1024**2)   return (bytes/1024).toFixed(1) + ' KB';
  return (bytes/1024**2).toFixed(1) + ' MB';
}

function respond(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

function respondHtml(res, html) {
  res.writeHead(200, { 'Content-Type': 'text/html', 'Access-Control-Allow-Origin': '*' });
  res.end(html);
}

function bodyJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

// ── Ingest logic ──────────────────────────────────────────────────────────────

function ingestEvent(event) {
  const { type, payload, source, chatUrl, account, chatId, ts } = event;
  const timestamp = ts || Date.now();

  switch (type) {

    case 'ARTIFACT': {
      if (!payload || !payload.content) return { ok: false, error: 'No content' };
      const hash = payload.hash || simpleHash(payload.content);
      const existing = artifacts.find(a => a.hash === hash);
      if (existing) {
        // Update timestamp and merge metadata
        existing.lastSeen = timestamp;
        existing.seenCount = (existing.seenCount || 1) + 1;
        debounceSave('artifacts', artifacts);
        return { ok: true, hash, action: 'updated', id: existing.id };
      }
      const entry = {
        id:        payload.id || randomUUID(),
        hash,
        name:      payload.name      || 'artifact',
        type:      payload.type      || 'code_block',
        lang:      payload.lang      || null,
        content:   (payload.content  || '').slice(0, 8000),
        context:   (payload.context  || '').slice(0, 400),
        chatUrl:   payload.chatUrl   || chatUrl || '',
        chatId:    payload.chatId    || chatId  || '',
        account:   payload.account   || account || '',
        jobId:     payload.jobId     || null,
        direction: payload.direction || 'output',
        ts:        timestamp,
        lastSeen:  timestamp,
        seenCount: 1,
        source:    source || 'guardian',
        tags:      [],
        lineage:   payload.lineage || [],
      };
      artifacts.unshift(entry);
      if (artifacts.length > MAX_ARTIFACTS) artifacts.pop();
      debounceSave('artifacts', artifacts);
      console.log(`[memory] artifact: ${entry.name} (${entry.lang || entry.type}) ${fmtSize(entry.content.length)}`);
      return { ok: true, hash, action: 'created', id: entry.id };
    }

    case 'ARTIFACT_MANUAL_PUSH':
      return ingestEvent({ ...event, type: 'ARTIFACT' });

    case 'LEDGER': {
      if (!payload) return { ok: false, error: 'No payload' };
      const entry = {
        id:       randomUUID(),
        ts:       timestamp,
        category: payload.category || 'EVENT',
        msg:      payload.msg      || '',
        meta:     payload.meta     || {},
        chatUrl:  chatUrl || payload.chatUrl || '',
        account:  account || payload.account || '',
        source:   source || 'guardian',
      };
      ledger.unshift(entry);
      if (ledger.length > MAX_LEDGER) ledger.pop();
      debounceSave('ledger', ledger);
      return { ok: true, id: entry.id };
    }

    case 'DOWNLOAD': {
      if (!payload) return { ok: false, error: 'No payload' };
      const entry = {
        id:       payload.id || randomUUID(),
        ts:       timestamp,
        filename: payload.filename || 'download',
        href:     payload.href     || '',
        chatUrl:  payload.chatUrl  || chatUrl || '',
        chatId:   payload.chatId   || chatId  || '',
        account:  payload.account  || account || '',
        jobId:    payload.jobId    || null,
        source:   source || 'guardian',
      };
      downloads.unshift(entry);
      if (downloads.length > 500) downloads.pop();
      debounceSave('downloads', downloads);
      return { ok: true, id: entry.id };
    }

    case 'JOB_START': {
      if (!payload?.jobId) return { ok: false, error: 'No jobId' };
      const entry = {
        id:      payload.jobId,
        status:  'started',
        prompt:  (payload.prompt || '').slice(0, 500),
        chatUrl: payload.chatUrl || chatUrl || '',
        account: payload.account || account || '',
        ts:      timestamp,
        source:  source || 'guardian',
      };
      const existing = jobs.find(j => j.id === entry.id);
      if (!existing) {
        jobs.unshift(entry);
        if (jobs.length > 500) jobs.pop();
      }
      debounceSave('jobs', jobs);
      return { ok: true };
    }

    case 'JOB_COMPLETE': {
      if (!payload?.jobId) return { ok: false, error: 'No jobId' };
      const job = jobs.find(j => j.id === payload.jobId);
      if (job) { job.status = 'complete'; job.completedAt = timestamp; job.chars = payload.chars; job.gaps = payload.gaps; }
      debounceSave('jobs', jobs);
      return { ok: true };
    }

    case 'CONTEXT_BUNDLE': {
      if (!payload) return { ok: false, error: 'No payload' };
      const entry = {
        id:      randomUUID(),
        ts:      timestamp,
        chatUrl: payload.chatUrl || chatUrl || '',
        chatId:  payload.chatId  || chatId  || '',
        account: payload.account || account || '',
        ...payload,
        source:  source || 'guardian',
      };
      contexts.unshift(entry);
      if (contexts.length > MAX_SESSIONS) contexts.pop();
      debounceSave('contexts', contexts);
      return { ok: true, id: entry.id };
    }

    case 'FILE_UPLOAD': {
      return ingestEvent({ ...event, type: 'LEDGER', payload: { category: 'INPUT', msg: `Upload: ${(payload?.files || []).map(f => f.name).join(', ')}`, meta: payload } });
    }

    default:
      // Generic event — store to ledger
      return ingestEvent({ ...event, type: 'LEDGER', payload: { category: 'EVENT', msg: `${type}`, meta: payload || {} } });
  }
}

// ── Full-text search ──────────────────────────────────────────────────────────

function queryMemory(q, opts = {}) {
  if (!q) return { artifacts: [], ledger: [], downloads: [] };
  const query  = q.toLowerCase();
  const limit  = Math.min(parseInt(opts.limit) || 50, 200);
  const types  = opts.types ? opts.types.split(',') : ['artifacts', 'ledger', 'downloads'];

  const results = {};

  if (types.includes('artifacts')) {
    results.artifacts = artifacts.filter(a =>
      (a.name    || '').toLowerCase().includes(query) ||
      (a.lang    || '').toLowerCase().includes(query) ||
      (a.content || '').toLowerCase().includes(query) ||
      (a.context || '').toLowerCase().includes(query) ||
      (a.chatId  || '').toLowerCase().includes(query) ||
      (a.account || '').toLowerCase().includes(query) ||
      (a.tags    || []).some(t => t.toLowerCase().includes(query))
    ).slice(0, limit).map(a => ({
      ...a,
      content: a.content?.slice(0, 500), // truncate for search results
      _score:  scoreMatch(a, query),
    })).sort((a, b) => b._score - a._score);
  }

  if (types.includes('ledger')) {
    results.ledger = ledger.filter(l =>
      (l.msg     || '').toLowerCase().includes(query) ||
      (l.account || '').toLowerCase().includes(query) ||
      (l.chatUrl || '').toLowerCase().includes(query)
    ).slice(0, limit);
  }

  if (types.includes('downloads')) {
    results.downloads = downloads.filter(d =>
      (d.filename || '').toLowerCase().includes(query) ||
      (d.href     || '').toLowerCase().includes(query)
    ).slice(0, limit);
  }

  return results;
}

function scoreMatch(artifact, query) {
  let score = 0;
  if ((artifact.name    || '').toLowerCase().includes(query)) score += 10;
  if ((artifact.lang    || '').toLowerCase() === query)       score += 8;
  if ((artifact.content || '').toLowerCase().includes(query)) score += 3;
  if ((artifact.context || '').toLowerCase().includes(query)) score += 2;
  // Recency boost
  const ageHours = (Date.now() - artifact.ts) / 3600000;
  score += Math.max(0, 5 - ageHours * 0.1);
  return score;
}

// ── Stats ─────────────────────────────────────────────────────────────────────

function getStats() {
  const langs    = {};
  const accounts = {};
  const types    = {};
  for (const a of artifacts) {
    if (a.lang)    langs[a.lang]       = (langs[a.lang]       || 0) + 1;
    if (a.account) accounts[a.account] = (accounts[a.account] || 0) + 1;
    if (a.type)    types[a.type]       = (types[a.type]       || 0) + 1;
  }
  return {
    artifacts:  artifacts.length,
    ledger:     ledger.length,
    sessions:   sessions.length,
    downloads:  downloads.length,
    jobs:       jobs.length,
    contexts:   contexts.length,
    totalContentBytes: artifacts.reduce((n, a) => n + (a.content?.length || 0), 0),
    langs:     Object.entries(langs).sort((a,b) => b[1]-a[1]).slice(0, 20),
    accounts:  Object.entries(accounts).sort((a,b) => b[1]-a[1]),
    types:     Object.entries(types).sort((a,b) => b[1]-a[1]),
    uptime:    process.uptime(),
    memoryMB:  Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
  };
}

// ── Dashboard HTML ────────────────────────────────────────────────────────────

function dashboardHtml() {
  const ips   = getLocalIPs();
  const stats = getStats();
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Guardian Memory</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#030508;--s1:#080d12;--s2:#0d1318;--border:#0f2030;--text:#c8e0f0;--muted:#3a5060;--mono:'SF Mono','Fira Code',monospace;--accent:#00c8ff}
html,body{height:100%;background:var(--bg);color:var(--text);font-family:var(--mono);overflow-x:hidden}
.grid{position:fixed;inset:0;z-index:0;pointer-events:none;background-image:linear-gradient(rgba(0,200,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(0,200,255,.025) 1px,transparent 1px);background-size:36px 36px}
.scan{position:fixed;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,var(--accent),transparent);opacity:.5;animation:scan 5s linear infinite;z-index:1}
@keyframes scan{from{top:-1px}to{top:100vh}}
.app{position:relative;z-index:10;max-width:1400px;margin:0 auto;padding:1.5rem}
h1{font-size:clamp(1.4rem,3vw,2.2rem);letter-spacing:.15em;color:var(--accent);text-shadow:0 0 20px rgba(0,200,255,.4);margin-bottom:1.5rem}
h1 span{color:var(--muted);font-size:.5em;display:block;letter-spacing:.1em;margin-top:4px}
.stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;margin-bottom:1.5rem}
.stat{background:var(--s1);border:1px solid var(--border);padding:10px 12px;position:relative}
.stat::before{content:'';position:absolute;left:0;top:0;bottom:0;width:2px;background:var(--accent)}
.stat-v{color:var(--accent);font-size:1.4rem;font-weight:600}
.stat-l{color:var(--muted);font-size:.65rem;text-transform:uppercase;letter-spacing:.08em}
.panels{display:grid;grid-template-columns:1fr 1fr;gap:1rem}
@media(max-width:900px){.panels{grid-template-columns:1fr}}
.panel{background:var(--s1);border:1px solid var(--border)}
.panel-h{padding:.7rem 1rem;border-bottom:1px solid var(--border);background:var(--s2);display:flex;align-items:center;justify-content:space-between;gap:.5rem}
.panel-t{font-size:.65rem;text-transform:uppercase;letter-spacing:.15em;color:var(--accent)}
.panel-b{padding:.75rem 1rem;max-height:320px;overflow-y:auto}
.panel-b::-webkit-scrollbar{width:4px}
.panel-b::-webkit-scrollbar-thumb{background:var(--border)}
.search{width:100%;background:var(--bg);border:1px solid var(--border);color:var(--text);padding:6px 10px;font-family:var(--mono);font-size:.8rem;outline:none;margin-bottom:.75rem;transition:border-color .2s}
.search:focus{border-color:rgba(0,200,255,.4)}
.art-row{padding:5px 0;border-bottom:1px solid var(--border);display:flex;align-items:flex-start;gap:8px;cursor:pointer;transition:background .15s}
.art-row:hover{background:rgba(0,200,255,.04);margin:0 -1rem;padding:5px 1rem}
.art-icon{font-size:.9rem;flex-shrink:0;padding-top:2px}
.art-info{flex:1;min-width:0}
.art-name{color:var(--text);font-size:.8rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.art-meta{color:var(--muted);font-size:.65rem;display:flex;gap:.5rem;margin-top:2px;flex-wrap:wrap}
.art-meta span{white-space:nowrap}
.art-meta .lang{color:var(--accent);opacity:.7}
.art-meta .url{color:#4f46e5;cursor:pointer}
.art-meta .url:hover{color:#818cf8}
.art-expand{padding:6px;background:var(--bg);border:1px solid var(--border);margin-top:4px;font-size:.7rem;white-space:pre-wrap;word-break:break-all;max-height:120px;overflow-y:auto;color:#64748b}
.led-row{padding:4px 0;border-bottom:1px solid var(--border);display:flex;gap:8px;align-items:flex-start}
.led-ts{color:#1e293b;font-size:.65rem;flex-shrink:0;padding-top:2px;width:64px}
.led-cat{font-size:.65rem;font-weight:700;flex-shrink:0;width:50px}
.led-msg{color:#64748b;font-size:.75rem;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.badge{display:inline-block;padding:1px 6px;font-size:.6rem;border-radius:2px;text-transform:uppercase;letter-spacing:.06em}
.badge-js{background:rgba(251,191,36,.15);color:#fbbf24;border:1px solid rgba(251,191,36,.3)}
.badge-ts{background:rgba(96,165,250,.15);color:#60a5fa;border:1px solid rgba(96,165,250,.3)}
.badge-py{background:rgba(52,211,153,.15);color:#34d399;border:1px solid rgba(52,211,153,.3)}
.badge-html{background:rgba(251,113,133,.15);color:#fb7185;border:1px solid rgba(251,113,133,.3)}
.badge-default{background:rgba(167,139,250,.1);color:#a78bfa;border:1px solid rgba(167,139,250,.2)}
.lang-bar{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:.5rem}
.lang-chip{background:var(--s2);border:1px solid var(--border);color:var(--muted);padding:2px 7px;font-size:.65rem;cursor:pointer;transition:all .15s}
.lang-chip:hover,.lang-chip.active{border-color:var(--accent);color:var(--accent)}
.empty{color:var(--muted);text-align:center;padding:2rem;font-size:.8rem}
footer{margin-top:2rem;padding-top:1rem;border-top:1px solid var(--border);display:flex;justify-content:space-between;font-size:.65rem;color:var(--muted)}
footer span{color:var(--accent)}
</style>
</head>
<body>
<div class="grid"></div>
<div class="scan"></div>
<div class="app">
  <h1>Guardian Memory <span>Persistent AI Interaction Store · v1.0.0</span></h1>
  <div class="stats" id="stats"></div>
  <div class="panels">
    <div class="panel">
      <div class="panel-h"><span class="panel-t">Artifacts</span><span id="art-count" style="color:var(--muted);font-size:.7rem"></span></div>
      <div class="panel-b">
        <input class="search" id="art-search" placeholder="Search artifacts, languages, content…" oninput="filterArts()">
        <div class="lang-bar" id="lang-bar"></div>
        <div id="art-list"></div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-h"><span class="panel-t">Ledger</span><span id="led-count" style="color:var(--muted);font-size:.7rem"></span></div>
      <div class="panel-b">
        <input class="search" id="led-search" placeholder="Search events…" oninput="filterLedger()">
        <div id="led-list"></div>
      </div>
    </div>
  </div>
  <footer>
    <span>Guardian Memory · Port <span id="ft-port">${PORT}</span> · IPs: <span>${ips.map(i=>i.address).join(' · ') || 'localhost'}</span></span>
    <span id="ft-uptime"></span>
  </footer>
</div>
<script>
const BASE = '';
let allArts = [], allLedger = [], activeLang = '', expandedArts = new Set();
const ICONS = {
  typescript:'🔷',ts:'🔷',javascript:'🟨',js:'🟨',python:'🐍',py:'🐍',
  html:'🌐',css:'🎨',json:'📋',md:'📝',markdown:'📝',bash:'💲',sh:'💲',
  rust:'🦀',go:'🟦',download:'⬇',artifact:'◈',code_block:'◻'
};
const LANG_COLORS = {
  OUTPUT:'#a78bfa',INPUT:'#60a5fa',EVENT:'#94a3b8',GAP:'#f472b6',
  UPGRADE:'#34d399',SYSTEM:'#818cf8',IDEA:'#a78bfa'
};
function icon(a){return ICONS[a.lang]||ICONS[a.type]||'◻'}
function fmtTs(ts){return new Date(ts).toLocaleTimeString()}
function fmtSize(n){if(n<1024)return n+'B';if(n<1048576)return(n/1024).toFixed(1)+'KB';return(n/1048576).toFixed(1)+'MB'}
function escH(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
async function load(){
  const [sr,lr] = await Promise.all([
    fetch('/artifacts?limit=500').then(r=>r.json()),
    fetch('/ledger?limit=200').then(r=>r.json()),
  ]);
  allArts = sr.artifacts || [];
  allLedger = lr.ledger || [];
  loadStats();
  buildLangBar();
  filterArts();
  filterLedger();
}
async function loadStats(){
  const r = await fetch('/stats').then(x=>x.json());
  const s = r.stats;
  document.getElementById('stats').innerHTML =
    stat(s.artifacts,'Artifacts') + stat(s.ledger,'Events') +
    stat(s.downloads,'Downloads') + stat(s.jobs,'Jobs') +
    stat(fmtSize(s.totalContentBytes||0),'Content') +
    stat(s.langs?.[0]?.[0]||'—','Top Lang') +
    stat(s.memoryMB+'MB','Heap') +
    stat(Math.floor(s.uptime/60)+'m','Uptime');
}
function stat(v,l){return \`<div class="stat"><div class="stat-v">\${v}</div><div class="stat-l">\${l}</div></div>\`}
function buildLangBar(){
  const langs = [...new Set(allArts.map(a=>a.lang).filter(Boolean))];
  document.getElementById('lang-bar').innerHTML =
    \`<span class="lang-chip\${activeLang===''?' active':''}" onclick="setLang('')">all</span>\` +
    langs.map(l=>\`<span class="lang-chip\${activeLang===l?' active':''}" onclick="setLang('\${l}')">\${l}</span>\`).join('');
}
function setLang(l){activeLang=l;buildLangBar();filterArts()}
function filterArts(){
  const q=(document.getElementById('art-search').value||'').toLowerCase();
  let list=allArts.filter(a=>
    (!activeLang||a.lang===activeLang)&&
    (!q||(a.name||'').toLowerCase().includes(q)||(a.lang||'').toLowerCase().includes(q)||
     (a.content||'').toLowerCase().includes(q)||(a.account||'').toLowerCase().includes(q))
  );
  document.getElementById('art-count').textContent=list.length+' results';
  document.getElementById('art-list').innerHTML = list.length===0
    ? '<div class="empty">No artifacts match</div>'
    : list.slice(0,100).map(a=>{
        const isExp=expandedArts.has(a.hash);
        return \`<div class="art-row" onclick="toggleArt('\${a.hash}')">
          <span class="art-icon">\${icon(a)}</span>
          <div class="art-info">
            <div class="art-name">\${escH(a.name||'artifact')}</div>
            <div class="art-meta">
              \${a.lang?\`<span class="lang">\${a.lang}</span>\`:''}
              \${a.account?\`<span>\${escH(a.account.slice(0,30))}</span>\`:''}
              \${a.chatId?\`<span class="url" onclick="event.stopPropagation();window.open('\${escH(a.chatUrl)}','_blank')">\${a.chatId.slice(0,10)}</span>\`:''}
              <span>\${fmtTs(a.ts)}</span>
              <span>\${fmtSize(a.content?.length||0)}</span>
            </div>
            \${isExp?\`<pre class="art-expand">\${escH((a.content||'').slice(0,800))}</pre>\`:''}
          </div>
        </div>\`;
      }).join('');
}
function toggleArt(hash){
  if(expandedArts.has(hash))expandedArts.delete(hash);else expandedArts.add(hash);
  filterArts();
}
function filterLedger(){
  const q=(document.getElementById('led-search').value||'').toLowerCase();
  let list=allLedger.filter(l=>
    !q||(l.msg||'').toLowerCase().includes(q)||(l.category||'').toLowerCase().includes(q)
  );
  document.getElementById('led-count').textContent=list.length+' events';
  document.getElementById('led-list').innerHTML = list.length===0
    ? '<div class="empty">No events</div>'
    : list.slice(0,80).map(l=>\`<div class="led-row">
        <span class="led-ts">\${fmtTs(l.ts)}</span>
        <span class="led-cat" style="color:\${LANG_COLORS[l.category]||'#94a3b8'}">\${l.category}</span>
        <span class="led-msg">\${escH(l.msg)}</span>
      </div>\`).join('');
}
function updateUptime(){
  const el=document.getElementById('ft-uptime');
  if(el)el.textContent='Last refresh: '+new Date().toLocaleTimeString();
}
setInterval(()=>{load();updateUptime()},10000);
load();updateUptime();
</script>
</body>
</html>`;
}

// ── HTTP server ───────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url    = new URL(req.url, `http://localhost:${PORT}`);
  const method = req.method;
  const parts  = url.pathname.split('/').filter(Boolean);

  // ── Dashboard ──────────────────────────────────────────────────────────────
  if (method === 'GET' && parts.length === 0) {
    respondHtml(res, dashboardHtml());
    return;
  }

  // ── POST /ingest ───────────────────────────────────────────────────────────
  if (method === 'POST' && parts[0] === 'ingest') {
    try {
      const body   = await bodyJson(req);
      const result = ingestEvent(body);
      respond(res, 200, result);
    } catch (e) { respond(res, 400, { ok: false, error: e.message }); }
    return;
  }

  // ── POST /artifacts (manual push) ─────────────────────────────────────────
  if (method === 'POST' && parts[0] === 'artifacts') {
    try {
      const body   = await bodyJson(req);
      const result = ingestEvent({ type: 'ARTIFACT', payload: body });
      respond(res, 200, result);
    } catch (e) { respond(res, 400, { ok: false, error: e.message }); }
    return;
  }

  // ── GET /artifacts ─────────────────────────────────────────────────────────
  if (method === 'GET' && parts[0] === 'artifacts' && !parts[1]) {
    const limit  = Math.min(parseInt(url.searchParams.get('limit') || '100'), 500);
    const lang   = url.searchParams.get('lang');
    const type   = url.searchParams.get('type');
    const chatId = url.searchParams.get('chatId');
    const after  = parseInt(url.searchParams.get('after') || '0');
    let list = artifacts;
    if (lang)   list = list.filter(a => a.lang === lang);
    if (type)   list = list.filter(a => a.type === type);
    if (chatId) list = list.filter(a => a.chatId === chatId);
    if (after)  list = list.filter(a => a.ts > after);
    respond(res, 200, { ok: true, count: list.length, artifacts: list.slice(0, limit) });
    return;
  }

  // ── GET /artifacts/:hash ───────────────────────────────────────────────────
  if (method === 'GET' && parts[0] === 'artifacts' && parts[1]) {
    const found = artifacts.find(a => a.hash === parts[1] || a.id === parts[1]);
    if (!found) { respond(res, 404, { ok: false, error: 'Not found' }); return; }
    respond(res, 200, { ok: true, artifact: found });
    return;
  }

  // ── DELETE /artifacts/:hash ────────────────────────────────────────────────
  if (method === 'DELETE' && parts[0] === 'artifacts' && parts[1]) {
    const idx = artifacts.findIndex(a => a.hash === parts[1] || a.id === parts[1]);
    if (idx === -1) { respond(res, 404, { ok: false, error: 'Not found' }); return; }
    artifacts.splice(idx, 1);
    debounceSave('artifacts', artifacts);
    respond(res, 200, { ok: true });
    return;
  }

  // ── GET /query ─────────────────────────────────────────────────────────────
  if (method === 'GET' && parts[0] === 'query') {
    const q     = url.searchParams.get('q') || url.searchParams.get('query') || '';
    const opts  = { limit: url.searchParams.get('limit'), types: url.searchParams.get('types') };
    if (!q) { respond(res, 400, { ok: false, error: 'Missing q parameter' }); return; }
    respond(res, 200, { ok: true, query: q, results: queryMemory(q, opts) });
    return;
  }

  // ── GET /ledger ────────────────────────────────────────────────────────────
  if (method === 'GET' && parts[0] === 'ledger') {
    const limit    = Math.min(parseInt(url.searchParams.get('limit') || '100'), 500);
    const category = url.searchParams.get('category');
    let list = ledger;
    if (category) list = list.filter(l => l.category === category);
    respond(res, 200, { ok: true, count: list.length, ledger: list.slice(0, limit) });
    return;
  }

  // ── GET /downloads ─────────────────────────────────────────────────────────
  if (method === 'GET' && parts[0] === 'downloads') {
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200);
    respond(res, 200, { ok: true, count: downloads.length, downloads: downloads.slice(0, limit) });
    return;
  }

  // ── GET /sessions ──────────────────────────────────────────────────────────
  if (method === 'GET' && parts[0] === 'sessions') {
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
    respond(res, 200, { ok: true, count: sessions.length, sessions: sessions.slice(0, limit) });
    return;
  }

  // ── GET /jobs ──────────────────────────────────────────────────────────────
  if (method === 'GET' && parts[0] === 'jobs') {
    const limit  = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200);
    const status = url.searchParams.get('status');
    let list = jobs;
    if (status) list = list.filter(j => j.status === status);
    respond(res, 200, { ok: true, count: list.length, jobs: list.slice(0, limit) });
    return;
  }

  // ── GET /context ───────────────────────────────────────────────────────────
  if (method === 'GET' && parts[0] === 'context') {
    // Returns the richest possible context bundle for an agent
    const chatId = url.searchParams.get('chatId');
    const limit  = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200);
    const artList = chatId ? artifacts.filter(a => a.chatId === chatId) : artifacts.slice(0, limit);
    respond(res, 200, {
      ok: true,
      ts: Date.now(),
      artifacts: artList.slice(0, limit),
      recentLedger:    ledger.slice(0, 20),
      recentDownloads: downloads.slice(0, 10),
      recentJobs:      jobs.slice(0, 10),
      stats:           getStats(),
    });
    return;
  }

  // ── GET /stats ─────────────────────────────────────────────────────────────
  if (method === 'GET' && parts[0] === 'stats') {
    respond(res, 200, { ok: true, stats: getStats() });
    return;
  }

  // ── GET /health ────────────────────────────────────────────────────────────
  if (method === 'GET' && parts[0] === 'health') {
    respond(res, 200, {
      ok: true,
      uptime:    process.uptime(),
      artifacts: artifacts.length,
      ledger:    ledger.length,
      downloads: downloads.length,
      jobs:      jobs.length,
      memoryMB:  Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      port:      PORT,
      ips:       getLocalIPs(),
    });
    return;
  }

  // ── PUT /artifacts/:hash/tags ──────────────────────────────────────────────
  if (method === 'PUT' && parts[0] === 'artifacts' && parts[1] && parts[2] === 'tags') {
    try {
      const body  = await bodyJson(req);
      const found = artifacts.find(a => a.hash === parts[1] || a.id === parts[1]);
      if (!found) { respond(res, 404, { ok: false, error: 'Not found' }); return; }
      found.tags = [...new Set([...(found.tags || []), ...(body.tags || [])])];
      debounceSave('artifacts', artifacts);
      respond(res, 200, { ok: true, tags: found.tags });
    } catch (e) { respond(res, 400, { ok: false, error: e.message }); }
    return;
  }

  respond(res, 404, { ok: false, error: 'Not found' });
});

server.listen(PORT, HOST, () => {
  const ips = getLocalIPs();
  console.log(`\n[guardian-memory] Memory server v1.0.0`);
  console.log(`[guardian-memory] Dashboard: http://127.0.0.1:${PORT}`);
  ips.forEach(ip => console.log(`[guardian-memory] LAN:       http://${ip.address}:${PORT}  (${ip.name})`));
  console.log(`[guardian-memory] Store:     ${STORE_DIR}`);
  console.log(`[guardian-memory] Loaded:    ${artifacts.length} artifacts, ${ledger.length} events\n`);
  console.log(`[guardian-memory] API endpoints:`);
  console.log(`  POST /ingest            — push any event`);
  console.log(`  GET  /artifacts         — list all artifacts`);
  console.log(`  GET  /query?q=...       — full-text search`);
  console.log(`  GET  /context           — full context bundle`);
  console.log(`  GET  /stats             — store stats`);
  console.log(`  GET  /health            — health check`);
});

server.on('error', err => {
  console.error(`[guardian-memory] Server error: ${err.message}`);
  if (err.code === 'EADDRINUSE') {
    console.error(`[guardian-memory] Port ${PORT} in use. Set MEMORY_PORT env var to change.`);
    process.exit(1);
  }
});

module.exports = { server, artifacts, ledger, ingestEvent, queryMemory, getStats };
