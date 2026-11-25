# The pipeline, the automation engine, BrainOS and Idearium's components: one synthesis (2026-11-24)

James, 2026-11-24: "can you synthesize all the phases for the pipeline and automation engine? brainos, idearium components?" · "each contract, sent to the pipeline would have a ledger from the moment the compartment gets created, maybe a contract compartment, maybe make a template in cos, to reuse them, and any more that you need, from gates, to steps, a visual record of the entire contract."

This document indexes; it does not re-map. Every phase stays in its own map, which owns it. Read with lib/phase-dag.js (Nexus's own map reader): 24 of these maps are not strict YAML, so a plain YAML reader skips them; the counts below include them. Status words are read from each phase: built (done, built, shipped), else open.

**9 themes, 59 maps, 843 phases: 349 built, 494 open.**

## The path, in his order

His order (2026-11-23): the pipeline first, until Nexus builds itself; then Pillar; then genesis components. What stands between today and "the pipeline builds Nexus itself", each owned by the phase named:

1. **A piece builds on the smallest model.** EMB6 (end state first, built 0.60.645), EMB7 (code frames, failed: off by default), EMB8 (the contract at every level: each piece gated by its own examples, small gate briefs; open, being measured). docs/2026-10-17-pieces-not-order-phasemap.spec.
2. **The economy and Nexus first.** A piece goes to the cheapest thing that can do it: a component Nexus already has, then the 3b, then a bigger model (L1b, RL_D3). docs/2026-11-17-raid-request-lifecycle-phasemap.spec.
3. **The gate is the unit** (RL_D10): one gate record with an id, intent, run, context and its record (previous attempt, failure mode, fault, solution), the same for a function, a pipeline step and a RAID contract gate.
4. **A request becomes a contract compartment.** L1 (the compartment and its open loop per request), L3 (the contract is its end state), L7 (the fill index), RQ21 (the contract file rewritten at every transition): the ledger starts when the compartment is made. His new ask, 2026-11-24: a contract-compartment template in COS, and templates for gates and steps.
5. **RAID drafts the DAG from the input** (L2, L2a): primitives, principles, variables; the test file first, its conditions shaping each piece both ways (EMB8 expansion, his "bidirectional causal chaining").
6. **The pipeline runs it and shows it**: PC8 (operate a pipeline), PC4 (the box kinds on the canvas), L15 (the pipeline is the decision tree, each run its lineage), RL_D9 (BrainOS's canvas, agents, node controls and automation move to COS's pipeline). His ask: a visual record of the entire contract, from its compartment's first entry.
7. **A missing capability is built by the pipeline** (L6, PC3): the request waits on it as a node of its DAG.

## Each theme

### Requests, RAID and contracts: 153 phases, 53 built, 100 open

- **2026-10-12-request-spine** (1 of 28 built): open RQ0_the_inventory_proved, RQ1_the_verifier_library, RQ2_the_generation_failure_vocabulary_and_index, RQ3_repair_with_the_checks_own_words, RQ4_escalate_on_the_checks_and_keep_the_lesson, RQ5_the_small_model_baseline, RQ6_one_intent_map, RQ7_the_context_obligations, RQ8_the_gap_is_a_question, RQ9_the_chunked_contract, RQ10_anchors_and_the_diff_reconciled, RQ11_spec_and_registry_reconciled, and 15 more
- **2026-10-13-nexus-memory-gates-and-contract** (8 of 13 built): open GT0_every_interaction_gated, MEM0_nexus_holds_everything, TD0_today_and_yesterday_working, CT2_ingestion_as_contracts, EX0_executors_he_already_built
- **2026-10-15-gate-held-work** (8 of 32 built): open GW0d_listener_question, GW1_the_baton, GW2_the_run_follows_the_gate, GW3_a_contract_is_traced, GW4_copilot_on_the_gates, GW5_agents_are_copilot, GW6_the_intelligence_system_on_every_gate, GW7_failure_macro_and_rewind, GW8_causal_graph_and_failure_mode_field, GW9_the_contract_panel, GW10_the_listener_knows_what_to_hear, GW11_a_snapshot_per_gate, and 12 more
- **2026-10-19-gate-quality-checks** (0 of 6 built): open GQ1_quality_stream, GQ2_brick_gate_runs_the_test, GQ3_brick_tests, GQ4_phase_gate_keeps_the_test, GQ5_command, GQ6_ui
- **2026-10-26-gate-chain-memory** (0 of 7 built): open GC1_the_chain, GC2_gates_persist, GC3_copilot_and_cli_emit, GC4_route_and_command, GC5_the_chain_ui, GC6_contract_scope_and_ledger, GC7_cortex_archives_the_fulfilled
- **2026-10-26-gate-walker-programmable-surface** (0 of 6 built): open GWK1_the_walker_and_chain_schema, GWK2_dynamic_decomposition, GWK3_each_gate_its_own_agent, GWK4_programmable_gate_as_tool, GWK5_route_and_command, GWK6_the_human_surface
- **2026-10-28-gated-flows** (31 of 39 built): open FG1_keyboard_mode_switch, FG2_dropdown_choose, FG3_gate_per_step, FG4_pointer_and_choose_steps, FG5_fiverr_gig_flow, FG6_blocks_ui, GT2_the_fill_includes_and_reports_dropdowns, GT3_choose_fields_in_the_macro_editor
- **2026-11-17-raid-request-lifecycle** (5 of 22 built): open L1_the_open_loop_and_the_compartment, L2_the_dag_of_what_is_needed, L4_nexus_first_then_outward, L5_no_or_i_dont_know_is_not_an_answer, L6_a_missing_capability_is_built, L7_follow_up_questions_and_the_fill_index, L8_failure_modes_faults_and_gaps, L9_raid_decides_and_delivers, L13_cortex_keeps_the_books, L14_structure_carries_the_complexity, L0a_signal_before_raid_commits, L1a_complexity_from_the_gap_field, and 5 more

### The pipeline and its canvas: 93 phases, 47 built, 46 open

- **2026-08-28-self-building-pipeline** (13 of 13 built)
- **2026-10-19-pipeline-root-causes** (13 of 29 built): open VF2_one_response_bundle, VF3_mutation_check, VF4_second_opinion_on_need, VF5_verdict_cache, SS2_every_system_home, SS3_nodes_are_the_data, SS4_seal_into_compartments, UI1_toolbox_and_store_explorer, UI2_version_in_code, UI3_ideas_and_notes_as_one, DG4_nexus_maps_meet_the_standard, DG5_dag_in_the_brief_and_the_ui, and 4 more
- **2026-10-29-pipelines** (18 of 19 built): open PL5_orchestrator_runs_pipelines
- **2026-10-30-pipeline-consolidation-and-job-ledger** (2 of 3 built): open CM1_pipeline_section_absorbs_macros_automation
- **2026-11-08-pipeline-canvas** (1 of 29 built): open PC2_procedures_and_frameworks_as_steps, PC3_the_build_request_step, PC4_the_box_kinds_on_the_canvas, PC5_programmable_gate_types, PC6_intelligence_watches_the_runs, PC7_iterate_to_the_end_state, PC5_programmable_gate_types, PC4_the_box_kinds_on_the_canvas, PC7_iterate_to_the_end_state, PC5_programmable_gate_types, PC5_programmable_gate_types, PC5_programmable_gate_types, and 16 more

### The automation engine and orchestration: 52 phases, 17 built, 35 open

- **2026-10-13-identities-tabs-and-automation** (5 of 18 built): open ID1_identities, ID2_every_cookie_a_row, ID3_bookmarks_carry_the_identity, ID4_incognito, TB1_tab_is_a_view, TB2_new_tab_menu, TB3_browser_rebuilt, HM0_the_hat_keeps_a_model_of_the_repo, HM1_chatgpt_connection_kept, NV1_words_to_elements, NV2_tell_clear_glass_what_to_do, MC1_steps_as_events_and_snapshots, and 1 more
- **2026-10-24-agent-orchestration** (5 of 6 built): open CG4_the_gate_in_the_ui
- **2026-10-25-automation-engine-to-orchestrator** (6 of 10 built): open AE9_each_tool_carries_its_dag, AE5_ui_and_cleanup, AE5_ui_and_cleanup, AE5_ui_and_cleanup
- **2026-11-01-eravos-orchestration-tools** (0 of 6 built): open EO0_the_domain_and_its_door, EO1_flow_tools, EO2_cos_tools, EO3_work_tools, EO4_measure_tools, EO5_opened_from_cos
- **2026-11-01-orchestration-console** (1 of 12 built): open OC12_the_survey, OC7_the_taxonomy_expanded, OC2_scheduler_on_nodes, OC3_the_calendar, OC4_deploy_to_any_system, OC5_every_agent_tool, OC6_history_and_replay, OC8_the_console, OC9_templates, OC10_pipelines_on_the_canvas, OC11_the_cos_app_runs_alone

### Compartments: 123 phases, 62 built, 61 open

- **2026-09-11-compartment-nodetype-and-reorg** (6 of 17 built): open T2_idearium_genesis_alignment, T3_warp_replaces_siso, T4_cos_role_confirmed, V2_snapshot_ownership_decision, D1_diagnostic_real_folder, I1_boot_js_intelligence_routes, R1_recall_to_lib, C1_cli_per_system_split, AR1_architect_retirement_and_hooks_to_loom, X1_node_decomposition_tool, AR2_decentralize_interaction_contracts
- **2026-10-07-compartment-control-and-activity** (11 of 15 built): open UN1_nexus_surfaces_in_the_field, SP1_one_spotlight, DC1_a_click_that_did_nothing, DX1_diagnose_it
- **2026-10-10-snapshot-compartments** (5 of 5 built)
- **2026-10-16-canvas-compartments** (5 of 6 built): open CN6_canvas_screen
- **2026-10-16-mobile-compartments** (2 of 6 built): open MB2_android_compartment, MB3_testenv_stacks, MB4_apple_via_a_real_mac, MB6_everything_else
- **2026-10-18-compartment-environment** (11 of 14 built): open CE0a_one_compartment_per_what, CE0e_cos_answers_on_a_route, CE0f_the_handshake_is_the_kernel_s
- **2026-10-21-compartment-downloads** (7 of 7 built)
- **2026-10-21-snowflake-compartment** (9 of 9 built)
- **2026-10-28-tab-compartments** (0 of 5 built): open TC1_a_compartment_per_tab, TC2_one_webview_per_tab, TC3_links_open_tabs, TC4_pop_out_and_dock, TC5_new_tab_chooser
- **2026-10-30-compartment-metrics-and-learning-loop** (0 of 5 built): open ML1_metric_point, ML2_compartment_stats, ML3_learning_loop, ML4_route_command_ui, ML5_emerge_edges
- **2026-11-01-the-compartment** (5 of 27 built): open CP0_the_full_spec, CP1_the_machine_and_its_door, CP2_the_window, CP3_one_terminal_one_cli, CP4_files_and_code, CP5_states_rewind_versions, CP6_resources, CP7_settings, CP8_agents_in_the_compartment, CP9_cos_and_idearium_one_link, CP10_miniworlds, CP11_the_diagnostic_map, and 10 more
- **nexus-repo-compartment-and-rich-dispatch** (1 of 7 built): open RD2_response_to_multiple_artifact_types, NC1_compartment_bootstrapping_decision, NC2_nested_compartment_support, AG1_agent_nodes_sorted_by_provider, RS1_repo_settings_sections, GC1_global_component_reuse_store

### Building: Nexus codes itself (small models, Emerge): 301 phases, 142 built, 159 open

- **2026-09-19-architect-blueprint-forge-idearium** (0 of 10 built): open D1_canvas_authority, D2_spec_authority, D3_forge_home, P0_place_spec_compiler, P1_reconcile_node_schema_precedent, P2_decide_D1_D2_D3, P3_architect_canvas_onto_loom_registry, P4_blueprint_as_canvas_mode, P5_forge_as_phasemap_view, P6_idearium_build_authority
- **2026-09-27-idearium-atlas** (4 of 4 built)
- **2026-09-27-one-idearium-phases-living-spec-nodes** (20 of 20 built)
- **2026-09-30-idearium-coding-flow** (7 of 8 built): open W7_next_mapped_2026_09_30
- **2026-10-01-idearium-agent-ready-master** (22 of 58 built): open PF6_boot_sync_yields_to_the_person, PF7_pipeline_scoped_to_changes, PF8_settings_console_one_cheap_read, PF9_boot_memory_census, PF10_clear_glass_err_aborted_9000, DT1_persistence_census, DT3_failure_modes_routes_and_preflight, DT4_registry_block_to_nodes, CI1_compounding_iterate, RM1_registry_driven_moves, HC1_hat_agent_to_cos_build, DK3_vm_engines, and 24 more
- **2026-10-05-build-from-the-spec** (31 of 58 built): open SB4_template_fidelity, SB5_nexus_rebuilds_a_system_from_its_spec, SB6_hundreds_of_specs, SB7_domain_file_tree_templates, SB8_promote_with_full_block_options, SB9_the_spec_is_a_spec_file, SB10_reuse_first_keyed_on_the_contract, SB11_each_block_chunked, SB13_each_component_chunked, SB14_reuse_compounds, BC3_what_a_build_was_sent_as_a_node, SB15_empty_is_not_built, and 15 more
- **2026-10-07-idearium-one-surface** (12 of 12 built)
- **2026-10-10-idearium-access** (5 of 8 built): open IA5_provider_accounts_per_hat_and_repo, IA6_every_local_caller_carries_the_key, IA7_the_hat_is_the_actor
- **2026-10-10-idearium-solid** (10 of 23 built): open SD4_agents_live_in_guardian, SD5_account_fallback, SD6_an_idea_logged_asked_expanded, SD7_blocks_that_generate_themselves, SD8_an_agent_can_see_and_fix_a_tab, SD9_claude_code_inside_idearium, SD10_the_adversarial_gate, SD11_the_desktop_inside_idearium, SD12_a_spec_starts_from_its_primitives, SD13_the_machine_is_cos, SD14_chunks_cut_at_primitives, SD15_no_website_can_drive_nexus, and 1 more
- **2026-10-17-pieces-not-order** (4 of 17 built): open PC0c_who_cuts, PC1_the_point_first, PC2_any_order, PC3_verified_alone_resumed_by_recheck, PC4_a_procedure_per_kind, PC5_control_when_he_chooses, EMB2_ollama_writes_emerge_for_the_pipeline, EMB4_torrent_pieces, EMB5_trials_start_at_raid, EMB6_the_end_state_first, EMB7_code_frames, EMB8_the_contract_at_every_level, and 1 more
- **2026-10-19-idearium-control** (0 of 14 built): open NM1_one_name_per_file, NM1a_file_identity, PC1_phase_controls, FM1_file_manager, FM2_stores_in_the_files_tab, CT0_code_tab_census, CT1_fewer_wider_tabs, TB1_toolbox, VS1_versions_in_the_surface, VS2_diff_only_backups, IX1_everything_linked, IM1_ideas_and_notes_as_one, and 2 more
- **2026-10-21-brainos-into-idearium** (7 of 16 built): open BX1_census, BX3_flow_canvas, BX4_agents_layer, BX5_node_controls, BX6_pipeline_edit, BX7_automation, BX8_dock_panels, BX9_retire, BX10_float
- **2026-11-01-build-from-cos** (0 of 8 built): open BC0_the_full_spec, BC1_the_document_library, BC2_the_editor, BC3_templates_to_start_from, BC4_build_from_cos, BC5_open_loops_imported, BC6_the_universal_compiler, BC7_the_workshop_moves_into_cos
- **2026-11-15-the-factory** (1 of 23 built): open IF1_idearium_asks_agents_through_the_pipeline, IF2_the_build_as_a_pipeline, IF3_one_gate, IF4_rewind_in_the_compartment, IF5_one_compartment, IF6_the_loop_is_cos, IF7_the_factory_builds_itself, IF8_the_substrate_under_it, IF9_everything_raid_does_through_the_pipeline, IF10_the_map_of_nexus_on_the_canvas, IF11_agents_deployed_per_system_by_hat, IF12_nexus_builds_itself_autonomously, and 10 more
- **2026-11-17-nexus-codes-itself** (0 of 2 built): open NX1_no_request_runs_without_its_map, NX2_nexus_codes_itself_toward_a_dynamic_end_state
- **idearium-creative-repo-overhaul** (7 of 7 built)
- **idearium-repository-overhaul** (12 of 13 built): open MCO-D_zoom_subrepo

### Components: Pillar, the decomposer: 25 phases, 7 built, 18 open

- **2026-09-27-components-store-and-atlases** (5 of 7 built): open A2, A3
- **2026-11-06-pillar** (2 of 6 built): open PIL3_conformance, PIL4_three_identities, PIL5_the_duplicates_census, PIL6_the_small_model_bench
- **2026-11-20-pipeline-components-to-pillar** (0 of 7 built): open DB1_the_pipeline_census, DB2_the_contracts, DB3_the_drawbridge_installs, DB4_the_first_move_gaps, DB5_the_build_runs_in_cos, DB6_the_dock_from_pillar, DB7_memory_into_cortex_with_copies
- **2026-11-21-the-decomposer** (0 of 5 built): open DC1_the_split_speaks_es_modules, DC2_decompose_inside_files, DC3_wired_to_the_drawbridge_in_cie_eg, DC4_idearium_decomposed, DC5_the_multitool

### BrainOS: 6 phases, 0 built, 6 open

- **2026-09-22-brainos-agent-suite** (0 of 6 built): open AS1_agent_system_tab, HT1_hat_manager, IJ1_injection_editor, TL1_tool_browser, MM1_module_manager, RD1_reader

### Intelligence feeding the pipeline: 13 phases, 0 built, 13 open

- **2026-11-05-intelligence-data-pipeline** (0 of 13 built): open IP1_input_folder_and_reader, IP2_baseline_per_series, IP3_deviation_and_regime, IP4_invariants_across_series, IP5_invariants_into_rfr2, IP6_route_command_screen, IP7_the_screen, IP8_negative_and_shadow_space, IP9_the_open_loop, IP10_growth_tracking, IP11_risk_ambiguity_uncertainty_one_primitive, IP12_gaps_between_the_pieces, and 1 more

### Other: 77 phases, 21 built, 56 open

- **2026-09-01-living-model-and-autonomous-pipeline** (0 of 26 built): open LM1_spec_as_living_model, LM2_registry_as_hub_with_watchdog, LM3_interaction_contract_wired_to_registry, LM4_per_system_tool_index, LM5_copilot_capability_zoom, LM6_who_creates_contracts, LM7_agent_mesh_intent_programming, LM8_full_pipeline_wiring, LM9_deterministic_agent_switch_cli, LM10_per_agent_wake_words, LM11_copilot_ollama_guardian_toggle, LM12_successful_prompt_caching, and 14 more
- **2026-10-13-gates-that-learn-and-priorities** (3 of 4 built): open QA1_the_catalogue_runs
- **2026-10-13-projects-raid-and-gates** (8 of 22 built): open PL1_many_projects_at_once, RF0_architecture_read, RF1_migration_proposed_as_phases, RF2_applied_one_phase_at_a_time, PL5_specs_become_the_roadmap, PL6_global_links_seen, RD0_raid_has_its_own_contract, RD1_raid_commands, RD9_every_input_through_raid, RD2_idearium_routes_through_raid, RD3_the_registry_carries_events, RD4_the_fulfilled_contract_is_one_file, and 2 more
- **2026-10-18-gate-memory** (5 of 12 built): open GM0a_the_precommit_compartment, GM1_the_gate_record, GM2_restarts_resume_from_records, GM3_the_fulfilled_contract_index, GM6_crystallized_from_what_was_approved, GM7_the_context_panel_per_gate, GM8_agents_have_it
- **2026-10-26-gate-waits-for-verdict** (4 of 4 built)
- **nexus-self-build-pipeline** (1 of 9 built): open SB2_universal_file_parse, SB3_guided_build_loop, SB4_decision_lattice_wiring, SB5_self_modification_from_inside, SB6_contract_type_schemas_and_toolbox_directory, SB7_compartments_as_sessions, SB8_tool_agnosticism_and_new_tool_flow, SB9_full_clearglass_control

## Overlaps to settle (the same thing mapped more than once)

- **Gates:** RAID contract gates (contract-gates.js), the pipeline's gate types (PC5, cos/pipeline/gate.eg), the gate walker (GWK), gate-held work (GW), gate chain memory (GC), each function's .gap: one gate record, RL_D10.
- **Compartments:** the-compartment, canvas-, tab-, mobile-, snapshot-, snowflake- and compartment-environment maps: one compartment shape, of which a contract compartment is one use.
- **The pipeline itself:** pipelines, pipeline-consolidation, pipeline-focus, pipeline-canvas and self-building-pipeline: pipeline-canvas is the newest owner; the others are history or are folded into it.
- **The automation engine:** automation-engine-to-orchestrator moved it to the Orchestrator (2026-10-25); his 2026-11-08 order moves it to COS; BrainOS's automation (BX7) lands there too (RL_D9).
- **Building:** build-from-the-spec, build-from-cos, the-factory, idearium-* and pieces-not-order all describe the build loop; pieces-not-order (the Emerge rung, COS's builder) is where it runs today.

Counts are from the maps as they stand on 2026-11-24; a map's own status is the truth when the two differ.

## ADDENDUM 2026-11-24 (evening): his asks, each with its owner, kept so none is lost (persistence, his 2026-11-14)

His words, 2026-11-24: "i love the console ui preview, can we swap it for the current one. but make each choice, deviation, iteration, version, or direction branch in the cavnas ... each gap should create another step, and gate. like dynamically expanding, gap by gap, or step by step. like lab moves into the new automation and workflow pipeline." · "i want to be able to run the pipeline. can we finish that if it's working. if we get it proven end to end. escalate once it has exausted its resources." · "the audtomation and worksflow is the canvas is the pipeline." · "a lot of the tabs need to be steps or gates. not tabs."

Each ask, and where it goes. "To map" means no phase holds it yet; the coder's reading of the owner is to confirm.

1. **The console preview becomes COS's pipeline screen** (cos/ui/run-console-preview replaces cos/ui/pipelines). Owner: docs/2026-11-08-pipeline-canvas-phasemap.spec (PC4, PC8). After his yes on the preview; it is the pipeline, the automation and the workflow, one screen (his words above).
2. **Every gap becomes a step and a gate on the canvas, as it appears; every choice, deviation, iteration, version and direction a branch.** Owner: pipeline-canvas (to map, as PC4's expansion) with RL_D10 (the gate is the unit) and EMB9 (each break a node). Today the Build tab shows them as a list; the canvas does not grow yet.
3. **Lab moves into the pipeline** (cos/playground/llm-lab.js, the Lab page): an experiment is a pipeline. Owner: pipeline-canvas, to map.
4. **Run the pipeline; escalate only when its resources are exhausted.** Built today: COS pipeline "Build a phase (self-repairing)" (build-phase.js), 3b first, climbing only when a piece cannot be broken down further (EMB9). Proof open: no module has passed end to end.
5. **Import a project into COS:** drop a zip, it unzips, asks "make a .spec for it, or import as is", into the default folder or one he picks; imported into Idearium, supervised in COS, its runtime / kernel / executable / engine set, projects able to interconnect. His examples: Mastermind, the Eravos canvas. Owner: docs/2026-11-02-cos-console-phasemap.spec SC24 (the compartment builder) and SC27 (Eravos); expanding SC24. His decompose tool (decompose-tool.zip: "Boundary — component decomposer", import graph, shared foundation, components by cohesion) is the reuse candidate for the "make a .spec" path, and for Pillar's decomposer (to confirm).
6. **The flight map one increment above the pipeline, floating over the drawbridge** (each system's component registry and interaction contract): zoomed out, systems; zoom in, a pipeline. Owner: pipeline-canvas (to map); the flight map he liked: cos/ui/flight-map-previews.html.
7. **Decouple the pipeline from the automation engine and the compartment; migrate the Orchestrator into COS, from the inside out, by Nexus.** Owner: docs/2026-10-25-automation-engine-to-orchestrator-phasemap.spec and his 2026-11-08 order (the engine to COS); to map as one migration DAG the pipeline runs.
8. **RAID, Co-pilot and the Orchestrator as one?** His question. Reading, the coder's: all three route work to agents (RAID decides and gates, Co-pilot holds the conversation and its agents, the Orchestrator runs them); one routing core with three faces is possible, and sovereignty (§5.9–§5.16) keeps each system's data its own. His to decide.
9. **Intent routing per agent: one map, a drop-down of every installed model per intent:** generating/coding, speccing/mapping, complex reasoning, debugger/adversarial, copilot/orchestrator. Owner: to map in COS (settings, per system); existing routing to reuse: lib/pipeline-routing.js (it names deepseek-coder-v2:16b, which is not installed: fix there too).
10. **The 30b:** his words: "i think the 30b we have sucks, like I don't think it has worked once since we have had it." Measured 2026-11-24: it did not answer within 300 s (loading) in run cbuild-mwv6i9p5. Taken off the build's ladder; whether to keep it is his.
11. **What phases are left** (from the counts above): the pipeline and its canvas 46 open; the automation engine and orchestration 35; BrainOS 6 (none built); intelligence feeding the pipeline 13; building with small models and Emerge 159; RAID and contracts 100.
