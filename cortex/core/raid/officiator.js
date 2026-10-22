'use strict';
/**
 * cortex/core/raid/officiator.js — real contract synthesis from a
 * staged artifact.
 * UUID: nexus-raid-officiator-v1-0000-2026-0902-jamesbrooks-001
 * Version: 1.0.0
 *
 * §BUILT 2026-09-02 — James: "did you finish the synthesis for the
 * contracts. thats top priority. maybe intent: contract or officiator
 * for synthesizing contracts. needs to listen for the artifact."
 *
 * §WHAT THIS IS — the real, second half of B1's own agent-synthesized-
 * contracts design (docs/2026-09-02-nexus-vision-master-phasemap.spec):
 * an agent (not a fixed function) receives the real B1 primitive
 * schema plus real context and PRODUCES the actual contract content,
 * rather than a function assembling it. "the_officiator" (lib/hat-
 * seed.js, this same session) is that hat — real, scoped, dispatched
 * exactly like any other hat-wearing job, through the same guardian
 * path every other real dispatch in this codebase already uses.
 *
 * §LISTENING FOR THE ARTIFACT — "the artifact" is the real, already-
 * built pipeline this session's own artifact-storage work wired up:
 * clear-glass's download-capture -> guardian's POST /api/intake ->
 * lib/intake.js's stage(). That pipeline writes real drops to a real,
 * physical directory (lib/intake.js's own INTAKE_DIR) — this module
 * polls it, the same real "worker ticks and drains a queue" pattern
 * already proven by cortex/core/raid/worker.js and orchestrator/lib/
 * versionium-auto-commit.js, not a new mechanism. Polling, not a push
 * subscription, because guardian (where the artifact lands) and this
 * module (cortex's process) are genuinely separate processes — the
 * intake directory is real, physical, shared-file-store infrastructure
 * both processes already read/write today (same convention versionium/
 * lib/store.js's own header already documents for event_log).
 */
const intake = require('../../../lib/intake.js');
const hatForge = require('../../../lib/hat-forge.js');
const { submitContract } = require('./contract-intake.js');

const MODULE_ID = 'raid-officiator';
const VERSION   = '1.2.0';
const INTERVAL_MS = parseInt(process.env.OFFICIATOR_INTERVAL_MS || '20000', 10);

let _timer = null;
let _running = false;
let _heldSaid = false;
let _streakSaid = null;   // SD20 — the streak hold is said once per streak
// §HONEST, IN-MEMORY DEDUP — a drop this process has already turned
// into a contract (or tried and gave up on) is never reconsidered
// within this process's own lifetime. Not persisted: a restart re-
// scanning already-synthesized drops and finding they're still STAGED
// (submitContract doesn't currently write anything back onto the
// intake drop's own state) would re-synthesize them — a real, known
// limitation, not silently hidden.
// §FIXED 2026-09-02 — the honest, in-memory-only limitation this
// module's own header used to document (a restart re-scanning already-
// synthesized drops would re-synthesize them) is now closed for real:
// officiate() calls the new lib/intake.js's markOfficiated() on every
// real success, a persisted, physical marker on the drop's own
// intake-contract.json — survives a restart, not just this process's
// own memory. _seen stays as a real, same-process fast-path (skips a
// disk read for a drop this exact process already handled moments
// ago), not the only defense anymore.
const _seen = new Set();

// §0.60.26 — a drop that failed is retried with backoff, persisted. James's 0.60.23 log: every boot re-sent the same
// nine staged drops to Claude (each failed: "no real agent response"), four boots in a row, because _seen is memory
// only. Now each failure is written beside the intake dir; the next try waits BACKOFF_MS · 2^(n-1), capped, and after
// MAX_ATTEMPTS the drop is parked (said once), never sent again until its record is cleared.
const BACKOFF_MS = parseInt(process.env.OFFICIATOR_BACKOFF_MS || String(10 * 60 * 1000), 10);
const MAX_ATTEMPTS = parseInt(process.env.OFFICIATOR_MAX_ATTEMPTS || '4', 10);
// §RT1 0.60.78 — James: "Next" (step 5 of his order: routing). His 0.60.44 log: 63 failed syntheses and 45 parked drops, all
// "no real agent response (forAgent=ollama)", parked drops cleared only by hand-editing this file. Three causes, read here:
//   1. an agent that did not answer was charged to the DROP (its attempts spent, then parked): the agent's failure, not the drop's
//   2. no fallback: RAID picked the same slow agent every tick, and nothing told it otherwise
//   3. parked was forever
// Now (the GT1 rule, classify before learning): a drop walks RAID's ranked candidates (up to MAX_AGENTS); an agent that does
// not answer is skipped for the next and teaches RAID nothing; one that answers with no contract counts against the drop and
// teaches RAID (recordOutcome false); a success teaches it too. When no agent answers, no drop is charged: the officiator
// waits (AGENT_BACKOFF_MS, doubling, capped), persisted beside the attempts. Parked drops get a daily try, and unpark() clears them.
const MAX_AGENTS = parseInt(process.env.OFFICIATOR_MAX_AGENTS || '3', 10);
const AGENT_BACKOFF_MS = parseInt(process.env.OFFICIATOR_AGENT_BACKOFF_MS || String(2 * 60 * 1000), 10);
const PARKED_RETRY_MS = parseInt(process.env.OFFICIATOR_PARKED_RETRY_MS || String(24 * 3600 * 1000), 10);
const AGENTS_KEY = '__agents';   // the attempts file's record of the agents' own wait (not a drop)
const AGENT_FAILURE = /no real agent response|guardian unreachable|no connected provider|no available agent/i;
const _fs = require('fs'), _path = require('path');
function _attemptsFile() { return _path.join(_path.dirname(intake.INTAKE_DIR), 'officiator-attempts.json'); }
function _readAttempts() { try { return JSON.parse(_fs.readFileSync(_attemptsFile(), 'utf8')) || {}; } catch (_) { return {}; } }
function _writeAttempts(a) { try { _fs.mkdirSync(_path.dirname(_attemptsFile()), { recursive: true }); _fs.writeFileSync(_attemptsFile(), JSON.stringify(a, null, 2)); } catch (_) {} }
/** due(rec, now) → may this drop be tried now (no record, or its backoff has passed and it is not parked) */
function due(rec, now = Date.now()) {
  if (!rec || !rec.n) return true;
  // §RT1 0.60.78 — parked is not forever: a parked drop gets one more try a day (said), so nothing waits on a hand edit
  if (rec.n >= MAX_ATTEMPTS) return now - (rec.at || 0) >= PARKED_RETRY_MS;
  return now - (rec.at || 0) >= Math.min(BACKOFF_MS * 2 ** (rec.n - 1), 24 * 3600 * 1000);
}

// SD20 0.60.203 — James: "yes" (2026-10-22) to "Stop the loop. When a lifeline answer turns into a contract with no repo behind
// it, it should fail once and say so, not be re-created every 30 seconds." His SP5 log: each new drop (a reply of the build)
// synthesized to the same goal ("Build phase SP5_title by ensuring lib/title.js…"), about every 30 s, each contract
// blocked_at_handshake or failed — on qwen2.5-coder:7b running on the CPU at 2-9 % free memory. Drops differ, so the drop
// dedup above never saw it. Two guards, read from RAID's own queue (listQueue), nothing new stored:
//   1. sameGoal: a synthesized goal that already has an officiator contract queued or running, or one that failed or was
//      blocked within GOAL_WINDOW_MS, is not submitted again: the drop is marked officiated with duplicateOf (said once).
//   2. failStreak: when the officiator's last FAIL_STREAK contracts all failed or were blocked, the newest within
//      GOAL_WINDOW_MS, it stops synthesizing (each try is a model call) until the window passes or unpark clears it.
const GOAL_WINDOW_MS = parseInt(process.env.OFFICIATOR_GOAL_WINDOW_MS || String(3600 * 1000), 10);
const FAIL_STREAK = parseInt(process.env.OFFICIATOR_FAIL_STREAK || '3', 10);
const STREAK_KEY = '__streakClearedAt';   // the attempts file's record of a person clearing the streak (unpark)
const _TERMINAL_BAD = new Set(['fail', 'blocked']);
// the goal is what it is for and where it lands: intention + the file it names (a bare verb like 'build' alone would make
// every artifact one goal). rows carry the same fields: row.intention, row.contract.fileDirectory / fileName.
function goalKey(intention, { fileDirectory = null, fileName = null } = {}) {
  const n = (x) => String(x || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const i = n(intention).slice(0, 200); if (!i) return '';
  // a bare verb with no file says too little to call two contracts one goal: no key, never deduped (unknown stays unknown)
  if (!fileName && i.split(' ').length < 3) return '';
  return `${i}|${n(fileDirectory).replace(/\/+$/, '')}/${n(fileName)}`;
}
const _rowGoal = (r) => goalKey(r.intention, (r && r.contract) || {});
function _officiatorRows() { try { return require('./contract-intake.js').listQueue().filter(r => r && r.source === 'officiator'); } catch (_) { return []; } }
/** sameGoal(intention, where, rows, now) → the officiator contract this goal repeats (queued/running, or failed/blocked in the window), or null */
function sameGoal(intention, where = {}, rows = _officiatorRows(), now = Date.now()) {
  const k = goalKey(intention, where); if (!k) return null;
  const hits = rows.filter(r => _rowGoal(r) === k).sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
  return hits.find(r => r.status === 'queued' || r.status === 'running' || (_TERMINAL_BAD.has(r.status) && now - (r.updatedAt || r.createdAt || 0) < GOAL_WINDOW_MS)) || null;
}
/** failStreak(rows, { now, clearedAt }) → { held, n, until, last } — the officiator's newest finished contracts all bad, the newest in the window */
function failStreak(rows = _officiatorRows(), { now = Date.now(), clearedAt = 0 } = {}) {
  const done = rows.filter(r => r.status && r.status !== 'queued' && r.status !== 'running' && (r.updatedAt || r.createdAt || 0) > clearedAt)
    .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
  let n = 0; for (const r of done) { if (_TERMINAL_BAD.has(r.status)) n++; else break; }
  const last = done[0] || null; const at = last ? (last.updatedAt || last.createdAt || 0) : 0;
  const held = n >= FAIL_STREAK && now - at < GOAL_WINDOW_MS;
  return { held, n, until: held ? at + GOAL_WINDOW_MS : null, last: last ? { queueId: last.uuid, status: last.status, intention: last.intention || null, reason: last.blockReason || last.error || null } : null };
}

// §FIXED 2026-09-02 — checked lib/intake.js's real stage()/read() shape
// directly before writing this (not assumed): the drop object IS the
// contract, flat — drop.dropId/state/summary/provenance/claims, not
// nested under a .contract key. summary is a real OBJECT (file/create/
// overwrite/identical/unplaced/archive counts), not a string. There is
// no real .content field — claims only carry metadata (source/target/
// mapped/bytes/sha256/effect); real file bytes live on disk under the
// drop's own payload/ directory and have to be read separately.
function _readRealFileContent(drop, maxFiles = 5, maxBytesPerFile = 4000) {
  const fs = require('fs');
  const path = require('path');
  const claims = Array.isArray(drop.claims) ? drop.claims : [];
  const intakeDir = process.env.NEXUS_INTAKE_DIR || path.join(__dirname, '../../../data/intake');
  const out = [];
  for (const claim of claims.slice(0, maxFiles)) {
    try {
      const abs = path.join(intakeDir, drop.dropId, 'payload', claim.source);
      const buf = fs.readFileSync(abs);
      // §HONEST — a binary file's real bytes aren't useful in a text
      // prompt; skip it by real content sniff rather than guessing from
      // the extension alone.
      const isLikelyText = !buf.slice(0, 512).includes(0);
      if (!isLikelyText) { out.push(`--- ${claim.source} (binary, ${claim.bytes} bytes, not shown) ---`); continue; }
      out.push(`--- ${claim.source} ---\n${buf.toString('utf8').slice(0, maxBytesPerFile)}`);
    } catch (e) {
      out.push(`--- ${claim.source} (could not read: ${e.message}) ---`);
    }
  }
  return out.join('\n\n');
}

function _buildSynthesisPrompt(drop) {
  const s = drop.summary || {};
  const provenance = drop.provenance || {};
  return [
    'Synthesize ONE real build contract from the artifact below.',
    'Output ONLY a single JSON object — no prose, no markdown fences.',
    '',
    'Required keys: endState, conditions, intent, context, warpPrimitives, axioms, tools, compartmentUuid, fileDirectory, fileName.',
    'A key you cannot determine from the artifact must be null — never invent a value.',
    '',
    `Artifact provider: ${provenance.provider || 'unknown'}`,
    `Artifact filename: ${provenance.filename || 'unknown'}`,
    `Artifact summary: ${s.files || 0} file(s) — ${s.create || 0} new, ${s.overwrite || 0} would overwrite, ${s.identical || 0} identical, ${s.unplaced || 0} unplaced, ${s.archives || 0} archive(s) staged whole`,
    'Artifact real file content (up to 5 files shown):',
    _readRealFileContent(drop),
  ].join('\n');
}

function _parseSynthesizedContract(text) {
  if (!text || typeof text !== 'string') return null;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_) {
    return null;
  }
}

/**
 * _dispatchAndSubmit(prompt, opts) — the real, shared core both
 * officiate() (artifact-triggered) and synthesizeFromContext() (tool-
 * triggered, arbitrary text) use — one real dispatch/parse/submit path,
 * not two near-duplicate ones that could drift.
 */
// §MERGED 2026-09-02 — a parallel session independently built the same
// real refactor (shared hat-check -> dispatch -> parse core) with one
// real improvement over this session's own first draft: synthesis and
// submission are separable (submit:true/false), so an agent can preview
// what a piece of context synthesizes to without committing a real
// contract. Adopted as the final version; officiate()'s own real
// persisted-dedup (markOfficiated(), this session's own earlier fix)
// moved to sit around the shared core rather than inside it, since
// that's specific to the artifact-triggered path, not synthesis itself.
// §0.39.282 — who synthesizes is RAID's decision, not a literal. It was 'claude' in five places: with Claude not
// connected, every staged drop failed ("no real agent response (forAgent=claude)", James's live log, every 20 s).
// decideForContract ranks only agents RAID's health says are available; an explicit opts.forAgent still wins.
function _agentFor(opts = {}, what = 'synthesize a contract from a staged artifact') {
  if (opts.forAgent) return opts.forAgent;
  try { const d = require('./index.js').decideForContract({ intention: what }); return (d && d.agent) || null; } catch (_) { return null; }
}

async function _synthesizeCore(prompt, opts = {}) {
  if (!opts.forAgent) { try { await require('./index.js').ready(); } catch (_) {} }   // §0.60.3 — health read in this process before RAID decides
  // §RT1 0.60.78 — RAID's ranked candidates, best first (an explicit forAgent: only that one)
  let candidates = [], cluster = null;
  if (opts.forAgent) candidates = [opts.forAgent];
  else {
    try { const d = require('./index.js').decideForContract({ intention: 'synthesize a contract from a staged artifact' }); cluster = d && d.cluster;
      candidates = [...new Set([d && d.agent, ...((d && d.candidates) || []).map(c => c.name)].filter(Boolean))].slice(0, MAX_AGENTS); } catch (_) { candidates = []; }
  }
  const forAgent = candidates[0] || null;
  if (!forAgent) return { ok: false, cls: 'agent', reason: 'RAID found no available agent to synthesize with' };
  const hat = hatForge.get('the_officiator');
  if (!hat) {
    return { ok: false, reason: 'the_officiator hat is not seeded — run lib/hat-seed.js\'s seedHats() first' };
  }
  const { dispatchToNcpAgent } = require('../../../copilot/lifeline.js');
  // §WB2 0.60.73 — WARP around the agent RAID chose (James: "Option 1"): an identical prompt retained 3 times is served
  // from WARP's cache; a reply that does not parse as a contract fails the hard axiom, so it is never retained or served.
  const parses = [{ id: 'parses-as-contract', severity: 'hard', check: (e) => !!_parseSynthesizedContract(e.data.output) }];
  const learn = (agent, ok) => { if (opts.forAgent) return; try { require('./index.js').recordOutcome(agent, cluster, ok); } catch (_) { /* learning never stops synthesis */ } };
  const tried = [];
  for (const agent of candidates) {
    const result = await require('../../../lib/warp-rung.js').wrap(() => dispatchToNcpAgent(prompt, { provider: agent }), { kind: 'officiator-synthesis', provider: agent, key: prompt, mode: 'cache', axioms: parses, fresh: !!opts.fresh });
    const unparsed = (result && result.warp && result.warp.source === 'rejected') || (result && result.ok && !_parseSynthesizedContract(result.text));
    if (unparsed) {
      // it answered, and the answer is no contract: the capability class — RAID learns, the next agent is tried
      tried.push({ agent, cls: 'content', why: `the_officiator's real response could not be parsed as a real contract JSON object: ${(result.text || '').slice(0, 200)}` });
      learn(agent, false);
      continue;
    }
    if (!result || !result.ok) {
      // it did not answer: transient — nothing is learned (GT1), the next agent is tried
      tried.push({ agent, cls: 'agent', why: `no real agent response (forAgent=${agent}) — guardian unreachable or an empty response` });
      continue;
    }
    learn(agent, true);
    return { ok: true, synthesized: _parseSynthesizedContract(result.text), agent, tried };
  }
  // every candidate failed: the drop's failure only if some agent answered (with no contract); else the agents' failure
  const content = tried.find(x => x.cls === 'content');
  const reason = content ? content.why : `no real agent response (tried ${tried.map(x => x.agent).join(', ')}) — guardian unreachable or an empty response`;
  return { ok: false, cls: content ? 'content' : 'agent', reason, tried };
}

/**
 * synthesizeFromContext(contextText, opts) — James: "each build contract
 * needs the file name for the artifact, primitives for the build,
 * compartment uuid, and synthesized context with a synthesis tool that
 * the agents can use for context." officiate() only ever ran from the
 * intake-drop tick loop — no agent could call synthesis directly to get
 * grounded context for its OWN reasoning. This is that direct path: same
 * real hat, same real B1 schema (fileName, warpPrimitives,
 * compartmentUuid, context, ...), but takes plain text instead of a
 * staged intake drop, and does NOT submit a contract by default — an
 * agent asking "what does this context synthesize to" is not the same
 * act as officiate()'s "turn this staged artifact into a queued build
 * contract." Pass submit:true to also queue it as a real contract via
 * the same submitContract() path officiate() uses.
 */
async function synthesizeFromContext(contextText, opts = {}) {
  if (!contextText || typeof contextText !== 'string') {
    return { ok: false, reason: 'contextText is required and must be a string' };
  }
  const prompt = [
    'Synthesize ONE real build contract from the context below.',
    'Output ONLY a single JSON object — no prose, no markdown fences.',
    '',
    'Required keys: endState, conditions, intent, context, warpPrimitives, axioms, tools, compartmentUuid, fileDirectory, fileName.',
    'A key you cannot determine from the context must be null — never invent a value.',
    '',
    'Context:',
    contextText,
  ].join('\n');

  const core = await _synthesizeCore(prompt, opts);
  if (!core.ok) return core;
  const synthesized = core.synthesized;

  if (!opts.submit) {
    return { ok: true, synthesized };
  }

  const { queueId } = submitContract(
    {
      // §BUGFIX 2026-09-03 — found while investigating "RAID keeps
      // failing contracts": contract-intake.js's DEFAULT checkEndState
      // (the one actually used here — no checkEndState function is
      // passed in opts below) requires a literal "SEAM VERDICT: PASS|
      // FAIL" somewhere in the agent's response, per contract-intake.js
      // itself. Every contract submitted from THIS function only ever
      // sent synthesized.context (a free-form description) as content —
      // never an instruction to report a verdict in that format. An
      // agent doing genuinely correct work here still had no reason to
      // say those words, so the default check reported FAIL every time,
      // regardless of real outcome. self-heal's own _enterFailureMode
      // already does this correctly (see cortex/self-heal/index.js) —
      // reusing that exact real convention here, not inventing a new one.
      content: (synthesized.context || contextText.slice(0, 200))
        + `\n\nWhen finished, verify your work against the real end-state above (not a guess), then report exactly "SEAM VERDICT: PASS" if it genuinely holds, or "SEAM VERDICT: FAIL" with what's still wrong if it doesn't.`,
      title: synthesized.fileName || null,
      forAgent: opts.dispatchTo || _agentFor(opts),
      endState: synthesized.endState ?? null,
      conditions: synthesized.conditions ?? null,
      warpPrimitives: synthesized.warpPrimitives ?? null,
      axioms: synthesized.axioms ?? null,
      compartmentUuid: synthesized.compartmentUuid ?? null,
      fileDirectory: synthesized.fileDirectory ?? null,
      fileName: synthesized.fileName ?? null,
    },
    {
      source: 'officiator-synthesis-tool',
      intention: synthesized.intent || 'build',
      forAgent: opts.dispatchTo || _agentFor(opts),
      sourceDropId: null,
    },
  );
  return { ok: true, queueId, synthesized };
}

async function officiate(drop, opts = {}) {
  if (!opts.forAgent) { try { await require('./index.js').ready(); } catch (_) {} }   // §0.60.3
  // §RT1 0.60.78 — RAID's candidates are walked inside the core; only a caller's own forAgent pins one
  const core = await _synthesizeCore(_buildSynthesisPrompt(drop), opts);
  if (!core.ok) return core;
  const forAgent = opts.forAgent || core.agent || null;
  const synthesized = core.synthesized;

  // SD20 0.60.203 — the same goal is never queued twice while one is waiting, running, or just failed
  const prior = sameGoal(synthesized.intent || 'build', { fileDirectory: synthesized.fileDirectory, fileName: synthesized.fileName });
  if (prior) {
    try { intake.markOfficiated(drop.dropId, { queueId: prior.uuid, duplicateOf: prior.uuid }); } catch (_) {}
    return { ok: true, duplicate: true, queueId: prior.uuid, status: prior.status, synthesized };
  }
  const s = drop.summary || {};
  const { queueId } = submitContract(
    {
      // §BUGFIX 2026-09-03 — same real fix as synthesizeFromContext
      // above, same root cause: this path (the automatic drop->contract
      // pipeline, the one officiator.js's own header says runs every
      // 20s against staged artifacts) had the identical gap.
      content: (synthesized.context || `Artifact with ${s.files || 0} file(s) from ${(drop.provenance && drop.provenance.provider) || 'unknown'}`)
        + `\n\nWhen finished, verify your work against the real end-state above (not a guess), then report exactly "SEAM VERDICT: PASS" if it genuinely holds, or "SEAM VERDICT: FAIL" with what's still wrong if it doesn't.`,
      title: synthesized.fileName || null,
      forAgent: opts.dispatchTo || forAgent,
      endState: synthesized.endState ?? null,
      conditions: synthesized.conditions ?? null,
      warpPrimitives: synthesized.warpPrimitives ?? null,
      axioms: synthesized.axioms ?? null,
      compartmentUuid: synthesized.compartmentUuid ?? null,
      fileDirectory: synthesized.fileDirectory ?? null,
      fileName: synthesized.fileName ?? null,
    },
    {
      source: 'officiator',
      intention: synthesized.intent || 'build',
      forAgent: opts.dispatchTo || forAgent,
      sourceDropId: drop.dropId || drop.id || null,
    },
  );

  // §PERSISTED DEDUP 2026-09-02 — real, physical marker on the drop
  // itself (lib/intake.js's own markOfficiated()), not just this
  // process's in-memory _seen set. A failure here is logged, not
  // fatal — the contract is already real and queued; a drop that
  // somehow gets re-scanned and re-officiated after this is a real,
  // rare, honest edge case (two contracts for one artifact), not a
  // silent double-submit this module pretends can't happen.
  try {
    const markResult = intake.markOfficiated(drop.dropId, { queueId });
    if (!markResult.ok) console.warn(`[${MODULE_ID}] could not mark drop ${drop.dropId} as officiated (non-fatal, contract ${queueId} already exists): ${markResult.reason}`);
  } catch (e) {
    console.warn(`[${MODULE_ID}] markOfficiated threw (non-fatal): ${e.message}`);
  }

  return { ok: true, queueId, synthesized };
}

async function tick() {
  if (_running) return { skipped: true, reason: 'previous tick still in flight' };
  // §0.60.123 MP — synthesis asks an agent: it waits while memory is not ok, or after a crisis without headroom
  if (!process.env.NEXUS_TEST_SANDBOX) {
    const h = require('../../../lib/prevention.js').heavyAllowedHere('officiator');
    if (!h.ok) { if (!_heldSaid) { _heldSaid = true; console.log(`[${MODULE_ID}] waiting — ${h.why}`); } return { skipped: true, reason: h.why }; }
    _heldSaid = false;
  }
  _running = true;
  try {
    const drops = intake.list().filter(d => d.state === intake.STATE.STAGED && !d.officiated);
    const attempts = _readAttempts();
    let synthesized = 0, failed = 0, waiting = 0, parked = 0, released = 0;
    // §RT1 — records written before 0.60.78 charged an agent's silence to the drop: released (said), they were never the drop's
    for (const [k, r] of Object.entries(attempts)) if (k !== AGENTS_KEY && k !== STREAK_KEY && r && AGENT_FAILURE.test(r.reason || '') && r.cls !== 'content') { delete attempts[k]; released++; }
    if (released) { _writeAttempts(attempts); console.log(`[${MODULE_ID}] released ${released} drop(s) parked or waiting only because no agent answered — they are tried again`); }
    // §RT1 — the agents' own wait: when none answered, nobody is asked again before it passes
    const ag = attempts[AGENTS_KEY];
    if (ag && ag.until && Date.now() < ag.until) return { ok: true, checked: drops.length, synthesized, failed, waiting: drops.length, parked, released, agentsWait: { until: ag.until, reason: ag.reason } };
    // SD20 0.60.203 — its own contracts keep failing: no more model calls until the window passes (said once per streak)
    const st = drops.length ? failStreak(_officiatorRows(), { clearedAt: attempts[STREAK_KEY] || 0 }) : { held: false };
    if (st.held) {
      if (_streakSaid !== st.until) { _streakSaid = st.until; console.warn(`[${MODULE_ID}] holding — its last ${st.n} contracts all failed or were blocked (latest ${st.last.queueId.slice(0, 8)}: ${st.last.status}${st.last.reason ? ` — ${String(st.last.reason).slice(0, 160)}` : ''}); ${drops.length} drop(s) wait until ${new Date(st.until).toISOString()}, or \`idearium raid unpark all\``); }
      return { ok: true, checked: drops.length, synthesized, failed, waiting: drops.length, parked, released, failStreak: st };
    }
    for (const drop of drops) {
      const id = drop.dropId || drop.id;
      if (!id || _seen.has(id)) continue;
      // SD20 0.60.203 — memory is read before each synthesis, not only at the tick's start (one drop can take minutes)
      if (!process.env.NEXUS_TEST_SANDBOX) { const h = require('../../../lib/prevention.js').heavyAllowedHere('officiator'); if (!h.ok) { console.log(`[${MODULE_ID}] waiting — ${h.why}`); break; } }
      const rec = attempts[id];
      if (!due(rec)) { if (rec.n >= MAX_ATTEMPTS) parked++; else waiting++; continue; }
      if (rec && rec.n >= MAX_ATTEMPTS) console.log(`[${MODULE_ID}] parked drop ${id.slice(0, 8)}: its daily try (${rec.reason || 'no reason kept'})`);
      const result = await officiate(drop);
      if (result.ok && result.duplicate) {
        _seen.add(id);
        console.log(`[${MODULE_ID}] drop ${id.slice(0, 8)} repeats the goal of contract ${String(result.queueId).slice(0, 8)} (${result.status}) — marked, not queued again`);
        continue;
      }
      if (result.ok) {
        _seen.add(id); synthesized++;
        if (rec || attempts[AGENTS_KEY]) { delete attempts[id]; delete attempts[AGENTS_KEY]; _writeAttempts(attempts); }
        console.log(`[${MODULE_ID}] synthesized contract ${result.queueId?.slice(0, 8)} from drop ${id.slice(0, 8)}`);
        continue;
      }
      failed++;
      // §RT1 — no agent answered (or none is available): not this drop's failure. No attempt is spent; the agents wait,
      // doubling from AGENT_BACKOFF_MS up to an hour, and every drop waits with them (they would go to the same agents)
      if (result.cls === 'agent' || (!result.cls && AGENT_FAILURE.test(result.reason || ''))) {
        const k = ((attempts[AGENTS_KEY] && attempts[AGENTS_KEY].k) || 0) + 1;
        const waitMs = Math.min(AGENT_BACKOFF_MS * 2 ** (k - 1), 3600 * 1000);
        attempts[AGENTS_KEY] = { k, until: Date.now() + waitMs, reason: String(result.reason || '').slice(0, 200), tried: (result.tried || []).map(x => x.agent) };
        _writeAttempts(attempts);
        console.warn(`[${MODULE_ID}] no agent answered (${(result.tried || []).map(x => x.agent).join(', ') || 'none available'}); ${drops.length} drop(s) wait ${Math.round(waitMs / 60000)} min — no drop is charged`);
        break;
      }
      const n = ((rec && rec.n) || 0) + 1;
      attempts[id] = { n, at: Date.now(), cls: 'content', reason: String(result.reason || '').slice(0, 200), tried: (result.tried || []).map(x => x.agent) };
      _writeAttempts(attempts);
      if (n >= MAX_ATTEMPTS) console.warn(`[${MODULE_ID}] drop ${id.slice(0, 8)} parked after ${n} failed tries (${result.reason}); tried again daily, or now with \`idearium raid unpark ${id.slice(0, 8)}\``);
      else console.warn(`[${MODULE_ID}] synthesis failed for drop ${id.slice(0, 8)} (try ${n}/${MAX_ATTEMPTS}, next in ${Math.round(Math.min(BACKOFF_MS * 2 ** (n - 1), 864e5) / 60000)} min): ${result.reason}`);
    }
    return { ok: true, checked: drops.length, synthesized, failed, waiting, parked, released };
  } catch (e) {
    console.warn(`[${MODULE_ID}] tick failed, will retry next interval: ${e.message}`);
    return { ok: false, error: e.message };
  } finally {
    _running = false;
  }
}

function start(opts = {}) {
  if (_timer) return;
  const intervalMs = opts.intervalMs || INTERVAL_MS;
  _timer = setInterval(tick, intervalMs);
  if (_timer.unref) _timer.unref();
  console.log(`[${MODULE_ID}] v${VERSION} — listening for staged artifacts every ${intervalMs}ms`);
}

/** parked() → { drops: [{ id, n, parked, at, reason, tried, nextTry }], agents: the agents' wait or null } — what waits, and why */
function parked() {
  const a = _readAttempts();
  const drops = Object.entries(a).filter(([k]) => k !== AGENTS_KEY && k !== STREAK_KEY).map(([id, r]) => ({ id, n: r.n || 0, parked: (r.n || 0) >= MAX_ATTEMPTS, at: r.at || null,
    reason: r.reason || null, tried: r.tried || [], nextTry: (r.at || 0) + ((r.n || 0) >= MAX_ATTEMPTS ? PARKED_RETRY_MS : Math.min(BACKOFF_MS * 2 ** Math.max(0, (r.n || 1) - 1), 864e5)) }));
  const ag = a[AGENTS_KEY];
  const st = failStreak(_officiatorRows(), { clearedAt: a[STREAK_KEY] || 0 });
  return { file: _attemptsFile(), maxAttempts: MAX_ATTEMPTS, drops, agents: ag && ag.until && ag.until > Date.now() ? ag : null, failStreak: st.held ? st : null };
}

/** unpark(id | 'all') → { cleared: [...] } — a person or agent clears what waits; no hand edit of the attempts file */
function unpark(which = 'all') {
  const a = _readAttempts(); const cleared = [];
  for (const k of Object.keys(a)) {
    if (k === STREAK_KEY) continue;
    if (which === 'all' || k === which || (k !== AGENTS_KEY && which && k.startsWith(which))) { delete a[k]; cleared.push(k); _seen.delete(k); }
  }
  if (which === 'all') { a[STREAK_KEY] = Date.now(); cleared.push('fail streak'); _streakSaid = null; }   // SD20 — the streak counts only contracts after this
  _writeAttempts(a);
  return { cleared };
}

function stop() {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

module.exports = { start, stop, tick, officiate, synthesizeFromContext, due, parked, unpark, goalKey, sameGoal, failStreak, MAX_ATTEMPTS, FAIL_STREAK, GOAL_WINDOW_MS, AGENTS_KEY, MODULE_ID, VERSION };
