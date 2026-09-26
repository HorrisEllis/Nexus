#!/usr/bin/env node
'use strict';
/**
 * scripts/generate-hooks.js — declare implemented routes from the code itself
 * UUID: nexus-generate-hooks-v1-0000-2026-0709-jamesbrooks-001
 *
 * §WHY — verify-wires' reverse scan found 65 implemented routes with no
 * declared hook (§5.1). Hand-writing 65 entries would produce exactly what
 * we already have: a parallel document that starts drifting the moment it
 * is written. The registry should be a PROJECTION of the code, the same way
 * /api/warp/map is a projection of the StreamLog.
 *
 * This reads the real route literals AND their real HTTP methods out of the
 * source, and emits hook entries from them. Re-run it after adding routes.
 *
 * §HONEST ABOUT ITS LIMITS — it is a static extractor, not a parser:
 *   - It cannot see segment-routed paths (orchestrator's
 *     `sub==='bus' && seg[2]==='stats'`). Those still need hand entries.
 *   - `intent` is generated from the path. A human should improve it.
 *   - A route matched under multiple methods yields one entry per method.
 * It prints what it will do and writes nothing unless --write is passed.
 * §1.1 — nothing exists until proven: run it, read it, then let it write.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const SURFACES = {
  guardian: { file: 'guardian/server.js', hooks: 'guardian.hooks.js', arr: 'const GUARDIAN_HOOKS = [', port: 7820 },
  cortex:   { file: 'cortex/boot.js',     hooks: 'cortex.hooks.js',   arr: 'const CORTEX_HOOKS = [',  port: 3748 },
  copilot:  { file: 'copilot/server.js',  hooks: 'copilot.hooks.js',  arr: 'const HOOKS = [',         port: 3750 },
  ollama:   { file: 'ollama/server.js',   hooks: 'ollama.hooks.js',   arr: 'const HOOKS = [',         port: 3749 },
};

// Real matching styles, each capturing (method?, path). Methods are read
// from the same conditional, never assumed.
const PATTERNS = [
  /method\s*===?\s*'(GET|POST|PUT|DELETE|PATCH)'\s*&&\s*(?:url\.pathname|p)\s*===?\s*'([^']+)'/g,
  /(?:url\.pathname|p)\s*===?\s*'([^']+)'\s*&&\s*method\s*===?\s*'(GET|POST|PUT|DELETE|PATCH)'/g,
  /method\s*===?\s*'(GET|POST|PUT|DELETE|PATCH)'\s*&&\s*\(\s*(?:url\.pathname|p)\s*===?\s*'([^']+)'/g,
];

function extract(src) {
  const found = new Map(); // path -> Set(methods)
  for (const re of PATTERNS) {
    let m;
    while ((m = re.exec(src)) !== null) {
      let method, route;
      if (/^(GET|POST|PUT|DELETE|PATCH)$/.test(m[1])) { method = m[1]; route = m[2]; }
      else { route = m[1]; method = m[2]; }
      if (!route || !route.startsWith('/')) continue;
      if (route.endsWith('/')) continue;          // trailing-slash alias of the same handler
      if (!found.has(route)) found.set(route, new Set());
      found.get(route).add(method);
    }
  }
  return found;
}

function slug(route) {
  return route.replace(/^\//, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/-+$/, '') || 'root';
}

function intentFor(route, method) {
  const verb = method === 'GET' ? 'Read' : method === 'DELETE' ? 'Remove' : 'Write';
  const noun = route.replace(/^\/(api\/)?/, '').replace(/\//g, ' ') || 'root';
  return `${verb} ${noun} (generated from code by scripts/generate-hooks.js — refine by hand)`;
}

function render(surface, port, route, method, file, seq) {
  return `  {
    id: "${surface}-hook-${slug(route)}-${method.toLowerCase()}-${String(seq).padStart(4, '0')}",
    name: "${surface}-${slug(route)}-${method.toLowerCase()}",
    intent: "${intentFor(route, method)}",
    type: "api",
    direction: "unidirectional",
    from: { surface: "*", layer: 0 },
    to: { surface: "${surface}", layer: 1, port: ${port} },
    config: { path: "${route}", method: "${method}" },
    contract: { axioms: [], sideEffects: [], idempotent: ${method === 'GET'} },
    references: { files: ["${file}"] },
    status: "active",
    updatedAt: "2026-07-09T00:00:00Z"
  },
`;
}

function main() {
  const write = process.argv.includes('--write');
  const hooksIdx = require(path.join(ROOT, 'hooks/index.js'));
  const declared = new Set(hooksIdx.allHooks().map(h => h.config?.path).filter(Boolean));

  let total = 0;
  for (const [surface, cfg] of Object.entries(SURFACES)) {
    const srcPath = path.join(ROOT, cfg.file);
    if (!fs.existsSync(srcPath)) { console.log(`skip ${surface}: ${cfg.file} missing`); continue; }
    const found = extract(fs.readFileSync(srcPath, 'utf8'));

    const missing = [...found.entries()].filter(([route]) => !declared.has(route));
    if (!missing.length) { console.log(`${surface}: nothing to declare`); continue; }

    let block = '';
    let seq = 100;
    for (const [route, methods] of missing) {
      for (const method of methods) block += render(surface, cfg.port, route, method, cfg.file, seq++);
      total++;
    }

    console.log(`${surface}: ${missing.length} undeclared route(s)`);
    for (const [route, methods] of missing) console.log(`   ${[...methods].join(',')} ${route}`);

    if (write) {
      const hooksPath = path.join(ROOT, 'hooks', cfg.hooks);
      let src = fs.readFileSync(hooksPath, 'utf8');
      if (!src.includes(cfg.arr)) { console.log(`  !! array marker not found in ${cfg.hooks}, skipping write`); continue; }
      src = src.replace(cfg.arr, cfg.arr + '\n' + block.trimEnd());
      fs.writeFileSync(hooksPath, src);
      console.log(`  wrote ${missing.length} entries -> hooks/${cfg.hooks}`);
    }
  }

  console.log(`\n${total} route(s) ${write ? 'declared' : 'would be declared'}.`);
  if (!write) console.log('Dry run. Re-run with --write to apply.');
}

main();
