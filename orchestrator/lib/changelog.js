'use strict';
// ── lib/changelog.js ────────────────────────────────────────────────────────
// UUID: nexus-changelog-v1-0000-0000-0000-000000000001
// Version: 1.0.0
//
// "Living updating changelog" — driven by real version bumps in docs/*.spec,
// not hand-written prose each time. Every .spec already carries a version
// (§5.4 — bumped per real change, something this session did consistently).
// This compares the current set of spec versions against the last snapshot
// taken, and only writes an entry for what actually changed — idempotent,
// safe to run on every boot (SOFT phase, same pattern as spec-drift.js)
// without spamming CHANGELOG.md when nothing moved.
//
// §1.2 — a version bump with no description is still logged, just flagged
// as undocumented rather than silently skipped.

const fs   = require('fs');
const path = require('path');

const MODULE_ID = 'changelog';
const VERSION   = '1.0.0';

// §FIXED 2026-09-11 — all three paths below were one '..' short: from
// orchestrator/lib/, a single '..' resolves to orchestrator/, not the real
// repo root. DOCS_DIR/SNAPSHOT_PATH pointed at orchestrator/docs and
// orchestrator/data/changelog-snapshot.json, neither of which has ever
// existed (confirmed — checked before fixing, not assumed) — meaning this
// entire module has been a silent no-op in production since it was built:
// readSpecs() always saw an empty/missing DOCS_DIR and returned {}, so no
// real spec change was ever detected and the real CHANGELOG.md (nor its
// new docs/ location) was ever actually written to by this path. Found
// while repointing CHANGELOG_PATH for the root .md cleanup — same file,
// same class of bug, fixed together rather than leaving 2 of 3 broken.
const DOCS_DIR        = path.join(__dirname, '..', '..', 'docs');
const SNAPSHOT_PATH   = path.join(__dirname, '..', '..', 'data', 'changelog-snapshot.json');
const CHANGELOG_PATH  = path.join(__dirname, '..', '..', 'docs', 'CHANGELOG.md');

function _specVersion(content) {
  const m = content.match(/^\s+version:\s+['"]?([0-9]+\.[0-9]+\.[0-9][^\s'"#\n]*)['"]?/m);
  return m ? m[1].trim() : null;
}
function _specName(content) {
  const m = content.match(/^\s+name:\s+['"]?([^\s'"#\n]+)['"]?/m);
  return m ? m[1].trim() : null;
}
// First-N-bytes purpose line is the closest thing every .spec already has
// to a one-line description — used as the changelog summary when no
// dedicated changelog note is provided. Truncated, not a full diff.
function _specPurpose(content) {
  const m = content.match(/purpose:\s*>\s*\n((?:\s+.+\n?)+)/);
  if (!m) return null;
  return m[1].split('\n')[0].trim();
}

function _readAllSpecs() {
  if (!fs.existsSync(DOCS_DIR)) return {};
  const out = {};
  for (const f of fs.readdirSync(DOCS_DIR)) {
    if (!f.endsWith('.spec')) continue;
    const full = path.join(DOCS_DIR, f);
    let head;
    try {
      const fd = fs.openSync(full, 'r');
      const buf = Buffer.alloc(8192);
      const n = fs.readSync(fd, buf, 0, 8192, 0);
      fs.closeSync(fd);
      head = buf.slice(0, n).toString('utf8');
    } catch (_) { continue; }
    const name = _specName(head);
    const version = _specVersion(head);
    if (!name || !version) continue;
    out[name] = { version, purpose: _specPurpose(head), file: f };
  }
  return out;
}

function _readSnapshot() {
  try { return JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8')); }
  catch (_) { return {}; }
}

function _writeSnapshot(snap) {
  fs.mkdirSync(path.dirname(SNAPSHOT_PATH), { recursive: true });
  fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(snap, null, 2));
}

/**
 * Compares current docs/*.spec versions against the last snapshot.
 * Returns { changed: [{name, from, to, purpose, isNew}], unchanged: n }
 */
function diff() {
  const current  = _readAllSpecs();
  const previous = _readSnapshot();
  const changed = [];
  let unchanged = 0;

  for (const [name, info] of Object.entries(current)) {
    const prevVersion = previous[name]?.version;
    if (prevVersion === undefined) {
      changed.push({ name, from: null, to: info.version, purpose: info.purpose, isNew: true });
    } else if (prevVersion !== info.version) {
      changed.push({ name, from: prevVersion, to: info.version, purpose: info.purpose, isNew: false });
    } else {
      unchanged++;
    }
  }

  return { changed, unchanged, current };
}

function _formatEntry(c) {
  const desc = c.purpose || '(no purpose line found — undocumented change, check the spec directly)';
  if (c.isNew) return `- **${c.name}** — new spec, v${c.to}. ${desc}`;
  return `- **${c.name}**: v${c.from} → v${c.to}. ${desc}`;
}

/**
 * Runs the diff, and if anything changed, prepends a new dated section to
 * CHANGELOG.md and updates the snapshot. Idempotent — running twice in a
 * row with no spec changes between produces no second entry.
 */
function update(opts = {}) {
  const { changed, unchanged, current } = diff();
  if (!changed.length) {
    return { ok: true, written: false, reason: 'no spec version changes since last snapshot', unchanged };
  }

  const date = (opts.date || new Date()).toISOString().slice(0, 10);
  const lines = [
    `## ${date} — auto-generated from spec version bumps`,
    '',
    ...changed.map(_formatEntry),
    '',
  ];

  let existing = '';
  try { existing = fs.readFileSync(CHANGELOG_PATH, 'utf8'); } catch (_) { existing = '# NEXUS Changelog\n\n'; }

  // Insert after the top-level "# NEXUS Changelog" header, before whatever's
  // already there — newest entries first, same convention as CHANGELOG.md
  // already uses (v0.9.8 section sits above older history).
  const headerMatch = existing.match(/^# .+\n+/);
  const insertAt = headerMatch ? headerMatch[0].length : 0;
  const newContent = existing.slice(0, insertAt) + lines.join('\n') + '\n' + existing.slice(insertAt);

  fs.writeFileSync(CHANGELOG_PATH, newContent);
  _writeSnapshot(Object.fromEntries(Object.entries(current).map(([k, v]) => [k, { version: v.version }])));

  return { ok: true, written: true, entries: changed.length, unchanged };
}

module.exports = { diff, update, MODULE_ID, VERSION };
