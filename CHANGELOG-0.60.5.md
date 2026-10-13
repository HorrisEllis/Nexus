# 0.60.5 — 2026-10-13

James asked for these:
- "contract format, maybe using primitives, priniciples, or invariants or maybe depenedancies as a boundary or constrain field for the contract, using a yaml file each as a block, then chunked, just like idearium. failure mode field, should be specced somewhere, check all of the phases, a lot of this is mapped already i feel like."
- "can you build the renderer.html as a compartment os ui, like the ones the desktop envirement use. i like those. theyre beautiful."
- "can I upload some projects and see if you can give nexus the ability to manage, expand, debug, and test them?"
- "i want to be able to copy projects and decompose them into components for the component store with the dependancies zipped together in a organized structured way. like make a tool for it, as well as a way to drag and drop zips to do it automatically."
- "okay yeah, how about a prompt to schedule the email."

## Clear Glass in the COMPARTMENT OS window style (`clear-glass/renderer/cos-theme.css`)

The look comes from the COS desktop window's own two sources:
- **Title bar**, from `idearium/ui/js/window-chrome.js`:
  - the gradient bar
  - the ▣ glyph and **COMPARTMENT · BROWSER**
  - 44px window buttons, with a red close
- **Toolbar**, from `idearium/ui/desktop.html`:
  - a `#12151d` panel with `#232838` lines
  - `#1b2030` buttons whose border turns sky on hover
  - pills

It is applied to the browser window, Settings and Library. The theme is one stylesheet loaded after the old one; remove its `<link>` and the old look returns. No behaviour changed.

## Decompose projects into components (`lib/project-decompose.js`)

What a decomposition does:
- A project, as a zip or a folder, has every code file stored as a component in the existing component store.
- A zip's single top folder is stripped. `node_modules`, `.git` and build output are skipped.
- Requires are resolved whatever order the files arrive in. npm packages are named; builtins are not.
- A require that points nowhere is reported, never guessed.
- The project's `package.json` versions are kept.
- Decomposing the same project twice stores nothing new.

A **bundle** is one component plus everything it requires, as one zip:
- every file at its project path, so its requires still resolve
- `component.json`, with every version pinned
- `package.json`, with the npm packages the files need, at the project's versions
- `README.md`

Where it is available:
- **Routes:** `POST /api/components/decompose` (a zip upload, or `dir`) and `GET /api/components/:id/bundle` (a download, or `?save=1`, which writes the file and answers with its path).
- **Commands, which every agent has through nexus.command:** `components`, `components decompose <folder>`, `components bundle <id>`.
- **UI:** Idearium → Bring in → **Decompose into components**. Drop several zips at once and each is decomposed straight away. You can search the store and click "⬇ bundle" on any component.
- **Loom:** `loom/maps/component-intake-map.js` declares the decomposer and its requires, plus idearium/api's requires of `phase-plan`, `plan-learning` and `repo-run-state` (0.60.0). That covers part of the debt MX2 names.
  - A from-scratch bootstrap lands all 7 wires with no failures; the bootstrap's unresolved count went from 116 to 115.
  - `registry.json` was not regenerated in this commit. A regeneration rewrites about 34k lines, mostly from earlier changes, and belongs in its own commit.

## Mapped

**`docs/2026-10-12-request-spine-phasemap.spec` 1.2.0:**
- His contract format is recorded under `decision_contract_format`:
  - one `.contract` with a `boundary:` holding primitives, principles, invariants (each with a check kind, run by RQ22) and dependencies;
  - `blocks:`, each a YAML section like an idearium spec block, chunked one per file change;
  - `failure_modes:` per block.
- `decision_contract_files` holds the coder's reading of "a yaml file each as a block", still to confirm.
- The new `failure_mode_field` shows the field is already specced: RQ2's vocabulary, `lib/node-schemas/schema.failure_mode`, and FM4/FM2. It also lists the other maps that already cover the contract's pieces.

**`docs/2026-10-12-browser-providers-and-work-phasemap.spec` 1.1.0:**
- RN0 (done)
- CS0 and CS1 (done)
- CS2, uploaded projects managed, mapped onto what exists:
  - import is `repo.import-archive`;
  - expand, debug and test are the request spine plus `cos/testenv`;
  - the proof is one of his real projects.
- JB7's `decision_followup_send` is chosen: a prompt to schedule. Scheduling it is the approval, and a reply cancels it.
- MX2 is partial.

The request-spine file is not strict YAML: a `files: [... (new) ...]` flow list in the original as uploaded. Loom's line parser reads all 28 phases, so it was left as written.

## Tests

- `test-project-decompose` passes 14/14: PD-01–PD-10 and WR-01–WR-04.
- These pass unchanged:
  - the component store
  - the command table and nexus.command
  - the Clear Glass settings, library, indicators, screen-QA, accounts, compartment-window and hardening suites
  - the Idearium theme
