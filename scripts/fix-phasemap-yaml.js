#!/usr/bin/env node
'use strict';
/**
 * scripts/fix-phasemap-yaml.js — make a phasemap machine-readable without changing a word of it (0.39.300 LV1).
 * Map: docs/2026-10-02-synthesis-zoom-versionium-phasemap.spec (LV1) — the synthesis's fill order put these first:
 * 30 of 73 phasemaps were not valid YAML, so every machine reader (the synthesis, loom's maps, any agent) skipped them.
 *
 * The usual break: a plain value that holds `: ` (James: "…") or runs onto continuation lines with one. The repair turns
 * that value into a folded block (`key: >-`, the text on the lines under it) — YAML reads the same words, joined the
 * same way. The file is re-parsed after each repair until it loads; a repair is refused unless the file's words are
 * exactly the same words as before (only `>-` added), so content can never change.
 *
 * Usage: node scripts/fix-phasemap-yaml.js [--check] [file …]     (no files: every docs/*phasemap*.spec)
 *   --check   say which files would change, change nothing (exit 1 when any is unreadable)
 */
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ROOT = path.resolve(__dirname, '..');

const wordsOf = (t) => String(t).split(/\s+/).filter(Boolean);
// the same words in the same order, the folding markers aside (on both sides: a map may already hold its own >- blocks)
const sameWords = (a, b) => { const x = wordsOf(a).filter(w => w !== '>-'), y = wordsOf(b).filter(w => w !== '>-'); return x.length === y.length && x.every((w, i) => w === y[i]); };

/** the key line that owns line `at` (0-based): the nearest line above with a plain scalar value, indented less than `at` */
function ownerOf(lines, at) {
  const indAt = lines[at] != null ? lines[at].match(/^\s*/)[0].length : Infinity;
  for (let i = at; i >= 0; i--) {
    // a key looks like a key (status, symptom, P1_copilot_tool_loop) — never a sentence that happens to hold a colon
    const m = lines[i].match(/^(\s*)(-\s+)?([A-Za-z0-9_][\w.-]{0,80}):[ \t]+(\S.*)$/);
    if (!m) continue;
    const ind = m[1].length + (m[2] ? m[2].length : 0);
    if (i !== at && ind >= indAt) continue;
    const v = m[4].trim();
    if (/^[>|][-+]?\s*$/.test(v) || /^[[{&*!]/.test(v)) return null;   // already a block, a flow collection or an anchor: not ours to touch
    if (/^"([^"\\]|\\.)*"\s*(#.*)?$/.test(v) || /^'([^']|'')*'\s*(#.*)?$/.test(v)) { if (i === at) continue; return null; }   // a whole quoted string is fine
    return { line: i, indent: m[1], dash: m[2] || '', key: m[3], value: v, ind };
  }
  return null;
}

/**
 * listItemAt(lines, at) → the list item of prose that owns line `at`: `- text with: a colon …` (not `- key: value`),
 * folded whole as `- >-`, so a sentence stays a list entry instead of becoming a fake key
 */
function listItemAt(lines, at) {
  const indAt = lines[at] != null ? lines[at].match(/^\s*/)[0].length : Infinity;
  for (let i = at; i >= 0; i--) {
    const m = lines[i].match(/^(\s*)-\s+(\S.*)$/);
    if (!m) { if (i !== at && lines[i].trim() && lines[i].match(/^\s*/)[0].length < indAt - 2) return null; continue; }
    if (i !== at && m[1].length >= indAt) continue;
    const v = m[2].trim();
    if (/^[>|][-+]?\s*$/.test(v) || /^[[{&*!]/.test(v) || /^[A-Za-z0-9_][\w.-]{0,80}:(\s|$)/.test(v)) return null;
    if (/^"([^"\\]|\\.)*"\s*$/.test(v) || /^'([^']|'')*'\s*$/.test(v)) return null;
    return { line: i, indent: m[1], value: v, ind: m[1].length };
  }
  return null;
}
function foldItem(text, errLine) {
  const lines = text.split('\n');
  const o = listItemAt(lines, Math.min(errLine, lines.length - 1)); if (!o) return null;
  let end = o.line + 1;
  while (end < lines.length && lines[end].trim() && lines[end].match(/^\s*/)[0].length > o.ind && !/^\s*-\s/.test(lines[end].slice(0, o.ind + 2))) end++;
  const pad = ' '.repeat(o.ind + 4);
  return [...lines.slice(0, o.line), `${o.indent}- >-`, ...[o.value, ...lines.slice(o.line + 1, end).map(l => l.trim())].map(l => pad + l), ...lines.slice(end)].join('\n');
}

/** foldAt(text, errLine) → text | null — the owning value at errLine (0-based) as a folded block */
function foldAt(text, errLine) {
  const lines = text.split('\n');
  const o = ownerOf(lines, Math.min(errLine, lines.length - 1));
  if (!o) return null;
  let end = o.line + 1;
  while (end < lines.length && (lines[end].trim() === '' ? (lines[end + 1] || '').match(/^\s*/)[0].length > o.ind : lines[end].match(/^\s*/)[0].length > o.ind) && !/^\s*-\s/.test(lines[end].slice(0, o.ind + 2) + '') ) end++;
  // the value's lines: the first line's value, then every continuation line (more indented than the key)
  const body = [o.value, ...lines.slice(o.line + 1, end).map(l => l.trim())].filter((l, i, a) => !(l === '' && i === a.length - 1));
  const pad = ' '.repeat(o.ind + 2);
  const block = [`${o.indent}${o.dash}${o.key}: >-`, ...body.map(l => l ? pad + l : '')];
  return [...lines.slice(0, o.line), ...block, ...lines.slice(end)].join('\n');
}

/** repair(text) → { text, steps, ok, error } */
function repair(text, maxSteps = 60) {
  let cur = text, steps = 0, lastErr = null;
  for (; steps < maxSteps; steps++) {
    try { yaml.load(cur); return { text: cur, steps, ok: true }; }
    catch (e) {
      const line = e.mark ? e.mark.line : null;
      if (line == null) return { text: cur, steps, ok: false, error: e.message.split('\n')[0] };
      const key = `${line}:${e.reason}`;
      const next = foldItem(cur, line) || foldAt(cur, line) || foldItem(cur, Math.max(0, line - 1)) || foldAt(cur, Math.max(0, line - 1));
      if (!next || next === cur || key === lastErr && next === cur) return { text: cur, steps, ok: false, error: e.message.split('\n')[0] };
      if (!sameWords(text, next)) return { text: cur, steps, ok: false, error: `a repair would change the words near line ${line + 1} — refused` };
      lastErr = key; cur = next;
    }
  }
  return { text: cur, steps, ok: false, error: `still not valid YAML after ${maxSteps} repairs` };
}

function main() {
  const args = process.argv.slice(2), check = args.includes('--check');
  let files = args.filter(a => !a.startsWith('--'));
  if (!files.length) files = fs.readdirSync(path.join(ROOT, 'docs')).filter(f => f.endsWith('.spec') && /phase-?map/i.test(f)).map(f => path.join('docs', f));
  let bad = 0, fixed = 0;
  for (const f of files) {
    const p = path.isAbsolute(f) ? f : path.join(ROOT, f), text = fs.readFileSync(p, 'utf8');
    try { yaml.load(text); continue; } catch (_) { /* repair below */ }
    const r = repair(text);
    if (!r.ok) { bad++; console.log(`✗ ${f}: ${r.error}`); continue; }
    fixed++;
    if (check) console.log(`~ ${f}: ${r.steps} value(s) would become folded blocks`);
    else { fs.writeFileSync(p, r.text); console.log(`✓ ${f}: ${r.steps} value(s) folded — valid YAML, every word unchanged`); }
  }
  console.log(`\n${fixed} ${check ? 'repairable' : 'repaired'}, ${bad} not repaired`);
  if (check && (bad || fixed)) process.exitCode = 1;
}

if (require.main === module) main();
module.exports = { repair, foldAt, foldItem, sameWords };
