'use strict';
/**
 * lib/component-store.js — every component WARP builds, kept in its own folder with its dependencies pinned.
 * comp_id: nexus.lib.component-store
 *
 * §0.39.266 (C1) — James: "warp is the build logic. supposed to reuse components. i wanted a components store for
 * all components build in folders with their dependancies." Answers: everything WARP builds · each dependency is its
 * own component, referenced by id + version · the store is a nested repo in Idearium (nexus-self system
 * "components", root folder components/).
 *
 * Before this, a file WARP built lived only inside one spec directory (and died with it when the spec was purged),
 * and reuse was a sha256 of the whole prompt — which embeds the spec name, so the same file for a second project
 * never hit. docs/2026-09-27-components-store-and-atlases-phasemap.spec.
 *
 * Layout (the manifest follows architect's component nodes: id · namespace · name · version):
 *
 *   components/
 *     index.json                              every component, every version, and the two reuse keys
 *     <id>/<version>/<file name>              the file, byte for byte
 *     <id>/<version>/component.json           { id, namespace, name, version, path, sha256, bytes, lang, purpose,
 *                                               dependencies: { <id>: <version> }, unresolved: [{ spec, path }],
 *                                               npm: [names], builtBy: {...}, contracts, prompts, createdAt }
 *
 *   id       <project>.<dotted path, no extension>  — loom's idFor rule with the project in place of "nexus"
 *   version  1.0.<n>; the same bytes again add a reuse key to the existing version, never a new one
 *
 * Reuse is exact (C-D6): a CONTRACT (file path + layer + purpose — what the chunk is asked to build) or a PROMPT
 * digest names a stored version, and that version's bytes are returned. Near matches are found with find(), by a
 * model through loom.find.tool kind "stored" — never pushed into a prompt.
 *
 * One writer (the idearium process). Every write is tmp + rename, so a reader never sees half a file.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { builtinModules } = require('module');

const ROOT = path.resolve(__dirname, '..');
const BUILTINS = new Set(builtinModules.flatMap(m => [m, `node:${m}`]));
const CODE_EXT = /\.(?:[cm]?js|jsx|ts|tsx)$/;

function storeDir() {
  require('./test-sandbox.js').ensure();
  return process.env.NEXUS_COMPONENTS_DIR ? path.resolve(process.env.NEXUS_COMPONENTS_DIR) : path.join(ROOT, 'components');
}
const _sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const _slug = (s) => String(s || 'project').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'project';
const _norm = (p) => String(p || '').replace(/\\/g, '/').replace(/^\.?\/+/, '');

function _writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

/** idFor(project, relPath) — <project>.<dotted path>; extension and a trailing /index dropped (loom's rule). */
function idFor(project, rel) {
  let p = _norm(rel).replace(/\.[A-Za-z0-9]+$/, '').replace(/\/index$/, '');
  const dotted = p.split('/').filter(Boolean).map(s => s.replace(/[^A-Za-z0-9_-]+/g, '-')).join('.');
  return `${_slug(project)}.${dotted || 'root'}`;
}

/** contractDigest({ path, layer, purpose }) — what a file chunk is asked to build, as one key. */
function contractDigest({ path: p, layer = '', purpose = '' } = {}) {
  const clean = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  return _sha(`${_norm(p)}|${clean(layer)}|${clean(purpose)}`).slice(0, 32);
}
const promptDigest = (prompt) => _sha(prompt).slice(0, 32);

// ── index ─────────────────────────────────────────────────────────────────────────────────────────────
let _idx = null, _idxKey = null;
function _indexPath() { return path.join(storeDir(), 'index.json'); }
function loadIndex() {
  const p = _indexPath();
  let m = 0; try { m = fs.statSync(p).mtimeMs; } catch (_) {}
  const key = `${p}|${m}`;
  if (_idx && _idxKey === key) return _idx;
  let j = null; try { j = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) {}
  _idx = j && j.components ? j : { store: 'nexus.components', version: 1, components: {}, byContract: {}, byPrompt: {} };
  _idxKey = key;
  return _idx;
}
function _saveIndex(idx) {
  idx.updatedAt = Date.now();
  _writeAtomic(_indexPath(), JSON.stringify(idx, null, 1) + '\n');
  _idx = idx; _idxKey = null;
}

// ── dependencies ──────────────────────────────────────────────────────────────────────────────────────
/** specsOf(src) — every module a file asks for: require(), import … from, import(), export … from. */
function specsOf(src) {
  const out = new Set();
  const s = String(src).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const rx = [/\brequire\(\s*['"]([^'"]+)['"]\s*\)/g, /\bimport\s+(?:[^'"()]*?\s+from\s+)?['"]([^'"]+)['"]/g,
              /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g, /\bexport\s+[^'"]*?\s+from\s+['"]([^'"]+)['"]/g];
  for (const r of rx) { let m; while ((m = r.exec(s))) out.add(m[1]); }
  return [...out];
}
function _npmName(spec) { return spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]; }

/** the ids a relative spec could be, most likely first (a.js / a/index.js both → the same idFor). */
function _candidates(project, fromPath, spec) {
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(_norm(fromPath)), spec));
  if (base.startsWith('..')) return [];
  return [...new Set([idFor(project, base), idFor(project, `${base}/index`)])];
}

function _depsOf(idx, project, relPath, content) {
  const dependencies = {}, unresolved = [], npm = new Set();
  if (!CODE_EXT.test(relPath)) return { dependencies, unresolved, npm: [] };
  for (const spec of specsOf(content)) {
    if (spec.startsWith('.') || spec.startsWith('/')) {
      const hit = _candidates(project, relPath, spec).find(id => idx.components[id]);
      if (hit) dependencies[hit] = idx.components[hit].latest;
      else unresolved.push({ spec, path: path.posix.normalize(path.posix.join(path.posix.dirname(_norm(relPath)), spec)) });
    } else if (!BUILTINS.has(spec) && !BUILTINS.has(spec.split('/')[0])) npm.add(_npmName(spec));
  }
  return { dependencies, unresolved, npm: [...npm].sort() };
}

function _manifestPath(id, version) { return path.join(storeDir(), id, version, 'component.json'); }
function manifest(id, version = null) {
  const c = loadIndex().components[id];
  if (!c) return null;
  const v = version || c.latest;
  try { return JSON.parse(fs.readFileSync(_manifestPath(id, v), 'utf8')); } catch (_) { return null; }
}

/**
 * _pinPending(idx, project) — a component stored before the file it requires: pin the dependency the moment it
 * lands (CI2). Returns how many manifests were rewritten.
 */
function _pinPending(idx, project) {
  let n = 0;
  for (const [id, c] of Object.entries(idx.components)) {
    if (c.project !== _slug(project)) continue;
    for (const v of Object.keys(c.versions)) {
      const m = manifest(id, v);
      if (!m || !m.unresolved || !m.unresolved.length) continue;
      const still = [];
      for (const u of m.unresolved) {
        const hit = _candidates(project, m.path, u.spec).find(x => idx.components[x]);
        if (hit) m.dependencies[hit] = idx.components[hit].latest; else still.push(u);
      }
      if (still.length === m.unresolved.length) continue;
      m.unresolved = still;
      _writeAtomic(_manifestPath(id, v), JSON.stringify(m, null, 2) + '\n');
      c.versions[v].unresolved = still.length;
      n++;
    }
  }
  return n;
}

function _purposeOf(src) {
  const head = String(src).slice(0, 1600);
  const block = /\/\*\*?([\s\S]*?)\*\//.exec(head);
  const lines = (block ? block[1] : (head.match(/^\s*(?:\/\/|#).*$/gm) || []).join('\n'))
    .split('\n').map(l => l.replace(/^\s*\*?\s?|^\s*(?:\/\/|#)\s?/, '').trim()).filter(l => l && !/^[-═─=*]+$/.test(l));
  return lines.slice(0, 2).join(' ').slice(0, 240) || null;
}

// ── put ───────────────────────────────────────────────────────────────────────────────────────────────
/**
 * put({ project, path, content, contract, prompt, builtBy }) → { id, version, created, dir, dependencies, unresolved }
 *   contract  { path, layer, purpose } (or a precomputed contractDigest string) — the reuse key a later build asks by
 *   prompt    the prompt text (or promptDigest) — the WARP exact-cache key
 */
function put({ project, path: relPath, content, contract = null, prompt = null, promptKey = null, builtBy = {} } = {}) {
  if (!project) throw new Error('component-store.put: project is required');
  if (!relPath) throw new Error('component-store.put: path is required');
  if (typeof content !== 'string' || !content.length) throw new Error('component-store.put: content is required');
  const idx = loadIndex();
  const id = idFor(project, relPath);
  const sha = _sha(content);
  const cKey = contract ? (typeof contract === 'string' ? contract : contractDigest(contract)) : null;
  const pKey = promptKey || (prompt ? promptDigest(prompt) : null);
  const c = idx.components[id] || (idx.components[id] = { id, project: _slug(project), path: _norm(relPath), latest: null, versions: {} });

  let version = Object.keys(c.versions).find(v => c.versions[v].sha256 === sha) || null;
  const created = !version;
  if (created) {
    const n = Object.keys(c.versions).length;
    version = `1.0.${n}`;
    const dir = path.join(storeDir(), id, version);
    const fileName = path.posix.basename(_norm(relPath));
    _writeAtomic(path.join(dir, fileName), content);
    const deps = _depsOf(idx, project, relPath, content);
    const m = {
      id, namespace: _slug(project), name: id.slice(_slug(project).length + 1), version,
      path: _norm(relPath), file: fileName, sha256: sha, bytes: Buffer.byteLength(content), lang: path.extname(fileName).slice(1) || 'txt',
      purpose: (contract && contract.purpose) || _purposeOf(content),
      dependencies: deps.dependencies, unresolved: deps.unresolved, npm: deps.npm,
      builtBy, contracts: [], prompts: [], createdAt: new Date().toISOString(),
    };
    c.versions[version] = { sha256: sha, file: fileName, deps: Object.keys(m.dependencies).length, unresolved: m.unresolved.length, createdAt: m.createdAt };
    c.latest = version;
    _writeAtomic(_manifestPath(id, version), JSON.stringify(m, null, 2) + '\n');
  }
  // reuse keys: on the index (lookup) and the manifest (so the folder says why it is reused)
  const m = manifest(id, version);
  let touched = false;
  if (cKey && !m.contracts.includes(cKey)) { m.contracts.push(cKey); touched = true; }
  if (pKey && !m.prompts.includes(pKey)) { m.prompts.push(pKey); touched = true; }
  if (touched) _writeAtomic(_manifestPath(id, version), JSON.stringify(m, null, 2) + '\n');
  if (cKey) idx.byContract[cKey] = [id, version];
  if (pKey) idx.byPrompt[pKey] = [id, version];
  const pinned = created ? _pinPending(idx, project) : 0;
  _saveIndex(idx);
  const fresh = manifest(id, version);
  return { id, version, created, dir: path.join(storeDir(), id, version), dependencies: fresh.dependencies, unresolved: fresh.unresolved, npm: fresh.npm, pinned };
}

// ── get ───────────────────────────────────────────────────────────────────────────────────────────────
/** get(id, version?) → { id, version, content, manifest } | null.  Also takes "id@version". */
function get(ref, version = null) {
  let id = String(ref || '').replace(/^store:/, '');
  if (!version && id.includes('@')) [id, version] = id.split('@');
  const m = manifest(id, version);
  if (!m) return null;
  let content; try { content = fs.readFileSync(path.join(storeDir(), id, m.version, m.file), 'utf8'); } catch (_) { return null; }
  if (_sha(content) !== m.sha256) return null;            // a hand-edited file is not the stored component
  return { id, version: m.version, content, manifest: m };
}
function _byKey(table, key) {
  const hit = key && loadIndex()[table][key];
  const got = hit ? get(hit[0], hit[1]) : null;
  return got && got.manifest && got.manifest.failedVerification ? null : got;   // §0.39.291 — a version that failed verification is never reused
}

/**
 * markFailed({ project, path, content, reason }) — §0.39.291 PV2. The stored version with exactly this content failed
 * verification: it stays on disk (§0.3) with the reason on its manifest, and every reuse key that points at it is
 * dropped, so no later build — of this project or another — is handed the broken file again.
 * -> { marked: boolean, id, version, keysDropped }
 */
function markFailed({ project, path: relPath, content, reason = 'failed verification' } = {}) {
  if (!project || !relPath || typeof content !== 'string') return { marked: false, error: 'project, path and content are required' };
  const idx = loadIndex();
  const id = idFor(project, relPath);
  const c = idx.components[id];
  if (!c) return { marked: false, id, reason: 'not in the store' };
  const sha = _sha(content);
  const version = Object.keys(c.versions).find(v => c.versions[v].sha256 === sha);
  if (!version) return { marked: false, id, reason: 'this content is not a stored version' };
  const m = manifest(id, version);
  m.failedVerification = { reason: String(reason).slice(0, 2000), at: new Date().toISOString() };
  _writeAtomic(_manifestPath(id, version), JSON.stringify(m, null, 2) + '\n');
  let keysDropped = 0;
  for (const table of ['byContract', 'byPrompt']) {
    for (const [k, v] of Object.entries(idx[table] || {})) if (v && v[0] === id && v[1] === version) { delete idx[table][k]; keysDropped++; }
  }
  c.versions[version].failedVerification = true;
  _saveIndex(idx);
  return { marked: true, id, version, keysDropped };
}
const byContract = (contract) => _byKey('byContract', typeof contract === 'string' ? contract : contractDigest(contract));
const byPrompt = (prompt, { digest = null } = {}) => _byKey('byPrompt', digest || promptDigest(prompt));

/** find(query, { limit }) — stored components by id, path or purpose (for loom.find.tool kind "stored"). */
function find(query, { limit = 8 } = {}) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  const words = q.split(/[\s/._:-]+/).filter(w => w.length > 1);
  const out = [];
  for (const c of Object.values(loadIndex().components)) {
    const m = manifest(c.id) || {};
    const hay = `${c.id} ${c.path} ${m.purpose || ''}`.toLowerCase();
    const sc = hay.includes(q) ? 40 : (words.length && words.every(w => hay.includes(w)) ? 20 : (words.filter(w => hay.includes(w)).length >= Math.max(2, Math.ceil(words.length / 2)) ? 8 : 0));
    if (!sc) continue;
    out.push({ kind: 'stored', id: `store:${c.id}@${c.latest}`, file: c.path, why: `${Object.keys(c.versions).length} version(s) · ${Object.keys(m.dependencies || {}).length} dep(s)${m.purpose ? ' — ' + m.purpose.slice(0, 120) : ''}`, score: sc });
  }
  out.sort((a, b) => b.score - a.score || a.id.length - b.id.length);
  return out.slice(0, limit).map(({ score, ...r }) => r);
}

/** list() → [{ id, project, path, latest, versions }] */
function list() { return Object.values(loadIndex().components).map(c => ({ id: c.id, project: c.project, path: c.path, latest: c.latest, versions: Object.keys(c.versions) })); }

/** closure(id, version?) → every component this one needs, pinned, depth-first (for materialising it elsewhere). */
function closure(id, version = null, seen = new Map()) {
  const m = manifest(id, version);
  if (!m || seen.has(m.id)) return [...seen.values()];
  seen.set(m.id, { id: m.id, version: m.version, path: m.path });
  for (const [d, v] of Object.entries(m.dependencies || {})) closure(d, v, seen);
  return [...seen.values()];
}

/**
 * invalidate(ref) — a stored version found wrong stops being reused: every reuse key that names it is dropped.
 * The folder stays (other components may pin it); a build asks the model again next time. Returns keys dropped.
 */
function invalidate(ref) {
  const g = get(ref);
  if (!g) return 0;
  const idx = loadIndex();
  let n = 0;
  for (const table of ['byContract', 'byPrompt']) for (const [k, v] of Object.entries(idx[table])) if (v[0] === g.id && v[1] === g.version) { delete idx[table][k]; n++; }
  if (n) _saveIndex(idx);
  return n;
}

function stats() {
  const idx = loadIndex();
  const comps = Object.values(idx.components);
  return { dir: storeDir(), components: comps.length, versions: comps.reduce((s, c) => s + Object.keys(c.versions).length, 0),
           contracts: Object.keys(idx.byContract).length, prompts: Object.keys(idx.byPrompt).length };
}

module.exports = {
  markFailed, storeDir, idFor, contractDigest, promptDigest, specsOf, put, get, byContract, byPrompt, find, list, closure, invalidate, manifest, loadIndex, stats };
