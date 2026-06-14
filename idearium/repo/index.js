/**
 * idearium/repo/index.js — Idearium Repo Layer (forks/zips as tracked ideas)
 * UUID: idearium-repo-v001-000000000001
 *
 * THE MERGE (per the spec): a fork or a dropped zip is not "a file" — it is an
 * IDEA with a spec and a tree. Idearium already tracks ideas through phases
 * (seed -> ... -> building -> complete) with causal ancestry. A repo is just an
 * idea whose content is a project tree + a .spec, with fork lineage.
 *
 * Organized by repo/.spec (per the chosen UI grouping): every repo has exactly
 * one canonical .spec that defines it; the file tree hangs off that spec.
 *
 * Flow:
 *   drop zip / fork  ->  ingest()  ->  new idea (phase: building)
 *                                   +  new spec (the repo's .spec)
 *                                   +  repo record { files[], specUuid, parent }
 *   fork(repoUuid)   ->  new repo idea, parent = source, lineage tracked
 *
 * Built on IdeaOS PUBLIC methods only (getIdeaOS, idea, spec, ideas) so it
 * respects the existing grain and never reaches into private DB internals
 * beyond the one repos[] array it owns.
 *
 * §1.2 every error loud. §7.4 nothing discarded — old repos archived, not deleted.
 * §A-flex declarative: a repo is data, the layer is thin.
 */

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const COMPONENT_ID = 'nexus-id';   // idearium, in the UID registry
const REPOS_FILE_NAME = 'idearium-repos.json';

// extensions that map to a repo's canonical spec (the .spec the UI groups by)
const SPEC_EXTS = ['.spec', '.spec.md'];

export class RepoLayer {
  constructor({ ideaOS, dataDir } = {}) {
    this.os = ideaOS;                        // IdeaOS instance (public methods)
    this.dataDir = dataDir || path.join(__dirname, '..', 'data');
    this.reposFile = path.join(this.dataDir, REPOS_FILE_NAME);
    this.repos = this._load();
  }

  _load() {
    try { return JSON.parse(fs.readFileSync(this.reposFile, 'utf8')); }
    catch { return { _version: 1, repos: [] }; }
  }
  _save() {
    try { fs.mkdirSync(this.dataDir, { recursive: true }); fs.writeFileSync(this.reposFile, JSON.stringify(this.repos, null, 2)); }
    catch (e) { console.error(`[idearium/repo] §1.2 save failed: ${e.message}`); }
  }

  // ── ingest — a tree of files (already extracted) becomes a tracked repo ─────
  // files: [{ path, bytes, content? }]  — content optional (manifest may omit big blobs)
  // Returns { repo, ideaUuid, specUuid }.
  ingest({ name, files = [], source = 'drop', parent = null, specText = null } = {}) {
    if (!name) return { error: 'repo name required' };

    // find the canonical .spec in the tree (the thing the UI groups by)
    const specFile = files.find(f => SPEC_EXTS.some(e => f.path.toLowerCase().endsWith(e)));
    const repoUuid = `${COMPONENT_ID}-repo-${randomUUID().slice(0, 8)}`;

    // 1. create the IDEA (via the existing IdeaOS path if available)
    let ideaUuid = null;
    try {
      if (this.os && typeof this.os.createIdea === 'function') {
        const idea = this.os.createIdea({ text: `Repo: ${name}`, phase: 'building', source: 'repo-ingest' });
        ideaUuid = idea?.uuid || null;
      } else if (this.os && this.os.db && Array.isArray(this.os.db.ideas)) {
        // fallback: push a minimal idea node respecting the shape
        ideaUuid = randomUUID();
        this.os.db.ideas.push({
          uuid: ideaUuid, text: `Repo: ${name}`, phase: 'building',
          tension: 0.5, parent, createdAt: Date.now(), source: 'repo-ingest',
        });
      }
    } catch (e) { console.warn(`[idearium/repo] idea create degraded: ${e.message}`); }

    // 2. create the SPEC (the repo's canonical .spec)
    let specUuid = null;
    const spec = specText || (specFile && specFile.content) || `# ${name}\n(spec not provided — derived from repo intake)\n`;
    try {
      if (this.os && typeof this.os.createSpec === 'function') {
        const s = this.os.createSpec({ ideaUuid, text: spec, name });
        specUuid = s?.uuid || null;
      } else if (this.os && this.os.db && Array.isArray(this.os.db.specs)) {
        specUuid = randomUUID();
        this.os.db.specs.push({ uuid: specUuid, ideaUuid, name, text: spec, createdAt: Date.now() });
      }
    } catch (e) { console.warn(`[idearium/repo] spec create degraded: ${e.message}`); }

    // 3. the REPO record — the thing the UI lists, keyed by its spec
    const repo = {
      uuid:      repoUuid,
      name,
      ideaUuid,
      specUuid,
      specPath:  specFile ? specFile.path : null,
      parent,                                  // fork lineage
      forks:     [],
      source,                                  // 'drop' | 'fork' | 'cli'
      fileCount: files.length,
      files:     files.map(f => ({ path: f.path, bytes: f.bytes || (f.content ? f.content.length : 0) })),
      phase:     'building',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status:    'active',
    };
    this.repos.repos.push(repo);

    // wire fork lineage
    if (parent) {
      const p = this.repos.repos.find(r => r.uuid === parent);
      if (p) { p.forks.push(repoUuid); this._save(); }
    }
    this._save();
    return { repo, ideaUuid, specUuid };
  }

  // ── fork — branch an existing repo into a new tracked idea ──────────────────
  fork(repoUuid, newName) {
    const src = this.repos.repos.find(r => r.uuid === repoUuid);
    if (!src) return { error: 'repo not found' };
    return this.ingest({
      name: newName || `${src.name}-fork`,
      files: src.files.map(f => ({ path: f.path, bytes: f.bytes })),
      source: 'fork',
      parent: repoUuid,
      specText: null,
    });
  }

  // ── queries for the UI (organized by repo / .spec) ──────────────────────────
  list(filter = {}) {
    let rs = this.repos.repos.filter(r => r.status !== 'archived' || filter.includeArchived);
    if (filter.source) rs = rs.filter(r => r.source === filter.source);
    return rs.map(r => this._enrich(r));
  }
  get(repoUuid) {
    const r = this.repos.repos.find(x => x.uuid === repoUuid);
    return r ? this._enrich(r) : null;
  }
  // lineage: a repo and all its forks, recursively (the fork tree)
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
  _enrich(r) {
    // attach the live idea phase + spec, so the UI shows current state
    const idea = (this.os && r.ideaUuid && this.os.idea) ? this.os.idea(r.ideaUuid) : null;
    const spec = (this.os && r.specUuid && this.os.spec) ? this.os.spec(r.specUuid) : null;
    return {
      ...r,
      phase: idea ? idea.phase : r.phase,
      tension: idea ? idea.tension : null,
      hasSpec: !!spec,
      specName: spec ? (spec.name || r.name) : null,
    };
  }

  archive(repoUuid) {
    const r = this.repos.repos.find(x => x.uuid === repoUuid);
    if (!r) return { error: 'not found' };
    r.status = 'archived'; r.updatedAt = Date.now(); this._save();   // §7.4 not deleted
    return { ok: true, uuid: repoUuid };
  }
}

export { COMPONENT_ID, SPEC_EXTS };
