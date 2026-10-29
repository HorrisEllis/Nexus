# 0.39.333 — 2026-10-05

_Released on branch claude/nexus-idearium-overview-yoguem as 0.39.313; main used 0.39.308–0.39.327 for other work meanwhile, so it is renumbered 0.39.333 on merging main. Comments in the code that say §0.39.313 refer to this release._

James: "Im saying im the phasemaps in the nexus repo."
James: "Yes. No playwright. That’s literally what clearglass was born from."

## The phasemaps in the Nexus repo
Both of the Nexus repo's own views now carry every phase from 2026-10-05:
- **Phasemap tab:** reads loom live.
- **Phases tab:** reads the repo's head snapshot. Proven on a fresh, sandboxed snapshot of this tree with the tab's own reader: the parent shows all 78 maps, and each system repo shows the maps whose phases are its own.

On a running Nexus, the Phases tab picks the new maps up at the next sync (boot or the sync button).

## RAID's phases are cortex's (HG8)
`lib/nexus-self/systems.js` mapped loom's `raid` tag to the intelligence repo. RAID's code is `cortex/core/raid/` (AXIOMS §5.2), so RAID phases showed on the wrong repo. The tag moves to cortex: **CL2** (the Agent tab through RAID) and **VP2** (adversarial review through RAID) now show on cortex. Intelligence keeps its own tag.

## The law: Clear Glass, never Playwright (HG7)
AXIOMS §4.1 read "UI is tested via Playwright." It now reads:

> UI is tested in Clear Glass (`clear-glass/src/driver/glass.js`), never Playwright.

It changed on James's word only. A dated addendum at the top of the file quotes him and keeps the old text. `docs/CLAUDE.md` carries the rule under Tests.

To hold it structurally, a new test **CG-001b** (in `test-nexus-atlas-and-glass`) fails if any file in the tree loads Playwright by `require`, `import` or `import()`. It was shown failing on a planted file, which it named, and passing once the file was moved out. What's left in the code is only "not Playwright" notes, plus keyword lists that recognise other people's projects (job skills, archetype detection).

## Proof
- test-nexus-atlas-and-glass 10/10, including CG-001b.
- test-nexus-self-and-cos-run 30/30, test-nexus-atlas-refs 51/51, version-sync 30/30, component-store 8/8.
- loom-phasemap 7/7, phasemap status 12/12, phases-nodes 21/21.
- test-repo-settings-ui 7/7, on Clear Glass.
- `phasesFor('cortex')` now lists CL2, VP2 and HG8.
