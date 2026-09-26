#!/usr/bin/env node
'use strict';
/**
 * scripts/precommit-check.js — mechanical enforcement of CLAUDE.md's rules.
 * Install as a git hook:  ln -sf ../../scripts/precommit-check.js .git/hooks/pre-commit
 * (or run manually: node scripts/precommit-check.js)
 *
 * It does NOT replace judgment — it catches the three failures that have
 * actually happened: committing data/, adding a component with no registry
 * wire, and authoring a spec that never gets registered.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
// §BUGFIX 2026-08-08 — path.resolve(__dirname, '..') assumed this file is
// where its own header comment says to install it (a SYMLINK at
// .git/hooks/pre-commit -> ../../scripts/precommit-check.js), so __dirname
// would resolve to scripts/ either way. It was installed as a plain COPY
// instead — __dirname resolves to .git/hooks, so ROOT became .git itself.
// That's silent when run manually (git diff --cached still finds the repo
// by walking up from a bad cwd), but git's own hook invocation sets
// GIT_INDEX_FILE as a path RELATIVE to the intended repo root — resolved
// against the wrong ROOT here, it pointed at a nonexistent .git/.git/index,
// and the check fell back to stale/wrong staged-file data. Found by direct
// comparison: `git diff --cached --name-only` run manually was clean; the
// exact same command inside this hook, invoked BY git commit, was not.
// `git rev-parse --show-toplevel` is correct regardless of whether this
// file is a symlink, a copy, or moved again — it asks git, not the
// filesystem, where the repo root is.
const ROOT = execSync('git rev-parse --show-toplevel').toString().trim();

function staged() {
  // §BUGFIX 2026-08-24 — this used to be `--name-only`, which lists a path
  // for ANY staged change including pure deletions. That made every rule
  // below fire on files being REMOVED, not added: untracking a data/ file
  // (git rm --cached, exactly what CLAUDE.md's rule asks for) tripped the
  // same "data/ staged" block a genuine violation would, because the gate
  // couldn't tell "this state is leaving the index" from "this state is
  // entering it." Same problem would hit the loom-wiring rule below —
  // deleting a lib/*.js file doesn't need a registry wire, it needs the
  // opposite. Using --name-status and dropping 'D' rows fixes both at the
  // source: `staged()` now means "files whose committed content will
  // exist after this commit," which is what every rule downstream
  // actually assumes. Renames (R###) keep their post-rename path only.
  try {
    return execSync('git diff --cached --name-status', { cwd: ROOT }).toString().trim().split('\n').filter(Boolean)
      .map(line => line.split('\t'))
      .filter(parts => parts[0] !== 'D')
      .map(parts => parts[parts.length - 1]); // A/M: [status, file]; R###: [status, old, new]
  } catch { return []; }
}

const files = staged();
const errors = [];
const warnings = [];

// RULE: never commit data/** (§2.2 — state, not code). HARD BLOCK.
for (const f of files) {
  if (/^data\//.test(f) || /\/data\//.test(f)) errors.push(`data/ staged: ${f} — state is never committed`);
}

// RULE: a new lib/ or system component should be in a loom map WITH wires.
const loomMaps = fs.existsSync(path.join(ROOT, 'loom/maps'))
  ? fs.readdirSync(path.join(ROOT, 'loom/maps')).map(f => fs.readFileSync(path.join(ROOT, 'loom/maps', f), 'utf8')).join('\n')
  : '';
for (const f of files) {
  if (!/^(lib|copilot|cortex|guardian|bridge)\/.*\.js$/.test(f)) continue;
  if (/test|\.test\.|maps\//.test(f)) continue;
  // is this file referenced in any loom map?
  const base = f.replace(/\.js$/, '');
  if (loomMaps && !loomMaps.includes(f) && !loomMaps.includes(base)) {
    warnings.push(`${f} is not referenced in any loom/maps/*.js — component registry may be missing its wires (CLAUDE.md rule 3)`);
  }
}

// RULE: a new .spec should be registered in docs/SPEC-REGISTRY.spec (§6.3).
// §2026-09-02 — converted from .md to .spec (James: "seems stupid to have
// it a md"). Both real consumers here and in loom/scanners/spec-map.js do
// a plain substring match, not markdown-table parsing, so this rename is
// the only change needed — checked directly before converting.
const specReg = fs.existsSync(path.join(ROOT, 'docs/SPEC-REGISTRY.spec'))
  ? fs.readFileSync(path.join(ROOT, 'docs/SPEC-REGISTRY.spec'), 'utf8') : '';
for (const f of files) {
  if (!/\.spec$/.test(f)) continue;
  const base = path.basename(f);
  if (specReg && !specReg.includes(base) && !specReg.includes(f)) {
    warnings.push(`${f} is not in docs/SPEC-REGISTRY.spec — register it (CLAUDE.md rule 4 / §6.3)`);
  }
}

// RULE: §5.4 — versions persist across the entire project. Every known
// per-system version literal must match lib/version.js's services registry
// (the file every "canonical: lib/version.js — §5.4" comment in this repo
// points to). Runs on EVERY commit, not just ones touching these files —
// drift is a property of the whole tree at any moment, not just of a diff,
// and the whole point of enforcing this is that it can't come back via an
// unrelated commit either. HARD BLOCK: §5.4's own text calls drift "a bug,
// not an oversight," the same severity as the data/ rule above.
//
// Found 2026-08-08 while running buildNexusModel() live and checking its
// output against reality: loom/registry-components.js had drifted from
// lib/version.js (1.2.0 vs 1.3.0). A wider sweep of every other tracked
// system found four more (bridge, cortex, guardian, emerge) plus two
// hardcoded literals in orchestrator.js that had drifted from an import
// already sitting in scope for exactly this reason. All fixed same session;
// this block is what stops it happening again silently.
const VERSION_SOURCES = [
  { system: 'bridge',       file: 'bridge/registry-components.js',       re: /const V\s*=\s*'([\d.]+[\w.-]*)'/ },
  { system: 'cortex',       file: 'cortex/registry-components.js',       re: /const V\s*=\s*'([\d.]+[\w.-]*)'/ },
  { system: 'guardian',     file: 'guardian/registry-components.js',     re: /const V\s*=\s*'([\d.]+[\w.-]*)'/ },
  { system: 'idearium',     file: 'idearium/index.js',                   re: /export const VERSION\s*=\s*'([\d.]+[\w.-]*)'/ },
  { system: 'architect',    file: 'architect/registry-components.js',    re: /const V\s*=\s*'([\d.]+[\w.-]*)'/ },
  { system: 'emerge',       file: 'emerge/registry-components.js',       re: /const V\s*=\s*'([\d.]+[\w.-]*)'/ },
  { system: 'eravos',       file: 'eravos/server.js',                    re: /const VERSION\s*=\s*'([\d.]+[\w.-]*)'/ },
  { system: 'ollama-bridge', file: 'ollama/server.js',                   re: /const VERSION\s*=\s*'([\d.]+[\w.-]*)'/ },
  { system: 'clear-glass',  file: 'clear-glass/registry-components.js',  re: /const V\s*=\s*'([\d.]+[\w.-]*)'/ },
  { system: 'loom',         file: 'loom/registry-components.js',         re: /const V\s*=\s*'([\d.]+[\w.-]*)'/ },
];
try {
  const canonical = require(path.join(ROOT, 'lib/version.js')).services || {};
  for (const src of VERSION_SOURCES) {
    const full = path.join(ROOT, src.file);
    if (!fs.existsSync(full)) continue;   // file moved/removed — not this check's job to flag
    const content = fs.readFileSync(full, 'utf8');
    const m = content.match(src.re);
    if (!m) continue;   // pattern not found — file restructured; not a drift claim without evidence
    const declared = m[1];
    const expected = canonical[src.system];
    if (expected && declared !== expected) {
      errors.push(`§5.4 version drift: ${src.file} declares ${declared}, lib/version.js's services.${src.system} says ${expected} — one of them is wrong, fix before committing`);
    }
  }
} catch (e) {
  warnings.push(`§5.4 version-drift check could not run: ${e.message}`);
}

// RULE: §5.4 spec-version drift, the OTHER half of it. The block above
// checks hardcoded per-file version literals (registry-components.js
// etc.) against lib/version.js. This checks the OTHER real version
// source — each system's own <system>/spec/<system>.spec `version:`
// field — against the exact same lib/version.js. These were previously
// two unrelated mechanisms: orchestrator/lib/spec-drift.js already
// existed, already ran on every boot, already opened a real gap on
// drift (confirmed live: 8 systems drifted — orchestrator, cortex,
// guardian, idearium, emerge, diagnostic, forge, spec-drift itself, all
// found and fixed 2026-08-27) — but a SOFT boot-time gap never blocks
// anything, so nothing stopped the drift from being committed in the
// first place. James: "fix the versioning. have it enforced in the
// git." Reused, not reimplemented — this calls the real, existing
// drift.check(), same as orchestrator's own boot phase does, so there
// is exactly one drift-detection algorithm, never two that could
// disagree.
//
// Same whole-tree philosophy as the block above: drift is a property of
// the current state of the tree, not of what's staged in this diff, so
// this runs on every commit regardless of which files changed. HARD
// BLOCK, same severity — a spec that lies about the code's real version
// is the same class of problem §5.4 already treats as non-negotiable.
//
// Missing specs (11 real modules — ollama-bridge, clear-glass, loom,
// gap-finder, divergence-watcher, macro-compiler, grammar-fallback,
// mutation-contract, open-loop-taxonomy, loop-topology, gap-loop — none
// have ever had a .spec) are a separate, pre-existing gap from drift
// itself and deliberately WARN only, not block — retroactively forcing
// a spec into existence for every small module was not the ask, and
// blocking on it would make this rule punish files it didn't cause.
try {
  const drift = require(path.join(ROOT, 'orchestrator/lib/spec-drift.js'));
  const result = drift.check();
  for (const d of result.drifted) {
    errors.push(`§5.4 spec-version drift: ${d.specFile} says version: ${d.specVersion}, lib/version.js says ${d.codeVersion} — update the spec to match the real shipped code version before committing`);
  }
  for (const m of result.missing) {
    warnings.push(`${m.system} (code@${m.codeVersion}) has no .spec anywhere (checked <system>/spec/<system>.spec, <system>/<system>.spec, docs/<system>.spec) — not blocking, but §5.4 says the spec should exist`);
  }
} catch (e) {
  warnings.push(`§5.4 spec-drift check could not run: ${e.message}`);
}

// RULE: package.json's version and lib/version.js's real VERSION.system
// must agree. Both are real, single-source-of-truth version strings today
// (confirmed: both 0.39.0), but nothing enforced that before this — same
// class of problem as §5.4's spec-drift check, same fix pattern: HARD
// BLOCK, not a soft log line nobody reads until a handoff zip and the
// actual running system silently disagree about what version they are.
try {
  const pkgVersion = require(path.join(ROOT, 'package.json')).version;
  delete require.cache[require.resolve(path.join(ROOT, 'lib', 'version.js'))];
  const codeVersion = require(path.join(ROOT, 'lib', 'version.js')).system;
  if (pkgVersion !== codeVersion) {
    errors.push(`package.json version (${pkgVersion}) and lib/version.js's VERSION.system (${codeVersion}) disagree — pick one and update the other before committing`);
  }
} catch (e) {
  warnings.push(`version-sync check could not run: ${e.message}`);
}

// RULE: §NEW 2026-09-02, RE-APPLIED 2026-09-11 (this regressed out of an
// earlier merge and is being restored here) — James: "the way version
// bumps are enforced [...] enforce updating the specs and phasemaps, the
// component registry, loom's map." The version-drift checks above only
// verify that version NUMBERS agree once several files have already
// changed — they say nothing about whether the accompanying spec/
// phasemap/registry updates actually happened IN THE SAME COMMIT as the
// bump. This closes that: a version bump to lib/version.js's services
// registry is treated as a real claim ("this system materially changed")
// and now REQUIRES its spec to be staged alongside it, and WARNS if the
// phasemap/registry evidence a human reviewing the same claim would
// expect isn't there either.
//
// §STAGED-CONTENT, not working-tree content — reads the git INDEX version
// of lib/version.js (`git show :lib/version.js`) and compares it against
// HEAD's version, the same "what will actually be committed" discipline
// staged() above already established, not whatever happens to be on disk.
function _servicesFromRef(ref) {
  try {
    const raw = execSync(`git show ${ref}:lib/version.js`, { cwd: ROOT }).toString();
    const out = {};
    const re = /^\s*(?:'([\w-]+)'|(\w[\w-]*))\s*:\s*'([\d.]+[\w.-]*)'/gm;
    let m;
    while ((m = re.exec(raw))) out[m[1] || m[2]] = m[3];
    return out;
  } catch (e) { return null; } // file doesn't exist at that ref, or repo has no HEAD yet — not this check's job to flag
}

const versionBumpedSystems = [];
if (files.includes('lib/version.js')) {
  const before = _servicesFromRef('HEAD');
  const after = _servicesFromRef(''); // git show :lib/version.js — staged/index content (no ref before the colon)
  if (before && after) {
    for (const sys of Object.keys(after)) {
      if (before[sys] && before[sys] !== after[sys]) versionBumpedSystems.push({ system: sys, from: before[sys], to: after[sys] });
    }
  } else {
    warnings.push(`version-bump-enforcement: could not diff lib/version.js against HEAD (${!before ? 'no HEAD version' : 'no staged version'}) — bump enforcement skipped this commit`);
  }
}

if (versionBumpedSystems.length) {
  // §SPEC — HARD BLOCK. A version bump is a claim that real work happened;
  // if this system already has a spec (the canonical place that work
  // should be described — §5.4/LM1), it must be staged in the same
  // commit. Systems with NO spec at all stay a warning elsewhere in this
  // file already (the §5.4 missing-spec block above) — this rule only
  // tightens the case where a spec EXISTS and simply wasn't touched.
  // §CORRECTED before shipping (original build) — orchestrator/lib/
  // spec-drift.js's own comment documents that checking docs/ FIRST was
  // a real, already-fixed bug ("docs/ won by default every time"): docs/
  // is deliberately excluded from the canonical scan. This list matches
  // that exact priority order — a second, disagreeing priority order
  // here would violate §10.1 (one write/read authority).
  const specCandidates = (sys) => [
    `${sys}/spec/${sys}.spec`, `${sys}/${sys}.spec`,
  ];
  for (const { system, from, to } of versionBumpedSystems) {
    const existing = specCandidates(system).find(p => fs.existsSync(path.join(ROOT, p)));
    if (existing && !files.includes(existing)) {
      errors.push(`version-bump-enforcement: lib/version.js bumps ${system} ${from} -> ${to} but ${existing} is not staged in this commit — update the spec alongside the version, not after`);
    }
  }

  // §PHASEMAP — WARN, not block. Reuses loom's real, already-built scanner
  // (loom/scanners/phasemap-map.js) rather than re-parsing the phasemap
  // spec files with a second, competing algorithm (§10.1). Soft because a
  // version bump legitimately can close out ALL of a system's tracked
  // phases (nothing left open) or correspond to work a phasemap was
  // never written for — neither is a violation, both are worth a glance.
  try {
    const pm = require(path.join(ROOT, 'loom/scanners/phasemap-map.js'));
    const stagedSpecs = new Set(files.filter(f => /\.spec$/.test(f)));
    for (const { system, from, to } of versionBumpedSystems) {
      const open = (pm.loadAll().bySystem[system] || []).filter(p => p.status !== 'done');
      if (!open.length) continue; // nothing open for this system — nothing to expect staged
      const anyStaged = open.some(p => stagedSpecs.has(p.map));
      if (!anyStaged) {
        warnings.push(`version-bump-enforcement: ${system} ${from} -> ${to} bumped with ${open.length} open phase(s) tracked (e.g. ${open[0].id} in ${open[0].map}) and none of that system's phasemaps are staged — confirm this bump doesn't close any of them`);
      }
    }
  } catch (e) {
    warnings.push(`version-bump-enforcement: phasemap check could not run: ${e.message}`);
  }

  // §COMPONENT-REGISTRY — WARN, not block, checked against LIVE disk
  // state, not staged content: loom/data/registry.json is under data/,
  // and the rule directly above this file (state is never committed)
  // means it can NEVER legitimately be staged. §HONEST LIMIT — this
  // cannot check RECENCY without a live file-watcher — LM2 is still
  // open per this session's own consolidated docs/consolidated/loom.md.
  // Existence-only until that lands.
  try {
    const registryPath = path.join(ROOT, 'loom/data/registry.json');
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    for (const { system, from, to } of versionBumpedSystems) {
      const known = Object.keys(registry.component || {}).some(id => id === `nexus.${system}` || id.startsWith(`nexus.${system}.`));
      if (!known) {
        warnings.push(`version-bump-enforcement: ${system} ${from} -> ${to} bumped but loom/data/registry.json has no 'nexus.${system}' component — run loom's registration for it (recency can't be checked yet — LM2 is still open)`);
      }
    }
  } catch (e) {
    warnings.push(`version-bump-enforcement: component-registry check could not run: ${e.message}`);
  }
}

// RULE: every staged .js file must be syntactically valid AND must not
// crash on require() from a bare reference error. §BUILT 2026-08-17 —
// James: "before each output you need to be testing and verifying it...
// I need this enforced." Real, honest scoping: the full test suite
// (tests/modules/run-all.js, ~1400 real individual test cases across 169
// curated suites, confirmed by actually running it) includes genuine
// subprocess/crash-restart simulations and didn't finish in 90 real
// seconds — a hard block on the FULL suite every single commit would
// make every commit take minutes, which serves no one. This is the real,
// fast, high-value subset: node --check catches a real syntax error in
// under a second per file; a bounded real require() catches exactly the
// class of bug this same session found earlier tonight in lib/nexus-
// client.js — a missing import that crashed a real live server, syntax-
// checked clean, only caught by actually starting the process. HARD
// BLOCK, same severity as the data/ rule — a file that crashes on
// require() is not a judgment call.
const { spawnSync } = require('child_process');
for (const f of files) {
  if (!/\.js$/.test(f) || /\.test\.js$/.test(f) || /^tests\//.test(f)) continue;
  // §STAGED-NOT-INSTALLED, 2026-09-01 — _archive/unintegrated/'s own
  // README states explicitly: "Nothing in here runs. Nothing in here is
  // required by anything else in the repo." A require()-crash test is
  // checking whether a file works as a live NEXUS module — the wrong
  // question for reference material intentionally staged, not wired.
  // Found live: nexus-pages/src/ui/*.js (multi-file browser HTML app,
  // page-shared globals like FORGE/NXGate/switchTab defined in sibling
  // <script> tags) fails this check the same way every browser-only
  // file does, just via custom globals the existing browser-global
  // regex above doesn't and shouldn't try to enumerate exhaustively —
  // the real, correct signal here is the folder's own documented
  // purpose, not the specific undefined identifier's name.
  if (/^_archive\/unintegrated\//.test(f)) continue;
  const full = path.join(ROOT, f);
  if (!fs.existsSync(full)) continue; // deleted/renamed in this commit — nothing to check
  const syntax = spawnSync(process.execPath, ['--check', full], { encoding: 'utf8', timeout: 5000 });
  if (syntax.status !== 0) {
    errors.push(`${f} — syntax error: ${(syntax.stderr || '').split('\n')[0]}`);
    continue; // a require() attempt on a syntax-broken file would just repeat the same failure
  }
  // §SELF-REFERENCE — requiring this exact file would re-run its own real
  // logic (execSync git calls, the whole check) as a side effect, since it
  // executes immediately rather than gating behind require.main. The real
  // syntax check above already ran for it; that's a sufficient real check
  // for this one specific file.
  if (f === 'scripts/precommit-check.js') continue;

  // §FIXED 2026-08-22, §GENERALIZED 2026-08-24 — found live: guardian/
  // userscript-claude.js was crashing this exact check on 'sessionStorage
  // is not defined'. A userscript (or any renderer-only file) is designed
  // to run only in a browser; testing it via plain Node require() will
  // always throw a ReferenceError on some browser global at module-load
  // time, by design, regardless of how correct the file is. Originally
  // detected only via the userscript's self-declaring '==UserScript=='
  // header; generalized here to the actual, general signal — a
  // ReferenceError naming a known browser-only global — because
  // clear-glass/renderer/browser.js hit the identical class
  // ('window is not defined') with no UserScript header to detect it by.
  // Both checks kept: the header check is a stronger, earlier signal when
  // present; this one is the fallback that covers every current and
  // future browser-only file regardless of where it lives or what it's
  // named.
  let src = '';
  try { src = fs.readFileSync(full, 'utf8'); } catch (_) {}
  if (/^\s*\/\/ ==UserScript==/m.test(src)) continue;
  const REQUIRES_ELECTRON = /require\(\s*['"]electron['"]\s*\)/.test(src);

  // §SANDBOX 2026-09-25 — this require() really starts servers (cortex/boot.js
  // stays alive until the timeout) from the LIVE tree. It is a probe, so its
  // data goes to a throwaway root like any test's (lib/test-sandbox.js).
  const _sb = require(path.join(ROOT, 'lib', 'test-sandbox.js')).childEnv();
  const req = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(full)})`], { cwd: ROOT, encoding: 'utf8', timeout: 8000, env: _sb.env });
  _sb.cleanup();
  // §CORRECTED, found by testing before shipping: a real, long-running
  // server (cortex/boot.js, confirmed) correctly stays alive and gets
  // killed by the timeout below — that's status:null, signal:'SIGTERM',
  // NOT a crash. A genuine crash (a real bug, confirmed against the exact
  // class this session already hit once with lib/nexus-client.js) is
  // status:1, signal:null. The first version of this check treated both
  // identically and would have falsely blocked every commit touching any
  // file designed to start a real server on require() — caught before
  // this ever shipped, not after.
  if (req.status !== 0 && req.signal !== 'SIGTERM') {
    const firstLine = (req.stderr || '').split('\n').find(l => /Error/.test(l)) || (req.stderr || '').split('\n')[0];
    // §BROWSER-GLOBAL — a ReferenceError naming window/document/navigator/
    // localStorage/sessionStorage/alert/confirm at module-load time means
    // this file only runs inside a browser (or Electron renderer), same
    // reasoning as the userscript case above, generalized past just
    // sessionStorage.
    const isBrowserGlobalRefError = /ReferenceError: (window|document|navigator|localStorage|sessionStorage|alert|confirm) is not defined/.test(firstLine);
    // §FIXED 2026-08-22, §CORRECTED 2026-08-24 — found live: clear-glass/
    // src/providers/host.js and main/index.js fail this check with
    // "Cannot find module 'electron'" when electron isn't installed at
    // all. That exact string match broke the moment a real npm install
    // added a genuine (but non-functional-outside-Electron) 'electron'
    // package: the failure mode changed to "Cannot read properties of
    // undefined (reading 'exposeInMainWorld')" — same root cause (this
    // file can only really run inside a real Electron process), different
    // surface error depending on today's node_modules state. Detecting it
    // via the file's OWN source (does it require('electron') at all) is
    // environment-independent — true regardless of whether electron
    // happens to be installed, half-installed, or absent in whatever
    // sandbox runs this check.
    if (!isBrowserGlobalRefError && !REQUIRES_ELECTRON) {
      errors.push(`${f} — crashes on require(): ${firstLine}`);
    }
  }
}

if (warnings.length) {
  console.warn('\n⚠ NEXUS working-agreement warnings:');
  for (const w of warnings) console.warn('  · ' + w);
}
if (errors.length) {
  console.error('\n✗ NEXUS working-agreement BLOCKS this commit:');
  for (const e of errors) console.error('  · ' + e);
  console.error('\nSee docs/CLAUDE.md. Fix or use --no-verify only with reason.\n');
  process.exit(1);
}
if (warnings.length) console.warn('  (warnings do not block — but address them)\n');
process.exit(0);
