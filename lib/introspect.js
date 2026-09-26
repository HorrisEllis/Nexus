'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// lib/introspect.js — the co-pilot examines its own last answer
// UUID: nexus-introspect-v1-0000-2026-0819-001
// Version: 1.0.0
// Component: lib.introspect
// Hook: lib.introspect:v1:p0001
//
// James: "do we have the introspect tool? and reflection engine? like hooking
// co-pilot to the reflection engine when i tell it to retry the response."
//
// ── WHAT ALREADY EXISTED, CHECKED NOT ASSUMED ───────────────────────────────
//
//   lib/reflection.js               EXISTS — scoreDecision, runReflectionPass,
//                                   trackIdentityEvidence. 22 passing tests.
//   copilot/adaptive-fulfillment.js EXISTS and is wired at server.js:1458 —
//                                   RAID picks → dispatch → scoreDecision →
//                                   taxonomy classifies → re-route, agent
//                                   excluded on failure.
//   introspect                      DID NOT EXIST. No file, no reference.
//
// And the retry path was not connected. copilot/server.js:451 already detects
// "try again / that's wrong / not what / i said" — and does exactly one thing
// with it: records a user-model observation that the user corrects the
// co-pilot. The strongest signal available in the whole loop, used only to
// note that it happened.
//
// ── WHAT INTROSPECT IS, AND IS NOT ──────────────────────────────────────────
//
// It is NOT the co-pilot grading its own homework. An LLM asked "was that a
// good answer?" says yes, and a retry loop built on that produces a second
// confident answer with the same defect. This reads REAL signals that exist
// independently of the model's opinion:
//
//   reflection.scoreDecision   the existing scorer, on the real decision row
//   lifeline-contracts         did the output match the SHAPE the intent required
//   gap-field                  did this exchange open gaps, and which
//   component-ledger           what actually happened, versus what was claimed
//   user correction            the human said it was wrong. Outranks everything.
//
// That last one matters most and is the reason this module exists. When the
// user says "try again", the system already has ground truth: the answer was
// wrong. There is nothing to infer. The only useful question left is WHICH
// signal should have caught it — and that is answerable from the record.
//
// §1.2 — a signal that cannot be read is UNAVAILABLE, never "clean". An
// introspection where every source is down must not come back looking healthy;
// that is the failure this whole codebase keeps re-learning.
// ─────────────────────────────────────────────────────────────────────────────

const MODULE_ID = 'introspect';
const VERSION   = '1.0.0';
const COMP_ID   = 'lib.introspect';
const HOOK_ID   = 'lib.introspect:v1:p0001';

function _try(path) { try { return require(path); } catch (_) { return null; } }

/**
 * examine({ prompt, response, requestId, sessionId, userSaidWrong })
 *
 * Returns a verdict assembled from real signals, each tagged with whether it
 * could actually be read. Never returns a bare score: a number with no
 * provenance is indistinguishable from a guess.
 */
async function examine({ prompt, response, requestId = null, sessionId = null,
                         userSaidWrong = false, intent = null } = {}) {
  const signals = {};
  let readable = 0;

  // ── 1. The user's own verdict. Ground truth; nothing outranks it. ────────
  if (userSaidWrong) {
    signals.user = { readable: true, verdict: 'wrong', weight: 1,
      note: 'the user said so. This is not an inference and does not need corroborating.' };
    readable++;
  } else {
    signals.user = { readable: false, verdict: null,
      note: 'no explicit correction — absence of complaint is NOT evidence of correctness' };
  }

  // ── 2. reflection.scoreDecision — the existing scorer, reused ────────────
  const reflection = _try('./reflection');
  if (reflection && typeof reflection.scoreDecision === 'function') {
    try {
      const row = _findDecision(requestId, sessionId);
      if (row) {
        const s = reflection.scoreDecision(row);
        signals.reflection = { readable: true, score: s.score, reason: s.reason, row: row.uuid };
        readable++;
      } else {
        signals.reflection = { readable: false,
          note: 'no decision row found for this request — the exchange was not recorded, which is itself a finding' };
      }
    } catch (e) {
      signals.reflection = { readable: false, error: e.message };
    }
  } else {
    signals.reflection = { readable: false, note: 'lib/reflection unavailable — UNREAD, not passing' };
  }

  // ── 3. Contract shape ────────────────────────────────────────────────────
  const contracts = _try('../copilot/lib/lifeline-contracts');
  if (contracts && intent) {
    try {
      const c = contracts.check ? contracts.check(response, intent) : null;
      if (c) { signals.contract = { readable: true, valid: c.valid !== false, reason: c.reason || null }; readable++; }
      else signals.contract = { readable: false, note: 'contracts module exposed no check()' };
    } catch (e) { signals.contract = { readable: false, error: e.message }; }
  } else {
    signals.contract = { readable: false,
      note: intent ? 'lifeline-contracts unavailable' : 'no intent supplied — shape cannot be checked against nothing' };
  }

  // ── 4. Gaps opened during this exchange ─────────────────────────────────
  const gapField = _try('../copilot/lib/gap-field') || _try('./gap-field');
  if (gapField && typeof gapField.openGaps === 'function') {
    try {
      const recent = (gapField.openGaps() || []).filter(g => !requestId || g.requestId === requestId || !g.requestId);
      signals.gaps = { readable: true, count: recent.length,
        types: [...new Set(recent.map(g => g.type))].slice(0, 6) };
      readable++;
    } catch (e) { signals.gaps = { readable: false, error: e.message }; }
  } else {
    signals.gaps = { readable: false, note: 'gap-field unavailable' };
  }

  // ── 5. What the ledger says actually happened ───────────────────────────
  const jaa = _try('../cortex/memory/jaa-db');
  if (jaa && jaa.jaaDB) {
    try {
      const rows = (jaa.jaaDB.query('component_ledger',
        r => r.system === 'copilot' && (!sessionId || r.session === sessionId), 40) || []);
      const errors = rows.filter(r => r.status === 'error');
      signals.ledger = { readable: true, rows: rows.length, errors: errors.length,
        errorActions: [...new Set(errors.map(r => `${r.component}.${r.action}`))].slice(0, 5) };
      readable++;
    } catch (e) { signals.ledger = { readable: false, error: e.message }; }
  } else {
    signals.ledger = { readable: false, note: 'store unreachable — UNREAD, not empty' };
  }

  return _verdict(signals, readable, { prompt, response, requestId, sessionId });
}

function _verdict(signals, readable, ctx) {
  const total = Object.keys(signals).length;

  if (readable === 0) {
    // §1.2 — nothing could be read. That is NOT a pass, and must not look like one.
    return {
      verdict: 'UNVERIFIABLE', confidence: 0, signals, readable, total,
      reason: 'no signal could be read — this introspection knows nothing about the answer',
      actionable: 'bring reflection or the store up; retrying now would be guessing twice',
      diagnosis: null, retryPrompt: null,
    };
  }

  // The user's verdict short-circuits. When a person says it was wrong, the
  // system does not get to weigh that against a score and conclude otherwise.
  if (signals.user.readable && signals.user.verdict === 'wrong') {
    const d = _diagnose(signals);
    return {
      verdict: 'WRONG', confidence: 1, signals, readable, total,
      reason: 'the user said the answer was wrong — ground truth, not an inference',
      diagnosis: d.text, missedBy: d.missedBy,
      actionable: d.actionable,
      retryPrompt: _retryPrompt(ctx, d),
    };
  }

  const score = signals.reflection.readable ? signals.reflection.score : null;
  const contractBad = signals.contract.readable && signals.contract.valid === false;
  const ledgerErrs = signals.ledger.readable ? signals.ledger.errors : 0;

  const suspect = contractBad || ledgerErrs > 0 || (score !== null && score < 0.5);
  return {
    verdict: suspect ? 'SUSPECT' : 'NO_SIGNAL_OF_FAILURE',
    confidence: +(readable / total).toFixed(2),
    signals, readable, total,
    // Deliberately not "PASS". Nothing here can establish that an answer was
    // good — only that nothing detected it being bad, which is a weaker claim
    // and needs to keep saying so.
    reason: suspect
      ? `signals of failure: ${[contractBad && 'contract shape', ledgerErrs > 0 && `${ledgerErrs} ledger error(s)`, score !== null && score < 0.5 && `reflection score ${score}`].filter(Boolean).join(', ')}`
      : `${readable}/${total} signals readable, none indicate failure — this is NOT the same as verified correct`,
    diagnosis: suspect ? _diagnose(signals).text : null,
    retryPrompt: suspect ? _retryPrompt(ctx, _diagnose(signals)) : null,
  };
}

/**
 * _diagnose — which signal SHOULD have caught this, and did it?
 *
 * When the user corrects an answer that every automated signal called fine,
 * the useful finding is not about the answer. It is that the detectors are
 * blind to a whole class of error, and that gap is worth more than the retry.
 */
function _diagnose(signals) {
  const shouldHave = [];
  const wasBlind = [];

  if (signals.contract.readable) {
    if (signals.contract.valid === false) shouldHave.push(`contract shape (${signals.contract.reason || 'shape mismatch'})`);
  } else wasBlind.push('contract');

  if (signals.reflection.readable) {
    if (signals.reflection.score < 0.5) shouldHave.push(`reflection scored ${signals.reflection.score} — ${signals.reflection.reason}`);
  } else wasBlind.push('reflection');

  if (signals.ledger.readable && signals.ledger.errors > 0) {
    shouldHave.push(`${signals.ledger.errors} ledger error(s): ${signals.ledger.errorActions.join(', ')}`);
  } else if (!signals.ledger.readable) wasBlind.push('ledger');

  if (signals.gaps.readable && signals.gaps.count > 0) {
    shouldHave.push(`${signals.gaps.count} open gap(s): ${signals.gaps.types.join(', ')}`);
  } else if (!signals.gaps.readable) wasBlind.push('gaps');

  if (shouldHave.length) {
    return { text: shouldHave.join(' · '), missedBy: [],
      actionable: 'the signals DID fire — they were available and not acted on. Wire them into the response path, not just the record.' };
  }

  // Nothing detected it. This is the interesting case.
  return {
    text: wasBlind.length
      ? `no signal detected a problem, and ${wasBlind.length} were UNREADABLE (${wasBlind.join(', ')}) — the miss may simply be unobserved`
      : 'every readable signal said the answer was fine, and the user says it was not — the detectors are blind to this class of error',
    missedBy: wasBlind,
    actionable: wasBlind.length
      ? `restore ${wasBlind.join(', ')} before concluding anything about detector coverage`
      : 'this is a COVERAGE GAP, and it is worth more than the retry: file it, because the next instance of this error will pass silently too',
  };
}

/**
 * _retryPrompt — what to actually send back.
 *
 * The specific finding, never "you were wrong, try again". A retry with no
 * new information produces a reworded version of the same answer, which is
 * how a retry loop burns attempts while appearing to work.
 */
function _retryPrompt(ctx, d) {
  const lines = [
    'Your previous answer was rejected. Do not restate it.',
    '',
    `ORIGINAL REQUEST: ${String(ctx.prompt || '').slice(0, 500)}`,
    '',
    `WHY IT WAS REJECTED: ${d.text}`,
    '',
    'Address that specific finding. If you believe the previous answer was correct, ' +
    'say so plainly and explain why rather than producing a reworded version of it.',
  ];
  return lines.join('\n');
}

function _findDecision(requestId, sessionId) {
  const jaa = _try('../cortex/memory/jaa-db');
  if (!jaa || !jaa.jaaDB) return null;
  try {
    const rows = jaa.jaaDB.query('raid_decisions',
      r => (requestId && r.requestId === requestId) || (sessionId && r.session === sessionId), 5) || [];
    return rows.length ? rows[rows.length - 1] : null;
  } catch (_) { return null; }
}

/**
 * retry({ ... }) — the "retry the response" path, end to end.
 *
 * examine → build the retry prompt from the finding → dispatch → record.
 * Returns the new answer AND the diagnosis, because a retry that does not say
 * what it changed is indistinguishable from a re-roll.
 */
async function retry({ prompt, response, dispatchFn, requestId = null, sessionId = null, intent = null }) {
  if (typeof dispatchFn !== 'function') {
    throw new Error(`[${MODULE_ID}] §1.1 retry requires a dispatchFn — this module diagnoses, it does not know how to reach an agent`);
  }
  const ex = await examine({ prompt, response, requestId, sessionId, intent, userSaidWrong: true });

  if (!ex.retryPrompt) {
    return { ok: false, examined: ex,
      reason: 'introspection produced no retry prompt — refusing to re-ask with no new information',
      note: 'a retry carrying nothing new returns a reworded version of the same answer' };
  }

  let answer = null, error = null;
  try { answer = await dispatchFn(ex.retryPrompt); }
  catch (e) { error = e.message; }

  _ledger('retry', error ? 'error' : 'info', {
    requestId, sessionId, verdict: ex.verdict, diagnosis: ex.diagnosis,
    blindSignals: ex.missedBy || [], error,
  });

  return { ok: !error, answer, error, examined: ex,
    diagnosis: ex.diagnosis, actionable: ex.actionable };
}

function _ledger(action, status, detail) {
  try {
    require('./component-ledger').write({
      system: 'copilot', component: 'copilot.introspect', action, status, detail,
      hook: HOOK_ID, wire: 'copilot.introspect→lib.reflection', tags: ['introspect', 'retry'],
    });
  } catch (_) { /* §1.2 telemetry never breaks the retry */ }
}

/** health() — which signals are readable right now, named. */
function health() {
  const probe = {
    reflection: !!_try('./reflection'),
    contracts:  !!_try('../copilot/lib/lifeline-contracts'),
    gapField:   !!(_try('../copilot/lib/gap-field') || _try('./gap-field')),
    store:      !!(_try('../cortex/memory/jaa-db') || {}).jaaDB,
  };
  const blind = Object.entries(probe).filter(([, v]) => !v).map(([k]) => k);
  return { ok: true, version: VERSION, signals: probe, blind,
    note: blind.length ? `BLIND to: ${blind.join(', ')} — introspection here is partial and says so` : null };
}

module.exports = { examine, retry, health, MODULE_ID, VERSION, COMP_ID, HOOK_ID };
