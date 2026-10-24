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

<!-- generated:registry:start -->

## What the registry knows (generated)

> Generated by `scripts/generate-atlases.js` from loom's registry and events (loom/data/registry.json, loom/data/events.json — data, outside the snapshot, so written plain) and the tree itself, 2026-10-24. Everything between the markers is rewritten on the next run — write narrative above them. The same facts, one component at a time, are what `lib/registry-harness.js` hands a repo agent (loom.card.tool).

**1190** files · **140** code files · **136** registry components declared here · **25** events emitted · **19** heard · **136** routes · **16** code files with a covering test

### Routes (136)

- DELETE /api/cos/compartments/:cid/remotes/:name — Remove a remote · declared in `idearium/registry-components.js`
- DELETE /api/ideas/:uuid — Archive (soft-delete) an idea · declared in `idearium/registry-components.js`
- DELETE /api/repos/:uuid — Archive a repo · declared in `idearium/registry-components.js`
- DELETE /api/repos/:uuid/agent/history — Clear this compartment's exchange log · declared in `idearium/registry-components.js`
- DELETE /api/repos/:uuid/agent/memory/:obs — Forget one observation, and drop it from the persona · declared in `idearium/registry-components.js`
- DELETE /api/repos/:uuid/ci/keys/:alias — Remove an SSH key alias from this compartment · declared in `idearium/registry-components.js`
- DELETE /api/repos/:uuid/ci/secrets/:name — Delete a CI secret from this compartment · declared in `idearium/registry-components.js`
- DELETE /api/repos/:uuid/hat — Revoke this repo's project agent · declared in `idearium/registry-components.js`
- DELETE /api/repos/:uuid/procedures/:id — Archive a procedure (never deleted) · declared in `idearium/registry-components.js`
- GET / — Service liveness check · declared in `idearium/registry-components.js`
- GET /api/context/directory — Every memory system and graph NEXUS keeps: tables, row counts, what each is, which tool reads it · declared in `idearium/registry-components.js`
- GET /api/context/get — The whole record behind a context hit (?source=&id=) · declared in `idearium/registry-components.js`
- GET /api/context/search — Search every memory system and graph at once (?q=&sources=&limit=); hits cite source + id · declared in `idearium/registry-components.js`
- GET /api/contract — Return idearium's API contract descriptor · declared in `idearium/registry-components.js`
- GET /api/cos/compartments — This machine's compartments, with their repo and remotes · declared in `idearium/registry-components.js`
- GET /api/cos/compartments/:cid/remotes — A compartment's remotes · declared in `idearium/registry-components.js`
- GET /api/cos/compartments/:cid/remotes/:name/status — in-sync / ahead / behind / diverged against a remote · declared in `idearium/registry-components.js`
- GET /api/cos/install — Install jobs for tools a run needs (QEMU, Python, Ruby, PHP, Go, Git) · declared in `idearium/registry-components.js`
- GET /api/cos/testenv — The COS test VM: available or not (and the fix), and the setup job's progress · declared in `idearium/registry-components.js`
- GET /api/events — Recent internal event log · declared in `idearium/registry-components.js`
- GET /api/gaps — List open gaps · declared in `idearium/registry-components.js`
- GET /api/gaps/:uuid — Get a single gap by uuid · declared in `idearium/registry-components.js`
- GET /api/ideas — List all ideas · declared in `idearium/registry-components.js`
- GET /api/ideas/:uuid — Get a single idea by uuid · declared in `idearium/registry-components.js`
- GET /api/ollama/check — Installed Ollama models and how every idearium caller would route through copilot's door (CT4) · declared in `idearium/registry-components.js`
- GET /api/ollama/models — Ollama's installed models via the ollama bridge (502 with the reason when unreachable) — the Agent tab's model dropdown · declared in `idearium/registry-components.js`
- GET /api/queue/:queueId — Get queue item status · declared in `idearium/registry-components.js`
- GET /api/repos — List ingested repos · declared in `idearium/registry-components.js`
- GET /api/repos/:uuid — Get a single repo by uuid · declared in `idearium/registry-components.js`
- GET /api/repos/:uuid/agent — This compartment's agent: hat, index state, learned count, session · declared in `idearium/registry-components.js`
- GET /api/repos/:uuid/agent/graph — The project map from graph.json, or one file's connections (?file=) · declared in `idearium/registry-components.js`
- GET /api/repos/:uuid/agent/history — This compartment's own exchange log, newest first · declared in `idearium/registry-components.js`
- GET /api/repos/:uuid/agent/late — Find this agent's late reply in the Responses index (read-only) · declared in `idearium/registry-components.js`
- GET /api/repos/:uuid/agent/memory — What this agent has learned working on the project · declared in `idearium/registry-components.js`
- GET /api/repos/:uuid/agent/route — Which model copilot's door would choose for this repo's agent, and the other hops (CT3) · declared in `idearium/registry-components.js`
- GET /api/repos/:uuid/agent/settings — This compartment agent's settings (inject mode, guardian switch + agent) · declared in `idearium/registry-components.js`
- GET /api/repos/:uuid/agent/tool-events — This repo agent's last tool calls, as reported live (CT8) · declared in `idearium/registry-components.js`
- GET /api/repos/:uuid/agent/tools — Copilot's tool catalog marked with this compartment's scope (all by default, or project); ?q= search · declared in `idearium/registry-components.js`
- GET /api/repos/:uuid/artifacts — Recent code artifacts from Guardian's store, for the Code tab's outputs panel (not yet repo-scoped, said) · declared in `idearium/registry-components.js`
- GET /api/repos/:uuid/ci — Read a compartment's CI pipeline definition · declared in `idearium/registry-components.js`
- GET /api/repos/:uuid/ci/keys — List SSH key aliases registered to this compartment (never key material) · declared in `idearium/registry-components.js`
- GET /api/repos/:uuid/ci/runs — List CI run history for a compartment · declared in `idearium/registry-components.js`
- GET /api/repos/:uuid/ci/runs/:runId — Get one CI run with full stage logs · declared in `idearium/registry-components.js`
- GET /api/repos/:uuid/ci/secrets — List CI secret names for this compartment (names only, never values) · declared in `idearium/registry-components.js`
- GET /api/repos/:uuid/context — Context search scoped to this repo: its import graph and its agent's learned memory, plus everything else · declared in `idearium/registry-components.js`
- GET /api/repos/:uuid/git — Git status: branch, remotes, ahead/behind, changed files, SSH key aliases · declared in `idearium/registry-components.js`
- GET /api/repos/:uuid/hat — Show this repo's project agent (hat), if forged · declared in `idearium/registry-components.js`
- GET /api/repos/:uuid/injects — This compartment's .inject nodes and its inject mode · declared in `idearium/registry-components.js`
- GET /api/repos/:uuid/injects/:id — One .inject with the file as it is now · declared in `idearium/registry-components.js`
- GET /api/repos/:uuid/lineage — Get a repo's fork lineage · declared in `idearium/registry-components.js`
- GET /api/repos/:uuid/procedures — The repo's replayable procedures (.procedure files) · declared in `idearium/registry-components.js`
- GET /api/repos/:uuid/proof — Per-chunk runtime proof: passed / failed / none / no_tests / unsupported / test, each with a stale flag against the current chunk hash · declared in `idearium/registry-components.js`
- GET /api/repos/:uuid/roadmap — A repo's roadmap: the phases in its phasemap files as dependency-ordered phase nodes (read with loom's parser) · declared in `idearium/registry-components.js`
- GET /api/repos/:uuid/run/capabilities — Which COS test environments are available here, and why not · declared in `idearium/registry-components.js`
- GET /api/repos/:uuid/run/options — The COS run menu for this repo: every option, and why any is unavailable · declared in `idearium/registry-components.js`
- GET /api/repos/:uuid/scan — Scan a repo for dangling hooks, gaps and tension · declared in `idearium/registry-components.js`
- GET /api/repos/:uuid/snapshots — List a repo's versionium snapshots, newest first · declared in `idearium/registry-components.js`
- GET /api/repos/:uuid/snapshots/:commitId — Read one repo snapshot record back from versionium · declared in `idearium/registry-components.js`
- GET /api/repos/:uuid/thread — One spec's blocks ⇄ the phases planned from them ⇄ their runs ⇄ files and changes, stale blocks named (RS9) · declared in `idearium/registry-components.js`
- GET /api/snapshots — List saved snapshots · declared in `idearium/registry-components.js`
- GET /api/snapshots/:a/diff/:b — Diff two snapshots · declared in `idearium/registry-components.js`
- GET /api/snapshots/:uuid — Get a single snapshot by uuid · declared in `idearium/registry-components.js`
- GET /api/snr — Current SNR (signal-to-noise) score · declared in `idearium/registry-components.js`
- GET /api/snr/history — Historical SNR score timeline · declared in `idearium/registry-components.js`
- GET /api/specs — List all specs · declared in `idearium/registry-components.js`
- GET /api/specs/:uuid — Get a single spec by uuid · declared in `idearium/registry-components.js`
- GET /api/specs/:uuid/export — Export a spec as a portable document · declared in `idearium/registry-components.js`
- GET /api/stats — Runtime stats — idea/spec/gap counts, SNR · declared in `idearium/registry-components.js`
- GET /api/workshop/templates — Every template the workshop's picker offers — the spec-document templates (genesis first), the COS archetypes and blueprints, the saved ones — each with its 11 parts previewed (RS5) · declared in `idearium/registry-components.js`
- GET /sse — Live SSE event stream · declared in `idearium/registry-components.js`
- PATCH /api/ideas/:uuid — Update an idea's fields · declared in `idearium/registry-components.js`
- PATCH /api/specs/:uuid — Update a spec's section content · declared in `idearium/registry-components.js`
- POST /api/cli/exec — Execute a unified CLI command · declared in `idearium/registry-components.js`
- POST /api/cos/compartments/:cid/remotes — Add a remote: a folder / synced drive, or user@host:path over ssh · declared in `idearium/registry-components.js`
- POST /api/cos/compartments/:cid/remotes/:name/pull — Pull from a remote; a backup of what it replaces is kept · declared in `idearium/registry-components.js`
- POST /api/cos/compartments/:cid/remotes/:name/push — Push the compartment (and its project folder) to a remote · declared in `idearium/registry-components.js`
- POST /api/cos/install — Install a tool a run needs — winget/brew/apt; started only by a click in the Run menu · declared in `idearium/registry-components.js`
- POST /api/cos/remote/browse — The compartments kept at a location · declared in `idearium/registry-components.js`
- POST /api/cos/remote/clone — Pull a compartment this machine does not have (its project becomes a repo) · declared in `idearium/registry-components.js`
- POST /api/cos/testenv/setup — Set up the COS test VM in the background (QEMU via winget on Windows, base image via cos/testenv/provision.js) · declared in `idearium/registry-components.js`
- POST /api/gaps — Open a new gap · declared in `idearium/registry-components.js`
- POST /api/gaps/:uuid/ignore — Mark a gap as ignored · declared in `idearium/registry-components.js`
- POST /api/gaps/:uuid/resolve — Resolve an open gap · declared in `idearium/registry-components.js`
- POST /api/git/clone — Clone a git URL into a new repo (same import rules as a zip) · declared in `idearium/registry-components.js`
- POST /api/ideas — Create a new idea from free text · declared in `idearium/registry-components.js`
- POST /api/ideas/:uuid/link — Link two ideas together · declared in `idearium/registry-components.js`
- POST /api/ideas/:uuid/phase — Advance an idea's lifecycle phase · declared in `idearium/registry-components.js`
- POST /api/ideas/:uuid/progress — Record progress against an idea · declared in `idearium/registry-components.js`
- POST /api/ideas/:uuid/spec — Promote an idea into a spec · declared in `idearium/registry-components.js`
- POST /api/ideas/:uuid/tension — Recompute tension score for an idea · declared in `idearium/registry-components.js`
- POST /api/ollama/check/ask — Ask one Ollama model a one-line question through copilot (CT4) · declared in `idearium/registry-components.js`
- POST /api/queue/:queueId/progress — Record progress against a queue item · declared in `idearium/registry-components.js`
- POST /api/repos — Ingest a repo's file tree as a new repo entry · declared in `idearium/registry-components.js`
- POST /api/repos/:uuid/agent/debug — What is wrong, from the systems: syntax, unresolved imports, recent failures, the intelligence system · declared in `idearium/registry-components.js`
- POST /api/repos/:uuid/agent/export — Materialise this compartment agent as portable .hat + .repo_agent node files · declared in `idearium/registry-components.js`
- POST /api/repos/:uuid/agent/import — Restore a compartment agent from an .agent (or a legacy .repo_agent) node file, merging its observations · declared in `idearium/registry-components.js`
- POST /api/repos/:uuid/agent/late — Adopt a late reply as the exchange's answer: learn, inject, log — once · declared in `idearium/registry-components.js`
- POST /api/repos/:uuid/agent/memory — Teach this agent something, and re-compose its live persona · declared in `idearium/registry-components.js`
- POST /api/repos/:uuid/agent/prompt — Dispatch one message as this compartment's agent, wearing its repo hat · declared in `idearium/registry-components.js`
- POST /api/repos/:uuid/agent/settings — Set inject mode, provider, ollamaModel (validated against Ollama's installed list), or useGuardian/guardianAgent · declared in `idearium/registry-components.js`
- POST /api/repos/:uuid/agent/stream — copilot sends what this repo agent's Ollama model writes, as it writes it — broadcast as idearium.repo.agent.feed (LS3) · declared in `idearium/registry-components.js`
- POST /api/repos/:uuid/agent/tool-event — copilot reports one of this repo agent's tool calls as it starts and ends (CT8) · declared in `idearium/registry-components.js`
- POST /api/repos/:uuid/agent/tools/run — Run one tool as a person, through the agent's door with this repo's scope (0.60.118 DK1) · declared in `idearium/registry-components.js`
- POST /api/repos/:uuid/chunk — Run the import pipeline (parse, atlas, chunk, verify, index) over a repo already on disk · declared in `idearium/registry-components.js`
- POST /api/repos/:uuid/ci/keys — Register an SSH key BY PATH under an alias, in the compartment vault · declared in `idearium/registry-components.js`
- POST /api/repos/:uuid/ci/run — Run the compartment CI pipeline in a real sandbox · declared in `idearium/registry-components.js`
- POST /api/repos/:uuid/ci/secrets — Store an encrypted CI secret in the compartment vault · declared in `idearium/registry-components.js`
- POST /api/repos/:uuid/fork — Fork a repo into a new lineage · declared in `idearium/registry-components.js`
- POST /api/repos/:uuid/git/commit — Commit every change in the repo folder · declared in `idearium/registry-components.js`
- POST /api/repos/:uuid/git/keygen — Create an ed25519 SSH key, register it to the compartment, return the public key · declared in `idearium/registry-components.js`
- POST /api/repos/:uuid/git/pull — Fast-forward pull; changed files are brought into the repo · declared in `idearium/registry-components.js`
- POST /api/repos/:uuid/git/push — Push to a remote with a compartment SSH key or git_token · declared in `idearium/registry-components.js`
- POST /api/repos/:uuid/git/remote — Set a git remote URL (https, ssh://, git@host:path) · declared in `idearium/registry-components.js`
- POST /api/repos/:uuid/hat — Forge the project agent for this repo, constrained to its compartment · declared in `idearium/registry-components.js`
- POST /api/repos/:uuid/hat/refresh — Re-ground the project agent's persona against the repo's current index · declared in `idearium/registry-components.js`
- POST /api/repos/:uuid/injects — Propose (optionally apply) a write of one file into this compartment · declared in `idearium/registry-components.js`
- POST /api/repos/:uuid/injects/:id/apply — Write a proposed .inject into the repo; refuses if the file changed · declared in `idearium/registry-components.js`
- POST /api/repos/:uuid/injects/:id/reject — Reject a proposed .inject · declared in `idearium/registry-components.js`
- POST /api/repos/:uuid/injects/:id/revert — Undo an applied .inject from its recorded prior content · declared in `idearium/registry-components.js`
- POST /api/repos/:uuid/procedures — Save tool calls as a procedure { name, steps: [{ tool, args }] } · declared in `idearium/registry-components.js`
- … 16 more (loom: GET /api/registry/component/<id>)

### Events it emits (25) — and who hears them

- **idearium.error** — from `idearium/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **idearium.gap.ignore** — from `idearium/cli/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **idearium.gap.ignored** — from `idearium/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **idearium.gap.open** — from `idearium/cli/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **idearium.gap.opened** — from `idearium/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **idearium.gap.resolve** — from `idearium/cli/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **idearium.gap.resolved** — from `idearium/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **idearium.idea.archive** — from `idearium/cli/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **idearium.idea.archived** — from `idearium/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **idearium.idea.create** — from `idearium/cli/index.js`, `idearium/lib/spec-library-import.js` +1 → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **idearium.idea.created** — from `idearium/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **idearium.idea.link** — from `idearium/cli/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **idearium.idea.linked** — from `idearium/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **idearium.idea.phase** — from `idearium/cli/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **idearium.idea.phase.changed** — from `idearium/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **idearium.idea.tension** — from `idearium/cli/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **idearium.idea.tensioned** — from `idearium/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **idearium.idea.update** — from `idearium/lib/spec-library-import.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **idearium.idea.updated** — from `idearium/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **idearium.spec.archived** — from `idearium/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **idearium.spec.check** — from `idearium/cli/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **idearium.spec.checked** — from `idearium/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **idearium.spec.create** — from `idearium/cli/index.js`, `idearium/test/e2e-pipeline.test.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **idearium.spec.created** — from `idearium/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)
- **idearium.spec.updated** — from `idearium/index.js` → no listener in the tree (heard over HTTP/SSE, or by nobody)

### Events it hears from elsewhere (19)

**change:changesCount** · **change:componentHovered** · **change:condition** · **change:currentView** · **change:dataResolver** · **change:device** · **change:lastTarget** · **change:maximumStackLength** · **change:open** · **change:provider** · **change:ready** · **change:selectedLayer** · **change:toolbar** · **change:zoom** · **frame:scroll** · **idearium.spec-engine.chunk.complete** · **idearium.spec.build.completed** · **loaded:all** · **rte:disable**

### Files, directory by directory (270 directories)

#### `idearium/`

6 code · 7 other file(s).

- `idearium/compiler-bridge.js` (256 lines)  
  exports compileIdeariumSpec · requires 1 · required by 0
- `idearium/config.js` (61 lines)  
  requires 0 · required by 1
- `idearium/event-taxonomy.cjs` (227 lines) — // idearium/event-taxonomy.cjs — idearium's own event taxonomy, in lib/event-taxonomy-pattern.js's ET1 shape. (.cjs: idearium/ is "type": "module".) // §0.39.302 — begun with the delivery checker…  
  requires 1 · required by 0
- `idearium/idearium-service.js` (104 lines) — // service/idearium-service.js — Idearium ICO Kernel Service // UUID: nexus-idearium-service-v1-0000-4000-0000-000000000001
- `idearium/index.js` (936 lines) — ╔══════════════════════════════════════════════════════════════════════════╗ ║ IdeaOS — idearium/core/index.js ║  
  exports VERSION, NAMESPACE, PORT, IDEA_PHASES, GAP_STATUSES, GAP_SEVERITIES +4 · requires 7 · required by 0 · emits idearium.error, idearium.gap.ignored, idearium.gap.opened, idearium.gap.resolved +10
- `idearium/registry-components.js` (210 lines) — // ── idearium/registry-components.js — Canonical component descriptors ─────── // UUID: idearium-registry-components-v1-0000-4000-0000-000000000001  
  exports COMPONENTS
- other: `idearium/CHANGES-2026-07-11-MERGE.md`, `idearium/CHANGES-2026-07-11.md`, `idearium/CHANGES-2026-09-21.md`, `idearium/compartment.json`, `idearium/idearium.config.json`, `idearium/interaction-contract.json`, `idearium/package.json`

#### `idearium/agent-suite/`

1 code file(s).

- `idearium/agent-suite/index.js` (438 lines) — Agent Tool Suite Phase: 40.5 — Agent Suite: full NEXUS tool access for spec builders  
  exports listRepositories, getRepository, getRepositoryMap, getRepositorySymbols, getRepositoryChunks, getRepositoryChunk +15 · requires 6 · required by 1

#### `idearium/api/`

2 code file(s).

- `idearium/api/build-surface.js` (405 lines)  
  exports filesState, deviationRecalc, deviationGet, afterVersion, afterFileChange, environmentGet +8 · requires 12 · required by 1
- `idearium/api/index.js` (11263 lines) — ╔══════════════════════════════════════════════════════════════════════════╗ ║ Idearium HTTP API — idearium/api/index.js ║  
  exports _setAgentAsk, _reconcileRunsForTest, _postPhaseFailureForTest, _agentAskForTest, _learnFromRejectionForTest, _verdictForTest +10 · requires 101 · required by 26

#### `idearium/architecture-spec/registry/`

14 code file(s).

- `idearium/architecture-spec/registry/api.js` (95 lines) — .architecture/registry/api.js — the real, cross-system-safe surface onto this registry. Other systems (copilot, agents, anything) reach  
  exports createRegistryApi, query, history
- `idearium/architecture-spec/registry/bundle.js` (22 lines) — .architecture/schema/bundle.js — NodeBundle schema + validator. A reference-only grouping of related node ids (a component with its  
  exports BUNDLE_SCHEMA, checkBundle
- `idearium/architecture-spec/registry/component.js` (21 lines) — .architecture/schema/component.js — Component node schema + validator. Restates loom/schema/component.js COMPONENT_SCHEMA unchanged; scoped  
  exports COMPONENT_SCHEMA, checkComponent
- `idearium/architecture-spec/registry/config.js` (21 lines) — .architecture/schema/config.js — Config node schema + validator. Deliberately minimal — a config node's whole point is that its value  
  exports CONFIG_SCHEMA, checkConfig
- `idearium/architecture-spec/registry/create-atlas.js` (129 lines) — .architecture/registry/create-atlas.js — scaffolds a new system atlas from atlas-template.md, pre-filling whatever a real .spec object  
  exports scaffoldAtlas, synthesize, toCortexMemory
- `idearium/architecture-spec/registry/decompose.js` (139 lines) — .architecture/registry/decompose.js — agnostic decomposition tool. Takes anything with declared seams (cut points) — a phasemap, a  
  exports findSeamsByTopLevelKeys, decomposePhasemap, migrateToSystemFolders, wireIntoRegistry
- `idearium/architecture-spec/registry/edit-atlas.js` (71 lines) — .architecture/registry/edit-atlas.js — edits ONE module section of an atlas.md by id, without touching anything else in the file. The  
  exports findSection, editSection
- `idearium/architecture-spec/registry/friction.js` (69 lines) — .architecture/registry/friction.js — per-system self-diagnostic score, computed live from the system's own registry state. Direct  
  exports computeFriction, computeTension, gapsFromSpecFile
- `idearium/architecture-spec/registry/hook.js` (36 lines) — .architecture/schema/hook.js — Hook node schema + validator. Restates loom/schema/hook.js HOOK_SCHEMA unchanged. type is an open  
  exports HOOK_SCHEMA, KNOWN_HOOK_TYPES, HOOK_DIRECTIONS, checkHook
- `idearium/architecture-spec/registry/lattice.js` (58 lines) — .architecture/compiler/lattice.js — compiles every Component/Hook/Wire node file into a single CompiledLattice. Generalization of  
  exports compileLattice
- `idearium/architecture-spec/registry/nexus-atlas-aggregate.js` (54 lines) — .architecture/registry/nexus-atlas-aggregate.js — rolls up idearium's real per-project atlas.json files (repository, fileCount, byLanguage,  
  exports aggregate
- `idearium/architecture-spec/registry/phases.js` (77 lines) — .architecture/registry/phases.js — Phase as a full node kind, not just prose in a phasemap doc. The point: querying "what's the state of  
  exports PHASE_SCHEMA, PHASE_STATUSES, checkPhase, summarize, oneLine
- `idearium/architecture-spec/registry/watcher.js` (84 lines) — .architecture/registry/watcher.js — live per-type node index + ledger. Generalization of guardian/lib/node-registry.js out of guardian and  
  exports createWatcher, NODE_TYPES
- `idearium/architecture-spec/registry/wire.js` (23 lines) — .architecture/schema/wire.js — Wire node schema + validator. Restates loom/schema/wire.js WIRE_SCHEMA unchanged. A wire is the  
  exports WIRE_SCHEMA, checkWire

#### `idearium/cli/`

3 code file(s).

- `idearium/cli/index.js` (1313 lines)  
  requires 5 · required by 0 · emits idearium.gap.ignore, idearium.gap.open, idearium.gap.resolve, idearium.idea.archive +6
- `idearium/cli/route-commands.js` (1379 lines) — §0.39.374: every capability is a command. James: "That was fantastic. Everything needs to be available as commands."  
  exports SPEC, ASK, makeRouteCommands, renderText, helpLines · requires 13 · required by 4 · tested by `diagnostic/tests/causality.test.js`, `tests/modules/test-cos-compartment-template.test.js` +6
- `idearium/cli/store-chatter.js` (11 lines) — §0.39.374: imported FIRST by idearium/cli/index.js (ES modules run their imports in order, before the importing module's own code). The store prints "[jaa] Loaded N rows …" (and IdeaOS,…

#### `idearium/copilot-adapter/`

1 code file(s).

- `idearium/copilot-adapter/index.js` (138 lines)  
  exports registerBackend, isConnected, suggest

#### `idearium/core/`

1 code file(s).

- `idearium/core/index.js` (8 lines) — // ── idearium/core/index.js ──────────────────────────────────────────────────── // Re-exports from idearium/index.js (the actual IdeaOS implementation).  
  exports getIdeaOS, VERSION, NAMESPACE, PORT, IDEA_PHASES, GAP_STATUSES +3 · requires 0 · required by 1 · tested by `idearium/test/e2e-pipeline.test.js`

#### `idearium/lib/`

17 code file(s).

- `idearium/lib/access.cjs` (187 lines) — who may act on Idearium (IA0, docs/2026-10-10-idearium-access-phasemap.spec). James, 2026-10-10: "what about a app password style login in idearium from clearglass panel, then we could accounts  
  exports MODULE_ID, VERSION, COOKIE, CAPS, createKey, listKeys +13 · requires 1 · required by 1
- `idearium/lib/architect.js` (438 lines)  
  exports TABLE, MODULE_ID, TIERS, LAYERS, DECISIONS, REUSE_AT +24 · requires 0 · required by 1
- `idearium/lib/chunk-nodes.js` (287 lines)  
  exports MODULE_ID, VERSION, toNodePayload, writeChunkNode, writeManifestChunkNodes, removeChunkNode +2 · requires 4 · required by 0
- `idearium/lib/config-core.cjs` (463 lines)  
  exports TABLE, ROW_UUID, CONFIG_FILE, SCHEMA, ALIASES, isLeaf +11 · requires 0 · required by 3 · tested by `tests/modules/test-repo-agent-provider.js`
- `idearium/lib/config.js` (174 lines)  
  exports getConfig, getValue, setConfig, resetConfig, describe, MODULE_ID +4 · requires 2 · required by 0
- `idearium/lib/cortex-listeners.js` (97 lines)  
  exports registerCortexListeners · requires 1 · required by 1 · hears idearium.spec-engine.chunk.complete, idearium.spec.build.completed
- `idearium/lib/data-dir.cjs` (44 lines) — the one answer to "where does idearium write?" §BUILT 2026-09-25 — seven files each computed this themselves  
  exports ideariumDataDir, ideariumLedgerDir, resolveIdeariumPath, REAL_DEFAULT · requires 1 · required by 9 · tested by `tests/modules/test-nexus-specs-and-ideas-cleanup.test.js`
- `idearium/lib/db.js` (191 lines)  
  exports loadTable, syncTable, flushTables, deleteRow, migrateOnce, appendRow +1 · requires 1 · required by 6
- `idearium/lib/event-ledger.cjs` (267 lines) — lib/event-ledger.js — Universal Event Ledger §LAW II — Memory Authority: JAA insert before behavior.  
  exports createEventLedger · requires 0 · required by 1 · tested by `tests/modules/test-idearium-cjs-under-esm.js`
- `idearium/lib/guardian-stream.cjs` (246 lines)  
  exports reconcileInFlightChunks, connectGuardianStream · requires 2 · required by 0
- `idearium/lib/idea-workbench.js` (179 lines) — the Compartment: where promoted ideas are worked component_id: idearium.workbench  
  exports LANES, LANE_IDS, ENTRY_STATUS, MEMBER_TABLE, ENTRY_TABLE, makeEntry +8 · tested by `idearium/test/idea-workbench.test.js`
- `idearium/lib/projects.cjs` (83 lines) — COSA10: every project of his on one screen, sorted by what moved last. James, 2026-10-16: "i figure cos could be helpfui for managing my projects so im not so overwhelmed." · "heklp wirth  
  exports VERSION, overview, isProject, isRaidContract, nextPhase · requires 0 · required by 1
- `idearium/lib/spec-container.cjs` (115 lines) — lib/spec-container.js — nexus-system.spec container format: parse + verify One place that knows how to read a project-level .spec container (the  
  exports readHeader, verifyAndDecode, MODULE_ID, VERSION · requires 0 · required by 1 · tested by `tests/modules/spec-container.test.js`, `tests/modules/test-idearium-cjs-under-esm.js`
- `idearium/lib/spec-library-import.js` (189 lines) — James's spec library into Idearium: each unique document an idea, its text a spec split into its own sections, the original bytes kept. Master phasemap IL1 (0.39.290).  
  exports listLibrary, importLibrary, slugOf, findRow, specFileText, toPipeline · requires 3 · required by 2 · emits idearium.idea.create, idearium.idea.update
- `idearium/lib/surface-state.cjs` (75 lines) — the Code tab's surface, kept by Nexus so the CLI and agents see what the tab sees (CE8) Map: docs/2026-10-15-code-tab-run-state-phasemap.spec (CE8_the_cli_reads_the_surface)  
  exports MODULE_ID, VERSION, BY, get, set, empty +1 · requires 1 · required by 3
- `idearium/lib/void.js` (208 lines) — the spatial void: where James's ideas are born and worked (0.39.295 V2). component_id: idearium.void  
  exports MODULE_ID, ECHO_TABLE, CREATIVITY, STABILITY, ECHO_KINDS, MAX_IDEA +15 · requires 1 · required by 1
- `idearium/lib/workshop.js` (470 lines)  
  exports TABLE, MODULE_ID, AMBITION, FEEDS, FEED_IDS, PART_TIERS +24 · requires 0 · required by 2

#### `idearium/output/`

1 other file(s).

- other: `idearium/output/.gitkeep`

#### `idearium/phases/`

1 other file(s).

- other: `idearium/phases/INDEX.md`

#### `idearium/phases/2026-08-28-definition-of-complete/`

1 other file(s).

- other: `idearium/phases/2026-08-28-definition-of-complete/DOD3_build_using_idearium.phase`

#### `idearium/phases/2026-08-28-definition-of-complete/graph/`

1 other file(s).

- other: `idearium/phases/2026-08-28-definition-of-complete/graph/DOD3_build_using_idearium-2c5d5dfc92a15b2a.graph`

#### `idearium/phases/2026-08-28-definition-of-complete/graph/_superseded/`

1 other file(s).

- other: `idearium/phases/2026-08-28-definition-of-complete/graph/_superseded/DOD3_build_using_idearium-081cb2e45bf759cd.graph`

#### `idearium/phases/2026-08-28-self-building-pipeline/`

1 other file(s).

- other: `idearium/phases/2026-08-28-self-building-pipeline/SBP1_reconcile_repo_layer_vs_cos_compartment.phase`

#### `idearium/phases/2026-08-28-self-building-pipeline/graph/`

1 other file(s).

- other: `idearium/phases/2026-08-28-self-building-pipeline/graph/SBP1_reconcile_repo_layer_vs_cos_compartment-811af61fec93be21.graph`

#### `idearium/phases/2026-09-01-living-model-and-autonomous-pipeline/`

1 other file(s).

- other: `idearium/phases/2026-09-01-living-model-and-autonomous-pipeline/LM19_atlas_spec_coverage_prerequisite.phase`

#### `idearium/phases/2026-09-01-living-model-and-autonomous-pipeline/graph/`

1 other file(s).

- other: `idearium/phases/2026-09-01-living-model-and-autonomous-pipeline/graph/LM19_atlas_spec_coverage_prerequisite-d1e7eeff5ad6364d.graph`

#### `idearium/phases/2026-09-01-living-model-and-autonomous-pipeline/graph/_superseded/`

1 other file(s).

- other: `idearium/phases/2026-09-01-living-model-and-autonomous-pipeline/graph/_superseded/LM19_atlas_spec_coverage_prerequisite-8a1244b9d4b5690b.graph`

#### `idearium/phases/2026-09-05-observability-sovereignty-and-agent-mesh/`

1 other file(s).

- other: `idearium/phases/2026-09-05-observability-sovereignty-and-agent-mesh/ID2_verify_idearium_reconciliation_reads_right_store.phase`

#### `idearium/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/`

1 other file(s).

- other: `idearium/phases/2026-09-05-observability-sovereignty-and-agent-mesh/graph/ID2_verify_idearium_reconciliation_reads_right_store-3298f9ee81c629d7.graph`

#### `idearium/phases/2026-09-11-compartment-nodetype-and-reorg/`

1 other file(s).

- other: `idearium/phases/2026-09-11-compartment-nodetype-and-reorg/T2_idearium_genesis_alignment.phase`

#### `idearium/phases/2026-09-11-compartment-nodetype-and-reorg/graph/`

1 other file(s).

- other: `idearium/phases/2026-09-11-compartment-nodetype-and-reorg/graph/T2_idearium_genesis_alignment-155669da42eb09b4.graph`

#### `idearium/phases/2026-09-13-axiom-5-2-raid-routing/`

1 other file(s).

- other: `idearium/phases/2026-09-13-axiom-5-2-raid-routing/MCO7_map_real_proxy_traffic.phase`

#### `idearium/phases/2026-09-13-axiom-5-2-raid-routing/graph/`

1 other file(s).

- other: `idearium/phases/2026-09-13-axiom-5-2-raid-routing/graph/MCO7_map_real_proxy_traffic-d1cfa064e384adfe.graph`

#### `idearium/phases/2026-09-13-axiom-5-2-raid-routing/graph/_superseded/`

1 other file(s).

- other: `idearium/phases/2026-09-13-axiom-5-2-raid-routing/graph/_superseded/MCO7_map_real_proxy_traffic-5b0ac9cdc5f323dc.graph`

#### `idearium/phases/2026-09-26-cos-testenv-vm-and-nexus-atlas/`

2 other file(s).

- other: `idearium/phases/2026-09-26-cos-testenv-vm-and-nexus-atlas/N1.phase`, `idearium/phases/2026-09-26-cos-testenv-vm-and-nexus-atlas/T6.phase`

#### `idearium/phases/2026-09-26-cos-testenv-vm-and-nexus-atlas/graph/`

2 other file(s).

- other: `idearium/phases/2026-09-26-cos-testenv-vm-and-nexus-atlas/graph/N1-3390cee61d2ebd05.graph`, `idearium/phases/2026-09-26-cos-testenv-vm-and-nexus-atlas/graph/T6-c2c6902939c1f533.graph`

#### `idearium/phases/2026-09-26-cos-testenv-vm-and-nexus-atlas/graph/_superseded/`

1 other file(s).

- other: `idearium/phases/2026-09-26-cos-testenv-vm-and-nexus-atlas/graph/_superseded/T6-3810abea7c97f392.graph`

#### `idearium/phases/2026-09-26-guardian-retry-novelty-and-installs/`

1 other file(s).

- other: `idearium/phases/2026-09-26-guardian-retry-novelty-and-installs/I1.phase`

#### `idearium/phases/2026-09-26-guardian-retry-novelty-and-installs/graph/`

1 other file(s).

- other: `idearium/phases/2026-09-26-guardian-retry-novelty-and-installs/graph/I1-647d5aac3c7988e9.graph`

#### `idearium/phases/2026-09-26-guardian-retry-novelty-and-installs/graph/_superseded/`

1 other file(s).

- other: `idearium/phases/2026-09-26-guardian-retry-novelty-and-installs/graph/_superseded/I1-3e215fa27c0ef67b.graph`

#### `idearium/phases/2026-09-27-agent-hat-memory-download-manager/`

3 other file(s).

- other: `idearium/phases/2026-09-27-agent-hat-memory-download-manager/G5.phase`, `idearium/phases/2026-09-27-agent-hat-memory-download-manager/H3.phase`, `idearium/phases/2026-09-27-agent-hat-memory-download-manager/M5.phase`

#### `idearium/phases/2026-09-27-agent-hat-memory-download-manager/graph/`

3 other file(s).

- other: `idearium/phases/2026-09-27-agent-hat-memory-download-manager/graph/G5-35fe9a2cfba852af.graph`, `idearium/phases/2026-09-27-agent-hat-memory-download-manager/graph/H3-6062a911dd3b1004.graph`, `idearium/phases/2026-09-27-agent-hat-memory-download-manager/graph/M5-a7d40b614779d356.graph`

#### `idearium/phases/2026-09-27-agent-hat-memory-download-manager/graph/_superseded/`

3 other file(s).

- other: `idearium/phases/2026-09-27-agent-hat-memory-download-manager/graph/_superseded/G5-48560a4db949405d.graph`, `idearium/phases/2026-09-27-agent-hat-memory-download-manager/graph/_superseded/H3-0ab7eb9f0c2f66ba.graph`, `idearium/phases/2026-09-27-agent-hat-memory-download-manager/graph/_superseded/M5-757541e5426618eb.graph`

#### `idearium/phases/2026-09-27-components-store-and-atlases/`

2 other file(s).

- other: `idearium/phases/2026-09-27-components-store-and-atlases/A3.phase`, `idearium/phases/2026-09-27-components-store-and-atlases/C2.phase`

#### `idearium/phases/2026-09-27-components-store-and-atlases/graph/`

2 other file(s).

- other: `idearium/phases/2026-09-27-components-store-and-atlases/graph/A3-fe538cfb63c95924.graph`, `idearium/phases/2026-09-27-components-store-and-atlases/graph/C2-475e009c5b37b3fa.graph`

#### `idearium/phases/2026-09-27-components-store-and-atlases/graph/_superseded/`

2 other file(s).

- other: `idearium/phases/2026-09-27-components-store-and-atlases/graph/_superseded/A3-0b6cdaaf9610556c.graph`, `idearium/phases/2026-09-27-components-store-and-atlases/graph/_superseded/C2-cd615ce780f27fd5.graph`

#### `idearium/phases/2026-09-27-idearium-atlas/`

3 other file(s).

- other: `idearium/phases/2026-09-27-idearium-atlas/A1.phase`, `idearium/phases/2026-09-27-idearium-atlas/A3.phase`, `idearium/phases/2026-09-27-idearium-atlas/A4.phase`

#### `idearium/phases/2026-09-27-idearium-atlas/graph/`

3 other file(s).

- other: `idearium/phases/2026-09-27-idearium-atlas/graph/A1-07c090325d3ac0fe.graph`, `idearium/phases/2026-09-27-idearium-atlas/graph/A3-45d18c7975a04b6f.graph`, `idearium/phases/2026-09-27-idearium-atlas/graph/A4-05516e0391cf85cd.graph`

#### `idearium/phases/2026-09-27-one-idearium-phases-living-spec-nodes/`

7 other file(s).

- other: `idearium/phases/2026-09-27-one-idearium-phases-living-spec-nodes/N1_one_idearium.phase`, `idearium/phases/2026-09-27-one-idearium-phases-living-spec-nodes/P2_phases_model.phase`, `idearium/phases/2026-09-27-one-idearium-phases-living-spec-nodes/P3_phase_build.phase`, `idearium/phases/2026-09-27-one-idearium-phases-living-spec-nodes/P4_phases_ui.phase`, `idearium/phases/2026-09-27-one-idearium-phases-living-spec-nodes/S1_living_spec.phase`, `idearium/phases/2026-09-27-one-idearium-phases-living-spec-nodes/S2_spec_tab.phase`, `idearium/phases/2026-09-27-one-idearium-phases-living-spec-nodes/V2_nexus_versionium_view.phase`

#### `idearium/phases/2026-09-27-one-idearium-phases-living-spec-nodes/graph/`

7 other file(s).

- other: `idearium/phases/2026-09-27-one-idearium-phases-living-spec-nodes/graph/N1_one_idearium-5fda47e81740f919.graph`, `idearium/phases/2026-09-27-one-idearium-phases-living-spec-nodes/graph/P2_phases_model-e0d1d0e1adee4483.graph`, `idearium/phases/2026-09-27-one-idearium-phases-living-spec-nodes/graph/P3_phase_build-292fa8f77ef21e93.graph`, `idearium/phases/2026-09-27-one-idearium-phases-living-spec-nodes/graph/P4_phases_ui-35f5c870235cabfb.graph`, `idearium/phases/2026-09-27-one-idearium-phases-living-spec-nodes/graph/S1_living_spec-eddc774bb495b77a.graph`, `idearium/phases/2026-09-27-one-idearium-phases-living-spec-nodes/graph/S2_spec_tab-13a6b256674ca997.graph`, `idearium/phases/2026-09-27-one-idearium-phases-living-spec-nodes/graph/V2_nexus_versionium_view-28173b4bbc41fa24.graph`

#### `idearium/phases/2026-09-27-one-idearium-phases-living-spec-nodes/graph/_superseded/`

4 other file(s).

- other: `idearium/phases/2026-09-27-one-idearium-phases-living-spec-nodes/graph/_superseded/P2_phases_model-816d5f0b94fe19d0.graph`, `idearium/phases/2026-09-27-one-idearium-phases-living-spec-nodes/graph/_superseded/P3_phase_build-bb6a1484090698da.graph`, `idearium/phases/2026-09-27-one-idearium-phases-living-spec-nodes/graph/_superseded/S1_living_spec-54457ecfb317ec4d.graph`, `idearium/phases/2026-09-27-one-idearium-phases-living-spec-nodes/graph/_superseded/V2_nexus_versionium_view-68284806b8692565.graph`

#### `idearium/phases/2026-09-27-registry-harness-and-stability/`

7 other file(s).

- other: `idearium/phases/2026-09-27-registry-harness-and-stability/H2.phase`, `idearium/phases/2026-09-27-registry-harness-and-stability/H3.phase`, `idearium/phases/2026-09-27-registry-harness-and-stability/H4.phase`, `idearium/phases/2026-09-27-registry-harness-and-stability/H5.phase`, `idearium/phases/2026-09-27-registry-harness-and-stability/S2.phase`, `idearium/phases/2026-09-27-registry-harness-and-stability/S3.phase`, `idearium/phases/2026-09-27-registry-harness-and-stability/S4.phase`

#### `idearium/phases/2026-09-27-registry-harness-and-stability/graph/`

7 other file(s).

- other: `idearium/phases/2026-09-27-registry-harness-and-stability/graph/H2-37211885df010962.graph`, `idearium/phases/2026-09-27-registry-harness-and-stability/graph/H3-017eb2a36885874c.graph`, `idearium/phases/2026-09-27-registry-harness-and-stability/graph/H4-92d77964b48812eb.graph`, `idearium/phases/2026-09-27-registry-harness-and-stability/graph/H5-03cc29d13bf3176d.graph`, `idearium/phases/2026-09-27-registry-harness-and-stability/graph/S2-a5388d560a488d09.graph`, `idearium/phases/2026-09-27-registry-harness-and-stability/graph/S3-985bc267d1aa1096.graph`, `idearium/phases/2026-09-27-registry-harness-and-stability/graph/S4-93fcd1d9647f0653.graph`

#### `idearium/phases/2026-09-27-registry-harness-and-stability/graph/_superseded/`

2 other file(s).

- other: `idearium/phases/2026-09-27-registry-harness-and-stability/graph/_superseded/S3-de417ceb54735a28.graph`, `idearium/phases/2026-09-27-registry-harness-and-stability/graph/_superseded/S4-d3b6ee7978d85cca.graph`

#### `idearium/phases/2026-09-28-graph-build-context-settings-memory/`

10 other file(s).

- other: `idearium/phases/2026-09-28-graph-build-context-settings-memory/B0.phase`, `idearium/phases/2026-09-28-graph-build-context-settings-memory/B3.phase`, `idearium/phases/2026-09-28-graph-build-context-settings-memory/C0.phase`, `idearium/phases/2026-09-28-graph-build-context-settings-memory/G0.phase`, `idearium/phases/2026-09-28-graph-build-context-settings-memory/G1.phase`, `idearium/phases/2026-09-28-graph-build-context-settings-memory/G2.phase`, `idearium/phases/2026-09-28-graph-build-context-settings-memory/G3.phase`, `idearium/phases/2026-09-28-graph-build-context-settings-memory/R1.phase`, `idearium/phases/2026-09-28-graph-build-context-settings-memory/R2.phase`, `idearium/phases/2026-09-28-graph-build-context-settings-memory/SV0.phase`

#### `idearium/phases/2026-09-28-graph-build-context-settings-memory/graph/`

10 other file(s).

- other: `idearium/phases/2026-09-28-graph-build-context-settings-memory/graph/B0-992bea3e63ed402c.graph`, `idearium/phases/2026-09-28-graph-build-context-settings-memory/graph/B3-d58404b70218a8eb.graph`, `idearium/phases/2026-09-28-graph-build-context-settings-memory/graph/C0-4d9c025b697816d2.graph`, `idearium/phases/2026-09-28-graph-build-context-settings-memory/graph/G0-a214982f7f87efc5.graph`, `idearium/phases/2026-09-28-graph-build-context-settings-memory/graph/G1-f85015d13bbbc49d.graph`, `idearium/phases/2026-09-28-graph-build-context-settings-memory/graph/G2-0901ec7498435dd0.graph`, `idearium/phases/2026-09-28-graph-build-context-settings-memory/graph/G3-528cf353349dea70.graph`, `idearium/phases/2026-09-28-graph-build-context-settings-memory/graph/R1-ec37c4f3de4fb0de.graph`, `idearium/phases/2026-09-28-graph-build-context-settings-memory/graph/R2-143266eaaab6ca03.graph`, `idearium/phases/2026-09-28-graph-build-context-settings-memory/graph/SV0-52bc14057534aec7.graph`

#### `idearium/phases/2026-09-28-graph-build-context-settings-memory/graph/_superseded/`

3 other file(s).

- other: `idearium/phases/2026-09-28-graph-build-context-settings-memory/graph/_superseded/B0-933386e010c3ebb1.graph`, `idearium/phases/2026-09-28-graph-build-context-settings-memory/graph/_superseded/C0-32aeb3adb8f9dce3.graph`, `idearium/phases/2026-09-28-graph-build-context-settings-memory/graph/_superseded/R2-626eb489d1376cbe.graph`

#### `idearium/phases/2026-09-29-build-surface/`

12 other file(s).

- other: `idearium/phases/2026-09-29-build-surface/BS10_settings_and_environment_ui.phase`, `idearium/phases/2026-09-29-build-surface/BS11_plan_panel.phase`, `idearium/phases/2026-09-29-build-surface/BS13_provider_sovereignty.phase`, `idearium/phases/2026-09-29-build-surface/BS15_code_repo_delete.phase`, `idearium/phases/2026-09-29-build-surface/BS18_sync_ci_theme.phase`, `idearium/phases/2026-09-29-build-surface/BS2_file_states.phase`, `idearium/phases/2026-09-29-build-surface/BS3_baseline_deviation.phase`, `idearium/phases/2026-09-29-build-surface/BS5_spec_to_phasemap.phase`, `idearium/phases/2026-09-29-build-surface/BS6_build_plan.phase`, `idearium/phases/2026-09-29-build-surface/BS7_api.phase`, `idearium/phases/2026-09-29-build-surface/BS8_files_ui.phase`, `idearium/phases/2026-09-29-build-surface/BS9_spec_and_phase_build_ui.phase`

#### `idearium/phases/2026-09-29-build-surface/graph/`

12 other file(s).

- other: `idearium/phases/2026-09-29-build-surface/graph/BS10_settings_and_environment_ui-e7b1f0a8ff8eb8f9.graph`, `idearium/phases/2026-09-29-build-surface/graph/BS11_plan_panel-90c293ef2576305c.graph`, `idearium/phases/2026-09-29-build-surface/graph/BS13_provider_sovereignty-486df72e06026e3c.graph`, `idearium/phases/2026-09-29-build-surface/graph/BS15_code_repo_delete-068a129d7d06e9e3.graph`, `idearium/phases/2026-09-29-build-surface/graph/BS18_sync_ci_theme-58d5e571901660d4.graph`, `idearium/phases/2026-09-29-build-surface/graph/BS2_file_states-f0c78c53f55cc0ca.graph`, `idearium/phases/2026-09-29-build-surface/graph/BS3_baseline_deviation-caf5c578ba0ab542.graph`, `idearium/phases/2026-09-29-build-surface/graph/BS5_spec_to_phasemap-3d49ffccdcc03a7d.graph`, `idearium/phases/2026-09-29-build-surface/graph/BS6_build_plan-d849379e83770f3b.graph`, `idearium/phases/2026-09-29-build-surface/graph/BS7_api-445f01cbf00b465a.graph`, `idearium/phases/2026-09-29-build-surface/graph/BS8_files_ui-c46c3ff81f3ff946.graph`, `idearium/phases/2026-09-29-build-surface/graph/BS9_spec_and_phase_build_ui-1dcee63c429e1ed4.graph`

#### `idearium/phases/2026-09-29-build-surface/graph/_superseded/`

3 other file(s).

- other: `idearium/phases/2026-09-29-build-surface/graph/_superseded/BS13_provider_sovereignty-a2118e304b33e3d9.graph`, `idearium/phases/2026-09-29-build-surface/graph/_superseded/BS15_code_repo_delete-adf5a2f3bb4f53af.graph`, `idearium/phases/2026-09-29-build-surface/graph/_superseded/BS7_api-557eb6b884c71f12.graph`

#### `idearium/phases/2026-09-29-nex-node-store/`

3 other file(s).

- other: `idearium/phases/2026-09-29-nex-node-store/N12_ui.phase`, `idearium/phases/2026-09-29-nex-node-store/N16_settings_without_iframes.phase`, `idearium/phases/2026-09-29-nex-node-store/N25_manage_button_enterprise.phase`

#### `idearium/phases/2026-09-29-nex-node-store/graph/`

3 other file(s).

- other: `idearium/phases/2026-09-29-nex-node-store/graph/N12_ui-278ef4d8f071d90f.graph`, `idearium/phases/2026-09-29-nex-node-store/graph/N16_settings_without_iframes-81ecfb6e1dbf2207.graph`, `idearium/phases/2026-09-29-nex-node-store/graph/N25_manage_button_enterprise-76b8735454ef17a9.graph`

#### `idearium/phases/2026-09-29-provider-economy/`

1 other file(s).

- other: `idearium/phases/2026-09-29-provider-economy/EC8_economy_console.phase`

#### `idearium/phases/2026-09-29-provider-economy/graph/`

1 other file(s).

- other: `idearium/phases/2026-09-29-provider-economy/graph/EC8_economy_console-1c0b6cc758fb1254.graph`

#### `idearium/phases/2026-09-29-provider-economy/graph/_superseded/`

1 other file(s).

- other: `idearium/phases/2026-09-29-provider-economy/graph/_superseded/EC8_economy_console-1d70149370aba577.graph`

#### `idearium/phases/2026-09-30-idearium-coding-flow/`

4 other file(s).

- other: `idearium/phases/2026-09-30-idearium-coding-flow/W2_plan_always_lands.phase`, `idearium/phases/2026-09-30-idearium-coding-flow/W3_work_surface.phase`, `idearium/phases/2026-09-30-idearium-coding-flow/W4_navigation.phase`, `idearium/phases/2026-09-30-idearium-coding-flow/W5_theme_and_css.phase`

#### `idearium/phases/2026-09-30-idearium-coding-flow/graph/`

4 other file(s).

- other: `idearium/phases/2026-09-30-idearium-coding-flow/graph/W2_plan_always_lands-ab26ca62c4c01f00.graph`, `idearium/phases/2026-09-30-idearium-coding-flow/graph/W3_work_surface-6cad9557f773c08a.graph`, `idearium/phases/2026-09-30-idearium-coding-flow/graph/W4_navigation-5dd9ebc74f199860.graph`, `idearium/phases/2026-09-30-idearium-coding-flow/graph/W5_theme_and_css-ec86ed1c0f589dd1.graph`

#### `idearium/phases/2026-09-30-idearium-coding-flow/graph/_superseded/`

1 other file(s).

- other: `idearium/phases/2026-09-30-idearium-coding-flow/graph/_superseded/W3_work_surface-d22aa3fd5498f953.graph`

#### `idearium/phases/2026-10-01-idearium-agent-ready-master/`

30 other file(s).

- other: 30 files (.phase)

#### `idearium/phases/2026-10-01-idearium-agent-ready-master/graph/`

30 other file(s).

- other: 30 files (.graph)

#### `idearium/phases/2026-10-01-idearium-agent-ready-master/graph/_superseded/`

10 other file(s).

- other: `idearium/phases/2026-10-01-idearium-agent-ready-master/graph/_superseded/BK1_blocked_is_actionable-01332261b8dcdc42.graph`, `idearium/phases/2026-10-01-idearium-agent-ready-master/graph/_superseded/BK2_phase_build_writes_code-44c59481c9cd44ba.graph`, `idearium/phases/2026-10-01-idearium-agent-ready-master/graph/_superseded/DK2_desktop_setup_popup-334decc7beb3a1fe.graph`, `idearium/phases/2026-10-01-idearium-agent-ready-master/graph/_superseded/DT3_failure_modes_routes_and_preflight-16167e797e66f7b5.graph`, `idearium/phases/2026-10-01-idearium-agent-ready-master/graph/_superseded/IL1_spec_library_as_ideas-562cd46bda388a55.graph`, `idearium/phases/2026-10-01-idearium-agent-ready-master/graph/_superseded/IL2_library_spec_into_the_pipeline-db5333e7b31f7131.graph`, `idearium/phases/2026-10-01-idearium-agent-ready-master/graph/_superseded/PF1_sync_names_its_slow_step-a427008df9c74099.graph`, `idearium/phases/2026-10-01-idearium-agent-ready-master/graph/_superseded/PF6_boot_sync_yields_to_the_person-f8e349719667eff2.graph`, `idearium/phases/2026-10-01-idearium-agent-ready-master/graph/_superseded/PF8_settings_console_one_cheap_read-8b3388d417799343.graph`, `idearium/phases/2026-10-01-idearium-agent-ready-master/graph/_superseded/PV3_prove_loop-1b213b5688552009.graph`

#### `idearium/phases/2026-10-01-routing-registry-genesis/`

6 other file(s).

- other: `idearium/phases/2026-10-01-routing-registry-genesis/GN1_genesis.phase`, `idearium/phases/2026-10-01-routing-registry-genesis/RC1_registry_block.phase`, `idearium/phases/2026-10-01-routing-registry-genesis/RC2_registry_as_nodes.phase`, `idearium/phases/2026-10-01-routing-registry-genesis/RG2_routing_config_api_cli.phase`, `idearium/phases/2026-10-01-routing-registry-genesis/RG3_dispatch_uses_the_route.phase`, `idearium/phases/2026-10-01-routing-registry-genesis/RG4_routing_ui.phase`

#### `idearium/phases/2026-10-01-routing-registry-genesis/graph/`

6 other file(s).

- other: `idearium/phases/2026-10-01-routing-registry-genesis/graph/GN1_genesis-9c19816095e79246.graph`, `idearium/phases/2026-10-01-routing-registry-genesis/graph/RC1_registry_block-54c0652a67274b90.graph`, `idearium/phases/2026-10-01-routing-registry-genesis/graph/RC2_registry_as_nodes-a9280f81af0fea0f.graph`, `idearium/phases/2026-10-01-routing-registry-genesis/graph/RG2_routing_config_api_cli-6c5f9f6ce060c588.graph`, `idearium/phases/2026-10-01-routing-registry-genesis/graph/RG3_dispatch_uses_the_route-0bd61a37342a8efe.graph`, `idearium/phases/2026-10-01-routing-registry-genesis/graph/RG4_routing_ui-0480ecf02ae62d8c.graph`

#### `idearium/phases/2026-10-01-routing-registry-genesis/graph/_superseded/`

3 other file(s).

- other: `idearium/phases/2026-10-01-routing-registry-genesis/graph/_superseded/RC2_registry_as_nodes-89682c310007557f.graph`, `idearium/phases/2026-10-01-routing-registry-genesis/graph/_superseded/RG2_routing_config_api_cli-8fdd3d0d4da406d6.graph`, `idearium/phases/2026-10-01-routing-registry-genesis/graph/_superseded/RG3_dispatch_uses_the_route-d3d17279f019b332.graph`

#### `idearium/phases/2026-10-01-work-visibility-job-reuse/`

5 other file(s).

- other: `idearium/phases/2026-10-01-work-visibility-job-reuse/D0.phase`, `idearium/phases/2026-10-01-work-visibility-job-reuse/D2.phase`, `idearium/phases/2026-10-01-work-visibility-job-reuse/J2.phase`, `idearium/phases/2026-10-01-work-visibility-job-reuse/J3.phase`, `idearium/phases/2026-10-01-work-visibility-job-reuse/J6.phase`

#### `idearium/phases/2026-10-01-work-visibility-job-reuse/graph/`

5 other file(s).

- other: `idearium/phases/2026-10-01-work-visibility-job-reuse/graph/D0-9d3915eec49d61ad.graph`, `idearium/phases/2026-10-01-work-visibility-job-reuse/graph/D2-0622afce43bf66fc.graph`, `idearium/phases/2026-10-01-work-visibility-job-reuse/graph/J2-1f917a31667ef7f8.graph`, `idearium/phases/2026-10-01-work-visibility-job-reuse/graph/J3-7c8a64dbe9e7d597.graph`, `idearium/phases/2026-10-01-work-visibility-job-reuse/graph/J6-979de7d0b1f5d065.graph`

#### `idearium/phases/2026-10-01-work-visibility-job-reuse/graph/_superseded/`

3 other file(s).

- other: `idearium/phases/2026-10-01-work-visibility-job-reuse/graph/_superseded/D0-c46d86f5fed6ba44.graph`, `idearium/phases/2026-10-01-work-visibility-job-reuse/graph/_superseded/J2-2dbf1ea4ae7e7b8c.graph`, `idearium/phases/2026-10-01-work-visibility-job-reuse/graph/_superseded/J6-e6e3f0df4bcd8345.graph`

#### `idearium/phases/2026-10-02-emerge-field-memory-build/`

13 other file(s).

- other: 13 files (.phase)

#### `idearium/phases/2026-10-02-emerge-field-memory-build/graph/`

13 other file(s).

- other: 13 files (.graph)

#### `idearium/phases/2026-10-02-emerge-field-memory-build/graph/_superseded/`

5 other file(s).

- other: `idearium/phases/2026-10-02-emerge-field-memory-build/graph/_superseded/FV0_fulfil_a_taken_order-848e1bff5519633a.graph`, `idearium/phases/2026-10-02-emerge-field-memory-build/graph/_superseded/PH1_phase_runs_end_in_proof-9ce02babee77ae98.graph`, `idearium/phases/2026-10-02-emerge-field-memory-build/graph/_superseded/PR1_proof_run_the_delivery_checker-621112f06399821f.graph`, `idearium/phases/2026-10-02-emerge-field-memory-build/graph/_superseded/RC1_the_repo_main_chat-f42bc647bfb8ea76.graph`, `idearium/phases/2026-10-02-emerge-field-memory-build/graph/_superseded/ST1_settings-c4d6d286b5d353b4.graph`

#### `idearium/phases/2026-10-02-fractal-graph-any-size-agent/`

7 other file(s).

- other: `idearium/phases/2026-10-02-fractal-graph-any-size-agent/FG1_containment_tree.phase`, `idearium/phases/2026-10-02-fractal-graph-any-size-agent/FG3_summaries_up_the_tree.phase`, `idearium/phases/2026-10-02-fractal-graph-any-size-agent/FG4_context_for_any_agent.phase`, `idearium/phases/2026-10-02-fractal-graph-any-size-agent/FG5_recursive_build.phase`, `idearium/phases/2026-10-02-fractal-graph-any-size-agent/FG6_relations_and_fractals.phase`, `idearium/phases/2026-10-02-fractal-graph-any-size-agent/UV1_versioned_ui_compartments.phase`, `idearium/phases/2026-10-02-fractal-graph-any-size-agent/WS5_the_whole_workshop.phase`

#### `idearium/phases/2026-10-02-fractal-graph-any-size-agent/graph/`

7 other file(s).

- other: `idearium/phases/2026-10-02-fractal-graph-any-size-agent/graph/FG1_containment_tree-aaca074a00f1ef2c.graph`, `idearium/phases/2026-10-02-fractal-graph-any-size-agent/graph/FG3_summaries_up_the_tree-b2a59b562ac95c2c.graph`, `idearium/phases/2026-10-02-fractal-graph-any-size-agent/graph/FG4_context_for_any_agent-b0b88cad66b15693.graph`, `idearium/phases/2026-10-02-fractal-graph-any-size-agent/graph/FG5_recursive_build-d7d26bf687a1ce83.graph`, `idearium/phases/2026-10-02-fractal-graph-any-size-agent/graph/FG6_relations_and_fractals-8a43ab6d43bbcebd.graph`, `idearium/phases/2026-10-02-fractal-graph-any-size-agent/graph/UV1_versioned_ui_compartments-6876460bb288b810.graph`, `idearium/phases/2026-10-02-fractal-graph-any-size-agent/graph/WS5_the_whole_workshop-be72ff97f0f348b3.graph`

#### `idearium/phases/2026-10-02-fractal-graph-any-size-agent/graph/_superseded/`

1 other file(s).

- other: `idearium/phases/2026-10-02-fractal-graph-any-size-agent/graph/_superseded/FG5_recursive_build-b8e78a1fd1f50e1a.graph`

#### `idearium/phases/2026-10-02-spatial-void/`

6 other file(s).

- other: `idearium/phases/2026-10-02-spatial-void/V1_fonts_local.phase`, `idearium/phases/2026-10-02-spatial-void/V2_void_engine.phase`, `idearium/phases/2026-10-02-spatial-void/V3_ideas_carry_the_void.phase`, `idearium/phases/2026-10-02-spatial-void/V4_routes_and_cli.phase`, `idearium/phases/2026-10-02-spatial-void/V5_the_page.phase`, `idearium/phases/2026-10-02-spatial-void/V6_replaces_ideas_and_brainstorm.phase`

#### `idearium/phases/2026-10-02-spatial-void/graph/`

6 other file(s).

- other: `idearium/phases/2026-10-02-spatial-void/graph/V1_fonts_local-8719a547cb06c4c2.graph`, `idearium/phases/2026-10-02-spatial-void/graph/V2_void_engine-92fad98a05ccf78f.graph`, `idearium/phases/2026-10-02-spatial-void/graph/V3_ideas_carry_the_void-d03b7633ea5d2bc2.graph`, `idearium/phases/2026-10-02-spatial-void/graph/V4_routes_and_cli-0bdd0b11594e3311.graph`, `idearium/phases/2026-10-02-spatial-void/graph/V5_the_page-598efc9ae1916e6f.graph`, `idearium/phases/2026-10-02-spatial-void/graph/V6_replaces_ideas_and_brainstorm-c80f4e0208c7a97c.graph`

#### `idearium/phases/2026-10-02-spatial-void/graph/_superseded/`

2 other file(s).

- other: `idearium/phases/2026-10-02-spatial-void/graph/_superseded/V1_fonts_local-032a1c9ee94025d4.graph`, `idearium/phases/2026-10-02-spatial-void/graph/_superseded/V4_routes_and_cli-a9f04ac36a0b6f1c.graph`

#### `idearium/phases/2026-10-02-synthesis-zoom-versionium/`

3 other file(s).

- other: `idearium/phases/2026-10-02-synthesis-zoom-versionium/AZ1_semantic_zoom.phase`, `idearium/phases/2026-10-02-synthesis-zoom-versionium/VX1_versionium_degrades_not_crashes.phase`, `idearium/phases/2026-10-02-synthesis-zoom-versionium/WS3_the_pipeline_together.phase`

#### `idearium/phases/2026-10-02-synthesis-zoom-versionium/graph/`

3 other file(s).

- other: `idearium/phases/2026-10-02-synthesis-zoom-versionium/graph/AZ1_semantic_zoom-4803c502f673ce60.graph`, `idearium/phases/2026-10-02-synthesis-zoom-versionium/graph/VX1_versionium_degrades_not_crashes-4b86fc459aa038cf.graph`, `idearium/phases/2026-10-02-synthesis-zoom-versionium/graph/WS3_the_pipeline_together-1d67e5ca764d0db6.graph`

#### `idearium/phases/2026-10-02-workshop-codex-rewind/`

10 other file(s).

- other: `idearium/phases/2026-10-02-workshop-codex-rewind/AR2_architect_in_the_workshop.phase`, `idearium/phases/2026-10-02-workshop-codex-rewind/AR3_one_architect_canvas.phase`, `idearium/phases/2026-10-02-workshop-codex-rewind/AR4_pipeline_architect_on_the_canvas.phase`, `idearium/phases/2026-10-02-workshop-codex-rewind/AR5_repo_architect_on_the_canvas.phase`, `idearium/phases/2026-10-02-workshop-codex-rewind/DP1_desktop_popout_options.phase`, `idearium/phases/2026-10-02-workshop-codex-rewind/PL1_one_entry_point.phase`, `idearium/phases/2026-10-02-workshop-codex-rewind/SW1_spec_workshop.phase`, `idearium/phases/2026-10-02-workshop-codex-rewind/SW2_workshop_page_in_the_voids_style.phase`, `idearium/phases/2026-10-02-workshop-codex-rewind/UI12_workshop_surface.phase`, `idearium/phases/2026-10-02-workshop-codex-rewind/WS7_the_full_workshop.phase`

#### `idearium/phases/2026-10-02-workshop-codex-rewind/graph/`

10 other file(s).

- other: `idearium/phases/2026-10-02-workshop-codex-rewind/graph/AR2_architect_in_the_workshop-60f26485d18c4707.graph`, `idearium/phases/2026-10-02-workshop-codex-rewind/graph/AR3_one_architect_canvas-78c9c0ecdde06280.graph`, `idearium/phases/2026-10-02-workshop-codex-rewind/graph/AR4_pipeline_architect_on_the_canvas-cec156eb688fb013.graph`, `idearium/phases/2026-10-02-workshop-codex-rewind/graph/AR5_repo_architect_on_the_canvas-c7fee44243c248cf.graph`, `idearium/phases/2026-10-02-workshop-codex-rewind/graph/DP1_desktop_popout_options-fe185ea18c108811.graph`, `idearium/phases/2026-10-02-workshop-codex-rewind/graph/PL1_one_entry_point-afb68138f2d24e21.graph`, `idearium/phases/2026-10-02-workshop-codex-rewind/graph/SW1_spec_workshop-41757f4f776e1433.graph`, `idearium/phases/2026-10-02-workshop-codex-rewind/graph/SW2_workshop_page_in_the_voids_style-2649870476e49005.graph`, `idearium/phases/2026-10-02-workshop-codex-rewind/graph/UI12_workshop_surface-005dd01e2ba96ba8.graph`, `idearium/phases/2026-10-02-workshop-codex-rewind/graph/WS7_the_full_workshop-64cc34f12d7bde68.graph`

#### `idearium/phases/2026-10-02-workshop-codex-rewind/graph/_superseded/`

6 other file(s).

- other: `idearium/phases/2026-10-02-workshop-codex-rewind/graph/_superseded/AR2_architect_in_the_workshop-32d0b6cc32026023.graph`, `idearium/phases/2026-10-02-workshop-codex-rewind/graph/_superseded/DP1_desktop_popout_options-e73c4e98f5f196a7.graph`, `idearium/phases/2026-10-02-workshop-codex-rewind/graph/_superseded/PL1_one_entry_point-140d09417fa111f5.graph`, `idearium/phases/2026-10-02-workshop-codex-rewind/graph/_superseded/SW1_spec_workshop-143188e3446aa061.graph`, `idearium/phases/2026-10-02-workshop-codex-rewind/graph/_superseded/SW2_workshop_page_in_the_voids_style-acac3b974a3233a1.graph`, `idearium/phases/2026-10-02-workshop-codex-rewind/graph/_superseded/WS7_the_full_workshop-7115b04f434c37ca.graph`

#### `idearium/phases/2026-10-05-build-from-the-spec/`

29 other file(s).

- other: 29 files (.phase)

#### `idearium/phases/2026-10-05-build-from-the-spec/graph/`

29 other file(s).

- other: 29 files (.graph)

#### `idearium/phases/2026-10-05-build-from-the-spec/graph/_superseded/`

11 other file(s).

- other: `idearium/phases/2026-10-05-build-from-the-spec/graph/_superseded/CH1_compartment_charter-3faf15b7b007ec19.graph`, `idearium/phases/2026-10-05-build-from-the-spec/graph/_superseded/SB13_each_component_chunked-ee3c5820b2bc2761.graph`, `idearium/phases/2026-10-05-build-from-the-spec/graph/_superseded/SB27_expanding_a_repo_keeps_its_spec_and_phases_current-2f6ef3f3a636044e.graph`, `idearium/phases/2026-10-05-build-from-the-spec/graph/_superseded/SB29_the_build_flow_in_his_order-7a9f4dc3ffde4f9b.graph`, `idearium/phases/2026-10-05-build-from-the-spec/graph/_superseded/SB35_the_index_is_there_when_the_agent_asks-c03d44f4b918532e.graph`, `idearium/phases/2026-10-05-build-from-the-spec/graph/_superseded/SB44_phases_are_chunked_then_coded-e4aee8b08443f21c.graph`, `idearium/phases/2026-10-05-build-from-the-spec/graph/_superseded/SB49_an_idea_runs_through_by_itself-9272ab6662f32a97.graph`, `idearium/phases/2026-10-05-build-from-the-spec/graph/_superseded/SB4_template_fidelity-b5cd3fe3d598abc0.graph`, `idearium/phases/2026-10-05-build-from-the-spec/graph/_superseded/SB51_a_phase_built_in_chunks-d52a77216aaefbe3.graph`, `idearium/phases/2026-10-05-build-from-the-spec/graph/_superseded/SB52_proven_on_the_proposed_code-e7942c807caa456b.graph`, `idearium/phases/2026-10-05-build-from-the-spec/graph/_superseded/SB8_promote_with_full_block_options-59a2cc99ce55bb7c.graph`

#### `idearium/phases/2026-10-05-cli-data-code/`

5 other file(s).

- other: `idearium/phases/2026-10-05-cli-data-code/CL2_the_agent_tab_is_the_endpoint.phase`, `idearium/phases/2026-10-05-cli-data-code/CT2_the_code_tab.phase`, `idearium/phases/2026-10-05-cli-data-code/LS3_one_feed_for_every_agent.phase`, `idearium/phases/2026-10-05-cli-data-code/LS4_live_in_the_code_tab_and_the_work_surface.phase`, `idearium/phases/2026-10-05-cli-data-code/PB2_a_reply_that_changed_nothing_is_incomplete.phase`

#### `idearium/phases/2026-10-05-cli-data-code/graph/`

5 other file(s).

- other: `idearium/phases/2026-10-05-cli-data-code/graph/CL2_the_agent_tab_is_the_endpoint-0470783f38f397ba.graph`, `idearium/phases/2026-10-05-cli-data-code/graph/CT2_the_code_tab-4c5f7f3919966700.graph`, `idearium/phases/2026-10-05-cli-data-code/graph/LS3_one_feed_for_every_agent-607ae33cca91c5a9.graph`, `idearium/phases/2026-10-05-cli-data-code/graph/LS4_live_in_the_code_tab_and_the_work_surface-02a22b8ffa0fbdc1.graph`, `idearium/phases/2026-10-05-cli-data-code/graph/PB2_a_reply_that_changed_nothing_is_incomplete-5e314eff162a2c23.graph`

#### `idearium/phases/2026-10-05-cli-data-code/graph/_superseded/`

3 other file(s).

- other: `idearium/phases/2026-10-05-cli-data-code/graph/_superseded/CL2_the_agent_tab_is_the_endpoint-cd07a65975c0f372.graph`, `idearium/phases/2026-10-05-cli-data-code/graph/_superseded/LS3_one_feed_for_every_agent-cbe6c8256329685a.graph`, `idearium/phases/2026-10-05-cli-data-code/graph/_superseded/PB2_a_reply_that_changed_nothing_is_incomplete-cd4f2e31ab5e8a36.graph`

#### `idearium/phases/2026-10-05-code-tab-and-one-router/`

5 other file(s).

- other: `idearium/phases/2026-10-05-code-tab-and-one-router/CT3_the_code_tab_is_the_work_surface.phase`, `idearium/phases/2026-10-05-code-tab-and-one-router/CT4_ollama_checked_on_his_machine.phase`, `idearium/phases/2026-10-05-code-tab-and-one-router/CT5_hooked_into_the_plan.phase`, `idearium/phases/2026-10-05-code-tab-and-one-router/CT7_the_plan_shows_current_work.phase`, `idearium/phases/2026-10-05-code-tab-and-one-router/CT9_the_plan_pull_tab.phase`

#### `idearium/phases/2026-10-05-code-tab-and-one-router/graph/`

5 other file(s).

- other: `idearium/phases/2026-10-05-code-tab-and-one-router/graph/CT3_the_code_tab_is_the_work_surface-05771164854f548f.graph`, `idearium/phases/2026-10-05-code-tab-and-one-router/graph/CT4_ollama_checked_on_his_machine-07b280ffbe298899.graph`, `idearium/phases/2026-10-05-code-tab-and-one-router/graph/CT5_hooked_into_the_plan-d3f933a20724f93e.graph`, `idearium/phases/2026-10-05-code-tab-and-one-router/graph/CT7_the_plan_shows_current_work-a52abee8ded7dd97.graph`, `idearium/phases/2026-10-05-code-tab-and-one-router/graph/CT9_the_plan_pull_tab-c7ffc8d1f1c7dacb.graph`

#### `idearium/phases/2026-10-05-code-tab-and-one-router/graph/_superseded/`

1 other file(s).

- other: `idearium/phases/2026-10-05-code-tab-and-one-router/graph/_superseded/CT4_ollama_checked_on_his_machine-1d3a38b45bcc1514.graph`

#### `idearium/phases/2026-10-05-failure-reproduction/`

1 other file(s).

- other: `idearium/phases/2026-10-05-failure-reproduction/FM4_the_report.phase`

#### `idearium/phases/2026-10-05-failure-reproduction/graph/`

1 other file(s).

- other: `idearium/phases/2026-10-05-failure-reproduction/graph/FM4_the_report-e488e3464b6c5db8.graph`

#### `idearium/phases/2026-10-05-idea-to-spec-workshop/`

6 other file(s).

- other: `idearium/phases/2026-10-05-idea-to-spec-workshop/WK1_the_workshop_is_blocks_from_the_templates.phase`, `idearium/phases/2026-10-05-idea-to-spec-workshop/WK2_templates_edited_saved_removed.phase`, `idearium/phases/2026-10-05-idea-to-spec-workshop/WK3_the_agent_drafts_every_block.phase`, `idearium/phases/2026-10-05-idea-to-spec-workshop/WK4_the_void_feeds_the_workshop.phase`, `idearium/phases/2026-10-05-idea-to-spec-workshop/WK5_lanes_feed_gaps_and_phases.phase`, `idearium/phases/2026-10-05-idea-to-spec-workshop/WK6_enterprise_grade.phase`

#### `idearium/phases/2026-10-05-idea-to-spec-workshop/graph/`

6 other file(s).

- other: `idearium/phases/2026-10-05-idea-to-spec-workshop/graph/WK1_the_workshop_is_blocks_from_the_templates-7118b38fec612014.graph`, `idearium/phases/2026-10-05-idea-to-spec-workshop/graph/WK2_templates_edited_saved_removed-d80fec69628ad251.graph`, `idearium/phases/2026-10-05-idea-to-spec-workshop/graph/WK3_the_agent_drafts_every_block-06035725e06b5b37.graph`, `idearium/phases/2026-10-05-idea-to-spec-workshop/graph/WK4_the_void_feeds_the_workshop-f0a4dc07e1fec10d.graph`, `idearium/phases/2026-10-05-idea-to-spec-workshop/graph/WK5_lanes_feed_gaps_and_phases-29be01597b2db244.graph`, `idearium/phases/2026-10-05-idea-to-spec-workshop/graph/WK6_enterprise_grade-0d8254a618965546.graph`

#### `idearium/phases/2026-10-05-idea-to-spec-workshop/graph/_superseded/`

3 other file(s).

- other: `idearium/phases/2026-10-05-idea-to-spec-workshop/graph/_superseded/WK2_templates_edited_saved_removed-c001b523d5755bdc.graph`, `idearium/phases/2026-10-05-idea-to-spec-workshop/graph/_superseded/WK4_the_void_feeds_the_workshop-239d2f058e122ae9.graph`, `idearium/phases/2026-10-05-idea-to-spec-workshop/graph/_superseded/WK5_lanes_feed_gaps_and_phases-600c57b241fdd5b2.graph`

#### `idearium/phases/2026-10-05-spec-workshop-rebuild/`

7 other file(s).

- other: `idearium/phases/2026-10-05-spec-workshop-rebuild/RS10_the_phases_tab_rebuilt.phase`, `idearium/phases/2026-10-05-spec-workshop-rebuild/RS11_workshop_and_phases_one_surface.phase`, `idearium/phases/2026-10-05-spec-workshop-rebuild/RS4_the_pipeline_on_warp2.phase`, `idearium/phases/2026-10-05-spec-workshop-rebuild/RS5_the_template_picker.phase`, `idearium/phases/2026-10-05-spec-workshop-rebuild/RS6_the_workshop_as_the_editor.phase`, `idearium/phases/2026-10-05-spec-workshop-rebuild/RS7_architect_and_blueprint_stations.phase`, `idearium/phases/2026-10-05-spec-workshop-rebuild/RS9_the_thread.phase`

#### `idearium/phases/2026-10-05-spec-workshop-rebuild/graph/`

7 other file(s).

- other: `idearium/phases/2026-10-05-spec-workshop-rebuild/graph/RS10_the_phases_tab_rebuilt-2b8342c245cb1a43.graph`, `idearium/phases/2026-10-05-spec-workshop-rebuild/graph/RS11_workshop_and_phases_one_surface-0c60b2ce6d21565f.graph`, `idearium/phases/2026-10-05-spec-workshop-rebuild/graph/RS4_the_pipeline_on_warp2-783f1e3006d94e50.graph`, `idearium/phases/2026-10-05-spec-workshop-rebuild/graph/RS5_the_template_picker-2047af4e58c842c4.graph`, `idearium/phases/2026-10-05-spec-workshop-rebuild/graph/RS6_the_workshop_as_the_editor-65ed3468201e5940.graph`, `idearium/phases/2026-10-05-spec-workshop-rebuild/graph/RS7_architect_and_blueprint_stations-a3f6ef1273789a83.graph`, `idearium/phases/2026-10-05-spec-workshop-rebuild/graph/RS9_the_thread-15e75f13adeb2af6.graph`

#### `idearium/phases/2026-10-05-spec-workshop-rebuild/graph/_superseded/`

2 other file(s).

- other: `idearium/phases/2026-10-05-spec-workshop-rebuild/graph/_superseded/RS4_the_pipeline_on_warp2-1b500110a3a75d95.graph`, `idearium/phases/2026-10-05-spec-workshop-rebuild/graph/_superseded/RS9_the_thread-f06ed39fcd8adc6f.graph`

#### `idearium/phases/2026-10-05-verified-primitives/`

1 other file(s).

- other: `idearium/phases/2026-10-05-verified-primitives/VP7_the_settings_tab_in_categories.phase`

#### `idearium/phases/2026-10-05-verified-primitives/graph/`

1 other file(s).

- other: `idearium/phases/2026-10-05-verified-primitives/graph/VP7_the_settings_tab_in_categories-bde114aa4d10f923.graph`

#### `idearium/phases/2026-10-07-compartment-control-and-activity/`

6 other file(s).

- other: `idearium/phases/2026-10-07-compartment-control-and-activity/AL2_log_tab.phase`, `idearium/phases/2026-10-07-compartment-control-and-activity/BO1_brainos_reads_the_log.phase`, `idearium/phases/2026-10-07-compartment-control-and-activity/CM1_every_capability_a_command.phase`, `idearium/phases/2026-10-07-compartment-control-and-activity/CM3_this_sessions_work_as_commands.phase`, `idearium/phases/2026-10-07-compartment-control-and-activity/NC2_nexus_systems_as_compartments.phase`, `idearium/phases/2026-10-07-compartment-control-and-activity/UI1_the_screens_for_cm3.phase`

#### `idearium/phases/2026-10-07-compartment-control-and-activity/graph/`

6 other file(s).

- other: `idearium/phases/2026-10-07-compartment-control-and-activity/graph/AL2_log_tab-4edf93608071f912.graph`, `idearium/phases/2026-10-07-compartment-control-and-activity/graph/BO1_brainos_reads_the_log-8567a373d208f9e7.graph`, `idearium/phases/2026-10-07-compartment-control-and-activity/graph/CM1_every_capability_a_command-9a9190f223ba34d5.graph`, `idearium/phases/2026-10-07-compartment-control-and-activity/graph/CM3_this_sessions_work_as_commands-833d2e75f114aa67.graph`, `idearium/phases/2026-10-07-compartment-control-and-activity/graph/NC2_nexus_systems_as_compartments-66a08f2bde3cdc9e.graph`, `idearium/phases/2026-10-07-compartment-control-and-activity/graph/UI1_the_screens_for_cm3-c3991e54ba34f121.graph`

#### `idearium/phases/2026-10-07-compartment-control-and-activity/graph/_superseded/`

5 other file(s).

- other: `idearium/phases/2026-10-07-compartment-control-and-activity/graph/_superseded/CM1_every_capability_a_command-7b012b7934a26bf1.graph`, `idearium/phases/2026-10-07-compartment-control-and-activity/graph/_superseded/CM3_this_sessions_work_as_commands-1cf5e5712045496d.graph`, `idearium/phases/2026-10-07-compartment-control-and-activity/graph/_superseded/CM3_this_sessions_work_as_commands-65881101a8767d62.graph`, `idearium/phases/2026-10-07-compartment-control-and-activity/graph/_superseded/NC2_nexus_systems_as_compartments-bd7a70b20d504253.graph`, `idearium/phases/2026-10-07-compartment-control-and-activity/graph/_superseded/UI1_the_screens_for_cm3-66b98ef97a9f4405.graph`

#### `idearium/phases/2026-10-07-idearium-one-surface/`

8 other file(s).

- other: `idearium/phases/2026-10-07-idearium-one-surface/OS2_the_plan_panel_holds_it.phase`, `idearium/phases/2026-10-07-idearium-one-surface/OS3_the_code_tab_knows_its_history.phase`, `idearium/phases/2026-10-07-idearium-one-surface/OS4_every_agent_option_in_the_agent_tab.phase`, `idearium/phases/2026-10-07-idearium-one-surface/OS5_settings_without_iframes.phase`, `idearium/phases/2026-10-07-idearium-one-surface/OS7_one_proposal_surface.phase`, `idearium/phases/2026-10-07-idearium-one-surface/OS8_settings_agents_holds_every_agent_option.phase`, `idearium/phases/2026-10-07-idearium-one-surface/SP1_phases_from_the_sections.phase`, `idearium/phases/2026-10-07-idearium-one-surface/SP2_complete_the_blanks.phase`

#### `idearium/phases/2026-10-07-idearium-one-surface/graph/`

8 other file(s).

- other: `idearium/phases/2026-10-07-idearium-one-surface/graph/OS2_the_plan_panel_holds_it-7c79a17a177f132e.graph`, `idearium/phases/2026-10-07-idearium-one-surface/graph/OS3_the_code_tab_knows_its_history-0b3333775435ecb5.graph`, `idearium/phases/2026-10-07-idearium-one-surface/graph/OS4_every_agent_option_in_the_agent_tab-e7ab294fffd58bff.graph`, `idearium/phases/2026-10-07-idearium-one-surface/graph/OS5_settings_without_iframes-17bd8eab79f40c3b.graph`, `idearium/phases/2026-10-07-idearium-one-surface/graph/OS7_one_proposal_surface-ecf19282ae895337.graph`, `idearium/phases/2026-10-07-idearium-one-surface/graph/OS8_settings_agents_holds_every_agent_option-b98ee2ed7bced97d.graph`, `idearium/phases/2026-10-07-idearium-one-surface/graph/SP1_phases_from_the_sections-74d13d62a255e6a3.graph`, `idearium/phases/2026-10-07-idearium-one-surface/graph/SP2_complete_the_blanks-77fd5cd417d72e25.graph`

#### `idearium/phases/2026-10-07-system-expectations/`

3 other file(s).

- other: `idearium/phases/2026-10-07-system-expectations/EX3_the_diagnostic_reads_expectations.phase`, `idearium/phases/2026-10-07-system-expectations/EX4_intelligence_learns_the_normal.phase`, `idearium/phases/2026-10-07-system-expectations/EX5_time_to_breach.phase`

#### `idearium/phases/2026-10-07-system-expectations/graph/`

3 other file(s).

- other: `idearium/phases/2026-10-07-system-expectations/graph/EX3_the_diagnostic_reads_expectations-2bec3e78837d68f5.graph`, `idearium/phases/2026-10-07-system-expectations/graph/EX4_intelligence_learns_the_normal-5991de2b3e18f190.graph`, `idearium/phases/2026-10-07-system-expectations/graph/EX5_time_to_breach-cb016f9887da62f8.graph`

#### `idearium/phases/2026-10-07-versionium-releases/`

3 other file(s).

- other: `idearium/phases/2026-10-07-versionium-releases/RN1_release_is_a_node_and_a_tag.phase`, `idearium/phases/2026-10-07-versionium-releases/RN3_releases_section.phase`, `idearium/phases/2026-10-07-versionium-releases/VR1_every_change_a_commit.phase`

#### `idearium/phases/2026-10-07-versionium-releases/graph/`

3 other file(s).

- other: `idearium/phases/2026-10-07-versionium-releases/graph/RN1_release_is_a_node_and_a_tag-ac55d5c78a92cf41.graph`, `idearium/phases/2026-10-07-versionium-releases/graph/RN3_releases_section-4141ba7fc63cd48b.graph`, `idearium/phases/2026-10-07-versionium-releases/graph/VR1_every_change_a_commit-027f10a7cc126ff1.graph`

#### `idearium/phases/2026-10-07-versionium-releases/graph/_superseded/`

1 other file(s).

- other: `idearium/phases/2026-10-07-versionium-releases/graph/_superseded/VR1_every_change_a_commit-14c51a8423588640.graph`

#### `idearium/phases/2026-10-09-hardening-pass/`

7 other file(s).

- other: `idearium/phases/2026-10-09-hardening-pass/HP10_the_work_surface_in_view.phase`, `idearium/phases/2026-10-09-hardening-pass/HP1_stale_spreads_along_dependencies.phase`, `idearium/phases/2026-10-09-hardening-pass/HP2_interrupted_runs_are_said.phase`, `idearium/phases/2026-10-09-hardening-pass/HP3_the_ladder_climbs_only_what_is_installed.phase`, `idearium/phases/2026-10-09-hardening-pass/HP6_the_build_surface_opens.phase`, `idearium/phases/2026-10-09-hardening-pass/HP8_the_ladder_says_why_ollama_is_missing.phase`, `idearium/phases/2026-10-09-hardening-pass/HP9_the_plan_is_current_work.phase`

#### `idearium/phases/2026-10-09-hardening-pass/graph/`

7 other file(s).

- other: `idearium/phases/2026-10-09-hardening-pass/graph/HP10_the_work_surface_in_view-f1241943f37108b2.graph`, `idearium/phases/2026-10-09-hardening-pass/graph/HP1_stale_spreads_along_dependencies-9df169732afe005e.graph`, `idearium/phases/2026-10-09-hardening-pass/graph/HP2_interrupted_runs_are_said-b96b9f387e779f40.graph`, `idearium/phases/2026-10-09-hardening-pass/graph/HP3_the_ladder_climbs_only_what_is_installed-5fc0d678d2233afd.graph`, `idearium/phases/2026-10-09-hardening-pass/graph/HP6_the_build_surface_opens-cb6c79f8c844d719.graph`, `idearium/phases/2026-10-09-hardening-pass/graph/HP8_the_ladder_says_why_ollama_is_missing-759c9c7ee4f76954.graph`, `idearium/phases/2026-10-09-hardening-pass/graph/HP9_the_plan_is_current_work-f627db089c793902.graph`

#### `idearium/phases/2026-10-09-hardening-pass/graph/_superseded/`

3 other file(s).

- other: `idearium/phases/2026-10-09-hardening-pass/graph/_superseded/HP2_interrupted_runs_are_said-79dee1361e48c6a2.graph`, `idearium/phases/2026-10-09-hardening-pass/graph/_superseded/HP3_the_ladder_climbs_only_what_is_installed-c8c7d13d9c60af92.graph`, `idearium/phases/2026-10-09-hardening-pass/graph/_superseded/HP8_the_ladder_says_why_ollama_is_missing-57815805593abe9b.graph`

#### `idearium/phases/2026-10-09-one-model-engine/`

1 other file(s).

- other: `idearium/phases/2026-10-09-one-model-engine/ME11_old_settings_translated.phase`

#### `idearium/phases/2026-10-09-one-model-engine/graph/`

1 other file(s).

- other: `idearium/phases/2026-10-09-one-model-engine/graph/ME11_old_settings_translated-c344d85e2f4dd34c.graph`

#### `idearium/phases/2026-10-09-one-model-engine/graph/_superseded/`

1 other file(s).

- other: `idearium/phases/2026-10-09-one-model-engine/graph/_superseded/ME11_old_settings_translated-5b0ec7fc75e2ad91.graph`

#### `idearium/phases/2026-10-09-one-roadmap/`

1 other file(s).

- other: `idearium/phases/2026-10-09-one-roadmap/OR4_one_roadmap_in_idearium.phase`

#### `idearium/phases/2026-10-09-one-roadmap/graph/`

1 other file(s).

- other: `idearium/phases/2026-10-09-one-roadmap/graph/OR4_one_roadmap_in_idearium-eccb05a79ab9f7b3.graph`

#### `idearium/phases/2026-10-10-idearium-access/`

6 other file(s).

- other: `idearium/phases/2026-10-10-idearium-access/IA0_the_door_checks_who_is_asking.phase`, `idearium/phases/2026-10-10-idearium-access/IA1_the_routes.phase`, `idearium/phases/2026-10-10-idearium-access/IA2_the_command.phase`, `idearium/phases/2026-10-10-idearium-access/IA3_the_screens.phase`, `idearium/phases/2026-10-10-idearium-access/IA6_every_local_caller_carries_the_key.phase`, `idearium/phases/2026-10-10-idearium-access/IA7_the_hat_is_the_actor.phase`

#### `idearium/phases/2026-10-10-idearium-access/graph/`

6 other file(s).

- other: `idearium/phases/2026-10-10-idearium-access/graph/IA0_the_door_checks_who_is_asking-5658b9c9c82b0b4d.graph`, `idearium/phases/2026-10-10-idearium-access/graph/IA1_the_routes-2ca61320e80b189f.graph`, `idearium/phases/2026-10-10-idearium-access/graph/IA2_the_command-24f13b95eff7063d.graph`, `idearium/phases/2026-10-10-idearium-access/graph/IA3_the_screens-84728ca7fed20a3f.graph`, `idearium/phases/2026-10-10-idearium-access/graph/IA6_every_local_caller_carries_the_key-f1ec5f91b44c5f9b.graph`, `idearium/phases/2026-10-10-idearium-access/graph/IA7_the_hat_is_the_actor-cff039c2c9e53264.graph`

#### `idearium/phases/2026-10-10-idearium-access/graph/_superseded/`

4 other file(s).

- other: `idearium/phases/2026-10-10-idearium-access/graph/_superseded/IA0_the_door_checks_who_is_asking-e61c74f72a1e0e07.graph`, `idearium/phases/2026-10-10-idearium-access/graph/_superseded/IA1_the_routes-524b4ed85ce0024b.graph`, `idearium/phases/2026-10-10-idearium-access/graph/_superseded/IA2_the_command-447eafe8b6ed97e1.graph`, `idearium/phases/2026-10-10-idearium-access/graph/_superseded/IA6_every_local_caller_carries_the_key-48cf449554a93a5a.graph`

#### `idearium/phases/2026-10-10-idearium-solid/`

11 other file(s).

- other: `idearium/phases/2026-10-10-idearium-solid/SD11_the_desktop_inside_idearium.phase`, `idearium/phases/2026-10-10-idearium-solid/SD12_a_spec_starts_from_its_primitives.phase`, `idearium/phases/2026-10-10-idearium-solid/SD14_chunks_cut_at_primitives.phase`, `idearium/phases/2026-10-10-idearium-solid/SD16_a_plan_step_never_proposes_code.phase`, `idearium/phases/2026-10-10-idearium-solid/SD17_an_imported_project_continues.phase`, `idearium/phases/2026-10-10-idearium-solid/SD18_mastermind_ready.phase`, `idearium/phases/2026-10-10-idearium-solid/SD19_a_refusal_goes_back_to_its_agent.phase`, `idearium/phases/2026-10-10-idearium-solid/SD1_rewind_and_versions_on_the_repo_card.phase`, `idearium/phases/2026-10-10-idearium-solid/SD21_what_his_run_log_showed.phase`, `idearium/phases/2026-10-10-idearium-solid/SD22_a_wrapped_repo_lifts_to_its_root.phase`, `idearium/phases/2026-10-10-idearium-solid/SD6_an_idea_logged_asked_expanded.phase`

#### `idearium/phases/2026-10-10-idearium-solid/graph/`

11 other file(s).

- other: `idearium/phases/2026-10-10-idearium-solid/graph/SD11_the_desktop_inside_idearium-355bfb9bb8b0c1e5.graph`, `idearium/phases/2026-10-10-idearium-solid/graph/SD12_a_spec_starts_from_its_primitives-5f1332ad4be21d47.graph`, `idearium/phases/2026-10-10-idearium-solid/graph/SD14_chunks_cut_at_primitives-9c0e825565000d6e.graph`, `idearium/phases/2026-10-10-idearium-solid/graph/SD16_a_plan_step_never_proposes_code-15a5817d56c7df8e.graph`, `idearium/phases/2026-10-10-idearium-solid/graph/SD17_an_imported_project_continues-2b4bbb42b4b7bb3d.graph`, `idearium/phases/2026-10-10-idearium-solid/graph/SD18_mastermind_ready-6e60122522d0e684.graph`, `idearium/phases/2026-10-10-idearium-solid/graph/SD19_a_refusal_goes_back_to_its_agent-3f25993be4992bbc.graph`, `idearium/phases/2026-10-10-idearium-solid/graph/SD1_rewind_and_versions_on_the_repo_card-2652c3fb731ca33b.graph`, `idearium/phases/2026-10-10-idearium-solid/graph/SD21_what_his_run_log_showed-b49844a127559b4a.graph`, `idearium/phases/2026-10-10-idearium-solid/graph/SD22_a_wrapped_repo_lifts_to_its_root-790d3ecb08212ea7.graph`, `idearium/phases/2026-10-10-idearium-solid/graph/SD6_an_idea_logged_asked_expanded-1d402c08b3b1ae59.graph`

#### `idearium/phases/2026-10-10-idearium-solid/graph/_superseded/`

5 other file(s).

- other: `idearium/phases/2026-10-10-idearium-solid/graph/_superseded/SD17_an_imported_project_continues-ca41b1efd7fa26c1.graph`, `idearium/phases/2026-10-10-idearium-solid/graph/_superseded/SD18_mastermind_ready-0605b1ba0a0ed196.graph`, `idearium/phases/2026-10-10-idearium-solid/graph/_superseded/SD19_a_refusal_goes_back_to_its_agent-5ef0ac81785ee32f.graph`, `idearium/phases/2026-10-10-idearium-solid/graph/_superseded/SD21_what_his_run_log_showed-b16c046b8f39cc7d.graph`, `idearium/phases/2026-10-10-idearium-solid/graph/_superseded/SD6_an_idea_logged_asked_expanded-05cd4cbce953cad2.graph`

#### `idearium/phases/2026-10-10-self-awareness/`

1 other file(s).

- other: `idearium/phases/2026-10-10-self-awareness/AW5_its_own_face.phase`

#### `idearium/phases/2026-10-10-self-awareness/graph/`

1 other file(s).

- other: `idearium/phases/2026-10-10-self-awareness/graph/AW5_its_own_face-e328b4fcf66e26af.graph`

#### `idearium/phases/2026-10-10-shape-of-nexus/`

4 other file(s).

- other: `idearium/phases/2026-10-10-shape-of-nexus/FN1_the_field_as_commands.phase`, `idearium/phases/2026-10-10-shape-of-nexus/OP2_the_system_settings_in_its_repo.phase`, `idearium/phases/2026-10-10-shape-of-nexus/OP3_copilot_reads_and_sets_options.phase`, `idearium/phases/2026-10-10-shape-of-nexus/OP4_environment_and_desktop_one_menu.phase`

#### `idearium/phases/2026-10-10-shape-of-nexus/graph/`

4 other file(s).

- other: `idearium/phases/2026-10-10-shape-of-nexus/graph/FN1_the_field_as_commands-e87b0654c627df14.graph`, `idearium/phases/2026-10-10-shape-of-nexus/graph/OP2_the_system_settings_in_its_repo-b2e5ee189f2b8e73.graph`, `idearium/phases/2026-10-10-shape-of-nexus/graph/OP3_copilot_reads_and_sets_options-3d0a3182c689b10c.graph`, `idearium/phases/2026-10-10-shape-of-nexus/graph/OP4_environment_and_desktop_one_menu-f9648ccd1a2a07d5.graph`

#### `idearium/phases/2026-10-10-shape-of-nexus/graph/_superseded/`

3 other file(s).

- other: `idearium/phases/2026-10-10-shape-of-nexus/graph/_superseded/FN1_the_field_as_commands-97a9854ac7d50136.graph`, `idearium/phases/2026-10-10-shape-of-nexus/graph/_superseded/OP2_the_system_settings_in_its_repo-a31db0f4424409aa.graph`, `idearium/phases/2026-10-10-shape-of-nexus/graph/_superseded/OP3_copilot_reads_and_sets_options-32a68d26ad74f22e.graph`

#### `idearium/phases/2026-10-12-browser-providers-and-work/`

3 other file(s).

- other: `idearium/phases/2026-10-12-browser-providers-and-work/CS1_drop_zips_to_decompose.phase`, `idearium/phases/2026-10-12-browser-providers-and-work/CS2_uploaded_projects_managed.phase`, `idearium/phases/2026-10-12-browser-providers-and-work/MX1_nothing_built_unmapped.phase`

#### `idearium/phases/2026-10-12-browser-providers-and-work/graph/`

3 other file(s).

- other: `idearium/phases/2026-10-12-browser-providers-and-work/graph/CS1_drop_zips_to_decompose-122d522bc936da0d.graph`, `idearium/phases/2026-10-12-browser-providers-and-work/graph/CS2_uploaded_projects_managed-64e8e3327c02b1dc.graph`, `idearium/phases/2026-10-12-browser-providers-and-work/graph/MX1_nothing_built_unmapped-eebb2de339d0afaf.graph`

#### `idearium/phases/2026-10-12-browser-providers-and-work/graph/_superseded/`

1 other file(s).

- other: `idearium/phases/2026-10-12-browser-providers-and-work/graph/_superseded/CS2_uploaded_projects_managed-494c0ceef6476375.graph`

#### `idearium/phases/2026-10-12-request-spine/`

2 other file(s).

- other: `idearium/phases/2026-10-12-request-spine/RQ12_the_phase_dag.phase`, `idearium/phases/2026-10-12-request-spine/RQ25_progress_is_evidence_not_activity.phase`

#### `idearium/phases/2026-10-12-request-spine/graph/`

2 other file(s).

- other: `idearium/phases/2026-10-12-request-spine/graph/RQ12_the_phase_dag-657be08a0225c679.graph`, `idearium/phases/2026-10-12-request-spine/graph/RQ25_progress_is_evidence_not_activity-a5c5eb430ac05891.graph`

#### `idearium/phases/2026-10-12-request-spine/graph/_superseded/`

1 other file(s).

- other: `idearium/phases/2026-10-12-request-spine/graph/_superseded/RQ25_progress_is_evidence_not_activity-20b27d207cb31ec8.graph`

#### `idearium/phases/2026-10-13-identities-tabs-and-automation/`

1 other file(s).

- other: `idearium/phases/2026-10-13-identities-tabs-and-automation/IR0_intent_routing_for_reasoning.phase`

#### `idearium/phases/2026-10-13-identities-tabs-and-automation/graph/`

1 other file(s).

- other: `idearium/phases/2026-10-13-identities-tabs-and-automation/graph/IR0_intent_routing_for_reasoning-13c4a3b37811825f.graph`

#### `idearium/phases/2026-10-13-identities-tabs-and-automation/graph/_superseded/`

1 other file(s).

- other: `idearium/phases/2026-10-13-identities-tabs-and-automation/graph/_superseded/IR0_intent_routing_for_reasoning-d117c137eb21d499.graph`

#### `idearium/phases/2026-10-13-nexus-memory-gates-and-contract/`

1 other file(s).

- other: `idearium/phases/2026-10-13-nexus-memory-gates-and-contract/LN0_lines_tool.phase`

#### `idearium/phases/2026-10-13-nexus-memory-gates-and-contract/graph/`

1 other file(s).

- other: `idearium/phases/2026-10-13-nexus-memory-gates-and-contract/graph/LN0_lines_tool-610d4e0276e2f1f3.graph`

#### `idearium/phases/2026-10-13-nexus-memory-gates-and-contract/graph/_superseded/`

1 other file(s).

- other: `idearium/phases/2026-10-13-nexus-memory-gates-and-contract/graph/_superseded/LN0_lines_tool-88358d2f2c9e4f7e.graph`

#### `idearium/phases/2026-10-13-projects-raid-and-gates/`

5 other file(s).

- other: `idearium/phases/2026-10-13-projects-raid-and-gates/NT0_notes.phase`, `idearium/phases/2026-10-13-projects-raid-and-gates/PL1_many_projects_at_once.phase`, `idearium/phases/2026-10-13-projects-raid-and-gates/PL5_specs_become_the_roadmap.phase`, `idearium/phases/2026-10-13-projects-raid-and-gates/RD2_idearium_routes_through_raid.phase`, `idearium/phases/2026-10-13-projects-raid-and-gates/VM0_versionium_managed_per_repo.phase`

#### `idearium/phases/2026-10-13-projects-raid-and-gates/graph/`

5 other file(s).

- other: `idearium/phases/2026-10-13-projects-raid-and-gates/graph/NT0_notes-380b9b53aef77846.graph`, `idearium/phases/2026-10-13-projects-raid-and-gates/graph/PL1_many_projects_at_once-1adf76c32de48afd.graph`, `idearium/phases/2026-10-13-projects-raid-and-gates/graph/PL5_specs_become_the_roadmap-494bc4384547022a.graph`, `idearium/phases/2026-10-13-projects-raid-and-gates/graph/RD2_idearium_routes_through_raid-5a4b971d4bf5406f.graph`, `idearium/phases/2026-10-13-projects-raid-and-gates/graph/VM0_versionium_managed_per_repo-c0df29a72af2a449.graph`

#### `idearium/phases/2026-10-13-projects-raid-and-gates/graph/_superseded/`

4 other file(s).

- other: `idearium/phases/2026-10-13-projects-raid-and-gates/graph/_superseded/NT0_notes-6b7863af6bf2d475.graph`, `idearium/phases/2026-10-13-projects-raid-and-gates/graph/_superseded/PL5_specs_become_the_roadmap-1b3e39b06f431b10.graph`, `idearium/phases/2026-10-13-projects-raid-and-gates/graph/_superseded/RD2_idearium_routes_through_raid-2983b6458a4a5d56.graph`, `idearium/phases/2026-10-13-projects-raid-and-gates/graph/_superseded/VM0_versionium_managed_per_repo-040fc109a1d5cee4.graph`

#### `idearium/phases/2026-10-15-automatic-tracking/`

1 other file(s).

- other: `idearium/phases/2026-10-15-automatic-tracking/CP1_the_contract_panel.phase`

#### `idearium/phases/2026-10-15-automatic-tracking/graph/`

1 other file(s).

- other: `idearium/phases/2026-10-15-automatic-tracking/graph/CP1_the_contract_panel-74dcff4d5f3b4b1e.graph`

#### `idearium/phases/2026-10-15-automatic-tracking/graph/_superseded/`

1 other file(s).

- other: `idearium/phases/2026-10-15-automatic-tracking/graph/_superseded/CP1_the_contract_panel-c237d6f98a19ae59.graph`

#### `idearium/phases/2026-10-15-code-tab-run-state/`

9 other file(s).

- other: `idearium/phases/2026-10-15-code-tab-run-state/CE11_contract_panel_and_context.phase`, `idearium/phases/2026-10-15-code-tab-run-state/CE6_one_tab.phase`, `idearium/phases/2026-10-15-code-tab-run-state/CE7_ai_assisted_editing.phase`, `idearium/phases/2026-10-15-code-tab-run-state/CE8_the_cli_reads_the_surface.phase`, `idearium/phases/2026-10-15-code-tab-run-state/CE9_the_panels.phase`, `idearium/phases/2026-10-15-code-tab-run-state/CV1_one_menu.phase`, `idearium/phases/2026-10-15-code-tab-run-state/CV3_file_rewind.phase`, `idearium/phases/2026-10-15-code-tab-run-state/CV4_tagged_history.phase`, `idearium/phases/2026-10-15-code-tab-run-state/CV6_phases_in_idearium.phase`

#### `idearium/phases/2026-10-15-code-tab-run-state/graph/`

9 other file(s).

- other: `idearium/phases/2026-10-15-code-tab-run-state/graph/CE11_contract_panel_and_context-1c20d408c33edd4a.graph`, `idearium/phases/2026-10-15-code-tab-run-state/graph/CE6_one_tab-cd0e8325ed28c665.graph`, `idearium/phases/2026-10-15-code-tab-run-state/graph/CE7_ai_assisted_editing-ca5bbe38ad2f3395.graph`, `idearium/phases/2026-10-15-code-tab-run-state/graph/CE8_the_cli_reads_the_surface-250ecb5548f90036.graph`, `idearium/phases/2026-10-15-code-tab-run-state/graph/CE9_the_panels-e21c35e06e99c19e.graph`, `idearium/phases/2026-10-15-code-tab-run-state/graph/CV1_one_menu-ee95a78a4705be68.graph`, `idearium/phases/2026-10-15-code-tab-run-state/graph/CV3_file_rewind-71fe4349cc92ee87.graph`, `idearium/phases/2026-10-15-code-tab-run-state/graph/CV4_tagged_history-d5e1fb4ce6c7fea0.graph`, `idearium/phases/2026-10-15-code-tab-run-state/graph/CV6_phases_in_idearium-46e06b29cc567261.graph`

#### `idearium/phases/2026-10-15-code-tab-run-state/graph/_superseded/`

5 other file(s).

- other: `idearium/phases/2026-10-15-code-tab-run-state/graph/_superseded/CE7_ai_assisted_editing-78ed53aff1a36f1d.graph`, `idearium/phases/2026-10-15-code-tab-run-state/graph/_superseded/CE8_the_cli_reads_the_surface-0aea42978ca6e896.graph`, `idearium/phases/2026-10-15-code-tab-run-state/graph/_superseded/CV3_file_rewind-b559809f1fb359df.graph`, `idearium/phases/2026-10-15-code-tab-run-state/graph/_superseded/CV4_tagged_history-bf93d47b9e08cca2.graph`, `idearium/phases/2026-10-15-code-tab-run-state/graph/_superseded/CV6_phases_in_idearium-219944fafb6e0b35.graph`

#### `idearium/phases/2026-10-15-gate-held-work/`

1 other file(s).

- other: `idearium/phases/2026-10-15-gate-held-work/GW9_the_contract_panel.phase`

#### `idearium/phases/2026-10-15-gate-held-work/graph/`

1 other file(s).

- other: `idearium/phases/2026-10-15-gate-held-work/graph/GW9_the_contract_panel-cab4409f3fc2daed.graph`

#### `idearium/phases/2026-10-15-one-contract-raid-releases/`

3 other file(s).

- other: `idearium/phases/2026-10-15-one-contract-raid-releases/BR1_bricks_on_every_path.phase`, `idearium/phases/2026-10-15-one-contract-raid-releases/RD1_every_build_goes_through_raid.phase`, `idearium/phases/2026-10-15-one-contract-raid-releases/RN3_releases_in_idearium.phase`

#### `idearium/phases/2026-10-15-one-contract-raid-releases/graph/`

3 other file(s).

- other: `idearium/phases/2026-10-15-one-contract-raid-releases/graph/BR1_bricks_on_every_path-389c2f3ca57716ad.graph`, `idearium/phases/2026-10-15-one-contract-raid-releases/graph/RD1_every_build_goes_through_raid-2b6669a4bffd04bf.graph`, `idearium/phases/2026-10-15-one-contract-raid-releases/graph/RN3_releases_in_idearium-6c103beb29afacf9.graph`

#### `idearium/phases/2026-10-15-one-contract-raid-releases/graph/_superseded/`

3 other file(s).

- other: `idearium/phases/2026-10-15-one-contract-raid-releases/graph/_superseded/BR1_bricks_on_every_path-7f1e4cefe519e0ea.graph`, `idearium/phases/2026-10-15-one-contract-raid-releases/graph/_superseded/RD1_every_build_goes_through_raid-393f8766ca06b8e6.graph`, `idearium/phases/2026-10-15-one-contract-raid-releases/graph/_superseded/RN3_releases_in_idearium-1b5d6979e4dd7138.graph`

#### `idearium/phases/2026-10-15-warp-builds-and-spec-framework/`

2 other file(s).

- other: `idearium/phases/2026-10-15-warp-builds-and-spec-framework/MP2_automatic_in_every_repo.phase`, `idearium/phases/2026-10-15-warp-builds-and-spec-framework/MP4_a_model_only_where_nothing_maps.phase`

#### `idearium/phases/2026-10-15-warp-builds-and-spec-framework/graph/`

2 other file(s).

- other: `idearium/phases/2026-10-15-warp-builds-and-spec-framework/graph/MP2_automatic_in_every_repo-8a644e8e18b1f8aa.graph`, `idearium/phases/2026-10-15-warp-builds-and-spec-framework/graph/MP4_a_model_only_where_nothing_maps-9220440577823eca.graph`

#### `idearium/phases/2026-10-15-warp-builds-and-spec-framework/graph/_superseded/`

2 other file(s).

- other: `idearium/phases/2026-10-15-warp-builds-and-spec-framework/graph/_superseded/MP2_automatic_in_every_repo-bf38793cc2c63870.graph`, `idearium/phases/2026-10-15-warp-builds-and-spec-framework/graph/_superseded/MP4_a_model_only_where_nothing_maps-caa26af1fd162af7.graph`

#### `idearium/phases/2026-10-16-agent-work-funnel/`

1 other file(s).

- other: `idearium/phases/2026-10-16-agent-work-funnel/FN4_the_screen.phase`

#### `idearium/phases/2026-10-16-agent-work-funnel/graph/`

1 other file(s).

- other: `idearium/phases/2026-10-16-agent-work-funnel/graph/FN4_the_screen-ebe40a77dd865050.graph`

#### `idearium/phases/2026-10-16-canvas-compartments/`

1 other file(s).

- other: `idearium/phases/2026-10-16-canvas-compartments/CN4_workshop_templates.phase`

#### `idearium/phases/2026-10-16-canvas-compartments/graph/`

1 other file(s).

- other: `idearium/phases/2026-10-16-canvas-compartments/graph/CN4_workshop_templates-ca880b9d3e8fd1e4.graph`

#### `idearium/phases/2026-10-16-code-tab-rebuild/`

11 other file(s).

- other: `idearium/phases/2026-10-16-code-tab-rebuild/DK2_the_dock.phase`, `idearium/phases/2026-10-16-code-tab-rebuild/TB0_decisions.phase`, `idearium/phases/2026-10-16-code-tab-rebuild/TB2_persistence_audit.phase`, `idearium/phases/2026-10-16-code-tab-rebuild/TB3_close_the_persistence_gaps.phase`, `idearium/phases/2026-10-16-code-tab-rebuild/TB4a_recall_in_the_dispatcher.phase`, `idearium/phases/2026-10-16-code-tab-rebuild/TB4b_nexus_recall_tool.phase`, `idearium/phases/2026-10-16-code-tab-rebuild/TB4c_measure.phase`, `idearium/phases/2026-10-16-code-tab-rebuild/TB5_tab_shell.phase`, `idearium/phases/2026-10-16-code-tab-rebuild/TB6_files_changes_plans_cos_tabs.phase`, `idearium/phases/2026-10-16-code-tab-rebuild/TB7a_edges_recorded.phase`, `idearium/phases/2026-10-16-code-tab-rebuild/TB7b_keep_every_step.phase`

#### `idearium/phases/2026-10-16-code-tab-rebuild/graph/`

11 other file(s).

- other: `idearium/phases/2026-10-16-code-tab-rebuild/graph/DK2_the_dock-fab19127bc19d5c2.graph`, `idearium/phases/2026-10-16-code-tab-rebuild/graph/TB0_decisions-9af0f76e404926bf.graph`, `idearium/phases/2026-10-16-code-tab-rebuild/graph/TB2_persistence_audit-dc51aa7374ac0e10.graph`, `idearium/phases/2026-10-16-code-tab-rebuild/graph/TB3_close_the_persistence_gaps-84bee17604195980.graph`, `idearium/phases/2026-10-16-code-tab-rebuild/graph/TB4a_recall_in_the_dispatcher-9adab27152f90da2.graph`, `idearium/phases/2026-10-16-code-tab-rebuild/graph/TB4b_nexus_recall_tool-0850a81b6d5d8bbf.graph`, `idearium/phases/2026-10-16-code-tab-rebuild/graph/TB4c_measure-a6559845267cef0c.graph`, `idearium/phases/2026-10-16-code-tab-rebuild/graph/TB5_tab_shell-45459c6b9780f0d9.graph`, `idearium/phases/2026-10-16-code-tab-rebuild/graph/TB6_files_changes_plans_cos_tabs-53d029fe85983028.graph`, `idearium/phases/2026-10-16-code-tab-rebuild/graph/TB7a_edges_recorded-69330154410e55a9.graph`, `idearium/phases/2026-10-16-code-tab-rebuild/graph/TB7b_keep_every_step-0195fb0a003654e7.graph`

#### `idearium/phases/2026-10-16-cos-console/`

1 other file(s).

- other: `idearium/phases/2026-10-16-cos-console/CON2_grammar_and_completion.phase`

#### `idearium/phases/2026-10-16-cos-console/graph/`

1 other file(s).

- other: `idearium/phases/2026-10-16-cos-console/graph/CON2_grammar_and_completion-762c2205a20307d8.graph`

#### `idearium/phases/2026-10-16-cos-console/graph/_superseded/`

1 other file(s).

- other: `idearium/phases/2026-10-16-cos-console/graph/_superseded/CON2_grammar_and_completion-8bab477abc0720ae.graph`

#### `idearium/phases/2026-10-16-durable-work-timeline/`

1 other file(s).

- other: `idearium/phases/2026-10-16-durable-work-timeline/TL5_the_code_tab_timeline.phase`

#### `idearium/phases/2026-10-16-durable-work-timeline/graph/`

1 other file(s).

- other: `idearium/phases/2026-10-16-durable-work-timeline/graph/TL5_the_code_tab_timeline-143fd58bcbeb02d8.graph`

#### `idearium/phases/2026-10-16-intent-hat-agent-chain/`

1 other file(s).

- other: `idearium/phases/2026-10-16-intent-hat-agent-chain/IH4_api_command_ui.phase`

#### `idearium/phases/2026-10-16-intent-hat-agent-chain/graph/`

1 other file(s).

- other: `idearium/phases/2026-10-16-intent-hat-agent-chain/graph/IH4_api_command_ui-39e633419acbf0d0.graph`

#### `idearium/phases/2026-10-16-intent-hat-agent-chain/graph/_superseded/`

1 other file(s).

- other: `idearium/phases/2026-10-16-intent-hat-agent-chain/graph/_superseded/IH4_api_command_ui-491e5bd186c25940.graph`

#### `idearium/phases/2026-10-16-plan-sidebar/`

2 other file(s).

- other: `idearium/phases/2026-10-16-plan-sidebar/PS2_plan_panel_three_cards.phase`, `idearium/phases/2026-10-16-plan-sidebar/PS3_the_rest_their_own_panels.phase`

#### `idearium/phases/2026-10-16-plan-sidebar/graph/`

2 other file(s).

- other: `idearium/phases/2026-10-16-plan-sidebar/graph/PS2_plan_panel_three_cards-0c8cdf906f861391.graph`, `idearium/phases/2026-10-16-plan-sidebar/graph/PS3_the_rest_their_own_panels-c48c2855bc50e215.graph`

#### `idearium/phases/2026-10-16-reject-learn-retry/`

2 other file(s).

- other: `idearium/phases/2026-10-16-reject-learn-retry/RL2_learn_then_retry.phase`, `idearium/phases/2026-10-16-reject-learn-retry/RL4_the_lessons_on_the_door.phase`

#### `idearium/phases/2026-10-16-reject-learn-retry/graph/`

2 other file(s).

- other: `idearium/phases/2026-10-16-reject-learn-retry/graph/RL2_learn_then_retry-e33fba3f258d9c82.graph`, `idearium/phases/2026-10-16-reject-learn-retry/graph/RL4_the_lessons_on_the_door-3304e77663db89d5.graph`

#### `idearium/phases/2026-10-16-reject-learn-retry/graph/_superseded/`

3 other file(s).

- other: `idearium/phases/2026-10-16-reject-learn-retry/graph/_superseded/RL2_learn_then_retry-39af0667fca566e6.graph`, `idearium/phases/2026-10-16-reject-learn-retry/graph/_superseded/RL4_the_lessons_on_the_door-7e28e5b56ce09cac.graph`, `idearium/phases/2026-10-16-reject-learn-retry/graph/_superseded/RL4_the_lessons_on_the_door-bbafadd375cd2657.graph`

#### `idearium/phases/2026-10-16-repo-carve/`

2 other file(s).

- other: `idearium/phases/2026-10-16-repo-carve/CV1_carve_backend_route_command_ui.phase`, `idearium/phases/2026-10-16-repo-carve/FR9_sandboxed_in_compartments.phase`

#### `idearium/phases/2026-10-16-repo-carve/graph/`

2 other file(s).

- other: `idearium/phases/2026-10-16-repo-carve/graph/CV1_carve_backend_route_command_ui-dd041d77cc047b03.graph`, `idearium/phases/2026-10-16-repo-carve/graph/FR9_sandboxed_in_compartments-b650b1973c9adbba.graph`

#### `idearium/phases/2026-10-16-repo-carve/graph/_superseded/`

1 other file(s).

- other: `idearium/phases/2026-10-16-repo-carve/graph/_superseded/CV1_carve_backend_route_command_ui-e3edbcdf3d659991.graph`

#### `idearium/phases/2026-10-17-debugging-product/`

1 other file(s).

- other: `idearium/phases/2026-10-17-debugging-product/DP1_the_doors.phase`

#### `idearium/phases/2026-10-17-debugging-product/graph/`

1 other file(s).

- other: `idearium/phases/2026-10-17-debugging-product/graph/DP1_the_doors-acae45ffeebafce1.graph`

#### `idearium/phases/2026-10-17-debugging-product/graph/_superseded/`

1 other file(s).

- other: `idearium/phases/2026-10-17-debugging-product/graph/_superseded/DP1_the_doors-9c5b97f48be11c5b.graph`

#### `idearium/phases/2026-10-17-failure-mode-report/`

1 other file(s).

- other: `idearium/phases/2026-10-17-failure-mode-report/FMR8_the_report_on_screen.phase`

#### `idearium/phases/2026-10-17-failure-mode-report/graph/`

1 other file(s).

- other: `idearium/phases/2026-10-17-failure-mode-report/graph/FMR8_the_report_on_screen-36b40641e24aae8e.graph`

#### `idearium/phases/2026-10-17-pieces-not-order/`

1 other file(s).

- other: `idearium/phases/2026-10-17-pieces-not-order/PC5_control_when_he_chooses.phase`

#### `idearium/phases/2026-10-17-pieces-not-order/graph/`

1 other file(s).

- other: `idearium/phases/2026-10-17-pieces-not-order/graph/PC5_control_when_he_chooses-c8e1abb9c6651522.graph`

#### `idearium/phases/2026-10-17-pieces-not-order/graph/_superseded/`

1 other file(s).

- other: `idearium/phases/2026-10-17-pieces-not-order/graph/_superseded/PC5_control_when_he_chooses-11bf61bdc8df910b.graph`

#### `idearium/phases/2026-10-17-system-drawbridge/`

9 other file(s).

- other: `idearium/phases/2026-10-17-system-drawbridge/DB0a_still_open.phase`, `idearium/phases/2026-10-17-system-drawbridge/DB0b_reading.phase`, `idearium/phases/2026-10-17-system-drawbridge/DB15_toasts_declared.phase`, `idearium/phases/2026-10-17-system-drawbridge/DB19_genesis_sandboxed_fork.phase`, `idearium/phases/2026-10-17-system-drawbridge/DB2_the_registry_says_what_it_offers.phase`, `idearium/phases/2026-10-17-system-drawbridge/DB4_one_bus_per_system.phase`, `idearium/phases/2026-10-17-system-drawbridge/DB7_the_ui_floats_on_top.phase`, `idearium/phases/2026-10-17-system-drawbridge/DB8_agents_have_it.phase`, `idearium/phases/2026-10-17-system-drawbridge/P33_slices.phase`

#### `idearium/phases/2026-10-17-system-drawbridge/graph/`

9 other file(s).

- other: `idearium/phases/2026-10-17-system-drawbridge/graph/DB0a_still_open-c850c4ed5b9cba3f.graph`, `idearium/phases/2026-10-17-system-drawbridge/graph/DB0b_reading-33012a35bf1f82ac.graph`, `idearium/phases/2026-10-17-system-drawbridge/graph/DB15_toasts_declared-0e1c1ccd78450583.graph`, `idearium/phases/2026-10-17-system-drawbridge/graph/DB19_genesis_sandboxed_fork-68f0ea951c3c9dae.graph`, `idearium/phases/2026-10-17-system-drawbridge/graph/DB2_the_registry_says_what_it_offers-4121727170f95b81.graph`, `idearium/phases/2026-10-17-system-drawbridge/graph/DB4_one_bus_per_system-2212630faddc3883.graph`, `idearium/phases/2026-10-17-system-drawbridge/graph/DB7_the_ui_floats_on_top-3edb553849e9c3bc.graph`, `idearium/phases/2026-10-17-system-drawbridge/graph/DB8_agents_have_it-1436fb94e6e0ff14.graph`, `idearium/phases/2026-10-17-system-drawbridge/graph/P33_slices-175c69cb48638ad2.graph`

#### `idearium/phases/2026-10-18-compartment-environment/`

2 other file(s).

- other: `idearium/phases/2026-10-18-compartment-environment/CE6_the_code_tab.phase`, `idearium/phases/2026-10-18-compartment-environment/CE7_agents_and_commands.phase`

#### `idearium/phases/2026-10-18-compartment-environment/graph/`

2 other file(s).

- other: `idearium/phases/2026-10-18-compartment-environment/graph/CE6_the_code_tab-f11d856e1aa25e18.graph`, `idearium/phases/2026-10-18-compartment-environment/graph/CE7_agents_and_commands-b55067f969093bc5.graph`

#### `idearium/phases/2026-10-18-compartment-environment/graph/_superseded/`

1 other file(s).

- other: `idearium/phases/2026-10-18-compartment-environment/graph/_superseded/CE7_agents_and_commands-cc438bb660d2012c.graph`

#### `idearium/phases/2026-10-18-debugging-product/`

2 other file(s).

- other: `idearium/phases/2026-10-18-debugging-product/DBG5_rewind_from_a_case.phase`, `idearium/phases/2026-10-18-debugging-product/DBG7_route_command_ui.phase`

#### `idearium/phases/2026-10-18-debugging-product/graph/`

2 other file(s).

- other: `idearium/phases/2026-10-18-debugging-product/graph/DBG5_rewind_from_a_case-cfffc4ab781d68ec.graph`, `idearium/phases/2026-10-18-debugging-product/graph/DBG7_route_command_ui-a344147f583c3a54.graph`

#### `idearium/phases/2026-10-18-debugging-product/graph/_superseded/`

1 other file(s).

- other: `idearium/phases/2026-10-18-debugging-product/graph/_superseded/DBG7_route_command_ui-b81f989842d93bc7.graph`

#### `idearium/phases/2026-10-18-gate-memory/`

2 other file(s).

- other: `idearium/phases/2026-10-18-gate-memory/GM7_the_context_panel_per_gate.phase`, `idearium/phases/2026-10-18-gate-memory/GM8_agents_have_it.phase`

#### `idearium/phases/2026-10-18-gate-memory/graph/`

2 other file(s).

- other: `idearium/phases/2026-10-18-gate-memory/graph/GM7_the_context_panel_per_gate-2ed37a32420fdf17.graph`, `idearium/phases/2026-10-18-gate-memory/graph/GM8_agents_have_it-e98b0bbe016313f7.graph`

#### `idearium/phases/2026-10-18-gate-memory/graph/_superseded/`

2 other file(s).

- other: `idearium/phases/2026-10-18-gate-memory/graph/_superseded/GM7_the_context_panel_per_gate-2031c0c663349829.graph`, `idearium/phases/2026-10-18-gate-memory/graph/_superseded/GM8_agents_have_it-45a73d0250d2d055.graph`

#### `idearium/phases/2026-10-19-gate-quality-checks/`

4 other file(s).

- other: `idearium/phases/2026-10-19-gate-quality-checks/GQ2_brick_gate_runs_the_test.phase`, `idearium/phases/2026-10-19-gate-quality-checks/GQ4_phase_gate_keeps_the_test.phase`, `idearium/phases/2026-10-19-gate-quality-checks/GQ5_command.phase`, `idearium/phases/2026-10-19-gate-quality-checks/GQ6_ui.phase`

#### `idearium/phases/2026-10-19-gate-quality-checks/graph/`

4 other file(s).

- other: `idearium/phases/2026-10-19-gate-quality-checks/graph/GQ2_brick_gate_runs_the_test-99535c5a555b550c.graph`, `idearium/phases/2026-10-19-gate-quality-checks/graph/GQ4_phase_gate_keeps_the_test-3c5b3e03ff62f4e5.graph`, `idearium/phases/2026-10-19-gate-quality-checks/graph/GQ5_command-34f5faae75b0451c.graph`, `idearium/phases/2026-10-19-gate-quality-checks/graph/GQ6_ui-60394e9276084fea.graph`

#### `idearium/phases/2026-10-19-gate-quality-checks/graph/_superseded/`

3 other file(s).

- other: `idearium/phases/2026-10-19-gate-quality-checks/graph/_superseded/GQ2_brick_gate_runs_the_test-44bd9b0fe7114c73.graph`, `idearium/phases/2026-10-19-gate-quality-checks/graph/_superseded/GQ4_phase_gate_keeps_the_test-8d183bcb2f8535fe.graph`, `idearium/phases/2026-10-19-gate-quality-checks/graph/_superseded/GQ5_command-176adf36740d9ccb.graph`

#### `idearium/phases/2026-10-19-gig-autofill-and-learn/`

1 other file(s).

- other: `idearium/phases/2026-10-19-gig-autofill-and-learn/GA5_commands_and_the_panel.phase`

#### `idearium/phases/2026-10-19-gig-autofill-and-learn/graph/`

1 other file(s).

- other: `idearium/phases/2026-10-19-gig-autofill-and-learn/graph/GA5_commands_and_the_panel-22403425d95ab042.graph`

#### `idearium/phases/2026-10-19-gig-autofill-and-learn/graph/_superseded/`

1 other file(s).

- other: `idearium/phases/2026-10-19-gig-autofill-and-learn/graph/_superseded/GA5_commands_and_the_panel-df6524bf85b1a1f6.graph`

#### `idearium/phases/2026-10-19-idearium-control/`

8 other file(s).

- other: `idearium/phases/2026-10-19-idearium-control/CT0_code_tab_census.phase`, `idearium/phases/2026-10-19-idearium-control/CT1_fewer_wider_tabs.phase`, `idearium/phases/2026-10-19-idearium-control/FM1_file_manager.phase`, `idearium/phases/2026-10-19-idearium-control/FM2_stores_in_the_files_tab.phase`, `idearium/phases/2026-10-19-idearium-control/IM1_ideas_and_notes_as_one.phase`, `idearium/phases/2026-10-19-idearium-control/PC1_phase_controls.phase`, `idearium/phases/2026-10-19-idearium-control/TB1_toolbox.phase`, `idearium/phases/2026-10-19-idearium-control/VS1_versions_in_the_surface.phase`

#### `idearium/phases/2026-10-19-idearium-control/graph/`

8 other file(s).

- other: `idearium/phases/2026-10-19-idearium-control/graph/CT0_code_tab_census-68fe806d18a6ee3e.graph`, `idearium/phases/2026-10-19-idearium-control/graph/CT1_fewer_wider_tabs-454129e18b89f64d.graph`, `idearium/phases/2026-10-19-idearium-control/graph/FM1_file_manager-e0543c6f107072a8.graph`, `idearium/phases/2026-10-19-idearium-control/graph/FM2_stores_in_the_files_tab-d4fe2183710c725b.graph`, `idearium/phases/2026-10-19-idearium-control/graph/IM1_ideas_and_notes_as_one-b11d0d8dc6b1eec4.graph`, `idearium/phases/2026-10-19-idearium-control/graph/PC1_phase_controls-15931af4eaa43519.graph`, `idearium/phases/2026-10-19-idearium-control/graph/TB1_toolbox-34de6cfb5f9c9649.graph`, `idearium/phases/2026-10-19-idearium-control/graph/VS1_versions_in_the_surface-9086183fce184ea5.graph`

#### `idearium/phases/2026-10-19-idearium-control/graph/_superseded/`

5 other file(s).

- other: `idearium/phases/2026-10-19-idearium-control/graph/_superseded/FM1_file_manager-30ae3862a6fbedde.graph`, `idearium/phases/2026-10-19-idearium-control/graph/_superseded/FM2_stores_in_the_files_tab-0cb3102874e66839.graph`, `idearium/phases/2026-10-19-idearium-control/graph/_superseded/PC1_phase_controls-530560b20a4638d0.graph`, `idearium/phases/2026-10-19-idearium-control/graph/_superseded/TB1_toolbox-573f4e5a75544e59.graph`, `idearium/phases/2026-10-19-idearium-control/graph/_superseded/VS1_versions_in_the_surface-2f948ae931b8b5ff.graph`

#### `idearium/phases/2026-10-19-infrastructure-spine/`

2 other file(s).

- other: `idearium/phases/2026-10-19-infrastructure-spine/IN3a_build_stands_on_the_registry.phase`, `idearium/phases/2026-10-19-infrastructure-spine/IN8_any_size.phase`

#### `idearium/phases/2026-10-19-infrastructure-spine/graph/`

2 other file(s).

- other: `idearium/phases/2026-10-19-infrastructure-spine/graph/IN3a_build_stands_on_the_registry-d5ae44f273f56804.graph`, `idearium/phases/2026-10-19-infrastructure-spine/graph/IN8_any_size-600c9f6639a071fb.graph`

#### `idearium/phases/2026-10-19-infrastructure-spine/graph/_superseded/`

2 other file(s).

- other: `idearium/phases/2026-10-19-infrastructure-spine/graph/_superseded/IN3a_build_stands_on_the_registry-a6693c99336de552.graph`, `idearium/phases/2026-10-19-infrastructure-spine/graph/_superseded/IN8_any_size-93a371269b367b64.graph`

#### `idearium/phases/2026-10-19-pipeline-root-causes/`

7 other file(s).

- other: `idearium/phases/2026-10-19-pipeline-root-causes/DG3_the_whole_dag.phase`, `idearium/phases/2026-10-19-pipeline-root-causes/DG4_nexus_maps_meet_the_standard.phase`, `idearium/phases/2026-10-19-pipeline-root-causes/DG5_dag_in_the_brief_and_the_ui.phase`, `idearium/phases/2026-10-19-pipeline-root-causes/PR2_autofill_and_copilot_read_first.phase`, `idearium/phases/2026-10-19-pipeline-root-causes/RC6_unowned_ollama_load.phase`, `idearium/phases/2026-10-19-pipeline-root-causes/RC7_every_run_names_its_starter.phase`, `idearium/phases/2026-10-19-pipeline-root-causes/UI2_version_in_code.phase`

#### `idearium/phases/2026-10-19-pipeline-root-causes/graph/`

7 other file(s).

- other: `idearium/phases/2026-10-19-pipeline-root-causes/graph/DG3_the_whole_dag-cd43eaf82d452fb7.graph`, `idearium/phases/2026-10-19-pipeline-root-causes/graph/DG4_nexus_maps_meet_the_standard-8326c3166e4620ea.graph`, `idearium/phases/2026-10-19-pipeline-root-causes/graph/DG5_dag_in_the_brief_and_the_ui-7c64f9ae4e29eb6a.graph`, `idearium/phases/2026-10-19-pipeline-root-causes/graph/PR2_autofill_and_copilot_read_first-b4ddc2d39aad8dc7.graph`, `idearium/phases/2026-10-19-pipeline-root-causes/graph/RC6_unowned_ollama_load-67b8e7d0ffd6cf9d.graph`, `idearium/phases/2026-10-19-pipeline-root-causes/graph/RC7_every_run_names_its_starter-f9e33f042818d7e9.graph`, `idearium/phases/2026-10-19-pipeline-root-causes/graph/UI2_version_in_code-a64f2e08115a04e1.graph`

#### `idearium/phases/2026-10-19-pipeline-root-causes/graph/_superseded/`

8 other file(s).

- other: `idearium/phases/2026-10-19-pipeline-root-causes/graph/_superseded/DG3_the_whole_dag-387f28abb7b7bfa6.graph`, `idearium/phases/2026-10-19-pipeline-root-causes/graph/_superseded/DG3_the_whole_dag-90cdc31b0f6c7614.graph`, `idearium/phases/2026-10-19-pipeline-root-causes/graph/_superseded/DG3_the_whole_dag-9cfb242403b7f8b3.graph`, `idearium/phases/2026-10-19-pipeline-root-causes/graph/_superseded/DG3_the_whole_dag-b29958cf7cd36370.graph`, `idearium/phases/2026-10-19-pipeline-root-causes/graph/_superseded/RC7_every_run_names_its_starter-4b99cd95537cb85c.graph`, `idearium/phases/2026-10-19-pipeline-root-causes/graph/_superseded/RC7_every_run_names_its_starter-e71ac0a4e3f549ec.graph`, `idearium/phases/2026-10-19-pipeline-root-causes/graph/_superseded/UI2_version_in_code-a31a39722f93b060.graph`, `idearium/phases/2026-10-19-pipeline-root-causes/graph/_superseded/UI2_version_in_code-d70b04b30efde11f.graph`

#### `idearium/phases/2026-10-19-solid-build-foundation/`

4 other file(s).

- other: `idearium/phases/2026-10-19-solid-build-foundation/GQ2_brick_gate_runs_the_test.phase`, `idearium/phases/2026-10-19-solid-build-foundation/GQ4_phase_gate_keeps_the_test.phase`, `idearium/phases/2026-10-19-solid-build-foundation/SET1_autobuild_config_and_command.phase`, `idearium/phases/2026-10-19-solid-build-foundation/SET2_autobuild_settings_ui.phase`

#### `idearium/phases/2026-10-19-solid-build-foundation/graph/`

4 other file(s).

- other: `idearium/phases/2026-10-19-solid-build-foundation/graph/GQ2_brick_gate_runs_the_test-49aea393264a386d.graph`, `idearium/phases/2026-10-19-solid-build-foundation/graph/GQ4_phase_gate_keeps_the_test-3b4f12b4a21d6418.graph`, `idearium/phases/2026-10-19-solid-build-foundation/graph/SET1_autobuild_config_and_command-44c884e599eb17d4.graph`, `idearium/phases/2026-10-19-solid-build-foundation/graph/SET2_autobuild_settings_ui-c78e2af0f32b3534.graph`

#### `idearium/phases/2026-10-19-solid-build-foundation/graph/_superseded/`

3 other file(s).

- other: `idearium/phases/2026-10-19-solid-build-foundation/graph/_superseded/GQ2_brick_gate_runs_the_test-384b9e70be3b7f5b.graph`, `idearium/phases/2026-10-19-solid-build-foundation/graph/_superseded/GQ4_phase_gate_keeps_the_test-dea1678c49093827.graph`, `idearium/phases/2026-10-19-solid-build-foundation/graph/_superseded/SET1_autobuild_config_and_command-8ba4dcf5e6c54fd0.graph`

#### `idearium/phases/2026-10-19-upload-intent-and-page-map/`

2 other file(s).

- other: `idearium/phases/2026-10-19-upload-intent-and-page-map/UP3_upload_routes_and_commands.phase`, `idearium/phases/2026-10-19-upload-intent-and-page-map/UP4_upload_ui.phase`

#### `idearium/phases/2026-10-19-upload-intent-and-page-map/graph/`

2 other file(s).

- other: `idearium/phases/2026-10-19-upload-intent-and-page-map/graph/UP3_upload_routes_and_commands-a1c6f657e03bf3cf.graph`, `idearium/phases/2026-10-19-upload-intent-and-page-map/graph/UP4_upload_ui-dcd2230ed41c4df6.graph`

#### `idearium/phases/2026-10-19-upload-intent-and-page-map/graph/_superseded/`

1 other file(s).

- other: `idearium/phases/2026-10-19-upload-intent-and-page-map/graph/_superseded/UP3_upload_routes_and_commands-482f723155e730e0.graph`

#### `idearium/phases/2026-10-20-belief-loop/`

1 other file(s).

- other: `idearium/phases/2026-10-20-belief-loop/CY3_belief_panel.phase`

#### `idearium/phases/2026-10-20-belief-loop/graph/`

1 other file(s).

- other: `idearium/phases/2026-10-20-belief-loop/graph/CY3_belief_panel-15e237754c465dd9.graph`

#### `idearium/phases/2026-10-20-belief-loop/graph/_superseded/`

2 other file(s).

- other: `idearium/phases/2026-10-20-belief-loop/graph/_superseded/CY3_belief_panel-38cb88c35d626a37.graph`, `idearium/phases/2026-10-20-belief-loop/graph/_superseded/CY3_belief_panel-e6a09dc8b785fe0e.graph`

#### `idearium/phases/2026-10-20-substrate-graph-traversal-chunking-gating/`

3 other file(s).

- other: `idearium/phases/2026-10-20-substrate-graph-traversal-chunking-gating/CH3_chunk_inspector.phase`, `idearium/phases/2026-10-20-substrate-graph-traversal-chunking-gating/GR3_graph_query_surface.phase`, `idearium/phases/2026-10-20-substrate-graph-traversal-chunking-gating/GW3_gate_panel.phase`

#### `idearium/phases/2026-10-20-substrate-graph-traversal-chunking-gating/graph/`

3 other file(s).

- other: `idearium/phases/2026-10-20-substrate-graph-traversal-chunking-gating/graph/CH3_chunk_inspector-bd0deee9407c7069.graph`, `idearium/phases/2026-10-20-substrate-graph-traversal-chunking-gating/graph/GR3_graph_query_surface-970f41c6d6c7a265.graph`, `idearium/phases/2026-10-20-substrate-graph-traversal-chunking-gating/graph/GW3_gate_panel-f96ac00a48cb7b6b.graph`

#### `idearium/phases/2026-10-20-substrate-graph-traversal-chunking-gating/graph/_superseded/`

6 other file(s).

- other: `idearium/phases/2026-10-20-substrate-graph-traversal-chunking-gating/graph/_superseded/CH3_chunk_inspector-99f25ae95f99935d.graph`, `idearium/phases/2026-10-20-substrate-graph-traversal-chunking-gating/graph/_superseded/CH3_chunk_inspector-c8566fe9a29a7307.graph`, `idearium/phases/2026-10-20-substrate-graph-traversal-chunking-gating/graph/_superseded/GR3_graph_query_surface-270c359dad6ee6b9.graph`, `idearium/phases/2026-10-20-substrate-graph-traversal-chunking-gating/graph/_superseded/GR3_graph_query_surface-d0e57a5baa382165.graph`, `idearium/phases/2026-10-20-substrate-graph-traversal-chunking-gating/graph/_superseded/GW3_gate_panel-69c269bf13faff30.graph`, `idearium/phases/2026-10-20-substrate-graph-traversal-chunking-gating/graph/_superseded/GW3_gate_panel-c9d8030a699919e0.graph`

#### `idearium/phases/2026-10-21-approval-chain/`

2 other file(s).

- other: `idearium/phases/2026-10-21-approval-chain/APV3_changelog_read.phase`, `idearium/phases/2026-10-21-approval-chain/APV4_emit_on_the_ledger.phase`

#### `idearium/phases/2026-10-21-approval-chain/graph/`

2 other file(s).

- other: `idearium/phases/2026-10-21-approval-chain/graph/APV3_changelog_read-dc75b22caf0aa331.graph`, `idearium/phases/2026-10-21-approval-chain/graph/APV4_emit_on_the_ledger-247812d44b3d8736.graph`

#### `idearium/phases/2026-10-21-approval-chain/graph/_superseded/`

4 other file(s).

- other: `idearium/phases/2026-10-21-approval-chain/graph/_superseded/APV3_changelog_read-4b56ad2bdd0f2cad.graph`, `idearium/phases/2026-10-21-approval-chain/graph/_superseded/APV3_changelog_read-a8799b04b953ec28.graph`, `idearium/phases/2026-10-21-approval-chain/graph/_superseded/APV4_emit_on_the_ledger-831e03b8acdf10fc.graph`, `idearium/phases/2026-10-21-approval-chain/graph/_superseded/APV4_emit_on_the_ledger-cedb2fe875e7db6e.graph`

#### `idearium/phases/2026-10-21-brainos-into-idearium/`

7 other file(s).

- other: `idearium/phases/2026-10-21-brainos-into-idearium/BX2_flow_sources.phase`, `idearium/phases/2026-10-21-brainos-into-idearium/BX3_flow_canvas.phase`, `idearium/phases/2026-10-21-brainos-into-idearium/BX4_agents_layer.phase`, `idearium/phases/2026-10-21-brainos-into-idearium/BX5_node_controls.phase`, `idearium/phases/2026-10-21-brainos-into-idearium/BX6_pipeline_edit.phase`, `idearium/phases/2026-10-21-brainos-into-idearium/BX7_automation.phase`, `idearium/phases/2026-10-21-brainos-into-idearium/BX8_dock_panels.phase`

#### `idearium/phases/2026-10-21-brainos-into-idearium/graph/`

7 other file(s).

- other: `idearium/phases/2026-10-21-brainos-into-idearium/graph/BX2_flow_sources-aae3672d2c75671a.graph`, `idearium/phases/2026-10-21-brainos-into-idearium/graph/BX3_flow_canvas-0cfcc543816b7eee.graph`, `idearium/phases/2026-10-21-brainos-into-idearium/graph/BX4_agents_layer-a877f16582b136ef.graph`, `idearium/phases/2026-10-21-brainos-into-idearium/graph/BX5_node_controls-53774bffdb605c65.graph`, `idearium/phases/2026-10-21-brainos-into-idearium/graph/BX6_pipeline_edit-a7874d45d8fbf5a0.graph`, `idearium/phases/2026-10-21-brainos-into-idearium/graph/BX7_automation-883e4f966f6fffd2.graph`, `idearium/phases/2026-10-21-brainos-into-idearium/graph/BX8_dock_panels-13df1648e45b6aa2.graph`

#### `idearium/phases/2026-10-21-brainos-into-idearium/graph/_superseded/`

6 other file(s).

- other: `idearium/phases/2026-10-21-brainos-into-idearium/graph/_superseded/BX2_flow_sources-0f02f30efeb426ac.graph`, `idearium/phases/2026-10-21-brainos-into-idearium/graph/_superseded/BX2_flow_sources-37e364e91aef63f4.graph`, `idearium/phases/2026-10-21-brainos-into-idearium/graph/_superseded/BX5_node_controls-18d39953f30981ae.graph`, `idearium/phases/2026-10-21-brainos-into-idearium/graph/_superseded/BX5_node_controls-8af169be49d40dc5.graph`, `idearium/phases/2026-10-21-brainos-into-idearium/graph/_superseded/BX7_automation-1f9e4c1632626090.graph`, `idearium/phases/2026-10-21-brainos-into-idearium/graph/_superseded/BX7_automation-6615544c90e45a2a.graph`

#### `idearium/phases/2026-10-21-data-layout/`

1 other file(s).

- other: `idearium/phases/2026-10-21-data-layout/DL4_one_repo_folder.phase`

#### `idearium/phases/2026-10-21-data-layout/graph/`

1 other file(s).

- other: `idearium/phases/2026-10-21-data-layout/graph/DL4_one_repo_folder-60343e03dda1be5f.graph`

#### `idearium/phases/2026-10-22-system-node-db/`

2 other file(s).

- other: `idearium/phases/2026-10-22-system-node-db/ND5_every_agent_reaches_every_system.phase`, `idearium/phases/2026-10-22-system-node-db/ND6_the_nodes_screen.phase`

#### `idearium/phases/2026-10-22-system-node-db/graph/`

2 other file(s).

- other: `idearium/phases/2026-10-22-system-node-db/graph/ND5_every_agent_reaches_every_system-4eb4f0833f459f6a.graph`, `idearium/phases/2026-10-22-system-node-db/graph/ND6_the_nodes_screen-84631efc91474720.graph`

#### `idearium/phases/2026-10-22-system-node-db/graph/_superseded/`

2 other file(s).

- other: `idearium/phases/2026-10-22-system-node-db/graph/_superseded/ND5_every_agent_reaches_every_system-85c309ce09d5a7d5.graph`, `idearium/phases/2026-10-22-system-node-db/graph/_superseded/ND5_every_agent_reaches_every_system-f07c86902defd601.graph`

#### `idearium/phases/2026-10-23-self-building-loop/`

6 other file(s).

- other: `idearium/phases/2026-10-23-self-building-loop/SL0_what_can_be_built_now.phase`, `idearium/phases/2026-10-23-self-building-loop/SL10_the_pipeline_simulated.phase`, `idearium/phases/2026-10-23-self-building-loop/SL1_a_proven_phase_closes_itself.phase`, `idearium/phases/2026-10-23-self-building-loop/SL4_the_loop.phase`, `idearium/phases/2026-10-23-self-building-loop/SL7_build_again_is_asked_for.phase`, `idearium/phases/2026-10-23-self-building-loop/SL8_the_agent_maps_what_nexus_cannot.phase`

#### `idearium/phases/2026-10-23-self-building-loop/graph/`

6 other file(s).

- other: `idearium/phases/2026-10-23-self-building-loop/graph/SL0_what_can_be_built_now-eb2acda9c8595faf.graph`, `idearium/phases/2026-10-23-self-building-loop/graph/SL10_the_pipeline_simulated-35d2671c3e5e5007.graph`, `idearium/phases/2026-10-23-self-building-loop/graph/SL1_a_proven_phase_closes_itself-f33f53588a4a5d6f.graph`, `idearium/phases/2026-10-23-self-building-loop/graph/SL4_the_loop-291fde3fbea484cf.graph`, `idearium/phases/2026-10-23-self-building-loop/graph/SL7_build_again_is_asked_for-b4bfe731e603bdfb.graph`, `idearium/phases/2026-10-23-self-building-loop/graph/SL8_the_agent_maps_what_nexus_cannot-f6c7ecddbd0d8d46.graph`

#### `idearium/phases/2026-10-23-self-building-loop/graph/_superseded/`

9 other file(s).

- other: `idearium/phases/2026-10-23-self-building-loop/graph/_superseded/SL0_what_can_be_built_now-b32fb6604d2567f7.graph`, `idearium/phases/2026-10-23-self-building-loop/graph/_superseded/SL0_what_can_be_built_now-d4b7b03b3139be7f.graph`, `idearium/phases/2026-10-23-self-building-loop/graph/_superseded/SL10_the_pipeline_simulated-1acb38d7cc404522.graph`, `idearium/phases/2026-10-23-self-building-loop/graph/_superseded/SL1_a_proven_phase_closes_itself-6bccee108a7faf2e.graph`, `idearium/phases/2026-10-23-self-building-loop/graph/_superseded/SL1_a_proven_phase_closes_itself-c3e5309c4ae10c83.graph`, `idearium/phases/2026-10-23-self-building-loop/graph/_superseded/SL4_the_loop-25e5d0a903e2cd92.graph`, `idearium/phases/2026-10-23-self-building-loop/graph/_superseded/SL4_the_loop-3dcb223b8d82e43d.graph`, `idearium/phases/2026-10-23-self-building-loop/graph/_superseded/SL7_build_again_is_asked_for-0f0ab8a3543b9460.graph`, `idearium/phases/2026-10-23-self-building-loop/graph/_superseded/SL8_the_agent_maps_what_nexus_cannot-0f39da6d2b92c695.graph`

#### `idearium/phases/2026-10-24-diagnostic-and-healing-one-system/`

1 other file(s).

- other: `idearium/phases/2026-10-24-diagnostic-and-healing-one-system/DH6_seen_and_used.phase`

#### `idearium/phases/2026-10-24-diagnostic-and-healing-one-system/graph/`

1 other file(s).

- other: `idearium/phases/2026-10-24-diagnostic-and-healing-one-system/graph/DH6_seen_and_used-0b12cd8a75535716.graph`

#### `idearium/phases/2026-10-24-github-context-and-agent-settings/`

3 other file(s).

- other: `idearium/phases/2026-10-24-github-context-and-agent-settings/AS1_one_resolver_global_then_repo.phase`, `idearium/phases/2026-10-24-github-context-and-agent-settings/GH1_a_compartment_gets_its_github_repo.phase`, `idearium/phases/2026-10-24-github-context-and-agent-settings/GH3_sync_per_compartment.phase`

#### `idearium/phases/2026-10-24-github-context-and-agent-settings/graph/`

3 other file(s).

- other: `idearium/phases/2026-10-24-github-context-and-agent-settings/graph/AS1_one_resolver_global_then_repo-5201c36903685dac.graph`, `idearium/phases/2026-10-24-github-context-and-agent-settings/graph/GH1_a_compartment_gets_its_github_repo-e11bf64b6f4cf915.graph`, `idearium/phases/2026-10-24-github-context-and-agent-settings/graph/GH3_sync_per_compartment-44ddd0ca95b9cd33.graph`

#### `idearium/phases/2026-10-24-github-context-and-agent-settings/graph/_superseded/`

3 other file(s).

- other: `idearium/phases/2026-10-24-github-context-and-agent-settings/graph/_superseded/AS1_one_resolver_global_then_repo-e2c9ffd78a9405e0.graph`, `idearium/phases/2026-10-24-github-context-and-agent-settings/graph/_superseded/GH1_a_compartment_gets_its_github_repo-8baa02e148376348.graph`, `idearium/phases/2026-10-24-github-context-and-agent-settings/graph/_superseded/GH3_sync_per_compartment-6b8b11f5d9cc9458.graph`

#### `idearium/phases/idearium-creative-repo-overhaul/`

1 other file(s).

- other: `idearium/phases/idearium-creative-repo-overhaul/MCO-E_roadmap_ui.phase`

#### `idearium/phases/idearium-creative-repo-overhaul/graph/`

1 other file(s).

- other: `idearium/phases/idearium-creative-repo-overhaul/graph/MCO-E_roadmap_ui-2258bb8a5d931465.graph`

#### `idearium/phases/idearium-repository-overhaul/`

7 other file(s).

- other: `idearium/phases/idearium-repository-overhaul/MCO-C_repo_materialize.phase`, `idearium/phases/idearium-repository-overhaul/MCO-D_zoom_subrepo.phase`, `idearium/phases/idearium-repository-overhaul/MCO-F_config.phase`, `idearium/phases/idearium-repository-overhaul/MCO0_audit_real_coverage.phase`, `idearium/phases/idearium-repository-overhaul/MCO1_graph_layer.phase`, `idearium/phases/idearium-repository-overhaul/MCO2_verification_deepening.phase`, `idearium/phases/idearium-repository-overhaul/MCO3_snapshot_compliance.phase`

#### `idearium/phases/idearium-repository-overhaul/graph/`

7 other file(s).

- other: `idearium/phases/idearium-repository-overhaul/graph/MCO-C_repo_materialize-a03f31b0a540144f.graph`, `idearium/phases/idearium-repository-overhaul/graph/MCO-D_zoom_subrepo-3cf6d02affb08ecc.graph`, `idearium/phases/idearium-repository-overhaul/graph/MCO-F_config-e75766c143925a9e.graph`, `idearium/phases/idearium-repository-overhaul/graph/MCO0_audit_real_coverage-a2d64fda1e986d73.graph`, `idearium/phases/idearium-repository-overhaul/graph/MCO1_graph_layer-85de28ae27e35120.graph`, `idearium/phases/idearium-repository-overhaul/graph/MCO2_verification_deepening-6b47c1fa993010fe.graph`, `idearium/phases/idearium-repository-overhaul/graph/MCO3_snapshot_compliance-db5a3f4597bead05.graph`

#### `idearium/phases/idearium-repository-overhaul/graph/_superseded/`

1 other file(s).

- other: `idearium/phases/idearium-repository-overhaul/graph/_superseded/MCO-F_config-7292893fe836f4d3.graph`

#### `idearium/phases/nexus-repo-compartment-and-rich-dispatch/`

4 other file(s).

- other: `idearium/phases/nexus-repo-compartment-and-rich-dispatch/NC1_compartment_bootstrapping_decision.phase`, `idearium/phases/nexus-repo-compartment-and-rich-dispatch/NC2_nested_compartment_support.phase`, `idearium/phases/nexus-repo-compartment-and-rich-dispatch/RD2_response_to_multiple_artifact_types.phase`, `idearium/phases/nexus-repo-compartment-and-rich-dispatch/RS1_repo_settings_sections.phase`

#### `idearium/phases/nexus-repo-compartment-and-rich-dispatch/graph/`

4 other file(s).

- other: `idearium/phases/nexus-repo-compartment-and-rich-dispatch/graph/NC1_compartment_bootstrapping_decision-bf4d956cc2a7c398.graph`, `idearium/phases/nexus-repo-compartment-and-rich-dispatch/graph/NC2_nested_compartment_support-0b4000d92371184e.graph`, `idearium/phases/nexus-repo-compartment-and-rich-dispatch/graph/RD2_response_to_multiple_artifact_types-a912e2588846f069.graph`, `idearium/phases/nexus-repo-compartment-and-rich-dispatch/graph/RS1_repo_settings_sections-06ec8dbcca479409.graph`

#### `idearium/phases/nexus-repository-system-build/`

5 other file(s).

- other: `idearium/phases/nexus-repository-system-build/MCO0_audit_real_coverage.phase`, `idearium/phases/nexus-repository-system-build/MCO1_graph_layer.phase`, `idearium/phases/nexus-repository-system-build/MCO2_verification_deepening.phase`, `idearium/phases/nexus-repository-system-build/MCO5_git_integration_credentials.phase`, `idearium/phases/nexus-repository-system-build/MCO6_compartment_ownership.phase`

#### `idearium/phases/nexus-repository-system-build/graph/`

5 other file(s).

- other: `idearium/phases/nexus-repository-system-build/graph/MCO0_audit_real_coverage-d1328f345333d6df.graph`, `idearium/phases/nexus-repository-system-build/graph/MCO1_graph_layer-bec51ffa7d78bab9.graph`, `idearium/phases/nexus-repository-system-build/graph/MCO2_verification_deepening-385db87094adb932.graph`, `idearium/phases/nexus-repository-system-build/graph/MCO5_git_integration_credentials-987edd70d4a2ee2a.graph`, `idearium/phases/nexus-repository-system-build/graph/MCO6_compartment_ownership-cc8efc7174f10e2c.graph`

#### `idearium/phases/rich-atlas/`

3 other file(s).

- other: `idearium/phases/rich-atlas/AT1_full_enumeration_and_clickable_links.phase`, `idearium/phases/rich-atlas/AT2_atlas_editor.phase`, `idearium/phases/rich-atlas/AT3_agent_queryable_atlas.phase`

#### `idearium/phases/rich-atlas/graph/`

3 other file(s).

- other: `idearium/phases/rich-atlas/graph/AT1_full_enumeration_and_clickable_links-b44d8db195669926.graph`, `idearium/phases/rich-atlas/graph/AT2_atlas_editor-fb9a6d853540388e.graph`, `idearium/phases/rich-atlas/graph/AT3_agent_queryable_atlas-528df862578c4752.graph`

#### `idearium/repo/`

33 code file(s).

- `idearium/repo/architecture.js` (193 lines)  
  exports edgesOf, idFor, layerOf, architecture, toNodes · requires 0 · required by 1
- `idearium/repo/build-plan.js` (224 lines)  
  exports GATES, timesOf, piecesOf, historyOf, buildPlan · requires 3 · required by 1
- `idearium/repo/code-api.js` (433 lines) — the codebase surface of a repo: /api/repos/:uuid/code/* §0.39.273 CB4 (docs/2026-09-27-idearium-codebase-toolkit-phasemap.spec). James: "I want idearium solid for building  
  exports ROUTES, handleCode · requires 8 · required by 1
- `idearium/repo/deviation.js` (69 lines) — how far a repo has moved from its baseline, recalculated on every version and on every major file change. §0.39.280 BS3.  
  exports MAJOR_DEFAULTS, compare, deviation, isMajor · requires 0 · required by 1
- `idearium/repo/file-state.js` (58 lines)  
  exports fileStates · requires 0 · required by 1
- `idearium/repo/graph.js` (921 lines)  
  exports RELATIONS_SUPPORTED, RELATIONS_DECLARED_UNSUPPORTED, stripNonCode, extractReferences, LANGUAGES_WITH_EXTRACTORS, resolveSpecifier +11 · requires 0 · required by 3
- `idearium/repo/import-baseline.js` (59 lines) — the MCO-C hook: a repo's first index takes one baseline snapshot, files included.  
  exports ensureBaselineSnapshot
- `idearium/repo/import-pipeline-worker.js` (22 lines) — 0.60.124 SW1 — the import pipeline in its own thread. James's 0.60.122 boot log: idearium OFFLINE for 34 s, then 25 s ("missed its heartbeat"), each during the Nexus  
  requires 1 · required by 1
- `idearium/repo/import-pipeline.js` (904 lines)  
  exports readAtlas, queryByKind, searchRepo, runImportPipeline, runImportPipelineOffThread, MODULE_ID · requires 9 · required by 4
- `idearium/repo/index.js` (1044 lines)  
  exports RepoLayer, COMPONENT_ID · requires 5 · required by 2 · tested by `idearium/test/e2e-pipeline.test.js`
- `idearium/repo/lift-root.js` (63 lines) — a project imported inside its own folder is lifted to the repo's root (0.60.206, SD22). Map: docs/2026-10-10-idearium-solid-phasemap.spec SD22_a_wrapped_repo_lifts_to_its_root  
  exports MARKER_RE, planLift, liftRoot
- `idearium/repo/living-spec.js` (177 lines)  
  exports MODULE_ID, listSpecs, readSpec, parseSpec · requires 2 · required by 1
- `idearium/repo/nexus-self.js` (788 lines) — // idearium/repo/nexus-self.js — Nexus, as repos inside Nexus. // comp_id: nexus.idearium.repo.nexus-self  
  exports MODULE_ID, PARENT_COMPARTMENT, PARENT_REPO, ensureCompartments, syncing, syncSystem +17 · requires 11 · required by 2
- `idearium/repo/phase-mapping.js` (208 lines) — 0.60.29 PM — map every phase of a repo (Nexus, or any project) to its files and dependencies.  
  exports DEFAULTS, runMapping, line, fileStore, mapOne, mapped · requires 1 · required by 1
- `idearium/repo/phases.js` (303 lines)  
  exports MODULE_ID, RUN_TABLE, scopeOf, nexusPhasemaps, mapsFor, mapMeta +7 · requires 5 · required by 2
- `idearium/repo/pipeline-events.js` (84 lines) — the events the import pipeline really emits (MCO4, §20). Spec: idearium/spec/idearium.repository-nodes.spec.  
  exports MAX_BUS_FAILURES, PIPELINE_EVENTS, isCatalogued, makeEmitter, makeBusForwarder · requires 0 · required by 1
- `idearium/repo/proof-run.js` (388 lines)  
  exports MODULE_ID, KINDS, REPORT_FILE, RUNS_DIR, testWayOf, LIMITS +10 · requires 1 · required by 1
- `idearium/repo/repo-node.js` (116 lines) — writes the ONE canonical '.repository' node per repo (nexus-repository-system.spec §3: "A repository is a  
  exports MODULE_ID, toNodePayload, writeRepositoryNode · requires 1 · required by 1
- `idearium/repo/roadmap-import.js` (342 lines)  
  exports MODULE_ID, VERSION, RoadmapImportError, findRoadmaps, rankRoadmaps, parsePhasesJson +4
- `idearium/repo/roadmap.js` (348 lines)  
  exports MODULE_ID, EDITABLE_STATUSES, RoadmapError, isPhasemapPath, collectPhasemaps, buildRoadmap +2 · requires 2 · required by 2
- `idearium/repo/run-reconcile.js` (36 lines) — runs left unfinished by a process that is gone are said to be interrupted (HP2, 0.52.0). Map: docs/2026-10-09-hardening-pass-phasemap.spec (HP2_interrupted_runs_are_said)  
  exports IN_FLIGHT, interruptedRows · requires 0 · required by 1
- `idearium/repo/runtime-proof.js` (183 lines)  
  exports MODULE_ID, PROOF_FILE, PROOF_VERSION, executedLines, functionEntries, computeRuntimeProof +1 · requires 1 · required by 0
- `idearium/repo/scan.js` (346 lines)  
  exports MODULE_ID, SCAN_VERSION, scanDangling, scanGaps, scanTension, scanRepo · requires 2 · required by 0
- `idearium/repo/snapshot-files.js` (74 lines) — the repo's files as raw bytes, for the per-file layer under a repo snapshot (MCO-B).  
  exports validPath, treeHashOf, collectFiles, sha256 · requires 1 · required by 3
- `idearium/repo/snapshot-restore.js` (151 lines)  
  exports restoreRepoSnapshot · requires 1 · required by 0
- `idearium/repo/snapshot.js` (501 lines)  
  exports MODULE_ID, SCHEMA_VERSION, SNAPSHOT_SYSTEM, STATE_KIND, MUST_RECORD, snapshotBranch +6 · requires 2 · required by 2
- `idearium/repo/source-files.js` (352 lines)  
  exports SOURCE_MANIFEST_FILE, MODULE_ID, VERSION, writeSourceFiles, writeSourceFilesAsync, setSourceFile +5 · requires 0 · required by 3
- `idearium/repo/spec-graph.js` (112 lines) — the SPECIFICATION graph for an imported repo. James: "can you make sure the 3 graphs are hooked in?" — the three graphs  
  exports MODULE_ID, SPEC_GRAPH_VERSION, SPEC_GRAPH_FILE, buildSpecGraph, writeSpecGraph, readSpecGraph · requires 1 · required by 1
- `idearium/repo/spec-plan.js` (354 lines)  
  exports LAYERS, AXIOMS, phasemapPathFor, planPrompt, validatePlan, orderPhases +4 · requires 2 · required by 1 · tested by `tests/modules/test-pipeline-nodes.test.js`
- `idearium/repo/thread.js` (108 lines) — the thread: a spec's blocks ⇄ the phases planned from them ⇄ their runs ⇄ files and changes (RS9, 0.49.0). A projection: it reads the .spec, the phasemaps, the run rows and the pending changes, and  
  exports mapMetaOf, thread · requires 0 · required by 1
- `idearium/repo/verify-lazy.js` (253 lines) — MCO2, verification tiers L6-L8. (nexus-repository-system-build-phasemap.spec, MCO2_verification_deepening)  
  exports scheduleLazyVerification, readLazyVerification, isTestPath, MODULE_ID, QUEUE_NAME, PROOF_QUEUE · requires 2 · required by 4
- `idearium/repo/watcher.js` (181 lines)  
  exports RepoWatcher · requires 4 · required by 0 · tested by `tests/modules/idearium-repo-watcher.test.mjs`
- `idearium/repo/work-surface.js` (134 lines) — what the agent changed, as files with their diffs, and the tools it has and used. §0.39.284 W3 · Map: docs/2026-09-30-idearium-coding-flow-phasemap.spec (W3_work_surface)  
  exports counts, runsOf, workSurface, toolsBrief · requires 0 · required by 1

#### `idearium/schemas/`

1 code · 10 other file(s).

- `idearium/schemas/index.js` (47 lines) — // idearium/schemas/index.js — idearium's own, fully sovereign schema registry. //  
  exports get, list, MODULE_ID, VERSION, SCHEMAS · requires 1 · required by 0
- other: `idearium/schemas/interaction-contract.json`, `idearium/schemas/schema.capability`, `idearium/schemas/schema.command`, `idearium/schemas/schema.component`, `idearium/schemas/schema.hook`, `idearium/schemas/schema.idea`, `idearium/schemas/schema.node`, `idearium/schemas/schema.phase_node`, `idearium/schemas/schema.system`, `idearium/schemas/schema.wire`

#### `idearium/spec/`

8 other file(s).

- other: `idearium/spec/idea-to-spec.spec`, `idearium/spec/idearium.node-taxonomy.md`, `idearium/spec/idearium.repo-graph.spec`, `idearium/spec/idearium.repo-roadmap.spec`, `idearium/spec/idearium.repo-snapshot.spec`, `idearium/spec/idearium.spec`, `idearium/spec/nexus-repository-system.spec`, `idearium/spec/void.spec`

#### `idearium/spec-engine/`

6 code · 1 other file(s).

- `idearium/spec-engine/chunk-dispatch.js` (355 lines)  
  exports dispatchChunkWithVerification, pollGuardianJob · requires 4 · required by 2
- `idearium/spec-engine/compiler-t0.js` (322 lines) — // idearium/spec-engine/compiler-t0.js — spec-compiler's T0: Structure Emission // UUID: nexus-idearium-compiler-t0-v1-0000-2026-0919-jamesbrooks-001  
  exports emitStructure, parseBuildOrder, placeholderFor · requires 1 · required by 0
- `idearium/spec-engine/guardian-extract.js` (89 lines) — chunk prose -> compiler-bridge input §THE GAP THIS CLOSES — compiler-bridge.js's sectionsToYAMLSpec() can only  
  exports extractModulesViaGuardian · requires 2 · required by 0
- `idearium/spec-engine/index.js` (2185 lines) — Spec Compiler Engine Phase: 40 — Component Descriptor + Spec Chunk System  
  exports SPEC_SECTIONS, CHUNK_STATES, createSpec, createFileTreeSpec, setWarpPrimitives, loadSpec +24 · requires 2 · required by 5 · tested by `idearium/test/e2e-pipeline.test.js`
- `idearium/spec-engine/templates.js` (323 lines)  
  exports TEMPLATES, listTemplates, getTemplate, readSeed, readCompartmentTemplate
- `idearium/spec-engine/warp-build-dispatch.js` (233 lines)  
  exports createWarpChunkDispatch · requires 5 · required by 0 · tested by `tests/modules/idearium-warp-cache.test.mjs`
- other: `idearium/spec-engine/blocks.yaml`

#### `idearium/spec-engine/manifest/`

8 code file(s).

- `idearium/spec-engine/manifest/cli.js` (16 lines) — // idearium/spec-engine/manifest/cli.js // UUID: nexus-idearium-manifest-cli-v1-0000-2026-0925-jamesbrooks-001  
  requires 1 · required by 0
- `idearium/spec-engine/manifest/commands.js` (55 lines) — // idearium/spec-engine/manifest/commands.js // UUID: nexus-idearium-manifest-commands-v1-0000-2026-0925-jamesbrooks-001  
  exports check, generateTo, context, dispatch · requires 1 · required by 1
- `idearium/spec-engine/manifest/file-list.js` (64 lines) — // idearium/spec-engine/manifest/file-list.js // UUID: nexus-idearium-manifest-file-list-v1-0000-2026-0925-jamesbrooks-001  
  exports fromCatalog, fromBuildOrderYaml, fromJson, fromSource · requires 1 · required by 1 · tested by `tests/modules/test-manifest-phase1.test.mjs`
- `idearium/spec-engine/manifest/graph.js` (69 lines) — order(nodes) — nodes: [{ id, depends: [id] }] (all ids resolved). Kahn's algorithm, ties sorted for a reproducible order.  
  exports order, cycles, resolve · requires 0 · required by 1
- `idearium/spec-engine/manifest/index.js` (19 lines) — // idearium/spec-engine/manifest/index.js // UUID: nexus-idearium-manifest-index-v1-0000-2026-0925-jamesbrooks-001  
  exports generate, chunkContext, wireCheck, fromSource · requires 3 · required by 2 · tested by `tests/modules/test-manifest-phase1.test.mjs`
- `idearium/spec-engine/manifest/parse-catalog.js` (72 lines) — // idearium/spec-engine/manifest/parse-catalog.js // UUID: nexus-idearium-manifest-parse-catalog-v1-0000-2026-0925-jamesbrooks-001  
  exports parseCatalog · requires 0 · required by 1 · tested by `tests/modules/test-manifest-phase1.test.mjs`
- `idearium/spec-engine/manifest/registry.js` (37 lines) — Component registry: id → where it lives and what it needs. Generated, never hand-edited.  
  exports buildManifest, buildRegistry, chunkContext · requires 0 · required by 1
- `idearium/spec-engine/manifest/wire-check.js` (70 lines) — // idearium/spec-engine/manifest/wire-check.js // UUID: nexus-idearium-manifest-wire-check-v1-0000-2026-0925-jamesbrooks-001  
  exports wireCheck · requires 1 · required by 1 · tested by `tests/modules/test-manifest-phase1.test.mjs`

#### `idearium/spec-engine/templates/`

16 other file(s).

- other: 16 files (.spec, .yaml, .md)

#### `idearium/spec-engine/templates/system/schemas/`

10 other file(s).

- other: `idearium/spec-engine/templates/system/schemas/schema.bundle`, `idearium/spec-engine/templates/system/schemas/schema.capability`, `idearium/spec-engine/templates/system/schemas/schema.command`, `idearium/spec-engine/templates/system/schemas/schema.component`, `idearium/spec-engine/templates/system/schemas/schema.event`, `idearium/spec-engine/templates/system/schemas/schema.handoff`, `idearium/spec-engine/templates/system/schemas/schema.hook`, `idearium/spec-engine/templates/system/schemas/schema.module`, `idearium/spec-engine/templates/system/schemas/schema.route`, `idearium/spec-engine/templates/system/schemas/schema.wire`

#### `idearium/test/`

7 test file(s).


#### `idearium/ui/`

9 other file(s).

- other: `idearium/ui/archive-import.html`, `idearium/ui/desktop.html`, `idearium/ui/index.html`, `idearium/ui/login.html`, `idearium/ui/settings.html`, `idearium/ui/spec-library.html`, `idearium/ui/ui-editor.html`, `idearium/ui/void.html`, `idearium/ui/workshop.html`

#### `idearium/ui/css/`

17 other file(s).

- other: 17 files (.css)

#### `idearium/ui/fonts/`

8 other file(s).

- other: `idearium/ui/fonts/LICENSE-bebas-neue.txt`, `idearium/ui/fonts/LICENSE-dm-mono.txt`, `idearium/ui/fonts/LICENSE-space-grotesk.txt`, `idearium/ui/fonts/bebas-neue-400.woff2`, `idearium/ui/fonts/dm-mono-400.woff2`, `idearium/ui/fonts/dm-mono-500.woff2`, `idearium/ui/fonts/space-grotesk-400.woff2`, `idearium/ui/fonts/space-grotesk-600.woff2`

#### `idearium/ui/js/`

39 code file(s).

- `idearium/ui/js/access-guard.js` (24 lines) — §0.58.0 IA3 (docs/2026-10-10-idearium-access-phasemap.spec). James: "app password style login in idearium from clearglass panel". When Idearium asks this page to sign in (a 401  
  requires 1 · required by 0
- `idearium/ui/js/agent-blocks.js` (101 lines) — // idearium/ui/js/agent-blocks.js — Settings → Agents → "what the agent is sent". 0.39.258. // James: "not to inject anything into it that i cant edit in the agent settings." Every block of the…  
  requires 0 · required by 1
- `idearium/ui/js/agent-options.js` (82 lines) — §0.48.0 OS8: every agent setting, in Settings → Agents. Map: docs/2026-10-07-idearium-one-surface-phasemap.spec (OS8_settings_agents_holds_every_agent_option)
- `idearium/ui/js/app.js` (6021 lines) — // ════════════════════════════════════════════════════ // STARFIELD CANVAS — twinkling stars (Van Gogh / synthwave reference, dialed  
  requires 5 · required by 7
- `idearium/ui/js/arch-canvas.js` (669 lines)
- `idearium/ui/js/code-dock.js` (384 lines) — // ════════════════════════════════════════════════════════════════════════════ // §THE DOCK — idearium/ui/js/code-dock.js (0.60.118 DK2)  
  requires 3 · required by 2
- `idearium/ui/js/code-surface.js` (522 lines) — // ════════════════════════════════════════════════════════════════════════════ // §CODE TAB — idearium/ui/js/code-surface.js (0.39.349 CT3)  
  requires 8 · required by 3
- `idearium/ui/js/code-tab-flight.js` (44 lines) — // idearium/ui/js/code-tab-flight.js — FR6 0.60.144: the Code tab's "flight" panel. Each agent run read whole. // Product: flight-recorder
- `idearium/ui/js/code-tab-panels.js` (338 lines) — // ════════════════════════════════════════════════════════════════════════════ // §CODE TAB, expanded — idearium/ui/js/code-tab-panels.js (0.60.82 CE6 · CE7 · CE9)  
  requires 6 · required by 2
- `idearium/ui/js/compartment.js` (435 lines) — // idearium/ui/js/compartment.js — the Compartment view + recursive tab tree // component_id: idearium.ui.compartment
- `idearium/ui/js/components-panel.js` (68 lines) — // idearium/ui/js/components-panel.js — 0.60.5. Bring in → DECOMPOSE INTO COMPONENTS. // James, 2026-10-13: "i want to be able to copy projects and decompose them into components for the component…
- `idearium/ui/js/debug-failures.js` (65 lines) — // idearium/ui/js/debug-failures.js — FMR3 0.60.146: the Debug tab's "failure modes" section. // James, 2026-10-17: "failure mode report thats also a macro to import into a cos test env. nexus…  
  requires 1 · required by 1
- `idearium/ui/js/desktop-setup.js` (185 lines) — // idearium/ui/js/desktop-setup.js — §0.39.340 DK2 (docs/2026-10-01-idearium-agent-ready-master-phasemap.spec) // James: "when clicking on setup desktop, i want to have a popup with the progress.…  
  requires 2 · required by 2
- `idearium/ui/js/file-manage.js` (322 lines) — // ════════════════════════════════════════════════════════════════════════════ // §FILES — idearium/ui/js/file-manage.js (0.39.280 BS8)  
  requires 2 · required by 2
- `idearium/ui/js/file-versions.js` (80 lines) — §0.39.285 (from the nexus-14 fork's 0.39.279 D0, docs/2026-10-01-work-visibility-job-reuse-phasemap.spec) — per-file version history (James: "per file versioning, add it to the manage button…
- `idearium/ui/js/living-spec.js` (237 lines) — // ════════════════════════════════════════════════════════════════════════════ // §LIVING SPEC — idearium/ui/js/living-spec.js (0.39.271 S2)  
  requires 1 · required by 0
- `idearium/ui/js/nexus-atlas.js` (265 lines) — // idearium/ui/js/nexus-atlas.js — the nexus repo's Home is the Nexus atlas. // comp_id: nexus.idearium.ui.nexus-atlas
- `idearium/ui/js/ollama-check.js` (70 lines) — // ════════════════════════════════════════════════════════════════════════════ // §OLLAMA CHECK — idearium/ui/js/ollama-check.js (0.39.350 CT4)  
  requires 1 · required by 1
- `idearium/ui/js/phase-graph-view.js` (40 lines) — // idearium/ui/js/phase-graph-view.js — DG2 0.60.147: a phase's dependency graph in the Phases tab's detail pane. // James, 2026-10-18: "each phase, has to have a dependany graph before executing."  
  requires 1 · required by 1
- `idearium/ui/js/phases.js` (647 lines) — // ════════════════════════════════════════════════════════════════════════════ // §PHASES — idearium/ui/js/phases.js (0.39.271 P4)  
  requires 4 · required by 0
- `idearium/ui/js/plan-panel.js` (645 lines) — // ════════════════════════════════════════════════════════════════════════════ // §PLAN — idearium/ui/js/plan-panel.js (0.39.280 BS11)  
  requires 3 · required by 3
- `idearium/ui/js/projects.js` (127 lines) — // idearium/ui/js/projects.js — COSA10 (0.60.74): every project of his on one screen, sorted by what moved last. // James, 2026-10-16: "i figure cos could be helpfui for managing my projects so im…  
  requires 2 · required by 0
- `idearium/ui/js/repo-card-time.js` (91 lines) — §SD1 0.56.0 (docs/2026-10-10-idearium-solid-phasemap.spec): a repo's versions and rewind on its own card in the Repos list.  
  requires 3 · required by 0
- `idearium/ui/js/repo-drawer-views.js` (88 lines) — §0.46.0: the Versions and Machine views (§0.47.0 OS2: inside the Plan panel's activity section; the Phases view was dropped — the plan's tasks are the phases).  
  requires 1 · required by 1
- `idearium/ui/js/repo-environment.js` (114 lines) — // ════════════════════════════════════════════════════════════════════════════ // §ENVIRONMENT — idearium/ui/js/repo-environment.js (0.39.280 BS10)  
  requires 2 · required by 1
- `idearium/ui/js/repo-notes.js` (112 lines) — // idearium/ui/js/repo-notes.js — 0.60.6. A repo's Notes tab: write it down before it is lost. // James, 2026-10-13: "this is what i mean by i need to be able to log these somewhere, its too much.…
- `idearium/ui/js/repo-releases.js` (107 lines) — // idearium/ui/js/repo-releases.js — 0.60.72 RN3. The Versionium tab's Releases: every release, what landed in it. // James, 2026-10-16: "tell me all the recent changes. i want a changelog for…  
  requires 1 · required by 0
- `idearium/ui/js/repo-settings.js` (158 lines) — // ════════════════════════════════════════════════════════════════════════════ // §REPO SETTINGS — idearium/ui/js/repo-settings.js (0.39.310 VP7)  
  requires 6 · required by 1
- `idearium/ui/js/repo-tasks.js` (390 lines) — §0.39.366: a repo's background tasks. James (with Claude Code's Background tasks panel): "the background tasks, i want that for each repo. any activity from  
  requires 0 · required by 4
- `idearium/ui/js/repo-versions.js` (163 lines) — // idearium/ui/js/repo-versions.js — 0.60.7. The Versionium tab's index: every version of a repo in one place. // James, 2026-10-13: "i want real versions with the versionium tab. like a full…
- `idearium/ui/js/template-picker.js` (142 lines) — // idearium/ui/js/template-picker.js — the workshop's new-spec picker (0.39.357 RS5) // Map: docs/2026-10-05-spec-workshop-rebuild-phasemap.spec (RS5_the_template_picker)  
  requires 1 · required by 1
- `idearium/ui/js/theme.js` (40 lines) — // ════════════════════════════════════════════════════════════════════════════ // §THEME — idearium/ui/js/theme.js (0.39.284 W5)
- `idearium/ui/js/ui-editor-doc.js` (81 lines) — // ════════════════════════════════════════════════════════════════════════════ // idearium/ui/js/ui-editor-doc.js — the UI editor's round trip: a page's file → the editor → the same file (UE1,…  
  requires 0 · required by 1
- `idearium/ui/js/ui-editor.js` (92 lines) — // ════════════════════════════════════════════════════════════════════════════ // idearium/ui/js/ui-editor.js — the UI editor page (UE1, 0.60.122). Map: docs/2026-10-10-design-surface-phasemap.spec  
  requires 1 · required by 1
- `idearium/ui/js/upload-intent.js` (109 lines) — // idearium/ui/js/upload-intent.js — UP4 0.60.173: the Code tab's "upload" panel. A zip with an intent, placed, answered by him. // Map: docs/2026-10-19-upload-intent-and-page-map-phasemap.spec…  
  requires 1 · required by 1
- `idearium/ui/js/void-sky.js` (30 lines) — the star field behind every page of the pipeline (0.39.297 SW2). Rebuilt from Nexus v0.54's void (read, not copied): cyan stars that breathe on a sine, drifting slowly upward,
- `idearium/ui/js/window-chrome.js` (54 lines) — // idearium/ui/js/window-chrome.js — §0.39.280. The title bar of idearium's pop-out windows (desktop.html, // settings.html), styled as a COS compartment: the window is frameless in Clear Glass…  
  requires 1 · required by 0
- `idearium/ui/js/work-surface.js` (222 lines) — // ════════════════════════════════════════════════════════════════════════════ // §WORK SURFACE — idearium/ui/js/work-surface.js (0.39.284 W3)  
  requires 0 · required by 4
- `idearium/ui/js/workshop.js` (689 lines)  
  requires 3 · required by 0

#### `idearium/ui/vendor/grapesjs/`

1 code · 3 other file(s).

- `idearium/ui/vendor/grapesjs/grapes.min.js` (3 lines) — ! grapesjs - 0.23.8  
  hears change:changesCount, change:componentHovered, change:condition, change:currentView +13
- other: `idearium/ui/vendor/grapesjs/LICENSE`, `idearium/ui/vendor/grapesjs/VERSION`, `idearium/ui/vendor/grapesjs/grapes.min.css`

<!-- generated:registry:end -->

---

## Copyright

Copyright © 2026 James Brooks (Erosmancer). Part of the rheon.world / NEXUS ecosystem.

## The build surface: plan, build, manage, environment (v0.39.280)

James: *"i want each spec to have the entire build split into phases, chunked, bottom up, and with the axioms … click on a spec in the spec tab and have it built. phases the same way. click a file in the files tab and have a button that says manage … the plan … showing progress, and expandable tasks, to show the event ledger and activity. maybe use the gates as progress"* and *"map first, everything still pending into phases, into nexus' phasemap, then begin bottom up, then one by one."* The map is `docs/2026-09-29-build-surface-phasemap.spec` (BS0–BS19); each phase names its proof.

**Build a spec** (Spec tab). The open spec has a build bar. With no phasemap yet, **▶ Build this spec** asks the repo's agent to split the whole build into phases, chunked and bottom-up by layer (foundation, library, api, cli, automation, ui), each carrying the axioms from `docs/AXIOMS-v3.1.md` that bind it, written next to the spec as a phasemap file (`idearium/repo/spec-plan.js`). The map is read by loom's own parser and refused when a phase depends on a higher layer, has no layer or names no proof. Then **▶ Build next** builds the first ready phase, and each phase row has its own ▶. Every build takes a Versionium snapshot first. The Phases tab has ▶ on every card too.

**The plan panel** (`idearium/ui/js/plan-panel.js`). A floating panel you can drag and resize: every step in build order, ✓ done, ◌ current, ○ next, with its gates as a progress bar (mapped, snapshot, sent, replied, landed, closed). Expanding a step shows its event ledger (each run's state, snapshot, agent, files and reply). Below it, plans and file jobs and the repo's activity. It is a projection of the phase runs (`idearium/repo/build-plan.js`) and updates live. The Home tab has a **Start building** card listing the specs with their progress.

**Files** (`idearium/ui/js/file-manage.js`). Each file shows its state against the repo's last version (`idearium/repo/file-state.js`): M modified, N new, D deleted, P a proposal waiting, S staged. A file that exists only as a proposal is listed greyed. **manage ▾** hands the open file, or the selected lines, to the repo's agent with one of ten actions (expand, iterate, refactor, rebuild, debug, test, document, optimize, review, explain), a note, and related code from the Code tab's search. The agent fetches the rest itself.

**Baseline deviation** (`idearium/repo/deviation.js`). How far the repo has moved from its baseline snapshot and since its last version, as two numbers, never one score. Recalculated on every repo snapshot and whenever a file write, delete, applied proposal or code-API write adds up to a major change (config repos.deviation_major_files, repos.deviation_major_fraction). Each record says why and when; the Spec tab shows the latest.

**Environment** (Settings tab, `idearium/ui/js/repo-environment.js`, `cos/testenv/environment.js`). A check: are the files downloaded (missing or different ones named), is the codebase configured (a Node project's dependencies checked on disk; others said as unknown here), does the VM image have what the codebase needs. The install and test plan derived from the repo's own manifests. Every environment option (runtimes, package sets, services, network, RAM, CPUs, disk, accelerator, variables, ports, test command and timeout, desktop), saved on the repo. **Set up environment** runs the VM setup with the extras this codebase needs. The settings console's repo view is embedded below.

**Routes** (`idearium/api/build-surface.js`): GET files/state; GET and POST deviation; GET and POST environment, POST environment/setup; GET and POST spec/plan, POST spec/build; GET plan; POST manage — each under /api/repos/:uuid/.

**Deleting a code repo** now tells its original: the document spec forgets it (the old one is listed in codeRetired), so Code builds a new one, the shared hat link goes, and a branch's worktree is removed while its git branch stays. **Who builds**: a code spec whose repo is missing builds as its original, and a chosen provider is the only one tried (`lib/seam/adapters/warp-cascade.js`). **Pop-outs**: the desktop viewer and settings console carry a compartment title bar (`idearium/ui/js/window-chrome.js`) and one dark theme; the Sync & CI tab uses the same dark controls as every other tab.

Tests: `tests/modules/test-build-surface.test.js`, `tests/modules/test-build-surface-2.test.js`, and the UI in a real page (`tests/probe/build-surface-ui-chromium.js`).

## Provider economy (v0.39.281)

James: *"economy tags for each provider. With staging branches … using the tokenizer and graphs to learn token constraints … Smart economy like dynamically evolving and learning routing."* The map is `docs/2026-09-29-provider-economy-phasemap.spec`.

**Settings → Provider economy** (`idearium/ui/settings.html`) has six cards:
- **Providers:** tier, on/off, every limit, quiet hours, and what happens at a limit, each with live usage beside it.
- **Job types:** which tiers each may use.
- **Staging:** which tiers' code is staged, not applied.
- **Learning router:** exploration, and how many records it needs before it orders builds.
- **Token limits:** a graph of input tokens by outcome per provider, with the learned safe limit marked.
- **Not included, on purpose.**

Changes queue until **Save**, which sends them as one POST. Guardian holds the policy; idearium proxies to it (GET and POST /api/economy; GET /api/economy/usage, /limits and /routing).

**Staging by economy.** When a repo applies agent code automatically, a reply from a provider in a stage tier (by default: local, i.e. ollama) is staged on the repo's staging branch (repo-&lt;uuid&gt;@staging) as a Versionium commit, caused by economy:&lt;tier&gt;:&lt;provider&gt;. It is not written into the repo. Promote it with the existing code/promote. If Versionium fails, nothing is written and the reason is said. Repos in review mode are unchanged.

**Who builds, when nobody chose.** Once the usage record holds enough build outcomes, a build with no chosen provider is ordered by what has worked. The seam record's routedBy field says so and names the scores. A chosen provider is still the only one tried.

Tests: `tests/modules/test-economy.test.js`, `tests/probe/economy-console-chromium.js`.

## The desktop login, and who answers by default (v0.39.282)

James: *"the desktop environment needs to either ask, or give me the login. or use a generic password listed in the atlas."*

**Desktop login: user nexus, password nexus.** This is the generic default for every repo desktop VM. Change it in Settings → Global → desktop.user and desktop.password. `cos/testenv/provision.js` run with the desktop option sets it with chpasswd and adds the account to sudo. It also works through the environment variables COS_DESKTOP_USER and COS_DESKTOP_PASSWORD, which is how idearium's "Set up the test VM" passes the settings. Every desktop boot applies the setting again through the guest agent (its guest-set-user-password command, `cos/compartment/guest-agent.js`), so an image made before 0.39.282 gets it too, even though its account had no password. The viewer (`idearium/ui/desktop.html`) shows the login; clicking it copies the password. It also says whether the setting took. An invalid login name is refused before it reaches any shell (`cos/workspace/index.js`).

**If nexus / nexus does not log in** (0.39.293). James: *"i mean that i cant login to my desktop envirement in idearium with the default credientials, not sure if its a upstream problem"*. It was not upstream. Idearium's "Set up the test VM" dropped the desktop option, so the image it built had no desktop and no desktop account. The repo desktop then booted to a text console where the login could not work.
- **Now:** the setup offers the desktop, ticked by default. Starting a desktop on an image without one is refused, with the fix: rebuild the VM with the desktop ticked, or run `cos/testenv/provision.js` with the desktop option.
- **After a rebuild:** each repo's desktop disk is tied to the image it was made over (a stamp file beside it). A disk made over the old image is renamed with "stale" and the time in its name and kept, never deleted, and a fresh one is made. A branch whose original's disk is stale starts from the image instead.

**Who answers a repo that chose no provider**: Settings → Global → repos.default_provider, which is ollama by default (`lib/repo-agent.js`). Clearing it restores the old fallback: guardian's first provider.

## Getting it to code a project: plan, phases, the work surface, one look (v0.39.284)

James, with screenshots of an empty Phases tab, three plan runs that "replied … no …-phasemap.spec came back", and a full start:all log: *"most important. get it coding the projects. this is hard to understand how to actually build the code base."* Map: `docs/2026-09-30-idearium-coding-flow-phasemap.spec`.

**How to build a repo now.**
1. Open it.
2. Choose **Build ▾ → Build this repo** on the main bar. You land on its Home tab ("Start building", one row per spec) with the Plan panel open.
3. **Plan** a spec, in any of these places:
   - **Spec tab:** "▶ Build this spec" asks the agent; "⚡ plan from the spec now" plans at once, without the agent.
   - **An empty Phases tab:** one row per spec.
   - **CLI:** idearium repo plan &lt;repo&gt; &lt;spec&gt; [--derive] (idearium/cli/index.js).
4. **Build** the next phase:
   - Spec tab: "▶ Build next".
   - Phases tab: ▶.
   - CLI: idearium repo build &lt;repo&gt; &lt;spec&gt;.
5. **Watch the work surface** under the plan: every file the agent wrote, as a diff.

**The plan always lands** (`idearium/repo/spec-plan.js`, `idearium/api/build-surface.js`).
- **The order it tries:** the agent's &lt;spec&gt;-phasemap.spec; else a map the agent wrote in its reply text; else a map **derived from the spec's own sections**.
  - A derived map has one phase per section, with small sections grouped.
  - Each phase's layer is read from the section's name and text, bottom-up, with dependencies chained.
  - Its meta says planned_by, reason and planned_at.
- **An invalid map the agent wrote** is kept as &lt;map&gt;.agent-draft.txt; it is never overwritten.
- **POST /api/repos/:uuid/spec/plan {derive:true}** plans at once. idearium repo plan --dry --file &lt;spec&gt; previews a spec file without writing.

**The work surface** (GET /api/repos/:uuid/worksurface, `idearium/repo/work-surface.js`, `idearium/ui/js/work-surface.js`). It is a projection over the .inject nodes (`lib/repo-inject.js`) and the run rows:
- **One card per file.** Each card shows the file's newest state, +added −removed, the diff in green and red, who wrote it, and the run that made it.
- **Actions per card:** **Apply** / **Reject** (proposed), **Revert** (applied), **Promote** (staged).
- **The tools strip:** the tool scope, the tools the agent is given, and every call it made, ✓ or ✗ with the error. Phase and plan runs now keep their tool calls.

**The Code tab's surface** (0.60.80 CE8, GET / PUT /api/repos/:uuid/surface, `idearium/lib/surface-state.cjs`). One per repo: the open file, the picked lines, the chunk, the filters, who set it (ui · cli · agent).
- **GET** adds the picked lines' text, the proposals waiting and the repo's latest run (`lib/run-state.js`).
- **PUT** emits idearium.surface.changed; the Code tab follows a change it did not make, and opens where the surface was left.
- **Commands:** idearium code surface <repo>, code open <repo> <path> [--lines a-b], code select <repo> <from> [to] | --chunk <id> | --clear (agents: nexus.command).

**The Code tab, Files merged in** (0.60.81–0.60.82, `idearium/ui/js/code-surface.js` + code-tab-panels.js). The Files button is gone; setRepoSubtab('files') and openApiRepoFile() open Code.
- **Tree:** filter, + file, × delete (to .trash/); file states and waiting diffs as before.
- **Open file:** edit by hand (save = POST …/file, a version), **manage · history** (one menu: the workbench plus the file's timeline of runs, labelled commits and versions; diff with now, restore).
- **Picked lines:** change · expand · refactor · fix · document · explain → POST …/code/assist; the reply replaces exactly those lines as a proposal. POST …/code/edit takes a checked edit set directly (code edit).
- **Bottom panel:** activity · runs (GET …/runs; rewind = POST …/runs/:id/rewind) · responses (GET …/agent/history) · tasks · log · control · versions · machine (the Plan panel's views, mounted here).
- **Versions:** an applied diff, a restore and a rewind each commit at once with labels (`lib/repo-versions.js` commitNow); GET …/history?tag=kind:edit filters by them.

**Routing & fallback** (0.39.286, `lib/pipeline-routing.js`). Every spec chunk is built along a route:
- **Order:** the chosen agent, then the block's own fallback list (in `idearium/spec-engine/blocks.yaml`), then the global chain.
- **Modes:** learned (the default since 0.39.287), fixed, chain, local-first, economy.
- **Learned:** each Ollama model listed in the config is its own candidate. Every hop is recorded per chunk type (a spec block, or a file extension). Once there is enough evidence, the route puts the provider or model that works for that kind of chunk first. Untried ones sit in the middle, and ones that keep failing (or truncating) sink. See it with the idearium CLI's routing learned command or the settings page.
- **Failures:** each failed hop is classed (empty, truncated, refused, timeout, provider-down, rate-limit, login, unknown) and moves on only if the fallback-on setting names its class. Login never moves on.
- **Breaker:** a provider failing several times in a row is skipped for a cooldown.
- **Record:** the hops are kept on the chunk.
- **Where to see and set it:** the routing API (show, plan per block, reset breakers), the idearium CLI's routing command, and Settings → **Routing & fallback**. Its config keys are listed in `idearium/lib/config-core.cjs`.

**Does it work: verify and prove** (0.39.291, `lib/build-verify.js`). Open the Plan panel's **does it work** section.
- **✓ verify** checks every file parses and every import resolves, then runs the project's own tests in an isolated COS branch.
  - **Verdicts:** failed · parses (not proven, and it says why) · proven.
  - **Failures:** each lands on one file with the exact error. A failing test is traced to the code it loads, with actual/expected and what the test asks.
- **▶ build & prove** builds every file one at a time, verifies, and sends each failing file back to its agent with the failure, for up to 3 rounds.
  - **During a repair,** reuse is skipped, and a failed version is never reused.
  - **Every round is recorded.**
- **The same from the CLI:** the idearium CLI's verify and prove commands.
- **Tests:** `tests/modules/test-build-verify.test.js` and `tests/modules/test-prove-loop.test.js` (the real server with a model that writes a bug and fixes it).

**The spec library** (0.39.290). This is the Welcome screen's **Import specs** (`idearium/ui/spec-library.html`), or the idearium CLI's spec-library import command.
- **What it does:** drop a zip of specs and each unique document becomes an idea, linked to a spec split by the document's own headings.
- **What it handles:** duplicates are folded, zips inside are opened, programs are refused, and a project folder stays one unit.
- **Groups:** nexus, product, personal or diagram, decided by each document's own name.
- **What's kept:** the zip and every original file. Importing again only adds what's new.
- **Code:** `lib/spec-library.js` (scanning and converting) and `idearium/lib/spec-library-import.js` (ideas, specs, the library index).
- **Test:** `tests/modules/test-spec-library.test.js`.

**A library spec into the pipeline** (0.39.292). James: "how can i import into the pipeline. the specs also need to convert into actual spec files."
- **Where:** each row of the spec library has **→ pipeline** (then **open repo**); the idearium CLI's spec-library to-repo command; the API route POST /api/spec-library/:key/to-repo (a sha, a sha prefix or a title).
- **What it does:** the document's spec becomes a repo through the same promotion every spec takes, and the document is written into it as a real .spec file (meta and every section, as YAML) under the repo's spec folder, with the original text beside it.
- **One idea:** the library's idea becomes the repo's idea. Asking again opens the same repo.
- **Code:** `idearium/lib/spec-library-import.js` (toPipeline, findRow, specFileText). The route hands in the promotion and the repo layer's file write.

**The Spatial Void** (0.39.295, `idearium/ui/void.html`, `idearium/lib/void.js`). James: "Just have the spacial void, with a slider … with those linked togethe" · "the ideas come from me though not agents".
- **Where:** Create → **The Void**, Welcome → **Enter the Void**, or the idearium CLI's void commands. It replaces Ideas and Brainstorm; every idea and every brainstorm spark is in it.
- **Speak your vision** (Ctrl+Enter): it becomes an idea, at the dials, a point of light in the field.
- **The dials:** creativity normal · creative · outside the box · novel · outlier; stability stable · shaky · risky · dangerous · unstable, from the other side. Linked, one carries the other. Unlink them (⌖) and each moves alone; the line joining them strains with the tension.
- **The void answers your idea; it never writes one.** ECHO answers at the dials: creativity sets how far it pushes, stability how hard it checks. D20 rolls a field and maps its mechanism; REVERSE walks your idea's furthest form back to now. The voices are the old Nexus engines: EROSMANCER, HOSTILE TRUTH, DELTA RISK, UNIFIED where the dials meet.
- **TAKE** a line: you say what you keep, in your words, and only that goes into your idea.
- **The field:** worked ideas glow brighter; untouched ones fade and drift outward. Wild ideas (born wild, held steady) are magenta; unsteady ones orange. Drag to place; drag one onto another to collide them.
- **→ SPEC** grounds the idea (stable, whatever the dials say), then opens the spec workshop.
- **Fonts:** Bebas Neue, DM Mono and Space Grotesk ship in idearium/ui/fonts (SIL Open Font License), so it works offline.
- **No lowercase** (0.39.296, James: "alright but no lowercase"): everything in the Void is shown in capitals, tooltips and the window title too. What you type is stored exactly as typed.
- **Limits and states** (0.39.296): an idea is at most 4000 characters, a kept part 1000, and going over is refused with the count. The field says when it is entering, empty, or unreachable (with TRY AGAIN). An agent answer shows a running timer.

**The spec workshop, its own page** (0.39.297). James: "all of it needs to be isolated, in its own pages" · "no lowercase". The workshop is the pipeline's second station, in the Void's look and in capitals: THE SPEC WORKSHOP, the stations IDEA → SPEC → ARCHITECT → BLUEPRINT → REPO → COS, your sections in cyan, the agent's proposals in magenta. Its dial is REACH, in your words: normal, creative, outside the box, novel, outlier. It asks the agent for three things only: a draft of the open section, open loops, and questions. The idea-generation feeds live in the Void. Both pages share one look: `idearium/ui/css/void-theme.css` and `idearium/ui/js/void-sky.js`.

**ARCHITECT** (0.39.298). James: "with architect for archiecture using the component registry, components store with dependancies". The pipeline's third station, its own page (archived under idearium/ui/_archive in 0.60.19: James, "can you delete this architecture afrom idearium?"; a repo's Architect tab stays), opened from the workshop's ARCHITECT station). It lays a spec out as components, each with a tier, a layer, a purpose, its dependencies and its seams, in levels from the bottom up. Each component is matched against loom's registry and the component store, searched as one index: green REUSE, cyan NEW. A dependency on nothing, a cycle, or a lower layer leaning on a higher one is a GAP, said in words. The agent only proposes components. The architecture is saved beside the spec as spec/<name>.architecture.yaml. Engine `idearium/lib/architect.js`, routes /api/architect/*, CLI idearium architect.

**One canvas for both Architects** (0.39.299). James: "look at architect in idearium. rebuild it, fully. enterprise grade, beautiful style and consistent, open ui." Idearium has two Architects, the pipeline's (Build › Architect) and each repo's (its Architect tab). Both now run on one canvas, `idearium/ui/js/arch-canvas.js` with `idearium/ui/css/arch-canvas.css`, stripped from the MASTERMIND canvas James supplied. It has zoom toward the cursor, drag to pan, glass cards, wires with travelling particles, a minimap, box select, a floating toolbar and slide-in drawers. Layer bands run bottom-up, and the layout cuts crossings. Selecting a component lights what it needs and what needs it. In the pipeline's Architect you drag a card's handle onto another to make a dependency, and a card you place keeps its place. The repo tab draws the registry, with the inspector, the lists and the blueprint in a drawer.

**One bar, full screen, the workshop as a work surface** (0.39.300). James: "make idearium full screen. its cluttered also" and "make this enterprise, remove the noise, this is for speccing". The top bar is gone: its logo, counters, settings and connection sit in the tab bar, with ⛶ (SHIFT+F) for full screen. The welcome has three actions — ENTER THE VOID, SPEC WORKSHOP, BRING IN ▾ (import, specs, git, compartments, quick project, log an idea) — and the three stations. `idearium/ui/workshop.html` is one bar (the six stations, save) over the work, with no sky. The canvas zooms by level: SYSTEMS, COMPONENTS, DETAIL.

**The spec workshop** (0.39.294, `idearium/ui/workshop.html`, `idearium/lib/workshop.js`). James: "need the spec workshop … the workshop and maybe it hooks into the spec field".
- **Where:** Welcome → **Spec workshop**; an idea's **✎ spec workshop**; a repo's Spec tab → **open in the spec workshop**; the spec library's **✎ workshop** on a row; the idearium CLI's workshop commands.
- **Start from:** an idea, a document in the spec library, a repo's spec file, or nothing.
- **Write it yourself, or ask the agent:** open loops, outside-the-box questions, what ifs, the d20 roll (one of twenty fields, and one of its mechanisms mapped onto the spec), a reverse causal chain (an invented end-state walked back to what exists), inspiration from your own library and repos, or a draft of the open section.
- **The ambition dial:** 1 grounded, 2 practical, 3 stretch, 4 bold, 5 outside the box. It changes what the agent is asked to reach for.
- **The agent only proposes.** Proposals sit apart from the spec; one goes in only when you accept it: into the open section, as a new section, or replacing a section's text (the old text is kept). A removed section is kept and can be restored.
- **Saving (Ctrl+S)** writes the spec into its repo's spec folder, where the Spec tab shows it. With no repo yet, it makes one: a library document's own repo, else a new repo for the idea.
- **The agent it asks:** your default provider, through copilot, the same way a repo's agent is asked.

**Cut replies are finished** (0.39.289, `lib/reply-continuation.js`). When a reply stops part-way, the agent is shown the end of what it wrote and continues from there, and the two parts are stitched together:
- **When it counts as cut:** Ollama stopped at its token limit, a code block was opened and never closed, or the reply ends mid-statement.
- **Where it runs:** in the Ollama bridge (`ollama/lib/ollama-client.js`), and in spec chunk dispatch before the detector judges the reply.
- **Ollama's limits:** generation is streamed. Its timeout counts silence, under a 10-minute cap on the whole generation. A thinking model that answers nothing is asked again with thinking off.
- Test: `tests/modules/test-reply-continuation.test.js`.

**The Nexus repo sync** (0.39.288, `idearium/repo/nexus-self.js`). It runs 20 s after boot, then every 10 minutes.
- **One changed file:** a nexus system whose file set did not change is updated in place. Only the chunks whose content moved are rewritten, in the same spec (the in-place update in `idearium/spec-engine/index.js`).
- **Files added or removed:** the system is re-ingested whole, yielding to the server every 50 files, and the old version is purged.
- **The log:** the sync log names the files whose content changed, and the time each step took.
- **Cold reads:** each spec keeps a manifest.meta.json beside its manifest (chunk content stripped, stamped with the manifest's size and time). The repo list reads it after a boot instead of the whole manifest; a stale stamp means a full read.
- Test: `tests/modules/test-nexus-self-incremental.test.js`.

**The registry block** (0.39.286). A new spec has 11 chunks; the 11th, **registry**, follows build_order and waits on it. In a repo, the Architect tab's **write the registry** writes the architecture doc and the registry as nodes in Guardian's layout:
- **What:** one node file per fact under the repo's nodes folder, in the envelope of `lib/node-export.js`.
- **Node types:** component, hook, wire, event, command (routes and CLI), contract (the doorway), system.
- **Rewrites:** an unchanged node is not rewritten; a node no longer produced moves to the archive folder.
- **Built by:** `idearium/repo/architecture.js`.
- **Default template:** genesis (`idearium/spec-engine/templates/genesis.spec`) is the default template of a system spec.

**The code build in the Plan** (0.39.285). A code spec builds one chunk per file. The Plan panel shows it: files done/total, each file's state and layer, the failure, and **build the rest / retry** (POST /api/spec-engine/specs/:uuid/build). Codegen opens the panel. In the Files tab, a file the build has not written says "not built yet — its chunk is &lt;state&gt;".
- **A FAILED chunk can be given to another agent** (the chunk's agent select): it returns to pending with attempts 0, the failure kept as priorFailure.
- **Version history per file** (GET /api/repos/:uuid/file/versions?path=, /file/version?path=&commitId=; `idearium/ui/js/file-versions.js`): the Manage menu and the open file's **history** button list each Versionium commit that wrote the file; **restore** writes it back through POST /api/repos/:uuid/file.

**Navigation.**
- **Create and Build are back on the main bar**, not the repo's tab row. With a repo open, they act on it.
- A sliding ink marks the active tab, dropdowns animate, and views fade in.

**Speed.** Making a code repo no longer freezes idearium. The branch of the original used to run git synchronously, which held a 91 MB repo's request for 3½ minutes and showed idearium OFFLINE. It now runs async (branchWorkspaceAsync in `cos/workspace/index.js`).

**One look** (`idearium/ui/css/nexus-theme.css`, `idearium/ui/js/theme.js`).
- **Palettes:**
  - **NEXUS** (the default) is the main UI's palette, token for token (`ui/themes/nexus-dark.css`).
  - **Midnight** is idearium's look before this release.
  - **Graphite** is neutral greys.
- **Accent:** cycling, as on the main UI, or cyan, violet, emerald or amber.
- **Motion:** full or reduced.
- **Where to set them:**
  - Settings console → **Appearance**, which applies at once in every idearium window.
  - Config ui.theme, ui.accent and ui.motion through POST /api/config (`idearium/lib/config-core.cjs`).

**Tests:** `tests/modules/test-plan-lands.test.js`, `tests/modules/test-work-surface.test.js`, `tests/modules/test-idearium-theme.test.js`, `tests/modules/test-cos-workspace.test.js` (WS-05/06); probe `tests/probe/idearium-coding-flow-chromium.js` (the real page on a real idearium).

**The Architect tab is the repo's component registry** (`idearium/repo/architecture.js`, 0.39.284). It is read from the repo's code index (`lib/code-intel/index.js`) and shaped like loom's registry: one component per file with loom's id rule, export/import hooks, and wires from dependency to consumer. It also lists consumers and requires, external packages, orphans, bottom-up breaches, data dirs and node types. "write ARCHITECTURE.json" saves it into the repo as the architecture doc. API: GET|POST /api/repos/:uuid/architecture. Test: `tests/modules/test-repo-architecture.test.js`.

**The delivery checker** (0.39.302). James: "Yes, then I can use idearium to build anything needed" · "what about shadow space reasoning for the debugging?" Before work goes to a client, Idearium checks that it does what was promised.
- **Each promise is a condition:** plain words plus a check (a file, a command, the tests, or a page of the app, which is started and then stopped).
- **The shadow:** the whole end state is declared before anything runs, so anything missing afterwards is the bug, with its cause.
- **The report:** a proof report in plain words (READY or NOT READY, what's missing and why, the evidence) is written into the repo as proof/PROOF-REPORT.md (in the client's repo, not this one).
- **The agent only proposes:** it can suggest conditions from a brief; nothing runs until you send them.

The code is `idearium/repo/proof-run.js`. The API is /api/repos/:uuid/deliver/check and /api/repos/:uuid/deliver/conditions in `idearium/api/index.js`. The CLI is idearium deliver … in `idearium/cli/index.js`. The event is declared in `idearium/event-taxonomy.cjs`, and the test is `tests/modules/test-proof-run.test.js`.

**Phase runs end in proof** (0.39.303). James: "It can build it. Piece by piece look at idearium." When a phase is built (drafted, then reviewed), Idearium now runs the phase's own conditions (from its map) , using the delivery checker.
- **All met:** the run reads proven.
- **Any unmet:** the unmet promises, what happened and why go back to the same agent as its next attempt, up to two attempts by default. Then the run reads unproven, naming what's still missing.
- **No conditions:** the run reads no-proof, and says so.

The code is the proof step in `idearium/api/index.js`, using `idearium/repo/proof-run.js`. The test is `tests/modules/test-phase-proof.test.js`.

## Building with all the context, under the axioms (v0.39.328–310)

James: "They need context. All of it. From the hat/repo" · "Parse rhe axioms in the docs folder. Do not deviate They are law"

**What a build agent is sent** (0.39.329). The agent that builds a file wears the repo's hat: the persona prompt block as edited, filled with the hat's generated persona. It also gets four **build blocks** (`lib/repo-prompt-blocks.js`, scoped to file builds), on by default and editable in Settings → Prompt:
- **build-memory:** its own past work, and the files beside it.
- **build-context:** the file's relations (`lib/build-context.js`): its registry card, who will use it, proven primitives from other projects (interface only), and the spec's invariants.
- **build-atlas:** everything else NEXUS remembers that matches the file.
- **build-code:** this repo's own matching code.

The file prompt sends the three lower files the new file is most about in full, and every other one by interface (`idearium/spec-engine/index.js`). The spec is `docs/build-context.spec`; the benchmark is `scripts/bench-file-prompt.js`.

**The Settings tab, in categories** (0.39.330). Categories on the left, one pane at a time (`idearium/ui/js/repo-settings.js`):
- **Repository:** General, Files & danger zone.
- **Agent:** Agent, Prompt, Hat & tools.
- **Environment:** Environment, Desktop.

The environment's option list and the desktop's VM settings stay hidden until a button is clicked. A view that lives in the settings console opens alone (`idearium/ui/settings.html`, one view, no tab strip), and only when asked. The test is `tests/modules/test-repo-settings-ui.test.js`, driven by Clear Glass (`clear-glass/src/driver/glass.js`) — no Playwright.

**Verified primitives — mapped, not built** (`docs/2026-10-05-verified-primitives-phasemap.spec`). James: "each passing test, verified component, gets fed into the primitive field … Like I want provinance." The loop, bottom-up, each step on what already exists:
- **Confidence from evidence (VP1):** the build verdict (`lib/build-verify.js`), the proof conditions (`idearium/repo/proof-run.js`), Clear Glass on the page, adversarial findings that reproduced, and the agent's record (`lib/agent-build-learning.js`). It never uses how a reply is worded.
- **Adversarial review (VP2):** other agents through `copilot/lifeline.js`, each independent as in `lib/agent-council.js`. A finding counts only when it reproduces as a check.
- **The repo's model of the user (VP3):** one model of James (`copilot/lib/person-model/index.js`, `copilot/lib/user-model.js`) seen through a repo lens. Communication gaps come from `intelligence/gap/hunter.js`, past context from the person model's session ledger, and corrections from `lib/repo-hat-memory.js`.
- **The primitive field (VP4):** `lib/component-store.js` tiered draft → proven → crystal. This is the entry gate of the emerge map's CX0, CL1 and MR8 (`docs/2026-10-02-emerge-field-memory-build-phasemap.spec`), not a second store. Any component in loom is offered by its card; one is copied into a repo only from the store, with its pinned closure.
- **Provenance (VP5):** every primitive answers who built it, from what, when, against which spec and version, what proved it, and every reuse since.
- **Debug and intelligence in the desktop (VP6):** the Debian VM for every test environment it can run (`cos/testenv/provision.js`). Failures go to the debug report (`lib/cos-debug-report.js`) and the gap field (`lib/gap-field.js`), and show beside the desktop (`idearium/ui/desktop.html`).

**Where provenance lives today:**
- **A built file:** its chunk in the spec manifest (agent, route, attempts), its stored component's manifest (component.json in the component store, `lib/component-store.js`: builtBy, contracts, prompts, dependencies), and the build response's record of what it was sent (chars, blocks used, sections).
- **A decision:** the phasemap that mapped it, the version line (`lib/version.js`) and the CHANGELOG that shipped it (each opening with James's words), and the spec registry (`docs/SPEC-REGISTRY.spec`).
- **A connection:** loom's registry (`loom/bootstrap.js` writes it), regenerated from the code, with the hand maps for the edges a scanner cannot see (`loom/maps/build-context-map.js`, `loom/maps/verified-primitives-map.js`).

**Mapped next** (`docs/2026-10-05-cli-data-code-phasemap.spec`). James: "I want the agent cli tab to be the end point for all cli commands" · "Each system needs to be in charge of its own data" · "the code tab in idearium should probably be for new code in the repo".
- **The Agent tab as every system's CLI:** verbs each system declares, sent to that system's route through RAID, never a shell.
- **Each system owns its data:** cortex becomes the catalog and the associative lattice, not the store.
- **The Code tab as the one review surface for new code:** one path, proposed → staged → applied → committed.

UI checks run in Clear Glass (`clear-glass/src/driver/glass.js`), never Playwright.

**Everything asked on 2026-10-05, and where it is mapped:** the session inventory in `docs/2026-10-05-cli-data-code-phasemap.spec` lists each request, quoted, beside the phase that holds it. The defects found along the way are mapped there too, as HG1–HG7.
## Building from the spec (v0.39.305–0.39.309)
James: *"like it needs to use the templates as default."* · *"the agents hat should be created with the repo."* · *"Using the register as a dependancy and file check list."* Map: `docs/2026-10-05-build-from-the-spec-phasemap.spec`.

- **Templates frame every spec.** Every new spec is framed by the standing templates: axioms, architecture, schemas and checklists, set in Settings as specs.default_templates. Each section's agent is given its template as the shape to fill for that one project; the text is not copied in (`idearium/spec-engine/index.js`).
- **His words are the spec's.** The workshop's sections become the spec's on every save: the purpose comes from his idea and purpose. Every section's agent sees them, and they're never reused for another spec.
- **A neutral section prompt.** It gives his words, the frame and short excerpts of what's already written. It contains no internal IDs and never pastes earlier sections in full.
- **Sections judged as sections.** A spec section is judged on its own length, not against its prompt's (`lib/seam/detector.js`).
- **The hat comes with the repo.** A repo made with a compartment gets its agent's hat when it's created (`lib/repo-hat.js`, called from `idearium/repo/index.js`).
- **The registry drives the build.** The registry section ends in a YAML components list. "Generate code" plans one file per component from it, each waiting only on the files it depends on. Verify checks the built repo against it: a promised file that's missing, empty or doesn't parse fails and goes back to be built (`lib/registry-plan.js`). With no usable registry, the agent plans the files and the reason is given.

Tests: `tests/modules/test-build-from-the-spec.test.js`, `tests/modules/test-registry-drives-build.test.js`.
