'use strict';
/**
 * lib/agent-system/submit.js — an agent's output → a file matching the
 * output contract → RAID for testing → integration decision.
 * UUID: nexus-agent-system-submit-v1-0000-2026-0813-001
 *
 * THE PIPELINE (each stage real, none skipped silently — §1.2):
 *   1. validate  — output shape checked against the agent's own contract
 *                  (lib/agent-system/contracts.js) — an agent can't submit
 *                  a tool call it isn't scoped for (§1.1).
 *   2. write     — persisted to data/agents/<agentId>/outputs/ as a JSON
 *                  file matching OUTPUT_CONTRACT_SCHEMA below, timestamped
 *                  + content-hashed so nothing overwrites silently.
 *   3. raid      — cortex/core/raid's REAL verifyInIsolation() — the
 *                  existing isolate→verify→compare(contract vs output)→
 *                  score-drift→snapshot-on-fail pipeline (§8.6, not a new
 *                  verification path). "Send to RAID for testing before
 *                  integration" IS this call, not a new gate invented here.
 *   4. verdict   — returned to the caller AND written back into the same
 *                  output file (so the file on disk is the full record:
 *                  what the agent produced + what RAID decided about it).
 *
 * §HONESTY — an output whose action isn't in RAID's _CONSEQUENTIAL_ACTIONS
 * set takes the fast path (recorded, not sandboxed) same as any other RAID
 * caller; a consequential one WITHOUT a specPath is refused with a clear
 * reason, not silently approved or silently dropped.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const contracts = require('./contracts');

/**
 * OUTPUT_CONTRACT_SCHEMA — the shape every file in an agent's output
 * folder is guaranteed to have. Documented here as the single source of
 * truth for what "matches the contract" means for an output file (as
 * distinct from the AGENT's contract in contracts.js — this is the
 * OUTPUT's contract).
 */
const OUTPUT_CONTRACT_SCHEMA = Object.freeze({
  uuid: 'string — unique id for this output',
  agentId: 'string — which provider produced this',
  action: 'string — what kind of output this is (e.g. "code_patch", "analysis", "answer")',
  content: 'any — the actual output payload',
  toolsUsed: 'string[] — which of the agent\'s scoped tools were invoked producing this',
  ts: 'number — when this was submitted',
  raid: '{ verified, stage, verdict, reason } — filled in after RAID runs; null until then',
});

function _uid() { return crypto.randomUUID(); }

function _ensureDir(dir) {
  try { fs.mkdirSync(dir, { recursive: true }); return true; }
  catch (e) { console.warn(`[agent-system/submit] could not create output dir ${dir}: ${e.message}`); return false; }
}

/**
 * validate(agentId, { action, toolsUsed }) — §1.1 the scope check: every
 * tool the output claims to have used must be in the agent's contract.
 * Returns { ok, errors[] } — never throws, always explains what failed.
 */
function validate(agentId, { action, toolsUsed = [] } = {}) {
  const errors = [];
  const contract = contracts.getContract(agentId);
  if (contract.error) { errors.push(contract.error); return { ok: false, errors, contract: null }; }
  if (!action) errors.push('action is required');
  for (const t of toolsUsed) {
    if (!contracts.agentCan(agentId, t)) errors.push(`tool "${t}" is not in ${agentId}'s scoped toolkit — refused (§1.1)`);
  }
  return { ok: errors.length === 0, errors, contract };
}

/**
 * submitOutput(agentId, output, opts) — the full pipeline. output =
 * { action, content, toolsUsed }. opts is forwarded to RAID's
 * verifyInIsolation (specPath/testCommand/outputDir/consequential) for
 * outputs that need real sandbox verification.
 */
async function submitOutput(agentId, output = {}, opts = {}) {
  const now = Date.now();
  const check = validate(agentId, output);
  if (!check.ok) {
    return { submitted: false, errors: check.errors };
  }

  const uuid = _uid();
  const record = {
    uuid, agentId, action: output.action, content: output.content,
    toolsUsed: output.toolsUsed || [], ts: now, raid: null,
  };

  // Write BEFORE RAID runs — the agent's actual output is never lost even
  // if RAID itself throws (§0.3 nothing lost). The file gets updated with
  // the verdict once RAID returns.
  const dir = check.contract.outputFolder;
  const filename = `${new Date(now).toISOString().replace(/[:.]/g, '-')}_${uuid}.json`;
  const filepath = path.join(dir, filename);
  let written = false;
  if (_ensureDir(dir)) {
    try { fs.writeFileSync(filepath, JSON.stringify(record, null, 2)); written = true; }
    catch (e) { console.warn(`[agent-system/submit] write failed for ${filepath}: ${e.message}`); }
  }

  // §RAID — the real pre-integration test, not a new one. Fast path for
  // non-consequential output kinds (e.g. "answer", "analysis" — nothing to
  // sandbox); full isolate→verify→compare for anything that writes code
  // (e.g. "code_patch") the way RAID's own _CONSEQUENTIAL_ACTIONS already
  // distinguishes forge/build/repair/etc. from read-only actions.
  let raidResult;
  try {
    const raid = require('../../cortex/core/raid');
    raidResult = await raid.verifyInIsolation({
      source: agentId,
      action: output.action,
      specPath: opts.specPath,
      outputDir: opts.outputDir,
      testCommand: opts.testCommand,
      opts: { causedBy: uuid, consequential: opts.consequential },
    });
  } catch (e) {
    raidResult = { verified: false, error: `RAID unavailable: ${e.message}` };
  }

  record.raid = raidResult;
  if (written) {
    try { fs.writeFileSync(filepath, JSON.stringify(record, null, 2)); }
    catch (e) { console.warn(`[agent-system/submit] verdict write-back failed for ${filepath}: ${e.message}`); }
  }

  return {
    submitted: true, uuid, filepath: written ? filepath : null,
    verified: !!raidResult.verified, raid: raidResult,
  };
}

/** listOutputs(agentId, {limit}) — read back an agent's output folder,
 * newest first. Honest empty array if the folder doesn't exist yet (an
 * agent that has never submitted anything, not an error). */
function listOutputs(agentId, { limit = 50 } = {}) {
  const contract = contracts.getContract(agentId);
  if (contract.error) return { error: contract.error };
  const dir = contract.outputFolder;
  let files;
  try { files = fs.readdirSync(dir).filter(f => f.endsWith('.json')); }
  catch (_) { return { agentId, outputs: [] }; } // no dir yet = no outputs yet, not an error
  const outputs = files
    .sort().reverse()
    .slice(0, limit)
    .map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); }
      catch (e) { return { file: f, error: `unreadable: ${e.message}` }; }
    });
  return { agentId, outputs };
}

module.exports = {
  submitOutput, validate, listOutputs,
  OUTPUT_CONTRACT_SCHEMA,
  MODULE_ID: 'agent-system-submit', VERSION: '1.0.0',
};
