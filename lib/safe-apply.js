'use strict';
/**
 * lib/safe-apply.js — verify-before-merge, for real, using COS's real
 * branch/sandbox/compare primitives instead of nexus-healer's stub.
 * comp_id: nexus.lib.safe-apply
 * UUID: nexus-safe-apply-v1-0000-2026-0813-001
 * Version: 1.0.0
 *
 * WHY (James, 2026-08-13): "cos to isolate or branch a copy? a snapshot
 * before the compartment just in case. a test env." — the missing piece
 * from nexus-healer's stubbed merge (found this session, still stubbed:
 * "replace with real logic"). This is that real logic, built on what
 * already exists rather than invented: BranchEngine.fork() makes a real
 * isolated filesystem copy, SandboxRunner.run() executes a real check
 * command inside it with a real timeout. Nothing here bypasses RAID —
 * applying to the real target is its own governed step, same as
 * switchAgent/hat_forge/scheduled tasks already are, not a special case.
 *
 * §THE ACTUAL BOUNDARY — a COS compartment always gets a FRESH root
 * (confirmed reading cos/cli/commands/create.js directly — createCompartment
 * has no "point at an existing directory" option). So "isolate a copy of
 * the real target" means: create a compartment, copy the real target
 * directory INTO it once, then every proposed change is verified inside
 * that compartment's branches from then on — the real target itself is
 * never touched until (and unless) a verified branch is explicitly merged
 * back, a separate, RAID-gated step.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..');

function _jaa() {
  try { return require(path.join(ROOT, 'cortex/memory/jaa-db.js')).jaaDB; }
  catch (_) { return null; }
}

function _copyTree(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'data') continue; // §2.2 — never copy runtime state or deps into a throwaway sandbox
    const s = path.join(src, entry.name), d = path.join(dst, entry.name);
    if (entry.isDirectory()) _copyTree(s, d);
    else fs.copyFileSync(s, d);
  }
}

/**
 * mirrorCompartment(targetDir, opts) — create a compartment whose root is
 * a real, current copy of targetDir. This is the "snapshot before the
 * compartment" — one real copy, made once, that every proposed change
 * branches from.
 */
function mirrorCompartment(targetDir, opts = {}) {
  const { createCompartment } = require(path.join(ROOT, 'cos/cli/commands/create.js'));
  const { createHost } = require(path.join(ROOT, 'cos/host/index.js'));
  const host = createHost();
  const name = opts.name || `mirror-${crypto.randomUUID().slice(0, 8)}`;
  const compartment = createCompartment(host, { name, purpose: `safe-apply mirror of ${targetDir}`, networkIsolated: true });
  _copyTree(targetDir, compartment.fs.root);
  return { compartment, host };
}

/**
 * proposeChange(compartment, files, opts) — fork a real branch from the
 * compartment's current mirror, apply the proposed file changes to THAT
 * branch only (the mirror itself is untouched), optionally run a real
 * check command inside the branch's real sandbox, and return a verdict.
 * Never touches the real target — this is entirely inside the compartment.
 *
 * files: { 'relative/path.js': 'new full content', ... }
 * opts.checkCommand: e.g. 'node' with opts.checkArgs: ['--check', 'file.js']
 *   — run for real, in the real branch, with a real timeout.
 */
async function proposeChange(compartment, files, opts = {}) {
  const { BranchEngine } = require(path.join(ROOT, 'cos/playground/branch.js'));
  const { SandboxRunner } = require(path.join(ROOT, 'cos/playground/sandbox.js'));

  const branch = BranchEngine.fork(compartment, { label: opts.label || 'proposed-change' });

  const applied = [];
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(branch.root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
    applied.push(rel);
  }

  let checkResult = null;
  if (opts.entryFile) {
    // §FIXED 2026-08-13 — caught by my own first test run, not assumed
    // correct: SandboxRunner.run's `command` option is the ENTRY FILE to
    // execute with the compartment's runtime (default node), not a shell
    // command name — `runtimeId`/RUNTIME_BINS supplies the actual binary.
    // My first draft passed command:'node', args:['--check', file], which
    // SandboxRunner correctly interpreted as "run a file literally named
    // 'node'" — real error (MODULE_NOT_FOUND), immediately diagnosable,
    // not silently wrong. Fixed to pass the real entry file directly.
    try {
      checkResult = await SandboxRunner.run(compartment, branch.id, {
        command: opts.entryFile, args: opts.entryArgs || [], runtimeId: opts.runtimeId,
        timeoutMs: opts.timeoutMs || 15000,
      });
    } catch (e) {
      checkResult = { ok: false, error: e.message };
    }
  }

  const verdict = {
    branchId: branch.id, branchRoot: branch.root, filesChanged: applied,
    checked: !!opts.entryFile,
    passed: opts.entryFile ? !!(checkResult && checkResult.exitCode === 0) : null,
    checkResult,
  };

  // §1.2 — every proposal, passed or failed, is a real record, not silent.
  try { const jaa = _jaa(); if (jaa) jaa.insert('safe_apply_proposals', { id: branch.id, compartmentId: compartment.id, ...verdict, ts: Date.now() }); } catch (_) {}

  return verdict;
}

/**
 * mergeBack(branchId, targetDir, opts) — the ONLY function here that
 * touches the real target, and the ONLY one that's RAID-gated. Refuses if
 * the branch was never checked, or was checked and failed — "trust me" is
 * not a merge condition, a passing real check is.
 */
async function mergeBack(branchId, targetDir, opts = {}) {
  const jaa = _jaa();
  const proposal = jaa ? jaa.query('safe_apply_proposals', r => r.id === branchId)[0] : null;
  if (!proposal) return { ok: false, reason: `no recorded proposal for branch "${branchId}" — mergeBack only accepts branches that went through proposeChange` };
  if (proposal.checked && !proposal.passed) return { ok: false, reason: 'the real check failed for this branch — not merging a failing change', checkResult: proposal.checkResult };
  if (!proposal.checked && !opts.allowUncheckedMerge) return { ok: false, reason: 'this branch was never checked (no checkCommand given at propose time) — pass opts.allowUncheckedMerge:true if that is genuinely intended, it is refused by default' };

  let governAction = null;
  try { governAction = require(path.join(ROOT, 'copilot/lib/self-model.js')).governAction; } catch (_) {}
  if (governAction) {
    const gov = governAction({ action: 'merge_change', target: branchId }, {});
    if (gov.allowed === false) return { ok: false, reason: `denied by governance: ${gov.reason}`, governance: gov };
  }

  const brRoot = proposal.branchRoot;
  if (!brRoot || !fs.existsSync(brRoot)) return { ok: false, reason: `branch root no longer exists: ${brRoot}` };

  for (const rel of proposal.filesChanged) {
    const src = path.join(brRoot, rel);
    const dst = path.join(targetDir, rel);
    if (!fs.existsSync(src)) continue;
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  }

  try { if (jaa) jaa.insert('safe_apply_proposals', { id: branchId, merged: true, mergedAt: Date.now(), ts: Date.now() }); } catch (_) {}
  return { ok: true, merged: proposal.filesChanged, targetDir };
}

module.exports = { mirrorCompartment, proposeChange, mergeBack, MODULE_ID: 'safe-apply', VERSION: '1.0.0' };
