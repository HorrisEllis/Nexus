# 0.54.1 — 2026-10-09

James: "okay go ahead."

## The path, phase by phase

Every map on the path was triaged one phase at a time. Each phase was checked against the code and the version history, then:
- kept on the path,
- sent to the shelf,
- folded into the phase it duplicates, or
- marked done where it had already been built.

Every answered phase keeps its old status as `status_before`, so nothing is lost and any answer can be reversed.

**Found already built but never marked:**
- **All 12 of idearium-one-surface's phases** shipped in 0.47.0–0.48.0. Two of them (OS4, OS7) were replaced in 0.48.0 by OS8 and OS9, so they are marked superseded.
- **HG6** shipped in 0.53.0.
- **AT2:** `architecture-spec/registry/edit-atlas.js` already does what it asks.

**Folded:** the same phase written in two maps (MCO4, the git work), and AG1 into IN2.

**Retired:** two "release" phases. The release steps are a standing rule in `docs/CLAUDE.md`, not phases.

## Where the roadmap stands

| | Phases |
|---|---|
| Open, on the path | **49** (683 this morning) |
| On the shelf | 585 |
| Closed by the declutter | 48 |

`docs/the-path.md` lists the whole path in order:

| Step | Phases |
|---|---|
| 1 — one engine under every model call | 16 |
| 2 — the loop: idea ⇄ back and forth → spec → phases → build | 21 |
| 3 — Idearium holds the systems | 9 |
| The clean-up, still open | 5 |

Docs only. No code changed.
