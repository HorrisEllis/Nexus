spec:
  meta:
    name:        jaa-db
    version:     6.0.0
    foundation:  nexus-system-foundation@1.0.0
    uuid:        nexus-jaa-db-v1-0000-2026-0615-jamesbrooks-001
    purpose: >
      Persistent storage for NEXUS. Flat-file JSONL backed in-memory Map. 53 tables across three tiers: working (30min), short (6hr), long (permanent). §2.1: disk write before in-memory update. Auto-hooks vector-memory on insert.

  tables:
    working:   [active_traces, working_memory]
    short:     [agent_messages, cortex_memory, gaps, artifacts, agent_calls, orion_sessions, seam_records, sigma_records, delta_records, snr_records, ime_profiles, event_log, toasts, healer_log, chat_log]
    long:      [crystals, intent_nodes, bep_patterns, forge_patches, project_registry, fault_taxonomy, failure_modes, escalation_log, components, versionium_commits, versionium_branches, versionium_file_index, causality_nodes, and 23 others]
  exports:
    - "new JaaDB({ dir }) → db"
    - "db.insert(table, record) → record"
    - "db.update(table, uuid, patch) → record"
    - "db.query(table, fn, limit?) → record[]"
    - "db.tail(table, n) → record[]"
    - "db.count(table) → number"
    - "db.requireTable(table) → void"
