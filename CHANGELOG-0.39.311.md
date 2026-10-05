# 0.39.311 — 2026-10-05

James: "Don’t just agree. Give input"
James: "No playwright. ClearGlass only."
James: "I want the agent cli tab to be the end point for all cli commands. Each system needs to be in charge of its own data. Not the data folder in the root or cortex. Cortex is the book keeper, with the associative lattice. Like the code tab in idearium should probably be for new code in the repo. Like a full enterprise grade section for the agents code generation, and uncommited change, the work surface."

## Clear Glass, not Playwright
0.39.310's Settings test drove Chromium through Playwright. That broke a rule this project already had: `clear-glass/src/driver/glass.js` (0.39.263) says "Replaces Playwright."

`test-repo-settings-ui` now runs on Clear Glass's own driver and passes **7/7**. In this container the Electron binary isn't downloaded, so the driver uses its documented second engine, Chromium over DevTools. The test prints which engine ran. With no engine at all, the browser checks are skipped, and the test says so.

**Still open:** `docs/AXIOMS-v3.1.md` §4.1 says "UI is tested via Playwright." That's a law, and only James changes a law, so it's proposed (Q1), not edited.

## Mapped, with input: `docs/2026-10-05-cli-data-code-phasemap.spec`
**The Agent tab as every CLI's endpoint.** Yes, but it should never run a command line from a page.
- Each system declares its verbs as `.command` nodes it owns.
- The Agent tab and `cli/nexus.js` both read that one registry.
- A call goes to the owner's route through RAID, with args as data and no shell. A writing verb asks first.

**Each system owns its data; cortex keeps the books.** Yes, with two conditions.
- The bookkeeper is a **catalog** (owner, location, count, hash, lineage) plus the associative lattice, **never a copy**. A copy would be a second truth.
- Systems move home **one at a time**, behind a read shim that warns on every old-path read.
- This extends sovereign-node P5, which already said the same; an addendum there points to DS1/DS2. How many modules read another system's tables isn't counted yet; DS1 measures it before anything moves.

**The Code tab for new code.** Yes. The hard part is that "pending code" lives in four places across three stores: injects, staging and the git working tree.
- One path: proposed → staged → applied → committed, each state in one store.
- One review surface with three categories: **Changes · Generation · Search**.

## Questions for James
1. Amend AXIOMS §4.1 to say Clear Glass?
2. Writing verbs from the Agent tab after one confirmation, or only from the terminal?
3. Which system moves home first? The proposal is the one with the fewest foreign readers, not the largest.
4. Does the Agent tab's /injects stay, or point at Code → Changes?

## Proof
- `test-repo-settings-ui` 7/7 on Clear Glass.
- `test-nexus-atlas-refs` 51/51, `version-sync-and-registry` 30/30.
