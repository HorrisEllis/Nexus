spec:
  meta:
    name:     nex-node-store
    version:  0.1.0
    date:     2026-09-29
    release:  "0.39.281 (base) → from 0.39.282, one phase at a time"
    uuid:     nexus-nex-node-store-phasemap-v1-0000-2026-0929-jamesbrooks-001
    owner:    "lib.nexstore (new) · lib.node-export · lib.node-schemas · versionium · loom.schema.registry · intelligence.lattice · intelligence.rfr2.kernel · intelligence.cfr · cortex.core.raid"
    status:   "mapped, not built — every phase open (extended 2026-09-29 with N14–N20: failure-mode field, contract history, settings without iframes, data migration, hardcode census, suite triage, desktop login; and N21–N29: event-gated steps, shadow/negative-space reasoning, ollama-first build + agent review, YAML node types only, the Manage surface, contract-built work surface/TV UI, 700-zip history import, live-run findings, full-run-only failures). Working name 'nexstore' (James to name it; a rename is one find-and-replace before N1)"
    axioms:   "docs/AXIOMS-v3.1.md — §0.3 (nothing lost), §3.1, §3.3, §3.4, §8.6 (reuse), §10.1 (one write authority), §10.2 (projections derived), §10.3 (one source of truth per system), §17.5 (provenance)"
    relates:  "Generalises docs/2026-09-11-sovereign-node-architecture-phasemap.spec (draft: each system's own node schemas, sovereign) — that map says WHAT each system's nodes are; this one is WHERE and HOW they are stored. Both stay; neither replaces the other (§12.5: two contracts, surfaced)."
    origin: >
      James, 2026-09-29, after the storage review (loom's one 6.4 MB registry.json rewritten per declaration, JaaStore's
      whole-table flushes and full scans, RAID's in-memory weights): "can we invent our own? specifically made for the
      nex, yaml files, all the node node types? any data that needs tables" · "doesn't need to be jaa. also associative
      lattice, graphs, ring buffers. its all meant to be node types"

  # ── The idea, in one paragraph ─────────────────────────────────────────────────
  idea: >
    Everything NEXUS keeps is a node: one envelope (lib/node-export.js — uuid, type, id, system, context, intent,
    summary, tags, payload) for every one of its types. A node TYPE declares its schema and its KIND — the storage shape
    it needs: record (latest state by id: what a table row is), ledger (append-only, never rewritten), ring (bounded
    window; what falls out is archived or dropped by stated policy, never silently), edge (a graph's link: from, to,
    relation, intent, weight), lattice (an edge whose state is held and updated continuously, with dwell and decay),
    blob (large, content-addressed payload), snapshot (a named, hash-linked point in time — .nex). The source of truth is
    one append-only, hash-chained log per system; every change is a record that names what caused it and who made it.
    Current state, indexes, graphs and lattices are projections rebuilt from the log. YAML node files and .nex snapshots
    are exported views of it, still readable, diffable and importable. Versionium's commits are positions in the log.

  # ── What exists (read, not recalled — §8.6) ──────────────────────────────────
  exists:
    - "lib/node-export.js — the envelope: wrap/unwrap/validate/exportToFile/importFromFile/queryDir (a directory scan that parses every file per query); KNOWN_TYPES = 57."
    - "lib/node-schemas/ — 61 files: the central schema set (the 2026-09-11 map's finding: one generic set, not each system's own)."
    - "*.nex — 168 in the tree; NEX-SNAP/1.0 (cortex/snapshot/index.js): JSON {snapId, type, tables, hashVersion, cortex_state_hash, prev_snapshot_hash, createdAt} — already a hash chain."
    - "guardian/jaa-store.js (779 lines) — tables as in-memory Maps, <table>.json whole-table snapshots on a debounced flush, cross-process O_EXCL flush lock, read-merge-write, atomic rename, flush on SIGTERM/SIGINT; get/all scan every row. 11 stores: cortex/memory/jaa-db.js, guardian/server.js, versionium/lib/store.js, lib/ledger-store.js, intelligence/lib/domain-nodes.js, copilot/lib/inject-config.js, clear-glass storage / cookie vault / artifact-chat-index … Suites: jaa-db 53/53, flush-lock 7/7, deletes-stick 5/5, multiprocess 1/1."
    - "loom/schema/registry.js — components/hooks/wires/seams/concerns in ONE registry.json (6.4 MB: 2,275 · 1,840 · 8,751), rewritten in full per add(); graph(), contextGraph(), impactOf() scan every wire. Gates + hard axioms (loom/schema/gates.js, axioms.js) check each declaration."
    - "Rings: intelligence/rfr2/kernel (append-only event ring, bounded, causal edges pruned on eviction, type index as Set — measured, hardened H-1…H-6); emerge/compiler/ring-buffer.js (bounded mutation buffer with causedBy, replay, causalChain); intelligence/cfr/ledger.js; versionium/config KERNEL_RING_CAP. All memory-only: a restart empties them."
    - "Graphs: intelligence/cfr/graph.js (causal graph: causedBy, sessionId, jobId, temporal edges); clear-glass/src/mesh/route-graph.js; copilot/lib/person-model/lattice.js; intelligence/spatial/lattice.js; loom's wires."
    - "Lattices: intelligence/lattice/associative-lattice.js — relationship_lattice as a Jaa table (step 7 of docs/nexus-relationship-shape.spec; steps 8–13 — recompute on events, sweep, traversal API, what-if, dwell/decay ranking — stated NOT BUILT); intelligence/alk (decisions linked by causedBy, rewind)."
    - "Ledgers: lib/economy/ledger.js (JSONL per day, one writer), cortex event_log (shared, many writers), lib/ledger-store.js."
    - "versionium/lib — commits, branches, calendar, restore, causality; engine polls on setInterval; own JaaStore."
    - "cortex/core/raid — _weights and health in process Maps (lost on restart; two processes disagree)."

  invariants:
    I0: "Only working memory lives in process memory or temp (James, 2026-09-29: 'basically only working memory should be in system memory or temp. everything that persists should be a node type, which the system can track and trace'). Anything that survives a restart is a node of a declared type, in its owning system's store, traceable by causedBy. Guardian's response nodes (guardian/data/nodes/response/*.response) are the working precedent."
    I9: "No hardcodes (James: 'I hate hardcodes, the system is meant to be as dynamic as possible and nonlinear, especially using the nodes and raid'). Types, kinds, providers, routes, thresholds, ports and paths are nodes resolved at run time — RAID resolves who does what from the live registry, never a literal list. A literal that remains is listed in the census (N18) with why."
    I1: "Nothing lost (§0.3): the log is append-only; compaction folds old segments into checkpoints and ARCHIVES them — never deletes. A ring's eviction policy is declared per type (archive | drop) and a drop is counted and reported."
    I2: "One write authority per store (§10.1): each system's log has exactly one writer (its service, or an exclusive lock in embedded mode). Readers read projections or ask the writer."
    I3: "Provenance on every record (§17.5): seq, prev hash, hash, op, type, id, change, causedBy, by, at. No write without a cause field (null is allowed and said)."
    I4: "Projections are derived (§10.2): state, indexes, graphs and lattices are rebuilt from the log and must equal the live projection — proven by a rebuild test in every phase that adds one."
    I5: "Sovereignty (§10.3): one store per system, in that system's own data folder; a cross-system reference is an edge naming the other system's node, never a shared table."
    I6: "Zero native dependencies, like JaaStore: pure Node, any platform, Electron included."
    I7: "Additive adoption (§3.4): nothing existing is switched over until its own suites pass unchanged on the new store; the old path stays until then, and after, it is archived — not deleted."
    I8: "Checked on write: a type's gate (schema, required fields, kind rules, references that must exist) refuses bad records and logs why — the loom axiom model, for every type."

  # ── Kinds (the storage shapes a node type can declare) ────────────────────────
  kinds:
    record:   "latest state by id; put / patch / delete; field indexes the type declares"
    ledger:   "append-only; never patched or deleted; time and field indexes"
    ring:     "bounded window of N; evicted entries archived or dropped per the type's policy; replay in seq order"
    edge:     "from, to, relation, intent, weight; adjacency indexed both ways; traversal, impactOf"
    lattice:  "an edge with held state (e.g. the four CFR numbers), patched continuously; dwell and decay computed on read"
    blob:     "content-addressed large payload (sha256), referenced by other nodes; stored once"
    snapshot: "a named position in the log, hash-linked to the previous one; NEX-SNAP/1.0 import and export"

  phases:
    N0_census:
      layer: foundation
      status: "DONE 0.39.300 — lib/nexstore/census.js; docs/nexstore-type-catalogue.yaml (286 shapes, all seven kinds, 0 unclassified, 2 undeclared node types named: capability-seam, command-seam); tests/modules/test-nexstore-census.test.js 3/3. Ranked first by intelligence's gap synthesis (it unblocks N2–N13)." 
      depends_on: []
      files:
        - "lib/nexstore/census.js"
        - "docs/nexstore-type-catalogue.yaml (generated, then reviewed)"
      does: >-
        Every data shape in the tree, found and classified before anything is built: the 57 KNOWN_TYPES, the 61
        node-schemas, every JaaStore table of the 11 stores, every data/nodes directory, every ring, graph, lattice and
        ledger listed above, every .nex. Each gets a type name, a kind, its owning system, its indexed fields and its
        references. Anything that fits no kind is listed as a gap, not forced. Reference taxonomy: guardian's (James,
        2026-09-29: "look at the node taxonomy for nexus and guardian, is the closest to complete") — its per-job
        .response nodes, .hat/.agent nodes and node-index are the model the other systems are measured against.
      proof: "tests/modules/test-nexstore-census.test.js — every JaaStore table and every nodes directory found in the tree appears in the catalogue with a kind (no unclassified data shape)"

    N1_record_and_log:
      layer: foundation
      status: "DONE 0.39.300 — lib/nexstore/record.js (frame: u32 length, u32 crc32, JSON body; seq/prev/hash/op/type/id/change/causedBy/by/at, sha256 over the canonical body; no write without a cause field) and lib/nexstore/log.js (append + fsync before return, segments with a cap, chain verified on open, torn tail cut and kept under torn/, corruption elsewhere refused, one writer by LOCK with stale takeover said); tests/modules/test-nexstore-log.test.js 5/5 — 25 SIGKILLs at random points, thousands of acks, every one present on reopen. Second by leverage in the synthesis."
      depends_on: []
      files:
        - "lib/nexstore/record.js"
        - "lib/nexstore/log.js"
      does: >-
        The record frame (length, crc32, JSON body, prev hash, hash) and the log: append, fsync before the call returns,
        segments with a size cap, the hash chain verified on open, a torn last record cut off and reported. Pure Node.
      proof: "tests/modules/test-nexstore-log.test.js — a child process killed mid-append (many times, at random points); on reopen every acknowledged record is there, the chain verifies, the torn tail is reported"

    N2_types_and_gates:
      layer: foundation
      status: "DONE 0.39.300 — lib/nexstore/types.js: the registry read from docs/nexstore-type-catalogue.yaml (N0) with lib/node-schemas joined by name (required fields, field types); the gate per type is a list of warp/core Axiom (kind ops, ledger append-only, ids, edge ends, required, types, references that must exist, a type's own axioms; soft ones report); guard(log) writes a refused record's refusal, never the record. A ring without a declared capacity is said. tests/modules/test-nexstore-types.test.js 4/4."
      depends_on: [N0]
      files:
        - "lib/nexstore/types.js"
      does: >-
        The type registry from the N0 catalogue: schema, kind, indexed fields, references, ring capacity and eviction
        policy. The gate per type (I8), built on loom's gate/axiom primitives (warp/core Axiom), not a second validator.
      proof: "tests/modules/test-nexstore-types.test.js — a record missing a required field, the wrong kind's op (a patch to a ledger), a dangling reference: each refused with its reason; the refusal is logged"

    N3_projection_and_indexes:
      layer: library
      status: OPEN
      depends_on: [N1, N2]
      files:
        - "lib/nexstore/projection.js"
        - "lib/nexstore/checkpoint.js"
      does: >-
        State rebuilt from the log; indexes by id, type, system, tags, declared fields and causedBy; checkpoints of the
        projection every N records so opening does not replay everything.
      proof: "tests/modules/test-nexstore-projection.test.js — rebuild from zero equals the live projection (I4); open from a checkpoint equals open from zero; an indexed lookup does not scan (counted)"

    N4_kinds_record_ledger_ring_blob:
      layer: library
      status: OPEN
      depends_on: [N3]
      files:
        - "lib/nexstore/kinds/record.js"
        - "lib/nexstore/kinds/ledger.js"
        - "lib/nexstore/kinds/ring.js"
        - "lib/nexstore/kinds/blob.js"
      does: >-
        The four simple kinds. A ring survives a restart (its window is the last N records of its type) and its evictions
        follow the declared policy, counted. Blobs are stored once by hash.
      proof: "tests/modules/test-nexstore-kinds.test.js — including rfr2 kernel's own ring behaviour (seq order, bounded, eviction) reproduced against a ring type"

    N5_kinds_edge_and_lattice:
      layer: library
      status: OPEN
      depends_on: [N3]
      files:
        - "lib/nexstore/kinds/edge.js"
        - "lib/nexstore/kinds/lattice.js"
        - "lib/nexstore/graph.js"
      does: >-
        Edges with adjacency indexed both ways; traversal (out, in, depth), impactOf (dependents and the intents that
        break), the causal walks cfr/graph.js does (forward replay, backward to root cause). Lattice edges hold state,
        are patched in place, and rank by dwell and decay on read — the relationship_lattice's unbuilt steps 10–12
        (traversal, what-if, dwell/decay) become queries here.
      proof: "tests/modules/test-nexstore-graph.test.js — impactOf on a loom-shaped graph equals loom/schema/registry.js impactOf on the same data; a lattice edge decays by the declared rule"

    N6_time:
      layer: library
      status: OPEN
      depends_on: [N3]
      files:
        - "lib/nexstore/time.js"
      does: >-
        at(seq), history(id), snapshot(name) as a hash-linked position (NEX-SNAP/1.0 compatible export), branch (a log
        that forks at a position), restore — what versionium does, as operations on the log.
      proof: "tests/modules/test-nexstore-time.test.js — state at a snapshot equals the state recorded then; a .nex exported and re-imported round-trips; a branch does not change its parent"

    N7_views_yaml_and_nex:
      layer: library
      status: OPEN
      depends_on: [N4, N5, N6]
      files:
        - "lib/nexstore/views.js"
      does: >-
        Export any node, type or system as the node-export YAML envelope (and .<type> files); import them back; .nex
        import/export. Views carry paths relative to the system, never absolute (loom/data/node-index today holds
        /home/claude/work/merged/… — a stale absolute path, found in this pass).
      proof: "tests/modules/test-nexstore-views.test.js — all 57 KNOWN_TYPES round-trip byte-for-byte through export → import; the 168 .nex files import and re-export with their hashes intact"

    N8_service:
      layer: api
      status: OPEN
      depends_on: [N7]
      files:
        - "lib/nexstore/service.js"
        - "lib/nexstore/client.js"
      does: >-
        One writer per system (I2): the store runs inside that system's own process; other processes use client.js
        (HTTP on the system's port, the bus for change events: nexstore.<system>.changed). Embedded mode for tests and
        single-process tools, with an exclusive lock.
      proof: "tests/modules/test-nexstore-service.test.js — four processes writing through the client at once: every write present, none lost, order per writer kept"

    N9_cli:
      layer: cli
      status: OPEN
      depends_on: [N8]
      files:
        - "lib/nexstore/cli.js"
      does: "nexstore verify | stats | get | query | history | at | export | import | replay — for a person or an agent to inspect any store."
      proof: "tests/modules/test-nexstore-cli.test.js"

    N10_migration:
      layer: automation
      status: OPEN
      depends_on: [N8]
      files:
        - "lib/nexstore/migrate.js"
      does: >-
        Per system, on request: every Jaa table, nodes directory, ring snapshot and .nex imported as nodes of their
        catalogued type, with causedBy "migration:<source path>". Counts compared source to store, per type; the sources
        archived, not deleted (I1, I7).
      proof: "tests/modules/test-nexstore-migrate.test.js — a copy of the tree's real data migrated with every count equal and a sample of rows equal field by field"

    N11_adopters:
      layer: automation
      status: OPEN
      depends_on: [N10]
      files:
        - "loom/schema/registry.js"
        - "versionium/lib/store.js"
        - "intelligence/lattice/associative-lattice.js"
        - "intelligence/rfr2/kernel/index.js (ring persistence)"
        - "cortex/core/raid/index.js (weights and health from the store)"
      does: >-
        One adopter at a time, each behind its existing API: loom's registry (the largest cost today), versionium,
        the relationship lattice, rfr2's ring (survives restarts), RAID's weights and health (and the economy ledger read
        from the same place). Each switches only when its own suites pass unchanged on the new store (I7).
      proof: "each adopter's existing suites unchanged; loom bootstrap time before and after (today ≈10 min); a RAID restart keeps its weights"

    N12_ui:
      layer: ui
      status: OPEN
      depends_on: [N9]
      files:
        - "idearium/ui/settings.html (a Store page)"
      does: "Per system: types, counts, log size, last verify, checkpoints; browse a type; a node's history and edges."
      proof: "tests/probe/nexstore-console-chromium.js"

    N13_release:
      layer: automation
      status: OPEN
      depends_on: [N11, N12]
      files:
        - "lib/version.js"
      does: "Versions, specs and addenda, SPEC-REGISTRY, atlases, loom map, run-all, regression — per release, each phase shipping when proven (not all at once)."
      proof: "the full suite against the previous release"

    N14_failure_mode_field:
      layer: library
      status: OPEN
      depends_on: [N5, N6]
      files:
        - "lib/nexstore/failure-field.js"
        - "lib/node-schemas (failure_mode schema, grounded)"
      does: >-
        James: "failure mode field to map the trajectory of bugs and integrating the causal field and event ledger index
        into a failure mode with conditions leading up to the bug or error. nodes do a huge amount of lifting once fully
        implemented." failure_mode becomes a real node type (lib/node-export.js calls it "genuinely OPEN"; test-node-schemas
        NS-003/NS-012 fail because its schema points at lib/ico.js whose logFailure() record lacks uuid, faultClass,
        gapUuid, enteredAt). A failure_mode node is the error plus the conditions that led to it: the causal walk back from
        the error through intelligence/cfr/graph.js (causedBy, sessionId, jobId, temporal edges) and the event-ledger index
        (N3 causedBy and time indexes), the CFR field state (σ, regime) at each step, and the job/contract it belonged to.
        Repeated failures with the same condition shape are edges of a lattice (N5) — the trajectory of a bug over time,
        ranked by recurrence and decay. Queries: trajectory(errorType), conditionsOf(failure), similar(failure).
      proof: "tests/modules/test-nexstore-failure-field.test.js — a scripted chain of events ending in an error yields a failure_mode node whose conditions are exactly that chain, in causal order; two failures with the same shape join one trajectory"

    N15_contract_history:
      layer: api
      status: OPEN
      depends_on: [N8, N14]
      files:
        - "lib/nexstore/views/contract-history.js"
      does: >-
        James: "each contract with a table of history, events, chat logs, everything correlating with the contract or job,
        causality is the source of truth with the order." One query per contract (RAID contract) or job (guardian job):
        every node linked to it — events, gate trail, chat transcripts and replies, economy usage records, staging commits,
        failure_mode nodes — ordered by the causal chain (causedBy), time only as the tie-break. Served as an API for the UI
        (N16) and the CLI (N9).
      proof: "tests/modules/test-nexstore-contract-history.test.js — the order follows causedBy even when timestamps disagree"

    N16_settings_without_iframes:
      layer: ui
      status: OPEN
      depends_on: [N15]
      files:
        - "idearium/ui/settings.html"
        - "idearium/ui/js/repo-environment.js (the iframe embed of settings.html?embed=1, 0.39.280 BS10)"
        - "idearium/ui/index.html (eravos-frame, architect-frame iframes)"
      does: >-
        James: "I absolutely hate the iframes in the settings, of idearium, no iframes. fully rethemed and settings
        categorized reorganized, integrated with the settings already there. with more room to breathe." The settings
        console renders in the page itself (one module, no iframe) inside the repo Settings tab and the global settings;
        categories reorganised into one tree merged with the existing idearium settings (no duplicate controls), the
        shared dark theme, wider spacing. Each contract and job gets its history table (N15). The Eravos and Architect
        system frames are listed for the same treatment as their own phase (they are other systems' UIs, not settings).
      proof: "tests/probe/idearium-settings-no-iframe-chromium.js — no <iframe> in the settings surfaces; every setting reachable once; a contract's history table renders in causal order"

    N17_data_migration_to_owning_systems:
      layer: automation
      status: OPEN
      depends_on: [N10]
      files:
        - "lib/nexstore/migrate.js (per-source plans)"
      does: >-
        James: "all data in the data folder, or system specific data in cortex that the systems are supposed to be
        generating, organizing and integrating need to be broken into nodes and migrate to the respective system." The
        20 folders under data/ (autopilot, brainos, cortex, failures, guardian, idearium, input, intake, knowledge, lattice,
        ledger, ledger-store, nexus-self, ollama, orchestrator, output, queue, raid, versionium, changelog-snapshot.json)
        and every system-specific table in cortex's shared store (data/cortex/memory) are classified by owner in N0, then
        migrated as nodes into that system's own store; cortex keeps only what is cortex's. Sources archived (I1).
      proof: "per system: counts equal, sources archived, the system's suites unchanged"

    N18_hardcode_census:
      layer: foundation
      status: OPEN
      depends_on: [N0]
      files:
        - "lib/nexstore/census.js (literal scan)"
      does: >-
        Every literal list and constant that should be a node (I9): provider lists and fallback chains, ports, paths,
        thresholds, kernel tables, route tables. Found already: RAID's fixed chain (test-raid-agent-nodes RAN-004B pins it
        as a source string), nexus/autopilot.js's kernel table, run-all's SUITES list, absolute /home/claude/... paths in
        tests (five fixed in 0.39.282), lib/cortex-write.js's hard-coded data root (fixed 0.39.282). Each becomes a node
        read at run time, or is listed with why it stays.
      proof: "the census file; tests/modules/test-nexstore-census.test.js fails on a new literal provider list"

    N19_suite_triage_and_known_gaps:
      layer: automation
      status: "DONE 0.39.282 — 57 of 81 files fixed; 24 on tests/known-gaps.yaml with kind + reason; run-all reports them apart. Full run (404 suites, chunked): 0 unregistered failures — 30 known cases in 20 files. OPEN follow-ups: ~66 test files not registered in run-all; retire gaps as they close."
      depends_on: []
      files:
        - "tests/known-gaps.yaml (each entry a gap node: file, failing count allowed, kind, reason)"
        - "tests/modules/run-all.js (reports known gaps apart; a new failure or a gap that grows still fails)"
      does: >-
        James: "Get the suite green, or mark each failing test as a known gap with its reason." Every failing file is
        read to its root cause: fixed where the cause is in reach (stale path, stale pin, sandbox leak, a real bug), else
        registered. Real bugs found so far: co-pilot confidence ignored self-reported failure; cortex /sse never broadcast
        posted events; /api/raid/status missing (orchestrator `raid` CLI always "offline"); versionium store, .nex snapshots
        and lib/cortex-write.js wrote outside the test sandbox (how test data reached 0.39.281's commits). Leaks still open:
        clear-glass/data/nodes/capability/*.capability re-exported with a new exported_at on every load (104 tracked files
        churn); data/ledger/copilot/copilot.introspect, data/ledger/orchestrator.jsonl,
        data/orchestrator/ledger/cfr/event_log.jsonl and data/vector-index written outside NEXUS_DATA_ROOT; guardian response
        nodes written to guardian/data/nodes/response from a test (test-one-tab-e2e OT-06). CLOSED 0.39.282: seven
        hard-wired data/ ledger paths follow NEXUS_DATA_ROOT (67b6f6b), LEDGER_STORE_ROOT sandboxed (eb50cba),
        system-nodes sync is a dry run on the real tree under tests (76ed6fb), response nodes sandboxed. STILL OPEN (seen in
        the full run): intelligence/data/node-index + nodes/bep_pattern + resonance_crystal, guardian/input/*.contract,
        writeback-failures.jsonl — each written by some suite outside the sandbox; find the writer, give it a STORES key.
        Also: 472 test files exist, run-all registers 402 — the ~66 unregistered ones (incl. copilot-confidence,
        clear-glass-accounts, copilot.test, ui-self-diagnosis) are either registered or archived with a reason.
      proof: "run-all green apart from registered gaps; each gap names its reason"

    N20_desktop_login:
      layer: automation
      status: "DONE 0.39.282 (4b0ffe5) — settings desktop.user/password (nexus/nexus), chpasswd at provision, guest-agent guest-set-user-password every boot, shown in the viewer, idearium atlas lists it. Test: test-cos-workspace WS-14 (not a separate file)."
      depends_on: []
      files:
        - "cos/testenv/provision.js"
        - "idearium/ui/desktop.html"
        - "docs/atlases/idearium-atlas.md"
      does: >-
        James: "the desktop environment needs to either ask, or give me the login, or use a generic password listed in the
        atlas." provision.js creates user nexus with NO password (useradd, lightdm autologin only) — a lock screen or a
        failed autologin has nothing to type. Set a generic password (default documented in the atlas, overridable at
        provision time), set it on already-built images through qemu-guest-agent (guest-set-user-password) when the desktop
        starts, and show the login in the desktop viewer.
      proof: "tests/modules/test-desktop-login.test.js (the cloud-init/provision script sets it; the viewer shows it; the guest-agent call is made for an image without one)"

    # ── 2026-09-29 (later) — James, after the live run: "Shouldn't generate empty. Why not gate each step with events.
    #    What about using shadow and negative space reasoning? Can you map all of this also? Also the manage button …
    #    Ollama should be default … No more json. Only yaml node types using and expanding the taxonomy. What if we have
    #    ollama build all of the files first … each chunk uses a new chat … then hands it off … to an agent to check and
    #    expand … I have 700 nexus zips. Some with .git a lot without. I want to import the full (mostly) history."

    N21_no_empty_generation_event_gates:
      layer: automation
      status: "BUILT 0.39.282 (first slice) — lib/step-gate.js + rule nodes lib/step-gates/{reply.accept,code.write}.step_gate (schema.step_gate, KNOWN_TYPES step_gate); gated in lib/repo-inject.js fromReply (reply, then each file) and lib/repo-agent.js (a code-less refusal); plan/manage jobs read 'blocked' not 'replied'; events step.passed/step.blocked on nexus-bus with causedBy = the step before. Test: test-step-gate 15/15 (the live refusal end to end). Slice 2: JS parses through Node's own --check (ESM as .mjs, else .cjs — Node 22 passes a .js with ESM + an error); TS stays unchecked (type stripping passes broken TS, fails valid enums); every block is a gap step.blocked.<step>.<check> (lib/gap-field.js — the road into self-heal failure modes), one open gap per step+check, repeats bumped; test 18/18. OPEN: the verify step (read-back after write — N22's shadow covers it), on_block: hold, a dispatch gate."
      depends_on: [N14]
      files:
        - "lib/step-gate.js (new — one gate every build step passes through)"
        - "lib/extract-code.js, guardian/lib/code-artifact.js, guardian/lib/response-sink.js (the steps that produced the 0-byte state.js)"
        - "idearium/api/build-surface.js + idearium/ui/js/plan-panel.js (a step shows gated/blocked, never 'replied' on nothing)"
      does: >-
        Live evidence: Idearium Files showed src/kernel/state.js at 0 bytes while its plan job said "replied" — the reply was
        a refusal ("I can't safely rebuild …") plus an empty fence, and every stage passed it on. Each step (dispatch →
        reply → extract → write → verify) becomes an explicit gate that EMITS an event (step.passed / step.blocked, with
        the reason and the causal id of the step before) and the next step starts only on step.passed. Gate rules are
        nodes (I9), not literals: a file write refuses 0 bytes, a reply that reports its own failure (lifeline's
        self-failure detector, 0.39.282) is blocked as a refusal not a result, an extracted file must parse for its
        language. A blocked step is a failure_mode node (N14) with its conditions, and goes back to the queue with the
        reason, never written.
      proof: "a refusal + empty fence reply produces step.blocked, no 0-byte file, the job shows 'blocked: refusal' — end to end through the real guardian sink"

    N22_shadow_and_negative_space_reasoning:
      layer: intelligence
      status: "BUILT 0.39.282 (first adopters) — lib/shadow.js: declare(step, expects {files, events, fields}) / settle(actual) / drop; each absence → gap absent.<step>.<kind> (lib/gap-field.js) + liminal-space item at L1/L3 caused by the shadow; shadow.declared / shadow.settled on nexus-bus; a shadow is working memory until it settles (I0). Adopted: idearium manage actions (a writing action must bring its file back; the run reads 'incomplete' naming what is absent) and spec plan runs (the phasemap must come back). Phase builds too: _phaseBuild's shadow is the files the phase names; a reply without them reads 'incomplete' (and a gate-blocked one 'blocked'). Test: test-shadow 16/16. OPEN: expected fields on written nodes, a timed window for expected events (settle reads the bus since declare)."
      depends_on: [N21, N14]
      files:
        - "lib/step-gate.js (the expectation half)"
        - "intelligence/ (reuse: relational-field, gap-field explainWhy, liminal-space — the in-between items)"
      does: >-
        SHADOW: before a step runs, it declares what it expects to exist afterwards (files and their paths from the build
        plan, fields of the node it writes, the events it will emit) — a shadow node. NEGATIVE SPACE: after it runs, the
        gate reads the DIFFERENCE between shadow and what actually exists: the file that was planned and never written,
        the event that should have fired and was silent, the field that is absent. Absence becomes data (a gap node with
        kind: absent, pointing at the shadow), not an unnoticed hole. Liminal-space already holds "unresolved in-between
        items per focal point" — the negative-space findings land there, so intelligence reasons over what did not
        happen as well as what did.
      proof: "a plan with 5 files where 4 are written yields exactly one absent-gap naming the fifth; silence of an expected event within its window yields one"

    N23_ollama_first_build_then_agent_review:
      layer: automation
      status: "BUILT 0.39.282 (phase builds) — ollama default (1413ca0); each phase build is its own FRESH chat (repo-agent dispatch { session } → repo-agent-<uuid>-<runId>, checked on the wire); when Ollama drafted it (providerUsed/backend ollama, or staged by the economy) idearium _reviewDraft hands the drafted files — full content from their inject nodes — to a guardian agent (repos.review_provider, '' = guardian's first; never ollama/auto) as one plain conversation (lib/draft-review.js reviewMessage: what is needed, the draft fenced by path, what the draft never produced, James's note), in its own chat, with its own shadow (phase.review). The draft stays on the staging branch as provenance; the review run links it (draftRunId); states reviewing/reviewed/incomplete/blocked/skipped. repos.draft_then_review turns it off. Test: test-draft-review 11/11. OPEN: the same for manage actions and plan runs; a person joining the review conversation from the Agent tab; line-level provenance (which lines the reviewer changed)."
      depends_on: [N21]
      files:
        - "lib/repo-agent.js, idearium/api/build-surface.js (build plan → chunks)"
        - "ollama/lib/ollama-client.js, lib/ollama-activity.js (numCtxFor: 4096 floor, 16384 cap for a 4 GB GPU)"
        - "lib/seam/adapters/warp-cascade.js (the hand-off)"
      does: >-
        Stage 1 — Ollama drafts EVERY file of the build plan, best it can, one chunk per FRESH chat (the chunk's spec,
        its interfaces, the files it depends on — nothing else), so each chunk has the whole window. Context: already
        auto-sized per prompt; the "4k" is the floor. Raise OLLAMA_NUM_CTX_MAX only as far as the model + VRAM hold
        (on 4 GB: a 7B q4 model at 8k–16k; past that Ollama spills to CPU and slows sharply) — the chunking is what
        keeps each prompt small, not the window. Stage 2 — the drafts go to a guardian agent as a review job: check
        against the spec, fix, expand where needed, reply in the same file fences. Through the existing guardian/tab
        channel as a normal conversation the person can join and talk in directly. Each draft and each review is a
        node linked to its chunk (provenance: who wrote which line, first).
        NOT BUILT, stated: a "semantic randomizer" that rewrites the hand-off so automated traffic reads as a human to
        the provider — that is disguising automation to evade a provider's detection, excluded in this project since
        0.39.27x and stays excluded. The hand-off is honest text sent through the channel the person uses.
      proof: "a 3-file plan: 3 ollama draft nodes (fresh chats, recorded windows), one review job, final files carry both provenance links"

    N24_no_json_yaml_node_types_only:
      layer: foundation
      status: OPEN
      depends_on: [N2, N7, N18]
      does: >-
        James: "No more json. Only yaml node types using and expanding the taxonomy." Census every JSON file the system
        WRITES (registry.json, interaction-contract.json, *_ledger.json node indexes, config, jobs, manifests) and every
        one it reads as configuration. Each becomes a node type (existing in lib/node-schemas where one fits, a new
        schema.<type> where not — the taxonomy grows, never a free-form file). JSON stays only where an outside format
        requires it (package.json, an HTTP body on the wire) — listed with that reason. Wire: the NEX log (N1) stores the
        node; .yaml is the view (N7).
      proof: "the census lists every JSON writer; each has a node type or a stated external reason; a new JSON writer fails a census test"

    N25_manage_button_enterprise:
      layer: interface
      status: "BUILT 0.39.282 — the Manage workbench (idearium/ui/js/file-manage.js + css/file-manage.css, the idearium tokens): the file with its state, lines, size and waiting proposals; actions in three groups (change · fix & prove · understand), each marked WRITES or READS; scope whole file / lines with a live preview of exactly those lines; instructions; related code search with picks; who does it (the repo's providers); the pipeline stated before sending (snapshot → agent → gate → shadow → review of an Ollama draft — steps that do not apply are struck through); this file's history of runs (newest first, review runs linked, states and reasons, absent files); Esc / Ctrl+Enter anywhere while open. Manage runs now get the same Ollama-draft review as phase builds (deps.reviewDraft). Old .manage-* rules in index.html retired (a note points here). Probe: tests/probe/manage-workbench-chromium.js 13/13 (+ screenshots); build-surface probe 11/11; DR-24. OPEN: diff vs baseline per file, per-file actions beyond the agent (stage/promote/archive) in the same surface."
      depends_on: []
      files:
        - "idearium/ui/js/file-manage.js (+ its css)"
      does: >-
        James: "the manage button. Can you make it beautiful like the rest of idearium. Like enterprise grade, fully
        built." Rebuild the file-manage surface in the settings-console language (window-chrome, one dark theme,
        breathing room): a table of the repo's files with state (pending/greyed, written, deviated, staged), size, last
        writer (ollama / agent / person — provenance), bulk select, filter and search, per-file actions (open, diff vs
        baseline, re-generate, stage, promote, archive — never delete), and a detail pane with the file's causal history
        (N15). Empty/zero-byte files are marked, never shown as done (N21).
      proof: "tests/probe/*-chromium.js drives it: every action reaches its real route; a 0-byte file shows 'empty'"

    N26_work_surface_and_tv_ui_from_contracts:
      layer: interface
      status: OPEN
      depends_on: [N25]
      files:
        - "ui/contract-renderer.js (exists: renders any interaction contract as a working UI)"
        - "ui/tv-shell/"
      does: >-
        James (message cut at "needs to have an op…"): "maybe work surface? also the tv ui. you can have the system make
        you any custom ui you want, using the interaction contract." A work surface: one page composed at run time from
        the contracts of the systems a task touches (contract-renderer already turns a contract into cards, route forms,
        SSE monitor) — panels picked by the task, not hand-coded. The TV UI gets the same composition. Open question for
        James: what the cut-off "op…" was (options? an open …?).
      proof: "a surface built for a repo task lists exactly the routes of the systems its plan touches"

    N27_history_import_from_700_zips:
      layer: foundation
      status: "BUILT 0.39.282 — cli/import-history.js (pure Node + the git CLI; runs on Windows): scan (sha256, root, version, newest-entry date, .git) → version order → one snapshot commit per zip on history/snapshots dated to the zip (node_modules, data/, nested .git left out; a tree already on the branch = duplicate, no commit) + a zip's real .git fetched into refs/import/<sha12>/*; provenance in commit trailers; YAML report in .git/nexus-history-import/; rerun skips by Zip-Sha256; a release found later is appended and flagged; --rebuild reorders and keeps the old branch; never touches the current branch (join with merge -s ours, printed). lib/zip.js now reads/writes entry dates. Test: test-import-history 14/14. Measured on the real 0.39.278–0.39.282 zips: 5 in 8 s (~20 min for 700)."
      depends_on: []
      files:
        - "cli/import-history.js (new, runs on James's machine where the zips are)"
      does: >-
        James: "I have 700 nexus zips. Some with .git a lot without. I want to import the full (mostly) history." Per zip:
        sha256, extract to temp, read the version (lib/version.js system, else package.json), date (newest entry mtime).
        (a) A zip WITH .git: fetch its commits into refs/import/<zip-sha> — real history, real authors and dates, deduped
        by git itself. (b) A zip WITHOUT .git: one snapshot commit of its tree (data/, node_modules, .git excluded),
        ordered by version then date, on an orphan branch history/snapshots; identical trees collapse (same tree hash =
        no new commit, recorded as a duplicate). Every zip becomes a provenance node (zip name, sha256, version, date,
        source: git|snapshot, commit id, duplicate-of) so the import is traceable and resumable (skip a sha already
        done). Then one merge commit joins history/snapshots under the current main as a second parent — no rewrite of
        existing history. Versionium indexes the snapshot commits as positions. Idempotent: running it twice adds nothing.
      proof: "a fixture of 5 zips (2 with .git, 3 without, one duplicate) → 2 imported ref sets, 2 snapshot commits, 1 duplicate node, rerun adds 0"

    N28_live_run_findings:
      layer: automation
      status: "(1) FIXED 0.39.282 — root cause measured: every lib/cos-bridge.js call built a whole new COS host (reload the entire state file, rebuild the system map, re-upsert every compartment, re-register every gate), and every mountPath rewrote the whole store even when nothing changed; ensureCompartments makes one or two calls per system dir. Now one host per process, reused while its state file is unchanged (another process's write or a new COS_DATA_ROOT reloads), and an identical remount is a no-op. Bench, 300 compartments / 510 KB state: unchanged compartments step 34–36 s → 1–2 ms. test-cos-mount-idempotent 8/8. Also fixed: a mount made writable again stayed in the read-only list. (2) spec drift: 0 (release 0.39.282). (3) ChatGPT sign-in: James's action. (4) RAID gate fail-open: waiting on James."
      depends_on: []
      does: >-
        From the live boot log: (1) idearium drops OFFLINE every 10 minutes during the nexus-self sync — the compartments
        step runs 17–23 s synchronously and blocks the event loop; move it to chunks yielding to the loop (or a worker)
        and measure the loop lag. (2) Spec drift: eravos spec 3.17.0 vs code 3.18.0, copilot 3.6.0 vs 3.7.0 — addend
        the specs. (3) ChatGPT tab was in logged-out guest mode (a person's action: sign in). (4) The RAID intent gate
        fails OPEN on a check error — a design choice to confirm with James (fail closed is safer).
      proof: "event-loop lag under 200 ms across a sync; spec versions match code"

    N29_full_run_only_failures:
      layer: automation
      status: "ROOT-CAUSED 0.39.282 (b6189c2): run-all killed a timed-out suite's pid but not the servers it started — now a process group, killed on timeout and exit (test-run-all-process-group); two slow suites state their budget in their header; lib/queue.js retry() tie fixed; five tests followed the data root. Confirmed: full run 0 unregistered failures; the last cause was guardian's downloads queue resolving to /tmp (shared by every sandbox), fixed 02e5105."
      depends_on: [N19]
      does: >-
        Nine suites pass (or were not run) alone but fail inside the full run (4771/45): queue.test.js (1),
        test-repo-agent-late (timeout), test-idearium-cjs-under-esm (1), test-autopilot-boot-gates (timeout),
        test-contract-queue-hardening (1), test-sentinel-cli (1), test-adversarial-sim (3), test-ico-ledger-writethrough
        (3), test-one-tab-e2e (3; 8/0 alone). Root-cause each (ordering, shared port, leftover state, timeout budget)
        before any is registered — a failure that only shows under load is still a failure.
      proof: "full run: 0 unregistered failures"

    N30_archive_import_dropbox_and_copilot_command:
      layer: interface
      status: BUILT
      depends_on: [N27]
      files:
        - "cli/import-history.js (--jsonl: one line per zip + the result, for a job to follow)"
        - "lib/history-import-job.js (new — the import as a background child process, like cos/testenv/setup-job.js)"
        - "idearium/api/index.js (GET|POST /api/history/import, PUT /api/history/import/upload, the /archive-import.html page)"
        - "idearium/ui/archive-import.html (new — the drop box)"
        - "idearium/ui/js/app.js (the /import-archives command; 'import my archives' opens it too)"
        - "clear-glass/src/copilot/verbs.js (the co-pilot pane: 'import my archives' opens the drop box)"
        - "clear-glass/src/copilot/bridge.js (the pane checks the archive intent before 'visit')"
        - "loom/maps/one-idearium-map.js (the api → job wire and the job → CLI spawn wire, which the scanner cannot see)"
        - "tests/modules/test-history-import-job.test.js (18) · tests/probe/archive-import-chromium.js (7, real Chromium)"
      does: >-
        James, 2026-09-29: "can you make a simple drop box ui? actually, can you give copilot a command, or something. like
        i want to import my archives of nexus. have it pull up a drop box ui and run the command?" A command in the places
        James talks to the system — Idearium's CLI (/import-archives, or plainly "import my archives") and the Clear Glass
        co-pilot pane — opens one drop box page. Drop zips or a whole folder (in Electron / Clear Glass a dropped file
        carries its real path, so nothing is copied; in a plain browser each zip is streamed to a local inbox first), or
        paste a folder path. It shows the order first (a dry run), then imports: cli/import-history.js as a background
        child process (idearium never blocks on 700 zips), live per-zip progress, the counts, the report path, and the one
        merge command. The import target is the NEXUS checkout idearium runs from.
      proof: "a real import of fixture zips through the job (child process, progress lines, result); the page in a real browser: drop → dry run → import → per-zip rows; the CLI command and the intent open it"
      built: >-
        2026-09-29. test-history-import-job 18/18 (the job for real into a scratch repo: the order, the import, a re-run
        that skips every zip; uploads into the sandboxed inbox; bad names and missing paths refused with the reason;
        idearium's real router; the CLI command, the plain-words intent and the Clear Glass pane). The probe, 7/7 in real
        Chromium: three zips dropped as browser File objects (so they upload), "Check the order" shows 0.39.100, .150,
        .200 and writes nothing, Import commits them in that order on history/snapshots, James's branch untouched, the
        merge command shown. One job at a time; a second start returns the running one.

    # ── HANDOFF: docs/2026-09-29-handoff.md says where this stands and what to ask next.

  risks:
    - "A storage engine's bugs are in crash recovery and fsync behaviour (Windows differs from Linux). N1's crash test runs on every platform the system ships on before anything adopts it."
    - "In-memory indexes hold to roughly a few million nodes per system; past that, on-disk indexes are a later map, not this one."
    - "Scope: this touches every system's data. That is why adoption is last, one adopter at a time, each behind its own API and suites (I7)."
