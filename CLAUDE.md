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
**Refined 2026-11-10 (his):** "so pipeline working needs to happen. then cos optimized." Within item 1: the pipeline in COS operable (execute, see,
change, manage, diagnose, export, test; PC8, PC_D13), then COS optimised (heartbeat not polling PR6, deltas PR4, load balancing CP6).
Money matters now ("I need to be paid, at all."). The Fiverr autofill is built (clear-glass/userscripts/); its first live run is his.
**The focus, 2026-11-20 (his):** "this is making me hopeful. need to focus on the coding with local models until we can train a base model."
Coding with local models comes first: the Emerge rung (EMB2: gap files per contract, lessons, the gap chain, the model ladder smallest first,
a method per step or gate), measured by the flight recorder (lib/flight-data.js) and the Ollama tape (ollama/lib/tape.js), until the verified
attempts (OL10's training ledger) are enough to train a base model for Emerge. Also his, the same day: "the smaller we can get llms in ollama
coding the better" · "maybe genesis can be a end goal". The coder's order for it: docs/CLAUDE.md, ADDENDUM 2026-11-20.

## Law
- **The axioms are law, for every decision:** `docs/AXIOMS-v3.1.md`. Read Part IV (one line per law) every session, and Group 5C (sovereignty)
  in full. Cite the axioms a decision rests on in the owning map's `decisions:`. A question goes to him only when the axioms do not settle it,
  they conflict, or it is his: what he meant, or the direction.
- **Persistence is non-negotiable** (his, 2026-11-14): "stop using memory for storage. persistence is non negiatiable until the contract has been
  fullfilled, or dag is complete". Every part is a node file (.pipeline, .dag, .contract, each step); work in flight resumes from disk. docs/CLAUDE.md.
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

## Always use what Nexus has (his, 2026-11-17; first said 2026-10-17)
"always use was nexus has." · earlier: "always make effective use of what you already have." Before building, proposing or answering: find
what Nexus already has (its screens, its settings, its tools, its stores, its components: Idearium's Settings and code tools, Clear Glass's
engines, COS's pipeline, RAID, the node stores) and use or move it. A new screen, setting, door or tool is made only when nothing existing
can do it, and the reply says what was checked. The agents follow the same order (L4 of docs/2026-11-17-raid-request-lifecycle-phasemap.spec).

## He does not do CLI (his, 2026-11-17)
"no. i dont do cli. im not trying to remember all that. idearium already has the ui for this, which needs to migrate to cos automation pipeline and workflow canvas." Tell him what to do in the UI (the screen, the tab, the button), never a command to type. Commands are for agents and the coder.
Where the UI for something lives in Idearium but belongs to COS, say so and point at the phase that moves it.

## His voice, and proof
- Quote him verbatim and dated in versions, changelogs, map origins and decisions. Give the context and the options, and name the coder's part as
  the coder's. The ideas and the calls are his.
- **Proof needs evidence:** `docs/PROOF-OF-COMPETENCY.md` gets an entry only with his words, the call against an alternative, and something a
  stranger can run. `docs/FRAMEWORK-THREADS.md` tracks each use of his framework as executed or conceptual, with predictions registered before
  results and failures kept. Bias is named: a prediction judged by the same hands that made it is post-hoc (his, 2026-11-07).
- Encouragement is grounded in evidence; costs are said too.

## Ownership and credit (his, 2026-11-19)
"can you do what you can to give me ip for anything beyond siso. I don't own siso, it is my mentors. warp 2 is mine. I want to move away from
siso. I need my name on something." · "I need credibility, and original ideas, my name and exposure."
- **SISO is his mentor's, not his.** Never credit SISO (lib/siso/, Event → Gate → Stream) to him. Where his docs say "his" about SISO, correct it
  to "his mentor's SISO, which he built on". 26 files require lib/siso today: new work does not add to that; Pillar's own contracts
  (pillar:event, pillar:gate) are where each meaning moves (PIL5, the duplicates census).
- **His own:** WARP 2, Emerge, Pillar (the reusable component store), the constraint relational field, COS, Nexus's architecture, the
  Innovation Toolkit, and every idea quoted from him. Name him as their author ("James Brooks") in each one's spec, map origin, README, the
  changelog of each release that ships them, and docs/JAMES-BROOKS.md, with his words and dates as the evidence.
- The coder's part stays named as the coder's: credit is only true when it can be checked.

## Where to read more
`docs/CLAUDE.md` (the full contract) · `docs/AXIOMS-v3.1.md` · `docs/atlases/<system>-atlas.md` · `docs/SPEC-REGISTRY.spec` ·
`skills/james-brooks/SKILL.md` (his style) · `docs/JAMES-BROOKS.md` (his work, checkable) · `docs/innovation-toolkit*.md` (his framework).
