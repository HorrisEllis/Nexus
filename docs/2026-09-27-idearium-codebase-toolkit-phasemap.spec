spec:
  meta:
    name:     idearium-codebase-toolkit
    version:  1.0.0
    date:     2026-09-27
    release:  0.39.273
    uuid:     nexus-idearium-codebase-toolkit-phasemap-v1-0000-2026-0927-jamesbrooks-001
    owner:    idearium (repo/import-pipeline, api) · lib.code-intel · lib.code-edit · lib.repo-inject ·
              lib.agent-tools (idearium/code) · lib.repo-context · lib.repo-agent · loom.maps.idearium-codebase
    status:   built (0.39.273) — every gate below has its proof
    origin: >
      James, 2026-09-27 (on 0.39.272): "I want idearium solid for building codebases. Fully built, enterprise grade.
      Agent tools completely solid, all context is easy to search and understand for each chunk."

  # ── Drift, stated (§12.5, §0.0) ───────────────────────────────────────────
  drift: >
    HANDOFF-0.39.272 lists six remaining items for the Clear Glass/copilot learning work (loom map, spec addenda, tests,
    pane learning, regression, live checks). None of them is idearium's chunk/tool layer and none is touched here; they
    stay open in that handoff, unchanged. This map is a separate thread on the same base.

  # ── What exists (read on 0.39.272, measured — §8.6, §0.1) ────────────────
  exists:
    - idearium/repo/import-pipeline.js — PARSE→ATLAS→CHUNK→VERIFY→INDEX→GRAPH, incremental by content hash, writes
      chunks/*.json, indexes/{files,symbols,chunks,glyphs}.json, graph.json. Re-run on every RepoLayer write.
    - idearium/repo/graph.js — file-level imports/depends_on with honest resolution; `calls` declared unsupported.
    - lib/chunk-glyph.js — one compressed line per chunk, cached by hash.
    - lib/registry-harness.js + loom.{find,card,read,write,test}.tool — file-level card/read/whole-file write.
    - lib/agent-tools/tools/idearium/repo-chunks.js — read-only search/list/get/proof over chunks.
    - lib/repo-inject.js — every agent write is an .inject (proposed→applied→reverted), review|auto mode, nexus gate.
    - lib/repo-context.js — dispatch-time keyword retrieval into the first prompt.
    - idearium/api — /api/repos/:uuid/{search,chunks,chunks/:id,symbols,file,graph/*,harness/*,run,injects/*}.
  measured:  # tools/measure on idearium/{repo,api,spec-engine} + lib/ (376 files, 3584 chunks) with the 0.39.272 chunker
    - 1054 of 3584 chunks begin at a NESTED symbol (the symbol regexes are `^\s*…`), i.e. cut the enclosing function
      mid-body — the "never cuts mid-body" claim in import-pipeline's header does not hold.
    - >-
        984 chunks END in a comment line: the doc comment of the next symbol is cut away from it and glued to the
        previous chunk, so a chunk's own purpose is in the wrong chunk.
    - chunk size: median 12 lines, p90 48, max 1253; 13 chunks >200 lines, 2 >500 (a switch-handler file is one chunk).
    - .jsx/.tsx are detected as their own languages but have no symbol patterns and no brace check; Go, Rust, Java,
      C#, Kotlin, Swift, PHP, Ruby, C/C++ chunk as one whole file with no symbols; markdown is one chunk per file.
    - chunk ids are sha(repo:file:INDEX): adding one function renumbers every later chunk id in the file.
  missing:
    - M1 chunk boundaries are not structural (nested cuts, orphaned docs, unbounded size, few languages, unstable ids).
    - >-
        M2 a chunk carries no understanding of itself: no kind, qualified name, signature, doc, summary, parent,
        neighbours, what it uses, what uses it, whether it is exported, which tests touch it.
    - M3 search is token overlap on symbol names and paths only — the body of the code is not searchable; no ranking,
      no snippet, no exact/regex grep over the repo.
    - M4 agents can only write WHOLE files (loom.write / repo file POST). No exact-replace edit, no line-range or
      chunk replace, no optimistic hash guard, no multi-file atomic batch, no delete/move through the inject trail,
      no syntax diagnostics returned with the write. In review mode a second edit to the same file silently drops the
      first (each proposal is computed from the committed file).
    - M5 the tool surface a repo agent is shown has no search-by-meaning, no chunk card, no edit.
    - M6 dispatch-time retrieval (repo-context) scores by substring counts, not by the index.

  invariants:
    I1: one write path — every agent write is an .inject through lib/repo-inject.js and RepoLayer (history + revert;
        review mode respected; the Nexus gate still needs James's approval). No second store.
    I2: derived, never a second truth — cards and the search index are projections of chunks + files on disk, rebuilt
        by the same pipeline run, cached by content hash, and they state their basis (a reference found by NAME is
        labelled basis:'name', never presented as a resolved call graph; graph.js's `calls` stays unsupported).
    I3: bounded output — every read/search/grep response is capped and says what it left out and how to get it.
    I4: refusals explain — an edit that does not match, matches twice, or hits a changed file says exactly why and
        what to do (line numbers of the nearest match, the current hash).
    I5: nothing silently fails (§1.2) — a card/search pass failure never FAULTs an import; it is recorded on the result.
    I6: small-model first — few tools, each with one job, ids that survive edits, cards that fit in a line or two.

  phases:
    CB1: {title: structural chunker v2, closes: [M1], files: [lib/code-intel.js, idearium/repo/import-pipeline.js],
          gate: "measure again — 0 nested-symbol chunk starts, 0 doc comments split from their symbol, no chunk over
                 the cap unless it is one indivisible statement; stable ids across an insert above; L0-L5 still pass"}
    CB2: {title: chunk cards, closes: [M2], files: [lib/code-intel.js, idearium/repo/import-pipeline.js],
          gate: "every chunk has a card with kind/name/signature/summary/prev/next; refs/refBy by name with basis"}
    CB3: {title: search index + grep, closes: [M3], files: [lib/code-intel.js],
          gate: "BM25 over body+symbols+doc+path; a concept query finds the right chunk; grep regex with context"}
    CB4: {title: codebase API + edit engine, closes: [M4], files: [lib/code-edit.js, lib/repo-inject.js, idearium/api/index.js],
          gate: "replace/range/chunk/batch/delete/move through injects; pending proposals stack; diagnostics returned;
                 conflicts refused with hashes"}
    CB5: {title: agent tools + scope + retrieval, closes: [M5, M6],
          files: [lib/agent-tools/tools/idearium/code.js, lib/agent-tools/index.js, lib/agent-tools/tool-catalog.js,
                  lib/agent-tools/tool-guide.js, lib/agent-tools/tools/loom/harness.js, lib/repo-hat.js, lib/repo-context.js],
          gate: "tools registered, in the repo hat scope, listed in the harness scope, guide coverage test green"}
    CB6: {title: registry, specs, tests, version, files: [loom/maps/idearium-codebase-map.js, loom/bootstrap.js,
          idearium/spec/idearium.spec, idearium/spec/nexus-repository-system.spec, docs/SPEC-REGISTRY.*,
          tests/modules/test-code-intel.test.js, tests/modules/test-code-edit.test.js, tests/modules/test-code-tools.test.js,
          tests/modules/run-all.js, lib/version.js]}

  gate_proof:
    CB1: >-
      measured on the whole tree after the change (2,621 files, 24,204 chunks): 0 unforced cuts mid-statement (35 forced,
      all inside giant template strings, each marked), 0 doc comments split from their declaration (10 file headers kept
      as preamble, 3 trailing comments kept with the code above them), 0 unforced chunks over 150 lines. Held on
      idearium's own source by tests/modules/test-code-intel.test.js CI-601; boundary rules CI-101..CI-114, languages
      CI-201..CI-206, stable ids CI-112 / CI-502, version re-chunk CI-503.
    CB2: "CI-301..CI-305 (cards, basis, tests, neighbours, parent); the pipeline writes cards.json (CI-501)"
    CB3: "CI-401..CI-408 (BM25, name bonus, tests ranking, filters, prefix, grep, refs, overview/outline)"
    CB4: >-
      CE-101..CE-304 (planEdits, diff, diagnose, inject delete/defer, real bytes of an imported file) and CT-101..CT-308
      (review stacking, syntax guard, expectHash, auto atomic batch with rollback, move, chunk edit refused when stale,
      delete + revert, check).
    CB5: >-
      CT-401..CT-409 (registered, grouped, guided, scoped, listed; every tool over real HTTP with repoUuid from context; an older hat gains the tools on persona refresh);
      test-registry-harness RH-006 (first message < 3,000 chars); test-repo-context 16/16 (was 12/16 on 0.39.272 — its
      dispatch tests predated the 0.39.266 scope default and now set it).
    CB6: >-
      loom/maps/idearium-codebase-map.js: 10 components, 17 hooks, 23 wires; a fresh bootstrap's STILL UNRESOLVED stays
      112 (same as 0.39.272); the one undeclared consumer edge (lib/agent-tools/index.js) is stated in the map. Specs:
      docs/code-intel.spec + this map registered; addenda in idearium.spec, nexus-repository-system.spec,
      idearium.repo-graph.spec, the registry-harness phasemap; the Idearium atlas updated (0 dead references).
