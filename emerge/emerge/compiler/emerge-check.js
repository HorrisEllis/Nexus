'use strict';
// compiler/emerge-check.js — the spec compiler asks Emerge whether Emerge source compiles, through Emerge's command line, never its code.
// Nexus phase CIE8 slice a (docs/2026-11-06-cie-eg-build-phasemap.spec), his CIE_D7, 2026-11-07: "yeah move it, until we have something to
// slot in the gap it will leave" · "as long as its removed from emerge." Before this, emit-emerge.js and t2-gate.js required ../lang, Emerge's
// language internals, which would not survive the move to Idearium. Emerge is another system: it is reached the way Idearium's Emerge rung
// already reaches it (idearium/lib/emerge-rung.cjs): `node <emerge>/cli.js lang-check --source <src>`, which answers JSON { ok, stderr }.
//
//   available()        → true when Emerge's command line was found
//   compileError(src)  → null when src compiles, else the first error message (without its file:line:col prefix), as before
//
// Where Emerge is: $EMERGE_CLI, else ../cli.js (while this folder is still inside Emerge), else the first emerge/emerge/cli.js found walking up.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

let cliPath;
function cli() {
  if (cliPath !== undefined) return cliPath;
  const tries = [process.env.EMERGE_CLI, path.join(__dirname, '..', 'cli.js')];
  for (let d = __dirname; ; d = path.dirname(d)) {
    tries.push(path.join(d, 'emerge', 'emerge', 'cli.js'));
    if (path.dirname(d) === d) break;
  }
  cliPath = tries.find(p => p && fs.existsSync(p) && fs.existsSync(path.join(path.dirname(p), 'lib', 'lang.js'))) || null;   // Emerge's CLI and its lang commands
  return cliPath;
}

const cache = new Map();

function compileError(src) {
  if (cache.has(src)) return cache.get(src);
  const c = cli();
  if (!c) return null;
  let out;
  try {
    out = JSON.parse(execFileSync(process.execPath, [c, 'lang-check', '--source', src],
      { cwd: path.dirname(c), encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 60000, windowsHide: true }));
  } catch (e) {
    const msg = `Emerge's command line did not answer: ${String(e.message || e).split('\n')[0]}`;
    cache.set(src, msg);
    return msg;
  }
  const first = String(out.stderr || '').split('\n').find(l => l.trim()) || (out.ok ? '' : `exit ${out.code}`);
  const msg = out.ok ? null : first.replace(/^[^:\n]*:\d+:\d+:\s*(error|warning):\s*/, '');
  cache.set(src, msg);
  return msg;
}

module.exports = { available: () => !!cli(), compileError, cli };
