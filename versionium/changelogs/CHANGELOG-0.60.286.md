# 0.60.286 — finish this or any other project; the Fiverr fill menu; type what you want

James, 2026-10-29, uploading Emerge.zip:
> "remember the browser.html is the ui. take this, and import it into idearium, then create all the capability to finish this or any other
> project in the repo. convert mds, hardcoded phasemaps, refactor tool for the architecture to use the component registry as the spine,
> decomposition tool for breaking up each component into it's own file and wire it into the spine.
>
> look at all top, trending, from today, and from all time, and use that data, to brainstorm some ideas for fiverr in clearglass."

Then, mid-turn, with screenshots of Idearium timing out and Fiverr's Press & Hold page:
> "okay the autofill still isn't working, do everything you can, invent, expand, anything to get fiverr operational as a source of income.
> need to do better than a button, make a full menu with check boxes, adn drop downs if applicable."
>
> "yes, and can you do what you can to get idearium to work dynamically? like type in the cli, determine context needed, build dag. search
> the project for context, ask user about any gaps, then contract, etc"

Specced first:
- `docs/project-spine.spec` compiles at full depth.
- MOD-GM1..3 are added to `clear-glass/spec/gated-flows.spec`.

Mapped and DAG-checked:
- `docs/2026-10-29-finish-any-project-phasemap.spec` (FA0–FA10);
- GM1–GM3 in `docs/2026-10-28-gated-flows-phasemap.spec`.

## Finish any project (FA0–FA7)

| Phase | What | Where |
|---|---|---|
| FA0 | **The import keeps what the project tracks.** Every folder named `build` used to be skipped. Emerge's `lang/build/current` (its language's current build) was dropped, so the imported Emerge could not run. Now the project's own root `.gitignore` decides, with globs, anchors and `!`. Only node_modules, .git and .svn are always skipped. `.eg`, `.mjs`, `.cjs` and `.toml` are chunked as text. | `lib/zip-ingest.js` |
| FA1 | **Adapters** (NC0): the javascript, documents and emerge adapters, behind one contract with a conformance check. These are slices of AD1/AD2/AD4. | `lib/adapters/*` |
| FA2 | **The registry is the spine** (his IN3, for any project). `nexus.spine.json` holds every component and every wire with its evidence: discovered by which adapter, declared, or unknown. Declared edges survive rescans, and drift is reported. | `lib/project-spine.js` |
| FA3 | **Refactor through the registry.** Move or rename by component id. Who reaches the component is read from the spine's wires, and each require or link is rewritten on its line. A rescan checks that no wire was lost. | `lib/project-refactor.js` |
| FA4 | **One component, one file.** Banner sections, or top-level declarations, each become a file under `<name>/`. The old path stays as the door, with the same exports. Code is kept together where it shares a reassigned `let`, sits in a cycle, or needs `__filename`. Old and new are loaded apart and compared, and a split that differs is refused. | `lib/project-split.js` |
| FA5 | **Convert.** An md becomes an emerge-format spec: its sections kept whole, plus a module for each file it names, with real exports. A spec's hard-coded build plan (`modules[].build`, its decisions) becomes a phasemap, and its DAG is checked. | `lib/project-convert.js` |
| FA6–FA7 | **Routes, commands, and the Finish tab** in Idearium. Commands: `repo finish`, `repo spine`, `repo refactor`, `repo split`, `repo convert`. Every action is a plan first, and Apply writes through the repo layer. | `idearium/api`, `idearium/cli/route-commands.js`, `idearium/ui/js/repo-spine.js` |

**On the real Emerge zip, through the router:**
- the tracked build folder is kept, and the gitignored `previous` folder is left out, with the reason given;
- the spine has 159 components and 367 wires, 0 of them unknown;
- `cie-eg.spec` becomes 17 phases: 3 built, 9 ready, the rest waiting on its open decisions D3/D6–D9. There are 0 DAG problems;
- 10 mds become specs;
- all 26 multi-component files split and verify. The first run caught a shebang bug, which is fixed.

**Also fixed in Idearium.** A new file whose stem was taken was refused ("section 'readme' already exists"). This happened with README.spec beside README.md.

## Type what you want (FA8–FA10)

`repo do <repo> "…"` and the Do box on the Finish tab both use `lib/intent-flow.js`. The flow follows his order exactly:
1. **intent:** the verb, the words, and the paths named;
2. **context needed:** components scored by the spine;
3. **DAG:** what they use is built first; who uses them is checked after;
4. **context found:** the lines that hold the words;
5. **gaps:**
   - a word found nowhere;
   - a path that does not exist;
   - two parts tied for one word;
   - no test near the change;
   - no done-when.

   At the terminal, each gap is asked with numbered options. On screen, each gap is a dropdown.
6. **contract:** RAID's v2 contract — a context gate, one build gate per DAG node in order, then a verify gate. RAID's own validate accepts it, and `--write` saves it for `contract gates` / `contract run`.

No model is asked; the flow is deterministic.

## Fiverr (GM1–GM3)

**The fill menu.** Every part of the gig is a row with a tick:
- dropdowns for category, delivery time and revisions;
- values editable in place;
- yes/no ticks for package rows;
- All / None / This page;
- options: replay my recorded choices, match confidence, point at a part that is not found;
- **Fill selected**, after which each row shows its result.

**Price and revisions are now filled too.**
- Price uses a new driver action, `typeAt`: the text box at a column × row is typed into, then read back.
- Revisions are chosen, then read back.

**The Press & Hold human check stays his to press (HC3).** Nothing presses or solves it.

**Market brainstorm.** `clear-glass/docs/gigs/ideas/2026-10-29-market-brainstorm.md` draws on Fiverr's June 2026 index:
- Claude Code specialists +938%;
- n8n +125%;
- Base44 +95%;
- vibe coding +61%.

There is no October data and no verified all-time ranking; the brainstorm says so. Two new gig drafts rest on his own proof:
- `custom-mcp-server.gig`;
- `vibe-code-rescue.gig`.

## To confirm (his words, read by the coder)

- **"browser.html is the ui".** The zip has no browser.html. Emerge's IDE serves a ui/index.html that is not in the zip either. The new screen is Idearium's, and it shows inside Clear Glass. If Emerge has its own browser.html, send it.
- **"the component registry as the spine".** Read as IN3: one registry per project, with refactors asked of it. The code keeps its plain requires.

## Proof

- `test-project-spine` 8/8;
- `test-intent-flow` 4/4;
- `test-gig-fill-menu` 3/3;
- each of the three includes a Clear Glass check;
- `test-substrate-spec` 3/3;
- the seven Fiverr suites are unchanged.
