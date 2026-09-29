'use strict';
/**
 * lib/code-edit.js — precise edits for agents: plan them against a file, diff them, check their syntax, and commit
 * them through the .inject trail.
 * comp_id: nexus.lib.code-edit
 * UUID: nexus-lib-code-edit-v1-0000-2026-0927-jamesbrooks-001
 *
 * §0.39.273 CB4 (docs/2026-09-27-idearium-codebase-toolkit-phasemap.spec). Before this an agent could only write a
 * WHOLE file (loom.write.tool, POST /api/repos/:uuid/file): to change one line of a 3,000-line file a small model had
 * to reproduce 2,999 lines exactly. And in review mode, a second proposal for the same file was computed from the
 * committed file, so it silently dropped the first.
 *
 * planEdits(content, edits) — pure. Every edit refers to the file AS IT WAS before the call (so line numbers from a
 * read stay valid for the whole batch); spans may not overlap. Edit forms:
 *   { old, new, replaceAll?, occurrence? }     exact text. If it is not found exactly, a match that differs only in
 *                                              trailing whitespace, then only in indentation, is accepted when it is
 *                                              UNIQUE (the replacement is re-indented to fit) and the result says so.
 *   { startLine, endLine, new }                replace whole lines (1-based, inclusive)
 *   { insertAfter: n, new } / { insertBefore: n, new }   insert whole lines (insertAfter: 0 = top of file)
 *   { append: text } / { prepend: text }
 * A refusal says exactly why and what to do (invariant I4): where the nearest match is, which lines matched twice.
 *
 * commit({ layer, repo, hat, changes, mode }) — every change becomes an .inject (lib/repo-inject.js, invariant I1):
 *   auto    proposed + applied now, all-or-nothing: if one file fails, the ones already applied in this call are
 *           reverted and nothing is left half-done. One materialize + reindex for the whole batch.
 *   review  proposed and left for approval. A later edit to a file that already has a pending proposal from these
 *           tools STACKS onto it (the proposal is edited), so the second edit never drops the first.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const VERSION = '1.1.0';   // 1.1.0 (0.39.279): stage() + promote() — staging-self-heal S1
const VIA = 'idearium.code';
const sha = (s) => (s == null ? null : crypto.createHash('sha256').update(String(s), 'utf8').digest('hex'));

// ── planning ─────────────────────────────────────────────────────────────────────────────────────────────
function _lineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  return starts;
}
function _lineAt(starts, offset) {
  let lo = 0, hi = starts.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= offset) lo = mid; else hi = mid - 1; }
  return lo + 1;
}
function _allIndexes(hay, needle) {
  const out = [];
  if (!needle) return out;
  let i = hay.indexOf(needle);
  while (i !== -1) { out.push(i); i = hay.indexOf(needle, i + needle.length); }
  return out;
}
const _indentOf = (l) => (/^[ \t]*/.exec(l) || [''])[0];

/** find `old` as whole lines, comparing with trailing space removed, or with all leading/trailing space removed */
function _looseLineMatch(lines, oldText, mode) {
  const want = oldText.replace(/\r\n/g, '\n').replace(/^\n+|\n+$/g, '').split('\n');
  const norm = mode === 'indent' ? (s) => s.trim() : (s) => s.replace(/[ \t]+$/, '');
  const w = want.map(norm);
  if (!w.some(x => x)) return [];
  const hits = [];
  for (let i = 0; i + w.length <= lines.length; i++) {
    let ok = true;
    for (let j = 0; j < w.length; j++) if (norm(lines[i + j]) !== w[j]) { ok = false; break; }
    if (ok) hits.push(i);
  }
  return hits.map(i => ({ startLine: i + 1, endLine: i + w.length, wantFirst: want[0] }));
}

function _nearest(lines, oldText) {
  const first = oldText.split('\n').map(s => s.trim()).find(Boolean) || '';
  if (!first) return [];
  const toks = new Set((first.match(/[A-Za-z_$][\w$]*|\S/g) || []));
  const scored = [];
  for (let i = 0; i < lines.length; i++) {
    const lt = lines[i].match(/[A-Za-z_$][\w$]*|\S/g) || [];
    if (!lt.length) continue;
    let n = 0; for (const t of lt) if (toks.has(t)) n++;
    const s = n / Math.max(toks.size, lt.length);
    if (s >= 0.5) scored.push({ line: i + 1, s, text: lines[i].trim().slice(0, 160) });
  }
  return scored.sort((a, b) => b.s - a.s).slice(0, 3).map(({ line, text }) => ({ line, text }));
}

function _reindent(newText, from, to) {
  if (from === to) return newText;
  return newText.split('\n').map(l => {
    if (!l.trim()) return l;
    if (from && l.startsWith(from)) return to + l.slice(from.length);
    if (!from) return to + l;
    return l;
  }).join('\n');
}

/**
 * planEdits(content, edits) -> { ok, content, changes:[{ index, kind, startLine, endLine, matchedBy }], errors:[] }
 */
function planEdits(content, edits) {
  const src = String(content ?? '');
  const crlf = /\r\n/.test(src) && !/(^|[^\r])\n/.test(src);
  const text = crlf ? src.replace(/\r\n/g, '\n') : src;
  const lines = text.split('\n');
  const starts = _lineStarts(text);
  const lineOffset = (n) => (n <= 0 ? 0 : n > lines.length ? text.length : starts[n - 1]);
  const lineEnd = (n) => (n >= lines.length ? text.length : starts[n]);        // offset just past line n's newline
  const spans = [];
  const errors = [];
  const list = Array.isArray(edits) ? edits : [edits];
  if (!list.length) return { ok: false, errors: ['no edits given'] };

  list.forEach((e, index) => {
    const at = `edit ${index + 1}`;
    if (!e || typeof e !== 'object') { errors.push(`${at}: not an object`); return; }
    const repl = e.new ?? e.newText ?? e.replacement ?? e.content ?? e.text;
    if (e.append != null || e.prepend != null) {
      const t = String(e.append ?? e.prepend);
      if (e.append != null) spans.push({ index, a: text.length, b: text.length, text: (text && !text.endsWith('\n') ? '\n' : '') + t, kind: 'append', startLine: lines.length + 1, endLine: lines.length });
      else spans.push({ index, a: 0, b: 0, text: t.endsWith('\n') ? t : t + '\n', kind: 'prepend', startLine: 1, endLine: 0 });
      return;
    }
    if (e.insertAfter != null || e.insertBefore != null) {
      if (typeof repl !== 'string') { errors.push(`${at}: "new" (the lines to insert) is required`); return; }
      const n = parseInt(e.insertAfter != null ? e.insertAfter : e.insertBefore - 1, 10);
      if (!(n >= 0 && n <= lines.length)) { errors.push(`${at}: line ${e.insertAfter ?? e.insertBefore} is outside the file (1-${lines.length})`); return; }
      const off = n === 0 ? 0 : lineEnd(n);
      let t = repl.endsWith('\n') ? repl : repl + '\n';
      if (off === text.length && text && !text.endsWith('\n')) t = '\n' + t.replace(/\n$/, '');
      spans.push({ index, a: off, b: off, text: t, kind: 'insert', startLine: n + 1, endLine: n });
      return;
    }
    if (e.startLine != null || e.endLine != null) {
      if (typeof repl !== 'string') { errors.push(`${at}: "new" (the replacement lines) is required`); return; }
      const s = parseInt(e.startLine, 10), en = parseInt(e.endLine ?? e.startLine, 10);
      if (!(s >= 1 && en >= s && en <= lines.length)) { errors.push(`${at}: lines ${e.startLine}-${e.endLine} are not inside the file (1-${lines.length})`); return; }
      if (e.expectText != null) {
        const cur = lines.slice(s - 1, en).join('\n');
        if (cur.replace(/\s+$/gm, '') !== String(e.expectText).replace(/\r\n/g, '\n').replace(/\s+$/gm, '')) { errors.push(`${at}: lines ${s}-${en} no longer hold the expected text — read them again`); return; }
      }
      const a = lineOffset(s), b = en === lines.length ? text.length : lineEnd(en);
      let t = repl;
      if (b !== text.length || text.endsWith('\n')) { if (t && !t.endsWith('\n')) t += '\n'; }
      spans.push({ index, a, b, text: t, kind: 'lines', startLine: s, endLine: en });
      return;
    }
    const old = e.old ?? e.oldText ?? e.find ?? e.search;
    if (typeof old !== 'string' || !old.length) { errors.push(`${at}: give "old" (exact text to replace) with "new", or startLine/endLine, or insertAfter/insertBefore`); return; }
    if (typeof repl !== 'string') { errors.push(`${at}: "new" (the replacement text) is required`); return; }
    const oldN = crlf ? old.replace(/\r\n/g, '\n') : old;
    const hits = _allIndexes(text, oldN);
    if (hits.length) {
      let use = hits;
      if (!e.replaceAll) {
        if (e.occurrence != null) {
          const k = parseInt(e.occurrence, 10);
          if (!(k >= 1 && k <= hits.length)) { errors.push(`${at}: occurrence ${e.occurrence} requested, the text appears ${hits.length} time(s)`); return; }
          use = [hits[k - 1]];
        } else if (hits.length > 1) {
          errors.push(`${at}: "old" appears ${hits.length} times (lines ${hits.slice(0, 8).map(h => _lineAt(starts, h)).join(', ')}) — include more surrounding text so it is unique, or pass occurrence / replaceAll`);
          return;
        }
      }
      for (const h of use) spans.push({ index, a: h, b: h + oldN.length, text: repl, kind: 'replace', startLine: _lineAt(starts, h), endLine: _lineAt(starts, h + oldN.length - 1), matchedBy: 'exact' });
      return;
    }
    for (const mode of ['trailing-space', 'indent']) {
      const loose = _looseLineMatch(lines, oldN, mode);
      if (loose.length === 1 || (loose.length > 1 && e.replaceAll)) {
        for (const m of loose) {
          const actualIndent = _indentOf(lines[m.startLine - 1]);
          const givenIndent = _indentOf(m.wantFirst);
          let t = repl.replace(/^\n+|\n+$/g, '');
          if (mode === 'indent') {
            const givenLines = oldN.replace(/^\n+|\n+$/g, '').split('\n'), newLines = t.split('\n');
            // same shape: each new line takes the real indentation of the line it replaces (a model that dropped the
            // indentation gets it back line by line); otherwise shift everything by the first line's difference
            if (givenLines.length === newLines.length) t = newLines.map((l, k) => (l.trim() ? _indentOf(lines[m.startLine - 1 + k]) + l.slice(_indentOf(givenLines[k]).length).replace(/^[ \t]+/, (w) => (_indentOf(givenLines[k]) ? w : '')) : l)).join('\n');
            else t = _reindent(t, givenIndent, actualIndent);
          }
          const a = lineOffset(m.startLine), b = m.endLine === lines.length ? text.length : lineEnd(m.endLine) - 1;
          spans.push({ index, a, b, text: t, kind: 'replace', startLine: m.startLine, endLine: m.endLine, matchedBy: mode === 'indent' ? 'ignoring indentation' : 'ignoring trailing whitespace' });
        }
        return;
      }
      if (loose.length > 1) { errors.push(`${at}: "old" matches ${loose.length} places once whitespace is ignored (lines ${loose.slice(0, 8).map(x => x.startLine).join(', ')}) — include more surrounding text`); return; }
    }
    const near = _nearest(lines, oldN);
    errors.push(`${at}: "old" was not found${near.length ? ` — closest line(s): ${near.map(n => `${n.line}: ${n.text}`).join(' | ')}` : ''}. Read the file again (code_read) and copy the text exactly.`);
  });
  if (errors.length) return { ok: false, errors };
  spans.sort((x, y) => x.a - y.a || x.b - y.b);
  for (let i = 1; i < spans.length; i++) {
    if (spans[i].a < spans[i - 1].b || (spans[i].a === spans[i - 1].a && spans[i].b === spans[i - 1].b && spans[i].a !== spans[i].b)) {
      return { ok: false, errors: [`edits ${spans[i - 1].index + 1} and ${spans[i].index + 1} overlap (lines ${spans[i - 1].startLine}-${spans[i - 1].endLine} and ${spans[i].startLine}-${spans[i].endLine}) — merge them into one edit`] };
    }
  }
  let out = text;
  for (let i = spans.length - 1; i >= 0; i--) out = out.slice(0, spans[i].a) + spans[i].text + out.slice(spans[i].b);
  if (crlf) out = out.replace(/\n/g, '\r\n');
  return { ok: true, content: out, changed: out !== src,
    changes: spans.map(s => ({ edit: s.index + 1, kind: s.kind, startLine: s.startLine, endLine: s.endLine, ...(s.matchedBy && s.matchedBy !== 'exact' ? { matchedBy: s.matchedBy } : {}) })) };
}

// ── diff ─────────────────────────────────────────────────────────────────────────────────────────────────
/** unifiedDiff(a, b, { path, context, maxLines }) — line diff (LCS over the differing middle), capped */
function unifiedDiff(a, b, { path: p = 'file', context = 2, maxLines = 120 } = {}) {
  const A = a == null ? [] : String(a).split('\n');
  const B = b == null ? [] : String(b).split('\n');
  let pre = 0;
  while (pre < A.length && pre < B.length && A[pre] === B[pre]) pre++;
  let suf = 0;
  while (suf < A.length - pre && suf < B.length - pre && A[A.length - 1 - suf] === B[B.length - 1 - suf]) suf++;
  const a1 = A.slice(pre, A.length - suf), b1 = B.slice(pre, B.length - suf);
  if (!a1.length && !b1.length) return '';
  let ops;
  if (a1.length * b1.length > 4e6) ops = [...a1.map(l => ['-', l]), ...b1.map(l => ['+', l])];
  else {
    const n = a1.length, m = b1.length;
    const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a1[i] === b1[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    ops = [];
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (a1[i] === b1[j]) { ops.push([' ', a1[i]]); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) ops.push(['-', a1[i++]]);
      else ops.push(['+', b1[j++]]);
    }
    while (i < n) ops.push(['-', a1[i++]]);
    while (j < m) ops.push(['+', b1[j++]]);
  }
  const all = [...A.slice(Math.max(0, pre - context), pre).map(l => [' ', l]), ...ops, ...A.slice(A.length - suf, A.length - suf + context).map(l => [' ', l])];
  const startA = Math.max(0, pre - context) + 1, startB = startA;
  const countA = all.filter(o => o[0] !== '+').length, countB = all.filter(o => o[0] !== '-').length;
  const head = [`--- a/${p}`, `+++ b/${p}`, `@@ -${a == null ? 0 : startA},${countA} +${b == null ? 0 : startB},${countB} @@`];
  const body = all.map(([k, l]) => k + l);
  const cut = body.length > maxLines ? [...body.slice(0, maxLines), `… ${body.length - maxLines} more diff line(s)`] : body;
  return [...head, ...cut].join('\n');
}

// ── diagnostics ──────────────────────────────────────────────────────────────────────────────────────────
let _py = null;
function _python() { if (_py === null) { try { _py = spawnSync('python3', ['--version'], { timeout: 3000 }).status === 0 ? 'python3' : false; } catch (_) { _py = false; } } return _py; }

/**
 * diagnose(filePath, content) -> [{ severity, message, line?, column?, tool }]   — fast, local, no network.
 *   .js/.cjs/.mjs  node --check (ESM when the file uses import/export)
 *   .json          JSON.parse, with the line of the error
 *   .py            python3 ast.parse, when python3 exists
 *   ts/tsx/jsx/go/rust/java/… and css   brace/bracket balance from the code-intel scanner
 */
function diagnose(filePath, content) {
  const ext = path.extname(String(filePath || '')).toLowerCase();
  const text = String(content ?? '');
  const out = [];
  try {
    if (['.js', '.cjs', '.mjs'].includes(ext)) {
      const esm = ext === '.mjs' || (ext === '.js' && /^\s*(import\s[^(]|export\s)/m.test(text));
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-check-'));
      const f = path.join(dir, `check${esm ? '.mjs' : '.cjs'}`);
      fs.writeFileSync(f, text.replace(/^#!.*\n/, '\n'));
      const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8', timeout: 15000 });
      fs.rmSync(dir, { recursive: true, force: true });
      if (r.status !== 0) {
        const err = String(r.stderr || '');
        const m = /check\.[cm]js:(\d+)/.exec(err);
        const msg = (err.split('\n').find(l => /Error/.test(l)) || err.split('\n').filter(Boolean).pop() || 'syntax error').trim();
        const lineText = m ? (err.split('\n')[1] || '').trim() : '';
        out.push({ severity: 'error', message: msg, line: m ? parseInt(m[1], 10) : null, ...(lineText ? { text: lineText.slice(0, 160) } : {}), tool: 'node --check' });
      }
      return out;
    }
    if (ext === '.json') {
      try { JSON.parse(text); } catch (e) {
        const pos = /position (\d+)/.exec(e.message);
        const line = pos ? text.slice(0, parseInt(pos[1], 10)).split('\n').length : (/line (\d+)/.exec(e.message) || [])[1] || null;
        out.push({ severity: 'error', message: e.message, line: line ? Number(line) : null, tool: 'JSON.parse' });
      }
      return out;
    }
    if (ext === '.py' && _python()) {
      const r = spawnSync('python3', ['-c', 'import ast,sys\nsrc=sys.stdin.read()\ntry:\n  ast.parse(src)\nexcept SyntaxError as e:\n  print(f"{e.lineno}\\t{e.offset}\\t{e.msg}")\n  sys.exit(1)'], { input: text, encoding: 'utf8', timeout: 15000 });
      if (r.status === 1) { const [l, c, msg] = String(r.stdout).trim().split('\t'); out.push({ severity: 'error', message: msg || 'syntax error', line: parseInt(l, 10) || null, column: parseInt(c, 10) || null, tool: 'python ast' }); }
      return out;
    }
    const L = require('./languages.js');
    const lang = L.EXT_TO_LANGUAGE[ext];
    const S = require('./code-intel/structure.js');
    if (lang && (S.JS_LANGS.has(lang) || S.C_LANGS.has(lang)) && lang !== 'json') {
      const s = S.scanBraces(text, { language: lang });
      if (!s.ok) {
        // the first line where depth goes negative, else the end of the file
        let line = null;
        for (let i = 0; i < s.lines.length; i++) if (s.lines[i].depth < 0) { line = i + 1; break; }
        const jsxTolerant = lang === 'jsx' || lang === 'tsx';
        out.push({ severity: jsxTolerant ? 'warning' : 'error', message: `braces do not balance (depth ${s.finalDepth} at end of file)${jsxTolerant ? ' — JSX text can confuse this check' : ''}`, line: line || text.split('\n').length, tool: 'brace scan' });
      }
    }
  } catch (e) { out.push({ severity: 'warning', message: `check could not run: ${e.message}`, tool: 'diagnose' }); }
  return out;
}

// ── commit through the inject trail ─────────────────────────────────────────────────────────────────────
function _pendingFor(RI, repoUuid, relPath) {
  return RI.list(repoUuid, { status: 'proposed' }).find(n => n.path === relPath && n.source && n.source.via === VIA) || null;
}

/**
 * current({ layer, RI, repo, path, view }) -> { exists, content, sha, pending? }
 *   view 'working' (default): a pending proposal from these tools is the file's current state for the next edit.
 *   view 'committed': the file in the repo.
 */
function current({ layer, RI, repo, path: relPath, view = 'working' }) {
  const pend = view === 'working' ? _pendingFor(RI, repo.uuid, relPath) : null;
  if (pend) return { exists: pend.op !== 'delete', content: pend.op === 'delete' ? null : pend.content, sha: pend.op === 'delete' ? null : sha(pend.content), pending: { inject: pend.uuid, op: pend.op || 'write' } };
  const r = typeof RI.currentOf === 'function' ? RI.currentOf({ layer, repo, path: relPath })
    : (() => { const x = layer.readFile(repo.uuid, relPath); return x && !x.error ? { content: x.content } : { content: null }; })();
  if (r.error) return { exists: false, content: null, sha: null, error: r.error };
  if (r.content == null) return { exists: false, content: null, sha: null };
  const c = String(r.content);
  return { exists: true, content: c, sha: sha(c), via: r.via || null };
}

/**
 * commit({ layer, RI, repo, hat, changes:[{ path, content } | { path, delete:true }], mode, dryRun, summaryOf })
 *   -> { ok, mode, files:[{ path, inject, status, op, stacked }], errors }
 */
function commit({ layer, RI, repo, hat = null, changes, mode = null, source = {} } = {}) {
  const m = mode || RI.modeFor(repo);
  const results = [];
  if (m === 'review') {
    for (const ch of changes) {
      const op = ch.delete ? 'delete' : 'write';
      const pend = _pendingFor(RI, repo.uuid, ch.path);
      if (pend && (pend.op || 'write') === op && op === 'write') {
        const r = RI.edit(pend.uuid, ch.content);
        if (!r.ok) return { ok: false, mode: m, errors: r.errors, files: results };
        results.push({ path: ch.path, inject: pend.uuid, status: 'proposed', op, stacked: true });
        continue;
      }
      if (pend) RI.reject(pend.uuid, { reason: `superseded by a later ${op} from ${VIA}` });
      const r = RI.propose({ layer, repo, hat, path: ch.path, content: ch.delete ? null : ch.content, op, source: { kind: hat ? 'agent' : 'person', via: VIA, ...source } });
      if (!r.ok) return { ok: false, mode: m, errors: r.errors, files: results };
      results.push({ path: r.inject.path, inject: r.inject.uuid, status: 'proposed', op, stacked: false });
    }
    return { ok: true, mode: m, files: results };
  }
  // auto: propose + apply each, all-or-nothing, one refresh at the end
  const applied = [];
  const rollback = (why) => {
    const undone = [];
    for (const a of applied.reverse()) { const r = RI.revert(a.inject, { layer, force: true, defer: true }); undone.push({ path: a.path, reverted: !!r.ok }); }
    try { layer.refresh(repo.uuid); } catch (_) { /* reported by the refresh itself */ }
    return { ok: false, mode: m, errors: [why], rolledBack: undone, files: [] };
  };
  for (const ch of changes) {
    const op = ch.delete ? 'delete' : 'write';
    const p = RI.propose({ layer, repo, hat, path: ch.path, content: ch.delete ? null : ch.content, op, source: { kind: hat ? 'agent' : 'person', via: VIA, ...source } });
    if (!p.ok) return rollback(`${ch.path}: ${(p.errors || []).join('; ')}`);
    const a = RI.apply(p.inject.uuid, { layer, defer: true, approvedBy: 'auto' });
    if (!a.ok) { RI.reject(p.inject.uuid, { reason: 'apply failed inside a batch' }); return rollback(`${ch.path}: ${(a.errors || []).join('; ')}`); }
    applied.push({ path: a.inject.path, inject: a.inject.uuid });
    results.push({ path: a.inject.path, inject: a.inject.uuid, status: a.inject.status, op, stacked: false, ...(a.gate ? { gate: a.gate } : {}) });
  }
  try { layer.refresh(repo.uuid); } catch (e) { return { ok: true, mode: m, files: results, warning: `written, but the reindex failed: ${e.message}` }; }
  return { ok: true, mode: m, files: results };
}

// ── staging (§0.39.279, docs/2026-09-28-staging-self-heal-phasemap.spec S1) ─────────────────────────────────
// The third path beside review and auto: a change is COMMITTED TO A BRANCH and the working tree is left alone until
// promote (invariant I2). Every staged batch is one versionium commit on repo-<uuid>@staging, caused by the gap (I3),
// the branch forked from the repo's own history (versionium S0 fork point). promote() is the single real apply into
// the repo — the same path a restore will use (S6).

function stagingBranch(repoUuid) { return `repo-${repoUuid}@staging`; }

/**
 * stage({ layer, RI, repo, hat, changes, causedBy, record }) -> Promise<{ ok, mode:'stage', branch, commit, files }>
 *   record(payload) — the versionium commit (async ok): { message, branch, causedBy, system, state, from } -> commit
 *   ({ commitId, parentId, … }) or { error }. It is asked to fork from the repo's own branch (repo-<uuid>); if that
 *   branch does not exist yet, from nothing — and the result says which.
 * All-or-nothing: if a proposal or the versionium commit fails, every inject this call staged is rejected and the
 * reason returned (I5 — never a half-staged batch, never silently unrecorded).
 */
async function stage({ layer, RI, repo, hat = null, changes = [], causedBy = null, record = null, source = {} } = {}) {
  if (!repo || !repo.uuid) return { ok: false, mode: 'stage', errors: ['repo with a uuid is required'] };
  if (!Array.isArray(changes) || !changes.length) return { ok: false, mode: 'stage', errors: ['changes required'] };
  if (typeof record !== 'function') return { ok: false, mode: 'stage', errors: ['stage needs a versionium recorder (record) — a staged change that is not on a branch is not staged'] };
  const branch = stagingBranch(repo.uuid);
  const staged = [];
  const undo = (why) => { for (const s of staged) { try { RI.reject(s.inject, { reason: `staging failed: ${why}` }); } catch (_) {} } return { ok: false, mode: 'stage', branch, errors: [why], files: [] }; };
  for (const ch of changes) {
    const op = ch.delete ? 'delete' : 'write';
    const p = RI.propose({ layer, repo, hat, path: ch.path, content: ch.delete ? null : ch.content, op, source: { kind: hat ? 'agent' : 'person', via: VIA, staged: true, causedBy, ...source } });
    if (!p.ok) return undo(`${ch.path}: ${(p.errors || []).join('; ')}`);
    const st = RI.stage(p.inject.uuid, { branch, causedBy });
    if (!st.ok) { try { RI.reject(p.inject.uuid, { reason: 'could not stage' }); } catch (_) {} return undo(`${ch.path}: ${(st.errors || []).join('; ')}`); }
    staged.push({ path: p.inject.path, inject: p.inject.uuid, op, contentSha256: p.inject.contentSha256, baseSha256: p.inject.baseSha256 });
  }
  const state = { repoUuid: repo.uuid, causedBy, files: staged.map(x => ({ path: x.path, op: x.op, inject: x.inject, contentSha256: x.contentSha256, baseSha256: x.baseSha256 })) };
  const message = `stage: ${staged.length} file(s)${causedBy ? ` for ${causedBy}` : ''}`;
  // a recorder may answer { error } or throw — either way the same retry and the same undo
  const tryRecord = async (from) => { try { return await record({ message, branch, causedBy, system: 'staging', state, from }); } catch (e) { return { error: e.message }; } };
  let forkedFrom = `repo-${repo.uuid}`;
  let c = await tryRecord(forkedFrom);
  if (c && c.error && /no such commit or branch/.test(c.error)) { forkedFrom = null; c = await tryRecord(null); }
  if (!c || c.error || !c.commitId) return undo(`versionium did not record the staging commit: ${(c && c.error) || 'no commit returned'}`);
  for (const s of staged) RI.setStagingCommit(s.inject, c.commitId);
  return { ok: true, mode: 'stage', branch, commit: { commitId: c.commitId, parentId: c.parentId || null, forkedFrom }, causedBy,
    files: staged.map(x => ({ path: x.path, inject: x.inject, status: 'staged', op: x.op })) };
}

/**
 * promote({ layer, RI, repo, injects | commitId, approvedBy, force }) -> { ok, files } | { ok:false, errors, rolledBack }
 * Applies a staged batch into the repo, all-or-nothing, one reindex (the auto path's own rollback). A file that changed
 * since it was staged is a conflict, not an overwrite, unless forced. commitId = every inject staged by that commit.
 */
function promote({ layer, RI, repo, injects = null, commitId = null, approvedBy = 'promote', force = false } = {}) {
  if (!repo || !repo.uuid) return { ok: false, errors: ['repo with a uuid is required'] };
  let ids = Array.isArray(injects) ? injects : null;
  if (!ids && commitId) ids = RI.list(repo.uuid, { status: 'staged', limit: 10000 }).filter(n => n.staging && n.staging.commitId === commitId).map(n => n.uuid);
  if (!ids || !ids.length) return { ok: false, errors: [commitId ? `nothing staged by ${commitId}` : 'injects or commitId required'] };
  const applied = [], files = [];
  for (const id of ids) {
    const n = RI.get(id);
    if (!n || n.repoUuid !== repo.uuid) return _promoteUndo(RI, layer, repo, applied, `${id}: not an inject of this repo`);
    if (n.status !== 'staged') return _promoteUndo(RI, layer, repo, applied, `${n.path}: is ${n.status}, not staged`);
    const a = RI.apply(id, { layer, force, defer: true, approvedBy });
    if (!a.ok) return _promoteUndo(RI, layer, repo, applied, `${n.path}: ${(a.errors || []).join('; ')}`, !!a.conflict);
    applied.push({ path: a.inject.path, inject: id });
    files.push({ path: a.inject.path, inject: id, status: 'applied', op: a.inject.op || 'write' });
  }
  try { layer.refresh(repo.uuid); } catch (e) { return { ok: true, files, warning: `promoted, but the reindex failed: ${e.message}` }; }
  return { ok: true, files };
}
function _promoteUndo(RI, layer, repo, applied, why, conflict = false) {
  const undone = [];
  for (const a of applied.reverse()) { const r = RI.revert(a.inject, { layer, force: true, defer: true }); undone.push({ path: a.path, reverted: !!r.ok }); }
  try { layer.refresh(repo.uuid); } catch (_) {}
  return { ok: false, conflict, errors: [why], rolledBack: undone, files: [] };
}

module.exports = { VERSION, VIA, planEdits, unifiedDiff, diagnose, current, commit, sha, _pendingFor, stage, promote, stagingBranch };
