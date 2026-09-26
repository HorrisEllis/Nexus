'use strict';
/**
 * copilot/recursive-diagnose.js
 * comp_id: nexus.copilot.recursive-diagnose
 * uuid: nexus-copilot-recursive-diagnose-v1-0000-2026-0627-jamesbrooks-001
 *
 * Fractal/recursive diagnosis engine.
 * Each thought is written to file as it arrives — never waits for completion.
 * Depth-first: each finding spawns sub-queries until depth limit or confidence.
 * Output: data/copilot/diagnose-<ts>.md (living document, appended in real-time)
 *
 * §AX-2 — no silent failures — every error is a thought
 * §LAW-II — disk before behavior — thoughts written before acted on
 */
'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const http   = require('http');

const ROOT       = path.join(__dirname, '..');
const OUT_DIR    = path.join(ROOT, 'data', 'copilot', 'diagnose');
const CX_URL     = process.env.CORTEX_URL   || 'http://127.0.0.1:3748';
const INTEL_URL = process.env.INTELLIGENCE_URL || 'http://127.0.0.1:3753'; // intelligence is sovereign (moved out of cortex 2026-09-19)
const ORCH_URL  = process.env.ORCHESTRATOR_URL || 'http://127.0.0.1:9000'; // the CFR field/ledger authority
const OR_URL     = process.env.ORCH_URL     || 'http://127.0.0.1:9000';
const MAX_DEPTH  = parseInt(process.env.DIAGNOSE_MAX_DEPTH  || '4');
const MAX_BRANCHES = parseInt(process.env.DIAGNOSE_MAX_BRANCHES || '3');

try { fs.mkdirSync(OUT_DIR, { recursive: true }); } catch(_) {}

async function _get(url) {
  return new Promise(res => {
    http.get(url, { timeout: 3000 }, r => {
      let d=''; r.on('data',c=>d+=c);
      r.on('end',()=>{try{res(JSON.parse(d));}catch(_){res(null);}});
    }).on('error',()=>res(null)).on('timeout',()=>res(null));
  });
}

/**
 * Write a thought to the diagnosis file immediately (§LAW-II).
 */
function _write(file, depth, text) {
  const indent = '  '.repeat(depth);
  const line   = `${indent}${text}\n`;
  fs.appendFileSync(file, line, 'utf8');
}

/**
 * Core recursive diagnosis function.
 * Each call is one "thought". Thoughts spawn sub-thoughts.
 */
async function _diagnoseNode(file, topic, depth, visited, lifeline) {
  if (depth > MAX_DEPTH)        { _write(file, depth, `→ [max depth ${MAX_DEPTH}]`); return; }
  if (visited.has(topic))       { _write(file, depth, `→ [already explored: ${topic}]`); return; }
  visited.add(topic);

  _write(file, depth, `## ${topic}`);
  _write(file, depth, `*depth ${depth} · ${new Date().toISOString()}*\n`);

  // Gather evidence from cortex
  const findings = [];
  const subTopics = [];

  // 1. Check gaps related to topic
  try {
    const gaps = await _get(`${CX_URL}/api/gaps?status=open&limit=5`);
    const related = (gaps?.gaps || gaps?.rows || []).filter(g =>
      (g.type || '').toLowerCase().includes(topic.toLowerCase().split(' ')[0]) ||
      (g.body || '').toLowerCase().includes(topic.toLowerCase().split(' ')[0])
    );
    if (related.length) {
      findings.push(`**${related.length} related gaps:**`);
      related.slice(0, 3).forEach(g => {
        findings.push(`- [${g.severity}] ${g.type}: ${(g.body||'').slice(0,80)}`);
        if (g.type && !visited.has(g.type)) subTopics.push(g.type);
      });
    }
  } catch(_) {}

  // 2. Check patterns
  try {
    const pats = await _get(`${INTEL_URL}/api/intelligence/crystals?limit=5`);
    const related = (pats?.patterns || []).filter(p =>
      (p.precursor || '').toLowerCase().includes(topic.toLowerCase().split(' ')[0])
    );
    if (related.length) {
      findings.push(`\n**${related.length} pattern precursors:**`);
      related.slice(0, 2).forEach(p => {
        findings.push(`- "${p.precursor}" → "${p.outcome}" (${p.count}×, ${Math.round((p.confidence||0)*100)}%)`);
        if (p.outcome && !visited.has(p.outcome)) subTopics.push(p.outcome);
      });
    }
  } catch(_) {}

  // 3. Check CFR sigma
  try {
    const cfr = await _get(`${ORCH_URL}/cfr/health`);
    if (cfr?.cfr?.sigma > 0.3) {
      findings.push(`\n**CFR sigma: ${cfr.cfr.sigma.toFixed(3)}** (regime: ${cfr.cfr.regime})`);
      if (cfr.cfr.sigma > 0.5) subTopics.push('sigma divergence');
    }
  } catch(_) {}

  // 4. Ask lifeline for synthesis (if depth <= 2 to avoid token explosion)
  if (depth <= 2 && findings.length && lifeline) {
    try {
      const prompt = `Diagnose this NEXUS system issue in one paragraph, bullet the root causes and next steps:\n\nTopic: ${topic}\n\nEvidence:\n${findings.join('\n')}\n\nBe specific. Reference component IDs.`;
      const result = await lifeline.route(prompt, { intent: 'diagnose', timeoutMs: 15000 });
      if (result?.text) {
        findings.push(`\n**Analysis:**\n${result.text.slice(0, 500)}`);
        // Extract sub-topics from analysis
        const mentioned = (result.text.match(/guardian|cortex|raid|copilot|ollama|eravos|architect|emerge|bridge/gi) || []);
        const unique = [...new Set(mentioned.map(m => m.toLowerCase()))].filter(m => !visited.has(m));
        subTopics.push(...unique.slice(0, 2));
      }
    } catch(_) {}
  }

  // Write findings to file immediately
  findings.forEach(f => _write(file, depth + 1, f));
  _write(file, depth, '');

  // Recurse into sub-topics (fractal — each finding spawns investigation)
  const toExplore = [...new Set(subTopics)].slice(0, MAX_BRANCHES);
  for (const sub of toExplore) {
    await _diagnoseNode(file, sub, depth + 1, visited, lifeline);
  }
}

/**
 * Start a recursive diagnosis session.
 * Returns the output file path immediately — client can tail it.
 * Diagnosis continues writing to file asynchronously.
 */
async function start(topic = 'system health', opts = {}) {
  const ts   = Date.now();
  const file = path.join(OUT_DIR, `diagnose-${ts}.md`);
  const id   = crypto.randomUUID();

  // §LAW-II — write header before anything else
  fs.writeFileSync(file, [
    `# NEXUS Diagnosis: ${topic}`,
    `**Session:** ${id}`,
    `**Started:** ${new Date(ts).toISOString()}`,
    `**Max depth:** ${MAX_DEPTH} · **Max branches:** ${MAX_BRANCHES}`,
    `**Output file:** ${file}`,
    '',
    '---',
    '',
  ].join('\n'), 'utf8');

  const visited = new Set();
  let lifeline = null;
  try { lifeline = require('./lifeline'); } catch(_) {}

  // Run async — returns file immediately so UI can stream it
  setImmediate(async () => {
    try {
      await _diagnoseNode(file, topic, 0, visited, lifeline);
      _write(file, 0, `\n---\n**Complete:** ${new Date().toISOString()} · ${visited.size} nodes explored`);
    } catch(e) {
      _write(file, 0, `\n**Error:** ${e.message}`);
    }
  });

  return { ok: true, sessionId: id, file, topic, ts };
}

/**
 * List past diagnosis sessions.
 */
function list(limit = 10) {
  try {
    return fs.readdirSync(OUT_DIR)
      .filter(f => f.endsWith('.md') && f.startsWith('diagnose-'))
      .sort().reverse().slice(0, limit)
      .map(f => ({
        file: path.join(OUT_DIR, f),
        ts:   parseInt(f.replace('diagnose-','').replace('.md','')),
        size: fs.statSync(path.join(OUT_DIR, f)).size,
      }));
  } catch(_) { return []; }
}

module.exports = { start, list };
