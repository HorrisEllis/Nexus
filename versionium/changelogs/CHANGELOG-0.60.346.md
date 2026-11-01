# 0.60.346 — CI6: friction and tension are Intelligence's

James, 2026-11-01: "Working, but it lives outside Intelligence, and Intelligence's atlas still marks Loom's friction source as unconfirmed. move that
to the intelligence system.."

## Found
- **Where Loom's numbers came from.** Loom's /api/friction and /api/tension were the Diagnostic kernel's per-system monitors: friction = failed ÷
  total; tension = friction × open gaps × slope.
- **Two meanings of one word.** CFR, inside Intelligence, had a second meaning of friction in its field.

## Changed
- **Intelligence owns the meaning.** It now serves GET /api/intelligence/friction and /api/intelligence/tension:
  - Diagnostic's measurement, asked through its door, beside CFR's field friction;
  - each part naming its source;
  - a silent source said, never 0.
- **Diagnostic still measures.**
- **Loom keeps its two routes and their shape.** They ask Intelligence first. With Intelligence down, they answer from Diagnostic and say so
  (`via`), so one system down breaks no other.
- **Intelligence's atlas** records the confirmed source and the move.

## Proof
- tests/modules/test-friction-home.test.js 3/3, with a stand-in Diagnostic, up and down.
- loom/test/friction-proxy.test.js 3/3. T-002 had been failing on main (a cached config); it is fixed here. T-003 is new: Intelligence first.

## Specced the same day (no code)
docs/outperform.spec and its map OP1–OP11: the arena, measuring whether Nexus outperforms a frontier model alone. Its dependency graph is
docs/2026-11-01-outperform-dag.svg.
