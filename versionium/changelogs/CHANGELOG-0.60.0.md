# 0.60.0 — 2026-10-12

James: "need it to generate code. not sure why its not using ollama in chunks, but i want to have a intent for the reasoning, to map and plan, then ollama codes in chunks. that way ollama can be as dumb as possible."
· "guardian should detect when a sign in is needed, also when it cant map to the chat, have a compartment os style popup for the chat, to have me sign in or map the dom using the element picker."
· "each phase has to map to the spec and architect/component registry. like i want the conditions to be generated from the intent."
· "the plan panel doesn't need to show all the completed phases at all times. needs a clear button to remove them."
· "needs play, pause and rewind, using the state of the compartment using the rewind engine. like i want to be able to pause the repo activity like the way vmware pauses the state of the vm."
· "always read the code first, the atlas and the .spec. loom map and then map the phases. make sure the right system is being mapped. like having the agents have seperate jobs, and also nexus learning from the agents."

## Why Ollama was not coding

- A phase was cut into one-file chunks only when its ladder **started** on Ollama (`routing.chunk_phases: auto`). With a browser agent first, the whole phase went to that agent in one request.
- Each chunk's brief was the phasemap's prose cut to 2400 characters. The small model still had to work out what the file exports, what it imports and how it fits.
- The only Ollama job in your log was the `rewrite` one: the reword randomizer rephrasing the prompt before it went to ChatGPT/Gemini. It writes no code.

## Plan, then code (PC1, PC2)

A phase build is now two jobs, done by two agents. A third job, the proof, checks the result.

1. **The planner** is a reasoning agent: `routing.planner`, or the first agent on the ladder that is not Ollama. Before it maps anything it is told to read, in this order:
   - the code
   - the system's section of the atlas (README.md)
   - the spec
   - the system's components in the loom map

   It is also given:
   - the component registry: the spec's own `registry` block first, then the repo's code-derived registry
   - components to reuse, matched to the phase by its words
   - what earlier planned builds taught Nexus

   It answers with one JSON plan:
   - the system and what it read
   - the intent
   - every file: the registry component it is, or `new` with its layer; its purpose, imports, exports (names and signatures) and steps
   - the order
   - the **conditions, generated from the intent**

   `lib/phase-plan.js parsePlan` refuses a plan that:
   - leaves a file mapped to nothing
   - leaves out a file the phase names
   - is for another system, or plans a file another system owns
   - has a lower layer importing a higher one, or an import cycle

   A refused plan goes back with its problems, up to `routing.plan_attempts` (default 2). If no plan holds, the phase is built as before and the run says why.
2. **The coder** gets each planned file, in dependency order, as one bare request (no retrieval context, no atlas):
   - the file, and the registry component it is
   - its exact exports and signatures
   - the imports it may use, with what the earlier files *really* export
   - numbered steps, and the fenced block to answer with

   The coder ladder puts Ollama first. Among the Ollama models, the one with the best record on planned files goes first (`lib/plan-learning.js orderCoders`). The browser agents are its fallback.
   A file that comes back without a planned export is **incomplete** ("came back without cachedRead — the plan says it exports it"), so the ladder retries or climbs.
3. **The proof** uses the plan's conditions when the map declares none. The proof row says they were generated from the intent by the planner.

- **The right system.** For all of NEXUS, every file of the phase and every loom tag votes on the system that builds it. Before, the first file's owner decided alone. In a system repo, a vote against the repo's own system is said on the run.
- **Learning.** Nexus reads the phase-run ledger back into each new plan:
  - which coder landed which layer
  - which exports a coder keeps dropping
  - what plans were refused for
  - which files are already built from a plan, and proven: import them, never rewrite them
- **Settings → Routing → Plan, then code:**

| Key | Values |
|---|---|
| `routing.plan_code` | auto (an Ollama model on the ladder) · always · never |
| `routing.planner` | the agent that plans; empty = the ladder's first agent that is not Ollama |
| `routing.plan_attempts` | tries for a plan, 1–5 (default 2) |
| `routing.chunk_phases` | auto · always · never |

  `routing.chunk_phases` and `routing.ladder_learn` were read by the policy since 0.39.361 but never declared. They are declared now.
- **The Plan panel** shows each step of a planned build:
  - who plans and why
  - the system and the vote
  - what the planner was given to read: atlas, loom components, registry size, reuse, lessons
  - the plan: each file → its component and exports, and the conditions
  - why a plan was refused, and the coder order

## Play, pause, rewind (RS1)

`lib/repo-run-state.js` gives each repo one run state, shared by every process through a small file in idearium's data dir.

| Control | What happens |
|---|---|
| ⏸ pause | A Versionium version is taken, the desktop (if running) is checkpointed and paused, and the repo is paused. No agent call starts (the one door, `repo-agent.js dispatch`, waits on the repo's task), no phase attempt starts (a `paused` row on the Plan), and no spec chunk is queued or built (`409 REPO_PAUSED`). A reply already being written finishes, like a VM's in-flight I/O. |
| ▶ play | The desktop resumes and everything waiting goes on where it stopped. |
| ⏮ rewind | Pauses first. Restores the version you pick, or by default the one before the pause, using the existing restore: a pre-restore version is taken, so it can be undone, and the restore is verified against disk. The desktop rewinds to its newest checkpoint at or before that version. The repo stays paused until you press ▶. |

- Routes: `GET /api/repos/:uuid/run` and `POST /api/repos/:uuid/run/:op` (pause | play | rewind `{ commitId? }`). Each act is a row in the repo's log.
- On the repo card: an "activity" bar (▶/⏸, ⏮) above the versions, and ⏮ on each version.
- In the Plan header: ⏸ ▶ ⏮.

## The Plan panel clears what is done (PP1)

**⌫ clear done** takes everything complete off the panel as of that moment:
- the completed steps
- a finished spec build
- a proven proof run
- done plans and file jobs

New work still shows. Nothing is deleted: the runs stay in the ledger and the log. "⌫ N cleared — restore" brings them back. The setting is kept per repo, in this browser.

## Guardian asks for you; Clear Glass shows the tab (GA1)

Provider tabs run hidden. Your Claude tab sat on `claude.ai/login`, the userscript never connected, and the job was cancelled after 45 s with no one able to see why.

- `guardian/lib/provider-attention.js` asks for the person. It asks once per agent and reason within `jobs.attention_cooldown_ms` (2 min), and asks again at once after the agent connects. It asks when:
  - **signin**: a tab reports a sign-in wall or is signed out; or, while a job waits for a tab, Guardian checks the tab's page halfway through the wait and finds a sign-in page or a page off the agent's own site. The job then waits `jobs.signin_wait_ms` (5 min), not 45 s. If it is still not signed in, the job fails as `login`, saying so.
  - **map**: the ladder cannot find the chat's input, send button or reply.
  - **no-connect**: the tab is open but never connects.
- Clear Glass (`clear-glass/src/providers/attention.js`, `POST :7702/providers/:id/attention`) shows the right window. That is the repo's own agent tab when the job is routed to one (its account routing), else the provider's tab. Over the page it lays a COS-style panel you can drag by its title bar:
  - **I've signed in**
  - **pick the input** · **pick send** · **pick the reply**
  - **hide**

  A pick runs the element picker in the page: hover outlines, click chooses, Esc cancels. The selector is checked live and goes to Guardian through `selector-assign.js`, with the same evidence rule as before. Guardian's answer (saved or refused) shows on the panel. When the page moves off the sign-in page, the panel closes, the tab hides again and the userscript connects.

## Tests

- `test-plan-code-run-attention` passes 39/39 and is new. It covers:
  - the plan, the registry mapping, the system refusal, the layer rule and the order
  - the coder's brief and export check
  - the grounded planner prompt and the atlas section
  - the system vote, the loom slice, planMode/coderRungs and the config keys
  - lessons and coder order
  - pause/wait/play, and the gate at the dispatch door
  - attention page states, cooldown and clear
  - Clear Glass's panel and picker against a fake window: shown, picked, sent to Guardian with evidence, hidden; and the repo's own agent tab chosen
  - the wiring
- These still pass:

| Suite | Result |
|---|---|
| `test-pipeline-routing` | 19/19 |
| `test-phases-tab` | 5/5 |
| `test-repo-activity` | 24/24 |
| `test-one-idearium-phases-nodes` | 21/21 |
| `test-readme-atlas` | 1/1 |
