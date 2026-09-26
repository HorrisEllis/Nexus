spec:
  meta:
    name:        cos
    version:     0.1.7   # +1 real module (llm-lab, 2026-08-17) since the 0.1.6 first pass. matches the real design source's v1.6.0/v1.7.0 numbering scope, not code@0.1.0 — see §DESIGN-VS-CODE below
    foundation:  nexus-system-foundation@1.0.0
    port:        null   # CLI/library system — no HTTP surface of its own.
                          # cos/vaultd/server.js is a SEPARATE, optional daemon
                          # (real, confirmed) for the vault subsystem only, not
                          # a general COS API surface. This absence is itself
                          # relevant to the standalone-systems section below.
    uuid:        nexus-cos-v1-0000-2026-0814-jamesbrooks-001
    purpose: >
      Compartment OS — isolated sandboxes with their own process/network/
      runtime boundary, real persistent state on disk, real snapshots.
      This is the FIRST spec this system has ever had — confirmed by
      checking directly (no cos/spec/ directory existed before this file).
      plugin.js's own header cites "spec §63" as the source for its
      subcommand set; that document does not exist anywhere in this repo
      (grepped directly, zero hits) — a real, dangling reference this spec
      does not try to reconstruct from guesswork, only from what the real
      code actually does today.

  # ── §DESIGN-VS-CODE 2026-08-14 — real, verified boundary ───────────────────
  # The person's own real design document (cos/spec/cos-design-v1.7.0.md,
  # §59-§80, v1.6.0+v1.7.0) describes this system in Rust/Cobalt terms
  # (cobalt/crates/cobalt-service, Windows CNG TPM, .exe packaging). The
  # ACTUAL running code in this repo is Node.js — confirmed by checking for
  # any .rs file anywhere in the repository (zero found). This is not a
  # fabricated document: cos/archetype/registry.js has a real, dated comment
  # citing this exact spec text and documenting a bug already found and
  # fixed against it (example archetype IDs like 'arch-web-server-0001'
  # aren't valid UUID v4, so the real code uses name-based lookup instead).
  # Verified real, matching the design document exactly, not assumed:
  #   - all 16 archetypes (cos/archetype/registry.js, exact same 16 names:
  #     web-server, api-server, worker, scheduler, sandbox-browser,
  #     compiler, test-runner, database, job-queue, file-processor,
  #     containment, exe-runner, ai-agent, reverse-proxy, scratch, blank)
  #   - all 11 blueprints (cos/blueprint/registry.js, count confirmed)
  #   - vaultd (cos/vaultd/server.js, 186 real lines)
  #   - Playground (cos/playgrounds/, cli/commands/playground.js,
  #     host/gates/playgrounds.js — multiple real files)
  # Confirmed DESIGN-ONLY, zero real files found by direct search:
  #   - TPM integration (design doc §65)
  #   - Torture Chamber (design doc §68)
  # Full detail for every subsystem lives in the real design document
  # itself (cos-design-v1.7.0.md, section numbers below), not duplicated
  # here a second time — this spec is the compact, code-verified index.

  core:
    schemas:
      - Compartment: "{ id, name, purpose, runtimeId, networkIsolated, fs: {root}, createdAt, updatedAt, restoredFrom? } — see design doc §59.2 for the full canonical shape (archetype/blueprint refs, resources, watchdog, git/ssh, etc.), only a subset is exercised by the real JS code today"
      - Snapshot:    "{ schemaVersion, id, compartmentId, triggerEvent, compartment, fileManifest[{path,size,sha256}], processState?, eventTail[], createdAt, sizeBytes } — real, cos/foundation/snapshot.js"
      - Archetype:   "detection template — 16 real, built-in (design doc §60.2), directory-shape scored via 'cos archetype detect'"
      - Blueprint:   "11 real, built-in (design doc §61.3) — LAUNCHABLE multi-compartment instance templates, distinct from archetypes"
    axioms: [AX-001, AX-002, AX-003, AX-007, AX-008]
    constants:
      MANIFEST_FILE: ".cos-manifest.json"   # real, confirmed in cos/foundation/constants.js
      SNAPSHOT_EXT:  ".nex.gz"              # real, confirmed in cos/foundation/snapshot.js — gzipped JSON, config+manifest, NOT file contents (see §GAP below)

  events:
    emits:
      - "host:snapshot:taken"
      - "host:snapshot:restored"
      - "nexus:snapshot:written"
      - "archetype:listed" # + shown/assigned/detected/created
      - "blueprint:listed" # + shown/created/destroyed/status:shown/imported
    handles: []   # CLI-driven, not event-subscription-driven — confirmed, no
                  # http.createServer/express in cos/ core (only vaultd, a
                  # separate optional daemon)

  modules:
    - id: compartment-lifecycle
      description: >
        create/start/stop/destroy/list/status — real, persistent, disk-backed
        (cos/cli/commands/{create,start,stop,destroy,list,status}.js). Already
        wrapped as a real agent tool this session (lib/agent-tools/tools/
        sandbox/cos-compartment.js) and reachable from ordinary chat via
        copilot/server.js's real "create compartment" trigger.

    - id: snapshot-engine
      description: >
        cos/foundation/snapshot.js's real SnapshotEngine — take/list/load/
        restore/delete. take() captures compartment config + a file MANIFEST
        (hash/path/size — checked walkManifest() directly) + a process-state
        snapshot + a recent event-log tail, gzips the whole thing to a single
        .nex.gz. restore() is HONEST about its own real limit — confirmed by
        reading it directly: it restores the compartment CONFIG object only;
        fileManifest comes back to the caller as data, but no file bytes are
        ever rewritten by restore() itself. This is a real, tested state-
        fingerprint mechanism, not a full content backup — see §GAP.

    - id: archetype
      description: >
        cos/cli/commands/archetype.js — list/show/assign/detect/create.
        16 built-in directory-shape templates, "detect" scores an arbitrary
        directory against all of them (confidence-based classification, not
        just name matching), "assign" forces a compartment to one, "create"
        imports a custom archetype from a JSON file. Real hooks hk-a-001
        through hk-a-005, real events. Full JSON Schema + all 16 archetypes
        as complete TypeScript objects: cos-design-v1.7.0.md §60.

    - id: blueprint
      description: >
        cos/cli/commands/blueprint.js — list/show/create/destroy/status/
        import. 11 built-in LAUNCHABLE instance templates (distinct from
        archetypes, which classify/describe a shape — blueprints actually
        spin up a running instance from one). hk-b-004 (scale) and hk-b-007
        (map) are confirmed deferred in the real code's own header, not
        secretly built — noted here so this spec doesn't overclaim them.
        Full JSON Schema + all 11 blueprints as complete TypeScript
        objects: cos-design-v1.7.0.md §61 (schema) and §61.3 (all 11).

    - id: vault
      description: >
        cos/cli/commands/vault.js — set/get/list/delete/grant/revoke/audit/
        export/import, scoped global|shared|blueprint. 9 real hooks
        (hk-va-001..009). cos/vaultd/server.js is the one real HTTP surface
        in COS, an optional daemon for this subsystem specifically —
        confirmed real, 186 lines. Full VaultdConfig/VaultdState types and
        vaultd CLI: cos-design-v1.7.0.md §66.

    - id: plugin
      description: >
        cos/cli/commands/plugin.js — list/show/add/enable/disable/remove/
        validate/new. Its own header cites "spec §63" as the source for its
        full subcommand set — RESOLVED by this pass: §63 (Plugin Manager),
        §77 (Plugin Authoring Guide, with the real PluginHostAPI a plugin's
        index.js uses), and §78 (Master Hook Table, 126 hooks total) all
        exist in the person's own real design document
        (cos-design-v1.7.0.md), previously just not present in THIS repo.
        The dangling reference is closed, but the full subsystem (Plugin
        Manager's hot-install folder watcher, sandboxing, permission
        enforcement) is design-only past what cos/cli/commands/plugin.js's
        CLI surface itself implements — not re-verified line-by-line
        against the JS code in this pass, flagged honestly rather than
        assumed complete.

    - id: vault-hardware-binding
      priority: DESIGN-ONLY — confirmed absent, zero real files.
      description: >
        TPM integration (cos-design-v1.7.0.md §65) — hardware-backed vault
        key storage via Windows CNG, PCR-sealed, compartment identity
        attestation. Checked directly: no tpm/, no CNG references, no .rs
        files anywhere in this repo. COS functions fully without it today
        (the design doc's own framing: "optional enhancement"), falling
        back to whatever the real vault subsystem already uses.

    - id: torture-chamber
      priority: DESIGN-ONLY — confirmed absent, zero real files.
      description: >
        Fault injection / chaos engineering (cos-design-v1.7.0.md §68) —
        memory-flood, cpu-spike, crash-injection, hang-injection, and 8
        other real test types, always run inside a Playground by default.
        Checked directly: no torture/, no TorturePlan references anywhere
        in the real cos/ code. Playground itself (the thing torture tests
        would run inside) IS real and confirmed — this is the one
        subsystem that's fully specced but has no implementation at all
        yet, not even partial.

    - id: branch-and-compare
      description: >
        cos/cli/commands/branch.js + compare.js — real, VERIFIED in full
        this pass (was flagged "not yet read" earlier — now confirmed
        line-by-line, not assumed). BranchEngine.fork() copies real file
        CONTENT (not hashes) into .nex/branches/{branchId}/, real manifest
        {id, label, parentId, forkedAt, snapshotHash}, can fork FROM
        another branch (real branch trees). diff() is a real file-level
        diff (added/removed/modified) PLUS genuine unified line diff for
        text files (_unifiedDiff/_lcsLines, real LCS-based algorithm).
        checkout() promotes a branch back into the live compartment,
        explicitly marked destructive in its own comment. SandboxRunner.run()
        executes a branch in a real, separate child process — cwd locked to
        the branch root (cannot see the parent tree), real env isolation
        (NEXUS_SANDBOX/NEXUS_BRANCH_ID/NEXUS_RUN_ID), real timeout (default
        30s) and max-output-bytes (default 1MB) limits. CompareEngine.run()
        confirmed calling SandboxRunner.run() TWICE inside Promise.all —
        genuinely concurrent, not sequential. Real safety axioms already
        enforced: COS-4 (branches never share memory, only file content)
        and COS-11 (branch roots readonly by default). Full loop fork ->
        run -> compare -> diff -> checkout verified real end to end,
        nothing to build here — this is ready to use as-is for parallel
        bug-fix attempts or feature-approach comparisons.
        §ADDENDUM 2026-08-17 — real, live consumer confirmed, not just
        "ready to use": lib/execution-pipeline.js:126 imports BranchEngine,
        SandboxRunner, CompareEngine directly and uses all three for real.

    - id: llm-lab
      description: >
        §ADDENDUM 2026-08-17 — genuinely missing from this spec's original
        13 modules, found by auditing real cross-system requires into cos/
        from outside it (guardian/server.js, lib/execution-pipeline.js —
        the latter already covered above; this one wasn't). cos/playground/
        llm-lab.js's real LabManager/LabSession classes (507 real lines,
        confirmed) — a controlled experimental environment for running the
        SAME prompt against multiple real providers (Claude/ChatGPT via an
        injected guardianDispatch function, the same adapter pattern lib/
        seam/adapters/ already uses for WARP and Cortex — not a hard
        guardian dependency, confirmed via its own header comment). Real
        head-to-head comparison mode (identical prompts, simultaneous),
        real condition/trigger/feedback-loop chains with a max-iterations
        termination guard, every result persisted to two real JAA tables
        (lab_sessions, lab_results — confirmed real table names in the
        code, not assumed), fully replayable from JAA per its own §LAB-05.
        Live, not aspirational — this session's own real boot log already
        showed "[guardian] Lab Manager ready." Same real category as
        branch-and-compare above ("run something twice under different
        conditions, compare, log the verdict") — its own header says so
        directly — just specialized for LLM prompts/providers instead of
        code branches/test runs, which is exactly why it lived at guardian/
        lab/lab.js before being moved here on 2026-07-05.

    - id: rewind-timeline
      priority: REAL GAP — confirmed absent, not yet built.
      description: >
        Requested directly: "each compartment can have a rewind system or
        timeline with configuration to adjust snapshot frequency." Checked
        exhaustively before writing this: zero interval-based/scheduled
        snapshotting anywhere in cos/ (grepped setInterval and frequency/
        trigger constants directly, no hits). What exists today —
        SnapshotEngine.take() (manual/triggered, one-shot, real) and
        BranchEngine (fork-based, not timeline-based, real) — is NOT the
        same thing. The real pattern to reuse rather than invent from
        scratch: clear-glass/src/rewind/engine.js's RewindEngine — a
        complete, real, already-built continuous-timeline system, just
        scoped to browser sessions (keyed by agentId), not compartments.
        Same shape (a steppable timeline of real snapshots, configurable
        cadence), different subject. Real design: a scheduler wrapping
        SnapshotEngine.take() on a configurable interval per compartment,
        writing into the SAME real .nex.gz chain SnapshotEngine already
        uses — not a second snapshot format, not a copy of ClearGlass's
        engine, a genuinely new scheduling layer on top of two real,
        unmodified pieces (SnapshotEngine's real take(), ClearGlass's real
        pattern for "step forward/back through a timeline").

    - id: reverse-proxy-implementation
      priority: PARTIAL — real config, stub code.
      description: >
        The reverse-proxy archetype itself (cos/archetype/registry.js) is
        real and correctly configured for the job — network level 4 (open,
        logged), the right watchdog preset (httpHealthCheck against
        /__health), real pipe events (route:incoming/forwarded, upstream:
        down). But its fsTemplate — the actual file a new compartment gets
        seeded with — is a one-line stub comment
        ("// {{name}} — reverse proxy\n"), confirmed by reading it
        directly, not a working proxy. Spinning up a compartment from this
        archetype gets the right resource/network shape instantly; the
        routing logic itself doesn't exist yet and would need real code
        (or module-builder's real edit/expand path, generating INTO this
        exact archetype's fsTemplate rather than a parallel implementation).

    - id: upnp-port-forwarding
      priority: REAL GAP — confirmed completely absent.
      description: >
        Requested directly, for testing webservices/applications with real
        external reachability from a compartment (paired with the
        reverse-proxy archetype above). Checked exhaustively: zero
        UPnP/NAT-PMP/port-forwarding references anywhere in cos/ (grepped
        directly). Genuinely new capability, no existing primitive to
        compose it from within COS — would need a real UPnP client
        (IGD/NAT-PMP protocol) added as either a new archetype capability
        or a NetworkConfig extension (design doc §59.2's NetworkConfig
        type has proxyPort/allowedHosts/isolation level fields already,
        but nothing that actually opens a port on the person's router).

    - id: compartment-ui-hotswap
      priority: REAL GAP — real data, zero mechanism.
      description: >
        Requested directly: "hot swappable UIs for the environment."
        uiFile is a real, tracked Compartment field — detected by
        cos/foundation/cli-detector.js's detectUiFile(), shown in real
        status.js/map.js CLI output — confirmed by grep, not assumed. But
        checked exhaustively for any watch/reload mechanism tied to it
        (grepped watch+uiFile, hotswap, hot-reload across all of cos/):
        the only two hits are unrelated — a description STRING for the
        web-server archetype's own dev tooling, and a comment about plugin
        dev-mode hot-reload (a different subsystem, code not UI). Real gap:
        uiFile is data, nothing watches it live. The real pattern to reuse
        rather than invent: orchestrator.js's own real UI hotswap file
        watcher (confirmed in this session's actual boot logs — "[ui]
        watching cortex/ui/", "[ui] watching idearium/ui/", one real
        watcher per top-level NEXUS system's ui/ directory) — the same
        mechanism, scoped down to a single compartment's uiFile instead of
        a whole system's ui/ tree. Not a new hotswap engine, the existing
        one's real pattern applied one level deeper.

  # ── §ADDENDUM 2026-08-17 — spec_wizard, a real new co-pilot capability ─────
  # James: "co-pilot able to walk through making a spec using the compiler,
  # dimensions." Built: lib/agent-tools/tools/governance/spec-wizard.js,
  # verified end to end against a real running idearium server (real spec
  # created, all 10 real dimensions answered, real auto-compiled .spec read
  # back off disk). Wraps idearium/spec-engine's real 10 SPEC_SECTIONS
  # (meta/purpose/axioms/schema/api/events/integration/failure_modes/
  # build_order/tests) and its real LLM-driven wizard (6 of the 10, the
  # rest walked one dimension at a time). Named here, in COS's own spec,
  # not idearium's, because it's the SAME real concept the section above
  # already documents: idearium/spec-engine/templates.js's real templates
  # (system/codebase/library/module-component/genesis/minimal-kernel/...)
  # are the identical "template, drop the idea in as a slot" pattern this
  # spec's own §BUILD-AS-TEMPLATE-AND-SLOT section names for module-
  # builder.js — the same real methodology, one level up: an archetype/
  # blueprint is a template for a COMPARTMENT's shape; a spec-engine
  # template is a template for a SPEC's shape. Two real systems doing the
  # same real thing under different names, now both reachable from
  # co-pilot, worth knowing as one pattern rather than two.

  # ── §GAP 2026-08-14 — the real boundary found while speccing this ──────────
  # snapshot-engine's restore() never rewrites file bytes — confirmed by
  # reading it directly, not assumed. A ".cos" portable archive (mapped,
  # not yet built) is the real missing piece: an actual tar.gz of a
  # compartment's real file CONTENTS (not just their hashes), bundling in
  # the existing, unmodified .nex.gz snapshot chain as its history layer,
  # plus the compartment's real spec (canonical + one redundant machine-
  # parseable copy) as metadata. Composes real, tested infrastructure
  # (snapshot-engine, spec-compiler) with exactly one new, narrow piece
  # (real file-content archiving) rather than inventing a parallel system.
  #   mycompartment.cos/  (real tar.gz, matching the .cos-* naming already
  #                         used throughout this codebase — not a new
  #                         extension convention invented from nothing)
  #   ├── manifest.json          — real file list, now WITH content refs
  #   ├── spec/compartment.spec(.json)
  #   ├── code/                  — the actual files
  #   └── history/*.nex.gz       — reused, unmodified
  # Spawnable "on request or manually" (the person's own phrasing) maps
  # directly onto blueprint's real create() — a .cos archive is a
  # blueprint's SOURCE artifact, not a competing launch mechanism.

  # ── §STANDALONE-SYSTEMS 2026-08-14 — real, explicit design principle ───────
  # "each system can be used on its own." Checked what this actually
  # requires against COS specifically, not asserted in the abstract:
  # COS's own core has ZERO http server and zero event-subscription
  # dependency on the rest of NEXUS (confirmed: events.handles is empty,
  # no http.createServer in cos/ core) — it is ALREADY standalone by this
  # measure, more than most systems in this repo. The real, general
  # requirement this principle implies for EVERY system, not just COS:
  #   1. A real spec (this file closes that gap for COS specifically).
  #   2. No unstated dependency on another system's live process to
  #      perform its own core function (COS's compartment lifecycle
  #      already meets this; its vault/plugin layers should be audited
  #      the same way in a later pass, not assumed clean by association).
  #   3. Packageable — this is what §GAP's .cos format is actually FOR:
  #      "standalone" isn't just architectural decoupling, it should also
  #      mean an actual person can take ONE file and use the system
  #      elsewhere, which nothing currently provides for any system in
  #      this repo, COS included.

  # ── §BUILD-AS-TEMPLATE-AND-SLOT 2026-08-14 — real methodology, not new
  # mechanism — this is a NAME for something already built this session,
  # not a new system to build. "a build contract using the architecture
  # for a template and dropping the idea for the module in like a slot,
  # reusing everything possible and only generating anything new" is
  # precisely what copilot/module-builder.js's real edit/expand/repair
  # path already does (built and tested this session): a real existing
  # component is resolved FIRST (lib/loom-map.js's real resolveComponent,
  # deterministic, no LLM needed), its real current content is read and
  # included in the prompt, and the LLM is explicitly instructed to
  # describe the DIFFERENCE from what's really there — the "template" is
  # the real, already-registered architecture (an archetype or blueprint,
  # per this same spec's own modules above, is literally that template,
  # formalized), and the "slot" is the new idea/description the person
  # provides. Loom "drawing a new module" maps onto SB3's real guided-
  # build pipeline (mapped, not all built) reusing an archetype/blueprint
  # as its starting template rather than generating architecture from
  # nothing on every request. No new mechanism proposed here — this
  # section exists so the connection between COS's real templates and
  # module-builder's real edit-resolution is documented once, in one
  # place, instead of two systems quietly doing the same thing under
  # different names.

  # §NEXT — deliberately left open, not filled with invented detail:
  #   - branch.js/compare.js — READ IN FULL 2026-08-14 (see branch-and-
  #     compare module above), but still not reconciled against cortex/
  #     versionium (same system? complementary? redundant?) — that
  #     specific comparison remains open.
  #   - vault/plugin subsystems audited for the same "no live dependency
  #     on another system's process" standalone check core already passes.
  #   - the real §63 plugin spec, if it exists somewhere outside this
  #     repo or in someone's memory, reconciled here rather than
  #     silently left dangling forever.

  # ## ADDENDUM 2026-09-26 (0.39.264) — the test VM, for any repo
  # James: "i need help setting the vm up. either a batch file or just in the packages. or invent
  # a js alternative. needs to be able to create a test env for any repo."
  # Drift closed: testenv's VM needed a LINUX host (9p/virtfs) and a hand-made image — on Windows
  # it could never be offered. Now:
  #   testenv/tar.js        repo → read-only tar disk (/dev/vdb), pure JS ustar+PAX; 9p kept as opt-in
  #   testenv/detect.js     plan(repo): install + the repo's own test command + test files, for
  #                         node/python/go/rust/ruby/php/make, with the evidence for each
  #   testenv/host.js       QEMU found off PATH (COS_QEMU_DIR, PATH, Program Files\qemu, brew…);
  #                         base.json manifest in the user cache (never in the tree)
  #   testenv/index.js      install online → QMP set_link nic0 off → offline proven in the guest →
  #                         suite + files; TCG fallback when WHPX/KVM is not really there
  #   testenv/provision.js  base image in JS: Debian cloud image + cloud-init NoCloud seed served over
  #                         HTTP (SMBIOS ds=nocloud-net), qemu-ga + Node + Python (+go/ruby/php/rust),
  #                         verified by a second boot; the old base is kept as base.prev.qcow2
  #   testenv/setup-vm.bat / setup-vm.sh   one command, winget installs QEMU on Windows
  #   testenv/setup-job.js  the same from Idearium's Run menu (POST /api/cos/testenv/setup)
  #   compartment/qemu-runtime.js  opt-in cpu, shareDisk, nic id, smbios seed, serial log,
  #                         kernel/initrd boot, resolved binaries — existing VMs boot unchanged
  # Proven: test-cos-testenv 29/29; test-cos-testenv-any-repo 65/65 incl. a REAL QEMU (TCG) boot of
  # a guest built from the host's kernel + busybox + qemu-ga + node (tests/helpers/cos-mini-guest.js):
  # npm test and per-file tests ran behind the cut network. NOT proven here: provision.js against a
  # real Debian download (no internet from the build machine) — its seed/cloud-init path is tested
  # with a real HTTP seed server and an emulated first boot.
