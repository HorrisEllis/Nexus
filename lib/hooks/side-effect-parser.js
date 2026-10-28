'use strict';
/**
 * hooks/side-effect-parser.js — structured reading of contract.sideEffects
 * UUID: nexus-hooks-side-effect-parser-v1-0000-2026-0713-jamesbrooks-001
 * Version: 1.0.0
 *
 * §BUILT 2026-07-13 — identified several turns back as the load-bearing
 * fix: `contract.sideEffects` across all 10 `hooks/*.hooks.js` files is
 * free-text prose (`'jaa.insert("ideas")'`, `'emit idearium.idea.created'`).
 * A person reads that fine. Nothing else can act on it — impact
 * propagation, automated wire re-verification, anything resembling
 * self-awareness of consequences all need a structured edge, not a
 * sentence describing one.
 *
 * §WHY A PARSER, NOT A REWRITE — 3552 lines across 10 files, 57 distinct
 * real strings once file-reference noise is excluded (checked directly,
 * not estimated). Hand-annotating that much by inference risks
 * mis-categorizing effects that are already correctly described in prose.
 * A parser is testable against every real string that exists today, and
 * automatically covers new hooks written in the same idioms — a one-time
 * rewrite doesn't. Nothing in hooks/*.hooks.js is touched; this reads
 * the existing sideEffects arrays as-is.
 *
 * §HONEST SCOPE — three categories, not an attempt at full semantic
 * understanding:
 *   writes — a jaa.insert/update/delete("table", ...) — this hook
 *            persists something, and to where.
 *   emits  — an emit/bus.emit/_toSystem/wires_to/"X broadcast Y" —
 *            this hook produces an event, and (when named) which one.
 *   calls  — everything else, kept as the original string, verbatim.
 *            Not mis-sorted into writes/emits by guessing; a real
 *            catch-all, honestly labeled as unclassified rather than
 *            forced into a category that implies more understanding
 *            than exists.
 *
 * Tested against every one of the 57 real strings in the current tree,
 * not synthetic examples — see test/hooks-side-effect-parser.test.js.
 */

// jaa.insert("table", ...) / jaa.update("table", ...) / jaa.delete("table", ...)
// — quoted table name, the common case.
const RE_JAA_QUOTED = /^jaa\.(insert|update|delete)\(\s*["']([^"']+)["']/;
// jaa.insert(event_log) — bare identifier, no quotes (found in the real
// inventory — an inconsistency in the source hooks, not invented here).
const RE_JAA_BARE = /^jaa\.(insert|update|delete)\(\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*[,)]/;

// emit X.Y.Z — bare, space-separated (no parens).
const RE_EMIT_BARE = /^emit\s+([a-zA-Z0-9_.]+)/;
// bus.emit("X.Y.Z") / copilot._stream.push not matched here (push isn't
// named "emit" — correctly falls to calls, it's a queue op, not an event).
const RE_EMIT_CALL = /^(?:bus\.emit|[a-zA-Z_]+\.emit)\(\s*["']([^"']+)["']/;
// _toCortex("X.Y.Z") / _toBridge("X.Y.Z") — cross-system send, quoted literal only.
// _toCortex(event) (a variable, not a literal) correctly falls to calls —
// the event NAME isn't known statically from the string alone, and
// guessing one would be exactly the kind of fabrication this parser
// exists to avoid.
const RE_TO_SYSTEM = /^_to[A-Z][a-zA-Z]*\(\s*["']([^"']+)["']\s*\)$/;
// wires_to: X.Y.Z — explicit connection marker already used in several hooks.
const RE_WIRES_TO = /^wires_to:\s*([a-zA-Z0-9_.]+)/;
// "X broadcast Y.Z" — the one observed free-text broadcast phrasing.
const RE_BROADCAST = /^\S+\s+broadcast\s+([a-zA-Z0-9_.]+)/;

function parseSideEffect(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const s = raw.trim();

  let m = s.match(RE_JAA_QUOTED);
  if (m) return { kind: 'writes', target: `jaa:${m[2]}`, raw: s };
  m = s.match(RE_JAA_BARE);
  if (m) return { kind: 'writes', target: `jaa:${m[2]}`, raw: s };

  m = s.match(RE_EMIT_BARE);
  if (m) return { kind: 'emits', target: m[1], raw: s };
  m = s.match(RE_EMIT_CALL);
  if (m) return { kind: 'emits', target: m[1], raw: s };
  m = s.match(RE_TO_SYSTEM);
  if (m) return { kind: 'emits', target: m[1], raw: s };
  m = s.match(RE_WIRES_TO);
  if (m) return { kind: 'emits', target: m[1], raw: s };
  m = s.match(RE_BROADCAST);
  if (m) return { kind: 'emits', target: m[1], raw: s };

  // Honest catch-all — not a failure, a real category. Most of what lands
  // here is either a local mutation (`_activeQueues.set(...)`), a call to
  // another module's method (`sigma.record()`), or genuinely free-text
  // description (`'spawns child processes'`) — real information, just not
  // reducible to a table write or a named event without guessing.
  return { kind: 'calls', target: null, raw: s };
}

/**
 * structuredSideEffects(hook) — the real entry point. Takes a hook object
 * (as declared in any hooks/*.hooks.js file) and returns
 * { writes: [...], emits: [...], calls: [...] } — three arrays of the
 * `target` values (writes/emits) or raw strings (calls), deduplicated.
 * A hook with no contract.sideEffects returns all-empty arrays, not null —
 * "no side effects" is a real, valid, common answer (most SNR/read-only
 * hooks in the real inventory have sideEffects: []).
 */
function structuredSideEffects(hook) {
  const raw = hook?.contract?.sideEffects;
  const out = { writes: [], emits: [], calls: [] };
  if (!Array.isArray(raw)) return out;

  for (const entry of raw) {
    const parsed = parseSideEffect(entry);
    if (!parsed) continue;
    if (parsed.kind === 'calls') {
      out.calls.push(parsed.raw);
    } else {
      out[parsed.kind].push(parsed.target);
    }
  }
  out.writes = [...new Set(out.writes)];
  out.emits  = [...new Set(out.emits)];
  out.calls  = [...new Set(out.calls)];
  return out;
}

module.exports = { parseSideEffect, structuredSideEffects };
