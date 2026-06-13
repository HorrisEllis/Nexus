'use strict';
/**
 * cortex/ess-gap-engine.js — ESS Variable Gap Analysis Engine
 * UUID: ess-gap-engine-v1-0000-4000-0000-000000000001
 * Status: pre-release
 *
 * Based on ESS spec v0.1.0 — End-State Signal language.
 *
 * Detects three classes of variable gaps:
 *   EXPRESSED   — variables explicitly named in the signal/text
 *   INFERRED    — variables implied by context but not stated
 *   OMITTED     — variables that should be present but are absent
 *
 * Each omitted variable carries weight/friction/tension scores:
 *   WEIGHT   — how load-bearing the absence is (0-1)
 *   FRICTION — how much it slows downstream resolution (0-1)
 *   TENSION  — how much pressure it creates on the system (0-1)
 *
 * The composite score = (weight * 0.4) + (friction * 0.35) + (tension * 0.25)
 * Signals below threshold → UNRESOLVE event on the bus (ESS §1.2)
 */

const { randomUUID } = require('crypto');

// ── ESS primitives we look for ───────────────────────────────────────────────
const ESS_PRIMITIVES = new Set(['WRITE','BIND','CALLTO','RESOLVE','UNRESOLVE']);
const ESS_BUS_EVENTS = new Set(['SIGNAL','RESOLVE','UNRESOLVE','BIND','WRITE','CONTRACT_UPDATE','KERNEL_SNAPSHOT','NOISE_ALERT']);
const ESS_ROLES      = /\b[a-z][a-z0-9_]{1,30}\.(js|ts|py|go|rb)\b|\b(gate|filter|input|output|transform|router|handler|processor|validator|encoder|decoder)\b/gi;
const HASH_PATTERN   = /\b[0-9a-f]{6,8}\b/g;
const CALLTO_PATTERN = /callto:[a-z0-9_@?=]+/gi;

// ── Variable extraction ───────────────────────────────────────────────────────
function extractExpressed(text) {
  const vars = [];

  // Named bindings: role = hash or role: hash
  const bindings = [...text.matchAll(/\b([a-z][a-z0-9_]{1,30})\s*(?:=|:)\s*([0-9a-f]{6,8})\b/gi)];
  for (const [, role, hash] of bindings) {
    vars.push({ name: role, kind: 'binding', value: hash, expressed: true });
  }

  // Callto targets
  const calltos = [...text.matchAll(/callto:([a-z0-9_@?=.]+)/gi)];
  for (const [, target] of calltos) {
    vars.push({ name: target, kind: 'callto', expressed: true });
  }

  // ESS bus events
  for (const ev of ESS_BUS_EVENTS) {
    if (text.includes(ev)) vars.push({ name: ev, kind: 'bus_event', expressed: true });
  }

  // Role names (file patterns and known role names)
  const roles = [...text.matchAll(ESS_ROLES)];
  for (const [role] of roles) {
    const name = role.split('.')[0];
    if (!vars.find(v => v.name === name)) {
      vars.push({ name, kind: 'role', expressed: true });
    }
  }

  // Hash references
  const hashes = [...text.matchAll(/\b([0-9a-f]{6,8})\b/g)];
  for (const [hash] of hashes) {
    if (!vars.find(v => v.value === hash)) {
      vars.push({ name: hash, kind: 'hash', expressed: true });
    }
  }

  return vars;
}

function extractInferred(text, expressed) {
  const inferred = [];
  const expressedNames = new Set(expressed.map(v => v.name));

  // If BIND is mentioned → infer role + hash must both exist
  if (text.includes('BIND') || text.includes('bind')) {
    if (!expressedNames.has('role'))  inferred.push({ name:'role',  kind:'binding_arg', reason:'BIND requires a role name', inferred:true });
    if (!expressedNames.has('hash'))  inferred.push({ name:'hash',  kind:'binding_arg', reason:'BIND requires a hash target', inferred:true });
  }

  // If CALLTO → infer kernel must be referenced
  if (text.match(/callto:/i) && !expressedNames.has('kernel')) {
    inferred.push({ name:'kernel', kind:'runtime_dep', reason:'callto requires kernel routing table', inferred:true });
  }

  // If RESOLVE mentioned → infer bus output exists
  if (text.includes('RESOLVE') && !expressedNames.has('bus')) {
    inferred.push({ name:'bus', kind:'output_channel', reason:'RESOLVE emits to bus', inferred:true });
  }

  // If plugin contract pattern exists → infer input + output shape
  if (text.match(/contract\s*:/i)) {
    if (!expressedNames.has('input'))  inferred.push({ name:'input',  kind:'contract_field', reason:'plugin contract implies input schema', inferred:true });
    if (!expressedNames.has('output')) inferred.push({ name:'output', kind:'contract_field', reason:'plugin contract implies output schema', inferred:true });
  }

  // If filter mentioned → infer weight table
  if (text.match(/\bfilter\b/i) && !expressedNames.has('weight_table')) {
    inferred.push({ name:'weight_table', kind:'filter_state', reason:'SNR filter maintains adaptive weight table', inferred:true });
  }

  // If execution/run → infer error handling
  if (text.match(/\bexecute\b|\brun\b/i) && !text.match(/UNRESOLVE|error|fail/i)) {
    inferred.push({ name:'error_path', kind:'execution_gap', reason:'execution path has no error/UNRESOLVE handling', inferred:true });
  }

  return inferred;
}

function detectOmitted(text, expressed, inferred) {
  const omitted = [];
  const allNames = new Set([...expressed, ...inferred].map(v => v.name));

  // ESS §1.2 — nothing silently fails
  // If there are calltos but no UNRESOLVE handling → omitted
  if (text.match(/callto:/i) && !text.match(/UNRESOLVE|unresolved|fallback/i)) {
    omitted.push({
      name:     'UNRESOLVE_handler',
      kind:     'ess_axiom',
      reason:   'callto exists but no UNRESOLVE handler — §1.2 violation: nothing silently fails',
      weight:   0.9,
      friction: 0.7,
      tension:  0.85,
      axiom:    '§1.2',
    });
  }

  // If BIND but no binding log → omitted (§3 kernel history)
  if (text.match(/BIND|bind\s*:/i) && !text.match(/binding.log|log|history|replay/i)) {
    omitted.push({
      name:     'binding_log',
      kind:     'kernel_invariant',
      reason:   'BIND operations require binding log for replay — ESS §3 kernel history',
      weight:   0.75,
      friction: 0.5,
      tension:  0.7,
      axiom:    '§3',
    });
  }

  // If hash referenced but no hash store mention
  if (text.match(/\b[0-9a-f]{6,8}\b/) && !text.match(/hash.store|registry|store/i)) {
    omitted.push({
      name:     'hash_store',
      kind:     'registry_missing',
      reason:   'hash referenced but no hash store — ESS §7: registry is the fixed point',
      weight:   0.8,
      friction: 0.65,
      tension:  0.75,
      axiom:    '§4/§7',
    });
  }

  // If filter present but no weight update mechanism
  if (text.match(/\bfilter\b/i) && !text.match(/weight|rate|update|adaptive/i)) {
    omitted.push({
      name:     'adaptive_weights',
      kind:     'filter_missing',
      reason:   'filter present but no adaptive weight mechanism — ESS §8 signal-to-noise filter',
      weight:   0.65,
      friction: 0.6,
      tension:  0.55,
      axiom:    '§8',
    });
  }

  // If contract mentioned but no CONTRACT_UPDATE mechanism
  if (text.match(/contract/i) && !text.match(/CONTRACT_UPDATE|update.*contract/i)) {
    omitted.push({
      name:     'CONTRACT_UPDATE',
      kind:     'adaptive_io_missing',
      reason:   'plugin contract present but no adaptive I/O — ESS §4 adaptive I/O',
      weight:   0.5,
      friction: 0.45,
      tension:  0.6,
      axiom:    '§4',
    });
  }

  // If signal routing described but bus not mentioned
  if (text.match(/signal|route|dispatch/i) && !text.match(/\bbus\b/i)) {
    omitted.push({
      name:     'bus',
      kind:     'shared_state_missing',
      reason:   'signal routing without bus — ESS §6: the bus is the only shared state',
      weight:   0.85,
      friction: 0.8,
      tension:  0.9,
      axiom:    '§6',
    });
  }

  // Generic: referenced but not defined
  const refs = [...text.matchAll(/\bcallto:([a-z][a-z0-9_]{1,30})\b/gi)].map(m=>m[1]);
  for (const ref of refs) {
    if (!allNames.has(ref) && !allNames.has(ref + '.js')) {
      omitted.push({
        name:     ref,
        kind:     'unbound_role',
        reason:   `callto:${ref} references unbound role — no BIND found`,
        weight:   0.7,
        friction: 0.8,
        tension:  0.75,
        axiom:    '§5',
      });
    }
  }

  return omitted;
}

function scoreOmitted(omitted) {
  return omitted.map(v => ({
    ...v,
    composite: parseFloat(
      ((v.weight||0)*0.4 + (v.friction||0)*0.35 + (v.tension||0)*0.25).toFixed(3)
    ),
  })).sort((a, b) => b.composite - a.composite);
}

// ── Main analysis function ────────────────────────────────────────────────────
function analyzeESS(text, opts = {}) {
  const { threshold = 0.35 } = opts;
  const uuid = randomUUID();
  const ts   = Date.now();

  const expressed = extractExpressed(text);
  const inferred  = extractInferred(text, expressed);
  const omittedRaw = detectOmitted(text, expressed, inferred);
  const omitted    = scoreOmitted(omittedRaw);

  const critical = omitted.filter(v => v.composite >= threshold);
  const totalPressure = omitted.reduce((sum, v) => sum + v.composite, 0);

  // ESS §1.2 — any unresolved signals?
  const unresolveSignals = critical.map(v => ({
    type:   'UNRESOLVE',
    signal: v.name,
    reason: v.reason,
    axiom:  v.axiom,
    score:  v.composite,
  }));

  return {
    uuid, ts,
    expressed:  expressed.length,
    inferred:   inferred.length,
    omitted:    omitted.length,
    critical:   critical.length,
    totalPressure: parseFloat(totalPressure.toFixed(3)),
    passedThreshold: critical.length === 0,
    variables: { expressed, inferred, omitted },
    unresolveSignals,  // emit these to bus per ESS §1.2
    summary: critical.length === 0
      ? `ESS clean — ${expressed.length} expressed, ${inferred.length} inferred, ${omitted.length} omitted (all below threshold)`
      : `${critical.length} critical gap(s) — pressure ${totalPressure.toFixed(2)}: ${critical.map(v=>v.name).join(', ')}`,
  };
}

// ── Forge pipeline hook ───────────────────────────────────────────────────────
// Called by forge after spec compile. Returns gap events for bus emission.
function analyzeForge(specText, compiledResult, opts = {}) {
  const essResult = analyzeESS(specText, opts);

  // Add forge-specific gap types
  const forgeGaps = [];

  // Check compiled gaps from SEAM
  const seamGaps = compiledResult?.gaps || [];
  for (const sg of seamGaps) {
    forgeGaps.push({
      name:     sg.id || sg.keyword || 'seam_gap',
      kind:     'seam_compile',
      reason:   sg.type === 'UNKNOWN-KW' ? `Unknown SEAM keyword: ${sg.keyword}` : sg.id,
      weight:   sg.pressure || 0.5,
      friction: 0.4,
      tension:  sg.pressure || 0.5,
      composite: sg.pressure || 0.5,
      source:   'seam',
    });
  }

  // If spec has undefined states (make x = undefined)
  const undefStates = (specText.match(/make\s+\w+\s*=\s*(?:undefined|nothing|null|\?)/gi)||[]).length;
  if (undefStates > 0) {
    forgeGaps.push({
      name: 'undefined_states',
      kind: 'spec_gap',
      reason: `${undefStates} state(s) assigned undefined — will cause UNRESOLVE at dispatch`,
      weight: 0.8, friction: 0.7, tension: 0.75, composite: 0.755, source: 'forge',
    });
  }

  const allOmitted = [...essResult.variables.omitted, ...forgeGaps]
    .sort((a,b) => b.composite - a.composite);

  return {
    ...essResult,
    variables: { ...essResult.variables, omitted: allOmitted },
    omitted: allOmitted.length,
    critical: allOmitted.filter(v => v.composite >= (opts.threshold||0.35)).length,
    forgeGaps: forgeGaps.length,
  };
}

module.exports = { analyzeESS, analyzeForge, extractExpressed, extractInferred, detectOmitted, scoreOmitted };
