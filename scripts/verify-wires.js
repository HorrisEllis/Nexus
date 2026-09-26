'use strict';
/**
 * scripts/verify-wires.js — Wire Integrity Checker
 * UUID: nexus-verify-wires-v1-0000-2026-0706-jamesbrooks-001
 *
 * §17.7-DRIVEN — the actual missing primitive behind five separate
 * "looks-wired-but-isn't" bugs found this session (bridge/copilot
 * double-wrap, Guardian's dropzone, Architect's heal-loop shape
 * mismatch, Idearium's queued-chunk dead end, orchestrator's missing
 * heartbeat/bus-stats routes). Every one of those was a declared wire
 * — a hook, an endpoint reference, an event name — that nothing ever
 * checked against what the receiving system actually implements.
 *
 * This uses hooks/index.js's real 82-hook registry (not invented data)
 * and checks, for each hook with a real config.path, whether the target
 * system's real source file actually contains that path as a literal
 * route match. A "not found" result is a CANDIDATE, not a confirmed
 * bug — some systems route by URL-segment array (orchestrator.js does
 * this; a path like /api/bus/stats never appears as one literal string
 * there even though the route is real) rather than one literal string.
 * Every candidate this script surfaces gets manually confirmed before
 * being reported as broken, same discipline as every other finding
 * this session — a heuristic scan generates leads, it doesn't replace
 * verification.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const SURFACE_FILES = {
  guardian:     ['guardian/server.js'],
  cortex:       ['cortex/boot.js'],
  orchestrator: ['orchestrator/orchestrator.js'],
  idearium:     ['idearium/api/index.js'],
  copilot:      ['copilot/server.js'],
  architect:    ['architect/service.js'],
  ollama:       ['ollama/server.js'],
  // §RETIRED 2026-09-06 — bridge entry removed, files archived.
  emerge:       ['emerge-kernel.js', 'emerge-codegen-v2.js', 'emerge-ide.js'],
};

function fileExists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

function stripComments(src) {
  // §FIXED 2026-07-09 — this scan matched route strings that appeared only in
  // COMMENTS. /api/warp/map "passed" solely because a comment above the handler
  // mentioned it; the literal never appears in code, because the route is
  // segment-matched. A checker that reads its author's prose instead of the
  // program is worse than no checker.
  //
  // §AND THEN I BROKE IT — the obvious `/\*[\s\S]*?\*\//g` matched a `/*`
  // sequence inside a REGEX LITERAL in copilot/server.js and swallowed
  // everything to the next `*/`: 30,444 of 48,908 characters, 62% of the
  // file. It then reported 14 live routes as missing. Measured, not guessed.
  // Only strip comments that BEGIN a line — the JSDoc and `//` banners this
  // codebase actually uses — and never touch anything mid-expression, where
  // regex literals and division live.
  return src
    .replace(/^[ \t]*\/\*[\s\S]*?\*\/[ \t]*$/gm, '')  // block comments on their own lines
    .replace(/^[ \t]*\/\/.*$/gm, '')                  // line comments on their own lines
    .replace(/^[ \t]*\*.*$/gm, '');                   // JSDoc continuation lines
}

function segmentRouted(code, routePath) {
  // §ADDED 2026-07-09 — orchestrator matches routes by segment, not literal:
  //   `sub==='warp' && seg[2]==='map'`   serves /api/warp/map
  //   `sub==='manifest'`                 serves /api/manifest
  // The literal string is nowhere in the file, so a substring search declares
  // a live, verified route "missing". Reconstruct the check from the segments.
  const parts = routePath.replace(/^\//, '').split('/').filter(Boolean);
  if (parts[0] !== 'api' || parts.length < 2) return false;
  const first = parts[1];
  if (!new RegExp(`sub\\s*===?\\s*['"]${first}['"]`).test(code)) return false;
  for (let i = 2; i < parts.length; i++) {
    if (!new RegExp(`seg\\[${i}\\]\\s*===?\\s*['"]${parts[i]}['"]`).test(code)) return false;
  }
  return true;
}

function prefixActionRouted(code, routePath) {
  // §ADDED 2026-07-09 — architect serves POST /api/blueprint/scan via
  //   `path_.startsWith('/api/blueprint')` + `const action = seg[2]` +
  //   `action === 'scan'`
  // The full literal appears nowhere. The scanner called a live, verified
  // route a missing wire. This is the third distinct routing style in the
  // codebase (literal, segment, prefix+action) — a substring search was
  // never going to be sufficient, and pretending otherwise produced false
  // reports in BOTH directions.
  const parts = routePath.replace(/^\//, '').split('/').filter(Boolean);
  if (parts.length < 2) return false;
  const prefix = '/' + parts.slice(0, parts.length - 1).join('/');
  const tail = parts[parts.length - 1];
  if (!new RegExp(`startsWith\\(\\s*['"]${prefix.replace(/\//g, '\\/')}['"]`).test(code)) return false;
  return new RegExp(`(action|sub2|seg\\[\\d\\])\\s*===?\\s*['"]${tail}['"]`).test(code);
}

function containsPath(rel, routePath, surface) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) return null;
  const content = stripComments(fs.readFileSync(full, 'utf8'));
  // Some hook files store config.path with a redundant surface prefix
  // (e.g. "cortex/api/snapshots/create" instead of "/api/snapshots/create")
  // — a real inconsistency in the registry data itself, not something to
  // silently work around without noting it. Check both forms.
  const stripped = routePath.startsWith(surface + '/') ? routePath.slice(surface.length) : routePath;
  if (content.includes(routePath) || content.includes(stripped)) return true;

  // §ADDED 2026-07-09 — path-param routes. `/api/jobs/:id` is served by
  // matching the PREFIX and slicing the id off the end; the literal ':id'
  // appears nowhere in the source. Checking for it reported two live ollama
  // routes as missing wires. Match the prefix before the first param instead.
  const paramIdx = stripped.indexOf('/:');
  if (paramIdx > 0) {
    const prefix = stripped.slice(0, paramIdx);
    if (content.includes(prefix)) return true;
  }

  return segmentRouted(content, stripped) || segmentRouted(content, routePath)
      || prefixActionRouted(content, stripped) || prefixActionRouted(content, routePath);
}

/**
 * §REVERSE SCAN — added 2026-07-09. The original tool only proved one
 * implication: "every declared hook has code." It could not prove the
 * converse: "every implemented route has a declaration." Those are
 * different properties, and the gap hid six real endpoints built this
 * very session with no hook entry (§5.1 requires one on everything):
 * /api/copilot/prompt, /api/jobs/tools, /api/snapshot/rollback,
 * /api/bus/stats, /api/push, /api/recall. A one-way checker is blind in
 * exactly the direction its author is blind.
 *
 * Heuristic, and honest about it: extracts route string literals from the
 * real route-matching patterns these servers actually use. It will miss
 * segment-routed paths (orchestrator's `sub==='bus' && seg[2]==='stats'`)
 * — the same blind spot the forward scan has, noted rather than hidden.
 * Output is CANDIDATES for confirmation, never a verdict.
 */
function reverseScan() {
  const h = require(path.join(ROOT, 'hooks/index.js'));
  const declared = new Set(h.allHooks().map(x => x.config?.path).filter(Boolean));

  // Real matching styles found across these servers.
  const PATTERNS = [
    /p === '([^']+)'/g,
    /url\.pathname === '([^']+)'/g,
    /url\.pathname==='([^']+)'/g,
  ];

  const orphans = [];
  for (const [surface, files] of Object.entries(SURFACE_FILES)) {
    for (const rel of files.filter(fileExists)) {
      const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      const found = new Set();
      for (const re of PATTERNS) {
        let m;
        while ((m = re.exec(src)) !== null) {
          // §FIXED 2026-07-09 — '/jobs' and '/jobs/' are matched by the SAME
          // conditional (`url.pathname==='/jobs'||url.pathname==='/jobs/'`).
          // Counting both inflated the orphan count and would have pushed two
          // hook declarations for one handler into the registry. A trailing
          // slash is not a route; normalize before comparing.
          if (m[1].startsWith('/')) {
            const norm = m[1].length > 1 ? m[1].replace(/\/+$/, '') : m[1];
            found.add(norm);
          }
        }
      }
      for (const route of found) {
        if (!declared.has(route)) orphans.push({ surface, route, file: rel });
      }
    }
  }

  console.log(`\n=== REVERSE SCAN: ${orphans.length} implemented route(s) with NO declared hook (§5.1) ===\n`);
  const bySurface = {};
  for (const o of orphans) (bySurface[o.surface] ||= []).push(o.route);
  for (const [surface, routes] of Object.entries(bySurface)) {
    console.log(`${surface} (${routes.length}):`);
    for (const r of routes.sort()) console.log(`   ${r}`);
  }
  if (!orphans.length) console.log('  none — every implemented route is declared.');
  return orphans;
}

function main() {
  const h = require(path.join(ROOT, 'hooks/index.js'));
  // §FIXED 2026-07-09 — the forward scan checked EVERY hook for an
  // implementation, including ones explicitly marked `status: "planned"`.
  // A planned hook declares an intent, not an existence claim (§1.1);
  // reporting it as a missing wire buries the real violations in noise.
  // emerge's six hooks are the case in point: emerge has no HTTP server and
  // is not supervised by autopilot, so its routes cannot exist yet — that is
  // a roadmap entry, not a lie. Only `active` hooks assert "this exists".
  const all = h.allHooks().filter(x => x.config?.path && SURFACE_FILES[x.to?.surface] && (x.status || 'active') === 'active');

  console.log(`Checking ${all.length} declared hooks with a real config.path against a real target surface...\n`);

  const candidates = [];
  for (const hook of all) {
    const surface = hook.to.surface;
    const files = SURFACE_FILES[surface];
    const existingFiles = files.filter(fileExists);
    if (!existingFiles.length) {
      candidates.push({ hook: hook.name, surface, path: hook.config.path, reason: 'target file(s) not found', files });
      continue;
    }
    const found = existingFiles.some(f => containsPath(f, hook.config.path, surface));
    if (!found) {
      candidates.push({ hook: hook.name, surface, path: hook.config.path, reason: 'path string not found in target file(s)', files: existingFiles });
    }
  }

  console.log(`=== ${candidates.length} CANDIDATES (need manual confirmation, not confirmed bugs) ===\n`);
  for (const c of candidates) {
    console.log(`${c.hook}  ->  ${c.surface}${c.path}`);
    console.log(`   reason: ${c.reason}  |  checked: ${c.files.join(', ')}`);
  }
}

main();
reverseScan();
