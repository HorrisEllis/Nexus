# Emerge copies — divergence report

EM0 (4), docs/2026-10-02-emerge-field-memory-build-phasemap.spec. Generated 2026-10-05 from the files themselves. Nothing merged — each difference is for James to decide.

## Summary

| | Nexus | Upload (emergence-6) |
|---|---|---|
| Emerge language | `emerge/emerge.spec` v1.0.0, 569 definitions | `emergence/emerge-language.spec` v2.0.0, 328 definitions |
| Shared terms | 6 identical, 224 defined differently | |
| Terms in one only | 339 | 98 |
| Roots | Structure, Signal, Observation, Gap, Record, Identity | Structure, Signal, Observation, Gap, Record, Identity, Lens |
| Axioms only here | SIGNAL_MUST_ROUTE_OR_LOG, PROOF_REQUIRED_FOR_PROMOTION | SIGNAL_MUST_ROUTE |
| RFR2 | `intelligence/rfr2` — 18 files | `emergence/vendor/rfr2` — 20 files |

Also: `emerge/spec/emerge.spec` and `docs/emerge.spec` are the same file (72 lines, identical bytes). `emergence/emergence.spec` (217 lines) is not a copy — it is the Emergence system written in Emerge, and has no counterpart in Nexus.

## RFR2

- **Shared: `causality/index.js`.** Same logic. Nexus is 5.0.2 and CommonJS (`module.exports`); the upload is 5.0.0 and ES modules (`export`). That is the whole difference.
- **Only in Nexus (17):** adapter, adapter-sandbox, clip, compress, context, delta, enforcement, forge, identity, kernel, lazy, observer, query, sigma, time, version-gate, index.js.
- **Only in the upload (19):** cfr-kernel (index, physics, render, rewind), field (ALKModule, relational), lattice, ledger, liminal ×11 (assumption, bus, contrastive, core, existential, negative-space, oscillatory, relational-gaps, reversal, shadow, structural).
- No file conflicts: the two trees are different halves of RFR2, joined only at causality.

## Defined differently (224)

| term | Nexus | Upload |
|---|---|---|
| system | runtime_environment (structure) | a_bounded_executable_thing (structure) |
| core | immutable_execution_rules (structure) | immutable_rules_of_a_system (structure) |
| invariant | always_true (structure) | always_true_within_a_system (structure) |
| axiom | global_invariant (structure) | invariant_that_applies_everywhere (structure) · a_rule_that_cannot_be_violated (constraints) |
| maxim | conditional_invariant (structure) | invariant_that_applies_under_conditions (structure) |
| constraint | local_invariant (structure) | invariant_that_applies_locally (structure) |
| component | transform (structure) | a_named_transform_inside_a_system (structure) |
| framework | external_executable_component (structure) | a_component_that_wraps_another_system (structure) |
| compartment | bounded_container (structure) · idea_compartment_label (idearium) | a_bounded_container_of_components (structure) |
| seam | boundary_between_components (structure) | the_boundary_between_two_components (structure) |
| edge | defined_transition_boundary (structure) | a_defined_transition_point (structure) · the_moment_a_value_crosses_a_threshold (observation) |
| gate | execution_control_point (structure) | a_control_point_that_decides_flow (structure) |
| signal | expected_state_transition (signal) | an_expected_state_transition (signal) |
| state | current_system_condition (signal) | the_current_condition_of_a_system (signal) |
| context | surrounding_runtime_conditions (signal) · ai_prompt_context (ai) | the_conditions_surrounding_a_signal (signal) · the_assembled_input_for_inference (inference) |
| input | data (signal) | data_entering_a_component (signal) |
| output | data (signal) · declared_file_target (output) | data_leaving_a_component (signal) |
| flow | directed_signal_path (signal) | a_directed_path_a_signal_takes (signal) |
| feedback | output_to_input (signal) | an_output_that_becomes_an_input (signal) |
| loop | repeat_component (signal) | a_component_that_repeats (signal) · a_node_that_iterates_a_collection (pipeline) |
| observer | monitors_runtime_behavior (observation) | a_component_that_watches_without_changing (observation) |
| baseline | established_expected_behavior (observation) | the_established_expected_behavior (observation) |
| sigma | observes_baseline_divergence (observation) | divergence_from_baseline (observation) |
| delta | distance_expected_actual (observation) | the_distance_between_expected_and_actual (observation) |
| slope | rate_of_change_delta (observation) | the_rate_of_change_of_delta (observation) |
| polarity | direction_of_divergence (observation) | the_direction_of_divergence (observation) |
| observation | sigma_result (observation) | the_result_of_applying_sigma_to_a_baseline (observation) |
| coherence | ability_to_hold_structure (runtime) | ability_to_hold_structure_under_load (field) |
| entropy | structural_disorder (runtime) | the_natural_disorder_of_structure (field) |
| friction | conflicting_structure (runtime) | conflicting_structures_resisting_each_other (field) |
| pressure | significance_of_missing_structure (runtime) | the_significance_of_missing_structure (field) |
| density | generative_potential_of_gap (runtime) | the_generative_potential_of_a_gap (field) |
| stability | coherence_over_entropy (runtime) | coherence_over_entropy_ratio (field) |
| stable | sigma_regime_stable (runtime) · response_stability_signal (agent) | identity_confirmed_by_sufficient_presence (identity) |
| degraded | sigma_regime_degraded (runtime) | a_component_missing_expected_beats (liveness) |
| noise | invalid_signal (failure) | a_signal_that_does_not_resolve (observation) |
| gap | missing_structure (failure) | expected_structure_that_is_absent (observation) · a_primitive_used_but_not_declared (compiler) |
| decay | temporary_state_expiration (failure) | loss_of_relevance_over_time (time) |
| uncertainty | unknown_structure (gap_field) | a_gap_whose_shape_is_not_yet_known (gap) |
| omission | expected_structure_missing (gap_field) | expected_structure_that_was_not_provided (gap) |
| inference | implied_structure (gap_field) | structure_implied_by_what_surrounds_a_gap (gap) |
| whatif | speculative_branch (cognition) | speculative_branch_that_does_not_commit (flow) |
| if | deterministic_condition (cognition) | evaluate_a_condition (flow) |
| then | deterministic_outcome (cognition) | the_path_taken_when_condition_is_true (flow) |
| try | attempt_execution (cognition) | attempt_execution_catch_failure (flow) |
| else | fallback_execution (cognition) | the_path_taken_when_condition_is_false (flow) |
| idea | speculative_record (ledger) · cognitive_unit (idearium) | a_speculative_unit_not_yet_validated (speculation) |
| proof | typed_validation (ledger) | the_evidence_required_for_promotion (speculation) |
| ledger | authoritative_timeline (ledger) · append_only_event_log (jaa) | a_named_record_with_schema (record) |
| promote | idea_to_upgrade (ledger) | advance_an_idea_to_a_validated_record (speculation) |
| conversion | ideas_over_upgrades (ledger) | ratio_of_ideas_that_reach_promotion (speculation) |
| bottleneck | unresolved_speculative_load (ledger) | unresolved_speculative_load_in_the_system (speculation) |
| record | authoritative_sequence (time) | an_authoritative_append_only_sequence (record) |
| snapshot | point_in_time_state (time) | the_state_of_a_system_at_a_point_in_time (record) |
| clip | bounded_record_window (time) · replayable_authoring_process_segment (forge_ide) | a_bounded_window_into_a_record (record) |
| replay | reconstruct_from_record (time) | reconstruct_state_from_record (record) |
| fork | branch_record (time) | a_divergent_branch_of_a_record (record) · create_a_divergent_version_chain (version) · a_node_that_starts_parallel_branches (pipeline) |
| lineage | ancestry_of_record (time) | the_ancestry_of_a_record_entry (record) · the_ancestry_of_a_commit (version) |
| compress | encode_record (time) | encode_a_record_for_storage (record) |
| blueprint | structural_digest (time) | a_structural_digest_of_a_record (record) |
| uuid | unique_identity (identity) · universal_unique_identity (fields) | a_universally_unique_identifier (identity) · universally_unique_identity_field (fields) |
| persist | write_to_record (persistence) | write_to_durable_storage (persistence) |
| restore | read_from_record (persistence) | read_from_durable_storage (persistence) |
| archive | compress_record (persistence) · soft_delete_record (jaa) | move_to_long_term_storage (persistence) |
| emit | observable_event (laws) · observable_event (output) | produce_an_observable_signal (signal) · a_node_that_publishes_an_event (pipeline) · produce_output_from_compiled_source (compiler) |
| route | directed_output (laws) · http_route_declaration (network) · select_agent_for_call (raid) | select_a_path_for_a_signal (signal) |
| halt | stop_execution (laws) | stop_execution_with_a_record (flow) |
| fidelity | behavioral_match (laws) | how_complete_a_signal_is (observation) |
| string | text_value (types) | text (types) |
| float | decimal_value (types) | decimal_number (types) |
| int | integer_value (types) | whole_number (types) |
| bool | boolean_value (types) | true_or_false (types) |
| timestamp | time_value (types) | a_point_in_time (time) · point_in_time (types) |
| list | ordered_collection (types) · available_models_signal (ollama) | ordered_collection_of_values (types) |
| map | keyed_collection (types) | keyed_collection_of_values (types) |
| ring | bounded_circular_buffer (types) | fixed_size_circular_memory_overwrites_oldest (memory) · a_bounded_circular_buffer_of_values (types) |
| null | empty_value (types) | the_explicit_absence_of_a_value (types) |
| required | must_be_present (types) | this_field_must_be_present (types) |
| optional | may_be_absent (types) | this_field_may_be_absent (types) |
| score | weighted_composite_value (types) | a_weighted_composite_numeric_value (types) · quality_score_field (fields) · composite_liveness_quality (liveness) |
| hash | cryptographic_digest (types) · content_hash (jaa) | cryptographic_content_digest (types) |
| semver | semantic_version_string (types) · semantic_version_string (versionium) | semantic_version_string (types) |
| id | component_identity_field (fields) | a_unique_stable_identifier (identity) · component_identity_field (fields) |
| version | semver_field (fields) | a_named_point_in_an_identity_timeline (identity) · semantic_version_field (fields) |
| name | human_readable_name (fields) | human_readable_name_field (fields) |
| intent | declared_purpose (fields) | declared_purpose_field (fields) |
| source | origin_reference (fields) | where_a_signal_originates (signal) · origin_reference_field (fields) |
| target | destination_reference (fields) | destination_reference_field (fields) |
| path | filesystem_or_signal_path (fields) | filesystem_or_signal_path_field (fields) |
| mode | operational_mode (fields) | operational_mode_field (fields) |
| interval | timing_period (fields) | a_duration_between_two_points (time) · timing_period_field (fields) |
| priority | execution_priority (fields) | execution_priority_field (fields) · execution_order_in_the_pipe (plugin) |
| severity | criticality_level (fields) | criticality_level_field (fields) |
| alive | liveness_flag (fields) | is_alive_flag (fields) |
| ready | readiness_flag (fields) | is_ready_flag (fields) |
| running | execution_state_flag (fields) | is_executing_flag (fields) |
| render | produce_visual_output (render) | produce_visual_output_from_state (render) |
| panel | bounded_visual_region (render) · named_display_region (cockpit) | a_bounded_visual_region (render) · which_visual_region_this_component_belongs_to (contract) |
| layout | spatial_arrangement_of_panels (render) | the_spatial_arrangement_of_panels (render) |
| cursor | position_in_editor_signal (render) | the_current_position_in_a_buffer (editor) |
| selection | bounded_cursor_range (render) | a_bounded_cursor_range (editor) |
| focus | active_panel_signal (render) | the_active_panel (render) |
| blur | inactive_panel_signal (render) | a_panel_losing_focus (render) |
| theme | visual_style_declaration (render) | a_declared_visual_style (render) |
| syntax | token_coloring_rules (render) | token_coloring_rules (editor) |
| tab | named_panel_tab (render) · browser_tab_agent (agent) | a_named_selectable_panel (render) |
| split | panel_division (render) | a_panel_divided_into_regions (render) |
| resize | panel_boundary_adjustment (render) | a_boundary_adjustment_signal (render) |
| tooltip | contextual_hover_display (render) | a_contextual_hover_display (render) |
| modal | blocking_overlay_panel (render) | a_blocking_overlay_panel (render) |
| toast | non_blocking_notification (render) | a_non_blocking_notification (render) |
| statusbar | persistent_bottom_panel (render) | a_persistent_information_strip (render) |
| buffer | mutable_text_content (editor) | mutable_text_content (editor) · in_flight_data_accumulator (streaming) |
| line | single_text_row (editor) | a_single_row_of_text (editor) |
| token | lexed_text_unit (editor) · authentication_token (network) | a_lexed_unit_of_text (editor) · the_atomic_unit_of_inference_output (inference) |
| span | styled_token_range (editor) | a_styled_range_of_tokens (editor) |
| decoration | non_printing_editor_overlay (editor) | a_non_printing_overlay (editor) |
| marker | position_annotation (editor) | a_position_annotation (editor) |
| diagnostic | error_or_gap_annotation (editor) | an_error_or_gap_annotation (editor) |
| fold | collapsed_region (editor) | a_collapsed_region_of_text (editor) |
| autocomplete | completion_suggestion_list (editor) | a_completion_suggestion (editor) |
| hover | contextual_signal_on_token (editor) | contextual_information_on_a_token (editor) |
| goto | navigation_signal (editor) | navigate_to_a_position (editor) |
| find | text_search_signal (editor) | search_for_text (editor) |
| replace | text_mutation_signal (editor) | mutate_matched_text (editor) |
| undo | state_revert_signal (editor) | revert_to_prior_state (editor) |
| redo | state_forward_signal (editor) | advance_to_reverted_state (editor) |
| format | source_normalisation_signal (editor) | normalise_source_text (editor) |
| action | code_action_signal (lsp) | a_command_this_component_exposes_to_the_surface (contract) |
| suggest | single_ai_suggestion (ai) | a_single_inference_suggestion (inference) |
| accept | suggestion_accepted_signal (ai) | a_suggestion_was_used (inference) |
| reject | suggestion_rejected_signal (ai) | a_suggestion_was_discarded (inference) |
| explain | ai_explanation_signal (ai) | inference_producing_an_explanation (inference) |
| generate | ai_generation_signal (ai) | inference_producing_new_content (inference) |
| review | ai_review_signal (ai) | inference_evaluating_existing_content (inference) |
| prompt | ai_input_signal (ai) | input_to_an_inference_model (inference) |
| response | ai_output_signal (ai) | output_from_an_inference_model (inference) |
| chunk | single_token_or_word_unit (ai) · streaming_response_unit (agent) | a_single_unit_of_a_stream (streaming) |
| model | llm_model_declaration (ai) | a_declared_inference_capability (inference) |
| catalog | ordered_model_registry (ai) | an_ordered_registry_of_models (inference) |
| fitness | model_capability_score (ai) · 0.78 (streaming) · 0.83 (streaming) · 0.88 (streaming) · 0.94 (streaming) · 0.95 (streaming) · 0.82 (streaming) · 0.81 (streaming) | a_model_capability_score_per_task (inference) |
| task | inference_task_type (ai) | a_declared_inference_task_type (inference) |
| temperature | sampling_temperature (ai) | sampling_randomness_parameter (inference) |
| max_tokens | output_length_limit (ai) | maximum_output_length (inference) |
| stop | generation_stop_signal (ai) | a_generation_termination_signal (inference) |
| thinking | reasoning_trace_signal (ai) | a_reasoning_trace_before_response (inference) |
| stream | streaming_inference_signal (ollama) | a_continuous_signal_channel (streaming) · continuous_inference_token_output (inference) |
| ping | runtime_health_check (ollama) · health_check_signal (network) | a_health_check_signal (network) |
| endpoint | ollama_api_address (ollama) · api_endpoint (network) | a_named_address_that_accepts_signals (network) |
| microphone | audio_capture_device (voice) | an_audio_capture_device (voice) |
| speaker | audio_output_device (voice) | an_audio_output_device (voice) |
| transcribe | audio_to_text_transform (voice) | convert_audio_to_text (voice) |
| synthesize | text_to_audio_transform (voice) | convert_text_to_audio (voice) |
| utterance | complete_spoken_unit (voice) | a_complete_spoken_unit (voice) |
| phrase | partial_spoken_unit (voice) | a_partial_spoken_unit (voice) |
| silence | audio_gap_signal (voice) | an_audio_gap_signal (voice) |
| wakeword | activation_phrase_signal (voice) | an_activation_phrase (voice) |
| interim | partial_transcription_signal (voice) | a_partial_transcription (voice) |
| final | complete_transcription_signal (voice) | a_complete_transcription (voice) |
| speak | tts_output_command (voice) | emit_audio_output (voice) |
| listen | stt_input_command (voice) | receive_audio_input (voice) |
| mute | disable_microphone_signal (voice) | disable_audio_input (voice) |
| unmute | enable_microphone_signal (voice) | enable_audio_input (voice) |
| volume | audio_level_signal (voice) | audio_level (voice) |
| pitch | tts_pitch_parameter (voice) | audio_frequency_parameter (voice) |
| rate | tts_speech_rate_parameter (voice) | speech_speed_parameter (voice) |
| pipe | continuous_signal_channel (streaming) | a_sequential_chain_of_transforms (signal) |
| flush | emit_buffered_stream_signal (streaming) | emit_all_buffered_data (streaming) |
| backpressure | stream_flow_control_signal (streaming) | flow_control_when_consumer_is_slow (streaming) |
| drain | consume_all_buffered_signal (streaming) | consume_until_empty (streaming) |
| watermark | stream_position_marker (streaming) | a_position_marker_in_a_stream (streaming) |
| window | bounded_stream_slice (streaming) | a_bounded_slice_of_time (time) · a_bounded_slice_of_a_stream (streaming) |
| throttle | rate_limited_stream_signal (streaming) | rate_limited_stream (streaming) |
| debounce | delayed_stream_signal (streaming) | delayed_stream_emit (streaming) |
| on | event_handler_declaration (handlers) | declare_a_handler_for_an_event (events) |
| when | conditional_event_handler (handlers) | a_conditional_event_handler (flow) |
| before | pre_event_hook (handlers) | a_hook_that_runs_before_an_event (events) |
| after | post_event_hook (handlers) | a_hook_that_runs_after_an_event (events) |
| finally | always_runs_handler (handlers) | always_execute_regardless_of_result (flow) |
| port | network_port_binding (network) | a_numeric_address_on_a_host (network) |
| bind | address_binding (network) | attach_to_an_address (network) |
| protocol | transport_protocol (network) | the_rules_of_a_connection (network) |
| handshake | connection_establishment_signal (network) | the_establishment_sequence_of_a_connection (network) |
| register | provider_registration_signal (network) | announce_presence_to_a_network (network) · add_a_plugin_to_the_registry (plugin) · add_an_axiom_to_the_constraint_engine (constraints) · add_a_component_to_liveness_monitoring (liveness) |
| heartbeat | keepalive_signal (network) · periodic_liveness_signal (cobalt) | a_periodic_liveness_signal (network) · a_periodic_signal_proving_a_component_is_alive (liveness) |
| channel | persistent_connection (network) | a_persistent_path_between_two_points (signal) · a_named_persistent_connection (network) |
| open | channel_open_signal (network) | a_connection_is_ready (network) |
| close | channel_close_signal (network) | a_connection_has_ended (network) |
| pong | health_check_response (network) | a_health_check_response (network) |
| connect | establish_connection (network) | establish_a_connection (network) |
| disconnect | terminate_connection (network) | terminate_a_connection (network) |
| reconnect | re_establish_connection (network) | re_establish_after_failure (network) |
| dedup | deduplication_gate (jaa) | reject_if_already_stored (persistence) |
| schema | row_schema_declaration (jaa) | the_declared_shape_of_a_record_entry (record) |
| validate | schema_validation_gate (jaa) | check_a_value_against_a_schema (persistence) · check_source_against_all_constraints (compiler) |
| migrate | schema_migration (jaa) | transform_stored_structure_to_new_schema (persistence) |
| memory | persistent_knowledge_store (jaa) | a_named_persistence_layer (memory) |
| crystal | distilled_memory_pattern (jaa) | a_record_entry_that_is_immutable_and_content_addressed (record) · immutable_content_addressed_memory_high_quality_only (memory) |
| ingest | store_memory_record (memory) · publish_event_to_cobalt_bus (cobalt) | write_to_memory (memory) |
| forget | soft_delete_memory (memory) · soft_delete_memory_tier (cortex) | soft_delete_from_memory (memory) |
| pattern | detected_behavioral_pattern (memory) | fingerprint_sequence_memory_detects_cycles (memory) |
| distill | compress_memory_to_crystal (memory) | compress_many_memories_into_one_crystal (memory) |
| recall | retrieve_memory_record (memory) · retrieve_from_cortex_memory (cortex) | read_from_memory (memory) |
| tag | metadata_label (memory) | a_named_label_on_a_commit (version) |
| phase | idea_lifecycle_phase (idearium) | the_lifecycle_stage_of_an_idea (speculation) |
| tension | idea_pressure_score (idearium) | accumulated_pressure_around_a_gap (field) · accumulated_pressure_on_an_unresolved_idea (speculation) |
| resonance | link_type_resonance (idearium) | similarity_between_two_structures (field) |
| commit | version_commit_record (versionium) | a_content_addressed_snapshot (version) |
| branch | version_branch (versionium) | a_named_divergent_execution_path (flow) · a_named_pointer_to_a_commit_chain (version) |
| diff | version_difference (versionium) | the_difference_between_two_versions (version) |
| merge | version_merge_operation (versionium) | join_two_branches_back_together (flow) · join_two_branches (version) · a_node_that_joins_parallel_branches (pipeline) |
| rollback | version_revert_operation (versionium) | restore_to_a_prior_commit (version) |
| changelog | human_readable_version_notes (versionium) | human_readable_version_notes (version) |
| contract | interface_boundary_declaration (contract) | the_declared_interface_of_a_component (contract) |
| hotswap | live_component_replacement (contract) | replace_a_component_without_stopping (render) · replace_this_component_live (contract) |
| watchdog | continuous_silence_detector (cobalt) | a_component_that_detects_absence_of_heartbeat (liveness) |
| tick | cobalt_bus_monotonic_event_counter (cobalt) | a_monotonic_counter_increment (time) |
| pulse | liveness_channel_broadcast (cobalt) · guardian_node_liveness_tracker (siphon) | a_single_heartbeat_emission (liveness) |
| regime | behavioral_classification (orion) | the_current_behavioral_classification_of_a_system (field) |
| pipeline | ordered_node_graph_execution (forge_pipeline) | an_ordered_executable_node_graph (pipeline) |
| arm | enable_pipeline_scheduler (forge_pipeline) | enable_a_pipeline_scheduler (pipeline) |
| disarm | disable_pipeline_scheduler (forge_pipeline) | disable_a_pipeline_scheduler (pipeline) |
| surface | fs_watcher_registration_from_spec (forge_ide) | a_visual_output_target (render) |
| rewind | restore_to_prior_versionium_commit (versionium_full) | restore_state_from_a_prior_record (version) |

## Only in Nexus (339)

| term | definition (domain) |
|---|---|
| sigma_regime | stable (runtime) |
| collapsing | sigma_regime_collapsing (runtime) |
| oscillatory | sigma_regime_oscillatory (runtime) |
| recycle | decay_preserving_axioms (failure) |
| upgrade | validated_record (ledger) |
| reconstruct | rebuild_state (time) |
| systemid | first_2_chars (identity) |
| componentid | next_6_chars (identity) |
| shortid | systemid_plus_componentid (identity) |
| law | derived_theorem (laws) |
| log | append_to_record (laws) |
| observe | sigma_call (laws) |
| measure | quantify_friction (laws) · quantify_session_features (orion) |
| reinject | feedback_to_input (laws) |
| integrity | structural_match (laws) |
| oscillate | periodic_state (laws) |
| signals | score_vector (laws) |
| type | output_type_declaration (output) |
| file | filesystem_artifact (output) |
| content | output_content_key (output) |
| template | output_template_key (output) |
| raw | literal_output_content (output) |
| keybind | keyboard_input_signal (render) |
| keydown | key_pressed_signal (render) |
| keyup | key_released_signal (render) |
| gutter | line_number_region (render) |
| minimap | compressed_document_overview (render) |
| indent | leading_whitespace_signal (editor) |
| lsp | language_server_seam (lsp) |
| complete | autocomplete_result (lsp) · job_finished_signal (agent) |
| hover_info | token_documentation (lsp) |
| definition | symbol_definition_location (lsp) |
| references | symbol_usage_locations (lsp) |
| rename | symbol_rename_signal (lsp) |
| symbols | document_symbol_list (lsp) |
| diagnostics | gap_and_error_list (lsp) |
| codelens | inline_action_annotation (lsp) |
| workspace | multi_file_context (lsp) |
| assist | ai_suggestion_signal (ai) |
| refactor | ai_refactor_signal (ai) |
| token_stream | continuous_token_output (ai) |
| ollama | local_inference_runtime (ollama) |
| pull | download_model_signal (ollama) |
| run | inference_execution_signal (ollama) |
| abort | cancel_inference_signal (ollama) |
| model_info | model_metadata_record (ollama) |
| voice | audio_input_output_seam (voice) |
| tts | text_to_speech_signal (voice) |
| stt | speech_to_text_signal (voice) |
| vad | voice_activity_detection (voice) |
| voice_id | tts_voice_selection (voice) |
| buffer_stream | in_flight_token_accumulator (streaming) |
| ollama_id | qwen2.5-coder:1.5b (streaming) · qwen2.5-coder:3b (streaming) · qwen2.5-coder:7b (streaming) · qwen2.5-coder:14b (streaming) · deepseek-coder-v2:16b (streaming) · phi3.5:3.8b (streaming) · gemma3:4b (streaming) |
| vram_gb | 1.5 (streaming) · 3.0 (streaming) · 6.5 (streaming) · 12.0 (streaming) · 14.0 (streaming) · 3.5 (streaming) · 3.8 (streaming) |
| speed | 0.98 (streaming) · 0.90 (streaming) · 0.75 (streaming) · 0.55 (streaming) · 0.45 (streaming) · 0.88 (streaming) · 0.85 (streaming) |
| code_gen | 0.72 (streaming) · 0.82 (streaming) · 0.92 (streaming) · 0.96 (streaming) · 0.97 (streaming) · 0.78 (streaming) · 0.76 (streaming) |
| completion | 0.85 (streaming) · 0.88 (streaming) · 0.90 (streaming) · 0.93 (streaming) · 0.94 (streaming) · 0.80 (streaming) · 0.78 (streaming) |
| explanation | 0.60 (streaming) · 0.74 (streaming) · 0.88 (streaming) · 0.94 (streaming) · 0.95 (streaming) · 0.85 (streaming) · 0.84 (streaming) |
| chat | 0.55 (streaming) · 0.70 (streaming) · 0.85 (streaming) · 0.92 (streaming) · 0.90 (streaming) · 0.88 (streaming) · 0.90 (streaming) |
| best_for | completions fast_gap_suggestions inline_assist (streaming) · code_gen gap_resolution explain_error (streaming) · full_generation architecture_review deep_refactor (streaming) · complex_generation spec_writing full_review (streaming) · large_generation architecture complex_refactor (streaming) · explanation chat voice_response (streaming) · chat explanation voice_response (streaming) |
| starts_with | string_prefix_match (handlers) |
| contains | string_contains_match (handlers) |
| ends_with | string_suffix_match (handlers) |
| matches | pattern_match (handlers) |
| sorted_by | collection_sort_operator (handlers) |
| descending | sort_direction_descending (handlers) |
| ascending | sort_direction_ascending (handlers) |
| http | http_protocol (network) |
| wss | websocket_secure_protocol (network) |
| sse | server_sent_events_protocol (network) |
| lan | local_area_network_binding (network) |
| method | http_method (network) |
| middleware | request_processing_layer (network) |
| cors | cross_origin_policy (network) |
| auth | authentication_gate (network) |
| jaa | json_append_array_store (jaa) |
| table | jaa_table_declaration (jaa) |
| row | jaa_row (jaa) |
| insert | jaa_insert_operation (jaa) |
| update | jaa_update_operation (jaa) |
| delete | jaa_delete_operation (jaa) |
| query | jaa_query_operation (jaa) |
| get | jaa_get_single (jaa) |
| all | jaa_get_all (jaa) |
| where | jaa_filter_clause (jaa) |
| orderby | jaa_sort_clause (jaa) |
| limit | jaa_limit_clause (jaa) |
| artifact | stored_binary_or_text_output (jaa) |
| seam_record | seam_verification_record (jaa) |
| job | queued_execution_unit (jaa) |
| gap_record | gap_table_entry (jaa) |
| gap_question | gap_triggered_context_question (jaa) |
| setting | persistent_configuration_value (jaa) |
| download | detected_file_download (jaa) |
| provider | ai_provider_declaration (agent) |
| agent | execution_agent (agent) |
| job_dispatch | route_job_to_provider (agent) |
| job_result | agent_job_output (agent) |
| inject | inject_text_into_provider_ui (agent) |
| submit | submit_injected_text (agent) |
| dom_map | dom_element_registry (agent) |
| dom_watch | dom_mutation_observer (agent) |
| selector | dom_css_selector (agent) |
| contenteditable | text_input_target (agent) |
| claim | tab_ownership_signal (agent) · atomic_ownership_of_agent_call (raid) |
| release | tab_release_signal (agent) |
| userscript | browser_extension_script (agent) |
| pending | job_awaiting_execution (agent) |
| generating | job_in_progress (agent) |
| truncated | incomplete_response_signal (agent) |
| verdict | seam_evaluation_result (agent) |
| search | query_memory_store (memory) |
| tier | memory_tier_classification (memory) |
| hot | active_memory_tier (memory) |
| warm | recent_memory_tier (memory) |
| cold | archived_memory_tier (memory) |
| forgotten | deleted_memory_tier (memory) |
| index | memory_search_index (memory) |
| cortex | deep_memory_store (memory) · interactive_cli_and_memory_query_tool (cortex) |
| context_build | assemble_agent_context (memory) |
| upload | file_upload_signal (memory) |
| drag_drop | file_drag_drop_signal (memory) |
| mime | file_mime_type (memory) |
| size | file_size_bytes (memory) |
| link | idea_relationship (idearium) |
| spec_node | idea_specification (idearium) |
| gap_node | idea_gap_record (idearium) · declare_gap_node (forge_pipeline) |
| seed | idea_phase_seed (idearium) |
| expanding | idea_phase_expanding (idearium) |
| tensioned | idea_phase_tensioned (idearium) |
| specced | idea_phase_specced (idearium) |
| building | idea_phase_building (idearium) |
| causal_link | link_type_causal (idearium) |
| temporal_link | link_type_temporal (idearium) |
| semantic_link | link_type_semantic (idearium) |
| tension_engine | tension_calculation_system (idearium) |
| gap_density | tension_component_gap_density (idearium) |
| contradiction_score | tension_component_contradiction (idearium) |
| novelty_score | tension_component_novelty (idearium) |
| version_chain | ordered_version_history (versionium) |
| snapshot_version | point_in_time_version (versionium) |
| tag_version | version_tag_label (versionium) |
| projection | cli_to_ui_projection (contract) |
| sync | state_synchronization_signal (contract) |
| console_sync | console_to_chat_synchronization (contract) |
| live_tail | real_time_log_stream (contract) |
| drag_zone | file_drop_target (contract) |
| upload_zone | file_upload_target (contract) |
| page | dedicated_record_view (contract) |
| tab_view | tabbed_panel_view (contract) |
| dynamic | runtime_rendered_content (contract) |
| fluid | responsive_layout_signal (contract) |
| cobalt | nexus_central_event_bus_and_registry (cobalt) |
| cobalt_bus | pattern_matching_publish_subscribe_bus (cobalt) |
| cobalt_node | registered_module_in_cobalt_registry (cobalt) |
| cobalt_ledger | append_only_deduplicated_event_log (cobalt) |
| ring_buffer | last_N_events_circular_store (cobalt) |
| sealed | immutable_after_construction (cobalt) |
| project | cobalt_manifest_declaration (cobalt) |
| manifest | module_identity_and_intent_declaration (cobalt) |
| raid | routing_and_agent_intelligence_dispatcher (raid) |
| agent_call | queued_inference_request (raid) |
| routed_to | selected_agent_name (raid) |
| route_reason | routing_decision_explanation (raid) |
| local_first | ollama_before_cloud_law (raid) |
| agent_priority | ordered_agent_preference_list (raid) |
| orion | observation_record_and_inference_system (orion) |
| sensor | bridge_message_accumulator (orion) |
| orion_session | accumulated_bridge_message_set (orion) |
| policy | evaluate_session_against_rules (orion) |
| verify | confirm_policy_verdict (orion) |
| buffering | session_still_accumulating (orion) |
| measured | session_feature_extraction_complete (orion) |
| evaluated | policy_applied_to_session (orion) |
| verified | verdict_confirmed (orion) |
| shape_sample | captured_behavioral_fingerprint (orion) |
| callto_id | routing_identifier_for_session (orion) |
| cortex_memory | distilled_long_term_memory_store (cortex) |
| memory_index | searchable_memory_index (cortex) |
| conditioning_log | agent_conditioning_history (cortex) |
| feedback_score | agent_response_quality_score (cortex) |
| fix_map | healer_resolution_record (cortex) |
| bep_pattern | behavioral_encoding_pattern (cortex) |
| active_trace | live_causal_execution_trace (cortex) |
| agent_signature | agent_behavioral_fingerprint (cortex) |
| forge_module | full_module_rewrite_operation (forge_engine) |
| forge_patch | minimal_targeted_patch_operation (forge_engine) |
| forge_gate | generate_siso_gate_function (forge_engine) |
| forge_hook | add_exported_function_with_uuid (forge_engine) |
| patch_record | forge_patch_audit_record (forge_engine) |
| system_nucleus | ai_system_prompt_for_self_modification (forge_engine) |
| constraint_field | structured_meaning_substrate (forge_engine) |
| hook_uuid | unique_hook_identifier (forge_engine) |
| hook_comment | uuid_annotation_on_symbol (forge_engine) |
| forge_timeout | maximum_inference_duration_ms (forge_engine) |
| pipeline_node | single_execution_unit_in_pipeline (forge_pipeline) |
| node_type | pipeline_node_category (forge_pipeline) |
| trigger_node | pipeline_activation_node (forge_pipeline) |
| condition_node | if_then_else_gate_node (forge_pipeline) |
| transform_node | pure_data_transformation (forge_pipeline) |
| api_call_node | http_fetch_execution_node (forge_pipeline) |
| agent_call_node | guardian_inference_dispatch (forge_pipeline) |
| store_node | jaa_write_operation (forge_pipeline) |
| emit_node | siso_bus_event_emission (forge_pipeline) |
| loop_node | array_iteration_node (forge_pipeline) |
| delay_node | wait_n_milliseconds (forge_pipeline) |
| seam_compile_node | run_seam_compiler (forge_pipeline) |
| notify_node | toast_log_output_node (forge_pipeline) |
| merge_node | join_parallel_branches (forge_pipeline) |
| fork_node | parallel_branch_execution (forge_pipeline) |
| pipeline_run | single_pipeline_execution_instance (forge_pipeline) |
| condition_evaluator | safe_expression_parser_no_eval (forge_pipeline) |
| seam_web | constraint_language_type_system (seam_lang) |
| ring1 | primitive_seam_type_layer (seam_lang) |
| ring2 | composite_seam_type_layer (seam_lang) |
| sealed_core | immutable_siso_jaa_foundation (seam_lang) |
| web_path | type_navigation_through_seam_web (seam_lang) |
| bridge_keyword | non_adjacent_type_jump_resolver (seam_lang) |
| web_type_violation | gap_for_invalid_web_path (seam_lang) |
| seam_pass0 | tokenise_and_classify (seam_lang) |
| seam_pass1 | build_constraint_field (seam_lang) |
| seam_pass2 | resolve_gaps_and_bridges (seam_lang) |
| seam_pass3 | emit_executable_js (seam_lang) |
| seam_compile | run_all_seam_passes (seam_lang) |
| seam_validate | check_seam_source_for_violations (seam_lang) |
| nex_file | bootable_sandbox_archive (seam_lang) |
| nex_envelope | nex_file_header_with_sha256 (seam_lang) |
| shadow_layer | mutable_overlay_on_nex_sandbox (seam_lang) |
| cos_compartment | container_operating_system_sandbox (seam_lang) |
| forge_ide | constraint_first_authoring_environment (forge_ide) |
| spec_container | spec_file_that_instantiates_ide (forge_ide) |
| spec_hook | siso_bus_registration_from_spec (forge_ide) |
| gate_chain | compiler_as_constraint_field_sequence (forge_ide) |
| gtci_loop | gap_taxonomy_question_agent_fix_cycle (forge_ide) |
| word_lattice | session_derived_shared_language_graph (forge_ide) |
| prose_editor | block_based_contenteditable (forge_ide) |
| code_editor | syntax_highlight_overlay_editor (forge_ide) |
| field_pane | constraint_field_gap_bep_display (forge_ide) |
| preview_pane | html_field_spec_build_preview (forge_ide) |
| console_pane | bus_event_stream_cli_repl (forge_ide) |
| debug_overlay | per_component_isolation_4_states (forge_ide) |
| null_bus | isolated_component_event_sink (forge_ide) |
| swirl_engine | van_gogh_flow_field_particle_system (forge_ide) |
| browser_bridge | userscript_to_guardian_server_channel (userscript) |
| dom_observer | mutation_observer_wrapping_agent_ui (userscript) |
| agent_tab | claimed_browser_tab_for_job_execution (userscript) |
| tab_discovery | find_or_open_agent_tab (userscript) |
| tab_lock | exclusive_tab_ownership_for_job (userscript) |
| job_queue | ordered_pending_job_list (userscript) |
| queue_compartment | single_job_in_queue_with_state (userscript) |
| detector | sigma_delta_truncation_evaluator (userscript) |
| sigma_detect | response_distribution_divergence_check (userscript) |
| delta_score | weighted_diff_between_request_response (userscript) |
| truncation_detect | incomplete_response_identifier (userscript) |
| retry_protocol | failure_context_injection_for_retry (userscript) |
| escalate_gap | create_gap_record_after_max_retries (userscript) |
| prompt_archaeology | streaming_token_behavioral_analysis (userscript) |
| pa_session | single_pa_measurement_window (userscript) |
| burst_zone | high_token_velocity_cluster (userscript) |
| pause_zone | inter_token_gap_above_threshold (userscript) |
| waveform | token_velocity_over_time_canvas (userscript) |
| spec_file | yaml_structured_specification_document (spec_parser) |
| spec_block | named_section_in_spec_file (spec_parser) |
| spec_chunk | parsed_deliverable_unit_of_spec (spec_parser) |
| chunk_parser | split_spec_into_deliverable_chunks (spec_parser) |
| split_on | chunk_split_strategy_selector (spec_parser) |
| heading_split | split_on_markdown_headings (spec_parser) |
| divider_split | split_on_horizontal_rules (spec_parser) |
| phase_split | split_on_phase_or_step_markers (spec_parser) |
| custom_split | split_on_user_defined_regex (spec_parser) |
| chunk_profile | expected_response_characteristics_of_chunk (spec_parser) |
| seam_contract | auto_generated_test_contract_for_chunk (spec_parser) |
| chunk_verdict | pass_fail_result_from_agent_for_chunk (spec_parser) |
| auto_inject | automatic_sequential_chunk_delivery (spec_parser) |
| versionium | content_addressable_version_control (versionium_full) |
| versionium_commit | content_addressed_snapshot (versionium_full) |
| versionium_branch | named_pointer_to_commit_chain (versionium_full) |
| versionium_calendar | time_indexed_commit_history (versionium_full) |
| versionium_file_index | file_path_to_object_hash_map (versionium_full) |
| versionium_object | content_addressed_stored_object (versionium_full) |
| file_refs | named_reference_to_file_store_hash (versionium_full) |
| file_store | content_addressable_blob_storage (versionium_full) |
| sha256 | content_hash_algorithm (versionium_full) |
| fork_version | create_divergent_version_chain (versionium_full) |
| cockpit | guardian_control_panel_ui (cockpit) |
| cockpit_mode | operational_display_mode (cockpit) |
| deep_mode | full_signal_display (cockpit) |
| fast_mode | minimal_overhead_display (cockpit) |
| audit_mode | expanded_signal_audit (cockpit) |
| creative_mode | creative_workflow_display (cockpit) |
| emergency_mode | command_only_display (cockpit) |
| silent_mode | stream_and_command_only (cockpit) |
| topbar | persistent_status_bar (cockpit) |
| sigma_ring | live_sigma_score_indicator (cockpit) |
| compare_panel | dual_agent_comparison_panel (cockpit) |
| broadcast_mode | fire_same_prompt_to_multiple_agents (cockpit) |
| capture_panel | artifact_capture_display (cockpit) |
| event_viewer | live_siso_bus_event_grouped_display (cockpit) |
| appid | guardian_application_identity_token (cockpit) |
| session_token | guardian_session_authentication_token (cockpit) |
| extension | firefox_browser_extension (guardian_ext) |
| content_script | per_tab_injected_script (guardian_ext) |
| background_js | extension_background_orchestrator (guardian_ext) |
| popup_js | extension_popup_ui (guardian_ext) |
| cfr | constraint_field_runtime (guardian_ext) |
| cesl | canonical_execution_service_layer (guardian_ext) |
| rat | reproducible_automation_trace (guardian_ext) |
| urck | universal_runtime_constraint_kernel (guardian_ext) |
| ir_layer | intent_routing_layer (guardian_ext) |
| callto | routing_packet_to_agent (guardian_ext) |
| callto_state | lifecycle_state_of_callto_packet (guardian_ext) |
| delivery_mode | callto_delivery_guarantee_level (guardian_ext) |
| fire_and_forget | delivery_no_ack_required (guardian_ext) |
| at_least_once | delivery_with_retry (guardian_ext) |
| exactly_once | delivery_with_dedup (guardian_ext) |
| guarded_pipeline | delivery_with_full_verification (guardian_ext) |
| instance_id | unique_extension_instance_identifier (guardian_ext) |
| automation_trace | cesl_deterministic_event_record (guardian_ext) |
| siphon | server_side_chat_ingestion_module (siphon) |
| watchman | guardian_health_monitor (siphon) |
| chat_session | normalized_captured_chat_session (siphon) |
| chat_message | individual_message_in_session (siphon) |
| chat_completion | complete_agent_response_record (siphon) |
| guardian_node | registered_guardian_extension_instance (siphon) |
| guardian_health | system_health_summary_record (siphon) |
| health_score | 0_to_1_guardian_health_metric (siphon) |
| stale_node | guardian_node_without_recent_heartbeat (siphon) |
| siphon_ingest | normalize_bridge_event_to_chat_table (siphon) |
| beta_distribution | bayesian_trust_model (trust) |
| alpha | beta_pass_count (trust) |
| beta_param | beta_fail_count (trust) |
| posterior_mean | expected_trust_score (trust) |
| wilson_lower | conservative_routing_weight (trust) |
| confidence_n | total_observations (trust) |
| decay_halflife | trust_score_decay_period (trust) |
| routing_weight | raid_agent_selection_weight (trust) |
| cold_start_floor | minimum_weight_for_new_source (trust) |
| snr_record | single_gate_evaluation_record (trust) |
| trust_band | categorical_trust_level (trust) |

## Only in the upload (98)

| term | definition (domain) |
|---|---|
| substrate | the_medium_through_which_signals_travel (structure) |
| sink | where_a_signal_terminates (signal) |
| broadcast | a_signal_sent_to_all_listeners (signal) · send_to_all_connected_endpoints (network) |
| drop | discard_a_signal_with_a_record (signal) · a_signal_that_violated_an_axiom (constraints) |
| drift | directional_movement_away_from_baseline (observation) · identity_moving_away_from_its_own_baseline (identity) |
| identity | the_stable_structural_signature_of_a_thing (observation) |
| divergence | distance_between_a_thing_and_its_identity (observation) |
| health | composite_signal_quality_over_time (observation) |
| alignment | when_a_signal_matches_its_identity (field) |
| regime.stable | sigma_within_normal_bounds (field) |
| regime.drifting | sigma_moving_directionally (field) |
| regime.diverged | sigma_beyond_recovery_threshold (field) |
| regime.oscillating | sigma_alternating_periodically (field) |
| regime.collapsing | coherence_approaching_zero (field) |
| gap.structural | a_field_or_key_that_should_exist_but_does_not (gap) |
| gap.logical | a_contradiction_in_the_structure_of_a_thing (gap) |
| gap.evidential | a_claim_without_supporting_data (gap) |
| gap.temporal | expected_sequence_that_did_not_arrive (gap) |
| gap.causal | a_cause_without_a_traceable_effect (gap) |
| gap.contextual | structure_missing_its_surrounding_conditions (gap) |
| gap.assumption | an_implied_invariant_that_was_never_stated (gap) |
| gap.contradiction | two_true_things_that_cannot_coexist (gap) |
| promotion | a_gap_resolved_into_known_structure (gap) |
| append | write_one_entry_to_a_record (record) |
| tail | read_the_last_n_entries_of_a_record (record) |
| fingerprint | a_structural_signature_of_a_thing_not_its_values (identity) |
| presence | how_often_a_field_appears_in_a_stream (identity) |
| dominant | the_most_frequent_structure_in_a_window (identity) |
| lens | an_observer_that_annotates_without_changing_flow (lens) |
| delta_lens | measures_structural_divergence_from_ledger_history (lens) |
| sigma_lens | compares_two_sources_for_drift (lens) |
| trend_lens | measures_directional_movement_over_time (lens) |
| gap_lens | detects_fields_missing_from_identity (lens) |
| edge_lens | fires_when_a_value_crosses_a_threshold (lens) |
| custom_lens | any_user_defined_observer (lens) |
| store | keyed_document_memory_queryable_by_key (memory) · a_node_that_writes_to_memory (pipeline) |
| tier.hot | active_in_process_memory (memory) |
| tier.warm | recent_on_disk_memory (memory) |
| tier.cold | archived_compressed_memory (memory) |
| tier.frozen | immutable_crystallized_memory (memory) |
| sequence | an_ordered_series_of_events (time) |
| recency | how_fresh_a_signal_is (time) |
| expiry | the_point_at_which_a_thing_is_no_longer_valid (time) |
| unless | if_not (flow) |
| catch | handle_failure_without_halt (flow) |
| purge | delete_with_a_record (persistence) |
| bus | a_shared_event_spine_all_components_use (events) |
| event | a_named_observable_moment (events) |
| handler | a_component_that_responds_to_an_event (events) |
| publish | emit_an_event_to_the_bus (events) |
| subscribe | register_to_receive_an_event (events) |
| unsubscribe | remove_a_handler_from_an_event (events) |
| once | handle_an_event_exactly_once (events) |
| connection | a_persistent_link_between_two_endpoints (network) |
| widget | a_named_reusable_visual_component (render) · which_widget_type_to_mount (contract) |
| node | a_single_execution_unit_in_a_pipeline (pipeline) |
| trigger | a_node_that_starts_a_pipeline (pipeline) |
| condition | a_node_that_branches_on_a_predicate (pipeline) |
| transform | a_node_that_mutates_data (pipeline) |
| call | a_node_that_invokes_another_component (pipeline) |
| delay | a_node_that_waits_a_duration (pipeline) |
| notify | a_node_that_sends_a_notification (pipeline) |
| description | human_readable_description_field (fields) |
| enabled | is_active_flag (fields) · is_this_plugin_currently_active (plugin) |
| ts | timestamp_field (fields) |
| plugin | a_named_transform_loaded_at_runtime (plugin) |
| config | mutable_runtime_configuration (plugin) |
| process | the_transform_function_of_a_plugin (plugin) |
| stats | observable_metrics_of_a_plugin (plugin) |
| enable | activate_a_plugin (plugin) |
| disable | deactivate_a_plugin (plugin) |
| hot_reload | replace_a_plugin_without_restart (plugin) |
| control | an_interactive_element_bound_to_a_config_or_command (contract) |
| display | a_mapping_of_labels_to_observable_values (contract) |
| emits | events_this_component_produces (contract) |
| rule | a_predicate_over_data_and_meta (constraints) |
| violation | the_named_reason_a_rule_failed (constraints) · a_constraint_broken_by_source (compiler) |
| evaluate | test_all_axioms_against_a_signal (constraints) |
| pass | a_signal_satisfied_all_axioms (constraints) · a_single_compiler_transformation_step (compiler) |
| phase.seed | idea_first_proposed (speculation) |
| phase.expanding | idea_being_elaborated (speculation) |
| phase.tensioned | idea_under_pressure_from_gaps (speculation) |
| phase.specced | idea_has_a_declared_structure (speculation) |
| phase.building | idea_being_implemented (speculation) |
| phase.promoted | idea_validated_and_recorded (speculation) |
| bpm | beats_per_minute_of_a_heartbeat (liveness) |
| latency | time_between_a_signal_and_its_response (liveness) |
| dead | a_component_that_has_stopped_responding (liveness) |
| recover | a_component_returning_to_liveness (liveness) |
| unregister | remove_a_component_from_liveness_monitoring (liveness) |
| spec | a_file_that_defines_a_system_in_emerge (compiler) |
| domain | a_named_vocabulary_group_within_a_spec (compiler) |
| primitive | a_single_word_with_a_declared_meaning (compiler) |
| root | a_top_level_type_in_a_spec (compiler) |
| tokenise | split_source_into_primitive_units (compiler) |
| classify | assign_domain_and_type_to_each_token (compiler) |
| resolve | find_the_meaning_of_each_primitive (compiler) |
| bridge | a_non_adjacent_type_resolution (compiler) |
