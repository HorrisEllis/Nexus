# Every phase as a .phase node, and which ones have a spec (2026-10-24, 0.60.227)

James, 2026-10-24: "spec per component/capability/etc its in the specs. deocmpose all of the phases into .phase nodes including dag per phase."

Written by `node emerge/compiler/phase-specs.js --all`: every phase of the 166 maps in docs/ as `<owner>/phases/<map-id>/<phase>.phase` and its `graph/<phase>-<hash>.graph` (its files with roles, crossings, and its slice of the whole DAG: deps, upstream, downstream, what it unblocks).

- **2046 phases** written. **133** name the spec they build from (`spec:` + `blocks:`); 1913 do not. 18 name blocks their spec does not declare.
- His rule (docs/CLAUDE.md, 2026-10-20 addendum): a full spec per capability, then phases, then each phase specced again. The phases written before that rule have no spec: the gap below is the specs still to write, per component.

## By owning system

| system | phases | with a spec | open, no spec |
|---|---:|---:|---:|
| core | 1410 | 46 | 819 |
| idearium | 299 | 20 | 122 |
| clear-glass | 138 | 50 | 53 |
| cos | 57 | 11 | 30 |
| cortex | 41 | 3 | 29 |
| guardian | 28 | 0 | 10 |
| loom | 21 | 1 | 14 |
| copilot | 15 | 0 | 6 |
| intelligence | 15 | 0 | 12 |
| orchestrator | 7 | 2 | 2 |
| diagnostic | 5 | 0 | 4 |
| versionium | 4 | 0 | 2 |
| ollama-bridge | 3 | 0 | 1 |
| architect | 3 | 0 | 3 |

## Maps whose every phase names its spec

- docs/2026-09-11-brainos-agent-orchestration-phasemap.spec
- docs/2026-09-19-agents-clearglass-guardian-idearium-copilot-phasemap.spec
- docs/2026-09-25-spec-engine-manifest-first-phasemap.spec
- docs/2026-09-27-clearglass-whole-copilot-learning-phasemap.spec
- docs/2026-09-27-idearium-codebase-toolkit-phasemap.spec
- docs/2026-10-15-pipeline-focus-phasemap.spec
- docs/2026-10-20-belief-loop-phasemap.spec
- docs/2026-10-20-substrate-graph-traversal-chunking-gating-phasemap.spec
- docs/2026-10-21-data-layout-phasemap.spec
- docs/2026-10-21-snowflake-compartment-phasemap.spec
- docs/2026-10-22-system-node-db-phasemap.spec
- docs/2026-10-23-cos-spine-phasemap.spec
- docs/2026-10-23-self-building-loop-phasemap.spec
- docs/2026-10-23-site-profile-processes-phasemap.spec
- docs/session-2026-08-18-axioms-governed-phasemap.spec

## Maps with open phases and no spec (most open first)

| map | phases with no spec | of them open |
|---|---:|---:|
| 2026-09-02-nexus-vision-master | 58 | 56 |
| 2026-10-02-emerge-field-memory-build | 48 | 42 |
| 2026-10-01-idearium-agent-ready-master | 58 | 36 |
| 2026-09-11-sovereign-node-architecture | 35 | 35 |
| 2026-09-05-observability-sovereignty-and-agent-mesh | 32 | 28 |
| 2026-09-28-graph-build-context-settings-memory | 29 | 28 |
| 2026-10-05-build-from-the-spec | 58 | 27 |
| 2026-10-12-request-spine | 28 | 27 |
| 2026-09-01-living-model-and-autonomous-pipeline | 26 | 26 |
| 2026-10-12-browser-providers-and-work | 32 | 25 |
| 2026-10-15-clear-glass-network-posture | 27 | 25 |
| 2026-10-15-gate-held-work | 32 | 24 |
| 2026-10-19-infrastructure-spine | 24 | 24 |
| 2026-10-17-system-drawbridge | 29 | 21 |
| 2026-09-29-nex-node-store | 31 | 20 |
| 2026-08-23-backlog | 32 | 17 |
| 2026-10-16-code-tab-rebuild | 19 | 17 |
| 2026-10-09-one-model-engine | 16 | 16 |
| 2026-10-19-pipeline-root-causes | 29 | 16 |
| 2026-08-27-event-taxonomy-and-brainstorm | 16 | 15 |
| 2026-09-19-cortex-to-intelligence-and-versionium-consolidation | 20 | 15 |
| 2026-09-19-guardian-mesh-first-dispatch | 15 | 15 |
| 2026-10-15-macro-node-recording | 19 | 14 |
| clearglass-agent-suite-and-cfr-loom | 16 | 14 |
| 2026-10-10-idearium-solid | 23 | 13 |
| 2026-10-13-identities-tabs-and-automation | 18 | 13 |
| 2026-10-13-projects-raid-and-gates | 21 | 13 |
| 2026-10-19-idearium-control | 13 | 13 |
| 2026-08-30-interaction-contract-context | 13 | 12 |
| 2026-10-17-debugging-product | 17 | 12 |
| nexus-architecture-rebuild | 22 | 12 |
| 2026-09-11-compartment-nodetype-and-reorg | 17 | 11 |
| 2026-10-05-cli-data-code | 26 | 11 |
| 2026-10-10-shape-of-nexus | 18 | 11 |
| 2026-09-02-versionium-sovereign-and-cleanup | 10 | 10 |
| 2026-10-15-automatic-tracking | 12 | 10 |
| 2026-10-17-failure-mode-report | 16 | 10 |
| 2026-09-28-staging-self-heal | 13 | 9 |
| 2026-10-10-design-surface | 9 | 9 |
| 2026-10-15-personal-chat-import | 12 | 9 |
| 2026-10-16-cos-console | 9 | 9 |
| agent-model-and-user-continuity | 10 | 9 |
| 2026-10-01-work-visibility-job-reuse | 11 | 8 |
| 2026-10-02-fractal-graph-any-size-agent | 8 | 8 |
| 2026-10-02-workshop-codex-rewind | 15 | 8 |
| 2026-10-05-cos-machines | 9 | 8 |
| 2026-10-15-cos-app | 17 | 8 |
| 2026-10-16-repo-carve | 14 | 8 |
| 2026-10-17-infrastructure-migration | 12 | 8 |
| 2026-10-18-compartment-environment | 14 | 8 |
| 2026-10-18-debugging-product | 11 | 8 |
| 2026-10-19-solid-build-foundation | 12 | 8 |
| nexus-self-build-pipeline | 9 | 8 |
| nexus-system-standardization | 8 | 8 |
| 2026-09-19-architect-blueprint-forge-idearium | 10 | 7 |
| 2026-09-22-clear-glass-tab-per-repo-and-ui-expansion | 8 | 7 |
| 2026-09-26-guardian-retry-novelty-and-installs | 7 | 7 |
| 2026-10-15-spec-foundation-model | 7 | 7 |
| copilot-guardian-cos-expansion | 10 | 7 |
| 2026-09-22-brainos-agent-suite | 6 | 6 |
| 2026-10-05-spec-workshop-rebuild | 11 | 6 |
| 2026-10-05-verified-primitives | 8 | 6 |
| 2026-10-07-versionium-releases | 7 | 6 |
| 2026-10-10-self-awareness | 6 | 6 |
| 2026-10-15-clear-glass-surfaces | 7 | 6 |
| 2026-10-16-durable-work-timeline | 9 | 6 |
| 2026-10-16-nexus-git-sync | 9 | 6 |
| 2026-10-17-pieces-not-order | 9 | 6 |
| 2026-10-18-gate-memory | 12 | 6 |
| 2026-10-18-gating-census | 7 | 6 |
| 2026-10-19-gate-quality-checks | 6 | 6 |
| 2026-10-19-gig-autofill-and-learn | 9 | 6 |
| nexus-repo-compartment-and-rich-dispatch | 7 | 6 |
| 2026-09-02-agent-mesh-full-map | 6 | 5 |
| 2026-10-07-heal-nodes | 5 | 5 |
| 2026-10-07-system-expectations | 5 | 5 |
| 2026-10-10-snapshot-compartments | 5 | 5 |
| 2026-10-13-nexus-memory-gates-and-contract | 13 | 5 |
| 2026-10-16-intent-hat-agent-chain | 7 | 5 |
| 2026-10-16-proposal-evidence | 9 | 5 |
| 2026-10-05-failure-reproduction | 4 | 4 |
| 2026-10-07-compartment-control-and-activity | 15 | 4 |
| 2026-10-09-one-roadmap | 9 | 4 |
| 2026-10-10-copilot-talk-to-nexus | 4 | 4 |
| 2026-10-15-code-tab-run-state | 21 | 4 |
| 2026-10-15-one-contract-raid-releases | 12 | 4 |
| 2026-10-16-agent-work-funnel | 5 | 4 |
| 2026-10-16-mobile-compartments | 6 | 4 |
| nexus-repository-system-build | 8 | 4 |
| 2026-10-05-idea-to-spec-workshop | 7 | 3 |
| 2026-10-10-idearium-access | 8 | 3 |
| 2026-10-15-capability-specs-and-semantic-page-tree | 6 | 3 |
| 2026-10-15-fiverr-ledger | 5 | 3 |
| gemini-multiagent-coding | 5 | 3 |
| 2026-09-27-components-store-and-atlases | 7 | 2 |
| 2026-10-05-announce-pulse-repair | 5 | 2 |
| 2026-10-05-fiverr-guide | 2 | 2 |
| 2026-10-07-ollama-recorder | 5 | 2 |
| 2026-10-07-runtime-load | 6 | 2 |
| 2026-10-15-warp-builds-and-spec-framework | 14 | 2 |
| 2026-10-19-upload-intent-and-page-map | 18 | 2 |
| cortex-schema-registry | 9 | 2 |
| snapshot-trigger | 2 | 2 |
| 2026-08-22-session-full | 19 | 1 |
| 2026-09-29-tool-layers-and-pane-memory | 2 | 1 |
| 2026-09-30-idearium-coding-flow | 8 | 1 |
| 2026-10-13-gates-that-learn-and-priorities | 4 | 1 |
| 2026-10-16-canvas-compartments | 6 | 1 |
| copilot-omniscience | 8 | 1 |
| idearium-repository-overhaul | 13 | 1 |
| repair-contract-and-loom-hub | 11 | 1 |
| rich-atlas | 3 | 1 |

## ADDENDUM 2026-10-24 (0.60.228) — the bundle: one uuid, and the spec link
James, 2026-10-24: "need to either update existing or create new ones. then we could have each .spec bundled with each .phase with each .dag.
all with a id or uuid that matches them."
- Every `.phase` now carries `uuid` (one stable id per phase, from its map and id), and its `.graph` (the DAG) carries the same id as
  `phaseUuid`. Where a spec owns the phase, `specLink` names the spec and each module with the module's own `uuid`.
- "Update existing", measured: the existing specs declare 334 modules over 167 file paths; 70 of the 241 .spec files are not YAML and could
  not be read for links. A file identifies a phase's spec only when ONE module declares it and at most 5 phases name it (by the axioms:
  idearium/api/index.js is declared by 7 modules and named by 171 phases, so it identifies nothing). Result: **157 phases have a real spec
  link** (133 declared by the map, 24 discovered by a file one module owns). The other 1889 carry their uuid and DAG and have no spec to
  point at: those specs are to be written ("create new ones").
