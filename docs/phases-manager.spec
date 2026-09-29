spec:
  meta:
    name:     phases-manager
    version:  1.0.0
    date:     2026-09-27
    release:  0.39.271
    uuid:     nexus-idearium-repo-phases-v1-0000-2026-0927-jamesbrooks-001
    file:     idearium/repo/phases.js
    status:   built — proven by tests/modules/test-one-idearium-phases-nodes.test.js
    phasemap: docs/2026-09-27-one-idearium-phases-living-spec-nodes-phasemap.spec (P2-P4)
  purpose: >-
    One phases manager (Roadmap + Phasemap) for every repo: which phasemaps it reads, one model over them, and the
    task a phase build hands the agent.
  contract:
    mapsFor: >-
      ({ repo, repoDir }) -> an ordinary repo: its own *phasemap*.spec files (roadmap.collectPhasemaps); a nexus
      repo: every phasemap in the immutable base's head snapshot (a system: the maps with a phase loom tags as
      its own; _archive/ left out).
    managerView: >-
      ({ repo, repoDir, runs }) -> { scope, editVia, maps (meta + summary), phases (phase_nodes + mine, runs,
      lastRun), layers, warnings, summary }.
    buildRequest: ({ phase, mapText, repo, depsDone }) -> { message, title } — the phase body, what it closes, the invariants.
    routes: >-
      GET /api/repos/:uuid/phases · GET .../phases/runs · POST .../phases/status {map, phase, status, force} ·
      POST .../phases/add {map, title, does, dependsOn, prefix} · POST .../phases/build {map, phase, provider, note}.
      A nexus edit goes through the apply gate (lib/nexus-self/apply.js) then syncs the owning system; an ordinary
      repo's through its repo layer. A build takes the Versionium snapshot first and refuses without one
      (NO_SNAPSHOT), sets the phase active, then dispatches lib/repo-agent.js in the background; runs are appended
      to idearium_phase_runs (building → replied | failed | refused).
