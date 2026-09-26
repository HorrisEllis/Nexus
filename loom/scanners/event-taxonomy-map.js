'use strict';
/**
 * loom/scanners/event-taxonomy-map.js — the EVENT TAXONOMY layer of loom's
 * self-model, mirroring loom/scanners/phasemap-map.js's real, existing
 * pattern exactly (ET5_loom_event_taxonomy_map, per docs/2026-08-27-
 * event-taxonomy-and-brainstorm-phasemap.spec).
 *
 * James, via that same phase's own "does": "Answers 'what event types
 * exist system-wide' from one place — the exact 'granularity and
 * visibility' James asked for — without making loom or cortex the write
 * authority for any other system's events."
 *
 * Read-only, same as phasemap-map.js: scans every real <system>/event-
 * taxonomy.js file this codebase actually has (found by walking the real
 * tree, not a hardcoded list — so this keeps working as ET2/ET3/ET4's
 * siblings for other systems get built later, the same way phasemap-
 * map.js's own docs/ scan doesn't need updating when a new phasemap.spec
 * is added), validates each against lib/event-taxonomy-pattern.js's real
 * ET1 shape, and aggregates. Never writes to any system's own taxonomy
 * file — that stays each system's own, same as phasemap-map.js never
 * writes a phasemap.spec.
 */

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const { validateTaxonomy } = require('../../lib/event-taxonomy-pattern.js');

// §BUGFIX-CLASS-AWARE — same real risk phasemap-map.js's own file scan
// guards against (an unbounded walk into node_modules would be both slow
// and wrong — third-party code isn't a real NEXUS system's taxonomy).
// Explicit skip list, not a .gitignore parse — this only needs to be
// right for the real, known noise directories, not general-purpose.
const SKIP_DIRS = new Set(['node_modules', '.git', '_archive', 'data', 'coverage', 'dist', 'build']);
const MAX_DEPTH = 6; // real repo's own real max real nesting for source files is well under this

function _findTaxonomyFiles() {
  const out = [];
  function walk(dir, depth) {
    if (depth > MAX_DEPTH) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(path.join(dir, entry.name), depth + 1);
      } else if (entry.isFile() && entry.name === 'event-taxonomy.js') {
        out.push(path.join(dir, entry.name));
      }
    }
  }
  walk(ROOT, 0);
  return out;
}

/**
 * _systemFor(filePath) — the real system a taxonomy file belongs to, from
 * its real path relative to ROOT. Matches guardian/event-taxonomy.js →
 * 'guardian', clear-glass/src/event-taxonomy.js → 'clear-glass' (first
 * real path segment, not the immediate parent dir — the two real, current
 * files live at different depths, confirmed by find before writing this).
 */
function _systemFor(filePath) {
  const rel = path.relative(ROOT, filePath);
  return rel.split(path.sep)[0];
}

/**
 * loadAll() — every governed event class across every system's real
 * event-taxonomy.js, validated and tagged.
 * @returns { events:[{key,system,file,description,payloadShape,severity,valid}],
 *            files, bySystem, invalidFiles, total }
 */
function loadAll() {
  const events = [];
  const files = [];
  const invalidFiles = [];

  for (const filePath of _findTaxonomyFiles()) {
    const system = _systemFor(filePath);
    files.push({ system, path: path.relative(ROOT, filePath) });

    let taxonomy;
    try {
      delete require.cache[require.resolve(filePath)]; // real, live re-read — a system's taxonomy can change between calls, same as phasemap-map.js's own live fs.readFileSync per call
      taxonomy = require(filePath);
    } catch (err) {
      invalidFiles.push({ system, path: path.relative(ROOT, filePath), error: `require() failed: ${err.message}` });
      continue;
    }

    const result = validateTaxonomy(taxonomy, { systemName: system });
    if (!result.ok) {
      invalidFiles.push({ system, path: path.relative(ROOT, filePath), error: result.errors.join('; ') });
    }

    for (const [key, entry] of Object.entries(taxonomy || {})) {
      if (!entry || typeof entry !== 'object') continue;
      events.push({
        key, system, file: path.relative(ROOT, filePath),
        description: entry.description || null,
        payloadShape: Array.isArray(entry.payloadShape) ? entry.payloadShape : [],
        severity: entry.severity || null,
        valid: result.ok,
      });
    }
  }

  const bySystem = {};
  for (const e of events) (bySystem[e.system] = bySystem[e.system] || []).push(e);

  return { events, files, invalidFiles, bySystem, total: events.length };
}

/**
 * forSystem(system) — every real governed event class for one system.
 */
function forSystem(system) {
  const all = loadAll();
  const list = all.bySystem[system] || all.bySystem[system.toLowerCase()] || [];
  return { system, total: list.length, events: list };
}

/**
 * summary() — the whole real event taxonomy at a glance.
 */
function summary() {
  const all = loadAll();
  const systems = Object.keys(all.bySystem);
  const bySeverity = {};
  for (const e of all.events) bySeverity[e.severity || 'unknown'] = (bySeverity[e.severity || 'unknown'] || 0) + 1;
  return {
    files: all.files.length,
    events: all.total,
    systems: systems.length,
    invalidFiles: all.invalidFiles.length,
    bySeverity,
    text: `${all.total} governed event classes across ${all.files.length} real taxonomy files, ${systems.length} systems.` +
      (all.invalidFiles.length ? ` ${all.invalidFiles.length} file(s) failed real shape validation.` : ''),
  };
}

/**
 * findEvent(key) — where a given governed event class is defined, across
 * every real system. Real events can share a key only if two systems
 * independently chose the same name — returns every match, not just the
 * first, so that collision is visible rather than silently masked.
 */
function findEvent(key) {
  const all = loadAll();
  return all.events.filter(e => e.key === key.toUpperCase());
}

module.exports = { loadAll, forSystem, summary, findEvent, MODULE_ID: 'loom-event-taxonomy-map', VERSION: '1.0.0' };
