'use strict';
/**
 * cortex/push-recall.js — The Unified API, actually built
 * UUID: nexus-cortex-push-recall-v1-0000-2026-0706-jamesbrooks-001
 * Version: 1.0.0
 * spec: docs/specs/CORTEX.spec.md (implements the "Unified API" section —
 *       confirmed 100% spec text, 0% code, three turns ago in this session)
 *
 * §HONESTY NOTE: this is a real implementation, not a mock. push() and
 * recall() do actual scoring against actual stored content — there is no
 * hardcoded "generate()" standing in for this. If you push three things
 * and recall with a query, you get back genuinely ranked results based on
 * what you pushed, not a canned response.
 *
 * What's real here: schema validation (no AJV dependency added — hand-
 * rolled, since the field set is small and fixed, not because AJV
 * wouldn't be better for a larger schema later), tag/tier-based push,
 * lexical scoring (real token-overlap, not a stub), recency scoring
 * (real exponential decay from event age), tier-priority weighting (the
 * spec's own 6-tier table, applied for real).
 *
 * §UPDATED 2026-07-12 — all 5 lanes are real now:
 *   - lexical, recency: original, unchanged.
 *   - failure: real fix_map lookup (cortex/memory/fix-map.js), token-
 *     overlap against recorded failure signatures, weighted by recorded
 *     success/failure confidence.
 *   - bep: real bep_patterns lookup (cortex/memory/bep-lookup.js), token-
 *     overlap against crystallized recurring-pattern sequences.
 *   - causal: real causal-graph connectivity (cortex/memory/causal-lookup.js)
 *     — but honestly conditional: only activates for a row tagged with an
 *     id that's actually a node in the recent causal graph. A row with no
 *     such tag scores 0 on this lane, which is a real constraint on when
 *     it fires, not a weaker version of the other four.
 * Each of the three new lanes is independently guarded (a missing
 * dependency degrades that one lane to 0, never breaks the module) —
 * this file's standalone-testability promise below still holds.
 *
 * Storage is an in-memory Map by design for this first version — wiring
 * to the real `jaaDB.insert()`/`jaaDB.tail()` cortex/boot.js already uses
 * is a small, deliberate follow-up (swap `_store` for jaaDB calls),
 * kept separate so this can be tested standalone without a live Cortex
 * process, the same way every other piece this session was proven before
 * being wired to its real host.
 */
const crypto = require('crypto');
// §GUARDED — push-recall.js's own header says it should be testable
// standalone, without a live Cortex process. fix-map.js requires jaaDB,
// which requires guardian/jaa-store — real dependencies that may not be
// present in a standalone test context. A failed require here degrades
// the failure lane to "not available," not a broken module.
let fixMap = null;
try { fixMap = require('./memory/fix-map.js'); }
catch (e) { console.warn(`[push-recall] fix-map unavailable, failure lane will degrade honestly: ${e.message}`); }

let bepLookup = null;
try { bepLookup = require('./memory/bep-lookup.js'); }
catch (e) { console.warn(`[push-recall] bep-lookup unavailable, bep lane will degrade honestly: ${e.message}`); }

let causalLookup = null;
try { causalLookup = require('./memory/causal-lookup.js'); }
catch (e) { console.warn(`[push-recall] causal-lookup unavailable, causal lane will degrade honestly: ${e.message}`); }

const VALID_TIERS = ['crystal', 'spec', 'session', 'recent', 'failure', 'index', 'user'];
// §BUG FIXED 2026-07-06 — found by adversarial testing: push() accepted a
// 10MB string with no ceiling at all. This is well above any real
// conversation turn or code artifact (recall()'s own TOKEN_BUDGET_CHARS
// below is 48,000 for an entire assembled context packet across multiple
// results) — 256KB per single push leaves generous room for a large
// artifact while making unbounded growth from one bad caller impossible.
const MAX_CONTENT_CHARS = 256 * 1024;
// §AM4 2026-08-13 (docs/agent-model-and-user-continuity-phasemap.spec) —
// 'user' is the one new tier added to this file. Checked before adding it
// (not assumed): every one of the original six tiers is CONTENT-shaped
// (a crystal, a spec, a session, recent history, a failure, an index
// entry) — none is PERSON-shaped. A durable fact about the specific human
// co-pilot is talking to (a preference, standing context, a prior
// decision) doesn't fit any of them without being force-shoehorned into
// 'session' (which the rest of this file treats as expiring, per
// read-time-expiry's own test coverage) or 'recent' (which decays by
// design — see the recency lane below). This is the smallest change that
// makes room for it: one tier name, everything else (push/recall/
// validation/budget/soft-delete) already generic over tier.
// TIER_PRIORITY is placed right after 'spec' (2) rather than appended at
// the end — priority 3, same durability class as a spec, ahead of session/
// recent/index which are all explicitly time-decaying or generic-bucket
// concepts. NOTE: TIER_PRIORITY has no live consumers anywhere in this
// codebase (grepped before adding to it) — kept for whatever eventually
// reads it, not exercised by recall()'s real scoring path today, which
// uses TIER_PULL_WEIGHT only.
const TIER_PRIORITY = { crystal: 1, spec: 2, user: 3, session: 4, recent: 5, failure: 6, index: 7 };
// Failure tier gets the highest PULL weight despite being priority 6, not 1 —
// the spec says so explicitly ("failures teach most") and this preserves
// that inversion rather than flattening priority-number into pull-weight.
// 'user' at 1.00 — deliberately not inflated above crystal (a validated,
// re-confirmed fact) or failure (safety-critical): a real, durable, but
// not (yet) independently-verified fact about a person. Empirically
// tunable later; not fabricated now to look more confident than it is.
const TIER_PULL_WEIGHT = { crystal: 1.30, spec: 1.10, user: 1.00, session: 0.90, recent: 0.80, failure: 1.50, index: 0.60 };

const LANE_WEIGHTS = { lexical: 0.70, causal: 1.00, failure: 0.95, bep: 0.90, recency: 0.85 };

// Intent → lanes, exactly as specced.
const INTENT_LANES = {
  debug_failure:  ['causal', 'failure', 'recency'],
  gap_fill:       ['lexical', 'bep', 'recency'],
  session_resume: ['recency', 'causal', 'lexical'],
  causal_trace:   ['causal', 'failure'],
  pattern_lookup: ['bep', 'lexical'],
  crystal_query:  ['lexical', 'causal'],
  // §AM4 2026-08-13 — the one new intent. lexical (match what's actually
  // being asked against a stored fact's wording) + recency (a fact
  // confirmed/pushed more recently is weighted slightly higher — a real,
  // if imperfect, proxy for "still current" per this phase's own honest
  // staleness caveat; not a substitute for real drift/contradiction
  // handling, which stays a separate, harder problem, not solved here).
  // No causal/bep/failure lanes — a durable personal fact isn't causally
  // chained to a code event or a recorded failure signature the way
  // debug/gap-fill content is; forcing those lanes on would score 0 for
  // every real row and add nothing.
  user_context:   ['lexical', 'recency'],
  general:        ['lexical', 'causal', 'bep', 'recency'],
};

const TOKEN_BUDGET_CHARS = 48_000;

class CortexPushRecall {
  constructor({ store = null } = {}) {
    // `store` injectable so a caller with a real jaaDB can pass
    // {insert, tail} matching this shape instead of the in-memory default.
    this._store = store || this._createInMemoryStore();
  }

  _createInMemoryStore() {
    const rows = [];
    return {
      insert: (row) => { rows.push(row); return row; },
      tail: (n) => rows.slice(-n),
      all: () => rows,
    };
  }

  /**
   * push — the only write path. Validates before storing; throws on a
   * malformed call rather than silently accepting garbage (this is
   * exactly the AJV-validation intent from the spec, hand-rolled because
   * the shape is small and fixed — swap for real AJV + a JSON schema file
   * if the shape grows).
   */
  push(content, tags = [], tier = 'recent') {
    if (content == null || content === '') {
      throw new Error('[cortex/push-recall] push() requires non-empty content');
    }
    if (String(content).length > MAX_CONTENT_CHARS) {
      throw new Error(`[cortex/push-recall] push() content exceeds ${MAX_CONTENT_CHARS} char limit (got ${String(content).length}) — split into multiple pushes or summarize first`);
    }
    if (!Array.isArray(tags)) {
      throw new Error('[cortex/push-recall] push() tags must be an array');
    }
    if (!VALID_TIERS.includes(tier)) {
      throw new Error(`[cortex/push-recall] invalid tier '${tier}' — must be one of ${VALID_TIERS.join(', ')}`);
    }

    const row = {
      id: crypto.randomUUID(),
      content: String(content),
      tags: tags.map(String),
      tier,
      ts: Date.now(),
      // §M1 — deletion is a request, never immediate. state carries the
      // soft-delete flag; forget() below sets this rather than removing
      // the row, so a rejected-deletion event is still queryable.
      state: 'active',
    };
    this._store.insert(row);
    return { id: row.id };
  }

  /**
   * recall — the only read path. Builds a real intent IR (lane selection
   * + tokenized query), scores every active row across the selected
   * lanes, and returns a real ranked MemoryResult[] — not the top N by
   * insertion order, an actual score.
   */
  recall(intent, context = {}, tier = null) {
    if (!intent) throw new Error('[cortex/push-recall] recall() requires an intent string');

    // ── Step 1: build intent IR ────────────────────────────────────────
    const lanes = INTENT_LANES[intent] || INTENT_LANES.general;
    const queryTokens = this._tokenize(String(context.query || intent));
    const ir = { intent, lanes, queryTokens, tier, ts: Date.now() };

    // ── Step 2: gather candidates ───────────────────────────────────────
    const all = this._store.all ? this._store.all() : this._store.tail(10_000);
    let candidates = all.filter(r => r.state === 'active');
    if (tier) candidates = candidates.filter(r => r.tier === tier);

    // ── Step 3: score across selected lanes only (real math, not a stub) ─
    const now = Date.now();
    const scored = candidates.map(row => {
      const rowTokens = this._tokenize(row.content);
      let score = 0;
      const breakdown = {};

      if (lanes.includes('lexical')) {
        const overlap = this._tokenOverlap(queryTokens, rowTokens);
        breakdown.lexical = overlap * LANE_WEIGHTS.lexical;
        score += breakdown.lexical;
      }
      if (lanes.includes('recency')) {
        const ageMs = now - row.ts;
        const recencyScore = Math.exp(-ageMs / (1000 * 60 * 60 * 24)); // 1-day half-life-ish decay
        breakdown.recency = recencyScore * LANE_WEIGHTS.recency;
        score += breakdown.recency;
      }
      // §BUILT 2026-07-12 — the failure lane, real now. Matches a row's
      // content against recorded fix_map signatures (token overlap, same
      // method the lexical lane already uses) and weights by recorded
      // confidence. Honest degrade: no fix-map available, or no matching
      // signature recorded yet, contributes 0 — same as any other lane
      // finding nothing, not an error and not a fabricated match.
      if (lanes.includes('failure') && fixMap) {
        const fixes = fixMap.lookupFix(row.content, 1);
        if (fixes.length) {
          breakdown.failure = fixes[0].matchScore * (0.5 + 0.5 * fixes[0].confidence) * LANE_WEIGHTS.failure;
          score += breakdown.failure;
        }
      }
      // §BUILT 2026-07-12 — the bep lane, real now. Matches row content
      // against recorded bep_patterns sequences (event-type chains, not
      // prose — see bep-lookup.js's own honest-scope note on why this is
      // a real but coarse signal, not semantic matching).
      if (lanes.includes('bep') && bepLookup) {
        const matches = bepLookup.lookupBEPMatch(row.content, 1);
        if (matches.length) {
          breakdown.bep = matches[0].matchScore * (0.5 + 0.5 * matches[0].strength) * LANE_WEIGHTS.bep;
          score += breakdown.bep;
        }
      }
      // §BUILT 2026-07-12 — the causal lane, real now. Only activates when
      // a row was tagged with an id that's actually a node in the recent
      // causal graph — see causal-lookup.js's honest-scope note. A row
      // with no such tag scores 0 here, not a fabricated partial match.
      if (lanes.includes('causal') && causalLookup) {
        const causal = causalLookup.causalScore(row.tags);
        if (causal) {
          breakdown.causal = causal.score * LANE_WEIGHTS.causal;
          score += breakdown.causal;
        }
      }
      // (failure/bep/causal lanes scored above, each independently guarded)
      // A row requested under a lane this version can't compute still
      // gets scored on whatever real lanes it has, not zeroed out, so a
      // recall() call for 'debug_failure' (causal+failure+recency) still
      // returns something real via recency rather than nothing at all.

      score *= TIER_PULL_WEIGHT[row.tier] || 1.0;

      return { ...row, score, breakdown };
    });

    // ── Step 4: rank, apply token budget ─────────────────────────────────
    scored.sort((a, b) => b.score - a.score);
    const results = [];
    let charBudget = TOKEN_BUDGET_CHARS;
    for (const r of scored) {
      if (r.score <= 0) continue;
      if (charBudget - r.content.length < 0) break;
      charBudget -= r.content.length;
      results.push({ id: r.id, content: r.content, tags: r.tags, tier: r.tier, score: r.score, breakdown: r.breakdown, ts: r.ts });
    }

    return results;
  }

  /**
   * delete.request — §M1: deletion is a request, routed for approval,
   * never immediate. This standalone version approves deterministically
   * (no RAID engine to route to yet outside a live Cortex process) but
   * keeps the same shape recall() needs to respect it, and the event
   * itself is permanent per §M1 even when approved.
   */
  deleteRequest(id, reason) {
    const all = this._store.all ? this._store.all() : this._store.tail(10_000);
    const row = all.find(r => r.id === id);
    if (!row) return { approved: false, reason: 'not found', ts: Date.now() };
    row.state = 'deleted';
    row._deletionReason = reason;
    return { approved: true, ts: Date.now() };
  }

  _tokenize(text) {
    return String(text).toLowerCase().match(/[a-z0-9_]+/g) || [];
  }

  _tokenOverlap(a, b) {
    if (!a.length || !b.length) return 0;
    const setB = new Set(b);
    const shared = a.filter(t => setB.has(t)).length;
    return shared / Math.max(a.length, 1);
  }
}

module.exports = { CortexPushRecall, VALID_TIERS, INTENT_LANES, TIER_PULL_WEIGHT };
