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
