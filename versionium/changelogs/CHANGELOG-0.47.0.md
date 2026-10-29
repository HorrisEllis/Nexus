# 0.47.0 — Idearium, one surface

James: "thats supposed to be a idearium feature. also needs to look like the rest of it like the plan panel. also hooked into the code tab, same with the rest of what should be interconnected in the repos."

James: "yeah just needs to not be overwhelming, clean and beautiful. also the idearium settings still have iframes. need more settings moved into the correct tabs. like all agent options go into the agents tab"

James: "look in the agent settings and plan, and code tab for the propals. make sure its enterprise grade, consistent with nexus axioms and ideariums style. also the spec engine needs to have autocomplete for the areas that are blank. generate the file tree automatically, which feed into the registry as a spine."

The idea and the direction are James's; the code is the coder's.

## One surface
- **No second drawer.** The Plan panel has one folded **activity** section with five views in the panel's own look: tasks · log · control · versions · machine.
  - The phases are the panel's own tasks; the earlier duplicate Phases view is gone.
  - A step that stopped says why, in one line under its row.
- **Code tab.** The open file shows "n versions · last changed … by …". Clicking it opens the Plan panel's versions view, filtered to that file.
  - Backend: `GET /api/repos/:uuid/history?path=` and `idearium repo history`.
- **Agent tab.** It holds every agent option, in folded sections:
  - **proposals:** the work-surface cards, the same as in the Plan panel and the Code tab;
  - **behaviour:** tool scope, and what happens to code the agent writes;
  - **prompt**, **hat & tools** and **models**.

  Settings → Agent now opens the Agent tab.
- **Settings without iframes.** The Desktop settings are drawn natively.

## The spec engine
- **Phases from sections.** A workshop spec is planned by its sections, one phase each, named by its title, built bottom-up. The idea's framing sections and blank sections are not phases.
- **Completing blank parts.** The Spec tab names what is blank. **✦ draft them** turns each blank part into workshop proposals, which you accept before anything changes.
  - Backend: `GET …/spec/blanks`, `POST …/spec/complete`, `idearium repo blanks`.
- **The file tree is the spine.** A document spec that becomes complete plans its file tree automatically from its registry section. The files are slotted into the skeleton's `registry-components.js` and its nodes.
  - Setting: `specs.auto_file_tree` (on by default).

## Proof
- `tests/probe/idearium-one-surface-glass.js` 15/15, on Idearium's real page, served by the real API, in Clear Glass.
- Other tests: test-spec-blanks 3/3, VR-06, PL-SP1, RD-06.

## Not done
- A proposal card doesn't yet link to the task that wrote it, because proposals don't record a task id yet.
