/**
 * idearium/repo/index.js — Idearium Repo Layer (forks/zips as tracked ideas)
 * UUID: idearium-repo-v001-000000000001
 * Version: 2.0.0
 *
 * §REDESIGNED 2026-07-11 — "the repo is an archive using the spec, when you
 * access it. the spec is supposed to be the metadata. like a compartment
 * with the spec as the metadata."
 *
 * v1 kept its OWN copy of file metadata — {path, bytes: length, comp_id,
 * seam_id, status} — with no actual content, alongside a SEPARATE spec
 * object made via the legacy os.createSpec (a text blob, not the chunked
 * spec-engine manifest everything else in idearium now runs on). Two
 * disconnected records claiming to describe one thing, and nothing behind
 * either of them to actually serve when a repo was opened.
 *
 * v2: not a wrapper around v1, a replacement of its storage model. A repo
 * no longer has its own content store at all — the spec-engine manifest
 * IS the archive (its chunks are real, disk-verified files — §1.1/§2.2 in
 * spec-engine/index.js), and the repo record is just an index entry:
 *   { uuid, name, specUuid, rootHash, parent, forks, source, phase, ... }
 * "Access" means resolving specUuid through spec-engine and reading its
 * chunks directly — one source of truth, never a stale second copy.
 *
 * rootHash (spec-engine's computeRootHash — SHA-256 of canonical JSON over
 * the manifest's chunk contents, same convention JAA's content-addressable
 * store already uses) gives the repo real identity: same content -> same
 * hash -> same repo, so forking with no changes yet is genuinely free
 * (same specUuid, same rootHash, until something actually diverges) instead
 * of a byte-copy of metadata nobody reads back.
 *
 * Two ingestion paths converge on the exact same mechanism:
 *   - promote (a spec-engine manifest already exists) -> repo just indexes it.
 *   - drop (raw files, no manifest yet) -> spec-engine.ingestFilesAsSpec()
 *     turns each file into a chunk (same completeChunk, same disk
 *     verification a parsed .spec block gets), THEN the repo indexes that.
 * Neither path has its own storage anymore. One gate, one mechanism.
 *
 * §1.2 every error loud. §7.4 nothing discarded — old repos archived, not deleted.
 * §A-flex declarative: a repo is data, the layer is thin — thinner now than v1.
 */

import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { loadTable, syncTable, migrateOnce } from '../lib/db.js';
import { runImportPipeline } from './import-pipeline.js';
import * as sourceFiles from './source-files.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const COMPONENT_ID = 'nexus-id';   // idearium, in the UID registry
const REPOS_FILE_NAME = 'idearium-repos.json';  // legacy flat file — read once as a migration source, then left alone (§7.4)
const REPOS_TABLE = 'idearium_repos';

export class RepoLayer {
  constructor({ ideaOS, specEngine, dataDir } = {}) {
    this.os = ideaOS;                        // IdeaOS instance (public methods) — idea lifecycle only now
    // specEngine may be passed as the module itself, or as a getter function
    // (preferred — spec-engine loads asynchronously at boot; a getter means
    // a RepoLayer constructed before that load finishes still sees it once
    // ready, instead of permanently caching a null snapshot).
    this._seGetter = typeof specEngine === 'function' ? specEngine : () => specEngine;
    this.dataDir = dataDir || createRequire(import.meta.url)('../lib/data-dir.cjs').ideariumDataDir();   // §SANDBOX 2026-09-25 — idearium/lib/data-dir.cjs decides (test processes get a temp root).
    this.reposFile = path.join(this.dataDir, REPOS_FILE_NAME);
    this.repos = this._load();
    this._migrateBuildingDefault();
  }

  // §0.39.261 — every repo made before this version was stamped 'building' at
  // creation (and so was the "Repo: x" idea minted for it), whether anything
  // was building or not. At construction (boot) nothing is building yet, so a
  // repo still carrying the old default — and its auto-minted idea — moves to
  // 'specced'. The build queue sets 'building' again the moment real work
  // starts. Ideas a person wrote are never touched (source must be repo-ingest).
  _migrateBuildingDefault() {
    try {
      let moved = 0;
      for (const r of this.repos.repos) if (r.phase === 'building') { r.phase = 'specced'; moved++; }
      const ideas = this.os && this.os.db && Array.isArray(this.os.db.ideas) ? this.os.db.ideas : null;
      let ideasMoved = 0;
      if (ideas) {
        const repoIdeas = new Set(this.repos.repos.map(r => r.ideaUuid).filter(Boolean));
        for (const i of ideas) if (i.phase === 'building' && i.source === 'repo-ingest' && repoIdeas.has(i.uuid)) { i.phase = 'specced'; ideasMoved++; }
        if (ideasMoved) syncTable('idearium_ideas', ideas, 'uuid');
      }
      if (moved) this._save();
      if (moved || ideasMoved) console.log(`[idearium/repo] ${moved} repo(s) and ${ideasMoved} repo idea(s) moved from the old 'building' default to 'specced'`);
    } catch (e) { console.warn(`[idearium/repo] building-default migration skipped: ${e.message}`); }
  }

  // §BUILT 2026-09-06 — James: "files in the compartment/repo are
  // physical in the /projects/repo name or uuid... make idearium
  // solid. persistent. physical."
  //
  // §RESPECTS this file's own real architecture, stated in its header:
  // "a repo no longer has its own content store at all... one source of
  // truth, never a stale second copy." materialize() is deliberately a
  // regenerated PROJECTION of the spec-engine manifest, not a second,
  // independently-editable store — every real call rewrites the whole
  // tree from the manifest's own current chunk content. Editing a file
  // directly under /projects/<uuid>/ will be silently overwritten on
  // the next materialize() call; that's intentional, not a bug — the
  // manifest stays the one real source of truth, this is just where its
  // content becomes real, physical, inspectable-by-anything-not-just-
  // idearium files on disk, kept honestly in sync rather than a second
  // place that could quietly drift.
  // §PROJECT-IMPORT-DIR 2026-09-15 — James: "i want it to create the
  // compartment in idearium's repo folder" — i.e. physically inside
  // idearium/repo/ (this module's own directory, via lib/project-
  // import.config.js's REPO_STORAGE.dir = idearium/repo/repos/), not
  // idearium/data/projects/ (RepoLayer's existing default, still used by
  // every OTHER ingest path — drop/promote/fork — unchanged). Scoped
  // per-repo, not a global default change: `r.materializeDir`, set once
  // at ingest() time (below) for callers that pass materializeBaseDir,
  // persisted on the repo record, and honored here on every future
  // materialize() call (including the quiet ones _materializeQuiet fires
  // after a later writeFile/deleteFile) — so an imported project keeps
  // landing in the same real directory for its whole lifetime, not just
  // its first materialize.
  materialize(repoUuid) {
    const r = this.repos.repos.find(x => x.uuid === repoUuid);
    if (!r) return { error: 'repo not found' };
    if (!this.se) return { error: 'repo layer has no spec-engine — cannot read content to materialize' };

    const outDir = r.materializeDir || path.join(this.dataDir, 'projects', repoUuid);
    try {
      fs.mkdirSync(outDir, { recursive: true });
      // Real, existing files removed first — a chunk that was deleted
      // (deleteFile()) or renamed must not leave a stale physical file
      // behind after materialize() runs; the tree is always regenerated
      // to genuinely match the manifest's current, real state, not
      // merged with whatever happened to be there before.
      //
      // §PRESERVED 2026-09-15 — lib/project-container.js's finalize step
      // writes manifest.json, project.json, and a real .git directory
      // straight into this same outDir, AFTER the spec-engine manifest
      // (this.get(repoUuid).files) was built — none of those three are
      // spec chunks, so they were never going to survive the next
      // deleteFile()/writeFile()-triggered materialize() (see
      // _materializeQuiet's call sites) without this exclusion. Losing a
      // repo's own .git history and its import manifest the first time
      // someone edits a file in it would silently undo exactly what
      // "Upload Project" was asked to produce — this skip-list is
      // narrow and name-based on purpose: it does not special-case
      // "top-level files added later" generally, only the three real,
      // known artifacts project-container.js owns.
      // §PIPELINE-ARTIFACTS 2026-09-15 — chunks/, atlas.json, indexes/,
      // and verification.json are import-pipeline.js's L2-L5 output
      // (parse/atlas/chunks/verify/index), written straight into this
      // same outDir after ingest. Same reasoning as the three entries
      // above: none of these are spec chunks, so without this they'd
      // silently vanish the first time a later writeFile()/deleteFile()
      // triggers a quiet re-materialize.
      // §PRESERVE-GAP 2026-09-20 — found while wiring MCO3 snapshots over real
      // HTTP: this list stopped at verification.json, so every materialize()
      // silently deleted graph.json (MCO1), verification.lazy.json (MCO2)
      // and, from the CI work, .nexus-ci.json and .nexus-ci-runs/ (cos/ci
      // keeps its config and run history in the repo directory). Each was
      // added by a later phase than this list. The snapshot route itself
      // triggered it: _repoDiskDir() materializes, which wiped the graph it
      // was about to record. Names are literal (not imported from cos/ci) so
      // this file keeps no dependency on it; tests/modules/test-mco3-repo-
      // snapshot.js asserts they still match cos/ci's constants.
      const PRESERVE = new Set(['.git', 'manifest.json', 'project.json', 'chunks', 'atlas.json', 'indexes', 'verification.json',
        'graph.json', 'spec-graph.json', 'verification.lazy.json', 'proof.json', '.nexus-ci.json', '.nexus-ci-runs']);

      // §SOURCE-FILES 2026-09-15 — James: "it needs to import the real
      // files from the uploaded project to the repo, not just the
      // chunks." The sweep above is correct for AUTHORED content, where
      // the manifest genuinely is the source and can regenerate
      // everything it deletes. It is wrong for IMPORTED content, where
      // the source was the uploaded zip — now gone — and the manifest is
      // only a lossy reading of it (text-only, extension-filtered,
      // truncated at max_chunk_bytes). Running the authored rule over
      // imported bytes is what silently deleted every binary and
      // truncated every large file. See repo/source-files.js's header
      // for the full reasoning; here it is two real rules:
      //
      //   1. never DELETE a path the source layer owns
      //   2. never WRITE A CHUNK OVER one — a chunk is a
      //      possibly-truncated reading of that same file, so
      //      overwriting real bytes with a truncated copy of themselves
      //      is pure loss
      //
      // §FAIL SAFE — preserveEntries() returns null when a source
      // manifest EXISTS but cannot be read. Deleting real,
      // unrecoverable files because the list of what to keep was
      // unreadable is the worst thing this function could do, so that
      // case skips the destructive sweep entirely and says so, rather
      // than falling back to "preserve nothing".
      const srcManifest = sourceFiles.loadSourceManifest(outDir);
      const srcPaths    = sourceFiles.sourcePathSet(srcManifest);
      const srcPreserve = sourceFiles.preserveEntries(outDir);

      if (srcPreserve === null) {
        console.error(`[idearium/repo] §1.2 materialize(${repoUuid}) — ${sourceFiles.SOURCE_MANIFEST_FILE} exists but is unreadable; SKIPPING the stale-file sweep so no real source file is deleted. Chunks are still written. Fix or remove that file to restore normal materialize behavior.`);
      } else {
        for (const entry of srcPreserve) PRESERVE.add(entry);
        for (const entry of fs.readdirSync(outDir)) {
          if (PRESERVE.has(entry)) continue;
          fs.rmSync(path.join(outDir, entry), { recursive: true, force: true });
        }
      }

      let written = 0;
      let deferred = 0;
      let failedPaths = [];
      // §PERF 0.39.260 — James: "imported my mastermind project and now
      // idearium isn't running properly." This loop used to call
      // this.get() once and then this.readFile() per file, and readFile()
      // goes through _resolveChunk() -> se.loadSpec(), which JSON.parses
      // the WHOLE manifest (every chunk's content) from disk each time.
      // N files = N full parses of an N-file manifest: measured 1.9 s at
      // 200 files, 11.5 s at 500; the 1364-file MASTERMIND import held the
      // event loop long enough for the orchestrator watchdog to mark
      // idearium OFFLINE, and on the next boot the same pass inside the
      // spec→repo reconcile stalled the phase-3 /health gate. One parse,
      // one path index, same resolution rule as _resolveChunk().
      let manifest;
      try { manifest = this.se.loadSpec(r.specUuid); }
      catch (e) { return { error: `spec ${r.specUuid} unreadable: ${e.message}` }; }
      const live = (manifest.chunks || []).filter(c => c.status !== 'removed').sort((a, b) => a.chunkIdx - b.chunkIdx);
      const byKey = new Map();
      for (const key of ['realPath', 'fileName', 'sectionId']) {
        for (const c of live) if (c[key] && !byKey.has(c[key])) byKey.set(c[key], c);
      }
      const files = live.map(c => c.realPath || c.fileName || `${String(c.chunkIdx).padStart(2,'0')}-${c.sectionId}.md`);
      const madeDirs = new Set();
      for (const fpath of files) {
        // Rule 2 — the real file wins. Counted as deferred, not skipped:
        // the content IS on disk, just not from this layer.
        if (srcPaths.has(fpath)) { deferred++; continue; }
        const chunk = byKey.get(fpath.replace(/^\/+/, ''));
        if (!chunk) { failedPaths.push(fpath); continue; } // §1.2 — a real, individual missing chunk must not abort the whole materialize
        const dest = path.join(outDir, fpath);
        const dir = path.dirname(dest);
        if (!madeDirs.has(dir)) { fs.mkdirSync(dir, { recursive: true }); madeDirs.add(dir); }
        fs.writeFileSync(dest, chunk.content || '', 'utf8');
        written++;
      }
      // §FIXED 2026-09-19 — James: "needs to fail when it doesn't
      // actually generate." Before this, a manifest whose every chunk
      // failed/was unreadable still returned ok:true with written:0 —
      // the same silent-success shape as the ingestFilesAsSpec bug fixed
      // alongside this one. A materialize that produced zero real files
      // out of a non-empty manifest, and didn't defer every one of them
      // to a real source file, is a real failure of this call, not an
      // empty-but-fine result.
      const producedNothing = files.length > 0 && written === 0 && deferred < files.length;
      return {
        ok: !producedNothing,
        error: producedNothing
          ? `materialize produced 0 real files out of ${files.length} — every chunk failed or was unreadable: ${failedPaths.slice(0, 10).join(', ')}${failedPaths.length > 10 ? ` (+${failedPaths.length - 10} more)` : ''}`
          : undefined,
        dir: outDir, written, total: files.length, failed: failedPaths.length,
        // Honest accounting of the two layers, so a caller can tell
        // "nothing was written because the repo is empty" from "nothing
        // was written because the real files already cover every path".
        sourceFiles: srcManifest && !srcManifest.unreadable ? srcManifest.totalFiles : 0,
        deferredToSource: deferred,
      };
    } catch (e) {
      // §1.2 loud, non-fatal — the real, authoritative manifest content
      // is untouched by a materialize failure; only the physical
      // projection failed to (re)generate.
      console.error(`[idearium/repo] materialize(${repoUuid}) failed: ${e.message}`);
      return { error: e.message };
    }
  }

  // §SOURCE-FILES 2026-09-15 — the real bytes of an imported project,
  // written into the repo's physical directory before the first
  // materialize() so that call already sees them as source-owned.
  //
  // §ORDER MATTERS AND IS NOT INCIDENTAL — a caller must do
  // ingest() -> writeSources() -> materialize(). Reversing the last two
  // means the first materialize() runs with no source manifest present,
  // finds the directory empty of anything it recognizes, and behaves
  // exactly as it did before this layer existed. Stated here because
  // the requirement is invisible from the signatures alone.
  //
  // realFiles is lib/zip-ingest.js's realFiles shape:
  // [{ path, buffer, bytes, binary, sha256 }].
  writeSources(repoUuid, realFiles = []) {
    const r = this.repos.repos.find(x => x.uuid === repoUuid);
    if (!r) return { ok: false, error: 'repo not found' };
    const outDir = r.materializeDir || path.join(this.dataDir, 'projects', repoUuid);

    const result = sourceFiles.writeSourceFiles(outDir, realFiles, { verify: true });
    if (result.ok && result.manifest) {
      // Recorded on the repo record too, not only in the directory, so a
      // reader that has the repo row but not the disk (a UI listing, an
      // API response) can still say how much real content this repo
      // holds without a filesystem round trip.
      r.sourceFileCount = result.manifest.totalFiles;
      r.sourceBytes     = result.manifest.totalBytes;
      r.sourceWrittenAt = result.manifest.writtenAt;
      if (result.failed.length) r.sourceFailedCount = result.failed.length;
      r.updatedAt = Date.now();
      this._save();
    }
    return result;
  }

  // §0.39.265 — writeSources for a big tree while the server is serving
  // (nexus-self sync): yields every 50 files, keeps unchanged files.
  async writeSourcesAsync(repoUuid, realFiles = []) {
    const r = this.repos.repos.find(x => x.uuid === repoUuid);
    if (!r) return { ok: false, error: 'repo not found' };
    const outDir = r.materializeDir || path.join(this.dataDir, 'projects', repoUuid);
    const result = await sourceFiles.writeSourceFilesAsync(outDir, realFiles, { verify: true });
    if (result.ok && result.manifest) {
      r.sourceFileCount = result.manifest.totalFiles;
      r.sourceBytes     = result.manifest.totalBytes;
      r.sourceWrittenAt = result.manifest.writtenAt;
      if (result.failed.length) r.sourceFailedCount = result.failed.length;
      r.updatedAt = Date.now();
      this._save();
    }
    return result;
  }

  // §MCO-C 2026-09-20 — the source layer's single-file primitives, for snapshot
  // restore (see source-files.js setSourceFile).
  _sourceDir(repoUuid) {
    const r = this.repos.repos.find(x => x.uuid === repoUuid);
    if (!r) return null;
    return r.materializeDir || path.join(this.dataDir, 'projects', repoUuid);
  }
  isSourceOwned(repoUuid, relPath) {
    const dir = this._sourceDir(repoUuid); if (!dir) return false;
    return sourceFiles.sourcePathSet(sourceFiles.loadSourceManifest(dir)).has(relPath);
  }
  writeSourceBytes(repoUuid, relPath, buffer) {
    { const im = this._immutableError(repoUuid); if (im) return { error: im, code: 'IMMUTABLE' }; }
    const dir = this._sourceDir(repoUuid); if (!dir) return { error: 'repo not found' };
    const r = sourceFiles.setSourceFile(dir, relPath, buffer);
    return r.ok ? { ok: true } : { error: r.error };
  }
  /**
   * writeTextFile(repoUuid, relPath, text) — write one text file through the repo,
   * whichever layer owns it. A file the source layer owns (an imported project's
   * real files) is written as bytes, with its chunk kept in step; anything else
   * goes through the chunk store. Materialized and reindexed once.
   * §MCO-E 2026-09-20 — for the roadmap editor.
   */
  // §2026-09-21 opts.preserveWhitespace — opt-in byte fidelity, passed through
  // to spec-engine's completeChunk (whose default trims, per its own
  // §BYTE-FIDELITY note). Source code written by lib/repo-inject.js needs the
  // exact bytes; every existing caller passes nothing and is unchanged.
  writeTextFile(repoUuid, relPath, text, opts = {}) {
    { const im = this._immutableError(repoUuid); if (im) return { error: im, code: 'IMMUTABLE' }; }
    if (typeof text !== 'string') return { error: 'text must be a string' };
    if (this.isSourceOwned(repoUuid, relPath)) {
      this.writeFile(repoUuid, relPath, text, { defer: true, preserveWhitespace: !!opts.preserveWhitespace }); // chunk in step; a chunk problem is not this write's failure
      const r = this.writeSourceBytes(repoUuid, relPath, Buffer.from(text, 'utf8'));
      if (r.error) return { error: r.error };
      this.refresh(repoUuid);
      return { ok: true, via: 'source' };
    }
    const r = this.writeFile(repoUuid, relPath, text, { preserveWhitespace: !!opts.preserveWhitespace });
    return r.error ? { error: r.error } : { ok: true, via: 'chunk', created: !!r.created };
  }

  deleteSourceFile(repoUuid, relPath) {
    { const im = this._immutableError(repoUuid); if (im) return { error: im, code: 'IMMUTABLE' }; }
    const dir = this._sourceDir(repoUuid); if (!dir) return { error: 'repo not found' };
    const r = sourceFiles.removeSourceFile(dir, relPath);
    return r.ok ? { ok: true } : { error: r.error };
  }

  /** Real re-hash of this repo's source files against their manifest. */
  verifySources(repoUuid) {
    const r = this.repos.repos.find(x => x.uuid === repoUuid);
    if (!r) return { ok: false, error: 'repo not found' };
    const outDir = r.materializeDir || path.join(this.dataDir, 'projects', repoUuid);
    return sourceFiles.verify(outDir);
  }

  get se() { return this._seGetter(); }

  // §DB-MIGRATION 2026-07-14 — same move as idearium/index.js: repos.json
  // was rewritten whole on every ingest/fork/archive/file-edit. Now backed
  // by cortex's shared JaaStore (idearium/lib/db.js), one row per repo,
  // one-time non-destructive fold of whatever was already in the flat file.
  _load() {
    let legacy = null;
    try { legacy = JSON.parse(fs.readFileSync(this.reposFile, 'utf8')); }
    catch { /* no legacy file, or unreadable — nothing to migrate */ }
    const mig = migrateOnce(REPOS_TABLE, legacy ? (legacy.repos || []) : [], 'uuid');
    if (mig.migrated) console.log(`[idearium/repo] migrated ${mig.count} legacy repo rows -> cortex table '${REPOS_TABLE}'`);
    return { _version: 2, repos: loadTable(REPOS_TABLE) };
  }
  _save() {
    try { syncTable(REPOS_TABLE, this.repos.repos, 'uuid'); }
    catch (e) { console.error(`[idearium/repo] §1.2 save failed: ${e.message}`); }
  }

  // ── ingest — the single entry point for both convergent paths ──────────────
  // Case A (specUuid given — promote path): the manifest already exists.
  //   No new spec is created. Just index it.
  // Case B (files given, no specUuid — raw drop): spec-engine turns the files
  //   into a real manifest (one chunk per file, real content, disk-verified)
  //   via ingestFilesAsSpec, THEN it's indexed the same way as case A.
  // Either way, the repo record never holds file content or byte counts of
  // its own — only a pointer (specUuid) and a content identity (rootHash).
  // Returns { repo, ideaUuid, specUuid }.
  // materializeBaseDir — §PROJECT-IMPORT-DIR 2026-09-15 (see materialize()'s
  // own header above). When given, the new repo's physical directory is
  // path.join(materializeBaseDir, repoUuid) instead of RepoLayer's default
  // idearium/data/projects/<repoUuid> — persisted on the repo record so
  // every later materialize() (including quiet ones after an edit) keeps
  // using it. null for every existing caller — purely additive.
  ingest({ name, specUuid = null, files = [], source = 'drop', parent = null, promotedFromSpec = null, compartmentId = null, materializeBaseDir = null, bare = false, ideaUuid: fromIdea = null } = {}) {
    if (!name) return { error: 'repo name required' };
    if (!this.se) return { error: 'repo layer has no spec-engine — cannot store content' };

    // §STRUCTURAL 2026-09-16 — generated here, before ingestFilesAsSpec(),
    // not after the dedup check below (where it used to live) — the whole
    // point of threading a real repoUuid into chunk-node writes is that
    // it has to exist BEFORE the first chunk-node write happens, and that
    // write happens inside ingestFilesAsSpec() itself. Cheap to generate
    // and harmless if unused: if the dedup check below finds this is a
    // byte-identical duplicate of an existing repo, this repoUuid is
    // simply discarded along with the rest of this ingest — it was never
    // persisted to this.repos, only baked into that one call's chunk-node
    // filenames as an honest (if ultimately unused) record of the attempt.
    const repoUuid = `${COMPONENT_ID}-repo-${randomUUID().slice(0, 8)}`;

    let manifest;
    try {
      if (specUuid) {
        manifest = this.se.loadSpec(specUuid);
      } else if (files.length) {
        manifest = this.se.ingestFilesAsSpec({ name, files, author: source || 'drop', repoUuid });
      } else if (bare) {
        // §BUILT 2026-09-20 — James: idearium's repo page needs a "Create
        // repo" button distinct from importing one. Every existing path
        // required either an existing spec or real file content — there
        // was no way to start a genuinely empty repo. createSpec() is the
        // same real spec-creation function the idea->spec flow already
        // uses; a bare repo IS just a spec with nothing built yet — every
        // chunk starts PENDING, same as any brand-new spec, nothing special
        // faked here to make it look populated.
        manifest = this.se.createSpec({ name, type: 'component', description: `bare repo: ${name}`, author: source || 'create' });
      } else {
        return { error: 'ingest requires specUuid (existing manifest), files (to create one), or bare:true (to start empty)' };
      }
    } catch (e) { return { error: `content ingest failed: ${e.message}` }; }

    // §DEDUP — same content already exists under a different repo. Not an
    // error: return the existing repo instead of indexing a byte-identical
    // duplicate. This is the free-fork lever in reverse — content that
    // already exists doesn't need a second index entry either.
    //
    // §BUG FIXED 2026-09-03 — found while wiring repo-first creation
    // (James: "create a repository, then send each chunk..."). computeRootHash
    // hashes only {sectionId, content} per chunk (spec-engine/index.js's
    // _hashChunk) — nothing spec-identity-bearing. A brand-new spec has
    // every chunk's content === null until built, so EVERY fresh spec built
    // from the same block set (blocks.yaml's standard 10) computes the
    // identical rootHash at creation, regardless of name or uuid. Ingesting
    // a repo immediately after spec creation (chunks all still PENDING)
    // would have hit this dedup check on the very first empty spec ever
    // made and silently reused that ONE repo for every subsequent new spec
    // forever — never actually creating a distinct repo, no error, no
    // warning. Dedup is only meaningful once there's real content to be a
    // duplicate OF; an all-pending manifest has none, so it never qualifies.
    const hasRealContent = manifest.chunks.some(c => c.status === 'complete' && c.content);
    const existing = hasRealContent
      ? this.repos.repos.find(r => r.rootHash === manifest.rootHash && r.status !== 'archived')
      : null;
    if (existing && !parent) {
      console.log(`[idearium/repo] content dedup — "${name}" matches existing repo ${existing.uuid.slice(0,8)} (rootHash ${manifest.rootHash.slice(0,12)}…), reusing`);
      return { repo: existing, ideaUuid: existing.ideaUuid, specUuid: existing.specUuid, deduped: true };
    }

    // repoUuid already generated above, before ingestFilesAsSpec() ran

    // idea lifecycle tracking — still owned by IdeaOS, not content.
    // §0.39.261 — James: "not make the default state for repos, building …
    // once a idea is a spec, move the idea section to the repo." Two changes:
    //   1. an idea the caller names (the idea this repo was made FROM — the
    //      spec wizard and the idea->spec flow pass it) becomes the repo's own
    //      idea: linked, moved to 'specced', not duplicated by a new "Repo: x"
    //      idea. The Idea tab then shows and grows THAT idea.
    //   2. the phase a repo starts in is 'specced' (IDEA_PHASES: it has a spec,
    //      nothing is building). 'building' is set by what actually builds —
    //      the build queue and the spec build route — never assumed.
    let ideaUuid = null;
    try {
      const known = fromIdea && this.os && this.os.db && Array.isArray(this.os.db.ideas) ? this.os.db.ideas.find(i => i.uuid === fromIdea) : null;
      if (known) {
        ideaUuid = known.uuid;
        if (['seed', 'expanding', 'tensioned'].includes(known.phase)) { known.phase = 'specced'; known.updatedAt = Date.now(); }
        syncTable('idearium_ideas', this.os.db.ideas, 'uuid');
      } else if (this.os && typeof this.os.createIdea === 'function') {
        const idea = this.os.createIdea({ text: `Repo: ${name}`, phase: 'specced', source: 'repo-ingest' });
        ideaUuid = idea?.uuid || null;
      } else if (this.os && this.os.db && Array.isArray(this.os.db.ideas)) {
        ideaUuid = randomUUID();
        this.os.db.ideas.push({
          uuid: ideaUuid, text: `Repo: ${name}`, phase: 'specced',
          tension: 0.5, parent, createdAt: Date.now(), source: 'repo-ingest',
          tags: [], resonanceWith: [], tensionWith: [],
        });
        // §GAP FIXED 2026-07-14 — this push had no matching save anywhere;
        // it only ever reached disk if some unrelated IdeaOS gate happened
        // to fire its (formerly whole-file) saveDB afterward. Persist it
        // directly through the same table IdeaOS itself uses.
        syncTable('idearium_ideas', this.os.db.ideas, 'uuid');
      }
    } catch (e) { console.warn(`[idearium/repo] idea create degraded: ${e.message}`); }

    const repo = {
      uuid:      repoUuid,
      name,
      ideaUuid,
      specUuid:  manifest.uuid,
      rootHash:  manifest.rootHash,          // content identity — the archive's address
      // §SBP1 2026-08-28 — real, additive composition point named when
      // SBP1 concluded RepoLayer and COS's compartment system don't
      // overlap: a repo can now point at BOTH its spec content (specUuid,
      // already real) AND a real COS compartment (compartmentId, this
      // field) without either system needing to know about the other's
      // internals. null by default — every existing real caller
      // (getRepoLayer().ingest() in idearium/api/index.js) is completely
      // unaffected; this is purely additive.
      compartmentId: compartmentId || null,
      promotedFromSpec: promotedFromSpec || null,
      parent,                                 // fork lineage
      forks:     [],
      source,                                 // 'drop' | 'fork' | 'cli' | 'promote:emerge' | 'promote:manual'
      phase:     'specced',                    // §0.39.261 — was 'building' for every repo, building or not
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status:    'active',
      // null for every path except project-import's finalize call — see
      // materialize()'s own header for why this field, once set, is
      // honored for the repo's whole lifetime rather than just this call.
      materializeDir: materializeBaseDir ? path.join(materializeBaseDir, repoUuid) : null,
    };
    this.repos.repos.push(repo);

    if (parent) {
      const p = this.repos.repos.find(r => r.uuid === parent);
      if (p) { p.forks.push(repoUuid); }
    }
    this._save();
    // §BUILT 2026-09-06 — James: "the moment a spec is made the
    // compartment and repo are made... files in the compartment/repo
    // are physical." Real, first materialization right at creation —
    // even with 0 real chunk content yet (a fresh, all-pending spec),
    // this creates the real, physical /projects/<repoUuid>/ directory
    // immediately, so it exists the moment the repo does, not only
    // once something happens to write into it later. A failed
    // materialize here must never fail the repo creation itself — the
    // repo record (just persisted, above) is the real, authoritative
    // thing; the physical projection is additive.
    const matResult = this.materialize(repoUuid);
    if (matResult.error) console.warn(`[idearium/repo] initial materialize for ${repoUuid} failed, repo still created: ${matResult.error}`);
    return { repo, ideaUuid, specUuid: manifest.uuid };
  }

  // ── fork — genuinely free when nothing has changed yet: the new repo
  // record points at the SAME specUuid/rootHash as its parent. No content
  // is copied. Divergence (editing the fork) is spec-engine's concern —
  // it would create/complete new chunks under a new spec, which naturally
  // produces a new rootHash the next time this repo is re-ingested.
  fork(repoUuid, newName) {
    const src = this.repos.repos.find(r => r.uuid === repoUuid);
    if (!src) return { error: 'repo not found' };
    // §IMMUTABLE 0.39.261 — a free fork shares src.specUuid, so a write on the
    // fork would edit the immutable repo's own spec. Immutable content is
    // branched in COS instead.
    { const im = this._immutableError(repoUuid); if (im) return { error: im, code: 'IMMUTABLE' }; }
    return this.ingest({
      name: newName || `${src.name}-fork`,
      specUuid: src.specUuid,
      source: 'fork',
      parent: repoUuid,
    });
  }

  // §IMMUTABLE 0.39.261 — James: "a nexus repo in idearium, that immutable".
  // A repo with immutable:true (the per-system Nexus repos, lib/nexus-self)
  // refuses every content mutation through this layer. Its content changes
  // only by moving to a new snapshot (replaceSpec, called by the sync), and
  // edits reach the live tree only through the apply gate
  // (lib/nexus-self/apply.js) from a COS branch.
  _immutableError(repoUuid) {
    const r = this.repos.repos.find(x => x.uuid === repoUuid);
    if (r && r.immutable) {
      return `repo "${r.name}" is immutable — edit on a COS branch (POST /api/nexus-self/${r.nexusSelf?.system || '<system>'}/branch) and apply through the gate`;
    }
    return null;
  }

  /** annotate(repoUuid, fields) — set repo-record metadata (immutable, nexusSelf). Content is never touched here. */
  annotate(repoUuid, fields = {}) {
    const r = this.repos.repos.find(x => x.uuid === repoUuid);
    if (!r) return { error: 'repo not found' };
    const ALLOWED = ['immutable', 'nexusSelf', 'ideaUuid'];
    for (const k of ALLOWED) if (Object.prototype.hasOwnProperty.call(fields, k)) r[k] = fields[k];
    r.updatedAt = Date.now();
    this._save();
    return { ok: true, repo: r };
  }

  /**
   * replaceSpec(repoUuid, specUuid) — point a repo at a new, already-complete
   * spec (a new immutable version of its content). The previous spec is kept
   * on disk and listed in r.specHistory; nothing is edited in place.
   */
  replaceSpec(repoUuid, specUuid) {
    const r = this.repos.repos.find(x => x.uuid === repoUuid);
    if (!r) return { error: 'repo not found' };
    let manifest;
    try { manifest = this.se.loadSpec(specUuid); } catch (e) { return { error: `spec ${specUuid} unreadable: ${e.message}` }; }
    r.specHistory = [...(r.specHistory || []), { specUuid: r.specUuid, rootHash: r.rootHash, until: Date.now() }];
    r.specUuid = manifest.uuid;
    r.rootHash = manifest.rootHash;
    r.updatedAt = Date.now();
    this._save();
    return { ok: true, repo: r };
  }

  // ── queries for the UI ──────────────────────────────────────────────────────
  list(filter = {}) {
    let rs = this.repos.repos.filter(r => r.status !== 'archived' || filter.includeArchived);
    if (filter.source) rs = rs.filter(r => r.source === filter.source);
    return rs.map(r => this._enrich(r));
  }
  get(repoUuid) {
    const r = this.repos.repos.find(x => x.uuid === repoUuid);
    return r ? this._enrich(r) : null;
  }
  // §BUILT 2026-09-07 — James: "need to make a file tree per repository
  // and use it as a checklist. each chunk would be one component and
  // dependencies." Real, direct — no new data invented, just a real
  // view over what _enrich() already returns: files[].status (already
  // real, already tracked as 'pending'/'complete'/etc. per chunk) is
  // the checklist state; files[].path already gives the real tree
  // structure via its own real directory separators.
  checklist(repoUuid) {
    const r = this.get(repoUuid);
    if (!r) return { error: 'repo not found' };
    const tree = {};
    for (const f of r.files) {
      const parts = f.path.split('/');
      let node = tree;
      for (let i = 0; i < parts.length - 1; i++) {
        node[parts[i]] = node[parts[i]] || { __dir: true, children: {} };
        node = node[parts[i]].children;
      }
      node[parts[parts.length - 1]] = {
        __dir: false, status: f.status, done: f.status === 'complete',
        compId: f.comp_id, seamId: f.seam_id, bytes: f.bytes,
      };
    }
    const done = r.files.filter(f => f.status === 'complete').length;
    return { repoUuid, name: r.name, tree, total: r.files.length, done, remaining: r.files.length - done };
  }

  // Real markdown rendering of checklist() — "use it AS a checklist,"
  // not just structured data describing one.
  checklistMarkdown(repoUuid) {
    const c = this.checklist(repoUuid);
    if (c.error) return c.error;
    const lines = [`# ${c.name} — ${c.done}/${c.total} complete`, ''];
    const walk = (node, depth) => {
      for (const [name, entry] of Object.entries(node).sort(([a], [b]) => a.localeCompare(b))) {
        const indent = '  '.repeat(depth);
        if (entry.__dir) { lines.push(`${indent}- 📁 ${name}/`); walk(entry.children, depth + 1); }
        else lines.push(`${indent}- [${entry.done ? 'x' : ' '}] ${name}${entry.compId ? ` (${entry.compId})` : ''}`);
      }
    };
    walk(c.tree, 0);
    return lines.join('\n');
  }

  lineage(repoUuid) {
    const out = [];
    const walk = (uuid, depth = 0) => {
      const r = this.repos.repos.find(x => x.uuid === uuid);
      if (!r) return;
      out.push({ uuid, name: r.name, depth, source: r.source });
      for (const f of r.forks) walk(f, depth + 1);
    };
    walk(repoUuid);
    return out;
  }

  // §ACCESS — this is "access the archive": resolve the repo's spec-engine
  // manifest directly and read its chunks. No stored copy to go stale, no
  // second content system to keep in sync. If the manifest is gone (spec
  // archived/compressed to .tar.gz — spec-engine's own idle-archival), that's
  // surfaced honestly rather than silently returning an empty file list.
  _enrich(r) {
    const idea = (this.os && r.ideaUuid && this.os.idea) ? this.os.idea(r.ideaUuid) : null;
    let manifest = null, filesError = null;
    // §0.39.265 — metadata only (no chunk content), cached until the manifest changes:
    // a list of every repo used to parse every repo's full manifest, core's alone ~20 MB.
    try { manifest = this.se ? (typeof this.se.loadSpecMeta === 'function' ? this.se.loadSpecMeta(r.specUuid) : this.se.loadSpec(r.specUuid)) : null; }
    catch (e) { filesError = `spec ${r.specUuid} unreadable: ${e.message}`; }
    // §BUG FIXED 2026-07-11 — removed chunks (deleteFile → removeChunk)
    // were still showing up in the repo's file listing — the whole point
    // of soft-delete is that a removed file stops being "in" the repo,
    // it just isn't destroyed on disk.
    const files = manifest
      ? manifest.chunks.filter(c => c.status !== 'removed').slice().sort((a,b)=>a.chunkIdx-b.chunkIdx).map(c => ({
          // §REALPATH 2026-09-15 — dropped files carry their real
          // original path (ingestFilesAsSpec) so materialize() writes
          // them to disk under it, not the chunk store's own numbered
          // "01-section-id.md" naming. Authored .spec sections have no
          // realPath (null) and keep the existing fileName behavior —
          // there's no "real file" to preserve for those.
          path: c.realPath || c.fileName || `${String(c.chunkIdx).padStart(2,'0')}-${c.sectionId}.md`,
          bytes: c.byteSize || 0,
          comp_id: c.comp_id || null,
          seam_id: c.seam_id || null,
          status: c.status,
        }))
      : [];
    return {
      ...r,
      // §BUG FIXED 2026-07-11 — r.rootHash is a snapshot taken once at
      // ingest time. Editing/adding/removing a file after promotion (the
      // whole point of the file-CRUD endpoints) changes the manifest's
      // real rootHash but never touched this stored copy — every repo
      // view after the first edit showed a rootHash that no longer
      // matched what the repo actually contained. Live values from the
      // manifest are the source of truth; the stored one is a fallback
      // only for the (should-be-rare) case the manifest is unreadable.
      rootHash: manifest ? manifest.rootHash : r.rootHash,
      phase: idea ? idea.phase : r.phase,
      tension: idea ? idea.tension : null,
      hasSpec: !!manifest,
      specName: manifest ? manifest.name : null,
      fileCount: files.length,
      files,
      filesError,
    };
  }

  archive(repoUuid) {
    const r = this.repos.repos.find(x => x.uuid === repoUuid);
    if (!r) return { error: 'not found' };
    r.status = 'archived'; r.updatedAt = Date.now(); this._save();   // §7.4 not deleted
    return { ok: true, uuid: repoUuid };
  }

  // ── file CRUD — v2 has no content store of its own, so these resolve
  // through the repo's specUuid to spec-engine's chunks (the single
  // source of truth this whole redesign exists to establish) rather than
  // maintaining a second copy. §MERGED 2026-07-11.
  _resolveChunk(repoUuid, relPath) {
    const r = this.repos.repos.find(x => x.uuid === repoUuid);
    if (!r) throw new Error('repo not found');
    if (!this.se) throw new Error('repo layer has no spec-engine — cannot read/write content');
    const manifest = this.se.loadSpec(r.specUuid);
    const clean = (relPath || '').replace(/^\/+/, '');
    const chunk = manifest.chunks.find(c =>
      c.status !== 'removed' && (c.realPath === clean || c.fileName === clean || c.sectionId === clean));
    return { repo: r, manifest, chunk, clean };
  }

  readFile(repoUuid, relPath) {
    try {
      const { chunk, clean } = this._resolveChunk(repoUuid, relPath);
      if (!chunk) return { error: `file not found in repo: ${relPath}` };
      return { path: chunk.realPath || chunk.fileName || clean, content: chunk.content || '', bytes: chunk.byteSize || 0 };
    } catch (e) { return { error: e.message }; }
  }

  // §MCO-B 2026-09-20 — `opts.defer` skips the per-write materialize+reindex
  // so a caller writing many files (snapshot restore) pays for it once, via
  // refresh(), instead of once per file. Default behavior is unchanged: every
  // existing caller still gets the immediate, never-stale projection.
  writeFile(repoUuid, relPath, content, opts = {}) {
    { const im = this._immutableError(repoUuid); if (im) return { error: im, code: 'IMMUTABLE' }; }
    if (typeof content !== 'string') return { error: 'content must be a string' };
    try {
      const { manifest, chunk, clean } = this._resolveChunk(repoUuid, relPath);
      if (chunk) {
        // existing file — edit in place via the same completeChunk every
        // other content write goes through (disk-verified, rootHash recomputed)
        this.se.completeChunk(manifest.uuid, chunk.uuid, content, { repoUuid, preserveWhitespace: !!opts.preserveWhitespace });
        if (!opts.defer) this._materializeQuiet(repoUuid); // §BUILT 2026-09-06 — keep the real, physical projection honestly in sync, never stale
        return { ok: true, path: chunk.realPath || chunk.fileName, created: false };
      }
      // new file — no chunk for this path yet. sectionId must be a slug;
      // reuse the path itself (minus extension noise) so fileName stays
      // human-readable in the repo's file list. realPath preserves the
      // real relative path/extension for materialize() (§REALPATH).
      const sectionId = clean.replace(/\.[a-zA-Z0-9]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase() || `file-${Date.now()}`;
      const fresh = this.se.addChunk(manifest.uuid, { sectionId, title: clean, content, realPath: clean, repoUuid, preserveWhitespace: !!opts.preserveWhitespace });
      const newChunk = fresh.chunks.find(c => c.sectionId === sectionId && c.status !== 'removed');
      if (!opts.defer) this._materializeQuiet(repoUuid);
      return { ok: true, path: newChunk?.realPath || newChunk?.fileName || clean, created: true };
    } catch (e) { return { error: e.message }; }
  }

  deleteFile(repoUuid, relPath, opts = {}) {
    { const im = this._immutableError(repoUuid); if (im) return { error: im, code: 'IMMUTABLE' }; }
    try {
      const { manifest, chunk } = this._resolveChunk(repoUuid, relPath);
      if (!chunk) return { error: `file not found in repo: ${relPath}` };
      this.se.removeChunk(manifest.uuid, chunk.uuid);
      if (!opts.defer) this._materializeQuiet(repoUuid); // real, physical file must actually disappear too, not just the manifest's record of it
      return { ok: true, path: chunk.realPath || chunk.fileName };
    } catch (e) { return { error: e.message }; }
  }

  // §BUILT 2026-09-06 — a real content change (write/delete) must never
  // fail or be rolled back just because the physical /projects/ mirror
  // couldn't be regenerated — the manifest write above already
  // succeeded and IS the real, authoritative change; a materialize
  // failure here is logged, never thrown back at the caller.
  //
  // §REPO-018 2026-09-15 — "Mutation produces an updated repository
  // map" (nexus-repository-system.spec §38/§43). A file write/delete
  // through THIS layer (not just through project-import's finalize)
  // now re-runs the L2-L5 pipeline (parse/atlas/chunks/verify/index)
  // against the freshly materialized directory, so a repo's map never
  // goes stale just because the edit came from writeFile()/deleteFile()
  // rather than the initial import. Same non-fatal contract as
  // materialize() itself — a reindex failure is logged, never thrown.
  // Public: materialize + reindex once, after a batch of {defer:true} writes.
  refresh(repoUuid) { this._materializeQuiet(repoUuid); }

  _materializeQuiet(repoUuid) {
    const r = this.materialize(repoUuid);
    if (r.error) { console.warn(`[idearium/repo] materialize for ${repoUuid} failed after a real content change: ${r.error}`); return; }
    try {
      const repo = this.get(repoUuid);
      const pipeline = runImportPipeline(repo, r.dir);
      if (pipeline.state === 'FAULT') console.warn(`[idearium/repo] reindex for ${repoUuid} FAULTed after a real content change: ${pipeline.error || 'see verification tiers'}`);
    } catch (e) {
      console.warn(`[idearium/repo] reindex for ${repoUuid} threw after a real content change: ${e.message}`);
    }
  }
}

export { COMPONENT_ID };
