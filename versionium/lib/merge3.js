'use strict';
/**
 * versionium/lib/merge3.js — a line-based three-way merge. FR3 (docs/2026-10-16-repo-carve-phasemap.spec): undo any change,
 * keeping every later edit.
 * Product: flight-recorder   (part of products/flight-recorder; the branch tool carries every file tagged so)
 *
 * James, 2026-10-17: "Next and Merge." (FR3 was next). Nexus had no three-way merge (searched: three-way, merge3, diff3), and
 * lib/repo-inject.js revert() refused once a file changed after the change it undoes: only the newest change could be undone.
 *
 * merge3(base, ours, theirs) → { ok: true, text, changed } | { ok: false, conflicts: [{ base, ours, theirs, at }], text: null }
 *   base    the common ancestor              (to undo a change: what the change wrote)
 *   ours    one side                          (the file now, with every later edit)
 *   theirs  the other side                    (what was there before the change)
 * A region only one side changed takes that side; a region both changed the same way takes it once; a region both changed
 * differently is a conflict — returned with its lines, never resolved by guessing (§1.2).
 *
 * Lines keep their endings ('\n' split, joined back), so a file merges back byte for byte. Alignment is the longest common
 * subsequence on lines, under versionium's own size limit (text-diff MAX_LCS_CELLS): past it, the merge refuses, said.
 */
const VERSION = '1.0.0';
const { MAX_LCS_CELLS } = require('./text-diff.js');

function _lcsPairs(a, b) {
  const n = a.length, m = b.length;
  if ((n + 1) * (m + 1) > MAX_LCS_CELLS) return null;
  // trim the common head and tail first: most undos touch a few lines of a long file
  let lo = 0; while (lo < n && lo < m && a[lo] === b[lo]) lo++;
  let hiA = n, hiB = m; while (hiA > lo && hiB > lo && a[hiA - 1] === b[hiB - 1]) { hiA--; hiB--; }
  const A = a.slice(lo, hiA), B = b.slice(lo, hiB), N = A.length, M = B.length;
  const dp = Array.from({ length: N + 1 }, () => new Uint32Array(M + 1));
  for (let i = N - 1; i >= 0; i--) for (let j = M - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const pairs = [];
  for (let i = 0; i < lo; i++) pairs.push([i, i]);
  let i = 0, j = 0;
  while (i < N && j < M) { if (A[i] === B[j]) { pairs.push([lo + i, lo + j]); i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++; }
  for (let k = 0; k < n - hiA; k++) pairs.push([hiA + k, hiB + k]);
  return pairs;
}

const _same = (x, y) => x.length === y.length && x.every((v, k) => v === y[k]);

function merge3(base, ours, theirs) {
  const B = String(base == null ? '' : base).split('\n'), O = String(ours == null ? '' : ours).split('\n'), T = String(theirs == null ? '' : theirs).split('\n');
  const po = _lcsPairs(B, O), pt = _lcsPairs(B, T);
  if (!po || !pt) return { ok: false, tooLarge: true, conflicts: [], text: null, error: `too large to merge line by line (over ${MAX_LCS_CELLS} cells)` };
  const mo = new Map(po), mt = new Map(pt);
  // stable lines: base lines both sides kept, in order (each map is monotone, so the stable list is monotone in all three)
  const stable = [];
  for (let b = 0; b < B.length; b++) if (mo.has(b) && mt.has(b)) { const s = [b, mo.get(b), mt.get(b)]; const p = stable[stable.length - 1]; if (!p || (s[1] > p[1] && s[2] > p[2])) stable.push(s); }
  stable.push([B.length, O.length, T.length]);   // sentinel: the end of all three
  const out = [], conflicts = [];
  let b0 = 0, o0 = 0, t0 = 0, changed = false;
  for (const [b1, o1, t1] of stable) {
    const cb = B.slice(b0, b1), co = O.slice(o0, o1), ct = T.slice(t0, t1);
    if (_same(co, cb)) { out.push(...ct); if (!_same(ct, cb)) changed = true; }      // only theirs changed this region
    else if (_same(ct, cb)) out.push(...co);                                           // only ours changed it
    else if (_same(co, ct)) out.push(...co);                                           // both changed it the same way
    else { conflicts.push({ at: out.length + 1, base: cb.join('\n'), ours: co.join('\n'), theirs: ct.join('\n') }); out.push(...co); }
    if (b1 < B.length) out.push(B[b1]);
    b0 = b1 + 1; o0 = o1 + 1; t0 = t1 + 1;
  }
  if (conflicts.length) return { ok: false, conflicts, text: null };
  return { ok: true, text: out.join('\n'), changed };
}

module.exports = { VERSION, merge3 };
