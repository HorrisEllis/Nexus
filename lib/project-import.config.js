'use strict';
/**
 * lib/project-import.config.js — the "Upload Project" pipeline's real
 * tunables (lib/project-container.js + lib/zip-ingest.js + the
 * ui/import-project screen).
 *
 * James: "make this fully configurable in a config file."
 *
 * §REWIRED 2026-09-15 — James: "500 chunks is too low, make a full
 * config file for idearium to change those kinds of values." This file
 * no longer OWNS any of those values. It used to hold its own env-var
 * defaults for every bound (maxFiles, maxBytesPerFile, maxTotalBytes,
 * skipDirs, textExt, the repo dir, the git identity, the compartment
 * budgets), with only maxFiles reaching across to idearium.config —
 * and it reached across by reading the raw JAA row directly, which by
 * itself saw only the runtime layer, never the defaults or
 * idearium.config.json. Now every value below resolves through
 * idearium/lib/config-core.cjs, the same shared core idearium's own ESM
 * config module uses, so both sides give the same answer for the same
 * key. One config, two entry points (see that file's own header for why
 * the ESM/CJS split forced this shape).
 *
 * §LIVE, NOT BAKED — every export is a getter, evaluated per access, so
 * a change through the config API or an edit to idearium.config.json
 * takes effect on the next import with no restart. The one deliberate
 * exception is COMPARTMENT.boundary.description/paths/systems, which are
 * structural facts about what this pipeline does, not tunables.
 *
 * §ENV VARS — still honored, as the lowest-precedence source for the few
 * deploy-time knobs that predate the config (NEXUS_PROJECT_IMPORT_*).
 * They now act as a fallback UNDER the config layers rather than beside
 * them, so an env var can no longer silently beat a value a human wrote
 * into idearium.config.json.
 */

const path = require('path');

const core = require('../idearium/lib/config-core.cjs');

const NEXUS_ROOT = path.join(__dirname, '..');

// ── the one real read ────────────────────────────────────────────────────
// Resolves all three layers (schema defaults -> idearium.config.json ->
// persisted runtime row) through the shared core. Never throws: if
// cortex's store is unreachable (this module loaded standalone, outside a
// running NEXUS process) the runtime layer is simply absent and the
// defaults + file still resolve — a degraded read, honestly, rather than
// a crash or a silent empty config.
function live() {
  let persisted = null;
  try {
    const { jaaDB } = require('../cortex/memory/jaa-db');
    const row = jaaDB.getById(core.TABLE, core.ROW_UUID);
    persisted = row && row.values;
  } catch (_) { /* store not reachable — defaults + file still apply */ }
  return core.resolveValues(persisted);
}

/** Absolute path from a config value that may be relative to the repo root. */
function abs(p) { return path.isAbsolute(p) ? p : path.join(NEXUS_ROOT, p); }

module.exports = {
  // Exposed so a caller that wants the whole picture (the
  // /api/project-import/config route, the UI) can read it in one go
  // rather than reassembling it from the getters below.
  get IDEARIUM() { return live(); },

  // ── Compartment spawned for the lifetime of the upload flow ──────────
  // §MIGRATED TO COS 2026-09-15 — the compartment is now a real
  // COMPARTMENT OS compartment (lib/cos-bridge.js), not only a
  // compartment-engine constraint frame. budget/boundary below still
  // feed compartment-engine's _assembleConstraintFrame() — that module
  // still does the end-state evaluation COS has no equivalent of — while
  // COS owns the compartment's identity, directory and manifest. See
  // lib/project-container.js's §MIGRATED note for how the two divide.
  get COMPARTMENT() {
    const c = live().compartment;
    return {
      // COS side
      useCos:          c.use_cos,
      runtimeId:       c.runtime_id,
      networkIsolated: c.network_isolated,
      wipeOnCancel:    c.wipe_on_cancel,
      // compartment-engine side — shape must match
      // _assembleConstraintFrame()'s expectations exactly
      // (budget.tokens/timeMs/irreversibleOpsAllowed,
      // boundary.description/paths/systems); this is real frame content,
      // not decoration.
      budget: {
        // 0 in the config means "no token budget" — passed through as
        // null, which is what the frame actually expects for absent.
        // A real 0 and "unset" would otherwise be indistinguishable.
        tokens: c.token_budget > 0 ? c.token_budget : null,
        timeMs: c.time_budget_ms,
        irreversibleOpsAllowed: c.irreversible_ops,
      },
      boundary: {
        description: 'idearium project-import: may create a new repo directory and its manifest/project.json/.git; touches nothing else',
        paths: ['idearium/data/projects/*', `${live().repo.storage_dir}/*`],
        systems: ['idearium'],
      },
      // A container left AWAITING_UPLOAD this long (tab closed mid-flow,
      // network died on the way to /import) auto-cancels via sweepStale().
      staleAfterMs: c.stale_after_ms,
    };
  },

  // ── where an imported project's repo directory physically lives ──────
  // James: "i want it to create the compartment in idearium's repo
  // folder" — idearium/repo/repos/<repoUuid>, beside idearium/repo/
  // index.js, rather than RepoLayer's own default (idearium/data/
  // projects/<repoUuid>, still used by every other ingest path — drop,
  // promote, fork — unaffected by this).
  get REPO_STORAGE() {
    return { dir: process.env.NEXUS_PROJECT_IMPORT_REPO_DIR || abs(live().repo.storage_dir) };
  },

  MANIFEST: { version: '1.0.0', layer: 'idearium' },
  PROJECT_JSON: { version: '1.0.0' },

  // ── real `git init` + first commit ───────────────────────────────────
  get GIT() {
    const r = live().repo;
    return {
      enabled:       r.git_enabled,
      binary:        r.git_binary,
      defaultBranch: r.git_branch,
      authorName:    r.git_author_name,
      authorEmail:   r.git_author_email,
      commitMessage: (name) => `Import: ${name}`,
    };
  },

  // ── zip extraction bounds (lib/zip-ingest.js) ────────────────────────
  // §SHARED — the one real set of bounds for turning an uploaded zip into
  // repo content. Both the repo.import-archive route and project-
  // container's "Import Repository" step read these rather than each
  // hardcoding a copy (the exact drift zip-ingest.js's own header calls
  // out as the thing being fixed).
  //
  // §THE REAL SPLIT 2026-09-15 — James: "it needs to import the real
  // files from the uploaded project to the repo, not just the chunks."
  // textExt is no longer a filter on what gets IMPORTED, only on what
  // gets CHUNKED. maxFiles bounds the chunk count (every chunked file is
  // one chunk); realFiles/includeBinary/maxRealFileBytes govern the
  // verbatim file copy, which has no extension whitelist at all. A .png
  // or a 4 MB lockfile is now imported as a real file and simply never
  // chunked, instead of being dropped entirely as it was before.
  get ZIP() {
    const v = live();
    return {
      maxFiles:         v.chunking.chunk_cap,
      maxBytesPerFile:  v.chunking.max_chunk_bytes,
      maxTotalBytes:    v.import.max_total_bytes,
      maxRealFileBytes: v.import.max_real_file_bytes,
      realFiles:        v.import.real_files,
      includeBinary:    v.import.include_binary,
      verifyHashes:     v.import.verify_hashes,
      skipDirs:         v.import.skip_dirs,
      textExt:          v.import.text_ext,
    };
  },

  // ── files the "Upload Project" prompt shows as example end-state goals ──
  // Not decorative copy — every example is written to actually hit a real
  // DOMAIN_PATTERNS/VERB_PATTERNS regex in lib/intent-classifier.js
  // (build/write/fix/analyze/explain/validate), so classify() gives a
  // real, non-fallback intent for whichever one a user reuses verbatim,
  // rather than shipping an example that would silently classify as a
  // last-resort default. Kept here, not in idearium.config: this is real
  // UI copy bound to real regexes in another module, not a tunable.
  INTENT_EXAMPLES: [
    'Fix and validate the broken build pipeline',
    'Refactor the API layer for clarity',
    'Document how this module actually works',
    'Analyze the codebase for technical debt',
    'Build out the missing test coverage',
    'Diagnose why the import keeps failing',
  ],
};
