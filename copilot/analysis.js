'use strict';
/**
 * copilot/analysis.js
 * comp_id: nexus.copilot.analysis
 * uuid: nexus-copilot-analysis-v1-0000-2026-0627-jamesbrooks-001
 *
 * ANALYSIS — slow, derivation-based cognition.
 * Reads: CFR causal kernel, vector memory, diagnostic engines,
 *        semantic layer, invariants.
 * Fires when INTUITION returns null.
 * Assembles 7-layer context, dispatches to Ollama sovereign system.
 */

const http = require('http');
const CX_URL  = process.env.CORTEX_URL   || 'http://127.0.0.1:3748';
const INTEL_URL = process.env.INTELLIGENCE_URL || 'http://127.0.0.1:3753'; // intelligence is sovereign (moved out of cortex 2026-09-19)
const OL_URL  = process.env.OLLAMA_URL   || 'http://127.0.0.1:3749';
const OR_URL  = process.env.ORCH_URL     || 'http://127.0.0.1:9000';
const GD_URL  = process.env.GUARDIAN_URL || 'http://127.0.0.1:7820';
const IDR_URL = process.env.IDEARIUM_URL || 'http://127.0.0.1:4800';

// Blueprint index — component/CLI/SEAM awareness (§BP-01, zero-network, fs read)
let _blueprintIndex = null;
function _getBlueprintIndex() {
  if (_blueprintIndex) return _blueprintIndex;
  try {
    const bi = require('../lib/blueprint-index');
    _blueprintIndex = bi;
    return bi;
  } catch(_) { return null; }
}


async function _get(url) {
  return new Promise(res => {
    http.get(url, { timeout: 3000 }, r => {
      let d=''; r.on('data',c=>d+=c);
      r.on('end',()=>{try{res(JSON.parse(d));}catch(_){res(null);}});
    }).on('error',()=>res(null)).on('timeout',()=>res(null));
  });
}
async function _post(url, body) {
  return new Promise((res,rej)=>{
    const b=JSON.stringify(body);
    const u=new URL(url);
    const req=http.request({hostname:u.hostname,port:u.port||80,path:u.pathname,
      method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(b)},timeout:6000},
      r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d));}catch(_){res(null);}});});
    req.on('error',rej); req.write(b); req.end();
  });
}

/**
 * Assemble 7-layer context for deep analysis.
 * Each layer is a different dimension of system knowledge.
 */
async function assembleContext(prompt, stream = [], session = {}) {
  const layers = [];

  // L0 — Stream consciousness (last 30 events)
  if (stream.length) {
    const summary = stream.slice(-30).map(e=>e.type||'?').join(', ');
    layers.push(`[L0:STREAM] ${summary.slice(0,300)}`);
  }

  // L1 — System health telemetry
  try {
    const h = await _get(`${OR_URL}/health`);
    if (h) layers.push(`[L1:HEALTH] online:${h.online}/${h.total} uptime:${Math.round(h.uptime||0)}s`);
  } catch(_) {}

  // L2 — Provider health (NCP tabs)
  try {
    const p = await _get(`${GD_URL}/providers`);
    const provs = p?.providers || [];
    if (provs.length) layers.push(`[L2:PROVIDERS] ${provs.map(p=>p.provider||p.name||'?').join(', ')}`);
  } catch(_) {}

  // L3 — Open gaps + SEAM state
  try {
    const g = await _get(`${CX_URL}/api/gaps?status=open&severity=high&limit=5`);
    const gaps = g?.gaps || g?.rows || [];
    if (gaps.length) layers.push(`[L3:GAPS] ${gaps.length} high: ${gaps.map(g=>g.type||'?').join(', ')}`);
  } catch(_) {}

  // L4 — CFR causal field (sigma, delta, regime, coherence, friction, entropy)
  // §CFR: the CFR ledger is the truth substrate — sigma drives gap emission
  try {
    // 2026-09-19: the CFR ledger is served by the orchestrator (cortex only relayed a flat copy that
    // lacked the `cfr` envelope this code reads). The old fallback (/api/cortex/cfr/state) was dead.
    const cfr = await _get(`${OR_URL}/cfr/health`);
    const f   = cfr?.cfr || cfr?.field || cfr;
    if (f && (f.sigma !== undefined || f.regime)) {
      const sigma     = typeof f.sigma === 'object' ? f.sigma?.score : f.sigma;
      const delta     = f.delta?.tension ?? f.tension ?? 0;
      const regime    = f.regime || 'unknown';
      const coherence = f.coherence ?? f.field?.coherence ?? 0;
      const friction  = f.friction  ?? f.field?.friction  ?? 0;
      layers.push(
        `[L4:CFR] σ:${(sigma||0).toFixed(3)} Δ:${delta.toFixed(3)} ` +
        `regime:${regime} coherence:${coherence.toFixed(3)} friction:${friction.toFixed(3)}`
      );
      // High sigma = system under stress — flag it explicitly
      if ((sigma||0) > 0.65) layers.push(`[L4:CFR:ALERT] sigma=${(sigma||0).toFixed(3)} ABOVE 0.65 — system stressed`);
    }
  } catch(_) {}

  // L5 — Memory: user model + recent chat history
  if (session?.sessionId) {
    try {
      const mem = await _get(`${CX_URL}/api/memory?table=chat_log&n=5`);
      const rows = mem?.rows || [];
      if (rows.length) {
        const hist = rows.slice(-3).map(r=>`  U: ${(r.prompt||'').slice(0,60)}\n  A: ${(r.response||'').slice(0,80)}`).join('\n');
        layers.push(`[L5:MEMORY] Recent exchanges:\n${hist}`);
      }
    } catch(_) {}
  }

  // L6 — Intelligence: crystallised patterns + RCA findings
  try {
    const pat = await _get(`${INTEL_URL}/api/intelligence/crystals?limit=3`);
    const patterns = pat?.patterns || [];
    if (patterns.length) {
      layers.push(`[L6:PATTERNS] ${patterns.slice(0,3).map(p=>`${p.precursor}→${p.outcome}(${p.count}×)`).join(', ')}`);
    }
  } catch(_) {}

  // L7 — Component / CLI / SEAM awareness (§BP-01 blueprint index)
  // Lets the co-pilot know what every system can DO, not just its health
  try {
    const bi = _getBlueprintIndex();
    if (bi) {
      const block = bi.copilotContextBlock(prompt);
      if (block) layers.push(block);
    }
  } catch(_) {}

  // L8 — CLI command lookup (if prompt looks like a command)
  // Surfaces the exact route and description so the model can answer precisely
  try {
    const bi = _getBlueprintIndex();
    if (bi && /^\/?[a-z][a-z0-9.-]+\b/.test(prompt.trim())) {
      const word = prompt.trim().replace(/^\//, '').split(/\s+/)[0];
      const hit  = bi.lookupCLI(word);
      if (hit) {
        layers.push(
          `[L8:CLI] ${hit.command} → ${hit.method} ${hit.path} (${hit.systemId}) — ${hit.description.slice(0,80)}`
        );
      }
    }
  } catch(_) {}

  // Invariants — always inject these into analysis context
  const invariants = [
    'NEXUS is a sovereign AI orchestration platform',
    'SISO is the foundation — every gate has one signature',
    'Cortex is the source of truth for memory',
    'RAID routes intent to the best tool — never hardcode provider',
    'Every component has a UUID and comp_id',
    'Disk before behavior — §LAW II',
  ];
  layers.push(`[INVARIANTS] ${invariants.join(' | ')}`);

  return layers.join('\n');
}

/**
 * Dispatch to Ollama sovereign system, poll for result.
 */
async function _callOllama(prompt, context, opts = {}) {
  try {
    const job = await _post(`${OL_URL}/api/jobs`, {
      prompt:      `SYSTEM CONTEXT:\n${context}\n\nUSER: ${prompt}\nNEXUS CO-PILOT: `,
      // §BUGFIX 2026-07-04: same fix as lifeline.js/server.js — was forcing
      // 'mistral:7b' instead of leaving it unset for ollama-bridge's real
      // default to apply.
      ...(opts.model ? { model: opts.model } : {}),
      intent:      opts.intent || 'ask',
      componentId: 'copilot.analysis',
      hookId:      'copilot.analysis.to-ollama',
      agentId:     opts.agentId || 'copilot',          // §0.39.269 — the bridge files the exchange under copilot's memory
      ...(opts.intent === 'adversarial-probe' ? { record: false } : {}),
      requestId:   opts.requestId,
      sessionId:   opts.sessionId,
      maxTokens:   1024,
      timeoutMs:   35000,
    });
    if (!job?.jobId) return null;

    // Poll for result (max 35s)
    for (let i = 0; i < 35; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const status = await _get(`${OL_URL}/api/jobs/${job.jobId}`);
      if (status?.job?.status === 'complete') return status.job.result || '';
      if (status?.job?.status === 'failed')   return null;
    }
    return null;
  } catch(_) { return null; }
}

/**
 * Full analysis pass.
 * @returns { text, modelUsed, intent, contextLayers, source }
 */
async function answer(prompt, session, stream = [], opts = {}) {
  let context = await assembleContext(prompt, stream, session);
  // §0.39.269 — copilot's own memory (lib/agent-memory.js, over the download manager). Not for the self-test.
  if (opts.intent !== 'adversarial-probe') {
    try {
      const mem = await require('../lib/agent-memory.js').recall({ agentId: 'copilot', query: prompt, budget: 2000 });
      if (mem.text) context = `${context}\n${mem.text}`;
    } catch (_) { /* memory is context, never a reason not to answer */ }
  }
  const layers  = context.split('\n').filter(Boolean).length;

  const text = await _callOllama(prompt, context, {
    intent:    opts.intent    || 'ask',
    requestId: opts.requestId,
    sessionId: session?.sessionId,
  });

  if (!text) {
    return {
      text: 'Analysis unavailable — Ollama offline or timed out. Try /status to check providers.',
      modelUsed: 'none', intent: 'ask', contextLayers: layers, source: 'analysis.failed'
    };
  }

  return { text, modelUsed: 'ollama', intent: 'ask', contextLayers: layers, source: 'analysis.ollama' };
}

module.exports = { answer, assembleContext };
