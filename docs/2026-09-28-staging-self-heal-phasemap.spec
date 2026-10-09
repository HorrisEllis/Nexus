spec:
  meta:
    name:     staging-self-heal
    roadmap: 'later — self-heal — after the loop (declutter 2026-10-09, James: "okay")'
    version:  1.0.0
    date:     2026-09-28
    release:  0.39.274 (base) · nothing below is built yet
    uuid:     nexus-staging-self-heal-phasemap-v1-0000-2026-0928-jamesbrooks-001
    owner:    loom.maps · diagnostic.nexus-heal-loop · cortex.self-heal.failure-mode-forensics · versionium.lib.engine · lib.code-edit · lib.repo-inject ·
              cos.ci · cos.runtime.syntax-check · intelligence.causal.compound · intelligence.alk ·
              intelligence.cfr · intelligence.rfr2.enforcement · intelligence.rfr2.version-gate ·
              idearium.repo.nexus-self · loom.maps
    status:   mapped, not built — every phase below is open
    origin: >
      James, 2026-09-28, reading how Intelligence and Diagnostic work so staging can plug into them:
      "Staging is the missing piece in the autonomous loop." Then "Rfr2, cfr and cos." (read those too),
      then "Make a Phasemap." (docs/CLAUDE.md rule 1: map before build.) Then: "Compound needs to hook into the
      failure mode mapping for debugging the conditions." (added as C1, S-10, I8.) Then "And then looms
      component registry." (added as L1, S-11, I11.) Then: "Always need to update and expand each atlas and
      .spec." (added as A1, S-12, I12.)

  # ── Drift, stated (§12.5, §0.0) ───────────────────────────────────────────
  drift: >
    An earlier reading of this plan said rfr2/forge "calls the Anthropic API directly" and competes with the
    heal loop's Guardian dispatch. That was wrong. forge's own §FIXED note (2026-07-14) routes it through
    Guardian/RAID with no provider field; only its file header still says Anthropic. The loop therefore has
    ONE dispatch path (Guardian). The stale header is corrected in X1; the module is not removed (rule 5,
    and nexus-healer/api/index.js and tests/modules/test-rfr2-cjs.js depend on it).

    cortex/self-heal/failure-mode-forensics.js has the same kind of stale line: its header says RFR2's causal
    kernel does not exist in this codebase, but intelligence/rfr2/kernel/index.js and
    intelligence/rfr2/causality/index.js are in the 0.39.274 tree. Its own §HONEST SCOPE also says the sigma
    delta it computes is system-wide, not per fault class. Both are stated here rather than silently fixed;
    the header is corrected in X1 once C1 has decided what the enrichment actually calls.

  # ── What exists (read, not recalled — §8.6) ───────────────────────────────
  exists:
    - >-
      diagnostic/nexus-heal-loop.js — classifies a gap, builds a repair spec, takes a Versionium "pre-heal"
      snapshot, then _dispatchToGuardian(). heal.mode !== 'live' returns { ok, dry:true } before anything is
      sent; requireRaidApproval and autoHealSeverity are re-read on every dispatch. Nothing reads the
      dispatch result back into a tree, and there is no post-heal check.
    - >-
      versionium/lib/engine.js commit({message, branch, causedBy, system, state}) — branch and causedBy are
      already first-class; parentId is the head of the named branch, or null for a branch's first commit.
    - >-
      lib/code-edit.js commit({layer, RI, repo, hat, changes, mode}) — 'review' queues an inject for approval;
      'auto' proposes + applies straight into the working tree, all-or-nothing, rolling back on failure.
    - >-
      cos/ci (per-compartment stages, every stage a real child process through SandboxRunner) and
      cos/runtime/syntax-check.cjs (parses a whole file set in one child, executes nothing).
    - >-
      intelligence/causal/compound.js — ripple / wave / tidal by causal spread: RIPPLE 1 direct downstream
      event, WAVE 2–5 (sigma > 0.35), TIDAL 6+ across at least 2 systems (sigma > 0.60). Regime is a property of
      a recorded event's descendants, not assigned at ingestion.
    - >-
      intelligence/alk rewind(uuid) — writes a rewind decision node linked to the original (reversedBy).
    - >-
      intelligence/cfr — computeDelta (tension, friction, slope per ledger transition, stored at write time),
      contract-verifier (contract violations become gaps), ledger.
    - >-
      intelligence/rfr2 — enforcement (25 named invariants, BoundaryIndex monitors continuously), version-gate
      (mandatory validate then migrate before any SNAP/BP/CLIP is hydrated), forge (Guardian job wrapper).
    - >-
      cortex/self-heal/failure-mode-forensics.js enrichFailureMode(gapType, gapUuid, entryUuid, gatherContext)
      — the failure-mode mapping. Fire-and-forget after the synchronous failure_modes insert; it gathers the
      causal chain (root + conditions via _gatherFailureContext → explainFinding → relational-field), adds a
      SYSTEM-WIDE sigma before/at-entry/delta from sigma_records (null, never 0, when there is no data),
      generates a non-executable .debug_macro from the conditions, and exports a .failure_mode node.
      It does not call compound.js at all.
    - >-
      intelligence/causal/compound.js createCompoundEngine({graph, jaaDB}) → analyze(rootEntry),
      analyzeChain(entryUuid) (walks to the true root, then forward), scan(), report(). analyze returns a
      CausalRecord for waves and tidals and null for ripples; records carry peakSigma, sigma and delta
      progression and compounding factors. It needs a CausalGraph (graph.nodes, ancestors, highSigmaNodes).
    - >-
      diagnostic/wire-integrity.js and nexus-diagnostic.js (/friction, /tension, /engines).
    - >-
      idearium/repo/nexus-self.js — Nexus-as-repos, with its own inject gate.
  missing:
    - >-
      S-1 No branch fork point: Versionium records no record of which commit a new branch forked from, so
      "restore to the pre-promote commit" on a staging branch is ambiguous (versionium.spec already names this).
    - >-
      S-2 code-edit has no third path: it writes to the working tree (auto) or queues an inject (review).
      Nothing commits to a branch and leaves the working tree alone until promote.
    - >-
      S-3 The heal loop's dispatch result lands nowhere; dry is the default and there is no post-heal check.
    - >-
      S-4 No verify gate on a staged tree: cos/ci and syntax-check exist but are not pointed at one.
    - >-
      S-5 No score: compound.js classifies EVENTS by descendant count; a code change's blast radius comes from
      the code-intel "used by" cards. The two are not joined. Something has to map radius onto the regime
      thresholds (or classify the staging commit event by its recorded causal spread).
    - >-
      S-6 No before/after tension: cfr delta is per transition. "Tension not up" needs a windowed aggregate
      before vs after, and Diagnostic's /tension may be a different definition (it warns once about a missing
      canonical scorer). The two must be reconciled before either is a gate.
    - >-
      S-7 No promote / auto-rewind: ALK rewind records a decision; it does not restore code. Rewind needs a
      staging restore through Versionium (and version-gate) alongside it.
    - >-
      S-8 No closed feedback: promoted and rewound outcomes do not reach failure/reuse memory as the input
      to the next repair proposal.
    - >-
      S-9 No dial for which change classes may auto-promote.
    - >-
      S-11 Nothing here is in Loom's component registry yet, and every phase adds require() edges the registry
      cannot see on its own where a file is hand-mapped. docs/CLAUDE.md rule 3: a component with no wires is
      an isolated dot the system cannot reason over — bare declarations are a defect. Which files need the
      hand-map (boundary hooks + consumer wires) and which the source scanner wires itself is listed in L1.
    - >-
      S-12 The atlases and specs do not cover the modules this work touches. Checked against docs/ on 0.39.274:
      lib/code-edit.js, cortex/self-heal/failure-mode-forensics.js and intelligence/causal/compound.js appear in
      NO atlas; cos/ci appears only in idearium-atlas (there is no cos atlas); nexus-heal-loop is named in
      architect-atlas and nexus-atlas but not diagnostic-atlas, where the file lives. failure-mode-forensics
      appears in no .spec at all. docs/CLAUDE.md still says docs/SPEC-REGISTRY.md, but the registry was
      converted to docs/SPEC-REGISTRY.spec on 2026-09-02 (drift in CLAUDE.md, not in this map).
    - >-
      S-10 Compound is not hooked into the failure-mode mapping. enrichFailureMode explains the conditions
      before a failure from relational-field's chain and a system-wide sigma window; compound's chain-scoped
      sigma/delta progression, compounding factors and ripple/wave/tidal class never reach the failure_modes
      row, the .failure_mode node or the .debug_macro. The two also read different graphs (relational-field
      vs a CausalGraph), so the hook needs a bridge from a gap/failure to a ledger entry uuid.

  invariants:
    I1: >-
      one dispatch path — repairs go through Guardian/RAID (LAW I); nothing here picks a provider.
    I2: >-
      the working tree is untouched until promote; staging is a branch, not a second tree (§10.1, one write
      authority per record — promote is the only writer into the repo).
    I3: >-
      every staged commit carries causedBy = the gap id, and every decision is recorded in ALK, so any
      outcome can be traced to the gap and rewound.
    I4: >-
      autonomy is earned: default auto-promote class list is ripple only; wave holds for approval; tidal
      escalates. Nexus-self promotions stay on the inject gate unless the dial is changed on purpose.
    I5: >-
      a failed verify, score or measure is reported with its reason and holds the change; it never promotes
      by default (§1.2 nothing silently fails).
    I6: >-
      rewind restores through version-gate; a version mismatch is a hard stop, not a silent restore.
    I7: >-
      feedback never blocks the loop: a failed memory write is reported and the outcome stands.
    I8: >-
      the compound hook is additive and honest: it runs after the synchronous failure_modes insert, never
      delays or risks it, and reports "no ledger entry / no graph" as null with a reason, never as a ripple.
      A ripple has no CausalRecord by design — analyze() resolves { ok:true, class:'ripple', record:null }, so
      the ripple is carried by `class`, and "could not analyze" is a different state ({ ok:false, error }).
      The stored shape keeps them apart: compound.status (analyzed | unavailable + reason) is separate from
      compound.class.
    I12: >-
      every phase updates AND EXPANDS the atlases and specs that own what it touched, in the same change —
      an atlas entry is prose plus structure, not an index line, and a spec change is a dated ADDENDUM, not a
      silent edit (§12.5, docs/CLAUDE.md rule 4). Atlas references are held to the same test as everything
      else: tests/modules/test-nexus-atlas-refs.test.js resolves every reference against the real tree, so an
      atlas never names a file that has not landed (I11).
    I11: >-
      declared is not served (docs/CLAUDE.md, loom/scanners): every component, hook and wire this work adds is
      checked against the source — a require() that exists, an endpoint that is served — before it is declared.
      A wire to a file that has not landed is not declared. Registry paperwork never runs ahead of the code.
    I9: >-
      C1 never invents a causal-chain identity. It analyzes a chain only when the failure is anchored by an
      explicit anchor pair (gap.meta.ledgerSystem, gap.causedBy = a ledger entry uuid) AND that uuid is a node in
      the graph of that system's ledger. No anchoring from timestamps, labels, event types or proximity. No anchor = status
      unavailable with the reason, and S4/S7 treat it as unknown, not as ripple.
    I10: >-
      the two sigma readings are stored under separate keys and named for what they measure: sigma.systemWindow
      (system-wide before/at-entry/delta, as today) and compound.{class, factors, sigmaProgression,
      deltaProgression} (chain-scoped). No consumer infers the difference from a field name.

  phases:
    - id: S0
      name: fork point recorded at branch creation; fix parentId-follows-branch
      status: CLOSED 2026-09-29 (0.39.279) — code landed, real test passing (below)
      files: [versionium/lib/engine.js, versionium/routes/versionium.js, versionium/spec/versionium.spec]
      closes: [S-1]
      note: >-
        Read first: the spec says parentId follows the most recent snapshot in the idearium path and the
        branch head in cortex/versionium. Confirm which path the repo-<uuid> branches use before editing.
      findings: >-
        Read, not recalled. versionium/lib/engine.js commit() already takes parentId from the NAMED branch's head
        (versionium_branches row), so parentId-follows-branch holds on the path the repo-<uuid> branches use
        (idearium/repo/snapshot.js commits every repo snapshot on branch repo-<uuid> through POST
        /api/versionium/commit). What was missing is spec gap V2: a new branch's row recorded no fork point and its
        first commit had parentId null. store.js needed no change (the branch row is schemaless JAA).
      landed:
        - >-
          engine.createBranch({ branch, from, causedBy }) — the branch row carries forkedFrom { branch, commitId }
          and forkedAt, and starts with headCommitId = the fork commit, so the first commit on the branch is the
          fork point's child. `from` is a commit id or a branch (its head). An existing branch is never re-forked.
          The reason comes first in the error ("no such commit or branch …") because HTTP callers see a truncated
          body. engine.branches(), engine.forkPoint(branch). commit({ from }) forks on a new branch's first commit.
        - >-
          routes: POST /api/versionium/commit takes `from`; GET/POST /api/versionium/branches.
      proof: >-
        tests/modules/test-staging-s0-s1.test.js S0-01 (fork at a branch head; first staged commit's parent is the
        fork point; the original branch is not moved) and S0-02 (fork from a commit id, commit({from}), no re-fork,
        unknown source refused with the reason first). The 12 existing versionium / code-edit / inject suites
        give identical results before and after.
    - id: S1
      name: code-edit stage mode + promote()
      status: CLOSED 2026-09-29 (0.39.279) — code landed, real test passing (below)
      files: [lib/code-edit.js, lib/repo-inject.js, idearium/repo/code-api.js, idearium/api/index.js, tests/modules/test-staging-s0-s1.test.js]
      closes: [S-2]
      depends_on: [S0]
      note: >-
        stage = commit to repo-<uuid>@staging with causedBy; promote(branch, commitId) is the single real
        apply into the repo and the same path S6 uses to restore.
      landed:
        - >-
          lib/repo-inject.js — status 'staged' (proposed on a branch: out of the review queue, not in the tree);
          stage(id, { branch, causedBy, commitId }), setStagingCommit(); apply() and reject() accept 'staged'.
          A Nexus repo's inject is refused (it keeps its approval gate, I4).
        - >-
          lib/code-edit.js 1.1.0 — stage({ …, causedBy, record }) is async: every change proposed and staged, then
          ONE versionium commit on repo-<uuid>@staging (system 'staging', state = the files with their inject ids
          and base/content hashes), forked from repo-<uuid> through S0; a repo with no versionium history yet forks
          from nothing and the result says forkedFrom: null. The recorder may answer { error } or throw; either way
          every inject this call staged is rejected and the reason returned (I5). No recorder = refused.
          promote({ commitId | injects }) applies the batch all-or-nothing with the auto path's rollback; a file
          changed since it was staged is a conflict, never an overwrite (unless forced).
        - >-
          idearium/repo/code-api.js — any edit/write/delete/move/batch with stage:true (and causedBy) goes to
          staging; GET code/staged lists batches by commit; POST code/promote { commitId | injects, force }.
          idearium/api/index.js passes the recorder (POST /api/versionium/commit).
      proof: >-
        tests/modules/test-staging-s0-s1.test.js S1-01…S1-04 with the REAL repo-inject over a Map-backed layer and
        the real versionium engine: staged = a commit on the staging branch caused by the gap, repo untouched, not
        in the review queue; promote lands both files; a conflict keeps the newer edit and rolls back what was
        applied; an unrecorded stage leaves nothing staged. S1-20 through idearium's real router: stage:true
        refused with nothingWritten when versionium cannot record it; code/staged and code/promote answer.
    - id: S2
      name: heal loop lands its output on staging
      status: open
      files: [diagnostic/nexus-heal-loop.js]
      closes: [S-3]
      depends_on: [S1]
      note: >-
        Dry stays the default. Pre-heal snapshot id is kept as the rewind target. Read how Guardian returns
        the patch before wiring (the result shape is not read yet).
    - id: S3
      name: verify gate — cos/ci + syntax-check + rfr2 invariants + wire-integrity on the changed files
      status: open
      files: [cos/ci/index.js, cos/runtime/syntax-check.cjs, intelligence/rfr2/enforcement/index.js,
              diagnostic/wire-integrity.js]
      closes: [S-4]
      depends_on: [S1]
      note: >-
        Open question first: how cos/ci chooses the tree it runs against — it may need to accept a staged
        branch rather than the working tree.
    - id: C0
      name: anchor — gaps born from a CFR ledger entry carry (ledgerSystem, entryUuid) as meta.ledgerSystem and meta.causedBy
      status: CLOSED 2026-09-28 — D1 decided, code landed, real test passing (below)
      files: [lib/gap-field.js, orchestrator/orchestrator.js, intelligence/server.js, cortex/gap-finder/index.js]
      closes: [S-10]
      findings: >-
        Read, not recalled. (1) 'intelligence.cfr.gap' has exactly one occurrence in the tree, the emit in
        intelligence/server.js:88; nothing listens. (2) The orchestrator's per-system ledger onGap only
        console.warns (and drops tension types by design, §CFR-WIRE-02, so nothing undrained fills a queue).
        (3) cortex/gap-finder makes gaps from anomaly.detected (causedBy = anomalyUuid) and
        sigma.event.halt_risk (causedBy = sigmaUuid). sigmaUuid is the sigma_records row uuid, a fresh uid() made
        in orchestrator/lib/sigma-writer.js _scoreEvent — NOT a CFR ledger entry. (4) orchestrator ledgerWrite
        calls ledger.record(type, payload, {source, causedBy}) and discards the return; the ledger entry uuid is
        randomUUID() at record time (ledger.js, opts.uuid unused), and neither the bus event nor the sigma
        record keeps a reference to it. Conclusion: TODAY NO gap-creation path carries a ledger entry uuid, so
        every failure would come back compound.status = unavailable. anomalyUuid is unchecked (meta/causal/
        anomaly.js not read). The only place a gap and its entry meet is the ledger's own onGap({entry}).
      note: >-
        The anchor is the PAIR (ledgerSystem, entryUuid): each system has its own ledger and graph, and
        gap.source is not always a system id ('gap-finder.sigma'). Do not try to bridge the sigma path by
        matching sigma records to ledger entries by time or type — that is exactly the inference I9 forbids.
        Turning ledger onGap into real gaps changes behavior (today they are log lines), so it needs D1.
      decision:
        D1: >-
          DECIDED 2026-09-28: cfr.collapse only, for now. sigma.spike's real firing rate against
          SIGMA_GAP_THRESHOLD was never observed in this environment, and "gap-field's dedup would keep it
          safe as one row even at a high rate" was not enough to widen the change without seeing that rate —
          so it stays a log line, as it already was. delta.tension stays dropped too (§CFR-WIRE-02's own
          reason still holds: a field metric, not an actionable gap). Revisit sigma.spike once cfr.collapse's
          real rate is seen.
      landed:
        - >-
          orchestrator/orchestrator.js — the per-system onGap in _getEventLedger() now calls
          lib/gap-field.js's report() for gap.type === 'cfr.collapse' only, with meta.ledgerSystem = system
          (the closure's own createCFRLedger arg — confirmed the only correct value; gap.entry._system would
          be the emitting sub-source, not the ledger the entry lives in) and meta.causedBy = gap.entry.uuid
          (the ledger entry itself, from the SAME onGap payload — no separate lookup needed, confirmed by
          reading _checkGaps() in intelligence/cfr/ledger.js: every onGap call already carries { entry }).
        - >-
          tests/modules/test-c0-cfr-collapse-anchor.test.js (registered in run-all.js) — spawns the REAL
          orchestrator process, drives real ledger entries through the documented POST /cfr/emit test hook,
          and reads the real persisted gaps table. 3/3 passing, run twice, no leaked child process.
          C0-1: 3 real 'contract.structural.fail' emits cross CFR_COLLAPSE_THRESHOLD; the resulting gap's
          meta.ledgerSystem is 'orchestrator' and causedBy is EXACTLY the third emit's own entry uuid (the one
          that actually crossed the threshold, not any of the three — I9's "no invented identity" holds for
          picking among real candidates too, not only for inventing one).
          C0-2: a fourth collapse does not add a second gaps-table row for the same dedup key.
          C0-3: no 'sigma.spike' or 'delta.tension' row ever reaches the gaps table, reading the real file.
        - >-
          FOUND WHILE TESTING, corrected here rather than left wrong: the gaps table is NOT
          '<table>.jsonl' as cortex/memory/jaa-db.js's own JaaDB._append() class suggested on a first read.
          The jaaDB singleton lib/gap-field.js writes through actually wraps guardian/jaa-store.js's JaaStore
          (cortex/memory/jaa-db.js's own _getStore() confirms this; the JaaDB class earlier in that file is
          dead code for this path) — one '<table>.json' FULL-SNAPSHOT ARRAY, flushed on a 1500ms debounce or
          synchronously on close(). The first version of this test read the wrong filename and wrong format
          and failed with zero rows found; this is now the confirmed real format and the test reads it
          correctly. Worth carrying into A1's cortex-atlas/intelligence-atlas entries, since the next reader
          of gap-field.js or the gaps table would make the same wrong assumption from the same file.
    - id: C1
      name: compound hooks into failure-mode enrichment — regime, chain-scoped sigma/delta progression and
            compounding factors on the failure_modes row, the .failure_mode node and the .debug_macro
      status: CLOSED 2026-09-28 — D2 decided (a), code landed, real test passing (below)
      files: [cortex/self-heal/failure-mode-forensics.js, intelligence/causal/compound.js,
              cortex/self-heal/index.js, intelligence/rfr2/causality/index.js,
              orchestrator/orchestrator.js, lib/node-schemas/schema.failure_mode,
              lib/node-schemas/schema.debug_macro]
      closes: [S-10]
      depends_on: [C0]
      findings: >-
        Read, not recalled. enrichFailureMode runs in the CORTEX service (cortex/boot.js loads ./self-heal);
        the per-system ledgers and their CausalGraphs live in the ORCHESTRATOR process, in a private
        _eventLedgers map that is not exported. The only cross-process reach is HTTP, and the orchestrator
        mounted /cfr/* against its own 'orchestrator' ledger only — so the note's "take the ledger for
        gap.source" could not work in-process, and a C0 anchor for any other system would have come back
        unavailable. analyzeChain(uuid) walks to the TRUE ROOT and analyzes from there, so its record
        describes the root's chain, not the anchored entry. C0 sets gap.source = 'cfr.ledger.<system>',
        which _gatherFailureContext uses as ctx.system — the anchor is therefore read from
        gap.meta.ledgerSystem, never from source.
      decision:
        D2: >-
          DECIDED 2026-09-28: (a) — the orchestrator's GET /cfr/compound/:uuid takes ?system=<s> and reads
          that system's ledger; cortex calls it over HTTP with a 2500ms timeout. (b) — moving the compound
          step into the orchestrator — was rejected: it would split enrichment across two services and
          leave the failure_modes row written from a process that does not own it.
      landed:
        - >-
          orchestrator/orchestrator.js — GET /cfr/compound/:uuid?system=<s> resolves through
          _eventLedgers.get(s) (the EXISTING ledger only; _getEventLedger would lazily create a ledger and a
          directory for any name it is handed). An unknown system answers { ok:false, error:"no ledger for
          system 's'" }; it never falls back to the orchestrator's own graph, because a real uuid analyzed
          under the wrong system's graph is an invented chain (I9). No ?system= keeps the old behavior.
        - >-
          cortex/self-heal/index.js — _gatherFailureContext adds ctx.anchor = { ledgerSystem, entryUuid }
          from gap.meta.ledgerSystem + gap.causedBy, and only when BOTH are present; otherwise null.
        - >-
          cortex/self-heal/failure-mode-forensics.js — computeCompound(anchor, fetcher) and the default
          fetchCompoundViaOrchestrator(anchor, timeoutMs, baseUrl); enrichFailureMode gains a fifth
          argument, the fetcher (injected like gatherContext; default is the HTTP one). Stored under
          `compound` = { status: analyzed|unavailable, reason, class, factors, sigmaProgression,
          deltaProgression, peakSigma, rootUuid, anchor }. The system-wide sigmaBefore/sigmaAtEntry/
          sigmaDelta stay flat and unchanged (no consumer of them exists in the tree — checked). debug_macro
          gets payload.compoundClass only when status is analyzed. A ripple is status analyzed, class
          ripple, factors and progressions null — it has no CausalRecord by design.
        - >-
          lib/node-schemas/schema.failure_mode (+ cortex/schemas copy) gains `compound`;
          schema.debug_macro (+ cortex/schemas copy) gains `compoundClass`, each a correction_2026-09-28
          field. checkPayload checks required keys only, so the new keys never blocked an export.
        - >-
          tests/modules/test-c1-compound-failure-mode.test.js (registered in run-all.js) — 12/12. REAL cases
          (C1-8..C1-11) spawn the real orchestrator, drive real entries through POST /cfr/emit and call the
          DEFAULT fetcher over real HTTP. INJECT cases (C1-1..C1-7, C1-1b) pin the mapping rules with an
          injected fetcher. Negative control: against the C0-only orchestrator (no ?system= route) C1-9
          fails — a real uuid under a nonexistent system gets analyzed — and passes with the route.
      not_done: >-
        compound.class is NOT yet reached by anything that decides: S4 reads it, and S4 is open. Not run:
        the full run-all suite. Not checked: whether a cfr.collapse gap actually reaches level 4 in a live
        system (test-c1 drives enrichFailureMode directly). analyze() on a wave/tidal writes a tidal-alert
        gap through compound's own TidalAlertGate; C1 now triggers that from a cortex request too — the
        route already did, but repeat enrichment of the same chain is not deduplicated here.
      note: >-
        Add a compound step to enrichFailureMode: read gap.causedBy, take the ledger for gap.source from the
        orchestrator's per-system ledgers (each has its own graph and compound engine; getGraph() and
        GET /cfr/compound/:uuid already expose it), run analyzeChain(uuid), and store the result under a
        `compound` key (status, class, factors, sigmaProgression, deltaProgression) separate from the
        existing sigma keys (I10). analyzeChain already returns { ok:false, error:'entry not found' } when the
        uuid is not in that graph — that maps to status unavailable. Annotate the debug_macro with the class
        only when status is analyzed. Three other CausalGraph instances exist (intelligence/index.js,
        cortex/memory/causal-lookup.js, per-ledger); only the gap's own system ledger is a valid anchor.
        Inject the engine the way gatherContext is injected, to avoid a circular require.
    - id: S4
      name: score — blast radius from used-by cards, regime from compound, tension window from cfr
      status: open
      files: [intelligence/causal/compound.js, intelligence/cfr/delta.js, diagnostic/nexus-diagnostic.js,
              idearium/repo/code-api.js]
      closes: [S-5, S-6]
      depends_on: [S3, C1]  # C1 status unavailable = unknown, never ripple (I9)
      note: >-
        Decide and record: (a) radius→regime mapping, (b) which tension definition gates, cfr or
        Diagnostic's. Do not gate on both until they are reconciled.
    - id: S5
      name: decide + dial — heal.autoPromoteClasses (default ripple)
      status: open
      files: [diagnostic/nexus-heal-loop.js, lib/config]
      closes: [S-9]
      depends_on: [S4]
      note: >-
        Ripple + tests green + tension not up → promote. Wave → hold for approval. Tidal → escalate
        (existing cortex/self-heal/escalation.js). Nexus-self stays on its inject gate.
    - id: S6
      name: post-promote re-measure + auto-rewind
      status: open
      files: [intelligence/alk/index.js, versionium/lib, intelligence/rfr2/version-gate/index.js,
              intelligence/cfr/contract-verifier.js]
      closes: [S-7]
      depends_on: [S5]
      note: >-
        Regression = tension up, or contract violations after promote. Action = ALK rewind + staging restore
        to the pre-promote commit, through version-gate.
    - id: S7
      name: feedback into Intelligence — rejected/rewound → failure memory, promoted → reuse
      status: open
      files: [intelligence/gap, intelligence/alk, intelligence/causal/compound.js]
      closes: [S-8]
      depends_on: [S6, C1]
      note: >-
        The next repair proposal starts from this history. Read where failure/reuse memory lives before
        choosing the write path — it is not read yet.
    - id: L1
      name: Loom component registry with wires — loom/maps/staging-self-heal-map.js, mirroring
            loom/maps/agent-memory-map.js (one component per file, FILES/CONSUMERS/BOUNDARY_EXPORTS/BOUNDARY_IMPORTS,
            ids from source-map.js idFor(), so the scanner never declares them twice)
      status: open
      files: [loom/maps/staging-self-heal-map.js, loom/bootstrap.js, loom/registry-components.js]
      closes: [S-11]
      depends_on: [S0, S1, S2, S3, C0, C1, S4, S5, S6, S7]
      note: >-
        Per-phase obligation, not a lump at the end: each phase's closing step adds its new files and edges to
        this map, verified against the source (I11). Classification, checked against the 0.39.274 tree:
        HAND-MAPPED elsewhere (the scanner skips them, so any new edge INTO or OUT OF them needs a CONSUMERS
        or BOUNDARY entry here): lib/code-edit.js and lib/repo-inject.js (idearium-codebase-map),
        versionium/lib/engine.js and cortex/self-heal/index.js (session-2026-08-14-map),
        intelligence/causal/compound.js, intelligence/cfr/ledger.js and lib/gap-field.js (observability-map).
        SCANNER-DECLARED (ordinary require()s in them are wired by the scanner; no entry needed unless a new
        file is added): diagnostic/nexus-heal-loop.js, cos/ci/index.js, cortex/self-heal/failure-mode-forensics.js,
        intelligence/alk/index.js, intelligence/rfr2/enforcement, intelligence/rfr2/version-gate,
        cos/runtime/syntax-check.cjs, diagnostic/wire-integrity.js. HTTP edges the scanner cannot see (e.g. the
        heal loop's POST to /api/versionium/*, GET /cfr/compound/:uuid) are declared as external wires. Any NEW
        route (a promote or rewind endpoint, if one is added) also goes in the owning module's
        registry-components.js and interaction-contract.json, not only this map.
        NEW files in this work are not named yet — the phases above modify existing files; a new file gets a
        component the same turn it lands.
    - id: A1
      name: atlases and specs — expand, don't just touch
      status: open
      files: [docs/atlases/*.md, docs/*.spec, docs/SPEC-REGISTRY.spec, tests/modules/test-nexus-atlas-refs.test.js]
      closes: [S-12]
      depends_on: [S0, S1, S2, S3, C0, C1, S4, S5, S6, S7]
      note: >-
        Per-phase obligation, like L1: each phase's closing step edits these in the same change.
        ATLASES (docs/atlases/): diagnostic-atlas (heal loop, wire-integrity, the new landing/rescore steps),
        intelligence-atlas (compound, cfr, alk, rfr2 — compound and the failure-mode hook are in none today),
        versionium-atlas (branch fork point, staging, promote/restore, version-gate), idearium-atlas (code-edit
        stage mode, repo-inject, cos/ci as the verify gate), cortex-atlas (self-heal, failure-mode-forensics,
        gap-finder), loom-atlas (the new map), nexus-atlas (the loop as a whole). There is no cos atlas: cos/ci
        is covered only inside idearium-atlas, so decide there whether cos needs its own (cos-testenv already
        has a phasemap) rather than growing idearium-atlas further.
        SPEC ADDENDA (dated, one per owning spec): self-heal.spec and escalation.spec (heal loop lands
        output, tidal escalation), versionium.spec (fork point, staging branch, restore), cfr.spec and
        rfr2.spec (contract-verifier as a post-promote signal, enforcement invariants on staged trees,
        version-gate on restore), intelligence.spec (compound hook, ALK rewind with restore, failure/reuse
        feedback), cos.spec (ci as the verify gate), code-intel.spec (code-edit stage mode, used-by cards as
        blast radius), loom.spec (the new map), diagnostic.spec (post-promote re-measure). Owners were found
        by grepping docs/*.spec for each module; failure-mode-forensics has no owning spec at all, so its
        first spec entry is a decision (extend self-heal.spec, or a new spec registered in SPEC-REGISTRY).
        Register anything new in docs/SPEC-REGISTRY.spec. Divergent copies of a spec are surfaced, not
        collapsed (rule 4).
    - id: X1
      name: axioms pass — loom map with wires (mirror loom/maps/warp-map.js); addenda to the owning specs;
            SPEC-REGISTRY; lib/version.js bump; register tests in run-all; correct the forge header;
            one nexus.zip without data/**
      status: open
      files: [loom/maps, docs/SPEC-REGISTRY.spec, lib/version.js, package.json, tests/modules/run-all.js,
              intelligence/rfr2/forge/index.js, cortex/self-heal/failure-mode-forensics.js]
      depends_on: [S0, S1, S2, S3, C0, C1, S4, S5, S6, S7, L1, A1]

  proof:
    - >-
      Loom baseline, measured 2026-09-28 on a throwaway copy of the 0.39.274 tree (node loom/bootstrap.js):
      exit 1; every component/hook/wire re-declaration rejected by loom.unique-id because the shipped
      registry.json already holds them (0 "ok" declarations, same as the 0.39.266–269 phasemap noted);
      112 STILL UNRESOLVED endpoints; 71 unresolved specs; 715 events, 380 event hooks, 462 emit→listen wires.
      The bootstrap prints only 20 of the 112 unresolved endpoints ("...and 92 more"); none of the 20 shown is a
      file this work touches, but the other 92 were not seen, so this is not a claim about all of them. L1's
      first step is to get the full list (the registry written on the copy) and check the touched files against
      it. L1's proof is therefore: unresolved
      stays 112 or falls, none of the new components/hooks/wires is rejected for a reason other than
      unique-id against the shipped registry, and every new component is wired both ways.
    - >-
      Nothing else to prove yet. Each phase lands with its own test, and the suite stays green
      (docs/CLAUDE.md delivery discipline). S2 is proven in dry mode first, then live on one ripple-class gap.

  open_items:
    - >-
      This map is grounded against the 0.39.274 tree for: heal loop, engine.js commit, code-edit, cos/ci,
      syntax-check, compound.js, alk rewind, cfr delta, rfr2 enforcement/version-gate/forge headers. It is NOT
      yet grounded against: which CausalGraph instance is live and whether failure conditions are nodes in it
      the used-by card format, Guardian's patch result shape, failure/reuse memory
      storage, or cos/ci's tree selection. Each is named in the phase that needs it.
    - >-
      Nexus-self promotions default to the inject gate. James has not confirmed that; it is an assumption.
    - >-
      Nothing here has run against live services.
    - >-
      Loom baseline above is from a bootstrap on a copy; the shipped loom/data/registry.json was not modified.
      C0's orchestrator.js and test changes have NOT yet gone through L1 (Loom wires) or A1 (atlas/spec
      addenda) — both are per-phase obligations owed on C0 now that it's closed, not deferred to the end.
    - >-
      C1's orchestrator.js, cortex, schema and test changes have NOT yet gone through L1 (Loom wires) or A1
      (atlas/spec addenda) either — owed on C0 and C1 together.
      NEXT: L1 + A1 for C0 and C1, then S4's dependency S3/S0 chain. S0 (Versionium fork point) is independent.
      S0 (Versionium fork point) remains independent and can start in either order with C1.
