// scripts/wired-report.js — how much of Nexus is wired: every file reachable from what Nexus starts (requires, launches, script tags, files loaded by name).
// James, 2026-10-29: "Tell me, how much of a nexus that you could tell is actually fucking wired together?" Run: node scripts/wired-report.js [detail.json]
// A floor, not a verdict: HTTP routes between systems, and code built at run time, are not edges here.
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const SP = require(ROOT + '/lib/project-spine.js');
const all = cp.execSync('git ls-files', { cwd: ROOT, maxBuffer: 1 << 28 }).toString().split('\n').filter(Boolean);
const SKIP = /(^|\/)(_archive|node_modules|data|phases|graph)\/|^tests\/|\/test\/|\.test\.js$/;
const code = all.filter(p => /\.(c?js|mjs)$/.test(p) && !SKIP.test(p));
const html = all.filter(p => /\.html$/.test(p) && !SKIP.test(p));
const files = code.map(p => ({ path: p, content: fs.readFileSync(path.join(ROOT, p), 'utf8') }));
const spine = SP.scan({ files, project: 'nexus' });
const set = new Set(code);
const out = new Map(code.map(p => [p, new Set()]));
for (const w of spine.wires) if (w.toPath && out.has(w.fromPath)) out.get(w.fromPath).add(w.toPath);
// launches the require scan cannot see: spawn/fork/Worker/execFile/node --require of a literal path, and path.join(__dirname, '…x.js')
let launch = 0;
for (const f of files) {
  const dir = path.posix.dirname(f.path);
  const re = /(?:spawn|fork|execFile|Worker|preload|args\s*:\s*\[)[^;\n]{0,200}?['"`]((?:\.{1,2}\/|[\w-]+\/)[\w./-]+\.(?:c?js|mjs|html))['"`]|path\.(?:join|resolve)\(\s*__dirname\s*,\s*((?:['"][^'"]+['"]\s*,?\s*)+)\)/g;
  let m;
  while ((m = re.exec(f.content))) {
    let cands = [];
    if (m[1]) cands = [path.posix.normalize(path.posix.join(dir, m[1])), m[1]];
    else { const segs = [...m[2].matchAll(/['"]([^'"]+)['"]/g)].map(x => x[1]); cands = [path.posix.normalize(path.posix.join(dir, ...segs))]; }
    for (const c of cands) for (const t of [c, `${c}.js`, `${c}/index.js`]) if (set.has(t) || html.includes(t)) { out.get(f.path).add(t); launch++; }
  }
}
// html <script src> → js
const htmlOut = new Map();
for (const h of html) { const t = fs.readFileSync(path.join(ROOT, h), 'utf8'); const d = path.posix.dirname(h); const s = new Set();
  for (const m of t.matchAll(/<script[^>]+src=["']([^"':]+\.m?js)["']/g)) { const p = path.posix.normalize(path.posix.join(d, m[1])); if (set.has(p)) s.add(p); }
  htmlOut.set(h, s); }
const roots = ['orchestrator/orchestrator.js', 'lib/nexus/autopilot.js', 'cortex/boot.js', 'guardian/server.js', 'idearium/api/index.js', 'architect/service.js',
  'diagnostic/nexus-diagnostic.js', 'intelligence/server.js', 'intelligence/consumer.js', 'ollama/server.js', 'versionium/server.js', 'copilot/server.js', 'loom/server.js',
  'clear-glass/src/main/index.js', 'idearium/cli/index.js', 'lib/cli/nexus.js', 'cos/cli/index.js', 'cos/app/desktop/main.js', 'cos/kernel.js'].filter(r => set.has(r));
const seen = new Set(); const q = [...roots];
const visitHtml = new Set();
while (q.length) { const p = q.shift(); if (seen.has(p)) continue; seen.add(p);
  for (const n of out.get(p) || []) { if (n.endsWith('.html')) { if (!visitHtml.has(n)) { visitHtml.add(n); for (const j of htmlOut.get(n) || []) q.push(j); } } else q.push(n); } }
// html files a running server serves: count every html under a served ui folder as reachable roots too (static serving is not a require)
for (const h of html) if (/^(idearium\/ui|clear-glass\/renderer|lib\/ui|copilot\/ui|cos\/.*ui)/.test(h)) for (const j of htmlOut.get(h) || []) if (!seen.has(j)) { const st = [j]; while (st.length) { const p = st.pop(); if (seen.has(p)) continue; seen.add(p); for (const n of out.get(p) || []) if (!n.endsWith('.html')) st.push(n); } }
// files loaded by name (a userscript read and injected, a script named in a manifest): an unreached file whose name appears quoted in a reached
// file or in a tracked yaml/json beside it
let byName = 0;
const quoted = new Set(); for (const p of seen) { const c = files.find(f => f.path === p).content; for (const m of c.matchAll(/['"`]([\w.-]+\.(?:user\.)?js)['"`]/g)) quoted.add(m[1]); }
for (const y of all.filter(x => /\.(ya?ml|json)$/.test(x) && !SKIP.test(x) && !/package-lock/.test(x))) { try { const t = fs.readFileSync(path.join(ROOT, y), 'utf8'); if (t.length < 400000) for (const m of t.matchAll(/([\w.-]+\.(?:user\.)?js)/g)) quoted.add(m[1]); } catch (_) {} }
for (const p of code) if (!seen.has(p) && quoted.has(p.split('/').pop())) { const st = [p]; while (st.length) { const x = st.pop(); if (seen.has(x)) continue; seen.add(x); byName++; for (const n of out.get(x) || []) if (!n.endsWith('.html')) st.push(n); } }
console.log('reached by name (injected / manifest):', byName);
const inbound = new Map(code.map(p => [p, 0])); for (const [, s] of out) for (const n of s) if (inbound.has(n)) inbound.set(n, inbound.get(n) + 1);
const sys = (p) => p.split('/')[0];
const by = {};
for (const p of code) { const k = sys(p); by[k] = by[k] || { files: 0, reached: 0, isolated: 0, lines: 0, reachedLines: 0 };
  const L = files.find(f => f.path === p).content.split('\n').length; by[k].files++; by[k].lines += L;
  if (seen.has(p)) { by[k].reached++; by[k].reachedLines += L; } if (!inbound.get(p) && !(out.get(p) || new Set()).size) by[k].isolated++; }
const tot = Object.values(by).reduce((a, b) => ({ files: a.files + b.files, reached: a.reached + b.reached, isolated: a.isolated + b.isolated, lines: a.lines + b.lines, reachedLines: a.reachedLines + b.reachedLines }), { files: 0, reached: 0, isolated: 0, lines: 0, reachedLines: 0 });
console.log(JSON.stringify({ roots: roots.length, wires: spine.wires.length, unknown: spine.unknown, launchEdges: launch, total: tot, pctFiles: Math.round(100 * tot.reached / tot.files), pctLines: Math.round(100 * tot.reachedLines / tot.lines) }));
for (const [k, v] of Object.entries(by).sort((a, b) => b[1].lines - a[1].lines)) console.log(k.padEnd(14), String(v.files).padStart(5), 'files', String(v.reached).padStart(5), 'reached', `${Math.round(100 * v.reached / v.files)}%`.padStart(5), ' lines', String(v.lines).padStart(7), `${Math.round(100 * v.reachedLines / v.lines)}%`.padStart(5), ' isolated', v.isolated);
fs.writeFileSync(process.argv[2] || '/dev/null', JSON.stringify({ unreached: code.filter(p => !seen.has(p)), isolated: code.filter(p => !inbound.get(p) && !(out.get(p) || new Set()).size), unknownWires: spine.wires.filter(w => w.evidence === 'unknown').map(w => `${w.fromPath}:${w.line} ${w.spec}`) }, null, 1));
