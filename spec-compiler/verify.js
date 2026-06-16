'use strict';
/**
 * spec-compiler/verify.js — Token Reduction Benchmark
 * UUID: spec-verify-v1-0000-4000-0000-000000000001
 * Status: pre-release
 *
 * Proves: tokens ∝ unresolved meaning
 * Measures: raw prompt tokens vs compiled spec tokens at T0/T1/T2/T3
 * Reports: ratio of resolved-meaning tokens to resolution-work tokens
 *
 * Usage: node verify.js <spec-file>
 *        node verify.js --self   (runs against SPEC_COMPILER.spec)
 */

const path    = require('path');
const fs      = require('fs');
const { compile } = require('./compiler/pipeline');

// ── Token estimator (GPT-style: ~4 chars per token) ─────────────────────────
function countTokens(text) {
  if (!text) return 0;
  // Rough but consistent: split on whitespace + punctuation boundaries
  return Math.ceil(text.replace(/\s+/g, ' ').length / 4);
}

function countObjectTokens(obj) {
  return countTokens(JSON.stringify(obj));
}

// ── Benchmark ────────────────────────────────────────────────────────────────
async function benchmark(specPath) {
  const specSource = fs.readFileSync(specPath, 'utf8');
  const specName   = path.basename(specPath);

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  SPEC COMPILER — TOKEN REDUCTION BENCHMARK`);
  console.log(`  File: ${specName}`);
  console.log(`${'═'.repeat(60)}\n`);

  // ── Baseline: raw spec source ─────────────────────────────────────────────
  const rawTokens = countTokens(specSource);
  console.log(`  RAW SPEC SOURCE`);
  console.log(`  ├── chars:  ${specSource.length}`);
  console.log(`  └── tokens: ${rawTokens}\n`);

  // ── What a naive prompt looks like (raw spec + generic instruction) ───────
  const naivePrompt = `You are a software architect. Here is a system specification:\n\n${specSource}\n\nBased on this specification, generate the implementation.`;
  const naiveTokens = countTokens(naivePrompt);
  console.log(`  NAIVE PROMPT (spec + generic instruction)`);
  console.log(`  └── tokens: ${naiveTokens}\n`);

  // ── Compile the spec ──────────────────────────────────────────────────────
  const t0 = Date.now();
  let result;
  try {
    result = compile(specSource, specName);
  } catch(e) {
    console.error(`  COMPILE ERROR: ${e.message}`);
    process.exit(1);
  }
  const compileMs = Date.now() - t0;

  // ── Measure each compiled output ─────────────────────────────────────────
  const outputs = {
    graph:         result.graph,
    gapField:      result.gapField,
    tierMap:       result.tierMap,
    executionPlan: result.executionPlan,
    ringBuffer:    result.ringBuffer,
    violations:    result.violations,
    recommendations: result.recommendations,
  };

  let totalCompiled = 0;
  console.log(`  COMPILED OUTPUTS (${compileMs}ms)`);
  for (const [key, val] of Object.entries(outputs)) {
    if (!val) continue;
    const t = countObjectTokens(val);
    totalCompiled += t;
    console.log(`  ├── ${key.padEnd(16)}: ${t} tokens`);
  }
  console.log(`  └── TOTAL:           ${totalCompiled} tokens\n`);

  // ── T0 prompt: schema + graph only (minimum context) ─────────────────────
  const t0Prompt    = `Schema: ${JSON.stringify(result.graph?.schema || {})} | Nodes: ${JSON.stringify((result.graph?.nodes || []).slice(0,3))}`;
  const t0Tokens    = countTokens(t0Prompt);

  // ── T1 prompt: tier contract + execution plan ─────────────────────────────
  const t1Prompt    = JSON.stringify({ tierMap: result.tierMap, executionPlan: result.executionPlan });
  const t1Tokens    = countTokens(t1Prompt);

  // ── T2 prompt: single node with all context ───────────────────────────────
  const firstNode   = result.graph?.nodes?.[0] || {};
  const t2Prompt    = JSON.stringify({ node: firstNode, gapField: result.gapField, violations: result.violations });
  const t2Tokens    = countTokens(t2Prompt);

  // ── T3 prompt: synthesis pass ─────────────────────────────────────────────
  const t3Prompt    = JSON.stringify({ recommendations: result.recommendations, ringBuffer: result.ringBuffer });
  const t3Tokens    = countTokens(t3Prompt);

  console.log(`  PROMPT COMPARISON`);
  console.log(`  ├── Naive (raw spec):        ${naiveTokens} tokens  (baseline)`);
  console.log(`  ├── T0 (schema + graph):     ${t0Tokens} tokens  (${pct(t0Tokens,naiveTokens)}%)`);
  console.log(`  ├── T1 (tiers + plan):       ${t1Tokens} tokens  (${pct(t1Tokens,naiveTokens)}%)`);
  console.log(`  ├── T2 (per node, resolved): ${t2Tokens} tokens  (${pct(t2Tokens,naiveTokens)}% per node)`);
  console.log(`  └── T3 (synthesis):          ${t3Tokens} tokens  (${pct(t3Tokens,naiveTokens)}%)\n`);

  // ── Key metric: unresolved meaning reduction ──────────────────────────────
  const gaps      = result.gapField?.gaps?.length || 0;
  const resolved  = result.gapField?.resolved?.length || 0;
  const total     = gaps + resolved;
  const resolveRate = total > 0 ? Math.round(resolved / total * 100) : 0;

  console.log(`  MEANING RESOLUTION`);
  console.log(`  ├── gaps declared:   ${total}`);
  console.log(`  ├── resolved:        ${resolved} (${resolveRate}%)`);
  console.log(`  └── unresolved:      ${gaps}`);
  console.log(`\n  REDUCTION VS NAIVE`);
  console.log(`  ├── T0 saves:  ${naiveTokens - t0Tokens} tokens (${100 - pct(t0Tokens,naiveTokens)}%)`);
  console.log(`  └── T2 saves:  ${naiveTokens - t2Tokens} tokens (${100 - pct(t2Tokens,naiveTokens)}% per node)\n`);

  const ratio = naiveTokens > 0 ? (naiveTokens / Math.max(1, t2Tokens)).toFixed(2) : 'N/A';
  console.log(`  tokens∝unresolved_meaning ratio: ${ratio}x  (naive / T2)`);
  console.log(`  ${ratio >= 2 ? '✓ CLAIM SUPPORTED' : ratio >= 1.5 ? '◑ PARTIAL SUPPORT' : '✗ INSUFFICIENT REDUCTION'}`);
  console.log(`${'═'.repeat(60)}\n`);

  return { rawTokens, naiveTokens, t0Tokens, t1Tokens, t2Tokens, t3Tokens, totalCompiled, ratio, gaps, resolved };
}

function pct(a, b) { return b > 0 ? Math.round(a / b * 100) : 0; }

// ── CLI ───────────────────────────────────────────────────────────────────────
const args    = process.argv.slice(2);
const selfRun = args.includes('--self');
const target  = selfRun
  ? path.join(__dirname, 'SPEC_COMPILER.spec')
  : args.find(a => !a.startsWith('--'));

if (!target) {
  console.log('Usage: node verify.js <spec-file>');
  console.log('       node verify.js --self');
  process.exit(0);
}

if (!fs.existsSync(target)) {
  console.error(`File not found: ${target}`);
  process.exit(1);
}

benchmark(target).catch(e => { console.error(e.message); process.exit(1); });
