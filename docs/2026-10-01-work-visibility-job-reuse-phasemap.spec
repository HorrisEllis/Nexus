spec:
  meta:
    name:     work-visibility-job-reuse
    roadmap: 'later — later (declutter 2026-10-09, James: "okay")'
    version:  1.0.0
    date:     2026-10-01
    release:  0.39.279 (base)
    uuid:     nexus-work-visibility-job-reuse-phasemap-v1-0000-2026-1001-jamesbrooks-001
    owner:    guardian.jobs · guardian.job-retry · idearium.spec-engine · idearium.build-queue · idearium.ui.plan-panel ·
              clear-glass.copilot · lib.component-store · lib.agent-memory · ollama.bridge · copilot.adversarial · loom.maps
    status:   D0–D2 built (0.39.279); J0–J7 mapped, open
    origin: >
      James, 2026-10-01: "should the pane's memory also feed NEXUS-wide agent memory? it needs to use the job nodes,
      and queue, guardian." / "the build order to populate the plan panel" / "a background processes [panel] like the
      claude code feature … i don't want anything not showing in the panel, thats generating or working, and the
      progress and status and let me click to expand details" / "repos to reuse jobs if it needs to generate the same
      component and be hooked into the component system in warp or the root." Then: "can you make a roadmap and phases?"

  # ── Decisions, stated ──────────────────────────────────────────────────────
  decisions:
    - id: W-D1
      text: >-
        Pane memory feeds NEXUS memory — YES, but as distilled observations through a Guardian job, never the raw
        transcript. Clear Glass stays sovereign over cg_copilot_chat (I12); NEXUS gets {fact, source turn ids, agentId}
        by contract. Raw-transcript sharing would re-create the shared-store problem SV2 is removing, and pollute recall.
        Opt-in per pane (copilotShareMemory, default off).
    - id: W-D2
      text: >-
        One job shape, emitted by every producer, owned by the producer (sovereign). Guardian's job node is the
        canonical record for anything dispatched to an agent; non-agent work (sync, snapshot, CI, chunking) emits the
        same work.* event without a Guardian node. The panel reads events, never a shared table.
    - id: W-D3
      text: >-
        Reuse key = sha256(normalized contract + prompt + provider-class). Exact hit → component-store / WARP cache
        (zero tokens). In-flight hit → join the running job (one generation, N waiters). Miss → new job.

  # ── Invariants ─────────────────────────────────────────────────────────────
  invariants:
    - I1: no agent/model call (guardian, ollama-bridge, copilot) without a jobId — a call without one fails its test.
    - I2: every job reaches a terminal state (done | failed | cancelled | reused); a job silent > its stall threshold is shown stalled.
    - I3: a reused job records which job/component it reused (provenance, never a silent copy).
    - I4: pane → NEXUS memory moves only through the Guardian queue, only when opted in.

  phases:
    - id: D0
      name: per-file version history in the Files tab Manage menu
      status: complete
      files: [idearium/api/index.js, idearium/ui/js/file-versions.js, idearium/ui/index.html]
    - id: D1
      name: COS test VM console login nexus/nexus (user created by cloud-init)
      status: complete
      files: [cos/testenv/provision.js]
      note: existing images were provisioned without the user — re-run "Set up the test VM" once.
    - id: D2
      name: a FAILED chunk can be reassigned to another agent (= retry on a backend that answers)
      status: complete
      files: [idearium/spec-engine/index.js]

    - id: J0
      name: the work.* event contract + census of every producer
      status: open
      files: [lib/work-event.js (new, stateless SDK), docs/SPEC-REGISTRY.spec]
      note: >-
        Shape {jobId, parentId, kind, owner, repoUuid, title, state, progress 0..1, step, detail, startedAt, updatedAt,
        reuseOf}. Census first: spec-engine chunks, build-queue, guardian jobs + job-retry, ollama bridge jobs,
        copilot adversarial probe, nexus-self sync, versionium snapshots, phase runs, CI runs, repo chunk/reindex.
    - id: J1
      name: Guardian job node is the canonical agent-job record
      status: open
      depends_on: [J0]
      files: [guardian/lib/jobs.js, guardian/lib/job-retry.js, ollama/server.js, idearium/spec-engine/chunk-dispatch.js]
      note: ollama-bridge and chunk-dispatch create/attach a guardian job id before calling; closes I1.
    - id: J2
      name: Background panel — every running thing, live, expandable
      status: open
      depends_on: [J0]
      files: [idearium/ui/js/work-panel.js (new), clear-glass/renderer/work-panel.js (new), idearium/api/index.js (GET /api/work, SSE)]
      note: >-
        Pop-out like Claude Code's task panel: rows grouped by repo/system, progress bar, step, elapsed; click → detail
        (prompt chars, provider, attempts, last error, reuse source); actions cancel · retry · reassign agent (uses D2).
        Stalled (I2) shown amber; failed red, never hidden.
    - id: J3
      name: build order populates the plan panel
      status: open
      depends_on: [J0]
      files: [idearium/ui/js/plan-panel.js, idearium/spec-engine/index.js]
      note: >-
        Source of truth = the chunk dependency graph (files + layers), not the generated build_order prose chunk (which
        is the one failing TRUNCATED on the 3B model). Each plan row is live from J0 events.
    - id: J4
      name: job reuse across repos (component store · WARP · loom)
      status: open
      depends_on: [J1]
      files: [lib/component-store.js, idearium/spec-engine/warp-build-dispatch.js, guardian/lib/jobs.js, loom/maps]
      note: W-D3. Exact → store, in-flight → join, miss → new. Reused components registered in loom with the consumer repo as a wire.
    - id: J5
      name: Clear Glass pane memory → NEXUS agent memory via the Guardian queue
      status: open
      depends_on: [J1]
      files: [clear-glass/src/copilot/chat-store.js, clear-glass/src/api/settings.js, lib/agent-memory.js, guardian/server.js]
      note: W-D1. A distill job per closed conversation (or every N turns); consumer writes observations with provenance.
    - id: J6
      name: stalled-build policy — stop the 10-minute silent loop
      status: open
      depends_on: [J2]
      files: [idearium/api/index.js (build-queue), idearium/spec-engine/index.js]
      note: >-
        After N identical "empty content" failures on one provider, auto-reassign down the provider cascade (D2's path),
        and if the cascade is exhausted, park the spec as needs-attention in the panel instead of re-logging every 10 min.
    - id: J7
      name: background work yields under memory pressure
      status: open
      files: [copilot/adversarial.js, idearium/nexus-self sync scheduler]
      note: adversarial probe and nexus-self sync skip a cycle while resource state is pressure/critical; shown as "deferred" in the panel.

  order: [J0, J1, J2, J3, J6, J4, J5, J7]

## ADDENDUM 2026-10-01 — merged into the main line at 0.39.285
#
# This map came from the nexus-14 zip James uploaded ("merge these if needed"): a fork built on 0.39.278, separate from
# the 0.39.279–0.39.284 line. Merged:
#   D0 per-file version history — routes repo.file.versions / repo.file.version and idearium/ui/js/file-versions.js,
#      ported as they were, the modal moved onto css/nexus-theme.css tokens (0.39.284 W5).
#   D2 a FAILED/ESCALATED chunk can be reassigned — ported; the failure is kept on the chunk as priorFailure (§0.3).
#   D1 the VM console login — superseded: 0.39.282 N20 already sets nexus/nexus (cos/testenv/provision.js, chpasswd).
# The fork's other differences are older copies of 0.39.278 work the main line has since moved past (it lacks the
# chat ledger); they were compared file by file and not taken. nexus-13 is a strict subset of 0.39.278.
# J0–J7 stay open.
