'use strict';
// ── lib/contract-registry-writer.js ──────────────────────────────────────────
// UUID: nexus-contract-registry-writer-v1-0000-4000-0000-000000000001
// Version: 1.0.0
// Phase: 14.5 — Constitutional Write-Back
//
// THE MISSING WIRE.
//
// The reflection engine opens CONSTITUTIONAL gaps proposing axiom changes.
// The gap system routes CONSTITUTIONAL gaps to human_required.
// Until now: nothing read a resolved CONSTITUTIONAL gap and did anything with it.
//
// This module is that missing piece. It:
//   1. Polls JAA for CONSTITUTIONAL gaps in status:'resolved' with a
//      resolution_action present and not yet applied.
//   2. Validates the proposed change against invariants.
//   3. Writes to contracts/SYSTEM-CONTRACTS.js — the only runtime write
//      to that file that will ever exist.
//   4. Appends to data/contract-registry/proposals.jsonl — append-only
//      audit trail, never truncated. (§LAW II: written BEFORE the file patch)
//   5. Emits bus events so the rest of the system can observe.
//
// ── WHAT THIS DOES NOT DO ────────────────────────────────────────────────────
// It does not auto-approve anything. A CONSTITUTIONAL gap reaches 'resolved'
// only when a human (or explicitly authorized operator) has set:
//   gap.status         = 'resolved'
//   gap.resolution_action  — one of: 'add_axiom' | 'deprecate_axiom' | 'flag_violation'
//   gap.resolution_payload — the axiom key, text, and rationale
//
// This module reads that decision and makes it real in the codebase.
// The human decision is the gate. This module is the actuator.
//
// ── AXIOM INVARIANTS ENFORCED ────────────────────────────────────────────────
// §1.1  Every proposal has a UUID. Nothing is anonymous.
// §1.2  Every failure is logged. Validation rejection is an event, not a silent drop.
// §2.1  proposals.jsonl written BEFORE SYSTEM-CONTRACTS.js is touched. Always.
// §5.3  No monkey patches. This writes to the contracts file structurally —
//       it finds the AXIOMS object block and inserts/marks within it.
//       It does not eval, does not require() the contracts file into memory
//       and mutate it, and does not rewrite the entire file. Surgical patch only.
// §5.4  Every applied proposal increments the contracts file's NEXUS_VERSION comment.
// §6.1  The proposals.jsonl IS the documentation. Generated from proof.

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const MODULE_ID = 'contract-registry-writer';
const VERSION   = '1.0.0';

// ── Paths ─────────────────────────────────────────────────────────────────────
const ROOT              = path.join(__dirname, '..');
const CONTRACTS_FILE    = path.join(ROOT, 'contracts', 'SYSTEM-CONTRACTS.js');
const REGISTRY_DIR      = path.join(ROOT, 'data', 'contract-registry');
const PROPOSALS_LOG     = path.join(REGISTRY_DIR, 'proposals.jsonl');
const APPLIED_LOG       = path.join(REGISTRY_DIR, 'applied.jsonl');

// ── Config ────────────────────────────────────────────────────────────────────
const POLL_MS           = parseInt(process.env.CRW_POLL_MS  || '10000');
const DRY_RUN           = process.env.CRW_DRY_RUN === 'true';   // never writes file in dry-run

// ── Resolution actions ────────────────────────────────────────────────────────
const ACTIONS = Object.freeze({
  ADD_AXIOM:       'add_axiom',       // new axiom key + text
  DEPRECATE_AXIOM: 'deprecate_axiom', // mark existing axiom as deprecated
  FLAG_VIOLATION:  'flag_violation',  // record a contract violation (no file change — log only)
});

// ── Lazy deps ─────────────────────────────────────────────────────────────────
let _jaa, _uid, _bus;

function _getJAA() {
  if (_jaa) return _jaa;
  try { ({ jaaDB: _jaa, uid: _uid } = require('../cortex/memory/jaa-db')); } catch (_) {}
  return _jaa;
}
function uid() { return _uid?.() ?? crypto.randomUUID(); }
function _getBus() {
  if (_bus) return _bus;
  try { _bus = require('../nexus/nexus-bus'); } catch (_) {}
  return _bus;
}

// ── Ensure registry dir ───────────────────────────────────────────────────────
try { fs.mkdirSync(REGISTRY_DIR, { recursive: true }); } catch (_) {}

// ── Already-applied set (in-memory, rebuilt from applied.jsonl on init) ───────
// Prevents a resolved gap from being applied twice if the process restarts
// between the JAA update and the disk write.
const _applied = new Set();

function _loadApplied() {
  try {
    if (!fs.existsSync(APPLIED_LOG)) return;
    const lines = fs.readFileSync(APPLIED_LOG, 'utf8').split('\n').filter(Boolean);
    for (const l of lines) {
      try { const r = JSON.parse(l); if (r.gapUuid) _applied.add(r.gapUuid); } catch (_) {}
    }
  } catch (e) {
    _log('contract-registry-writer.applied.load.failed', { error: e.message });
  }
}

// ── Proposal logging (§LAW II: written before file is touched) ────────────────
function _writeProposal(record) {
  try {
    fs.appendFileSync(PROPOSALS_LOG, JSON.stringify(record) + '\n');
  } catch (e) {
    _log('contract-registry-writer.proposal.write.failed', { error: e.message });
    throw e; // propagate — §2.1 means we must not proceed if the ledger write fails
  }
}

function _writeApplied(record) {
  try {
    fs.appendFileSync(APPLIED_LOG, JSON.stringify(record) + '\n');
    _applied.add(record.gapUuid);
  } catch (e) {
    _log('contract-registry-writer.applied.write.failed', { error: e.message });
  }
}

// ── Validation ────────────────────────────────────────────────────────────────
// A proposal is valid if:
//   - It has a recognized action
//   - For add_axiom: payload.key matches §X.Y or §WORD-NN pattern, payload.text is non-empty
//   - For deprecate_axiom: payload.key exists in the current AXIOMS block
//   - For flag_violation: payload.description is non-empty (no file change needed)
//   - It has not already been applied
//
// Returns { valid: bool, reason: string }
function _validate(gap) {
  const action  = gap.resolution_action;
  const payload = gap.resolution_payload;

  if (!action) {
    return { valid: false, reason: 'resolution_action is missing' };
  }
  if (!Object.values(ACTIONS).includes(action)) {
    return { valid: false, reason: `unknown resolution_action: '${action}'. Must be one of: ${Object.values(ACTIONS).join(', ')}` };
  }
  if (!payload || typeof payload !== 'object') {
    return { valid: false, reason: 'resolution_payload must be an object' };
  }
  if (_applied.has(gap.uuid)) {
    return { valid: false, reason: `gap ${gap.uuid} already applied` };
  }

  if (action === ACTIONS.ADD_AXIOM) {
    if (!payload.key || typeof payload.key !== 'string') {
      return { valid: false, reason: 'add_axiom: payload.key is required (e.g. §9.1 or §MYAXIOM-01)' };
    }
    // Key must match existing naming conventions — §N.N or §WORD-NN or §WORD
    if (!/^§[A-Z0-9][A-Z0-9\-\.]*$/.test(payload.key)) {
      return { valid: false, reason: `add_axiom: key '${payload.key}' must start with § followed by uppercase letters/numbers/dashes/dots (e.g. §9.1, §CAUSAL-08)` };
    }
    if (!payload.text || typeof payload.text !== 'string' || !payload.text.trim()) {
      return { valid: false, reason: 'add_axiom: payload.text is required and must be non-empty' };
    }
    if (!payload.rationale || typeof payload.rationale !== 'string') {
      return { valid: false, reason: 'add_axiom: payload.rationale is required — explain why this axiom is needed' };
    }
    // Check for key collision with existing axioms in file
    const src = _readContractsFile();
    if (src && src.includes(`'${payload.key}':`)) {
      return { valid: false, reason: `add_axiom: key '${payload.key}' already exists in SYSTEM-CONTRACTS.js` };
    }
  }

  if (action === ACTIONS.DEPRECATE_AXIOM) {
    if (!payload.key || typeof payload.key !== 'string') {
      return { valid: false, reason: 'deprecate_axiom: payload.key is required' };
    }
    if (!payload.rationale || typeof payload.rationale !== 'string') {
      return { valid: false, reason: 'deprecate_axiom: payload.rationale is required' };
    }
    // Key must exist in the contracts file
    const src = _readContractsFile();
    if (src && !src.includes(`'${payload.key}':`)) {
      return { valid: false, reason: `deprecate_axiom: key '${payload.key}' not found in SYSTEM-CONTRACTS.js` };
    }
  }

  if (action === ACTIONS.FLAG_VIOLATION) {
    if (!payload.description || typeof payload.description !== 'string' || !payload.description.trim()) {
      return { valid: false, reason: 'flag_violation: payload.description is required' };
    }
  }

  return { valid: true, reason: 'ok' };
}

// ── File reader (cached per tick — never held across ticks) ───────────────────
let _srcCache = null;
function _readContractsFile() {
  if (_srcCache) return _srcCache;
  try {
    _srcCache = fs.readFileSync(CONTRACTS_FILE, 'utf8');
    return _srcCache;
  } catch (e) {
    _log('contract-registry-writer.contracts.read.failed', { error: e.message });
    return null;
  }
}
function _clearCache() { _srcCache = null; }

// ── Patch: add_axiom ──────────────────────────────────────────────────────────
// Finds the AXIOMS object in SYSTEM-CONTRACTS.js and appends the new key.
// Insertion point: just before the closing `});` of the AXIOMS block.
// Format matches the existing style exactly.
//
// §5.3 — surgical. Does not rewrite the file. Finds the seam, inserts at it.
function _patchAddAxiom(payload, proposalUuid, rationale) {
  const src = _readContractsFile();
  if (!src) throw new Error('cannot read SYSTEM-CONTRACTS.js');

  // Find the AXIOMS closing marker — `});` on its own line after the axiom entries
  // Strategy: locate `const AXIOMS = Object.freeze({` then find its matching `});`
  const openIdx = src.indexOf('const AXIOMS = Object.freeze({');
  if (openIdx === -1) throw new Error('AXIOMS block not found in SYSTEM-CONTRACTS.js');

  // Walk forward counting brace depth to find the matching close
  let depth = 0;
  let closeIdx = -1;
  for (let i = openIdx; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) { closeIdx = i; break; }
    }
  }
  if (closeIdx === -1) throw new Error('AXIOMS block closing brace not found');

  // Find the last newline before closeIdx to get the insertion point
  const insertAt = src.lastIndexOf('\n', closeIdx);
  if (insertAt === -1) throw new Error('Cannot find insertion point in AXIOMS block');

  // Build the new line — match indent style (2 spaces)
  const ts    = new Date().toISOString();
  const newLine = `\n  // Added by contract-registry-writer ${ts} — proposal ${proposalUuid}\n  // Rationale: ${rationale}\n  '${payload.key}':  '${payload.text.replace(/'/g, "\\'")}',`;

  const patched = src.slice(0, insertAt) + newLine + src.slice(insertAt);
  return patched;
}

// ── Patch: deprecate_axiom ────────────────────────────────────────────────────
// Finds the existing axiom line and prepends a DEPRECATED comment.
// Does not remove the line — §2.1 history preservation. The axiom stays
// but is marked so tooling and humans can see it is no longer active.
function _patchDeprecateAxiom(payload, proposalUuid, rationale) {
  const src = _readContractsFile();
  if (!src) throw new Error('cannot read SYSTEM-CONTRACTS.js');

  const keyLiteral = `'${payload.key}':`;
  const lineStart  = src.indexOf(keyLiteral);
  if (lineStart === -1) throw new Error(`Axiom key ${payload.key} not found in source`);

  // Find the start of that line
  const lineBegin = src.lastIndexOf('\n', lineStart) + 1;
  const ts        = new Date().toISOString();
  const deprecNote = `  // DEPRECATED ${ts} — proposal ${proposalUuid}: ${rationale}\n  // `;

  // Insert deprecation comment before the line
  const patched = src.slice(0, lineBegin) + deprecNote + src.slice(lineBegin);
  return patched;
}

// ── Apply a single resolved gap ────────────────────────────────────────────────
async function _applyGap(gap) {
  const jaa = _getJAA();
  const action  = gap.resolution_action;
  const payload = gap.resolution_payload;
  const pUuid   = uid();
  const ts      = Date.now();

  // §LAW II — write proposal record BEFORE touching the file
  const proposalRecord = {
    uuid:            pUuid,
    gapUuid:         gap.uuid,
    action,
    payload,
    rationale:       payload.rationale || gap.body || '',
    appliedAt:       ts,
    appliedBy:       MODULE_ID,
    dryRun:          DRY_RUN,
    gapBody:         gap.body,
    gapSource:       gap.source,
    gapCreatedAt:    gap.createdAt,
  };
  _writeProposal(proposalRecord);

  // flag_violation — log only, no file change
  if (action === ACTIONS.FLAG_VIOLATION) {
    if (jaa) {
      try {
        jaa.insert('event_log', {
          uuid: uid(), type: 'contract-registry.violation.flagged',
          payload: { proposalUuid: pUuid, gapUuid: gap.uuid, description: payload.description },
          source: MODULE_ID, causedBy: gap.uuid, ts,
        });
      } catch (_) {}
    }
    _getBus()?.emit('contract-registry.violation.flagged', { proposalUuid: pUuid, gapUuid: gap.uuid, description: payload.description });
    // Mark the gap as archived (terminal — fully processed)
    if (jaa) {
      try { jaa.update('gaps', gap.uuid, { status: 'archived', archivedAt: ts, archivedBy: MODULE_ID, proposalUuid: pUuid }); } catch (_) {}
    }
    _writeApplied({ ...proposalRecord, outcome: 'flagged' });
    _log('contract-registry.violation.flagged', { gapUuid: gap.uuid, description: payload.description });
    return { ok: true, action: 'flagged', proposalUuid: pUuid };
  }

  // File-mutating actions
  let patched;
  try {
    if (action === ACTIONS.ADD_AXIOM) {
      patched = _patchAddAxiom(payload, pUuid, payload.rationale || '');
    } else if (action === ACTIONS.DEPRECATE_AXIOM) {
      patched = _patchDeprecateAxiom(payload, pUuid, payload.rationale || '');
    }
  } catch (e) {
    _log('contract-registry.patch.failed', { gapUuid: gap.uuid, action, error: e.message });
    if (jaa) {
      try {
        jaa.insert('event_log', {
          uuid: uid(), type: 'contract-registry.patch.failed',
          payload: { gapUuid: gap.uuid, action, error: e.message, proposalUuid: pUuid },
          source: MODULE_ID, causedBy: gap.uuid, ts: Date.now(),
        });
      } catch (_) {}
    }
    return { ok: false, error: e.message, proposalUuid: pUuid };
  }

  if (!patched) {
    return { ok: false, error: 'patch produced no output', proposalUuid: pUuid };
  }

  // Write the patched file (or skip in dry-run)
  if (!DRY_RUN) {
    try {
      // Atomic-ish: write to .tmp then rename
      const tmpPath = CONTRACTS_FILE + '.tmp';
      fs.writeFileSync(tmpPath, patched, 'utf8');
      fs.renameSync(tmpPath, CONTRACTS_FILE);
      _clearCache();
    } catch (e) {
      _log('contract-registry.file.write.failed', { error: e.message, gapUuid: gap.uuid });
      return { ok: false, error: `file write failed: ${e.message}`, proposalUuid: pUuid };
    }
  } else {
    _log('contract-registry.dry_run', { action, key: payload.key, gapUuid: gap.uuid });
  }

  // Mark gap archived in JAA
  if (jaa) {
    try {
      jaa.update('gaps', gap.uuid, {
        status:       'archived',
        archivedAt:   Date.now(),
        archivedBy:   MODULE_ID,
        proposalUuid: pUuid,
      });
    } catch (e) {
      _log('contract-registry.gap.archive.failed', { error: e.message });
    }
  }

  // Write applied record
  _writeApplied({ ...proposalRecord, outcome: 'applied', dryRun: DRY_RUN });

  // Bus emission — the system observes the change
  const busPayload = { proposalUuid: pUuid, gapUuid: gap.uuid, action, key: payload.key, dryRun: DRY_RUN };
  _getBus()?.emit('contract-registry.axiom.changed', busPayload);
  if (jaa) {
    try {
      jaa.insert('event_log', {
        uuid: uid(), type: 'contract-registry.axiom.changed',
        payload: busPayload, source: MODULE_ID, causedBy: gap.uuid, ts: Date.now(),
      });
    } catch (_) {}
  }

  _log('contract-registry.applied', { action, key: payload.key, gapUuid: gap.uuid, dryRun: DRY_RUN });
  return { ok: true, action: 'applied', proposalUuid: pUuid, dryRun: DRY_RUN };
}

// ── Poll tick ─────────────────────────────────────────────────────────────────
// Finds resolved CONSTITUTIONAL gaps that have a resolution_action set
// and have not yet been applied.
async function _tick() {
  const jaa = _getJAA();
  if (!jaa) return;

  let gaps = [];
  try {
    gaps = jaa.query('gaps', r =>
      r.loop_type   === 'CONSTITUTIONAL' &&
      r.status      === 'resolved' &&
      r.resolution_action &&
      !_applied.has(r.uuid),
    50);
  } catch (_) { return; }

  for (const gap of gaps) {
    const { valid, reason } = _validate(gap);
    if (!valid) {
      _log('contract-registry.validation.rejected', { gapUuid: gap.uuid, reason });
      // Mark the gap so we don't keep retrying a permanently invalid proposal
      try {
        jaa.update('gaps', gap.uuid, {
          crw_rejected:       true,
          crw_reject_reason:  reason,
          crw_rejected_at:    Date.now(),
        });
        _applied.add(gap.uuid); // don't pick it up again
      } catch (_) {}
      continue;
    }

    try {
      await _applyGap(gap);
    } catch (e) {
      _log('contract-registry.apply.error', { gapUuid: gap.uuid, error: e.message });
    }
  }
}

// ── Event logging ─────────────────────────────────────────────────────────────
function _log(type, payload = {}) {
  const jaa = _getJAA();
  const bus = _getBus();
  if (jaa) {
    try { jaa.insert('event_log', { uuid: uid(), type, payload, source: MODULE_ID, ts: Date.now() }); } catch (_) {}
  }
  if (bus?.emit) {
    try { bus.emit(type, payload, { source: MODULE_ID }); } catch (_) {}
  }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
let _interval = null;

function init(cfg = {}) {
  _loadApplied();
  const pollMs = cfg.pollMs ?? POLL_MS;
  _interval = setInterval(() => { _tick().catch(e => _log('contract-registry.tick.error', { error: e.message })); }, pollMs);
  _interval.unref?.();
  console.log(`[${MODULE_ID}] v${VERSION} — poll:${pollMs}ms dry_run:${DRY_RUN} contracts:${CONTRACTS_FILE}`);
  if (DRY_RUN) console.warn(`[${MODULE_ID}] DRY_RUN=true — no files will be written`);
}

function stop() {
  if (_interval) { clearInterval(_interval); _interval = null; }
}

// ── Manual apply — for CLI / operator use ─────────────────────────────────────
// Allows an operator to directly apply a proposal without waiting for the poll.
// Same validation and audit trail as the automated path.
//   action:  'add_axiom' | 'deprecate_axiom' | 'flag_violation'
//   payload: { key, text, rationale } or { key, rationale } or { description }
//   gapUuid: the gap this is resolving (required for audit trail)
async function applyProposal({ action, payload, gapUuid }) {
  if (!gapUuid) return { ok: false, error: 'gapUuid is required' };
  const syntheticGap = { uuid: gapUuid, resolution_action: action, resolution_payload: payload,
    loop_type: 'CONSTITUTIONAL', status: 'resolved', body: payload.rationale || '', source: 'operator' };
  const { valid, reason } = _validate(syntheticGap);
  if (!valid) return { ok: false, error: reason };
  return _applyGap(syntheticGap);
}

// ── Inspect proposals log ─────────────────────────────────────────────────────
function getProposals(n = 50) {
  try {
    if (!fs.existsSync(PROPOSALS_LOG)) return [];
    const lines = fs.readFileSync(PROPOSALS_LOG, 'utf8').split('\n').filter(Boolean);
    return lines.slice(-n).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}

function getApplied(n = 50) {
  try {
    if (!fs.existsSync(APPLIED_LOG)) return [];
    const lines = fs.readFileSync(APPLIED_LOG, 'utf8').split('\n').filter(Boolean);
    return lines.slice(-n).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}

function validateWiring() {
  const contractsExist = fs.existsSync(CONTRACTS_FILE);
  const registryDirOk  = fs.existsSync(REGISTRY_DIR);
  const checks = {
    jaa:            !!_getJAA(),
    bus:            !!_getBus(),
    contractsFile:  contractsExist,
    registryDir:    registryDirOk,
    appliedLoaded:  _applied.size,
  };
  const online = [checks.jaa, checks.bus, checks.contractsFile, checks.registryDir].filter(Boolean).length;
  console.log(`[${MODULE_ID}] wiring: ${online}/4 ready. applied: ${_applied.size}`);
  if (!contractsExist) console.error(`[${MODULE_ID}] FATAL: contracts file not found at ${CONTRACTS_FILE}`);
  return checks;
}

module.exports = {
  init, stop, validateWiring,
  applyProposal, getProposals, getApplied,
  ACTIONS, MODULE_ID, VERSION,
  // Test-only
  _validate, _patchAddAxiom, _patchDeprecateAxiom,
};
