# Phase census — 2026-10-15

James: "check all phases in nexus, over 1200, for any useful phases."

Method (deterministic, no model): every `docs/*.spec` read with loom's own parser (`loom/scanners/phasemap-map.js parsePhasemapText`), the same one the Phases tab uses. Scripts: scratchpad c2.js. Re-run it to refresh.

## Counts

- 262 spec files; 116 hold phases; **1472 phases**.
- By the parser's status: **595 done**, **872 pending**, 5 in-progress (the two new 2026-10-15 maps hold 30 of the pending).
- **250 pending phases name 2+ files that ALL exist on disk.** Either they are built and their status was never updated, or the files exist for another reason. Neither is known until each is checked; that check is GW23's job. Declared is not served, in both directions (§1.1).

## Ranked: pending phases that serve the pipeline

Score = pipeline words in the title and body + 1.5 per phase that depends on it. Top 45. `[files exist]` = see the 250 above.

| score | map | phase |
|---|---|---|
| 19.5 | 2026-09-02-nexus-vision-master | C1_copilot_spec_wizard |
| 16.5 | 2026-09-11-compartment-nodetype-and-reorg | C1_cli_per_system_split |
| 16.5 | 2026-09-28-graph-build-context-settings-memo | C1 [files exist] |
| 15.5 | 2026-10-12-request-spine | RQ9_the_chunked_contract |
| 14.5 | 2026-09-29-nex-node-store | N14_failure_mode_field |
| 14.0 | 2026-09-26-guardian-retry-novelty-and-instal | R1 [files exist] |
| 14.0 | 2026-10-15-one-contract-raid-releases | FR1_failure_reports |
| 14.0 | nexus-self-build-pipeline | SB3_guided_build_loop |
| 13.5 | 2026-09-02-agent-mesh-full-map | AM1_raid_intent_contracts_per_agent |
| 12.0 | 2026-09-11-sovereign-node-architecture | P1_fix_the_declared_living_maps |
| 12.0 | 2026-09-19-architect-blueprint-forge-ideariu | P1_reconcile_node_schema_precedent |
| 12.0 | 2026-09-19-cortex-to-intelligence-and-versio | P1_characterization |
| 12.0 | 2026-09-19-guardian-mesh-first-dispatch | P1_driver |
| 12.0 | 2026-10-09-one-model-engine | ME3_one_engine_one_budget [files exist] |
| 12.0 | 2026-10-12-request-spine | RQ24_the_gate_transaction |
| 12.0 | registry-consolidation | P1_consumer_side_on_hook_registry |
| 11.5 | 2026-09-11-sovereign-node-architecture | P2_per_system_interaction_contracts |
| 11.5 | 2026-09-19-cortex-to-intelligence-and-versio | P2_intelligence_gains_routes |
| 11.5 | 2026-10-12-request-spine | RQ21_the_contract_file_is_its_record [files exist] |
| 11.0 | 2026-09-02-nexus-vision-master | WF2_canvas_visual_pipeline |
| 11.0 | 2026-10-09-one-model-engine | ME1_one_failure_list |
| 11.0 | 2026-10-09-one-model-engine | ME5_one_chooser [files exist] |
| 10.5 | 2026-09-19-architect-blueprint-forge-ideariu | P2_decide_D1_D2_D3 |
| 10.5 | 2026-09-19-guardian-mesh-first-dispatch | P2_mesh_transport |
| 10.5 | 2026-09-26-guardian-retry-novelty-and-instal | T1 |
| 10.5 | 2026-09-29-nex-node-store | N15_contract_history |
| 10.5 | registry-consolidation | P2_wire_layer |
| 10.0 | 2026-09-02-nexus-vision-master | B2_chunk_contract_chaining |
| 10.0 | 2026-10-12-request-spine | RQ1_the_verifier_library |
| 10.0 | 2026-10-12-request-spine | RQ25_progress_is_evidence_not_activity [files exist] |
| 10.0 | nexus-sentinel | S1_cli_and_contract |
| 9.0 | 2026-09-02-agent-mesh-full-map | AM6_raid_contract_gate_before_dispatch |
| 9.0 | 2026-10-02-workshop-codex-rewind | RW1_rewind_engine_vm_snapshots |
| 9.0 | 2026-10-12-request-spine | RQ0_the_inventory_proved |
| 9.0 | 2026-10-12-request-spine | RQ7_the_context_obligations |
| 8.5 | 2026-10-12-request-spine | RQ11_spec_and_registry_reconciled [files exist] |
| 8.0 | 2026-09-02-nexus-vision-master | CG6_element_picker_to_listener_queue |
| 8.0 | 2026-09-02-nexus-vision-master | V9_precommit_gate_for_raid_contracts |
| 8.0 | 2026-09-11-compartment-nodetype-and-reorg | X1_node_decomposition_tool |
| 8.0 | 2026-09-26-guardian-retry-novelty-and-instal | N1 |
| 8.0 | 2026-09-28-staging-self-heal | S3 [files exist] |
| 8.0 | 2026-09-28-staging-self-heal | S6 [files exist] |
| 8.0 | 2026-10-05-build-from-the-spec | SB5_nexus_rebuilds_a_system_from_its_spec [files exist] |
| 8.0 | 2026-10-05-build-from-the-spec | SB9_the_spec_is_a_spec_file [files exist] |
| 8.0 | 2026-10-05-failure-reproduction | FM1_every_ledger_into_rfr2 [files exist] |

## Overlaps with the 2026-10-15 maps (so they are not built twice)

| new phase | already specced as | his words there |
|---|---|---|
| GW8 failure mode field | N14_failure_mode_field (nex-node-store), FR1_failure_reports | "failure mode field to map the trajectory of bugs and integrating the causal field and event ledger index" (2026-09-29) |
| GW3 contract traced | N15_contract_history, RQ21_the_contract_file_is_its_record | "each contract with a table of history, events, chat logs, everything correlating with the contract or job" (2026-09-29) |
| GW7 replay, GW16 branch | RS2_replay_rewind_branch | replay a macro byte-identical, no model; rewind to any step; branch from a step |
| GW11 snapshot per gate | RW1_rewind_engine_vm_snapshots | "the rewind engine for the entire state of the os, like vmware" (2026-10-02) |
| GW1 baton, GW2 | RQ24_the_gate_transaction, RQ3_repair_with_the_checks_own_words | a retry carries only the failing check output |
| CE10 lost-job fallback | R1 (guardian job-retry: classify tab errors, backoff, join in-flight) | not built; CE10 moves PROVIDER when nothing was typed, R1 retries the SAME tab |
| CE10 chain pick | ME5_one_chooser | RAID's _decide is the one chooser (§9.1); CE10 reuses the existing pipeline-routing chain until ME5 lands |

## Pending phases whose named files all exist (status to verify)

- **2026-10-05-build-from-the-spec** (25): SB5, SB9, SB6, SB4, SB24, SB26, SB8, SB10, SB14, SB18, SB20, SB21, SB27, BC3, SB19, SB23, SB25, SB29, SB13, SB15, SB22, SB7, SB11, SB47, SB48
- **2026-10-02-emerge-field-memory-build** (24): FM1, BT1, CB3, WS6, CF1, CB1, RC1, IN1, AC1, EM2, ST1, LB1, MS1, MR9, SH1, RD1, OT1, MR2, MR4, MR7, MR8, MR10, PR2, CL1
- **2026-10-01-idearium-agent-ready-master** (22): DT3, BK1, CP1, DT1, TP1, BK2, DT4, HC1, CX1, UM1, EN1, DK3, DK4, UI1, UI2, UI3, UI7, UI8, UI11, UI9, DI1, FT1
- **2026-10-12-browser-providers-and-work** (22): TB6, JB4, TB1, TB3, PV4, MX2, CS2, TB2, JB2, JB3, MX1, MX4, TB0, TB4, TB7, PV1, PV2, PV3, JB1, JB5, JB7, MX0
- **2026-09-28-graph-build-context-settings-memory** (15): C1, M1, G2, B0, B4, M0, M2, B1, G0, R2, SV0, M3, M5, L1, C2
- **2026-10-12-request-spine** (15): RQ21, RQ25, RQ11, RQ6, RQ23, RQ15, RQ27, RQ3, RQ12, RQ18, RQ13, RQ16, RQ19, RQ26, RQ20
- **2026-10-10-idearium-solid** (13): SD13, SD10, SD12, SD11, SD7, SD14, SD4, SD5, SD8, SD9, SD16, SD6, SD15
- **2026-10-13-projects-raid-and-gates** (12): RD2, RD0, RD1, PL5, RD4, RF2, RD3, RF0, WF0, PL1, PL6, LM0
- **2026-10-09-one-model-engine** (11): ME3, ME5, ME4, ME11, ME8, ME12, ME15, ME9, ME6, ME10, ME7
- **2026-10-10-shape-of-nexus** (8): EP2, LR0, LR1, CG3, TU1, CG1, CG2, SH2
- **2026-10-05-cli-data-code** (7): HG4, HG9, CL2, DS1, HG2, CT1, HG5
- **2026-10-05-cos-machines** (6): AP2, AP1, AP3, OS1, OS2, EL1
- **2026-09-28-staging-self-heal** (5): S3, S6, X1, S7, S4
- **2026-10-02-fractal-graph-any-size-agent** (5): WS5, FG6, FG5, FG2, UV1
- **2026-10-10-design-surface** (5): DS6, DS0, DS2, DS3, DS7
- **2026-10-01-work-visibility-job-reuse** (5): J1, J3, J4, J5, J6
- **2026-10-10-self-awareness** (5): AW4, AW2, AW3, AW1, AW0
- **2026-10-10-snapshot-compartments** (5): SN1, SN2, SN4, SN3, SN0
- **2026-09-26-guardian-retry-novelty-and-installs** (4): R1, N2, I1, E1
- **2026-10-05-verified-primitives** (4): VP6, VP3, VP5, VP2
- **2026-10-13-identities-tabs-and-automation** (4): MC2, ID3, HM0, NV1
- **2026-09-29-nex-node-store** (3): N26, N11, N16
- **2026-10-15-one-contract-raid-releases** (3): RD1, AT1, RN3
- **2026-10-05-idea-to-spec-workshop** (3): WK4, WK5, WK6
- **2026-10-07-compartment-control-and-activity** (3): UN1, SP1, DC1
- **2026-10-05-failure-reproduction** (2): FM1, FM4
- **2026-10-15-automatic-tracking** (2): RT2, CS1
- **2026-10-02-workshop-codex-rewind** (2): DP1, UI12
- **2026-10-09-one-roadmap** (2): OR4, OR5
- **2026-10-05-spec-workshop-rebuild** (2): RS4, RS8
- **2026-10-05-announce-pulse-repair** (2): PR5, PR4
- **2026-10-07-versionium-releases** (2): VR2, LT1
- **2026-09-30-idearium-coding-flow** (1): W7
- **2026-10-05-fiverr-guide** (1): FR2
