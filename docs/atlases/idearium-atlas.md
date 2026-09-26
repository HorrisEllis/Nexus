# idearium — Spec Engine, Repo System, and Template Pipeline

> **status: active, deeply explored this session** · no single `idearium.spec` read in full — this atlas is assembled from many real files read across the session, not one authoritative source

**Author:** James Brooks (Erosmancer) · rheon.world

---

## What It Is

Idearium is NEXUS's spec-authoring and repo-management system: it turns an idea into a scaffolded project (via chunked spec generation or file-tree-first planning), ingests existing repos into a chunked, queryable index, and tracks projects with real per-project metadata including an `atlas.json` this session's own `nexus-atlas.md` hooks into directly.

---

## File Structure

```
idearium/
  spec-engine/
    index.js                  real, 1739 lines read — chunk manifest, dependency-gated build order
    chunk-dispatch.js           real — retry/verification ladder (QueueCompartment + Detector)
    blocks.yaml                    real — the 10 real spec sections, per-block agent routing
    templates/
      genesis.spec                  real, 611 lines read in full — the sovereign-system grammar
      *.spec (9 more)                  real per-file existence; not all read
  data/
    projects/<repo-id>/
      atlas.json                       real — per-project file/component index (see nexus-atlas.md's hook)
      README.md, src/, verification.json   real, confirmed in zip listing
    specs/<uuid>/
      manifest.json                       real, full chunk-manifest shape read (see Modules below)
lib/
  file-tree-plan.js             real, 14KB, read — COS-template + agent-planned file tree, built 2026-09-21
cos/
  archetype/registry.js           real — 16 built-in archetypes, exact shape our own architecture-spec archetype matches
```

**Real correction to this session's own earlier work:** an earlier turn in this session referenced `idearium/data/projects/<repo-id>/manifest.json` as if it were the real per-project manifest shape. That path does not exist. The real manifest shape lives at `idearium/data/specs/<uuid>/manifest.json` — confirmed by direct extraction attempt this session, which failed for the assumed path and succeeded for the correct one. Recorded here so the mistake doesn't propagate further.

---

## The Modules

---

### spec-engine (chunk manifest + dispatch)

**id:** `idearium.spec-engine`

**What it does**

Builds a spec as a set of chunks — either the 10 standard document sections (`meta`/`purpose`/`axioms`/`schema`/`api`/`events`/`integration`/`failure_modes`/`build_order`/`tests`, defined in `blocks.yaml`) or, since 2026-09-21, a file-tree-first spec where each chunk IS a real project file.

**How it works internally**

`SPEC_SECTIONS` loads from `blocks.yaml`, which assigns a default AI agent per block (`meta`→ollama, `axioms`→claude, `schema`→deepseek, `api`→claude, `events`→ollama, `integration`→gemini, `failure_modes`→claude, `build_order`→ollama, `tests`→deepseek). Each chunk has a real state machine (`CHUNK_STATES`: PENDING/BUILDING/COMPLETE/FAILED/ESCALATED). `getNextChunk()` only returns a chunk whose `dependsOn` are all COMPLETE — a real, confirmed gap: if a `dependsOn` references a `sectionId` that never resolves, the chunk sits PENDING forever with nothing surfaced, the same silent-orphan failure class `architecture-spec`'s own lattice compiler exists to catch loudly instead.

Real content-addressing: `_hashChunk()` computes `sha256({sectionId, content})` per chunk; `rootHash` is the hash of all chunks' ordered `(sectionId, hash)` pairs — a real Merkle-style integrity check, confirmed working this session (not just described).

`chunk-dispatch.js` wraps the actual agent call in a real retry/verification ladder (`QueueCompartment` + the same `Detector` Guardian uses for its own chunks) — replacing what used to be a single unretried, unverified call. Real gap it closed: a chunk marked `queued` could get permanently abandoned in `BUILDING` state because nothing polled for completion; `_pollGuardianJob()` fixed this.

**Real bug class this session connected to the original screenshot:** the "manifest only — file content isn't stored yet" placeholder text seen at the very start of this session is best explained by a chunk sitting at a non-COMPLETE status while something read its `content` field regardless of status.

**Commands**

Not enumerated as a formal list — real functions confirmed this session: `createSpec()`, `createFileTreeSpec()`, `addChunk()`, `completeChunk()`, `getNextChunk()`, `reconstructSpecText()`.

**What it connects to**

- `guardian` — chunk dispatch calls `buildChunkWithAgent()`, Guardian's real job system
- `cortex` — `raid.decideForContract()` resolves which agent handles a chunk when no explicit `preferAgent` is given

**Bus events emitted**

Not enumerated this session.

---

### file-tree-plan

**id:** `idearium.file-tree-plan`
**path:** `lib/file-tree-plan.js`

**What it does**

Plans a project's real file tree — kernel/engine/runtime/test layers — before any content is generated, merging a COS archetype/blueprint's real files with an agent's proposal for the rest. Built 2026-09-21, quoting James almost verbatim in its own header comment: *"i feel the file tree needs to be generated first with the list of files, the kernel, engine and runtime."*

**How it works internally**

Template files keep their real content (zero dispatch cost — `completeChunk()` called synchronously at creation). Agent-planned files start empty. `layerFor()` classifies a non-template file's layer by filename pattern (tests → test; `index`/`main`/`server`/etc. → runtime; configs/manifests → runtime; everything else → engine) — nothing is guessed into `kernel`; a template that ships no kernel file doesn't get one invented. `MAX_FILES: 80` caps plan size.

**Real, confirmed limitation** (found and tested this session, not just read): the dependency gating this produces is per-layer, not per-file — an engine file waits on *every* kernel file, not the specific ones it needs. `architecture-spec`'s own `decompose.js` was built partly to demonstrate what per-file, hook-based gating would look like instead.

**Commands**

`listCosTemplates()`, `isCosTemplate(id)`, `layerFor(path)`, `fromCosTemplate(id, {name})`.

**What it connects to**

- `cos/archetype/index.js`, `cos/blueprint/index.js` — read live, never copied, every time
- `idearium.spec-engine`'s `createFileTreeSpec()` — the consumer of this module's plan

**Bus events emitted**

Not enumerated this session.

---

### repo ingest / atlas.json

**id:** `idearium.repo-ingest`

**What it does**

Ingests an existing codebase, chunks it per-file (with byte-range + symbol + hash per chunk), and generates a real `atlas.json` per project — confirmed this session as the actual hook `nexus-atlas.md` uses for eventual "each system a repo compartment."

**Real, confirmed schema** (from `idearium/data/projects/nexus-id-repo-3a82e21b/atlas.json`, read directly this session):

```json
{
  "repository": "...", "generatedAt": 0, "fileCount": 0,
  "byLanguage": { "javascript": 0, "markdown": 0 },
  "byKind": { "component": 0 }, "failedCount": 0,
  "tree": { "...": "recursive dir structure, per-file language/status/symbolCount/lineCount/kind" },
  "components": [ { "path": "...", "kind": "component", "language": "...", "symbolCount": 0 } ]
}
```

Real chunk index shape (from the same project's `indexes/chunks.json`):

```json
{ "id": "chunk-<hash>", "file": "src/a.js", "range": {"start_line": 1, "end_line": 1}, "symbols": [], "hash": "sha256..." }
```

**What it connects to**

- `architecture-spec.nexus-atlas-aggregate.js` — built and tested this session against this exact real `atlas.json`

**Bus events emitted**

Not enumerated this session.

---

## Where idearium writes (and where a test writes)

Every idearium data path comes from `idearium/lib/data-dir.cjs`: `ideariumDataDir()` for idearium/data (specs, nodes, projects, drop, the WARP cache) and `ideariumLedgerDir()` for its event ledger in the shared data root (data/idearium/). Nothing else in idearium computes a data path; `tests/modules/test-test-sandbox.test.js` fails if one reappears.

In production both return exactly what they always did. In a test process they return a throwaway root made by `lib/test-sandbox.js`, as do cortex memory and COMPARTMENT OS. This is why a test can no longer leave specs behind for the boot reconcile to adopt, build and send to an agent (2026-09-25).

What leaked before 0.39.236 is cleared with `node cli/clear-idearium.js` (dry run first; `--apply` only with NEXUS stopped — it refuses otherwise). It covers the idearium tables, repo-scoped tables, node files, projects, specs, the `idearium-repo-*`/`idearium-idea-*` compartments, and guardian jobs carrying a cleared repo's project-agent prompt.

---

## Modules Not Yet Built

Not determined comprehensively — no single `idearium.spec` gaps/history section was read this session (if one exists at all; not confirmed).

---

## Version History

**Source:** NOT CONFIRMED EITHER WAY — idearium has its own real content-hash/rootHash integrity system (spec-engine's `_hashChunk`/`rootHash`), but whether it also reports to Versionium separately wasn't checked this session.

---

## Copyright

Copyright © 2026 James Brooks (Erosmancer). Part of the rheon.world / NEXUS ecosystem.


## The agent backend is a three-way switch; Ollama's models are a dropdown (4.6.0, v0.39.253)

James: *"i want the cli in idearium to be like the 3 way cli in the floating menu cli in the tv ui. that way it doesn't use check box. also have ollamas models to choose from in a drop down menu for the agent tab."*

The Agent tab's CLI, and Settings → Agents, show one control: **ollama · copilot · guardian**, the shape of `ui/tv-shell`'s `#cp-backend-toggle`. It replaces the guardian on/off checkbox, which could not express copilot (stored provider `'auto'`: no backend is sent, and copilot's own default decides). A dropdown appears only where there is a choice:
- **guardian:** the guardian agents.
- **ollama:** Ollama's installed models (`GET /api/ollama/models` → the ollama bridge's `/api/models`), with "default (<bridge default>)". A stored model that is no longer installed is labelled so. An unreachable bridge is stated, never guessed.

**Stored per compartment.** `lib/repo-agent.js` holds `ollamaModel`. `setOllamaModel` refuses a model not in the installed list, and refuses when the list cannot be read. The model is sent as `model` on Ollama dispatches only. Copilot 3.5.2 passes it on; it used to drop it.

**CLI.** `/model [name|default]`.

**Tests.** `test-repo-agent-provider` 60/60. **Open:** a Chromium click-through of the switch.

## The Agent tab streams the reply and shows the gate (4.6.1, v0.39.256)

The live feed (`_agentFeedIn` / `_agentFeedHtml` in `ui/js/app.js`) changes in three ways:
- **Live reply:** the userscripts' 500 ms transcript chunks build it as it is written. A `reset` chunk replaces it, and these chunks add no log row each.
- **Gate rows:** `guardian.job.gate` frames from guardian's `lib/gate-trail.js` appear as rows ("gate reply appears · failed — no completion after 900s → pick the reply with ◎"), in red when failed.
- **Header:** shows the gate the job is at.

A failure in the chat line now carries guardian's gate sentence (`guardian/ask.js`) instead of "timed out … may still complete". No route or contract change.

## The Agent tab: every tool, plain commands, the graph in context (4.7.0, v0.39.257)

James: *"the toolscope for the agents tab. need the full capabilities, with the /help and tool awareness to help. need the commands as user friendly as possible. including debugging, using the intelligence system … also context on by default and wire in the graph"*. Asked which tools: *"i want everything, at least for now."*

**Tools.** Before this, the repo agent had no tools at all: the dispatch sent copilot a plain prompt, and the hat's 21-tool list was never used. Now every Ollama or browser-agent dispatch runs copilot's real tool loop, as follows:
- **Scope:** every tool (102) by default, or the hat's own set with `/scope project`. Either way it is **enforced**.
- **Identity:** the hat is the agent's identity.
- **Files:** file tools work in this repo's own files, or in NEXUS with `where: "nexus"`.
- **Visible:** each tool call is shown under the answer.
- **Exception:** `auto` (copilot's own routing) is not enforced, and `/status` and `/tools` say so.

**Commands** (`/help`, regrouped by what you want to do):

| group | commands |
|---|---|
| ask & investigate | `/debug`, `/debug <question>`, `/tools [words]`, `/scope all\|project`, `/graph [file]`, `/context on\|off` |
| run & check | `/run`, `/test`, `/diagnose` |
| the agent | `/status`, `/provider`, `/model`, `/hat`, `/forge`, `/memory`, `/learn`, `/forget`, `/history`, `/export`, `/import`, `/clear` |
| code it writes | `/mode`, `/injects`, `/inject`, `/open`, `/apply`, `/reject`, `/revert` |

Aliases: `/?` `/h` `/st` `/t` `/dbg` `/hist`. A typo gets "did you mean /…?".

**`/debug`** reports straight from the systems, with no model involved:
- syntax (`node --check`);
- unresolved imports from `graph.json`;
- this agent's recent failures, each with the gate it stopped at;
- the intelligence system: failure patterns, recorded faults for this agent, and idearium's open gaps.

`/debug <question>` hands the agent the question with instructions to investigate using the intelligence system and the repo's files.

**Context and the graph.** Context was already on by default. Now:
- A question that names no code ("hello") gets the project map from `graph.json`: size, top folders, entry points and the most depended-on files.
- Matched chunks come with how their files connect.
- The context line under an answer says which of the two happened.

Routes: `GET /api/repos/:uuid/agent/tools`, `POST …/agent/debug`, `GET …/agent/graph`; `POST …/agent/settings` takes `toolScope`.
