'use strict';
/**
 * engines/components/detect-stack.js
 *
 * Reads a directory tree and works out what it is, from the signature files
 * the spec enumerates. Pure inspection — never executes anything from the
 * project it is examining.
 *
 * Detection is ordered most-specific-first, because the signatures nest: a
 * Next.js project has package.json, a Laravel project has composer.json and
 * an index.php, and WordPress has index.php too. Matching the generic
 * signature first would classify every one of them wrongly.
 */

const fs   = require('fs');
const path = require('path');

/** Read a JSON file, returning null rather than throwing on anything. */
function readJson(dir, name) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')); }
  catch { return null; }
}

function has(dir, ...names) {
  return names.some(n => {
    try { fs.accessSync(path.join(dir, n)); return true; } catch { return false; }
  });
}

/** package.json dependency lookup across both dependency sets. */
function dep(pkg, name) {
  if (!pkg) return false;
  return Boolean((pkg.dependencies && pkg.dependencies[name])
              || (pkg.devDependencies && pkg.devDependencies[name]));
}

function script(pkg, name) {
  return pkg && pkg.scripts && typeof pkg.scripts[name] === 'string'
    ? pkg.scripts[name] : null;
}

/**
 * @param {string} dir  project root
 * @returns {{stack,label,confidence,signals,install,build,start,serveDir,php,needsPort,runtime,notes}}
 */
function detect(dir) {
  const pkg      = readJson(dir, 'package.json');
  const composer = readJson(dir, 'composer.json');
  const signals  = [];

  if (pkg)      signals.push('package.json');
  if (composer) signals.push('composer.json');

  // ── WordPress ────────────────────────────────────────────────────────────
  if (has(dir, 'wp-config.php', 'wp-config-sample.php', 'wp-content', 'wp-load.php')) {
    signals.push('wp-config.php / wp-content');
    return {
      stack: 'wordpress', label: 'WordPress', confidence: 'high', signals,
      runtime: 'php', php: true, needsPort: false,
      install: null, build: null, start: null,
      serveDir: '.', database: 'sqlite',
      notes: ['Needs php-cgi installed to run.',
              'Each install gets its own isolated database.'],
    };
  }

  // ── PHP with Composer ────────────────────────────────────────────────────
  if (composer) {
    if (has(dir, 'artisan')) {
      signals.push('artisan');
      return {
        stack: 'laravel', label: 'Laravel', confidence: 'high', signals,
        runtime: 'php', php: true, needsPort: false,
        install: 'composer install --no-dev --optimize-autoloader',
        build: null, start: null,
        serveDir: 'public',
        notes: ['Served from public/ — the rest of the tree stays unreachable.',
                'Set APP_KEY in the environment tab before going live.'],
      };
    }
    return {
      stack: 'php', label: 'PHP (Composer)', confidence: 'high', signals,
      runtime: 'php', php: true, needsPort: false,
      install: 'composer install --no-dev',
      build: null, start: null,
      serveDir: has(dir, 'public') ? 'public' : '.',
      notes: ['Needs php-cgi installed to run.'],
    };
  }

  // ── Node ─────────────────────────────────────────────────────────────────
  if (pkg) {
    const pm = has(dir, 'pnpm-lock.yaml') ? 'pnpm'
             : has(dir, 'yarn.lock')      ? 'yarn'
             : 'npm';
    const installCmd = pm === 'npm' ? 'npm install' : `${pm} install`;
    const run = s => (pm === 'npm' ? `npm run ${s}` : `${pm} ${s}`);

    if (has(dir, 'next.config.js', 'next.config.mjs', 'next.config.ts') || dep(pkg, 'next')) {
      signals.push('next.config / next dependency');
      return {
        stack: 'nextjs', label: 'Next.js', confidence: 'high', signals,
        runtime: 'node', php: false, needsPort: true,
        install: installCmd, build: script(pkg, 'build') ? run('build') : 'npx next build',
        start: script(pkg, 'start') ? run('start') : 'npx next start -p {port}',
        serveDir: null,
        notes: ['Runs as a supervised process; the web server proxies to it.'],
      };
    }

    if (has(dir, 'nuxt.config.js', 'nuxt.config.ts') || dep(pkg, 'nuxt')) {
      signals.push('nuxt.config');
      return {
        stack: 'nuxt', label: 'Nuxt.js', confidence: 'high', signals,
        runtime: 'node', php: false, needsPort: true,
        install: installCmd, build: run('build'), start: run('start'),
        serveDir: null,
        notes: ['Runs as a supervised process; the web server proxies to it.'],
      };
    }

    if (dep(pkg, 'react-scripts')) {
      signals.push('react-scripts');
      return {
        stack: 'cra', label: 'Create React App', confidence: 'high', signals,
        runtime: 'static-build', php: false, needsPort: false,
        install: installCmd, build: run('build'), start: null,
        serveDir: 'build',
        notes: ['Built once, then served as static files — no running process.'],
      };
    }

    if (has(dir, 'vite.config.js', 'vite.config.ts', 'vite.config.mjs') || dep(pkg, 'vite')) {
      signals.push('vite.config');
      return {
        stack: 'vite', label: 'Vite SPA', confidence: 'high', signals,
        runtime: 'static-build', php: false, needsPort: false,
        install: installCmd, build: run('build'), start: null,
        serveDir: 'dist',
        notes: ['Built once, then served as static files — no running process.'],
      };
    }

    // Generic Node. A start script means a long-running server; without one,
    // treat a build output directory as static.
    const startScript = script(pkg, 'start');
    const buildScript = script(pkg, 'build');
    if (startScript) {
      return {
        stack: 'node', label: 'Node.js', confidence: 'high', signals,
        runtime: 'node', php: false, needsPort: true,
        install: installCmd, build: buildScript ? run('build') : null, start: run('start'),
        serveDir: null,
        notes: ['Runs as a supervised process; the web server proxies to it.',
                'The app must honour the PORT environment variable.'],
      };
    }
    return {
      stack: 'node-static', label: 'Node project (static output)',
      confidence: 'medium', signals,
      runtime: 'static-build', php: false, needsPort: false,
      install: installCmd, build: buildScript ? run('build') : null, start: null,
      serveDir: has(dir, 'dist') ? 'dist' : has(dir, 'build') ? 'build' : '.',
      notes: ['No start script found, so this is treated as a static build.',
              'If it is meant to run as a server, set the start command manually.'],
    };
  }

  // ── Python ───────────────────────────────────────────────────────────────
  if (has(dir, 'requirements.txt', 'pyproject.toml', 'Pipfile')) {
    signals.push('requirements.txt / pyproject.toml');
    const install = has(dir, 'requirements.txt')
      ? 'pip install -r requirements.txt'
      : 'pip install .';

    if (has(dir, 'manage.py')) {
      signals.push('manage.py');
      return {
        stack: 'django', label: 'Django', confidence: 'high', signals,
        runtime: 'python', php: false, needsPort: true,
        install, build: 'python manage.py collectstatic --noinput',
        start: 'python manage.py runserver 127.0.0.1:{port}',
        startLinux: 'gunicorn -b 127.0.0.1:{port} {module}.wsgi',
        serveDir: null,
        notes: ['runserver is the development server — swap to gunicorn/waitress for production.'],
      };
    }

    const entry = ['wsgi.py', 'app.py', 'main.py', 'application.py'].find(f => has(dir, f));
    signals.push(entry || 'no obvious entry point');
    return {
      stack: 'python', label: 'Python WSGI', confidence: entry ? 'high' : 'low', signals,
      runtime: 'python', php: false, needsPort: true,
      install,
      build: null,
      start: 'waitress-serve --port={port} ' + (entry ? entry.replace(/\.py$/, '') + ':app' : '{module}:app'),
      startLinux: 'gunicorn -b 127.0.0.1:{port} ' + (entry ? entry.replace(/\.py$/, '') + ':app' : '{module}:app'),
      serveDir: null,
      notes: entry
        ? [`Entry point assumed to be ${entry} exposing an 'app' callable — override if wrong.`]
        : ['No entry point found. Set the start command manually before deploying.'],
    };
  }

  // ── Plain PHP ────────────────────────────────────────────────────────────
  if (has(dir, 'index.php')) {
    signals.push('index.php');
    return {
      stack: 'php', label: 'PHP (static)', confidence: 'medium', signals,
      runtime: 'php', php: true, needsPort: false,
      install: null, build: null, start: null,
      serveDir: '.',
      notes: ['Needs php-cgi installed to run.'],
    };
  }

  // ── Phase 3 signatures — recognised, not yet supported ───────────────────
  for (const [file, label] of [['Dockerfile','Container'],['Gemfile','Ruby'],['Cargo.toml','Rust']]) {
    if (has(dir, file)) {
      signals.push(file);
      return {
        stack: 'unsupported', label, confidence: 'high', signals,
        runtime: null, php: false, needsPort: false,
        install: null, build: null, start: null, serveDir: '.',
        unsupported: true,
        notes: [`${label} projects are Phase 3. Detected but not deployable yet.`,
                'You can still deploy it as static files if that is useful.'],
      };
    }
  }

  // ── Static ───────────────────────────────────────────────────────────────
  if (has(dir, 'index.html', 'index.htm')) signals.push('index.html');
  return {
    stack: 'static', label: 'Static site',
    confidence: has(dir, 'index.html', 'index.htm') ? 'high' : 'low', signals,
    runtime: 'static', php: false, needsPort: false,
    install: null, build: null, start: null, serveDir: '.',
    notes: has(dir, 'index.html', 'index.htm')
      ? []
      : ['No index.html found — the site will show a directory listing or a 404.'],
  };
}

/**
 * Find the real project root inside an extracted archive. Zips very often
 * contain a single wrapper directory (`myproject-main/`), and detecting
 * against the wrapper finds nothing at all.
 */
function findProjectRoot(dir, depth = 0) {
  if (depth > 2) return dir;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return dir; }

  const visible = entries.filter(e => !e.name.startsWith('.') && e.name !== '__MACOSX');
  const files   = visible.filter(e => e.isFile());
  const dirs    = visible.filter(e => e.isDirectory());

  if (files.length === 0 && dirs.length === 1) {
    return findProjectRoot(path.join(dir, dirs[0].name), depth + 1);
  }
  return dir;
}

module.exports = { detect, findProjectRoot };
