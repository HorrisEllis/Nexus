# 0.60.4 — 2026-10-12

James asked for these:
- "stop. before you continue. I dont want anything to go unmapped. here is some uncomited changes. can you commit them for me in clearglass we were working on helping me with getting work."
- "Can you make a template with a download button in the settings for the fiverr, next to download gig file. maybe you could use a yaml file with a real .gig extension. do it."

## His gig work, committed

The work is in its own commit (b966702) and does three things:
- loads a `.gig.json` into the gig writer, held to Fiverr's limits like a written gig;
- saves the gig as a file;
- adds the sample `clear-glass/docs/gigs/nodejs-automation-scraping.gig.json`.

His second zip's `bridge.js` predated 0.60.2. So the import handler was added on its own, and the 0.60.2 account line it would have removed was kept.

## .gig files are YAML (`clear-glass/src/autofill/gig.js`)

- `gigFile(gig)` writes `<title>.gig`: YAML, readable and editable.
- `gigTemplate()` writes an empty `gig-template.gig` with each Fiverr limit as a comment beside its field. Its five requirement questions are the end-state questions Idearium builds to.
- `parseGig` now reads YAML as well as JSON. A `.gig`, a `.gig.json` and an agent's reply all go through the same limits.

Where it shows up:
- **Settings → Autofill → Gig:** "Save gig file" (a `.gig`) and **"Download template"** sit next to it. "Load a gig file…" accepts `.gig`, `.yaml`, `.yml` and `.json`.
- **The gig panel:** the same buttons.
- **The new IPC route:** `autofill:gig:file`, registered in `registry-components.js`.

Samples: `clear-glass/docs/gigs/gig-template.gig` and `nodejs-automation-scraping.gig`.

## Everything asked is mapped

- **`docs/2026-10-12-request-spine-phasemap.spec`** (his upload, RQ0–RQ27, eight decisions): the request pipeline. It is committed as he wrote it.
- **`docs/2026-10-12-browser-providers-and-work-phasemap.spec`** (new): everything the spine does not cover.
  - **TB0–TB7, Clear Glass tabs.** First, prove which session a page uses (it reads as the default session, not the window's). Then: a webview per tab, a tab as an account, tabs as compartments, bookmark checklists, `.site` nodes per site and account, element endpoints, and human tabs never spoofed.
  - **PV0–PV6, providers.** Claude Code as a headless guardian provider, providers read from their nodes, hats as nodes, `.input` nodes for every job and CLI input, and inputs as history. PV5 and PV6 shipped in 0.60.3.
  - **JB0–JB7, getting work.** JB0 is done. The rest:
    - the agent writes `.gig` files;
    - the copilot hat's agent and account per provider;
    - autofill fields mapped by a pick, with Nexus Nerve asking;
    - resume import;
    - varied wording with true facts;
    - the application ledger;
    - the follow-up email, drafted and scheduled, sent only on his approval by default.
  - **MX0–MX4, mapping itself.** Phases tagged to components (a per-module view in loom, not a file per module), nothing built unmapped, the loom wires owed for 0.60.x, and one system digest.
  - **Folds and decisions.** The request-pipeline asks are folded into RQ phases, not repeated. Three open decisions: node truth, follow-up send, mail channel.
- Both maps parse with loom (28 + 27 phases) and are registered in `docs/SPEC-REGISTRY.spec`.

## Tests

- `clear-glass/test/gig-file.test.js` checks that the template and a saved `.gig` load back unchanged and that the wiring is present. It is added to clear-glass's `npm test`.
- The autofill suites pass, and so do loom's phasemap-status, phasemap and diagnosis tests.
- `loom/test/phasemap-map.test.js` has one failure: the seeded-prior persistHistory case. It fails the same way without these files.
