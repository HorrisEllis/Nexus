# copilot — Sovereign Co-Pilot System

> **v3.7.0 (active)** · port 3750 · intelligence, separated deliberately from guardian's dispatch · **user guide below (0.39.280)**

**Author:** James Brooks (Erosmancer) · rheon.world

---

## What It Is

Copilot receives intent, assembles context, routes to RAID, and returns a response — the intelligence layer, kept separate from Guardian's dispatch layer on purpose. Its own spec: *"Guardian is dispatch. Co-pilot is intelligence. They are separate. If Guardian goes down, the co-pilot can still answer from Cortex memory."* Every exchange is tracked hook-to-hook through CFR.

---

## Quick Start — the user guide (0.39.280)

James: *"update the copilot atlas immensely to expand it, so i can use it as a user guide … its meant to be the ais
browser, for me to have agents and copilot do an immense amount of things, mostly automate job listings … i want to use
clearglass to help earn, automate, and learn."* This section is that guide. Everything named here exists in the tree;
what it cannot do yet is said plainly at the end.

### 1. What the co-pilot is

Two faces of one idea:

- **The co-pilot service** — `copilot/server.js` on :3750. It answers from Cortex memory, classifies what you want
  (`copilot/intents.js`), runs NEXUS agent tools (`copilot/tool-runtime.js`), and can hand a question to Ollama or a
  Guardian browser agent (ChatGPT, Claude, Gemini, Perplexity, DeepSeek).
- **The co-pilot pane in Clear Glass** — the right-hand panel of every Clear Glass window
  (`clear-glass/renderer/browser.js`, commands in `clear-glass/renderer/copilot-cli.js`). It is the same co-pilot, but
  it sits *inside the browser*: it can see the page (DOM, picks, cookies — the chips under the input) and drive it
  (`clear-glass/src/copilot/bridge.js` → `clear-glass/src/driver/index.js`). This is "the AI's browser".

The pane's four switches at the top choose **who answers**: **ollama** (local, free, small), **copilot** (the service
picks), **guardian** (a browser agent — best for writing and reasoning), **clear_glass** (the pane's own hat/persona).

### 2. Talking to it — plain words first

| You type | What happens |
|---|---|
| **visit google.com** · **go to indeed.com** · **open https://www.upwork.com/nx/find-work/** | The browser goes there **without asking a model**, then answers with the page title, its address and a numbered list of what you can click or type into (`clear-glass/src/copilot/verbs.js`, 0.39.280). |
| **import my archives** · **/import-archives** · **load the nexus zips** | Opens idearium's archive drop box (`archive-import.html` on idearium's port) in the pane's browser **without asking a model**. Drop NEXUS release zips or a folder there; *Check the order*, then *Import* runs `cli/import-history.js` as a background job (0.39.284, N30; archiveImportIntent in `clear-glass/src/copilot/verbs.js`, checked before *visit*). |
| **open indeed.com and find remote support jobs** | Goes there first, then the model gets your request **with that page in hand**. |
| **click #3** · **type "remote" into #2** · **press Enter** | The model turns it into a driver command; the pane shows which one ran, e.g. **[driver: click #3]**. A command the model wrote badly is repaired, or reported as unreadable — never silently skipped. |
| **what does this form want?** | It reads the page (readPage) and answers. |
| **hey nexus, what jobs are queued?** | Asked inside a provider chat (ChatGPT, Claude…), the answer comes back as the next message (`guardian/lib/wake-loop.js`). |

### 3. Slash commands in the pane

**/help** · **/status** (route, hat, context, auto-run, tab) · **/backend ollama|copilot|guardian** · **/agent chatgpt|claude|…**
· **/hat on|off** · **/forge** (make the pane's hat a real one) · **/persona <text>** · **/ctx dom|picks|cookies on|off** ·
**/go <url or search>** · **/back** **/forward** **/reload** · **/run <n>|all** (run proposed commands when auto-run is off) ·
**/site [key] [value]** (per-site settings) · **/macro list** · **/macro run <name> key=value …** · **/cookies** · **/history** ·
**/clear** · **/new** (fresh conversation; the old one is kept) · **/settings** · **/build …** **/diagnose …** (sent to NEXUS).

### 4. What it can do in the page

The driver's verbs (`clear-glass/src/copilot/bridge.js` **DRIVER_ACTIONS**): navigate, click, type, setValue, select,
check, upload, pressKey, scroll, hover, wait/waitFor, screenshot, readPage, findInPage, cookies and storage get/set,
network block/intercept, record start/stop, and the interaction field (0.39.279, `clear-glass/src/page/field.js`):

- **field** — every clickable/typeable thing on screen, numbered, with x/y and whether something covers it;
- **pointer** — move and click like a person (a curved path; natively, or through ErosmancerOS **/api/input**);
- **spotlight** — a ring and a label on what it is about to touch, so you can watch it work;
- **at x,y** — what is actually under a point.

### 5. Recipes

**Job listings (the main one).**
1. **/backend guardian** and **/agent chatgpt** — a strong writer for cover letters; **ollama** is fine for clicking.
2. **open indeed.com and search remote customer support jobs in my area** — it goes, types, and lists the results it sees.
3. **open #4 and tell me if I qualify** — it reads the listing against what it knows about you (Cortex memory).
4. **fill the application with my details, stop before submit** — it fills the fields and waits; **you** press submit.
5. Repeat a flow you do often as a **macro**: record it once (Settings → Macros, `clear-glass/src/macros/recording.js`),
   then **/macro run apply_indeed title=… company=…**. A macro can be a scheduled **workflow**
   (`clear-glass/src/automation/cron.js`) — e.g. every morning: open three job sites, collect new listings.
6. Everything the chat writes is kept: each conversation streams live into the Downloads manager as a chat ledger
   (`clear-glass/src/downloads/chat-ledger.js`) — nothing is lost if a tab closes.

**Freelance work through Idearium (Fiverr / Upwork).**
1. A client's brief becomes an **idea**, then a **spec** in Idearium.
2. On the Spec tab press **▶ Build this spec**: the repo's agent splits the whole build into phases — bottom-up, chunked,
   with the axioms (`idearium/repo/spec-plan.js`) — and **▶ Build next** builds them one by one, each after a Versionium
   snapshot, so any step can be undone.
3. Follow it in the **plan** panel (gates as progress, every run's ledger — `idearium/ui/js/plan-panel.js`).
4. A single file needs work? Files tab → **manage ▾**: expand, iterate, refactor, rebuild, debug, test, document, review,
   explain — on the whole file or the lines you selected (`idearium/ui/js/file-manage.js`).
5. Deliver: Sync & CI tab → push to the client's GitHub, or export a .zip from Settings.

**Learning.** Ask the pane about the page you are reading; **hey nexus** from any provider chat for NEXUS's own state; the
atlases (this one and `clear-glass-atlas.md`) open from the Nexus repo's Home tab.

### 6. When something fails

| You see | It means | Do |
|---|---|---|
| "Could not open …" | the address did not load | check the address; **/reload** |
| **[driver: unreadable — reported]** | the model wrote a command the browser cannot read | say it again more plainly, or use **/go**, **click #n** |
| a job "waiting: chatgpt needs you to sign in" | the provider's tab is behind a login (`guardian/lib/provider-login.js`) | open that tab in Clear Glass and sign in once; the job continues |
| "Mesh [x] error: no real agent response" | that provider's tab is not open or not signed in | open it, or switch **/agent** |
| a captcha | the captcha-pause plugin stops the automation for you | solve it; it resumes |

### 7. Honest limits

- A small local model (Ollama 3B) clicks and reads well but writes poorly; use a Guardian agent for writing.
- NEXUS never types your passwords. Signing in is yours (Clear Glass's own password manager can fill it for you).
- It will not press "submit" on an application unless you tell it to — on purpose.

---

## Architecture

### Boundaries (documentation clarity)

| Term | Definition | Distinguished from |
|---|---|---|
| Copilot | intelligence — assembles context, classifies intent, can answer from Cortex memory alone | **guardian** — dispatch: routes to a provider and returns the raw result. See `guardian-atlas.md`'s own Boundaries entry, the same distinction from the other side |

---

## The Modules

---

### One exchange, request to response (copilot/server.js)

**id:** **copilot.request-response**

**What it does**

Handles one exchange end to end: receives a **CopilotRequest**, classifies intent, assembles up to 7 context layers, and returns a **CopilotResponse** naming exactly which component/hook handled it and how many tokens were used.

**Real schemas**, from `copilot.spec`'s **core.schemas**:

```
CopilotRequest:  { uuid (requestId), sessionId, prompt, channel, channelName,
                    uiState (NEXUS_UI_STATE snapshot from browser), ts }

CopilotResponse: { requestId, ok, text, modelUsed ('data-only'|'ollama'|'claude'|'chatgpt'|...),
                    intent, fromGrammar, componentId, hookId, tokensUsed,
                    contextLayers (0-7), ui (optional spotlight/navigate instructions), ts }

CopilotSession:  { sessionId, userId, channel, startedAt, ... (not fully read) }
```

**fromGrammar** is worth noting: it's a boolean flag distinguishing a response the grammar/router answered deterministically from one that actually reached a model — a real, cheap way to tell "did this need AI at all" from the response shape alone.

**Commands / How to use it / HTTP routes**

Not read this session — only **meta** and the start of **core.schemas** were pulled.

**What it connects to**

- **guardian** — dispatch target once intent is classified and context assembled
- **cortex** — memory fallback when guardian is unavailable

**Bus events emitted**

Not read this session.

---

## Modules Not Yet Built

Not determined — this spec's **gaps**/**history** sections not read this session.

---

## Version History

**Source:** NOT YET WIRED TO VERSIONIUM — hand-maintained below. This
is a real gap, not a neutral state: Versionium's own purpose is to be
the automatic, live source for every system's version history via
**GET /api/versionium/history?system=copilot**. Whether copilot actually
reports to Versionium was not checked this session — flagged as an
open question, not assumed either way.

Not read this session.

---

<!-- generated:registry:start -->

## What the registry knows (generated)

> Generated by `scripts/generate-atlases.js` from loom's registry and events (loom/data/registry.json, loom/data/events.json — data, outside the snapshot, so written plain) and the tree itself, 2026-10-05. Everything between the markers is rewritten on the next run — write narrative above them. The same facts, one component at a time, are what `lib/registry-harness.js` hands a repo agent (loom.card.tool).

**62** files · **43** code files · **81** registry components declared here · **1** events emitted · **0** heard · **81** routes · **10** code files with a covering test

### Routes (81)

- DELETE /api/opportunity/answers/:id — Remove an answer · declared in `copilot/registry-components.js`
- DELETE /api/opportunity/templates/:id — Reset a drafting template to its default · declared in `copilot/registry-components.js`
- GET /api/activity — What copilot has been up to (?hours=, ?since=, &text=1) · declared in `copilot/registry-components.js`
- GET /api/agent/current — Which agent copilot is wearing now · declared in `copilot/registry-components.js`
- GET /api/agent/suite — The current agent and every hat · declared in `copilot/registry-components.js`
- GET /api/agents/capability — Per-agent limits MEASURED from real outcomes, with the basis attached — declared vendor figures are marked unverified · declared in `copilot/registry-components.js`
- GET /api/axioms — List all axioms · declared in `copilot/registry-components.js`
- GET /api/context/:id — The context snapshot copilot would send for a session · declared in `copilot/registry-components.js`
- GET /api/context/directory — Every memory system and graph: tables, row counts, what each is, which tool reads it · declared in `copilot/registry-components.js`
- GET /api/context/get — The whole record behind a context hit (?source=&id=) · declared in `copilot/registry-components.js`
- GET /api/context/search — One search across every memory system and graph (?q=&sources=&limit=&repoDir=) · declared in `copilot/registry-components.js`
- GET /api/diagnose/list — List past diagnosis sessions · declared in `copilot/registry-components.js`
- GET /api/introspect/health — Which introspection signals are readable right now, and which are blind · declared in `copilot/registry-components.js`
- GET /api/lifeline/health — Lifeline provider health · declared in `copilot/registry-components.js`
- GET /api/opportunity/:id — One opportunity with its ledger and policy · declared in `copilot/registry-components.js`
- GET /api/opportunity/answers — The answer bank for application questions · declared in `copilot/registry-components.js`
- GET /api/opportunity/list — List opportunities (?stage=&kind=&q=&limit=) · declared in `copilot/registry-components.js`
- GET /api/opportunity/profile — The job profile: skills, roles, floor, sources, per-platform policy · declared in `copilot/registry-components.js`
- GET /api/opportunity/sources — Source types (public job APIs) and the configured sources · declared in `copilot/registry-components.js`
- GET /api/opportunity/status — Job/freelance pipeline: counts per stage and what waits on James · declared in `copilot/registry-components.js`
- GET /api/opportunity/templates — Drafting templates (editable; placeholders are data) · declared in `copilot/registry-components.js`
- GET /api/person-model/chain — Session hash-chain integrity — reports breaks, attributed to the session · declared in `copilot/registry-components.js`
- GET /api/person-model/export — Everything held about the user, in one object · declared in `copilot/registry-components.js`
- GET /api/person-model/health — Person-model stats + chain state · declared in `copilot/registry-components.js`
- GET /api/person-model/meaning — Meaning-web lens — a projection over the lattice, not a nested graph · declared in `copilot/registry-components.js`
- GET /api/person-model/portrait — Lens reading of the user model — always carries provenance and lens coverage (§LN-7) · declared in `copilot/registry-components.js`
- GET /api/person-model/review — Observations the co-pilot has proposed about the user — pending, never claims (§IP-5) · declared in `copilot/registry-components.js`
- GET /api/prompt/resolve — Which backend a prompt with no backend would go to · declared in `copilot/registry-components.js`
- GET /api/queue/health — Every work queue's health · declared in `copilot/registry-components.js`
- GET /api/sessions — Active co-pilot sessions · declared in `copilot/registry-components.js`
- GET /api/sessions/:id — One session (404 when unknown) · declared in `copilot/registry-components.js`
- GET /api/stream — Query the continuous event stream · declared in `copilot/registry-components.js`
- GET /api/tools/list — Every registered tool, grouped, in plain language (?q= search, ?scope= marks a caller's scope) · declared in `copilot/registry-components.js`
- GET /contract — Co-pilot interaction contract · declared in `copilot/registry-components.js`
- GET /events — Server-sent events for the copilot UI · declared in `copilot/registry-components.js`
- GET /health — Co-pilot health · declared in `copilot/registry-components.js`
- GET /ledger/stream — Canonical component-ledger rows as SSE — the cross-process wire autopilot consumes · declared in `copilot/registry-components.js`
- POST /api/agent/switch — Switch the worn agent/hat, then check it is reachable · declared in `copilot/registry-components.js`
- POST /api/agents/calibrate — Binary-search an agent’s real input limit from live probes — NOT SERVED: no live probe is wired · declared in `copilot/registry-components.js`
- POST /api/axioms/add — Add a runtime axiom · declared in `copilot/registry-components.js`
- POST /api/axioms/remove — Remove a runtime axiom · declared in `copilot/registry-components.js`
- POST /api/build — Build a new module from description · declared in `copilot/registry-components.js`
- POST /api/channel — Set the channel on every session · declared in `copilot/registry-components.js`
- POST /api/diagnose — Start recursive fractal diagnosis · declared in `copilot/registry-components.js`
- POST /api/event — Add one event to the stream · declared in `copilot/registry-components.js`
- POST /api/introspect — Examine the last answer against REAL signals — reflection score, contract shape, gaps, ledger. Never the model’s own opinion · declared in `copilot/registry-components.js`
- POST /api/introspect/retry — Re-ask carrying the SPECIFIC finding that rejected the last answer, not "try again" · declared in `copilot/registry-components.js`
- POST /api/observe — A UI confusion signal into the user model · declared in `copilot/registry-components.js`
- POST /api/opportunity/:id/approve — James approves an application (user-only; approves the answers it used) · declared in `copilot/registry-components.js`
- POST /api/opportunity/:id/dismiss — Dismiss an opportunity · declared in `copilot/registry-components.js`
- POST /api/opportunity/:id/draft — Draft cover letter / proposal / Fiverr reply / follow-up from the editable templates · declared in `copilot/registry-components.js`
- POST /api/opportunity/:id/mark — Record a response: RESPONDED / INTERVIEW / OFFER / REJECTED / ARCHIVED · declared in `copilot/registry-components.js`
- POST /api/opportunity/:id/prepare — Open the application in Clear Glass and fill it; stops before submit · declared in `copilot/registry-components.js`
- POST /api/opportunity/:id/prepare-reply — Type the approved reply into a Fiverr/Upwork thread; stops before send · declared in `copilot/registry-components.js`
- POST /api/opportunity/:id/submit — James submits a prepared application (presses the button, checks for confirmation) · declared in `copilot/registry-components.js`
- POST /api/opportunity/answers — James adds an approved answer · declared in `copilot/registry-components.js`
- POST /api/opportunity/answers/:id/approve — Approve a drafted answer for reuse · declared in `copilot/registry-components.js`
- POST /api/opportunity/capture — Capture the job/gig/message open in a Clear Glass tab into the pipeline · declared in `copilot/registry-components.js`
- POST /api/opportunity/cycle — Fetch sources, score, shortlist, draft the top N, due follow-ups · declared in `copilot/registry-components.js`
- POST /api/opportunity/followups — Mark submitted applications with no response past followUpDays and draft follow-ups · declared in `copilot/registry-components.js`
- POST /api/opportunity/import-resume — Read a resume (.pdf/.docx/.txt/.md) into the profile; suggests skills · declared in `copilot/registry-components.js`
- POST /api/opportunity/profile — Update the job profile (merge) · declared in `copilot/registry-components.js`
- POST /api/opportunity/rescore — Re-rank everything not yet past SHORTLISTED after a profile change · declared in `copilot/registry-components.js`
- POST /api/person-model/accept — USER-ONLY. Promotes an observation to a stated claim. No agent path exists (§IP-5) · declared in `copilot/registry-components.js`
- POST /api/person-model/connect — Typed edge between two model nodes — supports/tensions/causes/co_occurs · declared in `copilot/registry-components.js`
- POST /api/person-model/correct — Correct a person-model node · declared in `copilot/registry-components.js`
- POST /api/person-model/forget — Archives a node with a required reason (§0.3 — never a silent delete) · declared in `copilot/registry-components.js`
- POST /api/person-model/purge — HARD DELETE of the whole model. Requires an explicit confirmation string · declared in `copilot/registry-components.js`
- POST /api/person-model/reject — Rejects a proposed observation. A reason is required (§IP-6) · declared in `copilot/registry-components.js`
- POST /api/person-model/state — The user states something about themselves — the ONLY route into trigger/sensitive/boundary · declared in `copilot/registry-components.js`
- POST /api/prompt — Primary entry — all co-pilot interactions · declared in `copilot/registry-components.js`
- POST /api/prompt/fulfill — Adaptive iteration — RAID-routed, fault-classified, reflection-scored (§15.1-15.3) · declared in `copilot/registry-components.js`
- POST /api/prompt/stream — Streaming SSE prompt — token-by-token, no timeout (P112) · declared in `copilot/registry-components.js`
- POST /api/prompt/tools — A prompt with the full tool loop (all 109 tools unless a scope is given) · declared in `copilot/registry-components.js`
- POST /api/reword — Reword a text (lib/reword) · declared in `copilot/registry-components.js`
- POST /api/stream/ingest — Push events into co-pilot stream · declared in `copilot/registry-components.js`
- POST /api/tools/run — Run one tool through executeTool (config gate, fault history, event log); refused outside the caller's scope · declared in `copilot/registry-components.js`
- POST /bridge/deliver — Delivery from the retired Bridge path — still called · declared in `copilot/registry-components.js`
- PUT /api/opportunity/:id/draft/:kind — James edits a draft; the edit is what gets used · declared in `copilot/registry-components.js`
- PUT /api/opportunity/recipes/:host — Per-site selectors: replySelector, submitSelector · declared in `copilot/registry-components.js`
- PUT /api/opportunity/templates/:id — Edit a drafting template · declared in `copilot/registry-components.js`

### Events it emits (1) — and who hears them

- **copilot.error.detected** — from `copilot/lib/expectation-watcher.js` → `orchestrator/orchestrator.js` (orchestrator), `tests/modules/expectation-watcher.test.js` (core), `tests/modules/ui-self-diagnosis.test.js` (core)

### Files, directory by directory (8 directories)

#### `copilot/`

24 code · 2 other file(s).

- `copilot/adaptive-fulfillment.js` (157 lines)  
  exports fulfill
- `copilot/adversarial.js` (233 lines) — copilot/adversarial.js ADVERSARIAL — tests and validates the other two cognition faculties.  
  exports run, pingIntuition, pingAnalysis, pingBoth, start, stop +3 · requires 1 · required by 1 · tested by `tests/modules/copilot-adversarial-consolidation.test.js`, `tests/modules/test-agent-hat-agnostic.test.js`
- `copilot/analysis.js` (234 lines) — copilot/analysis.js ANALYSIS — slow, derivation-based cognition.  
  exports answer, assembleContext · requires 2 · required by 0 · tested by `tests/modules/test-agent-hat-agnostic.test.js`
- `copilot/assist-loop.js` (75 lines) — P10 of the bridge phases §PHASEMAP P10 (docs/raid-warp-verification-phasemap.spec Part II) — diagnose +  
  exports createAssistLoop, _composeMessage
- `copilot/axiom-manager.js` (252 lines) — copilot/axiom-manager.js spec: docs/copilot-expansion.spec  
  exports list, add, remove, freeze, check, summary +3 · requires 1 · required by 3
- `copilot/capability-extend.js` (73 lines) — CA4 of the awareness/routing phasemap §PHASEMAP CA4 (docs/copilot-awareness-routing-phasemap.spec, CHUNK B). "No is  
  exports extendCapability, shouldExtend, MODULE_ID, VERSION
- `copilot/cli.js` (626 lines)  
  exports start, run, exec, MODULE_ID, VERSION · requires 2 · required by 1
- `copilot/config.js` (57 lines) — real, distinct config, not inline constants scattered across copilot/server.js. Matches the pattern established  
  exports RECALL_CONTEXT_TOP_K, explicit · requires 1 · required by 1
- `copilot/diagnostic-sweep.js` (87 lines) — OB2 of the observability/tablet phasemap §PHASEMAP OB2 (docs/nexus-observability-tablet-phasemap.spec, CHUNK E). Where  
  exports sweep, MODULE_ID, VERSION · requires 1 · required by 0
- `copilot/diagnostics.js` (110 lines) — OB1 of the observability/tablet phasemap §PHASEMAP OB1 (docs/nexus-observability-tablet-phasemap.spec, CHUNK E). Expands  
  exports diagnose, diagnoseText, MODULE_ID, VERSION · requires 3 · required by 4
- `copilot/event-taxonomy.js` (24 lines) — // copilot/event-taxonomy.js — every event the co-pilot emits, in the ET1 shape (lib/event-taxonomy-pattern.js). // component_id: copilot.event-taxonomy
- `copilot/intents.js` (211 lines) — the four missing copilot intents §GAP CLOSED 2026-07-07 — copilot's primary hook  
  exports classifyIntent, route, handleNavigate, handleNote, handleTool, handleAction +1 · requires 2 · required by 0
- `copilot/intuition.js` (269 lines) — copilot/intuition.js spec: docs/contract-queue.spec  
  exports answer, contextSummary · requires 2 · required by 0 · tested by `tests/modules/test-agent-hat-agnostic.test.js`
- `copilot/lifeline.js` (726 lines) — copilot/lifeline.js spec: docs/copilot-expansion.spec  
  exports route, health, MODULE_ID, VERSION, CONFIDENCE_THRESHOLD, extractExplicitAgent +3 · requires 3 · required by 6 · tested by `tests/modules/copilot-confidence.test.js`, `tests/modules/lifeline-fluid-routing.test.js` +1
- `copilot/module-builder.js` (738 lines) — copilot/module-builder.js spec: docs/copilot-expansion.spec  
  exports build, map, generateSpec, runQC, registerCliCommand, _resolveExistingTarget +2 · requires 8 · required by 0
- `copilot/movement-map.js` (126 lines) — OB3 + OB4 of the observability/tablet phasemap §PHASEMAP OB3 + OB4 (docs/nexus-observability-tablet-phasemap.spec, CHUNK F).  
  exports buildMovementGraph, detectBottlenecks, _registryNodes, _frictionFor, MODULE_ID, VERSION · requires 3 · required by 2
- `copilot/optimizer.js` (77 lines) — OB7 of the observability/tablet phasemap §PHASEMAP OB7 (docs/nexus-observability-tablet-phasemap.spec, CHUNK H). Uses the  
  exports propose, MODULE_ID, VERSION · requires 5 · required by 0
- `copilot/recursive-diagnose.js` (189 lines) — copilot/recursive-diagnose.js Fractal/recursive diagnosis engine.  
  exports start, list · requires 1 · required by 0
- `copilot/registry-components.js` (223 lines) — // 0.39.257 — the tool catalog in plain language, and one tool run through the same gate as the loop (idearium /tools, /debug)  
  exports systemId, version, port, label, purpose, components +2 · requires 0 · required by 1
- `copilot/repair-on-prompt.js` (85 lines) — P11 of the bridge phases (the capstone) §PHASEMAP P11 (docs/raid-warp-verification-phasemap.spec Part II) — the full  
  exports createRepairOnPrompt
- `copilot/server.js` (2946 lines) — Sovereign Co-pilot System Port: 3750  
  exports server, streamIngest, _resolveIntuitionResponse, extractDispatchText, resolveDefaultBackend · requires 9 · required by 1 · tested by `tests/modules/copilot-adversarial-wire.test.js`, `tests/modules/copilot-handshake-dispatch.test.js`
- `copilot/stream-digest.js` (12 lines) — re-export of the shared stream digest §PHASEMAP P7 2026-07-30 — the normalizer + StreamDigest class moved to  
  requires 1 · required by 0
- `copilot/system-status.js` (86 lines) — CA1 of the awareness/routing phasemap §PHASEMAP CA1 (docs/copilot-awareness-routing-phasemap.spec). When the user  
  exports pollStatus, statusReport, isStatusQuery, MODULE_ID, VERSION
- `copilot/tool-runtime.js` (592 lines) — P1 of the omniscience phasemap §PHASEMAP P1 (docs/copilot-omniscience-phasemap.spec). Wires the SOVEREIGN  
  exports run, runViaAgent, makeOllamaCallModel, makeNcpCallModel, fillToolPlaceholders, formatToolResult +4 · requires 1 · required by 4 · tested by `tests/modules/test-nexus-self-and-cos-run.test.js`
- other: `copilot/compartment.json`, `copilot/interaction-contract.json`

#### `copilot/lib/`

14 code file(s).

- `copilot/lib/activity-recall.js` (244 lines) — "what have you been up to?", answered from records. §0.39.267 — James: "i want to be able to talk to copilot and ask what its been up to."  
  exports recall, format, answer, matches, windowFrom, ACTIVITY_RE +2 · requires 5 · required by 2
- `copilot/lib/autonomy-router.js` (247 lines)  
  exports route, checkPending, _resetForTest, MODULE_ID, VERSION
- `copilot/lib/capabilities.js` (70 lines) — co-pilot's real toolbox (§P4 slice) James: "if I ask him what he can do, I want a full list of tools and  
  exports whatCanIDo, capabilitiesForSystem, MODULE_ID, VERSION
- `copilot/lib/copilot-context.js` (446 lines) — lib/copilot-context.js — Co-pilot Complete System Awareness Nine sensing layers — from raw events to predictive intent, the browser and the opportunity pipeline (L7-L8 0.39.272).  
  exports assemble, MODULE_ID, VERSION · requires 2 · required by 0
- `copilot/lib/descriptor-projector.js` (189 lines) — lib/descriptor-projector.js — Phase 40 T1.5: Descriptor Projections One descriptor → six projections, all zero-LLM:  
  exports project, projectAll, MODULE_ID, VERSION · requires 0 · required by 4
- `copilot/lib/expectation-watcher.js` (207 lines) — gated interaction event listeners "Co-pilot tracks errors from expected events and gated interaction  
  exports createExpectationWatcher, DEFAULT_EXPECTATIONS · emits copilot.error.detected · tested by `tests/modules/expectation-watcher.test.js`, `tests/modules/ui-self-diagnosis.test.js`
- `copilot/lib/grammar-router.js` (205 lines) — the dynamic grammar engine, in the mind (§P5) James: "expand P5 exponentially — dynamic grammar engine." There already IS one  
  exports route, ensureLoaded, describeGrammar, _reset, _isKnownMisfirePattern, _buildEscalatedIndex +2 · tested by `tests/modules/grammar-router-closed-loop.test.js`
- `copilot/lib/inject-config.js` (180 lines) — // copilot/lib/inject-config.js — real, editable configuration for // copilot's five real context-injection sites, as real .inject_rule  
  exports seedDefaultInjectRules, getInjectRule, DEFAULT_RULES, NODES_DIR, MODULE_ID · requires 4 · required by 1
- `copilot/lib/intent-learning.js` (88 lines)  
  exports getConfidence, recordOutcome, allPatterns, TABLE, MODULE_ID, VERSION
- `copilot/lib/lifeline-contracts.js` (90 lines)  
  exports CONTRACTS, getContract, validateResponse, MODULE_ID, VERSION
- `copilot/lib/nexus-awareness.js` (123 lines) — co-pilot's model OF nexus (§P4 completion) James: "I want to be able to ask co-pilot anything about cortex, models, the  
  exports systemRundown, whatsWrong, answerAbout, clearGlassState, opportunityState, memoryDirectory +3
- `copilot/lib/reword.js` (82 lines) — copilot's semantic randomizer: what a job says, reworded every time, same meaning. §0.39.265  
  exports reword, PROMPT · requires 2 · required by 0
- `copilot/lib/self-model.js` (625 lines) — co-pilot's identity, governance, and the NEXUS model in cortex (§P5 who-am-I + §P6 governance/agent-switch foundation)  
  exports whoAmI, recordIdentityEvidence, governAction, switchAgent, navigateAgentToUrl, verifyAgentReachable +7 · requires 0 · required by 2
- `copilot/lib/user-model.js` (645 lines) — lib/user-model.js — Phase 12: User Model as Hypotheses Phase: 12  
  exports init, stop, observe, recordChannelVisit, recordIntent, recordError +16 · requires 4 · required by 3 · tested by `tests/modules/test-user-model-radiate.js`, `tests/modules/user-model.test.js`

#### `copilot/lib/person-model/`

2 code file(s).

- `copilot/lib/person-model/index.js` (433 lines) — // ───────────────────────────────────────────────────────────────────────────── // copilot/lib/self-model/index.js — the model the co-pilot builds of you  
  exports startSession, endSession, verifyChain, state, observe, infer +24 · requires 3 · required by 1
- `copilot/lib/person-model/lattice.js` (367 lines) — // ───────────────────────────────────────────────────────────────────────────── // copilot/lib/self-model/lattice.js — one flat lattice, many lenses  
  exports Lattice, LENSES, read, NODE_TYPE, EDGE_TYPE, VERDICT +9 · requires 0 · required by 1

#### `copilot/output/`

1 other file(s).

- other: `copilot/output/.gitkeep`

#### `copilot/routes/`

2 code file(s).

- `copilot/routes/opportunity.js` (114 lines) — /api/opportunity/* and /api/context/* on copilot port 3750. 0.39.272. The HTTP door to lib/opportunity (jobs, gigs, Fiverr/Upwork leads) and lib/context-atlas (every memory system and  
  exports handle, startScheduler, ROUTES, _match · requires 2 · required by 0 · tested by `tests/modules/test-opportunity.test.js`
- `copilot/routes/person-model.js` (92 lines) — copilot/routes/person-model.js All /api/person-model/* routes — the co-pilot's model of the USER  
  exports handle · requires 1 · required by 0

#### `copilot/schemas/`

1 code · 13 other file(s).

- `copilot/schemas/index.js` (51 lines) — // copilot/schemas/index.js — copilot's own, fully sovereign schema registry. //  
  exports get, list, SCHEMAS, MODULE_ID, VERSION · requires 1 · required by 0
- other: 13 files (.capability, .command, .component, .hook, .inject_rule, .injection, .input, .intent)

#### `copilot/spec/`

2 other file(s).

- other: `copilot/spec/copilot.node-taxonomy.md`, `copilot/spec/copilot.spec`

#### `copilot/ui/`

1 other file(s).

- other: `copilot/ui/person-model.html`

<!-- generated:registry:end -->

---

## Copyright

Copyright © 2026 James Brooks (Erosmancer). Part of the rheon.world / NEXUS ecosystem.


## **/api/prompt** passes the Ollama model on (3.5.2, v0.39.253)

The **backend: 'ollama'** branch of **/api/prompt** called **lifeline.dispatchToOllama** without **body.model**, so a caller's chosen model never reached the bridge. **_tryOllama** already sends **opts.model** to **/api/jobs**. It is now passed, trimmed, for Ollama only; unset sends nothing, so the bridge's default applies as before. The reply carries **model_used**. The caller is idearium's per-compartment Ollama model (idearium atlas, 4.6.0).

## Callers get the tool loop; failed rounds stay failures (3.6.0, v0.39.257)

- **POST /api/prompt with body.tools** (**{ scope: 'all' | [names], identity, repoDir, maxIterations }**) runs the real tool loop for the chosen backend: **runViaAgent** for a browser agent, **run** for Ollama.
  - The scope is enforced (**runToolLoop** **allowedTools**).
  - The caller's identity replaces "the NEXUS co-pilot".
  - **context.repoDir** roots the file tools (`lib/agent-tools/tool-root.js`).
  - The reply carries **toolCallLog** and **tools**.
  - Without **body.tools**, nothing changes. Idearium's repo agent is the first caller.
- ****GET /api/tools/list**:** `lib/agent-tools/tool-catalog.js`. Every tool is in a named group, with its plain summary and the guide's "when to use"; **?q** searches and **?scope** marks what is in scope.
- ****POST /api/tools/run**:** one tool through **executeTool**, refused outside the caller's scope.
- **Fixed: a failed round was returned as the answer.** When a round's dispatch failed, the loop returned the text **[NCP dispatch failed — no response …]** as its answer. Now:
  - the round carries guardian's reason (its gate sentence) and the **jobId**;
  - **runToolLoop** ends the run as a failure, and **/api/prompt** answers 502 with the **jobId**;
  - lifeline's explicit-agent path returns the failure instead of re-sending the prompt as a new job.
- **Tests no longer write **.injection** nodes into the real tree:** they now follow `lib/test-sandbox.js`.
