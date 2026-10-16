'use strict';
/**
 * idearium/lib/surface-state.cjs — the Code tab's surface, kept by Nexus so the CLI and agents see what the tab sees (CE8)
 * comp_id: idearium.lib.surface-state
 * UUID: nexus-idearium-surface-state-v1-0000-2026-1016-jamesbrooks-001
 * Map: docs/2026-10-15-code-tab-run-state-phasemap.spec (CE8_the_cli_reads_the_surface)
 *
 * James, 2026-10-15: "add ai assisted coding using the chunking and line count tool for the ai to change lines at a time
 * or a section. so the cli can read the current worksurface in the code tab."
 *
 * Found: the Code tab's surface was the CS object in the browser (code-surface.js). The CLI and the agents could not read
 * it. Now one small node per repo: the open file, the picked lines, the picked chunk, the filters, and who set it last.
 * The tab writes it when it changes; `code open` / `code select` write it from the CLI and the tab follows. One surface.
 *
 *   get(repoUuid)                      → the stored surface (an empty one when none was written)
 *   set(repoUuid, patch, { by })       → merged and written atomically; rev + 1; null clears a field
 */
const fs = require('fs');
const path = require('path');
const { ideariumDataDir } = require('./data-dir.cjs');

const MODULE_ID = 'idearium.lib.surface-state';
const VERSION = '1.0.0';
const BY = Object.freeze(['ui', 'cli', 'agent']);

function dir() { return path.join(ideariumDataDir(), 'surfaces'); }
function _safe(s) { return String(s || '').replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 80) || 'x'; }
function _file(repoUuid) { return path.join(dir(), `${_safe(repoUuid)}.surface.json`); }

function empty(repoUuid) { return { repoUuid, open: null, sel: null, chunk: null, filters: {}, by: null, rev: 0, updatedAt: null }; }

function get(repoUuid) {
  try { return { ...empty(repoUuid), ...JSON.parse(fs.readFileSync(_file(repoUuid), 'utf8')) }; }
  catch (_) { return empty(repoUuid); }   // none written yet, or unreadable: an empty surface, never a throw
}

/** _sel(v) → { from, to } (from <= to, both >= 1) or null; a bad range is an error, never guessed */
function _sel(v) {
  if (v == null) return null;
  const from = parseInt(v.from, 10), to = parseInt(v.to == null ? v.from : v.to, 10);
  if (!(from >= 1) || !(to >= 1)) throw new Error('sel needs from and to as line numbers (1 or more)');
  return { from: Math.min(from, to), to: Math.max(from, to) };
}

function set(repoUuid, patch = {}, { by = 'ui' } = {}) {
  if (!repoUuid) throw new Error('repoUuid is required');
  const cur = get(repoUuid);
  const next = { ...cur };
  if ('open' in patch) {
    const p = patch.open == null || patch.open === '' ? null : String(patch.open).replace(/^\/+/, '');
    if (p && (p.split('/').includes('..'))) throw new Error('open: a path inside the repo');
    if (p !== cur.open) { next.sel = null; next.chunk = null; }   // a new file: the old lines and chunk were of the old one
    next.open = p;
  }
  if ('sel' in patch) next.sel = _sel(patch.sel);
  if ('chunk' in patch) next.chunk = patch.chunk ? String(patch.chunk).slice(0, 200) : null;
  if (patch.filters && typeof patch.filters === 'object') {
    const f = { ...cur.filters };
    if ('changedOnly' in patch.filters) f.changedOnly = !!patch.filters.changedOnly;
    if ('q' in patch.filters) f.q = String(patch.filters.q || '').slice(0, 200);
    if ('mode' in patch.filters) f.mode = patch.filters.mode === 'grep' ? 'grep' : 'search';
    next.filters = f;
  }
  next.by = BY.includes(by) ? by : 'ui';
  next.rev = (cur.rev || 0) + 1;
  next.updatedAt = Date.now();
  fs.mkdirSync(dir(), { recursive: true });
  const tmp = `${_file(repoUuid)}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2));
  fs.renameSync(tmp, _file(repoUuid));
  return next;
}

module.exports = { MODULE_ID, VERSION, BY, get, set, empty, dir };
