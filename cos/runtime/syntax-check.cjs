'use strict';
/**
 * cos/runtime/syntax-check.cjs — parse every file given on stdin (JSON array of
 * absolute paths) WITHOUT running any of it, and print one JSON result.
 * UUID: cos-runtime-syntax-check-v1-0000-2026-0926-001
 *
 * Run as ONE child (node --experimental-vm-modules) for the whole set, instead
 * of one `node --check` per file (the import pipeline's measured cost: ~70 ms a
 * file, 126 s for Nexus core). CommonJS is compiled with vm.Script; a file that
 * is ESM (by extension, by the nearest package.json "type", or because it uses
 * import/export) is compiled with vm.SourceTextModule, which parses the module
 * without linking or evaluating it. Compilation executes nothing.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const pkgType = new Map();
function typeFor(file) {
  let dir = path.dirname(file);
  const seen = [];
  while (true) {
    if (pkgType.has(dir)) { const t = pkgType.get(dir); for (const d of seen) pkgType.set(d, t); return t; }
    seen.push(dir);
    const p = path.join(dir, 'package.json');
    if (fs.existsSync(p)) {
      let t = 'commonjs';
      try { t = JSON.parse(fs.readFileSync(p, 'utf8')).type === 'module' ? 'module' : 'commonjs'; } catch (_) {}
      for (const d of seen) pkgType.set(d, t);
      return t;
    }
    const up = path.dirname(dir);
    if (up === dir) { for (const d of seen) pkgType.set(d, 'commonjs'); return 'commonjs'; }
    dir = up;
  }
}

function checkOne(file) {
  let src;
  try { src = fs.readFileSync(file, 'utf8'); } catch (e) { return { file, ok: false, error: e.message }; }
  if (src.startsWith('#!')) src = '//' + src.slice(2);
  const ext = path.extname(file);
  const esm = ext === '.mjs' || (ext !== '.cjs' && typeFor(file) === 'module');
  const asModule = () => { new vm.SourceTextModule(src, { identifier: file }); return { file, ok: true, as: 'module' }; };
  try {
    if (esm) return asModule();
    new vm.Script(`(function (exports, require, module, __filename, __dirname) {${src}\n})`, { filename: file });
    return { file, ok: true, as: 'commonjs' };
  } catch (e) {
    // a .js file under a commonjs package that is really ESM (Node's own
    // syntax detection does the same retry)
    if (!esm && /import statement|export|Cannot use import|Unexpected token 'export'/.test(e.message)) {
      try { return asModule(); } catch (e2) { return { file, ok: false, error: `${e2.message}`, line: _line(e2) }; }
    }
    return { file, ok: false, error: e.message, line: _line(e) };
  }
}
function _line(e) {
  const m = String(e.stack || '').match(/:(\d+)\n/);
  return m ? Number(m[1]) : null;
}

let input = '';
process.stdin.on('data', (c) => { input += c; });
process.stdin.on('end', () => {
  let files = [];
  try { files = JSON.parse(input); } catch (_) {}
  const results = files.map(checkOne);
  process.stdout.write(JSON.stringify({ checked: results.length, failed: results.filter(r => !r.ok).length, results }));
});
