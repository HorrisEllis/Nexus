'use strict';
/**
 * cos/playground/branch.js  -  Compartment Branch Engine
 * UUID: cos-branch-v1-0000-4000-0000-000000000001
 * Status: pre-release
 *
 * A Branch is a sovereign copy of a compartment's filesystem, isolated from
 * the parent and from every other branch. It lives inside the compartment's
 * .nex/branches/{branchId}/ directory.
 *
 * Branches are used for:
 *   - Experimenting on a repo without touching the working tree
 *   - Running the same code at two different iterations side-by-side
 *   - Producing a diff between any two branch snapshots
 *
 * Architecture:
 *   BranchEngine.fork(compartment, label?)
 *     -> copies compartment.fs.root into .nex/branches/{branchId}/
 *     -> writes branch manifest: { id, label, parentId, forkedAt, snapshotHash }
 *     -> returns Branch
 *
 *   BranchEngine.list(compartment)
 *     -> reads .nex/branches/{id}/manifest.json
 *     -> returns BranchMeta[]
 *
 *   BranchEngine.diff(compartment, branchA, branchB)
 *     -> file-level diff: added / removed / modified / unchanged
 *     -> content-level diff for text files (unified diff)
 *     -> returns DiffReport
 *
 *   BranchEngine.checkout(compartment, branchId)
 *     -> copies branch root back into compartment.fs.root (destructive)
 *     -> writes checkout record to manifest
 *
 *   BranchEngine.destroy(compartment, branchId)
 *     -> removes .nex/branches/{branchId}/
 *
 * COS-1: Nothing silently fails.
 * COS-4: Branches never share memory  -  only file content.
 * COS-11: Branch roots are readonly mounts by default.
 */

'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const { compartmentPaths } = require('../foundation/constants.js');
const { CosAxiomError }    = require('../foundation/axioms.js');

// ── Hash helpers ─────────────────────────────────────────────────────────────

function hashFile(p) {
  try { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }
  catch { return null; }
}

function hashDir(root) {
  // Canonical hash of a directory tree (sorted paths + content hashes)
  const entries = [];
  walkSync(root, root, f => entries.push(`${f.rel}:${f.hash}`));
  entries.sort();
  return crypto.createHash('sha256').update(entries.join('\n')).digest('hex').slice(0, 16);
}

// ── Directory walking ─────────────────────────────────────────────────────────

const WALK_EXCLUDES = new Set(['.nex', '.cos-wal', 'node_modules', '.git', '__pycache__',
  '.venv', 'venv', 'dist', '.next', 'coverage', '.DS_Store']);

function walkSync(root, dir, cb) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return; }

  for (const entry of entries) {
    if (WALK_EXCLUDES.has(entry.name)) continue;
    const abs = path.join(dir, entry.name);
    const rel = path.relative(root, abs);
    if (entry.isDirectory()) {
      walkSync(root, abs, cb);
    } else if (entry.isFile()) {
      cb({ abs, rel, hash: hashFile(abs) });
    }
  }
}

// ── Copy tree ─────────────────────────────────────────────────────────────────

function copyTree(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  walkSync(src, src, ({ abs, rel }) => {
    const target = path.join(dst, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(abs, target);
  });
}

// ── Branch paths ─────────────────────────────────────────────────────────────

function branchDir(compartmentId, branchId) {
  const { nexDir } = compartmentPaths(compartmentId);
  return path.join(nexDir, 'branches', branchId);
}

function branchManifestPath(compartmentId, branchId) {
  return path.join(branchDir(compartmentId, branchId), '_branch.json');
}

// ── BranchEngine ─────────────────────────────────────────────────────────────

class BranchEngine {
  /**
   * Fork a branch from the compartment's current working tree.
   * @param {object} compartment
   * @param {object} opts
   * @param {string} [opts.label]     -  human name for this branch
   * @param {string} [opts.fromBranchId]  -  fork from an existing branch instead of working tree
   * @returns {{ id, label, root, manifest }}
   */
  static fork(compartment, opts = {}) {
    const { id: compartmentId } = compartment;
    if (!compartmentId) throw new CosAxiomError('COS-1', 'branch.fork: compartment.id required', {});

    const srcRoot = opts.fromBranchId
      ? path.join(branchDir(compartmentId, opts.fromBranchId), 'root')
      : (compartment.fs?.root || '');

    if (!srcRoot || !fs.existsSync(srcRoot)) {
      throw new CosAxiomError('COS-1', `branch.fork: source root not found: ${srcRoot}`, { compartmentId });
    }

    const branchId  = `br-${crypto.randomUUID().slice(0, 8)}`;
    const brRoot    = path.join(branchDir(compartmentId, branchId), 'root');

    fs.mkdirSync(brRoot, { recursive: true });
    copyTree(srcRoot, brRoot);

    const manifest = {
      id:           branchId,
      compartmentId,
      label:        opts.label || branchId,
      forkedFrom:   opts.fromBranchId || 'working-tree',
      forkedAt:     Date.now(),
      snapshotHash: hashDir(brRoot),
      checkouts:    [],
      runs:         [],
    };

    fs.writeFileSync(
      branchManifestPath(compartmentId, branchId),
      JSON.stringify(manifest, null, 2)
    );

    return { id: branchId, label: manifest.label, root: brRoot, manifest };
  }

  /**
   * List all branches for a compartment.
   * @param {object} compartment
   * @returns {object[]} array of branch manifests
   */
  static list(compartment) {
    const { nexDir } = compartmentPaths(compartment.id);
    const branchesDir = path.join(nexDir, 'branches');
    if (!fs.existsSync(branchesDir)) return [];

    const branches = [];
    for (const entry of fs.readdirSync(branchesDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const mPath = path.join(branchesDir, entry.name, '_branch.json');
      if (!fs.existsSync(mPath)) continue;
      try {
        const m = JSON.parse(fs.readFileSync(mPath, 'utf8'));
        const brRoot = path.join(branchesDir, entry.name, 'root');
        // Recompute current hash (may have changed if branch was mutated)
        m.currentHash = fs.existsSync(brRoot) ? hashDir(brRoot) : null;
        m.dirty = m.currentHash !== m.snapshotHash;
        branches.push(m);
      } catch { /* skip corrupt manifest */ }
    }

    return branches.sort((a, b) => b.forkedAt - a.forkedAt);
  }

  /**
   * Get a single branch manifest.
   */
  static get(compartment, branchId) {
    const mPath = branchManifestPath(compartment.id, branchId);
    if (!fs.existsSync(mPath)) return null;
    try { return JSON.parse(fs.readFileSync(mPath, 'utf8')); }
    catch { return null; }
  }

  /**
   * Diff two branches (or one branch vs working tree).
   * @param {object} compartment
   * @param {string} branchA   -  branch id, or 'working-tree'
   * @param {string} branchB   -  branch id, or 'working-tree'
   * @returns {DiffReport}
   */
  static diff(compartment, branchA, branchB) {
    const rootA = branchA === 'working-tree'
      ? compartment.fs?.root
      : path.join(branchDir(compartment.id, branchA), 'root');
    const rootB = branchB === 'working-tree'
      ? compartment.fs?.root
      : path.join(branchDir(compartment.id, branchB), 'root');

    if (!rootA || !fs.existsSync(rootA)) {
      throw new CosAxiomError('COS-1', `diff: rootA not found: ${rootA}`, {});
    }
    if (!rootB || !fs.existsSync(rootB)) {
      throw new CosAxiomError('COS-1', `diff: rootB not found: ${rootB}`, {});
    }

    // Build file maps: rel -> hash
    const mapA = {}; walkSync(rootA, rootA, f => { mapA[f.rel] = f.hash; });
    const mapB = {}; walkSync(rootB, rootB, f => { mapB[f.rel] = f.hash; });

    const allFiles = new Set([...Object.keys(mapA), ...Object.keys(mapB)]);
    const added    = [];
    const removed  = [];
    const modified = [];
    const unchanged = [];
    const fileDiffs = {};

    for (const rel of [...allFiles].sort()) {
      const inA = mapA[rel] !== undefined;
      const inB = mapB[rel] !== undefined;

      if (!inA)                        { added.push(rel); }
      else if (!inB)                   { removed.push(rel); }
      else if (mapA[rel] !== mapB[rel]) {
        modified.push(rel);
        // Compute inline diff for text files < 512KB
        const absA = path.join(rootA, rel);
        const absB = path.join(rootB, rel);
        try {
          const sA = fs.statSync(absA).size;
          const sB = fs.statSync(absB).size;
          if (sA < 512_000 && sB < 512_000) {
            fileDiffs[rel] = _unifiedDiff(
              fs.readFileSync(absA, 'utf8'),
              fs.readFileSync(absB, 'utf8'),
              rel
            );
          }
        } catch { /* binary or unreadable  -  skip content diff */ }
      } else {
        unchanged.push(rel);
      }
    }

    return {
      branchA, branchB,
      rootA, rootB,
      summary: {
        added:     added.length,
        removed:   removed.length,
        modified:  modified.length,
        unchanged: unchanged.length,
        total:     allFiles.size,
      },
      added, removed, modified, unchanged,
      fileDiffs,
      diffedAt: Date.now(),
    };
  }

  /**
   * Apply a branch root back to the compartment working tree.
   * Destructive  -  overwrites working tree.
   * @param {object} compartment
   * @param {string} branchId
   */
  static checkout(compartment, branchId) {
    const brRoot  = path.join(branchDir(compartment.id, branchId), 'root');
    const wkRoot  = compartment.fs?.root;

    if (!brRoot || !fs.existsSync(brRoot)) {
      throw new CosAxiomError('COS-1', `checkout: branch root not found: ${brRoot}`, { branchId });
    }
    if (!wkRoot || !fs.existsSync(wkRoot)) {
      throw new CosAxiomError('COS-1', `checkout: working tree not found: ${wkRoot}`, {});
    }

    copyTree(brRoot, wkRoot);

    // Update manifest
    const mPath = branchManifestPath(compartment.id, branchId);
    if (fs.existsSync(mPath)) {
      try {
        const m = JSON.parse(fs.readFileSync(mPath, 'utf8'));
        m.checkouts.push({ at: Date.now() });
        fs.writeFileSync(mPath, JSON.stringify(m, null, 2));
      } catch { /* non-fatal */ }
    }

    return { ok: true, branchId, checkedOutAt: Date.now() };
  }

  /**
   * Record a test/run result against a branch.
   */
  static recordRun(compartment, branchId, runResult) {
    const mPath = branchManifestPath(compartment.id, branchId);
    if (!fs.existsSync(mPath)) return;
    try {
      const m = JSON.parse(fs.readFileSync(mPath, 'utf8'));
      m.runs = m.runs || [];
      m.runs.push({ ...runResult, recordedAt: Date.now() });
      if (m.runs.length > 50) m.runs = m.runs.slice(-50);
      fs.writeFileSync(mPath, JSON.stringify(m, null, 2));
    } catch { /* non-fatal */ }
  }

  /**
   * Destroy a branch  -  removes its directory entirely.
   */
  static destroy(compartment, branchId) {
    const dir = branchDir(compartment.id, branchId);
    if (!fs.existsSync(dir)) return { ok: false, reason: 'branch not found' };
    fs.rmSync(dir, { recursive: true, force: true });
    return { ok: true, branchId, destroyedAt: Date.now() };
  }

  /**
   * Compare run results across multiple branches.
   * Returns a comparison table: { branches[], metrics[], rows[] }
   */
  static compareRuns(compartment, branchIds) {
    const branches = branchIds.map(id => {
      const m = BranchEngine.get(compartment, id);
      return m ? { id, label: m.label, runs: m.runs || [] } : { id, label: id, runs: [] };
    });

    // Collect all metric keys seen across all runs
    const metricKeys = new Set();
    for (const br of branches) {
      for (const run of br.runs) {
        if (run.metrics) Object.keys(run.metrics).forEach(k => metricKeys.add(k));
      }
    }

    // Latest run per branch
    const rows = branches.map(br => {
      const latest = br.runs[br.runs.length - 1] || null;
      const metrics = {};
      for (const k of metricKeys) {
        metrics[k] = latest?.metrics?.[k] ?? null;
      }
      return {
        branchId:  br.id,
        label:     br.label,
        runCount:  br.runs.length,
        lastRunAt: latest?.recordedAt || null,
        passed:    latest?.passed ?? null,
        failed:    latest?.failed ?? null,
        metrics,
      };
    });

    return {
      branches: branchIds,
      metrics:  [...metricKeys],
      rows,
      comparedAt: Date.now(),
    };
  }
}

// ── Unified diff (minimal, no deps) ──────────────────────────────────────────

function _unifiedDiff(textA, textB, filename) {
  const linesA = textA.split('\n');
  const linesB = textB.split('\n');
  const hunks  = [];

  // Simple LCS-based diff
  const lcs    = _lcsLines(linesA, linesB);
  let ia = 0, ib = 0, li = 0;
  let hunk = null;

  const flush = () => { if (hunk) { hunks.push(hunk); hunk = null; } };

  while (ia < linesA.length || ib < linesB.length) {
    const lcsLine = lcs[li];
    const aEq = lcsLine && linesA[ia] === lcsLine;
    const bEq = lcsLine && linesB[ib] === lcsLine;

    if (aEq && bEq) {
      // Context line
      if (hunk && hunk.lines.length > 0) {
        hunk.lines.push({ type: 'context', text: linesA[ia], lineA: ia+1, lineB: ib+1 });
        if (hunk.lines.filter(l => l.type === 'context').length >= 3) flush();
      }
      ia++; ib++; li++;
    } else if (!bEq && ia < linesA.length) {
      if (!hunk) hunk = { startA: ia+1, startB: ib+1, lines: [] };
      hunk.lines.push({ type: 'removed', text: linesA[ia], lineA: ia+1 });
      ia++;
    } else if (!aEq && ib < linesB.length) {
      if (!hunk) hunk = { startA: ia+1, startB: ib+1, lines: [] };
      hunk.lines.push({ type: 'added', text: linesB[ib], lineB: ib+1 });
      ib++;
    } else {
      ia++; ib++;
    }
  }
  flush();

  return { filename, hunks, linesA: linesA.length, linesB: linesB.length };
}

function _lcsLines(a, b) {
  // Patience diff  -  reduce to unique lines first for perf on large files
  const aMap = new Map();
  a.forEach((l, i) => { if (!aMap.has(l)) aMap.set(l, []); aMap.get(l).push(i); });

  const unique = [];
  b.forEach((l, j) => {
    const aIdxs = aMap.get(l);
    if (aIdxs && aIdxs.length === 1) unique.push({ aIdx: aIdxs[0], bIdx: j, line: l });
  });

  // Sort by aIdx and extract LCS
  unique.sort((x, y) => x.aIdx - y.aIdx);
  const stacks = [];
  for (const u of unique) {
    let lo = 0, hi = stacks.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (stacks[mid][stacks[mid].length-1].bIdx < u.bIdx) lo = mid + 1;
      else hi = mid;
    }
    stacks[lo] = [...(stacks[lo-1] || []), u];
  }

  if (!stacks.length) return [];
  return stacks[stacks.length-1].map(u => u.line);
}

module.exports = { BranchEngine };
