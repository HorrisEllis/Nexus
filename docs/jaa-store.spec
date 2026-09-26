spec:
  meta:
    name:        jaa-store
    version:     1.0.0
    status:      written-from-live-code
    uuid:        nexus-jaa-store-v1-0000-2026-0724-jamesbrooks-001
    axioms:      [§0.1, §1.2, §2.1, §2.2, §5.10, §6.3, §9.2, §17.1]
    written_because: >
      Found unspecced 2026-07-24 while auditing the recursion/OOM fix
      (commit 0ba006d) and the still-open MP-001 race against
      AXIOMS v3.1 §8.5 ("do not build anything without creating a spec
      file first") and §17.1 ("every artifact has an owner"). This file
      is the shared persistence layer for 9+ NEXUS processes and had
      never been documented — jaa-db.spec (docs/jaa-db.spec) governs a
      DIFFERENT, unrelated class (JaaDB, the append-only JSONL journal
      in cortex/memory/jaa-db.js) despite the similar name. No code
      changed to produce this spec — it is a map of what already exists
      and already ships, written after the fact per §3.3.
    not_governed_by_this_spec: >
      cortex/memory/jaa-db.js exports TWO different things: (1) the
      `jaaDB` thin adapter object, which wraps a shared JaaStore
      singleton and IS covered here transitively; (2) the `JaaDB` class
      (a separate, append-only JSONL journal with tier-based decay) —
      that is docs/jaa-db.spec's subject, not this one.
    purpose: >
      Zero-native-dependency, pure-JS relational store. Tables-as-Maps
      in memory, one full-snapshot JSON file per table on disk
      (memory_store/<table>.json or a caller-chosen dir), debounced
      writes. better-sqlite3-shaped call surface so callers written
      against that API port with minimal diff. Used directly by
      guardian/server.js and, via the cortex/memory/jaa-db.js `jaaDB`
      adapter, by cortex, orchestrator, loom, copilot, diagnostic,
      idearium, and healer — 9 real processes as of the 2026-07-24
      memory-pressure fix.

  file: guardian/jaa-store.js
  class: JaaStore

  construction:
    signature: "new JaaStore(dir, opts = {}) → store"
    opts:
      tablePrefix: >
        string, default ''. §MULTI-TENANT (2026-07-18). When multiple
        systems share one directory (cortex/memory/jaa-db.js and
        guardian/server.js both point a JaaStore at the same dir), an
        unprefixed instance's _loadAll() would blindly claim every
        .json file as its own table. A prefixed instance only sees
        files starting with its prefix at the disk layer; in-memory
        Maps and every call site still use bare table names. Guardian
        uses tablePrefix: 'guardian_'.
      tables: >
        string[], default none (= load everything, unchanged legacy
        behavior). §2026-07-24 selective-load allowlist — preload ONLY
        these tables. Anything else lazy-loads on first access (see
        _table below), never reads as silently empty.
      skipTables: >
        string[], default none. §2026-07-24 — the inverse of `tables`,
        for a SHARED singleton store where no single fixed allowlist is
        correct for every consumer. Named tables are excluded from
        preload; still lazy-load on first real access. Used by
        cortex/memory/jaa-db.js to exclude idearium_spec_chunks and
        idearium_spec_manifests (10.8MB combined) from the 8 processes
        that never read them — see "known mechanisms" below for the
        2026-07-24b recursion bug this exact path had and the fix.
      mutual_exclusion: >
        `tables` and `skipTables` are not validated against each other.
        Setting both is undefined in practice — not tested, not
        forbidden. Real gap, not covered by any existing test.

  exports_public_api:
    - "insert(table, row) → row — row.id/row.key used if present, else generated"
    - "upsert(table, row, keyField='id') → row"
    - "get(table, where={}) → row | null"
    - "all(table, where={}, opts={}) → row[]  — opts: orderBy, order ('ASC'|'DESC'), limit, offset"
    - "update(table, where, values) → count"
    - "delete(table, where) → count"
    - "count(table, where={}) → number"
    - "exec() / pragma() → no-op — better-sqlite3 compat shims only"
    - "getSetting(key, fallback=null) / setSetting(key, value) / getAllSettings()"
    - "search(q, limit=50) → { artifacts[], gaps[], ledger[] } — substring match, hardcoded to those 3 tables"
    - "stats() → counts for a fixed hardcoded table list (§ known drift below)"
    - "flushAll() → force-write every dirty table now"
    - "close() → flushAll() + stop debounce timers"
    - "reloadTable(name) → force-refresh one table's in-memory Map from disk"

  where_clause_contract:
    object:   "{ field: value, ... } — AND of exact matches. null/undefined value means IS NULL."
    function: "predicate(row) → bool. The majority real-world convention (raid/snr-filter.js, cortex/intelligence, lib/replay-engine.js, lib/constitutional-ai.js, orchestrator/request-handler.js)."
    string:   "matches by row.id === where || row.uuid === where. Used by copilot/lib/user-model.js, orchestrator/lib/spec-drift.js."
    history: >
      §BUG FOUND AND FIXED — Object.entries() on a function or a string
      both silently produced [] or wrong pairs, so function-where
      matched every row and string-where matched none, for an unknown
      period before the fix landed. Not re-broken since; no regression
      test pins this specific 3-way dispatch today (real gap).

  known_mechanisms:
    debounced_flush: "insert/update/delete schedule a table for _flush() 1500ms later (debounced per-table, timer reset on repeated writes). close()/flushAll() force it immediately. §2.1 — until flush, state exists only in memory."
    multi_process_merge: >
      _flush() does NOT just write the in-memory Map. It first re-reads
      the on-disk file and merges in any row this process's Map doesn't
      already have (skipping ids this process explicitly deleted since
      its own last flush, tracked in _pendingDeletes), THEN writes the
      merged result via write-to-tmp-then-rename (atomic at the
      filesystem level). §MULTI-PROCESS FIX 2026-07-18.
    lazy_load_on_access: >
      _table(name), when name is absent from `tables` (if declared) or
      present in `skipTables`: checks the file exists, warns ONCE per
      table name (not per access), loads it. §FIX 2026-07-24b — the Map
      slot for `name` MUST be created (this._tables.set(name, new
      Map())) BEFORE calling _loadTable(name), because _loadTable
      internally calls this._table(name) to get the Map to fill; without
      the slot existing first, that inner call re-enters this same
      branch and recurses — every level re-reading and re-parsing the
      whole file, none of the stack frames returning, until the heap
      limit is hit. This is exactly the OOM idearium hit on
      idearium_spec_chunks/manifests before the fix (commit 0ba006d).
      Regression-pinned: tests/modules/test-jaa-selective-load.js T-008.
    settings_bootstrap: "On construction, DEFAULT_SETTINGS (13 keys) are inserted into the 'settings' table for any key not already present. Runs on every new JaaStore(), every process, every boot."

  known_open_issues:
    MP-001_concurrent_write_race:
      status: FIXED 2026-07-24 — root-caused and closed, not patched
      test: >
        tests/modules/jaa-store-multiprocess.test.js (real 3-process test,
        15/15 clean post-fix vs ~1-2 failures per 15 pre-fix) plus
        tests/modules/test-jaa-flush-lock.js (5 tests: deterministic
        frozen-interleaving reproduction, stale-lock recovery, fresh-lock
        deferral, single-process no-change, per-table independence).
      root_cause_proven: >
        The hypothesis below was confirmed DETERMINISTICALLY before
        fixing (not statistically from the flaky test): a one-shot
        readFileSync hook froze the exact interleaving — B reads disk
        (stale) → A's entire flush lands (write+rename) → B writes.
        Result: A's whole 2-row batch destroyed, exactly the whole-batch
        loss the real-process test showed intermittently. This proved the
        pre-fix comment's "only same id, same instant" claim wrong — the
        blast radius was any full batch, not colliding ids.
      fix: >
        Cross-process lock (O_EXCL 'wx' create — atomic on every
        platform, zero dependencies §5.5) around _flush's ENTIRE
        read-merge-write cycle, per-table (<table>.json.lock). Cannot
        acquire within 200ms → the flush re-schedules itself (250ms) with
        the table still dirty — a delayed write is recoverable, an
        unlocked one is the data-loss path (§16.3: refuse the invalid
        state, never pass through). A lock older than 10s (a flush takes
        single-digit ms) is presumed a crashed holder and broken LOUDLY
        (§1.2), never silently. §17.7 satisfied: third occurrence of this
        bug class (2026-07-15 rename, 2026-07-18 merge, now this) —
        promoted to the missing architectural primitive the 2026-07-18
        comment itself named ("not eliminated by anything short of true
        cross-process locking") rather than a fourth patch.
    stats_hardcoded_table_list: >
      stats() reports counts for a fixed 8-table list written into the
      method itself (artifacts, gaps, ledger_entries, sessions, jobs,
      downloads, pa_sessions, settings) — does not reflect whichever
      tables a given instance (guardian-prefixed, cortex-shared, or a
      future consumer) actually holds. Cosmetic/observability gap, not
      a correctness bug. Not fixed here.
    where_dispatch_no_test: >
      The three-way where-clause dispatch (object/function/string) has
      no dedicated regression test pinning all three conventions against
      real rows, despite being the exact class of bug (§ where_clause_contract
      above) that was silently broken once already. Not fixed here.

  consumers:
    direct: [guardian/server.js]
    via_jaaDB_adapter: [cortex, orchestrator, loom, copilot, diagnostic, idearium, healer]
    note: >
      cortex/memory/jaa-db.js's `jaaDB` object is a thin call-shape
      adapter over a SINGLE shared JaaStore instance (module-level
      singleton, per-process — NOT cross-process, see that file's own
      header correction dated 2026-07-18). That shared instance is what
      carries the skipTables exclusion for idearium's two heavy tables.
