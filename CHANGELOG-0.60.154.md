# 0.60.154 — 2026-10-18

James: "it needs to be non linear and agnostic" · then "look at siso"

What he was looking at: the gate-memory map (`docs/2026-10-18-gate-memory-phasemap.spec`), whose context finder (GM5) was a
ladder: six rungs in a fixed order (exact contract → lattice → crystals → vectors → the agent's tools → a build), each named in
code, with a one-line build order. Mapped, not built: this release changes the map before any code (§3.3).

## The coder's reading, to confirm

- **Non linear:** no fixed order of sources, and no fixed order of building.
- **Agnostic:** the finder knows no store, system or node type by name.
- **Look at siso:** the shape is already his foundation, Event → Gate → Stream (`siso/Stream.js`, `siso/Gate.js`,
  `siso/Event.js`). His precedent for the same words is the pieces map: "It's not linear. Like a torrent downloads."

If he meant something else (agnostic to the model, or to the repo), the addendum is a reading and is kept as one.

## GM5 redesigned on SISO (addendum b)

- **The request is an event.** `context.request { gate, refs, text, need }`. The need is the point, named first. Pieces fill it
  in any order.
- **A source is a gate**, keyed by its own signature, registered as a row in `lib/context-sources.js`:
  `{ signature, system, route, cost, kinds }`. The fulfilled index (GM3), the node lattice (GM4), intuition and crystals,
  vector memory, context-atlas, the contract ledger and the component store each join by a row. Any later store joins the same
  way, and the finder never changes.
- **Fan-out inside SISO's law.** One signature, one gate, and a collision is a hard error. The request gate emits one
  `context.ask.<signature>` per registered source. A source that is asked but absent stays in `pending[]` as residue, and the
  answer says so (§1.2).
- **Every piece carries its provenance:** `{ from, system, kind, id, score, covers, at }`, as references, not copies (GM0c). The
  edge kind (causal, wire, reference, temporal, resembles, exact) travels with the piece. A temporal piece is never read as a
  cause.
- **Inside-out survives as cost, not as order.** Every free source is asked at once. Only the need that no piece covers, the
  residue, is asked of the agent's tools. Only what is still uncovered after that becomes a build. "Build only when necessary"
  becomes something the stream can show.
- **Async sources on a sync core.** A source gate starts its route call and emits its pieces when they arrive, the Runner
  pattern. `sampleHere()` is the cross-section the gate record (GM1) and the panel (GM7) read.

## Kept, and superseded

- GM5's ladder text, its first files and depends_on stay as `*_first_design`.
- GM0d's fixed order is marked `superseded_by`.
- The one-line build order stays as `build_order_first_design` (§0.3).

## The build order, non linear

The build order is now pieces in any order, held back only by a real depends_on. GM5 no longer waits on GM3 or GM4: they are
sources that plug in when they exist.

- **Free now:** GM4 (the node lattice) and GM5 (the stream).
- **GM1** waits on GM0a, his call on "the precommit compartment". GM3 and GM2 follow GM1.
- **GM7** waits on GM1 and GM5. **GM6** waits on GM3 and FMR10. **GM8** waits on GM5 and GM7.

## Decided by his axioms

- The stream is `siso/`, the shared primitive (`lib/system-boundary.js` PRIMITIVES), not Clear Glass's own copy. Requiring
  that copy from lib would be a crossing (SB-06).
- `siso/` is ESM, so `lib/context-stream.js` loads it with `import()`. That reuses it instead of making a third copy (§8.6).

## Proof

`lib/phase-graph.js` was run on every phase after the addendum:

| Phase | Graph |
|---|---|
| GM1 | f401e7c1 |
| GM2 | f34e9e78 |
| GM3 | 8ba6f400 |
| GM4 | 1482ea96 |
| GM5 | 52e0d272, lib only |
| GM6 | 62ad7956 |
| GM7 | e00e370b |
| GM8 | af6848ec |

Every phase is ready, and none shows a new crossing. GM5's planned proof is written in the map:

- three sources answering out of order give the same covered set every time;
- an absent source is listed as residue;
- the model source is asked only the uncovered need;
- a fourth source joins by one table row, with no line of the finder changed.

## Open

- GM0a is his to answer: what "the precommit compartment" is.
- To confirm with him: the reading of "non linear" and "agnostic".
- Not built: GM4 and GM5, which are free to build next.
