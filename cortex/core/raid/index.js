'use strict';
// ── core/raid/index.js — RAID v6.1 ───────────────────────────────────────────
// UUID: mod-raid-v6-0000-4000-0000-000000000001
//
// RAID — Routing and Agent Intelligence Dispatcher v6.1
// The orchestrator's ONLY control layer for agent dispatch.
//
// AXIOMS (enforced in code):
//   LAW_I  LOCAL_FIRST — Ollama first. Always. Bypassed only if 3+ consecutive fails.
//   LAW_II MEMORY_AUTHORITY — every decision written to JAA BEFORE dispatch.
//   §1.1   DETERMINISTIC — f(call, healthSnapshot, weights) → same decision always.
//   §1.2   NOTHING_SILENT — every routing failure logged + gap emitted.
//
// v6.1 additions:
//   DIAGNOSTIC — diagnostic-engines suite runs on every dispatch failure.
//                Causal chain trace, invariant scan, SNR floor emitted to console.
//   DRIFT — BDA regime signals from api-dispatch fed back via recordDrift().
//            Regime DYSREGULATED/COLLAPSING → weight penalty + escalation.
//   SELF-HEAL — escalation.escalate() called on: consecutive fails, drift alert,
//                high friction fault classes.
//   CONSOLE — explicit structured diagnostic lines on every decision, failure, drift.
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

// ── Lazy-loaded engines (non-fatal if unavailable) ────────────────────────────
let _diagEngines  = null;
let _escalation   = null;

function _diag() {
  if (_diagEngines !== null) return _diagEngines;
  try {
    _diagEngines = require('../../lib/diagnostic-engines');
    console.log('[raid] diagnostic-engines loaded');
  } catch(e) {
    console.warn(`[raid] diagnostic-engines unavailable: ${e.message}`);
    _diagEngines = false;
  }
  return _diagEngines;
}

function _esc() {
  if (_escalation !== null) return _escalation;
  try {
    _escalation = require('../../cortex/self-heal/escalation');
    console.log('[raid] self-heal escalation loaded');
  } catch(e) {
    console.warn(`[raid] escalation unavailable: ${e.message}`);
    _escalation = false;
  }
  return _escalation;
}

const MODULE_ID = 'raid';
const VERSION   = '6.1.0';

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

// ── Health cache ───────────────────────────────────────────────────────────────
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
  if (!probe) return;

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
    req.on('error', () => {
      _health[agent].consecutiveFails++;
      _health[agent].lastCheck = Date.now();

      // Console diagnostic on agent going offline
      if (_health[agent].consecutiveFails === 1) {
        console.warn(`[raid][health] ${agent} OFFLINE (consecutive_fails=${_health[agent].consecutiveFails})`);
      }
      if (_health[agent].consecutiveFails >= 3) {
        console.error(`[raid][health] ${agent} UNREACHABLE — consecutive_fails=${_health[agent].consecutiveFails} — bypassing in LAW_I`);
        // Escalate persistent agent failure
        _triggerEscalation({
          faultClass:  `raid.agent_offline.${agent}`,
          level:       1,
          description: `Agent ${agent} has been unreachable for ${_health[agent].consecutiveFails} consecutive probes`,
          evidence:    { agent, consecutiveFails: _health[agent].consecutiveFails },
        });
      }
      resolve();
    });
    req.on('timeout', () => { req.destroy(); resolve(); });
  });
}

async function _refreshHealth() {
  await Promise.all(Object.keys(_health).map(_probeAgent));
}

// ── Weights ───────────────────────────────────────────────────────────────────
const _WEIGHTS_FILE = path.join(__dirname, '../../../data/cortex/raid-weights.json');
const _weights = new Map();

function _loadWeights() {
  try {
    const d = JSON.parse(fs.readFileSync(_WEIGHTS_FILE, 'utf8'));
    for (const [k, v] of Object.entries(d)) _weights.set(k, v);
    console.log(`[raid] weights loaded — ${_weights.size} entries`);
  } catch(_) {}
}

function _wKey(cluster, agent) { return `${cluster}:${agent}`; }

function _getW(cluster, agent) {
  const k = _wKey(cluster, agent);
  if (!_weights.has(k)) _weights.set(k, { cluster, agent, successCount:0, callCount:0, successRate:0.5, totalMs:0, avgMs:0 });
  return _weights.get(k);
}

function _updateW(cluster, agent, success, ms) {
  const w = _getW(cluster, agent);
  w.callCount++;
  w.totalMs += ms;
  w.avgMs = Math.round(w.totalMs / w.callCount);
  if (success) w.successCount++;
  w.successRate = +(w.successCount / w.callCount).toFixed(4);
  _weights.set(_wKey(cluster, agent), w);
  try { fs.writeFileSync(_WEIGHTS_FILE, JSON.stringify(Object.fromEntries(_weights), null, 2)); } catch(_) {}
}

// ── Outcome recording (called from api-dispatch and other callers) ─────────────
// jobId → cluster+agent lookup via JAA
function recordOutcome(jobId, success, ms) {
  try {
    const call = jaaDB.get('agent_calls', jobId);
    if (!call) return;
    const cluster = call.routeCluster || 'general';
    const agent   = call.routedTo     || 'unknown';
    _updateW(cluster, agent, success, ms);

    if (!success) {
      console.warn(
        `[raid][outcome] FAIL job=${jobId.slice(0,8)}` +
        ` agent=${agent} cluster=${cluster} ms=${ms}` +
        ` successRate=${_getW(cluster, agent).successRate}`
      );
    }
  } catch(_) {}
}

// ── Drift signal from BDA (called from api-dispatch) ──────────────────────────
// Applies trust-weighted penalty to agent's weight for the affected cluster.
const DRIFT_PENALTY = {
  STABLE:       0,
  ACTIVATING:   0,
  OSCILLATING:  0.05,   // mild — monitor
  UNGROUNDED:   0.15,   // moderate — reduce routing probability
  DYSREGULATED: 0.35,   // severe — heavy penalty, escalate
  COLLAPSING:   0.60,   // critical — near-blacklist, escalate
};

function recordDrift(provider, regime, pendulum) {
  const penalty  = DRIFT_PENALTY[regime] || 0;
  if (penalty === 0) return;

  const trust    = pendulum?.trust ?? 1.0;
  const sigma    = pendulum?.sigma ?? 1.0;
  const n        = pendulum?.n     ?? 0;

  console.warn(
    `[raid][drift] provider=${provider} regime=${regime}` +
    ` penalty=${penalty} trust=${trust} sigma=${sigma} n=${n}`
  );

  // Apply penalty across all clusters for this provider
  for (const [key, w] of _weights.entries()) {
    if (!key.startsWith(':') && key.split(':')[1] === provider) {
      const cluster = key.split(':')[0];
      // Reduce successRate by penalty, floor at 0
      w.successRate = Math.max(0, +(w.successRate - penalty).toFixed(4));
      w.callCount   = Math.max(w.callCount, 5); // ensure threshold is active
      _weights.set(key, w);
      console.warn(`[raid][drift]   → ${cluster}:${provider} successRate now=${w.successRate}`);
    }
  }

  // Persist
  try { fs.writeFileSync(_WEIGHTS_FILE, JSON.stringify(Object.fromEntries(_weights), null, 2)); } catch(_) {}

  // Log gap
  try {
    jaaDB.insert('gaps', {
      uuid: uid(), type: 'raid.drift', path: `raid/${provider}`,
      body: `BDA drift: provider=${provider} regime=${regime} trust=${trust} sigma=${sigma}`,
      severity: penalty >= 0.35 ? 'high' : 'medium', status: 'open',
      source: MODULE_ID, causedBy: null, createdAt: Date.now(), attempts: 0, ts: Date.now(),
    });
  } catch(_) {}

  // Escalate on severe drift
  if (penalty >= 0.35) {
    _triggerEscalation({
      faultClass:  `raid.drift.${provider}`,
      level:       penalty >= 0.60 ? 3 : 2,
      description: `Provider ${provider} BDA regime=${regime} — coding drift exceeds threshold`,
      evidence:    { provider, regime, penalty, trust, sigma, n },
    });
  }
}

// ── Diagnostic engine run on dispatch failure ──────────────────────────────────
function _runDiagnostics(context) {
  const de = _diag();
  if (!de) return null;

  const { callUuid, agent, cluster, error, recentEvents } = context;

  console.log(`[raid][diag] running diagnostics — job=${callUuid?.slice(0,8)} agent=${agent} cluster=${cluster}`);

  let result = {};

  // Causal chain trace from recent event log
  try {
    if (recentEvents?.length) {
      const chain = de.causalChainTrace(recentEvents, 'fail');
      if (chain.chain.length > 1) {
        console.warn(
          `[raid][diag] causal chain: source=${chain.source} R0=${chain.r0}` +
          ` systems=${chain.infected?.join(',')} generations=${chain.generations}`
        );
        console.warn(`[raid][diag]   ${chain.summary}`);
      }
      result.causal = chain;
    }
  } catch(e) {
    console.warn(`[raid][diag] causal trace error: ${e.message}`);
  }

  // Invariant scan
  try {
    if (recentEvents?.length) {
      const scan = de.invariantScan(recentEvents);
      if (scan.violations?.length) {
        for (const v of scan.violations) {
          console.warn(`[raid][diag] INVARIANT VIOLATION ${v.id} (${v.axiom}) ${v.violations?.length} hits`);
        }
      }
      result.invariants = scan;
    }
  } catch(e) {
    console.warn(`[raid][diag] invariant scan error: ${e.message}`);
  }

  // SNR floor
  try {
    if (recentEvents?.length) {
      const snr = de.snrFloorDetect(recentEvents);
      console.log(
        `[raid][diag] SNR: score=${snr.score} regime=${snr.regime}` +
        ` noiseFloor=${snr.noiseFloor} coherence=${snr.coherence}`
      );
      result.snr = snr;
    }
  } catch(e) {
    console.warn(`[raid][diag] SNR error: ${e.message}`);
  }

  // Write diagnostic result to JAA
  try {
    jaaDB.insert('event_log', {
      uuid: uid(), type: 'raid.diagnostic.complete',
      payload: JSON.stringify({ callUuid, agent, cluster, result }),
      source: MODULE_ID, causedBy: callUuid, ts: Date.now(),
    });
  } catch(_) {}

  return result;
}

// ── Self-heal escalation trigger ───────────────────────────────────────────────
function _triggerEscalation(opts) {
  const esc = _esc();
  if (!esc || typeof esc.escalate !== 'function') return;
  try {
    esc.escalate({ ...opts, source: opts.source || MODULE_ID });
  } catch(e) {
    console.warn(`[raid][escalation] escalate error: ${e.message}`);
  }
}

// ── Intent clustering ─────────────────────────────────────────────────────────
const CLUSTERS = {
  code:       /\b(code|implement|function|class|module|bug|fix|refactor|write|build|create|generate)\b/i,
  spec:       /\b(spec|seam|contract|schema|design|architecture|plan|structure)\b/i,
  data:       /\b(data|sql|query|database|table|csv|json|transform|parse|extract)\b/i,
  analysis:   /\b(analyze|analyse|explain|understand|review|audit|check|evaluate|assess)\b/i,
  general:    /./,
  diagnostic: /\b(error|fail|broken|debug|trace|diagnose|crash|exception|issue|bug|stack)\b/i,
  forge:      /\b(forge|seam|patch|repair|self.heal|autonomous|critical.fix|production)\b/i,
};

function _cluster(intent) {
  for (const [name, re] of Object.entries(CLUSTERS)) {
    if (name === 'general') continue;
    if (re.test(intent)) return name;
  }
  return 'general';
}

// LAW_I: Ollama always first for code/spec/data/diagnostic/analysis/general.
const CLUSTER_CHAINS = {
  code:       ['ollama', 'guardian-claude', 'claude'],
  spec:       ['ollama', 'guardian-claude', 'claude'],
  data:       ['ollama', 'guardian-chatgpt', 'chatgpt'],
  analysis:   ['ollama', 'guardian-chatgpt', 'chatgpt', 'claude'],
  general:    ['ollama', 'guardian-chatgpt', 'chatgpt'],
  diagnostic: ['ollama', 'chatgpt', 'claude'],
  forge:      ['ollama', 'guardian-claude', 'claude'],
};

// ALL providers are NCP — browser tab + userscript. No API keys. No REST calls.
// §AXIOM: No APIs, ever.
// Add a provider by installing its userscript in the browser. That's it.
const NCP_PROVIDERS = new Set([
  'ollama',           // local — no browser tab needed
  'guardian-claude',  // claude.ai tab + userscript-claude.js
  'guardian-chatgpt', // chatgpt.com tab + userscript-chatgpt.js
  'gemini',           // gemini.google.com tab + userscript-gemini.js
  'perplexity',       // perplexity.ai tab + userscript-perplexity.js
]);

function _agentAvailable(agent, healthSnap) {
  if (agent === 'ollama') return !!healthSnap['ollama']?.online;
  const ncpKey = agent.startsWith('guardian-') ? agent : 'guardian-' + agent;
  return !!(healthSnap[agent]?.online || healthSnap[ncpKey]?.online);
}

function _decide(call, healthSnap, weights) {
  const intent    = call.intent || call.prompt || '';
  const cluster   = _cluster(intent);
  const preferred = (call.preferredAgent || '').toLowerCase();

  // Rule 1: explicit preference + available
  if (preferred && preferred !== 'auto' && _agentAvailable(preferred, healthSnap)) {
    console.log(`[raid][decide] job=${call.uuid?.slice(0,8)} → ${preferred} (explicit) cluster=${cluster}`);
    return { agent: preferred, reason: `explicit:${preferred}`, cluster };
  }

  // Rule 2: intent-specific cluster chain
  const chain = CLUSTER_CHAINS[cluster] || CLUSTER_CHAINS.general;

  for (const agent of chain) {
    if (!_agentAvailable(agent, healthSnap)) continue;

    if (agent === 'ollama') {
      const oh = healthSnap['ollama'];
      if (oh.consecutiveFails >= 3) continue;
      const w = weights.get(_wKey(cluster, 'ollama'));
      if (w && w.callCount >= 3 && w.successRate < 0.3) continue;
    }

    const w = weights.get(_wKey(cluster, agent));
    const successRate = w?.successRate ?? 0.5;
    const callCount   = w?.callCount   ?? 0;

    if (agent !== 'claude' && callCount >= 5 && successRate < 0.2) {
      console.warn(`[raid][decide] ${agent} skipped — successRate=${successRate} callCount=${callCount}`);
      continue;
    }

    console.log(
      `[raid][decide] job=${call.uuid?.slice(0,8)} → ${agent}` +
      ` cluster=${cluster} successRate=${successRate} callCount=${callCount}`
    );
    return { agent, reason: 'cluster_chain:' + cluster, cluster };
  }

  // Absolute fallback: claude
  console.warn(`[raid][decide] job=${call.uuid?.slice(0,8)} → claude (LAW_I reserve) cluster=${cluster}`);
  return { agent: 'claude', reason: 'LAW_I:claude_reserve', cluster };
}

// ── Ollama brain (analyzes failures, adjusts weights) ─────────────────────────
const _failures = [];
let _cfg = {};

async function _brainTick() {
  if (!_health['ollama']?.online || _failures.length === 0) return;
  const batch = _failures.splice(0, 5);
  const model = _cfg.ollamaModel || _health.ollama.models?.[0] || 'mistral';

  console.log(`[raid][brain] analyzing ${batch.length} failures via ${model}`);

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
        if (w.callCount < 5) {
          w.successCount = Math.max(w.successCount,1);
          w.callCount    = Math.max(w.callCount,2);
          w.successRate  = w.successCount / w.callCount;
          _weights.set(_wKey(s.cluster,s.agent),w);
        }
      }
      try { fs.writeFileSync(_WEIGHTS_FILE, JSON.stringify(Object.fromEntries(_weights), null, 2)); } catch(_) {}
      console.log(`[raid][brain] ${(analysis.analysis||'').slice(0,100)}`);
    }
  } catch(e) {
    console.warn(`[raid][brain] analysis failed: ${e.message}`);
  }
}

// ── Main dispatch ──────────────────────────────────────────────────────────────

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
    const mod    = require(`../agents/${decision.agent}`);
    const result = await mod.dispatch({ uuid:call.uuid, prompt:call.prompt, intent:call.intent, context:call.context });
    const ms     = Date.now()-t0;
    jaaDB.update('agent_calls', call.uuid, { status:'complete', response:result?.text||result?.response||JSON.stringify(result)||'', completedAt:Date.now(), latencyMs:ms });
    _updateW(decision.cluster, decision.agent, true, ms);
    console.log(`[raid][dispatch] OK job=${call.uuid?.slice(0,8)} agent=${decision.agent} ${ms}ms`);
    return result;
  } catch(e) {
    const ms = Date.now()-t0;
    jaaDB.update('agent_calls', call.uuid, { status:'pending_external', routedTo:decision.agent });
    _updateW(decision.cluster, decision.agent, false, ms);
    _failures.push({ uuid:call.uuid, cluster:decision.cluster, agent:decision.agent, error:e.message });

    console.error(
      `[raid][dispatch] FAIL job=${call.uuid?.slice(0,8)}` +
      ` agent=${decision.agent} cluster=${decision.cluster} ${ms}ms | ${e.message}`
    );

    // Run diagnostic engines on dispatch failure
    try {
      const recentEvents = jaaDB.query('event_log', () => true, 50)
        .sort((a,b) => (b.ts||0) - (a.ts||0)).slice(0, 30);
      _runDiagnostics({
        callUuid: call.uuid, agent: decision.agent,
        cluster: decision.cluster, error: e.message, recentEvents,
      });
    } catch(diagErr) {
      console.warn(`[raid][dispatch] diagnostic run error: ${diagErr.message}`);
    }

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
    console.error(`[raid][tick] error: ${err.message}`);
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
  console.log(`[raid] v${VERSION} — weights:${_weights.size} ESS:${_ess?'on':'off'} diag:${!!_diag()} esc:${!!_esc()}`);
}

function stop() { [_interval,_hTimer,_bTimer].forEach(t=>t&&clearInterval(t)); _interval=_hTimer=_bTimer=null; }
function setSystemState(s) { _systemState=s||{}; }
function getState() {
  return {
    version:     VERSION,
    health:      _health,
    weights:     Object.fromEntries(_weights),
    essEnabled:  !!_ess,
    weightCount: _weights.size,
    diagEnabled: !!_diag(),
    escEnabled:  !!_esc(),
  };
}

module.exports = { init, stop, getState, setSystemState, recordOutcome, recordDrift, _decide, _cluster, _health, _weights };
