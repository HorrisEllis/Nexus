'use strict';
/**
 * lib/checks/ck-248-toolchain.js — CK-248 "the language's own toolchain" (cos/spec/check-catalogue.spec, family
 * languages). component_id: nexus.lib.checks.ck-248-toolchain
 *
 * Invariant: every file passes its language's parser (and typechecker where one exists). CK-001 parsed JS only; this
 * runs each language's own tool on its own files — nothing is executed, only parsed:
 *   js/cjs/mjs  node --check            ts/tsx  tsc --noEmit (per file, isolated)     py   python3 -m py_compile
 *   sh/bash     bash -n                 json    JSON.parse                             yaml/yml  js-yaml load
 *   go          gofmt -e                c/h     gcc -fsyntax-only                      cpp/cc/hpp  g++ -fsyntax-only
 * A tool that is not installed is reported (items: { skipped }), never counted as a pass; when every file of a language
 * was skipped the result says so. Files: condition.files, else every file under condition.path (bounded: max files).
 *
 *   run({ path, files, max }, { root }) → { ok, verifiable, evidence, reason, items: [{ file, lang, error } | { lang, skipped }] }
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ID = 'CK-248';
const NEXUS_ROOT = path.resolve(__dirname, '../..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'data', '_archive', 'dist', 'build', 'target', 'vendor', '__pycache__']);

const _has = new Map();
function has(tool) {
  if (!_has.has(tool)) { const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [tool], { encoding: 'utf8' }); _has.set(tool, r.status === 0); }
  return _has.get(tool);
}
const _run = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', timeout: 60000, ...opts });
const _first = (s) => String(s || '').split('\n').map(l => l.trim()).filter(Boolean).slice(0, 3).join(' · ');   // trimmed after paths are made relative (run)

// lang → { exts, tool, check(abs) → null | error text }
const LANGS = {
  js: { exts: ['js', 'cjs', 'mjs'], tool: 'node', check: (f) => { const r = _run(process.execPath, ['--check', f]); return r.status === 0 ? null : _first(r.stderr); } },
  ts: { exts: ['ts', 'tsx'], tool: 'tsc', check: (f) => { const r = _run('tsc', ['--noEmit', '--isolatedModules', '--skipLibCheck', '--allowJs', '--jsx', 'preserve', '--target', 'es2022', '--moduleResolution', 'node', '--noResolve', f]); const out = `${r.stdout || ''}${r.stderr || ''}`; const syn = out.split('\n').filter(l => /error TS1\d{3}/.test(l)); return syn.length ? _first(syn.join('\n')) : null; } },
  py: { exts: ['py'], tool: 'python3', check: (f) => { const r = _run('python3', ['-I', '-c', 'import ast,sys; ast.parse(open(sys.argv[1],"rb").read(), sys.argv[1])', f]); return r.status === 0 ? null : _first(r.stderr.split('\n').slice(-4).join('\n')); } },
  sh: { exts: ['sh', 'bash'], tool: 'bash', check: (f) => { const r = _run('bash', ['-n', f]); return r.status === 0 ? null : _first(r.stderr); } },
  json: { exts: ['json'], tool: null, check: (f) => { try { JSON.parse(fs.readFileSync(f, 'utf8')); return null; } catch (e) { return e.message.slice(0, 300); } } },
  yaml: { exts: ['yaml', 'yml'], tool: null, check: (f) => { try { require('js-yaml').loadAll(fs.readFileSync(f, 'utf8')); return null; } catch (e) { return String(e.message).split('\n')[0].slice(0, 300); } } },
  go: { exts: ['go'], tool: 'gofmt', check: (f) => { const r = _run('gofmt', ['-e', '-l', f]); return r.status === 0 ? null : _first(r.stderr); } },
  c: { exts: ['c', 'h'], tool: 'gcc', check: (f) => { const r = _run('gcc', ['-fsyntax-only', '-w', f]); return r.status === 0 ? null : _first(r.stderr.split('\n').filter(l => /error/.test(l)).join('\n')); } },
  cpp: { exts: ['cpp', 'cc', 'cxx', 'hpp'], tool: 'g++', check: (f) => { const r = _run('g++', ['-fsyntax-only', '-w', f]); return r.status === 0 ? null : _first(r.stderr.split('\n').filter(l => /error/.test(l)).join('\n')); } },
  // §0.60.77 — more of the languages James builds in, each by its OWN parser, syntax only (nothing is run). `samples` are a
  // piece of valid code and a piece of broken code: selfTest() runs the tool on both, so "installed" is never taken for "can
  // tell broken from valid". `heuristic` = the tool has no syntax-only mode, so syntax errors are picked out of its output
  // and the rest (missing imports, unresolved symbols: the file's neighbours are not here) are ignored.
  php: { exts: ['php'], tool: 'php', check: (f) => { const r = _run('php', ['-l', f]); return r.status === 0 ? null : _first(String(r.stdout || '') + '\n' + String(r.stderr || '')); }, samples: { good: '<?php\necho 1;\n', bad: '<?php\nfunction f( {\n' } },
  rb: { exts: ['rb'], tool: 'ruby', check: (f) => { const r = _run('ruby', ['-c', f]); return r.status === 0 ? null : _first(r.stderr || r.stdout); }, samples: { good: 'def f\n  1\nend\n', bad: 'def f(\n' } },
  rs: { exts: ['rs'], tool: 'rustfmt', check: (f) => { const r = _run('rustfmt', ['--edition', '2021', '--emit', 'stdout', f]); return r.status === 0 ? null : _first(r.stderr); }, samples: { good: 'fn main() {}\n', bad: 'fn main( {\n' } },
  java: { exts: ['java'], tool: 'javac', heuristic: true, check: (f) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ck248-java-')); try { const r = _run('javac', ['-proc:none', '-nowarn', '-d', d, f]); if (r.status === 0) return null; const syn = String(r.stderr).split('\n').filter(l => /error:.*(expected|illegal start|unclosed|reached end of file|not a statement|orphaned|invalid method declaration|malformed|unterminated)/i.test(l)); return syn.length ? _first(syn.join('\n')) : null; } finally { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} } }, samples: { good: 'class A { void f() { int x = 1; } }\n', bad: 'class A { void f( { }\n' } },
  kt: { exts: ['kt', 'kts'], tool: 'kotlinc', heuristic: true, check: (f) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ck248-kt-')); try { const r = _run('kotlinc', ['-nowarn', '-d', d, f], { timeout: 120000 }); if (r.status === 0) return null; const syn = String(r.stderr).split('\n').filter(l => /error:.*(Expecting|Unexpected tokens|Syntax error|Missing|Unclosed)/i.test(l)); return syn.length ? _first(syn.join('\n')) : null; } finally { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} } }, samples: { good: 'fun f(): Int { return 1 }\n', bad: 'fun f( { \n' } },
  swift: { exts: ['swift'], tool: 'swiftc', check: (f) => { const r = _run('swiftc', ['-parse', f]); return r.status === 0 ? null : _first(String(r.stderr).split('\n').filter(l => /error:/.test(l)).join('\n') || r.stderr); }, samples: { good: 'func f() -> Int { return 1 }\n', bad: 'func f( { \n' } },
  lua: { exts: ['lua'], tool: 'luac', check: (f) => { const r = _run('luac', ['-p', f]); return r.status === 0 ? null : _first(r.stderr); }, samples: { good: 'local x = 1\n', bad: 'local x = = 1\n' } },
  toml: { exts: ['toml'], tool: 'python3', check: (f) => { const r = _run('python3', ['-I', '-c', 'import sys,tomllib; tomllib.load(open(sys.argv[1],"rb"))', f]); return r.status === 0 ? null : _first(String(r.stderr).split('\n').filter(l => /TOMLDecodeError|Error/.test(l)).join('\n') || r.stderr); }, samples: { good: 'a = 1\n', bad: 'a = = 1\n' } },
  xml: { exts: ['xml', 'svg', 'plist'], tool: 'python3', check: (f) => { const r = _run('python3', ['-I', '-c', 'import sys,xml.dom.minidom as m; m.parse(sys.argv[1])', f]); return r.status === 0 ? null : _first(String(r.stderr).split('\n').filter(l => /Error/.test(l)).join('\n') || r.stderr); }, samples: { good: '<a><b/></a>\n', bad: '<a><b></a>\n' } },
};
const BY_EXT = {}; for (const [lang, L] of Object.entries(LANGS)) for (const e of L.exts) BY_EXT[e] = lang;

function _files(base, max) {
  const out = [];
  const walk = (abs) => {
    if (out.length >= max) return;
    let list; try { list = fs.readdirSync(abs, { withFileTypes: true }); } catch (_) { return; }
    for (const d of list) {
      if (out.length >= max) return;
      if (d.isDirectory()) { if (!SKIP_DIRS.has(d.name) && !d.name.startsWith('.')) walk(path.join(abs, d.name)); continue; }
      const ext = (d.name.match(/\.([a-z0-9]+)$/i) || [, ''])[1].toLowerCase();
      if (BY_EXT[ext]) out.push(path.join(abs, d.name));
    }
  };
  walk(base);
  return out;
}

function run(c = {}, { root = NEXUS_ROOT } = {}) {
  const base = c.path ? path.resolve(root, c.path) : root;
  const max = Number(c.max) || 2000;
  const files = c.files ? [].concat(c.files).map(f => path.resolve(base, f)) : _files(base, max);
  if (!files.length) return { ok: false, verifiable: false, reason: `unverifiable: no source file of a known language under ${path.relative(NEXUS_ROOT, base) || '.'}` };
  const items = [], perLang = {}, skipped = new Set();
  for (const f of files) {
    const ext = (f.match(/\.([a-z0-9]+)$/i) || [, ''])[1].toLowerCase();
    const lang = BY_EXT[ext]; if (!lang) continue;
    const L = LANGS[lang];
    perLang[lang] = perLang[lang] || { checked: 0, failed: 0, skipped: 0 };
    if (L.tool && !has(L.tool)) { perLang[lang].skipped++; skipped.add(lang); continue; }
    let err = null; try { err = L.check(f); } catch (e) { err = `the ${L.tool || lang} check could not run: ${e.message}`; }
    perLang[lang].checked++;
    const rel = path.relative(base, f) || path.basename(f);
    const bn = path.basename(f).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (err) { perLang[lang].failed++; items.push({ file: rel, lang, error: String(err).split(path.dirname(f) + path.sep).join("").replace(new RegExp(`[^\\s('"\`]*${bn}`, 'g'), rel).slice(0, 300) }); }
  }
  for (const lang of skipped) items.push({ lang, skipped: `${LANGS[lang].tool} is not installed — ${perLang[lang].skipped} ${lang} file(s) not checked` });
  const failed = items.filter(i => i.error);
  const checked = Object.values(perLang).reduce((n, x) => n + x.checked, 0);
  const evidence = { check: ID, languages: perLang, files: files.length, ...(files.length >= max ? { capped: max } : {}) };
  if (failed.length) return { ok: false, verifiable: true, items, evidence, reason: `${ID}: ${failed.length} file(s) fail their language's own parser — ${failed.slice(0, 4).map(i => `${i.file} (${i.lang}): ${i.error}`).join('; ')}` };
  if (!checked) return { ok: false, verifiable: false, items, reason: `unverifiable: every file's tool is missing (${[...skipped].map(l => LANGS[l].tool).join(', ')})` };
  return { ok: true, verifiable: true, items, evidence };
}

// samples for the languages above this block (so every language can be self-tested the same way)
const SAMPLES = {
  js: { good: 'const a = 1;\n', bad: 'function f( {\n' },
  ts: { good: 'const a: number = 1;\n', bad: 'const a: number = ;\n' },
  py: { good: 'x = 1\n', bad: 'def f(:\n' },
  sh: { good: 'echo hi\n', bad: 'if then fi (\n' },
  json: { good: '{"a":1}\n', bad: '{"a":}\n' },
  yaml: { good: 'a: 1\n', bad: 'a: [1,\n' },
  go: { good: 'package main\nfunc main() {}\n', bad: 'package main\nfunc main( {\n' },
  c: { good: 'int main(void) { return 0; }\n', bad: 'int main( { \n' },
  cpp: { good: 'int main() { return 0; }\n', bad: 'int main( { \n' },
};
for (const [k, v] of Object.entries(SAMPLES)) if (LANGS[k] && !LANGS[k].samples) LANGS[k].samples = v;

const _TMP = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ck248-'));

/**
 * checkText(ext, text) -> { lang, tool, installed, ok, error, heuristic }
 *   ok null  = this language is not in the table, or its tool is not installed: NOT checked (never a pass)
 *   ok true  = its own parser accepted the text      ok false = it did not, `error` says where
 */
function checkText(ext, text) {
  const lang = BY_EXT[String(ext || '').toLowerCase().replace(/^\./, '')];
  if (!lang) return { lang: null, tool: null, installed: false, ok: null };
  const L = LANGS[lang];
  if (L.tool && !has(L.tool)) return { lang, tool: L.tool, installed: false, ok: null };
  const d = _TMP(); const f = path.join(d, `check.${String(ext).replace(/^\./, '').toLowerCase()}`);
  try {
    fs.writeFileSync(f, text == null ? '' : String(text));
    let err = null; try { err = L.check(f); } catch (e) { err = `the ${L.tool || lang} check could not run: ${e.message}`; }
    const clean = err ? String(err).split(d + path.sep).join('').replace(new RegExp(`[^\\s('"\`]*check\\.[a-z0-9]+`, 'g'), 'this file').slice(0, 300) : null;
    return { lang, tool: L.tool, installed: true, ok: !err, error: clean, heuristic: !!L.heuristic };
  } finally { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}

/** selfTest(lang) -> { lang, tool, installed, detects } — runs the tool on valid and on broken code. detects:true only when it passes one AND fails the other. */
function selfTest(lang) {
  const L = LANGS[lang]; if (!L) return { lang, installed: false, detects: null, why: 'unknown language' };
  const ext = L.exts[0];
  if (L.tool && !has(L.tool)) return { lang, tool: L.tool, installed: false, detects: null, why: `${L.tool} is not installed` };
  const g = checkText(ext, L.samples && L.samples.good), b = checkText(ext, L.samples && L.samples.bad);
  const detects = g.ok === true && b.ok === false;
  return { lang, tool: L.tool, installed: true, detects, why: detects ? null : (g.ok !== true ? `rejected valid code: ${g.error}` : 'accepted broken code') };
}

/** coverage() -> every language in the table, installed or not, and whether its tool can tell valid from broken */
function coverage() { return Object.keys(LANGS).map(selfTest); }

module.exports = { ID, LANGS, has, run, checkText, selfTest, coverage, BY_EXT };
