'use strict';
/**
 * spec-compiler/dispatch.js — T2/T3 Guardian Dispatch
 * UUID: spec-dispatch-v1-0000-4000-0000-000000000001
 * Status: pre-release
 *
 * After compile() produces an executionPlan:
 *   T2 nodes (action:'run', tier:'T2') → POST to Guardian /command
 *   T3 synthesis → POST to Guardian /command with synthesis prompt
 *
 * §LAW II: every dispatch is logged to failures/ if Guardian is offline.
 * §1.2:    Nothing silently fails — every failure reported to caller.
 */

const http = require('http');

const GUARDIAN_PORT = process.env.GUARDIAN_PORT || 7820;
const GUARDIAN_HOST = process.env.NEXUS_HOST     || '127.0.0.1';

// ── post(path, body) — raw POST to Guardian ───────────────────────────────────
function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req  = http.request({
      hostname: GUARDIAN_HOST, port: GUARDIAN_PORT, path,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, (res) => {
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); } catch { resolve({ raw }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ── dispatchT2(compileResult, options) ────────────────────────────────────────
// Sends each T2-ready node to Guardian as a separate job.
// Returns array of { node, jobId, ok, error }
async function dispatchT2(compileResult, options = {}) {
  const { executionPlan, graph, gapField, moduleName } = compileResult;
  const provider  = options.provider || 'claude';
  const results   = [];

  if (!executionPlan) return results;

  const t2Nodes = executionPlan.filter(e => e.action === 'run' && e.tier === 'T2');
  if (!t2Nodes.length) return results;

  for (const entry of t2Nodes) {
    const node = graph?.getNode?.(entry.id) || entry;
    const nodeGaps = gapField?.getByNode?.(entry.id) || [];

    // Build the T2 prompt — resolved context, not raw spec
    const prompt = buildT2Prompt(node, nodeGaps, compileResult);

    try {
      const res = await post('/command', {
        provider,
        command:  'code',
        prompt,
        meta: {
          specModule:  moduleName,
          nodeId:      entry.id,
          nodeName:    node.name,
          tier:        'T2',
          specDepth:   node.specDepth,
          gapCount:    nodeGaps.length,
        },
      });
      results.push({ node: entry.id, name: node.name, jobId: res.id || res.jobId, ok: true });
    } catch(e) {
      results.push({ node: entry.id, name: node.name, ok: false, error: e.message });
    }
  }

  return results;
}

// ── dispatchT3(compileResult, options) ────────────────────────────────────────
// Sends a synthesis job — combine all T2 outputs into a coherent system.
// Returns { jobId, ok, error }
async function dispatchT3(compileResult, options = {}) {
  const { recommendations, executionPlan, moduleName, ringSnapshot } = compileResult;
  const provider = options.provider || 'claude';

  const prompt = buildT3Prompt(compileResult);

  try {
    const res = await post('/command', {
      provider,
      command: 'code',
      prompt,
      meta: {
        specModule: moduleName,
        tier:       'T3',
        recommendations,
      },
    });
    return { jobId: res.id || res.jobId, ok: true };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

// ── buildT2Prompt(node, gaps, compileResult) ──────────────────────────────────
// The critical insight: resolved meaning = fewer tokens.
// Only send what's needed for this specific node — not the whole spec.
function buildT2Prompt(node, gaps, compileResult) {
  const parts = [
    `NEXUS T2 — Implement: ${node.name || node.id}`,
    ``,
    `Intent: ${node.description || '(see exports)'}`,
    `Exports: ${(node.exports || []).join(', ') || 'none declared'}`,
    `Constraints: ${(node.constraints || []).join(' | ') || 'none'}`,
    `Dependencies: ${(node.deps || []).join(', ') || 'none'}`,
  ];

  if (gaps.length) {
    parts.push(``, `Open gaps (resolve inline):`);
    for (const g of gaps.slice(0, 5)) {
      parts.push(`  • ${g.description || g.type} [${g.severity || 'medium'}]`);
    }
  }

  parts.push(
    ``,
    `Requirements:`,
    `  • CommonJS module (require/module.exports)`,
    `  • §1.2: nothing silently fails — every error logged`,
    `  • §2.1: disk writes before function returns`,
    `  • §5.1: UUID on every persistent record`,
    `  • All stubs throw NotImplementedError`,
  );

  return parts.join('\n');
}

// ── buildT3Prompt(compileResult) ──────────────────────────────────────────────
function buildT3Prompt(compileResult) {
  const { recommendations, executionPlan, moduleName } = compileResult;
  const ran = (executionPlan || []).filter(e => e.action === 'run');

  return [
    `NEXUS T3 — Synthesis: ${moduleName}`,
    ``,
    `${ran.length} modules were generated at T2.`,
    `Your task: integrate them into a coherent system.`,
    ``,
    `Requirements:`,
    `  • Verify module contracts match across all interfaces`,
    `  • Wire event bus subscriptions`,
    `  • Write integration test stubs`,
    `  • Flag any remaining gaps as TODO comments`,
    ``,
    `Compiler recommendations:`,
    ...(recommendations || []).map(r => `  • ${r}`),
  ].join('\n');
}

// ── dispatchAll(compileResult, options) ───────────────────────────────────────
// T2 first, then T3 synthesis.
async function dispatchAll(compileResult, options = {}) {
  const t2Results = await dispatchT2(compileResult, options);
  const t3Result  = options.skipT3 ? null : await dispatchT3(compileResult, options);
  return { t2: t2Results, t3: t3Result };
}

module.exports = { dispatchT2, dispatchT3, dispatchAll };
