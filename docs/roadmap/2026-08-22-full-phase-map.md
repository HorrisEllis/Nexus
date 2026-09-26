# NEXUS Phase Map — Loom × Git × Phasemaps × Cortex
**Generated 2026-08-22, live from `loom/scanners/phasemap-map.js` — real data, not hand-compiled.**

## What this actually is

This is not a new system — it's the live output of a real, existing loom scanner
(`persistHistory()` / `loadAll()` / `forSystem()` / `historyFor()`) that already ties
together every piece you named:

- **Loom**: reads every `docs/*phasemap*.spec` file, extracts each declared phase
  (id, title, status, depends-on), tags it to the system(s) it concerns.
- **Git**: `persistHistory()` stamps every real status change with the actual commit
  hash of that phasemap file at the moment of the change (`_gitHashFor`) — verified
  live below, not assumed.
- **Phasemaps**: 24 real `.spec` files under `docs/`, 179 declared phases total.
- **Cortex**: phases aren't tracked *by* cortex — they're tracked *about* cortex, same
  as every other system, and cortex is where the resulting history actually lives
  (`phasemap_history` table, the exact table that's been loading on every boot all
  session). Cortex is both a subject in this map and its storage.

Run live just now: **179 phases checked, 0 changed** — meaning the last real run
already captured today's state; nothing has drifted since. A sample git-tied
transition, pulled directly, confirms the linkage is real:

```json
{
  "map": "agent-intelligence-loop-phasemap",
  "phaseId": "AP1_pull_toolbox",
  "status": "done",
  "priorStatus": null,
  "commitHash": "c21e9e777fe89e91654a7bec2e921981e719e123",
  "recordedAt": 1786986107115
}
```

## Totals

**179 phases across 24 phasemaps, 20 systems: 104 done, 5 in progress, 70 pending.**

| System | Total | Done | In Progress | Pending |
|---|---|---|---|---|
| agent | 64 | 32 | 3 | 29 |
| copilot | 60 | 39 | 2 | 19 |
| cortex | 58 | 37 | 1 | 20 |
| raid | 44 | 29 | 0 | 15 |
| loom | 37 | 20 | 0 | 17 |
| diagnostic | 22 | 16 | 0 | 6 |
| clear-glass | 19 | 8 | 2 | 9 |
| guardian | 18 | 8 | 1 | 9 |
| snapshot | 17 | 14 | 0 | 3 |
| gemini | 16 | 8 | 1 | 7 |
| intelligence | 15 | 7 | 0 | 8 |
| chunk | 12 | 5 | 1 | 6 |
| general | 11 | 8 | 0 | 3 |
| architect | 10 | 6 | 1 | 3 |
| bridge | 9 | 5 | 0 | 4 |
| replay | 6 | 6 | 0 | 0 |
| tablet | 5 | 3 | 0 | 2 |
| emerge | 4 | 1 | 0 | 3 |
| idearium | 3 | 1 | 1 | 1 |
| orchestrator | 3 | 1 | 1 | 1 |

*(A phase can be tagged to multiple systems, so column totals exceed 179.)*

## The 5 real, currently in-progress phases — system-wide

- **TX3_talk_to_agent_launcher** (`clearglass-agent-suite-and-cfr-loom-phasemap`)
- **GA3_guardian_userscript_capability_wiring** (`copilot-guardian-cos-expansion-phasemap`)
- **GA6_spec_builder_depth** (`copilot-guardian-cos-expansion-phasemap`)
- **GA9_cos_expansion_via_copilot** (`copilot-guardian-cos-expansion-phasemap`)
- **SS0_clear_clutter** (`nexus-system-standardization-phasemap`)

Worth naming directly: three of these five are the same phasemap
(`copilot-guardian-cos-expansion-phasemap`, GA3/GA6/GA9) — that file is where the
real, live edge of this whole system currently sits.

## How to keep this current going forward

This isn't a one-time report — call `persistHistory()` again any time (already run
live above) and it only writes what's genuinely changed since the last call, each
write git-hash-stamped automatically. `historyFor(map, phaseId)` gives the full,
ordered transition trail for any single phase. Nothing here needs to be re-built —
it needs to be *called*, which is what just happened.

---

## Full phase listing, by system

### agent  —  64 phases (32 done, 3 in progress, 29 pending)

- [ ] `agent-intelligence-loop-phasemap` :: **AP2_agent_events_to_intelligence** — AP2 agent events to intelligence
- [ ] `agent-intelligence-loop-phasemap` :: **AP3_strategy_dynamic_db** — AP3 strategy dynamic db
- [ ] `agent-intelligence-loop-phasemap` :: **AP4_intelligence_optimizes** — AP4 intelligence optimizes
- [ ] `agent-intelligence-loop-phasemap` :: **AP5_autonomous_build_loop** — AP5 autonomous build loop
- [ ] `agent-model-and-user-continuity-phasemap` :: **AM1_per_agent_learned_model** — AM1 per agent learned model
- [ ] `agent-model-and-user-continuity-phasemap` :: **AM2_incident_debrief** — AM2 incident debrief
- [ ] `agent-model-and-user-continuity-phasemap` :: **AM3_open_ended_grounded_conversation** — AM3 open ended grounded conversation
- [ ] `agent-model-and-user-continuity-phasemap` :: **AM5_ambiguity_triggered_pull** — AM5 ambiguity triggered pull
- [ ] `agent-model-and-user-continuity-phasemap` :: **AM6_perplexity_confidence_loop** — AM6 perplexity confidence loop
- [ ] `agent-model-and-user-continuity-phasemap` :: **AM7_agent_switch_continuity_and_chat_recall** — AM7 agent switch continuity and chat recall
- [ ] `agent-model-and-user-continuity-phasemap` :: **AM8_lifeline_as_general_channel_and_reasoning_upgrade** — AM8 lifeline as general channel and reasoning upgrade
- [ ] `agent-model-and-user-continuity-phasemap` :: **AM9_get_to_know_you_and_idea_capture** — AM9 get to know you and idea capture
- [ ] `clearglass-agent-suite-and-cfr-loom-phasemap` :: **TX1_clearglass_agent_suite_composition** — TX1 clearglass agent suite composition
- [ ] `clearglass-agent-suite-and-cfr-loom-phasemap` :: **TX4_provider_tab_tool_loop** — TX4 provider tab tool loop
- [ ] `clearglass-agent-suite-and-cfr-loom-phasemap` :: **TX10_component_registry_discipline** — TX10 component registry discipline
- [ ] `copilot-awareness-routing-phasemap` :: **CA7_clearglass_multi_account** — CA7 clearglass multi account
- [ ] `copilot-guardian-cos-expansion-phasemap` :: **GA4_lib_meta_as_cortex_tools** — GA4 lib meta as cortex tools
- [ ] `copilot-guardian-cos-expansion-phasemap` :: **GA7_clear_glass_guardian_userscript_expansion** — GA7 clear glass guardian userscript expansion
- [ ] `gemini-multiagent-coding-phasemap` :: **P3_line_block_seam_sync** — P3 line block seam sync
- [ ] `gemini-multiagent-coding-phasemap` :: **P4_structured_agent_to_agent** — P4 structured agent to agent
- [ ] `gemini-multiagent-coding-phasemap` :: **P5_autonomous_multiagent_loop** — P5 autonomous multiagent loop
- [ ] `nexus-architecture-rebuild-phasemap` :: **P22_scanner_hand_map_id_drift** — P22 scanner hand map id drift
- [ ] `nexus-self-build-pipeline-phasemap` :: **SB3_guided_build_loop** — SB3 guided build loop
- [ ] `nexus-self-build-pipeline-phasemap` :: **SB5_self_modification_from_inside** — SB5 self modification from inside
- [ ] `nexus-self-build-pipeline-phasemap` :: **SB8_tool_agnosticism_and_new_tool_flow** — SB8 tool agnosticism and new tool flow
- [ ] `raid-routing-fidelity-phasemap` :: **RR1_verify_and_wire_the_snr_fidelity_gate** — RR1 verify and wire the snr fidelity gate
- [ ] `raid-routing-fidelity-phasemap` :: **RR2_contract_based_chunking** — RR2 contract based chunking
- [ ] `raid-routing-fidelity-phasemap` :: **RR3_per_agent_config_in_cortex** — RR3 per agent config in cortex
- [ ] `raid-routing-fidelity-phasemap` :: **RR6_cortex_fitness_and_fluid_configs** — RR6 cortex fitness and fluid configs
- [ ] `clearglass-agent-suite-and-cfr-loom-phasemap` :: **TX3_talk_to_agent_launcher** — TX3 talk to agent launcher **← in progress**
- [ ] `copilot-guardian-cos-expansion-phasemap` :: **GA3_guardian_userscript_capability_wiring** — GA3 guardian userscript capability wiring **← in progress**
- [ ] `copilot-guardian-cos-expansion-phasemap` :: **GA6_spec_builder_depth** — GA6 spec builder depth **← in progress**
- [x] `agent-intelligence-loop-phasemap` :: **AP1_pull_toolbox** — AP1 pull toolbox
- [x] `clearglass-agent-suite-and-cfr-loom-phasemap` :: **TX5_backup_snapshot_for_talk_to_agent** — TX5 backup snapshot for talk to agent
- [x] `copilot-autonomous-phasemap` :: **CA1_scheduler** — CA1 scheduler
- [x] `copilot-autonomous-phasemap` :: **CA3_pipeline_chains** — CA3 pipeline chains
- [x] `copilot-autonomous-phasemap` :: **CA7_constant_autonomy** — CA7 constant autonomy
- [x] `copilot-awareness-routing-phasemap` :: **CA3_tool_first** — CA3 tool first
- [x] `copilot-awareness-routing-phasemap` :: **CA4_capability_extend** — CA4 capability extend
- [x] `copilot-awareness-routing-phasemap` :: **CA5_intent_routing** — CA5 intent routing
- [x] `copilot-awareness-routing-phasemap` :: **CA6_routing_config** — CA6 routing config
- [x] `copilot-full-capability-phasemap` :: **P1_cross_agent_recall** — P1 cross agent recall
- [x] `copilot-full-capability-phasemap` :: **P2_never_say_no_completion** — P2 never say no completion
- [x] `copilot-full-capability-phasemap` :: **P4_raid_snr_query_tool** — P4 raid snr query tool
- [x] `copilot-full-capability-phasemap` :: **P10_load_balancer** — P10 load balancer
- [x] `copilot-omniscience-phasemap` :: **P1_copilot_tool_loop** — P1 copilot tool loop
- [x] `copilot-omniscience-phasemap` :: **P4_guardian_tool_loop** — P4 guardian tool loop
- [x] `copilot-omniscience-phasemap` :: **P5_faculties_as_tools** — P5 faculties as tools
- [x] `gemini-multiagent-coding-phasemap` :: **P1_per_agent_contracts** — P1 per agent contracts
- [x] `gemini-multiagent-coding-phasemap` :: **P2_tree_parse_recall_injection** — P2 tree parse recall injection
- [x] `loom-phasemap-section-phasemap` :: **LP1_phasemap_scanner** — LP1 phasemap scanner
- [x] `nexus-architecture-rebuild-phasemap` :: **P8_hat_forge_command** — P8 hat forge command
- [x] `nexus-architecture-rebuild-phasemap` :: **P9_multi_agent_parallel_dispatch** — P9 multi agent parallel dispatch
- [x] `nexus-architecture-rebuild-phasemap` :: **P11_agent_council** — P11 agent council
- [x] `nexus-architecture-rebuild-phasemap` :: **P13_roundtable_shared_council_chat** — P13 roundtable shared council chat
- [x] `nexus-architecture-rebuild-phasemap` :: **P14_emergence_axioms_endstate** — P14 emergence axioms endstate
- [x] `nexus-live-mind-phasemap` :: **P6_copilot_programmable** — P6 copilot programmable
- [x] `raid-verification-spine-phasemap` :: **P1_raid_records_every_tool_decision** — P1 raid records every tool decision
- [x] `raid-verification-spine-phasemap` :: **P7_one_raid_verify_entrypoint** — P7 one raid verify entrypoint
- [x] `raid-warp-verification-phasemap` :: **P1_raid_records_every_decision** — P1 raid records every decision
- [x] `raid-warp-verification-phasemap` :: **P7_one_raid_verify_spine** — P7 one raid verify spine
- [x] `raid-warp-verification-phasemap` :: **P8_ui_as_copilot_tools** — P8 ui as copilot tools
- [x] `repair-contract-and-loom-hub-phasemap` :: **R3_autonomous_repair_trigger** — R3 autonomous repair trigger
- [x] `repair-contract-and-loom-hub-phasemap` :: **R10_relational_context_and_reuse** — R10 relational context and reuse

### copilot  —  60 phases (39 done, 2 in progress, 19 pending)

- [ ] `agent-model-and-user-continuity-phasemap` :: **AM2_incident_debrief** — AM2 incident debrief
- [ ] `agent-model-and-user-continuity-phasemap` :: **AM3_open_ended_grounded_conversation** — AM3 open ended grounded conversation
- [ ] `agent-model-and-user-continuity-phasemap` :: **AM4_full_user_continuity** — AM4 full user continuity
- [ ] `agent-model-and-user-continuity-phasemap` :: **AM5_ambiguity_triggered_pull** — AM5 ambiguity triggered pull
- [ ] `agent-model-and-user-continuity-phasemap` :: **AM8_lifeline_as_general_channel_and_reasoning_upgrade** — AM8 lifeline as general channel and reasoning upgrade
- [ ] `clearglass-agent-suite-and-cfr-loom-phasemap` :: **TX9_build_contract_file_dir** — TX9 build contract file dir
- [ ] `copilot-guardian-cos-expansion-phasemap` :: **GA4_lib_meta_as_cortex_tools** — GA4 lib meta as cortex tools
- [ ] `copilot-guardian-cos-expansion-phasemap` :: **GA7_clear_glass_guardian_userscript_expansion** — GA7 clear glass guardian userscript expansion
- [ ] `copilot-guardian-cos-expansion-phasemap` :: **GA10_copilot_capability_self_awareness** — GA10 copilot capability self awareness
- [ ] `copilot-omniscience-phasemap` :: **P4_gate_never_actually_verified** — P4 gate never actually verified
- [ ] `nexus-architecture-rebuild-phasemap` :: **P5_cockpit_to_copilot_control_surface** — P5 cockpit to copilot control surface
- [ ] `nexus-architecture-rebuild-phasemap` :: **P6_copilot_toasts** — P6 copilot toasts
- [ ] `nexus-architecture-rebuild-phasemap` :: **P21_loom_boundary_import_hooks** — P21 loom boundary import hooks
- [ ] `nexus-architecture-rebuild-phasemap` :: **P22_scanner_hand_map_id_drift** — P22 scanner hand map id drift
- [ ] `nexus-self-build-pipeline-phasemap` :: **SB2_universal_file_parse** — SB2 universal file parse
- [ ] `nexus-self-build-pipeline-phasemap` :: **SB3_guided_build_loop** — SB3 guided build loop
- [ ] `nexus-self-build-pipeline-phasemap` :: **SB4_decision_lattice_wiring** — SB4 decision lattice wiring
- [ ] `nexus-self-build-pipeline-phasemap` :: **SB5_self_modification_from_inside** — SB5 self modification from inside
- [ ] `nexus-self-build-pipeline-phasemap` :: **SB7_compartments_as_sessions** — SB7 compartments as sessions
- [ ] `copilot-guardian-cos-expansion-phasemap` :: **GA3_guardian_userscript_capability_wiring** — GA3 guardian userscript capability wiring **← in progress**
- [ ] `copilot-guardian-cos-expansion-phasemap` :: **GA9_cos_expansion_via_copilot** — GA9 cos expansion via copilot **← in progress**
- [x] `copilot-autonomous-phasemap` :: **CA1_scheduler** — CA1 scheduler
- [x] `copilot-autonomous-phasemap` :: **CA4_connections** — CA4 connections
- [x] `copilot-autonomous-phasemap` :: **CA5_system_control_and_clearglass** — CA5 system control and clearglass
- [x] `copilot-autonomous-phasemap` :: **CA6_self_building_commands** — CA6 self building commands
- [x] `copilot-autonomous-phasemap` :: **CA7_constant_autonomy** — CA7 constant autonomy
- [x] `copilot-awareness-routing-phasemap` :: **CA1_status_report** — CA1 status report
- [x] `copilot-awareness-routing-phasemap` :: **CA2_tool_self_awareness** — CA2 tool self awareness
- [x] `copilot-awareness-routing-phasemap` :: **CA3_tool_first** — CA3 tool first
- [x] `copilot-awareness-routing-phasemap` :: **CA4_capability_extend** — CA4 capability extend
- [x] `copilot-full-capability-phasemap` :: **P2_never_say_no_completion** — P2 never say no completion
- [x] `copilot-full-capability-phasemap` :: **P6_identity_naming** — P6 identity naming
- [x] `copilot-full-capability-phasemap` :: **P11_nexus_help_tool** — P11 nexus help tool
- [x] `copilot-guardian-cos-expansion-phasemap` :: **GA8_sse_announcements** — GA8 sse announcements
- [x] `copilot-omniscience-phasemap` :: **P1_copilot_tool_loop** — P1 copilot tool loop
- [x] `copilot-omniscience-phasemap` :: **P2_persistence_threaded** — P2 persistence threaded
- [x] `copilot-omniscience-phasemap` :: **P3_continuous_stream_to_copilot** — P3 continuous stream to copilot
- [x] `copilot-omniscience-phasemap` :: **P4_guardian_tool_loop** — P4 guardian tool loop
- [x] `copilot-omniscience-phasemap` :: **P5_faculties_as_tools** — P5 faculties as tools
- [x] `copilot-omniscience-phasemap` :: **P6_every_system_reachable** — P6 every system reachable
- [x] `copilot-omniscience-phasemap` :: **P7_stream_to_all_systems** — P7 stream to all systems
- [x] `cortex-schema-registry-phasemap` :: **UM2_query_on_every_path** — UM2 query on every path
- [x] `cortex-schema-registry-phasemap` :: **UM3_richer_capture** — UM3 richer capture
- [x] `cortex-schema-registry-phasemap` :: **UM4_editable_self_optimizing_surface** — UM4 editable self optimizing surface
- [x] `loom-phasemap-section-phasemap` :: **LP1_phasemap_scanner** — LP1 phasemap scanner
- [x] `nexus-architecture-rebuild-phasemap` :: **P4_forge_shell_rebuild** — P4 forge shell rebuild
- [x] `nexus-architecture-rebuild-phasemap` :: **P11_agent_council** — P11 agent council
- [x] `nexus-live-mind-phasemap` :: **P1_nervous_system_live** — P1 nervous system live
- [x] `nexus-live-mind-phasemap` :: **P4_copilot_awareness** — P4 copilot awareness
- [x] `nexus-live-mind-phasemap` :: **P5_copilot_dynamic_and_user_aware** — P5 copilot dynamic and user aware
- [x] `nexus-live-mind-phasemap` :: **P6_copilot_programmable** — P6 copilot programmable
- [x] `nexus-observability-tablet-phasemap` :: **OB5_tablet_modules** — OB5 tablet modules
- [x] `nexus-observability-tablet-phasemap` :: **OB6_continuous_ollama_injection** — OB6 continuous ollama injection
- [x] `nexus-observability-tablet-phasemap` :: **OB9_3d_visual_map** — OB9 3d visual map
- [x] `raid-warp-verification-phasemap` :: **P8_ui_as_copilot_tools** — P8 ui as copilot tools
- [x] `raid-warp-verification-phasemap` :: **P9_gated_events_to_copilot** — P9 gated events to copilot
- [x] `raid-warp-verification-phasemap` :: **P10_diagnose_and_notify** — P10 diagnose and notify
- [x] `raid-warp-verification-phasemap` :: **P11_diagnose_and_repair_on_prompt** — P11 diagnose and repair on prompt
- [x] `repair-contract-and-loom-hub-phasemap` :: **R3_autonomous_repair_trigger** — R3 autonomous repair trigger
- [x] `repair-contract-and-loom-hub-phasemap` :: **R8_ui_diagnostic_surfaces_wired_together** — R8 ui diagnostic surfaces wired together

### cortex  —  58 phases (37 done, 1 in progress, 20 pending)

- [ ] `agent-intelligence-loop-phasemap` :: **AP3_strategy_dynamic_db** — AP3 strategy dynamic db
- [ ] `agent-model-and-user-continuity-phasemap` :: **AM1_per_agent_learned_model** — AM1 per agent learned model
- [ ] `agent-model-and-user-continuity-phasemap` :: **AM4_full_user_continuity** — AM4 full user continuity
- [ ] `agent-model-and-user-continuity-phasemap` :: **AM5_ambiguity_triggered_pull** — AM5 ambiguity triggered pull
- [ ] `agent-model-and-user-continuity-phasemap` :: **AM6_perplexity_confidence_loop** — AM6 perplexity confidence loop
- [ ] `clearglass-agent-suite-and-cfr-loom-phasemap` :: **TX4_provider_tab_tool_loop** — TX4 provider tab tool loop
- [ ] `clearglass-agent-suite-and-cfr-loom-phasemap` :: **TX9_build_contract_file_dir** — TX9 build contract file dir
- [ ] `copilot-guardian-cos-expansion-phasemap` :: **GA4_lib_meta_as_cortex_tools** — GA4 lib meta as cortex tools
- [ ] `copilot-guardian-cos-expansion-phasemap` :: **GA10_copilot_capability_self_awareness** — GA10 copilot capability self awareness
- [ ] `cortex-schema-registry-phasemap` :: **P4_editable_surface** — P4 editable surface
- [ ] `cortex-schema-registry-phasemap` :: **P5_expectation_for_consumers** — P5 expectation for consumers
- [ ] `nexus-architecture-rebuild-phasemap` :: **P7_schema_based_persistence_system_wide** — P7 schema based persistence system wide
- [ ] `nexus-architecture-rebuild-phasemap` :: **P18_tv_ui_triage** — P18 tv ui triage
- [ ] `nexus-architecture-rebuild-phasemap` :: **P20_intelligence_reads_present_not_oldest** — P20 intelligence reads present not oldest
- [ ] `nexus-system-standardization-phasemap` :: **SS2_config_per_system** — SS2 config per system
- [ ] `nexus-system-standardization-phasemap` :: **SS4_full_logging_per_system** — SS4 full logging per system
- [ ] `nexus-system-standardization-phasemap` :: **SS6_dynamic_commands_and_cortex_data** — SS6 dynamic commands and cortex data
- [ ] `raid-routing-fidelity-phasemap` :: **RR1_verify_and_wire_the_snr_fidelity_gate** — RR1 verify and wire the snr fidelity gate
- [ ] `raid-routing-fidelity-phasemap` :: **RR3_per_agent_config_in_cortex** — RR3 per agent config in cortex
- [ ] `raid-routing-fidelity-phasemap` :: **RR6_cortex_fitness_and_fluid_configs** — RR6 cortex fitness and fluid configs
- [ ] `copilot-guardian-cos-expansion-phasemap` :: **GA3_guardian_userscript_capability_wiring** — GA3 guardian userscript capability wiring **← in progress**
- [x] `agent-intelligence-loop-phasemap` :: **AP1_pull_toolbox** — AP1 pull toolbox
- [x] `copilot-autonomous-phasemap` :: **CA1_scheduler** — CA1 scheduler
- [x] `copilot-autonomous-phasemap` :: **CA2_triggers_conditions** — CA2 triggers conditions
- [x] `copilot-autonomous-phasemap` :: **CA5_system_control_and_clearglass** — CA5 system control and clearglass
- [x] `copilot-autonomous-phasemap` :: **CA6_self_building_commands** — CA6 self building commands
- [x] `copilot-autonomous-phasemap` :: **CA7_constant_autonomy** — CA7 constant autonomy
- [x] `copilot-awareness-routing-phasemap` :: **CA5_intent_routing** — CA5 intent routing
- [x] `copilot-awareness-routing-phasemap` :: **CA6_routing_config** — CA6 routing config
- [x] `copilot-full-capability-phasemap` :: **P1_cross_agent_recall** — P1 cross agent recall
- [x] `copilot-guardian-cos-expansion-phasemap` :: **GA5_history_and_spec_integrity** — GA5 history and spec integrity
- [x] `copilot-omniscience-phasemap` :: **P2_persistence_threaded** — P2 persistence threaded
- [x] `copilot-omniscience-phasemap` :: **P3_continuous_stream_to_copilot** — P3 continuous stream to copilot
- [x] `cortex-schema-registry-phasemap` :: **P1_schema_table_in_cortex** — P1 schema table in cortex
- [x] `cortex-schema-registry-phasemap` :: **P2_conformance_check_lib** — P2 conformance check lib
- [x] `cortex-schema-registry-phasemap` :: **P3_observe_on_write_no_block** — P3 observe on write no block
- [x] `cortex-schema-registry-phasemap` :: **UM2_query_on_every_path** — UM2 query on every path
- [x] `cortex-schema-registry-phasemap` :: **UM3_richer_capture** — UM3 richer capture
- [x] `cortex-schema-registry-phasemap` :: **UM4_editable_self_optimizing_surface** — UM4 editable self optimizing surface
- [x] `gemini-multiagent-coding-phasemap` :: **P2_tree_parse_recall_injection** — P2 tree parse recall injection
- [x] `loom-phasemap-section-phasemap` :: **LP1_phasemap_scanner** — LP1 phasemap scanner
- [x] `loom-phasemap-section-phasemap` :: **LP2_split_by_system** — LP2 split by system
- [x] `nexus-architecture-rebuild-phasemap` :: **P12_fault_logging_first_class** — P12 fault logging first class
- [x] `nexus-live-mind-phasemap` :: **P1_nervous_system_live** — P1 nervous system live
- [x] `nexus-live-mind-phasemap` :: **P3_diagnostic_kernel** — P3 diagnostic kernel
- [x] `nexus-live-mind-phasemap` :: **P4_copilot_awareness** — P4 copilot awareness
- [x] `nexus-live-mind-phasemap` :: **P5_copilot_dynamic_and_user_aware** — P5 copilot dynamic and user aware
- [x] `nexus-observability-tablet-phasemap` :: **OB2_gap_detection_diagnostic** — OB2 gap detection diagnostic
- [x] `nexus-observability-tablet-phasemap` :: **OB5_tablet_modules** — OB5 tablet modules
- [x] `nexus-observability-tablet-phasemap` :: **OB7_intelligence_optimization** — OB7 intelligence optimization
- [x] `nexus-observability-tablet-phasemap` :: **OB8_pattern_leverage_ratio** — OB8 pattern leverage ratio
- [x] `raid-warp-verification-phasemap` :: **P1_raid_records_every_decision** — P1 raid records every decision
- [x] `repair-contract-and-loom-hub-phasemap` :: **R0_phasemap_history_in_cortex** — R0 phasemap history in cortex
- [x] `repair-contract-and-loom-hub-phasemap` :: **R2_real_snapshot_rollback** — R2 real snapshot rollback
- [x] `repair-contract-and-loom-hub-phasemap` :: **R4_loom_ledger_awareness** — R4 loom ledger awareness
- [x] `repair-contract-and-loom-hub-phasemap` :: **R6_living_documentation** — R6 living documentation
- [x] `repair-contract-and-loom-hub-phasemap` :: **R7_fault_taxonomy_reconnection** — R7 fault taxonomy reconnection
- [x] `repair-contract-and-loom-hub-phasemap` :: **R10_relational_context_and_reuse** — R10 relational context and reuse

### raid  —  44 phases (29 done, 0 in progress, 15 pending)

- [ ] `agent-intelligence-loop-phasemap` :: **AP5_autonomous_build_loop** — AP5 autonomous build loop
- [ ] `agent-model-and-user-continuity-phasemap` :: **AM2_incident_debrief** — AM2 incident debrief
- [ ] `agent-model-and-user-continuity-phasemap` :: **AM7_agent_switch_continuity_and_chat_recall** — AM7 agent switch continuity and chat recall
- [ ] `cortex-schema-registry-phasemap` :: **P4_editable_surface** — P4 editable surface
- [ ] `cortex-schema-registry-phasemap` :: **P5_expectation_for_consumers** — P5 expectation for consumers
- [ ] `gemini-multiagent-coding-phasemap` :: **P5_autonomous_multiagent_loop** — P5 autonomous multiagent loop
- [ ] `nexus-architecture-rebuild-phasemap` :: **P6_copilot_toasts** — P6 copilot toasts
- [ ] `nexus-architecture-rebuild-phasemap` :: **P7_schema_based_persistence_system_wide** — P7 schema based persistence system wide
- [ ] `nexus-self-build-pipeline-phasemap` :: **SB3_guided_build_loop** — SB3 guided build loop
- [ ] `nexus-self-build-pipeline-phasemap` :: **SB4_decision_lattice_wiring** — SB4 decision lattice wiring
- [ ] `nexus-system-standardization-phasemap` :: **SS5_diagnostics_reads_and_fixes** — SS5 diagnostics reads and fixes
- [ ] `nexus-system-standardization-phasemap` :: **SS6_dynamic_commands_and_cortex_data** — SS6 dynamic commands and cortex data
- [ ] `raid-routing-fidelity-phasemap` :: **RR1_verify_and_wire_the_snr_fidelity_gate** — RR1 verify and wire the snr fidelity gate
- [ ] `raid-routing-fidelity-phasemap` :: **RR2_contract_based_chunking** — RR2 contract based chunking
- [ ] `raid-routing-fidelity-phasemap` :: **RR4_governed_handshake_on_handoff** — RR4 governed handshake on handoff
- [x] `agent-intelligence-loop-phasemap` :: **AP1_pull_toolbox** — AP1 pull toolbox
- [x] `copilot-autonomous-phasemap` :: **CA1_scheduler** — CA1 scheduler
- [x] `copilot-autonomous-phasemap` :: **CA2_triggers_conditions** — CA2 triggers conditions
- [x] `copilot-autonomous-phasemap` :: **CA3_pipeline_chains** — CA3 pipeline chains
- [x] `copilot-autonomous-phasemap` :: **CA4_connections** — CA4 connections
- [x] `copilot-autonomous-phasemap` :: **CA5_system_control_and_clearglass** — CA5 system control and clearglass
- [x] `copilot-autonomous-phasemap` :: **CA7_constant_autonomy** — CA7 constant autonomy
- [x] `copilot-full-capability-phasemap` :: **P4_raid_snr_query_tool** — P4 raid snr query tool
- [x] `copilot-full-capability-phasemap` :: **P10_load_balancer** — P10 load balancer
- [x] `cortex-schema-registry-phasemap` :: **P1_schema_table_in_cortex** — P1 schema table in cortex
- [x] `gemini-multiagent-coding-phasemap` :: **P1_per_agent_contracts** — P1 per agent contracts
- [x] `loom-phasemap-section-phasemap` :: **LP1_phasemap_scanner** — LP1 phasemap scanner
- [x] `loom-phasemap-section-phasemap` :: **LP2_split_by_system** — LP2 split by system
- [x] `nexus-architecture-rebuild-phasemap` :: **P9_multi_agent_parallel_dispatch** — P9 multi agent parallel dispatch
- [x] `nexus-architecture-rebuild-phasemap` :: **P11_agent_council** — P11 agent council
- [x] `nexus-live-mind-phasemap` :: **P6_copilot_programmable** — P6 copilot programmable
- [x] `raid-verification-spine-phasemap` :: **P1_raid_records_every_tool_decision** — P1 raid records every tool decision
- [x] `raid-verification-spine-phasemap` :: **P2_constitution_on_the_approve_path** — P2 constitution on the approve path
- [x] `raid-verification-spine-phasemap` :: **P3_isolate_and_verify_via_cos** — P3 isolate and verify via cos
- [x] `raid-verification-spine-phasemap` :: **P4_sigma_and_drift_scoring** — P4 sigma and drift scoring
- [x] `raid-verification-spine-phasemap` :: **P5_compare_contract_vs_output** — P5 compare contract vs output
- [x] `raid-verification-spine-phasemap` :: **P6_rewind_on_fail** — P6 rewind on fail
- [x] `raid-verification-spine-phasemap` :: **P7_one_raid_verify_entrypoint** — P7 one raid verify entrypoint
- [x] `raid-warp-verification-phasemap` :: **P1_raid_records_every_decision** — P1 raid records every decision
- [x] `raid-warp-verification-phasemap` :: **P4_sigma_drift_score** — P4 sigma drift score
- [x] `raid-warp-verification-phasemap` :: **P6_rewind_on_fail** — P6 rewind on fail
- [x] `raid-warp-verification-phasemap` :: **P7_one_raid_verify_spine** — P7 one raid verify spine
- [x] `raid-warp-verification-phasemap` :: **P11_diagnose_and_repair_on_prompt** — P11 diagnose and repair on prompt
- [x] `repair-contract-and-loom-hub-phasemap` :: **R3_autonomous_repair_trigger** — R3 autonomous repair trigger

### loom  —  37 phases (20 done, 0 in progress, 17 pending)

- [ ] `clearglass-agent-suite-and-cfr-loom-phasemap` :: **TX4_provider_tab_tool_loop** — TX4 provider tab tool loop
- [ ] `clearglass-agent-suite-and-cfr-loom-phasemap` :: **TX7_cfr_diagnostic_for_loom** — TX7 cfr diagnostic for loom
- [ ] `clearglass-agent-suite-and-cfr-loom-phasemap` :: **TX8_3d_cfr_visual_for_loom** — TX8 3d cfr visual for loom
- [ ] `clearglass-agent-suite-and-cfr-loom-phasemap` :: **TX10_component_registry_discipline** — TX10 component registry discipline
- [ ] `loom-phasemap-section-phasemap` :: **LP3_loom_section** — LP3 loom section
- [ ] `nexus-architecture-rebuild-phasemap` :: **P15_forge_shell_into_loom** — P15 forge shell into loom
- [ ] `nexus-architecture-rebuild-phasemap` :: **P16_architect_node_canvas_in_loom** — P16 architect node canvas in loom
- [ ] `nexus-architecture-rebuild-phasemap` :: **P17_blueprint_builder_onto_canvas** — P17 blueprint builder onto canvas
- [ ] `nexus-architecture-rebuild-phasemap` :: **P18_tv_ui_triage** — P18 tv ui triage
- [ ] `nexus-architecture-rebuild-phasemap` :: **P21_loom_boundary_import_hooks** — P21 loom boundary import hooks
- [ ] `nexus-self-build-pipeline-phasemap` :: **SB5_self_modification_from_inside** — SB5 self modification from inside
- [ ] `nexus-system-standardization-phasemap` :: **SS1_system_manifest** — SS1 system manifest
- [ ] `nexus-system-standardization-phasemap` :: **SS2_config_per_system** — SS2 config per system
- [ ] `nexus-system-standardization-phasemap` :: **SS6_dynamic_commands_and_cortex_data** — SS6 dynamic commands and cortex data
- [ ] `nexus-system-standardization-phasemap` :: **SS7_decoupling_audit** — SS7 decoupling audit
- [ ] `raid-routing-fidelity-phasemap` :: **RR3_per_agent_config_in_cortex** — RR3 per agent config in cortex
- [ ] `raid-routing-fidelity-phasemap` :: **RR6_cortex_fitness_and_fluid_configs** — RR6 cortex fitness and fluid configs
- [x] `agent-intelligence-loop-phasemap` :: **AP1_pull_toolbox** — AP1 pull toolbox
- [x] `copilot-autonomous-phasemap` :: **CA6_self_building_commands** — CA6 self building commands
- [x] `copilot-awareness-routing-phasemap` :: **CA1_status_report** — CA1 status report
- [x] `copilot-guardian-cos-expansion-phasemap` :: **GA5_history_and_spec_integrity** — GA5 history and spec integrity
- [x] `loom-phasemap-section-phasemap` :: **LP1_phasemap_scanner** — LP1 phasemap scanner
- [x] `loom-phasemap-section-phasemap` :: **LP2_split_by_system** — LP2 split by system
- [x] `nexus-architecture-rebuild-phasemap` :: **P1_dangling_hook_flood** — P1 dangling hook flood
- [x] `nexus-architecture-rebuild-phasemap` :: **P4_forge_shell_rebuild** — P4 forge shell rebuild
- [x] `nexus-live-mind-phasemap` :: **P3_diagnostic_kernel** — P3 diagnostic kernel
- [x] `nexus-live-mind-phasemap` :: **P4_copilot_awareness** — P4 copilot awareness
- [x] `nexus-observability-tablet-phasemap` :: **OB5_tablet_modules** — OB5 tablet modules
- [x] `nexus-observability-tablet-phasemap` :: **OB10_sigma_role_intent_map** — OB10 sigma role intent map
- [x] `nexus-observability-tablet-phasemap` :: **OB11_edge_case_mapping** — OB11 edge case mapping
- [x] `nexus-self-build-pipeline-phasemap` :: **SB1_schema_extension** — SB1 schema extension
- [x] `repair-contract-and-loom-hub-phasemap` :: **R0_phasemap_history_in_cortex** — R0 phasemap history in cortex
- [x] `repair-contract-and-loom-hub-phasemap` :: **R3_autonomous_repair_trigger** — R3 autonomous repair trigger
- [x] `repair-contract-and-loom-hub-phasemap` :: **R4_loom_ledger_awareness** — R4 loom ledger awareness
- [x] `repair-contract-and-loom-hub-phasemap` :: **R5_loom_visual_map** — R5 loom visual map
- [x] `repair-contract-and-loom-hub-phasemap` :: **R6_living_documentation** — R6 living documentation
- [x] `repair-contract-and-loom-hub-phasemap` :: **R10_relational_context_and_reuse** — R10 relational context and reuse

### diagnostic  —  22 phases (16 done, 0 in progress, 6 pending)

- [ ] `clearglass-agent-suite-and-cfr-loom-phasemap` :: **TX7_cfr_diagnostic_for_loom** — TX7 cfr diagnostic for loom
- [ ] `nexus-architecture-rebuild-phasemap` :: **P18_tv_ui_triage** — P18 tv ui triage
- [ ] `nexus-architecture-rebuild-phasemap` :: **P21_loom_boundary_import_hooks** — P21 loom boundary import hooks
- [ ] `nexus-system-standardization-phasemap` :: **SS1_system_manifest** — SS1 system manifest
- [ ] `nexus-system-standardization-phasemap` :: **SS5_diagnostics_reads_and_fixes** — SS5 diagnostics reads and fixes
- [ ] `snapshot-trigger-phasemap` :: **SS2_snapshot_in_diagnostics** — SS2 snapshot in diagnostics
- [x] `copilot-guardian-cos-expansion-phasemap` :: **GA2_diagnostic_system_depth** — GA2 diagnostic system depth
- [x] `nexus-architecture-rebuild-phasemap` :: **P1_dangling_hook_flood** — P1 dangling hook flood
- [x] `nexus-live-mind-phasemap` :: **P3_diagnostic_kernel** — P3 diagnostic kernel
- [x] `nexus-live-mind-phasemap` :: **P4_copilot_awareness** — P4 copilot awareness
- [x] `nexus-observability-tablet-phasemap` :: **OB1_live_diagnostics** — OB1 live diagnostics
- [x] `nexus-observability-tablet-phasemap` :: **OB2_gap_detection_diagnostic** — OB2 gap detection diagnostic
- [x] `nexus-observability-tablet-phasemap` :: **OB5_tablet_modules** — OB5 tablet modules
- [x] `nexus-observability-tablet-phasemap` :: **OB6_continuous_ollama_injection** — OB6 continuous ollama injection
- [x] `nexus-observability-tablet-phasemap` :: **OB7_intelligence_optimization** — OB7 intelligence optimization
- [x] `nexus-observability-tablet-phasemap` :: **OB11_edge_case_mapping** — OB11 edge case mapping
- [x] `repair-contract-and-loom-hub-phasemap` :: **R1_repair_contract_schema** — R1 repair contract schema
- [x] `repair-contract-and-loom-hub-phasemap` :: **R4_loom_ledger_awareness** — R4 loom ledger awareness
- [x] `repair-contract-and-loom-hub-phasemap` :: **R6_living_documentation** — R6 living documentation
- [x] `repair-contract-and-loom-hub-phasemap` :: **R7_fault_taxonomy_reconnection** — R7 fault taxonomy reconnection
- [x] `repair-contract-and-loom-hub-phasemap` :: **R8_ui_diagnostic_surfaces_wired_together** — R8 ui diagnostic surfaces wired together
- [x] `repair-contract-and-loom-hub-phasemap` :: **R10_relational_context_and_reuse** — R10 relational context and reuse

### clear-glass  —  19 phases (8 done, 2 in progress, 9 pending)

- [ ] `clearglass-agent-suite-and-cfr-loom-phasemap` :: **TX1_clearglass_agent_suite_composition** — TX1 clearglass agent suite composition
- [ ] `clearglass-agent-suite-and-cfr-loom-phasemap` :: **TX2_sequential_event_queue** — TX2 sequential event queue
- [ ] `clearglass-agent-suite-and-cfr-loom-phasemap` :: **TX6_stop_using_this_chat_migration** — TX6 stop using this chat migration
- [ ] `copilot-awareness-routing-phasemap` :: **CA7_clearglass_multi_account** — CA7 clearglass multi account
- [ ] `copilot-guardian-cos-expansion-phasemap` :: **GA1_guardian_nexus_reconciliation** — GA1 guardian nexus reconciliation
- [ ] `copilot-guardian-cos-expansion-phasemap` :: **GA7_clear_glass_guardian_userscript_expansion** — GA7 clear glass guardian userscript expansion
- [ ] `nexus-self-build-pipeline-phasemap` :: **SB9_full_clearglass_control** — SB9 full clearglass control
- [ ] `raid-routing-fidelity-phasemap` :: **RR4_governed_handshake_on_handoff** — RR4 governed handshake on handoff
- [ ] `raid-routing-fidelity-phasemap` :: **RR5_clearglass_accounts_and_features** — RR5 clearglass accounts and features
- [ ] `clearglass-agent-suite-and-cfr-loom-phasemap` :: **TX3_talk_to_agent_launcher** — TX3 talk to agent launcher **← in progress**
- [ ] `copilot-guardian-cos-expansion-phasemap` :: **GA3_guardian_userscript_capability_wiring** — GA3 guardian userscript capability wiring **← in progress**
- [x] `copilot-autonomous-phasemap` :: **CA5_system_control_and_clearglass** — CA5 system control and clearglass
- [x] `copilot-awareness-routing-phasemap` :: **CA6_routing_config** — CA6 routing config
- [x] `copilot-full-capability-phasemap` :: **P5_clear_glass_url_tools** — P5 clear glass url tools
- [x] `copilot-full-capability-phasemap` :: **P7_continuous_nerve_dom_to_ollama** — P7 continuous nerve dom to ollama
- [x] `copilot-full-capability-phasemap` :: **P8_rewind_replay_tool** — P8 rewind replay tool
- [x] `loom-phasemap-section-phasemap` :: **LP1_phasemap_scanner** — LP1 phasemap scanner
- [x] `nexus-live-mind-phasemap` :: **P6_copilot_programmable** — P6 copilot programmable
- [x] `repair-contract-and-loom-hub-phasemap` :: **R8_ui_diagnostic_surfaces_wired_together** — R8 ui diagnostic surfaces wired together

### guardian  —  18 phases (8 done, 1 in progress, 9 pending)

- [ ] `clearglass-agent-suite-and-cfr-loom-phasemap` :: **TX7_cfr_diagnostic_for_loom** — TX7 cfr diagnostic for loom
- [ ] `copilot-guardian-cos-expansion-phasemap` :: **GA1_guardian_nexus_reconciliation** — GA1 guardian nexus reconciliation
- [ ] `copilot-guardian-cos-expansion-phasemap` :: **GA4_lib_meta_as_cortex_tools** — GA4 lib meta as cortex tools
- [ ] `copilot-guardian-cos-expansion-phasemap` :: **GA7_clear_glass_guardian_userscript_expansion** — GA7 clear glass guardian userscript expansion
- [ ] `copilot-omniscience-phasemap` :: **P4_gate_never_actually_verified** — P4 gate never actually verified
- [ ] `nexus-architecture-rebuild-phasemap` :: **P18_tv_ui_triage** — P18 tv ui triage
- [ ] `nexus-system-standardization-phasemap` :: **SS1_system_manifest** — SS1 system manifest
- [ ] `nexus-system-standardization-phasemap` :: **SS2_config_per_system** — SS2 config per system
- [ ] `raid-routing-fidelity-phasemap` :: **RR4_governed_handshake_on_handoff** — RR4 governed handshake on handoff
- [ ] `copilot-guardian-cos-expansion-phasemap` :: **GA3_guardian_userscript_capability_wiring** — GA3 guardian userscript capability wiring **← in progress**
- [x] `copilot-awareness-routing-phasemap` :: **CA2_tool_self_awareness** — CA2 tool self awareness
- [x] `copilot-awareness-routing-phasemap` :: **CA3_tool_first** — CA3 tool first
- [x] `copilot-full-capability-phasemap` :: **P1_cross_agent_recall** — P1 cross agent recall
- [x] `copilot-omniscience-phasemap` :: **P3_continuous_stream_to_copilot** — P3 continuous stream to copilot
- [x] `copilot-omniscience-phasemap` :: **P4_guardian_tool_loop** — P4 guardian tool loop
- [x] `copilot-omniscience-phasemap` :: **P7_stream_to_all_systems** — P7 stream to all systems
- [x] `loom-phasemap-section-phasemap` :: **LP1_phasemap_scanner** — LP1 phasemap scanner
- [x] `nexus-architecture-rebuild-phasemap` :: **P12_fault_logging_first_class** — P12 fault logging first class

### snapshot  —  17 phases (14 done, 0 in progress, 3 pending)

- [ ] `nexus-system-standardization-phasemap` :: **SS5_diagnostics_reads_and_fixes** — SS5 diagnostics reads and fixes
- [ ] `snapshot-trigger-phasemap` :: **SS1_drift_triggered_snapshot** — SS1 drift triggered snapshot
- [ ] `snapshot-trigger-phasemap` :: **SS2_snapshot_in_diagnostics** — SS2 snapshot in diagnostics
- [x] `clearglass-agent-suite-and-cfr-loom-phasemap` :: **TX5_backup_snapshot_for_talk_to_agent** — TX5 backup snapshot for talk to agent
- [x] `copilot-full-capability-phasemap` :: **P8_rewind_replay_tool** — P8 rewind replay tool
- [x] `nexus-architecture-rebuild-phasemap` :: **P10_safe_apply_verify_before_merge** — P10 safe apply verify before merge
- [x] `nexus-live-mind-phasemap` :: **P2_snapshot_on_sigma** — P2 snapshot on sigma
- [x] `nexus-observability-tablet-phasemap` :: **OB1_live_diagnostics** — OB1 live diagnostics
- [x] `nexus-observability-tablet-phasemap` :: **OB5_tablet_modules** — OB5 tablet modules
- [x] `raid-verification-spine-phasemap` :: **P6_rewind_on_fail** — P6 rewind on fail
- [x] `raid-verification-spine-phasemap` :: **P7_one_raid_verify_entrypoint** — P7 one raid verify entrypoint
- [x] `raid-warp-verification-phasemap` :: **P6_rewind_on_fail** — P6 rewind on fail
- [x] `raid-warp-verification-phasemap` :: **P7_one_raid_verify_spine** — P7 one raid verify spine
- [x] `repair-contract-and-loom-hub-phasemap` :: **R1_repair_contract_schema** — R1 repair contract schema
- [x] `repair-contract-and-loom-hub-phasemap` :: **R2_real_snapshot_rollback** — R2 real snapshot rollback
- [x] `repair-contract-and-loom-hub-phasemap` :: **R3_autonomous_repair_trigger** — R3 autonomous repair trigger
- [x] `repair-contract-and-loom-hub-phasemap` :: **R5_loom_visual_map** — R5 loom visual map

### gemini  —  16 phases (8 done, 1 in progress, 7 pending)

- [ ] `agent-model-and-user-continuity-phasemap` :: **AM1_per_agent_learned_model** — AM1 per agent learned model
- [ ] `clearglass-agent-suite-and-cfr-loom-phasemap` :: **TX1_clearglass_agent_suite_composition** — TX1 clearglass agent suite composition
- [ ] `copilot-awareness-routing-phasemap` :: **CA7_clearglass_multi_account** — CA7 clearglass multi account
- [ ] `gemini-multiagent-coding-phasemap` :: **P3_line_block_seam_sync** — P3 line block seam sync
- [ ] `gemini-multiagent-coding-phasemap` :: **P4_structured_agent_to_agent** — P4 structured agent to agent
- [ ] `raid-routing-fidelity-phasemap` :: **RR2_contract_based_chunking** — RR2 contract based chunking
- [ ] `raid-routing-fidelity-phasemap` :: **RR3_per_agent_config_in_cortex** — RR3 per agent config in cortex
- [ ] `clearglass-agent-suite-and-cfr-loom-phasemap` :: **TX3_talk_to_agent_launcher** — TX3 talk to agent launcher **← in progress**
- [x] `copilot-awareness-routing-phasemap` :: **CA4_capability_extend** — CA4 capability extend
- [x] `copilot-awareness-routing-phasemap` :: **CA5_intent_routing** — CA5 intent routing
- [x] `copilot-full-capability-phasemap` :: **P1_cross_agent_recall** — P1 cross agent recall
- [x] `copilot-omniscience-phasemap` :: **P4_guardian_tool_loop** — P4 guardian tool loop
- [x] `gemini-multiagent-coding-phasemap` :: **P1_per_agent_contracts** — P1 per agent contracts
- [x] `gemini-multiagent-coding-phasemap` :: **P2_tree_parse_recall_injection** — P2 tree parse recall injection
- [x] `loom-phasemap-section-phasemap` :: **LP1_phasemap_scanner** — LP1 phasemap scanner
- [x] `nexus-architecture-rebuild-phasemap` :: **P8_hat_forge_command** — P8 hat forge command

### intelligence  —  15 phases (7 done, 0 in progress, 8 pending)

- [ ] `agent-intelligence-loop-phasemap` :: **AP2_agent_events_to_intelligence** — AP2 agent events to intelligence
- [ ] `agent-intelligence-loop-phasemap` :: **AP4_intelligence_optimizes** — AP4 intelligence optimizes
- [ ] `agent-model-and-user-continuity-phasemap` :: **AM1_per_agent_learned_model** — AM1 per agent learned model
- [ ] `agent-model-and-user-continuity-phasemap` :: **AM5_ambiguity_triggered_pull** — AM5 ambiguity triggered pull
- [ ] `agent-model-and-user-continuity-phasemap` :: **AM6_perplexity_confidence_loop** — AM6 perplexity confidence loop
- [ ] `nexus-architecture-rebuild-phasemap` :: **P7_schema_based_persistence_system_wide** — P7 schema based persistence system wide
- [ ] `nexus-architecture-rebuild-phasemap` :: **P20_intelligence_reads_present_not_oldest** — P20 intelligence reads present not oldest
- [ ] `raid-routing-fidelity-phasemap` :: **RR6_cortex_fitness_and_fluid_configs** — RR6 cortex fitness and fluid configs
- [x] `copilot-autonomous-phasemap` :: **CA7_constant_autonomy** — CA7 constant autonomy
- [x] `copilot-guardian-cos-expansion-phasemap` :: **GA2_diagnostic_system_depth** — GA2 diagnostic system depth
- [x] `nexus-live-mind-phasemap` :: **P1_nervous_system_live** — P1 nervous system live
- [x] `nexus-live-mind-phasemap` :: **P3_diagnostic_kernel** — P3 diagnostic kernel
- [x] `nexus-live-mind-phasemap` :: **P4_copilot_awareness** — P4 copilot awareness
- [x] `nexus-observability-tablet-phasemap` :: **OB6_continuous_ollama_injection** — OB6 continuous ollama injection
- [x] `nexus-observability-tablet-phasemap` :: **OB7_intelligence_optimization** — OB7 intelligence optimization

### chunk  —  12 phases (5 done, 1 in progress, 6 pending)

- [ ] `agent-intelligence-loop-phasemap` :: **AP3_strategy_dynamic_db** — AP3 strategy dynamic db
- [ ] `agent-model-and-user-continuity-phasemap` :: **AM5_ambiguity_triggered_pull** — AM5 ambiguity triggered pull
- [ ] `gemini-multiagent-coding-phasemap` :: **P3_line_block_seam_sync** — P3 line block seam sync
- [ ] `raid-routing-fidelity-phasemap` :: **RR2_contract_based_chunking** — RR2 contract based chunking
- [ ] `raid-routing-fidelity-phasemap` :: **RR4_governed_handshake_on_handoff** — RR4 governed handshake on handoff
- [ ] `raid-routing-fidelity-phasemap` :: **RR6_cortex_fitness_and_fluid_configs** — RR6 cortex fitness and fluid configs
- [ ] `copilot-guardian-cos-expansion-phasemap` :: **GA6_spec_builder_depth** — GA6 spec builder depth **← in progress**
- [x] `agent-intelligence-loop-phasemap` :: **AP1_pull_toolbox** — AP1 pull toolbox
- [x] `copilot-awareness-routing-phasemap` :: **CA4_capability_extend** — CA4 capability extend
- [x] `copilot-awareness-routing-phasemap` :: **CA5_intent_routing** — CA5 intent routing
- [x] `gemini-multiagent-coding-phasemap` :: **P1_per_agent_contracts** — P1 per agent contracts
- [x] `repair-contract-and-loom-hub-phasemap` :: **R3_autonomous_repair_trigger** — R3 autonomous repair trigger

### general  —  11 phases (8 done, 0 in progress, 3 pending)

- [ ] `agent-model-and-user-continuity-phasemap` :: **AM10_thinking_partner_rename_and_ui_builder** — AM10 thinking partner rename and ui builder
- [ ] `nexus-architecture-rebuild-phasemap` :: **P3_remaining_dangling_hooks** — P3 remaining dangling hooks
- [ ] `nexus-self-build-pipeline-phasemap` :: **SB6_contract_type_schemas_and_toolbox_directory** — SB6 contract type schemas and toolbox directory
- [x] `copilot-full-capability-phasemap` :: **P3_cos_toolkit_tools** — P3 cos toolkit tools
- [x] `copilot-full-capability-phasemap` :: **P9_meta_systems_toolkit** — P9 meta systems toolkit
- [x] `cortex-schema-registry-phasemap` :: **UM1_schema_for_user_model** — UM1 schema for user model
- [x] `nexus-architecture-rebuild-phasemap` :: **P2_autopilot_spawn_crash** — P2 autopilot spawn crash
- [x] `nexus-observability-tablet-phasemap` :: **OB3_movement_map** — OB3 movement map
- [x] `raid-warp-verification-phasemap` :: **P2_constitution_gate** — P2 constitution gate
- [x] `raid-warp-verification-phasemap` :: **P3_cos_isolate_and_verify** — P3 cos isolate and verify
- [x] `repair-contract-and-loom-hub-phasemap` :: **R9_ui_design_philosophy** — R9 ui design philosophy

### architect  —  10 phases (6 done, 1 in progress, 3 pending)

- [ ] `clearglass-agent-suite-and-cfr-loom-phasemap` :: **TX4_provider_tab_tool_loop** — TX4 provider tab tool loop
- [ ] `nexus-architecture-rebuild-phasemap` :: **P16_architect_node_canvas_in_loom** — P16 architect node canvas in loom
- [ ] `nexus-architecture-rebuild-phasemap` :: **P17_blueprint_builder_onto_canvas** — P17 blueprint builder onto canvas
- [ ] `copilot-guardian-cos-expansion-phasemap` :: **GA6_spec_builder_depth** — GA6 spec builder depth **← in progress**
- [x] `gemini-multiagent-coding-phasemap` :: **P1_per_agent_contracts** — P1 per agent contracts
- [x] `nexus-architecture-rebuild-phasemap` :: **P1_dangling_hook_flood** — P1 dangling hook flood
- [x] `nexus-live-mind-phasemap` :: **P3_diagnostic_kernel** — P3 diagnostic kernel
- [x] `repair-contract-and-loom-hub-phasemap` :: **R5_loom_visual_map** — R5 loom visual map
- [x] `repair-contract-and-loom-hub-phasemap` :: **R6_living_documentation** — R6 living documentation
- [x] `repair-contract-and-loom-hub-phasemap` :: **R10_relational_context_and_reuse** — R10 relational context and reuse

### bridge  —  9 phases (5 done, 0 in progress, 4 pending)

- [ ] `nexus-architecture-rebuild-phasemap` :: **P6_copilot_toasts** — P6 copilot toasts
- [ ] `nexus-architecture-rebuild-phasemap` :: **P18_tv_ui_triage** — P18 tv ui triage
- [ ] `nexus-system-standardization-phasemap` :: **SS3_event_driven_handshake_contracts** — SS3 event driven handshake contracts
- [ ] `raid-routing-fidelity-phasemap` :: **RR5_clearglass_accounts_and_features** — RR5 clearglass accounts and features
- [x] `nexus-architecture-rebuild-phasemap` :: **P14_emergence_axioms_endstate** — P14 emergence axioms endstate
- [x] `nexus-live-mind-phasemap` :: **P1_nervous_system_live** — P1 nervous system live
- [x] `raid-warp-verification-phasemap` :: **P10_diagnose_and_notify** — P10 diagnose and notify
- [x] `raid-warp-verification-phasemap` :: **P11_diagnose_and_repair_on_prompt** — P11 diagnose and repair on prompt
- [x] `repair-contract-and-loom-hub-phasemap` :: **R8_ui_diagnostic_surfaces_wired_together** — R8 ui diagnostic surfaces wired together

### replay  —  6 phases (6 done, 0 in progress, 0 pending)

- [x] `copilot-full-capability-phasemap` :: **P8_rewind_replay_tool** — P8 rewind replay tool
- [x] `nexus-live-mind-phasemap` :: **P2_snapshot_on_sigma** — P2 snapshot on sigma
- [x] `raid-verification-spine-phasemap` :: **P6_rewind_on_fail** — P6 rewind on fail
- [x] `raid-warp-verification-phasemap` :: **P5_compare_contract_vs_output** — P5 compare contract vs output
- [x] `raid-warp-verification-phasemap` :: **P6_rewind_on_fail** — P6 rewind on fail
- [x] `repair-contract-and-loom-hub-phasemap` :: **R2_real_snapshot_rollback** — R2 real snapshot rollback

### tablet  —  5 phases (3 done, 0 in progress, 2 pending)

- [ ] `nexus-architecture-rebuild-phasemap` :: **P19_tablet_continue** — P19 tablet continue
- [ ] `raid-routing-fidelity-phasemap` :: **RR7_per_system_dashboards_in_tablet** — RR7 per system dashboards in tablet
- [x] `copilot-omniscience-phasemap` :: **P7_stream_to_all_systems** — P7 stream to all systems
- [x] `nexus-observability-tablet-phasemap` :: **OB4_bottleneck_detection** — OB4 bottleneck detection
- [x] `nexus-observability-tablet-phasemap` :: **OB5_tablet_modules** — OB5 tablet modules

### emerge  —  4 phases (1 done, 0 in progress, 3 pending)

- [ ] `copilot-guardian-cos-expansion-phasemap` :: **GA10_copilot_capability_self_awareness** — GA10 copilot capability self awareness
- [ ] `nexus-architecture-rebuild-phasemap` :: **P18_tv_ui_triage** — P18 tv ui triage
- [ ] `nexus-self-build-pipeline-phasemap` :: **SB7_compartments_as_sessions** — SB7 compartments as sessions
- [x] `nexus-architecture-rebuild-phasemap` :: **P14_emergence_axioms_endstate** — P14 emergence axioms endstate

### idearium  —  3 phases (1 done, 1 in progress, 1 pending)

- [ ] `agent-model-and-user-continuity-phasemap` :: **AM9_get_to_know_you_and_idea_capture** — AM9 get to know you and idea capture
- [ ] `copilot-guardian-cos-expansion-phasemap` :: **GA6_spec_builder_depth** — GA6 spec builder depth **← in progress**
- [x] `copilot-omniscience-phasemap` :: **P7_stream_to_all_systems** — P7 stream to all systems

### orchestrator  —  3 phases (1 done, 1 in progress, 1 pending)

- [ ] `nexus-architecture-rebuild-phasemap` :: **P18_tv_ui_triage** — P18 tv ui triage
- [ ] `nexus-system-standardization-phasemap` :: **SS0_clear_clutter** — SS0 clear clutter **← in progress**
- [x] `copilot-guardian-cos-expansion-phasemap` :: **GA8_sse_announcements** — GA8 sse announcements

