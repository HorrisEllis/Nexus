# idearium — where work begins, and where each project gets its own agent

> **status: mapped (0.39.270), written from the code** · one process on :4800, served through the orchestrator at :9000 · ideas → specs → repos, each repo in its own compartment with its own agent · a module of `nexus`, back up one level in `nexus-atlas.md` · supersedes the earlier atlas, kept in the atlas archive as idearium-atlas.pre-0.39.270 (outside the snapshot on purpose)

**Author:** James Brooks (Erosmancer) · rheon.world

---

## What It Is

Idearium is where a piece of work starts and where it is built. An idea goes in as a node with a tension score and a phase. It grows through brainstorms and a workbench of lanes, becomes a spec, and the spec is built chunk by chunk by agents into a repo. The repo gets its own COS compartment, its own index, graph and verification tiers, its own snapshots, and its own agent: a hat forged for that one project, which answers on Ollama, through copilot, or through a browser agent in Guardian, and whose code comes back as proposals you approve.

NEXUS is itself one of Idearium's repos. `idearium/repo/nexus-self.js` snapshots the live tree, splits it into one repo per system under a parent `nexus` repo, and lets an edit reach the live files only through a COS branch and the apply gate. The Home tab of that parent repo renders `nexus-atlas.md`; this atlas is what its idearium link opens.

The design rule, from `idearium/index.js` (IdeaOS): all state lives in the core. The CLI (`idearium/cli/index.js`) and the API (`idearium/api/index.js`) are projections of it, and the UI (`idearium/ui/`) is a projection of the API. Nothing is deleted: ideas, specs and repos are archived.

---

## Where It Runs

| | |
|---|---|
| process | `idearium/api/index.js`, started by `nexus/autopilot.js` in boot phase 3, under the system name `idearium` |
| port | :4800; the page is served by the `orchestrator` at /ui/idearium/ on :9000 |
| core | `idearium/index.js` — IdeaOS, on the SISO primitives in `siso/core/index.js` |
| CLI | `idearium/cli/index.js` — every feature has a command; it calls IdeaOS directly, no HTTP |
| contract | `idearium/interaction-contract.json`, routes declared as components in `idearium/registry-components.js`, verified by the orchestrator at registration |
| config | `idearium/idearium.config.json`, read through `idearium/lib/config.js` and `idearium/lib/config-core.cjs` |
| data | every path comes from `idearium/lib/data-dir.cjs`: idearium/data for specs, nodes, projects and the WARP cache, and data/idearium in the shared root for its event ledger (`idearium/lib/event-ledger.cjs`). In a test process both point into a temp root made by `lib/test-sandbox.js` |
| cortex link | `idearium/lib/cortex-listeners.js` mirrors chunk and build events into cortex tables |
| guardian link | `idearium/lib/guardian-stream.cjs` subscribes to guardian job completions and, at boot, resets chunks a restart left in building |

---

## File Structure

```
idearium/
  index.js                  IdeaOS — ideas, tension, phases, links, the dual ledger (922 lines)
  api/index.js              the HTTP API on :4800 — 217 routes, the SSE stream, the build-queue poller (5,598 lines)
  cli/index.js              the CLI — the truth layer
  config.js                 service config
  compiler-bridge.js        spec → compiler handoff
  copilot-adapter/index.js  copilot suggestions for ideas
  agent-suite/index.js      builds one chunk with an agent wearing a hat (buildChunkWithAgent)
  registry-components.js    every route as a registry component
  interaction-contract.json the contract the orchestrator verifies
  lib/
    data-dir.cjs            the one answer to "where does idearium write?"
    db.js                   JAA tables for idearium
    event-ledger.cjs        idearium's own event ledger
    chunk-nodes.js          a chunk as a node file (projectname.filename.uuid8)
    idea-workbench.js       the workbench: lanes, entries, spawn, links
    guardian-stream.cjs     guardian completions → chunks; boot recovery
    cortex-listeners.js     events → cortex tables
    spec-container.cjs      a spec as a container
  spec-engine/
    index.js                specs as chunk manifests: create, build order, complete, fail, purge (1,869 lines)
    blocks.yaml             the 10 document sections and their default agents
    chunk-dispatch.js       the retry and verification ladder around one dispatch
    warp-build-dispatch.js  WARP's exact cache and provider cascade in the build path
    guardian-extract.js     extraction with verification for guardian replies
    compiler-t0.js          the tier-0 spec compiler
    templates.js            spec-document templates and COS compartment seeds
    templates/              10 spec templates (genesis.spec among them), the atlas template, two more
    manifest/               a spec's file list, commands, graph, wire check
  repo/
    index.js                the repo layer: list, ingest, fork, archive, restore, immutability
    import-pipeline.js      MAPPING → CHUNKING → VERIFYING → INDEXING → GRAPHING, tiers L0–L5
    verify-lazy.js          tiers L6–L8, after the import returns
    graph.js                the code graph: imports, symbols, cones
    spec-graph.js           the spec graph
    scan.js                 dangling hooks, gaps, tension for the Intelligence tab
    snapshot.js             a repo's derived state committed to versionium
    snapshot-files.js       the files a snapshot names
    snapshot-restore.js     restore from a snapshot
    roadmap.js              phasemap phases as a dependency-ordered roadmap
    nexus-self.js           NEXUS as a repo: sync, atlas resolver, branches, applies
    source-files.js         reading a repo's sources
    watcher.js              watches a repo's folder
    runtime-proof.js        proof that a repo actually runs
    repo-node.js            a repo as a node file
    pipeline-events.js      import pipeline events
    import-baseline.js      the baseline an import compares against
  ui/
    index.html              the page: 7 views, the repo view with 12 tabs plus Create and Build, the dialogs (2287 lines)
    js/app.js               everything the page does (5,325 lines)
    js/agent-blocks.js      the prompt-block editor in Settings → Agents
    js/nexus-atlas.js       renders nexus-atlas.md and the system atlases, every reference a link
    js/compartment.js       the compartment view of an idea's lanes
    css/agent-blocks.css    the block editor's styles
  schemas/                  idea, node, phase_node, system, component, hook, wire, command, capability
  spec/                     idearium.spec and its sibling specs
  test/                     idearium's own tests and smoke checks
```

The project agent itself lives in `lib/`, beside the other shared modules, because copilot and guardian read the same files: `lib/repo-agent.js`, `lib/repo-hat.js`, `lib/repo-hat-memory.js`, `lib/repo-prompt-blocks.js`, `lib/repo-context.js`, `lib/repo-inject.js`, `lib/repo-agent-node.js`, `lib/registry-harness.js` and `lib/agent-memory.js`.

---

## The Interface

The top bar has four tabs. Welcome and Repos are always there; Create and Build, and the ideas and specs counters, show only inside a repo.

| view | what it is |
|---|---|
| Welcome | the start page |
| Create → Brainstorm | free-form brainstorms, each promotable into an idea |
| Create → Ideas | the idea list, sorted by tension, recency or name; an idea's panel shows its phase, compartment, stability, spec, and the workbench lanes (Brainstorm, Problem solving, Expand, Improve, Links) |
| Build → Eravos | the Eravos organism canvas, embedded from `eravos/` |
| Build → Architect | the Architect block canvas, embedded from `architect/` |
| Build → Spec Builder | the spec wizard: questions, then a spec |
| Repos | every repo; opening one shows its 13 tabs, then Create and Build (0.39.271: those two sit in the repo's tab row, never in the top bar) |

A repo opens onto its tabs:

| tab | what it shows | what it reads |
|---|---|---|
| Home | the repo's README or .spec; for the nexus repo, `nexus-atlas.md` | the repo's files, `idearium/ui/js/nexus-atlas.js` |
| Idea | the idea the repo came from, and its iterations: improve, iterate, expand. Each iteration can go to the agent or onto the roadmap | IdeaOS |
| Files | the file tree and an editor | the repo's files |
| Code | search the code by meaning or exact text; open any chunk's card (kind, signature, doc, what it uses and what uses it, its tests and runtime proof) and its code, following uses by link (0.39.273) | `idearium/repo/code-api.js`, `lib/code-intel/index.js` |
| Architect | the repo's own spec as a blueprint, chunk by chunk | the spec-engine |
| Spec | the living spec: the .spec files of the repo's spec folder, parsed into meta, sections, version history, gaps and addenda; below it, the build manifest (chunk status, the agent per pending chunk, build remaining, history, export) | `idearium/repo/living-spec.js`, the spec-engine |
| Phases | every phasemap of the repo (for a nexus repo, of NEXUS) as one manager: summary, Board / Layers / Table / Maps, a phase's dependencies, what it closes and its files; editing a phase edits the phasemap (a nexus repo's through the apply gate); Build takes a Versionium snapshot, then hands the phase to the repo's agent. Replaces Phasemap and Roadmap (0.39.271) | `idearium/repo/phases.js`, `idearium/repo/roadmap.js`, `idearium/ui/js/phases.js` |
| Intelligence | dangling hooks, gaps, tension, and the verification tiers L0–L8 and graph summary that were the Phasemap tab | `idearium/repo/scan.js`, `idearium/repo/verify-lazy.js`, `idearium/repo/graph.js` |
| Agent | the repo's own agent: its CLI, transcript and the live provider feed | below |
| Debug | what is wrong, in one place: failed tiers, parse failures, COS run failures, agent errors, live syntax and dependency checks | the repo's artifacts |
| Versionium | the repo's snapshots | `idearium/repo/snapshot.js`, `versionium` |
| Sync & CI | real git on the repo's folder (remote, commit, pull, push, an SSH key or a token) and its CI pipeline | `lib/repo-git.js`, `cos/ci/` |
| Settings | the compartment, provenance, repo actions (add file, fork, export, archive), and Settings → Agents | below |

---

## The Agent Tab

### One agent per compartment

Every repo with a compartment has exactly one agent. It is a hat from `lib/hat-forge.js`, forged by `lib/repo-hat.js` and named repo_ plus the first 16 hex digits of the repo's uuid. The hat is held by its role, so forging twice finds the same hat, and renaming it does not lose it. A repo with no compartment gets no agent, and the tab says why: an agent scoped to nothing would be a host-wide agent wearing the project's name.

**A spec's code repo shares the original repo's agent** (0.39.276). The Code button on a spec (speceng.codegen) makes a second repo for the code spec, with source spec.codegen and promotedFromSpec set to the original spec. That repo is linked to the repo that owns the original spec (`lib/repo-hat.js` linkCoder, table repo_agent_links; older code repos are linked on their next build or repo list). Through the link there is one agent:
- **One hat.** The code repo has no hat of its own. It wears the original's, so its builds and its Agent tab both use it. Worn in the code repo, the persona gets one added line naming the code repo's uuid, so the idearium.code_* tools are pointed at the right repo. The stored hat is not changed by that.
- **Settings live in the original.** The backend switch, the Ollama model, the tool scope and the prompt blocks are read from and written to the original repo's row, whichever repo's tab you edit them in. Both agent views say so and link to the original. Inject mode (review or auto) stays per repo.
- **What stays the code repo's own:** its compartment, its exchange log and its agent id in the download manager.
- **Guards.** Refreshing or revoking the hat from the code repo is refused and says where to do it, because a refresh would rewrite the shared persona with the code repo's identity. What the code repo's agent learns is stored on the original and joins the persona when the original refreshes. A spec with no repo of its own has nothing to link to and is built as before, by the_builder.

The hat's persona is generated from the repo's real index (its atlas, file count, languages, chunk count, compartment) and from what the agent has learned. It is regenerated on refresh, so it is shown in Settings → Agents but edited through the prompt blocks. The hat's own tool set is 19 tools chosen to understand, fix and expand one project, and leaves out the host-wide ones (accounts, browsers, Clear Glass). Its base agent is copilot, and the backend switch decides who wears it.

### What one message goes through

1. **Command or question.** A line starting with / is a command against this compartment's agent. Anything else is a question.
2. **The hat.** `lib/repo-agent.js` finds the repo's hat, forging it on first use.
3. **Context.** `lib/repo-context.js` reads the repo's own index for what the question names. By default the agent gets the registry card of that component: purpose, exports, requires, events, routes, tests. The card comes from `lib/registry-harness.js`, not code. Pre-fetched code and the project map are off by default.
4. **Memory.** `lib/agent-memory.js` recalls this agent's earlier exchanges on any backend from the Clear Glass download manager, within a budget (0.39.269).
5. **Reword.** For a browser agent, the question can go out in new words each time. `copilot/lib/reword.js` rewords it and keeps code, paths and names verbatim. The original stays the job's meaning.
6. **Compose.** The prompt is the persona, then this repo's prompt blocks, in order, as edited. Nothing is added that cannot be seen and edited in Settings → Agents.
7. **Send.** One request to copilot's /api/prompt carries the repo's agent id, compartment and backend. Tools run through copilot's tool loop in `copilot/tool-runtime.js` with the scope enforced. Copilot sends it on to `ollama-bridge` or to `guardian`.
8. **The reply.** One path handles every reply, including a late one:
   - @learn lines become observations;
   - code blocks become injects;
   - the exchange is logged;
   - an Ollama tool-loop answer is recorded in the download manager.
9. **Shown.** The answer arrives with what the agent was given: which card, how much memory, whether the question was reworded, what it wrote and what it learned.

### Who answers

The CLI and Settings → Agents show one three-way switch: **ollama · copilot · guardian**, the same shape as the TV shell's backend toggle. A dropdown appears only where there is a choice. Guardian offers its browser agents, read from the userscripts on disk by `lib/agent-providers.js`. Ollama offers its installed models, and the choice is stored per compartment. Copilot asks copilot where its default goes and sends there. If copilot cannot say, nothing is sent. A new compartment defaults to chatgpt through Guardian. The setting lives in the repo_agent_settings table.

### The prompt blocks

Everything the agent is sent besides the persona is a block, edited per repo in Settings → Agents (`idearium/ui/js/agent-blocks.js`, stored by `lib/repo-prompt-blocks.js`). Each can be turned off or rewritten, and a preview shows the exact prompt.

| block | sent | default |
|---|---|---|
| Persona | always | the hat's persona |
| @learn protocol | always | on |
| .inject protocol | always | on |
| How to call a tool | browser agents | on |
| Tool guide | when tools run | on |
| Registry card of what the question names | always | on |
| Memory | always, when there is something to recall | on (0.39.269) |
| Code matched from this repo | always | off |
| Project map | always | off |
| Voice | browser agents | on |
| The question | always | on |
| Reword (guides the rewriter, not sent) | browser agents | on |
| Tool result (follow-up rounds) | when tools run | on |
| Where does this code go? | when a code block has no path | on |

### What it remembers

Two kinds of memory, both on disk.

**What it has learned** (`lib/repo-hat-memory.js`). An answer may end with lines of the form @learn fact|convention|pitfall|correction: one sentence [evidence: a file it was shown]. Each becomes an observation in the repo_hat_memory table. Repeats are counted, not duplicated. Corrections weigh most. The strongest 24 are written into the persona on refresh. You can teach it (/learn) and make it forget (/forget).

**What it has done** (`lib/agent-memory.js`, 0.39.269). Every exchange on every backend is in the Clear Glass download manager (`clear-glass/src/downloads/artifact-chat-index.js`), filed under the agent id repo- plus the repo's uuid:
- Guardian's replies are filed by Guardian;
- Ollama's replies are filed by the bridge;
- tool-loop answers are filed here.

Before each message, the memory block gives the agent its own most relevant earlier exchanges, ranked by the words they share with the question, then by recency. The exchanges are also in the repo_agent_log table, which /history reads.

### What it can use

109 tools are registered in `lib/agent-tools/`. The scope is per compartment and enforced by copilot's tool loop on the ollama and guardian backends:

| scope | what the agent is offered |
|---|---|
| harness (default) | every tool is allowed, but the prompt lists eight: the codebase tools code_map, code_search, code_chunk, code_read, code_edit, code_write, code_check (`lib/agent-tools/tools/idearium/code.js`, 0.39.273) and loom.find (`lib/agent-tools/tools/loom/harness.js`), plus a line naming code_grep, code_refs, code_batch, code_changes, loom.card and loom.test, and one naming the other groups to find with loom.find |
| all | every tool, all listed |
| project | the hat's own 19 tools |

The harness tools learn their repo from the run context, so the model never passes it. loom.write proposes an inject. loom.test runs the covering tests through the COS run menu (`lib/cos-run.js`).

**The codebase tools** (0.39.273, `docs/code-intel.spec`) work on any repo through the routes /api/repos/:uuid/code/… (`idearium/repo/code-api.js`):
- **Understand:** code_map (the repo in one answer), code_search (ranked chunks by meaning or name, each with a one-line summary and the lines that matched), code_grep (exact text or regex), code_chunk (a chunk's card and code), code_read (lines, or a file's outline), code_refs (where a name is defined and every use).
- **Change:** code_edit (exact text, line ranges or a whole chunk; every edit in a call refers to the file as last read), code_write (create, replace, delete, move), code_batch (several files, all or nothing). Every write is an inject; in review mode a later edit to the same file stacks onto the pending proposal. A write that introduces a syntax error is refused unless forced.
- **Check:** code_check (syntax, then the tests that use the changed files), code_changes (list, revert an applied change, withdraw a proposal — never approve).

### The commands

/help lists these, grouped by what you want to do. Aliases are /? /h /st /t /dbg /hist; a typo within two letters gets "did you mean". ↑ and ↓ recall what you typed in this compartment.

| group | commands |
|---|---|
| ask & investigate | /debug (syntax, broken imports, recent failures, the intelligence system — no model), /debug with a question (the agent investigates), /tools with words, /scope all or project, /graph with a file, /context on or off |
| run & check | /run, /test (a COS branch run), /diagnose (verification and scan) |
| the agent | /status, /provider, /model, /hat, /forge, /memory, /learn, /forget, /history, /export, /import, /clear |
| code it writes | /mode review or auto, /injects, /inject with a path, /open, /apply (with --force), /reject, /revert (with --force) |

### The code it writes

A fenced block with a path after its language becomes an inject (`lib/repo-inject.js`): a node proposing that file's full content, with a status of proposed, applied, rejected or reverted.
- **Review mode** (the default): the code waits for you to apply or reject it.
- **Auto mode:** the code is written on arrival.
- **A block with no path:** the agent is asked where it goes, using the "Where does this code go?" block.
- **Shell blocks** (bash, powershell and the like) are counted as commands and reported, never written to a file.
- **Nexus repos** are always in review mode. Approving opens a prompt that says what will be written into the live tree, and the change goes through the apply gate (`lib/nexus-self/inject-gate.js`, `lib/nexus-self/apply.js`).

### The live feed and late replies

Above the CLI, a collapsed panel shows the provider tab live for a Guardian answer:
- the reply as it is written;
- the gate the job has reached (`guardian/lib/gate-trail.js`);
- the page anchor it is read from.

It stays collapsed unless opened, and it remembers that per viewer.

If copilot stops waiting while the tab keeps typing, the tab says where to look and from when. The reply is picked up from the download manager once it lands, by exact job id where there is one, and only once. It is never taken from another compartment.

### Settings → Agents

In the repo's Settings tab:
- **The agent:** its hat, session, index, learned count, exchanges, and whether the tool scope is enforced.
- **The backend switch.**
- **The hat:** show or hide the persona, teach it, export it and import it (`lib/repo-agent-node.js`, portable repo_agent node files: the hat, every observation, and optionally the exchange log).
- **What it has learned.**
- **Its injects and inject mode.**
- **The prompt-block editor.**

### Where the agent's state lives

| what | where |
|---|---|
| backend, Ollama model, tool scope, inject mode, prompt blocks | the repo_agent_settings table (cortex JAA) |
| the hat | hat-forge's table, found by its role |
| what it learned | the repo_hat_memory table |
| every exchange | the repo_agent_log table, and the Clear Glass download manager under the repo's agent id |
| its code | inject nodes under idearium/data/nodes/inject |

### The agent's routes

37 of the 217 routes serve the agent:
- **The agent** (19): status, prompt, late replies, history, tools, debug, graph, memory, settings, blocks and their preview, export, import.
- **The hat** (4): show, forge, refresh, revoke. On a code repo they act on the original's hat (see above).
- **Injects** (7): list, create, get, edit, apply, reject, revert.
- **The harness** (5): find, card, read, write, test.
- **Other** (2): Ollama's installed models, and the provider list.

All of them are under /api/repos/:uuid/, except the last two.

---

## Ideas, Specs and Builds

**Ideas.** An idea is an IdeaOS node with causal ancestry, a tension score and a phase: seed, expanding, tensioned, specced, building, complete or archived. Links connect ideas both ways. The workbench (`idearium/lib/idea-workbench.js`) gives an idea lanes of entries that nest to any depth. An entry can be spun out into a child idea, and copilot can assist a lane with a preview first.

**Specs.** The spec-engine (`idearium/spec-engine/index.js`) stores a spec as a manifest of chunks. A document spec has ten sections from `idearium/spec-engine/blocks.yaml`: meta, purpose, axioms, schema, api, events, integration, failure_modes, build_order and tests.
- **Default agents:** each section names one, but inside a repo the repo's backend switch overrides it (0.39.267). A per-chunk choice made by hand is pinned and overrides both.
- **A file-tree spec** (`lib/file-tree-plan.js`) makes each chunk a real file, planned kernel → engine → runtime → test. A COS template supplies real starting files; the agent plans the rest.
- **Codegen:** "Generate code" turns a finished document spec into a file-tree spec (`lib/spec-digest.js` condenses it for every file prompt).
- **Chunk states:** pending, building, verifying, complete, failed and escalated. A chunk is dispatched only when everything it depends on is complete.

**One chunk's build** is the build route in `idearium/api/index.js`. It spends tokens only as a last resort:
1. **The component store** (`lib/component-store.js`): a component with this exact contract is reused at 0 tokens.
2. **Prior sections:** the same section, already built in another spec, is reused.
3. **The hat:** who builds, wearing which hat. A repo's spec wears the repo's hat on its backend; a spec with no repo wears the_builder.
4. **Memory:** the agent's earlier work, and the exports of the files already finished in this spec (0.39.269).
5. **The dispatch:** through `idearium/spec-engine/warp-build-dispatch.js` (WARP's exact cache, then a provider cascade) inside `idearium/spec-engine/chunk-dispatch.js` (retries and Detector verification). It calls `idearium/agent-suite/index.js`, which sends the chunk to Ollama or to a Guardian browser agent.
6. **Code only:** a real source file is accepted only as extracted code (`lib/extract-code.js`).
7. **Queued jobs:** a Guardian job completes later, through `idearium/lib/guardian-stream.cjs`.
8. **The poller:** it asks every 15 seconds for the next pending chunk, and says so loudly when a spec has stalled.
9. **RAID:** every chunk also goes to RAID as an observability contract that names the hat.

**Projects.** "Upload Project" (`lib/project-container.js`, `lib/project-import.config.js`) creates a temporary compartment and takes the dropped files. It writes the manifest, project and git files, and opens the repo.

---

## Repos

**The repo layer** (`idearium/repo/index.js`) lists, ingests, forks, archives and restores repos. A repo row points at its spec (its files are its spec) and at a content hash. Immutable repos (the nexus ones) refuse archive, write, delete and fork.

**Import** (`idearium/repo/import-pipeline.js`) runs MAPPING, CHUNKING, VERIFYING, INDEXING and GRAPHING. It writes the repo's atlas, chunk index, symbols and graph (`idearium/repo/graph.js`, `idearium/repo/spec-graph.js`).

**Chunks and cards** (0.39.273, `lib/code-intel/`): chunks are cut only at statement starts of the level being chunked, a declaration's doc comment opens its chunk, no chunk passes 150 lines (a large class splits at its methods, a large switch at its cases), and a chunk's id comes from its kind and qualified name. After GRAPHING the pipeline writes a card per chunk (indexes/cards.json in the repo folder: summary, signature, doc, neighbours, what it uses and what uses it with the basis of each, its tests) and a BM25 search index (indexes/search.json).

**Verification** runs in two passes:
- **During import:** L0 existence, L1 address, L2 syntax, L3 structural boundary, L4 semantic consistency and L5 dependency consistency. They are real and complete when the import returns.
- **Afterwards:** `idearium/repo/verify-lazy.js` runs L6 targeted runtime/test, L7 integration and L8 system contract, and they land moments later.

**The rest of a repo's life:**
- **Snapshots** (`idearium/repo/snapshot.js`) commit the repo's derived state to versionium: source hash, git commit, atlas, chunk and graph identity, dependencies, environment, tests and verification.
- **The roadmap** (`idearium/repo/roadmap.js`) reads and edits the repo's phasemap specs, using loom's parser (`loom/scanners/phasemap-map.js`), and turns their phases into dependency-ordered nodes: layers, ready, blocked-by, and a warning for anything it cannot resolve. A dependency is read three ways:
  - **A key in the same phasemap** is an edge to that phase. A key that matches two phases (P1_a and P1_b for P1) is reported as ambiguous and not guessed; a key that names the phase itself is reported as a self-dependency.
  - **A phase in another phasemap**, written as the map's words then the phase (for example "B0, staging S0"), is an edge only when the words name exactly one *other* map and that map has exactly one phase with that id or key. It does not matter which of the two maps is listed first. A bare key is never looked up across maps, because two phasemaps written the same day reuse C0, C1, L1, A1 and X1.
  - **Anything else** (a file, a URL, a phase that exists nowhere) stays an unresolved-dependency warning and does not order or block anything.

  A comment after a flow list is not part of its last item (0.39.275): loom's list reader stops at the closing bracket, so a list of S3 and C1 followed by a comment keeps both edges.
- **The scan** (`idearium/repo/scan.js`) finds what the Intelligence tab shows.
- **The run menu** (`lib/cos-run.js`) runs a repo in a COS branch, a process or the COS test VM (`cos/testenv/`).
- **Git and CI** are `lib/repo-git.js` and `cos/ci/`.

---

## NEXUS Inside Idearium

`idearium/repo/nexus-self.js` makes NEXUS one of Idearium's repos. `lib/nexus-self/systems.js` decides which system owns each file of the live tree: 15 systems, each a repo nested under the parent `nexus` repo. `lib/nexus-self/store.js` keeps the tree as content-addressed blobs.
- **The snapshot is immutable.** An edit happens on a COS branch of one system (`lib/nexus-self/branch.js`), is planned and tested there, and reaches the live files only through the apply gate (`lib/nexus-self/apply.js`), which records it so it can be rolled back.
- **Sync is healing.** A sync first restores any nexus repo that was archived by mistake.
- **Timing is logged.** A sync that takes over a second names its slow step.
- **The parent repo's Home is `nexus-atlas.md`,** with every reference resolved against the snapshot; the resolver answers that page's links.

---

## The API

217 routes on :4800, grouped:

| group | routes | what |
|---|---|---|
| repos | 79 | the repo itself (list, show, ingest, import, fork, archive, lineage, export, reindex), files, chunks, symbols, graph, verification, scan, proof, snapshots, roadmap, idea, run, debug, and 35 of the agent routes above |
| nexus-self | 19 | status, sync, understanding, atlas, resolve, file, applies and rollback, per system: spec, branches, branch files, plan, apply |
| spec-engine | 17 | templates, specs, build, codegen, chunk complete, fail and agent, WARP primitives, archive, delete, restore, expand, wizard, context, WARP status |
| cos | 13 | test VM status and setup, install, compartments and their remotes |
| CI | 11 | keys, secrets, config, run, runs |
| ideas, brainstorms, workbench | 22 | ideas (list, create, show, update, archive, tension, link, spec, phase, progress), brainstorms, the workbench |
| specs (document) | 11 | list, create, show, update, check, build, export, archive, import, promote (GET and POST) |
| git | 7 | status, remote, commit, push, pull, keygen, clone |
| everything else | 38 | health, contract, config, stats, SNR, events, gaps, snapshots, queue, projects and project import, components, copilot suggest, CLI exec, the provider list and Ollama's models (the other 2 agent routes), the SSE stream |

The live stream is /sse. Every change is an event named idearium.<what>.<did>: ideas (create, update, phase, link, tension, archive), specs and chunks (create, update, build, chunk complete, queued, agent set, build stalled), repos (file write and delete, chunk started and done, snapshot, run, roadmap, git, CI, hat forged and refreshed and revoked, agent blocks changed, agent exported and imported, inject proposed and applied and reverted), nexus-self (apply, rollback) and idearium.error.

---

## Specs and Tests

**Specs.** `idearium/spec/idearium.spec` is the system's spec; `idearium/spec/nexus-repository-system.spec`, `idearium/spec/idearium.repo-graph.spec`, `idearium/spec/idearium.repo-roadmap.spec` and `idearium/spec/idearium.repo-snapshot.spec` sit beside it. Agent memory and the provider list have their own specs: `docs/agent-memory.spec` and `docs/agent-providers.spec`. This atlas was mapped in `docs/2026-09-27-idearium-atlas-phasemap.spec`.

**Tests.** The Agent tab is proven by:
- `tests/modules/test-repo-agent.js`
- `tests/modules/test-repo-agent-provider.js`
- `tests/modules/test-repo-agent-learn.js`
- `tests/modules/test-repo-agent-late.test.js`
- `tests/modules/test-repo-agent-node.js`
- `tests/modules/test-repo-hat-memory.js`
- `tests/modules/test-repo-inject.js`
- `tests/modules/test-repo-context.js`
- `tests/modules/test-composed-prompt.test.js`
- `tests/modules/test-registry-harness.test.js`
- `tests/modules/test-agent-hat-agnostic.test.js`
- `tests/modules/test-agent-memory.test.js`

The build path is proven by:
- `tests/modules/idearium-build-queue-poller.test.js`
- `tests/modules/idearium-guardian-dispatch.test.js`
- `tests/modules/idearium-warp-cache.test.mjs`
- `tests/modules/idearium-reuse.test.mjs`
- `tests/modules/test-component-store.test.js`
- `tests/modules/test-file-tree-plan.js`
- `tests/modules/test-idearium-codegen.test.js`

The roadmap and its dependency rules, including the cross-phasemap and trailing-comment cases, are proven by `tests/modules/test-moce-roadmap.js`.

NEXUS-as-a-repo is proven by `tests/modules/test-nexus-self-and-cos-run.test.js` and `tests/modules/test-nexus-self-visible.test.js`. Every reference in this atlas is resolved against the tree by `tests/modules/test-nexus-atlas-refs.test.js`.

---

## The settings console, code repos as branches, the repo desktop, staging (v0.39.279)

James: *"can you have a full enterprise grade settings menu that encompassed all the idearium compartment and agent settings"* and *"have cos create the vm environment, and each new repo, if applicable could create a branch of the original, to save resources, can you also make it so once its generated, you can open it like a desktop environment?"*

**The settings console** (`idearium/ui/settings.html`, opened from ⚙ settings in the top bar or a repo's settings tab). The left side lists the global configuration, every repo and every branch. The global page shows each key of idearium's layered config with where its value comes from: the schema default, the config file, or a runtime override. Numbers are checked against their bounds as they are typed, and a runtime override can be reset. A repo has four tabs. Agent covers the provider, the Ollama model (the installed list), the tool scope and the inject mode. Prompt covers every block, on or off, with its text, a reset and a live preview of the first message. Hat shows the persona it wears. Compartment and desktop shows the COS compartment, its branch or original, and the desktop VM. Edits wait in a save bar, and Save sends each one to the route that already owns that setting. A branch shows its original's agent settings read-only with a link there. It reads GET /api/settings/console for the list and GET /api/settings/console/:uuid for one repo. Each source is read on its own, and one that cannot be read is named rather than shown empty. Two new config groups: repos.code_repo_mode (branch or copy) and desktop.ram_mb, desktop.cpus, desktop.network.

**Code repos as branches.** When a repo owns the document spec, the Code button's repo is a branch of it (`cos/workspace/index.js` through `lib/cos-bridge.js`). Its files are a git worktree of the original's folder on branch nexus/name, so both share one history, and its compartment is a child of the original's. The original is first made its own git repository with a baseline commit, never a worktree of the tree it sits in. The repo record carries branchOf and branch. body.branch false, repos.code_repo_mode copy, no original or no git all give the separate copy as before, and the response says why.

**The repo desktop** (`idearium/ui/desktop.html`). POST /api/repos/:uuid/desktop boots the compartment's VM headless, and the page draws its screen with noVNC over QEMU's websocket. The VM's disk is a copy-on-write overlay of the original repo's desktop disk when there is one, otherwise of the base image made by `cos/testenv/provision.js` with the desktop option. The repo's files are copied in once the guest agent answers. GET the same route for status, DELETE to power the VM off; its disk is kept. GET /api/repos/:uuid/branches lists an original's branches.

**Staging** (staging self-heal S1, `docs/2026-09-28-staging-self-heal-phasemap.spec`). An edit, write, delete, move or batch sent to /api/repos/:uuid/code with stage true is committed to the repo's staging branch in Versionium, caused by the gap, and the repo itself is not touched. GET code/staged lists staged batches by commit. POST code/promote applies one, all-or-nothing, and a file changed since staging is a conflict, not an overwrite. `lib/code-edit.js` does the work over the inject trail in `lib/repo-inject.js`.

**What the agent is sent.** Repo prompt blocks are version 1.2.0 (`lib/repo-prompt-blocks.js`). Memory, the context atlas and the memory directory are off by default: one short block names nexus.context.tool, which fetches them on demand, and one line tells a browser agent it can start a line with "hey nexus". The first message stays under 3,000 characters.

Tests: `tests/modules/test-settings-console.test.js`, `tests/modules/test-cos-workspace.test.js` and `tests/modules/test-staging-s0-s1.test.js`, plus the console in a real page (`tests/probe/settings-console-chromium.js`).

## What Is Not Built, or Not Yet Proven

- **Hats on copilot's own switch.** A hat can be worn on any backend in the Agent tab and in builds. Copilot's own global hat switch still sets the agent to the hat's base agent.
- **Unconfirmed selectors.** The ChatGPT A/B chooser wait and the fence-preserving reader are checked against markup in Chromium, not yet against a live ChatGPT tab.
- **Known pre-existing test failures.** `tests/modules/test-repo-context.js` and `tests/modules/test-composed-prompt.test.js` have cases that failed before 0.39.267 and still do.
- **Phasemap builds** now start from the Phases tab (0.39.271): a Versionium snapshot, then the repo's agent. Applying a nexus phase's code live still goes through the agent's injects and the apply gate by hand; RAID is not in that path yet.

---

## Copyright

Copyright © 2026 James Brooks (Erosmancer). Part of the rheon.world / NEXUS ecosystem.
