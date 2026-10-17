'use strict';
// lib/boundary.js — the system holds only its own folder. James, 2026-10-17: "each system is soveriegn and self contained." ·
// "all system relevant files should stay with the system." Every relative require() in this system's own files is resolved;
// one that lands outside the folder is named, and the heartbeat reports it as a problem. Other systems are reached through
// their contract (routes, the CLI, handoffs), never by requiring their files. A module under modules/ is its own system and
// is checked by its own boundary; node_modules and data/ hold no code of the system's.
const fs = require('fs');
const path = require('path');

const SKIP = new Set(['node_modules', 'data', 'modules', 'input', 'processing', 'done', 'failed', 'output']);
const REQ = /(?:\b_?require|\bimport)\s*\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)|\bfrom\s+['"](\.{1,2}\/[^'"]+)['"]/g;

function _files(dir, out) {
  let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return out; }
  for (const e of ents) {
    if (e.name.startsWith('.') || SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) _files(p, out); else if (/\.(c|m)?js$/.test(e.name)) out.push(p);
  }
  return out;
}

/** outside(root) → [{ file, requires }] — every require that leaves this system's folder */
function outside(root) {
  const base = path.resolve(root);
  const out = [];
  for (const f of _files(base, [])) {
    let src = ''; try { src = fs.readFileSync(f, 'utf8'); } catch (_) { continue; }
    for (const m of src.matchAll(REQ)) {
      const to = path.resolve(path.dirname(f), m[1] || m[2]);
      if (to !== base && !to.startsWith(base + path.sep)) out.push({ file: path.relative(base, f).split(path.sep).join('/'), requires: m[1] || m[2] });
    }
  }
  return out;
}

module.exports = { outside };
