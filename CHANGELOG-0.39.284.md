# NEXUS 0.39.284: getting idearium to code a project — the plan always lands, the work surface, one look — and the archive drop box

**Date:** 2026-09-30 · base: 0.39.283 · MINOR (idearium 4.15.0: new routes and config keys)
**Maps:** `docs/2026-09-30-idearium-coding-flow-phasemap.spec` (W0–W6) and `docs/2026-09-29-nex-node-store-phasemap.spec` (N30). **Handoff:** `docs/2026-09-29-handoff.md`.

James: *"can you give copilot a command, or something. like i want to import my archives of nexus. have it pull up a drop box ui and run the command?"*, and then, with screenshots and a full `start:all` log: *"i want below the plan, in idearium, the worksurface from cos or the ide identicle to yours … can you rebuild the themes for the settings tab for idearium. the phases tab needs to populate with the plan. can you make all the css in idearium consistent with the main ui. remember its alwasy cli and api first … the create and build tabs should be removed from the repos and moved back to the main navbar. make the navigation more dynamic … most important. get it coding the projects. this is hard to understand how to actually build the code base. also the tools arent exposed still appearently. i want to see it working."*

## What the log showed
- **idearium went OFFLINE for 3½ minutes** (00:13:35 → 00:17:02, 14 missed pulses), and the build trigger it sends to itself was refused on :4800.
  - The cause: making the code repo branched the 91 MB original with `git init`, `add -A`, `commit` and `worktree add` through `execFileSync`, inside the request handler.
- **Three plan runs "replied" and no phasemap came back**, so the Phases tab stayed empty.
  - A 3B local model with a 4k context answers, but does not write the addressed file.
- **The review of a rebuild timed out** at gate 7/8 on chatgpt. That is a provider-side wait; the message was already honest, and it is unchanged.

## idearium never blocks on git (W1)
- **`cos/workspace` has `branchWorkspaceAsync`, `ownRepoAsync` and `listBranchesAsync`.** They run the same steps with `execFile`, so the server keeps answering while git works. The sync functions stay for their other callers.
- **`speceng.codegen` awaits the async branch.**
- **Proof:** a slow fake git runs while a 20 ms timer keeps firing, and a real git gives the same result as the sync path (`test-cos-workspace` WS-05/06).

## The plan always lands (W2)
- **After the agent replies,** the phasemap is the agent's file. Otherwise it is a map in the reply text (`planFromReply`). Otherwise it is **derived from the spec's own sections** (`derivePlan`):
  - one phase per section, with small ones grouped to at most 24;
  - each phase's layer read from the section's name, then its text;
  - dependencies chained bottom-up;
  - `meta.planned_by`, `reason` and `planned_at` recorded.
  
  This works for specs that are not valid YAML, like the ERAVOS kernel amendment, and for markdown headings.
- **An invalid map the agent wrote is kept** as `<map>.agent-draft.txt`, never overwritten.
- **`POST /api/repos/:uuid/spec/plan {derive:true}`** plans at once, without the agent.
- **CLI:**
  - `idearium repo plan <repo> <spec> [--derive] [--replan] [--dry]`
  - `idearium repo plan --dry --file <spec>`
  - `idearium repo phases <repo> <spec>`
  - `idearium repo build <repo> <spec> [--phase <id>]`
- **UI:**
  - The Spec tab's "⚡ plan from the spec now". After "▶ Build this spec" the tab watches for the map and fills itself.
  - An empty Phases tab lists the repo's specs, with "⚡ plan from the spec" and "▶ ask the agent".

## The work surface, under the Plan (W3)
- **`GET /api/repos/:uuid/worksurface`** (`idearium/repo/work-surface.js`) is a projection over the `.inject` nodes and the run rows. For each changed file it gives:
  - the newest state, with earlier changes counted as history;
  - its unified diff against the file before it was applied (or as it is now, if not applied), and `+added −removed`;
  - who wrote it and the run that made it;
  - its actions: Apply, Reject, Revert or Promote.
- **It also gives the tools:** the scope, the tools the agent is given, and every call it made, ✓ or ✗ with the error.
- **Phase and plan runs now keep their tool calls,** so this shows what the agent actually did with its tools.
- **In the Plan panel,** the work surface sits below the plan: collapsible diff cards in green and red, in the manner of the Claude Code view James pointed at.

## Navigation (W4)
- **Create and Build left the repo's tab row** and are back on the main bar. With a repo open, they act on it.
- **Build ▾ starts with "Build this repo":** the repo's Home tab (Start building, one row per spec) with the Plan panel open.
- **A sliding ink** follows the active tab on both bars. Dropdowns animate open, and views and repo tabs fade in.
- **A chosen menu closes** even while the pointer still rests on it.

## One look (W5)
- **`idearium/ui/css/nexus-theme.css` holds the main UI's palette**, token for token with `ui/themes/nexus-dark.css`. A test fails if they drift. It also holds:
  - **Midnight:** idearium's look before this release, kept;
  - **Graphite:** neutral greys.
- **The accent** is the main UI's cyan, either cycling as it does there or fixed (cyan, violet, emerald or amber).
- **Motion** is full or reduced.
- **Where to set them:**
  - config `ui.theme`, `ui.accent` and `ui.motion` (`POST /api/config`);
  - the settings console's new **Appearance** page, with palette cards and live previews, accent chips and motion. A change applies at once and is saved; every idearium window follows.
- **idearium's and the console's own tokens now read from it.** The console's separate purple palette is gone.
- **The top-bar "⚙ settings" button** is no longer a white browser button.
- **Light is not offered:** idearium hard-codes dark surfaces in many places, so a light palette would look broken.

## The archive drop box (N30)
- **Open it** with `/import-archives` (or "import my archives") in idearium's Agent CLI, or the same words in the Clear Glass co-pilot pane. Either opens `archive-import.html`.
- **Give it** zips, a folder, or a path. **Check the order** is a dry run; **Import** runs `cli/import-history.js` as a background child job (`lib/history-import-job.js`, `--jsonl` progress, `--list` for long inputs).
- **The page shows** each zip as it lands, the counts, the report and the one merge command.
- **In a plain browser,** the zips are streamed to the data inbox first.

## Tests
- **New suites:**
  - `test-plan-lands` 17/17
  - `test-work-surface` 14/14
  - `test-idearium-theme` 15/15
  - `test-history-import-job` 18/18
- **`test-cos-workspace`** is 16/16. `test-one-idearium-phases-nodes` has its N1 check inverted to match the move.
- **Probes:**
  - `idearium-coding-flow-chromium` 15/15: the real page on a real idearium in a sandbox. It covers the main bar and the ink, planning in the Phases tab, Build this repo, the work-surface diffs and Apply, and Appearance switching and saving.
  - `archive-import-chromium` 7/7.
  - `build-surface-ui` 11/11, `manage-workbench` 13/13 and `settings-console` 10/10. Their fixtures now load the theme.
