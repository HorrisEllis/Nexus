'use strict';
/**
 * copilot/intuition.js
 * comp_id: nexus.copilot.intuition
 * uuid: nexus-copilot-intuition-v1-0000-2026-0627-jamesbrooks-001
 * spec: docs/contract-queue.spec
 *
 * INTUITION — fast, associative, pattern-based cognition.
 * Reads: pattern engine, crystal lattice, user model, stream buffer.
 * Speed: <50ms. No model call. Falls through if no confident answer.
 *
 * This is the first faculty. If it returns null, ANALYSIS takes over.
 * Answers from what the system already knows.
 */

const http = require('http');

// §0.39.267 — _getBP() was called 6× in this file but only defined in copilot/server.js, so every
// blueprint-backed answer (systems, components, cli, seam, "what is X", self-awareness) threw
// ReferenceError. Same lazy loader as server.js.
let _blueprintIndex = null;
function _getBP() {
  if (_blueprintIndex) return _blueprintIndex;
  try { _blueprintIndex = require('../lib/blueprint-index'); return _blueprintIndex; } catch (_) { return null; }
}

const CX_URL = process.env.CORTEX_URL || 'http://127.0.0.1:3748';
const INTEL_URL = process.env.INTELLIGENCE_URL || 'http://127.0.0.1:3753'; // intelligence is sovereign (moved out of cortex 2026-09-19)
const ORCH_URL  = process.env.ORCHESTRATOR_URL || 'http://127.0.0.1:9000'; // the CFR field/ledger authority

async function _fetch(url) {
  return new Promise((res, rej) => {
    http.get(url, { timeout: 2000 }, r => {
      let d = ''; r.on('data', c => d += c);
      r.on('end', () => { try { res(JSON.parse(d)); } catch(_) { res(null); } });
    }).on('error', () => res(null)).on('timeout', () => res(null));
  });
}

// Greeting fast-path
const GREETING_RE = /^(hi|hello|hey|sup|yo|what's up|good (morning|evening|afternoon))\b/i;
const CONVERSATIONAL_RE = /^(how are you|you there|you online|you awake)\b/i;

// §fix 2026-07-04 — these 6 constants were used but never declared, crash-looping copilot
const AWARE_RE    = /^(what do you know|what can you see|what are you aware of|your knowledge|capabilities|what do you have access to)\b/i;
const SYSTEMS_RE  = /^(systems?|list systems?|show systems?|what systems?|all systems?)\b/i;
const COMP_RE     = /^(components?|list components?|show components?|what components?)\b/i;
const CLI_RE      = /^(cli|commands?|list commands?|show commands?|what commands?)\b/i;
const SEAM_RE     = /^(seam|hooks?|list hooks?|show hooks?|wires?)\b/i;
const ROUTE_RE    = /^\/([a-z][a-z0-9._-]{1,40})$|^(what is|what does|look up|find)\s+([a-z][a-z0-9._-]{1,40})\b/i;

// Status queries
const STATUS_RE = /^\/(status|health)$|^(status|health|is everything ok|how's the system)\b/i;
const STREAM_RE = /^(stream|what'?s happening|recent events|show me the stream|what'?s going on)\b/i;
const PATTERN_RE = /^(patterns?|what patterns|dominant|frequent|what do you see)\b/i;
const GAPS_RE = /^\/?(gaps?)\s*$|^(any gaps|open gaps|how many gaps|gap count)\b/i;
const SIGMA_RE = /^(sigma|cfr|field state|what'?s sigma)\b/i;

/**
 * Attempt to answer from patterns, crystals, stream, user model.
 * Returns { text, modelUsed, intent, source } or null if can't answer confidently.
 *
 * @param {string}   prompt  — user's input
 * @param {object}   session — current session context
 * @param {object[]} stream  — recent events from consciousness stream
 */
async function answer(prompt, session, stream = []) {
  const lower = prompt.toLowerCase().trim();

  // ── Activity recall ─────────────────────────────────────────────────────────
  // §0.39.267 — "what have you been up to?" / "what's ollama been doing?" — answered from what copilot
  // records (ollama activity log, self-test, scheduler, triggers, chat_log, repo_agent_log), never generated.
  // Before the greeting check so "hey, what have you been up to" lands here.
  try {
    const recall = require('./lib/activity-recall.js');
    if (recall.matches(prompt)) {
      const r = recall.answer(prompt, stream);
      if (r) { delete r.recall; return r; }
    }
  } catch (_) { /* recall is best-effort; fall through to the normal paths */ }

  // ── Greeting ────────────────────────────────────────────────────────────────
  if (GREETING_RE.test(lower) || CONVERSATIONAL_RE.test(lower)) {
    const greets = [
      'Online. What do you need?',
      'Here. What are you working on?',
      'Co-pilot active. Go.',
      'Ready.',
    ];
    return { text: greets[Math.floor(Math.random() * greets.length)],
      modelUsed: 'data-only', intent: 'greeting', source: 'intuition.greeting' };
  }

  // ── Stream state ────────────────────────────────────────────────────────────
  if (STREAM_RE.test(lower)) {
    if (!stream.length) return { text: 'Stream empty — no events yet.',
      modelUsed: 'data-only', intent: 'stream', source: 'intuition.stream' };
    const recent = stream.slice(-8).map(e => `  ${e.type || '?'}`).join('\n');
    return { text: `Last ${Math.min(stream.length, 8)} events:\n${recent}`,
      modelUsed: 'data-only', intent: 'stream', source: 'intuition.stream' };
  }

  // ── Pattern summary from stream ─────────────────────────────────────────────
  if (PATTERN_RE.test(lower)) {
    const types = {};
    for (const e of stream) types[e.type] = (types[e.type] || 0) + 1;
    const top = Object.entries(types).sort((a,b)=>b[1]-a[1]).slice(0,5);
    if (!top.length) return null;
    return { text: `Dominant patterns in stream:\n${top.map(([t,n])=>`  ${t}: ${n}×`).join('\n')}`,
      modelUsed: 'data-only', intent: 'patterns', source: 'intuition.patterns' };
  }

  // ── Crystal patterns from cortex ────────────────────────────────────────────
  if (lower.includes('crystal') || lower.includes('learned') || lower.includes('what do you know')) {
    try {
      const d = await _fetch(`${INTEL_URL}/api/intelligence/crystals?limit=5`);
      const patterns = d?.patterns || [];
      if (!patterns.length) return null;
      return { text: `Crystallised patterns:\n${patterns.slice(0,5).map(p=>`  ${p.precursor} → ${p.outcome} (${p.count}×, ${Math.round((p.confidence||0)*100)}%)`).join('\n')}`,
        modelUsed: 'data-only', intent: 'patterns', source: 'intuition.crystals' };
    } catch(_) {}
  }

  // ── Gap count ───────────────────────────────────────────────────────────────
  if (GAPS_RE.test(lower)) {
    try {
      const d = await _fetch(`${CX_URL}/api/gaps?status=open&limit=1`);
      const total = d?.total ?? (d?.gaps?.length ?? '?');
      return { text: `${total} open gap(s).`,
        modelUsed: 'data-only', intent: 'tool', source: 'intuition.gaps' };
    } catch(_) {}
  }

  // ── Sigma / CFR field ───────────────────────────────────────────────────────
  if (SIGMA_RE.test(lower)) {
    try {
      const d = await _fetch(`${ORCH_URL}/cfr/health`);
      const sigma = d?.cfr?.sigma?.toFixed(3) ?? '?';
      const regime = d?.cfr?.regime ?? '?';
      return { text: `CFR field: sigma=${sigma} regime=${regime}`,
        modelUsed: 'data-only', intent: 'cfr', source: 'intuition.sigma' };
    } catch(_) {}
  }

  // ── Status from stream + cortex ─────────────────────────────────────────────
  if (STATUS_RE.test(lower)) {
    const errors = stream.slice(-20).filter(e => e.type?.includes('error') || e.type?.includes('fail')).length;
    const label = errors > 3 ? `${errors} errors in last 20 stream events` : 'stream nominal';
    try {
      const h = await _fetch(`http://127.0.0.1:9000/health`);
      const online = h?.online ?? '?';
      const total  = h?.total  ?? '?';
      return { text: `${online}/${total} systems online. ${label}.`,
        modelUsed: 'data-only', intent: 'status', source: 'intuition.status' };
    } catch(_) {
      return { text: `Stream: ${label}. Orchestrator unreachable.`,
        modelUsed: 'data-only', intent: 'status', source: 'intuition.status' };
    }
  }

  // ── Co-pilot self-awareness (what do you know?) ──────────────────────────
  if (AWARE_RE.test(lower)) {
    const summary = await contextSummary();
    return { text: summary, modelUsed: 'data-only', intent: 'awareness', source: 'intuition.awareness' };
  }

  // ── System map (blueprint index) ────────────────────────────────────────
  if (SYSTEMS_RE.test(lower)) {
    const bi = _getBP();
    const idx = bi?.load();
    if (!idx) return null;
    const lines = idx.systems
      .filter(s => s.componentCount > 0)
      .map(s => `  ${s.label.padEnd(14)} :${s.port}  — ${s.componentCount} components`);
    return { text: `NEXUS systems (${idx.systemCount}):\n${lines.join('\n')}`,
      modelUsed: 'data-only', intent: 'systems', source: 'intuition.blueprint' };
  }

  // ── Component list (per-system or all) ──────────────────────────────────
  if (COMP_RE.test(lower)) {
    const bi = _getBP();
    const idx = bi?.load();
    if (!idx) return null;
    // Check if a system name is in the prompt
    const sysHit = idx.systems.find(s =>
      lower.includes(s.systemId) || lower.includes(s.label.toLowerCase()));
    const source = sysHit ? [sysHit] : idx.systems.filter(s => s.componentCount > 0);
    const lines  = source.flatMap(s =>
      s.components.slice(0, 5).map(c => `  ${c.id} — ${(c.description||'').slice(0,60)}`)
    ).slice(0, 20);
    const title = sysHit ? `${sysHit.label} components:` : `Components (top 20 of ${idx.totalComponents}):`;  
    return { text: `${title}\n${lines.join('\n')}`,
      modelUsed: 'data-only', intent: 'components', source: 'intuition.blueprint' };
  }

  // ── CLI command list ─────────────────────────────────────────────────────
  if (CLI_RE.test(lower)) {
    const bi  = _getBP();
    const idx = bi?.load();
    if (!idx) return null;
    const lines = idx.allCLI.slice(0, 20)
      .map(c => `  ${c.command.padEnd(20)} ${c.method.padEnd(6)} ${c.path.slice(0,40).padEnd(40)} ${c.systemId}`);
    return { text: `CLI commands (${idx.allCLI.length} total, top 20):\n${lines.join('\n')}`,
      modelUsed: 'data-only', intent: 'cli', source: 'intuition.blueprint' };
  }

  // ── SEAM hooks ──────────────────────────────────────────────────────────
  if (SEAM_RE.test(lower)) {
    const bi  = _getBP();
    const idx = bi?.load();
    if (!idx) return null;
    const lines = idx.allSEAM.slice(0, 15)
      .map(h => `  ${h.componentId}  in:[${(h.in||[]).map(i=>i.id).join(',')}]  out:[${(h.out||[]).map(o=>o.wires_to?.join(',')??'').join(',')}]`);
    return { text: `SEAM hooks (${idx.allSEAM.length}):\n${lines.join('\n')}`,
      modelUsed: 'data-only', intent: 'seam', source: 'intuition.blueprint' };
  }

  // ── CLI route lookup (e.g. "/gaps" or "job.dispatch") ──────────────────
  const routeMatch = ROUTE_RE.exec(prompt.trim());
  if (routeMatch) {
    // §0.39.267 — ROUTE_RE has two alternatives: "/word" fills group 1, "what is|find|… word" fills group 3.
    // Reading only [1] threw on every "what is X" prompt (caught by copilot/adversarial's hostile probe every run).
    const word = (routeMatch[1] || routeMatch[3]).toLowerCase();
    const bi   = _getBP();
    // Try grammar index first (fastest)
    const gramHits = bi?.lookupGrammar(word) || [];
    if (gramHits.length) {
      const h = gramHits[0];
      const cli = bi?.lookupCLI(h.componentId.split('.').pop()) || null;
      const detail = cli
        ? `${cli.method} ${cli.path} (${cli.systemId}) — ${cli.description}`
        : h.description;
      return { text: `${h.componentId}: ${detail}`,
        modelUsed: 'data-only', intent: 'lookup', source: 'intuition.grammar' };
    }
    // Try direct CLI lookup
    const cliHit = bi?.lookupCLI(word);
    if (cliHit) {
      return {
        text: `${cliHit.command}: ${cliHit.method} ${cliHit.path} (${cliHit.systemId})\n${cliHit.description}\nUsage: ${cliHit.usage}`,
        modelUsed: 'data-only', intent: 'lookup', source: 'intuition.cli'
      };
    }
  }

  return null; // → ANALYSIS
}

// ── Co-pilot self-awareness summary ──────────────────────────────────────────
async function contextSummary() {
  const bi = _getBP();
  if (!bi) return 'Blueprint index not built. Run: POST /api/blueprint/index on orchestrator.';
  const idx = bi.load();
  if (!idx) return 'Blueprint index empty — no systems registered yet.';
  const sys = idx.systems.filter(s => s.componentCount > 0);
  return [
    `I can see ${idx.totalComponents} components across ${sys.length} active systems:`,
    ...sys.map(s => `  ${s.label.padEnd(14)} :${s.port}  — ${s.componentCount} components`),
    ``,
    `${idx.allCLI.length} CLI commands  ·  ${idx.allSEAM.length} SEAM hooks  ·  ${idx.allCopilot.length} co-pilot entry points`,
    `Index built: ${new Date(idx.builtAt).toISOString().slice(0,19)}`,
    ``,
    `Ask me: systems / components / commands / hooks / cfr / status / patterns / gaps`,
  ].join('\n');
}

module.exports = { answer, contextSummary };

