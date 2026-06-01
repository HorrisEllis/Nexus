// EMERGE CANONICAL SPEC v1.0.0
// UUID: emerge-spec-canonical-v1-0-0
// This file IS the SNR gate's definition of valid signal.
// Edit this file → compiler behavior updates on next run.

version 1.0.0

// ── Root types ────────────────────────────────────────────────────────────────
root Structure
root Signal
root Observation
root Gap
root Record
root Identity

// ── Axioms ────────────────────────────────────────────────────────────────────
axiom NO_SILENT_DROP
axiom SIGNAL_MUST_ROUTE_OR_LOG
axiom GAP_IS_FIRST_CLASS
axiom EXECUTION_IS_TRACEABLE
axiom RECORD_IS_TRUTH
axiom PROOF_REQUIRED_FOR_PROMOTION
axiom GRAMMAR_APPLIES_TO_ITSELF

// ── Domain 1 — Structure ──────────────────────────────────────────────────────
domain "structure"
system      = runtime_environment
core        = immutable_execution_rules
invariant   = always_true
axiom       = global_invariant
maxim       = conditional_invariant
constraint  = local_invariant
component   = transform
framework   = external_executable_component
compartment = bounded_container
seam        = boundary_between_components
edge        = defined_transition_boundary
gate        = execution_control_point

// ── Domain 2 — Signal Physics ─────────────────────────────────────────────────
domain "signal"
signal      = expected_state_transition
state       = current_system_condition
context     = surrounding_runtime_conditions
input       = data
output      = data
flow        = directed_signal_path
feedback    = output_to_input
loop        = repeat_component

// ── Domain 3 — Observation ────────────────────────────────────────────────────
domain "observation"
observer    = monitors_runtime_behavior
baseline    = established_expected_behavior
sigma       = observes_baseline_divergence
delta       = distance_expected_actual
slope       = rate_of_change_delta
polarity    = direction_of_divergence
trend       = trajectory_over_time
observation = sigma_result

// ── Domain 4 — Runtime Physics ───────────────────────────────────────────────
domain "runtime"
coherence   = ability_to_hold_structure
entropy     = structural_disorder
friction    = conflicting_structure
pressure    = significance_of_missing_structure
density     = generative_potential_of_gap
stability   = coherence_over_entropy
sigma_regime = stable
stable      = sigma_regime_stable
degraded    = sigma_regime_degraded
collapsing  = sigma_regime_collapsing
oscillatory = sigma_regime_oscillatory

// ── Domain 5 — Failure ───────────────────────────────────────────────────────
domain "failure"
noise       = invalid_signal
gap         = missing_structure
decay       = temporary_state_expiration
recycle     = decay_preserving_axioms

// ── Domain 6 — Gap Field ─────────────────────────────────────────────────────
domain "gap_field"
gap.logical
gap.evidential
gap.temporal
gap.assumption
gap.contradiction
gap.structural
gap.contextual
gap.causal
uncertainty = unknown_structure
omission    = expected_structure_missing
inference   = implied_structure

// ── Domain 7 — Cognition ─────────────────────────────────────────────────────
domain "cognition"
whatif      = speculative_branch
if          = deterministic_condition
then        = deterministic_outcome
try         = attempt_execution
else        = fallback_execution

// ── Domain 8 — Ledger ────────────────────────────────────────────────────────
domain "ledger"
idea        = speculative_record
upgrade     = validated_record
proof       = typed_validation
ledger      = authoritative_timeline
promote     = idea_to_upgrade
conversion  = ideas_over_upgrades
bottleneck  = unresolved_speculative_load

// ── Domain 9 — Time ──────────────────────────────────────────────────────────
domain "time"
record      = authoritative_sequence
snapshot    = point_in_time_state
clip        = bounded_record_window
replay      = reconstruct_from_record
reconstruct = rebuild_state
fork        = branch_record
lineage     = ancestry_of_record
compress    = encode_record
blueprint   = structural_digest

// ── Domain 10 — Identity ─────────────────────────────────────────────────────
domain "identity"
uuid        = unique_identity
systemid    = first_2_chars
componentid = next_6_chars
shortid     = systemid_plus_componentid

// ── Domain 11 — Persistence ──────────────────────────────────────────────────
domain "persistence"
persist     = write_to_record
restore     = read_from_record
archive     = compress_record

// ── Domain 12 — Invariants / Laws ────────────────────────────────────────────
domain "laws"
law         = derived_theorem
emit        = observable_event
route       = directed_output
log         = append_to_record
halt        = stop_execution
observe     = sigma_call
measure     = quantify_friction
reinject    = feedback_to_input
integrity   = structural_match
fidelity    = behavioral_match
oscillate   = periodic_state
signals     = score_vector

// ── Domain 13 — Type System ───────────────────────────────────────────────────
// Covers field type annotations: field : type syntax
domain "types"
string      = text_value
float       = decimal_value
int         = integer_value
bool        = boolean_value
timestamp   = time_value
list        = ordered_collection
map         = keyed_collection
ring        = bounded_circular_buffer
any         = unconstrained_value
null        = empty_value
required    = must_be_present
optional    = may_be_absent
score       = weighted_composite_value
hash        = cryptographic_digest
semver      = semantic_version_string

// ── Domain 14 — Output / Emit ─────────────────────────────────────────────────
// Covers output declarations in setup and compiler programs
domain "output"
output      = declared_file_target
type        = output_type_declaration
file        = filesystem_artifact
content     = output_content_key
template    = output_template_key
raw         = literal_output_content
emit        = observable_event

// ── Domain 15 — Field Syntax ──────────────────────────────────────────────────
// Covers both = and : field declaration styles
domain "fields"
id          = component_identity_field
uuid        = universal_unique_identity
version     = semver_field
name        = human_readable_name
intent      = declared_purpose
source      = origin_reference
target      = destination_reference
path        = filesystem_or_signal_path
mode        = operational_mode
interval    = timing_period
priority    = execution_priority
reason      = explanation_field
note        = annotation_field
severity    = criticality_level
status      = current_state_field
alive       = liveness_flag
ready       = readiness_flag
running     = execution_state_flag

// ════════════════════════════════════════════════════════════════════════════
// EMERGE SPEC EXTENSION — IDE + VOICE + LLM STREAMING
// version 1.1.0
// All new primitives required before IDE, voice, and AI can be written in .eg
// ════════════════════════════════════════════════════════════════════════════

// ── Domain 16 — Render / UI Primitives ───────────────────────────────────────
domain "render"
render      = produce_visual_output
panel       = bounded_visual_region
layout      = spatial_arrangement_of_panels
cursor      = position_in_editor_signal
selection   = bounded_cursor_range
keybind     = keyboard_input_signal
keydown     = key_pressed_signal
keyup       = key_released_signal
scroll      = viewport_position_signal
focus       = active_panel_signal
blur        = inactive_panel_signal
theme       = visual_style_declaration
syntax      = token_coloring_rules
gutter      = line_number_region
minimap     = compressed_document_overview
tab         = named_panel_tab
split       = panel_division
resize      = panel_boundary_adjustment
tooltip     = contextual_hover_display
modal       = blocking_overlay_panel
toast       = non_blocking_notification
statusbar   = persistent_bottom_panel

// ── Domain 17 — Editor Primitives ────────────────────────────────────────────
domain "editor"
buffer      = mutable_text_content
line        = single_text_row
token       = lexed_text_unit
span        = styled_token_range
decoration  = non_printing_editor_overlay
marker      = position_annotation
diagnostic  = error_or_gap_annotation
fold        = collapsed_region
indent      = leading_whitespace_signal
autocomplete = completion_suggestion_list
hover       = contextual_signal_on_token
goto        = navigation_signal
find        = text_search_signal
replace     = text_mutation_signal
undo        = state_revert_signal
redo        = state_forward_signal
format      = source_normalisation_signal

// ── Domain 18 — Language Server (LSP as seam) ─────────────────────────────────
domain "lsp"
lsp         = language_server_seam
complete    = autocomplete_result
hover_info  = token_documentation
definition  = symbol_definition_location
references  = symbol_usage_locations
rename      = symbol_rename_signal
symbols     = document_symbol_list
diagnostics = gap_and_error_list
codelens    = inline_action_annotation
action      = code_action_signal
workspace   = multi_file_context

// ── Domain 19 — AI Assistance ─────────────────────────────────────────────────
domain "ai"
assist      = ai_suggestion_signal
suggest     = single_ai_suggestion
accept      = suggestion_accepted_signal
reject      = suggestion_rejected_signal
explain     = ai_explanation_signal
refactor    = ai_refactor_signal
generate    = ai_generation_signal
review      = ai_review_signal
context     = ai_prompt_context
prompt      = ai_input_signal
response    = ai_output_signal
token_stream = continuous_token_output
chunk       = single_token_or_word_unit
model       = llm_model_declaration
catalog     = ordered_model_registry
fitness     = model_capability_score
task        = inference_task_type
temperature = sampling_temperature
max_tokens  = output_length_limit
stop        = generation_stop_signal
thinking    = reasoning_trace_signal

// ── Domain 20 — Ollama Seam ───────────────────────────────────────────────────
domain "ollama"
ollama      = local_inference_runtime
pull        = download_model_signal
list        = available_models_signal
run         = inference_execution_signal
stream      = streaming_inference_signal
abort       = cancel_inference_signal
ping        = runtime_health_check
endpoint    = ollama_api_address
model_info  = model_metadata_record

// ── Domain 21 — Voice ─────────────────────────────────────────────────────────
domain "voice"
voice       = audio_input_output_seam
microphone  = audio_capture_device
speaker     = audio_output_device
transcribe  = audio_to_text_transform
synthesize  = text_to_audio_transform
tts         = text_to_speech_signal
stt         = speech_to_text_signal
utterance   = complete_spoken_unit
phrase      = partial_spoken_unit
silence     = audio_gap_signal
vad         = voice_activity_detection
wakeword    = activation_phrase_signal
interim     = partial_transcription_signal
final       = complete_transcription_signal
speak       = tts_output_command
listen      = stt_input_command
mute        = disable_microphone_signal
unmute      = enable_microphone_signal
volume      = audio_level_signal
pitch       = tts_pitch_parameter
rate        = tts_speech_rate_parameter
voice_id    = tts_voice_selection

// ── Domain 22 — Streaming ─────────────────────────────────────────────────────
domain "streaming"
pipe        = continuous_signal_channel
buffer_stream = in_flight_token_accumulator
flush       = emit_buffered_stream_signal
backpressure = stream_flow_control_signal
drain       = consume_all_buffered_signal
watermark   = stream_position_marker
window      = bounded_stream_slice
throttle    = rate_limited_stream_signal
debounce    = delayed_stream_signal

// ── Model Catalog (sorted by fitness per task) ────────────────────────────────
// fitness scores: 0.0 (worst) → 1.0 (best) per task axis
// axes: code_gen, completion, explanation, chat, speed, vram_gb

catalog EMERGE_MODEL_CATALOG {

  model "qwen2.5-coder:1.5b" {
    ollama_id   = qwen2.5-coder:1.5b
    vram_gb     = 1.5
    speed       = 0.98
    code_gen    = 0.72
    completion  = 0.85
    explanation = 0.60
    chat        = 0.55
    best_for    = completions fast_gap_suggestions inline_assist
    fitness     = 0.78
  }

  model "qwen2.5-coder:3b" {
    ollama_id   = qwen2.5-coder:3b
    vram_gb     = 3.0
    speed       = 0.90
    code_gen    = 0.82
    completion  = 0.88
    explanation = 0.74
    chat        = 0.70
    best_for    = code_gen gap_resolution explain_error
    fitness     = 0.83
  }

  model "qwen2.5-coder:7b" {
    ollama_id   = qwen2.5-coder:7b
    vram_gb     = 6.5
    speed       = 0.75
    code_gen    = 0.92
    completion  = 0.90
    explanation = 0.88
    chat        = 0.85
    best_for    = full_generation architecture_review deep_refactor
    fitness     = 0.88
  }

  model "qwen2.5-coder:14b" {
    ollama_id   = qwen2.5-coder:14b
    vram_gb     = 12.0
    speed       = 0.55
    code_gen    = 0.96
    completion  = 0.93
    explanation = 0.94
    chat        = 0.92
    best_for    = complex_generation spec_writing full_review
    fitness     = 0.94
  }

  model "deepseek-coder-v2:16b" {
    ollama_id   = deepseek-coder-v2:16b
    vram_gb     = 14.0
    speed       = 0.45
    code_gen    = 0.97
    completion  = 0.94
    explanation = 0.95
    chat        = 0.90
    best_for    = large_generation architecture complex_refactor
    fitness     = 0.95
  }

  model "phi3.5:3.8b" {
    ollama_id   = phi3.5:3.8b
    vram_gb     = 3.5
    speed       = 0.88
    code_gen    = 0.78
    completion  = 0.80
    explanation = 0.85
    chat        = 0.88
    best_for    = explanation chat voice_response
    fitness     = 0.82
  }

  model "gemma3:4b" {
    ollama_id   = gemma3:4b
    vram_gb     = 3.8
    speed       = 0.85
    code_gen    = 0.76
    completion  = 0.78
    explanation = 0.84
    chat        = 0.90
    best_for    = chat explanation voice_response
    fitness     = 0.81
  }
}

// ── Domain 23 — Event Handlers ────────────────────────────────────────────────
domain "handlers"
on          = event_handler_declaration
when        = conditional_event_handler
before      = pre_event_hook
after       = post_event_hook
finally     = always_runs_handler
starts_with = string_prefix_match
contains    = string_contains_match
ends_with   = string_suffix_match
matches     = pattern_match
sorted_by   = collection_sort_operator
descending  = sort_direction_descending
ascending   = sort_direction_ascending
