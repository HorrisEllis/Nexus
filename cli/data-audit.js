#!/usr/bin/env node
'use strict';
/**
 * cli/data-audit.js — data/ tree inventory + integrity + dead-weight report
 * UUID: nexus-cli-data-audit-v1-0000-2026-0912-jamesbrooks-001
 *
 * James: "why are there the folders for the ledgers. i hate shit clumped
 * together. all this data is needs to be dealt with. make data management
 * tools for... checking file integrity, etc. that way you dont have to
 * spend as much tokens."
 *
 * Real, concrete problem this solves: every prior turn this session that
 * needed to know "what's actually in data/" cost a manual find/du/grep
 * dance repeated from scratch. This walks the whole tree once and reports
 * everything worth knowing in one real command — meant to be the FIRST
 * thing run before touching any data/ work, not just a nice-to-have.
 *
 * Reports, per directory under data/<system>/... :
 *   - file count, total size
 *   - EMPTY flag — a real, confirmed-dead directory (matches the exact
 *     data/cortex/ledger/ case this was built in response to: created
 *     defensively by boot.js, never written to)
 *   - for .json files that parse as a real array: row count (same
 *     table-shape table-compactor.js/table-deduplicator.js already assume)
 *   - a JSON-parse integrity check on every .json file — malformed files
 *     are named explicitly, not silently skipped
 *   - OVERSIZED flag on any single file >10MB (real compaction/
 *     decomposition candidates, not guessed at)
 *
 * Usage:
 *   node cli/data-audit.js                # full report, human-readable
 *   node cli/data-audit.js --json          # machine-readable, for other tools to consume
 *   node cli/data-audit.js cortex          # scope to one system's data/ subtree
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const OVERSIZED_BYTES = 10 * 1024 * 1024; // 10MB — real compaction/decomposition candidate territory

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const scope = args.find(a => !a.startsWith('--'));

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  const dirs = [];
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) dirs.push(full);
    else files.push(full);
  }
  return { files, dirs };
}

function rowCountIfArray(filePath) {
  try {
    const txt = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(txt);
    return Array.isArray(parsed) ? parsed.length : null;
  } catch (e) {
    return { error: e.message };
  }
}

function auditDir(dir, report) {
  const { files, dirs } = walk(dir);
  const relDir = path.relative(DATA_DIR, dir);
  let totalSize = 0;
  const fileReports = [];
  const malformed = [];
  const oversized = [];

  for (const f of files) {
    const stat = fs.statSync(f);
    totalSize += stat.size;
    const rel = path.relative(DATA_DIR, f);
    if (stat.size > OVERSIZED_BYTES) oversized.push({ file: rel, size: stat.size });
    if (f.endsWith('.json')) {
      const rc = rowCountIfArray(f);
      if (rc && rc.error) malformed.push({ file: rel, error: rc.error });
      else if (typeof rc === 'number') fileReports.push({ file: rel, rows: rc, size: stat.size });
    }
  }

  if (files.length === 0 && dirs.length === 0) {
    report.emptyDirs.push(relDir);
  } else {
    report.dirs.push({
      dir: relDir || '.',
      fileCount: files.length,
      totalSize,
      tables: fileReports,
    });
  }
  report.malformed.push(...malformed);
  report.oversized.push(...oversized);

  for (const d of dirs) auditDir(d, report);
}

function run() {
  if (!fs.existsSync(DATA_DIR)) {
    console.error(`[data-audit] data/ not found at ${DATA_DIR}`);
    process.exit(1);
  }
  const startDir = scope ? path.join(DATA_DIR, scope) : DATA_DIR;
  if (!fs.existsSync(startDir)) {
    console.error(`[data-audit] no such data/ subdirectory: ${scope}`);
    process.exit(1);
  }

  const report = { dirs: [], emptyDirs: [], malformed: [], oversized: [] };
  auditDir(startDir, report);

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`[data-audit] scanned ${scope ? `data/${scope}` : 'data/'}\n`);

  if (report.emptyDirs.length) {
    console.log(`EMPTY (dead, safe to remove — confirm nothing writes here before deleting):`);
    for (const d of report.emptyDirs) console.log(`  data/${d}`);
    console.log('');
  }

  if (report.malformed.length) {
    console.log(`MALFORMED JSON (real problem, not skipped silently):`);
    for (const m of report.malformed) console.log(`  data/${m.file}: ${m.error}`);
    console.log('');
  }

  if (report.oversized.length) {
    console.log(`OVERSIZED (>${humanSize(OVERSIZED_BYTES)}, real compaction/decomposition candidates):`);
    for (const o of report.oversized.sort((a, b) => b.size - a.size)) {
      console.log(`  data/${o.file} — ${humanSize(o.size)}`);
    }
    console.log('');
  }

  console.log(`REAL DIRECTORIES (${report.dirs.length}):`);
  const sorted = report.dirs.filter(d => d.fileCount > 0).sort((a, b) => b.totalSize - a.totalSize);
  for (const d of sorted) {
    console.log(`  data/${d.dir} — ${d.fileCount} file(s), ${humanSize(d.totalSize)}`);
    for (const t of d.tables.sort((a, b) => b.rows - a.rows).slice(0, 5)) {
      console.log(`    ${path.basename(t.file)}: ${t.rows} row(s), ${humanSize(t.size)}`);
    }
  }

  const totalSize = report.dirs.reduce((s, d) => s + d.totalSize, 0);
  console.log(`\n[data-audit] total: ${humanSize(totalSize)} across ${report.dirs.length} real director(ies), ${report.emptyDirs.length} empty, ${report.malformed.length} malformed, ${report.oversized.length} oversized.`);
}

run();
