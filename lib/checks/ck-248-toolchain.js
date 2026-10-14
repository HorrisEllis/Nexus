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

module.exports = { ID, LANGS, has, run };
