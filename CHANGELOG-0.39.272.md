# NEXUS 0.39.272: copilot can do everything Clear Glass can, and learns from it

**Date:** 2026-09-27 · base: 0.39.271 · clear-glass 3.17.0 → 3.18.0 · map: `docs/2026-09-27-clearglass-whole-copilot-learning-phasemap.spec`

James: *"i want copilot completely aware of clearglass, hooked in completely. all of it … automate job applications, fiverr … idearium agents should be able to find the context easily"* · *"this is the current CLEARglass … expand it as much as possible. also have him learn."*

## Clear Glass, whole, for copilot

**New routes on :7702**

| Route | What it does |
|---|---|
| `POST /cli/driver` | Runs the driver action and returns its result in the response. It used to return `{emitted}`, with the result going out on SSE only. |
| `POST /cli/page/read` | Returns the page text, headings and links, every field with its label and a selector, and every button. |
| `GET /cli/state` | Returns every tab with its url and title, plus accounts, autofill profiles, macros, userscripts, extensions and downloads. A source that can't be read is named, never shown as empty. |
| `GET/POST /cli/invoke` | Reaches **every one of Clear Glass's 172 IPC channels by name**: window control, settings, login portal, plugins, WebExtensions, macros and recording, selectors, custom agents, errors, opening a download. It calls the same handler the window uses (`ipc/handler-registry.js`). |

Saving credentials is refused by name.

**Driver:** new actions `readPage`, `setValue`, `select`, `check`, `pressKey` and `upload` (a real file, through CDP).

**Tools**
- **`clearglass.browser.tool`:** `state`, `read`, `act`, `sequence`, `tabs`, `autofill`, `questions`, `channels` and `invoke`.
- **`clear_glass_command_index`:** fixed. Every `/cli` call went to :7704, which has no `/cli` routes, and 404'd.

**The pane co-pilot** now sees its tool results and keeps going for up to `copilotToolRounds` (default 3). It can also run any NEXUS agent tool from a ` ```tool ` block. This works with the hat, route and auto-run settings from 0.39.262.

**Copilot's chat**
- It now offers all 16 Clear Glass tools, plus the atlas, the opportunity pipeline and what it has learned.
- Its context has two new layers: L7 (Clear Glass state and learning) and L8 (opportunities).
- The tool guide covers every tool: 113 of 113.

## Copilot learns (`lib/cg-learning.js`, `clearglass.learned.tool`)

- **Site memory.** Every browser action is recorded per site: the selector, the label it was aimed at, and whether it worked or the error. `read` returns what worked and what keeps failing on that site.
- **Self-healing selectors.** When a selector finds nothing:
  1. It first tries a selector that worked for the same label on that site.
  2. If there is none, it tries the page field or button whose label or text best matches.
  3. It retries once and records the result.
  - A tie between two equally good matches is refused rather than guessed.
- **Learned flows.** A sequence of 3 or more steps that fully worked is kept, counted each time it works again, can be replayed, and can be promoted to a Clear Glass macro. Passwords are stored as `{{password}}`, never as the value.
- **Outcomes.** Responses, interviews, offers and silence move the source and skill weights in scoring. The change is bounded to ±15 and needs at least 3 outcomes; each one says what it learned from.
- **Your voice.** Drafts you edited feed `{examples}` in the drafting templates.

## Jobs, Fiverr, Upwork (`lib/opportunity`, `cli/opportunity.js`, copilot `/api/opportunity/*`)

- **Reuse:**
  - Your identity comes from your Clear Glass autofill profile: fields, résumé path, cover-letter and proposal templates.
  - Platform guidance comes from Clear Glass's own `autofill/proposal.js`.
- **The pipeline:** 8 job sources, explained scoring, an answer bank, `prepare` (fills the form and stops), Fiverr/Upwork replies typed into the box but never sent, follow-ups.
- **The gates:**
  - Approval is yours only.
  - Auto-submit only happens under your policy, and on LinkedIn/Indeed/Upwork/Fiverr it also needs `acknowledgeTos`.
- A Clear Glass palette command, *Capture job / gig / lead to NEXUS*, sends the page you're on to the pipeline.

## Idearium: every memory, one door (`lib/context-atlas.js`, `nexus.context.tool`)

- **One search across:**
  - every cortex table;
  - **the download manager** (via a new `search()` in `lib/agent-memory.js`, using its own read path);
  - the repo graph, the blueprint, specs and changelogs.
- **Repo agents:** new editable blocks `{atlas}` and `{directory}` sit beside 0.39.269's `{memory}`. The agent's own exchanges stay in `{memory}` and are not repeated in `{atlas}`.
- **The Agent tab preview** now includes `{memory}` too; before, it left it out.
- **Also:** `/recall` and `/atlas` in the Agent tab, and routes under `/api/context/*`.

## Tests

| Suite | Result | Notes |
|---|---|---|
| `clear-glass-agent-surface` | 16/16 | New; registered in run-all |
| `test-opportunity` | 27/27 | New; registered in run-all |
| `test-tool-guide` | 7/7 | T-001 was failing on 0.39.271 |
| `test-composed-prompt` | 19/20 | CP-101 fails identically on 0.39.271 |

- `lib/cg-learning.js` was run as a smoke test only: heal by label, heal by text, hints, password redaction. It has no test file yet.

## Not done (stated, not hidden)

- **Axiom rule 3:** no loom map for the new components yet.
- **Axiom rule 4:** spec addenda and `SPEC-REGISTRY` entries are not written.
- **Tests:** the context-atlas test from the first pass was not ported. It needs the `{atlas}` rename.
- **Learning from the pane:** actions the co-pilot pane runs directly on the driver are not recorded as site memory. Only `clearglass.browser.tool` actions are.
- **Nothing was run live:** not in an Electron window, not against the job APIs, not CDP upload.
- **No full regression:** the full `run-all` comparison against 0.39.271 was not run for this release.
