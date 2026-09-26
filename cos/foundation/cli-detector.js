/**
 * compartment/cli-detector.js
 * COMPARTMENT OS — Compartment CLI Auto-Detector
 *
 * Author: James Brooks (Erosmancer)
 * Status: pre-release
 *
 * Scans a compartment's project files and returns a DetectionResult:
 *   - runtimeId        (node | python | electron | html | go | rust | shell | ...)
 *   - compilerId       (tsc | esbuild | vite | webpack | ... | null)
 *   - entryFile        (absolute path)
 *   - uiFile           (absolute path | null)
 *   - cliCommands      (CliCommand[])
 *   - cliFramework     (commander | yargs | click | cobra | ...)
 *   - confidence       (0–1, overall detection confidence)
 *
 * COS-8: Auto-detect before prompting — ask only what can't be inferred.
 *
 * Detection pass order (spec §6 auto-detection rules):
 *   1. package.json → Node.js, entry, scripts, compilers, bin
 *   2. requirements.txt / setup.py / pyproject.toml → Python
 *   3. go.mod → Go
 *   4. Cargo.toml → Rust
 *   5. *.html → HTML runtime
 *   6. electron in package.json deps → Electron
 *   7. tsconfig.json → TypeScript compiler
 *   8. vite/webpack/esbuild configs → bundler
 *   9. Source file shebang lines → shell scripts
 *  10. CLI framework import scanning (Node, Python)
 *  11. UI file detection (index.html, app.html score by name)
 *
 * All scanning is synchronous, shallow, and O(files_in_root) — no AST.
 * Source scan is limited to top-level .js/.py files only (avoids node_modules).
 *
 * API:
 *   const result = detectProject(compartmentRoot)
 *   result → DetectionResult
 *
 *   const cmds = detectCliCommands(compartmentRoot, runtimeId)
 *   cmds → CliCommand[]
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * @typedef {object} CliCommand
 * @property {string}  name         — kebab-case command name
 * @property {string}  description  — from detected source or blank
 * @property {string}  source       — 'package.json' | 'bin' | 'detected' | 'injected'
 * @property {string|null} runScript — e.g. "node index.js start"
 */

/**
 * @typedef {object} DetectionResult
 * @property {string|null}     runtimeId
 * @property {string|null}     compilerId
 * @property {string|null}     entryFile
 * @property {string|null}     uiFile
 * @property {string|null}     cliFramework
 * @property {CliCommand[]}    cliCommands
 * @property {number}          confidence    0–1
 * @property {string[]}        signals       — human-readable list of what was detected
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeReadFile(filePath) {
  try { return fs.readFileSync(filePath, 'utf8'); }
  catch { return null; }
}

function safeReadJson(filePath) {
  const text = safeReadFile(filePath);
  if (!text) return null;
  try { return JSON.parse(text); }
  catch { return null; }
}

function fileExists(filePath) {
  try { fs.accessSync(filePath); return true; }
  catch { return false; }
}

function listFiles(dir, ext) {
  try {
    return fs.readdirSync(dir)
      .filter(f => !ext || f.endsWith(ext))
      .filter(f => {
        try { return fs.statSync(path.join(dir, f)).isFile(); }
        catch { return false; }
      });
  } catch { return []; }
}

// Score a filename for UI candidacy — higher = more likely the UI file
function scoreUiFile(filename) {
  const name = path.basename(filename, path.extname(filename)).toLowerCase();
  const scores = {
    index:     10, app:       9, ui:        8, dashboard: 7,
    main:       6, shell:     5, interface: 4, panel:     3,
    view:       3, layout:    2, page:      2, client:    1,
  };
  return scores[name] ?? 0;
}

// ─── Node.js detection ────────────────────────────────────────────────────────

function detectNode(root, pkg) {
  const signals = ['package.json present → Node.js'];
  const commands = [];
  let entry    = null;
  let compiler = null;
  let cliFramework = null;
  let confidence = 0.7;

  // Entry file
  const mainCandidates = [
    pkg.main,
    typeof pkg.exports === 'object' ? pkg.exports?.['.'] : null,
    typeof pkg.exports === 'string' ? pkg.exports : null,
    'index.js', 'src/index.js', 'lib/index.js', 'app.js', 'server.js',
  ].filter(Boolean).map(c => (typeof c === 'string' ? c : null)).filter(Boolean);

  for (const c of mainCandidates) {
    const abs = path.resolve(root, c);
    if (fileExists(abs)) { entry = abs; break; }
  }

  // npm scripts → CLI commands
  for (const [name, script] of Object.entries(pkg.scripts || {})) {
    commands.push({
      name,
      description: `npm script: ${script.slice(0, 60)}`,
      source:      'package.json',
      runScript:   `npm run ${name}`,
    });
  }

  // bin field → direct executables
  const bins = typeof pkg.bin === 'string'
    ? { [pkg.name || 'cli']: pkg.bin }
    : (pkg.bin || {});

  for (const [name, binPath] of Object.entries(bins)) {
    commands.push({
      name,
      description: `Binary: ${binPath}`,
      source:      'bin',
      runScript:   `node ${binPath}`,
    });
    confidence = Math.min(1, confidence + 0.1);
    signals.push(`bin.${name} found`);
  }

  // Electron check
  const allDeps = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
    ...pkg.optionalDependencies,
  };
  if (allDeps.electron) {
    signals.push('electron in dependencies → Electron runtime');
    return { runtimeId: 'electron', entry, compiler, cliFramework, commands, confidence: 0.85, signals };
  }

  // Compiler detection
  if (fileExists(path.join(root, 'tsconfig.json'))) {
    compiler = 'tsc';
    signals.push('tsconfig.json → TypeScript');
    confidence = Math.min(1, confidence + 0.1);
  }
  if (fileExists(path.join(root, 'vite.config.js')) || fileExists(path.join(root, 'vite.config.ts'))) {
    compiler = 'vite';
    signals.push('vite.config → Vite');
  }
  if (fileExists(path.join(root, 'webpack.config.js')) || fileExists(path.join(root, 'webpack.config.ts'))) {
    compiler = compiler || 'webpack';
    signals.push('webpack.config → Webpack');
  }
  if (allDeps.esbuild || allDeps['esbuild-loader']) {
    compiler = compiler || 'esbuild';
    signals.push('esbuild in deps');
  }

  // CLI framework scan (shallow — top-level .js only, no node_modules)
  const jsFiles = listFiles(root, '.js').slice(0, 10);
  for (const jsFile of jsFiles) {
    const abs  = path.join(root, jsFile);
    const text = safeReadFile(abs);
    if (!text) continue;
    if (!cliFramework) {
      if (text.includes("require('commander')") || text.includes('from "commander"') || text.includes("from 'commander'"))
        { cliFramework = 'commander'; signals.push(`commander detected in ${jsFile}`); }
      else if (text.includes("require('yargs')") || text.includes('from "yargs"') || text.includes("from 'yargs'"))
        { cliFramework = 'yargs'; signals.push(`yargs detected in ${jsFile}`); }
      else if (text.includes("require('minimist')"))
        { cliFramework = 'minimist'; signals.push(`minimist detected in ${jsFile}`); }
      else if (text.includes("require('meow')") || text.includes("from 'meow'"))
        { cliFramework = 'meow'; signals.push(`meow detected in ${jsFile}`); }
    }
  }

  return { runtimeId: 'node', entry, compiler, cliFramework, commands, confidence, signals };
}

// ─── Python detection ─────────────────────────────────────────────────────────

function detectPython(root) {
  const signals = [];
  const commands = [];
  let entry    = null;
  let cliFramework = null;
  let confidence = 0.7;

  if (fileExists(path.join(root, 'requirements.txt')))
    { signals.push('requirements.txt → Python'); confidence = 0.75; }
  if (fileExists(path.join(root, 'setup.py')))
    { signals.push('setup.py → Python'); confidence = 0.8; }
  if (fileExists(path.join(root, 'pyproject.toml')))
    { signals.push('pyproject.toml → Python'); confidence = 0.85; }

  // Entry file candidates
  const entryCandidates = ['main.py', 'app.py', '__main__.py', 'cli.py', 'run.py', 'server.py'];
  for (const c of entryCandidates) {
    const abs = path.join(root, c);
    if (fileExists(abs)) { entry = abs; signals.push(`entry: ${c}`); break; }
  }

  // CLI framework scan (top-level .py only)
  const pyFiles = listFiles(root, '.py').slice(0, 10);
  for (const pyFile of pyFiles) {
    const abs  = path.join(root, pyFile);
    const text = safeReadFile(abs);
    if (!text) continue;
    if (!cliFramework) {
      if (text.includes('import click') || text.includes('from click'))
        { cliFramework = 'click'; signals.push(`click detected in ${pyFile}`); }
      else if (text.includes('import typer') || text.includes('from typer'))
        { cliFramework = 'typer'; signals.push(`typer detected in ${pyFile}`); }
      else if (text.includes('import argparse'))
        { cliFramework = 'argparse'; signals.push(`argparse detected in ${pyFile}`); }
      else if (text.includes('import fire') || text.includes('from fire'))
        { cliFramework = 'fire'; signals.push(`python-fire detected in ${pyFile}`); }
    }
  }

  // Makefile → extract targets as commands
  const makefile = safeReadFile(path.join(root, 'Makefile'));
  if (makefile) {
    const targets = [...makefile.matchAll(/^([a-zA-Z][a-zA-Z0-9_-]*):/gm)]
      .map(m => m[1])
      .filter(t => !['all', 'clean', '.PHONY'].includes(t));
    for (const t of targets) {
      commands.push({ name: t, description: `Makefile target`, source: 'detected', runScript: `make ${t}` });
    }
    if (targets.length) signals.push(`Makefile targets: ${targets.join(', ')}`);
  }

  return { runtimeId: 'python', entry, compiler: null, cliFramework, commands, confidence, signals };
}

// ─── Go detection ─────────────────────────────────────────────────────────────

function detectGo(root) {
  const goMod = safeReadFile(path.join(root, 'go.mod'));
  const moduleLine = goMod?.match(/^module\s+(.+)/m);
  const signals = [`go.mod → Go${moduleLine ? ` (${moduleLine[1]})` : ''}`];

  let entry = null;
  const mainCandidates = ['main.go', 'cmd/main.go', 'cmd/root.go'];
  for (const c of mainCandidates) {
    if (fileExists(path.join(root, c))) { entry = path.join(root, c); break; }
  }

  // cobra / urfave detection
  let cliFramework = null;
  if (goMod?.includes('cobra')) { cliFramework = 'cobra'; signals.push('cobra in go.mod'); }
  else if (goMod?.includes('urfave/cli')) { cliFramework = 'urfave/cli'; signals.push('urfave/cli in go.mod'); }

  // Makefile
  const commands = [];
  const makefile = safeReadFile(path.join(root, 'Makefile'));
  if (makefile) {
    const targets = [...makefile.matchAll(/^([a-zA-Z][a-zA-Z0-9_-]*):/gm)].map(m => m[1]);
    for (const t of targets) {
      commands.push({ name: t, description: 'Makefile target', source: 'detected', runScript: `make ${t}` });
    }
  }

  return { runtimeId: 'go', entry, compiler: 'go build', cliFramework, commands, confidence: 0.9, signals };
}

// ─── Rust detection ───────────────────────────────────────────────────────────

function detectRust(root) {
  const signals = ['Cargo.toml → Rust'];
  let cliFramework = null;
  const cargoText = safeReadFile(path.join(root, 'Cargo.toml'));
  if (cargoText?.includes('clap')) { cliFramework = 'clap'; signals.push('clap in Cargo.toml'); }

  const entry = fileExists(path.join(root, 'src', 'main.rs'))
    ? path.join(root, 'src', 'main.rs') : null;

  return {
    runtimeId: 'rust', entry, compiler: 'cargo build', cliFramework,
    commands: [
      { name: 'build', description: 'cargo build', source: 'detected', runScript: 'cargo build' },
      { name: 'run',   description: 'cargo run',   source: 'detected', runScript: 'cargo run' },
      { name: 'test',  description: 'cargo test',  source: 'detected', runScript: 'cargo test' },
    ],
    confidence: 0.9, signals,
  };
}

// ─── HTML runtime ─────────────────────────────────────────────────────────────

function detectHtml(root) {
  const htmlFiles = listFiles(root, '.html');
  const scored = htmlFiles.map(f => ({ file: f, score: scoreUiFile(f) }));
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  const signals = [`${htmlFiles.length} .html file(s) → HTML runtime`];
  return {
    runtimeId:   'html',
    entry:       best ? path.join(root, best.file) : null,
    compiler:    null,
    cliFramework: null,
    commands:    [],
    confidence:  htmlFiles.length > 0 ? 0.75 : 0.3,
    signals,
  };
}

// ─── UI file detection ────────────────────────────────────────────────────────

function detectUiFile(root) {
  const htmlFiles = listFiles(root, '.html');
  if (!htmlFiles.length) {
    // Also check src/ subdir
    const srcHtml = listFiles(path.join(root, 'src'), '.html').map(f => `src/${f}`);
    htmlFiles.push(...srcHtml);
  }
  if (!htmlFiles.length) return null;

  const scored = htmlFiles.map(f => ({ file: f, score: scoreUiFile(f) }));
  scored.sort((a, b) => b.score - a.score);
  return path.resolve(root, scored[0].file);
}

// ─── Main detector ────────────────────────────────────────────────────────────

/**
 * Detect the project type and CLI commands from a compartment root.
 *
 * @param {string} compartmentRoot — absolute path to project root
 * @returns {DetectionResult}
 */
function detectProject(compartmentRoot) {
  const root = path.resolve(compartmentRoot);

  if (!fileExists(root)) {
    return {
      runtimeId: null, compilerId: null, entryFile: null, uiFile: null,
      cliFramework: null, cliCommands: [], confidence: 0,
      signals: [`root not found: ${root}`],
    };
  }

  let result;

  // Priority order: most specific first
  const pkg = safeReadJson(path.join(root, 'package.json'));
  if (pkg) {
    result = detectNode(root, pkg);
  } else if (fileExists(path.join(root, 'go.mod'))) {
    result = detectGo(root);
  } else if (fileExists(path.join(root, 'Cargo.toml'))) {
    result = detectRust(root);
  } else if (
    fileExists(path.join(root, 'requirements.txt')) ||
    fileExists(path.join(root, 'setup.py')) ||
    fileExists(path.join(root, 'pyproject.toml'))
  ) {
    result = detectPython(root);
  } else if (listFiles(root, '.html').length > 0) {
    result = detectHtml(root);
  } else if (listFiles(root, '.py').length > 0) {
    result = detectPython(root);
  } else {
    // Shell script fallback
    const shFiles = listFiles(root).filter(f => f.endsWith('.sh'));
    if (shFiles.length) {
      result = {
        runtimeId: 'shell', entry: path.join(root, shFiles[0]),
        compiler: null, cliFramework: null,
        commands: shFiles.map(f => ({
          name:        path.basename(f, '.sh'),
          description: `Shell script: ${f}`,
          source:      'detected',
          runScript:   `bash ${f}`,
        })),
        confidence: 0.5,
        signals: [`${shFiles.length} .sh file(s) → Shell runtime`],
      };
    } else {
      result = {
        runtimeId: null, entry: null, compiler: null, cliFramework: null,
        commands: [], confidence: 0,
        signals: ['No recognisable project files found'],
      };
    }
  }

  // UI file detection (independent of runtime)
  const uiFile = detectUiFile(root);

  return {
    runtimeId:   result.runtimeId   ?? null,
    compilerId:  result.compiler    ?? null,
    entryFile:   result.entry       ?? null,
    uiFile:      uiFile             ?? null,
    cliFramework: result.cliFramework ?? null,
    cliCommands: result.commands    ?? [],
    confidence:  result.confidence  ?? 0,
    signals:     result.signals     ?? [],
  };
}

/**
 * Detect CLI commands only, for a known runtime.
 * Used when runtimeId is already known but commands need refresh.
 *
 * @param {string} compartmentRoot
 * @param {string} runtimeId
 * @returns {import('./cli-detector.js').CliCommand[]}
 */
function detectCliCommands(compartmentRoot, runtimeId) {
  const result = detectProject(compartmentRoot);
  // If runtime matches, use its commands; otherwise re-detect with given runtime
  if (result.runtimeId === runtimeId) return result.cliCommands;

  // Re-detect focused on runtimeId
  const root = path.resolve(compartmentRoot);
  switch (runtimeId) {
    case 'node': {
      const pkg = safeReadJson(path.join(root, 'package.json'));
      return pkg ? detectNode(root, pkg).commands : [];
    }
    case 'python':  return detectPython(root).commands;
    case 'go':      return detectGo(root).commands;
    case 'rust':    return detectRust(root).commands;
    default:        return result.cliCommands;
  }
}

module.exports = { detectProject, detectCliCommands };
