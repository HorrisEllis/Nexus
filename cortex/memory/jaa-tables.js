'use strict';
// ── cortex/memory/jaa-tables.js ───────────────────────────────────────────────
// UUID: jaa-tables-v2-0000-4000-0000-000000000001
// Version: 2.0.0
//
// SINGLE SOURCE OF TRUTH for every JAA table name.
// Import this — never hardcode table strings in modules.
//
// §WM.2  — all tables are internal first.  External systems read via
//          admin-server query endpoints, never direct JAA access.
// §1.1   — undeclared tables warn loudly (JaaDB._requireTable).
//
// Table groups mirror the system layers:
//   FOUNDATION  — logs, failures, boot records
//   WORKING_MEMORY — the hot event spine (see working-memory/index.js)
//   GUARDIAN    — job/provider/artifact/gap state mirrored from Guardian
//   CORTEX      — agent calls, crystals, bep, memory index
//   RELAY       — kernel↔guardian relay queue
//   SEAM        — spec execution records
//   VERSIONIUM  — source control layer
//   AUTOMATION  — workflow runs, schedules
//   COGNITION   — self-model, intent nodes

const TABLES = {

  // ── Foundation ─────────────────────────────────────────────────────────────
  EVENT_LOG:          'event_log',
  FAILURES:           'failures',
  BOOT_RECORDS:       'boot_records',
  LAW_VIOLATIONS:     'law_violations',
  TOASTS:             'toasts',
  CLI_HISTORY:        'cli_history',
  AGENT_SIGNATURES:   'agent_signatures',
  SHAPE_SAMPLES:      'shape_samples',

  // ── Working memory ─────────────────────────────────────────────────────────
  // The universal event spine.  See cortex/working-memory/index.js.
  // Every system event is written here first (§WM.1).
  // admin-server exposes /api/wm/* for query access.
  // This JAA table mirrors the JSONL file so the admin health endpoint
  // can report counts without reading the flat file directly.
  WM_INDEX:           'wm_index',     // lightweight index: uuid | type | source | ts | causedBy

  // ── Guardian mirror ────────────────────────────────────────────────────────
  // These tables are written by mind-bridge whenever Guardian reports state.
  // §WM.2: Guardian never writes to Cortex JAA directly — only via mind-bridge.
  GUARDIAN_HEALTH:    'guardian_health',
  GUARDIAN_JOBS:      'guardian_jobs',
  GUARDIAN_PROVIDERS: 'guardian_providers',
  GUARDIAN_ARTIFACTS: 'guardian_artifacts',
  GUARDIAN_GAPS:      'guardian_gaps',
  GUARDIAN_SESSIONS:  'guardian_sessions',
  GUARDIAN_LEDGER:    'guardian_ledger',
  GUARDIAN_RELAY:     'guardian_relay',

  // ── Relay queue ────────────────────────────────────────────────────────────
  // kernel → Cortex → Guardian relay.
  // mind-bridge keeps an in-memory Map AND persists here.
  RELAY_QUEUE:        'relay_queue',

  // ── Cortex agents ─────────────────────────────────────────────────────────
  AGENT_CALLS:        'agent_calls',
  BRIDGE_MESSAGES:    'bridge_messages',
  ACTIVE_TRACES:      'active_traces',
  CORTEX_MEMORY:      'cortex_memory',
  MEMORY_INDEX:       'memory_index',
  MEMORY_QUERIES:     'memory_queries',
  CRYSTALS:           'crystals',
  BEP_PATTERNS:       'bep_patterns',
  CONDITIONING_LOG:   'conditioning_log',
  FEEDBACK_SCORES:    'feedback_scores',

  // ── Signal / Causal ────────────────────────────────────────────────────────
  SNR_RECORDS:        'snr_records',
  TRUST_SCORES:       'trust_scores',
  DELTA_RECORDS:      'delta_records',
  IME_PROFILES:       'ime_profiles',
  ORION_SESSIONS:     'orion_sessions',
  SEAM_RECORDS:       'seam_records',
  SIGMA_RECORDS:      'sigma_records',
  GAPS:               'gaps',
  ARTIFACTS:          'artifacts',
  HEALER_LOG:         'healer_log',
  FIX_MAP:            'fix_map',

  // ── Versionium ────────────────────────────────────────────────────────────
  VERSIONIUM_COMMITS:    'versionium_commits',
  VERSIONIUM_BRANCHES:   'versionium_branches',
  VERSIONIUM_FILE_INDEX: 'versionium_file_index',
  VERSIONIUM_CALENDAR:   'versionium_calendar',
  VERSIONIUM_OBJECTS:    'versionium_objects',
  CAUSALITY_NODES:       'causality_nodes',

  // ── Automation ────────────────────────────────────────────────────────────
  WORKFLOW_RUNS:      'workflow_runs',
  SCHEDULES:          'schedules',
  PROJECT_REGISTRY:   'project_registry',
  POLL_LOG:           'poll_log',
  REQUESTS:           'requests',
  BACKUP_RECORDS:     'backup_records',

  // ── Cognition ─────────────────────────────────────────────────────────────
  SELF_MODEL:         'self_model',
  INTENT_NODES:       'intent_nodes',
};

// Flat array — passed to JaaDB constructor and used for table validation
const ALL_TABLES = Object.values(TABLES);

module.exports = { TABLES, ALL_TABLES };
