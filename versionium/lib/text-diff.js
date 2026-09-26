'use strict';
/**
 * versionium/lib/text-diff.js — unified diff and a strict applier, for the
 * per-file layer (MCO-B, versionium/spec/versionium.file-versioning.spec).
 * UUID: nexus-versionium-text-diff-v1-0000-2026-0920-jamesbrooks-001
 *
 * §THE DIFF IS NOT TRUSTED. This file is written to be correct, and
 * files.js still never stores a delta without applying it back to the base
 * and comparing sha256 with the new content; a mismatch stores a full
 * snapshot instead. The property "apply(a, diff(a, b)) === b, byte for byte"
 * is what restore depends on, so it is fuzzed hard in
 * tests/modules/test-mcob-file-versioning.js (random edits, CRLF, empty
 * files, no trailing newline, duplicate lines, EOL toggling).
 *
 * §EXACTNESS. Lines split on '\n' only, so a '\r' stays inside its line and
 * CRLF survives. End-of-file newline is part of the last line's identity
 * (standard "\ No newline at end of file" marker), so adding or removing a
 * final newline is a real change, not lost.
 *
 * §TEXT ONLY. Callers must not diff binary. isDiffable() is the gate: valid
 * UTF-8 that round-trips exactly, and no NUL byte.
 *
 * §BOUNDED. The middle of the file (after trimming the common prefix and
 * suffix) is diffed by LCS in O(n*m) cells; over MAX_LCS_CELLS it is emitted
 * as one replace hunk. Still correct, just less compact.
 */

const CONTEXT = 3;
const MAX_LCS_CELLS = parseInt(process.env.VERSIONIUM_DIFF_MAX_CELLS || '2000000', 10);
const NOEOL = '\u0000NOEOL'; // sentinel appended to a last line that has no trailing newline

function isDiffable(buf) {
  if (!Buffer.isBuffer(buf)) return false;
  if (buf.includes(0)) return false;
  const s = buf.toString('utf8');
  return Buffer.from(s, 'utf8').equals(buf);
}

function tokens(s) {
  if (s === '') return [];
  const parts = s.split('\n');
  if (parts[parts.length - 1] === '') { parts.pop(); return parts; }
  parts[parts.length - 1] += NOEOL;
  return parts;
}

function fromTokens(toks) {
  if (toks.length === 0) return '';
  const last = toks[toks.length - 1];
  const noeol = last.endsWith(NOEOL);
  const lines = noeol ? [...toks.slice(0, -1), last.slice(0, -NOEOL.length)] : toks;
  return lines.join('\n') + (noeol ? '' : '\n');
}

// Edit script over tokens: [{t:' '|'-'|'+', v}]
function editScript(a, b) {
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let s = 0;
  while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
  const am = a.slice(p, a.length - s), bm = b.slice(p, b.length - s);
  const ops = [];
  for (let i = 0; i < p; i++) ops.push({ t: ' ', v: a[i] });

  if (am.length === 0) for (const v of bm) ops.push({ t: '+', v });
  else if (bm.length === 0) for (const v of am) ops.push({ t: '-', v });
  else if (am.length * bm.length > MAX_LCS_CELLS) {
    for (const v of am) ops.push({ t: '-', v });
    for (const v of bm) ops.push({ t: '+', v });
  } else {
    const n = am.length, m = bm.length;
    // lcs[i][j] = LCS length of am[i..] and bm[j..]
    const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        lcs[i][j] = am[i] === bm[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
      }
    }
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (am[i] === bm[j]) { ops.push({ t: ' ', v: am[i] }); i++; j++; }
      else if (lcs[i + 1][j] >= lcs[i][j + 1]) { ops.push({ t: '-', v: am[i] }); i++; }
      else { ops.push({ t: '+', v: bm[j] }); j++; }
    }
    while (i < n) ops.push({ t: '-', v: am[i++] });
    while (j < m) ops.push({ t: '+', v: bm[j++] });
  }
  for (let k = a.length - s; k < a.length; k++) ops.push({ t: ' ', v: a[k] });
  return ops;
}

function emitLine(prefix, tok) {
  return tok.endsWith(NOEOL)
    ? `${prefix}${tok.slice(0, -NOEOL.length)}\n\\ No newline at end of file\n`
    : `${prefix}${tok}\n`;
}

/** diff(oldStr, newStr) -> unified-diff hunks as text ('' when identical). */
function diff(oldStr, newStr) {
  if (oldStr === newStr) return '';
  const ops = editScript(tokens(oldStr), tokens(newStr));

  // positions of each op in old/new (1-based line numbers of the NEXT line)
  const changeIdx = [];
  ops.forEach((o, i) => { if (o.t !== ' ') changeIdx.push(i); });
  if (changeIdx.length === 0) return '';

  // group changes whose gap is <= 2*CONTEXT ' ' ops
  const groups = [];
  let cur = [changeIdx[0], changeIdx[0]];
  for (let k = 1; k < changeIdx.length; k++) {
    if (changeIdx[k] - cur[1] - 1 <= 2 * CONTEXT) cur[1] = changeIdx[k];
    else { groups.push(cur); cur = [changeIdx[k], changeIdx[k]]; }
  }
  groups.push(cur);

  // running old/new line counters at each op index
  const oldBefore = new Array(ops.length + 1), newBefore = new Array(ops.length + 1);
  let oc = 0, nc = 0;
  for (let i = 0; i < ops.length; i++) {
    oldBefore[i] = oc; newBefore[i] = nc;
    if (ops[i].t !== '+') oc++;
    if (ops[i].t !== '-') nc++;
  }
  oldBefore[ops.length] = oc; newBefore[ops.length] = nc;

  let out = '';
  for (const [first, last] of groups) {
    const from = Math.max(0, first - CONTEXT);
    const to = Math.min(ops.length - 1, last + CONTEXT);
    let oldCount = 0, newCount = 0, body = '';
    for (let i = from; i <= to; i++) {
      const o = ops[i];
      if (o.t !== '+') oldCount++;
      if (o.t !== '-') newCount++;
      body += emitLine(o.t, o.v);
    }
    // unified convention: an empty side starts at the line BEFORE the hunk
    const oldStart = oldCount === 0 ? oldBefore[from] : oldBefore[from] + 1;
    const newStart = newCount === 0 ? newBefore[from] : newBefore[from] + 1;
    out += `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@\n${body}`;
  }
  return out;
}

class PatchError extends Error {}

/** apply(oldStr, diffText) -> newStr. Throws PatchError on ANY mismatch. */
function apply(oldStr, diffText) {
  if (diffText === '') return oldStr;
  const src = tokens(oldStr);
  const lines = diffText.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();

  const out = [];
  let pos = 0; // index into src of the next unconsumed line
  let i = 0;
  while (i < lines.length) {
    const m = /^@@ -(\d+),(\d+) \+(\d+),(\d+) @@$/.exec(lines[i]);
    if (!m) throw new PatchError(`expected a hunk header at diff line ${i + 1}: ${JSON.stringify(lines[i])}`);
    const oldStart = parseInt(m[1], 10), oldCount = parseInt(m[2], 10), newCount = parseInt(m[4], 10);
    const startIdx = oldCount === 0 ? oldStart : oldStart - 1;
    if (startIdx < pos) throw new PatchError(`hunk at ${oldStart} overlaps the previous hunk`);
    if (startIdx > src.length) throw new PatchError(`hunk at ${oldStart} is past the end of the file (${src.length} lines)`);
    while (pos < startIdx) out.push(src[pos++]);
    i++;

    let seenOld = 0, seenNew = 0;
    while (i < lines.length && !lines[i].startsWith('@@ ')) {
      const l = lines[i];
      const prefix = l[0], text = l.slice(1);
      if (prefix === '\\') throw new PatchError(`stray "no newline" marker at diff line ${i + 1}`);
      if (prefix !== ' ' && prefix !== '-' && prefix !== '+') throw new PatchError(`bad diff line ${i + 1}: ${JSON.stringify(l)}`);
      const noeol = i + 1 < lines.length && lines[i + 1].startsWith('\\ No newline');
      const tok = noeol ? text + NOEOL : text;
      i += noeol ? 2 : 1;
      if (prefix === ' ' || prefix === '-') {
        if (pos >= src.length) throw new PatchError(`hunk expects line ${pos + 1} but the file has ${src.length}`);
        if (src[pos] !== tok) throw new PatchError(`line ${pos + 1} does not match the diff's ${prefix === '-' ? 'removed' : 'context'} line`);
        pos++; seenOld++;
      }
      if (prefix === ' ' || prefix === '+') { out.push(tok); seenNew++; }
    }
    if (seenOld !== oldCount || seenNew !== newCount) {
      throw new PatchError(`hunk counts disagree with its body (old ${seenOld}/${oldCount}, new ${seenNew}/${newCount})`);
    }
  }
  while (pos < src.length) out.push(src[pos++]);
  return fromTokens(out);
}

module.exports = { diff, apply, isDiffable, PatchError, CONTEXT, MAX_LCS_CELLS };
