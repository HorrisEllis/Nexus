'use strict';
// ── core/raid/index.js — RAID v6 ─────────────────────────────────────────────
// UUID: mod-raid-v6-0000-4000-0000-000000000001
//
// RAID — Routing and Agent Intelligence Dispatcher v6
// The orchestrator's ONLY control layer for agent dispatch.
//
// AXIOMS (enforced in code):
//   LAW_I  LOCAL_FIRST — Ollama first. Always. Bypassed only if 3+ consecutive fails.
//   LAW_II MEMORY_AUTHORITY — every decision written to JAA BEFORE dispatch.
//   §1.1   DETERMINISTIC — f(call, healthSnapshot, weights) → same decision always.
//   §1.2   NOTHING_SILENT — every routing failure logged + gap emitted.
//
// LEARNING: updates (intentCluster × agent) weight table from outcomes.
// SYSTEM-AWARE: probes all agents every 10s. Never dispatches to a dead system.
// BRAIN: uses Ollama to analyze failures every 60s and adjust weights.

const path = require('path');
const http = require('http');
const fs   = require('fs');
const { jaaDB, uid } = require('../../memory/jaa-db');

let ESSKernel = null;
try { ESSKernel = require('../../lib/ess').ESSKernel; } catch(_) {}

const MODULE_ID = 'raid';
const VERSION   = '6.0.0';

// ── ESS (optional) ────────────────────────────────────────────────────────────
let _ess = null;
if (ESSKernel) {
  const ld = path.join(__dirname, '../../../data/cortex/ledger');
  try { fs.mkdirSync(ld, { recursive: true }); } catch(_) {}
  _ess = new ESSKernel({
    bindingLogPath: path.join(ld, 'ess-bindings.ndjson'),
    hashStorePath:  path.join(ld, 'ess-hashes.json'),
  });
  _ess.on('ess:unresolve', evt => {
    try {
      jaaDB.insert('gaps', { uuid: uid(), type: 'raid_ess_unresolve', path: 'raid/ess',
        body: `ESS UNRESOLVE: role "${evt.role}" — ${evt.reason}`,
        severity: 'medium', status: 'open', source: MODULE_ID,
        causedBy: null, createdAt: Date.now(), attempts: 0, ts: Date.now() });
    } catch(_) {}
  });
}

// ── Health cache ──────────────────────────────────────────────────────────────
const HEALTH_INTERVAL = 10000;
const HEALTH_TIMEOUT  = 2000;

const _health = {
  ollama:             { online: false, lastCheck: 0, consecutiveFails: 0, latencyMs: 0, models: [] },
  'guardian-claude':  { online: false, lastCheck: 0, consecutiveFails: 0, latencyMs: 0 },
  'guardian-chatgpt': { online: false, lastCheck: 0, consecutiveFails: 0, latencyMs: 0 },
  claude:             { online: true,  lastCheck: 0, consecutiveFails: 0, latencyMs: 0 },
  chatgpt:            { online: true,  lastCheck: 0, consecutiveFails: 0, latencyMs: 0 },
  gemini:             { online: true,  lastCheck: 0, consecutiveFails: 0, latencyMs: 0 },
  perplexity:         { online: true,  lastCheck: 0, consecutiveFails: 0, latencyMs: 0 },
};

async function _probeAgent(agent) {
  const probes = {
    ollama:             { host: '127.0.0.1', port: 11434, path: '/api/tags' },
    'guardian-claude':  { host: '127.0.0.1', port: 7820,  path: '/providers' },
    'guardian-chatgpt': { host: '127.0.0.1', port: 7820,  path: '/providers' },
  };
  const probe = probes[agent];
  if (!probe) return; // claude/chatgpt assumed available unless proven otherwise

  const t0 = Date.now();
  return new Promise(resolve => {
    const req = http.get({ ...probe, timeout: HEALTH_TIMEOUT }, res => {
      const latMs = Date.now() - t0;
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        const ok = res.statusCode === 200;
        if (agent === 'ollama' && ok) {
          try {
            const d = JSON.parse(body);
            const models = (d.models || []).map(m => m.name || m.model || '').filter(Boolean);
            _health.ollama.online    = models.length > 0;
            _health.ollama.models    = models;
            _health.ollama.latencyMs = latMs;
          } catch { _health.ollama.online = ok; }
        } else if (agent === 'guardian-claude' || agent === 'guardian-chatgpt') {
          try {
            const d     = JSON.parse(body);
            const prov  = agent === 'guardian-claude' ? 'claude' : 'chatgpt';
            const provs = d.providers || d.connected || {};
            _health[agent].online    = !!provs[prov] || Object.keys(provs).some(k => k.startsWith(prov));
            _health[agent].latencyMs = latMs;
          } catch { _health[agent].online = false; }
        }
        if (!ok) _health[agent].consecutiveFails++;
        else     _health[agent].consecutiveFails = 0;
        _health[agent].lastCheck = Date.now();
        resolve();
      });
    });
    req.on('error',   () => { _health[agent].online = false; _health[agent].consecutiveFails++; _health[agent].lastCheck = Date.now(); resolve(); });
    req.on('timeout', () => { req.destroy(); _health[agent].online = false; resolve(); });
  });
}

async function _refreshHealth() {
  await Promise.all(['ollama','guardian-claude','guardian-chatgpt'].map(_probeAgent));
  try {
    jaaDB.insert('event_log', { uuid: uid(), type: 'raid.health',
      payload: JSON.stringify(Object.fromEntries(
        Object.entries(_health).map(([k,v]) => [k, { online: v.online, fails: v.consecutiveFails }])
      )), source: MODULE_ID, ts: Date.now() });
  } catch(_) {}
}

// ── Weight table (learning) ───────────────────────────────────────────────────
const _weights = new Map();
const _WEIGHTS_FILE = path.join(__dirname, '../../../data/cortex/ledger/raid-weights.json');

function _wKey(cluster, agent) { return `${cluster}:${agent}`; }

function _getW(cluster, agent) {
  return _weights.get(_wKey(cluster, agent)) || {
    successCount: 0, failCount: 0, totalMs: 0,
    successRate: 0.5, avgMs: 0, callCount: 0, lastUsed: 0,
  };
}

function _updateW(cluster, agent, ok, ms) {
  const w = _getW(cluster, agent);
  if (ok) w.successCount++; else w.failCount++;
  w.totalMs    += ms;
  w.callCount++;
  w.successRate = w.successCount / w.callCount;
  w.avgMs       = Math.round(w.totalMs / w.callCount);
  w.lastUsed    = Date.now();
  _weights.set(_wKey(cluster, agent), w);
  try { fs.mkdirSync(path.dirname(_WEIGHTS_FILE), { recursive: true }); fs.writeFileSync(_WEIGHTS_FILE, JSON.stringify(Object.fromEntries(_weights), null, 2)); } catch(_) {}
}

function _loadWeights() {
  try { const raw = JSON.parse(fs.readFileSync(_WEIGHTS_FILE, 'utf8')); for (const [k,v] of Object.entries(raw)) _weights.set(k,v); } catch(_) {}
}

// ── Intent clustering (deterministic, no randomness) ─────────────────────────
const CLUSTERS = {
  // Local-first work
  code:       /\b(code|function|class|module|implement|build|write|create|fix|refactor|typescript|javascript|python|rust|node|patch)\b/i,
  spec:       /\b(spec|design|architecture|system|plan|structure|schema|contract|api|blueprint)\b/i,
  data:       /\b(data|json|csv|sql|database|query|table|migrate|transform|parse)\b/i,
  diagnostic: /\b(error|fail|broken|debug|trace|diagnose|crash|exception|issue|bug|stack)\b/i,
  analysis:   /\b(analyze|analyse|explain|understand|review|audit|check|evaluate|compare|summarize)\b/i,

  // Vision/UI — Gemini primary
  vision:     /\b(image|screenshot|photo|visual|ui|interface|design|layout|render|pixel|svg|canvas|color|theme|mock)\b/i,

  // Research/facts — Perplexity primary
  research:   /\b(research|fact|current|today|news|latest|real.world|source|citation|search|web|grounded|up.to.date)\b/i,

  // Hostile/adversarial — ChatGPT primary
  hostile:    /\b(attack|adversar|hostile|red.team|pentest|bypass|exploit|break|challenge|counter|stress.test|find.flaw|worst.case)\b/i,

  // Forge/SEAM — highest stakes, Claude reserve
  forge:      /\b(forge|seam|patch|repair|self.heal|autonomous|critical.fix|production)\b/i,
};

function _cluster(text) {
  if (!text) return 'general';
  for (const [name, re] of Object.entries(CLUSTERS)) if (re.test(text)) return name;
  return 'general';
}

// ── Deterministic routing decision ───────────────────────────────────────────
// PURE FUNCTION: same (call, healthSnap, weights) → same decision. Always.
//
// PROVIDER HIERARCHY (by intent cluster):
//   Local/private:  ollama → chatgpt → claude
//   Vision/UI:      gemini → claude
//   Research/facts: perplexity → claude
//   Hostile/attack: chatgpt → claude
//   Forge/critical: ollama → claude (never chatgpt — output quality matters)
//
// LAW_I: Ollama always first for code/spec/data/diagnostic/analysis/general.
// LAW_III: Claude always last (reserve, highest quality, most expensive).

// Per-cluster fallback chains
const CLUSTER_CHAINS = {
  code:       ['ollama', 'chatgpt', 'claude'],
  spec:       ['ollama', 'claude'],
  data:       ['ollama', 'chatgpt', 'claude'],
  diagnostic: ['ollama', 'chatgpt', 'claude'],
  analysis:   ['ollama', 'chatgpt', 'claude'],
  vision:     ['gemini', 'claude'],
  research:   ['perplexity', 'chatgpt', 'claude'],
  hostile:    ['chatgpt', 'claude'],
  forge:      ['ollama', 'claude'],
  general:    ['ollama', 'chatgpt', 'claude'],
};

// NCP-connected providers (browser tab required)
const NCP_PROVIDERS = new Set(['guardian-claude', 'guardian-chatgpt']);

// API providers (REST call, env key required)
const API_PROVIDERS = {
  claude:      { key: process.env.ANTHROPIC_API_KEY,    base: 'https://api.anthropic.com' },
  chatgpt:     { key: process.env.OPENAI_API_KEY,       base: 'https://api.openai.com' },
  gemini:      { key: process.env.GOOGLE_AI_API_KEY,    base: 'https://generativelanguage.googleapis.com' },
  perplexity:  { key: process.env.PERPLEXITY_API_KEY,   base: 'https://api.perplexity.ai' },
};

function _agentAvailable(agent, healthSnap) {
  // NCP agents: check browser connection
  if (agent === 'guardian-claude' || agent === 'guardian-chatgpt') {
    return !!healthSnap[agent]?.online;
  }
  // Ollama: check health probe
  if (agent === 'ollama') {
    return !!healthSnap['ollama']?.online;
  }
  // API providers: check key exists
  const api = API_PROVIDERS[agent];
  if (api) return !!api.key;
  // NCP short-form aliases
  if (agent === 'claude')  return !!healthSnap['guardian-claude']?.online || !!API_PROVIDERS.claude.key;
  if (agent === 'chatgpt') return !!healthSnap['guardian-chatgpt']?.online || !!API_PROVIDERS.chatgpt.key;
  if (agent === 'gemini')  return !!API_PROVIDERS.gemini.key;
  if (agent === 'perplexity') return !!API_PROVIDERS.perplexity.key;
  return false;
}

function _decide(call, healthSnap, weights) {
  const intent    = call.intent || call.prompt || '';
  const cluster   = _cluster(intent);
  const preferred = (call.preferredAgent || '').toLowerCase();

  // Rule 1: explicit preference + available
  if (preferred && preferred !== 'auto' && _agentAvailable(preferred, healthSnap)) {
    return { agent: preferred, reason: `explicit:${preferred}`, cluster };
  }

  // Rule 2: intent-specific cluster chain
  const chain = CLUSTER_CHAINS[cluster] || CLUSTER_CHAINS.general;

  for (const agent of chain) {
    if (!_agentAvailable(agent, healthSnap)) continue;

    // For ollama: respect LAW_I failure tracking
    if (agent === 'ollama') {
      const oh = healthSnap['ollama'];
      if (oh.consecutiveFails >= 3) continue; // bypass to next in chain
      const w = weights.get(_wKey(cluster, 'ollama'));
      if (w && w.callCount >= 3 && w.successRate < 0.3) continue; // too many failures
    }

    const w = weights.get(_wKey(cluster, agent));
    const successRate = w?.successRate ?? 0.5;
    const callCount   = w?.callCount   ?? 0;

    // Skip agents with very poor track record (but not Claude — it's the reserve)
    if (agent !== 'claude' && callCount >= 5 && successRate < 0.2) continue;

    return { agent, reason: 'cluster_chain:' + cluster, cluster };
  }

  // Absolute fallback: claude (always reserve)
  return { agent: 'claude', reason: 'LAW_I:claude_reserve', cluster };
}

// ── Ollama brain (analyzes failures, adjusts weights) ────────────────────────
const _failures = [];
let _cfg = {};

async function _brainTick() {
  if (!_health['ollama']?.online || _failures.length === 0) return;
  const batch = _failures.splice(0, 5);
  const model = _cfg.ollamaModel || _health.ollama.models?.[0] || 'mistral';

  const prompt =
    'You are the NEXUS RAID routing analyzer. Here are routing failures.\n' +
    'Respond ONLY with JSON: {"analysis":"...","suggestions":[{"cluster":"...","agent":"..."}]}\n' +
    'Agents: ollama,guardian-claude,guardian-chatgpt,claude,chatgpt\n' +
    'LAW_I: ollama must be first unless health fails 3 times.\n\n' +
    'Failures:\n' + JSON.stringify(batch);

  try {
    const resp = await new Promise((res, rej) => {
      const b   = JSON.stringify({ model, prompt, stream: false });
      const req = http.request({
        hostname:'127.0.0.1', port:11434, path:'/api/generate',
        method:'POST', headers:{'Content-Type':'application/json'}, timeout:20000,
      }, r => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>res(JSON.parse(d))); });
      req.on('error',rej); req.on('timeout',()=>req.destroy()); req.write(b); req.end();
    });
    const analysis = JSON.parse((resp.response||'').replace(/```json|```/g,'').trim());
    if (analysis?.suggestions) {
      for (const s of analysis.suggestions) {
        if (!s.cluster || !s.agent) continue;
        const w = _getW(s.cluster, s.agent);
        if (w.callCount < 5) { w.successCount = Math.max(w.successCount,1); w.callCount=Math.max(w.callCount,2); w.successRate=w.successCount/w.callCount; _weights.set(_wKey(s.cluster,s.agent),w); }
      }
      try { fs.writeFileSync(_WEIGHTS_FILE, JSON.stringify(Object.fromEntries(_weights), null, 2)); } catch(_) {}
      console.log(`[raid] brain: ${(analysis.analysis||'').slice(0,80)}`);
    }
  } catch(_) {}
}

// ── Main dispatch ─────────────────────────────────────────────────────────────

async function _dispatch(call, decision) {
  const t0 = Date.now();

  // ESS path
  if (_ess?.hasRole(decision.agent)) {
    const r = await _ess.callto(decision.agent, call);
    if (r.resolved) {
      jaaDB.update('agent_calls', call.uuid, { status:'complete', response:JSON.stringify(r.output), completedAt:Date.now(), routeMethod:'ess' });
      _updateW(decision.cluster, decision.agent, true, Date.now()-t0);
      return r.output;
    }
  }

  // Guardian NCP path
  if (decision.agent === 'guardian-claude' || decision.agent === 'guardian-chatgpt') {
    const prov = decision.agent === 'guardian-claude' ? 'claude' : 'chatgpt';
    await new Promise((res,rej)=>{
      const b=JSON.stringify({ provider:prov, command:call.command||'code', prompt:call.prompt, jobId:call.uuid });
      const req=http.request({ hostname:'127.0.0.1',port:7820,path:'/command',method:'POST',headers:{'Content-Type':'application/json'},timeout:5000 },r=>{ r.resume(); res(); });
      req.on('error',rej); req.write(b); req.end();
    });
    jaaDB.update('agent_calls', call.uuid, { status:'delivered', deliveredAt:Date.now() });
    _updateW(decision.cluster, decision.agent, true, Date.now()-t0);
    return;
  }

  // Direct agent module
  try {
    const mod = require(`../agents/${decision.agent}`);
    const result = await mod.dispatch({ uuid:call.uuid, prompt:call.prompt, intent:call.intent, context:call.context });
    const ms = Date.now()-t0;
    jaaDB.update('agent_calls', call.uuid, { status:'complete', response:result?.text||result?.response||JSON.stringify(result)||'', completedAt:Date.now(), latencyMs:ms });
    _updateW(decision.cluster, decision.agent, true, ms);
    return result;
  } catch(e) {
    jaaDB.update('agent_calls', call.uuid, { status:'pending_external', routedTo:decision.agent });
    _updateW(decision.cluster, decision.agent, false, Date.now()-t0);
    _failures.push({ uuid:call.uuid, cluster:decision.cluster, agent:decision.agent, error:e.message });
    throw e;
  }
}

// ── Poll loop ─────────────────────────────────────────────────────────────────

let _interval=null, _hTimer=null, _bTimer=null, _systemState={};

async function _tick() {
  try {
    const pending = jaaDB.query('agent_calls', r=>r.status==='pending', 20);
    if (!pending.length) return;
    const snap = Object.fromEntries(Object.entries(_health).map(([k,v])=>[k,{...v}]));
    for (const call of pending) {
      jaaDB.update('agent_calls', call.uuid, { status:'processing', claimedBy:MODULE_ID, claimedAt:Date.now() });
      const c = jaaDB.get('agent_calls', call.uuid);
      if (!c || c.claimedBy !== MODULE_ID) continue;
      const d = _decide(call, snap, _weights);
      jaaDB.update('agent_calls', call.uuid, { status:'dispatched', routedTo:d.agent, routeReason:d.reason, routeCluster:d.cluster, routedAt:Date.now() });
      jaaDB.insert('event_log', { uuid:uid(), type:'raid.dispatched', payload:JSON.stringify({callUuid:call.uuid,agent:d.agent,reason:d.reason,cluster:d.cluster}), source:MODULE_ID, causedBy:call.uuid, ts:Date.now() });
      _dispatch(call, d).catch(err=>{
        jaaDB.update('agent_calls',call.uuid,{status:'failed',error:err.message});
        jaaDB.insert('failures',{uuid:uid(),source:MODULE_ID,error:err.message,stack:err.stack,causedBy:call.uuid,ts:Date.now()});
        _failures.push({uuid:call.uuid,cluster:d.cluster,agent:d.agent,error:err.message});
        _updateW(d.cluster,d.agent,false,0);
      });
    }
  } catch(err) {
    jaaDB.insert('failures',{uuid:uid(),source:MODULE_ID,error:err.message,stack:err.stack,ts:Date.now()});
  }
}

function _initESSBindings() {
  if (!_ess) return;
  for (const name of ['ollama','guardian-claude','guardian-chatgpt','claude','chatgpt']) {
    if (_ess.hasRole(name)) continue;
    try {
      const ap = require.resolve(`../agents/${name}/index`);
      const h  = _ess.write(name, async call => require(ap).dispatch(call), {input:{required:['uuid']}});
      _ess.bind(name, h);
    } catch(_) {}
  }
}

function init(cfg={}) {
  _cfg = cfg;
  _loadWeights();
  _initESSBindings();
  _refreshHealth();
  _interval = setInterval(_tick,         _cfg.pollMs??3000); _interval.unref();
  _hTimer   = setInterval(_refreshHealth,HEALTH_INTERVAL);   _hTimer.unref();
  _bTimer   = setInterval(_brainTick,    60000);             _bTimer.unref();
  console.log(`[raid] v${VERSION} — weights:${_weights.size} ESS:${_ess?'on':'off'}`);
}

function stop() { [_interval,_hTimer,_bTimer].forEach(t=>t&&clearInterval(t)); _interval=_hTimer=_bTimer=null; }
function setSystemState(s) { _systemState=s||{}; }
function getState() { return { version:VERSION, health:_health, weights:Object.fromEntries(_weights), essEnabled:!!_ess, weightCount:_weights.size }; }

module.exports = { init, stop, getState, setSystemState, _decide, _cluster, _health, _weights };
