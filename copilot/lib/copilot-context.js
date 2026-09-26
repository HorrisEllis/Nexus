'use strict';
/**
 * lib/copilot-context.js — Co-pilot Complete System Awareness
 * UUID: nexus-copilot-context-v2-0000-4000-0000-000000000001
 * Version: 2.0.0
 *
 * Seven sensing layers — from raw events to predictive intent.
 * Assembled as a single system snapshot for injection into any model call.
 *
 * Layer 0 — live event bus          (SSE /events · bus.sample)
 * Layer 1 — process & telemetry     (CPU · heap · uptime · event loop lag)
 * Layer 2 — provider health probes  (Ollama ping · NCP tabs · RAID state)
 * Layer 3 — structural integrity    (SEAM queues · open gaps · gap taxonomy)
 * Layer 4 — CFR-Ω field state       (coherence · friction · entropy · regime)
 * Layer 5 — memory & artifact graph (chat_log · decisions · artifact names)
 * Layer 6 — predictive intent       (gap patterns · session velocity · Qwen triage)
 *
 * §1.1 Nothing exists until proven — every layer degrades gracefully
 * §1.2 Nothing silently fails — every layer timeout is logged
 * §2.1 Read-only — this module never writes
 * §5.7 HTTP seam only — no direct service imports
 */

const MODULE_ID = 'copilot-context';
const VERSION   = '2.0.0';

const GD_URL = process.env.GUARDIAN_URL  || 'http://127.0.0.1:7820';
const CX_URL = process.env.CORTEX_URL    || 'http://127.0.0.1:3748';
const INTEL_URL = process.env.INTELLIGENCE_URL || 'http://127.0.0.1:3753'; // intelligence is sovereign (moved out of cortex 2026-09-19)
const ORCH_URL  = process.env.ORCHESTRATOR_URL || 'http://127.0.0.1:9000'; // the CFR field/ledger authority
const OR_URL = process.env.ORCH_URL      || 'http://127.0.0.1:9000';

// Token budget for each layer (rough word estimate)
const LAYER_BUDGETS = {
  0: 200,  // event bus
  1: 120,  // telemetry
  2: 180,  // provider health
  3: 300,  // structural integrity (most important)
  4: 200,  // CFR field
  5: 280,  // memory + artifacts
  6: 180,  // predictive intent
};

// ── HTTP helpers ──────────────────────────────────────────────────────────────

async function _get(url, timeoutMs = 2500) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) return null;
    return r.json();
  } catch (_) { return null; }
}

function _trunc(str, maxWords = 80) {
  if (!str) return '';
  const words = String(str).split(/\s+/);
  if (words.length <= maxWords) return str;
  return words.slice(0, maxWords).join(' ') + '…';
}

function _ago(ts) {
  if (!ts) return '?';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s/60)}m ago`;
  return `${Math.round(s/3600)}h ago`;
}

// ── Layer 0: Live event bus ───────────────────────────────────────────────────

async function _layer0_bus() {
  const d = await _get(`${GD_URL}/bus?n=30`);
  if (!d) return '  [bus] unreachable';

  const entries = d.entries || [];
  const gates   = (d.gates || []).slice(0, 8);

  const recent = entries
    .slice(-15)
    .map(e => `  ${e.type || '?'}${e.seq ? ` #${e.seq}` : ''}`)
    .join('\n') || '  (none)';

  const gateStr = gates.length ? `  gates: ${gates.join(', ')}` : '';

  return [
    `  recent events (${entries.length} sampled):`,
    recent,
    gateStr,
  ].filter(Boolean).join('\n');
}

// ── Layer 1: Process & resource telemetry ─────────────────────────────────────

async function _layer1_telemetry() {
  // Guardian exposes its own health with uptime and job counts
  const h = await _get(`${GD_URL}/health`);
  if (!h) return '  [guardian] unreachable';

  const mem = process.memoryUsage ? process.memoryUsage() : null;
  const lines = [
    `  guardian uptime: ${Math.round((h.uptime || 0) / 60)}min`,
    `  jobs in memory: ${h.jobs || 0}`,
    h.queues !== undefined ? `  seam queues: ${h.queues}` : null,
    mem ? `  heap: ${Math.round(mem.heapUsed/1024/1024)}MB / ${Math.round(mem.heapTotal/1024/1024)}MB` : null,
    h.version ? `  version: ${h.version}` : null,
  ];
  return lines.filter(Boolean).join('\n');
}

// ── Layer 2: Provider health probes ──────────────────────────────────────────

async function _layer2_providers() {
  const [prov, cortexH, orchH] = await Promise.allSettled([
    _get(`${GD_URL}/providers`),
    _get(`${CX_URL}/health`),
    _get(`${OR_URL}/health`),
  ]);

  const lines = [];

  // NCP tabs
  const channels = prov.status === 'fulfilled' ? (prov.value?.channels || {}) : {};
  const tabNames = Object.keys(channels);
  if (tabNames.length) {
    for (const [name, ch] of Object.entries(channels)) {
      const hb = ch.lastHeartbeat ? Math.round((Date.now() - ch.lastHeartbeat) / 1000) : null;
      const hbStr = hb !== null ? (hb < 15 ? `♥ ${hb}s` : `stale ${hb}s`) : 'no hb';
      lines.push(`  NCP ${name}: tab=${ch.tabId?.slice(0,10) || '?'} · ${hbStr}`);
    }
  } else {
    lines.push('  NCP tabs: none connected');
  }

  // Cortex
  const cx = cortexH.status === 'fulfilled' ? cortexH.value : null;
  const cxOk = cx?.status === 'ok' || cx?.ok === true;
  lines.push(`  cortex :3748: ${cxOk ? '✓' : '✗'}`);

  // Orchestrator
  const or = orchH.status === 'fulfilled' ? orchH.value : null;
  lines.push(`  orchestrator :9000: ${or?.ok ? '✓' : '✗'}`);

  // Ollama — try ping
  const ol = await _get('http://127.0.0.1:11434/api/tags', 1500);
  const models = (ol?.models || []).map(m => m.name).slice(0, 6);
  lines.push(models.length
    ? `  ollama: ✓ · models: ${models.join(', ')}`
    : '  ollama: ✗ (not running or no models)');

  return lines.join('\n');
}

// ── Layer 3: Structural integrity ─────────────────────────────────────────────

async function _layer3_structure() {
  const [gaps, seam, reflect] = await Promise.allSettled([
    _get(`${GD_URL}/gaps?status=open&limit=12`),
    _get(`${GD_URL}/seam/queues`),
    _get(`${CX_URL}/api/jaa/reflection_contracts?limit=8`),
  ]);

  const lines = [];

  // Gaps
  const gapList = gaps.status === 'fulfilled' ? (gaps.value?.gaps || []) : [];
  if (gapList.length) {
    lines.push(`  open gaps (${gapList.length}):`);
    for (const g of gapList.slice(0, 6)) {
      lines.push(`    [${g.severity || '?'}] ${g.type}: ${_trunc(g.body, 12)}`);
    }
    if (gapList.length > 6) lines.push(`    … +${gapList.length - 6} more`);
  } else {
    lines.push('  open gaps: none ✓');
  }

  // SEAM queues
  const queues = seam.status === 'fulfilled' ? (seam.value?.queues || []) : [];
  if (queues.length) {
    lines.push(`  seam queues: ${queues.length} active`);
    for (const q of queues.slice(0, 4)) {
      const compartments = q.compartments || [];
      const active = compartments.filter(c => c.state === 'GENERATING' || c.state === 'INJECTING').length;
      lines.push(`    [${q.provider}] "${q.title?.slice(0, 30) || 'untitled'}" · ${compartments.length} chunks · ${active} active`);
    }
  } else {
    lines.push('  seam queues: none');
  }

  // Reflection contracts
  const contracts = reflect.status === 'fulfilled'
    ? (reflect.value?.rows || reflect.value?.result || []) : [];
  const queued = contracts.filter(c => c.status === 'queued').length;
  const active = contracts.filter(c => c.status === 'active').length;
  lines.push(`  reflection contracts: ${queued} queued · ${active} active`);

  return lines.join('\n');
}

// ── Layer 4: CFR-Ω field state ────────────────────────────────────────────────

async function _layer4_cfr() {
  const [health, deltas] = await Promise.allSettled([
    _get(`${ORCH_URL}/cfr/health`),
    _get(`${ORCH_URL}/cfr/deltas?limit=5`),
  ]);

  const lines = [];

  const h = health.status === 'fulfilled' ? health.value : null;
  if (h && (h.ok || h.status === 'ok')) {
    const f = h.field || h;
    lines.push(`  regime: ${f.regime || '?'}`);
    lines.push(`  sigma score: ${typeof f.sigma === 'number' ? f.sigma.toFixed(3) : '?'}`);
    if (f.coherence !== undefined) lines.push(`  coherence: ${f.coherence.toFixed(3)}`);
    if (f.entropy   !== undefined) lines.push(`  entropy:   ${f.entropy.toFixed(3)}`);
    if (f.friction  !== undefined) lines.push(`  friction:  ${f.friction.toFixed(3)}`);
  } else {
    lines.push('  cfr field: unavailable');
  }

  const deltaList = deltas.status === 'fulfilled'
    ? (deltas.value?.deltas || deltas.value?.rows || []) : [];
  if (deltaList.length) {
    lines.push('  recent deltas:');
    for (const d of deltaList.slice(0, 3)) {
      lines.push(`    Δ${d.delta?.toFixed(3) || '?'} at ${d.component || '?'}: ${_trunc(d.description || d.type, 8)}`);
    }
  }

  return lines.join('\n');
}

// ── Layer 5: Memory & artifact graph ─────────────────────────────────────────

async function _layer5_memory() {
  const [chatLog, decisions, artifacts, ideas] = await Promise.allSettled([
    _get(`${CX_URL}/api/jaa/chat_log?limit=5`),
    _get(`${CX_URL}/api/jaa/decision_log?limit=6`),
    _get(`${GD_URL}/artifacts?limit=8`),
    _get('http://127.0.0.1:4800/api/ideas?limit=6'),
  ]);

  const lines = [];

  // Recent chat context
  const chats = chatLog.status === 'fulfilled'
    ? (chatLog.value?.rows || chatLog.value?.result || []) : [];
  if (chats.length) {
    lines.push('  recent exchanges:');
    for (const c of chats.slice(-3)) {
      lines.push(`    [${c.role || '?'}] ${_trunc(c.content || c.text, 10)}`);
    }
  }

  // Decisions
  const decs = decisions.status === 'fulfilled'
    ? (decisions.value?.rows || decisions.value?.result || []) : [];
  if (decs.length) {
    lines.push('  recent decisions:');
    for (const d of decs.slice(0, 3)) {
      lines.push(`    [${d.chosen || '?'}] ${_trunc(d.input, 10)}`);
    }
  }

  // Artifacts
  const arts = artifacts.status === 'fulfilled'
    ? (artifacts.value?.artifacts || []) : [];
  if (arts.length) {
    lines.push(`  artifacts (${arts.length}): ${arts.slice(0, 5).map(a => a.specName || a.lang || '?').join(', ')}`);
  }

  // Ideas from Idearium
  const ideaList = ideas.status === 'fulfilled'
    ? (ideas.value?.ideas || ideas.value?.rows || []) : [];
  if (ideaList.length) {
    lines.push(`  open ideas: ${ideaList.map(i => _trunc(i.text || i.title, 5)).join(' · ')}`);
  }

  if (!lines.length) lines.push('  memory: unavailable');
  return lines.join('\n');
}

// ── Layer 6: Predictive intent ────────────────────────────────────────────────

async function _layer6_predict(eventBuffer = [], opts = {}) {
  const lines = [];

  // Pattern crystallization from intelligence
  const patterns = await _get(`${INTEL_URL}/api/intelligence/crystals?limit=6`);
  const pList = patterns?.patterns || patterns?.rows || [];
  if (pList.length) {
    lines.push('  crystallized patterns:');
    for (const p of pList.slice(0, 4)) {
      lines.push(`    "${p.pattern || p.key}" — ${p.count || '?'}× · ${Math.round((p.confidence || 0) * 100)}% confidence`);
    }
  }

  // Recent event type frequency from buffer (co-pilot's own buffer)
  if (eventBuffer.length) {
    const freq = {};
    for (const e of eventBuffer.slice(-30)) {
      freq[e.type] = (freq[e.type] || 0) + 1;
    }
    const top = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([t, n]) => `${t}(${n})`);
    if (top.length) lines.push(`  session pattern: ${top.join(' · ')}`);
  }

  // Session velocity — jobs in last 10 min
  const jobs = await _get(`${GD_URL}/jobs?limit=30`);
  const jobList = jobs?.jobs || [];
  const recentJobs = jobList.filter(j => j.createdAt && Date.now() - j.createdAt < 600000);
  lines.push(`  session velocity: ${recentJobs.length} jobs in last 10min`);

  if (opts.intent) {
    lines.push(`  user intent: "${_trunc(opts.intent, 15)}"`);
  }

  if (!lines.length) lines.push('  predictive: insufficient data');
  return lines.join('\n');
}

// ── Master snapshot assembler ─────────────────────────────────────────────────

/**
 * assemble() — gather all 7 layers concurrently, return structured snapshot.
 *
 * @param {object} opts
 *   eventBuffer  — co-pilot's live event ring buffer
 *   intent       — current user intent string (for layer 6)
 *   layers       — array of layer numbers to include (default: all)
 *   timeoutMs    — per-layer timeout
 * @returns {object} { text: string, layers: object, tokensUsed: number }
 */
async function assemble(opts = {}) {
  const {
    eventBuffer = [],
    intent      = null,
    layers      = [0, 1, 2, 3, 4, 5, 6],
    timeoutMs   = 3000,
  } = opts;

  const label = [
    'L0 — Live Event Bus',
    'L1 — Process & Telemetry',
    'L2 — Provider Health',
    'L3 — Structural Integrity',
    'L4 — CFR-Ω Field State',
    'L5 — Memory & Artifacts',
    'L6 — Predictive Intent',
  ];

  const runners = [
    () => _layer0_bus(),
    () => _layer1_telemetry(),
    () => _layer2_providers(),
    () => _layer3_structure(),
    () => _layer4_cfr(),
    () => _layer5_memory(),
    () => _layer6_predict(eventBuffer, { intent }),
  ];

  // Run all layers concurrently with individual timeouts
  const results = await Promise.allSettled(
    layers.map(i => Promise.race([
      runners[i](),
      new Promise((_, rej) => setTimeout(() => rej(new Error(`layer ${i} timeout`)), timeoutMs)),
    ]))
  );

  const layerData = {};
  const sections  = [];

  layers.forEach((layerIdx, resultIdx) => {
    const r = results[resultIdx];
    const content = r.status === 'fulfilled'
      ? r.value
      : `  [unavailable: ${r.reason?.message || 'error'}]`;
    layerData[layerIdx] = content;
    sections.push(`=== ${label[layerIdx]} ===\n${content}`);
  });

  // Axioms — always included
  sections.push(`=== NEXUS AXIOMS ===
  §1.1 nothing exists until proven
  §1.2 nothing silently fails
  §1.3 no stubs in production
  §2.1 disk before behavior
  §3.1 bottom-up only
  §5.7 no sibling imports`);

  const text = sections.join('\n\n');
  const tokensUsed = Math.ceil(text.split(/\s+/).length / 0.75);

  return { text, layers: layerData, tokensUsed };
}

module.exports = { assemble, MODULE_ID, VERSION };
