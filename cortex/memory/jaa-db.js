'use strict';
// ── JAA — Just Another Abstraction ────────────────────────────────────────────
// memory/jaa-db.js
// UUID: jaa-db-nexus-v6-0000-4000-0000-000000000001
// Status: pre-release
//
// CORTEX IS THE ULTIMATE TRUTH.
// All storage for the entire NEXUS system lives here.
// Every other system (guardian, orchestrator, emerge, idearium)
// writes to its own local data/ folder first — disk-first, no network dependency.
// Cortex polls those folders and pulls anything new into its JAA tables.
//
// Three memory tiers, each with different decay behavior:
//
//   WORKING MEMORY   — active_traces, working_memory
//   Half-life: 30 minutes. Fully decayed and evicted at 2 hours.
//   Represents: what is happening right now, this conversation, this session.
//   Survives: nothing. Wiped completely on OS restart (pid file check).
//
//   SHORT-TERM MEMORY — agent_messages, cortex_memory, gaps, artifacts
//   Half-life: 6 hours. Fully decayed and archived at 24 hours.
//   Survives: cortex restarts. Wiped on OS restart if NEXUS_SHORT_TERM_CLEAR=1.
//   Represents: today's sessions, recent conversations, open problems.
//
//   LONG-TERM MEMORY — crystals, intent_nodes, bep_patterns, trust_scores, memory_index
//   No decay. Never evicted automatically. Requires explicit graduation.
//   Survives: everything including OS restarts.
//   Represents: stable beliefs, proven patterns, crystallized knowledge.
//
// Tables are in-memory arrays. Persistence is append-only JSONL per table.
// In-memory IS the hot path. Disk is the truth layer. (§2.1)

'use strict';

const fs   = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const uid = () => randomUUID();

// ── Memory tier definitions ───────────────────────────────────────────────────

const MEMORY_TIERS = {
  // WORKING: decays in 2h, wiped on OS restart
  working: {
    halfLifeMs:  30  * 60 * 1000,   // 30 min
    evictAfterMs: 2  * 60 * 60 * 1000,   // 2 hours
    wipeOnRestart: true,
  },
  // SHORT-TERM: decays in 24h, survives cortex restarts
  short: {
    halfLifeMs:  6  * 60 * 60 * 1000,   // 6 hours
    evictAfterMs: 24 * 60 * 60 * 1000,   // 24 hours
    wipeOnRestart: false,
  },
  // LONG-TERM: no decay, never auto-evicted
  long: {
    halfLifeMs:  null,
    evictAfterMs: null,
    wipeOnRestart: false,
  },
};

// ── Table → memory tier mapping ───────────────────────────────────────────────

const TABLE_TIERS = {
  // WORKING — current activity, live traces
  active_traces:       'working',
  working_memory:      'working',   // new: raw conversation turns, decaying

  // SHORT-TERM — recent sessions, today's work
  agent_messages:      'short',
  cortex_memory:       'short',
  gaps:                'short',
  artifacts:           'short',
  agent_calls:         'short',
  orion_sessions:      'short',
  seam_records:        'short',
  sigma_records:       'short',
  delta_records:       'short',
  snr_records:         'short',
  ime_profiles:        'short',
  event_log:           'short',
  toasts:              'short',
  healer_log:          'short',

  // LONG-TERM — no decay, explicit graduation required
  crystals:            'long',
  intent_nodes:        'long',
  bep_patterns:        'long',
  trust_scores:        'long',
  memory_index:        'long',
  conditioning_log:    'long',
  feedback_scores:     'long',
  self_model:          'long',

  // INFRASTRUCTURE — no decay (system truth, not memory)
  agent_signatures:    'long',
  shape_samples:       'long',
  failures:            'long',
  law_violations:      'long',
  boot_records:        'long',
  fix_map:             'long',
  versionium_commits:  'long',
  versionium_branches: 'long',
  versionium_file_index: 'long',
  versionium_calendar: 'long',
  versionium_objects:  'long',
  causality_nodes:     'long',
  memory_queries:      'long',
  cli_history:         'long',
  schedules:           'long',
  workflow_runs:       'long',
  forge_patches:       'long',
  project_registry:    'long',
  poll_log:            'long',
  requests:            'long',
  backup_records:      'long',
  contract_audit:      'long',
  // Decay observability — append-only record of every eviction
  // Tier: long — the log itself must never decay
  // Use: memory pressure monitoring, stability analysis, decay storm detection
  decay_log:           'long',
  // ALK decision lattice — tier: long (decisions are permanent record)
  fault_taxonomy:      'long',
  reuse_index:         'long',
};

// ── All declared tables ───────────────────────────────────────────────────────

const ALL_TABLES = Object.keys(TABLE_TIERS);

class JaaDB {
  constructor({ dir = './data' } = {}) {
    this._dir    = dir;
    this._tables = {};
    this._rowId  = 1;
    this._ready  = false;
    this._fds    = {};
    this._bootTs = Date.now();
    this._pid    = process.pid;

    ALL_TABLES.forEach(t => { this._tables[t] = []; });
  }

  // ── open — replay persisted data, open append streams ─────────────────────
  async open(dir) {
    if (this._ready) return this;
    if (dir) this._dir = dir;
    fs.mkdirSync(this._dir, { recursive: true });

    // Read boot PID file to detect OS restart
    const pidFile  = path.join(this._dir, '.cortex.pid');
    const bootFile = path.join(this._dir, '.cortex.boot');
    const osRestart = this._detectOSRestart(pidFile, bootFile);

    for (const table of ALL_TABLES) {
      const file = this._tableFile(table);
      const tier = TABLE_TIERS[table] || 'long';

      // If OS restarted and table is working tier — skip replay (wipe)
      if (osRestart && MEMORY_TIERS[tier]?.wipeOnRestart) {
        console.log(`[JaaDB] OS restart detected — wiping working table: ${table}`);
        // Truncate the JSONL file
        try { fs.writeFileSync(file, ''); } catch {}
      } else if (fs.existsSync(file)) {
        const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const row = JSON.parse(line);
            // §REPLAY-ORDER: mutations checked BEFORE _evicted
            // Tombstone { _mutation:true, _evicted:true } must PATCH the row
            // Checking _evicted first would discard tombstones — real bug fixed here
            if (row._mutation) {
              const idx = this._tables[table].findIndex(r => r.uuid === row.uuid);
              if (idx >= 0) {
                this._tables[table][idx] = { ...this._tables[table][idx], ...row };
              }
              continue;
            }
            // Skip non-mutation rows that are themselves eviction records
            if (row._evicted) continue;
            this._tables[table].push(row);
            if (row._rowId && row._rowId >= this._rowId) {
              this._rowId = row._rowId + 1;
            }
          } catch {}
        }
      }

      this._fds[table] = fs.createWriteStream(file, { flags: 'a' });
      this._fds[table].on('error', (e) => { if (e.code !== 'ENOENT') console.error(`[JaaDB] stream error on '${table}':`, e.code); });
    }

    // Write new PID file
    fs.writeFileSync(pidFile, String(this._pid), 'utf8');
    fs.writeFileSync(bootFile, String(this._bootTs), 'utf8');

    this._ready = true;

    // Start decay ticker (every 5 minutes)
    this._decayTimer = setInterval(() => this._tickDecay(), 5 * 60 * 1000);
    this._decayTimer.unref();

    return this;
  }

  // ── OS restart detection ──────────────────────────────────────────────────
  // Compares the stored boot timestamp with /proc/stat or uptime.
  // If system uptime is less than the stored boot delta, OS restarted.
  _detectOSRestart(pidFile, bootFile) {
    try {
      if (!fs.existsSync(bootFile)) return false;
      const storedBoot = parseInt(fs.readFileSync(bootFile, 'utf8').trim());
      if (!storedBoot) return false;

      // Check /proc/uptime (Linux) — seconds since OS boot
      if (fs.existsSync('/proc/uptime')) {
        const uptimeSec = parseFloat(fs.readFileSync('/proc/uptime', 'utf8').split(' ')[0]);
        const osBootTs  = Date.now() - (uptimeSec * 1000);
        // If our stored boot time is before the OS boot time — OS restarted
        if (storedBoot < osBootTs) {
          console.log(`[JaaDB] OS restart detected (stored boot: ${new Date(storedBoot).toISOString()}, OS boot: ${new Date(osBootTs).toISOString()})`);
          return true;
        }
      }
      return false;
    } catch { return false; }
  }

  // ── Decay ticker — marks and evicts expired rows ───────────────────────────
  // Working memory: evict at 2h. Short-term: archive at 24h.
  // Runs every 5 minutes. Non-blocking.
  _tickDecay() {
    const now    = Date.now();
    const cycleId = uid(); // links all evictions in one decay cycle

    for (const table of ALL_TABLES) {
      if (table === 'decay_log') continue; // decay_log never decays itself

      const tier   = TABLE_TIERS[table];
      const config = MEMORY_TIERS[tier];
      if (!config?.evictAfterMs) continue; // long-term: no eviction

      const rows = this._tables[table];
      if (!rows?.length) continue;

      let evicted = 0;
      const evictedRows = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (row._evicted || row._mutation) continue;

        const age = now - (row.ts || row._ts || 0);
        if (age < config.evictAfterMs) continue;

        // Mark evicted in-memory
        this._tables[table][i] = { ...row, _evicted: true, _evictedAt: now };

        // Write tombstone to the table's own JSONL (mutation record)
        try {
          this._fds[table]?.write(
            JSON.stringify({ _mutation: true, uuid: row.uuid, _evicted: true, _evictedAt: now }) + '\n'
          );
        } catch {}

        evictedRows.push(row);
        evicted++;
      }

      if (evicted > 0) {
        // Compact in-memory — remove evicted rows
        this._tables[table] = this._tables[table].filter(r => !r._evicted);
        console.log(`[JaaDB] decayed ${evicted} rows from ${table} (tier: ${tier})`);

        // Write one decay_log entry per eviction — the observable memory pressure record
        // This is the zoomed-out ledger: what is decaying, when, how fast
        for (const row of evictedRows) {
          const age = now - (row.ts || row._ts || 0);
          this.insert('decay_log', {
            uuid:      uid(),
            cycleId,
            table,
            tier,
            rowUuid:   row.uuid,
            rowType:   row.type   || null,
            rowSource: row.source || null,
            ageMs:     age,
            ageHours:  Math.round(age / 3600000 * 10) / 10,
            halfLifeMs: config.halfLifeMs,
            // Weight at eviction — near 0 for clean decay, > 0 means premature eviction
            weightAtEviction: Math.pow(2, -age / config.halfLifeMs),
            evictedAt: now,
            ts:        now,
          });
        }
      }
    }

    // Write a decay cycle summary to decay_log
    // This creates a heartbeat even when nothing was evicted — absence of decay is signal too
    const totalTables = ALL_TABLES.filter(t => {
      const tier = TABLE_TIERS[t];
      return MEMORY_TIERS[tier]?.evictAfterMs && t !== 'decay_log';
    }).length;

    this.insert('decay_log', {
      uuid:          uid(),
      cycleId,
      table:         '_cycle_summary',
      tier:          'system',
      rowUuid:       null,
      ageMs:         0,
      evictedAt:     now,
      ts:            now,
      // Summary fields
      _isCycleSummary:   true,
      tablesChecked:     totalTables,
      workingMemorySize: (this._tables['working_memory'] || []).length + (this._tables['active_traces'] || []).length,
    });
  }

  // ── Weight for recall — applies decay factor based on age ─────────────────
  // Returns a 0–1 float representing current memory strength.
  // Used by cortex self module for weighted recall queries.
  weightOf(table, row) {
    const tier   = TABLE_TIERS[table];
    const config = MEMORY_TIERS[tier];
    if (!config?.halfLifeMs) return 1.0; // long-term: always full weight

    const age = Date.now() - (row.ts || row._ts || 0);
    // Exponential decay: w = 2^(-age/halfLife)
    return Math.pow(2, -(age / config.halfLifeMs));
  }

  // ── close ─────────────────────────────────────────────────────────────────
  async close() {
    clearInterval(this._decayTimer);
    this._ready = false;  // Stop new writes first
    // Await all stream finishes before returning (§2.1 — data on disk before close)
    await Promise.all(Object.values(this._fds).map(fd =>
      new Promise(resolve => {
        try {
          fd.end(() => resolve());
          fd.once('error', () => resolve()); // don't hang on error
        } catch { resolve(); }
      })
    ));
    this._fds = {};
  }

  // ── insert ────────────────────────────────────────────────────────────────
  insert(table, record) {
    this._requireTable(table);
    const row = {
      ...record,
      _rowId: this._rowId++,
      _ts:    Date.now(),
    };
    this._tables[table].push(row);
    this._persist(table, row);
    return row;
  }

  // ── update ────────────────────────────────────────────────────────────────
  update(table, id, patch) {
    this._requireTable(table);
    const idx = this._tables[table].findIndex(r => r.uuid === id);
    if (idx === -1) return null;
    const updated = {
      ...this._tables[table][idx],
      ...patch,
      _updatedAt: Date.now(),
    };
    this._tables[table][idx] = updated;
    this._persist(table, { _mutation: true, uuid: id, ...patch, _updatedAt: updated._updatedAt });
    return updated;
  }

  // ── get ───────────────────────────────────────────────────────────────────
  get(table, id) {
    this._requireTable(table);
    return this._tables[table].find(r => r.uuid === id && !r._evicted) || null;
  }

  // ── query ─────────────────────────────────────────────────────────────────
  query(table, pred = () => true, limit = 500) {
    this._requireTable(table);
    const rows = this._tables[table];
    const out  = [];
    for (let i = rows.length - 1; i >= 0 && out.length < limit; i--) {
      if (rows[i]._mutation || rows[i]._evicted) continue;
      if (pred(rows[i])) out.push(rows[i]);
    }
    return out.reverse();
  }

  // ── queryWeighted — query with decay weight applied ───────────────────────
  // Returns rows sorted by (weight * recency) — most relevant first.
  queryWeighted(table, pred = () => true, limit = 50) {
    this._requireTable(table);
    const rows = this._tables[table]
      .filter(r => !r._mutation && !r._evicted && pred(r))
      .map(r => ({ ...r, _weight: this.weightOf(table, r) }))
      .filter(r => r._weight > 0.05) // ignore near-fully-decayed rows
      .sort((a, b) => b._weight - a._weight)
      .slice(0, limit);
    return rows;
  }

  // ── tail ──────────────────────────────────────────────────────────────────
  tail(table, n = 50) {
    this._requireTable(table);
    const rows = (this._tables[table] || []).filter(r => !r._mutation && !r._evicted);
    return rows.slice(Math.max(0, rows.length - n));
  }

  // ── count ─────────────────────────────────────────────────────────────────
  count(table, pred = () => true) {
    this._requireTable(table);
    return this._tables[table].filter(r => !r._mutation && !r._evicted && pred(r)).length;
  }

  // ── stats ─────────────────────────────────────────────────────────────────
  get stats() {
    const counts = {};
    for (const t of ALL_TABLES) {
      counts[t] = (this._tables[t] || []).filter(r => !r._mutation && !r._evicted).length;
    }
    return {
      ready:  this._ready,
      rowId:  this._rowId,
      bootTs: this._bootTs,
      counts,
      tiers: {
        working: ALL_TABLES.filter(t => TABLE_TIERS[t] === 'working').map(t => ({ table: t, rows: counts[t] })),
        short:   ALL_TABLES.filter(t => TABLE_TIERS[t] === 'short').map(t => ({ table: t, rows: counts[t] })),
        long:    ALL_TABLES.filter(t => TABLE_TIERS[t] === 'long').map(t => ({ table: t, rows: counts[t] })),
      },
    };
  }

  // ── private ───────────────────────────────────────────────────────────────
  _tableFile(table) {
    return path.join(this._dir, `${table}.jsonl`);
  }

  _requireTable(table) {
    if (!this._tables[table]) {
      console.warn(`[JaaDB] warning: undeclared table '${table}' — provisioning`);
      this._tables[table] = [];
      if (this._ready) {
        this._fds[table] = fs.createWriteStream(this._tableFile(table), { flags: 'a' });
        this._fds[table].on('error', (e) => { if (e.code !== 'ENOENT') console.error(`[JaaDB] stream error on '${table}':`, e.code); });
      }
    }
  }

  _persist(table, row) {
    if (!this._ready || !this._fds[table]) return;
    try {
      this._fds[table].write(JSON.stringify(row) + '\n');
    } catch (e) {
      console.error(`[JaaDB] persist error on table '${table}':`, e.message);
    }
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────
const jaaDB = new JaaDB();

module.exports = { JaaDB, jaaDB, ALL_TABLES, TABLE_TIERS, MEMORY_TIERS, uid };
