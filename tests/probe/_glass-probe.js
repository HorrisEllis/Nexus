'use strict';
/**
 * tests/probe/_glass-probe.js — what every real-page probe shares. 0.39.263.
 * The probes drive Clear Glass's own engine (clear-glass/src/driver/glass.js), not
 * Playwright. Output protocol, read by the suites that spawn them:
 *   one JSON line per case  {"case": name, "pass": bool, ...detail}
 *   a last line             {"summary": "passed/total"}
 *   exit 0 all pass · 1 a case failed · 3 no page engine here (the suite reports SKIPPED, never passed)
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const glass = require(path.join(ROOT, 'clear-glass', 'src', 'driver', 'glass.js'));

function start() {
  if (!glass.engine()) {
    console.log(JSON.stringify({ skip: "no page engine — install the root devDependencies (electron is Clear Glass's engine); nothing was proven" }));
    process.exit(3);
  }
  const results = [];
  const kase = (name, ok, detail = {}) => { results.push(!!ok); console.log(JSON.stringify({ case: name, pass: !!ok, ...detail })); };
  const done = () => { const n = results.filter(Boolean).length; console.log(JSON.stringify({ summary: `${n}/${results.length}` })); process.exit(n === results.length ? 0 : 1); };
  return { glass, case: kase, done, ROOT, read: (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8') };
}

/** extract(src, name) — a top-level function's source, by the same rule the python probes used */
function extract(src, name) {
  const re = new RegExp(`^([ \\t]*)(function ${name.replace(/[$]/g, '\\$')}\\([\\s\\S]*?\\n)\\1\\}\\n`, 'm');
  const m = re.exec(src);
  if (!m) { console.error(`could not extract ${name}() — the file changed shape; update this probe`); process.exit(1); }
  return m[2] + m[1] + '}';
}

module.exports = { start, extract, ROOT };
