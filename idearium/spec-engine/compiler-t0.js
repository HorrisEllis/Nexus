'use strict';
// idearium/spec-engine/compiler-t0.js — spec-compiler's T0: Structure Emission
// UUID: nexus-idearium-compiler-t0-v1-0000-2026-0919-jamesbrooks-001
//
// §BUILT 2026-09-19 — James: "do it. needs to generate file tree and
// list. also needs to fail when it doesn't actually generate. also no
// md. .chunk nodes. use the same chunking from the import. it sometimes
// just makes a chunk with nothing in it. need to expand the options and
// give more control over the compartment. like i want it to do what you
// can do when i upload a project."
//
// This is docs/spec-compiler.spec's T0 tier: "directory tree, empty
// files, barrel exports, package.json... tokens: 0... Existing files
// (from Cortex query) are never overwritten." Nothing else in
// spec-compiler.spec is built here — T1-T3 (typed stubs, real logic
// fill, cross-module reasoning) are real, separate, much larger work,
// out of scope for this pass.
//
// §REUSES, DOES NOT DUPLICATE — "the same chunking from the import"
// means ingestFilesAsSpec()'s real chunk shape (one chunk per real
// target file, realPath set so materialize() writes it at its real
// path/extension, never the internal numbered .md chunk-store naming).
// This module builds that same shape via addChunk() (index.js's own
// existing, real, already-tested "repo editor adds a new file"
// function) rather than re-implementing chunk creation a third time.
//
// §TWO REAL BUGS FIXED ALONGSIDE THIS, NOT INVENTED HERE — found while
// reading the exact code this reuses:
//   1. ingestFilesAsSpec (index.js) used to mark an empty/uncaptured
//      file COMPLETE with a fabricated `<!-- no text content -->`
//      markdown placeholder instead of failing. Fixed to call
//      failChunk() instead — "it sometimes just makes a chunk with
//      nothing in it" was this line.
//   2. RepoLayer.materialize() (repo/index.js) returned ok:true even
//      when every chunk failed and zero real files were written.
//      Fixed to return ok:false when a non-empty manifest produced zero
//      real output and nothing was legitimately deferred to a real
//      source file. This module's own emitStructure() below applies the
//      identical honest rule at the chunk-creation layer, before
//      materialize ever runs, so a caller finds out immediately rather
//      than after a false "written: 0, ok: true".
//
// §NO MD — the actual bug this addresses ("no md") is placeholder
// content written in the WRONG language's comment syntax standing in
// for real content (exactly bug #1 above: an HTML/markdown comment
// inside what should be a .js/.py/etc file). _placeholderFor() below
// picks a real comment syntax per real target extension. A genuinely-
// requested .md file still gets prose, not a code comment — the rule is
// "never fake one language's syntax with another's", not "never emit a
// file that happens to be markdown".
//
// §COMPARTMENT CONTROL, EXPANDED — templates.js's readCompartmentTemplate()
// already reads a real, named COS compartment's file tree, but only ever
// as one flattened text blob fed to a single template. Here, a
// compartment's real per-file content is used PER TARGET PATH when the
// compartment has a matching file (real seed content, not a placeholder),
// and opts exposes what was previously hardcoded: which compartment,
// and a chunk_cap override distinct from the global config default —
// real, named options, not new hidden constants.

import { order as graphOrder } from './manifest/graph.js';
import { loadSpec, addChunk } from './index.js';
import { getValue as getConfigValue } from '../lib/config.js';
import * as chunkNodes from '../lib/chunk-nodes.js';
import path from 'path';
import { createRequire } from 'module';
const _require = createRequire(import.meta.url);

// §LANGUAGE MAP — real comment syntax per real extension. Deliberately a
// short, explicit, named list (§16.4 — simple, generalize after real
// repetition) rather than a guessed-at universal comment-syntax library;
// an unknown extension falls through to PLAIN_TEXT_EXTS or a safe default
// below, never silently mislabels a language it doesn't recognize.
const LINE_COMMENT = {
  '.js': '//', '.jsx': '//', '.ts': '//', '.tsx': '//', '.mjs': '//', '.cjs': '//',
  '.java': '//', '.c': '//', '.cpp': '//', '.cs': '//', '.go': '//', '.rs': '//', '.swift': '//',
  '.py': '#', '.rb': '#', '.sh': '#', '.yaml': '#', '.yml': '#', '.toml': '#',
  '.sql': '--', '.lua': '--',
};
const NO_COMMENT_SYNTAX_EXTS = new Set(['.json']); // JSON has no comment syntax at all — a real, structural fact, not an oversight
const PROSE_EXTS = new Set(['.md', '.txt']); // real prose placeholder, not a code comment — see header

function _placeholderFor(relPath) {
  const ext = path.extname(relPath).toLowerCase();
  if (NO_COMMENT_SYNTAX_EXTS.has(ext)) return '{}\n';
  if (PROSE_EXTS.has(ext)) return `# ${path.basename(relPath, ext)}\n\nTODO: not yet implemented — scaffolded by spec-compiler T0.\n`;
  const marker = LINE_COMMENT[ext] || '//'; // unrecognized extension: safest real default, not a guess dressed as certainty
  return `${marker} TODO: not yet implemented — scaffolded by spec-compiler T0 (${relPath})\n`;
}

/**
 * parseBuildOrder(content) — the build_order chunk's real content must be
 * a YAML list of real target files: `- path: lib/foo.js` (kind and
 * dependsOn optional). Throws on anything else — an unparseable or empty
 * build_order is a real failure of T0, not an empty-but-fine result
 * (James: "needs to fail when it doesn't actually generate").
 *
 * §BUILT 2026-09-19 — James: "file tree with needed files, dependencies,
 * and primitives... build from the bottom up." dependsOn here is a list
 * of real PATHS from this same build_order (not sectionIds — those don't
 * exist until emitStructure() creates each chunk) — validated against
 * the file list itself so a typo'd or missing dependency fails loudly
 * here, at parse time, rather than silently leaving a future chunk
 * PENDING forever with no explanation.
 */
function parseBuildOrder(content) {
  const yaml = _require('js-yaml');
  let parsed;
  try { parsed = yaml.load(content); }
  catch (e) { throw new Error(`compiler-t0: build_order is not valid YAML: ${e.message}`); }
  const list = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.files) ? parsed.files : null);
  if (!list) throw new Error('compiler-t0: build_order must be a YAML list of {path} entries, or an object with a top-level `files:` list — got neither');
  const files = list.map((entry, i) => {
    const p = typeof entry === 'string' ? entry : entry?.path;
    if (!p || typeof p !== 'string') throw new Error(`compiler-t0: build_order entry ${i} has no real path`);
    const dependsOn = (typeof entry === 'object' && Array.isArray(entry.dependsOn)) ? entry.dependsOn : [];
    return { path: p, kind: (typeof entry === 'object' && entry.kind) || null, dependsOn };
  });
  if (files.length === 0) throw new Error('compiler-t0: build_order parsed to an empty list — nothing to emit');

  const realPaths = new Set(files.map(f => f.path));
  for (const f of files) {
    const bad = f.dependsOn.filter(d => !realPaths.has(d));
    if (bad.length) throw new Error(`compiler-t0: ${f.path} depends on path(s) not in this build_order — ${bad.join(', ')}`);
  }
  return files;
}

/**
 * _topoOrder(files) — real bottom-up ordering (Kahn's algorithm): a file
 * is emittable once every path in its own dependsOn has already been
 * emitted. Throws on a real cycle — two or more files depending on each
 * other, directly or through a chain, can never have a valid bottom-up
 * order, and returning them in file-list order anyway (the T0 behavior
 * before this) would silently pretend an unbuildable graph was fine.
 *
 * Each returned entry gains isPrimitive: true when nothing else in this
 * same build_order depends on it AND it has no dependencies of its own
 * — a leaf with no dependents is not "primitive" (nothing needs it
 * first), it's just standalone; primitive means "other real files in
 * this graph need this one to exist before they can," derived directly
 * from the real dependsOn edges, not a separately-declared flag that
 * could drift from them.
 */
function _topoOrder(files) {
  // §ONE ORDERING 2026-09-25 — Kahn's algorithm now lives once, in
  // manifest/graph.js (shared with manifest check/generate). Same result,
  // same error text on a cycle; this wrapper only keeps T0's own shape.
  const byPath = new Map(files.map(f => [f.path, f]));
  const g = graphOrder(files.map(f => ({ id: f.path, depends: f.dependsOn })));
  if (g.stuck.length) {
    throw new Error(`compiler-t0: real dependency cycle detected among — ${g.stuck.join(', ')} — cannot build bottom-up`);
  }
  return g.order.map(p => {
    const f = byPath.get(p);
    return { ...f, isPrimitive: f.dependsOn.length === 0 && g.dependents.get(p).length > 0 };
  });
}

/**
 * _seedFromCompartment(compartmentName) — real content per real path from
 * a named COS compartment, reusing templates.js's own real walker rather
 * than a second directory-reading implementation. Returns a Map<relPath,
 * content>; empty Map (never null/throw) when no compartment given or
 * found — a missing seed is not this function's failure, callers fall
 * back to a placeholder per path, same honest-default pattern
 * readCompartmentTemplate() itself already uses.
 */
async function _seedFromCompartment(compartmentName) {
  const seeded = new Map();
  if (!compartmentName) return seeded;
  try {
    const cosCompartment = _require('../../lib/agent-tools/tools/sandbox/cos-compartment.js');
    const fs = _require('fs');
    const listed = await cosCompartment.execute({ action: 'list' });
    if (!listed.ok || !listed.compartments) return seeded;
    const comp = listed.compartments.find(c => c.name === compartmentName);
    const root = comp?.fs?.root;
    if (!root) { console.warn(`[compiler-t0] compartment '${compartmentName}' not found or has no real fs.root — falling back to placeholders for every path`); return seeded; }
    // Real, bounded walk — same MAX_COMPARTMENT_FILES-class cap as
    // templates.js's own _walkCompartment, restated here rather than
    // imported since that function isn't exported (module-private there).
    const MAX_FILES = 200; // higher than templates.js's 40: this seeds real per-path content for a whole codebase's structure, not one template's flattened blob
    const walk = (rel = '') => {
      let entries;
      try { entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch (_) { return; }
      for (const e of entries) {
        if (seeded.size >= MAX_FILES) return;
        const relPath = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) walk(relPath);
        else { try { seeded.set(relPath, fs.readFileSync(path.join(root, relPath), 'utf8')); } catch (_) {} }
      }
    };
    walk();
  } catch (e) {
    console.warn(`[compiler-t0] compartment seed failed (non-fatal, placeholders used for every path): ${e.message}`);
  }
  return seeded;
}

/**
 * emitStructure(specUuid, opts) — the real T0 entry point.
 *   opts.chunkCap        — override for idearium.config.chunk_cap, this
 *                           call only (not a global config change).
 *   opts.compartmentName — real COS compartment to seed real per-path
 *                           content from, when it has a matching file.
 *   opts.repoUuid        — passed through to addChunk, same as every
 *                           other real chunk-creation call in this system.
 *
 * Returns { ok, tree, written, failed, total, error }. ok is false, with
 * a real error, when build_order can't be found/parsed OR when every
 * single file failed to create as a chunk — never a silent empty
 * success, matching the two bug fixes named in this file's own header.
 */
export async function emitStructure(specUuid, opts = {}) {
  const manifest = loadSpec(specUuid);
  const buildOrderChunk = manifest.chunks.find(c => c.sectionId === 'build_order');
  if (!buildOrderChunk || buildOrderChunk.status !== 'complete' || !buildOrderChunk.content) {
    return { ok: false, error: `compiler-t0: spec ${specUuid} has no complete build_order chunk — cannot determine the real file list to emit`, tree: [], written: 0, failed: 0, total: 0 };
  }

  let files;
  try { files = parseBuildOrder(buildOrderChunk.content); }
  catch (e) { return { ok: false, error: e.message, tree: [], written: 0, failed: 0, total: 0 }; }

  const cap = opts.chunkCap ?? getConfigValue('chunk_cap');
  if (files.length > cap) {
    return { ok: false, error: `compiler-t0: build_order lists ${files.length} files, exceeding chunk_cap (${cap}) — raise opts.chunkCap or split build_order`, tree: [], written: 0, failed: 0, total: files.length };
  }

  // §BOTTOM-UP — James: "build from the bottom up." Real topological
  // order over the real dependsOn edges parsed above, not file-list
  // order. Throws (caught below, fails loudly per this file's own
  // convention) on a genuine cycle rather than emitting an unbuildable
  // graph in an arbitrary order and calling it done.
  let ordered;
  try { ordered = _topoOrder(files); }
  catch (e) { return { ok: false, error: e.message, tree: [], written: 0, failed: 0, total: files.length }; }

  // §BUILT 2026-09-20 — James: "idearium's own sub-work — spec builds,
  // spawned compilers/workers — becomes real cos compartments, going
  // through the gauntlet normally." Was: opts.compartmentName only ever
  // SEEDS from an existing compartment someone else already created (see
  // _seedFromCompartment above) — this build itself never became one.
  // Real cos_compartment tool reused (same one copilot already uses,
  // lib/agent-tools/tools/sandbox/cos-compartment.js), which itself
  // dispatches through cos/host's real SISO gate pipeline
  // (cos/cli/commands/create.js — "gate runs before emit() returns",
  // not skipped or short-circuited). Non-fatal on failure: a build this
  // spec engine already knows how to run without a compartment (every
  // build before this one) must not start failing because COS is
  // unavailable — same honest-default posture _seedFromCompartment
  // itself already uses one line below.
  let compartmentName = opts.compartmentName || null;
  if (!compartmentName) {
    try {
      const cosCompartment = _require('../../lib/agent-tools/tools/sandbox/cos-compartment.js');
      const created = await cosCompartment.execute({
        action: 'create',
        name: `idearium-spec-${specUuid}`,
        purpose: `idearium spec build — ${specUuid}`,
      });
      if (created.ok) {
        compartmentName = `idearium-spec-${specUuid}`;
        console.log(`[compiler-t0] real cos compartment '${compartmentName}' created for this build (gate pipeline, not skipped)`);
      } else {
        console.warn(`[compiler-t0] cos compartment creation failed (non-fatal, build proceeds without one): ${created.error}`);
      }
    } catch (e) {
      console.warn(`[compiler-t0] cos compartment creation threw (non-fatal, build proceeds without one): ${e.message}`);
    }
  }

  const seeded = await _seedFromCompartment(compartmentName);
  const tree = [];
  const failedPaths = [];
  const sectionIdForPath = new Map(); // filled as each real chunk is created, in bottom-up order — a later file's dependsOn (its dependencies, already emitted first by definition of topo order) can always be translated by the time it's needed
  let written = 0;

  for (const f of ordered) {
    const clean = String(f.path).replace(/^\/+/, '').split('/').filter(s => s && s !== '.' && s !== '..').join('/');
    if (!clean) { failedPaths.push(f.path); continue; }
    const content = seeded.get(clean) || _placeholderFor(clean);
    const sectionId = `t0-${clean.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
    // Real dependsOn, translated from build_order's own path references
    // to the actual sectionIds addChunk validates against and
    // _chunkDependenciesSatisfied()/findNextPendingChunk() read later.
    // Every dependency here was already processed (topo order guarantees
    // it came earlier in `ordered`), so this Map lookup can't miss —
    // if it ever does, that's a real bug in _topoOrder, not a case to
    // silently skip past.
    const dependsOn = f.dependsOn.map(depPath => {
      const depSectionId = sectionIdForPath.get(depPath);
      if (!depSectionId) throw new Error(`compiler-t0: internal error — ${clean} depends on ${depPath}, which topo order should have emitted first but didn't`);
      return depSectionId;
    });
    try {
      addChunk(specUuid, { sectionId, title: clean, content, realPath: clean, repoUuid: opts.repoUuid || null, dependsOn });
      sectionIdForPath.set(clean, sectionId);
      tree.push({ path: clean, seeded: seeded.has(clean), kind: f.kind || null, dependsOn: f.dependsOn, isPrimitive: f.isPrimitive });
      written++;
    } catch (e) {
      console.warn(`[compiler-t0] failed to create chunk for ${clean}: ${e.message}`);
      failedPaths.push(clean);
    }
  }

  // §FAIL LOUDLY — same rule just applied to materialize() itself: a
  // non-empty file list that produced zero real chunks is a real
  // failure of this call, not an empty-but-fine result.
  if (files.length > 0 && written === 0) {
    return { ok: false, error: `compiler-t0: 0 of ${files.length} files emitted — every one failed: ${failedPaths.slice(0, 10).join(', ')}`, tree, written, failed: failedPaths.length, total: files.length };
  }

  const fresh = loadSpec(specUuid);
  chunkNodes.writeManifestChunkNodes(fresh, { repoUuid: opts.repoUuid || null });

  return { ok: true, tree, written, failed: failedPaths.length, total: files.length, compartmentName, error: failedPaths.length ? `${failedPaths.length} file(s) failed: ${failedPaths.join(', ')}` : undefined };
}

export { parseBuildOrder, _placeholderFor as placeholderFor };
