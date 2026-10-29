# 0.60.269 — the Fiverr automation as editable node files; Settings › About

James, 2026-10-28: "can you move the fiverr automation and macros to actual node files imported in the settings. like .node files. I want to
be able to edit what you added." · "those are supposed to be what you added but in node files. also need a about page in the settings, where
it says the version, can check for updates to electron and clearglass."

## The Fiverr automation, as node files he can edit
- **The four files he handed over** ship with Clear Glass in `clear-glass/automation/nodes/`, the `.workflow` / `.macro` node format
  (`lib/automation-nodes.js`, the one envelope every node type shares):
  - `fiverr-gig-fill-this-page.workflow`;
  - `fiverr-gig-overview-steps.workflow`;
  - `fiverr-gig-scope-pricing-steps.workflow` (bundles its macro);
  - `fiverr-gig-choose-delivery.macro`.
- **In Settings › Automation › node files.** Each file is put into the library once (`seedBundled`), and Import, Download and delete work as
  for any node file. A file he edits there stays his. A file he deletes is not brought back: `.seeded.json` records what was put there.
- **The gig fill runs his macro.** It picks each tier's delivery time with "Fiverr gig - choose delivery", run as him with `tier` and
  `delivery` (`_gigNodeMacro`).
  - The first time, the macro is imported from its node file.
  - After that, the copy in Settings › Macros is used, so editing it changes what the fill does.
  - If the macro cannot run, the built-in pick does it, and the result says why (`via: built-in`, with the macro's error).

## Settings › About
- **What is running:** Clear Glass, Nexus (`lib/version.js`), and Electron with its Chrome, Node and V8, plus the platform.
- **Check for updates**, read-only (`src/about`):
  - Electron's newest from the npm registry;
  - Clear Glass's and Nexus's newest from the repository's main branch (`clear-glass/package.json`, `VERSION`).

  Each newer one says how to get it: `npm install electron@latest`, or pull / drop the change pack. A source it cannot reach (offline, or a
  private repository) says so. The sources can be pointed elsewhere (options `about.sources`). Nothing is installed from here.
- **Also reachable** at `GET /cli/about` and `/cli/about/check`, and by the command `glass about [--check]`, so every agent has it.
- **The live check, run from here:** Electron's newest is 45.1.0 (his Clear Glass pins 42.11.6). Clear Glass and Nexus read 3.24.0 and
  0.60.268 from main.

## Proof
- `tests/modules/test-about-and-nodes.test.js` 4/4:
  - AN-01: version comparison, and the check with a newer Electron and an unreachable source;
  - AN-02: the four files ship and parse; the real route seeds them once, his delete stands, and one imports with its macro's
    `choose` step intact;
  - AN-03: the gig fill imports the macro once and runs it per tier with the days; when the macro fails, the built-in pick runs and says why;
  - AN-04: Settings › About in Clear Glass, with its versions, a newer Electron marked with how to get it, an unreachable source said, and
    up to date.
- `test-fiverr-works` 11/11; `automation-nodes` 8/8, `automation-settings-ui` 8/8, `automation-v2` 18/18, `test-global-settings` 5/5,
  `test-browser-shell` 28/28. Every other suite touching these files gives its base result.
