spec:
  meta:
    name:     registry-harness-and-stability
    version:  1.0.0
    date:     2026-09-27
    release:  0.39.266
    owner:    idearium.repo.nexus-self · idearium.spec-engine · guardian.jaa-store · lib.repo-agent · lib.repo-prompt-blocks · loom.scanners.source-map · ollama-bridge
    status:   built (0.39.266) — S1–S4, H1–H5; open items below
    origin: >
      James (2026-09-27): "idearium is laggy as hell. is it the sse? or the orchastrator?"
      · "don't even know what ollama is doing?" · "the chunks aren't meant to be as small as possible.
      use the component registry as the wiring harness like loom does for nexus, that way it makes the
      registry a map and event bus, so chunks can have minial context. right now its not coding at all."
      · "it's meant to make small llms capable of building entire codebases regardless of the size. …
      look at all the injections, thats way too much to inject when we have tools they can use to get
      context" · "those tools are for using clearglass and automating. basically giving the agents a
      browser to use" · "Is one component = one file, read in line ranges, OK? yes delete old specs,
      idearium is supposed to do that when removing them from the list, the specs aren't supposed to
      stay ideas. right now there is 15 and 15 but supposed to only be nexus and the nested repos.
      loom should have this mapped already … look for the architecture spec or the system template."

  # ── Measured, not recalled (§8.6) — each line has a reproduction in the session ─────────────────
  exists:
    - loom/data/registry.json — 2,275 components · 1,840 hooks · 8,751 wires. component id derives from
      path (loom/scanners/source-map.js idFor: lib/repo-inject.js → nexus.lib.repo-inject). wires are
      static require/import edges. hook types present: direct 1,523 · api 315 · callto 2. NO event hooks.
    - loom HTTP surface: /api/registry/:kind/:id · /api/graph · /api/context-graph · /api/impact/:id.
    - architecture-spec/registry/* — the loom pattern generalised for ANY project: component/hook/wire/
      config/bundle/phase nodes, lattice compiler, watcher + ledger, query api, decompose. Unused by idearium
      except nexus-atlas-aggregate.
    - idearium/spec-engine/templates/architecture-spec.template.yaml — the system template.
    - idearium import pipeline writes per repo: graph.json (require edges, symbols), atlas.json, chunks/.
    - event taxonomies: cortex/core/raid, guardian, orchestrator, clear-glass, versionium only.
  measured:
    - M1 first agent message for a 60-char question: 22,269 chars (~5.5k tokens). tool-guide 14,589 ·
      retrieved code 4,957 · tool syntax 2,066 · protocols ~950 · the question 65.
    - M2 the 4 retrieved chunks for "guardian/jaa-store.js" were docs/specs/GUARDIAN-COMPLETE.md,
      docs/jaa-store.spec, 4 lines of lib/repo-prompt-blocks.js, 1 line of a test — the file named lives in
      the guardian repo; keyword retrieval cannot cross repos.
    - M3 num_ctx is set nowhere; a 5k-token prompt exceeds Ollama's default window and is cut from the front.
    - M4 every repo ingest mints a "Repo: <name>" idea — the nexus sync alone makes 15 ideas + 15 specs;
      each core change adds a ~55 MB spec version kept forever (5 versions = 309 MB after 5 syncs).
    - M5 deleteSpec only flags deleted:true (§7.4); the spec stays on disk and in memory scans.
    - M6 table compaction never sticks: two JaaStore instances on one dir — B deletes 1,000 expired rows
      (disk 0), A inserts one event and flushes → disk 1,001. event_log grew 7,176 → 19,788 in an hour.
    - M7 the Idearium page falls back to :9000/api/idearium; /health passes there, every /api/* is 404.
    - M8 Idearium OFFLINE ~30 s every 10 min on James's machine; an unchanged sync here is 236 ms — cause
      on his machine not yet located.
    - M9 Copilot then Idearium exited 0xC0000409 (5× in a row) at 14:10 under 18–19% free memory.
    - M10 the ollama bridge logs no jobs; ~8 modules call :11434 directly; nothing reads the nexus-live
      channel, which grows every 5 s and is never swept.
    - M11 every repo agent dispatches into the same ChatGPT conversation.

  decisions:
    D1 (James): one component = one file; large files are read in line ranges through a tool.
    D2 (James): delete old spec versions; removing a spec from the list deletes it; a spec is not an idea.
        This SUPERSEDES §7.4 "archived, not deleted" for specs. Nexus spec history is not lost: every
        version lives in the nexus-self immutable store and in versionium.
    D3 (James): reuse loom's registry and architecture-spec/registry — do not build a second harness.
    D4 (James): the Clear Glass / browser tools stay; they stop being injected and become discoverable.
    D5 (default, not confirmed): the registry RECORDS event wires (emit → listen); routing events through it
        at runtime is a later phase if James wants it.
    D6 (default, not confirmed): compaction sticks via tombstones — a delete writes <table>.tombstones.json;
        every process drops tombstoned ids before its read-merge-write.

  invariants:
    I1: the first message to an agent carries no pre-fetched code and no tool catalogue; ≤ 2,000 chars
        plus the question. Everything else is one tool call away.
    I2: every tool, component and event is found the same way — the registry.
    I3: a Nexus repo is never an idea; only the nexus repo and its nested system repos are listed.
    I4: a spec removed from the list is gone from disk; only the current spec per nexus repo exists.
    I5: a row deleted by any process stays deleted.
    I6: nothing that looks like Idearium is accepted as Idearium unless it answers Idearium's API.

  phases:
    - id: S1
      status: built
      name: compaction sticks — tombstones in JaaStore
      closes: [M6]
      files: [guardian/jaa-store.js]
    - id: S2
      status: built
      name: the page never falls into the orchestrator proxy
      closes: [M7]
      files: [idearium/ui/js/app.js]
    - id: S3
      status: built
      name: nexus repos are not ideas; one spec per nexus repo; deleted specs are removed from disk
      closes: [M4, M5]
      files: [idearium/repo/index.js, idearium/repo/nexus-self.js, idearium/spec-engine/index.js]
    - id: S4
      status: built
      name: sync phase timing — the 10-minute outage names its own slow step
      closes: [M8 (locates)]
      files: [idearium/repo/nexus-self.js]
    - id: H1
      status: built
      name: registry records events — emit/listen hooks and emit→listen wires
      files: [loom/scanners/source-map.js]
    - id: H2
      status: built
      name: registry tools — find · card · read (line ranges) · write (inject → approval → gate) · test
      backing: nexus repos → loom registry; any other repo → its graph.json in the same shape
      depends_on: [H1]
    - id: H3
      status: built
      name: minimal first message — task + target card + 5 tools + one line per tool group;
            tool groups (incl. Clear Glass) discoverable through registry.find
      closes: [M1, M2]
      depends_on: [H2]
    - id: H4
      status: built
      name: Ollama — num_ctx on every call; one activity log for bridge + direct callers; nexus-live capped
      closes: [M3, M10]
    - id: H5
      status: built
      name: one chat per repo agent
      closes: [M11]

  results:
    - S1 two stores on one dir: compacted rows no longer come back (DS-001..005); the old code also overwrote
      another process's UPDATES with its stale copy (DS-004) — fixed by the same rule.
    - S2 page served from :9000/ui/idearium/ → API_BASE http://127.0.0.1:4800, every idearium call direct.
    - S3 live, on the data the earlier runs left: 15 auto-made ideas removed, 20 old spec versions purged;
      15 specs on disk (one per nexus repo), 0 ideas. Caught live, not by tests: purgeSpec was missing from
      spec-engine's DEFAULT export (the surface idearium/api calls) — every purge was silently skipped (SC-008).
    - S4 a slow sync logs its steps, e.g. "sync took 7791ms — systems 4524ms · cleanup 1754ms · understanding 792ms".
    - H1 registry refresh: 709 events named, 379 event hooks, 459 emit→listen wires, 0 dangling; failure counts
      identical to the original bootstrap (2,557 pre-existing re-declare rejects).
    - H2 live on nexus/core: card 7 ms / 660 chars; find 271 ms; read by line range; write → approval prompt →
      approve → file in the live tree; test → covering tests run in COS (~2 s).
    - H3 first message for "add a retry limit to the flush lock in guardian/jaa-store.js": 22,269 → 2,701 chars
      (guardian) / 2,092 (ollama); it now carries the card of the right file instead of 4 wrong chunks.
    - H4 num_ctx on every Ollama call path (bridge generate/chat/stream, cli-reasoning, ollama_generate tool,
      context-builder, idearium + loom agent-suites, ollama-runtime); bridge GET /api/activity; nexus-live capped.
    - H5 an agent with no chat of its own opens a new one; a chat another agent holds is never reused.

  open_items:
    - M9 (0xC0000409 under memory pressure) is expected to ease with S1 (tables stop growing in every
      process) — re-measure after S1 on James's machine before treating it as its own bug.
    - M8's cause on James's machine is not located yet; S4's timing line will name it on the next run.
    - D5 routing events THROUGH the registry at runtime is not built (recording only).
    - Events are read statically: a name built at runtime, or heard over SSE/HTTP, is not a wire.
    - tests/modules/test-tool-guide.js T-001 and the two nerve tests fail before and after this release
      (56 older tools lack a guide note; hard-coded paths) — not touched here.

  # ── ADDENDUM 2026-09-27 (0.39.273) — docs/2026-09-27-idearium-codebase-toolkit-phasemap.spec ──────────────
  # The harness scope's first message now LISTS idearium.code_map / code_search / code_chunk / code_read / code_edit /
  # code_write / code_check + loom.find.tool (lib/repo-agent.js listedTools()), with one line naming code_grep /
  # code_refs / code_batch / code_changes / loom.card / loom.test. loom.read.tool and loom.write.tool are still
  # registered and allowed; they are no longer listed because code_chunk/code_read read by meaning and code_edit changes
  # part of a file where loom.write needed the whole file reproduced. The first message stays < 3,000 chars (RH-006).
  # loom.write.tool now proposes against a file's REAL bytes (lib/repo-inject.js _current → RepoLayer.readTextFile).
