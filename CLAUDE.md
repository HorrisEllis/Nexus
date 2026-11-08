# NEXUS — James Brooks's project. The working contract, distilled.

James, 2026-11-08: "Synthesize the Claude.md with the most important parts to save your context window." The full contract is
`docs/CLAUDE.md`: every rule, with his words and dates. It is kept whole (§0.3) and no longer loads by itself. Open the section you need.
The previous root file is `docs/_archive/CLAUDE.root.before-2026-11-08.md`.

## The order (his, 2026-11-08). It supersedes "Emerge first, then Fiverr" (2026-11-06), which is kept in docs/CLAUDE.md
"Automation needs done, orchastrator as the engine, which need to be cos now. Then emerge needs to get done. Than warp 2 with the constraint
relational field" · "This will be huge. It’s all heading towards something massive. Ripples, waves, tidal waves of change if I can help it."
1. **Automation, with COS as the engine.** The automation engine was moved to the Orchestrator (docs/2026-10-25-automation-engine-to-orchestrator-
   phasemap.spec). It now goes to COS. Then the pipeline canvas: docs/2026-11-08-pipeline-canvas-phasemap.spec, its `handoff_2026_11_08` (PC2,
   PC3, PC5, then the canvas preview shown to him).
2. **Emerge done:** the JavaScript removed (docs/2026-11-06-cie-eg-build-phasemap.spec; next CIE8 slice c).
3. **WARP 2 and the constraint relational field** (EM2, RF1, CF1; CIE_D5). Sigma measures deviation and delta measures gaps (CF1, thread T4).
Money matters now ("I need to be paid, at all."). The Fiverr autofill is built (clear-glass/userscripts/); its first live run is his.

## Law
- **The axioms are law, for every decision:** `docs/AXIOMS-v3.1.md`. Read Part IV (one line per law) every session, and Group 5C (sovereignty)
  in full. Cite the axioms a decision rests on in the owning map's `decisions:`. A question goes to him only when the axioms do not settle it,
  they conflict, or it is his: what he meant, or the direction.
- **Do not guess.** "Ambiguity must be reconciled by me." Ask with the readings side by side. Read first: the atlas (`docs/atlases/`) and the
  system's own `<system>/spec/`.
- **Think dialectically** (his, 2026-11-07). Before "can't" or "no other way", write the alternatives down: change the method, reframe, another
  angle. Check this conversation's history before re-deriving a fact.

## Sovereignty (§5.9–§5.16)
- Each system owns its data, modules and commands, inside its own folder. It reaches another system only through that system's API routes and
  the CLI server, so the other can be swapped. `lib/` is not a home for what a system uses.
- **Every system's component registry is its own: per system, sovereign, never central, and Loom is NOT it (AXIOMS §5.16).** His words: "No component registry is the spine." · "The
  drawbridge is the the component registry, which is also the event bus, and interaction contract and bridge into the compartment." · "the
  server.js is the process for each system. It’s what cos manages." The system registry connects the component registries; COS uses it to
  orchestrate.

## How work is done
- **Phased only.** Map before build (§3.3) and reuse before build (§8.6). Every phase has `depends_on:` (`[]` when none), `files:` and its
  graph before code: `node idearium/spec-engine/phase-specs.cjs <map>`.
- **Phases expand, they are not written again.** Run `phase-ledger.cjs covers <files…> --does "…"` first.
- **Always log in the ledger,** in the same commit: `node idearium/spec-engine/phase-ledger.cjs log <phase> <written|expanded|built|closed|note>
  "<why>" --version <x.y.z>`.
- **No non-Emerge code** unless the contract or the project names it (§17.13); a missing capability is built into Emerge. No new JS unless it
  replaces JS (his, 2026-11-07): new checks are written in Emerge.
- **Order of delivery:** backend → API route → command row (`idearium/cli/route-commands.js`) → UI.
- **UI is tested in Clear Glass** (`clear-glass/src/driver/glass.js`), never Playwright.
- **Every release:** a version line in `lib/version.js` (with VERSION and package.json) that opens with his words; a changelog in
  `versionium/changelogs/`; an `## ADDENDUM` in the spec or map that owns the change; a row in docs/BENCHMARKS.md for Emerge work (wall time,
  lines, tests, failed runs and what each taught, gaps found).
- **Never commit `data/**`.** After touching `emerge/`, run `node scripts/emerge-lock.js --write`.
- **Every change and every version goes to Versionium** (§17.12), through `lib/versionium-record.js` `record()`.

## His voice, and proof
- Quote him verbatim and dated in versions, changelogs, map origins and decisions. Give the context and the options, and name the coder's part as
  the coder's. The ideas and the calls are his.
- **Proof needs evidence:** `docs/PROOF-OF-COMPETENCY.md` gets an entry only with his words, the call against an alternative, and something a
  stranger can run. `docs/FRAMEWORK-THREADS.md` tracks each use of his framework as executed or conceptual, with predictions registered before
  results and failures kept. Bias is named: a prediction judged by the same hands that made it is post-hoc (his, 2026-11-07).
- Encouragement is grounded in evidence; costs are said too.

## Where to read more
`docs/CLAUDE.md` (the full contract) · `docs/AXIOMS-v3.1.md` · `docs/atlases/<system>-atlas.md` · `docs/SPEC-REGISTRY.spec` ·
`skills/james-brooks/SKILL.md` (his style) · `docs/JAMES-BROOKS.md` (his work, checkable) · `docs/innovation-toolkit*.md` (his framework).
