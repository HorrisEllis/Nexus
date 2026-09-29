spec:
  meta:
    name:     nex-node-store
    version:  0.1.0
    date:     2026-09-29
    release:  "0.39.281 (base) → from 0.39.282, one phase at a time"
    uuid:     nexus-nex-node-store-phasemap-v1-0000-2026-0929-jamesbrooks-001
    owner:    "lib.nexstore (new) · lib.node-export · lib.node-schemas · versionium · loom.schema.registry · intelligence.lattice · intelligence.rfr2.kernel · intelligence.cfr · cortex.core.raid"
    status:   "mapped, not built — every phase open. Working name 'nexstore' (James to name it; a rename is one find-and-replace before N1)"
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
      status: OPEN
      depends_on: []
      files:
        - "lib/nexstore/census.js"
        - "docs/nexstore-type-catalogue.yaml (generated, then reviewed)"
      does: >-
        Every data shape in the tree, found and classified before anything is built: the 57 KNOWN_TYPES, the 61
        node-schemas, every JaaStore table of the 11 stores, every data/nodes directory, every ring, graph, lattice and
        ledger listed above, every .nex. Each gets a type name, a kind, its owning system, its indexed fields and its
        references. Anything that fits no kind is listed as a gap, not forced.
      proof: "tests/modules/test-nexstore-census.test.js — every JaaStore table and every nodes directory found in the tree appears in the catalogue with a kind (no unclassified data shape)"

    N1_record_and_log:
      layer: foundation
      status: OPEN
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
      status: OPEN
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

  risks:
    - "A storage engine's bugs are in crash recovery and fsync behaviour (Windows differs from Linux). N1's crash test runs on every platform the system ships on before anything adopts it."
    - "In-memory indexes hold to roughly a few million nodes per system; past that, on-disk indexes are a later map, not this one."
    - "Scope: this touches every system's data. That is why adoption is last, one adopter at a time, each behind its own API and suites (I7)."
