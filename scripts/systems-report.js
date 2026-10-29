// scripts/systems-report.js — per system: is each component wired, registered in Loom with wires, owned by a spec module, reachable by a
// person (a screen) and an agent (a command), tested, and what is still open. Feeds docs/NEXUS-SYSTEMS-FOR-CODING.md.
// James, 2026-10-29: "Maybe make a full document of each system and what it needs to get nexus coding." · "Each component needs to be wired
// to the module component, and ui". Run: node scripts/systems-report.js [out.json]
// A measurement, not a verdict: Loom's registry is the last one written to disk (rebuilt at boot); HTTP callers are matched by path shape.
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const git = (a) => cp.execSync(`git ${a}`, { cwd: ROOT, maxBuffer: 1 << 28 }).toString().split('\n').filter(Boolean);
const read = (p) => { try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch (_) { return ''; } };
const SKIP = /(^|\/)(_archive|node_modules|data|phases|graph)\/|^tests\/|\/test\/|\.test\.js$/;
const all = git('ls-files');
const code = all.filter(p => /\.(c?js|mjs)$/.test(p) && !SKIP.test(p));
const SYSTEMS = ['idearium', 'clear-glass', 'guardian', 'copilot', 'ollama', 'cortex', 'loom', 'versionium', 'orchestrator', 'cos', 'intelligence', 'architect', 'diagnostic', 'lib'];
const sysOf = (p) => SYSTEMS.find(s => p.startsWith(`${s}/`)) || null;

// 1) wired — scripts/wired-report.js's own reachability
const tmp = path.join(require('os').tmpdir(), `wired-${process.pid}.json`);
cp.execFileSync(process.execPath, [path.join(__dirname, 'wired-report.js'), tmp], { cwd: ROOT, stdio: 'ignore', maxBuffer: 1 << 28 });
const unreached = new Set(JSON.parse(fs.readFileSync(tmp, 'utf8')).unreached); fs.unlinkSync(tmp);

// 2) Loom — a component per file, and whether any wire touches it
let reg = null; try { reg = JSON.parse(read('loom/data/registry.json')); } catch (_) {}
const loomComp = new Set(), loomWired = new Set();
if (reg) {
  const byId = {}; for (const c of Object.values(reg.component || {})) if (c && c.name) { loomComp.add(c.name); byId[c.id] = c.name; }
  const hookComp = {}; for (const h of Object.values(reg.hook || {})) hookComp[h.id] = h.component_id;
  for (const w of Object.values(reg.wire || {})) for (const hk of [w.from_hook_id, w.to_hook_id]) { const n = byId[hookComp[hk]]; if (n) loomWired.add(n); }
}

// 3) spec modules — every `path:` a spec's module names
const specPaths = new Set();
for (const s of all.filter(p => /\.spec$/.test(p) && !/-phasemap\.spec$/.test(p) && !/(^|\/)(_archive|data)\//.test(p))) for (const m of read(s).matchAll(/^\s+path:\s*["']?([\w./-]+\.(?:c?js|mjs))/gm)) specPaths.add(m[1]);

// 4) a person and an agent — Idearium's routes, called by a screen (its UI, Clear Glass's renderer) and by a command row
const api = read('idearium/api/index.js');
const routes = [...api.matchAll(/\[\s*'(GET|POST|PUT|PATCH|DELETE)'\s*,\s*\[([^\]]*)\]\s*,\s*'([^']+)'\s*\]/g)].map(m => ({ method: m[1], segs: m[2].split(',').map(s => s.trim().replace(/^'|'$/g, '')), action: m[3] }));
const callsIn = (files) => { const out = []; for (const f of files) for (const m of read(f).matchAll(/['"`](\/api\/[^'"`?\s]*)/g)) out.push(m[1].replace(/\$\{[^}]*\}/g, ':x').split('/').filter(Boolean)); return out; };
const uiCalls = callsIn(all.filter(p => /^(idearium\/ui\/|clear-glass\/renderer\/)/.test(p) && /\.(js|html)$/.test(p)));
const cmdCalls = callsIn(['idearium/cli/route-commands.js']);
const hit = (r, calls) => calls.some(c => c.length === r.segs.length && r.segs.every((s, i) => s.startsWith(':') || c[i] === ':x' || c[i] === s || c[i].startsWith(':')));
const routeRows = routes.map(r => ({ ...r, ui: hit(r, uiCalls), cmd: hit(r, cmdCalls) }));

// 5) tests — test files that require a file of the system; 6) open phases — phases not done whose files are in the system
const tests = git('ls-files tests').filter(p => /\.js$/.test(p)).map(p => read(p));
const PP = require(path.join(ROOT, 'lib/phasemap-parse.js'));
const open = {};
for (const m of all.filter(p => /-phasemap\.spec$/.test(p) && !/(^|\/)(_archive|data)\//.test(p))) {
  const t = read(m); let ph = []; try { ph = PP.parsePhasemapText(t, path.basename(m)); } catch (_) {}
  for (const p of ph) {
    if (p.kind === 'decision' || p.kind === 'finding' || /done|complete|built|superseded|retired/i.test(String(p.status || ''))) continue;
    const blk = t.split('\n').slice(Math.max(0, (p.line || 1) - 1), (p.line || 1) + 30).join('\n');
    const f = /files:\s*\[([^\]]*)\]/.exec(blk); const s = f ? sysOf(f[1].split(',')[0].trim()) : null;
    if (s) (open[s] = open[s] || []).push(`${p.id} (${path.basename(m)})`);
  }
}

const out = {};
for (const s of SYSTEMS) {
  const files = code.filter(p => sysOf(p) === s); if (!files.length) continue;
  const pct = (n) => Math.round((100 * n) / files.length);
  const own = (f) => files.filter(f).length;
  const rr = s === 'idearium' ? routeRows : null;
  out[s] = {
    files: files.length,
    wired: pct(own(p => !unreached.has(p))),
    loomComponent: pct(own(p => loomComp.has(p))),
    loomWired: pct(own(p => loomWired.has(p))),
    specModule: pct(own(p => specPaths.has(p))),
    tested: pct(own(p => { const b = p.split('/').pop(); return tests.some(t => t.includes(p) || t.includes(`/${b}`)); })),
    openPhases: (open[s] || []).length,
    openSample: (open[s] || []).slice(0, 6),
    ...(rr ? { routes: rr.length, routesWithScreen: rr.filter(r => r.ui).length, routesWithCommand: rr.filter(r => r.cmd).length,
      routesWithNeither: rr.filter(r => !r.ui && !r.cmd).map(r => `${r.method} /${r.segs.join('/')}`) } : {}),
  };
}
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
console.log('system        files wired loom loom+wires spec tested open-phases');
for (const [s, v] of Object.entries(out)) console.log(`${s.padEnd(13)} ${String(v.files).padStart(5)} ${String(v.wired).padStart(4)}% ${String(v.loomComponent).padStart(3)}% ${String(v.loomWired).padStart(6)}%   ${String(v.specModule).padStart(3)}% ${String(v.tested).padStart(4)}%  ${v.openPhases}`);
if (out.idearium) console.log(`idearium routes ${out.idearium.routes}: with a screen ${out.idearium.routesWithScreen}, with a command ${out.idearium.routesWithCommand}, with neither ${out.idearium.routesWithNeither.length}`);
